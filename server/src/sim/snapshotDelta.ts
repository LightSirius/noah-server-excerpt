// 성능 3단계 슬라이스 7 — SNAPSHOT_DELTA: dispatch당 1회 만드는 moved 캐시 + 재사용 프레임 버퍼 빠른 경로.
//
// moved 캐시: dispatch 시작에 movedThisTick을 1회 돌아 "그리드 안 + 위치 있음" entity의 slot에 스탬프를 찍고 u32 id·f32
// x·y 비트를 slot 인덱스 배열에 적어 둔다. viewer마다 keep 원소의 moved 판정은 Set 조회 대신 스탬프 비교 1회다(위치·
// moved 집합은 dispatch 중 불변 — 종전 viewer별 조회와 같은 값).
// 프레임: writePacket(SNAPSHOT_DELTA, payload)와 같은 바이트를 재사용 버퍼에 쓴다 — 프레임 헤더(net/wireFrame.ts) +
// [tick u32 LE][ack u32 LE][count u16 LE] + N × [id u32 LE][x f32 LE][y f32 LE]. 본문 오프셋·원소 크기는 스키마(packets.json
// SNAPSHOT_DELTA·SnapshotUpdate) 코드젠 상수에서 얻는다 — 레이아웃이 바뀌면 아래 로드 시점 가드가 멈춘다(이 경로는 손으로 쓴 typed-array
// 경로라 생성 코덱과 등가 시험 tests/server/snapshotDeltaWireEquivalence.test.ts가 바이트를 고정). 원소당 u32 3개를 typed array로 옮기므로
// (Buffer.write* 3회 대신) 원소 자리가 4바이트 정렬이어야 한다 — 프레임 머리(v2 헤더 4 + 본문 머리 10 = 14)가 4의 배수가 아니라 프레임을
// 저장소의 FRAME_BASE(2)부터 써서 원소가 16에서 시작하게 한다(뷰는 FRAME_BASE부터 — 받는 쪽은 차이를 모른다). f32 변환은 Float32Array
// 저장 = writeFloatLE와 같다.
// 객체 경로(생성 코덱 — net/wireCodec.generated.ts)로 가는 입력: id가 u32 범위 밖·빅엔디언 호스트(객체 경로가 WireEncodeError를 낸다),
// 원소 수 > MAX_DELTA_UPDATES(= 스키마 max 5460 — 최악 본문 65530바이트가 u16 프레임 길이에 들어가는 값, H1)는 객체 경로가 같은 tick·ack
// 프레임 여러 개로 나눠 보낸다(snapshotBuilder sendDeltaObject — 원소 순서 그대로, 극단 밀집에서만).
// 알려진 차이 2가지(C0.1 — 런타임 동작 유지를 위해 의도적으로 둔다, docs/adr/0003 §2.4. 차이 ① 원소 수 상한은 H1 분할로 해소):
//   ② 비유한 좌표: 빠른 경로는 f32 비트를 그대로 옮기고, 객체 경로는 NaN·±Inf·f32 범위 밖을 WireEncodeError로 거부한다(권위 위치는 유한).
//   ③ 소수 entity id: 빠른 경로는 Uint32Array 저장으로 절삭하고(종전 writeUInt32LE와 같음), 객체 경로는 거부한다(id는 정수).
// ②③의 종전 동작 오라클은 tests/server/helpers/legacyAoi.ts legacyEncodePacket(snapshotDataOrientedEquivalence.test.ts).

import type { EntityId } from "../world/entityTable";
import type { Position } from "../world/components/position";
import { NO_SLOT, type AoiGrid } from "../world/aoi/grid";
import type { AoiDiffScratch } from "../world/aoi/interestSet";
import {
  PACKET_ID,
  SNAPSHOT_DELTA_OFFSET,
  SNAPSHOT_DELTA_PREFIX_BYTES,
  SNAPSHOT_DELTA_UPDATES_MAX,
  SNAPSHOT_UPDATE_BYTES,
  SNAPSHOT_UPDATE_OFFSET,
} from "../net/codec.generated";
import { DELTA_ACK_OFFSET, FRAME_HEADER_BYTES, MAX_FRAME_BODY_BYTES, writeFrameHeader } from "../net/wireFrame";

/**
 * SNAPSHOT_DELTA 빠른 경로 송신 표면(운영 = sessionManager.sendFrame). frame은 재사용 버퍼의 뷰라 호출 동안만 유효하다 —
 * 구현은 바이트를 복사해야 한다(세션 outbox·링크 꼬리는 복사한다).
 */
export interface DeltaFrameSink {
  sendDeltaFrame(playerId: number, frame: Buffer): void;
}

/** 프레임 1개의 원소 수 상한 = 스키마 max — 넘으면 빌더가 분할한다(H1). */
export const MAX_DELTA_UPDATES = SNAPSHOT_DELTA_UPDATES_MAX;
/** 본문 머리 [tick u32 LE][ack u32 LE][count u16 LE] 바이트 수. */
const DELTA_BODY_HEAD_BYTES = SNAPSHOT_DELTA_PREFIX_BYTES;
/** 프레임 머리 = 프레임 헤더 + 본문 머리 — 프레임 안 원소 자리의 시작. */
const DELTA_FRAME_PREFIX = FRAME_HEADER_BYTES + DELTA_BODY_HEAD_BYTES;
/** 저장소 안 프레임 시작 — 원소 자리(FRAME_BASE + DELTA_FRAME_PREFIX)를 4바이트 정렬로 맞춘다(헤더 형식에서 파생). */
const FRAME_BASE = (4 - (DELTA_FRAME_PREFIX % 4)) % 4;
/** 저장소 안 원소 자리의 u32 인덱스. */
const ENTRY_U32_START = (FRAME_BASE + DELTA_FRAME_PREFIX) / 4;
/** 프레임 안 본문 머리 필드 자리 — tick·ack(DELTA_ACK_OFFSET)·count. */
const DELTA_TICK_OFFSET = FRAME_HEADER_BYTES + SNAPSHOT_DELTA_OFFSET.tickIndex;
const DELTA_COUNT_OFFSET = FRAME_HEADER_BYTES + SNAPSHOT_DELTA_OFFSET.count;
const ENTRY_BYTES = SNAPSHOT_UPDATE_BYTES;
// 원소는 u32 뷰로 옮긴다(putEntry) — FRAME_BASE가 정렬을 맞추지 못하면(계산 오류) 로드 시점에 멈춘다.
if ((FRAME_BASE + DELTA_FRAME_PREFIX) % 4 !== 0) throw new Error(`SNAPSHOT_DELTA entries at ${FRAME_BASE + DELTA_FRAME_PREFIX}B are not 4-byte aligned`);
// putEntry는 원소를 [id u32][x f32][y f32] u32 3개로 옮기고 finish는 머리를 [tick u32][ack u32][count u16]로 쓴다 — 스키마가 이 배치와 다르면 멈춘다.
if (
  SNAPSHOT_UPDATE_BYTES !== 12 ||
  SNAPSHOT_UPDATE_OFFSET.entityId !== 0 ||
  SNAPSHOT_UPDATE_OFFSET.x !== 4 ||
  SNAPSHOT_UPDATE_OFFSET.y !== 8 ||
  SNAPSHOT_DELTA_OFFSET.ackSeq !== SNAPSHOT_DELTA_OFFSET.tickIndex + 4 ||
  SNAPSHOT_DELTA_OFFSET.count !== SNAPSHOT_DELTA_OFFSET.ackSeq + 4 ||
  SNAPSHOT_DELTA_PREFIX_BYTES !== SNAPSHOT_DELTA_OFFSET.count + 2 ||
  MAX_DELTA_UPDATES < 1 ||
  DELTA_BODY_HEAD_BYTES + MAX_DELTA_UPDATES * ENTRY_BYTES > MAX_FRAME_BODY_BYTES
) {
  throw new Error("SNAPSHOT_DELTA schema layout changed — update the hand-written fast path (sim/snapshotDelta.ts)");
}
const INITIAL_SLOTS = 64;
const INITIAL_FRAME_BYTES = 4096;
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/**
 * DELTA 프레임 버퍼 묶음 — 전용 ArrayBuffer(Buffer 풀 공유 없음 — u32 뷰의 4바이트 정렬)와 그 뷰 3개. 성능 4.5 F3: DELTA 묶음(deltaGroups.ts)이
 * finish 뷰를 복사 없이 공유 프레임으로 가져가면서 저장소째 주고받는다(뷰를 새로 만들지 않게).
 */
export interface DeltaFrameStore {
  readonly buf: Buffer;
  readonly u32: Uint32Array;
  readonly view: DataView;
}

function newFrameStore(bytes: number): DeltaFrameStore {
  const ab = new ArrayBuffer(bytes);
  return { buf: Buffer.from(ab), u32: new Uint32Array(ab), view: new DataView(ab) };
}

export class DeltaCache {
  private stamp = 0;
  private movedAt = new Float64Array(INITIAL_SLOTS);
  private idU32 = new Uint32Array(INITIAL_SLOTS);
  private xy = new Float32Array(INITIAL_SLOTS * 2);
  private xyBits = new Uint32Array(this.xy.buffer);
  /** 이번 dispatch의 moved id가 전부 u32 범위인가(아니면 객체 경로). */
  private idsFit = true;

  /** 지금 쓰는 프레임 저장소(DeltaFrameStore — swapStore로 주고받는다)와 그 뷰(핫패스용 필드 사본). */
  private store: DeltaFrameStore = newFrameStore(INITIAL_FRAME_BYTES);
  private frameBuf = this.store.buf;
  private frameU32 = this.store.u32;
  private frameView = this.store.view;

  /**
   * 직전 finish 뷰가 놓인 저장소를 내준다(이후 그 뷰는 호출자 소유 — 이 캐시는 다시 쓰지 않는다). 대신 next(호출자가 돌려주는, 이제 아무도
   * 참조하지 않는 저장소 — 크기 무관, 모자라면 다음 쓰기가 키운다)를 쓰고, null이면 새로 만든다.
   */
  swapStore(next: DeltaFrameStore | null): DeltaFrameStore {
    const cur = this.store;
    this.useStore(next ?? newFrameStore(INITIAL_FRAME_BYTES));
    return cur;
  }

  /** dispatch 시작 — moved 중 그리드 안·위치 있는 entity를 slot에 기록한다. */
  prepare(grid: AoiGrid, moved: ReadonlySet<EntityId>, positions: ReadonlyMap<EntityId, Position>): void {
    this.stamp++;
    this.ensureSlots(grid.slotCapacity);
    this.idsFit = true;
    for (const id of moved) {
      const s = grid.liveSlotOf(id);
      if (s === NO_SLOT) continue;
      const p = positions.get(id);
      if (!p) continue;
      this.movedAt[s] = this.stamp;
      if (!(id >= 0 && id <= 0xffffffff)) this.idsFit = false;
      this.idU32[s] = id;
      this.xy[2 * s] = p.x;
      this.xy[2 * s + 1] = p.y;
    }
  }

  /** slot entity가 이번 tick에 움직였고 위치가 있나(= 종전 movedThisTick.has && positions.get). */
  isMoved(slot: number): boolean {
    return slot !== NO_SLOT && this.movedAt[slot] === this.stamp;
  }

  /** 이번 dispatch에 빠른 경로를 쓸 수 있나(호스트 엔디언·moved id 범위). 원소 수 상한은 finish 전에 따로 본다. */
  get fastPath(): boolean {
    return LITTLE_ENDIAN && this.idsFit;
  }

  /**
   * keep 중 moved(diff 순서) + self(NO_SLOT이 아니면 끝)를 프레임 버퍼의 원소 자리에 쓰고 개수를 돌려준다(1회 순회).
   * 헤더는 finish가 쓴다.
   */
  writeEntries(diff: AoiDiffScratch, self: number): number {
    this.ensureFrame(FRAME_BASE + DELTA_FRAME_PREFIX + (diff.keepCount + 1) * ENTRY_BYTES);
    const keep = diff.keep;
    const at = this.movedAt;
    const stamp = this.stamp;
    let w = ENTRY_U32_START;
    for (let i = 0; i < diff.keepCount; i++) {
      const s = keep[i]!;
      if (at[s] === stamp) w = this.putEntry(w, s);
    }
    if (self !== NO_SLOT) w = this.putEntry(w, self);
    return (w - ENTRY_U32_START) / 3;
  }

  /** writeEntries로 쓴 count개 원소에 헤더를 붙인 프레임 뷰(count ≤ MAX_DELTA_UPDATES, 저장소의 FRAME_BASE부터) — 다음 쓰기 전까지만 유효. */
  finish(tickIndex: number, ackSeq: number, count: number): Buffer {
    const bytes = DELTA_FRAME_PREFIX + count * ENTRY_BYTES;
    const dv = this.frameView;
    writeFrameHeader(this.frameBuf, FRAME_BASE, PACKET_ID.SNAPSHOT_DELTA, bytes - FRAME_HEADER_BYTES);
    dv.setUint32(FRAME_BASE + DELTA_TICK_OFFSET, tickIndex >>> 0, true);
    dv.setUint32(FRAME_BASE + DELTA_ACK_OFFSET, ackSeq >>> 0, true);
    dv.setUint16(FRAME_BASE + DELTA_COUNT_OFFSET, count, true);
    return this.frameBuf.subarray(FRAME_BASE, FRAME_BASE + bytes);
  }

  private putEntry(w: number, s: number): number {
    const out = this.frameU32;
    out[w] = this.idU32[s]!;
    out[w + 1] = this.xyBits[2 * s]!;
    out[w + 2] = this.xyBits[2 * s + 1]!;
    return w + 3;
  }

  private ensureSlots(cap: number): void {
    if (this.movedAt.length >= cap) return;
    let n = this.movedAt.length;
    while (n < cap) n *= 2;
    const at = new Float64Array(n);
    at.set(this.movedAt);
    this.movedAt = at;
    const ids = new Uint32Array(n);
    ids.set(this.idU32);
    this.idU32 = ids;
    const xy = new Float32Array(n * 2);
    xy.set(this.xy);
    this.xy = xy;
    this.xyBits = new Uint32Array(xy.buffer);
  }

  private ensureFrame(bytes: number): void {
    if (this.frameBuf.length >= bytes) return;
    let n = Math.max(this.frameBuf.length, INITIAL_FRAME_BYTES);
    while (n < bytes) n *= 2;
    this.useStore(newFrameStore(n));
  }

  private useStore(s: DeltaFrameStore): void {
    this.store = s;
    this.frameBuf = s.buf;
    this.frameU32 = s.u32;
    this.frameView = s.view;
  }
}
