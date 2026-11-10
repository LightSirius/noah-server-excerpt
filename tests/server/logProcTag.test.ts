/**
 * 로그 proc 태그(성능 4단계 4.1) — 게이트웨이·월드가 같은 수집기로 로그를 보낼 때 레코드의 출처 프로세스.
 * monolith는 태그를 붙이지 않는다(null) — 종전 레코드 바이트 그대로.
 *
 * 로거는 모듈 싱글턴 — 등록한 싱크·태그·tickProvider를 매 테스트 후 복원한다.
 */

import { afterEach, describe, expect, test } from "bun:test";
import {
  createLogger,
  levelRank,
  registerSink,
  setProcTag,
  setTickProvider,
  type LogSink,
} from "../../server/src/obs/logger";

function capture(): { sink: LogSink; lines: string[]; records: Array<Record<string, unknown>> } {
  const lines: string[] = [];
  const records: Array<Record<string, unknown>> = [];
  return {
    lines,
    records,
    sink: {
      minLevel: levelRank("debug"),
      write(record, line) {
        records.push(record);
        lines.push(line);
      },
    },
  };
}

describe("setProcTag", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups.splice(0)) c();
    setProcTag(null);
    setTickProvider(null);
  });

  test("미설정(null) — 레코드에 proc 키가 없다(monolith 로그 바이트 불변)", () => {
    const c = capture();
    cleanups.push(registerSink(c.sink));
    createLogger("tagtest").info({ a: 1 }, "hello");
    expect(c.records[0]).not.toHaveProperty("proc");
    expect(c.lines[0]).toMatch(/^\{"t":\d+,"level":"info","mod":"tagtest","msg":"hello","a":1\}\n$/);
  });

  test("설정 시 proc 필드가 msg(·tick) 바로 뒤에 붙는다", () => {
    const c = capture();
    cleanups.push(registerSink(c.sink));
    setProcTag("gw1");
    createLogger("tagtest").info({ a: 1 }, "hello");
    expect(c.lines[0]).toMatch(/^\{"t":\d+,"level":"info","mod":"tagtest","msg":"hello","proc":"gw1","a":1\}\n$/);
    setTickProvider(() => 42);
    createLogger("tagtest").warn({}, "with tick");
    expect(c.lines[1]).toMatch(/"msg":"with tick","tick":42,"proc":"gw1"\}/);
  });

  test("meta의 동명 키가 proc를 섀도잉하지 못한다(수집기 필터가 이 값을 신뢰)", () => {
    const c = capture();
    cleanups.push(registerSink(c.sink));
    setProcTag("world");
    createLogger("tagtest", { proc: "base" }).error({ proc: "spoof" }, "x");
    expect(c.records[0]?.["proc"]).toBe("world");
    expect(c.lines[0]).toContain('"proc":"world"');
    expect(c.lines[0]).not.toContain("spoof");
  });

  test("null로 되돌리면 다시 붙지 않는다", () => {
    const c = capture();
    cleanups.push(registerSink(c.sink));
    setProcTag("gw2");
    setProcTag(null);
    createLogger("tagtest").info({}, "y");
    expect(c.records[0]).not.toHaveProperty("proc");
  });
});
