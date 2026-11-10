// Phase F-2 A* pathfinder.
//
// 입력: NavGrid + 시작 셀 + 목적 셀.
// 출력: 셀 좌표 waypoints[] (시작 포함, 목적 포함). 도달 불가면 빈 배열. 매 호출 새 객체 배열.
//
// 결정론:
//   - g/h/f 비용은 정수만 사용. 직선 step = 10, 대각선 step = 14 (옥타일 표준).
//   - tie-breaker: 같은 f -> 같은 h -> 같은 cellIdx 순. 동일 입력 항상 동일 path.
//   - 8방향(대각선) 사용 시 cut-corner 금지: 대각선 이동은 인접 두 직선 셀이 모두 walkable일 때만.
//   - C# 포팅(클라 AStar.FindPath)은 선형 스캔 open list다. 여기의 이진 힙은 같은 비교자라
//     pop 순서가 같다(openHeap.ts 머리말) — tools/nav/exportGolden.ts 골든이 그 등가를 고정한다.
//
// 가드:
//   - MAX_NODES (기본 50000). 초과하면 빈 배열 반환. 무한 탐색 방지.
//   - 시작/목적이 blocked면 NavGrid.nearestWalkableCell로 nudge (반경 nudgeRadius).
//
// 할당: gScore/cameFrom/closed는 모듈 scratch(지금까지 본 최대 격자 크기)를 재사용하고, 탐색마다
//   epoch를 올려 유효성을 스탬프로 판정한다(초기화 비용 O(1)). 동기·비재진입 함수라 단일 scratch로 충분.

import type { NavGrid } from "./navGrid";
import { OpenHeap } from "./openHeap";

export interface AStarOptions {
  /** 8방향 허용. false면 4방향만. 기본 true. */
  readonly allowDiagonal: boolean;
  /** 탐색 노드 상한. 초과 시 abort + 빈 배열. 기본 50000. */
  readonly maxNodes: number;
  /** 시작/목적이 blocked일 때 가장 가까운 walkable로 옮길 최대 반경. 0이면 nudge 안 함. 기본 4. */
  readonly nudgeRadius: number;
}

const DEFAULT_OPTS: AStarOptions = {
  allowDiagonal: true,
  maxNodes: 50000,
  nudgeRadius: 4,
};

const STRAIGHT_COST = 10;
const DIAGONAL_COST = 14;
const UINT32_MAX = 0xffffffff;

// 결정적 순회 순서: N, NE, E, SE, S, SW, W, NW. (dx, dy, step) 3개씩 평탄화.
const NEIGHBORS_8: readonly number[] = [
  0, 1, STRAIGHT_COST,
  1, 1, DIAGONAL_COST,
  1, 0, STRAIGHT_COST,
  1, -1, DIAGONAL_COST,
  0, -1, STRAIGHT_COST,
  -1, -1, DIAGONAL_COST,
  -1, 0, STRAIGHT_COST,
  -1, 1, DIAGONAL_COST,
];
const NEIGHBORS_4: readonly number[] = [
  0, 1, STRAIGHT_COST,
  1, 0, STRAIGHT_COST,
  0, -1, STRAIGHT_COST,
  -1, 0, STRAIGHT_COST,
];

export interface CellPos {
  readonly cx: number;
  readonly cy: number;
}

export interface AStarResult {
  path: CellPos[];
  /** closed 확장 수(maxNodes 가드가 세는 값). nudge 실패·시작 == 목적이면 0. */
  visited: number;
}

// ── 탐색 scratch ──
// gScore/cameFrom[i]는 seenAt[i] === epoch일 때만 유효. closedAt[i] === epoch면 closed.
let capacity = 0;
let gScore = new Int32Array(0);
let cameFrom = new Int32Array(0);
let seenAt = new Uint32Array(0);
let closedAt = new Uint32Array(0);
let epoch = 0;
let lastVisited = 0;
const open = new OpenHeap();

/** 탐색 1회 시작: scratch를 total 칸 이상으로 맞추고 새 epoch를 돌려준다. */
function beginSearch(total: number): number {
  if (total > capacity) {
    // 새 배열의 스탬프는 0 — epoch는 항상 1 이상이라 낡은 값과 겹치지 않는다.
    gScore = new Int32Array(total);
    cameFrom = new Int32Array(total);
    seenAt = new Uint32Array(total);
    closedAt = new Uint32Array(total);
    capacity = total;
  }
  if (epoch >= UINT32_MAX) {
    // Uint32 순환: 이전 epoch 값이 다시 쓰이기 전에 스탬프를 전부 지운다.
    seenAt.fill(0);
    closedAt.fill(0);
    epoch = 0;
  }
  epoch++;
  open.clear();
  return epoch;
}

/** 테스트 전용: 다음 탐색이 epoch + 1을 쓰게 한다(스탬프는 건드리지 않음 — 순환 경계 재현). */
export function setAStarEpochForTest(value: number): void {
  epoch = value >>> 0;
}

/**
 * A* 경로 탐색. 도달 불가/예산 초과 시 [].
 * 시작/목적이 blocked면 nudge 후 재시도.
 */
export function findPath(
  grid: NavGrid,
  start: CellPos,
  goal: CellPos,
  options: Partial<AStarOptions> = {},
): CellPos[] {
  return search(grid, start, goal, { ...DEFAULT_OPTS, ...options });
}

/** findPath + 탐색량(visited). 등가 테스트·벤치용 — 경로는 findPath와 같다. */
export function findPathWithStats(
  grid: NavGrid,
  start: CellPos,
  goal: CellPos,
  options: Partial<AStarOptions> = {},
): AStarResult {
  const path = search(grid, start, goal, { ...DEFAULT_OPTS, ...options });
  return { path, visited: lastVisited };
}

function search(grid: NavGrid, start: CellPos, goal: CellPos, opts: AStarOptions): CellPos[] {
  lastVisited = 0;
  const sNudged = nudgeIfBlocked(grid, start, opts.nudgeRadius);
  const gNudged = nudgeIfBlocked(grid, goal, opts.nudgeRadius);
  if (!sNudged || !gNudged) return [];
  if (sNudged.cx === gNudged.cx && sNudged.cy === gNudged.cy) return [sNudged];

  const W = grid.width;
  const stamp = beginSearch(W * grid.height);
  const sIdx = sNudged.cy * W + sNudged.cx;
  seenAt[sIdx] = stamp;
  gScore[sIdx] = 0;
  cameFrom[sIdx] = -1;
  const h0 = octile(sNudged.cx - gNudged.cx, sNudged.cy - gNudged.cy);
  open.push(h0, h0, sIdx);

  const end = runOpenLoop(grid, gNudged, stamp, opts);
  return end === -1 ? [] : reconstruct(end, W);
}

/** open이 빌 때까지 확장. 목적 셀 인덱스(도달) 또는 -1(도달 불가·예산 초과). */
function runOpenLoop(grid: NavGrid, goal: CellPos, stamp: number, opts: AStarOptions): number {
  const gIdx = goal.cy * grid.width + goal.cx;
  const dirs = opts.allowDiagonal ? NEIGHBORS_8 : NEIGHBORS_4;
  let visited = 0;
  let found = -1;
  while (open.size > 0) {
    const ci = open.pop();
    if (closedAt[ci] === stamp) continue;
    closedAt[ci] = stamp;
    visited++;
    if (visited > opts.maxNodes) break;
    if (ci === gIdx) {
      found = ci;
      break;
    }
    relaxNeighbors(grid, ci, goal, stamp, dirs);
  }
  lastVisited = visited;
  return found;
}

function relaxNeighbors(
  grid: NavGrid,
  ci: number,
  goal: CellPos,
  stamp: number,
  dirs: readonly number[],
): void {
  const W = grid.width;
  const cx = ci % W;
  const cy = (ci - cx) / W;
  // ci는 open에서 나온 셀 = 이번 탐색에서 gScore가 셋된 셀.
  const gCi = gScore[ci]!;
  for (let k = 0; k < dirs.length; k += 3) {
    const dx = dirs[k]!;
    const dy = dirs[k + 1]!;
    const nx = cx + dx;
    const ny = cy + dy;
    // isBlockedCell은 범위 밖도 blocked — "범위 안 && walkable" 검사와 같다.
    if (grid.isBlockedCell(nx, ny)) continue;
    if (dx !== 0 && dy !== 0) {
      if (grid.isBlockedCell(cx + dx, cy)) continue;
      if (grid.isBlockedCell(cx, cy + dy)) continue;
    }
    const ni = ny * W + nx;
    if (closedAt[ni] === stamp) continue;
    const tentativeG = gCi + dirs[k + 2]!;
    if (seenAt[ni] === stamp && tentativeG >= gScore[ni]!) continue;
    seenAt[ni] = stamp;
    gScore[ni] = tentativeG;
    cameFrom[ni] = ci;
    const h = octile(nx - goal.cx, ny - goal.cy);
    open.push(tentativeG + h, h, ni);
  }
}

/** Octile 휴리스틱(셀 차이 dx, dy): 4/8방향 모두 admissible. 정수. */
function octile(dxSigned: number, dySigned: number): number {
  const dx = Math.abs(dxSigned);
  const dy = Math.abs(dySigned);
  const min = dx < dy ? dx : dy;
  const max = dx < dy ? dy : dx;
  return DIAGONAL_COST * min + STRAIGHT_COST * (max - min);
}

function nudgeIfBlocked(grid: NavGrid, p: CellPos, radius: number): CellPos | undefined {
  if (grid.isWalkableCell(p.cx, p.cy)) return p;
  if (radius <= 0) return undefined;
  return grid.nearestWalkableCell(p.cx, p.cy, radius);
}

/** 목적 셀에서 cameFrom을 따라 시작(-1)까지. 경로 셀은 모두 이번 epoch에 seen이다. */
function reconstruct(endIdx: number, W: number): CellPos[] {
  const out: CellPos[] = [];
  let ci = endIdx;
  while (ci !== -1) {
    const cx = ci % W;
    out.push({ cx, cy: (ci - cx) / W });
    ci = cameFrom[ci]!;
  }
  out.reverse();
  return out;
}


/**
 * 같은 방향 연속 셀을 합쳐 waypoint 수 줄이기. F-3에서 클라 송신 시 패킷 절약.
 * LOS는 검사하지 않음 — 격자 직선만.
 */
export function simplifyPath(path: CellPos[]): CellPos[] {
  if (path.length <= 2) return path.slice();
  // length >= 3 가드 후라 path[0], path[1], path[length-1]은 정의됨.
  const first = path[0]!;
  const second = path[1]!;
  const out: CellPos[] = [first];
  let prevDx = second.cx - first.cx;
  let prevDy = second.cy - first.cy;
  for (let i = 1; i < path.length - 1; i++) {
    const cur = path[i]!;
    const next = path[i + 1]!;
    const dx = next.cx - cur.cx;
    const dy = next.cy - cur.cy;
    if (dx !== prevDx || dy !== prevDy) {
      out.push(cur);
      prevDx = dx;
      prevDy = dy;
    }
  }
  out.push(path[path.length - 1]!);
  return out;
}

/**
 * 두 셀 사이 grid LOS 검사. Bresenham 정수 알고리즘.
 * 대각선 step에서 인접 두 직선 셀 중 하나라도 blocked면 corner-clip 금지(false).
 * NavGrid out-of-bounds는 blocked로 간주.
 */
export function lineOfSight(grid: NavGrid, a: CellPos, b: CellPos): boolean {
  let cx = a.cx;
  let cy = a.cy;
  if (grid.isBlockedCell(cx, cy)) return false;
  const tx = b.cx;
  const ty = b.cy;
  const dxAbs = Math.abs(tx - cx);
  const dyAbsNeg = -Math.abs(ty - cy);
  const sx = cx < tx ? 1 : -1;
  const sy = cy < ty ? 1 : -1;
  let err = dxAbs + dyAbsNeg;
  // 안전장치: 격자 크기 상한 안에서 끝남.
  for (let guard = 0; guard < grid.width * grid.height + 1; guard++) {
    if (cx === tx && cy === ty) return true;
    const e2 = 2 * err;
    let stepX = false;
    let stepY = false;
    if (e2 >= dyAbsNeg) { err += dyAbsNeg; cx += sx; stepX = true; }
    if (e2 <= dxAbs)    { err += dxAbs;    cy += sy; stepY = true; }
    if (stepX && stepY) {
      // 대각 step: corner-clip 금지.
      if (grid.isBlockedCell(cx - sx, cy)) return false;
      if (grid.isBlockedCell(cx, cy - sy)) return false;
    }
    if (grid.isBlockedCell(cx, cy)) return false;
  }
  return false;
}

/**
 * String-pulling path smoothing. A* 산출 셀 path에 대해, LOS가 통과되는 가장 먼 다음 점으로
 * 점프해 가며 waypoint 수를 줄임. 결과는 시작 + 꺾이는 점들 + 목적지 — 격자 계단 모양 제거.
 *
 * 결정론: lineOfSight가 정수 Bresenham이라 같은 입력 동일 결과 보장.
 */
export function smoothPath(grid: NavGrid, path: CellPos[]): CellPos[] {
  if (path.length <= 2) return path.slice();
  // length >= 3 가드 후. i, j는 모두 path 인덱스 in-bounds로만 사용 — non-null 안전.
  const out: CellPos[] = [path[0]!];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1) {
      if (lineOfSight(grid, path[i]!, path[j]!)) break;
      j--;
    }
    out.push(path[j]!);
    i = j;
  }
  return out;
}
