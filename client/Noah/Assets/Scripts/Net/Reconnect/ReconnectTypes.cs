// 자동 재접속(토큰 재로그인 + GameScene 재입장) 순수 로직의 값 타입. UnityEngine 비의존 — EditMode 시험이 시계·난수·포트를 주입해 돌린다.

namespace MMORPG.Net
{
    /// <summary>KICK.reason — server/src/identity/loginFlow.ts KICK_REASON과 같은 값(protocol.md §3).</summary>
    public static class KickReason
    {
        public const int ProtoMismatch = 1;
        public const int AuthFail = 2;
        public const int Idle = 3;
        public const int AdminKick = 4;
        public const int Cheat = 5;
        public const int ServerShutdown = 6;
        public const int ContentMismatch = 7;
        public const int DuplicateLogin = 8;
        public const int ServerFull = 9;
    }

    /// <summary>AUTH_RESULT.errCode — server/src/identity/loginFlow.ts ERR_CODE와 같은 값.</summary>
    public static class AuthErrCode
    {
        public const int None = 0;
        public const int BadCredentials = 1;
        public const int Banned = 2;
        public const int RateLimited = 3;
        public const int ServerErr = 4;
    }

    /// <summary>재접속 분류 — 창(복구 전체 시간)은 복구를 시작한 분류가, 백오프는 마지막 실패의 분류가 정한다.</summary>
    public enum ReconnectClass
    {
        /// <summary>일시 단절(KICK 없는 종료·시간 초과·KICK 3).</summary>
        Blip,
        /// <summary>서버 재기동(KICK 6).</summary>
        Restart,
        /// <summary>복구 중 접속 거절(KICK 9·HELLO_ACK 전 종료).</summary>
        Busy,
        /// <summary>인월드 부하 감축(KICK 9) — 빨리 돌아오면 안 된다.</summary>
        Shed,
        /// <summary>재시도 금지.</summary>
        Fatal,
    }

    /// <summary>원인이 일어난 자리 — 인월드(무장) 또는 복구 핸드셰이크의 단계.</summary>
    public enum ReconnectStep
    {
        InWorld,
        Connect,
        AwaitHelloAck,
        AwaitAuth,
        AwaitEnterWorld,
    }

    /// <summary>
    /// KICK 없는 단절의 원인(ReconnectMachine.OnDisconnected 입력). 감독자가 전송 계층의 원인을 옮긴다 — EOF·소켓 오류 = Closed.
    /// 순수 로직이 전송 계층 타입에 묶이지 않게 따로 둔다.
    /// </summary>
    public enum LinkLossCause
    {
        Closed,
        PongTimeout,
    }

    public enum TriggerKind
    {
        /// <summary>KICK 없이 소켓이 닫혔다(EOF·RST·송수신 오류).</summary>
        Closed,
        /// <summary>PONG 감시가 연결을 내렸다.</summary>
        PongTimeout,
        /// <summary>TCP 연결 실패·시간 초과.</summary>
        ConnectFailed,
        /// <summary>복구 단계 시간 초과.</summary>
        StepTimeout,
        Kick,
        /// <summary>AUTH_RESULT ok=false.</summary>
        AuthFailed,
        /// <summary>AUTH_RESULT.accountId가 기억한 계정과 다르다.</summary>
        AccountMismatch,
        /// <summary>ENTER_WORLD_OK.charId가 기억한 캐릭터와 다르다.</summary>
        CharacterMismatch,
    }

    public enum ReconnectState
    {
        /// <summary>무장 전(인월드 아님·타이틀 복귀 뒤).</summary>
        Disarmed,
        /// <summary>인월드 — 단절을 감시한다.</summary>
        Armed,
        /// <summary>다음 시도까지 백오프 대기.</summary>
        Waiting,
        Connecting,
        AwaitHelloAck,
        AwaitAuth,
        /// <summary>GameScene 재로드 + ENTER_WORLD_OK 대기.</summary>
        AwaitEnterWorld,
        /// <summary>창 소진·플랩 — 모달 표시 중.</summary>
        GaveUp,
        /// <summary>재시도 금지 원인 — 모달 표시 중.</summary>
        Fatal,
        /// <summary>사용자가 "타이틀로"를 눌렀다.</summary>
        Cancelled,
    }

    /// <summary>재연결 오버레이 표시용 스냅샷.</summary>
    public readonly struct ReconnectStatus
    {
        public readonly ReconnectState State;
        /// <summary>복구를 시작한 분류(창을 정한다).</summary>
        public readonly ReconnectClass StartClass;
        /// <summary>마지막 실패의 분류(지금 백오프를 정했다).</summary>
        public readonly ReconnectClass Class;
        /// <summary>대기 중이거나 진행 중인 시도 번호(1부터).</summary>
        public readonly int Attempt;
        /// <summary>다음 시도까지 남은 초(시도 진행 중 = 0).</summary>
        public readonly double SecondsUntilAttempt;

        public ReconnectStatus(ReconnectState state, ReconnectClass startClass, ReconnectClass cls, int attempt, double secondsUntilAttempt)
        {
            State = state;
            StartClass = startClass;
            Class = cls;
            Attempt = attempt;
            SecondsUntilAttempt = secondsUntilAttempt;
        }
    }

    /// <summary>단절·실패 원인. KICK detail 문자열은 담지 않는다 — 분류 계약이 되면 안 된다.</summary>
    public readonly struct ReconnectTrigger : System.IEquatable<ReconnectTrigger>
    {
        public readonly TriggerKind Kind;
        /// <summary>Kind == Kick일 때만 의미.</summary>
        public readonly int KickReason;
        /// <summary>Kind == AuthFailed일 때만 의미.</summary>
        public readonly int AuthErrCode;

        private ReconnectTrigger(TriggerKind kind, int kickReason = 0, int authErrCode = 0)
        {
            Kind = kind;
            KickReason = kickReason;
            AuthErrCode = authErrCode;
        }

        public static ReconnectTrigger Closed => new ReconnectTrigger(TriggerKind.Closed);
        public static ReconnectTrigger PongTimeout => new ReconnectTrigger(TriggerKind.PongTimeout);
        public static ReconnectTrigger ConnectFailed => new ReconnectTrigger(TriggerKind.ConnectFailed);
        public static ReconnectTrigger StepTimeout => new ReconnectTrigger(TriggerKind.StepTimeout);
        public static ReconnectTrigger AccountMismatch => new ReconnectTrigger(TriggerKind.AccountMismatch);
        public static ReconnectTrigger CharacterMismatch => new ReconnectTrigger(TriggerKind.CharacterMismatch);
        public static ReconnectTrigger Kick(int reason) => new ReconnectTrigger(TriggerKind.Kick, kickReason: reason);
        public static ReconnectTrigger AuthFailed(int errCode) => new ReconnectTrigger(TriggerKind.AuthFailed, authErrCode: errCode);

        public bool Equals(ReconnectTrigger other) =>
            Kind == other.Kind && KickReason == other.KickReason && AuthErrCode == other.AuthErrCode;

        public override bool Equals(object obj) => obj is ReconnectTrigger other && Equals(other);

        public override int GetHashCode() => ((int)Kind * 397 ^ KickReason) * 397 ^ AuthErrCode;

        public override string ToString() => Kind switch
        {
            TriggerKind.Kick => $"Kick({KickReason})",
            TriggerKind.AuthFailed => $"AuthFailed({AuthErrCode})",
            _ => Kind.ToString(),
        };
    }
}
