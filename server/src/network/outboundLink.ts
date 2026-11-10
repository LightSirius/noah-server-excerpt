// 1-C(3) 송신 백프레셔 — 세션의 Bun 소켓 래퍼.
//
// Bun TCP socket.write는 커널 송신 버퍼가 차면 일부 바이트만 쓰고 그 수를 반환하며, 나머지를
// 대신 버퍼링하지 않는다(재시도는 drain 콜백에서 호출자 몫). 종전엔 부분 쓰기 = 즉시 세션 종료라
// 과부하·느린 회선에서 커널 버퍼가 잠깐만 차도 세션이 끊겼다. 여기서는 못 보낸 꼬리를 보관했다가
// drain 때 이어 쓴다. 불변식:
//   - 꼬리가 남아 있는 동안 새 프레임은 직접 write하지 않고 꼬리 뒤에 붙인다(프레임 경계 보존 —
//     length-prefix 스트림에서 프레임이 섞이면 이후 전부 desync).
//   - 꼬리 상한(OUTBOUND_MAX_BYTES) 초과 = 느린 소비자 → 종료(메모리 상한). 판정은 복사 전에 한다(넘칠 꼬리는 복사하지
//     않는다). 세션은 수신 디스패치 구간의 outbox가 이 상한을 넘기 전에 링크로 보낸다(exceedsBacklogCap — session.ts).
//   - end()는 먼저 종료 전 훅(beforeEnd — 세션 outbox flush, 성능 3단계 슬라이스 6)을 부른다: 코킹 중(tick·수신 디스패치
//     구간) 쌓인 프레임과 KICK이 outbox에 갇힌 채 닫히지 않게. 훅이 던지면 기록하고 종료를 계속한다.
//   - end()는 꼬리를 먼저 비운 뒤 닫는다(KICK 프레임이 앞선 프레임 뒤에 도착하도록). 상대가
//     끝내 읽지 않으면 endFlushTimeoutMs 후 강제 종료(타이머는 unref — 프로세스 종료를 막지 않음).
//   - 종료 중(`closing`) 링크는 새 프레임을 버리고 send()가 false를 반환한다 — 호출자는 이를
//     근거로 송신 메트릭을 집계하지 않고(session.ts), 수신 경로는 디스패치를 멈춘다(clientEdge.ts).
//   - 소켓 close(Bun close 콜백)는 첫 줄에서 dispose()를 호출 — 꼬리·end 타이머를 즉시 해제하고
//     raw.end()는 다시 부르지 않는다(피어가 먼저 끊은 경우 5초간 꼬리 보유·죽은 소켓 end 재호출 방지).
//
// 재진입 불변식(Bun 1.3.13·1.4.3 실측 — 1.4.3은 실소켓 프로브로 재확인, docs/perf-baseline.md "Bun 1.4.3"): Bun.listen 기본
// (allowHalfOpen:false)에서 raw.end()는 곧 완전
// 종료이고, close 콜백이 end() **안에서 동기로** 실행된다(이후 write는 -1). 따라서 terminate()가
// 부르는 raw.end()는 그 호출 스택 안에서 sessionLifecycle.closeSession(dispose →
// saveOnDisconnect → zoneRegistry.unbindConn → sessionManager.removeConnection)을 재진입 실행한다
// — send()/flush()/end() 어디서든, sessionManager.withCork의 uncork 루프 안에서도. 현재 안전한 근거:
//   · withCork는 cork 시점 세션 배열 스냅샷을 순회한다 — 루프 중 authenticated 맵 변이와 무관하고,
//     fn()(tick)이 끝난 뒤라 tick 상태 변이와 겹치지 않는다.
//   · close 본체는 송신하지 않는다(despawn은 다음 tick 스냅샷이 통지) — 다른 세션의 outbox/꼬리 무접촉.
//   · terminate()는 terminated를 raw.end() "전에" 세우고, dispose()는 idempotent — 재진입해도 이중 정리 없음.
//   · 핸들러 안의 send도 같은 스택에서 close가 돌 수 있다: 송신 뒤 세션 상태를 다시 쓰는 코드는
//     session.socket.closing을 확인할 것(enterWorld는 바인드·등록 후 송신이라 close가 정리한다).
//     수신 디스패치 구간의 send는 지연 flush(deferredSends.ts)라 write·close가 턴 끝 flush나 end() 훅
//     안으로 옮겨 간다 — 턴 끝 flush 루프 안 재진입도 위 근거(close 본체 무송신)로 안전하다.
// close 본체에 송신이나 tick 상태 변이를 추가하면 이 전제를 다시 검토할 것(필요 시 raw.end()를
// queueMicrotask로 지연 — 그 경우 테스트의 동기 isEnded 단정도 함께 조정).
//
// 세션 송신 표면(ClientLink — clientLink.ts, 성능 4단계 4.1)의 로컬 구현이다. setState는 구현하지 않는다(엣지가 세션
// 상태를 직접 읽는다).

import { metrics, packetIdLabel } from "../obs/metrics";
import { createLogger } from "../obs/logger";
import { createSquelch, suppressedMeta } from "../obs/logSquelch";
import type { ClientLink } from "./clientLink";

const log = createLogger("net.tx");
/** write마다 송신 바이트 집계 — 묶어 둔 핸들(성능 3단계 슬라이스 5, 노출은 종전과 같다). */
const txBytes = metrics.netTxBytes.bind(undefined);
/** raw write 호출 수 — 코얼레싱 효과 관측(packets_tx / writes = write당 프레임 수, 성능 3단계 슬라이스 6). */
const txWrites = metrics.netTxWrites.bind(undefined);

/** 꼬리 상한 기본값 — env OUTBOUND_MAX_BYTES. 스냅샷 수 tick분 + 이벤트 버스트 여유. */
export const DEFAULT_OUTBOUND_MAX_BYTES = 256 * 1024;
/** end() 요청 후 꼬리 flush 대기 상한(ms). */
export const DEFAULT_END_FLUSH_TIMEOUT_MS = 5000;

let outboundMaxBytes = DEFAULT_OUTBOUND_MAX_BYTES;
let endFlushTimeoutMs = DEFAULT_END_FLUSH_TIMEOUT_MS;

/** 부팅 시 worldMain·gateway/gatewayMain이 env로 1회 설정(테스트는 축소 주입 후 복원). */
export function configureOutbound(opts: { maxBytes?: number; endFlushTimeoutMs?: number }): void {
  if (opts.maxBytes !== undefined) outboundMaxBytes = opts.maxBytes;
  if (opts.endFlushTimeoutMs !== undefined) endFlushTimeoutMs = opts.endFlushTimeoutMs;
}

/** 현재 꼬리 상한(OUTBOUND_MAX_BYTES) — 원격 링크(cluster/remoteClientLink)가 세션 지연 outbox 조기 flush 판정에 쓴다. */
export function outboundCapBytes(): number {
  return outboundMaxBytes;
}

// 부분 쓰기·느린 소비자 경보 — 과부하 시 세션 수만큼 증폭되므로 연결별 1/s + 전역 20/s.
const txWarnSquelch = createSquelch({
  ratePerSec: 1,
  burst: 3,
  globalRatePerSec: 20,
  globalBurst: 40,
});

/** 링크가 쓰는 Bun.Socket 표면 — 테스트 fake도 구조적으로 만족. 음수 반환 = 닫힌 소켓. */
export interface RawSocket {
  write(data: Buffer): number;
  end(): void;
  readonly remoteAddress?: string;
}

export class OutboundLink implements ClientLink {
  /** MULTICAST 경로 없음(로컬 소켓) — 자기 필드로 둬 sendMany의 수신자별 판정이 프로토타입 탐색 없이 끝나게(성능 4.5 F2). */
  readonly castRoute = null;
  /** 공유 프레임 경로 없음(로컬 소켓) — 같은 이유로 자기 필드(세션 writeShared·uncork가 DELTA마다 읽는다, 성능 4.5 F3). */
  readonly sharedRoute = null;
  private pending: Buffer[] = [];
  private pendingBytes = 0;
  private endRequested = false;
  private terminated = false;
  private backlogClosed = false;
  private endTimer: ReturnType<typeof setTimeout> | null = null;

  /** beforeEnd: end() 첫머리에 1회 — 호출자(세션)의 미송신 outbox를 이 링크로 보내는 자리. */
  constructor(
    private readonly raw: RawSocket,
    private readonly connId: number,
    private readonly beforeEnd: (() => void) | null = null,
  ) {}

  get remoteAddress(): string | undefined {
    return this.raw.remoteAddress;
  }

  /** 미송신 꼬리 바이트 — 관측·테스트용. */
  get pendingByteCount(): number {
    return this.pendingBytes;
  }

  /** 지금 꼬리에 extraBytes를 더하면 상한(OUTBOUND_MAX_BYTES)을 넘는가 — 세션이 지연 outbox를 일찍 보낼 시점. */
  exceedsBacklogCap(extraBytes: number): boolean {
    return this.pendingBytes + extraBytes > outboundMaxBytes;
  }

  /** end 요청 또는 종료 이후 — 새 프레임은 버려진다. */
  get closing(): boolean {
    return this.endRequested || this.terminated;
  }

  /**
   * 꼬리 상한(OUTBOUND_MAX_BYTES) 초과 — 느린 소비자로 종료했다. raw.end() "전에" 선다(close 콜백이 그 안에서 동기 실행되므로
   * 콜백이 읽을 수 있게) — 게이트웨이가 월드에 알릴 종료 사유(CONN_CLOSED backlog) 판정용.
   */
  get closedByBacklog(): boolean {
    return this.backlogClosed;
  }

  /**
   * 완성 프레임(1개 이상 연접) 송신. firstPacketId·frameCount는 부분 쓰기 진단 라벨 — frameCount가 함수면 그 경로에서만 buf로
   * 평가한다(게이트웨이 DELIVER처럼 개수를 미리 모르는 호출자가 핫패스에서 프레임을 걷지 않게).
   * 반환: 수락 여부 — 전부 썼거나 꼬리로 보관했으면 true. 종료 중이라 버렸거나 이 호출에서
   * 종료(닫힌 소켓·꼬리 상한 초과)됐으면 false. 송신 패킷 메트릭은 true일 때만 집계한다.
   */
  send(buf: Buffer, firstPacketId: number, frameCount: number | ((buf: Buffer) => number)): boolean {
    if (this.closing) return false;
    if (buf.length === 0) return true;
    if (this.pendingBytes > 0) return this.enqueueCopy(buf, firstPacketId);
    const wrote = this.raw.write(buf);
    txWrites.inc();
    txBytes.inc(Math.max(0, wrote));
    if (wrote === buf.length) return true;
    if (wrote < 0) {
      this.terminate();
      return false;
    }
    metrics.netTxPartial.inc({ packet_id: packetIdLabel(firstPacketId) });
    this.warn(
      {
        firstPacketId: packetIdLabel(firstPacketId),
        frameCount: typeof frameCount === "number" ? frameCount : frameCount(buf),
        wrote,
        total: buf.length,
      },
      "partial socket write — tail queued until drain",
    );
    return this.enqueueCopy(buf.subarray(Math.max(0, wrote)), firstPacketId);
  }

  /** drain 콜백 — 꼬리를 가능한 만큼 송신. 다 비우고 end 요청이 있었으면 종료. */
  flush(): void {
    if (this.terminated) return;
    while (this.pending.length > 0) {
      const head = this.pending[0]!;
      const wrote = this.raw.write(head);
      txWrites.inc();
      txBytes.inc(Math.max(0, wrote));
      if (wrote < 0) {
        this.terminate();
        return;
      }
      if (wrote < head.length) {
        this.pending[0] = head.subarray(wrote);
        this.pendingBytes -= wrote;
        return;
      }
      this.pending.shift();
      this.pendingBytes -= head.length;
    }
    if (this.endRequested) this.terminate();
  }

  /** 우아한 종료 — outbox flush(beforeEnd) 후 꼬리가 없으면 즉시, 있으면 flush 완료(또는 타임아웃) 후 end. idempotent. */
  end(): void {
    if (this.closing) return;
    this.runBeforeEnd();
    if (this.closing) return; // 훅의 송신이 링크를 끝냈다(닫힌 소켓·꼬리 상한 초과).
    if (this.pendingBytes === 0) {
      this.terminate();
      return;
    }
    this.endRequested = true;
    this.endTimer = setTimeout(() => this.terminate(), endFlushTimeoutMs);
    this.endTimer.unref?.();
  }

  /**
   * 소켓이 이미 닫혔다(Bun close 콜백 첫 줄) — end 타이머·꼬리를 즉시 해제하고 종료 상태로
   * 고정한다. raw.end()는 부르지 않는다(닫힌 소켓 재종료·close 재진입 방지). idempotent.
   */
  dispose(): void {
    this.clearEndTimer();
    this.pending = [];
    this.pendingBytes = 0;
    this.terminated = true;
  }

  private runBeforeEnd(): void {
    if (this.beforeEnd === null) return;
    try {
      this.beforeEnd();
    } catch (err) {
      log.error({ err, connId: this.connId }, "pre-end outbox flush failed — closing without it");
    }
  }

  /**
   * 꼬리 뒤에 src 복사본을 보관한다(호출자 버퍼는 이후 재사용될 수 있다). 반환: 링크가 살아 있는지 — 보관하면 상한을 넘을
   * 꼬리는 복사하지 않고 느린 소비자로 종료한다(false).
   */
  private enqueueCopy(src: Buffer, firstPacketId: number): boolean {
    const total = this.pendingBytes + src.length;
    if (total > outboundMaxBytes) {
      metrics.netTxBacklogClose.inc();
      this.warn(
        { firstPacketId: packetIdLabel(firstPacketId), pendingBytes: total, cap: outboundMaxBytes },
        "outbound backlog over cap — closing slow consumer",
      );
      this.backlogClosed = true;
      this.terminate();
      return false;
    }
    this.pending.push(Buffer.from(src));
    this.pendingBytes = total;
    return true;
  }

  /** 강제 종료 — terminated를 raw.end() 전에 세운다(end 안에서 close 콜백이 동기 재진입). */
  private terminate(): void {
    this.clearEndTimer();
    this.pending = [];
    this.pendingBytes = 0;
    if (this.terminated) return;
    this.terminated = true;
    try {
      this.raw.end();
    } catch {
      // 이미 닫힌 소켓 — 무시.
    }
  }

  private clearEndTimer(): void {
    if (this.endTimer === null) return;
    clearTimeout(this.endTimer);
    this.endTimer = null;
  }

  private warn(meta: Record<string, unknown>, msg: string): void {
    const sup = txWarnSquelch.allow(`tx:${this.raw.remoteAddress ?? this.connId}`);
    if (sup >= 0) log.warn(suppressedMeta({ ...meta, connId: this.connId }, sup), msg);
  }
}
