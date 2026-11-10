// Phase F-2.2 — 실제 zone-1 nav.json에 대한 결정론 골든 회귀.
//
// 목적:
//   - 알고리즘/데이터 변경이 zone-1 일반 시나리오 path를 의도치 않게 바꾸면 즉시 잡기.
//   - 같은 입력은 항상 같은 path (결정적 tie-breaker 검증).

import { describe, expect, test } from "bun:test";
import { loadNavGridForZone } from "../../../server/src/world/nav/loader";
import { findPath, simplifyPath } from "../../../server/src/world/nav/aStar";

const dims = { width: 64, height: 64, cellSize: 1, originX: 0, originY: 0 };

describe("zone-1 path 결정론 + 합리성", () => {
  test("spawn(32,32) -> (50,25) L자 벽을 정확히 우회 (골든)", () => {
    const g = loadNavGridForZone(1, dims);
    const path = simplifyPath(findPath(g, { cx: 32, cy: 32 }, { cx: 50, cy: 25 }));
    expect(path).toEqual([
      { cx: 32, cy: 32 },
      { cx: 33, cy: 31 },
      { cx: 41, cy: 31 },
      { cx: 47, cy: 25 },
      { cx: 50, cy: 25 },
    ]);
  });

  test("spawn -> NE 구석: pillar2를 피해 도달, 모든 waypoint walkable", () => {
    const g = loadNavGridForZone(1, dims);
    const path = findPath(g, { cx: 32, cy: 32 }, { cx: 60, cy: 60 });
    expect(path.length).toBeGreaterThan(0);
    expect(path[0]).toEqual({ cx: 32, cy: 32 });
    expect(path[path.length - 1]).toEqual({ cx: 60, cy: 60 });
    for (const c of path) expect(g.isWalkableCell(c.cx, c.cy)).toBe(true);
    for (const c of path) expect(c).not.toEqual({ cx: 44, cy: 44 });
    for (const c of path) expect(c).not.toEqual({ cx: 45, cy: 45 });
  });

  test("외벽(0,0) 클릭 -> nudge로 인접 walkable 통해 도달", () => {
    const g = loadNavGridForZone(1, dims);
    const path = findPath(g, { cx: 32, cy: 32 }, { cx: 0, cy: 0 });
    expect(path.length).toBeGreaterThan(0);
    const last = path[path.length - 1];
    expect(g.isWalkableCell(last.cx, last.cy)).toBe(true);
  });

  test("같은 입력은 항상 같은 path", () => {
    const g = loadNavGridForZone(1, dims);
    const a = findPath(g, { cx: 5, cy: 5 }, { cx: 55, cy: 55 });
    const b = findPath(g, { cx: 5, cy: 5 }, { cx: 55, cy: 55 });
    expect(a).toEqual(b);
  });
});
