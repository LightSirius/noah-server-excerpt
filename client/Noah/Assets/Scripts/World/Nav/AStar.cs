// Phase F-6 AStar (C#) — 서버 server/src/world/nav/aStar.ts의 1:1 포팅.
//
// 결정론 일치 보장:
//   - 정수 비용만 사용 (직선 10, 대각선 14).
//   - tie-breaker: f -> h -> ci(=cy*W+cx) 순. 서버와 동일.
//   - NEIGHBORS 순회 순서 동일: N, NE, E, SE, S, SW, W, NW.
//   - cut-corner 금지: 대각선은 인접 두 직선 셀이 모두 walkable일 때만.
//   - nudge: 시작/목적이 blocked면 nearestWalkableCell로 옮긴 뒤 탐색.
//   - 빈 path = 도달 불가 또는 maxNodes 초과.
//
// 회귀 검증: tests/server/nav/aStar-zone1.test.ts의 골든 path를 클라가 동일하게 산출해야 함.

using System;
using System.Buffers;
using System.Collections.Generic;
using UnityEngine;

namespace MMORPG.World.Nav
{
    public readonly struct CellPos
    {
        public readonly int Cx;
        public readonly int Cy;
        public CellPos(int cx, int cy) { Cx = cx; Cy = cy; }
        public override string ToString() => $"({Cx},{Cy})";
        public override bool Equals(object obj) => obj is CellPos o && o.Cx == Cx && o.Cy == Cy;
        public override int GetHashCode() => (Cy * 73856093) ^ Cx;
    }

    public sealed class AStarOptions
    {
        // 8방향 허용. false면 4방향만.
        public bool AllowDiagonal = true;
        // 탐색 노드 상한.
        public int MaxNodes = 50000;
        // 시작/목적이 blocked일 때 옮길 최대 반경. 0이면 nudge 안 함.
        public int NudgeRadius = 4;
    }

    public static class AStar
    {
        private const int STRAIGHT_COST = 10;
        private const int DIAGONAL_COST = 14;

        // 서버 NEIGHBORS 순서와 일치 (allowDiagonal일 때 N, NE, E, SE, S, SW, W, NW).
        private static readonly (int dx, int dy, int step)[] NEIGHBORS_8 = new[]
        {
            ( 0,  1, STRAIGHT_COST),
            ( 1,  1, DIAGONAL_COST),
            ( 1,  0, STRAIGHT_COST),
            ( 1, -1, DIAGONAL_COST),
            ( 0, -1, STRAIGHT_COST),
            (-1, -1, DIAGONAL_COST),
            (-1,  0, STRAIGHT_COST),
            (-1,  1, DIAGONAL_COST),
        };

        private static readonly (int dx, int dy, int step)[] NEIGHBORS_4 = new[]
        {
            ( 0,  1, STRAIGHT_COST),
            ( 1,  0, STRAIGHT_COST),
            ( 0, -1, STRAIGHT_COST),
            (-1,  0, STRAIGHT_COST),
        };

        public static List<CellPos> FindPath(NavGrid grid, CellPos start, CellPos goal, AStarOptions options = null)
        {
            var opts = options ?? new AStarOptions();

            if (!NudgeIfBlocked(grid, start, opts.NudgeRadius, out var sNudged)) return new List<CellPos>();
            if (!NudgeIfBlocked(grid, goal, opts.NudgeRadius, out var gNudged)) return new List<CellPos>();
            if (sNudged.Cx == gNudged.Cx && sNudged.Cy == gNudged.Cy)
                return new List<CellPos> { sNudged };

            int W = grid.Width;
            int H = grid.Height;
            int total = W * H;

            // ArrayPool로 큰 배열(grid 전체 셀 수) 재사용. Rent된 배열은 length >= total일 수
            // 있으므로 인덱싱은 항상 < total로 제한. 초기값이 보장되지 않아 명시적 초기화 필수.
            int[] gScore = ArrayPool<int>.Shared.Rent(total);
            int[] cameFrom = ArrayPool<int>.Shared.Rent(total);
            byte[] closed = ArrayPool<byte>.Shared.Rent(total);
            try
            {
                for (int i = 0; i < total; i++) { gScore[i] = -1; cameFrom[i] = -1; closed[i] = 0; }

                int sIdx = sNudged.Cy * W + sNudged.Cx;
                int gIdx = gNudged.Cy * W + gNudged.Cx;
                gScore[sIdx] = 0;
                int h0 = Heuristic(sNudged, gNudged);

                var open = new List<OpenNode>(64);
                open.Add(new OpenNode { F = h0, H = h0, Ci = sIdx });

                var neighbors = opts.AllowDiagonal ? NEIGHBORS_8 : NEIGHBORS_4;
                int visited = 0;

                while (open.Count > 0)
                {
                    // 결정적 priority 선택 — (F, H, Ci) 최소. 서버(이진 힙, 성능 3단계)와 같은 비교자라 경로·방문 수가 같다.
                    int bestK = 0;
                    var best = open[0];
                    for (int k = 1; k < open.Count; k++)
                    {
                        var o = open[k];
                        if (o.F < best.F ||
                            (o.F == best.F && (o.H < best.H || (o.H == best.H && o.Ci < best.Ci))))
                        {
                            best = o; bestK = k;
                        }
                    }
                    open[bestK] = open[open.Count - 1];
                    open.RemoveAt(open.Count - 1);

                    int ci = best.Ci;
                    if (closed[ci] != 0) continue;
                    closed[ci] = 1;
                    visited++;
                    if (visited > opts.MaxNodes) return new List<CellPos>();

                    if (ci == gIdx) return Reconstruct(cameFrom, ci, W);

                    int cx = ci % W;
                    int cy = (ci - cx) / W;

                    for (int n = 0; n < neighbors.Length; n++)
                    {
                        var (dx, dy, step) = neighbors[n];
                        int nx = cx + dx;
                        int ny = cy + dy;
                        if (!grid.InBoundsCell(nx, ny)) continue;
                        if (grid.IsBlockedCell(nx, ny)) continue;
                        if (dx != 0 && dy != 0)
                        {
                            if (grid.IsBlockedCell(cx + dx, cy)) continue;
                            if (grid.IsBlockedCell(cx, cy + dy)) continue;
                        }
                        int ni = ny * W + nx;
                        if (closed[ni] != 0) continue;
                        int tentativeG = gScore[ci] + step;
                        if (gScore[ni] != -1 && tentativeG >= gScore[ni]) continue;
                        gScore[ni] = tentativeG;
                        cameFrom[ni] = ci;
                        int hh = Heuristic(new CellPos(nx, ny), gNudged);
                        open.Add(new OpenNode { F = tentativeG + hh, H = hh, Ci = ni });
                    }
                }
                return new List<CellPos>();
            }
            finally
            {
                ArrayPool<int>.Shared.Return(gScore);
                ArrayPool<int>.Shared.Return(cameFrom);
                ArrayPool<byte>.Shared.Return(closed);
            }
        }

        // Octile 휴리스틱 (정수). 서버 heuristic과 일치.
        private static int Heuristic(CellPos a, CellPos b)
        {
            int dx = Mathf.Abs(a.Cx - b.Cx);
            int dy = Mathf.Abs(a.Cy - b.Cy);
            int min = dx < dy ? dx : dy;
            int max = dx < dy ? dy : dx;
            return DIAGONAL_COST * min + STRAIGHT_COST * (max - min);
        }

        private static bool NudgeIfBlocked(NavGrid grid, CellPos p, int radius, out CellPos result)
        {
            if (grid.IsWalkableCell(p.Cx, p.Cy)) { result = p; return true; }
            if (radius <= 0) { result = default; return false; }
            if (grid.TryNearestWalkableCell(p.Cx, p.Cy, radius, out int nx, out int ny))
            {
                result = new CellPos(nx, ny);
                return true;
            }
            result = default;
            return false;
        }

        private static List<CellPos> Reconstruct(int[] cameFrom, int endIdx, int W)
        {
            var rev = new List<CellPos>(64);
            int ci = endIdx;
            while (ci != -1)
            {
                int cx = ci % W;
                int cy = (ci - cx) / W;
                rev.Add(new CellPos(cx, cy));
                ci = cameFrom[ci];
            }
            rev.Reverse();
            return rev;
        }

        // 같은 방향 연속 셀을 합쳐 waypoint 수 줄이기 — 서버 simplifyPath와 동일.
        public static List<CellPos> SimplifyPath(List<CellPos> path)
        {
            if (path == null || path.Count <= 2)
                return path == null ? new List<CellPos>() : new List<CellPos>(path);
            var outList = new List<CellPos>(path.Count) { path[0] };
            int prevDx = path[1].Cx - path[0].Cx;
            int prevDy = path[1].Cy - path[0].Cy;
            for (int i = 1; i < path.Count - 1; i++)
            {
                int dx = path[i + 1].Cx - path[i].Cx;
                int dy = path[i + 1].Cy - path[i].Cy;
                if (dx != prevDx || dy != prevDy)
                {
                    outList.Add(path[i]);
                    prevDx = dx;
                    prevDy = dy;
                }
            }
            outList.Add(path[path.Count - 1]);
            return outList;
        }

        // 두 셀 사이 grid LOS — 서버 lineOfSight와 동일 정수 Bresenham.
        // 대각 step에서 인접 두 직선 셀 중 하나라도 blocked면 false (corner-clip 금지).
        public static bool LineOfSight(NavGrid grid, CellPos a, CellPos b)
        {
            int cx = a.Cx, cy = a.Cy;
            if (grid.IsBlockedCell(cx, cy)) return false;
            int tx = b.Cx, ty = b.Cy;
            int dxAbs = Mathf.Abs(tx - cx);
            int dyAbsNeg = -Mathf.Abs(ty - cy);
            int sx = cx < tx ? 1 : -1;
            int sy = cy < ty ? 1 : -1;
            int err = dxAbs + dyAbsNeg;
            int safety = grid.Width * grid.Height + 1;
            for (int guard = 0; guard < safety; guard++)
            {
                if (cx == tx && cy == ty) return true;
                int e2 = 2 * err;
                bool stepX = false, stepY = false;
                if (e2 >= dyAbsNeg) { err += dyAbsNeg; cx += sx; stepX = true; }
                if (e2 <= dxAbs)    { err += dxAbs;    cy += sy; stepY = true; }
                if (stepX && stepY)
                {
                    if (grid.IsBlockedCell(cx - sx, cy)) return false;
                    if (grid.IsBlockedCell(cx, cy - sy)) return false;
                }
                if (grid.IsBlockedCell(cx, cy)) return false;
            }
            return false;
        }

        // String-pulling smoothing — 서버 smoothPath와 동일 결정론.
        // A* path를 LOS로 단축해 격자 계단 모양 제거. 결과: 시작 + 꺾임 + 끝.
        public static List<CellPos> SmoothPath(NavGrid grid, List<CellPos> path)
        {
            if (path == null || path.Count <= 2)
                return path == null ? new List<CellPos>() : new List<CellPos>(path);
            var outList = new List<CellPos>(path.Count) { path[0] };
            int i = 0;
            while (i < path.Count - 1)
            {
                int j = path.Count - 1;
                while (j > i + 1)
                {
                    if (LineOfSight(grid, path[i], path[j])) break;
                    j--;
                }
                outList.Add(path[j]);
                i = j;
            }
            return outList;
        }

        private struct OpenNode
        {
            public int F;
            public int H;
            public int Ci;
        }
    }
}
