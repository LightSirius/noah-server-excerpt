/**
 * RingByteBuffer — Phase 2 (docs/migration-plan.md).
 *
 * v1의 `socket.data.buffer = Buffer.concat([socket.data.buffer, Buffer.from(chunk)])`는
 * 매 청크마다 전체 누적 버퍼를 복사하므로 트래픽이 늘면 O(n²)로 폭증한다.
 *
 * 본 구현은 head/tail 포인터 + 필요 시 2× grow.
 *   appendChunk: amortized O(len(chunk))
 *   readU16LE/readU32LE: O(1) — 클라 프레임 헤더 v2([len u16 LE][id u16 LE], net/wireFrame.ts)·IPC 봉투 길이
 *   consume     : O(1) (그리고 head가 capacity의 절반을 넘으면 압축)
 */

const DEFAULT_INITIAL = 4 * 1024;
/** 기본 하드캡 1 MB — 클라 inbox: 단일 패킷 최대치(65 KB body + 헤더)의 큰 여유. */
export const DEFAULT_RING_MAX_CAPACITY = 1 * 1024 * 1024;

export interface RingByteBufferOptions {
  /**
   * 누적 상한(바이트) — 넘는 append는 throw. 2배 성장이 상한을 넘으면 상한까지만 키운다(2의 거듭제곱이 아니어도 된다).
   * 기본 DEFAULT_RING_MAX_CAPACITY. 4단계 IPC 수신은 봉투 상한에 맞춰 키운다(봉투 1개 + 다음 봉투 일부).
   */
  maxCapacity?: number;
}

export class RingByteBuffer {
  /** 생성 이후 consume한 바이트 누계 — 0이면 head가 스트림의 첫 바이트다(클라 엣지의 첫 프레임 판정 — 구 v1 클라 감지). */
  consumedTotal = 0;
  private buf: Buffer;
  private head = 0; // 다음에 읽을 위치
  private tail = 0; // 다음에 쓸 위치 (head <= tail)
  private readonly maxCapacity: number;

  constructor(initialCapacity: number = DEFAULT_INITIAL, opts: RingByteBufferOptions = {}) {
    if (initialCapacity <= 0) {
      throw new Error("initialCapacity must be > 0");
    }
    const max = opts.maxCapacity ?? DEFAULT_RING_MAX_CAPACITY;
    if (!Number.isSafeInteger(max) || max < initialCapacity) {
      throw new Error(`maxCapacity must be an integer >= initialCapacity (${initialCapacity}), got ${max}`);
    }
    this.maxCapacity = max;
    this.buf = Buffer.allocUnsafe(initialCapacity);
  }

  /** 사용 가능 바이트 수. */
  get available(): number {
    return this.tail - this.head;
  }

  /** 내부 capacity (테스트·진단용). */
  get capacity(): number {
    return this.buf.length;
  }

  /**
   * 들어온 청크를 누적. v1의 Buffer.concat은 폐기.
   *
   * 동작:
   *   - 충분한 꼬리 공간이 있으면 그 자리에 복사.
   *   - 없으면 head 정리(head>0이면 0으로 압축)를 시도하고, 그래도 모자라면 grow.
   */
  appendChunk(chunk: Uint8Array | Buffer): void {
    const need = this.tail + chunk.length;
    if (need > this.buf.length) {
      this.compactOrGrow(chunk.length);
    }
    if (Buffer.isBuffer(chunk)) {
      chunk.copy(this.buf, this.tail);
    } else {
      this.buf.set(chunk, this.tail);
    }
    this.tail += chunk.length;
  }

  /** head로부터 offset 위치의 u16 LE. 클라 프레임 헤더(v2 — [len u16 LE][id u16 LE], net/wireFrame.ts) 읽기에 사용. */
  readU16LE(offset: number): number {
    this.requireBytes(offset + 2);
    return this.buf.readUInt16LE(this.head + offset);
  }

  /** head로부터 offset 위치의 u32 LE. 4단계 IPC 봉투 길이(cluster/ipcCodec) 읽기에 사용. */
  readU32LE(offset: number): number {
    this.requireBytes(offset + 4);
    return this.buf.readUInt32LE(this.head + offset);
  }

  /**
   * head로부터 [start, end) 범위를 zero-copy view로 반환.
   * 호출자는 view를 buf 갱신 전에만 사용. (대안: copy=true 옵션)
   */
  slice(start: number, end: number): Buffer {
    if (start < 0 || end < start) throw new Error("invalid slice range");
    this.requireBytes(end);
    return this.buf.subarray(this.head + start, this.head + end);
  }

  /** 앞쪽 n바이트 소비. consume 후에는 slice/readU* 가 가리키던 view가 무효. */
  consume(n: number): void {
    if (n < 0) throw new Error("consume(n<0)");
    if (n > this.available) throw new Error(`consume ${n} > available ${this.available}`);
    this.consumedTotal += n;
    this.head += n;
    if (this.head === this.tail) {
      // 완전히 비웠으면 두 포인터를 0으로 — 다음 append가 압축 없이 들어간다.
      this.head = 0;
      this.tail = 0;
    } else if (this.head > this.buf.length / 2) {
      // head가 너무 멀면 압축. 절반 룰.
      this.compactInPlace();
    }
  }

  // ---- internal ----

  private requireBytes(n: number): void {
    if (this.available < n) {
      throw new Error(`need ${n} bytes, available ${this.available}`);
    }
  }

  private compactInPlace(): void {
    if (this.head === 0) return;
    this.buf.copy(this.buf, 0, this.head, this.tail);
    this.tail -= this.head;
    this.head = 0;
  }

  private compactOrGrow(incomingSize: number): void {
    // 1. head>0이면 먼저 압축으로 공간 회복 시도.
    this.compactInPlace();
    if (this.tail + incomingSize <= this.buf.length) return;

    // 2. 그래도 부족하면 2× grow(상한에서 멈춤). 기본(4 KB에서 2배 → 1 MB)은 종전과 같은 용량 열·같은 throw 지점.
    const need = this.tail + incomingSize;
    if (need > this.maxCapacity) {
      throw new Error(`ring buffer overflow: requested ${need}B > max ${this.maxCapacity}B`);
    }
    let newCap = this.buf.length;
    while (need > newCap) newCap *= 2;
    newCap = Math.min(newCap, this.maxCapacity);
    const next = Buffer.allocUnsafe(newCap);
    this.buf.copy(next, 0, 0, this.tail);
    this.buf = next;
  }
}
