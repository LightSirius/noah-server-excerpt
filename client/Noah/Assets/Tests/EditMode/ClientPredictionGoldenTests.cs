// 이동동기화 후속 ② — ClientPrediction 골든 회귀(TS 미러 ↔ C# 실코드 드리프트 가드).
//
// tests/server/helpers/moveSyncHarness.ts의 TS 미러가 실물 Zone과 구동한 시나리오
// (조작열 setPath/apply/reconcile + 각 스텝 기대 위치)를
// Resources/MoveSync/movesync.golden.json에서 로드해, 실제 ClientPrediction에 동일하게
// 재생하고 PredictedPos를 비교한다. NavGoldenTests(TS A*↔C# A*)와 동형 패턴.
//
// 골든 갱신 절차 (누락은 tests/server/moveSyncGoldenFreshness.test.ts가 CI에서 잡는다):
//   1) bun run tools/movesync/exportGolden.ts
//   2) Unity 에디터 자동 import 후 본 테스트 실행 (Test Runner → EditMode)
//
// 허용 오차 1e-3의 근거: TS(double)↔C#(float) 변환 오차는 실측 최대 ~1e-6 수준이나,
// reconcile 기준점(serverPos)의 float 절단이 스텝마다 재기저화되며 최악 1e-4대까지
// 관측 여지가 있어 한 자릿수 여유를 둔다. 로직 드리프트(트림 누락·index 오류·세대
// 규약 붕괴)는 0.01+ 규모로 발현하므로 이 오차로도 확실히 구분된다.

#if UNITY_INCLUDE_TESTS
using System;
using System.Collections.Generic;
using MMORPG.Net.Generated;
using MMORPG.Sim;
using MMORPG.World.Nav;
using NUnit.Framework;
using UnityEngine;

namespace MMORPG.Tests.EditMode
{
    public sealed class ClientPredictionGoldenTests
    {
        [Serializable] private sealed class Wp { public double x; public double y; }

        [Serializable] private sealed class Step
        {
            public string op;
            public Wp[] wps;
            public int seq;
            public int dx;
            public int dy;
            public int walk; // 1 = 걷기, 없으면 달리기.
            public int ack;
            public double sx;
            public double sy;
            public double expX;
            public double expY;
        }

        /// <summary>키보드 충돌 격자 — rows[cy]의 문자 cx가 '#'이면 막힘(cy=0이 아래). TS NavSpec과 같다.</summary>
        [Serializable] private sealed class NavSpec
        {
            public int width;
            public int height;
            public float cellSize;
            public float originX;
            public float originY;
            public string[] rows;
        }

        [Serializable] private sealed class Scenario
        {
            public string name;
            public double spawnX;
            public double spawnY;
            public NavSpec nav;
            public Step[] steps;
        }

        [Serializable] private sealed class CollisionCase
        {
            public string name;
            public NavSpec nav;
            public double x;
            public double y;
            public double dx;
            public double dy;
            public double expX;
            public double expY;
        }

        [Serializable] private sealed class GoldenFile
        {
            public Scenario[] scenarios;
            public CollisionCase[] collision;
        }

        // JsonUtility는 없는 중첩 객체를 null이 아니라 기본 인스턴스로 만든다 — width로 "격자 없음"을 판정.
        private static NavGrid BuildNav(NavSpec spec)
        {
            if (spec == null || spec.width <= 0) return null;
            var cells = new byte[spec.width * spec.height];
            for (int cy = 0; cy < spec.height; cy++)
            {
                string row = spec.rows != null && cy < spec.rows.Length ? spec.rows[cy] : "";
                for (int cx = 0; cx < spec.width; cx++)
                    cells[cy * spec.width + cx] = (byte)(cx < row.Length && row[cx] == '#' ? 1 : 0);
            }
            return new NavGrid(spec.width, spec.height, spec.cellSize, spec.originX, spec.originY, cells);
        }

        private static GoldenFile LoadGolden()
        {
            var ta = Resources.Load<TextAsset>("MoveSync/movesync.golden");
            Assert.IsNotNull(ta,
                "Resources/MoveSync/movesync.golden 누락 — 레포 루트에서 `bun run tools/movesync/exportGolden.ts` 실행 필요");
            var golden = JsonUtility.FromJson<GoldenFile>(ta.text);
            Assert.IsNotNull(golden, "golden parse 실패");
            return golden;
        }

        /// <summary>키보드 충돌 단일 스텝 — C# NavCollide가 서버 slideMove(골든 기대값)와 같은 지점에서 멈춘다.</summary>
        [Test]
        public void Collision_CasesMatch()
        {
            var golden = LoadGolden();
            Assert.IsNotNull(golden.collision, "collision 절 없음 — exportGolden 재실행 필요");
            Assert.Greater(golden.collision.Length, 0, "collision 0건");
            foreach (var c in golden.collision)
            {
                var nav = BuildNav(c.nav);
                Assert.IsNotNull(nav, $"[{c.name}] 격자 없음");
                var p = NavCollide.SlideMove(nav, new Vector2((float)c.x, (float)c.y), (float)c.dx, (float)c.dy);
                Assert.AreEqual((float)c.expX, p.x, 1e-4f, $"[{c.name}] x");
                Assert.AreEqual((float)c.expY, p.y, 1e-4f, $"[{c.name}] y");
            }
        }

        private const float Tolerance = 1e-3f;

        [Test]
        public void Golden_ReplayMatches()
        {
            var golden = LoadGolden();
            Assert.IsNotNull(golden.scenarios, "scenarios 없음");
            Assert.Greater(golden.scenarios.Length, 0, "scenario 0건");

            foreach (var sc in golden.scenarios)
            {
                var pred = new ClientPrediction();
                pred.Initialize(new Vector2((float)sc.spawnX, (float)sc.spawnY));
                pred.Nav = BuildNav(sc.nav);
                int stepIdx = 0;
                int checkedSteps = 0;

                foreach (var st in sc.steps)
                {
                    stepIdx++;
                    switch (st.op)
                    {
                        case "setPath":
                            var pts = new List<Vector2>(st.wps?.Length ?? 0);
                            if (st.wps != null)
                                foreach (var w in st.wps) pts.Add(new Vector2((float)w.x, (float)w.y));
                            pred.SetPath(pts);
                            continue; // setPath는 위치 불변 — 기대값 비교 없음.
                        case "clearPath":
                            pred.ClearPath(); // MOVE_STOP 미러 — 위치 불변.
                            continue;
                        case "apply":
                            pred.Apply(new InputCmd { Seq = st.seq, Dx = st.dx, Dy = st.dy, Gait = st.walk != 0 ? MoveGait.Walk : MoveGait.Run });
                            break;
                        case "reconcile":
                            pred.Reconcile(st.ack, new Vector2((float)st.sx, (float)st.sy));
                            break;
                        default:
                            Assert.Fail($"[{sc.name}] step {stepIdx}: unknown op '{st.op}'");
                            continue;
                    }

                    float ex = pred.PredictedPos.x - (float)st.expX;
                    float ey = pred.PredictedPos.y - (float)st.expY;
                    float err = Mathf.Sqrt(ex * ex + ey * ey);
                    Assert.LessOrEqual(err, Tolerance,
                        $"[{sc.name}] step {stepIdx} ({st.op} seq={st.seq} ack={st.ack}) " +
                        $"pos={pred.PredictedPos.x:F6},{pred.PredictedPos.y:F6} " +
                        $"expected={st.expX:F6},{st.expY:F6} err={err:F6}");
                    checkedSteps++;
                }

                Assert.Greater(checkedSteps, 10, $"[{sc.name}] 비교 스텝이 너무 적음 — 골든 생성 확인");
            }
        }
    }
}
#endif
