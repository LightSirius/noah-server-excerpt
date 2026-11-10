// 월드 ↔ 게이트웨이 IPC 코덱 — 성능 4단계 4.2. 레이아웃·불변식은 ipcSchema.ts 상단. 수신(스트리밍 디코더)은 ipcDecoder.ts(4.5 F2에서
// 분리 — 여기서 재수출하므로 호출자 import는 그대로).
//
// 송신(BatchWriter — 피어마다 1개, 방향별 서브클래스 GatewayIpcWriter·WorldIpcWriter):
//   - 메시지를 한 버퍼에 이어 쓰고 flushTo(sink)로 한 번에 넘긴다(tick 끝·이벤트 루프 턴 끝 — 4.2b 배선).
//   - 배치 레코드(CONN_FRAMES·CONN_DELIVER·CONN_MULTICAST·CONN_DELIVER_SHARED)는 열린 봉투에 이어 붙이고, 봉투를 닫을 때(flush·
//     비배치 메시지·분할 임계·다른 배치 type) 길이 필드를 패칭한다. CONN_DELIVER_SHARED의 DEF 표는 봉투 범위다(봉투가 바뀌면 다시 정의).
//   - 모든 인자 검증을 기록 전에 끝낸다 — RangeError로 거절된 호출은 writer 상태를 바꾸지 않는다.
//   - 버퍼 소유권(4.0 교정 d — 꼬리 복사 대신 참조): copyBelowBytes 이상 flush는 쓰기 버퍼를 sink에 넘기고(release 동반)
//     다음 쓰기는 풀에서 새 버퍼를 꺼낸다. sink는 버퍼를 다 쓴 뒤 release를 1회 부르고(풀로 복귀 — 페이지 폴트·재할당 없음),
//     닫혀 버리면 부르지 않는다(GC). 작은 flush(턴 끝 소량)는 복사본을 넘기고 큰 버퍼를 계속 쓴다 — 수백 바이트를 위해
//     MB 버퍼를 대기열에 묶지 않게.

import type { LoginState } from "../identity/loginFlow";
import {
  ADMISSION_STATE,
  type ByeReason,
  type ConnClosedReason,
  type HelloNackReason,
  IPC_BYE_REASONS,
  IPC_CLIENT_FRAME_MIN_BYTES,
  IPC_CLOSED_REASONS,
  IPC_DEFAULT_BATCH_SPLIT_BYTES,
  IPC_DELIVER_RECORD_HEADER,
  IPC_ENVELOPE_HEADER_BYTES,
  IPC_FRAME_RECORD_HEADER,
  IPC_HELLO_FIXED_BYTES,
  IPC_KICK_REASONS,
  IPC_LEN_BYTES,
  IPC_LISTEN_BYTES,
  IPC_LISTEN_REPORT_BYTES,
  IPC_MSG,
  IPC_MULTICAST_MAX_IDS,
  IPC_MULTICAST_RECORD_FIXED,
  IPC_NACK_REASONS,
  IPC_SHARED_CONN_HEADER,
  IPC_SHARED_DEF_HEADER,
  IPC_SHARED_REF_HEADER,
  IPC_SHARED_TAG,
  IPC_TOKEN_MAX_BYTES,
  IPC_VERSION,
  LISTEN_MODES,
  LISTEN_REPORT_FLAG,
  type ListenMode,
  loginStateCode,
  resolveEnvelopeCap,
} from "./ipcSchema";
import type { SharedFrame } from "../net/sharedFrame";

export {
  IpcProtocolError,
  type IpcProtocolErrorKind,
  type IpcDecoder,
  type IpcDecoderOptions,
  createGatewaySideDecoder,
  createWorldSideDecoder,
} from "./ipcDecoder";

const U16_MAX = 0xffff;
const U32_MAX = 0xffffffff;
const ADDR_MAX_BYTES = 0xff;
const MIN_SPLIT_BYTES = 64;
const DEFAULT_INITIAL_CAPACITY = 64 * 1024;
const DEFAULT_COPY_BELOW_BYTES = 64 * 1024;
const DEFAULT_POOL_SIZE = 2;
/** 호스트가 리틀엔디언이면 MULTICAST localId 목록(Uint32Array)을 memcpy 1회로 쓴다(와이어 = LE). */
const HOST_LE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

function assertUint(v: number, max: number, name: string): void {
  if (!Number.isInteger(v) || v < 0 || v > max) throw new RangeError(`ipc ${name} out of range: ${v}`);
}

function assertMember(set: ReadonlySet<number>, v: number, name: string): void {
  if (!set.has(v)) throw new RangeError(`ipc ${name} not a known value: ${v}`);
}

/** 완성 클라 프레임 검사 — 클라 헤더(IPC_CLIENT_FRAME_MIN_BYTES = 4) 이상(기록 전 RangeError — 디코더도 미만을 거절한다). */
function assertClientFrame(len: number, what: string): void {
  if (len < IPC_CLIENT_FRAME_MIN_BYTES) throw new RangeError(`ipc ${what} shorter than a client header: ${len}`);
}

/** 공유 프레임 검사 — 완성 클라 프레임, patchOff는 u16, patchOff + 4 ≤ 길이(기록 전 RangeError). */
function assertPatchable(frame: SharedFrame): void {
  assertClientFrame(frame.bytes.length, "CONN_DELIVER_SHARED frame");
  assertUint(frame.patchOff, U16_MAX, "CONN_DELIVER_SHARED patchOff");
  if (frame.patchOff + 4 > frame.bytes.length) {
    throw new RangeError(`ipc CONN_DELIVER_SHARED patchOff ${frame.patchOff} + 4 exceeds frame of ${frame.bytes.length} bytes`);
  }
}

/** CONN_MULTICAST 레코드 1개의 바이트 — u32 len + frame + u16 n + u32 × n. */
export function multicastRecordBytes(frameBytes: number, count: number): number {
  return IPC_MULTICAST_RECORD_FIXED + frameBytes + 4 * count;
}

/** 2의 거듭제곱 올림(용량 힌트). */
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// ---------------------------------------------------------------------------------------------------------------------
// 송신

/**
 * flushTo 대상 — IpcPipe가 구조적으로 만족. buf 소유권은 sink로 넘어간다. release(있으면)는 sink가 buf를 끝까지 다 쓴 뒤
 * 정확히 1회 부른다(그 전에 닫히면 부르지 않는다). 반환 = 수락 여부(false = 닫힌 피어).
 */
export interface IpcByteSink {
  write(buf: Buffer, release?: () => void): boolean;
}

export interface IpcWriterOptions {
  /** 봉투 전체 상한(바이트, 기본 64 MiB) — 수신 측 디코더 상한과 같아야 한다. 테스트 축소용. */
  maxEnvelopeBytes?: number;
  /** 배치 봉투 분할 임계(len 기준, 기본 1 MiB·상한−4로 절삭). 임계보다 큰 레코드 하나는 단독 봉투. */
  batchSplitBytes?: number;
  /** 첫 쓰기 버퍼 용량(기본 64 KiB). 이후 큰 flush 크기로 힌트가 따라간다. */
  initialCapacity?: number;
  /** 이보다 작은 flush는 복사본을 넘긴다(기본 64 KiB). */
  copyBelowBytes?: number;
  /** release로 돌아온 버퍼를 보관할 개수(기본 2). */
  poolSize?: number;
}

/** 봉투 누적·패칭·버퍼 풀 — 방향별 메시지 메서드는 서브클래스. */
export class IpcBatchWriter {
  /** 현재 쓰기 버퍼 — begin* 호출 뒤에 읽는다(성장하면 교체된다). */
  protected out: Buffer = Buffer.alloc(0);
  private len = 0;
  /** 열린 배치 봉투의 type(0 = 없음)과 그 길이 필드 위치. */
  private batchType = 0;
  private batchAt = 0;
  /** 배치 봉투를 새로 열 때마다 +1 — 봉투 범위 상태(CONN_DELIVER_SHARED의 DEF 표)의 유효성 판정. */
  private serial = 0;
  private readonly free: Buffer[] = [];
  private capacityHint: number;
  private readonly maxEnvelope: number;
  private readonly splitBytes: number;
  private readonly initialCapacity: number;
  private readonly copyBelow: number;
  private readonly poolSize: number;

  constructor(opts: IpcWriterOptions = {}) {
    this.maxEnvelope = resolveEnvelopeCap(opts.maxEnvelopeBytes);
    const splitMax = this.maxEnvelope - IPC_LEN_BYTES;
    const split = opts.batchSplitBytes ?? Math.min(IPC_DEFAULT_BATCH_SPLIT_BYTES, splitMax);
    if (!Number.isInteger(split) || split < MIN_SPLIT_BYTES || split > splitMax) {
      throw new RangeError(`ipc batchSplitBytes must be an integer in [${MIN_SPLIT_BYTES}, ${splitMax}]: ${split}`);
    }
    this.splitBytes = split;
    this.initialCapacity = Math.max(1, opts.initialCapacity ?? DEFAULT_INITIAL_CAPACITY);
    this.copyBelow = opts.copyBelowBytes ?? DEFAULT_COPY_BELOW_BYTES;
    this.poolSize = opts.poolSize ?? DEFAULT_POOL_SIZE;
    this.capacityHint = this.initialCapacity;
  }

  /** 아직 flush하지 않은 바이트. */
  get bufferedBytes(): number {
    return this.len;
  }

  /** 열린 봉투를 닫고 쌓인 바이트를 sink에 넘긴다. 비었으면 쓰지 않고 true. 반환 = sink.write 결과. */
  flushTo(sink: IpcByteSink): boolean {
    this.closeBatch();
    const used = this.len;
    if (used === 0) return true;
    const buf = this.out;
    this.len = 0;
    if (used < this.copyBelow) return sink.write(Buffer.from(buf.subarray(0, used)));
    this.out = Buffer.alloc(0);
    this.capacityHint = Math.max(this.initialCapacity, nextPow2(used));
    return sink.write(buf.subarray(0, used), () => this.recycle(buf));
  }

  /** payload(배치 레코드 1개 포함)가 봉투 하나에 들어가는가 — 기록 전에 경로를 고르는 호출자용(MULTICAST → 연결별 DELIVER 폴백). */
  fits(payloadBytes: number): boolean {
    return IPC_ENVELOPE_HEADER_BYTES + payloadBytes <= this.maxEnvelope;
  }

  /** payload 크기 기록 가능 여부 — 봉투 상한 초과는 RangeError(기록 전 검사). */
  protected assertFits(payloadBytes: number, what: string): void {
    if (!this.fits(payloadBytes)) {
      throw new RangeError(`ipc ${what} of ${payloadBytes} bytes exceeds envelope cap ${this.maxEnvelope}`);
    }
  }

  /** 비배치 메시지 머리를 쓰고 payload 시작 offset을 돌려준다(열린 배치는 먼저 닫힌다). 검증 완료가 전제. */
  protected beginMessage(type: number, payloadBytes: number): number {
    this.closeBatch();
    const at = this.reserve(IPC_ENVELOPE_HEADER_BYTES + payloadBytes);
    this.out.writeUInt32LE(1 + payloadBytes, at);
    this.out[at + IPC_LEN_BYTES] = type;
    return at + IPC_ENVELOPE_HEADER_BYTES;
  }

  /** 열린 배치 봉투의 type(0 = 없음). */
  protected get openBatchType(): number {
    return this.batchType;
  }

  /** 지금(또는 마지막으로) 연 배치 봉투의 일련번호 — 봉투를 새로 열 때마다 바뀐다. */
  protected get batchSerial(): number {
    return this.serial;
  }

  /** recordBytes 레코드가 열린 type 봉투에 그대로 붙는가(beginRecord가 새 봉투를 열지 않는가). */
  protected fitsOpenBatch(type: number, recordBytes: number): boolean {
    return this.batchType === type && this.len - this.batchAt - IPC_LEN_BYTES + recordBytes <= this.splitBytes;
  }

  /** 배치 레코드 자리를 잡고 offset을 돌려준다 — 같은 type의 열린 봉투에 붙이되 분할 임계를 넘으면 새 봉투. */
  protected beginRecord(type: number, recordBytes: number): number {
    if (this.fitsOpenBatch(type, recordBytes)) return this.reserve(recordBytes);
    this.closeBatch();
    const at = this.reserve(IPC_ENVELOPE_HEADER_BYTES + recordBytes);
    this.out[at + IPC_LEN_BYTES] = type;
    this.batchType = type;
    this.batchAt = at;
    this.serial++;
    return at + IPC_ENVELOPE_HEADER_BYTES;
  }

  private closeBatch(): void {
    if (this.batchType === 0) return;
    this.out.writeUInt32LE(this.len - this.batchAt - IPC_LEN_BYTES, this.batchAt);
    this.batchType = 0;
  }

  private reserve(n: number): number {
    const at = this.len;
    const need = at + n;
    if (need > this.out.length) this.grow(need);
    this.len = need;
    return at;
  }

  private grow(need: number): void {
    const next = this.acquire(Math.max(need, this.out.length * 2, this.capacityHint));
    this.out.copy(next, 0, 0, this.len);
    this.out = next;
  }

  /** 풀에서 min 이상 버퍼를 꺼내거나 새로 할당. 맞는 게 없으면 풀(작아진 옛 버퍼)을 비운다. */
  private acquire(min: number): Buffer {
    for (let i = this.free.length - 1; i >= 0; i--) {
      const b = this.free[i]!;
      if (b.length >= min) {
        this.free.splice(i, 1);
        return b;
      }
    }
    this.free.length = 0;
    return Buffer.allocUnsafeSlow(min);
  }

  private recycle(buf: Buffer): void {
    if (this.free.length < this.poolSize) this.free.push(buf);
  }
}

/** 게이트웨이 → 월드 송신. */
export class GatewayIpcWriter extends IpcBatchWriter {
  /** token = 공유 비밀 IPC_TOKEN(미지정 = 빈 값, utf8 최대 255바이트). */
  hello(m: { gatewayId: number; incarnation: number; pid: number; token?: string }): void {
    assertUint(m.gatewayId, U16_MAX, "gatewayId");
    assertUint(m.incarnation, U32_MAX, "incarnation");
    assertUint(m.pid, U32_MAX, "pid");
    const token = m.token ?? "";
    const tokenBytes = Buffer.byteLength(token, "utf8");
    if (tokenBytes > IPC_TOKEN_MAX_BYTES) {
      throw new RangeError(`ipc HELLO token of ${tokenBytes} bytes exceeds ${IPC_TOKEN_MAX_BYTES}`);
    }
    const o = this.beginMessage(IPC_MSG.HELLO, IPC_HELLO_FIXED_BYTES + tokenBytes);
    const b = this.out;
    b.writeUInt16LE(IPC_VERSION, o);
    b.writeUInt16LE(m.gatewayId, o + 2);
    b.writeUInt32LE(m.incarnation, o + 4);
    b.writeUInt32LE(m.pid, o + 8);
    b[o + 12] = tokenBytes;
    b.write(token, o + IPC_HELLO_FIXED_BYTES, tokenBytes, "utf8");
  }

  ping(seq: number): void {
    assertUint(seq, U32_MAX, "seq");
    const o = this.beginMessage(IPC_MSG.PING, 4);
    this.out.writeUInt32LE(seq, o);
  }

  bye(reason: ByeReason): void {
    assertMember(IPC_BYE_REASONS, reason, "BYE reason");
    const o = this.beginMessage(IPC_MSG.BYE, 1);
    this.out[o] = reason;
  }

  /** 클라 리슨 상태 스냅샷(v14) — 보통 긴급 송신용 writer에 쓴다(gatewayCore). */
  listenReport(r: { shared: boolean; closed: boolean; listening: boolean; port: number; ackSeq: number }): void {
    assertUint(r.port, U16_MAX, "LISTEN_REPORT port");
    assertUint(r.ackSeq, U32_MAX, "LISTEN_REPORT ackSeq");
    const flags =
      (r.shared ? LISTEN_REPORT_FLAG.Shared : 0) |
      (r.closed ? LISTEN_REPORT_FLAG.Closed : 0) |
      (r.listening ? LISTEN_REPORT_FLAG.Listening : 0);
    const o = this.beginMessage(IPC_MSG.LISTEN_REPORT, IPC_LISTEN_REPORT_BYTES);
    this.out[o] = flags;
    this.out.writeUInt16LE(r.port, o + 1);
    this.out.writeUInt32LE(r.ackSeq, o + 3);
  }

  connOpen(localId: number, addr: string): void {
    assertUint(localId, U32_MAX, "localId");
    const addrBytes = Buffer.byteLength(addr, "utf8");
    if (addrBytes > ADDR_MAX_BYTES) throw new RangeError(`ipc CONN_OPEN addr of ${addrBytes} bytes exceeds ${ADDR_MAX_BYTES}`);
    const o = this.beginMessage(IPC_MSG.CONN_OPEN, 5 + addrBytes);
    const b = this.out;
    b.writeUInt32LE(localId, o);
    b[o + 4] = addrBytes;
    b.write(addr, o + 5, addrBytes, "utf8");
  }

  /** 클라 프레임 1개(헤더 제외 본문) — 열린 CONN_FRAMES 봉투에 붙는다. body는 복사된다. */
  frame(localId: number, packetId: number, body: Uint8Array): void {
    assertUint(localId, U32_MAX, "localId");
    assertUint(packetId, U16_MAX, "packetId");
    const recordBytes = IPC_FRAME_RECORD_HEADER + body.length;
    this.assertFits(recordBytes, "CONN_FRAMES record");
    const o = this.beginRecord(IPC_MSG.CONN_FRAMES, recordBytes);
    const b = this.out;
    b.writeUInt32LE(localId, o);
    b.writeUInt16LE(packetId, o + 4);
    b.writeUInt32LE(body.length, o + 6);
    b.set(body, o + IPC_FRAME_RECORD_HEADER);
  }

  connClosed(localId: number, reason: ConnClosedReason): void {
    assertUint(localId, U32_MAX, "localId");
    assertMember(IPC_CLOSED_REASONS, reason, "CONN_CLOSED reason");
    const o = this.beginMessage(IPC_MSG.CONN_CLOSED, 5);
    this.out.writeUInt32LE(localId, o);
    this.out[o + 4] = reason;
  }
}

/** 월드 → 게이트웨이 송신. */
export class WorldIpcWriter extends IpcBatchWriter {
  /** 열린 CONN_DELIVER_SHARED 봉투에 정의한 공유 프레임 → ref, ref → 정의 당시 epoch. defSerial 봉투에서만 유효. */
  private readonly defRefs = new Map<SharedFrame, number>();
  private readonly defEpochs: number[] = [];
  private defSerial = -1;

  helloAck(m: { worldIncarnation: number; connCap: number }): void {
    assertUint(m.worldIncarnation, U32_MAX, "worldIncarnation");
    assertUint(m.connCap, U32_MAX, "connCap");
    const o = this.beginMessage(IPC_MSG.HELLO_ACK, 10);
    const b = this.out;
    b.writeUInt16LE(IPC_VERSION, o);
    b.writeUInt32LE(m.worldIncarnation, o + 2);
    b.writeUInt32LE(m.connCap, o + 6);
  }

  /** HELLO 거절 — 첫 메시지(HELLO_ACK 자리). 레이아웃은 모든 버전 고정. */
  helloNack(reason: HelloNackReason): void {
    assertMember(IPC_NACK_REASONS, reason, "HELLO_NACK reason");
    const o = this.beginMessage(IPC_MSG.HELLO_NACK, 3);
    this.out.writeUInt16LE(IPC_VERSION, o);
    this.out[o + 2] = reason;
  }

  pong(seq: number): void {
    assertUint(seq, U32_MAX, "seq");
    const o = this.beginMessage(IPC_MSG.PONG, 4);
    this.out.writeUInt32LE(seq, o);
  }

  shutdown(kickReason: number): void {
    assertMember(IPC_KICK_REASONS, kickReason, "SHUTDOWN kickReason");
    const o = this.beginMessage(IPC_MSG.SHUTDOWN, 1);
    this.out[o] = kickReason;
  }

  /** 이 피어의 신규 접속 판정(v3) — 보통 긴급 송신용 writer에 쓴다(GatewayPeer). */
  admission(busy: boolean): void {
    const o = this.beginMessage(IPC_MSG.ADMISSION, 1);
    this.out[o] = busy ? ADMISSION_STATE.Busy : ADMISSION_STATE.Open;
  }

  /** 공유 포트 리스너 양보 지시(v14) — seq 1..u32. 보통 긴급 송신용 writer에 쓴다(GatewayPeer). */
  listen(mode: ListenMode, seq: number): void {
    if (!Number.isInteger(seq) || seq < 1 || seq > U32_MAX) throw new RangeError(`ipc LISTEN seq out of range: ${seq}`);
    const code = LISTEN_MODES.indexOf(mode);
    if (code < 0) throw new RangeError(`ipc LISTEN unknown mode: ${String(mode)}`);
    const o = this.beginMessage(IPC_MSG.LISTEN, IPC_LISTEN_BYTES);
    this.out[o] = code;
    this.out.writeUInt32LE(seq, o + 1);
  }

  /**
   * 완성 클라 프레임(1개 이상 연접) — 열린 CONN_DELIVER 봉투에 붙는다. CONN_DELIVER_SHARED 봉투가 열려 있으면 그 봉투의 CONN 레코드로
   * 붙는다(v5 — 봉투를 닫으면 다음 공유 참조가 DEF를 다시 써야 한다). bytes는 복사된다.
   */
  deliver(localId: number, bytes: Uint8Array): void {
    assertUint(localId, U32_MAX, "localId");
    const o = this.plainRecord(localId, bytes.length); // 먼저 — 자리를 잡으며 버퍼가 바뀔 수 있다.
    this.out.set(bytes, o);
  }

  /**
   * inline 뒤 frame(patchOff에 value)을 평문 송신 1건으로 — deliver(inline + 패치한 frame)과 같은 레코드(v5). 피어가 혼자 받는 공유 프레임을
   * 참조 대신 이렇게 쓴다(DEF + CONN_REF가 16바이트 더 든다). 복사·패치는 writer 버퍼 위에서 1회.
   */
  deliverPatched(localId: number, inline: Uint8Array, frame: SharedFrame, value: number): void {
    assertUint(localId, U32_MAX, "localId");
    assertPatchable(frame);
    const o = this.plainRecord(localId, inline.length + frame.bytes.length);
    this.out.set(inline, o);
    frame.copyPatchedTo(this.out, o + inline.length, value);
  }

  /** frame이 열린 CONN_DELIVER_SHARED 봉투에 같은 epoch로 정의돼 있나(참조가 DEF를 다시 쓰지 않는가 — 분할 임계 전이면). */
  hasShared(frame: SharedFrame): boolean {
    return this.openBatchType === IPC_MSG.CONN_DELIVER_SHARED && this.definedRef(frame) >= 0;
  }

  /**
   * 같은 완성 클라 프레임(1개 이상 연접)을 localIds[start, start+count) 연결들에(v4) — 열린 CONN_MULTICAST 봉투에 붙는다. frame·id는
   * 복사된다. count는 1..IPC_MULTICAST_MAX_IDS(넘으면 호출자가 나눈다), frame은 완성 클라 프레임(클라 헤더 4바이트 이상)이어야 한다.
   */
  multicast(frame: Uint8Array, localIds: Uint32Array, start: number, count: number): void {
    assertClientFrame(frame.length, "CONN_MULTICAST frame");
    if (!Number.isInteger(count) || count < 1 || count > IPC_MULTICAST_MAX_IDS) {
      throw new RangeError(`ipc CONN_MULTICAST count out of range: ${count}`);
    }
    assertUint(start, localIds.length - count, "CONN_MULTICAST start");
    const recordBytes = multicastRecordBytes(frame.length, count);
    this.assertFits(recordBytes, "CONN_MULTICAST record");
    const o = this.beginRecord(IPC_MSG.CONN_MULTICAST, recordBytes);
    const b = this.out;
    b.writeUInt32LE(frame.length, o);
    b.set(frame, o + 4);
    const at = o + 4 + frame.length;
    b.writeUInt16LE(count, at);
    if (HOST_LE) {
      b.set(new Uint8Array(localIds.buffer, localIds.byteOffset + 4 * start, 4 * count), at + 2);
      return;
    }
    for (let i = 0; i < count; i++) b.writeUInt32LE(localIds[start + i]!, at + 2 + 4 * i);
  }

  /**
   * 공유 프레임 참조 송신(v5 CONN_DELIVER_SHARED) — 그 연결에 inline(완성 프레임 0개 이상) 뒤 frame(patchOff에 value u32 LE)을 1건으로.
   * frame이 열린 0x96 봉투에 아직 없으면(또는 재발급돼 epoch가 다르면) DEF를 CONN_REF 바로 앞, 같은 봉투에 쓴다. 반환 = DEF를 썼나.
   * inline·frame은 복사된다. 검증(localId·patchOff·봉투 상한)은 기록 전 — RangeError면 상태 불변.
   */
  deliverShared(localId: number, inline: Uint8Array, frame: SharedFrame, value: number): boolean {
    assertUint(localId, U32_MAX, "localId");
    assertPatchable(frame);
    const f = frame.bytes;
    const connBytes = IPC_SHARED_REF_HEADER + inline.length;
    const defBytes = IPC_SHARED_DEF_HEADER + f.length;
    this.assertFits(defBytes + connBytes, "CONN_DELIVER_SHARED record");
    const known = this.definedRef(frame);
    if (known >= 0 && this.fitsOpenBatch(IPC_MSG.CONN_DELIVER_SHARED, connBytes)) {
      this.writeRef(this.beginRecord(IPC_MSG.CONN_DELIVER_SHARED, connBytes), localId, known, value, inline);
      return false;
    }
    const o = this.beginRecord(IPC_MSG.CONN_DELIVER_SHARED, defBytes + connBytes);
    const ref = this.define(frame);
    const b = this.out;
    b[o] = IPC_SHARED_TAG.DEF;
    b.writeUInt32LE(f.length, o + 1);
    b.writeUInt16LE(frame.patchOff, o + 5);
    b.set(f, o + IPC_SHARED_DEF_HEADER);
    this.writeRef(o + defBytes, localId, ref, value, inline);
    return true;
  }

  /** flush 창의 끝(v4) — 게이트웨이가 MULTICAST로 미뤄 둔 연결별 바이트를 쓴다. 비배치 메시지(열린 봉투를 닫는다). */
  connFlush(): void {
    this.beginMessage(IPC_MSG.CONN_FLUSH, 0);
  }

  connState(localId: number, state: LoginState): void {
    assertUint(localId, U32_MAX, "localId");
    const code = loginStateCode(state);
    if (code < 0) throw new RangeError(`ipc CONN_STATE unknown login state: ${String(state)}`);
    const o = this.beginMessage(IPC_MSG.CONN_STATE, 5);
    this.out.writeUInt32LE(localId, o);
    this.out[o + 4] = code;
  }

  connClose(localId: number): void {
    assertUint(localId, U32_MAX, "localId");
    const o = this.beginMessage(IPC_MSG.CONN_CLOSE, 4);
    this.out.writeUInt32LE(localId, o);
  }

  connAccepted(localId: number, worldConnId: number): void {
    assertUint(localId, U32_MAX, "localId");
    assertUint(worldConnId, U32_MAX, "worldConnId");
    const o = this.beginMessage(IPC_MSG.CONN_ACCEPTED, 8);
    this.out.writeUInt32LE(localId, o);
    this.out.writeUInt32LE(worldConnId, o + 4);
  }

  /**
   * 평문 송신 레코드 머리를 쓰고 len바이트 본문 자리의 offset을 돌려준다(localId 검증 끝이 전제) — 열린 0x96 봉투면 그 봉투의 CONN 레코드
   * (봉투를 닫으면 다음 공유 참조가 DEF를 다시 써야 한다), 아니면 CONN_DELIVER.
   */
  private plainRecord(localId: number, len: number): number {
    if (this.openBatchType === IPC_MSG.CONN_DELIVER_SHARED) {
      this.assertFits(IPC_SHARED_CONN_HEADER + len, "CONN_DELIVER_SHARED record");
      const o = this.beginRecord(IPC_MSG.CONN_DELIVER_SHARED, IPC_SHARED_CONN_HEADER + len);
      const b = this.out;
      b[o] = IPC_SHARED_TAG.CONN;
      b.writeUInt32LE(localId, o + 1);
      b.writeUInt32LE(len, o + 5);
      return o + IPC_SHARED_CONN_HEADER;
    }
    this.assertFits(IPC_DELIVER_RECORD_HEADER + len, "CONN_DELIVER record");
    const o = this.beginRecord(IPC_MSG.CONN_DELIVER, IPC_DELIVER_RECORD_HEADER + len);
    this.out.writeUInt32LE(localId, o);
    this.out.writeUInt32LE(len, o + 4);
    return o + IPC_DELIVER_RECORD_HEADER;
  }

  private writeRef(o: number, localId: number, ref: number, value: number, inline: Uint8Array): void {
    const b = this.out;
    b[o] = IPC_SHARED_TAG.CONN_REF;
    b.writeUInt32LE(localId, o + 1);
    b.writeUInt32LE(ref, o + 5);
    b.writeUInt32LE(value >>> 0, o + 9);
    b.writeUInt32LE(inline.length, o + 13);
    b.set(inline, o + IPC_SHARED_REF_HEADER);
  }

  /** frame의 ref — 열린(또는 마지막) 봉투에 같은 epoch로 정의돼 있을 때만, 아니면 -1. 봉투가 열려 있는지는 호출자(fitsOpenBatch)가 본다. */
  private definedRef(frame: SharedFrame): number {
    if (this.defSerial !== this.batchSerial) return -1;
    const ref = this.defRefs.get(frame);
    return ref !== undefined && this.defEpochs[ref] === frame.epoch ? ref : -1;
  }

  /** 지금 봉투(beginRecord 직후)에 frame을 새 ref로 정의한다 — 봉투가 바뀌었으면 표를 비운다. */
  private define(frame: SharedFrame): number {
    if (this.defSerial !== this.batchSerial) {
      this.defRefs.clear();
      this.defEpochs.length = 0;
      this.defSerial = this.batchSerial;
    }
    const ref = this.defEpochs.length;
    this.defEpochs.push(frame.epoch);
    this.defRefs.set(frame, ref);
    return ref;
  }
}
