// 교차 언어 바이너리 코덱 골든 — tools/codegen/golden.ts가 참조 인터프리터(refCodec)로 만든 Tests/EditMode/Golden/wire.golden.json으로
// 생성 C# 코덱(실물 MMORPG.Net.Generated.WireCodec + 합성 스키마 WireFixture.WireCodec)과 런타임(WireReader·WireUtf8)을 검사한다.
// 서버 TS 코덱은 같은 파일을 tests/server/codegen/wireGolden.test.ts가 본다 — 두 언어가 같은 바이트·같은 첫 위반 사유를 낸다.
//   유효 사례: Decode(hex) = payload(필드별, float은 비트 일치), Encode(payload) = hex, Encode(Decode(hex)) = hex.
//   오류 사례: Decode(hex) = null + 같은 WireError.
// 골든 갱신: `cd tools/codegen && bun run gen`(gen --check가 재생성 누락을 CI에서 잡는다).
// JSON은 Newtonsoft(JToken)로 읽는다 — payload의 필드 집합이 사례마다 달라(optional 생략) JsonUtility로는 못 읽는다.
// 골든은 Resources가 아니라 시험 폴더에 두고 AssetDatabase로 읽는다 — 패킷 flip마다 커지는 시험 데이터가 플레이어 빌드에 실리지 않게.
// payload 표현: float = IEEE 비트 문자열("0x…"), enum = 값 이름(camelCase → C# PascalCase 멤버), optional 부재 = 키 없음(= null).

#if UNITY_INCLUDE_TESTS
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using MMORPG.Net;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using Fixture = MMORPG.Tests.EditMode.WireFixture;
using Real = MMORPG.Net.Generated;

namespace MMORPG.Tests.EditMode
{
    public sealed class WireCodecGoldenTests
    {
        private delegate object DecodeFn(ushort id, ReadOnlySpan<byte> body, out WireError error);

        /// <summary>스키마 하나의 생성 코덱 진입점 + 페이로드 class를 찾을 네임스페이스.</summary>
        private sealed class Codec
        {
            public Assembly Assembly;
            public string Namespace;
            public DecodeFn Decode;
            public Func<ushort, object, byte[]> Encode;
        }

        private const int MaxReported = 20;
        private const string GoldenAssetPath = "Assets/Tests/EditMode/Golden/wire.golden.json";

        private static JObject _golden;

        private static Codec CodecOf(string label)
        {
            if (label == "real")
            {
                return new Codec
                {
                    Assembly = typeof(Real.WireCodec).Assembly,
                    Namespace = typeof(Real.WireCodec).Namespace,
                    Decode = Real.WireCodec.Decode,
                    Encode = Real.WireCodec.Encode,
                };
            }
            return new Codec
            {
                Assembly = typeof(Fixture.WireCodec).Assembly,
                Namespace = typeof(Fixture.WireCodec).Namespace,
                Decode = Fixture.WireCodec.Decode,
                Encode = Fixture.WireCodec.Encode,
            };
        }

        private static JObject Golden()
        {
            if (_golden != null) return _golden;
            var ta = AssetDatabase.LoadAssetAtPath<TextAsset>(GoldenAssetPath);
            Assert.IsNotNull(ta, $"{GoldenAssetPath} 누락 — `cd tools/codegen && bun run gen` 실행 필요");
            // 날짜처럼 생긴 문자열 payload가 DateTime으로 바뀌지 않게 날짜 파싱을 끈다.
            using (var reader = new JsonTextReader(new StringReader(ta.text)) { DateParseHandling = DateParseHandling.None })
                _golden = JObject.Load(reader);
            return _golden;
        }

        private static JObject Schema(string label) => (JObject)Golden()["schemas"][label];

        [Test]
        public void ErrorCodes_MatchServer()
        {
            var errors = (JObject)Golden()["errors"];
            foreach (var kv in errors)
            {
                var parsed = (WireError)Enum.Parse(typeof(WireError), kv.Key);
                Assert.AreEqual(kv.Value.Value<int>(), (int)parsed, $"WireError.{kv.Key}");
            }
            Assert.AreEqual(errors.Count + 1, Enum.GetValues(typeof(WireError)).Length, "WireError 값 수(None 포함)가 서버 WIRE_ERROR와 다르다");
        }

        [Test]
        public void Utf8Validator_MatchesWhatwg()
        {
            var failures = new List<string>();
            foreach (var row in (JArray)Golden()["utf8"])
            {
                string hex = row[0].Value<string>();
                bool expected = row[1].Value<bool>();
                if (WireUtf8.IsValid(FromHex(hex)) != expected) failures.Add($"{hex}: expected {expected}");
            }
            AssertNoFailures(failures);
        }

        /// <summary>패킷 표의 모든 id에 생성 디코더가 있다(B6 — 모든 패킷이 바이너리, 표에 encoding 열 없음): 빈 본문은 값 또는 위반 사유, 스키마 밖 id만 null + None.</summary>
        [TestCase("real")]
        [TestCase("fixture")]
        public void Decode_CoversEverySchemaPacket(string label)
        {
            var codec = CodecOf(label);
            foreach (var p in (JArray)Schema(label)["packets"])
            {
                Assert.IsNull(p["encoding"], p["name"].Value<string>());
                object v = codec.Decode(p["id"].Value<ushort>(), Array.Empty<byte>(), out var err);
                Assert.That(v != null || err != WireError.None, Is.True, p["name"].Value<string>());
            }
            Assert.IsNull(codec.Decode(0xbeef, Array.Empty<byte>(), out var unknownErr));
            Assert.AreEqual(WireError.None, unknownErr);
        }

        [TestCase("real")]
        [TestCase("fixture")]
        public void ValidCases_DecodeAndEncode(string label)
        {
            var codec = CodecOf(label);
            var types = PayloadTypes(label, codec);
            var failures = new List<string>();
            int n = 0;
            foreach (JObject c in (JArray)Schema(label)["cases"])
            {
                if (c["payload"] == null) continue;
                n++;
                string f = Guard(c, () => CheckValid(codec, types, c));
                if (f != null) failures.Add(f);
            }
            Assert.Greater(n, 0, "유효 사례 0건");
            AssertNoFailures(failures);
        }

        [TestCase("real")]
        [TestCase("fixture")]
        public void ErrorCases_DecodeFails(string label)
        {
            var codec = CodecOf(label);
            var failures = new List<string>();
            int n = 0;
            foreach (JObject c in (JArray)Schema(label)["cases"])
            {
                if (c["error"] == null) continue;
                n++;
                string f = Guard(c, () => CheckError(codec, c));
                if (f != null) failures.Add(f);
            }
            Assert.Greater(n, 0, "오류 사례 0건");
            AssertNoFailures(failures);
        }

        /// <summary>인코드 검사 — C# 타입이 표현할 수 있는 위반(정수 범위는 필드 타입이 막는다)은 WireEncodeException, 경로는 &lt;패킷|struct&gt;.&lt;필드&gt;.</summary>
        [Test]
        public void Encode_RejectsInvalidValues()
        {
            Rejects(() => Fixture.WireCodec.EncodeAllPrims(Prims("a\uDC00")), "ALL_PRIMS.s");
            Rejects(() => Fixture.WireCodec.EncodeAllPrims(Prims("a\uD83D")), "ALL_PRIMS.s");
            Rejects(() => Fixture.WireCodec.EncodeAllPrims(Prims(new string('a', 17))), "ALL_PRIMS.s");
            Rejects(() => Fixture.WireCodec.EncodeAllPrims(Prims("\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600")), "ALL_PRIMS.s");
            Rejects(() => Fixture.WireCodec.EncodeAllPrims(Prims(null)), "ALL_PRIMS.s");
            var nanG = Prims("x");
            nanG.G = float.NaN;
            Rejects(() => Fixture.WireCodec.EncodeAllPrims(nanG), "ALL_PRIMS.g");
            var infH = Prims("x");
            infH.H = double.NegativeInfinity;
            Rejects(() => Fixture.WireCodec.EncodeAllPrims(infH), "ALL_PRIMS.h");
            Rejects(() => Fixture.WireCodec.EncodeOpts(new Fixture.OptsPayload { O3 = (Fixture.Kind)99 }), "OPTS.o3");
            Rejects(() => Fixture.WireCodec.EncodeOpts(new Fixture.OptsPayload { O7 = double.PositiveInfinity }), "OPTS.o7");
            Rejects(() => Fixture.WireCodec.EncodeOpts(new Fixture.OptsPayload { O5 = new ushort[4] }), "OPTS.o5");
            Assert.AreEqual(Fixture.WireCodec.EncodeAllPrims(Prims("\U0001F600\U0001F600\U0001F600\U0001F600")).Length, 27 + 2 + 16, "서로게이트 쌍 = 4바이트");
        }

        [Test]
        public void Encode_RejectsBadArraysStructsAndDispatch()
        {
            Rejects(() => Fixture.WireCodec.EncodeWorld(World(w => w.Names = new string[0])), "WORLD.names");
            Rejects(() => Fixture.WireCodec.EncodeWorld(World(w => w.Names = new[] { "a", "b", "c", "d", "e", "f" })), "WORLD.names");
            Rejects(() => Fixture.WireCodec.EncodeWorld(World(w => w.Names = new[] { new string('n', 13) })), "WORLD.names");
            Rejects(() => Fixture.WireCodec.EncodeWorld(World(w => w.Kinds = new Fixture.Kind[4])), "WORLD.kinds");
            Rejects(() => Fixture.WireCodec.EncodeWorld(World(w => w.Entities = null)), "WORLD.entities");
            Rejects(() => Fixture.WireCodec.EncodeWorld(World(w => w.Entities = new Fixture.Entity[1])), "WORLD.entities");
            Rejects(() => Fixture.WireCodec.EncodeWorld(World(w => w.Entities = new[] { new Fixture.Entity { Kind = Fixture.Kind.Npc } })), "Entity.pos");
            Rejects(() => Fixture.WireCodec.EncodeWorld(World(w => w.Wide = (Fixture.Wide)1)), "WORLD.wide");
            Rejects(() => Fixture.WireCodec.Encode(0x16, new Fixture.EmptyBinPayload()), "packet 0x16");
            Rejects(() => Fixture.WireCodec.Encode(Fixture.PacketIds.WORLD, new Fixture.OptsPayload()), "WORLD");
            Rejects(() => Real.WireCodec.Encode(Real.PacketIds.SNAPSHOT_DELTA, null), "SNAPSHOT_DELTA");
            var copy = World(w => { });
            CollectionAssert.AreEqual(Fixture.WireCodec.EncodeWorld(copy), Fixture.WireCodec.Encode(Fixture.PacketIds.WORLD_COPY, ToCopy(copy)), "bodyOf = 대상과 같은 바이트");
        }

        // ── 사례 판정 ──

        private static Dictionary<string, Type> PayloadTypes(string label, Codec codec)
        {
            var map = new Dictionary<string, Type>();
            foreach (var p in (JArray)Schema(label)["packets"])
            {
                string fullName = codec.Namespace + "." + p["payloadType"].Value<string>();
                var t = codec.Assembly.GetType(fullName);
                Assert.IsNotNull(t, $"페이로드 class 없음: {fullName}");
                map[p["name"].Value<string>()] = t;
            }
            return map;
        }

        private static string CheckValid(Codec codec, Dictionary<string, Type> types, JObject c)
        {
            ushort id = c["id"].Value<ushort>();
            string hex = c["hex"].Value<string>();
            var expected = Build(c["payload"], types[c["packet"].Value<string>()]);
            var decoded = codec.Decode(id, FromHex(hex), out var err);
            if (decoded == null) return $"decode 실패 {err}";
            string diff = Diff(expected, decoded, "payload");
            if (diff != null) return diff;
            string encoded = ToHex(codec.Encode(id, expected));
            if (encoded != hex) return $"encode(payload) {encoded} ≠ {hex}";
            string again = ToHex(codec.Encode(id, decoded));
            return again == hex ? null : $"encode(decode(hex)) {again} ≠ {hex}";
        }

        private static string CheckError(Codec codec, JObject c)
        {
            string expected = c["error"].Value<string>();
            var decoded = codec.Decode(c["id"].Value<ushort>(), FromHex(c["hex"].Value<string>()), out var err);
            if (decoded != null) return $"디코드 성공 — 기대 {expected}";
            return err.ToString() == expected ? null : $"사유 {err} ≠ {expected}";
        }

        private static string Guard(JObject c, Func<string> check)
        {
            string name = c["name"].Value<string>();
            try
            {
                string f = check();
                return f == null ? null : $"{name}: {f}";
            }
            catch (Exception e)
            {
                return $"{name}: {e.GetType().Name} {e.Message}";
            }
        }

        private static void AssertNoFailures(List<string> failures)
        {
            if (failures.Count == 0) return;
            var shown = failures.GetRange(0, Math.Min(failures.Count, MaxReported));
            Assert.Fail($"{failures.Count}건 불일치:\n{string.Join("\n", shown)}");
        }

        private static void Rejects(TestDelegate encode, string pathPrefix)
        {
            var e = Assert.Throws<WireEncodeException>(encode);
            StringAssert.StartsWith(pathPrefix, e.Path);
        }

        // ── 골든 payload → C# 객체(리플렉션) ──

        private static object Build(JToken tok, Type t)
        {
            var under = Nullable.GetUnderlyingType(t);
            if (under != null) return Build(tok, under);
            if (t == typeof(string)) return tok.Value<string>();
            if (t == typeof(bool)) return tok.Value<bool>();
            if (t == typeof(float)) return BitConverter.Int32BitsToSingle(unchecked((int)ParseBits(tok, 8)));
            if (t == typeof(double)) return BitConverter.Int64BitsToDouble(unchecked((long)ParseBits(tok, 16)));
            if (t.IsEnum) return Enum.Parse(t, Pascal(tok.Value<string>()));
            if (t.IsPrimitive) return Convert.ChangeType(tok.Value<long>(), t, CultureInfo.InvariantCulture);
            if (t.IsArray) return BuildArray((JArray)tok, t.GetElementType());
            return BuildObject((JObject)tok, t);
        }

        private static Array BuildArray(JArray arr, Type elem)
        {
            var a = Array.CreateInstance(elem, arr.Count);
            for (int i = 0; i < arr.Count; i++) a.SetValue(Build(arr[i], elem), i);
            return a;
        }

        private static object BuildObject(JObject obj, Type t)
        {
            var o = Activator.CreateInstance(t);
            foreach (var prop in obj.Properties())
            {
                var f = t.GetField(Pascal(prop.Name), BindingFlags.Public | BindingFlags.Instance);
                if (f == null) throw new InvalidOperationException($"{t.Name}에 골든 키 {prop.Name}의 필드가 없다");
                f.SetValue(o, Build(prop.Value, f.FieldType));
            }
            return o;
        }

        /// <summary>float 비트 문자열 "0x" + digits자리 hex.</summary>
        private static ulong ParseBits(JToken tok, int digits)
        {
            string s = tok.Value<string>();
            if (s == null || s.Length != 2 + digits || !s.StartsWith("0x", StringComparison.Ordinal)) throw new FormatException($"float 비트 문자열 아님: {s}");
            return ulong.Parse(s.Substring(2), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture);
        }

        /// <summary>스키마 camelCase 이름 → 코드젠 C# PascalCase(첫 글자만 대문자 — names.ts toPascalCase와 같다).</summary>
        private static string Pascal(string camel) => char.ToUpperInvariant(camel[0]) + camel.Substring(1);

        // ── 깊은 비교(float은 비트) ──

        private static string Diff(object e, object a, string path)
        {
            if (e == null || a == null) return e == null && a == null ? null : $"{path}: 기대 {Show(e)}, 실제 {Show(a)}";
            var t = e.GetType();
            if (t != a.GetType()) return $"{path}: 형 {t.Name} ≠ {a.GetType().Name}";
            if (e is float fe) return BitConverter.SingleToInt32Bits(fe) == BitConverter.SingleToInt32Bits((float)a) ? null : $"{path}: f32 {fe:R} ≠ {(float)a:R}";
            if (e is double de) return BitConverter.DoubleToInt64Bits(de) == BitConverter.DoubleToInt64Bits((double)a) ? null : $"{path}: f64 {de:R} ≠ {(double)a:R}";
            if (e is Array ea) return DiffArray(ea, (Array)a, path);
            if (t.IsPrimitive || t.IsEnum || e is string) return Equals(e, a) ? null : $"{path}: 기대 {Show(e)}, 실제 {Show(a)}";
            foreach (var f in t.GetFields(BindingFlags.Public | BindingFlags.Instance))
            {
                string d = Diff(f.GetValue(e), f.GetValue(a), $"{path}.{f.Name}");
                if (d != null) return d;
            }
            return null;
        }

        private static string DiffArray(Array e, Array a, string path)
        {
            if (e.Length != a.Length) return $"{path}: 길이 {e.Length} ≠ {a.Length}";
            for (int i = 0; i < e.Length; i++)
            {
                string d = Diff(e.GetValue(i), a.GetValue(i), $"{path}[{i}]");
                if (d != null) return d;
            }
            return null;
        }

        private static string Show(object v) => v == null ? "null" : v is string s ? $"\"{s}\"" : v.ToString();

        // ── 보조 ──

        private static byte[] FromHex(string hex)
        {
            var b = new byte[hex.Length / 2];
            for (int i = 0; i < b.Length; i++) b[i] = byte.Parse(hex.Substring(2 * i, 2), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture);
            return b;
        }

        private static string ToHex(byte[] b) => BitConverter.ToString(b).Replace("-", string.Empty).ToLowerInvariant();

        private static Fixture.AllPrimsPayload Prims(string s) => new Fixture.AllPrimsPayload { A = 1, B = 2, C = 3, D = -4, E = -5, F = -6, G = 1.5f, H = -2.25, I = true, S = s };

        private static Fixture.WorldPayload World(Action<Fixture.WorldPayload> edit)
        {
            var w = new Fixture.WorldPayload
            {
                Tick = 9,
                Entities = new Fixture.Entity[0],
                Names = new[] { "a" },
                Kinds = new[] { Fixture.Kind.Player, Fixture.Kind.Monster },
                Wide = Fixture.Wide.Hi,
                Huge = Fixture.Huge.Big,
                Flags = new[] { true, false },
            };
            edit(w);
            return w;
        }

        private static Fixture.WorldCopyPayload ToCopy(Fixture.WorldPayload w) => new Fixture.WorldCopyPayload
        {
            Tick = w.Tick,
            Entities = w.Entities,
            Names = w.Names,
            Kinds = w.Kinds,
            Wide = w.Wide,
            Huge = w.Huge,
            Flags = w.Flags,
        };
    }
}
#endif
