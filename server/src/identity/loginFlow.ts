// Phase 5 loginFlow — 상태머신을 강제하는 helper.
//
// architecture.md §7.1:
//   ANON --HELLO--> HELLO_RECV --AUTH_REQ--> AUTHENTICATING -- 성공 --> AUTHENTICATED
//                                                              -- 실패 --> REJECT
//   AUTHENTICATED --ENTER_WORLD_REQ--> IN_WORLD
//
// 본 모듈은 순수 helper만 — IO·sleep·Bun import 없음 (테스트 친화).

import { PROTO_VERSION } from "../net/codec.generated";
import { hasDisplayUnsafe } from "../net/textSafety";

export type LoginState =
  | "ANON"
  | "HELLO_RECV"
  | "AUTHENTICATED"
  | "IN_WORLD"
  | "REJECT";

export const AUTH_MODE = {
  Password: 1,
  Token: 2,
  DevAuto: 3,
} as const;
export type AuthMode = typeof AUTH_MODE[keyof typeof AUTH_MODE];

export const ERR_CODE = {
  None: 0,
  BadCredentials: 1,
  Banned: 2,
  RateLimited: 3,
  ServerErr: 4,
} as const;

export const KICK_REASON = {
  ProtoMismatch: 1,
  AuthFail: 2,
  Idle: 3,
  AdminKick: 4,
  Cheat: 5,
  ServerShutdown: 6,
  /** 클라 아이템 카탈로그(items.dat)의 contentHash가 서버와 불일치 — 데이터 버전 어긋남. */
  ContentMismatch: 7,
  /** 같은 계정으로 새 접속이 들어와 기존 세션이 선점 킥됨(계정당 1세션 정책). */
  DuplicateLogin: 8,
  /** 연결 상한(전역 MAX_CONNECTIONS / IP별) 초과로 접속 거절 — 종전엔 Cheat(5)로 보고됐다. */
  ServerFull: 9,
} as const;

/** 서버 프로토콜 버전 — 단일 진실은 packets.json protoVersion(codegen PROTO_VERSION). */
export const SERVER_PROTO_VER = PROTO_VERSION;

/**
 * AUTH_REQ.username 문자 검증(이진 전환 B2c — Password·DevAuto 모드) — 비어 있지 않고, 앞뒤 공백(String.trim 기준)이 없고, 위 금지 문자가
 * 없어야 한다(금지 문자 = net/textSafety 표시 위험 집합 — Cc·Cf·Zl·Zp·한글 채움 문자, 채팅이 지우는 것과 같다). 길이는 와이어(64 B)가 묶는다. 정상 클라는 trim한 입력만 보내고(LoginController) 기존 계정명(ASCII·한글)은 모두 통과한다.
 * DevAuto는 이 이름으로 계정과 캐릭터명 `<username>-1`을 만든다 — 다른 클라에 표시되는 이름이라 같은 규칙을 거친다.
 */
export function isValidUsername(username: string): boolean {
  return username.length > 0 && username.trim() === username && !hasDisplayUnsafe(username);
}

/** IN_WORLD에서 허용하는 패킷. */
const IN_WORLD_PACKETS: ReadonlySet<number> = new Set([
  0x0100, // INPUT_CMD
  0x0104, // MOVE_TO (Phase E-2 우클릭 이동)
  0x0107, // MOVE_STOP (이동동기화 후속 ③ — 즉시 정지)
  0x0210, // CHAT_SAY (Phase E-4 zone-local broadcast)
  0x0400, // TARGET_SELECT (Phase G-4-3)
  0x0402, // ATTACK_START (Phase G-4-3)
  0x0403, // ATTACK_STOP (Phase G-4-3)
  0x0412, // RESPAWN_REQ (Phase G-4-4)
  0x0420, // SKILL_CAST (Phase G-5)
  0x0425, // SKILL_LEARN (Phase G-5b)
  0x0426, // SKILL_LEVEL_UP (Phase G-5b)
  0x0305, // STAT_ALLOCATE (자유 포인트)
  0x0306, // STAT_RESET (자유 포인트)
  0x0015, // ZONE_CHANGE_REQ (포탈)
  0x0450, // NPC_INTERACT (NPC 대화)
  0x0452, // NPC_ACTION (퀘스트 수락/턴인 — 대화 옵션 실행)
  0x0463, // QUEST_ABANDON (저널 포기)
  0x0470, // UI_PREFERENCES_SET
  0x0454, // SHOP_BUY
  0x0455, // SHOP_SELL
  0x0440, // ITEM_USE (Phase G-7)
  0x0441, // ITEM_EQUIP (Phase G-7)
  0x0442, // ITEM_UNEQUIP (Phase G-7)
  0x0443, // ITEM_PICKUP (Phase G-7)
  0x0480, // GATHER_START (생활 L-1b — 플래그 끔이면 핸들러가 무응답)
  0x0481, // LIFE_CANCEL (생활 L-1b)
  0x0487, // GATHER_TRACE (채집 미니게임 — 플래그 끔이면 핸들러가 무응답)
  0x0488, // GATHER_TAPS (채집 미니게임 원 짚기 — 플래그 끔이면 핸들러가 무응답)
  0x0491, // CRAFT_REQ (생활 L-2 — 플래그 끔이면 핸들러가 무응답)
  0x0F00, // PING
]);

/** 패킷 ID별 허용 상태 화이트리스트. router가 사용. */
export function isPacketAllowedInState(packetId: number, state: LoginState): boolean {
  // 정리 단계 PACKET_ID (protocol.md §3 canonical):
  //   0x0001 HELLO / 0x0003 AUTH_REQ / 0x0010 CHAR_LIST_REQ / 0x0012 ENTER_WORLD_REQ
  //   0x0100 INPUT_CMD / 0x0F00 PING
  switch (state) {
    case "ANON":
      return packetId === 0x0001;             // HELLO
    case "HELLO_RECV":
      return packetId === 0x0003 || packetId === 0x0F00; // AUTH_REQ, PING
    case "AUTHENTICATED":
      return (
        packetId === 0x0010 || // CHAR_LIST_REQ
        packetId === 0x0016 || // CHAR_CREATE_REQ (Phase E-1)
        packetId === 0x0300 || // CREATE_CHARACTER_V2 (Phase G-2)
        packetId === 0x0012 || // ENTER_WORLD_REQ
        packetId === 0x0F00    // PING
      );
    case "IN_WORLD":
      return IN_WORLD_PACKETS.has(packetId);
    case "REJECT":
      return false;
  }
}

export function nextStateOnHello(state: LoginState): LoginState {
  return state === "ANON" ? "HELLO_RECV" : state;
}

export function nextStateOnAuthSuccess(state: LoginState): LoginState {
  return state === "HELLO_RECV" ? "AUTHENTICATED" : state;
}

export function nextStateOnAuthFail(_state: LoginState): LoginState {
  return "REJECT";
}

export function nextStateOnEnterWorld(state: LoginState): LoginState {
  return state === "AUTHENTICATED" ? "IN_WORLD" : state;
}
