// 프로세스 incarnation — 성능 4단계 4.2c. 게이트웨이(HELLO)·월드(HELLO_ACK)가 기동마다 새로 고르는 u32. 순서가 아니라 동일성만
// 비교한다(월드의 게이트웨이 펜싱 — worldIpcServer.ts, 게이트웨이가 새 월드를 알아봄). 시뮬 밖(cluster/)이라 결정론 규칙 무관.

/** 무작위 u32(0 제외 — 0은 "미설정"처럼 읽혀 로그 진단을 헷갈리게 한다). */
export function newIncarnation(): number {
  const v = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  return v === 0 ? 1 : v;
}
