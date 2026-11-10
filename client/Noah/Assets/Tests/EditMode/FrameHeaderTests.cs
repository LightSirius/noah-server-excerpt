// 클라 프레임 헤더 단일 정의(Network/FrameHeader.cs) — 서버 server/src/net/wireFrame.ts와 같은 바이트 배치를 고정한다
// (tests/server/net/wireFrame.test.ts "헤더 바이트 배치"와 같은 벡터). 헤더 전환 슬라이스는 양쪽 기대 바이트를 함께 바꾼다.

#if UNITY_INCLUDE_TESTS
using System;
using MMORPG.Net;
using MMORPG.Network;
using NUnit.Framework;

namespace MMORPG.Tests.EditMode
{
    public sealed class FrameHeaderTests
    {
        [Test]
        public void Write_LayoutMatchesServer()
        {
            var buf = new byte[FrameHeader.Size];
            FrameHeader.Write(buf, 0, 0x1234, 0xbeef);
            CollectionAssert.AreEqual(new byte[] { 0xef, 0xbe, 0x34, 0x12 }, buf);
        }

        [Test]
        public void Write_RejectsBodyOverU16()
        {
            var buf = new byte[FrameHeader.Size];
            FrameHeader.Write(buf, 0, 1, FrameHeader.MaxBodyBytes);
            Assert.Throws<ArgumentOutOfRangeException>(() => FrameHeader.Write(buf, 0, 1, FrameHeader.MaxBodyBytes + 1));
        }

        [Test]
        public void Read_RoundTripsAndRingNeedsWholeHeader()
        {
            var buf = new byte[FrameHeader.Size + 2];
            FrameHeader.Write(buf, 2, 0x0101, 300);
            FrameHeader.Read(buf, 2, out ushort id, out int len);
            Assert.AreEqual(0x0101, id);
            Assert.AreEqual(300, len);

            var header = new byte[FrameHeader.Size];
            FrameHeader.Write(header, 0, 0x0101, 300);
            var ring = new RingByteBuffer(64);
            ring.Append(header, FrameHeader.Size - 1);
            Assert.IsFalse(FrameHeader.TryRead(ring, out _, out _), "헤더가 덜 오면 false");
            ring.Append(new[] { header[FrameHeader.Size - 1] }, 1);
            Assert.IsTrue(FrameHeader.TryRead(ring, out ushort rid, out int rlen));
            Assert.AreEqual(0x0101, rid);
            Assert.AreEqual(300, rlen);
        }
    }
}
#endif
