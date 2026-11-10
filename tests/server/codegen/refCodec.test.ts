// 참조 인터프리터(tools/codegen/refCodec.ts) — protocol.md §2 문장을 손으로 계산한 바이트로 고정하고, 합성 스키마의 무작위 왕복과
// 오류 사유(첫 위반·범위 먼저)를 본다. 생성 코덱과의 대조는 emitFixture.test.ts·net/wireCodec.test.ts.

import { describe, expect, test } from "bun:test";
import { refDecode, refEncode, RefEncodeError } from "../../../tools/codegen/refCodec";
import { fixtureAst, randPayload, rng } from "../../../tools/codegen/fixture";

const ast = fixtureAst();
const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
const bytes = (h: string): Uint8Array => new Uint8Array(Buffer.from(h.replace(/\s+/g, ""), "hex"));

describe("바이트 배치(손 계산)", () => {
  test("원시 전부 — LE·패딩 없음·bool 0/1·string = u16 길이 + UTF-8", () => {
    const v = { a: 0xab, b: 0x1234, c: 0xdeadbeef, d: -1, e: -2, f: -3, g: 1.5, h: -2.25, i: true, s: "한" };
    expect(hex(refEncode(ast, "ALL_PRIMS", v))).toBe(
      "ab" + "3412" + "efbeadde" + "ff" + "feff" + "fdffffff" + "0000c03f" + "00000000000002c0" + "01" + "0300" + "ed959c",
    );
  });

  test("optional — 맨 앞 presence(LSB부터, 9개 → 2바이트), 없는 필드는 0바이트", () => {
    expect(hex(refEncode(ast, "OPTS", { always: 7 }))).toBe("0000" + "0700");
    expect(hex(refEncode(ast, "OPTS", { o1: 5, always: 7, o3: "monster" }))).toBe("0500" + "05" + "0700" + "03");
    const o9 = { id: 1, kind: "npc", pos: { x: 0, y: 0 } };
    // o9(9번째 optional) = 두 번째 바이트 bit0. Entity 자체 presence(0 — name·tags 없음)가 struct 맨 앞.
    expect(hex(refEncode(ast, "OPTS", { always: 1, o9 }))).toBe("0001" + "0100" + "00" + "01000000" + "02" + "0000000000000000");
  });

  test("enum = repr 폭 코드, array = u16 개수 + 원소, 필드 0개 = 0바이트", () => {
    const w = { tick: 9, entities: [], names: ["a"], kinds: ["player", "monster"], wide: "hi", huge: "big", flags: [true, false] };
    expect(hex(refEncode(ast, "WORLD", w))).toBe("09000000" + "0000" + "0100" + "0100" + "61" + "0200" + "0103" + "ffff" + "ffffffff" + "0200" + "0100");
    expect(refEncode(ast, "EMPTY_BIN", {}).length).toBe(0);
  });
});

describe("무작위 왕복", () => {
  test.each(["PING_BIN", "ALL_PRIMS", "OPTS", "WORLD", "EMPTY_BIN", "Entity", "Tag"])("%s × 300", (target) => {
    const r = rng(target.length * 7919);
    for (let i = 0; i < 300; i++) {
      const v = randPayload(ast, target, r);
      const enc = refEncode(ast, target, v);
      const dec = refDecode(ast, target, enc);
      expect(dec).toEqual({ ok: true, value: v });
    }
  });
});

describe("디코드 오류 — 첫 위반, 범위는 내용보다 먼저", () => {
  const err = (target: string, h: string): string => {
    const d = refDecode(ast, target, bytes(h));
    return d.ok ? "ok" : d.error;
  };

  test("Truncated·Trailing", () => {
    expect(err("PING_BIN", "00000000000000")).toBe("Truncated");
    expect(err("PING_BIN", "000000000000000000")).toBe("Trailing");
    expect(err("EMPTY_BIN", "00")).toBe("Trailing");
  });

  test("NonFinite(f32·f64 NaN·±Inf)·BadBool·BadEnum", () => {
    expect(err("PING_BIN", "000000000000f87f")).toBe("NonFinite");
    expect(err("PING_BIN", "000000000000f0ff")).toBe("NonFinite");
    const prims = (g: string, i: string): string => err("ALL_PRIMS", "00" + "0000" + "00000000" + "00" + "0000" + "00000000" + g + "0000000000000000" + i + "0000");
    expect(prims("0000c07f", "00")).toBe("NonFinite");
    expect(prims("0000807f", "00")).toBe("NonFinite");
    expect(prims("00000000", "02")).toBe("BadBool");
    expect(prims("00000000", "01")).toBe("ok");
    expect(err("OPTS", "0400" + "0000" + "09")).toBe("BadEnum"); // o3 = 코드 9(미정의).
  });

  test("BadUtf8 — overlong·서로게이트·잘린 열, BOM(EF BB BF)은 정상이고 보존", () => {
    const str = (h: string): string => err("Tag", "00" + h);
    expect(str("0200c080")).toBe("BadUtf8");
    expect(str("0300eda080")).toBe("BadUtf8");
    expect(str("0200e0a0")).toBe("BadUtf8");
    expect(str("0300efbbbf")).toBe("ok");
    expect(refDecode(ast, "Tag", bytes("00" + "0300efbbbf"))).toEqual({ ok: true, value: { label: "﻿" } });
  });

  test("OverMax·UnderMin은 내용(잘림)보다 먼저", () => {
    expect(err("Tag", "00" + "0900")).toBe("OverMax"); // label 길이 9 > 8, 내용 없음.
    // WORLD.names min 1: 개수 0.
    expect(err("WORLD", "00000000" + "0000" + "0000")).toBe("UnderMin");
    expect(err("WORLD", "00000000" + "0700")).toBe("OverMax"); // entities 7 > 6.
  });

  test("고정 크기 원소 array는 원소 전에 남은 바이트를 본다 — NaN 원소보다 Truncated가 먼저", () => {
    // OPTS.o5 = array<u16> max 3 — 개수 3인데 원소 1개뿐.
    expect(err("OPTS", "1000" + "0000" + "0300" + "0100")).toBe("Truncated");
  });

  test("presence 미사용 비트는 0이어야 한다(BadPresence)", () => {
    expect(err("Tag", "02" + "0000")).toBe("BadPresence");
    expect(err("OPTS", "0002" + "0000")).toBe("BadPresence"); // 10번째 비트 — optional은 9개.
  });
});

describe("인코드 거부", () => {
  test.each([
    ["정수 범위", "PING_BIN", { t: 1 }, null],
    ["u8 초과", "ALL_PRIMS", { a: 256 }, /a: u8 out of range/],
    ["정수성", "ALL_PRIMS", { c: 1.5 }, /c: u32 out of range/],
    ["f32 범위 밖(fround = Inf)", "ALL_PRIMS", { g: 3.5e38 }, /g: not a finite f32/],
    ["f64 NaN", "PING_BIN", { t: Number.NaN }, /t: not a finite f64/],
    ["bool 타입", "ALL_PRIMS", { i: 1 }, /i: boolean expected/],
    ["string max(UTF-8 바이트)", "ALL_PRIMS", { s: "한".repeat(6) }, /18 UTF-8 bytes > max 16/],
    ["짝 없는 서로게이트", "ALL_PRIMS", { s: "\ud800" }, /lone surrogate/],
  ])("%s", (_n, target, patch, pattern) => {
    const base = randPayload(ast, target, rng(1));
    const v = { ...base, ...(patch as object) };
    if (pattern === null) expect(() => refEncode(ast, target, v)).not.toThrow();
    else expect(() => refEncode(ast, target, v)).toThrow(pattern);
  });

  test("enum 값·array 개수(min/max)·struct 모양", () => {
    expect(() => refEncode(ast, "OPTS", { always: 0, o3: "dragon" })).toThrow(RefEncodeError);
    const w = randPayload(ast, "WORLD", rng(2));
    expect(() => refEncode(ast, "WORLD", { ...w, names: [] })).toThrow(/count 0 outside \[1, 5\]/);
    expect(() => refEncode(ast, "WORLD", { ...w, kinds: ["npc", "npc", "npc", "npc"] })).toThrow(/count 4 outside \[0, 3\]/);
    expect(() => refEncode(ast, "OPTS", { always: 0, o4: 5 })).toThrow(/o4: object expected/);
  });
});
