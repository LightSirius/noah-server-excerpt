// 게이트웨이 로컬 부하 신호 — 성능 4.5 F1(게이트웨이 부하 기반 접속 제한). 4.4에서 포화한 게이트웨이는 월드의 과부하 접속 제한(tick
// skip)에 잡히지 않고 새 클라를 계속 받다가 IPC 대기 상한(IPC_MAX_PENDING_MB)에서 통째로 끊겼다(소속 클라 전원 KICK 6). 이 모듈은
// 게이트웨이가 스스로 "지금 새 연결을 받으면 안 된다"를 판정한다 — 거절(KICK 9 "server busy", CONN_OPEN 전)은 gatewayAdmission.refuse
// (gatewayCore.admit이 부른다).
//
// 표본: unref 타이머 sampleMs(기본 250)마다, 창 windowMs(기본 1 s) 기준.
//   cpu      process.cpuUsage(user+system) Δ / 벽시계 Δ — 한 코어 대비 %(게이트웨이는 단일 스레드라 ≈100%가 포화). 진입 cpuPct, 해제 −15 pt.
//   lag      표본 타이머 지연(실제 − 예정)의 창 안 최대(mmorpg_gw_event_loop_lag_ms). 진입 lagMs, 해제 절반. 다음 표본이 지금 이미
//            lagMs 이상 늦었으면(이벤트 루프가 막혀 있다 풀렸다) 그것도 신호다 — 정지 직후 accept 콜백이 표본 타이머보다 먼저 돌아도
//            거절한다(타이머·I/O 콜백 순서에 기대지 않음).
//   rtt      IPC 수신 적체 추정(소스 — gatewayCore: 답 없는 가장 오래된 PING의 나이 ∨ 창 안 최근 왕복). 월드의 PONG은 그 앞에 쌓인
//            W→G 바이트 뒤에 오므로 왕복 ≈ 적체 지연. 진입 rttMs, 해제 절반.
//   outbound 클라 송신 꼬리 합(OutboundLink.pendingByteCount) — 실제 NIC 대역폭 한계. 진입 outboundBytes, 해제 절반. 인월드 연결 중
//            꼬리를 가진 연결이 outboundRatio(기본 절반, env) 미만이면 신호 값 0 — 꼬리는 클라가 소켓을 읽지 않기만 해도(대역폭 비용
//            0) 연결당 꼬리 상한까지 자라므로, 소수 연결의 집중 적체가 판정을 뒤집으면 공격자가 고르는 신규 접속 잠금 레버가 된다(4.5
//            리뷰). NIC 포화는 연결 전반의 꼬리로 나타난다. 폭의 분모는 인월드(CONN_STATE IN_WORLD 미러) 연결 — 로그인 중 연결은 송신
//            바이트가 거의 없어, 접속 램프 중 실제 포화를 희석해 신호를 끄지 않게(4.5 검증). 느린 클라 하나하나는 꼬리 상한
//            (OUTBOUND_MAX_BYTES 종료)이 묶는다.
//   world    월드의 ADMISSION 판정(피어 IPC 대기 소프트 임계 — 월드가 긴급 송신). busy면 표본을 기다리지 않고 즉시 진입.
// 히스테리시스: 신호 하나가 진입 문턱에 닿으면 즉시 거절 시작. 모든 신호가 해제 문턱 이하이고 월드가 open인 상태가 holdMs 동안 이어져야
// 다시 받는다. 거절 사유(cause) = 우선순위 world > cpu > lag > rtt > outbound의 현재 뜨거운 신호(없으면 마지막 사유).
// 시계·CPU·타이머는 주입 가능(테스트). 게이트웨이는 sim/world 밖이라 결정론 규칙 무관.

import type { PipeTimers } from "../cluster/ipcPipe";
import type { LoginState } from "../identity/loginFlow";
import { metrics } from "../obs/metrics";

export type AdmissionCause = "world" | "cpu" | "lag" | "rtt" | "outbound";
/** 메트릭 라벨 순서(mmorpg_gw_admission_rejected_total{cause}). */
export const ADMISSION_CAUSES: readonly AdmissionCause[] = ["world", "cpu", "lag", "rtt", "outbound"];

export const DEFAULT_LOAD_SAMPLE_MS = 250;
export const DEFAULT_LOAD_WINDOW_MS = 1000;
/** cpu 해제 문턱 = 진입 − 이 값(pt). */
export const CPU_CLEAR_MARGIN_PCT = 15;
/** outbound 신호를 세는 최소 폭 기본값(env GW_ADMISSION_OUTBOUND_RATIO) — 인월드 연결 중 꼬리 보유 비율이 이 미만이면 신호 값 0(진입·유지 모두). */
export const DEFAULT_OUTBOUND_RATIO = 0.5;

export interface CpuSample {
  /** µs. */
  readonly user: number;
  readonly system: number;
}

export type LoadTimers = Pick<PipeTimers, "setInterval" | "clearInterval">;

/** 게이트웨이 접속 제한 문턱(env GW_ADMISSION_* — gatewayMain) + 주입점. */
export interface GatewayAdmissionOptions {
  /** 프로세스 CPU(한 코어 대비 %) 진입 문턱. 해제 = −15 pt. */
  readonly cpuPct: number;
  /** 이벤트 루프 지연(ms) 진입 문턱. 해제 = 절반. */
  readonly lagMs: number;
  /** IPC 왕복(ms) 진입 문턱. 해제 = 절반. */
  readonly rttMs: number;
  /** 클라 송신 꼬리 합(바이트) 진입 문턱 — 인월드 연결 중 꼬리 보유 비율이 outboundRatio 이상일 때만 센다. 해제 = 절반. */
  readonly outboundBytes: number;
  /** outbound 신호의 최소 폭(0..1). 기본 DEFAULT_OUTBOUND_RATIO. */
  readonly outboundRatio?: number;
  /** 모든 신호가 해제 문턱 이하로 이만큼(ms) 이어져야 다시 받는다. */
  readonly holdMs: number;
  readonly sampleMs?: number;
  readonly windowMs?: number;
  /** 단조 시계(ms). 기본 performance.now. */
  readonly now?: () => number;
  /** 기본 process.cpuUsage. */
  readonly cpuUsage?: () => CpuSample;
  /** 기본 실제 타이머(unref). */
  readonly timers?: LoadTimers;
}

/** env 표면 — 게이트웨이 접속 제한 키(config/env.ts). */
export interface GatewayAdmissionEnv {
  readonly GW_ADMISSION: "0" | "1";
  readonly GW_ADMISSION_CPU_PCT: number;
  readonly GW_ADMISSION_LAG_MS: number;
  readonly GW_ADMISSION_RTT_MS: number;
  readonly GW_ADMISSION_OUTBOUND_MB: number;
  readonly GW_ADMISSION_OUTBOUND_RATIO: number;
  readonly GW_ADMISSION_HOLD_MS: number;
}

/** env → 게이트웨이 문턱. GW_ADMISSION=0 = 끔(undefined). */
export function gatewayAdmissionFromEnv(e: GatewayAdmissionEnv): GatewayAdmissionOptions | undefined {
  if (e.GW_ADMISSION !== "1") return undefined;
  return {
    cpuPct: e.GW_ADMISSION_CPU_PCT,
    lagMs: e.GW_ADMISSION_LAG_MS,
    rttMs: e.GW_ADMISSION_RTT_MS,
    outboundBytes: e.GW_ADMISSION_OUTBOUND_MB * 1024 * 1024,
    outboundRatio: e.GW_ADMISSION_OUTBOUND_RATIO,
    holdMs: e.GW_ADMISSION_HOLD_MS,
  };
}

/** 클라 송신 꼬리 표본(표본마다 연결 표 1회 순회). */
export interface OutboundSample {
  /** 꼬리 합(바이트, 전 연결). */
  readonly bytes: number;
  /** 인월드 연결 중 꼬리를 가진 연결 비율(0..1, 인월드 0개 = 0). */
  readonly backloggedRatio: number;
}

/** 송신 꼬리를 가진 연결 표면 — GatewayConn(socket = OutboundLink, state = 월드 CONN_STATE 미러). */
interface TailedConn {
  readonly state: LoginState;
  readonly socket: { readonly pendingByteCount: number };
}

/** 연결들의 송신 꼬리 표본 — 합은 전 연결(NIC 관측값), 폭은 인월드 연결만(로그인 중 연결이 희석하지 않게). */
export function outboundSample(conns: ReadonlyMap<number, TailedConn>): OutboundSample {
  let bytes = 0;
  let inWorld = 0;
  let backlogged = 0;
  for (const conn of conns.values()) {
    const n = conn.socket.pendingByteCount;
    bytes += n;
    if (conn.state !== "IN_WORLD") continue;
    inWorld++;
    if (n > 0) backlogged++;
  }
  return { bytes, backloggedRatio: inWorld === 0 ? 0 : backlogged / inWorld };
}

/** 표본 시점에 읽는 값 — 게이트웨이 코어가 준다. */
export interface GatewayLoadSources {
  /** IPC 수신 적체 추정(ms). */
  ipcRttMs(now: number): number;
  /** 클라 송신 꼬리 표본. */
  outbound(): OutboundSample;
}

export interface LoadReading {
  readonly cpuPct: number;
  readonly lagMs: number;
  readonly rttMs: number;
  /** 꼬리 합(관측값 — 판정은 아래 outboundRatio가 GatewayAdmissionOptions.outboundRatio 이상일 때만 센다). */
  readonly outboundBytes: number;
  /** 인월드 연결 중 꼬리 보유 비율. */
  readonly outboundRatio: number;
  readonly worldBusy: boolean;
}

/** 전이 통지 — active true = 거절 시작(cause), false = 다시 받는다(cause null). */
export type AdmissionChange = (active: boolean, cause: AdmissionCause | null, reading: LoadReading) => void;

interface Sample {
  readonly t: number;
  readonly cpuUs: number;
  readonly lag: number;
}

const REAL_TIMERS: LoadTimers = {
  setInterval(fn, ms) {
    const t = setInterval(fn, ms);
    t.unref?.();
    return t;
  },
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

function cpuTotal(s: CpuSample): number {
  return s.user + s.system;
}

export class GatewayLoad {
  private readonly sampleMs: number;
  private readonly windowMs: number;
  private readonly minOutboundRatio: number;
  private readonly now: () => number;
  private readonly cpuUsage: () => CpuSample;
  private readonly timers: LoadTimers;
  /** 창 기준점(창 시작 이전의 마지막 표본) + 창 안 표본. */
  private samples: Sample[] = [];
  private lastSampleAt: number;
  private last: LoadReading = { cpuPct: 0, lagMs: 0, rttMs: 0, outboundBytes: 0, outboundRatio: 0, worldBusy: false };
  private worldBusy = false;
  private on = false;
  private reason: AdmissionCause | null = null;
  private clearSince: number | null = null;
  private handle: unknown = null;

  constructor(
    private readonly sources: GatewayLoadSources,
    private readonly opts: GatewayAdmissionOptions,
    private readonly onChange: AdmissionChange = () => {},
  ) {
    this.sampleMs = opts.sampleMs ?? DEFAULT_LOAD_SAMPLE_MS;
    this.windowMs = opts.windowMs ?? DEFAULT_LOAD_WINDOW_MS;
    this.minOutboundRatio = opts.outboundRatio ?? DEFAULT_OUTBOUND_RATIO;
    this.now = opts.now ?? (() => performance.now());
    this.cpuUsage = opts.cpuUsage ?? (() => process.cpuUsage());
    this.timers = opts.timers ?? REAL_TIMERS;
    this.lastSampleAt = this.now();
    this.samples.push({ t: this.lastSampleAt, cpuUs: cpuTotal(this.cpuUsage()), lag: 0 });
  }

  /** 거절 중인가. */
  get active(): boolean {
    return this.on;
  }

  /** 거절 사유(받는 중이면 null). */
  get cause(): AdmissionCause | null {
    return this.on ? this.reason : null;
  }

  /** 표본 타이머 시작(idempotent) — 기준점을 지금으로 다시 잡는다. */
  start(): void {
    if (this.handle !== null) return;
    this.lastSampleAt = this.now();
    this.samples = [{ t: this.lastSampleAt, cpuUs: cpuTotal(this.cpuUsage()), lag: 0 }];
    this.handle = this.timers.setInterval(() => this.sample(), this.sampleMs);
  }

  stop(): void {
    if (this.handle === null) return;
    this.timers.clearInterval(this.handle);
    this.handle = null;
  }

  /** 표본 1회(타이머 본체 — 테스트 직접 호출용 공개). */
  sample(): void {
    const t = this.now();
    const lag = Math.max(0, t - this.lastSampleAt - this.sampleMs);
    const cpuUs = cpuTotal(this.cpuUsage());
    this.lastSampleAt = t;
    this.samples.push({ t, cpuUs, lag });
    const from = t - this.windowMs;
    while (this.samples.length > 1 && this.samples[1]!.t <= from) this.samples.shift();
    const base = this.samples[0]!;
    let lagMax = 0;
    for (const s of this.samples) if (s.t > from && s.lag > lagMax) lagMax = s.lag;
    const wall = t - base.t;
    const outbound = this.sources.outbound();
    this.last = {
      cpuPct: wall > 0 ? ((cpuUs - base.cpuUs) / 1000 / wall) * 100 : 0,
      lagMs: lagMax,
      rttMs: this.sources.ipcRttMs(t),
      outboundBytes: outbound.bytes,
      outboundRatio: outbound.backloggedRatio,
      worldBusy: this.worldBusy,
    };
    metrics.gwEventLoopLagMs.set(lagMax);
    this.update(this.last, t);
  }

  /** 월드의 ADMISSION 판정 — busy면 즉시 진입, open이면 다른 신호와 함께 hold 뒤 해제. */
  setWorldBusy(busy: boolean): void {
    this.worldBusy = busy;
    this.update(this.reading(), this.now());
  }

  /** 지금 새 연결을 거절해야 하면 그 사유, 아니면 null — accept마다(표본 사이 이벤트 루프 정지도 lag로 본다). */
  refusal(): AdmissionCause | null {
    const t = this.now();
    this.update(this.reading(t), t);
    return this.cause;
  }

  /** 최근 표본 값 + 지금의 월드 판정·표본 지연(타이머가 돌고 있을 때). */
  reading(t: number = this.now()): LoadReading {
    const overdue = this.handle === null ? 0 : Math.max(0, t - this.lastSampleAt - this.sampleMs);
    return { ...this.last, lagMs: Math.max(this.last.lagMs, overdue), worldBusy: this.worldBusy };
  }

  private update(r: LoadReading, t: number): void {
    const hot = this.hotCause(r);
    if (hot !== null) {
      this.reason = hot;
      this.clearSince = null;
      if (!this.on) {
        this.on = true;
        this.onChange(true, hot, r);
      }
      return;
    }
    if (!this.on) return;
    if (!this.allClear(r)) {
      this.clearSince = null;
      return;
    }
    this.clearSince ??= t;
    if (t - this.clearSince < this.opts.holdMs) return;
    this.on = false;
    this.reason = null;
    this.clearSince = null;
    this.onChange(false, null, r);
  }

  private hotCause(r: LoadReading): AdmissionCause | null {
    const o = this.opts;
    if (r.worldBusy) return "world";
    if (r.cpuPct >= o.cpuPct) return "cpu";
    if (r.lagMs >= o.lagMs) return "lag";
    if (r.rttMs >= o.rttMs) return "rtt";
    if (this.outboundSignal(r) >= o.outboundBytes) return "outbound";
    return null;
  }

  private allClear(r: LoadReading): boolean {
    const o = this.opts;
    return (
      !r.worldBusy &&
      r.cpuPct <= o.cpuPct - CPU_CLEAR_MARGIN_PCT &&
      r.lagMs <= o.lagMs / 2 &&
      r.rttMs <= o.rttMs / 2 &&
      this.outboundSignal(r) <= o.outboundBytes / 2
    );
  }

  /** outbound 신호 값 — 꼬리 폭이 최소 폭 이상일 때만 꼬리 합, 아니면 0. */
  private outboundSignal(r: LoadReading): number {
    return r.outboundRatio >= this.minOutboundRatio ? r.outboundBytes : 0;
  }
}
