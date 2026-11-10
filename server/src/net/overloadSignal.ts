// 3단계 슬라이스 8 — 과부하 신호: tick 루프에서 파생해 네트워크 계층(rate 킥·접속 제한)에 노출.
//
// 2-C 발견: realistic 1000 접속 폭주처럼 이벤트 루프가 오래 밀리면 클라가 쌓은 입력이 소켓마다 한 번에
// 도착해 IN_WORLD strike 윈도우를 넘긴다 — 런당 800~950명이 KICK 5(rate)로 끊겼다(악용이 아니라 서버 지연).
// 과부하 중에는 ① IN_WORLD rate 위반을 연결별 면제 예산(net/rateLimit OVERLOAD_EXEMPT_LIMITS — 정상 클라 속도로 차오름)
// 안에서 drop만 하고 strike를 기록하지 않으며(rateVerdict — 예산을 넘긴 flood는 평소처럼 strike·KICK 5)
// ② 신규 접속을 KICK 9 "server busy"로 거절한다(sessionLifecycle.acceptSession — admission control, 아래 더 높은 문턱).
//
// 신호(architecture.md §4.1·§10):
//   진입 — 최근 windowMs 안에 캐치업 상한으로 건너뛴 tick 합 ≥ enterSkips(지속 시 Hz ≤ 20 − enterSkips/창초,
//          기본 16 Hz 이하), 또는 tick 루프 무응답(마지막 반복 이후 경과) ≥ stallMs. 무응답은 질의 시점에도
//          본다 — 정지 직후 tick 타이머보다 수신 콜백이 먼저 돌아도 그 버스트를 strike로 세지 않게.
//   유지 — 창 안 skip 합 ≥ ceil(enterSkips/4)(기본 5 ≈ 19 Hz) 또는 최근 windowMs 안 무응답(진입보다 낮은 비례 문턱 =
//          히스테리시스). 해제 — 둘 다 아님. 종전 "skip 1건이면 유지"는 간헐 블록(GC·채팅 버스트 300ms — skip 2)만으로
//          과부하가 끝나지 않았다(3단계 리뷰).
//   접속 제한 — 과부하 && (창 안 skip 합 ≥ ceil(enterSkips/2)(기본 10 ≈ 18 Hz 이하) 또는 최근 windowMs 안 무응답).
//          strike 보류보다 높은 문턱이라 1초 정지 뒤 19 Hz로 회복한 서버는 정지 후 windowMs가 지나면 접속을 다시 받는다.
// 시계는 여기(net 계층)에만 있다 — sim/world 결정론 게이트 무관. tick 루프는 반복마다 observeTick(건너뛴 수)만
// 부른다(TickLoopOptions.onSchedule). 게이지 mmorpg_overload_active는 전이 때만 0/1.

import { metrics } from "../obs/metrics";
import { createLogger } from "../obs/logger";
import { createSquelch, suppressedMeta } from "../obs/logSquelch";

const log = createLogger("overload");
// 용량 경계(유지 문턱 근처)에서 진입·해제가 반복돼도 로그가 불지 않게.
const transitionSquelch = createSquelch({ ratePerSec: 0.2, burst: 4 });

export interface OverloadPolicy {
  /** false = 신호 끔(항상 정상 — 종전 동작). env OVERLOAD_PROTECT. */
  readonly enabled: boolean;
  /** 과부하 중 신규 접속 거절(KICK 9 "server busy"). env OVERLOAD_ADMISSION. */
  readonly admission: boolean;
  /** 진입 문턱: windowMs 안의 skip tick 합. env OVERLOAD_ENTER_SKIPS. */
  readonly enterSkips: number;
  /** skip 합산 창이자 무응답 1회가 증거로 남는 시간(ms). env OVERLOAD_WINDOW_MS. */
  readonly windowMs: number;
  /** tick 루프 무응답 문턱(ms). env OVERLOAD_STALL_MS. */
  readonly stallMs: number;
}

export const DEFAULT_OVERLOAD_POLICY: OverloadPolicy = {
  enabled: true,
  admission: true,
  enterSkips: 20,
  windowMs: 5000,
  stallMs: 1000,
};

/** 네트워크 계층이 보는 표면 — 엣지(clientEdge)·수용(sessionLifecycle)은 이 인터페이스만 받는다(테스트 대역 주입). */
export interface OverloadView {
  /** 지금 과부하인가 — IN_WORLD rate 위반의 strike 기록을 면제 예산 안에서 보류한다. */
  isOverloaded(): boolean;
  /** 지금 신규 접속을 거절하는가(admission && 과부하 && 강한 증거 — 최근 무응답 또는 창 안 skip ≥ ceil(enterSkips/2)). */
  rejectsNewConnections(): boolean;
}

export interface OverloadSignalOptions {
  /** 단조 시계(ms). 기본 performance.now — tick 루프와 같은 시계. */
  now?: () => number;
  /** 전이 게이지. 기본 metrics.overloadActive. */
  gauge?: { set(v: number): void };
  policy?: Partial<OverloadPolicy>;
}

/** 반복 간격이 이것을 넘은 몫만 서버 지연으로 센다(정상 간격 ≈ 50 ms + 타이머 흔들림). */
const LATE_GRACE_MS = 100;

/** 창을 나눈 칸 수 — 창 합은 칸 단위 근사(최근 windowMs × 0.9~1.0). 메모리·연산 O(1). */
const SLOT_COUNT = 10;

/** 칸 단위 슬라이딩 합 — 칸마다 (칸 번호, 합). 지난 칸은 덮어쓸 때 리셋. 합은 칸 번호가 같고 add가 없으면 캐시를 쓴다. */
class SkipWindow {
  private readonly ids = new Float64Array(SLOT_COUNT).fill(Number.NEGATIVE_INFINITY);
  private readonly counts = new Float64Array(SLOT_COUNT);
  private sumId = Number.NaN;
  private sumValue = 0;

  constructor(private readonly slotMs: number) {}

  add(t: number, n: number): void {
    const id = Math.floor(t / this.slotMs);
    const i = ((id % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT;
    if (this.ids[i] !== id) {
      this.ids[i] = id;
      this.counts[i] = 0;
    }
    this.counts[i] = (this.counts[i] ?? 0) + n;
    this.sumId = Number.NaN;
  }

  sum(t: number): number {
    const id = Math.floor(t / this.slotMs);
    if (id === this.sumId) return this.sumValue;
    let s = 0;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const age = id - (this.ids[i] ?? Number.NEGATIVE_INFINITY);
      if (age >= 0 && age < SLOT_COUNT) s += this.counts[i] ?? 0;
    }
    this.sumId = id;
    this.sumValue = s;
    return s;
  }
}

export class OverloadSignal implements OverloadView {
  private readonly policy: OverloadPolicy;
  private readonly now: () => number;
  private readonly gauge: { set(v: number): void };
  private readonly skips: SkipWindow;
  /** 유지 문턱(창 안 skip 합) — ceil(enterSkips/4). */
  private readonly holdSkips: number;
  /** 접속 제한 문턱(창 안 skip 합) — ceil(enterSkips/2). */
  private readonly admitSkips: number;
  private lastBeatAt: number;
  /** 마지막으로 무응답(반복 간격 ≥ stallMs, 또는 질의 시점 무응답)을 본 시각. */
  private lastStallAt = Number.NEGATIVE_INFINITY;
  private active = false;
  private enteredAt = 0;
  /** 누적 서버 지연(ms) — 정책 enabled와 무관하게 잰다(lateMs). */
  private lateTotal = 0;
  private lateBeatAt: number;

  constructor(opts: OverloadSignalOptions = {}) {
    this.policy = { ...DEFAULT_OVERLOAD_POLICY, ...opts.policy };
    this.now = opts.now ?? (() => performance.now());
    this.gauge = opts.gauge ?? metrics.overloadActive;
    this.skips = new SkipWindow(this.policy.windowMs / SLOT_COUNT);
    this.holdSkips = Math.max(1, Math.ceil(this.policy.enterSkips / 4));
    this.admitSkips = Math.max(1, Math.ceil(this.policy.enterSkips / 2));
    this.lastBeatAt = this.now();
    this.lateBeatAt = this.lastBeatAt;
  }

  /**
   * 누적 서버 지연(ms) — tick 루프 반복 간격 중 100 ms를 넘은 몫의 합 + 지금 진행 중인 무응답의 같은 몫(단조 증가).
   */
  lateMs(): number {
    return this.lateTotal + Math.max(0, this.now() - this.lateBeatAt - LATE_GRACE_MS);
  }

  /** tick 루프 반복 1회(다음 데드라인 확정 직후·재예약 직전) — skipped = 이번 반복에서 캐치업 상한으로 건너뛴 tick 수. */
  observeTick(skipped: number): void {
    const t = this.now();
    this.lateTotal += Math.max(0, t - this.lateBeatAt - LATE_GRACE_MS);
    this.lateBeatAt = t;
    if (!this.policy.enabled) return;
    const gap = t - this.lastBeatAt;
    this.lastBeatAt = t;
    if (skipped > 0) this.skips.add(t, skipped);
    const stalled = gap >= this.policy.stallMs;
    if (stalled) this.lastStallAt = t;
    if (!this.active) {
      if (stalled) this.enter(t, "stall", gap);
      else if (skipped > 0 && this.skips.sum(t) >= this.policy.enterSkips) this.enter(t, "skips", gap);
    } else {
      this.exitIfCalm(t);
    }
  }

  isOverloaded(): boolean {
    if (!this.policy.enabled) return false;
    return this.refresh(this.now());
  }

  rejectsNewConnections(): boolean {
    if (!this.policy.enabled || !this.policy.admission) return false;
    const t = this.now();
    if (!this.refresh(t)) return false;
    return t - this.lastStallAt < this.policy.windowMs || this.skips.sum(t) >= this.admitSkips;
  }

  /** 질의 시점 판정 — 진행 중인 무응답은 증거(정지 직후 수신 콜백이 tick보다 먼저 돌아도), 아니면 해제 조건을 본다. */
  private refresh(t: number): boolean {
    if (t - this.lastBeatAt >= this.policy.stallMs) {
      this.lastStallAt = t;
      if (!this.active) this.enter(t, "stall", t - this.lastBeatAt);
    } else if (this.active) {
      this.exitIfCalm(t);
    }
    return this.active;
  }

  /** 최근 windowMs 안 무응답이 없고 창 안 skip이 유지 문턱 미만이면 해제. */
  private exitIfCalm(t: number): void {
    if (t - this.lastStallAt < this.policy.windowMs) return;
    if (this.skips.sum(t) >= this.holdSkips) return;
    this.exit(t);
  }

  /** gapMs = 진입 시점의 루프 반복 간격(무응답 진입이면 정지 길이 — 관측용). */
  private enter(t: number, cause: "skips" | "stall", gapMs: number): void {
    this.active = true;
    this.enteredAt = t;
    this.gauge.set(1);
    const sup = transitionSquelch.allow("transition");
    if (sup >= 0) {
      log.warn(
        suppressedMeta(
          {
            cause,
            skipsInWindow: this.skips.sum(t),
            loopGapMs: Math.round(gapMs),
            admission: this.policy.admission,
          },
          sup,
        ),
        "overload entered — IN_WORLD rate strikes suspended",
      );
    }
  }

  private exit(t: number): void {
    this.active = false;
    this.gauge.set(0);
    const sup = transitionSquelch.allow("transition");
    if (sup >= 0) {
      log.info(suppressedMeta({ durationMs: Math.round(t - this.enteredAt) }, sup), "overload cleared");
    }
  }
}
