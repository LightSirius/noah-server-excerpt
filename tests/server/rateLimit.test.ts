/**
 * Phase B — TokenBucket 단위 테스트.
 *
 * Date.now()는 명시적 nowMs 인자로 주입해 deterministic하게 검증한다.
 */

import { describe, expect, test } from "bun:test";
import {
  COMMAND_RESERVE_LIMITS,
  DEFAULT_STRIKE_POLICY,
  OVERLOAD_EXEMPT_LIMITS,
  StrikeWindow,
  TokenBucket,
  bucketLimitsForState,
  isStreamPacket,
  rateVerdict,
} from "../../server/src/net/rateLimit";
import { PACKET_ID } from "../../server/src/net/codec.generated";

const PRE = bucketLimitsForState("ANON");
const IN_WORLD = bucketLimitsForState("IN_WORLD");

describe("bucketLimitsForState", () => {
  test("IN_WORLD는 capacity 100/refill 100", () => {
    expect(IN_WORLD.capacity).toBe(100);
    expect(IN_WORLD.refillPerSec).toBe(100);
  });

  test("ANON/HELLO_RECV/AUTHENTICATED는 capacity 10/refill 10", () => {
    expect(bucketLimitsForState("ANON").capacity).toBe(10);
    expect(bucketLimitsForState("HELLO_RECV").capacity).toBe(10);
    expect(bucketLimitsForState("AUTHENTICATED").capacity).toBe(10);
    expect(bucketLimitsForState("ANON").refillPerSec).toBe(10);
  });

  test("REJECT 상태도 pre-auth limits — 어차피 모든 패킷 거부되지만 안전 측 cap", () => {
    expect(bucketLimitsForState("REJECT").capacity).toBe(10);
  });
});

describe("TokenBucket", () => {
  test("초기 토큰만큼은 즉시 소비 가능", () => {
    const b = new TokenBucket(IN_WORLD.capacity, 0);
    for (let i = 0; i < 100; i++) {
      expect(b.tryConsume(IN_WORLD, 0)).toBe(true);
    }
    expect(b.tryConsume(IN_WORLD, 0)).toBe(false);
  });

  test("refill — 100/s 비율로 1초 후 capacity 회복", () => {
    const b = new TokenBucket(IN_WORLD.capacity, 0);
    // 다 비운다
    for (let i = 0; i < 100; i++) b.tryConsume(IN_WORLD, 0);
    expect(b.tryConsume(IN_WORLD, 0)).toBe(false);
    // 1초 = 100토큰 충전
    expect(b.tryConsume(IN_WORLD, 1000)).toBe(true);
    // 더는 안 채워짐 (capacity cap 100인데 직전 consume으로 99)
    let ok = 0;
    for (let i = 0; i < 200; i++) {
      if (b.tryConsume(IN_WORLD, 1000)) ok++;
    }
    expect(ok).toBe(99);
  });

  test("부분 refill — 100ms = 10 토큰", () => {
    const b = new TokenBucket(IN_WORLD.capacity, 0);
    for (let i = 0; i < 100; i++) b.tryConsume(IN_WORLD, 0);
    let ok = 0;
    for (let i = 0; i < 50; i++) {
      if (b.tryConsume(IN_WORLD, 100)) ok++;
    }
    expect(ok).toBe(10);
  });

  test("capacity cap — 오랜 idle 후에도 capacity를 넘지 않음", () => {
    const b = new TokenBucket(IN_WORLD.capacity, 0);
    for (let i = 0; i < 100; i++) b.tryConsume(IN_WORLD, 0);
    // 1시간 idle (3,600,000 ms × 100/s = 360k 토큰 잠재) → capacity 100으로 클램프
    let ok = 0;
    for (let i = 0; i < 200; i++) {
      if (b.tryConsume(IN_WORLD, 3_600_000)) ok++;
    }
    expect(ok).toBe(100);
  });

  test("PRE_AUTH limits는 burst 10에서 막힘", () => {
    const b = new TokenBucket(PRE.capacity, 0);
    let ok = 0;
    for (let i = 0; i < 100; i++) {
      if (b.tryConsume(PRE, 0)) ok++;
    }
    expect(ok).toBe(10);
  });

  test("nowMs가 과거로 가도 토큰 음수 안 됨 (clock skew 방어)", () => {
    const b = new TokenBucket(5, 1000);
    // 시간이 거꾸로 — elapsed=0 (Math.max 0).
    expect(b.tryConsume(IN_WORLD, 500)).toBe(true);
    expect(b.peek()).toBe(4);
  });
});

// ── 1-B: IN_WORLD drop + strike 윈도우 ─────────────────────────────────────
// 서버 정지(자동저장 fsync·GC 등) 후 클라의 큐 입력이 한 번에 도착하면 토큰이 모자란다.
// 종전 정책(첫 위반 즉시 KICK)은 정지 1회에 동접 대부분을 킥했다 — IN_WORLD는 drop하고
// 슬라이딩 윈도우 strike가 임계를 "초과"할 때만 킥. pre-auth는 brute force 차단상 즉시 킥 유지.

describe("StrikeWindow", () => {
  const P = { windowMs: 1000, maxDrops: 3 };

  test("윈도우 내 maxDrops건까지 허용, maxDrops+1번째가 초과", () => {
    const w = new StrikeWindow();
    expect(w.record(P, 0)).toBe(false);
    expect(w.record(P, 0)).toBe(false);
    expect(w.record(P, 0)).toBe(false);
    expect(w.record(P, 999)).toBe(true);
  });

  test("경계 — 정확히 windowMs 지난 strike는 윈도우 밖", () => {
    const w = new StrikeWindow();
    for (let i = 0; i < 3; i++) w.record(P, 0);
    expect(w.record(P, 1000)).toBe(false);
  });

  test("감쇠 — 가장 오래된 strike가 빠지면 다시 허용, 촘촘해지면 다시 초과", () => {
    const w = new StrikeWindow();
    expect(w.record(P, 0)).toBe(false);
    expect(w.record(P, 400)).toBe(false);
    expect(w.record(P, 800)).toBe(false);
    // t=1000: strike@0 은 윈도우 밖 → 윈도우 내 400·800 + 본건 = 3 (초과 아님)
    expect(w.record(P, 1000)).toBe(false);
    // t=1300: 400·800·1000 모두 윈도우 내 + 본건 = 4 > 3
    expect(w.record(P, 1300)).toBe(true);
  });

  test("countInWindow — 주입 시계 기준 윈도우 내 strike 수", () => {
    const w = new StrikeWindow();
    expect(w.countInWindow(P, 0)).toBe(0);
    w.record(P, 0);
    w.record(P, 500);
    expect(w.countInWindow(P, 500)).toBe(2);
    expect(w.countInWindow(P, 1000)).toBe(1);
    expect(w.countInWindow(P, 1500)).toBe(0);
  });

  test("시계 역행 시 링 리셋 — 미래 타임스탬프가 윈도우를 점유해 오킥하지 않음", () => {
    const w = new StrikeWindow();
    for (let i = 0; i < 3; i++) w.record(P, 10_000);
    expect(w.record(P, 5_000)).toBe(false);
    expect(w.countInWindow(P, 5_000)).toBe(1);
  });

  test("maxDrops=0 — 첫 drop부터 초과(종전 즉시 킥 정책과 동치)", () => {
    const w = new StrikeWindow();
    expect(w.record({ windowMs: 1000, maxDrops: 0 }, 0)).toBe(true);
  });

  test("정책 maxDrops가 바뀌면 링을 새 크기로 리셋", () => {
    const w = new StrikeWindow();
    for (let i = 0; i < 3; i++) w.record(P, 0);
    const wider = { windowMs: 1000, maxDrops: 5 };
    for (let i = 0; i < 5; i++) expect(w.record(wider, 0)).toBe(false);
    expect(w.record(wider, 0)).toBe(true);
  });
});

describe("rateVerdict — IN_WORLD drop/strike, pre-auth 즉시 킥", () => {
  test("기본 정책 = 3000ms 윈도우 내 drop 300건 초과 시 킥", () => {
    expect(DEFAULT_STRIKE_POLICY.windowMs).toBe(3000);
    expect(DEFAULT_STRIKE_POLICY.maxDrops).toBe(300);
  });

  test.each(["ANON", "HELLO_RECV", "AUTHENTICATED", "REJECT"] as const)(
    "%s: 토큰 부족 첫 위반에 즉시 kick",
    (state) => {
      const b = new TokenBucket(PRE.capacity, 0);
      const w = new StrikeWindow();
      for (let i = 0; i < 10; i++) {
        expect(rateVerdict(b, w, state, DEFAULT_STRIKE_POLICY, 0)).toBe("pass");
      }
      expect(rateVerdict(b, w, state, DEFAULT_STRIKE_POLICY, 0)).toBe("kick");
    },
  );

  test("IN_WORLD: 토큰 부족은 drop — 정확히 maxDrops건까지 drop, 다음 건 kick", () => {
    const b = new TokenBucket(0, 0);
    const w = new StrikeWindow();
    for (let i = 0; i < 300; i++) {
      expect(rateVerdict(b, w, "IN_WORLD", DEFAULT_STRIKE_POLICY, 0)).toBe("drop");
    }
    expect(rateVerdict(b, w, "IN_WORLD", DEFAULT_STRIKE_POLICY, 0)).toBe("kick");
  });

  test("drop은 토큰을 소모하지 않음 — refill 후 정상 통과", () => {
    const b = new TokenBucket(0, 0);
    const w = new StrikeWindow();
    expect(rateVerdict(b, w, "IN_WORLD", DEFAULT_STRIKE_POLICY, 0)).toBe("drop");
    expect(rateVerdict(b, w, "IN_WORLD", DEFAULT_STRIKE_POLICY, 10)).toBe("pass");
  });

  function tally(
    b: TokenBucket,
    w: StrikeWindow,
    n: number,
    nowMs: number,
  ): Record<"pass" | "drop" | "kick", number> {
    const out = { pass: 0, drop: 0, kick: 0 };
    for (let i = 0; i < n; i++) out[rateVerdict(b, w, "IN_WORLD", DEFAULT_STRIKE_POLICY, nowMs)]++;
    return out;
  }

  test("10초 서버 정지 버스트(21 pkt/s × 10s = 210건 동시 도착) → kick 0, drop 110", () => {
    const b = new TokenBucket(IN_WORLD.capacity, 0);
    const w = new StrikeWindow();
    expect(tally(b, w, 210, 10_000)).toEqual({ pass: 100, drop: 110, kick: 0 });
  });

  test("정지 버스트가 윈도우 밖 간격으로 반복돼도 strike가 누적되지 않음", () => {
    const b = new TokenBucket(IN_WORLD.capacity, 0);
    const w = new StrikeWindow();
    expect(tally(b, w, 210, 10_000).kick).toBe(0);
    expect(tally(b, w, 210, 20_000).kick).toBe(0);
    expect(tally(b, w, 210, 30_000).kick).toBe(0);
  });

  test("지속 flood 1000 pkt/s → 윈도우(3s) 안에 kick", () => {
    const b = new TokenBucket(IN_WORLD.capacity, 0);
    const w = new StrikeWindow();
    let kickAt = -1;
    for (let t = 0; t < 10_000 && kickAt < 0; t++) {
      if (rateVerdict(b, w, "IN_WORLD", DEFAULT_STRIKE_POLICY, t) === "kick") kickAt = t;
    }
    expect(kickAt).toBeGreaterThan(0);
    expect(kickAt).toBeLessThan(DEFAULT_STRIKE_POLICY.windowMs);
  });

  test("정상 상한 근처(100 pkt/s 지속)는 drop 0", () => {
    const b = new TokenBucket(IN_WORLD.capacity, 0);
    const w = new StrikeWindow();
    let drops = 0;
    for (let t = 0; t < 10_000; t += 10) {
      if (rateVerdict(b, w, "IN_WORLD", DEFAULT_STRIKE_POLICY, t) !== "pass") drops++;
    }
    expect(drops).toBe(0);
  });
});

describe("TokenBucket — 주입 시계 기준점", () => {
  test("nowMs 없이 생성하면 첫 tryConsume 시각이 기준점(생성 시 벽시계와 섞이지 않음)", () => {
    const b = new TokenBucket(0);
    // 생성 시점 벽시계 기준이었다면 10초분 refill로 통과했을 것.
    expect(b.tryConsume(IN_WORLD, Date.now() + 10_000)).toBe(false);
  });

  test("주입 시계(임의 원점)로도 refill이 정확", () => {
    const b = new TokenBucket(0);
    expect(b.tryConsume(IN_WORLD, 5_000)).toBe(false);
    expect(b.tryConsume(IN_WORLD, 5_010)).toBe(true); // 10ms × 100/s = 1토큰
    expect(b.tryConsume(IN_WORLD, 5_010)).toBe(false);
  });
});

describe("rateVerdict — IN_WORLD 1회성 명령 예약분(정지 후 버스트의 최신 의도 보존)", () => {
  const SKILL_CAST = PACKET_ID.SKILL_CAST;

  test("메인 버킷이 비면 비스트림 명령은 예약분으로 reserve(10건), 소진 후 drop", () => {
    const b = new TokenBucket(0, 0);
    const r = new TokenBucket(COMMAND_RESERVE_LIMITS.capacity, 0);
    const w = new StrikeWindow();
    for (let i = 0; i < COMMAND_RESERVE_LIMITS.capacity; i++) {
      expect(rateVerdict(b, w, "IN_WORLD", DEFAULT_STRIKE_POLICY, 0, SKILL_CAST, r)).toBe("reserve");
    }
    expect(rateVerdict(b, w, "IN_WORLD", DEFAULT_STRIKE_POLICY, 0, SKILL_CAST, r)).toBe("drop");
    // 예약 통과는 위반이 아니다 — strike는 마지막 drop 1건뿐.
    expect(w.countInWindow(DEFAULT_STRIKE_POLICY, 0)).toBe(1);
  });

  test.each([
    ["INPUT_CMD", PACKET_ID.INPUT_CMD],
    ["PING", PACKET_ID.PING],
  ])("상시 스트림(%s)은 예약분을 쓰지 않고 drop", (_name, id) => {
    const b = new TokenBucket(0, 0);
    const r = new TokenBucket(COMMAND_RESERVE_LIMITS.capacity, 0);
    const w = new StrikeWindow();
    expect(isStreamPacket(id)).toBe(true);
    expect(rateVerdict(b, w, "IN_WORLD", DEFAULT_STRIKE_POLICY, 0, id, r)).toBe("drop");
  });

  test.each([PACKET_ID.MOVE_STOP, PACKET_ID.SKILL_CAST, PACKET_ID.ITEM_USE, PACKET_ID.NPC_INTERACT])(
    "1회성 의도 id=%d는 비스트림",
    (id) => {
      expect(isStreamPacket(id)).toBe(false);
    },
  );

  test("pre-auth는 예약분과 무관하게 첫 위반 kick", () => {
    const b = new TokenBucket(0, 0);
    const r = new TokenBucket(COMMAND_RESERVE_LIMITS.capacity, 0);
    expect(
      rateVerdict(b, new StrikeWindow(), "AUTHENTICATED", DEFAULT_STRIKE_POLICY, 0, SKILL_CAST, r),
    ).toBe("kick");
  });

  test("예약분은 2/s로 회복 — 지속 악용 상한은 +2 pkt/s", () => {
    const b = new TokenBucket(0, 0);
    const r = new TokenBucket(0, 0);
    const w = new StrikeWindow();
    expect(rateVerdict(b, w, "IN_WORLD", DEFAULT_STRIKE_POLICY, 0, SKILL_CAST, r)).toBe("drop");
    // 0.5초 뒤: 메인 50토큰 회복 — 메인이 먼저 소비되므로 메인을 비워 둔 채 예약만 본다.
    const emptyMain = new TokenBucket(0, 500);
    expect(rateVerdict(emptyMain, w, "IN_WORLD", DEFAULT_STRIKE_POLICY, 500, SKILL_CAST, r)).toBe(
      "reserve",
    );
    expect(rateVerdict(emptyMain, w, "IN_WORLD", DEFAULT_STRIKE_POLICY, 500, SKILL_CAST, r)).toBe(
      "drop",
    );
  });

  test("10초 정지 버스트(PING 210건) 끝의 SKILL_CAST는 통과, PING은 종전대로 100 통과·110 drop", () => {
    const b = new TokenBucket(IN_WORLD.capacity, 0);
    const r = new TokenBucket(COMMAND_RESERVE_LIMITS.capacity, 0);
    const w = new StrikeWindow();
    const out = { pass: 0, reserve: 0, drop: 0, kick: 0 };
    for (let i = 0; i < 210; i++) {
      out[rateVerdict(b, w, "IN_WORLD", DEFAULT_STRIKE_POLICY, 10_000, PACKET_ID.PING, r)]++;
    }
    expect(out).toEqual({ pass: 100, reserve: 0, drop: 110, kick: 0 });
    expect(rateVerdict(b, w, "IN_WORLD", DEFAULT_STRIKE_POLICY, 10_000, SKILL_CAST, r)).toBe("reserve");
  });

  test("packetId·reserve 미지정 호출은 종전 판정과 동일(drop)", () => {
    const b = new TokenBucket(0, 0);
    expect(rateVerdict(b, new StrikeWindow(), "IN_WORLD", DEFAULT_STRIKE_POLICY, 0)).toBe("drop");
  });
});

describe("rateVerdict — 과부하 중 IN_WORLD strike 보류(3단계 슬라이스 8, 면제 예산 — 3단계 리뷰)", () => {
  /** 질의 횟수를 세는 과부하 신호 대역. */
  function gate(overloaded: boolean) {
    let asks = 0;
    return {
      isOverloaded: () => {
        asks++;
        return overloaded;
      },
      asks: () => asks,
    };
  }
  const EX = OVERLOAD_EXEMPT_LIMITS;
  const fullExempt = (nowMs = 0) => new TokenBucket(EX.capacity, nowMs);
  const PING = PACKET_ID.PING;
  const P = DEFAULT_STRIKE_POLICY;

  test("면제 예산: 용량 2400·30/s — 정상 클라(~21 pkt/s)보다 빨리 차서 정지 동안 쌓인 입력을 덮는다", () => {
    expect(EX).toEqual({ capacity: 2400, refillPerSec: 30 });
  });

  test("과부하면 IN_WORLD 위반은 면제 예산 안에서 drop만 — strike 미기록이라 maxDrops를 넘겨도 kick 없음", () => {
    const b = new TokenBucket(0, 0);
    const w = new StrikeWindow();
    const ex = fullExempt();
    for (let i = 0; i < EX.capacity; i++) {
      expect(rateVerdict(b, w, "IN_WORLD", P, 0, PING, null, gate(true), ex)).toBe("drop");
    }
    expect(w.countInWindow(P, 0)).toBe(0);
  });

  test("면제 예산을 다 쓴 flood는 과부하여도 strike로 센다 — maxDrops 초과 시 kick(리뷰: 무제한 면제 → 자기 유지 DoS)", () => {
    const b = new TokenBucket(0, 0);
    const w = new StrikeWindow();
    const ex = fullExempt();
    const g = gate(true);
    for (let i = 0; i < EX.capacity + P.maxDrops; i++) {
      expect(rateVerdict(b, w, "IN_WORLD", P, 0, PING, null, g, ex)).toBe("drop");
    }
    expect(rateVerdict(b, w, "IN_WORLD", P, 0, PING, null, g, ex)).toBe("kick");
  });

  test("지속 flood(1000 pkt/s)는 과부하가 이어져도 약 3초 안에 kick", () => {
    const b = new TokenBucket(IN_WORLD.capacity, 0);
    const w = new StrikeWindow();
    const ex = fullExempt();
    let kickAt = -1;
    for (let t = 0; t < 10_000 && kickAt < 0; t++) {
      if (rateVerdict(b, w, "IN_WORLD", P, t, PING, null, gate(true), ex) === "kick") kickAt = t;
    }
    // (2400 + 300) / (1000 − 100 − 30) ≈ 3.1초.
    expect(kickAt).toBeGreaterThan(2_900);
    expect(kickAt).toBeLessThan(3_400);
  });

  test("정상 클라(21 pkt/s)의 긴 정지 버스트는 과부하 중 kick 없음 — 60초·120초 정지(1,260·2,520건 동시 도착)", () => {
    for (const stallSec of [60, 120]) {
      const b = new TokenBucket(IN_WORLD.capacity, 0);
      const w = new StrikeWindow();
      const ex = fullExempt();
      const resumeAt = stallSec * 1000;
      let kicks = 0;
      for (let i = 0; i < 21 * stallSec; i++) {
        if (rateVerdict(b, w, "IN_WORLD", P, resumeAt, PING, null, gate(true), ex) === "kick") kicks++;
      }
      expect(kicks).toBe(0);
    }
  });

  test("면제 예산은 과부하일 때만 쓴다 — 정상 시 drop은 strike, 예산 그대로", () => {
    const b = new TokenBucket(0, 0);
    const w = new StrikeWindow();
    const ex = fullExempt();
    for (let i = 0; i < 10; i++) rateVerdict(b, w, "IN_WORLD", P, 0, PING, null, gate(false), ex);
    expect(w.countInWindow(P, 0)).toBe(10);
    expect(ex.peek()).toBe(EX.capacity);
  });

  test("면제 버킷 없이 신호만 주면 보류 없음 — 종전 판정(strike 기록)", () => {
    const b = new TokenBucket(0, 0);
    const w = new StrikeWindow();
    for (let i = 0; i < P.maxDrops; i++) {
      expect(rateVerdict(b, w, "IN_WORLD", P, 0, PING, null, gate(true), null)).toBe("drop");
    }
    expect(rateVerdict(b, w, "IN_WORLD", P, 0, PING, null, gate(true), null)).toBe("kick");
  });

  test("과부하가 풀리면 strike는 그때부터 센다 — 보류분은 소급하지 않음", () => {
    const b = new TokenBucket(0, 0);
    const w = new StrikeWindow();
    const ex = fullExempt();
    for (let i = 0; i < 500; i++) rateVerdict(b, w, "IN_WORLD", P, 0, PING, null, gate(true), ex);
    const normal = gate(false);
    for (let i = 0; i < P.maxDrops; i++) {
      expect(rateVerdict(b, w, "IN_WORLD", P, 0, PING, null, normal, ex)).toBe("drop");
    }
    expect(rateVerdict(b, w, "IN_WORLD", P, 0, PING, null, normal, ex)).toBe("kick");
  });

  test("과부하여도 pre-auth는 첫 위반 kick(brute force 차단 유지)", () => {
    for (const state of ["ANON", "HELLO_RECV", "AUTHENTICATED"] as const) {
      const b = new TokenBucket(0, 0);
      expect(rateVerdict(b, new StrikeWindow(), state, P, 0, PING, null, gate(true), fullExempt())).toBe("kick");
    }
  });

  test("과부하여도 명령 예약분은 그대로 reserve — 예약 소진 후에만 drop(면제 예산 무소모)", () => {
    const b = new TokenBucket(0, 0);
    const reserve = new TokenBucket(COMMAND_RESERVE_LIMITS.capacity, 0);
    const w = new StrikeWindow();
    const ex = fullExempt();
    const g = gate(true);
    for (let i = 0; i < COMMAND_RESERVE_LIMITS.capacity; i++) {
      expect(rateVerdict(b, w, "IN_WORLD", P, 0, PACKET_ID.SKILL_CAST, reserve, g, ex)).toBe("reserve");
    }
    expect(ex.peek()).toBe(EX.capacity);
    expect(rateVerdict(b, w, "IN_WORLD", P, 0, PACKET_ID.SKILL_CAST, reserve, g, ex)).toBe("drop");
    expect(w.countInWindow(P, 0)).toBe(0);
  });

  test("통과(pass)·예약(reserve)·pre-auth 판정에서는 신호를 묻지 않는다 — 위반 경로에서만 1회", () => {
    const g = gate(true);
    const b = new TokenBucket(IN_WORLD.capacity, 0);
    rateVerdict(b, new StrikeWindow(), "IN_WORLD", P, 0, PING, null, g, fullExempt());
    rateVerdict(new TokenBucket(0, 0), new StrikeWindow(), "ANON", P, 0, PING, null, g, fullExempt());
    const reserve = new TokenBucket(COMMAND_RESERVE_LIMITS.capacity, 0);
    rateVerdict(new TokenBucket(0, 0), new StrikeWindow(), "IN_WORLD", P, 0, PACKET_ID.SKILL_CAST, reserve, g, fullExempt());
    expect(g.asks()).toBe(0);
    rateVerdict(new TokenBucket(0, 0), new StrikeWindow(), "IN_WORLD", P, 0, PING, null, g, fullExempt());
    expect(g.asks()).toBe(1);
  });

  test("신호 미지정(null)은 종전 판정과 동일 — maxDrops 초과 시 kick", () => {
    const b = new TokenBucket(0, 0);
    const w = new StrikeWindow();
    for (let i = 0; i < P.maxDrops; i++) {
      expect(rateVerdict(b, w, "IN_WORLD", P, 0, PING, null, null, fullExempt())).toBe("drop");
    }
    expect(rateVerdict(b, w, "IN_WORLD", P, 0, PING, null, null, fullExempt())).toBe("kick");
  });
});
