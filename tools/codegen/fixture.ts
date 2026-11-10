// 합성 스키마(픽스처) — SNAPSHOT_DELTA가 안 쓰는 기능 전부(optional·presence 2바이트·optional 32개(presence 4바이트·비트 31)·
// enum u8/u16/u32·중첩 struct·struct 배열·string 배열·bool·f64·bodyOf·필드 없는 패킷)와 스키마에서 유효 페이로드를
// 무작위로 만드는 결정적 생성기. 코드젠 시험(tests/server/codegen)과 교차 언어 골든(golden.ts)·C# 픽스처 코덱 산출물이 함께 쓴다 —
// 이 파일을 바꾸면 `bun run gen`으로 골든·C# 픽스처 산출물을 다시 만든다(gen --check가 누락을 잡는다).

import { parseSchema, type ElemType, type FieldDef, type SchemaAst } from "./schema";

/** 합성 스키마 원본 — 부를 때마다 새 객체(시험이 변형한다 — 변형용 느슨한 타입은 tests/server/codegen/rawFixture.ts). */
export function fixtureRaw(): Record<string, unknown> {
  return {
    version: 2,
    protoVersion: 7,
    header: { format: "v1", _format_doc: "주석", endian: "big", id_bytes: 2, len_bytes: 4 },
    enums: {
      Kind: { repr: "u8", values: { player: 1, npc: 2, monster: 3 } },
      Wide: { repr: "u16", values: { lo: 0, mid: 300, hi: 65535 } },
      Huge: { repr: "u32", values: { zero: 0, big: 4294967295 } },
    },
    structs: {
      Vec2: { fields: [{ name: "x", type: "f32" }, { name: "y", type: "f32" }] },
      Tag: { fields: [{ name: "label", type: "string", max: 8 }, { name: "weight", type: "i16", optional: true }] },
      Entity: {
        fields: [
          { name: "id", type: "u32" },
          { name: "kind", type: "Kind" },
          { name: "pos", type: "Vec2" },
          { name: "name", type: "string", max: 24, optional: true },
          { name: "tags", type: "array", of: "Tag", max: 4, optional: true },
        ],
      },
    },
    packets: {
      PING_BIN: { id: 0x10, direction: "C2S", fields: [{ name: "t", type: "f64" }] },
      ALL_PRIMS: {
        id: 0x11,
        direction: "C2S",
        fields: [
          { name: "a", type: "u8" },
          { name: "b", type: "u16" },
          { name: "c", type: "u32" },
          { name: "d", type: "i8" },
          { name: "e", type: "i16" },
          { name: "f", type: "i32" },
          { name: "g", type: "f32" },
          { name: "h", type: "f64" },
          { name: "i", type: "bool" },
          { name: "s", type: "string", max: 16 },
        ],
      },
      OPTS: {
        id: 0x12,
        direction: "S2C",
        fields: [
          { name: "o1", type: "u8", optional: true },
          { name: "always", type: "u16" },
          { name: "o2", type: "string", max: 6, optional: true },
          { name: "o3", type: "Kind", optional: true },
          { name: "o4", type: "Vec2", optional: true },
          { name: "o5", type: "array", of: "u16", max: 3, optional: true },
          { name: "o6", type: "bool", optional: true },
          { name: "o7", type: "f64", optional: true },
          { name: "o8", type: "i32", optional: true },
          { name: "o9", type: "Entity", optional: true },
        ],
      },
      WORLD: {
        id: 0x13,
        direction: "S2C",
        fields: [
          { name: "tick", type: "u32" },
          { name: "entities", type: "array", of: "Entity", max: 6 },
          { name: "names", type: "array", of: "string", ofMax: 12, min: 1, max: 5 },
          { name: "kinds", type: "array", of: "Kind", max: 3 },
          { name: "wide", type: "Wide" },
          { name: "huge", type: "Huge" },
          { name: "flags", type: "array", of: "bool", max: 4 },
        ],
      },
      EMPTY_BIN: { id: 0x14, direction: "C2S", fields: [] },
      OPT32: {
        id: 0x18,
        direction: "S2C",
        _doc: "optional 상한 32개 — presence 4바이트(미사용 비트 없음)·비트 31(부호 비트).",
        fields: Array.from({ length: 32 }, (_, i) => ({ name: `f${i}`, type: "u8", optional: true })),
      },
      WORLD_COPY: { id: 0x15, direction: "S2C", bodyOf: "WORLD" },
    },
  };
}

export function fixtureAst(): SchemaAst {
  return parseSchema(fixtureRaw());
}

/** 결정적 PRNG(mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHARS = ["a", "Z", "0", " ", "é", "한", "글", "€", "😀", "\u0000", "﻿", "߿", "ࠀ", "�", "𐍈"];

function randString(r: () => number, maxBytes: number): string {
  let s = "";
  let bytes = 0;
  const target = Math.floor(r() * (maxBytes + 1));
  for (let tries = 0; tries < 40 && bytes < target; tries++) {
    const c = CHARS[Math.floor(r() * CHARS.length)]!;
    const n = Buffer.byteLength(c, "utf8");
    if (bytes + n > maxBytes) continue;
    s += c;
    bytes += n;
  }
  return s;
}

const F32_EDGES = [0, -0, 1, -1, 3.4028234663852886e38, -3.4028234663852886e38, 1.401298464324817e-45, 0.1, 123456.789].map(Math.fround);

function randPrim(prim: string, r: () => number, strMax: number | undefined): unknown {
  const ranges: Record<string, [number, number]> = {
    u8: [0, 0xff], u16: [0, 0xffff], u32: [0, 0xffffffff], i8: [-128, 127], i16: [-32768, 32767], i32: [-2147483648, 2147483647],
  };
  const range = ranges[prim];
  if (range !== undefined) {
    if (r() < 0.2) return r() < 0.5 ? range[0] : range[1];
    return range[0] + Math.floor(r() * (range[1] - range[0] + 1));
  }
  if (prim === "bool") return r() < 0.5;
  if (prim === "string") return randString(r, strMax ?? 32);
  if (prim === "f32") return r() < 0.3 ? F32_EDGES[Math.floor(r() * F32_EDGES.length)]! : Math.fround((r() - 0.5) * 1e6);
  return r() < 0.2 ? Number.MAX_VALUE * (r() < 0.5 ? 1 : -1) : (r() - 0.5) * 1e12;
}

/** 생성 선택 — 기본값은 종전 동작(같은 난수 열). */
export interface GenOptions {
  /** array 원소 수 상한(골든 크기 제한 — 기본: 균등 분기 ≤ 8, 15% 분기는 스키마 max). min보다 작으면 min. */
  readonly arrayCap?: number;
  /** optional 필드: random(반반 생략, 기본)·all(전부 존재)·none(전부 생략). */
  readonly optional?: "random" | "all" | "none";
}

function randElem(ast: SchemaAst, t: ElemType, r: () => number, strMax: number | undefined, opts: GenOptions): unknown {
  if (t.kind === "prim") return randPrim(t.prim, r, strMax);
  if (t.kind === "enum") {
    const vals = ast.enums.get(t.name)!.values;
    return vals[Math.floor(r() * vals.length)]![0];
  }
  return randFields(ast, ast.structs.get(t.name)!.fields, r, opts);
}

function randField(ast: SchemaAst, f: FieldDef, r: () => number, opts: GenOptions): unknown {
  if (f.type.kind !== "array") return randElem(ast, f.type, r, f.max, opts);
  const lo = f.min ?? 0;
  const cap = opts.arrayCap ?? Number.POSITIVE_INFINITY;
  const hi = Math.max(lo, Math.min(f.max ?? 8, 8, cap));
  const full = Math.max(lo, Math.min(f.max ?? hi, cap));
  const n = r() < 0.15 ? full : lo + Math.floor(r() * (hi - lo + 1));
  return Array.from({ length: n }, () => randElem(ast, (f.type as { of: ElemType }).of, r, f.ofMax, opts));
}

function skipOptional(r: () => number, opts: GenOptions): boolean {
  if (opts.optional === "all") return false;
  if (opts.optional === "none") return true;
  return r() < 0.5;
}

/** 필드 목록의 유효 값(optional은 opts.optional — 기본 반반 생략). */
export function randFields(ast: SchemaAst, fields: readonly FieldDef[], r: () => number, opts: GenOptions = {}): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.optional && skipOptional(r, opts)) continue;
    o[f.name] = randField(ast, f, r, opts);
  }
  return o;
}

/** 패킷·struct 이름으로 유효 페이로드. */
export function randPayload(ast: SchemaAst, target: string, r: () => number, opts: GenOptions = {}): Record<string, unknown> {
  const p = ast.packets.find((x) => x.name === target);
  return randFields(ast, p !== undefined ? p.fields : ast.structs.get(target)!.fields, r, opts);
}

/** 변조 — 바이트 바꿈(50%)·잘림(20%)·덧붙임(15%)·끼움(15%). 생성 코덱 ≡ refCodec 퍼징(emitFixture.test.ts)과 골든(golden.ts)이 같은 분포를 쓴다. */
export function mutate(b: Uint8Array, r: () => number): Uint8Array {
  const k = r();
  const at = Math.floor(r() * (b.length + 1));
  const byte = r() < 0.3 ? [0x00, 0xff, 0x80, 0x7f, 0xc0, 0xed][Math.floor(r() * 6)]! : Math.floor(r() * 256);
  if (k < 0.5 && b.length > 0) {
    const c = b.slice();
    c[Math.min(at, b.length - 1)] = byte;
    return c;
  }
  if (k < 0.7) return b.slice(0, at);
  if (k < 0.85) return Uint8Array.from([...b, byte]);
  return Uint8Array.from([...b.subarray(0, at), byte, ...b.subarray(at)]);
}
