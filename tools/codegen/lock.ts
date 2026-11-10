// shared/schema/packets.lock.json — 패킷별 와이어 지문 + protoVersion. "와이어를 바꾸는 커밋은 protoVersion을 올린다"를 기계로 강제한다.
//
// 지문(sha256 앞 16 hex, _doc 제외):
//   wireHash   = {id, direction, encoding "binary", 레이아웃} — 레이아웃은 필드 순서·이름·정확한 타입·optional·max/min/ofMax·enum (이름, 코드) 전부.
//                encoding은 상수다(이진 전환 B6 — 모든 패킷 본문이 binary). 입력에 남긴 것은 B6 이전 lock과 같은 지문이 나오게 하기 위해서다
//                (빼면 모든 wireHash가 바뀌어 와이어 불변 커밋에도 protoVersion bump가 강제된다).
//   layoutHash = {id, direction, 필드 순서·이름·정확한 타입·optional·enum} — max/min 제외. frozen 패킷(HELLO·HELLO_ACK·KICK)은
//                영원히 이 값이 같아야 한다(protoVersion을 올려도) — max 부여는 허용.
//   headerHash = 프레임 헤더 블록 + WIRE_RULES_VERSION(코덱 규칙 자체가 바뀌어도 bump를 강제).
// 판정(evaluateLock): lock 없음 → 새로 만든다. protoVersion이 lock보다 크면(bump) → 새 지문으로 갈아 쓴다. 같으면 → 지문이 하나라도
// 다르면(패킷 추가·삭제·변경, 헤더 변경) 위반 "protoVersion bump 필요". 위반이 없으면 lock = 현재 지문(메타데이터만 갱신된다).
// frozen 위반(삭제·해제·layoutHash 변경)은 protoVersion과 무관하게 항상 위반. lock보다 낮은 protoVersion도 위반.
// lock 파일 삭제·손편집 우회는 CI가 base 브랜치의 lock으로도 판정해 막는다(gen.ts --base-lock, evaluateBaseLock).
// 형식(B6): 항목 = {id, direction, wireHash, layoutHash, frozen?}. B6 이전 형식의 키(encoding·looseHash·freeform — JSON 패킷 지문 시절)는
// 읽을 때 모양만 보고 버린다(base 브랜치 lock 판정) — JSON 패킷 항목의 wireHash는 현재 지문과 다르므로 같은 protoVersion이면 위반이다.

import { createHash } from "node:crypto";
import { WIRE_RULES_VERSION } from "./layout";
import type { Direction, ElemType, FieldDef, SchemaAst, TypeTable } from "./schema";

export interface LockEntry {
  readonly id: number;
  readonly direction: Direction;
  readonly wireHash: string;
  readonly layoutHash: string;
  readonly frozen?: true;
}

export interface LockFile {
  readonly protoVersion: number;
  readonly headerHash: string;
  readonly packets: Readonly<Record<string, LockEntry>>;
}

export interface LockVerdict {
  readonly violations: readonly string[];
  /** 위반이 없을 때 써야 할 lock. */
  readonly next: LockFile;
  readonly mode: "fresh" | "bump" | "same";
}

/** wireHash 입력의 인코딩 상수 — B6 이전 lock과 지문 연속(머리 주석). */
const WIRE_HASH_ENCODING = "binary";

function hash(v: unknown): string {
  return createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
}

function structFields(types: TypeTable, name: string): readonly FieldDef[] {
  const s = types.structs.get(name);
  if (s === undefined) throw new Error(`unknown struct ${name}`);
  return s.fields;
}

function enumRep(types: TypeTable, name: string): unknown {
  const e = types.enums.get(name);
  if (e === undefined) throw new Error(`unknown enum ${name}`);
  return { enum: e.repr, values: [...e.values].sort((a, b) => a[1] - b[1]) };
}

function binaryElem(types: TypeTable, t: ElemType): unknown {
  if (t.kind === "struct") return binaryFields(types, structFields(types, t.name));
  if (t.kind === "enum") return enumRep(types, t.name);
  return t.prim;
}

function binaryFields(types: TypeTable, fields: readonly FieldDef[]): unknown {
  return fields.map((f) => ({
    n: f.name,
    t: f.type.kind === "array" ? { array: binaryElem(types, f.type.of) } : binaryElem(types, f.type),
    o: f.optional,
    max: f.max ?? null,
    min: f.min ?? null,
    ofMax: f.ofMax ?? null,
  }));
}

function frozenElem(types: TypeTable, t: ElemType): unknown {
  if (t.kind === "struct") return frozenFields(types, structFields(types, t.name));
  if (t.kind === "enum") return enumRep(types, t.name);
  return t.prim;
}

function frozenFields(types: TypeTable, fields: readonly FieldDef[]): unknown {
  return fields.map((f) => [f.name, f.type.kind === "array" ? ["array", frozenElem(types, f.type.of)] : frozenElem(types, f.type), f.optional]);
}

/** 현재 스키마의 지문. */
export function computeLock(ast: SchemaAst): LockFile {
  const packets: Record<string, LockEntry> = {};
  for (const p of ast.packets) {
    packets[p.name] = {
      id: p.id,
      direction: p.direction,
      wireHash: hash({ id: p.id, direction: p.direction, encoding: WIRE_HASH_ENCODING, layout: binaryFields(ast, p.fields) }),
      layoutHash: hash({ id: p.id, direction: p.direction, layout: frozenFields(ast, p.fields) }),
      ...(p.frozen ? { frozen: true as const } : {}),
    };
  }
  const header = Object.fromEntries(Object.entries(ast.header).sort(([a], [b]) => (a < b ? -1 : 1)));
  return { protoVersion: ast.protoVersion, headerHash: hash({ header, wireRules: WIRE_RULES_VERSION }), packets };
}

function frozenViolations(lock: LockFile, cur: LockFile): string[] {
  const out: string[] = [];
  for (const [name, e] of Object.entries(lock.packets)) {
    if (e.frozen !== true) continue;
    const now = cur.packets[name];
    if (now === undefined) out.push(`frozen 패킷 ${name} 삭제 금지`);
    else if (now.frozen !== true) out.push(`frozen 패킷 ${name}의 frozen 해제 금지`);
    else if (now.layoutHash !== e.layoutHash) out.push(`frozen 패킷 ${name}의 레이아웃(필드·타입·optional) 변경 금지 — protoVersion을 올려도 안 된다`);
  }
  return out;
}

function wireViolations(lock: LockFile, cur: LockFile): string[] {
  const bump = `protoVersion(${cur.protoVersion})을 올려야 한다`;
  const out: string[] = [];
  if (lock.headerHash !== cur.headerHash) out.push(`프레임 header 블록·코덱 규칙(WIRE_RULES_VERSION) 변경 — ${bump}`);
  for (const [name, now] of Object.entries(cur.packets)) {
    const was = lock.packets[name];
    if (was === undefined) out.push(`새 패킷 ${name} — ${bump}`);
    else if (was.wireHash !== now.wireHash) out.push(`패킷 ${name} 와이어 변경(${was.wireHash} → ${now.wireHash}) — ${bump}`);
  }
  for (const name of Object.keys(lock.packets)) if (cur.packets[name] === undefined) out.push(`패킷 ${name} 삭제 — ${bump}`);
  return out;
}

/** 기존 lock 대비 현재 스키마 판정. */
export function evaluateLock(ast: SchemaAst, existing: LockFile | null): LockVerdict {
  const cur = computeLock(ast);
  if (existing === null) return { violations: [], next: cur, mode: "fresh" };
  const violations = frozenViolations(existing, cur);
  if (cur.protoVersion < existing.protoVersion) {
    violations.push(`protoVersion ${cur.protoVersion} < lock ${existing.protoVersion} — 내릴 수 없다`);
    return { violations, next: cur, mode: "same" };
  }
  if (cur.protoVersion > existing.protoVersion) return { violations, next: cur, mode: "bump" };
  return { violations: [...violations, ...wireViolations(existing, cur)], next: cur, mode: "same" };
}

/**
 * base 브랜치의 lock 대비 판정(CI — lock 삭제·손편집 우회 차단). 작업 트리의 lock이 아니라 머지 대상의 lock으로 같은 규칙을 돌린다:
 * 그 사이 와이어가 바뀌었으면 protoVersion도 올라가 있어야 한다.
 */
export function evaluateBaseLock(ast: SchemaAst, base: LockFile): string[] {
  return evaluateLock(ast, base).violations.map((v) => `[base lock] ${v}`);
}

const LOCK_DOC =
  "코드젠 관리(tools/codegen/lock.ts) — 손으로 고치지 말 것. wireHash가 바뀌면 packets.json protoVersion bump가 필요하고, frozen 패킷은 layoutHash가 영구 고정이다. 규칙: docs/adr/0003-binary-body-codec.md.";

/** 결정적 직렬화 — 패킷당 한 줄(리뷰 diff가 패킷 단위로 보이게). */
export function serializeLock(lock: LockFile): string {
  const entries = Object.entries(lock.packets).map(([name, e]) => `    ${JSON.stringify(name)}: ${JSON.stringify(e)}`);
  return [
    "{",
    `  "_doc": ${JSON.stringify(LOCK_DOC)},`,
    `  "protoVersion": ${lock.protoVersion},`,
    `  "headerHash": ${JSON.stringify(lock.headerHash)},`,
    '  "packets": {',
    entries.join(",\n"),
    "  }",
    "}",
    "",
  ].join("\n");
}

/** B6 이전 형식의 키(encoding·looseHash·freeform) — 모양만 본다. */
function legacyKeysOk(o: Record<string, unknown>): boolean {
  const enc = o["encoding"];
  const loose = o["looseHash"];
  const free = o["freeform"];
  return (
    (enc === undefined || enc === "json" || enc === "binary") &&
    (loose === undefined || typeof loose === "string") &&
    (free === undefined || free === true)
  );
}

/** lock 항목 → LockEntry(B6 이전 키는 버린다). 모양이 틀리면 null. */
function toEntry(v: unknown): LockEntry | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const { id, direction, wireHash, layoutHash, frozen } = o;
  if (typeof id !== "number" || (direction !== "C2S" && direction !== "S2C")) return null;
  if (typeof wireHash !== "string" || typeof layoutHash !== "string") return null;
  if ((frozen !== undefined && frozen !== true) || !legacyKeysOk(o)) return null;
  return { id, direction, wireHash, layoutHash, ...(frozen === true ? { frozen: true as const } : {}) };
}

/** lock 파일 텍스트 → LockFile. 모양이 틀리면 throw(손상 — 사람이 확인할 일). */
export function parseLock(text: string): LockFile {
  const raw: unknown = JSON.parse(text);
  if (typeof raw !== "object" || raw === null) throw new Error("packets.lock.json: 객체가 아니다");
  const o = raw as Record<string, unknown>;
  const packets = o["packets"];
  if (typeof o["protoVersion"] !== "number" || typeof o["headerHash"] !== "string" || typeof packets !== "object" || packets === null) {
    throw new Error("packets.lock.json: protoVersion·headerHash·packets 필요");
  }
  const entries: Record<string, LockEntry> = {};
  for (const [name, e] of Object.entries(packets)) {
    const entry = toEntry(e);
    if (entry === null) throw new Error(`packets.lock.json: ${name} 항목 손상`);
    entries[name] = entry;
  }
  return { protoVersion: o["protoVersion"], headerHash: o["headerHash"], packets: entries };
}
