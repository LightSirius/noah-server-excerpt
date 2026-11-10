// 와이어 위반 warn 스쿼시 — 엣지(clientEdge: size·rate)와 본문 디코드(frameIngest: 디코드 실패 `wire:`·strike KICK `dkick:`·디코더 예외
// `threw:`)가 같은 예산을 쓴다. 디코드 실패는 strike 상한까지 무킥이고 재접속으로 반복할 수 있어 로그 증폭 캡이 필요하다. 키는 원격
// 주소(재접속 처닝에도 카운트 유지) + 전역 20/s. 메트릭은 항상 센다. (성능 4단계 4.1에서 tcpServer로부터 분리 — 예산·키는 종전과 같다.)

import { createSquelch } from "../obs/logSquelch";

export const wireWarnSquelch = createSquelch({
  ratePerSec: 1,
  burst: 3,
  globalRatePerSec: 20,
  globalBurst: 40,
});
