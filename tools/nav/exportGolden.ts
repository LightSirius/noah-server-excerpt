// Phase F-6 — TS A* 골든 path를 클라 검증용 JSON으로 export.
//
// 실행: 레포 루트에서 `bun run tools/nav/exportGolden.ts`
// 산출: client/Noah/Assets/Resources/Nav/zone-{id}.golden.json
//
// 클라 Editor 스크립트 NavGoldenChecker / EditMode 테스트(NavGoldenTests)가 이 JSON을
// 로드하여 C# AStar.FindPath + SmoothPath 결과와 비교 → TS↔C# 결정론 일치 회귀.
//
// 다중 zone: zoneCases에 케이스를 추가하면 자동으로 export.
// fallbackDims는 zone JSON이 없을 때만 쓰이므로 zone마다 적당히 잡아도 됨.

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { loadNavGridForZone } from "../../server/src/world/nav/loader";
import type { NavGridDims } from "../../server/src/world/nav/navGrid";
import { findPath, smoothPath, type CellPos } from "../../server/src/world/nav/aStar";

interface GoldenCaseInput {
  name: string;
  start: CellPos;
  goal: CellPos;
}

interface GoldenCase extends GoldenCaseInput {
  simplified: CellPos[];
}

interface GoldenFile {
  zoneId: number;
  cases: GoldenCase[];
}

interface ZoneSpec {
  zoneId: number;
  fallbackDims: NavGridDims;
  cases: GoldenCaseInput[];
}

const zoneCases: ZoneSpec[] = [
  {
    zoneId: 3,
    fallbackDims: { width: 64, height: 64, cellSize: 1, originX: 0, originY: 0 },
    cases: [
      { name: "Village spawn -> merchant", start: { cx: 32, cy: 32 }, goal: { cx: 52, cy: 40 } },
      { name: "Village spawn -> return portal", start: { cx: 32, cy: 32 }, goal: { cx: 28, cy: 24 } },
      { name: "Village outer wall nudge", start: { cx: 32, cy: 32 }, goal: { cx: 0, cy: 0 } },
    ],
  },
  {
    zoneId: 1,
    fallbackDims: { width: 64, height: 64, cellSize: 1, originX: 0, originY: 0 },
    cases: [
      { name: "spawn->(50,25) L벽 우회 골든", start: { cx: 32, cy: 32 }, goal: { cx: 50, cy: 25 } },
      { name: "spawn->NE 구석", start: { cx: 32, cy: 32 }, goal: { cx: 60, cy: 60 } },
      { name: "(5,5)->(55,55)", start: { cx: 5, cy: 5 }, goal: { cx: 55, cy: 55 } },
      { name: "외벽(0,0) nudge 도달", start: { cx: 32, cy: 32 }, goal: { cx: 0, cy: 0 } },
    ],
  },
  {
    zoneId: 2,
    fallbackDims: { width: 128, height: 128, cellSize: 1, originX: 0, originY: 0 },
    cases: [
      { name: "spawn->NE 구석 (대각선)", start: { cx: 64, cy: 64 }, goal: { cx: 120, cy: 120 } },
      { name: "spawn->SW 구석 (대각선)", start: { cx: 64, cy: 64 }, goal: { cx: 8, cy: 8 } },
      { name: "수평 이동", start: { cx: 10, cy: 64 }, goal: { cx: 118, cy: 64 } },
      { name: "외벽(0,0) nudge 도달", start: { cx: 64, cy: 64 }, goal: { cx: 0, cy: 0 } },
    ],
  },
];

function exportZone(spec: ZoneSpec, outPath: string): void {
  const grid = loadNavGridForZone(spec.zoneId, spec.fallbackDims);
  const cases: GoldenCase[] = spec.cases.map((c) => ({
    name: c.name,
    start: c.start,
    goal: c.goal,
    simplified: smoothPath(grid, findPath(grid, c.start, c.goal)),
  }));
  const file: GoldenFile = { zoneId: spec.zoneId, cases };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(file, null, 2) + "\n", "utf-8");
  console.log(`exported ${cases.length} cases -> ${outPath}`);
  for (const c of cases) console.log(`  ${c.name}: len=${c.simplified.length}`);
}

const root = resolve(process.cwd());
for (const spec of zoneCases) {
  const outPath = resolve(root, `client/Noah/Assets/Resources/Nav/zone-${spec.zoneId}.golden.json`);
  exportZone(spec, outPath);
}
