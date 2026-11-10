// 성능 4단계 4.1 — 클라 소켓 엣지(clientEdge)는 연결 객체·처리기(EdgeSink)와 무관하게 같은 정책을 건다.
//
// monolith(tcpServer)의 연결은 PlayerSession이고 처리는 JSON 디코드·디스패치지만, 4.2 게이트웨이의 연결은 게임 상태가 없는
// 미러이고 처리는 월드로 원시 본문 전달이다. 여기서는 PlayerSession이 아닌 최소 연결(GatewayLikeConn)과 기록형 sink로
// 엣지 정책을 고정한다 — 헤더·size 화이트리스트·본문 대기·rate·idle 창·킥·종료 중 수신 폐기·데드라인·drain.
// (PlayerSession 경로의 같은 정책은 ingestIdleReset·rateLimitKick·preAuthGuard·closingLink 등이 고정한다.)

import { describe, expect, test } from "bun:test";
import {
  type EdgeConn,
  type EdgeSink,
  type EdgeSocket,
  type IngestPolicy,
  createClientEdge,
  ingestEdgeChunk,
} from "../../../server/src/network/clientEdge";
import { OutboundLink } from "../../../server/src/network/outboundLink";
import { RingByteBuffer } from "../../../server/src/net/ringBuffer";
import {
  COMMAND_RESERVE_LIMITS,
  OVERLOAD_EXEMPT_LIMITS,
  StrikeWindow,
  TokenBucket,
} from "../../../server/src/net/rateLimit";
import { PACKET_ID } from "../../../server/src/net/codec.generated";
import { encode, encodeBody, firstFrame, headerOnly, helloPayload, legacyV1Frame } from "../../helpers/wire";
import { FRAME_HEADER_BYTES, LEGACY_KICK_FRAME } from "../../../server/src/net/wireFrame";
import { metrics } from "../../../server/src/obs/metrics";
import { KICK_REASON, type LoginState } from "../../../server/src/identity/loginFlow";

/** 게이트웨이형 연결 — 게임 상태 없이 엣지가 요구하는 표면만. 송신은 로컬 OutboundLink. */
class GatewayLikeConn implements EdgeConn {
  readonly inbox = new RingByteBuffer();
  state: LoginState = "ANON";
  preAuth = true;
  readonly rateLimiter = new TokenBucket();
  readonly commandReserve = new TokenBucket(COMMAND_RESERVE_LIMITS.capacity);
  readonly rateStrikes = new StrikeWindow();
  readonly overloadExempt = new TokenBucket(OVERLOAD_EXEMPT_LIMITS.capacity);
  rateWarnKey: string | null = null;
  readonly written: Buffer[] = [];
  ended = false;
  readonly socket: OutboundLink;
  constructor(readonly connId: number) {
    this.socket = new OutboundLink(
      {
        write: (b: Buffer) => {
          if (this.ended) return -1;
          this.written.push(Buffer.from(b));
          return b.length;
        },
        end: () => {
          this.ended = true;
        },
        remoteAddress: "192.0.2.10",
      },
      connId,
    );
  }
  writeOrEnqueue(_packetId: number, buf: Buffer): void {
    this.socket.send(buf, _packetId, 1);
  }
}

interface Forwarded {
  connId: number;
  packetId: number;
  /** 원시 본문 hex. */
  body: string;
}

function recordingSink(): EdgeSink<GatewayLikeConn> & { frames: Forwarded[]; scopes: number } {
  const sink = {
    frames: [] as Forwarded[],
    scopes: 0,
    create: (): GatewayLikeConn => {
      throw new Error("unused");
    },
    admit: () => true,
    closed: () => true,
    frame(conn: GatewayLikeConn, packetId: number, body: Buffer): void {
      // 계약: body는 호출 동안만 유효한 뷰 — 보관하려면 복사(게이트웨이 IPC 배치).
      sink.frames.push({ connId: conn.connId, packetId, body: Buffer.from(body).toString("hex") });
    },
    scope<T>(fn: () => T): T {
      sink.scopes++;
      return fn();
    },
  };
  return sink;
}

const POLICY: IngestPolicy = { strike: { windowMs: 3000, maxDrops: 5 }, preAuthIdleSec: 20, inWorldIdleSec: 300 };

function harness(policy: IngestPolicy = POLICY) {
  const conn = new GatewayLikeConn(11);
  const timeouts: number[] = [];
  const socket = {
    data: conn,
    remoteAddress: "192.0.2.10",
    timeout(sec: number) {
      timeouts.push(sec);
    },
  } as unknown as EdgeSocket<GatewayLikeConn>;
  const sink = recordingSink();
  const feed = (buf: Uint8Array): void => ingestEdgeChunk(socket, buf, sink, policy);
  return { conn, socket, sink, timeouts, feed };
}

const PING = encode(PACKET_ID.PING, { clientTimeMs: 1 });

function kickOf(written: Buffer[]): { reason: number; detail: string } {
  const f = firstFrame(Buffer.concat(written));
  expect(f?.id).toBe(PACKET_ID.KICK);
  return f!.payload;
}

describe("ingestEdgeChunk — PlayerSession이 아닌 연결", () => {
  test("완성 프레임의 원시 본문을 순서대로 넘기고, 청크 경계를 넘는 프레임은 완성될 때 넘긴다", () => {
    const h = harness();
    const two = Buffer.concat([PING, encode(PACKET_ID.HELLO, helloPayload({ clientProtoVer: 2 }))]);
    h.feed(two.subarray(0, PING.length + 3));
    expect(h.sink.frames.map((f) => f.packetId)).toEqual([PACKET_ID.PING]);
    h.feed(two.subarray(PING.length + 3));
    expect(h.sink.frames).toEqual([
      { connId: 11, packetId: PACKET_ID.PING, body: encodeBody(PACKET_ID.PING, { clientTimeMs: 1 }).toString("hex") },
      { connId: 11, packetId: PACKET_ID.HELLO, body: encodeBody(PACKET_ID.HELLO, helloPayload({ clientProtoVer: 2 })).toString("hex") },
    ]);
    expect(h.conn.inbox.available).toBe(0);
    // 청크마다 처리 구간 1회(monolith: deferSends — 디스패치 송신 턴 끝 코얼레싱).
    expect(h.sink.scopes).toBe(2);
    expect(h.timeouts).toEqual([20, 20]);
  });

  test("size 화이트리스트 위반 헤더 — 본문 도착 전에 KICK 5 + 종료, 아무것도 넘기지 않고 inbox 폐기", () => {
    const h = harness();
    const bad = Buffer.concat([headerOnly(PACKET_ID.PING, 0xffff), Buffer.alloc(10)]);
    h.feed(bad);
    expect(h.sink.frames).toEqual([]);
    expect(kickOf(h.conn.written)).toEqual({ reason: KICK_REASON.Cheat, detail: "body too large" });
    expect(h.conn.socket.closing).toBe(true);
    expect(h.conn.inbox.available).toBe(0);
    // 종료 중 연결의 이후 수신은 파싱하지 않는다.
    h.feed(PING);
    expect(h.sink.frames).toEqual([]);
    expect(h.conn.inbox.available).toBe(0);
  });

  test("구 v1 클라(B1) — HELLO 전 v1 HELLO 서명이면 size 게이트 전에 v1 형식 KICK 1 + 종료, 아무것도 넘기지 않는다", () => {
    const h = harness();
    const causes: string[] = [];
    h.sink.kicked = (_c, cause) => void causes.push(cause);
    const before = metrics.connRejected.value({ reason: "legacy_framing" });
    h.feed(legacyV1Frame(PACKET_ID.HELLO, helloPayload({ clientProtoVer: 2 })));
    expect(h.sink.frames).toEqual([]);
    expect(Buffer.concat(h.conn.written).equals(LEGACY_KICK_FRAME)).toBe(true);
    expect(h.conn.socket.closing).toBe(true);
    expect(h.conn.inbox.available).toBe(0);
    expect(causes).toEqual(["legacy_framing"]);
    expect(metrics.connRejected.value({ reason: "legacy_framing" })).toBe(before + 1);
  });

  test("구 v1 클라 — 헤더 4바이트만 와도(본문 대기 없이) 바로 거절", () => {
    const h = harness();
    h.feed(legacyV1Frame(PACKET_ID.HELLO, helloPayload()).subarray(0, FRAME_HEADER_BYTES));
    expect(Buffer.concat(h.conn.written).equals(LEGACY_KICK_FRAME)).toBe(true);
    expect(h.conn.socket.closing).toBe(true);
  });

  test("구 v1 클라 — 헤더가 2+2바이트로 나뉘어 와도 4바이트가 모이면 감지", () => {
    const h = harness();
    const v1 = legacyV1Frame(PACKET_ID.HELLO, helloPayload());
    h.feed(v1.subarray(0, 2));
    expect(h.conn.written).toEqual([]);
    expect(h.conn.socket.closing).toBe(false);
    h.feed(v1.subarray(2));
    expect(Buffer.concat(h.conn.written).equals(LEGACY_KICK_FRAME)).toBe(true);
    expect(h.conn.socket.closing).toBe(true);
  });

  test("첫 프레임 뒤에는 서명 모양이어도 v2로 처리(연결 로컬 판정 — 로그인 상태 무관) — id 0(예약)은 본문이 오면 넘기고 라우터가 버린다", () => {
    const h = harness();
    h.feed(PING);
    const v1 = legacyV1Frame(PACKET_ID.HELLO, helloPayload());
    h.feed(v1.subarray(0, FRAME_HEADER_BYTES));
    expect(h.conn.written).toEqual([]);
    expect(h.conn.socket.closing).toBe(false);
    h.feed(Buffer.alloc(0x0100));
    expect(h.sink.frames.map((f) => f.packetId)).toEqual([PACKET_ID.PING, 0]);
  });

  test("pre-auth rate 위반은 첫 위반 KICK, IN_WORLD는 drop 후 strike 초과 시 KICK", () => {
    const pre = harness();
    pre.feed(Buffer.concat(Array.from({ length: 40 }, () => PING)));
    expect(kickOf(pre.conn.written)).toEqual({ reason: KICK_REASON.Cheat, detail: "rate limit" });
    expect(pre.sink.frames.length).toBeLessThan(40);

    const inWorld = harness();
    inWorld.conn.state = "IN_WORLD";
    inWorld.conn.preAuth = false;
    inWorld.feed(Buffer.concat(Array.from({ length: 400 }, () => PING)));
    expect(inWorld.conn.socket.closing).toBe(true);
    expect(kickOf(inWorld.conn.written).reason).toBe(KICK_REASON.Cheat);
    // 통과 프레임 수 = idle 리셋 수(drop은 리셋하지 않는다).
    expect(inWorld.timeouts.length).toBe(inWorld.sink.frames.length);
    expect(inWorld.timeouts.every((s) => s === 300)).toBe(true);
  });
});

describe("createClientEdge — 소켓 콜백", () => {
  function fakeBunSocket(conn: GatewayLikeConn | undefined) {
    const calls: string[] = [];
    const sock = {
      data: conn,
      remoteAddress: "192.0.2.10",
      setNoDelay(v: boolean) {
        calls.push(`nodelay:${v}`);
      },
      timeout(sec: number) {
        calls.push(`timeout:${sec}`);
      },
    };
    return { sock: sock as unknown as Bun.Socket<GatewayLikeConn>, calls };
  }

  function edgeWith(admit: boolean) {
    const timers: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
    const conn = new GatewayLikeConn(21);
    const events: string[] = [];
    const sink: EdgeSink<GatewayLikeConn> = {
      create: () => {
        events.push("create");
        return conn;
      },
      admit: () => {
        events.push("admit");
        return admit;
      },
      closed: () => {
        events.push("closed");
        return admit;
      },
      frame: () => events.push("frame"),
      scope: (fn) => fn(),
    };
    const handlers = createClientEdge(sink, {
      preAuthDeadlineMs: 1234,
      setTimer: (fn, ms) => {
        const t = { fn, ms, cleared: false };
        timers.push(t);
        return t;
      },
      clearTimer: (h) => {
        (h as { cleared: boolean }).cleared = true;
      },
    });
    return { handlers, conn, events, timers };
  }

  test("open: NoDelay → 연결 생성 → 수용 → pre-auth idle 창 + 절대 데드라인", () => {
    const e = edgeWith(true);
    const s = fakeBunSocket(undefined);
    void e.handlers.open?.(s.sock);
    expect(s.calls).toEqual(["nodelay:true", "timeout:20"]);
    expect(e.events).toEqual(["create", "admit"]);
    expect((s.sock as unknown as { data: GatewayLikeConn }).data).toBe(e.conn);
    expect(e.timers.map((t) => t.ms)).toEqual([1234]);
  });

  test("open: 수용 거절이면 idle 창·데드라인을 걸지 않는다(킥은 sink 몫)", () => {
    const e = edgeWith(false);
    const s = fakeBunSocket(undefined);
    void e.handlers.open?.(s.sock);
    expect(s.calls).toEqual(["nodelay:true"]);
    expect(e.timers).toEqual([]);
  });

  test("데드라인 발화: 아직 pre-auth면 KICK 3 'pre-auth deadline', 인증 후면 무동작", () => {
    const e = edgeWith(true);
    void e.handlers.open?.(fakeBunSocket(undefined).sock);
    e.conn.preAuth = false;
    e.timers[0]!.fn();
    expect(e.conn.written).toEqual([]);

    const e2 = edgeWith(true);
    void e2.handlers.open?.(fakeBunSocket(undefined).sock);
    e2.timers[0]!.fn();
    expect(kickOf(e2.conn.written)).toEqual({ reason: KICK_REASON.Idle, detail: "pre-auth deadline" });
    expect(e2.conn.socket.closing).toBe(true);
  });

  test("timeout: KICK 3 'idle timeout' / close: sink.closed + 데드라인 해제 / drain: 링크 flush", () => {
    const e = edgeWith(true);
    const s = fakeBunSocket(undefined);
    void e.handlers.open?.(s.sock);
    void e.handlers.drain?.(s.sock);
    void e.handlers.timeout?.(s.sock);
    expect(kickOf(e.conn.written)).toEqual({ reason: KICK_REASON.Idle, detail: "idle timeout" });
    void e.handlers.close?.(s.sock);
    expect(e.events).toEqual(["create", "admit", "closed"]);
    expect(e.timers[0]!.cleared).toBe(true);
  });
});
