// OpenHeap — (f, h, ci) 사전식 최소 힙 단위 테스트.

import { describe, expect, test } from "bun:test";
import { OpenHeap } from "../../../server/src/world/nav/openHeap";
import { mulberry32 } from "../../../tools/loadgen/rng";

type Key = [number, number, number];

function byKey(a: Key, b: Key): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

describe("OpenHeap", () => {
  test("빈 힙 pop은 -1, clear 후 크기 0", () => {
    const heap = new OpenHeap(1);
    expect(heap.pop()).toBe(-1);
    heap.push(5, 1, 7);
    expect(heap.size).toBe(1);
    heap.clear();
    expect(heap.size).toBe(0);
    expect(heap.pop()).toBe(-1);
  });

  test("f → h → ci 사전식 순서로 pop (용량 1에서 시작해 성장)", () => {
    const heap = new OpenHeap(1);
    const keys: Key[] = [
      [30, 10, 4], [20, 10, 9], [20, 4, 11], [20, 4, 2], [10, 10, 1], [30, 0, 0], [20, 10, 3],
    ];
    for (const [f, h, ci] of keys) heap.push(f, h, ci);
    const popped: number[] = [];
    while (heap.size > 0) popped.push(heap.pop());
    expect(popped).toEqual([...keys].sort(byKey).map((k) => k[2]));
  });

  test("무작위 push/pop 교차 — 매 pop이 남은 키의 최소", () => {
    const rng = mulberry32(0xbeef);
    const heap = new OpenHeap(4);
    const live: Key[] = [];
    let nextCi = 0;
    for (let step = 0; step < 5000; step++) {
      if (live.length === 0 || rng() < 0.6) {
        const key: Key = [Math.floor(rng() * 50), Math.floor(rng() * 20), nextCi++];
        live.push(key);
        heap.push(key[0], key[1], key[2]);
      } else {
        live.sort(byKey);
        const min = live.shift()!;
        expect(heap.pop()).toBe(min[2]);
      }
      expect(heap.size).toBe(live.length);
    }
  });
});
