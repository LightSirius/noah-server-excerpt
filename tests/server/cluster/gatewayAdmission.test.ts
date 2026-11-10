// 성능 4.5 F1 — 게이트웨이 접속 제한(GatewayCore admission + gatewayLoad). MemoryPipe 위 테스트 월드 끝(helpers/worldSide)과 가짜 클라
// 소켓(helpers/fakeClient), 주입 시계·수동 표본 타이머로 결정론 검증.
//
//   - 거절: 월드 ADMISSION busy 또는 로컬 신호(cpu·lag·rtt·outbound)가 진입 문턱 → 새 클라는 CONN_OPEN 없이 KICK 9 "server busy"
//     (월드는 모르는 연결 — 상한·world_down 거절과 같은 경로). mmorpg_gw_admission_rejected_total{cause}, mmorpg_gw_admission_active.
//   - 기존 연결은 무접촉(프레임 전달·DELIVER 그대로).
//   - 해제: 모든 신호 ≤ 해제 문턱 + 월드 open이 holdMs 동안 → 다시 CONN_OPEN.
//   - rtt 신호 = 답 없는 가장 오래된 PING의 나이 ∨ 창 안 최근 왕복(월드 PONG은 W→G 적체 뒤에 온다).
//   - outbound 신호 = 클라 송신 꼬리 합 — 인월드(월드 CONN_STATE IN_WORLD 미러) 연결 중 꼬리를 가진 연결이 절반 이상일 때만(소수 연결이
//     읽지 않기만으로 잠그지 못한다). 로그인 중 연결은 폭의 분모에서 빠진다(접속 램프가 신호를 희석하지 않는다).
//   - 월드 유실 → 월드 판정 초기화(다음 월드는 open으로 시작). admission 미설정(기본 — 토폴로지·테스트) = 거절 없음.

import { afterEach, describe, expect, test } from "bun:test";
import { GatewayCore, type GatewayCoreOptions } from "../../../server/src/gateway/gatewayCore";
import type { GatewayConn } from "../../../server/src/gateway/gatewayConn";
import type { GatewayAdmissionOptions } from "../../../server/src/gateway/gatewayLoad";
import { type MemoryPipe, type MemoryPipeOptions, createMemoryPipePair } from "../../../server/src/cluster/ipcPipe";
import { KICK_REASON } from "../../../server/src/identity/loginFlow";
import { writePacket } from "../../../server/src/network/packetWriter";
import { encode, encodeRaw } from "../../helpers/wire";
import {
  DEFAULT_END_FLUSH_TIMEOUT_MS,
  DEFAULT_OUTBOUND_MAX_BYTES,
  configureOutbound,
} from "../../../server/src/network/outboundLink";
import { PACKET_ID } from "../../../server/src/net/codec.generated";
import { metrics } from "../../../server/src/obs/metrics";
import { FakeClient } from "./helpers/fakeClient";
import { WorldSide } from "./helpers/worldSide";
import { turns, until } from "./helpers/gatewaySide";
import { tagPong } from "../../helpers/fillers";

const MB = 1024 * 1024;
const cores: GatewayCore[] = [];

afterEach(async () => {
  for (const c of cores.splice(0)) await c.close();
  configureOutbound({ maxBytes: DEFAULT_OUTBOUND_MAX_BYTES, endFlushTimeoutMs: DEFAULT_END_FLUSH_TIMEOUT_MS });
  await turns(3);
});

/** 주입 시계 + 수동 표본 타이머 + 가짜 CPU(기본 0%). */
class Env {
  t = 0;
  cpuUs = 0;
  private readonly samplers: Array<() => void> = [];

  admission(over: Partial<GatewayAdmissionOptions> = {}): GatewayAdmissionOptions {
    return {
      cpuPct: 90,
      lagMs: 250,
      rttMs: 1000,
      outboundBytes: 64 * MB,
      holdMs: 1000,
      ...over,
      now: () => this.t,
      cpuUsage: () => ({ user: this.cpuUs, system: 0 }),
      timers: {
        setInterval: (fn) => {
          this.samplers.push(fn);
          return fn;
        },
        clearInterval: () => {},
      },
    };
  }

  /** 정시 표본 n회(250 ms 간격). */
  steps(n: number): void {
    for (let i = 0; i < n; i++) {
      this.t += 250;
      for (const fn of this.samplers) fn();
    }
  }
}

function newCore(env: Env, opts: Partial<GatewayCoreOptions> = {}): GatewayCore {
  const core = new GatewayCore({ gatewayId: 3, incarnation: 0xabcd, pid: 4242, now: () => env.t, ...opts });
  cores.push(core);
  return core;
}

async function link(core: GatewayCore, gw?: MemoryPipeOptions): Promise<{ world: WorldSide; gwEnd: MemoryPipe }> {
  const [gwEnd, worldEnd] = createMemoryPipePair(gw !== undefined ? { a: gw } : {});
  const world = new WorldSide(worldEnd);
  const pending = core.attachWorld((h) => {
    gwEnd.attach(h);
    return gwEnd;
  });
  await until(() => world.recs.some((r) => r.t === "hello"), "HELLO");
  world.helloAck(0x5eed, 1000).flush();
  await pending;
  return { world, gwEnd };
}

function client(core: GatewayCore, addr = "198.51.100.7"): FakeClient<GatewayConn> {
  return new FakeClient<GatewayConn>(core.edge, addr).open();
}

const busyKick = { id: PACKET_ID.KICK, payload: { reason: KICK_REASON.ServerFull, detail: "server busy" } };
const ping = (n: number): Buffer => encode(PACKET_ID.PING, { clientTimeMs: n });
/**
 * bytes 이상의 클라 프레임 연접 — 프레임 body는 송신 상한(0xFFFF, H1) 안이라 60 KB 조각 여러 개로 만든다. 게이트웨이는 DELIVER 바이트를 보지
 * 않으므로 내용 무관 원시 본문(종전 PONG JSON 필러와 같은 60,037 B — B3b PONG flip).
 */
const bulk = (bytes: number): Buffer =>
  Buffer.concat(Array.from({ length: Math.ceil(bytes / 60_000) }, () => encodeRaw(PACKET_ID.PONG, Buffer.alloc(60_037, 0x78))));

describe("게이트웨이 접속 제한 — 월드 판정(ADMISSION)", () => {
  test("ADMISSION busy → 새 클라는 CONN_OPEN 없이 KICK 9 'server busy', 기존 연결은 그대로 — open 뒤 hold가 지나야 다시 받는다", async () => {
    const env = new Env();
    const core = newCore(env, { admission: env.admission() });
    const { world } = await link(core);
    const a = client(core);
    await until(() => world.opened(1) !== undefined, "CONN_OPEN 1");
    const active = metrics.gwAdmissionActive.value();
    const byWorld = metrics.gwAdmissionRejected.value({ cause: "world" });
    world.writer.admission(true);
    world.flush();
    await until(() => core.admissionActive, "admission closed");
    expect(metrics.gwAdmissionActive.value()).toBe(active + 1);

    const b = client(core);
    expect(b.frames()).toEqual([busyKick]);
    expect(b.ended).toBe(true);
    expect(core.connectionCount()).toBe(1);
    expect(metrics.gwAdmissionRejected.value({ cause: "world" })).toBe(byWorld + 1);
    // 기존 연결: 프레임은 계속 월드로, 월드 DELIVER는 계속 클라로.
    a.send(ping(1));
    world.deliver(1, writePacket(PACKET_ID.PONG, tagPong(1))).flush();
    await until(() => world.framesOf(1).length === 1 && a.frames().length === 1, "existing conn traffic");
    expect(a.ended).toBe(false);
    await turns(3);
    expect(world.opened(2)).toBeUndefined();

    world.writer.admission(false);
    world.flush();
    await turns(5);
    expect(core.admissionActive).toBe(true); // hold(1 s) 전
    env.steps(3);
    expect(core.admissionActive).toBe(true);
    env.steps(1);
    expect(core.admissionActive).toBe(false);
    expect(metrics.gwAdmissionActive.value()).toBe(active);
    client(core);
    await until(() => world.opened(3) !== undefined, "CONN_OPEN 3 after reopening");
  });

  test("월드 유실 → 월드 판정 초기화 — 다음 월드에서는(로컬 신호가 없으면) hold 뒤 다시 받는다", async () => {
    const env = new Env();
    const core = newCore(env, { admission: env.admission() });
    const first = await link(core);
    first.world.writer.admission(true);
    first.world.flush();
    await until(() => core.admissionActive, "admission closed");
    first.world.pipe.destroy();
    await until(() => !core.ready, "world lost");
    const second = await link(core);
    env.steps(4);
    expect(core.admissionActive).toBe(false);
    client(core);
    await until(() => second.world.opened(1) !== undefined, "CONN_OPEN on the next world");
  });

  test("admission 미설정(기본) — ADMISSION을 받아도 게이트웨이는 거절하지 않는다(월드가 CONN_OPEN에서 판정)", async () => {
    const env = new Env();
    const core = newCore(env);
    const { world } = await link(core);
    world.writer.admission(true);
    world.flush();
    await turns(5);
    expect(core.admissionActive).toBe(false);
    client(core);
    await until(() => world.opened(1) !== undefined, "CONN_OPEN still sent");
  });
});

describe("게이트웨이 접속 제한 — 로컬 신호", () => {
  test("lag: 이벤트 루프가 문턱 이상 막혔다 풀리면 표본 타이머보다 먼저 온 accept도 거절(cause lag), 월드는 모른다", async () => {
    const env = new Env();
    const core = newCore(env, { admission: env.admission() });
    const { world } = await link(core);
    env.steps(2);
    env.t += 250 + 400; // 400 ms 정지 — 표본 타이머 콜백은 아직
    const byLag = metrics.gwAdmissionRejected.value({ cause: "lag" });
    const c = client(core);
    expect(c.frames()).toEqual([busyKick]);
    expect(metrics.gwAdmissionRejected.value({ cause: "lag" })).toBe(byLag + 1);
    await turns(3);
    expect(world.opened(1)).toBeUndefined();
  });

  test("rtt: 답 없는 PING의 나이가 문턱을 넘으면 거절 — PONG이 오면 창(1 s)이 지나고 hold 뒤 해제", async () => {
    const env = new Env();
    const core = newCore(env, { admission: env.admission() });
    const { world, gwEnd } = await link(core, {
      heartbeatMs: 1000,
      deadMs: 600_000,
      now: () => env.t,
      timers: { setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {} },
    });
    gwEnd.checkLiveness(); // heartbeat → PING(seq 1) at t
    await until(() => world.recs.some((r) => r.t === "ping"), "PING");
    env.steps(4); // 1000 ms 동안 PONG 없음
    expect(core.admissionActive).toBe(true);
    expect(client(core).frames()).toEqual([busyKick]);
    world.pong(1).flush();
    await turns(5); // 왕복 1000 ms 관측 — 창(1 s) 안에서는 여전히 뜨겁다
    env.steps(3);
    expect(core.admissionActive).toBe(true);
    env.steps(1); // 관측 후 1 s — 창 밖, hold 시작
    env.steps(3);
    expect(core.admissionActive).toBe(true);
    env.steps(1); // hold 1 s
    expect(core.admissionActive).toBe(false);
  });

  test("outbound: 클라 송신 꼬리 합이 문턱 이상이면 거절(cause outbound) — 꼬리가 빠지면 hold 뒤 해제", async () => {
    const env = new Env();
    configureOutbound({ maxBytes: 8 * MB });
    const core = newCore(env, { admission: env.admission({ outboundBytes: 1 * MB }) });
    const { world } = await link(core);
    const slow = client(core);
    await until(() => world.opened(1) !== undefined, "CONN_OPEN 1");
    world.state(1, "IN_WORLD");
    slow.writeCap = 0; // 커널 송신 버퍼가 찼다
    world.deliver(1, bulk(MB + 1)).flush();
    await until(() => slow.conn.socket.pendingByteCount > MB, "tail queued");
    env.steps(1);
    const byTail = metrics.gwAdmissionRejected.value({ cause: "outbound" });
    expect(client(core).frames()).toEqual([busyKick]);
    expect(metrics.gwAdmissionRejected.value({ cause: "outbound" })).toBe(byTail + 1);
    slow.writeCap = Number.POSITIVE_INFINITY;
    slow.drain();
    expect(slow.conn.socket.pendingByteCount).toBe(0);
    env.steps(4); // 첫 표본부터 hold — 750 ms
    expect(core.admissionActive).toBe(true);
    env.steps(1);
    expect(core.admissionActive).toBe(false);
  });

  test("outbound 폭: 읽지 않는 클라가 연결의 절반 미만이면 꼬리 합이 문턱 위여도 받는다 — 절반에 닿으면 거절", async () => {
    const env = new Env();
    configureOutbound({ maxBytes: 8 * MB });
    const core = newCore(env, { admission: env.admission({ outboundBytes: 1 * MB }) });
    const { world } = await link(core);
    const conns = [client(core), client(core), client(core), client(core)];
    await until(() => world.opened(4) !== undefined, "CONN_OPEN 1..4");
    for (let id = 1; id <= 4; id++) world.state(id, "IN_WORLD");
    const stuff = (localId: number, c: FakeClient<GatewayConn>): void => {
      c.writeCap = 0; // 읽지 않는다 — 커널 송신 버퍼가 찼다
      world.deliver(localId, bulk(2 * MB + 1)).flush();
    };
    stuff(1, conns[0]!);
    await until(() => conns[0]!.conn.socket.pendingByteCount > 2 * MB, "tail queued (1 of 4)");
    env.steps(4);
    const fresh = client(core);
    await until(() => world.opened(5) !== undefined, "CONN_OPEN 5 — 1/4 backlogged is not saturation");
    expect(fresh.ended).toBe(false);
    expect(core.admissionActive).toBe(false);

    stuff(2, conns[1]!);
    stuff(3, conns[2]!);
    await until(() => conns[2]!.conn.socket.pendingByteCount > 2 * MB, "tail queued (3 of 4 in world)");
    env.steps(1);
    expect(client(core).frames()).toEqual([busyKick]);
    expect(core.admissionActive).toBe(true);
  });

  test("outbound 폭 분모 = 인월드 연결: 접속 램프(로그인 중 연결 다수) 중 인월드 전원의 꼬리면 거절 — 로그인 중 연결이 희석하지 않는다", async () => {
    const env = new Env();
    configureOutbound({ maxBytes: 8 * MB });
    const core = newCore(env, { admission: env.admission({ outboundBytes: 1 * MB }) });
    const { world } = await link(core);
    const playing = [client(core), client(core)];
    const ramp = [client(core), client(core), client(core), client(core)]; // 송신 바이트 없음(로그인 전)
    await until(() => world.opened(6) !== undefined, "CONN_OPEN 1..6");
    world.state(1, "IN_WORLD").state(2, "IN_WORLD").state(3, "AUTHENTICATED");
    for (const [i, c] of playing.entries()) {
      c.writeCap = 0;
      world.deliver(i + 1, bulk(MB));
    }
    world.flush();
    await until(() => playing.every((c) => c.conn.socket.pendingByteCount > MB / 2), "tail queued (2 of 2 in world, 6 conns)");
    env.steps(1);
    expect(client(core).frames()).toEqual([busyKick]);
    expect(core.admissionActive).toBe(true);
    expect(ramp.every((c) => !c.ended)).toBe(true);
  });
});
