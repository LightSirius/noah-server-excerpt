// 패킷 경계 숫자 검증 유틸.
//
// codegen 타입가드(is*Payload)는 `typeof === "number"`만 확인하므로 Infinity·음수·
// 2^32 초과·비정수가 통과한다. 와이어에서 u32로 인코딩되거나 시뮬 상태에 들어가는
// 숫자 필드는 핸들러가 본 유틸로 재검증한다 (검증 실패 = 프로토콜 위반 → drop).

/** number가 u32 와이어 인코딩(writeUInt32LE) 범위의 정수인지. */
export function isUint32(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 0xffff_ffff;
}

/** number가 [lo, hi] 범위의 정수인지. */
export function isIntInRange(n: number, lo: number, hi: number): boolean {
  return Number.isInteger(n) && n >= lo && n <= hi;
}
