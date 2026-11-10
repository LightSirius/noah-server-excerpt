// Phase 3 결정론 토대.
//
// 시뮬 코드(`sim/`, `world/`)에서 `Math.random`/`Date.now`/`performance.now`를
// 직접 호출하면 같은 입력에 같은 출력이 보장되지 않는다 → 회귀 테스트가 무너지고
// 클라 예측·재조정이 망가진다.
//
// 본 모듈은 두 가지를 강제한다:
// 1) 시뮬용 시간 = `tickIndex` (정수, 시작 0). 절대 시간 조회는 본 모듈만.
// 2) 시뮬용 난수 = xorshift32 seeded PRNG. 같은 seed → 같은 시퀀스.

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ; // 50.0
export const TICK_DT_S = 1 / TICK_HZ; // 0.05초 — 시뮬 시간 step

/** 시뮬 안에서 `Date.now()` 대신 사용. 외부 I/O(로그·DB)는 직접 사용 가능. */
export function tickToMs(tickIndex: number): number {
  return tickIndex * TICK_MS;
}

export function msToTick(ms: number): number {
  return Math.floor(ms / TICK_MS);
}

/** xorshift32. 32-bit 정수 상태. 순수, 부작용 없음, 결정적. */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    // seed=0은 xorshift에서 stuck-at-zero. 1로 fallback.
    this.state = (seed | 0) === 0 ? 1 : seed | 0;
  }

  /** 다음 u32. 0..0xFFFFFFFF. */
  nextU32(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x | 0;
    return x >>> 0;
  }

  /** [0, 1). f64. Math.random 대체. */
  nextFloat(): number {
    return this.nextU32() / 0x1_0000_0000;
  }

  /** [min, max] 정수, 양 끝 포함. */
  nextIntInclusive(min: number, max: number): number {
    if (max < min) throw new Error(`nextIntInclusive: max(${max}) < min(${min})`);
    const range = max - min + 1;
    return min + (this.nextU32() % range);
  }

  /** 디버깅·체크포인트용 직렬화. */
  snapshot(): number {
    return this.state >>> 0;
  }

  restore(state: number): void {
    this.state = (state | 0) === 0 ? 1 : state | 0;
  }
}
