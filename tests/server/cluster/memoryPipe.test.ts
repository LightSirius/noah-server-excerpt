// 성능 4단계 4.2a — IpcPipe 공통 의미(대기열·drain·백프레셔·우아한 종료·heartbeat·close 1회)를 MemoryPipe로 검증한다.
// MemoryPipe는 in-process 토폴로지(4.2b)와 장애 주입(지연·시드 고정 무작위 청크 분할·N바이트 후 끊김/블랙홀·전송 창·수신
// 정지)용 — 실제 소켓처럼 전달·drain·상대 close는 항상 비동기다.

import { describe, expect, test } from "bun:test";
import {
  type IpcPipe,
  type IpcPipeHandlers,
  type PipeCloseReason,
  type PipeTimers,
  createMemoryPipePair,
} from "../../../server/src/cluster/ipcPipe";
import { GatewayIpcWriter, WorldIpcWriter, createWorldSideDecoder } from "../../../server/src/cluster/ipcCodec";
import { type GatewayToWorldMsg, IPC_MSG } from "../../../server/src/cluster/ipcSchema";

interface Recorder {
  readonly chunks: Buffer[];
  readonly closes: Array<{ reason: PipeCloseReason; error: Error | undefined }>;
  readonly closed: Promise<PipeCloseReason>;
  readonly handlers: IpcPipeHandlers;
  bytes(): Buffer;
  drains: number;
  heartbeats: number;
}

function recorder(extra: Partial<IpcPipeHandlers> = {}): Recorder {
  let resolveClosed: (r: PipeCloseReason) => void = () => {};
  const rec: Recorder = {
    chunks: [],
    closes: [],
    closed: new Promise<PipeCloseReason>((r) => {
      resolveClosed = r;
    }),
    handlers: {
      data: (c) => {
        rec.chunks.push(Buffer.from(c));
        extra.data?.(c);
      },
      close: (reason, error) => {
        rec.closes.push({ reason, error });
        resolveClosed(reason);
      },
      drain: () => {
        rec.drains++;
      },
      heartbeat: () => {
        rec.heartbeats++;
        extra.heartbeat?.();
      },
    },
    bytes: () => Buffer.concat(rec.chunks),
    drains: 0,
    heartbeats: 0,
  };
  return rec;
}

/** 수동 타이머 — liveness·end 타임아웃을 벽시계 대기 없이 발화. */
class ManualTimers implements PipeTimers {
  private seq = 0;
  readonly timeouts = new Map<number, () => void>();
  readonly intervals = new Map<number, { fn: () => void; ms: number }>();
  setTimeout(fn: () => void, _ms: number): unknown {
    const id = ++this.seq;
    this.timeouts.set(id, fn);
    return id;
  }
  clearTimeout(h: unknown): void {
    this.timeouts.delete(h as number);
  }
  setInterval(fn: () => void, ms: number): unknown {
    const id = ++this.seq;
    this.intervals.set(id, { fn, ms });
    return id;
  }
  clearInterval(h: unknown): void {
    this.intervals.delete(h as number);
  }
  fireTimeouts(): void {
    for (const [id, fn] of [...this.timeouts]) {
      this.timeouts.delete(id);
      fn();
    }
  }
  tickIntervals(): void {
    for (const t of [...this.intervals.values()]) t.fn();
  }
}

async function waitFor(pred: () => boolean, timeoutMs = 2000): Promise<void> {
  const until = performance.now() + timeoutMs;
  while (!pred()) {
    if (performance.now() > until) throw new Error("waitFor timed out");
    await Bun.sleep(1);
  }
}

function pattern(n: number, seed: number): Buffer {
  const b = Buffer.allocUnsafe(n);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < n; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    b[i] = x & 0xff;
  }
  return b;
}

describe("MemoryPipe — 전달", () => {
  test("코덱 왕복: writer → 파이프 → 디코더, 수신은 쓰기 호출 스택 밖(비동기)", async () => {
    const [gw, world] = createMemoryPipePair();
    const msgs: GatewayToWorldMsg[] = [];
    const dec = createWorldSideDecoder((m) => msgs.push(m));
    world.attach({ data: (c) => dec.push(c), close: () => {} });
    gw.attach(recorder().handlers);
    const w = new GatewayIpcWriter();
    w.hello({ gatewayId: 1, incarnation: 2, pid: 3 });
    w.connOpen(7, "198.51.100.1");
    w.frame(7, 0x0001, Buffer.from("{}"));
    expect(w.flushTo(gw)).toBe(true);
    expect(msgs).toHaveLength(0);
    await waitFor(() => msgs.length === 3);
    expect(msgs.map((m) => m.type)).toEqual([IPC_MSG.HELLO, IPC_MSG.CONN_OPEN, IPC_MSG.CONN_FRAMES]);
    expect(gw.stats.txBytes).toBe(world.stats.rxBytes);
  });

  test("양방향 독립 — 월드 → 게이트웨이도 같은 파이프 쌍", async () => {
    const [gw, world] = createMemoryPipePair();
    const g = recorder();
    gw.attach(g.handlers);
    world.attach(recorder().handlers);
    const w = new WorldIpcWriter();
    w.helloAck({ worldIncarnation: 1, connCap: 1 });
    w.flushTo(world);
    await waitFor(() => g.chunks.length > 0);
    expect(g.bytes()[4]).toBe(IPC_MSG.HELLO_ACK);
  });

  test("시드 고정 무작위 청크 분할 — 같은 시드 = 같은 청크 열, 재조립 바이트 동일", async () => {
    const data = pattern(50_000, 11);
    const sizes: number[][] = [];
    for (let run = 0; run < 2; run++) {
      const [a, b] = createMemoryPipePair({ a: { faults: { splitSeed: 1234, maxChunkBytes: 700 } } });
      const rb = recorder();
      b.attach(rb.handlers);
      a.attach(recorder().handlers);
      a.write(Buffer.from(data.subarray(0, 20_000)));
      a.write(Buffer.from(data.subarray(20_000)));
      await waitFor(() => rb.bytes().length === data.length);
      expect(rb.bytes()).toEqual(data);
      expect(rb.chunks.length).toBeGreaterThan(50);
      expect(Math.max(...rb.chunks.map((c) => c.length))).toBeLessThanOrEqual(700);
      sizes.push(rb.chunks.map((c) => c.length));
    }
    expect(sizes[0]).toEqual(sizes[1]!);
  });

  test("지연 — delayMs 전에는 전달하지 않는다", async () => {
    const [a, b] = createMemoryPipePair({ a: { faults: { delayMs: 40 } } });
    let deliveredAt = -1;
    const rb = recorder({
      data: () => {
        deliveredAt = performance.now();
      },
    });
    b.attach(rb.handlers);
    a.attach(recorder().handlers);
    const t0 = performance.now();
    a.write(Buffer.from("late"));
    await waitFor(() => rb.chunks.length === 1);
    expect(deliveredAt - t0).toBeGreaterThanOrEqual(35);
  });

  test("attach 전에 도착한 바이트는 attach 뒤 전달", async () => {
    const [a, b] = createMemoryPipePair();
    a.attach(recorder().handlers);
    a.write(Buffer.from("early"));
    await Bun.sleep(5);
    const rb = recorder();
    b.attach(rb.handlers);
    await waitFor(() => rb.chunks.length === 1);
    expect(rb.bytes().toString()).toBe("early");
  });

  test("attach는 1회만", () => {
    const [a] = createMemoryPipePair();
    a.attach(recorder().handlers);
    expect(() => a.attach(recorder().handlers)).toThrow();
  });
});

describe("MemoryPipe — 부분 쓰기·대기열·drain(전송 창)", () => {
  test("창보다 큰 쓰기는 부분 수락 → 꼬리 대기 → 상대가 읽으면 drain으로 이어 쓴다, 순서·release 1회 보존", async () => {
    const [a, b] = createMemoryPipePair({ a: { faults: { windowBytes: 4096 } } });
    const ra = recorder();
    const rb = recorder();
    a.attach(ra.handlers);
    b.attach(rb.handlers);
    const released: number[] = [];
    const parts = [pattern(10_000, 1), pattern(3_000, 2), pattern(9_000, 3)];
    parts.forEach((p, i) => expect(a.write(p, () => released.push(i))).toBe(true));
    expect(a.stats.partialWrites).toBeGreaterThan(0);
    expect(a.pendingBytes).toBeGreaterThan(0);
    expect(released).toEqual([]); // 첫 버퍼도 아직 다 쓰지 못했다
    await waitFor(() => rb.bytes().length === 22_000);
    expect(rb.bytes()).toEqual(Buffer.concat(parts));
    await waitFor(() => a.pendingBytes === 0);
    expect(released).toEqual([0, 1, 2]);
    expect(a.stats.drains).toBeGreaterThan(0);
    expect(ra.drains).toBeGreaterThan(0); // 대기열이 빈 뒤 drain 통지
    expect(a.stats.peakPendingBytes).toBeGreaterThan(0);
  });

  test("대기 중 새 쓰기는 직접 쓰지 않고 꼬리 뒤에 붙는다(프레임 경계 보존)", async () => {
    const [a, b] = createMemoryPipePair({ a: { faults: { windowBytes: 100 } } });
    const rb = recorder();
    a.attach(recorder().handlers);
    b.attach(rb.handlers);
    a.write(Buffer.alloc(300, 1));
    a.write(Buffer.alloc(10, 2)); // 창에 자리가 있어도 대기열 뒤로
    await waitFor(() => rb.bytes().length === 310);
    expect(rb.bytes().subarray(300)).toEqual(Buffer.alloc(10, 2));
  });

  test("대기 상한 초과 → backpressure로 닫힘: write false, 대기 버퍼 release 미호출, close 1회 비동기, 상대는 peer", async () => {
    const [a, b] = createMemoryPipePair({ a: { maxPendingBytes: 64 * 1024, faults: { windowBytes: 16 * 1024 } } });
    const ra = recorder();
    const rb = recorder();
    a.attach(ra.handlers);
    b.attach(rb.handlers);
    b.pauseReceiving(); // 상대 프로세스가 읽지 않는다(SIGSTOP·느린 소비자)
    let released = 0;
    let accepted = 0;
    for (let i = 0; i < 20; i++) {
      if (!a.write(Buffer.alloc(8 * 1024, i), () => released++)) break;
      accepted++;
    }
    expect(a.closed).toBe(true);
    expect(a.closeReason).toBe("backpressure");
    expect(accepted).toBeLessThan(20);
    expect(a.pendingBytes).toBe(0);
    expect(ra.closes).toHaveLength(0); // 아직 같은 호출 스택
    expect(a.write(Buffer.from("x"))).toBe(false);
    expect(await ra.closed).toBe("backpressure");
    expect(released).toBe(2); // 창(16 KiB)에 다 들어간 첫 2개만
    b.resumeReceiving();
    expect(await rb.closed).toBe("peer");
    expect(ra.closes).toHaveLength(1);
  });
});

describe("MemoryPipe — 종료", () => {
  test("end(): 대기열을 비운 뒤 닫는다 — 상대는 모든 바이트 뒤 peer close, end 중 write 거절", async () => {
    const [a, b] = createMemoryPipePair({ a: { faults: { windowBytes: 1000 } } });
    const ra = recorder();
    const rb = recorder();
    a.attach(ra.handlers);
    b.attach(rb.handlers);
    a.write(pattern(5000, 9));
    a.end();
    expect(a.closed).toBe(false); // 대기열 비우는 중
    expect(a.write(Buffer.from("late"))).toBe(false);
    expect(await ra.closed).toBe("local");
    expect(await rb.closed).toBe("peer");
    expect(rb.bytes()).toEqual(pattern(5000, 9));
  });

  test("end() 타임아웃: 상대가 끝내 읽지 않으면 endTimeoutMs 뒤 강제 종료(local)", async () => {
    const timers = new ManualTimers();
    const [a, b] = createMemoryPipePair({ a: { timers, endTimeoutMs: 1234, faults: { windowBytes: 100 } } });
    const ra = recorder();
    a.attach(ra.handlers);
    b.attach(recorder().handlers);
    b.pauseReceiving();
    a.write(Buffer.alloc(1000));
    a.end();
    expect(timers.timeouts.size).toBe(1);
    timers.fireTimeouts();
    expect(a.closed).toBe(true);
    expect(await ra.closed).toBe("local");
  });

  test("destroy(): 즉시 닫힘 — 상대의 미전달 바이트는 버려지고 peer close, 이중 destroy·end 무시, close 1회", async () => {
    const [a, b] = createMemoryPipePair({ a: { faults: { delayMs: 30 } } });
    const ra = recorder();
    const rb = recorder();
    a.attach(ra.handlers);
    b.attach(rb.handlers);
    a.write(Buffer.from("in flight"));
    a.destroy();
    a.destroy("dead");
    a.end();
    expect(a.closeReason).toBe("local");
    expect(ra.closes).toHaveLength(0);
    expect(await rb.closed).toBe("peer");
    expect(rb.chunks).toHaveLength(0);
    await Bun.sleep(40);
    expect(ra.closes).toEqual([{ reason: "local", error: undefined }]);
  });

  test("상대가 닫힌 뒤의 쓰기는 버려지고(창을 채우지 않는다) 곧 peer close", async () => {
    const [a, b] = createMemoryPipePair({ a: { faults: { windowBytes: 1024 } } });
    const ra = recorder();
    a.attach(ra.handlers);
    b.attach(recorder().handlers);
    b.destroy();
    for (let i = 0; i < 8; i++) expect(a.write(Buffer.alloc(512))).toBe(true);
    expect(a.pendingBytes).toBe(0);
    expect(await ra.closed).toBe("peer");
  });

  test("data 핸들러 예외 → 파이프를 error로 닫고 예외를 close에 전달", async () => {
    const [a, b] = createMemoryPipePair();
    a.attach(recorder().handlers);
    const boom = new Error("handler bug");
    const rb = recorder({
      data: () => {
        throw boom;
      },
    });
    b.attach(rb.handlers);
    a.write(Buffer.from("x"));
    expect(await rb.closed).toBe("error");
    expect(rb.closes[0]!.error).toBe(boom);
  });

  test("attach 전에 닫힌 파이프도 attach하면 close를 1회 통지", async () => {
    const [a, b] = createMemoryPipePair();
    a.attach(recorder().handlers);
    a.destroy();
    await Bun.sleep(5);
    expect(b.closed).toBe(true);
    const rb = recorder();
    b.attach(rb.handlers);
    expect(await rb.closed).toBe("peer");
  });
});

describe("MemoryPipe — 장애 주입: N바이트 후 끊김·블랙홀", () => {
  test("dropAfterBytes(close): 수신 측은 정확히 N바이트 뒤 peer close, 송신 측도 닫힌다", async () => {
    const [a, b] = createMemoryPipePair({ a: { faults: { dropAfterBytes: 1500 } } });
    const ra = recorder();
    const rb = recorder();
    a.attach(ra.handlers);
    b.attach(rb.handlers);
    a.write(pattern(1000, 5));
    a.write(pattern(1000, 6));
    expect(await rb.closed).toBe("peer");
    expect(rb.bytes()).toEqual(Buffer.concat([pattern(1000, 5), pattern(1000, 6)]).subarray(0, 1500));
    expect(await ra.closed).toBe("peer");
  });

  test("dropAfterBytes(blackhole) + heartbeat: 수신이 끊긴 쪽은 deadMs 뒤 dead로 닫힌다", async () => {
    const timers = new ManualTimers();
    let now = 0;
    const [a, b] = createMemoryPipePair({
      a: { faults: { dropAfterBytes: 10, dropMode: "blackhole" } },
      b: { timers, now: () => now, heartbeatMs: 100, deadMs: 300 },
    });
    a.attach(recorder().handlers);
    const rb = recorder();
    b.attach(rb.handlers);
    expect(timers.intervals.size).toBe(1);
    a.write(Buffer.alloc(10, 1)); // 마지막으로 도달하는 바이트
    await waitFor(() => rb.chunks.length === 1);
    a.write(Buffer.alloc(10, 2)); // 블랙홀
    expect(a.closed).toBe(false);
    for (let i = 0; i < 2; i++) {
      now += 100;
      timers.tickIntervals();
    }
    expect(b.closed).toBe(false);
    expect(rb.heartbeats).toBe(2);
    now += 100;
    timers.tickIntervals();
    expect(b.closeReason).toBe("dead");
    expect(timers.intervals.size).toBe(0);
    expect(await rb.closed).toBe("dead");
  });
});

describe("IpcPipe — heartbeat·liveness", () => {
  function livePair(timers: ManualTimers, clock: { now: number }): { a: IpcPipe; b: IpcPipe; rb: Recorder } {
    const [a, b] = createMemoryPipePair({ b: { timers, now: () => clock.now, heartbeatMs: 100, deadMs: 300 } });
    a.attach(recorder().handlers);
    const rb = recorder();
    b.attach(rb.handlers);
    return { a, b, rb };
  }

  test("수신이 이어지면 dead가 아니다 — 박자마다 heartbeat 핸들러", async () => {
    const timers = new ManualTimers();
    const clock = { now: 0 };
    const { a, b, rb } = livePair(timers, clock);
    for (let i = 0; i < 10; i++) {
      a.write(Buffer.from([i]));
      await waitFor(() => rb.chunks.length === i + 1);
      clock.now += 100;
      timers.tickIntervals();
    }
    expect(b.closed).toBe(false);
    expect(rb.heartbeats).toBe(10);
  });

  test("자기 정지(박자 간격 > 2×heartbeat) 뒤에는 한 박자 유예 — 밀린 수신을 읽기 전에 dead로 오판하지 않는다", () => {
    const timers = new ManualTimers();
    const clock = { now: 0 };
    const { b } = livePair(timers, clock);
    clock.now += 100;
    timers.tickIntervals();
    clock.now += 2000; // 이벤트 루프가 2초 멈췄다
    timers.tickIntervals();
    expect(b.closed).toBe(false);
    clock.now += 100;
    timers.tickIntervals();
    expect(b.closeReason).toBe("dead");
  });

  test("heartbeat 옵션 검증 — deadMs < 2×heartbeatMs 거부", () => {
    expect(() => createMemoryPipePair({ a: { heartbeatMs: 100, deadMs: 150 } })).toThrow(RangeError);
  });
});
