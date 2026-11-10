// 원격 entity 보간(Sim/EntityInterpolation.cs) — 멈췄다 다시 움직일 때 툭 튀지 않는다(서버는 움직인 entity만 보낸다 — 몬스터 걷기·멈춤
// 리듬·배회). 간격 없는 샘플은 종전 lerp 그대로, 멈추면 마지막 샘플에서 넘어가지 않는다.

#if UNITY_INCLUDE_TESTS
using MMORPG.Sim;
using NUnit.Framework;
using UnityEngine;

namespace MMORPG.Tests.EditMode
{
    public sealed class EntityInterpolationTests
    {
        private const float Eps = 1e-4f;

        private static void AssertPos(Vector2 expected, Vector2 actual)
        {
            Assert.AreEqual(expected.x, actual.x, Eps, "x");
            Assert.AreEqual(expected.y, actual.y, Eps, "y");
        }

        [Test]
        public void ResumeAfterPause_StartsFromRestWithoutSnap()
        {
            var interp = new EntityInterpolation();
            interp.Push(new Vector2(0f, 0f), 0f);
            interp.Push(new Vector2(0.1f, 0f), 0.05f);
            interp.Push(new Vector2(0.2f, 0f), 0.10f);
            // 0.5초 멈춤(샘플 없음) 뒤 한 tick(0.125) 움직인 샘플.
            interp.Push(new Vector2(0.325f, 0f), 0.60f);

            AssertPos(new Vector2(0.2f, 0f), interp.Sample(0.60f)); // 도착 순간 — 종전엔 0.3까지 건너뛰었다
            AssertPos(new Vector2(0.2f, 0f), interp.Sample(0.65f)); // 멈춘 자리 유지(새 샘플 1 tick 앞까지)
            AssertPos(new Vector2(0.2625f, 0f), interp.Sample(0.675f)); // 1 tick을 제 속도로
            AssertPos(new Vector2(0.325f, 0f), interp.Sample(0.70f));
        }

        [Test]
        public void FirstMoveLongAfterSpawn_StartsFromSpawn()
        {
            var interp = new EntityInterpolation();
            interp.Push(new Vector2(5f, 5f), 0f);
            interp.Push(new Vector2(5.125f, 5f), 3f);
            AssertPos(new Vector2(5f, 5f), interp.Sample(3f));
            AssertPos(new Vector2(5f, 5f), interp.Sample(3.05f));
            AssertPos(new Vector2(5.125f, 5f), interp.Sample(3.10f));
        }

        [Test]
        public void ContiguousSamples_InterpolateLinearly()
        {
            var interp = new EntityInterpolation();
            for (int i = 0; i <= 10; i++) interp.Push(new Vector2(i, -i), i * 0.05f);
            AssertPos(new Vector2(1.5f, -1.5f), interp.Sample(0.175f)); // renderTime 0.075 = 1과 2 사이 절반
            AssertPos(new Vector2(4f, -4f), interp.Sample(0.30f));
        }

        [Test]
        public void JitterWithinBuffer_DoesNotHold()
        {
            // 지연 버퍼(100 ms) 이하 간격은 보정 없이 그대로 잇는다.
            var interp = new EntityInterpolation();
            interp.Push(new Vector2(0f, 0f), 0f);
            interp.Push(new Vector2(1f, 0f), 0.09f);
            AssertPos(new Vector2(0.5f, 0f), interp.Sample(0.145f));
        }

        [Test]
        public void ContinuousMoverLateSample_DoesNotHold()
        {
            // 연속 tick(1, 2, 3) — 세 번째가 150 ms 늦게 왔다(지터·프레임 히치). 멈춘 게 아니니 세웠다 달리지 않고 그대로 잇는다.
            var interp = new EntityInterpolation();
            interp.Push(new Vector2(0f, 0f), 0f, 1u);
            interp.Push(new Vector2(1f, 0f), 0.05f, 2u);
            interp.Push(new Vector2(2f, 0f), 0.20f, 3u);
            AssertPos(new Vector2(1f + 2f / 3f, 0f), interp.Sample(0.25f)); // renderTime 0.15 = 1과 2 사이 2/3
        }

        [Test]
        public void TickGapResume_HoldsEvenWhenArrivalGapIsShort()
        {
            // tick 3 뒤 9 tick 멈췄다가 tick 13 — 도착은 몰려서 60 ms 간격이어도 멈춘 자리에서 출발한다.
            var interp = new EntityInterpolation();
            interp.Push(new Vector2(0f, 0f), 0f, 2u);
            interp.Push(new Vector2(0.2f, 0f), 0.05f, 3u);
            interp.Push(new Vector2(0.325f, 0f), 0.11f, 13u);
            AssertPos(new Vector2(0.2f, 0f), interp.Sample(0.16f)); // renderTime 0.06 = 멈춘 자리(종전 lerp면 0.2 너머)
            AssertPos(new Vector2(0.325f, 0f), interp.Sample(0.21f));
        }

        [Test]
        public void TickGapResume_HoldNeverPrecedesLastSample()
        {
            // 멈추기 직전 샘플이 늦게 와서 재출발 샘플과 20 ms 차이 — 다시 넣는 멈춘 자리는 직전 샘플보다 앞서지 않는다(시간 순서 유지).
            var interp = new EntityInterpolation();
            interp.Push(new Vector2(0f, 0f), 0f, 2u);
            interp.Push(new Vector2(0.2f, 0f), 0.05f, 3u);
            interp.Push(new Vector2(0.325f, 0f), 0.07f, 13u);
            AssertPos(new Vector2(0.2f, 0f), interp.Sample(0.15f));
            AssertPos(new Vector2(0.2625f, 0f), interp.Sample(0.16f)); // 멈춘 자리(0.05)→새 샘플(0.07) 절반
            float prev = -1f;
            for (float t = 0.10f; t <= 0.20f; t += 0.005f)
            {
                float x = interp.Sample(t).x;
                Assert.GreaterOrEqual(x, prev - Eps, $"뒤로 감 t={t}");
                prev = x;
            }
        }

        [Test]
        public void SpawnWithoutTickThenDeltaWithTick_HoldsFromSpawn()
        {
            // 실제 순서 — 스폰 위치(tick 모름) 뒤 첫 SNAPSHOT_DELTA(tick 있음)가 한참 뒤에 온다.
            var interp = new EntityInterpolation();
            interp.Push(new Vector2(5f, 5f), 0f);
            interp.Push(new Vector2(5.125f, 5f), 3f, 100u);
            AssertPos(new Vector2(5f, 5f), interp.Sample(3f));
            AssertPos(new Vector2(5f, 5f), interp.Sample(3.05f));
            AssertPos(new Vector2(5.125f, 5f), interp.Sample(3.10f));
        }

        [Test]
        public void TeleportAfterStop_SnapsWithoutSliding()
        {
            // 죽어서 5초 서 있다가 부활 텔레포트(30칸) — 중간 위치를 그리지 않는다.
            var interp = new EntityInterpolation();
            interp.Push(new Vector2(0.1f, 0f), 0f, 1u);
            interp.Push(new Vector2(0.2f, 0f), 0.05f, 2u);
            interp.Push(new Vector2(30f, 0f), 5.05f, 102u);
            for (float t = 5.05f; t <= 5.30f; t += 0.0166f) AssertPos(new Vector2(30f, 0f), interp.Sample(t));
        }

        [Test]
        public void TeleportWhileMoving_Snaps()
        {
            var interp = new EntityInterpolation();
            interp.Push(new Vector2(0f, 0f), 0f, 1u);
            interp.Push(new Vector2(0.2f, 0f), 0.05f, 2u);
            interp.Push(new Vector2(20f, 20f), 0.10f, 3u);
            AssertPos(new Vector2(20f, 20f), interp.Sample(0.10f));
        }

        [Test]
        public void TickWraparound_ContiguousIsNotAStop()
        {
            var interp = new EntityInterpolation();
            interp.Push(new Vector2(0f, 0f), 0f, uint.MaxValue);
            interp.Push(new Vector2(1f, 0f), 0.20f, 0u); // u32 넘어감 — 차 1
            AssertPos(new Vector2(0.5f, 0f), interp.Sample(0.20f));
        }

        [Test]
        public void Stop_HoldsLastSampleWithoutOvershoot()
        {
            var interp = new EntityInterpolation();
            interp.Push(new Vector2(0f, 0f), 0f);
            interp.Push(new Vector2(0.2f, 0f), 0.05f);
            interp.Push(new Vector2(0.4f, 0f), 0.10f);
            AssertPos(new Vector2(0.4f, 0f), interp.Sample(0.25f));
            AssertPos(new Vector2(0.4f, 0f), interp.Sample(5f));
        }
    }
}
#endif
