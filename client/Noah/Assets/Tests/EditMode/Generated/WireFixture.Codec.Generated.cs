// AUTO-GENERATED — do not edit. Source: tools/codegen/fixture.ts
// schema-hash: 3831471d
// Run `bun run gen` from tools/codegen/ to regenerate.

// 바이너리 본문 코덱 — 규칙 shared/protocol.md §2, 런타임 client/Noah/Assets/Scripts/Net/WireRuntime.cs, 참조 구현 tools/codegen/refCodec.ts.

namespace MMORPG.Tests.EditMode.WireFixture
{
    using global::MMORPG.Net;

    public static class WireCodec
    {
        private static global::MMORPG.Tests.EditMode.WireFixture.Kind ReadKind(ref WireReader r)
        {
            switch (r.U8())
            {
                case 1:
                    return global::MMORPG.Tests.EditMode.WireFixture.Kind.Player;
                case 2:
                    return global::MMORPG.Tests.EditMode.WireFixture.Kind.Npc;
                case 3:
                    return global::MMORPG.Tests.EditMode.WireFixture.Kind.Monster;
                default:
                    r.Fail(WireError.BadEnum);
                    return default;
            }
        }

        private static void CheckKind(global::MMORPG.Tests.EditMode.WireFixture.Kind v, string path)
        {
            switch (v)
            {
                case global::MMORPG.Tests.EditMode.WireFixture.Kind.Player:
                case global::MMORPG.Tests.EditMode.WireFixture.Kind.Npc:
                case global::MMORPG.Tests.EditMode.WireFixture.Kind.Monster:
                    return;
                default:
                    throw new WireEncodeException(path, $"not a Kind value: {v}");
            }
        }

        private static global::MMORPG.Tests.EditMode.WireFixture.Wide ReadWide(ref WireReader r)
        {
            switch (r.U16())
            {
                case 0:
                    return global::MMORPG.Tests.EditMode.WireFixture.Wide.Lo;
                case 300:
                    return global::MMORPG.Tests.EditMode.WireFixture.Wide.Mid;
                case 65535:
                    return global::MMORPG.Tests.EditMode.WireFixture.Wide.Hi;
                default:
                    r.Fail(WireError.BadEnum);
                    return default;
            }
        }

        private static void CheckWide(global::MMORPG.Tests.EditMode.WireFixture.Wide v, string path)
        {
            switch (v)
            {
                case global::MMORPG.Tests.EditMode.WireFixture.Wide.Lo:
                case global::MMORPG.Tests.EditMode.WireFixture.Wide.Mid:
                case global::MMORPG.Tests.EditMode.WireFixture.Wide.Hi:
                    return;
                default:
                    throw new WireEncodeException(path, $"not a Wide value: {v}");
            }
        }

        private static global::MMORPG.Tests.EditMode.WireFixture.Huge ReadHuge(ref WireReader r)
        {
            switch (r.U32())
            {
                case 0:
                    return global::MMORPG.Tests.EditMode.WireFixture.Huge.Zero;
                case 4294967295:
                    return global::MMORPG.Tests.EditMode.WireFixture.Huge.Big;
                default:
                    r.Fail(WireError.BadEnum);
                    return default;
            }
        }

        private static void CheckHuge(global::MMORPG.Tests.EditMode.WireFixture.Huge v, string path)
        {
            switch (v)
            {
                case global::MMORPG.Tests.EditMode.WireFixture.Huge.Zero:
                case global::MMORPG.Tests.EditMode.WireFixture.Huge.Big:
                    return;
                default:
                    throw new WireEncodeException(path, $"not a Huge value: {v}");
            }
        }

        // ── Vec2 ──

        /// <summary>Vec2 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeVec2(Vec2 p)
        {
            WireCheck.F32(p.X, "Vec2.x");
            WireCheck.F32(p.Y, "Vec2.y");
            return 8;
        }

        /// <summary>Vec2를 o[off..]에 쓰고 끝 오프셋 — SizeVec2로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteVec2(Vec2 p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.F32(o, off, p.X);
            off = WireWrite.F32(o, off, p.Y);
            return off;
        }

        /// <summary>Vec2 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadVec2(ref WireReader r, Vec2 v)
        {
            v.X = r.F32();
            v.Y = r.F32();
            return r.Error == WireError.None;
        }

        // ── Entity ──

        /// <summary>Entity 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeEntity(Entity p)
        {
            int n = 6;
            CheckKind(p.Kind, "Entity.kind");
            n += SizeVec2(WireCheck.NotNull(p.Pos, "Entity.pos"));
            if (p.Name != null)
            {
                n += WireCheck.Str(p.Name, 24, "Entity.name");
            }
            if (p.Tags != null)
            {
                int c = WireCheck.Count(p.Tags, 0, 4, "Entity.tags");
                for (int i = 0; i < c; i++) n += SizeTag(WireCheck.NotNull(p.Tags[i], "Entity.tags"));
                n += 2;
            }
            return n;
        }

        /// <summary>Entity를 o[off..]에 쓰고 끝 오프셋 — SizeEntity로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteEntity(Entity p, global::System.Span<byte> o, int off)
        {
            uint pm = 0;
            if (p.Name != null) pm |= 1u << 0;
            if (p.Tags != null) pm |= 1u << 1;
            off = WireWrite.U8(o, off, (byte)((pm >> 0) & 0xff));
            off = WireWrite.U32(o, off, p.Id);
            off = WireWrite.U8(o, off, (byte)p.Kind);
            off = WriteVec2(p.Pos, o, off);
            if (p.Name != null) off = WireWrite.Str(o, off, p.Name);
            if (p.Tags != null)
            {
                off = WireWrite.U16(o, off, (ushort)p.Tags.Length);
                for (int i = 0; i < p.Tags.Length; i++) off = WriteTag(p.Tags[i], o, off);
            }
            return off;
        }

        /// <summary>Entity 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadEntity(ref WireReader r, Entity v)
        {
            uint pm = r.Presence(1, 2);
            v.Id = r.U32();
            v.Kind = ReadKind(ref r);
            {
                var s = new Vec2();
                if (!ReadVec2(ref r, s)) return false;
                v.Pos = s;
            }
            if ((pm & (1u << 0)) != 0) v.Name = r.Str(24);
            if ((pm & (1u << 1)) != 0)
            {
                int n = r.Count(0, 4);
                var a = new Tag[r.Capacity(n)];
                for (int i = 0; i < n; i++)
                {
                    var e = new Tag();
                    if (!ReadTag(ref r, e)) return false;
                    a[i] = e;
                }
                v.Tags = a;
            }
            return r.Error == WireError.None;
        }

        // ── Tag ──

        /// <summary>Tag 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeTag(Tag p)
        {
            int n = 1;
            n += WireCheck.Str(p.Label, 8, "Tag.label");
            if (p.Weight.HasValue)
            {
                n += 2;
            }
            return n;
        }

        /// <summary>Tag를 o[off..]에 쓰고 끝 오프셋 — SizeTag로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteTag(Tag p, global::System.Span<byte> o, int off)
        {
            uint pm = 0;
            if (p.Weight.HasValue) pm |= 1u << 0;
            off = WireWrite.U8(o, off, (byte)((pm >> 0) & 0xff));
            off = WireWrite.Str(o, off, p.Label);
            if (p.Weight.HasValue) off = WireWrite.I16(o, off, p.Weight.Value);
            return off;
        }

        /// <summary>Tag 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadTag(ref WireReader r, Tag v)
        {
            uint pm = r.Presence(1, 1);
            v.Label = r.Str(8);
            if ((pm & (1u << 0)) != 0) v.Weight = r.I16();
            return r.Error == WireError.None;
        }

        // ── PING_BIN ──

        /// <summary>PING_BIN 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizePingBin(PingBinPayload p)
        {
            WireCheck.F64(p.T, "PING_BIN.t");
            return 8;
        }

        /// <summary>PING_BIN를 o[off..]에 쓰고 끝 오프셋 — SizePingBin로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WritePingBin(PingBinPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.F64(o, off, p.T);
            return off;
        }

        /// <summary>PING_BIN 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadPingBin(ref WireReader r, PingBinPayload v)
        {
            v.T = r.F64();
            return r.Error == WireError.None;
        }

        // ── ALL_PRIMS ──

        /// <summary>ALL_PRIMS 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeAllPrims(AllPrimsPayload p)
        {
            int n = 27;
            WireCheck.F32(p.G, "ALL_PRIMS.g");
            WireCheck.F64(p.H, "ALL_PRIMS.h");
            n += WireCheck.Str(p.S, 16, "ALL_PRIMS.s");
            return n;
        }

        /// <summary>ALL_PRIMS를 o[off..]에 쓰고 끝 오프셋 — SizeAllPrims로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteAllPrims(AllPrimsPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.U8(o, off, p.A);
            off = WireWrite.U16(o, off, p.B);
            off = WireWrite.U32(o, off, p.C);
            off = WireWrite.I8(o, off, p.D);
            off = WireWrite.I16(o, off, p.E);
            off = WireWrite.I32(o, off, p.F);
            off = WireWrite.F32(o, off, p.G);
            off = WireWrite.F64(o, off, p.H);
            off = WireWrite.Bool(o, off, p.I);
            off = WireWrite.Str(o, off, p.S);
            return off;
        }

        /// <summary>ALL_PRIMS 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadAllPrims(ref WireReader r, AllPrimsPayload v)
        {
            v.A = r.U8();
            v.B = r.U16();
            v.C = r.U32();
            v.D = r.I8();
            v.E = r.I16();
            v.F = r.I32();
            v.G = r.F32();
            v.H = r.F64();
            v.I = r.Bool();
            v.S = r.Str(16);
            return r.Error == WireError.None;
        }

        // ── OPTS ──

        /// <summary>OPTS 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeOpts(OptsPayload p)
        {
            int n = 4;
            if (p.O1.HasValue)
            {
                n += 1;
            }
            if (p.O2 != null)
            {
                n += WireCheck.Str(p.O2, 6, "OPTS.o2");
            }
            if (p.O3.HasValue)
            {
                CheckKind(p.O3.Value, "OPTS.o3");
                n += 1;
            }
            if (p.O4 != null)
            {
                n += SizeVec2(WireCheck.NotNull(p.O4, "OPTS.o4"));
            }
            if (p.O5 != null)
            {
                int c = WireCheck.Count(p.O5, 0, 3, "OPTS.o5");
                n += 2 + c * 2;
            }
            if (p.O6.HasValue)
            {
                n += 1;
            }
            if (p.O7.HasValue)
            {
                WireCheck.F64(p.O7.Value, "OPTS.o7");
                n += 8;
            }
            if (p.O8.HasValue)
            {
                n += 4;
            }
            if (p.O9 != null)
            {
                n += SizeEntity(WireCheck.NotNull(p.O9, "OPTS.o9"));
            }
            return n;
        }

        /// <summary>OPTS를 o[off..]에 쓰고 끝 오프셋 — SizeOpts로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteOpts(OptsPayload p, global::System.Span<byte> o, int off)
        {
            uint pm = 0;
            if (p.O1.HasValue) pm |= 1u << 0;
            if (p.O2 != null) pm |= 1u << 1;
            if (p.O3.HasValue) pm |= 1u << 2;
            if (p.O4 != null) pm |= 1u << 3;
            if (p.O5 != null) pm |= 1u << 4;
            if (p.O6.HasValue) pm |= 1u << 5;
            if (p.O7.HasValue) pm |= 1u << 6;
            if (p.O8.HasValue) pm |= 1u << 7;
            if (p.O9 != null) pm |= 1u << 8;
            off = WireWrite.U8(o, off, (byte)((pm >> 0) & 0xff));
            off = WireWrite.U8(o, off, (byte)((pm >> 8) & 0xff));
            if (p.O1.HasValue) off = WireWrite.U8(o, off, p.O1.Value);
            off = WireWrite.U16(o, off, p.Always);
            if (p.O2 != null) off = WireWrite.Str(o, off, p.O2);
            if (p.O3.HasValue) off = WireWrite.U8(o, off, (byte)p.O3.Value);
            if (p.O4 != null) off = WriteVec2(p.O4, o, off);
            if (p.O5 != null)
            {
                off = WireWrite.U16(o, off, (ushort)p.O5.Length);
                for (int i = 0; i < p.O5.Length; i++) off = WireWrite.U16(o, off, p.O5[i]);
            }
            if (p.O6.HasValue) off = WireWrite.Bool(o, off, p.O6.Value);
            if (p.O7.HasValue) off = WireWrite.F64(o, off, p.O7.Value);
            if (p.O8.HasValue) off = WireWrite.I32(o, off, p.O8.Value);
            if (p.O9 != null) off = WriteEntity(p.O9, o, off);
            return off;
        }

        /// <summary>OPTS 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadOpts(ref WireReader r, OptsPayload v)
        {
            uint pm = r.Presence(2, 9);
            if ((pm & (1u << 0)) != 0) v.O1 = r.U8();
            v.Always = r.U16();
            if ((pm & (1u << 1)) != 0) v.O2 = r.Str(6);
            if ((pm & (1u << 2)) != 0) v.O3 = ReadKind(ref r);
            if ((pm & (1u << 3)) != 0)
            {
                var s = new Vec2();
                if (!ReadVec2(ref r, s)) return false;
                v.O4 = s;
            }
            if ((pm & (1u << 4)) != 0)
            {
                int n = r.Count(0, 3);
                if (!r.Need(n * 2)) return false;
                var a = new ushort[n];
                for (int i = 0; i < n; i++)
                {
                    var e = r.U16();
                    if (r.Error != WireError.None) return false;
                    a[i] = e;
                }
                v.O5 = a;
            }
            if ((pm & (1u << 5)) != 0) v.O6 = r.Bool();
            if ((pm & (1u << 6)) != 0) v.O7 = r.F64();
            if ((pm & (1u << 7)) != 0) v.O8 = r.I32();
            if ((pm & (1u << 8)) != 0)
            {
                var s = new Entity();
                if (!ReadEntity(ref r, s)) return false;
                v.O9 = s;
            }
            return r.Error == WireError.None;
        }

        // ── WORLD ──

        /// <summary>WORLD 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeWorld(WorldPayload p)
        {
            int n = 18;
            {
                int c = WireCheck.Count(p.Entities, 0, 6, "WORLD.entities");
                for (int i = 0; i < c; i++) n += SizeEntity(WireCheck.NotNull(p.Entities[i], "WORLD.entities"));
            }
            {
                int c = WireCheck.Count(p.Names, 1, 5, "WORLD.names");
                for (int i = 0; i < c; i++) n += WireCheck.Str(p.Names[i], 12, "WORLD.names");
            }
            {
                int c = WireCheck.Count(p.Kinds, 0, 3, "WORLD.kinds");
                for (int i = 0; i < c; i++) CheckKind(p.Kinds[i], "WORLD.kinds");
                n += c * 1;
            }
            CheckWide(p.Wide, "WORLD.wide");
            CheckHuge(p.Huge, "WORLD.huge");
            {
                int c = WireCheck.Count(p.Flags, 0, 4, "WORLD.flags");
                n += c * 1;
            }
            return n;
        }

        /// <summary>WORLD를 o[off..]에 쓰고 끝 오프셋 — SizeWorld로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteWorld(WorldPayload p, global::System.Span<byte> o, int off)
        {
            off = WireWrite.U32(o, off, p.Tick);
            off = WireWrite.U16(o, off, (ushort)p.Entities.Length);
            for (int i = 0; i < p.Entities.Length; i++) off = WriteEntity(p.Entities[i], o, off);
            off = WireWrite.U16(o, off, (ushort)p.Names.Length);
            for (int i = 0; i < p.Names.Length; i++) off = WireWrite.Str(o, off, p.Names[i]);
            off = WireWrite.U16(o, off, (ushort)p.Kinds.Length);
            for (int i = 0; i < p.Kinds.Length; i++) off = WireWrite.U8(o, off, (byte)p.Kinds[i]);
            off = WireWrite.U16(o, off, (ushort)p.Wide);
            off = WireWrite.U32(o, off, (uint)p.Huge);
            off = WireWrite.U16(o, off, (ushort)p.Flags.Length);
            for (int i = 0; i < p.Flags.Length; i++) off = WireWrite.Bool(o, off, p.Flags[i]);
            return off;
        }

        /// <summary>WORLD 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadWorld(ref WireReader r, WorldPayload v)
        {
            v.Tick = r.U32();
            {
                int n = r.Count(0, 6);
                var a = new Entity[r.Capacity(n)];
                for (int i = 0; i < n; i++)
                {
                    var e = new Entity();
                    if (!ReadEntity(ref r, e)) return false;
                    a[i] = e;
                }
                v.Entities = a;
            }
            {
                int n = r.Count(1, 5);
                var a = new string[r.Capacity(n)];
                for (int i = 0; i < n; i++)
                {
                    var e = r.Str(12);
                    if (r.Error != WireError.None) return false;
                    a[i] = e;
                }
                v.Names = a;
            }
            {
                int n = r.Count(0, 3);
                if (!r.Need(n * 1)) return false;
                var a = new Kind[n];
                for (int i = 0; i < n; i++)
                {
                    var e = ReadKind(ref r);
                    if (r.Error != WireError.None) return false;
                    a[i] = e;
                }
                v.Kinds = a;
            }
            v.Wide = ReadWide(ref r);
            v.Huge = ReadHuge(ref r);
            {
                int n = r.Count(0, 4);
                if (!r.Need(n * 1)) return false;
                var a = new bool[n];
                for (int i = 0; i < n; i++)
                {
                    var e = r.Bool();
                    if (r.Error != WireError.None) return false;
                    a[i] = e;
                }
                v.Flags = a;
            }
            return r.Error == WireError.None;
        }

        // ── EMPTY_BIN ──

        /// <summary>EMPTY_BIN 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeEmptyBin(EmptyBinPayload p)
        {
            return 0;
        }

        /// <summary>EMPTY_BIN를 o[off..]에 쓰고 끝 오프셋 — SizeEmptyBin로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteEmptyBin(EmptyBinPayload p, global::System.Span<byte> o, int off)
        {
            return off;
        }

        /// <summary>EMPTY_BIN 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadEmptyBin(ref WireReader r, EmptyBinPayload v)
        {
            return r.Error == WireError.None;
        }

        // ── OPT32 ──

        /// <summary>OPT32 인코딩 크기 — 유한·enum·max/min·null·서로게이트 검사(위반 = WireEncodeException).</summary>
        public static int SizeOpt32(Opt32Payload p)
        {
            int n = 4;
            if (p.F0.HasValue)
            {
                n += 1;
            }
            if (p.F1.HasValue)
            {
                n += 1;
            }
            if (p.F2.HasValue)
            {
                n += 1;
            }
            if (p.F3.HasValue)
            {
                n += 1;
            }
            if (p.F4.HasValue)
            {
                n += 1;
            }
            if (p.F5.HasValue)
            {
                n += 1;
            }
            if (p.F6.HasValue)
            {
                n += 1;
            }
            if (p.F7.HasValue)
            {
                n += 1;
            }
            if (p.F8.HasValue)
            {
                n += 1;
            }
            if (p.F9.HasValue)
            {
                n += 1;
            }
            if (p.F10.HasValue)
            {
                n += 1;
            }
            if (p.F11.HasValue)
            {
                n += 1;
            }
            if (p.F12.HasValue)
            {
                n += 1;
            }
            if (p.F13.HasValue)
            {
                n += 1;
            }
            if (p.F14.HasValue)
            {
                n += 1;
            }
            if (p.F15.HasValue)
            {
                n += 1;
            }
            if (p.F16.HasValue)
            {
                n += 1;
            }
            if (p.F17.HasValue)
            {
                n += 1;
            }
            if (p.F18.HasValue)
            {
                n += 1;
            }
            if (p.F19.HasValue)
            {
                n += 1;
            }
            if (p.F20.HasValue)
            {
                n += 1;
            }
            if (p.F21.HasValue)
            {
                n += 1;
            }
            if (p.F22.HasValue)
            {
                n += 1;
            }
            if (p.F23.HasValue)
            {
                n += 1;
            }
            if (p.F24.HasValue)
            {
                n += 1;
            }
            if (p.F25.HasValue)
            {
                n += 1;
            }
            if (p.F26.HasValue)
            {
                n += 1;
            }
            if (p.F27.HasValue)
            {
                n += 1;
            }
            if (p.F28.HasValue)
            {
                n += 1;
            }
            if (p.F29.HasValue)
            {
                n += 1;
            }
            if (p.F30.HasValue)
            {
                n += 1;
            }
            if (p.F31.HasValue)
            {
                n += 1;
            }
            return n;
        }

        /// <summary>OPT32를 o[off..]에 쓰고 끝 오프셋 — SizeOpt32로 검사·공간 확보가 끝난 값만(던지지 않는다).</summary>
        public static int WriteOpt32(Opt32Payload p, global::System.Span<byte> o, int off)
        {
            uint pm = 0;
            if (p.F0.HasValue) pm |= 1u << 0;
            if (p.F1.HasValue) pm |= 1u << 1;
            if (p.F2.HasValue) pm |= 1u << 2;
            if (p.F3.HasValue) pm |= 1u << 3;
            if (p.F4.HasValue) pm |= 1u << 4;
            if (p.F5.HasValue) pm |= 1u << 5;
            if (p.F6.HasValue) pm |= 1u << 6;
            if (p.F7.HasValue) pm |= 1u << 7;
            if (p.F8.HasValue) pm |= 1u << 8;
            if (p.F9.HasValue) pm |= 1u << 9;
            if (p.F10.HasValue) pm |= 1u << 10;
            if (p.F11.HasValue) pm |= 1u << 11;
            if (p.F12.HasValue) pm |= 1u << 12;
            if (p.F13.HasValue) pm |= 1u << 13;
            if (p.F14.HasValue) pm |= 1u << 14;
            if (p.F15.HasValue) pm |= 1u << 15;
            if (p.F16.HasValue) pm |= 1u << 16;
            if (p.F17.HasValue) pm |= 1u << 17;
            if (p.F18.HasValue) pm |= 1u << 18;
            if (p.F19.HasValue) pm |= 1u << 19;
            if (p.F20.HasValue) pm |= 1u << 20;
            if (p.F21.HasValue) pm |= 1u << 21;
            if (p.F22.HasValue) pm |= 1u << 22;
            if (p.F23.HasValue) pm |= 1u << 23;
            if (p.F24.HasValue) pm |= 1u << 24;
            if (p.F25.HasValue) pm |= 1u << 25;
            if (p.F26.HasValue) pm |= 1u << 26;
            if (p.F27.HasValue) pm |= 1u << 27;
            if (p.F28.HasValue) pm |= 1u << 28;
            if (p.F29.HasValue) pm |= 1u << 29;
            if (p.F30.HasValue) pm |= 1u << 30;
            if (p.F31.HasValue) pm |= 1u << 31;
            off = WireWrite.U8(o, off, (byte)((pm >> 0) & 0xff));
            off = WireWrite.U8(o, off, (byte)((pm >> 8) & 0xff));
            off = WireWrite.U8(o, off, (byte)((pm >> 16) & 0xff));
            off = WireWrite.U8(o, off, (byte)((pm >> 24) & 0xff));
            if (p.F0.HasValue) off = WireWrite.U8(o, off, p.F0.Value);
            if (p.F1.HasValue) off = WireWrite.U8(o, off, p.F1.Value);
            if (p.F2.HasValue) off = WireWrite.U8(o, off, p.F2.Value);
            if (p.F3.HasValue) off = WireWrite.U8(o, off, p.F3.Value);
            if (p.F4.HasValue) off = WireWrite.U8(o, off, p.F4.Value);
            if (p.F5.HasValue) off = WireWrite.U8(o, off, p.F5.Value);
            if (p.F6.HasValue) off = WireWrite.U8(o, off, p.F6.Value);
            if (p.F7.HasValue) off = WireWrite.U8(o, off, p.F7.Value);
            if (p.F8.HasValue) off = WireWrite.U8(o, off, p.F8.Value);
            if (p.F9.HasValue) off = WireWrite.U8(o, off, p.F9.Value);
            if (p.F10.HasValue) off = WireWrite.U8(o, off, p.F10.Value);
            if (p.F11.HasValue) off = WireWrite.U8(o, off, p.F11.Value);
            if (p.F12.HasValue) off = WireWrite.U8(o, off, p.F12.Value);
            if (p.F13.HasValue) off = WireWrite.U8(o, off, p.F13.Value);
            if (p.F14.HasValue) off = WireWrite.U8(o, off, p.F14.Value);
            if (p.F15.HasValue) off = WireWrite.U8(o, off, p.F15.Value);
            if (p.F16.HasValue) off = WireWrite.U8(o, off, p.F16.Value);
            if (p.F17.HasValue) off = WireWrite.U8(o, off, p.F17.Value);
            if (p.F18.HasValue) off = WireWrite.U8(o, off, p.F18.Value);
            if (p.F19.HasValue) off = WireWrite.U8(o, off, p.F19.Value);
            if (p.F20.HasValue) off = WireWrite.U8(o, off, p.F20.Value);
            if (p.F21.HasValue) off = WireWrite.U8(o, off, p.F21.Value);
            if (p.F22.HasValue) off = WireWrite.U8(o, off, p.F22.Value);
            if (p.F23.HasValue) off = WireWrite.U8(o, off, p.F23.Value);
            if (p.F24.HasValue) off = WireWrite.U8(o, off, p.F24.Value);
            if (p.F25.HasValue) off = WireWrite.U8(o, off, p.F25.Value);
            if (p.F26.HasValue) off = WireWrite.U8(o, off, p.F26.Value);
            if (p.F27.HasValue) off = WireWrite.U8(o, off, p.F27.Value);
            if (p.F28.HasValue) off = WireWrite.U8(o, off, p.F28.Value);
            if (p.F29.HasValue) off = WireWrite.U8(o, off, p.F29.Value);
            if (p.F30.HasValue) off = WireWrite.U8(o, off, p.F30.Value);
            if (p.F31.HasValue) off = WireWrite.U8(o, off, p.F31.Value);
            return off;
        }

        /// <summary>OPT32 판독 — v를 채운다. 위반이면 false(사유는 r.Error, 첫 위반 우선).</summary>
        public static bool ReadOpt32(ref WireReader r, Opt32Payload v)
        {
            uint pm = r.Presence(4, 32);
            if ((pm & (1u << 0)) != 0) v.F0 = r.U8();
            if ((pm & (1u << 1)) != 0) v.F1 = r.U8();
            if ((pm & (1u << 2)) != 0) v.F2 = r.U8();
            if ((pm & (1u << 3)) != 0) v.F3 = r.U8();
            if ((pm & (1u << 4)) != 0) v.F4 = r.U8();
            if ((pm & (1u << 5)) != 0) v.F5 = r.U8();
            if ((pm & (1u << 6)) != 0) v.F6 = r.U8();
            if ((pm & (1u << 7)) != 0) v.F7 = r.U8();
            if ((pm & (1u << 8)) != 0) v.F8 = r.U8();
            if ((pm & (1u << 9)) != 0) v.F9 = r.U8();
            if ((pm & (1u << 10)) != 0) v.F10 = r.U8();
            if ((pm & (1u << 11)) != 0) v.F11 = r.U8();
            if ((pm & (1u << 12)) != 0) v.F12 = r.U8();
            if ((pm & (1u << 13)) != 0) v.F13 = r.U8();
            if ((pm & (1u << 14)) != 0) v.F14 = r.U8();
            if ((pm & (1u << 15)) != 0) v.F15 = r.U8();
            if ((pm & (1u << 16)) != 0) v.F16 = r.U8();
            if ((pm & (1u << 17)) != 0) v.F17 = r.U8();
            if ((pm & (1u << 18)) != 0) v.F18 = r.U8();
            if ((pm & (1u << 19)) != 0) v.F19 = r.U8();
            if ((pm & (1u << 20)) != 0) v.F20 = r.U8();
            if ((pm & (1u << 21)) != 0) v.F21 = r.U8();
            if ((pm & (1u << 22)) != 0) v.F22 = r.U8();
            if ((pm & (1u << 23)) != 0) v.F23 = r.U8();
            if ((pm & (1u << 24)) != 0) v.F24 = r.U8();
            if ((pm & (1u << 25)) != 0) v.F25 = r.U8();
            if ((pm & (1u << 26)) != 0) v.F26 = r.U8();
            if ((pm & (1u << 27)) != 0) v.F27 = r.U8();
            if ((pm & (1u << 28)) != 0) v.F28 = r.U8();
            if ((pm & (1u << 29)) != 0) v.F29 = r.U8();
            if ((pm & (1u << 30)) != 0) v.F30 = r.U8();
            if ((pm & (1u << 31)) != 0) v.F31 = r.U8();
            return r.Error == WireError.None;
        }

        /// <summary>PING_BIN 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static PingBinPayload DecodePingBin(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new PingBinPayload();
            bool ok = ReadPingBin(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>PING_BIN 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodePingBin(PingBinPayload p)
        {
            var buf = new byte[SizePingBin(p)];
            WritePingBin(p, buf, 0);
            return buf;
        }

        /// <summary>ALL_PRIMS 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static AllPrimsPayload DecodeAllPrims(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new AllPrimsPayload();
            bool ok = ReadAllPrims(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>ALL_PRIMS 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeAllPrims(AllPrimsPayload p)
        {
            var buf = new byte[SizeAllPrims(p)];
            WriteAllPrims(p, buf, 0);
            return buf;
        }

        /// <summary>OPTS 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static OptsPayload DecodeOpts(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new OptsPayload();
            bool ok = ReadOpts(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>OPTS 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeOpts(OptsPayload p)
        {
            var buf = new byte[SizeOpts(p)];
            WriteOpts(p, buf, 0);
            return buf;
        }

        /// <summary>WORLD 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static WorldPayload DecodeWorld(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new WorldPayload();
            bool ok = ReadWorld(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>WORLD 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeWorld(WorldPayload p)
        {
            var buf = new byte[SizeWorld(p)];
            WriteWorld(p, buf, 0);
            return buf;
        }

        /// <summary>EMPTY_BIN 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static EmptyBinPayload DecodeEmptyBin(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new EmptyBinPayload();
            bool ok = ReadEmptyBin(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>EMPTY_BIN 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeEmptyBin(EmptyBinPayload p)
        {
            var buf = new byte[SizeEmptyBin(p)];
            WriteEmptyBin(p, buf, 0);
            return buf;
        }

        /// <summary>OPT32 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static Opt32Payload DecodeOpt32(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new Opt32Payload();
            bool ok = ReadOpt32(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>OPT32 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeOpt32(Opt32Payload p)
        {
            var buf = new byte[SizeOpt32(p)];
            WriteOpt32(p, buf, 0);
            return buf;
        }

        /// <summary>WORLD_COPY 본문 전체 디코드 — 정확히 소비해야 한다(남는 바이트 = Trailing). 실패 = null, 사유는 error.</summary>
        public static WorldCopyPayload DecodeWorldCopy(global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            var r = new WireReader(body);
            var v = new WorldCopyPayload();
            bool ok = ReadWorld(ref r, v) && r.Done();
            error = r.Error;
            return ok ? v : null;
        }

        /// <summary>WORLD_COPY 본문 인코드(검사 위반 = WireEncodeException).</summary>
        public static byte[] EncodeWorldCopy(WorldCopyPayload p)
        {
            var buf = new byte[SizeWorld(p)];
            WriteWorld(p, buf, 0);
            return buf;
        }

        /// <summary>본문 디코드 — 실패 = null + 사유. 스키마 밖 id도 null이지만 사유는 None(위반 사유가 아니다 — 수신자가 구분한다).</summary>
        public static object Decode(ushort id, global::System.ReadOnlySpan<byte> body, out WireError error)
        {
            switch (id)
            {
                case PacketIds.PING_BIN:
                    return DecodePingBin(body, out error);
                case PacketIds.ALL_PRIMS:
                    return DecodeAllPrims(body, out error);
                case PacketIds.OPTS:
                    return DecodeOpts(body, out error);
                case PacketIds.WORLD:
                    return DecodeWorld(body, out error);
                case PacketIds.EMPTY_BIN:
                    return DecodeEmptyBin(body, out error);
                case PacketIds.OPT32:
                    return DecodeOpt32(body, out error);
                case PacketIds.WORLD_COPY:
                    return DecodeWorldCopy(body, out error);
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
                case PacketIds.PING_BIN:
                    return SizePingBin(WireCheck.Payload<PingBinPayload>(p, "PING_BIN"));
                case PacketIds.ALL_PRIMS:
                    return SizeAllPrims(WireCheck.Payload<AllPrimsPayload>(p, "ALL_PRIMS"));
                case PacketIds.OPTS:
                    return SizeOpts(WireCheck.Payload<OptsPayload>(p, "OPTS"));
                case PacketIds.WORLD:
                    return SizeWorld(WireCheck.Payload<WorldPayload>(p, "WORLD"));
                case PacketIds.EMPTY_BIN:
                    return SizeEmptyBin(WireCheck.Payload<EmptyBinPayload>(p, "EMPTY_BIN"));
                case PacketIds.OPT32:
                    return SizeOpt32(WireCheck.Payload<Opt32Payload>(p, "OPT32"));
                case PacketIds.WORLD_COPY:
                    return SizeWorld(WireCheck.Payload<WorldCopyPayload>(p, "WORLD_COPY"));
                default:
                    throw UnknownPacket(id);
            }
        }

        /// <summary>o[off..]에 본문을 쓰고 끝 오프셋(BodySize로 검사·공간 확보가 끝난 값만).</summary>
        public static int WriteBody(ushort id, object p, global::System.Span<byte> o, int off)
        {
            switch (id)
            {
                case PacketIds.PING_BIN:
                    return WritePingBin(WireCheck.Payload<PingBinPayload>(p, "PING_BIN"), o, off);
                case PacketIds.ALL_PRIMS:
                    return WriteAllPrims(WireCheck.Payload<AllPrimsPayload>(p, "ALL_PRIMS"), o, off);
                case PacketIds.OPTS:
                    return WriteOpts(WireCheck.Payload<OptsPayload>(p, "OPTS"), o, off);
                case PacketIds.WORLD:
                    return WriteWorld(WireCheck.Payload<WorldPayload>(p, "WORLD"), o, off);
                case PacketIds.EMPTY_BIN:
                    return WriteEmptyBin(WireCheck.Payload<EmptyBinPayload>(p, "EMPTY_BIN"), o, off);
                case PacketIds.OPT32:
                    return WriteOpt32(WireCheck.Payload<Opt32Payload>(p, "OPT32"), o, off);
                case PacketIds.WORLD_COPY:
                    return WriteWorld(WireCheck.Payload<WorldCopyPayload>(p, "WORLD_COPY"), o, off);
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
