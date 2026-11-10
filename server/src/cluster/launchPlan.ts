// 슈퍼바이저 CLI·배치 계획 — 성능 4단계 4.3a(`bun run cluster -- --gateways N`, cluster/launch.ts). 순수 함수(부수효과 없음).
//
// 프로세스 배치(월드 1 + 게이트웨이 N, 같은 WORLD_IPC):
//   world   ROLE=world, PROC_NAME=world, ADMIN_PORT=<admin base>, WORLD_CLIENT_LISTEN=0(클라는 게이트웨이로만)
//   gw<i>   ROLE=gateway, GATEWAY_ID=i(1..N), PROC_NAME=gw<i>, ADMIN_PORT=<admin base>+i,
//           PORT = 공유면 <port>(REUSE_PORT=1 — Linux 커널 해시 분산, 4.0 실측 K=2 ±6%) / 분리면 <port>+i-1
//   전원    CLUSTER_SUPERVISED=1 — SIGINT 무시·슈퍼바이저 메시지로 종료(cluster/supervisorLink.ts). IPC_TOKEN = 같은 공유 비밀
//           (HELLO 인증 — 슈퍼바이저가 env 값 또는 기동마다 만든 무작위 값을 준다, launch.ts).
// 공유 포트는 Linux 기본(--distinct-ports로 끔), Windows는 불가(두 번째 리스너가 연결을 받지 않는다 — env 가드와 같은 이유),
// macOS는 기본 분리(--shared-port로 켬 — BSD SO_REUSEPORT 분산은 미검증).
// 포트(클라 구간·admin 구간·IPC tcp 포트)가 겹치거나 65535를 넘으면 기동 전에 거부한다.

import { parseIpcAddress } from "../config/ipcAddress";

export interface LaunchOptions {
  readonly gateways: number;
  /** 공유면 게이트웨이 전원의 클라 포트, 분리면 첫 게이트웨이 포트. */
  readonly port: number;
  /** 월드 admin 포트 — 게이트웨이 i는 adminPort + i. */
  readonly adminPort: number;
  readonly worldIpc: string;
  readonly sharedPort: boolean;
  /** 비정상 종료 재시작 대기 — 초기값, 빠른 재종료마다 2배, 상한. */
  readonly restartInitialMs: number;
  readonly restartMaxMs: number;
  /** 이만큼 살아 있다가 죽으면 백오프를 초기화(ms). */
  readonly stableMs: number;
  /** 기동 시 월드 healthz·게이트웨이 HELLO_ACK 대기 상한(ms). */
  readonly readyTimeoutMs: number;
  /** 우아한 종료 대기 상한(ms) — 넘으면 강제 종료. 월드는 최종 저장 + SHUTDOWN 드레인(10 s)보다 길게. */
  readonly worldStopTimeoutMs: number;
  readonly gatewayStopTimeoutMs: number;
}

/** 자식 env로만 건네는 비밀값 — 로그·계획 출력에 싣지 않는다. */
export interface ClusterSecrets {
  /** 월드·게이트웨이 IPC 공유 비밀(env IPC_TOKEN). */
  readonly ipcToken: string;
}

/** env에서 오는 기본값(PORT·ADMIN_PORT·WORLD_IPC). */
export interface LaunchDefaults {
  readonly port: number;
  readonly adminPort: number;
  readonly worldIpc: string;
}

export type ProcRole = "world" | "gateway";

export interface ProcSpec {
  /** 로그·진단 이름 = PROC_NAME(world, gw1, …). */
  readonly name: string;
  readonly role: ProcRole;
  readonly gatewayId: number | null;
  readonly adminPort: number;
  /** 게이트웨이 클라 포트(월드는 null). */
  readonly clientPort: number | null;
  /** 상속 env 위에 덮을 값. */
  readonly env: Readonly<Record<string, string>>;
}

export interface ClusterPlan {
  readonly world: ProcSpec;
  readonly gateways: readonly ProcSpec[];
  /** 클라가 붙을 포트(공유면 1개). */
  readonly clientPorts: readonly number[];
  readonly sharedPort: boolean;
}

export const MAX_GATEWAYS = 64;

export const LAUNCH_HELP = `cluster launcher — world + N gateways (dev/WSL supervisor, performance stage 4)
  bun run cluster -- --gateways N [flags]
  --gateways N              gateway processes (1-${MAX_GATEWAYS}, default 2)
  --port P                  client port: shared by every gateway (Linux, REUSE_PORT) or gateway i = P+i-1 (default env PORT)
  --admin-port P            world admin port; gateway i = P+i (default env ADMIN_PORT)
  --world-ipc ADDR          tcp://127.0.0.1:<port> | unix:<path> (default env WORLD_IPC)
  --distinct-ports          one client port per gateway even on Linux
  --shared-port             share one client port (Linux default; not on Windows)
  --restart-initial-ms MS   first restart delay after a crash (default 500, doubles per quick crash)
  --restart-max-ms MS       restart delay cap (default 10000)
shutdown: SIGINT/SIGTERM (or the IPC shutdown message) stops the world first (final save, SHUTDOWN → gateways kick
clients with KICK 6), then the gateways. A second signal kills every child.`;

const BOOL_FLAGS = new Set(["--distinct-ports", "--shared-port", "--help", "-h"]);
const VALUE_FLAGS = new Set([
  "--gateways",
  "--port",
  "--admin-port",
  "--world-ipc",
  "--restart-initial-ms",
  "--restart-max-ms",
]);

const DEFAULT_RESTART_INITIAL_MS = 500;
const DEFAULT_RESTART_MAX_MS = 10_000;
const DEFAULT_STABLE_MS = 10_000;
const DEFAULT_READY_TIMEOUT_MS = 60_000;
const DEFAULT_WORLD_STOP_TIMEOUT_MS = 30_000;
const DEFAULT_GATEWAY_STOP_TIMEOUT_MS = 15_000;

function collectFlags(argv: readonly string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("-")) throw new Error(`unexpected argument "${a}"`);
    if (BOOL_FLAGS.has(a)) {
      m.set(a, "1");
      continue;
    }
    if (!VALUE_FLAGS.has(a)) throw new Error(`unknown flag ${a}`);
    const v = argv[i + 1];
    if (v === undefined) throw new Error(`missing value for ${a}`);
    m.set(a, v);
    i++;
  }
  return m;
}

function intFlag(m: Map<string, string>, flag: string, fallback: number, min: number, max: number): number {
  const raw = m.get(flag);
  const n = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${flag} must be an integer in [${min}, ${max}], got ${raw ?? fallback}`);
  }
  return n;
}

function sharedPortFor(m: Map<string, string>, platform: NodeJS.Platform): boolean {
  if (m.has("--shared-port") && m.has("--distinct-ports")) throw new Error("--shared-port and --distinct-ports conflict");
  if (m.has("--shared-port")) {
    if (platform === "win32") throw new Error("--shared-port is not supported on Windows (REUSE_PORT) — gateways need distinct ports");
    return true;
  }
  if (m.has("--distinct-ports")) return false;
  return platform === "linux";
}

function worldIpcFor(m: Map<string, string>, fallback: string, platform: NodeJS.Platform): string {
  const v = m.get("--world-ipc") ?? fallback;
  const addr = parseIpcAddress(v);
  if (addr === null) throw new Error(`--world-ipc must be tcp://<loopback>:<port> or unix:<path>, got ${v}`);
  if (addr.kind === "unix" && platform === "win32") {
    throw new Error("--world-ipc unix:… is not supported on Windows (named pipes hide backpressure)");
  }
  return v;
}

/** argv(스크립트 뒤 인자) → 옵션. "help" = 도움말 요청. 잘못된 값은 throw. */
export function parseLaunchArgs(
  argv: readonly string[],
  defaults: LaunchDefaults,
  platform: NodeJS.Platform,
): LaunchOptions | "help" {
  const m = collectFlags(argv);
  if (m.has("--help") || m.has("-h")) return "help";
  const restartInitialMs = intFlag(m, "--restart-initial-ms", DEFAULT_RESTART_INITIAL_MS, 1, 600_000);
  const restartMaxMs = intFlag(m, "--restart-max-ms", Math.max(DEFAULT_RESTART_MAX_MS, restartInitialMs), 1, 600_000);
  if (restartMaxMs < restartInitialMs) throw new Error("--restart-max-ms must be >= --restart-initial-ms");
  return {
    gateways: intFlag(m, "--gateways", 2, 1, MAX_GATEWAYS),
    port: intFlag(m, "--port", defaults.port, 1, 65_535),
    adminPort: intFlag(m, "--admin-port", defaults.adminPort, 1, 65_535),
    worldIpc: worldIpcFor(m, defaults.worldIpc, platform),
    sharedPort: sharedPortFor(m, platform),
    restartInitialMs,
    restartMaxMs,
    stableMs: DEFAULT_STABLE_MS,
    readyTimeoutMs: DEFAULT_READY_TIMEOUT_MS,
    worldStopTimeoutMs: DEFAULT_WORLD_STOP_TIMEOUT_MS,
    gatewayStopTimeoutMs: DEFAULT_GATEWAY_STOP_TIMEOUT_MS,
  };
}

/** 포트 구간 겹침·상한 검사 — 겹치면 throw. */
function assertPorts(o: LaunchOptions, clientPorts: readonly number[]): void {
  const adminPorts = Array.from({ length: o.gateways + 1 }, (_, i) => o.adminPort + i);
  const all = [...clientPorts, ...adminPorts];
  const top = Math.max(...all);
  if (top > 65_535) throw new Error(`port range exceeds 65535 (highest ${top}) — lower --port/--admin-port`);
  const ipc = parseIpcAddress(o.worldIpc);
  if (ipc?.kind === "tcp") all.push(ipc.port);
  const seen = new Set<number>();
  for (const p of all) {
    if (seen.has(p)) throw new Error(`port ${p} is used twice (client ${clientPorts.join(",")}, admin ${adminPorts.join(",")}, ipc ${o.worldIpc})`);
    seen.add(p);
  }
}

function worldSpec(o: LaunchOptions, s: ClusterSecrets): ProcSpec {
  return {
    name: "world",
    role: "world",
    gatewayId: null,
    adminPort: o.adminPort,
    clientPort: null,
    env: {
      ROLE: "world",
      PROC_NAME: "world",
      ADMIN_PORT: String(o.adminPort),
      PORT: String(o.port),
      WORLD_IPC: o.worldIpc,
      IPC_TOKEN: s.ipcToken,
      WORLD_CLIENT_LISTEN: "0",
      REUSE_PORT: "0",
      CLUSTER_SUPERVISED: "1",
    },
  };
}

function gatewaySpec(o: LaunchOptions, s: ClusterSecrets, id: number, clientPort: number): ProcSpec {
  const adminPort = o.adminPort + id;
  return {
    name: `gw${id}`,
    role: "gateway",
    gatewayId: id,
    adminPort,
    clientPort,
    env: {
      ROLE: "gateway",
      GATEWAY_ID: String(id),
      PROC_NAME: `gw${id}`,
      ADMIN_PORT: String(adminPort),
      PORT: String(clientPort),
      WORLD_IPC: o.worldIpc,
      IPC_TOKEN: s.ipcToken,
      REUSE_PORT: o.sharedPort ? "1" : "0",
      CLUSTER_SUPERVISED: "1",
    },
  };
}

/** 옵션 → 프로세스 배치. 포트가 겹치면 throw. */
export function planCluster(o: LaunchOptions, secrets: ClusterSecrets): ClusterPlan {
  const ids = Array.from({ length: o.gateways }, (_, i) => i + 1);
  const portOf = (id: number): number => (o.sharedPort ? o.port : o.port + id - 1);
  const clientPorts = o.sharedPort ? [o.port] : ids.map(portOf);
  assertPorts(o, clientPorts);
  return {
    world: worldSpec(o, secrets),
    gateways: ids.map((id) => gatewaySpec(o, secrets, id, portOf(id))),
    clientPorts,
    sharedPort: o.sharedPort,
  };
}
