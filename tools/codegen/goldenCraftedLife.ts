// 교차 언어 골든의 손으로 짠 사례 — 생활 패킷(L-1·L-2). 사례의 의미·기대 결과 규칙은 goldenCrafted.ts 머리말과 같다.

import { type CraftedCase, F32_INF, F32_MAX, F32_NAN, F32_NEG_ZERO, I32_ONE, NAME_64, Z4, c, f32, i32, i32Pair, list, lstr, rep, txt, u16, u8, utf8hex } from "./goldenCraftedBytes";

// ── 실물 스키마: 생활 L-1 — enum 2개(LifeChannelKind·LifeLine), code u8 경계, 배열 max 경계(items 8·lines 7·nodes 64), f32 반경 특수값 ──

const NODE_EID = 1_800_000_000;
/** LIFE_CHANNEL(18 B 고정) = channelId i32 | kind LifeChannelKind(u8) | targetEid·durationMs·requestId i32 | code u8. */
const lifeChannelBody = (channelId: number, kind: number, durationMs: number, requestId: number, code: number): string =>
  i32(channelId) + u8(kind) + i32(NODE_EID) + i32(durationMs) + i32(requestId) + u8(code);
/** LIFE_RESULT = channelId i32 | code u8 | items u16 (≤ 8) + n × RewardPreviewItem(itemId·qty i32) | line LifeLine(u8) | profGain i32 — 최악 76 B. */
const lifeResultBody = (code: number, items: readonly string[], line: number, profGain: number, channelId = 1): string =>
  i32(channelId) + u8(code) + list(items) + u8(line) + i32(profGain);
/** LifeLineInfo(10 B) = line LifeLine(u8) | points i32 | rank u8 | nextRankAt i32. 코드: logging 0 … consumable 6. */
const lineInfo = (line: number, points: number, rank: number, nextRankAt: number): string => u8(line) + i32(points) + u8(rank) + i32(nextRankAt);
/** 새 캐릭터가 약초를 한 번 캔 뒤 — 7라인 전부, gathering(2)만 숙련 10. */
const ROOKIE_LINES = Array.from({ length: 7 }, (_, i) => lineInfo(i, i === 2 ? 10 : 0, 0, 1500));
/** LIFE_STATUS = labor·laborMax·msToNext i32 | lines u16 (≤ 7) + n × LifeLineInfo — 최악 84 B. */
const lifeStatusBody = (labor: number, laborMax: number, msToNext: number, lines: readonly string[]): string =>
  i32(labor) + i32(laborMax) + i32(msToNext) + list(lines);
/** NodeDefInfo(11 B) = nodeDefId i32 | line LifeLine(u8) | tier·minRank u8 | interactRadius f32. */
const nodeInfo = (nodeDefId: number, line: number, tier: number, minRank: number, radius: string): string =>
  i32(nodeDefId) + u8(line) + u8(tier) + u8(minRank) + radius;

export const LIFE_REAL: readonly CraftedCase[] = [
  // GATHER_START = nodeEid i32 — 노드 실재·근접은 핸들러가 본다(와이어로는 어떤 i32도 유효).
  c("GATHER_START", "node-band-start", "ok", i32(NODE_EID)),
  c("GATHER_START", "zero-wire-valid", "ok", Z4),
  c("GATHER_START", "cut", "Truncated", "00d249"),
  c("GATHER_START", "trailing", "Trailing", i32(NODE_EID), "00"),
  c("LIFE_CANCEL", "empty", "ok", ""),
  c("LIFE_CANCEL", "trailing", "Trailing", "00"),
  c("LIFE_CHANNEL", "gather-start-2000ms", "ok", lifeChannelBody(1, 0, 2000, 0, 0)),
  c("LIFE_CHANNEL", "reject-action-pending-19", "ok", lifeChannelBody(0, 0, 0, 0, 19)),
  // code는 숫자 u8(생성 enum 아님 — STAT_POINTS_ACK·QUEST_ACTION_ACK 선례) — 아직 정의되지 않은 번호도 와이어로는 유효하다(끝에만 덧붙인다).
  c("LIFE_CHANNEL", "craft-request-id-i32-max-code-ff", "ok", lifeChannelBody(0x7fffffff, 1, 0x7fffffff, 0x7fffffff, 0xff)),
  c("LIFE_CHANNEL", "kind-undefined-2", "BadEnum", lifeChannelBody(1, 2, 2000, 0, 0)),
  c("LIFE_CHANNEL", "cut", "Truncated", lifeChannelBody(1, 0, 2000, 0, 0).slice(0, -2)),
  c("LIFE_CHANNEL", "trailing", "Trailing", lifeChannelBody(1, 0, 2000, 0, 0), "00"),
  c("LIFE_RESULT", "ok-herb-3-dew-1", "ok", lifeResultBody(0, [i32Pair(3200, 3), i32Pair(3201, 1)], 2, 10)),
  c("LIFE_RESULT", "interrupted-empty-items", "ok", lifeResultBody(18, [], 2, 0)),
  c("LIFE_RESULT", "items-max-8-i32-max", "ok",
    lifeResultBody(0, Array.from({ length: 8 }, () => i32Pair(0x7fffffff, 0x7fffffff)), 6, 0x7fffffff, 0x7fffffff)),
  c("LIFE_RESULT", "items-max-no-elements", "Truncated", i32(1), u8(0), u16(8)),
  c("LIFE_RESULT", "items-over-max-9-before-truncation", "OverMax", i32(1), u8(0), u16(9)),
  c("LIFE_RESULT", "line-undefined-7", "BadEnum", lifeResultBody(0, [], 7, 0)),
  c("LIFE_RESULT", "element-cut", "Truncated", i32(1), u8(0), u16(1), i32Pair(3200, 3).slice(0, -2)),
  c("LIFE_RESULT", "trailing", "Trailing", lifeResultBody(0, [], 2, 10), "00"),
  c("LIFE_STATUS", "real-shape-rookie-seven-lines", "ok", lifeStatusBody(3990, 4000, 300_000, ROOKIE_LINES)),
  c("LIFE_STATUS", "lines-max-7-i32-max-top-rank", "ok",
    lifeStatusBody(0x7fffffff, 0x7fffffff, 0x7fffffff, Array.from({ length: 7 }, (_, i) => lineInfo(i, 0x7fffffff, 6, 0)))),
  c("LIFE_STATUS", "lines-empty-wire-valid", "ok", lifeStatusBody(4000, 4000, 0, [])),
  c("LIFE_STATUS", "lines-max-no-elements", "Truncated", lifeStatusBody(0, 0, 0, []).slice(0, -4), u16(7)),
  c("LIFE_STATUS", "lines-over-max-8-before-truncation", "OverMax", lifeStatusBody(0, 0, 0, []).slice(0, -4), u16(8)),
  c("LIFE_STATUS", "line-undefined-7", "BadEnum", lifeStatusBody(0, 0, 0, [lineInfo(7, 0, 0, 1500)])),
  c("LIFE_STATUS", "element-cut", "Truncated", lifeStatusBody(0, 0, 0, [lineInfo(0, 0, 0, 1500)]).slice(0, -2)),
  c("LIFE_STATUS", "trailing", "Trailing", lifeStatusBody(0, 0, 0, []), "00"),
  c("NODE_CATALOG", "real-shape-herb-bush", "ok", list([nodeInfo(9200, 2, 1, 0, f32(1.5))])),
  c("NODE_CATALOG", "empty", "ok", "0000"),
  c("NODE_CATALOG", "nodes-max-64-i32-max-radius-max", "ok",
    list(Array.from({ length: 64 }, (_, i) => nodeInfo(i === 63 ? 0x7fffffff : 9000 + i, i % 3, 3, 6, f32(4))))),
  c("NODE_CATALOG", "radius-neg-zero-f32-max", "ok", list([nodeInfo(9200, 0, 1, 0, F32_NEG_ZERO), nodeInfo(9201, 1, 1, 0, F32_MAX)])),
  c("NODE_CATALOG", "nodes-max-no-elements", "Truncated", u16(64)),
  c("NODE_CATALOG", "nodes-over-max-65-before-truncation", "OverMax", u16(65)),
  c("NODE_CATALOG", "line-undefined-7", "BadEnum", list([nodeInfo(9200, 7, 1, 0, f32(1.5))])),
  c("NODE_CATALOG", "radius-nan", "NonFinite", list([nodeInfo(9200, 2, 1, 0, F32_NAN)])),
  c("NODE_CATALOG", "radius-inf", "NonFinite", list([nodeInfo(9200, 2, 1, 0, F32_INF)])),
  c("NODE_CATALOG", "element-cut", "Truncated", list([nodeInfo(9200, 2, 1, 0, f32(1.5))]).slice(0, -2)),
  c("NODE_CATALOG", "trailing", "Trailing", "0000", "00"),
];

// ── 실물 스키마: 생활 L-2 — 레시피 배열 경계(recipes 128·inputs 6)·작업대 이름 64 B·LifeLine enum·errCode u8 경계·요청 값은 와이어로는 어떤 i32도 유효 ──

const NPC_EID_MIRA = 1_500_000_003;
/** RecipeInfo = recipeId i32 | line LifeLine(u8) | tier·minRank u8 | laborCost·goldFee·outputItemId·outputQty·greatBonusQty i32 | inputs u16 (≤ 6) + n × RewardPreviewItem — 최악 77 B. */
const recipeInfo = (recipeId: number, line: number, costs: readonly [number, number, number, number, number], inputs: readonly string[]): string =>
  i32(recipeId) + u8(line) + u8(1) + u8(0) + costs.map(i32).join("") + list(inputs);
/** HP 물약(crafting.json 9500) — 약초 3 + 빈 병 1, 작업력 10, 수수료 3. */
const RECIPE_HP = recipeInfo(9500, 6, [10, 3, 1000, 1, 1], [i32Pair(3200, 3), i32Pair(3900, 1)]);
/** MP 물약(crafting.json 9501) — 약초 2 + 이슬방울 1 + 빈 병 1, 작업력 10, 수수료 5. */
const RECIPE_MP = recipeInfo(9501, 6, [10, 5, 1001, 1, 1], [i32Pair(3200, 2), i32Pair(3201, 1), i32Pair(3900, 1)]);
/** 재료 6행 + i32 최대 — 원소 최악 77 B. */
const RECIPE_WORST = recipeInfo(0x7fffffff, 6, [0x7fffffff, 0x7fffffff, 0x7fffffff, 0x7fffffff, 0x7fffffff], Array.from({ length: 6 }, () => i32Pair(0x7fffffff, 0x7fffffff)));
/** RECIPE_LIST = npcEid·stationId i32 | name string(64) | recipes u16 (≤ 128) + n × RecipeInfo — 최악 9,932 B. */
const recipeListBody = (name: string, recipes: string): string => i32(NPC_EID_MIRA) + I32_ONE + name + recipes;
const STATION_NAME = txt("약초상의 조합대");
/** CRAFT_REQ(16 B 고정) = npcEid·recipeId·count·requestId i32. */
const craftReqBody = (recipeId: number, count: number, requestId: number): string => i32(NPC_EID_MIRA) + i32(recipeId) + i32(count) + i32(requestId);
/** CRAFT_ACK(21 B 고정) = requestId i32 | errCode u8 | made·greats·gold·outputItemId i32. */
const craftAckBody = (requestId: number, errCode: number, made: number, greats: number, gold: number, outputItemId: number): string =>
  i32(requestId) + u8(errCode) + i32(made) + i32(greats) + i32(gold) + i32(outputItemId);

export const LIFE_L2_REAL: readonly CraftedCase[] = [
  c("RECIPE_LIST", "real-shape-hp-mp", "ok", recipeListBody(STATION_NAME, list([RECIPE_HP, RECIPE_MP]))),
  c("RECIPE_LIST", "empty-recipes", "ok", recipeListBody(STATION_NAME, "0000")),
  c("RECIPE_LIST", "name-max-64-recipes-max-128-inputs-max-6", "ok", recipeListBody(NAME_64, list(Array.from({ length: 128 }, () => RECIPE_WORST)))),
  c("RECIPE_LIST", "name-over-max-65-before-truncation", "OverMax", i32(NPC_EID_MIRA), I32_ONE, u16(65)),
  c("RECIPE_LIST", "name-lone-surrogate", "BadUtf8", recipeListBody(lstr("eda080"), "0000")),
  c("RECIPE_LIST", "recipes-max-no-elements", "Truncated", recipeListBody(STATION_NAME, u16(128))),
  c("RECIPE_LIST", "recipes-over-max-129-before-truncation", "OverMax", recipeListBody(STATION_NAME, u16(129))),
  c("RECIPE_LIST", "inputs-over-max-7-before-truncation", "OverMax", recipeListBody(STATION_NAME, list([i32(9500) + u8(6) + u8(1) + u8(0) + i32(10).repeat(5) + u16(7)]))),
  c("RECIPE_LIST", "line-undefined-7", "BadEnum", recipeListBody(STATION_NAME, list([recipeInfo(9500, 7, [10, 3, 1000, 1, 1], [])]))),
  c("RECIPE_LIST", "element-cut", "Truncated", recipeListBody(STATION_NAME, list([RECIPE_HP])).slice(0, -2)),
  c("RECIPE_LIST", "trailing", "Trailing", recipeListBody(STATION_NAME, "0000"), "00"),
  // CRAFT_REQ — count·requestId 범위는 핸들러가 본다(BAD_COUNT·DUPLICATE) — 와이어로는 어떤 i32도 유효.
  c("CRAFT_REQ", "real-hp-batch-5", "ok", craftReqBody(9500, 5, 1)),
  c("CRAFT_REQ", "zero-wire-valid", "ok", craftReqBody(0, 0, 0)),
  c("CRAFT_REQ", "negative-wire-valid", "ok", craftReqBody(-1, -1, -1)),
  c("CRAFT_REQ", "cut", "Truncated", craftReqBody(9500, 1, 1).slice(0, -2)),
  c("CRAFT_REQ", "trailing", "Trailing", craftReqBody(9500, 1, 1), "00"),
  c("CRAFT_ACK", "ok-batch-5-one-great", "ok", craftAckBody(7, 0, 6, 1, 985, 1000)),
  c("CRAFT_ACK", "duplicate", "ok", craftAckBody(7, 1, 0, 0, 985, 0)),
  // errCode는 숫자 u8(LIFE_CHANNEL.code 선례) — 아직 정의되지 않은 번호도 와이어로는 유효하다(끝에만 덧붙인다).
  c("CRAFT_ACK", "code-ff-i32-max", "ok", craftAckBody(0x7fffffff, 0xff, 0x7fffffff, 0x7fffffff, 0x7fffffff, 0x7fffffff)),
  c("CRAFT_ACK", "cut", "Truncated", craftAckBody(7, 0, 1, 0, 997, 1000).slice(0, -2)),
  c("CRAFT_ACK", "trailing", "Trailing", craftAckBody(7, 0, 1, 0, 997, 1000), "00"),
];
