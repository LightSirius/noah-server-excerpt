// 라우팅 사전 판정(이진 전환 B2c) — 수신 프레임을 본문 디코드 전에 거른다. 판정의 유일한 정의: frameIngest가 디코드 앞에서 부르고,
// 라우터(packetRouter.dispatch)는 통과한 프레임만 받아 다시 보지 않는다(메트릭 이중 계수 없음).
//
// 순서는 종전 라우터와 같다 — ① 미지 id(스키마의 C2S id가 아님 — S2C id·미지 id) → `mmorpg_router_unknown_packet_total{packet_id}`
// ② 상태 화이트리스트(loginFlow.isPacketAllowedInState) → `mmorpg_router_state_rejected_total{packet_id,state}`. 거부한 프레임은 디코드하지
// 않으므로 디코드 오류 메트릭·strike에 잡히지 않는다(종전엔 디코드부터 해서 미인증 연결이 임의 id의 decode_error를 부풀릴 수 있었다).
// "라우팅되는 id = 스키마의 C2S id"이고, createRouter가 부팅 때 그 집합과 핸들러 표가 같은지 검사한다(packetRouter.assertRoutesMatchSchema).
// 핸들러 그래프를 싣지 않는 가벼운 모듈이다 — frameIngest(월드 IPC 서버·monolith 엣지)가 import한다.

import type { PlayerSession } from "./session";
import { PACKET_DIRECTION } from "../net/codec.generated";
import { isPacketAllowedInState } from "../identity/loginFlow";
import { metrics, packetIdLabel, packetIdMetricLabel } from "../obs/metrics";
import { createLogger } from "../obs/logger";
import { createSquelch, suppressedMeta } from "../obs/logSquelch";

/** 분리 전 라우터와 같은 mod — 운영 로그 grep 호환. */
const log = createLogger("router");

// 미지 패킷/상태 거부는 무킥 드롭 — warn 증폭을 conn당 1/s 버스트 3 + 전역 20/s로 캡.
const routerWarnSquelch = createSquelch({
  ratePerSec: 1,
  burst: 3,
  globalRatePerSec: 20,
  globalBurst: 40,
});

/** 라우팅되는 id — 스키마의 C2S 패킷(B2b부터 전부 바이너리 코덱이 있다). */
export function isRoutedPacket(packetId: number): boolean {
  return PACKET_DIRECTION[packetId] === "C2S";
}

/** 사전 판정 — true면 디코드·디스패치 진행, false면 거부를 세고(메트릭 + 스쿼시 경고) 버린다. */
export function admitPacket(session: PlayerSession, packetId: number): boolean {
  if (!isRoutedPacket(packetId)) {
    rejectUnknownPacket(session, packetId);
    return false;
  }
  if (isPacketAllowedInState(packetId, session.state)) return true;
  const idLabel = packetIdMetricLabel(packetId);
  metrics.routerStateRejected.inc({ packet_id: idLabel, state: session.state });
  const sup = routerWarnSquelch.allow(`state:${session.remoteAddress ?? session.connId}`);
  if (sup >= 0) {
    log.warn(
      suppressedMeta({ packetId: idLabel, state: session.state, connId: session.connId }, sup),
      "packet not allowed in state",
    );
  }
  return false;
}

/**
 * 미지 패킷 거부 — admitPacket, 그리고 C2S인데 생성 디코더가 NO_CODEC을 낸 id(frameIngest — 스키마 시험이 막는 불일치의 방어,
 * 같은 처리로 버린다).
 */
export function rejectUnknownPacket(session: PlayerSession, packetId: number): void {
  metrics.routerUnknownPacket.inc({ packet_id: packetIdMetricLabel(packetId) });
  const sup = routerWarnSquelch.allow(`unk:${session.remoteAddress ?? session.connId}`);
  if (sup >= 0) {
    log.warn(suppressedMeta({ packetId: packetIdLabel(packetId), connId: session.connId }, sup), "unknown packet");
  }
}
