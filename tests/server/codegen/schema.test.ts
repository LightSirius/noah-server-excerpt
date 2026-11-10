// 코드젠 v2 스키마 검증(tools/codegen/schema.ts) — 규칙마다 위반 1건을 만들어 SchemaError 메시지를 고정하고, 실물 packets.json과
// 합성 스키마가 통과하며 해석(bodyOf 상속·패킷 struct 도달)이 맞는지 본다. 이진 전환 B6: 모든 패킷이 binary — encoding·freeform·defaultEncoding은 거부.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MAX_WIRE_LENGTH, worstCaseSize } from "../../../tools/codegen/layout";
import { packetStructs, parseSchema, SchemaError } from "../../../tools/codegen/schema";
import { fixtureRaw, type Raw } from "./rawFixture";
import { MAX_BODY_BYTES, PACKET_ID } from "../../../server/src/net/codec.generated";

const REPO = resolve(import.meta.dir, "../../..");

function realRaw(): Raw {
  return JSON.parse(readFileSync(resolve(REPO, "shared/schema/packets.json"), "utf8"));
}

/** fixture를 변형한 스키마의 위반 목록(통과하면 []). */
function issuesOf(mutate: (s: Raw) => void): string[] {
  const s = fixtureRaw();
  mutate(s);
  try {
    parseSchema(s);
    return [];
  } catch (e) {
    if (e instanceof SchemaError) return [...e.issues];
    throw e;
  }
}

function expectIssue(mutate: (s: Raw) => void, pattern: RegExp): void {
  const issues = issuesOf(mutate);
  expect(issues.some((i) => pattern.test(i))).toBe(true);
  if (!issues.some((i) => pattern.test(i))) throw new Error(`no issue matching ${pattern}: ${JSON.stringify(issues)}`);
}

/** 이진 전환 B4가 flip한 고정형 S2C 17개(protoVersion 7). */
const B4_FLIPS = [
  "AUTH_RESULT", "ENTER_WORLD_OK", "ZONE_INFO", "CHAR_CREATE_RESULT", "ZONE_CHANGE", "CHAR_EXP_GAIN", "GOLD_UPDATE", "TARGET_ACK", "DEATH_NOTIFY",
  "RESPAWN_OK", "SKILL_CAST_ACK", "SKILL_LEARN_ACK", "SKILL_LV_UP", "ITEM_USE_ACK", "ITEM_PICKUP_ACK", "QUEST_PROGRESS", "SHOP_ACK",
];

/** 이진 전환 B5②b가 flip한 인벤·상점 S2C(protoVersion 8) — INVENTORY_UPDATE는 bodyOf라 INVENTORY_LIST의 binary를 상속한다. */
const B5_2_FLIPS = ["INVENTORY_LIST", "INVENTORY_UPDATE", "SHOP_LIST"];

/** 이진 전환 B5③b가 flip한 스킬·UI 설정 S2C(protoVersion 9). */
const B5_3_FLIPS = ["SKILL_LIST", "UI_PREFERENCES"];

/** 이진 전환 B5④b가 flip한 NPC 대화·퀘스트 S2C(protoVersion 10). */
const B5_4_FLIPS = ["NPC_DIALOG", "QUEST_LIST", "QUEST_ACTION_ACK", "QUEST_NPC_MARKERS"];

/** 이진 전환 B5①b가 flip한 캐릭터·포탈 S2C(protoVersion 11) — CHAR_LIST는 형태 변경(CharSummary[])과 함께. B5 마지막 도메인이라 이후 JSON 패킷 0개. */
const B5_1_FLIPS = ["CHAR_LIST", "CHAR_STATS_FULL", "CHAR_LEVEL_UP", "PORTAL_LIST"];

/** 생활 L-1(protoVersion 17)이 더한 S2C. */
const LIFE_L1_S2C = ["LIFE_CHANNEL", "LIFE_RESULT", "LIFE_STATUS", "NODE_CATALOG"];

/** 생활 L-2(protoVersion 17)가 더한 S2C. */
const LIFE_L2_S2C = ["RECIPE_LIST", "CRAFT_ACK"];

/** 채집 미니게임(protoVersion 18)이 더한 S2C. */
const LIFE_PUZZLE_S2C = ["GATHER_PUZZLE"];

describe("실물·합성 스키마 통과", () => {
  test("packets.json — 86개(전부 binary — B6) = C2S 36개(B2b 29개 + STAT_ALLOCATE·STAT_RESET + 생활 GATHER_START·LIFE_CANCEL·CRAFT_REQ·GATHER_TRACE·GATHER_TAPS) + S2C 50개(SNAPSHOT_DELTA + B3b 11개 + B4 17개 + B5②b 3개 + B5③b 2개 + B5④b 4개 + B5①b 4개 + STAT_POINTS_ACK + 생활 L-1 4개 + 생활 L-2 2개 + 채집 퍼즐 1개), frozen HELLO·HELLO_ACK·KICK", () => {
    const raw = realRaw();
    const ast = parseSchema(raw);
    expect(ast.packets.length).toBe(86);
    const c2s = ast.packets.filter((p) => p.direction === "C2S");
    expect(c2s.length).toBe(36);
    expect(ast.packets.filter((p) => p.direction === "S2C").map((p) => p.name).sort()).toEqual(
      [
        "SNAPSHOT_DELTA",
        "HELLO_ACK", "ENTITY_SPAWN", "ENTITY_DESPAWN", "ENTITY_META", "MOVE_PATH", "CHAT_BCAST",
        "DAMAGE_EVENT", "SKILL_EFFECT", "MANA_UPDATE", "PONG", "KICK",
        ...B4_FLIPS,
        ...B5_2_FLIPS,
        ...B5_3_FLIPS,
        ...B5_4_FLIPS,
        ...B5_1_FLIPS,
        "STAT_POINTS_ACK",
        ...LIFE_L1_S2C,
        ...LIFE_L2_S2C,
        ...LIFE_PUZZLE_S2C,
      ].sort(),
    );
    // B6 — 원본에 인코딩 선언이 없다(gen이 defaultEncoding·encoding·freeform 키를 거부 — 아래 "B6 폐지 키" 시험).
    expect(raw["defaultEncoding"]).toBeUndefined();
    expect(Object.entries(raw["packets"]).filter(([, p]) => "encoding" in (p as Raw) || "freeform" in (p as Raw))).toEqual([]);
    expect(ast.packets.filter((p) => p.frozen).map((p) => p.name)).toEqual(["HELLO", "HELLO_ACK", "KICK"]);
    // 패킷 도달 struct = 선언 struct 전부(미사용 struct 금지 — B6) — 패킷 순회 순서에서 처음 닿은 순(struct 선언 순서가 아니다): B5①b의 CharSummary(CHAR_LIST
    // 0x0011)·PortalMarker(PORTAL_LIST 0x0019)가 SNAPSHOT_DELTA 앞, 캐릭터 struct(CHAR_STATS_FULL·CHAR_LEVEL_UP 0x030x)가 B5③b의 SkillInfo(SKILL_LIST
    // 0x0421) 앞에 오고, SkillInfo가 B5②b의 인벤·상점 struct(INVENTORY_LIST 0x0444~) 앞, B5④b의 대화·퀘스트 struct(NPC_DIALOG 0x0451·퀘스트 0x046x —
    // packets.json에서 SHOP_LIST 0x0453보다 먼저 선언)가 ShopOffer를 민다. 생활 L-1 struct(LIFE_STATUS·NODE_CATALOG 0x048x — UI_PREFERENCES 뒤
    // 선언)와 L-2 RecipeInfo(RECIPE_LIST 0x0490)가 끝이다(LIFE_RESULT.items·RecipeInfo.inputs는 이미 닿은 RewardPreviewItem 재사용).
    expect(packetStructs(ast)).toEqual([
      "CharSummary", "PortalMarker", "SnapshotUpdate", "Waypoint",
      "CharGraph", "CharStats", "CharPowStats", "CharStatPair", "CharMagStats", "CharChaStats", "CharLucStats", "CharDerivedStats", "CharStatDelta",
      "StatAllocation",
      "SkillInfo", "InventoryEntry", "EquipmentSlots",
      "DialogNode", "DialogOption", "DialogAction",
      "QuestLogEntry", "QuestLogObjective", "QuestRewardPreview", "RewardPreviewItem",
      "QuestGrantSummary", "QuestGrantItem", "NpcQuestMarker",
      "ShopOffer",
      "LifeLineInfo", "NodeDefInfo", "PuzzlePoint", "PuzzleTap", "RecipeInfo", // PuzzlePoint = 채집 미니게임(GATHER_PUZZLE 0x0486, RECIPE_LIST 앞), PuzzleTap = 원 짚기(GATHER_TAPS 0x0488)
    ]);
    expect([...packetStructs(ast)].sort()).toEqual([...ast.structs.keys()].sort());
    expect(ast.header).toEqual({ format: "v2", endian: "little", order: ["len", "id"], id_bytes: 2, len_bytes: 2 });
  });

  test("B3b — 고빈도 S2C 11개 binary flip: enum(B3a)·string max·최악 본문", () => {
    const ast = parseSchema(realRaw());
    const packet = (n: string) => ast.packets.find((p) => p.name === n)!;
    expect(packet("ENTITY_SPAWN").fields.find((f) => f.name === "type")!.type).toEqual({ kind: "enum", name: "EntityType" });
    expect(packet("SKILL_EFFECT").fields.find((f) => f.name === "effectKind")!.type).toEqual({ kind: "enum", name: "SkillEffectKind" });
    expect(ast.enums.get("EntityType")!.values).toEqual([["unknown", 0], ["player", 1], ["monster", 2], ["npc", 3], ["grounditem", 4], ["resource", 5]]);
    expect(ast.enums.get("SkillEffectKind")!.values).toEqual([["damage", 0], ["heal", 1], ["cast", 2], ["fizzle", 3]]);
    // 최악 본문(protocol.md §2.8 표) — string max는 실제 송신원에서 유도했다(이름 66 = username 64 + "-1", 채팅 600 = 200 유닛 × 3).
    const worst = (n: string) => worstCaseSize(ast, packet(n).fields);
    expect(worst("MOVE_PATH")).toBe(4 + 4 + 2 + 8 * 1024);
    expect(worst("SKILL_EFFECT")).toBe(35 + 1 + 1); // + variant·hitIndex u8(protoVersion 16)
    expect(worst("ENTITY_SPAWN")).toBe(4 + 1 + 4 + 4 + (2 + 66) + 4 * 7); // + monsterDefId(protoVersion 16)
    expect(worst("CHAT_BCAST")).toBe(4 + 4 + (2 + 66) + (2 + 600));
    expect(worst("KICK")).toBe(4 + (2 + 600));
    expect(worst("HELLO_ACK")).toBe(4 + 8 + (2 + 64));
    expect([worst("ENTITY_DESPAWN"), worst("ENTITY_META"), worst("DAMAGE_EVENT"), worst("MANA_UPDATE"), worst("PONG")]).toEqual([8, 16, 14, 8, 16]);
  });

  test("B4 — 나머지 고정형 S2C 17개 binary flip: string max(실제 송신원)·최악 본문", () => {
    const ast = parseSchema(realRaw());
    const packet = (n: string) => ast.packets.find((p) => p.name === n)!;
    const maxOf = (n: string, f: string) => packet(n).fields.find((x) => x.name === f)!.max;
    // protocol.md §2.9 B4 표 — 토큰 64 hex, 캐릭터명 에코 = CHAR_CREATE_REQ.name max, 존 이름 64(ZoneRegistry 부팅 검증).
    expect([maxOf("AUTH_RESULT", "sessionToken"), maxOf("CHAR_CREATE_RESULT", "name"), maxOf("ZONE_INFO", "name"), maxOf("ZONE_CHANGE", "name")]).toEqual([64, 64, 64, 64]);
    const worst = (n: string) => worstCaseSize(ast, packet(n).fields);
    expect(Object.fromEntries(B4_FLIPS.map((n) => [n, worst(n)]))).toEqual({
      AUTH_RESULT: 1 + 4 + (2 + 64) + 4,
      ENTER_WORLD_OK: 20,
      ZONE_INFO: 4 + (2 + 64) + 4 * 5,
      CHAR_CREATE_RESULT: 1 + 4 + (2 + 64) + 4,
      ZONE_CHANGE: 4 + (2 + 64) + 4 * 6,
      CHAR_EXP_GAIN: 16,
      GOLD_UPDATE: 8,
      TARGET_ACK: 8,
      DEATH_NOTIFY: 16,
      RESPAWN_OK: 28,
      SKILL_CAST_ACK: 12,
      SKILL_LEARN_ACK: 20,
      SKILL_LV_UP: 12,
      ITEM_USE_ACK: 20,
      ITEM_PICKUP_ACK: 8,
      QUEST_PROGRESS: 4 * 4 + 1,
      SHOP_ACK: 16,
    });
  });

  test("B5 완료 — 전 패킷이 binary라 gen이 모든 id의 최악 본문(≤ 65535)을 검사한다: 생성 MAX_BODY_BYTES = 스키마 최악 본문, 빠진 id 없음", () => {
    const ast = parseSchema(realRaw());
    for (const p of ast.packets) {
      const worst = worstCaseSize(ast, p.fields);
      expect([p.name, MAX_BODY_BYTES[p.id], worst <= MAX_WIRE_LENGTH]).toEqual([p.name, worst, true]);
    }
    expect(Object.keys(MAX_BODY_BYTES).length).toBe(ast.packets.length);
  });

  test("B5②b — INVENTORY_LIST·INVENTORY_UPDATE(bodyOf)·SHOP_LIST binary flip: 필드·max·최악 본문(②a 스키마 그대로)", () => {
    const raw = realRaw();
    const ast = parseSchema(raw);
    const packet = (n: string) => ast.packets.find((p) => p.name === n)!;
    // INVENTORY_UPDATE는 bodyOf라 fields를 선언하지 않는다 — INVENTORY_LIST에서 상속.
    expect(raw["packets"]["INVENTORY_UPDATE"]["fields"]).toBeUndefined();
    expect(packet("INVENTORY_UPDATE").bodyOf).toBe("INVENTORY_LIST");
    expect(packet("INVENTORY_UPDATE").fields).toBe(packet("INVENTORY_LIST").fields);
    const shape = (n: string) => packet(n).fields.map((f) => [f.name, f.type.kind === "array" ? `${f.type.of.kind === "prim" ? f.type.of.prim : f.type.of.name}[]` : f.type.kind === "prim" ? f.type.prim : f.type.name, f.max ?? null]);
    expect(shape("INVENTORY_LIST")).toEqual([["slots", "InventoryEntry[]", 24], ["equipment", "EquipmentSlots", null]]);
    expect(shape("SHOP_LIST")).toEqual([["entityId", "i32", null], ["shopId", "i32", null], ["name", "string", 240], ["offers", "ShopOffer[]", 256]]);
    expect(ast.structs.get("EquipmentSlots")!.fields.map((f) => f.name)).toEqual(["weapon", "shield", "helmet", "armor", "gloves", "boots", "accessory1", "accessory2"]);
    // 최악 본문(protocol.md §2.10 B5 표) — 생성 MAX_BODY_BYTES도 같은 값(bodyOf는 대상과 같다).
    const worst = (n: string) => worstCaseSize(ast, packet(n).fields);
    expect([worst("INVENTORY_LIST"), worst("INVENTORY_UPDATE"), worst("SHOP_LIST")]).toEqual([
      2 + 24 * 12 + 8 * 4,
      2 + 24 * 12 + 8 * 4,
      4 + 4 + (2 + 240) + 2 + 256 * 12,
    ]);
    expect([MAX_BODY_BYTES[PACKET_ID.INVENTORY_LIST], MAX_BODY_BYTES[PACKET_ID.INVENTORY_UPDATE], MAX_BODY_BYTES[PACKET_ID.SHOP_LIST]]).toEqual([322, 322, 3324]);
  });

  test("B5③b — SKILL_LIST·UI_PREFERENCES binary flip: 필드·enum 3·max·최악 본문(③a 스키마 그대로)", () => {
    const raw = realRaw();
    const ast = parseSchema(raw);
    const packet = (n: string) => ast.packets.find((p) => p.name === n)!;
    const typeName = (t: { kind: string; prim?: string; name?: string }) => (t.kind === "prim" ? t.prim : t.name);
    const shape = (fields: ReturnType<typeof packet>["fields"]) =>
      fields.map((f) => [f.name, f.type.kind === "array" ? `${typeName(f.type.of)}[]` : typeName(f.type), f.min ?? null, f.max ?? null, f.optional]);
    expect(shape(packet("SKILL_LIST").fields)).toEqual([["skills", "SkillInfo[]", null, 256, false]]);
    // 필드 순서 = binary 레이아웃 순서(생성 writeSkillInfo가 이 순서로 쓴다 — 객체 키 순서는 보지 않는다. ③a JSON 상태에서는 buildSkillList의 키 순서가 바이트를 정했다).
    expect(shape(ast.structs.get("SkillInfo")!.fields)).toEqual([
      ["skillId", "i32", null, null, false],
      ["name", "string", null, 64, false],
      ["category", "SkillCategory", null, null, false],
      ["effectKind", "SkillDefEffectKind", null, null, false],
      ["mpCost", "i32", null, null, false],
      ["cooldownMs", "i32", null, null, false],
      ["range", "f32", null, null, false],
      ["slvReq", "i32", null, null, false],
      ["slpCost", "i32", null, null, false],
      ["maxLevel", "i32", null, null, false],
      ["targeting", "SkillTargeting", null, null, false],
      ["aoeRadius", "f32", null, null, false],
      ["level", "i32", null, null, false],
      ["learned", "bool", null, null, false],
      // protoVersion 16 — 4타입 기본 스킬(protocol.md §2.14): 종족 비트마스크·스킬북 전용·활 사거리.
      ["allowedRaces", "u8", null, null, false],
      ["bookOnly", "bool", null, null, false],
      ["bowRange", "f32", null, null, false],
    ]);
    expect(ast.enums.get("SkillCategory")!.values).toEqual([["physical", 0], ["magical", 1], ["heal", 2]]);
    expect(ast.enums.get("SkillDefEffectKind")!.values).toEqual([["damage", 0], ["heal", 1], ["passive", 2]]);
    expect(ast.enums.get("SkillTargeting")!.values).toEqual([["entity", 0], ["ground", 1]]);
    for (const n of ["SkillCategory", "SkillDefEffectKind", "SkillTargeting"]) expect([n, ast.enums.get(n)!.repr]).toEqual([n, "u8"]);
    // UI_PREFERENCES는 UI_PREFERENCES_SET과 같은 이름·개수 규칙(optional 없이) + hasSavedSettings — bodyOf 불가(필드 추가·optional 상속).
    expect(shape(packet("UI_PREFERENCES").fields)).toEqual([
      ["quickSlots", "i32[]", 6, 6, false],
      ["trackedQuestIds", "i32[]", null, 5, false],
      ["hasSavedSettings", "bool", null, null, false],
    ]);
    expect(packet("UI_PREFERENCES").bodyOf).toBeUndefined();
    // 최악 본문(protocol.md §2.10 ③ 표) — 생성 MAX_BODY_BYTES도 같은 값(S2C라 수신 상한에는 쓰이지 않는다 — 송신 최악 본문의 스키마 단정).
    const worst = (n: string) => worstCaseSize(ast, packet(n).fields);
    const skillInfo = 4 + (2 + 64) + 1 + 1 + 4 + 4 + 4 + 4 + 4 + 4 + 1 + 4 + 4 + 1 + 1 + 1 + 4;
    expect(skillInfo).toBe(112); // protoVersion 16(종전 106).
    expect([worst("SKILL_LIST"), worst("UI_PREFERENCES")]).toEqual([2 + 256 * skillInfo, (2 + 6 * 4) + (2 + 5 * 4) + 1]);
    expect([worst("SKILL_LIST"), worst("UI_PREFERENCES")]).toEqual([28_674, 49]);
    expect([MAX_BODY_BYTES[PACKET_ID.SKILL_LIST], MAX_BODY_BYTES[PACKET_ID.UI_PREFERENCES]]).toEqual([28_674, 49]);
  });

  test("B5④b — NPC_DIALOG·QUEST_LIST·QUEST_ACTION_ACK·QUEST_NPC_MARKERS binary flip: 필드·enum 3·optional·max·최악 본문(④a 스키마 그대로)", () => {
    const raw = realRaw();
    const ast = parseSchema(raw);
    const packet = (n: string) => ast.packets.find((p) => p.name === n)!;
    const typeName = (t: { kind: string; prim?: string; name?: string }) => (t.kind === "prim" ? t.prim : t.name);
    type Fields = ReturnType<typeof packet>["fields"];
    const shape = (fields: Fields) =>
      fields.map((f) => [f.name, f.type.kind === "array" ? `${typeName(f.type.of)}[]` : typeName(f.type), f.max ?? null, f.optional]);
    const struct = (n: string) => shape(ast.structs.get(n)!.fields);
    // 필드 순서 = binary 레이아웃 순서(생성 write*가 이 순서로 쓴다 — 객체 키 순서는 보지 않는다. ④a JSON 상태에서는 송신 키 순서가 바이트를 정했다).
    expect(shape(packet("NPC_DIALOG").fields)).toEqual([
      ["entityId", "i32", null, false],
      ["npcId", "i32", null, false],
      ["npcName", "string", 66, false],
      ["dialogueId", "i32", null, false],
      ["entry", "string", 64, false],
      ["nodes", "DialogNode[]", 12, false],
    ]);
    expect(struct("DialogNode")).toEqual([
      ["id", "string", 64, false],
      ["speaker", "string", 66, false],
      ["pages", "string[]", 4, false],
      ["options", "DialogOption[]", 8, false],
    ]);
    expect(ast.structs.get("DialogNode")!.fields.find((f) => f.name === "pages")!.ofMax).toBe(600);
    // next(점프)·action(터미널)은 optional — 로더 superRefine이 정확히 하나를 강제한다. action은 평탄화·enum화하지 않는다(설계 B5 §1.4).
    expect(struct("DialogOption")).toEqual([
      ["label", "string", 240, false],
      ["next", "string", 64, true],
      ["action", "DialogAction", null, true],
    ]);
    expect(struct("DialogAction")).toEqual([
      ["type", "string", 32, false],
      ["questId", "i32", null, true],
      ["shopId", "i32", null, true],
    ]);
    expect(shape(packet("QUEST_LIST").fields)).toEqual([
      ["active", "QuestLogEntry[]", 20, false],
      ["completed", "i32[]", 1024, false],
      ["dailyDoneToday", "i32[]", 1024, false],
    ]);
    expect(struct("QuestLogEntry")).toEqual([
      ["questId", "i32", null, false],
      ["type", "QuestType", null, false],
      ["name", "string", 120, false],
      ["description", "string", 1500, false],
      ["giverNpcId", "i32", null, false],
      ["turnInNpcId", "i32", null, false],
      ["abandonable", "bool", null, false],
      ["completable", "bool", null, false],
      ["objectives", "QuestLogObjective[]", 8, false],
      ["rewardPreview", "QuestRewardPreview", null, false],
    ]);
    expect(struct("QuestLogObjective")).toEqual([
      ["kind", "QuestObjectiveKind", null, false],
      ["text", "string", 96, false],
      ["targetId", "i32", null, false],
      ["current", "i32", null, false],
      ["required", "i32", null, false],
    ]);
    // 미리보기는 itemId·qty만 — weight·ppm은 스키마에 없다(바이너리는 선언 밖 키를 쓰지 않고, 송신부도 strip한 객체만 싣는다).
    expect(struct("QuestRewardPreview")).toEqual([
      ["exp", "i32", null, false],
      ["sexp", "i32", null, false],
      ["slp", "i32", null, false],
      ["gold", "i32", null, false],
      ["fixed", "RewardPreviewItem[]", 8, false],
      ["choice", "RewardPreviewItem[]", 8, false],
      ["random", "RewardPreviewItem[]", 8, false],
      ["bonus", "RewardPreviewItem[]", 8, false],
    ]);
    expect(struct("RewardPreviewItem")).toEqual([["itemId", "i32", null, false], ["qty", "i32", null, false]]);
    expect(shape(packet("QUEST_ACTION_ACK").fields)).toEqual([
      ["op", "i32", null, false],
      ["questId", "i32", null, false],
      ["errCode", "i32", null, false],
      ["rewards", "QuestGrantSummary", null, true],
    ]);
    expect(struct("QuestGrantSummary")).toEqual([
      ["exp", "i32", null, false],
      ["sexp", "i32", null, false],
      ["slp", "i32", null, false],
      ["gold", "i32", null, false],
      ["items", "QuestGrantItem[]", 18, false],
    ]);
    expect(struct("QuestGrantItem")).toEqual([["itemId", "i32", null, false], ["qty", "i32", null, false], ["source", "RewardSource", null, false]]);
    expect(shape(packet("QUEST_NPC_MARKERS").fields)).toEqual([["npcs", "NpcQuestMarker[]", 1024, false]]);
    expect(struct("NpcQuestMarker")).toEqual([["npcId", "i32", null, false], ["marker", "i32", null, false]]);
    // enum 값 이름 = ④a JSON 상태의 문자열(④b부터 u8 코드). 숫자 코드(op·errCode·marker)는 enum이 아니다(④a 바이트 불변 때문 — enum화는 별도 bump 후보).
    expect(ast.enums.get("QuestType")!.values).toEqual([["scenario", 0], ["normal", 1], ["regional", 2], ["daily", 3]]);
    expect(ast.enums.get("QuestObjectiveKind")!.values).toEqual([["kill", 0], ["collect", 1], ["talk", 2], ["reach", 3]]);
    expect(ast.enums.get("RewardSource")!.values).toEqual([["fixed", 0], ["choice", 1], ["random", 2], ["bonus", 3]]);
    for (const n of ["QuestType", "QuestObjectiveKind", "RewardSource"]) expect([n, ast.enums.get(n)!.repr]).toEqual([n, "u8"]);
    // 최악 본문(protocol.md §2.10 ④ 표, 설계 B5 §3) — 생성 MAX_BODY_BYTES도 같은 값(S2C라 수신 상한에는 쓰이지 않는다 — 송신 최악 본문의 스키마 단정).
    const worst = (n: string) => worstCaseSize(ast, packet(n).fields);
    // DialogAction = presence 1 + type(2+32) + questId·shopId 4+4, DialogOption = presence 1 + label(2+240) + next(2+64) + action(둘 다 있다고 본다).
    const action = 1 + (2 + 32) + 4 + 4;
    const option = 1 + (2 + 240) + (2 + 64) + action;
    const node = (2 + 64) + (2 + 66) + (2 + 4 * (2 + 600)) + (2 + 8 * option);
    const dialogHead = 4 + 4 + (2 + 66) + 4 + (2 + 64) + 2;
    expect([action, option, node, dialogHead]).toEqual([43, 352, 5362, 148]);
    const objective = 1 + (2 + 96) + 4 * 3;
    const preview = 4 * 4 + 4 * (2 + 8 * 8);
    const entry = 4 + 1 + (2 + 120) + (2 + 1500) + 4 + 4 + 1 + 1 + (2 + 8 * objective) + preview;
    expect([objective, preview, entry]).toEqual([111, 280, 2809]);
    const grants = 4 * 4 + (2 + 18 * (4 + 4 + 1));
    expect([worst("NPC_DIALOG"), worst("QUEST_LIST"), worst("QUEST_ACTION_ACK"), worst("QUEST_NPC_MARKERS")]).toEqual([
      dialogHead + 12 * node,
      (2 + 20 * entry) + 2 * (2 + 1024 * 4),
      1 + 4 * 3 + grants,
      2 + 1024 * 8,
    ]);
    expect([worst("NPC_DIALOG"), worst("QUEST_LIST"), worst("QUEST_ACTION_ACK"), worst("QUEST_NPC_MARKERS")]).toEqual([64_492, 64_378, 193, 8_194]);
    expect(B5_4_FLIPS.map((n) => MAX_BODY_BYTES[PACKET_ID[n as keyof typeof PACKET_ID]])).toEqual([64_492, 64_378, 193, 8_194]);
    // 예산이 빠듯한 둘의 여유 — 노드 13개·진행 21개면 u16을 넘는다(상한을 함께 움직일 변수는 protocol.md §2.10).
    expect([MAX_WIRE_LENGTH - worst("NPC_DIALOG"), MAX_WIRE_LENGTH - worst("QUEST_LIST")]).toEqual([1_043, 1_157]);
    expect([dialogHead + 13 * node > MAX_WIRE_LENGTH, worst("QUEST_LIST") + entry > MAX_WIRE_LENGTH]).toEqual([true, true]);
  });

  test("B5①b — CHAR_STATS_FULL·CHAR_LEVEL_UP·PORTAL_LIST binary flip(①a 스키마 그대로) + CHAR_LIST 형태 변경(CharSummary[] max 16, x·y 제거): 필드·중첩 struct·enum 2·max·최악 본문", () => {
    const raw = realRaw();
    const ast = parseSchema(raw);
    const packet = (n: string) => ast.packets.find((p) => p.name === n)!;
    const typeName = (t: { kind: string; prim?: string; name?: string }) => (t.kind === "prim" ? t.prim : t.name);
    type Fields = ReturnType<typeof packet>["fields"];
    const shape = (fields: Fields) =>
      fields.map((f) => [f.name, f.type.kind === "array" ? `${typeName(f.type.of)}[]` : typeName(f.type), f.max ?? null, f.optional]);
    const struct = (n: string) => shape(ast.structs.get(n)!.fields);
    // 필드 순서 = binary 레이아웃 순서(생성 write*가 이 순서로 쓴다 — 객체 키 순서는 보지 않는다. ①a JSON 상태에서는 charStatsHelper·statAccumulation·
    // portalListHelper의 송신 키 순서가 바이트를 정했고, 스키마 필드 순서를 그 순서로 맞춰 두었다).
    const i32 = (n: string) => [n, "i32", null, false];
    // CHAR_LIST — 종전 chars: string(CharSummary[]를 담은 JSON, x·y 포함) → CharSummary[](string → array는 isSchematization이 아니라 ①a에 둘 수 없었다).
    expect(shape(packet("CHAR_LIST").fields)).toEqual([["chars", "CharSummary[]", 16, false]]);
    expect(struct("CharSummary")).toEqual([i32("charId"), ["name", "string", 66, false], i32("level"), i32("zoneId")]);
    expect(shape(packet("CHAR_STATS_FULL").fields)).toEqual([
      i32("charId"),
      ["name", "string", 66, false],
      i32("race"),
      ["graph", "CharGraph", null, false],
      ["stats", "CharStats", null, false],
      ...["level", "exp", "hp", "hpMax", "mp", "mpMax", "slv", "sexp", "slp", "gold", "zoneId"].map(i32),
      ["x", "f32", null, false],
      ["y", "f32", null, false],
      ["derived", "CharDerivedStats", null, false],
      i32("freePoints"),
      i32("allocatedPoints"),
    ]);
    expect(struct("CharGraph")).toEqual(["pow", "mag", "cha", "luc"].map(i32));
    // 그룹 순서 = StatGroup 값 순서, 그룹 안 순서 = StatCode 값 순서(레벨업 statDeltas 순서와 같다 — wireLimitsContract).
    expect(struct("CharStats")).toEqual([
      ["pow", "CharPowStats", null, false],
      ["mag", "CharMagStats", null, false],
      ["cha", "CharChaStats", null, false],
      ["luc", "CharLucStats", null, false],
    ]);
    const pairs = (...names: string[]) => names.map((n) => [n, "CharStatPair", null, false]);
    expect([struct("CharPowStats"), struct("CharMagStats"), struct("CharChaStats"), struct("CharLucStats")]).toEqual([
      pairs("atk", "hit", "agi"),
      pairs("mat", "wis", "mdef"),
      pairs("eva", "end", "def"),
      pairs("pot", "luk", "act"),
    ]);
    expect(struct("CharStatPair")).toEqual([i32("value"), i32("xp")]);
    expect(shape(packet("CHAR_LEVEL_UP").fields)).toEqual([
      i32("newLevel"),
      ["statDeltas", "CharStatDelta[]", 3588, false],
      i32("hpMaxNew"),
      i32("mpMaxNew"),
    ]);
    // valueAfter는 서버가 늘 실었지만 종전 _doc이 빠뜨린 필드다.
    expect(struct("CharStatDelta")).toEqual([
      ["group", "StatGroup", null, false],
      ["code", "StatCode", null, false],
      i32("valueDelta"),
      i32("valueAfter"),
      i32("xpAfter"),
    ]);
    expect(shape(packet("PORTAL_LIST").fields)).toEqual([i32("zoneId"), ["portals", "PortalMarker[]", 32, false]]);
    expect(struct("PortalMarker")).toEqual([i32("portalId"), ["x", "f32", null, false], ["y", "f32", null, false], ["name", "string", 64, false], i32("destZoneId")]);
    // enum 값 이름 = ①a JSON 상태의 문자열(①b부터 u8 코드), 값 순서 = struct 필드 순서.
    expect(ast.enums.get("StatGroup")!.values).toEqual([["pow", 0], ["mag", 1], ["cha", 2], ["luc", 3]]);
    expect(ast.enums.get("StatCode")!.values.map(([n]) => n)).toEqual(["atk", "hit", "agi", "mat", "wis", "mdef", "eva", "end", "def", "pot", "luk", "act"]);
    expect(ast.enums.get("StatCode")!.values.map(([, c]) => c)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    for (const n of ["StatGroup", "StatCode"]) expect([n, ast.enums.get(n)!.repr]).toEqual([n, "u8"]);
    // 최악 본문(protocol.md §2.10 ① 표, 설계 B5 §3) — 생성 MAX_BODY_BYTES도 같은 값(S2C라 수신 상한에는 쓰이지 않는다 — 송신 최악 본문의 스키마 단정).
    const worst = (n: string) => worstCaseSize(ast, packet(n).fields);
    const stats = 12 * (4 + 4);
    const delta = 1 + 1 + 4 * 3;
    const marker = 4 + 4 + 4 + (2 + 64) + 4;
    const summary = 4 + (2 + 66) + 4 + 4;
    expect([stats, delta, marker, summary]).toEqual([96, 14, 82, 80]);
    expect(B5_1_FLIPS.map(worst)).toEqual([
      2 + 16 * summary,
      4 + (2 + 66) + 4 + 4 * 4 + stats + 11 * 4 + 4 + 4 + 128 + 8,
      4 + (2 + 3588 * delta) + 4 + 4,
      4 + (2 + 32 * marker),
    ]);
    expect(B5_1_FLIPS.map(worst)).toEqual([1_282, 376, 50_246, 2_630]);
    expect(B5_1_FLIPS.map((n) => MAX_BODY_BYTES[PACKET_ID[n as keyof typeof PACKET_ID]])).toEqual([1_282, 376, 50_246, 2_630]);
    // 레벨업 statDeltas 상한 3,588 = 12 × (MAX_LEVEL 300 − 1) — 3,589개(+14 B)도 u16 안이라 예산이 아니라 도메인 상한이다(최악 본문의 여유 15,289 B).
    // ①a JSON 상태에서는 한 번에 약 76레벨 이상이면 JSON 본문이 u16을 넘어 drop됐다(1 → 300 회귀 — tests/integration/e2e-gm.test.ts).
    expect(MAX_WIRE_LENGTH - worst("CHAR_LEVEL_UP")).toBe(15_289);
  });

  test("자유 포인트 — STAT_ALLOCATE·STAT_RESET·STAT_POINTS_ACK 레이아웃·최악 본문(C2S 첫 enum)", () => {
    const ast = parseSchema(realRaw());
    const packet = (n: string) => ast.packets.find((p) => p.name === n)!;
    const typeName = (t: { kind: string; prim?: string; name?: string }) => (t.kind === "prim" ? t.prim : t.name);
    type Fields = ReturnType<typeof packet>["fields"];
    const shape = (fields: Fields) =>
      fields.map((f) => [f.name, f.type.kind === "array" ? `${typeName(f.type.of)}[]` : typeName(f.type), f.max ?? null, f.optional]);
    const struct = (n: string) => shape(ast.structs.get(n)!.fields);
    const i32 = (name: string) => [name, "i32", null, false];
    expect([packet("STAT_ALLOCATE").id, packet("STAT_RESET").id, packet("STAT_POINTS_ACK").id]).toEqual([0x0305, 0x0306, 0x0307]);
    expect(["STAT_ALLOCATE", "STAT_RESET", "STAT_POINTS_ACK"].map((n) => packet(n).direction)).toEqual(["C2S", "C2S", "S2C"]);
    expect(shape(packet("STAT_ALLOCATE").fields)).toEqual([i32("requestId"), ["allocations", "StatAllocation[]", 12, false]]);
    expect(struct("StatAllocation")).toEqual([["code", "StatCode", null, false], i32("points")]);
    expect(shape(packet("STAT_RESET").fields)).toEqual([i32("requestId")]);
    expect(shape(packet("STAT_POINTS_ACK").fields)).toEqual([i32("requestId"), i32("op"), i32("errCode"), i32("freePoints")]);
    expect(["STAT_ALLOCATE", "STAT_RESET", "STAT_POINTS_ACK"].map((n) => worstCaseSize(ast, packet(n).fields))).toEqual([4 + 2 + 12 * 5, 4, 16]);
  });

  test("생활 L-1 — GATHER_START·LIFE_CANCEL·LIFE_CHANNEL·LIFE_RESULT·LIFE_STATUS·NODE_CATALOG 레이아웃·enum 2·최악 본문", () => {
    const ast = parseSchema(realRaw());
    const packet = (n: string) => ast.packets.find((p) => p.name === n)!;
    const typeName = (t: { kind: string; prim?: string; name?: string }) => (t.kind === "prim" ? t.prim : t.name);
    type Fields = ReturnType<typeof packet>["fields"];
    const shape = (fields: Fields) =>
      fields.map((f) => [f.name, f.type.kind === "array" ? `${typeName(f.type.of)}[]` : typeName(f.type), f.max ?? null, f.optional]);
    const struct = (n: string) => shape(ast.structs.get(n)!.fields);
    const of = (name: string, type: string) => [name, type, null, false];
    const names = ["GATHER_START", "LIFE_CANCEL", "LIFE_CHANNEL", "LIFE_RESULT", "LIFE_STATUS", "NODE_CATALOG"];
    expect(names.map((n) => packet(n).id)).toEqual([0x0480, 0x0481, 0x0482, 0x0483, 0x0484, 0x0485]);
    expect(names.map((n) => packet(n).direction)).toEqual(["C2S", "C2S", "S2C", "S2C", "S2C", "S2C"]);
    expect(ast.enums.get("LifeLine")!.values).toEqual([
      ["logging", 0], ["mining", 1], ["gathering", 2], ["weapon", 3], ["armor", 4], ["accessory", 5], ["consumable", 6],
    ]);
    expect(ast.enums.get("LifeChannelKind")!.values).toEqual([["gather", 0], ["craft", 1]]);
    expect([ast.enums.get("LifeLine")!.repr, ast.enums.get("LifeChannelKind")!.repr]).toEqual(["u8", "u8"]);
    expect(shape(packet("GATHER_START").fields)).toEqual([of("nodeEid", "i32")]);
    expect(packet("LIFE_CANCEL").fields).toEqual([]);
    expect(shape(packet("LIFE_CHANNEL").fields)).toEqual([
      of("channelId", "i32"), of("kind", "LifeChannelKind"), of("targetEid", "i32"), of("durationMs", "i32"), of("requestId", "i32"), of("code", "u8"),
    ]);
    // 산출 목록은 퀘스트 보상 미리보기와 같은 {itemId, qty} struct를 다시 쓴다(같은 레이아웃의 새 struct를 만들지 않는다).
    expect(shape(packet("LIFE_RESULT").fields)).toEqual([
      of("channelId", "i32"), of("code", "u8"), ["items", "RewardPreviewItem[]", 8, false], of("line", "LifeLine"), of("profGain", "i32"),
    ]);
    expect(shape(packet("LIFE_STATUS").fields)).toEqual([
      of("labor", "i32"), of("laborMax", "i32"), of("msToNext", "i32"), ["lines", "LifeLineInfo[]", 7, false],
    ]);
    expect(struct("LifeLineInfo")).toEqual([of("line", "LifeLine"), of("points", "i32"), of("rank", "u8"), of("nextRankAt", "i32")]);
    expect(shape(packet("NODE_CATALOG").fields)).toEqual([["nodes", "NodeDefInfo[]", 64, false]]);
    expect(struct("NodeDefInfo")).toEqual([
      of("nodeDefId", "i32"), of("line", "LifeLine"), of("tier", "u8"), of("minRank", "u8"), of("interactRadius", "f32"),
    ]);
    expect(names.map((n) => worstCaseSize(ast, packet(n).fields))).toEqual([
      4, 0, 4 + 1 + 4 + 4 + 4 + 1, 4 + 1 + (2 + 8 * 8) + 1 + 4, 12 + (2 + 7 * 10), 2 + 64 * 11,
    ]);
    // 생활은 ENTITY_SPAWN에 필드를 더하지 않는다 — 노드 def id는 기존 npcId 칸에 싣는다(필드를 더하면 모든 ENTITY_SPAWN 본문이 늘어 특성화 골든이 바뀐다).
    // 끝의 monsterDefId는 master의 몬스터 def id(protoVersion 16)다.
    expect(packet("ENTITY_SPAWN").fields.map((f) => f.name)).toEqual([
      "entityId", "type", "x", "y", "name", "level", "hp", "hpMax", "itemId", "qty", "npcId", "monsterDefId",
    ]);
  });

  test("생활 L-2 — RECIPE_LIST·CRAFT_REQ·CRAFT_ACK 레이아웃·최악 본문, DialogAction 칸 불변", () => {
    const ast = parseSchema(realRaw());
    const packet = (n: string) => ast.packets.find((p) => p.name === n)!;
    const typeName = (t: { kind: string; prim?: string; name?: string }) => (t.kind === "prim" ? t.prim : t.name);
    type Fields = ReturnType<typeof packet>["fields"];
    const shape = (fields: Fields) =>
      fields.map((f) => [f.name, f.type.kind === "array" ? `${typeName(f.type.of)}[]` : typeName(f.type), f.max ?? null, f.optional]);
    const of = (name: string, type: string) => [name, type, null, false];
    const names = ["RECIPE_LIST", "CRAFT_REQ", "CRAFT_ACK"];
    expect(names.map((n) => packet(n).id)).toEqual([0x0490, 0x0491, 0x0492]);
    expect(names.map((n) => packet(n).direction)).toEqual(["S2C", "C2S", "S2C"]);
    expect(shape(packet("RECIPE_LIST").fields)).toEqual([
      of("npcEid", "i32"), of("stationId", "i32"), ["name", "string", 64, false], ["recipes", "RecipeInfo[]", 128, false],
    ]);
    // 재료 목록은 {itemId, qty} struct를 다시 쓴다(LIFE_RESULT.items 선례 — 같은 레이아웃의 새 struct를 만들지 않는다).
    expect(shape(ast.structs.get("RecipeInfo")!.fields)).toEqual([
      of("recipeId", "i32"), of("line", "LifeLine"), of("tier", "u8"), of("minRank", "u8"), of("laborCost", "i32"), of("goldFee", "i32"),
      of("outputItemId", "i32"), of("outputQty", "i32"), of("greatBonusQty", "i32"), ["inputs", "RewardPreviewItem[]", 6, false],
    ]);
    // upgradeSlot 칸은 L-5(촉매)에서 더한다 — L-2에는 쓰는 곳이 없다.
    expect(shape(packet("CRAFT_REQ").fields)).toEqual([of("npcEid", "i32"), of("recipeId", "i32"), of("count", "i32"), of("requestId", "i32")]);
    expect(shape(packet("CRAFT_ACK").fields)).toEqual([
      of("requestId", "i32"), of("errCode", "u8"), of("made", "i32"), of("greats", "i32"), of("gold", "i32"), of("outputItemId", "i32"),
    ]);
    // 9932 = 머리(4 + 4 + (2 + 64) + 2) + 128 × (27 + 2 + 6 × 8).
    expect(names.map((n) => worstCaseSize(ast, packet(n).fields))).toEqual([4 + 4 + (2 + 64) + 2 + 128 * (27 + 2 + 6 * 8), 16, 21]);
    expect(worstCaseSize(ast, packet("RECIPE_LIST").fields)).toBe(9932);
    // open_craft의 stationId는 와이어에 없다 — 서버가 대화를 다시 resolve해 찾는다(ADR 0007 §2.5).
    expect(ast.structs.get("DialogAction")!.fields.map((f) => f.name)).toEqual(["type", "questId", "shopId"]);
  });

  test("합성 — bodyOf는 대상의 필드를 상속, 패킷 도달 struct = 선언 struct 전부", () => {
    const ast = parseSchema(fixtureRaw());
    const world = ast.packets.find((p) => p.name === "WORLD")!;
    const copy = ast.packets.find((p) => p.name === "WORLD_COPY")!;
    expect(copy.fields).toBe(world.fields);
    expect(copy.bodyOf).toBe("WORLD");
    expect(packetStructs(ast).sort()).toEqual(["Entity", "Tag", "Vec2"]);
    expect(ast.enums.get("Kind")!.values).toEqual([["player", 1], ["npc", 2], ["monster", 3]]);
  });

  test("_·$ 키는 주석으로 통과, 위반은 한 번에 모두 모은다", () => {
    expect(issuesOf((s) => { s["$note"] = "x"; })).toEqual([]);
    const many = issuesOf((s) => {
      s["version"] = 1;
      s["packets"]["PING_BIN"]["id"] = 0;
      s["structs"]["Vec2"]["fields"][0]["type"] = "f128";
    });
    expect(many.length).toBeGreaterThanOrEqual(3);
  });
});

describe("최상위·패킷 규칙", () => {
  test.each([
    ["version 2만", (s: Raw) => { s["version"] = 1; }, /version: 2만 지원/],
    ["protoVersion 범위", (s: Raw) => { s["protoVersion"] = 0; }, /protoVersion: 1\.\.2\^31-1/],
    ["모르는 최상위 키", (s: Raw) => { s["encodng"] = "json"; }, /schema: 모르는 키 "encodng"/],
    ["모르는 패킷 키", (s: Raw) => { s["packets"]["PING_BIN"]["frozne"] = true; }, /PING_BIN: 모르는 키 "frozne"/],
    ["모르는 필드 키", (s: Raw) => { s["packets"]["PING_BIN"]["fields"][0]["optinal"] = true; }, /모르는 키 "optinal"/],
    ["패킷명 SCREAMING", (s: Raw) => { s["packets"]["pingBin"] = { id: 0x30, direction: "C2S", fields: [] }; }, /SCREAMING_SNAKE/],
    ["id 0 예약", (s: Raw) => { s["packets"]["PING_BIN"]["id"] = 0; }, /id: 1\.\.65535 정수 \(0은 예약\)/],
    ["id 범위", (s: Raw) => { s["packets"]["PING_BIN"]["id"] = 0x10000; }, /id: 1\.\.65535/],
    ["id 중복", (s: Raw) => { s["packets"]["EMPTY_BIN"]["id"] = 0x10; }, /id 중복 EMPTY_BIN vs PING_BIN/],
    ["direction", (s: Raw) => { s["packets"]["PING_BIN"]["direction"] = "BOTH"; }, /direction: "C2S" \| "S2C"/],
    ["frozen boolean", (s: Raw) => { s["packets"]["PING_BIN"]["frozen"] = "yes"; }, /frozen: boolean/],
  ])("%s", (_name, mutate, pattern) => expectIssue(mutate, pattern));

  // 이진 전환 B6 — JSON 본문·자율 JSON 패킷 폐지. 값과 무관하게(json·binary·true·false) 폐지 사유와 함께 거부한다("모르는 키"가 아니라).
  test.each([
    ["defaultEncoding json", (s: Raw) => { s["defaultEncoding"] = "json"; }, /^schema\.defaultEncoding: 폐지\(B6\) — 패킷 본문은 전부 binary다/],
    ["defaultEncoding binary", (s: Raw) => { s["defaultEncoding"] = "binary"; }, /^schema\.defaultEncoding: 폐지\(B6\)/],
    ["encoding json", (s: Raw) => { s["packets"]["PING_BIN"]["encoding"] = "json"; }, /^packets\.PING_BIN\.encoding: 폐지\(B6\) — 패킷 본문은 전부 binary다\("json" 인코딩 없음/],
    ["encoding binary", (s: Raw) => { s["packets"]["PING_BIN"]["encoding"] = "binary"; }, /^packets\.PING_BIN\.encoding: 폐지\(B6\)/],
    ["freeform", (s: Raw) => { s["packets"]["FREE"] = { id: 0x17, direction: "S2C", freeform: true, fields: [] }; }, /^packets\.FREE\.freeform: 폐지\(B6\) — 자율 JSON 패킷 없음/],
    ["freeform false", (s: Raw) => { s["packets"]["EMPTY_BIN"]["freeform"] = false; }, /^packets\.EMPTY_BIN\.freeform: 폐지\(B6\)/],
    ["bodyOf에 encoding", (s: Raw) => { s["packets"]["WORLD_COPY"]["encoding"] = "json"; }, /^packets\.WORLD_COPY\.encoding: 폐지\(B6\)/],
  ])("B6 폐지 키 — %s", (_name, mutate, pattern) => {
    const issues = issuesOf(mutate);
    expect(issues.filter((i) => pattern.test(i)).length).toBe(1);
    expect(issues.filter((i) => i.includes("모르는 키"))).toEqual([]);
  });

  test("B6 — 종전 JSON 패킷 선언(encoding json + max 없는 array·JSON 전용 struct)은 거부된다", () => {
    const issues = issuesOf((s) => {
      s["structs"]["JsonOnly"] = { fields: [{ name: "note", type: "string" }] };
      s["packets"]["JSON_ONE"] = {
        id: 0x16,
        direction: "C2S",
        encoding: "json",
        fields: [{ name: "list", type: "array", of: "Vec2" }, { name: "j", type: "JsonOnly" }],
      };
    });
    expect(issues).toContain('packets.JSON_ONE.encoding: 폐지(B6) — 패킷 본문은 전부 binary다("json" 인코딩 없음 — "binary"도 적지 않는다)');
  });

  test("bodyOf — 대상 실재·연쇄 금지·fields 선언 금지", () => {
    expectIssue((s) => { s["packets"]["WORLD_COPY"]["bodyOf"] = "NOPE"; }, /bodyOf: 없는 패킷 "NOPE"/);
    expectIssue((s) => { s["packets"]["COPY2"] = { id: 0x31, direction: "S2C", bodyOf: "WORLD_COPY" }; }, /대상 WORLD_COPY도 bodyOf다/);
    expectIssue((s) => { s["packets"]["WORLD_COPY"]["fields"] = [{ name: "a", type: "u8" }]; }, /bodyOf 패킷은 fields를 선언하지 않는다/);
  });
});

describe("필드 규칙", () => {
  const f0 = (s: Raw): Raw => s["packets"]["ALL_PRIMS"]["fields"][0];
  test.each([
    ["이름 camelCase", (s: Raw) => { f0(s)["name"] = "Bad_Name"; }, /필드 이름은 camelCase/],
    ["이름 중복", (s: Raw) => { f0(s)["name"] = "b"; }, /필드 이름 중복 "b"/],
    ["모르는 타입", (s: Raw) => { f0(s)["type"] = "u64"; }, /모르는 타입 "u64"/],
    ["array는 of 필요", (s: Raw) => Object.assign(f0(s), { type: "array", max: 2 }), /array는 원소 타입 "of"가 필요/],
    ["중첩 array 금지", (s: Raw) => Object.assign(f0(s), { type: "array", of: "array", max: 2 }), /중첩 array 금지/],
    ["of는 array 전용", (s: Raw) => { f0(s)["of"] = "u8"; }, /of: array 전용 속성/],
    ["max는 string·array 전용", (s: Raw) => { f0(s)["max"] = 3; }, /max: string·array 전용 속성/],
    ["min은 array 전용", (s: Raw) => { s["packets"]["ALL_PRIMS"]["fields"][9]["min"] = 1; }, /min: array 전용 속성/],
    ["ofMax는 array<string> 전용", (s: Raw) => { s["packets"]["WORLD"]["fields"][3]["ofMax"] = 3; }, /ofMax: array<string> 전용/],
    ["array<string>은 ofMax 필수", (s: Raw) => delete s["packets"]["WORLD"]["fields"][2]["ofMax"], /원소 상한 ofMax가 필요/],
    ["min > max", (s: Raw) => { s["packets"]["WORLD"]["fields"][2]["min"] = 9; }, /min\(9\) > max\(5\)/],
    ["max 상한 65535", (s: Raw) => { s["packets"]["ALL_PRIMS"]["fields"][9]["max"] = 65536; }, /0\.\.65535 정수/],
    ["optional boolean", (s: Raw) => { f0(s)["optional"] = 1; }, /optional: boolean/],
  ])("%s", (_name, mutate, pattern) => expectIssue(mutate, pattern));
});

describe("struct·enum 규칙", () => {
  test.each([
    ["struct 이름 PascalCase", (s: Raw) => { s["structs"]["bad_name"] = { fields: [] }; }, /structs\.bad_name: 이름은 PascalCase/],
    ["예약 식별자", (s: Raw) => { s["structs"]["Protocol"] = { fields: [] }; }, /산출물 예약 식별자/],
    ["Payload 접미사", (s: Raw) => { s["structs"]["FooPayload"] = { fields: [] }; }, /"Payload"로 끝나는 이름/],
    ["패킷 산출물 이름과 충돌", (s: Raw) => { s["structs"]["PingBin"] = { fields: [] }; }, /패킷 PING_BIN의 산출물 이름과 충돌/],
    ["struct·enum 같은 이름", (s: Raw) => { s["enums"]["Vec2"] = { repr: "u8", values: { a: 1 } }; }, /같은 이름의 struct/],
    ["enum repr", (s: Raw) => { s["enums"]["Kind"]["repr"] = "i8"; }, /repr: "u8" \| "u16" \| "u32"/],
    ["enum 값 1개 이상", (s: Raw) => { s["enums"]["Kind"]["values"] = {}; }, /값이 1개 이상인 객체/],
    ["enum 값 이름 camelCase", (s: Raw) => { s["enums"]["Kind"]["values"]["Bad"] = 9; }, /값 이름은 camelCase/],
    ["enum 코드 repr 범위", (s: Raw) => { s["enums"]["Kind"]["values"]["far"] = 256; }, /코드는 u8 범위 정수/],
    ["enum 코드 중복", (s: Raw) => { s["enums"]["Kind"]["values"]["again"] = 2; }, /코드 2 중복 \(npc, again\)/],
    ["자기 재귀 struct", (s: Raw) => s["structs"]["Vec2"]["fields"].push({ name: "next", type: "Vec2", optional: true }), /재귀 struct Vec2 → Vec2/],
    [
      "상호 재귀(array 경유)",
      (s: Raw) => {
        s["structs"]["A"] = { fields: [{ name: "b", type: "array", of: "B", max: 2 }] };
        s["structs"]["B"] = { fields: [{ name: "a", type: "A" }] };
      },
      /재귀 struct A → B → A/,
    ],
    ["C# 코덱 런타임 이름(WireReader)", (s: Raw) => { s["structs"]["WireReader"] = { fields: [] }; }, /structs[.]WireReader: 산출물 예약 식별자/],
    ["C# 코덱 class 이름(WireCodec — enum)", (s: Raw) => { s["enums"]["WireCodec"] = { repr: "u8", values: { a: 1 } }; }, /enums[.]WireCodec: 산출물 예약 식별자/],
    ["struct Body(코덱 디스패치 writeBody와 충돌)", (s: Raw) => { s["structs"]["Body"] = { fields: [] }; }, /structs\.Body: 산출물 예약 식별자/],
    ["패킷 BODY(decodeBody와 충돌)", (s: Raw) => { s["packets"]["BODY"] = { id: 0x31, direction: "S2C", fields: [] }; }, /packets\.BODY: 산출 코덱 함수가 디스패치/],
    ["C# CS0542 — struct 필드 Pascal = struct명", (s: Raw) => { s["structs"]["Vec2"]["fields"][0]["name"] = "vec2"; }, /structs\.Vec2\.vec2: C# 멤버명이 소유 타입명 Vec2/],
    ["C# CS0542 — 패킷 필드 Pascal = 페이로드명", (s: Raw) => { s["packets"]["PING_BIN"]["fields"][0]["name"] = "pingBinPayload"; }, /C# 멤버명이 소유 타입명 PingBinPayload/],
  ])("%s", (_name, mutate, pattern) => expectIssue(mutate, pattern));
});

describe("바이너리 규칙", () => {
  test("패킷의 string·array는 max 필수(B6 — 면제되던 JSON 패킷 없음)", () => {
    expectIssue((s) => delete s["packets"]["ALL_PRIMS"]["fields"][9]["max"], /packets\.ALL_PRIMS\.s: 바이너리 string·array는 max가 필요/);
    expectIssue((s) => delete s["packets"]["WORLD"]["fields"][1]["max"], /packets\.WORLD\.entities: 바이너리 string·array는 max/);
    expect(issuesOf(() => {})).toEqual([]);
  });

  test("패킷이 쓰는 struct도 max 필수, 어느 패킷도 쓰지 않는 struct는 금지(B6 — 종전 JSON 전용 struct 면제를 대신)", () => {
    expectIssue((s) => delete s["structs"]["Tag"]["fields"][0]["max"], /structs\.Tag\.label: 바이너리 string·array는 max/);
    expect(issuesOf((s) => { s["structs"]["Orphan"] = { fields: [{ name: "list", type: "array", of: "u8" }] }; })).toEqual([
      "structs.Orphan: 어느 패킷도 쓰지 않는다 — 미사용 struct 금지",
    ]);
    // 다른 struct 안에서만 쓰여도(간접 도달) 사용이다.
    expect(issuesOf((s) => {
      s["structs"]["Inner"] = { fields: [{ name: "v", type: "u8" }] };
      s["structs"]["Tag"]["fields"].push({ name: "inner", type: "Inner", optional: true });
    })).toEqual([]);
  });

  test("enum 값 이름은 대소문자만 달라도 된다(B6 — 대소문자 무시 유일 규칙의 근거였던 Newtonsoft 역직렬화가 없다, C# PascalCase 멤버도 서로 다르다)", () => {
    expect(issuesOf((s) => { s["enums"]["Kind"]["values"]["nPc"] = 9; })).toEqual([]);
  });

  test("optional 32개 초과 금지", () => {
    expectIssue((s) => {
      s["packets"]["OPTS"]["fields"] = Array.from({ length: 33 }, (_, i) => ({ name: `f${i}`, type: "u8", optional: true }));
    }, /optional 필드는 32개 이하/);
  });

  test("최악 본문 > 65535 금지(SNAPSHOT_DELTA 5460은 65530으로 통과, 5461은 65542로 거부)", () => {
    const raw = realRaw();
    raw["packets"]["SNAPSHOT_DELTA"]["fields"][2]["max"] = 5461;
    expect(() => parseSchema(raw)).toThrow(/SNAPSHOT_DELTA: 최악 본문 65542B > 65535B/);
    expectIssue((s) => { s["packets"]["WORLD"]["fields"][1]["max"] = 2000; }, /packets\.WORLD: 최악 본문 \d+B > 65535B/);
  });

  test("원소 0바이트(빈 struct) array 금지 — 2바이트 본문으로 원소 max개 할당 증폭", () => {
    expectIssue((s) => {
      s["structs"]["Empty"] = { fields: [] };
      s["packets"]["SPAM"] = { id: 0x32, direction: "C2S", fields: [{ name: "xs", type: "array", of: "Empty", max: 65535 }] };
    }, /packets\.SPAM\.xs: 원소 크기 0인 array 금지/);
    // 필드 0개 struct 단일 필드(0바이트)는 증폭이 없어 허용.
    expect(issuesOf((s) => {
      s["structs"]["Empty"] = { fields: [] };
      s["packets"]["PING_BIN"]["fields"].push({ name: "e", type: "Empty" });
    })).toEqual([]);
  });
});
