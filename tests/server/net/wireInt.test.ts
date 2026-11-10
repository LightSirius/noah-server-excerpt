// 이진 전환 B4 — i32 필드 상류 정규화(server/src/net/wireInt.ts). 존 메타 부팅 검증(ZoneRegistry)은 tests/server/zoneRegistryWire.test.ts.

import { describe, expect, test } from "bun:test";
import { addSatI32, wireTickIndex } from "../../../server/src/net/wireInt";
import { I32_MAX } from "../../../server/src/net/wire/runtime";

describe("wireTickIndex — 존 tickIndex mod 2^31", () => {
  test("i32 안은 값 그대로, 넘으면 하위 31비트(SNAPSHOT_DELTA u32 tickIndex의 하위 31비트와 같다)", () => {
    expect([0, 1, I32_MAX].map(wireTickIndex)).toEqual([0, 1, I32_MAX]);
    expect(wireTickIndex(I32_MAX + 1)).toBe(0);
    expect(wireTickIndex(2 ** 31 + 5)).toBe(5);
    for (const t of [2 ** 32 + 77, 2 ** 40 + 3, 20 * 86_400 * 365 * 5]) {
      expect(wireTickIndex(t)).toBe((t >>> 0) & I32_MAX);
      expect(wireTickIndex(t)).toBeLessThanOrEqual(I32_MAX);
    }
  });
});

describe("addSatI32 — 누적 카운터 i32 포화", () => {
  test("정상 범위는 덧셈 그대로, i32 최대에서 멈춘다", () => {
    expect(addSatI32(3, 4)).toBe(7);
    expect(addSatI32(I32_MAX - 1, 1)).toBe(I32_MAX);
    expect(addSatI32(I32_MAX - 1, I32_MAX)).toBe(I32_MAX);
  });
});
