// Phase 6 EntityInterpolation.
//
// architecture.md §8.2: 받은 스냅샷을 t-100ms 지연 큐에 저장. 매 프레임 lerp(prev, next, alpha).
// 100ms 버퍼는 표준값 — 지터·loss에 견고.
// 서버는 움직인 entity만 보낸다 — 멈췄다 다시 움직이면 첫 샘플과 직전(멈춘) 샘플 사이 간격이 멈춘 시간 전체라, 그 사이를 lerp하면
// 도착 순간 대부분을 건너뛰고(툭 튐) 남은 거리를 지연 버퍼 동안 기어간다. 멈춰 있었으면 직전 위치를 새 샘플 1 tick 앞에 다시 넣어
// 멈춘 자리에서 그대로 출발하게 한다(몬스터 추격 걷기·멈춤 리듬·배회, 멈췄다 걷는 원격 플레이어). 멈춤 판정은 서버 tick 번호로 한다
// (SNAPSHOT_DELTA tickIndex가 1보다 많이 건너뜀) — 도착 간격으로 보면 계속 움직이던 entity의 늦은 패킷(지터·프레임 히치)도 멈춤으로
// 오인해 잠깐 섰다가 달린다. tick을 모르는 첫 갱신(스폰 직후)만 도착 간격 > 지연 버퍼로 본다.
// 움직인 tick만 오므로 샘플 사이 이동은 늘 한 tick 분(최고 속도 3.2~4 u/s → 0.2)이다 — 그보다 훨씬 멀면(부활·GM 텔레포트) 순간이동이라
// 보간하지 않고 바로 옮긴다(멈춘 뒤 텔레포트를 보간하면 벽을 가로질러 미끄러진다).
// 샘플 시각은 SnapshotClock이 tick으로 찍은 시각(stampSec)을 쓴다 — 도착 시각으로 찍으면 끊겼다 몰려온 tick들이 한 시각에 겹쳐 멈췄다
// 튄다. 시각을 모르는 샘플(스폰 위치·시험)만 도착 시각. 찍힌 시각은 앞 샘플보다 앞서지 않게 묶는다(기준 오프셋이 내려가는 순간 대비).

using System.Collections.Generic;
using UnityEngine;

namespace MMORPG.Sim
{
    /// <summary>한 원격 entity의 위치 보간 상태.</summary>
    public class EntityInterpolation
    {
        public const float InterpDelaySec = 0.10f;     // 100ms 지연.
        /// <summary>멈췄다 다시 움직일 때 멈춘 위치를 새 샘플보다 이만큼 앞에 다시 넣는다 — 서버 1 tick(50 ms) 이동을 제 속도로 보간.</summary>
        public const float ResumeLeadSec = 0.05f;
        /// <summary>샘플 사이 이 거리를 넘으면 순간이동 — 보간 없이 바로 옮긴다(한 tick 걷기 ≤ 0.2의 10배).</summary>
        public const float TeleportSnapDistance = 2f;

        private struct Snapshot
        {
            public float TimeSec;   // 클라 로컬 시간(Time.time) — tick으로 찍은 시각, 모르면 도착 시점.
            public Vector2 Pos;
        }

        private readonly LinkedList<Snapshot> _samples = new();
        private const int MaxSamples = 32;

        private bool _hasTick;
        private uint _lastTick;

        public Vector2 CurrentPos { get; private set; }
        public bool HasData => _samples.Count > 0;

        /// <summary>
        /// serverTick = 이 위치를 실은 SNAPSHOT_DELTA의 tickIndex(null = 모름 — 스폰 위치). stampSec = SnapshotClock이 그 tick으로 찍은
        /// 시각(null = 도착 시각 nowSec을 쓴다).
        /// </summary>
        public void Push(Vector2 pos, float nowSec, uint? serverTick = null, float? stampSec = null)
        {
            var last = _samples.Last;
            float at = stampSec ?? nowSec;
            if (last != null && (pos - last.Value.Pos).sqrMagnitude > TeleportSnapDistance * TeleportSnapDistance)
            {
                _samples.Clear();
                CurrentPos = pos;
            }
            else if (last != null && ResumedAfterStop(nowSec - last.Value.TimeSec, serverTick))
            {
                // 멈춘 위치는 새 샘플 바로 앞 tick까지 그대로였다.
                float restUntil = stampSec.HasValue ? stampSec.Value - (float)SnapshotClock.TickSec : nowSec - ResumeLeadSec;
                _samples.AddLast(new Snapshot { TimeSec = Mathf.Max(last.Value.TimeSec, restUntil), Pos = last.Value.Pos });
            }
            if (serverTick.HasValue)
            {
                _lastTick = serverTick.Value;
                _hasTick = true;
            }
            if (stampSec.HasValue && _samples.Last != null) at = Mathf.Max(at, _samples.Last.Value.TimeSec);
            _samples.AddLast(new Snapshot { TimeSec = at, Pos = pos });
            while (_samples.Count > MaxSamples) _samples.RemoveFirst();
            if (_samples.Count == 1) CurrentPos = pos;
        }

        private bool ResumedAfterStop(float arrivalGapSec, uint? serverTick)
        {
            if (serverTick.HasValue && _hasTick) return unchecked((int)(serverTick.Value - _lastTick)) > 1;
            return arrivalGapSec > InterpDelaySec;
        }

        /// <summary>매 프레임 호출. nowSec는 Time.time. t-InterpDelay에 해당하는 lerp 결과.</summary>
        public Vector2 Sample(float nowSec)
        {
            if (_samples.Count == 0) return CurrentPos;
            float renderTime = nowSec - InterpDelaySec;

            // renderTime 이전 마지막 샘플 (prev) + 직후 샘플 (next) 찾기.
            Snapshot? prev = null, next = null;
            foreach (var s in _samples)
            {
                if (s.TimeSec <= renderTime) prev = s;
                else { next = s; break; }
            }

            if (prev == null && next != null) { CurrentPos = next.Value.Pos; return CurrentPos; }
            if (next == null && prev != null) { CurrentPos = prev.Value.Pos; return CurrentPos; }
            if (prev == null || next == null) return CurrentPos;

            float span = next.Value.TimeSec - prev.Value.TimeSec;
            float alpha = span > 1e-5f ? Mathf.Clamp01((renderTime - prev.Value.TimeSec) / span) : 1f;
            CurrentPos = Vector2.Lerp(prev.Value.Pos, next.Value.Pos, alpha);
            return CurrentPos;
        }
    }
}
