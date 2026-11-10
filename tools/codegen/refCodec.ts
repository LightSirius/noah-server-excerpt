// 참조 인터프리터 — 스키마 AST만 보고 아무 패킷·struct의 바이너리 본문을 인코딩·디코딩한다. 생성 코덱(server/src/net/wireCodec.generated.ts)과
// C# 코덱(C0.3)의 독립 오라클이다: 같은 입력에 같은 바이트, 같은 잘못된 본문에 같은 "첫 오류"를 내야 한다(tests/server/codegen·net).
// 규칙 정본은 shared/protocol.md §2 — 여기서는 읽기 쉬운 재귀 + DataView로 그 문장을 그대로 옮긴다(속도 무관).
// 독립성: 서버 런타임(server/src/net/wire/runtime.ts)·layout.ts를 import하지 않는다(고정 크기 계산도 자체 구현). UTF-8 검증은
// WHATWG TextDecoder(fatal, BOM 보존)를 쓴다 — 런타임의 손으로 쓴 검증기와 다른 구현이라 서로를 검산한다.

import { INT_RANGE, type ElemType, type FieldDef, type IntType, type PrimType, type SchemaAst, type StructDef } from "./schema";

export const REF_WIRE_ERRORS = [
  "Truncated",
  "Trailing",
  "BadBool",
  "BadEnum",
  "OverMax",
  "UnderMin",
  "BadUtf8",
  "BadPresence",
  "NonFinite",
] as const;
export type RefWireError = (typeof REF_WIRE_ERRORS)[number];

export type RefDecodeResult =
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly error: RefWireError };

/** 인코딩 거부(범위·정수성·유한·enum·max/min·잘못된 UTF-16). */
export class RefEncodeError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "RefEncodeError";
  }
}

const U16_MAX = 0xffff;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const utf8Encoder = new TextEncoder();

function fieldsOf(ast: SchemaAst, target: string): readonly FieldDef[] {
  const packet = ast.packets.find((p) => p.name === target);
  if (packet !== undefined) return packet.fields;
  const s = ast.structs.get(target);
  if (s === undefined) throw new Error(`unknown packet/struct ${target}`);
  return s.fields;
}

function structOf(ast: SchemaAst, name: string): StructDef {
  const s = ast.structs.get(name);
  if (s === undefined) throw new Error(`unknown struct ${name}`);
  return s;
}

// ── 인코딩 ──

class ByteSink {
  private buf = new Uint8Array(64);
  private view = new DataView(this.buf.buffer);
  private len = 0;

  private grow(n: number): number {
    const at = this.len;
    if (at + n > this.buf.length) {
      const next = new Uint8Array(Math.max(this.buf.length * 2, at + n));
      next.set(this.buf.subarray(0, at));
      this.buf = next;
      this.view = new DataView(next.buffer);
    }
    this.len += n;
    return at;
  }

  uint(bytes: number, v: number): void {
    const at = this.grow(bytes);
    if (bytes === 1) this.view.setUint8(at, v);
    else if (bytes === 2) this.view.setUint16(at, v, true);
    else this.view.setUint32(at, v, true);
  }

  int(bytes: number, v: number): void {
    const at = this.grow(bytes);
    if (bytes === 1) this.view.setInt8(at, v);
    else if (bytes === 2) this.view.setInt16(at, v, true);
    else this.view.setInt32(at, v, true);
  }

  // grow가 view를 갈아 끼울 수 있으므로 자리를 먼저 잡고 나서 view를 읽는다.
  f32(v: number): void {
    const at = this.grow(4);
    this.view.setFloat32(at, v, true);
  }

  f64(v: number): void {
    const at = this.grow(8);
    this.view.setFloat64(at, v, true);
  }

  raw(b: Uint8Array): void {
    const at = this.grow(b.length);
    this.buf.set(b, at);
  }

  result(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

const INT_BYTES: Readonly<Record<IntType, number>> = { u8: 1, i8: 1, u16: 2, i16: 2, u32: 4, i32: 4 };

/** target(패킷명 또는 struct명)의 필드 레이아웃으로 value를 인코딩한다. 거부는 RefEncodeError. */
export function refEncode(ast: SchemaAst, target: string, value: unknown): Uint8Array {
  const sink = new ByteSink();
  encFields(ast, fieldsOf(ast, target), value, target, sink);
  return sink.result();
}

function asRecord(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new RefEncodeError(path, "object expected");
  return v as Record<string, unknown>;
}

function encFields(ast: SchemaAst, fields: readonly FieldDef[], value: unknown, path: string, sink: ByteSink): void {
  const o = asRecord(value, path);
  const optional = fields.filter((f) => f.optional);
  const presence = new Uint8Array(Math.ceil(optional.length / 8));
  optional.forEach((f, i) => {
    if (o[f.name] !== undefined) presence[i >> 3] = (presence[i >> 3] ?? 0) | (1 << (i & 7));
  });
  sink.raw(presence);
  for (const f of fields) {
    const v = o[f.name];
    if (f.optional && v === undefined) continue;
    encField(ast, f, v, `${path}.${f.name}`, sink);
  }
}

function encField(ast: SchemaAst, f: FieldDef, v: unknown, path: string, sink: ByteSink): void {
  if (f.type.kind !== "array") {
    encElem(ast, f.type, v, f.max, path, sink);
    return;
  }
  if (!Array.isArray(v)) throw new RefEncodeError(path, "array expected");
  const max = f.max ?? U16_MAX;
  const min = f.min ?? 0;
  if (v.length > max || v.length < min) throw new RefEncodeError(path, `count ${v.length} outside [${min}, ${max}]`);
  sink.uint(2, v.length);
  const of = f.type.of;
  v.forEach((e, i) => encElem(ast, of, e, f.ofMax, `${path}[${i}]`, sink));
}

function encElem(ast: SchemaAst, t: ElemType, v: unknown, strMax: number | undefined, path: string, sink: ByteSink): void {
  if (t.kind === "struct") {
    encFields(ast, structOf(ast, t.name).fields, v, path, sink);
    return;
  }
  if (t.kind === "enum") {
    const e = ast.enums.get(t.name);
    const entry = e?.values.find(([name]) => name === v);
    if (e === undefined || entry === undefined) throw new RefEncodeError(path, `not a ${t.name} value: ${String(v)}`);
    sink.uint(INT_BYTES[e.repr], entry[1]);
    return;
  }
  encPrim(t.prim, v, strMax, path, sink);
}

function encPrim(prim: PrimType, v: unknown, strMax: number | undefined, path: string, sink: ByteSink): void {
  if (prim === "string") {
    encString(v, strMax ?? U16_MAX, path, sink);
    return;
  }
  if (prim === "bool") {
    if (typeof v !== "boolean") throw new RefEncodeError(path, "boolean expected");
    sink.uint(1, v ? 1 : 0);
    return;
  }
  if (typeof v !== "number") throw new RefEncodeError(path, "number expected");
  if (prim === "f32") {
    if (!Number.isFinite(Math.fround(v))) throw new RefEncodeError(path, `not a finite f32: ${v}`);
    sink.f32(v);
    return;
  }
  if (prim === "f64") {
    if (!Number.isFinite(v)) throw new RefEncodeError(path, `not a finite f64: ${v}`);
    sink.f64(v);
    return;
  }
  const [lo, hi] = INT_RANGE[prim];
  if (!Number.isInteger(v) || v < lo || v > hi) throw new RefEncodeError(path, `${prim} out of range: ${v}`);
  if (prim.startsWith("u")) sink.uint(INT_BYTES[prim], v);
  else sink.int(INT_BYTES[prim], v);
}

function encString(v: unknown, max: number, path: string, sink: ByteSink): void {
  if (typeof v !== "string") throw new RefEncodeError(path, "string expected");
  if (!v.isWellFormed()) throw new RefEncodeError(path, "lone surrogate (not encodable as UTF-8)");
  const bytes = utf8Encoder.encode(v);
  if (bytes.length > max) throw new RefEncodeError(path, `${bytes.length} UTF-8 bytes > max ${max}`);
  sink.uint(2, bytes.length);
  sink.raw(bytes);
}

// ── 디코딩 ──

class DecodeFail extends Error {
  constructor(readonly code: RefWireError) {
    super(code);
  }
}

class Cursor {
  off = 0;
  readonly view: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get remaining(): number {
    return this.bytes.length - this.off;
  }

  /** n바이트를 소비하고 시작 오프셋을 돌려준다 — 모자라면 Truncated. */
  take(n: number): number {
    if (n > this.remaining) throw new DecodeFail("Truncated");
    const at = this.off;
    this.off += n;
    return at;
  }
}

/** target 레이아웃으로 bytes를 디코딩한다 — 본문을 정확히 소비해야 한다(남는 바이트 = Trailing). 첫 위반이 결과. */
export function refDecode(ast: SchemaAst, target: string, bytes: Uint8Array): RefDecodeResult {
  const c = new Cursor(bytes);
  try {
    const value = decFields(ast, fieldsOf(ast, target), c);
    if (c.remaining !== 0) return { ok: false, error: "Trailing" };
    return { ok: true, value };
  } catch (e) {
    if (e instanceof DecodeFail) return { ok: false, error: e.code };
    throw e;
  }
}

function readPresence(c: Cursor, k: number): boolean[] {
  const nBytes = Math.ceil(k / 8);
  const at = c.take(nBytes);
  const present: boolean[] = [];
  for (let bit = 0; bit < nBytes * 8; bit++) {
    const set = ((c.bytes[at + (bit >> 3)]! >> (bit & 7)) & 1) === 1;
    if (bit >= k && set) throw new DecodeFail("BadPresence");
    if (bit < k) present.push(set);
  }
  return present;
}

function decFields(ast: SchemaAst, fields: readonly FieldDef[], c: Cursor): Record<string, unknown> {
  const k = fields.filter((f) => f.optional).length;
  const present = k > 0 ? readPresence(c, k) : [];
  const out: Record<string, unknown> = {};
  let oi = 0;
  for (const f of fields) {
    if (f.optional && !present[oi++]) continue;
    out[f.name] = decField(ast, f, c);
  }
  return out;
}

function decField(ast: SchemaAst, f: FieldDef, c: Cursor): unknown {
  if (f.type.kind !== "array") return decElem(ast, f.type, f.max, c);
  const n = c.view.getUint16(c.take(2), true);
  if (n > (f.max ?? U16_MAX)) throw new DecodeFail("OverMax");
  if (n < (f.min ?? 0)) throw new DecodeFail("UnderMin");
  // 고정 크기 원소면 내용 전에 남은 바이트부터 본다(protocol.md §2 — 개수 → 범위 → 남은 바이트 → 내용).
  const fixed = refFixedSize(ast, f.type.of);
  if (fixed !== null && n * fixed > c.remaining) throw new DecodeFail("Truncated");
  const out: unknown[] = [];
  for (let i = 0; i < n; i++) out.push(decElem(ast, f.type.of, f.ofMax, c));
  return out;
}

function decElem(ast: SchemaAst, t: ElemType, strMax: number | undefined, c: Cursor): unknown {
  if (t.kind === "struct") return decFields(ast, structOf(ast, t.name).fields, c);
  if (t.kind === "enum") {
    const e = ast.enums.get(t.name);
    if (e === undefined) throw new Error(`unknown enum ${t.name}`);
    const code = readInt(c, e.repr);
    const entry = e.values.find(([, v]) => v === code);
    if (entry === undefined) throw new DecodeFail("BadEnum");
    return entry[0];
  }
  return decPrim(t.prim, strMax, c);
}

function readInt(c: Cursor, t: IntType): number {
  const at = c.take(INT_BYTES[t]);
  switch (t) {
    case "u8":
      return c.view.getUint8(at);
    case "i8":
      return c.view.getInt8(at);
    case "u16":
      return c.view.getUint16(at, true);
    case "i16":
      return c.view.getInt16(at, true);
    case "u32":
      return c.view.getUint32(at, true);
    case "i32":
      return c.view.getInt32(at, true);
  }
}

function decPrim(prim: PrimType, strMax: number | undefined, c: Cursor): unknown {
  switch (prim) {
    case "string":
      return decString(c, strMax ?? U16_MAX);
    case "bool": {
      const b = c.view.getUint8(c.take(1));
      if (b > 1) throw new DecodeFail("BadBool");
      return b === 1;
    }
    case "f32":
      return finite(c.view.getFloat32(c.take(4), true));
    case "f64":
      return finite(c.view.getFloat64(c.take(8), true));
    default:
      return readInt(c, prim);
  }
}

function finite(v: number): number {
  if (!Number.isFinite(v)) throw new DecodeFail("NonFinite");
  return v;
}

function decString(c: Cursor, max: number): string {
  const len = c.view.getUint16(c.take(2), true);
  if (len > max) throw new DecodeFail("OverMax");
  const at = c.take(len);
  try {
    return utf8Decoder.decode(c.bytes.subarray(at, at + len));
  } catch {
    throw new DecodeFail("BadUtf8");
  }
}

/** 원소 고정 크기(layout.ts와 독립 구현) — string·optional/가변 필드가 있는 struct는 null. */
function refFixedSize(ast: SchemaAst, t: ElemType): number | null {
  if (t.kind === "prim") {
    if (t.prim === "string") return null;
    return t.prim === "bool" ? 1 : t.prim === "f32" ? 4 : t.prim === "f64" ? 8 : INT_BYTES[t.prim];
  }
  if (t.kind === "enum") {
    const e = ast.enums.get(t.name);
    return e === undefined ? null : INT_BYTES[e.repr];
  }
  let n = 0;
  for (const f of structOf(ast, t.name).fields) {
    if (f.optional || f.type.kind === "array") return null;
    const s = refFixedSize(ast, f.type);
    if (s === null) return null;
    n += s;
  }
  return n;
}
