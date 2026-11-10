// 바이너리 본문 런타임(server/src/net/wire/runtime.ts) — 엄격 UTF-8 판정(WHATWG TextDecoder fatal과 퍼징 대조), BodyReader의 첫 위반 우선·
// 범위 먼저·presence 미사용 비트·Trailing, 인코드 검사(정수·f32 범위·서로게이트·개수).

import { describe, expect, test } from "bun:test";
import {
  BodyReader,
  WIRE_ERROR,
  WireEncodeError,
  checkCount,
  checkEnum,
  checkF32,
  checkF64,
  checkInt,
  isValidUtf8,
  strSize,
  wireErrorName,
  writeStr,
} from "../../../server/src/net/wire/runtime";

const fatal = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function whatwgValid(b: Uint8Array): boolean {
  try {
    fatal.decode(b);
    return true;
  } catch {
    return false;
  }
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe("isValidUtf8 ≡ TextDecoder(fatal)", () => {
  test.each([
    ["ASCII", "48656c6c6f", true],
    ["빈", "", true],
    ["2바이트 최소 C2 80", "c280", true],
    ["overlong C0 80", "c080", false],
    ["overlong C1 BF", "c1bf", false],
    ["3바이트 최소 E0 A0 80", "e0a080", true],
    ["overlong E0 80 80", "e08080", false],
    ["서로게이트 ED A0 80", "eda080", false],
    ["ED 9F BF(U+D7FF)", "ed9fbf", true],
    ["U+FFFF EF BF BF", "efbfbf", true],
    ["BOM", "efbbbf", true],
    ["4바이트 최소 F0 90 80 80", "f0908080", true],
    ["overlong F0 80 80 80", "f0808080", false],
    ["U+10FFFF F4 8F BF BF", "f48fbfbf", true],
    ["U+110000 F4 90 80 80", "f4908080", false],
    ["F5 이상", "f5808080", false],
    ["홀로 연속 바이트", "80", false],
    ["잘린 3바이트", "e0a0", false],
    ["잘린 4바이트", "f09080", false],
    ["연속 바이트 아님", "c241", false],
  ])("%s", (_n, h, ok) => {
    const b = Buffer.from(h, "hex");
    expect(isValidUtf8(b, 0, b.length)).toBe(ok);
    expect(whatwgValid(b)).toBe(ok);
  });

  test("무작위 50,000 — UTF-8스러운 바이트열에서 판정이 같다(범위 인자 포함)", () => {
    const r = rng(42);
    const pool = [0x41, 0x7f, 0x80, 0xbf, 0xc0, 0xc2, 0xdf, 0xe0, 0xed, 0xef, 0xf0, 0xf4, 0xf5, 0xff, 0x9f, 0xa0, 0x8f, 0x90];
    for (let i = 0; i < 50_000; i++) {
      const n = Math.floor(r() * 9);
      const b = new Uint8Array(n + 2);
      for (let k = 0; k < b.length; k++) b[k] = r() < 0.6 ? pool[Math.floor(r() * pool.length)]! : Math.floor(r() * 256);
      expect(isValidUtf8(b, 1, 1 + n)).toBe(whatwgValid(b.subarray(1, 1 + n)));
    }
  });
});

describe("BodyReader", () => {
  const reader = (h: string): BodyReader => new BodyReader().reset(Buffer.from(h, "hex"));

  test("LE 판독·done = 정확히 소비", () => {
    const r = reader("0102" + "03000000" + "ff" + "0000c03f");
    expect([r.u16(), r.u32(), r.i8(), r.f32()]).toEqual([0x0201, 3, -1, 1.5]);
    expect(r.done()).toBe(true);
  });

  test("Trailing — 위반 없이 남으면", () => {
    const r = reader("0100ff");
    r.u16();
    expect(r.done()).toBe(false);
    expect(r.err).toBe(WIRE_ERROR.Trailing);
  });

  test("첫 위반 우선 — 이후 읽기는 0·''·false 무동작, 사유는 그대로", () => {
    const r = reader("02" + "0000c07f");
    expect(r.bool()).toBe(false);
    expect(r.err).toBe(WIRE_ERROR.BadBool);
    expect(r.f32()).toBe(0);
    expect(r.str(10)).toBe("");
    expect(r.count(0, 10)).toBe(0);
    expect(r.done()).toBe(false);
    expect(r.err).toBe(WIRE_ERROR.BadBool);
  });

  test("NonFinite — f32 NaN·Inf, f64 -Inf", () => {
    expect((() => { const r = reader("0000c07f"); r.f32(); return r.err; })()).toBe(WIRE_ERROR.NonFinite);
    expect((() => { const r = reader("0000807f"); r.f32(); return r.err; })()).toBe(WIRE_ERROR.NonFinite);
    expect((() => { const r = reader("000000000000f0ff"); r.f64(); return r.err; })()).toBe(WIRE_ERROR.NonFinite);
  });

  test("string — 길이 > max는 내용 전에 OverMax, 내용 모자라면 Truncated, 잘못된 UTF-8은 BadUtf8, BOM 보존", () => {
    const over = reader("0500");
    expect(over.str(4)).toBe("");
    expect(over.err).toBe(WIRE_ERROR.OverMax);
    const trunc = reader("0400616263");
    trunc.str(4);
    expect(trunc.err).toBe(WIRE_ERROR.Truncated);
    const bad = reader("0200c0af");
    bad.str(4);
    expect(bad.err).toBe(WIRE_ERROR.BadUtf8);
    const bom = reader("0600efbbbfed959c");
    expect(bom.str(6)).toBe("﻿한");
    expect(bom.done()).toBe(true);
  });

  test("count — > max OverMax, < min UnderMin(원소 전), need는 남은 바이트", () => {
    const over = reader("0300");
    expect(over.count(0, 2)).toBe(0);
    expect(over.err).toBe(WIRE_ERROR.OverMax);
    const under = reader("0000");
    under.count(1, 2);
    expect(under.err).toBe(WIRE_ERROR.UnderMin);
    const r = reader("0200aabb");
    expect(r.count(0, 4)).toBe(2);
    expect(r.need(4)).toBe(false);
    expect(r.err).toBe(WIRE_ERROR.Truncated);
  });

  test("presence — LSB부터, k 이상 비트는 BadPresence(k=32는 미사용 비트 없음)", () => {
    expect(reader("0501").presence(2, 9)).toBe(0x105);
    const bad = reader("0002");
    expect(bad.presence(2, 9)).toBe(0);
    expect(bad.err).toBe(WIRE_ERROR.BadPresence);
    expect(reader("ffffffff").presence(4, 32)).toBe(0xffffffff);
    const short = reader("01");
    short.presence(2, 9);
    expect(short.err).toBe(WIRE_ERROR.Truncated);
  });

  test("reset은 위반을 지우고 Buffer 아닌 Uint8Array도 복사 없이 읽는다", () => {
    const r = reader("");
    r.u8();
    expect(r.err).toBe(WIRE_ERROR.Truncated);
    const u8 = new Uint8Array([9, 0, 7]);
    r.reset(u8.subarray(1));
    expect(r.err).toBe(WIRE_ERROR.None);
    expect([r.u8(), r.u8()]).toEqual([0, 7]);
    expect(r.done()).toBe(true);
  });

  test("wireErrorName", () => {
    expect(wireErrorName(WIRE_ERROR.Truncated)).toBe("Truncated");
    expect(wireErrorName(WIRE_ERROR.NonFinite)).toBe("NonFinite");
    expect(wireErrorName(0)).toBe("None");
    expect(wireErrorName(99)).toBe("Unknown");
  });
});

describe("인코드 검사", () => {
  test("checkInt — 범위·정수성", () => {
    expect(() => checkInt(255, 0, 255, "p")).not.toThrow();
    expect(() => checkInt(256, 0, 255, "p")).toThrow(WireEncodeError);
    expect(() => checkInt(-1, 0, 255, "p")).toThrow(/p: integer outside \[0, 255\]: -1/);
    expect(() => checkInt(1.5, 0, 255, "p")).toThrow(WireEncodeError);
    expect(() => checkInt(Number.NaN, 0, 255, "p")).toThrow(WireEncodeError);
  });

  test("checkF32 — f32로 유한(FLT_MAX 통과, 3.5e38·NaN·Inf 거부), checkF64", () => {
    expect(() => checkF32(3.4028234663852886e38, "p")).not.toThrow();
    expect(() => checkF32(3.5e38, "p")).toThrow(/not a finite f32/);
    expect(() => checkF32(Number.NaN, "p")).toThrow(WireEncodeError);
    expect(() => checkF64(Number.MAX_VALUE, "p")).not.toThrow();
    expect(() => checkF64(Number.POSITIVE_INFINITY, "p")).toThrow(/not a finite f64/);
  });

  test("strSize — 길이 접두 포함 UTF-8 바이트, max 초과·짝 없는 서로게이트 거부. writeStr 왕복", () => {
    expect(strSize("한글", 6, "p")).toBe(2 + 6);
    expect(() => strSize("한글", 5, "p")).toThrow(/6 UTF-8 bytes > max 5/);
    expect(() => strSize("\ud83d", 10, "p")).toThrow(/lone surrogate/);
    const out = Buffer.alloc(9, 0xee);
    expect(writeStr(out, 1, "한글")).toBe(9);
    expect(out.toString("hex")).toBe("ee" + "0600" + "ed959ceab880");
  });

  test("checkCount·checkEnum", () => {
    expect(() => checkCount([1, 2], 0, 2, "p")).not.toThrow();
    expect(() => checkCount([1, 2, 3], 0, 2, "p")).toThrow(/count 3 outside \[0, 2\]/);
    expect(() => checkCount([], 1, 2, "p")).toThrow(WireEncodeError);
    expect(() => checkEnum({ a: 1 }, "a", "p")).not.toThrow();
    expect(() => checkEnum({ a: 1 }, "toString", "p")).toThrow(/not an enum value/);
  });
});
