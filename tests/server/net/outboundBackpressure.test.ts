// 1-C(3) — 송신 백프레셔(OutboundLink) 계약.
//
// Bun socket.write는 커널 버퍼가 차면 일부만 쓰고 나머지를 버퍼링하지 않는다. 종전엔 부분 쓰기 =
// 즉시 세션 종료라 과부하·느린 회선에서 세션이 끊겼다. 계약:
//   - 부분 쓰기 꼬리는 보관, drain(flush)이 이어 쓴다. 꼬리가 있는 동안 새 프레임은 뒤에 붙는다.
//   - 최종 수신 바이트 = 송신 프레임의 순서대로 연접(경계 보존).
//   - 꼬리 상한 초과 → 종료 + mmorpg_net_tx_backlog_close_total.
//   - end()는 꼬리 flush 후 close, 끝내 안 비면 타임아웃 후 강제 close. end 이후 프레임은 버림.
//   - write 음수(닫힌 소켓) → 즉시 종료, 꼬리 보관 안 함.

import { afterEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_END_FLUSH_TIMEOUT_MS,
  DEFAULT_OUTBOUND_MAX_BYTES,
  OutboundLink,
  configureOutbound,
} from "../../../server/src/network/outboundLink";
import { PlayerSession } from "../../../server/src/network/session";
import { writePacket } from "../../../server/src/network/packetWriter";
import { PACKET_ID } from "../../../server/src/net/codec.generated";
import { metrics } from "../../../server/src/obs/metrics";
import { encodeRaw } from "../../helpers/wire";
import { tagPong } from "../../helpers/fillers";

/** 수용량(바이트) 단위로 write를 받아주는 가짜 소켓 — capacity만큼만 쓰고 나머지는 거절. */
function cappedSocket(initialCapacity: number) {
  let capacity = initialCapacity;
  let ended = false;
  let closedReturn = false;
  const received: Buffer[] = [];
  let writeCalls = 0;
  const sock = {
    write(buf: Buffer): number {
      writeCalls++;
      if (closedReturn) return -1;
      const n = Math.min(capacity, buf.length);
      if (n > 0) received.push(Buffer.from(buf.subarray(0, n)));
      capacity -= n;
      return n;
    },
    end(): void {
      ended = true;
    },
    remoteAddress: "127.0.0.1",
  };
  return {
    sock,
    /** 클라가 읽어 커널 버퍼에 여유가 생긴 상황 흉내. */
    grant(n: number) {
      capacity += n;
    },
    closeRemote() {
      closedReturn = true;
    },
    received: () => Buffer.concat(received),
    isEnded: () => ended,
    writeCalls: () => writeCalls,
  };
}

// 링크는 프레임 내용을 보지 않는다 — 형식 무관 원시 본문 필러(바이너리 flip에도 크기·의도 유지): A 63바이트, B 72바이트(종전 PONG JSON 필러
// 크기 — B3b PONG flip), C 24바이트.
const A = encodeRaw(PACKET_ID.PING, Buffer.alloc(59, "a"));
const B = encodeRaw(PACKET_ID.PONG, Buffer.alloc(68, "b"));
const C = encodeRaw(PACKET_ID.PING, Buffer.alloc(20, "z"));

afterEach(() => {
  configureOutbound({
    maxBytes: DEFAULT_OUTBOUND_MAX_BYTES,
    endFlushTimeoutMs: DEFAULT_END_FLUSH_TIMEOUT_MS,
  });
});

describe("OutboundLink", () => {
  test("부분 쓰기 → 세션 유지, 꼬리 보관 + partial 메트릭", () => {
    const f = cappedSocket(10);
    const link = new OutboundLink(f.sock, 1);
    const before = metrics.netTxPartial.value({ packet_id: "0x0f00" });
    link.send(A, PACKET_ID.PING, 1);
    expect(f.isEnded()).toBe(false);
    expect(link.pendingByteCount).toBe(A.length - 10);
    expect(metrics.netTxPartial.value({ packet_id: "0x0f00" }) - before).toBe(1);
  });

  test("frameCount는 지연 평가 가능 — 전부 쓴 send는 세지 않고, 부분 쓰기 진단에서만 1회(게이트웨이 DELIVER 핫패스)", () => {
    const calls: number[] = [];
    const count = (buf: Buffer): number => {
      calls.push(buf.length);
      return 2;
    };
    const full = new OutboundLink(cappedSocket(1 << 20).sock, 1);
    full.send(Buffer.concat([A, B]), PACKET_ID.PING, count);
    expect(calls).toEqual([]);
    const partial = new OutboundLink(cappedSocket(10).sock, 2);
    partial.send(Buffer.concat([A, B]), PACKET_ID.PING, count);
    expect(calls).toEqual([A.length + B.length]);
  });

  test("꼬리가 있는 동안 새 프레임은 직접 write하지 않고 뒤에 붙는다", () => {
    const f = cappedSocket(10);
    const link = new OutboundLink(f.sock, 1);
    link.send(A, PACKET_ID.PING, 1);
    const calls = f.writeCalls();
    link.send(B, PACKET_ID.PONG, 1);
    link.send(C, PACKET_ID.PING, 1);
    expect(f.writeCalls()).toBe(calls);
    expect(link.pendingByteCount).toBe(A.length - 10 + B.length + C.length);
  });

  test("drain이 여러 번에 걸쳐 이어 써도 수신 바이트 = 프레임 순서 연접", () => {
    const f = cappedSocket(10);
    const link = new OutboundLink(f.sock, 1);
    link.send(A, PACKET_ID.PING, 1);
    link.send(B, PACKET_ID.PONG, 1);
    f.grant(25);
    link.flush();
    expect(link.pendingByteCount).toBeGreaterThan(0);
    f.grant(10_000);
    link.flush();
    expect(link.pendingByteCount).toBe(0);
    link.send(C, PACKET_ID.PING, 1); // 꼬리가 비면 다시 직접 write
    expect(f.received().equals(Buffer.concat([A, B, C]))).toBe(true);
    expect(f.isEnded()).toBe(false);
  });

  test("호출자 버퍼를 재사용해도 보관된 꼬리는 오염되지 않는다(복사 보관)", () => {
    const f = cappedSocket(5);
    const link = new OutboundLink(f.sock, 1);
    const buf = Buffer.from(A);
    link.send(buf, PACKET_ID.PING, 1);
    const reused = Buffer.from(B.subarray(0, 10));
    link.send(reused, PACKET_ID.PONG, 1);
    buf.fill(0);
    reused.fill(0);
    f.grant(10_000);
    link.flush();
    expect(f.received().equals(Buffer.concat([A, B.subarray(0, 10)]))).toBe(true);
  });

  test("꼬리 상한 초과 → 종료 + backlog_close 메트릭, 꼬리 폐기", () => {
    configureOutbound({ maxBytes: 64 });
    const f = cappedSocket(0);
    const link = new OutboundLink(f.sock, 1);
    const before = metrics.netTxBacklogClose.value();
    expect(C.length).toBeLessThan(64);
    link.send(C, PACKET_ID.PING, 1);
    expect(f.isEnded()).toBe(false);
    link.send(A, PACKET_ID.PING, 1);
    expect(f.isEnded()).toBe(true);
    expect(metrics.netTxBacklogClose.value() - before).toBe(1);
    expect(link.pendingByteCount).toBe(0);
  });

  test("end() — 꼬리가 비면 즉시 close", () => {
    const f = cappedSocket(10_000);
    const link = new OutboundLink(f.sock, 1);
    link.send(A, PACKET_ID.PING, 1);
    link.end();
    expect(f.isEnded()).toBe(true);
  });

  test("end() — 꼬리가 있으면 flush 완료 후 close, end 이후 프레임은 버림", () => {
    const f = cappedSocket(10);
    const link = new OutboundLink(f.sock, 1);
    link.send(A, PACKET_ID.PING, 1);
    link.send(B, PACKET_ID.PONG, 1); // KICK처럼 꼬리 뒤에 붙은 마지막 프레임
    link.end();
    expect(f.isEnded()).toBe(false);
    link.send(C, PACKET_ID.PING, 1); // 종료 중 — 버려져야 함
    f.grant(10_000);
    link.flush();
    expect(f.isEnded()).toBe(true);
    expect(f.received().equals(Buffer.concat([A, B]))).toBe(true);
  });

  test("end() — 상대가 끝내 안 읽으면 타임아웃 후 강제 close", async () => {
    configureOutbound({ endFlushTimeoutMs: 30 });
    const f = cappedSocket(10);
    const link = new OutboundLink(f.sock, 1);
    link.send(A, PACKET_ID.PING, 1);
    link.end();
    expect(f.isEnded()).toBe(false);
    await Bun.sleep(60);
    expect(f.isEnded()).toBe(true);
    expect(link.pendingByteCount).toBe(0);
  });

  test("write 음수(닫힌 소켓) → 즉시 종료, 꼬리 보관 안 함", () => {
    const f = cappedSocket(10_000);
    f.closeRemote();
    const link = new OutboundLink(f.sock, 1);
    link.send(A, PACKET_ID.PING, 1);
    expect(f.isEnded()).toBe(true);
    expect(link.pendingByteCount).toBe(0);
  });
});

describe("mmorpg_net_tx_writes_total — raw write 호출 수(성능 3단계 슬라이스 6)", () => {
  test("전부 쓴 send·부분 쓰기 send·drain 이어쓰기·닫힌 소켓 write 모두 호출 1회 = +1, 꼬리 뒤에 붙인 send는 0", () => {
    const f = cappedSocket(10);
    const link = new OutboundLink(f.sock, 1);
    const before = metrics.netTxWrites.value();
    link.send(A, PACKET_ID.PING, 1); // 부분 쓰기(10바이트) — write 1회
    link.send(B, PACKET_ID.PONG, 1); // 꼬리 뒤에 보관 — write 0회
    expect(metrics.netTxWrites.value() - before).toBe(1);
    f.grant(1 << 20);
    link.flush(); // 꼬리 2덩이 — write 2회
    expect(metrics.netTxWrites.value() - before).toBe(3);
    link.send(C, PACKET_ID.PING, 1); // 즉시 전부 — write 1회
    expect(metrics.netTxWrites.value() - before).toBe(4);
    expect(f.writeCalls()).toBe(4);
    f.closeRemote();
    link.send(C, PACKET_ID.PING, 1); // 음수 반환도 호출 1회
    expect(metrics.netTxWrites.value() - before).toBe(5);
  });

  test("빈 버퍼·종료 중 send는 write하지 않으므로 미집계", () => {
    const f = cappedSocket(1 << 20);
    const link = new OutboundLink(f.sock, 1);
    const before = metrics.netTxWrites.value();
    link.send(Buffer.alloc(0), PACKET_ID.PING, 0);
    link.end();
    link.send(A, PACKET_ID.PING, 1);
    expect(metrics.netTxWrites.value() - before).toBe(0);
  });
});

describe("PlayerSession × OutboundLink", () => {
  test("코킹 flush 부분 쓰기 뒤 즉시 send(KICK)도 꼬리 뒤에 붙고 end는 flush 후 close", () => {
    const f = cappedSocket(8);
    const s = new PlayerSession(f.sock as unknown as Bun.Socket<PlayerSession>, 7);
    s.cork();
    s.send(PACKET_ID.PING, { clientTimeMs: 1 });
    s.send(PACKET_ID.PONG, tagPong("y"));
    s.uncork();
    const kick = writePacket(PACKET_ID.KICK, { reason: 8, detail: "session superseded" });
    s.writeOrEnqueue(PACKET_ID.KICK, kick);
    s.socket.end();
    expect(f.isEnded()).toBe(false);
    f.grant(10_000);
    s.socket.flush();
    expect(f.isEnded()).toBe(true);
    const expected = Buffer.concat([
      writePacket(PACKET_ID.PING, { clientTimeMs: 1 }),
      writePacket(PACKET_ID.PONG, tagPong("y")),
      kick,
    ]);
    expect(f.received().equals(expected)).toBe(true);
  });
});
