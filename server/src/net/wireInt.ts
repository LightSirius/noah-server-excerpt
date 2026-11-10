// 바이너리 i32 필드에 실을 정수의 송신 전 정규화(이진 전환 B4). 생성 코덱은 i32 밖 값을 WireEncodeError로 거부하므로, 계속 늘어나는 카운터는
// 값을 만드는 쪽이 i32 안으로 묶는다(데이터 상수는 로더 상한 — world/dataWireLimits.ts, 누적 재화·포인트는 포화 가산 — 각 누적 지점).
// 의존성은 런타임 상수(I32_MAX)뿐 — 핸들러·시뮬 공용.

import { I32_MAX } from "./wire/runtime";

/** i32 비음수 대역의 크기(2^31). */
const I32_SPAN = I32_MAX + 1;

/**
 * 존 tickIndex → i32 필드(ENTER_WORLD_OK·ZONE_CHANGE.tickIndex) — mod 2^31. 20 Hz로 무재시작 약 3.4년이면 tickIndex가 i32를 넘는다(그 전에는
 * 값 그대로). SNAPSHOT_DELTA.tickIndex(u32 — 빠른 경로 `>>> 0`)의 하위 31비트와 같고, 클라가 INPUT_CMD.tick(서버는 비음수 i32만 받는다)으로
 * 되돌려 보내도 유효하다.
 */
export function wireTickIndex(tickIndex: number): number {
  return tickIndex % I32_SPAN;
}

/** 비음수 누적값 + 증분을 i32 최대에서 포화 — SLP 총량처럼 i32 필드로 나가는 누적 카운터(SKILL_LV_UP.slpTotal·SKILL_LEARN_ACK.slpAfter). */
export function addSatI32(current: number, delta: number): number {
  return Math.min(I32_MAX, current + delta);
}
