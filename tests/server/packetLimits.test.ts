/**
 * Phase B — packet body size 화이트리스트 테스트.
 * B2b: C2S 전부가 바이너리 — 수신 상한 = 스키마 최악 본문(MAX_BODY_BYTES), HELLO만 구 JSON HELLO를 KICK 1까지 들이는 바닥(64).
 */

import { describe, expect, test } from "bun:test";
import { MAX_BODY_BYTES, PACKET_DIRECTION, PACKET_ID } from "../../server/src/net/codec.generated";
import {
  DEFAULT_MAX_BODY_BYTES,
  LEGACY_HELLO_MAX_BODY_BYTES,
  packetMaxBodyBytes,
} from "../../server/src/net/packetLimits";
import { helloPayload } from "../helpers/wire";

const C2S_IDS = Object.values(PACKET_ID).filter((id) => PACKET_DIRECTION[id] === "C2S");

describe("packetMaxBodyBytes", () => {
  test("C2S 36개 전부 = 스키마 최악 본문(HELLO 제외) — 수기 표 없음", () => {
    expect(C2S_IDS.length).toBe(36);
    for (const id of C2S_IDS) {
      if (id === PACKET_ID.HELLO) continue;
      expect(MAX_BODY_BYTES[id]).toBeDefined();
      expect(packetMaxBodyBytes(id)).toBe(MAX_BODY_BYTES[id]!);
    }
  });

  test("대표 상한 — 정상 인코딩 최악 본문과 같다(넘으면 엣지 KICK 5)", () => {
    expect(packetMaxBodyBytes(PACKET_ID.INPUT_CMD)).toBe(21); // i32 × 5 + gait u8
    expect(packetMaxBodyBytes(PACKET_ID.PING)).toBe(8); // f64
    expect(packetMaxBodyBytes(PACKET_ID.GATHER_TRACE)).toBe(4 + 1 + 2 + 1 + 2 + 160 * 4); // 채집 미니게임 궤적 650 B
    expect(packetMaxBodyBytes(PACKET_ID.GATHER_TAPS)).toBe(4 + 2 + 16 * 7); // 원 짚기 제출 118 B
    expect(packetMaxBodyBytes(PACKET_ID.CHAT_SAY)).toBe(4 + 2 + 64 + 2 + 600);
    expect(packetMaxBodyBytes(PACKET_ID.AUTH_REQ)).toBe(4 + 2 + 64 + 2 + 256);
    expect(packetMaxBodyBytes(PACKET_ID.CHAR_LIST_REQ)).toBe(0);
    expect(packetMaxBodyBytes(PACKET_ID.UI_PREFERENCES_SET)).toBe(1 + 2 + 6 * 4 + 2 + 5 * 4);
    expect(packetMaxBodyBytes(PACKET_ID.GATHER_START)).toBe(4); // nodeEid i32
    expect(packetMaxBodyBytes(PACKET_ID.LIFE_CANCEL)).toBe(0);
    expect(packetMaxBodyBytes(PACKET_ID.CRAFT_REQ)).toBe(16); // npcEid·recipeId·count·requestId i32
  });

  test("HELLO — 구 클라 JSON HELLO(최대 59B)가 size 킥이 아니라 디코더(KICK 1)에 닿는 바닥 64", () => {
    expect(MAX_BODY_BYTES[PACKET_ID.HELLO]).toBe(8);
    expect(packetMaxBodyBytes(PACKET_ID.HELLO)).toBe(LEGACY_HELLO_MAX_BODY_BYTES);
    const worstLegacy = JSON.stringify(helloPayload({ clientProtoVer: -2147483648, clientBuildHash: 4294967295 }));
    expect(Buffer.byteLength(worstLegacy)).toBeLessThanOrEqual(LEGACY_HELLO_MAX_BODY_BYTES);
  });

  test("S2C id(SNAPSHOT_DELTA 포함)·미등록 ID는 DEFAULT_MAX_BODY_BYTES(4096)", () => {
    expect(packetMaxBodyBytes(PACKET_ID.SNAPSHOT_DELTA)).toBe(DEFAULT_MAX_BODY_BYTES);
    expect(packetMaxBodyBytes(PACKET_ID.PONG)).toBe(DEFAULT_MAX_BODY_BYTES);
    expect(packetMaxBodyBytes(0xdead)).toBe(DEFAULT_MAX_BODY_BYTES);
    expect(packetMaxBodyBytes(0xffff)).toBe(DEFAULT_MAX_BODY_BYTES);
  });

  test("모든 패킷의 수신 상한은 u16 프레임 길이 안(H1 — v2 헤더 len u16)·C2S는 DEFAULT 이하", () => {
    for (const id of [...Object.values(PACKET_ID), 0xbeef]) expect(packetMaxBodyBytes(id)).toBeLessThanOrEqual(0xffff);
    for (const id of C2S_IDS) expect(packetMaxBodyBytes(id)).toBeLessThanOrEqual(DEFAULT_MAX_BODY_BYTES);
  });

  test("DEFAULT는 4 KB — OOM 방지선", () => {
    expect(DEFAULT_MAX_BODY_BYTES).toBe(4096);
  });
});
