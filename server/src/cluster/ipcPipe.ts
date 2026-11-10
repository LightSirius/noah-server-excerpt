// 월드 ↔ 게이트웨이 IPC 바이트 파이프 — 성능 4단계 4.2. 메시지 의미는 모른다(봉투·코덱은 ipcCodec.ts).
//
// IpcPipe 공통 의미(BasePipe):
//   - write(buf, release?): buf 소유권을 받는다. 전부 커널(상대)로 넘어가면 release를 즉시 1회, 일부만 넘어가면 꼬리를
//     복사 없이 대기열에 두고 transport drain마다 이어 쓴 뒤 다 쓰면 release(4.0 교정 d). 대기 중 새 쓰기는 대기열 뒤로
//     (봉투 경계 보존). 대기 바이트가 maxPendingBytes(env IPC_MAX_PENDING_MB)를 넘으면 OOM 대신 backpressure로 닫는다 —
//     부하 중 멈춘 상대를 끊는 것은 IPC_DEAD_MS보다 이 상한이 먼저다(4.0 교정 b). 닫힌 뒤 대기 버퍼의 release는 부르지 않는다.
//   - writeUrgent(buf, release?)(성능 4.5): 대기열이 있으면 전송 중인 머리 항목(과 앞서 넣은 긴급 항목들) 바로 뒤에 끼운다 —
//     항목 1개 = write 1회 = 봉투 경계라 봉투가 섞이지 않고, 긴급 항목끼리는 FIFO다. 대기열이 비었으면 write와 같다. 연결별 순서가
//     없는 피어 단위 메시지 전용(ipcSchema 상단 — ADMISSION·새 localId 거절 쌍). 상한·닫힘 의미는 write와 같다.
//   - end(): 새 쓰기 거절 → 대기열을 비운 뒤 우아하게 닫는다(endTimeoutMs 넘으면 강제). destroy(reason): 즉시 닫는다.
//   - close 핸들러는 정확히 1회, 마이크로태스크로(파이프를 닫은 호출 스택 밖 — 월드 tick flush 루프 안 write가 상한으로
//     닫아도 소유자 정리 코드가 그 루프에 재진입하지 않는다). 사유: local(소유자 end·destroy) | peer(상대가 끊음·닫힌
//     transport에 write) | dead(heartbeat) | backpressure | error(transport 오류·핸들러 예외).
//   - data·drain·heartbeat 핸들러가 던지면 파이프를 error로 닫고 예외를 close에 넘긴다(상태가 불명확한 스트림을 계속 쓰지 않음).
//   - heartbeat(heartbeatMs > 0, env IPC_HEARTBEAT_MS·IPC_DEAD_MS): 박자마다 마지막 수신 후 deadMs가 지났으면 dead로 닫고,
//     아니면 heartbeat 핸들러(게이트웨이는 PING 송신 — 4.2b). 박자 간격이 2×heartbeatMs를 넘으면 자기 이벤트 루프가 멈췄던
//     것이다 — 밀린 수신을 읽기 전에 오판하지 않도록 한 박자를 더 준다. 시계·타이머는 주입 가능(테스트).
// 구현:
//   SocketPipe — Bun.listen/Bun.connect 위(tcp loopback | unix, WORLD_IPC 형식 — config/ipcAddress.ts). tcp는 NoDelay·배타 바인드
//     (월드 이중 기동 차단). unix는 잔여 소켓 파일(SIGKILL된 월드)을 지우고 bind하되 살아 있는 리스너가 있거나 소켓이 아닌
//     파일이면 거부한다(동시 기동 경합은 슈퍼바이저 몫). Bun은 stop에서 소켓 파일을 지운다(1.3.13·1.4.3 실측).
//     Windows의 unix 경로는 named pipe — Bun/libuv가 내부 큐잉해 write가 항상 전부 수락되므로 대기 상한이 무력화된다(4.0 실측)
//     — env 가드가 거부한다(config/env.ts). 파이프 계층은 transport를 가리지 않는다.
//   MemoryPipe — 한 프로세스 안의 쌍(in-process 토폴로지·장애 주입). 실제 소켓처럼 전달·drain·상대 close는 항상 비동기다.
//     장애(보내는 쪽 옵션): delayMs 지연, splitSeed 시드 고정 무작위 청크 분할(1..maxChunkBytes), dropAfterBytes 뒤 끊김
//     (close: 접두만 전달 후 양쪽 닫힘 — SIGKILL 모사) 또는 blackhole(이후 바이트 소실·연결 유지 — 멈춘 상대 모사),
//     windowBytes 전송 창(부분 쓰기·drain). 받는 쪽 pauseReceiving()은 SIGSTOP·느린 소비자 모사.

import { type Stats, chmodSync, statSync, unlinkSync } from "node:fs";
import type { IpcAddress } from "../config/ipcAddress";
import { SeededRng } from "../sim/deterministic";
import type { IpcByteSink } from "./ipcCodec";

export type PipeCloseReason = "local" | "peer" | "dead" | "backpressure" | "error";

export interface IpcPipeHandlers {
  /** 수신 청크 — 이 호출 동안만 유효. */
  data(chunk: Buffer): void;
  /** 정확히 1회, 비동기(마이크로태스크). */
  close(reason: PipeCloseReason, error: Error | undefined): void;
  /** 부분 쓰기 뒤 대기열이 비었다. */
  drain?(): void;
  /** heartbeat 박자마다(살아 있을 때). */
  heartbeat?(): void;
}

/** 파이프 타이머 표면 — 기본은 실제 타이머(+unref), 테스트는 수동 발화 구현을 주입한다. */
export interface PipeTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface IpcPipeOptions {
  /** 로그·진단 이름. */
  label?: string;
  /** 대기(미전송) 바이트 상한 — 넘으면 backpressure로 닫는다. 기본 256 MiB(env IPC_MAX_PENDING_MB 기본과 같다). */
  maxPendingBytes?: number;
  /** heartbeat 박자(ms). 0 = 끔(기본). */
  heartbeatMs?: number;
  /** 마지막 수신 후 이 시간(ms)이 지나면 dead. 기본 5×heartbeatMs, 2×heartbeatMs 이상. */
  deadMs?: number;
  /** end() 대기열 flush 대기 상한(ms). 기본 5000. */
  endTimeoutMs?: number;
  /** liveness 시계(ms). 기본 performance.now. */
  now?: () => number;
  timers?: PipeTimers;
}

export interface IpcPipeStats {
  txBytes: number;
  rxBytes: number;
  /** transport write 호출 수(drain 이어쓰기 포함). */
  writes: number;
  partialWrites: number;
  /** 대기열이 있는 상태의 drain 통지 수. */
  drains: number;
  peakPendingBytes: number;
}

export interface IpcPipe extends IpcByteSink {
  readonly label: string;
  readonly closed: boolean;
  readonly closeReason: PipeCloseReason | null;
  readonly pendingBytes: number;
  readonly stats: Readonly<IpcPipeStats>;
  /** 핸들러를 붙인다(1회). 이미 닫힌 파이프면 close를 통지한다. */
  attach(handlers: IpcPipeHandlers): void;
  /** buf 소유권을 넘긴다. 반환 = 수락 여부(false = 닫힘·종료 중·이 호출에서 상한 초과로 닫힘). */
  write(buf: Buffer, release?: () => void): boolean;
  /** write와 같되 대기열이 있으면 전송 중인 머리 항목(과 앞선 긴급 항목들) 바로 뒤로 — 봉투 경계에서 앞지른다. */
  writeUrgent(buf: Buffer, release?: () => void): boolean;
  end(): void;
  destroy(reason?: PipeCloseReason, error?: Error): void;
  /** heartbeat 박자 1회(내부 타이머가 부른다 — 테스트 직접 호출용으로 공개). */
  checkLiveness(): void;
}

export const DEFAULT_IPC_MAX_PENDING_BYTES = 256 * 1024 * 1024;
export const DEFAULT_IPC_END_TIMEOUT_MS = 5000;
const DEFAULT_DEAD_HEARTBEATS = 5;

/** env 표면 — IPC 파이프 튜닝 키(config/env.ts). */
export interface IpcPipeEnv {
  readonly IPC_HEARTBEAT_MS: number;
  readonly IPC_DEAD_MS: number;
  readonly IPC_MAX_PENDING_MB: number;
}

/** env(IPC_HEARTBEAT_MS·IPC_DEAD_MS·IPC_MAX_PENDING_MB) → 파이프 옵션 — 월드 리스너·게이트웨이 접속 공용(4.2c). */
export function ipcPipeOptionsFromEnv(e: IpcPipeEnv, label: string): IpcPipeOptions {
  return {
    label,
    heartbeatMs: e.IPC_HEARTBEAT_MS,
    deadMs: e.IPC_DEAD_MS,
    maxPendingBytes: e.IPC_MAX_PENDING_MB * 1024 * 1024,
  };
}

const REAL_TIMERS: PipeTimers = {
  setTimeout(fn, ms) {
    const t = setTimeout(fn, ms);
    t.unref?.();
    return t;
  },
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  setInterval(fn, ms) {
    const t = setInterval(fn, ms);
    t.unref?.();
    return t;
  },
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function nonNegative(v: number, name: string): number {
  if (!Number.isFinite(v) || v < 0) throw new RangeError(`ipc pipe ${name} must be >= 0: ${v}`);
  return v;
}

interface PendingWrite {
  buf: Buffer;
  readonly release: (() => void) | undefined;
  /** writeUrgent로 끼운 항목 — 다음 긴급 항목은 이것들 뒤로(FIFO). */
  readonly urgent: boolean;
}

/** 대기열·백프레셔·종료·heartbeat — transport는 rawWrite/rawClose와 onTransport* 통지로만 만난다. */
abstract class BasePipe implements IpcPipe {
  readonly label: string;
  readonly stats: IpcPipeStats = { txBytes: 0, rxBytes: 0, writes: 0, partialWrites: 0, drains: 0, peakPendingBytes: 0 };
  protected handlers: IpcPipeHandlers | null = null;
  private state: "open" | "ending" | "closed" = "open";
  private reason: PipeCloseReason | null = null;
  private closeError: Error | undefined = undefined;
  private pending: PendingWrite[] = [];
  private pendingTotal = 0;
  private lastRxAt = 0;
  private lastCheckAt = 0;
  private heartbeatHandle: unknown = null;
  private endHandle: unknown = null;
  private readonly maxPending: number;
  private readonly heartbeatMs: number;
  private readonly deadMs: number;
  private readonly endTimeoutMs: number;
  private readonly now: () => number;
  private readonly timers: PipeTimers;

  protected constructor(opts: IpcPipeOptions, defaultLabel: string) {
    this.label = opts.label ?? defaultLabel;
    this.maxPending = opts.maxPendingBytes ?? DEFAULT_IPC_MAX_PENDING_BYTES;
    if (!Number.isInteger(this.maxPending) || this.maxPending < 1) {
      throw new RangeError(`ipc pipe maxPendingBytes must be a positive integer: ${this.maxPending}`);
    }
    this.heartbeatMs = nonNegative(opts.heartbeatMs ?? 0, "heartbeatMs");
    this.deadMs = nonNegative(opts.deadMs ?? this.heartbeatMs * DEFAULT_DEAD_HEARTBEATS, "deadMs");
    if (this.heartbeatMs > 0 && this.deadMs < 2 * this.heartbeatMs) {
      throw new RangeError(`ipc pipe deadMs (${this.deadMs}) must be >= 2 × heartbeatMs (${this.heartbeatMs})`);
    }
    this.endTimeoutMs = nonNegative(opts.endTimeoutMs ?? DEFAULT_IPC_END_TIMEOUT_MS, "endTimeoutMs");
    this.now = opts.now ?? (() => performance.now());
    this.timers = opts.timers ?? REAL_TIMERS;
  }

  get closed(): boolean {
    return this.state === "closed";
  }

  get closeReason(): PipeCloseReason | null {
    return this.reason;
  }

  get pendingBytes(): number {
    return this.pendingTotal;
  }

  attach(handlers: IpcPipeHandlers): void {
    if (this.handlers !== null) throw new Error(`ipc pipe ${this.label}: handlers already attached`);
    this.handlers = handlers;
    if (this.state === "closed") {
      this.notifyClose();
      return;
    }
    const t = this.now();
    this.lastRxAt = t;
    this.lastCheckAt = t;
    if (this.heartbeatMs > 0) this.heartbeatHandle = this.timers.setInterval(() => this.checkLiveness(), this.heartbeatMs);
    this.onAttached();
  }

  write(buf: Buffer, release?: () => void): boolean {
    if (this.state !== "open") return false;
    if (buf.length === 0) {
      release?.();
      return true;
    }
    if (this.pendingTotal > 0) return this.enqueue(buf, release);
    const wrote = this.transportWrite(buf);
    if (wrote < 0) {
      this.finish("peer", undefined, false);
      return false;
    }
    if (wrote === buf.length) {
      release?.();
      return true;
    }
    this.stats.partialWrites++;
    return this.enqueue(wrote === 0 ? buf : buf.subarray(wrote), release);
  }

  writeUrgent(buf: Buffer, release?: () => void): boolean {
    if (this.state !== "open") return false;
    if (this.pendingTotal === 0 || buf.length === 0) return this.write(buf, release);
    let at = 1;
    while (at < this.pending.length && this.pending[at]!.urgent) at++;
    return this.enqueue(buf, release, at);
  }

  end(): void {
    if (this.state !== "open") return;
    if (this.pendingTotal === 0) {
      this.finish("local", undefined, true);
      return;
    }
    this.state = "ending";
    this.endHandle = this.timers.setTimeout(
      () => this.finish("local", new Error(`ipc pipe ${this.label}: end flush timed out`), false),
      this.endTimeoutMs,
    );
  }

  destroy(reason: PipeCloseReason = "local", error?: Error): void {
    this.finish(reason, error, false);
  }

  checkLiveness(): void {
    if (this.state === "closed" || this.heartbeatMs <= 0) return;
    const now = this.now();
    if (now - this.lastCheckAt > 2 * this.heartbeatMs) {
      // 자기 이벤트 루프가 멈췄었다 — 밀린 수신 콜백이 아직 안 돌았을 수 있으니 한 박자 유예.
      this.lastRxAt = Math.max(this.lastRxAt, now - this.deadMs + this.heartbeatMs);
    }
    this.lastCheckAt = now;
    const silentMs = now - this.lastRxAt;
    if (silentMs >= this.deadMs) {
      this.finish("dead", new Error(`ipc pipe ${this.label}: no bytes for ${Math.round(silentMs)} ms`), false);
      return;
    }
    this.invoke((h) => h.heartbeat?.());
  }

  /** transport에 쓴다 — 반환 = 넘어간 바이트(0..len), 닫힌 transport면 -1. */
  protected abstract rawWrite(buf: Buffer): number;
  /** transport를 닫는다(graceful = 이미 넘긴 바이트 뒤 FIN, 아니면 즉시). 이미 닫혔으면 무동작. */
  protected abstract rawClose(graceful: boolean): void;
  /** 핸들러가 붙은 직후(MemoryPipe: 대기 중 수신 전달 시작). */
  protected onAttached(): void {}

  protected onTransportData(chunk: Buffer): void {
    if (this.state === "closed") return;
    this.stats.rxBytes += chunk.length;
    this.lastRxAt = this.now();
    const h = this.handlers;
    if (h === null) return;
    try {
      h.data(chunk);
    } catch (err) {
      this.finish("error", toError(err), false);
    }
  }

  /** transport가 다시 쓸 수 있다 — 대기열을 이어 쓴다. 다 비우면 drain 통지(종료 중이면 닫는다). */
  protected onTransportDrain(): void {
    if (this.state === "closed" || this.pending.length === 0) return;
    this.stats.drains++;
    while (this.pending.length > 0) {
      const head = this.pending[0]!;
      const wrote = this.transportWrite(head.buf);
      if (wrote < 0) {
        this.finish("peer", undefined, false);
        return;
      }
      this.pendingTotal -= wrote;
      if (wrote < head.buf.length) {
        head.buf = head.buf.subarray(wrote);
        return;
      }
      this.pending.shift();
      head.release?.();
    }
    if (this.state === "ending") {
      this.finish("local", undefined, true);
      return;
    }
    this.invoke((h) => h.drain?.());
  }

  protected onTransportClosed(error: Error | undefined): void {
    this.finish(error === undefined ? "peer" : "error", error, false);
  }

  private transportWrite(buf: Buffer): number {
    const wrote = this.rawWrite(buf);
    this.stats.writes++;
    if (wrote > 0) this.stats.txBytes += wrote;
    return wrote;
  }

  /** urgentAt = 긴급 항목을 끼울 위치(writeUrgent). 미지정 = 일반 쓰기(끝). */
  private enqueue(buf: Buffer, release: (() => void) | undefined, urgentAt?: number): boolean {
    const total = this.pendingTotal + buf.length;
    if (total > this.maxPending) {
      this.finish("backpressure", new Error(`ipc pipe ${this.label}: pending ${total} bytes > cap ${this.maxPending}`), false);
      return false;
    }
    if (urgentAt === undefined) this.pending.push({ buf, release, urgent: false });
    else this.pending.splice(urgentAt, 0, { buf, release, urgent: true });
    this.pendingTotal = total;
    if (total > this.stats.peakPendingBytes) this.stats.peakPendingBytes = total;
    return true;
  }

  private invoke(fn: (h: IpcPipeHandlers) => void): void {
    const h = this.handlers;
    if (h === null) return;
    try {
      fn(h);
    } catch (err) {
      this.finish("error", toError(err), false);
    }
  }

  private finish(reason: PipeCloseReason, error: Error | undefined, graceful: boolean): void {
    if (this.state === "closed") return;
    this.state = "closed";
    this.reason = reason;
    this.closeError = error;
    this.stopTimers();
    this.pending = [];
    this.pendingTotal = 0;
    try {
      this.rawClose(graceful);
    } catch {
      // transport가 이미 닫혔다.
    }
    if (this.handlers !== null) this.notifyClose();
  }

  private notifyClose(): void {
    const h = this.handlers;
    const reason = this.reason;
    if (h === null || reason === null) return;
    const error = this.closeError;
    queueMicrotask(() => h.close(reason, error));
  }

  private stopTimers(): void {
    if (this.heartbeatHandle !== null) {
      this.timers.clearInterval(this.heartbeatHandle);
      this.heartbeatHandle = null;
    }
    if (this.endHandle !== null) {
      this.timers.clearTimeout(this.endHandle);
      this.endHandle = null;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// SocketPipe

type PipeSocket = Bun.Socket<SocketPipe | undefined>;

export class SocketPipe extends BasePipe {
  private constructor(
    private readonly sock: PipeSocket,
    opts: IpcPipeOptions,
    defaultLabel: string,
  ) {
    super(opts, defaultLabel);
  }

  /** 수신을 멈춘다(커널 버퍼가 차면 상대가 부분 쓰기·대기열·백프레셔를 본다) — 진단·테스트. */
  pauseReceiving(): void {
    this.sock.pause();
  }

  resumeReceiving(): void {
    this.sock.resume();
  }

  protected rawWrite(buf: Buffer): number {
    return this.sock.write(buf);
  }

  protected rawClose(graceful: boolean): void {
    if (graceful) this.sock.end();
    else this.sock.terminate();
  }

  /** Bun 소켓 콜백 — open에서 파이프를 만들어 onOpen이 돌려준 핸들러를 붙인다. */
  static socketHandlers(
    kind: IpcAddress["kind"],
    opts: IpcPipeOptions,
    onOpen: (pipe: SocketPipe) => IpcPipeHandlers,
  ): Bun.SocketHandler<SocketPipe | undefined> {
    return {
      open(sock) {
        if (kind === "tcp") sock.setNoDelay(true);
        const pipe = new SocketPipe(sock, opts, `ipc-${kind}`);
        sock.data = pipe;
        try {
          pipe.attach(onOpen(pipe));
        } catch (err) {
          pipe.destroy("error", toError(err));
        }
      },
      data(sock, chunk) {
        sock.data?.onTransportData(chunk);
      },
      drain(sock) {
        sock.data?.onTransportDrain();
      },
      close(sock, error) {
        sock.data?.onTransportClosed(error);
      },
      error(sock, error) {
        sock.data?.onTransportClosed(error);
      },
    };
  }
}

export interface IpcListener {
  /** 실제 바인드 주소(tcp 포트 0이면 할당된 포트). */
  readonly address: IpcAddress;
  /** 리스닝 중단(closeActive = 받아 둔 연결까지 닫기). unix 소켓 파일은 Bun이 지운다. */
  stop(closeActive?: boolean): void;
}

/** IPC 리스너(월드). 연결마다 onAccept가 핸들러를 돌려준다. bind 실패(사용 중 포트·살아 있는 unix 리스너)는 reject. */
export async function listenIpc(
  addr: IpcAddress,
  onAccept: (pipe: SocketPipe) => IpcPipeHandlers,
  opts: IpcPipeOptions = {},
): Promise<IpcListener> {
  const socket = SocketPipe.socketHandlers(addr.kind, opts, onAccept);
  if (addr.kind === "tcp") {
    const l = Bun.listen<SocketPipe | undefined>({ hostname: addr.host, port: addr.port, exclusive: true, socket });
    return { address: { kind: "tcp", host: addr.host, port: l.port }, stop: (closeActive = false) => l.stop(closeActive) };
  }
  await clearStaleUnixSocket(addr.path);
  const l = Bun.listen<SocketPipe | undefined>({ unix: addr.path, socket });
  try {
    restrictUnixSocket(addr.path);
  } catch (err) {
    l.stop(true);
    throw err;
  }
  return { address: addr, stop: (closeActive = false) => l.stop(closeActive) };
}

/** IPC 접속(게이트웨이). 연결 실패는 reject. */
export async function connectIpc(
  addr: IpcAddress,
  handlers: IpcPipeHandlers,
  opts: IpcPipeOptions = {},
): Promise<SocketPipe> {
  const ref: { pipe: SocketPipe | null } = { pipe: null };
  const socket = SocketPipe.socketHandlers(addr.kind, opts, (pipe) => {
    ref.pipe = pipe;
    return handlers;
  });
  if (addr.kind === "tcp") await Bun.connect<SocketPipe | undefined>({ hostname: addr.host, port: addr.port, socket });
  else await Bun.connect<SocketPipe | undefined>({ unix: addr.path, socket });
  if (ref.pipe === null) throw new Error(`ipc connect to ${addr.kind} resolved without an open callback`);
  return ref.pipe;
}

/** 소켓 파일을 소유자 전용(0600)으로 — 다른 로컬 계정의 connect 차단(추상 소켓은 파일이 없어 해당 없음). HELLO token이 1차 방어다. */
function restrictUnixSocket(path: string): void {
  if (process.platform === "win32" || path.startsWith("\0")) return;
  chmodSync(path, 0o600);
}

/** unix 경로의 잔여 소켓 파일 정리 — 없으면 무동작, 소켓이 아니거나 살아 있는 리스너가 받으면 throw. */
async function clearStaleUnixSocket(path: string): Promise<void> {
  if (process.platform === "win32" || path.startsWith("\0")) return;
  let st: Stats;
  try {
    st = statSync(path);
  } catch {
    return;
  }
  if (!st.isSocket()) throw new Error(`ipc unix path ${path} exists and is not a socket`);
  const live = await Bun.connect({ unix: path, socket: { data() {} } }).then(
    (s) => {
      s.end();
      return true;
    },
    () => false,
  );
  if (live) throw new Error(`ipc unix socket ${path} is in use by a live listener`);
  unlinkSync(path);
}

// ---------------------------------------------------------------------------------------------------------------------
// MemoryPipe

export interface MemoryPipeFaults {
  /** 전달 지연(ms). */
  delayMs?: number;
  /** 시드 고정 무작위 청크 분할 — 쓰기마다 1..maxChunkBytes 조각으로 나눠 전달. */
  splitSeed?: number;
  /** 분할 조각 상한(기본 4096). */
  maxChunkBytes?: number;
  /** 이 바이트 수를 보낸 뒤 링크가 죽는다(dropMode). */
  dropAfterBytes?: number;
  /** close(기본): 접두만 전달 후 양쪽 닫힘. blackhole: 이후 바이트 소실, 연결 유지. */
  dropMode?: "close" | "blackhole";
  /** 상대 수신 대기 바이트 창 — 가득 차면 부분 쓰기, 상대가 읽으면 drain. 기본 무한. */
  windowBytes?: number;
}

export interface MemoryPipeOptions extends IpcPipeOptions {
  /** 이 끝이 보내는 바이트에 적용할 장애. */
  faults?: MemoryPipeFaults;
}

interface InboundChunk {
  readonly chunk: Buffer;
  readonly dueAt: number;
}

const DEFAULT_MAX_CHUNK_BYTES = 4096;
const INBOUND_COMPACT_AT = 1024;

export class MemoryPipe extends BasePipe {
  private peer: MemoryPipe | null = null;
  /** 이 끝으로 오는 미전달 조각(head부터). */
  private inbound: InboundChunk[] = [];
  private inboundHead = 0;
  /** 이 끝으로 오는 미전달 바이트(상대의 전송 창 판정). */
  private inFlight = 0;
  private receivePaused = false;
  private pumpScheduled = false;
  private drainScheduled = false;
  private wantsDrain = false;
  private transportClosed = false;
  private hangupPending = false;
  private sentBytes = 0;
  private blackholed = false;
  private readonly rng: SeededRng | null;
  private readonly delayMs: number;
  private readonly windowBytes: number;
  private readonly maxChunkBytes: number;
  private readonly dropAfterBytes: number;
  private readonly dropMode: "close" | "blackhole";

  private constructor(opts: MemoryPipeOptions, defaultLabel: string) {
    super(opts, defaultLabel);
    const f = opts.faults ?? {};
    this.delayMs = nonNegative(f.delayMs ?? 0, "faults.delayMs");
    this.windowBytes = f.windowBytes ?? Number.POSITIVE_INFINITY;
    if (!(this.windowBytes >= 1)) throw new RangeError(`ipc pipe faults.windowBytes must be >= 1: ${this.windowBytes}`);
    this.maxChunkBytes = f.maxChunkBytes ?? DEFAULT_MAX_CHUNK_BYTES;
    if (!Number.isInteger(this.maxChunkBytes) || this.maxChunkBytes < 1) {
      throw new RangeError(`ipc pipe faults.maxChunkBytes must be a positive integer: ${this.maxChunkBytes}`);
    }
    this.dropAfterBytes =
      f.dropAfterBytes === undefined ? Number.POSITIVE_INFINITY : nonNegative(f.dropAfterBytes, "faults.dropAfterBytes");
    this.dropMode = f.dropMode ?? "close";
    this.rng = f.splitSeed === undefined ? null : new SeededRng(f.splitSeed);
  }

  /** 서로 연결된 두 끝. 핸들러는 각자 attach한다(그 전에 온 바이트는 attach 뒤 전달). */
  static pair(opts: { a?: MemoryPipeOptions; b?: MemoryPipeOptions } = {}): [MemoryPipe, MemoryPipe] {
    const a = new MemoryPipe(opts.a ?? {}, "mem-a");
    const b = new MemoryPipe(opts.b ?? {}, "mem-b");
    a.peer = b;
    b.peer = a;
    return [a, b];
  }

  /** 이 끝의 수신을 멈춘다(SIGSTOP·느린 소비자) — 상대 창이 차면 부분 쓰기·대기열·백프레셔. 상대 close도 재개 뒤에 본다. */
  pauseReceiving(): void {
    this.receivePaused = true;
  }

  resumeReceiving(): void {
    this.receivePaused = false;
    this.schedulePump();
  }

  protected rawWrite(buf: Buffer): number {
    if (this.transportClosed) return -1;
    const room = this.windowBytes - this.linkedPeer().inFlight;
    const n = Math.min(buf.length, Math.max(0, room));
    if (n < buf.length) this.wantsDrain = true;
    if (n > 0) this.transmit(buf.subarray(0, n));
    return n;
  }

  protected rawClose(graceful: boolean): void {
    if (this.transportClosed) return;
    this.transportClosed = true;
    this.clearInbound();
    this.linkedPeer().hangUp(graceful);
  }

  protected onAttached(): void {
    this.schedulePump();
  }

  private linkedPeer(): MemoryPipe {
    if (this.peer === null) throw new Error(`ipc memory pipe ${this.label} has no peer`);
    return this.peer;
  }

  /** 넘어간 바이트를 상대 수신 대기열로 — dropAfterBytes를 넘는 부분은 링크 장애로. */
  private transmit(bytes: Buffer): void {
    if (this.blackholed) return;
    if (this.sentBytes + bytes.length <= this.dropAfterBytes) {
      this.sentBytes += bytes.length;
      this.linkedPeer().receive(bytes, this);
      return;
    }
    const prefix = bytes.subarray(0, this.dropAfterBytes - this.sentBytes);
    this.sentBytes = this.dropAfterBytes;
    if (prefix.length > 0) this.linkedPeer().receive(prefix, this);
    this.trip();
  }

  private trip(): void {
    if (this.dropMode === "blackhole") {
      this.blackholed = true;
      return;
    }
    this.linkedPeer().hangUp(true);
    this.transportClosed = true;
    this.clearInbound();
    setImmediate(() => this.onTransportClosed(undefined));
  }

  /** 상대가 보낸 바이트 — 커널처럼 복사해 지연·분할 후 대기열에. 이미 닫힌 끝이면 버린다(상대는 hangUp으로 곧 닫힌다). */
  private receive(bytes: Buffer, from: MemoryPipe): void {
    if (this.transportClosed) return;
    const copy = Buffer.from(bytes);
    const dueAt = performance.now() + from.delayMs;
    for (const chunk of from.split(copy)) this.inbound.push({ chunk, dueAt });
    this.inFlight += copy.length;
    this.schedulePump();
  }

  private split(copy: Buffer): Buffer[] {
    if (this.rng === null) return [copy];
    const pieces: Buffer[] = [];
    for (let off = 0; off < copy.length; ) {
      const n = Math.min(copy.length - off, this.rng.nextIntInclusive(1, this.maxChunkBytes));
      pieces.push(copy.subarray(off, off + n));
      off += n;
    }
    return pieces;
  }

  /** 상대가 끊었다 — graceful이면 이미 보낸 바이트를 다 전달한 뒤, 아니면(RST) 버리고 닫힌다. */
  private hangUp(graceful: boolean): void {
    if (this.transportClosed) return;
    if (!graceful) this.clearInbound();
    this.hangupPending = true;
    this.schedulePump();
  }

  private clearInbound(): void {
    this.inbound = [];
    this.inboundHead = 0;
    this.inFlight = 0;
  }

  private get queued(): number {
    return this.inbound.length - this.inboundHead;
  }

  private canPump(): boolean {
    if (this.receivePaused || this.transportClosed) return false;
    return this.queued > 0 ? this.handlers !== null : this.hangupPending;
  }

  private schedulePump(): void {
    if (this.pumpScheduled || !this.canPump()) return;
    this.pumpScheduled = true;
    const head = this.inbound[this.inboundHead];
    const wait = head === undefined ? 0 : head.dueAt - performance.now();
    if (wait > 0) setTimeout(() => this.pump(), wait);
    else setImmediate(() => this.pump());
  }

  /** 기한이 된 조각을 순서대로 전달하고, 대기열이 비었고 상대가 끊었으면 닫힌다. */
  private pump(): void {
    this.pumpScheduled = false;
    const now = performance.now();
    while (this.queued > 0 && this.canPump()) {
      const head = this.inbound[this.inboundHead]!;
      if (head.dueAt > now) break;
      this.inboundHead++;
      this.inFlight -= head.chunk.length;
      this.onTransportData(head.chunk);
      this.peer?.scheduleDrain();
    }
    this.compactInbound();
    if (this.queued === 0 && this.hangupPending && !this.receivePaused && !this.transportClosed) {
      this.hangupPending = false;
      this.transportClosed = true;
      this.onTransportClosed(undefined);
      return;
    }
    this.schedulePump();
  }

  private compactInbound(): void {
    if (this.inboundHead === this.inbound.length) {
      this.inbound = [];
      this.inboundHead = 0;
    } else if (this.inboundHead >= INBOUND_COMPACT_AT && this.inboundHead * 2 >= this.inbound.length) {
      this.inbound = this.inbound.slice(this.inboundHead);
      this.inboundHead = 0;
    }
  }

  /** 상대가 읽어 창에 자리가 났다 — 부분 쓰기로 기다리던 쪽에 drain을 비동기로. */
  private scheduleDrain(): void {
    if (!this.wantsDrain || this.drainScheduled || this.transportClosed) return;
    this.drainScheduled = true;
    setImmediate(() => {
      this.drainScheduled = false;
      if (this.transportClosed) return;
      this.wantsDrain = false;
      this.onTransportDrain();
    });
  }
}

/** MemoryPipe 쌍 — `a`·`b` 옵션은 각 끝(faults는 그 끝이 보내는 바이트에 적용). */
export function createMemoryPipePair(opts: { a?: MemoryPipeOptions; b?: MemoryPipeOptions } = {}): [MemoryPipe, MemoryPipe] {
  return MemoryPipe.pair(opts);
}
