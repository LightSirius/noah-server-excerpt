// 성능 4단계 4.3a — 슈퍼바이저 상태기계(cluster/supervisor). 가짜 spawn·probe·시계로 순서와 정책을 고정한다.
//   - 기동: 월드 먼저 → 준비(admin healthz) → 게이트웨이 전원 → 준비(HELLO_ACK) → running. 기동 중 종료·준비 상한 초과는 실패
//     (남은 자식을 정리하고 reject — 설정 오류는 재시작으로 숨기지 않는다).
//   - 운영 중 비정상 종료: 재시작 대기 = min(초기 × 2^연속실패, 상한), stableMs 이상 살았다가 죽으면 초기화. 월드도 같은 정책(게이트웨이는
//     새 월드 incarnation에 스스로 다시 붙는다).
//   - 종료: 월드에 우아한 종료 지시 → 월드 종료(상한 넘으면 강제)까지 기다린 뒤 게이트웨이 전원 지시 → 종료 코드(전원 0이면 0).
//     종료 중엔 재시작하지 않는다. forceKill은 살아 있는 자식 전부 강제 종료.

import { describe, expect, test } from "bun:test";
import { type ChildProcess, Supervisor, type SupervisorDeps, type SupervisorLog } from "../../../server/src/cluster/supervisor";
import { type ProcSpec, parseLaunchArgs, planCluster } from "../../../server/src/cluster/launchPlan";

const TIMINGS = {
  restartInitialMs: 100,
  restartMaxMs: 400,
  stableMs: 1000,
  readyTimeoutMs: 500,
  worldStopTimeoutMs: 300,
  gatewayStopTimeoutMs: 200,
  probeIntervalMs: 10,
};

const silent: SupervisorLog = { info() {}, warn() {}, error() {} };

interface StopBehavior {
  /** 종료 지시에 이 코드로 끝난다(기본 0). "hang" = 끝나지 않는다. */
  onStop?: number | "hang";
}

class FakeChild implements ChildProcess {
  readonly exited: Promise<number | null>;
  alive = true;
  private resolveExit: (code: number | null) => void = () => {};

  constructor(
    readonly spec: ProcSpec,
    readonly pid: number,
    private readonly world: FakeWorld,
    private readonly behavior: StopBehavior,
  ) {
    this.exited = new Promise((r) => {
      this.resolveExit = r;
    });
  }

  requestStop(): void {
    this.world.events.push(`stop:${this.spec.name}`);
    if (this.behavior.onStop === "hang") return;
    const code = this.behavior.onStop ?? 0;
    queueMicrotask(() => this.exit(code));
  }

  kill(): void {
    this.world.events.push(`kill:${this.spec.name}`);
    this.exit(null);
  }

  exit(code: number | null): void {
    if (!this.alive) return;
    this.alive = false;
    this.world.events.push(`exit:${this.spec.name}:${code}`);
    this.resolveExit(code);
  }
}

/** 가짜 OS — spawn 기록·준비 상태·수동 시계. */
class FakeWorld implements SupervisorDeps {
  readonly events: string[] = [];
  readonly children: FakeChild[] = [];
  readonly ready = new Set<string>();
  readonly stopBehavior = new Map<string, StopBehavior>();
  /** 이름별 spawn 시각. */
  readonly spawnTimes = new Map<string, number[]>();
  private t = 0;
  private sleepers: Array<{ at: number; resolve: () => void }> = [];
  private nextPid = 100;

  spawn(spec: ProcSpec): ChildProcess {
    this.events.push(`spawn:${spec.name}`);
    this.spawnTimes.set(spec.name, [...(this.spawnTimes.get(spec.name) ?? []), this.t]);
    const c = new FakeChild(spec, this.nextPid++, this, this.stopBehavior.get(spec.name) ?? {});
    this.children.push(c);
    return c;
  }

  async probe(spec: ProcSpec): Promise<boolean> {
    return this.ready.has(spec.name) && this.live(spec.name) !== undefined;
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => this.sleepers.push({ at: this.t + ms, resolve }));
  }

  now(): number {
    return this.t;
  }

  live(name: string): FakeChild | undefined {
    return this.children.find((c) => c.spec.name === name && c.alive);
  }

  /** 시계를 1 ms씩 진행하며 기한이 된 sleep을 깨우고 마이크로태스크를 돌린다. */
  async advance(ms: number): Promise<void> {
    for (let i = 0; i < ms; i++) {
      this.t++;
      const due = this.sleepers.filter((s) => s.at <= this.t);
      this.sleepers = this.sleepers.filter((s) => s.at > this.t);
      for (const s of due) s.resolve();
      await settle();
    }
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

/** 자식을 죽이고 슈퍼바이저의 종료 처리(onExit)까지 — 그 시각에 재시작 대기가 시작된다. */
async function crash(os: FakeWorld, name: string, code: number): Promise<void> {
  os.live(name)!.exit(code);
  await settle();
}

function plan(gateways = 2) {
  const o = parseLaunchArgs(
    ["--gateways", String(gateways), "--port", "19000", "--admin-port", "19100"],
    { port: 9000, adminPort: 9090, worldIpc: "tcp://127.0.0.1:19500" },
    "linux",
  );
  if (o === "help") throw new Error("help");
  return planCluster(o, { ipcToken: "supervisor-test-secret-01" });
}

/** 기동을 끝까지 몬다(월드 준비 → 게이트웨이 준비). behaviors = 자식별 종료 지시 반응(spawn 시점에 고정). */
async function started(
  gateways = 2,
  behaviors: Record<string, StopBehavior> = {},
): Promise<{ os: FakeWorld; sup: Supervisor }> {
  const os = new FakeWorld();
  for (const [name, b] of Object.entries(behaviors)) os.stopBehavior.set(name, b);
  const sup = new Supervisor(plan(gateways), os, TIMINGS, silent);
  const p = sup.start();
  os.ready.add("world");
  for (let i = 1; i <= gateways; i++) os.ready.add(`gw${i}`);
  await os.advance(50);
  await p;
  return { os, sup };
}

describe("기동", () => {
  test("월드 먼저 — 월드가 준비되기 전엔 게이트웨이를 띄우지 않는다, 게이트웨이 준비 뒤 running", async () => {
    const os = new FakeWorld();
    const sup = new Supervisor(plan(2), os, TIMINGS, silent);
    let resolved = false;
    const p = sup.start().then(() => {
      resolved = true;
    });
    await os.advance(100);
    expect(os.events).toEqual(["spawn:world"]);
    os.ready.add("world");
    await os.advance(20);
    expect(os.events).toEqual(["spawn:world", "spawn:gw1", "spawn:gw2"]);
    expect(resolved).toBe(false);
    os.ready.add("gw1");
    os.ready.add("gw2");
    await os.advance(20);
    await p;
    expect(resolved).toBe(true);
    expect(sup.state).toBe("running");
    expect(sup.processes().map((p) => p.name)).toEqual(["world", "gw1", "gw2"]);
  });

  test("월드가 준비 전에 죽으면 기동 실패 — 게이트웨이를 띄우지 않는다", async () => {
    const os = new FakeWorld();
    const sup = new Supervisor(plan(2), os, TIMINGS, silent);
    const p = sup.start();
    await os.advance(5);
    os.live("world")!.exit(1);
    await os.advance(20);
    await expect(p).rejects.toThrow(/world exited during startup \(code 1\)/);
    expect(os.events.some((e) => e.startsWith("spawn:gw"))).toBe(false);
    expect(sup.state).toBe("stopped");
  });

  test("준비 상한 초과 — 기동 실패, 띄운 자식은 정리", async () => {
    const os = new FakeWorld();
    const sup = new Supervisor(plan(1), os, TIMINGS, silent);
    const p = sup.start();
    p.catch(() => {});
    os.ready.add("world");
    await os.advance(20);
    await os.advance(TIMINGS.readyTimeoutMs + 50); // gw1은 준비되지 않는다
    await os.advance(10);
    await expect(p).rejects.toThrow(/gw1 not ready/);
    expect(os.live("world")).toBeUndefined();
    expect(os.live("gw1")).toBeUndefined();
  });

  test("기동 중 게이트웨이가 죽으면 기동 실패(설정 오류를 재시작으로 숨기지 않는다)", async () => {
    const os = new FakeWorld();
    const sup = new Supervisor(plan(2), os, TIMINGS, silent);
    const p = sup.start();
    p.catch(() => {});
    os.ready.add("world");
    await os.advance(20);
    os.live("gw2")!.exit(1);
    await os.advance(400);
    await expect(p).rejects.toThrow(/gw2 exited during startup/);
    expect(os.children.every((c) => !c.alive)).toBe(true);
  });
});

describe("재시작 — 지수 백오프", () => {
  test("게이트웨이 비정상 종료 → 100 → 200 → 400(상한) ms 뒤 재기동, stableMs 이상 살았으면 초기화", async () => {
    const { os, sup } = await started(1);
    const t0 = os.now();
    await crash(os, "gw1", 1);
    await os.advance(99);
    expect(os.spawnTimes.get("gw1")!.length).toBe(1);
    await os.advance(1);
    expect(os.spawnTimes.get("gw1")).toEqual([os.spawnTimes.get("gw1")![0]!, t0 + 100]);
    await crash(os, "gw1", 1);
    await os.advance(200);
    await crash(os, "gw1", 1);
    await os.advance(400);
    await crash(os, "gw1", 1);
    await os.advance(400);
    const times = os.spawnTimes.get("gw1")!.slice(1);
    expect(times.map((t, i) => (i === 0 ? t - t0 : t - times[i - 1]!))).toEqual([100, 200, 400, 400]);
    // 오래 산 뒤 죽으면 다시 초기값.
    await os.advance(TIMINGS.stableMs);
    const before = os.now();
    await crash(os, "gw1", 1);
    await os.advance(100);
    expect(os.spawnTimes.get("gw1")!.at(-1)).toBe(before + 100);
    expect(sup.processes().find((p) => p.name === "gw1")!.restarts).toBe(5);
  });

  test("월드 비정상 종료도 재기동 — 게이트웨이는 건드리지 않는다", async () => {
    const { os } = await started(2);
    const gw1 = os.live("gw1");
    await crash(os, "world", 137);
    await os.advance(100);
    expect(os.spawnTimes.get("world")!.length).toBe(2);
    expect(os.live("gw1")).toBe(gw1);
  });
});

describe("종료", () => {
  test("월드 먼저 — 월드가 살아 있는 동안 게이트웨이는 그대로, 월드가 끝나면 게이트웨이 전원에 지시, 전원 0이면 0", async () => {
    const { os, sup } = await started(2, { world: { onStop: "hang" } });
    const stops = () => os.events.filter((e) => e.startsWith("stop:"));
    const done = sup.stop();
    await os.advance(50);
    expect(stops()).toEqual(["stop:world"]);
    expect(sup.state).toBe("stopping");
    os.live("world")!.exit(0);
    await os.advance(5);
    expect(stops()).toEqual(["stop:world", "stop:gw1", "stop:gw2"]);
    expect(await done).toBe(0);
    expect(sup.state).toBe("stopped");
  });

  test("월드가 상한 안에 안 끝나면 강제 종료 후 게이트웨이 — 종료 코드 1", async () => {
    const { os, sup } = await started(1, { world: { onStop: "hang" } });
    const done = sup.stop();
    await os.advance(TIMINGS.worldStopTimeoutMs - 1);
    expect(os.events.includes("kill:world")).toBe(false);
    expect(os.events.includes("stop:gw1")).toBe(false);
    await os.advance(5);
    expect(os.events.includes("kill:world")).toBe(true);
    expect(os.events.includes("stop:gw1")).toBe(true);
    expect(await done).toBe(1);
  });

  test("종료 중 죽은 게이트웨이·대기 중인 재시작은 다시 띄우지 않는다", async () => {
    const { os, sup } = await started(2);
    os.live("gw1")!.exit(1); // 100 ms 뒤 재시작 예정
    const done = sup.stop();
    await os.advance(500);
    expect(await done).toBe(0);
    expect(os.spawnTimes.get("gw1")!.length).toBe(1);
    expect(os.children.every((c) => !c.alive)).toBe(true);
  });

  test("비정상 종료 코드가 섞이면 1, stop은 같은 약속을 돌려준다(멱등)", async () => {
    const { os, sup } = await started(2, { gw2: { onStop: 3 } });
    const a = sup.stop();
    const b = sup.stop();
    expect(b).toBe(a);
    await os.advance(10);
    expect(await a).toBe(1);
  });

  test("forceKill — 살아 있는 자식 전부 강제 종료", async () => {
    const { os, sup } = await started(2);
    sup.forceKill();
    await settle();
    expect(os.events.filter((e) => e.startsWith("kill:")).sort()).toEqual(["kill:gw1", "kill:gw2", "kill:world"]);
    expect(os.children.every((c) => !c.alive)).toBe(true);
  });
});
