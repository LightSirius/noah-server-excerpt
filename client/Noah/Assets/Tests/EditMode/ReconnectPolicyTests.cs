// 자동 재접속 정책(순수 C#) — 분류는 (KICK reason 또는 없음, 단계)만 본다. detail 문자열은 입력에조차 없다.
// 표의 단일 진실은 이 시험이다: 사유·단계를 바꾸려면 여기 행을 먼저 바꾼다.

#if UNITY_INCLUDE_TESTS
using MMORPG.Net;
using NUnit.Framework;

namespace MMORPG.Tests.EditMode
{
    public sealed class ReconnectPolicyTests
    {
        private const ReconnectClass Bl = ReconnectClass.Blip;
        private const ReconnectClass Rs = ReconnectClass.Restart;
        private const ReconnectClass Bu = ReconnectClass.Busy;
        private const ReconnectClass Sh = ReconnectClass.Shed;
        private const ReconnectClass Fa = ReconnectClass.Fatal;

        // 열 순서 = Steps.
        private static readonly ReconnectStep[] Steps =
        {
            ReconnectStep.InWorld, ReconnectStep.Connect, ReconnectStep.AwaitHelloAck,
            ReconnectStep.AwaitAuth, ReconnectStep.AwaitEnterWorld,
        };

        // KICK reason 0..10(+ 음수·큰 값) × 단계. 3 Idle은 일시적, 6은 재기동, 9는 인월드면 감축(Shed)·복구 중이면 혼잡(Busy), 나머지·미지는 치명.
        private static readonly (int reason, ReconnectClass[] row)[] KickTable =
        {
            (-1, new[] { Fa, Fa, Fa, Fa, Fa }),
            (0,  new[] { Fa, Fa, Fa, Fa, Fa }),
            (1,  new[] { Fa, Fa, Fa, Fa, Fa }),
            (2,  new[] { Fa, Fa, Fa, Fa, Fa }),
            (3,  new[] { Bl, Bl, Bl, Bl, Bl }),
            (4,  new[] { Fa, Fa, Fa, Fa, Fa }),
            (5,  new[] { Fa, Fa, Fa, Fa, Fa }),
            (6,  new[] { Rs, Rs, Rs, Rs, Rs }),
            (7,  new[] { Fa, Fa, Fa, Fa, Fa }),
            (8,  new[] { Fa, Fa, Fa, Fa, Fa }),
            (9,  new[] { Sh, Bu, Bu, Bu, Bu }),
            (10, new[] { Fa, Fa, Fa, Fa, Fa }),
            (255, new[] { Fa, Fa, Fa, Fa, Fa }),
        };

        [Test]
        public void Kick_ClassifiedByReasonAndStepOnly()
        {
            foreach (var (reason, row) in KickTable)
            {
                for (int i = 0; i < Steps.Length; i++)
                {
                    var got = ReconnectPolicy.Classify(ReconnectTrigger.Kick(reason), Steps[i]);
                    Assert.That(got, Is.EqualTo(row[i]), $"KICK {reason} @ {Steps[i]}");
                }
            }
        }

        // KICK 없는 원인 × 단계. HELLO_ACK 전에 닫히면(Windows는 맨 RST로 올 수 있다) 접속 거절로 보고 혼잡 백오프.
        private static readonly (ReconnectTrigger trigger, ReconnectClass[] row)[] NonKickTable =
        {
            (ReconnectTrigger.Closed,            new[] { Bl, Bu, Bu, Bl, Bl }),
            (ReconnectTrigger.PongTimeout,       new[] { Bl, Bl, Bl, Bl, Bl }),
            (ReconnectTrigger.ConnectFailed,     new[] { Bl, Bl, Bl, Bl, Bl }),
            (ReconnectTrigger.StepTimeout,       new[] { Bl, Bl, Bl, Bl, Bl }),
            (ReconnectTrigger.AccountMismatch,   new[] { Fa, Fa, Fa, Fa, Fa }),
            (ReconnectTrigger.CharacterMismatch, new[] { Fa, Fa, Fa, Fa, Fa }),
        };

        [Test]
        public void NonKickCauses_ClassifiedByStep()
        {
            foreach (var (trigger, row) in NonKickTable)
            {
                for (int i = 0; i < Steps.Length; i++)
                {
                    var got = ReconnectPolicy.Classify(trigger, Steps[i]);
                    Assert.That(got, Is.EqualTo(row[i]), $"{trigger} @ {Steps[i]}");
                }
            }
        }

        // AUTH_RESULT ok=false — ServerErr(4)만 일시적(클라가 스스로 소켓을 내린다), 나머지(토큰 거절·만료·미지 코드)는 치명.
        [TestCase(0, ReconnectClass.Fatal)]
        [TestCase(1, ReconnectClass.Fatal)]
        [TestCase(2, ReconnectClass.Fatal)]
        [TestCase(3, ReconnectClass.Fatal)]
        [TestCase(4, ReconnectClass.Blip)]
        [TestCase(5, ReconnectClass.Fatal)]
        public void AuthFailure_OnlyServerErrIsTransient(int errCode, ReconnectClass expected)
        {
            Assert.That(ReconnectPolicy.Classify(ReconnectTrigger.AuthFailed(errCode), ReconnectStep.AwaitAuth), Is.EqualTo(expected));
        }

        // ── 백오프(full jitter: floor + U(0, min(cap, base·2^n))) ─────────────────────────────

        private static readonly FakeReconnectRandom Low = new FakeReconnectRandom(0.0);
        private static readonly FakeReconnectRandom High = new FakeReconnectRandom(1.0 - 1e-12);

        private static void AssertRange(double lo, double hi, double atLow, double atHigh, string what)
        {
            Assert.That(atLow, Is.EqualTo(lo).Within(1e-9), $"{what} 하한");
            Assert.That(atHigh, Is.LessThan(hi).And.GreaterThan(hi - 1e-6), $"{what} 상한");
        }

        // 첫 시도 범위: Blip U(0,5) / PONG 감시 Blip U(0,10) / Restart U(1,6) / Shed U(30,60) / Busy(복구를 시작할 수 없지만 정의는 n=0 공식) U(5,10).
        [TestCase(ReconnectClass.Blip, false, 0.0, 5.0)]
        [TestCase(ReconnectClass.Blip, true, 0.0, 10.0)]
        [TestCase(ReconnectClass.Restart, false, 1.0, 6.0)]
        [TestCase(ReconnectClass.Restart, true, 1.0, 6.0)]
        [TestCase(ReconnectClass.Shed, false, 30.0, 60.0)]
        [TestCase(ReconnectClass.Busy, false, 5.0, 10.0)]
        public void FirstDelay_RangePerClass(ReconnectClass cls, bool afterWatchdog, double lo, double hi)
        {
            AssertRange(lo, hi,
                ReconnectPolicy.FirstDelaySec(cls, afterWatchdog, Low),
                ReconnectPolicy.FirstDelaySec(cls, afterWatchdog, High), $"{cls} watchdog={afterWatchdog}");
        }

        // 재시도 n ≥ 1: Blip floor 0.5 base 1 cap 10 / Restart 0.5·1·15 / Busy 5·5·60 / Shed 30·30·120.
        [TestCase(ReconnectClass.Blip, 1, 0.5, 2.5)]
        [TestCase(ReconnectClass.Blip, 2, 0.5, 4.5)]
        [TestCase(ReconnectClass.Blip, 3, 0.5, 8.5)]
        [TestCase(ReconnectClass.Blip, 4, 0.5, 10.5)]
        [TestCase(ReconnectClass.Blip, 60, 0.5, 10.5)]
        [TestCase(ReconnectClass.Restart, 1, 0.5, 2.5)]
        [TestCase(ReconnectClass.Restart, 3, 0.5, 8.5)]
        [TestCase(ReconnectClass.Restart, 4, 0.5, 15.5)]
        [TestCase(ReconnectClass.Restart, 60, 0.5, 15.5)]
        [TestCase(ReconnectClass.Busy, 1, 5.0, 15.0)]
        [TestCase(ReconnectClass.Busy, 2, 5.0, 25.0)]
        [TestCase(ReconnectClass.Busy, 3, 5.0, 45.0)]
        [TestCase(ReconnectClass.Busy, 4, 5.0, 65.0)]
        [TestCase(ReconnectClass.Busy, 60, 5.0, 65.0)]
        [TestCase(ReconnectClass.Shed, 1, 30.0, 90.0)]
        [TestCase(ReconnectClass.Shed, 2, 30.0, 150.0)]
        [TestCase(ReconnectClass.Shed, 60, 30.0, 150.0)]
        public void RetryDelay_FullJitterWithFloorAndCap(ReconnectClass cls, int retry, double lo, double hi)
        {
            AssertRange(lo, hi,
                ReconnectPolicy.RetryDelaySec(cls, retry, Low),
                ReconnectPolicy.RetryDelaySec(cls, retry, High), $"{cls} n={retry}");
        }

        [Test]
        public void RetryDelay_SeededDrawsStayInBoundsAndSpread()
        {
            var rng = new SystemReconnectRandom(1234);
            foreach (var cls in new[] { ReconnectClass.Blip, ReconnectClass.Restart, ReconnectClass.Busy, ReconnectClass.Shed })
            {
                for (int n = 1; n <= 6; n++)
                {
                    double lo = ReconnectPolicy.RetryDelaySec(cls, n, Low);
                    double hi = ReconnectPolicy.RetryDelaySec(cls, n, High);
                    double min = double.MaxValue, max = double.MinValue;
                    for (int i = 0; i < 500; i++)
                    {
                        double d = ReconnectPolicy.RetryDelaySec(cls, n, rng);
                        Assert.That(d, Is.InRange(lo, hi), $"{cls} n={n}");
                        if (d < min) min = d;
                        if (d > max) max = d;
                    }
                    Assert.That(max - min, Is.GreaterThan((hi - lo) * 0.8), $"{cls} n={n} 지터가 범위를 덮어야 한다");
                }
            }
        }

        [Test]
        public void SeededRandom_IsDeterministic()
        {
            var a = new SystemReconnectRandom(42);
            var b = new SystemReconnectRandom(42);
            for (int i = 0; i < 20; i++) Assert.That(a.NextUnit(), Is.EqualTo(b.NextUnit()));
        }

        [Test]
        public void UnpredictableRandom_DiffersPerInstance()
        {
            // 운영 난수는 클라마다 다른 시드 — 같은 순간 끊긴 클라들의 재시도가 줄을 서지 않는다.
            var a = SystemReconnectRandom.CreateUnpredictable();
            var b = SystemReconnectRandom.CreateUnpredictable();
            bool differs = false;
            for (int i = 0; i < 8 && !differs; i++) differs = a.NextUnit() != b.NextUnit();
            Assert.That(differs, Is.True);
        }

        [Test]
        public void Delay_RejectsFatalAndRetryBelowOne()
        {
            Assert.Throws<System.ArgumentOutOfRangeException>(() => ReconnectPolicy.FirstDelaySec(ReconnectClass.Fatal, false, Low));
            Assert.Throws<System.ArgumentOutOfRangeException>(() => ReconnectPolicy.RetryDelaySec(ReconnectClass.Fatal, 1, Low));
            Assert.Throws<System.ArgumentOutOfRangeException>(() => ReconnectPolicy.RetryDelaySec(ReconnectClass.Blip, 0, Low));
        }

        // ── 창·단계 시간 초과·생존 ─────────────────────────────────────────────

        [Test]
        public void Window_FixedByStartingClass()
        {
            Assert.That(ReconnectPolicy.WindowSec(ReconnectClass.Blip), Is.EqualTo(90.0));
            Assert.That(ReconnectPolicy.WindowSec(ReconnectClass.Restart), Is.EqualTo(180.0));
            Assert.That(ReconnectPolicy.WindowSec(ReconnectClass.Shed), Is.EqualTo(300.0));
            Assert.That(ReconnectPolicy.WindowSec(ReconnectClass.Fatal), Is.EqualTo(0.0));
            // 유령 세션이 서버 인월드 idle 컷(IN_WORLD_IDLE_SEC 기본 60초)으로 풀리기 전에 창이 끝나면 재접속이 상한에 막혀 포기한다.
            Assert.That(ReconnectPolicy.WindowSec(ReconnectClass.Blip), Is.GreaterThanOrEqualTo(ReconnectPolicy.ServerInWorldIdleCutSec));
            Assert.That(ReconnectPolicy.WindowSec(ReconnectClass.Busy), Is.GreaterThanOrEqualTo(ReconnectPolicy.ServerInWorldIdleCutSec));
        }

        [Test]
        public void FitsWindow_AttemptMustStartInsideTheWindow()
        {
            Assert.That(ReconnectPolicy.FitsWindow(100.0, 190.0, ReconnectClass.Blip), Is.True);
            Assert.That(ReconnectPolicy.FitsWindow(100.0, 190.001, ReconnectClass.Blip), Is.False);
            Assert.That(ReconnectPolicy.FitsWindow(100.0, 280.0, ReconnectClass.Restart), Is.True);
            Assert.That(ReconnectPolicy.FitsWindow(100.0, 100.0, ReconnectClass.Fatal), Is.False);
        }

        [TestCase(-1, 15.0)]
        [TestCase(0, 15.0)]
        [TestCase(1, 30.0)]
        [TestCase(2, 60.0)]
        [TestCase(3, 60.0)]
        [TestCase(50, 60.0)]
        public void StepTimeout_GrowsWithAttemptThenCaps(int attemptIndex, double expected)
        {
            Assert.That(ReconnectPolicy.StepTimeoutSec(attemptIndex), Is.EqualTo(expected));
        }

        // PONG = 서버가 살아 있지만 느리다 → 단계 기한을 now + timeout으로 민다, 단 단계 시작 + 2 × timeout을 넘지 않고 줄지도 않는다.
        [TestCase(10.0, 15.0, 25.0)]
        [TestCase(20.0, 25.0, 30.0)]
        [TestCase(29.0, 30.0, 30.0)]
        [TestCase(3.0, 15.0, 18.0)]
        [TestCase(1.0, 25.0, 25.0)]
        public void DeadlineAfterProgress_SlidesButNeverBeyondTwiceTheTimeout(double now, double deadline, double expected)
        {
            Assert.That(ReconnectPolicy.DeadlineAfterProgress(0.0, deadline, now, 15.0), Is.EqualTo(expected));
        }

        [Test]
        public void Liveness_HintBeforeWatchdog()
        {
            Assert.That(ReconnectPolicy.UnstablePongAgeSec, Is.EqualTo(5.0));
            Assert.That(ReconnectPolicy.WatchdogPongAgeSec, Is.EqualTo(45.0));
        }

        // 복구 중 송신 허용 목록은 정확히 PING·HELLO·AUTH_REQ·ENTER_WORLD_REQ — 인증 전 버킷(10개)을 다른 패킷이 쓰면 KICK 5(치명).
        [Test]
        public void RecoverySendAllowList_IsExactlyHandshakePlusPing()
        {
            var allowed = new System.Collections.Generic.List<string>();
            foreach (var f in typeof(MMORPG.Net.Generated.PacketIds).GetFields())
            {
                if (f.FieldType != typeof(ushort)) continue;
                if (ReconnectPolicy.IsRecoverySendAllowed((ushort)f.GetValue(null))) allowed.Add(f.Name);
            }
            allowed.Sort(System.StringComparer.Ordinal);
            Assert.That(allowed, Is.EqualTo(new[] { "AUTH_REQ", "ENTER_WORLD_REQ", "HELLO", "PING" }));
        }

        [Test]
        public void WireConstants_MirrorServerLoginFlow()
        {
            // server/src/identity/loginFlow.ts KICK_REASON·ERR_CODE와 같은 값이어야 한다.
            Assert.That(new[]
            {
                KickReason.ProtoMismatch, KickReason.AuthFail, KickReason.Idle, KickReason.AdminKick, KickReason.Cheat,
                KickReason.ServerShutdown, KickReason.ContentMismatch, KickReason.DuplicateLogin, KickReason.ServerFull,
            }, Is.EqualTo(new[] { 1, 2, 3, 4, 5, 6, 7, 8, 9 }));
            Assert.That(new[]
            {
                AuthErrCode.None, AuthErrCode.BadCredentials, AuthErrCode.Banned, AuthErrCode.RateLimited, AuthErrCode.ServerErr,
            }, Is.EqualTo(new[] { 0, 1, 2, 3, 4 }));
        }
    }
}
#endif
