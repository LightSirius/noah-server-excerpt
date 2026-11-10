// AUTO-GENERATED — do not edit. Source: shared/schema/packets.json
// schema-hash: 080391b8
// Run `bun run gen` from tools/codegen/ to regenerate.

/* eslint-disable */

export const PROTO_VERSION = 19;

export const PACKET_ID = {
  HELLO: 0x0001,
  HELLO_ACK: 0x0002,
  AUTH_REQ: 0x0003,
  AUTH_RESULT: 0x0004,
  CHAR_LIST_REQ: 0x0010,
  CHAR_LIST: 0x0011,
  ENTER_WORLD_REQ: 0x0012,
  ENTER_WORLD_OK: 0x0013,
  ZONE_INFO: 0x0014,
  CHAR_CREATE_REQ: 0x0016,
  CHAR_CREATE_RESULT: 0x0017,
  ZONE_CHANGE_REQ: 0x0015,
  ZONE_CHANGE: 0x0018,
  PORTAL_LIST: 0x0019,
  INPUT_CMD: 0x0100,
  SNAPSHOT_DELTA: 0x0101,
  ENTITY_SPAWN: 0x0102,
  ENTITY_DESPAWN: 0x0103,
  MOVE_TO: 0x0104,
  ENTITY_META: 0x0105,
  MOVE_PATH: 0x0106,
  MOVE_STOP: 0x0107,
  CHAT_SAY: 0x0210,
  CHAT_BCAST: 0x0211,
  CREATE_CHARACTER_V2: 0x0300,
  CHAR_STATS_FULL: 0x0301,
  CHAR_LEVEL_UP: 0x0302,
  CHAR_EXP_GAIN: 0x0303,
  GOLD_UPDATE: 0x0304,
  STAT_ALLOCATE: 0x0305,
  STAT_RESET: 0x0306,
  STAT_POINTS_ACK: 0x0307,
  TARGET_SELECT: 0x0400,
  TARGET_ACK: 0x0401,
  ATTACK_START: 0x0402,
  ATTACK_STOP: 0x0403,
  DAMAGE_EVENT: 0x0410,
  DEATH_NOTIFY: 0x0411,
  RESPAWN_REQ: 0x0412,
  RESPAWN_OK: 0x0413,
  SKILL_CAST: 0x0420,
  SKILL_LIST: 0x0421,
  SKILL_EFFECT: 0x0422,
  SKILL_CAST_ACK: 0x0423,
  MANA_UPDATE: 0x0424,
  SKILL_LEARN: 0x0425,
  SKILL_LEVEL_UP: 0x0426,
  SKILL_LEARN_ACK: 0x0427,
  SKILL_LV_UP: 0x0428,
  ITEM_USE: 0x0440,
  ITEM_EQUIP: 0x0441,
  ITEM_UNEQUIP: 0x0442,
  ITEM_PICKUP: 0x0443,
  INVENTORY_LIST: 0x0444,
  INVENTORY_UPDATE: 0x0445,
  ITEM_USE_ACK: 0x0446,
  ITEM_PICKUP_ACK: 0x0447,
  NPC_INTERACT: 0x0450,
  NPC_DIALOG: 0x0451,
  NPC_ACTION: 0x0452,
  QUEST_LIST: 0x0460,
  QUEST_PROGRESS: 0x0461,
  QUEST_ACTION_ACK: 0x0462,
  QUEST_ABANDON: 0x0463,
  QUEST_NPC_MARKERS: 0x0464,
  SHOP_LIST: 0x0453,
  SHOP_BUY: 0x0454,
  SHOP_SELL: 0x0455,
  SHOP_ACK: 0x0456,
  UI_PREFERENCES_SET: 0x0470,
  UI_PREFERENCES: 0x0471,
  GATHER_START: 0x0480,
  LIFE_CANCEL: 0x0481,
  LIFE_CHANNEL: 0x0482,
  LIFE_RESULT: 0x0483,
  LIFE_STATUS: 0x0484,
  NODE_CATALOG: 0x0485,
  GATHER_PUZZLE: 0x0486,
  GATHER_TRACE: 0x0487,
  GATHER_TAPS: 0x0488,
  RECIPE_LIST: 0x0490,
  CRAFT_REQ: 0x0491,
  CRAFT_ACK: 0x0492,
  PING: 0x0F00,
  PONG: 0x0F01,
  KICK: 0x0F03,
} as const;

export type PacketId = typeof PACKET_ID[keyof typeof PACKET_ID];

export type MoveGait = "run" | "walk";
export const MOVE_GAIT_CODE = { run: 0, walk: 1 } as const;

export type EntityType = "unknown" | "player" | "monster" | "npc" | "grounditem" | "resource";
export const ENTITY_TYPE_CODE = { unknown: 0, player: 1, monster: 2, npc: 3, grounditem: 4, resource: 5 } as const;

export type SkillEffectKind = "damage" | "heal" | "cast" | "fizzle";
export const SKILL_EFFECT_KIND_CODE = { damage: 0, heal: 1, cast: 2, fizzle: 3 } as const;

export type SkillCategory = "physical" | "magical" | "heal";
export const SKILL_CATEGORY_CODE = { physical: 0, magical: 1, heal: 2 } as const;

export type SkillDefEffectKind = "damage" | "heal" | "passive";
export const SKILL_DEF_EFFECT_KIND_CODE = { damage: 0, heal: 1, passive: 2 } as const;

export type SkillTargeting = "entity" | "ground";
export const SKILL_TARGETING_CODE = { entity: 0, ground: 1 } as const;

export type QuestType = "scenario" | "normal" | "regional" | "daily";
export const QUEST_TYPE_CODE = { scenario: 0, normal: 1, regional: 2, daily: 3 } as const;

export type QuestObjectiveKind = "kill" | "collect" | "talk" | "reach";
export const QUEST_OBJECTIVE_KIND_CODE = { kill: 0, collect: 1, talk: 2, reach: 3 } as const;

export type RewardSource = "fixed" | "choice" | "random" | "bonus";
export const REWARD_SOURCE_CODE = { fixed: 0, choice: 1, random: 2, bonus: 3 } as const;

export type StatGroup = "pow" | "mag" | "cha" | "luc";
export const STAT_GROUP_CODE = { pow: 0, mag: 1, cha: 2, luc: 3 } as const;

export type StatCode = "atk" | "hit" | "agi" | "mat" | "wis" | "mdef" | "eva" | "end" | "def" | "pot" | "luk" | "act";
export const STAT_CODE_CODE = { atk: 0, hit: 1, agi: 2, mat: 3, wis: 4, mdef: 5, eva: 6, end: 7, def: 8, pot: 9, luk: 10, act: 11 } as const;

export type LifeLine = "logging" | "mining" | "gathering" | "weapon" | "armor" | "accessory" | "consumable";
export const LIFE_LINE_CODE = { logging: 0, mining: 1, gathering: 2, weapon: 3, armor: 4, accessory: 5, consumable: 6 } as const;

export type LifeChannelKind = "gather" | "craft";
export const LIFE_CHANNEL_KIND_CODE = { gather: 0, craft: 1 } as const;

export type GatherPuzzleKind = "trace" | "tap";
export const GATHER_PUZZLE_KIND_CODE = { trace: 0, tap: 1 } as const;

export interface SnapshotUpdate {
  entityId: number;
  x: number;
  y: number;
}

export interface Waypoint {
  x: number;
  y: number;
}

export interface InventoryEntry {
  slot: number;
  itemId: number;
  qty: number;
}

export interface EquipmentSlots {
  weapon: number;
  shield: number;
  helmet: number;
  armor: number;
  gloves: number;
  boots: number;
  accessory1: number;
  accessory2: number;
}

export interface ShopOffer {
  itemId: number;
  buyPrice: number;
  sellPrice: number;
}

export interface SkillInfo {
  skillId: number;
  name: string;
  category: SkillCategory;
  effectKind: SkillDefEffectKind;
  mpCost: number;
  cooldownMs: number;
  range: number;
  slvReq: number;
  slpCost: number;
  maxLevel: number;
  targeting: SkillTargeting;
  aoeRadius: number;
  level: number;
  learned: boolean;
  allowedRaces: number;
  bookOnly: boolean;
  bowRange: number;
}

export interface DialogAction {
  type: string;
  questId?: number;
  shopId?: number;
}

export interface DialogOption {
  label: string;
  next?: string;
  action?: DialogAction;
}

export interface DialogNode {
  id: string;
  speaker: string;
  pages: string[];
  options: DialogOption[];
}

export interface QuestLogObjective {
  kind: QuestObjectiveKind;
  text: string;
  targetId: number;
  current: number;
  required: number;
}

export interface RewardPreviewItem {
  itemId: number;
  qty: number;
}

export interface QuestRewardPreview {
  exp: number;
  sexp: number;
  slp: number;
  gold: number;
  fixed: RewardPreviewItem[];
  choice: RewardPreviewItem[];
  random: RewardPreviewItem[];
  bonus: RewardPreviewItem[];
}

export interface QuestLogEntry {
  questId: number;
  type: QuestType;
  name: string;
  description: string;
  giverNpcId: number;
  turnInNpcId: number;
  abandonable: boolean;
  completable: boolean;
  objectives: QuestLogObjective[];
  rewardPreview: QuestRewardPreview;
}

export interface QuestGrantItem {
  itemId: number;
  qty: number;
  source: RewardSource;
}

export interface QuestGrantSummary {
  exp: number;
  sexp: number;
  slp: number;
  gold: number;
  items: QuestGrantItem[];
}

export interface NpcQuestMarker {
  npcId: number;
  marker: number;
}

export interface CharStatPair {
  value: number;
  xp: number;
}

export interface CharGraph {
  pow: number;
  mag: number;
  cha: number;
  luc: number;
}

export interface CharPowStats {
  atk: CharStatPair;
  hit: CharStatPair;
  agi: CharStatPair;
}

export interface CharMagStats {
  mat: CharStatPair;
  wis: CharStatPair;
  mdef: CharStatPair;
}

export interface CharChaStats {
  eva: CharStatPair;
  end: CharStatPair;
  def: CharStatPair;
}

export interface CharLucStats {
  pot: CharStatPair;
  luk: CharStatPair;
  act: CharStatPair;
}

export interface CharStats {
  pow: CharPowStats;
  mag: CharMagStats;
  cha: CharChaStats;
  luc: CharLucStats;
}

export interface CharDerivedStats {
  attackPower: number;
  magicPower: number;
  defense: number;
  magicDefense: number;
  hitRating: number;
  evasionRating: number;
  magicHitRating: number;
  magicEvasionRating: number;
  hitChance: number;
  evasionChance: number;
  magicHitChance: number;
  magicEvasionChance: number;
  critChance: number;
  critMultiplier: number;
  attackIntervalMs: number;
  moveSpeed: number;
  mpRegenPerMin: number;
}

export interface CharStatDelta {
  group: StatGroup;
  code: StatCode;
  valueDelta: number;
  valueAfter: number;
  xpAfter: number;
}

export interface StatAllocation {
  code: StatCode;
  points: number;
}

export interface PortalMarker {
  portalId: number;
  x: number;
  y: number;
  name: string;
  destZoneId: number;
}

export interface CharSummary {
  charId: number;
  name: string;
  level: number;
  zoneId: number;
}

export interface LifeLineInfo {
  line: LifeLine;
  points: number;
  rank: number;
  nextRankAt: number;
}

export interface NodeDefInfo {
  nodeDefId: number;
  line: LifeLine;
  tier: number;
  minRank: number;
  interactRadius: number;
}

export interface PuzzlePoint {
  x: number;
  y: number;
}

export interface PuzzleTap {
  cycle: number;
  ms: number;
  x: number;
  y: number;
}

export interface RecipeInfo {
  recipeId: number;
  line: LifeLine;
  tier: number;
  minRank: number;
  laborCost: number;
  goldFee: number;
  outputItemId: number;
  outputQty: number;
  greatBonusQty: number;
  inputs: RewardPreviewItem[];
}

/** binary 본문(wireCodec.generated.ts). */
export interface HelloPayload {
  clientProtoVer: number;
  clientBuildHash: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface HelloAckPayload {
  serverProtoVer: number;
  serverTimeMs: number;
  sessionNonce: string;
}

/** binary 본문(wireCodec.generated.ts). */
export interface AuthReqPayload {
  mode: number;
  username: string;
  secret: string;
}

/** binary 본문(wireCodec.generated.ts). */
export interface AuthResultPayload {
  ok: boolean;
  accountId: number;
  sessionToken: string;
  errCode: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface CharListReqPayload {
}

/** binary 본문(wireCodec.generated.ts). */
export interface CharListPayload {
  chars: CharSummary[];
}

/** binary 본문(wireCodec.generated.ts). */
export interface EnterWorldReqPayload {
  charId: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface EnterWorldOkPayload {
  charId: number;
  zoneId: number;
  tickIndex: number;
  spawnX: number;
  spawnY: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface ZoneInfoPayload {
  zoneId: number;
  name: string;
  width: number;
  height: number;
  tickRate: number;
  spawnX: number;
  spawnY: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface CharCreateReqPayload {
  name: string;
}

/** binary 본문(wireCodec.generated.ts). */
export interface CharCreateResultPayload {
  ok: boolean;
  charId: number;
  name: string;
  errCode: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface ZoneChangeReqPayload {
  portalId: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface ZoneChangePayload {
  newZoneId: number;
  name: string;
  width: number;
  height: number;
  tickRate: number;
  spawnX: number;
  spawnY: number;
  tickIndex: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface PortalListPayload {
  zoneId: number;
  portals: PortalMarker[];
}

/** binary 본문(wireCodec.generated.ts). */
export interface InputCmdPayload {
  seq: number;
  tick: number;
  dx: number;
  dy: number;
  action: number;
  gait: MoveGait;
}

/** binary 본문(wireCodec.generated.ts). */
export interface SnapshotDeltaPayload {
  tickIndex: number;
  ackSeq: number;
  updates: SnapshotUpdate[];
}

/** binary 본문(wireCodec.generated.ts). */
export interface EntitySpawnPayload {
  entityId: number;
  type: EntityType;
  x: number;
  y: number;
  name: string;
  level: number;
  hp: number;
  hpMax: number;
  itemId: number;
  qty: number;
  npcId: number;
  monsterDefId: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface EntityDespawnPayload {
  entityId: number;
  reason: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface MoveToPayload {
  seq: number;
  tick: number;
  targetX: number;
  targetY: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface EntityMetaPayload {
  entityId: number;
  hp: number;
  hpMax: number;
  level: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface MovePathPayload {
  entityId: number;
  seq: number;
  waypoints: Waypoint[];
}

/** binary 본문(wireCodec.generated.ts). */
export interface MoveStopPayload {
  seq: number;
  tick: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface ChatSayPayload {
  channel: number;
  target: string;
  text: string;
}

/** binary 본문(wireCodec.generated.ts). */
export interface ChatBcastPayload {
  channel: number;
  senderId: number;
  senderName: string;
  text: string;
}

/** binary 본문(wireCodec.generated.ts). */
export interface CreateCharacterV2Payload {
  name: string;
  race: number;
  graphPow: number;
  graphMag: number;
  graphCha: number;
  graphLuc: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface CharStatsFullPayload {
  charId: number;
  name: string;
  race: number;
  graph: CharGraph;
  stats: CharStats;
  level: number;
  exp: number;
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
  slv: number;
  sexp: number;
  slp: number;
  gold: number;
  zoneId: number;
  x: number;
  y: number;
  derived: CharDerivedStats;
  freePoints: number;
  allocatedPoints: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface CharLevelUpPayload {
  newLevel: number;
  statDeltas: CharStatDelta[];
  hpMaxNew: number;
  mpMaxNew: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface CharExpGainPayload {
  expDelta: number;
  sexpDelta: number;
  expTotal: number;
  sexpTotal: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface GoldUpdatePayload {
  gold: number;
  delta: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface StatAllocatePayload {
  requestId: number;
  allocations: StatAllocation[];
}

/** binary 본문(wireCodec.generated.ts). */
export interface StatResetPayload {
  requestId: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface StatPointsAckPayload {
  requestId: number;
  op: number;
  errCode: number;
  freePoints: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface TargetSelectPayload {
  targetEntityId: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface TargetAckPayload {
  targetEntityId: number;
  errCode: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface AttackStartPayload {
}

/** binary 본문(wireCodec.generated.ts). */
export interface AttackStopPayload {
}

/** binary 본문(wireCodec.generated.ts). */
export interface DamageEventPayload {
  attackerEntityId: number;
  targetEntityId: number;
  damage: number;
  isCrit: boolean;
  isMiss: boolean;
}

/** binary 본문(wireCodec.generated.ts). */
export interface DeathNotifyPayload {
  victimEntityId: number;
  attackerEntityId: number;
  expLost: number;
  sexpLost: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface RespawnReqPayload {
}

/** binary 본문(wireCodec.generated.ts). */
export interface RespawnOkPayload {
  zoneId: number;
  spawnX: number;
  spawnY: number;
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface SkillCastPayload {
  skillId: number;
  targetEntityId: number;
  groundX: number;
  groundY: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface SkillListPayload {
  skills: SkillInfo[];
}

/** binary 본문(wireCodec.generated.ts). */
export interface SkillEffectPayload {
  skillId: number;
  casterEntityId: number;
  targetEntityId: number;
  effectKind: SkillEffectKind;
  amount: number;
  isCrit: boolean;
  isMiss: boolean;
  groundX: number;
  groundY: number;
  castId: number;
  impactDelayMs: number;
  variant: number;
  hitIndex: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface SkillCastAckPayload {
  skillId: number;
  errCode: number;
  cooldownMs: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface ManaUpdatePayload {
  mp: number;
  mpMax: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface SkillLearnPayload {
  skillId: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface SkillLevelUpPayload {
  skillId: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface SkillLearnAckPayload {
  op: number;
  skillId: number;
  errCode: number;
  newLevel: number;
  slpAfter: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface SkillLvUpPayload {
  newSlv: number;
  slpGained: number;
  slpTotal: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface ItemUsePayload {
  slot: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface ItemEquipPayload {
  slot: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface ItemUnequipPayload {
  equipSlot: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface ItemPickupPayload {
  entityId: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface InventoryListPayload {
  slots: InventoryEntry[];
  equipment: EquipmentSlots;
}

/** 본문 = INVENTORY_LIST(bodyOf). */
export interface InventoryUpdatePayload {
  slots: InventoryEntry[];
  equipment: EquipmentSlots;
}

/** binary 본문(wireCodec.generated.ts). */
export interface ItemUseAckPayload {
  slot: number;
  itemId: number;
  errCode: number;
  healHp: number;
  healMp: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface ItemPickupAckPayload {
  entityId: number;
  errCode: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface NpcInteractPayload {
  entityId: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface NpcDialogPayload {
  entityId: number;
  npcId: number;
  npcName: string;
  dialogueId: number;
  entry: string;
  nodes: DialogNode[];
}

/** binary 본문(wireCodec.generated.ts). */
export interface NpcActionPayload {
  entityId: number;
  dialogueId: number;
  nodeId: string;
  optionIndex: number;
  actionType: string;
  questId: number;
  chosenIndex: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface QuestListPayload {
  active: QuestLogEntry[];
  completed: number[];
  dailyDoneToday: number[];
}

/** binary 본문(wireCodec.generated.ts). */
export interface QuestProgressPayload {
  questId: number;
  objectiveIndex: number;
  current: number;
  required: number;
  questCompletable: boolean;
}

/** binary 본문(wireCodec.generated.ts). */
export interface QuestActionAckPayload {
  op: number;
  questId: number;
  errCode: number;
  rewards?: QuestGrantSummary;
}

/** binary 본문(wireCodec.generated.ts). */
export interface QuestAbandonPayload {
  questId: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface QuestNpcMarkersPayload {
  npcs: NpcQuestMarker[];
}

/** binary 본문(wireCodec.generated.ts). */
export interface ShopListPayload {
  entityId: number;
  shopId: number;
  name: string;
  offers: ShopOffer[];
}

/** binary 본문(wireCodec.generated.ts). */
export interface ShopBuyPayload {
  entityId: number;
  shopId: number;
  itemId: number;
  qty: number;
  requestId: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface ShopSellPayload {
  entityId: number;
  shopId: number;
  itemId: number;
  slot: number;
  qty: number;
  requestId: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface ShopAckPayload {
  requestId: number;
  op: number;
  errCode: number;
  gold: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface UiPreferencesSetPayload {
  quickSlots?: number[];
  trackedQuestIds?: number[];
}

/** binary 본문(wireCodec.generated.ts). */
export interface UiPreferencesPayload {
  quickSlots: number[];
  trackedQuestIds: number[];
  hasSavedSettings: boolean;
}

/** binary 본문(wireCodec.generated.ts). */
export interface GatherStartPayload {
  nodeEid: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface LifeCancelPayload {
}

/** binary 본문(wireCodec.generated.ts). */
export interface LifeChannelPayload {
  channelId: number;
  kind: LifeChannelKind;
  targetEid: number;
  durationMs: number;
  requestId: number;
  code: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface LifeResultPayload {
  channelId: number;
  code: number;
  items: RewardPreviewItem[];
  line: LifeLine;
  profGain: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface LifeStatusPayload {
  labor: number;
  laborMax: number;
  msToNext: number;
  lines: LifeLineInfo[];
}

/** binary 본문(wireCodec.generated.ts). */
export interface NodeCatalogPayload {
  nodes: NodeDefInfo[];
}

/** binary 본문(wireCodec.generated.ts). */
export interface GatherPuzzlePayload {
  channelId: number;
  kind: GatherPuzzleKind;
  boardW: number;
  boardH: number;
  readyMs: number;
  cycleMs: number;
  maxCycles: number;
  bandHeight: number;
  pathWidth: number;
  circleRadius: number;
  points: PuzzlePoint[];
}

/** binary 본문(wireCodec.generated.ts). */
export interface GatherTracePayload {
  channelId: number;
  cycle: number;
  pressMs: number;
  tailMs: number;
  samples: PuzzlePoint[];
}

/** binary 본문(wireCodec.generated.ts). */
export interface GatherTapsPayload {
  channelId: number;
  taps: PuzzleTap[];
}

/** binary 본문(wireCodec.generated.ts). */
export interface RecipeListPayload {
  npcEid: number;
  stationId: number;
  name: string;
  recipes: RecipeInfo[];
}

/** binary 본문(wireCodec.generated.ts). */
export interface CraftReqPayload {
  npcEid: number;
  recipeId: number;
  count: number;
  requestId: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface CraftAckPayload {
  requestId: number;
  errCode: number;
  made: number;
  greats: number;
  gold: number;
  outputItemId: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface PingPayload {
  clientTimeMs: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface PongPayload {
  clientTimeMs: number;
  serverTimeMs: number;
}

/** binary 본문(wireCodec.generated.ts). */
export interface KickPayload {
  reason: number;
  detail: string;
}

export function isSnapshotUpdate(v: unknown): v is SnapshotUpdate {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["entityId"] !== "number") return false;
  if (typeof o["x"] !== "number") return false;
  if (typeof o["y"] !== "number") return false;
  return true;
}

export function isWaypoint(v: unknown): v is Waypoint {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["x"] !== "number") return false;
  if (typeof o["y"] !== "number") return false;
  return true;
}

export function isInventoryEntry(v: unknown): v is InventoryEntry {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["slot"] !== "number") return false;
  if (typeof o["itemId"] !== "number") return false;
  if (typeof o["qty"] !== "number") return false;
  return true;
}

export function isEquipmentSlots(v: unknown): v is EquipmentSlots {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["weapon"] !== "number") return false;
  if (typeof o["shield"] !== "number") return false;
  if (typeof o["helmet"] !== "number") return false;
  if (typeof o["armor"] !== "number") return false;
  if (typeof o["gloves"] !== "number") return false;
  if (typeof o["boots"] !== "number") return false;
  if (typeof o["accessory1"] !== "number") return false;
  if (typeof o["accessory2"] !== "number") return false;
  return true;
}

export function isShopOffer(v: unknown): v is ShopOffer {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["itemId"] !== "number") return false;
  if (typeof o["buyPrice"] !== "number") return false;
  if (typeof o["sellPrice"] !== "number") return false;
  return true;
}

export function isSkillInfo(v: unknown): v is SkillInfo {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["skillId"] !== "number") return false;
  if (typeof o["name"] !== "string") return false;
  if (!(typeof o["category"] === "string" && Object.hasOwn(SKILL_CATEGORY_CODE, o["category"]))) return false;
  if (!(typeof o["effectKind"] === "string" && Object.hasOwn(SKILL_DEF_EFFECT_KIND_CODE, o["effectKind"]))) return false;
  if (typeof o["mpCost"] !== "number") return false;
  if (typeof o["cooldownMs"] !== "number") return false;
  if (typeof o["range"] !== "number") return false;
  if (typeof o["slvReq"] !== "number") return false;
  if (typeof o["slpCost"] !== "number") return false;
  if (typeof o["maxLevel"] !== "number") return false;
  if (!(typeof o["targeting"] === "string" && Object.hasOwn(SKILL_TARGETING_CODE, o["targeting"]))) return false;
  if (typeof o["aoeRadius"] !== "number") return false;
  if (typeof o["level"] !== "number") return false;
  if (typeof o["learned"] !== "boolean") return false;
  if (typeof o["allowedRaces"] !== "number") return false;
  if (typeof o["bookOnly"] !== "boolean") return false;
  if (typeof o["bowRange"] !== "number") return false;
  return true;
}

export function isDialogAction(v: unknown): v is DialogAction {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["type"] !== "string") return false;
  if (o["questId"] !== undefined && !(typeof o["questId"] === "number")) return false;
  if (o["shopId"] !== undefined && !(typeof o["shopId"] === "number")) return false;
  return true;
}

export function isDialogOption(v: unknown): v is DialogOption {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["label"] !== "string") return false;
  if (o["next"] !== undefined && !(typeof o["next"] === "string")) return false;
  if (o["action"] !== undefined && !(isDialogAction(o["action"]))) return false;
  return true;
}

export function isDialogNode(v: unknown): v is DialogNode {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["id"] !== "string") return false;
  if (typeof o["speaker"] !== "string") return false;
  if (!(Array.isArray(o["pages"]) && o["pages"].every((e: unknown) => typeof e === "string"))) return false;
  if (!(Array.isArray(o["options"]) && o["options"].every((e: unknown) => isDialogOption(e)))) return false;
  return true;
}

export function isQuestLogObjective(v: unknown): v is QuestLogObjective {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!(typeof o["kind"] === "string" && Object.hasOwn(QUEST_OBJECTIVE_KIND_CODE, o["kind"]))) return false;
  if (typeof o["text"] !== "string") return false;
  if (typeof o["targetId"] !== "number") return false;
  if (typeof o["current"] !== "number") return false;
  if (typeof o["required"] !== "number") return false;
  return true;
}

export function isRewardPreviewItem(v: unknown): v is RewardPreviewItem {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["itemId"] !== "number") return false;
  if (typeof o["qty"] !== "number") return false;
  return true;
}

export function isQuestRewardPreview(v: unknown): v is QuestRewardPreview {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["exp"] !== "number") return false;
  if (typeof o["sexp"] !== "number") return false;
  if (typeof o["slp"] !== "number") return false;
  if (typeof o["gold"] !== "number") return false;
  if (!(Array.isArray(o["fixed"]) && o["fixed"].every((e: unknown) => isRewardPreviewItem(e)))) return false;
  if (!(Array.isArray(o["choice"]) && o["choice"].every((e: unknown) => isRewardPreviewItem(e)))) return false;
  if (!(Array.isArray(o["random"]) && o["random"].every((e: unknown) => isRewardPreviewItem(e)))) return false;
  if (!(Array.isArray(o["bonus"]) && o["bonus"].every((e: unknown) => isRewardPreviewItem(e)))) return false;
  return true;
}

export function isQuestLogEntry(v: unknown): v is QuestLogEntry {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["questId"] !== "number") return false;
  if (!(typeof o["type"] === "string" && Object.hasOwn(QUEST_TYPE_CODE, o["type"]))) return false;
  if (typeof o["name"] !== "string") return false;
  if (typeof o["description"] !== "string") return false;
  if (typeof o["giverNpcId"] !== "number") return false;
  if (typeof o["turnInNpcId"] !== "number") return false;
  if (typeof o["abandonable"] !== "boolean") return false;
  if (typeof o["completable"] !== "boolean") return false;
  if (!(Array.isArray(o["objectives"]) && o["objectives"].every((e: unknown) => isQuestLogObjective(e)))) return false;
  if (!(isQuestRewardPreview(o["rewardPreview"]))) return false;
  return true;
}

export function isQuestGrantItem(v: unknown): v is QuestGrantItem {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["itemId"] !== "number") return false;
  if (typeof o["qty"] !== "number") return false;
  if (!(typeof o["source"] === "string" && Object.hasOwn(REWARD_SOURCE_CODE, o["source"]))) return false;
  return true;
}

export function isQuestGrantSummary(v: unknown): v is QuestGrantSummary {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["exp"] !== "number") return false;
  if (typeof o["sexp"] !== "number") return false;
  if (typeof o["slp"] !== "number") return false;
  if (typeof o["gold"] !== "number") return false;
  if (!(Array.isArray(o["items"]) && o["items"].every((e: unknown) => isQuestGrantItem(e)))) return false;
  return true;
}

export function isNpcQuestMarker(v: unknown): v is NpcQuestMarker {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["npcId"] !== "number") return false;
  if (typeof o["marker"] !== "number") return false;
  return true;
}

export function isCharStatPair(v: unknown): v is CharStatPair {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["value"] !== "number") return false;
  if (typeof o["xp"] !== "number") return false;
  return true;
}

export function isCharGraph(v: unknown): v is CharGraph {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["pow"] !== "number") return false;
  if (typeof o["mag"] !== "number") return false;
  if (typeof o["cha"] !== "number") return false;
  if (typeof o["luc"] !== "number") return false;
  return true;
}

export function isCharPowStats(v: unknown): v is CharPowStats {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!(isCharStatPair(o["atk"]))) return false;
  if (!(isCharStatPair(o["hit"]))) return false;
  if (!(isCharStatPair(o["agi"]))) return false;
  return true;
}

export function isCharMagStats(v: unknown): v is CharMagStats {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!(isCharStatPair(o["mat"]))) return false;
  if (!(isCharStatPair(o["wis"]))) return false;
  if (!(isCharStatPair(o["mdef"]))) return false;
  return true;
}

export function isCharChaStats(v: unknown): v is CharChaStats {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!(isCharStatPair(o["eva"]))) return false;
  if (!(isCharStatPair(o["end"]))) return false;
  if (!(isCharStatPair(o["def"]))) return false;
  return true;
}

export function isCharLucStats(v: unknown): v is CharLucStats {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!(isCharStatPair(o["pot"]))) return false;
  if (!(isCharStatPair(o["luk"]))) return false;
  if (!(isCharStatPair(o["act"]))) return false;
  return true;
}

export function isCharStats(v: unknown): v is CharStats {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!(isCharPowStats(o["pow"]))) return false;
  if (!(isCharMagStats(o["mag"]))) return false;
  if (!(isCharChaStats(o["cha"]))) return false;
  if (!(isCharLucStats(o["luc"]))) return false;
  return true;
}

export function isCharDerivedStats(v: unknown): v is CharDerivedStats {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["attackPower"] !== "number") return false;
  if (typeof o["magicPower"] !== "number") return false;
  if (typeof o["defense"] !== "number") return false;
  if (typeof o["magicDefense"] !== "number") return false;
  if (typeof o["hitRating"] !== "number") return false;
  if (typeof o["evasionRating"] !== "number") return false;
  if (typeof o["magicHitRating"] !== "number") return false;
  if (typeof o["magicEvasionRating"] !== "number") return false;
  if (typeof o["hitChance"] !== "number") return false;
  if (typeof o["evasionChance"] !== "number") return false;
  if (typeof o["magicHitChance"] !== "number") return false;
  if (typeof o["magicEvasionChance"] !== "number") return false;
  if (typeof o["critChance"] !== "number") return false;
  if (typeof o["critMultiplier"] !== "number") return false;
  if (typeof o["attackIntervalMs"] !== "number") return false;
  if (typeof o["moveSpeed"] !== "number") return false;
  if (typeof o["mpRegenPerMin"] !== "number") return false;
  return true;
}

export function isCharStatDelta(v: unknown): v is CharStatDelta {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!(typeof o["group"] === "string" && Object.hasOwn(STAT_GROUP_CODE, o["group"]))) return false;
  if (!(typeof o["code"] === "string" && Object.hasOwn(STAT_CODE_CODE, o["code"]))) return false;
  if (typeof o["valueDelta"] !== "number") return false;
  if (typeof o["valueAfter"] !== "number") return false;
  if (typeof o["xpAfter"] !== "number") return false;
  return true;
}

export function isStatAllocation(v: unknown): v is StatAllocation {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!(typeof o["code"] === "string" && Object.hasOwn(STAT_CODE_CODE, o["code"]))) return false;
  if (typeof o["points"] !== "number") return false;
  return true;
}

export function isPortalMarker(v: unknown): v is PortalMarker {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["portalId"] !== "number") return false;
  if (typeof o["x"] !== "number") return false;
  if (typeof o["y"] !== "number") return false;
  if (typeof o["name"] !== "string") return false;
  if (typeof o["destZoneId"] !== "number") return false;
  return true;
}

export function isCharSummary(v: unknown): v is CharSummary {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["charId"] !== "number") return false;
  if (typeof o["name"] !== "string") return false;
  if (typeof o["level"] !== "number") return false;
  if (typeof o["zoneId"] !== "number") return false;
  return true;
}

export function isLifeLineInfo(v: unknown): v is LifeLineInfo {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!(typeof o["line"] === "string" && Object.hasOwn(LIFE_LINE_CODE, o["line"]))) return false;
  if (typeof o["points"] !== "number") return false;
  if (typeof o["rank"] !== "number") return false;
  if (typeof o["nextRankAt"] !== "number") return false;
  return true;
}

export function isNodeDefInfo(v: unknown): v is NodeDefInfo {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["nodeDefId"] !== "number") return false;
  if (!(typeof o["line"] === "string" && Object.hasOwn(LIFE_LINE_CODE, o["line"]))) return false;
  if (typeof o["tier"] !== "number") return false;
  if (typeof o["minRank"] !== "number") return false;
  if (typeof o["interactRadius"] !== "number") return false;
  return true;
}

export function isPuzzlePoint(v: unknown): v is PuzzlePoint {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["x"] !== "number") return false;
  if (typeof o["y"] !== "number") return false;
  return true;
}

export function isPuzzleTap(v: unknown): v is PuzzleTap {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["cycle"] !== "number") return false;
  if (typeof o["ms"] !== "number") return false;
  if (typeof o["x"] !== "number") return false;
  if (typeof o["y"] !== "number") return false;
  return true;
}

export function isRecipeInfo(v: unknown): v is RecipeInfo {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["recipeId"] !== "number") return false;
  if (!(typeof o["line"] === "string" && Object.hasOwn(LIFE_LINE_CODE, o["line"]))) return false;
  if (typeof o["tier"] !== "number") return false;
  if (typeof o["minRank"] !== "number") return false;
  if (typeof o["laborCost"] !== "number") return false;
  if (typeof o["goldFee"] !== "number") return false;
  if (typeof o["outputItemId"] !== "number") return false;
  if (typeof o["outputQty"] !== "number") return false;
  if (typeof o["greatBonusQty"] !== "number") return false;
  if (!(Array.isArray(o["inputs"]) && o["inputs"].every((e: unknown) => isRewardPreviewItem(e)))) return false;
  return true;
}

export function isHelloPayload(v: unknown): v is HelloPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["clientProtoVer"] !== "number") return false;
  if (typeof o["clientBuildHash"] !== "number") return false;
  return true;
}

export function isHelloAckPayload(v: unknown): v is HelloAckPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["serverProtoVer"] !== "number") return false;
  if (typeof o["serverTimeMs"] !== "number") return false;
  if (typeof o["sessionNonce"] !== "string") return false;
  return true;
}

export function isAuthReqPayload(v: unknown): v is AuthReqPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["mode"] !== "number") return false;
  if (typeof o["username"] !== "string") return false;
  if (typeof o["secret"] !== "string") return false;
  return true;
}

export function isAuthResultPayload(v: unknown): v is AuthResultPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["ok"] !== "boolean") return false;
  if (typeof o["accountId"] !== "number") return false;
  if (typeof o["sessionToken"] !== "string") return false;
  if (typeof o["errCode"] !== "number") return false;
  return true;
}

export function isCharListReqPayload(v: unknown): v is CharListReqPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return true;
}

export function isCharListPayload(v: unknown): v is CharListPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!(Array.isArray(o["chars"]) && o["chars"].every((e: unknown) => isCharSummary(e)))) return false;
  return true;
}

export function isEnterWorldReqPayload(v: unknown): v is EnterWorldReqPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["charId"] !== "number") return false;
  return true;
}

export function isEnterWorldOkPayload(v: unknown): v is EnterWorldOkPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["charId"] !== "number") return false;
  if (typeof o["zoneId"] !== "number") return false;
  if (typeof o["tickIndex"] !== "number") return false;
  if (typeof o["spawnX"] !== "number") return false;
  if (typeof o["spawnY"] !== "number") return false;
  return true;
}

export function isZoneInfoPayload(v: unknown): v is ZoneInfoPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["zoneId"] !== "number") return false;
  if (typeof o["name"] !== "string") return false;
  if (typeof o["width"] !== "number") return false;
  if (typeof o["height"] !== "number") return false;
  if (typeof o["tickRate"] !== "number") return false;
  if (typeof o["spawnX"] !== "number") return false;
  if (typeof o["spawnY"] !== "number") return false;
  return true;
}

export function isCharCreateReqPayload(v: unknown): v is CharCreateReqPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["name"] !== "string") return false;
  return true;
}

export function isCharCreateResultPayload(v: unknown): v is CharCreateResultPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["ok"] !== "boolean") return false;
  if (typeof o["charId"] !== "number") return false;
  if (typeof o["name"] !== "string") return false;
  if (typeof o["errCode"] !== "number") return false;
  return true;
}

export function isZoneChangeReqPayload(v: unknown): v is ZoneChangeReqPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["portalId"] !== "number") return false;
  return true;
}

export function isZoneChangePayload(v: unknown): v is ZoneChangePayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["newZoneId"] !== "number") return false;
  if (typeof o["name"] !== "string") return false;
  if (typeof o["width"] !== "number") return false;
  if (typeof o["height"] !== "number") return false;
  if (typeof o["tickRate"] !== "number") return false;
  if (typeof o["spawnX"] !== "number") return false;
  if (typeof o["spawnY"] !== "number") return false;
  if (typeof o["tickIndex"] !== "number") return false;
  return true;
}

export function isPortalListPayload(v: unknown): v is PortalListPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["zoneId"] !== "number") return false;
  if (!(Array.isArray(o["portals"]) && o["portals"].every((e: unknown) => isPortalMarker(e)))) return false;
  return true;
}

export function isInputCmdPayload(v: unknown): v is InputCmdPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["seq"] !== "number") return false;
  if (typeof o["tick"] !== "number") return false;
  if (typeof o["dx"] !== "number") return false;
  if (typeof o["dy"] !== "number") return false;
  if (typeof o["action"] !== "number") return false;
  if (!(typeof o["gait"] === "string" && Object.hasOwn(MOVE_GAIT_CODE, o["gait"]))) return false;
  return true;
}

export function isSnapshotDeltaPayload(v: unknown): v is SnapshotDeltaPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["tickIndex"] !== "number") return false;
  if (typeof o["ackSeq"] !== "number") return false;
  if (!(Array.isArray(o["updates"]) && o["updates"].every((e: unknown) => isSnapshotUpdate(e)))) return false;
  return true;
}

export function isEntitySpawnPayload(v: unknown): v is EntitySpawnPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["entityId"] !== "number") return false;
  if (!(typeof o["type"] === "string" && Object.hasOwn(ENTITY_TYPE_CODE, o["type"]))) return false;
  if (typeof o["x"] !== "number") return false;
  if (typeof o["y"] !== "number") return false;
  if (typeof o["name"] !== "string") return false;
  if (typeof o["level"] !== "number") return false;
  if (typeof o["hp"] !== "number") return false;
  if (typeof o["hpMax"] !== "number") return false;
  if (typeof o["itemId"] !== "number") return false;
  if (typeof o["qty"] !== "number") return false;
  if (typeof o["npcId"] !== "number") return false;
  if (typeof o["monsterDefId"] !== "number") return false;
  return true;
}

export function isEntityDespawnPayload(v: unknown): v is EntityDespawnPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["entityId"] !== "number") return false;
  if (typeof o["reason"] !== "number") return false;
  return true;
}

export function isMoveToPayload(v: unknown): v is MoveToPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["seq"] !== "number") return false;
  if (typeof o["tick"] !== "number") return false;
  if (typeof o["targetX"] !== "number") return false;
  if (typeof o["targetY"] !== "number") return false;
  return true;
}

export function isEntityMetaPayload(v: unknown): v is EntityMetaPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["entityId"] !== "number") return false;
  if (typeof o["hp"] !== "number") return false;
  if (typeof o["hpMax"] !== "number") return false;
  if (typeof o["level"] !== "number") return false;
  return true;
}

export function isMovePathPayload(v: unknown): v is MovePathPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["entityId"] !== "number") return false;
  if (typeof o["seq"] !== "number") return false;
  if (!(Array.isArray(o["waypoints"]) && o["waypoints"].every((e: unknown) => isWaypoint(e)))) return false;
  return true;
}

export function isMoveStopPayload(v: unknown): v is MoveStopPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["seq"] !== "number") return false;
  if (typeof o["tick"] !== "number") return false;
  return true;
}

export function isChatSayPayload(v: unknown): v is ChatSayPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["channel"] !== "number") return false;
  if (typeof o["target"] !== "string") return false;
  if (typeof o["text"] !== "string") return false;
  return true;
}

export function isChatBcastPayload(v: unknown): v is ChatBcastPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["channel"] !== "number") return false;
  if (typeof o["senderId"] !== "number") return false;
  if (typeof o["senderName"] !== "string") return false;
  if (typeof o["text"] !== "string") return false;
  return true;
}

export function isCreateCharacterV2Payload(v: unknown): v is CreateCharacterV2Payload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["name"] !== "string") return false;
  if (typeof o["race"] !== "number") return false;
  if (typeof o["graphPow"] !== "number") return false;
  if (typeof o["graphMag"] !== "number") return false;
  if (typeof o["graphCha"] !== "number") return false;
  if (typeof o["graphLuc"] !== "number") return false;
  return true;
}

export function isCharStatsFullPayload(v: unknown): v is CharStatsFullPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["charId"] !== "number") return false;
  if (typeof o["name"] !== "string") return false;
  if (typeof o["race"] !== "number") return false;
  if (!(isCharGraph(o["graph"]))) return false;
  if (!(isCharStats(o["stats"]))) return false;
  if (typeof o["level"] !== "number") return false;
  if (typeof o["exp"] !== "number") return false;
  if (typeof o["hp"] !== "number") return false;
  if (typeof o["hpMax"] !== "number") return false;
  if (typeof o["mp"] !== "number") return false;
  if (typeof o["mpMax"] !== "number") return false;
  if (typeof o["slv"] !== "number") return false;
  if (typeof o["sexp"] !== "number") return false;
  if (typeof o["slp"] !== "number") return false;
  if (typeof o["gold"] !== "number") return false;
  if (typeof o["zoneId"] !== "number") return false;
  if (typeof o["x"] !== "number") return false;
  if (typeof o["y"] !== "number") return false;
  if (!(isCharDerivedStats(o["derived"]))) return false;
  if (typeof o["freePoints"] !== "number") return false;
  if (typeof o["allocatedPoints"] !== "number") return false;
  return true;
}

export function isCharLevelUpPayload(v: unknown): v is CharLevelUpPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["newLevel"] !== "number") return false;
  if (!(Array.isArray(o["statDeltas"]) && o["statDeltas"].every((e: unknown) => isCharStatDelta(e)))) return false;
  if (typeof o["hpMaxNew"] !== "number") return false;
  if (typeof o["mpMaxNew"] !== "number") return false;
  return true;
}

export function isCharExpGainPayload(v: unknown): v is CharExpGainPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["expDelta"] !== "number") return false;
  if (typeof o["sexpDelta"] !== "number") return false;
  if (typeof o["expTotal"] !== "number") return false;
  if (typeof o["sexpTotal"] !== "number") return false;
  return true;
}

export function isGoldUpdatePayload(v: unknown): v is GoldUpdatePayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["gold"] !== "number") return false;
  if (typeof o["delta"] !== "number") return false;
  return true;
}

export function isStatAllocatePayload(v: unknown): v is StatAllocatePayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["requestId"] !== "number") return false;
  if (!(Array.isArray(o["allocations"]) && o["allocations"].every((e: unknown) => isStatAllocation(e)))) return false;
  return true;
}

export function isStatResetPayload(v: unknown): v is StatResetPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["requestId"] !== "number") return false;
  return true;
}

export function isStatPointsAckPayload(v: unknown): v is StatPointsAckPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["requestId"] !== "number") return false;
  if (typeof o["op"] !== "number") return false;
  if (typeof o["errCode"] !== "number") return false;
  if (typeof o["freePoints"] !== "number") return false;
  return true;
}

export function isTargetSelectPayload(v: unknown): v is TargetSelectPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["targetEntityId"] !== "number") return false;
  return true;
}

export function isTargetAckPayload(v: unknown): v is TargetAckPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["targetEntityId"] !== "number") return false;
  if (typeof o["errCode"] !== "number") return false;
  return true;
}

export function isAttackStartPayload(v: unknown): v is AttackStartPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return true;
}

export function isAttackStopPayload(v: unknown): v is AttackStopPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return true;
}

export function isDamageEventPayload(v: unknown): v is DamageEventPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["attackerEntityId"] !== "number") return false;
  if (typeof o["targetEntityId"] !== "number") return false;
  if (typeof o["damage"] !== "number") return false;
  if (typeof o["isCrit"] !== "boolean") return false;
  if (typeof o["isMiss"] !== "boolean") return false;
  return true;
}

export function isDeathNotifyPayload(v: unknown): v is DeathNotifyPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["victimEntityId"] !== "number") return false;
  if (typeof o["attackerEntityId"] !== "number") return false;
  if (typeof o["expLost"] !== "number") return false;
  if (typeof o["sexpLost"] !== "number") return false;
  return true;
}

export function isRespawnReqPayload(v: unknown): v is RespawnReqPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return true;
}

export function isRespawnOkPayload(v: unknown): v is RespawnOkPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["zoneId"] !== "number") return false;
  if (typeof o["spawnX"] !== "number") return false;
  if (typeof o["spawnY"] !== "number") return false;
  if (typeof o["hp"] !== "number") return false;
  if (typeof o["hpMax"] !== "number") return false;
  if (typeof o["mp"] !== "number") return false;
  if (typeof o["mpMax"] !== "number") return false;
  return true;
}

export function isSkillCastPayload(v: unknown): v is SkillCastPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["skillId"] !== "number") return false;
  if (typeof o["targetEntityId"] !== "number") return false;
  if (typeof o["groundX"] !== "number") return false;
  if (typeof o["groundY"] !== "number") return false;
  return true;
}

export function isSkillListPayload(v: unknown): v is SkillListPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!(Array.isArray(o["skills"]) && o["skills"].every((e: unknown) => isSkillInfo(e)))) return false;
  return true;
}

export function isSkillEffectPayload(v: unknown): v is SkillEffectPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["skillId"] !== "number") return false;
  if (typeof o["casterEntityId"] !== "number") return false;
  if (typeof o["targetEntityId"] !== "number") return false;
  if (!(typeof o["effectKind"] === "string" && Object.hasOwn(SKILL_EFFECT_KIND_CODE, o["effectKind"]))) return false;
  if (typeof o["amount"] !== "number") return false;
  if (typeof o["isCrit"] !== "boolean") return false;
  if (typeof o["isMiss"] !== "boolean") return false;
  if (typeof o["groundX"] !== "number") return false;
  if (typeof o["groundY"] !== "number") return false;
  if (typeof o["castId"] !== "number") return false;
  if (typeof o["impactDelayMs"] !== "number") return false;
  if (typeof o["variant"] !== "number") return false;
  if (typeof o["hitIndex"] !== "number") return false;
  return true;
}

export function isSkillCastAckPayload(v: unknown): v is SkillCastAckPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["skillId"] !== "number") return false;
  if (typeof o["errCode"] !== "number") return false;
  if (typeof o["cooldownMs"] !== "number") return false;
  return true;
}

export function isManaUpdatePayload(v: unknown): v is ManaUpdatePayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["mp"] !== "number") return false;
  if (typeof o["mpMax"] !== "number") return false;
  return true;
}

export function isSkillLearnPayload(v: unknown): v is SkillLearnPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["skillId"] !== "number") return false;
  return true;
}

export function isSkillLevelUpPayload(v: unknown): v is SkillLevelUpPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["skillId"] !== "number") return false;
  return true;
}

export function isSkillLearnAckPayload(v: unknown): v is SkillLearnAckPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["op"] !== "number") return false;
  if (typeof o["skillId"] !== "number") return false;
  if (typeof o["errCode"] !== "number") return false;
  if (typeof o["newLevel"] !== "number") return false;
  if (typeof o["slpAfter"] !== "number") return false;
  return true;
}

export function isSkillLvUpPayload(v: unknown): v is SkillLvUpPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["newSlv"] !== "number") return false;
  if (typeof o["slpGained"] !== "number") return false;
  if (typeof o["slpTotal"] !== "number") return false;
  return true;
}

export function isItemUsePayload(v: unknown): v is ItemUsePayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["slot"] !== "number") return false;
  return true;
}

export function isItemEquipPayload(v: unknown): v is ItemEquipPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["slot"] !== "number") return false;
  return true;
}

export function isItemUnequipPayload(v: unknown): v is ItemUnequipPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["equipSlot"] !== "number") return false;
  return true;
}

export function isItemPickupPayload(v: unknown): v is ItemPickupPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["entityId"] !== "number") return false;
  return true;
}

export function isInventoryListPayload(v: unknown): v is InventoryListPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!(Array.isArray(o["slots"]) && o["slots"].every((e: unknown) => isInventoryEntry(e)))) return false;
  if (!(isEquipmentSlots(o["equipment"]))) return false;
  return true;
}

export function isInventoryUpdatePayload(v: unknown): v is InventoryUpdatePayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!(Array.isArray(o["slots"]) && o["slots"].every((e: unknown) => isInventoryEntry(e)))) return false;
  if (!(isEquipmentSlots(o["equipment"]))) return false;
  return true;
}

export function isItemUseAckPayload(v: unknown): v is ItemUseAckPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["slot"] !== "number") return false;
  if (typeof o["itemId"] !== "number") return false;
  if (typeof o["errCode"] !== "number") return false;
  if (typeof o["healHp"] !== "number") return false;
  if (typeof o["healMp"] !== "number") return false;
  return true;
}

export function isItemPickupAckPayload(v: unknown): v is ItemPickupAckPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["entityId"] !== "number") return false;
  if (typeof o["errCode"] !== "number") return false;
  return true;
}

export function isNpcInteractPayload(v: unknown): v is NpcInteractPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["entityId"] !== "number") return false;
  return true;
}

export function isNpcDialogPayload(v: unknown): v is NpcDialogPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["entityId"] !== "number") return false;
  if (typeof o["npcId"] !== "number") return false;
  if (typeof o["npcName"] !== "string") return false;
  if (typeof o["dialogueId"] !== "number") return false;
  if (typeof o["entry"] !== "string") return false;
  if (!(Array.isArray(o["nodes"]) && o["nodes"].every((e: unknown) => isDialogNode(e)))) return false;
  return true;
}

export function isNpcActionPayload(v: unknown): v is NpcActionPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["entityId"] !== "number") return false;
  if (typeof o["dialogueId"] !== "number") return false;
  if (typeof o["nodeId"] !== "string") return false;
  if (typeof o["optionIndex"] !== "number") return false;
  if (typeof o["actionType"] !== "string") return false;
  if (typeof o["questId"] !== "number") return false;
  if (typeof o["chosenIndex"] !== "number") return false;
  return true;
}

export function isQuestListPayload(v: unknown): v is QuestListPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!(Array.isArray(o["active"]) && o["active"].every((e: unknown) => isQuestLogEntry(e)))) return false;
  if (!(Array.isArray(o["completed"]) && o["completed"].every((e: unknown) => typeof e === "number"))) return false;
  if (!(Array.isArray(o["dailyDoneToday"]) && o["dailyDoneToday"].every((e: unknown) => typeof e === "number"))) return false;
  return true;
}

export function isQuestProgressPayload(v: unknown): v is QuestProgressPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["questId"] !== "number") return false;
  if (typeof o["objectiveIndex"] !== "number") return false;
  if (typeof o["current"] !== "number") return false;
  if (typeof o["required"] !== "number") return false;
  if (typeof o["questCompletable"] !== "boolean") return false;
  return true;
}

export function isQuestActionAckPayload(v: unknown): v is QuestActionAckPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["op"] !== "number") return false;
  if (typeof o["questId"] !== "number") return false;
  if (typeof o["errCode"] !== "number") return false;
  if (o["rewards"] !== undefined && !(isQuestGrantSummary(o["rewards"]))) return false;
  return true;
}

export function isQuestAbandonPayload(v: unknown): v is QuestAbandonPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["questId"] !== "number") return false;
  return true;
}

export function isQuestNpcMarkersPayload(v: unknown): v is QuestNpcMarkersPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!(Array.isArray(o["npcs"]) && o["npcs"].every((e: unknown) => isNpcQuestMarker(e)))) return false;
  return true;
}

export function isShopListPayload(v: unknown): v is ShopListPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["entityId"] !== "number") return false;
  if (typeof o["shopId"] !== "number") return false;
  if (typeof o["name"] !== "string") return false;
  if (!(Array.isArray(o["offers"]) && o["offers"].every((e: unknown) => isShopOffer(e)))) return false;
  return true;
}

export function isShopBuyPayload(v: unknown): v is ShopBuyPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["entityId"] !== "number") return false;
  if (typeof o["shopId"] !== "number") return false;
  if (typeof o["itemId"] !== "number") return false;
  if (typeof o["qty"] !== "number") return false;
  if (typeof o["requestId"] !== "number") return false;
  return true;
}

export function isShopSellPayload(v: unknown): v is ShopSellPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["entityId"] !== "number") return false;
  if (typeof o["shopId"] !== "number") return false;
  if (typeof o["itemId"] !== "number") return false;
  if (typeof o["slot"] !== "number") return false;
  if (typeof o["qty"] !== "number") return false;
  if (typeof o["requestId"] !== "number") return false;
  return true;
}

export function isShopAckPayload(v: unknown): v is ShopAckPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["requestId"] !== "number") return false;
  if (typeof o["op"] !== "number") return false;
  if (typeof o["errCode"] !== "number") return false;
  if (typeof o["gold"] !== "number") return false;
  return true;
}

export function isUiPreferencesSetPayload(v: unknown): v is UiPreferencesSetPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (o["quickSlots"] !== undefined && !(Array.isArray(o["quickSlots"]) && o["quickSlots"].every((e: unknown) => typeof e === "number"))) return false;
  if (o["trackedQuestIds"] !== undefined && !(Array.isArray(o["trackedQuestIds"]) && o["trackedQuestIds"].every((e: unknown) => typeof e === "number"))) return false;
  return true;
}

export function isUiPreferencesPayload(v: unknown): v is UiPreferencesPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!(Array.isArray(o["quickSlots"]) && o["quickSlots"].every((e: unknown) => typeof e === "number"))) return false;
  if (!(Array.isArray(o["trackedQuestIds"]) && o["trackedQuestIds"].every((e: unknown) => typeof e === "number"))) return false;
  if (typeof o["hasSavedSettings"] !== "boolean") return false;
  return true;
}

export function isGatherStartPayload(v: unknown): v is GatherStartPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["nodeEid"] !== "number") return false;
  return true;
}

export function isLifeCancelPayload(v: unknown): v is LifeCancelPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return true;
}

export function isLifeChannelPayload(v: unknown): v is LifeChannelPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["channelId"] !== "number") return false;
  if (!(typeof o["kind"] === "string" && Object.hasOwn(LIFE_CHANNEL_KIND_CODE, o["kind"]))) return false;
  if (typeof o["targetEid"] !== "number") return false;
  if (typeof o["durationMs"] !== "number") return false;
  if (typeof o["requestId"] !== "number") return false;
  if (typeof o["code"] !== "number") return false;
  return true;
}

export function isLifeResultPayload(v: unknown): v is LifeResultPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["channelId"] !== "number") return false;
  if (typeof o["code"] !== "number") return false;
  if (!(Array.isArray(o["items"]) && o["items"].every((e: unknown) => isRewardPreviewItem(e)))) return false;
  if (!(typeof o["line"] === "string" && Object.hasOwn(LIFE_LINE_CODE, o["line"]))) return false;
  if (typeof o["profGain"] !== "number") return false;
  return true;
}

export function isLifeStatusPayload(v: unknown): v is LifeStatusPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["labor"] !== "number") return false;
  if (typeof o["laborMax"] !== "number") return false;
  if (typeof o["msToNext"] !== "number") return false;
  if (!(Array.isArray(o["lines"]) && o["lines"].every((e: unknown) => isLifeLineInfo(e)))) return false;
  return true;
}

export function isNodeCatalogPayload(v: unknown): v is NodeCatalogPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!(Array.isArray(o["nodes"]) && o["nodes"].every((e: unknown) => isNodeDefInfo(e)))) return false;
  return true;
}

export function isGatherPuzzlePayload(v: unknown): v is GatherPuzzlePayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["channelId"] !== "number") return false;
  if (!(typeof o["kind"] === "string" && Object.hasOwn(GATHER_PUZZLE_KIND_CODE, o["kind"]))) return false;
  if (typeof o["boardW"] !== "number") return false;
  if (typeof o["boardH"] !== "number") return false;
  if (typeof o["readyMs"] !== "number") return false;
  if (typeof o["cycleMs"] !== "number") return false;
  if (typeof o["maxCycles"] !== "number") return false;
  if (typeof o["bandHeight"] !== "number") return false;
  if (typeof o["pathWidth"] !== "number") return false;
  if (typeof o["circleRadius"] !== "number") return false;
  if (!(Array.isArray(o["points"]) && o["points"].every((e: unknown) => isPuzzlePoint(e)))) return false;
  return true;
}

export function isGatherTracePayload(v: unknown): v is GatherTracePayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["channelId"] !== "number") return false;
  if (typeof o["cycle"] !== "number") return false;
  if (typeof o["pressMs"] !== "number") return false;
  if (typeof o["tailMs"] !== "number") return false;
  if (!(Array.isArray(o["samples"]) && o["samples"].every((e: unknown) => isPuzzlePoint(e)))) return false;
  return true;
}

export function isGatherTapsPayload(v: unknown): v is GatherTapsPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["channelId"] !== "number") return false;
  if (!(Array.isArray(o["taps"]) && o["taps"].every((e: unknown) => isPuzzleTap(e)))) return false;
  return true;
}

export function isRecipeListPayload(v: unknown): v is RecipeListPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["npcEid"] !== "number") return false;
  if (typeof o["stationId"] !== "number") return false;
  if (typeof o["name"] !== "string") return false;
  if (!(Array.isArray(o["recipes"]) && o["recipes"].every((e: unknown) => isRecipeInfo(e)))) return false;
  return true;
}

export function isCraftReqPayload(v: unknown): v is CraftReqPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["npcEid"] !== "number") return false;
  if (typeof o["recipeId"] !== "number") return false;
  if (typeof o["count"] !== "number") return false;
  if (typeof o["requestId"] !== "number") return false;
  return true;
}

export function isCraftAckPayload(v: unknown): v is CraftAckPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["requestId"] !== "number") return false;
  if (typeof o["errCode"] !== "number") return false;
  if (typeof o["made"] !== "number") return false;
  if (typeof o["greats"] !== "number") return false;
  if (typeof o["gold"] !== "number") return false;
  if (typeof o["outputItemId"] !== "number") return false;
  return true;
}

export function isPingPayload(v: unknown): v is PingPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["clientTimeMs"] !== "number") return false;
  return true;
}

export function isPongPayload(v: unknown): v is PongPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["clientTimeMs"] !== "number") return false;
  if (typeof o["serverTimeMs"] !== "number") return false;
  return true;
}

export function isKickPayload(v: unknown): v is KickPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["reason"] !== "number") return false;
  if (typeof o["detail"] !== "string") return false;
  return true;
}

export interface PayloadById {
  [PACKET_ID.HELLO]: HelloPayload;
  [PACKET_ID.HELLO_ACK]: HelloAckPayload;
  [PACKET_ID.AUTH_REQ]: AuthReqPayload;
  [PACKET_ID.AUTH_RESULT]: AuthResultPayload;
  [PACKET_ID.CHAR_LIST_REQ]: CharListReqPayload;
  [PACKET_ID.CHAR_LIST]: CharListPayload;
  [PACKET_ID.ENTER_WORLD_REQ]: EnterWorldReqPayload;
  [PACKET_ID.ENTER_WORLD_OK]: EnterWorldOkPayload;
  [PACKET_ID.ZONE_INFO]: ZoneInfoPayload;
  [PACKET_ID.CHAR_CREATE_REQ]: CharCreateReqPayload;
  [PACKET_ID.CHAR_CREATE_RESULT]: CharCreateResultPayload;
  [PACKET_ID.ZONE_CHANGE_REQ]: ZoneChangeReqPayload;
  [PACKET_ID.ZONE_CHANGE]: ZoneChangePayload;
  [PACKET_ID.PORTAL_LIST]: PortalListPayload;
  [PACKET_ID.INPUT_CMD]: InputCmdPayload;
  [PACKET_ID.SNAPSHOT_DELTA]: SnapshotDeltaPayload;
  [PACKET_ID.ENTITY_SPAWN]: EntitySpawnPayload;
  [PACKET_ID.ENTITY_DESPAWN]: EntityDespawnPayload;
  [PACKET_ID.MOVE_TO]: MoveToPayload;
  [PACKET_ID.ENTITY_META]: EntityMetaPayload;
  [PACKET_ID.MOVE_PATH]: MovePathPayload;
  [PACKET_ID.MOVE_STOP]: MoveStopPayload;
  [PACKET_ID.CHAT_SAY]: ChatSayPayload;
  [PACKET_ID.CHAT_BCAST]: ChatBcastPayload;
  [PACKET_ID.CREATE_CHARACTER_V2]: CreateCharacterV2Payload;
  [PACKET_ID.CHAR_STATS_FULL]: CharStatsFullPayload;
  [PACKET_ID.CHAR_LEVEL_UP]: CharLevelUpPayload;
  [PACKET_ID.CHAR_EXP_GAIN]: CharExpGainPayload;
  [PACKET_ID.GOLD_UPDATE]: GoldUpdatePayload;
  [PACKET_ID.STAT_ALLOCATE]: StatAllocatePayload;
  [PACKET_ID.STAT_RESET]: StatResetPayload;
  [PACKET_ID.STAT_POINTS_ACK]: StatPointsAckPayload;
  [PACKET_ID.TARGET_SELECT]: TargetSelectPayload;
  [PACKET_ID.TARGET_ACK]: TargetAckPayload;
  [PACKET_ID.ATTACK_START]: AttackStartPayload;
  [PACKET_ID.ATTACK_STOP]: AttackStopPayload;
  [PACKET_ID.DAMAGE_EVENT]: DamageEventPayload;
  [PACKET_ID.DEATH_NOTIFY]: DeathNotifyPayload;
  [PACKET_ID.RESPAWN_REQ]: RespawnReqPayload;
  [PACKET_ID.RESPAWN_OK]: RespawnOkPayload;
  [PACKET_ID.SKILL_CAST]: SkillCastPayload;
  [PACKET_ID.SKILL_LIST]: SkillListPayload;
  [PACKET_ID.SKILL_EFFECT]: SkillEffectPayload;
  [PACKET_ID.SKILL_CAST_ACK]: SkillCastAckPayload;
  [PACKET_ID.MANA_UPDATE]: ManaUpdatePayload;
  [PACKET_ID.SKILL_LEARN]: SkillLearnPayload;
  [PACKET_ID.SKILL_LEVEL_UP]: SkillLevelUpPayload;
  [PACKET_ID.SKILL_LEARN_ACK]: SkillLearnAckPayload;
  [PACKET_ID.SKILL_LV_UP]: SkillLvUpPayload;
  [PACKET_ID.ITEM_USE]: ItemUsePayload;
  [PACKET_ID.ITEM_EQUIP]: ItemEquipPayload;
  [PACKET_ID.ITEM_UNEQUIP]: ItemUnequipPayload;
  [PACKET_ID.ITEM_PICKUP]: ItemPickupPayload;
  [PACKET_ID.INVENTORY_LIST]: InventoryListPayload;
  [PACKET_ID.INVENTORY_UPDATE]: InventoryUpdatePayload;
  [PACKET_ID.ITEM_USE_ACK]: ItemUseAckPayload;
  [PACKET_ID.ITEM_PICKUP_ACK]: ItemPickupAckPayload;
  [PACKET_ID.NPC_INTERACT]: NpcInteractPayload;
  [PACKET_ID.NPC_DIALOG]: NpcDialogPayload;
  [PACKET_ID.NPC_ACTION]: NpcActionPayload;
  [PACKET_ID.QUEST_LIST]: QuestListPayload;
  [PACKET_ID.QUEST_PROGRESS]: QuestProgressPayload;
  [PACKET_ID.QUEST_ACTION_ACK]: QuestActionAckPayload;
  [PACKET_ID.QUEST_ABANDON]: QuestAbandonPayload;
  [PACKET_ID.QUEST_NPC_MARKERS]: QuestNpcMarkersPayload;
  [PACKET_ID.SHOP_LIST]: ShopListPayload;
  [PACKET_ID.SHOP_BUY]: ShopBuyPayload;
  [PACKET_ID.SHOP_SELL]: ShopSellPayload;
  [PACKET_ID.SHOP_ACK]: ShopAckPayload;
  [PACKET_ID.UI_PREFERENCES_SET]: UiPreferencesSetPayload;
  [PACKET_ID.UI_PREFERENCES]: UiPreferencesPayload;
  [PACKET_ID.GATHER_START]: GatherStartPayload;
  [PACKET_ID.LIFE_CANCEL]: LifeCancelPayload;
  [PACKET_ID.LIFE_CHANNEL]: LifeChannelPayload;
  [PACKET_ID.LIFE_RESULT]: LifeResultPayload;
  [PACKET_ID.LIFE_STATUS]: LifeStatusPayload;
  [PACKET_ID.NODE_CATALOG]: NodeCatalogPayload;
  [PACKET_ID.GATHER_PUZZLE]: GatherPuzzlePayload;
  [PACKET_ID.GATHER_TRACE]: GatherTracePayload;
  [PACKET_ID.GATHER_TAPS]: GatherTapsPayload;
  [PACKET_ID.RECIPE_LIST]: RecipeListPayload;
  [PACKET_ID.CRAFT_REQ]: CraftReqPayload;
  [PACKET_ID.CRAFT_ACK]: CraftAckPayload;
  [PACKET_ID.PING]: PingPayload;
  [PACKET_ID.PONG]: PongPayload;
  [PACKET_ID.KICK]: KickPayload;
}

/** 서버 → 클라 패킷 id — 타입화 송신 표면(send<I>(id, PayloadOf<I>))이 방향이 틀린 id를 컴파일 오류로 막는다. */
export type S2CPacketId =
  | typeof PACKET_ID.HELLO_ACK
  | typeof PACKET_ID.AUTH_RESULT
  | typeof PACKET_ID.CHAR_LIST
  | typeof PACKET_ID.ENTER_WORLD_OK
  | typeof PACKET_ID.ZONE_INFO
  | typeof PACKET_ID.CHAR_CREATE_RESULT
  | typeof PACKET_ID.ZONE_CHANGE
  | typeof PACKET_ID.PORTAL_LIST
  | typeof PACKET_ID.SNAPSHOT_DELTA
  | typeof PACKET_ID.ENTITY_SPAWN
  | typeof PACKET_ID.ENTITY_DESPAWN
  | typeof PACKET_ID.ENTITY_META
  | typeof PACKET_ID.MOVE_PATH
  | typeof PACKET_ID.CHAT_BCAST
  | typeof PACKET_ID.CHAR_STATS_FULL
  | typeof PACKET_ID.CHAR_LEVEL_UP
  | typeof PACKET_ID.CHAR_EXP_GAIN
  | typeof PACKET_ID.GOLD_UPDATE
  | typeof PACKET_ID.STAT_POINTS_ACK
  | typeof PACKET_ID.TARGET_ACK
  | typeof PACKET_ID.DAMAGE_EVENT
  | typeof PACKET_ID.DEATH_NOTIFY
  | typeof PACKET_ID.RESPAWN_OK
  | typeof PACKET_ID.SKILL_LIST
  | typeof PACKET_ID.SKILL_EFFECT
  | typeof PACKET_ID.SKILL_CAST_ACK
  | typeof PACKET_ID.MANA_UPDATE
  | typeof PACKET_ID.SKILL_LEARN_ACK
  | typeof PACKET_ID.SKILL_LV_UP
  | typeof PACKET_ID.INVENTORY_LIST
  | typeof PACKET_ID.INVENTORY_UPDATE
  | typeof PACKET_ID.ITEM_USE_ACK
  | typeof PACKET_ID.ITEM_PICKUP_ACK
  | typeof PACKET_ID.NPC_DIALOG
  | typeof PACKET_ID.QUEST_LIST
  | typeof PACKET_ID.QUEST_PROGRESS
  | typeof PACKET_ID.QUEST_ACTION_ACK
  | typeof PACKET_ID.QUEST_NPC_MARKERS
  | typeof PACKET_ID.SHOP_LIST
  | typeof PACKET_ID.SHOP_ACK
  | typeof PACKET_ID.UI_PREFERENCES
  | typeof PACKET_ID.LIFE_CHANNEL
  | typeof PACKET_ID.LIFE_RESULT
  | typeof PACKET_ID.LIFE_STATUS
  | typeof PACKET_ID.NODE_CATALOG
  | typeof PACKET_ID.GATHER_PUZZLE
  | typeof PACKET_ID.RECIPE_LIST
  | typeof PACKET_ID.CRAFT_ACK
  | typeof PACKET_ID.PONG
  | typeof PACKET_ID.KICK;

/** 클라 → 서버 패킷 id — 타입화 송신 표면(send<I>(id, PayloadOf<I>))이 방향이 틀린 id를 컴파일 오류로 막는다. */
export type C2SPacketId =
  | typeof PACKET_ID.HELLO
  | typeof PACKET_ID.AUTH_REQ
  | typeof PACKET_ID.CHAR_LIST_REQ
  | typeof PACKET_ID.ENTER_WORLD_REQ
  | typeof PACKET_ID.CHAR_CREATE_REQ
  | typeof PACKET_ID.ZONE_CHANGE_REQ
  | typeof PACKET_ID.INPUT_CMD
  | typeof PACKET_ID.MOVE_TO
  | typeof PACKET_ID.MOVE_STOP
  | typeof PACKET_ID.CHAT_SAY
  | typeof PACKET_ID.CREATE_CHARACTER_V2
  | typeof PACKET_ID.STAT_ALLOCATE
  | typeof PACKET_ID.STAT_RESET
  | typeof PACKET_ID.TARGET_SELECT
  | typeof PACKET_ID.ATTACK_START
  | typeof PACKET_ID.ATTACK_STOP
  | typeof PACKET_ID.RESPAWN_REQ
  | typeof PACKET_ID.SKILL_CAST
  | typeof PACKET_ID.SKILL_LEARN
  | typeof PACKET_ID.SKILL_LEVEL_UP
  | typeof PACKET_ID.ITEM_USE
  | typeof PACKET_ID.ITEM_EQUIP
  | typeof PACKET_ID.ITEM_UNEQUIP
  | typeof PACKET_ID.ITEM_PICKUP
  | typeof PACKET_ID.NPC_INTERACT
  | typeof PACKET_ID.NPC_ACTION
  | typeof PACKET_ID.QUEST_ABANDON
  | typeof PACKET_ID.SHOP_BUY
  | typeof PACKET_ID.SHOP_SELL
  | typeof PACKET_ID.UI_PREFERENCES_SET
  | typeof PACKET_ID.GATHER_START
  | typeof PACKET_ID.LIFE_CANCEL
  | typeof PACKET_ID.GATHER_TRACE
  | typeof PACKET_ID.GATHER_TAPS
  | typeof PACKET_ID.CRAFT_REQ
  | typeof PACKET_ID.PING;

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer R) => void ? R : never;
/**
 * 송신 페이로드 타입 — id가 유니온(삼항 등)이면 PayloadById[I]가 페이로드 유니온으로 넓어져 검사가 꺼지므로 교차로 바꿔 모든 후보를
 * 만족하게 한다. & object는 필드 없는 패킷(빈 interface — 원시값까지 받는다)에 원시값이 들어가는 것을 막는다.
 */
export type PayloadOf<I extends PacketId> = UnionToIntersection<PayloadById[I]> & object;

export const PACKET_DIRECTION: Readonly<Partial<Record<number, "C2S" | "S2C">>> = {
  [PACKET_ID.HELLO]: "C2S",
  [PACKET_ID.HELLO_ACK]: "S2C",
  [PACKET_ID.AUTH_REQ]: "C2S",
  [PACKET_ID.AUTH_RESULT]: "S2C",
  [PACKET_ID.CHAR_LIST_REQ]: "C2S",
  [PACKET_ID.CHAR_LIST]: "S2C",
  [PACKET_ID.ENTER_WORLD_REQ]: "C2S",
  [PACKET_ID.ENTER_WORLD_OK]: "S2C",
  [PACKET_ID.ZONE_INFO]: "S2C",
  [PACKET_ID.CHAR_CREATE_REQ]: "C2S",
  [PACKET_ID.CHAR_CREATE_RESULT]: "S2C",
  [PACKET_ID.ZONE_CHANGE_REQ]: "C2S",
  [PACKET_ID.ZONE_CHANGE]: "S2C",
  [PACKET_ID.PORTAL_LIST]: "S2C",
  [PACKET_ID.INPUT_CMD]: "C2S",
  [PACKET_ID.SNAPSHOT_DELTA]: "S2C",
  [PACKET_ID.ENTITY_SPAWN]: "S2C",
  [PACKET_ID.ENTITY_DESPAWN]: "S2C",
  [PACKET_ID.MOVE_TO]: "C2S",
  [PACKET_ID.ENTITY_META]: "S2C",
  [PACKET_ID.MOVE_PATH]: "S2C",
  [PACKET_ID.MOVE_STOP]: "C2S",
  [PACKET_ID.CHAT_SAY]: "C2S",
  [PACKET_ID.CHAT_BCAST]: "S2C",
  [PACKET_ID.CREATE_CHARACTER_V2]: "C2S",
  [PACKET_ID.CHAR_STATS_FULL]: "S2C",
  [PACKET_ID.CHAR_LEVEL_UP]: "S2C",
  [PACKET_ID.CHAR_EXP_GAIN]: "S2C",
  [PACKET_ID.GOLD_UPDATE]: "S2C",
  [PACKET_ID.STAT_ALLOCATE]: "C2S",
  [PACKET_ID.STAT_RESET]: "C2S",
  [PACKET_ID.STAT_POINTS_ACK]: "S2C",
  [PACKET_ID.TARGET_SELECT]: "C2S",
  [PACKET_ID.TARGET_ACK]: "S2C",
  [PACKET_ID.ATTACK_START]: "C2S",
  [PACKET_ID.ATTACK_STOP]: "C2S",
  [PACKET_ID.DAMAGE_EVENT]: "S2C",
  [PACKET_ID.DEATH_NOTIFY]: "S2C",
  [PACKET_ID.RESPAWN_REQ]: "C2S",
  [PACKET_ID.RESPAWN_OK]: "S2C",
  [PACKET_ID.SKILL_CAST]: "C2S",
  [PACKET_ID.SKILL_LIST]: "S2C",
  [PACKET_ID.SKILL_EFFECT]: "S2C",
  [PACKET_ID.SKILL_CAST_ACK]: "S2C",
  [PACKET_ID.MANA_UPDATE]: "S2C",
  [PACKET_ID.SKILL_LEARN]: "C2S",
  [PACKET_ID.SKILL_LEVEL_UP]: "C2S",
  [PACKET_ID.SKILL_LEARN_ACK]: "S2C",
  [PACKET_ID.SKILL_LV_UP]: "S2C",
  [PACKET_ID.ITEM_USE]: "C2S",
  [PACKET_ID.ITEM_EQUIP]: "C2S",
  [PACKET_ID.ITEM_UNEQUIP]: "C2S",
  [PACKET_ID.ITEM_PICKUP]: "C2S",
  [PACKET_ID.INVENTORY_LIST]: "S2C",
  [PACKET_ID.INVENTORY_UPDATE]: "S2C",
  [PACKET_ID.ITEM_USE_ACK]: "S2C",
  [PACKET_ID.ITEM_PICKUP_ACK]: "S2C",
  [PACKET_ID.NPC_INTERACT]: "C2S",
  [PACKET_ID.NPC_DIALOG]: "S2C",
  [PACKET_ID.NPC_ACTION]: "C2S",
  [PACKET_ID.QUEST_LIST]: "S2C",
  [PACKET_ID.QUEST_PROGRESS]: "S2C",
  [PACKET_ID.QUEST_ACTION_ACK]: "S2C",
  [PACKET_ID.QUEST_ABANDON]: "C2S",
  [PACKET_ID.QUEST_NPC_MARKERS]: "S2C",
  [PACKET_ID.SHOP_LIST]: "S2C",
  [PACKET_ID.SHOP_BUY]: "C2S",
  [PACKET_ID.SHOP_SELL]: "C2S",
  [PACKET_ID.SHOP_ACK]: "S2C",
  [PACKET_ID.UI_PREFERENCES_SET]: "C2S",
  [PACKET_ID.UI_PREFERENCES]: "S2C",
  [PACKET_ID.GATHER_START]: "C2S",
  [PACKET_ID.LIFE_CANCEL]: "C2S",
  [PACKET_ID.LIFE_CHANNEL]: "S2C",
  [PACKET_ID.LIFE_RESULT]: "S2C",
  [PACKET_ID.LIFE_STATUS]: "S2C",
  [PACKET_ID.NODE_CATALOG]: "S2C",
  [PACKET_ID.GATHER_PUZZLE]: "S2C",
  [PACKET_ID.GATHER_TRACE]: "C2S",
  [PACKET_ID.GATHER_TAPS]: "C2S",
  [PACKET_ID.RECIPE_LIST]: "S2C",
  [PACKET_ID.CRAFT_REQ]: "C2S",
  [PACKET_ID.CRAFT_ACK]: "S2C",
  [PACKET_ID.PING]: "C2S",
  [PACKET_ID.PONG]: "S2C",
  [PACKET_ID.KICK]: "S2C",
};

/** 패킷별 최악 본문 바이트(스키마 max 기준, 모든 optional 존재 — 스키마가 ≤ 65535를 강제). */
export const MAX_BODY_BYTES: Readonly<Partial<Record<number, number>>> = {
  [PACKET_ID.HELLO]: 8,
  [PACKET_ID.HELLO_ACK]: 78,
  [PACKET_ID.AUTH_REQ]: 328,
  [PACKET_ID.AUTH_RESULT]: 75,
  [PACKET_ID.CHAR_LIST_REQ]: 0,
  [PACKET_ID.CHAR_LIST]: 1282,
  [PACKET_ID.ENTER_WORLD_REQ]: 4,
  [PACKET_ID.ENTER_WORLD_OK]: 20,
  [PACKET_ID.ZONE_INFO]: 90,
  [PACKET_ID.CHAR_CREATE_REQ]: 66,
  [PACKET_ID.CHAR_CREATE_RESULT]: 75,
  [PACKET_ID.ZONE_CHANGE_REQ]: 4,
  [PACKET_ID.ZONE_CHANGE]: 94,
  [PACKET_ID.PORTAL_LIST]: 2630,
  [PACKET_ID.INPUT_CMD]: 21,
  [PACKET_ID.SNAPSHOT_DELTA]: 65530,
  [PACKET_ID.ENTITY_SPAWN]: 109,
  [PACKET_ID.ENTITY_DESPAWN]: 8,
  [PACKET_ID.MOVE_TO]: 16,
  [PACKET_ID.ENTITY_META]: 16,
  [PACKET_ID.MOVE_PATH]: 8202,
  [PACKET_ID.MOVE_STOP]: 8,
  [PACKET_ID.CHAT_SAY]: 672,
  [PACKET_ID.CHAT_BCAST]: 678,
  [PACKET_ID.CREATE_CHARACTER_V2]: 86,
  [PACKET_ID.CHAR_STATS_FULL]: 376,
  [PACKET_ID.CHAR_LEVEL_UP]: 50246,
  [PACKET_ID.CHAR_EXP_GAIN]: 16,
  [PACKET_ID.GOLD_UPDATE]: 8,
  [PACKET_ID.STAT_ALLOCATE]: 66,
  [PACKET_ID.STAT_RESET]: 4,
  [PACKET_ID.STAT_POINTS_ACK]: 16,
  [PACKET_ID.TARGET_SELECT]: 4,
  [PACKET_ID.TARGET_ACK]: 8,
  [PACKET_ID.ATTACK_START]: 0,
  [PACKET_ID.ATTACK_STOP]: 0,
  [PACKET_ID.DAMAGE_EVENT]: 14,
  [PACKET_ID.DEATH_NOTIFY]: 16,
  [PACKET_ID.RESPAWN_REQ]: 0,
  [PACKET_ID.RESPAWN_OK]: 28,
  [PACKET_ID.SKILL_CAST]: 16,
  [PACKET_ID.SKILL_LIST]: 28674,
  [PACKET_ID.SKILL_EFFECT]: 37,
  [PACKET_ID.SKILL_CAST_ACK]: 12,
  [PACKET_ID.MANA_UPDATE]: 8,
  [PACKET_ID.SKILL_LEARN]: 4,
  [PACKET_ID.SKILL_LEVEL_UP]: 4,
  [PACKET_ID.SKILL_LEARN_ACK]: 20,
  [PACKET_ID.SKILL_LV_UP]: 12,
  [PACKET_ID.ITEM_USE]: 4,
  [PACKET_ID.ITEM_EQUIP]: 4,
  [PACKET_ID.ITEM_UNEQUIP]: 4,
  [PACKET_ID.ITEM_PICKUP]: 4,
  [PACKET_ID.INVENTORY_LIST]: 322,
  [PACKET_ID.INVENTORY_UPDATE]: 322,
  [PACKET_ID.ITEM_USE_ACK]: 20,
  [PACKET_ID.ITEM_PICKUP_ACK]: 8,
  [PACKET_ID.NPC_INTERACT]: 4,
  [PACKET_ID.NPC_DIALOG]: 64492,
  [PACKET_ID.NPC_ACTION]: 120,
  [PACKET_ID.QUEST_LIST]: 64378,
  [PACKET_ID.QUEST_PROGRESS]: 17,
  [PACKET_ID.QUEST_ACTION_ACK]: 193,
  [PACKET_ID.QUEST_ABANDON]: 4,
  [PACKET_ID.QUEST_NPC_MARKERS]: 8194,
  [PACKET_ID.SHOP_LIST]: 3324,
  [PACKET_ID.SHOP_BUY]: 20,
  [PACKET_ID.SHOP_SELL]: 24,
  [PACKET_ID.SHOP_ACK]: 16,
  [PACKET_ID.UI_PREFERENCES_SET]: 49,
  [PACKET_ID.UI_PREFERENCES]: 49,
  [PACKET_ID.GATHER_START]: 4,
  [PACKET_ID.LIFE_CANCEL]: 0,
  [PACKET_ID.LIFE_CHANNEL]: 18,
  [PACKET_ID.LIFE_RESULT]: 76,
  [PACKET_ID.LIFE_STATUS]: 84,
  [PACKET_ID.NODE_CATALOG]: 706,
  [PACKET_ID.GATHER_PUZZLE]: 70,
  [PACKET_ID.GATHER_TRACE]: 650,
  [PACKET_ID.GATHER_TAPS]: 118,
  [PACKET_ID.RECIPE_LIST]: 9932,
  [PACKET_ID.CRAFT_REQ]: 16,
  [PACKET_ID.CRAFT_ACK]: 21,
  [PACKET_ID.PING]: 8,
  [PACKET_ID.PONG]: 16,
  [PACKET_ID.KICK]: 606,
};

/** 필드별 와이어 상한(string = UTF-8 바이트, array = 원소 수) — 데이터 로더·입력 UI가 같은 값을 강제한다. */
export const WIRE_LIMITS = {
  SkillInfo: { name: 64 },
  DialogAction: { type: 32 },
  DialogOption: { label: 240, next: 64 },
  DialogNode: { id: 64, speaker: 66, pages: 4, "pages.item": 600, options: 8 },
  QuestLogObjective: { text: 96 },
  QuestRewardPreview: { fixed: 8, choice: 8, random: 8, bonus: 8 },
  QuestLogEntry: { name: 120, description: 1500, objectives: 8 },
  QuestGrantSummary: { items: 18 },
  PortalMarker: { name: 64 },
  CharSummary: { name: 66 },
  RecipeInfo: { inputs: 6 },
  HELLO_ACK: { sessionNonce: 64 },
  AUTH_REQ: { username: 64, secret: 256 },
  AUTH_RESULT: { sessionToken: 64 },
  CHAR_LIST: { chars: 16 },
  ZONE_INFO: { name: 64 },
  CHAR_CREATE_REQ: { name: 64 },
  CHAR_CREATE_RESULT: { name: 64 },
  ZONE_CHANGE: { name: 64 },
  PORTAL_LIST: { portals: 32 },
  SNAPSHOT_DELTA: { updates: 5460 },
  ENTITY_SPAWN: { name: 66 },
  MOVE_PATH: { waypoints: 1024 },
  CHAT_SAY: { target: 64, text: 600 },
  CHAT_BCAST: { senderName: 66, text: 600 },
  CREATE_CHARACTER_V2: { name: 64 },
  CHAR_STATS_FULL: { name: 66 },
  CHAR_LEVEL_UP: { statDeltas: 3588 },
  STAT_ALLOCATE: { allocations: 12 },
  SKILL_LIST: { skills: 256 },
  INVENTORY_LIST: { slots: 24 },
  NPC_DIALOG: { npcName: 66, entry: 64, nodes: 12 },
  NPC_ACTION: { nodeId: 64, actionType: 32 },
  QUEST_LIST: { active: 20, completed: 1024, dailyDoneToday: 1024 },
  QUEST_NPC_MARKERS: { npcs: 1024 },
  SHOP_LIST: { name: 240, offers: 256 },
  UI_PREFERENCES_SET: { quickSlots: 6, trackedQuestIds: 5 },
  UI_PREFERENCES: { quickSlots: 6, trackedQuestIds: 5 },
  LIFE_RESULT: { items: 8 },
  LIFE_STATUS: { lines: 7 },
  NODE_CATALOG: { nodes: 64 },
  GATHER_PUZZLE: { points: 12 },
  GATHER_TRACE: { samples: 160 },
  GATHER_TAPS: { taps: 16 },
  RECIPE_LIST: { name: 64, recipes: 128 },
  KICK: { detail: 600 },
} as const;

export const SNAPSHOT_UPDATE_BYTES = 12;
export const SNAPSHOT_UPDATE_OFFSET = { entityId: 0, x: 4, y: 8 } as const;
export const WAYPOINT_BYTES = 8;
export const WAYPOINT_OFFSET = { x: 0, y: 4 } as const;
export const INVENTORY_ENTRY_BYTES = 12;
export const INVENTORY_ENTRY_OFFSET = { slot: 0, itemId: 4, qty: 8 } as const;
export const EQUIPMENT_SLOTS_BYTES = 32;
export const EQUIPMENT_SLOTS_OFFSET = { weapon: 0, shield: 4, helmet: 8, armor: 12, gloves: 16, boots: 20, accessory1: 24, accessory2: 28 } as const;
export const SHOP_OFFER_BYTES = 12;
export const SHOP_OFFER_OFFSET = { itemId: 0, buyPrice: 4, sellPrice: 8 } as const;
export const SKILL_INFO_NAME_MAX = 64;
export const SKILL_INFO_OFFSET = { skillId: 0, length: 4 } as const;
export const SKILL_INFO_PREFIX_BYTES = 6;
export const DIALOG_ACTION_TYPE_MAX = 32;
export const DIALOG_ACTION_OFFSET = { length: 1 } as const;
export const DIALOG_ACTION_PREFIX_BYTES = 3;
export const DIALOG_OPTION_LABEL_MAX = 240;
export const DIALOG_OPTION_NEXT_MAX = 64;
export const DIALOG_OPTION_OFFSET = { length: 1 } as const;
export const DIALOG_OPTION_PREFIX_BYTES = 3;
export const DIALOG_NODE_ID_MAX = 64;
export const DIALOG_NODE_SPEAKER_MAX = 66;
export const DIALOG_NODE_PAGES_MAX = 4;
export const DIALOG_NODE_OPTIONS_MAX = 8;
export const DIALOG_NODE_OFFSET = { length: 0 } as const;
export const DIALOG_NODE_PREFIX_BYTES = 2;
export const QUEST_LOG_OBJECTIVE_TEXT_MAX = 96;
export const QUEST_LOG_OBJECTIVE_OFFSET = { kind: 0, length: 1 } as const;
export const QUEST_LOG_OBJECTIVE_PREFIX_BYTES = 3;
export const REWARD_PREVIEW_ITEM_BYTES = 8;
export const REWARD_PREVIEW_ITEM_OFFSET = { itemId: 0, qty: 4 } as const;
export const QUEST_REWARD_PREVIEW_FIXED_MAX = 8;
export const QUEST_REWARD_PREVIEW_CHOICE_MAX = 8;
export const QUEST_REWARD_PREVIEW_RANDOM_MAX = 8;
export const QUEST_REWARD_PREVIEW_BONUS_MAX = 8;
export const QUEST_REWARD_PREVIEW_OFFSET = { exp: 0, sexp: 4, slp: 8, gold: 12, count: 16 } as const;
export const QUEST_REWARD_PREVIEW_PREFIX_BYTES = 18;
export const QUEST_LOG_ENTRY_NAME_MAX = 120;
export const QUEST_LOG_ENTRY_DESCRIPTION_MAX = 1500;
export const QUEST_LOG_ENTRY_OBJECTIVES_MAX = 8;
export const QUEST_LOG_ENTRY_OFFSET = { questId: 0, type: 4, length: 5 } as const;
export const QUEST_LOG_ENTRY_PREFIX_BYTES = 7;
export const QUEST_GRANT_ITEM_BYTES = 9;
export const QUEST_GRANT_ITEM_OFFSET = { itemId: 0, qty: 4, source: 8 } as const;
export const QUEST_GRANT_SUMMARY_ITEMS_MAX = 18;
export const QUEST_GRANT_SUMMARY_OFFSET = { exp: 0, sexp: 4, slp: 8, gold: 12, count: 16 } as const;
export const QUEST_GRANT_SUMMARY_PREFIX_BYTES = 18;
export const NPC_QUEST_MARKER_BYTES = 8;
export const NPC_QUEST_MARKER_OFFSET = { npcId: 0, marker: 4 } as const;
export const CHAR_STAT_PAIR_BYTES = 8;
export const CHAR_STAT_PAIR_OFFSET = { value: 0, xp: 4 } as const;
export const CHAR_GRAPH_BYTES = 16;
export const CHAR_GRAPH_OFFSET = { pow: 0, mag: 4, cha: 8, luc: 12 } as const;
export const CHAR_POW_STATS_BYTES = 24;
export const CHAR_POW_STATS_OFFSET = { atk: 0, hit: 8, agi: 16 } as const;
export const CHAR_MAG_STATS_BYTES = 24;
export const CHAR_MAG_STATS_OFFSET = { mat: 0, wis: 8, mdef: 16 } as const;
export const CHAR_CHA_STATS_BYTES = 24;
export const CHAR_CHA_STATS_OFFSET = { eva: 0, end: 8, def: 16 } as const;
export const CHAR_LUC_STATS_BYTES = 24;
export const CHAR_LUC_STATS_OFFSET = { pot: 0, luk: 8, act: 16 } as const;
export const CHAR_STATS_BYTES = 96;
export const CHAR_STATS_OFFSET = { pow: 0, mag: 24, cha: 48, luc: 72 } as const;
export const CHAR_DERIVED_STATS_BYTES = 128;
export const CHAR_DERIVED_STATS_OFFSET = { attackPower: 0, magicPower: 8, defense: 16, magicDefense: 24, hitRating: 32, evasionRating: 40, magicHitRating: 48, magicEvasionRating: 56, hitChance: 64, evasionChance: 72, magicHitChance: 80, magicEvasionChance: 88, critChance: 96, critMultiplier: 104, attackIntervalMs: 112, moveSpeed: 116, mpRegenPerMin: 120 } as const;
export const CHAR_STAT_DELTA_BYTES = 14;
export const CHAR_STAT_DELTA_OFFSET = { group: 0, code: 1, valueDelta: 2, valueAfter: 6, xpAfter: 10 } as const;
export const STAT_ALLOCATION_BYTES = 5;
export const STAT_ALLOCATION_OFFSET = { code: 0, points: 1 } as const;
export const PORTAL_MARKER_NAME_MAX = 64;
export const PORTAL_MARKER_OFFSET = { portalId: 0, x: 4, y: 8, length: 12 } as const;
export const PORTAL_MARKER_PREFIX_BYTES = 14;
export const CHAR_SUMMARY_NAME_MAX = 66;
export const CHAR_SUMMARY_OFFSET = { charId: 0, length: 4 } as const;
export const CHAR_SUMMARY_PREFIX_BYTES = 6;
export const LIFE_LINE_INFO_BYTES = 10;
export const LIFE_LINE_INFO_OFFSET = { line: 0, points: 1, rank: 5, nextRankAt: 6 } as const;
export const NODE_DEF_INFO_BYTES = 11;
export const NODE_DEF_INFO_OFFSET = { nodeDefId: 0, line: 4, tier: 5, minRank: 6, interactRadius: 7 } as const;
export const PUZZLE_POINT_BYTES = 4;
export const PUZZLE_POINT_OFFSET = { x: 0, y: 2 } as const;
export const PUZZLE_TAP_BYTES = 7;
export const PUZZLE_TAP_OFFSET = { cycle: 0, ms: 1, x: 3, y: 5 } as const;
export const RECIPE_INFO_INPUTS_MAX = 6;
export const RECIPE_INFO_OFFSET = { recipeId: 0, line: 4, tier: 5, minRank: 6, laborCost: 7, goldFee: 11, outputItemId: 15, outputQty: 19, greatBonusQty: 23, count: 27 } as const;
export const RECIPE_INFO_PREFIX_BYTES = 29;
export const HELLO_BYTES = 8;
export const HELLO_OFFSET = { clientProtoVer: 0, clientBuildHash: 4 } as const;
export const HELLO_ACK_SESSION_NONCE_MAX = 64;
export const HELLO_ACK_OFFSET = { serverProtoVer: 0, serverTimeMs: 4, length: 12 } as const;
export const HELLO_ACK_PREFIX_BYTES = 14;
export const AUTH_REQ_USERNAME_MAX = 64;
export const AUTH_REQ_SECRET_MAX = 256;
export const AUTH_REQ_OFFSET = { mode: 0, length: 4 } as const;
export const AUTH_REQ_PREFIX_BYTES = 6;
export const AUTH_RESULT_SESSION_TOKEN_MAX = 64;
export const AUTH_RESULT_OFFSET = { ok: 0, accountId: 1, length: 5 } as const;
export const AUTH_RESULT_PREFIX_BYTES = 7;
export const CHAR_LIST_REQ_BYTES = 0;
export const CHAR_LIST_CHARS_MAX = 16;
export const CHAR_LIST_OFFSET = { count: 0 } as const;
export const CHAR_LIST_PREFIX_BYTES = 2;
export const ENTER_WORLD_REQ_BYTES = 4;
export const ENTER_WORLD_REQ_OFFSET = { charId: 0 } as const;
export const ENTER_WORLD_OK_BYTES = 20;
export const ENTER_WORLD_OK_OFFSET = { charId: 0, zoneId: 4, tickIndex: 8, spawnX: 12, spawnY: 16 } as const;
export const ZONE_INFO_NAME_MAX = 64;
export const ZONE_INFO_OFFSET = { zoneId: 0, length: 4 } as const;
export const ZONE_INFO_PREFIX_BYTES = 6;
export const CHAR_CREATE_REQ_NAME_MAX = 64;
export const CHAR_CREATE_REQ_OFFSET = { length: 0 } as const;
export const CHAR_CREATE_REQ_PREFIX_BYTES = 2;
export const CHAR_CREATE_RESULT_NAME_MAX = 64;
export const CHAR_CREATE_RESULT_OFFSET = { ok: 0, charId: 1, length: 5 } as const;
export const CHAR_CREATE_RESULT_PREFIX_BYTES = 7;
export const ZONE_CHANGE_REQ_BYTES = 4;
export const ZONE_CHANGE_REQ_OFFSET = { portalId: 0 } as const;
export const ZONE_CHANGE_NAME_MAX = 64;
export const ZONE_CHANGE_OFFSET = { newZoneId: 0, length: 4 } as const;
export const ZONE_CHANGE_PREFIX_BYTES = 6;
export const PORTAL_LIST_PORTALS_MAX = 32;
export const PORTAL_LIST_OFFSET = { zoneId: 0, count: 4 } as const;
export const PORTAL_LIST_PREFIX_BYTES = 6;
export const INPUT_CMD_BYTES = 21;
export const INPUT_CMD_OFFSET = { seq: 0, tick: 4, dx: 8, dy: 12, action: 16, gait: 20 } as const;
export const SNAPSHOT_DELTA_UPDATES_MAX = 5460;
export const SNAPSHOT_DELTA_OFFSET = { tickIndex: 0, ackSeq: 4, count: 8 } as const;
export const SNAPSHOT_DELTA_PREFIX_BYTES = 10;
export const ENTITY_SPAWN_NAME_MAX = 66;
export const ENTITY_SPAWN_OFFSET = { entityId: 0, type: 4, x: 5, y: 9, length: 13 } as const;
export const ENTITY_SPAWN_PREFIX_BYTES = 15;
export const ENTITY_DESPAWN_BYTES = 8;
export const ENTITY_DESPAWN_OFFSET = { entityId: 0, reason: 4 } as const;
export const MOVE_TO_BYTES = 16;
export const MOVE_TO_OFFSET = { seq: 0, tick: 4, targetX: 8, targetY: 12 } as const;
export const ENTITY_META_BYTES = 16;
export const ENTITY_META_OFFSET = { entityId: 0, hp: 4, hpMax: 8, level: 12 } as const;
export const MOVE_PATH_WAYPOINTS_MAX = 1024;
export const MOVE_PATH_OFFSET = { entityId: 0, seq: 4, count: 8 } as const;
export const MOVE_PATH_PREFIX_BYTES = 10;
export const MOVE_STOP_BYTES = 8;
export const MOVE_STOP_OFFSET = { seq: 0, tick: 4 } as const;
export const CHAT_SAY_TARGET_MAX = 64;
export const CHAT_SAY_TEXT_MAX = 600;
export const CHAT_SAY_OFFSET = { channel: 0, length: 4 } as const;
export const CHAT_SAY_PREFIX_BYTES = 6;
export const CHAT_BCAST_SENDER_NAME_MAX = 66;
export const CHAT_BCAST_TEXT_MAX = 600;
export const CHAT_BCAST_OFFSET = { channel: 0, senderId: 4, length: 8 } as const;
export const CHAT_BCAST_PREFIX_BYTES = 10;
export const CREATE_CHARACTER_V2_NAME_MAX = 64;
export const CREATE_CHARACTER_V2_OFFSET = { length: 0 } as const;
export const CREATE_CHARACTER_V2_PREFIX_BYTES = 2;
export const CHAR_STATS_FULL_NAME_MAX = 66;
export const CHAR_STATS_FULL_OFFSET = { charId: 0, length: 4 } as const;
export const CHAR_STATS_FULL_PREFIX_BYTES = 6;
export const CHAR_LEVEL_UP_STAT_DELTAS_MAX = 3588;
export const CHAR_LEVEL_UP_OFFSET = { newLevel: 0, count: 4 } as const;
export const CHAR_LEVEL_UP_PREFIX_BYTES = 6;
export const CHAR_EXP_GAIN_BYTES = 16;
export const CHAR_EXP_GAIN_OFFSET = { expDelta: 0, sexpDelta: 4, expTotal: 8, sexpTotal: 12 } as const;
export const GOLD_UPDATE_BYTES = 8;
export const GOLD_UPDATE_OFFSET = { gold: 0, delta: 4 } as const;
export const STAT_ALLOCATE_ALLOCATIONS_MAX = 12;
export const STAT_ALLOCATE_OFFSET = { requestId: 0, count: 4 } as const;
export const STAT_ALLOCATE_PREFIX_BYTES = 6;
export const STAT_RESET_BYTES = 4;
export const STAT_RESET_OFFSET = { requestId: 0 } as const;
export const STAT_POINTS_ACK_BYTES = 16;
export const STAT_POINTS_ACK_OFFSET = { requestId: 0, op: 4, errCode: 8, freePoints: 12 } as const;
export const TARGET_SELECT_BYTES = 4;
export const TARGET_SELECT_OFFSET = { targetEntityId: 0 } as const;
export const TARGET_ACK_BYTES = 8;
export const TARGET_ACK_OFFSET = { targetEntityId: 0, errCode: 4 } as const;
export const ATTACK_START_BYTES = 0;
export const ATTACK_STOP_BYTES = 0;
export const DAMAGE_EVENT_BYTES = 14;
export const DAMAGE_EVENT_OFFSET = { attackerEntityId: 0, targetEntityId: 4, damage: 8, isCrit: 12, isMiss: 13 } as const;
export const DEATH_NOTIFY_BYTES = 16;
export const DEATH_NOTIFY_OFFSET = { victimEntityId: 0, attackerEntityId: 4, expLost: 8, sexpLost: 12 } as const;
export const RESPAWN_REQ_BYTES = 0;
export const RESPAWN_OK_BYTES = 28;
export const RESPAWN_OK_OFFSET = { zoneId: 0, spawnX: 4, spawnY: 8, hp: 12, hpMax: 16, mp: 20, mpMax: 24 } as const;
export const SKILL_CAST_BYTES = 16;
export const SKILL_CAST_OFFSET = { skillId: 0, targetEntityId: 4, groundX: 8, groundY: 12 } as const;
export const SKILL_LIST_SKILLS_MAX = 256;
export const SKILL_LIST_OFFSET = { count: 0 } as const;
export const SKILL_LIST_PREFIX_BYTES = 2;
export const SKILL_EFFECT_BYTES = 37;
export const SKILL_EFFECT_OFFSET = { skillId: 0, casterEntityId: 4, targetEntityId: 8, effectKind: 12, amount: 13, isCrit: 17, isMiss: 18, groundX: 19, groundY: 23, castId: 27, impactDelayMs: 31, variant: 35, hitIndex: 36 } as const;
export const SKILL_CAST_ACK_BYTES = 12;
export const SKILL_CAST_ACK_OFFSET = { skillId: 0, errCode: 4, cooldownMs: 8 } as const;
export const MANA_UPDATE_BYTES = 8;
export const MANA_UPDATE_OFFSET = { mp: 0, mpMax: 4 } as const;
export const SKILL_LEARN_BYTES = 4;
export const SKILL_LEARN_OFFSET = { skillId: 0 } as const;
export const SKILL_LEVEL_UP_BYTES = 4;
export const SKILL_LEVEL_UP_OFFSET = { skillId: 0 } as const;
export const SKILL_LEARN_ACK_BYTES = 20;
export const SKILL_LEARN_ACK_OFFSET = { op: 0, skillId: 4, errCode: 8, newLevel: 12, slpAfter: 16 } as const;
export const SKILL_LV_UP_BYTES = 12;
export const SKILL_LV_UP_OFFSET = { newSlv: 0, slpGained: 4, slpTotal: 8 } as const;
export const ITEM_USE_BYTES = 4;
export const ITEM_USE_OFFSET = { slot: 0 } as const;
export const ITEM_EQUIP_BYTES = 4;
export const ITEM_EQUIP_OFFSET = { slot: 0 } as const;
export const ITEM_UNEQUIP_BYTES = 4;
export const ITEM_UNEQUIP_OFFSET = { equipSlot: 0 } as const;
export const ITEM_PICKUP_BYTES = 4;
export const ITEM_PICKUP_OFFSET = { entityId: 0 } as const;
export const INVENTORY_LIST_SLOTS_MAX = 24;
export const INVENTORY_LIST_OFFSET = { count: 0 } as const;
export const INVENTORY_LIST_PREFIX_BYTES = 2;
export const ITEM_USE_ACK_BYTES = 20;
export const ITEM_USE_ACK_OFFSET = { slot: 0, itemId: 4, errCode: 8, healHp: 12, healMp: 16 } as const;
export const ITEM_PICKUP_ACK_BYTES = 8;
export const ITEM_PICKUP_ACK_OFFSET = { entityId: 0, errCode: 4 } as const;
export const NPC_INTERACT_BYTES = 4;
export const NPC_INTERACT_OFFSET = { entityId: 0 } as const;
export const NPC_DIALOG_NPC_NAME_MAX = 66;
export const NPC_DIALOG_ENTRY_MAX = 64;
export const NPC_DIALOG_NODES_MAX = 12;
export const NPC_DIALOG_OFFSET = { entityId: 0, npcId: 4, length: 8 } as const;
export const NPC_DIALOG_PREFIX_BYTES = 10;
export const NPC_ACTION_NODE_ID_MAX = 64;
export const NPC_ACTION_ACTION_TYPE_MAX = 32;
export const NPC_ACTION_OFFSET = { entityId: 0, dialogueId: 4, length: 8 } as const;
export const NPC_ACTION_PREFIX_BYTES = 10;
export const QUEST_LIST_ACTIVE_MAX = 20;
export const QUEST_LIST_COMPLETED_MAX = 1024;
export const QUEST_LIST_DAILY_DONE_TODAY_MAX = 1024;
export const QUEST_LIST_OFFSET = { count: 0 } as const;
export const QUEST_LIST_PREFIX_BYTES = 2;
export const QUEST_PROGRESS_BYTES = 17;
export const QUEST_PROGRESS_OFFSET = { questId: 0, objectiveIndex: 4, current: 8, required: 12, questCompletable: 16 } as const;
export const QUEST_ACTION_ACK_OFFSET = { op: 1, questId: 5, errCode: 9 } as const;
export const QUEST_ACTION_ACK_PREFIX_BYTES = 13;
export const QUEST_ABANDON_BYTES = 4;
export const QUEST_ABANDON_OFFSET = { questId: 0 } as const;
export const QUEST_NPC_MARKERS_NPCS_MAX = 1024;
export const QUEST_NPC_MARKERS_OFFSET = { count: 0 } as const;
export const QUEST_NPC_MARKERS_PREFIX_BYTES = 2;
export const SHOP_LIST_NAME_MAX = 240;
export const SHOP_LIST_OFFERS_MAX = 256;
export const SHOP_LIST_OFFSET = { entityId: 0, shopId: 4, length: 8 } as const;
export const SHOP_LIST_PREFIX_BYTES = 10;
export const SHOP_BUY_BYTES = 20;
export const SHOP_BUY_OFFSET = { entityId: 0, shopId: 4, itemId: 8, qty: 12, requestId: 16 } as const;
export const SHOP_SELL_BYTES = 24;
export const SHOP_SELL_OFFSET = { entityId: 0, shopId: 4, itemId: 8, slot: 12, qty: 16, requestId: 20 } as const;
export const SHOP_ACK_BYTES = 16;
export const SHOP_ACK_OFFSET = { requestId: 0, op: 4, errCode: 8, gold: 12 } as const;
export const UI_PREFERENCES_SET_QUICK_SLOTS_MAX = 6;
export const UI_PREFERENCES_SET_TRACKED_QUEST_IDS_MAX = 5;
export const UI_PREFERENCES_QUICK_SLOTS_MAX = 6;
export const UI_PREFERENCES_TRACKED_QUEST_IDS_MAX = 5;
export const UI_PREFERENCES_OFFSET = { count: 0 } as const;
export const UI_PREFERENCES_PREFIX_BYTES = 2;
export const GATHER_START_BYTES = 4;
export const GATHER_START_OFFSET = { nodeEid: 0 } as const;
export const LIFE_CANCEL_BYTES = 0;
export const LIFE_CHANNEL_BYTES = 18;
export const LIFE_CHANNEL_OFFSET = { channelId: 0, kind: 4, targetEid: 5, durationMs: 9, requestId: 13, code: 17 } as const;
export const LIFE_RESULT_ITEMS_MAX = 8;
export const LIFE_RESULT_OFFSET = { channelId: 0, code: 4, count: 5 } as const;
export const LIFE_RESULT_PREFIX_BYTES = 7;
export const LIFE_STATUS_LINES_MAX = 7;
export const LIFE_STATUS_OFFSET = { labor: 0, laborMax: 4, msToNext: 8, count: 12 } as const;
export const LIFE_STATUS_PREFIX_BYTES = 14;
export const NODE_CATALOG_NODES_MAX = 64;
export const NODE_CATALOG_OFFSET = { count: 0 } as const;
export const NODE_CATALOG_PREFIX_BYTES = 2;
export const GATHER_PUZZLE_POINTS_MAX = 12;
export const GATHER_PUZZLE_OFFSET = { channelId: 0, kind: 4, boardW: 5, boardH: 7, readyMs: 9, cycleMs: 11, maxCycles: 13, bandHeight: 14, pathWidth: 16, circleRadius: 18, count: 20 } as const;
export const GATHER_PUZZLE_PREFIX_BYTES = 22;
export const GATHER_TRACE_SAMPLES_MAX = 160;
export const GATHER_TRACE_OFFSET = { channelId: 0, cycle: 4, pressMs: 5, tailMs: 7, count: 8 } as const;
export const GATHER_TRACE_PREFIX_BYTES = 10;
export const GATHER_TAPS_TAPS_MAX = 16;
export const GATHER_TAPS_OFFSET = { channelId: 0, count: 4 } as const;
export const GATHER_TAPS_PREFIX_BYTES = 6;
export const RECIPE_LIST_NAME_MAX = 64;
export const RECIPE_LIST_RECIPES_MAX = 128;
export const RECIPE_LIST_OFFSET = { npcEid: 0, stationId: 4, length: 8 } as const;
export const RECIPE_LIST_PREFIX_BYTES = 10;
export const CRAFT_REQ_BYTES = 16;
export const CRAFT_REQ_OFFSET = { npcEid: 0, recipeId: 4, count: 8, requestId: 12 } as const;
export const CRAFT_ACK_BYTES = 21;
export const CRAFT_ACK_OFFSET = { requestId: 0, errCode: 4, made: 5, greats: 9, gold: 13, outputItemId: 17 } as const;
export const PING_BYTES = 8;
export const PING_OFFSET = { clientTimeMs: 0 } as const;
export const PONG_BYTES = 16;
export const PONG_OFFSET = { clientTimeMs: 0, serverTimeMs: 8 } as const;
export const KICK_DETAIL_MAX = 600;
export const KICK_OFFSET = { reason: 0, length: 4 } as const;
export const KICK_PREFIX_BYTES = 6;
