// 슈퍼바이저 상태기계 — 성능 4단계 4.3a(cluster/launch.ts가 실제 spawn·probe·시계를 주입한다, 테스트는 가짜).
//
//   기동(start): 월드 spawn → 준비(admin healthz) → 게이트웨이 전원 spawn → 준비(HELLO_ACK — admin metrics의
//     mmorpg_gw_world_connected 1) → running. 기동 중 자식이 죽거나 준비 상한(readyTimeoutMs)을 넘으면 실패 — 띄운 자식을 정리하고
//     reject(포트 충돌·설정 오류를 재시작 루프로 숨기지 않는다 — crash-only 기동).
//   운영(running): 자식이 죽으면 재시작 — 대기 = min(restartInitialMs × 2^연속실패, restartMaxMs), stableMs 이상 살았다가 죽었으면
//     연속실패를 0으로. 월드도 같은 정책이다(게이트웨이는 월드 유실 시 전원 KICK 6 후 새 월드 incarnation에 스스로 다시 붙는다 —
//     연결은 이월하지 않는다).
//   종료(stop): 월드에 우아한 종료 지시(IPC 메시지 — 최종 저장 → SHUTDOWN → 게이트웨이가 전원 킥 → 드레인) → 월드 종료까지
//     기다림(worldStopTimeoutMs 넘으면 강제) → 게이트웨이 전원 지시 → 각자 종료(gatewayStopTimeoutMs 넘으면 강제). 반환 = 종료 코드
//     (전원 0으로 끝났으면 0, 아니면 1). 종료 중엔 재시작하지 않는다. 멱등(같은 약속).
//   forceKill: 살아 있는 자식 전부 강제 종료(두 번째 신호).
// 시계·타이머는 주입(deps.now·sleep) — cluster/는 시뮬 밖이라 결정론 규칙과 무관하지만 테스트가 시간을 몬다.

import { createLogger } from "../obs/logger";
import type { ClusterPlan, LaunchOptions, ProcSpec } from "./launchPlan";

export interface ChildProcess {
  readonly pid: number;
  /** 종료 코드로 resolve(시그널 종료면 null). */
  readonly exited: Promise<number | null>;
  /** 우아한 종료 지시(슈퍼바이저 IPC 메시지 — 채널이 없으면 SIGTERM). */
  requestStop(): void;
  /** 강제 종료(SIGKILL). */
  kill(): void;
}

export interface SupervisorDeps {
  spawn(spec: ProcSpec): ChildProcess;
  /** 준비 판정 1회 — 던지지 않는다(실패 = false). */
  probe(spec: ProcSpec): Promise<boolean>;
  sleep(ms: number): Promise<void>;
  now(): number;
}

export interface SupervisorLog {
  info(meta: object, msg: string): void;
  warn(meta: object, msg: string): void;
  error(meta: object, msg: string): void;
}

export type SupervisorTimings = Pick<
  LaunchOptions,
  "restartInitialMs" | "restartMaxMs" | "stableMs" | "readyTimeoutMs" | "worldStopTimeoutMs" | "gatewayStopTimeoutMs"
> & {
  /** 준비 판정 간격(ms, 기본 200). */
  readonly probeIntervalMs?: number;
};

export type SupervisorState = "idle" | "starting" | "running" | "stopping" | "stopped";

export interface ProcessStatus {
  readonly name: string;
  readonly pid: number | null;
  readonly restarts: number;
}

interface Managed {
  readonly spec: ProcSpec;
  child: ChildProcess | null;
  startedAt: number;
  restarts: number;
  /** 연속 빠른 종료 수 — 백오프 지수. */
  failures: number;
}

const DEFAULT_PROBE_INTERVAL_MS = 200;
const TIMED_OUT = Symbol("timed out");

export class Supervisor {
  private status: SupervisorState = "idle";
  private readonly world: Managed;
  private readonly gateways: Managed[];
  private startupError: Error | null = null;
  private stopping: Promise<number> | null = null;
  private readonly log: SupervisorLog;
  private readonly probeIntervalMs: number;

  constructor(
    private readonly plan: ClusterPlan,
    private readonly deps: SupervisorDeps,
    private readonly t: SupervisorTimings,
    log?: SupervisorLog,
  ) {
    const managed = (spec: ProcSpec): Managed => ({ spec, child: null, startedAt: 0, restarts: 0, failures: 0 });
    this.world = managed(plan.world);
    this.gateways = plan.gateways.map(managed);
    this.log = log ?? createLogger("launch");
    this.probeIntervalMs = t.probeIntervalMs ?? DEFAULT_PROBE_INTERVAL_MS;
  }

  get state(): SupervisorState {
    return this.status;
  }

  processes(): ProcessStatus[] {
    return [this.world, ...this.gateways].map((m) => ({
      name: m.spec.name,
      pid: m.child?.pid ?? null,
      restarts: m.restarts,
    }));
  }

  /** 월드 → 준비 → 게이트웨이 → 준비. 실패면 띄운 자식을 정리하고 reject. */
  async start(): Promise<void> {
    if (this.status !== "idle") throw new Error(`supervisor already ${this.status}`);
    this.status = "starting";
    try {
      this.spawn(this.world);
      await this.waitReady(this.world);
      for (const g of this.gateways) this.spawn(g);
      await Promise.all(this.gateways.map((g) => this.waitReady(g)));
    } catch (err) {
      this.log.error({ err }, "cluster startup failed — stopping started processes");
      await this.stop();
      throw err;
    }
    this.status = "running";
    this.log.info(
      {
        world: { pid: this.world.child?.pid, adminPort: this.plan.world.adminPort },
        gateways: this.gateways.map((g) => ({
          name: g.spec.name,
          pid: g.child?.pid,
          port: g.spec.clientPort,
          adminPort: g.spec.adminPort,
        })),
        clientPorts: this.plan.clientPorts,
        sharedPort: this.plan.sharedPort,
      },
      "cluster ready",
    );
  }

  /** 우아한 종료(월드 먼저) — 종료 코드. 멱등. */
  stop(): Promise<number> {
    this.stopping ??= this.stopAll();
    return this.stopping;
  }

  /** 살아 있는 자식 전부 강제 종료. */
  forceKill(): void {
    for (const m of [this.world, ...this.gateways]) {
      if (m.child === null) continue;
      this.log.warn({ child: m.spec.name, pid: m.child.pid }, "force killing process");
      m.child.kill();
    }
  }

  private spawn(m: Managed): void {
    const child = this.deps.spawn(m.spec);
    m.child = child;
    m.startedAt = this.deps.now();
    this.log.info({ child: m.spec.name, pid: child.pid, restarts: m.restarts }, "process started");
    void child.exited.then((code) => this.onExit(m, child, code));
  }

  private onExit(m: Managed, child: ChildProcess, code: number | null): void {
    if (m.child !== child) return;
    m.child = null;
    const uptimeMs = Math.round(this.deps.now() - m.startedAt);
    if (this.status === "starting") {
      this.startupError ??= new Error(`${m.spec.name} exited during startup (code ${code})`);
      return;
    }
    if (this.status !== "running") {
      this.log.info({ child: m.spec.name, pid: child.pid, code }, "process exited");
      return;
    }
    if (uptimeMs >= this.t.stableMs) m.failures = 0;
    const delayMs = Math.min(this.t.restartInitialMs * 2 ** m.failures, this.t.restartMaxMs);
    m.failures++;
    this.log.warn({ child: m.spec.name, pid: child.pid, code, uptimeMs, restartInMs: delayMs }, "process exited — restarting");
    void this.restartAfter(m, delayMs);
  }

  private async restartAfter(m: Managed, delayMs: number): Promise<void> {
    await this.deps.sleep(delayMs);
    if (this.status !== "running" || m.child !== null) return;
    m.restarts++;
    this.spawn(m);
  }

  /** 준비될 때까지 probe — 기동 중 종료·상한 초과·기동 중단이면 throw. */
  private async waitReady(m: Managed): Promise<void> {
    const t0 = this.deps.now();
    for (;;) {
      if (this.startupError !== null) throw this.startupError;
      if (this.status !== "starting") throw new Error(`startup aborted while waiting for ${m.spec.name}`);
      if (m.child !== null && (await this.deps.probe(m.spec))) return;
      if (this.deps.now() - t0 >= this.t.readyTimeoutMs) {
        throw new Error(`${m.spec.name} not ready within ${this.t.readyTimeoutMs} ms (admin port ${m.spec.adminPort})`);
      }
      await this.deps.sleep(this.probeIntervalMs);
    }
  }

  private async stopAll(): Promise<number> {
    this.status = "stopping";
    const worldOk = await this.stopOne(this.world, this.t.worldStopTimeoutMs);
    const gatewaysOk = await Promise.all(this.gateways.map((g) => this.stopOne(g, this.t.gatewayStopTimeoutMs)));
    this.status = "stopped";
    const code = worldOk && gatewaysOk.every(Boolean) ? 0 : 1;
    this.log.info({ code }, "cluster stopped");
    return code;
  }

  /** 우아한 종료 지시 → 상한 안에 끝나면 (코드 0인가), 아니면 강제 종료 후 false. 이미 없으면 true. */
  private async stopOne(m: Managed, timeoutMs: number): Promise<boolean> {
    const child = m.child;
    if (child === null) return true;
    child.requestStop();
    const code = await Promise.race([child.exited, this.deps.sleep(timeoutMs).then(() => TIMED_OUT)]);
    if (code !== TIMED_OUT) return code === 0;
    this.log.warn({ child: m.spec.name, pid: child.pid, timeoutMs }, "process did not stop in time — killing");
    child.kill();
    await child.exited;
    return false;
  }
}
