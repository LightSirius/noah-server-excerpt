// bun test 전역 preload — 테스트 출력의 JSON 로그 오염 차단 + 송신 인코드 드롭 감시.
//
// `??=`인 이유: `LOG_LEVEL=debug bun test` 같은 명시 지정 디버깅 실행을 덮지 않는다.
// 로거는 import 시점에 env를 읽으므로(preload ≺ 테스트 파일 import) refreshLogLevel 불필요.
// 링/파일 싱크의 minLevel은 LOG_LEVEL(stdout)과 독립 — 싱크 검증 테스트는 영향받지 않는다.
// obs.test.ts 등 개별 테스트의 저장/복원 패턴과도 안전 — 기본값만 제공할 뿐이다.
process.env["LOG_LEVEL"] ??= "silent";

// 송신 방어층이 삼킨 인코드 실패를 시험 실패로(tests/helpers/encodeDrops.ts — 이진 전환 B4 리뷰). 정적 import는 위 env 대입보다 먼저
// 평가되므로 동적 import로 순서를 지킨다(최상위 await — 아래 `export {}`가 이 파일을 모듈로 만든다).
const { installEncodeDropGuard } = await import("./helpers/encodeDrops");
installEncodeDropGuard();

export {};
