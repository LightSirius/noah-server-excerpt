// 성능 4.5 F2 — 월드 쪽 MULTICAST(sessionManager.sendMany → 게이트웨이 피어별 CONN_MULTICAST 레코드 1개).
//
// 계약:
//   - 묶음: sendMany의 원격 링크 수신자를 피어(CastSink)별로 모아, 수신자 2명 이상이고 바이트가 주는 피어는 레코드 1개, 나머지는
//     연결별 경로(writeOrEnqueue — 종전 바이트·순서 그대로). 실패(피어 유실·봉투 상한)도 연결별 경로로 폴백한다.
//   - 순서 규칙: outbox가 빈 수신자만 싣는다(앞선 프레임은 이미 피어 배치에, 뒤 프레임은 outbox → 뒤 DELIVER). outbox에 프레임이 있는
//     수신자·종료 중 링크·미인증 id는 종전 경로. 같은 id 중복 = 레코드에 중복(중복 송신 — sendTo 반복과 같다).
//   - 창 끝 표식: MULTICAST를 쓴 flush 창은 창 끝 flush(flushAll·종료)에서 CONN_FLUSH로 닫는다. 창 중간 임계 flush는 표식을 쓰지 않고
//     창 끝 flush를 다시 예약한다. MULTICAST 없는 창은 표식 없음(종전 바이트 그대로).
//   - 집계: netPacketsTx는 연결별 경로와 같은 수(수신자당 1), 신규 mmorpg_ipc_multicast_{records,recipients,saved_bytes}_total.
//   - monolith(로컬 링크)는 경로가 없어 종전 sendMany 그대로.

import { afterEach, describe, expect, test } from "bun:test";
import { GatewayPeer } from "../../../server/src/cluster/gatewayPeer";
import { createMemoryPipePair } from "../../../server/src/cluster/ipcPipe";
import { createWorldSideDecoder } from "../../../server/src/cluster/ipcCodec";
import { type PeerOutbound, RemoteClientLink } from "../../../server/src/cluster/remoteClientLink";
import type { CastSink } from "../../../server/src/network/clientLink";
import { PlayerSession, setSessionState } from "../../../server/src/network/session";
import { SessionManager } from "../../../server/src/network/sessionManager";
import { deferSends, flushDeferredSends } from "../../../server/src/network/deferredSends";
import { writePacket } from "../../../server/src/network/packetWriter";
import { PACKET_ID } from "../../../server/src/net/codec.generated";
import { metrics, packetIdLabel } from "../../../server/src/obs/metrics";
import type { LoginState } from "../../../server/src/identity/loginFlow";
import { GatewaySide, until } from "./helpers/gatewaySide";
import { tagChat, tagPong } from "../../helpers/fillers";

const CHAT = PACKET_ID.CHAT_BCAST;
const chat = (text: string) => tagChat(text, "gm");

/** 기록 순서를 남기는 피어 대역 — PeerOutbound + CastSink(GatewayPeer와 같은 표면). */
class FakePeer implements PeerOutbound, CastSink {
  readonly log: string[] = [];
  /** localId → 받은 바이트(스트림 순서 — DELIVER·MULTICAST 모두). */
  readonly streams = new Map<number, Buffer[]>();
  alive = true;
  refuseCast = false;
  deliver(localId: number, bytes: Uint8Array): boolean {
    if (!this.alive) return false;
    this.push(localId, bytes);
    this.log.push(`deliver:${localId}`);
    return true;
  }
  connState(localId: number, state: LoginState): void {
    if (this.alive) this.log.push(`state:${localId}:${state}`);
  }
  connClose(localId: number): void {
    if (this.alive) this.log.push(`close:${localId}`);
  }
  multicast(frame: Uint8Array, localIds: Uint32Array, count: number): boolean {
    if (!this.alive || this.refuseCast) return false;
    const list = [...localIds.subarray(0, count)];
    for (const id of list) this.push(id, frame);
    this.log.push(`cast:${list.join(",")}`);
    return true;
  }
  bytesTo(localId: number): Buffer {
    return Buffer.concat(this.streams.get(localId) ?? []);
  }
  private push(localId: number, bytes: Uint8Array): void {
    const list = this.streams.get(localId) ?? [];
    list.push(Buffer.from(bytes));
    this.streams.set(localId, list);
  }
}

let nextConn = 70_000;

/** 원격 링크 세션 — IN_WORLD, playerId = localId + 1000, sm에 인증 등록. cast=false면 MULTICAST 경로 없음(IPC_MULTICAST=0). */
function remote(sm: SessionManager, peer: FakePeer, localId: number, cast = true): PlayerSession {
  const s = new PlayerSession((flush) => new RemoteClientLink(peer, localId, "198.51.100.9", flush, cast ? peer : null), ++nextConn);
  const mark = peer.log.length;
  setSessionState(s, "AUTHENTICATED");
  setSessionState(s, "IN_WORLD");
  peer.log.length = mark; // 준비 단계의 STATE 기록은 시험 대상이 아니다.
  s.playerId = localId + 1000;
  sm.addAuthenticated(s);
  return s;
}

const pid = (localId: number) => localId + 1000;

/** MULTICAST를 켠 세션 관리자(월드 IPC 서버가 운영 싱글턴에 하는 일 — enableMulticast). */
function castingManager(): SessionManager {
  const sm = new SessionManager();
  sm.enableMulticast();
  return sm;
}

afterEach(() => {
  flushDeferredSends();
});

describe("sendMany — 게이트웨이 피어별 MULTICAST 묶음", () => {
  test("피어별로 묶는다: 2명 이상 = 레코드 1개(수신자 순서), 1명 = 연결별 DELIVER — 각 연결 바이트는 프레임 그대로", () => {
    const sm = castingManager();
    const a = new FakePeer();
    const b = new FakePeer();
    const c = new FakePeer();
    for (const id of [1, 2, 3]) remote(sm, a, id);
    for (const id of [4, 5]) remote(sm, b, id);
    remote(sm, c, 6);
    sm.sendMany([pid(3), pid(4), pid(1), pid(6), pid(5), pid(2)], CHAT, chat("hi"));
    const frame = writePacket(CHAT, chat("hi"));
    expect(a.log).toEqual(["cast:3,1,2"]);
    expect(b.log).toEqual(["cast:4,5"]);
    expect(c.log).toEqual(["deliver:6"]);
    for (const [peer, ids] of [[a, [1, 2, 3]], [b, [4, 5]], [c, [6]]] as const) {
      for (const id of ids) expect(peer.bytesTo(id).equals(frame)).toBe(true);
    }
  });

  test("미인증 id는 건너뛰고, 중복 id는 레코드에 중복(중복 송신 = sendTo 반복과 같다)", () => {
    const sm = castingManager();
    const a = new FakePeer();
    remote(sm, a, 1);
    remote(sm, a, 2);
    sm.sendMany([pid(1), 99_999, pid(1), pid(2)], CHAT, chat("dup"));
    expect(a.log).toEqual(["cast:1,1,2"]);
    const frame = writePacket(CHAT, chat("dup"));
    expect(a.bytesTo(1).equals(Buffer.concat([frame, frame]))).toBe(true);
  });

  test("순서 규칙 — outbox에 프레임이 있는 수신자는 MULTICAST에서 빠지고 outbox 뒤에 복사된다(DELIVER 레코드 수 불변)", () => {
    const sm = castingManager();
    const a = new FakePeer();
    const s1 = remote(sm, a, 1);
    remote(sm, a, 2);
    remote(sm, a, 3);
    const personal = writePacket(PACKET_ID.PONG, tagPong("1"));
    const frame = writePacket(CHAT, chat("x"));
    sm.withCork(() => {
      s1.send(PACKET_ID.PONG, tagPong("1"));
      sm.sendMany([pid(1), pid(2), pid(3)], CHAT, chat("x"));
      expect(a.log).toEqual(["cast:2,3"]);
    });
    expect(a.log).toEqual(["cast:2,3", "deliver:1"]);
    expect(a.bytesTo(1).equals(Buffer.concat([personal, frame]))).toBe(true);
  });

  test("tick 안: MULTICAST 뒤에 쌓인 프레임은 uncork의 DELIVER로 그 뒤에 온다", () => {
    const sm = castingManager();
    const a = new FakePeer();
    const s1 = remote(sm, a, 1);
    remote(sm, a, 2);
    const frame = writePacket(CHAT, chat("first"));
    const later = writePacket(PACKET_ID.PONG, tagPong("3"));
    sm.withCork(() => {
      sm.sendMany([pid(1), pid(2)], CHAT, chat("first"));
      s1.send(PACKET_ID.PONG, tagPong("3"));
    });
    expect(a.log).toEqual(["cast:1,2", "deliver:1"]);
    expect(a.bytesTo(1).equals(Buffer.concat([frame, later]))).toBe(true);
  });

  test("연결별 STATE/DELIVER/MULTICAST/CLOSE 순서 = 발행 순서(구간 밖 즉시 송신 + 상태 전이 + 종료)", () => {
    const sm = castingManager();
    const a = new FakePeer();
    const s1 = remote(sm, a, 1);
    remote(sm, a, 2);
    s1.send(PACKET_ID.PONG, tagPong("0"));
    sm.sendMany([pid(1), pid(2)], CHAT, chat("m1"));
    setSessionState(s1, "REJECT");
    sm.sendMany([pid(2), pid(1)], CHAT, chat("m2"));
    s1.socket.end();
    sm.sendMany([pid(1), pid(2)], CHAT, chat("m3")); // 종료 중 링크는 빠진다 — 2만 남아 연결별 경로
    expect(a.log).toEqual(["deliver:1", "cast:1,2", "state:1:REJECT", "cast:2,1", "close:1", "deliver:2"]);
  });

  test("수신 디스패치 구간: 코킹 안 된 수신자도 MULTICAST(턴 끝 대기 없음), 이후 개인 프레임은 턴 끝 DELIVER", () => {
    const sm = castingManager();
    const a = new FakePeer();
    const s1 = remote(sm, a, 1);
    remote(sm, a, 2);
    deferSends(() => {
      sm.sendMany([pid(1), pid(2)], CHAT, chat("d"));
      s1.send(PACKET_ID.PONG, tagPong("5"));
    });
    expect(a.log).toEqual(["cast:1,2"]);
    flushDeferredSends();
    expect(a.log).toEqual(["cast:1,2", "deliver:1"]);
  });

  test("피어가 MULTICAST를 거절(봉투 상한 등)하면 연결별 경로로 폴백 — 바이트 동일", () => {
    const sm = castingManager();
    const a = new FakePeer();
    a.refuseCast = true;
    remote(sm, a, 1);
    remote(sm, a, 2);
    sm.sendMany([pid(1), pid(2)], CHAT, chat("fb"));
    expect(a.log).toEqual(["deliver:1", "deliver:2"]);
    const frame = writePacket(CHAT, chat("fb"));
    expect(a.bytesTo(2).equals(frame)).toBe(true);
  });

  test("피어 유실 — MULTICAST 실패 → 연결별 경로가 링크를 종료 상태로(종전 send false 경로), 미집계", () => {
    const sm = castingManager();
    const a = new FakePeer();
    const s1 = remote(sm, a, 1);
    const s2 = remote(sm, a, 2);
    a.alive = false;
    const before = metrics.netPacketsTx.value({ packet_id: packetIdLabel(CHAT) });
    sm.sendMany([pid(1), pid(2)], CHAT, chat("lost"));
    expect([s1.socket.closing, s2.socket.closing]).toEqual([true, true]);
    expect(metrics.netPacketsTx.value({ packet_id: packetIdLabel(CHAT) })).toBe(before);
  });

  test("MULTICAST 경로 없음(IPC_MULTICAST=0 링크) = 종전 sendMany — 수신자마다 DELIVER", () => {
    const sm = castingManager();
    const a = new FakePeer();
    remote(sm, a, 1, false);
    remote(sm, a, 2, false);
    sm.sendMany([pid(1), pid(2)], CHAT, chat("off"));
    expect(a.log).toEqual(["deliver:1", "deliver:2"]);
  });

  test("꺼진 관리자(monolith — enableMulticast 전) = 종전 루프: 원격 링크에 경로가 있어도 묶지 않는다", () => {
    const sm = new SessionManager();
    const a = new FakePeer();
    remote(sm, a, 1);
    remote(sm, a, 2);
    sm.sendMany([pid(1), pid(2)], CHAT, chat("mono"));
    expect(a.log).toEqual(["deliver:1", "deliver:2"]);
  });

  test("netPacketsTx — MULTICAST도 수신자당 1(연결별 경로와 같은 수)", () => {
    const label = { packet_id: packetIdLabel(CHAT) };
    const count = (cast: boolean): number => {
      const sm = castingManager();
      const a = new FakePeer();
      for (const id of [1, 2, 3]) remote(sm, a, id, cast);
      const before = metrics.netPacketsTx.value(label);
      sm.withCork(() => sm.sendMany([pid(1), pid(2), pid(3), pid(1)], CHAT, chat("n")));
      return metrics.netPacketsTx.value(label) - before;
    };
    expect(count(true)).toBe(4);
    expect(count(false)).toBe(4);
  });
});

function makePeer(opts: { flushAtBytes?: number; maxEnvelopeBytes?: number } = {}) {
  const [worldEnd, gwEnd] = createMemoryPipePair();
  const gw = new GatewaySide(gwEnd);
  const decoder = createWorldSideDecoder(() => {});
  worldEnd.attach({ data: (c) => decoder.push(c), close: () => {} });
  const dirty: GatewayPeer[] = [];
  const peer = new GatewayPeer({ gatewayId: 4, incarnation: 1, pid: 1 }, worldEnd, decoder, {
    onDirty: (p) => void dirty.push(p),
    ...(opts.flushAtBytes !== undefined ? { flushAtBytes: opts.flushAtBytes } : {}),
    ...(opts.maxEnvelopeBytes !== undefined ? { writer: { maxEnvelopeBytes: opts.maxEnvelopeBytes } } : {}),
  });
  peer.helloAck(1, 1);
  peer.flush();
  return { peer, gw, worldEnd, dirty };
}

const ids = (...v: number[]) => Uint32Array.from(v);

describe("GatewayPeer.multicast — 레코드·창 끝 CONN_FLUSH·메트릭", () => {
  test("레코드 1개 + 창 끝 flush에 CONN_FLUSH, MULTICAST 없는 창은 표식 없음", async () => {
    const { peer, gw } = makePeer();
    const frame = writePacket(CHAT, chat("p"));
    expect(peer.multicast(frame, ids(7, 8, 9), 3)).toBe(true);
    peer.deliver(7, Buffer.from("tail"));
    peer.flush();
    await until(() => gw.recs.some((r) => r.t === "flush"), "flush marker");
    expect(gw.log().slice(1)).toEqual(["cast:7", "cast:8", "cast:9", "deliver:7", "flush"]);
    peer.deliver(8, Buffer.from("plain"));
    peer.flush();
    await until(() => gw.log().includes("deliver:8"), "plain deliver");
    expect(gw.log().slice(-1)).toEqual(["deliver:8"]);
  });

  test("창 중간 임계 flush는 표식을 쓰지 않고 창 끝 flush를 다시 예약한다", async () => {
    const { peer, gw, dirty } = makePeer({ flushAtBytes: 256 });
    const frame = writePacket(CHAT, chat("x".repeat(300)));
    dirty.length = 0;
    expect(peer.multicast(frame, ids(1, 2), 2)).toBe(true); // 임계 초과 → 즉시 flush(false)
    expect(peer.bufferedBytes).toBe(0);
    expect(dirty.length).toBeGreaterThanOrEqual(2); // 첫 기록 1회 + 창 끝 재예약
    await until(() => gw.log().includes("cast:2"), "cast");
    expect(gw.log().includes("flush")).toBe(false);
    peer.flush();
    await until(() => gw.log().includes("flush"), "flush marker");
    expect(gw.log().slice(-1)).toEqual(["flush"]);
  });

  test("거절 — 죽은 피어·바이트가 줄지 않는 묶음·봉투 상한 초과는 false(기록 없음)", () => {
    const tiny = makePeer({ maxEnvelopeBytes: 1024 });
    expect(tiny.peer.multicast(Buffer.alloc(1100, 1), ids(1, 2), 2)).toBe(false);
    expect(tiny.peer.multicast(Buffer.alloc(4, 1), ids(1, 2), 2)).toBe(false); // (2−1)·4 ≤ 6 + 8
    expect(tiny.peer.bufferedBytes).toBe(0);
    tiny.peer.kill("local");
    expect(tiny.peer.multicast(Buffer.alloc(64, 1), ids(1, 2), 2)).toBe(false);
  });

  test("65,535명 초과는 레코드를 나눈다 — 수신자 순서 보존", async () => {
    const { peer, gw } = makePeer();
    const n = 65_535 + 3;
    const list = Uint32Array.from({ length: n }, (_, i) => i + 1);
    expect(peer.multicast(Buffer.from("frame-bytes"), list, n)).toBe(true);
    peer.flush();
    await until(() => gw.recs.some((r) => r.t === "flush"), "flush", 10_000);
    const cast = gw.recs.flatMap((r) => (r.t === "cast" ? [r.localId] : []));
    expect(cast.length).toBe(n);
    expect(cast[65_535]).toBe(65_536);
    expect(cast.at(-1)).toBe(n);
  });

  test("메트릭 — 레코드·수신자·절감 바이트((r − 레코드)·F − 6·레코드 − 4·r)", () => {
    const { peer } = makePeer();
    const rec = metrics.ipcMulticastRecords.value();
    const rcp = metrics.ipcMulticastRecipients.value();
    const saved = metrics.ipcMulticastSavedBytes.value();
    peer.multicast(Buffer.alloc(100, 1), ids(1, 2, 3, 4), 4);
    expect(metrics.ipcMulticastRecords.value() - rec).toBe(1);
    expect(metrics.ipcMulticastRecipients.value() - rcp).toBe(4);
    expect(metrics.ipcMulticastSavedBytes.value() - saved).toBe(3 * 100 - 6 - 16);
  });
});
