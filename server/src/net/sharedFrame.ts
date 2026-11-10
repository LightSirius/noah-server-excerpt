// 공유 클라 프레임(성능 4.5 F3) — 같은 완성 클라 프레임 바이트를 여러 연결이 받되 patchOff의 u32 LE 하나만 수신자마다 다르다.
// 지금 쓰는 곳은 SNAPSHOT_DELTA 하나다: 같은 셀에 머문 viewer들은 같은 keep 열을 보므로 DELTA가 ackSeq(본문 offset 4 = 프레임
// DELTA_ACK_OFFSET — net/wireFrame.ts)만 다르다(sim/deltaGroups.ts가 묶는다). 받는 쪽은 언제나 "bytes를 복사하고 patchOff에 자기 value"를 쓴다:
//   - 로컬 링크(monolith): 세션 outbox가 복사·패치(FrameOutbox.appendFramePatched) — 종전과 같은 바이트.
//   - 원격 링크(월드, IPC_SHARED=1): outbox가 참조만 들고(appendShared) 게이트웨이 봉투에 프레임을 1회 정의(DEF)한 뒤 연결마다
//     (참조, value)만 싣는다(CONN_DELIVER_SHARED — cluster/ipcSchema.ts). 게이트웨이가 패치해 쓴다.
// 보관자 집계(피어별): 원격 링크 세션이 참조를 outbox에 둘 때 hold(피어), 피어가 그 참조를 봉투에 쓸 때 take(피어). 아직 쓰지 않은 참조가
// 자기 하나뿐이고 봉투에 DEF도 없으면 피어는 참조 대신 평문 복사를 쓴다(DEF + 참조 = 평문 + 16바이트 — 혼자 받는 프레임은 손해).
// 집계는 최적화 힌트일 뿐 바이트 정확성과 무관하다(어긋나면 평문·참조 선택만 달라진다).
// 수명: 발급자(DeltaGroups 풀)가 재발급(reissue)하면 bytes가 바뀌고 집계가 비워진다 — 참조를 보관하는 쪽은 발급 당시 epoch를 함께 들고
// 쓰기 전에 대조한다.

const EMPTY = Buffer.alloc(0);

/** u32 LE(>>> 0) 4바이트 쓰기 — 범위 검사는 호출자(패치 자리는 생성 계약상 bytes 안). */
function putU32LE(b: Buffer, at: number, value: number): void {
  b[at] = value & 0xff;
  b[at + 1] = (value >>> 8) & 0xff;
  b[at + 2] = (value >>> 16) & 0xff;
  b[at + 3] = (value >>> 24) & 0xff;
}

export class SharedFrame {
  /** 완성 클라 프레임 바이트(헤더 포함). 발급자가 재발급할 때만 바뀐다(epoch도 함께). */
  bytes: Buffer = EMPTY;
  /** 재발급 횟수 — 참조 보관자가 보관 당시 값과 다르면 다른 프레임이 된 것이다. */
  epoch = 0;
  /** 보관자 집계 — 피어(키)별 아직 쓰지 않은 참조 수. [0, holderLen). */
  private holderKeys: (object | null)[] = [];
  private holderCounts: number[] = [];
  private holderLen = 0;

  /** patchOff: 수신자별 u32 LE 자리(bytes 안, patchOff + 4 ≤ 길이). */
  constructor(readonly patchOff: number) {}

  /** 발급자 전용 — 새 바이트로 바꾸고 epoch를 올리고 보관자 집계를 비운다. */
  reissue(bytes: Buffer): void {
    this.bytes = bytes;
    this.epoch++;
    this.holderKeys.fill(null, 0, this.holderLen);
    this.holderLen = 0;
  }

  /** bytes를 target[at..]에 복사하고 patchOff에 value(u32 LE, >>> 0)를 쓴다. 반환 = 쓴 바이트 수. */
  copyPatchedTo(target: Buffer, at: number, value: number): number {
    const b = this.bytes;
    if (at < 0 || at + b.length > target.length) throw new RangeError(`shared frame of ${b.length} bytes does not fit at ${at}`);
    target.set(b, at);
    putU32LE(target, at + this.patchOff, value);
    return b.length;
  }

  /** 제자리 패치 — 즉시 송신 직전(링크는 호출 동안만 읽고 못 보낸 꼬리는 복사한다). 다른 참조 보관자도 쓰기 전에 다시 패치한다. */
  patch(value: number): Buffer {
    if (this.patchOff + 4 > this.bytes.length) {
      throw new RangeError(`shared frame patchOff ${this.patchOff} + 4 exceeds ${this.bytes.length} bytes`);
    }
    putU32LE(this.bytes, this.patchOff, value);
    return this.bytes;
  }

  /** 피어(key)로 갈 참조 1개를 보관했다(원격 링크 세션이 outbox 끝 참조로 둘 때). */
  hold(key: object): void {
    const i = this.holderIndex(key);
    if (i >= 0) {
      this.holderCounts[i]!++;
      return;
    }
    this.holderKeys[this.holderLen] = key;
    this.holderCounts[this.holderLen] = 1;
    this.holderLen++;
  }

  /** 피어(key)가 참조 1개를 쓴다 — 반환 = 이것을 포함해 아직 쓰지 않은 그 피어의 참조 수(집계 밖이면 0). */
  take(key: object): number {
    const i = this.holderIndex(key);
    if (i < 0) return 0;
    const n = this.holderCounts[i]!;
    if (n > 0) this.holderCounts[i] = n - 1;
    return n;
  }

  private holderIndex(key: object): number {
    for (let i = 0; i < this.holderLen; i++) if (this.holderKeys[i] === key) return i;
    return -1;
  }
}
