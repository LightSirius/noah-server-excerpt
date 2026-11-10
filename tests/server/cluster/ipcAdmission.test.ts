// 성능 4.5 F1 — 게이트웨이 부하 기반 접속 제한의 IPC 절반(cluster/ipcSchema·ipcCodec·ipcPipe·gatewayPeer).
//
//   - IPC v3: W→G 0x85 ADMISSION {u8 state: 0 open · 1 busy} — 피어 단위(연결 순서 없음). HELLO 버전 협상은 그대로 엄격하다
//     (v2 게이트웨이는 version_mismatch → HELLO_NACK(version)).
//   - IpcPipe.writeUrgent: 대기열이 있으면 "전송 중인 머리 항목" 바로 뒤(앞서 넣은 긴급 항목들 뒤)에 끼운다 — 항목 1개 = flush 1회
//     = 봉투 경계라 봉투가 섞이지 않는다. 대기열이 비었으면 일반 쓰기. 긴급 항목끼리는 FIFO(ADMISSION 1 → 0 순서 보존).
//   - GatewayPeer 소프트 임계: flush 뒤 평가 — 파이프 대기 ≥ softBytes면 busy(그 순간 ADMISSION 1을 긴급으로), 대기 ≤ clearBytes가
//     holdMs 동안 이어지면 clear(ADMISSION 0). 그 사이(히스테리시스 띠)는 상태 유지.
//   - refuseOpen: 바쁜 피어의 새 localId 거절 — DELIVER(KICK 9 "server busy") + CONN_CLOSE를 긴급으로(그 localId엔 앞선 기록이 없다),
//     거절 목록은 게이트웨이의 CONN_CLOSED까지 — 그 사이 프레임·CONN_CLOSED는 stale이 아니다.

import { describe, expect, test } from "bun:test";
import { GatewayPeer, type PeerAdmissionPolicy } from "../../../server/src/cluster/gatewayPeer";
import { type MemoryPipe, createMemoryPipePair } from "../../../server/src/cluster/ipcPipe";
import {
  GatewayIpcWriter,
  IpcProtocolError,
  WorldIpcWriter,
  createGatewaySideDecoder,
  createWorldSideDecoder,
} from "../../../server/src/cluster/ipcCodec";
import { IPC_MSG, IPC_VERSION, type WorldToGatewayMsg } from "../../../server/src/cluster/ipcSchema";
import { KICK_REASON } from "../../../server/src/identity/loginFlow";
import { writePacket } from "../../../server/src/network/packetWriter";
import { PACKET_ID } from "../../../server/src/net/codec.generated";
import { GatewaySide, until } from "./helpers/gatewaySide";

function flushed(w: GatewayIpcWriter | WorldIpcWriter): Buffer {
  const out: Buffer[] = [];
  w.flushTo({ write: (buf) => out.push(Buffer.from(buf)) > 0 });
  return Buffer.concat(out);
}

function rawEnvelope(type: number, payload: number[]): Buffer {
  const p = Buffer.from(payload);
  const out = Buffer.alloc(5 + p.length);
  out.writeUInt32LE(1 + p.length, 0);
  out[4] = type;
  p.copy(out, 5);
  return out;
}

function errorKind(fn: () => void): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof IpcProtocolError) return err.kind;
    throw err;
  }
  throw new Error("expected IpcProtocolError");
}

function ackedGatewayDecoder(): { push(b: Buffer): void; msgs: WorldToGatewayMsg[] } {
  const msgs: WorldToGatewayMsg[] = [];
  const dec = createGatewaySideDecoder((m) => msgs.push(m));
  const ack = new WorldIpcWriter();
  ack.helloAck({ worldIncarnation: 1, connCap: 1 });
  dec.push(flushed(ack));
  msgs.length = 0;
  return { push: (b) => dec.push(b), msgs };
}

describe("IPC v3 — ADMISSION 메시지", () => {
  test("IPC_VERSION 3 이상(ADMISSION 도입 v3, 현재 v5) — ADMISSION open/busy 왕복(1바이트 payload)", () => {
    expect(IPC_VERSION).toBeGreaterThanOrEqual(3);
    const w = new WorldIpcWriter();
    w.admission(true);
    w.admission(false);
    const bytes = flushed(w);
    expect(bytes.length).toBe(2 * 6);
    const g = ackedGatewayDecoder();
    g.push(bytes);
    expect(g.msgs).toEqual([
      { type: IPC_MSG.ADMISSION, busy: true },
      { type: IPC_MSG.ADMISSION, busy: false },
    ]);
  });

  test("ADMISSION은 비배치 메시지 — 열린 DELIVER 봉투를 닫는다(배치 writer 안에서도 순서 보존)", () => {
    const w = new WorldIpcWriter();
    w.deliver(1, Buffer.from("a"));
    w.admission(true);
    w.deliver(1, Buffer.from("b"));
    const g = ackedGatewayDecoder();
    g.push(flushed(w));
    expect(g.msgs.map((m) => m.type)).toEqual([IPC_MSG.CONN_DELIVER, IPC_MSG.ADMISSION, IPC_MSG.CONN_DELIVER]);
  });

  test("레이아웃 위반 — state 2 이상·길이 불일치는 malformed, 월드 측이 받으면 wrong_direction, 핸드셰이크 전이면 handshake_expected", () => {
    expect(errorKind(() => ackedGatewayDecoder().push(rawEnvelope(IPC_MSG.ADMISSION, [2])))).toBe("malformed");
    expect(errorKind(() => ackedGatewayDecoder().push(rawEnvelope(IPC_MSG.ADMISSION, [])))).toBe("malformed");
    expect(errorKind(() => ackedGatewayDecoder().push(rawEnvelope(IPC_MSG.ADMISSION, [1, 0])))).toBe("malformed");
    const world = createWorldSideDecoder(() => {});
    const hello = new GatewayIpcWriter();
    hello.hello({ gatewayId: 1, incarnation: 1, pid: 1 });
    world.push(flushed(hello));
    expect(errorKind(() => world.push(rawEnvelope(IPC_MSG.ADMISSION, [1])))).toBe("wrong_direction");
    const fresh = createGatewaySideDecoder(() => {});
    expect(errorKind(() => fresh.push(rawEnvelope(IPC_MSG.ADMISSION, [0])))).toBe("handshake_expected");
  });

  test("HELLO 협상은 엄격 — v2 게이트웨이 HELLO는 version_mismatch(peerVersion 2)", () => {
    const hello = new GatewayIpcWriter();
    hello.hello({ gatewayId: 1, incarnation: 1, pid: 1 });
    const bytes = flushed(hello);
    bytes.writeUInt16LE(2, 5); // 봉투 머리 5바이트 뒤 = ipcVer
    const world = createWorldSideDecoder(() => {});
    try {
      world.push(bytes);
      throw new Error("expected version_mismatch");
    } catch (err) {
      expect(err).toBeInstanceOf(IpcProtocolError);
      expect([(err as IpcProtocolError).kind, (err as IpcProtocolError).peerVersion]).toEqual(["version_mismatch", 2]);
    }
  });
});

/** a(창 windowBytes) → b. b는 멈춰 둔다 — 첫 쓰기는 창만큼만 넘어가고 나머지는 a의 대기열. */
function stalledPair(windowBytes: number, maxPendingBytes?: number): { a: MemoryPipe; b: MemoryPipe; received: () => Buffer } {
  const [a, b] = createMemoryPipePair({
    a: { faults: { windowBytes }, ...(maxPendingBytes !== undefined ? { maxPendingBytes } : {}) },
  });
  const chunks: Buffer[] = [];
  a.attach({ data: () => {}, close: () => {} });
  b.attach({ data: (c) => void chunks.push(Buffer.from(c)), close: () => {} });
  b.pauseReceiving();
  return { a, b, received: () => Buffer.concat(chunks) };
}

describe("IpcPipe.writeUrgent — 봉투 경계에서 대기열 앞지르기", () => {
  test("대기열이 비었으면 일반 쓰기와 같다(즉시 전송·release 1회)", async () => {
    const { a, b, received } = stalledPair(1024);
    let released = 0;
    expect(a.writeUrgent(Buffer.from("urgent"), () => released++)).toBe(true);
    expect([a.pendingBytes, released]).toEqual([0, 1]);
    b.resumeReceiving();
    await until(() => received().length === 6, "urgent bytes");
    expect(received().toString()).toBe("urgent");
  });

  test("부분 전송 중인 머리 항목 뒤·뒤 항목들 앞 — 받는 순서 A, U, B(머리는 쪼개지지 않는다)", async () => {
    const { a, b, received } = stalledPair(1000);
    const A = Buffer.alloc(3000, 0x41);
    const B = Buffer.alloc(2000, 0x42);
    const U = Buffer.alloc(10, 0x55);
    a.write(A);
    a.write(B);
    expect(a.pendingBytes).toBe(4000); // A의 꼬리 2000 + B
    const released: string[] = [];
    expect(a.writeUrgent(U, () => released.push("U"))).toBe(true);
    expect(a.pendingBytes).toBe(4010);
    b.resumeReceiving();
    await until(() => received().length === 5010, "all bytes");
    expect(received()).toEqual(Buffer.concat([A, U, B]));
    expect(released).toEqual(["U"]);
    expect(a.pendingBytes).toBe(0);
  });

  test("긴급 항목끼리는 FIFO — 머리 뒤에 U1, U2 순서로(나중 긴급이 앞 긴급을 추월하지 않는다)", async () => {
    const { a, b, received } = stalledPair(100);
    const A = Buffer.alloc(500, 1);
    const B = Buffer.alloc(300, 2);
    a.write(A);
    a.write(B);
    a.writeUrgent(Buffer.from([0xa1]));
    a.writeUrgent(Buffer.from([0xa2]));
    a.write(Buffer.from([0xc3]));
    b.resumeReceiving();
    await until(() => received().length === 803, "all bytes");
    expect(received()).toEqual(Buffer.concat([A, Buffer.from([0xa1, 0xa2]), B, Buffer.from([0xc3])]));
  });

  test("대기 상한을 넘으면 일반 쓰기처럼 backpressure로 닫고 false, 닫힌 파이프는 false", () => {
    const { a } = stalledPair(100, 1000);
    a.write(Buffer.alloc(900, 1)); // 800 대기
    expect(a.writeUrgent(Buffer.alloc(300, 2))).toBe(false);
    expect([a.closed, a.closeReason]).toEqual([true, "backpressure"]);
    expect(a.writeUrgent(Buffer.from("x"))).toBe(false);
  });
});

function makePeer(windowBytes = 1000) {
  const [worldEnd, gwEnd] = createMemoryPipePair({ a: { faults: { windowBytes } } });
  const gw = new GatewaySide(gwEnd);
  const decoder = createWorldSideDecoder(() => {});
  worldEnd.attach({ data: (c) => decoder.push(c), close: () => {} });
  const peer = new GatewayPeer({ gatewayId: 4, incarnation: 1, pid: 2 }, worldEnd, decoder, { onDirty: () => {} });
  peer.helloAck(9, 100);
  peer.flush();
  return { peer, gw, worldEnd, gwEnd };
}

const POLICY: PeerAdmissionPolicy = { softBytes: 4000, clearBytes: 1000, holdMs: 100 };
const BUSY_KICK = writePacket(PACKET_ID.KICK, { reason: KICK_REASON.ServerFull, detail: "server busy" });

describe("GatewayPeer — 소프트 임계 상태 기계(대기 ≥ soft → busy, ≤ clear를 hold 동안 → clear)", () => {
  test("대기가 soft에 닿으면 busy + ADMISSION 1이 대기 중인 봉투들을 앞지른다(머리 봉투 뒤)", async () => {
    const { peer, gw, gwEnd } = makePeer();
    await until(() => gw.recs.length === 1, "hello_ack");
    gwEnd.pauseReceiving();
    for (let i = 0; i < 3; i++) {
      peer.deliver(1, Buffer.alloc(2000, i));
      peer.flush(); // flush 1회 = 봉투 1개 = 대기열 항목 1개
    }
    expect(peer.pipe.pendingBytes).toBeGreaterThanOrEqual(POLICY.softBytes);
    expect(peer.admissionBusy).toBe(false);
    expect(peer.evaluateAdmission(POLICY, 0)).toBe("busy");
    expect(peer.admissionBusy).toBe(true);
    expect(peer.evaluateAdmission(POLICY, 1)).toBeNull(); // 이미 busy
    gwEnd.resumeReceiving();
    await until(() => gw.recs.length === 5, "3 deliveries + admission");
    expect(gw.log()).toEqual(["hello_ack", "deliver:1", "admission:busy", "deliver:1", "deliver:1"]);
  });

  test("clear는 대기 ≤ clearBytes가 holdMs 동안 이어져야 — 띠 안(clear < 대기 < soft)이면 유지, 다시 오르면 hold 재시작", async () => {
    const { peer, gw, gwEnd } = makePeer(500);
    await until(() => gw.recs.length === 1, "hello_ack");
    gwEnd.pauseReceiving();
    peer.deliver(1, Buffer.alloc(5000, 1));
    peer.flush();
    expect(peer.evaluateAdmission(POLICY, 0)).toBe("busy");
    gwEnd.resumeReceiving();
    await until(() => peer.pipe.pendingBytes === 0, "drained");
    expect(peer.evaluateAdmission(POLICY, 10)).toBeNull(); // hold 시작
    expect(peer.evaluateAdmission(POLICY, 109)).toBeNull();
    gwEnd.pauseReceiving();
    peer.deliver(1, Buffer.alloc(2500, 2)); // 띠 안: 2000 대기(> clear, < soft)
    peer.flush();
    expect(peer.evaluateAdmission(POLICY, 115)).toBeNull();
    expect(peer.admissionBusy).toBe(true);
    gwEnd.resumeReceiving();
    await until(() => peer.pipe.pendingBytes === 0, "drained again");
    expect(peer.evaluateAdmission(POLICY, 120)).toBeNull(); // hold 재시작(120)
    expect(peer.evaluateAdmission(POLICY, 219)).toBeNull();
    expect(peer.evaluateAdmission(POLICY, 220)).toBe("clear");
    expect(peer.admissionBusy).toBe(false);
    await until(() => gw.log().includes("admission:open"), "admission open");
    expect(gw.log().filter((l) => l.startsWith("admission"))).toEqual(["admission:busy", "admission:open"]);
  });

  test("refuseOpen — 바쁜 피어의 새 localId: KICK 9 'server busy' + CONN_CLOSE를 긴급으로, CONN_CLOSED까지 거절 목록", async () => {
    const { peer, gw, gwEnd } = makePeer();
    await until(() => gw.recs.length === 1, "hello_ack");
    gwEnd.pauseReceiving();
    for (let i = 0; i < 3; i++) {
      peer.deliver(1, Buffer.alloc(2000, i));
      peer.flush();
    }
    expect(peer.evaluateAdmission(POLICY, 0)).toBe("busy");
    expect(peer.admitLocalId(7)).toBe(true);
    peer.refuseOpen(7, BUSY_KICK);
    expect(peer.isRefused(7)).toBe(true);
    gwEnd.resumeReceiving();
    await until(() => gw.recs.length === 7, "all records");
    expect(gw.log()).toEqual(["hello_ack", "deliver:1", "admission:busy", "deliver:7", "close:7", "deliver:1", "deliver:1"]);
    expect(gw.framesTo(7)).toEqual([{ id: PACKET_ID.KICK, payload: { reason: KICK_REASON.ServerFull, detail: "server busy" } }]);
    expect(peer.forgetRefused(7)).toBe(true);
    expect(peer.forgetRefused(7)).toBe(false);
    expect(peer.isRefused(7)).toBe(false);
  });

  test("죽은 피어는 평가하지 않는다(전이 없음·기록 없음)", () => {
    const { peer } = makePeer();
    peer.kill("local");
    expect(peer.evaluateAdmission({ softBytes: 0, clearBytes: 0, holdMs: 0 }, 0)).toBeNull();
    expect(peer.admissionBusy).toBe(false);
  });
});
