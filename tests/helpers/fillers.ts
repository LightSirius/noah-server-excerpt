// 시험 송신 필러(이진 전환 B3b) — 전송 계층 시험이 "내용·종류 무관한 S2C 프레임"을 만드는 곳.
//
// 종전 필러는 JSON 상태 S2C(PONG의 문자열 시간 "x".repeat(n), 형태 없는 CHAT_BCAST)였다. B3b에 PONG·CHAT_BCAST·MOVE_PATH가 binary가 되어
// 스키마 형태가 아니면 생성 인코더가 WireEncodeError를 던지고, PONG 본문은 16 B 고정이라 크기 필러로 쓸 수 없다. 세션 송신(session.send·sendTo·
// sendMany — 페이로드를 인코딩한다)은 아래 스키마 형태 페이로드를, 링크 수준(내용 무관 바이트)은 tests/helpers/wire.ts encodeRaw 원시 본문을 쓴다.
// 셋 다 영구 binary라(B4~B6 flip 대상 아님) 이후 단계에서 다시 바꿀 필요가 없다.

import {
  type ChatBcastPayload,
  type MovePathPayload,
  PACKET_ID,
  type PongPayload,
  MOVE_PATH_WAYPOINTS_MAX,
} from "../../server/src/net/codec.generated";

/** 크기 필러 패킷 — MOVE_PATH: 본문 = 머리 10 B(entityId i32 + seq i32 + 개수 u16) + 웨이포인트 8 B × n(n ≤ 1024 → 최대 8,202 B). */
export const SIZE_FILLER_ID = PACKET_ID.MOVE_PATH;
const SIZE_FILLER_HEAD_BYTES = 10;
const WAYPOINT_BYTES = 8;

/** 크기 필러의 본문 바이트 수(웨이포인트 n개). */
export function sizeFillerBodyBytes(waypoints: number): number {
  return SIZE_FILLER_HEAD_BYTES + WAYPOINT_BYTES * waypoints;
}

/** 본문이 bodyBytes 이하에서 가장 큰(= 10 + 8n) 크기 필러. tag = entityId(프레임 구분용). */
export function sizeFiller(bodyBytes: number, tag = 0): MovePathPayload {
  const n = Math.floor((bodyBytes - SIZE_FILLER_HEAD_BYTES) / WAYPOINT_BYTES);
  if (n < 0 || n > MOVE_PATH_WAYPOINTS_MAX) throw new RangeError(`size filler ${bodyBytes} B outside MOVE_PATH range`);
  return { entityId: tag, seq: 0, waypoints: Array.from({ length: n }, () => ({ x: 0, y: 0 })) };
}

/** FNV-1a 32비트 — 문자열 태그를 결정적인 수로(시험 안 태그는 짧고 서로 다르다). */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/**
 * 작은 태그 필러 — PONG(본문 16 B 고정). 태그 = clientTimeMs(문자열 태그는 FNV-1a 해시 — 같은 태그 = 같은 바이트, 다른 태그 = 다른 바이트).
 * 종전 JSON 필러 `{clientTimeMs: "<태그>", serverTimeMs: "..."}`의 자리.
 */
export function tagPong(tag: number | string): PongPayload {
  return { clientTimeMs: typeof tag === "number" ? tag : fnv1a(tag), serverTimeMs: 0 };
}

/** 문자열 태그 필러 — CHAT_BCAST(본문 = 12 + 이름·본문 UTF-8 바이트, text ≤ 600 B). */
export function tagChat(text: string, senderName = "w"): ChatBcastPayload {
  return { channel: 2, senderId: 0, senderName, text };
}
