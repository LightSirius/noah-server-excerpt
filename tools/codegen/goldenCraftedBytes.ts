// 손으로 짠 골든 사례의 바이트 도우미 — goldenCrafted.ts와 goldenCraftedLife.ts가 함께 쓴다.

import type { RefWireError } from "./refCodec";

export interface CraftedCase {
  readonly packet: string;
  readonly label: string;
  readonly hex: string;
  /** "ok" = 유효(디코드 값이 골든 payload가 된다), 그 밖 = 기대 첫 위반. */
  readonly expect: RefWireError | "ok";
}

export const c = (packet: string, label: string, expect: RefWireError | "ok", ...parts: string[]): CraftedCase => ({
  packet,
  label,
  hex: parts.join(""),
  expect,
});

export const rep = (hex: string, n: number): string => hex.repeat(n);
/** u16 LE hex. */
export const u16 = (n: number): string => (n & 0xff).toString(16).padStart(2, "0") + (n >>> 8).toString(16).padStart(2, "0");
/** string = u16 LE 바이트 길이 + 바이트(길이 256 이상도). */
export const lstr = (bytesHex: string): string => u16(bytesHex.length / 2) + bytesHex;
/** UTF-8 바이트 hex. */
export const utf8hex = (s: string): string => Buffer.from(s, "utf8").toString("hex");
export const I32_ONE = "01000000";
export const Z4 = "00000000";
/** f32 비트(LE hex): 최대 유한값·-0·NaN·+Inf. */
export const F32_MAX = "ffff7f7f";
export const F32_NEG_ZERO = "00000080";
export const F32_NAN = "0000c07f";
export const F32_INF = "0000807f";
/** 64 B 경계 이름 — 한글 21자(63 B) + ASCII 1자. */
export const NAME_64 = lstr(rep("eab080", 21) + "61");
/** i32 LE hex. */
export const i32 = (n: number): string => {
  const b = Buffer.alloc(4);
  b.writeInt32LE(n);
  return b.toString("hex");
};

/** f32 LE hex. */
export const f32 = (n: number): string => {
  const b = Buffer.alloc(4);
  b.writeFloatLE(n);
  return b.toString("hex");
};

/** u8 hex. */
export const u8 = (n: number): string => n.toString(16).padStart(2, "0");
/** UTF-8 string 필드(u16 바이트 길이 + 바이트). */
export const txt = (s: string): string => lstr(utf8hex(s));
/** u16 개수 + 원소(이미 hex). */
export const list = (items: readonly string[]): string => u16(items.length) + items.join("");
/** RewardPreviewItem(itemId·qty) · NpcQuestMarker(npcId·marker) = i32 두 개. */
export const i32Pair = (a: number, b: number): string => i32(a) + i32(b);
