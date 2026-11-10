// 바이너리 string 필드(UTF-8 바이트 max — shared/protocol.md §2.1)에 실을 문자열의 상한 판정·자르기(이진 전환 B3b).
// 생성 코덱 strSize(net/wire/runtime.ts)와 같은 판정 — 짝 없는 UTF-16 서로게이트는 실을 수 없고, UTF-8 바이트가 max 이하여야 한다 — 을 송신 전
// 경계(데이터 로더의 부팅 검증·존 표시 메타 저장소)에서 미리 해서, 송신(존 tick 안의 스냅샷 SPAWN 등)이 WireEncodeError를 던지지 않게 한다.
// 의존성은 코드젠 상수(codec.generated.ts — 값 객체뿐)만 — 존·로더·admin 공용.

import {
  CHAT_BCAST_SENDER_NAME_MAX,
  ENTITY_SPAWN_NAME_MAX,
  ZONE_CHANGE_NAME_MAX,
  ZONE_INFO_NAME_MAX,
} from "./codec.generated";

/**
 * 표시 이름(플레이어·몬스터·NPC) 와이어 상한 — 같은 이름이 나가는 ENTITY_SPAWN.name·CHAT_BCAST.senderName 중 작은 쪽(스키마는 같은 값 —
 * tests/server/wireLimitsContract.test.ts가 고정). 데이터 로더(부팅 검증)와 존 메타 저장소(자르기)가 쓴다.
 */
export const DISPLAY_NAME_MAX = Math.min(ENTITY_SPAWN_NAME_MAX, CHAT_BCAST_SENDER_NAME_MAX);

/**
 * 존 이름 와이어 상한 — 같은 존 메타 이름이 나가는 ZONE_INFO.name·ZONE_CHANGE.name 중 작은 쪽(스키마는 같은 값 — wireLimitsContract). ZoneRegistry
 * 생성자(존 메타의 부팅 경로)가 강제한다(이진 전환 B4).
 */
export const ZONE_NAME_MAX = Math.min(ZONE_INFO_NAME_MAX, ZONE_CHANGE_NAME_MAX);

/** UTF-16 코드 유닛 1개의 최악 UTF-8 바이트(BMP = 3, 서로게이트 쌍은 2유닛에 4바이트). */
const UTF8_BYTES_PER_UNIT_MAX = 3;

/** 코드 유닛 c(서로게이트 쌍의 앞 유닛이 아닌 것)의 UTF-8 바이트 — 짝 없는 서로게이트는 U+FFFD(3바이트)로 센다(인코더가 그렇게 쓴다). */
function unitBytes(c: number): number {
  if (c < 0x80) return 1;
  return c < 0x800 ? 2 : 3;
}

function isPairAt(s: string, i: number): boolean {
  const c = s.charCodeAt(i);
  return c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00;
}

/** UTF-8 바이트 수 — 실제 인코딩(TextEncoder·Buffer.from)과 같은 값, 짝 없는 서로게이트는 U+FFFD 3바이트(Bun Buffer.byteLength는 2로 센다). */
export function utf8ByteLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (isPairAt(s, i)) {
      n += 4;
      i++;
    } else {
      n += unitBytes(s.charCodeAt(i));
    }
  }
  return n;
}

/** 바이너리 string 필드(UTF-8 바이트 ≤ max)에 그대로 실리는가 — 생성 코덱 strSize가 받는 값과 같은 집합. */
export function fitsWireString(s: string, max: number): boolean {
  return s.isWellFormed() && utf8ByteLength(s) <= max;
}

/**
 * 실리게 고친 표시 문자열 — 짝 없는 서로게이트는 U+FFFD로 바꾸고, max 바이트를 넘으면 코드 포인트 경계에서 자른다(쌍을 가르지 않는다).
 * 이미 실리면 입력을 그대로 돌려준다(할당 없음).
 */
export function clampWireString(s: string, max: number): string {
  const w = s.isWellFormed() ? s : s.toWellFormed();
  if (w.length * UTF8_BYTES_PER_UNIT_MAX <= max) return w;
  let n = 0;
  let i = 0;
  while (i < w.length) {
    const pair = isPairAt(w, i);
    const b = pair ? 4 : unitBytes(w.charCodeAt(i));
    if (n + b > max) return w.slice(0, i);
    n += b;
    i += pair ? 2 : 1;
  }
  return w;
}
