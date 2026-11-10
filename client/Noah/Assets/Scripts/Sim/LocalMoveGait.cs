// 로컬 플레이어의 걷기·달리기 선호 — 세션 상태(저장 안 함). 입력마다 InputSampler가 읽어 INPUT_CMD.gait로 싣는다(protocol.md §2.13).
//
// static인 이유: PlayerActor는 존 전환·재접속 GameScene 재로드마다 새로 만들어지는데 선호는 그걸 넘어 유지돼야 한다(재접속 뒤에도 다음 입력부터 다시 실린다).
// 새 로그인(LoginContext.Reset — 부팅·타이틀 복귀·세션 종료)에서만 달리기로 돌아간다.

using System;
using MMORPG.Net.Generated;
using UnityEngine;

namespace MMORPG.Sim
{
    public static class LocalMoveGait
    {
        public static MoveGait Current { get; private set; } = MoveGait.Run;

        /// <summary>바뀔 때만 — 렌더(걸음걸이)·HUD 표시용.</summary>
        public static event Action<MoveGait> Changed;

        public static void Toggle() => Set(Current == MoveGait.Run ? MoveGait.Walk : MoveGait.Run);

        public static void Reset() => Set(MoveGait.Run);

        private static void Set(MoveGait value)
        {
            if (value == Current) return;
            Current = value;
            Changed?.Invoke(value);
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetStatics()
        {
            Current = MoveGait.Run;
            Changed = null;
        }
    }
}
