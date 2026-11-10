/**
 * 크래시 핸들러 테스트 — exitFn 주입으로 본체 직접 검증(실제 exit 없음),
 * 동기 싱크 드레인 호출, unhandledRejection 무종료+카운터, 설치 멱등/해제.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import {
  installCrashHandlers,
  onUncaughtException,
  onUnhandledRejection,
} from "../../server/src/obs/crashHandlers";
import {
  levelRank,
  refreshLogLevel,
  registerSink,
  type LogSink,
} from "../../server/src/obs/logger";
import { metrics } from "../../server/src/obs/metrics";

describe("crashHandlers", () => {
  let originalLevel: string | undefined;
  const cleanups: Array<() => void> = [];

  beforeAll(() => {
    originalLevel = process.env["LOG_LEVEL"];
    process.env["LOG_LEVEL"] = "silent";
    refreshLogLevel();
  });

  afterAll(() => {
    if (originalLevel === undefined) delete process.env["LOG_LEVEL"];
    else process.env["LOG_LEVEL"] = originalLevel;
    refreshLogLevel();
  });

  afterEach(() => {
    for (const fn of cleanups.splice(0)) fn();
  });

  function captureSink(): {
    sink: LogSink;
    records: Array<Record<string, unknown>>;
    flushedSync: () => boolean;
  } {
    const records: Array<Record<string, unknown>> = [];
    let flushed = false;
    const sink: LogSink = {
      minLevel: levelRank("debug"),
      write(record) {
        records.push(record);
      },
      flushSync() {
        flushed = true;
      },
    };
    return { sink, records, flushedSync: () => flushed };
  }

  test("uncaughtException — JSON error 로그 → 동기 드레인 → exit(1)", () => {
    const cap = captureSink();
    cleanups.push(registerSink(cap.sink));
    let exitCode = -1;

    onUncaughtException(new Error("boom"), (code) => {
      exitCode = code;
    });

    expect(exitCode).toBe(1);
    expect(cap.flushedSync()).toBe(true);
    const rec = cap.records.find((r) => r["mod"] === "crash");
    expect(rec?.["level"]).toBe("error");
    expect(String(rec?.["msg"])).toContain("uncaughtException");
  });

  test("unhandledRejection — 종료 없음, 카운터 증가 + 로그", () => {
    const cap = captureSink();
    cleanups.push(registerSink(cap.sink));
    const before = metrics.unhandledRejection.value();

    expect(() => onUnhandledRejection(new Error("late"))).not.toThrow();

    expect(metrics.unhandledRejection.value()).toBe(before + 1);
    expect(cap.records.some((r) => String(r["msg"]).includes("unhandledRejection"))).toBe(true);
  });

  test("설치는 멱등, 해제 시 리스너 원복 — import만으로는 미설치", () => {
    const before = process.listenerCount("uncaughtException");
    const uninstall = installCrashHandlers();
    expect(process.listenerCount("uncaughtException")).toBe(before + 1);
    const noop = installCrashHandlers(); // 멱등 — 리스너 추가 없음.
    expect(process.listenerCount("uncaughtException")).toBe(before + 1);
    noop();
    uninstall();
    expect(process.listenerCount("uncaughtException")).toBe(before);
  });
});
