// Phase B — packet ID별 body 크기 화이트리스트.
//
// 와이어 헤더 len은 u16(≤ 64 KB — net/wireFrame.ts v2)이지만 연결마다 64 KB씩 본문 대기를 허용하면 슬롯 점유·메모리 압박이라
// C2S 패킷마다 더 낮은 cap을 두고, 알 수 없는/whitelist 외 ID는 default cap(본문 도착 전에 판정 — 넘으면 엣지가 KICK 5).
//
// 단위: 본문 바이트. B2b부터 C2S 전부가 바이너리라 cap = 스키마 최악 본문(codec.generated.ts MAX_BODY_BYTES — 코드젠이 필드 타입·max에서
// 계산, 정상 인코딩은 넘을 수 없다). 수기 표는 없다(스키마 max가 바뀌면 cap이 따라간다).
//   예외 HELLO: frozen 협상 경로. 구 클라(B1~B2a)의 JSON HELLO가 size 게이트(KICK 5)가 아니라 디코더에 닿아 KICK 1(frameIngest — 업데이트
//   안내)을 받도록 종전 cap 64를 바닥으로 둔다. JSON HELLO 최대 = {"clientProtoVer":<i32 11자>,"clientBuildHash":<u32 10자>} 59B.
// S2C id(SNAPSHOT_DELTA 포함 — 수신 대상 아님)·미지 id: DEFAULT 4096 — router에서 결국 unknownPacket으로 거를 거지만 OOM 방지가 1차.

import { MAX_BODY_BYTES, PACKET_DIRECTION, PACKET_ID } from "./codec.generated";

/** HELLO cap 바닥 — 구 JSON HELLO(≤ 59B)를 디코더(KICK 1)까지 들인다. */
export const LEGACY_HELLO_MAX_BODY_BYTES = 64;

export const DEFAULT_MAX_BODY_BYTES = 4096;

const TABLE: Record<number, number> = {};
for (const [id, max] of Object.entries(MAX_BODY_BYTES)) {
  if (max !== undefined && PACKET_DIRECTION[Number(id)] === "C2S") TABLE[Number(id)] = max;
}
TABLE[PACKET_ID.HELLO] = Math.max(TABLE[PACKET_ID.HELLO] ?? 0, LEGACY_HELLO_MAX_BODY_BYTES);

export function packetMaxBodyBytes(packetId: number): number {
  const v = TABLE[packetId];
  return v === undefined ? DEFAULT_MAX_BODY_BYTES : v;
}
