// 성능 4.5 F3 — 공유 프레임 송신(sessionManager.sendShared → PlayerSession.writeShared).
//
// 계약:
//   - 클라 바이트 = 프레임을 복사하고 patchOff에 수신자 value(u32 LE)를 쓴 것 — 경로와 무관하게 같다.
//   - 로컬 링크(sharedRoute 없음 — monolith OutboundLink): 코킹 중이면 outbox에 복사·패치(종전 sendFrame과 같은 바이트·write 수), 아니면
//     제자리 패치 후 즉시 send.
//   - sharedRoute가 있는 링크(원격 — IPC_SHARED=1): 코킹 중이면 outbox가 끝 참조만 들고, uncork가 sharedRoute.send(인라인, 프레임, value)로
//     보낸다(인라인 = 참조 앞 프레임들). 참조 뒤에 다른 프레임이 붙으면 인라인으로 굳어 send로 간다.
//   - netPacketsTx는 논리 프레임마다(경로 무관), 미인증·종료 중 링크는 버린다(sendFrame과 같은 규칙).

import { describe, expect, test } from "bun:test";
import { PlayerSession, setSessionState } from "../../../server/src/network/session";
import { SessionManager } from "../../../server/src/network/sessionManager";
import type { ClientLink } from "../../../server/src/network/clientLink";
import { writePacket } from "../../../server/src/network/packetWriter";
import { SharedFrame } from "../../../server/src/net/sharedFrame";
import { PACKET_ID } from "../../../server/src/net/codec.generated";
import { DELTA_ACK_OFFSET } from "../../helpers/wire";
import { metrics, packetIdLabel } from "../../../server/src/obs/metrics";
import { tagPong } from "../../helpers/fillers";

const DELTA = PACKET_ID.SNAPSHOT_DELTA;
const PONG = PACKET_ID.PONG;

function deltaFrame(tag: number): SharedFrame {
  const f = new SharedFrame(DELTA_ACK_OFFSET);
  const b = writePacket(DELTA, { tickIndex: 7, ackSeq: 0, updates: [{ entityId: tag, x: 1, y: 2 }] });
  f.bytes = Buffer.from(b);
  return f;
}

function expected(f: SharedFrame, value: number): Buffer {
  const out = Buffer.from(f.bytes);
  out.writeUInt32LE(value >>> 0, DELTA_ACK_OFFSET);
  return out;
}

const pong = (t: string) => writePacket(PONG, tagPong(t));

function captureSocket() {
  const writes: Buffer[] = [];
  const sock = {
    write(buf: Buffer): number {
      writes.push(Buffer.from(buf));
      return buf.length;
    },
    end(): void {},
    remoteAddress: "127.0.0.1",
    data: undefined,
  };
  return { sock: sock as unknown as Bun.Socket<PlayerSession>, writes };
}

/** sharedRoute를 가진 링크 대역 — 받은 호출을 기록(공유 경로 = "shared", 평문 = "send"). */
class SharedLink implements ClientLink {
  readonly remoteAddress = "198.51.100.1";
  closing = false;
  readonly calls: { kind: "send" | "shared"; bytes: Buffer; frame?: SharedFrame; value?: number; frames: number }[] = [];
  /** MULTICAST 경로도 가진 원격 링크처럼 — 자격 판정이 outbox 내용만으로 갈리는지 보려고. */
  readonly castRoute = { sink: { multicast: () => true }, localId: 1 };
  constructor(private readonly beforeEnd: () => void) {}
  send(buf: Buffer, _first: number, frameCount: number): boolean {
    if (this.closing) return false;
    this.calls.push({ kind: "send", bytes: Buffer.from(buf), frames: frameCount });
    return true;
  }
  /** 보관자 집계 키(게이트웨이 피어 자리). */
  readonly sink = {};
  readonly sharedRoute = {
    sink: this.sink,
    send: (inline: Buffer, frame: SharedFrame, value: number, _first: number, frameCount: number): boolean => {
      if (this.closing) return false;
      this.calls.push({ kind: "shared", bytes: Buffer.from(inline), frame, value, frames: frameCount });
      return true;
    },
  };
  exceedsBacklogCap(): boolean {
    return false;
  }
  flush(): void {}
  end(): void {
    this.beforeEnd();
    this.closing = true;
  }
  dispose(): void {
    this.closing = true;
  }
  /** 받은 클라 바이트(공유 호출은 인라인 + 패치한 프레임으로 펼친다). */
  stream(): Buffer {
    return Buffer.concat(this.calls.map((c) => (c.kind === "send" ? c.bytes : Buffer.concat([c.bytes, expected(c.frame!, c.value!)]))));
  }
}

function enroll(sm: SessionManager, s: PlayerSession, playerId: number): void {
  setSessionState(s, "AUTHENTICATED");
  setSessionState(s, "IN_WORLD");
  s.playerId = playerId;
  sm.addAuthenticated(s);
}

function sharedSession(sm: SessionManager, playerId: number): { s: PlayerSession; link: SharedLink } {
  let link: SharedLink | null = null;
  const s = new PlayerSession((beforeEnd) => {
    link = new SharedLink(beforeEnd);
    return link;
  }, playerId);
  enroll(sm, s, playerId);
  return { s, link: link! };
}

const txDelta = () => metrics.netPacketsTx.value({ packet_id: packetIdLabel(DELTA) });

describe("sendShared — 로컬 링크(monolith)", () => {
  test("코킹 중이면 outbox에 복사·패치 — tick당 write 1회, 바이트 = 패치한 프레임", () => {
    const sm = new SessionManager();
    const { sock, writes } = captureSocket();
    const s = new PlayerSession(sock, 41);
    enroll(sm, s, 41);
    const f = deltaFrame(1);
    const before = txDelta();
    sm.withCork(() => {
      sm.sendTo(41, PONG, tagPong("a"));
      sm.sendShared(41, DELTA, f, 123);
    });
    expect(writes.length).toBe(1);
    expect(writes[0]).toEqual(Buffer.concat([pong("a"), expected(f, 123)]));
    expect(txDelta() - before).toBe(1);
  });

  test("코킹 밖이면 즉시 write 1회(제자리 패치) — 같은 프레임을 다른 value로 연달아 보내도 각자 자기 값", () => {
    const sm = new SessionManager();
    const a = captureSocket();
    const b = captureSocket();
    const sa = new PlayerSession(a.sock, 51);
    const sb = new PlayerSession(b.sock, 52);
    enroll(sm, sa, 51);
    enroll(sm, sb, 52);
    const f = deltaFrame(2);
    sm.sendShared(51, DELTA, f, 1);
    sm.sendShared(52, DELTA, f, 2);
    expect(a.writes).toEqual([expected(f, 1)]);
    expect(b.writes).toEqual([expected(f, 2)]);
  });

  test("미인증 id는 무동작", () => {
    const sm = new SessionManager();
    expect(() => sm.sendShared(999, DELTA, deltaFrame(3), 1)).not.toThrow();
  });
});

describe("sendShared — sharedRoute 링크(원격, IPC_SHARED=1)", () => {
  test("코킹 중이면 끝 참조 — uncork가 sharedRoute.send(인라인 = 앞 프레임, 프레임, value) 1회", () => {
    const sm = new SessionManager();
    const { link } = sharedSession(sm, 61);
    const f = deltaFrame(4);
    const before = txDelta();
    sm.withCork(() => {
      sm.sendTo(61, PONG, tagPong("x"));
      sm.sendShared(61, DELTA, f, 0xfffffffe);
    });
    expect(link.calls.map((c) => c.kind)).toEqual(["shared"]);
    const call = link.calls[0]!;
    expect(call.bytes).toEqual(pong("x"));
    expect(call.frame).toBe(f);
    expect(call.value).toBe(0xfffffffe);
    expect(call.frames).toBe(2);
    expect(txDelta() - before).toBe(1);
  });

  test("참조 뒤에 프레임이 붙으면 인라인으로 굳어 send 1회 — 바이트는 같은 순서", () => {
    const sm = new SessionManager();
    const { link } = sharedSession(sm, 62);
    const f = deltaFrame(5);
    sm.withCork(() => {
      sm.sendShared(62, DELTA, f, 9);
      sm.sendTo(62, PONG, tagPong("late"));
    });
    expect(link.calls.map((c) => c.kind)).toEqual(["send"]);
    expect(link.stream()).toEqual(Buffer.concat([expected(f, 9), pong("late")]));
  });

  test("코킹 밖이면 제자리 패치 후 send(참조 경로 없음)", () => {
    const sm = new SessionManager();
    const { link } = sharedSession(sm, 63);
    const f = deltaFrame(6);
    sm.sendShared(63, DELTA, f, 44);
    expect(link.calls.map((c) => c.kind)).toEqual(["send"]);
    expect(link.stream()).toEqual(expected(f, 44));
  });

  test("end()는 끝 참조째 먼저 보낸다(beforeEnd = uncork) — 종료 뒤 송신은 버린다", () => {
    const sm = new SessionManager();
    const { s, link } = sharedSession(sm, 64);
    const f = deltaFrame(7);
    s.cork();
    sm.sendShared(64, DELTA, f, 3);
    s.socket.end();
    sm.sendShared(64, DELTA, f, 4);
    expect(link.calls.map((c) => c.kind)).toEqual(["shared"]);
    expect(link.stream()).toEqual(expected(f, 3));
  });

  test("보관자 집계 — 참조를 outbox에 둘 때 링크 피어(sink)로 hold, 복사·패치 경로·즉시 송신은 세지 않는다", () => {
    const sm = new SessionManager();
    const a = sharedSession(sm, 66);
    const b = sharedSession(sm, 67);
    const f = deltaFrame(9);
    sm.withCork(() => {
      sm.sendShared(66, DELTA, f, 1);
      sm.sendShared(67, DELTA, f, 2);
      expect(f.take(a.link.sink)).toBe(1);
      expect(f.take(b.link.sink)).toBe(1);
    });
    const local = captureSocket();
    const s = new PlayerSession(local.sock, 68);
    enroll(sm, s, 68);
    const g = deltaFrame(10);
    sm.withCork(() => sm.sendShared(68, DELTA, g, 3));
    sm.sendShared(66, DELTA, g, 4); // 코킹 밖 = 즉시 송신.
    expect(g.take(a.link.sink)).toBe(0);
  });

  test("F2 MULTICAST 자격 — 끝 참조가 있는 outbox는 프레임이 있는 것(연결별 경로)", () => {
    const sm = new SessionManager();
    const { s } = sharedSession(sm, 65);
    s.cork();
    expect(s.castRoute()).not.toBeNull();
    sm.sendShared(65, DELTA, deltaFrame(8), 1);
    expect(s.castRoute()).toBeNull();
    s.uncork();
  });
});
