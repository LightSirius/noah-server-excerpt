/**
 * JSONL 파일 싱크 테스트 — append/JSONL 유효성, rename 없는 로테이션, 보존 삭제,
 * flushSync, 부팅 이어쓰기, 실패 시 버퍼 상한 드롭, 연속 실패 비활성.
 *
 * env가 아닌 옵션 객체로 직접 생성(작은 임계) — 통합 경로(LOG_DIR)는 index.ts 전용이라
 * 테스트가 파일 핸들·타이머를 누수하지 않는다. 모든 싱크는 close()로 정리한다.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LogFileSink } from "../../server/src/obs/logFileSink";
import { levelRank } from "../../server/src/obs/logger";

const cleanups: Array<() => Promise<void> | void> = [];

function mkTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "mmorpg-logsink-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function mkSink(dir: string, opts: Partial<ConstructorParameters<typeof LogFileSink>[0]> = {}): LogFileSink {
  const sink = new LogFileSink({ dir, minLevel: levelRank("debug"), ...opts });
  cleanups.push(() => sink.close());
  return sink;
}

function writeLine(sink: LogFileSink, msg: string): string {
  const record = { t: Date.now(), level: "info", mod: "filesink-test", msg };
  const line = JSON.stringify(record) + "\n";
  sink.write(record, line);
  return line;
}

function files(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort();
}

function readAllLines(dir: string): string[] {
  return files(dir)
    .flatMap((f) => readFileSync(join(dir, f), "utf8").split("\n"))
    .filter((l) => l.length > 0);
}

afterEach(async () => {
  // 싱크 close를 디렉토리 삭제보다 먼저(역순 실행).
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

describe("LogFileSink", () => {
  test("append + flush → 유효 JSONL 단일 파일", async () => {
    const dir = mkTmpDir();
    const sink = mkSink(dir);
    const l1 = writeLine(sink, "one");
    const l2 = writeLine(sink, "two");
    await sink.flush();

    const fs = files(dir);
    expect(fs.length).toBe(1);
    const content = readFileSync(join(dir, fs[0] ?? ""), "utf8");
    expect(content).toBe(l1 + l2);
    for (const line of content.trimEnd().split("\n")) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  test("로테이션 — 임계 초과 시 새 파일로 스왑, 구 파일 무접촉", async () => {
    const dir = mkTmpDir();
    const sink = mkSink(dir, { maxFileBytes: 100 });
    const l1 = writeLine(sink, "a".repeat(30)); // ~90B
    await sink.flush();
    const l2 = writeLine(sink, "b".repeat(30));
    await sink.flush(); // 90+90 > 100 → 새 파일.

    const fs = files(dir);
    expect(fs.length).toBe(2);
    expect(readFileSync(join(dir, fs[0] ?? ""), "utf8")).toBe(l1); // 구 파일 그대로.
    expect(readFileSync(join(dir, fs[1] ?? ""), "utf8")).toBe(l2);
  });

  test("보존 — 로테이션 후 디스크 파일 수 ≤ maxFiles", async () => {
    const dir = mkTmpDir();
    const sink = mkSink(dir, { maxFileBytes: 10, maxFiles: 2 });
    for (let i = 0; i < 5; i++) {
      writeLine(sink, `n${i}`);
      await sink.flush(); // 매 flush 로테이션.
    }
    expect(files(dir).length).toBeLessThanOrEqual(2);
    // 최신 내용은 남아 있다.
    expect(readAllLines(dir).some((l) => l.includes("n4"))).toBe(true);
  });

  test("접두어 격리(4단계 PROC_NAME) — 같은 디렉토리의 다른 프로세스 파일은 보존 삭제·이어쓰기 대상이 아니다", async () => {
    const dir = mkTmpDir();
    // 접두어가 앞부분을 공유해도("gw1" vs "gw10") 구분자 "-"까지 일치해야 같은 프로세스 파일이다.
    const gw10 = mkSink(dir, { filePrefix: "gw10" });
    writeLine(gw10, "from-gw10");
    await gw10.flush();
    const world = mkSink(dir, { filePrefix: "world" });
    writeLine(world, "from-world");
    await world.flush();
    const gw1 = mkSink(dir, { filePrefix: "gw1", maxFileBytes: 10, maxFiles: 1 });
    for (let i = 0; i < 4; i++) {
      writeLine(gw1, `g${i}`);
      await gw1.flush(); // 매 flush 로테이션 + 보존 1개.
    }
    const all = files(dir);
    expect(all.filter((f) => f.startsWith("gw1-")).length).toBe(1);
    expect(all.filter((f) => f.startsWith("gw10-")).length).toBe(1);
    expect(all.filter((f) => f.startsWith("world-")).length).toBe(1);
    const lines = readAllLines(dir);
    expect(lines.some((l) => l.includes("from-gw10"))).toBe(true);
    expect(lines.some((l) => l.includes("from-world"))).toBe(true);
  });

  test("flushSync — 동기 드레인(크래시 경로)", () => {
    const dir = mkTmpDir();
    const sink = mkSink(dir);
    const l1 = writeLine(sink, "sync");
    sink.flushSync();
    const fs = files(dir);
    expect(fs.length).toBe(1);
    expect(readFileSync(join(dir, fs[0] ?? ""), "utf8")).toBe(l1);
  });

  test("부팅 이어쓰기 — 최신 파일이 임계 미만이면 재사용, 이상이면 새 파일", async () => {
    const dir = mkTmpDir();
    const s1 = mkSink(dir, { maxFileBytes: 10_000 });
    const l1 = writeLine(s1, "first-boot");
    await s1.close();

    const s2 = mkSink(dir, { maxFileBytes: 10_000 });
    const l2 = writeLine(s2, "second-boot");
    await s2.flush();
    expect(files(dir).length).toBe(1); // 같은 파일에 이어 씀 — --watch 재시작 파일 증식 방지.
    expect(readFileSync(join(dir, files(dir)[0] ?? ""), "utf8")).toBe(l1 + l2);

    const s3 = mkSink(dir, { maxFileBytes: 50 }); // 기존 파일이 이미 임계 이상.
    writeLine(s3, "third-boot");
    await s3.flush();
    expect(files(dir).length).toBe(2);
  });

  test("append 실패 시 버퍼 유지 + 상한 초과분 오래된 것부터 드롭", async () => {
    const dir = mkTmpDir();
    const sink = mkSink(dir, { maxPendingBytes: 160 }); // 라인 ~75B → 2줄 상한.
    rmSync(dir, { recursive: true, force: true }); // append 실패 유도(디렉토리 소실).

    writeLine(sink, "m0");
    await sink.flush(); // 실패 — 버퍼 보존.
    writeLine(sink, "m1");
    writeLine(sink, "m2");
    writeLine(sink, "m3"); // 상한 초과 — m0부터 드롭.

    mkdirSync(dir, { recursive: true }); // 복구.
    await sink.flush();
    const lines = readAllLines(dir).join("\n");
    expect(lines).not.toContain("m0");
    expect(lines).toContain("m3");
  });

  test("연속 실패 누적 시 싱크 비활성 — 이후 write 무시", async () => {
    const dir = mkTmpDir();
    const sink = mkSink(dir);
    rmSync(dir, { recursive: true, force: true });

    writeLine(sink, "doomed");
    for (let i = 0; i < 10; i++) await sink.flush(); // 연속 실패 10회 → disable.

    mkdirSync(dir, { recursive: true }); // 복구해도 이미 비활성.
    writeLine(sink, "ignored");
    await sink.flush();
    expect(files(dir).length).toBe(0);
  });
});
