// 게이트웨이 프로세스 — 성능 4단계(게이트웨이 분리) 4.2c. ROLE=gateway면 index.ts가 이 모듈만 동적 import한다 — 월드·DB 모듈을
// 싣지 않는다(DB 단일 writer = 월드, initDb는 ROLE=gateway면 열기 전에 throw).
//
// startGateway(설정) — 코어(gatewayCore) + 월드 링크 루프. 운영과 in-process 토폴로지 테스트가 같은 배선을 쓴다:
//   접속(connectIpc — heartbeat·dead·대기 상한) → HELLO → HELLO_ACK 뒤에만 클라 리스닝(월드가 수용 판정을 할 수 있을 때만 받는다)
//   → 월드 유실(코어: 리스너 중지 + 전원 KICK 6) → 백오프 재접속(초기 250 ms, 실패마다 2배·상한 5 s, 핸드셰이크 성공 뒤 초기화).
//   incarnation은 프로세스 수명 동안 하나 — 같은 월드에 다시 붙으면 월드가 옛 피어를 정리하고 받고, 연결은 이월하지 않는다(유실 때
//   전원 킥). 클라 리스너 바인드 실패는 치명(listening reject — runGatewayProcess가 종료).
//   월드의 HELLO 거절(HELLO_NACK — 4단계 리뷰)은 사유별: closed(월드 종료 중) = 일반 백오프 재시도, fenced(같은 GATEWAY_ID의 더 새
//   incarnation이 등록됨 — 중복 기동·은퇴된 옛 프로세스) = 치명 아님·상한 백오프로 대기(종료하면 슈퍼바이저 재기동이 새 incarnation
//   으로 살아 있는 쪽을 밀어내 둘이 번갈아 끊는다), version·auth(빌드·IPC_TOKEN 불일치 — 재시도로 안 풀린다) = 치명(onFatal → 종료,
//   슈퍼바이저가 현재 빌드·env로 재기동). 펜싱은 스스로 풀리지 않는다 — incarnation은 프로세스 수명 동안 하나라 월드의 은퇴 목록이
//   지워질 때(월드 재기동)까지 같은 값으로 거절된다. 복구 = 중복을 멈춘 뒤 이 프로세스를 재기동(새 incarnation). 그래서 로그는 연속
//   거절의 첫 회만 error(조치 안내), 이후는 warn을 분당 1줄로 억제한다 — 경보 소스는 mmorpg_gw_hello_refused_total{reason="fenced"}.
// 부하 기반 접속 제한(성능 4.5): env GW_ADMISSION_*(gatewayAdmissionFromEnv) → 코어 admission 옵션 — 거절은 gatewayCore.admit.
// 공유 포트 리스너 양보(IPC v14): REUSE_PORT=1·GW_ADMISSION=1·GW_LISTEN_YIELD=1일 때만 코어 listenYield — 집행은 gatewayListen.
// runGatewayProcess() — env → 관측(proc 태그·파일 싱크·크래시 핸들러) → admin HTTP(GM 없음: metrics·healthz·logs, dev는 /admin/perf
//   — tick 없이 CPU·메모리·연결 수·stall 주입: 카오스 시험이 게이트웨이 이벤트 루프 포화를 재현한다) → startGateway →
//   종료 트리거(SIGTERM·비감독 SIGINT·슈퍼바이저 메시지·슈퍼바이저 유실 — cluster/supervisorLink)면 우아한 종료(BYE → 전원 KICK 6
//   → CONN_CLOSED → IPC end) 후 싱크 드레인·exit.
// 시계·타이머는 sim/world 밖(gateway/) — 결정론 규칙 무관.

import { type Env, env } from "../config/env";
import { type IpcAddress, parseIpcAddress } from "../config/ipcAddress";
import { type ClientEdgeOptions, edgeOptionsFromEnv } from "../network/clientEdge";
import { configureOutbound } from "../network/outboundLink";
import { startAdminHttp } from "../obs/adminHttp";
import { type PerfEndpoint, createPerfEndpoint } from "../obs/perfEndpoint";
import { createLogger, flushAllSinks } from "../obs/logger";
import { type Squelch, createSquelch, suppressedMeta } from "../obs/logSquelch";
import { bootProcessObs } from "../obs/processBoot";
import { newIncarnation } from "../cluster/incarnation";
import { type ShutdownTrigger, installShutdownTriggers } from "../cluster/supervisorLink";
import {
  type IpcPipe,
  type IpcPipeHandlers,
  type IpcPipeOptions,
  connectIpc,
  ipcPipeOptionsFromEnv,
} from "../cluster/ipcPipe";
import { IPC_VERSION } from "../cluster/ipcSchema";
import { GatewayCore, type GatewayListenOptions, type WorldSession, WorldRefusedError } from "./gatewayCore";
import type { ListenYieldOptions } from "./gatewayListen";
import { type GatewayAdmissionOptions, gatewayAdmissionFromEnv } from "./gatewayLoad";

const log = createLogger("gateway");

const DEFAULT_RECONNECT_INITIAL_MS = 250;
const DEFAULT_RECONNECT_MAX_MS = 5000;
/** 펜싱 대기 중 반복 로그 — 분당 1줄(첫 거절의 error가 버킷을 먼저 쓴다). */
const FENCED_REPEAT_LOG = { ratePerSec: 1 / 60, burst: 1 } as const;
const FENCED_MSG =
  "world refused HELLO (fenced) — another process holds this GATEWAY_ID with a newer incarnation; this process stays fenced " +
  "until it is restarted — stop the duplicate, then restart this gateway (supervised: kill it and the supervisor respawns it " +
  "with a new incarnation)";

/** 월드 IPC 접속 함수(기본 connectIpc). */
export type IpcConnect = (addr: IpcAddress, handlers: IpcPipeHandlers, opts: IpcPipeOptions) => Promise<IpcPipe>;

export interface GatewayConfig {
  readonly gatewayId: number;
  /** 기본 = 무작위 u32(newIncarnation) — 프로세스 기동마다 새 값. */
  readonly incarnation?: number;
  /** 공유 비밀(env IPC_TOKEN) — HELLO에 싣는다. 미지정 = 빈 값. */
  readonly ipcToken?: string;
  readonly worldIpc: IpcAddress;
  /** 월드 IPC 파이프 옵션(heartbeat·dead·대기 상한). */
  readonly pipe?: IpcPipeOptions;
  readonly client: GatewayListenOptions;
  /** 게이트웨이 연결 상한(HELLO_ACK connCap으로 다시 묶인다). */
  readonly maxConnections?: number;
  /** 클라 엣지 정책(monolith와 같은 옵션). */
  readonly edge?: ClientEdgeOptions;
  /** 부하 기반 접속 제한(성능 4.5, env GW_ADMISSION_*). 미지정 = 끔. */
  readonly admission?: GatewayAdmissionOptions;
  /** 공유 포트 리스너 양보(IPC v14, env GW_LISTEN_YIELD — 공유 포트·접속 제한 켬일 때만). 미지정 = 끔(LISTEN은 ack만). */
  readonly listenYield?: ListenYieldOptions;
  readonly reconnectInitialMs?: number;
  readonly reconnectMaxMs?: number;
  /** IPC 접속(기본 connectIpc) — 테스트 주입. */
  readonly connect?: IpcConnect;
  /**
   * 복구 불가 오류(클라 리스너 바인드 실패 — 첫 리스닝이든 재접속 뒤 재리스닝이든, 월드의 HELLO 거절 version·auth). 호출 시점에
   * 게이트웨이는 이미 멈췄다(코어 close). runGatewayProcess는 종료한다(슈퍼바이저가 재기동 — crash-only).
   */
  readonly onFatal?: (err: Error) => void;
}

export interface GatewayHandle {
  readonly core: GatewayCore;
  /** 첫 HELLO_ACK 뒤 클라 리스닝을 시작하면 그 포트로 resolve, 바인드 실패면 reject. */
  readonly listening: Promise<number>;
  /** 현재 클라 리스닝 포트 — 월드 유실과 재접속 사이엔 null. */
  port(): number | null;
  /** 우아한 종료(재접속 루프 정지 → 코어 close). idempotent. */
  stop(): Promise<void>;
}

interface Listening {
  readonly promise: Promise<number>;
  resolve(port: number): void;
  reject(err: Error): void;
}

/** 월드 1회의 결과 — served: 핸드셰이크까지 갔다(백오프 초기화), failed: 접속·핸드셰이크 실패(백오프 증가), hold: 상한 대기. */
type ServeOutcome = "served" | "failed" | "hold";

interface LoopState {
  stopping: boolean;
  port: number | null;
  /** 백오프 대기를 깨운다(stop). */
  wake: (() => void) | null;
  /** 연속 fenced 거절 수(다른 결과면 0) — 첫 회만 error. */
  fencedStreak: number;
  readonly fencedLog: Squelch;
}

function listeningPromise(): Listening {
  let resolve: (port: number) => void = () => {};
  let reject: (err: Error) => void = () => {};
  const promise = new Promise<number>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.catch(() => {}); // 기다리는 쪽이 없어도 미처리 거부로 보고하지 않게.
  return { promise, resolve, reject };
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

/** 게이트웨이 시작 — 반환 즉시 월드 접속 루프가 돈다(클라 리스닝은 HELLO_ACK 뒤). */
export function startGateway(cfg: GatewayConfig): GatewayHandle {
  const core = new GatewayCore({
    gatewayId: cfg.gatewayId,
    incarnation: cfg.incarnation ?? newIncarnation(),
    pid: process.pid,
    ...(cfg.ipcToken !== undefined ? { ipcToken: cfg.ipcToken } : {}),
    ...(cfg.maxConnections !== undefined ? { maxConnections: cfg.maxConnections } : {}),
    ...(cfg.edge !== undefined ? { edge: cfg.edge } : {}),
    ...(cfg.admission !== undefined ? { admission: cfg.admission } : {}),
    ...(cfg.listenYield !== undefined ? { listenYield: cfg.listenYield } : {}),
  });
  const state: LoopState = {
    stopping: false,
    port: null,
    wake: null,
    fencedStreak: 0,
    fencedLog: createSquelch(FENCED_REPEAT_LOG),
  };
  const listening = listeningPromise();
  const loop = worldLoop(core, cfg, state, listening);
  let stopped: Promise<void> | null = null;
  const stop = async (): Promise<void> => {
    state.stopping = true;
    state.wake?.();
    await core.close();
    await loop;
    state.port = null;
  };
  return {
    core,
    listening: listening.promise,
    port: () => state.port,
    stop: () => {
      stopped ??= stop();
      return stopped;
    },
  };
}

/** 월드 링크 루프 — 접속·서비스·유실을 반복, 실패가 이어지면 대기를 2배로(상한). */
async function worldLoop(core: GatewayCore, cfg: GatewayConfig, state: LoopState, listening: Listening): Promise<void> {
  const initial = cfg.reconnectInitialMs ?? DEFAULT_RECONNECT_INITIAL_MS;
  const max = cfg.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS;
  let delay = initial;
  while (!state.stopping) {
    const outcome = await serveWorld(core, cfg, state, listening);
    if (state.stopping) return;
    if (outcome !== "hold") state.fencedStreak = 0;
    if (outcome === "served") delay = initial;
    else if (outcome === "hold") delay = max;
    await pause(state, delay);
    delay = Math.min(delay * 2, max);
  }
}

/** 월드 1회 — 접속·핸드셰이크 → 클라 리스닝 → 유실까지. */
async function serveWorld(core: GatewayCore, cfg: GatewayConfig, state: LoopState, listening: Listening): Promise<ServeOutcome> {
  const connect = cfg.connect ?? connectIpc;
  let session: WorldSession;
  try {
    session = await core.attachWorld((h) => connect(cfg.worldIpc, h, cfg.pipe ?? {}));
  } catch (err) {
    if (state.stopping) return "failed";
    return onAttachFailed(core, cfg, state, listening, err);
  }
  if (state.stopping) return "served";
  try {
    state.port = core.listen(cfg.client);
  } catch (err) {
    const e = toError(err);
    log.error({ err: e, port: cfg.client.port, gatewayId: cfg.gatewayId }, "gateway client listen failed — stopping");
    await stopFatally(core, cfg, state, listening, e);
    return "served";
  }
  listening.resolve(state.port);
  await session.lost;
  state.port = null;
  return "served";
}

/** 접속·핸드셰이크 실패 — 월드 거절(HELLO_NACK)은 사유별 정책(파일 상단), 그 밖(접속 거부·HELLO_ACK 전 끊김)은 재시도. */
async function onAttachFailed(
  core: GatewayCore,
  cfg: GatewayConfig,
  state: LoopState,
  listening: Listening,
  err: unknown,
): Promise<ServeOutcome> {
  if (!(err instanceof WorldRefusedError)) {
    log.warn({ err, worldIpc: cfg.worldIpc, gatewayId: cfg.gatewayId }, "world IPC connect failed — retrying");
    return "failed";
  }
  const meta = { gatewayId: cfg.gatewayId, reason: err.reason, worldIpcVer: err.worldIpcVer, ipcVer: IPC_VERSION };
  if (err.reason === "closed") {
    log.warn(meta, "world refused HELLO (shutting down) — retrying");
    return "failed";
  }
  if (err.reason === "fenced") {
    logFenced(state, meta);
    return "hold";
  }
  log.error(meta, "world refused HELLO — IPC version or IPC_TOKEN mismatch, cannot serve clients — stopping");
  await stopFatally(core, cfg, state, listening, err);
  return "served";
}

/** fenced 로그 — 연속 거절의 첫 회 error(조치 안내), 이후 warn 분당 1줄(억제분은 suppressed로). */
function logFenced(state: LoopState, meta: Record<string, unknown>): void {
  const sup = state.fencedLog.allow("fenced");
  state.fencedStreak++;
  if (state.fencedStreak === 1) {
    log.error(meta, FENCED_MSG);
    return;
  }
  if (sup >= 0) log.warn(suppressedMeta({ ...meta, attempts: state.fencedStreak }, sup), FENCED_MSG);
}

/** 복구 불가 — 루프 정지·listening reject·코어 종료 후 onFatal(runGatewayProcess는 종료한다). */
async function stopFatally(core: GatewayCore, cfg: GatewayConfig, state: LoopState, listening: Listening, e: Error): Promise<void> {
  state.stopping = true;
  listening.reject(e);
  await core.close();
  cfg.onFatal?.(e);
}

/** 백오프 대기 — stop이면 즉시 깬다. 타이머는 unref(프로세스 종료를 붙잡지 않음). */
function pause(state: LoopState, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(done, ms);
    t.unref?.();
    function done(): void {
      clearTimeout(t);
      state.wake = null;
      resolve();
    }
    state.wake = done;
  });
}

/** env → 게이트웨이 설정(ROLE=gateway 가드가 GATEWAY_ID·WORLD_IPC를 이미 검증했다). */
export function gatewayConfigFromEnv(e: Env): GatewayConfig {
  if (e.GATEWAY_ID === undefined) throw new Error("ROLE=gateway requires GATEWAY_ID");
  const worldIpc = parseIpcAddress(e.WORLD_IPC);
  if (worldIpc === null) throw new Error(`invalid WORLD_IPC: ${e.WORLD_IPC}`);
  const admission = gatewayAdmissionFromEnv(e);
  // 양보는 공유 포트에서만 뜻이 있고(게이트웨이별 포트는 커널 분산이 없다), 닫힘 판정이 접속 제한이라 그것이 켜져 있어야 한다.
  const listenYield = e.GW_LISTEN_YIELD === "1" && e.REUSE_PORT === "1" && admission !== undefined;
  return {
    gatewayId: e.GATEWAY_ID,
    ...(e.IPC_TOKEN !== undefined ? { ipcToken: e.IPC_TOKEN } : {}),
    worldIpc,
    pipe: ipcPipeOptionsFromEnv(e, `gw${e.GATEWAY_ID}->world`),
    client: { port: e.PORT, reusePort: e.REUSE_PORT === "1" },
    maxConnections: e.GATEWAY_MAX_CONNECTIONS ?? e.MAX_CONNECTIONS,
    edge: edgeOptionsFromEnv(e),
    ...(admission !== undefined ? { admission } : {}),
    ...(listenYield ? { listenYield: {} } : {}),
  };
}

/**
 * tick 링이 없는 게이트웨이의 /admin/perf — 응답 계약(perfEndpoint)은 같고 ticks 0·빈 링. dev 전용(production은 만들지 않는다).
 * allowSideEffects(env GW_PERF_SIDE_EFFECTS=1 — 카오스 C6만) 없이는 reset=1·gc=1·stall=이 403이다: bind-only 신뢰라 같은 호스트의 아무
 * 프로세스나 정지 주입·연속 풀 GC로 이벤트 루프를 붙잡아 지연·CPU 신호로 신규 접속을 잠글 수 있었다(4.5 리뷰·검증).
 */
export function gatewayPerfEndpoint(connections: () => number, allowSideEffects = false): PerfEndpoint {
  const profiler = {
    snapshot: () => ({ ticks: 0, durationsMs: [], latenessMs: [], phasesMs: {}, flushMs: [] }),
    reset: () => {},
  };
  return createPerfEndpoint({ profiler, connections, entities: () => 0 }, { production: false, allowSideEffects });
}

/** ROLE=gateway 프로세스 본체(index.ts). */
export async function runGatewayProcess(e: Env = env): Promise<void> {
  bootProcessObs(e);
  const cfg = gatewayConfigFromEnv(e);
  configureOutbound({ maxBytes: e.OUTBOUND_MAX_BYTES });
  let core: GatewayCore | null = null;
  const perf =
    e.NODE_ENV === "production"
      ? undefined
      : gatewayPerfEndpoint(() => core?.connectionCount() ?? 0, e.GW_PERF_SIDE_EFFECTS === "1");
  // GM deps 없음 = GM 라우트 404 — 게이트웨이에는 게임 상태가 없다.
  const admin = startAdminHttp(e.ADMIN_PORT, undefined, perf !== undefined ? { perf } : undefined);
  const exit = async (code: number): Promise<never> => {
    admin.stop();
    await flushAllSinks(); // 파일 싱크 드레인 — exit가 버퍼를 삼키지 않게 마지막에.
    process.exit(code);
  };
  const onFatal = (err: Error): void => {
    log.error({ err }, "gateway cannot serve clients — exiting");
    void exit(1);
  };
  const gw = startGateway({ ...cfg, onFatal });
  core = gw.core;
  log.info(
    {
      gatewayId: cfg.gatewayId,
      worldIpc: e.WORLD_IPC,
      port: e.PORT,
      reusePort: e.REUSE_PORT === "1",
      maxConnections: cfg.maxConnections,
      admission: cfg.admission ?? "off",
      listenYield: cfg.listenYield !== undefined,
      adminPort: admin.port,
    },
    "gateway starting — client listener opens after world HELLO_ACK",
  );
  let shuttingDown = false;
  const shutdown = async (sig: ShutdownTrigger): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ sig, conns: gw.core.connectionCount() }, "shutdown signal received");
    await gw.stop();
    await exit(0);
  };
  // 4.3a: 감독(CLUSTER_SUPERVISED=1)이면 SIGINT 무시·슈퍼바이저 메시지/IPC 끊김으로 종료(supervisorLink).
  installShutdownTriggers((t) => void shutdown(t), { supervised: e.CLUSTER_SUPERVISED === "1" });
}
