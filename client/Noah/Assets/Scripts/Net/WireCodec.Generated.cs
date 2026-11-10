// AUTO-GENERATED — do not edit. Source: shared/schema/packets.json
// schema-hash: 080391b8
// Run `bun run gen` from tools/codegen/ to regenerate.

// 바이너리 본문 코덱 — 규칙 shared/protocol.md §2, 런타임 client/Noah/Assets/Scripts/Net/WireRuntime.cs, 참조 구현 tools/codegen/refCodec.ts.

namespace MMORPG.Net.Generated
{
    using global::MMORPG.Net;

    public static class WireCodec
    {
        private static global::MMORPG.Net.Generated.MoveGait ReadMoveGait(ref WireReader r)
        {
            switch (r.U8())
            {
                case 0:
                    return global::MMORPG.Net.Generated.MoveGait.Run;
                case 1:
                    return global::MMORPG.Net.Generated.MoveGait.Walk;
                default:
                    r.Fail(WireError.BadEnum);
                    return default;
            }
        }

        private static void CheckMoveGait(global::MMORPG.Net.Generated.MoveGait v, string path)
        {
            switch (v)
            {
                case global::MMORPG.Net.Generated.MoveGait.Run:
                case global::MMORPG.Net.Generated.MoveGait.Walk:
                    return;
                default:
                    throw new WireEncodeException(path, $"not a MoveGait value: {v}");
            }
        }

        private static global::MMORPG.Net.Generated.EntityType ReadEntityType(ref WireReader r)
        {
            switch (r.U8())
            {
                case 0:
                    return global::MMORPG.Net.Generated.EntityType.Unknown;
                case 1:
                    return global::MMORPG.Net.Generated.EntityType.Player;
                case 2:
                    return global::MMORPG.Net.Generated.EntityType.Monster;
                case 3:
                    return global::MMORPG.Net.Generated.EntityType.Npc;
                case 4:
                    return global::MMORPG.Net.Generated.EntityType.Grounditem;
                case 5:
                    return global::MMORPG.Net.Generated.EntityType.Resource;
                default:
                    r.Fail(WireError.BadEnum);
                    return default;
            }
        }

        private static void CheckEntityType(global::MMORPG.Net.Generated.EntityType v, string path)
        {
            switch (v)
            {
                case global::MMORPG.Net.Generated.EntityType.Unknown:
                case global::MMORPG.Net.Generated.EntityType.Player:
                case global::MMORPG.Net.Generated.EntityType.Monster:
                case global::MMORPG.Net.Generated.EntityType.Npc:
                case global::MMORPG.Net.Generated.EntityType.Grounditem:
                case global::MMORPG.Net.Generated.EntityType.Resource:
                    return;
                default:
                    throw new WireEncodeException(path, $"not a EntityType value: {v}");
            }
        }

        private static global::MMORPG.Net.Generated.SkillEffectKind ReadSkillEffectKind(ref WireReader r)
        {
            switch (r.U8())
            {
                case 0:
                    return global::MMORPG.Net.Generated.SkillEffectKind.Damage;
                case 1:
                    return global::MMORPG.Net.Generated.SkillEffectKind.Heal;
                case 2:
                    return global::MMORPG.Net.Generated.SkillEffectKind.Cast;
                case 3:
                    return global::MMORPG.Net.Generated.SkillEffectKind.Fizzle;
                default:
                    r.Fail(WireError.BadEnum);
                    return default;
            }
        }

        private static void CheckSkillEffectKind(global::MMORPG.Net.Generated.SkillEffectKind v, string path)
        {
            switch (v)
            {
                case global::MMORPG.Net.Generated.SkillEffectKind.Damage:
                case global::MMORPG.Net.Generated.SkillEffectKind.Heal:
                case global::MMORPG.Net.Generated.SkillEffectKind.Cast:
                case global::MMORPG.Net.Generated.SkillEffectKind.Fizzle:
                    return;
                default:
                    throw new WireEncodeException(path, $"not a SkillEffectKind value: {v}");
            }
        }

        private static global::MMORPG.Net.Generated.SkillCategory ReadSkillCategory(ref WireReader r)
        {
            switch (r.U8())
            {
                case 0:
                    return global::MMORPG.Net.Generated.SkillCategory.Physical;
                case 1:
                    return global::MMORPG.Net.Generated.SkillCategory.Magical;
                case 2:
                    return global::MMORPG.Net.Generated.SkillCategory.Heal;
                default:
                    r.Fail(WireError.BadEnum);
                    return default;
            }
        }

        private static void CheckSkillCategory(global::MMORPG.Net.Generated.SkillCategory v, string path)
        {
            switch (v)
            {
                case global::MMORPG.Net.Generated.SkillCategory.Physical:
                case global::MMORPG.Net.Generated.SkillCategory.Magical:
                case global::MMORPG.Net.Generated.SkillCategory.Heal:
                    return;
                default:
                    throw new WireEncodeException(path, $"not a SkillCategory value: {v}");
            }
        }

        private static global::MMORPG.Net.Generated.SkillDefEffectKind ReadSkillDefEffectKind(ref WireReader r)
        {
            switch (r.U8())
            {
                case 0:
                    return global::MMORPG.Net.Generated.SkillDefEffectKind.Damage;
                case 1:
                    return global::MMORPG.Net.Generated.SkillDefEffectKind.Heal;
                case 2:
                    return global::MMORPG.Net.Generated.SkillDefEffectKind.Passive;
                default:
                    r.Fail(WireError.BadEnum);
                    return default;
            }
        }

        private static void CheckSkillDefEffectKind(global::MMORPG.Net.Generated.SkillDefEffectKind v, string path)
        {
            switch (v)
            {
                case global::MMORPG.Net.Generated.SkillDefEffectKind.Damage:
                case global::MMORPG.Net.Generated.SkillDefEffectKind.Heal:
                case global::MMORPG.Net.Generated.SkillDefEffectKind.Passive:
                    return;
                default:
                    throw new WireEncodeException(path, $"not a SkillDefEffectKind value: {v}");
            }
        }

        private static global::MMORPG.Net.Generated.SkillTargeting ReadSkillTargeting(ref WireReader r)
        {
            switch (r.U8())
            {
                case 0:
                    return global::MMORPG.Net.Generated.SkillTargeting.Entity;
                case 1:
                    return global::MMORPG.Net.Generated.SkillTargeting.Ground;
                default:
                    r.Fail(WireError.BadEnum);
                    return default;
            }
        }

        private static void CheckSkillTargeting(global::MMORPG.Net.Generated.SkillTargeting v, string path)
        {
            switch (v)
            {
                case global::MMORPG.Net.Generated.SkillTargeting.Entity:
                case global::MMORPG.Net.Generated.SkillTargeting.Ground:
                    return;
                default:
                    throw new WireEncodeException(path, $"not a SkillTargeting value: {v}");
            }
        }

        private static global::MMORPG.Net.Generated.QuestType ReadQuestType(ref WireReader r)
        {
            switch (r.U8())
            {
                case 0:
                    return global::MMORPG.Net.Generated.QuestType.Scenario;
                case 1:
                    return global::MMORPG.Net.Generated.QuestType.Normal;
                case 2:
                    return global::MMORPG.Net.Generated.QuestType.Regional;
                case 3:
                    return global::MMORPG.Net.Generated.QuestType.Daily;
                default:
                    r.Fail(WireError.BadEnum);
                    return default;
            }
        }

        private static void CheckQuestType(global::MMORPG.Net.Generated.QuestType v, string path)
        {
            switch (v)
            {
                case global::MMORPG.Net.Generated.QuestType.Scenario:
                case global::MMORPG.Net.Generated.QuestType.Normal:
                case global::MMORPG.Net.Generated.QuestType.Regional:
                case global::MMORPG.Net.Generated.QuestType.Daily:
                    return;
                default:
                    throw new WireEncodeException(path, $"not a QuestType value: {v}");
            }
        }

        private static global::MMORPG.Net.Generated.QuestObjectiveKind ReadQuestObjectiveKind(ref WireReader r)
        {
            switch (r.U8())
            {
                case 0:
                    return global::MMORPG.Net.Generated.QuestObjectiveKind.Kill;
                case 1:
                    return global::MMORPG.Net.Generated.QuestObjectiveKind.Collect;
                case 2:
                    return global::MMORPG.Net.Generated.QuestObjectiveKind.Talk;
                case 3:
                    return global::MMORPG.Net.Generated.QuestObjectiveKind.Reach;
                default:
                    r.Fail(WireError.BadEnum);
                    return default;
            }
        }

        private static void CheckQuestObjectiveKind(global::MMORPG.Net.Generated.QuestObjectiveKind v, string path)
        {
            switch (v)
            {
                case global::MMORPG.Net.Generated.QuestObjectiveKind.Kill:
                case global::MMORPG.Net.Generated.QuestObjectiveKind.Collect:
                case global::MMORPG.Net.Generated.QuestObjectiveKind.Talk:
                case global::MMORPG.Net.Generated.QuestObjectiveKind.Reach:
                    return;
                default:
                    throw new WireEncodeException(path, $"not a QuestObjectiveKind value: {v}");
            }
        }

        private static global::MMORPG.Net.Generated.RewardSource ReadRewardSource(ref WireReader r)
        {
            switch (r.U8())
            {
                case 0:
                    return global::MMORPG.Net.Generated.RewardSource.Fixed;
                case 1:
                    return global::MMORPG.Net.Generated.RewardSource.Choice;
                case 2:
                    return global::MMORPG.Net.Generated.RewardSource.Random;
                case 3:
                    return global::MMORPG.Net.Generated.RewardSource.Bonus;
                default:
                    r.Fail(WireError.BadEnum);
                    return default;
            }
        }

        private static void CheckRewardSource(global::MMORPG.Net.Generated.RewardSource v, string path)
        {
            switch (v)
            {
                case global::MMORPG.Net.Generated.RewardSource.Fixed:
                case global::MMORPG.Net.Generated.RewardSource.Choice:
                case global::MMORPG.Net.Generated.RewardSource.Random:
                case global::MMORPG.Net.Generated.RewardSource.Bonus:
                    return;
                default:
                    throw new WireEncodeException(path, $"not a RewardSource value: {v}");
            }
        }

        private static global::MMORPG.Net.Generated.StatGroup ReadStatGroup(ref WireReader r)
        {
            switch (r.U8())
            {
                case 0:
                    return global::MMORPG.Net.Generated.StatGroup.Pow;
                case 1:
                    return global::MMORPG.Net.Generated.StatGroup.Mag;
                case 2:
                    return global::MMORPG.Net.Generated.StatGroup.Cha;
                case 3:
                    return global::MMORPG.Net.Generated.StatGroup.Luc;
                default:
                    r.Fail(WireError.BadEnum);
                    return default;
            }
        }

        private static void CheckStatGroup(global::MMORPG.Net.Generated.StatGroup v, string path)
        {
            switch (v)
            {
                case global::MMORPG.Net.Generated.StatGroup.Pow:
                case global::MMORPG.Net.Generated.StatGroup.Mag:
                case global::MMORPG.Net.Generated.StatGroup.Cha:
                case global::MMORPG.Net.Generated.StatGroup.Luc:
                    return;
                default:
                    throw new WireEncodeException(path, $"not a StatGroup value: {v}");
            }
        }

        private static global::MMORPG.Net.Generated.StatCode ReadStatCode(ref WireReader r)
        {
            switch (r.U8())
            {
                case 0:
                    return global::MMORPG.Net.Generated.StatCode.Atk;
                case 1:
                    return global::MMORPG.Net.Generated.StatCode.Hit;
                case 2:
                    return global::MMORPG.Net.Generated.StatCode.Agi;
                case 3:
                    return global::MMORPG.Net.Generated.StatCode.Mat;
                case 4:
                    return global::MMORPG.Net.Generated.StatCode.Wis;
                case 5:
                    return global::MMORPG.Net.Generated.StatCode.Mdef;
                case 6:
                    return global::MMORPG.Net.Generated.StatCode.Eva;
                case 7:
                    return global::MMORPG.Net.Generated.StatCode.End;
                case 8:
                    return global::MMORPG.Net.Generated.StatCode.Def;
                case 9:
                    return global::MMORPG.Net.Generated.StatCode.Pot;
                case 10:
                    return global::MMORPG.Net.Generated.StatCode.Luk;
                case 11:
                    return global::MMORPG.Net.Generated.StatCode.Act;
                default:
                    r.Fail(WireError.BadEnum);
                    return default;
            }
        }

        private static void CheckStatCode(global::MMORPG.Net.Generated.StatCode v, string path)
        {
            switch (v)
            {
                case global::MMORPG.Net.Generated.StatCode.Atk:
                case global::MMORPG.Net.Generated.StatCode.Hit:
                case global::MMORPG.Net.Generated.StatCode.Agi:
                case global::MMORPG.Net.Generated.StatCode.Mat:
                case global::MMORPG.Net.Generated.StatCode.Wis:
                case global::MMORPG.Net.Generated.StatCode.Mdef:
                case global::MMORPG.Net.Generated.StatCode.Eva:
                case global::MMORPG.Net.Generated.StatCode.End:
                case global::MMORPG.Net.Generated.StatCode.Def:
                case global::MMORPG.Net.Generated.StatCode.Pot:
                case global::MMORPG.Net.Generated.StatCode.Luk:
                case global::MMORPG.Net.Generated.StatCode.Act:
                    return;
                default:
                    throw new WireEncodeException(path, $"not a StatCode value: {v}");
            }
        }

        private static global::MMORPG.Net.Generated.LifeLine ReadLifeLine(ref WireReader r)
        {
            switch (r.U8())
            {
                case 0:
                    return global::MMORPG.Net.Generated.LifeLine.Logging;
                case 1:
                    return global::MMORPG.Net.Generated.LifeLine.Mining;
                case 2:
                    return global::MMORPG.Net.Generated.LifeLine.Gathering;
                case 3:
                    return global::MMORPG.Net.Generated.LifeLine.Weapon;
                case 4:
                    return global::MMORPG.Net.Generated.LifeLine.Armor;
                case 5:
                    return global::MMORPG.Net.Generated.LifeLine.Accessory;
                case 6:
                    return global::MMORPG.Net.Generated.LifeLine.Consumable;
                default:
                    r.Fail(WireError.BadEnum);
                    return default;
            }
        }

        private static void CheckLifeLine(global::MMORPG.Net.Generated.LifeLine v, string path)
        {
            switch (v)
            {
                case global::MMORPG.Net.Generated.LifeLine.Logging:
                case global::MMORPG.Net.Generated.LifeLine.Mining:
                case global::MMORPG.Net.Generated.LifeLine.Gathering:
                case global::MMORPG.Net.Generated.LifeLine.Weapon:
                case global::MMORPG.Net.Generated.LifeLine.Armor:
                case global::MMORPG.Net.Generated.LifeLine.Accessory:
                case global::MMORPG.Net.Generated.LifeLine.Consumable:
                    return;
                default:
                    throw new WireEncodeException(path, $"not a LifeLine value: {v}");
            }
        }

        private static global::MMORPG.Net.Generated.LifeChannelKind ReadLifeChannelKind(ref WireReader r)
        {
            switch (r.U8())
            {
                case 0:
                    return global::MMORPG.Net.Generated.LifeChannelKind.Gather;
                case 1:
                    return global::MMORPG.Net.Generated.LifeChannelKind.Craft;
                default:
                    r.Fail(WireError.BadEnum);
                    return default;
            }
        }

        private static void CheckLifeChannelKind(global::MMORPG.Net.Generated.LifeChannelKind v, string path)
        {
            switch (v)
            {
                case global::MMORPG.Net.Generated.LifeChannelKind.Gather:
                case global::MMORPG.Net.Generated.LifeChannelKind.Craft:
                    return;
                default:
                    throw new WireEncodeException(path, $"not a LifeChannelKind value: {v}");
            }
        }

        private static global::MMORPG.Net.Generated.GatherPuzzleKind ReadGatherPuzzleKind(ref WireReader r)
        {
            switch (r.U8())
            {
                case 0:
                    return global::MMORPG.Net.Generated.GatherPuzzleKind.Trace;
                case 1:
                    return global::MMORPG.Net.Generated.GatherPuzzleKind.Tap;
                default:
                    r.Fail(WireError.BadEnum);
                    return default;
            }
        }

        private static void CheckGatherPuzzleKind(global::MMORPG.Net.Generated.GatherPuzzleKind v, string path)
        {
            switch (v)
            {
                case global::MMORPG.Net.Generated.GatherPuzzleKind.Trace:
                case global::MMORPG.Net.Generated.GatherPuzzleKind.Tap:
                    return;
                default:
                    throw new WireEncodeException(path, $"not a GatherPuzzleKind value: {v}");
            }
        }

        // ── CharSummary ──

        /// <summary>CharSummary 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeCharSummary(CharSummary p)
        {
            int n = 12;
            n += WireCheck.Str(p.Name, 66, "CharSummary.name");
            return n;
        }

        /// <summary>CharSummary를 o[off..]에 쓰고 끝 오프셋 — SizeCharSummary로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteCharSummary(CharSummary p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.CharId);
            off = WireWrite.Str(o, off, p.Name);
            off = WireWrite.I32(o, off, p.Level);
            off = WireWrite.I32(o, off, p.ZoneId);
            return off;
        }

        /// <summary>CharSummary 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadCharSummary(ref WireReader r, CharSummary v)
        {
            v.CharId = r.I32();
            v.Name = r.Str(66);
            v.Level = r.I32();
            v.ZoneId = r.I32();
            return r.Error == WireError.None;
        }

        // ── PortalMarker ──

        /// <summary>PortalMarker 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizePortalMarker(PortalMarker p)
        {
            int n = 16;
            WireCheck.F32(p.X, "PortalMarker.x");
            WireCheck.F32(p.Y, "PortalMarker.y");
            n += WireCheck.Str(p.Name, 64, "PortalMarker.name");
            return n;
        }

        /// <summary>PortalMarker를 o[off..]에 쓰고 끝 오프셋 — SizePortalMarker로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WritePortalMarker(PortalMarker p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.PortalId);
            off = WireWrite.F32(o, off, p.X);
            off = WireWrite.F32(o, off, p.Y);
            off = WireWrite.Str(o, off, p.Name);
            off = WireWrite.I32(o, off, p.DestZoneId);
            return off;
        }

        /// <summary>PortalMarker 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadPortalMarker(ref WireReader r, PortalMarker v)
        {
            v.PortalId = r.I32();
            v.X = r.F32();
            v.Y = r.F32();
            v.Name = r.Str(64);
            v.DestZoneId = r.I32();
            return r.Error == WireError.None;
        }

        // ── SnapshotUpdate ──

        /// <summary>SnapshotUpdate 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeSnapshotUpdate(SnapshotUpdate p)
        {
            WireCheck.F32(p.X, "SnapshotUpdate.x");
            WireCheck.F32(p.Y, "SnapshotUpdate.y");
            return 12;
        }

        /// <summary>SnapshotUpdate를 o[off..]에 쓰고 끝 오프셋 — SizeSnapshotUpdate로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteSnapshotUpdate(SnapshotUpdate p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.U32(o, off, p.EntityId);
            off = WireWrite.F32(o, off, p.X);
            off = WireWrite.F32(o, off, p.Y);
            return off;
        }

        /// <summary>SnapshotUpdate 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadSnapshotUpdate(ref WireReader r, SnapshotUpdate v)
        {
            v.EntityId = r.U32();
            v.X = r.F32();
            v.Y = r.F32();
            return r.Error == WireError.None;
        }

        // ── Waypoint ──

        /// <summary>Waypoint 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeWaypoint(Waypoint p)
        {
            WireCheck.F32(p.X, "Waypoint.x");
            WireCheck.F32(p.Y, "Waypoint.y");
            return 8;
        }

        /// <summary>Waypoint를 o[off..]에 쓰고 끝 오프셋 — SizeWaypoint로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteWaypoint(Waypoint p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.F32(o, off, p.X);
            off = WireWrite.F32(o, off, p.Y);
            return off;
        }

        /// <summary>Waypoint 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadWaypoint(ref WireReader r, Waypoint v)
        {
            v.X = r.F32();
            v.Y = r.F32();
            return r.Error == WireError.None;
        }

        // ── CharGraph ──

        /// <summary>CharGraph 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeCharGraph(CharGraph p)
        {
            return 16;
        }

        /// <summary>CharGraph를 o[off..]에 쓰고 끝 오프셋 — SizeCharGraph로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteCharGraph(CharGraph p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.Pow);
            off = WireWrite.I32(o, off, p.Mag);
            off = WireWrite.I32(o, off, p.Cha);
            off = WireWrite.I32(o, off, p.Luc);
            return off;
        }

        /// <summary>CharGraph 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadCharGraph(ref WireReader r, CharGraph v)
        {
            v.Pow = r.I32();
            v.Mag = r.I32();
            v.Cha = r.I32();
            v.Luc = r.I32();
            return r.Error == WireError.None;
        }

        // ── CharStats ──

        /// <summary>CharStats 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeCharStats(CharStats p)
        {
            int n = 0;
            n += SizeCharPowStats(WireCheck.NotNull(p.Pow, "CharStats.pow"));
            n += SizeCharMagStats(WireCheck.NotNull(p.Mag, "CharStats.mag"));
            n += SizeCharChaStats(WireCheck.NotNull(p.Cha, "CharStats.cha"));
            n += SizeCharLucStats(WireCheck.NotNull(p.Luc, "CharStats.luc"));
            return n;
        }

        /// <summary>CharStats를 o[off..]에 쓰고 끝 오프셋 — SizeCharStats로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteCharStats(CharStats p, global::System.Span<byte> o, int off)
        {
            off = WriteCharPowStats(p.Pow, o, off);
            off = WriteCharMagStats(p.Mag, o, off);
            off = WriteCharChaStats(p.Cha, o, off);
            off = WriteCharLucStats(p.Luc, o, off);
            return off;
        }

        /// <summary>CharStats 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadCharStats(ref WireReader r, CharStats v)
        {
            {
                var s = new CharPowStats();
                if (!ReadCharPowStats(ref r, s)) return false;
                v.Pow = s;
            }
            {
                var s = new CharMagStats();
                if (!ReadCharMagStats(ref r, s)) return false;
                v.Mag = s;
            }
            {
                var s = new CharChaStats();
                if (!ReadCharChaStats(ref r, s)) return false;
                v.Cha = s;
            }
            {
                var s = new CharLucStats();
                if (!ReadCharLucStats(ref r, s)) return false;
                v.Luc = s;
            }
            return r.Error == WireError.None;
        }

        // ── CharPowStats ──

        /// <summary>CharPowStats 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeCharPowStats(CharPowStats p)
        {
            int n = 0;
            n += SizeCharStatPair(WireCheck.NotNull(p.Atk, "CharPowStats.atk"));
            n += SizeCharStatPair(WireCheck.NotNull(p.Hit, "CharPowStats.hit"));
            n += SizeCharStatPair(WireCheck.NotNull(p.Agi, "CharPowStats.agi"));
            return n;
        }

        /// <summary>CharPowStats를 o[off..]에 쓰고 끝 오프셋 — SizeCharPowStats로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteCharPowStats(CharPowStats p, global::System.Span<byte> o, int off)
        {
            off = WriteCharStatPair(p.Atk, o, off);
            off = WriteCharStatPair(p.Hit, o, off);
            off = WriteCharStatPair(p.Agi, o, off);
            return off;
        }

        /// <summary>CharPowStats 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadCharPowStats(ref WireReader r, CharPowStats v)
        {
            {
                var s = new CharStatPair();
                if (!ReadCharStatPair(ref r, s)) return false;
                v.Atk = s;
            }
            {
                var s = new CharStatPair();
                if (!ReadCharStatPair(ref r, s)) return false;
                v.Hit = s;
            }
            {
                var s = new CharStatPair();
                if (!ReadCharStatPair(ref r, s)) return false;
                v.Agi = s;
            }
            return r.Error == WireError.None;
        }

        // ── CharStatPair ──

        /// <summary>CharStatPair 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeCharStatPair(CharStatPair p)
        {
            return 8;
        }

        /// <summary>CharStatPair를 o[off..]에 쓰고 끝 오프셋 — SizeCharStatPair로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteCharStatPair(CharStatPair p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.Value);
            off = WireWrite.I32(o, off, p.Xp);
            return off;
        }

        /// <summary>CharStatPair 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadCharStatPair(ref WireReader r, CharStatPair v)
        {
            v.Value = r.I32();
            v.Xp = r.I32();
            return r.Error == WireError.None;
        }

        // ── CharMagStats ──

        /// <summary>CharMagStats 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeCharMagStats(CharMagStats p)
        {
            int n = 0;
            n += SizeCharStatPair(WireCheck.NotNull(p.Mat, "CharMagStats.mat"));
            n += SizeCharStatPair(WireCheck.NotNull(p.Wis, "CharMagStats.wis"));
            n += SizeCharStatPair(WireCheck.NotNull(p.Mdef, "CharMagStats.mdef"));
            return n;
        }

        /// <summary>CharMagStats를 o[off..]에 쓰고 끝 오프셋 — SizeCharMagStats로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteCharMagStats(CharMagStats p, global::System.Span<byte> o, int off)
        {
            off = WriteCharStatPair(p.Mat, o, off);
            off = WriteCharStatPair(p.Wis, o, off);
            off = WriteCharStatPair(p.Mdef, o, off);
            return off;
        }

        /// <summary>CharMagStats 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadCharMagStats(ref WireReader r, CharMagStats v)
        {
            {
                var s = new CharStatPair();
                if (!ReadCharStatPair(ref r, s)) return false;
                v.Mat = s;
            }
            {
                var s = new CharStatPair();
                if (!ReadCharStatPair(ref r, s)) return false;
                v.Wis = s;
            }
            {
                var s = new CharStatPair();
                if (!ReadCharStatPair(ref r, s)) return false;
                v.Mdef = s;
            }
            return r.Error == WireError.None;
        }

        // ── CharChaStats ──

        /// <summary>CharChaStats 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeCharChaStats(CharChaStats p)
        {
            int n = 0;
            n += SizeCharStatPair(WireCheck.NotNull(p.Eva, "CharChaStats.eva"));
            n += SizeCharStatPair(WireCheck.NotNull(p.End, "CharChaStats.end"));
            n += SizeCharStatPair(WireCheck.NotNull(p.Def, "CharChaStats.def"));
            return n;
        }

        /// <summary>CharChaStats를 o[off..]에 쓰고 끝 오프셋 — SizeCharChaStats로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteCharChaStats(CharChaStats p, global::System.Span<byte> o, int off)
        {
            off = WriteCharStatPair(p.Eva, o, off);
            off = WriteCharStatPair(p.End, o, off);
            off = WriteCharStatPair(p.Def, o, off);
            return off;
        }

        /// <summary>CharChaStats 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadCharChaStats(ref WireReader r, CharChaStats v)
        {
            {
                var s = new CharStatPair();
                if (!ReadCharStatPair(ref r, s)) return false;
                v.Eva = s;
            }
            {
                var s = new CharStatPair();
                if (!ReadCharStatPair(ref r, s)) return false;
                v.End = s;
            }
            {
                var s = new CharStatPair();
                if (!ReadCharStatPair(ref r, s)) return false;
                v.Def = s;
            }
            return r.Error == WireError.None;
        }

        // ── CharLucStats ──

        /// <summary>CharLucStats 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeCharLucStats(CharLucStats p)
        {
            int n = 0;
            n += SizeCharStatPair(WireCheck.NotNull(p.Pot, "CharLucStats.pot"));
            n += SizeCharStatPair(WireCheck.NotNull(p.Luk, "CharLucStats.luk"));
            n += SizeCharStatPair(WireCheck.NotNull(p.Act, "CharLucStats.act"));
            return n;
        }

        /// <summary>CharLucStats를 o[off..]에 쓰고 끝 오프셋 — SizeCharLucStats로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteCharLucStats(CharLucStats p, global::System.Span<byte> o, int off)
        {
            off = WriteCharStatPair(p.Pot, o, off);
            off = WriteCharStatPair(p.Luk, o, off);
            off = WriteCharStatPair(p.Act, o, off);
            return off;
        }

        /// <summary>CharLucStats 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadCharLucStats(ref WireReader r, CharLucStats v)
        {
            {
                var s = new CharStatPair();
                if (!ReadCharStatPair(ref r, s)) return false;
                v.Pot = s;
            }
            {
                var s = new CharStatPair();
                if (!ReadCharStatPair(ref r, s)) return false;
                v.Luk = s;
            }
            {
                var s = new CharStatPair();
                if (!ReadCharStatPair(ref r, s)) return false;
                v.Act = s;
            }
            return r.Error == WireError.None;
        }

        // ── CharDerivedStats ──

        /// <summary>CharDerivedStats 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeCharDerivedStats(CharDerivedStats p)
        {
            WireCheck.F64(p.AttackPower, "CharDerivedStats.attackPower");
            WireCheck.F64(p.MagicPower, "CharDerivedStats.magicPower");
            WireCheck.F64(p.Defense, "CharDerivedStats.defense");
            WireCheck.F64(p.MagicDefense, "CharDerivedStats.magicDefense");
            WireCheck.F64(p.HitRating, "CharDerivedStats.hitRating");
            WireCheck.F64(p.EvasionRating, "CharDerivedStats.evasionRating");
            WireCheck.F64(p.MagicHitRating, "CharDerivedStats.magicHitRating");
            WireCheck.F64(p.MagicEvasionRating, "CharDerivedStats.magicEvasionRating");
            WireCheck.F64(p.HitChance, "CharDerivedStats.hitChance");
            WireCheck.F64(p.EvasionChance, "CharDerivedStats.evasionChance");
            WireCheck.F64(p.MagicHitChance, "CharDerivedStats.magicHitChance");
            WireCheck.F64(p.MagicEvasionChance, "CharDerivedStats.magicEvasionChance");
            WireCheck.F64(p.CritChance, "CharDerivedStats.critChance");
            WireCheck.F64(p.CritMultiplier, "CharDerivedStats.critMultiplier");
            WireCheck.F32(p.MoveSpeed, "CharDerivedStats.moveSpeed");
            WireCheck.F64(p.MpRegenPerMin, "CharDerivedStats.mpRegenPerMin");
            return 128;
        }

        /// <summary>CharDerivedStats를 o[off..]에 쓰고 끝 오프셋 — SizeCharDerivedStats로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteCharDerivedStats(CharDerivedStats p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.F64(o, off, p.AttackPower);
            off = WireWrite.F64(o, off, p.MagicPower);
            off = WireWrite.F64(o, off, p.Defense);
            off = WireWrite.F64(o, off, p.MagicDefense);
            off = WireWrite.F64(o, off, p.HitRating);
            off = WireWrite.F64(o, off, p.EvasionRating);
            off = WireWrite.F64(o, off, p.MagicHitRating);
            off = WireWrite.F64(o, off, p.MagicEvasionRating);
            off = WireWrite.F64(o, off, p.HitChance);
            off = WireWrite.F64(o, off, p.EvasionChance);
            off = WireWrite.F64(o, off, p.MagicHitChance);
            off = WireWrite.F64(o, off, p.MagicEvasionChance);
            off = WireWrite.F64(o, off, p.CritChance);
            off = WireWrite.F64(o, off, p.CritMultiplier);
            off = WireWrite.I32(o, off, p.AttackIntervalMs);
            off = WireWrite.F32(o, off, p.MoveSpeed);
            off = WireWrite.F64(o, off, p.MpRegenPerMin);
            return off;
        }

        /// <summary>CharDerivedStats 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadCharDerivedStats(ref WireReader r, CharDerivedStats v)
        {
            v.AttackPower = r.F64();
            v.MagicPower = r.F64();
            v.Defense = r.F64();
            v.MagicDefense = r.F64();
            v.HitRating = r.F64();
            v.EvasionRating = r.F64();
            v.MagicHitRating = r.F64();
            v.MagicEvasionRating = r.F64();
            v.HitChance = r.F64();
            v.EvasionChance = r.F64();
            v.MagicHitChance = r.F64();
            v.MagicEvasionChance = r.F64();
            v.CritChance = r.F64();
            v.CritMultiplier = r.F64();
            v.AttackIntervalMs = r.I32();
            v.MoveSpeed = r.F32();
            v.MpRegenPerMin = r.F64();
            return r.Error == WireError.None;
        }

        // ── CharStatDelta ──

        /// <summary>CharStatDelta 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeCharStatDelta(CharStatDelta p)
        {
            CheckStatGroup(p.Group, "CharStatDelta.group");
            CheckStatCode(p.Code, "CharStatDelta.code");
            return 14;
        }

        /// <summary>CharStatDelta를 o[off..]에 쓰고 끝 오프셋 — SizeCharStatDelta로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteCharStatDelta(CharStatDelta p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.U8(o, off, (byte)p.Group);
            off = WireWrite.U8(o, off, (byte)p.Code);
            off = WireWrite.I32(o, off, p.ValueDelta);
            off = WireWrite.I32(o, off, p.ValueAfter);
            off = WireWrite.I32(o, off, p.XpAfter);
            return off;
        }

        /// <summary>CharStatDelta 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadCharStatDelta(ref WireReader r, CharStatDelta v)
        {
            v.Group = ReadStatGroup(ref r);
            v.Code = ReadStatCode(ref r);
            v.ValueDelta = r.I32();
            v.ValueAfter = r.I32();
            v.XpAfter = r.I32();
            return r.Error == WireError.None;
        }

        // ── StatAllocation ──

        /// <summary>StatAllocation 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeStatAllocation(StatAllocation p)
        {
            CheckStatCode(p.Code, "StatAllocation.code");
            return 5;
        }

        /// <summary>StatAllocation를 o[off..]에 쓰고 끝 오프셋 — SizeStatAllocation로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteStatAllocation(StatAllocation p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.U8(o, off, (byte)p.Code);
            off = WireWrite.I32(o, off, p.Points);
            return off;
        }

        /// <summary>StatAllocation 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadStatAllocation(ref WireReader r, StatAllocation v)
        {
            v.Code = ReadStatCode(ref r);
            v.Points = r.I32();
            return r.Error == WireError.None;
        }

        // ── SkillInfo ──

        /// <summary>SkillInfo 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeSkillInfo(SkillInfo p)
        {
            int n = 46;
            n += WireCheck.Str(p.Name, 64, "SkillInfo.name");
            CheckSkillCategory(p.Category, "SkillInfo.category");
            CheckSkillDefEffectKind(p.EffectKind, "SkillInfo.effectKind");
            WireCheck.F32(p.Range, "SkillInfo.range");
            CheckSkillTargeting(p.Targeting, "SkillInfo.targeting");
            WireCheck.F32(p.AoeRadius, "SkillInfo.aoeRadius");
            WireCheck.F32(p.BowRange, "SkillInfo.bowRange");
            return n;
        }

        /// <summary>SkillInfo를 o[off..]에 쓰고 끝 오프셋 — SizeSkillInfo로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteSkillInfo(SkillInfo p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.SkillId);
            off = WireWrite.Str(o, off, p.Name);
            off = WireWrite.U8(o, off, (byte)p.Category);
            off = WireWrite.U8(o, off, (byte)p.EffectKind);
            off = WireWrite.I32(o, off, p.MpCost);
            off = WireWrite.I32(o, off, p.CooldownMs);
            off = WireWrite.F32(o, off, p.Range);
            off = WireWrite.I32(o, off, p.SlvReq);
            off = WireWrite.I32(o, off, p.SlpCost);
            off = WireWrite.I32(o, off, p.MaxLevel);
            off = WireWrite.U8(o, off, (byte)p.Targeting);
            off = WireWrite.F32(o, off, p.AoeRadius);
            off = WireWrite.I32(o, off, p.Level);
            off = WireWrite.Bool(o, off, p.Learned);
            off = WireWrite.U8(o, off, p.AllowedRaces);
            off = WireWrite.Bool(o, off, p.BookOnly);
            off = WireWrite.F32(o, off, p.BowRange);
            return off;
        }

        /// <summary>SkillInfo 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadSkillInfo(ref WireReader r, SkillInfo v)
        {
            v.SkillId = r.I32();
            v.Name = r.Str(64);
            v.Category = ReadSkillCategory(ref r);
            v.EffectKind = ReadSkillDefEffectKind(ref r);
            v.MpCost = r.I32();
            v.CooldownMs = r.I32();
            v.Range = r.F32();
            v.SlvReq = r.I32();
            v.SlpCost = r.I32();
            v.MaxLevel = r.I32();
            v.Targeting = ReadSkillTargeting(ref r);
            v.AoeRadius = r.F32();
            v.Level = r.I32();
            v.Learned = r.Bool();
            v.AllowedRaces = r.U8();
            v.BookOnly = r.Bool();
            v.BowRange = r.F32();
            return r.Error == WireError.None;
        }

        // ── InventoryEntry ──

        /// <summary>InventoryEntry 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeInventoryEntry(InventoryEntry p)
        {
            return 12;
        }

        /// <summary>InventoryEntry를 o[off..]에 쓰고 끝 오프셋 — SizeInventoryEntry로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteInventoryEntry(InventoryEntry p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.Slot);
            off = WireWrite.I32(o, off, p.ItemId);
            off = WireWrite.I32(o, off, p.Qty);
            return off;
        }

        /// <summary>InventoryEntry 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadInventoryEntry(ref WireReader r, InventoryEntry v)
        {
            v.Slot = r.I32();
            v.ItemId = r.I32();
            v.Qty = r.I32();
            return r.Error == WireError.None;
        }

        // ── EquipmentSlots ──

        /// <summary>EquipmentSlots 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeEquipmentSlots(EquipmentSlots p)
        {
            return 32;
        }

        /// <summary>EquipmentSlots를 o[off..]에 쓰고 끝 오프셋 — SizeEquipmentSlots로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteEquipmentSlots(EquipmentSlots p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.Weapon);
            off = WireWrite.I32(o, off, p.Shield);
            off = WireWrite.I32(o, off, p.Helmet);
            off = WireWrite.I32(o, off, p.Armor);
            off = WireWrite.I32(o, off, p.Gloves);
            off = WireWrite.I32(o, off, p.Boots);
            off = WireWrite.I32(o, off, p.Accessory1);
            off = WireWrite.I32(o, off, p.Accessory2);
            return off;
        }

        /// <summary>EquipmentSlots 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadEquipmentSlots(ref WireReader r, EquipmentSlots v)
        {
            v.Weapon = r.I32();
            v.Shield = r.I32();
            v.Helmet = r.I32();
            v.Armor = r.I32();
            v.Gloves = r.I32();
            v.Boots = r.I32();
            v.Accessory1 = r.I32();
            v.Accessory2 = r.I32();
            return r.Error == WireError.None;
        }

        // ── DialogNode ──

        /// <summary>DialogNode 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeDialogNode(DialogNode p)
        {
            int n = 4;
            n += WireCheck.Str(p.Id, 64, "DialogNode.id");
            n += WireCheck.Str(p.Speaker, 66, "DialogNode.speaker");
            {
                int c = WireCheck.Count(p.Pages, 0, 4, "DialogNode.pages");
                for (int i = 0; i < c; i++) n += WireCheck.Str(p.Pages[i], 600, "DialogNode.pages");
            }
            {
                int c = WireCheck.Count(p.Options, 0, 8, "DialogNode.options");
                for (int i = 0; i < c; i++) n += SizeDialogOption(WireCheck.NotNull(p.Options[i], "DialogNode.options"));
            }
            return n;
        }

        /// <summary>DialogNode를 o[off..]에 쓰고 끝 오프셋 — SizeDialogNode로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteDialogNode(DialogNode p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.Str(o, off, p.Id);
            off = WireWrite.Str(o, off, p.Speaker);
            off = WireWrite.U16(o, off, (ushort)p.Pages.Length);
            for (int i = 0; i < p.Pages.Length; i++) off = WireWrite.Str(o, off, p.Pages[i]);
            off = WireWrite.U16(o, off, (ushort)p.Options.Length);
            for (int i = 0; i < p.Options.Length; i++) off = WriteDialogOption(p.Options[i], o, off);
            return off;
        }

        /// <summary>DialogNode 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadDialogNode(ref WireReader r, DialogNode v)
        {
            v.Id = r.Str(64);
            v.Speaker = r.Str(66);
            {
                int n = r.Count(0, 4);
                var a = new string[r.Capacity(n)];
                for (int i = 0; i < n; i++)
                {
                    var e = r.Str(600);
                    if (r.Error != WireError.None) return false;
                    a[i] = e;
                }
                v.Pages = a;
            }
            {
                int n = r.Count(0, 8);
                var a = new DialogOption[r.Capacity(n)];
                for (int i = 0; i < n; i++)
                {
                    var e = new DialogOption();
                    if (!ReadDialogOption(ref r, e)) return false;
                    a[i] = e;
                }
                v.Options = a;
            }
            return r.Error == WireError.None;
        }

        // ── DialogOption ──

        /// <summary>DialogOption 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeDialogOption(DialogOption p)
        {
            int n = 1;
            n += WireCheck.Str(p.Label, 240, "DialogOption.label");
            if (p.Next != null)
            {
                n += WireCheck.Str(p.Next, 64, "DialogOption.next");
            }
            if (p.Action != null)
            {
                n += SizeDialogAction(WireCheck.NotNull(p.Action, "DialogOption.action"));
            }
            return n;
        }

        /// <summary>DialogOption를 o[off..]에 쓰고 끝 오프셋 — SizeDialogOption로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteDialogOption(DialogOption p, global::System.Span<byte> o, int off)
        {
            uint pm = 0;
            if (p.Next != null) pm |= 1u << 0;
            if (p.Action != null) pm |= 1u << 1;
            off = WireWrite.U8(o, off, (byte)((pm >> 0) & 0xff));
            off = WireWrite.Str(o, off, p.Label);
            if (p.Next != null) off = WireWrite.Str(o, off, p.Next);
            if (p.Action != null) off = WriteDialogAction(p.Action, o, off);
            return off;
        }

        /// <summary>DialogOption 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadDialogOption(ref WireReader r, DialogOption v)
        {
            uint pm = r.Presence(1, 2);
            v.Label = r.Str(240);
            if ((pm & (1u << 0)) != 0) v.Next = r.Str(64);
            if ((pm & (1u << 1)) != 0)
            {
                var s = new DialogAction();
                if (!ReadDialogAction(ref r, s)) return false;
                v.Action = s;
            }
            return r.Error == WireError.None;
        }

        // ── DialogAction ──

        /// <summary>DialogAction 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeDialogAction(DialogAction p)
        {
            int n = 1;
            n += WireCheck.Str(p.Type, 32, "DialogAction.type");
            if (p.QuestId.HasValue)
            {
                n += 4;
            }
            if (p.ShopId.HasValue)
            {
                n += 4;
            }
            return n;
        }

        /// <summary>DialogAction를 o[off..]에 쓰고 끝 오프셋 — SizeDialogAction로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteDialogAction(DialogAction p, global::System.Span<byte> o, int off)
        {
            uint pm = 0;
            if (p.QuestId.HasValue) pm |= 1u << 0;
            if (p.ShopId.HasValue) pm |= 1u << 1;
            off = WireWrite.U8(o, off, (byte)((pm >> 0) & 0xff));
            off = WireWrite.Str(o, off, p.Type);
            if (p.QuestId.HasValue) off = WireWrite.I32(o, off, p.QuestId.Value);
            if (p.ShopId.HasValue) off = WireWrite.I32(o, off, p.ShopId.Value);
            return off;
        }

        /// <summary>DialogAction 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadDialogAction(ref WireReader r, DialogAction v)
        {
            uint pm = r.Presence(1, 2);
            v.Type = r.Str(32);
            if ((pm & (1u << 0)) != 0) v.QuestId = r.I32();
            if ((pm & (1u << 1)) != 0) v.ShopId = r.I32();
            return r.Error == WireError.None;
        }

        // ── QuestLogEntry ──

        /// <summary>QuestLogEntry 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeQuestLogEntry(QuestLogEntry p)
        {
            int n = 17;
            CheckQuestType(p.Type, "QuestLogEntry.type");
            n += WireCheck.Str(p.Name, 120, "QuestLogEntry.name");
            n += WireCheck.Str(p.Description, 1500, "QuestLogEntry.description");
            {
                int c = WireCheck.Count(p.Objectives, 0, 8, "QuestLogEntry.objectives");
                for (int i = 0; i < c; i++) n += SizeQuestLogObjective(WireCheck.NotNull(p.Objectives[i], "QuestLogEntry.objectives"));
            }
            n += SizeQuestRewardPreview(WireCheck.NotNull(p.RewardPreview, "QuestLogEntry.rewardPreview"));
            return n;
        }

        /// <summary>QuestLogEntry를 o[off..]에 쓰고 끝 오프셋 — SizeQuestLogEntry로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteQuestLogEntry(QuestLogEntry p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.QuestId);
            off = WireWrite.U8(o, off, (byte)p.Type);
            off = WireWrite.Str(o, off, p.Name);
            off = WireWrite.Str(o, off, p.Description);
            off = WireWrite.I32(o, off, p.GiverNpcId);
            off = WireWrite.I32(o, off, p.TurnInNpcId);
            off = WireWrite.Bool(o, off, p.Abandonable);
            off = WireWrite.Bool(o, off, p.Completable);
            off = WireWrite.U16(o, off, (ushort)p.Objectives.Length);
            for (int i = 0; i < p.Objectives.Length; i++) off = WriteQuestLogObjective(p.Objectives[i], o, off);
            off = WriteQuestRewardPreview(p.RewardPreview, o, off);
            return off;
        }

        /// <summary>QuestLogEntry 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadQuestLogEntry(ref WireReader r, QuestLogEntry v)
        {
            v.QuestId = r.I32();
            v.Type = ReadQuestType(ref r);
            v.Name = r.Str(120);
            v.Description = r.Str(1500);
            v.GiverNpcId = r.I32();
            v.TurnInNpcId = r.I32();
            v.Abandonable = r.Bool();
            v.Completable = r.Bool();
            {
                int n = r.Count(0, 8);
                var a = new QuestLogObjective[r.Capacity(n)];
                for (int i = 0; i < n; i++)
                {
                    var e = new QuestLogObjective();
                    if (!ReadQuestLogObjective(ref r, e)) return false;
                    a[i] = e;
                }
                v.Objectives = a;
            }
            {
                var s = new QuestRewardPreview();
                if (!ReadQuestRewardPreview(ref r, s)) return false;
                v.RewardPreview = s;
            }
            return r.Error == WireError.None;
        }

        // ── QuestLogObjective ──

        /// <summary>QuestLogObjective 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeQuestLogObjective(QuestLogObjective p)
        {
            int n = 13;
            CheckQuestObjectiveKind(p.Kind, "QuestLogObjective.kind");
            n += WireCheck.Str(p.Text, 96, "QuestLogObjective.text");
            return n;
        }

        /// <summary>QuestLogObjective를 o[off..]에 쓰고 끝 오프셋 — SizeQuestLogObjective로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteQuestLogObjective(QuestLogObjective p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.U8(o, off, (byte)p.Kind);
            off = WireWrite.Str(o, off, p.Text);
            off = WireWrite.I32(o, off, p.TargetId);
            off = WireWrite.I32(o, off, p.Current);
            off = WireWrite.I32(o, off, p.Required);
            return off;
        }

        /// <summary>QuestLogObjective 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadQuestLogObjective(ref WireReader r, QuestLogObjective v)
        {
            v.Kind = ReadQuestObjectiveKind(ref r);
            v.Text = r.Str(96);
            v.TargetId = r.I32();
            v.Current = r.I32();
            v.Required = r.I32();
            return r.Error == WireError.None;
        }

        // ── QuestRewardPreview ──

        /// <summary>QuestRewardPreview 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeQuestRewardPreview(QuestRewardPreview p)
        {
            int n = 24;
            {
                int c = WireCheck.Count(p.Fixed, 0, 8, "QuestRewardPreview.fixed");
                for (int i = 0; i < c; i++) n += SizeRewardPreviewItem(WireCheck.NotNull(p.Fixed[i], "QuestRewardPreview.fixed"));
            }
            {
                int c = WireCheck.Count(p.Choice, 0, 8, "QuestRewardPreview.choice");
                for (int i = 0; i < c; i++) n += SizeRewardPreviewItem(WireCheck.NotNull(p.Choice[i], "QuestRewardPreview.choice"));
            }
            {
                int c = WireCheck.Count(p.Random, 0, 8, "QuestRewardPreview.random");
                for (int i = 0; i < c; i++) n += SizeRewardPreviewItem(WireCheck.NotNull(p.Random[i], "QuestRewardPreview.random"));
            }
            {
                int c = WireCheck.Count(p.Bonus, 0, 8, "QuestRewardPreview.bonus");
                for (int i = 0; i < c; i++) n += SizeRewardPreviewItem(WireCheck.NotNull(p.Bonus[i], "QuestRewardPreview.bonus"));
            }
            return n;
        }

        /// <summary>QuestRewardPreview를 o[off..]에 쓰고 끝 오프셋 — SizeQuestRewardPreview로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteQuestRewardPreview(QuestRewardPreview p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.Exp);
            off = WireWrite.I32(o, off, p.Sexp);
            off = WireWrite.I32(o, off, p.Slp);
            off = WireWrite.I32(o, off, p.Gold);
            off = WireWrite.U16(o, off, (ushort)p.Fixed.Length);
            for (int i = 0; i < p.Fixed.Length; i++) off = WriteRewardPreviewItem(p.Fixed[i], o, off);
            off = WireWrite.U16(o, off, (ushort)p.Choice.Length);
            for (int i = 0; i < p.Choice.Length; i++) off = WriteRewardPreviewItem(p.Choice[i], o, off);
            off = WireWrite.U16(o, off, (ushort)p.Random.Length);
            for (int i = 0; i < p.Random.Length; i++) off = WriteRewardPreviewItem(p.Random[i], o, off);
            off = WireWrite.U16(o, off, (ushort)p.Bonus.Length);
            for (int i = 0; i < p.Bonus.Length; i++) off = WriteRewardPreviewItem(p.Bonus[i], o, off);
            return off;
        }

        /// <summary>QuestRewardPreview 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadQuestRewardPreview(ref WireReader r, QuestRewardPreview v)
        {
            v.Exp = r.I32();
            v.Sexp = r.I32();
            v.Slp = r.I32();
            v.Gold = r.I32();
            {
                int n = r.Count(0, 8);
                if (!r.Need(n * 8)) return false;
                var a = new RewardPreviewItem[n];
                for (int i = 0; i < n; i++)
                {
                    var e = new RewardPreviewItem();
                    if (!ReadRewardPreviewItem(ref r, e)) return false;
                    a[i] = e;
                }
                v.Fixed = a;
            }
            {
                int n = r.Count(0, 8);
                if (!r.Need(n * 8)) return false;
                var a = new RewardPreviewItem[n];
                for (int i = 0; i < n; i++)
                {
                    var e = new RewardPreviewItem();
                    if (!ReadRewardPreviewItem(ref r, e)) return false;
                    a[i] = e;
                }
                v.Choice = a;
            }
            {
                int n = r.Count(0, 8);
                if (!r.Need(n * 8)) return false;
                var a = new RewardPreviewItem[n];
                for (int i = 0; i < n; i++)
                {
                    var e = new RewardPreviewItem();
                    if (!ReadRewardPreviewItem(ref r, e)) return false;
                    a[i] = e;
                }
                v.Random = a;
            }
            {
                int n = r.Count(0, 8);
                if (!r.Need(n * 8)) return false;
                var a = new RewardPreviewItem[n];
                for (int i = 0; i < n; i++)
                {
                    var e = new RewardPreviewItem();
                    if (!ReadRewardPreviewItem(ref r, e)) return false;
                    a[i] = e;
                }
                v.Bonus = a;
            }
            return r.Error == WireError.None;
        }

        // ── RewardPreviewItem ──

        /// <summary>RewardPreviewItem 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeRewardPreviewItem(RewardPreviewItem p)
        {
            return 8;
        }

        /// <summary>RewardPreviewItem를 o[off..]에 쓰고 끝 오프셋 — SizeRewardPreviewItem로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteRewardPreviewItem(RewardPreviewItem p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.ItemId);
            off = WireWrite.I32(o, off, p.Qty);
            return off;
        }

        /// <summary>RewardPreviewItem 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadRewardPreviewItem(ref WireReader r, RewardPreviewItem v)
        {
            v.ItemId = r.I32();
            v.Qty = r.I32();
            return r.Error == WireError.None;
        }

        // ── QuestGrantSummary ──

        /// <summary>QuestGrantSummary 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeQuestGrantSummary(QuestGrantSummary p)
        {
            int n = 18;
            {
                int c = WireCheck.Count(p.Items, 0, 18, "QuestGrantSummary.items");
                for (int i = 0; i < c; i++) n += SizeQuestGrantItem(WireCheck.NotNull(p.Items[i], "QuestGrantSummary.items"));
            }
            return n;
        }

        /// <summary>QuestGrantSummary를 o[off..]에 쓰고 끝 오프셋 — SizeQuestGrantSummary로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteQuestGrantSummary(QuestGrantSummary p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.Exp);
            off = WireWrite.I32(o, off, p.Sexp);
            off = WireWrite.I32(o, off, p.Slp);
            off = WireWrite.I32(o, off, p.Gold);
            off = WireWrite.U16(o, off, (ushort)p.Items.Length);
            for (int i = 0; i < p.Items.Length; i++) off = WriteQuestGrantItem(p.Items[i], o, off);
            return off;
        }

        /// <summary>QuestGrantSummary 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadQuestGrantSummary(ref WireReader r, QuestGrantSummary v)
        {
            v.Exp = r.I32();
            v.Sexp = r.I32();
            v.Slp = r.I32();
            v.Gold = r.I32();
            {
                int n = r.Count(0, 18);
                if (!r.Need(n * 9)) return false;
                var a = new QuestGrantItem[n];
                for (int i = 0; i < n; i++)
                {
                    var e = new QuestGrantItem();
                    if (!ReadQuestGrantItem(ref r, e)) return false;
                    a[i] = e;
                }
                v.Items = a;
            }
            return r.Error == WireError.None;
        }

        // ── QuestGrantItem ──

        /// <summary>QuestGrantItem 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeQuestGrantItem(QuestGrantItem p)
        {
            CheckRewardSource(p.Source, "QuestGrantItem.source");
            return 9;
        }

        /// <summary>QuestGrantItem를 o[off..]에 쓰고 끝 오프셋 — SizeQuestGrantItem로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteQuestGrantItem(QuestGrantItem p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.ItemId);
            off = WireWrite.I32(o, off, p.Qty);
            off = WireWrite.U8(o, off, (byte)p.Source);
            return off;
        }

        /// <summary>QuestGrantItem 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadQuestGrantItem(ref WireReader r, QuestGrantItem v)
        {
            v.ItemId = r.I32();
            v.Qty = r.I32();
            v.Source = ReadRewardSource(ref r);
            return r.Error == WireError.None;
        }

        // ── NpcQuestMarker ──

        /// <summary>NpcQuestMarker 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeNpcQuestMarker(NpcQuestMarker p)
        {
            return 8;
        }

        /// <summary>NpcQuestMarker를 o[off..]에 쓰고 끝 오프셋 — SizeNpcQuestMarker로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteNpcQuestMarker(NpcQuestMarker p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.NpcId);
            off = WireWrite.I32(o, off, p.Marker);
            return off;
        }

        /// <summary>NpcQuestMarker 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadNpcQuestMarker(ref WireReader r, NpcQuestMarker v)
        {
            v.NpcId = r.I32();
            v.Marker = r.I32();
            return r.Error == WireError.None;
        }

        // ── ShopOffer ──

        /// <summary>ShopOffer 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeShopOffer(ShopOffer p)
        {
            return 12;
        }

        /// <summary>ShopOffer를 o[off..]에 쓰고 끝 오프셋 — SizeShopOffer로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteShopOffer(ShopOffer p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.ItemId);
            off = WireWrite.I32(o, off, p.BuyPrice);
            off = WireWrite.I32(o, off, p.SellPrice);
            return off;
        }

        /// <summary>ShopOffer 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadShopOffer(ref WireReader r, ShopOffer v)
        {
            v.ItemId = r.I32();
            v.BuyPrice = r.I32();
            v.SellPrice = r.I32();
            return r.Error == WireError.None;
        }

        // ── LifeLineInfo ──

        /// <summary>LifeLineInfo 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeLifeLineInfo(LifeLineInfo p)
        {
            CheckLifeLine(p.Line, "LifeLineInfo.line");
            return 10;
        }

        /// <summary>LifeLineInfo를 o[off..]에 쓰고 끝 오프셋 — SizeLifeLineInfo로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteLifeLineInfo(LifeLineInfo p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.U8(o, off, (byte)p.Line);
            off = WireWrite.I32(o, off, p.Points);
            off = WireWrite.U8(o, off, p.Rank);
            off = WireWrite.I32(o, off, p.NextRankAt);
            return off;
        }

        /// <summary>LifeLineInfo 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadLifeLineInfo(ref WireReader r, LifeLineInfo v)
        {
            v.Line = ReadLifeLine(ref r);
            v.Points = r.I32();
            v.Rank = r.U8();
            v.NextRankAt = r.I32();
            return r.Error == WireError.None;
        }

        // ── NodeDefInfo ──

        /// <summary>NodeDefInfo 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeNodeDefInfo(NodeDefInfo p)
        {
            CheckLifeLine(p.Line, "NodeDefInfo.line");
            WireCheck.F32(p.InteractRadius, "NodeDefInfo.interactRadius");
            return 11;
        }

        /// <summary>NodeDefInfo를 o[off..]에 쓰고 끝 오프셋 — SizeNodeDefInfo로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteNodeDefInfo(NodeDefInfo p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.NodeDefId);
            off = WireWrite.U8(o, off, (byte)p.Line);
            off = WireWrite.U8(o, off, p.Tier);
            off = WireWrite.U8(o, off, p.MinRank);
            off = WireWrite.F32(o, off, p.InteractRadius);
            return off;
        }

        /// <summary>NodeDefInfo 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadNodeDefInfo(ref WireReader r, NodeDefInfo v)
        {
            v.NodeDefId = r.I32();
            v.Line = ReadLifeLine(ref r);
            v.Tier = r.U8();
            v.MinRank = r.U8();
            v.InteractRadius = r.F32();
            return r.Error == WireError.None;
        }

        // ── PuzzlePoint ──

        /// <summary>PuzzlePoint 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizePuzzlePoint(PuzzlePoint p)
        {
            return 4;
        }

        /// <summary>PuzzlePoint를 o[off..]에 쓰고 끝 오프셋 — SizePuzzlePoint로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WritePuzzlePoint(PuzzlePoint p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.U16(o, off, p.X);
            off = WireWrite.U16(o, off, p.Y);
            return off;
        }

        /// <summary>PuzzlePoint 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadPuzzlePoint(ref WireReader r, PuzzlePoint v)
        {
            v.X = r.U16();
            v.Y = r.U16();
            return r.Error == WireError.None;
        }

        // ── PuzzleTap ──

        /// <summary>PuzzleTap 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizePuzzleTap(PuzzleTap p)
        {
            return 7;
        }

        /// <summary>PuzzleTap를 o[off..]에 쓰고 끝 오프셋 — SizePuzzleTap로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WritePuzzleTap(PuzzleTap p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.U8(o, off, p.Cycle);
            off = WireWrite.U16(o, off, p.Ms);
            off = WireWrite.U16(o, off, p.X);
            off = WireWrite.U16(o, off, p.Y);
            return off;
        }

        /// <summary>PuzzleTap 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadPuzzleTap(ref WireReader r, PuzzleTap v)
        {
            v.Cycle = r.U8();
            v.Ms = r.U16();
            v.X = r.U16();
            v.Y = r.U16();
            return r.Error == WireError.None;
        }

        // ── RecipeInfo ──

        /// <summary>RecipeInfo 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeRecipeInfo(RecipeInfo p)
        {
            int n = 29;
            CheckLifeLine(p.Line, "RecipeInfo.line");
            {
                int c = WireCheck.Count(p.Inputs, 0, 6, "RecipeInfo.inputs");
                for (int i = 0; i < c; i++) n += SizeRewardPreviewItem(WireCheck.NotNull(p.Inputs[i], "RecipeInfo.inputs"));
            }
            return n;
        }

        /// <summary>RecipeInfo를 o[off..]에 쓰고 끝 오프셋 — SizeRecipeInfo로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteRecipeInfo(RecipeInfo p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.RecipeId);
            off = WireWrite.U8(o, off, (byte)p.Line);
            off = WireWrite.U8(o, off, p.Tier);
            off = WireWrite.U8(o, off, p.MinRank);
            off = WireWrite.I32(o, off, p.LaborCost);
            off = WireWrite.I32(o, off, p.GoldFee);
            off = WireWrite.I32(o, off, p.OutputItemId);
            off = WireWrite.I32(o, off, p.OutputQty);
            off = WireWrite.I32(o, off, p.GreatBonusQty);
            off = WireWrite.U16(o, off, (ushort)p.Inputs.Length);
            for (int i = 0; i < p.Inputs.Length; i++) off = WriteRewardPreviewItem(p.Inputs[i], o, off);
            return off;
        }

        /// <summary>RecipeInfo 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadRecipeInfo(ref WireReader r, RecipeInfo v)
        {
            v.RecipeId = r.I32();
            v.Line = ReadLifeLine(ref r);
            v.Tier = r.U8();
            v.MinRank = r.U8();
            v.LaborCost = r.I32();
            v.GoldFee = r.I32();
            v.OutputItemId = r.I32();
            v.OutputQty = r.I32();
            v.GreatBonusQty = r.I32();
            {
                int n = r.Count(0, 6);
                if (!r.Need(n * 8)) return false;
                var a = new RewardPreviewItem[n];
                for (int i = 0; i < n; i++)
                {
                    var e = new RewardPreviewItem();
                    if (!ReadRewardPreviewItem(ref r, e)) return false;
                    a[i] = e;
                }
                v.Inputs = a;
            }
            return r.Error == WireError.None;
        }

        // ── HELLO ──

        /// <summary>HELLO 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeHello(HelloPayload p)
        {
            return 8;
        }

        /// <summary>HELLO를 o[off..]에 쓰고 끝 오프셋 — SizeHello로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteHello(HelloPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.ClientProtoVer);
            off = WireWrite.U32(o, off, p.ClientBuildHash);
            return off;
        }

        /// <summary>HELLO 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadHello(ref WireReader r, HelloPayload v)
        {
            v.ClientProtoVer = r.I32();
            v.ClientBuildHash = r.U32();
            return r.Error == WireError.None;
        }

        // ── HELLO_ACK ──

        /// <summary>HELLO_ACK 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeHelloAck(HelloAckPayload p)
        {
            int n = 12;
            WireCheck.F64(p.ServerTimeMs, "HELLO_ACK.serverTimeMs");
            n += WireCheck.Str(p.SessionNonce, 64, "HELLO_ACK.sessionNonce");
            return n;
        }

        /// <summary>HELLO_ACK를 o[off..]에 쓰고 끝 오프셋 — SizeHelloAck로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteHelloAck(HelloAckPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.ServerProtoVer);
            off = WireWrite.F64(o, off, p.ServerTimeMs);
            off = WireWrite.Str(o, off, p.SessionNonce);
            return off;
        }

        /// <summary>HELLO_ACK 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadHelloAck(ref WireReader r, HelloAckPayload v)
        {
            v.ServerProtoVer = r.I32();
            v.ServerTimeMs = r.F64();
            v.SessionNonce = r.Str(64);
            return r.Error == WireError.None;
        }

        // ── AUTH_REQ ──

        /// <summary>AUTH_REQ 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeAuthReq(AuthReqPayload p)
        {
            int n = 4;
            n += WireCheck.Str(p.Username, 64, "AUTH_REQ.username");
            n += WireCheck.Str(p.Secret, 256, "AUTH_REQ.secret");
            return n;
        }

        /// <summary>AUTH_REQ를 o[off..]에 쓰고 끝 오프셋 — SizeAuthReq로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteAuthReq(AuthReqPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.Mode);
            off = WireWrite.Str(o, off, p.Username);
            off = WireWrite.Str(o, off, p.Secret);
            return off;
        }

        /// <summary>AUTH_REQ 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadAuthReq(ref WireReader r, AuthReqPayload v)
        {
            v.Mode = r.I32();
            v.Username = r.Str(64);
            v.Secret = r.Str(256);
            return r.Error == WireError.None;
        }

        // ── AUTH_RESULT ──

        /// <summary>AUTH_RESULT 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeAuthResult(AuthResultPayload p)
        {
            int n = 9;
            n += WireCheck.Str(p.SessionToken, 64, "AUTH_RESULT.sessionToken");
            return n;
        }

        /// <summary>AUTH_RESULT를 o[off..]에 쓰고 끝 오프셋 — SizeAuthResult로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteAuthResult(AuthResultPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.Bool(o, off, p.Ok);
            off = WireWrite.I32(o, off, p.AccountId);
            off = WireWrite.Str(o, off, p.SessionToken);
            off = WireWrite.I32(o, off, p.ErrCode);
            return off;
        }

        /// <summary>AUTH_RESULT 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadAuthResult(ref WireReader r, AuthResultPayload v)
        {
            v.Ok = r.Bool();
            v.AccountId = r.I32();
            v.SessionToken = r.Str(64);
            v.ErrCode = r.I32();
            return r.Error == WireError.None;
        }

        // ── CHAR_LIST_REQ ──

        /// <summary>CHAR_LIST_REQ 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeCharListReq(CharListReqPayload p)
        {
            return 0;
        }

        /// <summary>CHAR_LIST_REQ를 o[off..]에 쓰고 끝 오프셋 — SizeCharListReq로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteCharListReq(CharListReqPayload p, global::System.Span<byte> o, int off)
        {
            return off;
        }

        /// <summary>CHAR_LIST_REQ 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadCharListReq(ref WireReader r, CharListReqPayload v)
        {
            return r.Error == WireError.None;
        }

        // ── CHAR_LIST ──

        /// <summary>CHAR_LIST 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeCharList(CharListPayload p)
        {
            int n = 2;
            {
                int c = WireCheck.Count(p.Chars, 0, 16, "CHAR_LIST.chars");
                for (int i = 0; i < c; i++) n += SizeCharSummary(WireCheck.NotNull(p.Chars[i], "CHAR_LIST.chars"));
            }
            return n;
        }

        /// <summary>CHAR_LIST를 o[off..]에 쓰고 끝 오프셋 — SizeCharList로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteCharList(CharListPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.U16(o, off, (ushort)p.Chars.Length);
            for (int i = 0; i < p.Chars.Length; i++) off = WriteCharSummary(p.Chars[i], o, off);
            return off;
        }

        /// <summary>CHAR_LIST 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadCharList(ref WireReader r, CharListPayload v)
        {
            {
                int n = r.Count(0, 16);
                var a = new CharSummary[r.Capacity(n)];
                for (int i = 0; i < n; i++)
                {
                    var e = new CharSummary();
                    if (!ReadCharSummary(ref r, e)) return false;
                    a[i] = e;
                }
                v.Chars = a;
            }
            return r.Error == WireError.None;
        }

        // ── ENTER_WORLD_REQ ──

        /// <summary>ENTER_WORLD_REQ 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeEnterWorldReq(EnterWorldReqPayload p)
        {
            return 4;
        }

        /// <summary>ENTER_WORLD_REQ를 o[off..]에 쓰고 끝 오프셋 — SizeEnterWorldReq로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteEnterWorldReq(EnterWorldReqPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.CharId);
            return off;
        }

        /// <summary>ENTER_WORLD_REQ 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadEnterWorldReq(ref WireReader r, EnterWorldReqPayload v)
        {
            v.CharId = r.I32();
            return r.Error == WireError.None;
        }

        // ── ENTER_WORLD_OK ──

        /// <summary>ENTER_WORLD_OK 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeEnterWorldOk(EnterWorldOkPayload p)
        {
            WireCheck.F32(p.SpawnX, "ENTER_WORLD_OK.spawnX");
            WireCheck.F32(p.SpawnY, "ENTER_WORLD_OK.spawnY");
            return 20;
        }

        /// <summary>ENTER_WORLD_OK를 o[off..]에 쓰고 끝 오프셋 — SizeEnterWorldOk로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteEnterWorldOk(EnterWorldOkPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.CharId);
            off = WireWrite.I32(o, off, p.ZoneId);
            off = WireWrite.I32(o, off, p.TickIndex);
            off = WireWrite.F32(o, off, p.SpawnX);
            off = WireWrite.F32(o, off, p.SpawnY);
            return off;
        }

        /// <summary>ENTER_WORLD_OK 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadEnterWorldOk(ref WireReader r, EnterWorldOkPayload v)
        {
            v.CharId = r.I32();
            v.ZoneId = r.I32();
            v.TickIndex = r.I32();
            v.SpawnX = r.F32();
            v.SpawnY = r.F32();
            return r.Error == WireError.None;
        }

        // ── ZONE_INFO ──

        /// <summary>ZONE_INFO 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeZoneInfo(ZoneInfoPayload p)
        {
            int n = 24;
            n += WireCheck.Str(p.Name, 64, "ZONE_INFO.name");
            WireCheck.F32(p.Width, "ZONE_INFO.width");
            WireCheck.F32(p.Height, "ZONE_INFO.height");
            WireCheck.F32(p.SpawnX, "ZONE_INFO.spawnX");
            WireCheck.F32(p.SpawnY, "ZONE_INFO.spawnY");
            return n;
        }

        /// <summary>ZONE_INFO를 o[off..]에 쓰고 끝 오프셋 — SizeZoneInfo로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteZoneInfo(ZoneInfoPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.ZoneId);
            off = WireWrite.Str(o, off, p.Name);
            off = WireWrite.F32(o, off, p.Width);
            off = WireWrite.F32(o, off, p.Height);
            off = WireWrite.I32(o, off, p.TickRate);
            off = WireWrite.F32(o, off, p.SpawnX);
            off = WireWrite.F32(o, off, p.SpawnY);
            return off;
        }

        /// <summary>ZONE_INFO 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadZoneInfo(ref WireReader r, ZoneInfoPayload v)
        {
            v.ZoneId = r.I32();
            v.Name = r.Str(64);
            v.Width = r.F32();
            v.Height = r.F32();
            v.TickRate = r.I32();
            v.SpawnX = r.F32();
            v.SpawnY = r.F32();
            return r.Error == WireError.None;
        }

        // ── CHAR_CREATE_REQ ──

        /// <summary>CHAR_CREATE_REQ 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeCharCreateReq(CharCreateReqPayload p)
        {
            int n = 0;
            n += WireCheck.Str(p.Name, 64, "CHAR_CREATE_REQ.name");
            return n;
        }

        /// <summary>CHAR_CREATE_REQ를 o[off..]에 쓰고 끝 오프셋 — SizeCharCreateReq로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteCharCreateReq(CharCreateReqPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.Str(o, off, p.Name);
            return off;
        }

        /// <summary>CHAR_CREATE_REQ 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadCharCreateReq(ref WireReader r, CharCreateReqPayload v)
        {
            v.Name = r.Str(64);
            return r.Error == WireError.None;
        }

        // ── CHAR_CREATE_RESULT ──

        /// <summary>CHAR_CREATE_RESULT 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeCharCreateResult(CharCreateResultPayload p)
        {
            int n = 9;
            n += WireCheck.Str(p.Name, 64, "CHAR_CREATE_RESULT.name");
            return n;
        }

        /// <summary>CHAR_CREATE_RESULT를 o[off..]에 쓰고 끝 오프셋 — SizeCharCreateResult로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteCharCreateResult(CharCreateResultPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.Bool(o, off, p.Ok);
            off = WireWrite.I32(o, off, p.CharId);
            off = WireWrite.Str(o, off, p.Name);
            off = WireWrite.I32(o, off, p.ErrCode);
            return off;
        }

        /// <summary>CHAR_CREATE_RESULT 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadCharCreateResult(ref WireReader r, CharCreateResultPayload v)
        {
            v.Ok = r.Bool();
            v.CharId = r.I32();
            v.Name = r.Str(64);
            v.ErrCode = r.I32();
            return r.Error == WireError.None;
        }

        // ── ZONE_CHANGE_REQ ──

        /// <summary>ZONE_CHANGE_REQ 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeZoneChangeReq(ZoneChangeReqPayload p)
        {
            return 4;
        }

        /// <summary>ZONE_CHANGE_REQ를 o[off..]에 쓰고 끝 오프셋 — SizeZoneChangeReq로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteZoneChangeReq(ZoneChangeReqPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.PortalId);
            return off;
        }

        /// <summary>ZONE_CHANGE_REQ 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadZoneChangeReq(ref WireReader r, ZoneChangeReqPayload v)
        {
            v.PortalId = r.I32();
            return r.Error == WireError.None;
        }

        // ── ZONE_CHANGE ──

        /// <summary>ZONE_CHANGE 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeZoneChange(ZoneChangePayload p)
        {
            int n = 28;
            n += WireCheck.Str(p.Name, 64, "ZONE_CHANGE.name");
            WireCheck.F32(p.Width, "ZONE_CHANGE.width");
            WireCheck.F32(p.Height, "ZONE_CHANGE.height");
            WireCheck.F32(p.SpawnX, "ZONE_CHANGE.spawnX");
            WireCheck.F32(p.SpawnY, "ZONE_CHANGE.spawnY");
            return n;
        }

        /// <summary>ZONE_CHANGE를 o[off..]에 쓰고 끝 오프셋 — SizeZoneChange로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteZoneChange(ZoneChangePayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.NewZoneId);
            off = WireWrite.Str(o, off, p.Name);
            off = WireWrite.F32(o, off, p.Width);
            off = WireWrite.F32(o, off, p.Height);
            off = WireWrite.I32(o, off, p.TickRate);
            off = WireWrite.F32(o, off, p.SpawnX);
            off = WireWrite.F32(o, off, p.SpawnY);
            off = WireWrite.I32(o, off, p.TickIndex);
            return off;
        }

        /// <summary>ZONE_CHANGE 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadZoneChange(ref WireReader r, ZoneChangePayload v)
        {
            v.NewZoneId = r.I32();
            v.Name = r.Str(64);
            v.Width = r.F32();
            v.Height = r.F32();
            v.TickRate = r.I32();
            v.SpawnX = r.F32();
            v.SpawnY = r.F32();
            v.TickIndex = r.I32();
            return r.Error == WireError.None;
        }

        // ── PORTAL_LIST ──

        /// <summary>PORTAL_LIST 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizePortalList(PortalListPayload p)
        {
            int n = 6;
            {
                int c = WireCheck.Count(p.Portals, 0, 32, "PORTAL_LIST.portals");
                for (int i = 0; i < c; i++) n += SizePortalMarker(WireCheck.NotNull(p.Portals[i], "PORTAL_LIST.portals"));
            }
            return n;
        }

        /// <summary>PORTAL_LIST를 o[off..]에 쓰고 끝 오프셋 — SizePortalList로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WritePortalList(PortalListPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.ZoneId);
            off = WireWrite.U16(o, off, (ushort)p.Portals.Length);
            for (int i = 0; i < p.Portals.Length; i++) off = WritePortalMarker(p.Portals[i], o, off);
            return off;
        }

        /// <summary>PORTAL_LIST 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadPortalList(ref WireReader r, PortalListPayload v)
        {
            v.ZoneId = r.I32();
            {
                int n = r.Count(0, 32);
                var a = new PortalMarker[r.Capacity(n)];
                for (int i = 0; i < n; i++)
                {
                    var e = new PortalMarker();
                    if (!ReadPortalMarker(ref r, e)) return false;
                    a[i] = e;
                }
                v.Portals = a;
            }
            return r.Error == WireError.None;
        }

        // ── INPUT_CMD ──

        /// <summary>INPUT_CMD 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeInputCmd(InputCmdPayload p)
        {
            CheckMoveGait(p.Gait, "INPUT_CMD.gait");
            return 21;
        }

        /// <summary>INPUT_CMD를 o[off..]에 쓰고 끝 오프셋 — SizeInputCmd로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteInputCmd(InputCmdPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.Seq);
            off = WireWrite.I32(o, off, p.Tick);
            off = WireWrite.I32(o, off, p.Dx);
            off = WireWrite.I32(o, off, p.Dy);
            off = WireWrite.I32(o, off, p.Action);
            off = WireWrite.U8(o, off, (byte)p.Gait);
            return off;
        }

        /// <summary>INPUT_CMD 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadInputCmd(ref WireReader r, InputCmdPayload v)
        {
            v.Seq = r.I32();
            v.Tick = r.I32();
            v.Dx = r.I32();
            v.Dy = r.I32();
            v.Action = r.I32();
            v.Gait = ReadMoveGait(ref r);
            return r.Error == WireError.None;
        }

        // ── SNAPSHOT_DELTA ──

        /// <summary>SNAPSHOT_DELTA 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeSnapshotDelta(SnapshotDeltaPayload p)
        {
            int n = 10;
            {
                int c = WireCheck.Count(p.Updates, 0, 5460, "SNAPSHOT_DELTA.updates");
                for (int i = 0; i < c; i++) n += SizeSnapshotUpdate(WireCheck.NotNull(p.Updates[i], "SNAPSHOT_DELTA.updates"));
            }
            return n;
        }

        /// <summary>SNAPSHOT_DELTA를 o[off..]에 쓰고 끝 오프셋 — SizeSnapshotDelta로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteSnapshotDelta(SnapshotDeltaPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.U32(o, off, p.TickIndex);
            off = WireWrite.U32(o, off, p.AckSeq);
            off = WireWrite.U16(o, off, (ushort)p.Updates.Length);
            for (int i = 0; i < p.Updates.Length; i++) off = WriteSnapshotUpdate(p.Updates[i], o, off);
            return off;
        }

        /// <summary>SNAPSHOT_DELTA 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadSnapshotDelta(ref WireReader r, SnapshotDeltaPayload v)
        {
            v.TickIndex = r.U32();
            v.AckSeq = r.U32();
            {
                int n = r.Count(0, 5460);
                if (!r.Need(n * 12)) return false;
                var a = new SnapshotUpdate[n];
                for (int i = 0; i < n; i++)
                {
                    var e = new SnapshotUpdate();
                    if (!ReadSnapshotUpdate(ref r, e)) return false;
                    a[i] = e;
                }
                v.Updates = a;
            }
            return r.Error == WireError.None;
        }

        // ── ENTITY_SPAWN ──

        /// <summary>ENTITY_SPAWN 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeEntitySpawn(EntitySpawnPayload p)
        {
            int n = 41;
            CheckEntityType(p.Type, "ENTITY_SPAWN.type");
            WireCheck.F32(p.X, "ENTITY_SPAWN.x");
            WireCheck.F32(p.Y, "ENTITY_SPAWN.y");
            n += WireCheck.Str(p.Name, 66, "ENTITY_SPAWN.name");
            return n;
        }

        /// <summary>ENTITY_SPAWN를 o[off..]에 쓰고 끝 오프셋 — SizeEntitySpawn로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteEntitySpawn(EntitySpawnPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.EntityId);
            off = WireWrite.U8(o, off, (byte)p.Type);
            off = WireWrite.F32(o, off, p.X);
            off = WireWrite.F32(o, off, p.Y);
            off = WireWrite.Str(o, off, p.Name);
            off = WireWrite.I32(o, off, p.Level);
            off = WireWrite.I32(o, off, p.Hp);
            off = WireWrite.I32(o, off, p.HpMax);
            off = WireWrite.I32(o, off, p.ItemId);
            off = WireWrite.I32(o, off, p.Qty);
            off = WireWrite.I32(o, off, p.NpcId);
            off = WireWrite.I32(o, off, p.MonsterDefId);
            return off;
        }

        /// <summary>ENTITY_SPAWN 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadEntitySpawn(ref WireReader r, EntitySpawnPayload v)
        {
            v.EntityId = r.I32();
            v.Type = ReadEntityType(ref r);
            v.X = r.F32();
            v.Y = r.F32();
            v.Name = r.Str(66);
            v.Level = r.I32();
            v.Hp = r.I32();
            v.HpMax = r.I32();
            v.ItemId = r.I32();
            v.Qty = r.I32();
            v.NpcId = r.I32();
            v.MonsterDefId = r.I32();
            return r.Error == WireError.None;
        }

        // ── ENTITY_DESPAWN ──

        /// <summary>ENTITY_DESPAWN 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeEntityDespawn(EntityDespawnPayload p)
        {
            return 8;
        }

        /// <summary>ENTITY_DESPAWN를 o[off..]에 쓰고 끝 오프셋 — SizeEntityDespawn로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteEntityDespawn(EntityDespawnPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.EntityId);
            off = WireWrite.I32(o, off, p.Reason);
            return off;
        }

        /// <summary>ENTITY_DESPAWN 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadEntityDespawn(ref WireReader r, EntityDespawnPayload v)
        {
            v.EntityId = r.I32();
            v.Reason = r.I32();
            return r.Error == WireError.None;
        }

        // ── MOVE_TO ──

        /// <summary>MOVE_TO 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeMoveTo(MoveToPayload p)
        {
            WireCheck.F32(p.TargetX, "MOVE_TO.targetX");
            WireCheck.F32(p.TargetY, "MOVE_TO.targetY");
            return 16;
        }

        /// <summary>MOVE_TO를 o[off..]에 쓰고 끝 오프셋 — SizeMoveTo로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteMoveTo(MoveToPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.Seq);
            off = WireWrite.I32(o, off, p.Tick);
            off = WireWrite.F32(o, off, p.TargetX);
            off = WireWrite.F32(o, off, p.TargetY);
            return off;
        }

        /// <summary>MOVE_TO 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadMoveTo(ref WireReader r, MoveToPayload v)
        {
            v.Seq = r.I32();
            v.Tick = r.I32();
            v.TargetX = r.F32();
            v.TargetY = r.F32();
            return r.Error == WireError.None;
        }

        // ── ENTITY_META ──

        /// <summary>ENTITY_META 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeEntityMeta(EntityMetaPayload p)
        {
            return 16;
        }

        /// <summary>ENTITY_META를 o[off..]에 쓰고 끝 오프셋 — SizeEntityMeta로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteEntityMeta(EntityMetaPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.EntityId);
            off = WireWrite.I32(o, off, p.Hp);
            off = WireWrite.I32(o, off, p.HpMax);
            off = WireWrite.I32(o, off, p.Level);
            return off;
        }

        /// <summary>ENTITY_META 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadEntityMeta(ref WireReader r, EntityMetaPayload v)
        {
            v.EntityId = r.I32();
            v.Hp = r.I32();
            v.HpMax = r.I32();
            v.Level = r.I32();
            return r.Error == WireError.None;
        }

        // ── MOVE_PATH ──

        /// <summary>MOVE_PATH 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeMovePath(MovePathPayload p)
        {
            int n = 10;
            {
                int c = WireCheck.Count(p.Waypoints, 0, 1024, "MOVE_PATH.waypoints");
                for (int i = 0; i < c; i++) n += SizeWaypoint(WireCheck.NotNull(p.Waypoints[i], "MOVE_PATH.waypoints"));
            }
            return n;
        }

        /// <summary>MOVE_PATH를 o[off..]에 쓰고 끝 오프셋 — SizeMovePath로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteMovePath(MovePathPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.EntityId);
            off = WireWrite.I32(o, off, p.Seq);
            off = WireWrite.U16(o, off, (ushort)p.Waypoints.Length);
            for (int i = 0; i < p.Waypoints.Length; i++) off = WriteWaypoint(p.Waypoints[i], o, off);
            return off;
        }

        /// <summary>MOVE_PATH 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadMovePath(ref WireReader r, MovePathPayload v)
        {
            v.EntityId = r.I32();
            v.Seq = r.I32();
            {
                int n = r.Count(0, 1024);
                if (!r.Need(n * 8)) return false;
                var a = new Waypoint[n];
                for (int i = 0; i < n; i++)
                {
                    var e = new Waypoint();
                    if (!ReadWaypoint(ref r, e)) return false;
                    a[i] = e;
                }
                v.Waypoints = a;
            }
            return r.Error == WireError.None;
        }

        // ── MOVE_STOP ──

        /// <summary>MOVE_STOP 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeMoveStop(MoveStopPayload p)
        {
            return 8;
        }

        /// <summary>MOVE_STOP를 o[off..]에 쓰고 끝 오프셋 — SizeMoveStop로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteMoveStop(MoveStopPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.Seq);
            off = WireWrite.I32(o, off, p.Tick);
            return off;
        }

        /// <summary>MOVE_STOP 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadMoveStop(ref WireReader r, MoveStopPayload v)
        {
            v.Seq = r.I32();
            v.Tick = r.I32();
            return r.Error == WireError.None;
        }

        // ── CHAT_SAY ──

        /// <summary>CHAT_SAY 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeChatSay(ChatSayPayload p)
        {
            int n = 4;
            n += WireCheck.Str(p.Target, 64, "CHAT_SAY.target");
            n += WireCheck.Str(p.Text, 600, "CHAT_SAY.text");
            return n;
        }

        /// <summary>CHAT_SAY를 o[off..]에 쓰고 끝 오프셋 — SizeChatSay로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteChatSay(ChatSayPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.Channel);
            off = WireWrite.Str(o, off, p.Target);
            off = WireWrite.Str(o, off, p.Text);
            return off;
        }

        /// <summary>CHAT_SAY 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadChatSay(ref WireReader r, ChatSayPayload v)
        {
            v.Channel = r.I32();
            v.Target = r.Str(64);
            v.Text = r.Str(600);
            return r.Error == WireError.None;
        }

        // ── CHAT_BCAST ──

        /// <summary>CHAT_BCAST 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeChatBcast(ChatBcastPayload p)
        {
            int n = 8;
            n += WireCheck.Str(p.SenderName, 66, "CHAT_BCAST.senderName");
            n += WireCheck.Str(p.Text, 600, "CHAT_BCAST.text");
            return n;
        }

        /// <summary>CHAT_BCAST를 o[off..]에 쓰고 끝 오프셋 — SizeChatBcast로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteChatBcast(ChatBcastPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.Channel);
            off = WireWrite.I32(o, off, p.SenderId);
            off = WireWrite.Str(o, off, p.SenderName);
            off = WireWrite.Str(o, off, p.Text);
            return off;
        }

        /// <summary>CHAT_BCAST 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadChatBcast(ref WireReader r, ChatBcastPayload v)
        {
            v.Channel = r.I32();
            v.SenderId = r.I32();
            v.SenderName = r.Str(66);
            v.Text = r.Str(600);
            return r.Error == WireError.None;
        }

        // ── CREATE_CHARACTER_V2 ──

        /// <summary>CREATE_CHARACTER_V2 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeCreateCharacterV2(CreateCharacterV2Payload p)
        {
            int n = 20;
            n += WireCheck.Str(p.Name, 64, "CREATE_CHARACTER_V2.name");
            return n;
        }

        /// <summary>CREATE_CHARACTER_V2를 o[off..]에 쓰고 끝 오프셋 — SizeCreateCharacterV2로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteCreateCharacterV2(CreateCharacterV2Payload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.Str(o, off, p.Name);
            off = WireWrite.I32(o, off, p.Race);
            off = WireWrite.I32(o, off, p.GraphPow);
            off = WireWrite.I32(o, off, p.GraphMag);
            off = WireWrite.I32(o, off, p.GraphCha);
            off = WireWrite.I32(o, off, p.GraphLuc);
            return off;
        }

        /// <summary>CREATE_CHARACTER_V2 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadCreateCharacterV2(ref WireReader r, CreateCharacterV2Payload v)
        {
            v.Name = r.Str(64);
            v.Race = r.I32();
            v.GraphPow = r.I32();
            v.GraphMag = r.I32();
            v.GraphCha = r.I32();
            v.GraphLuc = r.I32();
            return r.Error == WireError.None;
        }

        // ── CHAR_STATS_FULL ──

        /// <summary>CHAR_STATS_FULL 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeCharStatsFull(CharStatsFullPayload p)
        {
            int n = 68;
            n += WireCheck.Str(p.Name, 66, "CHAR_STATS_FULL.name");
            n += SizeCharGraph(WireCheck.NotNull(p.Graph, "CHAR_STATS_FULL.graph"));
            n += SizeCharStats(WireCheck.NotNull(p.Stats, "CHAR_STATS_FULL.stats"));
            WireCheck.F32(p.X, "CHAR_STATS_FULL.x");
            WireCheck.F32(p.Y, "CHAR_STATS_FULL.y");
            n += SizeCharDerivedStats(WireCheck.NotNull(p.Derived, "CHAR_STATS_FULL.derived"));
            return n;
        }

        /// <summary>CHAR_STATS_FULL를 o[off..]에 쓰고 끝 오프셋 — SizeCharStatsFull로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteCharStatsFull(CharStatsFullPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.CharId);
            off = WireWrite.Str(o, off, p.Name);
            off = WireWrite.I32(o, off, p.Race);
            off = WriteCharGraph(p.Graph, o, off);
            off = WriteCharStats(p.Stats, o, off);
            off = WireWrite.I32(o, off, p.Level);
            off = WireWrite.I32(o, off, p.Exp);
            off = WireWrite.I32(o, off, p.Hp);
            off = WireWrite.I32(o, off, p.HpMax);
            off = WireWrite.I32(o, off, p.Mp);
            off = WireWrite.I32(o, off, p.MpMax);
            off = WireWrite.I32(o, off, p.Slv);
            off = WireWrite.I32(o, off, p.Sexp);
            off = WireWrite.I32(o, off, p.Slp);
            off = WireWrite.I32(o, off, p.Gold);
            off = WireWrite.I32(o, off, p.ZoneId);
            off = WireWrite.F32(o, off, p.X);
            off = WireWrite.F32(o, off, p.Y);
            off = WriteCharDerivedStats(p.Derived, o, off);
            off = WireWrite.I32(o, off, p.FreePoints);
            off = WireWrite.I32(o, off, p.AllocatedPoints);
            return off;
        }

        /// <summary>CHAR_STATS_FULL 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadCharStatsFull(ref WireReader r, CharStatsFullPayload v)
        {
            v.CharId = r.I32();
            v.Name = r.Str(66);
            v.Race = r.I32();
            {
                var s = new CharGraph();
                if (!ReadCharGraph(ref r, s)) return false;
                v.Graph = s;
            }
            {
                var s = new CharStats();
                if (!ReadCharStats(ref r, s)) return false;
                v.Stats = s;
            }
            v.Level = r.I32();
            v.Exp = r.I32();
            v.Hp = r.I32();
            v.HpMax = r.I32();
            v.Mp = r.I32();
            v.MpMax = r.I32();
            v.Slv = r.I32();
            v.Sexp = r.I32();
            v.Slp = r.I32();
            v.Gold = r.I32();
            v.ZoneId = r.I32();
            v.X = r.F32();
            v.Y = r.F32();
            {
                var s = new CharDerivedStats();
                if (!ReadCharDerivedStats(ref r, s)) return false;
                v.Derived = s;
            }
            v.FreePoints = r.I32();
            v.AllocatedPoints = r.I32();
            return r.Error == WireError.None;
        }

        // ── CHAR_LEVEL_UP ──

        /// <summary>CHAR_LEVEL_UP 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeCharLevelUp(CharLevelUpPayload p)
        {
            int n = 14;
            {
                int c = WireCheck.Count(p.StatDeltas, 0, 3588, "CHAR_LEVEL_UP.statDeltas");
                for (int i = 0; i < c; i++) n += SizeCharStatDelta(WireCheck.NotNull(p.StatDeltas[i], "CHAR_LEVEL_UP.statDeltas"));
            }
            return n;
        }

        /// <summary>CHAR_LEVEL_UP를 o[off..]에 쓰고 끝 오프셋 — SizeCharLevelUp로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteCharLevelUp(CharLevelUpPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.NewLevel);
            off = WireWrite.U16(o, off, (ushort)p.StatDeltas.Length);
            for (int i = 0; i < p.StatDeltas.Length; i++) off = WriteCharStatDelta(p.StatDeltas[i], o, off);
            off = WireWrite.I32(o, off, p.HpMaxNew);
            off = WireWrite.I32(o, off, p.MpMaxNew);
            return off;
        }

        /// <summary>CHAR_LEVEL_UP 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadCharLevelUp(ref WireReader r, CharLevelUpPayload v)
        {
            v.NewLevel = r.I32();
            {
                int n = r.Count(0, 3588);
                if (!r.Need(n * 14)) return false;
                var a = new CharStatDelta[n];
                for (int i = 0; i < n; i++)
                {
                    var e = new CharStatDelta();
                    if (!ReadCharStatDelta(ref r, e)) return false;
                    a[i] = e;
                }
                v.StatDeltas = a;
            }
            v.HpMaxNew = r.I32();
            v.MpMaxNew = r.I32();
            return r.Error == WireError.None;
        }

        // ── CHAR_EXP_GAIN ──

        /// <summary>CHAR_EXP_GAIN 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeCharExpGain(CharExpGainPayload p)
        {
            return 16;
        }

        /// <summary>CHAR_EXP_GAIN를 o[off..]에 쓰고 끝 오프셋 — SizeCharExpGain로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteCharExpGain(CharExpGainPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.ExpDelta);
            off = WireWrite.I32(o, off, p.SexpDelta);
            off = WireWrite.I32(o, off, p.ExpTotal);
            off = WireWrite.I32(o, off, p.SexpTotal);
            return off;
        }

        /// <summary>CHAR_EXP_GAIN 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadCharExpGain(ref WireReader r, CharExpGainPayload v)
        {
            v.ExpDelta = r.I32();
            v.SexpDelta = r.I32();
            v.ExpTotal = r.I32();
            v.SexpTotal = r.I32();
            return r.Error == WireError.None;
        }

        // ── GOLD_UPDATE ──

        /// <summary>GOLD_UPDATE 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeGoldUpdate(GoldUpdatePayload p)
        {
            return 8;
        }

        /// <summary>GOLD_UPDATE를 o[off..]에 쓰고 끝 오프셋 — SizeGoldUpdate로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteGoldUpdate(GoldUpdatePayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.Gold);
            off = WireWrite.I32(o, off, p.Delta);
            return off;
        }

        /// <summary>GOLD_UPDATE 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadGoldUpdate(ref WireReader r, GoldUpdatePayload v)
        {
            v.Gold = r.I32();
            v.Delta = r.I32();
            return r.Error == WireError.None;
        }

        // ── STAT_ALLOCATE ──

        /// <summary>STAT_ALLOCATE 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeStatAllocate(StatAllocatePayload p)
        {
            int n = 6;
            {
                int c = WireCheck.Count(p.Allocations, 0, 12, "STAT_ALLOCATE.allocations");
                for (int i = 0; i < c; i++) n += SizeStatAllocation(WireCheck.NotNull(p.Allocations[i], "STAT_ALLOCATE.allocations"));
            }
            return n;
        }

        /// <summary>STAT_ALLOCATE를 o[off..]에 쓰고 끝 오프셋 — SizeStatAllocate로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteStatAllocate(StatAllocatePayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.RequestId);
            off = WireWrite.U16(o, off, (ushort)p.Allocations.Length);
            for (int i = 0; i < p.Allocations.Length; i++) off = WriteStatAllocation(p.Allocations[i], o, off);
            return off;
        }

        /// <summary>STAT_ALLOCATE 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadStatAllocate(ref WireReader r, StatAllocatePayload v)
        {
            v.RequestId = r.I32();
            {
                int n = r.Count(0, 12);
                if (!r.Need(n * 5)) return false;
                var a = new StatAllocation[n];
                for (int i = 0; i < n; i++)
                {
                    var e = new StatAllocation();
                    if (!ReadStatAllocation(ref r, e)) return false;
                    a[i] = e;
                }
                v.Allocations = a;
            }
            return r.Error == WireError.None;
        }

        // ── STAT_RESET ──

        /// <summary>STAT_RESET 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeStatReset(StatResetPayload p)
        {
            return 4;
        }

        /// <summary>STAT_RESET를 o[off..]에 쓰고 끝 오프셋 — SizeStatReset로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteStatReset(StatResetPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.RequestId);
            return off;
        }

        /// <summary>STAT_RESET 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadStatReset(ref WireReader r, StatResetPayload v)
        {
            v.RequestId = r.I32();
            return r.Error == WireError.None;
        }

        // ── STAT_POINTS_ACK ──

        /// <summary>STAT_POINTS_ACK 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeStatPointsAck(StatPointsAckPayload p)
        {
            return 16;
        }

        /// <summary>STAT_POINTS_ACK를 o[off..]에 쓰고 끝 오프셋 — SizeStatPointsAck로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteStatPointsAck(StatPointsAckPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.RequestId);
            off = WireWrite.I32(o, off, p.Op);
            off = WireWrite.I32(o, off, p.ErrCode);
            off = WireWrite.I32(o, off, p.FreePoints);
            return off;
        }

        /// <summary>STAT_POINTS_ACK 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadStatPointsAck(ref WireReader r, StatPointsAckPayload v)
        {
            v.RequestId = r.I32();
            v.Op = r.I32();
            v.ErrCode = r.I32();
            v.FreePoints = r.I32();
            return r.Error == WireError.None;
        }

        // ── TARGET_SELECT ──

        /// <summary>TARGET_SELECT 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeTargetSelect(TargetSelectPayload p)
        {
            return 4;
        }

        /// <summary>TARGET_SELECT를 o[off..]에 쓰고 끝 오프셋 — SizeTargetSelect로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteTargetSelect(TargetSelectPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.TargetEntityId);
            return off;
        }

        /// <summary>TARGET_SELECT 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadTargetSelect(ref WireReader r, TargetSelectPayload v)
        {
            v.TargetEntityId = r.I32();
            return r.Error == WireError.None;
        }

        // ── TARGET_ACK ──

        /// <summary>TARGET_ACK 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeTargetAck(TargetAckPayload p)
        {
            return 8;
        }

        /// <summary>TARGET_ACK를 o[off..]에 쓰고 끝 오프셋 — SizeTargetAck로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteTargetAck(TargetAckPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.TargetEntityId);
            off = WireWrite.I32(o, off, p.ErrCode);
            return off;
        }

        /// <summary>TARGET_ACK 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadTargetAck(ref WireReader r, TargetAckPayload v)
        {
            v.TargetEntityId = r.I32();
            v.ErrCode = r.I32();
            return r.Error == WireError.None;
        }

        // ── ATTACK_START ──

        /// <summary>ATTACK_START 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeAttackStart(AttackStartPayload p)
        {
            return 0;
        }

        /// <summary>ATTACK_START를 o[off..]에 쓰고 끝 오프셋 — SizeAttackStart로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteAttackStart(AttackStartPayload p, global::System.Span<byte> o, int off)
        {
            return off;
        }

        /// <summary>ATTACK_START 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadAttackStart(ref WireReader r, AttackStartPayload v)
        {
            return r.Error == WireError.None;
        }

        // ── ATTACK_STOP ──

        /// <summary>ATTACK_STOP 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeAttackStop(AttackStopPayload p)
        {
            return 0;
        }

        /// <summary>ATTACK_STOP를 o[off..]에 쓰고 끝 오프셋 — SizeAttackStop로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteAttackStop(AttackStopPayload p, global::System.Span<byte> o, int off)
        {
            return off;
        }

        /// <summary>ATTACK_STOP 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadAttackStop(ref WireReader r, AttackStopPayload v)
        {
            return r.Error == WireError.None;
        }

        // ── DAMAGE_EVENT ──

        /// <summary>DAMAGE_EVENT 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeDamageEvent(DamageEventPayload p)
        {
            return 14;
        }

        /// <summary>DAMAGE_EVENT를 o[off..]에 쓰고 끝 오프셋 — SizeDamageEvent로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteDamageEvent(DamageEventPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.AttackerEntityId);
            off = WireWrite.I32(o, off, p.TargetEntityId);
            off = WireWrite.I32(o, off, p.Damage);
            off = WireWrite.Bool(o, off, p.IsCrit);
            off = WireWrite.Bool(o, off, p.IsMiss);
            return off;
        }

        /// <summary>DAMAGE_EVENT 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadDamageEvent(ref WireReader r, DamageEventPayload v)
        {
            v.AttackerEntityId = r.I32();
            v.TargetEntityId = r.I32();
            v.Damage = r.I32();
            v.IsCrit = r.Bool();
            v.IsMiss = r.Bool();
            return r.Error == WireError.None;
        }

        // ── DEATH_NOTIFY ──

        /// <summary>DEATH_NOTIFY 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeDeathNotify(DeathNotifyPayload p)
        {
            return 16;
        }

        /// <summary>DEATH_NOTIFY를 o[off..]에 쓰고 끝 오프셋 — SizeDeathNotify로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteDeathNotify(DeathNotifyPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.VictimEntityId);
            off = WireWrite.I32(o, off, p.AttackerEntityId);
            off = WireWrite.I32(o, off, p.ExpLost);
            off = WireWrite.I32(o, off, p.SexpLost);
            return off;
        }

        /// <summary>DEATH_NOTIFY 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadDeathNotify(ref WireReader r, DeathNotifyPayload v)
        {
            v.VictimEntityId = r.I32();
            v.AttackerEntityId = r.I32();
            v.ExpLost = r.I32();
            v.SexpLost = r.I32();
            return r.Error == WireError.None;
        }

        // ── RESPAWN_REQ ──

        /// <summary>RESPAWN_REQ 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeRespawnReq(RespawnReqPayload p)
        {
            return 0;
        }

        /// <summary>RESPAWN_REQ를 o[off..]에 쓰고 끝 오프셋 — SizeRespawnReq로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteRespawnReq(RespawnReqPayload p, global::System.Span<byte> o, int off)
        {
            return off;
        }

        /// <summary>RESPAWN_REQ 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadRespawnReq(ref WireReader r, RespawnReqPayload v)
        {
            return r.Error == WireError.None;
        }

        // ── RESPAWN_OK ──

        /// <summary>RESPAWN_OK 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeRespawnOk(RespawnOkPayload p)
        {
            WireCheck.F32(p.SpawnX, "RESPAWN_OK.spawnX");
            WireCheck.F32(p.SpawnY, "RESPAWN_OK.spawnY");
            return 28;
        }

        /// <summary>RESPAWN_OK를 o[off..]에 쓰고 끝 오프셋 — SizeRespawnOk로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteRespawnOk(RespawnOkPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.ZoneId);
            off = WireWrite.F32(o, off, p.SpawnX);
            off = WireWrite.F32(o, off, p.SpawnY);
            off = WireWrite.I32(o, off, p.Hp);
            off = WireWrite.I32(o, off, p.HpMax);
            off = WireWrite.I32(o, off, p.Mp);
            off = WireWrite.I32(o, off, p.MpMax);
            return off;
        }

        /// <summary>RESPAWN_OK 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadRespawnOk(ref WireReader r, RespawnOkPayload v)
        {
            v.ZoneId = r.I32();
            v.SpawnX = r.F32();
            v.SpawnY = r.F32();
            v.Hp = r.I32();
            v.HpMax = r.I32();
            v.Mp = r.I32();
            v.MpMax = r.I32();
            return r.Error == WireError.None;
        }

        // ── SKILL_CAST ──

        /// <summary>SKILL_CAST 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeSkillCast(SkillCastPayload p)
        {
            WireCheck.F32(p.GroundX, "SKILL_CAST.groundX");
            WireCheck.F32(p.GroundY, "SKILL_CAST.groundY");
            return 16;
        }

        /// <summary>SKILL_CAST를 o[off..]에 쓰고 끝 오프셋 — SizeSkillCast로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteSkillCast(SkillCastPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.SkillId);
            off = WireWrite.I32(o, off, p.TargetEntityId);
            off = WireWrite.F32(o, off, p.GroundX);
            off = WireWrite.F32(o, off, p.GroundY);
            return off;
        }

        /// <summary>SKILL_CAST 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadSkillCast(ref WireReader r, SkillCastPayload v)
        {
            v.SkillId = r.I32();
            v.TargetEntityId = r.I32();
            v.GroundX = r.F32();
            v.GroundY = r.F32();
            return r.Error == WireError.None;
        }

        // ── SKILL_LIST ──

        /// <summary>SKILL_LIST 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeSkillList(SkillListPayload p)
        {
            int n = 2;
            {
                int c = WireCheck.Count(p.Skills, 0, 256, "SKILL_LIST.skills");
                for (int i = 0; i < c; i++) n += SizeSkillInfo(WireCheck.NotNull(p.Skills[i], "SKILL_LIST.skills"));
            }
            return n;
        }

        /// <summary>SKILL_LIST를 o[off..]에 쓰고 끝 오프셋 — SizeSkillList로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteSkillList(SkillListPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.U16(o, off, (ushort)p.Skills.Length);
            for (int i = 0; i < p.Skills.Length; i++) off = WriteSkillInfo(p.Skills[i], o, off);
            return off;
        }

        /// <summary>SKILL_LIST 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadSkillList(ref WireReader r, SkillListPayload v)
        {
            {
                int n = r.Count(0, 256);
                var a = new SkillInfo[r.Capacity(n)];
                for (int i = 0; i < n; i++)
                {
                    var e = new SkillInfo();
                    if (!ReadSkillInfo(ref r, e)) return false;
                    a[i] = e;
                }
                v.Skills = a;
            }
            return r.Error == WireError.None;
        }

        // ── SKILL_EFFECT ──

        /// <summary>SKILL_EFFECT 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeSkillEffect(SkillEffectPayload p)
        {
            CheckSkillEffectKind(p.EffectKind, "SKILL_EFFECT.effectKind");
            WireCheck.F32(p.GroundX, "SKILL_EFFECT.groundX");
            WireCheck.F32(p.GroundY, "SKILL_EFFECT.groundY");
            return 37;
        }

        /// <summary>SKILL_EFFECT를 o[off..]에 쓰고 끝 오프셋 — SizeSkillEffect로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteSkillEffect(SkillEffectPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.SkillId);
            off = WireWrite.I32(o, off, p.CasterEntityId);
            off = WireWrite.I32(o, off, p.TargetEntityId);
            off = WireWrite.U8(o, off, (byte)p.EffectKind);
            off = WireWrite.I32(o, off, p.Amount);
            off = WireWrite.Bool(o, off, p.IsCrit);
            off = WireWrite.Bool(o, off, p.IsMiss);
            off = WireWrite.F32(o, off, p.GroundX);
            off = WireWrite.F32(o, off, p.GroundY);
            off = WireWrite.I32(o, off, p.CastId);
            off = WireWrite.I32(o, off, p.ImpactDelayMs);
            off = WireWrite.U8(o, off, p.Variant);
            off = WireWrite.U8(o, off, p.HitIndex);
            return off;
        }

        /// <summary>SKILL_EFFECT 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadSkillEffect(ref WireReader r, SkillEffectPayload v)
        {
            v.SkillId = r.I32();
            v.CasterEntityId = r.I32();
            v.TargetEntityId = r.I32();
            v.EffectKind = ReadSkillEffectKind(ref r);
            v.Amount = r.I32();
            v.IsCrit = r.Bool();
            v.IsMiss = r.Bool();
            v.GroundX = r.F32();
            v.GroundY = r.F32();
            v.CastId = r.I32();
            v.ImpactDelayMs = r.I32();
            v.Variant = r.U8();
            v.HitIndex = r.U8();
            return r.Error == WireError.None;
        }

        // ── SKILL_CAST_ACK ──

        /// <summary>SKILL_CAST_ACK 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeSkillCastAck(SkillCastAckPayload p)
        {
            return 12;
        }

        /// <summary>SKILL_CAST_ACK를 o[off..]에 쓰고 끝 오프셋 — SizeSkillCastAck로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteSkillCastAck(SkillCastAckPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.SkillId);
            off = WireWrite.I32(o, off, p.ErrCode);
            off = WireWrite.I32(o, off, p.CooldownMs);
            return off;
        }

        /// <summary>SKILL_CAST_ACK 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadSkillCastAck(ref WireReader r, SkillCastAckPayload v)
        {
            v.SkillId = r.I32();
            v.ErrCode = r.I32();
            v.CooldownMs = r.I32();
            return r.Error == WireError.None;
        }

        // ── MANA_UPDATE ──

        /// <summary>MANA_UPDATE 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeManaUpdate(ManaUpdatePayload p)
        {
            return 8;
        }

        /// <summary>MANA_UPDATE를 o[off..]에 쓰고 끝 오프셋 — SizeManaUpdate로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteManaUpdate(ManaUpdatePayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.Mp);
            off = WireWrite.I32(o, off, p.MpMax);
            return off;
        }

        /// <summary>MANA_UPDATE 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadManaUpdate(ref WireReader r, ManaUpdatePayload v)
        {
            v.Mp = r.I32();
            v.MpMax = r.I32();
            return r.Error == WireError.None;
        }

        // ── SKILL_LEARN ──

        /// <summary>SKILL_LEARN 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeSkillLearn(SkillLearnPayload p)
        {
            return 4;
        }

        /// <summary>SKILL_LEARN를 o[off..]에 쓰고 끝 오프셋 — SizeSkillLearn로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteSkillLearn(SkillLearnPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.SkillId);
            return off;
        }

        /// <summary>SKILL_LEARN 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadSkillLearn(ref WireReader r, SkillLearnPayload v)
        {
            v.SkillId = r.I32();
            return r.Error == WireError.None;
        }

        // ── SKILL_LEVEL_UP ──

        /// <summary>SKILL_LEVEL_UP 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeSkillLevelUp(SkillLevelUpPayload p)
        {
            return 4;
        }

        /// <summary>SKILL_LEVEL_UP를 o[off..]에 쓰고 끝 오프셋 — SizeSkillLevelUp로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteSkillLevelUp(SkillLevelUpPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.SkillId);
            return off;
        }

        /// <summary>SKILL_LEVEL_UP 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadSkillLevelUp(ref WireReader r, SkillLevelUpPayload v)
        {
            v.SkillId = r.I32();
            return r.Error == WireError.None;
        }

        // ── SKILL_LEARN_ACK ──

        /// <summary>SKILL_LEARN_ACK 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeSkillLearnAck(SkillLearnAckPayload p)
        {
            return 20;
        }

        /// <summary>SKILL_LEARN_ACK를 o[off..]에 쓰고 끝 오프셋 — SizeSkillLearnAck로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteSkillLearnAck(SkillLearnAckPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.Op);
            off = WireWrite.I32(o, off, p.SkillId);
            off = WireWrite.I32(o, off, p.ErrCode);
            off = WireWrite.I32(o, off, p.NewLevel);
            off = WireWrite.I32(o, off, p.SlpAfter);
            return off;
        }

        /// <summary>SKILL_LEARN_ACK 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadSkillLearnAck(ref WireReader r, SkillLearnAckPayload v)
        {
            v.Op = r.I32();
            v.SkillId = r.I32();
            v.ErrCode = r.I32();
            v.NewLevel = r.I32();
            v.SlpAfter = r.I32();
            return r.Error == WireError.None;
        }

        // ── SKILL_LV_UP ──

        /// <summary>SKILL_LV_UP 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeSkillLvUp(SkillLvUpPayload p)
        {
            return 12;
        }

        /// <summary>SKILL_LV_UP를 o[off..]에 쓰고 끝 오프셋 — SizeSkillLvUp로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteSkillLvUp(SkillLvUpPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.NewSlv);
            off = WireWrite.I32(o, off, p.SlpGained);
            off = WireWrite.I32(o, off, p.SlpTotal);
            return off;
        }

        /// <summary>SKILL_LV_UP 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadSkillLvUp(ref WireReader r, SkillLvUpPayload v)
        {
            v.NewSlv = r.I32();
            v.SlpGained = r.I32();
            v.SlpTotal = r.I32();
            return r.Error == WireError.None;
        }

        // ── ITEM_USE ──

        /// <summary>ITEM_USE 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeItemUse(ItemUsePayload p)
        {
            return 4;
        }

        /// <summary>ITEM_USE를 o[off..]에 쓰고 끝 오프셋 — SizeItemUse로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteItemUse(ItemUsePayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.Slot);
            return off;
        }

        /// <summary>ITEM_USE 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadItemUse(ref WireReader r, ItemUsePayload v)
        {
            v.Slot = r.I32();
            return r.Error == WireError.None;
        }

        // ── ITEM_EQUIP ──

        /// <summary>ITEM_EQUIP 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeItemEquip(ItemEquipPayload p)
        {
            return 4;
        }

        /// <summary>ITEM_EQUIP를 o[off..]에 쓰고 끝 오프셋 — SizeItemEquip로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteItemEquip(ItemEquipPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.Slot);
            return off;
        }

        /// <summary>ITEM_EQUIP 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadItemEquip(ref WireReader r, ItemEquipPayload v)
        {
            v.Slot = r.I32();
            return r.Error == WireError.None;
        }

        // ── ITEM_UNEQUIP ──

        /// <summary>ITEM_UNEQUIP 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeItemUnequip(ItemUnequipPayload p)
        {
            return 4;
        }

        /// <summary>ITEM_UNEQUIP를 o[off..]에 쓰고 끝 오프셋 — SizeItemUnequip로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteItemUnequip(ItemUnequipPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.EquipSlot);
            return off;
        }

        /// <summary>ITEM_UNEQUIP 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadItemUnequip(ref WireReader r, ItemUnequipPayload v)
        {
            v.EquipSlot = r.I32();
            return r.Error == WireError.None;
        }

        // ── ITEM_PICKUP ──

        /// <summary>ITEM_PICKUP 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeItemPickup(ItemPickupPayload p)
        {
            return 4;
        }

        /// <summary>ITEM_PICKUP를 o[off..]에 쓰고 끝 오프셋 — SizeItemPickup로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteItemPickup(ItemPickupPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.EntityId);
            return off;
        }

        /// <summary>ITEM_PICKUP 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadItemPickup(ref WireReader r, ItemPickupPayload v)
        {
            v.EntityId = r.I32();
            return r.Error == WireError.None;
        }

        // ── INVENTORY_LIST ──

        /// <summary>INVENTORY_LIST 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeInventoryList(InventoryListPayload p)
        {
            int n = 2;
            {
                int c = WireCheck.Count(p.Slots, 0, 24, "INVENTORY_LIST.slots");
                for (int i = 0; i < c; i++) n += SizeInventoryEntry(WireCheck.NotNull(p.Slots[i], "INVENTORY_LIST.slots"));
            }
            n += SizeEquipmentSlots(WireCheck.NotNull(p.Equipment, "INVENTORY_LIST.equipment"));
            return n;
        }

        /// <summary>INVENTORY_LIST를 o[off..]에 쓰고 끝 오프셋 — SizeInventoryList로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteInventoryList(InventoryListPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.U16(o, off, (ushort)p.Slots.Length);
            for (int i = 0; i < p.Slots.Length; i++) off = WriteInventoryEntry(p.Slots[i], o, off);
            off = WriteEquipmentSlots(p.Equipment, o, off);
            return off;
        }

        /// <summary>INVENTORY_LIST 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadInventoryList(ref WireReader r, InventoryListPayload v)
        {
            {
                int n = r.Count(0, 24);
                if (!r.Need(n * 12)) return false;
                var a = new InventoryEntry[n];
                for (int i = 0; i < n; i++)
                {
                    var e = new InventoryEntry();
                    if (!ReadInventoryEntry(ref r, e)) return false;
                    a[i] = e;
                }
                v.Slots = a;
            }
            {
                var s = new EquipmentSlots();
                if (!ReadEquipmentSlots(ref r, s)) return false;
                v.Equipment = s;
            }
            return r.Error == WireError.None;
        }

        // ── ITEM_USE_ACK ──

        /// <summary>ITEM_USE_ACK 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeItemUseAck(ItemUseAckPayload p)
        {
            return 20;
        }

        /// <summary>ITEM_USE_ACK를 o[off..]에 쓰고 끝 오프셋 — SizeItemUseAck로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteItemUseAck(ItemUseAckPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.Slot);
            off = WireWrite.I32(o, off, p.ItemId);
            off = WireWrite.I32(o, off, p.ErrCode);
            off = WireWrite.I32(o, off, p.HealHp);
            off = WireWrite.I32(o, off, p.HealMp);
            return off;
        }

        /// <summary>ITEM_USE_ACK 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadItemUseAck(ref WireReader r, ItemUseAckPayload v)
        {
            v.Slot = r.I32();
            v.ItemId = r.I32();
            v.ErrCode = r.I32();
            v.HealHp = r.I32();
            v.HealMp = r.I32();
            return r.Error == WireError.None;
        }

        // ── ITEM_PICKUP_ACK ──

        /// <summary>ITEM_PICKUP_ACK 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeItemPickupAck(ItemPickupAckPayload p)
        {
            return 8;
        }

        /// <summary>ITEM_PICKUP_ACK를 o[off..]에 쓰고 끝 오프셋 — SizeItemPickupAck로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteItemPickupAck(ItemPickupAckPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.EntityId);
            off = WireWrite.I32(o, off, p.ErrCode);
            return off;
        }

        /// <summary>ITEM_PICKUP_ACK 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadItemPickupAck(ref WireReader r, ItemPickupAckPayload v)
        {
            v.EntityId = r.I32();
            v.ErrCode = r.I32();
            return r.Error == WireError.None;
        }

        // ── NPC_INTERACT ──

        /// <summary>NPC_INTERACT 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeNpcInteract(NpcInteractPayload p)
        {
            return 4;
        }

        /// <summary>NPC_INTERACT를 o[off..]에 쓰고 끝 오프셋 — SizeNpcInteract로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteNpcInteract(NpcInteractPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.EntityId);
            return off;
        }

        /// <summary>NPC_INTERACT 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadNpcInteract(ref WireReader r, NpcInteractPayload v)
        {
            v.EntityId = r.I32();
            return r.Error == WireError.None;
        }

        // ── NPC_DIALOG ──

        /// <summary>NPC_DIALOG 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeNpcDialog(NpcDialogPayload p)
        {
            int n = 14;
            n += WireCheck.Str(p.NpcName, 66, "NPC_DIALOG.npcName");
            n += WireCheck.Str(p.Entry, 64, "NPC_DIALOG.entry");
            {
                int c = WireCheck.Count(p.Nodes, 0, 12, "NPC_DIALOG.nodes");
                for (int i = 0; i < c; i++) n += SizeDialogNode(WireCheck.NotNull(p.Nodes[i], "NPC_DIALOG.nodes"));
            }
            return n;
        }

        /// <summary>NPC_DIALOG를 o[off..]에 쓰고 끝 오프셋 — SizeNpcDialog로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteNpcDialog(NpcDialogPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.EntityId);
            off = WireWrite.I32(o, off, p.NpcId);
            off = WireWrite.Str(o, off, p.NpcName);
            off = WireWrite.I32(o, off, p.DialogueId);
            off = WireWrite.Str(o, off, p.Entry);
            off = WireWrite.U16(o, off, (ushort)p.Nodes.Length);
            for (int i = 0; i < p.Nodes.Length; i++) off = WriteDialogNode(p.Nodes[i], o, off);
            return off;
        }

        /// <summary>NPC_DIALOG 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadNpcDialog(ref WireReader r, NpcDialogPayload v)
        {
            v.EntityId = r.I32();
            v.NpcId = r.I32();
            v.NpcName = r.Str(66);
            v.DialogueId = r.I32();
            v.Entry = r.Str(64);
            {
                int n = r.Count(0, 12);
                var a = new DialogNode[r.Capacity(n)];
                for (int i = 0; i < n; i++)
                {
                    var e = new DialogNode();
                    if (!ReadDialogNode(ref r, e)) return false;
                    a[i] = e;
                }
                v.Nodes = a;
            }
            return r.Error == WireError.None;
        }

        // ── NPC_ACTION ──

        /// <summary>NPC_ACTION 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeNpcAction(NpcActionPayload p)
        {
            int n = 20;
            n += WireCheck.Str(p.NodeId, 64, "NPC_ACTION.nodeId");
            n += WireCheck.Str(p.ActionType, 32, "NPC_ACTION.actionType");
            return n;
        }

        /// <summary>NPC_ACTION를 o[off..]에 쓰고 끝 오프셋 — SizeNpcAction로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteNpcAction(NpcActionPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.EntityId);
            off = WireWrite.I32(o, off, p.DialogueId);
            off = WireWrite.Str(o, off, p.NodeId);
            off = WireWrite.I32(o, off, p.OptionIndex);
            off = WireWrite.Str(o, off, p.ActionType);
            off = WireWrite.I32(o, off, p.QuestId);
            off = WireWrite.I32(o, off, p.ChosenIndex);
            return off;
        }

        /// <summary>NPC_ACTION 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadNpcAction(ref WireReader r, NpcActionPayload v)
        {
            v.EntityId = r.I32();
            v.DialogueId = r.I32();
            v.NodeId = r.Str(64);
            v.OptionIndex = r.I32();
            v.ActionType = r.Str(32);
            v.QuestId = r.I32();
            v.ChosenIndex = r.I32();
            return r.Error == WireError.None;
        }

        // ── QUEST_LIST ──

        /// <summary>QUEST_LIST 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeQuestList(QuestListPayload p)
        {
            int n = 6;
            {
                int c = WireCheck.Count(p.Active, 0, 20, "QUEST_LIST.active");
                for (int i = 0; i < c; i++) n += SizeQuestLogEntry(WireCheck.NotNull(p.Active[i], "QUEST_LIST.active"));
            }
            {
                int c = WireCheck.Count(p.Completed, 0, 1024, "QUEST_LIST.completed");
                n += c * 4;
            }
            {
                int c = WireCheck.Count(p.DailyDoneToday, 0, 1024, "QUEST_LIST.dailyDoneToday");
                n += c * 4;
            }
            return n;
        }

        /// <summary>QUEST_LIST를 o[off..]에 쓰고 끝 오프셋 — SizeQuestList로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteQuestList(QuestListPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.U16(o, off, (ushort)p.Active.Length);
            for (int i = 0; i < p.Active.Length; i++) off = WriteQuestLogEntry(p.Active[i], o, off);
            off = WireWrite.U16(o, off, (ushort)p.Completed.Length);
            for (int i = 0; i < p.Completed.Length; i++) off = WireWrite.I32(o, off, p.Completed[i]);
            off = WireWrite.U16(o, off, (ushort)p.DailyDoneToday.Length);
            for (int i = 0; i < p.DailyDoneToday.Length; i++) off = WireWrite.I32(o, off, p.DailyDoneToday[i]);
            return off;
        }

        /// <summary>QUEST_LIST 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadQuestList(ref WireReader r, QuestListPayload v)
        {
            {
                int n = r.Count(0, 20);
                var a = new QuestLogEntry[r.Capacity(n)];
                for (int i = 0; i < n; i++)
                {
                    var e = new QuestLogEntry();
                    if (!ReadQuestLogEntry(ref r, e)) return false;
                    a[i] = e;
                }
                v.Active = a;
            }
            {
                int n = r.Count(0, 1024);
                if (!r.Need(n * 4)) return false;
                var a = new int[n];
                for (int i = 0; i < n; i++)
                {
                    var e = r.I32();
                    if (r.Error != WireError.None) return false;
                    a[i] = e;
                }
                v.Completed = a;
            }
            {
                int n = r.Count(0, 1024);
                if (!r.Need(n * 4)) return false;
                var a = new int[n];
                for (int i = 0; i < n; i++)
                {
                    var e = r.I32();
                    if (r.Error != WireError.None) return false;
                    a[i] = e;
                }
                v.DailyDoneToday = a;
            }
            return r.Error == WireError.None;
        }

        // ── QUEST_PROGRESS ──

        /// <summary>QUEST_PROGRESS 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeQuestProgress(QuestProgressPayload p)
        {
            return 17;
        }

        /// <summary>QUEST_PROGRESS를 o[off..]에 쓰고 끝 오프셋 — SizeQuestProgress로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteQuestProgress(QuestProgressPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.QuestId);
            off = WireWrite.I32(o, off, p.ObjectiveIndex);
            off = WireWrite.I32(o, off, p.Current);
            off = WireWrite.I32(o, off, p.Required);
            off = WireWrite.Bool(o, off, p.QuestCompletable);
            return off;
        }

        /// <summary>QUEST_PROGRESS 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadQuestProgress(ref WireReader r, QuestProgressPayload v)
        {
            v.QuestId = r.I32();
            v.ObjectiveIndex = r.I32();
            v.Current = r.I32();
            v.Required = r.I32();
            v.QuestCompletable = r.Bool();
            return r.Error == WireError.None;
        }

        // ── QUEST_ACTION_ACK ──

        /// <summary>QUEST_ACTION_ACK 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeQuestActionAck(QuestActionAckPayload p)
        {
            int n = 13;
            if (p.Rewards != null)
            {
                n += SizeQuestGrantSummary(WireCheck.NotNull(p.Rewards, "QUEST_ACTION_ACK.rewards"));
            }
            return n;
        }

        /// <summary>QUEST_ACTION_ACK를 o[off..]에 쓰고 끝 오프셋 — SizeQuestActionAck로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteQuestActionAck(QuestActionAckPayload p, global::System.Span<byte> o, int off)
        {
            uint pm = 0;
            if (p.Rewards != null) pm |= 1u << 0;
            off = WireWrite.U8(o, off, (byte)((pm >> 0) & 0xff));
            off = WireWrite.I32(o, off, p.Op);
            off = WireWrite.I32(o, off, p.QuestId);
            off = WireWrite.I32(o, off, p.ErrCode);
            if (p.Rewards != null) off = WriteQuestGrantSummary(p.Rewards, o, off);
            return off;
        }

        /// <summary>QUEST_ACTION_ACK 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadQuestActionAck(ref WireReader r, QuestActionAckPayload v)
        {
            uint pm = r.Presence(1, 1);
            v.Op = r.I32();
            v.QuestId = r.I32();
            v.ErrCode = r.I32();
            if ((pm & (1u << 0)) != 0)
            {
                var s = new QuestGrantSummary();
                if (!ReadQuestGrantSummary(ref r, s)) return false;
                v.Rewards = s;
            }
            return r.Error == WireError.None;
        }

        // ── QUEST_ABANDON ──

        /// <summary>QUEST_ABANDON 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeQuestAbandon(QuestAbandonPayload p)
        {
            return 4;
        }

        /// <summary>QUEST_ABANDON를 o[off..]에 쓰고 끝 오프셋 — SizeQuestAbandon로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteQuestAbandon(QuestAbandonPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.QuestId);
            return off;
        }

        /// <summary>QUEST_ABANDON 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadQuestAbandon(ref WireReader r, QuestAbandonPayload v)
        {
            v.QuestId = r.I32();
            return r.Error == WireError.None;
        }

        // ── QUEST_NPC_MARKERS ──

        /// <summary>QUEST_NPC_MARKERS 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeQuestNpcMarkers(QuestNpcMarkersPayload p)
        {
            int n = 2;
            {
                int c = WireCheck.Count(p.Npcs, 0, 1024, "QUEST_NPC_MARKERS.npcs");
                for (int i = 0; i < c; i++) n += SizeNpcQuestMarker(WireCheck.NotNull(p.Npcs[i], "QUEST_NPC_MARKERS.npcs"));
            }
            return n;
        }

        /// <summary>QUEST_NPC_MARKERS를 o[off..]에 쓰고 끝 오프셋 — SizeQuestNpcMarkers로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteQuestNpcMarkers(QuestNpcMarkersPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.U16(o, off, (ushort)p.Npcs.Length);
            for (int i = 0; i < p.Npcs.Length; i++) off = WriteNpcQuestMarker(p.Npcs[i], o, off);
            return off;
        }

        /// <summary>QUEST_NPC_MARKERS 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadQuestNpcMarkers(ref WireReader r, QuestNpcMarkersPayload v)
        {
            {
                int n = r.Count(0, 1024);
                if (!r.Need(n * 8)) return false;
                var a = new NpcQuestMarker[n];
                for (int i = 0; i < n; i++)
                {
                    var e = new NpcQuestMarker();
                    if (!ReadNpcQuestMarker(ref r, e)) return false;
                    a[i] = e;
                }
                v.Npcs = a;
            }
            return r.Error == WireError.None;
        }

        // ── SHOP_LIST ──

        /// <summary>SHOP_LIST 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeShopList(ShopListPayload p)
        {
            int n = 10;
            n += WireCheck.Str(p.Name, 240, "SHOP_LIST.name");
            {
                int c = WireCheck.Count(p.Offers, 0, 256, "SHOP_LIST.offers");
                for (int i = 0; i < c; i++) n += SizeShopOffer(WireCheck.NotNull(p.Offers[i], "SHOP_LIST.offers"));
            }
            return n;
        }

        /// <summary>SHOP_LIST를 o[off..]에 쓰고 끝 오프셋 — SizeShopList로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteShopList(ShopListPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.EntityId);
            off = WireWrite.I32(o, off, p.ShopId);
            off = WireWrite.Str(o, off, p.Name);
            off = WireWrite.U16(o, off, (ushort)p.Offers.Length);
            for (int i = 0; i < p.Offers.Length; i++) off = WriteShopOffer(p.Offers[i], o, off);
            return off;
        }

        /// <summary>SHOP_LIST 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadShopList(ref WireReader r, ShopListPayload v)
        {
            v.EntityId = r.I32();
            v.ShopId = r.I32();
            v.Name = r.Str(240);
            {
                int n = r.Count(0, 256);
                if (!r.Need(n * 12)) return false;
                var a = new ShopOffer[n];
                for (int i = 0; i < n; i++)
                {
                    var e = new ShopOffer();
                    if (!ReadShopOffer(ref r, e)) return false;
                    a[i] = e;
                }
                v.Offers = a;
            }
            return r.Error == WireError.None;
        }

        // ── SHOP_BUY ──

        /// <summary>SHOP_BUY 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeShopBuy(ShopBuyPayload p)
        {
            return 20;
        }

        /// <summary>SHOP_BUY를 o[off..]에 쓰고 끝 오프셋 — SizeShopBuy로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteShopBuy(ShopBuyPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.EntityId);
            off = WireWrite.I32(o, off, p.ShopId);
            off = WireWrite.I32(o, off, p.ItemId);
            off = WireWrite.I32(o, off, p.Qty);
            off = WireWrite.I32(o, off, p.RequestId);
            return off;
        }

        /// <summary>SHOP_BUY 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadShopBuy(ref WireReader r, ShopBuyPayload v)
        {
            v.EntityId = r.I32();
            v.ShopId = r.I32();
            v.ItemId = r.I32();
            v.Qty = r.I32();
            v.RequestId = r.I32();
            return r.Error == WireError.None;
        }

        // ── SHOP_SELL ──

        /// <summary>SHOP_SELL 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeShopSell(ShopSellPayload p)
        {
            return 24;
        }

        /// <summary>SHOP_SELL를 o[off..]에 쓰고 끝 오프셋 — SizeShopSell로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteShopSell(ShopSellPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.EntityId);
            off = WireWrite.I32(o, off, p.ShopId);
            off = WireWrite.I32(o, off, p.ItemId);
            off = WireWrite.I32(o, off, p.Slot);
            off = WireWrite.I32(o, off, p.Qty);
            off = WireWrite.I32(o, off, p.RequestId);
            return off;
        }

        /// <summary>SHOP_SELL 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadShopSell(ref WireReader r, ShopSellPayload v)
        {
            v.EntityId = r.I32();
            v.ShopId = r.I32();
            v.ItemId = r.I32();
            v.Slot = r.I32();
            v.Qty = r.I32();
            v.RequestId = r.I32();
            return r.Error == WireError.None;
        }

        // ── SHOP_ACK ──

        /// <summary>SHOP_ACK 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeShopAck(ShopAckPayload p)
        {
            return 16;
        }

        /// <summary>SHOP_ACK를 o[off..]에 쓰고 끝 오프셋 — SizeShopAck로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteShopAck(ShopAckPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.RequestId);
            off = WireWrite.I32(o, off, p.Op);
            off = WireWrite.I32(o, off, p.ErrCode);
            off = WireWrite.I32(o, off, p.Gold);
            return off;
        }

        /// <summary>SHOP_ACK 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadShopAck(ref WireReader r, ShopAckPayload v)
        {
            v.RequestId = r.I32();
            v.Op = r.I32();
            v.ErrCode = r.I32();
            v.Gold = r.I32();
            return r.Error == WireError.None;
        }

        // ── UI_PREFERENCES_SET ──

        /// <summary>UI_PREFERENCES_SET 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeUiPreferencesSet(UiPreferencesSetPayload p)
        {
            int n = 1;
            if (p.QuickSlots != null)
            {
                int c = WireCheck.Count(p.QuickSlots, 6, 6, "UI_PREFERENCES_SET.quickSlots");
                n += 2 + c * 4;
            }
            if (p.TrackedQuestIds != null)
            {
                int c = WireCheck.Count(p.TrackedQuestIds, 0, 5, "UI_PREFERENCES_SET.trackedQuestIds");
                n += 2 + c * 4;
            }
            return n;
        }

        /// <summary>UI_PREFERENCES_SET를 o[off..]에 쓰고 끝 오프셋 — SizeUiPreferencesSet로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteUiPreferencesSet(UiPreferencesSetPayload p, global::System.Span<byte> o, int off)
        {
            uint pm = 0;
            if (p.QuickSlots != null) pm |= 1u << 0;
            if (p.TrackedQuestIds != null) pm |= 1u << 1;
            off = WireWrite.U8(o, off, (byte)((pm >> 0) & 0xff));
            if (p.QuickSlots != null)
            {
                off = WireWrite.U16(o, off, (ushort)p.QuickSlots.Length);
                for (int i = 0; i < p.QuickSlots.Length; i++) off = WireWrite.I32(o, off, p.QuickSlots[i]);
            }
            if (p.TrackedQuestIds != null)
            {
                off = WireWrite.U16(o, off, (ushort)p.TrackedQuestIds.Length);
                for (int i = 0; i < p.TrackedQuestIds.Length; i++) off = WireWrite.I32(o, off, p.TrackedQuestIds[i]);
            }
            return off;
        }

        /// <summary>UI_PREFERENCES_SET 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadUiPreferencesSet(ref WireReader r, UiPreferencesSetPayload v)
        {
            uint pm = r.Presence(1, 2);
            if ((pm & (1u << 0)) != 0)
            {
                int n = r.Count(6, 6);
                if (!r.Need(n * 4)) return false;
                var a = new int[n];
                for (int i = 0; i < n; i++)
                {
                    var e = r.I32();
                    if (r.Error != WireError.None) return false;
                    a[i] = e;
                }
                v.QuickSlots = a;
            }
            if ((pm & (1u << 1)) != 0)
            {
                int n = r.Count(0, 5);
                if (!r.Need(n * 4)) return false;
                var a = new int[n];
                for (int i = 0; i < n; i++)
                {
                    var e = r.I32();
                    if (r.Error != WireError.None) return false;
                    a[i] = e;
                }
                v.TrackedQuestIds = a;
            }
            return r.Error == WireError.None;
        }

        // ── UI_PREFERENCES ──

        /// <summary>UI_PREFERENCES 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeUiPreferences(UiPreferencesPayload p)
        {
            int n = 5;
            {
                int c = WireCheck.Count(p.QuickSlots, 6, 6, "UI_PREFERENCES.quickSlots");
                n += c * 4;
            }
            {
                int c = WireCheck.Count(p.TrackedQuestIds, 0, 5, "UI_PREFERENCES.trackedQuestIds");
                n += c * 4;
            }
            return n;
        }

        /// <summary>UI_PREFERENCES를 o[off..]에 쓰고 끝 오프셋 — SizeUiPreferences로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteUiPreferences(UiPreferencesPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.U16(o, off, (ushort)p.QuickSlots.Length);
            for (int i = 0; i < p.QuickSlots.Length; i++) off = WireWrite.I32(o, off, p.QuickSlots[i]);
            off = WireWrite.U16(o, off, (ushort)p.TrackedQuestIds.Length);
            for (int i = 0; i < p.TrackedQuestIds.Length; i++) off = WireWrite.I32(o, off, p.TrackedQuestIds[i]);
            off = WireWrite.Bool(o, off, p.HasSavedSettings);
            return off;
        }

        /// <summary>UI_PREFERENCES 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadUiPreferences(ref WireReader r, UiPreferencesPayload v)
        {
            {
                int n = r.Count(6, 6);
                if (!r.Need(n * 4)) return false;
                var a = new int[n];
                for (int i = 0; i < n; i++)
                {
                    var e = r.I32();
                    if (r.Error != WireError.None) return false;
                    a[i] = e;
                }
                v.QuickSlots = a;
            }
            {
                int n = r.Count(0, 5);
                if (!r.Need(n * 4)) return false;
                var a = new int[n];
                for (int i = 0; i < n; i++)
                {
                    var e = r.I32();
                    if (r.Error != WireError.None) return false;
                    a[i] = e;
                }
                v.TrackedQuestIds = a;
            }
            v.HasSavedSettings = r.Bool();
            return r.Error == WireError.None;
        }

        // ── GATHER_START ──

        /// <summary>GATHER_START 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeGatherStart(GatherStartPayload p)
        {
            return 4;
        }

        /// <summary>GATHER_START를 o[off..]에 쓰고 끝 오프셋 — SizeGatherStart로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteGatherStart(GatherStartPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.NodeEid);
            return off;
        }

        /// <summary>GATHER_START 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadGatherStart(ref WireReader r, GatherStartPayload v)
        {
            v.NodeEid = r.I32();
            return r.Error == WireError.None;
        }

        // ── LIFE_CANCEL ──

        /// <summary>LIFE_CANCEL 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeLifeCancel(LifeCancelPayload p)
        {
            return 0;
        }

        /// <summary>LIFE_CANCEL를 o[off..]에 쓰고 끝 오프셋 — SizeLifeCancel로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteLifeCancel(LifeCancelPayload p, global::System.Span<byte> o, int off)
        {
            return off;
        }

        /// <summary>LIFE_CANCEL 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadLifeCancel(ref WireReader r, LifeCancelPayload v)
        {
            return r.Error == WireError.None;
        }

        // ── LIFE_CHANNEL ──

        /// <summary>LIFE_CHANNEL 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeLifeChannel(LifeChannelPayload p)
        {
            CheckLifeChannelKind(p.Kind, "LIFE_CHANNEL.kind");
            return 18;
        }

        /// <summary>LIFE_CHANNEL를 o[off..]에 쓰고 끝 오프셋 — SizeLifeChannel로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteLifeChannel(LifeChannelPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.ChannelId);
            off = WireWrite.U8(o, off, (byte)p.Kind);
            off = WireWrite.I32(o, off, p.TargetEid);
            off = WireWrite.I32(o, off, p.DurationMs);
            off = WireWrite.I32(o, off, p.RequestId);
            off = WireWrite.U8(o, off, p.Code);
            return off;
        }

        /// <summary>LIFE_CHANNEL 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadLifeChannel(ref WireReader r, LifeChannelPayload v)
        {
            v.ChannelId = r.I32();
            v.Kind = ReadLifeChannelKind(ref r);
            v.TargetEid = r.I32();
            v.DurationMs = r.I32();
            v.RequestId = r.I32();
            v.Code = r.U8();
            return r.Error == WireError.None;
        }

        // ── LIFE_RESULT ──

        /// <summary>LIFE_RESULT 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeLifeResult(LifeResultPayload p)
        {
            int n = 12;
            {
                int c = WireCheck.Count(p.Items, 0, 8, "LIFE_RESULT.items");
                for (int i = 0; i < c; i++) n += SizeRewardPreviewItem(WireCheck.NotNull(p.Items[i], "LIFE_RESULT.items"));
            }
            CheckLifeLine(p.Line, "LIFE_RESULT.line");
            return n;
        }

        /// <summary>LIFE_RESULT를 o[off..]에 쓰고 끝 오프셋 — SizeLifeResult로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteLifeResult(LifeResultPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.ChannelId);
            off = WireWrite.U8(o, off, p.Code);
            off = WireWrite.U16(o, off, (ushort)p.Items.Length);
            for (int i = 0; i < p.Items.Length; i++) off = WriteRewardPreviewItem(p.Items[i], o, off);
            off = WireWrite.U8(o, off, (byte)p.Line);
            off = WireWrite.I32(o, off, p.ProfGain);
            return off;
        }

        /// <summary>LIFE_RESULT 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadLifeResult(ref WireReader r, LifeResultPayload v)
        {
            v.ChannelId = r.I32();
            v.Code = r.U8();
            {
                int n = r.Count(0, 8);
                if (!r.Need(n * 8)) return false;
                var a = new RewardPreviewItem[n];
                for (int i = 0; i < n; i++)
                {
                    var e = new RewardPreviewItem();
                    if (!ReadRewardPreviewItem(ref r, e)) return false;
                    a[i] = e;
                }
                v.Items = a;
            }
            v.Line = ReadLifeLine(ref r);
            v.ProfGain = r.I32();
            return r.Error == WireError.None;
        }

        // ── LIFE_STATUS ──

        /// <summary>LIFE_STATUS 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeLifeStatus(LifeStatusPayload p)
        {
            int n = 14;
            {
                int c = WireCheck.Count(p.Lines, 0, 7, "LIFE_STATUS.lines");
                for (int i = 0; i < c; i++) n += SizeLifeLineInfo(WireCheck.NotNull(p.Lines[i], "LIFE_STATUS.lines"));
            }
            return n;
        }

        /// <summary>LIFE_STATUS를 o[off..]에 쓰고 끝 오프셋 — SizeLifeStatus로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteLifeStatus(LifeStatusPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.Labor);
            off = WireWrite.I32(o, off, p.LaborMax);
            off = WireWrite.I32(o, off, p.MsToNext);
            off = WireWrite.U16(o, off, (ushort)p.Lines.Length);
            for (int i = 0; i < p.Lines.Length; i++) off = WriteLifeLineInfo(p.Lines[i], o, off);
            return off;
        }

        /// <summary>LIFE_STATUS 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadLifeStatus(ref WireReader r, LifeStatusPayload v)
        {
            v.Labor = r.I32();
            v.LaborMax = r.I32();
            v.MsToNext = r.I32();
            {
                int n = r.Count(0, 7);
                if (!r.Need(n * 10)) return false;
                var a = new LifeLineInfo[n];
                for (int i = 0; i < n; i++)
                {
                    var e = new LifeLineInfo();
                    if (!ReadLifeLineInfo(ref r, e)) return false;
                    a[i] = e;
                }
                v.Lines = a;
            }
            return r.Error == WireError.None;
        }

        // ── NODE_CATALOG ──

        /// <summary>NODE_CATALOG 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeNodeCatalog(NodeCatalogPayload p)
        {
            int n = 2;
            {
                int c = WireCheck.Count(p.Nodes, 0, 64, "NODE_CATALOG.nodes");
                for (int i = 0; i < c; i++) n += SizeNodeDefInfo(WireCheck.NotNull(p.Nodes[i], "NODE_CATALOG.nodes"));
            }
            return n;
        }

        /// <summary>NODE_CATALOG를 o[off..]에 쓰고 끝 오프셋 — SizeNodeCatalog로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteNodeCatalog(NodeCatalogPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.U16(o, off, (ushort)p.Nodes.Length);
            for (int i = 0; i < p.Nodes.Length; i++) off = WriteNodeDefInfo(p.Nodes[i], o, off);
            return off;
        }

        /// <summary>NODE_CATALOG 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadNodeCatalog(ref WireReader r, NodeCatalogPayload v)
        {
            {
                int n = r.Count(0, 64);
                if (!r.Need(n * 11)) return false;
                var a = new NodeDefInfo[n];
                for (int i = 0; i < n; i++)
                {
                    var e = new NodeDefInfo();
                    if (!ReadNodeDefInfo(ref r, e)) return false;
                    a[i] = e;
                }
                v.Nodes = a;
            }
            return r.Error == WireError.None;
        }

        // ── GATHER_PUZZLE ──

        /// <summary>GATHER_PUZZLE 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeGatherPuzzle(GatherPuzzlePayload p)
        {
            int n = 22;
            CheckGatherPuzzleKind(p.Kind, "GATHER_PUZZLE.kind");
            {
                int c = WireCheck.Count(p.Points, 0, 12, "GATHER_PUZZLE.points");
                for (int i = 0; i < c; i++) n += SizePuzzlePoint(WireCheck.NotNull(p.Points[i], "GATHER_PUZZLE.points"));
            }
            return n;
        }

        /// <summary>GATHER_PUZZLE를 o[off..]에 쓰고 끝 오프셋 — SizeGatherPuzzle로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteGatherPuzzle(GatherPuzzlePayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.ChannelId);
            off = WireWrite.U8(o, off, (byte)p.Kind);
            off = WireWrite.U16(o, off, p.BoardW);
            off = WireWrite.U16(o, off, p.BoardH);
            off = WireWrite.U16(o, off, p.ReadyMs);
            off = WireWrite.U16(o, off, p.CycleMs);
            off = WireWrite.U8(o, off, p.MaxCycles);
            off = WireWrite.U16(o, off, p.BandHeight);
            off = WireWrite.U16(o, off, p.PathWidth);
            off = WireWrite.U16(o, off, p.CircleRadius);
            off = WireWrite.U16(o, off, (ushort)p.Points.Length);
            for (int i = 0; i < p.Points.Length; i++) off = WritePuzzlePoint(p.Points[i], o, off);
            return off;
        }

        /// <summary>GATHER_PUZZLE 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadGatherPuzzle(ref WireReader r, GatherPuzzlePayload v)
        {
            v.ChannelId = r.I32();
            v.Kind = ReadGatherPuzzleKind(ref r);
            v.BoardW = r.U16();
            v.BoardH = r.U16();
            v.ReadyMs = r.U16();
            v.CycleMs = r.U16();
            v.MaxCycles = r.U8();
            v.BandHeight = r.U16();
            v.PathWidth = r.U16();
            v.CircleRadius = r.U16();
            {
                int n = r.Count(0, 12);
                if (!r.Need(n * 4)) return false;
                var a = new PuzzlePoint[n];
                for (int i = 0; i < n; i++)
                {
                    var e = new PuzzlePoint();
                    if (!ReadPuzzlePoint(ref r, e)) return false;
                    a[i] = e;
                }
                v.Points = a;
            }
            return r.Error == WireError.None;
        }

        // ── GATHER_TRACE ──

        /// <summary>GATHER_TRACE 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeGatherTrace(GatherTracePayload p)
        {
            int n = 10;
            {
                int c = WireCheck.Count(p.Samples, 0, 160, "GATHER_TRACE.samples");
                for (int i = 0; i < c; i++) n += SizePuzzlePoint(WireCheck.NotNull(p.Samples[i], "GATHER_TRACE.samples"));
            }
            return n;
        }

        /// <summary>GATHER_TRACE를 o[off..]에 쓰고 끝 오프셋 — SizeGatherTrace로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteGatherTrace(GatherTracePayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.ChannelId);
            off = WireWrite.U8(o, off, p.Cycle);
            off = WireWrite.U16(o, off, p.PressMs);
            off = WireWrite.U8(o, off, p.TailMs);
            off = WireWrite.U16(o, off, (ushort)p.Samples.Length);
            for (int i = 0; i < p.Samples.Length; i++) off = WritePuzzlePoint(p.Samples[i], o, off);
            return off;
        }

        /// <summary>GATHER_TRACE 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadGatherTrace(ref WireReader r, GatherTracePayload v)
        {
            v.ChannelId = r.I32();
            v.Cycle = r.U8();
            v.PressMs = r.U16();
            v.TailMs = r.U8();
            {
                int n = r.Count(0, 160);
                if (!r.Need(n * 4)) return false;
                var a = new PuzzlePoint[n];
                for (int i = 0; i < n; i++)
                {
                    var e = new PuzzlePoint();
                    if (!ReadPuzzlePoint(ref r, e)) return false;
                    a[i] = e;
                }
                v.Samples = a;
            }
            return r.Error == WireError.None;
        }

        // ── GATHER_TAPS ──

        /// <summary>GATHER_TAPS 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeGatherTaps(GatherTapsPayload p)
        {
            int n = 6;
            {
                int c = WireCheck.Count(p.Taps, 0, 16, "GATHER_TAPS.taps");
                for (int i = 0; i < c; i++) n += SizePuzzleTap(WireCheck.NotNull(p.Taps[i], "GATHER_TAPS.taps"));
            }
            return n;
        }

        /// <summary>GATHER_TAPS를 o[off..]에 쓰고 끝 오프셋 — SizeGatherTaps로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteGatherTaps(GatherTapsPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.ChannelId);
            off = WireWrite.U16(o, off, (ushort)p.Taps.Length);
            for (int i = 0; i < p.Taps.Length; i++) off = WritePuzzleTap(p.Taps[i], o, off);
            return off;
        }

        /// <summary>GATHER_TAPS 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadGatherTaps(ref WireReader r, GatherTapsPayload v)
        {
            v.ChannelId = r.I32();
            {
                int n = r.Count(0, 16);
                if (!r.Need(n * 7)) return false;
                var a = new PuzzleTap[n];
                for (int i = 0; i < n; i++)
                {
                    var e = new PuzzleTap();
                    if (!ReadPuzzleTap(ref r, e)) return false;
                    a[i] = e;
                }
                v.Taps = a;
            }
            return r.Error == WireError.None;
        }

        // ── RECIPE_LIST ──

        /// <summary>RECIPE_LIST 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeRecipeList(RecipeListPayload p)
        {
            int n = 10;
            n += WireCheck.Str(p.Name, 64, "RECIPE_LIST.name");
            {
                int c = WireCheck.Count(p.Recipes, 0, 128, "RECIPE_LIST.recipes");
                for (int i = 0; i < c; i++) n += SizeRecipeInfo(WireCheck.NotNull(p.Recipes[i], "RECIPE_LIST.recipes"));
            }
            return n;
        }

        /// <summary>RECIPE_LIST를 o[off..]에 쓰고 끝 오프셋 — SizeRecipeList로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteRecipeList(RecipeListPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.NpcEid);
            off = WireWrite.I32(o, off, p.StationId);
            off = WireWrite.Str(o, off, p.Name);
            off = WireWrite.U16(o, off, (ushort)p.Recipes.Length);
            for (int i = 0; i < p.Recipes.Length; i++) off = WriteRecipeInfo(p.Recipes[i], o, off);
            return off;
        }

        /// <summary>RECIPE_LIST 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadRecipeList(ref WireReader r, RecipeListPayload v)
        {
            v.NpcEid = r.I32();
            v.StationId = r.I32();
            v.Name = r.Str(64);
            {
                int n = r.Count(0, 128);
                var a = new RecipeInfo[r.Capacity(n)];
                for (int i = 0; i < n; i++)
                {
                    var e = new RecipeInfo();
                    if (!ReadRecipeInfo(ref r, e)) return false;
                    a[i] = e;
                }
                v.Recipes = a;
            }
            return r.Error == WireError.None;
        }

        // ── CRAFT_REQ ──

        /// <summary>CRAFT_REQ 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeCraftReq(CraftReqPayload p)
        {
            return 16;
        }

        /// <summary>CRAFT_REQ를 o[off..]에 쓰고 끝 오프셋 — SizeCraftReq로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteCraftReq(CraftReqPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.NpcEid);
            off = WireWrite.I32(o, off, p.RecipeId);
            off = WireWrite.I32(o, off, p.Count);
            off = WireWrite.I32(o, off, p.RequestId);
            return off;
        }

        /// <summary>CRAFT_REQ 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadCraftReq(ref WireReader r, CraftReqPayload v)
        {
            v.NpcEid = r.I32();
            v.RecipeId = r.I32();
            v.Count = r.I32();
            v.RequestId = r.I32();
            return r.Error == WireError.None;
        }

        // ── CRAFT_ACK ──

        /// <summary>CRAFT_ACK 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeCraftAck(CraftAckPayload p)
        {
            return 21;
        }

        /// <summary>CRAFT_ACK를 o[off..]에 쓰고 끝 오프셋 — SizeCraftAck로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteCraftAck(CraftAckPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.RequestId);
            off = WireWrite.U8(o, off, p.ErrCode);
            off = WireWrite.I32(o, off, p.Made);
            off = WireWrite.I32(o, off, p.Greats);
            off = WireWrite.I32(o, off, p.Gold);
            off = WireWrite.I32(o, off, p.OutputItemId);
            return off;
        }

        /// <summary>CRAFT_ACK 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadCraftAck(ref WireReader r, CraftAckPayload v)
        {
            v.RequestId = r.I32();
            v.ErrCode = r.U8();
            v.Made = r.I32();
            v.Greats = r.I32();
            v.Gold = r.I32();
            v.OutputItemId = r.I32();
            return r.Error == WireError.None;
        }

        // ── PING ──

        /// <summary>PING 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizePing(PingPayload p)
        {
            WireCheck.F64(p.ClientTimeMs, "PING.clientTimeMs");
            return 8;
        }

        /// <summary>PING를 o[off..]에 쓰고 끝 오프셋 — SizePing로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WritePing(PingPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.F64(o, off, p.ClientTimeMs);
            return off;
        }

        /// <summary>PING 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadPing(ref WireReader r, PingPayload v)
        {
            v.ClientTimeMs = r.F64();
            return r.Error == WireError.None;
        }

        // ── PONG ──

        /// <summary>PONG 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizePong(PongPayload p)
        {
            WireCheck.F64(p.ClientTimeMs, "PONG.clientTimeMs");
            WireCheck.F64(p.ServerTimeMs, "PONG.serverTimeMs");
            return 16;
        }

        /// <summary>PONG를 o[off..]에 쓰고 끝 오프셋 — SizePong로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WritePong(PongPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.F64(o, off, p.ClientTimeMs);
            off = WireWrite.F64(o, off, p.ServerTimeMs);
            return off;
        }

        /// <summary>PONG 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadPong(ref WireReader r, PongPayload v)
        {
            v.ClientTimeMs = r.F64();
            v.ServerTimeMs = r.F64();
            return r.Error == WireError.None;
        }

        // ── KICK ──

        /// <summary>KICK 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeKick(KickPayload p)
        {
            int n = 4;
            n += WireCheck.Str(p.Detail, 600, "KICK.detail");
            return n;
        }

        /// <summary>KICK를 o[off..]에 쓰고 끝 오프셋 — SizeKick로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteKick(KickPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.I32(o, off, p.Reason);
            off = WireWrite.Str(o, off, p.Detail);
            return off;
        }

        /// <summary>KICK 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadKick(ref WireReader r, KickPayload v)
        {
            v.Reason = r.I32();
            v.Detail = r.Str(600);
            return r.Error == WireError.None;
        }

        /// <summary>HELLO 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static HelloPayload DecodeHello(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new HelloPayload();
            bool ok = ReadHello(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>HELLO 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeHello(HelloPayload p)
        {
            var buf = new byte[SizeHello(p)];
            WriteHello(p, buf, 0);
            return buf;
        }

        /// <summary>HELLO_ACK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static HelloAckPayload DecodeHelloAck(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new HelloAckPayload();
            bool ok = ReadHelloAck(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>HELLO_ACK 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeHelloAck(HelloAckPayload p)
        {
            var buf = new byte[SizeHelloAck(p)];
            WriteHelloAck(p, buf, 0);
            return buf;
        }

        /// <summary>AUTH_REQ 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static AuthReqPayload DecodeAuthReq(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new AuthReqPayload();
            bool ok = ReadAuthReq(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>AUTH_REQ 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeAuthReq(AuthReqPayload p)
        {
            var buf = new byte[SizeAuthReq(p)];
            WriteAuthReq(p, buf, 0);
            return buf;
        }

        /// <summary>AUTH_RESULT 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static AuthResultPayload DecodeAuthResult(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new AuthResultPayload();
            bool ok = ReadAuthResult(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>AUTH_RESULT 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeAuthResult(AuthResultPayload p)
        {
            var buf = new byte[SizeAuthResult(p)];
            WriteAuthResult(p, buf, 0);
            return buf;
        }

        /// <summary>CHAR_LIST_REQ 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static CharListReqPayload DecodeCharListReq(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new CharListReqPayload();
            bool ok = ReadCharListReq(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>CHAR_LIST_REQ 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeCharListReq(CharListReqPayload p)
        {
            var buf = new byte[SizeCharListReq(p)];
            WriteCharListReq(p, buf, 0);
            return buf;
        }

        /// <summary>CHAR_LIST 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static CharListPayload DecodeCharList(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new CharListPayload();
            bool ok = ReadCharList(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>CHAR_LIST 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeCharList(CharListPayload p)
        {
            var buf = new byte[SizeCharList(p)];
            WriteCharList(p, buf, 0);
            return buf;
        }

        /// <summary>ENTER_WORLD_REQ 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static EnterWorldReqPayload DecodeEnterWorldReq(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new EnterWorldReqPayload();
            bool ok = ReadEnterWorldReq(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>ENTER_WORLD_REQ 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeEnterWorldReq(EnterWorldReqPayload p)
        {
            var buf = new byte[SizeEnterWorldReq(p)];
            WriteEnterWorldReq(p, buf, 0);
            return buf;
        }

        /// <summary>ENTER_WORLD_OK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static EnterWorldOkPayload DecodeEnterWorldOk(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new EnterWorldOkPayload();
            bool ok = ReadEnterWorldOk(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>ENTER_WORLD_OK 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeEnterWorldOk(EnterWorldOkPayload p)
        {
            var buf = new byte[SizeEnterWorldOk(p)];
            WriteEnterWorldOk(p, buf, 0);
            return buf;
        }

        /// <summary>ZONE_INFO 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static ZoneInfoPayload DecodeZoneInfo(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new ZoneInfoPayload();
            bool ok = ReadZoneInfo(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>ZONE_INFO 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeZoneInfo(ZoneInfoPayload p)
        {
            var buf = new byte[SizeZoneInfo(p)];
            WriteZoneInfo(p, buf, 0);
            return buf;
        }

        /// <summary>CHAR_CREATE_REQ 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static CharCreateReqPayload DecodeCharCreateReq(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new CharCreateReqPayload();
            bool ok = ReadCharCreateReq(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>CHAR_CREATE_REQ 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeCharCreateReq(CharCreateReqPayload p)
        {
            var buf = new byte[SizeCharCreateReq(p)];
            WriteCharCreateReq(p, buf, 0);
            return buf;
        }

        /// <summary>CHAR_CREATE_RESULT 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static CharCreateResultPayload DecodeCharCreateResult(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new CharCreateResultPayload();
            bool ok = ReadCharCreateResult(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>CHAR_CREATE_RESULT 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeCharCreateResult(CharCreateResultPayload p)
        {
            var buf = new byte[SizeCharCreateResult(p)];
            WriteCharCreateResult(p, buf, 0);
            return buf;
        }

        /// <summary>ZONE_CHANGE_REQ 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static ZoneChangeReqPayload DecodeZoneChangeReq(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new ZoneChangeReqPayload();
            bool ok = ReadZoneChangeReq(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>ZONE_CHANGE_REQ 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeZoneChangeReq(ZoneChangeReqPayload p)
        {
            var buf = new byte[SizeZoneChangeReq(p)];
            WriteZoneChangeReq(p, buf, 0);
            return buf;
        }

        /// <summary>ZONE_CHANGE 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static ZoneChangePayload DecodeZoneChange(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new ZoneChangePayload();
            bool ok = ReadZoneChange(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>ZONE_CHANGE 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeZoneChange(ZoneChangePayload p)
        {
            var buf = new byte[SizeZoneChange(p)];
            WriteZoneChange(p, buf, 0);
            return buf;
        }

        /// <summary>PORTAL_LIST 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static PortalListPayload DecodePortalList(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new PortalListPayload();
            bool ok = ReadPortalList(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>PORTAL_LIST 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodePortalList(PortalListPayload p)
        {
            var buf = new byte[SizePortalList(p)];
            WritePortalList(p, buf, 0);
            return buf;
        }

        /// <summary>INPUT_CMD 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static InputCmdPayload DecodeInputCmd(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new InputCmdPayload();
            bool ok = ReadInputCmd(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>INPUT_CMD 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeInputCmd(InputCmdPayload p)
        {
            var buf = new byte[SizeInputCmd(p)];
            WriteInputCmd(p, buf, 0);
            return buf;
        }

        /// <summary>SNAPSHOT_DELTA 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static SnapshotDeltaPayload DecodeSnapshotDelta(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new SnapshotDeltaPayload();
            bool ok = ReadSnapshotDelta(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>SNAPSHOT_DELTA 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeSnapshotDelta(SnapshotDeltaPayload p)
        {
            var buf = new byte[SizeSnapshotDelta(p)];
            WriteSnapshotDelta(p, buf, 0);
            return buf;
        }

        /// <summary>ENTITY_SPAWN 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static EntitySpawnPayload DecodeEntitySpawn(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new EntitySpawnPayload();
            bool ok = ReadEntitySpawn(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>ENTITY_SPAWN 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeEntitySpawn(EntitySpawnPayload p)
        {
            var buf = new byte[SizeEntitySpawn(p)];
            WriteEntitySpawn(p, buf, 0);
            return buf;
        }

        /// <summary>ENTITY_DESPAWN 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static EntityDespawnPayload DecodeEntityDespawn(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new EntityDespawnPayload();
            bool ok = ReadEntityDespawn(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>ENTITY_DESPAWN 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeEntityDespawn(EntityDespawnPayload p)
        {
            var buf = new byte[SizeEntityDespawn(p)];
            WriteEntityDespawn(p, buf, 0);
            return buf;
        }

        /// <summary>MOVE_TO 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static MoveToPayload DecodeMoveTo(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new MoveToPayload();
            bool ok = ReadMoveTo(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>MOVE_TO 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeMoveTo(MoveToPayload p)
        {
            var buf = new byte[SizeMoveTo(p)];
            WriteMoveTo(p, buf, 0);
            return buf;
        }

        /// <summary>ENTITY_META 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static EntityMetaPayload DecodeEntityMeta(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new EntityMetaPayload();
            bool ok = ReadEntityMeta(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>ENTITY_META 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeEntityMeta(EntityMetaPayload p)
        {
            var buf = new byte[SizeEntityMeta(p)];
            WriteEntityMeta(p, buf, 0);
            return buf;
        }

        /// <summary>MOVE_PATH 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static MovePathPayload DecodeMovePath(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new MovePathPayload();
            bool ok = ReadMovePath(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>MOVE_PATH 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeMovePath(MovePathPayload p)
        {
            var buf = new byte[SizeMovePath(p)];
            WriteMovePath(p, buf, 0);
            return buf;
        }

        /// <summary>MOVE_STOP 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static MoveStopPayload DecodeMoveStop(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new MoveStopPayload();
            bool ok = ReadMoveStop(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>MOVE_STOP 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeMoveStop(MoveStopPayload p)
        {
            var buf = new byte[SizeMoveStop(p)];
            WriteMoveStop(p, buf, 0);
            return buf;
        }

        /// <summary>CHAT_SAY 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static ChatSayPayload DecodeChatSay(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new ChatSayPayload();
            bool ok = ReadChatSay(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>CHAT_SAY 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeChatSay(ChatSayPayload p)
        {
            var buf = new byte[SizeChatSay(p)];
            WriteChatSay(p, buf, 0);
            return buf;
        }

        /// <summary>CHAT_BCAST 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static ChatBcastPayload DecodeChatBcast(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new ChatBcastPayload();
            bool ok = ReadChatBcast(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>CHAT_BCAST 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeChatBcast(ChatBcastPayload p)
        {
            var buf = new byte[SizeChatBcast(p)];
            WriteChatBcast(p, buf, 0);
            return buf;
        }

        /// <summary>CREATE_CHARACTER_V2 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static CreateCharacterV2Payload DecodeCreateCharacterV2(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new CreateCharacterV2Payload();
            bool ok = ReadCreateCharacterV2(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>CREATE_CHARACTER_V2 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeCreateCharacterV2(CreateCharacterV2Payload p)
        {
            var buf = new byte[SizeCreateCharacterV2(p)];
            WriteCreateCharacterV2(p, buf, 0);
            return buf;
        }

        /// <summary>CHAR_STATS_FULL 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static CharStatsFullPayload DecodeCharStatsFull(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new CharStatsFullPayload();
            bool ok = ReadCharStatsFull(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>CHAR_STATS_FULL 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeCharStatsFull(CharStatsFullPayload p)
        {
            var buf = new byte[SizeCharStatsFull(p)];
            WriteCharStatsFull(p, buf, 0);
            return buf;
        }

        /// <summary>CHAR_LEVEL_UP 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static CharLevelUpPayload DecodeCharLevelUp(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new CharLevelUpPayload();
            bool ok = ReadCharLevelUp(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>CHAR_LEVEL_UP 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeCharLevelUp(CharLevelUpPayload p)
        {
            var buf = new byte[SizeCharLevelUp(p)];
            WriteCharLevelUp(p, buf, 0);
            return buf;
        }

        /// <summary>CHAR_EXP_GAIN 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static CharExpGainPayload DecodeCharExpGain(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new CharExpGainPayload();
            bool ok = ReadCharExpGain(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>CHAR_EXP_GAIN 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeCharExpGain(CharExpGainPayload p)
        {
            var buf = new byte[SizeCharExpGain(p)];
            WriteCharExpGain(p, buf, 0);
            return buf;
        }

        /// <summary>GOLD_UPDATE 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static GoldUpdatePayload DecodeGoldUpdate(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new GoldUpdatePayload();
            bool ok = ReadGoldUpdate(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>GOLD_UPDATE 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeGoldUpdate(GoldUpdatePayload p)
        {
            var buf = new byte[SizeGoldUpdate(p)];
            WriteGoldUpdate(p, buf, 0);
            return buf;
        }

        /// <summary>STAT_ALLOCATE 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static StatAllocatePayload DecodeStatAllocate(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new StatAllocatePayload();
            bool ok = ReadStatAllocate(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>STAT_ALLOCATE 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeStatAllocate(StatAllocatePayload p)
        {
            var buf = new byte[SizeStatAllocate(p)];
            WriteStatAllocate(p, buf, 0);
            return buf;
        }

        /// <summary>STAT_RESET 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static StatResetPayload DecodeStatReset(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new StatResetPayload();
            bool ok = ReadStatReset(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>STAT_RESET 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeStatReset(StatResetPayload p)
        {
            var buf = new byte[SizeStatReset(p)];
            WriteStatReset(p, buf, 0);
            return buf;
        }

        /// <summary>STAT_POINTS_ACK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static StatPointsAckPayload DecodeStatPointsAck(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new StatPointsAckPayload();
            bool ok = ReadStatPointsAck(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>STAT_POINTS_ACK 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeStatPointsAck(StatPointsAckPayload p)
        {
            var buf = new byte[SizeStatPointsAck(p)];
            WriteStatPointsAck(p, buf, 0);
            return buf;
        }

        /// <summary>TARGET_SELECT 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static TargetSelectPayload DecodeTargetSelect(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new TargetSelectPayload();
            bool ok = ReadTargetSelect(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>TARGET_SELECT 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeTargetSelect(TargetSelectPayload p)
        {
            var buf = new byte[SizeTargetSelect(p)];
            WriteTargetSelect(p, buf, 0);
            return buf;
        }

        /// <summary>TARGET_ACK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static TargetAckPayload DecodeTargetAck(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new TargetAckPayload();
            bool ok = ReadTargetAck(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>TARGET_ACK 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeTargetAck(TargetAckPayload p)
        {
            var buf = new byte[SizeTargetAck(p)];
            WriteTargetAck(p, buf, 0);
            return buf;
        }

        /// <summary>ATTACK_START 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static AttackStartPayload DecodeAttackStart(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new AttackStartPayload();
            bool ok = ReadAttackStart(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>ATTACK_START 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeAttackStart(AttackStartPayload p)
        {
            var buf = new byte[SizeAttackStart(p)];
            WriteAttackStart(p, buf, 0);
            return buf;
        }

        /// <summary>ATTACK_STOP 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static AttackStopPayload DecodeAttackStop(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new AttackStopPayload();
            bool ok = ReadAttackStop(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>ATTACK_STOP 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeAttackStop(AttackStopPayload p)
        {
            var buf = new byte[SizeAttackStop(p)];
            WriteAttackStop(p, buf, 0);
            return buf;
        }

        /// <summary>DAMAGE_EVENT 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static DamageEventPayload DecodeDamageEvent(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new DamageEventPayload();
            bool ok = ReadDamageEvent(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>DAMAGE_EVENT 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeDamageEvent(DamageEventPayload p)
        {
            var buf = new byte[SizeDamageEvent(p)];
            WriteDamageEvent(p, buf, 0);
            return buf;
        }

        /// <summary>DEATH_NOTIFY 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static DeathNotifyPayload DecodeDeathNotify(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new DeathNotifyPayload();
            bool ok = ReadDeathNotify(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>DEATH_NOTIFY 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeDeathNotify(DeathNotifyPayload p)
        {
            var buf = new byte[SizeDeathNotify(p)];
            WriteDeathNotify(p, buf, 0);
            return buf;
        }

        /// <summary>RESPAWN_REQ 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static RespawnReqPayload DecodeRespawnReq(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new RespawnReqPayload();
            bool ok = ReadRespawnReq(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>RESPAWN_REQ 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeRespawnReq(RespawnReqPayload p)
        {
            var buf = new byte[SizeRespawnReq(p)];
            WriteRespawnReq(p, buf, 0);
            return buf;
        }

        /// <summary>RESPAWN_OK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static RespawnOkPayload DecodeRespawnOk(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new RespawnOkPayload();
            bool ok = ReadRespawnOk(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>RESPAWN_OK 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeRespawnOk(RespawnOkPayload p)
        {
            var buf = new byte[SizeRespawnOk(p)];
            WriteRespawnOk(p, buf, 0);
            return buf;
        }

        /// <summary>SKILL_CAST 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static SkillCastPayload DecodeSkillCast(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new SkillCastPayload();
            bool ok = ReadSkillCast(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>SKILL_CAST 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeSkillCast(SkillCastPayload p)
        {
            var buf = new byte[SizeSkillCast(p)];
            WriteSkillCast(p, buf, 0);
            return buf;
        }

        /// <summary>SKILL_LIST 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static SkillListPayload DecodeSkillList(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new SkillListPayload();
            bool ok = ReadSkillList(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>SKILL_LIST 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeSkillList(SkillListPayload p)
        {
            var buf = new byte[SizeSkillList(p)];
            WriteSkillList(p, buf, 0);
            return buf;
        }

        /// <summary>SKILL_EFFECT 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static SkillEffectPayload DecodeSkillEffect(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new SkillEffectPayload();
            bool ok = ReadSkillEffect(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>SKILL_EFFECT 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeSkillEffect(SkillEffectPayload p)
        {
            var buf = new byte[SizeSkillEffect(p)];
            WriteSkillEffect(p, buf, 0);
            return buf;
        }

        /// <summary>SKILL_CAST_ACK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static SkillCastAckPayload DecodeSkillCastAck(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new SkillCastAckPayload();
            bool ok = ReadSkillCastAck(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>SKILL_CAST_ACK 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeSkillCastAck(SkillCastAckPayload p)
        {
            var buf = new byte[SizeSkillCastAck(p)];
            WriteSkillCastAck(p, buf, 0);
            return buf;
        }

        /// <summary>MANA_UPDATE 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static ManaUpdatePayload DecodeManaUpdate(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new ManaUpdatePayload();
            bool ok = ReadManaUpdate(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>MANA_UPDATE 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeManaUpdate(ManaUpdatePayload p)
        {
            var buf = new byte[SizeManaUpdate(p)];
            WriteManaUpdate(p, buf, 0);
            return buf;
        }

        /// <summary>SKILL_LEARN 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static SkillLearnPayload DecodeSkillLearn(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new SkillLearnPayload();
            bool ok = ReadSkillLearn(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>SKILL_LEARN 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeSkillLearn(SkillLearnPayload p)
        {
            var buf = new byte[SizeSkillLearn(p)];
            WriteSkillLearn(p, buf, 0);
            return buf;
        }

        /// <summary>SKILL_LEVEL_UP 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static SkillLevelUpPayload DecodeSkillLevelUp(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new SkillLevelUpPayload();
            bool ok = ReadSkillLevelUp(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>SKILL_LEVEL_UP 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeSkillLevelUp(SkillLevelUpPayload p)
        {
            var buf = new byte[SizeSkillLevelUp(p)];
            WriteSkillLevelUp(p, buf, 0);
            return buf;
        }

        /// <summary>SKILL_LEARN_ACK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static SkillLearnAckPayload DecodeSkillLearnAck(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new SkillLearnAckPayload();
            bool ok = ReadSkillLearnAck(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>SKILL_LEARN_ACK 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeSkillLearnAck(SkillLearnAckPayload p)
        {
            var buf = new byte[SizeSkillLearnAck(p)];
            WriteSkillLearnAck(p, buf, 0);
            return buf;
        }

        /// <summary>SKILL_LV_UP 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static SkillLvUpPayload DecodeSkillLvUp(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new SkillLvUpPayload();
            bool ok = ReadSkillLvUp(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>SKILL_LV_UP 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeSkillLvUp(SkillLvUpPayload p)
        {
            var buf = new byte[SizeSkillLvUp(p)];
            WriteSkillLvUp(p, buf, 0);
            return buf;
        }

        /// <summary>ITEM_USE 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static ItemUsePayload DecodeItemUse(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new ItemUsePayload();
            bool ok = ReadItemUse(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>ITEM_USE 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeItemUse(ItemUsePayload p)
        {
            var buf = new byte[SizeItemUse(p)];
            WriteItemUse(p, buf, 0);
            return buf;
        }

        /// <summary>ITEM_EQUIP 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static ItemEquipPayload DecodeItemEquip(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new ItemEquipPayload();
            bool ok = ReadItemEquip(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>ITEM_EQUIP 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeItemEquip(ItemEquipPayload p)
        {
            var buf = new byte[SizeItemEquip(p)];
            WriteItemEquip(p, buf, 0);
            return buf;
        }

        /// <summary>ITEM_UNEQUIP 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static ItemUnequipPayload DecodeItemUnequip(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new ItemUnequipPayload();
            bool ok = ReadItemUnequip(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>ITEM_UNEQUIP 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeItemUnequip(ItemUnequipPayload p)
        {
            var buf = new byte[SizeItemUnequip(p)];
            WriteItemUnequip(p, buf, 0);
            return buf;
        }

        /// <summary>ITEM_PICKUP 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static ItemPickupPayload DecodeItemPickup(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new ItemPickupPayload();
            bool ok = ReadItemPickup(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>ITEM_PICKUP 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeItemPickup(ItemPickupPayload p)
        {
            var buf = new byte[SizeItemPickup(p)];
            WriteItemPickup(p, buf, 0);
            return buf;
        }

        /// <summary>INVENTORY_LIST 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static InventoryListPayload DecodeInventoryList(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new InventoryListPayload();
            bool ok = ReadInventoryList(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>INVENTORY_LIST 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeInventoryList(InventoryListPayload p)
        {
            var buf = new byte[SizeInventoryList(p)];
            WriteInventoryList(p, buf, 0);
            return buf;
        }

        /// <summary>INVENTORY_UPDATE 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static InventoryUpdatePayload DecodeInventoryUpdate(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new InventoryUpdatePayload();
            bool ok = ReadInventoryList(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>INVENTORY_UPDATE 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeInventoryUpdate(InventoryUpdatePayload p)
        {
            var buf = new byte[SizeInventoryList(p)];
            WriteInventoryList(p, buf, 0);
            return buf;
        }

        /// <summary>ITEM_USE_ACK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static ItemUseAckPayload DecodeItemUseAck(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new ItemUseAckPayload();
            bool ok = ReadItemUseAck(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>ITEM_USE_ACK 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeItemUseAck(ItemUseAckPayload p)
        {
            var buf = new byte[SizeItemUseAck(p)];
            WriteItemUseAck(p, buf, 0);
            return buf;
        }

        /// <summary>ITEM_PICKUP_ACK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static ItemPickupAckPayload DecodeItemPickupAck(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new ItemPickupAckPayload();
            bool ok = ReadItemPickupAck(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>ITEM_PICKUP_ACK 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeItemPickupAck(ItemPickupAckPayload p)
        {
            var buf = new byte[SizeItemPickupAck(p)];
            WriteItemPickupAck(p, buf, 0);
            return buf;
        }

        /// <summary>NPC_INTERACT 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static NpcInteractPayload DecodeNpcInteract(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new NpcInteractPayload();
            bool ok = ReadNpcInteract(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>NPC_INTERACT 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeNpcInteract(NpcInteractPayload p)
        {
            var buf = new byte[SizeNpcInteract(p)];
            WriteNpcInteract(p, buf, 0);
            return buf;
        }

        /// <summary>NPC_DIALOG 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static NpcDialogPayload DecodeNpcDialog(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new NpcDialogPayload();
            bool ok = ReadNpcDialog(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>NPC_DIALOG 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeNpcDialog(NpcDialogPayload p)
        {
            var buf = new byte[SizeNpcDialog(p)];
            WriteNpcDialog(p, buf, 0);
            return buf;
        }

        /// <summary>NPC_ACTION 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static NpcActionPayload DecodeNpcAction(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new NpcActionPayload();
            bool ok = ReadNpcAction(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>NPC_ACTION 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeNpcAction(NpcActionPayload p)
        {
            var buf = new byte[SizeNpcAction(p)];
            WriteNpcAction(p, buf, 0);
            return buf;
        }

        /// <summary>QUEST_LIST 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static QuestListPayload DecodeQuestList(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new QuestListPayload();
            bool ok = ReadQuestList(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>QUEST_LIST 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeQuestList(QuestListPayload p)
        {
            var buf = new byte[SizeQuestList(p)];
            WriteQuestList(p, buf, 0);
            return buf;
        }

        /// <summary>QUEST_PROGRESS 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static QuestProgressPayload DecodeQuestProgress(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new QuestProgressPayload();
            bool ok = ReadQuestProgress(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>QUEST_PROGRESS 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeQuestProgress(QuestProgressPayload p)
        {
            var buf = new byte[SizeQuestProgress(p)];
            WriteQuestProgress(p, buf, 0);
            return buf;
        }

        /// <summary>QUEST_ACTION_ACK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static QuestActionAckPayload DecodeQuestActionAck(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new QuestActionAckPayload();
            bool ok = ReadQuestActionAck(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>QUEST_ACTION_ACK 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeQuestActionAck(QuestActionAckPayload p)
        {
            var buf = new byte[SizeQuestActionAck(p)];
            WriteQuestActionAck(p, buf, 0);
            return buf;
        }

        /// <summary>QUEST_ABANDON 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static QuestAbandonPayload DecodeQuestAbandon(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new QuestAbandonPayload();
            bool ok = ReadQuestAbandon(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>QUEST_ABANDON 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeQuestAbandon(QuestAbandonPayload p)
        {
            var buf = new byte[SizeQuestAbandon(p)];
            WriteQuestAbandon(p, buf, 0);
            return buf;
        }

        /// <summary>QUEST_NPC_MARKERS 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static QuestNpcMarkersPayload DecodeQuestNpcMarkers(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new QuestNpcMarkersPayload();
            bool ok = ReadQuestNpcMarkers(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>QUEST_NPC_MARKERS 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeQuestNpcMarkers(QuestNpcMarkersPayload p)
        {
            var buf = new byte[SizeQuestNpcMarkers(p)];
            WriteQuestNpcMarkers(p, buf, 0);
            return buf;
        }

        /// <summary>SHOP_LIST 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static ShopListPayload DecodeShopList(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new ShopListPayload();
            bool ok = ReadShopList(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>SHOP_LIST 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeShopList(ShopListPayload p)
        {
            var buf = new byte[SizeShopList(p)];
            WriteShopList(p, buf, 0);
            return buf;
        }

        /// <summary>SHOP_BUY 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static ShopBuyPayload DecodeShopBuy(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new ShopBuyPayload();
            bool ok = ReadShopBuy(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>SHOP_BUY 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeShopBuy(ShopBuyPayload p)
        {
            var buf = new byte[SizeShopBuy(p)];
            WriteShopBuy(p, buf, 0);
            return buf;
        }

        /// <summary>SHOP_SELL 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static ShopSellPayload DecodeShopSell(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new ShopSellPayload();
            bool ok = ReadShopSell(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>SHOP_SELL 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeShopSell(ShopSellPayload p)
        {
            var buf = new byte[SizeShopSell(p)];
            WriteShopSell(p, buf, 0);
            return buf;
        }

        /// <summary>SHOP_ACK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static ShopAckPayload DecodeShopAck(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new ShopAckPayload();
            bool ok = ReadShopAck(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>SHOP_ACK 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeShopAck(ShopAckPayload p)
        {
            var buf = new byte[SizeShopAck(p)];
            WriteShopAck(p, buf, 0);
            return buf;
        }

        /// <summary>UI_PREFERENCES_SET 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static UiPreferencesSetPayload DecodeUiPreferencesSet(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new UiPreferencesSetPayload();
            bool ok = ReadUiPreferencesSet(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>UI_PREFERENCES_SET 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeUiPreferencesSet(UiPreferencesSetPayload p)
        {
            var buf = new byte[SizeUiPreferencesSet(p)];
            WriteUiPreferencesSet(p, buf, 0);
            return buf;
        }

        /// <summary>UI_PREFERENCES 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static UiPreferencesPayload DecodeUiPreferences(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new UiPreferencesPayload();
            bool ok = ReadUiPreferences(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>UI_PREFERENCES 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeUiPreferences(UiPreferencesPayload p)
        {
            var buf = new byte[SizeUiPreferences(p)];
            WriteUiPreferences(p, buf, 0);
            return buf;
        }

        /// <summary>GATHER_START 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static GatherStartPayload DecodeGatherStart(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new GatherStartPayload();
            bool ok = ReadGatherStart(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>GATHER_START 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeGatherStart(GatherStartPayload p)
        {
            var buf = new byte[SizeGatherStart(p)];
            WriteGatherStart(p, buf, 0);
            return buf;
        }

        /// <summary>LIFE_CANCEL 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static LifeCancelPayload DecodeLifeCancel(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new LifeCancelPayload();
            bool ok = ReadLifeCancel(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>LIFE_CANCEL 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeLifeCancel(LifeCancelPayload p)
        {
            var buf = new byte[SizeLifeCancel(p)];
            WriteLifeCancel(p, buf, 0);
            return buf;
        }

        /// <summary>LIFE_CHANNEL 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static LifeChannelPayload DecodeLifeChannel(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new LifeChannelPayload();
            bool ok = ReadLifeChannel(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>LIFE_CHANNEL 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeLifeChannel(LifeChannelPayload p)
        {
            var buf = new byte[SizeLifeChannel(p)];
            WriteLifeChannel(p, buf, 0);
            return buf;
        }

        /// <summary>LIFE_RESULT 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static LifeResultPayload DecodeLifeResult(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new LifeResultPayload();
            bool ok = ReadLifeResult(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>LIFE_RESULT 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeLifeResult(LifeResultPayload p)
        {
            var buf = new byte[SizeLifeResult(p)];
            WriteLifeResult(p, buf, 0);
            return buf;
        }

        /// <summary>LIFE_STATUS 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static LifeStatusPayload DecodeLifeStatus(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new LifeStatusPayload();
            bool ok = ReadLifeStatus(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>LIFE_STATUS 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeLifeStatus(LifeStatusPayload p)
        {
            var buf = new byte[SizeLifeStatus(p)];
            WriteLifeStatus(p, buf, 0);
            return buf;
        }

        /// <summary>NODE_CATALOG 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static NodeCatalogPayload DecodeNodeCatalog(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new NodeCatalogPayload();
            bool ok = ReadNodeCatalog(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>NODE_CATALOG 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeNodeCatalog(NodeCatalogPayload p)
        {
            var buf = new byte[SizeNodeCatalog(p)];
            WriteNodeCatalog(p, buf, 0);
            return buf;
        }

        /// <summary>GATHER_PUZZLE 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static GatherPuzzlePayload DecodeGatherPuzzle(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new GatherPuzzlePayload();
            bool ok = ReadGatherPuzzle(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>GATHER_PUZZLE 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeGatherPuzzle(GatherPuzzlePayload p)
        {
            var buf = new byte[SizeGatherPuzzle(p)];
            WriteGatherPuzzle(p, buf, 0);
            return buf;
        }

        /// <summary>GATHER_TRACE 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static GatherTracePayload DecodeGatherTrace(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new GatherTracePayload();
            bool ok = ReadGatherTrace(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>GATHER_TRACE 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeGatherTrace(GatherTracePayload p)
        {
            var buf = new byte[SizeGatherTrace(p)];
            WriteGatherTrace(p, buf, 0);
            return buf;
        }

        /// <summary>GATHER_TAPS 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static GatherTapsPayload DecodeGatherTaps(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new GatherTapsPayload();
            bool ok = ReadGatherTaps(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>GATHER_TAPS 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeGatherTaps(GatherTapsPayload p)
        {
            var buf = new byte[SizeGatherTaps(p)];
            WriteGatherTaps(p, buf, 0);
            return buf;
        }

        /// <summary>RECIPE_LIST 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static RecipeListPayload DecodeRecipeList(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new RecipeListPayload();
            bool ok = ReadRecipeList(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>RECIPE_LIST 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeRecipeList(RecipeListPayload p)
        {
            var buf = new byte[SizeRecipeList(p)];
            WriteRecipeList(p, buf, 0);
            return buf;
        }

        /// <summary>CRAFT_REQ 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static CraftReqPayload DecodeCraftReq(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new CraftReqPayload();
            bool ok = ReadCraftReq(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>CRAFT_REQ 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeCraftReq(CraftReqPayload p)
        {
            var buf = new byte[SizeCraftReq(p)];
            WriteCraftReq(p, buf, 0);
            return buf;
        }

        /// <summary>CRAFT_ACK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static CraftAckPayload DecodeCraftAck(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new CraftAckPayload();
            bool ok = ReadCraftAck(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>CRAFT_ACK 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeCraftAck(CraftAckPayload p)
        {
            var buf = new byte[SizeCraftAck(p)];
            WriteCraftAck(p, buf, 0);
            return buf;
        }

        /// <summary>PING 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static PingPayload DecodePing(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new PingPayload();
            bool ok = ReadPing(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>PING 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodePing(PingPayload p)
        {
            var buf = new byte[SizePing(p)];
            WritePing(p, buf, 0);
            return buf;
        }

        /// <summary>PONG 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static PongPayload DecodePong(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new PongPayload();
            bool ok = ReadPong(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>PONG 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodePong(PongPayload p)
        {
            var buf = new byte[SizePong(p)];
            WritePong(p, buf, 0);
            return buf;
        }

        /// <summary>KICK 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static KickPayload DecodeKick(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new KickPayload();
            bool ok = ReadKick(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>KICK 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeKick(KickPayload p)
        {
            var buf = new byte[SizeKick(p)];
            WriteKick(p, buf, 0);
            return buf;
        }

        /// <summary>본문 디코드 — 실패 = null + 사유. 스키마 밖 id도 null이지만 사유는 None(위반 사유가 아니다 — 수신자가 구분한다).</summary>
        public static object Decode(ushort id, global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            switch (id)
            {
                case PacketIds.HELLO:
                    return DecodeHello(body, out error);
                case PacketIds.HELLO_ACK:
                    return DecodeHelloAck(body, out error);
                case PacketIds.AUTH_REQ:
                    return DecodeAuthReq(body, out error);
                case PacketIds.AUTH_RESULT:
                    return DecodeAuthResult(body, out error);
                case PacketIds.CHAR_LIST_REQ:
                    return DecodeCharListReq(body, out error);
                case PacketIds.CHAR_LIST:
                    return DecodeCharList(body, out error);
                case PacketIds.ENTER_WORLD_REQ:
                    return DecodeEnterWorldReq(body, out error);
                case PacketIds.ENTER_WORLD_OK:
                    return DecodeEnterWorldOk(body, out error);
                case PacketIds.ZONE_INFO:
                    return DecodeZoneInfo(body, out error);
                case PacketIds.CHAR_CREATE_REQ:
                    return DecodeCharCreateReq(body, out error);
                case PacketIds.CHAR_CREATE_RESULT:
                    return DecodeCharCreateResult(body, out error);
                case PacketIds.ZONE_CHANGE_REQ:
                    return DecodeZoneChangeReq(body, out error);
                case PacketIds.ZONE_CHANGE:
                    return DecodeZoneChange(body, out error);
                case PacketIds.PORTAL_LIST:
                    return DecodePortalList(body, out error);
                case PacketIds.INPUT_CMD:
                    return DecodeInputCmd(body, out error);
                case PacketIds.SNAPSHOT_DELTA:
                    return DecodeSnapshotDelta(body, out error);
                case PacketIds.ENTITY_SPAWN:
                    return DecodeEntitySpawn(body, out error);
                case PacketIds.ENTITY_DESPAWN:
                    return DecodeEntityDespawn(body, out error);
                case PacketIds.MOVE_TO:
                    return DecodeMoveTo(body, out error);
                case PacketIds.ENTITY_META:
                    return DecodeEntityMeta(body, out error);
                case PacketIds.MOVE_PATH:
                    return DecodeMovePath(body, out error);
                case PacketIds.MOVE_STOP:
                    return DecodeMoveStop(body, out error);
                case PacketIds.CHAT_SAY:
                    return DecodeChatSay(body, out error);
                case PacketIds.CHAT_BCAST:
                    return DecodeChatBcast(body, out error);
                case PacketIds.CREATE_CHARACTER_V2:
                    return DecodeCreateCharacterV2(body, out error);
                case PacketIds.CHAR_STATS_FULL:
                    return DecodeCharStatsFull(body, out error);
                case PacketIds.CHAR_LEVEL_UP:
                    return DecodeCharLevelUp(body, out error);
                case PacketIds.CHAR_EXP_GAIN:
                    return DecodeCharExpGain(body, out error);
                case PacketIds.GOLD_UPDATE:
                    return DecodeGoldUpdate(body, out error);
                case PacketIds.STAT_ALLOCATE:
                    return DecodeStatAllocate(body, out error);
                case PacketIds.STAT_RESET:
                    return DecodeStatReset(body, out error);
                case PacketIds.STAT_POINTS_ACK:
                    return DecodeStatPointsAck(body, out error);
                case PacketIds.TARGET_SELECT:
                    return DecodeTargetSelect(body, out error);
                case PacketIds.TARGET_ACK:
                    return DecodeTargetAck(body, out error);
                case PacketIds.ATTACK_START:
                    return DecodeAttackStart(body, out error);
                case PacketIds.ATTACK_STOP:
                    return DecodeAttackStop(body, out error);
                case PacketIds.DAMAGE_EVENT:
                    return DecodeDamageEvent(body, out error);
                case PacketIds.DEATH_NOTIFY:
                    return DecodeDeathNotify(body, out error);
                case PacketIds.RESPAWN_REQ:
                    return DecodeRespawnReq(body, out error);
                case PacketIds.RESPAWN_OK:
                    return DecodeRespawnOk(body, out error);
                case PacketIds.SKILL_CAST:
                    return DecodeSkillCast(body, out error);
                case PacketIds.SKILL_LIST:
                    return DecodeSkillList(body, out error);
                case PacketIds.SKILL_EFFECT:
                    return DecodeSkillEffect(body, out error);
                case PacketIds.SKILL_CAST_ACK:
                    return DecodeSkillCastAck(body, out error);
                case PacketIds.MANA_UPDATE:
                    return DecodeManaUpdate(body, out error);
                case PacketIds.SKILL_LEARN:
                    return DecodeSkillLearn(body, out error);
                case PacketIds.SKILL_LEVEL_UP:
                    return DecodeSkillLevelUp(body, out error);
                case PacketIds.SKILL_LEARN_ACK:
                    return DecodeSkillLearnAck(body, out error);
                case PacketIds.SKILL_LV_UP:
                    return DecodeSkillLvUp(body, out error);
                case PacketIds.ITEM_USE:
                    return DecodeItemUse(body, out error);
                case PacketIds.ITEM_EQUIP:
                    return DecodeItemEquip(body, out error);
                case PacketIds.ITEM_UNEQUIP:
                    return DecodeItemUnequip(body, out error);
                case PacketIds.ITEM_PICKUP:
                    return DecodeItemPickup(body, out error);
                case PacketIds.INVENTORY_LIST:
                    return DecodeInventoryList(body, out error);
                case PacketIds.INVENTORY_UPDATE:
                    return DecodeInventoryUpdate(body, out error);
                case PacketIds.ITEM_USE_ACK:
                    return DecodeItemUseAck(body, out error);
                case PacketIds.ITEM_PICKUP_ACK:
                    return DecodeItemPickupAck(body, out error);
                case PacketIds.NPC_INTERACT:
                    return DecodeNpcInteract(body, out error);
                case PacketIds.NPC_DIALOG:
                    return DecodeNpcDialog(body, out error);
                case PacketIds.NPC_ACTION:
                    return DecodeNpcAction(body, out error);
                case PacketIds.QUEST_LIST:
                    return DecodeQuestList(body, out error);
                case PacketIds.QUEST_PROGRESS:
                    return DecodeQuestProgress(body, out error);
                case PacketIds.QUEST_ACTION_ACK:
                    return DecodeQuestActionAck(body, out error);
                case PacketIds.QUEST_ABANDON:
                    return DecodeQuestAbandon(body, out error);
                case PacketIds.QUEST_NPC_MARKERS:
                    return DecodeQuestNpcMarkers(body, out error);
                case PacketIds.SHOP_LIST:
                    return DecodeShopList(body, out error);
                case PacketIds.SHOP_BUY:
                    return DecodeShopBuy(body, out error);
                case PacketIds.SHOP_SELL:
                    return DecodeShopSell(body, out error);
                case PacketIds.SHOP_ACK:
                    return DecodeShopAck(body, out error);
                case PacketIds.UI_PREFERENCES_SET:
                    return DecodeUiPreferencesSet(body, out error);
                case PacketIds.UI_PREFERENCES:
                    return DecodeUiPreferences(body, out error);
                case PacketIds.GATHER_START:
                    return DecodeGatherStart(body, out error);
                case PacketIds.LIFE_CANCEL:
                    return DecodeLifeCancel(body, out error);
                case PacketIds.LIFE_CHANNEL:
                    return DecodeLifeChannel(body, out error);
                case PacketIds.LIFE_RESULT:
                    return DecodeLifeResult(body, out error);
                case PacketIds.LIFE_STATUS:
                    return DecodeLifeStatus(body, out error);
                case PacketIds.NODE_CATALOG:
                    return DecodeNodeCatalog(body, out error);
                case PacketIds.GATHER_PUZZLE:
                    return DecodeGatherPuzzle(body, out error);
                case PacketIds.GATHER_TRACE:
                    return DecodeGatherTrace(body, out error);
                case PacketIds.GATHER_TAPS:
                    return DecodeGatherTaps(body, out error);
                case PacketIds.RECIPE_LIST:
                    return DecodeRecipeList(body, out error);
                case PacketIds.CRAFT_REQ:
                    return DecodeCraftReq(body, out error);
                case PacketIds.CRAFT_ACK:
                    return DecodeCraftAck(body, out error);
                case PacketIds.PING:
                    return DecodePing(body, out error);
                case PacketIds.PONG:
                    return DecodePong(body, out error);
                case PacketIds.KICK:
                    return DecodeKick(body, out error);
                default:
                    error = WireError.None;
                    return null;
            }
        }

        /// <summary>본문 크기(검사 포함 — 위반·스키마 밖 id·페이로드 class 불일치 = WireEncodeException).</summary>
        public static int BodySize(ushort id, object p)
        {
            switch (id)
            {
                case PacketIds.HELLO:
                    return SizeHello(WireCheck.Payload<HelloPayload>(p, "HELLO"));
                case PacketIds.HELLO_ACK:
                    return SizeHelloAck(WireCheck.Payload<HelloAckPayload>(p, "HELLO_ACK"));
                case PacketIds.AUTH_REQ:
                    return SizeAuthReq(WireCheck.Payload<AuthReqPayload>(p, "AUTH_REQ"));
                case PacketIds.AUTH_RESULT:
                    return SizeAuthResult(WireCheck.Payload<AuthResultPayload>(p, "AUTH_RESULT"));
                case PacketIds.CHAR_LIST_REQ:
                    return SizeCharListReq(WireCheck.Payload<CharListReqPayload>(p, "CHAR_LIST_REQ"));
                case PacketIds.CHAR_LIST:
                    return SizeCharList(WireCheck.Payload<CharListPayload>(p, "CHAR_LIST"));
                case PacketIds.ENTER_WORLD_REQ:
                    return SizeEnterWorldReq(WireCheck.Payload<EnterWorldReqPayload>(p, "ENTER_WORLD_REQ"));
                case PacketIds.ENTER_WORLD_OK:
                    return SizeEnterWorldOk(WireCheck.Payload<EnterWorldOkPayload>(p, "ENTER_WORLD_OK"));
                case PacketIds.ZONE_INFO:
                    return SizeZoneInfo(WireCheck.Payload<ZoneInfoPayload>(p, "ZONE_INFO"));
                case PacketIds.CHAR_CREATE_REQ:
                    return SizeCharCreateReq(WireCheck.Payload<CharCreateReqPayload>(p, "CHAR_CREATE_REQ"));
                case PacketIds.CHAR_CREATE_RESULT:
                    return SizeCharCreateResult(WireCheck.Payload<CharCreateResultPayload>(p, "CHAR_CREATE_RESULT"));
                case PacketIds.ZONE_CHANGE_REQ:
                    return SizeZoneChangeReq(WireCheck.Payload<ZoneChangeReqPayload>(p, "ZONE_CHANGE_REQ"));
                case PacketIds.ZONE_CHANGE:
                    return SizeZoneChange(WireCheck.Payload<ZoneChangePayload>(p, "ZONE_CHANGE"));
                case PacketIds.PORTAL_LIST:
                    return SizePortalList(WireCheck.Payload<PortalListPayload>(p, "PORTAL_LIST"));
                case PacketIds.INPUT_CMD:
                    return SizeInputCmd(WireCheck.Payload<InputCmdPayload>(p, "INPUT_CMD"));
                case PacketIds.SNAPSHOT_DELTA:
                    return SizeSnapshotDelta(WireCheck.Payload<SnapshotDeltaPayload>(p, "SNAPSHOT_DELTA"));
                case PacketIds.ENTITY_SPAWN:
                    return SizeEntitySpawn(WireCheck.Payload<EntitySpawnPayload>(p, "ENTITY_SPAWN"));
                case PacketIds.ENTITY_DESPAWN:
                    return SizeEntityDespawn(WireCheck.Payload<EntityDespawnPayload>(p, "ENTITY_DESPAWN"));
                case PacketIds.MOVE_TO:
                    return SizeMoveTo(WireCheck.Payload<MoveToPayload>(p, "MOVE_TO"));
                case PacketIds.ENTITY_META:
                    return SizeEntityMeta(WireCheck.Payload<EntityMetaPayload>(p, "ENTITY_META"));
                case PacketIds.MOVE_PATH:
                    return SizeMovePath(WireCheck.Payload<MovePathPayload>(p, "MOVE_PATH"));
                case PacketIds.MOVE_STOP:
                    return SizeMoveStop(WireCheck.Payload<MoveStopPayload>(p, "MOVE_STOP"));
                case PacketIds.CHAT_SAY:
                    return SizeChatSay(WireCheck.Payload<ChatSayPayload>(p, "CHAT_SAY"));
                case PacketIds.CHAT_BCAST:
                    return SizeChatBcast(WireCheck.Payload<ChatBcastPayload>(p, "CHAT_BCAST"));
                case PacketIds.CREATE_CHARACTER_V2:
                    return SizeCreateCharacterV2(WireCheck.Payload<CreateCharacterV2Payload>(p, "CREATE_CHARACTER_V2"));
                case PacketIds.CHAR_STATS_FULL:
                    return SizeCharStatsFull(WireCheck.Payload<CharStatsFullPayload>(p, "CHAR_STATS_FULL"));
                case PacketIds.CHAR_LEVEL_UP:
                    return SizeCharLevelUp(WireCheck.Payload<CharLevelUpPayload>(p, "CHAR_LEVEL_UP"));
                case PacketIds.CHAR_EXP_GAIN:
                    return SizeCharExpGain(WireCheck.Payload<CharExpGainPayload>(p, "CHAR_EXP_GAIN"));
                case PacketIds.GOLD_UPDATE:
                    return SizeGoldUpdate(WireCheck.Payload<GoldUpdatePayload>(p, "GOLD_UPDATE"));
                case PacketIds.STAT_ALLOCATE:
                    return SizeStatAllocate(WireCheck.Payload<StatAllocatePayload>(p, "STAT_ALLOCATE"));
                case PacketIds.STAT_RESET:
                    return SizeStatReset(WireCheck.Payload<StatResetPayload>(p, "STAT_RESET"));
                case PacketIds.STAT_POINTS_ACK:
                    return SizeStatPointsAck(WireCheck.Payload<StatPointsAckPayload>(p, "STAT_POINTS_ACK"));
                case PacketIds.TARGET_SELECT:
                    return SizeTargetSelect(WireCheck.Payload<TargetSelectPayload>(p, "TARGET_SELECT"));
                case PacketIds.TARGET_ACK:
                    return SizeTargetAck(WireCheck.Payload<TargetAckPayload>(p, "TARGET_ACK"));
                case PacketIds.ATTACK_START:
                    return SizeAttackStart(WireCheck.Payload<AttackStartPayload>(p, "ATTACK_START"));
                case PacketIds.ATTACK_STOP:
                    return SizeAttackStop(WireCheck.Payload<AttackStopPayload>(p, "ATTACK_STOP"));
                case PacketIds.DAMAGE_EVENT:
                    return SizeDamageEvent(WireCheck.Payload<DamageEventPayload>(p, "DAMAGE_EVENT"));
                case PacketIds.DEATH_NOTIFY:
                    return SizeDeathNotify(WireCheck.Payload<DeathNotifyPayload>(p, "DEATH_NOTIFY"));
                case PacketIds.RESPAWN_REQ:
                    return SizeRespawnReq(WireCheck.Payload<RespawnReqPayload>(p, "RESPAWN_REQ"));
                case PacketIds.RESPAWN_OK:
                    return SizeRespawnOk(WireCheck.Payload<RespawnOkPayload>(p, "RESPAWN_OK"));
                case PacketIds.SKILL_CAST:
                    return SizeSkillCast(WireCheck.Payload<SkillCastPayload>(p, "SKILL_CAST"));
                case PacketIds.SKILL_LIST:
                    return SizeSkillList(WireCheck.Payload<SkillListPayload>(p, "SKILL_LIST"));
                case PacketIds.SKILL_EFFECT:
                    return SizeSkillEffect(WireCheck.Payload<SkillEffectPayload>(p, "SKILL_EFFECT"));
                case PacketIds.SKILL_CAST_ACK:
                    return SizeSkillCastAck(WireCheck.Payload<SkillCastAckPayload>(p, "SKILL_CAST_ACK"));
                case PacketIds.MANA_UPDATE:
                    return SizeManaUpdate(WireCheck.Payload<ManaUpdatePayload>(p, "MANA_UPDATE"));
                case PacketIds.SKILL_LEARN:
                    return SizeSkillLearn(WireCheck.Payload<SkillLearnPayload>(p, "SKILL_LEARN"));
                case PacketIds.SKILL_LEVEL_UP:
                    return SizeSkillLevelUp(WireCheck.Payload<SkillLevelUpPayload>(p, "SKILL_LEVEL_UP"));
                case PacketIds.SKILL_LEARN_ACK:
                    return SizeSkillLearnAck(WireCheck.Payload<SkillLearnAckPayload>(p, "SKILL_LEARN_ACK"));
                case PacketIds.SKILL_LV_UP:
                    return SizeSkillLvUp(WireCheck.Payload<SkillLvUpPayload>(p, "SKILL_LV_UP"));
                case PacketIds.ITEM_USE:
                    return SizeItemUse(WireCheck.Payload<ItemUsePayload>(p, "ITEM_USE"));
                case PacketIds.ITEM_EQUIP:
                    return SizeItemEquip(WireCheck.Payload<ItemEquipPayload>(p, "ITEM_EQUIP"));
                case PacketIds.ITEM_UNEQUIP:
                    return SizeItemUnequip(WireCheck.Payload<ItemUnequipPayload>(p, "ITEM_UNEQUIP"));
                case PacketIds.ITEM_PICKUP:
                    return SizeItemPickup(WireCheck.Payload<ItemPickupPayload>(p, "ITEM_PICKUP"));
                case PacketIds.INVENTORY_LIST:
                    return SizeInventoryList(WireCheck.Payload<InventoryListPayload>(p, "INVENTORY_LIST"));
                case PacketIds.INVENTORY_UPDATE:
                    return SizeInventoryList(WireCheck.Payload<InventoryUpdatePayload>(p, "INVENTORY_UPDATE"));
                case PacketIds.ITEM_USE_ACK:
                    return SizeItemUseAck(WireCheck.Payload<ItemUseAckPayload>(p, "ITEM_USE_ACK"));
                case PacketIds.ITEM_PICKUP_ACK:
                    return SizeItemPickupAck(WireCheck.Payload<ItemPickupAckPayload>(p, "ITEM_PICKUP_ACK"));
                case PacketIds.NPC_INTERACT:
                    return SizeNpcInteract(WireCheck.Payload<NpcInteractPayload>(p, "NPC_INTERACT"));
                case PacketIds.NPC_DIALOG:
                    return SizeNpcDialog(WireCheck.Payload<NpcDialogPayload>(p, "NPC_DIALOG"));
                case PacketIds.NPC_ACTION:
                    return SizeNpcAction(WireCheck.Payload<NpcActionPayload>(p, "NPC_ACTION"));
                case PacketIds.QUEST_LIST:
                    return SizeQuestList(WireCheck.Payload<QuestListPayload>(p, "QUEST_LIST"));
                case PacketIds.QUEST_PROGRESS:
                    return SizeQuestProgress(WireCheck.Payload<QuestProgressPayload>(p, "QUEST_PROGRESS"));
                case PacketIds.QUEST_ACTION_ACK:
                    return SizeQuestActionAck(WireCheck.Payload<QuestActionAckPayload>(p, "QUEST_ACTION_ACK"));
                case PacketIds.QUEST_ABANDON:
                    return SizeQuestAbandon(WireCheck.Payload<QuestAbandonPayload>(p, "QUEST_ABANDON"));
                case PacketIds.QUEST_NPC_MARKERS:
                    return SizeQuestNpcMarkers(WireCheck.Payload<QuestNpcMarkersPayload>(p, "QUEST_NPC_MARKERS"));
                case PacketIds.SHOP_LIST:
                    return SizeShopList(WireCheck.Payload<ShopListPayload>(p, "SHOP_LIST"));
                case PacketIds.SHOP_BUY:
                    return SizeShopBuy(WireCheck.Payload<ShopBuyPayload>(p, "SHOP_BUY"));
                case PacketIds.SHOP_SELL:
                    return SizeShopSell(WireCheck.Payload<ShopSellPayload>(p, "SHOP_SELL"));
                case PacketIds.SHOP_ACK:
                    return SizeShopAck(WireCheck.Payload<ShopAckPayload>(p, "SHOP_ACK"));
                case PacketIds.UI_PREFERENCES_SET:
                    return SizeUiPreferencesSet(WireCheck.Payload<UiPreferencesSetPayload>(p, "UI_PREFERENCES_SET"));
                case PacketIds.UI_PREFERENCES:
                    return SizeUiPreferences(WireCheck.Payload<UiPreferencesPayload>(p, "UI_PREFERENCES"));
                case PacketIds.GATHER_START:
                    return SizeGatherStart(WireCheck.Payload<GatherStartPayload>(p, "GATHER_START"));
                case PacketIds.LIFE_CANCEL:
                    return SizeLifeCancel(WireCheck.Payload<LifeCancelPayload>(p, "LIFE_CANCEL"));
                case PacketIds.LIFE_CHANNEL:
                    return SizeLifeChannel(WireCheck.Payload<LifeChannelPayload>(p, "LIFE_CHANNEL"));
                case PacketIds.LIFE_RESULT:
                    return SizeLifeResult(WireCheck.Payload<LifeResultPayload>(p, "LIFE_RESULT"));
                case PacketIds.LIFE_STATUS:
                    return SizeLifeStatus(WireCheck.Payload<LifeStatusPayload>(p, "LIFE_STATUS"));
                case PacketIds.NODE_CATALOG:
                    return SizeNodeCatalog(WireCheck.Payload<NodeCatalogPayload>(p, "NODE_CATALOG"));
                case PacketIds.GATHER_PUZZLE:
                    return SizeGatherPuzzle(WireCheck.Payload<GatherPuzzlePayload>(p, "GATHER_PUZZLE"));
                case PacketIds.GATHER_TRACE:
                    return SizeGatherTrace(WireCheck.Payload<GatherTracePayload>(p, "GATHER_TRACE"));
                case PacketIds.GATHER_TAPS:
                    return SizeGatherTaps(WireCheck.Payload<GatherTapsPayload>(p, "GATHER_TAPS"));
                case PacketIds.RECIPE_LIST:
                    return SizeRecipeList(WireCheck.Payload<RecipeListPayload>(p, "RECIPE_LIST"));
                case PacketIds.CRAFT_REQ:
                    return SizeCraftReq(WireCheck.Payload<CraftReqPayload>(p, "CRAFT_REQ"));
                case PacketIds.CRAFT_ACK:
                    return SizeCraftAck(WireCheck.Payload<CraftAckPayload>(p, "CRAFT_ACK"));
                case PacketIds.PING:
                    return SizePing(WireCheck.Payload<PingPayload>(p, "PING"));
                case PacketIds.PONG:
                    return SizePong(WireCheck.Payload<PongPayload>(p, "PONG"));
                case PacketIds.KICK:
                    return SizeKick(WireCheck.Payload<KickPayload>(p, "KICK"));
                default:
                    throw UnknownPacket(id);
            }
        }

        /// <summary>o[off..]에 본문을 쓰고 끝 오프셋(BodySize로 검사·공간 확보가 끝난 값만).</summary>
        public static int WriteBody(ushort id, object p, global::System.Span<byte> o, int off)
        {
            switch (id)
            {
                case PacketIds.HELLO:
                    return WriteHello(WireCheck.Payload<HelloPayload>(p, "HELLO"), o, off);
                case PacketIds.HELLO_ACK:
                    return WriteHelloAck(WireCheck.Payload<HelloAckPayload>(p, "HELLO_ACK"), o, off);
                case PacketIds.AUTH_REQ:
                    return WriteAuthReq(WireCheck.Payload<AuthReqPayload>(p, "AUTH_REQ"), o, off);
                case PacketIds.AUTH_RESULT:
                    return WriteAuthResult(WireCheck.Payload<AuthResultPayload>(p, "AUTH_RESULT"), o, off);
                case PacketIds.CHAR_LIST_REQ:
                    return WriteCharListReq(WireCheck.Payload<CharListReqPayload>(p, "CHAR_LIST_REQ"), o, off);
                case PacketIds.CHAR_LIST:
                    return WriteCharList(WireCheck.Payload<CharListPayload>(p, "CHAR_LIST"), o, off);
                case PacketIds.ENTER_WORLD_REQ:
                    return WriteEnterWorldReq(WireCheck.Payload<EnterWorldReqPayload>(p, "ENTER_WORLD_REQ"), o, off);
                case PacketIds.ENTER_WORLD_OK:
                    return WriteEnterWorldOk(WireCheck.Payload<EnterWorldOkPayload>(p, "ENTER_WORLD_OK"), o, off);
                case PacketIds.ZONE_INFO:
                    return WriteZoneInfo(WireCheck.Payload<ZoneInfoPayload>(p, "ZONE_INFO"), o, off);
                case PacketIds.CHAR_CREATE_REQ:
                    return WriteCharCreateReq(WireCheck.Payload<CharCreateReqPayload>(p, "CHAR_CREATE_REQ"), o, off);
                case PacketIds.CHAR_CREATE_RESULT:
                    return WriteCharCreateResult(WireCheck.Payload<CharCreateResultPayload>(p, "CHAR_CREATE_RESULT"), o, off);
                case PacketIds.ZONE_CHANGE_REQ:
                    return WriteZoneChangeReq(WireCheck.Payload<ZoneChangeReqPayload>(p, "ZONE_CHANGE_REQ"), o, off);
                case PacketIds.ZONE_CHANGE:
                    return WriteZoneChange(WireCheck.Payload<ZoneChangePayload>(p, "ZONE_CHANGE"), o, off);
                case PacketIds.PORTAL_LIST:
                    return WritePortalList(WireCheck.Payload<PortalListPayload>(p, "PORTAL_LIST"), o, off);
                case PacketIds.INPUT_CMD:
                    return WriteInputCmd(WireCheck.Payload<InputCmdPayload>(p, "INPUT_CMD"), o, off);
                case PacketIds.SNAPSHOT_DELTA:
                    return WriteSnapshotDelta(WireCheck.Payload<SnapshotDeltaPayload>(p, "SNAPSHOT_DELTA"), o, off);
                case PacketIds.ENTITY_SPAWN:
                    return WriteEntitySpawn(WireCheck.Payload<EntitySpawnPayload>(p, "ENTITY_SPAWN"), o, off);
                case PacketIds.ENTITY_DESPAWN:
                    return WriteEntityDespawn(WireCheck.Payload<EntityDespawnPayload>(p, "ENTITY_DESPAWN"), o, off);
                case PacketIds.MOVE_TO:
                    return WriteMoveTo(WireCheck.Payload<MoveToPayload>(p, "MOVE_TO"), o, off);
                case PacketIds.ENTITY_META:
                    return WriteEntityMeta(WireCheck.Payload<EntityMetaPayload>(p, "ENTITY_META"), o, off);
                case PacketIds.MOVE_PATH:
                    return WriteMovePath(WireCheck.Payload<MovePathPayload>(p, "MOVE_PATH"), o, off);
                case PacketIds.MOVE_STOP:
                    return WriteMoveStop(WireCheck.Payload<MoveStopPayload>(p, "MOVE_STOP"), o, off);
                case PacketIds.CHAT_SAY:
                    return WriteChatSay(WireCheck.Payload<ChatSayPayload>(p, "CHAT_SAY"), o, off);
                case PacketIds.CHAT_BCAST:
                    return WriteChatBcast(WireCheck.Payload<ChatBcastPayload>(p, "CHAT_BCAST"), o, off);
                case PacketIds.CREATE_CHARACTER_V2:
                    return WriteCreateCharacterV2(WireCheck.Payload<CreateCharacterV2Payload>(p, "CREATE_CHARACTER_V2"), o, off);
                case PacketIds.CHAR_STATS_FULL:
                    return WriteCharStatsFull(WireCheck.Payload<CharStatsFullPayload>(p, "CHAR_STATS_FULL"), o, off);
                case PacketIds.CHAR_LEVEL_UP:
                    return WriteCharLevelUp(WireCheck.Payload<CharLevelUpPayload>(p, "CHAR_LEVEL_UP"), o, off);
                case PacketIds.CHAR_EXP_GAIN:
                    return WriteCharExpGain(WireCheck.Payload<CharExpGainPayload>(p, "CHAR_EXP_GAIN"), o, off);
                case PacketIds.GOLD_UPDATE:
                    return WriteGoldUpdate(WireCheck.Payload<GoldUpdatePayload>(p, "GOLD_UPDATE"), o, off);
                case PacketIds.STAT_ALLOCATE:
                    return WriteStatAllocate(WireCheck.Payload<StatAllocatePayload>(p, "STAT_ALLOCATE"), o, off);
                case PacketIds.STAT_RESET:
                    return WriteStatReset(WireCheck.Payload<StatResetPayload>(p, "STAT_RESET"), o, off);
                case PacketIds.STAT_POINTS_ACK:
                    return WriteStatPointsAck(WireCheck.Payload<StatPointsAckPayload>(p, "STAT_POINTS_ACK"), o, off);
                case PacketIds.TARGET_SELECT:
                    return WriteTargetSelect(WireCheck.Payload<TargetSelectPayload>(p, "TARGET_SELECT"), o, off);
                case PacketIds.TARGET_ACK:
                    return WriteTargetAck(WireCheck.Payload<TargetAckPayload>(p, "TARGET_ACK"), o, off);
                case PacketIds.ATTACK_START:
                    return WriteAttackStart(WireCheck.Payload<AttackStartPayload>(p, "ATTACK_START"), o, off);
                case PacketIds.ATTACK_STOP:
                    return WriteAttackStop(WireCheck.Payload<AttackStopPayload>(p, "ATTACK_STOP"), o, off);
                case PacketIds.DAMAGE_EVENT:
                    return WriteDamageEvent(WireCheck.Payload<DamageEventPayload>(p, "DAMAGE_EVENT"), o, off);
                case PacketIds.DEATH_NOTIFY:
                    return WriteDeathNotify(WireCheck.Payload<DeathNotifyPayload>(p, "DEATH_NOTIFY"), o, off);
                case PacketIds.RESPAWN_REQ:
                    return WriteRespawnReq(WireCheck.Payload<RespawnReqPayload>(p, "RESPAWN_REQ"), o, off);
                case PacketIds.RESPAWN_OK:
                    return WriteRespawnOk(WireCheck.Payload<RespawnOkPayload>(p, "RESPAWN_OK"), o, off);
                case PacketIds.SKILL_CAST:
                    return WriteSkillCast(WireCheck.Payload<SkillCastPayload>(p, "SKILL_CAST"), o, off);
                case PacketIds.SKILL_LIST:
                    return WriteSkillList(WireCheck.Payload<SkillListPayload>(p, "SKILL_LIST"), o, off);
                case PacketIds.SKILL_EFFECT:
                    return WriteSkillEffect(WireCheck.Payload<SkillEffectPayload>(p, "SKILL_EFFECT"), o, off);
                case PacketIds.SKILL_CAST_ACK:
                    return WriteSkillCastAck(WireCheck.Payload<SkillCastAckPayload>(p, "SKILL_CAST_ACK"), o, off);
                case PacketIds.MANA_UPDATE:
                    return WriteManaUpdate(WireCheck.Payload<ManaUpdatePayload>(p, "MANA_UPDATE"), o, off);
                case PacketIds.SKILL_LEARN:
                    return WriteSkillLearn(WireCheck.Payload<SkillLearnPayload>(p, "SKILL_LEARN"), o, off);
                case PacketIds.SKILL_LEVEL_UP:
                    return WriteSkillLevelUp(WireCheck.Payload<SkillLevelUpPayload>(p, "SKILL_LEVEL_UP"), o, off);
                case PacketIds.SKILL_LEARN_ACK:
                    return WriteSkillLearnAck(WireCheck.Payload<SkillLearnAckPayload>(p, "SKILL_LEARN_ACK"), o, off);
                case PacketIds.SKILL_LV_UP:
                    return WriteSkillLvUp(WireCheck.Payload<SkillLvUpPayload>(p, "SKILL_LV_UP"), o, off);
                case PacketIds.ITEM_USE:
                    return WriteItemUse(WireCheck.Payload<ItemUsePayload>(p, "ITEM_USE"), o, off);
                case PacketIds.ITEM_EQUIP:
                    return WriteItemEquip(WireCheck.Payload<ItemEquipPayload>(p, "ITEM_EQUIP"), o, off);
                case PacketIds.ITEM_UNEQUIP:
                    return WriteItemUnequip(WireCheck.Payload<ItemUnequipPayload>(p, "ITEM_UNEQUIP"), o, off);
                case PacketIds.ITEM_PICKUP:
                    return WriteItemPickup(WireCheck.Payload<ItemPickupPayload>(p, "ITEM_PICKUP"), o, off);
                case PacketIds.INVENTORY_LIST:
                    return WriteInventoryList(WireCheck.Payload<InventoryListPayload>(p, "INVENTORY_LIST"), o, off);
                case PacketIds.INVENTORY_UPDATE:
                    return WriteInventoryList(WireCheck.Payload<InventoryUpdatePayload>(p, "INVENTORY_UPDATE"), o, off);
                case PacketIds.ITEM_USE_ACK:
                    return WriteItemUseAck(WireCheck.Payload<ItemUseAckPayload>(p, "ITEM_USE_ACK"), o, off);
                case PacketIds.ITEM_PICKUP_ACK:
                    return WriteItemPickupAck(WireCheck.Payload<ItemPickupAckPayload>(p, "ITEM_PICKUP_ACK"), o, off);
                case PacketIds.NPC_INTERACT:
                    return WriteNpcInteract(WireCheck.Payload<NpcInteractPayload>(p, "NPC_INTERACT"), o, off);
                case PacketIds.NPC_DIALOG:
                    return WriteNpcDialog(WireCheck.Payload<NpcDialogPayload>(p, "NPC_DIALOG"), o, off);
                case PacketIds.NPC_ACTION:
                    return WriteNpcAction(WireCheck.Payload<NpcActionPayload>(p, "NPC_ACTION"), o, off);
                case PacketIds.QUEST_LIST:
                    return WriteQuestList(WireCheck.Payload<QuestListPayload>(p, "QUEST_LIST"), o, off);
                case PacketIds.QUEST_PROGRESS:
                    return WriteQuestProgress(WireCheck.Payload<QuestProgressPayload>(p, "QUEST_PROGRESS"), o, off);
                case PacketIds.QUEST_ACTION_ACK:
                    return WriteQuestActionAck(WireCheck.Payload<QuestActionAckPayload>(p, "QUEST_ACTION_ACK"), o, off);
                case PacketIds.QUEST_ABANDON:
                    return WriteQuestAbandon(WireCheck.Payload<QuestAbandonPayload>(p, "QUEST_ABANDON"), o, off);
                case PacketIds.QUEST_NPC_MARKERS:
                    return WriteQuestNpcMarkers(WireCheck.Payload<QuestNpcMarkersPayload>(p, "QUEST_NPC_MARKERS"), o, off);
                case PacketIds.SHOP_LIST:
                    return WriteShopList(WireCheck.Payload<ShopListPayload>(p, "SHOP_LIST"), o, off);
                case PacketIds.SHOP_BUY:
                    return WriteShopBuy(WireCheck.Payload<ShopBuyPayload>(p, "SHOP_BUY"), o, off);
                case PacketIds.SHOP_SELL:
                    return WriteShopSell(WireCheck.Payload<ShopSellPayload>(p, "SHOP_SELL"), o, off);
                case PacketIds.SHOP_ACK:
                    return WriteShopAck(WireCheck.Payload<ShopAckPayload>(p, "SHOP_ACK"), o, off);
                case PacketIds.UI_PREFERENCES_SET:
                    return WriteUiPreferencesSet(WireCheck.Payload<UiPreferencesSetPayload>(p, "UI_PREFERENCES_SET"), o, off);
                case PacketIds.UI_PREFERENCES:
                    return WriteUiPreferences(WireCheck.Payload<UiPreferencesPayload>(p, "UI_PREFERENCES"), o, off);
                case PacketIds.GATHER_START:
                    return WriteGatherStart(WireCheck.Payload<GatherStartPayload>(p, "GATHER_START"), o, off);
                case PacketIds.LIFE_CANCEL:
                    return WriteLifeCancel(WireCheck.Payload<LifeCancelPayload>(p, "LIFE_CANCEL"), o, off);
                case PacketIds.LIFE_CHANNEL:
                    return WriteLifeChannel(WireCheck.Payload<LifeChannelPayload>(p, "LIFE_CHANNEL"), o, off);
                case PacketIds.LIFE_RESULT:
                    return WriteLifeResult(WireCheck.Payload<LifeResultPayload>(p, "LIFE_RESULT"), o, off);
                case PacketIds.LIFE_STATUS:
                    return WriteLifeStatus(WireCheck.Payload<LifeStatusPayload>(p, "LIFE_STATUS"), o, off);
                case PacketIds.NODE_CATALOG:
                    return WriteNodeCatalog(WireCheck.Payload<NodeCatalogPayload>(p, "NODE_CATALOG"), o, off);
                case PacketIds.GATHER_PUZZLE:
                    return WriteGatherPuzzle(WireCheck.Payload<GatherPuzzlePayload>(p, "GATHER_PUZZLE"), o, off);
                case PacketIds.GATHER_TRACE:
                    return WriteGatherTrace(WireCheck.Payload<GatherTracePayload>(p, "GATHER_TRACE"), o, off);
                case PacketIds.GATHER_TAPS:
                    return WriteGatherTaps(WireCheck.Payload<GatherTapsPayload>(p, "GATHER_TAPS"), o, off);
                case PacketIds.RECIPE_LIST:
                    return WriteRecipeList(WireCheck.Payload<RecipeListPayload>(p, "RECIPE_LIST"), o, off);
                case PacketIds.CRAFT_REQ:
                    return WriteCraftReq(WireCheck.Payload<CraftReqPayload>(p, "CRAFT_REQ"), o, off);
                case PacketIds.CRAFT_ACK:
                    return WriteCraftAck(WireCheck.Payload<CraftAckPayload>(p, "CRAFT_ACK"), o, off);
                case PacketIds.PING:
                    return WritePing(WireCheck.Payload<PingPayload>(p, "PING"), o, off);
                case PacketIds.PONG:
                    return WritePong(WireCheck.Payload<PongPayload>(p, "PONG"), o, off);
                case PacketIds.KICK:
                    return WriteKick(WireCheck.Payload<KickPayload>(p, "KICK"), o, off);
                default:
                    throw UnknownPacket(id);
            }
        }

        /// <summary>id로 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] Encode(ushort id, object p)
        {
            var buf = new byte[BodySize(id, p)];
            WriteBody(id, p, buf, 0);
            return buf;
        }

        private static WireEncodeException UnknownPacket(ushort id) => new WireEncodeException($"packet 0x{id:x}", "unknown packet");
    }
}
