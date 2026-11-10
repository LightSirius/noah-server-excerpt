// RingByteBuffer — Phase 2 (docs/migration-plan.md).
//
// v1 PacketReader의 List<byte>.RemoveRange(0, …)는 매 패킷마다 O(n) 복사를 일으켜
// 트래픽이 늘면 GC 압박과 stall을 만든다. head/tail 포인터로 O(1) 누적/소비.
//
// 클라 프레임 헤더 v2([len u16 LE][id u16 LE] — Network/FrameHeader.cs)를 ReadU16LE로 읽는다(이진 전환 B1).

using System;

namespace MMORPG.Net
{
    public class RingByteBuffer
    {
        private const int DefaultInitial = 4 * 1024;
        private const int MaxCapacity = 1 * 1024 * 1024; // 1 MB

        private byte[] _buf;
        private int _head; // 다음에 읽을 위치
        private int _tail; // 다음에 쓸 위치

        public RingByteBuffer(int initialCapacity = DefaultInitial)
        {
            if (initialCapacity <= 0) throw new ArgumentException("initialCapacity must be > 0");
            _buf = new byte[initialCapacity];
        }

        public int Available => _tail - _head;
        public int Capacity => _buf.Length;

        /// 들어온 청크를 누적. v1의 List<byte> 폐기.
        public void Append(byte[] data, int count)
        {
            if (data == null) throw new ArgumentNullException(nameof(data));
            if (count < 0 || count > data.Length) throw new ArgumentOutOfRangeException(nameof(count));
            if (count == 0) return;

            if (_tail + count > _buf.Length) CompactOrGrow(count);

            Buffer.BlockCopy(data, 0, _buf, _tail, count);
            _tail += count;
        }

        /// head로부터 offset 위치의 u16 LE.
        public ushort ReadU16LE(int offset)
        {
            RequireBytes(offset + 2);
            int p = _head + offset;
            return (ushort)(_buf[p] | (_buf[p + 1] << 8));
        }

        /// head로부터 [start, end) 범위를 새 배열로 복사. (Span 도입은 .NET Standard 2.1+/Unity 2021 LTS에서)
        public byte[] CopyRange(int start, int end)
        {
            if (start < 0 || end < start) throw new ArgumentException("invalid range");
            RequireBytes(end);
            int len = end - start;
            byte[] dest = new byte[len];
            Buffer.BlockCopy(_buf, _head + start, dest, 0, len);
            return dest;
        }

        /// 앞쪽 n바이트 소비.
        public void Consume(int n)
        {
            if (n < 0) throw new ArgumentOutOfRangeException(nameof(n));
            if (n > Available) throw new InvalidOperationException($"consume {n} > available {Available}");
            _head += n;
            if (_head == _tail) { _head = 0; _tail = 0; }
            else if (_head > _buf.Length / 2) CompactInPlace();
        }

        // ---- internal ----

        private void RequireBytes(int n)
        {
            if (Available < n) throw new InvalidOperationException($"need {n} bytes, available {Available}");
        }

        private void CompactInPlace()
        {
            if (_head == 0) return;
            int len = _tail - _head;
            Buffer.BlockCopy(_buf, _head, _buf, 0, len);
            _tail = len;
            _head = 0;
        }

        private void CompactOrGrow(int incomingSize)
        {
            CompactInPlace();
            if (_tail + incomingSize <= _buf.Length) return;

            int newCap = _buf.Length;
            while (_tail + incomingSize > newCap)
            {
                newCap *= 2;
                if (newCap > MaxCapacity)
                    throw new InvalidOperationException(
                        $"ring buffer overflow: requested {_tail + incomingSize}B > max {MaxCapacity}B");
            }
            byte[] next = new byte[newCap];
            Buffer.BlockCopy(_buf, 0, next, 0, _tail);
            _buf = next;
        }
    }
}
