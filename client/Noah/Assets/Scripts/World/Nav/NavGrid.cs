// Phase F-6 NavGrid (C#) — 서버 server/src/world/nav/navGrid.ts의 1:1 포팅.
//
// 클라이언트 측 즉시 우회 path 예측에 사용. 서버와 동일 데이터·동일 결정론 보장.
// 외부에서 만든 byte[] cells를 그대로 보관 → immutable로 취급(호출자 책임).

using System;
using UnityEngine;

namespace MMORPG.World.Nav
{
    public sealed class NavGrid
    {
        public int Width { get; }
        public int Height { get; }
        public float CellSize { get; }
        public float OriginX { get; }
        public float OriginY { get; }

        // 0 = walkable, 1 = blocked. row-major: idx = cy * Width + cx.
        private readonly byte[] _cells;

        public NavGrid(int width, int height, float cellSize, float originX, float originY, byte[] cells)
        {
            if (width < 1 || height < 1)
                throw new ArgumentException($"NavGrid: invalid dims {width}x{height}");
            if (cellSize <= 0f)
                throw new ArgumentException($"NavGrid: invalid cellSize {cellSize}");
            if (cells == null || cells.Length != width * height)
                throw new ArgumentException(
                    $"NavGrid: cells length {(cells?.Length ?? 0)} != {width * height}");
            Width = width;
            Height = height;
            CellSize = cellSize;
            OriginX = originX;
            OriginY = originY;
            _cells = cells;
        }

        public static NavGrid Empty(int width, int height, float cellSize, float originX, float originY)
            => new NavGrid(width, height, cellSize, originX, originY, new byte[width * height]);

        public bool InBoundsCell(int cx, int cy)
            => cx >= 0 && cy >= 0 && cx < Width && cy < Height;

        // out-of-bounds는 blocked로 간주.
        public bool IsBlockedCell(int cx, int cy)
        {
            if (!InBoundsCell(cx, cy)) return true;
            return _cells[cy * Width + cx] != 0;
        }

        public bool IsWalkableCell(int cx, int cy) => !IsBlockedCell(cx, cy);

        public (int cx, int cy) WorldToCell(float wx, float wy)
        {
            // Mathf.FloorToInt는 음수에서 -INF 방향 → TS Math.floor와 일치.
            return (
                Mathf.FloorToInt((wx - OriginX) / CellSize),
                Mathf.FloorToInt((wy - OriginY) / CellSize)
            );
        }

        public Vector2 CellCenter(int cx, int cy)
            => new Vector2(OriginX + (cx + 0.5f) * CellSize, OriginY + (cy + 0.5f) * CellSize);

        public bool IsWalkableWorld(float wx, float wy)
        {
            var (cx, cy) = WorldToCell(wx, wy);
            return IsWalkableCell(cx, cy);
        }

        // 가장 가까운 walkable 셀 — 맨해튼 거리 r=1..maxRadius 순. 서버 nearestWalkableCell과 동일.
        public bool TryNearestWalkableCell(int cx, int cy, int maxRadius, out int outCx, out int outCy)
        {
            if (IsWalkableCell(cx, cy)) { outCx = cx; outCy = cy; return true; }
            for (int r = 1; r <= maxRadius; r++)
            {
                for (int dx = -r; dx <= r; dx++)
                {
                    for (int dy = -r; dy <= r; dy++)
                    {
                        if (Mathf.Abs(dx) + Mathf.Abs(dy) != r) continue;
                        int nx = cx + dx;
                        int ny = cy + dy;
                        if (IsWalkableCell(nx, ny)) { outCx = nx; outCy = ny; return true; }
                    }
                }
            }
            outCx = 0; outCy = 0;
            return false;
        }
    }
}
