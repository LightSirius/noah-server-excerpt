// Phase B — connection별 토큰 버킷 rate limiter.
//
// 정책:
//   IN_WORLD: capacity 100, refill 100/s (정상 클라 ≈21 pkt/s — INPUT_CMD 20 Hz·PING 1 Hz·MOVE_TO 평균 0.3/s — 의 ≈5배, DoS 가드.
//             종류별 제한은 핸들러: MOVE_TO 8/s·채팅 2/s, INPUT_CMD는 입력 큐가 tick당 non-idle 1건만 적용)
//   pre-IN_WORLD (ANON / HELLO_RECV / AUTHENTICATED): capacity 10, refill 10/s
//                — handshake·로그인은 RTT당 한 발 — burst 10이면 충분 + 자격증명 brute force 차단.
//
// 위반 처리(1-B, `rateVerdict`):
//   pre-IN_WORLD: 첫 위반 즉시 KICK — brute force 차단.
//   IN_WORLD: 패킷 drop + strike 기록, 슬라이딩 윈도우 내 drop이 임계를 *초과*할 때만 KICK.
//     서버 정지(자동저장·GC 등) 동안 클라가 쌓은 입력이 재개 시 한 번에 도착해 버킷을 넘치는 건
//     악용이 아니다 — 첫 위반 킥은 정지 1회에 동접 대부분(771/1000 실측)을 끊었다.
//   IN_WORLD + 서버 과부하(3단계 슬라이스 8, net/overloadSignal): 연결별 면제 예산(OVERLOAD_EXEMPT_LIMITS) 안에서는
//     drop만 하고 strike를 기록하지 않는다. 지속 과부하(realistic 1000 접속 폭주)는 이벤트 루프가 수십 초 밀려 버스트가
//     윈도우를 넘겼다(800~950 KICK/런). 예산은 정상 클라 속도보다 빠르게 벽시계로 차오르므로 정지 S초 동안 쌓인 정상
//     입력(21·S)은 덮고, 예산을 넘긴 flood는 과부하 중에도 strike로 세어 KICK한다 — 종전 전면 면제는 flood의 drop 비용이
//     tick skip을 만들어 과부하(=면제)를 스스로 유지하는 DoS 경로였다(3단계 리뷰).
//   IN_WORLD 명령 예약분: 버스트는 도착 순서대로 처리돼 가장 오래된 100건이 통과하고 최신분이
//     버려진다. 상시 스트림(INPUT_CMD 20 Hz·PING 1 Hz)은 최신분을 잃어도 무해하지만, 정지 중
//     눌린 1회성 의도(MOVE_STOP·SKILL_CAST·ITEM_USE·NPC_INTERACT…)는 클라가 재전송하지 않아
//     조용히 사라진다(architecture.md §10). 그래서 메인 버킷이 빈 동안에도 비스트림 명령 프레임은
//     작은 예약 버킷(COMMAND_RESERVE_LIMITS)으로 통과시킨다 — 지속 악용 상한은 +2 pkt/s.
//
// rate limit은 시뮬 외부(net 계층)이라 wall clock(`Date.now`) 사용 OK
// — sim/, world/만 결정론 게이트 적용. 엣지(clientEdge)는 시계를 주입받아(ClientEdgeOptions.now)
// 테스트가 벽시계 대기 없이 결정론으로 검증한다.

import type { LoginState } from "../identity/loginFlow";
import { PACKET_ID } from "./codec.generated";

export interface BucketLimits {
  readonly capacity: number;
  readonly refillPerSec: number;
}

const IN_WORLD_LIMITS: BucketLimits = { capacity: 100, refillPerSec: 100 };
const PRE_AUTH_LIMITS: BucketLimits = { capacity: 10, refillPerSec: 10 };

export function bucketLimitsForState(state: LoginState): BucketLimits {
  return state === "IN_WORLD" ? IN_WORLD_LIMITS : PRE_AUTH_LIMITS;
}

/** IN_WORLD 명령 예약 버킷 — 메인 버킷이 빈 동안 비스트림 명령 프레임만 소비. */
export const COMMAND_RESERVE_LIMITS: BucketLimits = { capacity: 10, refillPerSec: 2 };

/**
 * 과부하 strike 면제 예산(연결별, 처음엔 가득) — 과부하 중 IN_WORLD drop 1건이 1토큰. refill 30/s는 정상 클라
 * (~21 pkt/s: 20 Hz INPUT_CMD + PING)보다 빨라 정지 동안 쌓인 입력을 덮고, 용량 2400은 메인 버킷 100·strike 300과
 * 합쳐 약 130초 정지 버스트까지 KICK 없이 받는다(21·S − 100 ≤ 2400 + 300). flood는 지속 면제가 30/s뿐이라 평소처럼
 * strike 윈도우에 걸린다(1000 pkt/s면 약 3초).
 */
export const OVERLOAD_EXEMPT_LIMITS: BucketLimits = { capacity: 2400, refillPerSec: 30 };

/**
 * 상시 스트림 패킷 — 정지 후 버스트에서 최신분을 버려도 무해(다음 프레임이 대체)하므로 명령
 * 예약분을 쓰지 않는다. 그 외 IN_WORLD 패킷은 1회성 의도로 본다.
 */
export function isStreamPacket(packetId: number): boolean {
  return packetId === PACKET_ID.INPUT_CMD || packetId === PACKET_ID.PING;
}

/**
 * Stateless TokenBucket — capacity/refill을 호출 시점에 받아 처리.
 * 같은 connection 안에서 상태가 바뀌어도 새 bucket 만들지 않고 limits만 갱신해 흐름 유지.
 * nowMs 미지정 생성이면 첫 tryConsume의 시각을 기준점으로 삼는다 — 주입 시계(테스트)와
 * 생성 시점 벽시계가 섞이지 않게.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefillMs: number | null;

  constructor(initial = PRE_AUTH_LIMITS.capacity, nowMs?: number) {
    this.tokens = initial;
    this.lastRefillMs = nowMs ?? null;
  }

  /** true면 토큰 1개 차감 성공, false면 한도 초과. */
  tryConsume(limits: BucketLimits, nowMs: number = Date.now()): boolean {
    const elapsedSec = Math.max(0, nowMs - (this.lastRefillMs ?? nowMs)) / 1000;
    const refilled = this.tokens + elapsedSec * limits.refillPerSec;
    this.tokens = refilled > limits.capacity ? limits.capacity : refilled;
    this.lastRefillMs = nowMs;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /** 테스트·관측용. 외부 코드는 이 값에 의존하지 말 것. */
  peek(): number {
    return this.tokens;
  }
}

/** IN_WORLD drop의 KICK 판정 — `windowMs` 안의 drop이 `maxDrops`를 초과하면 KICK. */
export interface StrikePolicy {
  readonly windowMs: number;
  /**
   * 윈도우 내 허용 drop 수. 0 = 첫 drop부터 KICK(종전 즉시 킥 정책과 동치). 주의: 디코드 실패 strike(frameIngest, NET_DECODE_STRIKES)는
   * 0을 "KICK 끔"으로 재해석해 record를 부르지 않는다.
   */
  readonly maxDrops: number;
}

/**
 * 기본 3000ms/300건 — 정상 클라(~21 pkt/s: 20 Hz INPUT_CMD + PING)는 약 19초 정지까지
 * 버스트((21·S − 100) drop)가 임계 안에 들고, 지속 flood는 초당 drop이 100을 넘는
 * 순간(≈ 200 pkt/s 이상) 윈도우 안에 킥된다. 근거 수치는 architecture.md §10.
 */
export const DEFAULT_STRIKE_POLICY: StrikePolicy = { windowMs: 3000, maxDrops: 300 };

/**
 * 슬라이딩 윈도우 strike 카운터 — 최근 maxDrops건의 타임스탬프 링.
 * 링이 가득 찼는데 덮어쓸 최고(最古) 항목이 아직 윈도우 안이면 "윈도우 내 maxDrops+1건" = 초과.
 * 기록 O(1)·무할당(링은 첫 drop 시 1회 할당 — drop이 없는 대다수 세션은 메모리 0).
 */
export class StrikeWindow {
  private stamps: Float64Array | null = null;
  /** 다음 기록 위치 — 링이 가득 차면 곧 가장 오래된 strike. */
  private next = 0;
  private filled = 0;

  /** strike 1건 기록. true = 윈도우 내 strike가 maxDrops 초과(→ KICK). */
  record(policy: StrikePolicy, nowMs: number = Date.now()): boolean {
    const cap = policy.maxDrops;
    if (cap < 1) return true;
    const stamps = this.ring(cap, nowMs);
    const over = this.filled === cap && nowMs - (stamps[this.next] ?? 0) < policy.windowMs;
    stamps[this.next] = nowMs;
    this.next = this.next + 1 === cap ? 0 : this.next + 1;
    if (this.filled < cap) this.filled++;
    return over;
  }

  /** 윈도우 내 strike 수 — 관측·테스트용(O(maxDrops) 스캔, 핫패스 금지). */
  countInWindow(policy: StrikePolicy, nowMs: number = Date.now()): number {
    const stamps = this.stamps;
    if (stamps === null) return 0;
    let n = 0;
    for (let i = 0; i < this.filled; i++) {
      const age = nowMs - (stamps[i] ?? 0);
      if (age >= 0 && age < policy.windowMs) n++;
    }
    return n;
  }

  /**
   * 정책 크기의 링 확보. 시계 역행(최신 strike보다 과거 nowMs)이면 리셋 — 미래 타임스탬프가
   * 역행 폭만큼 윈도우를 점유해 정상 세션을 오킥하는 것보다 관대 측이 안전하다.
   */
  private ring(cap: number, nowMs: number): Float64Array {
    let stamps = this.stamps;
    if (stamps === null || stamps.length !== cap) {
      stamps = new Float64Array(cap);
      this.stamps = stamps;
      this.next = 0;
      this.filled = 0;
      return stamps;
    }
    const newest = stamps[this.next === 0 ? cap - 1 : this.next - 1] ?? 0;
    if (this.filled > 0 && nowMs < newest) {
      this.next = 0;
      this.filled = 0;
    }
    return stamps;
  }
}

/**
 * 패킷 1건의 rate 게이트 판정 — pass: 디스패치 / reserve: 명령 예약분으로 디스패치 /
 * drop: 폐기(무응답) / kick: KICK 후 close.
 */
export type RateVerdict = "pass" | "reserve" | "drop" | "kick";

/** 서버 과부하 신호(net/overloadSignal)의 rate 판정용 표면. */
export interface StrikeSuspension {
  isOverloaded(): boolean;
}

/**
 * packetId·reserve를 주면(IN_WORLD 한정) 메인 버킷이 빈 동안 비스트림 명령 프레임이 예약
 * 버킷으로 통과한다 — 예약 통과는 위반이 아니므로 strike를 기록하지 않는다. 위치 인자인 이유:
 * 프레임마다 호출되는 핫패스라 옵션 객체 할당을 피한다.
 * suspension이 과부하를 알리고 exempt(연결별 면제 예산)에 토큰이 있으면(3단계 슬라이스 8) IN_WORLD 위반은 drop만 하고
 * strike를 기록하지 않는다 — 이벤트 루프가 밀린 동안 소켓마다 한꺼번에 도착하는 입력은 악용이 아니다. 예산이 없거나
 * exempt가 null이면 과부하여도 strike를 기록한다. 신호는 위반 경로에서만 묻는다(예약 통과 뒤).
 */
export function rateVerdict(
  bucket: TokenBucket,
  strikes: StrikeWindow,
  state: LoginState,
  policy: StrikePolicy,
  nowMs: number = Date.now(),
  packetId = -1,
  reserve: TokenBucket | null = null,
  suspension: StrikeSuspension | null = null,
  exempt: TokenBucket | null = null,
): RateVerdict {
  if (bucket.tryConsume(bucketLimitsForState(state), nowMs)) return "pass";
  if (state !== "IN_WORLD") return "kick";
  if (
    reserve !== null &&
    packetId >= 0 &&
    !isStreamPacket(packetId) &&
    reserve.tryConsume(COMMAND_RESERVE_LIMITS, nowMs)
  ) {
    return "reserve";
  }
  if (exempt !== null && suspension?.isOverloaded() === true && exempt.tryConsume(OVERLOAD_EXEMPT_LIMITS, nowMs)) {
    return "drop";
  }
  return strikes.record(policy, nowMs) ? "kick" : "drop";
}
