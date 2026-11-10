// TS 코덱 산출물(server/src/net/wireCodec.generated.ts) — 패킷·그 struct마다 size*(검사 + 크기, 위반 = WireEncodeError)·
// write*(검사된 값을 Buffer에 직접, 끝 오프셋, 던지지 않음)·read*(BodyReader → 페이로드 | null)·decode*(본문 전체), 그리고 id 디스패치
// (bodySize·writeBody·decodeBody·decodeC2S — 스키마 밖 id는 인코드 거부·디코드 null). 규칙 정본은 shared/protocol.md §2, 참조 구현은 refCodec.ts(테스트가 대조).
// 생성 코드는 `as` 좁히기만 쓰고 any를 쓰지 않는다. 디코드 결과 객체는 codec.generated.ts 페이로드 interface와 같은 모양이다.

import { LEN_PREFIX_BYTES, elemFixedSize, fieldFixedSize, optionalCount, presenceBytes } from "./layout";
import { payloadTypeName, toPascalCase } from "./names";
import { INT_RANGE, type ElemType, type FieldDef, type PacketDef, type SchemaAst } from "./schema";
import { enumCodeConst, header, tsFieldType } from "./emitTsTypes";
import { codecUnits, isStringElem, layoutPackets, usedEnums, type CodecUnit } from "./units";

export interface TsCodecOptions {
  /** 런타임 모듈 import 경로(기본 "./wire/runtime"). */
  readonly runtimeImport?: string;
  /** 타입 산출물 import 경로(기본 "./codec.generated"). */
  readonly typesImport?: string;
}

type Unit = CodecUnit;

/** 산출 중 쓴 import 이름 — 값/타입 구분. */
class Uses {
  readonly runtime = new Set<string>();
  readonly runtimeTypes = new Set<string>();
  readonly types = new Set<string>();
  readonly typesTypes = new Set<string>();
}

/** 생성 문맥 — 스키마 + import 기록. */
interface Ctx {
  readonly ast: SchemaAst;
  readonly uses: Uses;
}

const WRITE_FN: Readonly<Record<string, string>> = {
  u8: "writeUInt8",
  i8: "writeInt8",
  u16: "writeUInt16LE",
  i16: "writeInt16LE",
  u32: "writeUInt32LE",
  i32: "writeInt32LE",
  f32: "writeFloatLE",
  f64: "writeDoubleLE",
};

const U16_MAX = 0xffff;

function indent(lines: readonly string[]): string[] {
  return lines.map((l) => `  ${l}`);
}

/** presence 비트 i의 마스크 식(i = 31은 부호 비트 — `1 << 31`이 int32로 맞다). */
function bit(i: number): string {
  return `1 << ${i}`;
}

// ── size ──

/** 고정 크기 비struct 원소의 검사 문(크기는 호출자가 상수로 더한다). */
function checkElem(cx: Ctx, t: ElemType, v: string, path: string): string {
  if (t.kind === "enum") {
    cx.uses.runtime.add("checkEnum");
    cx.uses.types.add(enumCodeConst(t.name));
    return `checkEnum(${enumCodeConst(t.name)}, ${v}, "${path}");`;
  }
  if (t.kind !== "prim" || t.prim === "string") throw new Error("checkElem: fixed non-struct element only");
  if (t.prim === "bool" || t.prim === "f32" || t.prim === "f64") {
    const fn = t.prim === "bool" ? "checkBool" : t.prim === "f32" ? "checkF32" : "checkF64";
    cx.uses.runtime.add(fn);
    return `${fn}(${v}, "${path}");`;
  }
  const [lo, hi] = INT_RANGE[t.prim];
  cx.uses.runtime.add("checkInt");
  return `checkInt(${v}, ${lo}, ${hi}, "${path}");`;
}

/** 원소 하나의 "검사(+ 가변 크기 더하기)" 문 — struct·string은 크기를 더하고, 고정 원소는 검사만. */
function sizeElem(cx: Ctx, t: ElemType, v: string, strMax: number | undefined, path: string): string {
  if (t.kind === "struct") {
    cx.uses.runtime.add("checkStruct");
    return `n += size${t.name}(checkStruct(${v}, "${path}"));`;
  }
  if (isStringElem(t)) {
    cx.uses.runtime.add("strSize");
    return `n += strSize(${v}, ${strMax ?? U16_MAX}, "${path}");`;
  }
  return checkElem(cx, t, v, path);
}

function sizeArray(cx: Ctx, f: FieldDef, of: ElemType, v: string, path: string): string[] {
  cx.uses.runtime.add("checkCount");
  const lines = [
    `checkCount(${v}, ${f.min ?? 0}, ${f.max ?? U16_MAX}, "${path}");`,
    `for (let i = 0; i < ${v}.length; i++) ${sizeElem(cx, of, `${v}[i]!`, f.ofMax, path)}`,
  ];
  const ef = elemFixedSize(cx.ast, of);
  if (ef !== null && of.kind !== "struct") lines.push(`n += ${v}.length * ${ef};`);
  if (f.optional) lines.push(`n += ${LEN_PREFIX_BYTES};`);
  return lines;
}

function sizeField(cx: Ctx, u: Unit, f: FieldDef): string[] {
  const v = `p.${f.name}`;
  const path = `${u.label}.${f.name}`;
  let body: string[];
  if (f.type.kind === "array") body = sizeArray(cx, f, f.type.of, v, path);
  else {
    body = [sizeElem(cx, f.type, v, f.max, path)];
    const fixed = fieldFixedSize(cx.ast, { ...f, optional: false });
    if (f.optional && fixed !== null && f.type.kind !== "struct") body.push(`n += ${fixed};`);
  }
  return f.optional ? [`if (${v} !== undefined) {`, ...indent(body), "}"] : body;
}

/** 크기의 상수 몫 — presence + 필수 고정 비struct 필드 + 필수 array의 개수 접두. */
function constSize(cx: Ctx, fields: readonly FieldDef[]): number {
  let n = presenceBytes(fields);
  for (const f of fields) {
    if (f.optional) continue;
    if (f.type.kind === "array") n += LEN_PREFIX_BYTES;
    else if (f.type.kind !== "struct") n += fieldFixedSize(cx.ast, f) ?? 0;
  }
  return n;
}

function emitSize(cx: Ctx, u: Unit): string[] {
  const body = u.fields.flatMap((f) => sizeField(cx, u, f));
  const n = constSize(cx, u.fields);
  const doc = `/** ${u.label} 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */`;
  const sig = `export function size${u.fn}(${body.length === 0 ? "_p" : "p"}: ${u.typeName}): number {`;
  // 가변 몫이 없으면(고정 크기) 검사 뒤 상수를 돌려준다.
  if (!body.some((l) => l.includes("n +="))) return [doc, sig, ...indent(body), `  return ${n};`, "}", ""];
  return [doc, sig, `  let n = ${n};`, ...indent(body), "  return n;", "}", ""];
}

// ── write ──

function writeElem(cx: Ctx, t: ElemType, v: string): string {
  if (t.kind === "struct") return `o = write${t.name}(${v}, out, o);`;
  if (t.kind === "enum") {
    const e = cx.ast.enums.get(t.name);
    if (e === undefined) throw new Error(`unknown enum ${t.name}`);
    cx.uses.types.add(enumCodeConst(t.name));
    return `o = out.${WRITE_FN[e.repr]}(${enumCodeConst(t.name)}[${v}], o);`;
  }
  if (t.prim === "string") {
    cx.uses.runtime.add("writeStr");
    return `o = writeStr(out, o, ${v});`;
  }
  if (t.prim === "bool") return `o = out.writeUInt8(${v} ? 1 : 0, o);`;
  return `o = out.${WRITE_FN[t.prim]}(${v}, o);`;
}

function writeField(cx: Ctx, f: FieldDef): string[] {
  const v = `p.${f.name}`;
  const body =
    f.type.kind === "array"
      ? [`o = out.writeUInt16LE(${v}.length, o);`, `for (let i = 0; i < ${v}.length; i++) ${writeElem(cx, f.type.of, `${v}[i]!`)}`]
      : [writeElem(cx, f.type, v)];
  return f.optional ? [`if (${v} !== undefined) {`, ...indent(body), "}"] : body;
}

function writePresence(fields: readonly FieldDef[]): string[] {
  const opt = fields.filter((f) => f.optional);
  if (opt.length === 0) return [];
  const lines = ["let pm = 0;"];
  opt.forEach((f, i) => lines.push(`if (p.${f.name} !== undefined) pm |= ${bit(i)};`));
  for (let b = 0; b < presenceBytes(fields); b++) lines.push(`o = out.writeUInt8((pm >>> ${8 * b}) & 0xff, o);`);
  return lines;
}

function emitWrite(cx: Ctx, u: Unit): string[] {
  const body = [...writePresence(u.fields), ...u.fields.flatMap((f) => writeField(cx, f))];
  const doc = `/** ${u.label}를 out[off..]에 쓰고 끝 오프셋 — size${u.fn}로 검사·공간 확보가 끝난 값만(던지지 않는다). */`;
  if (body.length === 0) return [doc, `export function write${u.fn}(_p: ${u.typeName}, _out: Buffer, off: number): number {`, "  return off;", "}", ""];
  return [doc, `export function write${u.fn}(p: ${u.typeName}, out: Buffer, off: number): number {`, "  let o = off;", ...indent(body), "  return o;", "}", ""];
}

// ── read ──

/** 원소 하나를 읽는 식. struct는 `T | null`(호출자가 null 검사). */
function readElemExpr(t: ElemType, strMax: number | undefined): string {
  if (t.kind === "struct" || t.kind === "enum") return `read${t.name}(r)`;
  if (t.prim === "string") return `r.str(${strMax ?? U16_MAX})`;
  return `r.${t.prim}()`;
}

/** array를 `into`(이미 선언된 T[])에 읽는 문 — 개수 → 범위 → (고정 원소면) 남은 바이트 → 원소. */
function readArray(cx: Ctx, f: FieldDef, of: ElemType, into: string, count: string): string[] {
  const fixed = elemFixedSize(cx.ast, of);
  const lines = [`const ${count} = r.count(${f.min ?? 0}, ${f.max ?? U16_MAX});`];
  if (fixed !== null) lines.push(`if (!r.need(${count} * ${fixed})) return null;`);
  lines.push(`for (let i = 0; i < ${count}; i++) {`);
  if (of.kind === "struct") lines.push(`  const e = ${readElemExpr(of, f.ofMax)};`, "  if (e === null) return null;", `  ${into}.push(e);`);
  else lines.push(`  ${into}.push(${readElemExpr(of, f.ofMax)});`, "  if (r.err !== 0) return null;");
  lines.push("}");
  return lines;
}

function readRequired(cx: Ctx, f: FieldDef): string[] {
  const local = `$${f.name}`;
  if (f.type.kind === "array") {
    return [`const ${local}: ${tsFieldType(f.type)} = [];`, ...readArray(cx, f, f.type.of, local, `${local}$n`)];
  }
  const expr = readElemExpr(f.type, f.max);
  if (f.type.kind !== "struct") return [`const ${local} = ${expr};`];
  return [`const ${local} = ${expr};`, `if (${local} === null) return null;`];
}

function readOptional(cx: Ctx, f: FieldDef, optIndex: number): string[] {
  const local = `$${f.name}`;
  let inner: string[];
  if (f.type.kind === "array") inner = [`const a: ${tsFieldType(f.type)} = [];`, ...readArray(cx, f, f.type.of, "a", "c"), `${local} = a;`];
  else if (f.type.kind === "struct") inner = [`const s = ${readElemExpr(f.type, f.max)};`, "if (s === null) return null;", `${local} = s;`];
  else inner = [`${local} = ${readElemExpr(f.type, f.max)};`];
  return [`let ${local}: ${tsFieldType(f.type)} | undefined;`, `if ((pm & (${bit(optIndex)})) !== 0) {`, ...indent(inner), "}"];
}

function readObject(u: Unit): string[] {
  const req = u.fields.filter((f) => !f.optional).map((f) => `${f.name}: $${f.name}`);
  const opt = u.fields.filter((f) => f.optional);
  const literal = req.length === 0 ? "{}" : `{ ${req.join(", ")} }`;
  if (opt.length === 0) return [`return ${literal};`];
  return [`const v: ${u.typeName} = ${literal};`, ...opt.map((f) => `if ($${f.name} !== undefined) v.${f.name} = $${f.name};`), "return v;"];
}

function emitRead(cx: Ctx, u: Unit): string[] {
  cx.uses.runtimeTypes.add("BodyReader");
  const k = optionalCount(u.fields);
  const lines = k > 0 ? [`const pm = r.presence(${presenceBytes(u.fields)}, ${k});`] : [];
  let oi = 0;
  for (const f of u.fields) lines.push(...(f.optional ? readOptional(cx, f, oi++) : readRequired(cx, f)));
  lines.push("if (r.err !== 0) return null;", ...readObject(u));
  const doc = `/** ${u.label} 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */`;
  return [doc, `export function read${u.fn}(r: BodyReader): ${u.typeName} | null {`, ...indent(lines), "}", ""];
}

function emitEnumReader(cx: Ctx, name: string): string[] {
  const e = cx.ast.enums.get(name);
  if (e === undefined) throw new Error(`unknown enum ${name}`);
  cx.uses.runtimeTypes.add("BodyReader");
  cx.uses.runtime.add("WIRE_ERROR");
  cx.uses.typesTypes.add(name);
  const cases = e.values.flatMap(([n, c]) => [`    case ${c}:`, `      return "${n}";`]);
  const fallback = e.values[0]?.[0] ?? "";
  return [
    `function read${name}(r: BodyReader): ${name} {`,
    `  switch (r.${e.repr}()) {`,
    ...cases,
    "    default:",
    "      r.fail(WIRE_ERROR.BadEnum);",
    `      return "${fallback}";`,
    "  }",
    "}",
    "",
  ];
}

function emitDecode(cx: Ctx, u: Unit): string[] {
  cx.uses.runtime.add("bodyReader");
  return [
    `/** ${u.label} 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */`,
    `export function decode${u.fn}(body: Uint8Array): ${u.typeName} | null {`,
    "  const r = bodyReader.reset(body);",
    `  const p = read${u.fn}(r);`,
    "  return r.done() ? p : null;",
    "}",
    "",
  ];
}

// ── 디스패치 ──

/** [case에 쓸 패킷명들, 코덱 단위가 되는 대상 패킷] — bodyOf는 대상의 단위로 간다. */
type Case = readonly [readonly string[], PacketDef];

function dispatchCases(ast: SchemaAst, keep: (p: PacketDef) => boolean): Case[] {
  const out: Case[] = [];
  for (const target of layoutPackets(ast)) {
    const ids = ast.packets.filter((p) => (p === target || p.bodyOf === target.name) && keep(p)).map((p) => p.name);
    if (ids.length > 0) out.push([ids, target]);
  }
  return out;
}

function switchFn(doc: string, sig: string, cases: readonly Case[], ret: (p: PacketDef) => string, fallback: string): string[] {
  const lines = [`/** ${doc} */`, `${sig} {`, "  switch (id) {"];
  for (const [ids, target] of cases) {
    for (const id of ids) lines.push(`    case PACKET_ID.${id}:`);
    lines.push(`      ${ret(target)}`);
  }
  lines.push("    default:", `      ${fallback}`, "  }", "}", "");
  return lines;
}

const UNKNOWN_PACKET = 'throw new WireEncodeError(`packet 0x${id.toString(16)}`, "unknown packet");';
const DECODE_C2S_DOC = "수신 디코드 — C2S 패킷만 디코드(실패 = null), 그 밖(S2C·스키마 밖 id)은 NO_CODEC(호출자 몫 — 서버 수신은 사전 판정 뒤라 미지 패킷으로 버린다).";
const DECODE_BODY_DOC = "본문 디코드 — 실패는 null(사유는 lastDecodeError()). 스키마 밖 id도 null이지만 reader를 건드리지 않는다 — lastDecodeError()는 직전 디코드 값 그대로라 판정에 못 쓴다(호출자가 PACKET_DIRECTION으로 먼저 본다).";

function emitDispatch(cx: Ctx): string[] {
  const all = dispatchCases(cx.ast, () => true);
  const c2s = dispatchCases(cx.ast, (p) => p.direction === "C2S");
  cx.uses.runtime.add("NO_CODEC");
  cx.uses.runtime.add("WireEncodeError");
  if (all.length > 0) cx.uses.types.add("PACKET_ID");
  const fn = (p: PacketDef): string => toPascalCase(p.name);
  const ty = (p: PacketDef): string => payloadTypeName(p.name);
  if (all.length === 0) return [...emptyDispatch(), ...emptyDecodeC2S()];
  const lines: string[] = [];
  lines.push(...switchFn("본문 크기(검사 포함 — 위반·스키마 밖 id = WireEncodeError).", "export function bodySize(id: number, p: object): number", all, (t) => `return size${fn(t)}(p as ${ty(t)});`, UNKNOWN_PACKET));
  lines.push(...switchFn("out[off..]에 본문을 쓰고 끝 오프셋(bodySize로 검사·공간 확보가 끝난 값만).", "export function writeBody(id: number, p: object, out: Buffer, off: number): number", all, (t) => `return write${fn(t)}(p as ${ty(t)}, out, off);`, UNKNOWN_PACKET));
  lines.push(...switchFn(DECODE_BODY_DOC, "export function decodeBody(id: number, body: Uint8Array): object | null", all, (t) => `return decode${fn(t)}(body);`, "return null;"));
  if (c2s.length === 0) return [...lines, ...emptyDecodeC2S()];
  const sig = "export function decodeC2S(id: number, body: Uint8Array): object | null | typeof NO_CODEC";
  return [...lines, ...switchFn(DECODE_C2S_DOC, sig, c2s, (t) => `return decode${fn(t)}(body);`, "return NO_CODEC;")];
}

function emptyDecodeC2S(): string[] {
  return [`/** ${DECODE_C2S_DOC} */`, "export function decodeC2S(_id: number, _body: Uint8Array): object | null | typeof NO_CODEC {", "  return NO_CODEC;", "}", ""];
}

function emptyDispatch(): string[] {
  return [
    `export function bodySize(id: number, _p: object): number {\n  ${UNKNOWN_PACKET}\n}\n`,
    `export function writeBody(id: number, _p: object, _out: Buffer, _off: number): number {\n  ${UNKNOWN_PACKET}\n}\n`,
    "export function decodeBody(_id: number, _body: Uint8Array): object | null {\n  return null;\n}\n",
  ];
}

// ── 파일 ──

function importLine(values: ReadonlySet<string>, types: ReadonlySet<string>, from: string): string[] {
  const names = [...[...values].map((n) => [n, n] as const), ...[...types].filter((n) => !values.has(n)).map((n) => [n, `type ${n}`] as const)];
  if (names.length === 0) return [];
  names.sort((a, b) => a[0].localeCompare(b[0]));
  return [`import { ${names.map(([, s]) => s).join(", ")} } from "${from}";`];
}

export function emitTsCodec(ast: SchemaAst, schemaHash: string, opts: TsCodecOptions = {}): string {
  const cx: Ctx = { ast, uses: new Uses() };
  const units = codecUnits(ast);
  const body: string[] = [];
  for (const name of usedEnums(ast, units)) body.push(...emitEnumReader(cx, name));
  for (const u of units) {
    cx.uses.typesTypes.add(u.typeName);
    body.push(`// ── ${u.label} ──`, "", ...emitSize(cx, u), ...emitWrite(cx, u), ...emitRead(cx, u));
    if (u.isPacket) body.push(...emitDecode(cx, u));
  }
  body.push(...emitDispatch(cx));
  const intro = "// 바이너리 본문 코덱 — 규칙 shared/protocol.md §2, 런타임 server/src/net/wire/runtime.ts, 참조 구현 tools/codegen/refCodec.ts.";
  return [
    ...header(schemaHash),
    intro,
    "",
    ...importLine(cx.uses.types, cx.uses.typesTypes, opts.typesImport ?? "./codec.generated"),
    ...importLine(cx.uses.runtime, cx.uses.runtimeTypes, opts.runtimeImport ?? "./wire/runtime"),
    "",
    ...body,
  ].join("\n");
}
