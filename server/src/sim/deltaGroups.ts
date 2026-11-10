// SNAPSHOT_DELTA 묶음(성능 4.5 F3, 4.5 설계 §5) — 한 dispatch 안에서 DELTA 프레임은 (tickIndex, ackSeq) 머리와 (keep slot 열, self slot)의
// 순수 함수다(moved 스탬프·u32 id·f32 위치는 dispatch 동안 불변 — snapshotDelta.ts). 그래서 keep 열과 self가 같은 viewer들은 ackSeq(프레임
// DELTA_ACK_OFFSET의 u32 LE — net/wireFrame.ts) 말고는 같은 바이트를 받는다. 같은 셀에 머문 viewer들이 그렇다(keep = 창 ∩ 직전 창, 창 순서).
//
// 판정은 추론이 아니라 입력 비교다: viewer마다 버킷(keep 열 길이·처음·가운데·끝 slot·self의 해시)을 찾고, 후보와 길이·self·keep 원소를 전부
// 비교해 같을 때만 재사용한다(버킷은 후보를 좁힐 뿐 — 해시 충돌은 비교가 걸러 낸다). 셀이 바뀌었어도 keep이 같은 viewer도 적중한다.
// 미스면 호출자(snapshotBuilder.sendDelta)가 writeEntries/finish로 프레임을 만들고 add가 그 finish 뷰를 복사 없이 풀 프레임으로 가져간다
// (DeltaCache와 저장소를 맞바꾼다 — 캐시는 두 dispatch 전 그 풀 프레임이 쓰던 저장소로 다음 viewer를 쓴다). count 0이면 프레임 없이
// "보낼 것 없음"으로 등록 — 같은 입력의 다음 viewer도 바로 끝난다.
//
// 프레임 풀(두 세대): dispatch마다 세대를 바꾸고, 그 세대 프레임은 두 dispatch 뒤에야 재발급한다(epoch 증가). 원격 링크의 세션 outbox는 이
// 프레임을 참조로 들고 tick 끝 uncork에서 게이트웨이 봉투로 복사하므로 참조는 같은 tick 안에 끝난다 — 한 세대 여유를 두고, outbox는
// 참조 당시 epoch와 대조해 재발급된 프레임이면 그 세션을 닫는다(frameOutbox.ts). 풀이 자란 뒤 미스당 할당은 finish 뷰 1개(종전과 같다).

import { SharedFrame } from "../net/sharedFrame";
import { DELTA_ACK_OFFSET } from "../net/wireFrame";
import type { DeltaCache, DeltaFrameStore } from "./snapshotDelta";

/**
 * 묶음 대상 keep 길이 하한 — 이보다 짧은 keep의 viewer는 종전 viewer별 빠른 경로(writeEntries가 묶음 판정·등록·패치 복사보다 싸다). 성능 4.5 F3
 * 측정(zoneBench spread 1000명, 5회 중앙값): 하한 0은 셀당 2명(keep ≈ 26)에서 dispatchSnapshots +0.41 ms, 32는 셀당 2·4명에서 +0.13·+0.12 ms,
 * 64는 둘 다 ±0.01 ms. 긴 keep(밀집·4.4 측정 시나리오의 keep 420/600)은 그대로 묶인다.
 */
export const DELTA_GROUP_MIN_KEEP = 64;

/**
 * 묶음 DELTA 송신 표면(운영 = sessionManager.sendShared). frame은 이 dispatch와 다음 dispatch 동안 유효하다(두 dispatch 뒤 재발급) —
 * 구현은 bytes를 복사하고 patchOff에 ackSeq를 쓰거나(로컬 링크), 참조를 보관했다가 epoch를 대조해 쓴다(원격 링크).
 */
export interface DeltaSharedSink {
  sendDeltaShared(playerId: number, frame: SharedFrame, ackSeq: number): void;
}

const INITIAL_KEEP = 64;
/** 이보다 큰 저장소는 캐시로 돌려주지 않는다(큰 묶음 1회가 존 메모리를 영구히 키우지 않게 — 캐시가 기본 크기로 새로 만든다). */
const STORE_RETAIN_MAX_BYTES = 64 * 1024;

/** 버킷 표 초기 칸 수(2의 거듭제곱). 버킷 수의 2배를 넘으면 두 배로 — 커진 표는 유지(다음 dispatch부터 재해시 없음). */
const INITIAL_TABLE = 1024;

interface Candidate {
  keep: Int32Array;
  n: number;
  self: number;
  frame: SharedFrame | null;
  /** 버킷 키(표를 키울 때 다시 넣는다). */
  key: number;
  /** 같은 버킷의 다음 후보 인덱스(-1 = 끝). */
  next: number;
}

/** 버킷 해시 — 길이·self·처음/가운데/끝 slot. 같은 입력이면 같은 값(충돌은 find의 전체 비교가 거른다). */
function bucketKey(keep: Int32Array, n: number, self: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) ^ self;
  if (n > 0) {
    h = Math.imul(h ^ keep[0]!, 0xc2b2ae35);
    h = Math.imul(h ^ keep[n >>> 1]!, 0x27d4eb2f);
    h = Math.imul(h ^ keep[n - 1]!, 0x165667b1);
  }
  return h;
}

function samePrefix(a: Int32Array, b: Int32Array, n: number): boolean {
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class DeltaGroups {
  // 버킷 표 — 열린 주소법(선형 탐사). 칸은 tabStamp === stamp일 때만 이번 dispatch 것이다(begin이 stamp를 올려 한 번에 비운다 — Map.clear와
  // 재성장이 dispatch마다 수백 키를 다시 해시하던 비용을 없앤다).
  private tabKey = new Int32Array(INITIAL_TABLE);
  private tabHead = new Int32Array(INITIAL_TABLE);
  private tabStamp = new Uint32Array(INITIAL_TABLE);
  private stamp = 0;
  /** 이번 dispatch에 쓴 버킷 칸 수. */
  private filled = 0;
  private readonly cands: Candidate[] = [];
  private used = 0;
  /** 세대별 풀 프레임과 그 bytes가 놓인 저장소(같은 인덱스, 아직 발급 전이면 null). */
  private readonly frames: [SharedFrame[], SharedFrame[]] = [[], []];
  private readonly stores: [(DeltaFrameStore | null)[], (DeltaFrameStore | null)[]] = [[], []];
  private gen: 0 | 1 = 0;
  private issued = 0;

  /**
   * bucketMask: 버킷 해시에 AND(기본 -1 = 그대로). 0이면 모든 입력이 한 버킷 — 판정이 전부 입력 비교에 걸린다(해시 충돌 대역 — 시험용).
   * minKeep: 묶음 대상 keep 길이 하한(기본 DELTA_GROUP_MIN_KEEP) — 짧은 keep은 writeEntries가 묶음 판정·등록보다 싸다(호출자가 종전 경로로).
   */
  constructor(
    private readonly bucketMask = -1,
    readonly minKeep = DELTA_GROUP_MIN_KEEP,
  ) {}

  /** dispatch 시작 — 후보를 비우고 세대를 바꾼다(이 세대 프레임은 두 dispatch 전에 발급한 것). */
  begin(): void {
    this.stamp = (this.stamp + 1) >>> 0;
    if (this.stamp === 0) {
      this.tabStamp.fill(0);
      this.stamp = 1;
    }
    this.filled = 0;
    this.used = 0;
    this.gen = this.gen === 0 ? 1 : 0;
    this.issued = 0;
  }

  /** 같은 입력(keep 앞 n개·self)의 앞선 결과 — 없으면 undefined, 보낼 DELTA가 없던 입력이면 null. */
  find(keep: Int32Array, n: number, self: number): SharedFrame | null | undefined {
    const s = this.slotOf(bucketKey(keep, n, self) & this.bucketMask);
    let i = s < 0 ? -1 : this.tabHead[s]!;
    while (i >= 0) {
      const c = this.cands[i]!;
      if (c.n === n && c.self === self && samePrefix(c.keep, keep, n)) return c.frame;
      i = c.next;
    }
    return undefined;
  }

  /**
   * 입력의 결과를 등록한다(find가 놓친 뒤). keep은 복사해 둔다. src = cache.finish가 돌려준 뷰(복사 없이 풀 프레임이 가져가고 cache와
   * 저장소를 맞바꾼다), null = 보낼 DELTA 없음(count 0). 반환 = 발급한 풀 프레임(또는 null).
   */
  add(keep: Int32Array, n: number, self: number, src: Buffer | null, cache: DeltaCache): SharedFrame | null {
    const key = bucketKey(keep, n, self) & this.bucketMask;
    const index = this.used++;
    let c = this.cands[index];
    if (c === undefined) {
      c = { keep: new Int32Array(Math.max(INITIAL_KEEP, n)), n: 0, self: 0, frame: null, key: 0, next: -1 };
      this.cands.push(c);
    }
    if (c.keep.length < n) c.keep = new Int32Array(Math.max(n, c.keep.length * 2));
    const dst = c.keep;
    for (let i = 0; i < n; i++) dst[i] = keep[i]!;
    c.n = n;
    c.self = self;
    c.key = key;
    c.frame = src === null ? null : this.issue(src, cache);
    this.link(index, c);
    return c.frame;
  }

  /** key의 칸 — 이번 dispatch에 있으면 그 인덱스, 없으면 ~(넣을 빈 칸). */
  private slotOf(key: number): number {
    const keys = this.tabKey;
    const stamps = this.tabStamp;
    const mask = keys.length - 1;
    let i = (key ^ (key >>> 16)) & mask;
    while (stamps[i] === this.stamp) {
      if (keys[i] === key) return i;
      i = (i + 1) & mask;
    }
    return ~i;
  }

  /** 후보 index를 그 버킷 사슬 머리에 단다(표가 반을 넘으면 두 배로). */
  private link(index: number, c: Candidate): void {
    let s = this.slotOf(c.key);
    if (s < 0) {
      s = ~s;
      this.tabStamp[s] = this.stamp;
      this.tabKey[s] = c.key;
      c.next = -1;
      this.filled++;
    } else c.next = this.tabHead[s]!;
    this.tabHead[s] = index;
    if (this.filled * 2 > this.tabKey.length) this.grow();
  }

  /** 표를 두 배로 — 이번 dispatch 후보를 다시 단다(사슬 순서는 판정과 무관하다). */
  private grow(): void {
    const n = this.tabKey.length * 2;
    this.tabKey = new Int32Array(n);
    this.tabHead = new Int32Array(n);
    this.tabStamp = new Uint32Array(n);
    this.filled = 0;
    for (let i = 0; i < this.used; i++) this.link(i, this.cands[i]!);
  }

  /** 이 세대의 다음 풀 프레임을 src로 재발급한다 — src가 놓인 저장소를 cache에서 넘겨받고, 그 프레임이 두 dispatch 전 쓰던 저장소를 돌려준다. */
  private issue(src: Buffer, cache: DeltaCache): SharedFrame {
    const frames = this.frames[this.gen];
    const stores = this.stores[this.gen];
    const i = this.issued++;
    let f = frames[i];
    if (f === undefined) {
      f = new SharedFrame(DELTA_ACK_OFFSET);
      frames.push(f);
      stores.push(null);
    }
    const freed = stores[i]!;
    stores[i] = cache.swapStore(freed !== null && freed.buf.length <= STORE_RETAIN_MAX_BYTES ? freed : null);
    f.reissue(src);
    return f;
  }
}
