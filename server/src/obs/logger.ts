// Phase A — 구조화 JSON 로거. (+ 로깅 시스템: 싱크 계층 — architecture.md §9)
//
// architecture.md §9.1: pino 호환 모양의 JSON 라인 로거. 의존 0 — 본 파일은 임포트 0을 유지하고,
// 싱크 구성(파일/링버퍼)은 env를 이미 아는 곳(obs/processBoot.ts, adminHttp.ts)에서 registerSink로 주입한다.
// 시뮬·핸들러 코드 안에서 `console.*` 호출 금지(이 파일과 obs/* 자체만 예외).
//
// 사용 예:
//   const log = createLogger("tcp");
//   log.info({ connId: 42, addr: "127.0.0.1" }, "Client connected");
//   log.error({ err }, "handler crashed");
//
// 출력 예 (1 레코드 1 줄, 개행 구분 — stdout과 모든 싱크가 동일 바이트):
//   {"t":1746392800123,"level":"info","mod":"tcp","msg":"Client connected","connId":42,"addr":"127.0.0.1"}
//
// 환경:
//   LOG_LEVEL=silent|debug|info|warn|error  (기본 info)
//   테스트는 process.env.LOG_LEVEL = "silent"로 stdout 오염 방지.
//   LOG_LEVEL만 env.ts를 경유하지 않고 직접 읽는다(문서화된 예외) — obs.test.ts가 런타임에
//   값을 바꾸고 refreshLogLevel()을 호출하는데 env.ts는 일회 파싱이라 충돌. 신규 LOG_* env는
//   전부 env.ts 경유(싱크 생성자가 값을 받는다).
//
// 싱크 계약:
//   - stdout은 등록 싱크가 아닌 내장 경로다. activeLevel로 게이트하고 호출 시점에
//     process.stdout.write를 조회한다(obs.test.ts의 몽키패치 계약 유지).
//   - sink.write는 throw/block 금지 — tick 콜백의 cork 윈도 안에서 호출된다. 버퍼에 쌓기만 하고
//     I/O는 flush에서 하라. 어겨도 로거가 격리한다(최초 1회만 에러 보고 후 억제).

export type LogLevelName = "debug" | "info" | "warn" | "error";

type Level = LogLevelName;

const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SILENT_RANK = 99;

/** 외부 입력(env·쿼리 파라미터) 레벨 문자열 검증 — own property만(`in`은 프로토타입 체인을 걷는다). */
export function isLogLevelName(v: string): v is LogLevelName {
  return Object.hasOwn(LEVEL_RANK, v);
}

function readLevel(): number {
  const raw = (process.env["LOG_LEVEL"] ?? "info").toLowerCase();
  if (raw === "silent") return SILENT_RANK;
  if (Object.hasOwn(LEVEL_RANK, raw)) return LEVEL_RANK[raw as Level];
  return LEVEL_RANK.info;
}

let activeLevel = readLevel();

/** 테스트가 로그 레벨을 끄거나 복원할 때 사용. */
export function refreshLogLevel(): void {
  activeLevel = readLevel();
}

/** "warn" 같은 레벨 문자열 → 내부 랭크. 싱크 생성부(env 값 → minLevel)·쿼리 필터용. */
export function levelRank(level: LogLevelName): number {
  return LEVEL_RANK[level];
}

export interface Logger {
  debug(meta: Record<string, unknown>, msg: string): void;
  info(meta: Record<string, unknown>, msg: string): void;
  warn(meta: Record<string, unknown>, msg: string): void;
  error(meta: Record<string, unknown>, msg: string): void;
  /** 자식 로거: 기본 meta 자동 첨부 (예: connId 고정). */
  child(meta: Record<string, unknown>): Logger;
}

/** 추가 출력 대상(파일·링버퍼 등). stdout과 별개로 자체 minLevel로 필터링된다. */
export interface LogSink {
  /** LEVEL_RANK 값 — 이 랭크 미만 레코드는 write가 호출되지 않는다. */
  minLevel: number;
  /**
   * line은 stringify(record) + "\n" — stdout과 동일 바이트. throw/block 금지.
   * record는 레닥션 전 원본 참조(필터링용 필드 조회 전용) — 영속·외부 노출은 반드시
   * 레닥션이 적용된 line을 사용하라.
   */
  write(record: Record<string, unknown>, line: string): void;
  flush?(): Promise<void>;
  /** 크래시 경로 전용 동기 드레인. */
  flushSync?(): void;
  close?(): Promise<void>;
}

const sinks: LogSink[] = [];
let sinkFloor = SILENT_RANK; // 등록 싱크 중 최소 minLevel(없으면 무효과 랭크).
const erroredSinks = new WeakSet<LogSink>();

function recomputeSinkFloor(): void {
  sinkFloor = sinks.length === 0 ? SILENT_RANK : Math.min(...sinks.map((s) => s.minLevel));
}

/** 싱크 등록. 반환된 함수로 해제한다(테스트 정리·싱크 교체). */
export function registerSink(sink: LogSink): () => void {
  sinks.push(sink);
  recomputeSinkFloor();
  return () => {
    const i = sinks.indexOf(sink);
    if (i >= 0) sinks.splice(i, 1);
    recomputeSinkFloor();
  };
}

/** 우아한 종료 경로 — 모든 싱크의 비동기 flush를 병렬 대기. 실패는 격리(종료 중 전파 불가). */
export async function flushAllSinks(): Promise<void> {
  await Promise.all(
    sinks.map(async (sink) => {
      try {
        await sink.flush?.();
      } catch (err) {
        reportSinkError(sink, err, "sink flush failed");
      }
    }),
  );
}

/** 크래시 경로 — process.exit 직전 동기 드레인. */
export function flushAllSinksSync(): void {
  for (const sink of sinks) {
    try {
      sink.flushSync?.();
    } catch (err) {
      reportSinkError(sink, err, "sink flushSync failed");
    }
  }
}

let tickProvider: (() => number) | null = null;

/** tick 필드 공급자(§9.1) — tick 루프 시작 시 배선, 테스트 종료 시 null로 해제. */
export function setTickProvider(fn: (() => number) | null): void {
  tickProvider = fn;
}

let procTag: string | null = null;

/**
 * 프로세스 태그(성능 4단계 게이트웨이 분리) — 설정하면 모든 레코드에 `proc` 필드(msg·tick 바로 뒤)가 붙는다.
 * obs/processBoot가 ROLE이 monolith가 아닐 때 PROC_NAME으로 1회 설정. null(기본) = 미부착 — monolith 레코드 바이트 불변.
 */
export function setProcTag(tag: string | null): void {
  procTag = tag;
}

/** 구조 필드 + meta. 키 순서: t, level, mod, msg, [tick], [proc], baseMeta, meta. */
function newRecord(
  t: number,
  level: Level,
  mod: string,
  msg: string,
  tick: number | undefined,
  baseMeta: Record<string, unknown>,
  meta: Record<string, unknown>,
): Record<string, unknown> {
  if (procTag === null) {
    return tick === undefined
      ? { t, level, mod, msg, ...baseMeta, ...meta }
      : { t, level, mod, msg, tick, ...baseMeta, ...meta };
  }
  return tick === undefined
    ? { t, level, mod, msg, proc: procTag, ...baseMeta, ...meta }
    : { t, level, mod, msg, tick, proc: procTag, ...baseMeta, ...meta };
}

function emit(
  level: Level,
  mod: string,
  baseMeta: Record<string, unknown>,
  meta: Record<string, unknown>,
  msg: string,
): void {
  const rank = LEVEL_RANK[level];
  if (rank < activeLevel && rank < sinkFloor) return;
  // obs는 sim/* 외부 — 결정론 게이트와 무관.
  const t = Date.now();
  const tick = tickProvider === null ? undefined : tickProvider();
  const record = newRecord(t, level, mod, msg, tick, baseMeta, meta);
  // meta의 동명 키가 구조 필드를 섀도잉하지 못하게 재확정 — 링 인덱싱·필터가 이 값을 신뢰한다.
  // (재대입은 JSON 키 순서를 바꾸지 않는다 — 최초 삽입 순서 유지.)
  record["t"] = t;
  record["level"] = level;
  record["mod"] = mod;
  record["msg"] = msg;
  if (tick !== undefined) record["tick"] = tick;
  if (procTag !== null) record["proc"] = procTag;
  const line = stringify(record) + "\n";
  if (rank >= activeLevel) process.stdout.write(line);
  for (const sink of sinks) {
    if (rank < sink.minLevel) continue;
    try {
      sink.write(record, line);
    } catch (err) {
      reportSinkError(sink, err, "sink write threw — further errors from this sink suppressed");
    }
  }
}

// 싱크 오류는 싱크당 최초 1회만 stdout에 보고(폭주 방지). 싱크로는 절대 재귀하지 않는다.
function reportSinkError(sink: LogSink, err: unknown, msg: string): void {
  if (erroredSinks.has(sink)) return;
  erroredSinks.add(sink);
  if (LEVEL_RANK.error < activeLevel) return;
  process.stdout.write(stringify({ t: Date.now(), level: "error", mod: "logger", msg, err }) + "\n");
}

// 평문 TCP 환경(architecture.md §10.1) — 자격증명·토큰 유출을 호출부 규율이 아닌 직렬화기
// 레벨에서 차단한다. 중첩 키에도 적용. username은 의도적 비레닥션(브루트포스 포렌식용,
// /admin/logs 토큰 게이트로 완화). rollkey·roll_key는 생활 롤 비밀 키다.
const REDACT_KEYS = new Set([
  "password", "passwd", "pass", "pw", "passwordhash",
  "secret", "token", "sessiontoken", "accesstoken", "refreshtoken",
  "apikey", "api_key", "sessionkey", "privatekey", "rollkey", "roll_key",
  "credential", "credentials", "authorization", "auth", "cookie", "bearer",
]);

// 키 레닥션의 보완 — err.message/stack 같은 자유 문자열에 박힌 자격증명 값 스크럽.
// (`throw new Error(`bad token ${t}`)` 한 줄이 영속 파일에 남는 경로를 막는다.)
const SECRET_VALUE_RE =
  /((?:bearer\s+)|(?:(?:password|passwd|secret|token|apikey|api_key|sessionkey)\s*[=:]\s*))\S+/gi;

function scrubText(s: string | undefined): string | undefined {
  return s?.replace(SECRET_VALUE_RE, "$1[REDACTED]");
}

// JSON.stringify의 Error 처리는 빈객체이므로 stack/message만 평면화.
function stringify(record: Record<string, unknown>): string {
  return JSON.stringify(record, (key, value) => {
    if (REDACT_KEYS.has(key.toLowerCase())) return "[REDACTED]";
    if (value instanceof Error) {
      return { name: value.name, message: scrubText(value.message), stack: scrubText(value.stack) };
    }
    if (typeof value === "bigint") return value.toString();
    return value;
  });
}

export function createLogger(mod: string, baseMeta: Record<string, unknown> = {}): Logger {
  return {
    debug: (meta, msg) => emit("debug", mod, baseMeta, meta, msg),
    info: (meta, msg) => emit("info", mod, baseMeta, meta, msg),
    warn: (meta, msg) => emit("warn", mod, baseMeta, meta, msg),
    error: (meta, msg) => emit("error", mod, baseMeta, meta, msg),
    child: (childMeta) => createLogger(mod, { ...baseMeta, ...childMeta }),
  };
}
