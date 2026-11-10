// 입력 seq의 수명 — 존 전환은 PlayerActor와 InputSampler를 새로 만들지만 seq는 연결 안에서 단조증가여야 한다(protocol.md §3.3 INPUT_CMD).
// 서버 새 존 큐는 0부터 시작해 전환 직후 도착한 옛 입력의 seq로 뛰므로, 새 샘플러가 1부터 세면 그 값까지 전부 stale로 버려진다.

#if UNITY_INCLUDE_TESTS
using System.Reflection;
using MMORPG.Sim;
using NUnit.Framework;
using UnityEngine;

namespace MMORPG.Tests.EditMode
{
    public sealed class InputSamplerSeqTests
    {
        private static void Sample(InputSampler sampler) =>
            typeof(InputSampler).GetMethod("FixedUpdate", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(sampler, null);

        private static int SampleSeq(InputSampler sampler)
        {
            int seq = 0;
            void OnSample(InputCmd cmd) => seq = cmd.Seq;
            sampler.OnSample += OnSample;
            Sample(sampler);
            sampler.OnSample -= OnSample;
            return seq;
        }

        private static InputSampler NewSampler(string name) => new GameObject(name).AddComponent<InputSampler>();

        [Test]
        public void NewSampler_ContinuesAfterTheDestroyedOne()
        {
            var first = NewSampler("SeqSamplerA");
            int last = SampleSeq(first);
            last = SampleSeq(first);
            Object.DestroyImmediate(first.gameObject);

            var second = NewSampler("SeqSamplerB");
            try
            {
                Assert.That(SampleSeq(second), Is.EqualTo(last + 1), "존 전환으로 새로 만들어져도 1부터 다시 세지 않는다");
            }
            finally
            {
                Object.DestroyImmediate(second.gameObject);
            }
        }

        [Test]
        public void AllRequestKinds_ShareOneRisingCounterAcrossSamplers()
        {
            var first = NewSampler("SeqSamplerC");
            int moveTo = 0;
            first.OnMoveTo += cmd => moveTo = cmd.Seq;
            first.EmitMoveTo(Vector2.zero);
            int sampled = SampleSeq(first);
            Assert.That(sampled, Is.EqualTo(moveTo + 1), "키보드·우클릭·정지가 한 카운터");
            Assert.That(first.LastSeq, Is.EqualTo(sampled));
            Object.DestroyImmediate(first.gameObject);

            var second = NewSampler("SeqSamplerD");
            try
            {
                int stop = 0;
                second.OnMoveStop += cmd => stop = cmd.Seq;
                second.EmitMoveStop();
                Assert.That(stop, Is.EqualTo(sampled + 1));
                Assert.That(second.LastSeq, Is.EqualTo(stop));
            }
            finally
            {
                Object.DestroyImmediate(second.gameObject);
            }
        }
    }
}
#endif
