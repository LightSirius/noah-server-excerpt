// Phase F-9 — NavGolden 자동 회귀 테스트.
//
// NavGoldenChecker.VerifyToString(zoneId)을 호출하여 TS export 골든과 C# AStar 결과의
// 결정론 일치를 [Test]로 격상. Unity Test Runner (Window/General/Test Runner) → EditMode → Run.
//
// 골든 갱신 절차:
//   1) bun run tools/nav/exportGolden.ts (레포 루트)
//   2) Unity 에디터에서 자동 import
//   3) 본 테스트 실행
//
// 실패 시: NavGoldenChecker가 FAIL 케이스에서 LogError를 발생시키며,
// 본 테스트는 summary 라인의 "0 fail" 파싱으로 명시적 검증.

#if UNITY_INCLUDE_TESTS
using NUnit.Framework;
using System.Text.RegularExpressions;
using MMORPG.EditorTools;

namespace MMORPG.Tests.EditMode
{
    public sealed class NavGoldenTests
    {
        [TestCase(1)]
        [TestCase(2)]
        [TestCase(3)]
        public void Zone_GoldenMatches(int zoneId)
        {
            string report = NavGoldenChecker.VerifyToString(zoneId);
            Assert.IsNotNull(report, "VerifyToString returned null");
            Assert.IsNotEmpty(report, "VerifyToString returned empty report");

            // "[NavGoldenChecker] zone {id}: N pass / M fail (total=K)" 라인에서 카운트 추출.
            var pattern = $@"zone\s+{zoneId}:\s+(\d+)\s+pass\s+/\s+(\d+)\s+fail\s+\(total=(\d+)\)";
            var m = Regex.Match(report, pattern);
            Assert.IsTrue(m.Success, $"summary line not found in report:\n{report}");

            int pass = int.Parse(m.Groups[1].Value);
            int fail = int.Parse(m.Groups[2].Value);
            int total = int.Parse(m.Groups[3].Value);

            Assert.Greater(total, 0, $"no golden cases found — Resources/Nav/zone-{zoneId}.golden 누락?");
            Assert.AreEqual(0, fail, $"NavGolden FAIL: {fail}/{total}\n{report}");
            Assert.AreEqual(total, pass, $"pass count mismatch: {pass}/{total}");
        }
    }
}
#endif
