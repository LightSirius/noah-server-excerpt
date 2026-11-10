// 자동 재접속 정책 — 분류·백오프·창·시간 초과의 수치를 모두 여기 한 곳에 둔다. 순수 함수(상태 없음, UnityEngine 비의존).
// 분류 입력은 (KICK reason 또는 없음, 단계)뿐 — KICK detail 문자열로 가르지 않는다(서버가 계약으로 고정하지 않은 문구).

using System;
using MMORPG.Net.Generated;

namespace MMORPG.Net
{
    public static class ReconnectPolicy
    {
        /// <summary>서버 인월드 idle 컷(env IN_WORLD_IDLE_SEC 기본) — 유령 세션이 상한을 쥐는 최대 시간. Blip·Busy 창은 이 이상이어야 한다.</summary>
        public const double ServerInWorldIdleCutSec = 60.0;

        /// <summary>무장 중 PONG 나이가 이 이상이면 비차단 "연결 불안정" 표시(1 Hz PING 기준 약 5회 무응답).</summary>
        public const double UnstablePongAgeSec = 5.0;

        /// <summary>
        /// 무장 중 PONG 감시 해체 임계. 클라 PING은 월드가 답하므로 월드 정지가 모든 클라를 동시에 침묵시킨다 —
        /// 서버가 견디는 정지보다 길게 잡아 월드 정지가 전원 재접속 폭주로 번지지 않게 한다.
        /// </summary>
        public const double WatchdogPongAgeSec = 45.0;

        /// <summary>플랩 가드: FlapSpanSec 안에 재입장 후 FlapUptimeSec 미만으로 끊긴 복구가 FlapLimit번이면 포기.</summary>
        public const double FlapUptimeSec = 30.0;
        public const double FlapSpanSec = 300.0;
        public const int FlapLimit = 3;

        // 단계 시간 초과(connect·HELLO_ACK·AUTH_RESULT·ENTER_WORLD_OK(씬 로드 포함)) — 시도 번호로 늘린다.
        // 재접속 폭주 때 핸드셰이크 p99가 약 50초였다(architecture.md 지속 과부하·접속 폭주 행) — 짧으면 수렴하지 못한다.
        private static readonly double[] StepTimeoutsSec = { 15.0, 30.0, 60.0 };

        private readonly struct Backoff
        {
            public readonly double FirstMin, FirstMax, Floor, Base, Cap, Window;

            public Backoff(double firstMin, double firstMax, double floor, double @base, double cap, double window)
            {
                FirstMin = firstMin; FirstMax = firstMax; Floor = floor; Base = @base; Cap = cap; Window = window;
            }
        }

        // 첫 시도는 FirstMin + U(0, FirstMax − FirstMin), 재시도 n ≥ 1은 Floor + U(0, min(Cap, Base·2^n)) — 모두 초.
        // Busy는 복구를 시작하지 않으므로(복구 중 거절에만 쓰인다) 창은 시작 분류의 것이 쓰이지만, 정의는 Blip 창과 같게 둔다.
        private static readonly Backoff Blip = new Backoff(0.0, 5.0, 0.5, 1.0, 10.0, 90.0);
        private static readonly Backoff Restart = new Backoff(1.0, 6.0, 0.5, 1.0, 15.0, 180.0);
        private static readonly Backoff Busy = new Backoff(5.0, 10.0, 5.0, 5.0, 60.0, 90.0);
        private static readonly Backoff Shed = new Backoff(30.0, 60.0, 30.0, 30.0, 120.0, 300.0);

        /// <summary>PONG 감시로 끊긴 Blip의 첫 시도 상한 — 월드 정지로 한꺼번에 끊긴 클라를 더 넓게 흩는다.</summary>
        private const double WatchdogFirstMaxSec = 10.0;

        // 복구 중 송신 허용 — 인증 전 버킷(10개, 초당 10)을 다른 패킷이 쓰면 첫 위반이 KICK 5(치명)다.
        private static readonly ushort[] RecoverySends = { PacketIds.PING, PacketIds.HELLO, PacketIds.AUTH_REQ, PacketIds.ENTER_WORLD_REQ };

        public static ReconnectClass Classify(ReconnectTrigger trigger, ReconnectStep step)
        {
            switch (trigger.Kind)
            {
                case TriggerKind.Kick:
                    return ClassifyKick(trigger.KickReason, step);
                case TriggerKind.Closed:
                    // HELLO_ACK 전 종료 = 접속 단계 거절(Windows는 KICK 없이 맨 RST로 올 수 있다).
                    return step == ReconnectStep.Connect || step == ReconnectStep.AwaitHelloAck
                        ? ReconnectClass.Busy
                        : ReconnectClass.Blip;
                case TriggerKind.PongTimeout:
                case TriggerKind.ConnectFailed:
                case TriggerKind.StepTimeout:
                    return ReconnectClass.Blip;
                case TriggerKind.AuthFailed:
                    // ServerErr만 서버 쪽 일시 장애 — 토큰 거절·만료·미지 코드는 재시도해도 같다.
                    // 단 새 토큰 발급 단계의 ServerErr는 옛 토큰을 이미 소비했다 — 같은 토큰 재시도가 BadCredentials(치명)로
                    // 끝나는 것은 서버가 감수한 트레이드오프다(authHandler — 클라는 로그인 화면으로). 모달 문구는 감독자 몫.
                    return trigger.AuthErrCode == AuthErrCode.ServerErr ? ReconnectClass.Blip : ReconnectClass.Fatal;
                default:
                    return ReconnectClass.Fatal;
            }
        }

        private static ReconnectClass ClassifyKick(int reason, ReconnectStep step)
        {
            switch (reason)
            {
                case KickReason.Idle:
                    return ReconnectClass.Blip;
                case KickReason.ServerShutdown:
                    return ReconnectClass.Restart;
                case KickReason.ServerFull:
                    // 인월드 KICK 9 = 의도적 부하 감축, 복구 중 KICK 9 = 접속 상한·혼잡 거절.
                    return step == ReconnectStep.InWorld ? ReconnectClass.Shed : ReconnectClass.Busy;
                default:
                    // 1·2·4·5·7, 8(재시도하면 두 클라가 서로를 영원히 선점한다), 0·미지 사유는 보수적으로 치명.
                    return ReconnectClass.Fatal;
            }
        }

        /// <summary>복구 첫 시도까지의 대기(초) — 복구를 시작한 분류로 정한다.</summary>
        public static double FirstDelaySec(ReconnectClass startClass, bool afterWatchdog, IReconnectRandom rng)
        {
            var b = BackoffOf(startClass);
            double max = startClass == ReconnectClass.Blip && afterWatchdog ? WatchdogFirstMaxSec : b.FirstMax;
            return b.FirstMin + (max - b.FirstMin) * rng.NextUnit();
        }

        /// <summary>재시도 n(≥ 1)까지의 대기(초) — 마지막 실패의 분류로 정한다(full jitter).</summary>
        public static double RetryDelaySec(ReconnectClass latestClass, int retry, IReconnectRandom rng)
        {
            if (retry < 1) throw new ArgumentOutOfRangeException(nameof(retry), retry, "retry starts at 1");
            var b = BackoffOf(latestClass);
            // 2^30이면 어느 분류든 상한을 넘는다 — 지수 폭주 방지.
            double span = Math.Min(b.Cap, b.Base * Math.Pow(2.0, Math.Min(retry, 30)));
            return b.Floor + span * rng.NextUnit();
        }

        /// <summary>복구 창(초) — 첫 단절부터 잰다. 시작 분류로 고정되고 이후 실패는 백오프만 바꾼다.</summary>
        public static double WindowSec(ReconnectClass startClass) =>
            startClass == ReconnectClass.Fatal ? 0.0 : BackoffOf(startClass).Window;

        /// <summary>attemptAt에 시작할 시도가 창 안인가. 진행 중인 시도는 창을 넘겨도 끝까지 둔다(판정은 시작 시각만).</summary>
        public static bool FitsWindow(double recoveryStartSec, double attemptAtSec, ReconnectClass startClass) =>
            startClass != ReconnectClass.Fatal && attemptAtSec <= recoveryStartSec + WindowSec(startClass);

        /// <summary>복구 시도(0부터)의 단계 시간 초과(초): 15 → 30 → 60 상한.</summary>
        public static double StepTimeoutSec(int attemptIndex) =>
            StepTimeoutsSec[Math.Max(0, Math.Min(attemptIndex, StepTimeoutsSec.Length - 1))];

        /// <summary>단계 대기 중 PONG(진행 증거) 뒤의 기한 — now + timeout으로 밀되 줄이지 않고, 단계 시작 + 2 × timeout을 넘지 않는다.</summary>
        public static double DeadlineAfterProgress(double stepStartSec, double deadlineSec, double nowSec, double timeoutSec) =>
            Math.Min(stepStartSec + 2.0 * timeoutSec, Math.Max(deadlineSec, nowSec + timeoutSec));

        /// <summary>복구 중(ENTER_WORLD_OK 전) 송신해도 되는 패킷인가.</summary>
        public static bool IsRecoverySendAllowed(ushort packetId) => Array.IndexOf(RecoverySends, packetId) >= 0;

        private static Backoff BackoffOf(ReconnectClass cls)
        {
            switch (cls)
            {
                case ReconnectClass.Blip: return Blip;
                case ReconnectClass.Restart: return Restart;
                case ReconnectClass.Busy: return Busy;
                case ReconnectClass.Shed: return Shed;
                default: throw new ArgumentOutOfRangeException(nameof(cls), cls, "no backoff for this class");
            }
        }
    }
}
