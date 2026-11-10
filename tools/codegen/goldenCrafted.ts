// 교차 언어 골든의 손으로 짠 사례 — 무작위 생성(golden.ts)이 잘 못 맞히는 경계: 사유 코드 전부·우선순위(범위 먼저·고정 원소 배열은 남은
// 바이트 먼저·첫 위반 우선)·엄격 UTF-8 변종·presence 미사용 비트·float 경계(-0·비정규·최대)·enum 미정의 코드. 바이트는 레이아웃을 손으로
// 적은 hex이고, 기대 결과(expect)는 의도다 — 실제 기대값은 golden.ts가 refCodec으로 계산하며 의도와 다르면 생성이 실패한다(스키마·픽스처가
// 바뀌어 사례가 의도를 잃은 것). 레이아웃은 shared/protocol.md §2, 픽스처는 fixture.ts.

import { type CraftedCase, F32_INF, F32_MAX, F32_NAN, F32_NEG_ZERO, I32_ONE, NAME_64, Z4, c, f32, i32, i32Pair, list, lstr, rep, txt, u16, u8, utf8hex } from "./goldenCraftedBytes";
import { LIFE_L2_REAL, LIFE_REAL } from "./goldenCraftedLife";

export type { CraftedCase } from "./goldenCraftedBytes";

// ── 실물 스키마: 이진 전환 B3b S2C — string max 경계(이름 66·채팅 600·KICK 600·nonce 64)·enum·bool·float·구 JSON KICK 본문 ──

/** ENTITY_SPAWN = entityId i32 | type EntityType(u8) | x f32 | y f32 | name string(66) | level·hp·hpMax·itemId·qty·npcId·monsterDefId i32. */
const spawnBody = (type: string, name: string): string => I32_ONE + type + "0000803f" + "00000040" + name + Z4.repeat(7);
/**
 * SKILL_EFFECT(37 B 고정 — protoVersion 16에 variant·hitIndex) = skillId·caster·target i32 | effectKind u8 | amount i32 | isCrit·isMiss bool |
 * groundX·groundY f32 | castId·impactDelayMs i32 | variant·hitIndex u8. variant 1(활)·hitIndex 1(이중 타격 2타)이 기본값.
 */
const effectBody = (kind: string, isCrit: string, groundX = Z4): string =>
  I32_ONE + I32_ONE + Z4 + kind + Z4 + isCrit + "01" + groundX + Z4 + "ffffff7f" + "84030000" + "01" + "01";
/** CHAT_BCAST = channel i32 | senderId i32 | senderName string(66) | text string(600). */
const chatBody = (name: string, text: string): string => "02000000" + "07000000" + name + text;

const B3B_REAL: readonly CraftedCase[] = [
  c("KICK", "detail-max-600", "ok", I32_ONE, lstr(rep("61", 600))),
  c("KICK", "detail-over-max-before-truncation", "OverMax", I32_ONE, u16(601)),
  // 구 형식 KICK(B1~B2b 클라용 v2 헤더 + JSON 본문 — server/src/net/wireFrame.ts LEGACY_JSON_KICK_FRAME)은 바이너리 KICK으로 읽히지 않는다:
  // reason = '{"re', detail 길이 = "as"(0x7361 = 29537 > 600).
  c("KICK", "legacy-json-body", "OverMax", utf8hex('{"reason":1,"detail":"client update required"}')),
  c("KICK", "detail-lone-surrogate", "BadUtf8", I32_ONE, lstr("eda080")),
  c("ENTITY_SPAWN", "name-max-66", "ok", spawnBody("02", lstr(rep("eab080", 22)))),
  c("ENTITY_SPAWN", "type-grounditem-empty-name", "ok", spawnBody("04", "0000")),
  c("ENTITY_SPAWN", "name-over-max-before-truncation", "OverMax", I32_ONE + "01" + "0000803f" + "00000040" + u16(67)),
  // 생활 L-1 resource(5) — 채집 노드: 레이아웃 그대로, entityId = 노드 대역 시작 1.8e9, hp·hpMax = 미예약·최대 충전 3, npcId 칸 = nodeDefId 9200, monsterDefId 0.
  c("ENTITY_SPAWN", "type-resource-node", "ok",
    "00d2496b", "05", "0000a441", "00001a42", lstr(utf8hex("약초 덤불")), Z4, "03000000", "03000000", Z4, Z4, "f0230000", Z4),
  c("ENTITY_SPAWN", "type-undefined-code", "BadEnum", spawnBody("06", "0000")),
  c("SKILL_EFFECT", "fizzle-int-max-cast", "ok", effectBody("03", "00")),
  c("SKILL_EFFECT", "kind-undefined-code", "BadEnum", effectBody("04", "00")),
  c("SKILL_EFFECT", "is-crit-2", "BadBool", effectBody("00", "02")),
  c("SKILL_EFFECT", "ground-x-nan", "NonFinite", effectBody("02", "00", "0000c07f")),
  c("SKILL_EFFECT", "variant-hit-index-u8-max", "ok", effectBody("00", "00").slice(0, -4) + "ff" + "ff"),
  c("SKILL_EFFECT", "hit-index-missing", "Truncated", effectBody("03", "00").slice(0, -2)),
  c("CHAT_BCAST", "text-max-hangul-600", "ok", chatBody(lstr(rep("eab080", 22)), lstr(rep("eab080", 200)))),
  c("CHAT_BCAST", "text-over-max-before-truncation", "OverMax", chatBody("0000", u16(601))),
  c("CHAT_BCAST", "sender-name-over-max", "OverMax", chatBody(lstr(rep("61", 67)), "0000")),
  c("CHAT_BCAST", "sender-name-overlong-utf8", "BadUtf8", chatBody(lstr("c0af"), "0000")),
  c("MOVE_PATH", "waypoints-max-no-elements", "Truncated", I32_ONE + I32_ONE + u16(1024)),
  c("MOVE_PATH", "waypoints-over-max", "OverMax", I32_ONE + I32_ONE + u16(1025)),
  c("MOVE_PATH", "waypoint-inf", "NonFinite", I32_ONE + I32_ONE + u16(1) + "0000807f" + Z4),
  c("PONG", "epoch-ms", "ok", "0000000000006940", "0000a0a8869c7942"),
  c("PONG", "server-time-nan", "NonFinite", "0000000000006940", "000000000000f87f"),
  c("HELLO_ACK", "nonce-max-64", "ok", "06000000", "0000a0a8869c7942", lstr(rep("66", 64))),
  c("HELLO_ACK", "nonce-over-max-before-truncation", "OverMax", "06000000", "0000a0a8869c7942", u16(65)),
  c("DAMAGE_EVENT", "is-miss-2", "BadBool", I32_ONE, I32_ONE, Z4, "00", "02"),
];

// ── 실물 스키마: 이진 전환 B4 고정형 S2C 17개 — string max 경계(토큰 64·캐릭터명 에코 64·존 이름 64)·빈 문자열·i32 경계·f32 특수값 ──

const I32_MAX_HEX = "ffffff7f";
const I32_MIN_HEX = "00000080";
/** ZONE_INFO = zoneId i32 | name string(64) | width·height f32 | tickRate i32 | spawnX·spawnY f32. */
const zoneInfoBody = (name: string, width = "00008042", spawnX = "00000042"): string =>
  I32_ONE + name + width + "00008042" + "14000000" + spawnX + "00000042";
/** ZONE_CHANGE = newZoneId i32 | name string(64) | width·height f32 | tickRate i32 | spawnX·spawnY f32 | tickIndex i32. */
const zoneChangeBody = (name: string, spawnX: string, tick: string): string =>
  "02000000" + name + "00000043" + "00000043" + "14000000" + spawnX + "00008042" + tick;

const B4_REAL: readonly CraftedCase[] = [
  // AUTH_RESULT = ok bool | accountId i32 | sessionToken string(64) | errCode i32.
  c("AUTH_RESULT", "token-max-64-hex", "ok", "01", "2a000000", lstr(utf8hex("0123456789abcdef".repeat(4))), Z4),
  c("AUTH_RESULT", "failure-empty-token", "ok", "00", Z4, "0000", I32_ONE),
  c("AUTH_RESULT", "token-over-max-before-truncation", "OverMax", "01", I32_ONE, u16(65)),
  c("AUTH_RESULT", "ok-bool-2", "BadBool", "02", I32_ONE, "0000", Z4),
  // CHAR_CREATE_RESULT = ok bool | charId i32 | name string(64) | errCode i32 — 실패는 요청 이름 에코(CHAR_CREATE_REQ.name max 64).
  c("CHAR_CREATE_RESULT", "name-echo-max-64", "ok", "00", Z4, NAME_64, "02000000"),
  c("CHAR_CREATE_RESULT", "name-empty", "ok", "00", Z4, "0000", "06000000"),
  c("CHAR_CREATE_RESULT", "name-over-max-before-truncation", "OverMax", "01", I32_ONE, u16(65)),
  c("CHAR_CREATE_RESULT", "name-lone-surrogate", "BadUtf8", "00", Z4, lstr("eda080"), Z4),
  c("ZONE_INFO", "name-max-64-neg-zero-spawn", "ok", zoneInfoBody(NAME_64, "00008042", F32_NEG_ZERO)),
  c("ZONE_INFO", "name-over-max-before-truncation", "OverMax", I32_ONE, u16(65)),
  c("ZONE_INFO", "width-inf", "NonFinite", zoneInfoBody(lstr(utf8hex("Town")), F32_INF)),
  c("ZONE_CHANGE", "tick-i32-max-spawn-f32-max", "ok", zoneChangeBody(lstr(utf8hex("Field")), F32_MAX, I32_MAX_HEX)),
  c("ZONE_CHANGE", "spawn-nan", "NonFinite", zoneChangeBody(lstr(utf8hex("Field")), F32_NAN, Z4)),
  c("ZONE_CHANGE", "tick-cut", "Truncated", zoneChangeBody("0000", "00000042", Z4).slice(0, -2)),
  // ENTER_WORLD_OK = charId·zoneId·tickIndex i32 | spawnX·spawnY f32.
  c("ENTER_WORLD_OK", "tick-i32-max", "ok", "64000000", I32_ONE, I32_MAX_HEX, "00000042", "00000042"),
  c("ENTER_WORLD_OK", "spawn-y-neg-inf", "NonFinite", "64000000", I32_ONE, Z4, "00000042", "000080ff"),
  c("ENTER_WORLD_OK", "trailing", "Trailing", "64000000", I32_ONE, Z4, "00000042", "00000042", "00"),
  // CHAR_EXP_GAIN = expDelta·sexpDelta·expTotal·sexpTotal i32 — 사망 페널티는 음수 delta.
  c("CHAR_EXP_GAIN", "i32-min-delta", "ok", I32_MIN_HEX, I32_MIN_HEX, I32_MAX_HEX, Z4),
  // GOLD_UPDATE = gold i32 | delta i32 — GOLD_MAX(2e9)·-GOLD_MAX.
  c("GOLD_UPDATE", "gold-max-delta-neg", "ok", "00943577", "006cca88"),
  c("GOLD_UPDATE", "cut", "Truncated", "00943577", "006cca"),
  c("QUEST_PROGRESS", "completable-2", "BadBool", I32_ONE, Z4, I32_ONE, I32_ONE, "02"),
  c("RESPAWN_OK", "spawn-x-nan", "NonFinite", I32_ONE, F32_NAN, "00000042", Z4, Z4, Z4, Z4),
  c("SHOP_ACK", "trailing", "Trailing", I32_ONE, Z4, Z4, "00943577", "00"),
];

// ── 실물 스키마: 이진 전환 B5②b 인벤·상점 — 배열 max 경계(slots 24·offers 256)·string max(상점 이름 240 B)·엄격 UTF-8·i32 경계·bodyOf ──

/** InventoryEntry(12 B) = slot·itemId·qty i32. */
const invEntry = (slot: number, itemId: number, qty: number): string => i32(slot) + i32(itemId) + i32(qty);
/** EquipmentSlots(32 B) = weapon·shield·helmet·armor·gloves·boots·accessory1·accessory2 i32(0 = 빈 칸). */
const EQUIP_EMPTY = Z4.repeat(8);
const EQUIP_FULL = [101, 205, 202, 200, 203, 204, 300, 0x7fffffff].map(i32).join("");
/** 24칸 만석 — 서버 Map 삽입 순(slot 비정렬: 23 → 0), 마지막 칸 itemId·qty i32 최대. */
const INV_FULL = Array.from({ length: 24 }, (_, i) => (i === 23 ? invEntry(0, 0x7fffffff, 0x7fffffff) : invEntry(23 - i, 1000 + i, i + 1))).join("");
/** ShopOffer(12 B) = itemId·buyPrice·sellPrice i32 — 가격 0..GOLD_MAX(2e9). */
const offer = (itemId: number, buy: number, sell: number): string => i32(itemId) + i32(buy) + i32(sell);
/** SHOP_LIST = entityId i32 | shopId i32 | name string(240) | offers u16 + n × ShopOffer. NPC 대역 entityId 1.5e9. */
const shopBody = (name: string, offersHex: string): string => i32(1_500_000_001) + I32_ONE + name + offersHex;
const SHOP_NAME = lstr(utf8hex("로사의 잡화점"));

const B5_2_REAL: readonly CraftedCase[] = [
  // INVENTORY_LIST = slots u16 (≤ 24) + n × InventoryEntry | equipment EquipmentSlots — 최악 2 + 24×12 + 32 = 322 B.
  c("INVENTORY_LIST", "empty-inventory-empty-equipment", "ok", "0000", EQUIP_EMPTY),
  c("INVENTORY_LIST", "slots-max-24-unordered-i32-max-equipment-full", "ok", u16(24), INV_FULL, EQUIP_FULL),
  c("INVENTORY_LIST", "slots-max-no-elements", "Truncated", u16(24), EQUIP_EMPTY),
  c("INVENTORY_LIST", "slots-over-max-25-before-truncation", "OverMax", u16(25), INV_FULL),
  c("INVENTORY_LIST", "equipment-cut", "Truncated", "0100", invEntry(0, 101, 1), EQUIP_EMPTY.slice(0, -2)),
  c("INVENTORY_LIST", "trailing", "Trailing", "0000", EQUIP_EMPTY, "00"),
  // INVENTORY_UPDATE = bodyOf INVENTORY_LIST — 같은 레이아웃·상한(생성 InventoryUpdatePayload는 InventoryListPayload 상속).
  c("INVENTORY_UPDATE", "bodyof-same-layout-starter", "ok", "0400", invEntry(0, 100, 1), invEntry(1, 101, 1), invEntry(2, 1000, 5), invEntry(3, 1001, 3), EQUIP_EMPTY),
  c("INVENTORY_UPDATE", "bodyof-slots-over-max-25", "OverMax", u16(25)),
  // SHOP_LIST — 최악 4 + 4 + (2 + 240) + 2 + 256×12 = 3,324 B.
  c("SHOP_LIST", "name-max-240-hangul-80-no-offers", "ok", shopBody(lstr(rep("eab080", 80)), "0000")),
  c("SHOP_LIST", "name-max-240-astral-60", "ok", shopBody(lstr(rep("f09f9880", 60)), "0000")),
  c("SHOP_LIST", "name-empty-offers-max-256-gold-max", "ok", shopBody("0000", u16(256) + Array.from({ length: 256 }, (_, i) => offer(100 + i, i === 255 ? 2_000_000_000 : i, i === 255 ? 2_000_000_000 : 0)).join(""))),
  c("SHOP_LIST", "real-shape-sell-only-offer", "ok", shopBody(SHOP_NAME, "0200" + offer(1000, 40, 10) + offer(2000, 0, 50))),
  c("SHOP_LIST", "name-over-max-241-before-truncation", "OverMax", i32(1_500_000_001), I32_ONE, u16(241)),
  c("SHOP_LIST", "name-lone-surrogate", "BadUtf8", shopBody(lstr("eda080"), "0000")),
  c("SHOP_LIST", "name-overlong-utf8", "BadUtf8", shopBody(lstr("c0af"), "0000")),
  c("SHOP_LIST", "offers-max-no-elements", "Truncated", shopBody(SHOP_NAME, u16(256))),
  c("SHOP_LIST", "offers-over-max-257-before-truncation", "OverMax", shopBody(SHOP_NAME, u16(257))),
  c("SHOP_LIST", "offer-cut", "Truncated", shopBody(SHOP_NAME, "0100" + offer(1000, 40, 10).slice(0, -2))),
];

// ── 실물 스키마: 이진 전환 B5③b 스킬·UI 설정 — 배열 max/min 경계(skills 256·quickSlots 정확히 6·tracked 5)·string max(스킬 이름 64 B)·
//    정의 enum 3개(SkillCategory·SkillDefEffectKind·SkillTargeting)·f32 특수값(range·aoeRadius)·bool ──

/**
 * SkillInfo = skillId i32 | name string(64) | category u8 | effectKind u8 | mpCost·cooldownMs i32 | range f32 | slvReq·slpCost·maxLevel i32 |
 * targeting u8 | aoeRadius f32 | level i32 | learned bool | allowedRaces u8 | bookOnly bool | bowRange f32 — name 외 46 B 고정, 최악 112 B
 * (protoVersion 16에 allowedRaces·bookOnly·bowRange 추가 — 종전 40 B·106 B). 코드: physical 0·magical 1·heal 2 / damage 0·heal 1·passive 2 /
 * entity 0·ground 1.
 */
const skillInfo = (
  name: string,
  {
    id = 1, cat = "00", kind = "00", mp = 4, cd = 3000, range = f32(2), slv = 1, slp = 1, max = 10, tgt = "00", aoe = Z4, level = 1, learned = "01",
    races = "00", book = "00", bow = Z4,
  } = {},
): string =>
  i32(id) + name + cat + kind + i32(mp) + i32(cd) + range + i32(slv) + i32(slp) + i32(max) + tgt + aoe + i32(level) + learned + races + book + bow;
const STRIKE = skillInfo(lstr(utf8hex("강타")), { level: 3 });
/** UI_PREFERENCES = quickSlots u16 (= 6) + 6 × i32 | trackedQuestIds u16 (≤ 5) + n × i32 | hasSavedSettings bool — 최악 49 B. */
const i32s = (ns: readonly number[]): string => u16(ns.length) + ns.map(i32).join("");
const QUICK_DEFAULT = i32s([1, 2, 3, 0, 0, 0]);

const B5_3_REAL: readonly CraftedCase[] = [
  // SKILL_LIST = skills u16 (≤ 256) + n × SkillInfo — 최악 2 + 256 × 112 = 28,674 B(protoVersion 16 — 종전 106 B·27,138 B).
  c("SKILL_LIST", "empty-catalog", "ok", "0000"),
  c("SKILL_LIST", "real-shape-strike-heal-ground-storm", "ok", u16(3), STRIKE,
    skillInfo(lstr(utf8hex("치유")), { id: 3, cat: "02", kind: "01", mp: 10, cd: 6000, range: f32(0), book: "01" }),
    skillInfo(lstr(utf8hex("마력 폭풍")), { id: 9, cat: "01", mp: 32, cd: 12000, range: f32(7), slv: 16, slp: 5, tgt: "01", aoe: f32(2.5), level: 0, learned: "00" })),
  // protoVersion 16 — 종족 마스크(여우·사자 = 비트 0·1)·스킬북 전용·활 사거리, 패시브(effectKind 2)·전 종족 마스크 0xff.
  c("SKILL_LIST", "races-book-bow-and-passive", "ok", u16(2),
    skillInfo(lstr(utf8hex("이중 타격")), { id: 11, mp: 6, cd: 4000, races: "c0", book: "01", bow: f32(6) }),
    skillInfo(lstr(utf8hex("활 숙련")), { id: 12, kind: "02", mp: 0, cd: 0, range: f32(0), max: 1, level: 0, learned: "00", races: "ff", book: "01" })),
  c("SKILL_LIST", "name-max-64-hangul-21-plus-ascii", "ok", u16(1), skillInfo(NAME_64)),
  c("SKILL_LIST", "name-max-64-astral-16", "ok", u16(1), skillInfo(lstr(rep("f09f9880", 16)))),
  // 개수 경계(256)는 작은 원소로, i32 최대·range 1024(로더 상한 SKILL_RANGE_MAX)는 원소 1개로 — 골든 크기를 묶는다(최악 본문 27,138 B 자체는
  // tests/server/skill/skillDataLoader.test.ts가 실제 송신 바이트로 단정).
  c("SKILL_LIST", "skills-max-256-empty-names", "ok", u16(256),
    Array.from({ length: 256 }, (_, i) => skillInfo("0000", { id: i + 1, cat: ["00", "01", "02"][i % 3]!, kind: i % 2 === 0 ? "00" : "01", level: i % 11, learned: i % 11 > 0 ? "01" : "00" })).join("")),
  c("SKILL_LIST", "i32-max-range-1024-ground", "ok", u16(1), skillInfo(NAME_64, {
    id: 0x7fffffff, cat: "01", mp: 0x7fffffff, cd: 0x7fffffff, range: f32(1024), slv: 0x7fffffff, slp: 0x7fffffff, max: 0x7fffffff,
    tgt: "01", aoe: f32(1024), level: 0x7fffffff,
  })),
  c("SKILL_LIST", "range-neg-zero-aoe-f32-max", "ok", u16(1), skillInfo("0000", { range: F32_NEG_ZERO, aoe: F32_MAX, tgt: "01" })),
  c("SKILL_LIST", "name-over-max-65-before-truncation", "OverMax", u16(1), I32_ONE, u16(65)),
  c("SKILL_LIST", "name-lone-surrogate", "BadUtf8", u16(1), skillInfo(lstr("eda080"))),
  c("SKILL_LIST", "skills-max-no-elements", "Truncated", u16(256)),
  c("SKILL_LIST", "skills-over-max-257-before-truncation", "OverMax", u16(257), STRIKE),
  c("SKILL_LIST", "category-undefined-code-3", "BadEnum", u16(1), skillInfo("0000", { cat: "03" })),
  // 정의 enum은 damage·heal·passive(protoVersion 16 — 코드 2)뿐 — 와이어 결과 enum SkillEffectKind의 fizzle(3)은 여기서 미정의 코드다.
  c("SKILL_LIST", "effect-kind-fizzle-code-3", "BadEnum", u16(1), skillInfo("0000", { kind: "03" })),
  c("SKILL_LIST", "targeting-undefined-code-2", "BadEnum", u16(1), skillInfo("0000", { tgt: "02" })),
  c("SKILL_LIST", "range-nan", "NonFinite", u16(1), skillInfo("0000", { range: F32_NAN })),
  c("SKILL_LIST", "aoe-radius-inf", "NonFinite", u16(1), skillInfo("0000", { tgt: "01", aoe: F32_INF })),
  c("SKILL_LIST", "learned-bool-2", "BadBool", u16(1), skillInfo("0000", { learned: "02" })),
  c("SKILL_LIST", "book-only-bool-2", "BadBool", u16(1), skillInfo("0000", { book: "02" })),
  c("SKILL_LIST", "bow-range-nan", "NonFinite", u16(1), skillInfo("0000", { bow: F32_NAN })),
  c("SKILL_LIST", "element-cut", "Truncated", u16(1), STRIKE.slice(0, -2)),
  c("SKILL_LIST", "trailing", "Trailing", u16(1), STRIKE, "00"),
  // UI_PREFERENCES — quickSlots min = max 6(UI_PREFERENCES_SET과 같은 규칙), tracked ≤ 5.
  c("UI_PREFERENCES", "default-fresh", "ok", QUICK_DEFAULT, "0000", "00"),
  c("UI_PREFERENCES", "saved-tracked-max-5-i32-max", "ok", i32s([3, 0, 1, 0, 2, 0x7fffffff]), i32s([7000, 7001, 7002, 7100, 0x7fffffff]), "01"),
  c("UI_PREFERENCES", "quick-slots-under-min-5-before-truncation", "UnderMin", u16(5)),
  c("UI_PREFERENCES", "quick-slots-under-min-0", "UnderMin", "0000", "0000", "00"),
  c("UI_PREFERENCES", "quick-slots-over-max-7-before-truncation", "OverMax", u16(7)),
  c("UI_PREFERENCES", "quick-slots-cut", "Truncated", u16(6), [1, 2, 3, 0, 0].map(i32).join("")),
  c("UI_PREFERENCES", "tracked-over-max-6", "OverMax", QUICK_DEFAULT, u16(6)),
  c("UI_PREFERENCES", "has-saved-bool-2", "BadBool", QUICK_DEFAULT, "0000", "02"),
  c("UI_PREFERENCES", "trailing", "Trailing", QUICK_DEFAULT, "0000", "00", "00"),
];

// ── 실물 스키마: 이진 전환 B5④b NPC 대화·퀘스트 — 배열 안 struct의 optional presence(DialogOption next·action, DialogAction questId·shopId)와
//    패킷 presence(QUEST_ACTION_ACK rewards)·array<string> ofMax(장 600 B)·배열 max 경계(nodes 12·options 8·pages 4·active 20·목표 8·보상 네 목록 8·
//    지급 18·completed·daily·마커 1024)·string max(label 240·speaker 66·노드 id 64·action type 32·name 120·description 1500·목표 text 96)·enum 3개 ──

/** DialogAction = presence u8(비트 0 questId·비트 1 shopId) | type string(32) | [questId i32] | [shopId i32] — 최악 43 B. */
const dlgAction = (type: string, o: { questId?: number; shopId?: number } = {}): string =>
  u8((o.questId === undefined ? 0 : 1) | (o.shopId === undefined ? 0 : 2)) + type + (o.questId === undefined ? "" : i32(o.questId)) +
  (o.shopId === undefined ? "" : i32(o.shopId));
/** DialogOption = presence u8(비트 0 next·비트 1 action) | label string(240) | [next string(64)] | [action DialogAction] — 최악 352 B. */
const dlgOption = (label: string, o: { next?: string; action?: string } = {}): string =>
  u8((o.next === undefined ? 0 : 1) | (o.action === undefined ? 0 : 2)) + label + (o.next ?? "") + (o.action ?? "");
/** DialogNode = id string(64) | speaker string(66) | pages u16 (≤ 4) + n × string(600) | options u16 (≤ 8) + n × DialogOption — 최악 5,362 B. */
const dlgNode = (id: string, speaker: string, pages: readonly string[], options: readonly string[]): string => id + speaker + list(pages) + list(options);
/** 빈 노드(id·speaker·장·선택지 전부 비어 8 B) — 와이어로는 유효(장 1개 이상·노드 id 형식은 npcs.json 로더 계약). */
const EMPTY_NODE = dlgNode("0000", "0000", [], []);
/** NPC_DIALOG = entityId i32 | npcId i32 | npcName string(66) | dialogueId i32 | entry string(64) | nodes u16 (≤ 12) + n × DialogNode. NPC 대역 1.5e9. */
const dialogBody = (entry: string, nodes: string, npcName = txt("안내인 테오")): string => i32(1_500_000_001) + i32(6001) + npcName + i32(2) + entry + nodes;
/** 빈 진입 노드 1개짜리 대화의 선택지 자리까지(옵션 개수 앞) — 선택지 경계 사례의 접두. */
const ONE_NODE_TO_OPTIONS = dialogBody(txt("a"), u16(1) + txt("a") + "0000" + "0000");

/** QuestLogObjective = kind QuestObjectiveKind(u8) | text string(96) | targetId·current·required i32. 코드: kill 0·collect 1·talk 2·reach 3. */
const objective = (kind: string, text: string, target: number, current: number, required: number): string =>
  kind + text + i32(target) + i32(current) + i32(required);
/** QuestRewardPreview = exp·sexp·slp·gold i32 | fixed·choice·random·bonus u16 (각 ≤ 8) + n × RewardPreviewItem(8 B) — 최악 280 B. */
const preview = (scalars: readonly number[], lists: readonly (readonly string[])[] = [[], [], [], []]): string =>
  scalars.map(i32).join("") + lists.map(list).join("");
const PREVIEW_EMPTY = Z4.repeat(4) + "0000".repeat(4);
/**
 * QuestLogEntry = questId i32 | type QuestType(u8) | name string(120) | description string(1500) | giverNpcId·turnInNpcId i32 |
 * abandonable·completable bool | objectives u16 (≤ 8) + n × QuestLogObjective | rewardPreview — 최소 45 B·최악 2,809 B. 코드: scenario 0·
 * normal 1·regional 2·daily 3.
 */
const logEntry = (o: { id?: number; type?: string; name?: string; desc?: string; flags?: string; objectives?: string; preview?: string } = {}): string =>
  i32(o.id ?? 7000) + (o.type ?? "01") + (o.name ?? "0000") + (o.desc ?? "0000") + i32(6001) + i32(6001) + (o.flags ?? "0100") +
  (o.objectives ?? "0000") + (o.preview ?? PREVIEW_EMPTY);
/** 기본 로그 원소의 목표 개수 앞까지 — 목표·보상 경계 사례의 접두. */
const ENTRY_TO_OBJECTIVES = i32(7000) + "01" + "0000" + "0000" + i32(6001) + i32(6001) + "0100";
/** QuestGrantItem = itemId·qty i32 | source RewardSource(u8) — 9 B. 코드: fixed 0·choice 1·random 2·bonus 3. */
const grant = (itemId: number, qty: number, source: string): string => i32(itemId) + i32(qty) + source;
/** QuestGrantSummary = exp·sexp·slp·gold i32 | items u16 (≤ 18) + n × QuestGrantItem. */
const grantSummary = (scalars: readonly number[], items: readonly string[]): string => scalars.map(i32).join("") + list(items);
const EIGHT_ITEMS = Array.from({ length: 8 }, (_, i) => i32Pair(1000 + i, 999));

const B5_4_REAL: readonly CraftedCase[] = [
  // NPC_DIALOG — 최악 148 + 12 × 5,362 = 64,492 B. 선택지의 next·action 중 정확히 하나는 npcs.json 로더 계약이라 둘 다 있음·둘 다 없음도
  // 와이어로는 유효하다(디코더는 presence 미사용 비트만 거부 — BadPresence).
  c("NPC_DIALOG", "real-shape-next-accept-shop-end", "ok", dialogBody(txt("greet"), u16(2) +
    dlgNode(txt("greet"), "0000", [txt("어서 와."), txt("<b>모험가</b>로군.")], [
      dlgOption(txt("마을에 대해"), { next: txt("about") }),
      dlgOption(txt("맡겨 줘. (퀘스트 수락)"), { action: dlgAction(txt("quest_accept"), { questId: 7000 }) }),
      dlgOption(txt("물건을 보여줘."), { action: dlgAction(txt("open_shop"), { shopId: 1 }) }),
    ]) +
    dlgNode(txt("about"), txt("테오"), [txt("여긴 시작의 마을이야.")], [dlgOption(txt("고마워."), { action: dlgAction(txt("end")) })]))),
  c("NPC_DIALOG", "option-neither-next-nor-action-wire-valid", "ok", dialogBody(txt("a"), list([dlgNode(txt("a"), "0000", [txt("p")], [dlgOption(txt("x"))])]))),
  c("NPC_DIALOG", "option-both-next-and-action-wire-valid", "ok",
    dialogBody(txt("a"), list([dlgNode(txt("a"), "0000", [txt("p")], [dlgOption(txt("x"), { next: txt("a"), action: dlgAction(txt("end")) })])]))),
  c("NPC_DIALOG", "action-quest-and-shop-i32-max-type-max-32", "ok", dialogBody(txt("a"), list([dlgNode(txt("a"), "0000", [], [
    dlgOption("0000", { action: dlgAction(lstr(rep("61", 32)), { questId: 0x7fffffff, shopId: 0x7fffffff }) }),
  ])]))),
  c("NPC_DIALOG", "string-maxes-name-66-entry-64-speaker-66-label-240-next-64", "ok", dialogBody(lstr(rep("61", 64)), list([
    dlgNode(lstr(rep("61", 64)), lstr(rep("eab080", 22)), [txt("p")], [dlgOption(lstr(rep("eab080", 80)), { next: lstr(rep("62", 64)) })]),
  ]), lstr(rep("eab080", 22)))),
  c("NPC_DIALOG", "page-max-600-hangul-200-pages-max-4", "ok",
    dialogBody(txt("a"), list([dlgNode(txt("a"), "0000", [lstr(rep("eab080", 200)), lstr(rep("f09f9880", 150)), "0000", txt("d")], [])]))),
  c("NPC_DIALOG", "nodes-max-12-empty-nodes", "ok", dialogBody(txt("a"), list(Array.from({ length: 12 }, () => EMPTY_NODE)))),
  c("NPC_DIALOG", "options-max-8-empty-labels", "ok", dialogBody(txt("a"), list([dlgNode(txt("a"), "0000", [], Array.from({ length: 8 }, () => dlgOption("0000")))]))),
  c("NPC_DIALOG", "npc-name-over-max-67-before-truncation", "OverMax", i32(1_500_000_001), i32(6001), u16(67)),
  c("NPC_DIALOG", "entry-over-max-65-before-truncation", "OverMax", i32(1_500_000_001), i32(6001), txt("테오"), i32(2), u16(65)),
  c("NPC_DIALOG", "nodes-max-no-elements", "Truncated", dialogBody(txt("a"), u16(12))),
  c("NPC_DIALOG", "nodes-over-max-13-before-truncation", "OverMax", dialogBody(txt("a"), u16(13))),
  c("NPC_DIALOG", "node-id-over-max-65-before-truncation", "OverMax", dialogBody(txt("a"), u16(1) + u16(65))),
  c("NPC_DIALOG", "speaker-over-max-67-before-truncation", "OverMax", dialogBody(txt("a"), u16(1) + txt("a") + u16(67))),
  c("NPC_DIALOG", "pages-over-max-5-before-truncation", "OverMax", dialogBody(txt("a"), u16(1) + txt("a") + "0000" + u16(5))),
  c("NPC_DIALOG", "page-over-max-601-before-truncation", "OverMax", dialogBody(txt("a"), u16(1) + txt("a") + "0000" + u16(1) + u16(601))),
  c("NPC_DIALOG", "page-lone-surrogate", "BadUtf8", dialogBody(txt("a"), list([dlgNode(txt("a"), "0000", [lstr("eda080")], [])]))),
  c("NPC_DIALOG", "options-over-max-9-before-truncation", "OverMax", ONE_NODE_TO_OPTIONS, u16(9)),
  c("NPC_DIALOG", "option-presence-bit2", "BadPresence", ONE_NODE_TO_OPTIONS, u16(1), "04", "0000"),
  c("NPC_DIALOG", "label-over-max-241-before-truncation", "OverMax", ONE_NODE_TO_OPTIONS, u16(1), "00", u16(241)),
  c("NPC_DIALOG", "next-over-max-65-before-truncation", "OverMax", ONE_NODE_TO_OPTIONS, u16(1), "01", "0000", u16(65)),
  c("NPC_DIALOG", "action-presence-bit2", "BadPresence", ONE_NODE_TO_OPTIONS, u16(1), "02", "0000", "04", txt("end")),
  c("NPC_DIALOG", "action-type-over-max-33-before-truncation", "OverMax", ONE_NODE_TO_OPTIONS, u16(1), "02", "0000", "00", u16(33)),
  c("NPC_DIALOG", "action-quest-id-flagged-missing", "Truncated", ONE_NODE_TO_OPTIONS, u16(1), "02", "0000", "01", txt("quest_accept")),
  c("NPC_DIALOG", "trailing", "Trailing", dialogBody(txt("a"), list([EMPTY_NODE])), "00"),
  // QUEST_LIST — 최악 (2 + 20 × 2,809) + 2 × (2 + 1,024 × 4) = 64,378 B.
  c("QUEST_LIST", "empty-log", "ok", "0000", "0000", "0000"),
  c("QUEST_LIST", "real-shape-kill-collect-talk-reach-all-reward-lists", "ok", list([
    logEntry({
      name: txt("슬라임 퇴치"), desc: txt("마을 밖 슬라임을 처치하라."),
      objectives: list([objective("00", txt("슬라임 처치"), 1, 3, 10), objective("01", txt("슬라임 젤리 수집"), 1000, 2, 5)]),
      preview: preview([120, 30, 1, 500], [[i32Pair(1000, 3)], [i32Pair(101, 1), i32Pair(205, 1)], [i32Pair(1001, 2)], [i32Pair(300, 1)]]),
    }),
    logEntry({
      id: 7100, type: "03", name: txt("매일 물약 배달"), flags: "0101",
      objectives: list([objective("02", txt("상인 로사와 대화"), 6000, 1, 1), objective("03", txt("Field 도달"), 2, 0, 1)]),
    }),
  ]), list([i32(7001)]), list([i32(7100)])),
  c("QUEST_LIST", "active-max-20-minimal-entries-all-types", "ok", list(Array.from({ length: 20 }, (_, i) => logEntry({ id: 7000 + i, type: u8(i % 4) }))), "0000", "0000"),
  c("QUEST_LIST", "completed-max-1024-daily-max-1024", "ok", "0000",
    list(Array.from({ length: 1024 }, (_, i) => i32(7000 + i))), list(Array.from({ length: 1024 }, (_, i) => i32(i === 1023 ? 0x7fffffff : 8000 + i)))),
  c("QUEST_LIST", "string-maxes-name-120-desc-1500-text-96", "ok",
    list([logEntry({ name: lstr(rep("eab080", 40)), desc: lstr(rep("eab080", 500)), objectives: list([objective("00", lstr(rep("eab080", 32)), 1, 0, 9999)]) })]), "0000", "0000"),
  c("QUEST_LIST", "objectives-max-8", "ok",
    list([logEntry({ objectives: list(Array.from({ length: 8 }, (_, i) => objective(u8(i % 4), "0000", i + 1, i, 9999))) })]), "0000", "0000"),
  c("QUEST_LIST", "reward-lists-max-8-each-i32-max-scalars", "ok",
    list([logEntry({ preview: preview([0x7fffffff, 0x7fffffff, 0x7fffffff, 2_000_000_000], [EIGHT_ITEMS, EIGHT_ITEMS, EIGHT_ITEMS, EIGHT_ITEMS]) })]), "0000", "0000"),
  c("QUEST_LIST", "active-max-no-elements", "Truncated", u16(20)),
  c("QUEST_LIST", "active-over-max-21-before-truncation", "OverMax", u16(21)),
  c("QUEST_LIST", "completed-max-no-elements", "Truncated", "0000", u16(1024)),
  c("QUEST_LIST", "completed-over-max-1025-before-truncation", "OverMax", "0000", u16(1025)),
  c("QUEST_LIST", "daily-over-max-1025-before-truncation", "OverMax", "0000", "0000", u16(1025)),
  c("QUEST_LIST", "name-over-max-121-before-truncation", "OverMax", u16(1), i32(7000), "01", u16(121)),
  c("QUEST_LIST", "description-over-max-1501-before-truncation", "OverMax", u16(1), i32(7000), "01", "0000", u16(1501)),
  c("QUEST_LIST", "description-lone-surrogate", "BadUtf8", list([logEntry({ desc: lstr("eda080") })]), "0000", "0000"),
  c("QUEST_LIST", "objectives-over-max-9-before-truncation", "OverMax", u16(1), ENTRY_TO_OBJECTIVES, u16(9)),
  c("QUEST_LIST", "objective-text-over-max-97-before-truncation", "OverMax", u16(1), ENTRY_TO_OBJECTIVES, u16(1), "00", u16(97)),
  c("QUEST_LIST", "reward-fixed-over-max-9-before-truncation", "OverMax", u16(1), ENTRY_TO_OBJECTIVES, "0000", Z4.repeat(4), u16(9)),
  c("QUEST_LIST", "reward-choice-over-max-9-before-truncation", "OverMax", u16(1), ENTRY_TO_OBJECTIVES, "0000", Z4.repeat(4), "0000", u16(9)),
  c("QUEST_LIST", "reward-random-over-max-9-before-truncation", "OverMax", u16(1), ENTRY_TO_OBJECTIVES, "0000", Z4.repeat(4), "0000", "0000", u16(9)),
  c("QUEST_LIST", "reward-bonus-over-max-9-before-truncation", "OverMax", u16(1), ENTRY_TO_OBJECTIVES, "0000", Z4.repeat(4), "0000", "0000", "0000", u16(9)),
  c("QUEST_LIST", "type-undefined-code-4", "BadEnum", list([logEntry({ type: "04" })]), "0000", "0000"),
  c("QUEST_LIST", "objective-kind-undefined-code-4", "BadEnum", list([logEntry({ objectives: list([objective("04", "0000", 1, 0, 1)]) })]), "0000", "0000"),
  c("QUEST_LIST", "abandonable-bool-2", "BadBool", list([logEntry({ flags: "0200" })]), "0000", "0000"),
  c("QUEST_LIST", "entry-preview-cut", "Truncated", list([logEntry()]).slice(0, -2)),
  c("QUEST_LIST", "trailing", "Trailing", "0000", "0000", "0000", "00"),
  // QUEST_ACTION_ACK = presence u8(비트 0 rewards) | op·questId·errCode i32 | [rewards QuestGrantSummary] — 최악 1 + 12 + (16 + 2 + 18 × 9) = 193 B.
  c("QUEST_ACTION_ACK", "accept-ok-no-rewards", "ok", "00", Z4, i32(7000), Z4),
  c("QUEST_ACTION_ACK", "turnin-fail-server-err-14", "ok", "00", I32_ONE, i32(7000), i32(14)),
  c("QUEST_ACTION_ACK", "turnin-ok-rewards-all-sources", "ok", "01", I32_ONE, i32(7000), Z4,
    grantSummary([120, 30, 1, 500], [grant(1000, 3, "00"), grant(205, 1, "01"), grant(1001, 2, "02"), grant(300, 1, "03")])),
  c("QUEST_ACTION_ACK", "turnin-ok-empty-rewards", "ok", "01", I32_ONE, i32(7000), Z4, grantSummary([0, 0, 0, 0], [])),
  c("QUEST_ACTION_ACK", "turnin-ok-items-max-18-gold-max", "ok", "01", I32_ONE, i32(0x7fffffff), Z4,
    grantSummary([0x7fffffff, 0x7fffffff, 0x7fffffff, 2_000_000_000], Array.from({ length: 18 }, (_, i) => grant(1000 + i, 999, u8(i < 8 ? 0 : i === 8 ? 1 : i === 9 ? 2 : 3))))),
  c("QUEST_ACTION_ACK", "presence-bit1", "BadPresence", "02", Z4, i32(7000), Z4),
  c("QUEST_ACTION_ACK", "rewards-flagged-missing", "Truncated", "01", I32_ONE, i32(7000), Z4),
  c("QUEST_ACTION_ACK", "items-max-no-elements", "Truncated", "01", I32_ONE, i32(7000), Z4, Z4.repeat(4), u16(18)),
  c("QUEST_ACTION_ACK", "items-over-max-19-before-truncation", "OverMax", "01", I32_ONE, i32(7000), Z4, Z4.repeat(4), u16(19)),
  c("QUEST_ACTION_ACK", "source-undefined-code-4", "BadEnum", "01", I32_ONE, i32(7000), Z4, grantSummary([0, 0, 0, 0], [grant(1000, 1, "04")])),
  c("QUEST_ACTION_ACK", "trailing", "Trailing", "00", Z4, i32(7000), Z4, "00"),
  // QUEST_NPC_MARKERS = npcs u16 (≤ 1024) + n × NpcQuestMarker(npcId·marker i32) — 최악 8,194 B. 빈 배열 = 마커 전부 제거.
  c("QUEST_NPC_MARKERS", "empty-clears-all", "ok", "0000"),
  c("QUEST_NPC_MARKERS", "real-shape-3-markers", "ok", list([i32Pair(6000, 3), i32Pair(6001, 1), i32Pair(6002, 2)])),
  c("QUEST_NPC_MARKERS", "npcs-max-1024-i32-max", "ok", list(Array.from({ length: 1024 }, (_, i) => i32Pair(i === 1023 ? 0x7fffffff : 6000 + i, (i % 3) + 1)))),
  c("QUEST_NPC_MARKERS", "npcs-max-no-elements", "Truncated", u16(1024)),
  c("QUEST_NPC_MARKERS", "npcs-over-max-1025-before-truncation", "OverMax", u16(1025)),
  c("QUEST_NPC_MARKERS", "element-cut", "Truncated", list([i32Pair(6000, 3)]).slice(0, -2)),
  c("QUEST_NPC_MARKERS", "trailing", "Trailing", "0000", "00"),
];

// ── 실물 스키마: 이진 전환 B5①b 캐릭터·포탈 — CHAR_LIST 형태 변경(CharSummary[] — 종전 JSON 문자열)·배열 max 경계(chars 16·statDeltas 3,588·
//    portals 32)·string max(캐릭터 이름 66 B·포탈 이름 64 B)·중첩 struct 고정 본문(CharStats 96 B)·enum 2개(StatGroup·StatCode)·f32 특수값(x·y) ──

/** CharSummary = charId i32 | name string(66) | level·zoneId i32 — 최악 80 B. */
const charSummary = (charId: number, name: string, level: number, zoneId: number): string => i32(charId) + name + i32(level) + i32(zoneId);
const DEVAUTO_NAME_66 = lstr(rep("61", 64) + utf8hex("-1"));
const HANGUL_NAME_66 = lstr(rep("eab080", 22));
/** CharStats(96 B) = 4그룹 × 3 × CharStatPair(value·xp i32) — 순서 pow.atk → luc.act(StatCode 값 순서). */
const statsOf = (value: number, xp: number): string => rep(i32(value) + i32(xp), 12);
/**
 * CHAR_STATS_FULL = charId i32 | name string(66) | race i32 | graph CharGraph(pow·mag·cha·luc i32) | stats CharStats(96 B) | level·exp·hp·hpMax·
 * mp·mpMax·slv·sexp·slp·gold·zoneId i32 | x·y f32 | derived 128 B | freePoints·allocatedPoints i32 — 이름 외 308 B 고정, 최악 376 B.
 */
const statsFullBody = (name: string, o: { ints?: readonly number[]; stats?: string; x?: string; y?: string; points?: readonly [number, number] } = {}): string =>
  i32(1001) + name + i32(2) + [3, 3, 2, 2].map(i32).join("") + (o.stats ?? statsOf(5, 0)) +
  (o.ints ?? [1, 40, 56, 60, 22, 24, 1, 0, 0, 120, 3]).map(i32).join("") + (o.x ?? f32(35.5)) + (o.y ?? f32(33)) + Z4.repeat(32) + (o.points ?? [0, 0]).map(i32).join("");
/** CharStatDelta(14 B) = group StatGroup(u8) | code StatCode(u8) | valueDelta·valueAfter·xpAfter i32. 코드: pow 0·mag 1·cha 2·luc 3 / atk 0 … act 11. */
const statDelta = (group: number, code: number, valueDelta: number, valueAfter: number, xpAfter: number): string =>
  u8(group) + u8(code) + i32(valueDelta) + i32(valueAfter) + i32(xpAfter);
/** 신규 캐릭 1 → 2 레벨업(서버 applyExpGain 결과 — 값 변동 없이 sub-xp만 12개, graph 3/3/2/2). */
const ROOKIE_DELTAS = Array.from({ length: 12 }, (_, i) => statDelta(Math.floor(i / 3), i, 0, 5, i < 6 ? 3 : 2));
/** CHAR_LEVEL_UP = newLevel i32 | statDeltas u16 (≤ 3,588) + n × CharStatDelta | hpMaxNew·mpMaxNew i32 — 최악 4 + (2 + 3,588 × 14) + 8 = 50,246 B. */
const levelUpBody = (newLevel: number, deltas: readonly string[], hpMax = 66, mpMax = 28): string => i32(newLevel) + list(deltas) + i32(hpMax) + i32(mpMax);
/** PortalMarker = portalId i32 | x·y f32 | name string(64) | destZoneId i32 — 최악 82 B. */
const portalMarker = (portalId: number, x: string, y: string, name: string, dest: number): string => i32(portalId) + x + y + name + i32(dest);

/** StatAllocation(5 B) = code StatCode(u8) | points i32. 코드: atk 0 … act 11. */
const statAllocation = (code: number, points: number): string => u8(code) + i32(points);
/** STAT_ALLOCATE = requestId i32 | allocations u16 (≤ 12) + n × StatAllocation — 최악 4 + 2 + 60 = 66 B. */
const statAllocateBody = (allocations: readonly string[], requestId = 7): string => i32(requestId) + list(allocations);

// 자유 포인트 — C2S 첫 enum(STAT_ALLOCATE.allocations[].code): 미정의 코드는 디코드 실패(서버는 strike) — 핸들러까지 가지 않는다.
const STAT_POINTS_REAL: readonly CraftedCase[] = [
  c("STAT_ALLOCATE", "one-stat-4p", "ok", statAllocateBody([statAllocation(0, 4)])),
  c("STAT_ALLOCATE", "twelve-stats-i32-max", "ok", statAllocateBody(Array.from({ length: 12 }, (_, i) => statAllocation(i, 0x7fffffff)), 0x7fffffff)),
  // 빈 요청·points < 1·코드 중복·양수가 아닌 requestId는 와이어로 유효하다 — 판정은 핸들러(BAD_REQUEST·DUPLICATE ACK)라 클라가 이유를 받는다.
  c("STAT_ALLOCATE", "empty-wire-valid", "ok", statAllocateBody([])),
  c("STAT_ALLOCATE", "duplicate-code-negative-points-wire-valid", "ok", statAllocateBody([statAllocation(3, -1), statAllocation(3, 0)])),
  c("STAT_ALLOCATE", "request-id-zero-wire-valid", "ok", statAllocateBody([statAllocation(0, 1)], 0)),
  c("STAT_ALLOCATE", "stat-code-undefined-12", "BadEnum", statAllocateBody([statAllocation(12, 1)])),
  c("STAT_ALLOCATE", "stat-code-undefined-ff", "BadEnum", statAllocateBody([statAllocation(0xff, 1)])),
  c("STAT_ALLOCATE", "second-element-stat-code-undefined", "BadEnum", statAllocateBody([statAllocation(0, 1), statAllocation(12, 1)])),
  c("STAT_ALLOCATE", "over-max-13-before-truncation", "OverMax", i32(7), u16(13)),
  c("STAT_ALLOCATE", "max-12-no-elements", "Truncated", i32(7), u16(12)),
  c("STAT_ALLOCATE", "element-cut", "Truncated", statAllocateBody([statAllocation(0, 1)]).slice(0, -2)),
  c("STAT_ALLOCATE", "trailing", "Trailing", statAllocateBody([statAllocation(0, 1)]), "00"),
  c("STAT_RESET", "request-id", "ok", i32(7)),
  c("STAT_RESET", "empty-body-cut", "Truncated", ""),
  c("STAT_RESET", "trailing", "Trailing", i32(7), "00"),
  // STAT_POINTS_ACK = requestId·op·errCode·freePoints i32 — 16 B.
  c("STAT_POINTS_ACK", "reset-ok-i32-max-balance", "ok", i32(7), I32_ONE, Z4, i32(0x7fffffff)),
  c("STAT_POINTS_ACK", "allocate-no-points", "ok", i32(7), Z4, I32_ONE, i32(3)),
  c("STAT_POINTS_ACK", "duplicate", "ok", i32(7), Z4, i32(7), i32(3)),
  c("STAT_POINTS_ACK", "cut", "Truncated", i32(7), Z4, Z4, "000000"),
  c("STAT_POINTS_ACK", "trailing", "Trailing", i32(7), Z4, Z4, Z4, "00"),
];

const B5_1_REAL: readonly CraftedCase[] = [
  // CHAR_LIST = chars u16 (≤ 16) + n × CharSummary — 최악 2 + 16 × 80 = 1,282 B. 빈 배열 = 캐릭터 없는 계정.
  c("CHAR_LIST", "empty-account", "ok", "0000"),
  c("CHAR_LIST", "real-shape-two-hangul", "ok", list([charSummary(41, txt("별빛모험가"), 12, 1), charSummary(42, txt("푸른별빛"), 7, 2)])),
  c("CHAR_LIST", "chars-max-16-names-max-66-i32-max", "ok",
    list(Array.from({ length: 16 }, (_, i) => charSummary(i === 15 ? 0x7fffffff : 8_100_001 + i, i % 2 === 0 ? DEVAUTO_NAME_66 : HANGUL_NAME_66, i === 15 ? 300 : i + 1, i === 15 ? 0x7fffffff : 1 + (i % 3))))),
  c("CHAR_LIST", "name-max-66-astral-16-plus-ascii-2", "ok", list([charSummary(1, lstr(rep("f09f9880", 16) + "6161"), 1, 1)])),
  c("CHAR_LIST", "chars-max-no-elements", "Truncated", u16(16)),
  c("CHAR_LIST", "chars-over-max-17-before-truncation", "OverMax", u16(17), charSummary(1, txt("a"), 1, 1)),
  c("CHAR_LIST", "name-over-max-67-before-truncation", "OverMax", u16(1), I32_ONE, u16(67)),
  c("CHAR_LIST", "name-lone-surrogate", "BadUtf8", list([charSummary(1, lstr("eda080"), 1, 1)])),
  // ①a까지의 JSON 본문 {"chars":"[]"} — 앞 2바이트('{"' = 0x227b = 8,827)가 개수 자리라 상한 16을 넘는다(구 서버 본문을 새 클라가 오독하지 않는다).
  c("CHAR_LIST", "legacy-json-string-body", "OverMax", utf8hex('{"chars":"[]"}')),
  c("CHAR_LIST", "element-cut", "Truncated", list([charSummary(1, txt("a"), 1, 1)]).slice(0, -2)),
  c("CHAR_LIST", "trailing", "Trailing", "0000", "00"),
  // CHAR_STATS_FULL — 최악 376 B(이름만 가변, protoVersion 12 상세값·13 자유 포인트 포함).
  c("CHAR_STATS_FULL", "real-shape-rookie", "ok", statsFullBody(txt("새내기"))),
  c("CHAR_STATS_FULL", "name-max-66-devauto-i32-max-gold-max", "ok", statsFullBody(DEVAUTO_NAME_66, {
    ints: [300, 0x7fffffff, 0x7fffffff, 0x7fffffff, 0x7fffffff, 0x7fffffff, 300, 0x7fffffff, 0x7fffffff, 2_000_000_000, 0x7fffffff],
    stats: statsOf(10_000, 3),
    points: [0x7fffffff, 0x7fffffff],
  })),
  c("CHAR_STATS_FULL", "name-max-66-hangul-22-empty-graph", "ok", i32(1) + HANGUL_NAME_66 + Z4 + Z4.repeat(4) + statsOf(0, 0) + Z4.repeat(11) + Z4 + Z4 + Z4.repeat(32) + Z4 + Z4),
  c("CHAR_STATS_FULL", "x-neg-zero-y-f32-max", "ok", statsFullBody(txt("n"), { x: F32_NEG_ZERO, y: F32_MAX })),
  c("CHAR_STATS_FULL", "name-over-max-67-before-truncation", "OverMax", i32(1001), u16(67)),
  c("CHAR_STATS_FULL", "name-lone-surrogate", "BadUtf8", statsFullBody(lstr("eda080"))),
  c("CHAR_STATS_FULL", "x-nan", "NonFinite", statsFullBody(txt("n"), { x: F32_NAN })),
  c("CHAR_STATS_FULL", "y-inf", "NonFinite", statsFullBody(txt("n"), { y: F32_INF })),
  c("CHAR_STATS_FULL", "stats-cut", "Truncated", i32(1001) + txt("n") + i32(2) + Z4.repeat(4) + statsOf(5, 0).slice(0, -2)),
  c("CHAR_STATS_FULL", "points-cut", "Truncated", statsFullBody(txt("n")).slice(0, -2)),
  c("CHAR_STATS_FULL", "trailing", "Trailing", statsFullBody(txt("n")), "00"),
  // CHAR_LEVEL_UP — statDeltas 상한 3,588 = 12 × (MAX_LEVEL 300 − 1). 개수 경계는 머리만으로(3,588 = 원소 앞 Truncated, 3,589 = OverMax) —
  // 3,588개 전체 본문(50,246 B) 왕복은 tests/server/wireLimitsContract.test.ts(실제 applyExpGain 1 → 300)·EditMode UiV3IntegrationTests가 본다.
  c("CHAR_LEVEL_UP", "real-shape-rookie-1-to-2-twelve-xp-deltas", "ok", levelUpBody(2, ROOKIE_DELTAS)),
  c("CHAR_LEVEL_UP", "value-grows-end-plus-1", "ok", levelUpBody(3, [statDelta(2, 7, 1, 6, 1)], 73, 31)),
  c("CHAR_LEVEL_UP", "empty-deltas-wire-valid", "ok", levelUpBody(2, [])),
  // group·code는 독립 enum — 짝(pow ↔ atk·hit·agi …)은 서버 순회(applyGraphTickToStats)의 계약이라 어긋난 짝도 와이어로는 유효하다.
  c("CHAR_LEVEL_UP", "group-code-mismatch-wire-valid-i32-max", "ok", levelUpBody(300, [statDelta(3, 0, 0x7fffffff, 0x7fffffff, 0x7fffffff)], 0x7fffffff, 0x7fffffff)),
  c("CHAR_LEVEL_UP", "stat-deltas-max-3588-no-elements", "Truncated", i32(300), u16(3588)),
  c("CHAR_LEVEL_UP", "stat-deltas-over-max-3589-before-truncation", "OverMax", i32(300), u16(3589)),
  c("CHAR_LEVEL_UP", "stat-code-undefined-12", "BadEnum", levelUpBody(2, [statDelta(3, 12, 0, 5, 1)])),
  c("CHAR_LEVEL_UP", "stat-group-undefined-4", "BadEnum", levelUpBody(2, [statDelta(4, 0, 0, 5, 1)])),
  c("CHAR_LEVEL_UP", "element-cut", "Truncated", i32(2), u16(1), statDelta(0, 0, 0, 5, 3).slice(0, -2)),
  c("CHAR_LEVEL_UP", "trailing", "Trailing", levelUpBody(2, []), "00"),
  // PORTAL_LIST = zoneId i32 | portals u16 (≤ 32) + n × PortalMarker — 최악 4 + 2 + 32 × 82 = 2,630 B. 빈 배열 = 포탈 없는 존.
  c("PORTAL_LIST", "real-shape-zone-1-two-portals", "ok", I32_ONE, list([
    portalMarker(1, f32(60.5), f32(32), txt("필드로"), 2), portalMarker(3, f32(28), f32(32), txt("마을 광장으로"), 3),
  ])),
  c("PORTAL_LIST", "portal-less-zone", "ok", i32(4), "0000"),
  c("PORTAL_LIST", "portals-max-32-names-max-64-coord-max-i32-max", "ok", i32(0x7fffffff),
    list(Array.from({ length: 32 }, (_, i) => portalMarker(i === 31 ? 0x7fffffff : i + 1, f32(4096), f32(i * 128), i % 2 === 0 ? lstr(rep("61", 64)) : NAME_64, i === 31 ? 0x7fffffff : 2)))),
  c("PORTAL_LIST", "x-neg-zero-y-f32-max", "ok", I32_ONE, list([portalMarker(1, F32_NEG_ZERO, F32_MAX, txt("p"), 2)])),
  c("PORTAL_LIST", "portals-max-no-elements", "Truncated", I32_ONE, u16(32)),
  c("PORTAL_LIST", "portals-over-max-33-before-truncation", "OverMax", I32_ONE, u16(33)),
  c("PORTAL_LIST", "name-over-max-65-before-truncation", "OverMax", I32_ONE, u16(1), I32_ONE, f32(1), f32(1), u16(65)),
  c("PORTAL_LIST", "name-lone-surrogate", "BadUtf8", I32_ONE, list([portalMarker(1, f32(1), f32(1), lstr("eda080"), 2)])),
  c("PORTAL_LIST", "x-nan", "NonFinite", I32_ONE, list([portalMarker(1, F32_NAN, f32(1), txt("p"), 2)])),
  c("PORTAL_LIST", "y-neg-inf", "NonFinite", I32_ONE, list([portalMarker(1, f32(1), "000080ff", txt("p"), 2)])),
  c("PORTAL_LIST", "element-cut", "Truncated", I32_ONE, list([portalMarker(1, f32(1), f32(1), txt("p"), 2)]).slice(0, -2)),
  c("PORTAL_LIST", "trailing", "Trailing", I32_ONE, "0000", "00"),
];

// ── 실물 스키마: SNAPSHOT_DELTA = tickIndex u32 | ackSeq u32 | count u16 (≤ 5460) | count × {entityId u32, x f32, y f32} ──

const D = "SNAPSHOT_DELTA";
const DH = "07000000" + "05000000";

const REAL: readonly CraftedCase[] = [
  c(D, "empty", "ok", DH, "0000"),
  c(D, "u32-max-header", "ok", "ffffffff", "ffffffff", "0000"),
  c(D, "float-edges", "ok", DH, "0200", "ffffffff", "00000080", "ffff7f7f", "00000000", "01000000", "ffff7fff"),
  c(D, "header-cut", "Truncated", DH, "00"),
  c(D, "count-max-no-elements", "Truncated", DH, "5415"),
  c(D, "count-over-max-before-truncation", "OverMax", DH, "5515"),
  c(D, "count-u16-max", "OverMax", DH, "ffff"),
  c(D, "missing-element", "Truncated", DH, "0200", "01000000", "0000803f", "00000040"),
  c(D, "x-nan", "NonFinite", DH, "0100", "01000000", "0000c07f", "00000000"),
  c(D, "y-inf", "NonFinite", DH, "0100", "01000000", "00000000", "0000807f"),
  c(D, "x-neg-inf", "NonFinite", DH, "0100", "01000000", "000080ff", "00000000"),
  c(D, "fixed-elements-need-before-content", "Truncated", DH, "0200", "01000000", "0000c07f", "00000000"),
  c(D, "nan-before-trailing", "NonFinite", DH, "0100", "01000000", "0000c07f", "00000000", "00"),
  c(D, "trailing", "Trailing", DH, "0000", "00"),
  ...B3B_REAL,
  ...B4_REAL,
  ...B5_2_REAL,
  ...B5_3_REAL,
  ...B5_4_REAL,
  ...B5_1_REAL,
  ...STAT_POINTS_REAL,
  ...LIFE_REAL,
  ...LIFE_L2_REAL,
];

// ── 픽스처 ──

const PING: readonly CraftedCase[] = [
  c("PING_BIN", "f64-neg-zero", "ok", "0000000000000080"),
  c("PING_BIN", "f64-subnormal-min", "ok", "0100000000000000"),
  c("PING_BIN", "f64-max", "ok", "ffffffffffffef7f"),
  c("PING_BIN", "f64-min-normal", "ok", "0000000000001000"),
  c("PING_BIN", "f64-nan", "NonFinite", "000000000000f87f"),
  c("PING_BIN", "f64-signaling-nan", "NonFinite", "010000000000f07f"),
  c("PING_BIN", "f64-inf", "NonFinite", "000000000000f07f"),
  c("PING_BIN", "f64-neg-inf", "NonFinite", "000000000000f0ff"),
  c("PING_BIN", "nan-before-trailing", "NonFinite", "000000000000f87f", "00"),
  c("PING_BIN", "cut", "Truncated", "00000000000000"),
];

/** ALL_PRIMS = a u8 | b u16 | c u32 | d i8 | e i16 | f i32 | g f32 | h f64 | i bool | s string(max 16). 바꿀 칸만 넘긴다. */
function prims(o: { ints?: string; g?: string; h?: string; i?: string; s?: string }): string {
  const ints = o.ints ?? "ab" + "3412" + "efbeadde" + "ff" + "feff" + "fdffffff";
  return ints + (o.g ?? "0000c03f") + (o.h ?? "00000000000002c0") + (o.i ?? "01") + (o.s ?? "0300ed959c");
}

const P = "ALL_PRIMS";
const str = (bytesHex: string): string => (bytesHex.length / 2).toString(16).padStart(2, "0") + "00" + bytesHex;

const PRIMS: readonly CraftedCase[] = [
  c(P, "int-min", "ok", prims({ ints: "00" + "0000" + "00000000" + "80" + "0080" + "00000080" })),
  c(P, "int-max", "ok", prims({ ints: "ff" + "ffff" + "ffffffff" + "7f" + "ff7f" + "ffffff7f" })),
  c(P, "f32-max", "ok", prims({ g: "ffff7f7f" })),
  c(P, "f32-neg-zero", "ok", prims({ g: "00000080" })),
  c(P, "f32-subnormal-min", "ok", prims({ g: "01000000" })),
  c(P, "bool-false", "ok", prims({ i: "00" })),
  c(P, "str-empty", "ok", prims({ s: "0000" })),
  c(P, "str-bom-kept", "ok", prims({ s: str("efbbbf") })),
  c(P, "str-u10ffff", "ok", prims({ s: str("f48fbfbf") })),
  c(P, "str-uffff", "ok", prims({ s: str("efbfbf") })),
  c(P, "str-ud7ff", "ok", prims({ s: str("ed9fbf") })),
  c(P, "str-nul", "ok", prims({ s: str("00") })),
  c(P, "str-u0080", "ok", prims({ s: str("c280") })),
  c(P, "str-emoji", "ok", prims({ s: str("f09f9880") })),
  c(P, "str-max-bytes", "ok", prims({ s: str(rep("61", 16)) })),
  c(P, "bool-2", "BadBool", prims({ i: "02" })),
  c(P, "bool-ff", "BadBool", prims({ i: "ff" })),
  c(P, "f32-nan", "NonFinite", prims({ g: "0000c07f" })),
  c(P, "f32-inf", "NonFinite", prims({ g: "0000807f" })),
  c(P, "f32-neg-inf", "NonFinite", prims({ g: "000080ff" })),
  c(P, "f64-nan", "NonFinite", prims({ h: "000000000000f87f" })),
  c(P, "str-over-max-before-truncation", "OverMax", prims({ s: "1100" })),
  c(P, "str-over-max", "OverMax", prims({ s: str(rep("61", 17)) })),
  c(P, "str-cut", "Truncated", prims({ s: "0300ed95" })),
  c(P, "utf8-overlong-c080", "BadUtf8", prims({ s: str("c080") })),
  c(P, "utf8-overlong-c1bf", "BadUtf8", prims({ s: str("c1bf") })),
  c(P, "utf8-overlong-e08080", "BadUtf8", prims({ s: str("e08080") })),
  c(P, "utf8-overlong-f0808080", "BadUtf8", prims({ s: str("f0808080") })),
  c(P, "utf8-surrogate-eda080", "BadUtf8", prims({ s: str("eda080") })),
  c(P, "utf8-surrogate-edbfbf", "BadUtf8", prims({ s: str("edbfbf") })),
  c(P, "utf8-over-10ffff", "BadUtf8", prims({ s: str("f4908080") })),
  c(P, "utf8-f5-lead", "BadUtf8", prims({ s: str("f5808080") })),
  c(P, "utf8-lone-continuation", "BadUtf8", prims({ s: str("80") })),
  c(P, "utf8-cut-3byte", "BadUtf8", prims({ s: str("e0a0") })),
  c(P, "utf8-cut-4byte", "BadUtf8", prims({ s: str("f09080") })),
  c(P, "utf8-cut-2byte", "BadUtf8", prims({ s: str("c2") })),
  c(P, "utf8-not-continuation", "BadUtf8", prims({ s: str("c241") })),
  c(P, "utf8-ff", "BadUtf8", prims({ s: str("ff") })),
  c(P, "first-wins-bool-before-cut", "BadBool", prims({ i: "02", s: "0300ed" })),
  c(P, "first-wins-nan-before-bool", "NonFinite", prims({ g: "0000c07f", i: "02" })),
  c(P, "first-wins-nan-before-cut", "NonFinite", prims({ g: "0000c07f" }).slice(0, 2 * 27 - 2)),
  c(P, "first-wins-utf8-before-trailing", "BadUtf8", prims({ s: str("c080") }), "00"),
  c(P, "trailing", "Trailing", prims({}), "00"),
];

/** OPTS presence(2바이트, o1..o9 = 비트 0..8) + always(7). */
const OH = (presence: string): string => presence + "0700";
const O = "OPTS";
const ENTITY_MIN = "00" + "01000000" + "02" + "0000000000000000";

const OPTS: readonly CraftedCase[] = [
  c(O, "none", "ok", OH("0000")),
  c(O, "o3-max-code", "ok", OH("0400"), "03"),
  c(O, "o9-entity", "ok", OH("0001"), ENTITY_MIN),
  c(O, "o9-tag-weight", "ok", OH("0001"), "02" + "01000000" + "01" + "0000803f00000000", "0100", "01" + "0000" + "ff7f"),
  c(O, "presence-cut", "Truncated", "00"),
  c(O, "presence-empty", "Truncated", ""),
  c(O, "presence-bit9", "BadPresence", OH("0002")),
  c(O, "presence-bit15", "BadPresence", OH("0080")),
  c(O, "presence-before-truncation", "BadPresence", "0002"),
  c(O, "o3-code-0", "BadEnum", OH("0400"), "00"),
  c(O, "o3-code-4", "BadEnum", OH("0400"), "04"),
  c(O, "o3-code-ff", "BadEnum", OH("0400"), "ff"),
  c(O, "o5-over-max-before-truncation", "OverMax", OH("1000"), "0400"),
  c(O, "o5-missing-element", "Truncated", OH("1000"), "0300", "01000200"),
  c(O, "o6-bool-2", "BadBool", OH("2000"), "02"),
  c(O, "o7-nan", "NonFinite", OH("4000"), "000000000000f87f"),
  c(O, "o2-over-max", "OverMax", OH("0200"), str(rep("61", 7))),
  c(O, "o2-bad-utf8", "BadUtf8", OH("0200"), str("c0af")),
  c(O, "entity-kind-0", "BadEnum", OH("0001"), "00" + "01000000" + "00" + "0000000000000000"),
  c(O, "entity-presence-bit2", "BadPresence", OH("0001"), "04" + "01000000" + "02" + "0000000000000000"),
  c(O, "entity-tags-over-max", "OverMax", OH("0001"), "02" + "01000000" + "02" + "0000000000000000", "0500"),
  c(O, "tag-label-over-max", "OverMax", OH("0001"), "02" + "01000000" + "02" + "0000000000000000", "0100", "00" + str(rep("62", 9))),
  c(O, "tag-presence-bit1", "BadPresence", OH("0001"), "02" + "01000000" + "02" + "0000000000000000", "0100", "02" + "0000"),
  c(O, "entity-name-over-max", "OverMax", OH("0001"), "01" + "01000000" + "02" + "0000000000000000", "1900"),
];

/** WORLD = tick | entities(Entity, max 6) | names(string ofMax 12, 1..5) | kinds(Kind, max 3) | wide u16 | huge u32 | flags(bool, max 4). */
function world(o: { entities?: string; names?: string; kinds?: string; wide?: string; huge?: string; flags?: string }): string {
  return "09000000" + (o.entities ?? "0000") + (o.names ?? "0100" + "0100" + "61") + (o.kinds ?? "0200" + "0103") + (o.wide ?? "ffff") + (o.huge ?? "ffffffff") + (o.flags ?? "0200" + "0100");
}

const W = "WORLD";

const WORLD: readonly CraftedCase[] = [
  c(W, "base", "ok", world({})),
  c(W, "names-five-empty", "ok", world({ names: "0500" + rep("0000", 5) })),
  c(W, "wide-lo-huge-zero", "ok", world({ wide: "0000", huge: "00000000" })),
  c(W, "wide-mid", "ok", world({ wide: "2c01" })),
  c(W, "names-under-min", "UnderMin", world({ names: "0000" })),
  c(W, "names-over-max", "OverMax", world({ names: "0600" })),
  c(W, "names-elem-over-ofmax", "OverMax", world({ names: "0100" + str(rep("61", 13)) })),
  c(W, "names-elem-bad-utf8", "BadUtf8", world({ names: "0100" + str("eda080") })),
  c(W, "entities-over-max", "OverMax", "09000000" + "0700"),
  c(W, "entities-count-u16-max", "OverMax", "09000000" + "ffff"),
  c(W, "entities-claimed-not-present", "Truncated", "09000000" + "0600" + ENTITY_MIN),
  // 가변 원소 개수 > 남은 바이트 — C# WireReader.Capacity가 할당을 남은 바이트로 자르는 경로(사유는 그대로 Truncated).
  c(W, "entities-count-no-bytes", "Truncated", "09000000" + "0600"),
  c(W, "names-count-no-bytes", "Truncated", "09000000" + "0000" + "0500"),
  c(W, "kinds-need-before-bad-enum", "Truncated", "09000000" + "0000" + "0100" + "0100" + "61" + "0300" + "09"),
  c(W, "kinds-bad-enum", "BadEnum", world({ kinds: "0200" + "0109" })),
  c(W, "kinds-over-max", "OverMax", world({ kinds: "0400" })),
  c(W, "wide-undefined-code", "BadEnum", world({ wide: "0100" })),
  c(W, "huge-undefined-code", "BadEnum", world({ huge: "01000000" })),
  c(W, "flags-bool-2", "BadBool", world({ flags: "0200" + "0102" })),
  c(W, "flags-over-max", "OverMax", world({ flags: "0500" })),
  c(W, "trailing", "Trailing", world({}), "00"),
];

const MISC: readonly CraftedCase[] = [
  c("EMPTY_BIN", "empty", "ok"),
  c("EMPTY_BIN", "trailing-00", "Trailing", "00"),
  c("EMPTY_BIN", "trailing-ff", "Trailing", "ff"),
  c("WORLD_COPY", "base", "ok", world({})),
  c("WORLD_COPY", "names-under-min", "UnderMin", world({ names: "0000" })),
  c("OPT32", "none", "ok", "00000000"),
  c("OPT32", "bit31-only", "ok", "00000080", "2a"),
  c("OPT32", "all", "ok", "ffffffff", Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0")).join("")),
  c("OPT32", "bit31-missing-field", "Truncated", "00000080"),
  c("OPT32", "presence-cut", "Truncated", "000000"),
  c("OPT32", "trailing", "Trailing", "00000000", "00"),
];

/** 스키마 라벨별 손으로 짠 사례. */
export function craftedCases(label: "real" | "fixture"): readonly CraftedCase[] {
  return label === "real" ? REAL : [...PING, ...PRIMS, ...OPTS, ...WORLD, ...MISC];
}
