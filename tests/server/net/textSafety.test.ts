// 이진 전환 B2c — 표시 위험 문자 집합(net/textSafety: Cc·Cf·Zl·Zp + 한글 채움 문자). 채팅 정화(chatSayHandler.sanitizeText)가 지우고,
// 계정 이름 규칙(loginFlow.isValidUsername)이 같은 집합으로 거부한다.

import { describe, expect, test } from "bun:test";
import { hasDisplayUnsafe, isDisplayUnsafeCodePoint, stripDisplayUnsafe } from "../../../server/src/net/textSafety";
import { isValidUsername } from "../../../server/src/identity/loginFlow";

/** 반드시 막아야 하는 대표 — 범주별 경계와 리뷰가 실측한 우회 문자. */
const UNSAFE: readonly [number, number][] = [
  [0x0000, 0x001f], // C0
  [0x007f, 0x009f], // DEL·C1
  [0x00ad, 0x00ad], // 소프트 하이픈
  [0x0600, 0x0605], // 아랍 서식
  [0x061c, 0x061c], // ALM
  [0x115f, 0x1160], // 한글 초성·중성 채움
  [0x180e, 0x180e], // 몽골 모음 구분자
  [0x200b, 0x200f], // 제로폭·LRM·RLM
  [0x2028, 0x202e], // 줄·문단 구분자·BiDi 임베딩
  [0x2060, 0x2064], // WJ·보이지 않는 연산자
  [0x2066, 0x206f], // BiDi 격리·폐기된 서식 제어
  [0x3164, 0x3164], // 한글 채움
  [0xfeff, 0xfeff], // BOM
  [0xffa0, 0xffa0], // 반각 한글 채움
  [0xfff9, 0xfffb], // 행간 주석
  [0x1d173, 0x1d17a], // 음악 서식
  [0xe0001, 0xe0001], // 언어 태그
  [0xe0020, 0xe007f], // 태그 문자
];

/** 지우면 안 되는 이웃·정당한 문자 — 공백류(Zs)·결합 문자·변형 선택자·이모지·한글. */
const KEEP = [
  0x20, 0x7e, 0xa0, 0xac, 0xae, 0x0301, 0x061b, 0x061d, 0x1100, 0x1161, 0x200a, 0x2010, 0x2027, 0x202f, 0x205f, 0x2065, 0x3000,
  0x3131, 0x3163, 0x3165, 0xac00, 0xd7a3, 0xfe0f, 0xfefe, 0xff00, 0xffa1, 0x1f600, 0xe0100,
];

describe("isDisplayUnsafeCodePoint", () => {
  test("대표 위험 범위는 전부 집합 안", () => {
    for (const [a, b] of UNSAFE) {
      for (let cp = a; cp <= b; cp++) {
        if (!isDisplayUnsafeCodePoint(cp)) throw new Error(`U+${cp.toString(16)} 통과`);
      }
    }
  });

  test("이웃·정당한 문자는 집합 밖(공백 Zs·결합 문자·VS16·이모지·한글 자모/음절)", () => {
    for (const cp of KEEP) expect([cp.toString(16), isDisplayUnsafeCodePoint(cp)]).toEqual([cp.toString(16), false]);
  });

  test("서로게이트 코드 포인트는 집합 밖", () => {
    for (let cp = 0xd800; cp <= 0xdfff; cp++) expect(isDisplayUnsafeCodePoint(cp)).toBe(false);
  });
});

describe("stripDisplayUnsafe", () => {
  test("지울 것이 없으면 같은 문자열 그대로(동일 참조)", () => {
    const s = "평범한 채팅 😀 text";
    expect(stripDisplayUnsafe(s)).toBe(s);
    expect(stripDisplayUnsafe("")).toBe("");
  });

  test("앞·중간·끝의 위험 문자를 모두 지우고 보조평면 쌍은 보존", () => {
    expect(stripDisplayUnsafe("‮앞\u0000중간‍😀끝﻿")).toBe("앞중간😀끝");
    expect(stripDisplayUnsafe("  ")).toBe("");
    expect(stripDisplayUnsafe("안녕­하⁢세요")).toBe("안녕하세요");
    expect(stripDisplayUnsafe("a\u{E0041}\u{E0042}b😀")).toBe("ab😀");
    expect(stripDisplayUnsafe("ㅤㅤᅟ")).toBe("");
  });
});

describe("계정 이름 규칙 = 채팅 제거 집합", () => {
  test("집합 안 코드 포인트가 든 username은 전부 거부(BMP·보조평면 전수)", () => {
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      if (!isDisplayUnsafeCodePoint(cp)) continue;
      if (isValidUsername(`ab${String.fromCodePoint(cp)}cd`)) throw new Error(`U+${cp.toString(16)} 허용`);
    }
  });

  test("hasDisplayUnsafe는 포함 여부만 — 정상 이름·한글·이모지는 false", () => {
    expect(hasDisplayUnsafe("player_01")).toBe(false);
    expect(hasDisplayUnsafe("한글이름😀")).toBe(false);
    expect(hasDisplayUnsafe("aㅤ")).toBe(true);
  });
});
