// 로그 폭주 억제(스쿼시) — 키별 토큰 버킷 + LRU 상한 + 선택적 전역 2차 버킷.
//
// 대상: 공격자 유발 warn 경로(디코드 실패/미지 패킷/상태 거부 — 무킥이라 conn당 100pkt/s
// × 512conn = 이론상 51,200줄/초)와 지속 장애(존 tick 반복 예외 = 20줄/초 영구).
// 억제는 소실이 아니다 — 같은 키의 다음 허용 라인에 suppressed 카운트가 실려 규모가 보존되고,
// 각 지점의 메트릭 카운터는 억제와 무관하게 계속 오른다.
//
// obs/*는 CI sim purity guard 면제 — Date.now 사용 합법. sim/world 호출부는 키 문자열만 전달.

import type { Logger } from "./logger";
import { metrics } from "./metrics";

export interface SquelchOptions {
  ratePerSec: number;
  burst: number;
  /** 키 LRU 상한(기본 1024) — connId 파생 키가 무한 증식하지 않게. */
  maxKeys?: number;
  /** 설정 시 키 합산에도 2차 버킷 적용 — 키가 계속 새로워도(재접속 폭주) 전역 총량을 캡. */
  globalRatePerSec?: number;
  globalBurst?: number;
  /** 테스트 주입용 시계(기본 Date.now). */
  now?: () => number;
}

export interface Squelch {
  /** 허용이면 직전 억제 건수(0 이상 — suppressedMeta로 meta에 싣는다), 억제면 -1. */
  allow(key: string): number;
}

interface Bucket {
  tokens: number;
  lastMs: number;
  suppressed: number;
}

function refill(b: Bucket, nowMs: number, ratePerSec: number, burst: number): void {
  b.tokens = Math.min(burst, b.tokens + ((nowMs - b.lastMs) / 1000) * ratePerSec);
  b.lastMs = nowMs;
}

export function createSquelch(opts: SquelchOptions): Squelch {
  const maxKeys = opts.maxKeys ?? 1024;
  const nowFn = opts.now ?? Date.now;
  const buckets = new Map<string, Bucket>();
  const globalRate = opts.globalRatePerSec;
  const globalBurst = opts.globalBurst ?? globalRate ?? 0;
  const global: Bucket | null =
    globalRate !== undefined ? { tokens: globalBurst, lastMs: 0, suppressed: 0 } : null;

  return {
    allow(key: string): number {
      const now = nowFn();
      let b = buckets.get(key);
      if (b === undefined) {
        b = { tokens: opts.burst, lastMs: now, suppressed: 0 };
      } else {
        buckets.delete(key); // 재삽입으로 최근 사용 순서 갱신(Map 삽입순 = LRU).
      }
      buckets.set(key, b);
      if (buckets.size > maxKeys) {
        const oldest = buckets.keys().next();
        if (!oldest.done) {
          // 축출로 사라지는 suppressed는 메트릭으로 폴딩 — "억제는 소실이 아니다" 계약 보존.
          const evicted = buckets.get(oldest.value);
          if (evicted !== undefined && evicted.suppressed > 0) {
            metrics.logSuppressedLost.inc(undefined, evicted.suppressed);
          }
          buckets.delete(oldest.value);
        }
      }
      refill(b, now, opts.ratePerSec, opts.burst);
      if (b.tokens < 1) {
        b.suppressed++;
        return -1;
      }
      if (global !== null && globalRate !== undefined) {
        refill(global, now, globalRate, globalBurst);
        if (global.tokens < 1) {
          b.suppressed++;
          return -1;
        }
        global.tokens -= 1;
      }
      b.tokens -= 1;
      const n = b.suppressed;
      b.suppressed = 0;
      return n;
    },
  };
}

/** suppressed > 0일 때만 meta에 싣는다 — 평상시 레코드 필드 오염 없음. */
export function suppressedMeta(
  meta: Record<string, unknown>,
  suppressed: number,
): Record<string, unknown> {
  return suppressed > 0 ? { ...meta, suppressed } : meta;
}

// 클라 유발 검증 warn 공용 버킷 — 무킥 핸들러 경로는 conn당 rate limit 상한(인월드 100pkt/s)
// 까지 반복 가능해, 스쿼시 없이는 파일 보존 윈도·링을 공격자가 소각할 수 있다.
// 키는 "지점:주체" — 주체는 remoteAddress 권장(재접속에도 카운트 유지, connId 처닝 무력화).
const clientWarnBucket = createSquelch({
  ratePerSec: 1,
  burst: 3,
  globalRatePerSec: 20,
  globalBurst: 40,
});

/** 클라 유발 warn 단일 진입점 — 억제 시 무출력, 허용 시 suppressed 병합해 warn. */
export function warnClient(
  log: Logger,
  key: string,
  meta: Record<string, unknown>,
  msg: string,
): void {
  const sup = clientWarnBucket.allow(key);
  if (sup >= 0) log.warn(suppressedMeta(meta, sup), msg);
}
