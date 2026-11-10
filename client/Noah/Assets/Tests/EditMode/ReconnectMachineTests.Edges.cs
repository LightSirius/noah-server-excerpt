// 자동 재접속 상태기계 — 재진입 포트·종료 상태의 오버레이·모든 단계의 취소·늦은 Tick의 창 판정.
// 같은 고정(시계·난수·포트)을 쓰는 ReconnectMachineTests의 나머지 절반이다.

#if UNITY_INCLUDE_TESTS
using System;
using MMORPG.Net;
using NUnit.Framework;

namespace MMORPG.Tests.EditMode
{
    public sealed partial class ReconnectMachineTests
    {
        [Test]
        public void ReentrantDisconnectPort_CountsOneFailureOnce()
        {
            // 해체가 대기 중 connect의 실패를 같은 호출 안에서 되돌려주는 포트(어댑터가 ConnectAsync false를 동기 전달하는 경우).
            _ports.DisconnectHook = () => _m.OnConnectResult(_ports.LastAttemptId, false, 0);
            ArmDefault();
            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed);
            WaitForConnect();
            int shown = _ports.Statuses.Count;

            _clock.Advance(ReconnectPolicy.StepTimeoutSec(0));
            _m.Tick(); // connect 단계 시간 초과 → 기계가 대기 중 connect를 내린다
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Waiting));
            Assert.That(_ports.Statuses.Count, Is.EqualTo(shown + 1), "실패 한 번 = 대기 표시 한 번");
            Assert.That(_ports.LastStatus.Attempt, Is.EqualTo(2));
            Assert.That(_ports.LastStatus.SecondsUntilAttempt, Is.EqualTo(1.5).Within(1e-9), "n=1 백오프(0.5 + U(0,2) @0.5)");
            Assert.That(_m.LastTrigger, Is.EqualTo(ReconnectTrigger.StepTimeout));
            WaitForConnect();
            Assert.That(_ports.Connects[1].timeoutSec, Is.EqualTo(30.0), "단계 시간 초과는 한 칸만 오른다");
        }

        [Test]
        public void SynchronousConnectPort_IsSafeEitherWay()
        {
            _ports.ConnectHook = id => _m.OnConnectResult(id, false, 0);
            ArmDefault();
            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed);
            WaitForConnect();
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Waiting));
            Assert.That(_ports.LastStatus.Attempt, Is.EqualTo(2));
            Assert.That(_ports.DisconnectCount, Is.EqualTo(0), "실패한 connect는 남긴 것이 없다");

            _ports.ConnectHook = id => _m.OnConnectResult(id, true, 10);
            WaitForConnect();
            Assert.That(_m.State, Is.EqualTo(ReconnectState.AwaitHelloAck));
            Assert.That(_ports.HelloCount, Is.EqualTo(1));
        }

        [Test]
        public void FatalDuringRecovery_HidesTheOverlayBeforeTheModal()
        {
            RecoverToAwaitAuth();
            _m.OnAuthResult(10, false, AuthErrCode.BadCredentials, 0, "");
            Assert.That(_ports.HideCount, Is.EqualTo(1), "재연결 오버레이를 닫고 기존 모달로");
            Assert.That(_ports.Calls.IndexOf("HideOverlay"), Is.LessThan(_ports.Calls.IndexOf("ShowFatal")));
        }

        [Test]
        public void GaveUpAfterRetries_HidesTheOverlayBeforeTheModal()
        {
            ArmDefault();
            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed);
            while (_m.State == ReconnectState.Waiting) _m.OnConnectResult(WaitForConnect(), false, 0);
            Assert.That(_m.State, Is.EqualTo(ReconnectState.GaveUp));
            Assert.That(_ports.HideCount, Is.EqualTo(1));
            Assert.That(_ports.Calls.IndexOf("HideOverlay"), Is.LessThan(_ports.Calls.IndexOf("ShowGaveUp")));
        }

        [Test]
        public void TerminalFromArmed_HasNoOverlayToHide()
        {
            ArmDefault();
            _m.OnKick(ArmedGen, KickReason.AdminKick);
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Fatal));
            Assert.That(_ports.HideCount, Is.EqualTo(0), "오버레이를 띄운 적이 없다");
        }

        [Test]
        public void LateTickPastTheWindow_GivesUpInsteadOfAttempting()
        {
            ArmDefault();
            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed); // Blip 창 90초
            _clock.Advance(ReconnectPolicy.WindowSec(ReconnectClass.Blip) + 0.5); // 앱 일시정지 등으로 Tick이 늦었다
            _m.Tick();
            Assert.That(_m.State, Is.EqualTo(ReconnectState.GaveUp));
            Assert.That(_ports.Connects, Is.Empty, "창 밖에서는 시도를 시작하지 않는다");
            Assert.That(_ports.GaveUp, Is.EqualTo(ReconnectTrigger.Closed));
            Assert.That(_ports.HideCount, Is.EqualTo(1));
        }

        [Test]
        public void RotatedToken_IsUsedEvenWhenEnterWorldFails()
        {
            RecoverToAwaitAuth();
            _m.OnAuthResult(10, true, AuthErrCode.None, Account, "T1"); // 서버는 T0을 이미 폐기했다
            _m.OnDisconnected(10, LinkLossCause.Closed); // ENTER_WORLD_OK 전에 끊겼다
            _m.OnConnectResult(WaitForConnect(), true, 20);
            _m.OnHelloAck(20);
            Assert.That(_ports.AuthTokens, Is.EqualTo(new[] { "T0", "T1" }), "재시도는 회전된 토큰을 쓴다");
        }

        [Test]
        public void PongDuringTheSceneReload_ExtendsTheEnterWorldStep()
        {
            RecoverToAwaitAuth();
            _m.OnAuthResult(10, true, AuthErrCode.None, Account, "T1");
            _clock.Advance(10.0);
            _m.OnPong(10); // 기한 15 → 25
            _clock.Advance(10.0);
            _m.Tick();
            Assert.That(_m.State, Is.EqualTo(ReconnectState.AwaitEnterWorld));
            _clock.Advance(5.0);
            _m.Tick();
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Waiting));
        }

        // 복구를 step까지 진행한다(연결 세대 10) — 그 단계에 늦게 도착할 결과를 넣는 동작을 돌려준다.
        private Action DriveTo(ReconnectState step)
        {
            ArmDefault();
            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed);
            int id = WaitForConnect();
            if (step == ReconnectState.Connecting) return () => _m.OnConnectResult(id, true, 10);
            _m.OnConnectResult(id, true, 10);
            if (step == ReconnectState.AwaitHelloAck) return () => _m.OnHelloAck(10);
            _m.OnHelloAck(10);
            if (step == ReconnectState.AwaitAuth) return () => _m.OnAuthResult(10, true, AuthErrCode.None, Account, "T1");
            _m.OnAuthResult(10, true, AuthErrCode.None, Account, "T1");
            return () => _m.OnEnterWorldOk(10, Char);
        }

        [TestCase(ReconnectState.Connecting)]
        [TestCase(ReconnectState.AwaitHelloAck)]
        [TestCase(ReconnectState.AwaitAuth)]
        [TestCase(ReconnectState.AwaitEnterWorld)]
        public void Cancel_InEveryAttemptStep_DropsTheLinkAndIgnoresTheLateResult(ReconnectState step)
        {
            var late = DriveTo(step);
            Assert.That(_m.State, Is.EqualTo(step));
            int drops = _ports.DisconnectCount;
            _m.Cancel();
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Cancelled));
            Assert.That(_ports.DisconnectCount, Is.EqualTo(drops + 1), "시도의 연결(대기 중 connect 포함)을 내린다");
            Assert.That(_ports.HideCount, Is.EqualTo(1));
            Assert.That(_ports.FilterOn, Is.False);
            Assert.That(_ports.WatchdogSec, Is.EqualTo(0.0));

            int calls = _ports.Calls.Count;
            late();
            _clock.Advance(1000.0);
            _m.Tick();
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Cancelled));
            Assert.That(_ports.Calls.Count, Is.EqualTo(calls), "늦은 결과·시계는 아무것도 하지 않는다");
        }

        [Test]
        public void Cancel_FromArmed_LeavesTheConnectionAlone()
        {
            ArmDefault();
            _m.Cancel();
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Cancelled));
            Assert.That(_ports.DisconnectCount, Is.EqualTo(0), "타이틀 이동이 연결을 정리한다 — 기계는 건드리지 않는다");
            Assert.That(_ports.HideCount, Is.EqualTo(0));
            Assert.That(_ports.WatchdogSec, Is.EqualTo(0.0));
            _m.OnDisconnected(ArmedGen, LinkLossCause.Closed);
            _m.OnKick(ArmedGen, KickReason.ServerShutdown);
            Assert.That(_ports.Statuses, Is.Empty);
        }

        [Test]
        public void Cancel_FromATerminalState_LeavesTheModalAlone()
        {
            ArmDefault();
            _m.OnKick(ArmedGen, KickReason.AdminKick);
            int calls = _ports.Calls.Count;
            _m.Cancel();
            Assert.That(_m.State, Is.EqualTo(ReconnectState.Cancelled));
            Assert.That(_ports.Calls.Count, Is.EqualTo(calls), "모달은 기존 패널이 닫는다 — 내릴 연결도 없다");
        }
    }
}
#endif
