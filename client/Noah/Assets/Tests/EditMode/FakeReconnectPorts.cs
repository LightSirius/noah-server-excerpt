// 재접속 순수 로직 시험용 가짜 — 고정 난수·수동 시계·호출을 기록하는 포트.

#if UNITY_INCLUDE_TESTS
using System.Collections.Generic;
using MMORPG.Net;

namespace MMORPG.Tests.EditMode
{
    /// <summary>항상 같은 [0,1) 값을 내는 난수 — 백오프 하한·상한을 정확히 짚는다.</summary>
    public sealed class FakeReconnectRandom : IReconnectRandom
    {
        public double Value;
        public FakeReconnectRandom(double value) { Value = value; }
        public double NextUnit() => Value;
    }

    public sealed class FakeReconnectClock
    {
        public double Now;
        public void Advance(double seconds) => Now += seconds;
    }

    /// <summary>포트 호출을 순서대로(Calls) 그리고 마지막 상태로 기록한다.</summary>
    public sealed class FakeReconnectPorts : IReconnectPorts
    {
        public readonly List<string> Calls = new List<string>();
        public readonly List<(int attemptId, double timeoutSec)> Connects = new List<(int, double)>();
        public readonly List<string> AuthTokens = new List<string>();
        public readonly List<ReconnectStatus> Statuses = new List<ReconnectStatus>();
        public readonly List<bool> UnstableChanges = new List<bool>();
        public int HelloCount, DisconnectCount, ReloadCount, ReconnectedCount, HideCount;
        public int StoredAccountId;
        public string StoredToken;
        public bool FilterOn;
        public double WatchdogSec;
        public ReconnectTrigger? Fatal, GaveUp;

        // 같은 호출 안에서 기계로 되돌아오는 포트 구현(재진입)을 흉내 낸다 — 기록 뒤에 부른다, null = 기록만.
        public System.Action<int> ConnectHook;
        public System.Action DisconnectHook;

        public ReconnectStatus LastStatus => Statuses[Statuses.Count - 1];

        public int LastAttemptId => Connects[Connects.Count - 1].attemptId;

        public void Connect(int attemptId, double timeoutSec)
        {
            Calls.Add("Connect");
            Connects.Add((attemptId, timeoutSec));
            ConnectHook?.Invoke(attemptId);
        }

        public void Disconnect()
        {
            Calls.Add("Disconnect");
            DisconnectCount++;
            DisconnectHook?.Invoke();
        }
        public void SendHello() { Calls.Add("SendHello"); HelloCount++; }

        public void SendTokenAuth(string token)
        {
            Calls.Add("SendTokenAuth");
            AuthTokens.Add(token);
        }

        public void StoreAuth(int accountId, string token)
        {
            Calls.Add("StoreAuth");
            StoredAccountId = accountId;
            StoredToken = token;
        }

        public void ReloadGameScene() { Calls.Add("ReloadGameScene"); ReloadCount++; }
        public void SetRecoverySendFilter(bool on) { Calls.Add($"Filter:{on}"); FilterOn = on; }
        public void SetPongWatchdog(double timeoutSec) { Calls.Add($"Watchdog:{timeoutSec}"); WatchdogSec = timeoutSec; }
        public void ShowReconnecting(ReconnectStatus status) { Calls.Add("ShowReconnecting"); Statuses.Add(status); }
        public void ShowUnstable(bool on) { Calls.Add($"Unstable:{on}"); UnstableChanges.Add(on); }
        public void ShowFatal(ReconnectTrigger last) { Calls.Add("ShowFatal"); Fatal = last; }
        public void ShowGaveUp(ReconnectTrigger last) { Calls.Add("ShowGaveUp"); GaveUp = last; }
        public void HideOverlay() { Calls.Add("HideOverlay"); HideCount++; }
        public void NotifyReconnected() { Calls.Add("NotifyReconnected"); ReconnectedCount++; }
    }
}
#endif
