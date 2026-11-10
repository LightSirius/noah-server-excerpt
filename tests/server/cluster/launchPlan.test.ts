// 성능 4단계 4.3a — 슈퍼바이저 CLI·배치 계획(cluster/launchPlan): `bun run cluster -- --gateways N`.
//   - 포트: Linux는 게이트웨이들이 클라 포트 1개를 공유(REUSE_PORT=1 — 커널 해시 분산), Windows·macOS는 게이트웨이마다
//     base+i(Windows SO_REUSEPORT는 두 번째 리스너가 연결을 0개 받는다 — 4.0 실측). admin은 월드 base, 게이트웨이 base+i.
//   - 자식 env: ROLE·PROC_NAME(로그 proc·파일 접두어)·ADMIN_PORT·WORLD_IPC·IPC_TOKEN(월드·게이트웨이 같은 값 — HELLO 인증)·
//     CLUSTER_SUPERVISED=1, 월드는 클라 직접 포트를 열지 않는다.
//   - 잘못된 값·포트 충돌은 기동 전에 거부.

import { describe, expect, test } from "bun:test";
import { type LaunchOptions, parseLaunchArgs, planCluster } from "../../../server/src/cluster/launchPlan";

const DEFAULTS = { port: 9000, adminPort: 9090, worldIpc: "tcp://127.0.0.1:19500" };
const IPC_TOKEN = "launch-secret-0123456789";

function opts(argv: string[], platform: NodeJS.Platform = "linux"): LaunchOptions {
  const o = parseLaunchArgs(argv, DEFAULTS, platform);
  if (o === "help") throw new Error("unexpected help");
  return o;
}

const plan = (o: LaunchOptions) => planCluster(o, { ipcToken: IPC_TOKEN });

describe("parseLaunchArgs", () => {
  test("기본값 — 게이트웨이 2, env 포트(PORT·ADMIN_PORT·WORLD_IPC), Linux는 공유 포트", () => {
    const o = opts([]);
    expect(o.gateways).toBe(2);
    expect([o.port, o.adminPort, o.worldIpc]).toEqual([9000, 9090, "tcp://127.0.0.1:19500"]);
    expect(o.sharedPort).toBe(true);
    expect(o.restartInitialMs).toBe(500);
    expect(o.restartMaxMs).toBe(10_000);
  });

  test("Windows·macOS 기본은 게이트웨이별 포트, Linux도 --distinct-ports면 분리", () => {
    expect(opts([], "win32").sharedPort).toBe(false);
    expect(opts([], "darwin").sharedPort).toBe(false);
    expect(opts(["--distinct-ports"], "linux").sharedPort).toBe(false);
  });

  test("플래그 — 게이트웨이 수·포트·IPC·재시작 백오프", () => {
    const o = opts([
      "--gateways", "4", "--port", "19000", "--admin-port", "19100", "--world-ipc", "unix:/tmp/w.sock",
      "--restart-initial-ms", "100", "--restart-max-ms", "800",
    ]);
    expect([o.gateways, o.port, o.adminPort, o.worldIpc]).toEqual([4, 19000, 19100, "unix:/tmp/w.sock"]);
    expect([o.restartInitialMs, o.restartMaxMs]).toEqual([100, 800]);
  });

  test("--help", () => {
    expect(parseLaunchArgs(["--help"], DEFAULTS, "linux")).toBe("help");
  });

  test.each([
    [["--gateways", "0"], /--gateways/],
    [["--gateways", "65"], /--gateways/],
    [["--gateways", "x"], /--gateways/],
    [["--port", "70000"], /--port/],
    [["--world-ipc", "tcp://10.0.0.1:19500"], /--world-ipc/],
    [["--restart-initial-ms", "0"], /--restart-initial-ms/],
    [["--restart-initial-ms", "900", "--restart-max-ms", "800"], /restart-max-ms/],
    [["--bogus"], /unknown flag/],
    [["--gateways"], /missing value/],
    [["stray"], /unexpected argument/],
  ])("거부 %j", (argv, re) => {
    expect(() => parseLaunchArgs(argv, DEFAULTS, "linux")).toThrow(re);
  });

  test("Windows에서 --shared-port는 거부(REUSE_PORT 미지원)", () => {
    expect(() => parseLaunchArgs(["--shared-port"], DEFAULTS, "win32")).toThrow(/--shared-port/);
    expect(opts(["--shared-port"], "darwin").sharedPort).toBe(true);
  });

  test("Windows에서 unix: IPC 거부(named pipe — 백프레셔 무력화)", () => {
    expect(() => parseLaunchArgs(["--world-ipc", "unix:/tmp/w.sock"], DEFAULTS, "win32")).toThrow(/--world-ipc/);
  });
});

describe("planCluster", () => {
  test("Linux 공유 포트 — 게이트웨이 전원 같은 PORT + REUSE_PORT=1, admin은 base+i", () => {
    const p = plan(opts(["--gateways", "3", "--port", "19000", "--admin-port", "19100"]));
    expect(p.sharedPort).toBe(true);
    expect(p.clientPorts).toEqual([19000]);
    expect(p.world).toMatchObject({ name: "world", role: "world", gatewayId: null, adminPort: 19100, clientPort: null });
    expect(p.world.env).toEqual({
      ROLE: "world",
      PROC_NAME: "world",
      ADMIN_PORT: "19100",
      PORT: "19000",
      WORLD_IPC: "tcp://127.0.0.1:19500",
      IPC_TOKEN,
      WORLD_CLIENT_LISTEN: "0",
      REUSE_PORT: "0",
      CLUSTER_SUPERVISED: "1",
    });
    expect(p.gateways.map((g) => [g.name, g.gatewayId, g.clientPort, g.adminPort])).toEqual([
      ["gw1", 1, 19000, 19101],
      ["gw2", 2, 19000, 19102],
      ["gw3", 3, 19000, 19103],
    ]);
    expect(p.gateways[1]!.env).toEqual({
      ROLE: "gateway",
      GATEWAY_ID: "2",
      PROC_NAME: "gw2",
      ADMIN_PORT: "19102",
      PORT: "19000",
      WORLD_IPC: "tcp://127.0.0.1:19500",
      IPC_TOKEN,
      REUSE_PORT: "1",
      CLUSTER_SUPERVISED: "1",
    });
  });

  test("Windows 분리 포트 — 게이트웨이 i는 base+i-1, REUSE_PORT=0", () => {
    const p = plan(opts(["--gateways", "2", "--port", "19000", "--admin-port", "19100"], "win32"));
    expect(p.sharedPort).toBe(false);
    expect(p.clientPorts).toEqual([19000, 19001]);
    expect(p.gateways.map((g) => [g.clientPort, g.env["PORT"], g.env["REUSE_PORT"]])).toEqual([
      [19000, "19000", "0"],
      [19001, "19001", "0"],
    ]);
  });

  test("포트 충돌 거부 — 클라 포트 구간·admin 구간·IPC tcp 포트가 겹치면", () => {
    expect(() => plan(opts(["--gateways", "3", "--port", "19100", "--admin-port", "19102"], "win32"))).toThrow(
      /port/,
    );
    expect(() => plan(opts(["--port", "19500"]))).toThrow(/port/);
    expect(() => plan(opts(["--admin-port", "19499"]))).toThrow(/port/);
  });

  test("포트 상한 — base+i가 65535를 넘으면 거부", () => {
    expect(() => plan(opts(["--gateways", "3", "--admin-port", "65534"]))).toThrow(/65535/);
  });
});
