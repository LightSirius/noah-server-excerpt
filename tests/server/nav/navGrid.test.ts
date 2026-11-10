// Phase F-1 NavGrid + 로더 단위 테스트.

import { describe, expect, test } from "bun:test";
import { NavGrid } from "../../../server/src/world/nav/navGrid";
import { parseNavGrid } from "../../../server/src/world/nav/loader";

const TINY_JSON = {
  zoneId: 0,
  version: 1,
  name: "Tiny",
  cellSize: 1.0,
  originX: 0,
  originY: 0,
  width: 4,
  height: 4,
  // rows[0] = cy=0 (bottom). cell(1,1)이 #.
  rows: ["....", ".#..", "....", "...."] as string[],
};

describe("NavGrid 좌표/walkable 기본", () => {
  test("empty: 모든 셀 walkable", () => {
    const g = NavGrid.empty({ width: 4, height: 4, cellSize: 1, originX: 0, originY: 0 });
    for (let cy = 0; cy < 4; cy++)
      for (let cx = 0; cx < 4; cx++) expect(g.isWalkableCell(cx, cy)).toBe(true);
  });

  test("out-of-bounds는 blocked", () => {
    const g = NavGrid.empty({ width: 4, height: 4, cellSize: 1, originX: 0, originY: 0 });
    expect(g.isBlockedCell(-1, 0)).toBe(true);
    expect(g.isBlockedCell(0, -1)).toBe(true);
    expect(g.isBlockedCell(4, 0)).toBe(true);
    expect(g.isBlockedCell(0, 4)).toBe(true);
  });

  test("worldToCell: floor 정확", () => {
    const g = NavGrid.empty({ width: 4, height: 4, cellSize: 1, originX: 0, originY: 0 });
    expect(g.worldToCell(0.0, 0.0)).toEqual({ cx: 0, cy: 0 });
    expect(g.worldToCell(0.5, 0.5)).toEqual({ cx: 0, cy: 0 });
    expect(g.worldToCell(1.0, 1.0)).toEqual({ cx: 1, cy: 1 });
    expect(g.worldToCell(3.999, 3.999)).toEqual({ cx: 3, cy: 3 });
    expect(g.worldToCell(-0.1, 0)).toEqual({ cx: -1, cy: 0 });
  });

  test("cellCenter는 셀 가운데", () => {
    const g = NavGrid.empty({ width: 4, height: 4, cellSize: 2, originX: 10, originY: 20 });
    expect(g.cellCenter(0, 0)).toEqual({ x: 11, y: 21 });
    expect(g.cellCenter(1, 0)).toEqual({ x: 13, y: 21 });
    expect(g.cellCenter(0, 1)).toEqual({ x: 11, y: 23 });
  });
});

describe("parseNavGrid: 행 순서/문자 처리", () => {
  test("rows[0]이 cy=0(bottom row) 매핑", () => {
    const g = parseNavGrid(TINY_JSON);
    expect(g.width).toBe(4);
    expect(g.height).toBe(4);
    expect(g.isBlockedCell(1, 1)).toBe(true);   // TINY_JSON.rows[1] = ".#.."
    expect(g.isBlockedCell(0, 1)).toBe(false);
    expect(g.isBlockedCell(1, 0)).toBe(false);
    expect(g.isBlockedCell(1, 2)).toBe(false);
  });

  test("isWalkableWorld은 셀 가운데 walkable과 일치", () => {
    const g = parseNavGrid(TINY_JSON);
    expect(g.isWalkableWorld(1.5, 1.5)).toBe(false); // cell(1,1) 한가운데
    expect(g.isWalkableWorld(0.5, 0.5)).toBe(true);
    expect(g.isWalkableWorld(2.5, 2.5)).toBe(true);
  });
});

describe("parseNavGrid: 검증 실패 케이스", () => {
  test("rows.length가 height와 다르면 throw", () => {
    expect(() =>
      parseNavGrid({ ...TINY_JSON, height: 5 }),
    ).toThrow();
  });

  test("row 길이가 width와 다르면 throw", () => {
    expect(() =>
      parseNavGrid({ ...TINY_JSON, rows: ["...", "....", "....", "...."] }),
    ).toThrow();
  });

  test("'.'/'#' 외 문자는 throw", () => {
    expect(() =>
      parseNavGrid({ ...TINY_JSON, rows: ["....", ".X..", "....", "...."] }),
    ).toThrow();
  });

  test("version != 1 → throw", () => {
    expect(() => parseNavGrid({ ...TINY_JSON, version: 2 })).toThrow();
  });

  test("cellSize <= 0 → throw", () => {
    expect(() => parseNavGrid({ ...TINY_JSON, cellSize: 0 })).toThrow();
  });

  test("width/height < 1 → throw", () => {
    expect(() => parseNavGrid({ ...TINY_JSON, width: 0, rows: [] })).toThrow();
  });
});

describe("nearestWalkableCell BFS", () => {
  test("출발 셀이 walkable이면 그대로", () => {
    const g = parseNavGrid(TINY_JSON);
    expect(g.nearestWalkableCell(0, 0, 5)).toEqual({ cx: 0, cy: 0 });
  });

  test("blocked 셀이면 인접 walkable 반환", () => {
    const g = parseNavGrid(TINY_JSON);
    const r = g.nearestWalkableCell(1, 1, 5);
    expect(r).toBeDefined();
    expect(g.isWalkableCell(r!.cx, r!.cy)).toBe(true);
    const d = Math.abs(r!.cx - 1) + Math.abs(r!.cy - 1);
    expect(d).toBe(1);
  });

  test("모두 blocked면 undefined", () => {
    const g = parseNavGrid({
      ...TINY_JSON,
      rows: ["####", "####", "####", "####"],
    });
    expect(g.nearestWalkableCell(2, 2, 5)).toBeUndefined();
  });
});
