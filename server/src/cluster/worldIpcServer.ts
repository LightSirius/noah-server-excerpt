// 월드 IPC 서버 — 성능 4단계(게이트웨이 분리) 4.2b. 게이트웨이 IPC 연결(IpcPipe — SocketPipe 또는 MemoryPipe)을 받아 그 위의
// 클라 연결을 PlayerSession(링크 = RemoteClientLink)으로 운영한다. 클라 연결의 수용·디스패치·종료는 monolith와 같은 함수다:
//   CONN_OPEN   → sessionLifecycle.acceptSession(실제 클라 IP — 연결 상한·미인증 몫·과부하 접속 제한). 거절이면 그 함수가 KICK 9
//                 + 링크 종료를 걸어 DELIVER(KICK) + CONN_CLOSE가 나가고, 수용이면 CONN_ACCEPTED(localId, worldConnId).
//                 localId는 게이트웨이 incarnation 안에서 단조 증가해야 한다(재사용·역행 = 프로토콜 위반 → 피어 정리).
//   (바쁜 피어) → 성능 4.5 접속 제한: 피어의 IPC 대기가 소프트 임계(admission.softBytes) 이상이면 그 피어의 CONN_OPEN은 세션을 만들지
//                 않고(연결 회계·connId 무접촉) DELIVER(KICK 9 "server busy") + CONN_CLOSE를 긴급 송신한다(gatewayPeer.refuseOpen). 순서:
//                 draining(KICK 6) → 피어 busy → acceptSession(과부하 → 상한). 하드 상한 drop(IPC_MAX_PENDING_MB)은 그대로 최후 안전판.
//   CONN_FRAMES → 배치 1개 = 수신 디스패치 구간 1개(deferSends — monolith data 콜백과 같다) 안에서 frameIngest(사전 판정·디코드·라우터).
//                 rate·size는 게이트웨이가 이미 걸렀고, 상태 머신(isPacketAllowedInState)과 디코드 실패 strike(KICK 5)는 월드가
//                 강제한다(frameIngest — 디코드 전 사전 판정 packetAdmission.admitPacket). 미추적
//                 localId(닫힌 뒤 늦은 레코드 등)는 무시(mmorpg_ipc_stale_records_total), 종료 중(킥된) 세션 프레임은 건너뛴다.
//   CONN_CLOSED → closeSession(종료 flush → despawn → 회계 해제 — monolith close 콜백과 같은 순서). 거절된 연결도 여기서 정리.
//   피어 유실   → closeSessions(그 피어 연결 전부 — 외곽 tx 1개 배치 저장). 사유: peer(상대가 끊음)·bye(BYE 뒤 끊음 — 예고된
//                 이탈·롤링 재시작)·dead(heartbeat)·backpressure(IPC_MAX_PENDING_MB 초과 — OOM 대신 fail fast)·error·replaced·
//                 protocol·closed.
// 우아한 종료(4.3a, worldMain): stopAdmitting(이후 HELLO는 closed 거절, CONN_OPEN은 회계 없이 KICK 6 "server shutdown") →
//   최종 저장 → shutdown(SHUTDOWN(kickReason) — 게이트웨이가 전원 킥 후 CONN_CLOSED, 월드는 연결마다 closeSession) → 연결이 다
//   빠지거나(피어 유실 포함) 상한 → close(남은 세션 배치 저장 1회).
// 핸드셰이크·펜싱: 첫 메시지 HELLO → HELLO_ACK(ipcVer, worldIncarnation, connCap). 거절은 말없는 끊김이 아니라 HELLO_NACK(사유)
//   뒤 우아한 종료 — 게이트웨이가 "월드 다운"(재접속)과 거절(사유별 정책 — gatewayMain)을 구분한다. 판정 순서: auth(HELLO token ≠
//   IPC_TOKEN, 미설정 = 빈 값 — 피어 표·펜싱 기록을 보지도 바꾸지도 않는다: loopback에 닿는 로컬 프로세스가 살아 있는 GATEWAY_ID를
//   사칭해 그 세션 전부를 끊거나 CONN_OPEN으로 클라 IP를 위조하지 못한다) → closed(종료 중) → fenced. 버전 불일치는 NACK(version),
//   그 밖의 첫 메시지 위반은 NACK 없이 끊는다(protocol). 같은 GATEWAY_ID로 HELLO가 오면 옛 피어를 먼저 정리한다(그 연결은 새
//   incarnation으로 이월되지 않는다). 다른 incarnation이 등록되면 직전 incarnation은 은퇴 — 그 값으로 다시 오는 HELLO(멈췄다 깨어난
//   옛 프로세스)는 거절한다(fenced). incarnation은 순서가 아니라 동일성만 비교한다(게이트웨이가 기동마다 무작위 u32를 고른다 — 4.2c).
// 인증 전 연결 제한(4단계 리뷰): 핸드셰이크 전 봉투 상한 1 KiB(코덱), HELLO 데드라인(helloTimeoutMs — timeout), 동시 미완료
//   핸드셰이크 상한(maxPendingHandshakes — 넘으면 즉시 끊기, busy). 연결당 수신 링 초기 64 KiB라 최악 상한 × 64 KiB. close() 뒤
//   받아들인 파이프는 데드라인·링 없이 즉시 끊는다(closed — 리스너 중지 순서에 기대지 않는다).
// 접속 제한 평가(성능 4.5): flushAll(tick 끝·턴 끝)마다 모든 피어 — 대기 ≥ soft면 busy, ≤ clear가 hold 동안이면 clear. 전이마다 피어가
//   ADMISSION을 긴급 송신한다(게이트웨이가 새 클라를 CONN_OPEN 전에 거절). admission 미설정(기본 — 테스트·토폴로지) = 평가 없음.
// 리스너 양보(IPC v14 — listenPlan·worldListen): LISTEN_REPORT 수신·피어 등록·정리·BYE·소프트 임계 전이·종료 드레인 시작마다 재계획해, 닫힌
//   피어는 같은 공유 포트에 다른 열린 리스너가 있을 때만 LISTEN yield, 나머지는 listen(바뀐 지시만 긴급 송신).
// flush: 피어 배치는 tick 끝(serverTick ipcFlush → flushAll — withCork uncork 직후)과 이벤트 루프 턴 끝(deferredSends 턴 끝 훅 —
//   대기 세션 flush 뒤)에 봉투째 나간다. 한 턴·한 tick의 응답은 게이트웨이당 DELIVER 봉투 1개(분할 임계 이하)다. 둘 다 flush 창의
//   끝이다 — 그 창에 MULTICAST(성능 4.5 F2, multicast 옵션 — sendMany 팬아웃)가 있었으면 피어가 CONN_FLUSH로 창을 닫는다. 공유 프레임
//   (성능 4.5 F3, shared 옵션)을 참조하는 세션 flush는 같은 봉투를 CONN_DELIVER_SHARED로 연다(DEF + CONN_REF, 이후 평문은 CONN 레코드).
// 재진입: 파이프 close 통지는 마이크로태스크라 flush·기록 도중 파이프가 닫혀도 피어 정리(closeSessions)가 tick·송신 루프 안으로
//   재진입하지 않는다. 디스패치 중 피어가 정리되면(같은 청크의 위반) 디코더를 멈춰 남은 봉투를 버린다.

import { createHash, timingSafeEqual } from "node:crypto";
import type { Dispatch } from "../network/packetRouter";
import { PlayerSession } from "../network/session";
import { sessionManager } from "../network/sessionManager";
import { acceptSession, closeSession, closeSessions, kickForShutdown } from "../network/sessionLifecycle";
import { addTurnEndHook, deferSends, requestTurnEndFlush } from "../network/deferredSends";
import { ingestFrame } from "../network/frameIngest";
import { writePacket } from "../network/packetWriter";
import { PACKET_ID } from "../net/codec.generated";
import { KICK_REASON } from "../identity/loginFlow";
import type { OverloadView } from "../net/overloadSignal";
import { metrics, registry } from "../obs/metrics";
import { createLogger } from "../obs/logger";
import { createSquelch, suppressedMeta } from "../obs/logSquelch";
import {
  type AdmissionTransition,
  GatewayPeer,
  type PeerAdmissionPolicy,
  type PeerShedPolicy,
  assertPeerAdmissionPolicy,
  assertPeerShedPolicy,
} from "./gatewayPeer";
import {
  type IpcDecoder,
  type IpcDecoderOptions,
  IpcProtocolError,
  type IpcWriterOptions,
  WorldIpcWriter,
  createWorldSideDecoder,
} from "./ipcCodec";
import type { IpcPipe, IpcPipeHandlers, PipeCloseReason, PipeTimers } from "./ipcPipe";
import {
  type ConnClosedReason,
  type ConnFrame,
  type GatewayToWorldMsg,
  HELLO_NACK_LABELS,
  HELLO_NACK_REASON,
  type HelloMsg,
  type HelloNackLabel,
  type HelloNackReason,
  IPC_MSG,
} from "./ipcSchema";
import { RemoteClientLink } from "./remoteClientLink";
import { replanListen } from "./worldListen";

const log = createLogger("ipc.world");
/** 클라 연결 수명주기 로그는 monolith와 같은 mod — 운영 로그 grep 호환(게이트웨이 경유는 gatewayId·localId 필드가 붙는다). */
const tcpLog = createLogger("tcp");
const ipcRxBytes = metrics.ipcRxBytes.bind(undefined);
const staleFrames = metrics.ipcStaleRecords.bind({ type: "frames" });
const staleClosed = metrics.ipcStaleRecords.bind({ type: "closed" });

/** 이 프로세스의 살아 있는 월드 IPC 서버 — scrape 시점 mmorpg_ipc_pending_bytes 합(close에서 빠진다). */
const liveServers = new Set<WorldIpcServer>();
registry.addCollector(() => {
  let n = 0;
  metrics.ipcPeerPendingBytes.clear();
  metrics.ipcPeerAdmissionBusy.clear();
  for (const server of liveServers) n += server.collectPeerGauges();
  metrics.ipcPendingBytes.set(n);
});
// 바쁜 피어의 CONN_OPEN 거절 warn — 접속 폭주에도 초당 1줄(억제분은 suppressed로). 메트릭은 항상.
const admissionWarnSquelch = createSquelch({ ratePerSec: 1, burst: 5 });
/** 바쁜 피어의 새 연결에 보내는 KICK 프레임(monolith rejectBusy와 같은 바이트) — 첫 거절 때 1회 만든다. */
let busyKick: Buffer | null = null;
/** 감축 로그에 싣는 connId 수 상한(사고 분석용 — 전원을 싣지 않는다). */
const SHED_LOG_IDS = 32;

/** KICK 9 "server busy" 프레임(바쁜 피어의 CONN_OPEN 거절·감축 공용, 지연 생성). */
function busyKickFrame(): Buffer {
  busyKick ??= writePacket(PACKET_ID.KICK, { reason: KICK_REASON.ServerFull, detail: "server busy" });
  return busyKick;
}

/** 게이트웨이별 기억할 은퇴 incarnation 기본 수. */
const DEFAULT_FENCED_INCARNATIONS = 16;
/** HELLO 데드라인 기본값(ms) — 게이트웨이는 접속 직후 HELLO를 보낸다. */
export const DEFAULT_HELLO_TIMEOUT_MS = 5000;
/** 동시 미완료 핸드셰이크 기본 상한 — 연결당 수신 링 초기 64 KiB라 최악 4 MiB. */
export const DEFAULT_MAX_PENDING_HANDSHAKES = 64;
/** 핸드셰이크 거절 사유(mmorpg_ipc_hello_rejected_total{reason}) — NACK 사유 + NACK 없이 끊는 사유. */
type HelloRejectReason = HelloNackLabel | "protocol" | "timeout" | "busy";
// 거절 warn — 로컬 접속 폭주에도 사유당 초당 1줄(억제분은 suppressed로). 메트릭은 항상.
const rejectWarnSquelch = createSquelch({ ratePerSec: 1, burst: 5 });
const IGNORE_HANDLERS: IpcPipeHandlers = { data: () => {}, close: () => {} };
/** HELLO 데드라인 타이머 표면(테스트 주입점). */
export type HandshakeTimers = Pick<PipeTimers, "setTimeout" | "clearTimeout">;
/**
 * 기본 데드라인 타이머 — ref(파이프 heartbeat와 달리 unref하지 않는다: 대기 연결이 있는 동안만 걸리고 HELLO·끊김·close()가
 * 해제하므로 프로세스 종료를 붙잡지 않으며, unref 타이머 하나만 남은 이벤트 루프가 발화 전에 잠드는 일이 없다).
 */
const HANDSHAKE_TIMERS: HandshakeTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** HELLO token 비교 키 — 길이가 다른 값도 같은 길이로 비교한다(timingSafeEqual). */
function tokenDigest(token: Uint8Array): Buffer {
  return createHash("sha256").update(token).digest();
}
/**
 * shutdown 드레인 상한 기본값(ms) — 게이트웨이 클라 링크의 킥 end-after-flush 상한(OutboundLink 5 s) + IPC 왕복 여유. 넘기면 남은
 * 연결은 close()의 배치 저장으로 정리된다.
 */
export const DEFAULT_SHUTDOWN_DRAIN_MS = 10_000;

/** 피어 정리 사유(mmorpg_ipc_peer_lost_total{reason}). */
export type PeerLossReason = Exclude<PipeCloseReason, "local"> | "bye" | "replaced" | "protocol" | "closed";

export interface WorldShutdownOptions {
  /** 게이트웨이가 클라에게 보낼 KICK reason(기본 KICK_REASON.ServerShutdown = 6). */
  kickReason?: number;
  /** CONN_CLOSED를 기다릴 상한(ms, 기본 DEFAULT_SHUTDOWN_DRAIN_MS). */
  timeoutMs?: number;
}

export interface WorldShutdownResult {
  /** SHUTDOWN을 보낸 피어 수. */
  peers: number;
  /** 상한까지 닫히지 않은 연결 수(close()가 배치 저장으로 정리). */
  remaining: number;
  /** stopAdmitting 이후 KICK 6으로 돌려보낸 CONN_OPEN 수. */
  refusedOpens: number;
}

/** 클라 연결 수명주기(기본 = network/sessionLifecycle) — 테스트가 배치 저장 호출을 관측하려고 주입한다. */
export interface SessionLifecycle {
  accept(session: PlayerSession, overload?: OverloadView): boolean;
  close(session: PlayerSession): boolean;
  closeMany(sessions: readonly PlayerSession[]): number;
}

const DEFAULT_LIFECYCLE: SessionLifecycle = { accept: acceptSession, close: closeSession, closeMany: closeSessions };

export interface WorldIpcServerOptions {
  /** packetRouter.createRouter(ctx) — monolith와 같은 디스패치. */
  dispatch: Dispatch;
  /** 월드 기동마다 새 값(HELLO_ACK) — 게이트웨이가 새 월드를 알아보고 연결을 이월하지 않는다. u32. */
  worldIncarnation: number;
  /** HELLO_ACK connCap — 월드 전역 연결 상한(MAX_CONNECTIONS). 게이트웨이 엣지 상한이 이를 넘지 않게 한다. u32. */
  connCap: number;
  /** 과부하 신호 — 신규 접속 제한(acceptSession). 미지정 = 상한만. */
  overload?: OverloadView;
  /** 월드 connId 발급(기본 sessionManager.nextConnId — monolith와 같은 단조 공간). */
  nextConnId?: () => number;
  lifecycle?: SessionLifecycle;
  /** 송신 봉투 상한·분할(테스트 축소용) — 게이트웨이 디코더 상한과 같아야 한다. */
  writer?: IpcWriterOptions;
  /** 수신 봉투 상한(테스트 축소용). */
  decoder?: IpcDecoderOptions;
  /** 피어 배치가 이 바이트 이상이면 즉시 flush(기본 1 MiB). */
  flushAtBytes?: number;
  /** 게이트웨이별 기억할 은퇴 incarnation 수(기본 16). */
  fencedIncarnations?: number;
  /** 공유 비밀(env IPC_TOKEN) — HELLO token이 이와 다르면 NACK(auth). 미지정 = 빈 값(빈 token HELLO만 받는다). */
  ipcToken?: string;
  /** 접속 후 HELLO까지의 상한(ms, 기본 5000) — 넘으면 끊는다. */
  helloTimeoutMs?: number;
  /** 동시 미완료 핸드셰이크 상한(기본 64) — 넘는 새 연결은 즉시 끊는다. */
  maxPendingHandshakes?: number;
  /** HELLO 데드라인 타이머(기본 실제 타이머). */
  timers?: HandshakeTimers;
  /** 피어별 IPC 소프트 임계(성능 4.5, env IPC_ADMISSION_*). 미지정 = 평가 없음(종전 동작). */
  admission?: PeerAdmissionPolicy;
  /** 피어 점진 감축(4.5 후속, env IPC_SHED_*). 미지정 = 감축 없음(종전 — 하드 상한 drop만). */
  shed?: PeerShedPolicy;
  /** 감축 대상 무작위 선택의 난수원([0,1)). 기본 Math.random — 시험은 결정론 주입. 시뮬 밖(cluster/)이라 결정론 규칙 대상이 아니다. */
  shedRandom?: () => number;
  /** 접속 제한 hold·감축 쿨다운 시계(ms). 기본 performance.now. */
  now?: () => number;
  /**
   * MULTICAST(성능 4.5 F2, env IPC_MULTICAST) — 세션 링크에 피어를 MULTICAST 싱크로 준다(sendMany 팬아웃 = 게이트웨이당 레코드 1개).
   * 기본 true. false = 종전 연결별 DELIVER만(클라 바이트는 같다 — A/B·킬 스위치). sendMany 묶음 경로 자체는 세션 관리자 쪽 스위치라
   * 배선(worldMain·토폴로지)이 그 관리자에 enableMulticast()를 명시로 부른다 — 생성자는 프로세스 싱글턴을 건드리지 않는다(4.5 리뷰).
   */
  multicast?: boolean;
  /**
   * 공유 프레임(성능 4.5 F3, env IPC_SHARED) — 세션 링크에 피어를 공유 싱크로 준다(같은 셀 viewer의 SNAPSHOT_DELTA = 게이트웨이 봉투당 DEF 1개 +
   * 연결별 ackSeq). 기본 true. false = 세션이 복사·패치해 연결별 DELIVER(클라 바이트는 같다 — A/B·킬 스위치).
   */
  shared?: boolean;
}

/** 파이프 1개의 수신 상태 — HELLO 전에는 peer가 없다. */
interface PipeCtx {
  readonly pipe: IpcPipe;
  decoder: IpcDecoder | null;
  peer: GatewayPeer | null;
  /** HELLO 데드라인 타이머(핸드셰이크 대기 중에만). */
  helloTimer: unknown;
}

/** 게이트웨이별 incarnation 기록 — 현재 값과 은퇴 목록(펜싱). */
interface IncarnationRecord {
  current: number;
  readonly retired: number[];
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

export class WorldIpcServer {
  private readonly peers = new Map<number, GatewayPeer>();
  private readonly incarnations = new Map<number, IncarnationRecord>();
  /** HELLO를 기다리는 파이프(미완료 핸드셰이크). */
  private readonly handshaking = new Set<PipeCtx>();
  /** flush 대기 피어(중복 허용 — 빈 flush는 무동작). 두 배열을 번갈아 써 턴마다 할당하지 않는다. */
  private dirty: GatewayPeer[] = [];
  private spare: GatewayPeer[] = [];
  private closed = false;
  /** stopAdmitting 이후 — HELLO 거절·CONN_OPEN 즉시 킥. */
  private draining = false;
  private refusedOpens = 0;
  /** shutdown 드레인 대기자 — 연결이 다 빠지면 깨운다. */
  private drainWaiter: (() => void) | null = null;
  private readonly unhook: () => void;
  private readonly lifecycle: SessionLifecycle;
  /** tick 끝 flush가 감축 평가를 턴 뒤로 미뤘다(중복 예약 방지). */
  private shedScheduled = false;
  private readonly nextConnId: () => number;
  private readonly fencedMax: number;
  private readonly tokenKey: Buffer;
  private readonly helloTimeoutMs: number;
  private readonly maxHandshaking: number;
  private readonly timers: HandshakeTimers;
  private readonly now: () => number;

  constructor(private readonly opts: WorldIpcServerOptions) {
    if (opts.admission !== undefined) assertPeerAdmissionPolicy(opts.admission); // 부수효과(훅·등록) 전에.
    if (opts.shed !== undefined) assertPeerShedPolicy(opts.shed);
    this.lifecycle = opts.lifecycle ?? DEFAULT_LIFECYCLE;
    this.nextConnId = opts.nextConnId ?? (() => sessionManager.nextConnId());
    this.fencedMax = opts.fencedIncarnations ?? DEFAULT_FENCED_INCARNATIONS;
    this.tokenKey = tokenDigest(Buffer.from(opts.ipcToken ?? "", "utf8"));
    this.helloTimeoutMs = opts.helloTimeoutMs ?? DEFAULT_HELLO_TIMEOUT_MS;
    this.maxHandshaking = opts.maxPendingHandshakes ?? DEFAULT_MAX_PENDING_HANDSHAKES;
    this.timers = opts.timers ?? HANDSHAKE_TIMERS;
    this.now = opts.now ?? (() => performance.now());
    // 턴 끝 flush — 대기 세션(지연 outbox)이 피어 배치에 DELIVER를 쌓은 뒤 같은 setImmediate에서 봉투째 보낸다.
    this.unhook = addTurnEndHook(() => this.flushAll());
    liveServers.add(this);
  }

  /**
   * 받아들인 파이프의 핸들러 — `listenIpc(addr, (pipe) => server.handlersFor(pipe), pipeOpts)` 또는 MemoryPipe.attach.
   * 미완료 핸드셰이크가 상한이면(busy) 또는 close() 뒤면(closed — 리스너 중지와 close() 호출 순서에 기대지 않는다: 데드라인
   * 타이머·수신 링을 잡지 않게) 파이프를 바로 닫고 무동작 핸들러를 돌려준다.
   */
  handlersFor(pipe: IpcPipe): IpcPipeHandlers {
    if (this.closed) {
      this.noteRejected("closed", {});
      pipe.destroy("local");
      return IGNORE_HANDLERS;
    }
    if (this.handshaking.size >= this.maxHandshaking) {
      this.noteRejected("busy", { handshaking: this.handshaking.size });
      pipe.destroy("local");
      return IGNORE_HANDLERS;
    }
    const ctx: PipeCtx = { pipe, decoder: null, peer: null, helloTimer: null };
    ctx.decoder = createWorldSideDecoder((msg) => this.onMessage(ctx, msg), this.opts.decoder);
    this.handshaking.add(ctx);
    ctx.helloTimer = this.timers.setTimeout(() => this.onHelloTimeout(ctx), this.helloTimeoutMs);
    return {
      data: (chunk) => this.onData(ctx, chunk),
      close: (reason, error) => this.onPipeClosed(ctx, reason, error),
    };
  }

  /**
   * 대기 피어 배치를 전부 봉투째 보낸 뒤 접속 제한·감축을 평가한다 — tick 끝(serverTick ipcFlush, fromTick)·턴 끝 훅. 던지지 않는다.
   * 감축은 tick 안에서 하지 않는다(fromTick이면 setImmediate로 미룬다) — 감축 세션의 동기 배치 저장·despawn이 tick을 늘려 월드 전역
   * 과부하 신호로 번지지 않게(4.5 후속 리뷰). 운영에선 tick 중 첫 IPC 기록이 턴 끝 훅을 먼저 예약하므로 대개 그 훅의 flushAll()이 먼저
   * 평가하고 이 immediate는 쿨다운에 막힌다 — 둘 다 tick 밖이다.
   */
  flushAll(fromTick = false): void {
    const list = this.dirty;
    if (list.length > 0) {
      this.dirty = this.spare;
      for (let i = 0; i < list.length; i++) this.flushPeer(list[i]!);
      list.length = 0;
      this.spare = list;
    }
    if (this.opts.admission !== undefined) this.evaluateAdmission(this.opts.admission);
    if (this.opts.shed === undefined) return;
    if (!fromTick) this.evaluateShed(this.opts.shed);
    else if (!this.shedScheduled) {
      this.shedScheduled = true;
      setImmediate(() => {
        this.shedScheduled = false;
        if (!this.closed && this.opts.shed !== undefined) this.evaluateShed(this.opts.shed);
      });
    }
  }

  /**
   * scrape 수집 — 피어별 대기·busy 게이지를 채우고 피어 파이프 미전송 합을 돌려준다(백프레셔 여유 — 피어마다 IPC_MAX_PENDING_MB를
   * 넘으면 그 피어가 끊긴다). 수집기가 먼저 게이지를 비운다.
   */
  collectPeerGauges(): number {
    let n = 0;
    for (const peer of this.peers.values()) {
      const labels = { gateway: peer.info.gatewayId };
      const pending = peer.pipe.pendingBytes;
      metrics.ipcPeerPendingBytes.set(labels, pending);
      metrics.ipcPeerAdmissionBusy.set(labels, peer.admissionBusy ? 1 : 0);
      n += pending;
    }
    return n;
  }

  peerCount(): number {
    return this.peers.size;
  }

  peerOf(gatewayId: number): GatewayPeer | undefined {
    return this.peers.get(gatewayId);
  }

  /** 게이트웨이 연결의 세션(진단·테스트). */
  sessionOf(gatewayId: number, localId: number): PlayerSession | undefined {
    return this.peers.get(gatewayId)?.conns.get(localId);
  }

  /** 피어들이 추적 중인 클라 연결 수(거절·킥 뒤 CONN_CLOSED 대기 포함). */
  connectionCount(): number {
    let n = 0;
    for (const peer of this.peers.values()) n += peer.conns.size;
    return n;
  }

  /** 우아한 종료 1단계 — 이후 HELLO는 closed로 거절, CONN_OPEN은 회계 없이 KICK 6 "server shutdown" + CONN_CLOSE. idempotent. */
  stopAdmitting(): void {
    this.draining = true;
    this.rebalanceListen(); // 양보 중인 피어를 전부 되돌린다(종료 순서는 게이트웨이의 SHUTDOWN 처리가 정한다).
  }

  /**
   * 우아한 종료 2단계 — 살아 있는 피어마다 SHUTDOWN(kickReason)을 즉시 보내고(게이트웨이: 리스너 중지 + 전원 킥 + CONN_CLOSED),
   * 연결이 다 빠질 때(CONN_CLOSED·피어 유실)까지 또는 timeoutMs까지 기다린다. 피어는 닫지 않는다 — 이어서 close().
   * stopAdmitting을 겸한다.
   */
  async shutdown(opts: WorldShutdownOptions = {}): Promise<WorldShutdownResult> {
    this.stopAdmitting();
    const kickReason = opts.kickReason ?? KICK_REASON.ServerShutdown;
    const peers = [...this.peers.values()];
    for (const peer of peers) {
      peer.shutdown(kickReason);
      this.flushPeer(peer);
    }
    if (this.connectionCount() > 0) await this.waitDrained(opts.timeoutMs ?? DEFAULT_SHUTDOWN_DRAIN_MS);
    const result = { peers: peers.length, remaining: this.connectionCount(), refusedOpens: this.refusedOpens };
    log.info(result, "gateway shutdown drain finished");
    return result;
  }

  /** 모든 피어 정리(closed — 세션 배치 저장 후 종료)·미완료 핸드셰이크 끊기·턴 끝 훅 해제. 이후 HELLO는 거절. idempotent. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    liveServers.delete(this);
    this.unhook();
    for (const ctx of [...this.handshaking]) this.dropPipe(ctx, "local");
    for (const peer of [...this.peers.values()]) this.teardown(peer, "closed");
  }

  /** 피어 배치 flush — 던지면 그 게이트웨이를 끊는다(flushAll·shutdown 공용). */
  private flushPeer(peer: GatewayPeer): void {
    try {
      peer.flush();
    } catch (err) {
      log.error({ err, gatewayId: peer.info.gatewayId }, "ipc flush failed — dropping gateway");
      this.teardown(peer, "error", toError(err));
    }
  }

  /** 연결이 다 빠지거나 ms가 지나면 resolve. 타이머는 ref — 호출자(종료 경로)가 이 대기를 기다리는 동안 루프를 붙잡는다. */
  private waitDrained(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        this.drainWaiter = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.drainWaiter = done;
    });
  }

  /** 드레인 대기 중이고 연결이 다 빠졌으면 깨운다. */
  private checkDrained(): void {
    if (this.drainWaiter !== null && this.connectionCount() === 0) this.drainWaiter();
  }

  private onData(ctx: PipeCtx, chunk: Buffer): void {
    ipcRxBytes.inc(chunk.length);
    try {
      ctx.decoder?.push(chunk);
    } catch (err) {
      this.onStreamError(ctx, err);
    }
  }

  /** 디코더 위반(IpcProtocolError) 또는 메시지 처리 예외 — 스트림 위치를 믿을 수 없으므로 피어(없으면 파이프)를 끊는다. */
  private onStreamError(ctx: PipeCtx, err: unknown): void {
    const error = toError(err);
    const kind = err instanceof IpcProtocolError ? err.kind : "handler_threw";
    const peer = ctx.peer;
    if (peer === null) {
      if (err instanceof IpcProtocolError && err.kind === "version_mismatch") {
        this.refuse(ctx, HELLO_NACK_REASON.Version, { peerVersion: err.peerVersion });
        return;
      }
      this.noteRejected("protocol", { err: error, kind });
      this.dropPipe(ctx, "error", error);
      return;
    }
    log.error({ err: error, kind, gatewayId: peer.info.gatewayId }, "ipc stream error — dropping gateway");
    this.teardown(peer, err instanceof IpcProtocolError ? "protocol" : "error", error);
  }

  private onPipeClosed(ctx: PipeCtx, reason: PipeCloseReason, error: Error | undefined): void {
    const peer = ctx.peer;
    if (peer === null) {
      this.settle(ctx); // 핸드셰이크 전 끊김·거절 — 대기 표에서만 뺀다.
      return;
    }
    // local = 이미 teardown이 닫았다(kill이 먼저 live를 내려 아래는 무동작). BYE 뒤 상대가 끊으면 예고된 이탈(bye).
    const loss: PeerLossReason =
      reason === "local" ? "closed" : reason === "peer" && peer.byeReason !== null ? "bye" : reason;
    this.teardown(peer, loss, error);
  }

  private onMessage(ctx: PipeCtx, msg: GatewayToWorldMsg): void {
    if (msg.type === IPC_MSG.HELLO) {
      this.onHello(ctx, msg);
      return;
    }
    const peer = ctx.peer;
    if (peer === null || !peer.alive) return;
    switch (msg.type) {
      case IPC_MSG.PING:
        peer.pong(msg.seq);
        return;
      case IPC_MSG.BYE:
        peer.byeReason = msg.reason;
        log.info({ ...peer.info, reason: msg.reason, conns: peer.conns.size }, "gateway leaving (BYE)");
        this.rebalanceListen(); // 떠나는 피어는 열린 리스너가 아니다.
        return;
      case IPC_MSG.LISTEN_REPORT:
        peer.noteListenReport(msg);
        this.rebalanceListen();
        return;
      case IPC_MSG.CONN_OPEN:
        this.onConnOpen(peer, msg.localId, msg.addr);
        return;
      case IPC_MSG.CONN_FRAMES:
        this.onFrames(peer, msg.frames);
        return;
      case IPC_MSG.CONN_CLOSED:
        this.onConnClosed(peer, msg.localId, msg.reason);
        return;
    }
  }

  private onHello(ctx: PipeCtx, m: HelloMsg): void {
    const { gatewayId, incarnation } = m;
    const refusal = this.helloRefusal(m);
    if (refusal !== null) {
      this.refuse(ctx, refusal, { gatewayId, incarnation, pid: m.pid });
      return;
    }
    this.settle(ctx);
    const prev = this.peers.get(gatewayId);
    if (prev !== undefined) this.teardown(prev, "replaced");
    this.recordIncarnation(gatewayId, incarnation);
    const peer = new GatewayPeer({ gatewayId, incarnation, pid: m.pid }, ctx.pipe, ctx.decoder!, {
      onDirty: (p) => this.markDirty(p),
      ...(this.opts.writer !== undefined ? { writer: this.opts.writer } : {}),
      ...(this.opts.flushAtBytes !== undefined ? { flushAtBytes: this.opts.flushAtBytes } : {}),
    });
    ctx.peer = peer;
    this.peers.set(gatewayId, peer);
    metrics.ipcPeers.set(this.peers.size);
    peer.helloAck(this.opts.worldIncarnation, this.opts.connCap);
    peer.flush();
    log.info({ gatewayId, incarnation, pid: m.pid }, "gateway connected");
    this.rebalanceListen(); // 새 피어는 보고 전이라 열린 리스너가 아니다 — 교체였으면 teardown이 이미 다시 짰다.
  }

  private onConnOpen(peer: GatewayPeer, localId: number, addr: string): void {
    if (!peer.admitLocalId(localId)) {
      log.error({ gatewayId: peer.info.gatewayId, localId }, "CONN_OPEN localId reused or out of order — protocol violation");
      this.teardown(peer, "protocol");
      return;
    }
    const remote = addr === "" ? undefined : addr;
    if (!this.draining && peer.admissionBusy) {
      this.refuseBusyPeer(peer, localId, remote);
      return;
    }
    const cast = this.opts.multicast === false ? null : peer;
    const shared = this.opts.shared === false ? null : peer;
    const session = new PlayerSession(
      (flushSession) => new RemoteClientLink(peer, localId, remote, flushSession, cast, shared),
      this.nextConnId(),
    );
    // 거절된 연결도 CONN_CLOSED까지 표에 둔다 — monolith처럼 close 경로(closeSession = false)로 정리된다.
    peer.conns.set(localId, session);
    if (this.draining) {
      this.refusedOpens++;
      kickForShutdown(session);
      return;
    }
    if (!this.lifecycle.accept(session, this.opts.overload)) return;
    peer.connAccepted(localId, session.connId);
    tcpLog.info({ connId: session.connId, addr: remote, gatewayId: peer.info.gatewayId, localId }, "client connected");
  }

  private onFrames(peer: GatewayPeer, frames: readonly ConnFrame[]): void {
    const dispatch = this.opts.dispatch;
    // 배치 1개 = 수신 디스패치 구간 1개 — 핸들러 동기 구간의 송신은 턴 끝에 세션당 1회 피어 배치로(deferredSends).
    deferSends(() => {
      for (let i = 0; i < frames.length && peer.alive; i++) {
        const f = frames[i]!;
        const session = peer.conns.get(f.localId);
        if (session === undefined) {
          if (!peer.isRefused(f.localId)) staleFrames.inc(); // 거절해 둔 연결의 뒤늦은 프레임은 stale이 아니다.
          continue;
        }
        if (session.socket.closing) continue; // 킥 이후 입력은 효력 없음(monolith 엣지의 inbox 폐기).
        ingestFrame(session, f.packetId, f.body, dispatch);
      }
    });
  }

  private onConnClosed(peer: GatewayPeer, localId: number, reason: ConnClosedReason): void {
    const session = peer.conns.get(localId);
    if (session === undefined) {
      if (!peer.forgetRefused(localId)) staleClosed.inc();
      return;
    }
    peer.conns.delete(localId);
    const tracked = this.lifecycle.close(session);
    this.checkDrained();
    if (!tracked) return;
    tcpLog.info(
      { connId: session.connId, addr: session.remoteAddress, gatewayId: peer.info.gatewayId, localId, reason },
      "client disconnected",
    );
  }

  /** 바쁜 피어의 CONN_OPEN — 세션 없이 KICK 9 "server busy" + CONN_CLOSE(긴급). 연결 회계 전이라 회계·connId 무접촉. */
  private refuseBusyPeer(peer: GatewayPeer, localId: number, addr: string | undefined): void {
    peer.refuseOpen(localId, busyKickFrame());
    metrics.ipcAdmissionRejected.inc();
    const sup = admissionWarnSquelch.allow("busy");
    if (sup >= 0) {
      tcpLog.warn(
        suppressedMeta({ gatewayId: peer.info.gatewayId, localId, addr, pendingBytes: peer.pipe.pendingBytes }, sup),
        "connection rejected — gateway busy (IPC backlog over soft threshold)",
      );
    }
  }

  /** 피어별 소프트 임계 평가(flushAll) — 전이 로그만, ADMISSION 송신은 피어가 한다. */
  private evaluateAdmission(policy: PeerAdmissionPolicy): void {
    if (this.peers.size === 0) return;
    const now = this.now();
    let changed = false;
    for (const peer of this.peers.values()) {
      const t = peer.evaluateAdmission(policy, now);
      if (t === null) continue;
      changed = true;
      this.logAdmission(peer, t, policy);
    }
    if (changed) this.rebalanceListen(); // 월드 쪽 busy는 리스너 양보 계획에서 닫힘으로 센다.
  }

  /** 리스너 양보 재계획(worldListen — 바뀐 지시만 긴급 송신, 던지지 않는다 — 송신이 던진 피어는 끊는다). close() 뒤엔 하지 않는다. */
  private rebalanceListen(): void {
    if (!this.closed) replanListen(this.peers.values(), this.draining, (peer, err) => this.teardown(peer, "error", toError(err)));
  }

  private logAdmission(peer: GatewayPeer, t: AdmissionTransition, policy: PeerAdmissionPolicy): void {
    const meta = { gatewayId: peer.info.gatewayId, pendingBytes: peer.pipe.pendingBytes, conns: peer.conns.size, ...policy };
    if (t === "busy") log.warn(meta, "gateway IPC backlog over soft threshold — refusing its new connections (ADMISSION busy)");
    else log.info(meta, "gateway IPC backlog cleared — admitting its new connections (ADMISSION open)");
  }

  /** 피어 점진 감축(flushAll, tick 밖) — 대기가 shed 임계 위에서 다시 늘면 그 피어의 인월드 세션 일부를 KICK 9로 줄인다. */
  private evaluateShed(policy: PeerShedPolicy): void {
    if (this.peers.size === 0 || this.draining) return; // 종료 드레인 중엔 사유가 6(server shutdown)이어야 한다.
    const now = this.now();
    for (const peer of [...this.peers.values()]) {
      if (!peer.shedDue(policy, now)) continue;
      try {
        if (this.shedRandom(peer, policy) > 0) peer.noteShed(now);
      } catch (err) {
        // 표에서 뺀 세션의 정리가 실패하면 회계가 어긋난 피어다 — flushPeer와 같이 그 게이트웨이를 끊어 전부 정리한다.
        log.error({ gatewayId: peer.info.gatewayId, err }, "gateway shed failed — tearing the gateway down");
        this.teardown(peer, "error", toError(err));
      }
    }
  }

  /**
   * 인월드 세션(부하를 만드는 쪽 — 로그인 중 연결은 스냅샷을 만들지 않는다) 중 **무작위**로 ceil(n × fraction)명(최소 1, 상한
   * maxPerStep). 연결 나이로 고르면 먼저 자리 잡은 쪽(부하 유발자 포함)은 영영 고르지 않고 늦게 온 쪽만 반복해 쫓겨난다(4.5 후속 보안
   * 리뷰). 링크를 먼저 종료 상태로(이후 송신·CONN_CLOSE 없음), 긴급 KICK 9 + CONN_CLOSE, 월드 세션은 즉시 배치 정리(저장·despawn —
   * 게이트웨이 왕복을 기다리면 그동안 스냅샷을 계속 만들어 대기가 더 쌓인다). 반환 = 줄인 수(0이면 쿨다운을 쓰지 않는다).
   */
  private shedRandom(peer: GatewayPeer, policy: PeerShedPolicy): number {
    const pool: Array<[number, PlayerSession]> = [];
    for (const entry of peer.conns) if (entry[1].state === "IN_WORLD" && !entry[1].socket.closing) pool.push(entry);
    if (pool.length === 0) return 0;
    const count = Math.min(pool.length, policy.maxPerStep, Math.max(1, Math.ceil(pool.length * policy.fraction)));
    const rand = this.opts.shedRandom ?? Math.random;
    const shed: PlayerSession[] = [];
    const ids: number[] = [];
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(rand() * (pool.length - i)); // 부분 Fisher–Yates
      const picked = pool[j]!;
      pool[j] = pool[i]!;
      const [localId, session] = picked;
      session.socket.dispose();
      peer.conns.delete(localId);
      peer.shedConn(localId, busyKickFrame());
      shed.push(session);
      ids.push(session.connId);
    }
    metrics.ipcShedSessions.inc(undefined, shed.length);
    metrics.ipcShedEvents.inc();
    const tracked = this.lifecycle.closeMany(shed);
    this.checkDrained();
    log.warn(
      {
        gatewayId: peer.info.gatewayId,
        shed: shed.length,
        tracked,
        remaining: peer.conns.size,
        pendingBytes: peer.pipe.pendingBytes,
        connIds: ids.slice(0, SHED_LOG_IDS),
      },
      "gateway IPC backlog still growing — shed random in-world connections (KICK 9 server busy)",
    );
    return shed.length;
  }

  /** 피어 정리 — 기록 거절·디코더 정지·파이프 닫기 후 그 피어 세션 전부를 배치 저장 1회로 종료. 이미 정리됐으면 무동작. */
  private teardown(peer: GatewayPeer, reason: PeerLossReason, error?: Error): void {
    // 상대가 닫은 사유(peer·dead·backpressure)면 파이프는 이미 닫혔다 — destroy는 무동작.
    const sessions = peer.kill(reason === "protocol" || reason === "error" ? "error" : "local", error);
    if (sessions === null) return;
    if (this.peers.get(peer.info.gatewayId) === peer) this.peers.delete(peer.info.gatewayId);
    metrics.ipcPeers.set(this.peers.size);
    metrics.ipcPeerLost.inc({ reason });
    this.rebalanceListen(); // 잃은 피어가 열린 리스너였으면 양보 중이던 피어들을 곧바로 되돌린다(세션 정리보다 먼저).
    const tracked = sessions.length > 0 ? this.lifecycle.closeMany(sessions) : 0;
    this.checkDrained();
    const meta = { ...peer.info, reason, err: error, sessions: tracked };
    if (reason === "closed" || reason === "bye") log.info(meta, "gateway peer closed — its client sessions closed");
    else log.warn(meta, "gateway lost — its client sessions closed");
  }

  /** 거절 사유(없으면 null) — 인증이 먼저다: token이 틀린 HELLO는 펜싱 기록·피어 표를 보지도 바꾸지도 않는다. */
  private helloRefusal(m: HelloMsg): HelloNackReason | null {
    if (!timingSafeEqual(tokenDigest(m.token), this.tokenKey)) return HELLO_NACK_REASON.Auth;
    if (this.closed || this.draining) return HELLO_NACK_REASON.Closed;
    if (this.isFenced(m.gatewayId, m.incarnation)) return HELLO_NACK_REASON.Fenced;
    return null;
  }

  /** HELLO 거절 — NACK(사유)을 쓰고 우아하게 닫는다(바이트 뒤 FIN — 게이트웨이가 사유를 읽고 정책을 고른다). */
  private refuse(ctx: PipeCtx, reason: HelloNackReason, meta: Record<string, unknown>): void {
    this.noteRejected(HELLO_NACK_LABELS[reason], meta);
    this.settle(ctx);
    ctx.decoder?.destroy();
    ctx.decoder = null;
    const nack = new WorldIpcWriter({ initialCapacity: 16 });
    nack.helloNack(reason);
    nack.flushTo(ctx.pipe);
    ctx.pipe.end();
  }

  private onHelloTimeout(ctx: PipeCtx): void {
    ctx.helloTimer = null;
    if (!this.handshaking.has(ctx)) return;
    this.noteRejected("timeout", { timeoutMs: this.helloTimeoutMs });
    this.dropPipe(ctx, "local");
  }

  /** 핸드셰이크 대기에서 뺀다(데드라인 해제) — HELLO 수락·거절·파이프 닫힘 공통. idempotent. */
  private settle(ctx: PipeCtx): void {
    if (!this.handshaking.delete(ctx)) return;
    if (ctx.helloTimer !== null) this.timers.clearTimeout(ctx.helloTimer);
    ctx.helloTimer = null;
  }

  private noteRejected(reason: HelloRejectReason, meta: Record<string, unknown>): void {
    metrics.ipcHelloRejected.inc({ reason });
    const sup = rejectWarnSquelch.allow(reason);
    if (sup >= 0) log.warn(suppressedMeta({ ...meta, reason }, sup), "gateway IPC handshake refused");
  }

  /** 피어 없는 파이프(핸드셰이크 실패·데드라인·종료) 닫기. */
  private dropPipe(ctx: PipeCtx, reason: PipeCloseReason, error?: Error): void {
    this.settle(ctx);
    ctx.decoder?.destroy();
    ctx.decoder = null;
    ctx.pipe.destroy(reason, error);
  }

  private markDirty(peer: GatewayPeer): void {
    this.dirty.push(peer);
    // 턴 끝 훅 예약 — tick 안이면 serverTick ipcFlush가 먼저 비우고 이 예약은 빈 flush로 끝난다.
    requestTurnEndFlush();
  }

  private isFenced(gatewayId: number, incarnation: number): boolean {
    return this.incarnations.get(gatewayId)?.retired.includes(incarnation) ?? false;
  }

  /** 등록 — 직전과 다른 incarnation이면 직전 값을 은퇴시킨다(유실 뒤 새 프로세스가 등록돼도 옛 프로세스는 펜싱). */
  private recordIncarnation(gatewayId: number, incarnation: number): void {
    const rec = this.incarnations.get(gatewayId);
    if (rec === undefined) {
      this.incarnations.set(gatewayId, { current: incarnation, retired: [] });
      return;
    }
    if (rec.current === incarnation) return;
    rec.retired.push(rec.current);
    if (rec.retired.length > this.fencedMax) rec.retired.shift();
    rec.current = incarnation;
  }
}
