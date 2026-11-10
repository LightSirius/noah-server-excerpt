// 성능 4단계 4.2a — SocketPipe(Bun.listen/Bun.connect) 루프백. 한 프로세스 안의 실제 소켓(임시 포트) — 멀티프로세스가
// 아니라 기본 bun test에 포함된다. 검증: 코덱 왕복·close 전파, 커널 버퍼를 넘는 대량 송신의 부분 쓰기·drain 이어쓰기와
// 순서·무결성, write가 반환한 바이트는 커널로 복사됐다(풀 버퍼 즉시 재사용 안전 — 4.0 교정 d의 전제), 대기 상한 →
// backpressure, heartbeat dead, 연결 실패, 배타 바인드, unix 소켓(Linux·macOS — 잔여 파일 정리·사용 중 감지).

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type IpcListener,
  type IpcPipeHandlers,
  type PipeCloseReason,
  type SocketPipe,
  connectIpc,
  listenIpc,
} from "../../../server/src/cluster/ipcPipe";
import {
  GatewayIpcWriter,
  WorldIpcWriter,
  createGatewaySideDecoder,
  createWorldSideDecoder,
} from "../../../server/src/cluster/ipcCodec";
import { type GatewayToWorldMsg, IPC_MSG, type WorldToGatewayMsg } from "../../../server/src/cluster/ipcSchema";
import type { IpcAddress } from "../../../server/src/config/ipcAddress";

const LOOPBACK: IpcAddress = { kind: "tcp", host: "127.0.0.1", port: 0 };

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups.splice(0).reverse()) {
    try {
      fn();
    } catch {
      // 이미 닫힘
    }
  }
});

interface Side {
  readonly chunks: Buffer[];
  readonly closed: Promise<PipeCloseReason>;
  readonly handlers: IpcPipeHandlers;
}

function side(onData?: (c: Buffer) => void): Side {
  let resolve: (r: PipeCloseReason) => void = () => {};
  const s: Side = {
    chunks: [],
    closed: new Promise((r) => {
      resolve = r;
    }),
    handlers: {
      data: (c) => (onData ? onData(c) : s.chunks.push(Buffer.from(c))),
      close: (reason) => resolve(reason),
    },
  };
  return s;
}

async function waitFor(pred: () => boolean, timeoutMs = 5000): Promise<void> {
  const until = performance.now() + timeoutMs;
  while (!pred()) {
    if (performance.now() > until) throw new Error("waitFor timed out");
    await Bun.sleep(1);
  }
}

/** 리스너 + 접속 1쌍. 월드 측 파이프는 accept 콜백에서 잡는다. */
async function connectedPair(
  addr: IpcAddress,
  worldSide: Side,
  gatewaySide: Side,
  opts: { world?: Parameters<typeof listenIpc>[2]; gateway?: Parameters<typeof connectIpc>[2] } = {},
): Promise<{ listener: IpcListener; world: () => SocketPipe; gateway: SocketPipe }> {
  let accepted: SocketPipe | null = null;
  const listener = await listenIpc(
    addr,
    (pipe) => {
      accepted = pipe;
      return worldSide.handlers;
    },
    opts.world ?? {},
  );
  cleanups.push(() => listener.stop(true));
  const gateway = await connectIpc(listener.address, gatewaySide.handlers, opts.gateway ?? {});
  cleanups.push(() => gateway.destroy());
  await waitFor(() => accepted !== null);
  const world = (): SocketPipe => accepted!;
  cleanups.push(() => world().destroy());
  return { listener, world, gateway };
}

/**
 * 월드가 1 MiB 봉투 64개를 한 동기 구간에 쓴다(상대는 같은 이벤트 루프라 그동안 못 읽음) — 커널 버퍼가 차 부분 쓰기,
 * 이후 drain마다 이어쓰기. 수신 측은 순서·길이·CRC로 무결성을 확인하고, 송신 측은 모든 버퍼의 release를 확인한다.
 */
async function bulkTransfer(addr: IpcAddress): Promise<void> {
  const ENVELOPES = 64;
  const SIZE = 1024 * 1024 - 64;
  const crcs: number[] = [];
  let received = 0;
  let bad = 0;
  const dec = createGatewaySideDecoder((m) => {
    if (m.type !== IPC_MSG.CONN_DELIVER) return;
    for (const d of m.deliveries) {
      if (d.localId !== received || d.bytes.length !== SIZE || Bun.hash.crc32(d.bytes) !== crcs[received]) bad++;
      received++;
    }
  });
  const gs = side((c) => dec.push(c));
  const { world } = await connectedPair(addr, side(), gs);
  const w = new WorldIpcWriter({ batchSplitBytes: SIZE + 8 });
  w.helloAck({ worldIncarnation: 1, connCap: 1 });
  w.flushTo(world());
  let released = 0;
  const sink = {
    write: (b: Buffer, r?: () => void) =>
      world().write(b, () => {
        released++;
        r?.();
      }),
  };
  for (let i = 0; i < ENVELOPES; i++) {
    const payload = Buffer.alloc(SIZE, i & 0xff);
    payload.writeUInt32LE((i * 2654435761) >>> 0, (i * 4099) % (SIZE - 4));
    crcs.push(Bun.hash.crc32(payload));
    w.deliver(i, payload);
    expect(w.flushTo(sink)).toBe(true);
  }
  expect(world().stats.partialWrites).toBeGreaterThan(0);
  await waitFor(() => received === ENVELOPES, 30_000);
  expect(bad).toBe(0);
  await waitFor(() => world().pendingBytes === 0);
  expect(released).toBe(ENVELOPES);
  expect(world().stats.drains).toBeGreaterThan(0);
  expect(world().closed).toBe(false);
}

describe("SocketPipe — tcp 루프백", () => {
  test("HELLO → HELLO_ACK·DELIVER 왕복, 게이트웨이 end → 월드는 peer close", async () => {
    const gwMsgs: WorldToGatewayMsg[] = [];
    const worldMsgs: GatewayToWorldMsg[] = [];
    const worldDec = createWorldSideDecoder((m) => worldMsgs.push(m));
    const gwDec = createGatewaySideDecoder((m) => gwMsgs.push(JSON.parse(JSON.stringify(m)) as WorldToGatewayMsg));
    const ws = side((c) => worldDec.push(c));
    const gs = side((c) => gwDec.push(c));
    const { listener, world, gateway } = await connectedPair(LOOPBACK, ws, gs);
    expect(listener.address.kind).toBe("tcp");
    expect((listener.address as { port: number }).port).toBeGreaterThan(0);

    const gw = new GatewayIpcWriter();
    gw.hello({ gatewayId: 2, incarnation: 99, pid: process.pid });
    gw.flushTo(gateway);
    await waitFor(() => worldMsgs.length === 1);
    expect(worldMsgs[0]).toMatchObject({ type: IPC_MSG.HELLO, gatewayId: 2, incarnation: 99 });

    const ww = new WorldIpcWriter();
    ww.helloAck({ worldIncarnation: 5, connCap: 2000 });
    ww.deliver(1, Buffer.from("frame-1"));
    ww.deliver(2, Buffer.from("frame-2"));
    ww.flushTo(world());
    await waitFor(() => gwMsgs.length === 2);
    expect(gwMsgs[1]).toEqual({
      type: IPC_MSG.CONN_DELIVER,
      deliveries: [
        { localId: 1, bytes: JSON.parse(JSON.stringify(Buffer.from("frame-1"))) },
        { localId: 2, bytes: JSON.parse(JSON.stringify(Buffer.from("frame-2"))) },
      ],
    });

    gateway.end();
    expect(await gs.closed).toBe("local");
    expect(await ws.closed).toBe("peer");
  });

  test("커널 버퍼를 넘는 대량 송신(64 MiB) — 부분 쓰기·drain 이어쓰기, 순서·무결성, 전 버퍼 release", async () => {
    await bulkTransfer(LOOPBACK);
  });

  test("write가 반환한 바이트는 커널로 복사됐다 — 직후 버퍼를 덮어써도 수신은 원본(풀 재사용 안전)", async () => {
    const gs = side();
    const { world } = await connectedPair(LOOPBACK, side(), gs);
    const buf = Buffer.alloc(32 * 1024, 0x11);
    let released = false;
    expect(
      world().write(buf, () => {
        released = true;
      }),
    ).toBe(true);
    expect(released).toBe(true); // 전량 수락 = 즉시 release
    buf.fill(0x99);
    await waitFor(() => gs.chunks.reduce((n, c) => n + c.length, 0) === buf.length);
    expect(Buffer.concat(gs.chunks).every((b) => b === 0x11)).toBe(true);
  });

  test("상대가 읽지 않으면 대기 상한에서 backpressure로 닫고, 상대도 close를 본다", async () => {
    const ws = side();
    const gs = side();
    // 게이트웨이는 운영과 같이 heartbeat를 켠다. macOS(kqueue, bun 1.3.13)는 일시정지 중 받은 RST가 직후(~20 ms 안)
    // resume이면 close 이벤트를 잃는다(실측 — 200 ms 뒤 resume은 정상). 운영 코드는 pause를 쓰지 않고, 죽은 상대는
    // heartbeat write(-1 → peer)가 잡는다 — 이 시험은 그 운영 경로로 "상대도 close를 본다"를 고정한다.
    const { world, gateway } = await connectedPair(LOOPBACK, ws, gs, {
      world: { maxPendingBytes: 8 * 1024 * 1024 },
      gateway: { heartbeatMs: 50, deadMs: 10_000 },
    });
    // 게이트웨이 heartbeat 핸들러처럼 박자마다 작은 프레임(PING 모사)을 쓴다 — 리셋된 소켓이면 write -1 → peer.
    gs.handlers.heartbeat = () => {
      gateway.write(Buffer.alloc(8));
    };
    gateway.pauseReceiving();
    let ok = true;
    for (let i = 0; i < 256 && ok; i++) ok = world().write(Buffer.alloc(1024 * 1024, i));
    expect(ok).toBe(false);
    expect(world().closeReason).toBe("backpressure");
    expect(await ws.closed).toBe("backpressure");
    gateway.resumeReceiving();
    expect(["peer", "error"]).toContain(await gs.closed);
  });

  test("heartbeat: 상대가 아무것도 보내지 않으면 deadMs 뒤 dead, 상대는 peer close", async () => {
    const ws = side();
    const gs = side();
    let beats = 0;
    gs.handlers.heartbeat = () => beats++;
    const { gateway } = await connectedPair(LOOPBACK, ws, gs, { gateway: { heartbeatMs: 20, deadMs: 80 } });
    const t0 = performance.now();
    expect(await gs.closed).toBe("dead");
    expect(performance.now() - t0).toBeGreaterThanOrEqual(60);
    expect(beats).toBeGreaterThanOrEqual(1);
    expect(gateway.closeReason).toBe("dead");
    expect(["peer", "error"]).toContain(await ws.closed);
  });

  test("닫힌 포트 접속은 reject", async () => {
    const probe = await listenIpc(LOOPBACK, () => side().handlers);
    const addr = probe.address;
    probe.stop(true);
    await expect(connectIpc(addr, side().handlers)).rejects.toThrow();
  });

  test("tcp 리스너는 배타 바인드 — 같은 포트 두 번째 listen은 실패(월드 이중 기동 차단)", async () => {
    const first = await listenIpc(LOOPBACK, () => side().handlers);
    cleanups.push(() => first.stop(true));
    await expect(listenIpc(first.address, () => side().handlers)).rejects.toThrow();
  });
});

describe.skipIf(process.platform === "win32")("SocketPipe — unix 소켓", () => {
  function tempSocketPath(): string {
    const dir = mkdtempSync(join(tmpdir(), "mmorpg-ipc-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return join(dir, "world.sock");
  }

  test("왕복 + stop이 소켓 파일을 지운다", async () => {
    const path = tempSocketPath();
    const gs = side();
    const { listener, world } = await connectedPair({ kind: "unix", path }, side(), gs);
    expect(existsSync(path)).toBe(true);
    world().write(Buffer.from("over unix"));
    await waitFor(() => gs.chunks.length > 0);
    expect(Buffer.concat(gs.chunks).toString()).toBe("over unix");
    listener.stop(true);
    expect(existsSync(path)).toBe(false);
  });

  test("소켓 파일은 소유자 전용(0600) — 다른 로컬 계정은 connect할 수 없다(보안 리뷰: TCP loopback엔 ACL이 없다)", async () => {
    const path = tempSocketPath();
    const { listener } = await connectedPair({ kind: "unix", path }, side(), side());
    expect(statSync(path).mode & 0o777).toBe(0o600);
    listener.stop(true);
  });

  test("대량 송신(64 MiB) — unix 기본 송신 버퍼(≈212 KB)에서 잦은 부분 쓰기·drain", async () => {
    await bulkTransfer({ kind: "unix", path: tempSocketPath() });
  });

  test("살아 있는 리스너가 있으면 거부, 잔여 소켓 파일(SIGKILL된 월드)은 지우고 bind", async () => {
    const path = tempSocketPath();
    const first = await listenIpc({ kind: "unix", path }, () => side().handlers);
    await expect(listenIpc({ kind: "unix", path }, () => side().handlers)).rejects.toThrow(/in use/);
    first.stop(true);
    // 크래시 모사: Bun은 stop에서 소켓 파일을 지우므로 자식 프로세스의 리스너를 SIGKILL해 파일만 남긴다.
    const child = Bun.spawn(
      [process.execPath, "-e", `Bun.listen({ unix: ${JSON.stringify(path)}, socket: { data() {} } }); console.log("L"); setInterval(() => {}, 1000);`],
      { stdout: "pipe", stderr: "ignore" },
    );
    cleanups.push(() => child.kill("SIGKILL"));
    await child.stdout.getReader().read();
    child.kill("SIGKILL");
    await child.exited;
    expect(existsSync(path)).toBe(true);
    const second = await listenIpc({ kind: "unix", path }, () => side().handlers);
    cleanups.push(() => second.stop(true));
    const gs = side();
    const pipe = await connectIpc({ kind: "unix", path }, gs.handlers);
    cleanups.push(() => pipe.destroy());
    expect(pipe.closed).toBe(false);
  });

  test("경로에 소켓이 아닌 파일이 있으면 지우지 않고 거부", async () => {
    const path = tempSocketPath();
    writeFileSync(path, "not a socket");
    await expect(listenIpc({ kind: "unix", path }, () => side().handlers)).rejects.toThrow(/not a socket/);
    expect(existsSync(path)).toBe(true);
  });
});
