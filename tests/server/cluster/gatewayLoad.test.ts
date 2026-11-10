// 성능 4.5 F1 — 게이트웨이 로컬 부하 신호(gateway/gatewayLoad.ts). 주입 시계·CPU 카운터·수동 타이머로 결정론 검증.
//
// 신호(진입 ≥ 문턱 / 해제 ≤ 해제 문턱) — 창(기본 1 s) 기준, 표본 250 ms:
//   cpu      프로세스 CPU(user+system) Δ / 벽시계 Δ — 한 코어 대비 %. 해제 = 진입 − 15 pt.
//   lag      표본 타이머 지연(실제 − 예정)의 창 안 최대. 다음 표본이 이미 늦었으면(이벤트 루프가 지금 막혀 있었다) 그 지연도 신호다
//            — 정지 직후 accept 콜백이 표본 타이머보다 먼저 돌아도 거절한다. 해제 = 절반.
//   rtt      IPC 수신 적체 추정(게이트웨이 코어가 주는 값 — 답 없는 가장 오래된 PING의 나이 ∨ 최근 왕복). 해제 = 절반.
//   outbound 클라 송신 꼬리 합 — 인월드(IN_WORLD) 연결 중 꼬리를 가진 연결이 outboundRatio(기본 절반) 이상일 때만(미만이면 0:
//            클라가 읽지 않기만으로 만드는 소수 연결의 적체가 신규 접속 잠금 레버가 되지 않게 — 4.5 리뷰). 분모가 인월드라 접속 램프의
//            로그인 중 연결(송신 바이트 없음)이 비율을 희석하지 않는다(4.5 검증). 해제 = 절반.
//   world    월드의 ADMISSION 판정(busy면 즉시 진입, 해제는 open).
// 히스테리시스: 신호 하나라도 진입 문턱을 넘으면 즉시 거절 시작. 모든 신호가 해제 문턱 이하이고 월드가 open인 상태가 holdMs 동안
// 이어져야 다시 받는다. 거절 사유(cause)는 우선순위 world > cpu > lag > rtt > outbound의 현재 뜨거운 신호(없으면 마지막 사유).

import { describe, expect, test } from "bun:test";
import {
  type AdmissionCause,
  DEFAULT_OUTBOUND_RATIO,
  type GatewayAdmissionOptions,
  GatewayLoad,
  type LoadReading,
  type OutboundSample,
  outboundSample,
} from "../../../server/src/gateway/gatewayLoad";
import type { LoginState } from "../../../server/src/identity/loginFlow";
import { metrics } from "../../../server/src/obs/metrics";

const MB = 1024 * 1024;
const KB = 1024;
const BASE: GatewayAdmissionOptions = { cpuPct: 90, lagMs: 250, rttMs: 1000, outboundBytes: 64 * MB, holdMs: 3000 };

class Harness {
  t = 0;
  cpuUs = 0;
  rtt = 0;
  outbound = 0;
  /** 꼬리를 가진 연결 비율(기본 1 — 전 연결). */
  ratio = 1;
  readonly changes: Array<{ active: boolean; cause: AdmissionCause | null; reading: LoadReading }> = [];
  readonly intervals: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
  readonly load: GatewayLoad;

  /** outbound = 꼬리 표본 소스(기본: 필드 outbound·ratio). */
  constructor(opts: Partial<GatewayAdmissionOptions> = {}, outbound?: () => OutboundSample) {
    this.load = new GatewayLoad(
      { ipcRttMs: () => this.rtt, outbound: outbound ?? (() => ({ bytes: this.outbound, backloggedRatio: this.ratio })) },
      {
        ...BASE,
        ...opts,
        now: () => this.t,
        cpuUsage: () => ({ user: this.cpuUs, system: 0 }),
        timers: {
          setInterval: (fn, ms) => {
            const h = { fn, ms, cleared: false };
            this.intervals.push(h);
            return h;
          },
          clearInterval: (h) => {
            (h as { cleared: boolean }).cleared = true;
          },
        },
      },
      (active, cause, reading) => this.changes.push({ active, cause, reading }),
    );
  }

  /** 정시 표본 n회 — 벽시계 250 ms마다 CPU를 cpuPct%만큼 쓴다. */
  steps(n: number, cpuPct = 10): void {
    for (let i = 0; i < n; i++) {
      this.t += 250;
      this.cpuUs += 250 * 10 * cpuPct; // ms × 1000 µs × pct/100
      this.load.sample();
    }
  }
}

type FakeConn = { state: LoginState; socket: { pendingByteCount: number } };

/** 가짜 연결 표 — [상태, 송신 꼬리 바이트, 개수] 묶음. */
function connTable(...groups: Array<[LoginState, number, number]>): Map<number, FakeConn> {
  const m = new Map<number, FakeConn>();
  for (const [state, pendingByteCount, count] of groups) {
    for (let i = 0; i < count; i++) m.set(m.size + 1, { state, socket: { pendingByteCount } });
  }
  return m;
}

describe("outboundSample — 송신 꼬리 표본(합 = 전 연결, 폭 = 인월드 연결 중 꼬리 보유 비율)", () => {
  test("로그인 중(ANON·HELLO_RECV·AUTHENTICATED) 연결은 폭의 분모·분자에서 빠진다 — 꼬리 바이트는 합에 센다", () => {
    const s = outboundSample(
      connTable(["IN_WORLD", 100, 2], ["IN_WORLD", 0, 2], ["ANON", 0, 5], ["HELLO_RECV", 0, 1], ["AUTHENTICATED", 7, 1]),
    );
    expect(s).toEqual({ bytes: 207, backloggedRatio: 0.5 });
  });

  test("인월드 연결 0개 = 폭 0(로그인 중 연결만 꼬리를 가져도)", () => {
    expect(outboundSample(connTable(["AUTHENTICATED", 300, 3]))).toEqual({ bytes: 900, backloggedRatio: 0 });
    expect(outboundSample(connTable())).toEqual({ bytes: 0, backloggedRatio: 0 });
  });
});

describe("GatewayLoad — 신호별 진입·해제(히스테리시스)", () => {
  test("평상시(CPU 10%·지연·적체·꼬리 0)는 받는다 — 전이 없음", () => {
    const h = new Harness();
    h.steps(8);
    expect(h.load.refusal()).toBeNull();
    expect(h.load.active).toBe(false);
    expect(h.changes).toEqual([]);
    expect(h.load.reading().cpuPct).toBeCloseTo(10, 5);
  });

  test("cpu: 창 평균 ≥ 90%면 거절 — 띠(75 < x < 90)에서는 유지, ≤ 75%가 hold 동안 이어지면 해제", () => {
    const h = new Harness();
    h.steps(4, 95);
    expect(h.load.refusal()).toBe("cpu");
    expect(h.changes.map((c) => [c.active, c.cause])).toEqual([[true, "cpu"]]);
    h.steps(8, 80); // 띠 안 — 해제 문턱(75) 위
    expect(h.load.active).toBe(true);
    expect(h.load.reading().cpuPct).toBeCloseTo(80, 5);
    h.steps(1, 50); // 창(최근 4표본) 평균 72.5% ≤ 75 — 이 표본부터 hold
    const clearAt = h.t;
    h.steps(11, 50); // 2750 ms < hold 3000
    expect(h.load.active).toBe(true);
    h.steps(1, 50);
    expect(h.load.active).toBe(false);
    expect(h.t - clearAt).toBe(3000);
    expect(h.changes.map((c) => [c.active, c.cause])).toEqual([[true, "cpu"], [false, null]]);
    expect(h.load.refusal()).toBeNull();
  });

  test("lag: 표본 타이머가 문턱만큼 늦으면 거절 — 창(1 s)이 지나도 hold(3 s) 동안은 유지", () => {
    const h = new Harness();
    h.steps(2);
    h.t += 300; // 이벤트 루프 300 ms 정지 → 다음 표본이 300 ms 늦다
    h.steps(1);
    expect(h.load.refusal()).toBe("lag");
    expect(h.load.reading().lagMs).toBe(300);
    expect(metrics.gwEventLoopLagMs.value()).toBe(300);
    h.steps(4); // 창 1 s 경과 — 지연 최대 0
    expect(h.load.reading().lagMs).toBe(0);
    expect(h.load.active).toBe(true);
    h.steps(12);
    expect(h.load.active).toBe(false);
    expect(metrics.gwEventLoopLagMs.value()).toBe(0);
  });

  test("lag(지금 막혀 있음): 다음 표본이 문턱 이상 늦었으면 표본 전이라도 refusal이 거절한다 — start 전에는 아니다", () => {
    const idle = new Harness();
    idle.t += 5000;
    expect(idle.load.refusal()).toBeNull(); // 표본 타이머가 없다(start 전)
    const h = new Harness();
    h.load.start();
    expect(h.intervals.map((i) => i.ms)).toEqual([250]);
    h.steps(2);
    h.t += 250 + 260; // 표본 예정 시각에서 260 ms 지남 — 타이머 콜백보다 accept가 먼저 돈다
    expect(h.load.refusal()).toBe("lag");
    expect(h.changes.map((c) => [c.active, c.cause])).toEqual([[true, "lag"]]);
    h.load.stop();
    expect(h.intervals[0]!.cleared).toBe(true);
  });

  test("rtt·outbound: 소스 값 ≥ 문턱이면 거절, 해제는 절반 이하가 hold 동안", () => {
    const h = new Harness();
    h.rtt = 1200;
    h.steps(1);
    expect(h.load.refusal()).toBe("rtt");
    h.rtt = 600; // 띠(500 < x < 1000)
    h.steps(20);
    expect(h.load.active).toBe(true);
    h.rtt = 400;
    h.steps(12);
    expect(h.load.active).toBe(true); // 2750 ms
    h.steps(1);
    expect(h.load.active).toBe(false);

    const o = new Harness();
    o.outbound = 64 * MB;
    o.steps(1);
    expect(o.load.refusal()).toBe("outbound");
    o.outbound = 40 * MB;
    o.steps(20);
    expect(o.load.active).toBe(true);
    o.outbound = 32 * MB;
    o.steps(13);
    expect(o.load.active).toBe(false);
  });

  test("outbound 폭: 꼬리를 가진 연결이 절반 미만이면 합이 문턱 이상이어도 받는다 — 절반 이상이면 거절, 절반 미만이 hold 동안이면 해제", () => {
    const h = new Harness();
    h.outbound = 100 * MB; // 소수 연결이 각자 꼬리 상한 직전까지 읽지 않는다(대역폭 비용 0)
    h.ratio = 0.49;
    h.steps(8);
    expect(h.load.refusal()).toBeNull();
    expect(h.load.reading()).toMatchObject({ outboundBytes: 100 * MB, outboundRatio: 0.49 });
    h.ratio = 0.5; // 연결 전반의 꼬리 — NIC 포화
    h.steps(1);
    expect(h.load.refusal()).toBe("outbound");
    h.ratio = 0.3; // 합은 그대로, 폭이 좁아졌다 — 해제 조건
    h.steps(12);
    expect(h.load.active).toBe(true); // 2750 ms
    h.steps(1);
    expect(h.load.active).toBe(false);
    expect(h.changes.map((c) => [c.active, c.cause])).toEqual([[true, "outbound"], [false, null]]);
  });

  test("outbound 폭 문턱 = outboundRatio(env GW_ADMISSION_OUTBOUND_RATIO, 기본 0.5) — 진입·해제 모두 같은 문턱", () => {
    expect(DEFAULT_OUTBOUND_RATIO).toBe(0.5);
    const lowered = new Harness({ outboundRatio: 0.25 });
    lowered.outbound = 100 * MB;
    lowered.ratio = 0.3;
    lowered.steps(1);
    expect(lowered.load.refusal()).toBe("outbound");
    lowered.ratio = 0.2; // 합은 그대로, 폭이 문턱 아래 — 해제 조건
    lowered.steps(12);
    expect(lowered.load.active).toBe(true); // 3000 ms 미만
    lowered.steps(1);
    expect(lowered.load.active).toBe(false);
    const byDefault = new Harness();
    byDefault.outbound = 100 * MB;
    byDefault.ratio = 0.3;
    byDefault.steps(1);
    expect(byDefault.load.refusal()).toBeNull();
  });

  test("접속 램프: 로그인 중 연결 1000개가 있어도 인월드 256개 전원의 꼬리(64 MiB)면 거절 — 분모가 전 연결이면 0.2로 희석돼 못 잡았다", () => {
    const table = connTable(["IN_WORLD", 256 * KB, 256], ["ANON", 0, 700], ["AUTHENTICATED", 0, 300]);
    const h = new Harness({}, () => outboundSample(table));
    h.steps(1);
    expect(h.load.refusal()).toBe("outbound");
    expect(h.load.reading()).toMatchObject({ outboundBytes: 64 * MB, outboundRatio: 1 });
  });

  test("저인구 게이트웨이: 기본 문턱은 거절 · 폭·합 문턱을 올리면 받는다", () => {
    const table = connTable(["IN_WORLD", 256 * KB, 256], ["IN_WORLD", 0, 44]);
    const byDefault = new Harness({}, () => outboundSample(table));
    byDefault.steps(1);
    expect(byDefault.load.refusal()).toBe("outbound"); // 256/300 ≈ 0.85 ≥ 0.5
    const raised = new Harness({ outboundRatio: 0.9 }, () => outboundSample(table));
    raised.steps(1);
    expect(raised.load.refusal()).toBeNull();
    const byBytes = new Harness({ outboundBytes: 128 * MB }, () => outboundSample(table));
    byBytes.steps(1);
    expect(byBytes.load.refusal()).toBeNull();
  });

  test("world: ADMISSION busy는 표본 없이 즉시 거절, open 뒤에도 hold 동안 유지 — 다른 신호보다 우선하는 사유", () => {
    const h = new Harness();
    h.steps(4, 95); // cpu도 뜨겁다
    h.load.setWorldBusy(true);
    expect(h.load.refusal()).toBe("world");
    h.load.setWorldBusy(false);
    h.steps(4, 10);
    expect(h.load.active).toBe(true);
    h.steps(12, 10);
    expect(h.load.active).toBe(false);
    h.load.setWorldBusy(true);
    expect(h.load.refusal()).toBe("world");
    expect(h.changes.map((c) => [c.active, c.cause])).toEqual([[true, "cpu"], [false, null], [true, "world"]]);
  });

  test("해제는 모든 신호가 해제 문턱 이하여야 — 하나라도 띠 안이면 hold가 시작되지 않는다", () => {
    const h = new Harness();
    h.load.setWorldBusy(true);
    h.load.setWorldBusy(false);
    h.rtt = 700; // 진입은 아니지만 해제 문턱(500) 위
    h.steps(40);
    expect(h.load.active).toBe(true);
    expect(h.load.refusal()).toBe("world"); // 뜨거운 신호가 없으면 마지막 사유
    h.rtt = 0;
    h.steps(13);
    expect(h.load.active).toBe(false);
  });
});
