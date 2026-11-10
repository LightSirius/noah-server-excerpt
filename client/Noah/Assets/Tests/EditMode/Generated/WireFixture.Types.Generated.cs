// AUTO-GENERATED — do not edit. Source: tools/codegen/fixture.ts
// schema-hash: 3831471d
// Run `bun run gen` from tools/codegen/ to regenerate.

namespace MMORPG.Tests.EditMode.WireFixture
{
    public static class Protocol
    {
        public const int Version = 7;
    }

    public static class PacketIds
    {
        public const ushort PING_BIN = 0x0010;
        public const ushort ALL_PRIMS = 0x0011;
        public const ushort OPTS = 0x0012;
        public const ushort WORLD = 0x0013;
        public const ushort EMPTY_BIN = 0x0014;
        public const ushort OPT32 = 0x0018;
        public const ushort WORLD_COPY = 0x0015;
    }

    /// <summary>필드별 와이어 상한(string = UTF-8 바이트, array = 원소 수) — 서버 WIRE_LIMITS와 같은 값.</summary>
    public static class WireLimits
    {
        public const int TagLabelMax = 8;
        public const int EntityNameMax = 24;
        public const int EntityTagsMax = 4;
        public const int AllPrimsSMax = 16;
        public const int OptsO2Max = 6;
        public const int OptsO5Max = 3;
        public const int WorldEntitiesMax = 6;
        public const int WorldNamesMax = 5;
        public const int WorldNamesItemMax = 12;
        public const int WorldKindsMax = 3;
        public const int WorldFlagsMax = 4;
    }

    public enum Kind : byte
    {
        Player = 1,
        Npc = 2,
        Monster = 3,
    }

    public enum Wide : ushort
    {
        Lo = 0,
        Mid = 300,
        Hi = 65535,
    }

    public enum Huge : uint
    {
        Zero = 0,
        Big = 4294967295,
    }

    public class Vec2
    {
        public float X;
        public float Y;
    }

    public class Tag
    {
        public string Label;
        public short? Weight;
    }

    public class Entity
    {
        public uint Id;
        public Kind Kind;
        public Vec2 Pos;
        public string Name;
        public Tag[] Tags;
    }

    public class PingBinPayload
    {
        public double T;
    }

    public class AllPrimsPayload
    {
        public byte A;
        public ushort B;
        public uint C;
        public sbyte D;
        public short E;
        public int F;
        public float G;
        public double H;
        public bool I;
        public string S;
    }

    public class OptsPayload
    {
        public byte? O1;
        public ushort Always;
        public string O2;
        public Kind? O3;
        public Vec2 O4;
        public ushort[] O5;
        public bool? O6;
        public double? O7;
        public int? O8;
        public Entity O9;
    }

    public class WorldPayload
    {
        public uint Tick;
        public Entity[] Entities;
        public string[] Names;
        public Kind[] Kinds;
        public Wide Wide;
        public Huge Huge;
        public bool[] Flags;
    }

    public class EmptyBinPayload
    {
    }

    public class Opt32Payload
    {
        public byte? F0;
        public byte? F1;
        public byte? F2;
        public byte? F3;
        public byte? F4;
        public byte? F5;
        public byte? F6;
        public byte? F7;
        public byte? F8;
        public byte? F9;
        public byte? F10;
        public byte? F11;
        public byte? F12;
        public byte? F13;
        public byte? F14;
        public byte? F15;
        public byte? F16;
        public byte? F17;
        public byte? F18;
        public byte? F19;
        public byte? F20;
        public byte? F21;
        public byte? F22;
        public byte? F23;
        public byte? F24;
        public byte? F25;
        public byte? F26;
        public byte? F27;
        public byte? F28;
        public byte? F29;
        public byte? F30;
        public byte? F31;
    }

    public class WorldCopyPayload : WorldPayload
    {
    }

}
