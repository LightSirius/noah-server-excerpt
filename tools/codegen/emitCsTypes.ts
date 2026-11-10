// C# 타입 산출물(client/Noah/Assets/Scripts/Net/Codec.Generated.cs) — Protocol.Version·PacketIds·WireLimits·enum·struct/페이로드 class.
// 바이너리 코덱(WireCodec.Generated.cs)은 emitCsCodec.ts가 같은 class를 읽고 쓴다. 표현: array = T[], enum = 명시 repr 정수 enum,
// optional = null(값 타입은 T?, string·array·struct는 null 참조 — 바이너리 presence 비트와 같은 뜻). bodyOf 패킷은 대상 페이로드 class를
// 상속한다(필드를 다시 선언하지 않는다 — 코덱이 대상 함수로 읽고 쓴다).

import { hexId, payloadTypeName, toPascalCase } from "./names";
import type { ElemType, EnumRepr, FieldDef, FieldType, PacketDef, PrimType, SchemaAst } from "./schema";
import { header } from "./emitTsTypes";

export interface CsEmitOptions {
  /** 네임스페이스(기본 MMORPG.Net.Generated — 픽스처 산출물은 시험 어셈블리 네임스페이스). */
  readonly namespace?: string;
  /** 머리의 스키마 원본 경로(기본 packets.json). */
  readonly source?: string;
}

export const CS_DEFAULT_NAMESPACE = "MMORPG.Net.Generated";

export const CS_PRIM: Readonly<Record<PrimType, string>> = {
  u8: "byte",
  u16: "ushort",
  u32: "uint",
  i8: "sbyte",
  i16: "short",
  i32: "int",
  f32: "float",
  f64: "double",
  bool: "bool",
  string: "string",
};

export const CS_REPR: Readonly<Record<EnumRepr, string>> = { u8: "byte", u16: "ushort", u32: "uint" };

export function csElem(t: ElemType): string {
  return t.kind === "prim" ? CS_PRIM[t.prim] : t.name;
}

/** C# 값 타입인가(optional이면 T?) — string·array·struct(class)는 참조 타입. */
export function isCsValueType(t: FieldType): boolean {
  if (t.kind === "array" || t.kind === "struct") return false;
  return t.kind === "enum" || t.prim !== "string";
}

function csField(f: FieldDef): string {
  const base = f.type.kind === "array" ? `${csElem(f.type.of)}[]` : csElem(f.type);
  const type = f.optional && isCsValueType(f.type) ? `${base}?` : base;
  return `        public ${type} ${toPascalCase(f.name)};`;
}

function csClass(name: string, fields: readonly FieldDef[]): string[] {
  return [`    public class ${name}`, "    {", ...fields.map(csField), "    }", ""];
}

function csPacketClass(p: PacketDef): string[] {
  if (p.bodyOf === undefined) return csClass(payloadTypeName(p.name), p.fields);
  return [`    public class ${payloadTypeName(p.name)} : ${payloadTypeName(p.bodyOf)}`, "    {", "    }", ""];
}

/**
 * WireLimits — 필드별 와이어 상한 상수(TS WIRE_LIMITS·<OWNER>_<FIELD>_MAX와 같은 값). 이름 = <소유자 Pascal><필드 Pascal>Max,
 * array<string> 원소 상한은 …ItemMax. 입력 UI(채팅 글자 수 등)가 손으로 숫자를 베끼지 않게 한다. 이름이 겹치면 산출 전에 throw.
 */
function csLimits(ast: SchemaAst): string[] {
  const owners: [string, readonly FieldDef[]][] = [
    ...[...ast.structs.values()].map((x): [string, readonly FieldDef[]] => [x.name, x.fields]),
    ...ast.packets.filter((p) => p.bodyOf === undefined).map((p): [string, readonly FieldDef[]] => [toPascalCase(p.name), p.fields]),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (name: string, value: number): void => {
    if (seen.has(name)) throw new Error(`codegen: C# WireLimits 상수명 충돌 ${name} — struct·패킷·필드 이름을 바꿀 것`);
    seen.add(name);
    out.push(`        public const int ${name} = ${value};`);
  };
  for (const [owner, fields] of owners) {
    for (const f of fields) {
      if (f.max !== undefined) add(`${owner}${toPascalCase(f.name)}Max`, f.max);
      if (f.ofMax !== undefined) add(`${owner}${toPascalCase(f.name)}ItemMax`, f.ofMax);
    }
  }
  return [
    "    /// <summary>필드별 와이어 상한(string = UTF-8 바이트, array = 원소 수) — 서버 WIRE_LIMITS와 같은 값.</summary>",
    "    public static class WireLimits",
    "    {",
    ...out,
    "    }",
    "",
  ];
}

function csEnums(ast: SchemaAst): string[] {
  const lines: string[] = [];
  for (const e of ast.enums.values()) {
    lines.push(`    public enum ${e.name} : ${CS_REPR[e.repr]}`, "    {");
    for (const [n, c] of e.values) lines.push(`        ${toPascalCase(n)} = ${c},`);
    lines.push("    }", "");
  }
  return lines;
}

export function emitCsTypes(ast: SchemaAst, schemaHash: string, opts: CsEmitOptions = {}): string {
  const lines = [...header(schemaHash, opts.source), `namespace ${opts.namespace ?? CS_DEFAULT_NAMESPACE}`, "{"];
  lines.push("    public static class Protocol", "    {", `        public const int Version = ${ast.protoVersion};`, "    }", "");
  lines.push("    public static class PacketIds", "    {");
  for (const p of ast.packets) lines.push(`        public const ushort ${p.name} = ${hexId(p.id)};`);
  lines.push("    }", "");
  lines.push(...csLimits(ast));
  lines.push(...csEnums(ast));
  for (const s of ast.structs.values()) lines.push(...csClass(s.name, s.fields));
  for (const p of ast.packets) lines.push(...csPacketClass(p));
  lines.push("}", "");
  return lines.join("\n");
}
