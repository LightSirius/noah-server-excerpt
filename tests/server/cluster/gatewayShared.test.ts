// 성능 4.5 F3 — 게이트웨이 쪽 CONN_DELIVER_SHARED(공유 프레임 DEF + 연결별 CONN_REF 패치).
//
// 계약(ipcSchema — 게이트웨이):
//   - 연결 레코드 1개 = 그 연결의 송신 1건(CONN_DELIVER와 같은 위치·의미) — 클라 바이트 = 인라인 + DEF를 patchOff에 value로 패치한 것.
//   - write는 레코드당 1회: 인라인이 없고 미룬 MULTICAST도 없으면 DEF 뷰를 제자리 패치해 그대로(복사 0), 아니면 미룬 MULTICAST + 인라인 +
//     패치한 DEF를 재사용 scratch에 합쳐 1회(mmorpg_gw_deliver_assembled_bytes_total). 같은 DEF를 여러 연결이 다른 value로 받아도 섞이지
//     않는다(링크는 못 보낸 꼬리를 복사한다 — 다음 연결의 패치가 앞 연결 꼬리를 바꾸지 않는다).
//   - CONN 레코드 = DELIVER. 미추적 localId = stale(type deliver). 청크가 잘게 나뉘어 와도 같은 바이트.

import { afterEach, describe, expect, test } from "bun:test";
import { GatewayCore } from "../../../server/src/gateway/gatewayCore";
import type { GatewayConn } from "../../../server/src/gateway/gatewayConn";
import { type MemoryPipeOptions, createMemoryPipePair } from "../../../server/src/cluster/ipcPipe";
import { writePacket } from "../../../server/src/network/packetWriter";
import {
  DEFAULT_END_FLUSH_TIMEOUT_MS,
  DEFAULT_OUTBOUND_MAX_BYTES,
  configureOutbound,
} from "../../../server/src/network/outboundLink";
import { SharedFrame } from "../../../server/src/net/sharedFrame";
import { PACKET_ID } from "../../../server/src/net/codec.generated";
import { DELTA_ACK_OFFSET } from "../../helpers/wire";
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
}

async function rig(n: number, worldPipe?: MemoryPipeOptions): Promise<Rig> {
  const core = new GatewayCore({ gatewayId: 6, incarnation: 0xf3f3, pid: 1 });
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
  return { core, world, clients };
}

const pong = (n: number): Buffer => writePacket(PACKET_ID.PONG, tagPong(n));
const chat = (text: string): Buffer => writePacket(PACKET_ID.CHAT_BCAST, tagChat(text, "w"));

function delta(tag: number, entries = 1): SharedFrame {
  const f = new SharedFrame(DELTA_ACK_OFFSET);
  const updates = Array.from({ length: entries }, (_, i) => ({ entityId: tag + i, x: i, y: tag }));
  f.bytes = Buffer.from(writePacket(PACKET_ID.SNAPSHOT_DELTA, { tickIndex: 3, ackSeq: 0, updates }));
  return f;
}

function patched(f: SharedFrame, value: number): Buffer {
  const out = Buffer.from(f.bytes);
  out.writeUInt32LE(value >>> 0, DELTA_ACK_OFFSET);
  return out;
}

const assembled = () => metrics.gwDeliverAssembledBytes.value();

describe("CONN_DELIVER_SHARED — 게이트웨이 적용", () => {
  test("인라인 없는 참조 — 연결마다 write 1회, 자기 value로 패치한 프레임, 합치기 복사 0", async () => {
    const { world, clients } = await rig(3);
    const f = delta(100, 40);
    const before = assembled();
    const refsBefore = metrics.gwSharedRefs.value();
    const defsBefore = metrics.gwSharedDefs.value();
    world.shared(1, Buffer.alloc(0), f, 11).shared(2, Buffer.alloc(0), f, 22).shared(3, Buffer.alloc(0), f, 0xffffffff).flush();
    await until(() => clients.every((c) => c.written.length === 1), "1 write each");
    expect(clients[0]!.bytes()).toEqual(patched(f, 11));
    expect(clients[1]!.bytes()).toEqual(patched(f, 22));
    expect(clients[2]!.bytes()).toEqual(patched(f, 0xffffffff));
    expect(assembled() - before).toBe(0);
    expect(metrics.gwSharedRefs.value() - refsBefore).toBe(3);
    expect(metrics.gwSharedDefs.value() - defsBefore).toBe(1);
  });

  test("인라인 + 참조 — write 1회(합치기), 바이트 = 인라인 + 패치한 프레임", async () => {
    const { world, clients } = await rig(2);
    const f = delta(7);
    const inline = Buffer.concat([pong(1), pong(2)]);
    const before = assembled();
    world.shared(1, inline, f, 5).shared(2, Buffer.alloc(0), f, 6).flush();
    await until(() => clients.every((c) => c.written.length === 1), "writes");
    expect(clients[0]!.bytes()).toEqual(Buffer.concat([inline, patched(f, 5)]));
    expect(clients[1]!.bytes()).toEqual(patched(f, 6));
    expect(assembled() - before).toBe(inline.length + f.bytes.length);
  });

  test("미룬 MULTICAST 뒤 참조 — 미룬 바이트 + 인라인 + 패치한 프레임을 write 1회로", async () => {
    const { world, clients } = await rig(2);
    const f = delta(9);
    const m = chat("fanout");
    world.multicast(m, [1, 2]).shared(1, pong(3), f, 1).shared(2, Buffer.alloc(0), f, 2).windowEnd().flush();
    await until(() => clients.every((c) => c.written.length === 1), "writes");
    await turns(3);
    expect(clients.map((c) => c.written.length)).toEqual([1, 1]);
    expect(clients[0]!.bytes()).toEqual(Buffer.concat([m, pong(3), patched(f, 1)]));
    expect(clients[1]!.bytes()).toEqual(Buffer.concat([m, patched(f, 2)]));
  });

  test("0x96 봉투 안 평문 CONN 레코드 = DELIVER, 순서 = 레코드 순서", async () => {
    const { world, clients } = await rig(2);
    const f = delta(1);
    world.shared(1, Buffer.alloc(0), f, 1).deliver(2, pong(8)).deliver(1, pong(9)).flush();
    await until(() => clients[0]!.written.length === 2 && clients[1]!.written.length === 1, "writes");
    expect(clients[0]!.bytes()).toEqual(Buffer.concat([patched(f, 1), pong(9)]));
    expect(clients[1]!.bytes()).toEqual(pong(8));
  });

  test("부분 쓰기로 꼬리가 남은 연결 — 다음 연결의 패치가 그 꼬리를 바꾸지 않는다", async () => {
    const { world, clients } = await rig(2);
    const f = delta(50, 30);
    clients[0]!.writeCap = 5;
    world.shared(1, Buffer.alloc(0), f, 0x11111111).shared(2, Buffer.alloc(0), f, 0x22222222).flush();
    await until(() => clients[1]!.written.length === 1, "client 2 write");
    clients[0]!.writeCap = Number.POSITIVE_INFINITY;
    clients[0]!.drain();
    await until(() => clients[0]!.bytes().length === f.bytes.length, "client 1 drained");
    expect(clients[0]!.bytes()).toEqual(patched(f, 0x11111111));
    expect(clients[1]!.bytes()).toEqual(patched(f, 0x22222222));
  });

  test("미추적 localId는 stale(type deliver), 나머지는 받는다", async () => {
    const { world, clients } = await rig(1);
    const f = delta(2);
    const stale = metrics.gwStaleRecords.value({ type: "deliver" });
    world.shared(77, Buffer.alloc(0), f, 1).shared(1, Buffer.alloc(0), f, 2).flush();
    await until(() => clients[0]!.written.length === 1, "write");
    expect(clients[0]!.bytes()).toEqual(patched(f, 2));
    expect(metrics.gwStaleRecords.value({ type: "deliver" }) - stale).toBe(1);
  });

  test("청크가 97바이트로 잘게 나뉘어 와도 같은 바이트", async () => {
    const { world, clients } = await rig(3, { faults: { splitSeed: 0xf3, maxChunkBytes: 97 } });
    const f = delta(300, 60);
    world.shared(1, pong(1), f, 1).shared(2, Buffer.alloc(0), f, 2).shared(3, chat("c"), f, 3).flush();
    await until(() => clients.every((c) => c.written.length === 1), "writes");
    expect(clients[0]!.bytes()).toEqual(Buffer.concat([pong(1), patched(f, 1)]));
    expect(clients[1]!.bytes()).toEqual(patched(f, 2));
    expect(clients[2]!.bytes()).toEqual(Buffer.concat([chat("c"), patched(f, 3)]));
  });
});
