// 스냅샷 꼬리(성능 4.5 후속) — GC 페이서. 벤치에서 월드 tick p99 꼬리의 원인은 tick 안에서 시작되는 JSC GC였다(zoneBench 1150명·게이트웨이
// 경유 — tick 연속 조건: 가장 느린 1% tick 12개 전부 GC tick·GC tick 3.6% / 20 Hz 조건: GC tick 3.8%·스냅샷 p99/평균 2.28). 정지 자체는
// 0.3 ms지만 동시 마킹 동안 메인 스레드가 느려져 그 tick이 +12–14 ms. tick 직후 유휴 구간에 비동기 GC를 미리 요청하면(K tick마다) 할당
// 임계가 tick 안에서 차지 않아 20 Hz 벤치 tick p99 23.56 → 13.23 ms, CPU 변화는 잡음 범위.
//
// 계약: afterTick(skipped, idleMs)는 tick 루프 반복마다(onSchedule) 1회. everyTicks번째 tick부터 유휴가 minIdleMs 이상이고 이번 반복에
// 건너뛴 tick이 없을 때 collect 1회 후 카운터 리셋. 조건이 안 맞으면 미루고(deferred) 다음 반복에 다시 본다. everyTicks 0 = 끔.

import { describe, expect, test } from "bun:test";
import { GcPacer, assertGcPacerOptions } from "../../server/src/sim/gcPacer";
import { metrics } from "../../server/src/obs/metrics";
import { startTickLoop } from "../../server/src/sim/tickLoop";

function pacer(everyTicks: number, minIdleMs = 10) {
  const calls: number[] = [];
  let tick = 0;
  const p = new GcPacer({ everyTicks, minIdleMs, collect: () => void calls.push(tick) });
  const step = (skipped = 0, idleMs = 40): boolean => {
    tick++;
    return p.afterTick(skipped, idleMs);
  };
  return { p, calls, step };
}

describe("GcPacer — tick 사이 유휴 구간에 비동기 GC 요청", () => {
  test("everyTicks번째 tick마다 1회 요청하고 카운터를 리셋한다", () => {
    const { calls, step } = pacer(4);
    const paced = metrics.gcPaced.value();
    for (let i = 0; i < 12; i++) step();
    expect(calls).toEqual([4, 8, 12]);
    expect(metrics.gcPaced.value() - paced).toBe(3);
  });

  test("유휴가 minIdleMs 미만이면 미루고, 다음 반복에 유휴가 생기면 바로 요청한다", () => {
    const { calls, step } = pacer(4, 10);
    const deferred = metrics.gcPaceDeferred.value();
    step();
    step();
    step();
    expect(step(0, 9.9)).toBe(false);
    expect(step(0, 3)).toBe(false);
    expect(step(0, 10)).toBe(true);
    expect(calls).toEqual([6]);
    expect(metrics.gcPaceDeferred.value() - deferred).toBe(2);
    // 리셋은 요청한 반복 기준 — 다음은 4 tick 뒤.
    for (let i = 0; i < 4; i++) step();
    expect(calls).toEqual([6, 10]);
  });

  test("이번 반복에 건너뛴 tick이 있으면(과부하) 미룬다", () => {
    const { calls, step } = pacer(2);
    step();
    expect(step(3, 40)).toBe(false);
    expect(step(0, 40)).toBe(true);
    expect(calls).toEqual([3]);
  });

  test("everyTicks 0 = 끔 — 요청도 미룸 집계도 없다", () => {
    const { calls, step } = pacer(0);
    const deferred = metrics.gcPaceDeferred.value();
    for (let i = 0; i < 50; i++) step(0, 0);
    expect(calls).toEqual([]);
    expect(metrics.gcPaceDeferred.value()).toBe(deferred);
  });

  test("collect가 던져도 카운터는 리셋돼 매 반복 재시도하지 않는다(예외는 tick 루프가 격리)", () => {
    let calls = 0;
    const p = new GcPacer({
      everyTicks: 3,
      minIdleMs: 0,
      collect: () => {
        calls++;
        throw new Error("gc boom");
      },
    });
    const results: string[] = [];
    for (let i = 0; i < 6; i++) {
      try {
        results.push(String(p.afterTick(0, 40)));
      } catch {
        results.push("threw");
      }
    }
    expect(results).toEqual(["false", "false", "threw", "false", "false", "threw"]);
    expect(calls).toBe(2);
  });

  test.each([
    ["everyTicks 음수", { everyTicks: -1, minIdleMs: 10 }],
    ["everyTicks 소수", { everyTicks: 1.5, minIdleMs: 10 }],
    ["minIdleMs 음수", { everyTicks: 8, minIdleMs: -1 }],
    ["minIdleMs NaN", { everyTicks: 8, minIdleMs: Number.NaN }],
  ])("옵션 불변식: %s → RangeError", (_n, o) => {
    expect(() => assertGcPacerOptions(o)).toThrow(RangeError);
    expect(() => new GcPacer({ ...o, collect: () => {} })).toThrow(RangeError);
  });
});

describe("GcPacer × 실제 tick 루프(가짜 시계)", () => {
  function fakeClock() {
    let now = 0;
    let seq = 0;
    const timers = new Map<number, { at: number; fn: () => void }>();
    return {
      now: () => now,
      spend(ms: number) {
        now += ms;
      },
      setTimer(fn: () => void, ms: number): number {
        timers.set(++seq, { at: now + Math.max(0, ms), fn });
        return seq;
      },
      clearTimer(id: unknown) {
        timers.delete(id as number);
      },
      advanceTo(target: number) {
        for (;;) {
          let next: [number, { at: number; fn: () => void }] | null = null;
          for (const e of timers) if (e[1].at <= target && (next === null || e[1].at < next[1].at)) next = e;
          if (next === null) break;
          timers.delete(next[0]);
          now = Math.max(now, next[1].at);
          next[1].fn();
        }
        now = Math.max(now, target);
      },
    };
  }

  test("정상 부하 — K tick마다 요청(유휴 = 50 − tick 시간)", () => {
    const c = fakeClock();
    let calls = 0;
    const pacer = new GcPacer({ everyTicks: 4, minIdleMs: 10, collect: () => void calls++ });
    const h = startTickLoop(() => c.spend(12), {
      now: c.now,
      setTimer: (f, ms) => c.setTimer(f, ms),
      clearTimer: (x) => c.clearTimer(x),
      onSchedule: (skipped, idleMs) => void pacer.afterTick(skipped, idleMs),
    });
    c.advanceTo(50 * 12 + 20);
    h.stop();
    expect(h.ticksRun()).toBe(12);
    expect(calls).toBe(3);
  });

  test("TICK_MAX_CATCHUP=0 정지 — skip한 반복은 유휴가 양수여도 요청하지 않고 미룬다", () => {
    const c = fakeClock();
    let calls = 0;
    let n = 0;
    const pacer = new GcPacer({ everyTicks: 2, minIdleMs: 10, collect: () => void calls++ });
    const seen: Array<[number, number]> = [];
    const deferred = metrics.gcPaceDeferred.value();
    const h = startTickLoop(
      () => {
        n++;
        // 2번째 tick이 1초 정지 — 밀린 데드라인 전부 skip(상한 0)되고 다음 데드라인은 격자상 앞쪽(유휴 > 0).
        c.spend(n === 2 ? 1010 : 1);
      },
      {
        now: c.now,
        setTimer: (f, ms) => c.setTimer(f, ms),
        clearTimer: (x) => c.clearTimer(x),
        maxCatchUpTicks: 0,
        onSchedule: (skipped, idleMs) => {
          seen.push([skipped, idleMs]);
          pacer.afterTick(skipped, idleMs);
        },
      },
    );
    c.advanceTo(1200);
    h.stop();
    expect(seen[1]![0]).toBeGreaterThan(0);
    expect(seen[1]![1]).toBeGreaterThan(10);
    expect(metrics.gcPaceDeferred.value() - deferred).toBe(1);
    // 미룬 요청은 다음(skip 없는) 반복에서 나간다.
    expect(calls).toBe(1);
  });
});
