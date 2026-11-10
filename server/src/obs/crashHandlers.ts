// 프로세스 레벨 크래시 핸들러 — 마지막 숨결도 구조화 JSON으로.
//
// 미설치 시 uncaughtException은 비-JSON 스택으로 stderr에 죽어 파일 싱크·수집기 어디에도
// 남지 않는다. 여기서 JSON error 로그 → 동기 싱크 드레인 → exit(1) 순으로 정리한다.
//
// 정책:
// - uncaughtException: 즉시 종료(crash-only). 권위 상태 프로세스가 미지의 상태로 계속 돌면
//   저장 데이터가 오염된다 — 재시작이 항상 더 싸다.
// - unhandledRejection: 로그+카운터만, 종료하지 않는다. 코드베이스에 fire-and-forget promise가
//   다수라(전투 outcome 영속·disconnect flush 등) 즉시 종료는 과잉 대응 — 대신 메트릭으로
//   추세를 감시한다. 트레이드오프: 조용한 상태 오염 가능성은 남는다.
//
// 설치는 부팅 경로(obs/processBoot — index.ts·역할 진입점)에서만 호출한다 — 로거 import 부수효과로 설치하면 bun test의
// in-process e2e 서버들이 프로세스 핸들러를 누적·간섭한다(테스트 누수 금지 계약).

import { createLogger, flushAllSinksSync } from "./logger";
import { metrics } from "./metrics";

const log = createLogger("crash");

/** uncaughtException 본체 — exitFn 주입으로 테스트 가능. */
export function onUncaughtException(
  err: unknown,
  exitFn: (code: number) => void = (c) => process.exit(c),
): void {
  log.error({ err }, "uncaughtException — exiting (crash-only policy)");
  flushAllSinksSync();
  exitFn(1);
}

/** unhandledRejection 본체 — 종료 없음, 관측만. */
export function onUnhandledRejection(reason: unknown): void {
  metrics.unhandledRejection.inc();
  log.error({ err: reason }, "unhandledRejection — process kept alive");
}

let installed = false;
let uninstallFn: () => void = () => {};

/** 프로세스 핸들러 설치(멱등 — 중복 호출도 동일한 해제 함수를 받는다). 해제는 테스트 정리 전용. */
export function installCrashHandlers(): () => void {
  if (installed) return uninstallFn;
  installed = true;
  const onUncaught = (err: unknown) => onUncaughtException(err);
  const onRejection = (reason: unknown) => onUnhandledRejection(reason);
  process.on("uncaughtException", onUncaught);
  process.on("unhandledRejection", onRejection);
  uninstallFn = () => {
    process.removeListener("uncaughtException", onUncaught);
    process.removeListener("unhandledRejection", onRejection);
    installed = false;
  };
  return uninstallFn;
}
