// Phase 4 AOI 그리드 — 16-타일 셀 인덱스. 성능 3단계 슬라이스 7: 데이터 지향 저장.
//
// architecture.md §5.1: 셀 크기 16타일은 화면 시야(20×11)보다 넉넉. 3×3 윈도우로 시야 커버.
// 결정론 계약(세션별 와이어 순서가 여기에 묶여 있다 — tests/regression/wireCharacterization):
//   - 창 순회: dy -1..1(바깥) × dx -1..1(안쪽), 셀 안은 삽입 순서. 셀이 바뀐 upsert는 새 셀의 끝에 붙고
//     (같은 셀로 돌아와도 끝), 같은 셀 upsert는 no-op. 종전 Map<cellKey, Set> 삽입 순서와 같다.
//   - 셀 키는 cellKey(16비트 wrap) 그대로 — ±32768 셀 밖은 종전처럼 겹친다. 창의 셀 키가 겹치면(NaN·초대형 좌표)
//     그 셀은 한 번만 돈다(종전 Set의 중복 제거와 같은 결과).
// 저장: entity마다 dense slot(id → slot Map — id가 희소: charId·1e9 몬스터·1.5e9 NPC·2e9 지면 아이템).
//   셀은 slot의 이중 연결 리스트(prev/next Int32Array) — 순서 보존 제거 O(1), 끝 삽입 O(1). 셀 좌표는 Float64Array로
//   종전 {cx, cy} 객체와 같은 비교(NaN은 늘 '다름', -0 == 0)를 한다. 좌표 범위 제한은 없다(드롭은 음수일 수 있다).
// slot 재사용 지연: 제거된 slot은 recycleSlots()(존이 스냅샷 dispatch마다 1회) 2회 뒤에야 다른 id에 준다 — 그동안
//   InterestSet 목록에 남은 slot이 새 entity로 오인되지 않는다. 그 사이 같은 id가 다시 들어오면 같은 slot을 되찾는다
//   (제거 후 재등록 = 종전 Set 의미로 keep). InterestSet은 slot마다 id도 대조해 지연을 못 지킨 호출자에도 안전하다.

import type { EntityId } from "../entityTable";

export const CELL_SIZE = 16;          // 월드 단위(=타일) per 셀.
export const AOI_RADIUS = 1;          // 3x3 윈도우 -> radius=1.
/** 창 1개의 최대 셀 수. */
export const WINDOW_CELLS = (2 * AOI_RADIUS + 1) * (2 * AOI_RADIUS + 1);

/** 월드 좌표 -> 셀 좌표. */
export function worldToCell(x: number): number {
  return Math.floor(x / CELL_SIZE);
}

/** 셀 좌표 페어 -> 단일 정수 키. cy를 상위 16비트, cx를 하위 16비트(부호 있음). */
export function cellKey(cx: number, cy: number): number {
  // -32768..32767 범위 가정. 더 큰 월드면 BigInt 키로 전환.
  return ((cy & 0xffff) << 16) | (cx & 0xffff);
}

export interface CellPos {
  cx: number;
  cy: number;
}

/** 연결 리스트 끝·셀 밖 표지. */
export const NO_SLOT = -1;
const INITIAL_SLOTS = 64;
const INITIAL_CELLS = 64;
/** 제거된 slot을 다른 id에 주기까지 기다리는 recycleSlots 횟수(dispatch 도중 제거까지 덮는 보수적 값). */
export const SLOT_REUSE_DELAY = 2;

function grownI32(a: Int32Array, cap: number): Int32Array<ArrayBuffer> {
  const b = new Int32Array(cap);
  b.set(a);
  return b;
}

function grownF64(a: Float64Array, cap: number): Float64Array<ArrayBuffer> {
  const b = new Float64Array(cap);
  b.set(a);
  return b;
}

export class AoiGrid {
  private readonly slotOfId = new Map<EntityId, number>();
  /** slot → entity id. 제거 후에도 다른 id에 재사용될 때까지 남는다(InterestSet 대조용). */
  private ids = new Float64Array(INITIAL_SLOTS);
  private cxs = new Float64Array(INITIAL_SLOTS);
  private cys = new Float64Array(INITIAL_SLOTS);
  /** slot → 셀 인덱스. NO_SLOT = 그리드 밖(제거됨). */
  private cellOfSlot = new Int32Array(INITIAL_SLOTS).fill(NO_SLOT);
  private prevInCell = new Int32Array(INITIAL_SLOTS);
  private nextInCell = new Int32Array(INITIAL_SLOTS);
  /** 제거 당시 recycle 세대. */
  private freedAt = new Float64Array(INITIAL_SLOTS);
  private listedPending = new Uint8Array(INITIAL_SLOTS);
  private slotHigh = 0;
  private readonly freeSlots: number[] = [];
  private readonly pendingSlots: number[] = [];
  private generation = 0;

  private readonly cellOfKey = new Map<number, number>();
  private keyOfCell = new Int32Array(INITIAL_CELLS);
  private heads = new Int32Array(INITIAL_CELLS);
  private tails = new Int32Array(INITIAL_CELLS);
  private sizes = new Int32Array(INITIAL_CELLS);
  /** 셀 내용이 마지막으로 바뀐 시각(versionClock) — 셀 할당·삽입·제거마다 새 값. InterestSet의 '창 불변' 판정용. */
  private versions = new Float64Array(INITIAL_CELLS);
  private versionClock = 0;
  private cellHigh = 0;
  private readonly freeCells: number[] = [];
  /** forEachInWindowOf 재진입 깊이별 창 셀 버퍼(방문 콜백이 다시 창을 돌아도 덮지 않게). */
  private readonly windowScratch: Int32Array[] = [];
  private windowDepth = 0;

  /** 새 entity 등록 또는 위치 갱신에 따른 셀 이동. 셀 변경 여부 반환. */
  upsert(entityId: EntityId, x: number, y: number): boolean {
    const cx = worldToCell(x);
    const cy = worldToCell(y);
    let s = this.slotOfId.get(entityId);
    if (s !== undefined && this.cellOfSlot[s]! !== NO_SLOT) {
      if (this.cxs[s] === cx && this.cys[s] === cy) return false;
      this.unlink(s);
    } else if (s === undefined) {
      s = this.allocSlot(entityId);
    }
    this.cxs[s] = cx;
    this.cys[s] = cy;
    this.link(s, cellKey(cx, cy));
    return true;
  }

  remove(entityId: EntityId): void {
    const s = this.slotOfId.get(entityId);
    if (s === undefined || this.cellOfSlot[s]! === NO_SLOT) return;
    this.unlink(s);
    this.freedAt[s] = this.generation;
    if (this.listedPending[s] === 0) {
      this.listedPending[s] = 1;
      this.pendingSlots.push(s);
    }
  }

  cellOf(entityId: EntityId): CellPos | undefined {
    const s = this.liveSlotOf(entityId);
    return s === NO_SLOT ? undefined : { cx: this.cxs[s]!, cy: this.cys[s]! };
  }

  /**
   * 중심 entity의 AOI 윈도우(3x3 셀)에 들어 있는 모든 entity Set 반환(호환·테스트 경로 — 핫패스는 InterestSet).
   * 자기 자신 포함.
   */
  windowOf(entityId: EntityId): Set<EntityId> {
    const s = this.liveSlotOf(entityId);
    if (s === NO_SLOT) return new Set();
    return this.windowAt(this.cxs[s]!, this.cys[s]!);
  }

  windowAt(cx: number, cy: number): Set<EntityId> {
    const out = new Set<EntityId>();
    this.forEachInWindowAt(cx, cy, (id) => out.add(id));
    return out;
  }

  /**
   * windowOf와 같은 원소를 같은 순서로 방문하되 Set을 만들지 않는다(viewersOf 핫패스).
   * 그리드에 없는 entity는 방문 0회. 방문 중 그리드를 바꾸면 안 된다.
   */
  forEachInWindowOf(entityId: EntityId, visit: (id: EntityId) => void): void {
    const s = this.liveSlotOf(entityId);
    if (s === NO_SLOT) return;
    this.forEachInWindowAt(this.cxs[s]!, this.cys[s]!, visit);
  }

  /**
   * 스냅샷 dispatch 직후 1회(Zone) — SLOT_REUSE_DELAY회 전에 제거된 slot을 재사용 목록으로 돌린다. 그사이 같은 id로
   * 되찾은 slot은 목록에서만 뺀다.
   */
  recycleSlots(): void {
    this.generation++;
    const list = this.pendingSlots;
    let keep = 0;
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      if (this.cellOfSlot[s]! !== NO_SLOT) {
        this.listedPending[s] = 0;
      } else if (this.generation - this.freedAt[s]! >= SLOT_REUSE_DELAY) {
        this.listedPending[s] = 0;
        this.slotOfId.delete(this.ids[s]!);
        this.freeSlots.push(s);
      } else {
        list[keep++] = s;
      }
    }
    list.length = keep;
  }

  // ── AOI 내부 표면(InterestSet·스냅샷) — 배열은 다음 upsert/remove 전까지만 유효(용량이 늘면 교체된다) ──

  /** recycleSlots 호출 수 — InterestSet이 diff 사이에 회수가 SLOT_REUSE_DELAY번 이상 있었는지(건너뛴 dispatch) 본다. */
  get recycleGeneration(): number {
    return this.generation;
  }

  /** slot 배열 용량 — slot 인덱스 배열(스탬프 등)을 이 크기로 맞춘다. */
  get slotCapacity(): number {
    return this.ids.length;
  }

  /** 그리드 안 entity의 slot, 없으면 NO_SLOT. */
  liveSlotOf(entityId: EntityId): number {
    const s = this.slotOfId.get(entityId);
    return s === undefined || this.cellOfSlot[s]! === NO_SLOT ? NO_SLOT : s;
  }

  /** slot이 지금 그 id로 그리드 안에 있나 — 캐시한 slot 검증용. */
  isLiveSlotOf(slot: number, entityId: EntityId): boolean {
    return slot >= 0 && slot < this.slotHigh && this.ids[slot] === entityId && this.cellOfSlot[slot]! !== NO_SLOT;
  }

  slotIds(): Float64Array {
    return this.ids;
  }

  cellHeads(): Int32Array {
    return this.heads;
  }

  cellSizes(): Int32Array {
    return this.sizes;
  }

  /** 셀별 변경 시각 — 같은 셀 인덱스·같은 값이면 그 사이 그 셀의 원소·순서가 그대로다(재할당된 셀도 새 값). */
  cellVersions(): Float64Array {
    return this.versions;
  }

  nextSlots(): Int32Array {
    return this.nextInCell;
  }

  /** slot 중심 창의 셀 인덱스를 순회 순서대로 out에 채우고 개수를 돌려준다(중복 키 제거). */
  windowCellsOfSlot(slot: number, out: Int32Array): number {
    return this.windowCells(this.cxs[slot]!, this.cys[slot]!, out);
  }

  private windowCells(cx: number, cy: number, out: Int32Array): number {
    let n = 0;
    for (let dy = -AOI_RADIUS; dy <= AOI_RADIUS; dy++) {
      for (let dx = -AOI_RADIUS; dx <= AOI_RADIUS; dx++) {
        const c = this.cellOfKey.get(cellKey(cx + dx, cy + dy));
        if (c === undefined || hasCell(out, n, c)) continue;
        out[n++] = c;
      }
    }
    return n;
  }

  private forEachInWindowAt(cx: number, cy: number, visit: (id: EntityId) => void): void {
    const depth = this.windowDepth++;
    try {
      let cells = this.windowScratch[depth];
      if (cells === undefined) {
        cells = new Int32Array(WINDOW_CELLS);
        this.windowScratch[depth] = cells;
      }
      const n = this.windowCells(cx, cy, cells);
      for (let k = 0; k < n; k++) {
        for (let s = this.heads[cells[k]!]!; s !== NO_SLOT; s = this.nextInCell[s]!) visit(this.ids[s]!);
      }
    } finally {
      this.windowDepth--;
    }
  }

  private allocSlot(entityId: EntityId): number {
    let s = this.freeSlots.pop();
    if (s === undefined) {
      if (this.slotHigh === this.ids.length) this.growSlots();
      s = this.slotHigh++;
    }
    this.ids[s] = entityId;
    this.slotOfId.set(entityId, s);
    return s;
  }

  /** 셀 키의 리스트 끝에 붙인다(셀이 없으면 만든다). */
  private link(s: number, key: number): void {
    let c = this.cellOfKey.get(key);
    if (c === undefined) c = this.allocCell(key);
    const t = this.tails[c]!;
    this.prevInCell[s] = t;
    this.nextInCell[s] = NO_SLOT;
    if (t === NO_SLOT) this.heads[c] = s;
    else this.nextInCell[t] = s;
    this.tails[c] = s;
    this.sizes[c]!++;
    this.versions[c] = ++this.versionClock;
    this.cellOfSlot[s] = c;
  }

  /** 셀 리스트에서 뺀다(순서 보존). 셀이 비면 반환한다. */
  private unlink(s: number): void {
    const c = this.cellOfSlot[s]!;
    const p = this.prevInCell[s]!;
    const n = this.nextInCell[s]!;
    if (p === NO_SLOT) this.heads[c] = n;
    else this.nextInCell[p] = n;
    if (n === NO_SLOT) this.tails[c] = p;
    else this.prevInCell[n] = p;
    this.cellOfSlot[s] = NO_SLOT;
    this.versions[c] = ++this.versionClock;
    if (--this.sizes[c]! === 0) {
      this.cellOfKey.delete(this.keyOfCell[c]!);
      this.freeCells.push(c);
    }
  }

  private allocCell(key: number): number {
    let c = this.freeCells.pop();
    if (c === undefined) {
      if (this.cellHigh === this.heads.length) this.growCells();
      c = this.cellHigh++;
    }
    this.keyOfCell[c] = key;
    this.heads[c] = NO_SLOT;
    this.tails[c] = NO_SLOT;
    this.sizes[c] = 0;
    this.versions[c] = ++this.versionClock;
    this.cellOfKey.set(key, c);
    return c;
  }

  private growSlots(): void {
    const cap = this.ids.length * 2;
    this.ids = grownF64(this.ids, cap);
    this.cxs = grownF64(this.cxs, cap);
    this.cys = grownF64(this.cys, cap);
    const cells = grownI32(this.cellOfSlot, cap);
    cells.fill(NO_SLOT, this.cellOfSlot.length);
    this.cellOfSlot = cells;
    this.prevInCell = grownI32(this.prevInCell, cap);
    this.nextInCell = grownI32(this.nextInCell, cap);
    this.freedAt = grownF64(this.freedAt, cap);
    const listed = new Uint8Array(cap);
    listed.set(this.listedPending);
    this.listedPending = listed;
  }

  private growCells(): void {
    const cap = this.heads.length * 2;
    this.keyOfCell = grownI32(this.keyOfCell, cap);
    this.heads = grownI32(this.heads, cap);
    this.tails = grownI32(this.tails, cap);
    this.sizes = grownI32(this.sizes, cap);
    this.versions = grownF64(this.versions, cap);
  }
}

function hasCell(cells: Int32Array, n: number, c: number): boolean {
  for (let i = 0; i < n; i++) if (cells[i] === c) return true;
  return false;
}
