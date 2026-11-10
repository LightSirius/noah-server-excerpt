// 수신 프레임 본문 → 핸들러 — 라우팅 사전 판정(디코드 전) → 본문 디코드 → 수신 패킷 메트릭 → 라우터 디스패치.
//
// 성능 4단계 4.1: tcpServer에서 분리. monolith는 엣지(clientEdge)가 size·rate 게이트를 통과시킨 프레임을, 4.2 월드는
// 게이트웨이가 CONN_FRAMES로 넘긴 레코드를 이 함수로 넣는다 — 판정·디코드·디스패치 경로가 모드 간에 같다. 호출자가 수신
// 디스패치 구간(deferSends)을 연다(송신 턴 끝 코얼레싱 — deferredSends.ts).
// 이진 전환 B2c:
//   - 사전 판정(packetAdmission.admitPacket — 미지 id → 상태 화이트리스트, 종전 라우터와 같은 메트릭)을 디코드 앞에서 한다. 거부한
//     프레임은 본문을 읽지 않고 버린다(본문 디코드는 생성 바이너리 코덱뿐 — JSON 본문 경로 없음, B6).
//   - 통과한(= 처리될) 패킷의 디코드 실패는 drop + `mmorpg_net_decode_error_total{packet_id,reason}` + 세션별 strike — 창
//     (NET_DECODE_WINDOW_MS) 안의 실패가 NET_DECODE_STRIKES를 넘으면 KICK 5 "malformed packets". B2b부터 정상 클라는 디코드 실패를 낼 수
//     없다(실패 = 변조·버그).
//   - 예외: ANON의 HELLO 디코드 실패는 구 프로토콜 클라(B1~B2a의 JSON HELLO) — 무킥 drop이면 HELLO_ACK를 기다리며 멈추므로 KICK 1(버전
//     불일치와 같은 통지)로 업데이트를 알리고 닫는다. strike가 아니다. 그 클라는 JSON KICK만 읽으므로 B3b부터 v2 헤더 + JSON 본문 고정 프레임
//     (net/wireFrame.ts LEGACY_JSON_KICK_FRAME)으로 보낸다.

import type { PlayerSession } from "./session";
import type { Dispatch } from "./packetRouter";
import { admitPacket, rejectUnknownPacket } from "./packetAdmission";
import { metrics, PacketIdCounter, packetIdLabel, packetIdMetricLabel } from "../obs/metrics";
import { createLogger } from "../obs/logger";
import { suppressedMeta } from "../obs/logSquelch";
import { wireWarnSquelch } from "./wireWarn";
import { decodeC2S } from "../net/wireCodec.generated";
import { NO_CODEC, lastDecodeError, wireErrorName } from "../net/wire/runtime";
import { PACKET_ID } from "../net/codec.generated";
import { KICK_REASON } from "../identity/loginFlow";
import type { StrikePolicy } from "../net/rateLimit";
import { LEGACY_KICK_DETAIL } from "../net/wireFrame";
import { kickAndClose, kickLegacyJsonClient } from "./clientEdge";

/** 분리 전 tcpServer와 같은 mod — 운영 로그 grep 호환. */
const log = createLogger("tcp");
/** 수신 핫패스 메트릭 핸들(성능 3단계 슬라이스 5) — 패킷마다 라벨 키를 만들지 않는다. */
const rxPackets = new PacketIdCounter(metrics.netPacketsRx);

/** HELLO 디코드 실패 KICK 1의 detail — 구 형식 KICK 고정 프레임(net/wireFrame.ts LEGACY_JSON_KICK_FRAME·LEGACY_KICK_FRAME)의 안내 그대로. */
export const UNDECODABLE_HELLO_DETAIL = LEGACY_KICK_DETAIL;
/** 디코드 실패 strike 초과 KICK 5의 detail. */
export const DECODE_STRIKE_KICK_DETAIL = "malformed packets";

/** 생성 디코더가 던졌다 — 코드젠 회귀(정상은 던지지 않는다). 사유 이름은 WIRE_ERROR 밖의 "Threw". */
const DECODER_THREW: unique symbol = Symbol("decoderThrew");

/**
 * 디코드 실패 사유(`mmorpg_net_decode_error_total`의 reason 라벨) — 유한 집합: wireErrorName이 내는 WIRE_ERROR 이름(+ 모르는 코드의
 * "Unknown")과 디코더 예외 "Threw". 그 밖의 값은 타입이 막는다.
 */
export type DecodeErrorReason = ReturnType<typeof wireErrorName> | "Threw";

/**
 * 디코드 실패 strike 기본 — 10초 창에서 5건을 넘으면(6번째) KICK 5. maxDrops 0 = KICK 끔(drop·메트릭만).
 * env NET_DECODE_STRIKES·NET_DECODE_WINDOW_MS를 worldMain이 configureDecodeStrikes로 주입한다.
 */
export const DEFAULT_DECODE_STRIKES: StrikePolicy = { windowMs: 10_000, maxDrops: 5 };

let decodeStrikePolicy: StrikePolicy = DEFAULT_DECODE_STRIKES;
let strikeClock: () => number = Date.now;

/** 부팅 시 worldMain이 env로 1회 설정. now = 시험용 주입 시계(미지정 = Date.now). 시험은 바꾼 뒤 기본값으로 복원한다. */
export function configureDecodeStrikes(opts: { strikes: number; windowMs: number; now?: () => number }): void {
  decodeStrikePolicy = { windowMs: opts.windowMs, maxDrops: opts.strikes };
  strikeClock = opts.now ?? Date.now;
}

/**
 * 프레임 1개 — 사전 판정 → body(호출 동안만 유효한 뷰여도 된다) 디코드 → 디스패치. 거부·디코드 실패는 drop(디코드 실패는 strike —
 * 초과 시 KICK 5, ANON의 HELLO는 KICK 1). 디코드에 성공해 디스패치하는 프레임만 수신 패킷으로 센다.
 */
export function ingestFrame(session: PlayerSession, packetId: number, body: Buffer, dispatch: Dispatch): void {
  if (!admitPacket(session, packetId)) return;
  const payload = decodeSafely(packetId, body);
  if (payload === NO_CODEC) {
    rejectUnknownPacket(session, packetId);
    return;
  }
  if (payload === null || payload === DECODER_THREW) {
    onUndecodable(session, packetId, payload === null ? wireErrorName(lastDecodeError()) : "Threw");
    return;
  }
  rxPackets.inc(packetId);
  dispatch(session, packetId, payload);
}

/**
 * 생성 디코더는 던지지 않는다(런타임 계약 + wireCodec 퍼징) — 그래도 코드젠 회귀로 던지면 uncaught 크래시 핸들러가 프로세스를
 * 내리므로(obs 크래시 정책) 패킷 1개가 월드 전체를 끝내지 않게 여기서 흡수해 디코드 실패로 처리한다. 스택은 id별 스쿼시 error 로그로 남긴다.
 */
function decodeSafely(packetId: number, body: Buffer): ReturnType<typeof decodeC2S> | typeof DECODER_THREW {
  try {
    return decodeC2S(packetId, body);
  } catch (err) {
    const sup = wireWarnSquelch.allow(`threw:${packetId}`);
    if (sup >= 0) log.error(suppressedMeta({ packetId: packetIdLabel(packetId), err }, sup), "binary decoder threw — codegen bug");
    return DECODER_THREW;
  }
}

/**
 * 사전 판정을 통과한 패킷의 디코드 실패 — ANON의 HELLO는 KICK 1, 그 밖은 메트릭·경고 + strike. 디코더 예외(Threw)는 서버 쪽 결함이라
 * 클라에 불이익을 주지 않는다 — strike도, ANON HELLO의 KICK 1·legacy_hello 계수도 없다(코드젠 회귀가 정상 클라를 줄줄이 끊거나 구 클라
 * 유입으로 오독되지 않게 — 메트릭 reason="Threw"와 error 로그로만 드러낸다. HELLO가 막힌 연결은 pre-auth 데드라인이 정리한다).
 */
function onUndecodable(session: PlayerSession, packetId: number, reason: DecodeErrorReason): void {
  if (reason === "Threw") {
    onDecodeError(session, packetId, "binary decoder threw — dropped", reason);
    return;
  }
  if (packetId === PACKET_ID.HELLO && session.state === "ANON") {
    rejectUndecodableHello(session, reason);
    return;
  }
  onDecodeError(session, packetId, "invalid binary payload", reason);
  recordDecodeStrike(session);
}

/**
 * ANON의 HELLO 디코드 실패 = 구 프로토콜 클라(바이너리 HELLO 이전의 JSON HELLO) — helloHandler의 버전 불일치와 같은 KICK 1 + 종료
 * (디코드 오류 메트릭 + connRejected{reason="legacy_hello"} — 구 v1 프레이밍 거절 legacy_framing과 짝). strike는 세지 않는다.
 * 그 클라(B1~B2a)는 JSON KICK만 읽으므로 KICK은 v2 헤더 + JSON 본문 고정 프레임이다(B3b — clientEdge.kickLegacyJsonClient). ANON 밖의 HELLO는
 * 사전 판정이 상태 거부로 버린다(디코드 전).
 */
function rejectUndecodableHello(session: PlayerSession, reason: DecodeErrorReason): void {
  onDecodeError(session, PACKET_ID.HELLO, "undecodable HELLO — kicked (client update required)", reason);
  metrics.connRejected.inc({ reason: "legacy_hello" });
  kickLegacyJsonClient(session);
}

/** 디코드 실패 — 메트릭(packet_id·reason) + IP별 스쿼시 경고. */
function onDecodeError(session: PlayerSession, packetId: number, msg: string, reason: DecodeErrorReason): void {
  metrics.netDecodeError.inc({ packet_id: packetIdMetricLabel(packetId), reason });
  const sup = wireWarnSquelch.allow(`wire:${session.remoteAddress ?? session.connId}`);
  if (sup < 0) return;
  log.warn(suppressedMeta({ packetId: packetIdLabel(packetId), connId: session.connId, reason }, sup), msg);
}

/**
 * 디코드 실패 strike 1건 — 창 안 실패가 상한을 넘으면(net/rateLimit StrikeWindow: 창 안 maxDrops+1번째) KICK 5 + 종료. 킥 뒤의 프레임은
 * 처리되지 않는다(엣지·월드 IPC 서버가 종료 중 링크의 입력을 버린다).
 */
function recordDecodeStrike(session: PlayerSession): void {
  const policy = decodeStrikePolicy;
  if (policy.maxDrops === 0 || !session.decodeStrikes.record(policy, strikeClock())) return;
  metrics.netDecodeKick.inc({ state: session.state });
  const sup = wireWarnSquelch.allow(`dkick:${session.remoteAddress ?? session.connId}`);
  if (sup >= 0) {
    log.warn(
      suppressedMeta({ connId: session.connId, state: session.state, strikes: policy.maxDrops, windowMs: policy.windowMs }, sup),
      "decode failures over the strike limit — kicked",
    );
  }
  kickAndClose(session, KICK_REASON.Cheat, DECODE_STRIKE_KICK_DETAIL);
}
