// 성능 4단계 4.2c — 게이트웨이 코어(GatewayCore): 클라 소켓 연결 표, 클라 엣지 처리기(IpcSink), 월드 메시지 처리, 월드 유실 정책.
// MemoryPipe 위 테스트 월드 끝(helpers/worldSide)과 가짜 클라 소켓(helpers/fakeClient)으로 계약을 고정한다.
//
//   - 핸드셰이크: attachWorld가 HELLO(gatewayId·incarnation·pid)를 보내고 HELLO_ACK에서 resolve. 그 전엔 listen 불가.
//   - 수용: accept → CONN_OPEN(localId, 실제 클라 IP). localId는 incarnation 안에서 재사용하지 않는다. 게이트웨이 상한 =
//     min(maxConnections, 월드 connCap) — 넘치면 KICK 9, 월드가 없으면 KICK 6(CONN_OPEN 없음).
//   - 수신: 엣지 게이트(size·rate·idle — monolith와 같은 clientEdge)를 통과한 본문을 원시 그대로 CONN_FRAMES로(턴마다 배치).
//   - 월드 메시지: DELIVER → 로컬 OutboundLink(백프레셔, 꼬리 상한 초과 = CONN_CLOSED backlog), STATE → rate·idle·pre-auth 미러,
//     CLOSE → 앞선 바이트 뒤 종료 + CONN_CLOSED(world_requested), SHUTDOWN → 전원 킥, ACCEPTED → worldConnId.
//   - 엣지 킥 사유 → CONN_CLOSED: size 3, rate 2, idle·pre-auth 데드라인 1, 클라 끊김 0.
//   - 월드 유실: 전원 KICK 6 + 리스너 중지(CONN_CLOSED 없음 — 죽은 링크), 새 월드에 다시 붙으면 localId는 이어서 증가.
//   - 우아한 종료: BYE → 전원 KICK 6 → CONN_CLOSED(gw_shutdown) → 파이프 종료.

import { afterEach, describe, expect, test } from "bun:test";
import {
  GatewayCore,
  type GatewayCoreOptions,
  type WorldSession,
  WorldRefusedError,
} from "../../../server/src/gateway/gatewayCore";
import type { GatewayConn } from "../../../server/src/gateway/gatewayConn";
import {
  type MemoryPipe,
  type MemoryPipeOptions,
  type PipeTimers,
  createMemoryPipePair,
} from "../../../server/src/cluster/ipcPipe";
import {
  BYE_REASON,
  CONN_CLOSED_REASON,
  HELLO_NACK_LABELS,
  HELLO_NACK_REASON,
  IPC_VERSION,
} from "../../../server/src/cluster/ipcSchema";
import { KICK_REASON } from "../../../server/src/identity/loginFlow";
import { DEFAULT_IN_WORLD_IDLE_SEC } from "../../../server/src/network/clientEdge";
import { writePacket } from "../../../server/src/network/packetWriter";
import {
  DEFAULT_END_FLUSH_TIMEOUT_MS,
  DEFAULT_OUTBOUND_MAX_BYTES,
  configureOutbound,
} from "../../../server/src/network/outboundLink";
import { PACKET_ID } from "../../../server/src/net/codec.generated";
import { encode, encodeRaw, headerOnly } from "../../helpers/wire";
import { metrics, registry } from "../../../server/src/obs/metrics";
import { FakeClient, manualTimers } from "./helpers/fakeClient";
import { WorldSide, frameKey, frameKeyOfBody } from "./helpers/worldSide";
import { turns, until } from "./helpers/gatewaySide";
import { tagPong } from "../../helpers/fillers";

const cores: GatewayCore[] = [];

afterEach(async () => {
  for (const c of cores.splice(0)) await c.close();
  configureOutbound({ maxBytes: DEFAULT_OUTBOUND_MAX_BYTES, endFlushTimeoutMs: DEFAULT_END_FLUSH_TIMEOUT_MS });
  await turns(3);
});

function newCore(opts: Partial<GatewayCoreOptions> = {}): GatewayCore {
  const core = new GatewayCore({ gatewayId: 3, incarnation: 0xabcd, pid: 4242, ...opts });
  cores.push(core);
  return core;
}

interface Linked {
  world: WorldSide;
  gwEnd: MemoryPipe;
  worldEnd: MemoryPipe;
  session: WorldSession;
}

/** MemoryPipe 쌍 + attachWorld + HELLO_ACK까지. */
async function link(
  core: GatewayCore,
  opts: { connCap?: number; gw?: MemoryPipeOptions } = {},
): Promise<Linked> {
  const [gwEnd, worldEnd] = createMemoryPipePair(opts.gw !== undefined ? { a: opts.gw } : {});
  const world = new WorldSide(worldEnd);
  const pending = core.attachWorld((h) => {
    gwEnd.attach(h);
    return gwEnd;
  });
  await until(() => world.recs.some((r) => r.t === "hello"), "HELLO");
  world.helloAck(0x5eed, opts.connCap ?? 1000).flush();
  const session = await pending;
  return { world, gwEnd, worldEnd, session };
}

function client(core: GatewayCore, addr = "198.51.100.7"): FakeClient<GatewayConn> {
  return new FakeClient<GatewayConn>(core.edge, addr).open();
}

async function opened(world: WorldSide, n: number): Promise<void> {
  await until(() => world.recs.filter((r) => r.t === "open").length >= n, `${n} CONN_OPEN`);
}

async function closedOf(world: WorldSide, localId: number): Promise<number> {
  await until(() => world.closedReason(localId) !== undefined, `CONN_CLOSED ${localId}`);
  return world.closedReason(localId)!;
}

const ping = (n: number): Buffer => encode(PACKET_ID.PING, { clientTimeMs: n });
const pings = (from: number, count: number): Buffer =>
  Buffer.concat(Array.from({ length: count }, (_, i) => ping(from + i)));
const kick = (reason: number, detail: string) => ({ id: PACKET_ID.KICK, payload: { reason, detail } });

function oversizeHeader(): Buffer {
  return headerOnly(PACKET_ID.PING, 0xffff);
}

describe("월드 핸드셰이크", () => {
  test("HELLO(gatewayId·incarnation·pid) → HELLO_ACK에서 resolve(worldIncarnation, connCap) — 그 전엔 ready 아님·listen 불가", async () => {
    const core = newCore();
    const [gwEnd, worldEnd] = createMemoryPipePair();
    const world = new WorldSide(worldEnd);
    let settled = false;
    const pending = core.attachWorld((h) => {
      gwEnd.attach(h);
      return gwEnd;
    });
    void pending.then(() => {
      settled = true;
    });
    await until(() => world.recs.length > 0, "HELLO");
    expect(world.recs).toEqual([{ t: "hello", gatewayId: 3, incarnation: 0xabcd, pid: 4242, token: "" }]);
    await turns(3);
    expect(settled).toBe(false);
    expect(core.ready).toBe(false);
    expect(() => core.listen({ port: 0, hostname: "127.0.0.1" })).toThrow();
    const connected = metrics.gwWorldConnected.value();
    world.helloAck(0x5eed, 1500).flush();
    const s = await pending;
    expect([s.worldIncarnation, s.connCap]).toEqual([0x5eed, 1500]);
    expect(core.ready).toBe(true);
    expect(metrics.gwWorldConnected.value()).toBe(connected + 1);
  });

  test("HELLO_ACK 전에 월드가 끊으면 reject — 유실 메트릭 없음, 다시 붙을 수 있다", async () => {
    const core = newCore();
    const [gwEnd, worldEnd] = createMemoryPipePair();
    const world = new WorldSide(worldEnd);
    const lost = metrics.gwWorldLost.value({ reason: "peer" });
    const pending = core.attachWorld((h) => {
      gwEnd.attach(h);
      return gwEnd;
    });
    await until(() => world.recs.length > 0, "HELLO");
    worldEnd.destroy();
    await expect(pending).rejects.toThrow();
    expect(core.ready).toBe(false);
    expect(metrics.gwWorldLost.value({ reason: "peer" })).toBe(lost);
    await link(core);
    expect(core.ready).toBe(true);
  });

  test("connect 실패는 reject로 전파", async () => {
    const core = newCore();
    await expect(
      core.attachWorld(() => {
        throw new Error("ECONNREFUSED");
      }),
    ).rejects.toThrow("ECONNREFUSED");
    expect(core.ready).toBe(false);
  });

  test("HELLO는 ipcToken을 싣는다(미지정 = 빈 값 — 위 HELLO 테스트)", async () => {
    const core = newCore({ ipcToken: "core-secret-0123456789" });
    const [gwEnd, worldEnd] = createMemoryPipePair();
    const world = new WorldSide(worldEnd);
    const pending = core.attachWorld((h) => {
      gwEnd.attach(h);
      return gwEnd;
    });
    await until(() => world.recs.length > 0, "HELLO");
    expect(world.recs[0]).toMatchObject({ t: "hello", gatewayId: 3, token: "core-secret-0123456789" });
    world.helloAck().flush();
    await pending;
  });

  test("HELLO_NACK → WorldRefusedError(사유·월드 ipcVer)로 reject — 유실 메트릭 없음·거절 메트릭 +1, 다시 붙을 수 있다", async () => {
    for (const reason of Object.values(HELLO_NACK_REASON)) {
      const label = HELLO_NACK_LABELS[reason];
      const core = newCore();
      const [gwEnd, worldEnd] = createMemoryPipePair();
      const world = new WorldSide(worldEnd);
      const refused = metrics.gwHelloRefused.value({ reason: label });
      const lost = metrics.gwWorldLost.value({ reason: "local" });
      const pending = core.attachWorld((h) => {
        gwEnd.attach(h);
        return gwEnd;
      });
      await until(() => world.recs.length > 0, "HELLO");
      world.nack(reason).flush();
      worldEnd.end();
      const err: unknown = await pending.then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(WorldRefusedError);
      expect([(err as WorldRefusedError).reason, (err as WorldRefusedError).worldIpcVer]).toEqual([label, IPC_VERSION]);
      expect(metrics.gwHelloRefused.value({ reason: label })).toBe(refused + 1);
      expect(metrics.gwWorldLost.value({ reason: "local" })).toBe(lost);
      expect(core.ready).toBe(false);
      await link(core);
      expect(core.ready).toBe(true);
    }
  });

  test("listen은 HELLO_ACK 뒤 — 실제 소켓 접속이 CONN_OPEN(클라 IP)·끊김이 CONN_CLOSED(peer), stopListening", async () => {
    const core = newCore();
    const { world } = await link(core);
    const port = core.listen({ port: 0, hostname: "127.0.0.1" });
    expect(port).toBeGreaterThan(0);
    expect(core.listening).toBe(true);
    const sock = await Bun.connect({ hostname: "127.0.0.1", port, socket: { data() {}, close() {} } });
    await opened(world, 1);
    expect(world.opened(1)).toBe("127.0.0.1");
    sock.end();
    expect(await closedOf(world, 1)).toBe(CONN_CLOSED_REASON.Peer);
    core.stopListening();
    expect(core.listening).toBe(false);
  });

  test("heartbeat 박자마다 PING(seq 증가)", async () => {
    const core = newCore();
    const noop: PipeTimers = {
      setTimeout: () => 0,
      clearTimeout: () => {},
      setInterval: () => 0,
      clearInterval: () => {},
    };
    const { world, gwEnd } = await link(core, { gw: { heartbeatMs: 1000, deadMs: 5000, timers: noop, now: () => 0 } });
    gwEnd.checkLiveness();
    gwEnd.checkLiveness();
    await until(() => world.recs.filter((r) => r.t === "ping").length === 2, "2 PING");
    expect(world.recs.filter((r) => r.t === "ping")).toEqual([
      { t: "ping", seq: 1 },
      { t: "ping", seq: 2 },
    ]);
  });
});

describe("클라 연결 수용", () => {
  test("accept → CONN_OPEN(localId, 실제 클라 IP), localId 단조 증가, 게이지, pre-auth idle 창", async () => {
    const core = newCore();
    const { world } = await link(core);
    const gauge = metrics.gwConnections.value();
    const a = client(core, "198.51.100.1");
    const b = client(core, "2001:db8::5");
    await opened(world, 2);
    expect([a.conn.localId, b.conn.localId]).toEqual([1, 2]);
    expect([world.opened(1), world.opened(2)]).toEqual(["198.51.100.1", "2001:db8::5"]);
    expect(metrics.gwConnections.value()).toBe(gauge + 2);
    expect(core.connectionCount()).toBe(2);
    expect(a.timeouts).toEqual([20]);
  });

  test.each([
    ["maxConnections가 작다", 2, 1000],
    ["월드 connCap이 작다", 1000, 2],
  ] as const)("게이트웨이 상한 = min(maxConnections, connCap) — %s: 넘치면 KICK 9, CONN_OPEN 없음, localId는 소모", async (_n, max, cap) => {
    const core = newCore({ maxConnections: max });
    const { world } = await link(core, { connCap: cap });
    const rejected = metrics.gwConnRejected.value({ reason: "cap" });
    const a = client(core);
    client(core);
    const c = client(core);
    expect(c.frames()).toEqual([kick(KICK_REASON.ServerFull, "connection cap")]);
    expect(c.ended).toBe(true);
    expect(metrics.gwConnRejected.value({ reason: "cap" })).toBe(rejected + 1);
    a.peerClose();
    const d = client(core);
    expect(d.ended).toBe(false);
    await opened(world, 3);
    expect(world.log().filter((e) => e.startsWith("open"))).toEqual(["open:1", "open:2", "open:4"]);
    expect(world.closedReason(3)).toBeUndefined();
  });

  test("월드 없이 들어온 연결은 KICK 6 'world unavailable' — CONN_OPEN 없음(world_down)", () => {
    const core = newCore();
    const rejected = metrics.gwConnRejected.value({ reason: "world_down" });
    const c = client(core);
    expect(c.frames()).toEqual([kick(KICK_REASON.ServerShutdown, "world unavailable")]);
    expect(c.ended).toBe(true);
    expect(metrics.gwConnRejected.value({ reason: "world_down" })).toBe(rejected + 1);
    expect(core.connectionCount()).toBe(0);
  });
});

describe("수신 프레임 → CONN_FRAMES", () => {
  test("게이트 통과 본문을 원시 그대로(디코드는 월드), 한 턴의 여러 연결 프레임은 봉투 1개", async () => {
    const core = newCore();
    const { world } = await link(core);
    const a = client(core);
    const b = client(core);
    await opened(world, 2);
    const bad = Buffer.from("{bad", "utf8");
    a.send(ping(1));
    b.send(encodeRaw(PACKET_ID.PING, bad));
    a.send(ping(2));
    await until(() => world.framesOf(1).length === 2 && world.framesOf(2).length === 1, "frames");
    expect(world.framesOf(1)).toEqual([frameKey(PACKET_ID.PING, { clientTimeMs: 1 }), frameKey(PACKET_ID.PING, { clientTimeMs: 2 })]);
    expect(world.framesOf(2)).toEqual([frameKeyOfBody(PACKET_ID.PING, bad)]);
    expect(new Set(world.recs.flatMap((r) => (r.t === "frame" ? [r.env] : []))).size).toBe(1);
  });

  test("킥된 연결은 같은 청크의 뒤 프레임·이후 청크를 전달하지 않는다", async () => {
    const core = newCore();
    const { world } = await link(core);
    const a = client(core);
    await opened(world, 1);
    a.send(Buffer.concat([ping(1), oversizeHeader()]));
    a.send(ping(2));
    expect(await closedOf(world, 1)).toBe(CONN_CLOSED_REASON.Size);
    expect(world.framesOf(1)).toEqual([frameKey(PACKET_ID.PING, { clientTimeMs: 1 })]);
  });
});

describe("월드 메시지 처리", () => {
  test("DELIVER → 클라 소켓에 그대로·순서대로(봉투 안 여러 연결), 미추적 localId는 stale", async () => {
    const core = newCore();
    const { world } = await link(core);
    const a = client(core);
    const b = client(core);
    await opened(world, 2);
    const f1 = writePacket(PACKET_ID.PONG, tagPong("1"));
    const f2 = writePacket(PACKET_ID.PONG, tagPong("3"));
    const f3 = writePacket(PACKET_ID.PONG, tagPong("5"));
    const stale = metrics.gwStaleRecords.value({ type: "deliver" });
    world.deliver(1, Buffer.concat([f1, f2])).deliver(2, f3).deliver(99, f1).deliver(1, f3).flush();
    await until(() => a.frames().length === 3 && b.frames().length === 1, "delivered");
    expect(a.bytes()).toEqual(Buffer.concat([f1, f2, f3]));
    expect(b.bytes()).toEqual(f3);
    expect(metrics.gwStaleRecords.value({ type: "deliver" })).toBe(stale + 1);
  });

  test("CONN_ACCEPTED → worldConnId 기록, 미추적이면 stale", async () => {
    const core = newCore();
    const { world } = await link(core);
    const a = client(core);
    await opened(world, 1);
    const stale = metrics.gwStaleRecords.value({ type: "accepted" });
    world.accepted(1, 777).accepted(55, 1).flush();
    await until(() => a.conn.worldConnId !== null, "accepted");
    expect(a.conn.worldConnId).toBe(777);
    await until(() => metrics.gwStaleRecords.value({ type: "accepted" }) === stale + 1, "stale accepted");
  });

  test("CONN_STATE 미러 — AUTHENTICATED에서 pre-auth 해제(데드라인 무효), IN_WORLD는 rate 한도·idle 창 전환", async () => {
    const timers = manualTimers();
    const clock = { t: 1_000_000 };
    const core = newCore({
      edge: { setTimer: timers.setTimer, clearTimer: timers.clearTimer, preAuthDeadlineMs: 1000, now: () => clock.t },
    });
    const { world } = await link(core);
    const a = client(core);
    const b = client(core);
    await opened(world, 2);
    world.state(1, "HELLO_RECV").state(1, "AUTHENTICATED").flush();
    await until(() => a.conn.state === "AUTHENTICATED", "AUTHENTICATED");
    expect([a.conn.preAuth, b.conn.preAuth]).toEqual([false, true]);
    timers.fireAll();
    expect(a.ended).toBe(false);
    expect(b.frames()).toEqual([kick(KICK_REASON.Idle, "pre-auth deadline")]);
    expect(await closedOf(world, 2)).toBe(CONN_CLOSED_REASON.Idle);

    world.state(1, "IN_WORLD").flush();
    await until(() => a.conn.state === "IN_WORLD", "IN_WORLD");
    a.send(ping(0)); // 버킷 기준점(첫 소비 시각)
    clock.t += 1000; // IN_WORLD 버킷 충전(100)
    a.send(pings(1, 40)); // pre-auth 한도(10)면 11번째에서 KICK
    expect(a.ended).toBe(false);
    expect(a.timeouts.at(-1)).toBe(DEFAULT_IN_WORLD_IDLE_SEC);
    await until(() => world.framesOf(1).length === 41, "41 frames");
  });

  test("CONN_CLOSE → 앞선 DELIVER 바이트(부분 쓰기 꼬리 포함)를 다 쓴 뒤 종료, CONN_CLOSED(world_requested)", async () => {
    const core = newCore();
    const { world } = await link(core);
    const a = client(core);
    await opened(world, 1);
    a.writeCap = 0; // 커널 송신 버퍼가 찬 상태 — DELIVER는 꼬리로
    const k = writePacket(PACKET_ID.KICK, { reason: KICK_REASON.AdminKick, detail: "gm" });
    world.deliver(1, k).close(1).flush();
    await turns(10);
    expect(a.ended).toBe(false); // 꼬리를 비우기 전엔 닫지 않는다
    a.writeCap = Number.POSITIVE_INFINITY;
    a.drain();
    expect(a.ended).toBe(true);
    expect(a.frames()).toEqual([kick(KICK_REASON.AdminKick, "gm")]);
    expect(await closedOf(world, 1)).toBe(CONN_CLOSED_REASON.WorldRequested);
    expect(core.connectionCount()).toBe(0);
  });

  test("클라 송신 꼬리 상한 초과(느린 소비자) → 종료 + CONN_CLOSED(backlog)", async () => {
    configureOutbound({ maxBytes: 16_384 });
    const core = newCore();
    const { world } = await link(core);
    const a = client(core);
    await opened(world, 1);
    a.writeCap = 0;
    const big = encodeRaw(PACKET_ID.PONG, Buffer.alloc(9037, 0x78)); // 내용 무관 원시 본문(종전 PONG JSON 필러 크기 — B3b PONG flip)
    const backlog = metrics.gwConnClosed.value({ reason: "backlog" });
    world.deliver(1, big).flush();
    await turns(5);
    expect(a.ended).toBe(false);
    world.deliver(1, big).flush();
    expect(await closedOf(world, 1)).toBe(CONN_CLOSED_REASON.Backlog);
    expect(a.ended).toBe(true);
    expect(metrics.gwConnClosed.value({ reason: "backlog" })).toBe(backlog + 1);
  });

  test("엣지 킥 사유 → CONN_CLOSED: size 3 · rate 2 · idle 1 · 클라 끊김 0", async () => {
    const core = newCore();
    const { world } = await link(core);
    const [a, b, c, d] = [client(core), client(core), client(core), client(core)];
    await opened(world, 4);
    a.send(oversizeHeader());
    b.send(pings(1, 15));
    c.fireTimeout();
    d.peerClose();
    expect(a.frames()).toEqual([kick(KICK_REASON.Cheat, "body too large")]);
    expect(b.frames()).toEqual([kick(KICK_REASON.Cheat, "rate limit")]);
    expect(c.frames()).toEqual([kick(KICK_REASON.Idle, "idle timeout")]);
    expect(d.frames()).toEqual([]);
    const reasons = await Promise.all([1, 2, 3, 4].map((id) => closedOf(world, id)));
    expect(reasons).toEqual([
      CONN_CLOSED_REASON.Size,
      CONN_CLOSED_REASON.Rate,
      CONN_CLOSED_REASON.Idle,
      CONN_CLOSED_REASON.Peer,
    ]);
    expect(world.framesOf(2).length).toBe(10);
  });

  test("SHUTDOWN(kickReason) → 전원 KICK + CONN_CLOSED(gw_shutdown), 리스너 중지", async () => {
    const core = newCore();
    const { world } = await link(core);
    core.listen({ port: 0, hostname: "127.0.0.1" });
    const a = client(core);
    const b = client(core);
    await opened(world, 2);
    world.shutdown(KICK_REASON.ServerShutdown).flush();
    await until(() => a.ended && b.ended, "kicked");
    expect(a.frames()).toEqual([kick(KICK_REASON.ServerShutdown, "server shutdown")]);
    expect(await closedOf(world, 1)).toBe(CONN_CLOSED_REASON.GatewayShutdown);
    expect(await closedOf(world, 2)).toBe(CONN_CLOSED_REASON.GatewayShutdown);
    expect(core.listening).toBe(false);
  });
});

describe("월드 유실", () => {
  test("IPC가 끊기면 전원 KICK 6 'world unavailable' + 리스너 중지 + lost(사유) — 죽은 링크라 CONN_CLOSED 없음", async () => {
    const core = newCore();
    const { world, worldEnd, session } = await link(core);
    core.listen({ port: 0, hostname: "127.0.0.1" });
    const a = client(core);
    const b = client(core);
    await opened(world, 2);
    const lost = metrics.gwWorldLost.value({ reason: "peer" });
    const connected = metrics.gwWorldConnected.value();
    const gauge = metrics.gwConnections.value();
    const closedWorldLost = metrics.gwConnClosed.value({ reason: "world_lost" });
    const closedGwShutdown = metrics.gwConnClosed.value({ reason: "gw_shutdown" });
    worldEnd.destroy();
    expect(await session.lost).toBe("peer");
    expect(a.frames()).toEqual([kick(KICK_REASON.ServerShutdown, "world unavailable")]);
    expect([a.ended, b.ended]).toEqual([true, true]);
    expect([core.listening, core.ready, core.connectionCount()]).toEqual([false, false, 0]);
    expect(metrics.gwWorldLost.value({ reason: "peer" })).toBe(lost + 1);
    expect(metrics.gwWorldConnected.value()).toBe(connected - 1);
    expect(metrics.gwConnections.value()).toBe(gauge - 2);
    expect(world.log().filter((e) => e.startsWith("closed"))).toEqual([]);
    // CONN_CLOSED를 보내지 않은 종료는 gw_shutdown이 아니라 world_lost로 센다(리뷰 — 월드 크래시가 gw_shutdown 급증으로 보이지 않게).
    expect(metrics.gwConnClosed.value({ reason: "world_lost" })).toBe(closedWorldLost + 2);
    expect(metrics.gwConnClosed.value({ reason: "gw_shutdown" })).toBe(closedGwShutdown);
  });

  test("SHUTDOWN 뒤 월드가 IPC를 닫으면 예고된 종료(shutdown) — 다음 월드를 기다린다(재접속은 호출자 몫)", async () => {
    const core = newCore();
    const { world, worldEnd, session } = await link(core);
    core.listen({ port: 0, hostname: "127.0.0.1" });
    const a = client(core);
    await opened(world, 1);
    const planned = metrics.gwWorldLost.value({ reason: "shutdown" });
    const peer = metrics.gwWorldLost.value({ reason: "peer" });
    world.shutdown(KICK_REASON.ServerShutdown).flush();
    await until(() => a.ended, "kicked");
    expect(await closedOf(world, 1)).toBe(CONN_CLOSED_REASON.GatewayShutdown);
    worldEnd.end();
    expect(await session.lost).toBe("shutdown");
    expect(metrics.gwWorldLost.value({ reason: "shutdown" })).toBe(planned + 1);
    expect(metrics.gwWorldLost.value({ reason: "peer" })).toBe(peer);
    expect([core.listening, core.ready]).toEqual([false, false]);
  });

  test("SHUTDOWN 뒤 transport 오류(Windows: 월드 프로세스 종료가 RST)도 shutdown", async () => {
    const core = newCore();
    const { world, gwEnd, session } = await link(core);
    const a = client(core);
    await opened(world, 1);
    world.shutdown(KICK_REASON.ServerShutdown).flush();
    await until(() => a.ended, "SHUTDOWN applied (client kicked)");
    gwEnd.destroy("error", new Error("Unknown Error, read"));
    expect(await session.lost).toBe("shutdown");
  });

  test("월드가 IPC_DEAD_MS 동안 조용하면(멈춘 월드) dead 유실 — 전원 KICK 6·리스너 중지", async () => {
    const intervals = new Set<() => void>();
    const timers: PipeTimers = {
      setTimeout: () => 0,
      clearTimeout: () => {},
      setInterval(fn) {
        intervals.add(fn);
        return fn;
      },
      clearInterval: (h) => void intervals.delete(h as () => void),
    };
    let now = 0;
    const core = newCore();
    const { world, session } = await link(core, { gw: { heartbeatMs: 100, deadMs: 300, timers, now: () => now } });
    core.listen({ port: 0, hostname: "127.0.0.1" });
    const a = client(core);
    await opened(world, 1);
    const dead = metrics.gwWorldLost.value({ reason: "dead" });
    for (let i = 0; i < 3; i++) {
      now += 100;
      for (const fn of [...intervals]) fn();
    }
    expect(await session.lost).toBe("dead");
    expect(a.frames()).toEqual([kick(KICK_REASON.ServerShutdown, "world unavailable")]);
    expect([core.listening, core.ready]).toEqual([false, false]);
    expect(metrics.gwWorldLost.value({ reason: "dead" })).toBe(dead + 1);
  });

  test("월드 프로토콜 위반(예약 type) → protocol 유실", async () => {
    const core = newCore();
    const { worldEnd, session } = await link(core);
    const bad = Buffer.alloc(5);
    bad.writeUInt32LE(1, 0);
    bad[4] = 0xa0; // 예약(멀티 월드) — 0x94는 v4 CONN_MULTICAST
    worldEnd.write(bad);
    expect(await session.lost).toBe("protocol");
  });

  test("유실 뒤 새 월드에 다시 붙으면 수용 재개 — localId는 이어서 증가(incarnation 안 재사용 없음)", async () => {
    const core = newCore();
    const first = await link(core);
    client(core);
    await opened(first.world, 1);
    first.worldEnd.destroy();
    await first.session.lost;
    const second = await link(core);
    const b = client(core);
    await opened(second.world, 1);
    expect(b.conn.localId).toBe(2);
    expect(second.world.opened(2)).toBe("198.51.100.7");
  });
});

describe("우아한 종료", () => {
  test("close() — BYE → 전원 KICK 6 'gateway shutdown' → CONN_CLOSED(gw_shutdown) → 파이프 종료(lost = local)", async () => {
    const core = newCore();
    const { world, session } = await link(core);
    const a = client(core);
    await opened(world, 1);
    await core.close(BYE_REASON.Restart);
    expect(a.frames()).toEqual([kick(KICK_REASON.ServerShutdown, "gateway shutdown")]);
    expect(await session.lost).toBe("local");
    await world.closed;
    expect(world.log()).toEqual(["hello", "open:1", `bye:${BYE_REASON.Restart}`, `closed:1:${CONN_CLOSED_REASON.GatewayShutdown}`]);
    await expect(core.attachWorld(() => world.pipe)).rejects.toThrow();
  });
});

describe("관측(4.3a)", () => {
  const noopTimers: PipeTimers = {
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
  };

  test("CONN_DELIVER 봉투 1개 = mmorpg_gw_deliver_batch_ms 표본 1개, 레코드 수 = mmorpg_gw_deliver_records_total", async () => {
    const core = newCore();
    const { world } = await link(core);
    const a = client(core);
    const b = client(core);
    await opened(world, 2);
    const batches = metrics.gwDeliverBatchMs.snapshot().count;
    const records = metrics.gwDeliverRecords.value();
    world.deliver(1, ping(1)).deliver(2, ping(2)).deliver(1, ping(3)).flush();
    await until(() => a.frames().length === 2 && b.frames().length === 1, "delivered");
    expect(metrics.gwDeliverBatchMs.snapshot().count).toBe(batches + 1);
    expect(metrics.gwDeliverRecords.value()).toBe(records + 3);
  });

  test("PING → PONG 왕복 = mmorpg_gw_ipc_rtt_ms(월드 이벤트 루프 응답성), 늦게 온 옛 PONG도 자기 seq로 잰다", async () => {
    let now = 1000;
    const core = newCore({ now: () => now });
    const { world, gwEnd } = await link(core, {
      gw: { heartbeatMs: 1000, deadMs: 5000, timers: noopTimers, now: () => 0 },
    });
    const before = metrics.gwIpcRttMs.snapshot();
    gwEnd.checkLiveness(); // PING 1 @1000
    now = 2000;
    gwEnd.checkLiveness(); // PING 2 @2000
    await until(() => world.recs.filter((r) => r.t === "ping").length === 2, "2 PING");
    now = 2012;
    world.pong(1).pong(2).flush();
    await until(() => metrics.gwIpcRttMs.snapshot().count === before.count + 2, "2 RTT samples");
    expect(metrics.gwIpcRttMs.snapshot().sum - before.sum).toBe(1012 + 12);
    world.pong(2).flush(); // 중복 PONG은 무시
    await turns(3);
    expect(metrics.gwIpcRttMs.snapshot().count).toBe(before.count + 2);
  });

  test("mmorpg_gw_ipc_pending_bytes — scrape 시점 월드 파이프 미전송 바이트(월드가 안 읽으면 쌓인다)", async () => {
    const core = newCore();
    const { gwEnd, worldEnd, world } = await link(core, { gw: { faults: { windowBytes: 8 } } });
    worldEnd.pauseReceiving();
    client(core);
    await until(() => gwEnd.pendingBytes > 0, "CONN_OPEN pending");
    const gauge = (): number => Number(/\nmmorpg_gw_ipc_pending_bytes (\S+)\n/.exec(registry.expose())?.[1]);
    expect(gauge()).toBe(gwEnd.pendingBytes);
    worldEnd.resumeReceiving();
    await opened(world, 1);
    await until(() => gwEnd.pendingBytes === 0, "drained");
    expect(gauge()).toBe(0);
  });
});
