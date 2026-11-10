// 생성 TS 코덱 ≡ 참조 인터프리터 — 합성 스키마(tools/codegen/fixture.ts: optional·presence 2·4바이트·enum u8/u16/u32·중첩 struct·
// string 배열·bool·f64·bodyOf)로 emitTsTypes·emitTsCodec 산출물을 임시 디렉터리에 만들어 (1) 서버와 같은 strict 설정으로 typecheck하고
// (2) import해서 refCodec과 바이트·디코드 결과·첫 오류 사유를 대조한다(무작위 왕복 + 변조 퍼징 + 전 길이 잘림 + 인코드 거부). 실물 스키마의
// SNAPSHOT_DELTA는 net/wireCodec.test.ts가 같은 방식으로 본다. 교차 언어(C#) 골든 대조는 wireGolden.test.ts.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { refDecode, refEncode } from "../../../tools/codegen/refCodec";
import { fixtureAst, mutate, randPayload, rng } from "../../../tools/codegen/fixture";
import { REPO, emitFixtureCodec, type EmittedCodec, type GenCodec, type Runtime } from "./fixtureCodec";

const ast = fixtureAst();

let emitted: EmittedCodec | undefined;
let dir = "";
let gen: GenCodec;
let rt: Runtime;

beforeAll(async () => {
  emitted = await emitFixtureCodec(ast, "wirecodec-fixture-");
  ({ dir, gen, rt } = emitted);
});

afterAll(() => {
  emitted?.dispose();
});

const PACKETS = ast.packets;
/** 합성 스키마 밖 id — 생성 디스패치의 default 분기. */
const UNKNOWN_ID = 0x16;
const idOf = (name: string): number => ast.packets.find((p) => p.name === name)!.id;
/** 코덱 단위(bodyOf는 대상). */
const unitOf = (name: string): string => ast.packets.find((p) => p.name === name)!.bodyOf ?? name;

function genEncode(id: number, p: object): Buffer {
  const out = Buffer.alloc(gen.bodySize(id, p));
  expect(gen.writeBody(id, p, out, 0)).toBe(out.length);
  return out;
}

/** 생성 디코드 결과를 refDecode 모양으로. */
function genDecode(id: number, body: Uint8Array): { ok: true; value: unknown } | { ok: false; error: string } {
  const v = gen.decodeBody(id, body);
  return v === null ? { ok: false, error: rt.wireErrorName(rt.lastDecodeError()) } : { ok: true, value: v };
}

test("산출물은 서버 strict 설정(exactOptionalPropertyTypes·noUncheckedIndexedAccess)으로 typecheck된다", async () => {
  const tsconfig = {
    compilerOptions: {
      target: "ESNext",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true,
      noImplicitAny: true,
      skipLibCheck: true,
      noEmit: true,
      types: ["bun-types"],
      typeRoots: [resolve(REPO, "node_modules/@types"), resolve(REPO, "node_modules")],
    },
    files: ["codec.generated.ts", "wireCodec.generated.ts"],
  };
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(tsconfig));
  const proc = Bun.spawn([process.execPath, resolve(REPO, "node_modules/typescript/bin/tsc"), "-p", join(dir, "tsconfig.json")], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  expect(out).toBe("");
  expect(code).toBe(0);
}, 60_000);

describe("디스패치", () => {
  test("B6 — 디스패치는 모든 패킷을 덮고 isBinaryPacket·BINARY_PACKET_IDS는 산출하지 않는다(전 id binary)", () => {
    expect(gen["isBinaryPacket"]).toBeUndefined();
    expect(gen["BINARY_PACKET_IDS"]).toBeUndefined();
    // default 분기는 reader를 건드리지 않아 직전 사유가 남는다 — id마다 사유를 지운 뒤 판정(대조군: 스키마 밖 id).
    const dispatched = (id: number): boolean => {
      rt.bodyReader.reset(Buffer.alloc(0));
      return gen.decodeBody(id, Buffer.alloc(0)) !== null || rt.lastDecodeError() !== 0;
    };
    expect(dispatched(UNKNOWN_ID)).toBe(false);
    for (const p of PACKETS) {
      expect([p.name, dispatched(p.id)]).toEqual([p.name, true]);
      expect(() => gen.bodySize(p.id, {})).not.toThrow(/unknown packet/);
    }
  });

  test("decodeC2S — C2S만 디코드, S2C·스키마 밖 id는 NO_CODEC", () => {
    const ping = genEncode(idOf("PING_BIN"), { t: 2.5 });
    expect(gen.decodeC2S(idOf("PING_BIN"), ping)).toEqual({ t: 2.5 });
    expect(gen.decodeC2S(idOf("PING_BIN"), ping.subarray(1))).toBeNull();
    expect(gen.decodeC2S(idOf("WORLD"), Buffer.alloc(0))).toBe(rt.NO_CODEC);
    expect(gen.decodeC2S(UNKNOWN_ID, Buffer.from("{}"))).toBe(rt.NO_CODEC);
    expect(gen.decodeC2S(0xbeef, Buffer.alloc(0))).toBe(rt.NO_CODEC);
  });

  test("스키마 밖 id — bodySize·writeBody는 WireEncodeError(unknown packet), decodeBody는 null", () => {
    expect(() => gen.bodySize(UNKNOWN_ID, {})).toThrow(rt.WireEncodeError);
    expect(() => gen.writeBody(UNKNOWN_ID, {}, Buffer.alloc(4), 0)).toThrow(/packet 0x16: unknown packet/);
    expect(gen.decodeBody(UNKNOWN_ID, Buffer.from("{}"))).toBeNull();
  });

  test("bodyOf(WORLD_COPY)는 대상과 같은 바이트, writeBody는 off 이후만 쓴다", () => {
    const w = randPayload(ast, "WORLD", rng(5));
    expect(genEncode(idOf("WORLD_COPY"), w).equals(genEncode(idOf("WORLD"), w))).toBe(true);
    const n = gen.bodySize(idOf("WORLD"), w);
    const big = Buffer.alloc(n + 8, 0xee);
    expect(gen.writeBody(idOf("WORLD"), w, big, 4)).toBe(4 + n);
    expect([...big.subarray(0, 4), ...big.subarray(4 + n)]).toEqual(Array(8).fill(0xee));
    expect(big.subarray(4, 4 + n).equals(Buffer.from(refEncode(ast, "WORLD", w)))).toBe(true);
  });
});

describe.each(PACKETS.map((p) => p.name))("%s ≡ refCodec", (name) => {
  const id = idOf(name);
  const unit = unitOf(name);

  test("무작위 왕복 400 — 같은 바이트, 같은 디코드 값", () => {
    const r = rng(id * 31);
    for (let i = 0; i < 400; i++) {
      const v = randPayload(ast, unit, r);
      const bytes = genEncode(id, v);
      expect(bytes.equals(Buffer.from(refEncode(ast, unit, v)))).toBe(true);
      expect(genDecode(id, bytes)).toEqual({ ok: true, value: v });
    }
  });

  test("변조 퍼징 2000 — 바이트 바꿈·잘림·덧붙임·끼움에서 결과(값 또는 첫 오류)가 같다", () => {
    const r = rng(id * 977);
    for (let i = 0; i < 2000; i++) {
      const base = genEncode(id, randPayload(ast, unit, r));
      const m = mutate(base, r);
      expect(genDecode(id, m)).toEqual(refDecode(ast, unit, m));
    }
  });

  test("전 길이 잘림 — 모든 접두가 같은 오류(Truncated 또는 먼저 걸리는 범위 위반)", () => {
    const r = rng(id * 13);
    for (let k = 0; k < 20; k++) {
      const full = genEncode(id, randPayload(ast, unit, r));
      for (let len = 0; len < full.length; len++) {
        const cut = full.subarray(0, len);
        expect(genDecode(id, cut)).toEqual(refDecode(ast, unit, cut));
      }
      expect(genDecode(id, Buffer.concat([full, Buffer.from([0])]))).toEqual({ ok: false, error: "Trailing" });
    }
  });
});

describe("인코드 거부 — 생성 bodySize와 refEncode가 같은 입력을 거부한다", () => {
  const cases: [string, string, (v: Record<string, unknown>) => void][] = [
    ["u8 초과", "ALL_PRIMS", (v) => { v["a"] = 256; }],
    ["i8 미만", "ALL_PRIMS", (v) => { v["d"] = -129; }],
    ["u32 소수", "ALL_PRIMS", (v) => { v["c"] = 0.5; }],
    ["i32 NaN", "ALL_PRIMS", (v) => { v["f"] = Number.NaN; }],
    ["f32 오버플로", "ALL_PRIMS", (v) => { v["g"] = 1e39; }],
    ["f32 Inf", "ALL_PRIMS", (v) => { v["g"] = Number.NEGATIVE_INFINITY; }],
    ["f64 NaN", "PING_BIN", (v) => { v["t"] = Number.NaN; }],
    ["bool 아님", "ALL_PRIMS", (v) => { v["i"] = 0; }],
    ["string 바이트 초과", "ALL_PRIMS", (v) => { v["s"] = "😀😀😀😀😀"; }],
    ["짝 없는 서로게이트", "ALL_PRIMS", (v) => { v["s"] = "a\udc00"; }],
    ["enum 미정의", "OPTS", (v) => { v["o3"] = "dragon"; }],
    ["array max 초과", "WORLD", (v) => { v["kinds"] = ["npc", "npc", "npc", "npc"]; }],
    ["array min 미달", "WORLD", (v) => { v["names"] = []; }],
    ["array 원소 string 초과", "WORLD", (v) => { v["names"] = ["x".repeat(13)]; }],
    ["struct 안 enum", "WORLD", (v) => { v["entities"] = [{ id: 1, kind: "ghost", pos: { x: 0, y: 0 } }]; }],
    ["struct 안 optional 배열 max", "OPTS", (v) => { v["o9"] = { id: 1, kind: "npc", pos: { x: 0, y: 0 }, tags: Array(5).fill({ label: "" }) }; }],
    ["optional u16 배열 원소 범위", "OPTS", (v) => { v["o5"] = [70000]; }],
    ["필수 struct 필드 누락(TypeError 아닌 WireEncodeError)", "WORLD", (v) => { v["entities"] = [{ id: 1, kind: "npc" }]; }],
    ["struct 배열 원소 null", "WORLD", (v) => { v["entities"] = [null]; }],
    ["optional struct null", "OPTS", (v) => { v["o4"] = null; }],
  ];
  test.each(cases)("%s", (_n, name, patch) => {
    const v = randPayload(ast, name, rng(name.length));
    patch(v);
    expect(() => refEncode(ast, name, v)).toThrow();
    expect(() => gen.bodySize(idOf(name), v)).toThrow(rt.WireEncodeError);
  });
});
