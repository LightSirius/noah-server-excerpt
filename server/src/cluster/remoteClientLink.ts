// 원격 세션 링크(월드 쪽) — 게이트웨이 경유 클라 연결의 ClientLink 구현(성능 4단계 4.2b). 세션·핸들러·존은 로컬
// OutboundLink와 같은 계약(network/clientLink.ts)으로 쓴다.
//
//   send(buf)   → 피어 배치에 CONN_DELIVER 레코드(완성 클라 프레임, 복사). 피어가 죽었으면 false — 링크를 종료 상태로
//                 고정한다(OutboundLink의 닫힌 소켓 -1과 같은 "기존 종료 경로": 호출자는 송신 메트릭을 집계하지 않고, 세션
//                 정리는 월드 IPC 서버의 피어 유실 처리 — closeSessions 배치 저장 — 가 한다).
//   end()       → 세션 outbox를 먼저 보낸 뒤(flushSession) CONN_CLOSE — 게이트웨이가 앞선 바이트를 클라에 다 쓴 뒤 닫고
//                 CONN_CLOSED(WorldRequested)로 답하면 월드가 closeSession한다(monolith close 콜백과 같은 순서, 비동기일 뿐).
//   setState(s) → 세션 outbox를 먼저 보낸 뒤 CONN_STATE — 연결별 STATE/DELIVER/CLOSE 순서 = 세션 발행 순서(코덱의 순서 규칙:
//                 비배치 메시지가 열린 DELIVER 봉투를 닫는다). 핸들러는 전이를 응답보다 먼저 하므로(helloHandler·authHandler·
//                 enterWorld) 게이트웨이는 클라가 다음 단계 패킷을 보내기 전에 rate·idle·pre-auth 미러를 바꾼다.
//   dispose()   → 게이트웨이가 이미 닫았다(CONN_CLOSED·피어 유실) — 이후 송신·CONN_CLOSE 없음.
//   flush()     → 무동작(drain은 게이트웨이의 로컬 OutboundLink 몫, IPC 백프레셔는 파이프 단위).
//   castRoute   → MULTICAST 경로(성능 4.5 F2, cast 싱크를 받았을 때만 — 월드 IPC 서버가 IPC_MULTICAST=1이면 피어를 넘긴다). 묶음·순서
//                 규칙은 network/castFanout.ts(outbox가 빈 세션만 — PlayerSession.castRoute). 피어 유실 시 MULTICAST는 false를
//                 돌려주고 연결별 경로(send → false)가 이 링크를 종료 상태로 고정한다.
//   sharedRoute → 공유 프레임 경로(성능 4.5 F3, 공유 싱크를 받았을 때만 — IPC_SHARED=1). 세션 outbox의 인라인 + 끝 공유 참조(SNAPSHOT_DELTA
//                 묶음)를 CONN_DELIVER_SHARED의 CONN_REF로(피어가 프레임을 봉투당 1회 DEF). send와 같은 종료·유실 규칙.
//
// 재진입: 로컬 링크와 달리 end()가 closeSession을 동기 실행하지 않는다(게이트웨이 왕복 뒤 CONN_CLOSED). 피어 기록은
// 파이프를 닫을 수 있지만(대기 상한) close 통지는 마이크로태스크라 송신 경로 안에서 세션 정리가 재진입하지 않는다.

import type { CastRoute, CastSink, ClientLink, SharedRoute } from "../network/clientLink";
import { outboundCapBytes } from "../network/outboundLink";
import type { SharedFrame } from "../net/sharedFrame";
import type { LoginState } from "../identity/loginFlow";
import { createLogger } from "../obs/logger";

const log = createLogger("ipc.world");

/** 공유 프레임 싱크(성능 4.5 F3, GatewayPeer) — CONN_DELIVER_SHARED의 CONN_REF(필요하면 DEF를 앞에)로 쓴다. */
export interface SharedDeliverSink {
  /** inline 뒤 frame(patchOff에 value)을 그 연결에 1건으로(둘 다 복사). false = 피어 유실(기록하지 않음). */
  deliverShared(localId: number, inline: Uint8Array, frame: SharedFrame, value: number): boolean;
}

/** 링크가 쓰는 게이트웨이 피어 송신 표면(GatewayPeer). */
export interface PeerOutbound {
  /** 완성 클라 프레임(1개 이상 연접, 복사) → CONN_DELIVER 레코드. false = 피어 유실(기록하지 않음). */
  deliver(localId: number, bytes: Uint8Array): boolean;
  /** CONN_STATE — 피어 유실이면 무동작. */
  connState(localId: number, state: LoginState): void;
  /** CONN_CLOSE — 피어 유실이면 무동작. */
  connClose(localId: number): void;
}

export class RemoteClientLink implements ClientLink {
  readonly castRoute: CastRoute | null;
  /** 공유 프레임 경로(공유 싱크를 받았을 때만 — 없으면 세션이 복사·패치해 send). */
  readonly sharedRoute: SharedRoute | null;
  private endRequested = false;
  private terminated = false;

  /**
   * flushSession: end()·setState() 첫머리에 부를 세션 outbox flush(ClientLinkFactory의 beforeEnd).
   * cast: MULTICAST 싱크(보통 peer 자신) — null이면 MULTICAST 경로 없음(IPC_MULTICAST=0, 종전 연결별 DELIVER만).
   * shared: 공유 프레임 싱크(보통 peer 자신, 성능 4.5 F3) — null이면 공유 경로 없음(IPC_SHARED=0 — 클라 바이트는 같다).
   */
  constructor(
    private readonly peer: PeerOutbound,
    readonly localId: number,
    readonly remoteAddress: string | undefined,
    private readonly flushSession: (() => void) | null = null,
    cast: CastSink | null = null,
    shared: SharedDeliverSink | null = null,
  ) {
    this.castRoute = cast === null ? null : { sink: cast, localId };
    this.sharedRoute =
      shared === null ? null : { sink: shared, send: (inline, frame, value) => this.deliverShared(shared, inline, frame, value) };
  }

  get closing(): boolean {
    return this.endRequested || this.terminated;
  }

  send(buf: Buffer, _firstPacketId: number, _frameCount: number): boolean {
    if (this.closing) return false;
    if (buf.length === 0) return true;
    if (this.peer.deliver(this.localId, buf)) return true;
    this.terminated = true;
    return false;
  }

  /** 세션 지연 outbox가 상한을 넘었는가 — 넘으면 세션이 턴 끝을 기다리지 않고 피어 배치로 보낸다(메모리 상한). */
  exceedsBacklogCap(extraBytes: number): boolean {
    return extraBytes > outboundCapBytes();
  }

  flush(): void {}

  end(): void {
    if (this.closing) return;
    this.runFlushSession();
    if (this.closing) return; // flush가 피어 유실을 만났다.
    this.endRequested = true;
    this.peer.connClose(this.localId);
  }

  dispose(): void {
    this.terminated = true;
  }

  setState(state: LoginState): void {
    if (this.closing) return;
    this.runFlushSession();
    if (this.closing) return;
    this.peer.connState(this.localId, state);
  }

  /** sharedRoute.send 본체 — send와 같은 규칙(종료 중 false, 피어 유실이면 종료 상태로 고정). */
  private deliverShared(sink: SharedDeliverSink, inline: Buffer, frame: SharedFrame, value: number): boolean {
    if (this.closing) return false;
    if (sink.deliverShared(this.localId, inline, frame, value)) return true;
    this.terminated = true;
    return false;
  }

  private runFlushSession(): void {
    if (this.flushSession === null) return;
    try {
      this.flushSession();
    } catch (err) {
      log.error({ err, localId: this.localId }, "session outbox flush before IPC control message failed");
    }
  }
}
