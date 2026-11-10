// 공유 포트 리스너 양보 — 게이트웨이 쪽(GatewayCore + gatewayListen, IPC v14). MemoryPipe 위 테스트 월드 끝(helpers/worldSide)이 LISTEN을 보내고
// LISTEN_REPORT를 기록한다. 리스너는 실제 소켓(127.0.0.1 임시 포트 — reusePort 없이: 중지·재개 자체는 OS와 무관, 공유 포트 분산은 카오스 C8).
//
//   - listen() 직후 첫 보고(shared = 양보 자격, listening 1, port = 바인드 포트, ack 0). 그 전엔 보고하지 않는다.
//   - yield(로컬 접속 제한이 닫혀 있을 때만) → 리스너 중지: 새 접속 거부, 이미 받은 연결은 read·write 그대로. 보고 listening 0 · ack.
//   - listen → 같은 포트로 재바인드 → 다시 받는다. 재바인드 실패는 백오프 재시도(성공하면 보고).
//   - 자격 없음(GW_LISTEN_YIELD 꺼짐·공유 포트 아님)·접속 제한 열림이면 mode 무시, ack만.
//   - 접속 제한 전이·SHUTDOWN·자기 종료(BYE 전)마다 보고. 월드 유실 = 리스너 중지 + 양보 상태·ack 초기화(다음 세션은 listen()부터, ack 0).
//   - 세션 밖(listen() 전·SHUTDOWN 뒤)의 LISTEN은 리스너를 건드리지 않고 ack만(리슨 전엔 보고도 없다 — 첫 보고가 그 ack를 싣는다).
//   - 연결 상한 닿음도 closed(재개 문턱 = 상한 − max(1, 5%)) — 접속 제한이 열려 있어도 yield를 따른다. 지시가 없으면 종전 KICK 9 connection cap.

import { afterEach, describe, expect, test } from "bun:test";
import { GatewayCore, type GatewayCoreOptions } from "../../../server/src/gateway/gatewayCore";
import { type ListenBind, capReopenAt } from "../../../server/src/gateway/gatewayListen";
import type { GatewayAdmissionOptions } from "../../../server/src/gateway/gatewayLoad";
import { type MemoryPipe, createMemoryPipePair } from "../../../server/src/cluster/ipcPipe";
import { KICK_REASON } from "../../../server/src/identity/loginFlow";
import { PACKET_ID } from "../../../server/src/net/codec.generated";
import { metrics } from "../../../server/src/obs/metrics";
import { encode } from "../../helpers/wire";
import { manualTimers } from "./helpers/fakeClient";
import { WorldSide, frameKey } from "./helpers/worldSide";
import { turns, until } from "./helpers/gatewaySide";

const cores: GatewayCore[] = [];
const sockets: Array<{ end(): void }> = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.end();
  for (const c of cores.splice(0)) await c.close();
  await turns(3);
});

/** 수동 표본 타이머·고정 시계·CPU 0의 접속 제한(월드 ADMISSION으로만 닫힌다 — hold 0). */
function admission(): GatewayAdmissionOptions {
  return {
    cpuPct: 90,
    lagMs: 250,
    rttMs: 1000,
    outboundBytes: 64 * 1024 * 1024,
    holdMs: 0,
    now: () => 0,
    cpuUsage: () => ({ user: 0, system: 0 }),
    timers: { setInterval: () => null, clearInterval: () => {} },
  };
}

/** eligible = 양보 자격(listenYield 키를 넣는다 — false면 키 자체가 없다: 운영 배선의 자격 없음과 같은 모양). */
function newCore(opts: Partial<GatewayCoreOptions> = {}, eligible = true): GatewayCore {
  const core = new GatewayCore({
    gatewayId: 7,
    incarnation: 0x77,
    pid: 4242,
    admission: admission(),
    ...(eligible ? { listenYield: {} } : {}),
    ...opts,
  });
  cores.push(core);
  return core;
}

interface Linked {
  world: WorldSide;
  gwEnd: MemoryPipe;
  worldEnd: MemoryPipe;
}

async function link(core: GatewayCore): Promise<Linked> {
  const [gwEnd, worldEnd] = createMemoryPipePair();
  const world = new WorldSide(worldEnd);
  const pending = core.attachWorld((h) => {
    gwEnd.attach(h);
    return gwEnd;
  });
  await until(() => world.recs.some((r) => r.t === "hello"), "HELLO");
  world.helloAck(0x5eed, 1000).flush();
  await pending;
  return { world, gwEnd, worldEnd };
}

/** 링크 + 실제 소켓 리슨(127.0.0.1 임시 포트) + 첫 보고까지. */
async function listening(core: GatewayCore): Promise<Linked & { port: number }> {
  const l = await link(core);
  const port = core.listen({ port: 0, hostname: "127.0.0.1" });
  await until(() => l.world.listenReports().length === 1, "first LISTEN_REPORT");
  return { ...l, port };
}

/** 실제 접속 — 리스너가 받으면 소켓, 거부되면 null. */
async function tryConnect(port: number, onData?: (d: Buffer) => void): Promise<Bun.Socket<undefined> | null> {
  let opened = false;
  try {
    const s = await Bun.connect({
      hostname: "127.0.0.1",
      port,
      socket: {
        open() {
          opened = true;
        },
        data(_s, d) {
          onData?.(Buffer.from(d));
        },
        close() {},
        connectError() {},
      },
    });
    if (!opened) {
      s.end();
      return null;
    }
    sockets.push(s);
    return s;
  } catch {
    return null;
  }
}

const lastReport = (w: WorldSide) => w.listenReports().at(-1);

/** 월드 ADMISSION busy → 게이트웨이 접속 제한 닫힘(cause world) + 그 전이의 보고(closed 1). */
async function closeAdmission(core: GatewayCore, world: WorldSide): Promise<void> {
  world.writer.admission(true);
  world.flush();
  await until(() => core.admissionActive && lastReport(world)?.closed === true, "admission closed + report");
}

describe("게이트웨이 리스너 양보 — 보고", () => {
  test("listen() 직후 첫 LISTEN_REPORT — shared(양보 자격)·listening 1·바인드 포트·ack 0, 리슨 전엔 보고 없음", async () => {
    const core = newCore();
    const { world } = await link(core);
    await turns(5);
    expect(world.listenReports()).toEqual([]);
    const port = core.listen({ port: 0, hostname: "127.0.0.1" });
    await until(() => world.listenReports().length === 1, "report");
    expect(world.listenReports()).toEqual([{ shared: true, closed: false, listening: true, port, ackSeq: 0 }]);
  });

  test("리슨 전에 온 LISTEN은 보고 없이 ack만 기록한다 — 리슨 뒤 첫 보고가 그 ack를 싣고, 리스너는 연다", async () => {
    const core = newCore();
    const { world } = await link(core);
    world.listen("yield", 1).flush();
    await turns(5);
    expect(world.listenReports()).toEqual([]);
    expect(core.listening).toBe(false);
    const port = core.listen({ port: 0, hostname: "127.0.0.1" });
    await until(() => world.listenReports().length === 1, "first report");
    expect(world.listenReports()).toEqual([{ shared: true, closed: false, listening: true, port, ackSeq: 1 }]);
    expect([core.listening, core.listenYielded]).toEqual([true, false]);
  });

  test("자격 없는 게이트웨이(listenYield 미지정)는 shared 0으로 보고한다", async () => {
    const core = newCore({}, false);
    const { world, port } = await listening(core);
    expect(lastReport(world)).toEqual({ shared: false, closed: false, listening: true, port, ackSeq: 0 });
  });

  test("접속 제한 전이마다 보고(closed 1 → 0)", async () => {
    const core = newCore();
    const { world } = await listening(core);
    await closeAdmission(core, world);
    world.writer.admission(false);
    world.flush();
    await until(() => lastReport(world)?.closed === false && world.listenReports().length === 3, "reopened report");
    expect(world.listenReports().map((r) => r.closed)).toEqual([false, true, false]);
  });
});

describe("게이트웨이 리스너 양보 — yield·listen", () => {
  test("yield(접속 제한 닫힘) → 리스너 중지: 새 접속 거부, 이미 받은 연결은 read·write 그대로 — 보고 listening 0·ack 1, 게이지·카운터", async () => {
    const core = newCore();
    const { world, port } = await listening(core);
    const got: Buffer[] = [];
    const existing = (await tryConnect(port, (d) => got.push(d)))!;
    expect(existing).not.toBeNull();
    await until(() => world.recs.some((r) => r.t === "open"), "CONN_OPEN");
    await closeAdmission(core, world);
    const yielded0 = metrics.gwListenYielded.value();
    const paused0 = metrics.gwListenTransitions.value({ state: "paused" });

    world.listen("yield", 1).flush();
    await until(() => lastReport(world)?.ackSeq === 1, "ack 1");
    expect(lastReport(world)).toMatchObject({ shared: true, closed: true, listening: false, ackSeq: 1 });
    expect([core.listening, core.listenYielded]).toEqual([false, true]);
    expect(metrics.gwListenYielded.value()).toBe(yielded0 + 1);
    expect(metrics.gwListenTransitions.value({ state: "paused" })).toBe(paused0 + 1);
    expect(await tryConnect(port)).toBeNull();

    // 기존 연결: 월드 → 클라(write), 클라 → 월드(read).
    const pong = encode(PACKET_ID.PONG, { clientTimeMs: 5, serverTimeMs: 6 });
    world.deliver(1, pong).flush();
    await until(() => Buffer.concat(got).equals(pong), "existing client received");
    existing.write(encode(PACKET_ID.PING, { clientTimeMs: 9 }));
    await until(() => world.framesOf(1).includes(frameKey(PACKET_ID.PING, { clientTimeMs: 9 })), "existing client sent");
  });

  test("listen → 같은 포트로 재바인드해 다시 받는다 — 보고 listening 1·ack 2, 게이지 복귀·resumed 카운터", async () => {
    const core = newCore();
    const { world, port } = await listening(core);
    await closeAdmission(core, world);
    world.listen("yield", 1).flush();
    await until(() => lastReport(world)?.ackSeq === 1, "ack 1");
    const yielded1 = metrics.gwListenYielded.value();
    const resumed0 = metrics.gwListenTransitions.value({ state: "resumed" });
    world.listen("listen", 2).flush();
    await until(() => lastReport(world)?.ackSeq === 2, "ack 2");
    expect(lastReport(world)).toMatchObject({ listening: true, port, ackSeq: 2 });
    expect([core.listening, core.listenYielded]).toEqual([true, false]);
    expect(metrics.gwListenYielded.value()).toBe(yielded1 - 1);
    expect(metrics.gwListenTransitions.value({ state: "resumed" })).toBe(resumed0 + 1);
    expect(await tryConnect(port)).not.toBeNull();
  });

  test("접속 제한이 열려 있으면 yield를 따르지 않는다(월드가 본 근거가 풀렸다) — ack만", async () => {
    const core = newCore();
    const { world } = await listening(core);
    world.listen("yield", 1).flush();
    await until(() => lastReport(world)?.ackSeq === 1, "ack 1");
    expect(lastReport(world)).toMatchObject({ closed: false, listening: true, ackSeq: 1 });
    expect(core.listening).toBe(true);
  });

  test("자격 없는 게이트웨이는 접속 제한이 닫혀도 yield를 무시하고 ack만 — 리스너 그대로(닫힌 채 KICK 9 경로)", async () => {
    const core = newCore({}, false);
    const { world, port } = await listening(core);
    await closeAdmission(core, world);
    world.listen("yield", 1).flush();
    await until(() => lastReport(world)?.ackSeq === 1, "ack 1");
    expect(lastReport(world)).toMatchObject({ shared: false, closed: true, listening: true, ackSeq: 1 });
    expect(core.listening).toBe(true);
    const kicked: Buffer[] = [];
    expect(await tryConnect(port, (d) => kicked.push(d))).not.toBeNull();
    await until(() => Buffer.concat(kicked).length > 0, "KICK 9");
    expect(Buffer.concat(kicked)).toEqual(encode(PACKET_ID.KICK, { reason: KICK_REASON.ServerFull, detail: "server busy" }));
  });
});

describe("게이트웨이 리스너 양보 — 재개 실패·세션 경계", () => {
  test("재바인드 실패 → warn·listening 0 보고 후 백오프 재시도, 성공하면 보고(listening 1) — 그사이 yield가 오면 재시도를 접고 내려간 채", async () => {
    const timers = manualTimers();
    let failures = 2;
    const bind: ListenBind = (o) => {
      if (o.port !== 0 && failures-- > 0) throw new Error("EADDRINUSE (injected)");
      return Bun.listen(o);
    };
    const core = newCore({
      listenBind: bind,
      listenYield: { retryInitialMs: 10, timers: { setTimeout: timers.setTimer, clearTimeout: timers.clearTimer } },
    });
    const { world, port } = await listening(core);
    await closeAdmission(core, world);
    world.listen("yield", 1).listen("listen", 2).flush();
    await until(() => lastReport(world)?.ackSeq === 2, "ack 2");
    expect(lastReport(world)).toMatchObject({ listening: false, ackSeq: 2 });
    expect([core.listening, core.listenYielded]).toEqual([false, true]);
    expect(timers.timers.map((t) => t.ms)).toEqual([10]);
    timers.fireAll(); // 2번째 실패 → 20 ms 뒤 재시도
    expect(timers.timers.map((t) => t.ms)).toEqual([20]);
    const n = world.listenReports().length;
    timers.fireAll(); // 성공
    await until(() => world.listenReports().length === n + 1, "report after retry");
    expect(lastReport(world)).toMatchObject({ listening: true, port, ackSeq: 2 });
    expect([core.listening, core.listenYielded]).toEqual([true, false]);

    // 재시도 중 yield → 재시도 취소, 내려간 채.
    failures = 1;
    world.listen("yield", 3).listen("listen", 4).flush();
    await until(() => lastReport(world)?.ackSeq === 4, "ack 4");
    expect(timers.timers.filter((t) => !t.cleared)).toHaveLength(1);
    world.listen("yield", 5).flush();
    await until(() => lastReport(world)?.ackSeq === 5, "ack 5");
    expect(timers.timers.filter((t) => !t.cleared)).toHaveLength(0);
    expect([core.listening, core.listenYielded]).toEqual([false, true]);
  });

  test("양보 중 월드 유실 → 리스너 중지(종전)·양보 상태와 ack 초기화 — 다음 세션은 listen()부터 리스닝, 첫 보고 ack 0", async () => {
    const core = newCore();
    const first = await listening(core);
    await closeAdmission(core, first.world);
    const yielded0 = metrics.gwListenYielded.value();
    first.world.listen("yield", 1).flush();
    await until(() => core.listenYielded, "yielded");
    expect(metrics.gwListenYielded.value()).toBe(yielded0 + 1);
    first.worldEnd.destroy();
    await until(() => !core.ready, "world lost");
    expect([core.listening, core.listenYielded]).toEqual([false, false]);
    expect(metrics.gwListenYielded.value()).toBe(yielded0);

    const second = await link(core);
    await turns(5);
    expect(second.world.listenReports()).toEqual([]); // 리슨 전
    const port = core.listen({ port: first.port, hostname: "127.0.0.1" });
    await until(() => second.world.listenReports().length === 1, "first report of the new session");
    expect(second.world.listenReports()[0]).toEqual({ shared: true, closed: false, listening: true, port, ackSeq: 0 });
    expect(await tryConnect(port)).not.toBeNull();
  });

  test("SHUTDOWN은 리스너를 내리고 listening 0을 보고한다(양보 중이었으면 게이지 복귀)", async () => {
    const core = newCore();
    const { world } = await listening(core);
    await closeAdmission(core, world);
    const yielded0 = metrics.gwListenYielded.value();
    world.listen("yield", 1).flush();
    await until(() => core.listenYielded, "yielded");
    world.shutdown(KICK_REASON.ServerShutdown).flush();
    await until(() => !core.listenYielded, "shutdown handled");
    await until(() => world.listenReports().length >= 4, "report after SHUTDOWN");
    expect(lastReport(world)).toMatchObject({ listening: false, ackSeq: 1 });
    expect(metrics.gwListenYielded.value()).toBe(yielded0);
  });

  test("SHUTDOWN 뒤에 온 LISTEN listen(월드 드레인의 전원 listen)은 재바인드하지 않고 ack만", async () => {
    const core = newCore();
    const { world, port } = await listening(core);
    await closeAdmission(core, world);
    world.listen("yield", 1).flush();
    await until(() => core.listenYielded, "yielded");
    world.shutdown(KICK_REASON.ServerShutdown).flush();
    await until(() => !core.listenYielded && lastReport(world)?.listening === false, "shutdown handled");
    world.listen("listen", 2).flush();
    await until(() => lastReport(world)?.ackSeq === 2, "ack 2");
    expect(lastReport(world)).toMatchObject({ listening: false, ackSeq: 2 });
    expect([core.listening, core.listenYielded]).toEqual([false, false]);
    expect(await tryConnect(port)).toBeNull();
  });

  test("우아한 종료(close)는 리스너를 내린 뒤 listening 0을 BYE보다 먼저 보고한다", async () => {
    const core = newCore();
    const { world } = await listening(core);
    const done = core.close();
    await until(() => world.recs.some((r) => r.t === "bye"), "BYE");
    const tail = world.recs.filter((r) => r.t === "bye" || r.t === "listen_report").slice(-2);
    expect(tail.map((r) => r.t)).toEqual(["listen_report", "bye"]);
    expect(lastReport(world)).toMatchObject({ listening: false });
    world.pipe.end();
    await done;
  });
});

describe("게이트웨이 리스너 양보 — 연결 상한", () => {
  test("재개 문턱 = 상한 − 여유(상한의 5%, 최소 1)", () => {
    expect([1, 2, 20, 21, 1000].map(capReopenAt)).toEqual([0, 1, 19, 19, 950]);
  });

  test("연결 상한에 닿으면 접속 제한이 열려 있어도 closed 1을 보고하고 yield를 따른다 — 재개 문턱 이하로 내려가면 closed 0, listen으로 다시 받는다", async () => {
    const core = newCore({ maxConnections: 2 });
    const { world, port } = await listening(core);
    expect(await tryConnect(port)).not.toBeNull();
    await until(() => core.connectionCount() === 1, "1 conn");
    expect(lastReport(world)?.closed).toBe(false);
    const second = (await tryConnect(port))!;
    await until(() => lastReport(world)?.closed === true, "cap closed report");
    expect(core.admissionActive).toBe(false);

    world.listen("yield", 1).flush();
    await until(() => lastReport(world)?.ackSeq === 1, "ack 1");
    expect(lastReport(world)).toMatchObject({ closed: true, listening: false, ackSeq: 1 });
    expect([core.listening, core.listenYielded]).toEqual([false, true]);
    expect(await tryConnect(port)).toBeNull();

    second.end(); // 2 → 1 = 재개 문턱(상한 2 − 1)
    await until(() => lastReport(world)?.closed === false, "below cap — open report");
    expect(lastReport(world)).toMatchObject({ listening: false, ackSeq: 1 });
    world.listen("listen", 2).flush();
    await until(() => lastReport(world)?.ackSeq === 2, "ack 2");
    expect([core.listening, core.listenYielded]).toEqual([true, false]);
    expect(await tryConnect(port)).not.toBeNull();
  });

  test("상한에 닿아도 양보 지시가 없으면(전원 바쁨) 리슨한 채 종전 KICK 9 connection cap", async () => {
    const core = newCore({ maxConnections: 1 });
    const { world, port } = await listening(core);
    expect(await tryConnect(port)).not.toBeNull();
    await until(() => lastReport(world)?.closed === true, "cap closed report");
    const kicked: Buffer[] = [];
    expect(await tryConnect(port, (d) => kicked.push(d))).not.toBeNull();
    await until(() => Buffer.concat(kicked).length > 0, "KICK 9");
    expect(Buffer.concat(kicked)).toEqual(encode(PACKET_ID.KICK, { reason: KICK_REASON.ServerFull, detail: "connection cap" }));
    expect(core.listening).toBe(true);
  });
});
