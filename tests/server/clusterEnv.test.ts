// 성능 4단계(게이트웨이 분리) 4.1 — 프로세스 역할·IPC env 키. 4.1은 검증만 하고 진입점은 4.2.
// 잘못된 값·조합은 silent fallback 없이 부팅 시 throw(env.ts 헤더 계약).

import { describe, expect, test } from "bun:test";
import { EnvSchema, assertEnvGuards, resolveProcName } from "../../server/src/config/env";
import { parseIpcAddress } from "../../server/src/config/ipcAddress";
import { peerAdmissionPolicyFromEnv, peerShedPolicyFromEnv } from "../../server/src/cluster/gatewayPeer";
import { gatewayAdmissionFromEnv } from "../../server/src/gateway/gatewayLoad";

describe("EnvSchema — 4단계 프로세스 역할·IPC 키", () => {
  test("미설정 시 기본값 — monolith, IPC tcp 127.0.0.1:19500, heartbeat 1000 / dead 5000 / pending 256 MiB", () => {
    const e = EnvSchema.parse({});
    expect(e.ROLE).toBe("monolith");
    expect(e.PROC_NAME).toBeUndefined();
    expect(e.WORLD_IPC).toBe("tcp://127.0.0.1:19500");
    expect(e.GATEWAY_ID).toBeUndefined();
    expect(e.REUSE_PORT).toBe("0");
    expect(e.IPC_HEARTBEAT_MS).toBe(1000);
    expect(e.IPC_DEAD_MS).toBe(5000);
    expect(e.IPC_MAX_PENDING_MB).toBe(256);
    expect(e.GATEWAY_MAX_CONNECTIONS).toBeUndefined();
    expect(e.WORLD_CLIENT_LISTEN).toBe("0");
    expect(e.CLUSTER_SUPERVISED).toBe("0");
    // 기본 조합은 어느 플랫폼에서도 가드를 통과한다(monolith 부팅 불변).
    expect(() => assertEnvGuards(e, "win32")).not.toThrow();
    expect(() => assertEnvGuards(e, "linux")).not.toThrow();
  });

  test("문자열 env를 숫자로 강제 변환", () => {
    const e = EnvSchema.parse({
      ROLE: "gateway",
      PROC_NAME: "gw_a1",
      WORLD_IPC: "unix:/tmp/mmorpg-world.sock",
      GATEWAY_ID: "3",
      REUSE_PORT: "1",
      IPC_HEARTBEAT_MS: "500",
      IPC_DEAD_MS: "2000",
      IPC_MAX_PENDING_MB: "64",
      GATEWAY_MAX_CONNECTIONS: "5000",
      WORLD_CLIENT_LISTEN: "1",
    });
    expect(e.ROLE).toBe("gateway");
    expect(e.PROC_NAME).toBe("gw_a1");
    expect(e.GATEWAY_ID).toBe(3);
    expect(e.IPC_HEARTBEAT_MS).toBe(500);
    expect(e.IPC_DEAD_MS).toBe(2000);
    expect(e.IPC_MAX_PENDING_MB).toBe(64);
    expect(e.GATEWAY_MAX_CONNECTIONS).toBe(5000);
    expect(() => assertEnvGuards(e, "linux")).not.toThrow();
  });

  test.each([
    ["ROLE", "worker"],
    ["ROLE", "Monolith"],
    // "-"는 로그 파일명 구분자 — 접두어가 다른 프로세스 파일과 겹치면 보존 삭제가 남의 파일을 지운다.
    ["PROC_NAME", "gw-1"],
    ["PROC_NAME", "../x"],
    ["PROC_NAME", ""],
    ["PROC_NAME", "a".repeat(33)],
    ["WORLD_IPC", "pipe:\\\\.\\pipe\\mmorpg"],
    ["WORLD_IPC", "tcp://127.0.0.1"],
    ["WORLD_IPC", "tcp://127.0.0.1:0"],
    ["WORLD_IPC", "tcp://127.0.0.1:70000"],
    // IPC는 인증 없는 내부 프로토콜 — loopback 밖 바인드 금지.
    ["WORLD_IPC", "tcp://0.0.0.0:19500"],
    ["WORLD_IPC", "tcp://10.0.0.5:19500"],
    ["WORLD_IPC", "unix:"],
    ["GATEWAY_ID", "-1"],
    ["GATEWAY_ID", "65536"],
    ["GATEWAY_ID", "1.5"],
    ["REUSE_PORT", "yes"],
    ["IPC_HEARTBEAT_MS", "49"],
    ["IPC_DEAD_MS", "99"],
    ["IPC_MAX_PENDING_MB", "7"],
    ["IPC_MAX_PENDING_MB", "4097"],
    ["GATEWAY_MAX_CONNECTIONS", "0"],
    ["WORLD_CLIENT_LISTEN", "2"],
    ["CLUSTER_SUPERVISED", "yes"],
    // 공유 비밀 — 공백 없는 인쇄 가능 ASCII 16–255자(HELLO u8 tokenLen, 바이트 = 글자).
    ["IPC_TOKEN", "short-secret"],
    ["IPC_TOKEN", "has space inside!!"],
    ["IPC_TOKEN", "비밀번호비밀번호비밀번호비밀번호"],
    ["IPC_TOKEN", "x".repeat(256)],
  ])("%s=%s 는 거부", (key, value) => {
    expect(() => EnvSchema.parse({ [key]: value })).toThrow();
  });

  test("가드: ROLE=gateway는 GATEWAY_ID 필수(IPC HELLO의 펜싱 키)", () => {
    expect(() => assertEnvGuards(EnvSchema.parse({ ROLE: "gateway" }), "linux")).toThrow(/GATEWAY_ID/);
    expect(() => assertEnvGuards(EnvSchema.parse({ ROLE: "gateway", GATEWAY_ID: "0" }), "linux")).not.toThrow();
  });

  test("가드: REUSE_PORT=1은 게이트웨이 전용 — monolith·world가 포트를 공유하면 월드가 둘이 된다", () => {
    expect(() => assertEnvGuards(EnvSchema.parse({ REUSE_PORT: "1" }), "linux")).toThrow(/REUSE_PORT/);
    expect(() => assertEnvGuards(EnvSchema.parse({ ROLE: "world", REUSE_PORT: "1" }), "linux")).toThrow(/REUSE_PORT/);
  });

  test("가드: Windows의 REUSE_PORT=1 거부 — 두 번째 리스너가 연결을 0개 받는다(4.0 실측)", () => {
    const e = EnvSchema.parse({ ROLE: "gateway", GATEWAY_ID: "1", REUSE_PORT: "1" });
    expect(() => assertEnvGuards(e, "win32")).toThrow(/REUSE_PORT/);
    expect(() => assertEnvGuards(e, "linux")).not.toThrow();
  });

  test("가드: Windows의 unix: IPC 거부 — named pipe로 해석되어 write가 백프레셔 없이 전부 수락된다", () => {
    const e = EnvSchema.parse({ WORLD_IPC: "unix:/tmp/w.sock" });
    expect(() => assertEnvGuards(e, "win32")).toThrow(/WORLD_IPC/);
    expect(() => assertEnvGuards(e, "linux")).not.toThrow();
  });

  test("가드: IPC_DEAD_MS < 2 × IPC_HEARTBEAT_MS 거부 — heartbeat 1회 지연만으로 사망 판정", () => {
    expect(() =>
      assertEnvGuards(EnvSchema.parse({ IPC_HEARTBEAT_MS: "1000", IPC_DEAD_MS: "1999" }), "linux"),
    ).toThrow(/IPC_DEAD_MS/);
    expect(() =>
      assertEnvGuards(EnvSchema.parse({ IPC_HEARTBEAT_MS: "1000", IPC_DEAD_MS: "2000" }), "linux"),
    ).not.toThrow();
  });

  test("IPC_TOKEN — 미설정 기본, 16–255자 인쇄 가능 ASCII는 그대로", () => {
    expect(EnvSchema.parse({}).IPC_TOKEN).toBeUndefined();
    const token = "A-z_0~9!".repeat(4);
    expect(EnvSchema.parse({ IPC_TOKEN: token }).IPC_TOKEN).toBe(token);
    expect(EnvSchema.parse({ IPC_TOKEN: "k".repeat(255) }).IPC_TOKEN).toHaveLength(255);
  });

  test("가드: production의 world·gateway는 IPC_TOKEN 필수 — loopback에 닿는 로컬 프로세스가 게이트웨이를 사칭하지 못하게", () => {
    const prod = { NODE_ENV: "production", DEV_AUTO_CREATE: "0" };
    expect(() => assertEnvGuards(EnvSchema.parse({ ...prod, ROLE: "world" }), "linux")).toThrow(/IPC_TOKEN/);
    expect(() => assertEnvGuards(EnvSchema.parse({ ...prod, ROLE: "gateway", GATEWAY_ID: "1" }), "linux")).toThrow(/IPC_TOKEN/);
    const token = "prod-secret-0123456789";
    expect(() => assertEnvGuards(EnvSchema.parse({ ...prod, ROLE: "world", IPC_TOKEN: token }), "linux")).not.toThrow();
    // monolith는 IPC가 없다 — 운영 기본 경로 불변.
    expect(() => assertEnvGuards(EnvSchema.parse(prod), "linux")).not.toThrow();
    // 개발·테스트는 미설정 허용(양쪽 빈 token).
    expect(() => assertEnvGuards(EnvSchema.parse({ ROLE: "world" }), "linux")).not.toThrow();
  });
});

describe("resolveProcName — 로그 proc 태그·파일 접두어", () => {
  test("미설정 기본값: monolith = server(종전 파일명), world = world, gateway = gw<id>", () => {
    expect(resolveProcName(EnvSchema.parse({}))).toBe("server");
    expect(resolveProcName(EnvSchema.parse({ ROLE: "world" }))).toBe("world");
    expect(resolveProcName(EnvSchema.parse({ ROLE: "gateway", GATEWAY_ID: "7" }))).toBe("gw7");
  });

  test("PROC_NAME이 있으면 그 값", () => {
    expect(resolveProcName(EnvSchema.parse({ ROLE: "gateway", GATEWAY_ID: "7", PROC_NAME: "edge_a" }))).toBe("edge_a");
  });
});

describe("parseIpcAddress", () => {
  test("tcp loopback — IPv4 127/8·localhost·[::1]", () => {
    expect(parseIpcAddress("tcp://127.0.0.1:19500")).toEqual({ kind: "tcp", host: "127.0.0.1", port: 19500 });
    expect(parseIpcAddress("tcp://127.1.2.3:1")).toEqual({ kind: "tcp", host: "127.1.2.3", port: 1 });
    expect(parseIpcAddress("tcp://localhost:65535")).toEqual({ kind: "tcp", host: "localhost", port: 65535 });
    expect(parseIpcAddress("tcp://[::1]:19500")).toEqual({ kind: "tcp", host: "::1", port: 19500 });
  });

  test("unix 경로", () => {
    expect(parseIpcAddress("unix:/run/mmorpg/world.sock")).toEqual({ kind: "unix", path: "/run/mmorpg/world.sock" });
  });

  test.each([
    "tcp://127.0.0.1",
    "tcp://127.0.0.1:",
    "tcp://127.0.0.1:19500/x",
    "tcp://127.0.0.256:19500",
    "tcp://128.0.0.1:19500",
    "tcp://::1:19500",
    "tcp://example.com:19500",
    "TCP://127.0.0.1:19500",
    "unix:",
    `unix:/${"a".repeat(104)}`,
    "pipe:mmorpg",
    "127.0.0.1:19500",
  ])("거부: %s", (s) => {
    expect(parseIpcAddress(s)).toBeNull();
  });
});

describe("EnvSchema — 4.5 후속 피어 점진 감축 키(IPC_SHED_*)·채팅 속도(CHAT_*)", () => {
  test("기본값 — 감축 40% / 1회 10% / 쿨다운 500 ms / 1회 상한 100명, 정책 = IPC_MAX_PENDING_MB의 비율(바이트)", () => {
    const e = EnvSchema.parse({});
    expect([e.IPC_SHED_PCT, e.IPC_SHED_FRACTION_PCT, e.IPC_SHED_COOLDOWN_MS, e.IPC_SHED_MAX_PER_STEP]).toEqual([40, 10, 500, 100]);
    expect(() => assertEnvGuards(e, "linux")).not.toThrow();
    expect(() => assertEnvGuards(EnvSchema.parse({ ROLE: "world" }), "linux")).not.toThrow();
    expect(peerShedPolicyFromEnv(e)).toEqual({
      shedBytes: Math.floor(256 * 1024 * 1024 * 0.4),
      fraction: 0.1,
      cooldownMs: 500,
      maxPerStep: 100,
    });
    expect(peerShedPolicyFromEnv(EnvSchema.parse({ IPC_SHED_PCT: "0" }))).toBeUndefined();
  });

  test("기본값 — 채팅 발신자별 2건/초·버스트 5", () => {
    const e = EnvSchema.parse({});
    expect([e.CHAT_RATE_PER_SEC, e.CHAT_BURST]).toEqual([2, 5]);
    const t = EnvSchema.parse({ CHAT_RATE_PER_SEC: "0.5", CHAT_BURST: "100000" });
    expect([t.CHAT_RATE_PER_SEC, t.CHAT_BURST]).toEqual([0.5, 100_000]);
  });

  test("기본값 — 자유 포인트 명령 연결당 2건/초·버스트 5", () => {
    const e = EnvSchema.parse({});
    expect([e.STAT_OP_RATE_PER_SEC, e.STAT_OP_BURST]).toEqual([2, 5]);
    const t = EnvSchema.parse({ STAT_OP_RATE_PER_SEC: "0.5", STAT_OP_BURST: "100000" });
    expect([t.STAT_OP_RATE_PER_SEC, t.STAT_OP_BURST]).toEqual([0.5, 100_000]);
  });

  test("기본값 — 생활 채집 요청 연결당 2건/초·버스트 5, 작업력 상한 4000·5분마다 10 회복", () => {
    const e = EnvSchema.parse({});
    expect([e.LIFE_OP_RATE_PER_SEC, e.LIFE_OP_BURST]).toEqual([2, 5]);
    expect([e.LABOR_CAP, e.LABOR_REGEN_MS, e.LABOR_REGEN_AMOUNT]).toEqual([4000, 300_000, 10]);
    const t = EnvSchema.parse({
      LIFE_OP_RATE_PER_SEC: "0.5", LIFE_OP_BURST: "100000",
      LABOR_CAP: "1000000", LABOR_REGEN_MS: "1000", LABOR_REGEN_AMOUNT: "1",
    });
    expect([t.LIFE_OP_RATE_PER_SEC, t.LIFE_OP_BURST]).toEqual([0.5, 100_000]);
    expect([t.LABOR_CAP, t.LABOR_REGEN_MS, t.LABOR_REGEN_AMOUNT]).toEqual([1_000_000, 1000, 1]);
    expect(EnvSchema.parse({ LABOR_CAP: "1", LABOR_REGEN_MS: "86400000", LABOR_REGEN_AMOUNT: "1000000" }).LABOR_REGEN_MS).toBe(86_400_000);
  });

  test.each([
    ["IPC_SHED_PCT", "100"],
    ["IPC_SHED_PCT", "-1"],
    ["IPC_SHED_FRACTION_PCT", "0"],
    ["IPC_SHED_FRACTION_PCT", "101"],
    ["IPC_SHED_COOLDOWN_MS", "49"],
    ["IPC_SHED_COOLDOWN_MS", "60001"],
    ["IPC_SHED_MAX_PER_STEP", "0"],
    ["IPC_SHED_MAX_PER_STEP", "10001"],
    ["CHAT_RATE_PER_SEC", "0"],
    ["CHAT_RATE_PER_SEC", "100001"],
    ["CHAT_BURST", "0"],
    ["CHAT_BURST", "1.5"],
    ["STAT_OP_RATE_PER_SEC", "0"],
    ["STAT_OP_RATE_PER_SEC", "100001"],
    ["STAT_OP_BURST", "0"],
    ["STAT_OP_BURST", "1.5"],
    ["LIFE_OP_RATE_PER_SEC", "0"],
    ["LIFE_OP_RATE_PER_SEC", "100001"],
    ["LIFE_OP_BURST", "0"],
    ["LIFE_OP_BURST", "1.5"],
    ["LABOR_CAP", "0"],
    ["LABOR_CAP", "1000001"],
    ["LABOR_CAP", "10.5"],
    ["LABOR_REGEN_MS", "999"],
    ["LABOR_REGEN_MS", "86400001"],
    ["LABOR_REGEN_MS", "1500.5"],
    ["LABOR_REGEN_AMOUNT", "0"],
    ["LABOR_REGEN_AMOUNT", "1000001"],
    ["LABOR_REGEN_AMOUNT", "2.5"],
  ])("거부: %s=%s", (key, value) => {
    expect(() => EnvSchema.parse({ [key]: value })).toThrow();
  });

  test("가드(ROLE=world): 감축 임계는 소프트 임계보다 커야 하고, 감축을 켜면 소프트도 켜져 있어야 한다", () => {
    const world = (v: Record<string, string>) => EnvSchema.parse({ ROLE: "world", ...v });
    expect(() => assertEnvGuards(world({ IPC_SHED_PCT: "25" }), "linux")).toThrow(/IPC_SHED_PCT/);
    expect(() => assertEnvGuards(world({ IPC_SHED_PCT: "26" }), "linux")).not.toThrow();
    expect(() => assertEnvGuards(world({ IPC_ADMISSION_SOFT_PCT: "0", IPC_SHED_PCT: "5" }), "linux")).toThrow(
      /IPC_ADMISSION_SOFT_PCT > 0/,
    );
    expect(() => assertEnvGuards(world({ IPC_ADMISSION_SOFT_PCT: "0", IPC_SHED_PCT: "0" }), "linux")).not.toThrow();
    expect(() => assertEnvGuards(world({ IPC_ADMISSION_SOFT_PCT: "60", IPC_SHED_PCT: "0" }), "linux")).not.toThrow();
  });

  test("가드는 월드만 — monolith·gateway는 감축을 쓰지 않아 소프트 임계를 올려도 부팅한다", () => {
    expect(() => assertEnvGuards(EnvSchema.parse({ IPC_ADMISSION_SOFT_PCT: "60" }), "linux")).not.toThrow();
    const gw = EnvSchema.parse({ ROLE: "gateway", GATEWAY_ID: "1", IPC_ADMISSION_SOFT_PCT: "0" });
    expect(() => assertEnvGuards(gw, "linux")).not.toThrow();
  });
});

describe("EnvSchema — 성능 4.5 부하 기반 접속 제한 키", () => {
  test("기본값 — 월드 소프트 25% / 해제 6% / hold 2000, 게이트웨이 켬·CPU 90%·지연 250·RTT 1000·꼬리 64 MiB·hold 3000", () => {
    const e = EnvSchema.parse({});
    expect([e.IPC_ADMISSION_SOFT_PCT, e.IPC_ADMISSION_CLEAR_PCT, e.IPC_ADMISSION_HOLD_MS]).toEqual([25, 6, 2000]);
    expect(e.GW_ADMISSION).toBe("1");
    expect([e.GW_ADMISSION_CPU_PCT, e.GW_ADMISSION_LAG_MS, e.GW_ADMISSION_RTT_MS]).toEqual([90, 250, 1000]);
    expect([e.GW_ADMISSION_OUTBOUND_MB, e.GW_ADMISSION_HOLD_MS]).toEqual([64, 3000]);
    expect(e.GW_ADMISSION_OUTBOUND_RATIO).toBe(0.5);
    expect(() => assertEnvGuards(e, "linux")).not.toThrow();
  });

  test("GW_PERF_SIDE_EFFECTS — 기본 0(게이트웨이 /admin/perf의 reset·gc·stall 거절 — 카오스 시험만 1로 켠다), 0|1 외 거부", () => {
    expect(EnvSchema.parse({}).GW_PERF_SIDE_EFFECTS).toBe("0");
    expect(EnvSchema.parse({ GW_PERF_SIDE_EFFECTS: "1" }).GW_PERF_SIDE_EFFECTS).toBe("1");
    expect(() => EnvSchema.parse({ GW_PERF_SIDE_EFFECTS: "yes" })).toThrow();
  });

  test("GW_ADMISSION_OUTBOUND_RATIO — 소수 허용(0.05..1)", () => {
    expect(EnvSchema.parse({ GW_ADMISSION_OUTBOUND_RATIO: "0.25" }).GW_ADMISSION_OUTBOUND_RATIO).toBe(0.25);
    expect(EnvSchema.parse({ GW_ADMISSION_OUTBOUND_RATIO: "1" }).GW_ADMISSION_OUTBOUND_RATIO).toBe(1);
    expect(EnvSchema.parse({ GW_ADMISSION_OUTBOUND_RATIO: "0.05" }).GW_ADMISSION_OUTBOUND_RATIO).toBe(0.05);
  });

  test.each([
    ["IPC_ADMISSION_SOFT_PCT", "91"],
    ["IPC_ADMISSION_SOFT_PCT", "-1"],
    ["IPC_ADMISSION_SOFT_PCT", "2.5"],
    ["IPC_ADMISSION_HOLD_MS", "-1"],
    ["GW_ADMISSION", "yes"],
    ["GW_ADMISSION_CPU_PCT", "19"],
    ["GW_ADMISSION_LAG_MS", "0"],
    ["GW_ADMISSION_RTT_MS", "0"],
    ["GW_ADMISSION_OUTBOUND_MB", "0"],
    ["GW_ADMISSION_OUTBOUND_RATIO", "0.04"],
    ["GW_ADMISSION_OUTBOUND_RATIO", "1.01"],
    ["GW_ADMISSION_OUTBOUND_RATIO", "half"],
  ])("거부: %s=%s", (key, value) => {
    expect(() => EnvSchema.parse({ [key]: value })).toThrow();
  });

  test("가드: 해제 비율은 소프트 비율보다 작아야 한다(같거나 크면 busy가 hold 직후 바로 다시 켜진다) — 소프트 0(끔)이면 무관", () => {
    expect(() => assertEnvGuards(EnvSchema.parse({ IPC_ADMISSION_SOFT_PCT: "10", IPC_ADMISSION_CLEAR_PCT: "10" }))).toThrow(
      /IPC_ADMISSION_CLEAR_PCT/,
    );
    expect(() => assertEnvGuards(EnvSchema.parse({ IPC_ADMISSION_SOFT_PCT: "10", IPC_ADMISSION_CLEAR_PCT: "9" }))).not.toThrow();
    expect(() => assertEnvGuards(EnvSchema.parse({ IPC_ADMISSION_SOFT_PCT: "0", IPC_ADMISSION_CLEAR_PCT: "50" }))).not.toThrow();
  });

  test("월드 피어 정책 = IPC_MAX_PENDING_MB의 비율(바이트), 소프트 0이면 끔(undefined)", () => {
    const MB = 1024 * 1024;
    expect(peerAdmissionPolicyFromEnv(EnvSchema.parse({}))).toEqual({ softBytes: 64 * MB, clearBytes: Math.floor(256 * MB * 0.06), holdMs: 2000 });
    expect(
      peerAdmissionPolicyFromEnv(
        EnvSchema.parse({ IPC_MAX_PENDING_MB: "8", IPC_ADMISSION_SOFT_PCT: "5", IPC_ADMISSION_CLEAR_PCT: "1", IPC_ADMISSION_HOLD_MS: "300" }),
      ),
    ).toEqual({ softBytes: Math.floor(8 * MB * 0.05), clearBytes: Math.floor(8 * MB * 0.01), holdMs: 300 });
    expect(peerAdmissionPolicyFromEnv(EnvSchema.parse({ IPC_ADMISSION_SOFT_PCT: "0" }))).toBeUndefined();
  });

  test("게이트웨이 문턱 = env 값(꼬리는 MiB → 바이트), GW_ADMISSION=0이면 끔(undefined)", () => {
    expect(
      gatewayAdmissionFromEnv(
        EnvSchema.parse({ GW_ADMISSION_OUTBOUND_MB: "2", GW_ADMISSION_OUTBOUND_RATIO: "0.3", GW_ADMISSION_HOLD_MS: "500" }),
      ),
    ).toEqual({
      cpuPct: 90,
      lagMs: 250,
      rttMs: 1000,
      outboundBytes: 2 * 1024 * 1024,
      outboundRatio: 0.3,
      holdMs: 500,
    });
    expect(gatewayAdmissionFromEnv(EnvSchema.parse({ GW_ADMISSION: "0" }))).toBeUndefined();
  });
});

describe("EnvSchema — 성능 4.5 F2 MULTICAST 스위치", () => {
  test("IPC_MULTICAST 기본 \"1\"(켬), \"0\"이면 끔 — 그 밖의 값은 거부", () => {
    expect(EnvSchema.parse({}).IPC_MULTICAST).toBe("1");
    expect(EnvSchema.parse({ IPC_MULTICAST: "0" }).IPC_MULTICAST).toBe("0");
    expect(() => EnvSchema.parse({ IPC_MULTICAST: "yes" })).toThrow();
    expect(() => EnvSchema.parse({ IPC_MULTICAST: "2" })).toThrow();
  });
});

describe("EnvSchema — 공유 포트 리스너 양보 스위치(IPC v14)", () => {
  test("GW_LISTEN_YIELD 기본 \"1\"(켬), \"0\"이면 끔 — 그 밖의 값은 거부, 부팅 가드 없음(공유 포트·접속 제한이 없으면 무시)", () => {
    expect(EnvSchema.parse({}).GW_LISTEN_YIELD).toBe("1");
    expect(EnvSchema.parse({ GW_LISTEN_YIELD: "0" }).GW_LISTEN_YIELD).toBe("0");
    expect(() => EnvSchema.parse({ GW_LISTEN_YIELD: "yes" })).toThrow();
    expect(() => EnvSchema.parse({ GW_LISTEN_YIELD: "2" })).toThrow();
    for (const role of ["monolith", "world", "gateway"] as const) {
      expect(() => assertEnvGuards(EnvSchema.parse({ ROLE: role, GATEWAY_ID: "1", GW_LISTEN_YIELD: "1" }), "linux")).not.toThrow();
    }
  });
});

describe("EnvSchema — 성능 4.5 F3 공유 프레임 스위치", () => {
  test("IPC_SHARED 기본 \"1\"(켬), \"0\"이면 끔 — 그 밖의 값은 거부", () => {
    expect(EnvSchema.parse({}).IPC_SHARED).toBe("1");
    expect(EnvSchema.parse({ IPC_SHARED: "0" }).IPC_SHARED).toBe("0");
    expect(() => EnvSchema.parse({ IPC_SHARED: "true" })).toThrow();
    expect(() => EnvSchema.parse({ IPC_SHARED: "2" })).toThrow();
  });
});
