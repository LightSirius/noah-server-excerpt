// 클라 와이어 프레임 헤더 단일 정의(server/src/net/wireFrame.ts) — 현행 v2 바이트 배치 고정([len u16 LE][id u16 LE], B1) + 원본
// (Buffer·Uint8Array·링 버퍼)별 판독 일치 + 연접 진단(countFrames·firstPacketId) + 구 v1 클라 거절 보조(HELLO 서명·v1 형식 KICK) + 구 JSON KICK
// 클라(B1~B2b) 업데이트 안내 고정 프레임(B3b).

import { describe, expect, test } from "bun:test";
import { RingByteBuffer } from "../../../server/src/net/ringBuffer";
import { PACKET_ID } from "../../../server/src/net/codec.generated";
import {
  DELTA_ACK_OFFSET,
  FRAME_HEADER_BYTES,
  LEGACY_JSON_KICK_FRAME,
  LEGACY_KICK_DETAIL,
  LEGACY_KICK_FRAME,
  MAX_FRAME_BODY_BYTES,
  countFrames,
  encodeFrame,
  firstPacketId,
  frameBodyLenAt,
  framePacketIdAt,
  isLegacyHelloHeader,
  readsLegacyJsonKick,
  writeFrameHeader,
} from "../../../server/src/net/wireFrame";
import { decodeBody } from "../../../server/src/net/wireCodec.generated";
import { WireEncodeError, lastDecodeError, wireErrorName } from "../../../server/src/net/wire/runtime";
import { PROTO_VERSION } from "../../../server/src/net/codec.generated";
import { IPC_CLIENT_FRAME_MIN_BYTES } from "../../../server/src/cluster/ipcSchema";
import { encodePacket, writePacket } from "../../../server/src/network/packetWriter";
import schema from "../../../shared/schema/packets.json";

describe("wireFrame — v2 헤더 [len u16 LE][id u16 LE]", () => {
  test("헤더 바이트 배치", () => {
    expect(FRAME_HEADER_BYTES).toBe(4);
    const out = Buffer.alloc(FRAME_HEADER_BYTES);
    writeFrameHeader(out, 0, 0x1234, 0xbeef);
    expect([...out]).toEqual([0xef, 0xbe, 0x34, 0x12]);
  });

  test("body 상한 = len(u16) 용량: 0xFFFF까지 쓰고 넘으면 RangeError(부분 바이트 없음)", () => {
    expect(MAX_FRAME_BODY_BYTES).toBe(0xffff);
    const out = Buffer.alloc(FRAME_HEADER_BYTES);
    writeFrameHeader(out, 0, 1, MAX_FRAME_BODY_BYTES);
    expect(frameBodyLenAt(out, 0)).toBe(0xffff);
    const untouched = Buffer.alloc(FRAME_HEADER_BYTES, 0x5a);
    expect(() => writeFrameHeader(untouched, 0, 1, MAX_FRAME_BODY_BYTES + 1)).toThrow(RangeError);
    expect([...untouched]).toEqual(new Array(FRAME_HEADER_BYTES).fill(0x5a));
    expect(() => encodeFrame(1, Buffer.alloc(MAX_FRAME_BODY_BYTES + 1))).toThrow(RangeError);
    // 스키마 패킷은 B5①b부터 전부 바이너리 — 최악 본문 ≤ 65535(gen이 강제)라 넘는 값은 프레임 전에 WireEncodeError(원시 본문만 RangeError).
    expect(() => writePacket(PACKET_ID.KICK, { reason: 1, detail: "x".repeat(MAX_FRAME_BODY_BYTES) })).toThrow(WireEncodeError);
  });

  test("파생 상수 — DELTA ackSeq 자리 = 헤더 + 본문 4, IPC 완성 프레임 하한 = 헤더", () => {
    expect(DELTA_ACK_OFFSET).toBe(FRAME_HEADER_BYTES + 4);
    expect(IPC_CLIENT_FRAME_MIN_BYTES).toBe(FRAME_HEADER_BYTES);
    const delta = writePacket(PACKET_ID.SNAPSHOT_DELTA, { tickIndex: 9, ackSeq: 0xabcdef01, updates: [] });
    expect(delta.readUInt32LE(DELTA_ACK_OFFSET)).toBe(0xabcdef01);
  });
});

describe("wireFrame — 인코딩·판독", () => {
  test("encodeFrame = 헤더 + 본문 복사, encodePacket(바이너리)과 같은 바이트", () => {
    // B5①b CHAR_LIST(종전 JSON 경로 대표의 자리) — chars u16 1 + charId i32 + name(u16 3 + "별" UTF-8 3바이트) + level·zoneId i32.
    const list = { chars: [{ charId: 7, name: "별", level: 2, zoneId: 1 }] };
    const body = Buffer.from([1, 0, 7, 0, 0, 0, 3, 0, 0xeb, 0xb3, 0x84, 2, 0, 0, 0, 1, 0, 0, 0]);
    const frame = encodeFrame(PACKET_ID.CHAR_LIST, body);
    expect(frame.equals(encodePacket(PACKET_ID.CHAR_LIST, list))).toBe(true);
    expect(framePacketIdAt(frame, 0)).toBe(PACKET_ID.CHAR_LIST);
    expect(frameBodyLenAt(frame, 0)).toBe(body.length);
    expect(frame.subarray(FRAME_HEADER_BYTES).equals(body)).toBe(true);
    // 바이너리 KICK(B3b — reason i32 LE + detail u16 길이 + UTF-8).
    const kick = { reason: 1, detail: "x" };
    const kickBody = Buffer.from([1, 0, 0, 0, 1, 0, 0x78]);
    expect(encodeFrame(PACKET_ID.KICK, kickBody).equals(encodePacket(PACKET_ID.KICK, kick))).toBe(true);
    // 바이너리 GOLD_UPDATE(B4 — gold·delta i32 LE).
    const goldBody = Buffer.from([7, 0, 0, 0, 0xff, 0xff, 0xff, 0xff]);
    expect(encodeFrame(PACKET_ID.GOLD_UPDATE, goldBody).equals(encodePacket(PACKET_ID.GOLD_UPDATE, { gold: 7, delta: -1 }))).toBe(true);
    // 바이너리(B2b PING — f64 LE 8바이트).
    const pingBody = Buffer.alloc(8);
    pingBody.writeDoubleLE(7, 0);
    expect(encodeFrame(PACKET_ID.PING, pingBody).equals(encodePacket(PACKET_ID.PING, { clientTimeMs: 7 }))).toBe(true);
  });

  test("Buffer·순수 Uint8Array·링 버퍼가 같은 값을 읽는다(오프셋 포함)", () => {
    const stream = Buffer.concat([Buffer.from([0xaa]), encodeFrame(0xfffe, Buffer.alloc(300, 1))]);
    const u8 = new Uint8Array(stream);
    const ring = new RingByteBuffer();
    ring.appendChunk(stream);
    for (const src of [stream, u8]) {
      expect(framePacketIdAt(src, 1)).toBe(0xfffe);
      expect(frameBodyLenAt(src, 1)).toBe(300);
    }
    ring.consume(1);
    expect(framePacketIdAt(ring, 0)).toBe(0xfffe);
    expect(frameBodyLenAt(ring, 0)).toBe(300);
  });

  test("헤더가 원본 밖이면 RangeError(링 버퍼는 자체 검사로 throw)", () => {
    const short = Buffer.alloc(FRAME_HEADER_BYTES - 1);
    expect(() => frameBodyLenAt(Buffer.alloc(1), 0)).toThrow(RangeError);
    expect(() => framePacketIdAt(short, 0)).toThrow(RangeError);
    expect(() => framePacketIdAt(short, FRAME_HEADER_BYTES)).toThrow(RangeError);
    const ring = new RingByteBuffer();
    ring.appendChunk(short);
    expect(() => framePacketIdAt(ring, 0)).toThrow();
  });
});

describe("wireFrame — 연접 진단", () => {
  test("countFrames는 완성·부분 프레임을 세고 헤더 미만 꼬리는 무시, firstPacketId는 첫 프레임", () => {
    const a = encodeFrame(PACKET_ID.PONG, Buffer.alloc(3));
    const b = encodeFrame(PACKET_ID.KICK, Buffer.alloc(0));
    expect(countFrames(Buffer.concat([a, b]))).toBe(2);
    expect(countFrames(Buffer.concat([a, b, Buffer.alloc(FRAME_HEADER_BYTES - 1)]))).toBe(2);
    expect(countFrames(Buffer.alloc(0))).toBe(0);
    expect(firstPacketId(Buffer.concat([b, a]))).toBe(PACKET_ID.KICK);
    expect(firstPacketId(Buffer.alloc(3))).toBe(0);
  });
});

/** 구 v1 HELLO 프레임 — [id u16 BE][len u32 BE] + JSON(구 클라가 실제로 보내던 바이트). */
function legacyHello(): Buffer {
  const body = Buffer.from(JSON.stringify({ clientProtoVer: 2, clientBuildHash: 0 }), "utf8");
  const out = Buffer.alloc(6 + body.length);
  out.writeUInt16BE(PACKET_ID.HELLO, 0);
  out.writeUInt32BE(body.length, 2);
  body.copy(out, 6);
  return out;
}

describe("wireFrame — 구 v1 클라 거절 보조", () => {
  test("v1 HELLO의 앞 4바이트는 v2로 읽으면 len 0x0100·id 0(예약) — 서명으로 알아본다", () => {
    const v1 = legacyHello();
    expect([framePacketIdAt(v1, 0), frameBodyLenAt(v1, 0)]).toEqual([0, 0x0100]);
    expect(isLegacyHelloHeader(v1, 0)).toBe(true);
    const ring = new RingByteBuffer();
    ring.appendChunk(v1.subarray(0, FRAME_HEADER_BYTES));
    expect(isLegacyHelloHeader(ring, 0)).toBe(true);
  });

  test("v2 프레임은 서명에 걸리지 않는다(id 0은 스키마가 거부해 정상 클라는 보내지 않는다)", () => {
    for (const id of Object.values(PACKET_ID)) {
      expect(id).not.toBe(0);
      expect(isLegacyHelloHeader(encodeFrame(id, Buffer.alloc(0x0100)), 0)).toBe(false);
    }
    expect(isLegacyHelloHeader(encodeFrame(0, Buffer.alloc(0xff)), 0)).toBe(false);
  });

  test("LEGACY_KICK_FRAME = v1 헤더 + KICK 1 JSON(구 클라가 디코드해 업데이트 안내를 띄운다)", () => {
    const f = LEGACY_KICK_FRAME;
    expect(f.readUInt16BE(0)).toBe(PACKET_ID.KICK);
    expect(f.readUInt32BE(2)).toBe(f.length - 6);
    expect(JSON.parse(f.subarray(6).toString("utf8"))).toEqual({ reason: 1, detail: "client update required" });
  });
});

describe("wireFrame — 구 JSON KICK 클라 업데이트 안내(B3b)", () => {
  test("LEGACY_JSON_KICK_FRAME = v2 헤더 + B3b 전 KICK 1 JSON 본문(v1 프레임과 같은 본문)", () => {
    const f = LEGACY_JSON_KICK_FRAME;
    expect(framePacketIdAt(f, 0)).toBe(PACKET_ID.KICK);
    expect(frameBodyLenAt(f, 0)).toBe(f.length - FRAME_HEADER_BYTES);
    expect(f.subarray(FRAME_HEADER_BYTES).toString("utf8")).toBe('{"reason":1,"detail":"client update required"}');
    expect(f.subarray(FRAME_HEADER_BYTES).equals(LEGACY_KICK_FRAME.subarray(6))).toBe(true);
    expect(LEGACY_KICK_DETAIL).toBe("client update required");
  });

  test("현행 클라의 바이너리 KICK 디코더에는 읽히지 않는다(OverMax — 받을 일이 없다: HELLO 판정이 구 클라에만 보낸다)", () => {
    expect(decodeBody(PACKET_ID.KICK, LEGACY_JSON_KICK_FRAME.subarray(FRAME_HEADER_BYTES))).toBeNull();
    expect(wireErrorName(lastDecodeError())).toBe("OverMax");
  });

  test("readsLegacyJsonKick — v2 프레이밍(B1, 3)부터 JSON KICK 마지막 버전(B2b, 5)까지만", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, -1].map(readsLegacyJsonKick)).toEqual([false, false, false, true, true, true, false, false, false]);
    expect(readsLegacyJsonKick(PROTO_VERSION)).toBe(false);
  });
});

describe("wireFrame ↔ packets.json header 블록", () => {
  test("스키마 header 블록이 이 모듈과 같은 헤더를 말한다(세 번째 사본이 낡지 않게)", () => {
    const h = schema.header;
    expect(h.format).toBe("v2");
    expect(h.id_bytes + h.len_bytes).toBe(FRAME_HEADER_BYTES);
    expect(h.endian).toBe("little");
    expect(h.order).toEqual(["len", "id"]);
  });
});
