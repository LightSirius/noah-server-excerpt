// 성능 4.5 F3 — 월드 쪽 공유 프레임(세션 outbox 끝 참조 → RemoteClientLink.sharedRoute → GatewayPeer.deliverShared → CONN_DELIVER_SHARED).
//
// 계약:
//   - 공유 경로(링크에 공유 싱크 — IPC_SHARED=1): tick 동안 sessionManager.sendShared는 outbox에 참조만 두고, uncork가 게이트웨이 봉투에 DEF 1개 +
//     연결별 CONN_REF(인라인 + ackSeq)로 쓴다. 같은 프레임을 같은 피어의 여러 연결이 받으면 DEF는 봉투당 1개, 피어(게이트웨이)마다 따로.
//   - 끔(공유 싱크 없음 — IPC_SHARED=0): 세션이 복사·패치해 CONN_DELIVER — 클라 바이트 동일.
//   - 0x96 봉투가 열린 뒤의 평문 송신은 그 봉투의 CONN 레코드, 그 전은 CONN_DELIVER(봉투 전환 최소).
//   - 피어 유실: deliverShared false → 링크 종료 상태(연결별 경로와 같은 규칙). netPacketsTx는 논리 프레임마다(경로 무관).
//   - 메트릭: mmorpg_ipc_shared_{defs,refs,saved_bytes}_total(절감 = DEF를 재사용한 참조마다 프레임 − 9).

import { afterEach, describe, expect, test } from "bun:test";
import { GatewayPeer } from "../../../server/src/cluster/gatewayPeer";
import { createMemoryPipePair } from "../../../server/src/cluster/ipcPipe";
import { createWorldSideDecoder } from "../../../server/src/cluster/ipcCodec";
import { RemoteClientLink } from "../../../server/src/cluster/remoteClientLink";
import { PlayerSession, setSessionState } from "../../../server/src/network/session";
import { SessionManager } from "../../../server/src/network/sessionManager";
import { writePacket } from "../../../server/src/network/packetWriter";
import { SharedFrame } from "../../../server/src/net/sharedFrame";
import { PACKET_ID } from "../../../server/src/net/codec.generated";
import { DELTA_ACK_OFFSET } from "../../helpers/wire";
import { metrics, packetIdLabel } from "../../../server/src/obs/metrics";
import { GatewaySide, turns, until } from "./helpers/gatewaySide";
import { tagPong } from "../../helpers/fillers";

const DELTA = PACKET_ID.SNAPSHOT_DELTA;
const PONG = PACKET_ID.PONG;

function makePeer(gatewayId: number) {
  const [worldEnd, gwEnd] = createMemoryPipePair();
  const gw = new GatewaySide(gwEnd);
  const decoder = createWorldSideDecoder(() => {});
  worldEnd.attach({ data: (c) => decoder.push(c), close: () => {} });
  const peer = new GatewayPeer({ gatewayId, incarnation: 1, pid: 1 }, worldEnd, decoder, { onDirty: () => {} });
  peer.helloAck(1, 1);
  peer.flush();
  return { peer, gw };
}

let nextConn = 91_000;

function remote(sm: SessionManager, peer: GatewayPeer, localId: number, shared: boolean): PlayerSession {
  const s = new PlayerSession(
    (flush) => new RemoteClientLink(peer, localId, "198.51.100.3", flush, null, shared ? peer : null),
    ++nextConn,
  );
  setSessionState(s, "AUTHENTICATED");
  setSessionState(s, "IN_WORLD");
  s.playerId = localId + 2000;
  sm.addAuthenticated(s);
  return s;
}

const pid = (localId: number) => localId + 2000;

function delta(tag: number, entries = 8): SharedFrame {
  const f = new SharedFrame(DELTA_ACK_OFFSET);
  const updates = Array.from({ length: entries }, (_, i) => ({ entityId: tag + i, x: i, y: 1 }));
  f.bytes = Buffer.from(writePacket(DELTA, { tickIndex: 9, ackSeq: 0, updates }));
  return f;
}

function patched(f: SharedFrame, value: number): Buffer {
  const out = Buffer.from(f.bytes);
  out.writeUInt32LE(value >>> 0, DELTA_ACK_OFFSET);
  return out;
}

const pong = (t: string) => writePacket(PONG, tagPong(t));
const pongPayload = (t: string) => tagPong(t);

afterEach(async () => {
  await turns(2);
});

/** gw가 받은 deliver 레코드(envelope 번호·ref 여부 포함). */
function delivers(gw: GatewaySide) {
  return gw.recs.flatMap((r) => (r.t === "deliver" ? [r] : []));
}

describe("월드 공유 프레임 — 세션 → 피어 → CONN_DELIVER_SHARED", () => {
  test("같은 프레임을 연결 3개가 받으면 DEF 1개 + CONN_REF 3개(봉투 1개), 클라 바이트 = 각자 ackSeq로 패치", async () => {
    const sm = new SessionManager();
    const { peer, gw } = makePeer(1);
    for (const id of [1, 2, 3]) remote(sm, peer, id, true);
    const f = delta(10);
    const defs = metrics.ipcSharedDefs.value();
    const refs = metrics.ipcSharedRefs.value();
    const saved = metrics.ipcSharedSavedBytes.value();
    sm.withCork(() => {
      for (const id of [1, 2, 3]) sm.sendShared(pid(id), DELTA, f, 100 + id);
    });
    peer.flush();
    await until(() => delivers(gw).length === 3, "3 delivers");
    const recs = delivers(gw);
    expect(recs.map((r) => [r.localId, r.ref, r.env])).toEqual([
      [1, true, recs[0]!.env],
      [2, true, recs[0]!.env],
      [3, true, recs[0]!.env],
    ]);
    for (const id of [1, 2, 3]) expect(gw.bytesTo(id)).toEqual(patched(f, 100 + id));
    expect(metrics.ipcSharedDefs.value() - defs).toBe(1);
    expect(metrics.ipcSharedRefs.value() - refs).toBe(3);
    expect(metrics.ipcSharedSavedBytes.value() - saved).toBe(2 * (f.bytes.length - 9));
  });

  test("인라인(앞선 프레임)은 CONN_REF의 bytes로 — 참조 뒤에 붙은 프레임은 굳어서 평문", async () => {
    const sm = new SessionManager();
    const { peer, gw } = makePeer(1);
    for (const id of [1, 2]) remote(sm, peer, id, true);
    const f = delta(20);
    sm.withCork(() => {
      sm.sendTo(pid(1), PONG, pongPayload("a"));
      sm.sendShared(pid(1), DELTA, f, 1);
      sm.sendShared(pid(2), DELTA, f, 2);
      sm.sendTo(pid(2), PONG, pongPayload("late"));
    });
    peer.flush();
    await until(() => delivers(gw).length === 2, "delivers");
    expect(gw.bytesTo(1)).toEqual(Buffer.concat([pong("a"), patched(f, 1)]));
    expect(gw.bytesTo(2)).toEqual(Buffer.concat([patched(f, 2), pong("late")]));
    expect(delivers(gw).map((r) => r.ref ?? false)).toEqual([true, false]);
  });

  test("0x96 봉투가 열린 뒤 평문은 CONN 레코드(같은 봉투), 그 전 평문은 CONN_DELIVER", async () => {
    const sm = new SessionManager();
    const { peer, gw } = makePeer(1);
    for (const id of [1, 2, 3, 4]) remote(sm, peer, id, true);
    const f = delta(30);
    sm.withCork(() => {
      sm.sendTo(pid(1), PONG, pongPayload("before"));
      sm.sendShared(pid(2), DELTA, f, 2);
      sm.sendTo(pid(3), PONG, pongPayload("after"));
      sm.sendShared(pid(4), DELTA, f, 4);
    });
    peer.flush();
    await until(() => delivers(gw).length === 4, "delivers");
    const [a, b, c, d] = delivers(gw);
    expect(a!.env).not.toBe(b!.env);
    expect([b!.env, c!.env]).toEqual([d!.env, d!.env]);
    expect([a!.ref, b!.ref, c!.ref, d!.ref]).toEqual([undefined, true, undefined, true]);
    expect(gw.bytesTo(3)).toEqual(pong("after"));
  });

  test("게이트웨이 2개 — DEF는 피어마다 1개", async () => {
    const sm = new SessionManager();
    const a = makePeer(1);
    const b = makePeer(2);
    remote(sm, a.peer, 1, true);
    remote(sm, a.peer, 2, true);
    remote(sm, b.peer, 3, true);
    remote(sm, b.peer, 4, true);
    const f = delta(40);
    const defs = metrics.ipcSharedDefs.value();
    sm.withCork(() => {
      for (const id of [1, 2, 3, 4]) sm.sendShared(pid(id), DELTA, f, id);
    });
    a.peer.flush();
    b.peer.flush();
    await until(() => delivers(a.gw).length === 2 && delivers(b.gw).length === 2, "delivers");
    expect(metrics.ipcSharedDefs.value() - defs).toBe(2);
    expect(a.gw.bytesTo(2)).toEqual(patched(f, 2));
    expect(b.gw.bytesTo(3)).toEqual(patched(f, 3));
  });

  test("피어에 혼자인 참조는 평문 복사(DEF·CONN_REF 없음) — 같은 프레임이라도 2명인 피어는 참조", async () => {
    const sm = new SessionManager();
    const a = makePeer(1);
    const b = makePeer(2);
    remote(sm, a.peer, 1, true);
    remote(sm, a.peer, 2, true);
    remote(sm, b.peer, 3, true);
    const f = delta(45);
    const defs = metrics.ipcSharedDefs.value();
    const refs = metrics.ipcSharedRefs.value();
    sm.withCork(() => {
      for (const id of [1, 2, 3]) sm.sendShared(pid(id), DELTA, f, id);
    });
    a.peer.flush();
    b.peer.flush();
    await until(() => delivers(a.gw).length === 2 && delivers(b.gw).length === 1, "delivers");
    expect(delivers(a.gw).map((r) => r.ref)).toEqual([true, true]);
    expect(delivers(b.gw).map((r) => r.ref)).toEqual([undefined]);
    expect(b.gw.bytesTo(3)).toEqual(patched(f, 3));
    expect(metrics.ipcSharedDefs.value() - defs).toBe(1);
    expect(metrics.ipcSharedRefs.value() - refs).toBe(2);
  });

  test("혼자 남은 참조라도 봉투에 DEF가 이미 있으면 참조(재사용이 평문보다 싸다)", async () => {
    const sm = new SessionManager();
    const { peer, gw } = makePeer(1);
    for (const id of [1, 2, 3]) remote(sm, peer, id, true);
    const f = delta(46);
    sm.withCork(() => {
      for (const id of [1, 2, 3]) sm.sendShared(pid(id), DELTA, f, id);
    });
    peer.flush();
    await until(() => delivers(gw).length === 3, "delivers");
    expect(delivers(gw).map((r) => r.ref)).toEqual([true, true, true]);
  });

  test("끔(공유 싱크 없음) — 세션이 복사·패치해 CONN_DELIVER, 클라 바이트 동일·참조 0", async () => {
    const sm = new SessionManager();
    const { peer, gw } = makePeer(1);
    for (const id of [1, 2]) remote(sm, peer, id, false);
    const f = delta(50);
    const refs = metrics.ipcSharedRefs.value();
    sm.withCork(() => {
      sm.sendShared(pid(1), DELTA, f, 7);
      sm.sendShared(pid(2), DELTA, f, 8);
    });
    peer.flush();
    await until(() => delivers(gw).length === 2, "delivers");
    expect(gw.bytesTo(1)).toEqual(patched(f, 7));
    expect(gw.bytesTo(2)).toEqual(patched(f, 8));
    expect(delivers(gw).every((r) => r.ref === undefined)).toBe(true);
    expect(metrics.ipcSharedRefs.value() - refs).toBe(0);
  });

  test("피어 유실 — 공유 경로 false, 링크는 종료 상태로 고정(이후 송신 버림), 집계 없음", () => {
    const sm = new SessionManager();
    const { peer } = makePeer(1);
    const s = remote(sm, peer, 1, true);
    const label = { packet_id: packetIdLabel(DELTA) };
    const before = metrics.netPacketsTx.value(label);
    peer.kill("local");
    sm.withCork(() => sm.sendShared(pid(1), DELTA, delta(60), 1));
    expect(s.socket.closing).toBe(true);
    expect(metrics.netPacketsTx.value(label) - before).toBe(0);
  });

  test("netPacketsTx — 공유·끔 모두 수신자당 1", () => {
    const label = { packet_id: packetIdLabel(DELTA) };
    for (const shared of [true, false]) {
      const sm = new SessionManager();
      const { peer } = makePeer(1);
      for (const id of [1, 2, 3]) remote(sm, peer, id, shared);
      const f = delta(70);
      const before = metrics.netPacketsTx.value(label);
      sm.withCork(() => {
        for (const id of [1, 2, 3]) sm.sendShared(pid(id), DELTA, f, id);
      });
      expect(metrics.netPacketsTx.value(label) - before).toBe(3);
    }
  });
});
