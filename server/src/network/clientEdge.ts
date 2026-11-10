// 클라 소켓 엣지 — Bun 소켓 콜백(open/data/timeout/close/drain/error)과 수신 프레임 게이트·킥.
//
// 성능 4단계(게이트웨이 분리) 4.1: monolith(tcpServer)와 4.2 게이트웨이가 같은 엣지 정책을 쓰도록 tcpServer에서 분리했다.
// 모드마다 다른 것은 연결 객체(EdgeConn)와 처리기(EdgeSink)뿐이다:
//   monolith — 연결 = PlayerSession, 수용·종료 = sessionLifecycle(acceptSession·closeSession), 프레임 = frameIngest(디코드·디스패치)
//   gateway(4.2c) — 연결 = GatewayConn(로그인 상태 미러), 수용·프레임·종료 = 월드로 IPC(CONN_OPEN·CONN_FRAMES·CONN_CLOSED) —
//     gateway/gatewayCore.ts. 엣지 킥 직전 sink.kicked(원인)로 CONN_CLOSED 사유를 기록한다(monolith 미구현 — 동작 무관).
//     두 모드의 같은 바이트 스트림 결과(통과 프레임·킥·idle 창)가 같음을 tests/server/cluster/clientEdgeParity.test.ts가 고정한다.
// 정책(분리 전 tcpServer와 동작·로그·메트릭 동일, 로그 mod "tcp"):
//   - accept: NoDelay(이동동기화 ③) → 연결 생성 → 수용 판정(sink — 거절이면 sink가 킥) → pre-auth idle 창 + 절대 데드라인
//   - 수신(청크): 종료 중 연결은 파싱하지 않고 inbox 폐기(킥이 입력에 즉시 효력) → inbox 누적 → sink 처리 구간(monolith:
//     deferSends) 안에서 완성 프레임마다 헤더 → size 화이트리스트(본문 도착 전 — OOM 폭탄 차단) → 본문 대기 → rate 게이트 →
//     idle 창 리셋(게이트 통과 프레임만 — 슬롯 선점 방어) → sink.frame(본문 뷰) → consume
//   - idle timeout·pre-auth 데드라인 → KICK 3, size·rate 위반 → KICK 5. 킥 = KICK 프레임 + 링크 우아한 종료.
//   - 구 v1 클라(B1): 연결의 첫 프레임(inbox.consumedTotal 0 — 연결 로컬 사실이라 게이트웨이의 월드 상태 미러 지연과 무관하게 monolith와
//     같은 판정) 헤더가 v1 HELLO 서명(v2로 읽은 len 0x0100·id 0 — net/wireFrame.ts)이면 size 게이트 전에 v1 형식 KICK 1(업데이트 안내 —
//     구 클라가 읽을 수 있는 유일한 형식)을 보내고 닫는다(connRejected{reason="legacy_framing"}, 게이트웨이는 CONN_CLOSED LegacyFraming).
//     서명이 아니면 v2 그대로 — id 0은 예약이라 정상 v2 클라와 겹치지 않는다(첫 프레임 뒤의 id 0은 미지 패킷으로 버려진다).
//   - close: sink.closed(종료 처리) → 데드라인 해제 → (추적 연결이면) "client disconnected"
// 재진입: 로컬 링크의 end()/send() 안에서 Bun close 콜백이 동기 실행된다(outboundLink.ts 상단) — close 본체(sink.closed)는
// 송신·tick 상태 변이를 하지 않는다.

import type { RingByteBuffer } from "../net/ringBuffer";
import { type CounterHandle, metrics, packetIdLabel, packetIdMetricLabel } from "../obs/metrics";
import { createLogger } from "../obs/logger";
import { suppressedMeta } from "../obs/logSquelch";
import { writePacket } from "./packetWriter";
import {
  FRAME_HEADER_BYTES,
  LEGACY_JSON_KICK_FRAME,
  LEGACY_KICK_FRAME,
  frameBodyLenAt,
  framePacketIdAt,
  isLegacyHelloHeader,
} from "../net/wireFrame";
import { PACKET_ID } from "../net/codec.generated";
import { KICK_REASON, type LoginState } from "../identity/loginFlow";
import { packetMaxBodyBytes } from "../net/packetLimits";
import {
  DEFAULT_STRIKE_POLICY,
  type RateVerdict,
  type StrikePolicy,
  type StrikeSuspension,
  type StrikeWindow,
  type TokenBucket,
  rateVerdict,
} from "../net/rateLimit";
import { wireWarnSquelch } from "./wireWarn";
import type { Env } from "../config/env";

const log = createLogger("tcp");
/** 수신 핫패스 메트릭 핸들(성능 3단계 슬라이스 5) — 청크·패킷마다 라벨 키를 만들지 않는다. 노출은 종전과 같다. */
const rxBytes = metrics.netRxBytes.bind(undefined);
const rateReserve = metrics.netRateReserve.bind(undefined);
const rateDropped = metrics.netRateDropped.bind(undefined);

/**
 * 미인증 연결 idle 컷(초) — 핸드셰이크 없이 소켓만 점유(슬로로리스) 차단.
 * 주의: Bun socket.timeout은 4초 단위로 올림되고, 4초 이하 값은 리셋해도 연장되지 않는다(실측) — 아래 인월드 주석.
 */
const PRE_AUTH_IDLE_SEC = 20;
/**
 * 인월드 연결 idle 컷 기본값(초) — env IN_WORLD_IDLE_SEC. 클라는 인월드에서 PING 1 Hz·INPUT_CMD 20 Hz를 보내므로 걸리는 것은 FIN 없이
 * 사라진 유령 연결뿐이다(종전 300초 — 유령이 그동안 IP별·전역 상한 몫을 쥐어 NAT 재부팅 뒤의 자동 재접속이 KICK 9로 막혔다).
 * Bun 소켓 타이머(uSockets) 의미 — 실측: Bun 1.4.3 Windows·Linux(WSL2), 1.3.13 Linux, 회귀 tests/server/net/inWorldIdleStall.test.ts:
 *   - socket.timeout(s)는 "지금 칸 + ⌈s/4⌉칸"을 건다. 칸은 4초마다 도는 스윕 타이머가 하나씩 넘긴다 — 컷은 마지막 리셋 뒤
 *     (⌈s/4⌉−1)×4 ~ ⌈s/4⌉×4초(60 → 56~60초). 4초 이하(1칸)는 리셋해도 같은 칸을 다시 걸 뿐이라 다음 스윕에 반드시 끊긴다.
 *   - 스윕은 벽시계가 아니라 호출 횟수로 센다: 이벤트 루프가 12초 멈춰도 깨어난 뒤 스윕은 한 번(한 칸)만 돈다. 그래서 정지가 창보다
 *     길어도 정지 직전까지 보내던 클라는 끊기지 않고(깨어나면 밀린 프레임이 창을 다시 건다), 조용하던 연결은 정지 뒤 남은 칸만큼
 *     더 살다가 끊긴다 — 정지가 idle 컷을 앞당기지 않는다. 60초(15칸)면 4초 칸 하나의 오차보다 클라 송신 주기가 훨씬 짧다.
 */
export const DEFAULT_IN_WORLD_IDLE_SEC = 60;
/**
 * accept → AUTHENTICATED 절대 데드라인 기본값(ms) — env PRE_AUTH_DEADLINE_SEC. 사람의 로그인 화면
 * 체류(Boot 접속 → 입력 → AUTH_REQ)를 덮는 값. 동시 점유 상한은 서브캡·IP별 미인증 몫이 친다.
 */
export const DEFAULT_PRE_AUTH_DEADLINE_MS = 300_000;

export interface ClientEdgeOptions {
  /** 미인증 idle 컷(초). 테스트에서 축소 주입용. */
  preAuthIdleSec?: number;
  /** 인월드 idle 컷(초). */
  inWorldIdleSec?: number;
  /**
   * accept부터 AUTHENTICATED 도달까지의 절대 상한(ms) — 트래픽과 무관. 초과 시 KICK 3(Idle)
   * "pre-auth deadline". env PRE_AUTH_DEADLINE_SEC.
   */
  preAuthDeadlineMs?: number;
  /** IN_WORLD rate limit KICK 윈도우(ms) — env RATE_KICK_WINDOW_MS. */
  rateKickWindowMs?: number;
  /** 윈도우 내 허용 drop 수 — env RATE_KICK_MAX_DROPS. */
  rateKickMaxDrops?: number;
  /** rate limit 시계(ms). 기본 Date.now — 테스트는 가짜 시계로 벽시계 대기 없이 결정론 검증. */
  now?: () => number;
  /**
   * pre-auth 데드라인 타이머 예약. 기본 setTimeout(+unref) — 테스트는 가짜 타이머로 발화 시점을
   * 직접 고른다(실 타이머는 데드라인 순간의 클라 쓰기와 겹치면 Windows RST로 KICK이 유실될 수 있음).
   */
  setTimer?: (fn: () => void, ms: number) => unknown;
  /** setTimer가 돌려준 핸들 해제. 기본 clearTimeout. */
  clearTimer?: (handle: unknown) => void;
  /** 과부하 신호의 rate 판정 표면 — 과부하 중 IN_WORLD 위반은 연결별 면제 예산 안에서 strike 미기록. 미지정 = 종전 판정. */
  overload?: StrikeSuspension;
}

/** 수신 프레임 게이트 정책 — size/rate 판정과 idle 창. */
export interface IngestPolicy {
  readonly strike: StrikePolicy;
  readonly preAuthIdleSec: number;
  readonly inWorldIdleSec: number;
  /** rate 판정 시계(ms). 미지정 = Date.now. */
  readonly now?: () => number;
  /** 과부하 신호 — 위반 경로에서만 묻는다(면제 예산 안 strike 보류). 미지정 = 종전 판정. */
  readonly overload?: StrikeSuspension;
}

/** 엣지가 쓰는 연결 송신 링크 표면(로컬 OutboundLink). */
export interface EdgeLink {
  readonly closing: boolean;
  end(): void;
  /** drain 콜백 — 부분 쓰기 꼬리를 이어 쓴다. */
  flush(): void;
}

/** 킥 대상 — KICK 프레임 송신 + 우아한 종료. */
export interface Kickable {
  readonly connId: number;
  readonly socket: Pick<EdgeLink, "end">;
  writeOrEnqueue(packetId: number, buf: Buffer): void;
}

/** 엣지가 연결마다 요구하는 상태 — monolith는 PlayerSession, 4.2 게이트웨이는 상태 미러 연결. */
export interface EdgeConn extends Kickable {
  readonly inbox: RingByteBuffer;
  /** 로그인 상태 — rate 한도·idle 창 선택. */
  readonly state: LoginState;
  /** AUTHENTICATED 미도달 — pre-auth 데드라인 대상. */
  readonly preAuth: boolean;
  readonly rateLimiter: TokenBucket;
  readonly commandReserve: TokenBucket;
  readonly rateStrikes: StrikeWindow;
  readonly overloadExempt: TokenBucket;
  /** rate 위반 경고 squelch 키 캐시(flood의 drop마다 키 문자열을 만들지 않게). */
  rateWarnKey: string | null;
  readonly socket: EdgeLink;
}

/** 수신 경로가 쓰는 Bun.Socket 표면 — 테스트 fake도 구조적으로 만족. */
export type EdgeSocket<C extends EdgeConn> = Pick<Bun.Socket<C>, "data" | "remoteAddress" | "timeout">;

/** 엣지 정책 킥의 원인 — idle 타임아웃·pre-auth 데드라인(KICK 3), size·rate 위반(KICK 5), 구 v1 클라(v1 형식 KICK 1). */
export type EdgeKickCause = "idle" | "pre_auth_deadline" | "size" | "rate" | "legacy_framing";

/** 게이트를 통과한 완성 프레임의 처리기. */
export interface FrameSink<C extends EdgeConn> {
  /** body는 이 호출 동안만 유효한 뷰(반환 후 엣지가 consume) — 보관하려면 복사. */
  frame(conn: C, packetId: number, body: Buffer): void;
  /** 청크 1개의 프레임 처리 구간을 감싼다(monolith: deferSends — 디스패치 송신의 턴 끝 코얼레싱). */
  scope<T>(fn: () => T): T;
  /**
   * 엣지 정책 킥 직전 1회(선택) — 게이트웨이가 월드에 알릴 종료 사유(CONN_CLOSED)를 기록한다. monolith는 구현하지 않는다
   * (킥·로그·메트릭은 엣지가 모드와 무관하게 같게 건다).
   */
  kicked?(conn: C, cause: EdgeKickCause): void;
}

/** 모드별 연결 수명주기 + 프레임 처리기. */
export interface EdgeSink<C extends EdgeConn> extends FrameSink<C> {
  /** accept 직후 연결 객체 생성(connId 발급). */
  create(socket: Bun.Socket<C>): C;
  /** 수용 판정 — false면 sink가 이미 KICK·종료를 걸었다(거절 로그·메트릭 포함). */
  admit(conn: C): boolean;
  /** close 콜백 본체 — 반환: 추적되던 연결인가("client disconnected" 로그). 송신·tick 상태 변이 금지(재진입). */
  closed(conn: C): boolean;
}

/**
 * Bun 소켓 콜백 묶음 — `Bun.listen({ socket: createClientEdge(sink, opts) })`. 정책은 파일 헤더.
 * 데드라인 타이머는 이 엣지 인스턴스가 소유한다(close에서 해제).
 */
export function createClientEdge<C extends EdgeConn>(
  sink: EdgeSink<C>,
  opts: ClientEdgeOptions = {},
): Bun.SocketHandler<C> {
  const policy = ingestPolicyFrom(opts);
  const deadlines = createPreAuthDeadlines(sink, opts);
  return {
    open(socket) {
      // 이동동기화 ③: Nagle 비활성 — INPUT_CMD/SNAPSHOT_DELTA 같은 소패킷이 지연ACK과
      // 맞물려 수십 ms 지연되면 재조정 미ack 창(RTT/50ms)이 커져 체감 오차가 증폭된다.
      socket.setNoDelay(true);
      const conn = sink.create(socket);
      socket.data = conn;
      if (!sink.admit(conn)) return;
      socket.timeout(policy.preAuthIdleSec);
      deadlines.arm(conn);
      log.info({ connId: conn.connId, addr: socket.remoteAddress }, "client connected");
    },
    data(socket, chunk) {
      rxBytes.inc(chunk.length);
      ingestEdgeChunk(socket, chunk, sink, policy);
    },
    timeout(socket) {
      metrics.connRejected.inc({ reason: "idle" });
      log.info({ connId: socket.data.connId, state: socket.data.state }, "idle timeout — kick");
      sink.kicked?.(socket.data, "idle");
      kickAndClose(socket.data, KICK_REASON.Idle, "idle timeout");
    },
    close(socket) {
      const conn = socket.data;
      const tracked = sink.closed(conn);
      deadlines.release(conn);
      // 거절(과부하·상한) 연결은 거절 경고가 이미 남았다(squelch) — 접속 폭주에 연결마다 close 로그가 붙지 않게.
      if (tracked) log.info({ connId: conn.connId, addr: socket.remoteAddress }, "client disconnected");
    },
    drain(socket) {
      // 1-C(3): 커널 송신 버퍼에 여유가 생김 — 부분 쓰기로 보관한 꼬리를 이어 쓴다.
      socket.data?.socket.flush();
    },
    error(socket, error) {
      // open 이전에도 발생 가능 — data 미설정 대비 옵셔널 체인. connId/addr 귀속이 핵심.
      log.error({ err: error, connId: socket.data?.connId, addr: socket.remoteAddress }, "socket error");
    },
  };
}

/** env → 클라 엣지 옵션 — monolith 클라 리스너(worldMain)와 게이트웨이(gatewayConfigFromEnv)가 같은 값을 쓰게 한 곳에서. */
export function edgeOptionsFromEnv(
  e: Pick<Env, "RATE_KICK_WINDOW_MS" | "RATE_KICK_MAX_DROPS" | "PRE_AUTH_DEADLINE_SEC" | "IN_WORLD_IDLE_SEC">,
): ClientEdgeOptions {
  return {
    rateKickWindowMs: e.RATE_KICK_WINDOW_MS,
    rateKickMaxDrops: e.RATE_KICK_MAX_DROPS,
    preAuthDeadlineMs: e.PRE_AUTH_DEADLINE_SEC * 1000,
    inWorldIdleSec: e.IN_WORLD_IDLE_SEC,
  };
}

/** 엣지 옵션 → 수신 게이트 정책(기본값 채움). */
export function ingestPolicyFrom(opts: ClientEdgeOptions): IngestPolicy {
  return {
    strike: {
      windowMs: opts.rateKickWindowMs ?? DEFAULT_STRIKE_POLICY.windowMs,
      maxDrops: opts.rateKickMaxDrops ?? DEFAULT_STRIKE_POLICY.maxDrops,
    },
    preAuthIdleSec: opts.preAuthIdleSec ?? PRE_AUTH_IDLE_SEC,
    inWorldIdleSec: opts.inWorldIdleSec ?? DEFAULT_IN_WORLD_IDLE_SEC,
    ...(opts.now !== undefined ? { now: opts.now } : {}),
    ...(opts.overload !== undefined ? { overload: opts.overload } : {}),
  };
}

/** accept → AUTHENTICATED 절대 데드라인 타이머. */
interface PreAuthDeadlines<C> {
  arm(conn: C): void;
  /** close에서 해제 — 소켓 참조를 데드라인까지 붙잡지 않게. */
  release(conn: C): void;
}

function createPreAuthDeadlines<C extends EdgeConn>(sink: FrameSink<C>, opts: ClientEdgeOptions): PreAuthDeadlines<C> {
  const deadlineMs = opts.preAuthDeadlineMs ?? DEFAULT_PRE_AUTH_DEADLINE_MS;
  const setTimer = opts.setTimer ?? unrefTimeout;
  const clearTimer = opts.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const timers = new Map<C, unknown>();
  return {
    arm(conn) {
      const timer = setTimer(() => {
        timers.delete(conn);
        if (!conn.preAuth || conn.socket.closing) return;
        metrics.connRejected.inc({ reason: "pre_auth_deadline" });
        log.info({ connId: conn.connId, state: conn.state, deadlineMs }, "pre-auth deadline — kick");
        sink.kicked?.(conn, "pre_auth_deadline");
        kickAndClose(conn, KICK_REASON.Idle, "pre-auth deadline");
      }, deadlineMs);
      timers.set(conn, timer);
    },
    release(conn) {
      const timer = timers.get(conn);
      if (timer === undefined) return;
      clearTimer(timer);
      timers.delete(conn);
    },
  };
}

/** 데드라인 기본 타이머 — 프로세스 종료를 붙잡지 않게 unref. */
function unrefTimeout(fn: () => void, ms: number): unknown {
  const t = setTimeout(fn, ms);
  t.unref?.();
  return t;
}

/**
 * 수신 청크 1개 — inbox 누적(RingByteBuffer, amortized O(len)) 후 완성 프레임을 게이트(size → rate) 순으로 처리.
 * data 콜백 본체이자 테스트 진입점. 링크가 종료 중(KICK 판정 후 꼬리 flush 대기 ≤5초 포함)이면 파싱하지 않는다 —
 * 킥이 입력에 즉시 효력을 갖게. 처리 구간은 sink.scope(monolith: deferSends — 핸들러 동기 구간·킥의 송신을 턴 끝에
 * 세션당 1회 write, 같은 턴의 다른 소켓 data 콜백이 보낸 프레임까지 합쳐진다).
 */
export function ingestEdgeChunk<C extends EdgeConn>(
  socket: EdgeSocket<C>,
  chunk: Uint8Array,
  sink: FrameSink<C>,
  policy: IngestPolicy,
): void {
  const conn = socket.data;
  if (conn.socket.closing) {
    discardInbox(conn);
    return;
  }
  conn.inbox.appendChunk(chunk);
  sink.scope(() => processBuffer(socket, sink, policy));
  // 이번 청크 처리 중 킥(위반·핸들러)됐으면 남은 바이트는 다시 볼 일이 없다 — 즉시 해제.
  if (conn.socket.closing) discardInbox(conn);
}

function discardInbox(conn: EdgeConn): void {
  const n = conn.inbox.available;
  if (n > 0) conn.inbox.consume(n);
}

function processBuffer<C extends EdgeConn>(socket: EdgeSocket<C>, sink: FrameSink<C>, policy: IngestPolicy): void {
  const conn = socket.data;
  while (!conn.socket.closing && conn.inbox.available >= FRAME_HEADER_BYTES) {
    if (!processFrame(socket, conn, sink, policy)) return;
  }
}

/** 헤더가 도착한 프레임 1개 — 게이트(size → rate) → idle 창 리셋 → sink.frame → consume. false = 루프 중단(본문 미도착·킥). */
function processFrame<C extends EdgeConn>(
  socket: EdgeSocket<C>,
  conn: C,
  sink: FrameSink<C>,
  policy: IngestPolicy,
): boolean {
  const inbox = conn.inbox;
  if (inbox.consumedTotal === 0 && isLegacyHelloHeader(inbox, 0)) {
    sink.kicked?.(conn, "legacy_framing");
    rejectLegacyFraming(socket, conn);
    return false;
  }
  const packetId = framePacketIdAt(inbox, 0);
  const payloadLength = frameBodyLenAt(inbox, 0);

  // Phase B — size 화이트리스트. 헤더만으로 OOM 폭탄을 차단할 수 있으므로
  // 전체 body 도착(`inbox.available < FRAME_HEADER_BYTES + payloadLength`) 검사 *전에* 거른다.
  if (payloadLength > packetMaxBodyBytes(packetId)) {
    sink.kicked?.(conn, "size");
    rejectOversize(socket, conn, packetId, payloadLength);
    return false;
  }
  if (inbox.available < FRAME_HEADER_BYTES + payloadLength) return false;
  if (!passesRateGate(socket, conn, packetId, payloadLength, policy, sink)) return !conn.socket.closing;

  // SEC(슬롯 선점): idle 창은 size/rate 게이트를 통과한 완전 프레임에서만 리셋 — 원시 바이트
  // 수신마다 리셋하면 idle 컷 직전마다 1바이트로 슬롯을 무기한 점유할 수 있었다.
  // 상태 기반 창: 미인증·캐릭터 선택은 짧게, 인월드는 길게.
  socket.timeout(conn.state === "IN_WORLD" ? policy.inWorldIdleSec : policy.preAuthIdleSec);

  // 본문 뷰는 consume 전까지만 유효 — sink는 그 안에서 디코드(monolith)하거나 복사(게이트웨이)한다.
  sink.frame(conn, packetId, inbox.slice(FRAME_HEADER_BYTES, FRAME_HEADER_BYTES + payloadLength));
  inbox.consume(FRAME_HEADER_BYTES + payloadLength);
  return true;
}

/** 구 v1 클라 — v1 형식 KICK 1 프레임(고정 바이트) + 우아한 종료. 접속 폭주에도 경고는 IP별 스쿼시. */
function rejectLegacyFraming<C extends EdgeConn>(socket: EdgeSocket<C>, conn: C): void {
  metrics.connRejected.inc({ reason: "legacy_framing" });
  const sup = wireWarnSquelch.allow(`legacy:${socket.remoteAddress ?? conn.connId}`);
  if (sup >= 0) log.warn(suppressedMeta({ connId: conn.connId }, sup), "legacy v1 client framing — kicked with v1 KICK 1");
  sendFrameAndClose(conn, () => LEGACY_KICK_FRAME);
}

function rejectOversize<C extends EdgeConn>(
  socket: EdgeSocket<C>,
  conn: C,
  packetId: number,
  payloadLength: number,
): void {
  metrics.netSizeViolation.inc({ packet_id: packetIdMetricLabel(packetId) });
  const sup = wireWarnSquelch.allow(`size:${socket.remoteAddress ?? conn.connId}`);
  if (sup >= 0) {
    log.warn(
      suppressedMeta(
        {
          packetId: packetIdLabel(packetId),
          payloadLength,
          maxBytes: packetMaxBodyBytes(packetId),
          connId: conn.connId,
        },
        sup,
      ),
      "packet body size violation",
    );
  }
  kickAndClose(conn, KICK_REASON.Cheat, "body too large");
}

/**
 * Phase B — token bucket rate limit. 디코드 비용 들이기 전에 거른다. true = 처리 진행(통과·명령 예약분).
 * false = 위반: 프레임은 ring에서 뺐다(안 그러면 무한 루프) — drop이면 다음 프레임으로, kick이면 링크 종료.
 * 1-B: IN_WORLD 위반은 drop(strike 윈도우 초과 시에만 KICK), pre-auth는 첫 위반 KICK.
 * 슬라이스 8: 과부하 중 IN_WORLD 위반은 연결별 면제 예산 안에서 strike 미기록(drop만 — 밀린 이벤트 루프의 입력 버스트는
 * 악용 아님). 예산을 넘긴 flood는 과부하 중에도 strike·KICK(3단계 리뷰).
 * 메인 버킷이 빈 동안 IN_WORLD 비스트림 명령은 예약분으로 통과("reserve" — 위반 아님).
 * drop 경로는 flood가 회선 속도로 밟는 곳이라 라벨 객체·키 문자열을 만들지 않는다(묶은 핸들·연결 캐시 키 — 3단계 리뷰).
 */
function passesRateGate<C extends EdgeConn>(
  socket: EdgeSocket<C>,
  conn: C,
  packetId: number,
  payloadLength: number,
  policy: IngestPolicy,
  sink: FrameSink<C>,
): boolean {
  const verdict = rateVerdict(
    conn.rateLimiter,
    conn.rateStrikes,
    conn.state,
    policy.strike,
    policy.now?.() ?? Date.now(),
    packetId,
    conn.commandReserve,
    policy.overload ?? null,
    conn.overloadExempt,
  );
  if (verdict === "pass") return true;
  if (verdict === "reserve") {
    rateReserve.inc();
    return true;
  }
  rateViolationHandle(conn.state).inc();
  warnRateViolation(socket, conn, packetId, verdict);
  conn.inbox.consume(FRAME_HEADER_BYTES + payloadLength);
  if (verdict === "drop") {
    rateDropped.inc();
    return false;
  }
  metrics.netRateKick.inc({ state: conn.state });
  sink.kicked?.(conn, "rate");
  kickAndClose(conn, KICK_REASON.Cheat, "rate limit");
  return false;
}

/** state별 rate 위반 카운터 핸들 — 샘플은 첫 inc 때 생겨 노출 순서는 `inc({state})`와 같다. */
const rateViolationByState = new Map<LoginState, CounterHandle>();

function rateViolationHandle(state: LoginState): CounterHandle {
  let h = rateViolationByState.get(state);
  if (h === undefined) {
    h = metrics.netRateViolation.bind({ state });
    rateViolationByState.set(state, h);
  }
  return h;
}

function warnRateViolation<C extends EdgeConn>(
  socket: EdgeSocket<C>,
  conn: C,
  packetId: number,
  verdict: RateVerdict,
): void {
  conn.rateWarnKey ??= `rate:${socket.remoteAddress ?? conn.connId}`;
  const sup = wireWarnSquelch.allow(conn.rateWarnKey);
  if (sup < 0) return;
  log.warn(
    suppressedMeta({ packetId: packetIdLabel(packetId), state: conn.state, connId: conn.connId, verdict }, sup),
    "rate limit exceeded",
  );
}

/**
 * KICK 송신 후 close. 연결 링크 경유 — 미송신 꼬리가 있으면 KICK을 그 뒤에 붙여 프레임 경계를
 * 보존하고, end는 꼬리 flush 후(상한 시간 내) 닫힌다. data 위반 킥은 수신 디스패치 구간 안이라 KICK이
 * 지연 outbox에 붙지만, end()가 outbox를 먼저 링크로 보내므로(OutboundLink 종료 전 훅) 앞선 응답과 함께 나간다.
 * 월드 쪽 수용 거절(sessionLifecycle)도 같은 함수를 쓴다.
 */
export function kickAndClose(conn: Kickable, reason: number, detail: string): void {
  sendFrameAndClose(conn, () => writePacket(PACKET_ID.KICK, { reason, detail }));
}

/**
 * 구 프로토콜 클라(B1~B2b — v2 프레이밍, JSON KICK만 읽는다) 업데이트 안내: KICK 1 "client update required"를 그들이 읽는 JSON 본문 고정 프레임
 * (net/wireFrame.ts LEGACY_JSON_KICK_FRAME)으로 + 우아한 종료(이진 전환 B3b). HELLO로 구 클라임을 안 두 경로(helloHandler 버전 불일치·frameIngest
 * ANON HELLO 디코드 실패)만 쓴다 — HELLO 전 KICK(접속 제한·idle·엣지 위반)은 버전을 모르므로 바이너리(구 클라는 연결 종료로만 본다).
 * 월드가 고른 프레임을 게이트웨이는 그대로 전달한다(원시 바이트).
 */
export function kickLegacyJsonClient(conn: Kickable): void {
  sendFrameAndClose(conn, () => LEGACY_JSON_KICK_FRAME);
}

/** KICK 프레임 1개 송신(실패는 로그 — 종료는 반드시) + 우아한 종료. kickAndClose·구 클라 거절 공용. */
function sendFrameAndClose(conn: Kickable, frame: () => Buffer): void {
  try {
    conn.writeOrEnqueue(PACKET_ID.KICK, frame());
  } catch (err) {
    log.error({ err, connId: conn.connId }, "kick write failed");
  }
  conn.socket.end();
}
