// Phase 4 InterestSet — 플레이어별 AOI 차분. 성능 3단계 슬라이스 7: dense slot 스탬프 멤버십.
//
// 매 tick: 플레이어 entity의 AOI 윈도우 entity들을 이전 윈도우와 비교해
// enter / leave / keep 3집합으로 분류.
// SnapshotBuilder가 이를 SC_SPAWN / SC_DESPAWN / SC_SNAPSHOT_DELTA로 변환.
//
// 순서 계약(종전 Set 구현과 같다 — tests/server/aoiDataOrientedEquivalence): enter·keep은 새 창 순서, leave는 직전 창
// 순서. 직전 창은 (slot, id) 배열로 들고, 포함 판정은 그리드 slot 인덱스의 스탬프 배열(diff마다 새 epoch 2개)로 한다 —
// Set 생성·해시 조회가 없다. slot마다 id·생존을 대조하므로 slot이 다른 entity에 재사용됐어도(그리드의 지연을 못 지킨
// 호출자·dispatch를 건너뛴 viewer) 새 entity를 keep으로 오인하지 않고, 같은 id가 다른 slot으로 돌아왔으면 keep으로 본다.
// 창 불변 지름길: 직전 diff의 창 셀(인덱스·변경 시각 grid.cellVersions)이 그대로면 그 사이 창의 원소·순서가 같다 —
// enter/leave 없이 직전 창 목록이 곧 keep이다(밀집 배치에서 셀 경계를 넘는 이동이 없을 때 diff가 O(셀 수)).

import type { EntityId } from "../entityTable";
import { NO_SLOT, SLOT_REUSE_DELAY, WINDOW_CELLS, type AoiGrid } from "./grid";

export interface AoiDiff {
  /** 처음 보이게 된 entity ids. SC_SPAWN 송신. */
  readonly enter: EntityId[];
  /** 시야에서 사라진 entity ids. SC_DESPAWN 송신. */
  readonly leave: EntityId[];
  /** 계속 보이는 entity ids. SC_SNAPSHOT_DELTA의 updates 후보. */
  readonly keep: EntityId[];
}

const INITIAL = 64;

function capacityFor(need: number, have: number): number {
  let cap = Math.max(have, INITIAL);
  while (cap < need) cap *= 2;
  return cap;
}

/**
 * diff 1회의 결과·작업 버퍼(존당 1개 재사용 — 스냅샷 dispatch 안에서만 쓴다). enter·keep은 그리드 slot(id는
 * grid.slotIds()로), leave는 entity id. 다음 diffInto 전까지만 유효.
 */
export class AoiDiffScratch {
  enter = new Int32Array(INITIAL);
  enterCount = 0;
  /** keep 읽기 뷰 — keepBuf이거나(전체 diff) InterestSet의 직전 창 목록(창 불변). 읽기 전용. */
  keep: Int32Array = new Int32Array(INITIAL);
  keepCount = 0;
  keepBuf = new Int32Array(INITIAL);
  leave = new Float64Array(INITIAL);
  leaveCount = 0;
  /** viewer 본인 slot(그리드 밖이면 NO_SLOT)과 이번에 enter였는지(E-2 self 보강 조건). */
  selfSlot = NO_SLOT;
  selfEntered = false;

  /** slot 스탬프 — 직전 창 표시(e1)·새 창 표시(e2). */
  mark = new Float64Array(INITIAL);
  epoch = 0;
  readonly cells = new Int32Array(WINDOW_CELLS);
  /** 새 창을 쌓는 버퍼 — diff 끝에 InterestSet의 직전 창 버퍼와 맞바꾼다(복사 없음). */
  nextSlots = new Int32Array(INITIAL);
  nextIds = new Float64Array(INITIAL);

  /** diff 시작 — 카운트를 비우고 스탬프 배열을 그리드 slot 용량에 맞춘다. 새 epoch 쌍의 첫 값을 돌려준다. */
  begin(slotCapacity: number): number {
    this.enterCount = 0;
    this.keepCount = 0;
    this.leaveCount = 0;
    if (this.mark.length < slotCapacity) this.mark = new Float64Array(capacityFor(slotCapacity, this.mark.length));
    this.epoch += 2;
    return this.epoch - 1;
  }

  /** 새 창 크기만큼 enter·keep·새 창 버퍼를 확보한다. */
  reserveWindow(n: number): void {
    if (this.nextSlots.length < n) {
      const cap = capacityFor(n, this.nextSlots.length);
      this.nextSlots = new Int32Array(cap);
      this.nextIds = new Float64Array(cap);
    }
    if (this.enter.length < n) this.enter = new Int32Array(capacityFor(n, this.enter.length));
    if (this.keepBuf.length < n) this.keepBuf = new Int32Array(capacityFor(n, this.keepBuf.length));
  }

  /** 창 불변 — enter/leave 없음, keep = 직전 창 목록(뷰), 본인은 keep. */
  setUnchanged(self: number, list: Int32Array, count: number): void {
    this.enterCount = 0;
    this.leaveCount = 0;
    this.keep = list;
    this.keepCount = count;
    this.selfSlot = self;
    this.selfEntered = false;
  }

  reserveLeave(n: number): void {
    if (this.leave.length < n) this.leave = new Float64Array(capacityFor(n, this.leave.length));
  }
}

/**
 * 플레이어 entity 1명의 AOI 상태를 보존하고 매 tick diff 반환.
 * Zone당 플레이어별 1개 인스턴스.
 */
export class InterestSet {
  /** 직전 창(창 순서) — slot과 그 당시 id. */
  private slots = new Int32Array(INITIAL);
  private ids = new Float64Array(INITIAL);
  private count = 0;
  /** 본인 slot 캐시 — 쓰기 전 grid.isLiveSlotOf로 검증한다. */
  private selfSlot = NO_SLOT;
  /** 직전 창의 셀 인덱스·변경 시각(창 불변 판정). winN < 0 = 기록 없음. */
  private readonly winCells = new Int32Array(WINDOW_CELLS);
  private readonly winVersions = new Float64Array(WINDOW_CELLS);
  private winN = -1;
  /** 직전 diff 시점의 grid.recycleGeneration — 그 뒤 회수가 SLOT_REUSE_DELAY번 이상이면 목록 slot을 검증한다. */
  private diffGen = Number.NEGATIVE_INFINITY;

  constructor(public readonly viewerEntityId: EntityId) {}

  /** 그리드 창과 직전 창을 비교해 out에 채우고, 내부 상태를 새 창으로 바꾼다(핫패스 — 할당 없음). */
  diffInto(grid: AoiGrid, out: AoiDiffScratch): void {
    const self = this.resolveSelf(grid);
    const nc = self === NO_SLOT ? 0 : grid.windowCellsOfSlot(self, out.cells);
    if (self !== NO_SLOT && this.windowUnchanged(grid, out.cells, nc)) {
      out.setUnchanged(self, this.slots, this.count);
      this.diffGen = grid.recycleGeneration;
      return;
    }
    const prevMark = out.begin(grid.slotCapacity);
    const curMark = prevMark + 1;
    this.markPrevious(grid, out.mark, prevMark);
    out.selfSlot = self;
    out.selfEntered = self !== NO_SLOT && out.mark[self] !== prevMark;
    const n = self === NO_SLOT ? 0 : collectWindow(grid, out, nc, prevMark, curMark);
    this.collectLeaves(grid, out, curMark);
    this.adopt(out, n);
    this.rememberWindow(grid, out.cells, self === NO_SLOT ? -1 : nc);
    this.diffGen = grid.recycleGeneration;
  }

  /** 호환·테스트 경로 — 결과를 id 배열로(호출마다 새 작업 버퍼). */
  recompute(grid: AoiGrid): AoiDiff {
    const d = new AoiDiffScratch();
    this.diffInto(grid, d);
    const gids = grid.slotIds();
    return {
      enter: Array.from(d.enter.subarray(0, d.enterCount), (s) => gids[s]!),
      leave: Array.from(d.leave.subarray(0, d.leaveCount)),
      keep: Array.from(d.keep.subarray(0, d.keepCount), (s) => gids[s]!),
    };
  }

  /** 연결 종료 시 현재 보고 있던 entity 목록 반환 — 후속 정리에 사용. */
  drain(): EntityId[] {
    const out = Array.from(this.ids.subarray(0, this.count));
    this.count = 0;
    this.winN = -1;
    return out;
  }

  size(): number {
    return this.count;
  }

  /**
   * 직전 창 slot에 e1 — slot이 아직 그 id의 것일 때만(재사용된 slot은 표시하지 않는다). 직전 diff 뒤 회수가
   * SLOT_REUSE_DELAY번 이상이었으면(dispatch를 건너뛴 viewer — buildAndSend 예외 뒤) 검증 경로로 간다. 매 dispatch diff하는
   * 정상 경로에서는 목록의 id가 다른 slot에 있을 수 없다(같은 id는 회수 전에 같은 slot을 되찾는다).
   */
  private markPrevious(grid: AoiGrid, mark: Float64Array, e1: number): void {
    if (grid.recycleGeneration - this.diffGen >= SLOT_REUSE_DELAY) {
      this.markPreviousRepairing(grid, mark, e1);
      return;
    }
    const gids = grid.slotIds();
    const slots = this.slots;
    const ids = this.ids;
    for (let i = 0; i < this.count; i++) {
      const s = slots[i]!;
      if (gids[s] === ids[i]) mark[s] = e1;
    }
  }

  /**
   * 건너뛴 dispatch 뒤의 markPrevious — slot이 그 id로 살아 있지 않으면 id의 현재 slot으로 고쳐 적는다. 회수 뒤 같은 id가
   * 다른 slot으로 돌아왔으면 keep이어야 한다(종전 Set 의미 — 3단계 리뷰: 고치지 않으면 SPAWN 뒤 DESPAWN이 나가 클라에서
   * 보이는 엔티티가 사라졌다). 그리드 밖이면 표시하지 않는다(→ leave).
   */
  private markPreviousRepairing(grid: AoiGrid, mark: Float64Array, e1: number): void {
    const slots = this.slots;
    const ids = this.ids;
    for (let i = 0; i < this.count; i++) {
      let s = slots[i]!;
      if (!grid.isLiveSlotOf(s, ids[i]!)) {
        s = grid.liveSlotOf(ids[i]!);
        if (s === NO_SLOT) continue;
        slots[i] = s;
      }
      mark[s] = e1;
    }
  }

  /** 새 창 표시(e2)가 없거나 slot 주인이 바뀐 직전 원소 = leave(직전 창 순서). */
  private collectLeaves(grid: AoiGrid, out: AoiDiffScratch, e2: number): void {
    out.reserveLeave(this.count);
    const gids = grid.slotIds();
    const mark = out.mark;
    const leave = out.leave;
    let lc = 0;
    for (let i = 0; i < this.count; i++) {
      const s = this.slots[i]!;
      const id = this.ids[i]!;
      if (mark[s] !== e2 || gids[s] !== id) leave[lc++] = id;
    }
    out.leaveCount = lc;
  }

  private windowUnchanged(grid: AoiGrid, cells: Int32Array, nc: number): boolean {
    if (nc !== this.winN) return false;
    const versions = grid.cellVersions();
    for (let k = 0; k < nc; k++) {
      const c = cells[k]!;
      if (c !== this.winCells[k] || versions[c] !== this.winVersions[k]) return false;
    }
    return true;
  }

  /** 전체 diff 직후 창 셀을 기록한다(nc < 0 = 본인이 그리드 밖 — 기록 없음). */
  private rememberWindow(grid: AoiGrid, cells: Int32Array, nc: number): void {
    this.winN = nc;
    const versions = grid.cellVersions();
    for (let k = 0; k < nc; k++) {
      const c = cells[k]!;
      this.winCells[k] = c;
      this.winVersions[k] = versions[c]!;
    }
  }

  private resolveSelf(grid: AoiGrid): number {
    if (!grid.isLiveSlotOf(this.selfSlot, this.viewerEntityId)) this.selfSlot = grid.liveSlotOf(this.viewerEntityId);
    return this.selfSlot;
  }

  /** 새 창 버퍼를 직전 창으로 삼고, 쓰던 버퍼는 작업 버퍼로 돌려준다. */
  private adopt(out: AoiDiffScratch, n: number): void {
    const slots = this.slots;
    const ids = this.ids;
    this.slots = out.nextSlots;
    this.ids = out.nextIds;
    out.nextSlots = slots;
    out.nextIds = ids;
    this.count = n;
  }
}

/** 창 셀(out.cells 앞 nc개)을 순회 순서로 새 창 버퍼에 쌓으며 enter/keep을 가른다. 새 창 크기를 돌려준다. */
function collectWindow(grid: AoiGrid, out: AoiDiffScratch, nc: number, e1: number, e2: number): number {
  const cells = out.cells;
  const sizes = grid.cellSizes();
  let total = 0;
  for (let k = 0; k < nc; k++) total += sizes[cells[k]!]!;
  out.reserveWindow(total);
  const heads = grid.cellHeads();
  const nexts = grid.nextSlots();
  const gids = grid.slotIds();
  const mark = out.mark;
  const ns = out.nextSlots;
  const ni = out.nextIds;
  const enter = out.enter;
  const keep = out.keepBuf;
  let n = 0;
  let ec = 0;
  let kc = 0;
  for (let k = 0; k < nc; k++) {
    for (let s = heads[cells[k]!]!; s !== NO_SLOT; s = nexts[s]!) {
      ns[n] = s;
      ni[n] = gids[s]!;
      n++;
      if (mark[s] === e1) keep[kc++] = s;
      else enter[ec++] = s;
      mark[s] = e2;
    }
  }
  out.enterCount = ec;
  out.keep = keep;
  out.keepCount = kc;
  return n;
}
