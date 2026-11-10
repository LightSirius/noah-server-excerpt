// AUTO-GENERATED — do not edit. Source: shared/schema/packets.json
// schema-hash: 080391b8
// Run `bun run gen` from tools/codegen/ to regenerate.

namespace MMORPG.Net.Generated
{
    public static class Protocol
    {
        public const int Version = 19;
    }

    public static class PacketIds
    {
        public const ushort HELLO = 0x0001;
        public const ushort HELLO_ACK = 0x0002;
        public const ushort AUTH_REQ = 0x0003;
        public const ushort AUTH_RESULT = 0x0004;
        public const ushort CHAR_LIST_REQ = 0x0010;
        public const ushort CHAR_LIST = 0x0011;
        public const ushort ENTER_WORLD_REQ = 0x0012;
        public const ushort ENTER_WORLD_OK = 0x0013;
        public const ushort ZONE_INFO = 0x0014;
        public const ushort CHAR_CREATE_REQ = 0x0016;
        public const ushort CHAR_CREATE_RESULT = 0x0017;
        public const ushort ZONE_CHANGE_REQ = 0x0015;
        public const ushort ZONE_CHANGE = 0x0018;
        public const ushort PORTAL_LIST = 0x0019;
        public const ushort INPUT_CMD = 0x0100;
        public const ushort SNAPSHOT_DELTA = 0x0101;
        public const ushort ENTITY_SPAWN = 0x0102;
        public const ushort ENTITY_DESPAWN = 0x0103;
        public const ushort MOVE_TO = 0x0104;
        public const ushort ENTITY_META = 0x0105;
        public const ushort MOVE_PATH = 0x0106;
        public const ushort MOVE_STOP = 0x0107;
        public const ushort CHAT_SAY = 0x0210;
        public const ushort CHAT_BCAST = 0x0211;
        public const ushort CREATE_CHARACTER_V2 = 0x0300;
        public const ushort CHAR_STATS_FULL = 0x0301;
        public const ushort CHAR_LEVEL_UP = 0x0302;
        public const ushort CHAR_EXP_GAIN = 0x0303;
        public const ushort GOLD_UPDATE = 0x0304;
        public const ushort STAT_ALLOCATE = 0x0305;
        public const ushort STAT_RESET = 0x0306;
        public const ushort STAT_POINTS_ACK = 0x0307;
        public const ushort TARGET_SELECT = 0x0400;
        public const ushort TARGET_ACK = 0x0401;
        public const ushort ATTACK_START = 0x0402;
        public const ushort ATTACK_STOP = 0x0403;
        public const ushort DAMAGE_EVENT = 0x0410;
        public const ushort DEATH_NOTIFY = 0x0411;
        public const ushort RESPAWN_REQ = 0x0412;
        public const ushort RESPAWN_OK = 0x0413;
        public const ushort SKILL_CAST = 0x0420;
        public const ushort SKILL_LIST = 0x0421;
        public const ushort SKILL_EFFECT = 0x0422;
        public const ushort SKILL_CAST_ACK = 0x0423;
        public const ushort MANA_UPDATE = 0x0424;
        public const ushort SKILL_LEARN = 0x0425;
        public const ushort SKILL_LEVEL_UP = 0x0426;
        public const ushort SKILL_LEARN_ACK = 0x0427;
        public const ushort SKILL_LV_UP = 0x0428;
        public const ushort ITEM_USE = 0x0440;
        public const ushort ITEM_EQUIP = 0x0441;
        public const ushort ITEM_UNEQUIP = 0x0442;
        public const ushort ITEM_PICKUP = 0x0443;
        public const ushort INVENTORY_LIST = 0x0444;
        public const ushort INVENTORY_UPDATE = 0x0445;
        public const ushort ITEM_USE_ACK = 0x0446;
        public const ushort ITEM_PICKUP_ACK = 0x0447;
        public const ushort NPC_INTERACT = 0x0450;
        public const ushort NPC_DIALOG = 0x0451;
        public const ushort NPC_ACTION = 0x0452;
        public const ushort QUEST_LIST = 0x0460;
        public const ushort QUEST_PROGRESS = 0x0461;
        public const ushort QUEST_ACTION_ACK = 0x0462;
        public const ushort QUEST_ABANDON = 0x0463;
        public const ushort QUEST_NPC_MARKERS = 0x0464;
        public const ushort SHOP_LIST = 0x0453;
        public const ushort SHOP_BUY = 0x0454;
        public const ushort SHOP_SELL = 0x0455;
        public const ushort SHOP_ACK = 0x0456;
        public const ushort UI_PREFERENCES_SET = 0x0470;
        public const ushort UI_PREFERENCES = 0x0471;
        public const ushort GATHER_START = 0x0480;
        public const ushort LIFE_CANCEL = 0x0481;
        public const ushort LIFE_CHANNEL = 0x0482;
        public const ushort LIFE_RESULT = 0x0483;
        public const ushort LIFE_STATUS = 0x0484;
        public const ushort NODE_CATALOG = 0x0485;
        public const ushort GATHER_PUZZLE = 0x0486;
        public const ushort GATHER_TRACE = 0x0487;
        public const ushort GATHER_TAPS = 0x0488;
        public const ushort RECIPE_LIST = 0x0490;
        public const ushort CRAFT_REQ = 0x0491;
        public const ushort CRAFT_ACK = 0x0492;
        public const ushort PING = 0x0F00;
        public const ushort PONG = 0x0F01;
        public const ushort KICK = 0x0F03;
    }

    /// <summary>필드별 와이어 상한(string = UTF-8 바이트, array = 원소 수) — 서버 WIRE_LIMITS와 같은 값.</summary>
    public static class WireLimits
    {
        public const int SkillInfoNameMax = 64;
        public const int DialogActionTypeMax = 32;
        public const int DialogOptionLabelMax = 240;
        public const int DialogOptionNextMax = 64;
        public const int DialogNodeIdMax = 64;
        public const int DialogNodeSpeakerMax = 66;
        public const int DialogNodePagesMax = 4;
        public const int DialogNodePagesItemMax = 600;
        public const int DialogNodeOptionsMax = 8;
        public const int QuestLogObjectiveTextMax = 96;
        public const int QuestRewardPreviewFixedMax = 8;
        public const int QuestRewardPreviewChoiceMax = 8;
        public const int QuestRewardPreviewRandomMax = 8;
        public const int QuestRewardPreviewBonusMax = 8;
        public const int QuestLogEntryNameMax = 120;
        public const int QuestLogEntryDescriptionMax = 1500;
        public const int QuestLogEntryObjectivesMax = 8;
        public const int QuestGrantSummaryItemsMax = 18;
        public const int PortalMarkerNameMax = 64;
        public const int CharSummaryNameMax = 66;
        public const int RecipeInfoInputsMax = 6;
        public const int HelloAckSessionNonceMax = 64;
        public const int AuthReqUsernameMax = 64;
        public const int AuthReqSecretMax = 256;
        public const int AuthResultSessionTokenMax = 64;
        public const int CharListCharsMax = 16;
        public const int ZoneInfoNameMax = 64;
        public const int CharCreateReqNameMax = 64;
        public const int CharCreateResultNameMax = 64;
        public const int ZoneChangeNameMax = 64;
        public const int PortalListPortalsMax = 32;
        public const int SnapshotDeltaUpdatesMax = 5460;
        public const int EntitySpawnNameMax = 66;
        public const int MovePathWaypointsMax = 1024;
        public const int ChatSayTargetMax = 64;
        public const int ChatSayTextMax = 600;
        public const int ChatBcastSenderNameMax = 66;
        public const int ChatBcastTextMax = 600;
        public const int CreateCharacterV2NameMax = 64;
        public const int CharStatsFullNameMax = 66;
        public const int CharLevelUpStatDeltasMax = 3588;
        public const int StatAllocateAllocationsMax = 12;
        public const int SkillListSkillsMax = 256;
        public const int InventoryListSlotsMax = 24;
        public const int NpcDialogNpcNameMax = 66;
        public const int NpcDialogEntryMax = 64;
        public const int NpcDialogNodesMax = 12;
        public const int NpcActionNodeIdMax = 64;
        public const int NpcActionActionTypeMax = 32;
        public const int QuestListActiveMax = 20;
        public const int QuestListCompletedMax = 1024;
        public const int QuestListDailyDoneTodayMax = 1024;
        public const int QuestNpcMarkersNpcsMax = 1024;
        public const int ShopListNameMax = 240;
        public const int ShopListOffersMax = 256;
        public const int UiPreferencesSetQuickSlotsMax = 6;
        public const int UiPreferencesSetTrackedQuestIdsMax = 5;
        public const int UiPreferencesQuickSlotsMax = 6;
        public const int UiPreferencesTrackedQuestIdsMax = 5;
        public const int LifeResultItemsMax = 8;
        public const int LifeStatusLinesMax = 7;
        public const int NodeCatalogNodesMax = 64;
        public const int GatherPuzzlePointsMax = 12;
        public const int GatherTraceSamplesMax = 160;
        public const int GatherTapsTapsMax = 16;
        public const int RecipeListNameMax = 64;
        public const int RecipeListRecipesMax = 128;
        public const int KickDetailMax = 600;
    }

    public enum MoveGait : byte
    {
        Run = 0,
        Walk = 1,
    }

    public enum EntityType : byte
    {
        Unknown = 0,
        Player = 1,
        Monster = 2,
        Npc = 3,
        Grounditem = 4,
        Resource = 5,
    }

    public enum SkillEffectKind : byte
    {
        Damage = 0,
        Heal = 1,
        Cast = 2,
        Fizzle = 3,
    }

    public enum SkillCategory : byte
    {
        Physical = 0,
        Magical = 1,
        Heal = 2,
    }

    public enum SkillDefEffectKind : byte
    {
        Damage = 0,
        Heal = 1,
        Passive = 2,
    }

    public enum SkillTargeting : byte
    {
        Entity = 0,
        Ground = 1,
    }

    public enum QuestType : byte
    {
        Scenario = 0,
        Normal = 1,
        Regional = 2,
        Daily = 3,
    }

    public enum QuestObjectiveKind : byte
    {
        Kill = 0,
        Collect = 1,
        Talk = 2,
        Reach = 3,
    }

    public enum RewardSource : byte
    {
        Fixed = 0,
        Choice = 1,
        Random = 2,
        Bonus = 3,
    }

    public enum StatGroup : byte
    {
        Pow = 0,
        Mag = 1,
        Cha = 2,
        Luc = 3,
    }

    public enum StatCode : byte
    {
        Atk = 0,
        Hit = 1,
        Agi = 2,
        Mat = 3,
        Wis = 4,
        Mdef = 5,
        Eva = 6,
        End = 7,
        Def = 8,
        Pot = 9,
        Luk = 10,
        Act = 11,
    }

    public enum LifeLine : byte
    {
        Logging = 0,
        Mining = 1,
        Gathering = 2,
        Weapon = 3,
        Armor = 4,
        Accessory = 5,
        Consumable = 6,
    }

    public enum LifeChannelKind : byte
    {
        Gather = 0,
        Craft = 1,
    }

    public enum GatherPuzzleKind : byte
    {
        Trace = 0,
        Tap = 1,
    }

    public class SnapshotUpdate
    {
        public uint EntityId;
        public float X;
        public float Y;
    }

    public class Waypoint
    {
        public float X;
        public float Y;
    }

    public class InventoryEntry
    {
        public int Slot;
        public int ItemId;
        public int Qty;
    }

    public class EquipmentSlots
    {
        public int Weapon;
        public int Shield;
        public int Helmet;
        public int Armor;
        public int Gloves;
        public int Boots;
        public int Accessory1;
        public int Accessory2;
    }

    public class ShopOffer
    {
        public int ItemId;
        public int BuyPrice;
        public int SellPrice;
    }

    public class SkillInfo
    {
        public int SkillId;
        public string Name;
        public SkillCategory Category;
        public SkillDefEffectKind EffectKind;
        public int MpCost;
        public int CooldownMs;
        public float Range;
        public int SlvReq;
        public int SlpCost;
        public int MaxLevel;
        public SkillTargeting Targeting;
        public float AoeRadius;
        public int Level;
        public bool Learned;
        public byte AllowedRaces;
        public bool BookOnly;
        public float BowRange;
    }

    public class DialogAction
    {
        public string Type;
        public int? QuestId;
        public int? ShopId;
    }

    public class DialogOption
    {
        public string Label;
        public string Next;
        public DialogAction Action;
    }

    public class DialogNode
    {
        public string Id;
        public string Speaker;
        public string[] Pages;
        public DialogOption[] Options;
    }

    public class QuestLogObjective
    {
        public QuestObjectiveKind Kind;
        public string Text;
        public int TargetId;
        public int Current;
        public int Required;
    }

    public class RewardPreviewItem
    {
        public int ItemId;
        public int Qty;
    }

    public class QuestRewardPreview
    {
        public int Exp;
        public int Sexp;
        public int Slp;
        public int Gold;
        public RewardPreviewItem[] Fixed;
        public RewardPreviewItem[] Choice;
        public RewardPreviewItem[] Random;
        public RewardPreviewItem[] Bonus;
    }

    public class QuestLogEntry
    {
        public int QuestId;
        public QuestType Type;
        public string Name;
        public string Description;
        public int GiverNpcId;
        public int TurnInNpcId;
        public bool Abandonable;
        public bool Completable;
        public QuestLogObjective[] Objectives;
        public QuestRewardPreview RewardPreview;
    }

    public class QuestGrantItem
    {
        public int ItemId;
        public int Qty;
        public RewardSource Source;
    }

    public class QuestGrantSummary
    {
        public int Exp;
        public int Sexp;
        public int Slp;
        public int Gold;
        public QuestGrantItem[] Items;
    }

    public class NpcQuestMarker
    {
        public int NpcId;
        public int Marker;
    }

    public class CharStatPair
    {
        public int Value;
        public int Xp;
    }

    public class CharGraph
    {
        public int Pow;
        public int Mag;
        public int Cha;
        public int Luc;
    }

    public class CharPowStats
    {
        public CharStatPair Atk;
        public CharStatPair Hit;
        public CharStatPair Agi;
    }

    public class CharMagStats
    {
        public CharStatPair Mat;
        public CharStatPair Wis;
        public CharStatPair Mdef;
    }

    public class CharChaStats
    {
        public CharStatPair Eva;
        public CharStatPair End;
        public CharStatPair Def;
    }

    public class CharLucStats
    {
        public CharStatPair Pot;
        public CharStatPair Luk;
        public CharStatPair Act;
    }

    public class CharStats
    {
        public CharPowStats Pow;
        public CharMagStats Mag;
        public CharChaStats Cha;
        public CharLucStats Luc;
    }

    public class CharDerivedStats
    {
        public double AttackPower;
        public double MagicPower;
        public double Defense;
        public double MagicDefense;
        public double HitRating;
        public double EvasionRating;
        public double MagicHitRating;
        public double MagicEvasionRating;
        public double HitChance;
        public double EvasionChance;
        public double MagicHitChance;
        public double MagicEvasionChance;
        public double CritChance;
        public double CritMultiplier;
        public int AttackIntervalMs;
        public float MoveSpeed;
        public double MpRegenPerMin;
    }

    public class CharStatDelta
    {
        public StatGroup Group;
        public StatCode Code;
        public int ValueDelta;
        public int ValueAfter;
        public int XpAfter;
    }

    public class StatAllocation
    {
        public StatCode Code;
        public int Points;
    }

    public class PortalMarker
    {
        public int PortalId;
        public float X;
        public float Y;
        public string Name;
        public int DestZoneId;
    }

    public class CharSummary
    {
        public int CharId;
        public string Name;
        public int Level;
        public int ZoneId;
    }

    public class LifeLineInfo
    {
        public LifeLine Line;
        public int Points;
        public byte Rank;
        public int NextRankAt;
    }

    public class NodeDefInfo
    {
        public int NodeDefId;
        public LifeLine Line;
        public byte Tier;
        public byte MinRank;
        public float InteractRadius;
    }

    public class PuzzlePoint
    {
        public ushort X;
        public ushort Y;
    }

    public class PuzzleTap
    {
        public byte Cycle;
        public ushort Ms;
        public ushort X;
        public ushort Y;
    }

    public class RecipeInfo
    {
        public int RecipeId;
        public LifeLine Line;
        public byte Tier;
        public byte MinRank;
        public int LaborCost;
        public int GoldFee;
        public int OutputItemId;
        public int OutputQty;
        public int GreatBonusQty;
        public RewardPreviewItem[] Inputs;
    }

    public class HelloPayload
    {
        public int ClientProtoVer;
        public uint ClientBuildHash;
    }

    public class HelloAckPayload
    {
        public int ServerProtoVer;
        public double ServerTimeMs;
        public string SessionNonce;
    }

    public class AuthReqPayload
    {
        public int Mode;
        public string Username;
        public string Secret;
    }

    public class AuthResultPayload
    {
        public bool Ok;
        public int AccountId;
        public string SessionToken;
        public int ErrCode;
    }

    public class CharListReqPayload
    {
    }

    public class CharListPayload
    {
        public CharSummary[] Chars;
    }

    public class EnterWorldReqPayload
    {
        public int CharId;
    }

    public class EnterWorldOkPayload
    {
        public int CharId;
        public int ZoneId;
        public int TickIndex;
        public float SpawnX;
        public float SpawnY;
    }

    public class ZoneInfoPayload
    {
        public int ZoneId;
        public string Name;
        public float Width;
        public float Height;
        public int TickRate;
        public float SpawnX;
        public float SpawnY;
    }

    public class CharCreateReqPayload
    {
        public string Name;
    }

    public class CharCreateResultPayload
    {
        public bool Ok;
        public int CharId;
        public string Name;
        public int ErrCode;
    }

    public class ZoneChangeReqPayload
    {
        public int PortalId;
    }

    public class ZoneChangePayload
    {
        public int NewZoneId;
        public string Name;
        public float Width;
        public float Height;
        public int TickRate;
        public float SpawnX;
        public float SpawnY;
        public int TickIndex;
    }

    public class PortalListPayload
    {
        public int ZoneId;
        public PortalMarker[] Portals;
    }

    public class InputCmdPayload
    {
        public int Seq;
        public int Tick;
        public int Dx;
        public int Dy;
        public int Action;
        public MoveGait Gait;
    }

    public class SnapshotDeltaPayload
    {
        public uint TickIndex;
        public uint AckSeq;
        public SnapshotUpdate[] Updates;
    }

    public class EntitySpawnPayload
    {
        public int EntityId;
        public EntityType Type;
        public float X;
        public float Y;
        public string Name;
        public int Level;
        public int Hp;
        public int HpMax;
        public int ItemId;
        public int Qty;
        public int NpcId;
        public int MonsterDefId;
    }

    public class EntityDespawnPayload
    {
        public int EntityId;
        public int Reason;
    }

    public class MoveToPayload
    {
        public int Seq;
        public int Tick;
        public float TargetX;
        public float TargetY;
    }

    public class EntityMetaPayload
    {
        public int EntityId;
        public int Hp;
        public int HpMax;
        public int Level;
    }

    public class MovePathPayload
    {
        public int EntityId;
        public int Seq;
        public Waypoint[] Waypoints;
    }

    public class MoveStopPayload
    {
        public int Seq;
        public int Tick;
    }

    public class ChatSayPayload
    {
        public int Channel;
        public string Target;
        public string Text;
    }

    public class ChatBcastPayload
    {
        public int Channel;
        public int SenderId;
        public string SenderName;
        public string Text;
    }

    public class CreateCharacterV2Payload
    {
        public string Name;
        public int Race;
        public int GraphPow;
        public int GraphMag;
        public int GraphCha;
        public int GraphLuc;
    }

    public class CharStatsFullPayload
    {
        public int CharId;
        public string Name;
        public int Race;
        public CharGraph Graph;
        public CharStats Stats;
        public int Level;
        public int Exp;
        public int Hp;
        public int HpMax;
        public int Mp;
        public int MpMax;
        public int Slv;
        public int Sexp;
        public int Slp;
        public int Gold;
        public int ZoneId;
        public float X;
        public float Y;
        public CharDerivedStats Derived;
        public int FreePoints;
        public int AllocatedPoints;
    }

    public class CharLevelUpPayload
    {
        public int NewLevel;
        public CharStatDelta[] StatDeltas;
        public int HpMaxNew;
        public int MpMaxNew;
    }

    public class CharExpGainPayload
    {
        public int ExpDelta;
        public int SexpDelta;
        public int ExpTotal;
        public int SexpTotal;
    }

    public class GoldUpdatePayload
    {
        public int Gold;
        public int Delta;
    }

    public class StatAllocatePayload
    {
        public int RequestId;
        public StatAllocation[] Allocations;
    }

    public class StatResetPayload
    {
        public int RequestId;
    }

    public class StatPointsAckPayload
    {
        public int RequestId;
        public int Op;
        public int ErrCode;
        public int FreePoints;
    }

    public class TargetSelectPayload
    {
        public int TargetEntityId;
    }

    public class TargetAckPayload
    {
        public int TargetEntityId;
        public int ErrCode;
    }

    public class AttackStartPayload
    {
    }

    public class AttackStopPayload
    {
    }

    public class DamageEventPayload
    {
        public int AttackerEntityId;
        public int TargetEntityId;
        public int Damage;
        public bool IsCrit;
        public bool IsMiss;
    }

    public class DeathNotifyPayload
    {
        public int VictimEntityId;
        public int AttackerEntityId;
        public int ExpLost;
        public int SexpLost;
    }

    public class RespawnReqPayload
    {
    }

    public class RespawnOkPayload
    {
        public int ZoneId;
        public float SpawnX;
        public float SpawnY;
        public int Hp;
        public int HpMax;
        public int Mp;
        public int MpMax;
    }

    public class SkillCastPayload
    {
        public int SkillId;
        public int TargetEntityId;
        public float GroundX;
        public float GroundY;
    }

    public class SkillListPayload
    {
        public SkillInfo[] Skills;
    }

    public class SkillEffectPayload
    {
        public int SkillId;
        public int CasterEntityId;
        public int TargetEntityId;
        public SkillEffectKind EffectKind;
        public int Amount;
        public bool IsCrit;
        public bool IsMiss;
        public float GroundX;
        public float GroundY;
        public int CastId;
        public int ImpactDelayMs;
        public byte Variant;
        public byte HitIndex;
    }

    public class SkillCastAckPayload
    {
        public int SkillId;
        public int ErrCode;
        public int CooldownMs;
    }

    public class ManaUpdatePayload
    {
        public int Mp;
        public int MpMax;
    }

    public class SkillLearnPayload
    {
        public int SkillId;
    }

    public class SkillLevelUpPayload
    {
        public int SkillId;
    }

    public class SkillLearnAckPayload
    {
        public int Op;
        public int SkillId;
        public int ErrCode;
        public int NewLevel;
        public int SlpAfter;
    }

    public class SkillLvUpPayload
    {
        public int NewSlv;
        public int SlpGained;
        public int SlpTotal;
    }

    public class ItemUsePayload
    {
        public int Slot;
    }

    public class ItemEquipPayload
    {
        public int Slot;
    }

    public class ItemUnequipPayload
    {
        public int EquipSlot;
    }

    public class ItemPickupPayload
    {
        public int EntityId;
    }

    public class InventoryListPayload
    {
        public InventoryEntry[] Slots;
        public EquipmentSlots Equipment;
    }

    public class InventoryUpdatePayload : InventoryListPayload
    {
    }

    public class ItemUseAckPayload
    {
        public int Slot;
        public int ItemId;
        public int ErrCode;
        public int HealHp;
        public int HealMp;
    }

    public class ItemPickupAckPayload
    {
        public int EntityId;
        public int ErrCode;
    }

    public class NpcInteractPayload
    {
        public int EntityId;
    }

    public class NpcDialogPayload
    {
        public int EntityId;
        public int NpcId;
        public string NpcName;
        public int DialogueId;
        public string Entry;
        public DialogNode[] Nodes;
    }

    public class NpcActionPayload
    {
        public int EntityId;
        public int DialogueId;
        public string NodeId;
        public int OptionIndex;
        public string ActionType;
        public int QuestId;
        public int ChosenIndex;
    }

    public class QuestListPayload
    {
        public QuestLogEntry[] Active;
        public int[] Completed;
        public int[] DailyDoneToday;
    }

    public class QuestProgressPayload
    {
        public int QuestId;
        public int ObjectiveIndex;
        public int Current;
        public int Required;
        public bool QuestCompletable;
    }

    public class QuestActionAckPayload
    {
        public int Op;
        public int QuestId;
        public int ErrCode;
        public QuestGrantSummary Rewards;
    }

    public class QuestAbandonPayload
    {
        public int QuestId;
    }

    public class QuestNpcMarkersPayload
    {
        public NpcQuestMarker[] Npcs;
    }

    public class ShopListPayload
    {
        public int EntityId;
        public int ShopId;
        public string Name;
        public ShopOffer[] Offers;
    }

    public class ShopBuyPayload
    {
        public int EntityId;
        public int ShopId;
        public int ItemId;
        public int Qty;
        public int RequestId;
    }

    public class ShopSellPayload
    {
        public int EntityId;
        public int ShopId;
        public int ItemId;
        public int Slot;
        public int Qty;
        public int RequestId;
    }

    public class ShopAckPayload
    {
        public int RequestId;
        public int Op;
        public int ErrCode;
        public int Gold;
    }

    public class UiPreferencesSetPayload
    {
        public int[] QuickSlots;
        public int[] TrackedQuestIds;
    }

    public class UiPreferencesPayload
    {
        public int[] QuickSlots;
        public int[] TrackedQuestIds;
        public bool HasSavedSettings;
    }

    public class GatherStartPayload
    {
        public int NodeEid;
    }

    public class LifeCancelPayload
    {
    }

    public class LifeChannelPayload
    {
        public int ChannelId;
        public LifeChannelKind Kind;
        public int TargetEid;
        public int DurationMs;
        public int RequestId;
        public byte Code;
    }

    public class LifeResultPayload
    {
        public int ChannelId;
        public byte Code;
        public RewardPreviewItem[] Items;
        public LifeLine Line;
        public int ProfGain;
    }

    public class LifeStatusPayload
    {
        public int Labor;
        public int LaborMax;
        public int MsToNext;
        public LifeLineInfo[] Lines;
    }

    public class NodeCatalogPayload
    {
        public NodeDefInfo[] Nodes;
    }

    public class GatherPuzzlePayload
    {
        public int ChannelId;
        public GatherPuzzleKind Kind;
        public ushort BoardW;
        public ushort BoardH;
        public ushort ReadyMs;
        public ushort CycleMs;
        public byte MaxCycles;
        public ushort BandHeight;
        public ushort PathWidth;
        public ushort CircleRadius;
        public PuzzlePoint[] Points;
    }

    public class GatherTracePayload
    {
        public int ChannelId;
        public byte Cycle;
        public ushort PressMs;
        public byte TailMs;
        public PuzzlePoint[] Samples;
    }

    public class GatherTapsPayload
    {
        public int ChannelId;
        public PuzzleTap[] Taps;
    }

    public class RecipeListPayload
    {
        public int NpcEid;
        public int StationId;
        public string Name;
        public RecipeInfo[] Recipes;
    }

    public class CraftReqPayload
    {
        public int NpcEid;
        public int RecipeId;
        public int Count;
        public int RequestId;
    }

    public class CraftAckPayload
    {
        public int RequestId;
        public byte ErrCode;
        public int Made;
        public int Greats;
        public int Gold;
        public int OutputItemId;
    }

    public class PingPayload
    {
        public double ClientTimeMs;
    }

    public class PongPayload
    {
        public double ClientTimeMs;
        public double ServerTimeMs;
    }

    public class KickPayload
    {
        public int Reason;
        public string Detail;
    }

}
