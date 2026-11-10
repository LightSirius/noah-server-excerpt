// 게이트웨이 클라 연결 — 성능 4단계(게이트웨이 분리) 4.2c. 클라 엣지(network/clientEdge.ts)가 요구하는 연결 표면(EdgeConn)을
// 게임 상태 없이 갖춘다 — monolith의 PlayerSession과 같은 엣지 정책(size·rate·strike·명령 예약분·과부하 면제·idle·pre-auth
// 데드라인)이 같은 초기값으로 걸린다(tests/server/cluster/clientEdgeParity.test.ts).
//
//   - connId = localId: 게이트웨이 incarnation 안에서 단조 증가, 재사용 없음(게이트웨이 코어가 발급). 월드 IPC의 연결 키.
//   - 송신: 로컬 OutboundLink(부분 쓰기 꼬리·drain·flush 후 end·꼬리 상한 — monolith와 같은 백프레셔). 엣지 킥(KICK 프레임)과
//     월드의 CONN_DELIVER(완성 프레임 연접)가 같은 링크로 나간다 — 프레임 경계·순서 보존.
//   - 로그인 상태: 월드의 CONN_STATE 미러(applyState) — setSessionState와 같은 규칙으로 AUTHENTICATED/IN_WORLD 첫 도달에서
//     pre-auth를 1회 해제한다(데드라인 무효). 상태 머신 강제·인증은 월드 몫이고, 여기 상태는 rate 한도·idle 창 선택에만 쓴다.
//   - 종료 사유(CONN_CLOSED): 코어가 킥·종료를 걸기 직전에 기록한다(첫 사유가 이긴다). 기록이 없으면 꼬리 상한 종료 = backlog,
//     그 외 = 클라가 끊음(peer).
//   - MULTICAST(성능 4.5 F2): 코어가 레코드당 1회 복사한 프레임을 연결마다 미뤄 둔다(deferCast). 미룬 바이트는 이 연결의 다음 DELIVER와
//     합쳐 write 1회(joinFrames — 재사용 scratch, 링크는 못 보낸 꼬리만 복사), 또는 CONN_FLUSH(창 끝)·종료(링크 종료 전 훅)·엣지 KICK
//     (writeOrEnqueue가 먼저 비운다) 중 먼저 오는 때에 쓴다 — 연결별 바이트 순서 = 레코드 순서, 연결당 flush 창마다 write 1회.
//   - 공유 프레임(성능 4.5 F3): CONN_REF는 DELIVER 1건과 같다(deliverShared) — 코어가 DEF 뷰를 이 연결 값으로 제자리 패치해 넘기면 인라인·
//     미룬 MULTICAST가 없을 때 그 뷰를 그대로, 있으면 합쳐 write 1회.

import type { EdgeConn } from "../network/clientEdge";
import { OutboundLink, type RawSocket } from "../network/outboundLink";
import { RingByteBuffer } from "../net/ringBuffer";
import { COMMAND_RESERVE_LIMITS, OVERLOAD_EXEMPT_LIMITS, StrikeWindow, TokenBucket } from "../net/rateLimit";
// countFrames는 부분 쓰기 진단 라벨(OutboundLink)용 — 그 경로에서만 지연 평가된다(DELIVER 핫패스 무비용).
import { countFrames, firstPacketId } from "../net/wireFrame";
import type { LoginState } from "../identity/loginFlow";
import { CONN_CLOSED_REASON, type ConnClosedReason } from "../cluster/ipcSchema";
import { metrics } from "../obs/metrics";

const EMPTY = Buffer.alloc(0);
const assembledBytes = metrics.gwDeliverAssembledBytes.bind(undefined);
/** 합치기 scratch 유지 상한 — 이보다 큰 합치기는 그때만 할당한다(큰 1회가 프로세스 메모리를 영구히 키우지 않게). */
const SCRATCH_RETAIN_MAX_BYTES = 1024 * 1024;
let scratch = Buffer.allocUnsafeSlow(64 * 1024);

/**
 * parts[0..n) + a + b를 한 버퍼로(재사용 scratch의 뷰 — 다음 합치기 전까지만 유효, 링크는 못 보낸 꼬리만 복사한다). 복사한 바이트는
 * mmorpg_gw_deliver_assembled_bytes_total.
 */
function joinFrames(parts: readonly Buffer[], n: number, a: Buffer | null, b: Buffer | null): Buffer {
  let total = (a === null ? 0 : a.length) + (b === null ? 0 : b.length);
  for (let i = 0; i < n; i++) total += parts[i]!.length;
  let out = scratch;
  if (total > out.length) {
    out = Buffer.allocUnsafeSlow(total);
    if (total <= SCRATCH_RETAIN_MAX_BYTES) scratch = out;
  }
  let off = 0;
  for (let i = 0; i < n; i++) off += parts[i]!.copy(out, off);
  if (a !== null) off += a.copy(out, off);
  if (b !== null) b.copy(out, off);
  assembledBytes.inc(total);
  return out.subarray(0, total);
}

export class GatewayConn implements EdgeConn {
  readonly inbox = new RingByteBuffer();
  state: LoginState = "ANON";
  preAuth = true;
  readonly rateLimiter = new TokenBucket();
  readonly commandReserve = new TokenBucket(COMMAND_RESERVE_LIMITS.capacity);
  readonly rateStrikes = new StrikeWindow();
  readonly overloadExempt = new TokenBucket(OVERLOAD_EXEMPT_LIMITS.capacity);
  rateWarnKey: string | null = null;
  readonly socket: OutboundLink;
  /** accept 시점의 클라 IP — 월드 CONN_OPEN에 싣는다(월드의 IP별 상한·인증 스로틀). */
  readonly remoteAddress: string | undefined;
  /** 월드가 붙인 connId(CONN_ACCEPTED) — 로그 상관 키. 수용 전·거절이면 null. */
  worldConnId: number | null = null;
  /** 코어의 CONN_FLUSH 대기 목록에 올라 있다(창마다 1회 — 코어가 flushQueuedCast로 내린다). */
  castQueued = false;
  private closeCause: ConnClosedReason | null = null;
  /** MULTICAST로 미룬 프레임(코어가 레코드당 1회 복사한 공유 Buffer) — [0, castCount). 칸은 재사용한다. */
  private readonly cast: Buffer[] = [];
  private castCount = 0;

  /** connId = localId(게이트웨이 코어 발급). */
  constructor(
    raw: RawSocket,
    readonly connId: number,
  ) {
    // 링크 종료(CONN_CLOSE·킥·종료)는 미룬 MULTICAST 바이트를 먼저 쓴다 — 그 뒤에 닫힌다.
    this.socket = new OutboundLink(raw, connId, () => this.flushCast());
    this.remoteAddress = raw.remoteAddress;
  }

  get localId(): number {
    return this.connId;
  }

  /** 엣지 킥의 KICK 프레임 — 로컬 링크로 바로(게이트웨이에는 세션 outbox가 없다). 미룬 MULTICAST 바이트가 먼저다. */
  writeOrEnqueue(packetId: number, buf: Buffer): void {
    this.flushCast();
    this.socket.send(buf, packetId, 1);
  }

  /**
   * 월드 CONN_DELIVER(완성 프레임 1개 이상 연접, 호출 동안만 유효한 뷰 — 링크가 꼬리만 복사). 미룬 MULTICAST 바이트가 있으면 앞에 합쳐
   * write 1회. false = 링크 종료.
   */
  deliver(bytes: Buffer): boolean {
    if (this.castCount > 0) return this.sendCast(bytes);
    return this.socket.send(bytes, firstPacketId(bytes), countFrames);
  }

  /**
   * 월드 CONN_REF(v5 CONN_DELIVER_SHARED) — inline(완성 프레임 0개 이상) 뒤 def(이 연결 값으로 이미 패치한 공유 프레임 뷰)를 write 1회로.
   * 미룬 MULTICAST·인라인이 없으면 def 뷰를 그대로 쓴다(복사 0 — 링크는 못 보낸 꼬리만 복사하므로 다음 연결의 패치와 섞이지 않는다).
   */
  deliverShared(inline: Buffer, def: Buffer): boolean {
    if (this.castCount === 0 && inline.length === 0) return this.socket.send(def, firstPacketId(def), countFrames);
    const n = this.castCount;
    this.castCount = 0;
    const buf = joinFrames(this.cast, n, inline, def);
    this.cast.fill(EMPTY, 0, n);
    return this.socket.send(buf, firstPacketId(buf), countFrames);
  }

  /** MULTICAST 프레임을 미룬다(공유 — 복사하지 않는다). 반환 = 코어 CONN_FLUSH 목록에 새로 올려야 하나. 종료 중 링크는 버린다. */
  deferCast(frame: Buffer): boolean {
    if (this.socket.closing) return false;
    this.cast[this.castCount++] = frame;
    if (this.castQueued) return false;
    this.castQueued = true;
    return true;
  }

  /** 미룬 MULTICAST 바이트를 지금 쓴다(없으면 무동작). */
  flushCast(): void {
    if (this.castCount > 0) this.sendCast(null);
  }

  /** CONN_FLUSH(코어 목록 순회) — 목록에서 내리고 미룬 바이트를 쓴다. */
  flushQueuedCast(): void {
    this.castQueued = false;
    this.flushCast();
  }

  /** CONN_STATE 미러 — AUTHENTICATED/IN_WORLD 첫 도달에서 pre-auth 해제(되돌리지 않는다). */
  applyState(to: LoginState): void {
    if (this.state === to) return;
    this.state = to;
    if (to === "AUTHENTICATED" || to === "IN_WORLD") this.preAuth = false;
  }

  /** 종료 사유 기록 — 첫 사유가 이긴다(킥 뒤 꼬리 flush 타임아웃 등 후속 종료가 덮지 않게). */
  noteClose(reason: ConnClosedReason): void {
    this.closeCause ??= reason;
  }

  /** CONN_CLOSED 사유 — 기록된 사유 → 꼬리 상한 종료(backlog) → 클라가 끊음(peer). */
  closedReason(): ConnClosedReason {
    if (this.closeCause !== null) return this.closeCause;
    return this.socket.closedByBacklog ? CONN_CLOSED_REASON.Backlog : CONN_CLOSED_REASON.Peer;
  }

  /** 미룬 프레임(+ tail)을 write 1회로 — 프레임 1개뿐이면 합치지 않고 그 버퍼를 그대로 쓴다. 칸은 비운다(공유 프레임 해제). */
  private sendCast(tail: Buffer | null): boolean {
    const n = this.castCount;
    this.castCount = 0;
    const buf = n === 1 && tail === null ? this.cast[0]! : joinFrames(this.cast, n, tail, null);
    this.cast.fill(EMPTY, 0, n);
    return this.socket.send(buf, firstPacketId(buf), countFrames);
  }
}
