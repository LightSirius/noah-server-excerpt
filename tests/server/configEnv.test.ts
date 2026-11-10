// env 스키마 — 1-A 신규 키(DB_SYNCHRONOUS / AUTOSAVE_INTERVAL_SEC / AUTOSAVE_CHUNK).
// 잘못된 값은 silent fallback 없이 부팅 시 throw(env.ts 헤더 계약).

import { describe, expect, test } from "bun:test";
import { EnvSchema, assertEnvGuards } from "../../server/src/config/env";
import { DEFAULT_DECODE_STRIKES } from "../../server/src/network/frameIngest";
import { DEFAULT_IN_WORLD_IDLE_SEC, edgeOptionsFromEnv } from "../../server/src/network/clientEdge";

describe("EnvSchema — 자동저장/DB 키", () => {
  test("미설정 시 기본값 — NORMAL / 300초 / 200명", () => {
    const e = EnvSchema.parse({});
    expect(e.DB_SYNCHRONOUS).toBe("NORMAL");
    expect(e.AUTOSAVE_INTERVAL_SEC).toBe(300);
    expect(e.AUTOSAVE_CHUNK).toBe(200);
  });

  test("문자열 env를 숫자로 강제 변환", () => {
    const e = EnvSchema.parse({
      DB_SYNCHRONOUS: "FULL",
      AUTOSAVE_INTERVAL_SEC: "60",
      AUTOSAVE_CHUNK: "50",
    });
    expect(e.DB_SYNCHRONOUS).toBe("FULL");
    expect(e.AUTOSAVE_INTERVAL_SEC).toBe(60);
    expect(e.AUTOSAVE_CHUNK).toBe(50);
  });

  test.each([
    ["DB_SYNCHRONOUS", "OFF"],
    ["DB_SYNCHRONOUS", "normal"],
    ["AUTOSAVE_INTERVAL_SEC", "0"],
    ["AUTOSAVE_INTERVAL_SEC", "1.5"],
    ["AUTOSAVE_INTERVAL_SEC", "abc"],
    ["AUTOSAVE_CHUNK", "0"],
    ["AUTOSAVE_CHUNK", "100001"],
  ])("%s=%s 는 거부", (key, value) => {
    expect(() => EnvSchema.parse({ [key]: value })).toThrow();
  });
});

describe("EnvSchema — rate limit KICK 윈도우 키(1-B)", () => {
  test("미설정 시 기본값 — 3000ms / 300건", () => {
    const e = EnvSchema.parse({});
    expect(e.RATE_KICK_WINDOW_MS).toBe(3000);
    expect(e.RATE_KICK_MAX_DROPS).toBe(300);
  });

  test("문자열 env를 숫자로 강제 변환 + 0 = 종전 즉시 킥 허용", () => {
    const e = EnvSchema.parse({ RATE_KICK_WINDOW_MS: "5000", RATE_KICK_MAX_DROPS: "0" });
    expect(e.RATE_KICK_WINDOW_MS).toBe(5000);
    expect(e.RATE_KICK_MAX_DROPS).toBe(0);
  });

  test.each([
    ["RATE_KICK_WINDOW_MS", "0"],
    ["RATE_KICK_WINDOW_MS", "99"],
    ["RATE_KICK_WINDOW_MS", "60001"],
    ["RATE_KICK_WINDOW_MS", "1.5"],
    ["RATE_KICK_MAX_DROPS", "-1"],
    ["RATE_KICK_MAX_DROPS", "2001"],
    ["RATE_KICK_MAX_DROPS", "abc"],
  ])("%s=%s 는 거부", (key, value) => {
    expect(() => EnvSchema.parse({ [key]: value })).toThrow();
  });
});

describe("EnvSchema — pre-auth 슬롯 선점 방어 키(SEC)", () => {
  test("미설정 시 — 데드라인 300초, 서브캡·IP별 미인증 몫은 미설정(부팅 시 각 상한의 25%로 산출)", () => {
    const e = EnvSchema.parse({});
    // Unity 클라는 Boot에서 접속+HELLO 후 로그인 화면에서 사람 입력을 기다린다(PING 1 Hz로 idle
    // 유지) — 데드라인이 그 체류보다 짧으면 입력 중인 정상 사용자가 KICK 3을 받는다.
    expect(e.PRE_AUTH_DEADLINE_SEC).toBe(300);
    expect(e.MAX_PREAUTH_CONNECTIONS).toBeUndefined();
    expect(e.MAX_PREAUTH_PER_IP).toBeUndefined();
  });

  test("문자열 env를 숫자로 강제 변환", () => {
    const e = EnvSchema.parse({
      PRE_AUTH_DEADLINE_SEC: "45",
      MAX_PREAUTH_CONNECTIONS: "120",
      MAX_PREAUTH_PER_IP: "6",
    });
    expect(e.PRE_AUTH_DEADLINE_SEC).toBe(45);
    expect(e.MAX_PREAUTH_CONNECTIONS).toBe(120);
    expect(e.MAX_PREAUTH_PER_IP).toBe(6);
  });

  test.each([
    ["PRE_AUTH_DEADLINE_SEC", "0"],
    ["PRE_AUTH_DEADLINE_SEC", "601"],
    ["PRE_AUTH_DEADLINE_SEC", "2.5"],
    ["MAX_PREAUTH_CONNECTIONS", "0"],
    ["MAX_PREAUTH_CONNECTIONS", "100001"],
    ["MAX_PREAUTH_CONNECTIONS", "abc"],
    ["MAX_PREAUTH_PER_IP", "0"],
    ["MAX_PREAUTH_PER_IP", "100001"],
    ["MAX_PREAUTH_PER_IP", "1.5"],
  ])("%s=%s 는 거부", (key, value) => {
    expect(() => EnvSchema.parse({ [key]: value })).toThrow();
  });
});

describe("EnvSchema — DB_BUSY_TIMEOUT_MS", () => {
  test("미설정 시 200ms — 단일 프로세스(이벤트 루프 블로킹 상한)", () => {
    expect(EnvSchema.parse({}).DB_BUSY_TIMEOUT_MS).toBe(200);
  });

  test("문자열 env를 숫자로 강제 변환 + 0 허용(즉시 SQLITE_BUSY)", () => {
    expect(EnvSchema.parse({ DB_BUSY_TIMEOUT_MS: "1500" }).DB_BUSY_TIMEOUT_MS).toBe(1500);
    expect(EnvSchema.parse({ DB_BUSY_TIMEOUT_MS: "0" }).DB_BUSY_TIMEOUT_MS).toBe(0);
  });

  test.each(["-1", "60001", "2.5", "abc"])("DB_BUSY_TIMEOUT_MS=%s 는 거부", (value) => {
    expect(() => EnvSchema.parse({ DB_BUSY_TIMEOUT_MS: value })).toThrow();
  });
});

describe("EnvSchema — RATE_KICK_MAX_DROPS 상한(strike 링 메모리)", () => {
  test("상한 2000 수용 — 링 = maxDrops × 8 B/drop 발생 세션", () => {
    expect(EnvSchema.parse({ RATE_KICK_MAX_DROPS: "2000" }).RATE_KICK_MAX_DROPS).toBe(2000);
    expect(() => EnvSchema.parse({ RATE_KICK_MAX_DROPS: "2001" })).toThrow();
  });
});

describe("EnvSchema — 과부하 신호 키(3단계 슬라이스 8)", () => {
  test("미설정 시 기본값 — 켜짐 / 접속 제한 켜짐 / skip 20 / 창 5000ms / 무응답 1000ms", () => {
    const e = EnvSchema.parse({});
    expect(e.OVERLOAD_PROTECT).toBe("1");
    expect(e.OVERLOAD_ADMISSION).toBe("1");
    expect(e.OVERLOAD_ENTER_SKIPS).toBe(20);
    expect(e.OVERLOAD_WINDOW_MS).toBe(5000);
    expect(e.OVERLOAD_STALL_MS).toBe(1000);
  });

  test("끔 스위치 + 문자열 env를 숫자로 강제 변환", () => {
    const e = EnvSchema.parse({
      OVERLOAD_PROTECT: "0",
      OVERLOAD_ADMISSION: "0",
      OVERLOAD_ENTER_SKIPS: "40",
      OVERLOAD_WINDOW_MS: "10000",
      OVERLOAD_STALL_MS: "2500",
    });
    expect(e.OVERLOAD_PROTECT).toBe("0");
    expect(e.OVERLOAD_ADMISSION).toBe("0");
    expect(e.OVERLOAD_ENTER_SKIPS).toBe(40);
    expect(e.OVERLOAD_WINDOW_MS).toBe(10000);
    expect(e.OVERLOAD_STALL_MS).toBe(2500);
  });

  test.each([
    ["OVERLOAD_PROTECT", "2"],
    ["OVERLOAD_ADMISSION", "yes"],
    ["OVERLOAD_ENTER_SKIPS", "0"],
    ["OVERLOAD_ENTER_SKIPS", "1.5"],
    ["OVERLOAD_WINDOW_MS", "999"],
    ["OVERLOAD_WINDOW_MS", "60001"],
    ["OVERLOAD_STALL_MS", "199"],
    ["OVERLOAD_STALL_MS", "60001"],
  ])("%s=%s 는 거부", (key, value) => {
    expect(() => EnvSchema.parse({ [key]: value })).toThrow();
  });

  test("가드: ENTER_SKIPS가 창 안 최대 skip 수(WINDOW_MS/50)를 넘으면 skip 진입이 불가능 — 부팅 거부", () => {
    expect(() =>
      assertEnvGuards(EnvSchema.parse({ OVERLOAD_ENTER_SKIPS: "101", OVERLOAD_WINDOW_MS: "5000" })),
    ).toThrow(/OVERLOAD_ENTER_SKIPS/);
    expect(() =>
      assertEnvGuards(EnvSchema.parse({ OVERLOAD_ENTER_SKIPS: "100", OVERLOAD_WINDOW_MS: "5000" })),
    ).not.toThrow();
    // 신호를 끄면 조합을 검사하지 않는다.
    expect(() =>
      assertEnvGuards(
        EnvSchema.parse({ OVERLOAD_PROTECT: "0", OVERLOAD_ENTER_SKIPS: "101", OVERLOAD_WINDOW_MS: "5000" }),
      ),
    ).not.toThrow();
  });
});

describe("EnvSchema — GC 페이서 키(4.5 후속 스냅샷 꼬리)", () => {
  test("미설정 시 기본값 — 끔(0), 최소 유휴 10ms", () => {
    const e = EnvSchema.parse({});
    expect([e.GC_PACE_TICKS, e.GC_PACE_MIN_IDLE_MS]).toEqual([0, 10]);
  });

  test("켜기(opt-in) — 8 tick마다", () => {
    expect(EnvSchema.parse({ GC_PACE_TICKS: "8" }).GC_PACE_TICKS).toBe(8);
  });

  test("0 = 끔 + 문자열 env를 숫자로 강제 변환(유휴는 소수 허용)", () => {
    const e = EnvSchema.parse({ GC_PACE_TICKS: "0", GC_PACE_MIN_IDLE_MS: "2.5" });
    expect([e.GC_PACE_TICKS, e.GC_PACE_MIN_IDLE_MS]).toEqual([0, 2.5]);
  });

  test.each([
    ["GC_PACE_TICKS", "-1"],
    ["GC_PACE_TICKS", "1201"],
    ["GC_PACE_TICKS", "1.5"],
    ["GC_PACE_MIN_IDLE_MS", "-1"],
    ["GC_PACE_MIN_IDLE_MS", "51"],
  ])("%s=%s 는 거부", (key, value) => {
    expect(() => EnvSchema.parse({ [key]: value })).toThrow();
  });
});

describe("EnvSchema — 디코드 실패 strike 키(이진 전환 B2c)", () => {
  test("미설정 시 기본값 — 10초 창에 5건 초과면 KICK(frameIngest 기본 정책과 같다)", () => {
    const e = EnvSchema.parse({});
    expect([e.NET_DECODE_STRIKES, e.NET_DECODE_WINDOW_MS]).toEqual([
      DEFAULT_DECODE_STRIKES.maxDrops,
      DEFAULT_DECODE_STRIKES.windowMs,
    ]);
    expect([e.NET_DECODE_STRIKES, e.NET_DECODE_WINDOW_MS]).toEqual([5, 10_000]);
  });

  test("문자열 env를 숫자로 강제 변환 + 0 = KICK 끔 허용, 상한 1000건·600000 ms", () => {
    const e = EnvSchema.parse({ NET_DECODE_STRIKES: "0", NET_DECODE_WINDOW_MS: "600000" });
    expect([e.NET_DECODE_STRIKES, e.NET_DECODE_WINDOW_MS]).toEqual([0, 600_000]);
    expect(EnvSchema.parse({ NET_DECODE_STRIKES: "1000", NET_DECODE_WINDOW_MS: "100" }).NET_DECODE_STRIKES).toBe(1000);
  });

  test.each([
    ["NET_DECODE_STRIKES", "-1"],
    ["NET_DECODE_STRIKES", "1001"],
    ["NET_DECODE_STRIKES", "2.5"],
    ["NET_DECODE_WINDOW_MS", "0"],
    ["NET_DECODE_WINDOW_MS", "99"],
    ["NET_DECODE_WINDOW_MS", "600001"],
    ["NET_DECODE_WINDOW_MS", "abc"],
  ])("%s=%s 는 거부", (key, value) => {
    expect(() => EnvSchema.parse({ [key]: value })).toThrow();
  });
});

describe("EnvSchema — MOVE_TO 연결당 속도 키(이동 입력 검토)", () => {
  test("미설정 시 기본값 — 8건/초·버스트 8", () => {
    const e = EnvSchema.parse({});
    expect([e.MOVE_TO_RATE_PER_SEC, e.MOVE_TO_BURST]).toEqual([8, 8]);
  });

  test("문자열 env를 숫자로 강제 변환(속도는 소수 허용)", () => {
    const e = EnvSchema.parse({ MOVE_TO_RATE_PER_SEC: "2.5", MOVE_TO_BURST: "100000" });
    expect([e.MOVE_TO_RATE_PER_SEC, e.MOVE_TO_BURST]).toEqual([2.5, 100_000]);
  });

  test.each([
    ["MOVE_TO_RATE_PER_SEC", "0"],
    ["MOVE_TO_RATE_PER_SEC", "100001"],
    ["MOVE_TO_BURST", "0"],
    ["MOVE_TO_BURST", "1.5"],
  ])("%s=%s 는 거부", (key, value) => {
    expect(() => EnvSchema.parse({ [key]: value })).toThrow();
  });
});

describe("EnvSchema — 몬스터 추격 리듬·배회·벽 우회 스위치", () => {
  test("미설정 시 셋 다 \"1\"(켬), \"0\" 수용", () => {
    const e = EnvSchema.parse({});
    expect([e.MONSTER_CHASE_RHYTHM, e.MONSTER_WANDER, e.MONSTER_NAV]).toEqual(["1", "1", "1"]);
    const off = EnvSchema.parse({ MONSTER_CHASE_RHYTHM: "0", MONSTER_WANDER: "0", MONSTER_NAV: "0" });
    expect([off.MONSTER_CHASE_RHYTHM, off.MONSTER_WANDER, off.MONSTER_NAV]).toEqual(["0", "0", "0"]);
  });

  test.each([
    ["MONSTER_CHASE_RHYTHM", "2"],
    ["MONSTER_CHASE_RHYTHM", "true"],
    ["MONSTER_WANDER", "yes"],
    ["MONSTER_NAV", "on"],
  ])("%s=%s 는 거부", (key, value) => {
    expect(() => EnvSchema.parse({ [key]: value })).toThrow();
  });
});

describe("EnvSchema — LIFE_CONTENT 생활 콘텐츠 기능 플래그(L-1)", () => {
  test("미설정 시 \"0\"(끔 — 노드 스폰·생활 패킷 송신 없음), \"1\" 수용", () => {
    expect(EnvSchema.parse({}).LIFE_CONTENT).toBe("0");
    expect(EnvSchema.parse({ LIFE_CONTENT: "1" }).LIFE_CONTENT).toBe("1");
  });

  test.each([["2"], ["true"], ["on"], [""]])("LIFE_CONTENT=%s 는 거부", (value) => {
    expect(() => EnvSchema.parse({ LIFE_CONTENT: value })).toThrow();
  });
});

describe("EnvSchema — AUTH_TOKEN_LOGIN 킬 스위치(자동 재접속 선결)", () => {
  test("미설정 시 \"1\"(Token 모드 허용), \"0\" 수용 — production에서도 둘 다 부팅", () => {
    expect(EnvSchema.parse({}).AUTH_TOKEN_LOGIN).toBe("1");
    expect(EnvSchema.parse({ AUTH_TOKEN_LOGIN: "0" }).AUTH_TOKEN_LOGIN).toBe("0");
    for (const v of ["0", "1"]) {
      expect(() => assertEnvGuards(EnvSchema.parse({ NODE_ENV: "production", DEV_AUTO_CREATE: "0", AUTH_TOKEN_LOGIN: v }))).not.toThrow();
    }
  });

  test.each([["true"], ["false"], ["2"], [""]])("AUTH_TOKEN_LOGIN=%s 는 거부", (value) => {
    expect(() => EnvSchema.parse({ AUTH_TOKEN_LOGIN: value })).toThrow();
  });
});

describe("EnvSchema — IN_WORLD_IDLE_SEC 인월드 idle 컷(자동 재접속 선결 — 유령 세션)", () => {
  test("미설정 시 60초 = 엣지 기본값(DEFAULT_IN_WORLD_IDLE_SEC), 문자열 강제 변환", () => {
    expect(EnvSchema.parse({}).IN_WORLD_IDLE_SEC).toBe(60);
    expect(EnvSchema.parse({}).IN_WORLD_IDLE_SEC).toBe(DEFAULT_IN_WORLD_IDLE_SEC);
    expect(EnvSchema.parse({ IN_WORLD_IDLE_SEC: "120" }).IN_WORLD_IDLE_SEC).toBe(120);
    expect(EnvSchema.parse({ IN_WORLD_IDLE_SEC: "20" }).IN_WORLD_IDLE_SEC).toBe(20);
    expect(EnvSchema.parse({ IN_WORLD_IDLE_SEC: "300" }).IN_WORLD_IDLE_SEC).toBe(300);
  });

  // 하한 20 = 미인증 idle 창(인월드 클라는 그보다 조용할 일이 없다 — 4초 이하는 리셋이 연장조차 못 한다), 상한 300 = 종전 값(되돌리기).
  test.each([["19"], ["4"], ["0"], ["301"], ["60.5"], ["abc"]])("IN_WORLD_IDLE_SEC=%s 는 거부", (value) => {
    expect(() => EnvSchema.parse({ IN_WORLD_IDLE_SEC: value })).toThrow();
  });

  test("monolith·게이트웨이 클라 엣지 옵션이 같은 env에서 나온다(edgeOptionsFromEnv)", () => {
    const e = EnvSchema.parse({ IN_WORLD_IDLE_SEC: "90", RATE_KICK_WINDOW_MS: "2000", RATE_KICK_MAX_DROPS: "7", PRE_AUTH_DEADLINE_SEC: "30" });
    expect(edgeOptionsFromEnv(e)).toEqual({
      rateKickWindowMs: 2000,
      rateKickMaxDrops: 7,
      preAuthDeadlineMs: 30_000,
      inWorldIdleSec: 90,
    });
    expect(edgeOptionsFromEnv(EnvSchema.parse({})).inWorldIdleSec).toBe(60);
  });
});
