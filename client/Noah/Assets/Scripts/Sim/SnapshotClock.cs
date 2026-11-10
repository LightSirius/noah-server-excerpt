// 원격 엔티티 보간의 시간축 — SNAPSHOT_DELTA tickIndex를 "그 위치가 서버에서 생긴 클라 로컬 시각"으로 바꾼다.
//
// 도착 시각으로 샘플을 찍으면 네트워크가 잠깐 막혔다 풀릴 때(TCP·Wi-Fi 정지, 서버 tick 캐치업) 밀린 tick들이 한꺼번에 같은 시각으로
// 찍혀, 보간이 멈췄다가 막힌 시간만큼 툭 건너뛴다. 서버 tick은 50 ms 간격으로 생기므로 시각 = tick × 50 ms + 오프셋으로 찍으면 밀린
// tick도 제 간격으로 다시 재생된다 — 보간은 다음 샘플이 있어야 하므로 지연 버퍼(100 ms) − 한 tick = 약 50 ms까지의 끊김은 멈춤·튐 없이
// 흡수하고, 그보다 긴 끊김도 튀는 폭이 줄어든다(80 ms 끊김에서 절반 — SnapshotClockTests). 들쭉날쭉한 지연(지터)도 같은 이유로
// 고르게 펴진다. 오프셋은 최근 WindowSec 동안의 (도착 시각 − tick 시각) 최솟값 — 가장 빨리 온 패킷이 기준이라 찍힌 시각은 늘 도착 시각
// 이하다(미래 샘플 없음). 지연이 계속 늘면(늦은 도착이 ReanchorSec 넘게 이어짐) 기준을 다시 잡는다.
// 한 연결·한 존 안에서 tickIndex는 늘기만 한다 — 거꾸로 가면(존 전환·서버 재시작) 기준을 새로 잡는다.

using System.Collections.Generic;

namespace MMORPG.Sim
{
    public sealed class SnapshotClock
    {
        public const double TickSec = 0.05;
        /// <summary>오프셋 최솟값 창 — 이보다 짧은 끊김이면 끊기기 전의 빠른 도착이 기준으로 남는다.</summary>
        public const float WindowSec = 1.5f;
        /// <summary>
        /// 이보다 늦게 온 샘플은 보간이 제때 못 쓴다(지연 버퍼 − 한 tick). 이런 늦은 도착이 ReanchorSec 넘게 이어지면 지연이 계속 늘어난
        /// 것(경로 변경·서버 tick 건너뜀)으로 보고 기준을 지금 도착으로 다시 잡는다 — 안 하면 창(1.5초) 동안 원격 엔티티가 20 Hz 계단으로
        /// 움직인다. 끊김 뒤 몰려온 tick들은 같은 순간에 도착하므로 이 조건에 걸리지 않는다.
        /// </summary>
        public const float LateSec = EntityInterpolation.InterpDelaySec - (float)TickSec;
        public const float ReanchorSec = 0.15f;

        private struct OffsetSample
        {
            public float At;
            public double Offset;
        }

        // 창 안 최솟값 deque — 오프셋이 앞에서 뒤로 커진다(앞이 최솟값).
        private readonly LinkedList<OffsetSample> _mins = new();
        private bool _hasBase;
        private uint _baseTick;
        private uint _lastTick;
        private bool _late;
        private float _lateSince;

        public void Reset()
        {
            _mins.Clear();
            _hasBase = false;
            _late = false;
        }

        /// <summary>tick의 위치가 서버에서 생긴 클라 로컬 시각(늘 arrivalSec 이하). arrivalSec = 그 SNAPSHOT_DELTA를 받은 Time.time.</summary>
        public float Stamp(uint tick, float arrivalSec)
        {
            if (_hasBase && unchecked((int)(tick - _lastTick)) < 0) Reset();
            if (!_hasBase)
            {
                _baseTick = tick;
                _hasBase = true;
            }
            _lastTick = tick;
            double tickTime = unchecked((int)(tick - _baseTick)) * TickSec;
            double offset = arrivalSec - tickTime;
            while (_mins.Count > 0 && _mins.Last.Value.Offset >= offset) _mins.RemoveLast();
            _mins.AddLast(new OffsetSample { At = arrivalSec, Offset = offset });
            while (_mins.First.Value.At < arrivalSec - WindowSec) _mins.RemoveFirst();
            TrackLateness(offset, arrivalSec);
            return (float)(tickTime + _mins.First.Value.Offset);
        }

        private void TrackLateness(double offset, float arrivalSec)
        {
            if (offset - _mins.First.Value.Offset <= LateSec) _late = false;
            else if (!_late)
            {
                _late = true;
                _lateSince = arrivalSec;
            }
            else if (arrivalSec - _lateSince >= ReanchorSec)
            {
                _mins.Clear();
                _mins.AddLast(new OffsetSample { At = arrivalSec, Offset = offset });
                _late = false;
            }
        }
    }
}
