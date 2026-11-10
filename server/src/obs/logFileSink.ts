// JSONL 파일 싱크 — architecture.md §9.2. Windows-safe 설계 3원칙:
//
// 1. 핸들 미보유: 플러시마다 appendFile(open-write-close). Windows 파일락은 강제라
//    핸들을 쥐고 있으면 `bun run --watch` 재시작 중첩·외부 테일러(Vector 등)와 충돌한다.
// 2. rename 없음: 로테이션은 currentPath를 새 타임스탬프 파일로 스왑할 뿐 구 파일 무접촉
//    (열린 핸들이 있어도 안전, 테일러는 구 파일을 자연 완주).
// 3. write()는 배열 push뿐: tick 콜백의 cork 윈도 안에서 호출되므로 I/O는 전부
//    unref 타이머/임계 초과가 트리거하는 flush로 미룬다.
//
// 실패 정책: append 실패 시 라인을 버퍼에 되돌리고(최대 maxPendingBytes, 초과분은
// 오래된 것부터 드롭 + mmorpg_log_dropped_lines_total), 연속 MAX_CONSECUTIVE_FAILURES회
// 실패하면 싱크를 비활성화한다. 진단은 구조화 로거로 남긴다(자기 버퍼로의 재귀는
// push 1건뿐 — 루프 없음, 비활성 후엔 write가 무시).

import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { createLogger, type LogSink } from "./logger";
import { metrics } from "./metrics";

const log = createLogger("logFile");

const MAX_CONSECUTIVE_FAILURES = 10;

export interface LogFileSinkOptions {
  /** 절대경로 — 호출부가 REPO_ROOT 기준으로 해석해 넘긴다(process.cwd() 금지). */
  dir: string;
  /** levelRank 값. */
  minLevel: number;
  /** 로테이션 임계 바이트. 기본 20MB. */
  maxFileBytes?: number;
  /** 보존 파일 개수 — 초과분 오래된 것부터 삭제. 기본 10. */
  maxFiles?: number;
  /** 주기 플러시 간격. 기본 1000ms. */
  flushIntervalMs?: number;
  /** 이 바이트 이상 쌓이면 즉시 플러시 예약. 기본 64KB. */
  flushThresholdBytes?: number;
  /** 플러시 실패 중 버퍼 상한 — 초과분 드롭. 기본 4MB. */
  maxPendingBytes?: number;
  /**
   * 파일명 접두어. 기본 "server" → server-YYYYMMDD-HHmmss-NNNN.jsonl. obs/processBoot는 env PROC_NAME(resolveProcName — monolith
   * 기본 "server")을 넘긴다. 보존 삭제·부팅 이어쓰기는 `<접두어>-`로 시작하는 파일만 보므로, 같은 디렉토리를 쓰는
   * 프로세스(4단계 게이트웨이·월드)는 접두어가 달라야 하고 접두어에 "-"가 없어야 한다(env 스키마가 강제).
   */
  filePrefix?: string;
}

export class LogFileSink implements LogSink {
  readonly minLevel: number;
  private readonly _dir: string;
  private readonly _maxFileBytes: number;
  private readonly _maxFiles: number;
  private readonly _flushThresholdBytes: number;
  private readonly _maxPendingBytes: number;
  private readonly _prefix: string;
  private readonly _timer: ReturnType<typeof setInterval> | null;
  private _buffer: string[] = [];
  /** doFlush가 appendFile을 await하는 동안의 청크 — 크래시 동기 드레인이 이걸 놓치면 소실. */
  private _inFlight: string[] = [];
  private _bufferedBytes = 0;
  private _currentPath = "";
  private _currentFileBytes = 0;
  private _chain: Promise<void> = Promise.resolve();
  private _failures = 0;
  private _disabled = false;

  constructor(opts: LogFileSinkOptions) {
    this.minLevel = opts.minLevel;
    this._dir = opts.dir;
    this._maxFileBytes = opts.maxFileBytes ?? 20 * 1024 * 1024;
    this._maxFiles = opts.maxFiles ?? 10;
    this._flushThresholdBytes = opts.flushThresholdBytes ?? 64 * 1024;
    this._maxPendingBytes = opts.maxPendingBytes ?? 4 * 1024 * 1024;
    this._prefix = opts.filePrefix ?? "server";
    try {
      mkdirSync(this._dir, { recursive: true });
      this.pickInitialFile();
    } catch (err) {
      this._disabled = true;
      log.error({ err, dir: this._dir }, "log dir create failed — file sink disabled");
    }
    this._timer = this._disabled
      ? null
      : setInterval(() => void this.flush(), opts.flushIntervalMs ?? 1000);
    this._timer?.unref(); // 테스트/종료 시 프로세스를 붙잡지 않는다.
  }

  write(_record: Record<string, unknown>, line: string): void {
    if (this._disabled) return;
    this._buffer.push(line);
    this._bufferedBytes += Buffer.byteLength(line, "utf8");
    this.enforcePendingCap();
    if (this._bufferedBytes >= this._flushThresholdBytes) void this.flush();
  }

  /** 대기 중인 라인을 비동기 append. 호출 순서대로 직렬화(프로미스 체인). */
  flush(): Promise<void> {
    this._chain = this._chain.then(() => this.doFlush());
    return this._chain;
  }

  /**
   * 크래시/종료 경로 전용 동기 드레인 — in-flight(비동기 append 진행 중일 수 있음)까지 포함.
   * append가 사실 성공한 뒤 크래시했다면 중복 라인이 남을 수 있다 — JSONL 소비자에게
   * 중복 제거는 쉽고 소실 복구는 불가능하므로 중복을 감수한다.
   */
  flushSync(): void {
    if (this._disabled) return;
    const chunk = this._inFlight.join("") + this._buffer.splice(0).join("");
    this._bufferedBytes = 0;
    if (chunk.length === 0) return;
    try {
      appendFileSync(this._currentPath, chunk, "utf8");
    } catch (err) {
      log.error({ err }, "log flushSync failed — crash-path lines lost");
    }
  }

  async close(): Promise<void> {
    if (this._timer !== null) clearInterval(this._timer);
    await this.flush();
  }

  private async doFlush(): Promise<void> {
    if (this._disabled || this._buffer.length === 0) return;
    const lines = this._buffer;
    const bytes = this._bufferedBytes;
    this._buffer = [];
    this._bufferedBytes = 0;
    this._inFlight = lines;
    try {
      const rotated = this.maybeRotate(bytes);
      await appendFile(this._currentPath, lines.join(""), "utf8");
      this._inFlight = [];
      this._currentFileBytes += bytes;
      this._failures = 0;
      // 새 파일이 실재한 뒤 보존 적용 — 디스크 파일 수 ≤ maxFiles 불변식.
      if (rotated) this.applyRetention();
    } catch (err) {
      // 실패 — 라인을 선두로 되돌리고 상한 적용. 연속 실패가 쌓이면 비활성.
      this._inFlight = [];
      this._buffer = lines.concat(this._buffer);
      this._bufferedBytes += bytes;
      this.enforcePendingCap();
      this._failures++;
      if (this._failures === 1) log.error({ err, path: this._currentPath }, "log append failed — buffering");
      if (this._failures >= MAX_CONSECUTIVE_FAILURES) this.disable(err);
    }
  }

  private maybeRotate(incomingBytes: number): boolean {
    if (this._currentFileBytes + incomingBytes <= this._maxFileBytes) return false;
    this._currentPath = this.newFilePath();
    this._currentFileBytes = 0;
    return true;
  }

  // 부팅 시 기존 최신 파일이 임계 미만이면 이어 쓴다 — --watch 재시작마다 파일이 늘어나는 것 방지.
  // 한계(수용): --watch 재시작 중첩으로 두 프로세스가 같은 파일에 append하는 짧은 창에서는
  // 로테이션 판단(_currentFileBytes)이 프로세스별이라 파일이 임계의 최대 2배까지 자랄 수 있다.
  private pickInitialFile(): void {
    const latest = this.listFiles().at(-1);
    if (latest !== undefined) {
      const full = join(this._dir, latest);
      try {
        const size = statSync(full).size;
        if (size < this._maxFileBytes) {
          this._currentPath = full;
          this._currentFileBytes = size;
          return;
        }
      } catch {
        // stat 실패 — 새 파일로.
      }
    }
    this._currentPath = this.newFilePath();
    this._currentFileBytes = 0;
  }

  // 파일명: <prefix>-YYYYMMDD-HHmmss-NNN.jsonl. NNN은 고정폭 시퀀스로 같은 초 안의
  // 로테이션에도 사전순=생성순 불변식을 지킨다(보존 삭제·부팅 이어쓰기가 정렬에 의존).
  // 시퀀스는 현존 마지막 파일에서 이어간다 — 보존 삭제로 생긴 번호 공백을 재사용하면
  // 새 파일이 사전순 뒤로 가지 않아 최신 파일이 "가장 오래된 것"으로 오인 삭제된다.
  // (한계: 시계 역행 시 새 stamp가 앞설 수 있음 — 보존이 조기 삭제할 뿐 데이터 오염은 없음.)
  private newFilePath(): string {
    const d = new Date();
    const p2 = (n: number) => String(n).padStart(2, "0");
    const stamp =
      `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}` +
      `-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    const base = `${this._prefix}-${stamp}-`;
    const last = this.listFiles().at(-1);
    let seq = 1;
    if (last?.startsWith(base)) {
      const parsed = Number.parseInt(last.slice(base.length), 10);
      if (Number.isFinite(parsed)) seq = parsed + 1;
    }
    for (let n = seq; ; n++) {
      // 4자리 패딩 — 같은 초 내 로테이션 1만 회까지 사전순 불변식 유지(3자리는 1000에서 붕괴).
      const path = join(this._dir, `${base}${String(n).padStart(4, "0")}.jsonl`);
      if (!existsSync(path)) return path;
    }
  }

  private applyRetention(): void {
    const files = this.listFiles();
    const excess = files.length - this._maxFiles;
    for (let i = 0; i < excess; i++) {
      const target = files[i];
      if (target === undefined) break;
      try {
        unlinkSync(join(this._dir, target));
      } catch {
        // 잔존 프로세스가 쥔 파일(Windows 락) — 다음 로테이션에 재시도.
      }
    }
  }

  // 타임스탬프 파일명은 사전순 = 시간순.
  private listFiles(): string[] {
    try {
      return readdirSync(this._dir)
        .filter((f) => f.startsWith(`${this._prefix}-`) && f.endsWith(".jsonl"))
        .sort();
    } catch {
      return [];
    }
  }

  private enforcePendingCap(): void {
    let dropped = 0;
    while (this._bufferedBytes > this._maxPendingBytes && this._buffer.length > 0) {
      const oldest = this._buffer.shift();
      if (oldest === undefined) break;
      this._bufferedBytes -= Buffer.byteLength(oldest, "utf8");
      dropped++;
    }
    if (dropped > 0) metrics.logDroppedLines.inc(undefined, dropped);
  }

  private disable(err: unknown): void {
    this._disabled = true;
    if (this._timer !== null) clearInterval(this._timer);
    metrics.logDroppedLines.inc(undefined, this._buffer.length);
    this._buffer = [];
    this._bufferedBytes = 0;
    log.error(
      { err, failures: this._failures, dir: this._dir },
      "log file sink disabled after repeated append failures",
    );
  }
}
