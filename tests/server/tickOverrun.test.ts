/**
 * 틱 과부하 경보 테스트 — 진입(warn)/승격(error)/재경고 간격/복귀 히스테리시스.
 * 전역 로거 대신 가짜 Logger 주입 — 프로세스 전역 상태 무접촉.
 */

import { describe, expect, test } from "bun:test";
import type { Logger } from "../../server/src/obs/logger";
import { TickOverrunMonitor } from "../../server/src/obs/tickOverrun";

interface Call {
  level: string;
  meta: Record<string, unknown>;
  msg: string;
}

function fakeLogger(): { calls: Call[]; logger: Logger } {
  const calls: Call[] = [];
  const push = (level: string) => (meta: Record<string, unknown>, msg: string) => {
    calls.push({ level, meta, msg });
  };
  const logger: Logger = {
    debug: push("debug"),
    info: push("info"),
    warn: push("warn"),
    error: push("error"),
    child: () => logger,
  };
  return { calls, logger };
}

const samples = (ms: number, n = 256): number[] => new Array(n).fill(ms);

describe("TickOverrunMonitor", () => {
  test("정상 p99에서는 침묵, 체크 주기 밖 tick도 침묵", () => {
    const { calls, logger } = fakeLogger();
    const m = new TickOverrunMonitor(logger);
    m.check(100, samples(5), 100);
    m.check(150, samples(60), 150); // 100 배수 아님 — 계산 자체를 안 함.
    expect(calls.length).toBe(0);
  });

  test("p99 > 30ms 진입 시 warn 1회, 재경고는 remindEveryTicks 간격", () => {
    const { calls, logger } = fakeLogger();
    const m = new TickOverrunMonitor(logger, { remindEveryTicks: 200 });
    m.check(100, samples(40), 100);
    expect(calls.length).toBe(1);
    expect(calls[0]?.level).toBe("warn");
    expect(calls[0]?.meta["p99"]).toBe(40);

    m.check(200, samples(40), 200); // 간격(200) 미달(100) — 침묵.
    expect(calls.length).toBe(1);
    m.check(300, samples(40), 256); // 300-100=200 ≥ 200 — 재경고.
    expect(calls.length).toBe(2);
  });

  test("p99 > 50ms면 error로 승격", () => {
    const { calls, logger } = fakeLogger();
    const m = new TickOverrunMonitor(logger);
    m.check(100, samples(60), 100);
    expect(calls[0]?.level).toBe("error");
  });

  test("복귀 히스테리시스 — 24ms 미만에서 info 1회 후 침묵", () => {
    const { calls, logger } = fakeLogger();
    const m = new TickOverrunMonitor(logger);
    m.check(100, samples(40), 100); // 열화 진입.
    m.check(200, samples(27), 200); // 24~30 사이 — 복귀도 재경고도 아님.
    expect(calls.length).toBe(1);
    m.check(300, samples(5), 256); // 복귀.
    expect(calls.length).toBe(2);
    expect(calls[1]?.level).toBe("info");
    expect(calls[1]?.msg).toContain("recovered");
    m.check(400, samples(5), 256); // 정상 유지 — 침묵.
    expect(calls.length).toBe(2);
  });
});
