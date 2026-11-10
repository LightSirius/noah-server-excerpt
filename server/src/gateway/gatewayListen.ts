// 게이트웨이 클라 리스너 — 4.2c의 listen/stopListening을 코어에서 분리하고 공유 포트 리스너 양보(IPC v14, 자동 재접속 선결)의 중지·재개를
// 더했다. 판단(누가 양보하나)은 월드 계획기(cluster/listenPlan) 몫이고, 여기는 지시를 집행하고 상태를 보고 가능한 형태로 둔다.
//   open(opts)  월드 세션의 첫 리슨(HELLO_ACK 뒤 — 바인드 실패는 throw: 치명, gatewayMain). 옵션을 기억한다(재개가 같은 옵션·reusePort로 다시
//               바인드). 이 세션의 보고가 이때부터 나간다 — 보고 전 피어에게 월드는 지시하지 않으므로 리슨 전 지시는 생기지 않는다.
//   stop()      리스너를 닫고 양보 상태(재개 재시도·게이지)를 정리한다 — SHUTDOWN·자기 종료(보고는 계속: listening 0)·월드 유실(endSession).
//   endSession  월드 유실 — stop + ackSeq 0 + 보고 중단. 이전 월드 세션의 지시는 무의미하다: 다음 세션은 open부터(리스닝, ack 0).
//               종전처럼 월드가 없으면 리스너도 없다(월드 유실 = 리스너 중지 + 전원 KICK 6) — 양보 중이었어도 "재개"가 아니라 다음 세션의 open이다.
//   apply(mode, seq, closedCause)  LISTEN 지시. ackSeq = seq(무동작이어도 — 코어가 보고로 ack). 자격(eligible — 공유 포트 + GW_LISTEN_YIELD +
//               접속 제한 켬, 배선이 판정)이 없거나 세션 밖(open 전·stop 뒤)이면 mode를 무시한다. yield는 지금 새 클라를 거절 중일 때만(부하
//               접속 제한 ∨ 연결 상한 — 보고의 closed와 같은 근거) 리스너를 내린다(월드가 본 근거가 그사이 풀렸으면 내리지 않는다 — 경합의
//               무의미한 중지·재개 왕복 제거, 월드는 다음 보고로 listen을 다시 보낸다). listen은 다시 바인드 — 실패하면 warn + listening 0 보고, 백오프(retryInitialMs 250 → 2배, 상한 retryMaxMs 2 s)로
//               성공·stop까지 재시도(성공하면 changed 훅 → 보고). 이중 리슨은 없다(listener ≠ null이면 바인드하지 않는다).
// 리스너 중지(listener.stop(false))는 이미 받은 연결을 그대로 둔다(실측 — 중지한 리스너가 받아 둔 소켓은 read·write 정상). 리눅스 기본
// net.ipv4.tcp_migrate_req = 0이면 닫는 리스너의 accept 대기열에 있던 연결은 RST다(클라는 링크 실패로 보고 재시도 — 운영 권고 1, ops-cluster §9).
// 시계·타이머는 sim/world 밖(gateway/) — 주입 가능(테스트).

import type { PipeTimers } from "../cluster/ipcPipe";
import type { ListenMode } from "../cluster/ipcSchema";
import { metrics } from "../obs/metrics";
import { createLogger } from "../obs/logger";
import { createSquelch, suppressedMeta } from "../obs/logSquelch";
import type { GatewayConn } from "./gatewayConn";

const log = createLogger("gateway");
const pausedCount = metrics.gwListenTransitions.bind({ state: "paused" });
const resumedCount = metrics.gwListenTransitions.bind({ state: "resumed" });
// 재개 실패 warn — 재시도마다(최대 2초 간격) 쌓이지 않게 초당 1줄(억제분은 suppressed로).
const resumeWarnSquelch = createSquelch({ ratePerSec: 1, burst: 3 });

export const DEFAULT_LISTEN_RETRY_INITIAL_MS = 250;
export const DEFAULT_LISTEN_RETRY_MAX_MS = 2000;
/** 연결 상한 닫힘의 히스테리시스 여유(상한 대비) — 연결 하나가 들고 날 때마다 양보·재개가 흔들리지 않게. */
export const CAP_REOPEN_FRACTION = 0.05;

/**
 * 연결 상한에 닿은 게이트웨이가 다시 "열림"을 보고하는 연결 수(이하) — 상한 − max(1, ceil(상한 × 5%)). 닫힘(LISTEN_REPORT closed)은
 * 상한 도달에서 켜지고 이 문턱 이하에서 꺼진다. 실제 거절(KICK 9 "connection cap")은 종전대로 연결 수 ≥ 상한일 때만이다.
 */
export function capReopenAt(connCap: number): number {
  return connCap - Math.max(1, Math.ceil(connCap * CAP_REOPEN_FRACTION));
}

/** 클라 리스너 옵션. */
export interface GatewayListenOptions {
  readonly port: number;
  /** 기본 0.0.0.0. */
  readonly hostname?: string;
  /** SO_REUSEPORT(Linux 전용 — env 가드가 Windows를 거부). */
  readonly reusePort?: boolean;
}

/** Bun.listen 표면(테스트가 바인드 실패를 주입한다). */
export type ListenBind = (
  opts: Bun.TCPSocketListenOptions<GatewayConn> & { reusePort?: boolean },
) => Bun.TCPSocketListener<GatewayConn>;

/** 공유 포트 리스너 양보(IPC v14) 설정 — 있으면 LISTEN 지시를 따른다(배선: REUSE_PORT=1·GW_ADMISSION=1·GW_LISTEN_YIELD=1). */
export interface ListenYieldOptions {
  readonly retryInitialMs?: number;
  readonly retryMaxMs?: number;
  /** 재개 재시도 타이머(기본 실제 타이머 — unref). */
  readonly timers?: Pick<PipeTimers, "setTimeout" | "clearTimeout">;
}

/** LISTEN_REPORT 내용. */
export interface ListenState {
  readonly shared: boolean;
  readonly closed: boolean;
  readonly listening: boolean;
  readonly port: number;
  readonly ackSeq: number;
}

export interface GatewayListenerDeps {
  readonly gatewayId: number;
  readonly socket: Bun.SocketHandler<GatewayConn>;
  /** 로그용 연결 수. */
  readonly conns: () => number;
  /** 미지정 = 양보 자격 없음(LISTEN은 ack만). */
  readonly yieldOpts?: ListenYieldOptions;
  /** 기본 Bun.listen. */
  readonly bind?: ListenBind;
  /** 타이머가 리슨 상태를 바꿨다(재개 재시도 성공) — 코어가 LISTEN_REPORT를 보낸다. */
  readonly changed: () => void;
}

const REAL_TIMERS: Pick<PipeTimers, "setTimeout" | "clearTimeout"> = {
  setTimeout(fn, ms) {
    const t = setTimeout(fn, ms);
    t.unref?.();
    return t;
  },
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class GatewayListener {
  private listener: Bun.TCPSocketListener<GatewayConn> | null = null;
  private opts: GatewayListenOptions | null = null;
  private boundPort = 0;
  /** open ~ stop — LISTEN 지시를 집행하는 구간. */
  private active = false;
  /** open ~ endSession — 이 세션의 보고 구간(stop 뒤에도 listening 0을 보고한다). */
  private reportable = false;
  /** 양보로 내려가 있다(재개 재시도 중 포함) — mmorpg_gw_listen_yielded. */
  private paused = false;
  private pausedAt = 0;
  private ack = 0;
  private retryTimer: unknown = null;
  private retryDelay: number;
  private readonly bind: ListenBind;
  private readonly timers: Pick<PipeTimers, "setTimeout" | "clearTimeout">;

  constructor(private readonly deps: GatewayListenerDeps) {
    this.bind = deps.bind ?? ((o) => Bun.listen<GatewayConn>(o));
    this.timers = deps.yieldOpts?.timers ?? REAL_TIMERS;
    this.retryDelay = this.retryInitial;
  }

  get listening(): boolean {
    return this.listener !== null;
  }

  /** 양보로 내려가 있다(재개 재시도 중 포함). */
  get yielded(): boolean {
    return this.paused;
  }

  get ackSeq(): number {
    return this.ack;
  }

  /** 양보 자격(LISTEN_REPORT shared). */
  get eligible(): boolean {
    return this.deps.yieldOpts !== undefined;
  }

  private get retryInitial(): number {
    return this.deps.yieldOpts?.retryInitialMs ?? DEFAULT_LISTEN_RETRY_INITIAL_MS;
  }

  /** 세션의 첫 리슨 — 바인드 실패는 throw. 이미 세션 중이면 그 포트(재바인드 없음). */
  open(opts: GatewayListenOptions): number {
    if (this.active) return this.boundPort;
    const listener = this.bind(this.listenOptions(opts));
    this.listener = listener;
    this.opts = opts;
    this.boundPort = listener.port;
    this.active = true;
    this.reportable = true;
    log.info(
      { gatewayId: this.deps.gatewayId, host: listener.hostname, port: listener.port, reusePort: opts.reusePort === true, listenYield: this.eligible },
      "gateway listening",
    );
    return listener.port;
  }

  /** 리스너를 닫고 양보 상태를 정리한다. 반환 = 리슨 상태가 바뀌었나(열려 있었거나 양보 중이었다). */
  stop(): boolean {
    this.cancelRetry();
    const wasUp = this.listener !== null;
    if (wasUp) this.listener!.stop(false);
    this.listener = null;
    const wasPaused = this.paused;
    if (wasPaused) metrics.gwListenYielded.dec();
    this.paused = false;
    this.active = false;
    return wasUp || wasPaused;
  }

  /** 월드 유실 — stop + ack 0 + 이 세션의 보고 중단. */
  endSession(): void {
    this.stop();
    this.ack = 0;
    this.reportable = false;
  }

  /** LISTEN 지시 집행(파일 상단). closedCause = 지금 새 클라를 거절하는 사유(접속 제한 사유 또는 "cap", 받는 중이면 null). 보고는 호출자. */
  apply(mode: ListenMode, seq: number, closedCause: string | null): void {
    this.ack = seq;
    if (!this.eligible || !this.active) return;
    if (mode === "yield") {
      if (closedCause === null) return;
      if (this.paused) this.cancelRetry(); // 재개 재시도 중이던 양보 — 내려간 채로 둔다.
      else this.pause(seq, closedCause);
      return;
    }
    if (this.paused && this.retryTimer === null) this.tryResume("listen");
  }

  /** LISTEN_REPORT 내용 — 이 세션에서 리슨 전이면 null(보고하지 않는다). */
  state(closed: boolean): ListenState | null {
    if (!this.reportable) return null;
    return { shared: this.eligible, closed, listening: this.listener !== null, port: this.boundPort, ackSeq: this.ack };
  }

  private pause(seq: number, cause: string): void {
    if (this.paused || this.listener === null) return;
    this.listener.stop(false);
    this.listener = null;
    this.paused = true;
    this.pausedAt = performance.now();
    metrics.gwListenYielded.inc();
    pausedCount.inc();
    log.info(
      { gatewayId: this.deps.gatewayId, conns: this.deps.conns(), seq, closedCause: cause, port: this.boundPort },
      "client listener paused — world LISTEN yield (refusing new clients, another gateway on the shared port listens)",
    );
  }

  /** 다시 바인드 — 성공 true, 실패면 warn + 재시도 예약 후 false. */
  private tryResume(cause: "listen" | "retry"): boolean {
    if (!this.active || !this.paused || this.opts === null) return false;
    try {
      // 바인드했던 포트 그대로(옵션의 포트가 0 = 임시 포트여도 같은 포트로 돌아온다 — 공유 포트는 원래 같다).
      this.listener = this.bind(this.listenOptions({ ...this.opts, port: this.boundPort }));
    } catch (err) {
      this.scheduleRetry(err);
      return false;
    }
    this.paused = false;
    this.retryDelay = this.retryInitial;
    metrics.gwListenYielded.dec();
    resumedCount.inc();
    log.info(
      { gatewayId: this.deps.gatewayId, conns: this.deps.conns(), cause, pausedMs: Math.round(performance.now() - this.pausedAt) },
      "client listener resumed — rejoined the shared-port group",
    );
    return true;
  }

  private scheduleRetry(err: unknown): void {
    const delay = this.retryDelay;
    this.retryDelay = Math.min(delay * 2, this.deps.yieldOpts?.retryMaxMs ?? DEFAULT_LISTEN_RETRY_MAX_MS);
    const sup = resumeWarnSquelch.allow(String(this.deps.gatewayId));
    if (sup >= 0) {
      log.warn(
        suppressedMeta({ gatewayId: this.deps.gatewayId, err, port: this.boundPort, retryInMs: delay }, sup),
        "client listener resume failed — retrying (still out of the shared-port group)",
      );
    }
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = null;
      if (this.tryResume("retry")) this.deps.changed();
    }, delay);
  }

  private cancelRetry(): void {
    if (this.retryTimer !== null) this.timers.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retryDelay = this.retryInitial;
  }

  private listenOptions(opts: GatewayListenOptions): Bun.TCPSocketListenOptions<GatewayConn> & { reusePort?: boolean } {
    return {
      hostname: opts.hostname ?? "0.0.0.0",
      port: opts.port,
      socket: this.deps.socket,
      ...(opts.reusePort === true ? { reusePort: true } : {}),
    };
  }
}
