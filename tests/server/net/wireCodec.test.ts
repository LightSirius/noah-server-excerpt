// 생성 바이너리 코덱(server/src/net/wireCodec.generated.ts) — 실물 스키마의 SNAPSHOT_DELTA + 디스패치(B2b: C2S 전부 바이너리).
// (1) 생성 코덱 ≡ 참조 인터프리터(tools/codegen/refCodec.ts) — 무작위 왕복·변조 퍼징·잘림, (2) 종전 net/binaryCodec.ts 시험(삭제)의 사례와
// 현행 바이트 배치 고정, (3) 디코드 거부 사유, (4) 인코드 거부(WireEncodeError), (5) 디스패치(decodeC2S 보안 경계 퍼징 포함)·writePacket·
// 세션 outbox 경로. 패킷별 코덱 사례는 교차 언어 골든(tests/server/codegen/wireGolden.test.ts)이 모든 바이너리 패킷을 덮는다.
// optional·enum·string·bool 등 SNAPSHOT_DELTA가 안 쓰는 기능은 tests/server/codegen/emitFixture.test.ts가 합성 스키마로 같은 대조를 한다.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSchema } from "../../../tools/codegen/schema";
import { refDecode, refEncode } from "../../../tools/codegen/refCodec";
import * as wireCodec from "../../../server/src/net/wireCodec.generated";
import {
  bodySize,
  decodeBody,
  decodeC2S,
  decodeSnapshotDelta,
  sizeSnapshotDelta,
  writeBody,
  writeSnapshotDelta,
} from "../../../server/src/net/wireCodec.generated";
import { MAX_BODY_BYTES, PACKET_DIRECTION, PACKET_ID, SNAPSHOT_DELTA_UPDATES_MAX, type SnapshotDeltaPayload } from "../../../server/src/net/codec.generated";
import { NO_CODEC, WireEncodeError, bodyReader, lastDecodeError, wireErrorName } from "../../../server/src/net/wire/runtime";
import { writePacket } from "../../../server/src/network/packetWriter";
import { FrameOutbox } from "../../../server/src/network/frameOutbox";
import { FRAME_HEADER_BYTES } from "../../../server/src/net/wireFrame";

const ast = parseSchema(JSON.parse(readFileSync(resolve(import.meta.dir, "../../../shared/schema/packets.json"), "utf8")));
const DELTA = PACKET_ID.SNAPSHOT_DELTA;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
}

function randDelta(r: () => number, maxN = 40): SnapshotDeltaPayload {
  const n = r() < 0.1 ? 0 : Math.floor(r() * maxN);
  const u32 = (): number => (r() < 0.1 ? 0xffffffff : Math.floor(r() * 0x100000000));
  const coord = (): number => (r() < 0.1 ? [-0, 0, 3.4028234663852886e38, 1.401298464324817e-45][Math.floor(r() * 4)]! : Math.fround((r() - 0.5) * 2048));
  return {
    tickIndex: u32(),
    ackSeq: u32(),
    updates: Array.from({ length: n }, () => ({ entityId: u32(), x: coord(), y: coord() })),
  };
}

function encodeBody(p: SnapshotDeltaPayload): Buffer {
  const out = Buffer.alloc(sizeSnapshotDelta(p));
  expect(writeSnapshotDelta(p, out, 0)).toBe(out.length);
  return out;
}

/** C2S 패킷마다 스키마에 맞는 대표 페이로드(문자열은 한글 포함·max 이하, optional 하나는 생략). */
function sampleC2S(name: string): Record<string, unknown> {
  if (name === "STAT_ALLOCATE") return { requestId: 7, allocations: [{ code: "atk", points: 7 }] }; // struct 배열 C2S(1).
  if (name === "GATHER_TRACE") return { channelId: 7, cycle: 1, pressMs: 300, tailMs: 9, samples: [{ x: 300, y: 80 }, { x: 301, y: 98 }] }; // struct 배열 C2S(2).
  if (name === "GATHER_TAPS") return { channelId: 7, taps: [{ cycle: 1, ms: 300, x: 300, y: 80 }, { cycle: 1, ms: 950, x: 600, y: 0 }] }; // struct 배열 C2S(3) — 끝은 헛클릭 표시.
  const p = ast.packets.find((x) => x.name === name)!;
  const out: Record<string, unknown> = {};
  let skipped = false;
  for (const f of p.fields) {
    if (f.optional && !skipped) {
      skipped = true;
      continue;
    }
    if (f.type.kind === "array") out[f.name] = Array.from({ length: f.min ?? 1 }, (_, i) => i + 1);
    else if (f.type.kind === "prim" && f.type.prim === "string") out[f.name] = "가a".slice(0, Math.min(2, f.max ?? 2));
    else if (f.type.kind === "prim" && (f.type.prim === "f32" || f.type.prim === "f64")) out[f.name] = 1.5;
    else if (f.type.kind === "enum") out[f.name] = ast.enums.get(f.type.name)!.values[0]![0];
    else out[f.name] = 7;
  }
  return out;
}

/** 생성 디코드 결과를 refDecode 모양으로. */
function genDecode(body: Uint8Array): { ok: true; value: unknown } | { ok: false; error: string } {
  const v = decodeSnapshotDelta(body);
  return v === null ? { ok: false, error: wireErrorName(lastDecodeError()) } : { ok: true, value: v };
}

describe("SNAPSHOT_DELTA 생성 코덱 ≡ refCodec", () => {
  test("무작위 왕복 1,000 — 같은 바이트, 같은 디코드 값", () => {
    const r = rng(7);
    for (let i = 0; i < 1000; i++) {
      const p = randDelta(r);
      const body = encodeBody(p);
      expect(body.equals(Buffer.from(refEncode(ast, "SNAPSHOT_DELTA", p)))).toBe(true);
      expect(genDecode(body)).toEqual({ ok: true, value: p });
    }
  });

  test("변조 퍼징 5,000·전 길이 잘림 — 같은 결과(값 또는 첫 오류)", () => {
    const r = rng(11);
    for (let i = 0; i < 5000; i++) {
      const b = Buffer.from(encodeBody(randDelta(r, 6)));
      const k = r();
      let m: Buffer;
      if (k < 0.6 && b.length > 0) {
        b[Math.floor(r() * b.length)] = Math.floor(r() * 256);
        m = b;
      } else if (k < 0.8) m = b.subarray(0, Math.floor(r() * b.length));
      else m = Buffer.concat([b, Buffer.from([Math.floor(r() * 256)])]);
      expect(genDecode(m)).toEqual(refDecode(ast, "SNAPSHOT_DELTA", m));
    }
    const full = encodeBody(randDelta(rng(3), 5));
    for (let len = 0; len < full.length; len++) {
      expect(genDecode(full.subarray(0, len))).toEqual(refDecode(ast, "SNAPSHOT_DELTA", full.subarray(0, len)));
    }
  });
});

describe("현행 바이트 배치 — [tick u32][ack u32][count u16][N × {id u32, x f32, y f32}] LE (종전 binaryCodec 사례)", () => {
  test("빈 updates = 머리 10바이트", () => {
    const body = encodeBody({ tickIndex: 0, ackSeq: 0, updates: [] });
    expect(body.length).toBe(10);
    expect(decodeSnapshotDelta(body)).toEqual({ tickIndex: 0, ackSeq: 0, updates: [] });
  });

  test("단일 update — 손 계산 바이트", () => {
    const body = encodeBody({ tickIndex: 42, ackSeq: 7, updates: [{ entityId: 1, x: 100.5, y: 200.25 }] });
    expect(body.toString("hex")).toBe("2a000000" + "07000000" + "0100" + "01000000" + "0000c942" + "00404843");
  });

  test("100개 — 10 + 1200바이트, JSON의 2.5분의 1 이하", () => {
    const p = { tickIndex: 600, ackSeq: 42, updates: Array.from({ length: 100 }, (_, i) => ({ entityId: i + 1, x: i * 1.5, y: i * 2.25 })) };
    const body = encodeBody(p);
    expect(body.length).toBe(10 + 100 * 12);
    expect(Buffer.byteLength(JSON.stringify(p))).toBeGreaterThan(body.length * 2.5);
    expect(decodeSnapshotDelta(body)!.updates[50]!.entityId).toBe(51);
  });

  test("스키마 max(5460)까지 = 65530바이트 = MAX_BODY_BYTES", () => {
    const p = { tickIndex: 1, ackSeq: 1, updates: Array.from({ length: SNAPSHOT_DELTA_UPDATES_MAX }, (_, i) => ({ entityId: i, x: 0, y: 0 })) };
    expect(bodySize(DELTA, p)).toBe(65530);
    expect(MAX_BODY_BYTES[DELTA]).toBe(65530);
    expect(decodeSnapshotDelta(encodeBody(p))!.updates).toHaveLength(SNAPSHOT_DELTA_UPDATES_MAX);
  });
});

describe("디코드 거부 — null + 사유(예외 없음)", () => {
  const reason = (b: Uint8Array): string => (decodeSnapshotDelta(b) === null ? wireErrorName(lastDecodeError()) : "ok");
  const head = (count: number): Buffer => {
    const b = Buffer.alloc(10);
    b.writeUInt32LE(1, 0);
    b.writeUInt32LE(2, 4);
    b.writeUInt16LE(count, 8);
    return b;
  };

  test("머리 미만·원소 모자람 = Truncated, 남는 바이트 = Trailing", () => {
    expect(reason(Buffer.alloc(5))).toBe("Truncated");
    expect(reason(Buffer.concat([head(2), Buffer.alloc(12)]))).toBe("Truncated");
    expect(reason(Buffer.concat([head(1), Buffer.alloc(13)]))).toBe("Trailing");
  });

  test("count > 5460 = OverMax — 원소 바이트를 보기 전에", () => {
    expect(reason(head(5461))).toBe("OverMax");
    expect(reason(head(0xffff))).toBe("OverMax");
  });

  test("좌표 NaN·±Inf = NonFinite", () => {
    for (const bits of [0x7fc00000, 0x7f800000, 0xff800000]) {
      const b = Buffer.concat([head(1), Buffer.alloc(12)]);
      b.writeUInt32LE(bits, 10 + 8);
      expect(reason(b)).toBe("NonFinite");
    }
  });

  test("decodeBody 디스패치 = decodeSnapshotDelta, 실패 뒤 성공은 사유를 지운다", () => {
    expect(decodeBody(DELTA, Buffer.alloc(3))).toBeNull();
    expect(lastDecodeError()).not.toBe(0);
    expect(decodeBody(DELTA, head(0))).toEqual({ tickIndex: 1, ackSeq: 2, updates: [] });
    expect(lastDecodeError()).toBe(0);
  });
});

describe("인코드 거부 — WireEncodeError(프레임을 만들기 전)", () => {
  const ok: SnapshotDeltaPayload = { tickIndex: 1, ackSeq: 2, updates: [{ entityId: 3, x: 1, y: 2 }] };
  test.each([
    ["tick 음수", { ...ok, tickIndex: -1 }],
    ["tick u32 초과", { ...ok, tickIndex: 2 ** 32 }],
    ["ack 소수", { ...ok, ackSeq: 1.5 }],
    ["entityId u32 초과", { ...ok, updates: [{ entityId: 2 ** 32 + 3, x: 0, y: 0 }] }],
    ["entityId 소수", { ...ok, updates: [{ entityId: 1.5, x: 0, y: 0 }] }],
    ["x NaN", { ...ok, updates: [{ entityId: 1, x: Number.NaN, y: 0 }] }],
    ["y f32 오버플로(1e39)", { ...ok, updates: [{ entityId: 1, x: 0, y: 1e39 }] }],
    ["updates 5461개", { ...ok, updates: Array.from({ length: 5461 }, () => ({ entityId: 1, x: 0, y: 0 })) }],
    ["updates 원소 null", { ...ok, updates: [null as unknown as SnapshotDeltaPayload["updates"][number]] }],
  ])("%s", (_n, p) => {
    expect(() => bodySize(DELTA, p)).toThrow(WireEncodeError);
    expect(() => refEncode(ast, "SNAPSHOT_DELTA", p)).toThrow();
    expect(() => writePacket(DELTA, p)).toThrow(WireEncodeError);
  });
});

describe("디스패치·송신 경로", () => {
  test("디스패치 = 스키마 패킷 전부(B6 — isBinaryPacket·BINARY_PACKET_IDS 폐지, 스키마 안 id 판정은 PACKET_DIRECTION)", () => {
    expect(Object.keys(wireCodec).filter((k) => /binary/i.test(k) && !/snapshot/i.test(k))).toEqual([]);
    expect(Object.keys(PACKET_DIRECTION).map(Number).sort((a, b) => a - b)).toEqual(ast.packets.map((p) => p.id).sort((a, b) => a - b));
    // 모든 id에 생성 코덱이 있다 — 빈 본문은 값(필드 없는 패킷) 또는 위반 사유를 낸다. 디스패치 default(스키마 밖 id)는
    // reader를 건드리지 않아 직전 사유가 남으므로 id마다 사유를 먼저 지운다(대조군: 스키마 밖 id는 null·사유 0).
    const dispatched = (id: number): boolean => {
      bodyReader.reset(new Uint8Array(0));
      return decodeBody(id, new Uint8Array(0)) !== null || lastDecodeError() !== 0;
    };
    expect(dispatched(0x7ffe)).toBe(false);
    for (const p of ast.packets) {
      expect([p.name, dispatched(p.id)]).toEqual([p.name, true]);
      expect(() => bodySize(p.id, {})).not.toThrow(/unknown packet/);
    }
  });

  test("decodeC2S — C2S만 디코드(실패 = null), S2C id·미지 id는 NO_CODEC", () => {
    // 구 클라의 JSON 본문 "{}"(2바이트)는 어떤 C2S로도 유효하지 않다(빈 본문 = Trailing, 그 외 Truncated·BadPresence).
    for (const p of ast.packets) expect(decodeC2S(p.id, Buffer.from("{}"))).toBe(p.direction === "S2C" ? NO_CODEC : null);
    expect(decodeC2S(0xbeef, Buffer.alloc(0))).toBe(NO_CODEC);
    expect(decodeC2S(PACKET_ID.ATTACK_START, Buffer.alloc(0))).toEqual({});
  });

  test("decodeC2S 보안 경계 퍼징 — C2S마다 refCodec과 같은 결과(값 또는 첫 오류), 예외 없음", () => {
    const r = rng(2026);
    for (const p of ast.packets.filter((x) => x.direction === "C2S")) {
      const valid = Buffer.from(refEncode(ast, p.name, sampleC2S(p.name)));
      const cases: Buffer[] = [valid, Buffer.concat([valid, Buffer.from([0])])];
      for (let len = 0; len < valid.length; len++) cases.push(valid.subarray(0, len));
      for (let i = 0; i < 300; i++) {
        const m = Buffer.from(valid);
        if (m.length > 0) m[Math.floor(r() * m.length)] = Math.floor(r() * 256);
        cases.push(m);
        cases.push(Buffer.from(Array.from({ length: Math.floor(r() * 24) }, () => Math.floor(r() * 256))));
      }
      for (const b of cases) {
        const got = decodeC2S(p.id, b);
        const ref = refDecode(ast, p.name, b);
        if (ref.ok) expect(got).toEqual(ref.value as object);
        else expect([got, wireErrorName(lastDecodeError())]).toEqual([null, ref.error]);
      }
    }
  });

  test("스키마 밖 id — bodySize·writeBody·writePacket은 거부(JSON 폴백 없음 — B6), decodeBody는 null", () => {
    expect(() => bodySize(0x7ffe, {})).toThrow(/packet 0x7ffe: unknown packet/);
    expect(() => writePacket(0x7ffe as typeof DELTA, {} as SnapshotDeltaPayload)).toThrow(WireEncodeError);
    const ob = new FrameOutbox();
    expect(() => ob.appendPayload(0x7ffe, {})).toThrow(WireEncodeError);
    expect([ob.frameCount, ob.byteLength]).toEqual([0, 0]);
    expect(() => writeBody(0x7ffe, {}, Buffer.alloc(8), 0)).toThrow(WireEncodeError);
    expect(decodeBody(0x7ffe, Buffer.from("{}"))).toBeNull();
  });

  test("writePacket = 헤더(wireFrame) + 생성 코덱 본문(B5①b부터 S2C 전부)", () => {
    const p = { tickIndex: 42, ackSeq: 7, updates: [{ entityId: 1, x: 100.5, y: 200.25 }] };
    const frame = writePacket(DELTA, p);
    expect(frame.toString("hex")).toBe("1600" + "0101" + encodeBody(p).toString("hex")); // v2 헤더 [len u16 LE][id u16 LE]
    // B4 GOLD_UPDATE = i32 LE 두 개(8바이트).
    const gold = writePacket(PACKET_ID.GOLD_UPDATE, { gold: 5, delta: -6 });
    expect([gold.length - FRAME_HEADER_BYTES, gold.readInt32LE(FRAME_HEADER_BYTES), gold.readInt32LE(FRAME_HEADER_BYTES + 4)]).toEqual([8, 5, -6]);
    // B5②b INVENTORY_UPDATE = bodyOf INVENTORY_LIST — 본문 바이트가 같고 헤더 id만 다르다(slots u16 + 원소 12 B + 장비 32 B).
    const inv = { slots: [{ slot: 3, itemId: 1000, qty: 18 }], equipment: { weapon: 101, shield: 0, helmet: 0, armor: 0, gloves: 0, boots: 0, accessory1: 0, accessory2: 0 } };
    const list = writePacket(PACKET_ID.INVENTORY_LIST, inv);
    const upd = writePacket(PACKET_ID.INVENTORY_UPDATE, inv);
    expect(list.length - FRAME_HEADER_BYTES).toBe(2 + 12 + 32);
    expect(upd.subarray(FRAME_HEADER_BYTES).equals(list.subarray(FRAME_HEADER_BYTES))).toBe(true);
    expect([list.readUInt16LE(2), upd.readUInt16LE(2)]).toEqual([PACKET_ID.INVENTORY_LIST, PACKET_ID.INVENTORY_UPDATE]);
    // B5③b UI_PREFERENCES = quickSlots(u16 6 + i32 × 6) | trackedQuestIds(u16 n + i32 × n) | hasSavedSettings bool — 추적 1개 33 B, 퀵슬롯 개수 ≠ 6은 인코드 거부.
    const prefs = writePacket(PACKET_ID.UI_PREFERENCES, { quickSlots: [1, 2, 3, 0, 0, 0], trackedQuestIds: [7000], hasSavedSettings: true });
    expect(prefs.subarray(FRAME_HEADER_BYTES).toString("hex")).toBe("0600" + "01000000" + "02000000" + "03000000" + "00000000".repeat(3) + "0100" + "581b0000" + "01");
    expect(() => writePacket(PACKET_ID.UI_PREFERENCES, { quickSlots: [1, 2, 3], trackedQuestIds: [], hasSavedSettings: false })).toThrow(WireEncodeError);
    // B5④b QUEST_ACTION_ACK = presence u8(비트 0 rewards) | op·questId·errCode i32 | [rewards] — 키 부재 = 비트 0, 있으면 요약(i32 × 4 + items u16 + 원소 9 B).
    const ackFail = writePacket(PACKET_ID.QUEST_ACTION_ACK, { op: 0, questId: 7000, errCode: 4 });
    expect(ackFail.subarray(FRAME_HEADER_BYTES).toString("hex")).toBe("00" + "00000000" + "581b0000" + "04000000");
    const ackOk = writePacket(PACKET_ID.QUEST_ACTION_ACK, {
      op: 1, questId: 7000, errCode: 0, rewards: { exp: 120, sexp: 0, slp: 1, gold: 500, items: [{ itemId: 1000, qty: 3, source: "choice" }] },
    });
    expect(ackOk.subarray(FRAME_HEADER_BYTES).toString("hex")).toBe(
      "01" + "01000000" + "581b0000" + "00000000" + "78000000" + "00000000" + "01000000" + "f4010000" + "0100" + "e8030000" + "03000000" + "01",
    );
    // B5④b NPC_DIALOG — 배열 안 struct마다 자기 presence: DialogOption(비트 0 next·비트 1 action) → DialogAction(비트 0 questId·비트 1 shopId).
    const dialog = writePacket(PACKET_ID.NPC_DIALOG, {
      entityId: 1, npcId: 6001, npcName: "T", dialogueId: 2, entry: "a",
      nodes: [{ id: "a", speaker: "", pages: ["p"], options: [{ label: "x", next: "a" }, { label: "y", action: { type: "open_shop", shopId: 1 } }] }],
    });
    expect(dialog.subarray(FRAME_HEADER_BYTES).toString("hex")).toBe(
      "01000000" + "71170000" + "010054" + "02000000" + "010061" + "0100" +
        "010061" + "0000" + "0100" + "010070" + "0200" +
        "01" + "010078" + "010061" +
        "02" + "010079" + "02" + "09006f70656e5f73686f70" + "01000000",
    );
    // B5①b CHAR_LIST = chars u16 + CharSummary(charId i32 | name u16 + UTF-8 | level·zoneId i32) — 종전 JSON 문자열 형태의 x·y는 없다.
    const chars = writePacket(PACKET_ID.CHAR_LIST, { chars: [{ charId: 1, name: "a", level: 2, zoneId: 3 }] });
    expect(chars.subarray(FRAME_HEADER_BYTES).toString("hex")).toBe("0100" + "01000000" + "0100" + "61" + "02000000" + "03000000");
    // B5①b CHAR_LEVEL_UP = newLevel | statDeltas u16 + CharStatDelta(group·code u8 enum 코드 | valueDelta·valueAfter·xpAfter i32) | hpMaxNew·mpMaxNew.
    const lvl = writePacket(PACKET_ID.CHAR_LEVEL_UP, {
      newLevel: 3, statDeltas: [{ group: "cha", code: "end", valueDelta: 1, valueAfter: 6, xpAfter: 1 }], hpMaxNew: 73, mpMaxNew: 31,
    });
    expect(lvl.subarray(FRAME_HEADER_BYTES).toString("hex")).toBe(
      "03000000" + "0100" + "02" + "07" + "01000000" + "06000000" + "01000000" + "49000000" + "1f000000",
    );
    // B3b PONG = f64 LE 두 개(16바이트).
    const pong = writePacket(PACKET_ID.PONG, { clientTimeMs: 5, serverTimeMs: 6 });
    expect(pong.length - FRAME_HEADER_BYTES).toBe(16);
    expect([pong.readDoubleLE(FRAME_HEADER_BYTES), pong.readDoubleLE(FRAME_HEADER_BYTES + 8)]).toEqual([5, 6]);
  });

  test("세션 outbox — appendPayload = writePacket 바이트, 인코드 거부는 outbox를 건드리지 않는다(커밋 규칙)", () => {
    const box = new FrameOutbox();
    const p = randDelta(rng(99));
    const pong = { clientTimeMs: 1, serverTimeMs: 2 };
    box.appendPayload(DELTA, p);
    box.appendPayload(PACKET_ID.PONG, pong);
    const before = Buffer.from(box.view());
    expect(before.equals(Buffer.concat([writePacket(DELTA, p), writePacket(PACKET_ID.PONG, pong)]))).toBe(true);
    expect(() => box.appendPayload(DELTA, { ...p, tickIndex: -1 })).toThrow(WireEncodeError);
    expect(box.frameCount).toBe(2);
    expect(Buffer.from(box.view()).equals(before)).toBe(true);
  });
});
