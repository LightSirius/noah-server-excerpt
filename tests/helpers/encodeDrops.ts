// 시험 전역 송신 인코드 드롭 감시(이진 전환 B4 리뷰).
//
// 송신 방어층(server/src/network/encodeGuard.ts)은 WireEncodeError·프레임 body u16 초과를 그 패킷만 버리는 것으로 바꾼다. 운영에선 존 tick을
// 지키지만, 시험에선 잘못된 페이로드(필드 누락·범위 밖 값)를 보낸 시험이 예외 없이 녹색으로 끝난다(LOG_LEVEL silent라 warn도 안 보이고,
// 라우터·tickAll의 catch를 거치지 않아도 흔적은 메트릭뿐이다). 그래서 tests/preload.ts가 모든 시험 앞뒤로 mmorpg_net_encode_error_total 합을
// 비교해 늘었으면 그 시험을 실패시킨다. 일부러 드롭을 만드는 시험(방어층 시험)만 allowEncodeDrops()로 그 시험 하나를 면제한다.
// 한계: 이 시험 프로세스 안의 송신만 본다(멀티 프로세스 클러스터 시험의 자식 프로세스는 밖), 시험 밖(beforeAll·afterAll·모듈 최상위)의
// 드롭은 세지 않는다.

import { afterEach, beforeEach } from "bun:test";
import { metrics } from "../../server/src/obs/metrics";

// 면제 플래그는 globalThis에 둔다 — 시험 파일과 preload가 이 모듈을 다른 인스턴스로 받아도 같은 플래그를 본다.
const ALLOW = Symbol.for("mmorpg.test.allowEncodeDrops");
const flags = globalThis as { [ALLOW]?: boolean };

/** 지금 도는 시험의 송신 인코드 드롭을 허용한다(방어층 시험 전용 — 드롭 수는 그 시험이 직접 단언한다). 시험이 끝나면 풀린다. */
export function allowEncodeDrops(): void {
  flags[ALLOW] = true;
}

/** tests/preload.ts 전용 — 전역 beforeEach/afterEach 등록. */
export function installEncodeDropGuard(): void {
  let start = 0;
  beforeEach(() => {
    start = metrics.netEncodeError.total();
  });
  afterEach(() => {
    const allowed = flags[ALLOW] === true;
    flags[ALLOW] = false;
    const dropped = metrics.netEncodeError.total() - start;
    if (dropped === 0 || allowed) return;
    throw new Error(
      `${dropped} outbound packet(s) dropped by the encode guard during this test — a payload is out of wire bounds or missing a field ` +
        "(network/encodeGuard.ts). Fix the payload, or call allowEncodeDrops() if the drop is the point of the test.\n" +
        metrics.netEncodeError.expose(),
    );
  });
}
