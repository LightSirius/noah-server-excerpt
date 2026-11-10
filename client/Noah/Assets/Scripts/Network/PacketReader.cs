// Phase 2: 내부 List<byte> + RemoveRange(O(n²)) 폐기, MMORPG.Net.RingByteBuffer 기반.
// Phase D step 1: TryRead가 raw body byte[] 반환 — 본문 디코드는 PacketBus(생성 바이너리 코덱 WireCodec — 모든 패킷, 이진 전환 B6)가 한다.
// 헤더 형식은 FrameHeader가 단일 정의.

using MMORPG.Net;

namespace MMORPG.Network
{
    public class PacketReader
    {
        private readonly RingByteBuffer _ring = new();

        public void Append(byte[] data, int count) => _ring.Append(data, count);

        public bool TryRead(out ushort packetId, out byte[] body)
        {
            packetId = 0;
            body     = null;

            if (!FrameHeader.TryRead(_ring, out ushort id, out int length)) return false;

            if (_ring.Available < FrameHeader.Size + length) return false;

            byte[] payload = _ring.CopyRange(FrameHeader.Size, FrameHeader.Size + length);
            _ring.Consume(FrameHeader.Size + length);

            packetId = id;
            body     = payload;
            return true;
        }
    }
}
