/**
 * 로그 스쿼시 단위 테스트 — 버스트/억제/리필 시 suppressed 카운트 반환/LRU 축출/전역 캡.
 * 시계는 옵션 now 주입으로 결정론화.
 */

import { describe, expect, test } from "bun:test";
import { createSquelch, suppressedMeta, warnClient } from "../../server/src/obs/logSquelch";
import type { Logger } from "../../server/src/obs/logger";
import { metrics } from "../../server/src/obs/metrics";

describe("createSquelch", () => {
  test("버스트 소진 후 억제, 리필 시 억제 건수 반환", () => {
    let now = 0;
    const sq = createSquelch({ ratePerSec: 1, burst: 2, now: () => now });

    expect(sq.allow("k")).toBe(0);
    expect(sq.allow("k")).toBe(0);
    expect(sq.allow("k")).toBe(-1);
    expect(sq.allow("k")).toBe(-1);

    now = 2_000; // 2초 경과 → 2토큰 리필.
    expect(sq.allow("k")).toBe(2); // 억제됐던 2건이 카운트로 보존.
    expect(sq.allow("k")).toBe(0);
    expect(sq.allow("k")).toBe(-1);
  });

  test("키별 독립 버킷", () => {
    const sq = createSquelch({ ratePerSec: 0, burst: 1, now: () => 0 });
    expect(sq.allow("a")).toBe(0);
    expect(sq.allow("a")).toBe(-1);
    expect(sq.allow("b")).toBe(0); // 다른 키는 영향 없음.
  });

  test("LRU 축출 — maxKeys 초과 시 가장 오래된 키부터", () => {
    const sq = createSquelch({ ratePerSec: 0, burst: 1, maxKeys: 2, now: () => 0 });
    expect(sq.allow("a")).toBe(0);
    expect(sq.allow("a")).toBe(-1); // a 소진.
    expect(sq.allow("b")).toBe(0);
    expect(sq.allow("c")).toBe(0); // a 축출(가장 오래 미사용).
    expect(sq.allow("a")).toBe(0); // 축출 후 재등장 — 새 버킷으로 허용.
  });

  test("전역 2차 버킷 — 키가 새로워도 전체 총량 캡", () => {
    const sq = createSquelch({
      ratePerSec: 10,
      burst: 10,
      globalRatePerSec: 1,
      globalBurst: 1,
      now: () => 0,
    });
    expect(sq.allow("x")).toBe(0);
    expect(sq.allow("y")).toBe(-1); // 개별 키는 신선하지만 전역 소진.
  });

  test("suppressedMeta — 0이면 원본 그대로, 양수면 suppressed 필드 부착", () => {
    expect(suppressedMeta({ a: 1 }, 0)).toEqual({ a: 1 });
    expect(suppressedMeta({ a: 1 }, 3)).toEqual({ a: 1, suppressed: 3 });
  });

  test("LRU 축출 시 미방출 suppressed는 메트릭으로 폴딩된다", () => {
    const before = metrics.logSuppressedLost.value();
    const sq = createSquelch({ ratePerSec: 0, burst: 1, maxKeys: 1, now: () => 0 });
    expect(sq.allow("a")).toBe(0);
    expect(sq.allow("a")).toBe(-1); // a.suppressed = 1.
    expect(sq.allow("b")).toBe(0); // a 축출 — suppressed 1이 메트릭으로.
    expect(metrics.logSuppressedLost.value()).toBe(before + 1);
  });

  test("warnClient — 버스트 내 허용, 초과분 억제(로거 미호출)", () => {
    const calls: string[] = [];
    const fake: Logger = {
      debug: () => {},
      info: () => {},
      warn: (_m, msg) => {
        calls.push(msg);
      },
      error: () => {},
      child: () => fake,
    };
    for (let i = 0; i < 6; i++) {
      warnClient(fake, "warnclient-test-key", { connId: 1 }, "flood");
    }
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls.length).toBeLessThanOrEqual(3); // 버스트 3 이하 — 나머지는 억제.
  });
});
