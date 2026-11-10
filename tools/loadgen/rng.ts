// 시드 고정 PRNG — loadgen은 시뮬 외부라 Math.random도 허용되지만, 봇 의사결정·스폰 생성을
// 재현 가능하게(같은 --seed = 같은 행동 분포) 하려고 mulberry32를 쓴다.

export type Rng = () => number;

/** [0, 1) 균등. 32비트 상태 — 부하 도구 용도로 충분(암호용 아님). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 문자열/정수 조합 → 32비트 시드(FNV-1a). 샤드·봇 인덱스별 독립 스트림 파생용. */
export function deriveSeed(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 0x2c;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** [lo, hi] 정수 균등. */
export function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** [lo, hi) 실수 균등. */
export function randRange(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}
