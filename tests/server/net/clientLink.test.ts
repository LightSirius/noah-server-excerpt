// 성능 4단계 4.1 — 세션 송신 표면(ClientLink) 이음새.
//
// PlayerSession은 링크 구현을 모른다: 로컬(Bun 소켓 → OutboundLink)과 원격(4.2 RemoteClientLink — 게이트웨이로
// CONN_DELIVER/CONN_CLOSE/CONN_STATE)이 같은 계약으로 갈아 끼워진다. 여기서는 기록형 가짜 링크로 계약을 고정한다:
//   - 즉시 송신 = link.send(프레임 1개, id, 1), 코킹 송신 = uncork 때 link.send(연접, 첫 id, n)
//   - end()는 링크가 beforeEnd(세션 outbox flush)를 부른 뒤 닫는다 — outbox의 KICK이 갇히지 않는다
//   - 상태 전이는 링크에 1회씩 통지(setState) — 게이트웨이가 rate·idle 정책을 응답보다 먼저 바꾸는 근거
//   - remoteAddress는 링크에서 온다(게이트웨이가 넘긴 실제 클라 IP — IP별 상한·인증 스로틀)

import { describe, expect, test } from "bun:test";
import { PlayerSession, setSessionState } from "../../../server/src/network/session";
import type { ClientLink } from "../../../server/src/network/clientLink";
import { OutboundLink } from "../../../server/src/network/outboundLink";
import { writePacket } from "../../../server/src/network/packetWriter";
import { PACKET_ID } from "../../../server/src/net/codec.generated";
import { tagChat } from "../../helpers/fillers";
import type { LoginState } from "../../../server/src/identity/loginFlow";

interface Sent {
  bytes: Buffer;
  firstPacketId: number;
  frameCount: number;
}

class RecordingLink implements ClientLink {
  readonly sent: Sent[] = [];
  readonly states: LoginState[] = [];
  readonly events: string[] = [];
  closing = false;
  disposed = false;
  constructor(
    readonly remoteAddress: string | undefined,
    private readonly beforeEnd: () => void,
  ) {}
  send(buf: Buffer, firstPacketId: number, frameCount: number): boolean {
    if (this.closing) return false;
    // 계약: buf는 호출 동안만 유효 — 보관하려면 복사.
    this.sent.push({ bytes: Buffer.from(buf), firstPacketId, frameCount });
    this.events.push(`send:${frameCount}`);
    return true;
  }
  exceedsBacklogCap(): boolean {
    return false;
  }
  flush(): void {}
  end(): void {
    if (this.closing) return;
    this.beforeEnd();
    this.closing = true;
    this.events.push("end");
  }
  dispose(): void {
    this.disposed = true;
    this.closing = true;
  }
  setState(state: LoginState): void {
    this.states.push(state);
    this.events.push(`state:${state}`);
  }
}

function sessionOverLink(addr: string | undefined = "203.0.113.7"): { s: PlayerSession; link: RecordingLink } {
  let link: RecordingLink | null = null;
  const s = new PlayerSession((beforeEnd) => {
    link = new RecordingLink(addr, beforeEnd);
    return link;
  }, 4242);
  return { s, link: link! };
}

describe("PlayerSession over ClientLink(링크 팩토리)", () => {
  test("팩토리가 만든 링크가 session.socket이고 remoteAddress는 링크 값", () => {
    const { s, link } = sessionOverLink("198.51.100.9");
    expect(s.socket).toBe(link);
    expect(s.connId).toBe(4242);
    expect(s.remoteAddress).toBe("198.51.100.9");
  });

  test("즉시 송신 = 프레임 1개, writePacket과 같은 바이트", () => {
    const { s, link } = sessionOverLink();
    s.send(PACKET_ID.PONG, { clientTimeMs: 1, serverTimeMs: 2 });
    expect(link.sent).toHaveLength(1);
    expect(link.sent[0]!.frameCount).toBe(1);
    expect(link.sent[0]!.firstPacketId).toBe(PACKET_ID.PONG);
    expect(link.sent[0]!.bytes).toEqual(writePacket(PACKET_ID.PONG, { clientTimeMs: 1, serverTimeMs: 2 }));
  });

  test("코킹 송신은 uncork 때 연접 1회", () => {
    const { s, link } = sessionOverLink();
    s.cork();
    s.send(PACKET_ID.PONG, { clientTimeMs: 1, serverTimeMs: 2 });
    s.send(PACKET_ID.CHAT_BCAST, tagChat("b", "a"));
    expect(link.sent).toHaveLength(0);
    s.uncork();
    expect(link.sent).toHaveLength(1);
    expect(link.sent[0]!.frameCount).toBe(2);
    expect(link.sent[0]!.firstPacketId).toBe(PACKET_ID.PONG);
    expect(link.sent[0]!.bytes).toEqual(
      Buffer.concat([
        writePacket(PACKET_ID.PONG, { clientTimeMs: 1, serverTimeMs: 2 }),
        writePacket(PACKET_ID.CHAT_BCAST, tagChat("b", "a")),
      ]),
    );
  });

  test("코킹 중 KICK + end — 링크가 beforeEnd로 outbox를 먼저 보낸 뒤 닫힌다", () => {
    const { s, link } = sessionOverLink();
    s.cork();
    s.send(PACKET_ID.PONG, { clientTimeMs: 1, serverTimeMs: 2 });
    s.send(PACKET_ID.KICK, { reason: 8, detail: "dup" });
    s.socket.end();
    expect(link.events).toEqual(["send:2", "end"]);
    expect(link.sent[0]!.bytes.subarray(-writePacket(PACKET_ID.KICK, { reason: 8, detail: "dup" }).length)).toEqual(
      writePacket(PACKET_ID.KICK, { reason: 8, detail: "dup" }),
    );
    // 종료 중 링크로 가는 송신은 버린다.
    s.send(PACKET_ID.PONG, { clientTimeMs: 3, serverTimeMs: 4 });
    expect(link.sent).toHaveLength(1);
  });

  test("상태 전이는 바뀔 때만 1회씩 링크에 통지(전이 순서 그대로)", () => {
    const { s, link } = sessionOverLink();
    setSessionState(s, "HELLO_RECV");
    setSessionState(s, "HELLO_RECV");
    setSessionState(s, "AUTHENTICATED");
    setSessionState(s, "IN_WORLD");
    setSessionState(s, "REJECT");
    expect(link.states).toEqual(["HELLO_RECV", "AUTHENTICATED", "IN_WORLD", "REJECT"]);
    expect(s.preAuth).toBe(false);
  });

  test("상태 통지는 상태·pre-auth 회계가 확정된 뒤 — 응답 송신보다 먼저(핸들러는 전이 후 응답)", () => {
    const { s, link } = sessionOverLink();
    setSessionState(s, "AUTHENTICATED");
    s.send(PACKET_ID.AUTH_RESULT, { ok: true, accountId: 1, sessionToken: "t", errCode: 0 });
    expect(link.events).toEqual(["state:AUTHENTICATED", "send:1"]);
  });
});

describe("로컬 링크(OutboundLink)", () => {
  test("Bun 소켓으로 만든 세션의 링크는 OutboundLink — setState 미구현(monolith 무동작)", () => {
    const raw = { write: (b: Buffer) => b.length, end() {}, remoteAddress: "127.0.0.1" };
    const s = new PlayerSession(raw as unknown as Bun.Socket<PlayerSession>, 7);
    expect(s.socket).toBeInstanceOf(OutboundLink);
    expect((s.socket as ClientLink).setState).toBeUndefined();
    expect(s.remoteAddress).toBe("127.0.0.1");
    expect(() => setSessionState(s, "HELLO_RECV")).not.toThrow();
  });

  test("MULTICAST·공유 프레임 경로 없음 = 자기 필드 null(핫패스 판정이 프로토타입 탐색 없이 끝난다 — 4.5 리뷰)", () => {
    const link = new OutboundLink({ write: (b: Buffer) => b.length, end() {} }, 1);
    expect(Object.hasOwn(link, "castRoute") && link.castRoute === null).toBe(true);
    expect(Object.hasOwn(link, "sharedRoute") && link.sharedRoute === null).toBe(true);
  });
});
