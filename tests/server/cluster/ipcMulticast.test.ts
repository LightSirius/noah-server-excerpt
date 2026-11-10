// 성능 4.5 F2 — IPC v4 MULTICAST의 코덱 절반(cluster/ipcSchema·ipcCodec·ipcDecoder).
//
//   - W→G 0x94 CONN_MULTICAST 배치: 반복 {u32 len, bytes, u16 n, u32[n] localIds} — 같은 완성 클라 프레임을 n개 연결에. 연속 레코드는
//     봉투 1개를 공유하고, DELIVER와 번갈아 오면 배치 type이 바뀔 때마다 봉투를 닫고 새로 연다(스트림 순서 = 발행 순서).
//   - W→G 0x95 CONN_FLUSH {}: flush 창의 끝(비배치 — 열린 봉투를 닫는다).
//   - 가드: 빈 배치·완성 클라 프레임 미만(len < 4 = 클라 헤더 v2 — 4.5 리뷰)·수신자 0·바이트/수신자 목록 초과·남는 바이트·CONN_FLUSH
//     payload = malformed. 월드 측 수신 = wrong_direction. writer는 기록 전에 거절한다(RangeError — 상태 불변). HELLO 버전 협상은 그대로
//     엄격하다(v3 게이트웨이 = version_mismatch).

import { describe, expect, test } from "bun:test";
import {
  GatewayIpcWriter,
  IpcProtocolError,
  WorldIpcWriter,
  createGatewaySideDecoder,
  createWorldSideDecoder,
  multicastRecordBytes,
} from "../../../server/src/cluster/ipcCodec";
import {
  IPC_CLIENT_FRAME_MIN_BYTES,
  IPC_MSG,
  IPC_MULTICAST_MAX_IDS,
  IPC_VERSION,
  type WorldToGatewayMsg,
  isReservedIpcType,
} from "../../../server/src/cluster/ipcSchema";
import { FRAME_HEADER_BYTES } from "../../../server/src/net/wireFrame";
import { SeededRng } from "../../../server/src/sim/deterministic";

function flushed(w: GatewayIpcWriter | WorldIpcWriter): Buffer {
  const out: Buffer[] = [];
  w.flushTo({ write: (buf) => out.push(Buffer.from(buf)) > 0 });
  return Buffer.concat(out);
}

function rawEnvelope(type: number, payload: number[] | Buffer): Buffer {
  const p = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
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

/** 디코드 결과를 비교 가능한 평문으로(뷰·Uint32Array → 문자열·배열). */
type Plain =
  | { type: "cast"; records: { bytes: string; ids: number[] }[] }
  | { type: "deliver"; records: { localId: number; bytes: string }[] }
  | { type: number };

function plain(m: WorldToGatewayMsg): Plain {
  if (m.type === IPC_MSG.CONN_MULTICAST) {
    return { type: "cast", records: m.casts.map((c) => ({ bytes: c.bytes.toString("latin1"), ids: [...c.localIds] })) };
  }
  if (m.type === IPC_MSG.CONN_DELIVER) {
    return { type: "deliver", records: m.deliveries.map((d) => ({ localId: d.localId, bytes: d.bytes.toString("latin1") })) };
  }
  return { type: m.type };
}

function ackedGateway(): { push(b: Buffer): void; msgs: Plain[] } {
  const msgs: Plain[] = [];
  const dec = createGatewaySideDecoder((m) => msgs.push(plain(m)));
  const ack = new WorldIpcWriter();
  ack.helloAck({ worldIncarnation: 1, connCap: 1 });
  dec.push(flushed(ack));
  msgs.length = 0;
  return { push: (b) => dec.push(b), msgs };
}

const ids = (...v: number[]) => Uint32Array.from(v);
const frame = (s: string) => Buffer.from(s, "latin1");

/** MULTICAST 레코드 원시 바이트(가드 시험용). */
function castRecord(bytes: Buffer, localIds: number[], opts: { len?: number; n?: number } = {}): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32LE(opts.len ?? bytes.length, 0);
  const n = Buffer.alloc(2);
  n.writeUInt16LE(opts.n ?? localIds.length, 0);
  const list = Buffer.alloc(4 * localIds.length);
  localIds.forEach((id, i) => list.writeUInt32LE(id, 4 * i));
  return Buffer.concat([head, bytes, n, list]);
}

describe("IPC v4 — CONN_MULTICAST·CONN_FLUSH 왕복", () => {
  test("IPC_VERSION 4 이상(MULTICAST 도입 v4, 현재 v5), 0x94는 더 이상 예약이 아니다(0xA0–0xC1만)", () => {
    expect(IPC_VERSION).toBeGreaterThanOrEqual(4);
    expect(isReservedIpcType(0x94)).toBe(false);
    expect(isReservedIpcType(0x95)).toBe(false);
    expect(isReservedIpcType(0xa0)).toBe(true);
    expect(isReservedIpcType(0xc1)).toBe(true);
  });

  test("연속 MULTICAST는 봉투 1개 — 프레임·수신자(중복·u32 최대 포함)가 그대로 돌아온다, 레코드 바이트 = 6 + len + 4n", () => {
    const w = new WorldIpcWriter();
    w.multicast(frame("AAAAAA"), ids(1, 2, 0xffffffff), 0, 3);
    w.multicast(frame("BBBBBBB"), ids(9, 7, 7, 5), 1, 2);
    const bytes = flushed(w);
    expect(bytes.length).toBe(5 + multicastRecordBytes(6, 3) + multicastRecordBytes(7, 2));
    const g = ackedGateway();
    g.push(bytes);
    expect(g.msgs).toEqual([
      {
        type: "cast",
        records: [
          { bytes: "AAAAAA", ids: [1, 2, 0xffffffff] },
          { bytes: "BBBBBBB", ids: [7, 7] },
        ],
      },
    ]);
  });

  test("CONN_FLUSH — payload 없는 비배치 메시지(5바이트), 열린 MULTICAST 봉투를 닫는다", () => {
    const w = new WorldIpcWriter();
    w.multicast(frame("xxxxxx"), ids(1, 2), 0, 2);
    w.connFlush();
    w.multicast(frame("yyyyyy"), ids(3, 4), 0, 2);
    const bytes = flushed(w);
    const g = ackedGateway();
    g.push(bytes);
    expect(g.msgs.map((m) => m.type)).toEqual(["cast", IPC_MSG.CONN_FLUSH, "cast"]);
    const solo = new WorldIpcWriter();
    solo.connFlush();
    expect([...flushed(solo)]).toEqual([1, 0, 0, 0, IPC_MSG.CONN_FLUSH]);
  });

  test("DELIVER·MULTICAST·STATE가 섞이면 배치 type이 바뀔 때마다 봉투가 바뀐다 — 수신 순서 = 발행 순서", () => {
    const w = new WorldIpcWriter();
    w.deliver(1, frame("d1"));
    w.multicast(frame("mcast1"), ids(1, 2), 0, 2);
    w.multicast(frame("mcast2"), ids(2, 3), 0, 2);
    w.connState(2, "IN_WORLD");
    w.multicast(frame("mcast3"), ids(1, 3), 0, 2);
    w.deliver(3, frame("d2"));
    w.deliver(1, frame("d3"));
    const g = ackedGateway();
    g.push(flushed(w));
    expect(g.msgs).toEqual([
      { type: "deliver", records: [{ localId: 1, bytes: "d1" }] },
      { type: "cast", records: [{ bytes: "mcast1", ids: [1, 2] }, { bytes: "mcast2", ids: [2, 3] }] },
      { type: IPC_MSG.CONN_STATE },
      { type: "cast", records: [{ bytes: "mcast3", ids: [1, 3] }] },
      { type: "deliver", records: [{ localId: 3, bytes: "d2" }, { localId: 1, bytes: "d3" }] },
    ]);
  });

  test("분할 임계를 넘으면 새 MULTICAST 봉투 — 레코드 순서 보존, 임계보다 큰 레코드 하나는 단독 봉투", () => {
    const w = new WorldIpcWriter({ batchSplitBytes: 64 });
    const sent: string[] = [];
    for (let i = 0; i < 12; i++) {
      const f = `frame-${i}`.padEnd(10 + i * 3, "#");
      sent.push(f);
      w.multicast(frame(f), ids(i, i + 1, i + 2), 0, 3);
    }
    const g = ackedGateway();
    g.push(flushed(w));
    expect(g.msgs.length).toBeGreaterThan(3);
    const got = g.msgs.flatMap((m) => ("records" in m && m.type === "cast" ? m.records.map((r) => r.bytes) : []));
    expect(got).toEqual(sent);
  });

  test("무작위 분할(1바이트 포함) 스트리밍에도 같은 메시지 열", () => {
    const w = new WorldIpcWriter({ batchSplitBytes: 200 });
    const rng = new SeededRng(0x94);
    for (let i = 0; i < 40; i++) {
      const n = 1 + Math.floor(rng.nextFloat() * 20);
      const list = Uint32Array.from({ length: n }, () => Math.floor(rng.nextFloat() * 1000));
      if (rng.nextFloat() < 0.3) w.deliver(i, frame(`d${i}`));
      else if (rng.nextFloat() < 0.1) w.connFlush();
      else w.multicast(frame(`c${i}`.repeat(1 + (i % 5)).padEnd(6, "#")), list, 0, n);
    }
    const bytes = flushed(w);
    const whole = ackedGateway();
    whole.push(bytes);
    const split = ackedGateway();
    for (let off = 0; off < bytes.length; ) {
      const take = Math.min(bytes.length - off, rng.nextFloat() < 0.2 ? 1 : 1 + Math.floor(rng.nextFloat() * 64));
      split.push(bytes.subarray(off, off + take));
      off += take;
    }
    expect(split.msgs).toEqual(whole.msgs);
  });
});

describe("IPC v4 — 가드", () => {
  test("완성 클라 프레임 최소 = 클라 헤더(FRAME_HEADER_BYTES)", () => {
    expect(IPC_CLIENT_FRAME_MIN_BYTES).toBe(FRAME_HEADER_BYTES);
  });

  test("writer: 빈·헤더 미만 프레임·수신자 0·u16 초과·범위 밖 start·봉투 상한 초과는 기록 전에 RangeError(상태 불변)", () => {
    const w = new WorldIpcWriter({ maxEnvelopeBytes: 1024 });
    const big = new Uint32Array(IPC_MULTICAST_MAX_IDS + 1);
    expect(() => w.multicast(Buffer.alloc(0), ids(1), 0, 1)).toThrow(RangeError);
    expect(() => w.multicast(frame("a"), ids(1), 0, 1)).toThrow(RangeError);
    expect(() => w.multicast(frame("abc"), ids(1), 0, 1)).toThrow(RangeError); // 클라 헤더(4) 미만
    expect(() => w.multicast(frame("aaaaaa"), ids(1), 0, 0)).toThrow(RangeError);
    expect(() => w.multicast(frame("aaaaaa"), big, 0, IPC_MULTICAST_MAX_IDS + 1)).toThrow(RangeError);
    expect(() => w.multicast(frame("aaaaaa"), ids(1, 2), 1, 2)).toThrow(RangeError);
    expect(() => w.multicast(Buffer.alloc(1100), ids(1, 2), 0, 2)).toThrow(RangeError);
    expect(w.bufferedBytes).toBe(0);
    expect(w.fits(multicastRecordBytes(100, 2))).toBe(true);
    expect(w.fits(multicastRecordBytes(1100, 2))).toBe(false);
  });

  test("디코더: 레이아웃 위반은 malformed", () => {
    const castEnv = (payload: Buffer) => () => ackedGateway().push(rawEnvelope(IPC_MSG.CONN_MULTICAST, payload));
    const cases: Array<[string, () => void]> = [
      ["빈 배치", castEnv(Buffer.alloc(0))],
      ["레코드 고정부 잘림", castEnv(Buffer.from([1, 0, 0, 0, 0x61]))],
      ["빈 프레임(len 0)", castEnv(castRecord(Buffer.alloc(0), [1]))],
      ["1바이트 프레임(게이트웨이 readUInt16BE가 던지던 형태)", castEnv(castRecord(frame("a"), [1]))],
      ["헤더 미만 프레임(len 3)", castEnv(castRecord(frame("abc"), [1]))],
      ["수신자 0", castEnv(castRecord(frame("aaaaaa"), []))],
      ["프레임 길이가 봉투 초과", castEnv(castRecord(frame("aaaaaa"), [1], { len: 50 }))],
      ["수신자 목록이 봉투 초과", castEnv(castRecord(frame("aaaaaa"), [1], { n: 3 }))],
      ["남는 바이트", castEnv(Buffer.concat([castRecord(frame("aaaaaa"), [1]), Buffer.from([9, 9])]))],
      ["CONN_FLUSH payload", () => ackedGateway().push(rawEnvelope(IPC_MSG.CONN_FLUSH, [0]))],
    ];
    for (const [label, fn] of cases) {
      expect([label, errorKind(fn)]).toEqual([label, "malformed"]);
    }
  });

  test("월드 측 수신 = wrong_direction, 핸드셰이크 전 = handshake_expected, v3 HELLO = version_mismatch(엄격 협상)", () => {
    const helloBytes = (): Buffer => {
      const hello = new GatewayIpcWriter();
      hello.hello({ gatewayId: 1, incarnation: 1, pid: 1 });
      return flushed(hello);
    };
    const world = createWorldSideDecoder(() => {});
    world.push(helloBytes());
    expect(errorKind(() => world.push(rawEnvelope(IPC_MSG.CONN_MULTICAST, castRecord(frame("aaaaaa"), [1]))))).toBe("wrong_direction");
    const world2 = createWorldSideDecoder(() => {});
    world2.push(helloBytes());
    expect(errorKind(() => world2.push(rawEnvelope(IPC_MSG.CONN_FLUSH, [])))).toBe("wrong_direction");
    const fresh = createGatewaySideDecoder(() => {});
    expect(errorKind(() => fresh.push(rawEnvelope(IPC_MSG.CONN_FLUSH, [])))).toBe("handshake_expected");
    const v3 = helloBytes();
    v3.writeUInt16LE(3, 5); // HELLO payload 앞 u16 = ipcVer
    try {
      createWorldSideDecoder(() => {}).push(v3);
      throw new Error("expected version_mismatch");
    } catch (err) {
      expect(err).toBeInstanceOf(IpcProtocolError);
      expect([(err as IpcProtocolError).kind, (err as IpcProtocolError).peerVersion]).toEqual(["version_mismatch", 3]);
    }
  });
});
