// 코드젠 v2 스키마 — shared/schema/packets.json 원본을 검증해 해석된 AST(emit·layout·refCodec·lock 공용)로 바꾼다.
//
// 검증은 손으로 쓴다(코드젠은 의존성 없이 돈다). 위반은 모두 모아 SchemaError 하나로 던진다 — 편집자가 한 번에 고치게.
// 규칙: 이름(패킷 SCREAMING_SNAKE·struct/enum PascalCase·필드/enum 값 camelCase)·id 유일/1..65535(0은 B1 구버전 프레임 감지에 예약)·
// 방향·타입 참조 해석·enum 코드 유일/repr 범위·재귀 struct 금지(DFS)·미사용 struct 금지·max/min/of/ofMax 규칙·bodyOf 대상 실재(연쇄 불가)·
// 바이너리 규칙(string·array max 필수·optional ≤ 32·최악 본문 ≤ 65535). 모든 패킷 본문은 binary다(이진 전환 B6 — JSON 본문·자율 JSON 패킷 폐지):
// `defaultEncoding`·패킷 `encoding`·`freeform` 키는 폐지 사유와 함께 거부한다. 와이어 규칙 정본은 shared/protocol.md §2, 결정은 docs/adr/0003.
// `_`·`$`로 시작하는 키는 주석(passthrough) — 그 밖의 모르는 키는 오타로 보고 거부한다.

import { MAX_OPTIONAL_FIELDS, MAX_WIRE_LENGTH, elemFixedSize, optionalCount, worstCaseSize } from "./layout";
import { payloadTypeName, toPascalCase } from "./names";

export type IntType = "u8" | "u16" | "u32" | "i8" | "i16" | "i32";
export type FloatType = "f32" | "f64";
export type PrimType = IntType | FloatType | "bool" | "string";
export type EnumRepr = "u8" | "u16" | "u32";
export type Direction = "C2S" | "S2C";

export const INT_RANGE: Readonly<Record<IntType, readonly [number, number]>> = {
  u8: [0, 0xff],
  u16: [0, 0xffff],
  u32: [0, 0xffffffff],
  i8: [-0x80, 0x7f],
  i16: [-0x8000, 0x7fff],
  i32: [-0x80000000, 0x7fffffff],
};

const PRIM_TYPES: ReadonlySet<string> = new Set<PrimType>(["u8", "u16", "u32", "i8", "i16", "i32", "f32", "f64", "bool", "string"]);
const ENUM_REPRS: ReadonlySet<string> = new Set<EnumRepr>(["u8", "u16", "u32"]);

export type ElemType =
  | { readonly kind: "prim"; readonly prim: PrimType }
  | { readonly kind: "struct"; readonly name: string }
  | { readonly kind: "enum"; readonly name: string };

export type FieldType = ElemType | { readonly kind: "array"; readonly of: ElemType };

export interface FieldDef {
  readonly name: string;
  readonly type: FieldType;
  readonly optional: boolean;
  /** string: UTF-8 바이트 상한, array: 원소 수 상한. */
  readonly max?: number;
  /** array: 원소 수 하한. */
  readonly min?: number;
  /** array<string>: 원소 string의 UTF-8 바이트 상한. */
  readonly ofMax?: number;
}

export interface StructDef {
  readonly name: string;
  readonly fields: readonly FieldDef[];
}

export interface EnumDef {
  readonly name: string;
  readonly repr: EnumRepr;
  /** [값 이름, 코드] — 선언 순서. */
  readonly values: readonly (readonly [string, number])[];
}

export interface PacketDef {
  readonly name: string;
  readonly id: number;
  readonly direction: Direction;
  /** 실효 필드 — bodyOf면 대상의 필드. */
  readonly fields: readonly FieldDef[];
  readonly bodyOf?: string;
  readonly frozen: boolean;
}

export interface TypeTable {
  readonly structs: ReadonlyMap<string, StructDef>;
  readonly enums: ReadonlyMap<string, EnumDef>;
}

export interface SchemaAst extends TypeTable {
  readonly protoVersion: number;
  /** 프레임 헤더 블록 — 주석 키(`_`) 제외 원본(lock의 header 해시 입력). */
  readonly header: Readonly<Record<string, unknown>>;
  /** 선언 순서. */
  readonly packets: readonly PacketDef[];
}

export class SchemaError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`packets.json 스키마 위반 ${issues.length}건:\n  - ${issues.join("\n  - ")}`);
    this.name = "SchemaError";
  }
}

const PACKET_NAME = /^[A-Z][A-Z0-9_]*$/;
const TYPE_NAME = /^[A-Z][A-Za-z0-9]*$/;
const CAMEL = /^[a-z][a-zA-Z0-9]*$/;
/** 산출물이 이미 쓰는 식별자 — struct·enum 이름으로 쓰면 TS/C# 산출물이 충돌한다. */
const RESERVED_TYPE_NAMES: ReadonlySet<string> = new Set([
  "Protocol",
  "PacketIds",
  "PacketId",
  "PayloadById",
  "PayloadOf",
  "S2CPacketId",
  "C2SPacketId",
  "UnionToIntersection",
  "BodyReader",
  "WireEncodeError",
  // C# 코덱 산출물(WireCodec.Generated.cs)이 한정 없이 쓰는 이름 — 같은 네임스페이스의 struct·enum이 가리면 컴파일 오류.
  "WireCodec",
  "WireReader",
  "WireWrite",
  "WireCheck",
  "WireError",
  "WireEncodeException",
  "WireUtf8",
  // C# 타입 산출물(Codec.Generated.cs)의 필드 상한 상수 class(B2b).
  "WireLimits",
  "Buffer",
  "Object",
  "Array",
  "String",
  "Number",
  "Boolean",
  "Map",
  "Set",
  "Body",
]);
/** 패킷 산출 함수 이름(size·write·read·decode + Pascal)이 코덱 디스패치(bodySize·writeBody·decodeBody)와 겹치는 Pascal. */
const RESERVED_FN_BASES: ReadonlySet<string> = new Set(["Body"]);

const TOP_KEYS: ReadonlySet<string> = new Set(["version", "protoVersion", "header", "structs", "enums", "packets"]);
const PACKET_KEYS: ReadonlySet<string> = new Set(["id", "direction", "fields", "bodyOf", "frozen"]);
const FIELD_KEYS: ReadonlySet<string> = new Set(["name", "type", "max", "min", "of", "ofMax", "optional"]);
const STRUCT_KEYS: ReadonlySet<string> = new Set(["fields"]);
const ENUM_KEYS: ReadonlySet<string> = new Set(["repr", "values"]);
const NO_RETIRED: ReadonlyMap<string, string> = new Map();
/** 이진 전환 B6에서 폐지된 키 — "모르는 키" 대신 사유를 말한다(값과 무관하게 거부 — `"binary"`도 쓰지 않는다). */
const RETIRED_TOP_KEYS: ReadonlyMap<string, string> = new Map([
  ["defaultEncoding", "폐지(B6) — 패킷 본문은 전부 binary다(JSON 본문 경로 없음)"],
]);
const RETIRED_PACKET_KEYS: ReadonlyMap<string, string> = new Map([
  ["encoding", "폐지(B6) — 패킷 본문은 전부 binary다(\"json\" 인코딩 없음 — \"binary\"도 적지 않는다)"],
  ["freeform", "폐지(B6) — 자율 JSON 패킷 없음(필드를 정의할 것)"],
]);

type Raw = Record<string, unknown>;

function isRecord(v: unknown): v is Raw {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isComment(key: string): boolean {
  return key.startsWith("_") || key.startsWith("$");
}

function checkKeys(raw: Raw, allowed: ReadonlySet<string>, path: string, issues: string[], retired = NO_RETIRED): void {
  for (const k of Object.keys(raw)) {
    if (allowed.has(k) || isComment(k)) continue;
    const why = retired.get(k);
    issues.push(why === undefined ? `${path}: 모르는 키 "${k}"` : `${path}.${k}: ${why}`);
  }
}

function isIntIn(v: unknown, lo: number, hi: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
}

/** 이름 집합 — 필드 타입 해석용. */
interface TypeNames {
  readonly structs: ReadonlySet<string>;
  readonly enums: ReadonlySet<string>;
}

/** packets.json 원본(JSON.parse 결과) → 검증된 AST. 위반이 하나라도 있으면 SchemaError. */
export function parseSchema(raw: unknown): SchemaAst {
  const issues: string[] = [];
  if (!isRecord(raw)) throw new SchemaError(["스키마 루트는 객체여야 한다"]);
  checkKeys(raw, TOP_KEYS, "schema", issues, RETIRED_TOP_KEYS);
  const top = parseTop(raw, issues);
  const structsRaw = recordOr(raw["structs"], "structs", issues);
  const enumsRaw = recordOr(raw["enums"], "enums", issues);
  const packetsRaw = recordOr(raw["packets"], "packets", issues);
  const names: TypeNames = { structs: new Set(Object.keys(structsRaw)), enums: new Set(Object.keys(enumsRaw)) };
  const enums = parseEnums(enumsRaw, issues);
  const structs = parseStructs(structsRaw, names, issues);
  const declared = parsePackets(packetsRaw, names, issues);
  checkTypeNames(names, Object.keys(packetsRaw), issues);
  checkCsMemberNames(structs, declared, issues);
  checkRecursion(structs, issues);
  const packets = resolvePackets(declared, issues);
  const ast: SchemaAst = { ...top, structs, enums, packets };
  if (issues.length === 0) checkStructUse(ast, issues);
  if (issues.length === 0) checkBinaryRules(ast, issues);
  if (issues.length > 0) throw new SchemaError(issues);
  return ast;
}

function recordOr(v: unknown, path: string, issues: string[]): Raw {
  if (v === undefined) return {};
  if (isRecord(v)) return v;
  issues.push(`${path}: 객체여야 한다`);
  return {};
}

function parseTop(raw: Raw, issues: string[]): Pick<SchemaAst, "protoVersion" | "header"> {
  if (raw["version"] !== 2) issues.push(`version: 2만 지원 (got ${String(raw["version"])})`);
  // HELLO.clientProtoVer는 i32이고 C#은 const int로 생성한다 — i32 양수 범위로 제한.
  const pv = raw["protoVersion"];
  if (!isIntIn(pv, 1, 0x7fffffff)) issues.push(`protoVersion: 1..2^31-1 정수 (got ${String(pv)})`);
  const header: Raw = {};
  const h = raw["header"];
  if (!isRecord(h)) issues.push("header: 객체여야 한다");
  else for (const [k, v] of Object.entries(h)) if (!isComment(k)) header[k] = v;
  return { protoVersion: isIntIn(pv, 1, 0x7fffffff) ? pv : 1, header };
}

function parseEnums(raw: Raw, issues: string[]): Map<string, EnumDef> {
  const out = new Map<string, EnumDef>();
  for (const [name, def] of Object.entries(raw)) {
    const path = `enums.${name}`;
    if (!isRecord(def)) {
      issues.push(`${path}: 객체여야 한다`);
      continue;
    }
    checkKeys(def, ENUM_KEYS, path, issues);
    const repr = def["repr"];
    if (typeof repr !== "string" || !ENUM_REPRS.has(repr)) {
      issues.push(`${path}.repr: "u8" | "u16" | "u32" (got ${String(repr)})`);
      continue;
    }
    const values = parseEnumValues(def["values"], repr as EnumRepr, path, issues);
    if (values !== null) out.set(name, { name, repr: repr as EnumRepr, values });
  }
  return out;
}

function parseEnumValues(raw: unknown, repr: EnumRepr, path: string, issues: string[]): [string, number][] | null {
  if (!isRecord(raw) || Object.keys(raw).length === 0) {
    issues.push(`${path}.values: 값이 1개 이상인 객체여야 한다`);
    return null;
  }
  const [lo, hi] = INT_RANGE[repr];
  const seen = new Map<number, string>();
  const values: [string, number][] = [];
  for (const [vName, code] of Object.entries(raw)) {
    if (!CAMEL.test(vName)) issues.push(`${path}.values.${vName}: 값 이름은 camelCase`);
    if (!isIntIn(code, lo, hi)) {
      issues.push(`${path}.values.${vName}: 코드는 ${repr} 범위 정수 (got ${String(code)})`);
      continue;
    }
    const dup = seen.get(code);
    if (dup !== undefined) issues.push(`${path}.values: 코드 ${code} 중복 (${dup}, ${vName})`);
    seen.set(code, vName);
    values.push([vName, code]);
  }
  return values;
}

function parseStructs(raw: Raw, names: TypeNames, issues: string[]): Map<string, StructDef> {
  const out = new Map<string, StructDef>();
  for (const [name, def] of Object.entries(raw)) {
    const path = `structs.${name}`;
    if (!isRecord(def)) {
      issues.push(`${path}: 객체여야 한다`);
      continue;
    }
    checkKeys(def, STRUCT_KEYS, path, issues);
    if (!Array.isArray(def["fields"])) {
      issues.push(`${path}.fields: 배열이어야 한다`);
      continue;
    }
    out.set(name, { name, fields: parseFields(def["fields"], path, names, issues) });
  }
  return out;
}

function parseFields(raw: readonly unknown[], path: string, names: TypeNames, issues: string[]): FieldDef[] {
  const out: FieldDef[] = [];
  const seen = new Set<string>();
  raw.forEach((f, i) => {
    const def = parseField(f, `${path}.fields[${i}]`, names, issues);
    if (def === null) return;
    if (seen.has(def.name)) issues.push(`${path}: 필드 이름 중복 "${def.name}"`);
    seen.add(def.name);
    out.push(def);
  });
  return out;
}

function parseField(raw: unknown, path: string, names: TypeNames, issues: string[]): FieldDef | null {
  if (!isRecord(raw)) {
    issues.push(`${path}: 필드는 객체여야 한다`);
    return null;
  }
  checkKeys(raw, FIELD_KEYS, path, issues);
  const name = raw["name"];
  if (typeof name !== "string" || !CAMEL.test(name)) {
    issues.push(`${path}: 필드 이름은 camelCase 문자열 (got ${String(name)})`);
    return null;
  }
  const at = `${path}(${name})`;
  const type = parseFieldType(raw, at, names, issues);
  if (type === null) return null;
  const opt = raw["optional"];
  if (opt !== undefined && typeof opt !== "boolean") issues.push(`${at}.optional: boolean`);
  return { name, type, optional: opt === true, ...parseBounds(raw, type, at, issues) };
}

function resolveElem(t: string, names: TypeNames): ElemType | null {
  if (PRIM_TYPES.has(t)) return { kind: "prim", prim: t as PrimType };
  if (names.structs.has(t)) return { kind: "struct", name: t };
  if (names.enums.has(t)) return { kind: "enum", name: t };
  return null;
}

function parseFieldType(raw: Raw, at: string, names: TypeNames, issues: string[]): FieldType | null {
  const t = raw["type"];
  if (typeof t !== "string") {
    issues.push(`${at}.type: 문자열이어야 한다`);
    return null;
  }
  const of = raw["of"];
  if (t !== "array") {
    if (of !== undefined) issues.push(`${at}.of: array 전용 속성`);
    const elem = resolveElem(t, names);
    if (elem === null) issues.push(`${at}.type: 모르는 타입 "${t}"`);
    return elem;
  }
  if (typeof of !== "string") {
    issues.push(`${at}.of: array는 원소 타입 "of"가 필요하다`);
    return null;
  }
  if (of === "array") {
    issues.push(`${at}.of: 중첩 array 금지`);
    return null;
  }
  const elem = resolveElem(of, names);
  if (elem === null) {
    issues.push(`${at}.of: 모르는 원소 타입 "${of}"`);
    return null;
  }
  return { kind: "array", of: elem };
}

type Bounds = Pick<FieldDef, "max" | "min" | "ofMax">;

function parseBounds(raw: Raw, type: FieldType, at: string, issues: string[]): Bounds {
  const out: { max?: number; min?: number; ofMax?: number } = {};
  const isArray = type.kind === "array";
  const isString = type.kind === "prim" && type.prim === "string";
  const ofString = type.kind === "array" && type.of.kind === "prim" && type.of.prim === "string";
  const bound = (key: "max" | "min" | "ofMax", allowed: boolean, why: string): void => {
    const v = raw[key];
    if (v === undefined) return;
    if (!allowed) issues.push(`${at}.${key}: ${why}`);
    else if (!isIntIn(v, 0, MAX_WIRE_LENGTH)) issues.push(`${at}.${key}: 0..${MAX_WIRE_LENGTH} 정수 (got ${String(v)})`);
    else out[key] = v;
  };
  bound("max", isArray || isString, "string·array 전용 속성");
  bound("min", isArray, "array 전용 속성");
  bound("ofMax", ofString, "array<string> 전용 속성");
  if (ofString && raw["ofMax"] === undefined) issues.push(`${at}.ofMax: array<string>은 원소 상한 ofMax가 필요하다`);
  if (out.min !== undefined && out.max !== undefined && out.min > out.max) issues.push(`${at}: min(${out.min}) > max(${out.max})`);
  return out;
}

/** 선언된 패킷(bodyOf 해석 전). */
interface DeclaredPacket {
  readonly name: string;
  readonly id: number;
  readonly direction: Direction;
  readonly fields: readonly FieldDef[];
  readonly hasFields: boolean;
  readonly bodyOf?: string;
  readonly frozen: boolean;
}

function parsePackets(raw: Raw, names: TypeNames, issues: string[]): DeclaredPacket[] {
  const out: DeclaredPacket[] = [];
  const seenIds = new Map<number, string>();
  for (const [name, def] of Object.entries(raw)) {
    const p = parsePacket(name, def, names, issues);
    if (p === null) continue;
    const dup = seenIds.get(p.id);
    if (dup !== undefined) issues.push(`packets: id 중복 ${name} vs ${dup} (id=${p.id})`);
    seenIds.set(p.id, name);
    out.push(p);
  }
  return out;
}

function parsePacket(name: string, def: unknown, names: TypeNames, issues: string[]): DeclaredPacket | null {
  const path = `packets.${name}`;
  if (!PACKET_NAME.test(name)) issues.push(`${path}: 패킷명은 SCREAMING_SNAKE_CASE`);
  if (!isRecord(def)) {
    issues.push(`${path}: 객체여야 한다`);
    return null;
  }
  checkKeys(def, PACKET_KEYS, path, issues, RETIRED_PACKET_KEYS);
  const { id, direction, bodyOf, frozen } = def;
  if (!isIntIn(id, 1, 0xffff)) issues.push(`${path}.id: 1..65535 정수 (0은 예약) (got ${String(id)})`);
  if (direction !== "C2S" && direction !== "S2C") issues.push(`${path}.direction: "C2S" | "S2C"`);
  if (bodyOf !== undefined && typeof bodyOf !== "string") issues.push(`${path}.bodyOf: 패킷명 문자열`);
  if (frozen !== undefined && typeof frozen !== "boolean") issues.push(`${path}.frozen: boolean`);
  const rawFields = def["fields"];
  if (rawFields !== undefined && !Array.isArray(rawFields)) issues.push(`${path}.fields: 배열이어야 한다`);
  const fields = Array.isArray(rawFields) ? parseFields(rawFields, path, names, issues) : [];
  if (!isIntIn(id, 1, 0xffff) || (direction !== "C2S" && direction !== "S2C")) return null;
  return {
    name,
    id,
    direction,
    fields,
    hasFields: Array.isArray(rawFields) && rawFields.length > 0,
    ...(typeof bodyOf === "string" ? { bodyOf } : {}),
    frozen: frozen === true,
  };
}

function checkTypeNames(names: TypeNames, packetNames: readonly string[], issues: string[]): void {
  const pascalPackets = new Map(packetNames.map((p) => [toPascalCase(p), p]));
  const check = (name: string, kind: string): void => {
    if (!TYPE_NAME.test(name)) issues.push(`${kind}s.${name}: 이름은 PascalCase`);
    if (RESERVED_TYPE_NAMES.has(name)) issues.push(`${kind}s.${name}: 산출물 예약 식별자`);
    if (name.endsWith("Payload")) issues.push(`${kind}s.${name}: "Payload"로 끝나는 이름은 패킷 페이로드 타입(<패킷>Payload)과 충돌`);
    const clash = pascalPackets.get(name);
    if (clash !== undefined) issues.push(`${kind}s.${name}: 패킷 ${clash}의 산출물 이름과 충돌`);
  };
  for (const p of packetNames) {
    if (RESERVED_FN_BASES.has(toPascalCase(p))) issues.push(`packets.${p}: 산출 코덱 함수가 디스패치(writeBody·decodeBody)와 충돌`);
  }
  for (const s of names.structs) check(s, "struct");
  for (const e of names.enums) {
    check(e, "enum");
    if (names.structs.has(e)) issues.push(`enums.${e}: 같은 이름의 struct가 있다`);
  }
}

/** C#은 멤버 이름이 감싼 class 이름과 같으면 CS0542 — 필드 PascalCase ≠ 소유 타입명(struct명·<패킷>Payload). */
function checkCsMemberNames(structs: ReadonlyMap<string, StructDef>, packets: readonly DeclaredPacket[], issues: string[]): void {
  const owners: [string, string, readonly FieldDef[]][] = [
    ...[...structs.values()].map((x): [string, string, readonly FieldDef[]] => [`structs.${x.name}`, x.name, x.fields]),
    ...packets.map((x): [string, string, readonly FieldDef[]] => [`packets.${x.name}`, payloadTypeName(x.name), x.fields]),
  ];
  for (const [path, owner, fields] of owners) {
    for (const f of fields) if (toPascalCase(f.name) === owner) issues.push(`${path}.${f.name}: C# 멤버명이 소유 타입명 ${owner}와 같다(CS0542)`);
  }
}

/** struct가 자기 자신을 (직간접·array 경유로) 담으면 위반 — 최악 크기·디코드가 끝나지 않는다. */
function checkRecursion(structs: ReadonlyMap<string, StructDef>, issues: string[]): void {
  const state = new Map<string, "visiting" | "done">();
  const visit = (name: string, trail: readonly string[]): void => {
    const st = state.get(name);
    if (st === "done") return;
    if (st === "visiting") {
      issues.push(`structs: 재귀 struct ${[...trail.slice(trail.indexOf(name)), name].join(" → ")}`);
      return;
    }
    state.set(name, "visiting");
    for (const dep of structDeps(structs.get(name))) if (structs.has(dep)) visit(dep, [...trail, name]);
    state.set(name, "done");
  };
  for (const name of structs.keys()) visit(name, []);
}

function elemOf(t: FieldType): ElemType {
  return t.kind === "array" ? t.of : t;
}

function structDeps(s: StructDef | undefined): string[] {
  if (s === undefined) return [];
  const out: string[] = [];
  for (const f of s.fields) {
    const e = elemOf(f.type);
    if (e.kind === "struct") out.push(e.name);
  }
  return out;
}

function resolvePackets(declared: readonly DeclaredPacket[], issues: string[]): PacketDef[] {
  const byName = new Map(declared.map((p) => [p.name, p]));
  return declared.map((p) => {
    const plain = resolvePlain(p);
    if (p.bodyOf === undefined) return plain;
    const path = `packets.${p.name}`;
    const target = byName.get(p.bodyOf);
    if (target === undefined) issues.push(`${path}.bodyOf: 없는 패킷 "${p.bodyOf}"`);
    else if (target.bodyOf !== undefined) issues.push(`${path}.bodyOf: 대상 ${target.name}도 bodyOf다(연쇄 금지)`);
    if (p.hasFields) issues.push(`${path}: bodyOf 패킷은 fields를 선언하지 않는다(대상에서 상속)`);
    return target !== undefined && target.bodyOf === undefined ? { ...plain, fields: target.fields } : plain;
  });
}

function resolvePlain(p: DeclaredPacket): PacketDef {
  return {
    name: p.name,
    id: p.id,
    direction: p.direction,
    fields: p.fields,
    ...(p.bodyOf === undefined ? {} : { bodyOf: p.bodyOf }),
    frozen: p.frozen,
  };
}

/** 패킷이 (직간접으로) 쓰는 struct 이름 — 선언 순서가 아니라 첫 도달 순서(코덱 단위 순서 — units.ts). */
export function packetStructs(ast: SchemaAst): string[] {
  const seen = new Set<string>();
  const walk = (fields: readonly FieldDef[]): void => {
    for (const f of fields) {
      const e = elemOf(f.type);
      if (e.kind !== "struct" || seen.has(e.name)) continue;
      seen.add(e.name);
      const s = ast.structs.get(e.name);
      if (s !== undefined) walk(s.fields);
    }
  };
  for (const p of ast.packets) walk(p.fields);
  return [...seen];
}

/**
 * 어느 패킷도 (직간접으로) 쓰지 않는 struct는 위반 — 코덱 단위가 없어 바이너리 규칙(max 등)을 받지 않은 채 타입만 산출된다
 * (B6 전의 JSON 전용 struct 면제를 대신하는 규칙).
 */
function checkStructUse(ast: SchemaAst, issues: string[]): void {
  const used = new Set(packetStructs(ast));
  for (const name of ast.structs.keys()) if (!used.has(name)) issues.push(`structs.${name}: 어느 패킷도 쓰지 않는다 — 미사용 struct 금지`);
}

/** 모든 패킷·struct의 string/array는 max 필수, optional ≤ 32, 최악 본문 ≤ 65535(bodyOf는 대상이 받는다). */
function checkBinaryRules(ast: SchemaAst, issues: string[]): void {
  const lists: [string, readonly FieldDef[]][] = [];
  for (const p of ast.packets) if (p.bodyOf === undefined) lists.push([`packets.${p.name}`, p.fields]);
  for (const s of packetStructs(ast)) lists.push([`structs.${s}`, ast.structs.get(s)?.fields ?? []]);
  for (const [path, fields] of lists) {
    if (optionalCount(fields) > MAX_OPTIONAL_FIELDS) issues.push(`${path}: optional 필드는 ${MAX_OPTIONAL_FIELDS}개 이하`);
    for (const f of fields) {
      const needsMax = f.type.kind === "array" || (f.type.kind === "prim" && f.type.prim === "string");
      if (needsMax && f.max === undefined) issues.push(`${path}.${f.name}: 바이너리 string·array는 max가 필요하다`);
      // 원소 0바이트(빈 struct) array는 2바이트 본문으로 원소 max개 할당을 일으킨다(디코더 증폭) — 금지.
      if (f.type.kind === "array" && elemFixedSize(ast, f.type.of) === 0) issues.push(`${path}.${f.name}: 원소 크기 0인 array 금지(빈 struct 원소)`);
    }
  }
  if (issues.length > 0) return;
  for (const p of ast.packets) {
    if (p.bodyOf !== undefined) continue;
    const worst = worstCaseSize(ast, p.fields);
    if (worst > MAX_WIRE_LENGTH) issues.push(`packets.${p.name}: 최악 본문 ${worst}B > ${MAX_WIRE_LENGTH}B`);
  }
}
