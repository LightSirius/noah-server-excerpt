// 성능 3단계 슬라이스 7 — 데이터 지향 AOI(slot 연결 리스트 셀 + dense slot 스탬프 멤버십)가 종전 Set 구현과 같은지.
//
// 오라클: tests/server/helpers/legacyAoi.ts(바꾸기 전 AoiGrid·InterestSet 원본). 무작위 upsert/remove/재등록과 viewer별
// recompute(= 스냅샷 dispatch 1회, 뒤이어 recycleSlots)를 두 구현에 똑같이 주고 다음이 모두 같은지 대조한다:
//   upsert 반환값, cellOf, windowOf 순서, forEachInWindowOf 순서, viewer별 enter/leave/keep(순서까지), size.
// 좌표는 음수·셀 경계·NaN·±Infinity·-0·초대형(cx±1이 같은 값)·cellKey 16비트 wrap 충돌까지 섞는다.

import { describe, expect, test } from "bun:test";
import { AoiGrid } from "../../server/src/world/aoi/grid";
import { InterestSet } from "../../server/src/world/aoi/interestSet";
import { LegacyAoiGrid, LegacyInterestSet } from "./helpers/legacyAoi";

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
}

const ID_POOL: readonly number[] = [
  ...Array.from({ length: 24 }, (_, i) => 1 + i),
  ...Array.from({ length: 12 }, (_, i) => 1_000_000_000 + i),
  ...Array.from({ length: 4 }, (_, i) => 1_500_000_000 + i),
  ...Array.from({ length: 8 }, (_, i) => 2_000_000_000 + i),
];

/** 대부분 평범한 좌표(음수 포함), 가끔 이국적인 값. */
function coord(r: () => number): number {
  const k = r();
  if (k < 0.9) return (r() - 0.5) * 120;
  if (k < 0.92) return Number.NaN;
  if (k < 0.93) return r() < 0.5 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  if (k < 0.95) return -0;
  if (k < 0.97) return 2 ** 60 * (r() < 0.5 ? 1 : -1); // cx±1 == cx (부동소수 흡수)
  return 65536 * 16 + (r() - 0.5) * 40; // cellKey 16비트 wrap — 원점 근처 셀과 같은 키
}

function visitOrder(g: { forEachInWindowOf(id: number, v: (e: number) => void): void }, id: number): number[] {
  const out: number[] = [];
  g.forEachInWindowOf(id, (e) => out.push(e));
  return out;
}

function legacyVisitOrder(g: LegacyAoiGrid, id: number): number[] {
  return [...g.windowOf(id)];
}

interface Pair {
  next: InterestSet;
  old: LegacyInterestSet;
}

interface World {
  g: AoiGrid;
  o: LegacyAoiGrid;
  viewers: Map<number, Pair>;
}

/** 무작위 변이 1회. 반환: 제거 직후 같은 id 재등록이었나. */
function mutateOnce(w: World, r: () => number, pickId: () => number): boolean {
  const id = pickId();
  const k = r();
  if (k < 0.75) {
    const x = coord(r);
    const y = coord(r);
    expect(w.g.upsert(id, x, y)).toBe(w.o.upsert(id, x, y));
  } else if (k < 0.92) {
    w.g.remove(id);
    w.o.remove(id);
  } else if (k < 0.96) {
    // 제거 직후 같은 id 재등록(다음 dispatch 전) — 종전 Set 의미로는 keep.
    w.g.remove(id);
    w.o.remove(id);
    const x = coord(r);
    const y = coord(r);
    expect(w.g.upsert(id, x, y)).toBe(w.o.upsert(id, x, y));
    return true;
  } else if (!w.viewers.has(id)) {
    w.viewers.set(id, { next: new InterestSet(id), old: new LegacyInterestSet(id) });
  } else {
    w.viewers.delete(id);
  }
  return false;
}

function dispatchAndCompare(w: World, skip: (id: number) => boolean): number {
  let compared = 0;
  for (const [id, p] of w.viewers) {
    if (skip(id)) continue;
    expect(p.next.recompute(w.g)).toEqual(p.old.recompute(w.o));
    expect(p.next.size()).toBe(p.old.size());
    compared++;
  }
  w.g.recycleSlots();
  return compared;
}

function compareQueries(w: World): void {
  for (const id of ID_POOL) {
    expect(w.g.cellOf(id)).toEqual(w.o.cellOf(id));
    expect([...w.g.windowOf(id)]).toEqual([...w.o.windowOf(id)]);
    expect(visitOrder(w.g, id)).toEqual(legacyVisitOrder(w.o, id));
  }
  expect([...w.g.windowAt(0, 0)]).toEqual([...w.o.windowAt(0, 0)]);
}

describe("AoiGrid — 종전 Set 구현 등가(오라클)", () => {
  test("무작위 120 라운드 × 60 dispatch: upsert·cellOf·windowOf·순회 순서·viewer diff 동일", () => {
    let diffs = 0;
    let reAdds = 0;
    for (let round = 0; round < 120; round++) {
      const r = lcg(1000 + round);
      const pickId = (): number => ID_POOL[Math.floor(r() * ID_POOL.length)]!;
      const w: World = { g: new AoiGrid(), o: new LegacyAoiGrid(), viewers: new Map() };
      for (let i = 0; i < 6; i++) {
        const id = ID_POOL[i * 3]!;
        w.viewers.set(id, { next: new InterestSet(id), old: new LegacyInterestSet(id) });
      }
      for (let d = 0; d < 60; d++) {
        const ops = 1 + Math.floor(r() * 12);
        for (let i = 0; i < ops; i++) if (mutateOnce(w, r, pickId)) reAdds++;
        diffs += dispatchAndCompare(w, () => false);
        if (d % 10 === 9) compareQueries(w);
      }
      compareQueries(w);
    }
    expect(diffs).toBeGreaterThan(30_000);
    expect(reAdds).toBeGreaterThan(1_500);
  });

  test("dispatch를 건너뛰는 viewer — 제거된 id를 다시 쓰지 않으면(몬스터·지면 아이템 대역) 여전히 동일", () => {
    // slot이 재사용돼도(다른 id) viewer의 이전 목록이 그 slot을 새 entity로 오인하지 않아야 한다.
    for (let round = 0; round < 60; round++) {
      const r = lcg(9000 + round);
      let nextId = 1_000_000_000;
      const live: number[] = [];
      const w: World = { g: new AoiGrid(), o: new LegacyAoiGrid(), viewers: new Map() };
      for (let v = 1; v <= 4; v++) {
        const x = (r() - 0.5) * 40;
        const y = (r() - 0.5) * 40;
        w.g.upsert(v, x, y);
        w.o.upsert(v, x, y);
        w.viewers.set(v, { next: new InterestSet(v), old: new LegacyInterestSet(v) });
      }
      for (let d = 0; d < 80; d++) {
        for (let i = 0; i < 6; i++) {
          if (live.length > 0 && r() < 0.4) {
            const at = Math.floor(r() * live.length);
            const id = live[at]!;
            live.splice(at, 1);
            w.g.remove(id);
            w.o.remove(id);
          } else {
            const id = nextId++;
            live.push(id);
            const x = (r() - 0.5) * 60;
            const y = (r() - 0.5) * 60;
            expect(w.g.upsert(id, x, y)).toBe(w.o.upsert(id, x, y));
          }
        }
        dispatchAndCompare(w, () => r() < 0.5);
      }
    }
  });

  test("dispatch를 건너뛰는 viewer + 같은 id 재사용(재접속 대역) — slot이 회수돼 같은 id가 다른 slot으로 돌아와도 동일", () => {
    // 3단계 리뷰: 건너뛴 viewer의 직전 목록에 (옛 slot, id)가 남은 채 id가 새 slot으로 돌아오면 SPAWN 뒤 DESPAWN이
    // 나가 클라에서 보이는 엔티티가 사라졌다(종전 Set 구현은 keep). buildAndSend 예외로 dispatch가 중간에 끊긴 뒤에만 생긴다.
    let diffs = 0;
    for (let round = 0; round < 80; round++) {
      const r = lcg(5000 + round);
      const pickId = (): number => ID_POOL[Math.floor(r() * ID_POOL.length)]!;
      const w: World = { g: new AoiGrid(), o: new LegacyAoiGrid(), viewers: new Map() };
      for (let i = 0; i < 6; i++) {
        const id = ID_POOL[i * 3]!;
        w.viewers.set(id, { next: new InterestSet(id), old: new LegacyInterestSet(id) });
      }
      for (let d = 0; d < 60; d++) {
        const ops = 1 + Math.floor(r() * 12);
        for (let i = 0; i < ops; i++) mutateOnce(w, r, pickId);
        diffs += dispatchAndCompare(w, () => r() < 0.5);
      }
    }
    expect(diffs).toBeGreaterThan(10_000);
  });
});

describe("AoiGrid — 순서·재등록 규약", () => {
  test("셀을 떠났다 돌아오면 그 셀 순서의 끝, 같은 셀 upsert는 no-op", () => {
    const g = new AoiGrid();
    g.upsert(1, 1, 1);
    g.upsert(2, 2, 2);
    g.upsert(3, 3, 3);
    expect(g.upsert(1, 4, 4)).toBe(false);
    expect([...g.windowAt(0, 0)]).toEqual([1, 2, 3]);
    g.upsert(1, 40, 40);
    g.upsert(1, 5, 5);
    expect([...g.windowAt(0, 0)]).toEqual([2, 3, 1]);
  });

  test("제거 후 같은 dispatch 사이 재등록은 keep(enter/leave 없음), recycle 뒤 재등록은 enter", () => {
    const g = new AoiGrid();
    const v = new InterestSet(1);
    g.upsert(1, 0, 0);
    g.upsert(7, 1, 1);
    expect(v.recompute(g)).toEqual({ enter: [1, 7], leave: [], keep: [] });
    g.recycleSlots();
    g.remove(7);
    g.upsert(7, 2, 2);
    expect(v.recompute(g)).toEqual({ enter: [], leave: [], keep: [1, 7] });
    g.recycleSlots();
    g.remove(7);
    expect(v.recompute(g)).toEqual({ enter: [], leave: [7], keep: [1] });
    g.recycleSlots();
    g.recycleSlots();
    g.upsert(8, 3, 3); // 7의 slot을 받을 수 있다 — 8은 새 entity
    g.upsert(7, 4, 4);
    expect(v.recompute(g)).toEqual({ enter: [8, 7], leave: [], keep: [1] });
  });

  test("dispatch를 건너뛴 viewer — slot 회수 뒤 같은 id가 다른 slot으로 돌아와도 keep(SPAWN·DESPAWN 쌍 없음)", () => {
    const g = new AoiGrid();
    const v = new InterestSet(1);
    g.upsert(1, 0, 0);
    g.upsert(7, 1, 1);
    g.upsert(8, 2, 2);
    expect(v.recompute(g)).toEqual({ enter: [1, 7, 8], leave: [], keep: [] });
    // v가 dispatch 2회를 건너뛰는 동안 7·8 제거 → 회수(재사용 목록 끝 = 8의 slot) → 7 재등록은 8의 slot을 받는다.
    g.remove(7);
    g.remove(8);
    g.recycleSlots();
    g.recycleSlots();
    g.upsert(7, 3, 3);
    expect(v.recompute(g)).toEqual({ enter: [], leave: [8], keep: [1, 7] });
  });

  test("slot 재사용 지연 — 제거된 slot은 recycleSlots 2회 뒤에야 다른 id가 받는다", () => {
    const g = new AoiGrid();
    g.upsert(1, 0, 0);
    g.upsert(2, 1, 1);
    const cap = g.slotCapacity;
    g.remove(2);
    g.recycleSlots();
    g.upsert(3, 2, 2); // 아직 2의 slot을 받으면 안 된다 — 새 slot
    g.recycleSlots();
    g.upsert(4, 3, 3); // 이제 2의 slot을 재사용
    const ids = g.slotIds();
    expect(ids[0]).toBe(1);
    expect(ids[1]).toBe(4);
    expect(ids[2]).toBe(3);
    expect(g.slotCapacity).toBe(cap);
  });

  test("drain은 현재 목록을 돌려주고 비운다", () => {
    const g = new AoiGrid();
    const v = new InterestSet(1);
    g.upsert(1, 0, 0);
    g.upsert(2, 20, 0);
    v.recompute(g);
    expect(v.size()).toBe(2);
    expect(v.drain()).toEqual([1, 2]);
    expect(v.size()).toBe(0);
    expect(v.recompute(g)).toEqual({ enter: [1, 2], leave: [], keep: [] });
  });

  test("수천 entity 생성·제거 반복에도 slot은 재사용된다(용량이 생존 수에 비례)", () => {
    const g = new AoiGrid();
    let id = 1_000_000_000;
    for (let round = 0; round < 200; round++) {
      const batch: number[] = [];
      for (let i = 0; i < 50; i++) {
        batch.push(id);
        g.upsert(id++, (i % 10) * 3, Math.floor(i / 10) * 3);
      }
      for (const b of batch) g.remove(b);
      g.recycleSlots();
    }
    expect(g.slotCapacity).toBeLessThanOrEqual(256);
  });
});
