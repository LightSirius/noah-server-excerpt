// Phase F-5 ClientPrediction (Phase 6 -> path-aware).
//
// 서버 movementSystem(server/src/world/systems/movementSystem.ts)의 C# 포팅.
// 우선순위: 키보드 dx/dy -> MovePath -> idle. 서버와 동일 로직.
// MaxSpeed/TickDtSec/대각선 정규화 상수 일치 보장.
//
// Phase F-5 변경:
//   - SetGoal/ClearGoal 폐기. SetPath(waypoints)로 대체.
//   - 우클릭 즉시 fallback: 1-segment 직선 path. SC_MOVE_PATH 도착 시 진짜 path로 교체.
//   - 키보드 입력은 path 즉시 클리어 (movementSystem과 동일).
//
// 걷기·달리기: 입력마다 gait를 싣고(InputCmd.Gait) history가 그 값을 보관한다 — 재시뮬은 "그 입력의 속도"로(적용 당시 path와 같은 규칙).
// 현재 선호로 소급하면 전환 순간 미ack 창만큼 위치가 튄다.
//
// 본 클래스는 MonoBehaviour가 아닌 plain C# state object — PlayerActor가 보유.

using System.Collections.Generic;
using MMORPG.Net.Generated;
using MMORPG.World;
using MMORPG.World.Nav;
using UnityEngine;

namespace MMORPG.Sim
{
    public struct PredictedSnapshot
    {
        public int Seq;
        public Vector2 Pos;
    }

    public class ClientPrediction
    {
        // server movementSystem 상수와 정확히 일치해야 함.
        public const float MaxSpeed = CharacterGait.RunSpeedU;   // 달리기 = 서버 MAX_SPEED, 월드 단위/초.
        public const float WalkSpeed = CharacterGait.WalkSpeedU; // 걷기 = 서버 WALK_SPEED.
        public const float TickDtSec = 1f / 20f;       // 서버 20Hz.
        private const float InvSqrt2 = 0.70710678118654752f;

        public static float SpeedOf(MoveGait gait) => gait == MoveGait.Walk ? WalkSpeed : MaxSpeed;

        // 미적용 history. 재조정 시 seq <= ackSeq 항목 폐기, > ackSeq 항목 재시뮬.
        // 각 항목은 적용 당시의 path 인스턴스·진행 index를 함께 보관 — 재시뮬은 "그 시점의 path"로.
        // (현재 path로 소급 재시뮬하면 방향 전환 순간 미ack 구간만큼 새 방향으로 점프한다.)
        private struct HistoryEntry
        {
            public InputCmd Cmd;
            public List<Vector2> Path;
            public int PreIdx;
        }

        private readonly LinkedList<HistoryEntry> _history = new();
        private const int MaxHistory = 256;

        // 현재 추종 중인 path. 키보드 입력 시 클리어. 서버 movementSystem.MovePath와 매핑.
        // 교체(SetPath/ClearPath)는 인스턴스 스왑 — history의 옛 항목이 이전 path를 계속 참조한다.
        private List<Vector2> _path = new();
        private int _pathIndex;

        public Vector2 PredictedPos { get; private set; }
        public int LastAppliedSeq { get; private set; }

        /// <summary>마지막 ResetCorrectionPeak 뒤 재조정이 예측 위치를 옮긴 가장 큰 거리(월드 단위) — 예측이 서버와 어긋난 정도의 진단값.</summary>
        public float CorrectionPeak { get; private set; }

        public void ResetCorrectionPeak() => CorrectionPeak = 0f;

        /// <summary>
        /// 존 NavGrid — 키보드 이동을 서버와 같은 규칙으로 벽·맵 경계에 슬라이드시킨다(NavCollide). null이면 충돌 없음(종전).
        /// PlayerActor가 존 진입 시 주입한다(존 전환마다 PlayerActor가 새로 만들어진다).
        /// </summary>
        public NavGrid Nav { get; set; }

        public void Initialize(Vector2 spawn)
        {
            PredictedPos = spawn;
            _history.Clear();
            _path = new List<Vector2>();
            _pathIndex = 0;
            LastAppliedSeq = 0;
        }

        /// <summary>새 path를 셋. 시작점은 포함하지 않음 (다음에 갈 곳들). 키보드 입력 시 자동 클리어.</summary>
        public void SetPath(IList<Vector2> waypoints)
        {
            var next = new List<Vector2>(waypoints?.Count ?? 0);
            if (waypoints != null)
            {
                for (int i = 0; i < waypoints.Count; i++) next.Add(waypoints[i]);
            }
            _path = next;
            _pathIndex = 0;
        }

        public void ClearPath()
        {
            // 이미 빈 path면 인스턴스 유지 — 연속 키보드 입력의 per-tick 할당 방지.
            if (_path.Count > 0) _path = new List<Vector2>();
            _pathIndex = 0;
        }
        public int PathCount => _path.Count;
        public int PathIndex => _pathIndex;
        /// <summary>반환 인스턴스를 변경하지 말 것 — 재조정 세대 구분이 참조 동일성에 의존.</summary>
        public IReadOnlyList<Vector2> Path => _path;

        /// <summary>한 input 적용 → 새 위치. 적용 당시 path 컨텍스트와 함께 history에 push.</summary>
        public Vector2 Apply(InputCmd cmd)
        {
            bool isKeyboard = cmd.Dx != 0 || cmd.Dy != 0;
            if (isKeyboard) ClearPath();

            var entry = new HistoryEntry { Cmd = cmd, Path = _path, PreIdx = _pathIndex };
            PredictedPos = StepWithPath(PredictedPos, cmd.Dx, cmd.Dy, _path, ref _pathIndex, Nav, SpeedOf(cmd.Gait));
            LastAppliedSeq = cmd.Seq;
            _history.AddLast(entry);
            while (_history.Count > MaxHistory) _history.RemoveFirst();
            return PredictedPos;
        }

        /// <summary>
        /// 재조정: ackSeq 이하 history 삭제, server 위치를 새 baseline으로 두고 미적용 input 재시뮬.
        /// 각 input은 "적용 당시의 path"로 스텝한다 — 우클릭/SC_MOVE_PATH로 path가 교체됐어도
        /// 교체 이전 input에 새 path를 소급 적용하지 않는다(키보드 클리어와 대칭인 규칙).
        /// </summary>
        public Vector2 Reconcile(int ackSeq, Vector2 serverPos)
        {
            while (_history.First != null && _history.First.Value.Cmd.Seq <= ackSeq)
                _history.RemoveFirst();

            var pos = serverPos;
            List<Vector2> simPath = null;
            int simIdx = 0;
            foreach (var entry in _history)
            {
                // path 인스턴스가 바뀌는 지점 = 그 시점의 SetPath/ClearPath. index는 당시 값으로 재개.
                if (!ReferenceEquals(entry.Path, simPath)) { simPath = entry.Path; simIdx = entry.PreIdx; }
                pos = StepWithPath(pos, entry.Cmd.Dx, entry.Cmd.Dy, simPath, ref simIdx, Nav, SpeedOf(entry.Cmd.Gait));
            }
            // 재시뮬이 현재 path까지 도달했으면 진행 index를 재시뮬 결과로 동기화.
            if (ReferenceEquals(simPath, _path)) _pathIndex = simIdx;

            CorrectionPeak = Mathf.Max(CorrectionPeak, Vector2.Distance(PredictedPos, pos));
            PredictedPos = pos;
            return pos;
        }

        public static Vector2 StepOnce(Vector2 from, int dx, int dy) => StepOnce(from, dx, dy, null, MaxSpeed);

        /// <summary>키보드 1 tick — nav가 있으면 서버 slideMove와 같은 벽·경계 슬라이드.</summary>
        public static Vector2 StepOnce(Vector2 from, int dx, int dy, NavGrid nav, float speed = MaxSpeed)
        {
            int ix = dx == 0 ? 0 : (dx > 0 ? 1 : -1);
            int iy = dy == 0 ? 0 : (dy > 0 ? 1 : -1);
            float vx, vy;
            if (ix == 0 && iy == 0) { vx = 0; vy = 0; }
            else if (ix != 0 && iy != 0)
            {
                vx = ix * speed * InvSqrt2;
                vy = iy * speed * InvSqrt2;
            }
            else
            {
                vx = ix * speed;
                vy = iy * speed;
            }
            if (nav != null) return NavCollide.SlideMove(nav, from, vx * TickDtSec, vy * TickDtSec);
            return new Vector2(from.x + vx * TickDtSec, from.y + vy * TickDtSec);
        }

        /// <summary>
        /// 키보드 dx/dy 우선. 없으면 path를 따라 step (잔여 step으로 다음 segment로 이어 진행).
        /// path 끝 도달 시 path/index를 그대로 둠 (호출자가 PathCount/PathIndex로 판단).
        /// </summary>
        private static Vector2 StepWithPath(Vector2 from, int dx, int dy, List<Vector2> path, ref int idx, NavGrid nav, float speed)
        {
            if (dx != 0 || dy != 0) return StepOnce(from, dx, dy, nav, speed);
            float remaining = speed * TickDtSec;
            var pos = from;
            while (idx < path.Count && remaining > 0)
            {
                var t = path[idx];
                float gdx = t.x - pos.x;
                float gdy = t.y - pos.y;
                float dist = Mathf.Sqrt(gdx * gdx + gdy * gdy);
                if (dist == 0) { idx++; continue; }
                if (dist <= remaining)
                {
                    pos = t;
                    remaining -= dist;
                    idx++;
                }
                else
                {
                    float inv = 1f / dist;
                    pos = new Vector2(pos.x + gdx * inv * remaining, pos.y + gdy * inv * remaining);
                    remaining = 0;
                }
            }
            return pos;
        }

        public int PendingCount => _history.Count;
    }
}
