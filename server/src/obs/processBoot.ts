// 프로세스 관측 부팅 — 성능 4단계 4.2c. index.ts가 역할 모듈(worldMain·gateway/gatewayMain)을 동적 import하기 "전에" 1회 적용한다
// (부팅 로그·모듈 평가 중 로그부터 담기도록). 역할 모듈도 같은 함수를 부른다(idempotent — 단독 진입·테스트 안전).
//   - proc 태그: monolith는 붙이지 않는다(레코드 바이트 불변), world·gateway는 PROC_NAME(resolveProcName).
//   - 파일 싱크(opt-in LOG_DIR): 접두어 = PROC_NAME — 같은 LOG_DIR의 월드·게이트웨이가 서로의 파일을 지우거나 이어 쓰지 않게.
//   - 크래시 핸들러: JSON 로그 + 싱크 드레인 후 종료(crashHandlers.ts) — 부팅 실패부터 커버하도록 최우선.
//   - procName 지정(4.3a): 역할 프로세스가 아닌 도구(슈퍼바이저 cluster/launch.ts — "launch")가 자기 이름으로 태그·접두어를 쓴다.
// 로거 import 부수효과로 설치하지 않는 이유는 crashHandlers.ts 상단(bun test in-process 서버 누수 금지).

import { type Env, resolveProcName } from "../config/env";
import { logsPath } from "../config/paths";
import { installCrashHandlers } from "./crashHandlers";
import { LogFileSink, type LogFileSinkOptions } from "./logFileSink";
import { levelRank, registerSink, setProcTag } from "./logger";

export interface ProcessObsPlan {
  /** 로그 레코드 proc 필드 — null = 미부착(monolith). */
  readonly procTag: string | null;
  /** 파일 싱크 옵션 — null = LOG_DIR 미설정. */
  readonly fileSink: LogFileSinkOptions | null;
}

/** env → 적용할 관측 설정(부수효과 없음). procName = 역할과 무관한 고정 이름(도구 프로세스). */
export function processObsPlan(e: Env, procName?: string): ProcessObsPlan {
  const name = procName ?? resolveProcName(e);
  return {
    procTag: procName === undefined && e.ROLE === "monolith" ? null : name,
    fileSink:
      e.LOG_DIR === undefined
        ? null
        : {
            dir: logsPath(e.LOG_DIR),
            minLevel: levelRank(e.LOG_FILE_LEVEL),
            maxFileBytes: e.LOG_FILE_MAX_MB * 1024 * 1024,
            maxFiles: e.LOG_FILE_MAX_FILES,
            filePrefix: name,
          },
  };
}

let booted = false;

/** 계획 적용(프로세스당 1회 — 두 번째 호출은 무동작). */
export function bootProcessObs(e: Env, procName?: string): void {
  if (booted) return;
  booted = true;
  const plan = processObsPlan(e, procName);
  if (plan.procTag !== null) setProcTag(plan.procTag);
  if (plan.fileSink !== null) registerSink(new LogFileSink(plan.fileSink));
  installCrashHandlers();
}
