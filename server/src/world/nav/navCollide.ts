// 키보드 이동 벽·경계 충돌 — 축 분리 슬라이드. 클라 예측(client/Noah/Assets/Scripts/World/Nav/NavCollide.cs)과 동형이어야 한다
// (TS 미러가 이 함수를 직접 쓰고, movesync 골든이 C#과 대조한다).
//
// 규칙: X를 먼저 움직이고(행 = 출발 셀의 행), Y는 X 이동 뒤의 열에서 판정한다. 엔티티는 점이고 막힌 이웃 셀 앞 NAV_SKIN에서 멈춘다.
// 결과는 1/4096 격자로 양자화한다(NAV_QUANTUM) — 셀 선택(floor)은 불연속이라 f64(서버)와 f32(클라)가 셀 경계 정확히 위에서 갈리면
// (정수 스폰에서 0.2 보폭 5 tick: f64 62.99999999999999 vs f32 63.0) 벽 끝에서 재조정 떨림이 난다(리뷰 HIGH). 클라도 f64로 계산하고(보폭만 f32
// — 오차 ≈1e-5칸) 달리기 0.2·0.1414와 걷기 0.12·0.0849의 격자 소수부는 반올림 경계에서 0.02칸 이상 떨어져 양쪽 결과가 비트 단위로 같으며,
// 격자 값은 f32에서 정확해 와이어(SNAPSHOT_DELTA f32)도 무손실이다. 출발 셀이 walkable이면 도착 셀도 walkable이다: 대각으로 볼록 모서리에 들어가면
// 벽을 따라 미끄러지고, 두 막힌 셀이 모서리로 붙은 틈은 통과하지 못한다(A* 모서리 자르기 금지와 같다). 맵 밖은 막힌 셀이다.
// 이미 경계와 SKIN 사이에 있으면 뒤로 밀지 않는다. 출발 셀이 막혔어도(경로 추종의 LOS가 모서리를 스친 경우) 축 규칙은 같아서 다른
// 막힌 셀로는 못 들어가고 walkable 이웃으로만 빠진다 — 사방이 막힌 매몰일 때만 자유 이동 + 맵 경계 clamp(갇힘 방지).
// 전제: 축마다 tick당 셀 경계를 1개까지만 넘는다(step < cellSize − 2·SKIN — 플레이어 0.2 < 1, 가드 테스트).
// 경로 추종(MOVE_TO)과 몬스터는 대상이 아니다 — 경로는 nav 위 A* 결과이고, 몬스터는 막힌 직선을 A*로 돌아간다(monsterAiSystem 벽 우회).

import type { NavGrid } from "./navGrid";

/** 막힌 셀 경계에서 남기는 간격(월드 단위). 2의 거듭제곱이라 정수 격자에서 f32·f64 모두 정확히 표현된다. */
export const NAV_SKIN = 1 / 1024;

/** 키보드 이동 결과 양자화 단위의 역수(1/4096) — 정수 격자·NAV_SKIN 배수가 모두 격자 위에 있다. */
export const NAV_QUANTUM = 4096;

/** 가장 가까운 1/4096 격자점(반올림은 +0.5 floor — C# Mathf.Round는 짝수 반올림이라 쓰지 않는다). */
export function quantizeNav(v: number): number {
  return Math.floor(v * NAV_QUANTUM + 0.5) / NAV_QUANTUM;
}

/**
 * 같은 셀 안의 가장 가까운 격자점 — 반올림이 셀 경계를 넘으면(경계 직전 비격자 좌표: 경로 추종 끝점 등) 내림한다. 셀 경계는 격자점이라
 * 내림은 셀을 벗어나지 않는다 — 반올림이 다음(막혔을 수 있는) 셀로 넘기지 않게.
 */
function quantizeInCell(v: number, origin: number, cs: number): number {
  const q = quantizeNav(v);
  if (Math.floor((q - origin) / cs) === Math.floor((v - origin) / cs)) return q;
  return Math.floor(v * NAV_QUANTUM) / NAV_QUANTUM;
}

interface MutablePos {
  x: number;
  y: number;
}

/** pos를 (dx, dy)만큼 슬라이드 이동한다(제자리 변경, 할당 없음). */
export function slideMove(nav: NavGrid, pos: MutablePos, dx: number, dy: number): void {
  const cs = nav.cellSize;
  const ox = nav.originX;
  const oy = nav.originY;
  const x = pos.x;
  const y = pos.y;
  const cx0 = Math.floor((x - ox) / cs);
  const cy0 = Math.floor((y - oy) / cs);
  if (isBuried(nav, cx0, cy0)) {
    pos.x = quantizeInCell(clamp(x + dx, ox, ox + nav.width * cs - NAV_SKIN), ox, cs);
    pos.y = quantizeInCell(clamp(y + dy, oy, oy + nav.height * cs - NAV_SKIN), oy, cs);
    return;
  }
  let nx = x + dx;
  if (dx > 0 && nav.isBlockedCell(cx0 + 1, cy0)) {
    const hi = ox + (cx0 + 1) * cs - NAV_SKIN;
    if (nx > hi) nx = x > hi ? x : hi;
  } else if (dx < 0 && nav.isBlockedCell(cx0 - 1, cy0)) {
    const lo = ox + cx0 * cs + NAV_SKIN;
    if (nx < lo) nx = x < lo ? x : lo;
  }
  const cx1 = Math.floor((nx - ox) / cs);
  let ny = y + dy;
  if (dy > 0 && nav.isBlockedCell(cx1, cy0 + 1)) {
    const hi = oy + (cy0 + 1) * cs - NAV_SKIN;
    if (ny > hi) ny = y > hi ? y : hi;
  } else if (dy < 0 && nav.isBlockedCell(cx1, cy0 - 1)) {
    const lo = oy + cy0 * cs + NAV_SKIN;
    if (ny < lo) ny = y < lo ? y : lo;
  }
  pos.x = quantizeInCell(nx, ox, cs);
  pos.y = quantizeInCell(ny, oy, cs);
}

/** 출발 셀과 4-이웃이 전부 막혔나(맵 밖 포함) — 매몰이면 축 규칙으로는 빠져나갈 수 없다. */
function isBuried(nav: NavGrid, cx: number, cy: number): boolean {
  return (
    nav.isBlockedCell(cx, cy) &&
    nav.isBlockedCell(cx + 1, cy) &&
    nav.isBlockedCell(cx - 1, cy) &&
    nav.isBlockedCell(cx, cy + 1) &&
    nav.isBlockedCell(cx, cy - 1)
  );
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
