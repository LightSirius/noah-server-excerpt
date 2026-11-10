// 클라 송신 프레임 — 헤더(FrameHeader) + 생성 코덱 WireCodec 본문(shared/protocol.md §2 — 모든 패킷 본문이 바이너리, 이진 전환 B6에 JSON 분기 제거).
// 검사 위반·스키마 밖 id = WireEncodeException — 송신 버그 신호라 호출자 NetworkManager.Send가 로그 후 drop. 수신 PacketBus의 WireCodec.Decode와 대칭이다.
// 페이로드는 정확히 생성 class(또는 하위 class)여야 한다 — 익명 객체·Dictionary는 거부된다.

using MMORPG.Net.Generated;

namespace MMORPG.Network
{
    public static class PacketWriter
    {
        /// 검사(BodySize)가 버퍼 할당 전이라 위반이면 부분 프레임 없이 던진다.
        public static byte[] Build<T>(ushort packetId, T payload) where T : class
        {
            int len       = WireCodec.BodySize(packetId, payload);
            byte[] buffer = new byte[FrameHeader.Size + len];
            FrameHeader.Write(buffer, 0, packetId, len);
            WireCodec.WriteBody(packetId, payload, buffer, FrameHeader.Size);
            return buffer;
        }
    }
}
