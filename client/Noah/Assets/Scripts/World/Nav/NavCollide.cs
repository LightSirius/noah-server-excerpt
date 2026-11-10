// 키보드 이동 벽·경계 충돌 — 서버 server/src/world/nav/navCollide.ts slideMove의 1:1 포팅(클라 예측이 서버와 같은 지점에서 멈춰야
// 벽을 누를 때 재조정 떨림이 없다). 동형성은 movesync 골든(collision 절 + 벽 시나리오)이 ClientPredictionGoldenTests로 고정한다.
//
// 규칙: X를 먼저(행 = 출발 셀의 행), Y는 X 이동 뒤의 열에서. 막힌 이웃 셀 앞 Skin에서 멈추고, 결과를 1/4096 격자로 양자화한다 —
// 셀 선택(floor)이 셀 경계 정확히 위에서 서버와 갈리지 않게. 계산은 서버처럼 f64로 한다: 입력 좌표는 격자 위라 f32에서 정확하고 보폭 오차는
// ≈1e-5칸인데, f32로 더하면 좌표에 따라 오차가 0.03칸을 넘어 걷기 보폭(0.12 = 491.52칸 — 반올림 경계에서 0.02칸)이 x ≥ 128 서쪽에서 갈린다.
// 대각 틈은 통과 불가, 맵 밖은 막힘, 사방이 막힌 매몰만 자유 이동.

using System;
using UnityEngine;

namespace MMORPG.World.Nav
{
    public static class NavCollide
    {
        /// <summary>막힌 셀 경계에서 남기는 간격 — 서버 NAV_SKIN(1/1024)과 같다.</summary>
        public const double Skin = 1.0 / 1024.0;

        /// <summary>양자화 단위의 역수(1/4096) — 서버 NAV_QUANTUM과 같다.</summary>
        public const double Quantum = 4096.0;

        /// <summary>가장 가까운 1/4096 격자점(+0.5 floor — Math.Round 기본은 짝수 반올림이라 서버와 다르다).</summary>
        public static double Quantize(double v) => Math.Floor(v * Quantum + 0.5) / Quantum;

        /// <summary>같은 셀 안의 가장 가까운 격자점 — 반올림이 셀 경계를 넘으면 내림(서버 quantizeInCell과 같다).</summary>
        private static float QuantizeInCell(double v, double origin, double cs)
        {
            double q = Quantize(v);
            if (Math.Floor((q - origin) / cs) == Math.Floor((v - origin) / cs)) return (float)q;
            return (float)(Math.Floor(v * Quantum) / Quantum);
        }

        private static double Clamp(double v, double lo, double hi) => v < lo ? lo : v > hi ? hi : v;

        /// <summary>pos에서 (dx, dy)만큼 슬라이드 이동한 결과.</summary>
        public static Vector2 SlideMove(NavGrid nav, Vector2 pos, float dx, float dy)
        {
            double cs = nav.CellSize;
            double ox = nav.OriginX;
            double oy = nav.OriginY;
            double x = pos.x;
            double y = pos.y;
            int cx0 = (int)Math.Floor((x - ox) / cs);
            int cy0 = (int)Math.Floor((y - oy) / cs);
            if (IsBuried(nav, cx0, cy0))
            {
                return new Vector2(
                    QuantizeInCell(Clamp(x + dx, ox, ox + nav.Width * cs - Skin), ox, cs),
                    QuantizeInCell(Clamp(y + dy, oy, oy + nav.Height * cs - Skin), oy, cs));
            }

            double nx = x + dx;
            if (dx > 0 && nav.IsBlockedCell(cx0 + 1, cy0))
            {
                double hi = ox + (cx0 + 1) * cs - Skin;
                if (nx > hi) nx = x > hi ? x : hi;
            }
            else if (dx < 0 && nav.IsBlockedCell(cx0 - 1, cy0))
            {
                double lo = ox + cx0 * cs + Skin;
                if (nx < lo) nx = x < lo ? x : lo;
            }

            int cx1 = (int)Math.Floor((nx - ox) / cs);
            double ny = y + dy;
            if (dy > 0 && nav.IsBlockedCell(cx1, cy0 + 1))
            {
                double hi = oy + (cy0 + 1) * cs - Skin;
                if (ny > hi) ny = y > hi ? y : hi;
            }
            else if (dy < 0 && nav.IsBlockedCell(cx1, cy0 - 1))
            {
                double lo = oy + cy0 * cs + Skin;
                if (ny < lo) ny = y < lo ? y : lo;
            }
            return new Vector2(QuantizeInCell(nx, ox, cs), QuantizeInCell(ny, oy, cs));
        }

        private static bool IsBuried(NavGrid nav, int cx, int cy)
            => nav.IsBlockedCell(cx, cy)
               && nav.IsBlockedCell(cx + 1, cy)
               && nav.IsBlockedCell(cx - 1, cy)
               && nav.IsBlockedCell(cx, cy + 1)
               && nav.IsBlockedCell(cx, cy - 1);
    }
}
