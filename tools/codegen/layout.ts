// 바이너리 본문 레이아웃 계산 — 고정 크기·최악 크기·고정 머리 오프셋. 규칙 정본은 shared/protocol.md §2:
// LE·패딩 없음, string/array = u16 길이(개수) + 내용, optional = 본문/struct 맨 앞 presence 비트마스크 ceil(k/8)바이트.
// 스키마 검증(schema.ts)·생성기(emitTs*)가 같은 계산을 쓴다. 참조 인터프리터(refCodec.ts)는 독립성을 위해 이 모듈을 쓰지 않는다.

import type { ElemType, EnumRepr, FieldDef, PrimType, StructDef, TypeTable } from "./schema";

/** string 바이트 길이·array 원소 수 접두(u16 LE). */
export const LEN_PREFIX_BYTES = 2;
/** u16 길이·개수의 상한이자 바이너리 본문 최악 크기 상한(미래 u16 프레임 길이 — H1·B1). */
export const MAX_WIRE_LENGTH = 0xffff;
/** 한 필드 목록(패킷 본문·struct)의 optional 필드 상한 — presence 비트마스크를 32비트 정수 하나로 다룬다. */
export const MAX_OPTIONAL_FIELDS = 32;
/**
 * 바이너리 본문 규칙(protocol.md §2 — 길이 접두 폭·presence 위치·바이트 순서 등) 판. 규칙을 바꾸면(layout·refCodec·emitTsCodec·runtime을
 * 함께) 올린다 — lock headerHash 입력이라 protoVersion bump가 강제된다.
 */
export const WIRE_RULES_VERSION = 1;

export const FIXED_PRIM_BYTES: Readonly<Record<Exclude<PrimType, "string">, number>> = {
  u8: 1,
  i8: 1,
  bool: 1,
  u16: 2,
  i16: 2,
  u32: 4,
  i32: 4,
  f32: 4,
  f64: 8,
};

export const ENUM_REPR_BYTES: Readonly<Record<EnumRepr, number>> = { u8: 1, u16: 2, u32: 4 };

export function structOf(types: TypeTable, name: string): StructDef {
  const s = types.structs.get(name);
  if (s === undefined) throw new Error(`unknown struct ${name}`);
  return s;
}

export function enumReprOf(types: TypeTable, name: string): EnumRepr {
  const e = types.enums.get(name);
  if (e === undefined) throw new Error(`unknown enum ${name}`);
  return e.repr;
}

export function optionalCount(fields: readonly FieldDef[]): number {
  let k = 0;
  for (const f of fields) if (f.optional) k++;
  return k;
}

/** presence 비트마스크 바이트 수 = ceil(optional 수 / 8). optional이 없으면 0. */
export function presenceBytes(fields: readonly FieldDef[]): number {
  return Math.ceil(optionalCount(fields) / 8);
}

/** 원소 타입의 고정 크기(바이트). string·가변 struct는 null. */
export function elemFixedSize(types: TypeTable, t: ElemType): number | null {
  switch (t.kind) {
    case "prim":
      return t.prim === "string" ? null : FIXED_PRIM_BYTES[t.prim];
    case "enum":
      return ENUM_REPR_BYTES[enumReprOf(types, t.name)];
    case "struct":
      return fixedSize(types, structOf(types, t.name).fields);
  }
}

/** 필드의 고정 크기 — optional·array·string·가변 struct는 null. */
export function fieldFixedSize(types: TypeTable, f: FieldDef): number | null {
  if (f.optional || f.type.kind === "array") return null;
  return elemFixedSize(types, f.type);
}

/** 필드 목록이 고정 크기면 그 바이트 수, 아니면 null. 필드 0개 = 0바이트. */
export function fixedSize(types: TypeTable, fields: readonly FieldDef[]): number | null {
  let n = 0;
  for (const f of fields) {
    const s = fieldFixedSize(types, f);
    if (s === null) return null;
    n += s;
  }
  return n;
}

function elemWorstSize(types: TypeTable, t: ElemType, strMax: number | undefined): number {
  if (t.kind === "prim" && t.prim === "string") {
    if (strMax === undefined) throw new Error("string without max has no worst-case size");
    return LEN_PREFIX_BYTES + strMax;
  }
  if (t.kind === "struct") return worstCaseSize(types, structOf(types, t.name).fields);
  const fixed = elemFixedSize(types, t);
  if (fixed === null) throw new Error("unreachable: non-string element without fixed size");
  return fixed;
}

function fieldWorstSize(types: TypeTable, f: FieldDef): number {
  if (f.type.kind !== "array") return elemWorstSize(types, f.type, f.max);
  if (f.max === undefined) throw new Error(`array ${f.name} without max has no worst-case size`);
  return LEN_PREFIX_BYTES + f.max * elemWorstSize(types, f.type.of, f.ofMax);
}

/** 최악 본문 크기 — 모든 optional 존재·모든 string/array가 max. string/array에 max가 없으면 throw(검증이 먼저 막는다). */
export function worstCaseSize(types: TypeTable, fields: readonly FieldDef[]): number {
  let n = presenceBytes(fields);
  for (const f of fields) n += fieldWorstSize(types, f);
  return n;
}

/** 고정 머리 — 첫 가변 필드 앞까지의 필드 오프셋. 그 가변 필드가 optional이 아닌 string/array면 길이 접두 자리까지 포함한다. */
export interface FixedPrefix {
  /** [키, 본문 오프셋] — 고정 필드는 필드명, 길이 접두는 "count"(array)·"length"(string)(앞 필드명과 겹치면 `<필드>Count`·`<필드>Length`). */
  readonly offsets: readonly (readonly [string, number])[];
  /** 머리 끝 오프셋(길이 접두 포함). */
  readonly bytes: number;
}

export function fixedPrefix(types: TypeTable, fields: readonly FieldDef[]): FixedPrefix {
  const offsets: (readonly [string, number])[] = [];
  let off = presenceBytes(fields);
  for (const f of fields) {
    const s = fieldFixedSize(types, f);
    if (s !== null) {
      offsets.push([f.name, off]);
      off += s;
      continue;
    }
    const isString = f.type.kind === "prim" && f.type.prim === "string";
    if (!f.optional && (f.type.kind === "array" || isString)) {
      offsets.push([prefixKey(f, offsets), off]);
      off += LEN_PREFIX_BYTES;
    }
    break;
  }
  return { offsets, bytes: off };
}

function prefixKey(f: FieldDef, taken: readonly (readonly [string, number])[]): string {
  const isArray = f.type.kind === "array";
  const base = isArray ? "count" : "length";
  if (!taken.some(([k]) => k === base)) return base;
  return `${f.name}${isArray ? "Count" : "Length"}`;
}
