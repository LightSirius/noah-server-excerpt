// Phase 3 tickLoop — 20 Hz drift-correcting 스케줄러.
//
// architecture.md §4.1: setInterval은 누적 표류 + 처리 지연을 합산한다.
// 다음 마감(deadline)을 누적해서 setTimeout으로 재예약하면 평균 50ms 유지.
//
// 1-C(2) 캐치업 상한: 정지(GC·동기 I/O·과부하) 후 밀린 데드라인을 전부 연달아 실행하면
// 지연이 무한 누적되고 스냅샷이 20 Hz를 넘어 몰려 나간다(커널 송신 버퍼 포화 → partial write).
// 밀린 tick은 maxCatchUpTicks개까지만 연달아 실행하고 나머지는 건너뛴다. 데드라인 격자 위상은
// 보존(건너뛴 만큼 격자 단위로 전진). 시뮬은 tickIndex 기반이라 결정론에 영향 없다 — 벽시계 대비
// 시뮬 시간이 건너뛴 tick 수만큼 늦어질 뿐이다.
//
// 측정값: 매 tick의 총 처리 시간과 지연(실제 시작 − 예정 데드라인). 본 파일은 마지막 N개 처리
// 시간을 ring으로 보관(TickOverrunMonitor 입력).
// 지연(lateness)은 clamp 이후 데드라인 기준이라 긴 정지 뒤에도 ≈(maxCatchUp−1)×TICK_MS(기본 200ms)에 머문다 —
// 정지 크기 자체는 clamp 전 backlog를 mmorpg_tick_stall_ms로 따로 남긴다. 표본은 엣지 트리거 —
// 직전 반복의 backlog가 1 tick 이하였다가 이번에 1 tick을 넘을 때만 1건(= 정지 에피소드 1회당 1건,
// count가 정지 횟수). 캐치업 중 줄어드는 잔여·지속 과부하로 1 tick 이하로 회복하지 못한 채 커지는
// backlog(clamp 주기마다 반복)는 표본이 아니다 — 그 구간은 mmorpg_tick_skipped_total로 본다.
// 한계: 회복 전(캐치업 중)에 겹친 두 번째 정지는 별도 표본이 되지 않는다.

import { TICK_MS } from "./deterministic";
import { metrics } from "../obs/metrics";
import { createLogger } from "../obs/logger";
import { createSquelch, suppressedMeta } from "../obs/logSquelch";
import { TickOverrunMonitor } from "../obs/tickOverrun";

const log = createLogger("tickLoop");
const DURATION_RING_SIZE = 256;
/** 연달아 실행할 밀린 tick 상한 기본값(250ms분). env TICK_MAX_CATCHUP. */
export const DEFAULT_MAX_CATCHUP_TICKS = 5;

// 지속 장애 시 20줄/초 에러 폭주 방지 — 초당 1회, 버스트 5. 억제분은 suppressed로 보존.
const tickErrSquelch = createSquelch({ ratePerSec: 1, burst: 5 });
// skip 경보 — 과부하 지속 시 매 tick 경보 방지.
const skipWarnSquelch = createSquelch({ ratePerSec: 0.2, burst: 2 });

export interface TickLoopHandle {
  /** 가장 최근 측정된 tick 처리 시간(ms). 0 = 아직 측정 없음. */
  lastDurationMs(): number;
  /** 가장 최근 tick의 지연(실제 시작 − 예정 데드라인, ms). */
  lastLatenessMs(): number;
  /** 측정된 tick 수. */
  ticksRun(): number;
  /** 캐치업 상한으로 건너뛴 tick 누적 수. */
  skippedTicks(): number;
  stop(): void;
}

export interface TickLoopOptions {
  /** 단조 시계(ms). 기본 performance.now — 테스트는 가짜 시계 주입. */
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** 연달아 실행할 밀린 tick 상한. 0 = 밀린 tick 전부 skip. */
  maxCatchUpTicks?: number;
  /**
   * tick 1건 측정 직후 관측 훅(처리 시간, 지연 — 메트릭과 같은 값). 성능 2-A: worldMain.ts가
   * obs/tickProfiler.end에 연결해 단계 계측을 tick 단위로 확정한다. 예외는 격리(루프 유지).
   */
  onTick?: (durationMs: number, latenessMs: number) => void;
  /**
   * 반복 1회마다(다음 데드라인 예약 직전) 이번 반복에서 캐치업 상한으로 건너뛴 tick 수(정상 0)와 다음 데드라인까지 남은 유휴(ms —
   * clamp 뒤 기준, 캐치업 중이면 0 이하)를 보고. 4.5 후속: 유휴는 GC 페이서(sim/gcPacer)가 쓴다.
   * 3단계 슬라이스 8: worldMain.ts가 net/overloadSignal.observeTick에 연결해 과부하 신호(skip 창 + 무응답)를
   * 만든다 — 시계는 신호 쪽(net)에만 있다. 예외는 격리(루프 유지). stop() 이후 반복에서는 부르지 않는다.
   */
  onSchedule?: (skipped: number, idleMs: number) => void;
}

/**
 * Phase E-2: 다중 zone 지원을 위해 tick 콜백을 주입받는다.
 * caller는 `() => zoneRegistry.tickAll()`(또는 단일 zone 테스트면 `() => zone.tick()`)을 넘긴다.
 */
export function startTickLoop(tickFn: () => void, opts: TickLoopOptions = {}): TickLoopHandle {
  const loop = new TickLoopRunner(tickFn, opts);
  return {
    lastDurationMs: () => loop.lastMs,
    lastLatenessMs: () => loop.lastLateness,
    ticksRun: () => loop.ticksRun,
    skippedTicks: () => loop.skipped,
    stop: () => loop.stop(),
  };
}

/** startTickLoop 본체 — 데드라인 격자·측정 링·캐치업 clamp 상태. 생성 즉시 첫 tick을 예약한다. */
class TickLoopRunner {
  lastMs = 0;
  lastLateness = 0;
  ticksRun = 0;
  skipped = 0;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly maxCatchUp: number;
  private readonly durations = new Float64Array(DURATION_RING_SIZE);
  private ringIndex = 0;
  /** 직전 반복의 clamp 전 backlog(ms) — stall 표본을 "정지 아님 → 정지" 전이로 한정. */
  private prevBehind = Number.NEGATIVE_INFINITY;
  private stopped = false;
  private timer: unknown = null;
  // §4.1 경보: duration 링을 읽어 p99 히스테리시스 경고(체크·재경고 주기 모두 tick 카운트 기반).
  private readonly overrun = new TickOverrunMonitor(log);
  private nextDeadline: number;

  constructor(
    private readonly tickFn: () => void,
    private readonly opts: TickLoopOptions,
  ) {
    // 시뮬용 시간이 아니므로 performance.now 사용 OK.
    // (sim/world 코드 자체는 TICK_MS와 tickIndex만 본다 — lint 게이트가 강제.)
    this.now = opts.now ?? (() => performance.now());
    this.setTimer = opts.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.maxCatchUp = Math.max(0, opts.maxCatchUpTicks ?? DEFAULT_MAX_CATCHUP_TICKS);
    this.nextDeadline = this.now() + TICK_MS;
    this.timer = this.setTimer(this.tick, TICK_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }

  private readonly tick = (): void => {
    if (this.stopped) return;
    const t0 = this.now();
    this.lastLateness = Math.max(0, t0 - this.nextDeadline);
    try {
      this.tickFn();
    } catch (err) {
      // tick 한 번 실패가 루프를 죽이지 않도록 격리.
      const sup = tickErrSquelch.allow("tickFn");
      if (sup >= 0) log.error(suppressedMeta({ err }, sup), "tickFn threw");
    }
    this.record(this.now() - t0);
    if (this.stopped) return;
    this.scheduleNext();
  };

  /** tick 1건 측정 확정 — 링·메트릭·onTick 훅·p99 경보. */
  private record(dt: number): void {
    this.durations[this.ringIndex] = dt;
    this.ringIndex = (this.ringIndex + 1) % DURATION_RING_SIZE;
    this.ticksRun++;
    this.lastMs = dt;
    metrics.tickDurationMs.observe(dt);
    metrics.tickLatenessMs.observe(this.lastLateness);
    const onTick = this.opts.onTick;
    if (onTick !== undefined) {
      try {
        onTick(dt, this.lastLateness);
      } catch (err) {
        const sup = tickErrSquelch.allow("onTick");
        if (sup >= 0) log.error(suppressedMeta({ err }, sup), "onTick threw");
      }
    }
    this.overrun.check(this.ticksRun, this.durations, Math.min(this.ticksRun, DURATION_RING_SIZE));
  }

  /** tick 직후: 데드라인 전진 → 정지 표본 → 캐치업 clamp(skip) → onSchedule → 재예약. */
  private scheduleNext(): void {
    this.nextDeadline += TICK_MS;
    const t1 = this.now();
    const behind = t1 - this.nextDeadline;
    if (behind > TICK_MS && this.prevBehind <= TICK_MS) metrics.tickStallMs.observe(behind);
    this.prevBehind = behind;
    const s = this.clampBacklog(t1);
    if (s > 0) {
      this.skipped += s;
      metrics.tickSkipped.inc(undefined, s);
      const sup = skipWarnSquelch.allow("skip");
      if (sup >= 0) {
        log.warn(
          suppressedMeta({ skipped: s, totalSkipped: this.skipped, maxCatchUp: this.maxCatchUp }, sup),
          "tick backlog skipped",
        );
      }
    }
    this.reportSchedule(s, this.nextDeadline - t1);
    // onSchedule(GC 페이서의 비동기 GC 요청 등)이 쓴 시간만큼 다음 tick이 늦게 깨지 않게 예약은 지금 시각 기준.
    this.timer = this.setTimer(this.tick, Math.max(0, this.nextDeadline - this.now()));
  }

  /** 밀린 데드라인이 상한을 넘으면 초과분을 격자 단위로 건너뛴다. 반환: 이번에 건너뛴 수. */
  private clampBacklog(t: number): number {
    const behind = t - this.nextDeadline;
    if (behind < 0) return 0;
    const overdue = Math.floor(behind / TICK_MS) + 1;
    const skip = overdue - this.maxCatchUp;
    if (skip <= 0) return 0;
    this.nextDeadline += skip * TICK_MS;
    return skip;
  }

  private reportSchedule(skipped: number, idleMs: number): void {
    const onSchedule = this.opts.onSchedule;
    if (onSchedule === undefined) return;
    try {
      onSchedule(skipped, idleMs);
    } catch (err) {
      const sup = tickErrSquelch.allow("onSchedule");
      if (sup >= 0) log.error(suppressedMeta({ err }, sup), "onSchedule threw");
    }
  }
}
