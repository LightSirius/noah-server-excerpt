// Phase 3 컴포넌트: 월드 좌표.
// 단위는 타일이 아닌 "월드 단위" (1 unit = 1 타일). f32로 충분.

export interface Position {
  x: number;
  y: number;
}

export function makePosition(x: number, y: number): Position {
  return { x, y };
}
