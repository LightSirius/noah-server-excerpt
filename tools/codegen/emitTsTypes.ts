// TS 타입 산출물(server/src/net/codec.generated.ts) — PROTO_VERSION·PACKET_ID·enum 리터럴 유니온·struct/페이로드 interface·shape 가드·
// PayloadById·S2CPacketId/C2SPacketId·PayloadOf(타입화 송신 표면)·PACKET_DIRECTION(스키마 안 id 표)·MAX_BODY_BYTES·WIRE_LIMITS·바이너리 레이아웃 상수
// (고정 머리 오프셋·고정 크기·필드 max). shape 가드(is<Payload>)는 핸들러의 방어 검사가 쓴다(가드 텍스트는 v1 산출물 그대로).
// 값 객체는 의존성 없음(게이트웨이·tools 공용).

import { fixedPrefix, fixedSize, worstCaseSize } from "./layout";
import { hexId, payloadTypeName, toPascalCase, toScreamingSnake } from "./names";
import type { ElemType, FieldDef, FieldType, PacketDef, SchemaAst } from "./schema";

/** 산출물 머리 — source는 스키마 원본 경로(기본 packets.json, 픽스처 산출물은 tools/codegen/fixture.ts). */
export function header(schemaHash: string, source = "shared/schema/packets.json"): string[] {
  return [
    `// AUTO-GENERATED — do not edit. Source: ${source}`,
    `// schema-hash: ${schemaHash}`,
    "// Run `bun run gen` from tools/codegen/ to regenerate.",
    "",
  ];
}

export function enumCodeConst(name: string): string {
  return `${toScreamingSnake(name)}_CODE`;
}

function tsElemType(t: ElemType): string {
  if (t.kind !== "prim") return t.name;
  if (t.prim === "string") return "string";
  if (t.prim === "bool") return "boolean";
  return "number";
}

export function tsFieldType(t: FieldType): string {
  return t.kind === "array" ? `${tsElemType(t.of)}[]` : tsElemType(t);
}

/** 원소 값이 타입에 맞으면 true인 식. */
function guardElem(t: ElemType, expr: string): string {
  if (t.kind === "struct") return `is${t.name}(${expr})`;
  if (t.kind === "enum") return `typeof ${expr} === "string" && Object.hasOwn(${enumCodeConst(t.name)}, ${expr})`;
  return `typeof ${expr} === "${tsElemType(t)}"`;
}

function guardLine(f: FieldDef): string {
  const expr = `o["${f.name}"]`;
  const t = f.type;
  const simple = t.kind === "prim";
  const check =
    t.kind === "array" ? `Array.isArray(${expr}) && ${expr}.every((e: unknown) => ${guardElem(t.of, "e")})` : guardElem(t, expr);
  if (simple && !f.optional) return `  if (typeof ${expr} !== "${tsElemType(t)}") return false;`;
  if (f.optional) return `  if (${expr} !== undefined && !(${check})) return false;`;
  return `  if (!(${check})) return false;`;
}

function emitGuard(fnName: string, typeName: string, fields: readonly FieldDef[]): string[] {
  return [
    `export function ${fnName}(v: unknown): v is ${typeName} {`,
    `  if (typeof v !== "object" || v === null) return false;`,
    `  const o = v as Record<string, unknown>;`,
    ...fields.map(guardLine),
    "  return true;",
    "}",
    "",
  ];
}

function emitInterface(name: string, fields: readonly FieldDef[], doc?: string): string[] {
  const lines = doc === undefined ? [] : [`/** ${doc} */`];
  lines.push(`export interface ${name} {`);
  for (const f of fields) lines.push(`  ${f.name}${f.optional ? "?" : ""}: ${tsFieldType(f.type)};`);
  lines.push("}", "");
  return lines;
}

function packetDoc(p: PacketDef): string {
  return p.bodyOf !== undefined ? `본문 = ${p.bodyOf}(bodyOf).` : "binary 본문(wireCodec.generated.ts).";
}

function emitEnums(ast: SchemaAst): string[] {
  const lines: string[] = [];
  for (const e of ast.enums.values()) {
    lines.push(`export type ${e.name} = ${e.values.map(([n]) => `"${n}"`).join(" | ")};`);
    lines.push(`export const ${enumCodeConst(e.name)} = { ${e.values.map(([n, c]) => `${n}: ${c}`).join(", ")} } as const;`, "");
  }
  return lines;
}

function emitPacketTables(ast: SchemaAst): string[] {
  const lines = ["export interface PayloadById {"];
  for (const p of ast.packets) lines.push(`  [PACKET_ID.${p.name}]: ${payloadTypeName(p.name)};`);
  lines.push("}", "");
  for (const dir of ["S2C", "C2S"] as const) {
    const ids = ast.packets.filter((p) => p.direction === dir).map((p) => `typeof PACKET_ID.${p.name}`);
    const side = dir === "S2C" ? "서버 → 클라" : "클라 → 서버";
    lines.push(`/** ${side} 패킷 id — 타입화 송신 표면(send<I>(id, PayloadOf<I>))이 방향이 틀린 id를 컴파일 오류로 막는다. */`);
    if (ids.length === 0) lines.push(`export type ${dir}PacketId = never;`, "");
    else lines.push(`export type ${dir}PacketId =`, ...ids.map((t, i) => `  | ${t}${i === ids.length - 1 ? ";" : ""}`), "");
  }
  lines.push(
    "type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer R) => void ? R : never;",
    "/**",
    " * 송신 페이로드 타입 — id가 유니온(삼항 등)이면 PayloadById[I]가 페이로드 유니온으로 넓어져 검사가 꺼지므로 교차로 바꿔 모든 후보를",
    " * 만족하게 한다. & object는 필드 없는 패킷(빈 interface — 원시값까지 받는다)에 원시값이 들어가는 것을 막는다.",
    " */",
    "export type PayloadOf<I extends PacketId> = UnionToIntersection<PayloadById[I]> & object;",
    "",
  );
  lines.push(`export const PACKET_DIRECTION: Readonly<Partial<Record<number, "C2S" | "S2C">>> = {`);
  for (const p of ast.packets) lines.push(`  [PACKET_ID.${p.name}]: "${p.direction}",`);
  lines.push("};", "");
  lines.push("/** 패킷별 최악 본문 바이트(스키마 max 기준, 모든 optional 존재 — 스키마가 ≤ 65535를 강제). */");
  lines.push("export const MAX_BODY_BYTES: Readonly<Partial<Record<number, number>>> = {");
  for (const p of ast.packets) lines.push(`  [PACKET_ID.${p.name}]: ${worstCaseSize(ast, p.fields)},`);
  lines.push("};", "");
  return lines;
}

/** WIRE_LIMITS의 한 소유자(패킷·struct) 항목 — max가 있는 필드만. array<string> 원소 상한은 `<필드>.item`. */
function limitEntries(fields: readonly FieldDef[]): string[] {
  const out: string[] = [];
  for (const f of fields) {
    if (f.max !== undefined) out.push(`${f.name}: ${f.max}`);
    if (f.ofMax !== undefined) out.push(`"${f.name}.item": ${f.ofMax}`);
  }
  return out;
}

interface Owner {
  readonly key: string;
  readonly constBase: string;
  readonly fields: readonly FieldDef[];
}

function owners(ast: SchemaAst): Owner[] {
  const out: Owner[] = [];
  for (const s of ast.structs.values()) out.push({ key: s.name, constBase: toScreamingSnake(s.name), fields: s.fields });
  for (const p of ast.packets) {
    if (p.bodyOf !== undefined) continue;
    out.push({ key: p.name, constBase: p.name, fields: p.fields });
  }
  return out;
}

function emitLimits(all: readonly Owner[]): string[] {
  const lines = ["/** 필드별 와이어 상한(string = UTF-8 바이트, array = 원소 수) — 데이터 로더·입력 UI가 같은 값을 강제한다. */"];
  lines.push("export const WIRE_LIMITS = {");
  for (const o of all) {
    const entries = limitEntries(o.fields);
    if (entries.length > 0) lines.push(`  ${o.key}: { ${entries.join(", ")} },`);
  }
  lines.push("} as const;", "");
  return lines;
}

function emitLayoutConsts(ast: SchemaAst, all: readonly Owner[], declare: (name: string) => string): string[] {
  const lines: string[] = [];
  for (const o of all) {
    for (const f of o.fields) {
      if (f.max !== undefined) lines.push(`export const ${declare(`${o.constBase}_${toScreamingSnake(f.name)}_MAX`)} = ${f.max};`);
    }
    const size = fixedSize(ast, o.fields);
    const prefix = fixedPrefix(ast, o.fields);
    if (size !== null) lines.push(`export const ${declare(`${o.constBase}_BYTES`)} = ${size};`);
    if (prefix.offsets.length > 0) {
      const body = prefix.offsets.map(([k, off]) => `${k}: ${off}`).join(", ");
      lines.push(`export const ${declare(`${o.constBase}_OFFSET`)} = { ${body} } as const;`);
    }
    if (size === null && prefix.offsets.length > 0) lines.push(`export const ${declare(`${o.constBase}_PREFIX_BYTES`)} = ${prefix.bytes};`);
  }
  if (lines.length > 0) lines.push("");
  return lines;
}

/** 같은 상수명을 두 번 내면 throw — 이름 규칙이 우연히 겹치는 스키마(예: 패킷 A의 B_C 필드와 패킷 A_B의 C 필드)를 산출 전에 막는다. */
function constRegistry(): (name: string) => string {
  const seen = new Set<string>(["PROTO_VERSION", "PACKET_ID", "PACKET_DIRECTION", "MAX_BODY_BYTES", "WIRE_LIMITS"]);
  return (name) => {
    if (seen.has(name)) throw new Error(`codegen: 산출 상수명 충돌 ${name} — struct·패킷·필드 이름을 바꿀 것`);
    seen.add(name);
    return name;
  };
}

export function emitTsTypes(ast: SchemaAst, schemaHash: string): string {
  const declare = constRegistry();
  for (const e of ast.enums.values()) declare(enumCodeConst(e.name));
  const lines = [...header(schemaHash), "/* eslint-disable */", ""];
  lines.push(`export const PROTO_VERSION = ${ast.protoVersion};`, "");
  lines.push("export const PACKET_ID = {");
  for (const p of ast.packets) lines.push(`  ${p.name}: ${hexId(p.id)},`);
  lines.push("} as const;", "", "export type PacketId = typeof PACKET_ID[keyof typeof PACKET_ID];", "");
  lines.push(...emitEnums(ast));
  for (const s of ast.structs.values()) lines.push(...emitInterface(s.name, s.fields));
  for (const p of ast.packets) lines.push(...emitInterface(payloadTypeName(p.name), p.fields, packetDoc(p)));
  for (const s of ast.structs.values()) lines.push(...emitGuard(`is${s.name}`, s.name, s.fields));
  for (const p of ast.packets) lines.push(...emitGuard(`is${toPascalCase(p.name)}Payload`, payloadTypeName(p.name), p.fields));
  lines.push(...emitPacketTables(ast));
  const all = owners(ast);
  lines.push(...emitLimits(all));
  lines.push(...emitLayoutConsts(ast, all, declare));
  return lines.join("\n");
}
