// 성능 4.5 F3 — IPC v5 CONN_DELIVER_SHARED의 코덱 절반(cluster/ipcSchema·ipcCodec·ipcDecoder).
//
//   - W→G 0x96 CONN_DELIVER_SHARED 배치: 레코드 = u8 tag | …
//       DEF(1)      {u32 len, u16 patchOff, bytes[len]}                         — 이 봉투 안 ref = DEF 순번(0부터)
//       CONN(2)     {u32 localId, u32 len, bytes[len]}                          — CONN_DELIVER 레코드와 같은 의미
//       CONN_REF(3) {u32 localId, u32 ref, u32 value, u32 len, bytes[len]}      — bytes 뒤에 DEF[ref](patchOff에 value u32 LE)
//   - writer: deliverShared는 프레임이 이 봉투에 처음이면 DEF를 CONN_REF 바로 앞(같은 봉투)에 쓴다. 봉투가 닫히면(flush·비배치 메시지·
//     분할 임계·다른 배치 type) 다음 참조가 DEF를 다시 쓴다. 0x96 봉투가 열려 있는 동안 deliver(평문)는 그 봉투의 CONN 레코드로(봉투를
//     닫으면 DEF를 다시 써야 하므로), 아니면 종전 CONN_DELIVER.
//   - 가드: 모르는 tag·앞선 DEF 없는 ref·patchOff + 4 > len·DEF len < 4(완성 클라 프레임 미만 — v2 헤더)·남는/모자란 바이트·CONN 레코드 없는
//     봉투 = malformed. 월드 측 수신 = wrong_direction. HELLO 버전 협상은 그대로 엄격하다(v4 게이트웨이 = version_mismatch).

import { describe, expect, test } from "bun:test";
import {
  GatewayIpcWriter,
  IpcProtocolError,
  WorldIpcWriter,
  createGatewaySideDecoder,
  createWorldSideDecoder,
} from "../../../server/src/cluster/ipcCodec";
import {
  IPC_MSG,
  IPC_SHARED_TAG,
  IPC_VERSION,
  type WorldToGatewayMsg,
} from "../../../server/src/cluster/ipcSchema";
import { SharedFrame } from "../../../server/src/net/sharedFrame";

function flushed(w: GatewayIpcWriter | WorldIpcWriter): Buffer {
  const out: Buffer[] = [];
  w.flushTo({ write: (buf) => out.push(Buffer.from(buf)) > 0 });
  return Buffer.concat(out);
}

function rawEnvelope(type: number, payload: Buffer): Buffer {
  const out = Buffer.alloc(5 + payload.length);
  out.writeUInt32LE(1 + payload.length, 0);
  out[4] = type;
  payload.copy(out, 5);
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

/** 디코드 결과 평문 — 공유 레코드는 클라가 받을 바이트(인라인 + 패치한 DEF)로 펼친다. */
type Plain =
  | { type: "shared"; defs: number; records: { localId: number; bytes: string; ref: boolean }[] }
  | { type: "deliver"; records: { localId: number; bytes: string }[] }
  | { type: number };

function plain(m: WorldToGatewayMsg): Plain {
  if (m.type === IPC_MSG.CONN_DELIVER_SHARED) {
    return {
      type: "shared",
      defs: m.defCount,
      records: m.deliveries.map((d) => {
        if (d.def === null) return { localId: d.localId, bytes: d.bytes.toString("latin1"), ref: false };
        const def = Buffer.from(d.def.bytes);
        def.writeUInt32LE(d.value, d.def.patchOff);
        return { localId: d.localId, bytes: Buffer.concat([d.bytes, def]).toString("latin1"), ref: true };
      }),
    };
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

/** 패치 자리 2(…)인 공유 프레임 — "AB????CD" 꼴. */
function shared(text: string, patchOff = 2): SharedFrame {
  const f = new SharedFrame(patchOff);
  f.bytes = Buffer.from(text, "latin1");
  return f;
}

function patchedText(f: SharedFrame, value: number): string {
  const b = Buffer.from(f.bytes);
  b.writeUInt32LE(value >>> 0, f.patchOff);
  return b.toString("latin1");
}

const raw = (s: string) => Buffer.from(s, "latin1");

describe("IPC v5 — CONN_DELIVER_SHARED 왕복", () => {
  test("IPC_VERSION ≥ 5(CONN_DELIVER_SHARED 도입 버전)", () => {
    expect(IPC_VERSION).toBeGreaterThanOrEqual(5); // v5에서 도입(v6 = 클라 헤더 v2)
  });

  test("같은 프레임 참조 3개 = DEF 1개 + CONN_REF 3개(봉투 1개), 연결마다 자기 value — 바이트 수 = 7 + F + 3 × (17 + 인라인)", () => {
    const w = new WorldIpcWriter();
    const f = shared("AB....CDEF");
    expect(w.deliverShared(1, raw(""), f, 10)).toBe(true);
    expect(w.deliverShared(2, raw("xy"), f, 0xffffffff)).toBe(false);
    expect(w.deliverShared(3, raw(""), f, 3)).toBe(false);
    const bytes = flushed(w);
    expect(bytes.length).toBe(5 + 7 + 10 + 3 * 17 + 2);
    const g = ackedGateway();
    g.push(bytes);
    expect(g.msgs).toEqual([
      {
        type: "shared",
        defs: 1,
        records: [
          { localId: 1, bytes: patchedText(f, 10), ref: true },
          { localId: 2, bytes: `xy${patchedText(f, 0xffffffff)}`, ref: true },
          { localId: 3, bytes: patchedText(f, 3), ref: true },
        ],
      },
    ]);
  });

  test("열린 0x96 봉투 안의 평문 deliver는 CONN 레코드(봉투 유지 — DEF 재사용), 0x96이 없으면 종전 CONN_DELIVER", () => {
    const w = new WorldIpcWriter();
    const f = shared("AB....");
    w.deliver(9, raw("plain-before"));
    w.deliverShared(1, raw(""), f, 1);
    w.deliver(7, raw("plain-inside"));
    expect(w.deliverShared(2, raw(""), f, 2)).toBe(false);
    const g = ackedGateway();
    g.push(flushed(w));
    expect(g.msgs).toEqual([
      { type: "deliver", records: [{ localId: 9, bytes: "plain-before" }] },
      {
        type: "shared",
        defs: 1,
        records: [
          { localId: 1, bytes: patchedText(f, 1), ref: true },
          { localId: 7, bytes: "plain-inside", ref: false },
          { localId: 2, bytes: patchedText(f, 2), ref: true },
        ],
      },
    ]);
  });

  test("봉투가 닫히면 다음 참조가 DEF를 다시 쓴다 — 비배치 메시지·flush·다른 배치 type", () => {
    const w = new WorldIpcWriter();
    const f = shared("AB....");
    w.deliverShared(1, raw(""), f, 1);
    w.connState(1, "IN_WORLD"); // 비배치 — 봉투를 닫는다.
    expect(w.deliverShared(2, raw(""), f, 2)).toBe(true);
    w.multicast(raw("mcast!"), Uint32Array.of(5, 6), 0, 2); // 다른 배치 type.
    expect(w.deliverShared(3, raw(""), f, 3)).toBe(true);
    const first = flushed(w);
    expect(w.deliverShared(4, raw(""), f, 4)).toBe(true); // flush 뒤 새 봉투.
    const g = ackedGateway();
    g.push(Buffer.concat([first, flushed(w)]));
    expect(g.msgs.map((m) => (typeof m.type === "string" && m.type === "shared" ? `shared:${(m as { defs: number }).defs}` : m.type))).toEqual([
      "shared:1",
      IPC_MSG.CONN_STATE,
      "shared:1",
      IPC_MSG.CONN_MULTICAST,
      "shared:1",
      "shared:1",
    ]);
  });

  test("분할 임계를 넘으면 새 봉투 — DEF가 CONN_REF와 같은 봉투에 다시 온다(수신 바이트 동일)", () => {
    const w = new WorldIpcWriter({ batchSplitBytes: 64 });
    const f = shared(`AB${"z".repeat(20)}`);
    const expected: { localId: number; bytes: string; ref: boolean }[] = [];
    for (let i = 1; i <= 6; i++) {
      w.deliverShared(i, raw("i".repeat(i)), f, i * 11);
      expected.push({ localId: i, bytes: "i".repeat(i) + patchedText(f, i * 11), ref: true });
    }
    const g = ackedGateway();
    g.push(flushed(w));
    expect(g.msgs.length).toBeGreaterThan(2);
    for (const m of g.msgs) expect((m as { defs: number }).defs).toBe(1);
    expect(g.msgs.flatMap((m) => (m as { records: unknown[] }).records)).toEqual(expected);
  });

  test("재발급된 프레임(같은 객체, epoch 변경)은 같은 봉투에서도 새 DEF", () => {
    const w = new WorldIpcWriter();
    const f = shared("AB..old");
    w.deliverShared(1, raw(""), f, 1);
    f.bytes = raw("AB..new!");
    f.epoch++;
    expect(w.deliverShared(2, raw(""), f, 2)).toBe(true);
    const g = ackedGateway();
    g.push(flushed(w));
    expect(g.msgs).toEqual([
      {
        type: "shared",
        defs: 2,
        records: [
          { localId: 1, bytes: patchedText(shared("AB..old"), 1), ref: true },
          { localId: 2, bytes: patchedText(f, 2), ref: true },
        ],
      },
    ]);
  });

  test("writer 가드 — patchOff + 4 > 길이(v2 헤더 4바이트라 이 조건이 완성 클라 프레임 하한도 덮는다)·localId 범위 밖은 RangeError(기록 전 — 상태 불변)", () => {
    const w = new WorldIpcWriter();
    expect(() => w.deliverShared(1, raw(""), shared("ABC", 0), 1)).toThrow(RangeError);
    expect(() => w.deliverPatched(1, raw(""), shared("ABCD", 1), 1)).toThrow(RangeError);
    expect(() => w.deliverShared(-1, raw(""), shared("AB...."), 1)).toThrow(RangeError);
    expect(w.bufferedBytes).toBe(0);
  });
});

/** 0x96 payload 조립 — 레코드 원시 바이트. */
function defRec(bytes: Buffer, patchOff: number, len = bytes.length): Buffer {
  const h = Buffer.alloc(7);
  h[0] = IPC_SHARED_TAG.DEF;
  h.writeUInt32LE(len, 1);
  h.writeUInt16LE(patchOff, 5);
  return Buffer.concat([h, bytes]);
}

function refRec(localId: number, ref: number, value: number, inline: Buffer, len = inline.length): Buffer {
  const h = Buffer.alloc(17);
  h[0] = IPC_SHARED_TAG.CONN_REF;
  h.writeUInt32LE(localId, 1);
  h.writeUInt32LE(ref, 5);
  h.writeUInt32LE(value, 9);
  h.writeUInt32LE(len, 13);
  return Buffer.concat([h, inline]);
}

function connRec(localId: number, bytes: Buffer): Buffer {
  const h = Buffer.alloc(9);
  h[0] = IPC_SHARED_TAG.CONN;
  h.writeUInt32LE(localId, 1);
  h.writeUInt32LE(bytes.length, 5);
  return Buffer.concat([h, bytes]);
}

describe("IPC v5 — CONN_DELIVER_SHARED 디코더 가드", () => {
  const SHARED = IPC_MSG.CONN_DELIVER_SHARED;
  const malformedOf = (payload: Buffer) => errorKind(() => ackedGateway().push(rawEnvelope(SHARED, payload)));

  test("정상 원시 봉투 — DEF·CONN·CONN_REF 섞임", () => {
    const g = ackedGateway();
    g.push(rawEnvelope(SHARED, Buffer.concat([defRec(raw("AB1234"), 2), connRec(4, raw("pp")), refRec(5, 0, 7, raw("q"))])));
    expect(g.msgs).toEqual([
      {
        type: "shared",
        defs: 1,
        records: [
          { localId: 4, bytes: "pp", ref: false },
          { localId: 5, bytes: `q${patchedText(shared("AB1234"), 7)}`, ref: true },
        ],
      },
    ]);
  });

  test("위반은 malformed", () => {
    expect(malformedOf(Buffer.alloc(0))).toBe("malformed"); // 빈 배치
    expect(malformedOf(defRec(raw("AB1234"), 2))).toBe("malformed"); // CONN 레코드 없음
    expect(malformedOf(Buffer.from([9, 0, 0, 0, 0]))).toBe("malformed"); // 모르는 tag
    expect(malformedOf(refRec(1, 0, 1, raw("")))).toBe("malformed"); // 앞선 DEF 없는 ref
    expect(malformedOf(Buffer.concat([defRec(raw("AB1234"), 2), refRec(1, 1, 1, raw(""))]))).toBe("malformed"); // ref 범위 밖
    expect(malformedOf(Buffer.concat([defRec(raw("AB1234"), 3), refRec(1, 0, 1, raw(""))]))).toBe("malformed"); // patchOff + 4 > len
    expect(malformedOf(Buffer.concat([defRec(raw(""), 0), connRec(1, raw("x"))]))).toBe("malformed"); // 빈 DEF
    // 완성 클라 프레임 미만(4.5 리뷰 — 게이트웨이가 DEF 단독 write의 헤더 판독에서 던지지 않게 디코더가 거절). v2 헤더(4)에서는
    // patchOff + 4 ≤ len이 하한을 겸해 따로 만들 수 없다 — 3바이트 DEF로 경계만 본다.
    expect(malformedOf(Buffer.concat([defRec(raw("AB1"), 0), refRec(1, 0, 1, raw(""))]))).toBe("malformed");
    expect(malformedOf(defRec(raw("AB1234"), 2, 99))).toBe("malformed"); // DEF 바이트 초과
    expect(malformedOf(Buffer.concat([defRec(raw("AB1234"), 2), refRec(1, 0, 1, raw("q"), 5)]))).toBe("malformed"); // 인라인 초과
    expect(malformedOf(connRec(1, raw("x")).subarray(0, 6))).toBe("malformed"); // 머리 잘림
    expect(malformedOf(Buffer.concat([defRec(raw("AB1234"), 2), refRec(1, 0, 1, raw("")).subarray(0, 12)]))).toBe("malformed");
  });

  test("월드 측 디코더가 받으면 wrong_direction", () => {
    const dec = createWorldSideDecoder(() => {});
    const hello = new GatewayIpcWriter();
    hello.hello({ gatewayId: 1, incarnation: 1, pid: 1 });
    dec.push(flushed(hello));
    expect(errorKind(() => dec.push(rawEnvelope(SHARED, connRec(1, raw("x")))))).toBe("wrong_direction");
  });

  test("v4 HELLO_ACK를 받은 게이트웨이 측 디코더 = version_mismatch(엄격)", () => {
    const dec = createGatewaySideDecoder(() => {});
    const p = Buffer.alloc(10);
    p.writeUInt16LE(4, 0);
    expect(errorKind(() => dec.push(rawEnvelope(IPC_MSG.HELLO_ACK, p)))).toBe("version_mismatch");
  });
});
