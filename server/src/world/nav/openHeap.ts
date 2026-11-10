// A* open list — (f, h, ci) 사전식 최소 이진 힙. 병렬 typed array라 push/pop에 객체 할당이 없다.
//
// 결정론: 비교자는 선형 스캔 원본과 같은 (f asc, h asc, ci asc). A*의 open 항목은 키가 서로
// 다르므로(같은 셀의 재삽입은 g가 엄격히 작아 f가 다르다) 최소가 유일하고, pop 순서는 힙 내부
// 배치와 무관하게 원본과 같다. 키가 겹치는 용도에 쓰면 같은 키끼리의 순서는 보장하지 않는다.

const DEFAULT_CAPACITY = 64;

function keyLess(af: number, ah: number, ac: number, bf: number, bh: number, bc: number): boolean {
  return af < bf || (af === bf && (ah < bh || (ah === bh && ac < bc)));
}

export class OpenHeap {
  private f: Int32Array;
  private h: Int32Array;
  private ci: Int32Array;
  private n = 0;

  constructor(initialCapacity: number = DEFAULT_CAPACITY) {
    const cap = Math.max(1, initialCapacity);
    this.f = new Int32Array(cap);
    this.h = new Int32Array(cap);
    this.ci = new Int32Array(cap);
  }

  get size(): number {
    return this.n;
  }

  clear(): void {
    this.n = 0;
  }

  push(f: number, h: number, ci: number): void {
    if (this.n === this.f.length) this.grow();
    const F = this.f;
    const Hs = this.h;
    const C = this.ci;
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!keyLess(f, h, ci, F[p]!, Hs[p]!, C[p]!)) break;
      F[i] = F[p]!;
      Hs[i] = Hs[p]!;
      C[i] = C[p]!;
      i = p;
    }
    F[i] = f;
    Hs[i] = h;
    C[i] = ci;
  }

  /** 최소 키 항목을 꺼내 그 ci를 돌려준다. 비어 있으면 -1. */
  pop(): number {
    if (this.n === 0) return -1;
    const C = this.ci;
    const top = C[0]!;
    const n = --this.n;
    if (n > 0) this.siftDownFromRoot(this.f[n]!, this.h[n]!, C[n]!, n);
    return top;
  }

  /** 루트 자리에 (f, h, ci)를 내려 앉힌다. n = 남은 항목 수. */
  private siftDownFromRoot(f: number, h: number, ci: number, n: number): void {
    const F = this.f;
    const Hs = this.h;
    const C = this.ci;
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      const r = c + 1;
      if (r < n && keyLess(F[r]!, Hs[r]!, C[r]!, F[c]!, Hs[c]!, C[c]!)) c = r;
      if (!keyLess(F[c]!, Hs[c]!, C[c]!, f, h, ci)) break;
      F[i] = F[c]!;
      Hs[i] = Hs[c]!;
      C[i] = C[c]!;
      i = c;
    }
    F[i] = f;
    Hs[i] = h;
    C[i] = ci;
  }

  private grow(): void {
    const cap = this.f.length * 2;
    const f = new Int32Array(cap);
    const h = new Int32Array(cap);
    const ci = new Int32Array(cap);
    f.set(this.f);
    h.set(this.h);
    ci.set(this.ci);
    this.f = f;
    this.h = h;
    this.ci = ci;
  }
}
