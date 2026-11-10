// 테스트 전용 오라클 — 바이너리 힙 도입(3단계 슬라이스 1) 이전의 findPath 원본(선형 스캔 open list).
//
// 운영 코드(server/src/world/nav/aStar.ts)와 raw path·visited 수를 비교해 정확-등가를 검증한다.
// 알고리즘 본문은 원본 그대로 두고, visited 수를 함께 돌려주는 부분만 다르다. 수정하지 말 것 —
// 오라클이 바뀌면 등가 테스트가 아무것도 보장하지 않는다.

import type { CellPos } from "../../../server/src/world/nav/aStar";
import type { NavGrid } from "../../../server/src/world/nav/navGrid";

export interface OracleOptions {
  readonly allowDiagonal: boolean;
  readonly maxNodes: number;
  readonly nudgeRadius: number;
}

export interface OracleResult {
  path: CellPos[];
  /** closed 확장 수(maxNodes 가드가 세는 값). nudge 실패·시작 == 목적이면 0. */
  visited: number;
}

const DEFAULT_OPTS: OracleOptions = {
  allowDiagonal: true,
  maxNodes: 50000,
  nudgeRadius: 4,
};

const STRAIGHT_COST = 10;
const DIAGONAL_COST = 14;

export function oracleFindPath(
  grid: NavGrid,
  start: CellPos,
  goal: CellPos,
  options: Partial<OracleOptions> = {},
): OracleResult {
  const opts: OracleOptions = { ...DEFAULT_OPTS, ...options };

  const sNudged = nudgeIfBlocked(grid, start, opts.nudgeRadius);
  const gNudged = nudgeIfBlocked(grid, goal, opts.nudgeRadius);
  if (!sNudged || !gNudged) return { path: [], visited: 0 };
  if (sNudged.cx === gNudged.cx && sNudged.cy === gNudged.cy) return { path: [sNudged], visited: 0 };

  const W = grid.width;
  const H = grid.height;
  const total = W * H;
  const idx = (cx: number, cy: number) => cy * W + cx;

  const gScore = new Int32Array(total).fill(-1);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);

  const sIdx = idx(sNudged.cx, sNudged.cy);
  const gIdx = idx(gNudged.cx, gNudged.cy);

  interface OpenNode { f: number; h: number; ci: number; }
  const open: OpenNode[] = [];
  gScore[sIdx] = 0;
  const h0 = heuristic(sNudged, gNudged);
  open.push({ f: h0, h: h0, ci: sIdx });

  let visited = 0;

  const NEIGHBORS: ReadonlyArray<readonly [number, number, number]> = opts.allowDiagonal
    ? [
        [ 0,  1, STRAIGHT_COST],
        [ 1,  1, DIAGONAL_COST],
        [ 1,  0, STRAIGHT_COST],
        [ 1, -1, DIAGONAL_COST],
        [ 0, -1, STRAIGHT_COST],
        [-1, -1, DIAGONAL_COST],
        [-1,  0, STRAIGHT_COST],
        [-1,  1, DIAGONAL_COST],
      ]
    : [
        [ 0,  1, STRAIGHT_COST],
        [ 1,  0, STRAIGHT_COST],
        [ 0, -1, STRAIGHT_COST],
        [-1,  0, STRAIGHT_COST],
      ];

  while (open.length > 0) {
    let bestK = 0;
    let best: OpenNode = open[0]!;
    for (let k = 1; k < open.length; k++) {
      const o = open[k]!;
      if (
        o.f < best.f ||
        (o.f === best.f && (o.h < best.h || (o.h === best.h && o.ci < best.ci)))
      ) {
        best = o; bestK = k;
      }
    }
    open[bestK] = open[open.length - 1]!;
    open.pop();

    const ci = best.ci;
    if (closed[ci]) continue;
    closed[ci] = 1;
    visited++;
    if (visited > opts.maxNodes) return { path: [], visited };

    if (ci === gIdx) {
      return { path: reconstruct(cameFrom, ci, W), visited };
    }

    const cx = ci % W;
    const cy = (ci - cx) / W;

    for (const [dx, dy, step] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!grid.inBoundsCell(nx, ny)) continue;
      if (grid.isBlockedCell(nx, ny)) continue;
      if (dx !== 0 && dy !== 0) {
        if (grid.isBlockedCell(cx + dx, cy)) continue;
        if (grid.isBlockedCell(cx, cy + dy)) continue;
      }
      const ni = idx(nx, ny);
      if (closed[ni]) continue;
      const gCi = gScore[ci]!;
      const tentativeG = gCi + step;
      const gNi = gScore[ni]!;
      if (gNi !== -1 && tentativeG >= gNi) continue;
      gScore[ni] = tentativeG;
      cameFrom[ni] = ci;
      const h = heuristic({ cx: nx, cy: ny }, gNudged);
      open.push({ f: tentativeG + h, h, ci: ni });
    }
  }
  return { path: [], visited };
}

function heuristic(a: CellPos, b: CellPos): number {
  const dx = Math.abs(a.cx - b.cx);
  const dy = Math.abs(a.cy - b.cy);
  const min = dx < dy ? dx : dy;
  const max = dx < dy ? dy : dx;
  return DIAGONAL_COST * min + STRAIGHT_COST * (max - min);
}

function nudgeIfBlocked(grid: NavGrid, p: CellPos, radius: number): CellPos | undefined {
  if (grid.isWalkableCell(p.cx, p.cy)) return p;
  if (radius <= 0) return undefined;
  return grid.nearestWalkableCell(p.cx, p.cy, radius);
}

function reconstruct(cameFrom: Int32Array, endIdx: number, W: number): CellPos[] {
  const out: CellPos[] = [];
  let ci = endIdx;
  while (ci !== -1) {
    const cx = ci % W;
    const cy = (ci - cx) / W;
    out.push({ cx, cy });
    const next = cameFrom[ci];
    if (next === undefined) break;
    ci = next;
  }
  out.reverse();
  return out;
}
