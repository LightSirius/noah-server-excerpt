// Phase 6 Reconciler.
//
// SC_SNAPSHOT_DELTA payload(snapshotBuilder.ts 출력)를 받아 본인 entity의 ackSeq + 위치만
// 추출 → ClientPrediction에 위임.
//
// 페이로드 = 코드젠 SnapshotDeltaPayload(PacketBus가 생성 바이너리 코덱 WireCodec으로 디코드):
//   { TickIndex:uint, AckSeq:uint, Updates:[{EntityId:uint, X:float, Y:float}] }
// 와이어는 u32지만 entity id·seq는 클라 전역에서 int다 — 종전 수기 디코더와 같은 unchecked 재해석으로 맞춘다
// (서버 entity id·ackSeq는 i32 양수 범위라 값이 바뀌지 않는다).

using System;
using MMORPG.Net;
using MMORPG.Net.Generated;
using UnityEngine;

namespace MMORPG.Sim
{
    public class Reconciler : IDisposable
    {
        public delegate void ServerCorrection(int ackSeq, Vector2 serverPos);

        private readonly int _selfEntityId;
        private readonly Subscription _sub;

        /// <summary>위치 미스매치를 감지할 임계값(월드 단위). 내부 부동소수 epsilon보다 약간 큼.</summary>
        public float MismatchEpsilon { get; set; } = 0.01f;

        public event ServerCorrection OnServerSnapshot;

        public Reconciler(int selfEntityId)
        {
            _selfEntityId = selfEntityId;
            _sub = PacketBus.Subscribe<SnapshotDeltaPayload>(PacketIds.SNAPSHOT_DELTA, OnDelta);
        }

        public void Dispose() => _sub.Dispose();

        private void OnDelta(SnapshotDeltaPayload p)
        {
            if (p?.Updates == null) return;
            foreach (var u in p.Updates)
            {
                if (unchecked((int)u.EntityId) != _selfEntityId) continue;
                OnServerSnapshot?.Invoke(unchecked((int)p.AckSeq), new Vector2(u.X, u.Y));
                return;
            }
        }
    }
}
