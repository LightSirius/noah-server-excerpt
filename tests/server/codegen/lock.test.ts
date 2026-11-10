// packets.lock.json 판정(tools/codegen/lock.ts) — 와이어 지문이 바뀌면 protoVersion bump 강제, frozen은 bump로도 못 바꿈. 이진 전환 B6:
// 모든 패킷이 binary라 JSON 상태의 바이트 불변 전이(freeform → 필드·string → enum — 종전 isSchematization·looseHash)는 없다 — 레이아웃의 어떤
// 변경이든 bump. lock 형식(B6)에서 항목의 encoding·looseHash·freeform 키가 빠졌고, 그 전 형식은 읽을 때 받아 버린다(base 브랜치 lock).
// 실물 lock은 현재 스키마와 같아야 한다(gen --check와 같은 판정).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeLock, evaluateBaseLock, evaluateLock, parseLock, serializeLock, type LockFile } from "../../../tools/codegen/lock";
import { parseSchema } from "../../../tools/codegen/schema";
import { fixtureRaw, type Raw } from "./rawFixture";

const REPO = resolve(import.meta.dir, "../../..");

/** 기준 스키마(fixture + frozen 패킷 1개)로 만든 lock과, 변형 스키마의 판정. */
function base(): Raw {
  const s = fixtureRaw();
  s["packets"]["HELLO_LIKE"] = {
    id: 0x01,
    direction: "C2S",
    frozen: true,
    fields: [{ name: "ver", type: "i32" }, { name: "note", type: "string", max: 32 }],
  };
  return s;
}

const baseLock = (): LockFile => computeLock(parseSchema(base()));

function verdict(mutate: (s: Raw) => void, lock: LockFile = baseLock()) {
  const s = base();
  mutate(s);
  return evaluateLock(parseSchema(s), lock);
}

const bump = (s: Raw): void => {
  s["protoVersion"] = (s["protoVersion"] as number) + 1;
};

describe("lock 없음·변화 없음", () => {
  test("lock이 없으면 새로 만든다(fresh), 같은 스키마면 위반 없음(same) — 결정적", () => {
    expect(evaluateLock(parseSchema(base()), null)).toMatchObject({ violations: [], mode: "fresh" });
    expect(verdict(() => {})).toEqual({ violations: [], next: baseLock(), mode: "same" });
    expect(serializeLock(baseLock())).toBe(serializeLock(computeLock(parseSchema(base()))));
  });

  test("_doc 변경·frozen 표시 추가는 지문 무관", () => {
    expect(verdict((s) => { s["packets"]["PING_BIN"]["_doc"] = "새 설명"; }).violations).toEqual([]);
    expect(verdict((s) => { s["packets"]["EMPTY_BIN"]["frozen"] = true; })).toMatchObject({ violations: [], mode: "same" });
  });
});

describe("와이어 변경 → protoVersion bump 필요", () => {
  test.each([
    ["필드 타입", (s: Raw) => { s["packets"]["PING_BIN"]["fields"][0]["type"] = "f32"; }, /패킷 PING_BIN 와이어 변경/],
    ["정수 폭(종전 JSON 상태는 bump 불요였다)", (s: Raw) => { s["packets"]["ALL_PRIMS"]["fields"][0]["type"] = "u16"; }, /패킷 ALL_PRIMS 와이어 변경/],
    ["max", (s: Raw) => { s["packets"]["ALL_PRIMS"]["fields"][9]["max"] = 17; }, /패킷 ALL_PRIMS 와이어 변경/],
    ["필드 순서", (s: Raw) => s["structs"]["Vec2"]["fields"].reverse(), /패킷 OPTS 와이어 변경/],
    ["필드 이름", (s: Raw) => { s["packets"]["PING_BIN"]["fields"][0]["name"] = "u"; }, /패킷 PING_BIN 와이어 변경/],
    ["optional", (s: Raw) => { s["packets"]["PING_BIN"]["fields"][0]["optional"] = true; }, /패킷 PING_BIN 와이어 변경/],
    ["enum 코드", (s: Raw) => { s["enums"]["Kind"]["values"]["npc"] = 9; }, /패킷 WORLD 와이어 변경/],
    ["enum 값 이름(바이트는 같아도 코드 계약)", (s: Raw) => {
      delete s["enums"]["Kind"]["values"]["npc"];
      s["enums"]["Kind"]["values"]["civilian"] = 2;
    }, /패킷 WORLD 와이어 변경/],
    ["id", (s: Raw) => { s["packets"]["EMPTY_BIN"]["id"] = 0x77; }, /패킷 EMPTY_BIN 와이어 변경/],
    ["방향", (s: Raw) => { s["packets"]["EMPTY_BIN"]["direction"] = "S2C"; }, /패킷 EMPTY_BIN 와이어 변경/],
    ["새 패킷", (s: Raw) => { s["packets"]["NEW_ONE"] = { id: 0x50, direction: "S2C", fields: [] }; }, /새 패킷 NEW_ONE/],
    ["패킷 삭제", (s: Raw) => delete s["packets"]["EMPTY_BIN"], /패킷 EMPTY_BIN 삭제/],
    ["프레임 헤더", (s: Raw) => { s["header"]["endian"] = "little"; }, /프레임 header 블록/],
  ])("%s", (_n, mutate, pattern) => {
    const v = verdict(mutate);
    expect(v.mode).toBe("same");
    expect(v.violations.some((x) => pattern.test(x) && /protoVersion\(7\)을 올려야/.test(x))).toBe(true);
    // 같은 변경 + bump는 통과하고 lock을 갈아 쓴다.
    const bumped = verdict((s) => {
      mutate(s);
      bump(s);
    });
    expect(bumped).toMatchObject({ violations: [], mode: "bump" });
    expect(bumped.next.protoVersion).toBe(8);
  });

  test("protoVersion은 lock보다 낮출 수 없다", () => {
    expect(verdict((s) => { s["protoVersion"] = 6; }).violations).toContain("protoVersion 6 < lock 7 — 내릴 수 없다");
  });
});

describe("base lock(CI) — lock 삭제·손편집 우회 차단", () => {
  test("작업 트리 lock을 다시 만들어 통과시켜도 base lock 대비 와이어 변경은 bump를 요구한다", () => {
    const changed = base();
    changed["packets"]["PING_BIN"]["fields"][0]["type"] = "f32";
    const ast = parseSchema(changed);
    expect(evaluateLock(ast, computeLock(ast)).violations).toEqual([]);
    expect(evaluateBaseLock(ast, baseLock()).some((v) => /^\[base lock\] 패킷 PING_BIN 와이어 변경/.test(v))).toBe(true);
    bump(changed);
    expect(evaluateBaseLock(parseSchema(changed), baseLock())).toEqual([]);
  });
});

/** B6 이전 형식으로 직렬화 — 항목마다 encoding을 끼우고(전 패킷 binary 시절), 지정 항목은 JSON 시절 키로 바꾼다. */
function legacyText(lock: LockFile, jsonEntries: readonly string[] = []): string {
  const packets = Object.fromEntries(
    Object.entries(lock.packets).map(([name, e]) => {
      const json = jsonEntries.includes(name);
      const legacy = json ? { ...e, encoding: "json", wireHash: "0000000000000000", looseHash: "1111111111111111", freeform: true } : { ...e, encoding: "binary" };
      return [name, legacy];
    }),
  );
  return JSON.stringify({ _doc: "old", protoVersion: lock.protoVersion, headerHash: lock.headerHash, packets });
}

describe("lock 형식(B6) — 종전 형식 읽기·지문 연속", () => {
  test("B6 이전 형식(항목에 encoding \"binary\")을 읽으면 지문이 같아 위반 없음 — encoding 키는 버린다", () => {
    const parsed = parseLock(legacyText(baseLock()));
    expect(parsed).toEqual(baseLock());
    expect(evaluateLock(parseSchema(base()), parsed)).toMatchObject({ violations: [], mode: "same" });
    expect(evaluateBaseLock(parseSchema(base()), parsed)).toEqual([]);
  });

  test("B6 이전 JSON 패킷 항목(encoding json·looseHash·freeform)도 읽는다 — 같은 protoVersion이면 지문이 달라 위반, bump면 통과", () => {
    const parsed = parseLock(legacyText(baseLock(), ["EMPTY_BIN"]));
    expect(parsed.packets["EMPTY_BIN"]).toEqual({ ...baseLock().packets["EMPTY_BIN"]!, wireHash: "0000000000000000" });
    expect(verdict(() => {}, parsed).violations.some((x) => /패킷 EMPTY_BIN 와이어 변경\(0000000000000000 → /.test(x))).toBe(true);
    expect(verdict(bump, parsed)).toMatchObject({ violations: [], mode: "bump" });
  });

  test("wireHash는 B6 형식 변경 전후로 같다 — 실물 HELLO(frozen, 고정 필드)의 지문은 B6 이전 lock 값 그대로", () => {
    const ast = parseSchema(JSON.parse(readFileSync(resolve(REPO, "shared/schema/packets.json"), "utf8")));
    const hello = computeLock(ast).packets["HELLO"]!;
    expect([hello.wireHash, hello.layoutHash]).toEqual(["8511dfdd7c2ff1fd", "1d7f342b1417dfb9"]);
  });
});

describe("frozen — bump로도 못 바꾼다", () => {
  test.each([
    ["필드 타입", (s: Raw) => { s["packets"]["HELLO_LIKE"]["fields"][0]["type"] = "u32"; }, /HELLO_LIKE의 레이아웃.*변경 금지/],
    ["필드 추가", (s: Raw) => s["packets"]["HELLO_LIKE"]["fields"].push({ name: "x", type: "u8" }), /HELLO_LIKE의 레이아웃/],
    ["frozen 해제", (s: Raw) => { s["packets"]["HELLO_LIKE"]["frozen"] = false; }, /HELLO_LIKE의 frozen 해제 금지/],
    ["삭제", (s: Raw) => delete s["packets"]["HELLO_LIKE"], /frozen 패킷 HELLO_LIKE 삭제 금지/],
  ])("%s", (_n, mutate, pattern) => {
    const v = verdict((s) => {
      mutate(s);
      bump(s);
    });
    expect(v.violations.some((x) => pattern.test(x))).toBe(true);
  });

  test("max 변경은 bump와 함께라면 허용(레이아웃 = 필드·정확한 타입·optional)", () => {
    const v = verdict((s) => {
      s["packets"]["HELLO_LIKE"]["fields"][1]["max"] = 64;
      bump(s);
    });
    expect(v).toMatchObject({ violations: [], mode: "bump" });
    expect(v.next.packets["HELLO_LIKE"]!.layoutHash).toBe(baseLock().packets["HELLO_LIKE"]!.layoutHash);
    expect(v.next.packets["HELLO_LIKE"]!.wireHash).not.toBe(baseLock().packets["HELLO_LIKE"]!.wireHash);
  });
});

describe("직렬화·실물", () => {
  test("serializeLock ↔ parseLock 왕복(항목 = id·direction·wireHash·layoutHash·frozen?), 손상은 throw", () => {
    const lock = baseLock();
    expect(parseLock(serializeLock(lock))).toEqual(lock);
    expect(serializeLock(lock)).not.toMatch(/"encoding"|"looseHash"|"freeform"/);
    expect(() => parseLock("[]")).toThrow();
    const entry = (e: string): string => `{"protoVersion":1,"headerHash":"x","packets":{"A":${e}}}`;
    expect(() => parseLock(entry('{"id":1,"direction":"C2S","encoding":"xml","wireHash":"a","layoutHash":"b"}'))).toThrow(/A 항목 손상/);
    expect(() => parseLock(entry('{"id":1,"direction":"C2S","wireHash":"a","layoutHash":"b","freeform":false}'))).toThrow(/A 항목 손상/);
    expect(() => parseLock(entry('{"direction":"C2S","wireHash":"a","layoutHash":"b"}'))).toThrow(/A 항목 손상/);
    expect(() => parseLock(entry('{"id":1,"direction":"C2S","wireHash":"a","layoutHash":"b","frozen":false}'))).toThrow(/A 항목 손상/);
  });

  test("실물 shared/schema/packets.lock.json = 현재 packets.json의 지문(위반 없음)", () => {
    const ast = parseSchema(JSON.parse(readFileSync(resolve(REPO, "shared/schema/packets.json"), "utf8")));
    const text = readFileSync(resolve(REPO, "shared/schema/packets.lock.json"), "utf8").replace(/\r\n/g, "\n");
    const v = evaluateLock(ast, parseLock(text));
    expect(v.violations).toEqual([]);
    expect(serializeLock(v.next)).toBe(text);
    expect(Object.entries(v.next.packets).filter(([, e]) => e.frozen).map(([n]) => n)).toEqual(["HELLO", "HELLO_ACK", "KICK"]);
  });
});
