// 가짜 클라 소켓(4단계 4.2c) — 클라 엣지 콜백 묶음(createClientEdge — monolith 로컬 엣지·게이트웨이 코어 엣지 공용)을 Bun 소켓
// 없이 몬다. Bun 의미를 흉내 낸다: end()는 close 콜백을 그 안에서 동기 실행하고(allowHalfOpen:false, outboundLink.ts 재진입
// 불변식), 닫힌 뒤 write는 -1. writeCap으로 커널 송신 버퍼가 찬 상태(부분 쓰기·0바이트)를 만든다.

import { decodeAll } from "../../../helpers/wire";

export interface DecodedFrame {
  id: number;
  payload: unknown;
}

export class FakeClient<C> {
  readonly written: Buffer[] = [];
  readonly timeouts: number[] = [];
  ended = false;
  /** write 1회가 받는 최대 바이트 — Infinity = 전부, 0 = 커널 버퍼가 찬 상태. */
  writeCap = Number.POSITIVE_INFINITY;
  readonly sock: Bun.Socket<C>;

  constructor(
    private readonly edge: Bun.SocketHandler<C>,
    remoteAddress: string,
  ) {
    const self = this;
    const s = {
      data: undefined as C | undefined,
      remoteAddress,
      setNoDelay(): boolean {
        return true;
      },
      timeout(sec: number): void {
        self.timeouts.push(sec);
      },
      write(buf: Buffer): number {
        if (self.ended) return -1;
        const n = Math.min(buf.length, self.writeCap);
        if (n > 0) self.written.push(Buffer.from(buf.subarray(0, n)));
        return n;
      },
      end(): void {
        self.closeNow();
      },
    };
    this.sock = s as unknown as Bun.Socket<C>;
  }

  /** accept — edge.open. */
  open(): this {
    void this.edge.open?.(this.sock);
    return this;
  }

  /** 클라가 보낸 청크 — edge.data. */
  send(chunk: Uint8Array): void {
    void this.edge.data?.(this.sock, Buffer.from(chunk));
  }

  /** idle 타임아웃 — edge.timeout. */
  fireTimeout(): void {
    void this.edge.timeout?.(this.sock);
  }

  /** 커널 송신 버퍼 여유 — edge.drain. */
  drain(): void {
    void this.edge.drain?.(this.sock);
  }

  /** 클라가 끊었다 — Bun close 콜백. */
  peerClose(): void {
    this.closeNow();
  }

  get conn(): C {
    return (this.sock as unknown as { data: C }).data;
  }

  /** 받은 바이트 전부(연접). */
  bytes(): Buffer {
    return Buffer.concat(this.written);
  }

  /** 받은 클라 프레임(완성 프레임만 — 본문 디코드는 tests/helpers/wire.ts). */
  frames(): DecodedFrame[] {
    return decodeAll(this.bytes());
  }

  private closeNow(): void {
    if (this.ended) return;
    this.ended = true;
    void this.edge.close?.(this.sock, undefined);
  }
}

/** 수동 타이머 — createClientEdge setTimer/clearTimer 주입(pre-auth 데드라인 발화 시점을 테스트가 고른다). */
export function manualTimers() {
  const timers: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
  return {
    timers,
    setTimer(fn: () => void, ms: number): unknown {
      const t = { fn, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimer(h: unknown): void {
      (h as { cleared: boolean }).cleared = true;
    },
    /** 아직 해제되지 않은 타이머를 전부 발화. */
    fireAll(): void {
      for (const t of timers.splice(0)) if (!t.cleared) t.fn();
    },
  };
}
