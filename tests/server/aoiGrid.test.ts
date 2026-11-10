/**
 * Phase 4 AoiGrid 단위 테스트.
 */
import { describe, expect, test } from "bun:test";
import { AoiGrid, CELL_SIZE, worldToCell, cellKey } from "../../server/src/world/aoi/grid";

describe("AoiGrid", () => {
  test("worldToCell은 16-타일 단위로 floor", () => {
    expect(worldToCell(0)).toBe(0);
    expect(worldToCell(15.99)).toBe(0);
    expect(worldToCell(16)).toBe(1);
    expect(worldToCell(-1)).toBe(-1);
    expect(worldToCell(-16)).toBe(-1);
    expect(worldToCell(-17)).toBe(-2);
    expect(CELL_SIZE).toBe(16);
  });

  test("cellKey는 양수·음수 모두 안전하게 인코딩", () => {
    expect(cellKey(0, 0)).toBe(0);
    expect(cellKey(1, 0)).toBe(1);
    expect(cellKey(-1, -1) >>> 0).toBe(0xffffffff);
  });

  test("upsert: 같은 셀 재호출은 false, 셀 변경은 true", () => {
    const g = new AoiGrid();
    expect(g.upsert(1, 0, 0)).toBe(true);
    expect(g.upsert(1, 1, 1)).toBe(false); // 같은 셀(0,0)
    expect(g.upsert(1, 16, 0)).toBe(true); // (1,0)으로 이동
    expect(g.cellOf(1)).toEqual({ cx: 1, cy: 0 });
  });

  test("windowOf는 3x3 셀의 모든 entity 포함", () => {
    const g = new AoiGrid();
    g.upsert(1, 0, 0);     // 셀 (0,0) — 중심
    g.upsert(2, 16, 0);    // 셀 (1,0) — 우
    g.upsert(3, -16, 16);  // 셀 (-1,1) — 좌상
    g.upsert(4, 32, 32);   // 셀 (2,2) — 범위 밖

    const w = g.windowOf(1);
    expect(w.has(1)).toBe(true);
    expect(w.has(2)).toBe(true);
    expect(w.has(3)).toBe(true);
    expect(w.has(4)).toBe(false);
  });

  test("remove 후 windowOf는 자기 자신을 보지 않음", () => {
    const g = new AoiGrid();
    g.upsert(1, 0, 0);
    g.upsert(2, 0, 0);
    g.remove(1);
    expect(g.windowOf(1).size).toBe(0);
    const w = g.windowAt(0, 0);
    expect(w.has(2)).toBe(true);
    expect(w.has(1)).toBe(false);
  });
});

// 성능 3단계 슬라이스 2: viewersOf가 Set을 만들지 않고 창을 순회하는 경로. windowOf와 같은 원소·같은 순서여야 한다.
describe("AoiGrid.forEachInWindowOf", () => {
  function visited(g: AoiGrid, id: number): number[] {
    const out: number[] = [];
    g.forEachInWindowOf(id, (e) => out.push(e));
    return out;
  }

  test("그리드에 없는 entity는 방문 0회", () => {
    const g = new AoiGrid();
    g.upsert(1, 0, 0);
    expect(visited(g, 99)).toEqual([]);
    g.remove(1);
    expect(visited(g, 1)).toEqual([]);
  });

  test("무작위 배치·이동·제거(음수 셀 포함)에서 windowOf 순회 순서와 동일", () => {
    let s = 12345;
    const rnd = (): number => {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      return s / 4294967296;
    };
    for (let round = 0; round < 200; round++) {
      const g = new AoiGrid();
      for (let op = 0; op < 120; op++) {
        const id = 1 + Math.floor(rnd() * 40);
        if (rnd() < 0.85) g.upsert(id, (rnd() - 0.5) * 128, (rnd() - 0.5) * 128);
        else g.remove(id);
      }
      for (let id = 0; id <= 41; id++) expect(visited(g, id)).toEqual([...g.windowOf(id)]);
    }
  });
});
