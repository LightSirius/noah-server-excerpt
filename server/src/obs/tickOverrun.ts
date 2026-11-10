// 틱 과부하 경보 — architecture.md §4.1: "tick 시간 p99 > 30ms 경고. > 50ms = 시뮬 무너짐".
//
// tickLoop의 기존 256슬롯 duration 링(쓰기 전용이던)을 읽어 checkEveryTicks마다 p50/p99를
// 계산한다. 히스테리시스(진입 30ms / 복귀 24ms)로 문턱 근처 플래핑을 막고, 열화 지속 중에는
// remindEveryTicks당 1회만 재경고한다. 모든 판단이 tick 카운트 기반 — 시간 API 불사용이라
// 호출부(sim/tickLoop)의 결정론 게이트와 충돌하지 않는다.

import type { Logger } from "./logger";

export interface TickOverrunOptions {
  /** p99가 이 값 초과 시 warn 진입. 기본 30ms(§4.1). */
  warnP99Ms?: number;
  /** p99가 이 값 초과 시 error로 승격. 기본 50ms(tick 예산). */
  errorP99Ms?: number;
  /** 열화 중 p99가 이 값 미만이면 복귀. 기본 24ms(히스테리시스). */
  recoverP99Ms?: number;
  /** 계산 주기(tick). 기본 100 = 5초 @20Hz. */
  checkEveryTicks?: number;
  /** 열화 지속 중 재경고 간격(tick). 기본 1200 = 60초. */
  remindEveryTicks?: number;
}

export class TickOverrunMonitor {
  private readonly _log: Logger;
  private readonly _warn: number;
  private readonly _error: number;
  private readonly _recover: number;
  private readonly _checkEvery: number;
  private readonly _remindEvery: number;
  private _degraded = false;
  private _lastNoticeTick = 0;

  constructor(log: Logger, opts: TickOverrunOptions = {}) {
    this._log = log;
    this._warn = opts.warnP99Ms ?? 30;
    this._error = opts.errorP99Ms ?? 50;
    this._recover = opts.recoverP99Ms ?? 24;
    this._checkEvery = opts.checkEveryTicks ?? 100;
    this._remindEvery = opts.remindEveryTicks ?? 1200;
  }

  /** 매 tick 호출 — checkEveryTicks 배수 tick에서만 실제 계산(정렬 비용 5초당 1회). */
  check(ticksRun: number, durations: ArrayLike<number>, sampleCount: number): void {
    if (ticksRun === 0 || ticksRun % this._checkEvery !== 0) return;
    const n = Math.min(sampleCount, durations.length);
    if (n === 0) return;
    const sorted: number[] = [];
    for (let i = 0; i < n; i++) sorted.push(durations[i] ?? 0);
    sorted.sort((a, b) => a - b);
    const p99 = sorted[Math.min(n - 1, Math.ceil(n * 0.99) - 1)] ?? 0;
    const p50 = sorted[Math.floor((n - 1) / 2)] ?? 0; // 하위 중앙값 — 짝수 n에서 상향 편향 방지.

    if (!this._degraded) {
      if (p99 <= this._warn) return;
      this._degraded = true;
      this._lastNoticeTick = ticksRun;
      this.notice(ticksRun, p99, p50);
    } else if (p99 < this._recover) {
      this._degraded = false;
      this._log.info({ p99: round2(p99), p50: round2(p50), ticksRun }, "tick p99 recovered");
    } else if (ticksRun - this._lastNoticeTick >= this._remindEvery) {
      this._lastNoticeTick = ticksRun;
      this.notice(ticksRun, p99, p50);
    }
  }

  private notice(ticksRun: number, p99: number, p50: number): void {
    const meta = { p99: round2(p99), p50: round2(p50), ticksRun };
    if (p99 > this._error) {
      this._log.error(meta, "tick p99 over budget — simulation degraded");
    } else {
      this._log.warn(meta, "tick p99 over warn threshold");
    }
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
