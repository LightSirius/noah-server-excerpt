// 이진 전환 B3b — 바이너리 string 필드 상한 판정·자르기(server/src/net/wireText.ts)가 생성 코덱 strSize와 같은 판정을 하는지,
// 자른 결과가 언제나 상한 안·정상 UTF-16(쌍을 가르지 않음)인지.

import { describe, expect, test } from "bun:test";
import { clampWireString, fitsWireString, utf8ByteLength } from "../../../server/src/net/wireText";
import { strSize } from "../../../server/src/net/wire/runtime";
import { mulberry32 } from "../../../tools/loadgen/rng";

/** 무작위 UTF-16 — ASCII·2바이트·한글·서로게이트 쌍·짝 없는 서로게이트 섞음. */
function randomText(r: () => number, n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) {
    const k = r();
    if (k < 0.3) s += String.fromCharCode(0x20 + Math.floor(r() * 95));
    else if (k < 0.45) s += String.fromCharCode(0x80 + Math.floor(r() * 0x780));
    else if (k < 0.7) s += String.fromCharCode(0xac00 + Math.floor(r() * 11172));
    else if (k < 0.9) s += String.fromCodePoint(0x1f300 + Math.floor(r() * 0x300));
    else s += String.fromCharCode(0xd800 + Math.floor(r() * 0x800)); // 짝 없는 서로게이트(앞·뒤 반쪽)
  }
  return s;
}

/** strSize가 받으면 true(던지면 false) — 생성 코덱의 실제 판정. */
function codecAccepts(s: string, max: number): boolean {
  try {
    strSize(s, max, "t");
    return true;
  } catch {
    return false;
  }
}

describe("wireText", () => {
  test("utf8ByteLength = 실제 UTF-8 인코딩 바이트(TextEncoder — 짝 없는 서로게이트 = U+FFFD 3바이트, Bun Buffer.byteLength는 2로 센다)", () => {
    const r = mulberry32(0xb3b);
    for (let i = 0; i < 2000; i++) {
      const s = randomText(r, Math.floor(r() * 40));
      expect(utf8ByteLength(s)).toBe(new TextEncoder().encode(s).length);
    }
    expect(utf8ByteLength("")).toBe(0);
    expect(utf8ByteLength("a가😀")).toBe(1 + 3 + 4);
  });

  test("fitsWireString = 생성 코덱 strSize가 받는 값과 같은 집합", () => {
    const r = mulberry32(66);
    for (let i = 0; i < 3000; i++) {
      const s = randomText(r, Math.floor(r() * 30));
      const max = Math.floor(r() * 80);
      expect([s, max, fitsWireString(s, max)]).toEqual([s, max, codecAccepts(s, max)]);
    }
  });

  test("clampWireString — 결과는 항상 실린다, 실리던 값은 그대로(같은 값), 자르기는 코드 포인트 경계의 최장 접두", () => {
    const r = mulberry32(0x5eed);
    for (let i = 0; i < 3000; i++) {
      const s = randomText(r, Math.floor(r() * 60));
      const max = Math.floor(r() * 90);
      const c = clampWireString(s, max);
      expect(fitsWireString(c, max)).toBe(true);
      if (fitsWireString(s, max)) expect(c).toBe(s);
      const w = s.toWellFormed();
      expect(w.startsWith(c)).toBe(true);
      // 최장 — 다음 코드 포인트를 더하면 넘는다.
      if (c.length < w.length) {
        const next = String.fromCodePoint(w.codePointAt(c.length)!);
        expect(utf8ByteLength(c + next)).toBeGreaterThan(max);
      }
    }
  });

  test("경계 사례 — 66바이트 이름 상한(한글 22자), 쌍 앞에서 자름, 짝 없는 서로게이트는 U+FFFD", () => {
    expect(clampWireString("가".repeat(30), 66)).toBe("가".repeat(22));
    expect(clampWireString(`${"a".repeat(64)}😀`, 66)).toBe("a".repeat(64));
    expect(clampWireString(`${"a".repeat(62)}😀`, 66)).toBe(`${"a".repeat(62)}😀`);
    expect(clampWireString("ab\ud800c", 66)).toBe("ab�c");
    expect(clampWireString("", 0)).toBe("");
    expect(clampWireString("a", 0)).toBe("");
  });
});
