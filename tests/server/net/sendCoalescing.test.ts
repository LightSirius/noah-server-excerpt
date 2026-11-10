// 이동동기화 후속 — per-tick 송신 코얼레싱 계약.
//
// 배경: TCP_NODELAY 활성화 후 "패킷 1개 = socket.write 1회 = 세그먼트 1개"가 되어
// 혼잡 존 팬아웃(스폰/디스폰/데미지…) 시 pps·헤더 오버헤드가 증폭된다(양 리뷰 MEDIUM).
// sessionManager.withCork(tickFn)가 tick 동안 세션별 프레임을 outbox에 모아
// tick 말미 1회 write로 묶는다. 와이어 바이트는 프레임 연접과 동일(클라 파서는 스트림 기반).
//
// 계약:
//   - 비코킹 send = 즉시 write 1회/패킷 (off-tick 핸들러 경로, 종전 동일).
//   - cork 중 send N회 = write 0회 → uncork 시 1회, 바이트는 개별 프레임 연접과 동일.
//   - 부분 쓰기는 세션을 끊지 않고 꼬리로 보관(1-C(3) 백프레셔 — 상세 계약은
//     outboundBackpressure.test.ts). 종전 "부분 쓰기 = 종료"(리뷰 #22)는 의도적으로 대체됨.
//   - withCork는 fn 예외에도 세션별 uncork를 보장.

import { describe, expect, test } from "bun:test";
import { PlayerSession } from "../../../server/src/network/session";
import { SessionManager } from "../../../server/src/network/sessionManager";
import { writePacket } from "../../../server/src/network/packetWriter";
import { PACKET_ID } from "../../../server/src/net/codec.generated";
import { metrics, packetIdLabel } from "../../../server/src/obs/metrics";
import { tagChat, tagPong } from "../../helpers/fillers";

function fakeSocket(opts?: { partialOnWrite?: number }) {
  const writes: Buffer[] = [];
  let ended = false;
  const sock = {
    write(buf: Buffer): number {
      writes.push(Buffer.from(buf));
      if (opts?.partialOnWrite === writes.length) return buf.length - 1;
      return buf.length;
    },
    end(): void {
      ended = true;
    },
    remoteAddress: "127.0.0.1",
    data: undefined,
  };
  return {
    sock: sock as unknown as Bun.Socket<PlayerSession>,
    writes,
    isEnded: () => ended,
  };
}

// 필러: PING·PONG = 바이너리 본문(B2b·B3b — 스키마에 맞는 값만, PONG은 tests/helpers/fillers tagPong), CHARS = 가변 문자열 원소 배열 S2C
// (CHAR_LIST — B5①b. 종전 JSON 경로 대표 CHAR_STATS_FULL의 자리 — 스키마 패킷이 전부 바이너리가 되어 코얼레싱 혼합은 인코딩과 무관하게 본다).
const PING = PACKET_ID.PING;
const PONG = PACKET_ID.PONG;
const CHARS = PACKET_ID.CHAR_LIST;
const ping = (t: number) => ({ clientTimeMs: t });
const chars = (name: string) => ({ chars: [{ charId: 1, name, level: 2, zoneId: 1 }] });
const pong = tagPong;

describe("PlayerSession — cork/uncork", () => {
  test("비코킹 send는 즉시 write 1회/패킷", () => {
    const { sock, writes } = fakeSocket();
    const s = new PlayerSession(sock, 1);
    s.send(PING, ping(1));
    s.send(PONG, pong(2));
    expect(writes.length).toBe(2);
  });

  test("cork 중 send N회 → write 0회, uncork 시 1회 + 바이트는 프레임 연접과 동일", () => {
    const { sock, writes } = fakeSocket();
    const s = new PlayerSession(sock, 1);
    s.cork();
    s.send(PING, ping(1));
    s.send(PONG, pong(2));
    s.send(PING, ping(3));
    expect(writes.length).toBe(0);
    s.uncork();
    expect(writes.length).toBe(1);
    const expected = Buffer.concat([
      writePacket(PING, ping(1)),
      writePacket(PONG, pong(2)),
      writePacket(PING, ping(3)),
    ]);
    expect(writes[0]!.equals(expected)).toBe(true);
  });

  test("cork 중 프레임 0건이면 uncork는 write하지 않음", () => {
    const { sock, writes } = fakeSocket();
    const s = new PlayerSession(sock, 1);
    s.cork();
    s.uncork();
    expect(writes.length).toBe(0);
  });

  test("uncork 후에는 다시 즉시 write 모드", () => {
    const { sock, writes } = fakeSocket();
    const s = new PlayerSession(sock, 1);
    s.cork();
    s.send(PING, ping(0));
    s.uncork();
    s.send(PONG, pong(0));
    expect(writes.length).toBe(2);
  });

  test("코얼레싱 flush 부분 쓰기 → 세션 유지 + 꼬리 보관, drain이 이어 써 바이트 완전", () => {
    const { sock, writes, isEnded } = fakeSocket({ partialOnWrite: 1 });
    const s = new PlayerSession(sock, 1);
    s.cork();
    s.send(PING, ping(1));
    s.uncork();
    expect(isEnded()).toBe(false);
    expect(s.socket.pendingByteCount).toBe(1);
    s.socket.flush();
    expect(s.socket.pendingByteCount).toBe(0);
    // 1차 write(마지막 1바이트 미송신) + drain write(꼬리 1바이트) = 프레임 원본.
    const sent = Buffer.concat([writes[0]!.subarray(0, writes[0]!.length - 1), writes[1]!]);
    expect(sent.equals(writePacket(PING, ping(1)))).toBe(true);
  });
});

describe("SessionManager.withCork", () => {
  function makeAuthed(mgr: SessionManager, playerId: number) {
    const f = fakeSocket();
    // connId는 playerId와 별개 식별자 — 겹치지 않게 대역 분리(리뷰 가독성 지적).
    const s = new PlayerSession(f.sock, 1000 + playerId);
    s.playerId = playerId;
    mgr.addAuthenticated(s);
    return { ...f, session: s };
  }

  test("tick 중 다건 sendTo가 세션별 1 write로 묶인다", () => {
    const mgr = new SessionManager();
    const a = makeAuthed(mgr, 1);
    const b = makeAuthed(mgr, 2);
    mgr.withCork(() => {
      mgr.sendTo(1, PING, ping(1));
      mgr.sendTo(1, PONG, pong(2));
      mgr.sendTo(1, PING, ping(3));
      mgr.sendTo(2, PING, ping(4));
      expect(a.writes.length).toBe(0);
      expect(b.writes.length).toBe(0);
    });
    expect(a.writes.length).toBe(1);
    expect(b.writes.length).toBe(1);
  });

  test("fn 예외에도 uncork가 수행된다(프레임 유실 없음)", () => {
    const mgr = new SessionManager();
    const a = makeAuthed(mgr, 1);
    expect(() =>
      mgr.withCork(() => {
        mgr.sendTo(1, PING, ping(1));
        throw new Error("tick failed");
      }),
    ).toThrow("tick failed");
    expect(a.writes.length).toBe(1);
  });

  test("withCork 밖 sendTo는 종전대로 즉시 write", () => {
    const mgr = new SessionManager();
    const a = makeAuthed(mgr, 1);
    mgr.sendTo(1, PING, ping(0));
    mgr.sendTo(1, PONG, pong(0));
    expect(a.writes.length).toBe(2);
  });

  test("tick 중 authenticated에서 빠진 세션도 캡처 집합으로 uncork된다(영구 corked 방지)", () => {
    const mgr = new SessionManager();
    const a = makeAuthed(mgr, 1);
    mgr.withCork(() => {
      mgr.sendTo(1, PING, ping(1));
      mgr.removeConnection(a.session); // tick 중 제거(현재 도달 불가 경로의 미래 가드)
    });
    // 캡처 배열 기반 uncork — 큐된 프레임이 유실되지 않고 flush된다.
    expect(a.writes.length).toBe(1);
    // 이후 send는 즉시 write 모드(outbox 잔존 없음).
    a.session.send(PONG, pong(0));
    expect(a.writes.length).toBe(2);
  });
});

// 성능 3단계 슬라이스 4: withCork는 tick마다 세션 배열을 복사하지 않고 재사용 버퍼에 캡처한다.
// 버퍼 재사용이 "cork한 집합 = uncork하는 집합" 불변식을 깨면(이전 tick 잔재·중첩 호출 덮어쓰기) 세션이
// 영구 corked로 남아 송신이 멈춘다 — 그 두 경우를 고정한다.
describe("SessionManager.withCork — 캡처 버퍼 재사용", () => {
  function makeAuthed(mgr: SessionManager, playerId: number) {
    const f = fakeSocket();
    const s = new PlayerSession(f.sock, 2000 + playerId);
    s.playerId = playerId;
    mgr.addAuthenticated(s);
    let uncorks = 0;
    const orig = s.uncork.bind(s);
    s.uncork = () => {
      uncorks++;
      orig();
    };
    return { ...f, session: s, uncorks: () => uncorks };
  }

  test("세션 수가 줄어든 다음 tick은 빠진 세션을 다시 uncork하지 않는다(이전 캡처 잔재 없음)", () => {
    const mgr = new SessionManager();
    const a = makeAuthed(mgr, 1);
    const b = makeAuthed(mgr, 2);
    const c = makeAuthed(mgr, 3);
    mgr.withCork(() => {});
    expect([a.uncorks(), b.uncorks(), c.uncorks()]).toEqual([1, 1, 1]);
    mgr.removeConnection(b.session);
    mgr.removeConnection(c.session);
    mgr.withCork(() => mgr.sendTo(1, PING, ping(1)));
    expect([a.uncorks(), b.uncorks(), c.uncorks()]).toEqual([2, 1, 1]);
    expect(a.writes.length).toBe(1);
  });

  test("중첩 withCork가 바깥 캡처 집합을 덮어쓰지 않는다 — 바깥에서 빠진 세션도 flush", () => {
    const mgr = new SessionManager();
    const a = makeAuthed(mgr, 1);
    const b = makeAuthed(mgr, 2);
    mgr.withCork(() => {
      mgr.sendTo(2, PING, ping(1));
      mgr.removeConnection(b.session);
      mgr.withCork(() => {}); // 안쪽 캡처는 a뿐.
    });
    expect(b.uncorks()).toBe(1);
    expect(b.writes.length).toBe(1); // 큐된 프레임 유실 없음.
    b.session.send(PONG, pong(0));
    expect(b.writes.length).toBe(2); // 영구 corked 아님.
    expect(a.uncorks()).toBe(2);
  });

  test("fn 예외 후 다음 withCork도 정상(캡처 상태 복구)", () => {
    const mgr = new SessionManager();
    const a = makeAuthed(mgr, 1);
    expect(() =>
      mgr.withCork(() => {
        throw new Error("tick failed");
      }),
    ).toThrow("tick failed");
    mgr.withCork(() => mgr.sendTo(1, PING, ping(2)));
    expect(a.uncorks()).toBe(2);
    expect(a.writes.length).toBe(1);
  });
});

// 성능 3단계 슬라이스 5: outbox가 세션당 늘어나는 Buffer 1개로 바뀌고 tick마다 재사용된다. 링크가 꼬리·대기 프레임을
// 복사해 보관하므로 재사용이 이미 링크에 넘긴 바이트를 덮지 않아야 하고, netPacketsTx는 종전처럼 링크가 수락한 프레임마다
// packet_id별 1회 집계해야 한다.
describe("PlayerSession — 재사용 outbox(슬라이스 5)", () => {
  const SNAP = PACKET_ID.SNAPSHOT_DELTA;
  const snap = (t: number) => ({ tickIndex: t, ackSeq: t + 1, updates: [{ entityId: t, x: 1.5, y: -2.25 }] });

  test("가변 본문(CHAR_LIST)·고정 본문(SNAPSHOT_DELTA·PING)·미리 인코딩한 프레임 혼합 → 1 write = writePacket 연접", () => {
    const { sock, writes } = fakeSocket();
    const s = new PlayerSession(sock, 1);
    s.cork();
    s.send(SNAP, snap(7));
    s.writeOrEnqueue(PONG, writePacket(PONG, pong("built")));
    s.send(CHARS, chars("한글값"));
    s.send(PING, ping(2.5));
    s.uncork();
    const want = Buffer.concat([
      writePacket(SNAP, snap(7)),
      writePacket(PONG, pong("built")),
      writePacket(CHARS, chars("한글값")),
      writePacket(PING, ping(2.5)),
    ]);
    expect(writes.length).toBe(1);
    expect(writes[0]!.equals(want)).toBe(true);
  });

  test("부분 쓰기 꼬리·대기 프레임은 다음 tick의 outbox 재사용에 덮이지 않는다", () => {
    let cap = 5;
    const got: Buffer[] = [];
    const raw = {
      write(buf: Buffer): number {
        const n = Math.min(cap, buf.length);
        got.push(Buffer.from(buf.subarray(0, n)));
        cap -= n;
        return n;
      },
      end(): void {},
      remoteAddress: "127.0.0.1",
    };
    const s = new PlayerSession(raw as unknown as Bun.Socket<PlayerSession>, 1);
    const ticks = [
      [{ id: CHARS, p: chars("first-tick-payload") }, { id: PING, p: ping(1) }],
      [{ id: SNAP, p: snap(2) }, { id: PONG, p: pong("second") }],
      [{ id: PACKET_ID.CHAT_BCAST, p: tagChat("third-tick-overwrites-the-same-outbox-bytes") }],
    ];
    for (const frames of ticks) {
      s.cork();
      for (const f of frames) s.send(f.id, f.p);
      s.uncork();
    }
    expect(s.socket.pendingByteCount).toBeGreaterThan(0);
    cap = Number.MAX_SAFE_INTEGER;
    s.socket.flush();
    const want = Buffer.concat(ticks.flat().map((f) => writePacket(f.id, f.p)));
    expect(Buffer.concat(got).equals(want)).toBe(true);
  });

  test("상한을 넘는 큰 tick(프레임 상한 안 프레임 5개 ≈ 300 KB) 뒤에도 다음 tick 바이트가 정확하다", () => {
    const { sock, writes } = fakeSocket();
    const s = new PlayerSession(sock, 1);
    // SNAPSHOT_DELTA 5000원소 = 본문 60,010 B(프레임 상한 0xFFFF 안).
    const big = { tickIndex: 1, ackSeq: 1, updates: Array.from({ length: 5000 }, (_, i) => ({ entityId: i, x: 0, y: 0 })) };
    s.cork();
    for (let i = 0; i < 5; i++) s.send(SNAP, big);
    s.uncork();
    s.cork();
    s.send(PONG, pong(1));
    s.uncork();
    expect(writes.length).toBe(2);
    expect(writes[0]!.equals(Buffer.concat(Array.from({ length: 5 }, () => writePacket(SNAP, big))))).toBe(true);
    expect(writes[1]!.equals(writePacket(PONG, pong(1)))).toBe(true);
  });

  test("netPacketsTx — 수락된 프레임마다 packet_id별 1회(코킹·즉시 경로), 종료 중이면 0", () => {
    const tx = (id: number) => metrics.netPacketsTx.value({ packet_id: packetIdLabel(id) });
    const before = [tx(PING), tx(PONG), tx(SNAP)];
    const { sock } = fakeSocket();
    const s = new PlayerSession(sock, 1);
    s.cork();
    s.send(PING, ping(0));
    s.send(SNAP, snap(1));
    s.send(PING, ping(0));
    expect([tx(PING), tx(PONG), tx(SNAP)]).toEqual(before); // uncork 전에는 미집계
    s.uncork();
    s.send(PONG, pong(0));
    expect([tx(PING), tx(PONG), tx(SNAP)]).toEqual([before[0]! + 2, before[1]! + 1, before[2]! + 1]);
    s.socket.end();
    s.cork();
    s.send(PING, ping(0));
    s.uncork();
    s.send(PONG, pong(0));
    expect([tx(PING), tx(PONG), tx(SNAP)]).toEqual([before[0]! + 2, before[1]! + 1, before[2]! + 1]);
  });
});
