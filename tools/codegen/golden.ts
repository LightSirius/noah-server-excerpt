// 교차 언어 골든 벡터 — 참조 인터프리터(refCodec.ts)만으로 실물 스키마의 모든 패킷과 합성 스키마(fixture.ts)의 유효·오류 사례를
// 만든다. 산출 client/Noah/Assets/Tests/EditMode/Golden/wire.golden.json을 C# WireCodecGoldenTests(EditMode)와 TS wireGolden.test.ts가 함께
// 읽어 각 언어의 생성 코덱을 검사한다(유효 = 디코드 값 일치 + 인코드 바이트 일치, 오류 = 같은 첫 위반 사유).
// 성질: 생성 코드와 독립(refCodec·WHATWG TextDecoder만) · 결정적(mulberry32 시드, 패킷 이름에서 유도) · gen.ts --check 신선도 대상.
// float은 JSON 수가 아니라 비트 패턴 문자열("0x" + f32 8자리/f64 16자리 hex, LE 아님 — 수의 IEEE 비트)이다: -0·비정규·최대값을 잃지 않고
// 어떤 언어의 JSON 수 파서(Unity Mono의 double.Parse 포함) 정확도에도 기대지 않는다. 문자열은 \uXXXX로 이스케이프해 파일을 ASCII로 둔다.

import { payloadTypeName } from "./names";
import { refDecode, refEncode, REF_WIRE_ERRORS, type RefWireError } from "./refCodec";
import type { ElemType, FieldDef, PacketDef, SchemaAst } from "./schema";
import { mutate, randPayload, rng, type GenOptions } from "./fixture";
import { craftedCases } from "./goldenCrafted";

export type SchemaLabel = "real" | "fixture";

export interface GoldenPacket {
  readonly name: string;
  readonly id: number;
  /** C# 페이로드 class 이름(emitCsTypes). */
  readonly payloadType: string;
}

interface CaseBase {
  readonly name: string;
  readonly packet: string;
  readonly id: number;
  readonly hex: string;
}

export interface GoldenValid extends CaseBase {
  /** 골든 표현의 디코드 값 — float은 비트 문자열(toGoldenPayload). */
  readonly payload: Record<string, unknown>;
}

export interface GoldenError extends CaseBase {
  readonly error: RefWireError;
}

export type GoldenCase = GoldenValid | GoldenError;

export interface GoldenSchema {
  readonly packets: readonly GoldenPacket[];
  readonly cases: readonly GoldenCase[];
}

export interface GoldenFile {
  readonly _generated: string;
  readonly _doc: string;
  /** 사유 이름 → 코드(서버 WIRE_ERROR·C# WireError와 같아야 한다). */
  readonly errors: Readonly<Record<string, number>>;
  /** [바이트 hex, 엄격 UTF-8로 유효한가(WHATWG TextDecoder fatal)]. */
  readonly utf8: readonly (readonly [string, boolean])[];
  readonly schemas: Readonly<Record<SchemaLabel, GoldenSchema>>;
}

export function isValidCase(c: GoldenCase): c is GoldenValid {
  return "payload" in c;
}

/** 무작위 array 원소 수 상한 — SNAPSHOT_DELTA max(5460) 같은 큰 배열이 골든을 부풀리지 않게. */
const ARRAY_CAP = 4;
/** 전 길이 잘림·변조의 바탕이 되는 본문 크기 상한(O(n²) 크기 제한) — 폴백 바탕의 잘림도 앞·뒤 이 크기로 묶는다(`truncLengths`). */
const SMALL_BODY = 96;
const MUTATIONS = 24;
const BODYOF_MUTATIONS = 6;
const UTF8_RANDOM = 400;

// ── float 비트 표현 ──

const scratch = new DataView(new ArrayBuffer(8));

function f32Bits(v: number): string {
  scratch.setFloat32(0, v);
  return `0x${scratch.getUint32(0).toString(16).padStart(8, "0")}`;
}

function f64Bits(v: number): string {
  scratch.setFloat64(0, v);
  return `0x${scratch.getUint32(0).toString(16).padStart(8, "0")}${scratch.getUint32(4).toString(16).padStart(8, "0")}`;
}

function bitsF32(s: string): number {
  scratch.setUint32(0, Number.parseInt(s.slice(2), 16));
  return scratch.getFloat32(0);
}

function bitsF64(s: string): number {
  scratch.setUint32(0, Number.parseInt(s.slice(2, 10), 16));
  scratch.setUint32(4, Number.parseInt(s.slice(10), 16));
  return scratch.getFloat64(0);
}

interface FloatConv {
  f32(v: unknown): unknown;
  f64(v: unknown): unknown;
}

const TO_BITS: FloatConv = { f32: (v) => f32Bits(v as number), f64: (v) => f64Bits(v as number) };
const FROM_BITS: FloatConv = { f32: (v) => bitsF32(v as string), f64: (v) => bitsF64(v as string) };

function convElem(ast: SchemaAst, t: ElemType, v: unknown, conv: FloatConv): unknown {
  if (t.kind === "struct") return convFields(ast, ast.structs.get(t.name)?.fields ?? [], v as Record<string, unknown>, conv);
  if (t.kind === "prim" && t.prim === "f32") return conv.f32(v);
  if (t.kind === "prim" && t.prim === "f64") return conv.f64(v);
  return v;
}

function convFields(ast: SchemaAst, fields: readonly FieldDef[], v: Record<string, unknown>, conv: FloatConv): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const x = v[f.name];
    if (x === undefined) continue;
    const t = f.type;
    out[f.name] = t.kind === "array" ? (x as unknown[]).map((e) => convElem(ast, t.of, e, conv)) : convElem(ast, t, x, conv);
  }
  return out;
}

function packetFields(ast: SchemaAst, packet: string): readonly FieldDef[] {
  const p = ast.packets.find((x) => x.name === packet);
  if (p === undefined) throw new Error(`golden: unknown packet ${packet}`);
  return p.fields;
}

/** 페이로드(디코드 값) → 골든 표현(float = 비트 문자열). */
export function toGoldenPayload(ast: SchemaAst, packet: string, value: Record<string, unknown>): Record<string, unknown> {
  return convFields(ast, packetFields(ast, packet), value, TO_BITS);
}

/** 골든 표현 → 페이로드(TS 코덱 입력 모양 — f32는 f64로 넓힌 값). */
export function fromGoldenPayload(ast: SchemaAst, packet: string, value: Record<string, unknown>): Record<string, unknown> {
  return convFields(ast, packetFields(ast, packet), value, FROM_BITS);
}

// ── 사례 생성 ──

const toHex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
const fromHex = (h: string): Uint8Array => new Uint8Array(Buffer.from(h, "hex"));

/** FNV-1a 32비트 — 패킷 이름에서 시드를 유도(스키마에 패킷이 늘어도 기존 패킷의 사례가 흔들리지 않게). */
function seedOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** 사례 모음 — 이름·hex 중복을 막고 refCodec 결과를 사례로 바꾼다. */
class CaseSink {
  readonly cases: GoldenCase[] = [];
  private readonly names = new Set<string>();
  private readonly hexes = new Set<string>();

  constructor(
    private readonly ast: SchemaAst,
    private readonly label: SchemaLabel,
  ) {}

  /** hex를 디코드해 사례로 넣는다(같은 패킷의 같은 hex는 한 번). 결과 사유(또는 "ok")를 돌려준다. */
  add(p: PacketDef, name: string, hex: string): RefWireError | "ok" {
    const unit = p.bodyOf ?? p.name;
    const d = refDecode(this.ast, unit, fromHex(hex));
    const key = `${p.name}:${hex}`;
    const full = `${p.name}/${name}`;
    if (this.names.has(full)) throw new Error(`golden(${this.label}): 사례 이름 중복 ${full}`);
    if (this.hexes.has(key)) return d.ok ? "ok" : d.error;
    this.names.add(full);
    this.hexes.add(key);
    const base = { name: full, packet: p.name, id: p.id, hex };
    if (!d.ok) {
      this.cases.push({ ...base, error: d.error });
      return d.error;
    }
    // 유효 본문은 정규형이어야 한다(인코드 방향 시험의 전제) — 재인코드가 같은 바이트.
    if (toHex(refEncode(this.ast, unit, d.value)) !== hex) throw new Error(`golden(${this.label}): ${full} 비정규 유효 본문`);
    this.cases.push({ ...base, payload: toGoldenPayload(this.ast, p.name, d.value) });
    return "ok";
  }
}

function randomBodies(ast: SchemaAst, p: PacketDef, r: () => number): string[] {
  const unit = p.bodyOf ?? p.name;
  const modes: GenOptions[] = [{ optional: "none" }, { optional: "all" }];
  if (p.bodyOf === undefined) modes.push({}, {}, {}, {});
  return modes.map((m) => toHex(refEncode(ast, unit, randPayload(ast, unit, r, { ...m, arrayCap: ARRAY_CAP }))));
}

/** 작은 바탕 본문 — SMALL_BODY 이하 중 가장 긴 것(없으면 가장 짧은 것). */
function smallBases(bodies: readonly string[]): string[] {
  const small = bodies.filter((h) => h.length / 2 <= SMALL_BODY);
  if (small.length > 0) return small;
  return [[...bodies].sort((a, b) => a.length - b.length)[0] ?? ""];
}

/**
 * 잘림 길이 — 바탕이 2 × SMALL_BODY 이하면 전 길이, 넘으면(작은 바탕이 없어 가장 짧은 본문으로 폴백한 경우) 앞·뒤 SMALL_BODY 바이트만.
 * 가운데 위치는 대부분 긴 문자열 안이라 같은 디코더 경로를 되풀이하면서 골든을 O(n²)으로 키운다(B5④b QUEST_LIST 610 B — 538 KB).
 * 2 × SMALL_BODY 이하 바탕은 두 구간이 전 길이를 덮어 사례가 종전과 같다.
 */
function truncLengths(n: number): number[] {
  return Array.from({ length: n }, (_, len) => len).filter((len) => len < SMALL_BODY || len >= n - SMALL_BODY);
}

function packetCases(sink: CaseSink, ast: SchemaAst, p: PacketDef, label: SchemaLabel): void {
  const r = rng(seedOf(`${label}:${p.name}`));
  const bodies = randomBodies(ast, p, r);
  bodies.forEach((h, i) => sink.add(p, `valid/${i}`, h));
  sink.add(p, "trailing", `${bodies[0] ?? ""}00`);
  const bases = smallBases(bodies);
  if (p.bodyOf === undefined) {
    const full = [...bases].sort((a, b) => b.length - a.length)[0] ?? "";
    for (const len of truncLengths(full.length / 2)) {
      if (sink.add(p, `trunc/${len}`, full.slice(0, 2 * len)) === "ok") throw new Error(`golden(${label}): ${p.name} 잘린 본문이 유효`);
    }
  }
  const n = p.bodyOf === undefined ? MUTATIONS : BODYOF_MUTATIONS;
  for (let i = 0; i < n; i++) sink.add(p, `mut/${i}`, toHex(mutate(fromHex(bases[i % bases.length] ?? ""), r)));
}

function craftedInto(sink: CaseSink, ast: SchemaAst, label: SchemaLabel): void {
  for (const cr of craftedCases(label)) {
    const p = ast.packets.find((x) => x.name === cr.packet);
    if (p === undefined) throw new Error(`golden(${label}): 손 사례 ${cr.packet}/${cr.label} — 없는 패킷`);
    const got = sink.add(p, `craft/${cr.label}`, cr.hex);
    if (got !== cr.expect) throw new Error(`golden(${label}): 손 사례 ${cr.packet}/${cr.label} 의도 ${cr.expect} ≠ refCodec ${got}`);
  }
}

function packetTable(ast: SchemaAst): GoldenPacket[] {
  return ast.packets.map((p) => ({ name: p.name, id: p.id, payloadType: payloadTypeName(p.name) }));
}

function schemaGolden(ast: SchemaAst, label: SchemaLabel): GoldenSchema {
  const sink = new CaseSink(ast, label);
  craftedInto(sink, ast, label);
  for (const p of ast.packets) packetCases(sink, ast, p, label);
  return { packets: packetTable(ast), cases: sink.cases };
}

// ── UTF-8 판정 벡터 ──

const UTF8_TARGETED = [
  "", "48656c6c6f", "c280", "dfbf", "c080", "c1bf", "e0a080", "e08080", "e0bf", "eda080", "edbfbf", "ed9fbf", "efbfbf", "efbbbf",
  "f0908080", "f0808080", "f48fbfbf", "f4908080", "f5808080", "f8888080", "80", "bf", "e0a0", "f09080", "c2", "c241", "ff", "fe", "c0",
];

/** 리드 바이트 구간(구조를 고루 맞히려고 구간을 먼저 고른다). */
const UTF8_POOLS: readonly (readonly [number, number])[] = [
  [0x00, 0x7f], [0x80, 0x8f], [0x90, 0x9f], [0xa0, 0xbf], [0xc0, 0xc1], [0xc2, 0xdf], [0xe0, 0xe0], [0xe1, 0xec],
  [0xed, 0xed], [0xee, 0xef], [0xf0, 0xf0], [0xf1, 0xf3], [0xf4, 0xf4], [0xf5, 0xff],
];

const fatalUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function whatwgValid(hex: string): boolean {
  try {
    fatalUtf8.decode(fromHex(hex));
    return true;
  } catch {
    return false;
  }
}

/** 스칼라 값 구간(서로게이트 제외) — 정형 열의 재료. */
const SCALAR_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x7f], [0x80, 0x7ff], [0x800, 0xd7ff], [0xe000, 0xffff], [0x10000, 0x10ffff],
];

const utf8Encoder = new TextEncoder();

function pick(r: () => number, ranges: readonly (readonly [number, number])[]): number {
  const [lo, hi] = ranges[Math.floor(r() * ranges.length)]!;
  return lo + Math.floor(r() * (hi - lo + 1));
}

/** 무작위 바이트 열 — 1/3 구간별 무작위 바이트, 1/3 정형 열, 1/3 정형 열의 한 바이트를 무작위 구간 바이트로 바꿈. */
function randomUtf8Bytes(r: () => number): Uint8Array {
  const mode = Math.floor(r() * 3);
  if (mode === 0) return Uint8Array.from({ length: 1 + Math.floor(r() * 6) }, () => pick(r, UTF8_POOLS));
  const text = String.fromCodePoint(...Array.from({ length: 1 + Math.floor(r() * 3) }, () => pick(r, SCALAR_RANGES)));
  const bytes = utf8Encoder.encode(text);
  if (mode === 2) bytes[Math.floor(r() * bytes.length)] = pick(r, UTF8_POOLS);
  return bytes;
}

function utf8Vectors(): [string, boolean][] {
  const r = rng(seedOf("utf8"));
  const seen = new Set<string>(UTF8_TARGETED);
  const out = [...UTF8_TARGETED];
  for (let i = 0; i < UTF8_RANDOM * 4 && out.length < UTF8_TARGETED.length + UTF8_RANDOM; i++) {
    const hex = toHex(randomUtf8Bytes(r));
    if (seen.has(hex)) continue;
    seen.add(hex);
    out.push(hex);
  }
  return out.map((h) => [h, whatwgValid(h)]);
}

// ── 파일 ──

// 파일을 ASCII로 두므로 머리 문구는 영어로 쓴다.
const GENERATED = "AUTO-GENERATED - do not edit. Source: tools/codegen/golden.ts (refCodec) + goldenCrafted.ts + fixture.ts. Run `bun run gen` from tools/codegen/.";
const DOC =
  "Cross-language binary body codec golden (shared/protocol.md section 2). A case with payload is valid: decode(hex) == payload and encode(payload) == hex. " +
  "A case with error must fail decode with that first-violation reason. Payload floats are IEEE bit strings (0x + 8 hex digits for f32, 16 for f64), " +
  "enums are value names, an absent optional field has no key. utf8 rows: [hex, valid as strict UTF-8].";

function assertCoverage(g: GoldenSchema, label: SchemaLabel, need: readonly RefWireError[]): void {
  const seen = new Set(g.cases.flatMap((c) => (isValidCase(c) ? [] : [c.error])));
  const missing = need.filter((e) => !seen.has(e));
  if (missing.length > 0) throw new Error(`golden(${label}): 오류 사유 미포함 ${missing.join(", ")}`);
}

export function buildGolden(real: SchemaAst, fixture: SchemaAst): GoldenFile {
  const schemas = { real: schemaGolden(real, "real"), fixture: schemaGolden(fixture, "fixture") };
  assertCoverage(schemas.fixture, "fixture", REF_WIRE_ERRORS);
  assertCoverage(schemas.real, "real", ["Truncated", "Trailing", "OverMax", "NonFinite"]);
  const errors = Object.fromEntries(REF_WIRE_ERRORS.map((n, i) => [n, i + 1]));
  return { _generated: GENERATED, _doc: DOC, errors, utf8: utf8Vectors(), schemas };
}

/** JSON 한 값 — 비ASCII는 \uXXXX(파일을 ASCII로 — 인코딩·BOM 처리 차이 제거). */
function ascii(v: unknown): string {
  return JSON.stringify(v).replace(/[\u007f-\uffff]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function rows(items: readonly unknown[], pad: string): string {
  return items.map((x) => `${pad}${ascii(x)}`).join(",\n");
}

function schemaText(s: GoldenSchema): string {
  return ["{", '      "packets": [', rows(s.packets, "        "), "      ],", '      "cases": [', rows(s.cases, "        "), "      ]", "    }"].join("\n");
}

/** 한 줄에 사례 하나 — 재생성 diff가 사례 단위로 읽히게. */
export function serializeGolden(g: GoldenFile): string {
  return [
    "{",
    `  "_generated": ${ascii(g._generated)},`,
    `  "_doc": ${ascii(g._doc)},`,
    `  "errors": ${ascii(g.errors)},`,
    '  "utf8": [',
    rows(g.utf8, "    "),
    "  ],",
    '  "schemas": {',
    `    "real": ${schemaText(g.schemas.real)},`,
    `    "fixture": ${schemaText(g.schemas.fixture)}`,
    "  }",
    "}",
    "",
  ].join("\n");
}
