// 바이너리 본문 코덱 런타임(C#) — 생성 코덱(Net/WireCodec.Generated.cs)이 쓰는 손으로 쓴 부품. 서버 server/src/net/wire/runtime.ts의 페어.
// 와이어 규칙 정본은 shared/protocol.md §2, 결정은 docs/adr/0003-binary-body-codec.md.
//
// 디코드: WireReader(ReadOnlySpan<byte> 위 ref struct)는 예외를 던지지 않는다 — 첫 위반의 사유(WireError)를 기록하고 이후 읽기는
// 0·""·false를 돌려주는 무동작이 된다(첫 위반 우선, TS BodyReader·refCodec과 같은 순서). 길이·개수의 범위(max/min)는 내용보다 먼저 본다.
// 인코드: 생성 Size*가 WireCheck로 유한·enum·max/min·null·UTF-16 정상성을 검사하고(위반 = WireEncodeException), Write*는 검사된 값만
// 쓰므로 던지지 않는다. 정수 범위·정수성은 C# 필드 타입(byte·uint 등)이 보장한다.
// 교차 언어 일치는 Tests/EditMode/Golden/wire.golden.json(tools/codegen/golden.ts — 참조 인터프리터 refCodec 산출)으로 시험한다.
// Unity 6 = .NET Standard 2.1: BinaryPrimitives에 float/double 읽기·쓰기가 없어 BitConverter 비트 재해석을 쓴다.

using System;
using System.Buffers.Binary;
using System.Text;

namespace MMORPG.Net
{
    /// <summary>디코드 실패 사유 — 값은 서버 WIRE_ERROR(server/src/net/wire/runtime.ts)·골든과 공유하므로 바꾸지 않는다(추가만).</summary>
    public enum WireError : byte
    {
        None = 0,
        Truncated = 1,
        Trailing = 2,
        BadBool = 3,
        BadEnum = 4,
        OverMax = 5,
        UnderMin = 6,
        BadUtf8 = 7,
        BadPresence = 8,
        NonFinite = 9,
    }

    /// <summary>인코드 거부 — 생성 Size*가 던진다(송신 경로의 버그 신호). Path = "&lt;패킷|struct&gt;.&lt;필드&gt;".</summary>
    public sealed class WireEncodeException : Exception
    {
        public string Path { get; }

        public WireEncodeException(string path, string detail) : base($"wire encode {path}: {detail}")
        {
            Path = path;
        }
    }

    /// <summary>바이너리 본문 판독기 — 경계 검사 읽기 + 첫 위반 기록. 생성 Read*만 쓴다.</summary>
    public ref struct WireReader
    {
        private const int LenPrefixBytes = 2;

        private readonly ReadOnlySpan<byte> _buf;
        private int _off;

        public WireReader(ReadOnlySpan<byte> body)
        {
            _buf = body;
            _off = 0;
            Error = WireError.None;
        }

        /// <summary>첫 위반 사유(None = 없음).</summary>
        public WireError Error { get; private set; }

        public int Remaining => _buf.Length - _off;

        /// <summary>위반 기록 — 이미 위반이 있으면 무시(첫 위반 우선).</summary>
        public void Fail(WireError code)
        {
            if (Error == WireError.None) Error = code;
        }

        /// <summary>n바이트를 읽을 수 있나 — 아니면 Truncated. 위반 뒤에는 false.</summary>
        public bool Need(int n)
        {
            if (Error != WireError.None) return false;
            if (n > Remaining)
            {
                Fail(WireError.Truncated);
                return false;
            }
            return true;
        }

        /// <summary>
        /// 가변 크기 원소 배열의 할당 길이 — 원소는 최소 1바이트라(스키마 규칙: 0바이트 원소 금지) 남은 바이트보다 많은 원소는 성공할 수 없다.
        /// 개수만 큰 짧은 본문이 원소 max개 할당을 일으키지 않게 남은 바이트로 자른다(성공이면 항상 n과 같다).
        /// </summary>
        public int Capacity(int n) => n <= Remaining ? n : Remaining;

        public byte U8()
        {
            if (!Need(1)) return 0;
            return _buf[_off++];
        }

        public sbyte I8()
        {
            if (!Need(1)) return 0;
            return unchecked((sbyte)_buf[_off++]);
        }

        public ushort U16()
        {
            if (!Need(2)) return 0;
            var v = BinaryPrimitives.ReadUInt16LittleEndian(_buf.Slice(_off));
            _off += 2;
            return v;
        }

        public short I16()
        {
            if (!Need(2)) return 0;
            var v = BinaryPrimitives.ReadInt16LittleEndian(_buf.Slice(_off));
            _off += 2;
            return v;
        }

        public uint U32()
        {
            if (!Need(4)) return 0;
            var v = BinaryPrimitives.ReadUInt32LittleEndian(_buf.Slice(_off));
            _off += 4;
            return v;
        }

        public int I32()
        {
            if (!Need(4)) return 0;
            var v = BinaryPrimitives.ReadInt32LittleEndian(_buf.Slice(_off));
            _off += 4;
            return v;
        }

        /// <summary>f32. NaN·±Inf = NonFinite.</summary>
        public float F32()
        {
            if (!Need(4)) return 0f;
            var v = BitConverter.Int32BitsToSingle(BinaryPrimitives.ReadInt32LittleEndian(_buf.Slice(_off)));
            _off += 4;
            if (float.IsNaN(v) || float.IsInfinity(v))
            {
                Fail(WireError.NonFinite);
                return 0f;
            }
            return v;
        }

        /// <summary>f64. NaN·±Inf = NonFinite.</summary>
        public double F64()
        {
            if (!Need(8)) return 0d;
            var v = BitConverter.Int64BitsToDouble(BinaryPrimitives.ReadInt64LittleEndian(_buf.Slice(_off)));
            _off += 8;
            if (double.IsNaN(v) || double.IsInfinity(v))
            {
                Fail(WireError.NonFinite);
                return 0d;
            }
            return v;
        }

        /// <summary>bool = u8 0/1만. 그 밖 = BadBool.</summary>
        public bool Bool()
        {
            if (!Need(1)) return false;
            byte b = _buf[_off++];
            if (b > 1) Fail(WireError.BadBool);
            return b == 1;
        }

        /// <summary>string = u16 바이트 길이 + 엄격 UTF-8. 길이 &gt; max = OverMax(내용을 읽기 전), 잘못된 UTF-8 = BadUtf8.</summary>
        public string Str(int max)
        {
            if (!Need(LenPrefixBytes)) return string.Empty;
            int len = BinaryPrimitives.ReadUInt16LittleEndian(_buf.Slice(_off));
            _off += LenPrefixBytes;
            if (len > max)
            {
                Fail(WireError.OverMax);
                return string.Empty;
            }
            if (!Need(len)) return string.Empty;
            var bytes = _buf.Slice(_off, len);
            _off += len;
            if (!WireUtf8.IsValid(bytes))
            {
                Fail(WireError.BadUtf8);
                return string.Empty;
            }
            return Encoding.UTF8.GetString(bytes);
        }

        /// <summary>array 원소 수 = u16. &gt; max = OverMax, &lt; min = UnderMin(원소를 읽기 전). 위반 시 0.</summary>
        public int Count(int min, int max)
        {
            if (!Need(LenPrefixBytes)) return 0;
            int n = BinaryPrimitives.ReadUInt16LittleEndian(_buf.Slice(_off));
            _off += LenPrefixBytes;
            if (n > max)
            {
                Fail(WireError.OverMax);
                return 0;
            }
            if (n < min)
            {
                Fail(WireError.UnderMin);
                return 0;
            }
            return n;
        }

        /// <summary>
        /// presence 비트마스크 — nBytes(= ceil(k/8))바이트 LE, 비트 i = i번째 optional 필드(LSB부터). k 이상 비트가 서 있으면 BadPresence.
        /// k ≤ 32(스키마가 보장).
        /// </summary>
        public uint Presence(int nBytes, int k)
        {
            if (!Need(nBytes)) return 0;
            uint mask = 0;
            for (int i = 0; i < nBytes; i++) mask |= (uint)_buf[_off + i] << (8 * i);
            _off += nBytes;
            if (k < 32 && (mask >> k) != 0)
            {
                Fail(WireError.BadPresence);
                return 0;
            }
            return mask;
        }

        /// <summary>본문 끝 — 위반이 없는데 남는 바이트가 있으면 Trailing. 성공이면 true.</summary>
        public bool Done()
        {
            if (Error == WireError.None && _off != _buf.Length) Fail(WireError.Trailing);
            return Error == WireError.None;
        }
    }

    /// <summary>LE 쓰기 — 생성 Write*가 Size*로 검사·공간 확보가 끝난 값만 넘긴다(던지지 않는다). 반환 = 끝 오프셋.</summary>
    public static class WireWrite
    {
        public static int U8(Span<byte> o, int off, byte v)
        {
            o[off] = v;
            return off + 1;
        }

        public static int I8(Span<byte> o, int off, sbyte v)
        {
            o[off] = unchecked((byte)v);
            return off + 1;
        }

        public static int U16(Span<byte> o, int off, ushort v)
        {
            BinaryPrimitives.WriteUInt16LittleEndian(o.Slice(off), v);
            return off + 2;
        }

        public static int I16(Span<byte> o, int off, short v)
        {
            BinaryPrimitives.WriteInt16LittleEndian(o.Slice(off), v);
            return off + 2;
        }

        public static int U32(Span<byte> o, int off, uint v)
        {
            BinaryPrimitives.WriteUInt32LittleEndian(o.Slice(off), v);
            return off + 4;
        }

        public static int I32(Span<byte> o, int off, int v)
        {
            BinaryPrimitives.WriteInt32LittleEndian(o.Slice(off), v);
            return off + 4;
        }

        public static int F32(Span<byte> o, int off, float v)
        {
            BinaryPrimitives.WriteInt32LittleEndian(o.Slice(off), BitConverter.SingleToInt32Bits(v));
            return off + 4;
        }

        public static int F64(Span<byte> o, int off, double v)
        {
            BinaryPrimitives.WriteInt64LittleEndian(o.Slice(off), BitConverter.DoubleToInt64Bits(v));
            return off + 8;
        }

        public static int Bool(Span<byte> o, int off, bool v)
        {
            o[off] = v ? (byte)1 : (byte)0;
            return off + 1;
        }

        /// <summary>string — [u16 바이트 길이][UTF-8]. WireCheck.Str로 검사된 값만(짝 없는 서로게이트가 없어 대체 문자가 끼지 않는다).</summary>
        public static int Str(Span<byte> o, int off, string v)
        {
            int n = Encoding.UTF8.GetBytes(v.AsSpan(), o.Slice(off + 2));
            BinaryPrimitives.WriteUInt16LittleEndian(o.Slice(off), (ushort)n);
            return off + 2 + n;
        }
    }

    /// <summary>인코드 검사 — 생성 Size*가 쓴다. 통과한 값만 Write*가 쓴다.</summary>
    public static class WireCheck
    {
        private const int LenPrefixBytes = 2;

        /// <summary>f32 유한(NaN·±Inf 거부).</summary>
        public static void F32(float v, string path)
        {
            if (float.IsNaN(v) || float.IsInfinity(v)) throw new WireEncodeException(path, $"not a finite f32: {v}");
        }

        /// <summary>f64 유한(NaN·±Inf 거부).</summary>
        public static void F64(double v, string path)
        {
            if (double.IsNaN(v) || double.IsInfinity(v)) throw new WireEncodeException(path, $"not a finite f64: {v}");
        }

        /// <summary>필수 struct 값이 null이 아닌가. 통과하면 그대로 돌려준다.</summary>
        public static T NotNull<T>(T v, string path) where T : class
        {
            if (v == null) throw new WireEncodeException(path, "null (required)");
            return v;
        }

        /// <summary>디스패치(BodySize·WriteBody)의 페이로드 형 검사 — 다른 class·null이면 거부.</summary>
        public static T Payload<T>(object p, string path) where T : class
        {
            if (p is T t) return t;
            string got = p == null ? "null" : p.GetType().Name;
            throw new WireEncodeException(path, $"payload {got}, expected {typeof(T).Name}");
        }

        /// <summary>string의 인코딩 크기(길이 접두 포함) — null·짝 없는 서로게이트 거부, UTF-8 바이트 ≤ max.</summary>
        public static int Str(string v, int max, string path)
        {
            if (v == null) throw new WireEncodeException(path, "null string (required)");
            int n = WireUtf8.EncodedLength(v);
            if (n < 0) throw new WireEncodeException(path, "lone surrogate");
            if (n > max) throw new WireEncodeException(path, $"{n} UTF-8 bytes > max {max}");
            return LenPrefixBytes + n;
        }

        /// <summary>array 원소 수 min..max(null 거부). 원소 수를 돌려준다.</summary>
        public static int Count<T>(T[] a, int min, int max, string path)
        {
            if (a == null) throw new WireEncodeException(path, "null array (required)");
            if (a.Length < min || a.Length > max) throw new WireEncodeException(path, $"count {a.Length} outside [{min}, {max}]");
            return a.Length;
        }
    }

    /// <summary>엄격 UTF-8 — 서버 runtime.ts isValidUtf8과 같은 판정(RFC 3629 / Unicode 표 3-7 정형 바이트열, WHATWG TextDecoder fatal과 동치).</summary>
    public static class WireUtf8
    {
        /// <summary>overlong·서로게이트(U+D800–DFFF)·U+10FFFF 초과·잘린 열을 거부한다. BOM(EF BB BF)은 일반 문자.</summary>
        public static bool IsValid(ReadOnlySpan<byte> b)
        {
            int i = 0;
            while (i < b.Length)
            {
                if (b[i] < 0x80)
                {
                    i++;
                    continue;
                }
                int n = SeqLen(b, i);
                if (n == 0) return false;
                i += n;
            }
            return true;
        }

        /// <summary>UTF-16 문자열의 UTF-8 바이트 수 — 짝 없는 서로게이트가 있으면 -1(UTF-8로 옮길 수 없다).</summary>
        public static int EncodedLength(string s)
        {
            int n = 0;
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                if (c < 0x80) n += 1;
                else if (c < 0x800) n += 2;
                else if (char.IsHighSurrogate(c))
                {
                    if (i + 1 >= s.Length || !char.IsLowSurrogate(s[i + 1])) return -1;
                    n += 4;
                    i++;
                }
                else if (char.IsLowSurrogate(c)) return -1;
                else n += 3;
            }
            return n;
        }

        /// <summary>
        /// 짝 없는 서로게이트를 뺀 문자열(없으면 같은 인스턴스) — 바이너리 string 인코드가 거부하는 입력(글자 수 한도에 걸려 반쪽만 들어간
        /// 이모지 등)을 송신 전에 정리한다. 짝이 맞는 쌍은 그대로 둔다.
        /// </summary>
        public static string DropUnpairedSurrogates(string s)
        {
            if (s == null || EncodedLength(s) >= 0) return s;
            var sb = new StringBuilder(s.Length);
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                if (char.IsHighSurrogate(c) && i + 1 < s.Length && char.IsLowSurrogate(s[i + 1]))
                {
                    sb.Append(c).Append(s[i + 1]);
                    i++;
                }
                else if (!char.IsSurrogate(c)) sb.Append(c);
            }
            return sb.ToString();
        }

        private static bool Cont(ReadOnlySpan<byte> b, int i, int lo = 0x80, int hi = 0xbf)
        {
            if (i >= b.Length) return false;
            return b[i] >= lo && b[i] <= hi;
        }

        /// <summary>b[i](≥ 0x80)에서 시작하는 정형 다바이트 열의 길이, 아니면 0.</summary>
        private static int SeqLen(ReadOnlySpan<byte> b, int i)
        {
            int c = b[i];
            if (c >= 0xc2 && c <= 0xdf) return Cont(b, i + 1) ? 2 : 0;
            if (c >= 0xe0 && c <= 0xef)
            {
                int lo = c == 0xe0 ? 0xa0 : 0x80;
                int hi = c == 0xed ? 0x9f : 0xbf;
                return Cont(b, i + 1, lo, hi) && Cont(b, i + 2) ? 3 : 0;
            }
            if (c >= 0xf0 && c <= 0xf4)
            {
                int lo = c == 0xf0 ? 0x90 : 0x80;
                int hi = c == 0xf4 ? 0x8f : 0xbf;
                return Cont(b, i + 1, lo, hi) && Cont(b, i + 2) && Cont(b, i + 3) ? 4 : 0;
            }
            return 0;
        }
    }
}
