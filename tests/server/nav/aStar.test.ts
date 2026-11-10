// Phase F-2 A* 단위 테스트.

import { describe, expect, test } from "bun:test";
import { findPath, simplifyPath } from "../../../server/src/world/nav/aStar";
import { parseNavGrid } from "../../../server/src/world/nav/loader";

function makeGrid(rows: string[]) {
  return parseNavGrid({
    zoneId: 0, version: 1, name: "T",
    cellSize: 1, originX: 0, originY: 0,
    width: rows[0].length, height: rows.length,
    rows,
  });
}

describe("findPath: trivial", () => {
  test("시작 == 목적이면 시작 셀 1개만", () => {
    const g = makeGrid(["...", "...", "..."]);
    const p = findPath(g, { cx: 1, cy: 1 }, { cx: 1, cy: 1 });
    expect(p).toEqual([{ cx: 1, cy: 1 }]);
  });

  test("빈 grid 직선 대각선: 시작/끝 + 중간 한 셀", () => {
    const g = makeGrid(["...", "...", "..."]);
    const p = findPath(g, { cx: 0, cy: 0 }, { cx: 2, cy: 2 });
    expect(p[0]).toEqual({ cx: 0, cy: 0 });
    expect(p[p.length - 1]).toEqual({ cx: 2, cy: 2 });
    expect(p).toHaveLength(3);
    expect(p[1]).toEqual({ cx: 1, cy: 1 });
  });

  test("4방향 only면 step이 더 많음", () => {
    const g = makeGrid(["...", "...", "..."]);
    const p = findPath(g, { cx: 0, cy: 0 }, { cx: 2, cy: 2 }, { allowDiagonal: false });
    expect(p[0]).toEqual({ cx: 0, cy: 0 });
    expect(p[p.length - 1]).toEqual({ cx: 2, cy: 2 });
    expect(p).toHaveLength(5);
  });
});

describe("findPath: 장애물 우회", () => {
  test("벽 우회", () => {
    const g = makeGrid([
      "..#..",
      "..#..",
      "..#..",
      "..#..",
      ".....",
    ]);
    const p = findPath(g, { cx: 1, cy: 2 }, { cx: 3, cy: 2 });
    expect(p.length).toBeGreaterThan(0);
    expect(p[0]).toEqual({ cx: 1, cy: 2 });
    expect(p[p.length - 1]).toEqual({ cx: 3, cy: 2 });
    for (const c of p) expect(g.isWalkableCell(c.cx, c.cy)).toBe(true);
  });

  test("도달 불가 -> 빈 배열", () => {
    const g = makeGrid([
      ".#..",
      ".#..",
      ".#..",
      ".#..",
    ]);
    const p = findPath(g, { cx: 0, cy: 0 }, { cx: 3, cy: 3 });
    expect(p).toEqual([]);
  });
});

describe("findPath: cut-corner 금지 (8방향)", () => {
  test("L자 코너에서 통과 안 됨", () => {
    const g = makeGrid([
      "..#",
      "##.",
      "...",
    ]);
    const p = findPath(g, { cx: 0, cy: 0 }, { cx: 2, cy: 2 });
    expect(p).toEqual([]);
  });

  test("한쪽 직선 셀이 blocked면 대각선 통과 금지 -> 우회 step 추가", () => {
    const g = makeGrid([
      "...",
      "#..",
      "...",
    ]);
    const p = findPath(g, { cx: 0, cy: 0 }, { cx: 1, cy: 1 });
    expect(p[0]).toEqual({ cx: 0, cy: 0 });
    expect(p[p.length - 1]).toEqual({ cx: 1, cy: 1 });
    expect(p).toHaveLength(3);
  });
});

describe("findPath: nudge", () => {
  test("시작이 blocked면 인접 walkable로 nudge", () => {
    const g = makeGrid([
      "...",
      ".#.",
      "...",
    ]);
    const p = findPath(g, { cx: 1, cy: 1 }, { cx: 2, cy: 0 });
    expect(p.length).toBeGreaterThan(0);
    expect(g.isWalkableCell(p[0].cx, p[0].cy)).toBe(true);
    expect(p[p.length - 1]).toEqual({ cx: 2, cy: 0 });
  });

  test("nudgeRadius=0이면 blocked 시작은 빈 배열", () => {
    const g = makeGrid([
      "...",
      ".#.",
      "...",
    ]);
    const p = findPath(g, { cx: 1, cy: 1 }, { cx: 2, cy: 0 }, { nudgeRadius: 0 });
    expect(p).toEqual([]);
  });
});

describe("findPath: 결정론", () => {
  test("같은 입력이면 같은 path", () => {
    const g = makeGrid([
      ".....",
      ".#.#.",
      ".....",
      ".#.#.",
      ".....",
    ]);
    const a = findPath(g, { cx: 0, cy: 0 }, { cx: 4, cy: 4 });
    const b = findPath(g, { cx: 0, cy: 0 }, { cx: 4, cy: 4 });
    expect(a).toEqual(b);
  });
});

describe("findPath: maxNodes 가드", () => {
  test("가드 초과 시 빈 배열", () => {
    const g = makeGrid([
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
    ]);
    const p = findPath(g, { cx: 0, cy: 0 }, { cx: 4, cy: 4 }, { maxNodes: 2 });
    expect(p).toEqual([]);
  });
});

describe("simplifyPath", () => {
  test("같은 방향 연속 셀 합치기", () => {
    const path = [
      { cx: 0, cy: 0 },
      { cx: 1, cy: 0 },
      { cx: 2, cy: 0 },
      { cx: 3, cy: 1 },
      { cx: 4, cy: 2 },
      { cx: 5, cy: 3 },
    ];
    const s = simplifyPath(path);
    expect(s).toEqual([
      { cx: 0, cy: 0 },
      { cx: 2, cy: 0 },
      { cx: 5, cy: 3 },
    ]);
  });

  test("길이 0/1/2는 그대로", () => {
    expect(simplifyPath([])).toEqual([]);
    expect(simplifyPath([{ cx: 0, cy: 0 }])).toEqual([{ cx: 0, cy: 0 }]);
    const two = [{ cx: 0, cy: 0 }, { cx: 1, cy: 1 }];
    expect(simplifyPath(two)).toEqual(two);
  });
});
