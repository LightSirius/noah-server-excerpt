// 세션 송신 표면(ClientLink) — PlayerSession이 클라 연결로 바이트를 보내고 닫는 유일한 경로(`session.socket`).
//
// 성능 4단계(게이트웨이 분리) 4.1 이음새: 세션·핸들러·존은 링크 구현을 모른다.
//   로컬(monolith, 4.2 이후 게이트웨이 소켓): OutboundLink — Bun 소켓 직접 write, 부분 쓰기 꼬리·drain·flush 후 end
//   원격(4.2 월드): RemoteClientLink(cluster/remoteClientLink.ts) — send → 게이트웨이로 CONN_DELIVER 레코드, end → CONN_CLOSE,
//     setState → CONN_STATE
//
// 계약(OutboundLink 상단 불변식과 같다):
//   - send(buf, …): 완성 프레임(1개 이상 연접). buf는 호출 동안만 유효 — 보관하려면 복사(세션 outbox·팬아웃 프레임 재사용).
//     반환 = 수락 여부. closing 이후·이 호출에서 종료됐으면 false(호출자는 송신 메트릭을 집계하지 않는다).
//   - end(): 우아한 종료 — 첫머리에 beforeEnd(세션 outbox flush)를 1회 부르고, 앞서 수락한 바이트 뒤에 닫힌다. idempotent.
//   - dispose(): transport가 이미 닫혔다는 통지(close 콜백 첫 줄) — 대기 바이트 폐기, 재종료 없음. idempotent.
//   - flush(): transport drain 통지 — 대기 바이트를 이어 보낸다(원격 링크는 무동작 — IPC 백프레셔는 게이트웨이 단위).
//   - setState?(state): 로그인 상태 전이 통지(setSessionState가 전이 직후 1회). 로컬은 미구현 — 엣지가 세션 상태를 직접
//     읽는다. 원격은 게이트웨이의 rate·idle·pre-auth 미러를 바꾼다 — 핸들러가 전이를 응답보다 먼저 하므로 클라가 다음
//     단계 패킷을 보내기 전에 게이트웨이 정책이 바뀐다. 원격은 STATE 전에도 beforeEnd(세션 outbox flush)를 부른다 — 연결별
//     STATE/DELIVER/CLOSE 순서 = 세션 발행 순서.
//   - 재진입: 로컬 end()/send() 안에서 Bun close 콜백(sessionLifecycle.closeSession)이 동기 실행될 수 있다(outboundLink.ts).
//   - castRoute?(성능 4.5 F2): 원격 링크의 MULTICAST 경로(게이트웨이 피어 + localId) — sessionManager.sendMany가 같은 프레임의 수신자를
//     피어별로 묶어 CONN_MULTICAST 레코드 1개로 보낸다(castFanout.ts). 로컬 링크·IPC_MULTICAST=0은 없음(종전 경로).
//   - sharedRoute?(성능 4.5 F3): 원격 링크의 공유 프레임 경로 — send(inline + 패치한 frame)과 같은 계약·같은 클라 바이트를 게이트웨이 봉투의
//     프레임 정의 1회 + 연결별 참조로 보낸다(CONN_DELIVER_SHARED). 세션은 참조를 outbox에 둘 때 frame.hold(sink)로 피어별 보관자를 세고,
//     outbox가 끝 공유 참조를 들고 있을 때만 uncork가 send를 부른다. 로컬 링크·IPC_SHARED=0은 없음(세션이 복사·패치해 send).

import type { LoginState } from "../identity/loginFlow";
import type { SharedFrame } from "../net/sharedFrame";

/** MULTICAST 싱크 — 원격 링크의 게이트웨이 피어. 같은 프레임을 같은 싱크의 연결 여럿에 레코드 1개로 보낸다. */
export interface CastSink {
  /**
   * frame(완성 클라 프레임 1개 이상 연접, 복사)을 localIds[0..count) 연결들에 — 각 연결의 연결별 순서상 지금 위치의 송신 1건이다.
   * false = 기록하지 않았다(싱크 유실·바이트가 줄지 않음·봉투 상한 초과) — 호출자가 연결별 경로로 보낸다.
   */
  multicast(frame: Uint8Array, localIds: Uint32Array, count: number): boolean;
}

/** 링크의 MULTICAST 경로 — sink 객체 동일성이 묶음 키(게이트웨이 1개 = 레코드 1개). */
export interface CastRoute {
  readonly sink: CastSink;
  readonly localId: number;
}

/** 링크의 공유 프레임 경로(성능 4.5 F3) — sink 객체 동일성이 보관자 집계 키(SharedFrame.hold — 게이트웨이 1개). */
export interface SharedRoute {
  readonly sink: object;
  /**
   * inline(완성 프레임 0개 이상) 뒤에 frame(patchOff에 value u32 LE)을 이은 바이트를 send와 같은 계약으로. 둘 다 호출 동안만 읽는다.
   * frameCount = inline 프레임 수 + 1.
   */
  send(inline: Buffer, frame: SharedFrame, value: number, firstPacketId: number, frameCount: number): boolean;
}

export interface ClientLink {
  /** 클라 원격 주소(로컬 = 소켓, 원격 = 게이트웨이가 CONN_OPEN에 실은 실제 클라 IP). */
  readonly remoteAddress: string | undefined;
  /** end 요청 또는 종료 이후 — 새 프레임은 버려진다. */
  readonly closing: boolean;
  send(buf: Buffer, firstPacketId: number, frameCount: number): boolean;
  /** 대기 바이트에 extraBytes를 더하면 상한(OUTBOUND_MAX_BYTES)을 넘는가 — 세션이 지연 outbox를 일찍 보낼 시점. */
  exceedsBacklogCap(extraBytes: number): boolean;
  flush(): void;
  end(): void;
  dispose(): void;
  setState?(state: LoginState): void;
  /** MULTICAST 경로(원격 링크·IPC_MULTICAST=1). 로컬 링크는 없음. */
  readonly castRoute?: CastRoute | null;
  /** 공유 프레임 경로(원격 링크·IPC_SHARED=1). 로컬 링크는 없음. */
  readonly sharedRoute?: SharedRoute | null;
}

/** 세션 생성 시 링크를 만드는 함수 — beforeEnd: end() 첫머리에 1회 부를 세션 outbox flush(원격 링크는 setState 첫머리에도). */
export type ClientLinkFactory = (beforeEnd: () => void) => ClientLink;
