// GC 페이서(성능 4.5 후속 — 스냅샷 꼬리). 벤치에서 월드 tick p99 꼬리의 원인은 tick 안에서 시작되는 JSC GC였다: 할당 임계는 할당이
// 몰리는 tick 안(대부분 스냅샷 단계)에서 차고, 정지 자체는 짧지만(≈0.3 ms) 동시 마킹 동안 메인 스레드가 느려져 그 tick이 +12–14 ms가
// 된다(zoneBench 1150명·게이트웨이 경유·20 Hz — GC tick 3.8%가 p99를 정했다). tick 직후(다음 데드라인까지 유휴가 남았을 때) K tick마다
// 비동기 GC를 미리 요청하면 임계가 tick 안에서 차지 않는다. 실서버는 입력 경로 할당 탓에 eden이 거의 매 tick이라 효과가 다른 경로로
// 난다 — monolith는 full 수집이 줄어 p99가 내려가고(7 → 2회/런), 월드는 런 편차 안이다(docs/perf-baseline.md "스냅샷 꼬리 — GC 페이서").
// 동기 fullGC는 힙에 비례해 길어져(≈1 GB 힙 82 ms — tick 주기 초과) 쓰지 않는다. 비동기 요청(Bun.gc(false))의 메인 스레드 비용은 평균
// 0.2–0.3 ms(≈1 GB 힙 2.4 ms)이고 나머지는 유휴 동안 보조 스레드가 한다.
// 위 실서버 효과는 Bun 1.3.x(이벤트 루프 GC 샘플러가 tick 안 eden을 걸던 런타임) 결과다 — 1.4.3에서는 이득이 측정되지 않아 운영 기본은
// 끔(GC_PACE_TICKS=0, 켤 때 8 — docs/perf-baseline.md "Bun 1.4.3 — 수용 인원·GC 페이서·소크").
//
// 시계 없음 — tick 루프(onSchedule)가 이번 반복의 skip 수와 다음 데드라인까지 유휴(ms)를 넘긴다(sim 순수성 규칙).

import { metrics } from "../obs/metrics";

export interface GcPacerOptions {
  /** 요청 간격(tick). 0 = 끔. 자연 GC 간격(부하마다 다름 — 벤치 1150명 spread ≈26 tick)보다 충분히 짧아야 한다. */
  readonly everyTicks: number;
  /** 요청에 필요한 다음 데드라인까지 최소 유휴(ms) — 모자라면 미룬다(과부하 중엔 종전대로 자연 GC). */
  readonly minIdleMs: number;
}

/** 옵션 불변식 — everyTicks는 0 이상 정수, minIdleMs는 0 이상 유한수. */
export function assertGcPacerOptions(o: GcPacerOptions): void {
  if (!Number.isInteger(o.everyTicks) || o.everyTicks < 0) throw new RangeError(`everyTicks must be an integer >= 0, got ${o.everyTicks}`);
  if (!Number.isFinite(o.minIdleMs) || o.minIdleMs < 0) throw new RangeError(`minIdleMs must be >= 0, got ${o.minIdleMs}`);
}

export class GcPacer {
  private readonly everyTicks: number;
  private readonly minIdleMs: number;
  private readonly collect: () => void;
  private since = 0;

  constructor(opts: GcPacerOptions & { collect?: () => void }) {
    assertGcPacerOptions(opts);
    this.everyTicks = opts.everyTicks;
    this.minIdleMs = opts.minIdleMs;
    this.collect = opts.collect ?? (() => Bun.gc(false));
  }

  /** tick 루프 반복 1회(onSchedule) — 요청했으면 true. collect 예외는 호출자(tick 루프)가 격리한다. */
  afterTick(skipped: number, idleMs: number): boolean {
    if (this.everyTicks === 0) return false;
    this.since++;
    if (this.since < this.everyTicks) return false;
    if (skipped > 0 || idleMs < this.minIdleMs) {
      metrics.gcPaceDeferred.inc();
      return false;
    }
    this.since = 0;
    metrics.gcPaced.inc();
    this.collect();
    return true;
  }
}
