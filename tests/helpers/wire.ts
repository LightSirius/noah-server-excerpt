// 테스트 공용 클라 와이어 헬퍼 — 프레임 인코딩·디코딩을 한 곳에 모은다. 헤더 형식은 server/src/net/wireFrame.ts만 알고,
// 본문 인코딩은 서버 writePacket(생성 바이너리 코덱 wireCodec.generated.ts — 모든 패킷)을 그대로 써서 서버가 내는 바이트와 같다. 스키마 밖 id는
// 인코드·디코드 모두 명시 오류다(JSON 폴백 없음 — 이진 전환 B6). 잘못된 프레임(크기 폭탄·깨진 본문)을 만드는 테스트는 encodeRaw·headerOnly로 원시 바이트를 만든다.

import { PACKET_DIRECTION, PROTO_VERSION, type CharListPayload, type CharSummary, type HelloPayload } from "../../server/src/net/codec.generated";
import { bodySize, decodeBody as decodeBinaryBody, writeBody } from "../../server/src/net/wireCodec.generated";
import { lastDecodeError, wireErrorName } from "../../server/src/net/wire/runtime";
import { encodePacket } from "../../server/src/network/packetWriter";
import {
  DELTA_ACK_OFFSET,
  FRAME_HEADER_BYTES,
  frameBodyLenAt,
  framePacketIdAt,
  writeFrameHeader,
} from "../../server/src/net/wireFrame";

export { DELTA_ACK_OFFSET, FRAME_HEADER_BYTES, PROTO_VERSION, frameBodyLenAt, framePacketIdAt };

/** 디코드한 프레임 — payload는 생성 코덱 디코드 값. */
export interface Frame {
  id: number;
  payload: any;
}

/** 분리만 한 프레임 — body는 원본 버퍼의 뷰. */
export interface RawFrame {
  id: number;
  body: Buffer;
}

/** 패킷 1개 = 서버 writePacket과 같은 바이트(생성 코덱 — 스키마 밖 id는 WireEncodeError). */
export function encode(packetId: number, payload: object): Buffer {
  return encodePacket(packetId, payload);
}

/** 본문만(헤더 없음) — writePacket 프레임의 본문과 같은 바이트(SNAPSHOT_DELTA 머리 판독 시험 등). 스키마 밖 id는 WireEncodeError. */
export function encodeBody(packetId: number, payload: object): Buffer {
  const out = Buffer.allocUnsafe(bodySize(packetId, payload));
  writeBody(packetId, payload, out, 0);
  return out;
}

/** 원시 본문으로 프레임 1개(깨진 본문·크기 위반 등 — body ≤ 0xFFFF는 헤더 len(u16) 용량). */
export function encodeRaw(packetId: number, body: Uint8Array): Buffer {
  const out = Buffer.allocUnsafe(FRAME_HEADER_BYTES + body.length);
  writeFrameHeader(out, 0, packetId, body.length);
  out.set(body, FRAME_HEADER_BYTES);
  return out;
}

/** 구 v1 프레임 [id u16 BE][len u32 BE] + JSON — 구 클라 거절 시험 전용(B1 이전 클라가 보내던 바이트, 헤더 형식 v1은 여기에만). */
export function legacyV1Frame(packetId: number, payload: object): Buffer {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const out = Buffer.alloc(6 + body.length);
  out.writeUInt16BE(packetId, 0);
  out.writeUInt32BE(body.length, 2);
  body.copy(out, 6);
  return out;
}

/** 헤더만(본문 없음) — 길이 필드만 주장하는 크기 폭탄 등. */
export function headerOnly(packetId: number, bodyLength: number): Buffer {
  const out = Buffer.alloc(FRAME_HEADER_BYTES);
  writeFrameHeader(out, 0, packetId, bodyLength);
  return out;
}

/** 본문 디코드 — 생성 코덱(깨진 본문·스키마 밖 id는 사유와 함께 throw — 프레이밍 버그를 숨기지 않게). */
export function decodeBody(packetId: number, body: Buffer): any {
  if (PACKET_DIRECTION[packetId] === undefined) throw new Error(`unknown packet id 0x${packetId.toString(16)} (not in schema)`);
  const p = decodeBinaryBody(packetId, body);
  if (p === null) throw new Error(`binary body decode failed (packet 0x${packetId.toString(16)}): ${wireErrorName(lastDecodeError())}`);
  return p;
}

/** 완성 프레임만 분리(디코드 없음). rest = 헤더 미완성이거나 본문이 덜 온 꼬리. */
export function splitFrames(buf: Buffer): { frames: RawFrame[]; rest: Buffer } {
  const frames: RawFrame[] = [];
  let off = 0;
  while (buf.length - off >= FRAME_HEADER_BYTES) {
    const len = frameBodyLenAt(buf, off);
    if (buf.length - off < FRAME_HEADER_BYTES + len) break;
    const start = off + FRAME_HEADER_BYTES;
    frames.push({ id: framePacketIdAt(buf, off), body: buf.subarray(start, start + len) });
    off = start + len;
  }
  return { frames, rest: buf.subarray(off) };
}

/** 수신 스트림 → 완성 프레임 디코드 + 남은 꼬리(다음 청크와 이어 붙일 것). */
export function decodeStream(buf: Buffer): { frames: Frame[]; rest: Buffer } {
  const { frames, rest } = splitFrames(buf);
  return { frames: frames.map((f) => ({ id: f.id, payload: decodeBody(f.id, f.body) })), rest };
}

/** 완성 프레임만 있어야 하는 바이트(게이트웨이 DELIVER·다 비운 송신)를 디코드 — 잘린 꼬리가 있으면 throw(반쪽 프레임 버그를 숨기지 않게). */
export function decodeAll(buf: Buffer): Frame[] {
  const { frames, rest } = decodeStream(buf);
  if (rest.length > 0) throw new Error(`truncated frame tail: ${rest.length} bytes after ${frames.length} frames`);
  return frames;
}

/** 첫 완성 프레임만 디코드(없으면 undefined) — 뒤 바이트는 보지 않는다. */
export function firstFrame(buf: Buffer): Frame | undefined {
  if (buf.length < FRAME_HEADER_BYTES) return undefined;
  const len = frameBodyLenAt(buf, 0);
  if (buf.length < FRAME_HEADER_BYTES + len) return undefined;
  const id = framePacketIdAt(buf, 0);
  return { id, payload: decodeBody(id, buf.subarray(FRAME_HEADER_BYTES, FRAME_HEADER_BYTES + len)) };
}

/**
 * CHAR_LIST.chars = CharSummary[](이진 전환 B5①b binary 디코드 값 — x·y 없음). ①a에 형태 변경 전후(JSON 문자열·배열)를 함께 받던 헬퍼를
 * ①b에서 `p.chars`로 줄였다 — 시험 18곳 + 미니 골든이 이 헬퍼만 쓴다(다음 형태 변경도 한 곳만 고치면 된다).
 */
export function charsOf(p: CharListPayload): CharSummary[] {
  return p.chars;
}

/** HELLO 페이로드 — 기본은 현행 프로토콜 버전·빌드 해시 0. 불일치 시험은 overrides로. */
export function helloPayload(overrides: Partial<HelloPayload> = {}): HelloPayload {
  return { clientProtoVer: PROTO_VERSION, clientBuildHash: 0, ...overrides };
}
