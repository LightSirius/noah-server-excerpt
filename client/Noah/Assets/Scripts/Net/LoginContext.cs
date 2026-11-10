// LoginContext — LoginScene → GameScene을 가로지르는 세션 상태.
//
// LoginUI가 인증/캐릭터 선택 후 채우고, GameScene의 EnterWorldBootstrap이 소비.
// NetworkManager는 순수 전송 계층(CLAUDE.md)이라 여기에 보관하지 않는다.
//
// 외부 직접 set은 금지 — SetAuth/SetCharacter/Reset 메서드로만 변경 가능.
// readonly snapshot만 노출해 화면·핸들러에서의 무의식 mutation을 차단한다.

namespace MMORPG.Net
{
    public static class LoginContext
    {
        public static int AccountId { get; private set; }
        public static string SessionToken { get; private set; } = "";
        public static int CharId { get; private set; }
        public static string Username { get; private set; } = "";
        public static string CharName { get; private set; } = "";

        public static bool IsReady => CharId != 0 && !string.IsNullOrEmpty(SessionToken);

        public static void SetAuth(int accountId, string sessionToken, string username)
        {
            AccountId = accountId;
            SessionToken = sessionToken ?? "";
            Username = username ?? "";
        }

        public static void SetCharacter(int charId, string charName)
        {
            CharId = charId;
            CharName = charName ?? "";
        }

        public static void Reset()
        {
            AccountId = 0;
            SessionToken = "";
            CharId = 0;
            Username = "";
            CharName = "";
            MMORPG.Sim.LocalMoveGait.Reset(); // 새 로그인은 달리기로 시작 — 자동 재접속은 여기를 지나지 않아 선호가 유지된다.
        }
    }
}
