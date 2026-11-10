// 교차 언어 골든(client/Noah/Assets/Tests/EditMode/Golden/wire.golden.json — tools/codegen/golden.ts가 refCodec으로 생성):
// (1) 커밋된 골든 = 지금 스키마·픽스처로 다시 만든 결과(gen --check와 같은 판정 — 실패 = `cd tools/codegen && bun run gen` 누락),
// (2) 사유 코드표 = 서버 WIRE_ERROR, (3) 런타임 isValidUtf8 = utf8 벡터(WHATWG 판정), (4) 생성 TS 코덱(실물 + 픽스처 임시 산출물)이 모든
// 사례에 동의 — 유효 = 디코드 값·인코드 바이트, 오류 = 같은 첫 위반 사유. C# 쪽은 같은 파일을 EditMode WireCodecGoldenTests가 본다.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildGolden, fromGoldenPayload, isValidCase, serializeGolden, toGoldenPayload, type GoldenCase, type GoldenFile, type SchemaLabel } from "../../../tools/codegen/golden";
import { fixtureAst } from "../../../tools/codegen/fixture";
import { parseSchema, type SchemaAst } from "../../../tools/codegen/schema";
import * as realGen from "../../../server/src/net/wireCodec.generated";
import * as realRt from "../../../server/src/net/wire/runtime";
import { REPO, emitFixtureCodec, type EmittedCodec, type GenCodec, type Runtime } from "./fixtureCodec";

const GOLDEN_PATH = resolve(REPO, "client/Noah/Assets/Tests/EditMode/Golden/wire.golden.json");
const real = parseSchema(JSON.parse(readFileSync(resolve(REPO, "shared/schema/packets.json"), "utf8")));
const fx = fixtureAst();
const committedText = readFileSync(GOLDEN_PATH, "utf8").replace(/\r\n/g, "\n");
const golden = JSON.parse(committedText) as GoldenFile;

let emitted: EmittedCodec | undefined;

beforeAll(async () => {
  emitted = await emitFixtureCodec(fx, "wiregolden-fixture-");
});

afterAll(() => {
  emitted?.dispose();
});

/** 스키마 하나의 생성 TS 코덱 — 실물은 server/src/net/wireCodec.generated.ts, 픽스처는 임시 산출물. */
function codecOf(label: SchemaLabel): { ast: SchemaAst; gen: GenCodec; rt: Runtime } {
  if (label === "real") return { ast: real, gen: realGen, rt: realRt };
  if (emitted === undefined) throw new Error("fixture codec not emitted");
  return { ast: fx, gen: emitted.gen, rt: emitted.rt };
}

function encode(gen: GenCodec, id: number, p: object): string {
  const out = Buffer.alloc(gen.bodySize(id, p));
  expect(gen.writeBody(id, p, out, 0)).toBe(out.length);
  return out.toString("hex");
}

/** 사례 하나의 판정 결과 — 불일치 설명 또는 null. */
function check(label: SchemaLabel, c: GoldenCase): string | null {
  const { ast, gen, rt } = codecOf(label);
  const decoded = gen.decodeBody(c.id, Buffer.from(c.hex, "hex"));
  if (!isValidCase(c)) {
    if (decoded !== null) return "디코드 성공 — 기대 " + c.error;
    const got = rt.wireErrorName(rt.lastDecodeError());
    return got === c.error ? null : `사유 ${got} ≠ ${c.error}`;
  }
  if (decoded === null) return `디코드 실패 ${rt.wireErrorName(rt.lastDecodeError())}`;
  const asGolden = toGoldenPayload(ast, c.packet, decoded as Record<string, unknown>);
  if (!Bun.deepEquals(asGolden, c.payload, true)) return `디코드 값 ${JSON.stringify(asGolden)} ≠ ${JSON.stringify(c.payload)}`;
  const hex = encode(gen, c.id, fromGoldenPayload(ast, c.packet, c.payload));
  return hex === c.hex ? null : `인코드 ${hex} ≠ ${c.hex}`;
}

describe("골든 파일", () => {
  test("커밋된 골든 = 현행 스키마·픽스처 재생성 결과", () => {
    expect(committedText).toBe(serializeGolden(buildGolden(real, fx)));
  });

  test("errors 표 = 서버 WIRE_ERROR(None 제외)", () => {
    const { None: _none, ...codes } = realRt.WIRE_ERROR;
    expect(golden.errors).toEqual(codes);
  });

  test("utf8 벡터 — 런타임 isValidUtf8이 WHATWG 판정과 같다", () => {
    expect(golden.utf8.length).toBeGreaterThan(100);
    for (const [hex, valid] of golden.utf8) {
      const b = Buffer.from(hex, "hex");
      expect([hex, realRt.isValidUtf8(b, 0, b.length)]).toEqual([hex, valid]);
    }
  });
});

describe.each(["real", "fixture"] as const)("%s 생성 TS 코덱 ≡ 골든", (label) => {
  const schema = golden.schemas[label];

  test("패킷 표 = 스키마 패킷 전부(이름·id 순서 그대로 — B6 이후 encoding 열 없음), 모든 패킷에 사례가 있다", () => {
    const { ast } = codecOf(label);
    expect(schema.packets.map((p) => [p.name, p.id])).toEqual(ast.packets.map((p) => [p.name, p.id]));
    expect(schema.packets.every((p) => !("encoding" in p))).toBe(true);
    const covered = new Set(schema.cases.map((c) => c.packet));
    expect(ast.packets.filter((p) => !covered.has(p.name)).map((p) => p.name)).toEqual([]);
  });

  test("모든 사례 — 유효(디코드 값·인코드 바이트)·오류(첫 위반 사유)", () => {
    const valid = schema.cases.filter(isValidCase).length;
    expect(valid).toBeGreaterThan(0);
    expect(schema.cases.length - valid).toBeGreaterThan(0);
    const failures = schema.cases.flatMap((c) => {
      const f = check(label, c);
      return f === null ? [] : [`${c.name}: ${f}`];
    });
    expect(failures).toEqual([]);
  });
});
