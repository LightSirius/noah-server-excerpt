// 월드 ↔ 게이트웨이 IPC 수신 — 스트리밍 디코더(성능 4단계 4.2, 4.5 F2에서 ipcCodec.ts에서 분리). 레이아웃·불변식은 ipcSchema.ts
// 상단, 송신(BatchWriter)은 ipcCodec.ts — 호출자는 계속 ipcCodec에서 import한다(재수출).
//
//   - 청크마다 완성 봉투는 청크 위에서 바로 디코드(복사 0), 걸친 봉투만 RingByteBuffer에 "완성에 필요한 만큼만" 복사한다 —
//     링은 미완성 봉투 1개만 담는다(링 상한 = 봉투 상한 64 MiB, 청크 크기 무관).
//   - 봉투 길이는 헤더 4바이트가 오는 즉시 검사한다(상한 초과 본문을 버퍼링하지 않음). 핸드셰이크 전 상한은
//     IPC_HANDSHAKE_MAX_ENVELOPE_BYTES(1 KiB) — 인증 전 상대가 64 MiB 봉투를 주장해 링을 채우지 못한다.
//   - 핸드셰이크: 첫 메시지는 HELLO(월드 측)·HELLO_ACK(게이트웨이 측)이고 ipcVer = IPC_VERSION이어야 한다. 이후 재전송 금지.
//     게이트웨이 측은 HELLO_ACK 대신 HELLO_NACK(거절 사유)도 받는다 — 버전과 무관하게 읽고, 내보낸 뒤 디코더는 멈춘다(종단).
//   - 위반은 IpcProtocolError(kind) — 이후 push도 같은 오류를 던진다(호출자는 피어를 끊는다). 메시지 콜백의 예외는 그대로
//     전파하고 디코더를 실패 상태(decoder_failed)로 고정한다(스트림 위치를 보장할 수 없음). 콜백 안 destroy()는 남은 봉투를
//     내보내지 않는다.
//   - 메시지의 Buffer 필드(body·bytes)는 콜백 동안만 유효한 뷰 — 보관하려면 복사. MULTICAST localIds는 디코더가 복사한 배열.
//     CONN_DELIVER_SHARED의 DEF는 같은 봉투 안에서만 참조된다(ref = 봉투 안 DEF 순번 — 봉투를 넘는 상태 없음).

import { RingByteBuffer } from "../net/ringBuffer";
import {
  ADMISSION_STATE,
  type ByeReason,
  type ConnCast,
  type ConnClosedReason,
  type ConnDeliverMsg,
  type ConnDeliverSharedMsg,
  type ConnDelivery,
  type ConnFrame,
  type ConnFramesMsg,
  type ConnMulticastMsg,
  type ConnOpenMsg,
  type GatewayToWorldMsg,
  type HelloMsg,
  type HelloNackReason,
  IPC_ADMISSION_STATES,
  IPC_BYE_REASONS,
  IPC_CLIENT_FRAME_MIN_BYTES,
  IPC_CLOSED_REASONS,
  IPC_DELIVER_RECORD_HEADER,
  IPC_FRAME_RECORD_HEADER,
  IPC_HANDSHAKE_MAX_ENVELOPE_BYTES,
  IPC_HELLO_FIXED_BYTES,
  IPC_KICK_REASONS,
  IPC_LEN_BYTES,
  IPC_LISTEN_BYTES,
  IPC_LISTEN_REPORT_BYTES,
  IPC_LOGIN_STATES,
  IPC_MSG,
  IPC_MULTICAST_RECORD_FIXED,
  IPC_NACK_REASONS,
  IPC_SHARED_CONN_HEADER,
  IPC_SHARED_DEF_HEADER,
  IPC_SHARED_REF_HEADER,
  IPC_SHARED_TAG,
  IPC_VERSION,
  type IpcDirection,
  LISTEN_MODES,
  LISTEN_REPORT_FLAG,
  LISTEN_REPORT_FLAGS_MASK,
  type ListenMsg,
  type ListenReportMsg,
  type SharedDef,
  type SharedDelivery,
  type WorldToGatewayMsg,
  ipcTypesOf,
  isReservedIpcType,
  resolveEnvelopeCap,
} from "./ipcSchema";

export type IpcProtocolErrorKind =
  | "envelope_too_large"
  | "envelope_empty"
  | "unknown_type"
  | "reserved_type"
  | "wrong_direction"
  | "malformed"
  | "handshake_expected"
  | "duplicate_handshake"
  | "version_mismatch"
  | "decoder_failed";

/** IPC 스트림 위반 — 피어를 끊을 근거. */
export class IpcProtocolError extends Error {
  readonly kind: IpcProtocolErrorKind;
  /** version_mismatch일 때 상대가 보낸 ipcVer. */
  readonly peerVersion: number | undefined;

  constructor(kind: IpcProtocolErrorKind, detail: string, peerVersion?: number) {
    super(`ipc ${kind}: ${detail}`);
    this.name = "IpcProtocolError";
    this.kind = kind;
    this.peerVersion = peerVersion;
  }
}

const RING_INITIAL_CAPACITY = 64 * 1024;
/** 호스트가 리틀엔디언이면 MULTICAST localId 목록(와이어 LE)을 memcpy 1회로 읽는다. */
const HOST_LE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

export interface IpcDecoderOptions {
  /** 봉투 전체 상한(기본 64 MiB = 수신 링 상한). 송신 writer와 같은 값. */
  maxEnvelopeBytes?: number;
}

export interface IpcDecoder {
  /** 수신 청크 투입 — 완성 봉투마다 콜백. chunk는 반환 뒤 재사용돼도 된다. 위반은 IpcProtocolError. */
  push(chunk: Buffer): void;
  /** 이후 push 무시(콜백 안에서 불러도 남은 봉투를 내보내지 않는다). */
  destroy(): void;
  /** 위반·콜백 예외로 실패 상태인가. */
  readonly failed: boolean;
  /** 수신 링 용량(진단·테스트). */
  readonly ringCapacity: number;
}

function malformed(detail: string): IpcProtocolError {
  return new IpcProtocolError("malformed", detail);
}

function expectLength(p: Buffer, n: number, name: string): void {
  if (p.length !== n) throw malformed(`${name} payload must be ${n} bytes, got ${p.length}`);
}

function expectMember(set: ReadonlySet<number>, v: number, name: string): number {
  if (!set.has(v)) throw malformed(`${name} not a known value: ${v}`);
  return v;
}

function decodeHello(p: Buffer): HelloMsg {
  if (p.length < IPC_HELLO_FIXED_BYTES) throw malformed(`HELLO payload too short: ${p.length}`);
  const end = IPC_HELLO_FIXED_BYTES + p[12]!;
  expectLength(p, end, "HELLO");
  return {
    type: IPC_MSG.HELLO,
    ipcVer: p.readUInt16LE(0),
    gatewayId: p.readUInt16LE(2),
    incarnation: p.readUInt32LE(4),
    pid: p.readUInt32LE(8),
    token: p.subarray(IPC_HELLO_FIXED_BYTES, end),
  };
}

/** LISTEN_REPORT {u8 flags, u16 port, u32 ackSeq} — 정의 밖 flags 비트는 malformed(v14). */
function decodeListenReport(p: Buffer): ListenReportMsg {
  expectLength(p, IPC_LISTEN_REPORT_BYTES, "LISTEN_REPORT");
  const flags = p[0]!;
  if ((flags & ~LISTEN_REPORT_FLAGS_MASK) !== 0) throw malformed(`LISTEN_REPORT unknown flag bits: 0x${flags.toString(16)}`);
  return {
    type: IPC_MSG.LISTEN_REPORT,
    shared: (flags & LISTEN_REPORT_FLAG.Shared) !== 0,
    closed: (flags & LISTEN_REPORT_FLAG.Closed) !== 0,
    listening: (flags & LISTEN_REPORT_FLAG.Listening) !== 0,
    port: p.readUInt16LE(1),
    ackSeq: p.readUInt32LE(3),
  };
}

/** LISTEN {u8 mode, u32 seq} — 모르는 mode·seq 0은 malformed(v14). */
function decodeListen(p: Buffer): ListenMsg {
  expectLength(p, IPC_LISTEN_BYTES, "LISTEN");
  const mode = LISTEN_MODES[p[0]!];
  if (mode === undefined) throw malformed(`LISTEN mode not a known value: ${p[0]}`);
  const seq = p.readUInt32LE(1);
  if (seq === 0) throw malformed("LISTEN seq must start at 1");
  return { type: IPC_MSG.LISTEN, mode, seq };
}

function decodeConnOpen(p: Buffer): ConnOpenMsg {
  if (p.length < 5) throw malformed(`CONN_OPEN payload too short: ${p.length}`);
  const addrLen = p[4]!;
  expectLength(p, 5 + addrLen, "CONN_OPEN");
  return { type: IPC_MSG.CONN_OPEN, localId: p.readUInt32LE(0), addr: p.toString("utf8", 5, 5 + addrLen) };
}

function decodeConnFrames(p: Buffer): ConnFramesMsg {
  const frames: ConnFrame[] = [];
  let off = 0;
  while (off < p.length) {
    if (p.length - off < IPC_FRAME_RECORD_HEADER) throw malformed("CONN_FRAMES record header truncated");
    const end = off + IPC_FRAME_RECORD_HEADER + p.readUInt32LE(off + 6);
    if (end > p.length) throw malformed("CONN_FRAMES body overruns envelope");
    frames.push({ localId: p.readUInt32LE(off), packetId: p.readUInt16LE(off + 4), body: p.subarray(off + IPC_FRAME_RECORD_HEADER, end) });
    off = end;
  }
  if (frames.length === 0) throw malformed("empty CONN_FRAMES batch");
  return { type: IPC_MSG.CONN_FRAMES, frames };
}

function decodeConnDeliver(p: Buffer): ConnDeliverMsg {
  const deliveries: ConnDelivery[] = [];
  let off = 0;
  while (off < p.length) {
    if (p.length - off < IPC_DELIVER_RECORD_HEADER) throw malformed("CONN_DELIVER record header truncated");
    const end = off + IPC_DELIVER_RECORD_HEADER + p.readUInt32LE(off + 4);
    if (end > p.length) throw malformed("CONN_DELIVER bytes overrun envelope");
    deliveries.push({ localId: p.readUInt32LE(off), bytes: p.subarray(off + IPC_DELIVER_RECORD_HEADER, end) });
    off = end;
  }
  if (deliveries.length === 0) throw malformed("empty CONN_DELIVER batch");
  return { type: IPC_MSG.CONN_DELIVER, deliveries };
}

/** MULTICAST 레코드 1개 — {u32 len, bytes, u16 n, u32[n] localIds}. 반환 = 다음 offset. */
function decodeCastRecord(p: Buffer, off: number, out: ConnCast[]): number {
  if (p.length - off < IPC_MULTICAST_RECORD_FIXED) throw malformed("CONN_MULTICAST record truncated");
  const len = p.readUInt32LE(off);
  if (len < IPC_CLIENT_FRAME_MIN_BYTES) throw malformed(`CONN_MULTICAST frame shorter than a client header: ${len}`);
  const bytesEnd = off + 4 + len;
  if (bytesEnd + 2 > p.length) throw malformed("CONN_MULTICAST bytes overrun envelope");
  const n = p.readUInt16LE(bytesEnd);
  if (n === 0) throw malformed("CONN_MULTICAST has no recipients");
  const end = bytesEnd + 2 + 4 * n;
  if (end > p.length) throw malformed("CONN_MULTICAST localIds overrun envelope");
  const localIds = new Uint32Array(n);
  if (HOST_LE) new Uint8Array(localIds.buffer).set(p.subarray(bytesEnd + 2, end));
  else for (let i = 0; i < n; i++) localIds[i] = p.readUInt32LE(bytesEnd + 2 + 4 * i);
  out.push({ bytes: p.subarray(off + 4, bytesEnd), localIds });
  return end;
}

function decodeConnMulticast(p: Buffer): ConnMulticastMsg {
  const casts: ConnCast[] = [];
  let off = 0;
  while (off < p.length) off = decodeCastRecord(p, off, casts);
  if (casts.length === 0) throw malformed("empty CONN_MULTICAST batch");
  return { type: IPC_MSG.CONN_MULTICAST, casts };
}

/** CONN_DELIVER_SHARED DEF {u32 len, u16 patchOff, bytes} — off는 tag 다음. 반환 = 다음 offset. */
function decodeSharedDef(p: Buffer, off: number, defs: SharedDef[]): number {
  if (p.length - off < IPC_SHARED_DEF_HEADER - 1) throw malformed("CONN_DELIVER_SHARED DEF header truncated");
  const len = p.readUInt32LE(off);
  const patchOff = p.readUInt16LE(off + 4);
  const start = off + IPC_SHARED_DEF_HEADER - 1;
  if (len < IPC_CLIENT_FRAME_MIN_BYTES) throw malformed(`CONN_DELIVER_SHARED DEF shorter than a client header: ${len}`);
  if (patchOff + 4 > len) throw malformed(`CONN_DELIVER_SHARED DEF patchOff ${patchOff} + 4 exceeds ${len} bytes`);
  if (start + len > p.length) throw malformed("CONN_DELIVER_SHARED DEF bytes overrun envelope");
  defs.push({ bytes: p.subarray(start, start + len), patchOff });
  return start + len;
}

/** CONN {u32 localId, u32 len, bytes} 또는 CONN_REF {u32 localId, u32 ref, u32 value, u32 len, bytes} — off는 tag 다음. */
function decodeSharedConn(p: Buffer, off: number, ref: boolean, defs: readonly SharedDef[], out: SharedDelivery[]): number {
  const head = (ref ? IPC_SHARED_REF_HEADER : IPC_SHARED_CONN_HEADER) - 1;
  if (p.length - off < head) throw malformed("CONN_DELIVER_SHARED record header truncated");
  const localId = p.readUInt32LE(off);
  const end = off + head + p.readUInt32LE(off + head - 4);
  if (end > p.length) throw malformed("CONN_DELIVER_SHARED bytes overrun envelope");
  const bytes = p.subarray(off + head, end);
  if (!ref) {
    out.push({ localId, bytes, def: null, value: 0 });
    return end;
  }
  const def = defs[p.readUInt32LE(off + 4)];
  if (def === undefined) throw malformed("CONN_DELIVER_SHARED ref names no earlier DEF in this envelope");
  out.push({ localId, bytes, def, value: p.readUInt32LE(off + 8) });
  return end;
}

function decodeConnDeliverShared(p: Buffer): ConnDeliverSharedMsg {
  const defs: SharedDef[] = [];
  const deliveries: SharedDelivery[] = [];
  let off = 0;
  while (off < p.length) {
    const tag = p[off]!;
    if (tag === IPC_SHARED_TAG.DEF) off = decodeSharedDef(p, off + 1, defs);
    else if (tag === IPC_SHARED_TAG.CONN || tag === IPC_SHARED_TAG.CONN_REF) {
      off = decodeSharedConn(p, off + 1, tag === IPC_SHARED_TAG.CONN_REF, defs, deliveries);
    } else throw malformed(`CONN_DELIVER_SHARED unknown record tag ${tag}`);
  }
  if (deliveries.length === 0) throw malformed("CONN_DELIVER_SHARED batch has no connection records");
  return { type: IPC_MSG.CONN_DELIVER_SHARED, deliveries, defCount: defs.length };
}

/** 게이트웨이 → 월드 payload 디코드(type은 방향 검사 통과분). */
function decodeGatewayToWorld(type: number, p: Buffer): GatewayToWorldMsg {
  switch (type) {
    case IPC_MSG.HELLO:
      return decodeHello(p);
    case IPC_MSG.PING:
      expectLength(p, 4, "PING");
      return { type: IPC_MSG.PING, seq: p.readUInt32LE(0) };
    case IPC_MSG.BYE:
      expectLength(p, 1, "BYE");
      return { type: IPC_MSG.BYE, reason: expectMember(IPC_BYE_REASONS, p[0]!, "BYE reason") as ByeReason };
    case IPC_MSG.LISTEN_REPORT:
      return decodeListenReport(p);
    case IPC_MSG.CONN_OPEN:
      return decodeConnOpen(p);
    case IPC_MSG.CONN_FRAMES:
      return decodeConnFrames(p);
    case IPC_MSG.CONN_CLOSED: {
      expectLength(p, 5, "CONN_CLOSED");
      const reason = expectMember(IPC_CLOSED_REASONS, p[4]!, "CONN_CLOSED reason") as ConnClosedReason;
      return { type: IPC_MSG.CONN_CLOSED, localId: p.readUInt32LE(0), reason };
    }
    default:
      throw new IpcProtocolError("unknown_type", `0x${type.toString(16)}`);
  }
}

/** 월드 → 게이트웨이 연결 단위 메시지(STATE·CLOSE·ACCEPTED) — 그 밖은 null. */
function decodeConnControl(type: number, p: Buffer): WorldToGatewayMsg | null {
  switch (type) {
    case IPC_MSG.CONN_STATE: {
      expectLength(p, 5, "CONN_STATE");
      const state = IPC_LOGIN_STATES[p[4]!];
      if (state === undefined) throw malformed(`CONN_STATE state not a known value: ${p[4]}`);
      return { type: IPC_MSG.CONN_STATE, localId: p.readUInt32LE(0), state };
    }
    case IPC_MSG.CONN_CLOSE:
      expectLength(p, 4, "CONN_CLOSE");
      return { type: IPC_MSG.CONN_CLOSE, localId: p.readUInt32LE(0) };
    case IPC_MSG.CONN_ACCEPTED:
      expectLength(p, 8, "CONN_ACCEPTED");
      return { type: IPC_MSG.CONN_ACCEPTED, localId: p.readUInt32LE(0), worldConnId: p.readUInt32LE(4) };
    default:
      return null;
  }
}

/** 월드 → 게이트웨이 payload 디코드(type은 방향 검사 통과분). */
function decodeWorldToGateway(type: number, p: Buffer): WorldToGatewayMsg {
  switch (type) {
    case IPC_MSG.HELLO_ACK:
      expectLength(p, 10, "HELLO_ACK");
      return { type: IPC_MSG.HELLO_ACK, ipcVer: p.readUInt16LE(0), worldIncarnation: p.readUInt32LE(2), connCap: p.readUInt32LE(6) };
    case IPC_MSG.HELLO_NACK: {
      expectLength(p, 3, "HELLO_NACK");
      const reason = expectMember(IPC_NACK_REASONS, p[2]!, "HELLO_NACK reason") as HelloNackReason;
      return { type: IPC_MSG.HELLO_NACK, ipcVer: p.readUInt16LE(0), reason };
    }
    case IPC_MSG.PONG:
      expectLength(p, 4, "PONG");
      return { type: IPC_MSG.PONG, seq: p.readUInt32LE(0) };
    case IPC_MSG.SHUTDOWN:
      expectLength(p, 1, "SHUTDOWN");
      return { type: IPC_MSG.SHUTDOWN, kickReason: expectMember(IPC_KICK_REASONS, p[0]!, "SHUTDOWN kickReason") };
    case IPC_MSG.CONN_DELIVER:
      return decodeConnDeliver(p);
    case IPC_MSG.CONN_MULTICAST:
      return decodeConnMulticast(p);
    case IPC_MSG.CONN_DELIVER_SHARED:
      return decodeConnDeliverShared(p);
    case IPC_MSG.CONN_FLUSH:
      expectLength(p, 0, "CONN_FLUSH");
      return { type: IPC_MSG.CONN_FLUSH };
    case IPC_MSG.ADMISSION:
      expectLength(p, 1, "ADMISSION");
      return { type: IPC_MSG.ADMISSION, busy: expectMember(IPC_ADMISSION_STATES, p[0]!, "ADMISSION state") === ADMISSION_STATE.Busy };
    case IPC_MSG.LISTEN:
      return decodeListen(p);
    default: {
      const control = decodeConnControl(type, p);
      if (control !== null) return control;
      throw new IpcProtocolError("unknown_type", `0x${type.toString(16)}`);
    }
  }
}

interface DirectionSpec<M> {
  readonly direction: IpcDirection;
  readonly handshakeType: number;
  /** 핸드셰이크 대신 올 수 있는 거절 메시지(게이트웨이 측 HELLO_NACK) — 버전 무관, 내보낸 뒤 디코더 종단. 없으면 null. */
  readonly refusalType: number | null;
  readonly decode: (type: number, payload: Buffer) => M;
}

class IpcStreamDecoder<M> implements IpcDecoder {
  private readonly ring: RingByteBuffer;
  private readonly maxEnvelope: number;
  private readonly types: ReadonlySet<number>;
  private readonly otherTypes: ReadonlySet<number>;
  private handshaken = false;
  private error: IpcProtocolError | null = null;
  private destroyed = false;

  constructor(
    private readonly spec: DirectionSpec<M>,
    private readonly onMessage: (msg: M) => void,
    opts: IpcDecoderOptions,
  ) {
    this.maxEnvelope = resolveEnvelopeCap(opts.maxEnvelopeBytes);
    this.ring = new RingByteBuffer(Math.min(RING_INITIAL_CAPACITY, this.maxEnvelope), { maxCapacity: this.maxEnvelope });
    this.types = ipcTypesOf(spec.direction);
    this.otherTypes = ipcTypesOf(spec.direction === "gatewayToWorld" ? "worldToGateway" : "gatewayToWorld");
  }

  get failed(): boolean {
    return this.error !== null;
  }

  get ringCapacity(): number {
    return this.ring.capacity;
  }

  destroy(): void {
    this.destroyed = true;
  }

  push(chunk: Buffer): void {
    if (this.destroyed) return;
    if (this.error !== null) throw this.error;
    try {
      let off = 0;
      while (off < chunk.length && !this.destroyed) {
        off = this.ring.available > 0 ? this.fillRing(chunk, off) : this.parseInPlace(chunk, off);
      }
    } catch (err) {
      if (err instanceof IpcProtocolError && this.error === null) this.error = err;
      throw err;
    }
  }

  /** 링이 비었을 때 — 완성 봉투는 청크 위에서 디코드, 걸친 봉투는 링에 보관. 반환 = 다음 offset. */
  private parseInPlace(chunk: Buffer, off: number): number {
    const remaining = chunk.length - off;
    if (remaining >= IPC_LEN_BYTES) {
      const total = IPC_LEN_BYTES + this.checkLen(chunk.readUInt32LE(off));
      if (remaining >= total) {
        this.dispatch(chunk.subarray(off + IPC_LEN_BYTES, off + total));
        return off + total;
      }
    }
    this.ring.appendChunk(chunk.subarray(off));
    return chunk.length;
  }

  /** 링에 걸친 봉투가 있을 때 — 완성에 필요한 만큼만 링에 복사하고, 완성되면 디코드 후 비운다. 반환 = 다음 offset. */
  private fillRing(chunk: Buffer, start: number): number {
    const ring = this.ring;
    let off = start;
    if (ring.available < IPC_LEN_BYTES) {
      const take = Math.min(IPC_LEN_BYTES - ring.available, chunk.length - off);
      ring.appendChunk(chunk.subarray(off, off + take));
      off += take;
      if (ring.available < IPC_LEN_BYTES) return off;
    }
    const total = IPC_LEN_BYTES + this.checkLen(ring.readU32LE(0));
    const take = Math.min(total - ring.available, chunk.length - off);
    ring.appendChunk(chunk.subarray(off, off + take));
    off += take;
    if (ring.available < total) return off;
    try {
      this.dispatch(ring.slice(IPC_LEN_BYTES, total));
    } finally {
      ring.consume(total);
    }
    return off;
  }

  /** 봉투 길이 검사 — 핸드셰이크 전에는 고정 상한(1 KiB, maxEnvelope 하한과 같다)이라 인증 전 상대가 큰 본문을 쌓지 못한다. */
  private checkLen(len: number): number {
    if (len === 0) throw new IpcProtocolError("envelope_empty", "zero-length envelope (no type byte)");
    const cap = this.handshaken ? this.maxEnvelope : IPC_HANDSHAKE_MAX_ENVELOPE_BYTES;
    if (IPC_LEN_BYTES + len > cap) {
      const when = this.handshaken ? "" : " before handshake";
      throw new IpcProtocolError("envelope_too_large", `${IPC_LEN_BYTES + len} bytes > cap ${cap}${when}`);
    }
    return len;
  }

  /** body = type 1바이트 + payload. */
  private dispatch(body: Buffer): void {
    const type = body[0]!;
    const payload = body.subarray(1);
    this.checkType(type);
    const refusal = this.checkHandshake(type, payload);
    const msg = this.spec.decode(type, payload);
    if (refusal) this.destroyed = true; // 종단 — 같은 청크의 뒤 봉투를 내보내지 않는다.
    try {
      this.onMessage(msg);
    } catch (err) {
      this.error = new IpcProtocolError("decoder_failed", "message handler threw — stream position lost");
      throw err;
    }
  }

  private checkType(type: number): void {
    if (this.types.has(type)) return;
    const hex = `0x${type.toString(16)}`;
    if (isReservedIpcType(type)) throw new IpcProtocolError("reserved_type", hex);
    if (this.otherTypes.has(type)) throw new IpcProtocolError("wrong_direction", `${hex} on ${this.spec.direction}`);
    throw new IpcProtocolError("unknown_type", hex);
  }

  /** 반환 = 거절 메시지(HELLO_NACK)인가 — 버전 검사 없이 통과시키고 호출자가 디코더를 종단시킨다. */
  private checkHandshake(type: number, payload: Buffer): boolean {
    const isHandshake = type === this.spec.handshakeType;
    const isRefusal = type === this.spec.refusalType;
    if (this.handshaken) {
      if (isHandshake || isRefusal) {
        throw new IpcProtocolError("duplicate_handshake", `0x${type.toString(16)} after handshake`);
      }
      return false;
    }
    if (isRefusal) return true;
    if (!isHandshake) throw new IpcProtocolError("handshake_expected", `first message was 0x${type.toString(16)}`);
    if (payload.length < 2) throw malformed("handshake payload has no ipcVer");
    const ver = payload.readUInt16LE(0);
    if (ver !== IPC_VERSION) throw new IpcProtocolError("version_mismatch", `peer v${ver}, local v${IPC_VERSION}`, ver);
    this.handshaken = true;
    return false;
  }
}

/** 월드 측 디코더 — 게이트웨이가 보낸 메시지. 첫 메시지 HELLO. */
export function createWorldSideDecoder(
  onMessage: (msg: GatewayToWorldMsg) => void,
  opts: IpcDecoderOptions = {},
): IpcDecoder {
  const spec: DirectionSpec<GatewayToWorldMsg> = {
    direction: "gatewayToWorld",
    handshakeType: IPC_MSG.HELLO,
    refusalType: null,
    decode: decodeGatewayToWorld,
  };
  return new IpcStreamDecoder(spec, onMessage, opts);
}

/** 게이트웨이 측 디코더 — 월드가 보낸 메시지. 첫 메시지 HELLO_ACK(또는 종단 HELLO_NACK). */
export function createGatewaySideDecoder(
  onMessage: (msg: WorldToGatewayMsg) => void,
  opts: IpcDecoderOptions = {},
): IpcDecoder {
  const spec: DirectionSpec<WorldToGatewayMsg> = {
    direction: "worldToGateway",
    handshakeType: IPC_MSG.HELLO_ACK,
    refusalType: IPC_MSG.HELLO_NACK,
    decode: decodeWorldToGateway,
  };
  return new IpcStreamDecoder(spec, onMessage, opts);
}
