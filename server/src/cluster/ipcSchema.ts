// 월드 ↔ 게이트웨이 IPC 스키마 — 성능 4단계(게이트웨이 분리) 4.2. 서버 내부 프로토콜(클라 와이어와 무관 — shared/protocol.md
// 대상 아님), 리틀엔디언, 버전 관리. 인코딩·디코딩은 ipcCodec.ts.
//
// 봉투: `u32 len | u8 type | payload` — len = type 1바이트 + payload 바이트(길이 필드 4바이트는 제외).
//   봉투 전체(4 + len) 상한 IPC_MAX_ENVELOPE_BYTES(64 MiB) — 넘는 헤더를 받으면 수신 측이 피어를 끊는다. 수신 링은 봉투 1개만
//   담으므로(디코더가 완성에 필요한 만큼만 링에 복사) 링 상한 = 봉투 상한이다(4.0 교정 c의 "링 ≥ 2× 봉투"는 통째 append 기준).
//
// 게이트웨이 → 월드
//   0x01 HELLO        {u16 ipcVer, u16 gatewayId, u32 incarnation, u32 pid, u8 tokenLen, token} — 연결의 첫 메시지.
//                     token = 공유 비밀 IPC_TOKEN(미설정 = 빈 값) — 월드가 자기 값과 다르면 피어 표를 건드리기 전에 거절한다(v2)
//   0x02 PING         {u32 seq}
//   0x03 BYE          {u8 reason: BYE_REASON}
//   0x04 LISTEN_REPORT {u8 flags: LISTEN_REPORT_FLAG, u16 port, u32 ackSeq} — 이 게이트웨이의 클라 리슨 상태 스냅샷(v14 — 공유 포트
//                     리스너 양보). flags bit0 shared(reusePort 공유 포트 + 양보 기능 켬) · bit1 closed(새 클라를 거절 중 — 로컬 부하
//                     접속 제한(월드 ADMISSION busy 포함) ∨ 연결 상한 닿음(히스테리시스)) · bit2 listening(클라 리스너가 지금 열려 있다),
//                     나머지 비트 = 프로토콜 오류. port = 클라 리슨 포트(같은 포트를 공유하는 피어끼리 묶는다 — 같은 호스트 전제: IPC가
//                     로컬이라 성립), ackSeq = 마지막으로 적용한 LISTEN seq(0 = 이 월드 세션에서 없음). 긴급 송신 — 리슨 직후·접속 제한
//                     전이·연결 상한 닿음/해제·리스너 중지/재개·LISTEN 적용(무동작이어도 ack)마다.
//   0x10 CONN_OPEN    {u32 localId, u8 addrLen, addr utf8} — addr = 실제 클라 IP(월드의 IP별 상한·인증 스로틀)
//   0x11 CONN_FRAMES  반복 {u32 localId, u16 packetId, u32 bodyLen, body} — 이벤트 루프 턴마다 배치
//   0x12 CONN_CLOSED  {u32 localId, u8 reason: CONN_CLOSED_REASON}
// 월드 → 게이트웨이
//   0x81 HELLO_ACK     {u16 ipcVer, u32 worldIncarnation, u32 connCap} — 연결의 첫 메시지
//   0x84 HELLO_NACK    {u16 ipcVer, u8 reason: HELLO_NACK_REASON} — HELLO 거절(첫 메시지 대신, 뒤에 월드가 끊는다 — v2)
//   0x85 ADMISSION     {u8 state: ADMISSION_STATE} — 이 피어의 신규 접속 판정(소프트 임계 전이마다, v3). 긴급 송신(IpcPipe.writeUrgent —
//                      대기 중인 봉투들을 봉투 경계에서 앞지른다): 피어 단위라 연결별 순서가 없다. 대기열 뒤로 보내면 그 적체가 다
//                      빠진 뒤에야 도착한다(알리려는 바로 그 적체).
//   0x86 LISTEN        {u8 mode: LISTEN_MODES 인덱스(0 listen · 1 yield), u32 seq} — 공유 포트 리스너 양보 지시(v14). seq는 이 월드 세션의
//                      피어마다 1부터 단조 증가(0 = 프로토콜 오류). 바쁜 피어는 같은 포트 그룹에 다른 열린 리스너가 있을 때만 yield를 받는다
//                      (listenPlan.ts — 불변식). 긴급 송신(피어 단위).
//   0x82 PONG          {u32 seq}
//   0x83 SHUTDOWN      {u8 kickReason: KICK_REASON}
//   0x90 CONN_DELIVER  반복 {u32 localId, u32 len, bytes} — 완성 클라 프레임(1개 이상 연접). tick·턴 flush마다 배치
//   0x91 CONN_STATE    {u32 localId, u8 state: IPC_LOGIN_STATES 인덱스}
//   0x92 CONN_CLOSE    {u32 localId} — 앞서 보낸 바이트 뒤에 종료
//   0x93 CONN_ACCEPTED {u32 localId, u32 worldConnId}
//   0x94 CONN_MULTICAST 반복 {u32 len, bytes, u16 n, u32[n] localIds} — 같은 완성 클라 프레임(1개 이상 연접)을 n개 연결에(v4, 성능 4.5
//                      F2 — 발행 시점 팬아웃 sendMany를 게이트웨이당 레코드 1개로). n ≥ 1, len ≥ IPC_CLIENT_FRAME_MIN_BYTES(완성 클라 프레임 = 클라 헤더 이상),
//                      localId 중복 = 그 연결에 중복 송신.
//                      레코드 1개 = 나열된 각 연결의 연결별 순서상 "송신 1건"(그 연결의 앞선 DELIVER/STATE/CLOSE 뒤, 뒤의 것 앞).
//   0x95 CONN_FLUSH    {} — flush 창(tick 끝·턴 끝)의 끝(v4). 그 창에 MULTICAST가 있었을 때만 창 마지막 메시지로 온다 — 게이트웨이는
//                      MULTICAST로 미뤄 둔 연결별 바이트를 지금 쓴다(같은 창의 DELIVER가 오면 거기 합쳐 write 1회로 이미 나갔다).
//   0x96 CONN_DELIVER_SHARED 반복 레코드 `u8 tag | …`(v5, 성능 4.5 F3 — 같은 셀 viewer의 SNAPSHOT_DELTA를 게이트웨이당 1회 + 연결별 ackSeq):
//                      DEF(1)      {u32 len, u16 patchOff, bytes[len]} — 공유 프레임 정의. ref = 이 봉투 안 DEF 순번(0부터), 봉투 끝까지 유효.
//                                  len ≥ IPC_CLIENT_FRAME_MIN_BYTES(완성 클라 프레임), patchOff + 4 ≤ len.
//                      CONN(2)     {u32 localId, u32 len, bytes[len]} — CONN_DELIVER 레코드와 같은 의미(0x96 봉투가 열린 동안의 평문 송신).
//                      CONN_REF(3) {u32 localId, u32 ref, u32 value, u32 len, bytes[len]} — bytes 뒤에 DEF[ref]를 patchOff에 value(u32 LE)로
//                                  패치해 이은 것을 그 연결에 1건으로(CONN_DELIVER 1건과 같은 위치·의미). ref는 같은 봉투의 앞선 DEF여야 한다.
//                      봉투에 CONN·CONN_REF가 1개 이상(DEF만 = 레이아웃 위반).
// 예약(미구현 — 받으면 reserved_type 오류): 0xA0–0xC1 멀티 월드(CONN_ROUTE/ADOPT/…).
//
// 긴급 송신(writeUrgent)은 연결별 순서가 없는 피어 단위 메시지(ADMISSION·LISTEN·LISTEN_REPORT)와, 월드가 아무것도 쓴 적 없는 새 localId의 거절 쌍
// (DELIVER(KICK 9) + CONN_CLOSE — 바쁜 피어의 CONN_OPEN)에만 쓴다.
//
// 불변식:
//   - 배치 메시지(CONN_FRAMES·CONN_DELIVER·CONN_MULTICAST·CONN_DELIVER_SHARED)가 아닌 메시지는 열린 배치 봉투를 닫는다 ⇒ 연결별
//     STATE/DELIVER/MULTICAST/CLOSE 순서 = 월드 발행 순서(배치 type이 바뀌어도 봉투를 닫고 새로 연다). 배치 봉투는 분할 임계(기본 1 MiB)마다
//     새로 연다(순서 보존·수신 링 상한·게이트웨이 조기 팬아웃).
//   - CONN_DELIVER_SHARED(월드): 공유 프레임을 참조하는 연결 레코드는 그 프레임의 DEF와 같은 봉투에 있다(봉투가 바뀌면 DEF를 다시 쓴다).
//     0x96 봉투가 열린 동안의 평문 송신은 CONN 레코드로 붙는다(CONN_DELIVER로 바꾸면 봉투가 닫혀 DEF를 다시 써야 한다). 연결별 순서는
//     CONN_DELIVER와 같다 — 레코드 1개 = 그 연결의 송신 1건.
//   - MULTICAST 순서 규칙(월드): outbox가 빈 수신자만 싣는다 — 그 연결의 앞선 프레임은 이미 피어 배치에 있고, 뒤 프레임은 outbox를
//     거쳐 뒤 DELIVER로 간다. outbox에 프레임이 있는 수신자는 종전처럼 outbox에 복사한다(앞당겨 비우면 DELIVER 레코드가 늘어 손해).
//   - MULTICAST 순서 규칙(게이트웨이): 레코드를 스트림 순서로 적용하고 연결별 바이트를 레코드 순서로 잇는다. MULTICAST 바이트는 그
//     연결의 다음 DELIVER(합쳐 write 1회)·CONN_FLUSH·CONN_CLOSE(종료 전에 먼저)·엣지 KICK(앞에) 중 먼저 오는 때에 쓴다.
//   - 배치 봉투는 레코드를 1개 이상 담는다(빈 배치 = 레이아웃 위반).
//   - 게이트웨이가 다른 바이트와 합치지 않고 그대로 쓸 수 있는 클라 프레임 필드(MULTICAST bytes·DEF bytes)는 완성 클라 프레임 —
//     IPC_CLIENT_FRAME_MIN_BYTES(클라 헤더 바이트 수) 이상이다(4.5 리뷰: 게이트웨이는 첫 packetId를 읽는다 — 미만은 프로토콜 오류로
//     거절해 디코더 콜백 안 RangeError가 되지 않게). 월드 송신 경로가 애초에 완성 프레임만 싣던 불변식의 명시라(4.5 리뷰) 버전은 그대로다.
//   - HELLO·HELLO_ACK payload의 앞 u16 = ipcVer는 모든 버전에서 고정 — 버전 판정이 나머지 레이아웃 검증보다 먼저다.
//   - HELLO_NACK은 type·레이아웃 모두 모든 버전(v2~)에서 고정 — 버전이 다른 게이트웨이도 거절 사유(version 포함)를 읽는다.
//   - 핸드셰이크가 끝나기 전의 봉투는 IPC_HANDSHAKE_MAX_ENVELOPE_BYTES 이하(모든 버전 고정) — 인증 전 상대가 큰 봉투를 주장해
//     수신 링(최대 64 MiB)을 채우지 못한다.
//   - localId는 게이트웨이 incarnation 안에서 재사용하지 않는다(게이트웨이 몫 — 4.2b).
//   - 레이아웃·enum 범위 위반은 전부 프로토콜 오류다(관용 없음 — 버전이 다르면 IPC_VERSION을 올린다).

import { KICK_REASON, type LoginState } from "../identity/loginFlow";
import { FRAME_HEADER_BYTES } from "../net/wireFrame";

/**
 * IPC 프로토콜 버전 — 레이아웃·의미가 바뀌면 올린다. HELLO의 ipcVer가 다르면 월드가 HELLO_NACK(version) 후 끊는다.
 * v2 = HELLO token·HELLO_NACK. v3 = ADMISSION(성능 4.5 — 게이트웨이 부하 기반 접속 제한). v4 = CONN_MULTICAST·CONN_FLUSH(성능 4.5 F2).
 * v5 = CONN_DELIVER_SHARED(성능 4.5 F3 — 공유 프레임 정의 + 연결별 u32 패치). v6 = 클라 프레임 헤더 v2(4바이트 LE — 완성 클라 프레임 하한
 * IPC_CLIENT_FRAME_MIN_BYTES 4, 이진 전환 B1)·CONN_CLOSED LegacyFraming. v7 = C2S 본문 바이너리(이진 전환 B2b, 클라 protoVersion 5 — IPC 레이아웃은
 * v6 그대로). v8 = 고빈도 S2C 11개 본문 바이너리(이진 전환 B3b, 클라 protoVersion 6 — IPC 레이아웃은 그대로, 게이트웨이가 직접 쓰는 KICK이 바이너리).
 * v9 = 나머지 고정형 S2C 17개 본문 바이너리(이진 전환 B4, 클라 protoVersion 7 — IPC 레이아웃은 그대로). v10 = 인벤·상점 S2C 3개
 * (INVENTORY_LIST·INVENTORY_UPDATE·SHOP_LIST) 본문 바이너리(이진 전환 B5②b, 클라 protoVersion 8 — IPC 레이아웃은 그대로). v11 = 스킬·UI 설정
 * S2C 2개(SKILL_LIST·UI_PREFERENCES) 본문 바이너리(이진 전환 B5③b, 클라 protoVersion 9 — IPC 레이아웃은 그대로). v12 = NPC 대화·퀘스트
 * S2C 4개(NPC_DIALOG·QUEST_LIST·QUEST_ACTION_ACK·QUEST_NPC_MARKERS) 본문 바이너리(이진 전환 B5④b, 클라 protoVersion 10 — IPC 레이아웃은 그대로).
 * v13 = 캐릭터·포탈 S2C 4개(CHAR_STATS_FULL·CHAR_LEVEL_UP·PORTAL_LIST + CHAR_LIST CharSummary[] 형태 변경) 본문 바이너리 — S2C 전부 바이너리
 * (이진 전환 B5①b, 클라 protoVersion 11 — IPC 레이아웃은 그대로). v14 = LISTEN_REPORT(G→W 0x04)·LISTEN(W→G 0x86) — 공유 포트 리스너 양보
 * (자동 재접속 선결, 클라 protoVersion 11 그대로). v15 = CHAR_STATS_FULL.derived 추가(클라 protoVersion 12, IPC 레이아웃 그대로).
 * v16 = 자유 포인트 STAT_ALLOCATE·STAT_RESET·STAT_POINTS_ACK + CHAR_STATS_FULL.freePoints·allocatedPoints(클라 protoVersion 13, IPC 레이아웃 그대로).
 * v17 = 자유 포인트 요청 id(STAT_ALLOCATE·STAT_RESET·STAT_POINTS_ACK.requestId — 재전송 멱등, 클라 protoVersion 14, IPC 레이아웃 그대로).
 * v18 = INPUT_CMD.gait(걷기·달리기 — 클라 protoVersion 15, IPC 레이아웃 그대로).
 * v19 = ENTITY_SPAWN.monsterDefId(몬스터 def별 외형) + SkillInfo allowedRaces·bookOnly·bowRange·SkillDefEffectKind passive + SKILL_EFFECT
 *       variant·hitIndex(4타입 기본 스킬 — 활·연타) — 클라 protoVersion 16, IPC 레이아웃 그대로.
 * v20 = 생활 L-1 채집 패킷 0x0480–0x0485(GATHER_START·LIFE_CANCEL·LIFE_CHANNEL·LIFE_RESULT·LIFE_STATUS·NODE_CATALOG) + EntityType.resource,
 *       생활 L-2 제작 패킷 0x0490–0x0492(RECIPE_LIST·CRAFT_REQ·CRAFT_ACK) — 클라 protoVersion 17, IPC 레이아웃 그대로(생활 브랜치가 15·16으로
 *       쓰던 두 단계를 master 병합 때 한 번호로 묶었다).
 * v21 = 채집 미니게임 GATHER_PUZZLE(0x0486)·GATHER_TRACE(0x0487) + PuzzlePoint — 클라 protoVersion 18, IPC 레이아웃 그대로.
 * v22 = 채집 미니게임 원 짚기 — GATHER_PUZZLE.kind·circleRadius + GATHER_TAPS(0x0488) + PuzzleTap·GatherPuzzleKind — 클라 protoVersion 19, IPC 레이아웃 그대로.
 * 게이트웨이가 클라 와이어의 엣지 정책(수신 상한 = 스키마 최악 본문·프레이밍)을 집행하므로 **클라 protoVersion이 바뀌면 IPC_VERSION도
 * 올린다** — 다른 protoVersion 빌드의 게이트웨이·월드가 섞이지 않게 HELLO_NACK(version)이 막는다(tests/server/cluster/ipcHandshake.test.ts가 짝을 고정).
 */
export const IPC_VERSION = 22;

/** 봉투 길이 필드(u32 LE) 바이트. */
export const IPC_LEN_BYTES = 4;
/** 봉투 머리(길이 + type) 바이트. */
export const IPC_ENVELOPE_HEADER_BYTES = 5;
/** 봉투 전체(길이 필드 포함) 상한 — 수신 링 상한과 같다. */
export const IPC_MAX_ENVELOPE_BYTES = 64 * 1024 * 1024;
/** 핸드셰이크 전 봉투(길이 필드 포함) 상한 — 양방향, 모든 버전 고정. v2 HELLO 최대 = 4 + 1 + 13 + 255 = 273. */
export const IPC_HANDSHAKE_MAX_ENVELOPE_BYTES = 1024;
/** HELLO token 상한(u8 tokenLen). */
export const IPC_TOKEN_MAX_BYTES = 0xff;
/** 배치 봉투 분할 임계(len 기준) 기본값 — 4.0 교정 c(1–4 MB). */
export const IPC_DEFAULT_BATCH_SPLIT_BYTES = 1024 * 1024;
/** 봉투 상한 옵션의 하한 — 테스트 축소용 하한이자 고정 메시지(최대 17바이트)의 여유. */
export const IPC_MIN_ENVELOPE_BYTES = 1024;
/** HELLO 고정부: u16 ipcVer + u16 gatewayId + u32 incarnation + u32 pid + u8 tokenLen. */
export const IPC_HELLO_FIXED_BYTES = 13;
/** CONN_FRAMES 레코드 머리: u32 localId + u16 packetId + u32 bodyLen. */
export const IPC_FRAME_RECORD_HEADER = 10;
/** CONN_DELIVER 레코드 머리: u32 localId + u32 len. */
export const IPC_DELIVER_RECORD_HEADER = 8;
/** 완성 클라 프레임 최소 바이트 = 클라 와이어 헤더(net/wireFrame FRAME_HEADER_BYTES). MULTICAST·DEF bytes 하한. */
export const IPC_CLIENT_FRAME_MIN_BYTES = FRAME_HEADER_BYTES;
/** CONN_MULTICAST 레코드 고정부: u32 len + u16 n(+ 수신자당 u32 localId). */
export const IPC_MULTICAST_RECORD_FIXED = 6;
/** CONN_MULTICAST 레코드 1개의 수신자 상한(u16 n). 넘으면 송신 측이 레코드를 나눈다. */
export const IPC_MULTICAST_MAX_IDS = 0xffff;
/** CONN_DELIVER_SHARED 레코드 tag(u8). */
export const IPC_SHARED_TAG = { DEF: 1, CONN: 2, CONN_REF: 3 } as const;
/** DEF 머리: u8 tag + u32 len + u16 patchOff. */
export const IPC_SHARED_DEF_HEADER = 7;
/** CONN 머리: u8 tag + u32 localId + u32 len. */
export const IPC_SHARED_CONN_HEADER = 9;
/** CONN_REF 머리: u8 tag + u32 localId + u32 ref + u32 value + u32 len. */
export const IPC_SHARED_REF_HEADER = 17;

/** 봉투 상한 옵션 해석(기본 IPC_MAX_ENVELOPE_BYTES) — 범위 밖은 RangeError. writer·디코더 공용. */
export function resolveEnvelopeCap(v: number | undefined): number {
  const cap = v ?? IPC_MAX_ENVELOPE_BYTES;
  if (!Number.isInteger(cap) || cap < IPC_MIN_ENVELOPE_BYTES || cap > IPC_MAX_ENVELOPE_BYTES) {
    throw new RangeError(`ipc maxEnvelopeBytes must be an integer in [${IPC_MIN_ENVELOPE_BYTES}, ${IPC_MAX_ENVELOPE_BYTES}]: ${v}`);
  }
  return cap;
}

export const IPC_MSG = {
  HELLO: 0x01,
  PING: 0x02,
  BYE: 0x03,
  LISTEN_REPORT: 0x04,
  CONN_OPEN: 0x10,
  CONN_FRAMES: 0x11,
  CONN_CLOSED: 0x12,
  HELLO_ACK: 0x81,
  PONG: 0x82,
  SHUTDOWN: 0x83,
  HELLO_NACK: 0x84,
  ADMISSION: 0x85,
  LISTEN: 0x86,
  CONN_DELIVER: 0x90,
  CONN_STATE: 0x91,
  CONN_CLOSE: 0x92,
  CONN_ACCEPTED: 0x93,
  CONN_MULTICAST: 0x94,
  CONN_FLUSH: 0x95,
  CONN_DELIVER_SHARED: 0x96,
} as const;
export type IpcMsgType = (typeof IPC_MSG)[keyof typeof IPC_MSG];

/** 예약 type 판정 — 0xA0–0xC1 멀티 월드(0x94는 v4에서 CONN_MULTICAST로 개통). */
export function isReservedIpcType(type: number): boolean {
  return type >= 0xa0 && type <= 0xc1;
}

const G2W_TYPES: ReadonlySet<number> = new Set([
  IPC_MSG.HELLO,
  IPC_MSG.PING,
  IPC_MSG.BYE,
  IPC_MSG.LISTEN_REPORT,
  IPC_MSG.CONN_OPEN,
  IPC_MSG.CONN_FRAMES,
  IPC_MSG.CONN_CLOSED,
]);
const W2G_TYPES: ReadonlySet<number> = new Set([
  IPC_MSG.HELLO_ACK,
  IPC_MSG.PONG,
  IPC_MSG.SHUTDOWN,
  IPC_MSG.HELLO_NACK,
  IPC_MSG.ADMISSION,
  IPC_MSG.LISTEN,
  IPC_MSG.CONN_DELIVER,
  IPC_MSG.CONN_STATE,
  IPC_MSG.CONN_CLOSE,
  IPC_MSG.CONN_ACCEPTED,
  IPC_MSG.CONN_MULTICAST,
  IPC_MSG.CONN_FLUSH,
  IPC_MSG.CONN_DELIVER_SHARED,
]);

/** 메시지 방향 — 수신 측 디코더가 받는 방향. */
export type IpcDirection = "gatewayToWorld" | "worldToGateway";

export function ipcTypesOf(direction: IpcDirection): ReadonlySet<number> {
  return direction === "gatewayToWorld" ? G2W_TYPES : W2G_TYPES;
}

/** 게이트웨이가 클라 연결을 닫은 이유(CONN_CLOSED). */
export const CONN_CLOSED_REASON = {
  /** 클라가 끊었다. */
  Peer: 0,
  Idle: 1,
  Rate: 2,
  Size: 3,
  /** 클라 송신 꼬리 상한 초과(느린 소비자) 또는 부분 쓰기 실패. */
  Backlog: 4,
  Error: 5,
  GatewayShutdown: 6,
  /** 월드 CONN_CLOSE에 따른 종료 완료. */
  WorldRequested: 7,
  /** 게이트웨이 연결 상한. */
  Cap: 8,
  /** 구 v1 프레이밍 클라(v1 형식 KICK 1 후 종료 — 이진 전환 B1). */
  LegacyFraming: 9,
} as const;
export type ConnClosedReason = (typeof CONN_CLOSED_REASON)[keyof typeof CONN_CLOSED_REASON];

/** 게이트웨이가 IPC를 우아하게 끊는 이유(BYE). */
export const BYE_REASON = {
  /** 프로세스 종료. */
  Shutdown: 0,
  /** 롤링 재시작 — 슈퍼바이저가 곧 같은 GATEWAY_ID로 다시 띄운다. */
  Restart: 1,
} as const;
export type ByeReason = (typeof BYE_REASON)[keyof typeof BYE_REASON];

/** 월드가 HELLO를 거절한 이유(HELLO_NACK) — 값 = 와이어 u8(추가는 끝에만). */
export const HELLO_NACK_REASON = {
  /** 같은 GATEWAY_ID의 더 새 incarnation이 등록돼 이 incarnation은 은퇴했다(멈췄다 깨어난 옛 프로세스·중복 GATEWAY_ID). */
  Fenced: 0,
  /** 월드가 종료 중(stopAdmitting 이후)이거나 IPC 서버가 닫혔다 — 다음 월드에 다시 붙는다. */
  Closed: 1,
  /** ipcVer 불일치 — 같은 빌드로 재기동해야 풀린다. */
  Version: 2,
  /** HELLO token이 월드의 IPC_TOKEN과 다르다. */
  Auth: 3,
} as const;
export type HelloNackReason = (typeof HELLO_NACK_REASON)[keyof typeof HELLO_NACK_REASON];
/** HELLO_NACK 사유 → 로그·메트릭 라벨. 인덱스 = 와이어 값. */
export const HELLO_NACK_LABELS = ["fenced", "closed", "version", "auth"] as const;
export type HelloNackLabel = (typeof HELLO_NACK_LABELS)[number];

/** ADMISSION state(u8) — 이 피어의 신규 접속 판정. 그 밖의 값은 프로토콜 오류. */
export const ADMISSION_STATE = {
  /** 받는다(소프트 임계 해제 — 대기 ≤ clear가 hold 동안). */
  Open: 0,
  /** 거절한다(대기 ≥ soft) — 게이트웨이는 새 클라를 CONN_OPEN 전에 KICK 9 "server busy"로 돌려보낸다. */
  Busy: 1,
} as const;

/** LISTEN mode — listen: 클라 리스너를 연다(재개), yield: 공유 포트 그룹에서 잠시 빠진다(리스너 중지 — 이미 받은 연결은 그대로). */
export type ListenMode = "listen" | "yield";
/** LISTEN mode u8 ↔ ListenMode — 인덱스 = 와이어 값(그 밖의 값은 프로토콜 오류). */
export const LISTEN_MODES: readonly ListenMode[] = ["listen", "yield"];

/** LISTEN_REPORT flags 비트(그 밖의 비트는 프로토콜 오류). */
export const LISTEN_REPORT_FLAG = {
  /** reusePort 공유 포트 + 양보 기능 켬 — 같은 port의 shared 피어끼리 그룹(월드 계획기). */
  Shared: 0x01,
  /** 새 클라를 거절 중 — GatewayAdmission.active(월드 ADMISSION busy 포함) ∨ 연결 상한 닿음(히스테리시스 — gatewayListen.capReopenAt). */
  Closed: 0x02,
  /** 클라 리스너가 지금 열려 있다. */
  Listening: 0x04,
} as const;
/** 정의된 LISTEN_REPORT flags 비트 합. */
export const LISTEN_REPORT_FLAGS_MASK = 0x07;
/** LISTEN_REPORT payload: u8 flags + u16 port + u32 ackSeq. */
export const IPC_LISTEN_REPORT_BYTES = 7;
/** LISTEN payload: u8 mode + u32 seq. */
export const IPC_LISTEN_BYTES = 5;

/** CONN_STATE의 u8 ↔ LoginState — 순서가 와이어 값이다(추가는 끝에만, 바꾸면 IPC_VERSION을 올린다). */
export const IPC_LOGIN_STATES: readonly LoginState[] = ["ANON", "HELLO_RECV", "AUTHENTICATED", "IN_WORLD", "REJECT"];

const LOGIN_STATE_CODE: ReadonlyMap<LoginState, number> = new Map(IPC_LOGIN_STATES.map((s, i) => [s, i]));

/** LoginState → u8, 미지의 값은 -1. */
export function loginStateCode(state: LoginState): number {
  return LOGIN_STATE_CODE.get(state) ?? -1;
}

export interface HelloMsg {
  readonly type: typeof IPC_MSG.HELLO;
  readonly ipcVer: number;
  readonly gatewayId: number;
  /** 게이트웨이 프로세스 기동마다 새 값 — 월드의 재접속 펜싱 키(gatewayId와 함께). */
  readonly incarnation: number;
  readonly pid: number;
  /** 공유 비밀(IPC_TOKEN, 빈 값 가능). 디코더 콜백 동안만 유효한 뷰. */
  readonly token: Buffer;
}
export interface PingMsg {
  readonly type: typeof IPC_MSG.PING;
  readonly seq: number;
}
export interface ByeMsg {
  readonly type: typeof IPC_MSG.BYE;
  readonly reason: ByeReason;
}
/** 게이트웨이 클라 리슨 상태 스냅샷(v14) — 의미는 LISTEN_REPORT_FLAG. */
export interface ListenReportMsg {
  readonly type: typeof IPC_MSG.LISTEN_REPORT;
  readonly shared: boolean;
  readonly closed: boolean;
  readonly listening: boolean;
  readonly port: number;
  /** 마지막으로 적용한 LISTEN seq(0 = 이 월드 세션에서 없음). */
  readonly ackSeq: number;
}
export interface ConnOpenMsg {
  readonly type: typeof IPC_MSG.CONN_OPEN;
  readonly localId: number;
  readonly addr: string;
}
export interface ConnFrame {
  readonly localId: number;
  readonly packetId: number;
  /** 디코더 콜백 동안만 유효한 뷰 — 보관하려면 복사. */
  readonly body: Buffer;
}
export interface ConnFramesMsg {
  readonly type: typeof IPC_MSG.CONN_FRAMES;
  readonly frames: readonly ConnFrame[];
}
export interface ConnClosedMsg {
  readonly type: typeof IPC_MSG.CONN_CLOSED;
  readonly localId: number;
  readonly reason: ConnClosedReason;
}

export interface HelloAckMsg {
  readonly type: typeof IPC_MSG.HELLO_ACK;
  readonly ipcVer: number;
  readonly worldIncarnation: number;
  readonly connCap: number;
}
export interface HelloNackMsg {
  readonly type: typeof IPC_MSG.HELLO_NACK;
  /** 거절한 월드의 ipcVer(정보 — 게이트웨이는 버전과 무관하게 읽는다). */
  readonly ipcVer: number;
  readonly reason: HelloNackReason;
}
export interface PongMsg {
  readonly type: typeof IPC_MSG.PONG;
  readonly seq: number;
}
export interface ShutdownMsg {
  readonly type: typeof IPC_MSG.SHUTDOWN;
  readonly kickReason: number;
}
export interface ConnDelivery {
  readonly localId: number;
  /** 완성 클라 프레임(1개 이상 연접). 디코더 콜백 동안만 유효한 뷰. */
  readonly bytes: Buffer;
}
export interface ConnDeliverMsg {
  readonly type: typeof IPC_MSG.CONN_DELIVER;
  readonly deliveries: readonly ConnDelivery[];
}
export interface ConnStateMsg {
  readonly type: typeof IPC_MSG.CONN_STATE;
  readonly localId: number;
  readonly state: LoginState;
}
export interface ConnCloseMsg {
  readonly type: typeof IPC_MSG.CONN_CLOSE;
  readonly localId: number;
}
export interface AdmissionMsg {
  readonly type: typeof IPC_MSG.ADMISSION;
  /** true = 이 피어의 신규 접속을 거절한다(ADMISSION_STATE.Busy). */
  readonly busy: boolean;
}
/** 공유 포트 리스너 양보 지시(v14). */
export interface ListenMsg {
  readonly type: typeof IPC_MSG.LISTEN;
  readonly mode: ListenMode;
  /** 피어마다 1부터 단조 증가 — 게이트웨이가 LISTEN_REPORT ackSeq로 돌려준다. */
  readonly seq: number;
}
export interface ConnAcceptedMsg {
  readonly type: typeof IPC_MSG.CONN_ACCEPTED;
  readonly localId: number;
  readonly worldConnId: number;
}
export interface ConnCast {
  /** 같은 완성 클라 프레임(1개 이상 연접). 디코더 콜백 동안만 유효한 뷰 — 보관하려면 복사. */
  readonly bytes: Buffer;
  /** 수신 연결(1개 이상, 순서대로 적용 — 중복 = 중복 송신). 디코더가 복사한 배열. */
  readonly localIds: Uint32Array;
}
export interface ConnMulticastMsg {
  readonly type: typeof IPC_MSG.CONN_MULTICAST;
  readonly casts: readonly ConnCast[];
}
export interface ConnFlushMsg {
  readonly type: typeof IPC_MSG.CONN_FLUSH;
}
export interface SharedDef {
  /** 공유 프레임 바이트 — 디코더 콜백 동안만 유효한 뷰. 게이트웨이는 연결마다 patchOff를 제자리 패치해 쓴다. */
  readonly bytes: Buffer;
  readonly patchOff: number;
}
export interface SharedDelivery {
  readonly localId: number;
  /** 인라인 완성 클라 프레임(0개 이상 연접 — def가 없으면 1개 이상). 디코더 콜백 동안만 유효한 뷰. */
  readonly bytes: Buffer;
  /** CONN_REF면 이은 공유 프레임, CONN이면 null. */
  readonly def: SharedDef | null;
  /** def.patchOff에 쓸 u32(CONN은 0). */
  readonly value: number;
}
export interface ConnDeliverSharedMsg {
  readonly type: typeof IPC_MSG.CONN_DELIVER_SHARED;
  /** CONN·CONN_REF 레코드(스트림 순서). */
  readonly deliveries: readonly SharedDelivery[];
  /** 이 봉투의 DEF 수(관측). */
  readonly defCount: number;
}

export type GatewayToWorldMsg = HelloMsg | PingMsg | ByeMsg | ListenReportMsg | ConnOpenMsg | ConnFramesMsg | ConnClosedMsg;
export type WorldToGatewayMsg =
  | HelloAckMsg
  | HelloNackMsg
  | PongMsg
  | ShutdownMsg
  | ConnDeliverMsg
  | ConnStateMsg
  | ConnCloseMsg
  | ConnAcceptedMsg
  | AdmissionMsg
  | ListenMsg
  | ConnMulticastMsg
  | ConnFlushMsg
  | ConnDeliverSharedMsg;
export type IpcMsg = GatewayToWorldMsg | WorldToGatewayMsg;

/** 와이어 enum 검증 집합 — writer(기록 전 RangeError)·디코더(malformed) 공용. */
export const IPC_KICK_REASONS: ReadonlySet<number> = new Set(Object.values(KICK_REASON));
export const IPC_CLOSED_REASONS: ReadonlySet<number> = new Set(Object.values(CONN_CLOSED_REASON));
export const IPC_BYE_REASONS: ReadonlySet<number> = new Set(Object.values(BYE_REASON));
export const IPC_NACK_REASONS: ReadonlySet<number> = new Set(Object.values(HELLO_NACK_REASON));
export const IPC_ADMISSION_STATES: ReadonlySet<number> = new Set(Object.values(ADMISSION_STATE));
