// 클라 송신 프레임(Network/PacketWriter.cs, 이진 전환 B2b) — FrameHeader + 생성 코덱 본문(모든 패킷 — B6에 JSON 분기 제거, 스키마 밖 id는
// WireEncodeException).
// 기대 바이트는 서버 생성 코덱(encodePacket)이 같은 페이로드에 내는 값과 같다(손 계산 LE). 익명 객체·짝 없는 서로게이트는 송신 전에 거부된다.

#if UNITY_INCLUDE_TESTS
using System;
using System.Reflection;
using System.Text;
using MMORPG.Net;
using MMORPG.Net.Generated;
using MMORPG.Network;
using NUnit.Framework;

namespace MMORPG.Tests.EditMode
{
    public sealed class PacketWriterTests
    {
        [Test]
        public void Binary_Ping_HeaderPlusF64LE()
        {
            byte[] frame = PacketWriter.Build(PacketIds.PING, new PingPayload { ClientTimeMs = 7 });
            // [len 8 u16 LE][id 0x0F00 u16 LE][7.0 f64 LE]
            CollectionAssert.AreEqual(new byte[] { 0x08, 0x00, 0x00, 0x0f, 0, 0, 0, 0, 0, 0, 0x1c, 0x40 }, frame);
        }

        [Test]
        public void Binary_UiPreferencesSet_PartialPatchKeepsOnlyPresentArray()
        {
            byte[] frame = PacketWriter.Build(PacketIds.UI_PREFERENCES_SET, new UiPreferencesSetPayload { TrackedQuestIds = new[] { 7001 } });
            // presence 0b10(trackedQuestIds만) · count u16 1 · i32 7001(0x1B59) — quickSlots는 0바이트.
            CollectionAssert.AreEqual(new byte[] { 0x07, 0x00, 0x70, 0x04, 0x02, 0x01, 0x00, 0x59, 0x1b, 0x00, 0x00 }, frame);
        }

        [Test]
        public void Binary_RejectsAnonymousPayloadAndBrokenText()
        {
            Assert.Throws<WireEncodeException>(() => PacketWriter.Build<object>(PacketIds.UI_PREFERENCES_SET, new { quickSlots = new int[6] }));
            var lone = new ChatSayPayload { Channel = 2, Target = "", Text = "hi\ud83d" };
            Assert.Throws<WireEncodeException>(() => PacketWriter.Build(PacketIds.CHAT_SAY, lone));
            lone.Text = WireUtf8.DropUnpairedSurrogates(lone.Text);
            Assert.AreEqual("hi", lone.Text);
            Assert.DoesNotThrow(() => PacketWriter.Build(PacketIds.CHAT_SAY, lone));
        }

        [Test]
        public void AllPacketIdsAreBinary()
        {
            // 이진 전환 B6 — 모든 패킷 본문이 바이너리라 IsBinaryPacket(전 id true)은 폐지됐다. PacketIds 상수마다 생성 코덱이 있다: 빈 본문은 값(필드 없는
            // 패킷) 또는 위반 사유를 내고, 스키마 밖 id만 사유 없이 null이다(PacketBus가 "unknown packet"으로 로그). 송신은 스키마 밖 id를 거부한다.
            var ids = typeof(PacketIds).GetFields(BindingFlags.Public | BindingFlags.Static);
            Assert.That(ids.Length, Is.GreaterThan(0));
            foreach (var f in ids)
            {
                object v = WireCodec.Decode((ushort)f.GetValue(null), Array.Empty<byte>(), out var err);
                Assert.That(v != null || err != WireError.None, Is.True, f.Name);
            }
            Assert.That(WireCodec.Decode(0x7ffe, Array.Empty<byte>(), out var unknownErr), Is.Null, "스키마 밖 id");
            Assert.AreEqual(WireError.None, unknownErr);
            var ex = Assert.Throws<WireEncodeException>(() => PacketWriter.Build(0x7ffe, new PingPayload()));
            StringAssert.Contains("packet 0x7ffe", ex.Message);
        }

        [Test]
        public void Binary_CharList_B5_1b_CharSummaryArray()
        {
            byte[] frame = PacketWriter.Build(PacketIds.CHAR_LIST, new CharListPayload { Chars = new[] { new CharSummary { CharId = 1, Name = "a", Level = 2, ZoneId = 3 } } });
            // [len 17 u16 LE][id 0x0011 u16 LE][chars u16 1][charId 1 i32][name u16 1 + "a"][level 2 i32][zoneId 3 i32] — 종전 JSON 문자열의 x·y는 없다.
            CollectionAssert.AreEqual(new byte[] { 0x11, 0x00, 0x11, 0x00, 1, 0, 1, 0, 0, 0, 1, 0, 0x61, 2, 0, 0, 0, 3, 0, 0, 0 }, frame);
            var back = WireCodec.DecodeCharList(frame.AsSpan(FrameHeader.Size), out var err);
            Assert.AreEqual(WireError.None, err);
            Assert.AreEqual("a", back.Chars[0].Name);
            Assert.Throws<WireEncodeException>(() => PacketWriter.Build(PacketIds.CHAR_LIST, new CharListPayload { Chars = new CharSummary[WireLimits.CharListCharsMax + 1] }));
        }

        [Test]
        public void Binary_GoldUpdate_B4_TwoI32LE()
        {
            byte[] frame = PacketWriter.Build(PacketIds.GOLD_UPDATE, new GoldUpdatePayload { Gold = 9, Delta = -1 });
            // [len 8 u16 LE][id 0x0304 u16 LE][gold 9 i32 LE][delta -1 i32 LE]
            CollectionAssert.AreEqual(new byte[] { 0x08, 0x00, 0x04, 0x03, 9, 0, 0, 0, 0xff, 0xff, 0xff, 0xff }, frame);
            var back = WireCodec.DecodeGoldUpdate(frame.AsSpan(FrameHeader.Size), out var err);
            Assert.AreEqual(WireError.None, err);
            Assert.AreEqual(-1, back.Delta);
        }

        [Test]
        public void Binary_Kick_B3b_ReasonI32PlusUtf8Detail()
        {
            byte[] frame = PacketWriter.Build(PacketIds.KICK, new KickPayload { Reason = 9, Detail = "server busy" });
            // [len 17 u16 LE][id 0x0F03 u16 LE][reason 9 i32 LE][detail u16 11 + "server busy"]
            var want = new byte[] { 0x11, 0x00, 0x03, 0x0f, 9, 0, 0, 0, 11, 0 };
            CollectionAssert.AreEqual(want, frame.AsSpan(0, want.Length).ToArray());
            Assert.AreEqual("server busy", Encoding.UTF8.GetString(frame, want.Length, frame.Length - want.Length));
            var back = WireCodec.DecodeKick(frame.AsSpan(FrameHeader.Size), out var err);
            Assert.AreEqual(WireError.None, err);
            Assert.AreEqual(9, back.Reason);
            Assert.AreEqual("server busy", back.Detail);
        }

        [Test]
        public void DropUnpairedSurrogates_KeepsPairsAndSameInstanceWhenClean()
        {
            const string clean = "가a\ud83d\ude00";
            Assert.AreSame(clean, WireUtf8.DropUnpairedSurrogates(clean));
            Assert.AreEqual("a\ud83d\ude00b", WireUtf8.DropUnpairedSurrogates("\ude00a\ud83d\ude00b\ud83d"));
        }
    }
}
#endif
