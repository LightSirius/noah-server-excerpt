// 성능 4단계 4.2a — 월드 ↔ 게이트웨이 IPC 코덱(cluster/ipcSchema·ipcCodec).
//
// 봉투 `u32 len LE | u8 type | payload`(len = type 1 + payload). 검증 축:
//   - 메시지 전 종류 왕복(G→W 6종·W→G 7종) — 배치 레코드(CONN_FRAMES·CONN_DELIVER) 포함. HELLO token·HELLO_NACK(종단)·
//     핸드셰이크 전 봉투 상한은 ipcHandshake.test.ts
//   - BatchWriter 봉투 패칭: 같은 종류 레코드는 열린 봉투에 이어 붙고, 비배치 메시지가 봉투를 닫는다(발행 순서 보존),
//     분할 임계를 넘으면 새 봉투(수신 링 상한·게이트웨이 조기 팬아웃 — 4.0 교정 c)
//   - 스트리밍 디코드: 무작위 분할(1바이트 포함)에도 같은 메시지 열
//   - 가드: 봉투 상한(헤더만 와도 즉시)·빈 봉투·미지/예약/역방향 type·레이아웃 위반·enum 범위, 핸드셰이크 순서·버전
//   - 버퍼 소유권: 큰 flush는 버퍼를 넘기고 release 후 재사용(복사 없음 — 4.0 교정 d), 작은 flush는 복사

import { describe, expect, test } from "bun:test";
import {
  BYE_REASON,
  CONN_CLOSED_REASON,
  type GatewayToWorldMsg,
  IPC_MSG,
  IPC_VERSION,
  type WorldToGatewayMsg,
} from "../../../server/src/cluster/ipcSchema";
import {
  GatewayIpcWriter,
  type IpcByteSink,
  type IpcDecoder,
  IpcProtocolError,
  WorldIpcWriter,
  createGatewaySideDecoder,
  createWorldSideDecoder,
} from "../../../server/src/cluster/ipcCodec";
import { SeededRng } from "../../../server/src/sim/deterministic";

interface Written {
  buf: Buffer;
  release: (() => void) | undefined;
}

/** flushTo 대상 — 넘겨받은 버퍼를 그대로 보관(소유권 검증용). */
function captureSink(): IpcByteSink & { writes: Written[]; bytes(): Buffer } {
  const writes: Written[] = [];
  return {
    writes,
    write(buf: Buffer, release?: () => void): boolean {
      writes.push({ buf, release });
      return true;
    },
    bytes(): Buffer {
      return Buffer.concat(writes.map((w) => w.buf));
    },
  };
}

function flushed(w: GatewayIpcWriter | WorldIpcWriter): Buffer {
  const sink = captureSink();
  w.flushTo(sink);
  return sink.bytes();
}

function rawEnvelope(type: number, payload: Buffer | number[]): Buffer {
  const p = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const out = Buffer.alloc(5 + p.length);
  out.writeUInt32LE(1 + p.length, 0);
  out[4] = type;
  p.copy(out, 5);
  return out;
}

function helloBytes(): Buffer {
  const w = new GatewayIpcWriter();
  w.hello({ gatewayId: 3, incarnation: 0xdeadbeef, pid: 4242 });
  return flushed(w);
}

function helloAckBytes(): Buffer {
  const w = new WorldIpcWriter();
  w.helloAck({ worldIncarnation: 7, connCap: 5000 });
  return flushed(w);
}

/** 디코더가 내보낸 메시지를 깊은 복사로 모은다(본문 뷰는 콜백 동안만 유효). */
function cloneMsg<M>(m: M): M {
  return JSON.parse(JSON.stringify(m)) as M;
}

function worldSide(): { dec: IpcDecoder; msgs: GatewayToWorldMsg[] } {
  const msgs: GatewayToWorldMsg[] = [];
  const dec = createWorldSideDecoder((m) => msgs.push(cloneMsg(m)));
  return { dec, msgs };
}

function gatewaySide(): { dec: IpcDecoder; msgs: WorldToGatewayMsg[] } {
  const msgs: WorldToGatewayMsg[] = [];
  const dec = createGatewaySideDecoder((m) => msgs.push(cloneMsg(m)));
  return { dec, msgs };
}

/** 핸드셰이크를 통과시킨 디코더에 bytes를 넣는 함수(가드 검증용). */
function pushPastHandshake(side: "world" | "gateway", bytes: Buffer): () => void {
  return () => {
    const { dec } = side === "world" ? worldSide() : gatewaySide();
    dec.push(side === "world" ? helloBytes() : helloAckBytes());
    dec.push(bytes);
  };
}

function protocolErrorKind(fn: () => void): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof IpcProtocolError) return err.kind;
    throw err;
  }
  throw new Error("expected IpcProtocolError");
}

const bufJson = (s: string) => JSON.parse(JSON.stringify(Buffer.from(s)));

describe("IPC 코덱 — 게이트웨이 → 월드 메시지 왕복", () => {
  test("HELLO·PING·BYE·CONN_OPEN·CONN_FRAMES·CONN_CLOSED 전 종류가 같은 값으로 돌아온다", () => {
    const w = new GatewayIpcWriter();
    w.hello({ gatewayId: 65535, incarnation: 0xffffffff, pid: 123456, token: "s3cret-token-value" });
    w.ping(0xfffffffe);
    w.connOpen(1, "203.0.113.7");
    w.connOpen(2, "2001:db8::1");
    w.frame(1, 0x0001, Buffer.from('{"v":2}'));
    w.frame(2, 0x0100, Buffer.alloc(0));
    w.frame(1, 0xffff, Buffer.from("x"));
    for (const reason of Object.values(CONN_CLOSED_REASON)) w.connClosed(100 + reason, reason);
    w.bye(BYE_REASON.Restart);

    const { dec, msgs } = worldSide();
    dec.push(flushed(w));

    expect(msgs[0]).toEqual({
      type: IPC_MSG.HELLO,
      ipcVer: IPC_VERSION,
      gatewayId: 65535,
      incarnation: 0xffffffff,
      pid: 123456,
      token: bufJson("s3cret-token-value"),
    });
    expect(msgs[1]).toEqual({ type: IPC_MSG.PING, seq: 0xfffffffe });
    expect(msgs[2]).toEqual({ type: IPC_MSG.CONN_OPEN, localId: 1, addr: "203.0.113.7" });
    expect(msgs[3]).toEqual({ type: IPC_MSG.CONN_OPEN, localId: 2, addr: "2001:db8::1" });
    expect(msgs[4]).toEqual({
      type: IPC_MSG.CONN_FRAMES,
      frames: [
        { localId: 1, packetId: 0x0001, body: bufJson('{"v":2}') },
        { localId: 2, packetId: 0x0100, body: bufJson("") },
        { localId: 1, packetId: 0xffff, body: bufJson("x") },
      ],
    });
    const closed = Object.values(CONN_CLOSED_REASON).map((reason) => ({ type: IPC_MSG.CONN_CLOSED, localId: 100 + reason, reason }));
    expect(msgs.slice(5, 5 + closed.length)).toEqual(closed);
    expect(msgs[5 + closed.length]).toEqual({ type: IPC_MSG.BYE, reason: BYE_REASON.Restart });
    expect(msgs).toHaveLength(6 + closed.length);
  });

  test("본문 뷰는 원본 바이트 그대로(바이너리 포함)", () => {
    const body = Buffer.from([0, 1, 2, 0xfe, 0xff, 0x80]);
    const w = new GatewayIpcWriter();
    w.hello({ gatewayId: 0, incarnation: 1, pid: 1 });
    w.frame(9, 0x0101, body);
    const seen: Buffer[] = [];
    const dec = createWorldSideDecoder((m) => {
      if (m.type === IPC_MSG.CONN_FRAMES) for (const f of m.frames) seen.push(Buffer.from(f.body));
    });
    dec.push(flushed(w));
    expect(seen).toEqual([body]);
  });
});

describe("IPC 코덱 — 월드 → 게이트웨이 메시지 왕복", () => {
  test("HELLO_ACK·PONG·SHUTDOWN·CONN_DELIVER·CONN_STATE·CONN_CLOSE·CONN_ACCEPTED 전 종류", () => {
    const w = new WorldIpcWriter();
    w.helloAck({ worldIncarnation: 0xabcdef01, connCap: 100_000 });
    w.pong(77);
    w.connAccepted(5, 0xffffffff);
    w.connState(5, "HELLO_RECV");
    w.deliver(5, Buffer.from("frame-a"));
    w.deliver(6, Buffer.from("frame-b"));
    for (const s of ["ANON", "AUTHENTICATED", "IN_WORLD", "REJECT"] as const) w.connState(6, s);
    w.connClose(6);
    w.shutdown(6);

    const { dec, msgs } = gatewaySide();
    dec.push(flushed(w));

    expect(msgs).toEqual([
      { type: IPC_MSG.HELLO_ACK, ipcVer: IPC_VERSION, worldIncarnation: 0xabcdef01, connCap: 100_000 },
      { type: IPC_MSG.PONG, seq: 77 },
      { type: IPC_MSG.CONN_ACCEPTED, localId: 5, worldConnId: 0xffffffff },
      { type: IPC_MSG.CONN_STATE, localId: 5, state: "HELLO_RECV" },
      {
        type: IPC_MSG.CONN_DELIVER,
        deliveries: [
          { localId: 5, bytes: bufJson("frame-a") },
          { localId: 6, bytes: bufJson("frame-b") },
        ],
      },
      { type: IPC_MSG.CONN_STATE, localId: 6, state: "ANON" },
      { type: IPC_MSG.CONN_STATE, localId: 6, state: "AUTHENTICATED" },
      { type: IPC_MSG.CONN_STATE, localId: 6, state: "IN_WORLD" },
      { type: IPC_MSG.CONN_STATE, localId: 6, state: "REJECT" },
      { type: IPC_MSG.CONN_CLOSE, localId: 6 },
      { type: IPC_MSG.SHUTDOWN, kickReason: 6 },
    ]);
  });
});

describe("BatchWriter — 봉투 패칭·순서·분할", () => {
  test("연속 DELIVER는 봉투 1개, 비배치 메시지가 끼면 봉투를 닫는다 — 연결별 STATE/DELIVER/CLOSE 발행 순서 보존", () => {
    const w = new WorldIpcWriter();
    w.helloAck({ worldIncarnation: 1, connCap: 10 });
    w.deliver(1, Buffer.from("a"));
    w.deliver(2, Buffer.from("b"));
    w.connState(1, "IN_WORLD");
    w.deliver(1, Buffer.from("c"));
    w.connClose(1);
    const types: number[] = [];
    const dec = createGatewaySideDecoder((m) => types.push(m.type));
    dec.push(flushed(w));
    expect(types).toEqual([IPC_MSG.HELLO_ACK, IPC_MSG.CONN_DELIVER, IPC_MSG.CONN_STATE, IPC_MSG.CONN_DELIVER, IPC_MSG.CONN_CLOSE]);
  });

  test("flush가 열린 봉투를 닫고 길이를 패칭한다 — 다음 flush는 새 봉투", () => {
    const w = new WorldIpcWriter();
    w.deliver(1, Buffer.from("abc"));
    w.deliver(2, Buffer.from("de"));
    const first = flushed(w);
    // 봉투 1개: len = type 1 + 레코드 (8+3) + (8+2)
    expect(first.readUInt32LE(0)).toBe(1 + 11 + 10);
    expect(first[4]).toBe(IPC_MSG.CONN_DELIVER);
    expect(first.length).toBe(4 + 1 + 21);
    w.deliver(3, Buffer.from("f"));
    const second = flushed(w);
    expect(second.readUInt32LE(0)).toBe(1 + 9);
    expect(w.bufferedBytes).toBe(0);
    expect(flushed(w).length).toBe(0);
  });

  test("분할 임계를 넘으면 새 봉투 — 각 봉투 ≤ 임계, 레코드 순서 그대로", () => {
    const split = 1024;
    const w = new WorldIpcWriter({ batchSplitBytes: split });
    const sent: number[] = [];
    for (let i = 0; i < 200; i++) {
      w.deliver(i, Buffer.alloc(37 + (i % 50), i & 0xff));
      sent.push(i);
    }
    const bytes = flushed(w);
    let off = 0;
    let envelopes = 0;
    while (off < bytes.length) {
      const len = bytes.readUInt32LE(off);
      expect(len).toBeLessThanOrEqual(split);
      expect(bytes[off + 4]).toBe(IPC_MSG.CONN_DELIVER);
      off += 4 + len;
      envelopes++;
    }
    expect(off).toBe(bytes.length);
    expect(envelopes).toBeGreaterThan(5);

    const got: number[] = [];
    const dec = createGatewaySideDecoder((m) => {
      if (m.type === IPC_MSG.CONN_DELIVER) for (const d of m.deliveries) got.push(d.localId);
    });
    dec.push(helloAckBytes());
    dec.push(bytes);
    expect(got).toEqual(sent);
  });

  test("임계보다 큰 레코드 하나는 단독 봉투로 간다", () => {
    const w = new WorldIpcWriter({ batchSplitBytes: 256 });
    w.deliver(1, Buffer.alloc(10));
    w.deliver(2, Buffer.alloc(1000));
    w.deliver(3, Buffer.alloc(10));
    const bytes = flushed(w);
    const lens: number[] = [];
    for (let off = 0; off < bytes.length; off += 4 + bytes.readUInt32LE(off)) lens.push(bytes.readUInt32LE(off));
    expect(lens).toEqual([1 + 18, 1 + 1008, 1 + 18]);
  });

  test("CONN_FRAMES도 같은 규칙 — CONN_OPEN/CLOSED가 끼면 봉투를 닫는다", () => {
    const w = new GatewayIpcWriter();
    w.hello({ gatewayId: 1, incarnation: 1, pid: 1 });
    w.connOpen(1, "127.0.0.1");
    w.frame(1, 1, Buffer.from("a"));
    w.frame(1, 3, Buffer.from("b"));
    w.connClosed(1, CONN_CLOSED_REASON.Peer);
    w.frame(2, 1, Buffer.from("c"));
    const types: number[] = [];
    createWorldSideDecoder((m) => types.push(m.type)).push(flushed(w));
    expect(types).toEqual([IPC_MSG.HELLO, IPC_MSG.CONN_OPEN, IPC_MSG.CONN_FRAMES, IPC_MSG.CONN_CLOSED, IPC_MSG.CONN_FRAMES]);
  });
});

describe("BatchWriter — 인코딩 가드(검증 후 기록 — 거절된 호출은 상태를 바꾸지 않는다)", () => {
  test("필드 범위·주소 길이·레코드 상한 위반은 RangeError", () => {
    const g = new GatewayIpcWriter();
    expect(() => g.connOpen(-1, "1.2.3.4")).toThrow(RangeError);
    expect(() => g.connOpen(2 ** 32, "1.2.3.4")).toThrow(RangeError);
    expect(() => g.connOpen(1.5, "1.2.3.4")).toThrow(RangeError);
    expect(() => g.connOpen(1, "a".repeat(256))).toThrow(RangeError);
    expect(() => g.frame(1, 0x10000, Buffer.alloc(0))).toThrow(RangeError);
    expect(() => g.hello({ gatewayId: 65536, incarnation: 1, pid: 1 })).toThrow(RangeError);
    expect(() => g.connClosed(1, 99 as never)).toThrow(RangeError);
    const w = new WorldIpcWriter({ maxEnvelopeBytes: 4096 });
    expect(() => w.deliver(1, Buffer.alloc(4096))).toThrow(RangeError);
    expect(() => w.connState(1, "NOPE" as never)).toThrow(RangeError);
    expect(() => w.shutdown(0)).toThrow(RangeError);
    expect(g.bufferedBytes).toBe(0);
    expect(w.bufferedBytes).toBe(0);
  });

  test("거절 뒤에도 같은 writer의 이후 메시지는 정상 디코드", () => {
    const w = new WorldIpcWriter({ maxEnvelopeBytes: 4096 });
    w.helloAck({ worldIncarnation: 1, connCap: 1 });
    w.deliver(1, Buffer.from("ok"));
    expect(() => w.deliver(2, Buffer.alloc(5000))).toThrow(RangeError);
    w.deliver(3, Buffer.from("ok2"));
    const { dec, msgs } = gatewaySide();
    dec.push(flushed(w));
    expect(msgs[1]).toEqual({
      type: IPC_MSG.CONN_DELIVER,
      deliveries: [
        { localId: 1, bytes: bufJson("ok") },
        { localId: 3, bytes: bufJson("ok2") },
      ],
    });
  });

  test("분할 임계는 봉투 상한 안이어야 한다", () => {
    expect(() => new WorldIpcWriter({ maxEnvelopeBytes: 4096, batchSplitBytes: 4096 })).toThrow(RangeError);
    expect(() => new WorldIpcWriter({ batchSplitBytes: 8 })).toThrow(RangeError);
  });
});

describe("BatchWriter — 버퍼 소유권(교정 d: 꼬리 복사 대신 풀 버퍼 참조)", () => {
  test("큰 flush는 버퍼를 넘기고(release 동반), release된 버퍼를 다음 큰 flush가 재사용한다", () => {
    const w = new WorldIpcWriter({ copyBelowBytes: 1024 });
    w.deliver(1, Buffer.alloc(8000, 1));
    const sink = captureSink();
    w.flushTo(sink);
    const first = sink.writes[0]!;
    expect(first.release).toBeDefined();
    const backing = first.buf.buffer;
    first.release!();
    w.deliver(2, Buffer.alloc(8000, 2));
    w.flushTo(sink);
    expect(sink.writes[1]!.buf.buffer).toBe(backing);
    // release 전에는 같은 버퍼를 다시 쓰지 않는다(파이프가 아직 들고 있음).
    w.deliver(3, Buffer.alloc(8000, 3));
    w.flushTo(sink);
    expect(sink.writes[2]!.buf.buffer).not.toBe(backing);
    expect(sink.writes[1]!.buf.subarray(13).every((b) => b === 2)).toBe(true);
  });

  test("작은 flush는 복사본을 넘기고 release 없음 — 쓰기 버퍼는 writer가 계속 쓴다", () => {
    const w = new WorldIpcWriter({ copyBelowBytes: 1024 });
    w.deliver(1, Buffer.from("tiny"));
    const sink = captureSink();
    w.flushTo(sink);
    expect(sink.writes[0]!.release).toBeUndefined();
    const snapshot = Buffer.from(sink.writes[0]!.buf);
    w.deliver(2, Buffer.from("overwrite!"));
    w.flushTo(sink);
    expect(sink.writes[0]!.buf).toEqual(snapshot);
  });

  test("flushTo는 sink.write 반환값을 그대로 돌려준다 — 빈 writer는 true·무쓰기", () => {
    const w = new WorldIpcWriter();
    let calls = 0;
    const refusing: IpcByteSink = {
      write: () => {
        calls++;
        return false;
      },
    };
    expect(w.flushTo(refusing)).toBe(true);
    expect(calls).toBe(0);
    w.pong(1);
    expect(w.flushTo(refusing)).toBe(false);
    expect(calls).toBe(1);
  });
});

describe("스트리밍 디코드 — 무작위 분할", () => {
  function mixedStream(rng: SeededRng): { bytes: Buffer; expectedTypes: number[] } {
    const w = new WorldIpcWriter({ batchSplitBytes: 2048 });
    const expectedTypes: number[] = [IPC_MSG.HELLO_ACK];
    w.helloAck({ worldIncarnation: 9, connCap: 9 });
    let last = -1;
    for (let i = 0; i < 300; i++) {
      const r = rng.nextIntInclusive(0, 9);
      if (r < 6) {
        w.deliver(i, Buffer.alloc(rng.nextIntInclusive(0, 700), i & 0xff));
        if (last !== IPC_MSG.CONN_DELIVER) expectedTypes.push(IPC_MSG.CONN_DELIVER);
        last = IPC_MSG.CONN_DELIVER;
        continue;
      }
      if (r < 8) {
        w.connState(i, "IN_WORLD");
        last = IPC_MSG.CONN_STATE;
      } else {
        w.connClose(i);
        last = IPC_MSG.CONN_CLOSE;
      }
      expectedTypes.push(last);
    }
    return { bytes: flushed(w), expectedTypes };
  }

  function decodeTypesAndPayload(chunks: Buffer[]): { types: number[]; payload: number[] } {
    const types: number[] = [];
    const payload: number[] = [];
    const dec = createGatewaySideDecoder((m) => {
      if (m.type === IPC_MSG.CONN_DELIVER) {
        if (types[types.length - 1] !== IPC_MSG.CONN_DELIVER) types.push(m.type);
        for (const d of m.deliveries) {
          payload.push(d.localId, d.bytes.length);
          for (const b of d.bytes) if (b !== (d.localId & 0xff)) throw new Error(`corrupt byte in ${d.localId}`);
        }
      } else {
        types.push(m.type);
      }
    });
    for (const c of chunks) dec.push(c);
    return { types, payload };
  }

  test("한 덩어리 vs 무작위 분할(1바이트~수 KB, 시드 50개) — 같은 메시지 열", () => {
    const { bytes, expectedTypes } = mixedStream(new SeededRng(0xc0ffee));
    const whole = decodeTypesAndPayload([bytes]);
    // 분할 임계로 나뉜 연속 DELIVER 봉투는 위에서 하나로 접었다 — 비배치 경계만 비교.
    expect(whole.types).toEqual(expectedTypes);
    for (let seed = 1; seed <= 50; seed++) {
      const rng = new SeededRng(seed * 7919);
      const chunks: Buffer[] = [];
      let off = 0;
      while (off < bytes.length) {
        const maxCut = rng.nextIntInclusive(0, 3) === 0 ? 4 : 5000;
        const n = Math.min(bytes.length - off, rng.nextIntInclusive(1, maxCut));
        chunks.push(Buffer.from(bytes.subarray(off, off + n)));
        off += n;
      }
      const got = decodeTypesAndPayload(chunks);
      expect(got.types).toEqual(whole.types);
      expect(got.payload).toEqual(whole.payload);
    }
  });

  test("청크 버퍼는 push 반환 뒤 재사용돼도 안전(분할된 봉투는 링에 복사 보관)", () => {
    const w = new WorldIpcWriter();
    w.helloAck({ worldIncarnation: 1, connCap: 1 });
    w.deliver(1, Buffer.alloc(3000, 0x5a));
    const bytes = flushed(w);
    const scratch = Buffer.alloc(1000);
    const seen: number[] = [];
    const dec = createGatewaySideDecoder((m) => {
      if (m.type === IPC_MSG.CONN_DELIVER) for (const d of m.deliveries) seen.push(d.bytes.every((b) => b === 0x5a) ? d.bytes.length : -1);
    });
    for (let off = 0; off < bytes.length; off += scratch.length) {
      const n = Math.min(scratch.length, bytes.length - off);
      bytes.copy(scratch, 0, off, off + n);
      dec.push(scratch.subarray(0, n));
      scratch.fill(0xee);
    }
    expect(seen).toEqual([3000]);
  });
});

describe("디코더 가드 — 위반은 IpcProtocolError(피어 drop 근거), 이후 push도 같은 오류", () => {
  test("봉투 상한 초과는 헤더 4바이트만 와도 즉시(본문을 버퍼링하지 않는다)", () => {
    const { dec } = worldSide();
    dec.push(helloBytes());
    const header = Buffer.alloc(4);
    header.writeUInt32LE(64 * 1024 * 1024 - 3, 0); // 4 + len = 64 MiB + 1
    expect(protocolErrorKind(() => dec.push(header))).toBe("envelope_too_large");
    expect(protocolErrorKind(() => dec.push(helloBytes()))).toBe("envelope_too_large");
  });

  test("상한은 옵션으로 줄일 수 있고, 상한 정확히까지는 통과(수신 링 = 봉투 1개 크기)", () => {
    const max = 64 * 1024;
    const w = new WorldIpcWriter({ maxEnvelopeBytes: max });
    w.helloAck({ worldIncarnation: 1, connCap: 1 });
    w.deliver(1, Buffer.alloc(max - 4 - 1 - 8, 1)); // 봉투 전체 = max
    const bytes = flushed(w);
    let got = 0;
    const dec = createGatewaySideDecoder(
      (m) => {
        if (m.type === IPC_MSG.CONN_DELIVER) got += m.deliveries[0]!.bytes.length;
      },
      { maxEnvelopeBytes: max },
    );
    for (let off = 0; off < bytes.length; off += 1000) dec.push(bytes.subarray(off, off + 1000));
    expect(got).toBe(max - 13);
    expect(dec.ringCapacity).toBeLessThanOrEqual(max);

    const over = Buffer.alloc(4);
    over.writeUInt32LE(max - 3, 0);
    expect(protocolErrorKind(() => dec.push(over))).toBe("envelope_too_large");
  });

  test("len 0(type 없음) → envelope_empty", () => {
    const { dec } = worldSide();
    expect(protocolErrorKind(() => dec.push(Buffer.alloc(4)))).toBe("envelope_empty");
  });

  test("핸드셰이크: 첫 메시지가 HELLO가 아니면 handshake_expected, 두 번째 HELLO는 duplicate_handshake", () => {
    const ping = rawEnvelope(IPC_MSG.PING, [1, 0, 0, 0]);
    expect(protocolErrorKind(() => worldSide().dec.push(ping))).toBe("handshake_expected");
    const { dec } = worldSide();
    dec.push(helloBytes());
    expect(protocolErrorKind(() => dec.push(helloBytes()))).toBe("duplicate_handshake");
    expect(protocolErrorKind(() => gatewaySide().dec.push(rawEnvelope(IPC_MSG.PONG, [1, 0, 0, 0])))).toBe("handshake_expected");
  });

  test("버전 불일치는 나머지 레이아웃보다 먼저 판정(앞 u16 고정) — 상대 버전을 실어 보고", () => {
    const future = Buffer.alloc(20); // 미래 버전은 HELLO 길이가 달라도 version_mismatch로 보고된다
    future.writeUInt16LE(IPC_VERSION + 1, 0);
    const { dec } = worldSide();
    try {
      dec.push(rawEnvelope(IPC_MSG.HELLO, future));
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(IpcProtocolError);
      expect((err as IpcProtocolError).kind).toBe("version_mismatch");
      expect((err as IpcProtocolError).peerVersion).toBe(IPC_VERSION + 1);
    }
    const ack = Buffer.alloc(10);
    ack.writeUInt16LE(0, 0);
    expect(protocolErrorKind(() => gatewaySide().dec.push(rawEnvelope(IPC_MSG.HELLO_ACK, ack)))).toBe("version_mismatch");
    expect(protocolErrorKind(() => worldSide().dec.push(rawEnvelope(IPC_MSG.HELLO, [1])))).toBe("malformed");
  });

  test("미지·예약·역방향 type", () => {
    expect(protocolErrorKind(pushPastHandshake("world", rawEnvelope(0x7f, [])))).toBe("unknown_type");
    expect(protocolErrorKind(pushPastHandshake("world", rawEnvelope(0x94, [0])))).toBe("wrong_direction"); // v4 CONN_MULTICAST(W→G)
    expect(protocolErrorKind(pushPastHandshake("gateway", rawEnvelope(0xa0, [0])))).toBe("reserved_type");
    expect(protocolErrorKind(pushPastHandshake("world", rawEnvelope(0xc1, [0])))).toBe("reserved_type");
    expect(protocolErrorKind(pushPastHandshake("world", rawEnvelope(IPC_MSG.CONN_DELIVER, [])))).toBe("wrong_direction");
    expect(protocolErrorKind(pushPastHandshake("gateway", rawEnvelope(IPC_MSG.CONN_FRAMES, [])))).toBe("wrong_direction");
  });

  test("레이아웃 위반 — 고정 길이·잘린 레코드·남는 바이트·주소 길이·enum 범위·빈 배치 → malformed", () => {
    const g = (type: number, payload: number[] | Buffer) => pushPastHandshake("world", rawEnvelope(type, payload));
    const w = (type: number, payload: number[] | Buffer) => pushPastHandshake("gateway", rawEnvelope(type, payload));
    const cases: Array<[string, () => void]> = [
      ["PING 3바이트", g(IPC_MSG.PING, [1, 2, 3])],
      ["PING 5바이트", g(IPC_MSG.PING, [1, 2, 3, 4, 5])],
      ["BYE reason 범위 밖", g(IPC_MSG.BYE, [200])],
      ["CONN_OPEN addrLen 불일치", g(IPC_MSG.CONN_OPEN, [1, 0, 0, 0, 5, 0x31, 0x32])],
      ["CONN_OPEN 헤더 잘림", g(IPC_MSG.CONN_OPEN, [1, 0, 0])],
      ["CONN_CLOSED reason 범위 밖", g(IPC_MSG.CONN_CLOSED, [1, 0, 0, 0, 10])],
      ["CONN_FRAMES 빈 배치", g(IPC_MSG.CONN_FRAMES, [])],
      ["CONN_FRAMES 잘린 레코드 헤더", g(IPC_MSG.CONN_FRAMES, [1, 0, 0, 0, 1, 0, 5, 0])],
      ["CONN_FRAMES 본문 길이 초과", g(IPC_MSG.CONN_FRAMES, [1, 0, 0, 0, 1, 0, 5, 0, 0, 0, 0x61])],
      ["CONN_DELIVER 남는 바이트", w(IPC_MSG.CONN_DELIVER, [1, 0, 0, 0, 1, 0, 0, 0, 0x61, 0x99])],
      ["CONN_DELIVER 빈 배치", w(IPC_MSG.CONN_DELIVER, [])],
      ["CONN_STATE state 범위 밖", w(IPC_MSG.CONN_STATE, [1, 0, 0, 0, 5])],
      ["CONN_CLOSE 길이", w(IPC_MSG.CONN_CLOSE, [1, 0, 0])],
      ["CONN_ACCEPTED 길이", w(IPC_MSG.CONN_ACCEPTED, [1, 0, 0, 0, 2, 0, 0])],
      ["SHUTDOWN kickReason 범위 밖", w(IPC_MSG.SHUTDOWN, [0])],
      ["PONG 길이", w(IPC_MSG.PONG, [])],
    ];
    for (const [name, fn] of cases) {
      expect(`${name}: ${protocolErrorKind(fn)}`).toBe(`${name}: malformed`);
    }
  });

  test("콜백 예외는 그대로 전파되고 디코더는 실패 상태로 고정(스트림 위치 불명 — 피어 drop)", () => {
    const w = new WorldIpcWriter();
    w.helloAck({ worldIncarnation: 1, connCap: 1 });
    w.pong(1);
    w.pong(2);
    let calls = 0;
    const dec = createGatewaySideDecoder((m) => {
      calls++;
      if (m.type === IPC_MSG.PONG) throw new Error("handler bug");
    });
    expect(() => dec.push(flushed(w))).toThrow("handler bug");
    expect(calls).toBe(2);
    expect(protocolErrorKind(() => dec.push(Buffer.alloc(0)))).toBe("decoder_failed");
    expect(dec.failed).toBe(true);
  });

  test("destroy 이후 push는 무시(콜백 안에서 피어를 닫는 경우 남은 봉투를 내보내지 않는다)", () => {
    const w = new WorldIpcWriter();
    w.helloAck({ worldIncarnation: 1, connCap: 1 });
    w.pong(1);
    w.pong(2);
    const seen: number[] = [];
    const dec: IpcDecoder = createGatewaySideDecoder((m) => {
      seen.push(m.type);
      if (m.type === IPC_MSG.PONG) dec.destroy();
    });
    dec.push(flushed(w));
    dec.push(flushed(w));
    expect(seen).toEqual([IPC_MSG.HELLO_ACK, IPC_MSG.PONG]);
  });
});
