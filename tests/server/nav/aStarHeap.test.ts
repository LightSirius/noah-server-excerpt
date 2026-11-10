// 3단계 슬라이스 1 — A* 바이너리 힙 + epoch 스탬프 scratch의 정확-등가 회귀.
//
// 오라클(aStarOracle.ts = 선형 스캔 원본)과 raw path·visited 수가 모든 입력에서 같아야 한다.
// open 항목의 (f, h, ci) 키는 서로 다르므로(같은 셀의 재삽입은 g가 엄격히 작아 f가 다르다) 같은
// 비교자를 쓰는 힙은 같은 순서로 pop한다 — 이 테스트가 그 주장을 무작위·경계 입력으로 확인한다.

import { describe, expect, test } from "bun:test";
import {
  type AStarOptions,
  type CellPos,
  findPath,
  findPathWithStats,
  setAStarEpochForTest,
} from "../../../server/src/world/nav/aStar";
import { loadNavGridForZone } from "../../../server/src/world/nav/loader";
import { NavGrid } from "../../../server/src/world/nav/navGrid";
import { mulberry32, type Rng } from "../../../tools/loadgen/rng";
import { oracleFindPath } from "./aStarOracle";

const UINT32_MAX = 0xffffffff;

function randomGrid(rng: Rng, w: number, h: number, density: number): NavGrid {
  const cells = new Uint8Array(w * h);
  for (let i = 0; i < cells.length; i++) cells[i] = rng() < density ? 1 : 0;
  return new NavGrid({ width: w, height: h, cellSize: 1, originX: 0, originY: 0 }, cells);
}

function gridFromRows(rows: readonly string[]): NavGrid {
  const w = rows[0]!.length;
  const h = rows.length;
  const cells = new Uint8Array(w * h);
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) cells[cy * w + cx] = rows[cy]![cx] === "#" ? 1 : 0;
  }
  return new NavGrid({ width: w, height: h, cellSize: 1, originX: 0, originY: 0 }, cells);
}

/** 격자 밖 2칸까지 — 범위 밖 시작/목적의 nudge 경로도 섞는다. */
function randomCell(rng: Rng, grid: NavGrid): CellPos {
  return {
    cx: Math.floor(rng() * (grid.width + 4)) - 2,
    cy: Math.floor(rng() * (grid.height + 4)) - 2,
  };
}

function walkableCells(grid: NavGrid): CellPos[] {
  const out: CellPos[] = [];
  for (let cy = 0; cy < grid.height; cy++) {
    for (let cx = 0; cx < grid.width; cx++) if (grid.isWalkableCell(cx, cy)) out.push({ cx, cy });
  }
  return out;
}

interface Outcome {
  found: number;
  empty: number;
  aborted: number;
}

/** 운영 구현과 오라클을 비교. 불일치면 재현 정보를 담아 실패시킨다. */
function expectSame(
  grid: NavGrid,
  s: CellPos,
  g: CellPos,
  opts: Partial<AStarOptions>,
  tally?: Outcome,
): number {
  const want = oracleFindPath(grid, s, g, opts);
  const got = findPathWithStats(grid, s, g, opts);
  if (got.visited !== want.visited || JSON.stringify(got.path) !== JSON.stringify(want.path)) {
    const ctx = { w: grid.width, h: grid.height, s, g, opts, want, got };
    expect(JSON.stringify(ctx)).toBe("A* 힙 결과가 오라클과 다름");
  }
  expect(findPath(grid, s, g, opts)).toEqual(want.path);
  if (tally) {
    const maxNodes = opts.maxNodes ?? 50000;
    if (want.path.length > 0) tally.found++;
    else if (want.visited > maxNodes) tally.aborted++;
    else tally.empty++;
  }
  return want.visited;
}

describe("findPath 바이너리 힙 == 선형 스캔 오라클", () => {
  test("무작위 격자 1,500건 — 크기·밀도·대각선·nudge·maxNodes 혼합", () => {
    const rng = mulberry32(0x5eed01);
    const tally: Outcome = { found: 0, empty: 0, aborted: 0 };
    const densities = [0, 0.1, 0.2, 0.3, 0.45];
    for (let i = 0; i < 1500; i++) {
      const w = 1 + Math.floor(rng() * 48);
      const h = 1 + Math.floor(rng() * 48);
      const grid = randomGrid(rng, w, h, densities[i % densities.length]!);
      const opts: Partial<AStarOptions> = {
        allowDiagonal: rng() < 0.75,
        nudgeRadius: Math.floor(rng() * 5),
      };
      if (rng() < 0.2) opts.maxNodes = 1 + Math.floor(rng() * 120);
      expectSame(grid, randomCell(rng, grid), randomCell(rng, grid), opts, tally);
    }
    // 무작위 입력이 세 종료 경로(도달·도달 불가·예산 초과)를 모두 실제로 밟았는지.
    expect(tally.found).toBeGreaterThan(300);
    expect(tally.empty).toBeGreaterThan(50);
    expect(tally.aborted).toBeGreaterThan(20);
  });

  test("도달 불가 — 벽으로 갈린 영역·갇힌 목적지에서 탐색량까지 동일", () => {
    const split = gridFromRows([
      "....#.....",
      "....#.....",
      "....#.....",
      "....#.....",
      "....#.....",
    ]);
    const enclosed = gridFromRows([
      ".........",
      "...###...",
      "...#.#...",
      "...###...",
      ".........",
    ]);
    const corner = gridFromRows(["..#", "##.", "..."]);
    const cases: Array<[NavGrid, CellPos, CellPos]> = [
      [split, { cx: 0, cy: 0 }, { cx: 9, cy: 4 }],
      [split, { cx: 9, cy: 0 }, { cx: 0, cy: 4 }],
      [enclosed, { cx: 0, cy: 0 }, { cx: 4, cy: 2 }],
      [enclosed, { cx: 4, cy: 2 }, { cx: 8, cy: 4 }],
      [corner, { cx: 0, cy: 0 }, { cx: 2, cy: 2 }],
    ];
    for (const [grid, s, g] of cases) {
      for (const allowDiagonal of [true, false]) {
        const visited = expectSame(grid, s, g, { allowDiagonal });
        expect(findPath(grid, s, g, { allowDiagonal })).toEqual([]);
        expect(visited).toBeGreaterThan(0);
      }
    }
  });

  test("maxNodes 경계 — visited 정확히 V면 성공, V-1이면 빈 배열(visited = V)", () => {
    const rng = mulberry32(0x5eed02);
    let checked = 0;
    while (checked < 200) {
      const grid = randomGrid(rng, 8 + Math.floor(rng() * 32), 8 + Math.floor(rng() * 32), 0.25);
      const s = randomCell(rng, grid);
      const g = randomCell(rng, grid);
      const allowDiagonal = rng() < 0.7;
      const full = oracleFindPath(grid, s, g, { allowDiagonal });
      if (full.path.length < 2) continue;
      const v = full.visited;
      expectSame(grid, s, g, { allowDiagonal, maxNodes: v });
      expect(findPath(grid, s, g, { allowDiagonal, maxNodes: v })).toEqual(full.path);
      expect(expectSame(grid, s, g, { allowDiagonal, maxNodes: v - 1 })).toBe(v);
      expect(findPath(grid, s, g, { allowDiagonal, maxNodes: v - 1 })).toEqual([]);
      checked++;
    }
  });

  test("실물 내비 격자(zone 1·2) 무작위 보행 셀 쌍 300건씩", () => {
    for (const [zoneId, side] of [[1, 64], [2, 128]] as const) {
      const grid = loadNavGridForZone(zoneId, {
        width: side, height: side, cellSize: 1, originX: 0, originY: 0,
      });
      const cells = walkableCells(grid);
      const rng = mulberry32(0x5eed03 + zoneId);
      for (let i = 0; i < 300; i++) {
        const a = cells[Math.floor(rng() * cells.length)]!;
        const b = cells[Math.floor(rng() * cells.length)]!;
        expectSame(grid, a, b, {});
      }
    }
  });

  test("큰 격자(256×256) — open 힙·scratch가 커지는 경로", () => {
    const rng = mulberry32(0x5eed04);
    const grid = randomGrid(rng, 256, 256, 0.15);
    expectSame(grid, { cx: 0, cy: 0 }, { cx: 255, cy: 255 }, {});
    expectSame(grid, { cx: 250, cy: 3 }, { cx: 4, cy: 251 }, { allowDiagonal: false });
    expectSame(grid, { cx: 128, cy: 128 }, { cx: 1, cy: 254 }, { maxNodes: 4000 });
  });

  test("scratch 재사용 — 큰/작은 격자를 번갈아도 이전 탐색의 흔적이 새지 않는다", () => {
    const rng = mulberry32(0x5eed05);
    const big = randomGrid(rng, 128, 128, 0.2);
    const small = randomGrid(rng, 9, 7, 0.2);
    const kept: Array<{ path: CellPos[]; want: CellPos[] }> = [];
    for (let i = 0; i < 60; i++) {
      const grid = i % 2 === 0 ? big : small;
      const s = randomCell(rng, grid);
      const g = randomCell(rng, grid);
      expectSame(grid, s, g, { allowDiagonal: i % 3 !== 0 });
      kept.push({ path: findPath(grid, s, g), want: oracleFindPath(grid, s, g).path });
    }
    // 반환 path는 매번 새 객체 — 뒤이은 탐색이 앞서 돌려준 결과를 바꾸지 않는다.
    for (const k of kept) expect(k.path).toEqual(k.want);
  });

  test("epoch 순환(Uint32 끝) — 전면 리셋 후 낡은 스탬프를 현재 탐색으로 오인하지 않는다", () => {
    const grid = gridFromRows([
      "..........",
      ".####.###.",
      ".#......#.",
      ".#.####.#.",
      "...#..#...",
    ]);
    const s = { cx: 0, cy: 0 };
    const g = { cx: 4, cy: 2 };
    try {
      setAStarEpochForTest(0); // 다음 탐색 = epoch 1 → 스탬프 1이 격자에 남는다.
      expectSame(grid, s, g, {});
      setAStarEpochForTest(UINT32_MAX - 1); // 다음 탐색 = 최대값, 그다음이 순환.
      expectSame(grid, { cx: 9, cy: 4 }, { cx: 0, cy: 4 }, {});
      // 순환 직후 epoch가 1로 돌아와도, 리셋이 없으면 첫 탐색의 스탬프 1이 seen/closed로 보인다.
      expectSame(grid, s, g, {});
      expectSame(grid, s, g, { allowDiagonal: false });
    } finally {
      setAStarEpochForTest(0);
    }
  });
});
