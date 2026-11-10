// 클라 와이어 프레임 헤더 — 서버(monolith·월드·게이트웨이)·tools·tests가 헤더 형식을 아는 유일한 곳.
//
// 현행 v2(shared/protocol.md §1, B1): [body_len u16 LE][packet_id u16 LE] 4바이트 + body. body_len은 헤더를 포함하지 않는다(≤ 0xFFFF).
// 헤더 오프셋·바이트 수·엔디언은 여기에만 둔다(파생 상수 DELTA_ACK_OFFSET·cluster/ipcSchema IPC_CLIENT_FRAME_MIN_BYTES·sim/snapshotDelta.ts
// 빠른 경로 정렬 FRAME_BASE도 이 정의에서 나온다). 같이 맞출 곳: 클라 Network/FrameHeader.cs, shared/schema/packets.json의 header 블록
// (tests/server/net/wireFrame.test.ts가 이 모듈과 일치를 고정).
// 구 v1([packet_id u16 BE][body_len u32 BE] 6바이트)은 구 클라 거절에만 남는다: v1 HELLO의 앞 4바이트 `00 01 00 00`은 v2로 읽으면
// len 0x0100·id 0(예약 — 스키마가 거부)이라 첫 프레임에서 알아보고(isLegacyHelloHeader), 구 클라가 읽을 수 있는 v1 형식 KICK 1을
// 보낸 뒤 닫는다(network/clientEdge.ts).
// 구 JSON KICK(이진 전환 B3b): KICK 본문은 B3b(protoVersion 6)부터 바이너리지만 B1~B2b 클라(protoVersion 3~5 — v2 프레이밍, JSON KICK)는 JSON 본문만
// 읽는다. 그들에게 업데이트를 알리는 두 경로(HELLO 버전 불일치·ANON HELLO 디코드 실패)는 v2 헤더 + JSON 본문 고정 프레임(LEGACY_JSON_KICK_FRAME)을 쓴다.
// 의존성은 코드젠 상수(codec.generated.ts — 값 객체뿐)만 — 게이트웨이 import 가드(tests/server/cluster/gatewayImportGuard.test.ts)와 tools가
// 그대로 실을 수 있게.

import { PACKET_ID, SNAPSHOT_DELTA_OFFSET } from "./codec.generated";

/** 클라 프레임 헤더 바이트 수. */
export const FRAME_HEADER_BYTES = 4;
/** 프레임 body 상한 = 헤더 len(u16) 용량. 넘는 페이로드는 writeFrameHeader가 RangeError(SNAPSHOT_DELTA는 빌더가 분할한다). */
export const MAX_FRAME_BODY_BYTES = 0xffff;
/** 헤더 안 body_len(u16 LE) 자리. */
const BODY_LEN_OFFSET = 0;
/** 헤더 안 packet_id(u16 LE) 자리. */
const PACKET_ID_OFFSET = 2;

/** SNAPSHOT_DELTA 본문 머리 [tick u32 LE][ack u32 LE][count u16 LE] 안 ackSeq 자리(스키마 코드젠 상수). */
const DELTA_BODY_ACK_OFFSET = SNAPSHOT_DELTA_OFFSET.ackSeq;
/** SNAPSHOT_DELTA 프레임의 ackSeq(u32 LE) 자리 — 공유 프레임 패치 자리(sim/deltaGroups.ts, net/sharedFrame.ts). */
export const DELTA_ACK_OFFSET = FRAME_HEADER_BYTES + DELTA_BODY_ACK_OFFSET;

/** 헤더를 읽을 수 있는 수신 버퍼(net/ringBuffer.ts RingByteBuffer) — offset은 버퍼 head 기준. */
export interface FrameHeaderReader {
  readU16LE(offset: number): number;
}

/** 프레임 헤더를 읽을 원본 — 연접 바이트(Buffer·Uint8Array) 또는 수신 링 버퍼. */
export type FrameSource = Uint8Array | FrameHeaderReader;

function u16LE(b: Uint8Array, at: number): number {
  if (at < 0 || at + 2 > b.length) throw new RangeError(`frame header read u16 at ${at} out of ${b.length} bytes`);
  return b[at]! | (b[at + 1]! << 8);
}

function readU16(src: FrameSource, at: number): number {
  return src instanceof Uint8Array ? u16LE(src, at) : src.readU16LE(at);
}

/**
 * 송신 프레임 body가 헤더 len(u16) 용량을 넘었다 — RangeError 하위 클래스(종전 RangeError 계약 유지). 송신 단위 방어층(network/encodeGuard.ts)이
 * 생성 인코더의 WireEncodeError와 함께 "그 패킷만 버림"으로 다루는 표지다(다른 RangeError — 버퍼 경계 위반 등 — 와 구분, 이진 전환 B4).
 */
export class FrameBodyTooLargeError extends RangeError {
  constructor(
    readonly packetId: number,
    readonly bodyLength: number,
  ) {
    super(`frame body ${bodyLength} bytes > ${MAX_FRAME_BODY_BYTES} (packet 0x${packetId.toString(16)})`);
    this.name = "FrameBodyTooLargeError";
  }
}

/** 송신 body 상한 검사 — 버퍼를 확보하기 전에 부르면 넘는 페이로드가 큰 할당을 일으키지 않는다(writeFrameHeader도 다시 본다). */
function assertFrameBody(packetId: number, bodyLength: number): void {
  if (bodyLength > MAX_FRAME_BODY_BYTES) throw new FrameBodyTooLargeError(packetId, bodyLength);
}

/** 프레임 헤더 `[len:u16 LE][id:u16 LE]`를 `out[offset..offset+FRAME_HEADER_BYTES)`에 쓴다. body > MAX_FRAME_BODY_BYTES는 RangeError. */
export function writeFrameHeader(out: Buffer, offset: number, packetId: number, bodyLength: number): void {
  assertFrameBody(packetId, bodyLength);
  out.writeUInt16LE(bodyLength, offset + BODY_LEN_OFFSET);
  out.writeUInt16LE(packetId, offset + PACKET_ID_OFFSET);
}

/** off에서 시작하는 프레임의 packet_id. 헤더가 원본 밖이면 RangeError(링 버퍼는 자체 검사로 throw). */
export function framePacketIdAt(src: FrameSource, off: number): number {
  return readU16(src, off + PACKET_ID_OFFSET);
}

/** off에서 시작하는 프레임의 body 바이트 수(헤더 제외). 헤더가 원본 밖이면 RangeError(링 버퍼는 자체 검사로 throw). */
export function frameBodyLenAt(src: FrameSource, off: number): number {
  return readU16(src, off + BODY_LEN_OFFSET);
}

/** 완성 프레임 1개 = 헤더 + body 복사. */
export function encodeFrame(packetId: number, body: Uint8Array): Buffer {
  assertFrameBody(packetId, body.length);
  const out = Buffer.allocUnsafe(FRAME_HEADER_BYTES + body.length);
  writeFrameHeader(out, 0, packetId, body.length);
  out.set(body, FRAME_HEADER_BYTES);
  return out;
}

/** 완성 프레임 연접의 프레임 수 — 헤더 미만 꼬리는 세지 않는다(부분 쓰기 진단 라벨, gateway/gatewayConn.ts). */
export function countFrames(buf: Uint8Array): number {
  let n = 0;
  for (let off = 0; buf.length - off >= FRAME_HEADER_BYTES; n++) off += FRAME_HEADER_BYTES + frameBodyLenAt(buf, off);
  return n;
}

/**
 * 첫 프레임의 packet_id — 부분 쓰기 진단 라벨. packet_id를 덮지 못하는 길이는 0(디코더가 MULTICAST·DEF의 헤더 미만을 이미
 * 거절한다 — 방어 겹).
 */
export function firstPacketId(buf: Uint8Array): number {
  return buf.length >= PACKET_ID_OFFSET + 2 ? framePacketIdAt(buf, 0) : 0;
}

/** v1 HELLO의 앞 4바이트(id 0x0001 BE + len 상위 2바이트 0)를 v2 헤더로 읽은 값. */
const LEGACY_HELLO_BODY_LEN = 0x0100;
const LEGACY_HELLO_PACKET_ID = 0;

/** off의 헤더가 구 v1 클라의 HELLO인가(v2로 읽은 len 0x0100·id 0 — id 0은 예약이라 v2 클라는 보내지 않는다). */
export function isLegacyHelloHeader(src: FrameSource, off: number): boolean {
  return framePacketIdAt(src, off) === LEGACY_HELLO_PACKET_ID && frameBodyLenAt(src, off) === LEGACY_HELLO_BODY_LEN;
}

/** 구 클라 업데이트 안내 KICK 1의 detail — 구 형식 KICK 두 프레임(아래)과 바이너리 HELLO 이전 클라 거절이 같은 문구를 쓴다. */
export const LEGACY_KICK_DETAIL = "client update required";

/**
 * 구 형식 KICK 1(ProtoMismatch)의 JSON 본문 — KICK은 frozen(필드 reason·detail 영구 고정)이라 어느 구 클라의 JSON KICK 디코드와도 맞는다.
 * reason 1 = KICK_REASON.ProtoMismatch(identity/loginFlow.ts) — 이 모듈은 의존성 없음 규약(게이트웨이 import 가드)이라 리터럴로 둔다.
 * 고정 바이트 리터럴이다(JSON 직렬화기를 쓰지 않는다 — 프레임 본문 JSON 금지 가드, tests/server/net/frameBodyJsonGuard.test.ts). detail에
 * JSON 이스케이프가 필요한 문자가 없어 `{"reason":1,"detail":"…"}` 그대로가 B3b 전 KICK 바이트와 같다(wireFrame.test가 고정).
 */
const LEGACY_KICK_JSON_BODY: Buffer = Buffer.from(`{"reason":1,"detail":"${LEGACY_KICK_DETAIL}"}`, "utf8");

/** 구 v1 클라(protoVersion ≤ 2)가 읽을 수 있는 KICK 1 프레임 — v1 헤더 [id u16 BE][len u32 BE] + JSON 본문. 구 클라 거절 전용. */
export const LEGACY_KICK_FRAME: Buffer = (() => {
  const out = Buffer.allocUnsafe(6 + LEGACY_KICK_JSON_BODY.length);
  out.writeUInt16BE(PACKET_ID.KICK, 0);
  out.writeUInt32BE(LEGACY_KICK_JSON_BODY.length, 2);
  out.set(LEGACY_KICK_JSON_BODY, 6);
  return out;
})();

/** v2 프레이밍(B1, protoVersion 3)부터 JSON KICK을 읽는 마지막 버전(B2b, protoVersion 5)까지 — KICK 본문이 바이너리가 된 B3b(6) 전. */
const JSON_KICK_PROTO_MIN = 3;
const JSON_KICK_PROTO_MAX = 5;

/** HELLO.clientProtoVer가 v2 헤더 + JSON 본문 KICK만 읽는 구 클라(B1~B2b)인가. */
export function readsLegacyJsonKick(clientProtoVer: number): boolean {
  return clientProtoVer >= JSON_KICK_PROTO_MIN && clientProtoVer <= JSON_KICK_PROTO_MAX;
}

/**
 * B1~B2b 클라(protoVersion 3~5)가 읽을 수 있는 KICK 1 프레임 — v2 헤더 + JSON 본문(B3b 전 KICK 그대로의 바이트). 구 클라 업데이트 안내 전용 —
 * 그 밖의 KICK은 전부 바이너리(writePacket). 현행 클라가 받으면 디코드 실패(OverMax)로 버린다(받을 일이 없다 — HELLO 판정이 고른다).
 */
export const LEGACY_JSON_KICK_FRAME: Buffer = encodeFrame(PACKET_ID.KICK, LEGACY_KICK_JSON_BODY);
