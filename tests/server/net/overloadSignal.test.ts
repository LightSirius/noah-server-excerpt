// 3단계 슬라이스 8 — 과부하 신호(net/overloadSignal) 단위 테스트(주입 시계·주입 게이지).
//
// 2-C 발견: realistic 1000 접속 폭주처럼 이벤트 루프가 오래 밀리는 지속 과부하에서는 클라가 쌓은 입력이
// 한 번에 도착해 strike 윈도우를 넘기므로 런당 800~950명이 KICK 5(rate)로 끊겼다. 신호는 tick 루프에서
// 파생한다(sim/world에 시계를 두지 않는다) — 루프 반복마다 observeTick(이번에 건너뛴 tick 수).
// 계약:
//   진입: 최근 windowMs 안의 skip 합 ≥ enterSkips, 또는 tick 루프 무응답(마지막 반복 이후 경과) ≥ stallMs
//         (질의 시점 판정 — 정지 직후 tick보다 수신 콜백이 먼저 돌아도 잡는다).
//   유지: 창 안 skip 합 ≥ ceil(enterSkips/4)(기본 5 — 지속 시 ≈19 Hz) 또는 최근 windowMs 안 무응답(진입보다 낮은
//         비례 문턱 — 히스테리시스). 해제: 둘 다 아님. 게이지는 전이 때만 0/1(observeTick만으로도 해제된다).
//   접속 제한: 과부하 && (창 안 skip 합 ≥ ceil(enterSkips/2)(기본 10 — ≈18 Hz 이하) 또는 최근 windowMs 안 무응답) —
//         strike 보류보다 높은 문턱이라 진입 후 19 Hz로 회복하면 접속은 다시 받는다(리뷰: 무기한 거절 방지).
//   enabled=false면 항상 정상, admission=false면 신규 접속 거절만 끈다.

import { describe, expect, test } from "bun:test";
import { DEFAULT_OVERLOAD_POLICY, OverloadSignal, type OverloadPolicy } from "../../../server/src/net/overloadSignal";

function rig(policy: Partial<OverloadPolicy> = {}) {
  let t = 1_000;
  const gaugeSets: number[] = [];
  const signal = new OverloadSignal({
    now: () => t,
    gauge: { set: (v: number) => gaugeSets.push(v) },
    policy,
  });
  return {
    signal,
    gaugeSets,
    advance(ms: number) {
      t += ms;
    },
    /** 정상 cadence로 ms 동안 50ms마다 반복 1회(skip 0). */
    healthy(ms: number) {
      for (let elapsed = 0; elapsed < ms; elapsed += 50) {
        t += 50;
        signal.observeTick(0);
      }
    },
    /** 50ms마다 반복, 매 반복 skip n. */
    skipping(ms: number, n: number) {
      for (let elapsed = 0; elapsed < ms; elapsed += 50) {
        t += 50;
        signal.observeTick(n);
      }
    },
  };
}

describe("OverloadSignal — 기본값", () => {
  test("기본 정책: 켜짐·접속 제한 켜짐·5초 창 skip 20·무응답 1초", () => {
    expect(DEFAULT_OVERLOAD_POLICY).toEqual({
      enabled: true,
      admission: true,
      enterSkips: 20,
      windowMs: 5000,
      stallMs: 1000,
    });
  });

  test("정상 cadence(skip 0)는 과부하가 아니다 — 게이지는 건드리지 않는다", () => {
    const r = rig();
    r.healthy(10_000);
    expect(r.signal.isOverloaded()).toBe(false);
    expect(r.signal.rejectsNewConnections()).toBe(false);
    expect(r.gaugeSets).toEqual([]);
  });
});

describe("OverloadSignal — skip 창 진입", () => {
  test("창 안 skip 합이 문턱 미만(19)이면 진입하지 않는다", () => {
    const r = rig();
    r.skipping(950, 1); // 19회 × skip 1
    expect(r.signal.isOverloaded()).toBe(false);
  });

  test("창 안 skip 합이 문턱(20)에 닿으면 진입 — 게이지 1, 신규 접속 거절", () => {
    const r = rig();
    r.skipping(1000, 1); // 20회 × skip 1
    expect(r.signal.isOverloaded()).toBe(true);
    expect(r.signal.rejectsNewConnections()).toBe(true);
    expect(r.gaugeSets).toEqual([1]);
  });

  test("한 번에 큰 skip(7초 정지 후 135)도 진입", () => {
    const r = rig();
    r.healthy(500);
    r.advance(50);
    r.signal.observeTick(135);
    expect(r.signal.isOverloaded()).toBe(true);
  });

  test("창보다 넓게 흩어진 skip(300ms마다 1 = 5초에 ≈16)은 진입하지 않는다 — 경미한 과부하·간헐 GC", () => {
    const r = rig();
    for (let i = 0; i < 100; i++) {
      r.healthy(250);
      r.advance(50);
      r.signal.observeTick(1);
    }
    expect(r.signal.isOverloaded()).toBe(false);
  });

  test("창 밖으로 밀려난 skip은 합에서 빠진다", () => {
    const r = rig();
    r.skipping(500, 1); // 10
    r.healthy(6000);
    r.skipping(500, 1); // 다시 10 — 앞의 10은 창 밖
    expect(r.signal.isOverloaded()).toBe(false);
  });
});

/** 1초 동안 skip을 perSec번 고르게(각 skip은 50ms 반복 1회, 나머지 반복은 skip 0). perSec는 1000/perSec가 50의 배수인 값. */
function skipsPerSecond(r: ReturnType<typeof rig>, perSec: number, seconds: number, check?: () => void) {
  const gap = Math.floor(1000 / perSec) - 50;
  for (let s = 0; s < seconds; s++) {
    for (let k = 0; k < perSec; k++) {
      r.healthy(gap);
      r.advance(50);
      r.signal.observeTick(1);
    }
    const rest = 1000 - perSec * (gap + 50);
    if (rest > 0) r.healthy(rest);
    check?.();
  }
}

describe("OverloadSignal — 히스테리시스 해제", () => {
  test("진입 후 1초에 skip 2(≈18 Hz — 창에 8~10 ≥ 유지 문턱 5)면 유지, skip이 멎으면 창이 비는 대로 해제(게이지 0)", () => {
    const r = rig();
    r.skipping(1000, 1);
    expect(r.signal.isOverloaded()).toBe(true);
    skipsPerSecond(r, 2, 10, () => expect(r.signal.isOverloaded()).toBe(true));
    r.healthy(5000);
    expect(r.signal.isOverloaded()).toBe(false);
    expect(r.signal.rejectsNewConnections()).toBe(false);
    expect(r.gaugeSets).toEqual([1, 0]);
  });

  test("해제는 observeTick만으로도 일어난다 — 질의(isOverloaded)가 없어도 게이지가 1에 고정되지 않음", () => {
    const r = rig();
    r.skipping(1000, 1);
    r.healthy(6000);
    expect(r.gaugeSets).toEqual([1, 0]);
  });

  test("간헐 블록(4.5초마다 300ms — skip 2)은 과부하를 붙잡지 못한다(리뷰: skip 1건 유지 → 무기한 거절)", () => {
    const r = rig();
    r.skipping(1000, 1);
    expect(r.signal.isOverloaded()).toBe(true);
    for (let i = 0; i < 6; i++) {
      r.healthy(4500);
      r.advance(50);
      r.signal.observeTick(2);
    }
    expect(r.signal.isOverloaded()).toBe(false);
    expect(r.signal.rejectsNewConnections()).toBe(false);
  });

  test("해제 후 다시 진입하려면 진입 문턱을 다시 넘어야 한다", () => {
    const r = rig();
    r.skipping(1000, 1);
    r.healthy(5000);
    expect(r.signal.isOverloaded()).toBe(false);
    r.advance(50);
    r.signal.observeTick(1);
    expect(r.signal.isOverloaded()).toBe(false);
    r.skipping(1000, 1);
    expect(r.signal.isOverloaded()).toBe(true);
    expect(r.gaugeSets).toEqual([1, 0, 1]);
  });
});

describe("OverloadSignal — 접속 제한은 strike 보류보다 높은 문턱", () => {
  test("1초 정지(skip 16)로 진입 → 1초에 skip 1(≈19 Hz)로 회복하면 정지 후 windowMs가 지나는 즉시 접속을 다시 받는다", () => {
    const r = rig();
    r.healthy(500);
    r.advance(1050);
    r.signal.observeTick(16);
    expect(r.signal.isOverloaded()).toBe(true);
    expect(r.signal.rejectsNewConnections()).toBe(true);
    const open: boolean[] = [];
    skipsPerSecond(r, 1, 10, () => open.push(!r.signal.rejectsNewConnections()));
    // 정지(무응답·skip 16)가 창에 있는 4초 동안만 거절, 그 뒤로는 창에 skip 5 이하 < 접속 문턱 10.
    expect(open).toEqual([false, false, false, false, true, true, true, true, true, true]);
  });

  test("1초에 skip 4(≈16 Hz — 창에 18~20)가 이어지면 접속 제한도 유지", () => {
    const r = rig();
    r.skipping(1000, 1);
    skipsPerSecond(r, 4, 12);
    expect(r.signal.rejectsNewConnections()).toBe(true);
  });

  test("정지가 진행 중이면(마지막 반복 이후 ≥ stallMs) 즉시 거절", () => {
    const r = rig();
    r.healthy(500);
    r.advance(1000);
    expect(r.signal.rejectsNewConnections()).toBe(true);
  });
});

describe("OverloadSignal — tick 루프 무응답", () => {
  test("반복 없이 stallMs가 지나면 질의 시점에 진입(정지 직후 수신 콜백이 tick보다 먼저 돌아도)", () => {
    const r = rig();
    r.healthy(500);
    r.advance(999);
    expect(r.signal.isOverloaded()).toBe(false);
    r.advance(1);
    expect(r.signal.isOverloaded()).toBe(true);
    expect(r.gaugeSets).toEqual([1]);
  });

  test("긴 간격 뒤의 반복(gap ≥ stallMs)도 증거 — skip 0이어도 진입", () => {
    const r = rig();
    r.healthy(500);
    r.advance(1500);
    r.signal.observeTick(0);
    expect(r.signal.isOverloaded()).toBe(true);
  });

  test("무응답으로 진입한 뒤 반복이 재개되면 windowMs 동안 증거가 없을 때 해제", () => {
    const r = rig();
    r.healthy(500);
    r.advance(3000);
    expect(r.signal.isOverloaded()).toBe(true);
    r.healthy(50); // 재개 첫 반복 — 직전 간격(3050ms) 자체가 증거
    r.healthy(4950);
    expect(r.signal.isOverloaded()).toBe(true);
    r.healthy(50);
    expect(r.signal.isOverloaded()).toBe(false);
  });

  test("과부하 중 무응답이 이어지면 해제되지 않는다(질의가 증거를 갱신)", () => {
    const r = rig();
    r.skipping(1000, 1);
    r.advance(8000);
    expect(r.signal.isOverloaded()).toBe(true);
  });
});

describe("OverloadSignal — 스위치", () => {
  test("enabled=false: skip·무응답과 무관하게 항상 정상, 게이지 미변경", () => {
    const r = rig({ enabled: false });
    r.skipping(2000, 5);
    r.advance(10_000);
    expect(r.signal.isOverloaded()).toBe(false);
    expect(r.signal.rejectsNewConnections()).toBe(false);
    expect(r.gaugeSets).toEqual([]);
  });

  test("admission=false: 과부하 판정(strike 보류)은 하되 신규 접속은 받는다", () => {
    const r = rig({ admission: false });
    r.skipping(1000, 1);
    expect(r.signal.isOverloaded()).toBe(true);
    expect(r.signal.rejectsNewConnections()).toBe(false);
  });

  test("정책 주입: enterSkips·windowMs·stallMs", () => {
    const r = rig({ enterSkips: 3, windowMs: 2000, stallMs: 400 });
    r.skipping(150, 1);
    expect(r.signal.isOverloaded()).toBe(true);
    r.healthy(2000);
    expect(r.signal.isOverloaded()).toBe(false);
    r.advance(400);
    expect(r.signal.isOverloaded()).toBe(true);
  });
});

describe("OverloadSignal — 누적 지연(lateMs, 채집 궤적 상한 보정)", () => {
  test("정상 cadence는 0, 반복 간격이 100 ms를 넘은 몫만 쌓인다", () => {
    const r = rig();
    r.healthy(2_000);
    expect(r.signal.lateMs()).toBe(0);
    r.advance(1_600);
    r.signal.observeTick(0);
    expect(r.signal.lateMs()).toBe(1_500);
    r.advance(120);
    r.signal.observeTick(0);
    expect(r.signal.lateMs()).toBe(1_520);
  });

  test("질의 시점 진행 중 무응답도 센다 — 정지 직후 tick보다 궤적 수신이 먼저 돌아도", () => {
    const r = rig();
    r.healthy(500);
    r.advance(2_100);
    expect(r.signal.lateMs()).toBe(2_000);
    r.signal.observeTick(0);
    expect(r.signal.lateMs()).toBe(2_000);
  });

  test("신호를 꺼도(enabled=false) 지연은 잰다 — 과부하 판정과 무관한 측정", () => {
    const r = rig({ enabled: false });
    r.advance(1_000);
    r.signal.observeTick(0);
    expect(r.signal.lateMs()).toBe(900);
    expect(r.signal.isOverloaded()).toBe(false);
  });
});
