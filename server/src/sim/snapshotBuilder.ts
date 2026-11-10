// Phase 4 SnapshotBuilder.
//
// 입력: zone tick 결과 (entity table, AOI grid, 플레이어별 InterestSet, ack seq).
// 출력: 플레이어별로 다음 3종 패킷의 payload를 만들어 sendTo 콜백에 위임.
//   - ENTITY_SPAWN : enter한 entity 1개당 1패킷.
//   - ENTITY_DESPAWN : leave한 entity 1개당 1패킷.
//   - SNAPSHOT_DELTA : tickIndex/ackSeq + keep 중 변경된 entity의 위치(updates).
//
// viewer별 송신 순서(세션별 와이어 바이트가 여기에 묶여 있다): SPAWN 전부(enter 순) → DESPAWN 전부(leave 순, 이번 tick
// 사망이면 reason 2) → DELTA(keep 중 moved, keep 순 + 본인이 enter이면서 moved면 끝에 1회 — 보통 1개, 원소가 5460을 넘으면 같은 tick·ack
// 프레임 여러 개, H1). 빈 DELTA는 보내지 않는다.
// 성능 3단계 슬라이스 7: diff는 InterestSet.diffInto(slot 스탬프, 할당 없음), moved 판정은 dispatch당 1회 만드는 slot
// 캐시(snapshotDelta.ts), DELTA는 운영(deltaFrames 주입)에서 재사용 버퍼에 프레임을 직접 쓴다 — 테스트 기본(sendTo)은
// 종전과 같은 페이로드 객체 경로다(바이트 동일 — tests/server/snapshotDataOrientedEquivalence).
// 성능 4.5 F3: deltaShared 주입 시(운영) keep 열·self가 같은 viewer끼리 DELTA 프레임 1개를 공유한다(deltaGroups.ts — writeEntries는 묶음당
// 1회, 수신자마다 ackSeq만 패치 — keep이 DELTA_GROUP_MIN_KEEP보다 짧으면 종전 경로). 바이트는 묶지 않은 빠른 경로와 같다
// (tests/server/snapshotDeltaGroups).
//
// 비목표 (Phase 4):
//   - 변경 비트마스크 세분화(facing/hp/anim) — 위치만. combatSystem 합류 시 확장.
//   - 패킷 합치기 (한 frame에 ENTITY_SPAWN N건). 정리 단계에서 vec<Spawn>으로 모음.

import type { EntityId, EntityTable } from "../world/entityTable";
import type { Position } from "../world/components/position";
import { NO_SLOT, type AoiGrid } from "../world/aoi/grid";
import { AoiDiffScratch, type InterestSet } from "../world/aoi/interestSet";
import {
  PACKET_ID,
  type EntitySpawnPayload,
  type EntityType,
  type PayloadOf,
  type S2CPacketId,
  type SnapshotDeltaPayload,
  type SnapshotUpdate,
} from "../net/codec.generated";
import { DeltaCache, MAX_DELTA_UPDATES, type DeltaFrameSink } from "./snapshotDelta";
import { DeltaGroups, type DeltaSharedSink } from "./deltaGroups";
import { metrics } from "../obs/metrics";

export type { DeltaFrameSink } from "./snapshotDelta";
/** SNAPSHOT_DELTA 페이로드·원소 — 스키마(packets.json) 코드젠 타입이 단일 정의(C0.1). */
export type { SnapshotDeltaPayload, SnapshotUpdate };
export type { DeltaSharedSink } from "./deltaGroups";

/**
 * G-9: ENTITY_DESPAWN.reason. protocol.md §3.3의 enum(LeaveAOI=1, Death=2, Despawn=3, Disconnect=4)을
 * 따르되 현재는 0(미지정/일반)과 2(사망)만 송신한다. 0이 기본값이라 구 클라는 종전 동작으로 degrade.
 */
export const DESPAWN_REASON_NORMAL = 0;
export const DESPAWN_REASON_DEATH = 2;

/** Phase E-3: ENTITY_META broadcast payload (HP/level 변경 시). */
export interface EntityMetaPayload {
  entityId: EntityId;
  hp: number;
  hpMax: number;
  level: number;
}

/** Phase E-3: zone이 entity의 표시용 메타를 알려주는 콜백 결과. */
export interface EntityMeta {
  name: string;
  level: number;
  hp: number;
  hpMax: number;
  /** G-7: grounditem 전용. 그 외 undefined → spawn payload에서 0. */
  itemId?: number;
  qty?: number;
  /** NPC 전용(def id). 그 외 undefined → spawn payload에서 0. */
  npcId?: number;
  /** 몬스터 전용(monsters.json def id — 클라 def별 외형, protoVersion 16). ENTITY_SPAWN 경로(spawnMetaOf)만 채운다. 그 외 → 0. */
  monsterDefId?: number;
}

/** 플레이어 1명에 대한 송신. zone이 sessionManager.sendTo 어댑터를 주입. */
export type SendTo = <I extends S2CPacketId>(playerId: number, packetId: I, payload: PayloadOf<I>) => void;

/**
 * 같은 페이로드를 여러 플레이어에게(성능 3단계 슬라이스 5) — 운영은 1회 인코딩(sessionManager.sendMany).
 * playerIds 순서대로 sendTo를 반복한 것과 같아야 한다(중복 제거는 호출자 몫).
 */
export type SendMany = <I extends S2CPacketId>(playerIds: readonly number[], packetId: I, payload: PayloadOf<I>) => void;

/** 미리 인코딩한 프레임 송신 표면 — 운영은 encodeOrDrop(writePacket + 송신 단위 방어층) + sessionManager.sendFrame. */
export interface FrameSink {
  /**
   * writePacket(packetId, payload)와 같은 프레임 바이트. null = 인코드 실패로 그 패킷을 버렸다(운영 network/encodeGuard.ts가 기록 — 이진 전환
   * B4): 스냅샷은 그 엔티티의 SPAWN/DESPAWN만 건너뛰고 dispatch·tick을 계속한다.
   */
  encode<I extends S2CPacketId>(packetId: I, payload: PayloadOf<I>): Buffer | null;
  sendFrame(playerId: number, packetId: number, frame: Buffer): void;
}

/**
 * 스냅샷 SPAWN/DESPAWN 프레임 캐시(성능 3단계 슬라이스 5). 한 dispatch 안에서 엔티티의 SPAWN·DESPAWN 페이로드는
 * viewer와 무관하다(위치·메타·사망 스탬프가 dispatch 중 불변) — 엔티티당 1회 인코딩해 viewer마다 같은 프레임을
 * 보낸다. 캐시는 dispatch 1회 동안만 유효하다(buildAndSend가 끝에서 비운다). 인코드 실패(null)도 캐시한다 — viewer마다 다시 인코딩·기록하지
 * 않고 이 dispatch에서 그 엔티티의 프레임을 아무에게도 보내지 않는다.
 */
export class SnapshotFrames {
  private readonly spawn = new Map<EntityId, Buffer | null>();
  private readonly despawn = new Map<EntityId, Buffer | null>();

  constructor(private readonly sink: FrameSink) {}

  sendSpawn(ctx: BuildContext, playerId: number, id: EntityId, pos: Position): void {
    let frame = this.spawn.get(id);
    if (frame === undefined) {
      frame = this.sink.encode(PACKET_ID.ENTITY_SPAWN, spawnPayload(ctx, id, pos));
      this.spawn.set(id, frame);
    }
    if (frame !== null) this.sink.sendFrame(playerId, PACKET_ID.ENTITY_SPAWN, frame);
  }

  sendDespawn(playerId: number, id: EntityId, reason: number): void {
    let frame = this.despawn.get(id);
    if (frame === undefined) {
      frame = this.sink.encode(PACKET_ID.ENTITY_DESPAWN, { entityId: id, reason });
      this.despawn.set(id, frame);
    }
    if (frame !== null) this.sink.sendFrame(playerId, PACKET_ID.ENTITY_DESPAWN, frame);
  }

  clear(): void {
    this.spawn.clear();
    this.despawn.clear();
  }
}

export interface ViewerContext {
  /** snapshot을 받을 플레이어. */
  readonly playerId: number;
  /** 본인의 entity. self 표시·자기 위치 보정용. */
  readonly viewerEntityId: EntityId;
  /** 본인 input의 마지막 처리 seq (재조정용). */
  readonly ackSeq: number;
  readonly interest: InterestSet;
}

export interface BuildContext {
  readonly tickIndex: number;
  readonly table: EntityTable;
  readonly grid: AoiGrid;
  readonly viewers: Iterable<ViewerContext>;
  /** entityId -> 종(spawn payload의 type 필드 — 스키마 enum EntityType). 모든 entity 등록 필수. */
  readonly typeOf: (id: EntityId) => EntityType;
  /**
   * Phase E-3: spawn 시 라벨/HUD 메타. player가 아닌 entity는 빈 문자열·0 반환.
   * 반환 객체는 다음 호출 전까지만 읽는다(존은 재사용 객체를 넘긴다 — 페이로드로 즉시 복사).
   */
  readonly metaOf: (id: EntityId) => EntityMeta;
  /** 이번 tick에 위치가 변한 entity 집합 (movementSystem 결과). */
  readonly movedThisTick: ReadonlySet<EntityId>;
  /**
   * G-9: 이번 tick에 '사망'으로 제거된 entity. leave 목록에 reason=Death를 스탬프해
   * 클라가 시체 연출과 단순 시야이탈을 구분하게 한다(필수 필드 — 호출부 누락을 컴파일 에러로).
   */
  readonly diedThisTick: ReadonlySet<EntityId>;
}

/** 스냅샷 송신 표면. send만 있으면 viewer마다 페이로드 객체로 보낸다(테스트 sendTo 캡처). */
export interface SnapshotSinks {
  readonly send: SendTo;
  /** SPAWN/DESPAWN을 엔티티당 1회 인코딩한 프레임으로(존 fanout 주입 시). */
  readonly frames?: SnapshotFrames;
  /** SNAPSHOT_DELTA를 재사용 버퍼 프레임으로(성능 3단계 슬라이스 7) — deltaShared가 있으면 묶음 하한보다 짧은 keep의 viewer만. */
  readonly deltaFrames?: DeltaFrameSink;
  /** SNAPSHOT_DELTA를 묶음 공유 프레임으로(운영 — 성능 4.5 F3, keep 열·self가 같은 viewer끼리 1개 + ackSeq 패치). */
  readonly deltaShared?: DeltaSharedSink;
}

/** dispatch 사이에 재사용하는 작업 버퍼(존당 1개 — tick당 할당 없음). */
export class SnapshotScratch {
  readonly diff = new AoiDiffScratch();
  readonly deltas = new DeltaCache();

  /** groups: DELTA 묶음 상태(기본 = 운영 값 — 존은 하한 옵션을, 시험은 한 버킷·하한 0을 넣는다). */
  constructor(readonly groups = new DeltaGroups()) {}
}

/**
 * 모든 viewer에게 SPAWN/DESPAWN/DELTA를 보낸다. 바이트는 sinks 조합과 무관하게 같다(빠른 경로는 같은 프레임을 직접 쓴다).
 * 호출 동안 그리드·위치·moved/died 집합을 바꾸지 않는다(존 tick 동기 구간).
 */
export function buildAndSend(ctx: BuildContext, sinks: SnapshotSinks, scratch: SnapshotScratch): void {
  scratch.deltas.prepare(ctx.grid, ctx.movedThisTick, ctx.table.positions);
  scratch.groups.begin();
  try {
    for (const viewer of ctx.viewers) sendViewer(ctx, viewer, sinks, scratch);
  } finally {
    sinks.frames?.clear();
  }
}

/**
 * ENTITY_SPAWN 페이로드(스키마 생성 타입 — 바이트 배치는 스키마 필드 순서, 객체 키 순서와 무관). name은 player/npc만(그 외 빈 문자열),
 * itemId/qty는 grounditem만, npcId는 npc만, monsterDefId는 monster만(그 외 0).
 */
function spawnPayload(ctx: BuildContext, id: EntityId, pos: Position): EntitySpawnPayload {
  const meta = ctx.metaOf(id);
  return {
    entityId: id,
    type: ctx.typeOf(id),
    x: pos.x,
    y: pos.y,
    name: meta.name,
    level: meta.level,
    hp: meta.hp,
    hpMax: meta.hpMax,
    itemId: meta.itemId ?? 0,
    qty: meta.qty ?? 0,
    npcId: meta.npcId ?? 0,
    monsterDefId: meta.monsterDefId ?? 0,
  };
}

function sendViewer(ctx: BuildContext, viewer: ViewerContext, sinks: SnapshotSinks, scratch: SnapshotScratch): void {
  const diff = scratch.diff;
  viewer.interest.diffInto(ctx.grid, diff);
  sendSpawns(ctx, viewer.playerId, diff, sinks);
  sendDespawns(ctx, viewer.playerId, diff, sinks);
  sendDelta(ctx, viewer, scratch, sinks);
}

/** 1) Enter -> ENTITY_SPAWN(창 순서). 위치 없는 entity는 건너뛴다. */
function sendSpawns(ctx: BuildContext, playerId: number, diff: AoiDiffScratch, sinks: SnapshotSinks): void {
  const ids = ctx.grid.slotIds();
  for (let i = 0; i < diff.enterCount; i++) {
    const id = ids[diff.enter[i]!]!;
    const pos = ctx.table.positions.get(id);
    if (!pos) continue;
    if (sinks.frames !== undefined) sinks.frames.sendSpawn(ctx, playerId, id, pos);
    else sinks.send(playerId, PACKET_ID.ENTITY_SPAWN, spawnPayload(ctx, id, pos));
  }
}

/** 2) Leave -> ENTITY_DESPAWN. G-9: 사망(Death)과 단순 시야이탈(일반)을 reason으로 구분. */
function sendDespawns(ctx: BuildContext, playerId: number, diff: AoiDiffScratch, sinks: SnapshotSinks): void {
  for (let i = 0; i < diff.leaveCount; i++) {
    const id = diff.leave[i]!;
    const reason = ctx.diedThisTick.has(id) ? DESPAWN_REASON_DEATH : DESPAWN_REASON_NORMAL;
    if (sinks.frames !== undefined) sinks.frames.sendDespawn(playerId, id, reason);
    else sinks.send(playerId, PACKET_ID.ENTITY_DESPAWN, { entityId: id, reason });
  }
}

/**
 * 3) Keep 중 이번 tick에 움직인 entity의 위치 -> SNAPSHOT_DELTA(빈 delta는 송신 생략 — 트래픽 절감).
 * Phase E-2: 본인이 enter+move 같은 tick(=spawn 직후 INPUT_CMD 즉시 처리)이면 keep에 안 잡히지만 클라는 ackSeq가
 * 필요하다 — self를 끝에 1회 보강한다(enter라 keep에 없으므로 중복이 생기지 않는다).
 */
function sendDelta(ctx: BuildContext, viewer: ViewerContext, scratch: SnapshotScratch, sinks: SnapshotSinks): void {
  const diff = scratch.diff;
  const moved = scratch.deltas;
  const self = diff.selfEntered && moved.isMoved(diff.selfSlot) ? diff.selfSlot : NO_SLOT;
  if (moved.fastPath) {
    if (sinks.deltaShared !== undefined && diff.keepCount >= scratch.groups.minKeep) {
      if (sendDeltaGrouped(ctx, viewer, scratch, sinks.deltaShared, self)) return;
    } else if (sinks.deltaFrames !== undefined) {
      const count = moved.writeEntries(diff, self);
      if (count === 0) return;
      if (count <= MAX_DELTA_UPDATES) {
        sinks.deltaFrames.sendDeltaFrame(viewer.playerId, moved.finish(ctx.tickIndex, viewer.ackSeq, count));
        return;
      }
    }
    // 원소 수가 프레임 상한을 넘으면 객체 경로가 분할한다.
  }
  sendDeltaObject(viewer.playerId, deltaPayload(ctx, viewer, scratch, self), sinks);
}

/**
 * 객체 경로 송신 — 원소 수가 MAX_DELTA_UPDATES(스키마 max 5460 = 본문 65530바이트, u16 프레임 길이 안)를 넘으면 같은 tick·ack 프레임 여러
 * 개로 나눈다(H1). 원소 순서 그대로 자르므로 entity마다 정확히 한 조각에 든다(self 포함) — 클라는 프레임마다 원격 위치를 적용하고 self가
 * 든 프레임에서만 재조정한다(ackSeq는 조각 모두 같다). 극단 밀집에서만 일어나 할당(slice)은 문제 삼지 않는다.
 */
function sendDeltaObject(playerId: number, payload: SnapshotDeltaPayload, sinks: SnapshotSinks): void {
  const n = payload.updates.length;
  if (n === 0) return;
  if (n <= MAX_DELTA_UPDATES) {
    sinks.send(playerId, PACKET_ID.SNAPSHOT_DELTA, payload);
    return;
  }
  for (let i = 0; i < n; i += MAX_DELTA_UPDATES) {
    const updates = payload.updates.slice(i, i + MAX_DELTA_UPDATES);
    sinks.send(playerId, PACKET_ID.SNAPSHOT_DELTA, { tickIndex: payload.tickIndex, ackSeq: payload.ackSeq, updates });
  }
  metrics.snapshotDeltaSplit.inc();
}

/**
 * 묶음 빠른 경로 — 같은 입력(keep 열·self)의 앞선 viewer가 있으면 그 프레임을 ackSeq만 바꿔(또는 보낼 것 없음), 없으면 writeEntries로 만들어
 * 등록한다. false = 원소 수가 프레임 상한을 넘는다(등록하지 않음 — 호출자가 객체 경로로 분할 송신).
 */
function sendDeltaGrouped(
  ctx: BuildContext,
  viewer: ViewerContext,
  scratch: SnapshotScratch,
  sink: DeltaSharedSink,
  self: number,
): boolean {
  const diff = scratch.diff;
  const groups = scratch.groups;
  let frame = groups.find(diff.keep, diff.keepCount, self);
  if (frame === undefined) {
    const moved = scratch.deltas;
    const count = moved.writeEntries(diff, self);
    if (count > MAX_DELTA_UPDATES) return false;
    const src = count === 0 ? null : moved.finish(ctx.tickIndex, viewer.ackSeq, count);
    frame = groups.add(diff.keep, diff.keepCount, self, src, moved);
  }
  if (frame !== null) sink.sendDeltaShared(viewer.playerId, frame, viewer.ackSeq);
  return true;
}

/**
 * 객체 경로 DELTA — 위치는 f64 원값(테스트가 페이로드를 직접 읽는다). tick·ack는 u32로 정규화한다(빠른 경로 finish와 같은 심층방어 —
 * 생성 코덱은 u32 밖 값을 WireEncodeError로 거부하므로 상류 오염이 tick을 죽이지 않게. 1차 방어는 핸들러 경계 검증 net/validate).
 */
function deltaPayload(
  ctx: BuildContext,
  viewer: ViewerContext,
  scratch: SnapshotScratch,
  self: number,
): SnapshotDeltaPayload {
  const diff = scratch.diff;
  const ids = ctx.grid.slotIds();
  const updates: SnapshotUpdate[] = [];
  for (let i = 0; i < diff.keepCount; i++) {
    const s = diff.keep[i]!;
    if (scratch.deltas.isMoved(s)) pushUpdate(ctx, updates, ids[s]!);
  }
  if (self !== NO_SLOT) pushUpdate(ctx, updates, ids[self]!);
  return { tickIndex: ctx.tickIndex >>> 0, ackSeq: viewer.ackSeq >>> 0, updates };
}

function pushUpdate(ctx: BuildContext, updates: SnapshotUpdate[], id: EntityId): void {
  const pos = ctx.table.positions.get(id);
  if (pos) updates.push({ entityId: id, x: pos.x, y: pos.y });
}
