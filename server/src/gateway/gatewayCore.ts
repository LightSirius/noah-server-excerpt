// 게이트웨이 코어 — 성능 4단계(게이트웨이 분리) 4.2c. 클라 소켓을 소유하고(게임 상태·DB 없음) 월드와 IPC 1개로 잇는다. transport는
// 모른다 — 월드 링크는 IpcPipe(SocketPipe·MemoryPipe), 클라 소켓은 Bun 소켓 콜백 묶음(edge — listen() 또는 테스트의 가짜 소켓).
//
// 클라 → 월드(엣지 처리기 IpcSink — monolith와 같은 clientEdge 정책, 다른 것은 연결 객체와 처리기뿐):
//   accept  → 수용 판정: 월드 핸드셰이크 전·종료 중이면 KICK 6 "world unavailable", 부하 접속 제한(성능 4.5 — gatewayAdmission·gatewayLoad: 월드
//             ADMISSION busy 또는 로컬 신호 cpu·lag·rtt·outbound)이면 KICK 9 "server busy", 게이트웨이 상한(min(maxConnections, 월드
//             connCap)) 초과면 KICK 9 "connection cap"(셋 다 CONN_OPEN 없음 — 월드는 모르는 연결). 수용이면 CONN_OPEN(localId,
//             실제 클라 IP) — 월드가 IP별 상한·미인증 몫·과부하 접속 제한을 그 IP로 판정한다(거절이면 DELIVER(KICK 9) + CONN_CLOSE).
//   프레임  → 엣지 게이트(size·rate·idle)를 통과한 본문을 원시 그대로 CONN_FRAMES 레코드로(디코드·상태 머신은 월드). 이벤트 루프
//             턴마다 배치 1개(setImmediate flush), 1 MiB 이상 쌓이면 즉시.
//   close   → CONN_CLOSED(localId, 사유) — 엣지 킥은 kicked 훅이 사유를 기록(size 3·rate 2·idle/데드라인 1), 월드 CLOSE는 7,
//             꼬리 상한 종료는 4, 그 외는 클라가 끊음 0.
// 월드 → 클라(같은 파이프의 FIFO — 연결별 STATE/DELIVER/CLOSE 순서 = 월드 발행 순서):
//   HELLO_ACK → 핸드셰이크 완료(attachWorld resolve — 호출자가 그 뒤에 listen). DELIVER·DELIVER_SHARED·MULTICAST·CONN_FLUSH → 전달
//   (gatewayDeliver — 연결의 로컬 OutboundLink). STATE → 로그인 상태 미러(rate 한도·idle 창·pre-auth 데드라인 — 월드가 전이를 응답보다
//   먼저 보내므로 클라가 다음 단계 패킷을 보내기 전에 바뀐다). CLOSE → 앞선 바이트 뒤 우아한 종료. ACCEPTED → worldConnId.
//   ADMISSION → 월드 판정(이 게이트웨이의 IPC 적체가 월드 소프트 임계 위 — 긴급 송신이라 그 적체보다 먼저 온다) → gatewayAdmission.
//   SHUTDOWN → 리스너 중지 + 전원 KICK(kickReason) + CONN_CLOSED(gw_shutdown). 미추적 localId는 무시(stale).
//   LISTEN → 공유 포트 리스너 양보 지시(IPC v14 — gatewayListen이 집행: yield = 리스너 중지(기존 연결 그대로), listen = 재바인드). 리슨 상태는
//   LISTEN_REPORT로 긴급 송신한다 — 리슨 직후·접속 제한 전이·연결 상한 닿음/해제(capFull — 히스테리시스)·리스너 중지/재개·지시 적용
//   (무동작이어도 ack)마다(sendListenReport). closed = 새 클라를 거절 중(부하 접속 제한 ∨ 연결 상한).
//   HELLO_NACK(HELLO_ACK 대신) → attachWorld가 WorldRefusedError(사유)로 reject — 사유별 정책(재시도·상한 대기·종료)은 호출자
//   (gatewayMain) 몫. HELLO는 공유 비밀 ipcToken(env IPC_TOKEN)을 싣는다.
// 월드 유실(파이프 close·dead·backpressure·프로토콜 위반): 리스너 중지 + 전원 KICK 6 "world unavailable"(연결 표를 먼저 비워 CONN_CLOSED를
//   보내지 않는다 — 죽은 링크이고, 연결을 새 월드로 이월하지 않는다) + attachWorld가 돌려준 lost resolve. 다시 붙는 것은 호출자 몫
//   (gatewayMain — 백오프 재접속). localId는 코어 수명 동안 계속 증가한다(새 피어에서도 재사용 없음). 이 킥은 CONN_CLOSED가 아니므로
//   mmorpg_gw_conn_closed_total{reason="world_lost"}로 센다.
// 우아한 종료(close): 리스너 중지 → BYE → 전원 KICK 6 "gateway shutdown"(CONN_CLOSED gw_shutdown) → flush → 파이프 end. 송신 꼬리
//   flush를 기다리는 연결은 파이프 end 뒤에 닫혀 CONN_CLOSED가 버려진다 — 월드가 BYE 뒤 끊김(bye)의 피어 정리(배치 저장)로 닫는다.
// 재진입: 로컬 링크의 end()/send() 안에서 Bun close 콜백(release)이 동기 실행된다 — release는 연결 표·IPC(배치·긴급 LISTEN_REPORT)만
//   만진다(파이프 close 통지는 마이크로태스크라 IPC 쓰기도 재진입하지 않는다).
// 시계: 게이트웨이는 sim/world 밖 — rate 시계·타이머는 엣지 옵션(주입 가능).

import {
  type ClientEdgeOptions,
  type EdgeKickCause,
  type EdgeSink,
  createClientEdge,
  kickAndClose,
} from "../network/clientEdge";
import { KICK_REASON } from "../identity/loginFlow";
import { type CounterHandle, metrics, registry } from "../obs/metrics";
import { createLogger } from "../obs/logger";
import { createSquelch, suppressedMeta } from "../obs/logSquelch";
import {
  GatewayIpcWriter,
  type IpcDecoder,
  type IpcDecoderOptions,
  IpcProtocolError,
  type IpcWriterOptions,
  createGatewaySideDecoder,
} from "../cluster/ipcCodec";
import type { IpcPipe, IpcPipeHandlers, PipeCloseReason } from "../cluster/ipcPipe";
import {
  BYE_REASON,
  type ByeReason,
  CONN_CLOSED_REASON,
  type ConnClosedReason,
  HELLO_NACK_LABELS,
  type HelloAckMsg,
  type HelloNackLabel,
  type HelloNackMsg,
  IPC_DEFAULT_BATCH_SPLIT_BYTES,
  IPC_MSG,
  type WorldToGatewayMsg,
} from "../cluster/ipcSchema";
import { GatewayAdmission } from "./gatewayAdmission";
import { GatewayConn } from "./gatewayConn";
import { GatewayDelivery } from "./gatewayDeliver";
import {
  type GatewayListenOptions,
  GatewayListener,
  type ListenBind,
  type ListenYieldOptions,
  capReopenAt,
} from "./gatewayListen";
import { DEFAULT_LOAD_WINDOW_MS, type GatewayAdmissionOptions } from "./gatewayLoad";

export type { GatewayListenOptions } from "./gatewayListen";

const log = createLogger("gateway");
const gwIpcRx = metrics.gwIpcRxBytes.bind(undefined);
const gwIpcTx = metrics.gwIpcTxBytes.bind(undefined);
/** 응답을 기다리는 PING 기록 상한(seq → 보낸 시각) — 월드가 멈춰 PONG이 밀려도 늦은 PONG을 자기 seq로 잰다. */
const MAX_PENDING_PINGS = 16;

/** 이 프로세스의 살아 있는 코어 — scrape 시점 mmorpg_gw_ipc_pending_bytes 합(close에서 빠진다; in-process 토폴로지는 여러 개). */
const liveCores = new Set<GatewayCore>();
registry.addCollector(() => {
  let n = 0;
  for (const core of liveCores) n += core.ipcPendingBytes();
  metrics.gwIpcPendingBytes.set(n);
});
const staleState = metrics.gwStaleRecords.bind({ type: "state" });
const staleClose = metrics.gwStaleRecords.bind({ type: "close" });
const staleAccepted = metrics.gwStaleRecords.bind({ type: "accepted" });
// 수용 거절 warn — 접속 폭주에도 초당 1줄(억제분은 suppressed로). 메트릭은 항상.
const rejectWarnSquelch = createSquelch({ ratePerSec: 1, burst: 5 });
// 연결 상한 닿음·해제 info — 히스테리시스가 빈도를 묶지만 작은 상한에서도 쌓이지 않게.
const capLogSquelch = createSquelch({ ratePerSec: 1, burst: 5 });

/** 엣지 킥 원인 → CONN_CLOSED 사유. */
const EDGE_KICK_REASON: Record<EdgeKickCause, ConnClosedReason> = {
  idle: CONN_CLOSED_REASON.Idle,
  pre_auth_deadline: CONN_CLOSED_REASON.Idle,
  size: CONN_CLOSED_REASON.Size,
  rate: CONN_CLOSED_REASON.Rate,
  legacy_framing: CONN_CLOSED_REASON.LegacyFraming,
};

/** CONN_CLOSED 사유 코드 → 메트릭 라벨(mmorpg_gw_conn_closed_total{reason}). 인덱스 = 와이어 값. */
const CLOSED_REASON_LABELS = [
  "peer",
  "idle",
  "rate",
  "size",
  "backlog",
  "error",
  "gw_shutdown",
  "world_requested",
  "cap",
  "legacy_framing",
] as const;
const closedHandles: CounterHandle[] = CLOSED_REASON_LABELS.map((reason) => metrics.gwConnClosed.bind({ reason }));
/** 월드 유실로 CONN_CLOSED 없이 킥한 연결 — CONN_CLOSED 사유가 아니다(gw_shutdown과 구분 — 월드 크래시 경보 해석). */
const closedWorldLost = metrics.gwConnClosed.bind({ reason: "world_lost" });

/**
 * 월드 유실 사유(mmorpg_gw_world_lost_total{reason}) — local = 이 코어가 닫았다(close), shutdown = 월드가 SHUTDOWN을 보낸 뒤
 * 닫았다(예고된 월드 종료 — 경보 대상 아님).
 */
export type WorldLossReason = PipeCloseReason | "protocol" | "shutdown";

/** 월드가 HELLO를 HELLO_NACK으로 거절했다 — attachWorld의 reject 사유. */
export class WorldRefusedError extends Error {
  constructor(
    readonly reason: HelloNackLabel,
    /** 거절한 월드의 ipcVer. */
    readonly worldIpcVer: number,
  ) {
    super(`world refused HELLO (${reason}, world ipc v${worldIpcVer})`);
    this.name = "WorldRefusedError";
  }
}

export interface GatewayCoreOptions {
  readonly gatewayId: number;
  /** 게이트웨이 프로세스 기동마다 새 u32 — 월드의 재접속 펜싱 키(gatewayId와 함께). */
  readonly incarnation: number;
  readonly pid: number;
  /** 공유 비밀(env IPC_TOKEN) — HELLO에 싣는다. 미지정 = 빈 값. */
  readonly ipcToken?: string;
  /** 게이트웨이 연결 상한(env GATEWAY_MAX_CONNECTIONS ?? MAX_CONNECTIONS) — HELLO_ACK connCap으로 다시 묶인다. 미지정 = connCap. */
  readonly maxConnections?: number;
  /** 클라 엣지 정책(monolith startTcpServer와 같은 옵션 — idle·데드라인·strike·시계·타이머·과부하 신호). */
  readonly edge?: ClientEdgeOptions;
  /** IPC 송신 봉투 상한·분할(테스트 축소용) — 월드 디코더 상한과 같아야 한다. */
  readonly writer?: IpcWriterOptions;
  /** IPC 수신 봉투 상한(테스트 축소용). */
  readonly decoder?: IpcDecoderOptions;
  /** IPC 배치가 이 바이트 이상이면 턴 끝을 기다리지 않고 flush(기본 1 MiB). */
  readonly flushAtBytes?: number;
  /** 관측 시계(ms — DELIVER 처리 시간·IPC 왕복). 기본 performance.now. */
  readonly now?: () => number;
  /** 부하 접속 제한(성능 4.5, env GW_ADMISSION_*). 미지정 = 끔(월드 ADMISSION도 무시 — 월드가 CONN_OPEN에서 판정한다). */
  readonly admission?: GatewayAdmissionOptions;
  /**
   * 공유 포트 리스너 양보(IPC v14) — 있으면 월드의 LISTEN yield/listen을 따른다(LISTEN_REPORT shared). 운영 배선(gatewayConfigFromEnv)은
   * REUSE_PORT=1·GW_ADMISSION=1·GW_LISTEN_YIELD=1일 때만 준다. 미지정 = LISTEN은 ack만(종전 동작).
   */
  readonly listenYield?: ListenYieldOptions;
  /** 클라 리스너 바인드(기본 Bun.listen) — 테스트가 재개 실패를 주입한다. */
  readonly listenBind?: ListenBind;
}

/** 핸드셰이크를 마친 월드 연결. */
export interface WorldSession {
  readonly worldIncarnation: number;
  /** 이 게이트웨이의 유효 연결 상한(min(maxConnections, 월드 connCap)). */
  readonly connCap: number;
  /** 이 월드 연결이 끊기면 사유로 resolve(전원 킥·리스너 중지 뒤). */
  readonly lost: Promise<WorldLossReason>;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(v: T): void;
  reject(e: Error): void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (v: T) => void = () => {};
  let reject: (e: Error) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.catch(() => {}); // 호출자가 아직 기다리지 않는 사이의 reject를 미처리 거부로 보고하지 않게.
  return { promise, resolve, reject };
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

/** 월드 IPC 연결 1개의 상태. */
interface WorldLink {
  pipe: IpcPipe | null;
  decoder: IpcDecoder | null;
  readonly writer: GatewayIpcWriter;
  hello: { readonly worldIncarnation: number; readonly connCap: number } | null;
  live: boolean;
  /** 응답을 기다리는 PING(seq → 보낸 시각, 삽입 순). */
  readonly pings: Map<number, number>;
  /** 월드가 SHUTDOWN을 보냈다 — 이후 상대가 끊으면 유실 사유 shutdown. */
  shutdownSeen: boolean;
  flushQueued: boolean;
  readonly handshake: Deferred<WorldSession>;
  readonly lost: Deferred<WorldLossReason>;
}

/** 월드 IPC 접속 — 핸들러를 붙인 파이프를 돌려준다(SocketPipe: connectIpc, MemoryPipe: attach 후 그 끝). */
export type WorldConnector = (handlers: IpcPipeHandlers) => IpcPipe | Promise<IpcPipe>;

export class GatewayCore {
  /** 클라 소켓 콜백 — listen()이 Bun.listen에 꽂는다(테스트는 가짜 소켓으로 직접 몬다). */
  readonly edge: Bun.SocketHandler<GatewayConn>;
  private readonly conns = new Map<number, GatewayConn>();
  /** 월드 → 클라 전달(연결 표를 읽는다). */
  private readonly delivery: GatewayDelivery;
  private nextLocalId = 1;
  private link: WorldLink | null = null;
  private connCap = 0;
  private pingSeq = 0;
  /** 클라 리스너(세션 리슨·양보 중지·재개 — gatewayListen). */
  private readonly clientListener: GatewayListener;
  /** 긴급 송신 전용(LISTEN_REPORT) — 배치 writer의 열린 CONN_FRAMES 봉투와 섞이지 않게 따로 인코딩한다. */
  private readonly urgentWriter = new GatewayIpcWriter({ initialCapacity: 64 });
  private closing = false;
  private closed: Promise<void> | null = null;
  private readonly flushAtBytes: number;
  private readonly now: () => number;
  /** 부하 접속 제한(admission 옵션이 있을 때만). */
  private readonly admission: GatewayAdmission | null;
  /**
   * 연결 상한에 닿아 있다(상한 도달 ~ 재개 문턱 capReopenAt 이하 — 히스테리시스). LISTEN_REPORT closed에 포함한다: 상한 거절도 KICK 9라
   * 공유 포트에 여유 있는 게이트웨이가 있으면 양보하는 편이 낫다(ops 권고대로 GATEWAY_MAX_CONNECTIONS를 조이면 이것이 먼저 닿는다).
   */
  private capFull = false;
  /** 최근 PONG 왕복(ms)과 관측 시각 — rtt 신호(창 안에서만). */
  private lastRttMs = 0;
  private lastRttAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly opts: GatewayCoreOptions) {
    this.flushAtBytes = opts.flushAtBytes ?? IPC_DEFAULT_BATCH_SPLIT_BYTES;
    this.now = opts.now ?? (() => performance.now());
    this.edge = createClientEdge(this.edgeSink(), opts.edge ?? {});
    this.delivery = new GatewayDelivery(this.conns, this.now);
    this.clientListener = new GatewayListener({
      gatewayId: opts.gatewayId,
      socket: this.edge,
      conns: () => this.conns.size,
      changed: () => this.sendListenReport(),
      ...(opts.listenYield !== undefined ? { yieldOpts: opts.listenYield } : {}),
      ...(opts.listenBind !== undefined ? { bind: opts.listenBind } : {}),
    });
    const host = {
      gatewayId: opts.gatewayId,
      conns: this.conns,
      ipcRttMs: (t: number) => this.ipcRttMs(t),
      onTransition: () => this.sendListenReport(),
    };
    this.admission = opts.admission === undefined ? null : new GatewayAdmission(host, opts.admission);
    liveCores.add(this);
  }

  /** 부하 접속 제한으로 새 연결을 거절 중인가(admission 미설정이면 항상 false). */
  get admissionActive(): boolean {
    return this.admission?.active ?? false;
  }

  /** 월드 파이프의 미전송 바이트(링크 없음 = 0). */
  ipcPendingBytes(): number {
    return this.link?.pipe?.pendingBytes ?? 0;
  }

  /** 핸드셰이크를 마친 월드 링크가 살아 있다. */
  get ready(): boolean {
    const l = this.link;
    return l?.live === true && l.hello !== null;
  }

  get listening(): boolean {
    return this.clientListener.listening;
  }

  /** 월드 LISTEN yield로 리스너가 내려가 있다(재개 재시도 중 포함). */
  get listenYielded(): boolean {
    return this.clientListener.yielded;
  }

  connectionCount(): number {
    return this.conns.size;
  }

  connection(localId: number): GatewayConn | undefined {
    return this.conns.get(localId);
  }

  /**
   * 월드에 붙는다 — connect가 이 코어의 핸들러를 붙인 파이프를 돌려주면 HELLO를 보내고, HELLO_ACK에서 resolve. 그 전에 끊기거나
   * connect가 던지면 reject(연결 표 무접촉 — 아직 리스닝 전), 월드가 HELLO_NACK으로 거절하면 WorldRefusedError로 reject.
   * 이미 살아 있는 링크가 있거나 종료(close) 뒤면 reject.
   */
  async attachWorld(connect: WorldConnector): Promise<WorldSession> {
    if (this.closing) throw new Error("gateway core closed");
    if (this.link?.live === true) throw new Error("gateway core already attached to a world");
    const link = this.newLink();
    this.link = link;
    try {
      link.pipe = await connect(this.worldHandlers(link));
    } catch (err) {
      this.loseWorld(link, "error", toError(err));
      throw err;
    }
    if (!link.live) link.pipe.destroy();
    else {
      link.writer.hello({
        gatewayId: this.opts.gatewayId,
        incarnation: this.opts.incarnation,
        pid: this.opts.pid,
        token: this.opts.ipcToken ?? "",
      });
      this.flushLink(link);
    }
    return link.handshake.promise;
  }

  /**
   * 클라 리스닝 시작 — 월드 HELLO_ACK 뒤에만(그 전엔 throw). 이 세션에서 이미 리스닝 중(또는 양보 중)이면 그 포트. 반환 = 바인드된 포트.
   * 이 월드 세션의 첫 LISTEN_REPORT가 여기서 나간다.
   */
  listen(opts: GatewayListenOptions): number {
    if (!this.ready) throw new Error("gateway listen before world HELLO_ACK");
    const port = this.clientListener.open(opts);
    this.sendListenReport();
    return port;
  }

  /** 클라 리스닝 중지(이미 받은 연결은 그대로 — 킥은 호출자 몫). 링크가 살아 있으면 listening 0을 보고한다. idempotent. */
  stopListening(): void {
    if (this.clientListener.stop()) this.sendListenReport();
  }

  /**
   * 우아한 종료 — 리스너 중지 → BYE(reason) → 전원 KICK 6 "gateway shutdown"(CONN_CLOSED gw_shutdown) → flush → 파이프 end.
   * 월드 링크가 닫힐 때(lost)까지 기다린다. 이후 attachWorld는 reject. idempotent(두 번째 호출은 첫 종료를 기다린다).
   */
  close(reason: ByeReason = BYE_REASON.Shutdown): Promise<void> {
    this.closed ??= this.closeGracefully(reason);
    return this.closed;
  }

  private async closeGracefully(reason: ByeReason): Promise<void> {
    this.closing = true;
    liveCores.delete(this);
    this.admission?.stop();
    this.stopListening();
    const link = this.link;
    if (link === null || !link.live || link.hello === null || link.pipe === null) {
      if (link !== null) this.loseWorld(link, "local");
      this.kickAll(KICK_REASON.ServerShutdown, "gateway shutdown", true);
      return;
    }
    link.writer.bye(reason);
    this.kickAll(KICK_REASON.ServerShutdown, "gateway shutdown", false);
    this.flushLink(link);
    link.pipe.end();
    await link.lost.promise;
  }

  // ── 월드 링크 ──────────────────────────────────────────────────────────────────────────────────────────────────

  private newLink(): WorldLink {
    const link: WorldLink = {
      pipe: null,
      decoder: null,
      writer: new GatewayIpcWriter(this.opts.writer),
      hello: null,
      live: true,
      pings: new Map(),
      shutdownSeen: false,
      flushQueued: false,
      handshake: deferred<WorldSession>(),
      lost: deferred<WorldLossReason>(),
    };
    link.decoder = createGatewaySideDecoder((m) => this.onWorldMessage(link, m), this.opts.decoder);
    return link;
  }

  private worldHandlers(link: WorldLink): IpcPipeHandlers {
    return {
      data: (chunk) => this.onWorldData(link, chunk),
      // SHUTDOWN 뒤의 끊김은 예고된 종료 — 월드가 닫거나 프로세스가 끝나며 끊긴다(Windows는 RST라 error로 보인다).
      close: (reason, error) =>
        this.loseWorld(link, link.shutdownSeen && (reason === "peer" || reason === "error") ? "shutdown" : reason, error),
      heartbeat: () => this.onHeartbeat(link),
    };
  }

  private onWorldData(link: WorldLink, chunk: Buffer): void {
    gwIpcRx.inc(chunk.length);
    try {
      link.decoder?.push(chunk);
    } catch (err) {
      const kind = err instanceof IpcProtocolError ? err.kind : "handler_threw";
      log.error({ err, kind, gatewayId: this.opts.gatewayId }, "world IPC stream error — dropping world link");
      this.loseWorld(link, err instanceof IpcProtocolError ? "protocol" : "error", toError(err));
    }
  }

  private onWorldMessage(link: WorldLink, msg: WorldToGatewayMsg): void {
    if (!link.live) return;
    switch (msg.type) {
      case IPC_MSG.HELLO_ACK:
        this.onHelloAck(link, msg);
        return;
      case IPC_MSG.HELLO_NACK:
        this.onHelloNack(link, msg);
        return;
      case IPC_MSG.PONG:
        this.onPong(link, msg.seq); // 생존은 파이프가 수신 바이트로 본다 — 여기는 왕복 관측뿐.
        return;
      case IPC_MSG.SHUTDOWN:
        this.onShutdown(link, msg.kickReason);
        return;
      case IPC_MSG.CONN_DELIVER:
        this.delivery.deliver(msg.deliveries);
        return;
      case IPC_MSG.CONN_STATE: {
        const conn = this.conns.get(msg.localId);
        if (conn === undefined) staleState.inc();
        else conn.applyState(msg.state);
        return;
      }
      case IPC_MSG.CONN_CLOSE:
        this.onWorldClose(msg.localId);
        return;
      case IPC_MSG.CONN_ACCEPTED: {
        const conn = this.conns.get(msg.localId);
        if (conn === undefined) staleAccepted.inc();
        else conn.worldConnId = msg.worldConnId;
        return;
      }
      case IPC_MSG.ADMISSION:
        this.onWorldAdmission(msg.busy);
        return;
      case IPC_MSG.LISTEN:
        this.clientListener.apply(msg.mode, msg.seq, this.admission?.cause ?? (this.capFull ? "cap" : null));
        this.sendListenReport(); // 무동작이어도 ack.
        return;
      case IPC_MSG.CONN_MULTICAST:
        this.delivery.multicast(msg.casts);
        return;
      case IPC_MSG.CONN_FLUSH:
        this.delivery.flushCasts();
        return;
      case IPC_MSG.CONN_DELIVER_SHARED:
        this.delivery.deliverShared(msg);
        return;
    }
  }

  private onHelloAck(link: WorldLink, m: HelloAckMsg): void {
    link.hello = { worldIncarnation: m.worldIncarnation, connCap: m.connCap };
    this.connCap = Math.min(this.opts.maxConnections ?? m.connCap, m.connCap);
    metrics.gwWorldConnected.inc();
    log.info(
      { gatewayId: this.opts.gatewayId, worldIncarnation: m.worldIncarnation, connCap: this.connCap },
      "world connected (HELLO_ACK)",
    );
    link.handshake.resolve({ worldIncarnation: m.worldIncarnation, connCap: this.connCap, lost: link.lost.promise });
  }

  /** HELLO 거절 — 핸드셰이크 전이라 연결이 없다. 메트릭만 세고 attachWorld를 사유로 reject(로그·정책은 호출자). */
  private onHelloNack(link: WorldLink, m: HelloNackMsg): void {
    const reason = HELLO_NACK_LABELS[m.reason];
    metrics.gwHelloRefused.inc({ reason });
    this.loseWorld(link, "local", new WorldRefusedError(reason, m.ipcVer));
  }

  private onWorldClose(localId: number): void {
    const conn = this.conns.get(localId);
    if (conn === undefined) {
      staleClose.inc();
      return;
    }
    conn.noteClose(CONN_CLOSED_REASON.WorldRequested);
    conn.socket.end();
  }

  private onShutdown(link: WorldLink, kickReason: number): void {
    link.shutdownSeen = true;
    log.warn({ gatewayId: this.opts.gatewayId, kickReason, conns: this.conns.size }, "world shutting down (SHUTDOWN) — kicking clients");
    this.stopListening();
    this.kickAll(kickReason, "server shutdown", false);
    this.flushLink(link);
  }

  private onHeartbeat(link: WorldLink): void {
    if (!link.live) return;
    this.pingSeq = (this.pingSeq + 1) >>> 0;
    link.pings.set(this.pingSeq, this.now());
    if (link.pings.size > MAX_PENDING_PINGS) link.pings.delete(link.pings.keys().next().value!);
    link.writer.ping(this.pingSeq);
    this.flushLink(link);
  }

  /** PONG — 보낸 PING이 기록에 있으면 왕복 시간 관측(중복·모르는 seq는 무시). */
  private onPong(link: WorldLink, seq: number): void {
    const sentAt = link.pings.get(seq);
    if (sentAt === undefined) return;
    link.pings.delete(seq);
    const now = this.now();
    this.lastRttMs = now - sentAt;
    this.lastRttAt = now;
    metrics.gwIpcRttMs.observe(this.lastRttMs);
  }

  /** 월드 판정 — 이 게이트웨이의 IPC 적체가 월드 소프트 임계를 넘었다(busy)/풀렸다(open). admission 미설정이면 로그만. */
  private onWorldAdmission(busy: boolean): void {
    const meta = { gatewayId: this.opts.gatewayId, worldBusy: busy, conns: this.conns.size };
    if (busy) log.warn(meta, "world reports this gateway's IPC backlog over its soft threshold (ADMISSION busy)");
    else log.info(meta, "world reports this gateway's IPC backlog cleared (ADMISSION open)");
    this.admission?.setWorldBusy(busy);
  }

  /** rtt 신호 — 답 없는 가장 오래된 PING의 나이 ∨ 창 안 최근 왕복(월드 PONG은 그 앞의 W→G 적체 뒤에 온다). */
  private ipcRttMs(now: number): number {
    const link = this.link;
    let age = 0;
    if (link?.live === true) {
      const oldest = link.pings.values().next();
      if (oldest.done !== true) age = now - oldest.value;
    }
    const windowMs = this.opts.admission?.windowMs ?? DEFAULT_LOAD_WINDOW_MS;
    return Math.max(age, now - this.lastRttAt < windowMs ? this.lastRttMs : 0);
  }

  /**
   * 월드 유실 — 디코더 정지·파이프 닫기(이미 닫혔으면 무동작). 핸드셰이크 전이면 attachWorld를 reject하는 것으로 끝(리스닝 전이라
   * 연결이 없다). 핸드셰이크 뒤면 리스너 중지 + 전원 KICK 6(연결 표를 먼저 비운다 — 죽은 링크에 CONN_CLOSED를 쓰지 않는다) +
   * lost resolve.
   */
  private loseWorld(link: WorldLink, reason: WorldLossReason, error?: Error): void {
    if (!link.live) return;
    link.live = false;
    link.decoder?.destroy();
    link.pipe?.destroy(reason === "protocol" ? "error" : "local", error);
    if (this.link === link) this.link = null;
    if (link.hello === null) {
      link.handshake.reject(error ?? new Error(`world IPC closed (${reason}) before HELLO_ACK`));
      return;
    }
    metrics.gwWorldConnected.dec();
    metrics.gwWorldLost.inc({ reason });
    this.admission?.setWorldBusy(false); // 다음 월드는 open으로 시작한다(판정은 그 피어의 적체 기준).
    this.capFull = false; // 아래 kickAll이 연결 표를 비운다(release를 거치지 않는다).
    this.clientListener.endSession(); // 리스너 중지 + 양보 상태·ack 초기화 — 다음 세션은 listen()부터(죽은 링크라 보고 없음).
    const kicked = this.kickAll(KICK_REASON.ServerShutdown, "world unavailable", true); // 킥이 미룬 MULTICAST 바이트를 먼저 쓴다.
    this.delivery.clear();
    const meta = { gatewayId: this.opts.gatewayId, reason, err: error, kicked };
    if (reason === "local") log.info(meta, "world link closed");
    else if (reason === "shutdown") log.info(meta, "world shut down (after SHUTDOWN) — waiting for the next world");
    else log.warn(meta, "world lost — clients kicked, listener stopped");
    link.lost.resolve(reason);
  }

  /**
   * 전원 킥(KICK + 우아한 종료). forget이면 연결 표를 먼저 비워 close 콜백이 CONN_CLOSED를 쓰지 않게 한다(월드 유실 — world_lost로
   * 센다). 아니면 각 close가 CONN_CLOSED(gw_shutdown)를 쓴다 — 꼬리 flush를 기다리는 연결은 그 뒤에 쓰고, 그 사이 파이프가
   * 끝났으면(우아한 종료의 end) 기록이 버려져 월드의 피어 정리가 닫는다. 반환 = 대상 수.
   */
  private kickAll(kickReason: number, detail: string, forget: boolean): number {
    const list = [...this.conns.values()];
    if (forget && list.length > 0) {
      this.conns.clear();
      metrics.gwConnections.dec(list.length);
      closedWorldLost.inc(list.length);
    }
    for (const conn of list) {
      conn.noteClose(CONN_CLOSED_REASON.GatewayShutdown);
      kickAndClose(conn, kickReason, detail);
    }
    return list.length;
  }

  /**
   * 리슨 상태 스냅샷(LISTEN_REPORT)을 긴급 송신 — 피어 단위라 연결별 순서가 없고, CONN_FRAMES 적체 뒤로 보내면 월드의 판단이 늦는다.
   * 핸드셰이크를 마친 산 링크가 있고 이 세션에서 리슨한 뒤에만(그 전 보고가 없으면 월드는 이 피어에 지시하지 않는다).
   */
  private sendListenReport(): void {
    const link = this.link;
    if (link === null || !link.live || link.hello === null || link.pipe === null) return;
    const state = this.clientListener.state((this.admission?.active ?? false) || this.capFull);
    if (state === null) return;
    const pipe = link.pipe;
    this.urgentWriter.listenReport(state);
    gwIpcTx.inc(this.urgentWriter.bufferedBytes);
    this.urgentWriter.flushTo({ write: (buf, release) => pipe.writeUrgent(buf, release) });
  }

  /** 턴 끝 flush 예약(1회) — 배치가 임계 이상이면 즉시. */
  private markDirty(link: WorldLink): void {
    if (link.writer.bufferedBytes >= this.flushAtBytes) {
      this.flushLink(link);
      return;
    }
    if (link.flushQueued) return;
    link.flushQueued = true;
    setImmediate(() => {
      link.flushQueued = false;
      this.flushLink(link);
    });
  }

  /** 배치를 봉투째 파이프로. false(닫힌 파이프)면 close 통지가 유실 처리를 한다. */
  private flushLink(link: WorldLink): void {
    if (!link.live || link.pipe === null) return;
    const n = link.writer.bufferedBytes;
    if (n === 0) return;
    gwIpcTx.inc(n);
    link.writer.flushTo(link.pipe);
  }

  // ── 클라 엣지 처리기(IpcSink) ────────────────────────────────────────────────────────────────────────────────────

  private edgeSink(): EdgeSink<GatewayConn> {
    return {
      create: (socket) => new GatewayConn(socket, this.nextLocalId++),
      admit: (conn) => this.admit(conn),
      closed: (conn) => this.release(conn),
      frame: (conn, packetId, body) => this.forward(conn, packetId, body),
      // 게이트웨이는 세션 송신이 없다 — 구간이 필요 없고, 배치 flush는 frame의 markDirty가 예약한다.
      scope: (fn) => fn(),
      kicked: (conn, cause) => conn.noteClose(EDGE_KICK_REASON[cause]),
    };
  }

  private admit(conn: GatewayConn): boolean {
    const link = this.link;
    if (link === null || !link.live || link.hello === null || this.closing) {
      this.reject(conn, "world_down", KICK_REASON.ServerShutdown, "world unavailable");
      return false;
    }
    if (this.admission?.refuse(conn) === true) return false; // KICK 9 "server busy"(CONN_OPEN 없음 — 상한 거절과 같은 경로).
    if (this.conns.size >= this.connCap) {
      this.reject(conn, "cap", KICK_REASON.ServerFull, "connection cap");
      this.updateCapFull();
      return false;
    }
    this.conns.set(conn.localId, conn);
    metrics.gwConnections.inc();
    link.writer.connOpen(conn.localId, conn.remoteAddress ?? "");
    this.markDirty(link);
    this.updateCapFull();
    return true;
  }

  /** 상한 닿음 갱신(admit·release) — 진입 = 연결 수 ≥ 상한, 해제 = 재개 문턱 이하. 바뀌면 LISTEN_REPORT(closed). */
  private updateCapFull(): void {
    const n = this.conns.size;
    const full = this.capFull ? n > capReopenAt(this.connCap) : n >= this.connCap;
    if (full === this.capFull) return;
    this.capFull = full;
    const sup = capLogSquelch.allow("cap");
    if (sup >= 0) {
      const meta = suppressedMeta({ gatewayId: this.opts.gatewayId, conns: n, connCap: this.connCap, reopenAt: capReopenAt(this.connCap) }, sup);
      if (full) log.info(meta, "gateway at its connection cap — reporting closed (shared-port listen yield)");
      else log.info(meta, "gateway below its connection-cap reopen mark — reporting open");
    }
    this.sendListenReport();
  }

  private reject(conn: GatewayConn, reason: "cap" | "world_down", kickReason: number, detail: string): void {
    metrics.gwConnRejected.inc({ reason });
    const sup = rejectWarnSquelch.allow(reason);
    if (sup >= 0) {
      log.warn(
        suppressedMeta({ gatewayId: this.opts.gatewayId, localId: conn.localId, addr: conn.remoteAddress, reason }, sup),
        "client connection rejected at gateway",
      );
    }
    kickAndClose(conn, kickReason, detail);
  }

  private forward(conn: GatewayConn, packetId: number, body: Buffer): void {
    const link = this.link;
    if (link === null || !link.live) return;
    link.writer.frame(conn.localId, packetId, body);
    this.markDirty(link);
  }

  /** close 콜백 본체 — 추적 중이던 연결이면 표에서 빼고 CONN_CLOSED(사유). 반환 = 추적 중이었나("client disconnected" 로그). */
  private release(conn: GatewayConn): boolean {
    if (this.conns.get(conn.localId) !== conn) return false;
    this.conns.delete(conn.localId);
    metrics.gwConnections.dec();
    const reason = conn.closedReason();
    closedHandles[reason]!.inc();
    const link = this.link;
    if (link?.live === true) {
      link.writer.connClosed(conn.localId, reason);
      this.markDirty(link);
    }
    this.updateCapFull();
    return true;
  }
}
