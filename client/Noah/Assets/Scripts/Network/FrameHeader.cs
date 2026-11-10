// 클라 와이어 프레임 헤더 — 클라에서 헤더 형식을 아는 유일한 곳(서버 쪽 단일 정의: server/src/net/wireFrame.ts).
// 현행 v2(shared/protocol.md §1, 이진 전환 B1): [body_len u16 LE][packet_id u16 LE] 4바이트 + body. body_len은 헤더를 포함하지 않는다
// (≤ 0xFFFF). 구 v1 클라는 서버가 v1 형식 KICK 1로 거절한다 — 이 클라는 v1을 읽거나 쓰지 않는다.

using System;
using MMORPG.Net;

namespace MMORPG.Network
{
    public static class FrameHeader
    {
        public const int Size = 4;

        /// <summary>body 상한 = len(u16) 용량.</summary>
        public const int MaxBodyBytes = 0xFFFF;

        /// dst[off..off+Size)에 헤더를 쓴다. len이 MaxBodyBytes를 넘으면 ArgumentOutOfRangeException(서버 writeFrameHeader의 RangeError와 같다).
        public static void Write(byte[] dst, int off, ushort id, int len)
        {
            if (len < 0 || len > MaxBodyBytes) throw new ArgumentOutOfRangeException(nameof(len), len, "frame body exceeds u16 length");
            dst[off]     = (byte)(len & 0xFF);
            dst[off + 1] = (byte)(len >> 8);
            dst[off + 2] = (byte)(id & 0xFF);
            dst[off + 3] = (byte)(id >> 8);
        }

        /// ring head의 헤더를 읽는다(소비하지 않음). 헤더가 아직 다 오지 않았으면 false.
        public static bool TryRead(RingByteBuffer ring, out ushort id, out int len)
        {
            if (ring.Available < Size)
            {
                id  = 0;
                len = 0;
                return false;
            }
            len = ring.ReadU16LE(0);
            id  = ring.ReadU16LE(2);
            return true;
        }

        /// src[off..off+Size)의 헤더를 읽는다 — 호출자가 Size 바이트를 보장한다(스트림에서 헤더만 따로 읽는 경로용).
        public static void Read(byte[] src, int off, out ushort id, out int len)
        {
            len = src[off] | (src[off + 1] << 8);
            id  = (ushort)(src[off + 2] | (src[off + 3] << 8));
        }
    }
}
