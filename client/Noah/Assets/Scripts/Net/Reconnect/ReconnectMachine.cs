// 자동 재접속 상태기계 — 토큰 재로그인 + GameScene 재입장(resume 없음, 와이어 변경 없음).
// 이벤트 구동 순수 C#: 시계·난수·포트를 주입받고 UnityEngine을 모른다. Unity 감독자가 NetworkManager·PacketBus 이벤트를 입력으로 넣는다.

using System;
using System.Collections.Generic;

namespace MMORPG.Net
{
    public sealed class ReconnectMachine
    {
        private const int NoLink = int.MinValue;

        private readonly IReconnectPorts _ports;
        private readonly Func<double> _nowSec;
        private readonly IReconnectRandom _rng;

        // 기계가 아는 연결 — 세대가 다른 입력은 버린다. _ownsLink = 내려야 할 연결(또는 대기 중 connect)이 있다.
        private int _linkGen = NoLink;
        private bool _ownsLink;
        private int _accountId;
        private int _charId;
        private string _token = "";

        private ReconnectClass _startClass;
        private ReconnectClass _latestClass;
        private double _recoveryStart;
        private int _attempt;
        private int _attemptId;
        private double _nextAttemptAt;
        private int _shownCountdown;
        private double _stepStart;
        private double _stepDeadline;

        // 플랩 가드 — 복구로 재입장한 뒤 곧 끊긴 시각들(FlapSpanSec 안만 유지).
        private readonly List<double> _flaps = new List<double>();
        private bool _armedByRecovery;
        private double _armedAt;

        // 포트에 마지막으로 낸 값 — 바뀔 때만 다시 낸다.
        private bool _filterOn;
        private double _watchdogSec;
        private bool _unstableShown;

        public ReconnectMachine(IReconnectPorts ports, Func<double> nowSec, IReconnectRandom rng)
        {
            _ports = ports ?? throw new ArgumentNullException(nameof(ports));
            _nowSec = nowSec ?? throw new ArgumentNullException(nameof(nowSec));
            _rng = rng ?? throw new ArgumentNullException(nameof(rng));
        }

        public ReconnectState State { get; private set; } = ReconnectState.Disarmed;

        /// <summary>마지막 단절·실패 원인 — 씬 재로드 뒤 모달·오버레이를 다시 띄울 때 읽는다.</summary>
        public ReconnectTrigger LastTrigger { get; private set; }

        public ReconnectStatus Status => new ReconnectStatus(State, _startClass, _latestClass, _attempt + 1,
            State == ReconnectState.Waiting ? Math.Max(0.0, _nextAttemptAt - _nowSec()) : 0.0);

        private double StepTimeout => ReconnectPolicy.StepTimeoutSec(_attempt);

        /// <summary>복구 진행 중(대기·시도) — 재연결 오버레이를 띄워야 하고 ENTER_WORLD_OK는 OnEnterWorldOk로 넣는다.</summary>
        public bool IsRecovering => State == ReconnectState.Waiting || IsAttemptStep(State);

        /// <summary>
        /// 현재 연결 세대에서 ENTER_WORLD_OK를 받은 GameScene에서 무장한다(LoginContext가 준비된 로그인만).
        /// 복구 중에는 복구가 연결을 소유하므로 false. 이미 무장한 같은 세대면 아무것도 바꾸지 않는다(복구 재입장을 새 로그인으로 보지 않는다).
        /// </summary>
        public bool Arm(int generation, int accountId, int charId, string token)
        {
            if (IsRecovering || accountId <= 0 || charId <= 0 || string.IsNullOrEmpty(token)) return false;
            if (State == ReconnectState.Armed && generation == _linkGen) return true;
            _linkGen = generation;
            _ownsLink = true;
            _accountId = accountId;
            _charId = charId;
            _token = token;
            _flaps.Clear();
            EnterArmed(byRecovery: false);
            return true;
        }

        /// <summary>
        /// 무장 해제 — 클라가 스스로 끊었거나(Disconnect는 통지가 없다) GameScene 밖으로 씬이 바뀌었다. 무장 연결은 건드리지 않고,
        /// 진행 중인 복구 시도만 내린다.
        /// </summary>
        public void Disarm() => Stop(ReconnectState.Disarmed);

        /// <summary>사용자가 "타이틀로"를 눌렀다 — 진행 중인 시도를 내리고 더 시도하지 않는다(타이틀 이동은 감독자 몫).</summary>
        public void Cancel()
        {
            if (State != ReconnectState.Disarmed) Stop(ReconnectState.Cancelled);
        }

        /// <param name="generation">
        /// 끊긴 연결의 세대 = 전송 계층이 통지와 함께 남긴 값(NetworkManager.LastDisconnectGeneration). 통지 시점의 현재 세대는
        /// 해체로 이미 올라 있어 넣으면 단절이 지난 세대로 버려진다.
        /// </param>
        /// <param name="lastKickReason">그 연결에서 받았지만 OnKick으로 넣지 못한 KICK.</param>
        public void OnDisconnected(int generation, LinkLossCause cause, int? lastKickReason = null)
        {
            if (generation != _linkGen) return;
            ForgetLink(); // 전송 계층이 이미 내렸다 — 다시 내리지 않는다
            var trigger = lastKickReason.HasValue ? ReconnectTrigger.Kick(lastKickReason.Value)
                : cause == LinkLossCause.PongTimeout ? ReconnectTrigger.PongTimeout
                : ReconnectTrigger.Closed;
            OnLinkLost(trigger);
        }

        /// <summary>
        /// KICK 수신 — 서버의 종료(최대 수 초 flush)를 기다리지 않고 바로 내린다. 다음 상태(대기·종료)로 옮긴 뒤 그쪽이 내리므로
        /// 뒤늦은 서버 종료 통지는 지난 세대로 버려진다.
        /// </summary>
        public void OnKick(int generation, int reason)
        {
            if (generation != _linkGen) return;
            OnLinkLost(ReconnectTrigger.Kick(reason));
        }

        /// <summary>프레임마다. pongAgeSec = NetworkManager.SecondsSinceLastPong(무장 중 "연결 불안정" 표시에만 쓴다).</summary>
        public void Tick(double pongAgeSec = 0.0)
        {
            double now = _nowSec();
            if (State == ReconnectState.Armed) SetUnstable(pongAgeSec >= ReconnectPolicy.UnstablePongAgeSec);
            else if (State == ReconnectState.Waiting) TickWaiting(now);
            else if (IsAttemptStep(State) && now >= _stepDeadline) FailAttempt(ReconnectTrigger.StepTimeout);
        }

        /// <summary>PONG = 서버가 살아 있다. 응답 대기 단계의 기한을 민다(단계 시작 + 2 × timeout 상한).</summary>
        public void OnPong(int generation)
        {
            if (generation != _linkGen || !IsAwaitingServer(State)) return;
            _stepDeadline = ReconnectPolicy.DeadlineAfterProgress(_stepStart, _stepDeadline, _nowSec(), StepTimeout);
        }

        public void OnConnectResult(int attemptId, bool ok, int generation)
        {
            if (State != ReconnectState.Connecting || attemptId != _attemptId) return;
            if (!ok)
            {
                _ownsLink = false; // 실패한 connect는 남긴 것이 없다
                FailAttempt(ReconnectTrigger.ConnectFailed);
                return;
            }
            _linkGen = generation;
            EnterStep(ReconnectState.AwaitHelloAck);
            _ports.SendHello();
        }

        public void OnHelloAck(int generation)
        {
            if (State != ReconnectState.AwaitHelloAck || generation != _linkGen) return;
            EnterStep(ReconnectState.AwaitAuth);
            _ports.SendTokenAuth(_token);
        }

        public void OnAuthResult(int generation, bool ok, int errCode, int accountId, string token)
        {
            if (State != ReconnectState.AwaitAuth || generation != _linkGen) return;
            if (!ok)
            {
                FailAttempt(ReconnectTrigger.AuthFailed(errCode));
                return;
            }
            if (accountId != _accountId)
            {
                FailAttempt(ReconnectTrigger.AccountMismatch);
                return;
            }
            _token = token;
            EnterStep(ReconnectState.AwaitEnterWorld);
            _ports.StoreAuth(accountId, token);
            _ports.ReloadGameScene();
        }

        public void OnEnterWorldOk(int generation, int charId)
        {
            if (State != ReconnectState.AwaitEnterWorld || generation != _linkGen) return;
            if (charId != _charId)
            {
                FailAttempt(ReconnectTrigger.CharacterMismatch);
                return;
            }
            EnterArmed(byRecovery: true);
            _ports.HideOverlay();
            _ports.NotifyReconnected();
        }

        private static bool IsAttemptStep(ReconnectState s) =>
            s == ReconnectState.Connecting || s == ReconnectState.AwaitHelloAck
            || s == ReconnectState.AwaitAuth || s == ReconnectState.AwaitEnterWorld;

        private static bool IsAwaitingServer(ReconnectState s) =>
            s == ReconnectState.AwaitHelloAck || s == ReconnectState.AwaitAuth || s == ReconnectState.AwaitEnterWorld;

        private static ReconnectStep StepOf(ReconnectState s)
        {
            switch (s)
            {
                case ReconnectState.Connecting: return ReconnectStep.Connect;
                case ReconnectState.AwaitHelloAck: return ReconnectStep.AwaitHelloAck;
                case ReconnectState.AwaitAuth: return ReconnectStep.AwaitAuth;
                case ReconnectState.AwaitEnterWorld: return ReconnectStep.AwaitEnterWorld;
                default: return ReconnectStep.InWorld;
            }
        }

        private void OnLinkLost(ReconnectTrigger trigger)
        {
            if (State == ReconnectState.Armed) BeginRecovery(trigger);
            else if (IsAttemptStep(State)) FailAttempt(trigger);
        }

        private void EnterArmed(bool byRecovery)
        {
            State = ReconnectState.Armed;
            _attempt = 0;
            _armedByRecovery = byRecovery;
            _armedAt = _nowSec();
            SetFilter(false);
            SetWatchdog(ReconnectPolicy.WatchdogPongAgeSec);
        }

        private void BeginRecovery(ReconnectTrigger trigger)
        {
            var cls = ReconnectPolicy.Classify(trigger, ReconnectStep.InWorld);
            if (cls == ReconnectClass.Fatal || RecordFlap())
            {
                // 재입장할 때마다 곧 끊긴다 = 이 캐릭터의 입장이 서버를 죽이거나 서버가 받고 죽는다 — 재시도가 해를 키운다.
                EnterTerminal(cls == ReconnectClass.Fatal ? ReconnectState.Fatal : ReconnectState.GaveUp, trigger);
                return;
            }
            _startClass = _latestClass = cls;
            LastTrigger = trigger;
            _recoveryStart = _nowSec();
            _attempt = 0;
            bool afterWatchdog = trigger.Kind == TriggerKind.PongTimeout;
            Schedule(ReconnectPolicy.FirstDelaySec(cls, afterWatchdog, _rng));
        }

        // 무장 단절이 복구 재입장 뒤 FlapUptimeSec 안이면 기록 — FlapSpanSec 안 기록이 FlapLimit에 닿으면 true.
        private bool RecordFlap()
        {
            double now = _nowSec();
            if (!_armedByRecovery || now - _armedAt >= ReconnectPolicy.FlapUptimeSec) return false;
            _flaps.RemoveAll(t => now - t > ReconnectPolicy.FlapSpanSec);
            _flaps.Add(now);
            return _flaps.Count >= ReconnectPolicy.FlapLimit;
        }

        // 시도 실패 — 다음 상태(대기·종료)로 먼저 옮기고 그쪽이 연결을 내린다. 내리는 포트가 같은 시도의 결과를
        // 같은 호출 안에서 되돌려줘도(재진입) 이미 그 단계가 아니므로 같은 실패를 두 번 세지 않는다.
        private void FailAttempt(ReconnectTrigger trigger)
        {
            var cls = ReconnectPolicy.Classify(trigger, StepOf(State));
            if (cls == ReconnectClass.Fatal)
            {
                EnterTerminal(ReconnectState.Fatal, trigger);
                return;
            }
            LastTrigger = trigger;
            _latestClass = cls;
            _attempt++;
            double delay = ReconnectPolicy.RetryDelaySec(cls, _attempt, _rng);
            if (!ReconnectPolicy.FitsWindow(_recoveryStart, _nowSec() + delay, _startClass))
            {
                EnterTerminal(ReconnectState.GaveUp, trigger);
                return;
            }
            Schedule(delay);
        }

        private void EnterTerminal(ReconnectState terminal, ReconnectTrigger last)
        {
            bool wasRecovering = IsRecovering;
            State = terminal;
            LastTrigger = last;
            DropLink();
            ForgetCredentials();
            SetFilter(false);
            SetWatchdog(0.0);
            SetUnstable(false);
            // 재연결 오버레이를 닫고 기존 모달로 넘긴다 — 무장에서 곧장 끝났다면 띄운 오버레이가 없다.
            if (wasRecovering) _ports.HideOverlay();
            if (terminal == ReconnectState.Fatal) _ports.ShowFatal(last);
            else _ports.ShowGaveUp(last);
        }

        private void Stop(ReconnectState next)
        {
            bool wasRecovering = IsRecovering;
            State = next;
            if (wasRecovering) DropLink();
            else ForgetLink();
            ForgetCredentials();
            SetFilter(false);
            SetWatchdog(0.0);
            SetUnstable(false);
            if (wasRecovering) _ports.HideOverlay();
        }

        // 해제·취소·종료 뒤에는 Arm만 다시 시작한다(새 자격을 준다) — 1회용 세션 토큰 사본을 메모리에 남기지 않는다.
        private void ForgetCredentials()
        {
            _token = "";
            _accountId = 0;
            _charId = 0;
        }

        private void TickWaiting(double now)
        {
            if (now >= _nextAttemptAt)
            {
                // 창은 실제 시작 시각으로 판정한다 — 앱 일시정지 등으로 Tick이 늦어 창을 넘겼다면 시작하지 않는다.
                if (ReconnectPolicy.FitsWindow(_recoveryStart, now, _startClass)) StartAttempt();
                else EnterTerminal(ReconnectState.GaveUp, LastTrigger);
                return;
            }
            // 카운트다운은 올림한 정수 초가 바뀔 때만 다시 낸다.
            if (CountdownOf(now) != _shownCountdown) ShowStatus();
        }

        // 대기로 옮긴다 — 상태가 먼저라 아래 포트가 같은 호출 안에서 되돌려준 늦은 결과·단절은 대기에서 버려진다.
        private void Schedule(double delaySec)
        {
            State = ReconnectState.Waiting;
            _nextAttemptAt = _nowSec() + delaySec;
            SetWatchdog(0.0); // 복구 중엔 단계 시간 초과가 감시한다
            SetUnstable(false);
            SetFilter(true);
            DropLink(); // 대기에는 연결이 없다
            // 포트가 재진입해 기계를 옮겼다면(취소·해제) 그쪽이 마무리했다 — 오버레이를 다시 띄우지 않는다.
            if (State == ReconnectState.Waiting) ShowStatus();
        }

        private void StartAttempt()
        {
            int id = ++_attemptId;
            _ownsLink = true;
            EnterStep(ReconnectState.Connecting);
            ShowStatus();
            // 표시 포트가 재진입해 취소·해제했다면 아무도 소유하지 않을 연결을 열지 않는다.
            if (State == ReconnectState.Connecting && id == _attemptId) _ports.Connect(id, StepTimeout);
        }

        private int CountdownOf(double now) => (int)Math.Ceiling(Math.Max(0.0, _nextAttemptAt - now));

        private void ShowStatus()
        {
            var status = Status;
            _shownCountdown = (int)Math.Ceiling(status.SecondsUntilAttempt);
            _ports.ShowReconnecting(status);
        }

        private void EnterStep(ReconnectState step)
        {
            State = step;
            _stepStart = _nowSec();
            _stepDeadline = _stepStart + StepTimeout;
        }

        // 기계가 소유한 연결(대기 중 connect 포함)을 내린다. 이미 내려간 연결은 다시 내리지 않는다.
        private void DropLink()
        {
            bool owned = _ownsLink;
            ForgetLink();
            if (owned) _ports.Disconnect();
        }

        // 연결을 잊는다 — 이후 그 세대의 입력은 버려진다.
        private void ForgetLink()
        {
            _linkGen = NoLink;
            _ownsLink = false;
        }

        private void SetFilter(bool on)
        {
            if (_filterOn == on) return;
            _filterOn = on;
            _ports.SetRecoverySendFilter(on);
        }

        private void SetUnstable(bool on)
        {
            if (_unstableShown == on) return;
            _unstableShown = on;
            _ports.ShowUnstable(on);
        }

        private void SetWatchdog(double sec)
        {
            if (_watchdogSec == sec) return;
            _watchdogSec = sec;
            _ports.SetPongWatchdog(sec);
        }
    }
}
