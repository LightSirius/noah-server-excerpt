// 바이너리 레이아웃 계산(tools/codegen/layout.ts) — presence 바이트·고정 크기·최악 크기·고정 머리 오프셋.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fixedPrefix, fixedSize, presenceBytes, worstCaseSize } from "../../../tools/codegen/layout";
import { parseSchema, type FieldDef } from "../../../tools/codegen/schema";
import { fixtureAst } from "../../../tools/codegen/fixture";
import { fixtureRaw } from "./rawFixture";

const ast = fixtureAst();
const fieldsOf = (name: string): readonly FieldDef[] =>
  ast.packets.find((p) => p.name === name)?.fields ?? ast.structs.get(name)!.fields;

describe("presenceBytes", () => {
  test("optional 0개 = 0, 1~8개 = 1, 9개 = 2", () => {
    expect(presenceBytes(fieldsOf("ALL_PRIMS"))).toBe(0);
    expect(presenceBytes(fieldsOf("Tag"))).toBe(1);
    expect(presenceBytes(fieldsOf("OPTS"))).toBe(2);
  });
});

describe("fixedSize", () => {
  test("원시 합 = 1+2+4+1+2+4+4+8+1 + string 가변 → null, 원시만이면 합", () => {
    expect(fixedSize(ast, fieldsOf("ALL_PRIMS"))).toBeNull();
    expect(fixedSize(ast, fieldsOf("ALL_PRIMS").slice(0, 9))).toBe(27);
    expect(fixedSize(ast, fieldsOf("PING_BIN"))).toBe(8);
    expect(fixedSize(ast, fieldsOf("EMPTY_BIN"))).toBe(0);
  });

  test("고정 struct·enum repr 폭, optional·array가 있으면 null", () => {
    expect(fixedSize(ast, fieldsOf("Vec2"))).toBe(8);
    expect(fixedSize(ast, fieldsOf("Tag"))).toBeNull();
    expect(fixedSize(ast, fieldsOf("Entity"))).toBeNull();
    expect(fixedSize(ast, fieldsOf("Entity").slice(0, 3))).toBe(4 + 1 + 8);
    expect(fixedSize(ast, [{ name: "w", type: { kind: "enum", name: "Wide" }, optional: false }])).toBe(2);
    expect(fixedSize(ast, [{ name: "h", type: { kind: "enum", name: "Huge" }, optional: false }])).toBe(4);
  });
});

describe("worstCaseSize", () => {
  test("SNAPSHOT_DELTA = 10 + 5460 × 12 = 65530", () => {
    const real = parseSchema(JSON.parse(readFileSync(resolve(import.meta.dir, "../../../shared/schema/packets.json"), "utf8")));
    expect(worstCaseSize(real, real.packets.find((p) => p.name === "SNAPSHOT_DELTA")!.fields)).toBe(65530);
  });

  test("string = 2 + max, optional도 존재로 셈, presence 포함", () => {
    expect(worstCaseSize(ast, fieldsOf("Tag"))).toBe(1 + (2 + 8) + 2);
    // Entity = id 4 + kind 1 + pos 8 + presence 1 + name (2+24) + tags (2 + 4 × Tag 13)
    expect(worstCaseSize(ast, fieldsOf("Entity"))).toBe(4 + 1 + 8 + 1 + 26 + 2 + 4 * 13);
  });

  test("array<string> = 2 + max × (2 + ofMax)", () => {
    const names = fieldsOf("WORLD").filter((f) => f.name === "names");
    expect(worstCaseSize(ast, names)).toBe(2 + 5 * (2 + 12));
  });
});

describe("fixedPrefix", () => {
  test("SNAPSHOT_DELTA 꼴 — 고정 필드 + 첫 array의 개수 접두(count)", () => {
    const raw = fixtureRaw();
    raw["packets"]["DELTA_LIKE"] = {
      id: 0x40,
      direction: "S2C",
      fields: [
        { name: "tickIndex", type: "u32" },
        { name: "ackSeq", type: "u32" },
        { name: "updates", type: "array", of: "Vec2", max: 10 },
        { name: "after", type: "u8" },
      ],
    };
    const a = parseSchema(raw);
    const p = fixedPrefix(a, a.packets.find((x) => x.name === "DELTA_LIKE")!.fields);
    expect(p.offsets).toEqual([["tickIndex", 0], ["ackSeq", 4], ["count", 8]]);
    expect(p.bytes).toBe(10);
  });

  test("string이 첫 가변이면 length, 앞 필드가 같은 이름이면 <필드>Count", () => {
    const prims = fixedPrefix(ast, fieldsOf("ALL_PRIMS"));
    expect(prims.offsets.at(-1)).toEqual(["length", 27]);
    expect(prims.bytes).toBe(29);
    const clash = fixedPrefix(ast, [
      { name: "count", type: { kind: "prim", prim: "u16" }, optional: false },
      { name: "items", type: { kind: "array", of: { kind: "prim", prim: "u8" } }, optional: false, max: 4 },
    ]);
    expect(clash.offsets).toEqual([["count", 0], ["itemsCount", 2]]);
  });

  test("presence 뒤에서 시작하고, optional·가변 struct 앞에서 멈춘다", () => {
    expect(fixedPrefix(ast, fieldsOf("OPTS")).offsets).toEqual([]); // 첫 필드가 optional.
    expect(fixedPrefix(ast, fieldsOf("Tag"))).toEqual({ offsets: [["length", 1]], bytes: 3 });
    expect(fixedPrefix(ast, fieldsOf("Entity"))).toEqual({ offsets: [["id", 1], ["kind", 5], ["pos", 6]], bytes: 14 });
  });
});
