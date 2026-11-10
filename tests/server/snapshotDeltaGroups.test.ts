// 성능 4.5 F3 — SNAPSHOT_DELTA 묶음(sim/deltaGroups.ts): 같은 입력(keep 열·self)을 가진 viewer는 앞선 viewer의 프레임을 공유하고 ackSeq만
// 수신자마다 패치한다(writeEntries를 묶음당 1회). 바이트는 묶지 않은 빠른 경로와 비트 단위로 같아야 한다.
//
// 두 세계에 같은 무작위 조작을 준다:
//   F: 빠른 경로(SPAWN/DESPAWN 프레임 캐시 + DELTA 재사용 버퍼 — deltaFrames, 묶음 없음 = 종전 운영)
//   G: 같은 경로 + 묶음(deltaShared — 받은 프레임을 복사하고 patchOff에 ackSeq)
// viewer를 몇 개 셀에 몰아(같은 셀 체류 = 같은 keep) 묶음이 실제로 많이 생기게 하고, 셀 경계 왕복·enter/leave·본인 enter(self 보강)·
// 사망(diedThisTick)·위치 삭제·그리드 제거와 같은 id 재등록(slot 재사용)·viewer 입퇴장·ackSeq 변화·움직임 없는 tick(count 0)을 섞는다.

import { describe, expect, test } from "bun:test";
import { AoiGrid } from "../../server/src/world/aoi/grid";
import { InterestSet } from "../../server/src/world/aoi/interestSet";
import { EntityTable } from "../../server/src/world/entityTable";
import {
  buildAndSend,
  SnapshotFrames,
  SnapshotScratch,
  type EntityMeta,
  type SnapshotSinks,
  type ViewerContext,
} from "../../server/src/sim/snapshotBuilder";
import { DeltaGroups } from "../../server/src/sim/deltaGroups";
import { DELTA_ACK_OFFSET, FRAME_HEADER_BYTES } from "../../server/src/net/wireFrame";
import { DeltaCache } from "../../server/src/sim/snapshotDelta";
import type { SharedFrame } from "../../server/src/net/sharedFrame";
import { writePacket } from "../../server/src/network/packetWriter";

const META: EntityMeta = { name: "", level: 0, hp: 0, hpMax: 0 };
const VIEWERS = 24;
const ENTITIES = 70;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
}

/** 묶음 세계 종류 — all: 모든 viewer 묶음(하한 0), oneBucket: 하한 0 + 한 버킷(해시 충돌 대역), prod: 운영 하한(짧은 keep은 종전 경로). */
type GroupMode = "all" | "oneBucket" | "prod";

class World {
  readonly table = new EntityTable();
  readonly grid = new AoiGrid();
  readonly viewers = new Map<number, ViewerContext & { ackSeq: number }>();
  readonly scratch: SnapshotScratch;
  constructor(mode: GroupMode = "all") {
    if (mode === "prod") this.scratch = new SnapshotScratch();
    else this.scratch = new SnapshotScratch(new DeltaGroups(mode === "oneBucket" ? 0 : -1, 0));
  }
}

interface Capture {
  bytes: Map<number, Buffer[]>;
  /** G만 — 이번 dispatch에 받은 공유 프레임 호출 수와 서로 다른 프레임 수. */
  sharedCalls: number;
  distinct: Set<SharedFrame>;
}

function push(c: Capture, pid: number, frame: Buffer): void {
  const list = c.bytes.get(pid);
  if (list) list.push(frame);
  else c.bytes.set(pid, [frame]);
}

function hex(c: Capture): [number, string][] {
  return [...c.bytes.keys()].sort((a, b) => a - b).map((pid) => [pid, Buffer.concat(c.bytes.get(pid)!).toString("hex")]);
}

function newCapture(): Capture {
  return { bytes: new Map(), sharedCalls: 0, distinct: new Set() };
}

/** grouped: deltaShared(받은 프레임을 복사하고 patchOff에 ackSeq). withFrames: deltaFrames도 함께(운영 zoneRegistry 조합 — 짧은 keep은 그쪽으로). */
function sinks(grouped: boolean, cap: Capture, withFrames = !grouped): SnapshotSinks {
  const send = (pid: number, packetId: number, payload: object): void => push(cap, pid, writePacket(packetId, payload));
  const frames = new SnapshotFrames({
    encode: (packetId, payload) => writePacket(packetId, payload),
    sendFrame: (pid, _id, frame) => push(cap, pid, frame),
  });
  const deltaFrames = { sendDeltaFrame: (pid: number, frame: Buffer) => push(cap, pid, Buffer.from(frame)) };
  const deltaShared = {
    sendDeltaShared: (pid: number, frame: SharedFrame, ackSeq: number) => {
      cap.sharedCalls++;
      cap.distinct.add(frame);
      const out = Buffer.from(frame.bytes);
      out.writeUInt32LE(ackSeq >>> 0, frame.patchOff);
      push(cap, pid, out);
    },
  };
  return {
    send,
    frames,
    ...(withFrames ? { deltaFrames } : {}),
    ...(grouped ? { deltaShared } : {}),
  };
}

function dispatch(w: World, tick: number, moved: Set<number>, died: Set<number>, s: SnapshotSinks): void {
  buildAndSend(
    {
      tickIndex: tick,
      table: w.table,
      grid: w.grid,
      viewers: w.viewers.values(),
      typeOf: () => "monster",
      metaOf: () => META,
      movedThisTick: moved,
      diedThisTick: died,
    },
    s,
    w.scratch,
  );
  w.grid.recycleSlots();
}

/** 몇 개 셀(16타일)에 몰린 좌표 — 대부분 셀 안의 작은 이동, 가끔 이웃 셀로. */
function clusteredCoord(r: () => number): number {
  const cell = Math.floor(r() * 3);
  return cell * 16 + 1 + r() * 14;
}

function place(ws: World[], id: number, x: number, y: number): void {
  for (const w of ws) {
    const p = w.table.positions.get(id);
    if (p) {
      p.x = x;
      p.y = y;
    } else w.table.positions.set(id, { x, y });
    w.grid.upsert(id, x, y);
  }
}

function mutate(ws: World[], r: () => number, moved: Set<number>): void {
  const id = 1 + Math.floor(r() * ENTITIES);
  const k = r();
  if (k < 0.7) {
    const p = ws[0]!.table.positions.get(id);
    const nudge = p !== undefined && r() < 0.8;
    const x = nudge ? p.x + (r() - 0.5) * 2 : clusteredCoord(r);
    const y = nudge ? p.y + (r() - 0.5) * 2 : clusteredCoord(r);
    place(ws, id, x, y);
    moved.add(id);
  } else if (k < 0.8) {
    for (const w of ws) w.grid.remove(id);
    if (r() < 0.5) for (const w of ws) w.table.positions.delete(id);
  } else if (k < 0.85) {
    for (const w of ws) w.table.positions.delete(id);
  } else if (k < 0.95) {
    toggleViewer(ws, 1 + Math.floor(r() * VIEWERS));
  } else {
    for (const w of ws) w.grid.remove(id);
    place(ws, id, clusteredCoord(r), clusteredCoord(r));
    moved.add(id);
  }
}

function toggleViewer(ws: World[], vid: number): void {
  for (const w of ws) {
    if (w.viewers.has(vid)) w.viewers.delete(vid);
    else w.viewers.set(vid, { playerId: vid * 10, viewerEntityId: vid, ackSeq: 0, interest: new InterestSet(vid) });
  }
}

describe("SNAPSHOT_DELTA 묶음 — 묶지 않은 빠른 경로와 바이트 동일", () => {
  test("무작위 40 라운드 × 60 tick: viewer별 바이트 동일(버킷 해시·한 버킷 둘 다), 묶음 재사용이 실제로 많다", () => {
    let reused = 0;
    let deltas = 0;
    for (let round = 0; round < 40; round++) {
      const r = lcg(0xf3 + round);
      const f = new World();
      const g = new World();
      const one = new World("oneBucket");
      const prod = new World("prod");
      const ws = [f, g, one, prod];
      for (let id = 1; id <= ENTITIES; id++) place(ws, id, clusteredCoord(r), clusteredCoord(r));
      for (let vid = 1; vid <= VIEWERS; vid++) if (r() < 0.8) toggleViewer(ws, vid);
      for (let tick = 0; tick < 60; tick++) {
        const moved = new Set<number>();
        const ops = tick % 7 === 3 ? 0 : 1 + Math.floor(r() * 12); // 가끔 아무도 안 움직이는 tick(count 0 묶음).
        for (let i = 0; i < ops; i++) mutate(ws, r, moved);
        const died = new Set<number>();
        for (const id of moved) if (r() < 0.05) died.add(id);
        for (const id of [...moved]) if (r() < 0.1) moved.delete(id);
        const base = Math.floor(r() * 0xffffffff);
        for (const w of ws) for (const [vid, v] of w.viewers) v.ackSeq = (base + vid * 7919) % 0x100000000;
        const cf = newCapture();
        const cg = newCapture();
        const co = newCapture();
        dispatch(f, tick, moved, died, sinks(false, cf));
        dispatch(g, tick, moved, died, sinks(true, cg));
        dispatch(one, tick, moved, died, sinks(true, co));
        const cp = newCapture();
        dispatch(prod, tick, moved, died, sinks(true, cp, true));
        expect(hex(cp)).toEqual(hex(cf));
        expect(hex(cg)).toEqual(hex(cf));
        expect(hex(co)).toEqual(hex(cf));
        expect(co.distinct.size).toBe(cg.distinct.size);
        reused += cg.sharedCalls - cg.distinct.size;
        deltas += cg.sharedCalls;
      }
    }
    expect(deltas).toBeGreaterThan(5_000);
    expect(reused).toBeGreaterThan(deltas / 3);
  });

  test.each([false, true])("새로 들어온 viewer(keep 0) — self 보강 여부·self slot이 다르면 공유하지 않는다(한 버킷 %p)", (oneBucket) => {
    const f = new World();
    const g = new World(oneBucket ? "oneBucket" : "all");
    const ws = [f, g];
    for (let id = 1; id <= 6; id++) place(ws, id, 4 + id, 4);
    // 같은 셀에 viewer 1~4가 이번 tick에 처음 들어온다 — 전원 enter(keep 0). 1·2는 움직여 끝에 self 1회(서로 다른 slot), 3·4는 안 움직여
    // 보낼 DELTA가 없다. 같은 keep(빈 열)이라도 self가 다르면 다른 프레임이어야 한다.
    for (const vid of [1, 2, 3, 4]) toggleViewer(ws, vid);
    for (const w of ws) for (const v of w.viewers.values()) v.ackSeq = 100 + v.viewerEntityId;
    const moved = new Set([1, 2, 5]);
    const cf = newCapture();
    const cg = newCapture();
    dispatch(f, 0, moved, new Set(), sinks(false, cf));
    dispatch(g, 0, moved, new Set(), sinks(true, cg));
    expect(hex(cg)).toEqual(hex(cf));
    expect([cg.sharedCalls, cg.distinct.size]).toEqual([2, 2]);
  });

  test.each([false, true])("같은 셀에 머문 viewer는 프레임 1개를 공유하고 ackSeq만 각자(한 버킷 %p)", (oneBucket) => {
    const f = new World();
    const g = new World(oneBucket ? "oneBucket" : "all");
    const ws = [f, g];
    for (let id = 1; id <= 6; id++) place(ws, id, 4 + id, 4);
    place(ws, 7, 30, 4); // 이웃 셀 — 창 안.
    for (const vid of [1, 2, 3]) toggleViewer(ws, vid);
    dispatch(f, 0, new Set(), new Set(), sinks(false, newCapture()));
    dispatch(g, 0, new Set(), new Set(), sinks(true, newCapture()));
    for (const w of ws) for (const v of w.viewers.values()) v.ackSeq = 7 + v.viewerEntityId;
    const moved = new Set([1, 4, 7]);
    const cf = newCapture();
    const cg = newCapture();
    dispatch(f, 1, moved, new Set(), sinks(false, cf));
    dispatch(g, 1, moved, new Set(), sinks(true, cg));
    expect(hex(cg)).toEqual(hex(cf));
    expect([cg.sharedCalls, cg.distinct.size]).toEqual([3, 1]);
  });
});

describe("DeltaGroups — 프레임 풀 수명·저장소 맞바꿈", () => {
  /** cache.finish 뷰(빈 DELTA, tickIndex = tag) — 실제 미스와 같은 src. */
  function finishOf(cache: DeltaCache, tag: number): Buffer {
    return cache.finish(tag, 0, 0);
  }

  function frameOf(groups: DeltaGroups, cache: DeltaCache, tag: number): SharedFrame {
    const keep = Int32Array.of(tag, tag + 1);
    expect(groups.find(keep, 2, -1)).toBeUndefined();
    return groups.add(keep, 2, -1, finishOf(cache, tag), cache)!;
  }

  const tickOf = (f: SharedFrame) => f.bytes.readUInt32LE(FRAME_HEADER_BYTES); // 본문 offset 0 = tick.

  test("발급 프레임은 finish 뷰를 복사 없이 가져가고 캐시는 다른 저장소에 쓴다 — 다음 dispatch 동안 그대로, 두 dispatch 뒤 재발급", () => {
    const groups = new DeltaGroups();
    const cache = new DeltaCache();
    groups.begin();
    const src = finishOf(cache, 1);
    const a = groups.add(Int32Array.of(1, 2), 2, -1, src, cache)!;
    expect(a.bytes).toBe(src); // 복사 없음.
    expect(a.patchOff).toBe(DELTA_ACK_OFFSET);
    finishOf(cache, 99); // 캐시의 다음 쓰기는 맞바꾼 저장소 — a를 덮지 않는다.
    expect(tickOf(a)).toBe(1);
    const epochA = a.epoch;
    groups.begin();
    const b = frameOf(groups, cache, 2);
    expect(b).not.toBe(a);
    finishOf(cache, 98);
    expect([a.epoch, tickOf(a), tickOf(b)]).toEqual([epochA, 1, 2]);
    groups.begin();
    const c = frameOf(groups, cache, 3);
    expect(c).toBe(a); // 두 dispatch 전 세대를 재사용.
    expect([a.epoch, tickOf(a), tickOf(b)]).toEqual([epochA + 1, 3, 2]);
    finishOf(cache, 97); // 캐시는 a가 두 dispatch 전 쓰던 저장소를 돌려받았다 — 지금 프레임들은 그대로.
    expect([tickOf(a), tickOf(b)]).toEqual([3, 2]);
  });

  test.each([-1, 0])("find — 같은 keep·self만 적중(길이·self·원소 하나라도 다르면 미스), count 0 묶음은 null(버킷 마스크 %d)", (mask) => {
    const groups = new DeltaGroups(mask);
    const cache = new DeltaCache();
    groups.begin();
    const keep = Int32Array.of(5, 9, 11);
    expect(groups.find(keep, 3, -1)).toBeUndefined();
    const f = groups.add(keep, 3, -1, finishOf(cache, 7), cache)!;
    expect(groups.find(Int32Array.of(5, 9, 11), 3, -1)).toBe(f);
    expect(groups.find(Int32Array.of(5, 9, 11, 13), 3, -1)).toBe(f); // 앞 n개만 본다.
    expect(groups.find(Int32Array.of(5, 9, 12), 3, -1)).toBeUndefined();
    expect(groups.find(Int32Array.of(5, 8, 11), 3, -1)).toBeUndefined();
    expect(groups.find(Int32Array.of(4, 9, 11), 3, -1)).toBeUndefined();
    expect(groups.find(keep, 2, -1)).toBeUndefined();
    expect(groups.find(keep, 3, 4)).toBeUndefined();
    expect(groups.add(keep, 3, 4, null, cache)).toBeNull();
    expect(groups.find(keep, 3, 4)).toBeNull();
    groups.begin();
    expect(groups.find(keep, 3, -1)).toBeUndefined(); // dispatch마다 비운다.
  });

  test("버킷 표 성장 — 한 dispatch에 버킷 3,000개(표 1,024칸의 두 배를 넘김)도 전부 찾고, 다음 dispatch는 비어 있다", () => {
    const groups = new DeltaGroups();
    const cache = new DeltaCache();
    groups.begin();
    const frames: (SharedFrame | null)[] = [];
    for (let i = 0; i < 3000; i++) {
      const keep = Int32Array.of(i * 7, i * 7 + 1, i * 7 + 2);
      expect(groups.find(keep, 3, -1)).toBeUndefined();
      frames.push(groups.add(keep, 3, -1, i % 3 === 0 ? null : finishOf(cache, i), cache));
    }
    for (let i = 0; i < 3000; i++) expect(groups.find(Int32Array.of(i * 7, i * 7 + 1, i * 7 + 2), 3, -1)).toBe(frames[i]!);
    for (let i = 1; i < 3000; i += 3) expect(tickOf(frames[i]!)).toBe(i);
    groups.begin();
    for (let i = 0; i < 3000; i += 97) expect(groups.find(Int32Array.of(i * 7, i * 7 + 1, i * 7 + 2), 3, -1)).toBeUndefined();
  });

  test("add는 keep을 복사해 둔다 — 호출 뒤 원본 버퍼를 덮어써도 판정 불변", () => {
    const groups = new DeltaGroups();
    const cache = new DeltaCache();
    groups.begin();
    const keep = Int32Array.of(1, 2, 3, 4);
    const f = groups.add(keep, 4, -1, finishOf(cache, 1), cache)!;
    keep.fill(0);
    expect(groups.find(Int32Array.of(1, 2, 3, 4), 4, -1)).toBe(f);
    expect(groups.find(keep, 4, -1)).toBeUndefined();
  });
});
