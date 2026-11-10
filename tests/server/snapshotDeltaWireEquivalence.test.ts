// C0.1 — SNAPSHOT_DELTA 손으로 쓴 typed-array 빠른 경로(sim/snapshotDelta.ts DeltaCache)와 생성 코덱 객체 경로(writePacket →
// net/wireCodec.generated.ts)가 유효 입력에서 같은 프레임 바이트인지. 무작위 entity 집합·moved 부분집합·keep 순서·self 보강·tick/ack(u32 경계
// 포함)·원소 수(0·1·스키마 max 5460)를 섞는다. 유효 범위 밖 입력(NaN 좌표·소수 id·5460 초과)의 의도적 차이는 snapshotDelta.ts 머리 주석과
// snapshotDataOrientedEquivalence.test.ts(종전 인코더 오라클)가 다룬다.

import { describe, expect, test } from "bun:test";
import { AoiGrid, NO_SLOT } from "../../server/src/world/aoi/grid";
import { AoiDiffScratch } from "../../server/src/world/aoi/interestSet";
import type { Position } from "../../server/src/world/components/position";
import { DeltaCache } from "../../server/src/sim/snapshotDelta";
import { PACKET_ID, SNAPSHOT_DELTA_UPDATES_MAX, type SnapshotUpdate } from "../../server/src/net/codec.generated";
import { writePacket } from "../../server/src/network/packetWriter";
import { FRAME_HEADER_BYTES } from "../../server/src/net/wireFrame";

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
}

interface Case {
  readonly frame: Buffer;
  readonly expected: Buffer;
}

/** n개 entity를 배치하고 keep(무작위 순서)·moved·self로 빠른 경로 프레임과 객체 경로 프레임을 만든다. */
function buildCase(r: () => number, n: number, cache: DeltaCache, tick: number, ack: number): Case {
  const grid = new AoiGrid();
  const positions = new Map<number, Position>();
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const id = r() < 0.05 ? 0xffffffff - i : 1 + Math.floor(r() * 2_000_000_000);
    if (positions.has(id)) continue;
    const pos = { x: r() < 0.05 ? -0 : (r() - 0.25) * 600, y: (r() - 0.25) * 600 };
    positions.set(id, pos);
    grid.upsert(id, pos.x, pos.y);
    ids.push(id);
  }
  const moved = new Set(ids.filter(() => r() < 0.7));
  cache.prepare(grid, moved, positions);
  const selfId = ids.length > 0 && r() < 0.3 ? ids[ids.length - 1]! : null;
  const keepIds = ids.filter((id) => id !== selfId).sort(() => r() - 0.5);
  const diff = new AoiDiffScratch();
  diff.keep = Int32Array.from(keepIds.map((id) => grid.liveSlotOf(id)));
  diff.keepCount = keepIds.length;
  const selfSlot = selfId !== null && moved.has(selfId) ? grid.liveSlotOf(selfId) : NO_SLOT;
  const count = cache.writeEntries(diff, selfSlot);
  const frame = Buffer.from(cache.finish(tick, ack, count));
  const updates: SnapshotUpdate[] = keepIds.filter((id) => moved.has(id)).map((id) => ({ entityId: id, ...positions.get(id)! }));
  if (selfSlot !== NO_SLOT && selfId !== null) updates.push({ entityId: selfId, ...positions.get(selfId)! });
  return { frame, expected: writePacket(PACKET_ID.SNAPSHOT_DELTA, { tickIndex: tick, ackSeq: ack, updates }) };
}

describe("SNAPSHOT_DELTA 빠른 경로 ≡ 생성 코덱 writePacket", () => {
  test("무작위 600 사례(원소 0~300) — 프레임 바이트가 같다", () => {
    const r = rng(2024);
    const cache = new DeltaCache();
    for (let i = 0; i < 600; i++) {
      const tick = r() < 0.05 ? 0xffffffff : Math.floor(r() * 0x100000000);
      const ack = r() < 0.05 ? 0 : Math.floor(r() * 0x7fffffff);
      const { frame, expected } = buildCase(r, Math.floor(r() * 300), cache, tick, ack);
      expect(frame.toString("hex")).toBe(expected.toString("hex"));
    }
  });

  test("스키마 max(5460) 원소 — 같은 바이트(재사용 버퍼 성장 포함)", () => {
    const { frame, expected } = buildExact(new DeltaCache(), SNAPSHOT_DELTA_UPDATES_MAX);
    expect(frame.length).toBe(FRAME_HEADER_BYTES + 10 + SNAPSHOT_DELTA_UPDATES_MAX * 12);
    expect(frame.equals(expected)).toBe(true);
  });
});

/** 정확히 n개가 전부 moved인 사례. */
function buildExact(cache: DeltaCache, n: number): Case {
  const grid = new AoiGrid();
  const positions = new Map<number, Position>();
  const ids = Array.from({ length: n }, (_, i) => i + 1);
  for (const id of ids) {
    const pos = { x: (id % 97) * 1.25, y: (id % 89) * 0.5 };
    positions.set(id, pos);
    grid.upsert(id, pos.x, pos.y);
  }
  cache.prepare(grid, new Set(ids), positions);
  const diff = new AoiDiffScratch();
  diff.keep = Int32Array.from(ids.map((id) => grid.liveSlotOf(id)));
  diff.keepCount = n;
  const frame = Buffer.from(cache.finish(3, 4, cache.writeEntries(diff, NO_SLOT)));
  const updates = ids.map((id) => ({ entityId: id, ...positions.get(id)! }));
  return { frame, expected: writePacket(PACKET_ID.SNAPSHOT_DELTA, { tickIndex: 3, ackSeq: 4, updates }) };
}
