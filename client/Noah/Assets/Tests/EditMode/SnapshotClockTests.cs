// 원격 보간 시간축(Sim/SnapshotClock.cs) — tick을 "서버에서 생긴 로컬 시각"으로 찍어, 네트워크가 잠깐 막혔다 풀려도 밀린 tick이 제
// 간격으로 재생되는지. 그리고 보간(EntityInterpolation)에 물렸을 때 지연 버퍼 − 한 tick(약 50 ms) 안의 끊김은 멈춤·튐 없이 흡수되고
// 더 긴 끊김도 덜 튀는지, 지터가 펴지는지, 지연이 계속 늘면 곧 따라가는지(도착 시각으로 찍던 종전 방식과 비교 — TS 포팅 모의:
// 40 ms 끊김 최대 1.0배 대 3.3배, 80 ms 2.2배 대 4.2배, 0–60 ms 지터 튄 프레임 0 대 20, 200 ms 지연 상승 4프레임(재기준 없으면 27)).

#if UNITY_INCLUDE_TESTS
using System;
using System.Collections.Generic;
using MMORPG.Sim;
using NUnit.Framework;
using UnityEngine;

namespace MMORPG.Tests.EditMode
{
    public sealed class SnapshotClockTests
    {
        private const float Tick = (float)SnapshotClock.TickSec;
        private const float Eps = 1e-4f;

        [Test]
        public void SteadyStream_StampsEqualArrival()
        {
            var clock = new SnapshotClock();
            for (uint t = 100; t < 140; t++)
            {
                float arrival = 10f + (t - 100) * Tick;
                Assert.AreEqual(arrival, clock.Stamp(t, arrival), Eps, $"tick {t}");
            }
        }

        [Test]
        public void Jitter_StampsKeepTheTickSpacingAndNeverExceedArrival()
        {
            var clock = new SnapshotClock();
            float[] jitter = { 0.004f, 0.019f, 0f, 0.011f, 0.007f, 0.016f, 0.002f, 0.013f };
            float? first = null;
            for (uint t = 0; t < 64; t++)
            {
                float arrival = 5f + t * Tick + 0.03f + jitter[t % jitter.Length];
                float stamp = clock.Stamp(t, arrival);
                Assert.That(stamp, Is.LessThanOrEqualTo(arrival + Eps));
                if (t >= 2)
                {
                    first ??= stamp - t * Tick;
                    Assert.AreEqual(first.Value + t * Tick, stamp, Eps, "once the fastest arrival is seen, ticks are 50 ms apart");
                }
            }
        }

        [Test]
        public void StallBurst_IsSpreadBackToItsTickTimes()
        {
            var clock = new SnapshotClock();
            for (uint t = 0; t < 20; t++) clock.Stamp(t, 1f + t * Tick);
            // tick 20~22가 막혔다가 tick 22 시각에 한꺼번에 도착.
            float burst = 1f + 22 * Tick;
            float s20 = clock.Stamp(20, burst), s21 = clock.Stamp(21, burst), s22 = clock.Stamp(22, burst);
            Assert.AreEqual(1f + 20 * Tick, s20, Eps);
            Assert.AreEqual(1f + 21 * Tick, s21, Eps);
            Assert.AreEqual(burst, s22, Eps);
            // 몰려온 tick은 같은 순간에 와서 기준을 다시 잡지 않는다 — 다음 정상 도착은 그대로 제 시각.
            Assert.AreEqual(1f + 23 * Tick, clock.Stamp(23, 1f + 23 * Tick), Eps);
        }

        [Test]
        public void LatencyRise_IsFollowedWithinAFewTicks()
        {
            var clock = new SnapshotClock();
            uint t = 0;
            for (; t < 40; t++) clock.Stamp(t, t * Tick);
            const float extra = 0.2f; // 경로가 바뀌어(또는 서버가 tick을 건너뛰어) 지연이 계속 200 ms 늘었다.
            float riseAt = t * Tick + extra;
            float followedAt = float.NaN;
            for (; t < 120; t++)
            {
                float arrival = t * Tick + extra;
                if (float.IsNaN(followedAt) && Mathf.Abs(arrival - clock.Stamp(t, arrival)) < Eps) followedAt = arrival;
            }
            Assert.That(followedAt - riseAt, Is.LessThanOrEqualTo(SnapshotClock.ReanchorSec + Tick + Eps),
                "the new latency becomes the reference after ReanchorSec, not after the whole window");
        }

        [Test]
        public void TickGoingBack_StartsANewReference_ResetToo()
        {
            var clock = new SnapshotClock();
            for (uint t = 1000; t < 1010; t++) clock.Stamp(t, (t - 1000) * Tick);
            Assert.AreEqual(3f, clock.Stamp(5, 3f), Eps, "a new zone/server restarts the tick count");
            clock.Reset();
            Assert.AreEqual(7f, clock.Stamp(6, 7f), Eps);
        }

        [Test]
        public void TickWraparound_StaysContinuous()
        {
            var clock = new SnapshotClock();
            uint t = uint.MaxValue - 2;
            float arrival = 2f;
            for (int i = 0; i < 6; i++, t++, arrival += Tick)
                Assert.AreEqual(arrival, clock.Stamp(t, arrival), Eps);
        }

        // 아래는 보간에 물린 모의 — 60 fps 렌더, 서버 20 Hz·4 u/s(tick당 0.2 u), 평소 지연 30 ms, 1.0초에 사건. "튄 프레임" = 정상 한 프레임
        // 이동(4/60 u)의 1.5배를 넘게 움직인 프레임. TCP처럼 도착은 tick 순서를 지킨다.
        private const float NormalStep = 4f / 60f;

        [Test]
        public void ShortStall_RendersWithoutAFreezeOrJump()
        {
            var stamped = Simulate(useClock: true, stallSec: 0.04f);
            var arrivalStamped = Simulate(useClock: false, stallSec: 0.04f);
            Assert.That(stamped.MaxStep, Is.LessThan(NormalStep * 1.2f), "tick-stamped: every frame moves a normal step");
            Assert.That(arrivalStamped.MaxStep, Is.GreaterThan(NormalStep * 2.5f), "arrival-stamped (old): the burst collapses into a jump");
        }

        [Test]
        public void LongerStall_JumpsLessThanArrivalStamping()
        {
            var stamped = Simulate(useClock: true, stallSec: 0.08f);
            var arrivalStamped = Simulate(useClock: false, stallSec: 0.08f);
            Assert.That(stamped.MaxStep, Is.LessThan(arrivalStamped.MaxStep * 0.65f));
        }

        [Test]
        public void Jitter_IsSmoothedOut()
        {
            var stamped = Simulate(useClock: true, jitterSec: 0.06f);
            var arrivalStamped = Simulate(useClock: false, jitterSec: 0.06f);
            Assert.That(stamped.JumpFrames, Is.Zero, "0–60 ms jitter: tick-stamped stays smooth");
            Assert.That(arrivalStamped.JumpFrames, Is.GreaterThan(10), "arrival-stamped (old) jerks with the jitter");
        }

        [Test]
        public void LatencyRise_StepsOnlyBriefly()
        {
            var stamped = Simulate(useClock: true, riseSec: 0.2f);
            Assert.That(stamped.JumpFrames, Is.LessThanOrEqualTo(6), "re-anchors within ReanchorSec — without it the whole 1.5 s window steps at 20 Hz (≈27 frames)");
        }

        private readonly struct SimResult
        {
            public readonly float MaxStep;
            public readonly int JumpFrames;
            public SimResult(float maxStep, int jumpFrames) { MaxStep = maxStep; JumpFrames = jumpFrames; }
        }

        private static SimResult Simulate(bool useClock, float stallSec = 0f, float riseSec = 0f, float jitterSec = 0f)
        {
            const float latency = 0.03f, eventAt = 1f, frame = 1f / 60f, speed = 4f;
            var clock = new SnapshotClock();
            var interp = new EntityInterpolation();
            var queue = new Queue<(uint tick, float arrival, Vector2 pos)>();
            float lastArrival = 0f;
            for (uint t = 0; t < 100; t++)
            {
                float sent = t * Tick;
                float arrival = sent + latency;
                if (sent >= eventAt && sent < eventAt + stallSec) arrival = eventAt + stallSec + latency;
                if (sent >= eventAt) arrival += riseSec;
                arrival += jitterSec * (float)(Math.Abs(Math.Sin(t * 12.9898) * 43758.5453) % 1.0);
                arrival = Math.Max(arrival, lastArrival);
                lastArrival = arrival;
                queue.Enqueue((t, arrival, new Vector2(sent * speed, 0f)));
            }
            float maxStep = 0f;
            int jumps = 0;
            Vector2? prev = null;
            for (float now = 0f; now < 4.5f; now += frame)
            {
                while (queue.Count > 0 && queue.Peek().arrival <= now)
                {
                    var (tick, arrival, pos) = queue.Dequeue();
                    float? stamp = useClock ? clock.Stamp(tick, arrival) : (float?)null;
                    interp.Push(pos, arrival, tick, stamp);
                }
                if (!interp.HasData) continue;
                var p = interp.Sample(now);
                if (prev.HasValue && now > 0.6f && now < 4f)
                {
                    float step = (p - prev.Value).magnitude;
                    maxStep = Math.Max(maxStep, step);
                    if (step > NormalStep * 1.5f) jumps++;
                }
                prev = p;
            }
            return new SimResult(maxStep, jumps);
        }
    }
}
#endif
