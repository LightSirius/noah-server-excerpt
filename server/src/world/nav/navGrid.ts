// Phase F-1 NavGrid — 셀 격자 충돌 데이터.
//
// 사양: shared/maps/README.md
// 사용처: F-2 A* pathfinder, F-3 movementSystem 웨이포인트 진행 시 walkable 판정.
//
// 결정론: 모든 좌표 변환은 정수/순차 floor — 부동소수 비결정성 없음.
//   isBlockedCell은 O(1), isWalkableWorld는 floor 1회 + O(1).

export interface NavGridDims {
  readonly width: number;     // 셀 개수 (x)
  readonly height: number;    // 셀 개수 (y)
  readonly cellSize: number;  // 월드 단위/셀
  readonly originX: number;   // (0,0) 셀 좌하단 월드 x
  readonly originY: number;   // (0,0) 셀 좌하단 월드 y
}

export class NavGrid {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly originX: number;
  readonly originY: number;
  /** 0 = walkable, 1 = blocked. row-major: idx = cy * width + cx. */
  private readonly cells: Uint8Array;

  /**
   * @param cells row-major (cy=0 row first). 길이 = width*height. 외부에서 만든 buffer를
   *   그대로 보관 — 호출자가 이후 변경하지 않을 것을 보장해야 한다(NavGrid는 immutable로 취급).
   */
  constructor(dims: NavGridDims, cells: Uint8Array) {
    if (dims.width < 1 || dims.height < 1) {
      throw new Error(`NavGrid: invalid dims ${dims.width}x${dims.height}`);
    }
    if (dims.cellSize <= 0) {
      throw new Error(`NavGrid: invalid cellSize ${dims.cellSize}`);
    }
    if (cells.length !== dims.width * dims.height) {
      throw new Error(
        `NavGrid: cells length ${cells.length} != ${dims.width * dims.height}`,
      );
    }
    this.width = dims.width;
    this.height = dims.height;
    this.cellSize = dims.cellSize;
    this.originX = dims.originX;
    this.originY = dims.originY;
    this.cells = cells;
  }

  /** 모든 셀 walkable인 무장애 그리드. 파일 없을 때 fallback. */
  static empty(dims: NavGridDims): NavGrid {
    return new NavGrid(dims, new Uint8Array(dims.width * dims.height));
  }

  /** 셀 인덱스 in-bounds 체크. */
  inBoundsCell(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.width && cy < this.height;
  }

  /** out-of-bounds는 blocked로 간주. */
  isBlockedCell(cx: number, cy: number): boolean {
    if (!this.inBoundsCell(cx, cy)) return true;
    return this.cells[cy * this.width + cx] !== 0;
  }

  /** out-of-bounds는 blocked로 간주. */
  isWalkableCell(cx: number, cy: number): boolean {
    return !this.isBlockedCell(cx, cy);
  }

  /** 월드 좌표 → 셀 좌표. floor 정확. */
  worldToCell(wx: number, wy: number): { cx: number; cy: number } {
    return {
      cx: Math.floor((wx - this.originX) / this.cellSize),
      cy: Math.floor((wy - this.originY) / this.cellSize),
    };
  }

  /** 셀 좌표 → 셀 가운데 월드 좌표. */
  cellCenter(cx: number, cy: number): { x: number; y: number } {
    return {
      x: this.originX + (cx + 0.5) * this.cellSize,
      y: this.originY + (cy + 0.5) * this.cellSize,
    };
  }

  /** 월드 좌표 walkable 판정. */
  isWalkableWorld(wx: number, wy: number): boolean {
    const { cx, cy } = this.worldToCell(wx, wy);
    return this.isWalkableCell(cx, cy);
  }

  /**
   * 가장 가까운 walkable 셀을 nudge로 찾기. 도달 불가 좌표를 클릭했을 때 fallback용.
   * 맨해튼 거리로 BFS — 최대 maxRadius 셀까지 탐색. 없으면 undefined.
   */
  nearestWalkableCell(
    cx: number,
    cy: number,
    maxRadius: number,
  ): { cx: number; cy: number } | undefined {
    if (this.isWalkableCell(cx, cy)) return { cx, cy };
    for (let r = 1; r <= maxRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) + Math.abs(dy) !== r) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (this.isWalkableCell(nx, ny)) return { cx: nx, cy: ny };
        }
      }
    }
    return undefined;
  }
}
