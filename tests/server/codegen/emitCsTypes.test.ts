// C# 타입 산출물의 필드 상한 상수 class WireLimits(tools/codegen/emitCsTypes.ts, B2b) — TS WIRE_LIMITS와 같은 값·이름 규칙, 이름 충돌은 산출 전 throw.

import { describe, expect, test } from "bun:test";
import { emitCsTypes } from "../../../tools/codegen/emitCsTypes";
import { parseSchema } from "../../../tools/codegen/schema";
import { toPascalCase } from "../../../tools/codegen/names";
import { fixtureRaw } from "./rawFixture";

/** 산출물의 WireLimits 블록 상수 — 이름 → 값. */
function limitsOf(cs: string): Map<string, number> {
  const block = /public static class WireLimits\s*\{([^}]*)\}/.exec(cs);
  if (block === null) throw new Error("WireLimits 블록 없음");
  return new Map([...block[1]!.matchAll(/public const int (\w+) = (\d+);/g)].map((m) => [m[1]!, Number(m[2])]));
}

describe("emitCsTypes — WireLimits", () => {
  test("max·ofMax가 있는 필드마다 <소유자 Pascal><필드 Pascal>Max(…ItemMax) = 스키마 값", () => {
    const ast = parseSchema(fixtureRaw());
    const got = limitsOf(emitCsTypes(ast, "x"));
    const want = new Map<string, number>();
    const owners = [
      ...[...ast.structs.values()].map((s) => [s.name, s.fields] as const),
      ...ast.packets.filter((p) => p.bodyOf === undefined).map((p) => [toPascalCase(p.name), p.fields] as const),
    ];
    for (const [owner, fields] of owners) {
      for (const f of fields) {
        if (f.max !== undefined) want.set(`${owner}${toPascalCase(f.name)}Max`, f.max);
        if (f.ofMax !== undefined) want.set(`${owner}${toPascalCase(f.name)}ItemMax`, f.ofMax);
      }
    }
    expect(want.size).toBeGreaterThan(0);
    expect(got).toEqual(want);
  });

  test("이름이 겹치는 스키마(소유자 Ab의 cD vs 소유자 AbC의 d)는 산출 전에 throw", () => {
    const raw = fixtureRaw();
    raw["structs"]["Ab"] = { fields: [{ name: "cD", type: "string", max: 4 }] };
    raw["structs"]["AbC"] = { fields: [{ name: "d", type: "string", max: 4 }] };
    // 미사용 struct는 스키마가 거부한다(B6) — 두 struct를 쓰는 패킷.
    raw["packets"]["AB_USER"] = { id: 0x40, direction: "S2C", fields: [{ name: "ab", type: "Ab" }, { name: "abC", type: "AbC" }] };
    const ast = parseSchema(raw);
    expect(() => emitCsTypes(ast, "x")).toThrow(/WireLimits 상수명 충돌 AbCDMax/);
  });

  test("WireLimits는 예약 타입명 — 같은 이름의 struct는 스키마 검증이 거부", () => {
    const raw = fixtureRaw();
    raw["structs"]["WireLimits"] = { fields: [{ name: "a", type: "u8" }] };
    expect(() => parseSchema(raw)).toThrow(/WireLimits: 산출물 예약 식별자/);
  });
});
