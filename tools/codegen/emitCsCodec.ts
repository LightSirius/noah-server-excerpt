// C# 코덱 산출물(client/Noah/Assets/Scripts/Net/WireCodec.Generated.cs) — 정적 class WireCodec 안에 패킷·그 struct마다
// Size*(검사 + 크기, 위반 = WireEncodeException)·Write*(검사된 값을 Span에 직접, 끝 오프셋, 던지지 않음)·Read*(WireReader → 대상 객체 채우기,
// 실패 false), 패킷(bodyOf 포함)마다 Decode*(본문 전체, 실패 = null + WireError)·Encode*(byte[]), 그리고 id 디스패치(Decode·BodySize·
// WriteBody·Encode — 스키마 밖 id는 디코드 null + None·인코드 거부). 런타임은 client/Noah/Assets/Scripts/Net/WireRuntime.cs(MMORPG.Net), 규칙 정본은
// shared/protocol.md §2, 교차 언어 기준은 refCodec.ts 산출 골든(golden.ts). 클라는 S2C를 디코드하고 C2S를 인코드하지만 골든이 양방향을 시험하므로
// 모든 패킷에 양방향을 낸다. 타입 표현은 emitCsTypes.ts(optional = null: 값 타입 T?, 참조 타입 null). bodyOf 패킷 class는 대상 class를 상속하므로
// 대상의 Size·Write·Read를 그대로 쓴다. BCL 타입은 global:: 한정으로 쓴다(스키마 struct 이름이 가리지 못하게 — 런타임 이름은 schema.ts 예약).

import { LEN_PREFIX_BYTES, elemFixedSize, fieldFixedSize, optionalCount, presenceBytes } from "./layout";
import { payloadTypeName, toPascalCase } from "./names";
import type { ElemType, EnumRepr, FieldDef, PacketDef, PrimType, SchemaAst } from "./schema";
import { CS_DEFAULT_NAMESPACE, CS_REPR, csElem, isCsValueType, type CsEmitOptions } from "./emitCsTypes";
import { header } from "./emitTsTypes";
import { codecUnits, isStringElem, usedEnums, type CodecUnit } from "./units";

type Unit = CodecUnit;

const U16_MAX = 0xffff;
const SPAN = "global::System.Span<byte>";
const RO_SPAN = "global::System.ReadOnlySpan<byte>";
const NO_ERROR = "WireError.None";

const PRIM_FN: Readonly<Record<Exclude<PrimType, "string">, string>> = {
  u8: "U8",
  i8: "I8",
  u16: "U16",
  i16: "I16",
  u32: "U32",
  i32: "I32",
  f32: "F32",
  f64: "F64",
  bool: "Bool",
};

const REPR_FN: Readonly<Record<EnumRepr, string>> = { u8: "U8", u16: "U16", u32: "U32" };

function indent(lines: readonly string[], n = 1): string[] {
  const pad = "    ".repeat(n);
  return lines.map((l) => (l === "" ? "" : `${pad}${l}`));
}

function member(f: FieldDef): string {
  return toPascalCase(f.name);
}

/** presence 비트 i의 마스크 식(uint — 비트 31도 부호 없이). */
function bit(i: number): string {
  return `1u << ${i}`;
}

/** optional 필드의 존재 조건과 값 식(값 타입은 .Value). */
function presentOf(f: FieldDef, v: string): { readonly cond: string; readonly value: string } {
  if (isCsValueType(f.type)) return { cond: `${v}.HasValue`, value: `${v}.Value` };
  return { cond: `${v} != null`, value: v };
}

// ── Size ──

/** 원소 하나의 "검사(+ 가변 크기 더하기)" 문 — struct·string은 크기를 더하고, 고정 원소는 검사만(검사 없는 정수·bool은 null). */
function sizeElem(t: ElemType, v: string, strMax: number | undefined, path: string): string | null {
  if (t.kind === "struct") return `n += Size${t.name}(WireCheck.NotNull(${v}, "${path}"));`;
  if (t.kind === "enum") return `Check${t.name}(${v}, "${path}");`;
  if (t.prim === "string") return `n += WireCheck.Str(${v}, ${strMax ?? U16_MAX}, "${path}");`;
  if (t.prim === "f32" || t.prim === "f64") return `WireCheck.${PRIM_FN[t.prim]}(${v}, "${path}");`;
  return null;
}

function sizeArray(ast: SchemaAst, f: FieldDef, of: ElemType, v: string, path: string): string[] {
  const lines = [`int c = WireCheck.Count(${v}, ${f.min ?? 0}, ${f.max ?? U16_MAX}, "${path}");`];
  const each = sizeElem(of, `${v}[i]`, f.ofMax, path);
  if (each !== null) lines.push(`for (int i = 0; i < c; i++) ${each}`);
  const ef = elemFixedSize(ast, of);
  const fixedPart = ef !== null && of.kind !== "struct" ? ` + c * ${ef}` : "";
  if (f.optional) lines.push(`n += ${LEN_PREFIX_BYTES}${fixedPart};`);
  else if (fixedPart !== "") lines.push(`n += c * ${ef};`);
  return lines;
}

function sizeField(ast: SchemaAst, u: Unit, f: FieldDef): string[] {
  const v = `p.${member(f)}`;
  const path = `${u.label}.${f.name}`;
  if (f.type.kind === "array") {
    const body = sizeArray(ast, f, f.type.of, v, path);
    return f.optional ? [`if (${v} != null)`, "{", ...indent(body), "}"] : ["{", ...indent(body), "}"];
  }
  if (!f.optional) {
    const s = sizeElem(f.type, v, f.max, path);
    return s === null ? [] : [s];
  }
  const { cond, value } = presentOf(f, v);
  const body: string[] = [];
  const s = sizeElem(f.type, value, f.max, path);
  if (s !== null) body.push(s);
  const fixed = fieldFixedSize(ast, { ...f, optional: false });
  if (fixed !== null && f.type.kind !== "struct") body.push(`n += ${fixed};`);
  return [`if (${cond})`, "{", ...indent(body), "}"];
}

/** 크기의 상수 몫 — presence + 필수 고정 비struct 필드 + 필수 array의 개수 접두(string 접두는 WireCheck.Str가 더한다). */
function constSize(ast: SchemaAst, fields: readonly FieldDef[]): number {
  let n = presenceBytes(fields);
  for (const f of fields) {
    if (f.optional) continue;
    if (f.type.kind === "array") n += LEN_PREFIX_BYTES;
    else if (f.type.kind !== "struct" && !isStringElem(f.type)) n += fieldFixedSize(ast, f) ?? 0;
  }
  return n;
}

function emitSize(ast: SchemaAst, u: Unit): string[] {
  const body = u.fields.flatMap((f) => sizeField(ast, u, f));
  const n = constSize(ast, u.fields);
  const doc = `/// <summary>${u.label} 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>`;
  const sig = `public static int Size${u.fn}(${u.typeName} p)`;
  if (!body.some((l) => l.includes("n +="))) return [doc, sig, "{", ...indent(body), `    return ${n};`, "}", ""];
  return [doc, sig, "{", `    int n = ${n};`, ...indent(body), "    return n;", "}", ""];
}

// ── Write ──

function writeElem(ast: SchemaAst, t: ElemType, v: string): string {
  if (t.kind === "struct") return `off = Write${t.name}(${v}, o, off);`;
  if (t.kind === "enum") {
    const e = ast.enums.get(t.name);
    if (e === undefined) throw new Error(`unknown enum ${t.name}`);
    return `off = WireWrite.${REPR_FN[e.repr]}(o, off, (${CS_REPR[e.repr]})${v});`;
  }
  if (t.prim === "string") return `off = WireWrite.Str(o, off, ${v});`;
  return `off = WireWrite.${PRIM_FN[t.prim]}(o, off, ${v});`;
}

function writeField(ast: SchemaAst, f: FieldDef): string[] {
  const v = `p.${member(f)}`;
  if (f.type.kind === "array") {
    const body = [`off = WireWrite.U16(o, off, (ushort)${v}.Length);`, `for (int i = 0; i < ${v}.Length; i++) ${writeElem(ast, f.type.of, `${v}[i]`)}`];
    return f.optional ? [`if (${v} != null)`, "{", ...indent(body), "}"] : body;
  }
  if (!f.optional) return [writeElem(ast, f.type, v)];
  const { cond, value } = presentOf(f, v);
  return [`if (${cond}) ${writeElem(ast, f.type, value)}`];
}

function writePresence(fields: readonly FieldDef[]): string[] {
  const opt = fields.filter((f) => f.optional);
  if (opt.length === 0) return [];
  const lines = ["uint pm = 0;"];
  opt.forEach((f, i) => lines.push(`if (${presentOf(f, `p.${member(f)}`).cond}) pm |= ${bit(i)};`));
  for (let b = 0; b < presenceBytes(fields); b++) lines.push(`off = WireWrite.U8(o, off, (byte)((pm >> ${8 * b}) & 0xff));`);
  return lines;
}

function emitWrite(ast: SchemaAst, u: Unit): string[] {
  const body = [...writePresence(u.fields), ...u.fields.flatMap((f) => writeField(ast, f))];
  return [
    `/// <summary>${u.label}를 o[off..]에 쓰고 끝 오프셋 — Size${u.fn}로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>`,
    `public static int Write${u.fn}(${u.typeName} p, ${SPAN} o, int off)`,
    "{",
    ...indent(body),
    "    return off;",
    "}",
    "",
  ];
}

// ── Read ──

/** struct가 아닌 원소 하나를 읽는 식. */
function readElemExpr(t: ElemType, strMax: number | undefined): string {
  if (t.kind === "enum") return `Read${t.name}(ref r)`;
  if (t.kind === "struct") throw new Error("readElemExpr: struct는 readStruct");
  if (t.prim === "string") return `r.Str(${strMax ?? U16_MAX})`;
  return `r.${PRIM_FN[t.prim]}()`;
}

/** struct 하나를 새 객체로 읽어 `into`에 넣는 문(실패면 false 반환). */
function readStruct(name: string, into: string): string[] {
  return [`var s = new ${name}();`, `if (!Read${name}(ref r, s)) return false;`, `${into} = s;`];
}

/** array 읽기 — 개수 → 범위 → (고정 원소면) 남은 바이트 → 원소. 원소는 검사 뒤에 넣는다(가변 원소 배열은 Capacity로 할당). */
function readArray(ast: SchemaAst, f: FieldDef, of: ElemType, into: string): string[] {
  const fixed = elemFixedSize(ast, of);
  const lines = [`int n = r.Count(${f.min ?? 0}, ${f.max ?? U16_MAX});`];
  if (fixed !== null) lines.push(`if (!r.Need(n * ${fixed})) return false;`);
  lines.push(`var a = new ${csElem(of)}[${fixed !== null ? "n" : "r.Capacity(n)"}];`, "for (int i = 0; i < n; i++)", "{");
  if (of.kind === "struct") lines.push(`    var e = new ${of.name}();`, `    if (!Read${of.name}(ref r, e)) return false;`);
  else lines.push(`    var e = ${readElemExpr(of, f.ofMax)};`, `    if (r.Error != ${NO_ERROR}) return false;`);
  lines.push("    a[i] = e;", "}", `${into} = a;`);
  return lines;
}

function readField(ast: SchemaAst, f: FieldDef, optIndex: number): string[] {
  const into = `v.${member(f)}`;
  let body: string[];
  if (f.type.kind === "array") body = readArray(ast, f, f.type.of, into);
  else if (f.type.kind === "struct") body = readStruct(f.type.name, into);
  else {
    const stmt = `${into} = ${readElemExpr(f.type, f.max)};`;
    return f.optional ? [`if ((pm & (${bit(optIndex)})) != 0) ${stmt}`] : [stmt];
  }
  return f.optional ? [`if ((pm & (${bit(optIndex)})) != 0)`, "{", ...indent(body), "}"] : ["{", ...indent(body), "}"];
}

function emitRead(ast: SchemaAst, u: Unit): string[] {
  const k = optionalCount(u.fields);
  const body = k > 0 ? [`uint pm = r.Presence(${presenceBytes(u.fields)}, ${k});`] : [];
  let oi = 0;
  for (const f of u.fields) body.push(...readField(ast, f, f.optional ? oi++ : -1));
  return [
    `/// <summary>${u.label} 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>`,
    `public static bool Read${u.fn}(ref WireReader r, ${u.typeName} v)`,
    "{",
    ...indent(body),
    `    return r.Error == ${NO_ERROR};`,
    "}",
    "",
  ];
}

// ── enum ──

/**
 * enum 판독·검사 — enum은 식 문맥(`Kind.Player`)에 나오므로 전역 한정한다: 한정 없이 쓰면 enum 이름이 WireCodec의 메서드(Decode·Encode·
 * Size<X> 등)와 같을 때 메서드 그룹으로 해석돼 CS0119가 난다(형식 문맥인 매개변수·new T[]는 메서드를 보지 않아 안전).
 */
function emitEnumHelpers(ast: SchemaAst, name: string, ns: string): string[] {
  const e = ast.enums.get(name);
  if (e === undefined) throw new Error(`unknown enum ${name}`);
  const q = `global::${ns}.${name}`;
  const read = e.values.flatMap(([n, c]) => [`    case ${c}:`, `        return ${q}.${toPascalCase(n)};`]);
  const check = e.values.map(([n]) => `    case ${q}.${toPascalCase(n)}:`);
  return [
    `private static ${q} Read${name}(ref WireReader r)`,
    "{",
    `    switch (r.${REPR_FN[e.repr]}())`,
    "    {",
    ...indent(read),
    "        default:",
    "            r.Fail(WireError.BadEnum);",
    "            return default;",
    "    }",
    "}",
    "",
    `private static void Check${name}(${q} v, string path)`,
    "{",
    "    switch (v)",
    "    {",
    ...indent(check),
    "            return;",
    "        default:",
    `            throw new WireEncodeException(path, $"not a ${name} value: {v}");`,
    "    }",
    "}",
    "",
  ];
}

// ── 패킷 진입점 ──

/** 패킷(bodyOf 포함)의 Decode*·Encode* — bodyOf는 자기 class(대상 class 상속)로 받고 대상 단위의 함수를 쓴다. */
function emitPacketEntry(p: PacketDef): string[] {
  const fn = toPascalCase(p.name);
  const ty = payloadTypeName(p.name);
  const unit = toPascalCase(p.bodyOf ?? p.name);
  return [
    `/// <summary>${p.name} 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>`,
    `public static ${ty} Decode${fn}(${RO_SPAN} body, out WireError error)`,
    "{",
    "    var r = new WireReader(body);",
    `    var v = new ${ty}();`,
    `    bool ok = Read${unit}(ref r, v) && r.Done();`,
    "    error = r.Error;",
    "    return ok ? v : null;",
    "}",
    "",
    `/// <summary>${p.name} 본문 인코드(검사 위반 = WireEncodeException).</summary>`,
    `public static byte[] Encode${fn}(${ty} p)`,
    "{",
    `    var buf = new byte[Size${unit}(p)];`,
    `    Write${unit}(p, buf, 0);`,
    "    return buf;",
    "}",
    "",
  ];
}

// ── 디스패치 ──

function switchFn(doc: string, sig: string, packets: readonly PacketDef[], ret: (p: PacketDef) => readonly string[], fallback: readonly string[]): string[] {
  const lines = [`/// <summary>${doc}</summary>`, sig, "{", "    switch (id)", "    {"];
  for (const p of packets) lines.push(`        case PacketIds.${p.name}:`, ...indent(ret(p), 3));
  lines.push("        default:", ...indent(fallback, 3), "    }", "}", "");
  return lines;
}

function payloadArg(p: PacketDef): string {
  return `WireCheck.Payload<${payloadTypeName(p.name)}>(p, "${p.name}")`;
}

function emitDispatch(ast: SchemaAst): string[] {
  const all = ast.packets;
  const unit = (p: PacketDef): string => toPascalCase(p.bodyOf ?? p.name);
  const lines: string[] = [];
  const decodeDoc = "본문 디코드 — 실패 = null + 사유. 스키마 밖 id도 null이지만 사유는 None(위반 사유가 아니다 — 수신자가 구분한다).";
  lines.push(...switchFn(decodeDoc, `public static object Decode(ushort id, ${RO_SPAN} body, out WireError error)`, all, (p) => [`return Decode${toPascalCase(p.name)}(body, out error);`], [`error = ${NO_ERROR};`, "return null;"]));
  lines.push(...switchFn("본문 크기(검사 포함 — 위반·스키마 밖 id·페이로드 class 불일치 = WireEncodeException).", "public static int BodySize(ushort id, object p)", all, (p) => [`return Size${unit(p)}(${payloadArg(p)});`], ["throw UnknownPacket(id);"]));
  lines.push(...switchFn("o[off..]에 본문을 쓰고 끝 오프셋(BodySize로 검사·공간 확보가 끝난 값만).", `public static int WriteBody(ushort id, object p, ${SPAN} o, int off)`, all, (p) => [`return Write${unit(p)}(${payloadArg(p)}, o, off);`], ["throw UnknownPacket(id);"]));
  lines.push(
    "/// <summary>id로 본문 인코드(검사 위반 = WireEncodeException).</summary>",
    "public static byte[] Encode(ushort id, object p)",
    "{",
    "    var buf = new byte[BodySize(id, p)];",
    "    WriteBody(id, p, buf, 0);",
    "    return buf;",
    "}",
    "",
    'private static WireEncodeException UnknownPacket(ushort id) => new WireEncodeException($"packet 0x{id:x}", "unknown packet");',
  );
  return lines;
}

// ── 파일 ──

export function emitCsCodec(ast: SchemaAst, schemaHash: string, opts: CsEmitOptions = {}): string {
  const ns = opts.namespace ?? CS_DEFAULT_NAMESPACE;
  const units = codecUnits(ast);
  const body: string[] = [];
  for (const name of usedEnums(ast, units)) body.push(...emitEnumHelpers(ast, name, ns));
  for (const u of units) body.push(`// ── ${u.label} ──`, "", ...emitSize(ast, u), ...emitWrite(ast, u), ...emitRead(ast, u));
  for (const p of ast.packets) body.push(...emitPacketEntry(p));
  body.push(...emitDispatch(ast));
  return [
    ...header(schemaHash, opts.source),
    "// 바이너리 본문 코덱 — 규칙 shared/protocol.md §2, 런타임 client/Noah/Assets/Scripts/Net/WireRuntime.cs, 참조 구현 tools/codegen/refCodec.ts.",
    "",
    `namespace ${ns}`,
    "{",
    "    using global::MMORPG.Net;",
    "",
    "    public static class WireCodec",
    "    {",
    ...indent(body, 2),
    "    }",
    "}",
    "",
  ].join("\n");
}
