// AUTO-GENERATED — do not edit. Source: shared/schema/packets.json
// schema-hash: 080391b8
// Run `bun run gen` from tools/codegen/ to regenerate.

// 바이너리 본문 코덱 — 규칙 shared/protocol.md §2, 런타임 server/src/net/wire/runtime.ts, 참조 구현 tools/codegen/refCodec.ts.

import { type AttackStartPayload, type AttackStopPayload, type AuthReqPayload, type AuthResultPayload, type CharChaStats, type CharCreateReqPayload, type CharCreateResultPayload, type CharDerivedStats, type CharExpGainPayload, type CharGraph, type CharLevelUpPayload, type CharListPayload, type CharListReqPayload, type CharLucStats, type CharMagStats, type CharPowStats, type CharStatDelta, type CharStatPair, type CharStats, type CharStatsFullPayload, type CharSummary, type ChatBcastPayload, type ChatSayPayload, type CraftAckPayload, type CraftReqPayload, type CreateCharacterV2Payload, type DamageEventPayload, type DeathNotifyPayload, type DialogAction, type DialogNode, type DialogOption, type EnterWorldOkPayload, type EnterWorldReqPayload, ENTITY_TYPE_CODE, type EntityDespawnPayload, type EntityMetaPayload, type EntitySpawnPayload, type EntityType, type EquipmentSlots, GATHER_PUZZLE_KIND_CODE, type GatherPuzzleKind, type GatherPuzzlePayload, type GatherStartPayload, type GatherTapsPayload, type GatherTracePayload, type GoldUpdatePayload, type HelloAckPayload, type HelloPayload, type InputCmdPayload, type InventoryEntry, type InventoryListPayload, type ItemEquipPayload, type ItemPickupAckPayload, type ItemPickupPayload, type ItemUnequipPayload, type ItemUseAckPayload, type ItemUsePayload, type KickPayload, LIFE_CHANNEL_KIND_CODE, LIFE_LINE_CODE, type LifeCancelPayload, type LifeChannelKind, type LifeChannelPayload, type LifeLine, type LifeLineInfo, type LifeResultPayload, type LifeStatusPayload, type ManaUpdatePayload, MOVE_GAIT_CODE, type MoveGait, type MovePathPayload, type MoveStopPayload, type MoveToPayload, type NodeCatalogPayload, type NodeDefInfo, type NpcActionPayload, type NpcDialogPayload, type NpcInteractPayload, type NpcQuestMarker, PACKET_ID, type PingPayload, type PongPayload, type PortalListPayload, type PortalMarker, type PuzzlePoint, type PuzzleTap, QUEST_OBJECTIVE_KIND_CODE, QUEST_TYPE_CODE, type QuestAbandonPayload, type QuestActionAckPayload, type QuestGrantItem, type QuestGrantSummary, type QuestListPayload, type QuestLogEntry, type QuestLogObjective, type QuestNpcMarkersPayload, type QuestObjectiveKind, type QuestProgressPayload, type QuestRewardPreview, type QuestType, type RecipeInfo, type RecipeListPayload, type RespawnOkPayload, type RespawnReqPayload, REWARD_SOURCE_CODE, type RewardPreviewItem, type RewardSource, type ShopAckPayload, type ShopBuyPayload, type ShopListPayload, type ShopOffer, type ShopSellPayload, SKILL_CATEGORY_CODE, SKILL_DEF_EFFECT_KIND_CODE, SKILL_EFFECT_KIND_CODE, SKILL_TARGETING_CODE, type SkillCastAckPayload, type SkillCastPayload, type SkillCategory, type SkillDefEffectKind, type SkillEffectKind, type SkillEffectPayload, type SkillInfo, type SkillLearnAckPayload, type SkillLearnPayload, type SkillLevelUpPayload, type SkillListPayload, type SkillLvUpPayload, type SkillTargeting, type SnapshotDeltaPayload, type SnapshotUpdate, STAT_CODE_CODE, STAT_GROUP_CODE, type StatAllocatePayload, type StatAllocation, type StatCode, type StatGroup, type StatPointsAckPayload, type StatResetPayload, type TargetAckPayload, type TargetSelectPayload, type UiPreferencesPayload, type UiPreferencesSetPayload, type Waypoint, type ZoneChangePayload, type ZoneChangeReqPayload, type ZoneInfoPayload } from "./codec.generated";
import { bodyReader, type BodyReader, checkBool, checkCount, checkEnum, checkF32, checkF64, checkInt, checkStruct, NO_CODEC, strSize, WIRE_ERROR, WireEncodeError, writeStr } from "./wire/runtime";

function readMoveGait(r: BodyReader): MoveGait {
  switch (r.u8()) {
    case 0:
      return "run";
    case 1:
      return "walk";
    default:
      r.fail(WIRE_ERROR.BadEnum);
      return "run";
  }
}

function readEntityType(r: BodyReader): EntityType {
  switch (r.u8()) {
    case 0:
      return "unknown";
    case 1:
      return "player";
    case 2:
      return "monster";
    case 3:
      return "npc";
    case 4:
      return "grounditem";
    case 5:
      return "resource";
    default:
      r.fail(WIRE_ERROR.BadEnum);
      return "unknown";
  }
}

function readSkillEffectKind(r: BodyReader): SkillEffectKind {
  switch (r.u8()) {
    case 0:
      return "damage";
    case 1:
      return "heal";
    case 2:
      return "cast";
    case 3:
      return "fizzle";
    default:
      r.fail(WIRE_ERROR.BadEnum);
      return "damage";
  }
}

function readSkillCategory(r: BodyReader): SkillCategory {
  switch (r.u8()) {
    case 0:
      return "physical";
    case 1:
      return "magical";
    case 2:
      return "heal";
    default:
      r.fail(WIRE_ERROR.BadEnum);
      return "physical";
  }
}

function readSkillDefEffectKind(r: BodyReader): SkillDefEffectKind {
  switch (r.u8()) {
    case 0:
      return "damage";
    case 1:
      return "heal";
    case 2:
      return "passive";
    default:
      r.fail(WIRE_ERROR.BadEnum);
      return "damage";
  }
}

function readSkillTargeting(r: BodyReader): SkillTargeting {
  switch (r.u8()) {
    case 0:
      return "entity";
    case 1:
      return "ground";
    default:
      r.fail(WIRE_ERROR.BadEnum);
      return "entity";
  }
}

function readQuestType(r: BodyReader): QuestType {
  switch (r.u8()) {
    case 0:
      return "scenario";
    case 1:
      return "normal";
    case 2:
      return "regional";
    case 3:
      return "daily";
    default:
      r.fail(WIRE_ERROR.BadEnum);
      return "scenario";
  }
}

function readQuestObjectiveKind(r: BodyReader): QuestObjectiveKind {
  switch (r.u8()) {
    case 0:
      return "kill";
    case 1:
      return "collect";
    case 2:
      return "talk";
    case 3:
      return "reach";
    default:
      r.fail(WIRE_ERROR.BadEnum);
      return "kill";
  }
}

function readRewardSource(r: BodyReader): RewardSource {
  switch (r.u8()) {
    case 0:
      return "fixed";
    case 1:
      return "choice";
    case 2:
      return "random";
    case 3:
      return "bonus";
    default:
      r.fail(WIRE_ERROR.BadEnum);
      return "fixed";
  }
}

function readStatGroup(r: BodyReader): StatGroup {
  switch (r.u8()) {
    case 0:
      return "pow";
    case 1:
      return "mag";
    case 2:
      return "cha";
    case 3:
      return "luc";
    default:
      r.fail(WIRE_ERROR.BadEnum);
      return "pow";
  }
}

function readStatCode(r: BodyReader): StatCode {
  switch (r.u8()) {
    case 0:
      return "atk";
    case 1:
      return "hit";
    case 2:
      return "agi";
    case 3:
      return "mat";
    case 4:
      return "wis";
    case 5:
      return "mdef";
    case 6:
      return "eva";
    case 7:
      return "end";
    case 8:
      return "def";
    case 9:
      return "pot";
    case 10:
      return "luk";
    case 11:
      return "act";
    default:
      r.fail(WIRE_ERROR.BadEnum);
      return "atk";
  }
}

function readLifeLine(r: BodyReader): LifeLine {
  switch (r.u8()) {
    case 0:
      return "logging";
    case 1:
      return "mining";
    case 2:
      return "gathering";
    case 3:
      return "weapon";
    case 4:
      return "armor";
    case 5:
      return "accessory";
    case 6:
      return "consumable";
    default:
      r.fail(WIRE_ERROR.BadEnum);
      return "logging";
  }
}

function readLifeChannelKind(r: BodyReader): LifeChannelKind {
  switch (r.u8()) {
    case 0:
      return "gather";
    case 1:
      return "craft";
    default:
      r.fail(WIRE_ERROR.BadEnum);
      return "gather";
  }
}

function readGatherPuzzleKind(r: BodyReader): GatherPuzzleKind {
  switch (r.u8()) {
    case 0:
      return "trace";
    case 1:
      return "tap";
    default:
      r.fail(WIRE_ERROR.BadEnum);
      return "trace";
  }
}

// ── CharSummary ──

/** CharSummary 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeCharSummary(p: CharSummary): number {
  let n = 12;
  checkInt(p.charId, -2147483648, 2147483647, "CharSummary.charId");
  n += strSize(p.name, 66, "CharSummary.name");
  checkInt(p.level, -2147483648, 2147483647, "CharSummary.level");
  checkInt(p.zoneId, -2147483648, 2147483647, "CharSummary.zoneId");
  return n;
}

/** CharSummary를 out[off..]에 쓰고 끝 오프셋 — sizeCharSummary로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeCharSummary(p: CharSummary, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.charId, o);
  o = writeStr(out, o, p.name);
  o = out.writeInt32LE(p.level, o);
  o = out.writeInt32LE(p.zoneId, o);
  return o;
}

/** CharSummary 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readCharSummary(r: BodyReader): CharSummary | null {
  const $charId = r.i32();
  const $name = r.str(66);
  const $level = r.i32();
  const $zoneId = r.i32();
  if (r.err !== 0) return null;
  return { charId: $charId, name: $name, level: $level, zoneId: $zoneId };
}

// ── PortalMarker ──

/** PortalMarker 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizePortalMarker(p: PortalMarker): number {
  let n = 16;
  checkInt(p.portalId, -2147483648, 2147483647, "PortalMarker.portalId");
  checkF32(p.x, "PortalMarker.x");
  checkF32(p.y, "PortalMarker.y");
  n += strSize(p.name, 64, "PortalMarker.name");
  checkInt(p.destZoneId, -2147483648, 2147483647, "PortalMarker.destZoneId");
  return n;
}

/** PortalMarker를 out[off..]에 쓰고 끝 오프셋 — sizePortalMarker로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writePortalMarker(p: PortalMarker, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.portalId, o);
  o = out.writeFloatLE(p.x, o);
  o = out.writeFloatLE(p.y, o);
  o = writeStr(out, o, p.name);
  o = out.writeInt32LE(p.destZoneId, o);
  return o;
}

/** PortalMarker 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readPortalMarker(r: BodyReader): PortalMarker | null {
  const $portalId = r.i32();
  const $x = r.f32();
  const $y = r.f32();
  const $name = r.str(64);
  const $destZoneId = r.i32();
  if (r.err !== 0) return null;
  return { portalId: $portalId, x: $x, y: $y, name: $name, destZoneId: $destZoneId };
}

// ── SnapshotUpdate ──

/** SnapshotUpdate 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeSnapshotUpdate(p: SnapshotUpdate): number {
  checkInt(p.entityId, 0, 4294967295, "SnapshotUpdate.entityId");
  checkF32(p.x, "SnapshotUpdate.x");
  checkF32(p.y, "SnapshotUpdate.y");
  return 12;
}

/** SnapshotUpdate를 out[off..]에 쓰고 끝 오프셋 — sizeSnapshotUpdate로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeSnapshotUpdate(p: SnapshotUpdate, out: Buffer, off: number): number {
  let o = off;
  o = out.writeUInt32LE(p.entityId, o);
  o = out.writeFloatLE(p.x, o);
  o = out.writeFloatLE(p.y, o);
  return o;
}

/** SnapshotUpdate 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readSnapshotUpdate(r: BodyReader): SnapshotUpdate | null {
  const $entityId = r.u32();
  const $x = r.f32();
  const $y = r.f32();
  if (r.err !== 0) return null;
  return { entityId: $entityId, x: $x, y: $y };
}

// ── Waypoint ──

/** Waypoint 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeWaypoint(p: Waypoint): number {
  checkF32(p.x, "Waypoint.x");
  checkF32(p.y, "Waypoint.y");
  return 8;
}

/** Waypoint를 out[off..]에 쓰고 끝 오프셋 — sizeWaypoint로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeWaypoint(p: Waypoint, out: Buffer, off: number): number {
  let o = off;
  o = out.writeFloatLE(p.x, o);
  o = out.writeFloatLE(p.y, o);
  return o;
}

/** Waypoint 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readWaypoint(r: BodyReader): Waypoint | null {
  const $x = r.f32();
  const $y = r.f32();
  if (r.err !== 0) return null;
  return { x: $x, y: $y };
}

// ── CharGraph ──

/** CharGraph 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeCharGraph(p: CharGraph): number {
  checkInt(p.pow, -2147483648, 2147483647, "CharGraph.pow");
  checkInt(p.mag, -2147483648, 2147483647, "CharGraph.mag");
  checkInt(p.cha, -2147483648, 2147483647, "CharGraph.cha");
  checkInt(p.luc, -2147483648, 2147483647, "CharGraph.luc");
  return 16;
}

/** CharGraph를 out[off..]에 쓰고 끝 오프셋 — sizeCharGraph로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeCharGraph(p: CharGraph, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.pow, o);
  o = out.writeInt32LE(p.mag, o);
  o = out.writeInt32LE(p.cha, o);
  o = out.writeInt32LE(p.luc, o);
  return o;
}

/** CharGraph 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readCharGraph(r: BodyReader): CharGraph | null {
  const $pow = r.i32();
  const $mag = r.i32();
  const $cha = r.i32();
  const $luc = r.i32();
  if (r.err !== 0) return null;
  return { pow: $pow, mag: $mag, cha: $cha, luc: $luc };
}

// ── CharStats ──

/** CharStats 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeCharStats(p: CharStats): number {
  let n = 0;
  n += sizeCharPowStats(checkStruct(p.pow, "CharStats.pow"));
  n += sizeCharMagStats(checkStruct(p.mag, "CharStats.mag"));
  n += sizeCharChaStats(checkStruct(p.cha, "CharStats.cha"));
  n += sizeCharLucStats(checkStruct(p.luc, "CharStats.luc"));
  return n;
}

/** CharStats를 out[off..]에 쓰고 끝 오프셋 — sizeCharStats로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeCharStats(p: CharStats, out: Buffer, off: number): number {
  let o = off;
  o = writeCharPowStats(p.pow, out, o);
  o = writeCharMagStats(p.mag, out, o);
  o = writeCharChaStats(p.cha, out, o);
  o = writeCharLucStats(p.luc, out, o);
  return o;
}

/** CharStats 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readCharStats(r: BodyReader): CharStats | null {
  const $pow = readCharPowStats(r);
  if ($pow === null) return null;
  const $mag = readCharMagStats(r);
  if ($mag === null) return null;
  const $cha = readCharChaStats(r);
  if ($cha === null) return null;
  const $luc = readCharLucStats(r);
  if ($luc === null) return null;
  if (r.err !== 0) return null;
  return { pow: $pow, mag: $mag, cha: $cha, luc: $luc };
}

// ── CharPowStats ──

/** CharPowStats 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeCharPowStats(p: CharPowStats): number {
  let n = 0;
  n += sizeCharStatPair(checkStruct(p.atk, "CharPowStats.atk"));
  n += sizeCharStatPair(checkStruct(p.hit, "CharPowStats.hit"));
  n += sizeCharStatPair(checkStruct(p.agi, "CharPowStats.agi"));
  return n;
}

/** CharPowStats를 out[off..]에 쓰고 끝 오프셋 — sizeCharPowStats로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeCharPowStats(p: CharPowStats, out: Buffer, off: number): number {
  let o = off;
  o = writeCharStatPair(p.atk, out, o);
  o = writeCharStatPair(p.hit, out, o);
  o = writeCharStatPair(p.agi, out, o);
  return o;
}

/** CharPowStats 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readCharPowStats(r: BodyReader): CharPowStats | null {
  const $atk = readCharStatPair(r);
  if ($atk === null) return null;
  const $hit = readCharStatPair(r);
  if ($hit === null) return null;
  const $agi = readCharStatPair(r);
  if ($agi === null) return null;
  if (r.err !== 0) return null;
  return { atk: $atk, hit: $hit, agi: $agi };
}

// ── CharStatPair ──

/** CharStatPair 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeCharStatPair(p: CharStatPair): number {
  checkInt(p.value, -2147483648, 2147483647, "CharStatPair.value");
  checkInt(p.xp, -2147483648, 2147483647, "CharStatPair.xp");
  return 8;
}

/** CharStatPair를 out[off..]에 쓰고 끝 오프셋 — sizeCharStatPair로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeCharStatPair(p: CharStatPair, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.value, o);
  o = out.writeInt32LE(p.xp, o);
  return o;
}

/** CharStatPair 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readCharStatPair(r: BodyReader): CharStatPair | null {
  const $value = r.i32();
  const $xp = r.i32();
  if (r.err !== 0) return null;
  return { value: $value, xp: $xp };
}

// ── CharMagStats ──

/** CharMagStats 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeCharMagStats(p: CharMagStats): number {
  let n = 0;
  n += sizeCharStatPair(checkStruct(p.mat, "CharMagStats.mat"));
  n += sizeCharStatPair(checkStruct(p.wis, "CharMagStats.wis"));
  n += sizeCharStatPair(checkStruct(p.mdef, "CharMagStats.mdef"));
  return n;
}

/** CharMagStats를 out[off..]에 쓰고 끝 오프셋 — sizeCharMagStats로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeCharMagStats(p: CharMagStats, out: Buffer, off: number): number {
  let o = off;
  o = writeCharStatPair(p.mat, out, o);
  o = writeCharStatPair(p.wis, out, o);
  o = writeCharStatPair(p.mdef, out, o);
  return o;
}

/** CharMagStats 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readCharMagStats(r: BodyReader): CharMagStats | null {
  const $mat = readCharStatPair(r);
  if ($mat === null) return null;
  const $wis = readCharStatPair(r);
  if ($wis === null) return null;
  const $mdef = readCharStatPair(r);
  if ($mdef === null) return null;
  if (r.err !== 0) return null;
  return { mat: $mat, wis: $wis, mdef: $mdef };
}

// ── CharChaStats ──

/** CharChaStats 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeCharChaStats(p: CharChaStats): number {
  let n = 0;
  n += sizeCharStatPair(checkStruct(p.eva, "CharChaStats.eva"));
  n += sizeCharStatPair(checkStruct(p.end, "CharChaStats.end"));
  n += sizeCharStatPair(checkStruct(p.def, "CharChaStats.def"));
  return n;
}

/** CharChaStats를 out[off..]에 쓰고 끝 오프셋 — sizeCharChaStats로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeCharChaStats(p: CharChaStats, out: Buffer, off: number): number {
  let o = off;
  o = writeCharStatPair(p.eva, out, o);
  o = writeCharStatPair(p.end, out, o);
  o = writeCharStatPair(p.def, out, o);
  return o;
}

/** CharChaStats 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readCharChaStats(r: BodyReader): CharChaStats | null {
  const $eva = readCharStatPair(r);
  if ($eva === null) return null;
  const $end = readCharStatPair(r);
  if ($end === null) return null;
  const $def = readCharStatPair(r);
  if ($def === null) return null;
  if (r.err !== 0) return null;
  return { eva: $eva, end: $end, def: $def };
}

// ── CharLucStats ──

/** CharLucStats 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeCharLucStats(p: CharLucStats): number {
  let n = 0;
  n += sizeCharStatPair(checkStruct(p.pot, "CharLucStats.pot"));
  n += sizeCharStatPair(checkStruct(p.luk, "CharLucStats.luk"));
  n += sizeCharStatPair(checkStruct(p.act, "CharLucStats.act"));
  return n;
}

/** CharLucStats를 out[off..]에 쓰고 끝 오프셋 — sizeCharLucStats로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeCharLucStats(p: CharLucStats, out: Buffer, off: number): number {
  let o = off;
  o = writeCharStatPair(p.pot, out, o);
  o = writeCharStatPair(p.luk, out, o);
  o = writeCharStatPair(p.act, out, o);
  return o;
}

/** CharLucStats 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readCharLucStats(r: BodyReader): CharLucStats | null {
  const $pot = readCharStatPair(r);
  if ($pot === null) return null;
  const $luk = readCharStatPair(r);
  if ($luk === null) return null;
  const $act = readCharStatPair(r);
  if ($act === null) return null;
  if (r.err !== 0) return null;
  return { pot: $pot, luk: $luk, act: $act };
}

// ── CharDerivedStats ──

/** CharDerivedStats 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeCharDerivedStats(p: CharDerivedStats): number {
  checkF64(p.attackPower, "CharDerivedStats.attackPower");
  checkF64(p.magicPower, "CharDerivedStats.magicPower");
  checkF64(p.defense, "CharDerivedStats.defense");
  checkF64(p.magicDefense, "CharDerivedStats.magicDefense");
  checkF64(p.hitRating, "CharDerivedStats.hitRating");
  checkF64(p.evasionRating, "CharDerivedStats.evasionRating");
  checkF64(p.magicHitRating, "CharDerivedStats.magicHitRating");
  checkF64(p.magicEvasionRating, "CharDerivedStats.magicEvasionRating");
  checkF64(p.hitChance, "CharDerivedStats.hitChance");
  checkF64(p.evasionChance, "CharDerivedStats.evasionChance");
  checkF64(p.magicHitChance, "CharDerivedStats.magicHitChance");
  checkF64(p.magicEvasionChance, "CharDerivedStats.magicEvasionChance");
  checkF64(p.critChance, "CharDerivedStats.critChance");
  checkF64(p.critMultiplier, "CharDerivedStats.critMultiplier");
  checkInt(p.attackIntervalMs, -2147483648, 2147483647, "CharDerivedStats.attackIntervalMs");
  checkF32(p.moveSpeed, "CharDerivedStats.moveSpeed");
  checkF64(p.mpRegenPerMin, "CharDerivedStats.mpRegenPerMin");
  return 128;
}

/** CharDerivedStats를 out[off..]에 쓰고 끝 오프셋 — sizeCharDerivedStats로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeCharDerivedStats(p: CharDerivedStats, out: Buffer, off: number): number {
  let o = off;
  o = out.writeDoubleLE(p.attackPower, o);
  o = out.writeDoubleLE(p.magicPower, o);
  o = out.writeDoubleLE(p.defense, o);
  o = out.writeDoubleLE(p.magicDefense, o);
  o = out.writeDoubleLE(p.hitRating, o);
  o = out.writeDoubleLE(p.evasionRating, o);
  o = out.writeDoubleLE(p.magicHitRating, o);
  o = out.writeDoubleLE(p.magicEvasionRating, o);
  o = out.writeDoubleLE(p.hitChance, o);
  o = out.writeDoubleLE(p.evasionChance, o);
  o = out.writeDoubleLE(p.magicHitChance, o);
  o = out.writeDoubleLE(p.magicEvasionChance, o);
  o = out.writeDoubleLE(p.critChance, o);
  o = out.writeDoubleLE(p.critMultiplier, o);
  o = out.writeInt32LE(p.attackIntervalMs, o);
  o = out.writeFloatLE(p.moveSpeed, o);
  o = out.writeDoubleLE(p.mpRegenPerMin, o);
  return o;
}

/** CharDerivedStats 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readCharDerivedStats(r: BodyReader): CharDerivedStats | null {
  const $attackPower = r.f64();
  const $magicPower = r.f64();
  const $defense = r.f64();
  const $magicDefense = r.f64();
  const $hitRating = r.f64();
  const $evasionRating = r.f64();
  const $magicHitRating = r.f64();
  const $magicEvasionRating = r.f64();
  const $hitChance = r.f64();
  const $evasionChance = r.f64();
  const $magicHitChance = r.f64();
  const $magicEvasionChance = r.f64();
  const $critChance = r.f64();
  const $critMultiplier = r.f64();
  const $attackIntervalMs = r.i32();
  const $moveSpeed = r.f32();
  const $mpRegenPerMin = r.f64();
  if (r.err !== 0) return null;
  return { attackPower: $attackPower, magicPower: $magicPower, defense: $defense, magicDefense: $magicDefense, hitRating: $hitRating, evasionRating: $evasionRating, magicHitRating: $magicHitRating, magicEvasionRating: $magicEvasionRating, hitChance: $hitChance, evasionChance: $evasionChance, magicHitChance: $magicHitChance, magicEvasionChance: $magicEvasionChance, critChance: $critChance, critMultiplier: $critMultiplier, attackIntervalMs: $attackIntervalMs, moveSpeed: $moveSpeed, mpRegenPerMin: $mpRegenPerMin };
}

// ── CharStatDelta ──

/** CharStatDelta 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeCharStatDelta(p: CharStatDelta): number {
  checkEnum(STAT_GROUP_CODE, p.group, "CharStatDelta.group");
  checkEnum(STAT_CODE_CODE, p.code, "CharStatDelta.code");
  checkInt(p.valueDelta, -2147483648, 2147483647, "CharStatDelta.valueDelta");
  checkInt(p.valueAfter, -2147483648, 2147483647, "CharStatDelta.valueAfter");
  checkInt(p.xpAfter, -2147483648, 2147483647, "CharStatDelta.xpAfter");
  return 14;
}

/** CharStatDelta를 out[off..]에 쓰고 끝 오프셋 — sizeCharStatDelta로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeCharStatDelta(p: CharStatDelta, out: Buffer, off: number): number {
  let o = off;
  o = out.writeUInt8(STAT_GROUP_CODE[p.group], o);
  o = out.writeUInt8(STAT_CODE_CODE[p.code], o);
  o = out.writeInt32LE(p.valueDelta, o);
  o = out.writeInt32LE(p.valueAfter, o);
  o = out.writeInt32LE(p.xpAfter, o);
  return o;
}

/** CharStatDelta 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readCharStatDelta(r: BodyReader): CharStatDelta | null {
  const $group = readStatGroup(r);
  const $code = readStatCode(r);
  const $valueDelta = r.i32();
  const $valueAfter = r.i32();
  const $xpAfter = r.i32();
  if (r.err !== 0) return null;
  return { group: $group, code: $code, valueDelta: $valueDelta, valueAfter: $valueAfter, xpAfter: $xpAfter };
}

// ── StatAllocation ──

/** StatAllocation 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeStatAllocation(p: StatAllocation): number {
  checkEnum(STAT_CODE_CODE, p.code, "StatAllocation.code");
  checkInt(p.points, -2147483648, 2147483647, "StatAllocation.points");
  return 5;
}

/** StatAllocation를 out[off..]에 쓰고 끝 오프셋 — sizeStatAllocation로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeStatAllocation(p: StatAllocation, out: Buffer, off: number): number {
  let o = off;
  o = out.writeUInt8(STAT_CODE_CODE[p.code], o);
  o = out.writeInt32LE(p.points, o);
  return o;
}

/** StatAllocation 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readStatAllocation(r: BodyReader): StatAllocation | null {
  const $code = readStatCode(r);
  const $points = r.i32();
  if (r.err !== 0) return null;
  return { code: $code, points: $points };
}

// ── SkillInfo ──

/** SkillInfo 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeSkillInfo(p: SkillInfo): number {
  let n = 46;
  checkInt(p.skillId, -2147483648, 2147483647, "SkillInfo.skillId");
  n += strSize(p.name, 64, "SkillInfo.name");
  checkEnum(SKILL_CATEGORY_CODE, p.category, "SkillInfo.category");
  checkEnum(SKILL_DEF_EFFECT_KIND_CODE, p.effectKind, "SkillInfo.effectKind");
  checkInt(p.mpCost, -2147483648, 2147483647, "SkillInfo.mpCost");
  checkInt(p.cooldownMs, -2147483648, 2147483647, "SkillInfo.cooldownMs");
  checkF32(p.range, "SkillInfo.range");
  checkInt(p.slvReq, -2147483648, 2147483647, "SkillInfo.slvReq");
  checkInt(p.slpCost, -2147483648, 2147483647, "SkillInfo.slpCost");
  checkInt(p.maxLevel, -2147483648, 2147483647, "SkillInfo.maxLevel");
  checkEnum(SKILL_TARGETING_CODE, p.targeting, "SkillInfo.targeting");
  checkF32(p.aoeRadius, "SkillInfo.aoeRadius");
  checkInt(p.level, -2147483648, 2147483647, "SkillInfo.level");
  checkBool(p.learned, "SkillInfo.learned");
  checkInt(p.allowedRaces, 0, 255, "SkillInfo.allowedRaces");
  checkBool(p.bookOnly, "SkillInfo.bookOnly");
  checkF32(p.bowRange, "SkillInfo.bowRange");
  return n;
}

/** SkillInfo를 out[off..]에 쓰고 끝 오프셋 — sizeSkillInfo로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeSkillInfo(p: SkillInfo, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.skillId, o);
  o = writeStr(out, o, p.name);
  o = out.writeUInt8(SKILL_CATEGORY_CODE[p.category], o);
  o = out.writeUInt8(SKILL_DEF_EFFECT_KIND_CODE[p.effectKind], o);
  o = out.writeInt32LE(p.mpCost, o);
  o = out.writeInt32LE(p.cooldownMs, o);
  o = out.writeFloatLE(p.range, o);
  o = out.writeInt32LE(p.slvReq, o);
  o = out.writeInt32LE(p.slpCost, o);
  o = out.writeInt32LE(p.maxLevel, o);
  o = out.writeUInt8(SKILL_TARGETING_CODE[p.targeting], o);
  o = out.writeFloatLE(p.aoeRadius, o);
  o = out.writeInt32LE(p.level, o);
  o = out.writeUInt8(p.learned ? 1 : 0, o);
  o = out.writeUInt8(p.allowedRaces, o);
  o = out.writeUInt8(p.bookOnly ? 1 : 0, o);
  o = out.writeFloatLE(p.bowRange, o);
  return o;
}

/** SkillInfo 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readSkillInfo(r: BodyReader): SkillInfo | null {
  const $skillId = r.i32();
  const $name = r.str(64);
  const $category = readSkillCategory(r);
  const $effectKind = readSkillDefEffectKind(r);
  const $mpCost = r.i32();
  const $cooldownMs = r.i32();
  const $range = r.f32();
  const $slvReq = r.i32();
  const $slpCost = r.i32();
  const $maxLevel = r.i32();
  const $targeting = readSkillTargeting(r);
  const $aoeRadius = r.f32();
  const $level = r.i32();
  const $learned = r.bool();
  const $allowedRaces = r.u8();
  const $bookOnly = r.bool();
  const $bowRange = r.f32();
  if (r.err !== 0) return null;
  return { skillId: $skillId, name: $name, category: $category, effectKind: $effectKind, mpCost: $mpCost, cooldownMs: $cooldownMs, range: $range, slvReq: $slvReq, slpCost: $slpCost, maxLevel: $maxLevel, targeting: $targeting, aoeRadius: $aoeRadius, level: $level, learned: $learned, allowedRaces: $allowedRaces, bookOnly: $bookOnly, bowRange: $bowRange };
}

// ── InventoryEntry ──

/** InventoryEntry 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeInventoryEntry(p: InventoryEntry): number {
  checkInt(p.slot, -2147483648, 2147483647, "InventoryEntry.slot");
  checkInt(p.itemId, -2147483648, 2147483647, "InventoryEntry.itemId");
  checkInt(p.qty, -2147483648, 2147483647, "InventoryEntry.qty");
  return 12;
}

/** InventoryEntry를 out[off..]에 쓰고 끝 오프셋 — sizeInventoryEntry로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeInventoryEntry(p: InventoryEntry, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.slot, o);
  o = out.writeInt32LE(p.itemId, o);
  o = out.writeInt32LE(p.qty, o);
  return o;
}

/** InventoryEntry 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readInventoryEntry(r: BodyReader): InventoryEntry | null {
  const $slot = r.i32();
  const $itemId = r.i32();
  const $qty = r.i32();
  if (r.err !== 0) return null;
  return { slot: $slot, itemId: $itemId, qty: $qty };
}

// ── EquipmentSlots ──

/** EquipmentSlots 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeEquipmentSlots(p: EquipmentSlots): number {
  checkInt(p.weapon, -2147483648, 2147483647, "EquipmentSlots.weapon");
  checkInt(p.shield, -2147483648, 2147483647, "EquipmentSlots.shield");
  checkInt(p.helmet, -2147483648, 2147483647, "EquipmentSlots.helmet");
  checkInt(p.armor, -2147483648, 2147483647, "EquipmentSlots.armor");
  checkInt(p.gloves, -2147483648, 2147483647, "EquipmentSlots.gloves");
  checkInt(p.boots, -2147483648, 2147483647, "EquipmentSlots.boots");
  checkInt(p.accessory1, -2147483648, 2147483647, "EquipmentSlots.accessory1");
  checkInt(p.accessory2, -2147483648, 2147483647, "EquipmentSlots.accessory2");
  return 32;
}

/** EquipmentSlots를 out[off..]에 쓰고 끝 오프셋 — sizeEquipmentSlots로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeEquipmentSlots(p: EquipmentSlots, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.weapon, o);
  o = out.writeInt32LE(p.shield, o);
  o = out.writeInt32LE(p.helmet, o);
  o = out.writeInt32LE(p.armor, o);
  o = out.writeInt32LE(p.gloves, o);
  o = out.writeInt32LE(p.boots, o);
  o = out.writeInt32LE(p.accessory1, o);
  o = out.writeInt32LE(p.accessory2, o);
  return o;
}

/** EquipmentSlots 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readEquipmentSlots(r: BodyReader): EquipmentSlots | null {
  const $weapon = r.i32();
  const $shield = r.i32();
  const $helmet = r.i32();
  const $armor = r.i32();
  const $gloves = r.i32();
  const $boots = r.i32();
  const $accessory1 = r.i32();
  const $accessory2 = r.i32();
  if (r.err !== 0) return null;
  return { weapon: $weapon, shield: $shield, helmet: $helmet, armor: $armor, gloves: $gloves, boots: $boots, accessory1: $accessory1, accessory2: $accessory2 };
}

// ── DialogNode ──

/** DialogNode 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeDialogNode(p: DialogNode): number {
  let n = 4;
  n += strSize(p.id, 64, "DialogNode.id");
  n += strSize(p.speaker, 66, "DialogNode.speaker");
  checkCount(p.pages, 0, 4, "DialogNode.pages");
  for (let i = 0; i < p.pages.length; i++) n += strSize(p.pages[i]!, 600, "DialogNode.pages");
  checkCount(p.options, 0, 8, "DialogNode.options");
  for (let i = 0; i < p.options.length; i++) n += sizeDialogOption(checkStruct(p.options[i]!, "DialogNode.options"));
  return n;
}

/** DialogNode를 out[off..]에 쓰고 끝 오프셋 — sizeDialogNode로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeDialogNode(p: DialogNode, out: Buffer, off: number): number {
  let o = off;
  o = writeStr(out, o, p.id);
  o = writeStr(out, o, p.speaker);
  o = out.writeUInt16LE(p.pages.length, o);
  for (let i = 0; i < p.pages.length; i++) o = writeStr(out, o, p.pages[i]!);
  o = out.writeUInt16LE(p.options.length, o);
  for (let i = 0; i < p.options.length; i++) o = writeDialogOption(p.options[i]!, out, o);
  return o;
}

/** DialogNode 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readDialogNode(r: BodyReader): DialogNode | null {
  const $id = r.str(64);
  const $speaker = r.str(66);
  const $pages: string[] = [];
  const $pages$n = r.count(0, 4);
  for (let i = 0; i < $pages$n; i++) {
    $pages.push(r.str(600));
    if (r.err !== 0) return null;
  }
  const $options: DialogOption[] = [];
  const $options$n = r.count(0, 8);
  for (let i = 0; i < $options$n; i++) {
    const e = readDialogOption(r);
    if (e === null) return null;
    $options.push(e);
  }
  if (r.err !== 0) return null;
  return { id: $id, speaker: $speaker, pages: $pages, options: $options };
}

// ── DialogOption ──

/** DialogOption 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeDialogOption(p: DialogOption): number {
  let n = 1;
  n += strSize(p.label, 240, "DialogOption.label");
  if (p.next !== undefined) {
    n += strSize(p.next, 64, "DialogOption.next");
  }
  if (p.action !== undefined) {
    n += sizeDialogAction(checkStruct(p.action, "DialogOption.action"));
  }
  return n;
}

/** DialogOption를 out[off..]에 쓰고 끝 오프셋 — sizeDialogOption로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeDialogOption(p: DialogOption, out: Buffer, off: number): number {
  let o = off;
  let pm = 0;
  if (p.next !== undefined) pm |= 1 << 0;
  if (p.action !== undefined) pm |= 1 << 1;
  o = out.writeUInt8((pm >>> 0) & 0xff, o);
  o = writeStr(out, o, p.label);
  if (p.next !== undefined) {
    o = writeStr(out, o, p.next);
  }
  if (p.action !== undefined) {
    o = writeDialogAction(p.action, out, o);
  }
  return o;
}

/** DialogOption 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readDialogOption(r: BodyReader): DialogOption | null {
  const pm = r.presence(1, 2);
  const $label = r.str(240);
  let $next: string | undefined;
  if ((pm & (1 << 0)) !== 0) {
    $next = r.str(64);
  }
  let $action: DialogAction | undefined;
  if ((pm & (1 << 1)) !== 0) {
    const s = readDialogAction(r);
    if (s === null) return null;
    $action = s;
  }
  if (r.err !== 0) return null;
  const v: DialogOption = { label: $label };
  if ($next !== undefined) v.next = $next;
  if ($action !== undefined) v.action = $action;
  return v;
}

// ── DialogAction ──

/** DialogAction 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeDialogAction(p: DialogAction): number {
  let n = 1;
  n += strSize(p.type, 32, "DialogAction.type");
  if (p.questId !== undefined) {
    checkInt(p.questId, -2147483648, 2147483647, "DialogAction.questId");
    n += 4;
  }
  if (p.shopId !== undefined) {
    checkInt(p.shopId, -2147483648, 2147483647, "DialogAction.shopId");
    n += 4;
  }
  return n;
}

/** DialogAction를 out[off..]에 쓰고 끝 오프셋 — sizeDialogAction로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeDialogAction(p: DialogAction, out: Buffer, off: number): number {
  let o = off;
  let pm = 0;
  if (p.questId !== undefined) pm |= 1 << 0;
  if (p.shopId !== undefined) pm |= 1 << 1;
  o = out.writeUInt8((pm >>> 0) & 0xff, o);
  o = writeStr(out, o, p.type);
  if (p.questId !== undefined) {
    o = out.writeInt32LE(p.questId, o);
  }
  if (p.shopId !== undefined) {
    o = out.writeInt32LE(p.shopId, o);
  }
  return o;
}

/** DialogAction 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readDialogAction(r: BodyReader): DialogAction | null {
  const pm = r.presence(1, 2);
  const $type = r.str(32);
  let $questId: number | undefined;
  if ((pm & (1 << 0)) !== 0) {
    $questId = r.i32();
  }
  let $shopId: number | undefined;
  if ((pm & (1 << 1)) !== 0) {
    $shopId = r.i32();
  }
  if (r.err !== 0) return null;
  const v: DialogAction = { type: $type };
  if ($questId !== undefined) v.questId = $questId;
  if ($shopId !== undefined) v.shopId = $shopId;
  return v;
}

// ── QuestLogEntry ──

/** QuestLogEntry 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeQuestLogEntry(p: QuestLogEntry): number {
  let n = 17;
  checkInt(p.questId, -2147483648, 2147483647, "QuestLogEntry.questId");
  checkEnum(QUEST_TYPE_CODE, p.type, "QuestLogEntry.type");
  n += strSize(p.name, 120, "QuestLogEntry.name");
  n += strSize(p.description, 1500, "QuestLogEntry.description");
  checkInt(p.giverNpcId, -2147483648, 2147483647, "QuestLogEntry.giverNpcId");
  checkInt(p.turnInNpcId, -2147483648, 2147483647, "QuestLogEntry.turnInNpcId");
  checkBool(p.abandonable, "QuestLogEntry.abandonable");
  checkBool(p.completable, "QuestLogEntry.completable");
  checkCount(p.objectives, 0, 8, "QuestLogEntry.objectives");
  for (let i = 0; i < p.objectives.length; i++) n += sizeQuestLogObjective(checkStruct(p.objectives[i]!, "QuestLogEntry.objectives"));
  n += sizeQuestRewardPreview(checkStruct(p.rewardPreview, "QuestLogEntry.rewardPreview"));
  return n;
}

/** QuestLogEntry를 out[off..]에 쓰고 끝 오프셋 — sizeQuestLogEntry로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeQuestLogEntry(p: QuestLogEntry, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.questId, o);
  o = out.writeUInt8(QUEST_TYPE_CODE[p.type], o);
  o = writeStr(out, o, p.name);
  o = writeStr(out, o, p.description);
  o = out.writeInt32LE(p.giverNpcId, o);
  o = out.writeInt32LE(p.turnInNpcId, o);
  o = out.writeUInt8(p.abandonable ? 1 : 0, o);
  o = out.writeUInt8(p.completable ? 1 : 0, o);
  o = out.writeUInt16LE(p.objectives.length, o);
  for (let i = 0; i < p.objectives.length; i++) o = writeQuestLogObjective(p.objectives[i]!, out, o);
  o = writeQuestRewardPreview(p.rewardPreview, out, o);
  return o;
}

/** QuestLogEntry 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readQuestLogEntry(r: BodyReader): QuestLogEntry | null {
  const $questId = r.i32();
  const $type = readQuestType(r);
  const $name = r.str(120);
  const $description = r.str(1500);
  const $giverNpcId = r.i32();
  const $turnInNpcId = r.i32();
  const $abandonable = r.bool();
  const $completable = r.bool();
  const $objectives: QuestLogObjective[] = [];
  const $objectives$n = r.count(0, 8);
  for (let i = 0; i < $objectives$n; i++) {
    const e = readQuestLogObjective(r);
    if (e === null) return null;
    $objectives.push(e);
  }
  const $rewardPreview = readQuestRewardPreview(r);
  if ($rewardPreview === null) return null;
  if (r.err !== 0) return null;
  return { questId: $questId, type: $type, name: $name, description: $description, giverNpcId: $giverNpcId, turnInNpcId: $turnInNpcId, abandonable: $abandonable, completable: $completable, objectives: $objectives, rewardPreview: $rewardPreview };
}

// ── QuestLogObjective ──

/** QuestLogObjective 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeQuestLogObjective(p: QuestLogObjective): number {
  let n = 13;
  checkEnum(QUEST_OBJECTIVE_KIND_CODE, p.kind, "QuestLogObjective.kind");
  n += strSize(p.text, 96, "QuestLogObjective.text");
  checkInt(p.targetId, -2147483648, 2147483647, "QuestLogObjective.targetId");
  checkInt(p.current, -2147483648, 2147483647, "QuestLogObjective.current");
  checkInt(p.required, -2147483648, 2147483647, "QuestLogObjective.required");
  return n;
}

/** QuestLogObjective를 out[off..]에 쓰고 끝 오프셋 — sizeQuestLogObjective로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeQuestLogObjective(p: QuestLogObjective, out: Buffer, off: number): number {
  let o = off;
  o = out.writeUInt8(QUEST_OBJECTIVE_KIND_CODE[p.kind], o);
  o = writeStr(out, o, p.text);
  o = out.writeInt32LE(p.targetId, o);
  o = out.writeInt32LE(p.current, o);
  o = out.writeInt32LE(p.required, o);
  return o;
}

/** QuestLogObjective 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readQuestLogObjective(r: BodyReader): QuestLogObjective | null {
  const $kind = readQuestObjectiveKind(r);
  const $text = r.str(96);
  const $targetId = r.i32();
  const $current = r.i32();
  const $required = r.i32();
  if (r.err !== 0) return null;
  return { kind: $kind, text: $text, targetId: $targetId, current: $current, required: $required };
}

// ── QuestRewardPreview ──

/** QuestRewardPreview 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeQuestRewardPreview(p: QuestRewardPreview): number {
  let n = 24;
  checkInt(p.exp, -2147483648, 2147483647, "QuestRewardPreview.exp");
  checkInt(p.sexp, -2147483648, 2147483647, "QuestRewardPreview.sexp");
  checkInt(p.slp, -2147483648, 2147483647, "QuestRewardPreview.slp");
  checkInt(p.gold, -2147483648, 2147483647, "QuestRewardPreview.gold");
  checkCount(p.fixed, 0, 8, "QuestRewardPreview.fixed");
  for (let i = 0; i < p.fixed.length; i++) n += sizeRewardPreviewItem(checkStruct(p.fixed[i]!, "QuestRewardPreview.fixed"));
  checkCount(p.choice, 0, 8, "QuestRewardPreview.choice");
  for (let i = 0; i < p.choice.length; i++) n += sizeRewardPreviewItem(checkStruct(p.choice[i]!, "QuestRewardPreview.choice"));
  checkCount(p.random, 0, 8, "QuestRewardPreview.random");
  for (let i = 0; i < p.random.length; i++) n += sizeRewardPreviewItem(checkStruct(p.random[i]!, "QuestRewardPreview.random"));
  checkCount(p.bonus, 0, 8, "QuestRewardPreview.bonus");
  for (let i = 0; i < p.bonus.length; i++) n += sizeRewardPreviewItem(checkStruct(p.bonus[i]!, "QuestRewardPreview.bonus"));
  return n;
}

/** QuestRewardPreview를 out[off..]에 쓰고 끝 오프셋 — sizeQuestRewardPreview로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeQuestRewardPreview(p: QuestRewardPreview, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.exp, o);
  o = out.writeInt32LE(p.sexp, o);
  o = out.writeInt32LE(p.slp, o);
  o = out.writeInt32LE(p.gold, o);
  o = out.writeUInt16LE(p.fixed.length, o);
  for (let i = 0; i < p.fixed.length; i++) o = writeRewardPreviewItem(p.fixed[i]!, out, o);
  o = out.writeUInt16LE(p.choice.length, o);
  for (let i = 0; i < p.choice.length; i++) o = writeRewardPreviewItem(p.choice[i]!, out, o);
  o = out.writeUInt16LE(p.random.length, o);
  for (let i = 0; i < p.random.length; i++) o = writeRewardPreviewItem(p.random[i]!, out, o);
  o = out.writeUInt16LE(p.bonus.length, o);
  for (let i = 0; i < p.bonus.length; i++) o = writeRewardPreviewItem(p.bonus[i]!, out, o);
  return o;
}

/** QuestRewardPreview 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readQuestRewardPreview(r: BodyReader): QuestRewardPreview | null {
  const $exp = r.i32();
  const $sexp = r.i32();
  const $slp = r.i32();
  const $gold = r.i32();
  const $fixed: RewardPreviewItem[] = [];
  const $fixed$n = r.count(0, 8);
  if (!r.need($fixed$n * 8)) return null;
  for (let i = 0; i < $fixed$n; i++) {
    const e = readRewardPreviewItem(r);
    if (e === null) return null;
    $fixed.push(e);
  }
  const $choice: RewardPreviewItem[] = [];
  const $choice$n = r.count(0, 8);
  if (!r.need($choice$n * 8)) return null;
  for (let i = 0; i < $choice$n; i++) {
    const e = readRewardPreviewItem(r);
    if (e === null) return null;
    $choice.push(e);
  }
  const $random: RewardPreviewItem[] = [];
  const $random$n = r.count(0, 8);
  if (!r.need($random$n * 8)) return null;
  for (let i = 0; i < $random$n; i++) {
    const e = readRewardPreviewItem(r);
    if (e === null) return null;
    $random.push(e);
  }
  const $bonus: RewardPreviewItem[] = [];
  const $bonus$n = r.count(0, 8);
  if (!r.need($bonus$n * 8)) return null;
  for (let i = 0; i < $bonus$n; i++) {
    const e = readRewardPreviewItem(r);
    if (e === null) return null;
    $bonus.push(e);
  }
  if (r.err !== 0) return null;
  return { exp: $exp, sexp: $sexp, slp: $slp, gold: $gold, fixed: $fixed, choice: $choice, random: $random, bonus: $bonus };
}

// ── RewardPreviewItem ──

/** RewardPreviewItem 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeRewardPreviewItem(p: RewardPreviewItem): number {
  checkInt(p.itemId, -2147483648, 2147483647, "RewardPreviewItem.itemId");
  checkInt(p.qty, -2147483648, 2147483647, "RewardPreviewItem.qty");
  return 8;
}

/** RewardPreviewItem를 out[off..]에 쓰고 끝 오프셋 — sizeRewardPreviewItem로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeRewardPreviewItem(p: RewardPreviewItem, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.itemId, o);
  o = out.writeInt32LE(p.qty, o);
  return o;
}

/** RewardPreviewItem 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readRewardPreviewItem(r: BodyReader): RewardPreviewItem | null {
  const $itemId = r.i32();
  const $qty = r.i32();
  if (r.err !== 0) return null;
  return { itemId: $itemId, qty: $qty };
}

// ── QuestGrantSummary ──

/** QuestGrantSummary 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeQuestGrantSummary(p: QuestGrantSummary): number {
  let n = 18;
  checkInt(p.exp, -2147483648, 2147483647, "QuestGrantSummary.exp");
  checkInt(p.sexp, -2147483648, 2147483647, "QuestGrantSummary.sexp");
  checkInt(p.slp, -2147483648, 2147483647, "QuestGrantSummary.slp");
  checkInt(p.gold, -2147483648, 2147483647, "QuestGrantSummary.gold");
  checkCount(p.items, 0, 18, "QuestGrantSummary.items");
  for (let i = 0; i < p.items.length; i++) n += sizeQuestGrantItem(checkStruct(p.items[i]!, "QuestGrantSummary.items"));
  return n;
}

/** QuestGrantSummary를 out[off..]에 쓰고 끝 오프셋 — sizeQuestGrantSummary로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeQuestGrantSummary(p: QuestGrantSummary, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.exp, o);
  o = out.writeInt32LE(p.sexp, o);
  o = out.writeInt32LE(p.slp, o);
  o = out.writeInt32LE(p.gold, o);
  o = out.writeUInt16LE(p.items.length, o);
  for (let i = 0; i < p.items.length; i++) o = writeQuestGrantItem(p.items[i]!, out, o);
  return o;
}

/** QuestGrantSummary 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readQuestGrantSummary(r: BodyReader): QuestGrantSummary | null {
  const $exp = r.i32();
  const $sexp = r.i32();
  const $slp = r.i32();
  const $gold = r.i32();
  const $items: QuestGrantItem[] = [];
  const $items$n = r.count(0, 18);
  if (!r.need($items$n * 9)) return null;
  for (let i = 0; i < $items$n; i++) {
    const e = readQuestGrantItem(r);
    if (e === null) return null;
    $items.push(e);
  }
  if (r.err !== 0) return null;
  return { exp: $exp, sexp: $sexp, slp: $slp, gold: $gold, items: $items };
}

// ── QuestGrantItem ──

/** QuestGrantItem 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeQuestGrantItem(p: QuestGrantItem): number {
  checkInt(p.itemId, -2147483648, 2147483647, "QuestGrantItem.itemId");
  checkInt(p.qty, -2147483648, 2147483647, "QuestGrantItem.qty");
  checkEnum(REWARD_SOURCE_CODE, p.source, "QuestGrantItem.source");
  return 9;
}

/** QuestGrantItem를 out[off..]에 쓰고 끝 오프셋 — sizeQuestGrantItem로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeQuestGrantItem(p: QuestGrantItem, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.itemId, o);
  o = out.writeInt32LE(p.qty, o);
  o = out.writeUInt8(REWARD_SOURCE_CODE[p.source], o);
  return o;
}

/** QuestGrantItem 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readQuestGrantItem(r: BodyReader): QuestGrantItem | null {
  const $itemId = r.i32();
  const $qty = r.i32();
  const $source = readRewardSource(r);
  if (r.err !== 0) return null;
  return { itemId: $itemId, qty: $qty, source: $source };
}

// ── NpcQuestMarker ──

/** NpcQuestMarker 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeNpcQuestMarker(p: NpcQuestMarker): number {
  checkInt(p.npcId, -2147483648, 2147483647, "NpcQuestMarker.npcId");
  checkInt(p.marker, -2147483648, 2147483647, "NpcQuestMarker.marker");
  return 8;
}

/** NpcQuestMarker를 out[off..]에 쓰고 끝 오프셋 — sizeNpcQuestMarker로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeNpcQuestMarker(p: NpcQuestMarker, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.npcId, o);
  o = out.writeInt32LE(p.marker, o);
  return o;
}

/** NpcQuestMarker 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readNpcQuestMarker(r: BodyReader): NpcQuestMarker | null {
  const $npcId = r.i32();
  const $marker = r.i32();
  if (r.err !== 0) return null;
  return { npcId: $npcId, marker: $marker };
}

// ── ShopOffer ──

/** ShopOffer 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeShopOffer(p: ShopOffer): number {
  checkInt(p.itemId, -2147483648, 2147483647, "ShopOffer.itemId");
  checkInt(p.buyPrice, -2147483648, 2147483647, "ShopOffer.buyPrice");
  checkInt(p.sellPrice, -2147483648, 2147483647, "ShopOffer.sellPrice");
  return 12;
}

/** ShopOffer를 out[off..]에 쓰고 끝 오프셋 — sizeShopOffer로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeShopOffer(p: ShopOffer, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.itemId, o);
  o = out.writeInt32LE(p.buyPrice, o);
  o = out.writeInt32LE(p.sellPrice, o);
  return o;
}

/** ShopOffer 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readShopOffer(r: BodyReader): ShopOffer | null {
  const $itemId = r.i32();
  const $buyPrice = r.i32();
  const $sellPrice = r.i32();
  if (r.err !== 0) return null;
  return { itemId: $itemId, buyPrice: $buyPrice, sellPrice: $sellPrice };
}

// ── LifeLineInfo ──

/** LifeLineInfo 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeLifeLineInfo(p: LifeLineInfo): number {
  checkEnum(LIFE_LINE_CODE, p.line, "LifeLineInfo.line");
  checkInt(p.points, -2147483648, 2147483647, "LifeLineInfo.points");
  checkInt(p.rank, 0, 255, "LifeLineInfo.rank");
  checkInt(p.nextRankAt, -2147483648, 2147483647, "LifeLineInfo.nextRankAt");
  return 10;
}

/** LifeLineInfo를 out[off..]에 쓰고 끝 오프셋 — sizeLifeLineInfo로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeLifeLineInfo(p: LifeLineInfo, out: Buffer, off: number): number {
  let o = off;
  o = out.writeUInt8(LIFE_LINE_CODE[p.line], o);
  o = out.writeInt32LE(p.points, o);
  o = out.writeUInt8(p.rank, o);
  o = out.writeInt32LE(p.nextRankAt, o);
  return o;
}

/** LifeLineInfo 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readLifeLineInfo(r: BodyReader): LifeLineInfo | null {
  const $line = readLifeLine(r);
  const $points = r.i32();
  const $rank = r.u8();
  const $nextRankAt = r.i32();
  if (r.err !== 0) return null;
  return { line: $line, points: $points, rank: $rank, nextRankAt: $nextRankAt };
}

// ── NodeDefInfo ──

/** NodeDefInfo 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeNodeDefInfo(p: NodeDefInfo): number {
  checkInt(p.nodeDefId, -2147483648, 2147483647, "NodeDefInfo.nodeDefId");
  checkEnum(LIFE_LINE_CODE, p.line, "NodeDefInfo.line");
  checkInt(p.tier, 0, 255, "NodeDefInfo.tier");
  checkInt(p.minRank, 0, 255, "NodeDefInfo.minRank");
  checkF32(p.interactRadius, "NodeDefInfo.interactRadius");
  return 11;
}

/** NodeDefInfo를 out[off..]에 쓰고 끝 오프셋 — sizeNodeDefInfo로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeNodeDefInfo(p: NodeDefInfo, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.nodeDefId, o);
  o = out.writeUInt8(LIFE_LINE_CODE[p.line], o);
  o = out.writeUInt8(p.tier, o);
  o = out.writeUInt8(p.minRank, o);
  o = out.writeFloatLE(p.interactRadius, o);
  return o;
}

/** NodeDefInfo 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readNodeDefInfo(r: BodyReader): NodeDefInfo | null {
  const $nodeDefId = r.i32();
  const $line = readLifeLine(r);
  const $tier = r.u8();
  const $minRank = r.u8();
  const $interactRadius = r.f32();
  if (r.err !== 0) return null;
  return { nodeDefId: $nodeDefId, line: $line, tier: $tier, minRank: $minRank, interactRadius: $interactRadius };
}

// ── PuzzlePoint ──

/** PuzzlePoint 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizePuzzlePoint(p: PuzzlePoint): number {
  checkInt(p.x, 0, 65535, "PuzzlePoint.x");
  checkInt(p.y, 0, 65535, "PuzzlePoint.y");
  return 4;
}

/** PuzzlePoint를 out[off..]에 쓰고 끝 오프셋 — sizePuzzlePoint로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writePuzzlePoint(p: PuzzlePoint, out: Buffer, off: number): number {
  let o = off;
  o = out.writeUInt16LE(p.x, o);
  o = out.writeUInt16LE(p.y, o);
  return o;
}

/** PuzzlePoint 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readPuzzlePoint(r: BodyReader): PuzzlePoint | null {
  const $x = r.u16();
  const $y = r.u16();
  if (r.err !== 0) return null;
  return { x: $x, y: $y };
}

// ── PuzzleTap ──

/** PuzzleTap 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizePuzzleTap(p: PuzzleTap): number {
  checkInt(p.cycle, 0, 255, "PuzzleTap.cycle");
  checkInt(p.ms, 0, 65535, "PuzzleTap.ms");
  checkInt(p.x, 0, 65535, "PuzzleTap.x");
  checkInt(p.y, 0, 65535, "PuzzleTap.y");
  return 7;
}

/** PuzzleTap를 out[off..]에 쓰고 끝 오프셋 — sizePuzzleTap로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writePuzzleTap(p: PuzzleTap, out: Buffer, off: number): number {
  let o = off;
  o = out.writeUInt8(p.cycle, o);
  o = out.writeUInt16LE(p.ms, o);
  o = out.writeUInt16LE(p.x, o);
  o = out.writeUInt16LE(p.y, o);
  return o;
}

/** PuzzleTap 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readPuzzleTap(r: BodyReader): PuzzleTap | null {
  const $cycle = r.u8();
  const $ms = r.u16();
  const $x = r.u16();
  const $y = r.u16();
  if (r.err !== 0) return null;
  return { cycle: $cycle, ms: $ms, x: $x, y: $y };
}

// ── RecipeInfo ──

/** RecipeInfo 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeRecipeInfo(p: RecipeInfo): number {
  let n = 29;
  checkInt(p.recipeId, -2147483648, 2147483647, "RecipeInfo.recipeId");
  checkEnum(LIFE_LINE_CODE, p.line, "RecipeInfo.line");
  checkInt(p.tier, 0, 255, "RecipeInfo.tier");
  checkInt(p.minRank, 0, 255, "RecipeInfo.minRank");
  checkInt(p.laborCost, -2147483648, 2147483647, "RecipeInfo.laborCost");
  checkInt(p.goldFee, -2147483648, 2147483647, "RecipeInfo.goldFee");
  checkInt(p.outputItemId, -2147483648, 2147483647, "RecipeInfo.outputItemId");
  checkInt(p.outputQty, -2147483648, 2147483647, "RecipeInfo.outputQty");
  checkInt(p.greatBonusQty, -2147483648, 2147483647, "RecipeInfo.greatBonusQty");
  checkCount(p.inputs, 0, 6, "RecipeInfo.inputs");
  for (let i = 0; i < p.inputs.length; i++) n += sizeRewardPreviewItem(checkStruct(p.inputs[i]!, "RecipeInfo.inputs"));
  return n;
}

/** RecipeInfo를 out[off..]에 쓰고 끝 오프셋 — sizeRecipeInfo로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeRecipeInfo(p: RecipeInfo, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.recipeId, o);
  o = out.writeUInt8(LIFE_LINE_CODE[p.line], o);
  o = out.writeUInt8(p.tier, o);
  o = out.writeUInt8(p.minRank, o);
  o = out.writeInt32LE(p.laborCost, o);
  o = out.writeInt32LE(p.goldFee, o);
  o = out.writeInt32LE(p.outputItemId, o);
  o = out.writeInt32LE(p.outputQty, o);
  o = out.writeInt32LE(p.greatBonusQty, o);
  o = out.writeUInt16LE(p.inputs.length, o);
  for (let i = 0; i < p.inputs.length; i++) o = writeRewardPreviewItem(p.inputs[i]!, out, o);
  return o;
}

/** RecipeInfo 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readRecipeInfo(r: BodyReader): RecipeInfo | null {
  const $recipeId = r.i32();
  const $line = readLifeLine(r);
  const $tier = r.u8();
  const $minRank = r.u8();
  const $laborCost = r.i32();
  const $goldFee = r.i32();
  const $outputItemId = r.i32();
  const $outputQty = r.i32();
  const $greatBonusQty = r.i32();
  const $inputs: RewardPreviewItem[] = [];
  const $inputs$n = r.count(0, 6);
  if (!r.need($inputs$n * 8)) return null;
  for (let i = 0; i < $inputs$n; i++) {
    const e = readRewardPreviewItem(r);
    if (e === null) return null;
    $inputs.push(e);
  }
  if (r.err !== 0) return null;
  return { recipeId: $recipeId, line: $line, tier: $tier, minRank: $minRank, laborCost: $laborCost, goldFee: $goldFee, outputItemId: $outputItemId, outputQty: $outputQty, greatBonusQty: $greatBonusQty, inputs: $inputs };
}

// ── HELLO ──

/** HELLO 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeHello(p: HelloPayload): number {
  checkInt(p.clientProtoVer, -2147483648, 2147483647, "HELLO.clientProtoVer");
  checkInt(p.clientBuildHash, 0, 4294967295, "HELLO.clientBuildHash");
  return 8;
}

/** HELLO를 out[off..]에 쓰고 끝 오프셋 — sizeHello로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeHello(p: HelloPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.clientProtoVer, o);
  o = out.writeUInt32LE(p.clientBuildHash, o);
  return o;
}

/** HELLO 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readHello(r: BodyReader): HelloPayload | null {
  const $clientProtoVer = r.i32();
  const $clientBuildHash = r.u32();
  if (r.err !== 0) return null;
  return { clientProtoVer: $clientProtoVer, clientBuildHash: $clientBuildHash };
}

/** HELLO 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeHello(body: Uint8Array): HelloPayload | null {
  const r = bodyReader.reset(body);
  const p = readHello(r);
  return r.done() ? p : null;
}

// ── HELLO_ACK ──

/** HELLO_ACK 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeHelloAck(p: HelloAckPayload): number {
  let n = 12;
  checkInt(p.serverProtoVer, -2147483648, 2147483647, "HELLO_ACK.serverProtoVer");
  checkF64(p.serverTimeMs, "HELLO_ACK.serverTimeMs");
  n += strSize(p.sessionNonce, 64, "HELLO_ACK.sessionNonce");
  return n;
}

/** HELLO_ACK를 out[off..]에 쓰고 끝 오프셋 — sizeHelloAck로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeHelloAck(p: HelloAckPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.serverProtoVer, o);
  o = out.writeDoubleLE(p.serverTimeMs, o);
  o = writeStr(out, o, p.sessionNonce);
  return o;
}

/** HELLO_ACK 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readHelloAck(r: BodyReader): HelloAckPayload | null {
  const $serverProtoVer = r.i32();
  const $serverTimeMs = r.f64();
  const $sessionNonce = r.str(64);
  if (r.err !== 0) return null;
  return { serverProtoVer: $serverProtoVer, serverTimeMs: $serverTimeMs, sessionNonce: $sessionNonce };
}

/** HELLO_ACK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeHelloAck(body: Uint8Array): HelloAckPayload | null {
  const r = bodyReader.reset(body);
  const p = readHelloAck(r);
  return r.done() ? p : null;
}

// ── AUTH_REQ ──

/** AUTH_REQ 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeAuthReq(p: AuthReqPayload): number {
  let n = 4;
  checkInt(p.mode, -2147483648, 2147483647, "AUTH_REQ.mode");
  n += strSize(p.username, 64, "AUTH_REQ.username");
  n += strSize(p.secret, 256, "AUTH_REQ.secret");
  return n;
}

/** AUTH_REQ를 out[off..]에 쓰고 끝 오프셋 — sizeAuthReq로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeAuthReq(p: AuthReqPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.mode, o);
  o = writeStr(out, o, p.username);
  o = writeStr(out, o, p.secret);
  return o;
}

/** AUTH_REQ 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readAuthReq(r: BodyReader): AuthReqPayload | null {
  const $mode = r.i32();
  const $username = r.str(64);
  const $secret = r.str(256);
  if (r.err !== 0) return null;
  return { mode: $mode, username: $username, secret: $secret };
}

/** AUTH_REQ 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeAuthReq(body: Uint8Array): AuthReqPayload | null {
  const r = bodyReader.reset(body);
  const p = readAuthReq(r);
  return r.done() ? p : null;
}

// ── AUTH_RESULT ──

/** AUTH_RESULT 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeAuthResult(p: AuthResultPayload): number {
  let n = 9;
  checkBool(p.ok, "AUTH_RESULT.ok");
  checkInt(p.accountId, -2147483648, 2147483647, "AUTH_RESULT.accountId");
  n += strSize(p.sessionToken, 64, "AUTH_RESULT.sessionToken");
  checkInt(p.errCode, -2147483648, 2147483647, "AUTH_RESULT.errCode");
  return n;
}

/** AUTH_RESULT를 out[off..]에 쓰고 끝 오프셋 — sizeAuthResult로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeAuthResult(p: AuthResultPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeUInt8(p.ok ? 1 : 0, o);
  o = out.writeInt32LE(p.accountId, o);
  o = writeStr(out, o, p.sessionToken);
  o = out.writeInt32LE(p.errCode, o);
  return o;
}

/** AUTH_RESULT 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readAuthResult(r: BodyReader): AuthResultPayload | null {
  const $ok = r.bool();
  const $accountId = r.i32();
  const $sessionToken = r.str(64);
  const $errCode = r.i32();
  if (r.err !== 0) return null;
  return { ok: $ok, accountId: $accountId, sessionToken: $sessionToken, errCode: $errCode };
}

/** AUTH_RESULT 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeAuthResult(body: Uint8Array): AuthResultPayload | null {
  const r = bodyReader.reset(body);
  const p = readAuthResult(r);
  return r.done() ? p : null;
}

// ── CHAR_LIST_REQ ──

/** CHAR_LIST_REQ 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeCharListReq(_p: CharListReqPayload): number {
  return 0;
}

/** CHAR_LIST_REQ를 out[off..]에 쓰고 끝 오프셋 — sizeCharListReq로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeCharListReq(_p: CharListReqPayload, _out: Buffer, off: number): number {
  return off;
}

/** CHAR_LIST_REQ 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readCharListReq(r: BodyReader): CharListReqPayload | null {
  if (r.err !== 0) return null;
  return {};
}

/** CHAR_LIST_REQ 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeCharListReq(body: Uint8Array): CharListReqPayload | null {
  const r = bodyReader.reset(body);
  const p = readCharListReq(r);
  return r.done() ? p : null;
}

// ── CHAR_LIST ──

/** CHAR_LIST 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeCharList(p: CharListPayload): number {
  let n = 2;
  checkCount(p.chars, 0, 16, "CHAR_LIST.chars");
  for (let i = 0; i < p.chars.length; i++) n += sizeCharSummary(checkStruct(p.chars[i]!, "CHAR_LIST.chars"));
  return n;
}

/** CHAR_LIST를 out[off..]에 쓰고 끝 오프셋 — sizeCharList로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeCharList(p: CharListPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeUInt16LE(p.chars.length, o);
  for (let i = 0; i < p.chars.length; i++) o = writeCharSummary(p.chars[i]!, out, o);
  return o;
}

/** CHAR_LIST 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readCharList(r: BodyReader): CharListPayload | null {
  const $chars: CharSummary[] = [];
  const $chars$n = r.count(0, 16);
  for (let i = 0; i < $chars$n; i++) {
    const e = readCharSummary(r);
    if (e === null) return null;
    $chars.push(e);
  }
  if (r.err !== 0) return null;
  return { chars: $chars };
}

/** CHAR_LIST 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeCharList(body: Uint8Array): CharListPayload | null {
  const r = bodyReader.reset(body);
  const p = readCharList(r);
  return r.done() ? p : null;
}

// ── ENTER_WORLD_REQ ──

/** ENTER_WORLD_REQ 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeEnterWorldReq(p: EnterWorldReqPayload): number {
  checkInt(p.charId, -2147483648, 2147483647, "ENTER_WORLD_REQ.charId");
  return 4;
}

/** ENTER_WORLD_REQ를 out[off..]에 쓰고 끝 오프셋 — sizeEnterWorldReq로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeEnterWorldReq(p: EnterWorldReqPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.charId, o);
  return o;
}

/** ENTER_WORLD_REQ 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readEnterWorldReq(r: BodyReader): EnterWorldReqPayload | null {
  const $charId = r.i32();
  if (r.err !== 0) return null;
  return { charId: $charId };
}

/** ENTER_WORLD_REQ 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeEnterWorldReq(body: Uint8Array): EnterWorldReqPayload | null {
  const r = bodyReader.reset(body);
  const p = readEnterWorldReq(r);
  return r.done() ? p : null;
}

// ── ENTER_WORLD_OK ──

/** ENTER_WORLD_OK 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeEnterWorldOk(p: EnterWorldOkPayload): number {
  checkInt(p.charId, -2147483648, 2147483647, "ENTER_WORLD_OK.charId");
  checkInt(p.zoneId, -2147483648, 2147483647, "ENTER_WORLD_OK.zoneId");
  checkInt(p.tickIndex, -2147483648, 2147483647, "ENTER_WORLD_OK.tickIndex");
  checkF32(p.spawnX, "ENTER_WORLD_OK.spawnX");
  checkF32(p.spawnY, "ENTER_WORLD_OK.spawnY");
  return 20;
}

/** ENTER_WORLD_OK를 out[off..]에 쓰고 끝 오프셋 — sizeEnterWorldOk로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeEnterWorldOk(p: EnterWorldOkPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.charId, o);
  o = out.writeInt32LE(p.zoneId, o);
  o = out.writeInt32LE(p.tickIndex, o);
  o = out.writeFloatLE(p.spawnX, o);
  o = out.writeFloatLE(p.spawnY, o);
  return o;
}

/** ENTER_WORLD_OK 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readEnterWorldOk(r: BodyReader): EnterWorldOkPayload | null {
  const $charId = r.i32();
  const $zoneId = r.i32();
  const $tickIndex = r.i32();
  const $spawnX = r.f32();
  const $spawnY = r.f32();
  if (r.err !== 0) return null;
  return { charId: $charId, zoneId: $zoneId, tickIndex: $tickIndex, spawnX: $spawnX, spawnY: $spawnY };
}

/** ENTER_WORLD_OK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeEnterWorldOk(body: Uint8Array): EnterWorldOkPayload | null {
  const r = bodyReader.reset(body);
  const p = readEnterWorldOk(r);
  return r.done() ? p : null;
}

// ── ZONE_INFO ──

/** ZONE_INFO 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeZoneInfo(p: ZoneInfoPayload): number {
  let n = 24;
  checkInt(p.zoneId, -2147483648, 2147483647, "ZONE_INFO.zoneId");
  n += strSize(p.name, 64, "ZONE_INFO.name");
  checkF32(p.width, "ZONE_INFO.width");
  checkF32(p.height, "ZONE_INFO.height");
  checkInt(p.tickRate, -2147483648, 2147483647, "ZONE_INFO.tickRate");
  checkF32(p.spawnX, "ZONE_INFO.spawnX");
  checkF32(p.spawnY, "ZONE_INFO.spawnY");
  return n;
}

/** ZONE_INFO를 out[off..]에 쓰고 끝 오프셋 — sizeZoneInfo로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeZoneInfo(p: ZoneInfoPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.zoneId, o);
  o = writeStr(out, o, p.name);
  o = out.writeFloatLE(p.width, o);
  o = out.writeFloatLE(p.height, o);
  o = out.writeInt32LE(p.tickRate, o);
  o = out.writeFloatLE(p.spawnX, o);
  o = out.writeFloatLE(p.spawnY, o);
  return o;
}

/** ZONE_INFO 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readZoneInfo(r: BodyReader): ZoneInfoPayload | null {
  const $zoneId = r.i32();
  const $name = r.str(64);
  const $width = r.f32();
  const $height = r.f32();
  const $tickRate = r.i32();
  const $spawnX = r.f32();
  const $spawnY = r.f32();
  if (r.err !== 0) return null;
  return { zoneId: $zoneId, name: $name, width: $width, height: $height, tickRate: $tickRate, spawnX: $spawnX, spawnY: $spawnY };
}

/** ZONE_INFO 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeZoneInfo(body: Uint8Array): ZoneInfoPayload | null {
  const r = bodyReader.reset(body);
  const p = readZoneInfo(r);
  return r.done() ? p : null;
}

// ── CHAR_CREATE_REQ ──

/** CHAR_CREATE_REQ 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeCharCreateReq(p: CharCreateReqPayload): number {
  let n = 0;
  n += strSize(p.name, 64, "CHAR_CREATE_REQ.name");
  return n;
}

/** CHAR_CREATE_REQ를 out[off..]에 쓰고 끝 오프셋 — sizeCharCreateReq로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeCharCreateReq(p: CharCreateReqPayload, out: Buffer, off: number): number {
  let o = off;
  o = writeStr(out, o, p.name);
  return o;
}

/** CHAR_CREATE_REQ 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readCharCreateReq(r: BodyReader): CharCreateReqPayload | null {
  const $name = r.str(64);
  if (r.err !== 0) return null;
  return { name: $name };
}

/** CHAR_CREATE_REQ 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeCharCreateReq(body: Uint8Array): CharCreateReqPayload | null {
  const r = bodyReader.reset(body);
  const p = readCharCreateReq(r);
  return r.done() ? p : null;
}

// ── CHAR_CREATE_RESULT ──

/** CHAR_CREATE_RESULT 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeCharCreateResult(p: CharCreateResultPayload): number {
  let n = 9;
  checkBool(p.ok, "CHAR_CREATE_RESULT.ok");
  checkInt(p.charId, -2147483648, 2147483647, "CHAR_CREATE_RESULT.charId");
  n += strSize(p.name, 64, "CHAR_CREATE_RESULT.name");
  checkInt(p.errCode, -2147483648, 2147483647, "CHAR_CREATE_RESULT.errCode");
  return n;
}

/** CHAR_CREATE_RESULT를 out[off..]에 쓰고 끝 오프셋 — sizeCharCreateResult로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeCharCreateResult(p: CharCreateResultPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeUInt8(p.ok ? 1 : 0, o);
  o = out.writeInt32LE(p.charId, o);
  o = writeStr(out, o, p.name);
  o = out.writeInt32LE(p.errCode, o);
  return o;
}

/** CHAR_CREATE_RESULT 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readCharCreateResult(r: BodyReader): CharCreateResultPayload | null {
  const $ok = r.bool();
  const $charId = r.i32();
  const $name = r.str(64);
  const $errCode = r.i32();
  if (r.err !== 0) return null;
  return { ok: $ok, charId: $charId, name: $name, errCode: $errCode };
}

/** CHAR_CREATE_RESULT 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeCharCreateResult(body: Uint8Array): CharCreateResultPayload | null {
  const r = bodyReader.reset(body);
  const p = readCharCreateResult(r);
  return r.done() ? p : null;
}

// ── ZONE_CHANGE_REQ ──

/** ZONE_CHANGE_REQ 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeZoneChangeReq(p: ZoneChangeReqPayload): number {
  checkInt(p.portalId, -2147483648, 2147483647, "ZONE_CHANGE_REQ.portalId");
  return 4;
}

/** ZONE_CHANGE_REQ를 out[off..]에 쓰고 끝 오프셋 — sizeZoneChangeReq로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeZoneChangeReq(p: ZoneChangeReqPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.portalId, o);
  return o;
}

/** ZONE_CHANGE_REQ 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readZoneChangeReq(r: BodyReader): ZoneChangeReqPayload | null {
  const $portalId = r.i32();
  if (r.err !== 0) return null;
  return { portalId: $portalId };
}

/** ZONE_CHANGE_REQ 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeZoneChangeReq(body: Uint8Array): ZoneChangeReqPayload | null {
  const r = bodyReader.reset(body);
  const p = readZoneChangeReq(r);
  return r.done() ? p : null;
}

// ── ZONE_CHANGE ──

/** ZONE_CHANGE 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeZoneChange(p: ZoneChangePayload): number {
  let n = 28;
  checkInt(p.newZoneId, -2147483648, 2147483647, "ZONE_CHANGE.newZoneId");
  n += strSize(p.name, 64, "ZONE_CHANGE.name");
  checkF32(p.width, "ZONE_CHANGE.width");
  checkF32(p.height, "ZONE_CHANGE.height");
  checkInt(p.tickRate, -2147483648, 2147483647, "ZONE_CHANGE.tickRate");
  checkF32(p.spawnX, "ZONE_CHANGE.spawnX");
  checkF32(p.spawnY, "ZONE_CHANGE.spawnY");
  checkInt(p.tickIndex, -2147483648, 2147483647, "ZONE_CHANGE.tickIndex");
  return n;
}

/** ZONE_CHANGE를 out[off..]에 쓰고 끝 오프셋 — sizeZoneChange로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeZoneChange(p: ZoneChangePayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.newZoneId, o);
  o = writeStr(out, o, p.name);
  o = out.writeFloatLE(p.width, o);
  o = out.writeFloatLE(p.height, o);
  o = out.writeInt32LE(p.tickRate, o);
  o = out.writeFloatLE(p.spawnX, o);
  o = out.writeFloatLE(p.spawnY, o);
  o = out.writeInt32LE(p.tickIndex, o);
  return o;
}

/** ZONE_CHANGE 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readZoneChange(r: BodyReader): ZoneChangePayload | null {
  const $newZoneId = r.i32();
  const $name = r.str(64);
  const $width = r.f32();
  const $height = r.f32();
  const $tickRate = r.i32();
  const $spawnX = r.f32();
  const $spawnY = r.f32();
  const $tickIndex = r.i32();
  if (r.err !== 0) return null;
  return { newZoneId: $newZoneId, name: $name, width: $width, height: $height, tickRate: $tickRate, spawnX: $spawnX, spawnY: $spawnY, tickIndex: $tickIndex };
}

/** ZONE_CHANGE 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeZoneChange(body: Uint8Array): ZoneChangePayload | null {
  const r = bodyReader.reset(body);
  const p = readZoneChange(r);
  return r.done() ? p : null;
}

// ── PORTAL_LIST ──

/** PORTAL_LIST 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizePortalList(p: PortalListPayload): number {
  let n = 6;
  checkInt(p.zoneId, -2147483648, 2147483647, "PORTAL_LIST.zoneId");
  checkCount(p.portals, 0, 32, "PORTAL_LIST.portals");
  for (let i = 0; i < p.portals.length; i++) n += sizePortalMarker(checkStruct(p.portals[i]!, "PORTAL_LIST.portals"));
  return n;
}

/** PORTAL_LIST를 out[off..]에 쓰고 끝 오프셋 — sizePortalList로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writePortalList(p: PortalListPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.zoneId, o);
  o = out.writeUInt16LE(p.portals.length, o);
  for (let i = 0; i < p.portals.length; i++) o = writePortalMarker(p.portals[i]!, out, o);
  return o;
}

/** PORTAL_LIST 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readPortalList(r: BodyReader): PortalListPayload | null {
  const $zoneId = r.i32();
  const $portals: PortalMarker[] = [];
  const $portals$n = r.count(0, 32);
  for (let i = 0; i < $portals$n; i++) {
    const e = readPortalMarker(r);
    if (e === null) return null;
    $portals.push(e);
  }
  if (r.err !== 0) return null;
  return { zoneId: $zoneId, portals: $portals };
}

/** PORTAL_LIST 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodePortalList(body: Uint8Array): PortalListPayload | null {
  const r = bodyReader.reset(body);
  const p = readPortalList(r);
  return r.done() ? p : null;
}

// ── INPUT_CMD ──

/** INPUT_CMD 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeInputCmd(p: InputCmdPayload): number {
  checkInt(p.seq, -2147483648, 2147483647, "INPUT_CMD.seq");
  checkInt(p.tick, -2147483648, 2147483647, "INPUT_CMD.tick");
  checkInt(p.dx, -2147483648, 2147483647, "INPUT_CMD.dx");
  checkInt(p.dy, -2147483648, 2147483647, "INPUT_CMD.dy");
  checkInt(p.action, -2147483648, 2147483647, "INPUT_CMD.action");
  checkEnum(MOVE_GAIT_CODE, p.gait, "INPUT_CMD.gait");
  return 21;
}

/** INPUT_CMD를 out[off..]에 쓰고 끝 오프셋 — sizeInputCmd로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeInputCmd(p: InputCmdPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.seq, o);
  o = out.writeInt32LE(p.tick, o);
  o = out.writeInt32LE(p.dx, o);
  o = out.writeInt32LE(p.dy, o);
  o = out.writeInt32LE(p.action, o);
  o = out.writeUInt8(MOVE_GAIT_CODE[p.gait], o);
  return o;
}

/** INPUT_CMD 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readInputCmd(r: BodyReader): InputCmdPayload | null {
  const $seq = r.i32();
  const $tick = r.i32();
  const $dx = r.i32();
  const $dy = r.i32();
  const $action = r.i32();
  const $gait = readMoveGait(r);
  if (r.err !== 0) return null;
  return { seq: $seq, tick: $tick, dx: $dx, dy: $dy, action: $action, gait: $gait };
}

/** INPUT_CMD 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeInputCmd(body: Uint8Array): InputCmdPayload | null {
  const r = bodyReader.reset(body);
  const p = readInputCmd(r);
  return r.done() ? p : null;
}

// ── SNAPSHOT_DELTA ──

/** SNAPSHOT_DELTA 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeSnapshotDelta(p: SnapshotDeltaPayload): number {
  let n = 10;
  checkInt(p.tickIndex, 0, 4294967295, "SNAPSHOT_DELTA.tickIndex");
  checkInt(p.ackSeq, 0, 4294967295, "SNAPSHOT_DELTA.ackSeq");
  checkCount(p.updates, 0, 5460, "SNAPSHOT_DELTA.updates");
  for (let i = 0; i < p.updates.length; i++) n += sizeSnapshotUpdate(checkStruct(p.updates[i]!, "SNAPSHOT_DELTA.updates"));
  return n;
}

/** SNAPSHOT_DELTA를 out[off..]에 쓰고 끝 오프셋 — sizeSnapshotDelta로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeSnapshotDelta(p: SnapshotDeltaPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeUInt32LE(p.tickIndex, o);
  o = out.writeUInt32LE(p.ackSeq, o);
  o = out.writeUInt16LE(p.updates.length, o);
  for (let i = 0; i < p.updates.length; i++) o = writeSnapshotUpdate(p.updates[i]!, out, o);
  return o;
}

/** SNAPSHOT_DELTA 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readSnapshotDelta(r: BodyReader): SnapshotDeltaPayload | null {
  const $tickIndex = r.u32();
  const $ackSeq = r.u32();
  const $updates: SnapshotUpdate[] = [];
  const $updates$n = r.count(0, 5460);
  if (!r.need($updates$n * 12)) return null;
  for (let i = 0; i < $updates$n; i++) {
    const e = readSnapshotUpdate(r);
    if (e === null) return null;
    $updates.push(e);
  }
  if (r.err !== 0) return null;
  return { tickIndex: $tickIndex, ackSeq: $ackSeq, updates: $updates };
}

/** SNAPSHOT_DELTA 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeSnapshotDelta(body: Uint8Array): SnapshotDeltaPayload | null {
  const r = bodyReader.reset(body);
  const p = readSnapshotDelta(r);
  return r.done() ? p : null;
}

// ── ENTITY_SPAWN ──

/** ENTITY_SPAWN 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeEntitySpawn(p: EntitySpawnPayload): number {
  let n = 41;
  checkInt(p.entityId, -2147483648, 2147483647, "ENTITY_SPAWN.entityId");
  checkEnum(ENTITY_TYPE_CODE, p.type, "ENTITY_SPAWN.type");
  checkF32(p.x, "ENTITY_SPAWN.x");
  checkF32(p.y, "ENTITY_SPAWN.y");
  n += strSize(p.name, 66, "ENTITY_SPAWN.name");
  checkInt(p.level, -2147483648, 2147483647, "ENTITY_SPAWN.level");
  checkInt(p.hp, -2147483648, 2147483647, "ENTITY_SPAWN.hp");
  checkInt(p.hpMax, -2147483648, 2147483647, "ENTITY_SPAWN.hpMax");
  checkInt(p.itemId, -2147483648, 2147483647, "ENTITY_SPAWN.itemId");
  checkInt(p.qty, -2147483648, 2147483647, "ENTITY_SPAWN.qty");
  checkInt(p.npcId, -2147483648, 2147483647, "ENTITY_SPAWN.npcId");
  checkInt(p.monsterDefId, -2147483648, 2147483647, "ENTITY_SPAWN.monsterDefId");
  return n;
}

/** ENTITY_SPAWN를 out[off..]에 쓰고 끝 오프셋 — sizeEntitySpawn로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeEntitySpawn(p: EntitySpawnPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.entityId, o);
  o = out.writeUInt8(ENTITY_TYPE_CODE[p.type], o);
  o = out.writeFloatLE(p.x, o);
  o = out.writeFloatLE(p.y, o);
  o = writeStr(out, o, p.name);
  o = out.writeInt32LE(p.level, o);
  o = out.writeInt32LE(p.hp, o);
  o = out.writeInt32LE(p.hpMax, o);
  o = out.writeInt32LE(p.itemId, o);
  o = out.writeInt32LE(p.qty, o);
  o = out.writeInt32LE(p.npcId, o);
  o = out.writeInt32LE(p.monsterDefId, o);
  return o;
}

/** ENTITY_SPAWN 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readEntitySpawn(r: BodyReader): EntitySpawnPayload | null {
  const $entityId = r.i32();
  const $type = readEntityType(r);
  const $x = r.f32();
  const $y = r.f32();
  const $name = r.str(66);
  const $level = r.i32();
  const $hp = r.i32();
  const $hpMax = r.i32();
  const $itemId = r.i32();
  const $qty = r.i32();
  const $npcId = r.i32();
  const $monsterDefId = r.i32();
  if (r.err !== 0) return null;
  return { entityId: $entityId, type: $type, x: $x, y: $y, name: $name, level: $level, hp: $hp, hpMax: $hpMax, itemId: $itemId, qty: $qty, npcId: $npcId, monsterDefId: $monsterDefId };
}

/** ENTITY_SPAWN 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeEntitySpawn(body: Uint8Array): EntitySpawnPayload | null {
  const r = bodyReader.reset(body);
  const p = readEntitySpawn(r);
  return r.done() ? p : null;
}

// ── ENTITY_DESPAWN ──

/** ENTITY_DESPAWN 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeEntityDespawn(p: EntityDespawnPayload): number {
  checkInt(p.entityId, -2147483648, 2147483647, "ENTITY_DESPAWN.entityId");
  checkInt(p.reason, -2147483648, 2147483647, "ENTITY_DESPAWN.reason");
  return 8;
}

/** ENTITY_DESPAWN를 out[off..]에 쓰고 끝 오프셋 — sizeEntityDespawn로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeEntityDespawn(p: EntityDespawnPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.entityId, o);
  o = out.writeInt32LE(p.reason, o);
  return o;
}

/** ENTITY_DESPAWN 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readEntityDespawn(r: BodyReader): EntityDespawnPayload | null {
  const $entityId = r.i32();
  const $reason = r.i32();
  if (r.err !== 0) return null;
  return { entityId: $entityId, reason: $reason };
}

/** ENTITY_DESPAWN 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeEntityDespawn(body: Uint8Array): EntityDespawnPayload | null {
  const r = bodyReader.reset(body);
  const p = readEntityDespawn(r);
  return r.done() ? p : null;
}

// ── MOVE_TO ──

/** MOVE_TO 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeMoveTo(p: MoveToPayload): number {
  checkInt(p.seq, -2147483648, 2147483647, "MOVE_TO.seq");
  checkInt(p.tick, -2147483648, 2147483647, "MOVE_TO.tick");
  checkF32(p.targetX, "MOVE_TO.targetX");
  checkF32(p.targetY, "MOVE_TO.targetY");
  return 16;
}

/** MOVE_TO를 out[off..]에 쓰고 끝 오프셋 — sizeMoveTo로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeMoveTo(p: MoveToPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.seq, o);
  o = out.writeInt32LE(p.tick, o);
  o = out.writeFloatLE(p.targetX, o);
  o = out.writeFloatLE(p.targetY, o);
  return o;
}

/** MOVE_TO 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readMoveTo(r: BodyReader): MoveToPayload | null {
  const $seq = r.i32();
  const $tick = r.i32();
  const $targetX = r.f32();
  const $targetY = r.f32();
  if (r.err !== 0) return null;
  return { seq: $seq, tick: $tick, targetX: $targetX, targetY: $targetY };
}

/** MOVE_TO 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeMoveTo(body: Uint8Array): MoveToPayload | null {
  const r = bodyReader.reset(body);
  const p = readMoveTo(r);
  return r.done() ? p : null;
}

// ── ENTITY_META ──

/** ENTITY_META 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeEntityMeta(p: EntityMetaPayload): number {
  checkInt(p.entityId, -2147483648, 2147483647, "ENTITY_META.entityId");
  checkInt(p.hp, -2147483648, 2147483647, "ENTITY_META.hp");
  checkInt(p.hpMax, -2147483648, 2147483647, "ENTITY_META.hpMax");
  checkInt(p.level, -2147483648, 2147483647, "ENTITY_META.level");
  return 16;
}

/** ENTITY_META를 out[off..]에 쓰고 끝 오프셋 — sizeEntityMeta로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeEntityMeta(p: EntityMetaPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.entityId, o);
  o = out.writeInt32LE(p.hp, o);
  o = out.writeInt32LE(p.hpMax, o);
  o = out.writeInt32LE(p.level, o);
  return o;
}

/** ENTITY_META 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readEntityMeta(r: BodyReader): EntityMetaPayload | null {
  const $entityId = r.i32();
  const $hp = r.i32();
  const $hpMax = r.i32();
  const $level = r.i32();
  if (r.err !== 0) return null;
  return { entityId: $entityId, hp: $hp, hpMax: $hpMax, level: $level };
}

/** ENTITY_META 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeEntityMeta(body: Uint8Array): EntityMetaPayload | null {
  const r = bodyReader.reset(body);
  const p = readEntityMeta(r);
  return r.done() ? p : null;
}

// ── MOVE_PATH ──

/** MOVE_PATH 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeMovePath(p: MovePathPayload): number {
  let n = 10;
  checkInt(p.entityId, -2147483648, 2147483647, "MOVE_PATH.entityId");
  checkInt(p.seq, -2147483648, 2147483647, "MOVE_PATH.seq");
  checkCount(p.waypoints, 0, 1024, "MOVE_PATH.waypoints");
  for (let i = 0; i < p.waypoints.length; i++) n += sizeWaypoint(checkStruct(p.waypoints[i]!, "MOVE_PATH.waypoints"));
  return n;
}

/** MOVE_PATH를 out[off..]에 쓰고 끝 오프셋 — sizeMovePath로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeMovePath(p: MovePathPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.entityId, o);
  o = out.writeInt32LE(p.seq, o);
  o = out.writeUInt16LE(p.waypoints.length, o);
  for (let i = 0; i < p.waypoints.length; i++) o = writeWaypoint(p.waypoints[i]!, out, o);
  return o;
}

/** MOVE_PATH 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readMovePath(r: BodyReader): MovePathPayload | null {
  const $entityId = r.i32();
  const $seq = r.i32();
  const $waypoints: Waypoint[] = [];
  const $waypoints$n = r.count(0, 1024);
  if (!r.need($waypoints$n * 8)) return null;
  for (let i = 0; i < $waypoints$n; i++) {
    const e = readWaypoint(r);
    if (e === null) return null;
    $waypoints.push(e);
  }
  if (r.err !== 0) return null;
  return { entityId: $entityId, seq: $seq, waypoints: $waypoints };
}

/** MOVE_PATH 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeMovePath(body: Uint8Array): MovePathPayload | null {
  const r = bodyReader.reset(body);
  const p = readMovePath(r);
  return r.done() ? p : null;
}

// ── MOVE_STOP ──

/** MOVE_STOP 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeMoveStop(p: MoveStopPayload): number {
  checkInt(p.seq, -2147483648, 2147483647, "MOVE_STOP.seq");
  checkInt(p.tick, -2147483648, 2147483647, "MOVE_STOP.tick");
  return 8;
}

/** MOVE_STOP를 out[off..]에 쓰고 끝 오프셋 — sizeMoveStop로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeMoveStop(p: MoveStopPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.seq, o);
  o = out.writeInt32LE(p.tick, o);
  return o;
}

/** MOVE_STOP 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readMoveStop(r: BodyReader): MoveStopPayload | null {
  const $seq = r.i32();
  const $tick = r.i32();
  if (r.err !== 0) return null;
  return { seq: $seq, tick: $tick };
}

/** MOVE_STOP 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeMoveStop(body: Uint8Array): MoveStopPayload | null {
  const r = bodyReader.reset(body);
  const p = readMoveStop(r);
  return r.done() ? p : null;
}

// ── CHAT_SAY ──

/** CHAT_SAY 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeChatSay(p: ChatSayPayload): number {
  let n = 4;
  checkInt(p.channel, -2147483648, 2147483647, "CHAT_SAY.channel");
  n += strSize(p.target, 64, "CHAT_SAY.target");
  n += strSize(p.text, 600, "CHAT_SAY.text");
  return n;
}

/** CHAT_SAY를 out[off..]에 쓰고 끝 오프셋 — sizeChatSay로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeChatSay(p: ChatSayPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.channel, o);
  o = writeStr(out, o, p.target);
  o = writeStr(out, o, p.text);
  return o;
}

/** CHAT_SAY 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readChatSay(r: BodyReader): ChatSayPayload | null {
  const $channel = r.i32();
  const $target = r.str(64);
  const $text = r.str(600);
  if (r.err !== 0) return null;
  return { channel: $channel, target: $target, text: $text };
}

/** CHAT_SAY 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeChatSay(body: Uint8Array): ChatSayPayload | null {
  const r = bodyReader.reset(body);
  const p = readChatSay(r);
  return r.done() ? p : null;
}

// ── CHAT_BCAST ──

/** CHAT_BCAST 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeChatBcast(p: ChatBcastPayload): number {
  let n = 8;
  checkInt(p.channel, -2147483648, 2147483647, "CHAT_BCAST.channel");
  checkInt(p.senderId, -2147483648, 2147483647, "CHAT_BCAST.senderId");
  n += strSize(p.senderName, 66, "CHAT_BCAST.senderName");
  n += strSize(p.text, 600, "CHAT_BCAST.text");
  return n;
}

/** CHAT_BCAST를 out[off..]에 쓰고 끝 오프셋 — sizeChatBcast로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeChatBcast(p: ChatBcastPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.channel, o);
  o = out.writeInt32LE(p.senderId, o);
  o = writeStr(out, o, p.senderName);
  o = writeStr(out, o, p.text);
  return o;
}

/** CHAT_BCAST 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readChatBcast(r: BodyReader): ChatBcastPayload | null {
  const $channel = r.i32();
  const $senderId = r.i32();
  const $senderName = r.str(66);
  const $text = r.str(600);
  if (r.err !== 0) return null;
  return { channel: $channel, senderId: $senderId, senderName: $senderName, text: $text };
}

/** CHAT_BCAST 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeChatBcast(body: Uint8Array): ChatBcastPayload | null {
  const r = bodyReader.reset(body);
  const p = readChatBcast(r);
  return r.done() ? p : null;
}

// ── CREATE_CHARACTER_V2 ──

/** CREATE_CHARACTER_V2 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeCreateCharacterV2(p: CreateCharacterV2Payload): number {
  let n = 20;
  n += strSize(p.name, 64, "CREATE_CHARACTER_V2.name");
  checkInt(p.race, -2147483648, 2147483647, "CREATE_CHARACTER_V2.race");
  checkInt(p.graphPow, -2147483648, 2147483647, "CREATE_CHARACTER_V2.graphPow");
  checkInt(p.graphMag, -2147483648, 2147483647, "CREATE_CHARACTER_V2.graphMag");
  checkInt(p.graphCha, -2147483648, 2147483647, "CREATE_CHARACTER_V2.graphCha");
  checkInt(p.graphLuc, -2147483648, 2147483647, "CREATE_CHARACTER_V2.graphLuc");
  return n;
}

/** CREATE_CHARACTER_V2를 out[off..]에 쓰고 끝 오프셋 — sizeCreateCharacterV2로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeCreateCharacterV2(p: CreateCharacterV2Payload, out: Buffer, off: number): number {
  let o = off;
  o = writeStr(out, o, p.name);
  o = out.writeInt32LE(p.race, o);
  o = out.writeInt32LE(p.graphPow, o);
  o = out.writeInt32LE(p.graphMag, o);
  o = out.writeInt32LE(p.graphCha, o);
  o = out.writeInt32LE(p.graphLuc, o);
  return o;
}

/** CREATE_CHARACTER_V2 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readCreateCharacterV2(r: BodyReader): CreateCharacterV2Payload | null {
  const $name = r.str(64);
  const $race = r.i32();
  const $graphPow = r.i32();
  const $graphMag = r.i32();
  const $graphCha = r.i32();
  const $graphLuc = r.i32();
  if (r.err !== 0) return null;
  return { name: $name, race: $race, graphPow: $graphPow, graphMag: $graphMag, graphCha: $graphCha, graphLuc: $graphLuc };
}

/** CREATE_CHARACTER_V2 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeCreateCharacterV2(body: Uint8Array): CreateCharacterV2Payload | null {
  const r = bodyReader.reset(body);
  const p = readCreateCharacterV2(r);
  return r.done() ? p : null;
}

// ── CHAR_STATS_FULL ──

/** CHAR_STATS_FULL 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeCharStatsFull(p: CharStatsFullPayload): number {
  let n = 68;
  checkInt(p.charId, -2147483648, 2147483647, "CHAR_STATS_FULL.charId");
  n += strSize(p.name, 66, "CHAR_STATS_FULL.name");
  checkInt(p.race, -2147483648, 2147483647, "CHAR_STATS_FULL.race");
  n += sizeCharGraph(checkStruct(p.graph, "CHAR_STATS_FULL.graph"));
  n += sizeCharStats(checkStruct(p.stats, "CHAR_STATS_FULL.stats"));
  checkInt(p.level, -2147483648, 2147483647, "CHAR_STATS_FULL.level");
  checkInt(p.exp, -2147483648, 2147483647, "CHAR_STATS_FULL.exp");
  checkInt(p.hp, -2147483648, 2147483647, "CHAR_STATS_FULL.hp");
  checkInt(p.hpMax, -2147483648, 2147483647, "CHAR_STATS_FULL.hpMax");
  checkInt(p.mp, -2147483648, 2147483647, "CHAR_STATS_FULL.mp");
  checkInt(p.mpMax, -2147483648, 2147483647, "CHAR_STATS_FULL.mpMax");
  checkInt(p.slv, -2147483648, 2147483647, "CHAR_STATS_FULL.slv");
  checkInt(p.sexp, -2147483648, 2147483647, "CHAR_STATS_FULL.sexp");
  checkInt(p.slp, -2147483648, 2147483647, "CHAR_STATS_FULL.slp");
  checkInt(p.gold, -2147483648, 2147483647, "CHAR_STATS_FULL.gold");
  checkInt(p.zoneId, -2147483648, 2147483647, "CHAR_STATS_FULL.zoneId");
  checkF32(p.x, "CHAR_STATS_FULL.x");
  checkF32(p.y, "CHAR_STATS_FULL.y");
  n += sizeCharDerivedStats(checkStruct(p.derived, "CHAR_STATS_FULL.derived"));
  checkInt(p.freePoints, -2147483648, 2147483647, "CHAR_STATS_FULL.freePoints");
  checkInt(p.allocatedPoints, -2147483648, 2147483647, "CHAR_STATS_FULL.allocatedPoints");
  return n;
}

/** CHAR_STATS_FULL를 out[off..]에 쓰고 끝 오프셋 — sizeCharStatsFull로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeCharStatsFull(p: CharStatsFullPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.charId, o);
  o = writeStr(out, o, p.name);
  o = out.writeInt32LE(p.race, o);
  o = writeCharGraph(p.graph, out, o);
  o = writeCharStats(p.stats, out, o);
  o = out.writeInt32LE(p.level, o);
  o = out.writeInt32LE(p.exp, o);
  o = out.writeInt32LE(p.hp, o);
  o = out.writeInt32LE(p.hpMax, o);
  o = out.writeInt32LE(p.mp, o);
  o = out.writeInt32LE(p.mpMax, o);
  o = out.writeInt32LE(p.slv, o);
  o = out.writeInt32LE(p.sexp, o);
  o = out.writeInt32LE(p.slp, o);
  o = out.writeInt32LE(p.gold, o);
  o = out.writeInt32LE(p.zoneId, o);
  o = out.writeFloatLE(p.x, o);
  o = out.writeFloatLE(p.y, o);
  o = writeCharDerivedStats(p.derived, out, o);
  o = out.writeInt32LE(p.freePoints, o);
  o = out.writeInt32LE(p.allocatedPoints, o);
  return o;
}

/** CHAR_STATS_FULL 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readCharStatsFull(r: BodyReader): CharStatsFullPayload | null {
  const $charId = r.i32();
  const $name = r.str(66);
  const $race = r.i32();
  const $graph = readCharGraph(r);
  if ($graph === null) return null;
  const $stats = readCharStats(r);
  if ($stats === null) return null;
  const $level = r.i32();
  const $exp = r.i32();
  const $hp = r.i32();
  const $hpMax = r.i32();
  const $mp = r.i32();
  const $mpMax = r.i32();
  const $slv = r.i32();
  const $sexp = r.i32();
  const $slp = r.i32();
  const $gold = r.i32();
  const $zoneId = r.i32();
  const $x = r.f32();
  const $y = r.f32();
  const $derived = readCharDerivedStats(r);
  if ($derived === null) return null;
  const $freePoints = r.i32();
  const $allocatedPoints = r.i32();
  if (r.err !== 0) return null;
  return { charId: $charId, name: $name, race: $race, graph: $graph, stats: $stats, level: $level, exp: $exp, hp: $hp, hpMax: $hpMax, mp: $mp, mpMax: $mpMax, slv: $slv, sexp: $sexp, slp: $slp, gold: $gold, zoneId: $zoneId, x: $x, y: $y, derived: $derived, freePoints: $freePoints, allocatedPoints: $allocatedPoints };
}

/** CHAR_STATS_FULL 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeCharStatsFull(body: Uint8Array): CharStatsFullPayload | null {
  const r = bodyReader.reset(body);
  const p = readCharStatsFull(r);
  return r.done() ? p : null;
}

// ── CHAR_LEVEL_UP ──

/** CHAR_LEVEL_UP 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeCharLevelUp(p: CharLevelUpPayload): number {
  let n = 14;
  checkInt(p.newLevel, -2147483648, 2147483647, "CHAR_LEVEL_UP.newLevel");
  checkCount(p.statDeltas, 0, 3588, "CHAR_LEVEL_UP.statDeltas");
  for (let i = 0; i < p.statDeltas.length; i++) n += sizeCharStatDelta(checkStruct(p.statDeltas[i]!, "CHAR_LEVEL_UP.statDeltas"));
  checkInt(p.hpMaxNew, -2147483648, 2147483647, "CHAR_LEVEL_UP.hpMaxNew");
  checkInt(p.mpMaxNew, -2147483648, 2147483647, "CHAR_LEVEL_UP.mpMaxNew");
  return n;
}

/** CHAR_LEVEL_UP를 out[off..]에 쓰고 끝 오프셋 — sizeCharLevelUp로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeCharLevelUp(p: CharLevelUpPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.newLevel, o);
  o = out.writeUInt16LE(p.statDeltas.length, o);
  for (let i = 0; i < p.statDeltas.length; i++) o = writeCharStatDelta(p.statDeltas[i]!, out, o);
  o = out.writeInt32LE(p.hpMaxNew, o);
  o = out.writeInt32LE(p.mpMaxNew, o);
  return o;
}

/** CHAR_LEVEL_UP 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readCharLevelUp(r: BodyReader): CharLevelUpPayload | null {
  const $newLevel = r.i32();
  const $statDeltas: CharStatDelta[] = [];
  const $statDeltas$n = r.count(0, 3588);
  if (!r.need($statDeltas$n * 14)) return null;
  for (let i = 0; i < $statDeltas$n; i++) {
    const e = readCharStatDelta(r);
    if (e === null) return null;
    $statDeltas.push(e);
  }
  const $hpMaxNew = r.i32();
  const $mpMaxNew = r.i32();
  if (r.err !== 0) return null;
  return { newLevel: $newLevel, statDeltas: $statDeltas, hpMaxNew: $hpMaxNew, mpMaxNew: $mpMaxNew };
}

/** CHAR_LEVEL_UP 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeCharLevelUp(body: Uint8Array): CharLevelUpPayload | null {
  const r = bodyReader.reset(body);
  const p = readCharLevelUp(r);
  return r.done() ? p : null;
}

// ── CHAR_EXP_GAIN ──

/** CHAR_EXP_GAIN 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeCharExpGain(p: CharExpGainPayload): number {
  checkInt(p.expDelta, -2147483648, 2147483647, "CHAR_EXP_GAIN.expDelta");
  checkInt(p.sexpDelta, -2147483648, 2147483647, "CHAR_EXP_GAIN.sexpDelta");
  checkInt(p.expTotal, -2147483648, 2147483647, "CHAR_EXP_GAIN.expTotal");
  checkInt(p.sexpTotal, -2147483648, 2147483647, "CHAR_EXP_GAIN.sexpTotal");
  return 16;
}

/** CHAR_EXP_GAIN를 out[off..]에 쓰고 끝 오프셋 — sizeCharExpGain로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeCharExpGain(p: CharExpGainPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.expDelta, o);
  o = out.writeInt32LE(p.sexpDelta, o);
  o = out.writeInt32LE(p.expTotal, o);
  o = out.writeInt32LE(p.sexpTotal, o);
  return o;
}

/** CHAR_EXP_GAIN 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readCharExpGain(r: BodyReader): CharExpGainPayload | null {
  const $expDelta = r.i32();
  const $sexpDelta = r.i32();
  const $expTotal = r.i32();
  const $sexpTotal = r.i32();
  if (r.err !== 0) return null;
  return { expDelta: $expDelta, sexpDelta: $sexpDelta, expTotal: $expTotal, sexpTotal: $sexpTotal };
}

/** CHAR_EXP_GAIN 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeCharExpGain(body: Uint8Array): CharExpGainPayload | null {
  const r = bodyReader.reset(body);
  const p = readCharExpGain(r);
  return r.done() ? p : null;
}

// ── GOLD_UPDATE ──

/** GOLD_UPDATE 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeGoldUpdate(p: GoldUpdatePayload): number {
  checkInt(p.gold, -2147483648, 2147483647, "GOLD_UPDATE.gold");
  checkInt(p.delta, -2147483648, 2147483647, "GOLD_UPDATE.delta");
  return 8;
}

/** GOLD_UPDATE를 out[off..]에 쓰고 끝 오프셋 — sizeGoldUpdate로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeGoldUpdate(p: GoldUpdatePayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.gold, o);
  o = out.writeInt32LE(p.delta, o);
  return o;
}

/** GOLD_UPDATE 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readGoldUpdate(r: BodyReader): GoldUpdatePayload | null {
  const $gold = r.i32();
  const $delta = r.i32();
  if (r.err !== 0) return null;
  return { gold: $gold, delta: $delta };
}

/** GOLD_UPDATE 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeGoldUpdate(body: Uint8Array): GoldUpdatePayload | null {
  const r = bodyReader.reset(body);
  const p = readGoldUpdate(r);
  return r.done() ? p : null;
}

// ── STAT_ALLOCATE ──

/** STAT_ALLOCATE 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeStatAllocate(p: StatAllocatePayload): number {
  let n = 6;
  checkInt(p.requestId, -2147483648, 2147483647, "STAT_ALLOCATE.requestId");
  checkCount(p.allocations, 0, 12, "STAT_ALLOCATE.allocations");
  for (let i = 0; i < p.allocations.length; i++) n += sizeStatAllocation(checkStruct(p.allocations[i]!, "STAT_ALLOCATE.allocations"));
  return n;
}

/** STAT_ALLOCATE를 out[off..]에 쓰고 끝 오프셋 — sizeStatAllocate로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeStatAllocate(p: StatAllocatePayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.requestId, o);
  o = out.writeUInt16LE(p.allocations.length, o);
  for (let i = 0; i < p.allocations.length; i++) o = writeStatAllocation(p.allocations[i]!, out, o);
  return o;
}

/** STAT_ALLOCATE 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readStatAllocate(r: BodyReader): StatAllocatePayload | null {
  const $requestId = r.i32();
  const $allocations: StatAllocation[] = [];
  const $allocations$n = r.count(0, 12);
  if (!r.need($allocations$n * 5)) return null;
  for (let i = 0; i < $allocations$n; i++) {
    const e = readStatAllocation(r);
    if (e === null) return null;
    $allocations.push(e);
  }
  if (r.err !== 0) return null;
  return { requestId: $requestId, allocations: $allocations };
}

/** STAT_ALLOCATE 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeStatAllocate(body: Uint8Array): StatAllocatePayload | null {
  const r = bodyReader.reset(body);
  const p = readStatAllocate(r);
  return r.done() ? p : null;
}

// ── STAT_RESET ──

/** STAT_RESET 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeStatReset(p: StatResetPayload): number {
  checkInt(p.requestId, -2147483648, 2147483647, "STAT_RESET.requestId");
  return 4;
}

/** STAT_RESET를 out[off..]에 쓰고 끝 오프셋 — sizeStatReset로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeStatReset(p: StatResetPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.requestId, o);
  return o;
}

/** STAT_RESET 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readStatReset(r: BodyReader): StatResetPayload | null {
  const $requestId = r.i32();
  if (r.err !== 0) return null;
  return { requestId: $requestId };
}

/** STAT_RESET 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeStatReset(body: Uint8Array): StatResetPayload | null {
  const r = bodyReader.reset(body);
  const p = readStatReset(r);
  return r.done() ? p : null;
}

// ── STAT_POINTS_ACK ──

/** STAT_POINTS_ACK 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeStatPointsAck(p: StatPointsAckPayload): number {
  checkInt(p.requestId, -2147483648, 2147483647, "STAT_POINTS_ACK.requestId");
  checkInt(p.op, -2147483648, 2147483647, "STAT_POINTS_ACK.op");
  checkInt(p.errCode, -2147483648, 2147483647, "STAT_POINTS_ACK.errCode");
  checkInt(p.freePoints, -2147483648, 2147483647, "STAT_POINTS_ACK.freePoints");
  return 16;
}

/** STAT_POINTS_ACK를 out[off..]에 쓰고 끝 오프셋 — sizeStatPointsAck로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeStatPointsAck(p: StatPointsAckPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.requestId, o);
  o = out.writeInt32LE(p.op, o);
  o = out.writeInt32LE(p.errCode, o);
  o = out.writeInt32LE(p.freePoints, o);
  return o;
}

/** STAT_POINTS_ACK 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readStatPointsAck(r: BodyReader): StatPointsAckPayload | null {
  const $requestId = r.i32();
  const $op = r.i32();
  const $errCode = r.i32();
  const $freePoints = r.i32();
  if (r.err !== 0) return null;
  return { requestId: $requestId, op: $op, errCode: $errCode, freePoints: $freePoints };
}

/** STAT_POINTS_ACK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeStatPointsAck(body: Uint8Array): StatPointsAckPayload | null {
  const r = bodyReader.reset(body);
  const p = readStatPointsAck(r);
  return r.done() ? p : null;
}

// ── TARGET_SELECT ──

/** TARGET_SELECT 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeTargetSelect(p: TargetSelectPayload): number {
  checkInt(p.targetEntityId, -2147483648, 2147483647, "TARGET_SELECT.targetEntityId");
  return 4;
}

/** TARGET_SELECT를 out[off..]에 쓰고 끝 오프셋 — sizeTargetSelect로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeTargetSelect(p: TargetSelectPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.targetEntityId, o);
  return o;
}

/** TARGET_SELECT 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readTargetSelect(r: BodyReader): TargetSelectPayload | null {
  const $targetEntityId = r.i32();
  if (r.err !== 0) return null;
  return { targetEntityId: $targetEntityId };
}

/** TARGET_SELECT 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeTargetSelect(body: Uint8Array): TargetSelectPayload | null {
  const r = bodyReader.reset(body);
  const p = readTargetSelect(r);
  return r.done() ? p : null;
}

// ── TARGET_ACK ──

/** TARGET_ACK 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeTargetAck(p: TargetAckPayload): number {
  checkInt(p.targetEntityId, -2147483648, 2147483647, "TARGET_ACK.targetEntityId");
  checkInt(p.errCode, -2147483648, 2147483647, "TARGET_ACK.errCode");
  return 8;
}

/** TARGET_ACK를 out[off..]에 쓰고 끝 오프셋 — sizeTargetAck로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeTargetAck(p: TargetAckPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.targetEntityId, o);
  o = out.writeInt32LE(p.errCode, o);
  return o;
}

/** TARGET_ACK 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readTargetAck(r: BodyReader): TargetAckPayload | null {
  const $targetEntityId = r.i32();
  const $errCode = r.i32();
  if (r.err !== 0) return null;
  return { targetEntityId: $targetEntityId, errCode: $errCode };
}

/** TARGET_ACK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeTargetAck(body: Uint8Array): TargetAckPayload | null {
  const r = bodyReader.reset(body);
  const p = readTargetAck(r);
  return r.done() ? p : null;
}

// ── ATTACK_START ──

/** ATTACK_START 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeAttackStart(_p: AttackStartPayload): number {
  return 0;
}

/** ATTACK_START를 out[off..]에 쓰고 끝 오프셋 — sizeAttackStart로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeAttackStart(_p: AttackStartPayload, _out: Buffer, off: number): number {
  return off;
}

/** ATTACK_START 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readAttackStart(r: BodyReader): AttackStartPayload | null {
  if (r.err !== 0) return null;
  return {};
}

/** ATTACK_START 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeAttackStart(body: Uint8Array): AttackStartPayload | null {
  const r = bodyReader.reset(body);
  const p = readAttackStart(r);
  return r.done() ? p : null;
}

// ── ATTACK_STOP ──

/** ATTACK_STOP 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeAttackStop(_p: AttackStopPayload): number {
  return 0;
}

/** ATTACK_STOP를 out[off..]에 쓰고 끝 오프셋 — sizeAttackStop로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeAttackStop(_p: AttackStopPayload, _out: Buffer, off: number): number {
  return off;
}

/** ATTACK_STOP 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readAttackStop(r: BodyReader): AttackStopPayload | null {
  if (r.err !== 0) return null;
  return {};
}

/** ATTACK_STOP 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeAttackStop(body: Uint8Array): AttackStopPayload | null {
  const r = bodyReader.reset(body);
  const p = readAttackStop(r);
  return r.done() ? p : null;
}

// ── DAMAGE_EVENT ──

/** DAMAGE_EVENT 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeDamageEvent(p: DamageEventPayload): number {
  checkInt(p.attackerEntityId, -2147483648, 2147483647, "DAMAGE_EVENT.attackerEntityId");
  checkInt(p.targetEntityId, -2147483648, 2147483647, "DAMAGE_EVENT.targetEntityId");
  checkInt(p.damage, -2147483648, 2147483647, "DAMAGE_EVENT.damage");
  checkBool(p.isCrit, "DAMAGE_EVENT.isCrit");
  checkBool(p.isMiss, "DAMAGE_EVENT.isMiss");
  return 14;
}

/** DAMAGE_EVENT를 out[off..]에 쓰고 끝 오프셋 — sizeDamageEvent로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeDamageEvent(p: DamageEventPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.attackerEntityId, o);
  o = out.writeInt32LE(p.targetEntityId, o);
  o = out.writeInt32LE(p.damage, o);
  o = out.writeUInt8(p.isCrit ? 1 : 0, o);
  o = out.writeUInt8(p.isMiss ? 1 : 0, o);
  return o;
}

/** DAMAGE_EVENT 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readDamageEvent(r: BodyReader): DamageEventPayload | null {
  const $attackerEntityId = r.i32();
  const $targetEntityId = r.i32();
  const $damage = r.i32();
  const $isCrit = r.bool();
  const $isMiss = r.bool();
  if (r.err !== 0) return null;
  return { attackerEntityId: $attackerEntityId, targetEntityId: $targetEntityId, damage: $damage, isCrit: $isCrit, isMiss: $isMiss };
}

/** DAMAGE_EVENT 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeDamageEvent(body: Uint8Array): DamageEventPayload | null {
  const r = bodyReader.reset(body);
  const p = readDamageEvent(r);
  return r.done() ? p : null;
}

// ── DEATH_NOTIFY ──

/** DEATH_NOTIFY 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeDeathNotify(p: DeathNotifyPayload): number {
  checkInt(p.victimEntityId, -2147483648, 2147483647, "DEATH_NOTIFY.victimEntityId");
  checkInt(p.attackerEntityId, -2147483648, 2147483647, "DEATH_NOTIFY.attackerEntityId");
  checkInt(p.expLost, -2147483648, 2147483647, "DEATH_NOTIFY.expLost");
  checkInt(p.sexpLost, -2147483648, 2147483647, "DEATH_NOTIFY.sexpLost");
  return 16;
}

/** DEATH_NOTIFY를 out[off..]에 쓰고 끝 오프셋 — sizeDeathNotify로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeDeathNotify(p: DeathNotifyPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.victimEntityId, o);
  o = out.writeInt32LE(p.attackerEntityId, o);
  o = out.writeInt32LE(p.expLost, o);
  o = out.writeInt32LE(p.sexpLost, o);
  return o;
}

/** DEATH_NOTIFY 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readDeathNotify(r: BodyReader): DeathNotifyPayload | null {
  const $victimEntityId = r.i32();
  const $attackerEntityId = r.i32();
  const $expLost = r.i32();
  const $sexpLost = r.i32();
  if (r.err !== 0) return null;
  return { victimEntityId: $victimEntityId, attackerEntityId: $attackerEntityId, expLost: $expLost, sexpLost: $sexpLost };
}

/** DEATH_NOTIFY 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeDeathNotify(body: Uint8Array): DeathNotifyPayload | null {
  const r = bodyReader.reset(body);
  const p = readDeathNotify(r);
  return r.done() ? p : null;
}

// ── RESPAWN_REQ ──

/** RESPAWN_REQ 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeRespawnReq(_p: RespawnReqPayload): number {
  return 0;
}

/** RESPAWN_REQ를 out[off..]에 쓰고 끝 오프셋 — sizeRespawnReq로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeRespawnReq(_p: RespawnReqPayload, _out: Buffer, off: number): number {
  return off;
}

/** RESPAWN_REQ 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readRespawnReq(r: BodyReader): RespawnReqPayload | null {
  if (r.err !== 0) return null;
  return {};
}

/** RESPAWN_REQ 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeRespawnReq(body: Uint8Array): RespawnReqPayload | null {
  const r = bodyReader.reset(body);
  const p = readRespawnReq(r);
  return r.done() ? p : null;
}

// ── RESPAWN_OK ──

/** RESPAWN_OK 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeRespawnOk(p: RespawnOkPayload): number {
  checkInt(p.zoneId, -2147483648, 2147483647, "RESPAWN_OK.zoneId");
  checkF32(p.spawnX, "RESPAWN_OK.spawnX");
  checkF32(p.spawnY, "RESPAWN_OK.spawnY");
  checkInt(p.hp, -2147483648, 2147483647, "RESPAWN_OK.hp");
  checkInt(p.hpMax, -2147483648, 2147483647, "RESPAWN_OK.hpMax");
  checkInt(p.mp, -2147483648, 2147483647, "RESPAWN_OK.mp");
  checkInt(p.mpMax, -2147483648, 2147483647, "RESPAWN_OK.mpMax");
  return 28;
}

/** RESPAWN_OK를 out[off..]에 쓰고 끝 오프셋 — sizeRespawnOk로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeRespawnOk(p: RespawnOkPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.zoneId, o);
  o = out.writeFloatLE(p.spawnX, o);
  o = out.writeFloatLE(p.spawnY, o);
  o = out.writeInt32LE(p.hp, o);
  o = out.writeInt32LE(p.hpMax, o);
  o = out.writeInt32LE(p.mp, o);
  o = out.writeInt32LE(p.mpMax, o);
  return o;
}

/** RESPAWN_OK 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readRespawnOk(r: BodyReader): RespawnOkPayload | null {
  const $zoneId = r.i32();
  const $spawnX = r.f32();
  const $spawnY = r.f32();
  const $hp = r.i32();
  const $hpMax = r.i32();
  const $mp = r.i32();
  const $mpMax = r.i32();
  if (r.err !== 0) return null;
  return { zoneId: $zoneId, spawnX: $spawnX, spawnY: $spawnY, hp: $hp, hpMax: $hpMax, mp: $mp, mpMax: $mpMax };
}

/** RESPAWN_OK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeRespawnOk(body: Uint8Array): RespawnOkPayload | null {
  const r = bodyReader.reset(body);
  const p = readRespawnOk(r);
  return r.done() ? p : null;
}

// ── SKILL_CAST ──

/** SKILL_CAST 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeSkillCast(p: SkillCastPayload): number {
  checkInt(p.skillId, -2147483648, 2147483647, "SKILL_CAST.skillId");
  checkInt(p.targetEntityId, -2147483648, 2147483647, "SKILL_CAST.targetEntityId");
  checkF32(p.groundX, "SKILL_CAST.groundX");
  checkF32(p.groundY, "SKILL_CAST.groundY");
  return 16;
}

/** SKILL_CAST를 out[off..]에 쓰고 끝 오프셋 — sizeSkillCast로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeSkillCast(p: SkillCastPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.skillId, o);
  o = out.writeInt32LE(p.targetEntityId, o);
  o = out.writeFloatLE(p.groundX, o);
  o = out.writeFloatLE(p.groundY, o);
  return o;
}

/** SKILL_CAST 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readSkillCast(r: BodyReader): SkillCastPayload | null {
  const $skillId = r.i32();
  const $targetEntityId = r.i32();
  const $groundX = r.f32();
  const $groundY = r.f32();
  if (r.err !== 0) return null;
  return { skillId: $skillId, targetEntityId: $targetEntityId, groundX: $groundX, groundY: $groundY };
}

/** SKILL_CAST 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeSkillCast(body: Uint8Array): SkillCastPayload | null {
  const r = bodyReader.reset(body);
  const p = readSkillCast(r);
  return r.done() ? p : null;
}

// ── SKILL_LIST ──

/** SKILL_LIST 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeSkillList(p: SkillListPayload): number {
  let n = 2;
  checkCount(p.skills, 0, 256, "SKILL_LIST.skills");
  for (let i = 0; i < p.skills.length; i++) n += sizeSkillInfo(checkStruct(p.skills[i]!, "SKILL_LIST.skills"));
  return n;
}

/** SKILL_LIST를 out[off..]에 쓰고 끝 오프셋 — sizeSkillList로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeSkillList(p: SkillListPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeUInt16LE(p.skills.length, o);
  for (let i = 0; i < p.skills.length; i++) o = writeSkillInfo(p.skills[i]!, out, o);
  return o;
}

/** SKILL_LIST 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readSkillList(r: BodyReader): SkillListPayload | null {
  const $skills: SkillInfo[] = [];
  const $skills$n = r.count(0, 256);
  for (let i = 0; i < $skills$n; i++) {
    const e = readSkillInfo(r);
    if (e === null) return null;
    $skills.push(e);
  }
  if (r.err !== 0) return null;
  return { skills: $skills };
}

/** SKILL_LIST 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeSkillList(body: Uint8Array): SkillListPayload | null {
  const r = bodyReader.reset(body);
  const p = readSkillList(r);
  return r.done() ? p : null;
}

// ── SKILL_EFFECT ──

/** SKILL_EFFECT 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeSkillEffect(p: SkillEffectPayload): number {
  checkInt(p.skillId, -2147483648, 2147483647, "SKILL_EFFECT.skillId");
  checkInt(p.casterEntityId, -2147483648, 2147483647, "SKILL_EFFECT.casterEntityId");
  checkInt(p.targetEntityId, -2147483648, 2147483647, "SKILL_EFFECT.targetEntityId");
  checkEnum(SKILL_EFFECT_KIND_CODE, p.effectKind, "SKILL_EFFECT.effectKind");
  checkInt(p.amount, -2147483648, 2147483647, "SKILL_EFFECT.amount");
  checkBool(p.isCrit, "SKILL_EFFECT.isCrit");
  checkBool(p.isMiss, "SKILL_EFFECT.isMiss");
  checkF32(p.groundX, "SKILL_EFFECT.groundX");
  checkF32(p.groundY, "SKILL_EFFECT.groundY");
  checkInt(p.castId, -2147483648, 2147483647, "SKILL_EFFECT.castId");
  checkInt(p.impactDelayMs, -2147483648, 2147483647, "SKILL_EFFECT.impactDelayMs");
  checkInt(p.variant, 0, 255, "SKILL_EFFECT.variant");
  checkInt(p.hitIndex, 0, 255, "SKILL_EFFECT.hitIndex");
  return 37;
}

/** SKILL_EFFECT를 out[off..]에 쓰고 끝 오프셋 — sizeSkillEffect로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeSkillEffect(p: SkillEffectPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.skillId, o);
  o = out.writeInt32LE(p.casterEntityId, o);
  o = out.writeInt32LE(p.targetEntityId, o);
  o = out.writeUInt8(SKILL_EFFECT_KIND_CODE[p.effectKind], o);
  o = out.writeInt32LE(p.amount, o);
  o = out.writeUInt8(p.isCrit ? 1 : 0, o);
  o = out.writeUInt8(p.isMiss ? 1 : 0, o);
  o = out.writeFloatLE(p.groundX, o);
  o = out.writeFloatLE(p.groundY, o);
  o = out.writeInt32LE(p.castId, o);
  o = out.writeInt32LE(p.impactDelayMs, o);
  o = out.writeUInt8(p.variant, o);
  o = out.writeUInt8(p.hitIndex, o);
  return o;
}

/** SKILL_EFFECT 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readSkillEffect(r: BodyReader): SkillEffectPayload | null {
  const $skillId = r.i32();
  const $casterEntityId = r.i32();
  const $targetEntityId = r.i32();
  const $effectKind = readSkillEffectKind(r);
  const $amount = r.i32();
  const $isCrit = r.bool();
  const $isMiss = r.bool();
  const $groundX = r.f32();
  const $groundY = r.f32();
  const $castId = r.i32();
  const $impactDelayMs = r.i32();
  const $variant = r.u8();
  const $hitIndex = r.u8();
  if (r.err !== 0) return null;
  return { skillId: $skillId, casterEntityId: $casterEntityId, targetEntityId: $targetEntityId, effectKind: $effectKind, amount: $amount, isCrit: $isCrit, isMiss: $isMiss, groundX: $groundX, groundY: $groundY, castId: $castId, impactDelayMs: $impactDelayMs, variant: $variant, hitIndex: $hitIndex };
}

/** SKILL_EFFECT 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeSkillEffect(body: Uint8Array): SkillEffectPayload | null {
  const r = bodyReader.reset(body);
  const p = readSkillEffect(r);
  return r.done() ? p : null;
}

// ── SKILL_CAST_ACK ──

/** SKILL_CAST_ACK 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeSkillCastAck(p: SkillCastAckPayload): number {
  checkInt(p.skillId, -2147483648, 2147483647, "SKILL_CAST_ACK.skillId");
  checkInt(p.errCode, -2147483648, 2147483647, "SKILL_CAST_ACK.errCode");
  checkInt(p.cooldownMs, -2147483648, 2147483647, "SKILL_CAST_ACK.cooldownMs");
  return 12;
}

/** SKILL_CAST_ACK를 out[off..]에 쓰고 끝 오프셋 — sizeSkillCastAck로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeSkillCastAck(p: SkillCastAckPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.skillId, o);
  o = out.writeInt32LE(p.errCode, o);
  o = out.writeInt32LE(p.cooldownMs, o);
  return o;
}

/** SKILL_CAST_ACK 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readSkillCastAck(r: BodyReader): SkillCastAckPayload | null {
  const $skillId = r.i32();
  const $errCode = r.i32();
  const $cooldownMs = r.i32();
  if (r.err !== 0) return null;
  return { skillId: $skillId, errCode: $errCode, cooldownMs: $cooldownMs };
}

/** SKILL_CAST_ACK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeSkillCastAck(body: Uint8Array): SkillCastAckPayload | null {
  const r = bodyReader.reset(body);
  const p = readSkillCastAck(r);
  return r.done() ? p : null;
}

// ── MANA_UPDATE ──

/** MANA_UPDATE 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeManaUpdate(p: ManaUpdatePayload): number {
  checkInt(p.mp, -2147483648, 2147483647, "MANA_UPDATE.mp");
  checkInt(p.mpMax, -2147483648, 2147483647, "MANA_UPDATE.mpMax");
  return 8;
}

/** MANA_UPDATE를 out[off..]에 쓰고 끝 오프셋 — sizeManaUpdate로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeManaUpdate(p: ManaUpdatePayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.mp, o);
  o = out.writeInt32LE(p.mpMax, o);
  return o;
}

/** MANA_UPDATE 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readManaUpdate(r: BodyReader): ManaUpdatePayload | null {
  const $mp = r.i32();
  const $mpMax = r.i32();
  if (r.err !== 0) return null;
  return { mp: $mp, mpMax: $mpMax };
}

/** MANA_UPDATE 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeManaUpdate(body: Uint8Array): ManaUpdatePayload | null {
  const r = bodyReader.reset(body);
  const p = readManaUpdate(r);
  return r.done() ? p : null;
}

// ── SKILL_LEARN ──

/** SKILL_LEARN 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeSkillLearn(p: SkillLearnPayload): number {
  checkInt(p.skillId, -2147483648, 2147483647, "SKILL_LEARN.skillId");
  return 4;
}

/** SKILL_LEARN를 out[off..]에 쓰고 끝 오프셋 — sizeSkillLearn로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeSkillLearn(p: SkillLearnPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.skillId, o);
  return o;
}

/** SKILL_LEARN 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readSkillLearn(r: BodyReader): SkillLearnPayload | null {
  const $skillId = r.i32();
  if (r.err !== 0) return null;
  return { skillId: $skillId };
}

/** SKILL_LEARN 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeSkillLearn(body: Uint8Array): SkillLearnPayload | null {
  const r = bodyReader.reset(body);
  const p = readSkillLearn(r);
  return r.done() ? p : null;
}

// ── SKILL_LEVEL_UP ──

/** SKILL_LEVEL_UP 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeSkillLevelUp(p: SkillLevelUpPayload): number {
  checkInt(p.skillId, -2147483648, 2147483647, "SKILL_LEVEL_UP.skillId");
  return 4;
}

/** SKILL_LEVEL_UP를 out[off..]에 쓰고 끝 오프셋 — sizeSkillLevelUp로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeSkillLevelUp(p: SkillLevelUpPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.skillId, o);
  return o;
}

/** SKILL_LEVEL_UP 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readSkillLevelUp(r: BodyReader): SkillLevelUpPayload | null {
  const $skillId = r.i32();
  if (r.err !== 0) return null;
  return { skillId: $skillId };
}

/** SKILL_LEVEL_UP 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeSkillLevelUp(body: Uint8Array): SkillLevelUpPayload | null {
  const r = bodyReader.reset(body);
  const p = readSkillLevelUp(r);
  return r.done() ? p : null;
}

// ── SKILL_LEARN_ACK ──

/** SKILL_LEARN_ACK 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeSkillLearnAck(p: SkillLearnAckPayload): number {
  checkInt(p.op, -2147483648, 2147483647, "SKILL_LEARN_ACK.op");
  checkInt(p.skillId, -2147483648, 2147483647, "SKILL_LEARN_ACK.skillId");
  checkInt(p.errCode, -2147483648, 2147483647, "SKILL_LEARN_ACK.errCode");
  checkInt(p.newLevel, -2147483648, 2147483647, "SKILL_LEARN_ACK.newLevel");
  checkInt(p.slpAfter, -2147483648, 2147483647, "SKILL_LEARN_ACK.slpAfter");
  return 20;
}

/** SKILL_LEARN_ACK를 out[off..]에 쓰고 끝 오프셋 — sizeSkillLearnAck로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeSkillLearnAck(p: SkillLearnAckPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.op, o);
  o = out.writeInt32LE(p.skillId, o);
  o = out.writeInt32LE(p.errCode, o);
  o = out.writeInt32LE(p.newLevel, o);
  o = out.writeInt32LE(p.slpAfter, o);
  return o;
}

/** SKILL_LEARN_ACK 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readSkillLearnAck(r: BodyReader): SkillLearnAckPayload | null {
  const $op = r.i32();
  const $skillId = r.i32();
  const $errCode = r.i32();
  const $newLevel = r.i32();
  const $slpAfter = r.i32();
  if (r.err !== 0) return null;
  return { op: $op, skillId: $skillId, errCode: $errCode, newLevel: $newLevel, slpAfter: $slpAfter };
}

/** SKILL_LEARN_ACK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeSkillLearnAck(body: Uint8Array): SkillLearnAckPayload | null {
  const r = bodyReader.reset(body);
  const p = readSkillLearnAck(r);
  return r.done() ? p : null;
}

// ── SKILL_LV_UP ──

/** SKILL_LV_UP 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeSkillLvUp(p: SkillLvUpPayload): number {
  checkInt(p.newSlv, -2147483648, 2147483647, "SKILL_LV_UP.newSlv");
  checkInt(p.slpGained, -2147483648, 2147483647, "SKILL_LV_UP.slpGained");
  checkInt(p.slpTotal, -2147483648, 2147483647, "SKILL_LV_UP.slpTotal");
  return 12;
}

/** SKILL_LV_UP를 out[off..]에 쓰고 끝 오프셋 — sizeSkillLvUp로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeSkillLvUp(p: SkillLvUpPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.newSlv, o);
  o = out.writeInt32LE(p.slpGained, o);
  o = out.writeInt32LE(p.slpTotal, o);
  return o;
}

/** SKILL_LV_UP 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readSkillLvUp(r: BodyReader): SkillLvUpPayload | null {
  const $newSlv = r.i32();
  const $slpGained = r.i32();
  const $slpTotal = r.i32();
  if (r.err !== 0) return null;
  return { newSlv: $newSlv, slpGained: $slpGained, slpTotal: $slpTotal };
}

/** SKILL_LV_UP 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeSkillLvUp(body: Uint8Array): SkillLvUpPayload | null {
  const r = bodyReader.reset(body);
  const p = readSkillLvUp(r);
  return r.done() ? p : null;
}

// ── ITEM_USE ──

/** ITEM_USE 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeItemUse(p: ItemUsePayload): number {
  checkInt(p.slot, -2147483648, 2147483647, "ITEM_USE.slot");
  return 4;
}

/** ITEM_USE를 out[off..]에 쓰고 끝 오프셋 — sizeItemUse로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeItemUse(p: ItemUsePayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.slot, o);
  return o;
}

/** ITEM_USE 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readItemUse(r: BodyReader): ItemUsePayload | null {
  const $slot = r.i32();
  if (r.err !== 0) return null;
  return { slot: $slot };
}

/** ITEM_USE 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeItemUse(body: Uint8Array): ItemUsePayload | null {
  const r = bodyReader.reset(body);
  const p = readItemUse(r);
  return r.done() ? p : null;
}

// ── ITEM_EQUIP ──

/** ITEM_EQUIP 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeItemEquip(p: ItemEquipPayload): number {
  checkInt(p.slot, -2147483648, 2147483647, "ITEM_EQUIP.slot");
  return 4;
}

/** ITEM_EQUIP를 out[off..]에 쓰고 끝 오프셋 — sizeItemEquip로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeItemEquip(p: ItemEquipPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.slot, o);
  return o;
}

/** ITEM_EQUIP 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readItemEquip(r: BodyReader): ItemEquipPayload | null {
  const $slot = r.i32();
  if (r.err !== 0) return null;
  return { slot: $slot };
}

/** ITEM_EQUIP 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeItemEquip(body: Uint8Array): ItemEquipPayload | null {
  const r = bodyReader.reset(body);
  const p = readItemEquip(r);
  return r.done() ? p : null;
}

// ── ITEM_UNEQUIP ──

/** ITEM_UNEQUIP 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeItemUnequip(p: ItemUnequipPayload): number {
  checkInt(p.equipSlot, -2147483648, 2147483647, "ITEM_UNEQUIP.equipSlot");
  return 4;
}

/** ITEM_UNEQUIP를 out[off..]에 쓰고 끝 오프셋 — sizeItemUnequip로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeItemUnequip(p: ItemUnequipPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.equipSlot, o);
  return o;
}

/** ITEM_UNEQUIP 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readItemUnequip(r: BodyReader): ItemUnequipPayload | null {
  const $equipSlot = r.i32();
  if (r.err !== 0) return null;
  return { equipSlot: $equipSlot };
}

/** ITEM_UNEQUIP 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeItemUnequip(body: Uint8Array): ItemUnequipPayload | null {
  const r = bodyReader.reset(body);
  const p = readItemUnequip(r);
  return r.done() ? p : null;
}

// ── ITEM_PICKUP ──

/** ITEM_PICKUP 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeItemPickup(p: ItemPickupPayload): number {
  checkInt(p.entityId, -2147483648, 2147483647, "ITEM_PICKUP.entityId");
  return 4;
}

/** ITEM_PICKUP를 out[off..]에 쓰고 끝 오프셋 — sizeItemPickup로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeItemPickup(p: ItemPickupPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.entityId, o);
  return o;
}

/** ITEM_PICKUP 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readItemPickup(r: BodyReader): ItemPickupPayload | null {
  const $entityId = r.i32();
  if (r.err !== 0) return null;
  return { entityId: $entityId };
}

/** ITEM_PICKUP 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeItemPickup(body: Uint8Array): ItemPickupPayload | null {
  const r = bodyReader.reset(body);
  const p = readItemPickup(r);
  return r.done() ? p : null;
}

// ── INVENTORY_LIST ──

/** INVENTORY_LIST 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeInventoryList(p: InventoryListPayload): number {
  let n = 2;
  checkCount(p.slots, 0, 24, "INVENTORY_LIST.slots");
  for (let i = 0; i < p.slots.length; i++) n += sizeInventoryEntry(checkStruct(p.slots[i]!, "INVENTORY_LIST.slots"));
  n += sizeEquipmentSlots(checkStruct(p.equipment, "INVENTORY_LIST.equipment"));
  return n;
}

/** INVENTORY_LIST를 out[off..]에 쓰고 끝 오프셋 — sizeInventoryList로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeInventoryList(p: InventoryListPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeUInt16LE(p.slots.length, o);
  for (let i = 0; i < p.slots.length; i++) o = writeInventoryEntry(p.slots[i]!, out, o);
  o = writeEquipmentSlots(p.equipment, out, o);
  return o;
}

/** INVENTORY_LIST 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readInventoryList(r: BodyReader): InventoryListPayload | null {
  const $slots: InventoryEntry[] = [];
  const $slots$n = r.count(0, 24);
  if (!r.need($slots$n * 12)) return null;
  for (let i = 0; i < $slots$n; i++) {
    const e = readInventoryEntry(r);
    if (e === null) return null;
    $slots.push(e);
  }
  const $equipment = readEquipmentSlots(r);
  if ($equipment === null) return null;
  if (r.err !== 0) return null;
  return { slots: $slots, equipment: $equipment };
}

/** INVENTORY_LIST 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeInventoryList(body: Uint8Array): InventoryListPayload | null {
  const r = bodyReader.reset(body);
  const p = readInventoryList(r);
  return r.done() ? p : null;
}

// ── ITEM_USE_ACK ──

/** ITEM_USE_ACK 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeItemUseAck(p: ItemUseAckPayload): number {
  checkInt(p.slot, -2147483648, 2147483647, "ITEM_USE_ACK.slot");
  checkInt(p.itemId, -2147483648, 2147483647, "ITEM_USE_ACK.itemId");
  checkInt(p.errCode, -2147483648, 2147483647, "ITEM_USE_ACK.errCode");
  checkInt(p.healHp, -2147483648, 2147483647, "ITEM_USE_ACK.healHp");
  checkInt(p.healMp, -2147483648, 2147483647, "ITEM_USE_ACK.healMp");
  return 20;
}

/** ITEM_USE_ACK를 out[off..]에 쓰고 끝 오프셋 — sizeItemUseAck로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeItemUseAck(p: ItemUseAckPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.slot, o);
  o = out.writeInt32LE(p.itemId, o);
  o = out.writeInt32LE(p.errCode, o);
  o = out.writeInt32LE(p.healHp, o);
  o = out.writeInt32LE(p.healMp, o);
  return o;
}

/** ITEM_USE_ACK 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readItemUseAck(r: BodyReader): ItemUseAckPayload | null {
  const $slot = r.i32();
  const $itemId = r.i32();
  const $errCode = r.i32();
  const $healHp = r.i32();
  const $healMp = r.i32();
  if (r.err !== 0) return null;
  return { slot: $slot, itemId: $itemId, errCode: $errCode, healHp: $healHp, healMp: $healMp };
}

/** ITEM_USE_ACK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeItemUseAck(body: Uint8Array): ItemUseAckPayload | null {
  const r = bodyReader.reset(body);
  const p = readItemUseAck(r);
  return r.done() ? p : null;
}

// ── ITEM_PICKUP_ACK ──

/** ITEM_PICKUP_ACK 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeItemPickupAck(p: ItemPickupAckPayload): number {
  checkInt(p.entityId, -2147483648, 2147483647, "ITEM_PICKUP_ACK.entityId");
  checkInt(p.errCode, -2147483648, 2147483647, "ITEM_PICKUP_ACK.errCode");
  return 8;
}

/** ITEM_PICKUP_ACK를 out[off..]에 쓰고 끝 오프셋 — sizeItemPickupAck로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeItemPickupAck(p: ItemPickupAckPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.entityId, o);
  o = out.writeInt32LE(p.errCode, o);
  return o;
}

/** ITEM_PICKUP_ACK 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readItemPickupAck(r: BodyReader): ItemPickupAckPayload | null {
  const $entityId = r.i32();
  const $errCode = r.i32();
  if (r.err !== 0) return null;
  return { entityId: $entityId, errCode: $errCode };
}

/** ITEM_PICKUP_ACK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeItemPickupAck(body: Uint8Array): ItemPickupAckPayload | null {
  const r = bodyReader.reset(body);
  const p = readItemPickupAck(r);
  return r.done() ? p : null;
}

// ── NPC_INTERACT ──

/** NPC_INTERACT 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeNpcInteract(p: NpcInteractPayload): number {
  checkInt(p.entityId, -2147483648, 2147483647, "NPC_INTERACT.entityId");
  return 4;
}

/** NPC_INTERACT를 out[off..]에 쓰고 끝 오프셋 — sizeNpcInteract로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeNpcInteract(p: NpcInteractPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.entityId, o);
  return o;
}

/** NPC_INTERACT 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readNpcInteract(r: BodyReader): NpcInteractPayload | null {
  const $entityId = r.i32();
  if (r.err !== 0) return null;
  return { entityId: $entityId };
}

/** NPC_INTERACT 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeNpcInteract(body: Uint8Array): NpcInteractPayload | null {
  const r = bodyReader.reset(body);
  const p = readNpcInteract(r);
  return r.done() ? p : null;
}

// ── NPC_DIALOG ──

/** NPC_DIALOG 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeNpcDialog(p: NpcDialogPayload): number {
  let n = 14;
  checkInt(p.entityId, -2147483648, 2147483647, "NPC_DIALOG.entityId");
  checkInt(p.npcId, -2147483648, 2147483647, "NPC_DIALOG.npcId");
  n += strSize(p.npcName, 66, "NPC_DIALOG.npcName");
  checkInt(p.dialogueId, -2147483648, 2147483647, "NPC_DIALOG.dialogueId");
  n += strSize(p.entry, 64, "NPC_DIALOG.entry");
  checkCount(p.nodes, 0, 12, "NPC_DIALOG.nodes");
  for (let i = 0; i < p.nodes.length; i++) n += sizeDialogNode(checkStruct(p.nodes[i]!, "NPC_DIALOG.nodes"));
  return n;
}

/** NPC_DIALOG를 out[off..]에 쓰고 끝 오프셋 — sizeNpcDialog로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeNpcDialog(p: NpcDialogPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.entityId, o);
  o = out.writeInt32LE(p.npcId, o);
  o = writeStr(out, o, p.npcName);
  o = out.writeInt32LE(p.dialogueId, o);
  o = writeStr(out, o, p.entry);
  o = out.writeUInt16LE(p.nodes.length, o);
  for (let i = 0; i < p.nodes.length; i++) o = writeDialogNode(p.nodes[i]!, out, o);
  return o;
}

/** NPC_DIALOG 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readNpcDialog(r: BodyReader): NpcDialogPayload | null {
  const $entityId = r.i32();
  const $npcId = r.i32();
  const $npcName = r.str(66);
  const $dialogueId = r.i32();
  const $entry = r.str(64);
  const $nodes: DialogNode[] = [];
  const $nodes$n = r.count(0, 12);
  for (let i = 0; i < $nodes$n; i++) {
    const e = readDialogNode(r);
    if (e === null) return null;
    $nodes.push(e);
  }
  if (r.err !== 0) return null;
  return { entityId: $entityId, npcId: $npcId, npcName: $npcName, dialogueId: $dialogueId, entry: $entry, nodes: $nodes };
}

/** NPC_DIALOG 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeNpcDialog(body: Uint8Array): NpcDialogPayload | null {
  const r = bodyReader.reset(body);
  const p = readNpcDialog(r);
  return r.done() ? p : null;
}

// ── NPC_ACTION ──

/** NPC_ACTION 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeNpcAction(p: NpcActionPayload): number {
  let n = 20;
  checkInt(p.entityId, -2147483648, 2147483647, "NPC_ACTION.entityId");
  checkInt(p.dialogueId, -2147483648, 2147483647, "NPC_ACTION.dialogueId");
  n += strSize(p.nodeId, 64, "NPC_ACTION.nodeId");
  checkInt(p.optionIndex, -2147483648, 2147483647, "NPC_ACTION.optionIndex");
  n += strSize(p.actionType, 32, "NPC_ACTION.actionType");
  checkInt(p.questId, -2147483648, 2147483647, "NPC_ACTION.questId");
  checkInt(p.chosenIndex, -2147483648, 2147483647, "NPC_ACTION.chosenIndex");
  return n;
}

/** NPC_ACTION를 out[off..]에 쓰고 끝 오프셋 — sizeNpcAction로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeNpcAction(p: NpcActionPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.entityId, o);
  o = out.writeInt32LE(p.dialogueId, o);
  o = writeStr(out, o, p.nodeId);
  o = out.writeInt32LE(p.optionIndex, o);
  o = writeStr(out, o, p.actionType);
  o = out.writeInt32LE(p.questId, o);
  o = out.writeInt32LE(p.chosenIndex, o);
  return o;
}

/** NPC_ACTION 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readNpcAction(r: BodyReader): NpcActionPayload | null {
  const $entityId = r.i32();
  const $dialogueId = r.i32();
  const $nodeId = r.str(64);
  const $optionIndex = r.i32();
  const $actionType = r.str(32);
  const $questId = r.i32();
  const $chosenIndex = r.i32();
  if (r.err !== 0) return null;
  return { entityId: $entityId, dialogueId: $dialogueId, nodeId: $nodeId, optionIndex: $optionIndex, actionType: $actionType, questId: $questId, chosenIndex: $chosenIndex };
}

/** NPC_ACTION 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeNpcAction(body: Uint8Array): NpcActionPayload | null {
  const r = bodyReader.reset(body);
  const p = readNpcAction(r);
  return r.done() ? p : null;
}

// ── QUEST_LIST ──

/** QUEST_LIST 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeQuestList(p: QuestListPayload): number {
  let n = 6;
  checkCount(p.active, 0, 20, "QUEST_LIST.active");
  for (let i = 0; i < p.active.length; i++) n += sizeQuestLogEntry(checkStruct(p.active[i]!, "QUEST_LIST.active"));
  checkCount(p.completed, 0, 1024, "QUEST_LIST.completed");
  for (let i = 0; i < p.completed.length; i++) checkInt(p.completed[i]!, -2147483648, 2147483647, "QUEST_LIST.completed");
  n += p.completed.length * 4;
  checkCount(p.dailyDoneToday, 0, 1024, "QUEST_LIST.dailyDoneToday");
  for (let i = 0; i < p.dailyDoneToday.length; i++) checkInt(p.dailyDoneToday[i]!, -2147483648, 2147483647, "QUEST_LIST.dailyDoneToday");
  n += p.dailyDoneToday.length * 4;
  return n;
}

/** QUEST_LIST를 out[off..]에 쓰고 끝 오프셋 — sizeQuestList로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeQuestList(p: QuestListPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeUInt16LE(p.active.length, o);
  for (let i = 0; i < p.active.length; i++) o = writeQuestLogEntry(p.active[i]!, out, o);
  o = out.writeUInt16LE(p.completed.length, o);
  for (let i = 0; i < p.completed.length; i++) o = out.writeInt32LE(p.completed[i]!, o);
  o = out.writeUInt16LE(p.dailyDoneToday.length, o);
  for (let i = 0; i < p.dailyDoneToday.length; i++) o = out.writeInt32LE(p.dailyDoneToday[i]!, o);
  return o;
}

/** QUEST_LIST 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readQuestList(r: BodyReader): QuestListPayload | null {
  const $active: QuestLogEntry[] = [];
  const $active$n = r.count(0, 20);
  for (let i = 0; i < $active$n; i++) {
    const e = readQuestLogEntry(r);
    if (e === null) return null;
    $active.push(e);
  }
  const $completed: number[] = [];
  const $completed$n = r.count(0, 1024);
  if (!r.need($completed$n * 4)) return null;
  for (let i = 0; i < $completed$n; i++) {
    $completed.push(r.i32());
    if (r.err !== 0) return null;
  }
  const $dailyDoneToday: number[] = [];
  const $dailyDoneToday$n = r.count(0, 1024);
  if (!r.need($dailyDoneToday$n * 4)) return null;
  for (let i = 0; i < $dailyDoneToday$n; i++) {
    $dailyDoneToday.push(r.i32());
    if (r.err !== 0) return null;
  }
  if (r.err !== 0) return null;
  return { active: $active, completed: $completed, dailyDoneToday: $dailyDoneToday };
}

/** QUEST_LIST 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeQuestList(body: Uint8Array): QuestListPayload | null {
  const r = bodyReader.reset(body);
  const p = readQuestList(r);
  return r.done() ? p : null;
}

// ── QUEST_PROGRESS ──

/** QUEST_PROGRESS 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeQuestProgress(p: QuestProgressPayload): number {
  checkInt(p.questId, -2147483648, 2147483647, "QUEST_PROGRESS.questId");
  checkInt(p.objectiveIndex, -2147483648, 2147483647, "QUEST_PROGRESS.objectiveIndex");
  checkInt(p.current, -2147483648, 2147483647, "QUEST_PROGRESS.current");
  checkInt(p.required, -2147483648, 2147483647, "QUEST_PROGRESS.required");
  checkBool(p.questCompletable, "QUEST_PROGRESS.questCompletable");
  return 17;
}

/** QUEST_PROGRESS를 out[off..]에 쓰고 끝 오프셋 — sizeQuestProgress로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeQuestProgress(p: QuestProgressPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.questId, o);
  o = out.writeInt32LE(p.objectiveIndex, o);
  o = out.writeInt32LE(p.current, o);
  o = out.writeInt32LE(p.required, o);
  o = out.writeUInt8(p.questCompletable ? 1 : 0, o);
  return o;
}

/** QUEST_PROGRESS 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readQuestProgress(r: BodyReader): QuestProgressPayload | null {
  const $questId = r.i32();
  const $objectiveIndex = r.i32();
  const $current = r.i32();
  const $required = r.i32();
  const $questCompletable = r.bool();
  if (r.err !== 0) return null;
  return { questId: $questId, objectiveIndex: $objectiveIndex, current: $current, required: $required, questCompletable: $questCompletable };
}

/** QUEST_PROGRESS 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeQuestProgress(body: Uint8Array): QuestProgressPayload | null {
  const r = bodyReader.reset(body);
  const p = readQuestProgress(r);
  return r.done() ? p : null;
}

// ── QUEST_ACTION_ACK ──

/** QUEST_ACTION_ACK 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeQuestActionAck(p: QuestActionAckPayload): number {
  let n = 13;
  checkInt(p.op, -2147483648, 2147483647, "QUEST_ACTION_ACK.op");
  checkInt(p.questId, -2147483648, 2147483647, "QUEST_ACTION_ACK.questId");
  checkInt(p.errCode, -2147483648, 2147483647, "QUEST_ACTION_ACK.errCode");
  if (p.rewards !== undefined) {
    n += sizeQuestGrantSummary(checkStruct(p.rewards, "QUEST_ACTION_ACK.rewards"));
  }
  return n;
}

/** QUEST_ACTION_ACK를 out[off..]에 쓰고 끝 오프셋 — sizeQuestActionAck로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeQuestActionAck(p: QuestActionAckPayload, out: Buffer, off: number): number {
  let o = off;
  let pm = 0;
  if (p.rewards !== undefined) pm |= 1 << 0;
  o = out.writeUInt8((pm >>> 0) & 0xff, o);
  o = out.writeInt32LE(p.op, o);
  o = out.writeInt32LE(p.questId, o);
  o = out.writeInt32LE(p.errCode, o);
  if (p.rewards !== undefined) {
    o = writeQuestGrantSummary(p.rewards, out, o);
  }
  return o;
}

/** QUEST_ACTION_ACK 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readQuestActionAck(r: BodyReader): QuestActionAckPayload | null {
  const pm = r.presence(1, 1);
  const $op = r.i32();
  const $questId = r.i32();
  const $errCode = r.i32();
  let $rewards: QuestGrantSummary | undefined;
  if ((pm & (1 << 0)) !== 0) {
    const s = readQuestGrantSummary(r);
    if (s === null) return null;
    $rewards = s;
  }
  if (r.err !== 0) return null;
  const v: QuestActionAckPayload = { op: $op, questId: $questId, errCode: $errCode };
  if ($rewards !== undefined) v.rewards = $rewards;
  return v;
}

/** QUEST_ACTION_ACK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeQuestActionAck(body: Uint8Array): QuestActionAckPayload | null {
  const r = bodyReader.reset(body);
  const p = readQuestActionAck(r);
  return r.done() ? p : null;
}

// ── QUEST_ABANDON ──

/** QUEST_ABANDON 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeQuestAbandon(p: QuestAbandonPayload): number {
  checkInt(p.questId, -2147483648, 2147483647, "QUEST_ABANDON.questId");
  return 4;
}

/** QUEST_ABANDON를 out[off..]에 쓰고 끝 오프셋 — sizeQuestAbandon로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeQuestAbandon(p: QuestAbandonPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.questId, o);
  return o;
}

/** QUEST_ABANDON 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readQuestAbandon(r: BodyReader): QuestAbandonPayload | null {
  const $questId = r.i32();
  if (r.err !== 0) return null;
  return { questId: $questId };
}

/** QUEST_ABANDON 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeQuestAbandon(body: Uint8Array): QuestAbandonPayload | null {
  const r = bodyReader.reset(body);
  const p = readQuestAbandon(r);
  return r.done() ? p : null;
}

// ── QUEST_NPC_MARKERS ──

/** QUEST_NPC_MARKERS 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeQuestNpcMarkers(p: QuestNpcMarkersPayload): number {
  let n = 2;
  checkCount(p.npcs, 0, 1024, "QUEST_NPC_MARKERS.npcs");
  for (let i = 0; i < p.npcs.length; i++) n += sizeNpcQuestMarker(checkStruct(p.npcs[i]!, "QUEST_NPC_MARKERS.npcs"));
  return n;
}

/** QUEST_NPC_MARKERS를 out[off..]에 쓰고 끝 오프셋 — sizeQuestNpcMarkers로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeQuestNpcMarkers(p: QuestNpcMarkersPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeUInt16LE(p.npcs.length, o);
  for (let i = 0; i < p.npcs.length; i++) o = writeNpcQuestMarker(p.npcs[i]!, out, o);
  return o;
}

/** QUEST_NPC_MARKERS 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readQuestNpcMarkers(r: BodyReader): QuestNpcMarkersPayload | null {
  const $npcs: NpcQuestMarker[] = [];
  const $npcs$n = r.count(0, 1024);
  if (!r.need($npcs$n * 8)) return null;
  for (let i = 0; i < $npcs$n; i++) {
    const e = readNpcQuestMarker(r);
    if (e === null) return null;
    $npcs.push(e);
  }
  if (r.err !== 0) return null;
  return { npcs: $npcs };
}

/** QUEST_NPC_MARKERS 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeQuestNpcMarkers(body: Uint8Array): QuestNpcMarkersPayload | null {
  const r = bodyReader.reset(body);
  const p = readQuestNpcMarkers(r);
  return r.done() ? p : null;
}

// ── SHOP_LIST ──

/** SHOP_LIST 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeShopList(p: ShopListPayload): number {
  let n = 10;
  checkInt(p.entityId, -2147483648, 2147483647, "SHOP_LIST.entityId");
  checkInt(p.shopId, -2147483648, 2147483647, "SHOP_LIST.shopId");
  n += strSize(p.name, 240, "SHOP_LIST.name");
  checkCount(p.offers, 0, 256, "SHOP_LIST.offers");
  for (let i = 0; i < p.offers.length; i++) n += sizeShopOffer(checkStruct(p.offers[i]!, "SHOP_LIST.offers"));
  return n;
}

/** SHOP_LIST를 out[off..]에 쓰고 끝 오프셋 — sizeShopList로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeShopList(p: ShopListPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.entityId, o);
  o = out.writeInt32LE(p.shopId, o);
  o = writeStr(out, o, p.name);
  o = out.writeUInt16LE(p.offers.length, o);
  for (let i = 0; i < p.offers.length; i++) o = writeShopOffer(p.offers[i]!, out, o);
  return o;
}

/** SHOP_LIST 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readShopList(r: BodyReader): ShopListPayload | null {
  const $entityId = r.i32();
  const $shopId = r.i32();
  const $name = r.str(240);
  const $offers: ShopOffer[] = [];
  const $offers$n = r.count(0, 256);
  if (!r.need($offers$n * 12)) return null;
  for (let i = 0; i < $offers$n; i++) {
    const e = readShopOffer(r);
    if (e === null) return null;
    $offers.push(e);
  }
  if (r.err !== 0) return null;
  return { entityId: $entityId, shopId: $shopId, name: $name, offers: $offers };
}

/** SHOP_LIST 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeShopList(body: Uint8Array): ShopListPayload | null {
  const r = bodyReader.reset(body);
  const p = readShopList(r);
  return r.done() ? p : null;
}

// ── SHOP_BUY ──

/** SHOP_BUY 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeShopBuy(p: ShopBuyPayload): number {
  checkInt(p.entityId, -2147483648, 2147483647, "SHOP_BUY.entityId");
  checkInt(p.shopId, -2147483648, 2147483647, "SHOP_BUY.shopId");
  checkInt(p.itemId, -2147483648, 2147483647, "SHOP_BUY.itemId");
  checkInt(p.qty, -2147483648, 2147483647, "SHOP_BUY.qty");
  checkInt(p.requestId, -2147483648, 2147483647, "SHOP_BUY.requestId");
  return 20;
}

/** SHOP_BUY를 out[off..]에 쓰고 끝 오프셋 — sizeShopBuy로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeShopBuy(p: ShopBuyPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.entityId, o);
  o = out.writeInt32LE(p.shopId, o);
  o = out.writeInt32LE(p.itemId, o);
  o = out.writeInt32LE(p.qty, o);
  o = out.writeInt32LE(p.requestId, o);
  return o;
}

/** SHOP_BUY 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readShopBuy(r: BodyReader): ShopBuyPayload | null {
  const $entityId = r.i32();
  const $shopId = r.i32();
  const $itemId = r.i32();
  const $qty = r.i32();
  const $requestId = r.i32();
  if (r.err !== 0) return null;
  return { entityId: $entityId, shopId: $shopId, itemId: $itemId, qty: $qty, requestId: $requestId };
}

/** SHOP_BUY 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeShopBuy(body: Uint8Array): ShopBuyPayload | null {
  const r = bodyReader.reset(body);
  const p = readShopBuy(r);
  return r.done() ? p : null;
}

// ── SHOP_SELL ──

/** SHOP_SELL 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeShopSell(p: ShopSellPayload): number {
  checkInt(p.entityId, -2147483648, 2147483647, "SHOP_SELL.entityId");
  checkInt(p.shopId, -2147483648, 2147483647, "SHOP_SELL.shopId");
  checkInt(p.itemId, -2147483648, 2147483647, "SHOP_SELL.itemId");
  checkInt(p.slot, -2147483648, 2147483647, "SHOP_SELL.slot");
  checkInt(p.qty, -2147483648, 2147483647, "SHOP_SELL.qty");
  checkInt(p.requestId, -2147483648, 2147483647, "SHOP_SELL.requestId");
  return 24;
}

/** SHOP_SELL를 out[off..]에 쓰고 끝 오프셋 — sizeShopSell로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeShopSell(p: ShopSellPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.entityId, o);
  o = out.writeInt32LE(p.shopId, o);
  o = out.writeInt32LE(p.itemId, o);
  o = out.writeInt32LE(p.slot, o);
  o = out.writeInt32LE(p.qty, o);
  o = out.writeInt32LE(p.requestId, o);
  return o;
}

/** SHOP_SELL 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readShopSell(r: BodyReader): ShopSellPayload | null {
  const $entityId = r.i32();
  const $shopId = r.i32();
  const $itemId = r.i32();
  const $slot = r.i32();
  const $qty = r.i32();
  const $requestId = r.i32();
  if (r.err !== 0) return null;
  return { entityId: $entityId, shopId: $shopId, itemId: $itemId, slot: $slot, qty: $qty, requestId: $requestId };
}

/** SHOP_SELL 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeShopSell(body: Uint8Array): ShopSellPayload | null {
  const r = bodyReader.reset(body);
  const p = readShopSell(r);
  return r.done() ? p : null;
}

// ── SHOP_ACK ──

/** SHOP_ACK 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeShopAck(p: ShopAckPayload): number {
  checkInt(p.requestId, -2147483648, 2147483647, "SHOP_ACK.requestId");
  checkInt(p.op, -2147483648, 2147483647, "SHOP_ACK.op");
  checkInt(p.errCode, -2147483648, 2147483647, "SHOP_ACK.errCode");
  checkInt(p.gold, -2147483648, 2147483647, "SHOP_ACK.gold");
  return 16;
}

/** SHOP_ACK를 out[off..]에 쓰고 끝 오프셋 — sizeShopAck로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeShopAck(p: ShopAckPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.requestId, o);
  o = out.writeInt32LE(p.op, o);
  o = out.writeInt32LE(p.errCode, o);
  o = out.writeInt32LE(p.gold, o);
  return o;
}

/** SHOP_ACK 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readShopAck(r: BodyReader): ShopAckPayload | null {
  const $requestId = r.i32();
  const $op = r.i32();
  const $errCode = r.i32();
  const $gold = r.i32();
  if (r.err !== 0) return null;
  return { requestId: $requestId, op: $op, errCode: $errCode, gold: $gold };
}

/** SHOP_ACK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeShopAck(body: Uint8Array): ShopAckPayload | null {
  const r = bodyReader.reset(body);
  const p = readShopAck(r);
  return r.done() ? p : null;
}

// ── UI_PREFERENCES_SET ──

/** UI_PREFERENCES_SET 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeUiPreferencesSet(p: UiPreferencesSetPayload): number {
  let n = 1;
  if (p.quickSlots !== undefined) {
    checkCount(p.quickSlots, 6, 6, "UI_PREFERENCES_SET.quickSlots");
    for (let i = 0; i < p.quickSlots.length; i++) checkInt(p.quickSlots[i]!, -2147483648, 2147483647, "UI_PREFERENCES_SET.quickSlots");
    n += p.quickSlots.length * 4;
    n += 2;
  }
  if (p.trackedQuestIds !== undefined) {
    checkCount(p.trackedQuestIds, 0, 5, "UI_PREFERENCES_SET.trackedQuestIds");
    for (let i = 0; i < p.trackedQuestIds.length; i++) checkInt(p.trackedQuestIds[i]!, -2147483648, 2147483647, "UI_PREFERENCES_SET.trackedQuestIds");
    n += p.trackedQuestIds.length * 4;
    n += 2;
  }
  return n;
}

/** UI_PREFERENCES_SET를 out[off..]에 쓰고 끝 오프셋 — sizeUiPreferencesSet로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeUiPreferencesSet(p: UiPreferencesSetPayload, out: Buffer, off: number): number {
  let o = off;
  let pm = 0;
  if (p.quickSlots !== undefined) pm |= 1 << 0;
  if (p.trackedQuestIds !== undefined) pm |= 1 << 1;
  o = out.writeUInt8((pm >>> 0) & 0xff, o);
  if (p.quickSlots !== undefined) {
    o = out.writeUInt16LE(p.quickSlots.length, o);
    for (let i = 0; i < p.quickSlots.length; i++) o = out.writeInt32LE(p.quickSlots[i]!, o);
  }
  if (p.trackedQuestIds !== undefined) {
    o = out.writeUInt16LE(p.trackedQuestIds.length, o);
    for (let i = 0; i < p.trackedQuestIds.length; i++) o = out.writeInt32LE(p.trackedQuestIds[i]!, o);
  }
  return o;
}

/** UI_PREFERENCES_SET 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readUiPreferencesSet(r: BodyReader): UiPreferencesSetPayload | null {
  const pm = r.presence(1, 2);
  let $quickSlots: number[] | undefined;
  if ((pm & (1 << 0)) !== 0) {
    const a: number[] = [];
    const c = r.count(6, 6);
    if (!r.need(c * 4)) return null;
    for (let i = 0; i < c; i++) {
      a.push(r.i32());
      if (r.err !== 0) return null;
    }
    $quickSlots = a;
  }
  let $trackedQuestIds: number[] | undefined;
  if ((pm & (1 << 1)) !== 0) {
    const a: number[] = [];
    const c = r.count(0, 5);
    if (!r.need(c * 4)) return null;
    for (let i = 0; i < c; i++) {
      a.push(r.i32());
      if (r.err !== 0) return null;
    }
    $trackedQuestIds = a;
  }
  if (r.err !== 0) return null;
  const v: UiPreferencesSetPayload = {};
  if ($quickSlots !== undefined) v.quickSlots = $quickSlots;
  if ($trackedQuestIds !== undefined) v.trackedQuestIds = $trackedQuestIds;
  return v;
}

/** UI_PREFERENCES_SET 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeUiPreferencesSet(body: Uint8Array): UiPreferencesSetPayload | null {
  const r = bodyReader.reset(body);
  const p = readUiPreferencesSet(r);
  return r.done() ? p : null;
}

// ── UI_PREFERENCES ──

/** UI_PREFERENCES 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeUiPreferences(p: UiPreferencesPayload): number {
  let n = 5;
  checkCount(p.quickSlots, 6, 6, "UI_PREFERENCES.quickSlots");
  for (let i = 0; i < p.quickSlots.length; i++) checkInt(p.quickSlots[i]!, -2147483648, 2147483647, "UI_PREFERENCES.quickSlots");
  n += p.quickSlots.length * 4;
  checkCount(p.trackedQuestIds, 0, 5, "UI_PREFERENCES.trackedQuestIds");
  for (let i = 0; i < p.trackedQuestIds.length; i++) checkInt(p.trackedQuestIds[i]!, -2147483648, 2147483647, "UI_PREFERENCES.trackedQuestIds");
  n += p.trackedQuestIds.length * 4;
  checkBool(p.hasSavedSettings, "UI_PREFERENCES.hasSavedSettings");
  return n;
}

/** UI_PREFERENCES를 out[off..]에 쓰고 끝 오프셋 — sizeUiPreferences로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeUiPreferences(p: UiPreferencesPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeUInt16LE(p.quickSlots.length, o);
  for (let i = 0; i < p.quickSlots.length; i++) o = out.writeInt32LE(p.quickSlots[i]!, o);
  o = out.writeUInt16LE(p.trackedQuestIds.length, o);
  for (let i = 0; i < p.trackedQuestIds.length; i++) o = out.writeInt32LE(p.trackedQuestIds[i]!, o);
  o = out.writeUInt8(p.hasSavedSettings ? 1 : 0, o);
  return o;
}

/** UI_PREFERENCES 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readUiPreferences(r: BodyReader): UiPreferencesPayload | null {
  const $quickSlots: number[] = [];
  const $quickSlots$n = r.count(6, 6);
  if (!r.need($quickSlots$n * 4)) return null;
  for (let i = 0; i < $quickSlots$n; i++) {
    $quickSlots.push(r.i32());
    if (r.err !== 0) return null;
  }
  const $trackedQuestIds: number[] = [];
  const $trackedQuestIds$n = r.count(0, 5);
  if (!r.need($trackedQuestIds$n * 4)) return null;
  for (let i = 0; i < $trackedQuestIds$n; i++) {
    $trackedQuestIds.push(r.i32());
    if (r.err !== 0) return null;
  }
  const $hasSavedSettings = r.bool();
  if (r.err !== 0) return null;
  return { quickSlots: $quickSlots, trackedQuestIds: $trackedQuestIds, hasSavedSettings: $hasSavedSettings };
}

/** UI_PREFERENCES 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeUiPreferences(body: Uint8Array): UiPreferencesPayload | null {
  const r = bodyReader.reset(body);
  const p = readUiPreferences(r);
  return r.done() ? p : null;
}

// ── GATHER_START ──

/** GATHER_START 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeGatherStart(p: GatherStartPayload): number {
  checkInt(p.nodeEid, -2147483648, 2147483647, "GATHER_START.nodeEid");
  return 4;
}

/** GATHER_START를 out[off..]에 쓰고 끝 오프셋 — sizeGatherStart로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeGatherStart(p: GatherStartPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.nodeEid, o);
  return o;
}

/** GATHER_START 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readGatherStart(r: BodyReader): GatherStartPayload | null {
  const $nodeEid = r.i32();
  if (r.err !== 0) return null;
  return { nodeEid: $nodeEid };
}

/** GATHER_START 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeGatherStart(body: Uint8Array): GatherStartPayload | null {
  const r = bodyReader.reset(body);
  const p = readGatherStart(r);
  return r.done() ? p : null;
}

// ── LIFE_CANCEL ──

/** LIFE_CANCEL 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeLifeCancel(_p: LifeCancelPayload): number {
  return 0;
}

/** LIFE_CANCEL를 out[off..]에 쓰고 끝 오프셋 — sizeLifeCancel로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeLifeCancel(_p: LifeCancelPayload, _out: Buffer, off: number): number {
  return off;
}

/** LIFE_CANCEL 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readLifeCancel(r: BodyReader): LifeCancelPayload | null {
  if (r.err !== 0) return null;
  return {};
}

/** LIFE_CANCEL 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeLifeCancel(body: Uint8Array): LifeCancelPayload | null {
  const r = bodyReader.reset(body);
  const p = readLifeCancel(r);
  return r.done() ? p : null;
}

// ── LIFE_CHANNEL ──

/** LIFE_CHANNEL 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeLifeChannel(p: LifeChannelPayload): number {
  checkInt(p.channelId, -2147483648, 2147483647, "LIFE_CHANNEL.channelId");
  checkEnum(LIFE_CHANNEL_KIND_CODE, p.kind, "LIFE_CHANNEL.kind");
  checkInt(p.targetEid, -2147483648, 2147483647, "LIFE_CHANNEL.targetEid");
  checkInt(p.durationMs, -2147483648, 2147483647, "LIFE_CHANNEL.durationMs");
  checkInt(p.requestId, -2147483648, 2147483647, "LIFE_CHANNEL.requestId");
  checkInt(p.code, 0, 255, "LIFE_CHANNEL.code");
  return 18;
}

/** LIFE_CHANNEL를 out[off..]에 쓰고 끝 오프셋 — sizeLifeChannel로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeLifeChannel(p: LifeChannelPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.channelId, o);
  o = out.writeUInt8(LIFE_CHANNEL_KIND_CODE[p.kind], o);
  o = out.writeInt32LE(p.targetEid, o);
  o = out.writeInt32LE(p.durationMs, o);
  o = out.writeInt32LE(p.requestId, o);
  o = out.writeUInt8(p.code, o);
  return o;
}

/** LIFE_CHANNEL 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readLifeChannel(r: BodyReader): LifeChannelPayload | null {
  const $channelId = r.i32();
  const $kind = readLifeChannelKind(r);
  const $targetEid = r.i32();
  const $durationMs = r.i32();
  const $requestId = r.i32();
  const $code = r.u8();
  if (r.err !== 0) return null;
  return { channelId: $channelId, kind: $kind, targetEid: $targetEid, durationMs: $durationMs, requestId: $requestId, code: $code };
}

/** LIFE_CHANNEL 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeLifeChannel(body: Uint8Array): LifeChannelPayload | null {
  const r = bodyReader.reset(body);
  const p = readLifeChannel(r);
  return r.done() ? p : null;
}

// ── LIFE_RESULT ──

/** LIFE_RESULT 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeLifeResult(p: LifeResultPayload): number {
  let n = 12;
  checkInt(p.channelId, -2147483648, 2147483647, "LIFE_RESULT.channelId");
  checkInt(p.code, 0, 255, "LIFE_RESULT.code");
  checkCount(p.items, 0, 8, "LIFE_RESULT.items");
  for (let i = 0; i < p.items.length; i++) n += sizeRewardPreviewItem(checkStruct(p.items[i]!, "LIFE_RESULT.items"));
  checkEnum(LIFE_LINE_CODE, p.line, "LIFE_RESULT.line");
  checkInt(p.profGain, -2147483648, 2147483647, "LIFE_RESULT.profGain");
  return n;
}

/** LIFE_RESULT를 out[off..]에 쓰고 끝 오프셋 — sizeLifeResult로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeLifeResult(p: LifeResultPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.channelId, o);
  o = out.writeUInt8(p.code, o);
  o = out.writeUInt16LE(p.items.length, o);
  for (let i = 0; i < p.items.length; i++) o = writeRewardPreviewItem(p.items[i]!, out, o);
  o = out.writeUInt8(LIFE_LINE_CODE[p.line], o);
  o = out.writeInt32LE(p.profGain, o);
  return o;
}

/** LIFE_RESULT 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readLifeResult(r: BodyReader): LifeResultPayload | null {
  const $channelId = r.i32();
  const $code = r.u8();
  const $items: RewardPreviewItem[] = [];
  const $items$n = r.count(0, 8);
  if (!r.need($items$n * 8)) return null;
  for (let i = 0; i < $items$n; i++) {
    const e = readRewardPreviewItem(r);
    if (e === null) return null;
    $items.push(e);
  }
  const $line = readLifeLine(r);
  const $profGain = r.i32();
  if (r.err !== 0) return null;
  return { channelId: $channelId, code: $code, items: $items, line: $line, profGain: $profGain };
}

/** LIFE_RESULT 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeLifeResult(body: Uint8Array): LifeResultPayload | null {
  const r = bodyReader.reset(body);
  const p = readLifeResult(r);
  return r.done() ? p : null;
}

// ── LIFE_STATUS ──

/** LIFE_STATUS 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeLifeStatus(p: LifeStatusPayload): number {
  let n = 14;
  checkInt(p.labor, -2147483648, 2147483647, "LIFE_STATUS.labor");
  checkInt(p.laborMax, -2147483648, 2147483647, "LIFE_STATUS.laborMax");
  checkInt(p.msToNext, -2147483648, 2147483647, "LIFE_STATUS.msToNext");
  checkCount(p.lines, 0, 7, "LIFE_STATUS.lines");
  for (let i = 0; i < p.lines.length; i++) n += sizeLifeLineInfo(checkStruct(p.lines[i]!, "LIFE_STATUS.lines"));
  return n;
}

/** LIFE_STATUS를 out[off..]에 쓰고 끝 오프셋 — sizeLifeStatus로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeLifeStatus(p: LifeStatusPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.labor, o);
  o = out.writeInt32LE(p.laborMax, o);
  o = out.writeInt32LE(p.msToNext, o);
  o = out.writeUInt16LE(p.lines.length, o);
  for (let i = 0; i < p.lines.length; i++) o = writeLifeLineInfo(p.lines[i]!, out, o);
  return o;
}

/** LIFE_STATUS 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readLifeStatus(r: BodyReader): LifeStatusPayload | null {
  const $labor = r.i32();
  const $laborMax = r.i32();
  const $msToNext = r.i32();
  const $lines: LifeLineInfo[] = [];
  const $lines$n = r.count(0, 7);
  if (!r.need($lines$n * 10)) return null;
  for (let i = 0; i < $lines$n; i++) {
    const e = readLifeLineInfo(r);
    if (e === null) return null;
    $lines.push(e);
  }
  if (r.err !== 0) return null;
  return { labor: $labor, laborMax: $laborMax, msToNext: $msToNext, lines: $lines };
}

/** LIFE_STATUS 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeLifeStatus(body: Uint8Array): LifeStatusPayload | null {
  const r = bodyReader.reset(body);
  const p = readLifeStatus(r);
  return r.done() ? p : null;
}

// ── NODE_CATALOG ──

/** NODE_CATALOG 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeNodeCatalog(p: NodeCatalogPayload): number {
  let n = 2;
  checkCount(p.nodes, 0, 64, "NODE_CATALOG.nodes");
  for (let i = 0; i < p.nodes.length; i++) n += sizeNodeDefInfo(checkStruct(p.nodes[i]!, "NODE_CATALOG.nodes"));
  return n;
}

/** NODE_CATALOG를 out[off..]에 쓰고 끝 오프셋 — sizeNodeCatalog로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeNodeCatalog(p: NodeCatalogPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeUInt16LE(p.nodes.length, o);
  for (let i = 0; i < p.nodes.length; i++) o = writeNodeDefInfo(p.nodes[i]!, out, o);
  return o;
}

/** NODE_CATALOG 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readNodeCatalog(r: BodyReader): NodeCatalogPayload | null {
  const $nodes: NodeDefInfo[] = [];
  const $nodes$n = r.count(0, 64);
  if (!r.need($nodes$n * 11)) return null;
  for (let i = 0; i < $nodes$n; i++) {
    const e = readNodeDefInfo(r);
    if (e === null) return null;
    $nodes.push(e);
  }
  if (r.err !== 0) return null;
  return { nodes: $nodes };
}

/** NODE_CATALOG 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeNodeCatalog(body: Uint8Array): NodeCatalogPayload | null {
  const r = bodyReader.reset(body);
  const p = readNodeCatalog(r);
  return r.done() ? p : null;
}

// ── GATHER_PUZZLE ──

/** GATHER_PUZZLE 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeGatherPuzzle(p: GatherPuzzlePayload): number {
  let n = 22;
  checkInt(p.channelId, -2147483648, 2147483647, "GATHER_PUZZLE.channelId");
  checkEnum(GATHER_PUZZLE_KIND_CODE, p.kind, "GATHER_PUZZLE.kind");
  checkInt(p.boardW, 0, 65535, "GATHER_PUZZLE.boardW");
  checkInt(p.boardH, 0, 65535, "GATHER_PUZZLE.boardH");
  checkInt(p.readyMs, 0, 65535, "GATHER_PUZZLE.readyMs");
  checkInt(p.cycleMs, 0, 65535, "GATHER_PUZZLE.cycleMs");
  checkInt(p.maxCycles, 0, 255, "GATHER_PUZZLE.maxCycles");
  checkInt(p.bandHeight, 0, 65535, "GATHER_PUZZLE.bandHeight");
  checkInt(p.pathWidth, 0, 65535, "GATHER_PUZZLE.pathWidth");
  checkInt(p.circleRadius, 0, 65535, "GATHER_PUZZLE.circleRadius");
  checkCount(p.points, 0, 12, "GATHER_PUZZLE.points");
  for (let i = 0; i < p.points.length; i++) n += sizePuzzlePoint(checkStruct(p.points[i]!, "GATHER_PUZZLE.points"));
  return n;
}

/** GATHER_PUZZLE를 out[off..]에 쓰고 끝 오프셋 — sizeGatherPuzzle로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeGatherPuzzle(p: GatherPuzzlePayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.channelId, o);
  o = out.writeUInt8(GATHER_PUZZLE_KIND_CODE[p.kind], o);
  o = out.writeUInt16LE(p.boardW, o);
  o = out.writeUInt16LE(p.boardH, o);
  o = out.writeUInt16LE(p.readyMs, o);
  o = out.writeUInt16LE(p.cycleMs, o);
  o = out.writeUInt8(p.maxCycles, o);
  o = out.writeUInt16LE(p.bandHeight, o);
  o = out.writeUInt16LE(p.pathWidth, o);
  o = out.writeUInt16LE(p.circleRadius, o);
  o = out.writeUInt16LE(p.points.length, o);
  for (let i = 0; i < p.points.length; i++) o = writePuzzlePoint(p.points[i]!, out, o);
  return o;
}

/** GATHER_PUZZLE 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readGatherPuzzle(r: BodyReader): GatherPuzzlePayload | null {
  const $channelId = r.i32();
  const $kind = readGatherPuzzleKind(r);
  const $boardW = r.u16();
  const $boardH = r.u16();
  const $readyMs = r.u16();
  const $cycleMs = r.u16();
  const $maxCycles = r.u8();
  const $bandHeight = r.u16();
  const $pathWidth = r.u16();
  const $circleRadius = r.u16();
  const $points: PuzzlePoint[] = [];
  const $points$n = r.count(0, 12);
  if (!r.need($points$n * 4)) return null;
  for (let i = 0; i < $points$n; i++) {
    const e = readPuzzlePoint(r);
    if (e === null) return null;
    $points.push(e);
  }
  if (r.err !== 0) return null;
  return { channelId: $channelId, kind: $kind, boardW: $boardW, boardH: $boardH, readyMs: $readyMs, cycleMs: $cycleMs, maxCycles: $maxCycles, bandHeight: $bandHeight, pathWidth: $pathWidth, circleRadius: $circleRadius, points: $points };
}

/** GATHER_PUZZLE 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeGatherPuzzle(body: Uint8Array): GatherPuzzlePayload | null {
  const r = bodyReader.reset(body);
  const p = readGatherPuzzle(r);
  return r.done() ? p : null;
}

// ── GATHER_TRACE ──

/** GATHER_TRACE 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeGatherTrace(p: GatherTracePayload): number {
  let n = 10;
  checkInt(p.channelId, -2147483648, 2147483647, "GATHER_TRACE.channelId");
  checkInt(p.cycle, 0, 255, "GATHER_TRACE.cycle");
  checkInt(p.pressMs, 0, 65535, "GATHER_TRACE.pressMs");
  checkInt(p.tailMs, 0, 255, "GATHER_TRACE.tailMs");
  checkCount(p.samples, 0, 160, "GATHER_TRACE.samples");
  for (let i = 0; i < p.samples.length; i++) n += sizePuzzlePoint(checkStruct(p.samples[i]!, "GATHER_TRACE.samples"));
  return n;
}

/** GATHER_TRACE를 out[off..]에 쓰고 끝 오프셋 — sizeGatherTrace로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeGatherTrace(p: GatherTracePayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.channelId, o);
  o = out.writeUInt8(p.cycle, o);
  o = out.writeUInt16LE(p.pressMs, o);
  o = out.writeUInt8(p.tailMs, o);
  o = out.writeUInt16LE(p.samples.length, o);
  for (let i = 0; i < p.samples.length; i++) o = writePuzzlePoint(p.samples[i]!, out, o);
  return o;
}

/** GATHER_TRACE 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readGatherTrace(r: BodyReader): GatherTracePayload | null {
  const $channelId = r.i32();
  const $cycle = r.u8();
  const $pressMs = r.u16();
  const $tailMs = r.u8();
  const $samples: PuzzlePoint[] = [];
  const $samples$n = r.count(0, 160);
  if (!r.need($samples$n * 4)) return null;
  for (let i = 0; i < $samples$n; i++) {
    const e = readPuzzlePoint(r);
    if (e === null) return null;
    $samples.push(e);
  }
  if (r.err !== 0) return null;
  return { channelId: $channelId, cycle: $cycle, pressMs: $pressMs, tailMs: $tailMs, samples: $samples };
}

/** GATHER_TRACE 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeGatherTrace(body: Uint8Array): GatherTracePayload | null {
  const r = bodyReader.reset(body);
  const p = readGatherTrace(r);
  return r.done() ? p : null;
}

// ── GATHER_TAPS ──

/** GATHER_TAPS 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeGatherTaps(p: GatherTapsPayload): number {
  let n = 6;
  checkInt(p.channelId, -2147483648, 2147483647, "GATHER_TAPS.channelId");
  checkCount(p.taps, 0, 16, "GATHER_TAPS.taps");
  for (let i = 0; i < p.taps.length; i++) n += sizePuzzleTap(checkStruct(p.taps[i]!, "GATHER_TAPS.taps"));
  return n;
}

/** GATHER_TAPS를 out[off..]에 쓰고 끝 오프셋 — sizeGatherTaps로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeGatherTaps(p: GatherTapsPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.channelId, o);
  o = out.writeUInt16LE(p.taps.length, o);
  for (let i = 0; i < p.taps.length; i++) o = writePuzzleTap(p.taps[i]!, out, o);
  return o;
}

/** GATHER_TAPS 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readGatherTaps(r: BodyReader): GatherTapsPayload | null {
  const $channelId = r.i32();
  const $taps: PuzzleTap[] = [];
  const $taps$n = r.count(0, 16);
  if (!r.need($taps$n * 7)) return null;
  for (let i = 0; i < $taps$n; i++) {
    const e = readPuzzleTap(r);
    if (e === null) return null;
    $taps.push(e);
  }
  if (r.err !== 0) return null;
  return { channelId: $channelId, taps: $taps };
}

/** GATHER_TAPS 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeGatherTaps(body: Uint8Array): GatherTapsPayload | null {
  const r = bodyReader.reset(body);
  const p = readGatherTaps(r);
  return r.done() ? p : null;
}

// ── RECIPE_LIST ──

/** RECIPE_LIST 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeRecipeList(p: RecipeListPayload): number {
  let n = 10;
  checkInt(p.npcEid, -2147483648, 2147483647, "RECIPE_LIST.npcEid");
  checkInt(p.stationId, -2147483648, 2147483647, "RECIPE_LIST.stationId");
  n += strSize(p.name, 64, "RECIPE_LIST.name");
  checkCount(p.recipes, 0, 128, "RECIPE_LIST.recipes");
  for (let i = 0; i < p.recipes.length; i++) n += sizeRecipeInfo(checkStruct(p.recipes[i]!, "RECIPE_LIST.recipes"));
  return n;
}

/** RECIPE_LIST를 out[off..]에 쓰고 끝 오프셋 — sizeRecipeList로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeRecipeList(p: RecipeListPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.npcEid, o);
  o = out.writeInt32LE(p.stationId, o);
  o = writeStr(out, o, p.name);
  o = out.writeUInt16LE(p.recipes.length, o);
  for (let i = 0; i < p.recipes.length; i++) o = writeRecipeInfo(p.recipes[i]!, out, o);
  return o;
}

/** RECIPE_LIST 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readRecipeList(r: BodyReader): RecipeListPayload | null {
  const $npcEid = r.i32();
  const $stationId = r.i32();
  const $name = r.str(64);
  const $recipes: RecipeInfo[] = [];
  const $recipes$n = r.count(0, 128);
  for (let i = 0; i < $recipes$n; i++) {
    const e = readRecipeInfo(r);
    if (e === null) return null;
    $recipes.push(e);
  }
  if (r.err !== 0) return null;
  return { npcEid: $npcEid, stationId: $stationId, name: $name, recipes: $recipes };
}

/** RECIPE_LIST 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeRecipeList(body: Uint8Array): RecipeListPayload | null {
  const r = bodyReader.reset(body);
  const p = readRecipeList(r);
  return r.done() ? p : null;
}

// ── CRAFT_REQ ──

/** CRAFT_REQ 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeCraftReq(p: CraftReqPayload): number {
  checkInt(p.npcEid, -2147483648, 2147483647, "CRAFT_REQ.npcEid");
  checkInt(p.recipeId, -2147483648, 2147483647, "CRAFT_REQ.recipeId");
  checkInt(p.count, -2147483648, 2147483647, "CRAFT_REQ.count");
  checkInt(p.requestId, -2147483648, 2147483647, "CRAFT_REQ.requestId");
  return 16;
}

/** CRAFT_REQ를 out[off..]에 쓰고 끝 오프셋 — sizeCraftReq로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeCraftReq(p: CraftReqPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.npcEid, o);
  o = out.writeInt32LE(p.recipeId, o);
  o = out.writeInt32LE(p.count, o);
  o = out.writeInt32LE(p.requestId, o);
  return o;
}

/** CRAFT_REQ 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readCraftReq(r: BodyReader): CraftReqPayload | null {
  const $npcEid = r.i32();
  const $recipeId = r.i32();
  const $count = r.i32();
  const $requestId = r.i32();
  if (r.err !== 0) return null;
  return { npcEid: $npcEid, recipeId: $recipeId, count: $count, requestId: $requestId };
}

/** CRAFT_REQ 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeCraftReq(body: Uint8Array): CraftReqPayload | null {
  const r = bodyReader.reset(body);
  const p = readCraftReq(r);
  return r.done() ? p : null;
}

// ── CRAFT_ACK ──

/** CRAFT_ACK 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeCraftAck(p: CraftAckPayload): number {
  checkInt(p.requestId, -2147483648, 2147483647, "CRAFT_ACK.requestId");
  checkInt(p.errCode, 0, 255, "CRAFT_ACK.errCode");
  checkInt(p.made, -2147483648, 2147483647, "CRAFT_ACK.made");
  checkInt(p.greats, -2147483648, 2147483647, "CRAFT_ACK.greats");
  checkInt(p.gold, -2147483648, 2147483647, "CRAFT_ACK.gold");
  checkInt(p.outputItemId, -2147483648, 2147483647, "CRAFT_ACK.outputItemId");
  return 21;
}

/** CRAFT_ACK를 out[off..]에 쓰고 끝 오프셋 — sizeCraftAck로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeCraftAck(p: CraftAckPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.requestId, o);
  o = out.writeUInt8(p.errCode, o);
  o = out.writeInt32LE(p.made, o);
  o = out.writeInt32LE(p.greats, o);
  o = out.writeInt32LE(p.gold, o);
  o = out.writeInt32LE(p.outputItemId, o);
  return o;
}

/** CRAFT_ACK 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readCraftAck(r: BodyReader): CraftAckPayload | null {
  const $requestId = r.i32();
  const $errCode = r.u8();
  const $made = r.i32();
  const $greats = r.i32();
  const $gold = r.i32();
  const $outputItemId = r.i32();
  if (r.err !== 0) return null;
  return { requestId: $requestId, errCode: $errCode, made: $made, greats: $greats, gold: $gold, outputItemId: $outputItemId };
}

/** CRAFT_ACK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeCraftAck(body: Uint8Array): CraftAckPayload | null {
  const r = bodyReader.reset(body);
  const p = readCraftAck(r);
  return r.done() ? p : null;
}

// ── PING ──

/** PING 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizePing(p: PingPayload): number {
  checkF64(p.clientTimeMs, "PING.clientTimeMs");
  return 8;
}

/** PING를 out[off..]에 쓰고 끝 오프셋 — sizePing로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writePing(p: PingPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeDoubleLE(p.clientTimeMs, o);
  return o;
}

/** PING 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readPing(r: BodyReader): PingPayload | null {
  const $clientTimeMs = r.f64();
  if (r.err !== 0) return null;
  return { clientTimeMs: $clientTimeMs };
}

/** PING 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodePing(body: Uint8Array): PingPayload | null {
  const r = bodyReader.reset(body);
  const p = readPing(r);
  return r.done() ? p : null;
}

// ── PONG ──

/** PONG 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizePong(p: PongPayload): number {
  checkF64(p.clientTimeMs, "PONG.clientTimeMs");
  checkF64(p.serverTimeMs, "PONG.serverTimeMs");
  return 16;
}

/** PONG를 out[off..]에 쓰고 끝 오프셋 — sizePong로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writePong(p: PongPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeDoubleLE(p.clientTimeMs, o);
  o = out.writeDoubleLE(p.serverTimeMs, o);
  return o;
}

/** PONG 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readPong(r: BodyReader): PongPayload | null {
  const $clientTimeMs = r.f64();
  const $serverTimeMs = r.f64();
  if (r.err !== 0) return null;
  return { clientTimeMs: $clientTimeMs, serverTimeMs: $serverTimeMs };
}

/** PONG 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodePong(body: Uint8Array): PongPayload | null {
  const r = bodyReader.reset(body);
  const p = readPong(r);
  return r.done() ? p : null;
}

// ── KICK ──

/** KICK 인코딩 크기 — 범위·정수성·유한·enum·max/min 검사(위반 = WireEncodeError). */
export function sizeKick(p: KickPayload): number {
  let n = 4;
  checkInt(p.reason, -2147483648, 2147483647, "KICK.reason");
  n += strSize(p.detail, 600, "KICK.detail");
  return n;
}

/** KICK를 out[off..]에 쓰고 끝 오프셋 — sizeKick로 검사·공간 확보가 끝난 값만(던지지 않는다). */
export function writeKick(p: KickPayload, out: Buffer, off: number): number {
  let o = off;
  o = out.writeInt32LE(p.reason, o);
  o = writeStr(out, o, p.detail);
  return o;
}

/** KICK 판독 — 위반이면 null(사유는 r.err, 첫 위반 우선). */
export function readKick(r: BodyReader): KickPayload | null {
  const $reason = r.i32();
  const $detail = r.str(600);
  if (r.err !== 0) return null;
  return { reason: $reason, detail: $detail };
}

/** KICK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 lastDecodeError(). */
export function decodeKick(body: Uint8Array): KickPayload | null {
  const r = bodyReader.reset(body);
  const p = readKick(r);
  return r.done() ? p : null;
}

/** 본문 크기(검사 포함 — 위반·스키마 밖 id = WireEncodeError). */
export function bodySize(id: number, p: object): number {
  switch (id) {
    case PACKET_ID.HELLO:
      return sizeHello(p as HelloPayload);
    case PACKET_ID.HELLO_ACK:
      return sizeHelloAck(p as HelloAckPayload);
    case PACKET_ID.AUTH_REQ:
      return sizeAuthReq(p as AuthReqPayload);
    case PACKET_ID.AUTH_RESULT:
      return sizeAuthResult(p as AuthResultPayload);
    case PACKET_ID.CHAR_LIST_REQ:
      return sizeCharListReq(p as CharListReqPayload);
    case PACKET_ID.CHAR_LIST:
      return sizeCharList(p as CharListPayload);
    case PACKET_ID.ENTER_WORLD_REQ:
      return sizeEnterWorldReq(p as EnterWorldReqPayload);
    case PACKET_ID.ENTER_WORLD_OK:
      return sizeEnterWorldOk(p as EnterWorldOkPayload);
    case PACKET_ID.ZONE_INFO:
      return sizeZoneInfo(p as ZoneInfoPayload);
    case PACKET_ID.CHAR_CREATE_REQ:
      return sizeCharCreateReq(p as CharCreateReqPayload);
    case PACKET_ID.CHAR_CREATE_RESULT:
      return sizeCharCreateResult(p as CharCreateResultPayload);
    case PACKET_ID.ZONE_CHANGE_REQ:
      return sizeZoneChangeReq(p as ZoneChangeReqPayload);
    case PACKET_ID.ZONE_CHANGE:
      return sizeZoneChange(p as ZoneChangePayload);
    case PACKET_ID.PORTAL_LIST:
      return sizePortalList(p as PortalListPayload);
    case PACKET_ID.INPUT_CMD:
      return sizeInputCmd(p as InputCmdPayload);
    case PACKET_ID.SNAPSHOT_DELTA:
      return sizeSnapshotDelta(p as SnapshotDeltaPayload);
    case PACKET_ID.ENTITY_SPAWN:
      return sizeEntitySpawn(p as EntitySpawnPayload);
    case PACKET_ID.ENTITY_DESPAWN:
      return sizeEntityDespawn(p as EntityDespawnPayload);
    case PACKET_ID.MOVE_TO:
      return sizeMoveTo(p as MoveToPayload);
    case PACKET_ID.ENTITY_META:
      return sizeEntityMeta(p as EntityMetaPayload);
    case PACKET_ID.MOVE_PATH:
      return sizeMovePath(p as MovePathPayload);
    case PACKET_ID.MOVE_STOP:
      return sizeMoveStop(p as MoveStopPayload);
    case PACKET_ID.CHAT_SAY:
      return sizeChatSay(p as ChatSayPayload);
    case PACKET_ID.CHAT_BCAST:
      return sizeChatBcast(p as ChatBcastPayload);
    case PACKET_ID.CREATE_CHARACTER_V2:
      return sizeCreateCharacterV2(p as CreateCharacterV2Payload);
    case PACKET_ID.CHAR_STATS_FULL:
      return sizeCharStatsFull(p as CharStatsFullPayload);
    case PACKET_ID.CHAR_LEVEL_UP:
      return sizeCharLevelUp(p as CharLevelUpPayload);
    case PACKET_ID.CHAR_EXP_GAIN:
      return sizeCharExpGain(p as CharExpGainPayload);
    case PACKET_ID.GOLD_UPDATE:
      return sizeGoldUpdate(p as GoldUpdatePayload);
    case PACKET_ID.STAT_ALLOCATE:
      return sizeStatAllocate(p as StatAllocatePayload);
    case PACKET_ID.STAT_RESET:
      return sizeStatReset(p as StatResetPayload);
    case PACKET_ID.STAT_POINTS_ACK:
      return sizeStatPointsAck(p as StatPointsAckPayload);
    case PACKET_ID.TARGET_SELECT:
      return sizeTargetSelect(p as TargetSelectPayload);
    case PACKET_ID.TARGET_ACK:
      return sizeTargetAck(p as TargetAckPayload);
    case PACKET_ID.ATTACK_START:
      return sizeAttackStart(p as AttackStartPayload);
    case PACKET_ID.ATTACK_STOP:
      return sizeAttackStop(p as AttackStopPayload);
    case PACKET_ID.DAMAGE_EVENT:
      return sizeDamageEvent(p as DamageEventPayload);
    case PACKET_ID.DEATH_NOTIFY:
      return sizeDeathNotify(p as DeathNotifyPayload);
    case PACKET_ID.RESPAWN_REQ:
      return sizeRespawnReq(p as RespawnReqPayload);
    case PACKET_ID.RESPAWN_OK:
      return sizeRespawnOk(p as RespawnOkPayload);
    case PACKET_ID.SKILL_CAST:
      return sizeSkillCast(p as SkillCastPayload);
    case PACKET_ID.SKILL_LIST:
      return sizeSkillList(p as SkillListPayload);
    case PACKET_ID.SKILL_EFFECT:
      return sizeSkillEffect(p as SkillEffectPayload);
    case PACKET_ID.SKILL_CAST_ACK:
      return sizeSkillCastAck(p as SkillCastAckPayload);
    case PACKET_ID.MANA_UPDATE:
      return sizeManaUpdate(p as ManaUpdatePayload);
    case PACKET_ID.SKILL_LEARN:
      return sizeSkillLearn(p as SkillLearnPayload);
    case PACKET_ID.SKILL_LEVEL_UP:
      return sizeSkillLevelUp(p as SkillLevelUpPayload);
    case PACKET_ID.SKILL_LEARN_ACK:
      return sizeSkillLearnAck(p as SkillLearnAckPayload);
    case PACKET_ID.SKILL_LV_UP:
      return sizeSkillLvUp(p as SkillLvUpPayload);
    case PACKET_ID.ITEM_USE:
      return sizeItemUse(p as ItemUsePayload);
    case PACKET_ID.ITEM_EQUIP:
      return sizeItemEquip(p as ItemEquipPayload);
    case PACKET_ID.ITEM_UNEQUIP:
      return sizeItemUnequip(p as ItemUnequipPayload);
    case PACKET_ID.ITEM_PICKUP:
      return sizeItemPickup(p as ItemPickupPayload);
    case PACKET_ID.INVENTORY_LIST:
    case PACKET_ID.INVENTORY_UPDATE:
      return sizeInventoryList(p as InventoryListPayload);
    case PACKET_ID.ITEM_USE_ACK:
      return sizeItemUseAck(p as ItemUseAckPayload);
    case PACKET_ID.ITEM_PICKUP_ACK:
      return sizeItemPickupAck(p as ItemPickupAckPayload);
    case PACKET_ID.NPC_INTERACT:
      return sizeNpcInteract(p as NpcInteractPayload);
    case PACKET_ID.NPC_DIALOG:
      return sizeNpcDialog(p as NpcDialogPayload);
    case PACKET_ID.NPC_ACTION:
      return sizeNpcAction(p as NpcActionPayload);
    case PACKET_ID.QUEST_LIST:
      return sizeQuestList(p as QuestListPayload);
    case PACKET_ID.QUEST_PROGRESS:
      return sizeQuestProgress(p as QuestProgressPayload);
    case PACKET_ID.QUEST_ACTION_ACK:
      return sizeQuestActionAck(p as QuestActionAckPayload);
    case PACKET_ID.QUEST_ABANDON:
      return sizeQuestAbandon(p as QuestAbandonPayload);
    case PACKET_ID.QUEST_NPC_MARKERS:
      return sizeQuestNpcMarkers(p as QuestNpcMarkersPayload);
    case PACKET_ID.SHOP_LIST:
      return sizeShopList(p as ShopListPayload);
    case PACKET_ID.SHOP_BUY:
      return sizeShopBuy(p as ShopBuyPayload);
    case PACKET_ID.SHOP_SELL:
      return sizeShopSell(p as ShopSellPayload);
    case PACKET_ID.SHOP_ACK:
      return sizeShopAck(p as ShopAckPayload);
    case PACKET_ID.UI_PREFERENCES_SET:
      return sizeUiPreferencesSet(p as UiPreferencesSetPayload);
    case PACKET_ID.UI_PREFERENCES:
      return sizeUiPreferences(p as UiPreferencesPayload);
    case PACKET_ID.GATHER_START:
      return sizeGatherStart(p as GatherStartPayload);
    case PACKET_ID.LIFE_CANCEL:
      return sizeLifeCancel(p as LifeCancelPayload);
    case PACKET_ID.LIFE_CHANNEL:
      return sizeLifeChannel(p as LifeChannelPayload);
    case PACKET_ID.LIFE_RESULT:
      return sizeLifeResult(p as LifeResultPayload);
    case PACKET_ID.LIFE_STATUS:
      return sizeLifeStatus(p as LifeStatusPayload);
    case PACKET_ID.NODE_CATALOG:
      return sizeNodeCatalog(p as NodeCatalogPayload);
    case PACKET_ID.GATHER_PUZZLE:
      return sizeGatherPuzzle(p as GatherPuzzlePayload);
    case PACKET_ID.GATHER_TRACE:
      return sizeGatherTrace(p as GatherTracePayload);
    case PACKET_ID.GATHER_TAPS:
      return sizeGatherTaps(p as GatherTapsPayload);
    case PACKET_ID.RECIPE_LIST:
      return sizeRecipeList(p as RecipeListPayload);
    case PACKET_ID.CRAFT_REQ:
      return sizeCraftReq(p as CraftReqPayload);
    case PACKET_ID.CRAFT_ACK:
      return sizeCraftAck(p as CraftAckPayload);
    case PACKET_ID.PING:
      return sizePing(p as PingPayload);
    case PACKET_ID.PONG:
      return sizePong(p as PongPayload);
    case PACKET_ID.KICK:
      return sizeKick(p as KickPayload);
    default:
      throw new WireEncodeError(`packet 0x${id.toString(16)}`, "unknown packet");
  }
}

/** out[off..]에 본문을 쓰고 끝 오프셋(bodySize로 검사·공간 확보가 끝난 값만). */
export function writeBody(id: number, p: object, out: Buffer, off: number): number {
  switch (id) {
    case PACKET_ID.HELLO:
      return writeHello(p as HelloPayload, out, off);
    case PACKET_ID.HELLO_ACK:
      return writeHelloAck(p as HelloAckPayload, out, off);
    case PACKET_ID.AUTH_REQ:
      return writeAuthReq(p as AuthReqPayload, out, off);
    case PACKET_ID.AUTH_RESULT:
      return writeAuthResult(p as AuthResultPayload, out, off);
    case PACKET_ID.CHAR_LIST_REQ:
      return writeCharListReq(p as CharListReqPayload, out, off);
    case PACKET_ID.CHAR_LIST:
      return writeCharList(p as CharListPayload, out, off);
    case PACKET_ID.ENTER_WORLD_REQ:
      return writeEnterWorldReq(p as EnterWorldReqPayload, out, off);
    case PACKET_ID.ENTER_WORLD_OK:
      return writeEnterWorldOk(p as EnterWorldOkPayload, out, off);
    case PACKET_ID.ZONE_INFO:
      return writeZoneInfo(p as ZoneInfoPayload, out, off);
    case PACKET_ID.CHAR_CREATE_REQ:
      return writeCharCreateReq(p as CharCreateReqPayload, out, off);
    case PACKET_ID.CHAR_CREATE_RESULT:
      return writeCharCreateResult(p as CharCreateResultPayload, out, off);
    case PACKET_ID.ZONE_CHANGE_REQ:
      return writeZoneChangeReq(p as ZoneChangeReqPayload, out, off);
    case PACKET_ID.ZONE_CHANGE:
      return writeZoneChange(p as ZoneChangePayload, out, off);
    case PACKET_ID.PORTAL_LIST:
      return writePortalList(p as PortalListPayload, out, off);
    case PACKET_ID.INPUT_CMD:
      return writeInputCmd(p as InputCmdPayload, out, off);
    case PACKET_ID.SNAPSHOT_DELTA:
      return writeSnapshotDelta(p as SnapshotDeltaPayload, out, off);
    case PACKET_ID.ENTITY_SPAWN:
      return writeEntitySpawn(p as EntitySpawnPayload, out, off);
    case PACKET_ID.ENTITY_DESPAWN:
      return writeEntityDespawn(p as EntityDespawnPayload, out, off);
    case PACKET_ID.MOVE_TO:
      return writeMoveTo(p as MoveToPayload, out, off);
    case PACKET_ID.ENTITY_META:
      return writeEntityMeta(p as EntityMetaPayload, out, off);
    case PACKET_ID.MOVE_PATH:
      return writeMovePath(p as MovePathPayload, out, off);
    case PACKET_ID.MOVE_STOP:
      return writeMoveStop(p as MoveStopPayload, out, off);
    case PACKET_ID.CHAT_SAY:
      return writeChatSay(p as ChatSayPayload, out, off);
    case PACKET_ID.CHAT_BCAST:
      return writeChatBcast(p as ChatBcastPayload, out, off);
    case PACKET_ID.CREATE_CHARACTER_V2:
      return writeCreateCharacterV2(p as CreateCharacterV2Payload, out, off);
    case PACKET_ID.CHAR_STATS_FULL:
      return writeCharStatsFull(p as CharStatsFullPayload, out, off);
    case PACKET_ID.CHAR_LEVEL_UP:
      return writeCharLevelUp(p as CharLevelUpPayload, out, off);
    case PACKET_ID.CHAR_EXP_GAIN:
      return writeCharExpGain(p as CharExpGainPayload, out, off);
    case PACKET_ID.GOLD_UPDATE:
      return writeGoldUpdate(p as GoldUpdatePayload, out, off);
    case PACKET_ID.STAT_ALLOCATE:
      return writeStatAllocate(p as StatAllocatePayload, out, off);
    case PACKET_ID.STAT_RESET:
      return writeStatReset(p as StatResetPayload, out, off);
    case PACKET_ID.STAT_POINTS_ACK:
      return writeStatPointsAck(p as StatPointsAckPayload, out, off);
    case PACKET_ID.TARGET_SELECT:
      return writeTargetSelect(p as TargetSelectPayload, out, off);
    case PACKET_ID.TARGET_ACK:
      return writeTargetAck(p as TargetAckPayload, out, off);
    case PACKET_ID.ATTACK_START:
      return writeAttackStart(p as AttackStartPayload, out, off);
    case PACKET_ID.ATTACK_STOP:
      return writeAttackStop(p as AttackStopPayload, out, off);
    case PACKET_ID.DAMAGE_EVENT:
      return writeDamageEvent(p as DamageEventPayload, out, off);
    case PACKET_ID.DEATH_NOTIFY:
      return writeDeathNotify(p as DeathNotifyPayload, out, off);
    case PACKET_ID.RESPAWN_REQ:
      return writeRespawnReq(p as RespawnReqPayload, out, off);
    case PACKET_ID.RESPAWN_OK:
      return writeRespawnOk(p as RespawnOkPayload, out, off);
    case PACKET_ID.SKILL_CAST:
      return writeSkillCast(p as SkillCastPayload, out, off);
    case PACKET_ID.SKILL_LIST:
      return writeSkillList(p as SkillListPayload, out, off);
    case PACKET_ID.SKILL_EFFECT:
      return writeSkillEffect(p as SkillEffectPayload, out, off);
    case PACKET_ID.SKILL_CAST_ACK:
      return writeSkillCastAck(p as SkillCastAckPayload, out, off);
    case PACKET_ID.MANA_UPDATE:
      return writeManaUpdate(p as ManaUpdatePayload, out, off);
    case PACKET_ID.SKILL_LEARN:
      return writeSkillLearn(p as SkillLearnPayload, out, off);
    case PACKET_ID.SKILL_LEVEL_UP:
      return writeSkillLevelUp(p as SkillLevelUpPayload, out, off);
    case PACKET_ID.SKILL_LEARN_ACK:
      return writeSkillLearnAck(p as SkillLearnAckPayload, out, off);
    case PACKET_ID.SKILL_LV_UP:
      return writeSkillLvUp(p as SkillLvUpPayload, out, off);
    case PACKET_ID.ITEM_USE:
      return writeItemUse(p as ItemUsePayload, out, off);
    case PACKET_ID.ITEM_EQUIP:
      return writeItemEquip(p as ItemEquipPayload, out, off);
    case PACKET_ID.ITEM_UNEQUIP:
      return writeItemUnequip(p as ItemUnequipPayload, out, off);
    case PACKET_ID.ITEM_PICKUP:
      return writeItemPickup(p as ItemPickupPayload, out, off);
    case PACKET_ID.INVENTORY_LIST:
    case PACKET_ID.INVENTORY_UPDATE:
      return writeInventoryList(p as InventoryListPayload, out, off);
    case PACKET_ID.ITEM_USE_ACK:
      return writeItemUseAck(p as ItemUseAckPayload, out, off);
    case PACKET_ID.ITEM_PICKUP_ACK:
      return writeItemPickupAck(p as ItemPickupAckPayload, out, off);
    case PACKET_ID.NPC_INTERACT:
      return writeNpcInteract(p as NpcInteractPayload, out, off);
    case PACKET_ID.NPC_DIALOG:
      return writeNpcDialog(p as NpcDialogPayload, out, off);
    case PACKET_ID.NPC_ACTION:
      return writeNpcAction(p as NpcActionPayload, out, off);
    case PACKET_ID.QUEST_LIST:
      return writeQuestList(p as QuestListPayload, out, off);
    case PACKET_ID.QUEST_PROGRESS:
      return writeQuestProgress(p as QuestProgressPayload, out, off);
    case PACKET_ID.QUEST_ACTION_ACK:
      return writeQuestActionAck(p as QuestActionAckPayload, out, off);
    case PACKET_ID.QUEST_ABANDON:
      return writeQuestAbandon(p as QuestAbandonPayload, out, off);
    case PACKET_ID.QUEST_NPC_MARKERS:
      return writeQuestNpcMarkers(p as QuestNpcMarkersPayload, out, off);
    case PACKET_ID.SHOP_LIST:
      return writeShopList(p as ShopListPayload, out, off);
    case PACKET_ID.SHOP_BUY:
      return writeShopBuy(p as ShopBuyPayload, out, off);
    case PACKET_ID.SHOP_SELL:
      return writeShopSell(p as ShopSellPayload, out, off);
    case PACKET_ID.SHOP_ACK:
      return writeShopAck(p as ShopAckPayload, out, off);
    case PACKET_ID.UI_PREFERENCES_SET:
      return writeUiPreferencesSet(p as UiPreferencesSetPayload, out, off);
    case PACKET_ID.UI_PREFERENCES:
      return writeUiPreferences(p as UiPreferencesPayload, out, off);
    case PACKET_ID.GATHER_START:
      return writeGatherStart(p as GatherStartPayload, out, off);
    case PACKET_ID.LIFE_CANCEL:
      return writeLifeCancel(p as LifeCancelPayload, out, off);
    case PACKET_ID.LIFE_CHANNEL:
      return writeLifeChannel(p as LifeChannelPayload, out, off);
    case PACKET_ID.LIFE_RESULT:
      return writeLifeResult(p as LifeResultPayload, out, off);
    case PACKET_ID.LIFE_STATUS:
      return writeLifeStatus(p as LifeStatusPayload, out, off);
    case PACKET_ID.NODE_CATALOG:
      return writeNodeCatalog(p as NodeCatalogPayload, out, off);
    case PACKET_ID.GATHER_PUZZLE:
      return writeGatherPuzzle(p as GatherPuzzlePayload, out, off);
    case PACKET_ID.GATHER_TRACE:
      return writeGatherTrace(p as GatherTracePayload, out, off);
    case PACKET_ID.GATHER_TAPS:
      return writeGatherTaps(p as GatherTapsPayload, out, off);
    case PACKET_ID.RECIPE_LIST:
      return writeRecipeList(p as RecipeListPayload, out, off);
    case PACKET_ID.CRAFT_REQ:
      return writeCraftReq(p as CraftReqPayload, out, off);
    case PACKET_ID.CRAFT_ACK:
      return writeCraftAck(p as CraftAckPayload, out, off);
    case PACKET_ID.PING:
      return writePing(p as PingPayload, out, off);
    case PACKET_ID.PONG:
      return writePong(p as PongPayload, out, off);
    case PACKET_ID.KICK:
      return writeKick(p as KickPayload, out, off);
    default:
      throw new WireEncodeError(`packet 0x${id.toString(16)}`, "unknown packet");
  }
}

/** 본문 디코드 — 실패는 null(사유는 lastDecodeError()). 스키마 밖 id도 null이지만 reader를 건드리지 않는다 — lastDecodeError()는 직전 디코드 값 그대로라 판정에 못 쓴다(호출자가 PACKET_DIRECTION으로 먼저 본다). */
export function decodeBody(id: number, body: Uint8Array): object | null {
  switch (id) {
    case PACKET_ID.HELLO:
      return decodeHello(body);
    case PACKET_ID.HELLO_ACK:
      return decodeHelloAck(body);
    case PACKET_ID.AUTH_REQ:
      return decodeAuthReq(body);
    case PACKET_ID.AUTH_RESULT:
      return decodeAuthResult(body);
    case PACKET_ID.CHAR_LIST_REQ:
      return decodeCharListReq(body);
    case PACKET_ID.CHAR_LIST:
      return decodeCharList(body);
    case PACKET_ID.ENTER_WORLD_REQ:
      return decodeEnterWorldReq(body);
    case PACKET_ID.ENTER_WORLD_OK:
      return decodeEnterWorldOk(body);
    case PACKET_ID.ZONE_INFO:
      return decodeZoneInfo(body);
    case PACKET_ID.CHAR_CREATE_REQ:
      return decodeCharCreateReq(body);
    case PACKET_ID.CHAR_CREATE_RESULT:
      return decodeCharCreateResult(body);
    case PACKET_ID.ZONE_CHANGE_REQ:
      return decodeZoneChangeReq(body);
    case PACKET_ID.ZONE_CHANGE:
      return decodeZoneChange(body);
    case PACKET_ID.PORTAL_LIST:
      return decodePortalList(body);
    case PACKET_ID.INPUT_CMD:
      return decodeInputCmd(body);
    case PACKET_ID.SNAPSHOT_DELTA:
      return decodeSnapshotDelta(body);
    case PACKET_ID.ENTITY_SPAWN:
      return decodeEntitySpawn(body);
    case PACKET_ID.ENTITY_DESPAWN:
      return decodeEntityDespawn(body);
    case PACKET_ID.MOVE_TO:
      return decodeMoveTo(body);
    case PACKET_ID.ENTITY_META:
      return decodeEntityMeta(body);
    case PACKET_ID.MOVE_PATH:
      return decodeMovePath(body);
    case PACKET_ID.MOVE_STOP:
      return decodeMoveStop(body);
    case PACKET_ID.CHAT_SAY:
      return decodeChatSay(body);
    case PACKET_ID.CHAT_BCAST:
      return decodeChatBcast(body);
    case PACKET_ID.CREATE_CHARACTER_V2:
      return decodeCreateCharacterV2(body);
    case PACKET_ID.CHAR_STATS_FULL:
      return decodeCharStatsFull(body);
    case PACKET_ID.CHAR_LEVEL_UP:
      return decodeCharLevelUp(body);
    case PACKET_ID.CHAR_EXP_GAIN:
      return decodeCharExpGain(body);
    case PACKET_ID.GOLD_UPDATE:
      return decodeGoldUpdate(body);
    case PACKET_ID.STAT_ALLOCATE:
      return decodeStatAllocate(body);
    case PACKET_ID.STAT_RESET:
      return decodeStatReset(body);
    case PACKET_ID.STAT_POINTS_ACK:
      return decodeStatPointsAck(body);
    case PACKET_ID.TARGET_SELECT:
      return decodeTargetSelect(body);
    case PACKET_ID.TARGET_ACK:
      return decodeTargetAck(body);
    case PACKET_ID.ATTACK_START:
      return decodeAttackStart(body);
    case PACKET_ID.ATTACK_STOP:
      return decodeAttackStop(body);
    case PACKET_ID.DAMAGE_EVENT:
      return decodeDamageEvent(body);
    case PACKET_ID.DEATH_NOTIFY:
      return decodeDeathNotify(body);
    case PACKET_ID.RESPAWN_REQ:
      return decodeRespawnReq(body);
    case PACKET_ID.RESPAWN_OK:
      return decodeRespawnOk(body);
    case PACKET_ID.SKILL_CAST:
      return decodeSkillCast(body);
    case PACKET_ID.SKILL_LIST:
      return decodeSkillList(body);
    case PACKET_ID.SKILL_EFFECT:
      return decodeSkillEffect(body);
    case PACKET_ID.SKILL_CAST_ACK:
      return decodeSkillCastAck(body);
    case PACKET_ID.MANA_UPDATE:
      return decodeManaUpdate(body);
    case PACKET_ID.SKILL_LEARN:
      return decodeSkillLearn(body);
    case PACKET_ID.SKILL_LEVEL_UP:
      return decodeSkillLevelUp(body);
    case PACKET_ID.SKILL_LEARN_ACK:
      return decodeSkillLearnAck(body);
    case PACKET_ID.SKILL_LV_UP:
      return decodeSkillLvUp(body);
    case PACKET_ID.ITEM_USE:
      return decodeItemUse(body);
    case PACKET_ID.ITEM_EQUIP:
      return decodeItemEquip(body);
    case PACKET_ID.ITEM_UNEQUIP:
      return decodeItemUnequip(body);
    case PACKET_ID.ITEM_PICKUP:
      return decodeItemPickup(body);
    case PACKET_ID.INVENTORY_LIST:
    case PACKET_ID.INVENTORY_UPDATE:
      return decodeInventoryList(body);
    case PACKET_ID.ITEM_USE_ACK:
      return decodeItemUseAck(body);
    case PACKET_ID.ITEM_PICKUP_ACK:
      return decodeItemPickupAck(body);
    case PACKET_ID.NPC_INTERACT:
      return decodeNpcInteract(body);
    case PACKET_ID.NPC_DIALOG:
      return decodeNpcDialog(body);
    case PACKET_ID.NPC_ACTION:
      return decodeNpcAction(body);
    case PACKET_ID.QUEST_LIST:
      return decodeQuestList(body);
    case PACKET_ID.QUEST_PROGRESS:
      return decodeQuestProgress(body);
    case PACKET_ID.QUEST_ACTION_ACK:
      return decodeQuestActionAck(body);
    case PACKET_ID.QUEST_ABANDON:
      return decodeQuestAbandon(body);
    case PACKET_ID.QUEST_NPC_MARKERS:
      return decodeQuestNpcMarkers(body);
    case PACKET_ID.SHOP_LIST:
      return decodeShopList(body);
    case PACKET_ID.SHOP_BUY:
      return decodeShopBuy(body);
    case PACKET_ID.SHOP_SELL:
      return decodeShopSell(body);
    case PACKET_ID.SHOP_ACK:
      return decodeShopAck(body);
    case PACKET_ID.UI_PREFERENCES_SET:
      return decodeUiPreferencesSet(body);
    case PACKET_ID.UI_PREFERENCES:
      return decodeUiPreferences(body);
    case PACKET_ID.GATHER_START:
      return decodeGatherStart(body);
    case PACKET_ID.LIFE_CANCEL:
      return decodeLifeCancel(body);
    case PACKET_ID.LIFE_CHANNEL:
      return decodeLifeChannel(body);
    case PACKET_ID.LIFE_RESULT:
      return decodeLifeResult(body);
    case PACKET_ID.LIFE_STATUS:
      return decodeLifeStatus(body);
    case PACKET_ID.NODE_CATALOG:
      return decodeNodeCatalog(body);
    case PACKET_ID.GATHER_PUZZLE:
      return decodeGatherPuzzle(body);
    case PACKET_ID.GATHER_TRACE:
      return decodeGatherTrace(body);
    case PACKET_ID.GATHER_TAPS:
      return decodeGatherTaps(body);
    case PACKET_ID.RECIPE_LIST:
      return decodeRecipeList(body);
    case PACKET_ID.CRAFT_REQ:
      return decodeCraftReq(body);
    case PACKET_ID.CRAFT_ACK:
      return decodeCraftAck(body);
    case PACKET_ID.PING:
      return decodePing(body);
    case PACKET_ID.PONG:
      return decodePong(body);
    case PACKET_ID.KICK:
      return decodeKick(body);
    default:
      return null;
  }
}

/** 수신 디코드 — C2S 패킷만 디코드(실패 = null), 그 밖(S2C·스키마 밖 id)은 NO_CODEC(호출자 몫 — 서버 수신은 사전 판정 뒤라 미지 패킷으로 버린다). */
export function decodeC2S(id: number, body: Uint8Array): object | null | typeof NO_CODEC {
  switch (id) {
    case PACKET_ID.HELLO:
      return decodeHello(body);
    case PACKET_ID.AUTH_REQ:
      return decodeAuthReq(body);
    case PACKET_ID.CHAR_LIST_REQ:
      return decodeCharListReq(body);
    case PACKET_ID.ENTER_WORLD_REQ:
      return decodeEnterWorldReq(body);
    case PACKET_ID.CHAR_CREATE_REQ:
      return decodeCharCreateReq(body);
    case PACKET_ID.ZONE_CHANGE_REQ:
      return decodeZoneChangeReq(body);
    case PACKET_ID.INPUT_CMD:
      return decodeInputCmd(body);
    case PACKET_ID.MOVE_TO:
      return decodeMoveTo(body);
    case PACKET_ID.MOVE_STOP:
      return decodeMoveStop(body);
    case PACKET_ID.CHAT_SAY:
      return decodeChatSay(body);
    case PACKET_ID.CREATE_CHARACTER_V2:
      return decodeCreateCharacterV2(body);
    case PACKET_ID.STAT_ALLOCATE:
      return decodeStatAllocate(body);
    case PACKET_ID.STAT_RESET:
      return decodeStatReset(body);
    case PACKET_ID.TARGET_SELECT:
      return decodeTargetSelect(body);
    case PACKET_ID.ATTACK_START:
      return decodeAttackStart(body);
    case PACKET_ID.ATTACK_STOP:
      return decodeAttackStop(body);
    case PACKET_ID.RESPAWN_REQ:
      return decodeRespawnReq(body);
    case PACKET_ID.SKILL_CAST:
      return decodeSkillCast(body);
    case PACKET_ID.SKILL_LEARN:
      return decodeSkillLearn(body);
    case PACKET_ID.SKILL_LEVEL_UP:
      return decodeSkillLevelUp(body);
    case PACKET_ID.ITEM_USE:
      return decodeItemUse(body);
    case PACKET_ID.ITEM_EQUIP:
      return decodeItemEquip(body);
    case PACKET_ID.ITEM_UNEQUIP:
      return decodeItemUnequip(body);
    case PACKET_ID.ITEM_PICKUP:
      return decodeItemPickup(body);
    case PACKET_ID.NPC_INTERACT:
      return decodeNpcInteract(body);
    case PACKET_ID.NPC_ACTION:
      return decodeNpcAction(body);
    case PACKET_ID.QUEST_ABANDON:
      return decodeQuestAbandon(body);
    case PACKET_ID.SHOP_BUY:
      return decodeShopBuy(body);
    case PACKET_ID.SHOP_SELL:
      return decodeShopSell(body);
    case PACKET_ID.UI_PREFERENCES_SET:
      return decodeUiPreferencesSet(body);
    case PACKET_ID.GATHER_START:
      return decodeGatherStart(body);
    case PACKET_ID.LIFE_CANCEL:
      return decodeLifeCancel(body);
    case PACKET_ID.GATHER_TRACE:
      return decodeGatherTrace(body);
    case PACKET_ID.GATHER_TAPS:
      return decodeGatherTaps(body);
    case PACKET_ID.CRAFT_REQ:
      return decodeCraftReq(body);
    case PACKET_ID.PING:
      return decodePing(body);
    default:
      return NO_CODEC;
  }
}
