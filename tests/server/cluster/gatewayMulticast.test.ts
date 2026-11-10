// 성능 4.5 F2 — 게이트웨이 쪽 MULTICAST(CONN_MULTICAST 펼치기 + 연결별 쓰기 합치기).
//
// 계약(ipcSchema 순서 규칙 — 게이트웨이):
//   - 레코드를 스트림 순서로 적용하고 연결별 바이트를 레코드 순서로 잇는다. MULTICAST 프레임은 레코드당 1회 복사해 수신 연결마다 미뤄
//     두고, 그 연결의 다음 DELIVER(합쳐 write 1회)·CONN_FLUSH(창 끝)·종료(CONN_CLOSE·SHUTDOWN·월드 유실 — 바이트 먼저)·엣지 KICK(앞에)
//     중 먼저 오는 때에 쓴다 ⇒ 연결당 flush 창마다 write 1회(종전 DELIVER 1개 = write 1회와 같다), 청크가 나뉘어 와도 같다.
//   - CONN_STATE는 미러만 바꾼다(미룬 바이트 무접촉). 미추적 localId = stale(type multicast), 종료 중 링크는 버린다(DELIVER와 같다).

import { afterEach, describe, expect, test } from "bun:test";
import { GatewayCore } from "../../../server/src/gateway/gatewayCore";
import type { GatewayConn } from "../../../server/src/gateway/gatewayConn";
import { type MemoryPipeOptions, createMemoryPipePair } from "../../../server/src/cluster/ipcPipe";
import { CONN_CLOSED_REASON } from "../../../server/src/cluster/ipcSchema";
import { KICK_REASON } from "../../../server/src/identity/loginFlow";
import { writePacket } from "../../../server/src/network/packetWriter";
import {
  DEFAULT_END_FLUSH_TIMEOUT_MS,
  DEFAULT_OUTBOUND_MAX_BYTES,
  configureOutbound,
} from "../../../server/src/network/outboundLink";
import { PACKET_ID } from "../../../server/src/net/codec.generated";
import { headerOnly } from "../../helpers/wire";
import { metrics } from "../../../server/src/obs/metrics";
import { FakeClient } from "./helpers/fakeClient";
import { WorldSide } from "./helpers/worldSide";
import { turns, until } from "./helpers/gatewaySide";
import { tagChat, tagPong } from "../../helpers/fillers";

const cores: GatewayCore[] = [];

afterEach(async () => {
  for (const c of cores.splice(0)) await c.close();
  configureOutbound({ maxBytes: DEFAULT_OUTBOUND_MAX_BYTES, endFlushTimeoutMs: DEFAULT_END_FLUSH_TIMEOUT_MS });
  await turns(3);
});

interface Rig {
  core: GatewayCore;
  world: WorldSide;
  clients: FakeClient<GatewayConn>[];
  destroyWorld(): void;
}

/** 코어 + 월드 끝(HELLO_ACK) + 클라 n개(CONN_OPEN까지). worldPipe = 월드 → 게이트웨이 파이프 옵션(청크 분할 등). */
async function rig(n: number, worldPipe?: MemoryPipeOptions): Promise<Rig> {
  const core = new GatewayCore({ gatewayId: 5, incarnation: 0xbeef, pid: 1 });
  cores.push(core);
  const [gwEnd, worldEnd] = createMemoryPipePair(worldPipe !== undefined ? { b: worldPipe } : {});
  const world = new WorldSide(worldEnd);
  const pending = core.attachWorld((h) => {
    gwEnd.attach(h);
    return gwEnd;
  });
  await until(() => world.recs.some((r) => r.t === "hello"), "HELLO");
  world.helloAck(1, 1000).flush();
  await pending;
  const clients = Array.from({ length: n }, (_, i) => new FakeClient<GatewayConn>(core.edge, `198.51.100.${i + 1}`).open());
  await until(() => world.recs.filter((r) => r.t === "open").length === n, "opens");
  return { core, world, clients, destroyWorld: () => worldEnd.destroy() };
}

const chat = (text: string): Buffer => writePacket(PACKET_ID.CHAT_BCAST, tagChat(text, "w"));
const pong = (n: number): Buffer => writePacket(PACKET_ID.PONG, tagPong(n));

describe("CONN_MULTICAST — 펼치기와 쓰기 합치기", () => {
  test("MULTICAST만 온 연결은 CONN_FLUSH에서 write 1회(그 전엔 쓰지 않는다), 바이트 = 프레임", async () => {
    const { world, clients } = await rig(3);
    const m = chat("hello all");
    world.multicast(m, [1, 2, 3]).flush();
    await turns(5);
    for (const c of clients) expect(c.written.length).toBe(0);
    world.windowEnd().flush();
    await until(() => clients.every((c) => c.written.length === 1), "1 write each");
    for (const c of clients) expect(c.bytes().equals(m)).toBe(true);
  });

  test("MULTICAST 뒤 같은 창의 DELIVER와 합쳐 write 1회 — DELIVER 없는 수신자는 CONN_FLUSH에서", async () => {
    const { world, clients } = await rig(2);
    const m1 = chat("one");
    const m2 = chat("two");
    const d = pong(7);
    world.multicast(m1, [1, 2]).multicast(m2, [2, 1]).deliver(1, d).windowEnd().flush();
    await until(() => clients.every((c) => c.written.length === 1), "1 write each");
    await turns(3);
    expect(clients[0]!.written.length).toBe(1);
    expect(clients[0]!.bytes().equals(Buffer.concat([m1, m2, d]))).toBe(true);
    expect(clients[1]!.bytes().equals(Buffer.concat([m1, m2]))).toBe(true);
  });

  test("DELIVER → MULTICAST → DELIVER: 첫 DELIVER는 바로, 뒤 둘은 합쳐서 — 연결별 바이트 순서 = 레코드 순서", async () => {
    const { world, clients } = await rig(2);
    const d1 = pong(1);
    const m = chat("mid");
    const d2 = pong(2);
    world.deliver(1, d1).multicast(m, [1, 2]).deliver(1, d2).windowEnd().flush();
    await until(() => clients[0]!.written.length === 2 && clients[1]!.written.length === 1, "writes");
    expect(clients[0]!.bytes().equals(Buffer.concat([d1, m, d2]))).toBe(true);
    expect(clients[0]!.written[1]!.equals(Buffer.concat([m, d2]))).toBe(true);
  });

  test("청크가 잘게 나뉘어(97바이트) 와도 미룬 바이트는 다음 DELIVER까지 유지 — 연결당 write 1회", async () => {
    const { world, clients } = await rig(3, { faults: { splitSeed: 0xf2, maxChunkBytes: 97 } });
    const m = chat("x".repeat(300));
    const d = Buffer.concat(Array.from({ length: 20 }, (_, i) => pong(i)));
    world.multicast(m, [1, 2, 3]).deliver(3, d).deliver(1, d).windowEnd().flush();
    await until(() => clients.every((c) => c.written.length === 1), "1 write each");
    await turns(5);
    expect(clients.map((c) => c.written.length)).toEqual([1, 1, 1]);
    expect(clients[0]!.bytes().equals(Buffer.concat([m, d]))).toBe(true);
    expect(clients[1]!.bytes().equals(m)).toBe(true);
    expect(clients[2]!.bytes().equals(Buffer.concat([m, d]))).toBe(true);
  });

  test("CONN_STATE는 미러만 — 미룬 바이트는 그대로 다음 DELIVER와 합쳐진다", async () => {
    const { core, world, clients } = await rig(2);
    const m = chat("s");
    const d = pong(3);
    world.multicast(m, [1, 2]).state(1, "IN_WORLD").deliver(1, d).windowEnd().flush();
    await until(() => clients.every((c) => c.written.length === 1), "writes");
    expect(core.connection(1)!.state).toBe("IN_WORLD");
    expect(clients[0]!.bytes().equals(Buffer.concat([m, d]))).toBe(true);
  });
});

describe("CONN_MULTICAST — 종료·킥·부분 수신자", () => {
  test("MULTICAST → CONN_CLOSE: 미룬 바이트를 쓰고 닫는다(CONN_CLOSED world_requested)", async () => {
    const { world, clients } = await rig(2);
    const m = chat("bye");
    world.multicast(m, [1, 2]).close(1).flush();
    await until(() => world.closedReason(1) !== undefined, "closed 1");
    expect(world.closedReason(1)).toBe(CONN_CLOSED_REASON.WorldRequested);
    expect(clients[0]!.ended).toBe(true);
    expect(clients[0]!.bytes().equals(m)).toBe(true);
    world.windowEnd().flush();
    await until(() => clients[1]!.written.length === 1, "2 flushed");
  });

  test("MULTICAST → SHUTDOWN: 미룬 바이트 뒤에 KICK", async () => {
    const { world, clients } = await rig(1);
    const m = chat("last words");
    world.multicast(m, [1, 1]).shutdown(KICK_REASON.ServerShutdown).flush();
    await until(() => clients[0]!.ended, "kicked");
    const frames = clients[0]!.frames();
    expect(frames.map((f) => f.id)).toEqual([PACKET_ID.CHAT_BCAST, PACKET_ID.CHAT_BCAST, PACKET_ID.KICK]);
  });

  test("MULTICAST 뒤 월드 유실: 미룬 바이트 뒤에 KICK 6 world unavailable", async () => {
    const { world, clients, destroyWorld } = await rig(1);
    world.multicast(chat("pending"), [1, 1]).flush();
    await until(() => metrics.gwMulticastRecords.value() > 0, "applied");
    await turns(3);
    destroyWorld();
    await until(() => clients[0]!.ended, "kicked");
    const frames = clients[0]!.frames();
    expect(frames.map((f) => f.id)).toEqual([PACKET_ID.CHAT_BCAST, PACKET_ID.CHAT_BCAST, PACKET_ID.KICK]);
    expect(frames[2]!.payload).toEqual({ reason: KICK_REASON.ServerShutdown, detail: "world unavailable" });
  });

  test("미룬 바이트가 있는 연결의 엣지 킥(oversize) — KICK이 미룬 바이트 뒤에 온다", async () => {
    const { world, clients } = await rig(1);
    world.multicast(chat("before kick"), [1, 1]).flush();
    await until(() => metrics.gwMulticastRecords.value() > 0, "applied");
    await turns(3);
    clients[0]!.send(headerOnly(PACKET_ID.PING, 0xffff));
    expect(clients[0]!.ended).toBe(true);
    expect(clients[0]!.frames().map((f) => f.id)).toEqual([PACKET_ID.CHAT_BCAST, PACKET_ID.CHAT_BCAST, PACKET_ID.KICK]);
  });

  test("부분 수신자 — 미추적 localId는 stale(type multicast)로 세고 나머지는 받는다, 종료 중 링크는 버린다", async () => {
    configureOutbound({ endFlushTimeoutMs: 60_000 });
    const { core, world, clients } = await rig(3);
    clients[2]!.writeCap = 0; // 커널 버퍼가 찬 클라 — 꼬리를 남긴 채 종료 대기(closing)
    world.deliver(3, pong(9)).flush();
    await until(() => core.connection(3)!.socket.pendingByteCount > 0, "tail kept");
    core.connection(3)!.socket.end();
    expect(core.connection(3)!.socket.closing).toBe(true);
    clients[1]!.peerClose();
    await until(() => world.closedReason(2) !== undefined, "2 closed");
    const stale = metrics.gwStaleRecords.value({ type: "multicast" });
    const rec = metrics.gwMulticastRecords.value();
    const rcp = metrics.gwMulticastRecipients.value();
    const m = chat("partial");
    world.multicast(m, [1, 2, 3, 77]).windowEnd().flush();
    await until(() => clients[0]!.written.length === 1, "1 served");
    expect(clients[0]!.bytes().equals(m)).toBe(true);
    expect(metrics.gwStaleRecords.value({ type: "multicast" }) - stale).toBe(2);
    expect(metrics.gwMulticastRecords.value() - rec).toBe(1);
    expect(metrics.gwMulticastRecipients.value() - rcp).toBe(4);
    expect(clients[2]!.written.length).toBe(0);
    expect(core.connection(3)!.socket.pendingByteCount).toBe(pong(9).length);
  });
});
