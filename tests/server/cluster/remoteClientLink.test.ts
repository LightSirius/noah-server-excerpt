// 성능 4단계 4.2b — 월드 쪽 원격 세션 링크(RemoteClientLink): 게이트웨이 경유 연결의 ClientLink 구현.
//
// 계약(clientLink.ts + 4단계 설계):
//   - send → 피어 배치에 CONN_DELIVER 레코드(완성 프레임). 피어 유실이면 false + 이후 송신 거절(OutboundLink의 닫힌 소켓
//     -1과 같은 "기존 종료 경로" — 세션 정리는 피어 유실 처리(closeSessions)가 한다).
//   - end → 세션 outbox를 먼저 보낸 뒤(beforeEnd) CONN_CLOSE — 앞서 보낸 바이트 뒤에 닫힌다. idempotent.
//   - setState → 세션 outbox를 먼저 보낸 뒤 CONN_STATE — 연결별 STATE/DELIVER/CLOSE 순서 = 세션 발행 순서.
//   - dispose(게이트웨이가 이미 닫음 — CONN_CLOSED) → 이후 송신·CONN_CLOSE 없음.
//   - exceedsBacklogCap: 세션 지연 outbox만 본다(OUTBOUND_MAX_BYTES) — IPC 백프레셔는 게이트웨이(파이프) 단위.

import { afterEach, describe, expect, test } from "bun:test";
import { type PeerOutbound, RemoteClientLink } from "../../../server/src/cluster/remoteClientLink";
import { PlayerSession, setSessionState } from "../../../server/src/network/session";
import { deferSends, flushDeferredSends } from "../../../server/src/network/deferredSends";
import { configureOutbound, DEFAULT_OUTBOUND_MAX_BYTES } from "../../../server/src/network/outboundLink";
import { writePacket } from "../../../server/src/network/packetWriter";
import { PACKET_ID, PROTO_VERSION } from "../../../server/src/net/codec.generated";
import type { LoginState } from "../../../server/src/identity/loginFlow";
import { encodeRaw } from "../../helpers/wire";

class FakePeer implements PeerOutbound {
  readonly log: string[] = [];
  readonly bytes: Buffer[] = [];
  alive = true;
  deliver(localId: number, bytes: Uint8Array): boolean {
    if (!this.alive) return false;
    this.bytes.push(Buffer.from(bytes));
    this.log.push(`deliver:${localId}:${bytes.length}`);
    return true;
  }
  connState(localId: number, state: LoginState): void {
    if (this.alive) this.log.push(`state:${localId}:${state}`);
  }
  connClose(localId: number): void {
    if (this.alive) this.log.push(`close:${localId}`);
  }
}

function link(peer: FakePeer, flush: (() => void) | null = null): RemoteClientLink {
  return new RemoteClientLink(peer, 7, "203.0.113.4", flush);
}

const PING = PACKET_ID.PING;
/** 링크 시험 필러 — 링크는 프레임 내용을 보지 않는다: 형식 무관 원시 본문 프레임(바이너리 flip에도 의도 유지). */
const raw = (tag = ""): Buffer => encodeRaw(PING, Buffer.from(tag, "utf8"));
/** 세션 송신 필러(S2C) — 스키마에 맞는 PONG(JSON·바이너리 어느 쪽이든 유효). */
const pong = (n: number) => ({ clientTimeMs: n, serverTimeMs: 0 });

afterEach(() => {
  flushDeferredSends();
  configureOutbound({ maxBytes: DEFAULT_OUTBOUND_MAX_BYTES });
});

describe("RemoteClientLink — 링크 단독", () => {
  test("send = 피어 DELIVER 레코드(복사), 빈 버퍼는 기록 없이 true, remoteAddress는 CONN_OPEN 주소", () => {
    const peer = new FakePeer();
    const l = link(peer);
    const frame = raw("1");
    expect(l.send(frame, PING, 1)).toBe(true);
    expect(l.send(Buffer.alloc(0), PING, 0)).toBe(true);
    expect(peer.log).toEqual([`deliver:7:${frame.length}`]);
    expect(peer.bytes[0]!.equals(frame)).toBe(true);
    expect(l.remoteAddress).toBe("203.0.113.4");
    expect(l.closing).toBe(false);
  });

  test("피어 유실 — send false, 링크 종료 상태로 고정(이후 피어 무접촉), end도 CONN_CLOSE 없음", () => {
    const peer = new FakePeer();
    const l = link(peer);
    peer.alive = false;
    expect(l.send(raw(), PING, 1)).toBe(false);
    expect(l.closing).toBe(true);
    peer.alive = true;
    expect(l.send(raw(), PING, 1)).toBe(false);
    l.end();
    l.setState("IN_WORLD");
    expect(peer.log).toEqual([]);
  });

  test("end — beforeEnd(세션 outbox flush) 뒤 CONN_CLOSE 1회, 이후 send false·재호출 무동작", () => {
    const peer = new FakePeer();
    const l: RemoteClientLink = link(peer, () => void l.send(raw("tail"), PING, 1));
    l.end();
    l.end();
    expect(peer.log.map((e) => e.split(":")[0])).toEqual(["deliver", "close"]);
    expect(l.closing).toBe(true);
    expect(l.send(raw(), PING, 1)).toBe(false);
    expect(peer.log.length).toBe(2);
  });

  test("end 전 flush가 피어 유실을 만나면 CONN_CLOSE를 쓰지 않는다", () => {
    const peer = new FakePeer();
    const l: RemoteClientLink = link(peer, () => {
      peer.alive = false;
      l.send(raw(), PING, 1);
    });
    l.end();
    expect(peer.log).toEqual([]);
    expect(l.closing).toBe(true);
  });

  test("beforeEnd가 던져도 CONN_CLOSE는 나간다(OutboundLink와 같은 규칙)", () => {
    const peer = new FakePeer();
    const l = link(peer, () => {
      throw new Error("flush boom");
    });
    l.end();
    expect(peer.log).toEqual(["close:7"]);
  });

  test("setState — 세션 outbox를 먼저 보낸 뒤 CONN_STATE, 종료 중이면 무동작", () => {
    const peer = new FakePeer();
    let pending = true;
    const l: RemoteClientLink = link(peer, () => {
      if (pending) l.send(raw(), PING, 1);
      pending = false;
    });
    l.setState("HELLO_RECV");
    expect(peer.log.map((e) => e.split(":")[0])).toEqual(["deliver", "state"]);
    expect(peer.log[1]).toBe("state:7:HELLO_RECV");
    l.end();
    l.setState("AUTHENTICATED");
    expect(peer.log.at(-1)).toBe("close:7");
  });

  test("dispose — 게이트웨이가 이미 닫았다: 이후 send false, end·setState는 무동작", () => {
    const peer = new FakePeer();
    const l = link(peer);
    l.dispose();
    l.dispose();
    expect(l.closing).toBe(true);
    expect(l.send(raw(), PING, 1)).toBe(false);
    l.end();
    l.setState("REJECT");
    expect(peer.log).toEqual([]);
  });

  test("exceedsBacklogCap — 세션 지연 outbox 크기만 OUTBOUND_MAX_BYTES와 비교, flush는 무동작", () => {
    configureOutbound({ maxBytes: 1000 });
    const l = link(new FakePeer());
    expect(l.exceedsBacklogCap(1000)).toBe(false);
    expect(l.exceedsBacklogCap(1001)).toBe(true);
    l.flush();
  });
});

describe("PlayerSession over RemoteClientLink — 발행 순서", () => {
  function remoteSession(peer: FakePeer): PlayerSession {
    return new PlayerSession((flush) => new RemoteClientLink(peer, 9, "198.51.100.2", flush), 88_001);
  }

  test("구간 안 send A → 상태 전이 → send B → end: DELIVER(A) STATE DELIVER(B) CLOSE", () => {
    const peer = new FakePeer();
    const s = remoteSession(peer);
    const a = writePacket(PACKET_ID.PONG, pong(1));
    const b = writePacket(PACKET_ID.PONG, pong(2));
    deferSends(() => {
      s.send(PACKET_ID.PONG, pong(1));
      setSessionState(s, "HELLO_RECV");
      s.send(PACKET_ID.PONG, pong(2));
    });
    // B는 턴 끝까지 세션 outbox에 — end가 먼저 보낸다.
    expect(peer.log).toEqual([`deliver:9:${a.length}`, "state:9:HELLO_RECV"]);
    s.socket.end();
    expect(peer.log).toEqual([`deliver:9:${a.length}`, "state:9:HELLO_RECV", `deliver:9:${b.length}`, "close:9"]);
    expect(Buffer.concat(peer.bytes).equals(Buffer.concat([a, b]))).toBe(true);
    flushDeferredSends(); // 늦은 턴 끝 flush는 무동작.
    expect(peer.log.length).toBe(4);
  });

  test("상태 전이가 응답보다 먼저(핸들러 규약) — STATE 뒤 응답 DELIVER는 턴 끝에", async () => {
    const peer = new FakePeer();
    const s = remoteSession(peer);
    deferSends(() => {
      setSessionState(s, "HELLO_RECV");
      s.send(PACKET_ID.HELLO_ACK, { serverProtoVer: PROTO_VERSION, serverTimeMs: 0, sessionNonce: "n" });
    });
    expect(peer.log).toEqual(["state:9:HELLO_RECV"]);
    await new Promise<void>((r) => setImmediate(r));
    expect(peer.log.map((e) => e.split(":")[0])).toEqual(["state", "deliver"]);
  });

  test("피어 유실 중 송신은 netPacketsTx 미집계 대상(send false) — 세션은 예외 없이 계속", () => {
    const peer = new FakePeer();
    const s = remoteSession(peer);
    peer.alive = false;
    s.send(PACKET_ID.PONG, pong(1));
    expect(s.socket.closing).toBe(true);
    s.send(PACKET_ID.PONG, pong(1));
    expect(peer.log).toEqual([]);
  });
});
