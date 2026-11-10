// 성능 3단계 슬라이스 7(AOI·스냅샷 데이터 지향) — 바꾸기 전 AoiGrid·InterestSet·스냅샷 viewer 송신을 그대로 옮긴 오라클.
//
// 운영 코드는 셀을 slot 연결 리스트로, 멤버십을 dense slot 스탬프로 바꿨다. 아래는 비교 기준이라 고치지 않는다
// (원본: server/src/world/aoi/grid.ts·interestSet.ts, server/src/sim/snapshotBuilder.ts sendViewer — 커밋 e6fca60).

import { AOI_RADIUS, cellKey, worldToCell, type CellPos } from "../../../server/src/world/aoi/grid";
import { PACKET_ID, type SnapshotDeltaPayload } from "../../../server/src/net/codec.generated";
import { FRAME_HEADER_BYTES, encodeFrame, writeFrameHeader } from "../../../server/src/net/wireFrame";

export class LegacyAoiGrid {
  private readonly cells = new Map<number, Set<number>>();
  private readonly entityCell = new Map<number, CellPos>();

  upsert(entityId: number, x: number, y: number): boolean {
    const cx = worldToCell(x);
    const cy = worldToCell(y);
    const prev = this.entityCell.get(entityId);
    if (prev && prev.cx === cx && prev.cy === cy) return false;
    if (prev) {
      const prevSet = this.cells.get(cellKey(prev.cx, prev.cy));
      prevSet?.delete(entityId);
      if (prevSet && prevSet.size === 0) this.cells.delete(cellKey(prev.cx, prev.cy));
    }
    let next = this.cells.get(cellKey(cx, cy));
    if (!next) {
      next = new Set();
      this.cells.set(cellKey(cx, cy), next);
    }
    next.add(entityId);
    this.entityCell.set(entityId, { cx, cy });
    return true;
  }

  remove(entityId: number): void {
    const prev = this.entityCell.get(entityId);
    if (!prev) return;
    const k = cellKey(prev.cx, prev.cy);
    const set = this.cells.get(k);
    set?.delete(entityId);
    if (set && set.size === 0) this.cells.delete(k);
    this.entityCell.delete(entityId);
  }

  cellOf(entityId: number): CellPos | undefined {
    return this.entityCell.get(entityId);
  }

  windowOf(entityId: number): Set<number> {
    const center = this.entityCell.get(entityId);
    if (!center) return new Set();
    return this.windowAt(center.cx, center.cy);
  }

  windowAt(cx: number, cy: number): Set<number> {
    const out = new Set<number>();
    for (let dy = -AOI_RADIUS; dy <= AOI_RADIUS; dy++) {
      for (let dx = -AOI_RADIUS; dx <= AOI_RADIUS; dx++) {
        const set = this.cells.get(cellKey(cx + dx, cy + dy));
        if (!set) continue;
        for (const id of set) out.add(id);
      }
    }
    return out;
  }
}

export interface LegacyDiff {
  enter: number[];
  leave: number[];
  keep: number[];
}

export class LegacyInterestSet {
  private current: Set<number> = new Set();

  constructor(readonly viewerEntityId: number) {}

  recompute(grid: LegacyAoiGrid): LegacyDiff {
    const next = grid.windowOf(this.viewerEntityId);
    const enter: number[] = [];
    const leave: number[] = [];
    const keep: number[] = [];
    for (const id of next) {
      if (this.current.has(id)) keep.push(id);
      else enter.push(id);
    }
    for (const id of this.current) {
      if (!next.has(id)) leave.push(id);
    }
    this.current = next;
    return { enter, leave, keep };
  }

  size(): number {
    return this.current.size;
  }
}

// ── 원본 snapshotBuilder.sendViewer(객체 경로) ───────────────────────────

export interface LegacyViewer {
  readonly playerId: number;
  readonly viewerEntityId: number;
  readonly ackSeq: number;
  readonly interest: LegacyInterestSet;
}

export interface LegacySnapshotCtx {
  readonly tickIndex: number;
  readonly positions: ReadonlyMap<number, { x: number; y: number }>;
  readonly grid: LegacyAoiGrid;
  readonly spawnPayload: (id: number, pos: { x: number; y: number }) => object;
  readonly movedThisTick: ReadonlySet<number>;
  readonly diedThisTick: ReadonlySet<number>;
}

export type LegacySend = (playerId: number, packetId: number, payload: object) => void;

/** 원본 sendViewer 그대로(SPAWN → DESPAWN → DELTA, self 보강). packetId는 호출자가 넘긴 상수. */
export function legacySendViewer(
  ctx: LegacySnapshotCtx,
  viewer: LegacyViewer,
  send: LegacySend,
  ids: { spawn: number; despawn: number; delta: number },
): void {
  const diff = viewer.interest.recompute(ctx.grid);
  for (const id of diff.enter) {
    const pos = ctx.positions.get(id);
    if (!pos) continue;
    send(viewer.playerId, ids.spawn, ctx.spawnPayload(id, pos));
  }
  for (const id of diff.leave) {
    const reason = ctx.diedThisTick.has(id) ? 2 : 0;
    send(viewer.playerId, ids.despawn, { entityId: id, reason });
  }
  const updates: { entityId: number; x: number; y: number }[] = [];
  for (const id of diff.keep) {
    if (!ctx.movedThisTick.has(id)) continue;
    const pos = ctx.positions.get(id);
    if (!pos) continue;
    updates.push({ entityId: id, x: pos.x, y: pos.y });
  }
  const self = viewer.viewerEntityId;
  if (ctx.movedThisTick.has(self) && diff.enter.includes(self) && !updates.some((u) => u.entityId === self)) {
    const pos = ctx.positions.get(self);
    if (pos) updates.push({ entityId: self, x: pos.x, y: pos.y });
  }
  if (updates.length === 0) return;
  send(viewer.playerId, ids.delta, { tickIndex: ctx.tickIndex, ackSeq: viewer.ackSeq, updates });
}

/**
 * B3b 전 SPAWN·DESPAWN 프레임(JSON 본문) — B3b부터 운영은 바이너리(i32 id·유한 f32 좌표 검사)라 범위 밖 id·비유한 좌표를 쓰는 스냅샷 퍼징의 SPAWN을
 * 거부한다. 이 오라클이 보는 것은 SNAPSHOT_DELTA 빠른 경로 ↔ 종전 객체 경로 바이트이고 SPAWN·DESPAWN은 비교 양쪽이 같은 함수로 인코딩하면
 * 되므로 종전 JSON을 그대로 쓴다(SPAWN 페이로드 객체 자체는 시험이 따로 비교한다).
 */
export function legacyJsonFrame(packetId: number, payload: object): Buffer {
  return encodeFrame(packetId, Buffer.from(JSON.stringify(payload), "utf8"));
}

/**
 * C0.1 전 SNAPSHOT_DELTA 객체 경로 인코더(삭제된 server/src/net/binaryCodec.ts writeSnapshotDeltaBody의 사본) + 그 밖 패킷은 B3b 전 JSON(legacyJsonFrame).
 * 빠른 경로(sim/snapshotDelta.ts)는 유효 범위 밖 입력에서 이 종전 동작을 유지한다 — f32 비트 그대로(NaN·±Inf·오버플로), 소수 id 절삭,
 * tick/ack u32 정규화. 생성 코덱(운영 객체 경로)은 그런 값을 WireEncodeError로 거부한다(snapshotDelta.ts 머리 주석의 알려진 차이).
 * 유효 입력에서는 운영 writePacket과 DELTA 바이트가 같다(tests/server/snapshotDeltaWireEquivalence.test.ts).
 */
export function legacyEncodePacket(packetId: number, payload: object): Buffer {
  if (packetId !== PACKET_ID.SNAPSHOT_DELTA) return legacyJsonFrame(packetId, payload);
  const p = payload as SnapshotDeltaPayload;
  const n = p.updates.length;
  const bodyLen = 10 + n * 12;
  const out = Buffer.allocUnsafe(FRAME_HEADER_BYTES + bodyLen);
  writeFrameHeader(out, 0, packetId, bodyLen);
  let off = FRAME_HEADER_BYTES;
  out.writeUInt32LE(p.tickIndex >>> 0, off);
  out.writeUInt32LE(p.ackSeq >>> 0, off + 4);
  out.writeUInt16LE(n, off + 8);
  off += 10;
  for (const u of p.updates) {
    out.writeUInt32LE(u.entityId, off);
    out.writeFloatLE(u.x, off + 4);
    out.writeFloatLE(u.y, off + 8);
    off += 12;
  }
  return out;
}
