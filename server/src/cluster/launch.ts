#!/usr/bin/env bun
// 클러스터 슈퍼바이저 진입점 — 성능 4단계 4.3a. 개발·WSL 측정용(운영 오케스트레이터는 systemd·컨테이너 몫):
//   bun run cluster -- --gateways 2            (레포 루트, package.json "cluster")
//   cd server ; bun run cluster -- --gateways 2
// 월드 1 + 게이트웨이 N을 server/src/index.ts로 띄운다(ROLE별 env — cluster/launchPlan.ts). 자식 stdout·stderr는 그대로 물려받아
// JSON 로그 한 줄마다 proc 필드(world, gw1, …)로 구분된다. 각 자식에 Bun IPC 채널을 열고 CLUSTER_SUPERVISED=1을 준다 — 자식은
// SIGINT를 무시하고 이 프로세스의 종료 메시지로 끝낸다(Windows는 시그널로 우아한 종료를 못 시킨다).
// 상태기계(기동 순서·재시작 백오프·종료 순서)는 cluster/supervisor.ts, 여기는 실제 spawn·준비 판정·시그널 배선뿐이다.
//   준비 판정: 월드 = admin /admin/healthz 200, 게이트웨이 = admin /admin/metrics의 mmorpg_gw_world_connected 1(HELLO_ACK 뒤 클라
//   리스닝). ADMIN_TOKEN이 있으면 Bearer. 기동 전 계획된 admin 포트가 이미 응답하면 거부(다른 서버를 준비 완료로 오인하지 않게).
//   종료: SIGINT·SIGTERM·(감독받는 경우) 부모 종료 메시지 → 월드 먼저 우아한 종료 → 게이트웨이. 두 번째 신호 = 전원 강제 종료.
// IPC_TOKEN: env 값이 있으면 그것, 없으면 기동마다 무작위 값(randomBytes 24 → base64url 32자)을 만들어 자식 전원에 준다(HELLO 인증 —
//   로그에 싣지 않는다). 슈퍼바이저 수명 동안 같은 값이라 재기동된 자식도 서로 붙는다.
// 종료 코드: 0 = 전원 정상 종료, 1 = 기동 실패·강제 종료·비정상 종료 코드.

import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { env } from "../config/env";
import { createLogger, flushAllSinks } from "../obs/logger";
import { bootProcessObs } from "../obs/processBoot";
import { type ClusterPlan, LAUNCH_HELP, type ProcSpec, parseLaunchArgs, planCluster } from "./launchPlan";
import { type ChildProcess, Supervisor, type SupervisorDeps } from "./supervisor";
import { SUPERVISOR_SHUTDOWN_MSG, installShutdownTriggers } from "./supervisorLink";

const log = createLogger("launch");

/** 자식 cwd(server/) — `cd server ; bun run start`와 같은 상대 경로 해석(DB_PATH 기본 data/mmorpg.db 등). */
const SERVER_DIR = resolve(import.meta.dir, "..", "..");
const ENTRY = "src/index.ts";
const PROBE_TIMEOUT_MS = 2000;
const GATEWAY_READY_RE = /^mmorpg_gw_world_connected 1$/m;

/** 자식 1개 — server/src/index.ts, env 덮어쓰기, stdio 상속, Bun IPC 채널(우아한 종료 지시용). */
export function spawnChild(spec: ProcSpec): ChildProcess {
  const proc = Bun.spawn([process.execPath, ENTRY], {
    cwd: SERVER_DIR,
    env: { ...process.env, ...spec.env },
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
    serialization: "json",
    ipc() {}, // 자식 → 슈퍼바이저 메시지는 쓰지 않는다(채널은 종료 지시와 끊김 감지용).
  });
  const signal = (sig: NodeJS.Signals): void => {
    try {
      proc.kill(sig);
    } catch {
      // 이미 끝났다.
    }
  };
  return {
    pid: proc.pid,
    exited: proc.exited.then(() => proc.exitCode),
    requestStop() {
      try {
        proc.send(SUPERVISOR_SHUTDOWN_MSG);
      } catch {
        signal("SIGTERM"); // 채널이 닫혔다 — 시그널로(Windows는 강제 종료가 된다).
      }
    },
    kill: () => signal("SIGKILL"),
  };
}

function adminHeaders(token: string | undefined): Record<string, string> {
  return token === undefined ? {} : { authorization: `Bearer ${token}` };
}

/** 준비 판정 1회 — 월드 healthz 200, 게이트웨이 HELLO_ACK(metrics). 던지지 않는다. */
export async function probeProcess(spec: ProcSpec, token: string | undefined): Promise<boolean> {
  const path = spec.role === "world" ? "/admin/healthz" : "/admin/metrics";
  try {
    const res = await fetch(`http://127.0.0.1:${spec.adminPort}${path}`, {
      headers: adminHeaders(token),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    return spec.role === "world" || GATEWAY_READY_RE.test(await res.text());
  } catch {
    return false;
  }
}

/** 계획된 admin 포트 중 이미 healthz에 답하는 것이 있으면 throw — 다른 서버를 준비 완료로 오인하지 않게. */
async function assertAdminPortsFree(plan: ClusterPlan, token: string | undefined): Promise<void> {
  const specs = [plan.world, ...plan.gateways];
  const busy = await Promise.all(specs.map((s) => probeProcess({ ...s, role: "world" }, token)));
  const taken = specs.filter((_, i) => busy[i]).map((s) => s.adminPort);
  if (taken.length > 0) throw new Error(`admin port(s) ${taken.join(", ")} already answer /admin/healthz — another server is running`);
}

function realDeps(token: string | undefined): SupervisorDeps {
  return {
    spawn: spawnChild,
    probe: (spec) => probeProcess(spec, token),
    sleep: (ms) => Bun.sleep(ms),
    now: () => performance.now(),
  };
}

/** 슈퍼바이저 본체 — 종료 코드를 돌려준다. */
export async function runLauncher(argv: readonly string[]): Promise<number> {
  const opts = parseLaunchArgs(argv, { port: env.PORT, adminPort: env.ADMIN_PORT, worldIpc: env.WORLD_IPC }, process.platform);
  if (opts === "help") {
    process.stdout.write(`${LAUNCH_HELP}\n`);
    return 0;
  }
  const plan = planCluster(opts, { ipcToken: env.IPC_TOKEN ?? randomBytes(24).toString("base64url") });
  await assertAdminPortsFree(plan, env.ADMIN_TOKEN);
  const sup = new Supervisor(plan, realDeps(env.ADMIN_TOKEN), opts);
  let triggers = 0;
  const stopped = new Promise<number>((resolveStop) => {
    installShutdownTriggers(
      (trigger) => {
        triggers++;
        if (triggers > 1) {
          log.warn({ trigger }, "second shutdown request — killing every process");
          sup.forceKill();
          return;
        }
        log.info({ trigger }, "shutdown requested — stopping the world first, then gateways");
        void sup.stop().then(resolveStop);
      },
      { supervised: env.CLUSTER_SUPERVISED === "1" },
    );
  });
  log.info(
    { gateways: opts.gateways, clientPorts: plan.clientPorts, sharedPort: plan.sharedPort, worldIpc: opts.worldIpc },
    "launching cluster",
  );
  try {
    await sup.start();
  } catch {
    // start가 띄운 자식을 이미 정리했다(로그도 남겼다). 기동 중 받은 종료 요청이면 그 결과로.
    return triggers > 0 ? stopped : 1;
  }
  return stopped;
}

if (import.meta.main) {
  bootProcessObs(env, "launch");
  runLauncher(process.argv.slice(2)).then(
    async (code) => {
      await flushAllSinks();
      process.exit(code);
    },
    async (err: unknown) => {
      log.error({ err }, "cluster launcher failed");
      await flushAllSinks();
      process.exit(1);
    },
  );
}
