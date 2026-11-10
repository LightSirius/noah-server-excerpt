// 1-C(2) — tickLoop 스케줄러 단위 테스트(가짜 시계 + 가짜 타이머 큐).
//
// 종전엔 캐치업 상한이 없어 수 초 정지 후 S/50개 tick이 쉼 없이 연달아 돌았고(지연 무한 누적·
// 스냅샷 과송신 → partial write), 스케줄러 자체가 주입 불가라 단위 테스트가 없었다.
// 계약: 지연 데드라인 격자 유지, 밀린 tick은 maxCatchUpTicks개까지만 연달아 실행하고 나머지는
// 건너뛰며(skippedTicks 누적) 격자 위상은 보존한다. tickFn 예외는 루프를 죽이지 않는다.

import { describe, expect, test } from "bun:test";
import { startTickLoop } from "../../server/src/sim/tickLoop";
import { TICK_MS } from "../../server/src/sim/deterministic";
import { metrics } from "../../server/src/obs/metrics";

/** 가짜 시계 + 타이머 큐 — setTimer(fn, ms)는 now+ms에 실행 예약, advance가 도래분을 순서대로 실행. */
function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void; order: number }>();
  return {
    now: () => now,
    /** tickFn 안에서 "처리 시간"을 흉내 낼 때 사용. */
    spend(ms: number) {
      now += ms;
    },
    setTimer(fn: () => void, ms: number): number {
      const id = ++seq;
      timers.set(id, { at: now + Math.max(0, ms), fn, order: id });
      return id;
    },
    clearTimer(id: unknown) {
      timers.delete(id as number);
    },
    /** target 시각까지 시계를 진행하며 도래 타이머를 (at, 등록순) 순으로 실행. */
    advanceTo(target: number) {
      for (;;) {
        let next: { id: number; at: number; order: number; fn: () => void } | null = null;
        for (const [id, t] of timers) {
          if (t.at > target) continue;
          if (next === null || t.at < next.at || (t.at === next.at && t.order < next.order)) {
            next = { id, ...t };
          }
        }
        if (next === null) break;
        timers.delete(next.id);
        if (next.at > now) now = next.at;
        next.fn();
      }
      if (target > now) now = target;
    },
    pending: () => timers.size,
  };
}

function start(clock: ReturnType<typeof fakeClock>, fn: () => void, maxCatchUpTicks?: number) {
  return startTickLoop(fn, {
    now: clock.now,
    setTimer: (f, ms) => clock.setTimer(f, ms),
    clearTimer: (h) => clock.clearTimer(h),
    ...(maxCatchUpTicks !== undefined ? { maxCatchUpTicks } : {}),
  });
}

describe("startTickLoop — 스케줄링", () => {
  test("정상 cadence: 1초에 20 tick, 표류·skip·지연 없음", () => {
    const c = fakeClock();
    const starts: number[] = [];
    const h = start(c, () => starts.push(c.now()));
    c.advanceTo(1000);
    expect(h.ticksRun()).toBe(20);
    expect(starts).toEqual(Array.from({ length: 20 }, (_, i) => (i + 1) * TICK_MS));
    expect(h.skippedTicks()).toBe(0);
    expect(h.lastLatenessMs()).toBe(0);
    h.stop();
  });

  test("느린 tick 1회(120ms) — 상한 이내라 밀린 tick을 연달아 실행해 격자 복귀(skip 0)", () => {
    const c = fakeClock();
    const starts: number[] = [];
    let n = 0;
    const h = start(c, () => {
      starts.push(c.now());
      if (++n === 1) c.spend(120);
    });
    c.advanceTo(400);
    // tick1 @50(→170), 데드라인 100·150 지남 → @170 연달아 2회, 이후 200·250·…
    expect(starts.slice(0, 5)).toEqual([50, 170, 170, 200, 250]);
    expect(h.ticksRun()).toBe(8);
    expect(h.skippedTicks()).toBe(0);
    h.stop();
  });

  test("장기 정지(7000ms) — 상한(5)개만 연달아 실행, 나머지 skip 누적, 격자 위상 보존", () => {
    const c = fakeClock();
    const starts: number[] = [];
    let n = 0;
    const h = start(
      c,
      () => {
        starts.push(c.now());
        if (++n === 1) c.spend(7000);
      },
      5,
    );
    c.advanceTo(7300);
    // tick1 @50 → 종료 7050. 다음 데드라인 100: 밀린 데드라인 100..7050 = 140개.
    // 140 − 5 = 135개 skip → 데드라인 6850부터 5개(6850..7050)를 7050에 연달아 실행.
    expect(h.skippedTicks()).toBe(135);
    expect(starts.slice(1, 6)).toEqual([7050, 7050, 7050, 7050, 7050]);
    // 이후 격자(50의 배수) 유지.
    expect(starts.slice(6, 9)).toEqual([7100, 7150, 7200]);
    // 연달아 실행된 첫 tick의 지연 = 7050 − 6850 = 200ms.
    h.stop();
  });

  test("maxCatchUpTicks=0 — 밀린 tick을 전부 skip하고 다음 미래 데드라인으로", () => {
    const c = fakeClock();
    const starts: number[] = [];
    let n = 0;
    const h = start(
      c,
      () => {
        starts.push(c.now());
        if (++n === 1) c.spend(230);
      },
      0,
    );
    c.advanceTo(400);
    // tick1 @50 → 280. 밀린 데드라인 100·150·200·250 = 4개 전부 skip → 다음 300.
    expect(h.skippedTicks()).toBe(4);
    expect(starts.slice(0, 3)).toEqual([50, 300, 350]);
    h.stop();
  });

  test("지연(lateness) 기록 — 타이머가 늦게 깨면 데드라인 대비 지연을 기록", () => {
    const c = fakeClock();
    let lateSeen = -1;
    const h = startTickLoop(
      () => {
        lateSeen = h.lastLatenessMs();
      },
      {
        now: c.now,
        // 타이머가 항상 7ms 늦게 깨는 OS(Windows 양자화) 흉내.
        setTimer: (f, ms) => c.setTimer(f, ms + 7),
        clearTimer: (x) => c.clearTimer(x),
      },
    );
    c.advanceTo(60);
    expect(h.ticksRun()).toBe(1);
    expect(h.lastLatenessMs()).toBe(7);
    expect(lateSeen).toBe(7);
    h.stop();
  });

  test("stop() — 예약된 타이머 취소, 이후 tick 없음", () => {
    const c = fakeClock();
    const h = start(c, () => {});
    c.advanceTo(100);
    expect(h.ticksRun()).toBe(2);
    h.stop();
    c.advanceTo(1000);
    expect(h.ticksRun()).toBe(2);
    expect(c.pending()).toBe(0);
  });

  test("tickFn 예외 격리 — 루프 계속", () => {
    const c = fakeClock();
    let n = 0;
    const h = start(c, () => {
      n++;
      if (n === 2) throw new Error("boom");
    });
    c.advanceTo(250);
    expect(h.ticksRun()).toBe(5);
    h.stop();
  });
});

describe("mmorpg_tick_stall_ms — clamp 전 backlog(정지 크기) 관측", () => {
  function stallDelta<T>(fn: () => T): { count: number; sum: number } {
    const before = metrics.tickStallMs.snapshot();
    fn();
    const after = metrics.tickStallMs.snapshot();
    return { count: after.count - before.count, sum: after.sum - before.sum };
  }

  test("정상 cadence — 기록 없음", () => {
    const c = fakeClock();
    const d = stallDelta(() => {
      const h = start(c, () => {});
      c.advanceTo(2000);
      h.stop();
    });
    expect(d).toEqual({ count: 0, sum: 0 });
  });

  test("tickFn 내부 7000ms 정지 — lateness는 clamp로 ~200ms에 머물지만 stall은 6950ms 1건", () => {
    const c = fakeClock();
    let n = 0;
    let maxLateness = 0;
    const d = stallDelta(() => {
      const h = start(
        c,
        () => {
          maxLateness = Math.max(maxLateness, h.lastLatenessMs());
          if (++n === 1) c.spend(7000);
        },
        5,
      );
      c.advanceTo(7300);
      h.stop();
    });
    // 데드라인 100 기준 종료 7050 → 6950ms 뒤처짐. 캐치업 중 줄어드는 잔여(150·100·…)는 제외.
    expect(d).toEqual({ count: 1, sum: 6950 });
    expect(maxLateness).toBe(200);
  });

  test("상한 이내 정지(120ms)도 1 tick 초과 backlog면 1건(70ms)", () => {
    const c = fakeClock();
    let n = 0;
    const d = stallDelta(() => {
      const h = start(c, () => {
        if (++n === 1) c.spend(120);
      });
      c.advanceTo(400);
      h.stop();
    });
    expect(d).toEqual({ count: 1, sum: 70 });
  });

  test("지속 과부하(매 tick 60ms) — 에피소드 시작 1건만, clamp 주기마다 반복 표본 없음", () => {
    const c = fakeClock();
    const d = stallDelta(() => {
      const h = start(c, () => c.spend(60), 5);
      c.advanceTo(10_000);
      expect(h.skippedTicks()).toBeGreaterThan(0);
      h.stop();
    });
    // backlog 10·20·…·50(1 tick 이하) → 60에서 정지 전이 1건. 이후 clamp가 200~250 사이에 묶어
    // 단조 증가가 반복돼도 1 tick 이하로 회복하지 않았으므로 추가 표본 없음 — count = 정지 횟수.
    expect(d).toEqual({ count: 1, sum: 60 });
  });

  test("회복 후 새 정지는 별도 1건 — 정지 아님(≤1 tick) → 정지 전이마다 1건", () => {
    const c = fakeClock();
    let n = 0;
    const d = stallDelta(() => {
      const h = start(c, () => {
        n++;
        if (n === 1) c.spend(120);
        if (n === 20) c.spend(300);
      });
      c.advanceTo(3000);
      h.stop();
    });
    // 첫 정지 70ms(데드라인 100 기준 170 종료) → 격자 복귀 → tick20 @1000이 300ms 정지 → 250ms.
    expect(d).toEqual({ count: 2, sum: 320 });
  });

  test("tick 밖 정지(타이머가 450ms 늦게 깸) — 1건(400ms)", () => {
    const c = fakeClock();
    let scheduled = 0;
    const d = stallDelta(() => {
      const h = startTickLoop(() => {}, {
        now: c.now,
        // 세 번째 예약만 450ms 늦게 — 이벤트 루프가 tick 사이에서 막힌 상황.
        setTimer: (f, ms) => c.setTimer(f, ++scheduled === 3 ? ms + 450 : ms),
        clearTimer: (x) => c.clearTimer(x),
      });
      c.advanceTo(1000);
      h.stop();
    });
    expect(d).toEqual({ count: 1, sum: 400 });
  });
});

describe("onTick 관측 훅(2-A tick 프로파일러 확정 지점)", () => {
  test("tick마다 (처리 시간, 지연)을 1회 보고 — 메트릭과 같은 값", () => {
    const c = fakeClock();
    const seen: Array<[number, number]> = [];
    let n = 0;
    const h = startTickLoop(
      () => {
        if (++n === 2) c.spend(70);
        else c.spend(3);
      },
      {
        now: c.now,
        setTimer: (f, ms) => c.setTimer(f, ms),
        clearTimer: (x) => c.clearTimer(x),
        onTick: (d, l) => void seen.push([d, l]),
      },
    );
    c.advanceTo(180);
    h.stop();
    // tick1 @50(3ms) → tick2 @100(70ms → 170) → tick3 데드라인 150, 시작 170 → 지연 20.
    expect(seen.slice(0, 3)).toEqual([
      [3, 0],
      [70, 0],
      [3, 20],
    ]);
    expect(seen.length).toBe(h.ticksRun());
  });

  test("onTick이 throw해도 루프는 계속 돈다", () => {
    const c = fakeClock();
    const h = startTickLoop(() => {}, {
      now: c.now,
      setTimer: (f, ms) => c.setTimer(f, ms),
      clearTimer: (x) => c.clearTimer(x),
      onTick: () => {
        throw new Error("observer boom");
      },
    });
    c.advanceTo(500);
    expect(h.ticksRun()).toBe(10);
    h.stop();
  });
});

describe("onSchedule 훅(3단계 슬라이스 8 — 과부하 신호 입력)", () => {
  test("반복마다 1회, 이번 반복에서 건너뛴 tick 수를 보고 — 정상 0, 7초 정지 후 135", () => {
    const c = fakeClock();
    const seen: number[] = [];
    let n = 0;
    const h = startTickLoop(
      () => {
        if (++n === 3) c.spend(7000);
      },
      {
        now: c.now,
        setTimer: (f, ms) => c.setTimer(f, ms),
        clearTimer: (x) => c.clearTimer(x),
        maxCatchUpTicks: 5,
        onSchedule: (skipped) => void seen.push(skipped),
      },
    );
    c.advanceTo(7400);
    h.stop();
    expect(seen.length).toBe(h.ticksRun());
    expect(seen.slice(0, 2)).toEqual([0, 0]);
    // tick3 @150 → 7150 종료. 밀린 데드라인 200..7150 = 140개 − 상한 5 = 135.
    expect(seen[2]).toBe(135);
    expect(seen.slice(3).every((s) => s === 0)).toBe(true);
    expect(seen.reduce((a, b) => a + b, 0)).toBe(h.skippedTicks());
  });

  test("다음 데드라인까지 남은 유휴(ms)를 함께 보고 — tick 10 ms면 40, 정지 직후 캐치업 중엔 0 이하", () => {
    const c = fakeClock();
    const idle: number[] = [];
    let n = 0;
    const h = startTickLoop(
      () => {
        n++;
        c.spend(n === 3 ? 1000 : 10);
      },
      {
        now: c.now,
        setTimer: (f, ms) => c.setTimer(f, ms),
        clearTimer: (x) => c.clearTimer(x),
        maxCatchUpTicks: 5,
        onSchedule: (_skipped, idleMs) => void idle.push(idleMs),
      },
    );
    c.advanceTo(400);
    h.stop();
    expect(idle.slice(0, 2)).toEqual([40, 40]);
    // tick3 @150 → 1160 종료: 밀린 데드라인이 상한 5로 clamp돼 다음 데드라인은 이미 지났다.
    expect(idle[2]!).toBeLessThanOrEqual(0);
  });

  test("onSchedule이 쓴 시간만큼 다음 tick이 늦게 깨지 않는다 — 예약은 onSchedule 뒤 시각 기준", () => {
    const c = fakeClock();
    const starts: number[] = [];
    const h = startTickLoop(() => void starts.push(c.now()), {
      now: c.now,
      setTimer: (f, ms) => c.setTimer(f, ms),
      clearTimer: (x) => c.clearTimer(x),
      onSchedule: () => c.spend(7),
    });
    c.advanceTo(260);
    h.stop();
    expect(starts).toEqual([50, 100, 150, 200, 250]);
    expect(h.lastLatenessMs()).toBe(0);
  });

  test("onSchedule이 throw해도 루프는 계속 돈다", () => {
    const c = fakeClock();
    const h = startTickLoop(() => {}, {
      now: c.now,
      setTimer: (f, ms) => c.setTimer(f, ms),
      clearTimer: (x) => c.clearTimer(x),
      onSchedule: () => {
        throw new Error("observer boom");
      },
    });
    c.advanceTo(500);
    expect(h.ticksRun()).toBe(10);
    h.stop();
  });

  test("stop() 이후 반복에서는 호출하지 않는다", () => {
    const c = fakeClock();
    let calls = 0;
    const h: ReturnType<typeof startTickLoop> = startTickLoop(
      () => {
        if (h.ticksRun() === 1) h.stop();
      },
      {
        now: c.now,
        setTimer: (f, ms) => c.setTimer(f, ms),
        clearTimer: (x) => c.clearTimer(x),
        onSchedule: () => void calls++,
      },
    );
    c.advanceTo(500);
    expect(calls).toBe(1);
  });
});
