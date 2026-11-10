namespace MMORPG.Net
{
    /// <summary>
    /// ReconnectMachine이 바깥(전송·씬·LoginContext·UI)에 내는 명령 — Unity 감독자가 구현한다.
    /// 기계는 호출 전에 자기 상태를 먼저 바꾸므로, 구현이 같은 호출 안에서 결과를 되돌려줘도(재진입) 된다 —
    /// 이미 지난 단계의 결과는 버려지고 같은 실패를 두 번 세지 않는다(EditMode 재진입 시험이 고정).
    /// </summary>
    public interface IReconnectPorts
    {
        /// <summary>새 연결 시작(이전 연결 해체 포함). 결과는 ReconnectMachine.OnConnectResult(attemptId, ok, 연결 세대)로 돌려준다.</summary>
        void Connect(int attemptId, double timeoutSec);

        /// <summary>현재 연결·대기 중 연결을 무음 해체(NetworkManager.Disconnect — Disconnected 통지 없음).</summary>
        void Disconnect();

        void SendHello();

        /// <summary>AUTH_REQ mode=Token(2), secret = token. 연결마다 최대 1회.</summary>
        void SendTokenAuth(string token);

        /// <summary>AUTH_RESULT ok의 새 토큰 저장(LoginContext.SetAuth) — 서버는 AUTH마다 토큰을 새로 발급하고 이전 것을 폐기한다.</summary>
        void StoreAuth(int accountId, string token);

        /// <summary>GameScene 재로드 — 새 씬의 진입 경로가 ENTER_WORLD_REQ를 보낸다.</summary>
        void ReloadGameScene();

        /// <summary>true = 송신 허용 목록(ReconnectPolicy.IsRecoverySendAllowed) 적용, false = 해제.</summary>
        void SetRecoverySendFilter(bool on);

        /// <summary>NetworkManager PONG 감시 임계(초, 0 = 끔).</summary>
        void SetPongWatchdog(double timeoutSec);

        /// <summary>재연결 오버레이 표시·갱신(차단형 — "타이틀로" 버튼 = ReconnectMachine.Cancel).</summary>
        void ShowReconnecting(ReconnectStatus status);

        /// <summary>비차단 "연결 불안정" 표시 켜기·끄기.</summary>
        void ShowUnstable(bool on);

        /// <summary>재시도 금지 원인 — 기존 모달(확인 → 타이틀). 복구 중이었다면 직전에 HideOverlay가 온다.</summary>
        void ShowFatal(ReconnectTrigger last);

        /// <summary>창 소진·플랩 가드로 포기 — 마지막 실패 원인으로 기존 모달. 복구 중이었다면 직전에 HideOverlay가 온다.</summary>
        void ShowGaveUp(ReconnectTrigger last);

        /// <summary>재연결 오버레이 닫기 — 복구 성공·취소·해제, 그리고 복구 중 종료(모달 직전). 모달은 닫지 않는다(기존 패널의 확인 몫).</summary>
        void HideOverlay();

        /// <summary>복구 성공(채팅 시스템 줄 등).</summary>
        void NotifyReconnected();
    }
}
