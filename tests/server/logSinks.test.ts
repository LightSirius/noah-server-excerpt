/**
 * 로거 싱크 계층 단위 테스트 — 등록/해제, per-sink minLevel vs stdout activeLevel 독립,
 * 레닥션, Error/bigint 평면화 유지, tick 필드, 던지는 싱크 격리, flush 경로.
 *
 * 로거는 모듈 싱글턴(프로세스 전역) — 모든 테스트는 등록한 싱크를 해제하고
 * LOG_LEVEL·tickProvider를 복원해 다른 테스트 파일을 오염시키지 않는다.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import {
  createLogger,
  flushAllSinks,
  flushAllSinksSync,
  levelRank,
  refreshLogLevel,
  registerSink,
  setTickProvider,
  type LogSink,
} from "../../server/src/obs/logger";

interface CaptureSink extends LogSink {
  records: Array<Record<string, unknown>>;
  lines: string[];
}

function makeSink(minLevel: number): CaptureSink {
  const sink: CaptureSink = {
    minLevel,
    records: [],
    lines: [],
    write(record, line) {
      sink.records.push(record);
      sink.lines.push(line);
    },
  };
  return sink;
}

/** mod 필터로 stdout 라인을 세는 몽키패치(obs.test.ts와 동일 기법). 반환값으로 복원. */
function patchStdout(modFilter: string, out: string[]): () => void {
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    const s = typeof chunk === "string" ? chunk : "";
    if (s.includes(`"mod":"${modFilter}"`)) out.push(s);
    return true;
  }) as typeof process.stdout.write;
  return () => {
    process.stdout.write = original;
  };
}

describe("로거 싱크 계층", () => {
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
    setTickProvider(null);
  });

  test("stdout silent여도 싱크는 minLevel 이상 레코드를 받는다", () => {
    const sink = makeSink(levelRank("debug"));
    cleanups.push(registerSink(sink));
    const stdoutLines: string[] = [];
    cleanups.push(patchStdout("sink-test", stdoutLines));

    const log = createLogger("sink-test");
    log.debug({ a: 1 }, "d");
    log.info({}, "i");
    log.warn({}, "w");
    log.error({}, "e");

    expect(stdoutLines.length).toBe(0); // silent — stdout 내장 경로는 막힘.
    expect(sink.records.length).toBe(4); // 싱크는 자체 minLevel로만 필터.
    expect(sink.records[0]).toMatchObject({ level: "debug", mod: "sink-test", msg: "d", a: 1 });
    expect(typeof sink.records[0]?.["t"]).toBe("number");
  });

  test("싱크 minLevel 미만 레벨은 write가 호출되지 않는다", () => {
    const sink = makeSink(levelRank("warn"));
    cleanups.push(registerSink(sink));

    const log = createLogger("sink-test");
    log.debug({}, "d");
    log.info({}, "i");
    log.warn({}, "w");
    log.error({}, "e");

    expect(sink.records.map((r) => r["level"])).toEqual(["warn", "error"]);
  });

  test("해제 후에는 전달되지 않는다", () => {
    const sink = makeSink(levelRank("debug"));
    const unregister = registerSink(sink);
    const log = createLogger("sink-test");
    log.info({}, "before");
    unregister();
    log.info({}, "after");

    expect(sink.records.length).toBe(1);
    expect(sink.records[0]?.["msg"]).toBe("before");
  });

  test("line은 개행 종결 1줄이고 레코드 직렬화와 일치한다", () => {
    const sink = makeSink(levelRank("debug"));
    cleanups.push(registerSink(sink));

    createLogger("sink-test").info({ connId: 42 }, "hello");

    const line = sink.lines[0] ?? "";
    expect(line.endsWith("\n")).toBe(true);
    expect(line.indexOf("\n")).toBe(line.length - 1);
    expect(JSON.parse(line)).toMatchObject({
      level: "info",
      mod: "sink-test",
      msg: "hello",
      connId: 42,
    });
  });

  test("레닥션 — 블록리스트 키는 중첩·대소문자 무관 [REDACTED]", () => {
    const sink = makeSink(levelRank("debug"));
    cleanups.push(registerSink(sink));

    createLogger("sink-test").info(
      {
        password: "hunter2",
        token: "abc",
        SECRET: "s",
        nested: { sessionToken: "st", authorization: "Bearer x" },
        accessToken: "at",
        passwordHash: "ph",
        apiKey: "k",
        cookie: "c",
        count: 7,
        username: "alice",
      },
      "redact",
    );

    const parsed = JSON.parse(sink.lines[0] ?? "{}");
    expect(parsed.password).toBe("[REDACTED]");
    expect(parsed.token).toBe("[REDACTED]");
    expect(parsed.SECRET).toBe("[REDACTED]");
    expect(parsed.nested.sessionToken).toBe("[REDACTED]");
    expect(parsed.nested.authorization).toBe("[REDACTED]");
    expect(parsed.accessToken).toBe("[REDACTED]");
    expect(parsed.passwordHash).toBe("[REDACTED]");
    expect(parsed.apiKey).toBe("[REDACTED]");
    expect(parsed.cookie).toBe("[REDACTED]");
    expect(parsed.count).toBe(7); // 비민감 필드는 그대로.
    expect(parsed.username).toBe("alice"); // 의도적 비레닥션(브루트포스 포렌식).
  });

  test("레닥션 — 생활 롤 비밀 키는 Buffer·hex 모두 [REDACTED]", () => {
    const sink = makeSink(levelRank("debug"));
    cleanups.push(registerSink(sink));

    createLogger("sink-test").info(
      { meta: { rollKey: Buffer.alloc(32, 7), bootEpoch: 3 }, roll_key: "ab".repeat(32), ROLLKEY: "x" },
      "redact roll key",
    );

    const line = sink.lines[0] ?? "{}";
    const parsed = JSON.parse(line);
    expect(parsed.meta.rollKey).toBe("[REDACTED]");
    expect(parsed.roll_key).toBe("[REDACTED]");
    expect(parsed.ROLLKEY).toBe("[REDACTED]");
    expect(parsed.meta.bootEpoch).toBe(3); // 회차는 비밀이 아니다.
    expect(line).not.toContain("abab");
  });

  test("레닥션 — err.message/stack 자유 문자열의 자격증명 값 스크럽", () => {
    const sink = makeSink(levelRank("debug"));
    cleanups.push(registerSink(sink));

    createLogger("sink-test").error(
      { err: new Error("reject: token=SUPERSECRET via Bearer abc.def.ghi retry") },
      "scrub",
    );

    const parsed = JSON.parse(sink.lines[0] ?? "{}");
    expect(parsed.err.message).not.toContain("SUPERSECRET");
    expect(parsed.err.message).not.toContain("abc.def.ghi");
    expect(parsed.err.message).toContain("token=[REDACTED]");
    expect(parsed.err.message).toContain("retry"); // 비민감 잔여 텍스트 보존.
  });

  test("meta의 동명 키가 구조 필드(t/level/mod/msg)를 섀도잉하지 못한다", () => {
    const sink = makeSink(levelRank("debug"));
    cleanups.push(registerSink(sink));

    createLogger("sink-test").warn(
      { level: "debug", mod: "fake", msg: "fake", t: 1 },
      "real-message",
    );

    const parsed = JSON.parse(sink.lines[0] ?? "{}");
    expect(parsed.level).toBe("warn");
    expect(parsed.mod).toBe("sink-test");
    expect(parsed.msg).toBe("real-message");
    expect(parsed.t).toBeGreaterThan(1_000_000); // meta의 t=1이 아닌 실제 epoch ms.
  });

  test("Error/bigint 평면화는 싱크 라인에도 유지된다", () => {
    const sink = makeSink(levelRank("debug"));
    cleanups.push(registerSink(sink));

    createLogger("sink-test").error({ err: new Error("boom"), big: 10n }, "flatten");

    const parsed = JSON.parse(sink.lines[0] ?? "{}");
    expect(parsed.err.name).toBe("Error");
    expect(parsed.err.message).toBe("boom");
    expect(typeof parsed.err.stack).toBe("string");
    expect(parsed.big).toBe("10");
  });

  test("tick 필드 — 공급자 설정 시에만 붙는다", () => {
    const sink = makeSink(levelRank("debug"));
    cleanups.push(registerSink(sink));
    const log = createLogger("sink-test");

    log.info({}, "no-tick");
    setTickProvider(() => 4711);
    log.info({}, "with-tick");
    setTickProvider(null);
    log.info({}, "no-tick-again");

    expect("tick" in (sink.records[0] ?? {})).toBe(false);
    expect(sink.records[1]?.["tick"]).toBe(4711);
    expect("tick" in (sink.records[2] ?? {})).toBe(false);
  });

  test("던지는 싱크는 격리되고 다른 싱크는 계속 받는다", () => {
    const bad: LogSink = {
      minLevel: levelRank("debug"),
      write() {
        throw new Error("sink down");
      },
    };
    const good = makeSink(levelRank("debug"));
    cleanups.push(registerSink(bad));
    cleanups.push(registerSink(good));

    const log = createLogger("sink-test");
    expect(() => {
      log.info({}, "one");
      log.info({}, "two");
    }).not.toThrow();
    expect(good.records.length).toBe(2);
  });

  test("싱크 오류의 stdout 보고는 싱크당 1회로 억제된다", () => {
    // 이 케이스만 stdout error 레벨 활성이 필요 — 지역적으로 올렸다 복원.
    process.env["LOG_LEVEL"] = "error";
    refreshLogLevel();
    cleanups.push(() => {
      process.env["LOG_LEVEL"] = "silent";
      refreshLogLevel();
    });
    const reported: string[] = [];
    cleanups.push(patchStdout("logger", reported));

    const bad: LogSink = {
      minLevel: levelRank("debug"),
      write() {
        throw new Error("sink down");
      },
    };
    cleanups.push(registerSink(bad));

    const log = createLogger("sink-test");
    log.error({}, "one");
    log.error({}, "two");
    log.error({}, "three");

    expect(reported.length).toBe(1);
    expect(reported[0]).toContain("sink write threw");
  });

  test("flushAllSinks/flushAllSinksSync — 훅 호출 + 실패 격리", async () => {
    let flushed = 0;
    let flushedSync = 0;
    const sink: LogSink = {
      minLevel: levelRank("debug"),
      write() {},
      flush: async () => {
        flushed++;
      },
      flushSync: () => {
        flushedSync++;
      },
    };
    const failing: LogSink = {
      minLevel: levelRank("debug"),
      write() {},
      flush: async () => {
        throw new Error("flush fail");
      },
      flushSync: () => {
        throw new Error("flushSync fail");
      },
    };
    cleanups.push(registerSink(sink));
    cleanups.push(registerSink(failing));

    await expect(flushAllSinks()).resolves.toBeUndefined();
    expect(() => flushAllSinksSync()).not.toThrow();
    expect(flushed).toBe(1);
    expect(flushedSync).toBe(1);
  });
});
