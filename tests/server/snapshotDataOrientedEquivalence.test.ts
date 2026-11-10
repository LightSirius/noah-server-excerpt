// 성능 3단계 슬라이스 7 — 스냅샷 builder(데이터 지향 diff + slot moved 캐시 + DELTA 빠른 경로)가 종전과 같은 바이트인지.
//
// 같은 무작위 조작(이동·셀 경계·위치 객체 교체·위치 삭제·그리드 제거·같은 id 재등록·viewer 입퇴장)을 세 세계에 준다:
//   L: 종전 Set 그리드 + 종전 sendViewer(오라클 — helpers/legacyAoi.ts)
//   O: 새 그리드 + buildAndSend 객체 경로(sinks.send만 — 테스트 기본)
//   F: 새 그리드 + buildAndSend 빠른 경로(SPAWN/DESPAWN 프레임 캐시 + DELTA 재사용 버퍼)
// O의 페이로드 열 == L의 페이로드 열(객체 동등, f64 그대로), F의 플레이어별 바이트 == writePacket(L 페이로드) 연접.
// 위치에는 f32 경계값(NaN·±Inf·-0·1e39 오버플로·서브노멀)을, id에는 u32 경계(0xffffffff·2^31)·소수(1.5)를 섞는다.
// C0.1: 그 경계값은 생성 코덱(운영 객체 경로 writePacket)이 WireEncodeError로 거부하는 입력이라, 무작위 시험의 바이트 오라클은 종전 인코더
// (helpers/legacyAoi.ts legacyEncodePacket)다 — 빠른 경로는 그 종전 동작을 유지한다. 유효 입력의 운영 writePacket 등가는
// snapshotDeltaWireEquivalence.test.ts가 고정한다.

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
import { writePacket } from "../../server/src/network/packetWriter";
import { PACKET_ID } from "../../server/src/net/codec.generated";
import {
  LegacyAoiGrid,
  LegacyInterestSet,
  legacyEncodePacket,
  legacyJsonFrame,
  legacySendViewer,
  type LegacyViewer,
} from "./helpers/legacyAoi";

const IDS = { spawn: PACKET_ID.ENTITY_SPAWN, despawn: PACKET_ID.ENTITY_DESPAWN, delta: PACKET_ID.SNAPSHOT_DELTA };

const ENTITY_IDS: readonly number[] = [
  ...Array.from({ length: 16 }, (_, i) => 1 + i),
  ...Array.from({ length: 10 }, (_, i) => 1_000_000_000 + i),
  1.5,
  2 ** 31,
  0xffffffff,
  ...Array.from({ length: 4 }, (_, i) => 2_000_000_000 + i),
];
/** viewer가 될 수 있는 id(플레이어 대역). */
const VIEWER_IDS = ENTITY_IDS.slice(0, 10);

const EDGE_COORDS: readonly number[] = [
  Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0, 1e39, -1e39, 1e-45, 1e-46, 2 ** -149 * 0.5,
  123456.789, 3.4028235677973366e38,
];

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
}

function coord(r: () => number): number {
  if (r() < 0.03) return EDGE_COORDS[Math.floor(r() * EDGE_COORDS.length)]!;
  return (r() - 0.5) * 96;
}

const META: EntityMeta = { name: "", level: 0, hp: 0, hpMax: 0 };

class World {
  readonly table = new EntityTable();
  readonly viewers = new Map<number, ViewerContext & { ackSeq: number }>();
  readonly scratch = new SnapshotScratch();
  constructor(readonly grid: AoiGrid) {}
}

class Legacy {
  readonly positions = new Map<number, { x: number; y: number }>();
  readonly grid = new LegacyAoiGrid();
  readonly viewers = new Map<number, LegacyViewer & { ackSeq: number }>();
}

interface Captured {
  objects: [number, number, object][];
  bytes: Map<number, Buffer[]>;
}

function pushBytes(c: Captured, pid: number, frame: Buffer): void {
  const list = c.bytes.get(pid);
  if (list) list.push(frame);
  else c.bytes.set(pid, [frame]);
}

function hexStreams(c: Captured): [number, string][] {
  return [...c.bytes.keys()].sort((a, b) => a - b).map((pid) => [pid, Buffer.concat(c.bytes.get(pid)!).toString("hex")]);
}

interface Trio {
  o: World;
  f: World;
  l: Legacy;
}

/** 세 세계에 같은 조작 1회. */
function mutate(t: Trio, r: () => number): void {
  const id = ENTITY_IDS[Math.floor(r() * ENTITY_IDS.length)]!;
  const k = r();
  const worlds = [t.o, t.f];
  if (k < 0.6) {
    const x = coord(r);
    const y = coord(r);
    const replace = r() < 0.2;
    for (const w of worlds) setPos(w.table.positions, id, x, y, replace);
    setPos(t.l.positions, id, x, y, replace);
    for (const w of worlds) w.grid.upsert(id, x, y);
    t.l.grid.upsert(id, x, y);
  } else if (k < 0.75) {
    for (const w of worlds) w.grid.remove(id);
    t.l.grid.remove(id);
    if (r() < 0.5) {
      for (const w of worlds) w.table.positions.delete(id);
      t.l.positions.delete(id);
    }
  } else if (k < 0.8) {
    // 위치만 삭제(그리드에는 남음) — SPAWN·DELTA 모두 건너뛰어야 한다.
    for (const w of worlds) w.table.positions.delete(id);
    t.l.positions.delete(id);
  } else if (k < 0.9) {
    toggleViewer(t, VIEWER_IDS[Math.floor(r() * VIEWER_IDS.length)]!);
  } else {
    for (const w of worlds) w.grid.remove(id);
    t.l.grid.remove(id);
    const x = coord(r);
    const y = coord(r);
    for (const w of worlds) {
      setPos(w.table.positions, id, x, y, false);
      w.grid.upsert(id, x, y);
    }
    setPos(t.l.positions, id, x, y, false);
    t.l.grid.upsert(id, x, y);
  }
}

function setPos(m: Map<number, { x: number; y: number }>, id: number, x: number, y: number, replace: boolean): void {
  const p = m.get(id);
  if (p && !replace) {
    p.x = x;
    p.y = y;
  } else m.set(id, { x, y });
}

function toggleViewer(t: Trio, vid: number): void {
  if (t.l.viewers.has(vid)) {
    t.l.viewers.delete(vid);
    t.o.viewers.delete(vid);
    t.f.viewers.delete(vid);
    return;
  }
  const pid = vid * 10;
  t.l.viewers.set(vid, { playerId: pid, viewerEntityId: vid, ackSeq: 0, interest: new LegacyInterestSet(vid) });
  for (const w of [t.o, t.f]) {
    w.viewers.set(vid, { playerId: pid, viewerEntityId: vid, ackSeq: 0, interest: new InterestSet(vid) });
  }
}

function spawnPayload(id: number, pos: { x: number; y: number }): object {
  return { entityId: id, type: "monster", x: pos.x, y: pos.y, name: "", level: 0, hp: 0, hpMax: 0, itemId: 0, qty: 0, npcId: 0, monsterDefId: 0 };
}

type Encode = (packetId: number, payload: object) => Buffer;

/**
 * 운영 DELTA 객체 경로(생성 코덱 writePacket) + SPAWN·DESPAWN은 B3b 전 JSON — 범위 밖 id의 SPAWN은 B3b부터 바이너리 i32 검사에 먼저 걸리므로,
 * 이 시험의 주제(DELTA 빠른 경로 판정 ↔ 객체 경로의 WireEncodeError)를 보려고 SPAWN·DESPAWN만 종전 인코딩으로 둔다.
 */
const prodDelta: Encode = (packetId, payload) =>
  packetId === PACKET_ID.SNAPSHOT_DELTA ? writePacket(packetId, payload) : legacyJsonFrame(packetId, payload);

function makeSinks(fast: boolean, cap: Captured, encode: Encode = writePacket): SnapshotSinks {
  const send = (pid: number, packetId: number, payload: object): void => {
    cap.objects.push([pid, packetId, payload]);
    pushBytes(cap, pid, encode(packetId, payload));
  };
  if (!fast) return { send };
  return {
    send,
    frames: new SnapshotFrames({
      encode: (packetId, payload) => encode(packetId, payload),
      sendFrame: (pid, _packetId, frame) => pushBytes(cap, pid, frame),
    }),
    deltaFrames: { sendDeltaFrame: (pid, frame) => pushBytes(cap, pid, Buffer.from(frame)) },
  };
}

function dispatchNew(w: World, tick: number, moved: Set<number>, died: Set<number>, sinks: SnapshotSinks): void {
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
    sinks,
    w.scratch,
  );
  w.grid.recycleSlots();
}

function dispatchLegacy(l: Legacy, tick: number, moved: Set<number>, died: Set<number>, cap: Captured): void {
  const ctx = { tickIndex: tick, positions: l.positions, grid: l.grid, spawnPayload, movedThisTick: moved, diedThisTick: died };
  for (const v of l.viewers.values()) {
    legacySendViewer(ctx, v, (pid, packetId, payload) => {
      cap.objects.push([pid, packetId, payload]);
      pushBytes(cap, pid, legacyEncodePacket(packetId, payload));
    }, IDS);
  }
}

function randomSubset(r: () => number, p: number): Set<number> {
  const out = new Set<number>();
  for (const id of ENTITY_IDS) if (r() < p) out.add(id);
  if (r() < 0.2) out.add(99_999); // 그리드에 없는 id
  return out;
}

function newCapture(): Captured {
  return { objects: [], bytes: new Map() };
}

describe("스냅샷 builder — 종전 sendViewer 오라클·객체 경로·빠른 경로 등가", () => {
  test("무작위 80 라운드 × 80 tick: 페이로드 객체 동일, 빠른 경로 바이트 동일", () => {
    let deltas = 0;
    let spawns = 0;
    let deaths = 0;
    for (let round = 0; round < 80; round++) {
      const r = lcg(31 + round);
      const t: Trio = { o: new World(new AoiGrid()), f: new World(new AoiGrid()), l: new Legacy() };
      for (const vid of VIEWER_IDS.slice(0, 4)) toggleViewer(t, vid);
      for (let tick = 0; tick < 80; tick++) {
        const ops = 1 + Math.floor(r() * 10);
        for (let i = 0; i < ops; i++) mutate(t, r);
        const moved = randomSubset(r, 0.5);
        const died = randomSubset(r, 0.15);
        const ack = Math.floor(r() * 1000);
        for (const [vid, v] of t.l.viewers) {
          v.ackSeq = ack + vid;
          t.o.viewers.get(vid)!.ackSeq = ack + vid;
          t.f.viewers.get(vid)!.ackSeq = ack + vid;
        }
        const cl = newCapture();
        const co = newCapture();
        const cf = newCapture();
        dispatchLegacy(t.l, tick, moved, died, cl);
        dispatchNew(t.o, tick, moved, died, makeSinks(false, co, legacyEncodePacket));
        dispatchNew(t.f, tick, moved, died, makeSinks(true, cf, legacyEncodePacket));
        expect(co.objects).toEqual(cl.objects);
        expect(hexStreams(cf)).toEqual(hexStreams(cl));
        for (const [, packetId, p] of cl.objects) {
          if (packetId === IDS.delta) deltas++;
          if (packetId === IDS.spawn) spawns++;
          if (packetId === IDS.despawn && (p as { reason: number }).reason === 2) deaths++;
        }
      }
    }
    expect(deltas).toBeGreaterThan(5_000);
    expect(spawns).toBeGreaterThan(5_000);
    expect(deaths).toBeGreaterThan(300);
  });

  test("u32 범위 밖 id가 움직이면 빠른 경로를 쓰지 않는다 — 운영 객체 경로(생성 코덱)와 같은 WireEncodeError·같은 선행 바이트", () => {
    for (const badId of [2 ** 32 + 3, -5]) {
      const errors: string[] = [];
      const streams: [number, string][][] = [];
      for (const fast of [false, true]) {
        const w = new World(new AoiGrid());
        for (const id of [1, 2, badId]) {
          w.table.positions.set(id, { x: id === badId ? 3 : id, y: 1 });
          w.grid.upsert(id, id === badId ? 3 : id, 1);
        }
        for (const vid of [1, 2]) {
          w.viewers.set(vid, { playerId: vid, viewerEntityId: vid, ackSeq: 0, interest: new InterestSet(vid) });
        }
        const cap = newCapture();
        dispatchNew(w, 0, new Set(), new Set(), makeSinks(fast, cap, prodDelta));
        try {
          dispatchNew(w, 1, new Set([1, badId]), new Set(), makeSinks(fast, cap, prodDelta));
          errors.push("none");
        } catch (err) {
          errors.push(String(err));
        }
        streams.push(hexStreams(cap));
      }
      expect(errors[0]).toContain("WireEncodeError");
      expect(errors[1]).toBe(errors[0]!);
      expect(streams[1]).toEqual(streams[0]!);
    }
  });
});
