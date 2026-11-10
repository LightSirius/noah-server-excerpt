// 송신 단위 인코드 실패 방어층(이진 전환 B4).
//
// 값의 와이어 상한은 상류(데이터 로더 i32·이름 상한, 데미지 clamp, id 대역 순환, tickIndex 정규화 등)가 보장한다. 그 보장이 깨져도 존 tick 안
// 송신(이벤트 팬아웃 sendMany·sendTo·스냅샷 SPAWN/DESPAWN 프레임)의 예외가 그 존 tick의 남은 단계(킬 처리·스냅샷·tickIndex 증가)를 건너뛰지
// 않게, 송신 경로가 인코드 실패를 **그 패킷 하나만** 버리는 것으로 바꾼다: 생성 인코더의 WireEncodeError(정수 범위·비유한·string max·짝 없는
// 서로게이트·enum·스키마 밖 id)와 프레임 body u16 초과(FrameBodyTooLargeError — 원시 프레임 경로 net/wireFrame.ts의 헤더 용량 검사. 생성 인코더
// 경로에서는 스키마가 패킷별 최악 본문 ≤ 65535를 강제해 닿지 않는다 — 코드젠 결함이 그 보장을 깨도 tick을 멈추지 않게 남긴 방어 겹, 이진 전환 B6
// 결정). 버린 패킷은 `mmorpg_net_encode_error_total{packet_id}`
// (팬아웃은 1회 인코딩이라 수신자 수와 무관하게 1)과 packet id별 스쿼시 warn으로 남는다. 그 밖의 예외(코드 결함 — TypeError 등)는 다시 던진다.
//
// 비용: try/catch는 인코드 1회를 감싼 작은 함수(encodeOrDrop·PlayerSession.appendOrDrop) 안에만 있다 — 정상 경로는 예외가 없으므로 분기·할당이 늘지
// 않는다(팬아웃은 첫 실수신자에서 1회 인코딩 그대로). 인코드는 프레임을 만들기 전에 던지므로(packetWriter·frameOutbox 커밋 규칙) 버린 패킷의
// 부분 바이트는 어디에도 남지 않는다. 미리 인코딩한 프레임을 나르는 sendFrame·sendShared(SNAPSHOT_DELTA 빠른 경로·공유 프레임)는 송신 시점에
// 인코드가 없다 — 그 프레임은 손으로 쓴 typed-array 경로이고 원소 수는 분할(H1)이 u16 안으로 묶는다.
// KICK 송신 실패 = 종료 계약(clientEdge sendFrameAndClose — 인코드도 자기 try 안)은 이 층과 무관하게 그대로다.

import type { PayloadOf, S2CPacketId } from "../net/codec.generated";
import { WireEncodeError } from "../net/wire/runtime";
import { FrameBodyTooLargeError } from "../net/wireFrame";
import { createLogger } from "../obs/logger";
import { createSquelch, suppressedMeta } from "../obs/logSquelch";
import { PacketIdCounter, metrics, packetIdLabel, packetIdMetricLabel } from "../obs/metrics";
import { writePacket } from "./packetWriter";

const log = createLogger("net.encode");
const encodeErrors = new PacketIdCounter(metrics.netEncodeError);
// 같은 결함은 tick마다(20/s) 반복된다 — packet id별 5초에 1줄, 버스트 3(존 tick 예외 스쿼시와 같은 값). 억제 건수는 다음 줄의 suppressed.
const encodeWarnSquelch = createSquelch({ ratePerSec: 0.2, burst: 3 });

/** 송신 단위로 버릴 인코드 실패인가 — 생성 인코더 거부 또는 프레임 body u16 초과. */
export function isEncodeFailure(err: unknown): err is WireEncodeError | FrameBodyTooLargeError {
  return err instanceof WireEncodeError || err instanceof FrameBodyTooLargeError;
}

/**
 * 인코드 실패면 그 패킷을 버린 것으로 기록(메트릭 + 스쿼시 warn)하고 true, 그 밖의 예외면 false(호출자가 다시 던진다).
 * connId는 수신자가 1명인 경로(세션 send)만 — 팬아웃은 생략.
 */
export function recordEncodeDrop(packetId: number, err: unknown, connId?: number): boolean {
  if (!isEncodeFailure(err)) return false;
  encodeErrors.inc(packetId);
  const sup = encodeWarnSquelch.allow(packetIdMetricLabel(packetId));
  if (sup >= 0) {
    const meta: Record<string, unknown> = { packetId: packetIdLabel(packetId), err: err.message };
    if (err instanceof WireEncodeError) meta["path"] = err.path;
    if (connId !== undefined) meta["connId"] = connId;
    log.warn(suppressedMeta(meta, sup), "outbound packet dropped — encode failed (upstream bound missing)");
  }
  return true;
}

/** writePacket과 같은 프레임, 인코드 실패면 null(기록됨 — 호출자는 그 패킷만 건너뛴다). 그 밖의 예외는 던진다. */
export function encodeOrDrop<I extends S2CPacketId>(packetId: I, payload: PayloadOf<I>, connId?: number): Buffer | null {
  try {
    return writePacket(packetId, payload);
  } catch (err) {
    if (recordEncodeDrop(packetId, err, connId)) return null;
    throw err;
  }
}
