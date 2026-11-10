// 자동 재접속 상태기계(순수 C#) — 가짜 포트·수동 시계·고정 난수로 결정론적으로 돈다.
// 연결 세대(generation)는 NetworkManager 규약(시도 결과 = ConnectionGeneration, 단절 = LastDisconnectGeneration):
// 시험은 무장 연결을 1, 복구 연결을 10·20·…으로 준다.

#if UNITY_INCLUDE_TESTS
using MMORPG.Net;
using NUnit.Framework;

namespace MMORPG.Tests.EditMode
{
    public sealed partial class ReconnectMachineTests
    {
        private const int Account = 10;
        private const int Char = 20;
        private const int ArmedGen = 1;

        private FakeReconnectPorts _ports;
        private FakeReconnectClock _clock;
        private FakeReconnectRandom _rng;
        private ReconnectMachine _m;

        [SetUp]
        public void SetUp()
        {
            _ports = new FakeReconnectPorts();
            _clock = new FakeReconnectClock { Now = 1000.0 };
            _rng = new FakeReconnectRandom(0.5);
            _m = new ReconnectMachine(_ports, () => _clock.Now, _rng);
        }

        private void ArmDefault() => Assert.That(_m.Arm(ArmedGen, Account, Char, "T0"), Is.True);

        // 대기가 끝날 때까지 시계를 돌려 다음 Connect를 낸다 — 그 시도 id.
        private int WaitForConnect()
        {
            int before = _ports.Connects.Count;
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Waiting), "대기 중이어야 한다");
            _clock.Advance(_m.Status.SecondsUntilAttempt);
            _m.Tick();
            Assert.That(_ports.Connects.Count, Is.EqualTo(before + 1), "대기가 끝나면 Connect 1회");
            return _ports.Connects[_ports.Connects.Count - 1].attemptId;
        }

        // 연결 성공부터 ENTER_WORLD_OK까지 — 서버가 새 토큰을 준다.
        private void CompleteHandshake(int attemptId, int gen, string newToken)
        {
            _m.OnConnectResult(attemptId, true, gen);
            _m.OnHelloAck(gen);
            _m.OnAuthResult(gen, true, AuthErrCode.None, Account, newToken);
            _m.OnEnterWorldOk(gen, Char);
        }

        [Test]
        public void Blip_ReconnectsWithStoredTokenAndRotatesIt()
        {
            ArmDefault();
            Assert.That(_ports.WatchdogSec, Is.EqualTo(ReconnectPolicy.WatchdogPongAgeSec), "무장 = PONG 감시 45초");

            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed);
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Waiting));
            Assert.That(_ports.FilterOn, Is.True, "복구 중 송신 허용 목록");
            Assert.That(_ports.WatchdogSec, Is.EqualTo(0.0), "복구 중엔 단계 시간 초과가 감시한다");
            Assert.That(_ports.LastStatus.StartClass, Is.EqualTo(ReconnectClass.Blip));
            Assert.That(_ports.LastStatus.Attempt, Is.EqualTo(1));
            Assert.That(_ports.LastStatus.SecondsUntilAttempt, Is.EqualTo(2.5).Within(1e-9), "Blip 첫 시도 U(0,5) @0.5");

            int attempt = WaitForConnect();
            Assert.That(_ports.Connects[0].timeoutSec, Is.EqualTo(15.0));
            _m.OnConnectResult(attempt, true, 10);
            Assert.That(_ports.HelloCount, Is.EqualTo(1));
            _m.OnHelloAck(10);
            Assert.That(_ports.AuthTokens, Is.EqualTo(new[] { "T0" }));
            _m.OnAuthResult(10, true, AuthErrCode.None, Account, "T1");
            Assert.That(_ports.StoredAccountId, Is.EqualTo(Account));
            Assert.That(_ports.StoredToken, Is.EqualTo("T1"), "AUTH마다 토큰이 바뀐다 — 즉시 저장");
            Assert.That(_ports.ReloadCount, Is.EqualTo(1));
            Assert.That(_m.State, Is.EqualTo(ReconnectState.AwaitEnterWorld));

            _m.OnEnterWorldOk(10, Char);
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Armed));
            Assert.That(_ports.FilterOn, Is.False);
            Assert.That(_ports.WatchdogSec, Is.EqualTo(ReconnectPolicy.WatchdogPongAgeSec));
            Assert.That(_ports.HideCount, Is.EqualTo(1));
            Assert.That(_ports.ReconnectedCount, Is.EqualTo(1));

            // 다음 복구는 회전된 토큰을 쓰고, 시도 번호·단계 시간 초과는 처음부터다.
            _m.OnDisconnected(10, LinkLossCause.Closed);
            Assert.That(_ports.LastStatus.Attempt, Is.EqualTo(1));
            int next = WaitForConnect();
            Assert.That(_ports.Connects[1].timeoutSec, Is.EqualTo(15.0));
            _m.OnConnectResult(next, true, 20);
            _m.OnHelloAck(20);
            Assert.That(_ports.AuthTokens, Is.EqualTo(new[] { "T0", "T1" }));
        }

        [Test]
        public void Restart_RetriesUntilItsWindowThenGivesUpWithLastReason()
        {
            _rng.Value = 1.0 - 1e-12; // 대기를 최대로 — 창 끝을 짚는다
            ArmDefault();
            double start = _clock.Now;
            _m.OnKick(ArmedGen, KickReason.ServerShutdown);
            Assert.That(_ports.DisconnectCount, Is.EqualTo(1), "KICK 6은 서버 종료를 기다리지 않고 바로 내린다");
            Assert.That(_ports.LastStatus.StartClass, Is.EqualTo(ReconnectClass.Restart));
            Assert.That(_ports.LastStatus.SecondsUntilAttempt, Is.EqualTo(6.0).Within(1e-6), "Restart 첫 시도 U(1,6)");

            double lastAttemptAt = 0.0;
            while (_m.State == ReconnectState.Waiting)
            {
                int id = WaitForConnect();
                lastAttemptAt = _clock.Now - start;
                _m.OnConnectResult(id, false, 0); // 리스너가 아직 없다 — 거절
            }

            Assert.That(_m.State, Is.EqualTo(ReconnectState.GaveUp));
            Assert.That(_ports.GaveUp, Is.EqualTo(ReconnectTrigger.ConnectFailed), "마지막 원인으로 모달");
            Assert.That(lastAttemptAt, Is.LessThanOrEqualTo(180.0).And.GreaterThan(90.0), "창은 시작 분류(Restart 180초) — 이후 실패(Blip)는 백오프만 바꾼다");
            Assert.That(_ports.FilterOn, Is.False);
            Assert.That(_ports.WatchdogSec, Is.EqualTo(0.0));

            int connects = _ports.Connects.Count;
            _clock.Advance(1000.0);
            _m.Tick();
            Assert.That(_ports.Connects.Count, Is.EqualTo(connects), "포기 뒤엔 시도하지 않는다");
        }

        [Test]
        public void StepTimeouts_GrowWithAttemptNumber()
        {
            ArmDefault();
            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed);
            for (int i = 0; i < 4; i++) _m.OnConnectResult(WaitForConnect(), false, 0);
            Assert.That(_ports.Connects.ConvertAll(c => c.timeoutSec), Is.EqualTo(new[] { 15.0, 30.0, 60.0, 60.0 }));
        }

        [Test]
        public void StepTimeout_TearsDownAndRetriesAsBlip()
        {
            ArmDefault();
            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed);
            int id = WaitForConnect();
            _m.OnConnectResult(id, true, 10);
            _clock.Advance(14.9);
            _m.Tick();
            Assert.That(_m.State, Is.EqualTo(ReconnectState.AwaitHelloAck));

            _clock.Advance(0.1);
            _m.Tick();
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Waiting));
            Assert.That(_ports.DisconnectCount, Is.EqualTo(1), "시간 초과는 연결을 스스로 내린다");
            Assert.That(_ports.LastStatus.Class, Is.EqualTo(ReconnectClass.Blip));
            Assert.That(_ports.LastStatus.Attempt, Is.EqualTo(2));
            Assert.That(_ports.LastStatus.SecondsUntilAttempt, Is.EqualTo(1.5).Within(1e-9), "Blip n=1 = 0.5 + U(0,2) @0.5");
        }

        // 복구를 AwaitAuth까지 진행한다(연결 세대 10).
        private void RecoverToAwaitAuth()
        {
            ArmDefault();
            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed);
            _m.OnConnectResult(WaitForConnect(), true, 10);
            _m.OnHelloAck(10);
            Assert.That(_m.State, Is.EqualTo(ReconnectState.AwaitAuth));
        }

        private void AssertFatalAndInert(ReconnectTrigger expected)
        {
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Fatal));
            Assert.That(_ports.Fatal, Is.EqualTo(expected));
            Assert.That(_ports.FilterOn, Is.False);
            Assert.That(_ports.WatchdogSec, Is.EqualTo(0.0));
            int connects = _ports.Connects.Count;
            _clock.Advance(1000.0);
            _m.Tick();
            Assert.That(_ports.Connects.Count, Is.EqualTo(connects), "치명 뒤엔 재시도하지 않는다");
        }

        [Test]
        public void DuplicateLoginKick_MidHandshake_IsFatal()
        {
            RecoverToAwaitAuth();
            int drops = _ports.DisconnectCount;
            _m.OnKick(10, KickReason.DuplicateLogin);
            Assert.That(_ports.DisconnectCount, Is.EqualTo(drops + 1));
            AssertFatalAndInert(ReconnectTrigger.Kick(KickReason.DuplicateLogin));
        }

        [TestCase(KickReason.ProtoMismatch)]
        [TestCase(KickReason.AdminKick)]
        [TestCase(KickReason.DuplicateLogin)]
        [TestCase(0)]
        [TestCase(10)]
        public void FatalKick_WhileArmed_ShowsModalWithoutRecovery(int reason)
        {
            ArmDefault();
            _m.OnKick(ArmedGen, reason);
            Assert.That(_ports.DisconnectCount, Is.EqualTo(1));
            Assert.That(_ports.Statuses, Is.Empty, "재연결 오버레이를 띄우지 않는다");
            AssertFatalAndInert(ReconnectTrigger.Kick(reason));
        }

        [Test]
        public void TokenRejected_IsFatalAndKeepsTheOldToken()
        {
            RecoverToAwaitAuth();
            _m.OnAuthResult(10, false, AuthErrCode.BadCredentials, 0, "");
            Assert.That(_ports.StoredToken, Is.Null);
            Assert.That(_ports.ReloadCount, Is.EqualTo(0));
            AssertFatalAndInert(ReconnectTrigger.AuthFailed(AuthErrCode.BadCredentials));
        }

        [Test]
        public void AuthServerError_TearsDownAndRetries()
        {
            RecoverToAwaitAuth();
            int drops = _ports.DisconnectCount;
            // 검증 전 단계의 ServerErr — 토큰은 그대로라 같은 토큰으로 재시도한다. 발급 단계의 ServerErr라면 서버가 이미 소비해
            // 재시도가 BadCredentials(치명)로 끝난다(서버가 감수한 트레이드오프 — ReconnectPolicy.Classify 주석).
            _m.OnAuthResult(10, false, AuthErrCode.ServerErr, 0, "");
            Assert.That(_ports.DisconnectCount, Is.EqualTo(drops + 1), "서버는 소켓을 열어 둘 수 있다 — 클라가 내린다");
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Waiting));
            Assert.That(_ports.LastStatus.Class, Is.EqualTo(ReconnectClass.Blip));

            _m.OnConnectResult(WaitForConnect(), true, 20);
            _m.OnHelloAck(20);
            Assert.That(_ports.AuthTokens, Is.EqualTo(new[] { "T0", "T0" }), "토큰은 성공한 AUTH에서만 바뀐다");
        }

        [Test]
        public void AccountMismatch_IsFatal()
        {
            RecoverToAwaitAuth();
            _m.OnAuthResult(10, true, AuthErrCode.None, Account + 1, "T1");
            Assert.That(_ports.StoredToken, Is.Null, "다른 계정의 토큰은 저장하지 않는다");
            Assert.That(_ports.ReloadCount, Is.EqualTo(0));
            AssertFatalAndInert(ReconnectTrigger.AccountMismatch);
        }

        [Test]
        public void CharacterMismatch_IsFatal()
        {
            RecoverToAwaitAuth();
            _m.OnAuthResult(10, true, AuthErrCode.None, Account, "T1");
            int drops = _ports.DisconnectCount;
            _m.OnEnterWorldOk(10, Char + 1);
            Assert.That(_ports.DisconnectCount, Is.EqualTo(drops + 1));
            Assert.That(_ports.ReconnectedCount, Is.EqualTo(0));
            AssertFatalAndInert(ReconnectTrigger.CharacterMismatch);
        }

        [Test]
        public void BusyDuringHandshake_KeepsTheStartingWindow()
        {
            _rng.Value = 1.0 - 1e-12;
            ArmDefault();
            double start = _clock.Now;
            _m.OnKick(ArmedGen, KickReason.ServerShutdown); // Restart 창 180초로 시작 — Busy 자체 창(90초)과 구별된다
            double lastAttemptAt = 0.0;
            int gen = 10;
            while (_m.State == ReconnectState.Waiting)
            {
                int id = WaitForConnect();
                lastAttemptAt = _clock.Now - start;
                _m.OnConnectResult(id, true, gen);
                _m.OnKick(gen, KickReason.ServerFull); // 접속 상한 — 혼잡 백오프
                gen += 10;
                if (_m.State != ReconnectState.Waiting) break;
                Assert.That(_ports.LastStatus.Class, Is.EqualTo(ReconnectClass.Busy));
                Assert.That(_ports.LastStatus.StartClass, Is.EqualTo(ReconnectClass.Restart));
                Assert.That(_ports.LastStatus.SecondsUntilAttempt, Is.GreaterThanOrEqualTo(5.0), "Busy 하한 5초");
            }
            Assert.That(_m.State, Is.EqualTo(ReconnectState.GaveUp));
            Assert.That(_ports.GaveUp, Is.EqualTo(ReconnectTrigger.Kick(KickReason.ServerFull)));
            Assert.That(lastAttemptAt, Is.LessThanOrEqualTo(180.0).And.GreaterThan(90.0), "창은 시작 분류(Restart 180초)");
        }

        [Test]
        public void ClosedBeforeHelloAck_BacksOffAsBusy()
        {
            ArmDefault();
            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed);
            _m.OnConnectResult(WaitForConnect(), true, 10);
            _m.OnDisconnected(10, LinkLossCause.Closed); // 소켓 오류(Windows의 맨 RST)도 감독자가 Closed로 옮긴다
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Waiting));
            Assert.That(_ports.LastStatus.Class, Is.EqualTo(ReconnectClass.Busy));
            Assert.That(_ports.LastStatus.SecondsUntilAttempt, Is.EqualTo(10.0).Within(1e-9), "Busy n=1 = 5 + U(0,10) @0.5");
            Assert.That(_ports.DisconnectCount, Is.EqualTo(0), "전송 계층이 이미 내린 연결은 다시 내리지 않는다");
        }

        [Test]
        public void ClosedAfterHelloAck_BacksOffAsBlip()
        {
            RecoverToAwaitAuth();
            _m.OnDisconnected(10, LinkLossCause.Closed);
            Assert.That(_ports.LastStatus.Class, Is.EqualTo(ReconnectClass.Blip));
        }

        [Test]
        public void TransientKick_WhileArmed_DisconnectsImmediatelyAndIgnoresTheLaterClose()
        {
            ArmDefault();
            _m.OnKick(ArmedGen, KickReason.Idle);
            Assert.That(_ports.DisconnectCount, Is.EqualTo(1));
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Waiting));
            Assert.That(_ports.LastStatus.StartClass, Is.EqualTo(ReconnectClass.Blip));
            var before = _ports.LastStatus;

            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed); // 서버가 뒤늦게 닫았다
            Assert.That(_ports.Statuses.Count, Is.EqualTo(1));
            Assert.That(_m.Status.SecondsUntilAttempt, Is.EqualTo(before.SecondsUntilAttempt));
        }

        [Test]
        public void InWorldServerFull_IsShedWithLongFirstDelay()
        {
            ArmDefault();
            _m.OnKick(ArmedGen, KickReason.ServerFull);
            Assert.That(_ports.LastStatus.StartClass, Is.EqualTo(ReconnectClass.Shed));
            Assert.That(_ports.LastStatus.SecondsUntilAttempt, Is.EqualTo(45.0).Within(1e-9), "Shed 첫 시도 U(30,60) @0.5");
        }

        [Test]
        public void WatchdogTeardown_UsesTheWiderFirstJitter()
        {
            _rng.Value = 1.0 - 1e-12;
            ArmDefault();
            _m.OnDisconnected(ArmedGen, LinkLossCause.PongTimeout);
            Assert.That(_ports.LastStatus.StartClass, Is.EqualTo(ReconnectClass.Blip));
            Assert.That(_ports.LastStatus.SecondsUntilAttempt, Is.GreaterThan(9.99).And.LessThan(10.0));
        }

        [Test]
        public void PongWhileAwaiting_ExtendsTheStepButNeverBeyondTwiceTheTimeout()
        {
            RecoverToAwaitAuth(); // 첫 시도 — 단계 시간 초과 15초
            _clock.Advance(10.0);
            _m.OnPong(10); // 서버는 살아 있지만 느리다 → 기한 +10 = 25
            _clock.Advance(10.0);
            _m.Tick();
            Assert.That(_m.State, Is.EqualTo(ReconnectState.AwaitAuth), "15초를 넘겼지만 PONG이 진행을 증명했다");

            _m.OnPong(10); // now + 15 = 35지만 상한 2 × 15 = 30
            _clock.Advance(9.9);
            _m.Tick();
            Assert.That(_m.State, Is.EqualTo(ReconnectState.AwaitAuth));
            _m.OnPong(10);
            _clock.Advance(0.1);
            _m.Tick();
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Waiting), "단계는 2 × timeout을 넘지 않는다");
            Assert.That(_ports.LastStatus.Class, Is.EqualTo(ReconnectClass.Blip));
        }

        [Test]
        public void PongFromAnotherConnection_DoesNotExtendTheStep()
        {
            RecoverToAwaitAuth();
            _clock.Advance(10.0);
            _m.OnPong(ArmedGen);
            _clock.Advance(5.0);
            _m.Tick();
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Waiting));
        }

        [Test]
        public void UnstableHint_FollowsPongAgeOnlyWhileArmed()
        {
            ArmDefault();
            _m.Tick(4.9);
            Assert.That(_ports.UnstableChanges, Is.Empty);
            _m.Tick(5.0);
            _m.Tick(12.0);
            Assert.That(_ports.UnstableChanges, Is.EqualTo(new[] { true }), "켜짐은 한 번만");
            _m.Tick(0.3);
            Assert.That(_ports.UnstableChanges, Is.EqualTo(new[] { true, false }));
            _m.Tick(6.0);
            _m.OnDisconnected(ArmedGen, LinkLossCause.PongTimeout);
            Assert.That(_ports.UnstableChanges, Is.EqualTo(new[] { true, false, true, false }), "무장을 떠나면 끈다");
            _m.Tick(30.0);
            Assert.That(_ports.UnstableChanges.Count, Is.EqualTo(4), "복구 중엔 재연결 오버레이가 대신한다");
        }

        // 대기 중인 복구를 성공시키고 uptimeSec 뒤에 다시 끊는다 — 다음 복구 대기로 남는다.
        private void RecoverThenDrop(int gen, double uptimeSec)
        {
            CompleteHandshake(WaitForConnect(), gen, $"T{gen}");
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Armed));
            _clock.Advance(uptimeSec);
            _m.OnDisconnected(gen, LinkLossCause.Closed);
        }

        [Test]
        public void FlapGuard_GivesUpOnTheThirdShortLivedRecovery()
        {
            ArmDefault();
            _clock.Advance(5.0);
            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed); // 새 로그인 직후 단절은 플랩이 아니다
            RecoverThenDrop(10, 10.0);
            RecoverThenDrop(20, 29.9);
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Waiting), "플랩 2회까지는 재시도");
            RecoverThenDrop(30, 1.0);
            Assert.That(_m.State, Is.EqualTo(ReconnectState.GaveUp));
            Assert.That(_ports.GaveUp, Is.EqualTo(ReconnectTrigger.Closed));
            Assert.That(_ports.Connects.Count, Is.EqualTo(3));
        }

        [Test]
        public void FlapGuard_IgnoresStableRecoveriesAndFlapsOlderThanTheSpan()
        {
            ArmDefault();
            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed);
            RecoverThenDrop(10, 10.0);  // 플랩 1 (≈ t+12.5)
            RecoverThenDrop(20, 30.0);  // 30초 유지 = 안정
            RecoverThenDrop(30, 10.0);  // 플랩 2 (≈ t+57.5)
            RecoverThenDrop(40, 250.0); // 안정
            RecoverThenDrop(50, 10.0);  // 플랩 3 (≈ t+322.5) — 플랩 1은 5분 밖
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Waiting));
            RecoverThenDrop(60, 10.0);  // 5분 안 플랩 3개
            Assert.That(_m.State, Is.EqualTo(ReconnectState.GaveUp));
        }

        [Test]
        public void Cancel_MidHandshake_DropsTheLinkAndIgnoresLateResults()
        {
            RecoverToAwaitAuth();
            int drops = _ports.DisconnectCount;
            _m.Cancel();
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Cancelled));
            Assert.That(_ports.DisconnectCount, Is.EqualTo(drops + 1));
            Assert.That(_ports.FilterOn, Is.False);
            Assert.That(_ports.HideCount, Is.EqualTo(1));

            _m.OnAuthResult(10, true, AuthErrCode.None, Account, "T1");
            _clock.Advance(1000.0);
            _m.Tick();
            Assert.That(_ports.StoredToken, Is.Null);
            Assert.That(_ports.Connects.Count, Is.EqualTo(1));
        }

        [Test]
        public void Cancel_WhileWaiting_NeverConnects()
        {
            ArmDefault();
            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed);
            _m.Cancel();
            _clock.Advance(1000.0);
            _m.Tick();
            Assert.That(_ports.Connects, Is.Empty);
            Assert.That(_ports.DisconnectCount, Is.EqualTo(0), "내릴 연결이 없다");
            Assert.That(_ports.HideCount, Is.EqualTo(1));
        }

        [Test]
        public void Disarm_OnClientDisconnect_IgnoresTheOldConnection()
        {
            ArmDefault();
            _m.Tick(9.0); // 불안정 표시 켜짐
            _m.Disarm(); // 클라가 스스로 Disconnect했다(통지 없음) — 기계는 연결을 건드리지 않는다
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Disarmed));
            Assert.That(_ports.DisconnectCount, Is.EqualTo(0));
            Assert.That(_ports.WatchdogSec, Is.EqualTo(0.0));
            Assert.That(_ports.UnstableChanges, Is.EqualTo(new[] { true, false }));

            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed);
            _m.OnKick(ArmedGen, KickReason.ServerShutdown);
            _clock.Advance(100.0);
            _m.Tick();
            Assert.That(_ports.Statuses, Is.Empty);
            Assert.That(_ports.Connects, Is.Empty);
        }

        [Test]
        public void Disarm_DuringRecovery_DropsTheAttemptAndHidesTheOverlay()
        {
            ArmDefault();
            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed);
            _m.OnConnectResult(WaitForConnect(), true, 10);
            _m.Disarm(); // GameScene 밖으로 씬이 바뀌었다
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Disarmed));
            Assert.That(_ports.DisconnectCount, Is.EqualTo(1));
            Assert.That(_ports.FilterOn, Is.False);
            Assert.That(_ports.HideCount, Is.EqualTo(1));
            _m.OnHelloAck(10);
            Assert.That(_ports.AuthTokens, Is.Empty);
        }

        [Test]
        public void StaleGenerationEvents_AreIgnored()
        {
            ArmDefault();
            _m.OnDisconnected(ArmedGen - 1, LinkLossCause.Closed);
            _m.OnKick(ArmedGen - 1, KickReason.ServerShutdown);
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Armed));

            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed);
            int first = WaitForConnect();
            _m.OnConnectResult(first, true, 10);
            _m.OnDisconnected(10, LinkLossCause.Closed); // 시도 1 실패
            int second = WaitForConnect();
            _m.OnConnectResult(first, true, 10); // 옛 시도의 결과
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Connecting));
            _m.OnConnectResult(second, true, 20);

            _m.OnHelloAck(10);
            Assert.That(_ports.AuthTokens, Is.Empty, "옛 연결의 HELLO_ACK");
            _m.OnHelloAck(20);
            _m.OnAuthResult(10, true, AuthErrCode.None, Account, "STALE");
            _m.OnKick(10, KickReason.DuplicateLogin);
            _m.OnDisconnected(10, LinkLossCause.Closed);
            Assert.That(_m.State, Is.EqualTo(ReconnectState.AwaitAuth));
            _m.OnAuthResult(20, true, AuthErrCode.None, Account, "T1");
            _m.OnEnterWorldOk(10, Char);
            Assert.That(_m.State, Is.EqualTo(ReconnectState.AwaitEnterWorld));
            _m.OnEnterWorldOk(20, Char);
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Armed));
            Assert.That(_ports.StoredToken, Is.EqualTo("T1"));
        }

        [Test]
        public void OnlyOneAuthPerConnection_AndUnexpectedResultsAreDropped()
        {
            ArmDefault();
            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed);
            _m.OnConnectResult(WaitForConnect(), true, 10);
            _m.OnAuthResult(10, true, AuthErrCode.None, Account, "EARLY"); // AUTH_REQ를 보내기 전
            _m.OnEnterWorldOk(10, Char);
            Assert.That(_m.State, Is.EqualTo(ReconnectState.AwaitHelloAck));
            _m.OnHelloAck(10);
            _m.OnHelloAck(10);
            Assert.That(_ports.AuthTokens.Count, Is.EqualTo(1));
            _m.OnAuthResult(10, true, AuthErrCode.None, Account, "T1");
            _m.OnAuthResult(10, true, AuthErrCode.None, Account, "T2");
            Assert.That(_ports.Calls.FindAll(c => c == "StoreAuth").Count, Is.EqualTo(1));
            Assert.That(_ports.StoredToken, Is.EqualTo("T1"));
            Assert.That(_ports.ReloadCount, Is.EqualTo(1));
        }

        [TestCase(0, Char, "T0")]
        [TestCase(Account, 0, "T0")]
        [TestCase(Account, Char, "")]
        [TestCase(Account, Char, null)]
        public void Arm_RequiresAReadyLogin(int accountId, int charId, string token)
        {
            Assert.That(_m.Arm(ArmedGen, accountId, charId, token), Is.False);
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Disarmed));
            Assert.That(_ports.Calls, Is.Empty);
        }

        [Test]
        public void Arm_IsIgnoredDuringRecoveryButAllowedAfterATerminalState()
        {
            ArmDefault();
            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed);
            Assert.That(_m.Arm(5, Account, Char, "T9"), Is.False, "복구가 연결을 소유한다");
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Waiting));

            _m.OnConnectResult(WaitForConnect(), true, 10);
            _m.OnKick(10, KickReason.AdminKick);
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Fatal));
            Assert.That(_m.Arm(30, Account, Char, "T9"), Is.True, "타이틀에서 다시 로그인한 새 세션");
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Armed));
            Assert.That(_ports.WatchdogSec, Is.EqualTo(ReconnectPolicy.WatchdogPongAgeSec));
        }

        [Test]
        public void ArmForTheRecoveredConnection_IsANoOpThatKeepsTheFlapHistory()
        {
            ArmDefault();
            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed);
            for (int i = 1; i <= 3; i++)
            {
                int gen = i * 10;
                CompleteHandshake(WaitForConnect(), gen, $"T{gen}");
                // 같은 ENTER_WORLD_OK를 보는 GameScene 진입 경로가 Arm도 부른다 — 복구 재입장을 새 로그인으로 오인하면 플랩 가드가 무력해진다.
                Assert.That(_m.Arm(gen, Account, Char, $"T{gen}"), Is.True);
                _clock.Advance(5.0);
                _m.OnDisconnected(gen, LinkLossCause.Closed);
            }
            Assert.That(_m.State, Is.EqualTo(ReconnectState.GaveUp));
            Assert.That(_m.LastTrigger, Is.EqualTo(ReconnectTrigger.Closed));
        }

        [Test]
        public void DisarmedMachine_IgnoresConnectionEvents()
        {
            _m.OnDisconnected(0, LinkLossCause.Closed);
            _m.OnKick(0, KickReason.ServerShutdown);
            _m.OnPong(0);
            _m.Tick(60.0);
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Disarmed));
            Assert.That(_ports.Calls, Is.Empty);
        }

        [Test]
        public void SendFilterAndWatchdog_SwitchOnlyAtRecoveryBoundaries()
        {
            ArmDefault();
            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed);
            CompleteHandshake(WaitForConnect(), 10, "T1");
            var toggles = _ports.Calls.FindAll(c => c.StartsWith("Filter:") || c.StartsWith("Watchdog:"));
            Assert.That(toggles, Is.EqualTo(new[] { "Watchdog:45", "Watchdog:0", "Filter:True", "Filter:False", "Watchdog:45" }));
            Assert.That(_ports.Calls.IndexOf("Filter:True"), Is.LessThan(_ports.Calls.IndexOf("Connect")), "첫 송신 전에 허용 목록");
        }

        [TestCase(KickReason.DuplicateLogin, ReconnectState.Fatal)]
        [TestCase(KickReason.ServerShutdown, ReconnectState.Waiting)]
        public void DisconnectCarryingARememberedKick_IsClassifiedAsThatKick(int reason, ReconnectState expected)
        {
            ArmDefault();
            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed, reason);
            Assert.That(_m.State, Is.EqualTo(expected));
            if (expected == ReconnectState.Waiting) Assert.That(_ports.LastStatus.StartClass, Is.EqualTo(ReconnectClass.Restart));
            else Assert.That(_ports.Fatal, Is.EqualTo(ReconnectTrigger.Kick(reason)));
        }

        [Test]
        public void Countdown_UpdatesOncePerWholeSecondThenShowsTheAttempt()
        {
            ArmDefault();
            _m.OnKick(ArmedGen, KickReason.ServerFull); // Shed 첫 시도 45초 @0.5
            Assert.That(_ports.Statuses.Count, Is.EqualTo(1));
            _clock.Advance(0.5);
            _m.Tick();
            Assert.That(_ports.Statuses.Count, Is.EqualTo(1), "44.5초 — 표시(올림 45)는 그대로");
            _clock.Advance(0.5);
            _m.Tick();
            Assert.That(_ports.Statuses.Count, Is.EqualTo(2));
            Assert.That(_ports.LastStatus.SecondsUntilAttempt, Is.EqualTo(44.0));
            _clock.Advance(0.25);
            _m.Tick();
            Assert.That(_ports.Statuses.Count, Is.EqualTo(2));

            _clock.Advance(43.75);
            _m.Tick();
            Assert.That(_ports.Connects.Count, Is.EqualTo(1));
            Assert.That(_ports.LastStatus.State, Is.EqualTo(ReconnectState.Connecting));
            Assert.That(_ports.LastStatus.SecondsUntilAttempt, Is.EqualTo(0.0));
            Assert.That(_ports.LastStatus.Attempt, Is.EqualTo(1));
        }

        [Test]
        public void ConnectTimeout_IsAlsoEnforcedByTheMachine()
        {
            ArmDefault();
            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed);
            int id = WaitForConnect();
            _clock.Advance(15.0);
            _m.Tick();
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Waiting));
            Assert.That(_ports.DisconnectCount, Is.EqualTo(1), "대기 중인 connect를 중단한다");

            _m.OnConnectResult(id, true, 10); // 늦게 온 옛 시도의 결과
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Waiting));
            Assert.That(_ports.HelloCount, Is.EqualTo(0));
        }
    }
}
#endif
