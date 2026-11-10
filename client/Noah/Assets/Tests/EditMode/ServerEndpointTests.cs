// 부트 화면 서버 주소 — 사람이 친 host:port 검사(ServerEndpoint)와 명령줄·빈 칸 규칙(ServerAddressSetting). 씬 없이 돈다(PlayerPrefs는
// 첫 부트 시험만 백업·복원해 쓴다). 시험 주소는 문서용 TEST-NET(RFC 5737).

#if UNITY_INCLUDE_TESTS
using System.Reflection;
using MMORPG.Net;
using MMORPG.UI;
using NUnit.Framework;
using UnityEngine;

namespace MMORPG.Tests.EditMode
{
    public sealed class ServerEndpointTests
    {
        [TestCase("127.0.0.1:9000", "127.0.0.1", 9000)]
        [TestCase("203.0.113.10", "203.0.113.10", ServerEndpoint.DefaultPort)]
        [TestCase("  host.example.com:9001 ", "host.example.com", 9001)]
        [TestCase("localhost", "localhost", ServerEndpoint.DefaultPort)]
        [TestCase("noah-test.asia-northeast3.example:65535", "noah-test.asia-northeast3.example", 65535)]
        [TestCase("0.0.0.0:1", "0.0.0.0", 1)]
        public void Accepts(string text, string host, int port)
        {
            Assert.That(ServerEndpoint.TryParse(text, out var ep, out string error), Is.True, error);
            Assert.That(ep.Host, Is.EqualTo(host));
            Assert.That(ep.Port, Is.EqualTo(port));
            Assert.That(error, Is.Null);
            Assert.That(ServerEndpoint.TryParse(ep.ToString(), out var again, out _), Is.True, "ToString round-trips");
            Assert.That(again.ToString(), Is.EqualTo(ep.ToString()));
        }

        [TestCase("")]
        [TestCase("   ")]
        [TestCase(null)]
        [TestCase(":9000")]
        [TestCase("1.2.3.4:0")]
        [TestCase("1.2.3.4:65536")]
        [TestCase("1.2.3.4:abc")]
        [TestCase("1.2.3.4:+90")]
        [TestCase("1.2.3.4:")]
        [TestCase("1.2.3.4:9000:1")]
        [TestCase("1.2.3.4:９０００")]
        [TestCase("::1")]
        [TestCase("[::1]:9000")]
        [TestCase("tcp://1.2.3.4:9000")]
        [TestCase("1.2.3.4/game")]
        [TestCase("999.1.1.1")]
        [TestCase("1.2.3")]
        [TestCase("1.2.3.4.5")]
        [TestCase("010.0.0.1")]
        [TestCase("-a.com")]
        [TestCase("a-.com")]
        [TestCase("a..b")]
        [TestCase("a_b.com")]
        [TestCase("서버.com")]
        [TestCase("1.2.3.4 :9000")]
        public void Rejects(string text)
        {
            Assert.That(ServerEndpoint.TryParse(text, out var ep, out string error), Is.False);
            Assert.That(ep, Is.Null);
            Assert.That(error, Is.Not.Empty, "a reason the player can read");
        }

        [Test]
        public void Rejects_OverlongLabelsAndHosts()
        {
            Assert.That(ServerEndpoint.TryParse(new string('a', 63) + ".com", out _, out _), Is.True);
            Assert.That(ServerEndpoint.TryParse(new string('a', 64) + ".com", out _, out _), Is.False);
            string host253 = string.Join(".", new string('a', 63), new string('b', 63), new string('c', 63), new string('d', 61));
            Assert.That(host253.Length, Is.EqualTo(253));
            Assert.That(ServerEndpoint.TryParse(host253, out _, out _), Is.True);
            Assert.That(ServerEndpoint.TryParse(host253 + "e", out _, out _), Is.False);
        }

        [Test]
        public void Ipv6_SaysItIsNotSupported()
        {
            ServerEndpoint.TryParse("::1", out _, out string error);
            Assert.That(error, Does.Contain("IPv6"));
        }

        [TestCase("-server=203.0.113.10:9001", "203.0.113.10:9001")]
        [TestCase("-SERVER=localhost", "localhost:9000")]
        public void Args_GiveTheAddress(string arg, string expected)
        {
            Assert.That(ServerAddressSetting.TryFromArgs(new[] { "Noah.exe", arg }, out var ep), Is.True);
            Assert.That(ep.ToString(), Is.EqualTo(expected));
        }

        [Test]
        public void Args_IgnoreOtherFlagsAndBadValues_LastValidWins()
        {
            Assert.That(ServerAddressSetting.TryFromArgs(null, out _), Is.False);
            Assert.That(ServerAddressSetting.TryFromArgs(new[] { "-batchmode", "-autoReconnect=0" }, out _), Is.False);
            Assert.That(ServerAddressSetting.TryFromArgs(new[] { "-serverX=1.2.3.4" }, out _), Is.False, "another flag");
            Assert.That(ServerAddressSetting.TryFromArgs(new[] { "-server" }, out _), Is.False, "needs a value");
            Assert.That(ServerAddressSetting.TryFromArgs(new[] { "-server=nope:0" }, out _), Is.False);
            Assert.That(ServerAddressSetting.TryFromArgs(new[] { "-server=1.1.1.1", "-server=junk:0", "-server=2.2.2.2:9002" }, out var ep), Is.True);
            Assert.That(ep.ToString(), Is.EqualTo("2.2.2.2:9002"));
            Assert.That(ServerAddressSetting.TryFromArgs(new[] { "-server=1.1.1.1", "-server=junk:0" }, out ep), Is.True);
            Assert.That(ep.ToString(), Is.EqualTo("1.1.1.1:9000"));
        }

        [Test]
        public void InitialText_UsesTheCommandLineOnlyOnTheFirstBoot()
        {
            var flag = typeof(ServerAddressSetting).GetField("_argsConsumed", BindingFlags.Static | BindingFlags.NonPublic);
            object consumed = flag.GetValue(null);
            bool had = PlayerPrefs.HasKey(ServerAddressSetting.PrefKey);
            string saved = PlayerPrefs.GetString(ServerAddressSetting.PrefKey, "");
            try
            {
                PlayerPrefs.SetString(ServerAddressSetting.PrefKey, "198.51.100.7:9002");
                flag.SetValue(null, false);
                var args = new[] { "Noah.exe", "-server=203.0.113.10:9001" };
                Assert.That(ServerAddressSetting.InitialText(args), Is.EqualTo("203.0.113.10:9001"), "first boot: the command line");
                Assert.That(ServerAddressSetting.InitialText(args), Is.EqualTo("198.51.100.7:9002"), "boot again after a kick: the saved choice");
            }
            finally
            {
                flag.SetValue(null, consumed);
                if (had) PlayerPrefs.SetString(ServerAddressSetting.PrefKey, saved); else PlayerPrefs.DeleteKey(ServerAddressSetting.PrefKey);
                PlayerPrefs.Save();
            }
        }

        [Test]
        public void Choose_EmptyFieldUsesTheFallback_TextIsChecked()
        {
            var fallback = ServerEndpoint.Loopback(9000);
            Assert.That(ServerAddressSetting.TryChoose("", fallback, out var ep, out _), Is.True);
            Assert.That(ep, Is.SameAs(fallback));
            Assert.That(ServerAddressSetting.TryChoose("  ", fallback, out ep, out _), Is.True);
            Assert.That(ep, Is.SameAs(fallback));
            Assert.That(ServerAddressSetting.TryChoose("10.0.0.5:9003", fallback, out ep, out _), Is.True);
            Assert.That(ep.ToString(), Is.EqualTo("10.0.0.5:9003"));
            Assert.That(ServerAddressSetting.TryChoose("10.0.0.5:0", fallback, out ep, out string error), Is.False);
            Assert.That(ep, Is.Null);
            Assert.That(error, Does.Contain("포트"));
        }
    }
}
#endif
