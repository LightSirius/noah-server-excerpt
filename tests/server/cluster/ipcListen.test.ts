// IPC v14 — 공유 포트 리스너 양보 메시지(cluster/ipcSchema·ipcCodec·ipcDecoder).
//
//   - G→W 0x04 LISTEN_REPORT {u8 flags(bit0 shared · bit1 closed · bit2 listening), u16 port, u32 ackSeq} — 정의 밖 비트는 malformed.
//   - W→G 0x86 LISTEN {u8 mode(0 listen · 1 yield), u32 seq ≥ 1} — 모르는 mode·seq 0은 malformed.
//   - 둘 다 비배치 메시지(열린 배치 봉투를 닫는다) — 운영 경로는 긴급 송신 전용 writer에 쓴다.

import { describe, expect, test } from "bun:test";
import {
  GatewayIpcWriter,
  IpcProtocolError,
  WorldIpcWriter,
  createGatewaySideDecoder,
  createWorldSideDecoder,
} from "../../../server/src/cluster/ipcCodec";
import {
  type GatewayToWorldMsg,
  IPC_MSG,
  IPC_VERSION,
  type WorldToGatewayMsg,
  isReservedIpcType,
} from "../../../server/src/cluster/ipcSchema";

function flushed(w: GatewayIpcWriter | WorldIpcWriter): Buffer {
  const out: Buffer[] = [];
  w.flushTo({ write: (buf) => out.push(Buffer.from(buf)) > 0 });
  return Buffer.concat(out);
}

function rawEnvelope(type: number, payload: number[]): Buffer {
  const p = Buffer.from(payload);
  const out = Buffer.alloc(5 + p.length);
  out.writeUInt32LE(1 + p.length, 0);
  out[4] = type;
  p.copy(out, 5);
  return out;
}

function errorKind(fn: () => void): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof IpcProtocolError) return err.kind;
    throw err;
  }
  throw new Error("expected IpcProtocolError");
}

function worldDecoder(): { push(b: Buffer): void; msgs: GatewayToWorldMsg[] } {
  const msgs: GatewayToWorldMsg[] = [];
  const dec = createWorldSideDecoder((m) => msgs.push(m));
  const hello = new GatewayIpcWriter();
  hello.hello({ gatewayId: 1, incarnation: 1, pid: 1 });
  dec.push(flushed(hello));
  msgs.length = 0;
  return { push: (b) => dec.push(b), msgs };
}

function gatewayDecoder(): { push(b: Buffer): void; msgs: WorldToGatewayMsg[] } {
  const msgs: WorldToGatewayMsg[] = [];
  const dec = createGatewaySideDecoder((m) => msgs.push(m));
  const ack = new WorldIpcWriter();
  ack.helloAck({ worldIncarnation: 1, connCap: 1 });
  dec.push(flushed(ack));
  msgs.length = 0;
  return { push: (b) => dec.push(b), msgs };
}

describe("IPC v14 — LISTEN_REPORT(G→W 0x04)", () => {
  test("현행 IPC_VERSION 22, v14의 0x04·0x86은 예약이 아니다", () => {
    expect(IPC_VERSION).toBe(22);
    expect(IPC_MSG.LISTEN_REPORT).toBe(0x04);
    expect(IPC_MSG.LISTEN).toBe(0x86);
    expect(isReservedIpcType(0x04) || isReservedIpcType(0x86)).toBe(false);
  });

  test("왕복 — 플래그 8조합·port·ackSeq(u32 상한)", () => {
    const w = new GatewayIpcWriter();
    const cases = [0, 1, 2, 3, 4, 5, 6, 7].map((f) => ({
      shared: (f & 1) !== 0,
      closed: (f & 2) !== 0,
      listening: (f & 4) !== 0,
      port: 19000 + f,
      ackSeq: f === 7 ? 0xffffffff : f,
    }));
    for (const c of cases) w.listenReport(c);
    const bytes = flushed(w);
    expect(bytes.length).toBe(cases.length * (5 + 7));
    const d = worldDecoder();
    d.push(bytes);
    expect(d.msgs).toEqual(cases.map((c) => ({ type: IPC_MSG.LISTEN_REPORT, ...c })));
  });

  test("레이아웃 — flags u8 · port u16 LE · ackSeq u32 LE", () => {
    const w = new GatewayIpcWriter();
    w.listenReport({ shared: true, closed: false, listening: true, port: 0x1234, ackSeq: 0x0a0b0c0d });
    expect([...flushed(w)]).toEqual([8, 0, 0, 0, 0x04, 0x05, 0x34, 0x12, 0x0d, 0x0c, 0x0b, 0x0a]);
  });

  test("정의 밖 플래그 비트·길이 불일치는 malformed, 게이트웨이 측이 받으면 wrong_direction, 핸드셰이크 전이면 handshake_expected", () => {
    for (const flags of [0x08, 0x10, 0x80, 0xff]) {
      expect(errorKind(() => worldDecoder().push(rawEnvelope(IPC_MSG.LISTEN_REPORT, [flags, 0, 0, 0, 0, 0, 0])))).toBe("malformed");
    }
    expect(errorKind(() => worldDecoder().push(rawEnvelope(IPC_MSG.LISTEN_REPORT, [1, 0, 0, 0, 0, 0])))).toBe("malformed");
    expect(errorKind(() => worldDecoder().push(rawEnvelope(IPC_MSG.LISTEN_REPORT, [1, 0, 0, 0, 0, 0, 0, 0])))).toBe("malformed");
    expect(errorKind(() => gatewayDecoder().push(rawEnvelope(IPC_MSG.LISTEN_REPORT, [1, 0, 0, 0, 0, 0, 0])))).toBe("wrong_direction");
    const fresh = createWorldSideDecoder(() => {});
    expect(errorKind(() => fresh.push(rawEnvelope(IPC_MSG.LISTEN_REPORT, [1, 0, 0, 0, 0, 0, 0])))).toBe("handshake_expected");
  });

  test("writer는 범위 밖 값을 기록 전에 거절한다(port u16·ackSeq u32) — 상태 불변", () => {
    const w = new GatewayIpcWriter();
    const base = { shared: true, closed: false, listening: true };
    expect(() => w.listenReport({ ...base, port: 0x10000, ackSeq: 0 })).toThrow(RangeError);
    expect(() => w.listenReport({ ...base, port: 1, ackSeq: -1 })).toThrow(RangeError);
    expect(() => w.listenReport({ ...base, port: 1, ackSeq: 1.5 })).toThrow(RangeError);
    expect(w.bufferedBytes).toBe(0);
  });

  test("비배치 메시지 — 열린 CONN_FRAMES 봉투를 닫는다", () => {
    const w = new GatewayIpcWriter();
    w.frame(1, 0x0100, Buffer.from([1]));
    w.listenReport({ shared: false, closed: false, listening: true, port: 1, ackSeq: 0 });
    w.frame(1, 0x0100, Buffer.from([2]));
    const d = worldDecoder();
    d.push(flushed(w));
    expect(d.msgs.map((m) => m.type)).toEqual([IPC_MSG.CONN_FRAMES, IPC_MSG.LISTEN_REPORT, IPC_MSG.CONN_FRAMES]);
  });
});

describe("IPC v14 — LISTEN(W→G 0x86)", () => {
  test("왕복 — listen/yield, seq 1·u32 상한", () => {
    const w = new WorldIpcWriter();
    w.listen("yield", 1);
    w.listen("listen", 0xffffffff);
    const bytes = flushed(w);
    expect([...bytes.subarray(0, 10)]).toEqual([6, 0, 0, 0, 0x86, 1, 1, 0, 0, 0]);
    const d = gatewayDecoder();
    d.push(bytes);
    expect(d.msgs).toEqual([
      { type: IPC_MSG.LISTEN, mode: "yield", seq: 1 },
      { type: IPC_MSG.LISTEN, mode: "listen", seq: 0xffffffff },
    ]);
  });

  test("모르는 mode·seq 0·길이 불일치는 malformed, 월드 측이 받으면 wrong_direction", () => {
    expect(errorKind(() => gatewayDecoder().push(rawEnvelope(IPC_MSG.LISTEN, [2, 1, 0, 0, 0])))).toBe("malformed");
    expect(errorKind(() => gatewayDecoder().push(rawEnvelope(IPC_MSG.LISTEN, [0, 0, 0, 0, 0])))).toBe("malformed");
    expect(errorKind(() => gatewayDecoder().push(rawEnvelope(IPC_MSG.LISTEN, [0, 1, 0, 0])))).toBe("malformed");
    expect(errorKind(() => worldDecoder().push(rawEnvelope(IPC_MSG.LISTEN, [0, 1, 0, 0, 0])))).toBe("wrong_direction");
  });

  test("writer는 seq 0·범위 밖 seq를 기록 전에 거절한다", () => {
    const w = new WorldIpcWriter();
    expect(() => w.listen("listen", 0)).toThrow(RangeError);
    expect(() => w.listen("yield", 0x1_0000_0000)).toThrow(RangeError);
    expect(w.bufferedBytes).toBe(0);
  });
});
