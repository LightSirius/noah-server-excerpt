// Phase 2: Buffer.concat 폐기. 단일 할당 후 in-place write — GC 압박 절감.
// 본문은 생성 바이너리 코덱(net/wireCodec.generated.ts)이 프레임 버퍼에 직접 쓴다 — 모든 패킷 본문이 binary다(이진 전환 B6, shared/protocol.md §2).
// 헤더 framing은 net/wireFrame.ts가 단일 정의(현행 v2 [len:u16 LE][id:u16 LE] 4바이트 —
// protocol.md §1). 성능 3단계 슬라이스 5: 세션 outbox(frameOutbox.ts)는 같은 바이트를 자기 버퍼에 직접 쓴다.
// 위반 값(범위·정수성·비유한·max 초과)과 스키마 밖 id는 bodySize가 WireEncodeError로 던진다 — 프레임을 만들기 전이라 부분 바이트가 없다. 세션·팬아웃
// 송신 경로는 그 예외를 패킷 단위로 버리는 방어층(encodeGuard.ts — 이진 전환 B4)을 거친다. 여기(writePacket)는 그대로 던진다(도구·시험·KICK).

import type { PayloadOf, S2CPacketId } from "../net/codec.generated";
import { bodySize, writeBody } from "../net/wireCodec.generated";
import { FRAME_HEADER_BYTES, writeFrameHeader } from "../net/wireFrame";

/** 서버 송신 프레임(S2C 타입화 — C0.2). */
export function writePacket<I extends S2CPacketId>(packetId: I, payload: PayloadOf<I>): Buffer {
  return encodePacket(packetId, payload);
}

/** 방향 무관 저수준 — 시험 헬퍼·도구가 C2S 프레임도 같은 바이트로 만든다. 서버 송신 경로는 writePacket. */
export function encodePacket(packetId: number, payload: object): Buffer {
  const bodyLen = bodySize(packetId, payload);
  const out = Buffer.allocUnsafe(FRAME_HEADER_BYTES + bodyLen);
  writeFrameHeader(out, 0, packetId, bodyLen);
  writeBody(packetId, payload, out, FRAME_HEADER_BYTES);
  return out;
}
