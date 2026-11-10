import { encodeOrDrop, recordEncodeDrop } from "./encodeGuard";
import { OutboundLink, type RawSocket } from "./outboundLink";
import type { CastRoute, ClientLink, ClientLinkFactory } from "./clientLink";
import { FrameOutbox } from "./frameOutbox";
import type { SharedFrame } from "../net/sharedFrame";
import type { GatherPuzzleKind, PayloadOf, S2CPacketId } from "../net/codec.generated";
import { type DeferredFlushTarget, isDeferringSends, queueDeferredFlush } from "./deferredSends";
import { metrics, PacketIdCounter } from "../obs/metrics";
import { createLogger } from "../obs/logger";
import { RingByteBuffer } from "../net/ringBuffer";
import { COMMAND_RESERVE_LIMITS, OVERLOAD_EXEMPT_LIMITS, StrikeWindow, TokenBucket } from "../net/rateLimit";
import type { LoginState } from "../identity/loginFlow";
import type { CharacterRow } from "../identity/characterRepo";
import type { QuestEntry } from "../identity/characterQuestsRepo";
import type { LifeState } from "../identity/lifeState";

const stateLog = createLogger("net.session");
const corkLog = createLogger("net.cork");
/** 송신 프레임 집계 — packet_id별 핸들(라벨 키 생성 없이 프레임마다 +1, 노출 순서 = 첫 증가 순서). */
const txPackets = new PacketIdCounter(metrics.netPacketsTx);

/** 링크가 수락한 논리 패킷 n개 집계 — MULTICAST(castFanout)가 수신자 수만큼(연결별 경로의 uncork 집계와 같은 수). */
export function countTxPackets(packetId: number, n: number): void {
  txPackets.inc(packetId, n);
}

/** 미인증 이탈 통지 대상 — SessionManager가 addConnection에서 등록(pre-auth 서브캡 회계). */
export interface PreAuthTracker {
  leavePreAuth(session: PlayerSession): void;
}

/**
 * 상태 전이 단일 진입점 — 수명주기 진단용 debug 전이 로그(ANON→…→IN_WORLD/REJECT).
 * AUTHENTICATED(또는 IN_WORLD) 첫 도달 시 pre-auth를 1회 해제하고 트래커에 통지한다 —
 * 서브캡 회계와 엣지(clientEdge)의 pre-auth 데드라인이 같은 판정(`session.preAuth`)을 본다.
 * 마지막에 링크에 전이를 통지한다(ClientLink.setState — 4.2 게이트웨이 미러, 로컬 링크는 미구현).
 */
export function setSessionState(session: PlayerSession, to: LoginState): void {
  if (session.state === to) return;
  stateLog.debug({ connId: session.connId, from: session.state, to }, "session state transition");
  session.state = to;
  if (session.preAuth && (to === "AUTHENTICATED" || to === "IN_WORLD")) {
    session.preAuth = false;
    session.preAuthTracker?.leavePreAuth(session);
  }
  session.socket.setState?.(to);
}

// 모듈 전역 카운터는 SessionManager로 이동(SessionManager.nextConnId).
// 호환성을 위해 PlayerSession 생성자에 connId가 주어지지 않으면 fallback 카운터 사용.
let fallbackConnId = 1;

export class PlayerSession implements DeferredFlushTarget {
  /** RingByteBuffer가 누적·압축·grow를 책임 — Buffer.concat 폐기. */
  readonly inbox = new RingByteBuffer();
  /** zone의 connId 키. accept 직후 부여, process 단위 단조증가. */
  readonly connId: number;
  /** accept 시점의 원격 IP 캐시 — close 후에도 안전 조회(IP별 연결 상한 카운터 감소용). */
  readonly remoteAddress: string | undefined;
  /** 인증 후 부여된 캐릭터 id. zone에선 character id == playerId. */
  playerId: number | null = null;

  /** 인증 상태머신 + 영속 식별자. 전이는 `setSessionState`로만. */
  state: LoginState = "ANON";
  /**
   * accept 이후 AUTHENTICATED에 아직 도달한 적 없음 — pre-auth 절대 데드라인·서브캡 대상.
   * 한 번 false가 되면 다시 서지 않는다. 인증 실패(REJECT)는 close까지 true로 남는다.
   */
  preAuth = true;
  /** pre-auth 이탈 통지 대상(SessionManager.addConnection이 설정). null = 미추적. */
  preAuthTracker: PreAuthTracker | null = null;
  accountId: number | null = null;
  characterId: number | null = null;

  /**
   * Phase G-4-4: 플레이 중 라이브 진행 상태(exp/level/stats/hpMax 권위). enterWorld에서 로드,
   * EXP 보상/레벨업/사망 페널티가 in-memory로 갱신, autoSave가 DB로 flush. 전투 중 hp 권위는
   * EntityTable.health이며 동기화 지점(레벨업/사망/부활/flush)에서만 liveChar.hp와 맞춘다.
   */
  liveChar: CharacterRow | null = null;
  /** Phase G-4-4: liveChar가 마지막 flush 이후 변경됨 → autoSave가 applyProgression 수행. */
  progressionDirty = false;
  /** G-7: 인벤토리/장비가 마지막 flush 이후 변경됨 → autoSave가 saveSlots+saveEquipment. */
  inventoryDirty = false;
  /** 선점 킥이 선-flush를 이미 마쳤음 — close 콜백·주기 autoSave의 중복/stale 쓰기를 억제.
   *  flush가 성공했을 때만 세운다(실패 시 close 경로가 재시도해야 하므로). */
  saveSuppressed = false;

  /**
   * 퀘스트 B단계: 캐릭터별 퀘스트 진행 권위(liveChar 동형) — enterWorld에서 로드,
   * off-tick 훅(kill/talk/reach)·수락/턴인이 in-memory 갱신. turned_in 행 전체 보유
   * (quest_completed 선행 검사 = 메모리 조회). null = 미로드(월드 밖).
   * 세션 레벨인 이유: tick은 퀘스트를 읽지 않고(킬은 outcome으로 전달) 존 전환 캡처도 불필요.
   */
  questState: Map<number, QuestEntry> | null = null;
  /** 퀘스트 카운터가 마지막 flush 이후 변경됨 → autoSave가 saveProgressBatch. */
  questDirty = false;
  /** QUEST_NPC_MARKERS diff 캐시(직렬화 스냅샷) — 동일하면 재송신 생략. */
  questMarkersCache = "";
  lastShopRequestId = 0;

  /**
   * 생활 L-1: 계정 작업력 + 이 캐릭터의 숙련 라인(questState 동형 — tick 무접촉). enterWorld에서 로드, 채집·제작 확정이 갱신(bumpLife).
   * null = 미로드(월드 밖). 저장은 공용 세션 스냅샷과 인벤 즉시 tx가 함께 쓴다(identity/lifeState.ts).
   */
  lifeState: LifeState | null = null;
  /** 생활 상태가 마지막 flush 이후 변경됨 — 해제는 캡처 version 일치 시만(markLifeSaved). */
  lifeDirty = false;
  /** LIFE_CHANNEL.channelId 카운터(세션별 — 존 전역 상태를 늘리지 않는다). */
  lifeChannelSeq = 0;
  /**
   * 진행 중 채집 퍼즐의 수락 벽시계(단조 ms — performance.now). world/는 시계를 읽지 않으므로 세션에 둔다. null = 퍼즐 없음.
   * lagAtAcceptMs = 수락 때의 누적 서버 지연(LifeRuntime.serverLagMs).
   */
  lifePuzzle: { readonly channelId: number; readonly acceptedAtMs: number; readonly lagAtAcceptMs: number } | null = null;
  /**
   * GM 덮어쓰기 퍼즐 종류(QA·녹화) — 노드 지정과 무작위 고르기를 모두 이긴다. 바꾸거나 지울 때까지 이 세션의 채집마다
   * 적용되고 저장하지 않는다(재접속 = 새 세션 = 없음). null = 덮어쓰지 않음.
   */
  gmPuzzleKind: GatherPuzzleKind | null = null;
  /** 처리한 CRAFT_REQ의 마지막 requestId — 이 값 이하는 재전송(DUPLICATE). 대상 없음·속도 초과 프레임은 소비하지 않는다. */
  lastCraftRequestId = 0;

  /** Phase B — connection별 rate limiter. 상태에 따라 limits가 달라짐(`bucketLimitsForState`). */
  readonly rateLimiter = new TokenBucket();
  /** IN_WORLD 1회성 명령 예약 버킷 — 메인 버킷이 빈 동안 비스트림 명령만 소비(`rateVerdict`). */
  readonly commandReserve = new TokenBucket(COMMAND_RESERVE_LIMITS.capacity);
  /** 1-B — IN_WORLD drop strike 윈도우(첫 drop 시 링 할당). KICK 판정은 `rateVerdict`. */
  readonly rateStrikes = new StrikeWindow();
  /** 이진 전환 B2c — 사전 판정을 통과한 패킷의 디코드 실패 strike 윈도우(첫 실패 시 링 할당). KICK 판정은 frameIngest. */
  readonly decodeStrikes = new StrikeWindow();
  /** 채팅 발신 버킷(첫 CHAT_SAY에 생성 — chatSayHandler, env CHAT_RATE_PER_SEC·CHAT_BURST). */
  chatBucket: TokenBucket | null = null;
  /** 자유 포인트 명령 버킷(첫 STAT_ALLOCATE·STAT_RESET에 생성 — statPointsHelper, env STAT_OP_RATE_PER_SEC·STAT_OP_BURST). */
  statOpBucket: TokenBucket | null = null;
  /** 처리한 STAT_ALLOCATE·STAT_RESET의 마지막 requestId — 이 값 이하는 재전송(DUPLICATE). */
  lastStatRequestId = 0;
  /** MOVE_TO 버킷(첫 MOVE_TO에 생성 — moveToHandler, env MOVE_TO_RATE_PER_SEC·MOVE_TO_BURST). */
  moveToBucket: TokenBucket | null = null;
  /** 생활 명령 버킷(첫 GATHER_START·CRAFT_REQ에 생성 — 두 패킷이 공유, env LIFE_OP_*). */
  lifeOpBucket: TokenBucket | null = null;
  /** 과부하 strike 면제 예산(3단계 리뷰 — 처음엔 가득, 과부하 중 IN_WORLD drop만 소비). 판정은 `rateVerdict`. */
  readonly overloadExempt = new TokenBucket(OVERLOAD_EXEMPT_LIMITS.capacity);
  /** rate 위반 경고 squelch 키 캐시(clientEdge — flood의 drop마다 키 문자열을 만들지 않게). */
  rateWarnKey: string | null = null;

  /**
   * 이동동기화 후속(코얼레싱): tick 동안 송신 프레임을 모아 tick 말미 1회 write.
   * corked=false = 즉시 write. NODELAY 후 "패킷 1개 = write 1회 = 세그먼트 1개"가 되어
   * 혼잡 존 팬아웃 시 pps·헤더 오버헤드가 증폭되는 문제의 해소 지점.
   * 성능 3단계 슬라이스 5: outbox는 세션당 늘어나는 Buffer 1개(frameOutbox.ts)를 tick마다 재사용한다 — 프레임별
   * packet id(첫 id = 부분 쓰기 진단 라벨, 리뷰: coalesced로 뭉개면 원인 패킷 추적 불가)와 수는 outbox가 기록한다.
   * 성능 3단계 슬라이스 6: tick 밖 수신 디스패치 구간의 송신도 같은 outbox에 모은다 — 첫 송신이 세션을 지연 코킹하고
   * 턴 끝 flush에 1회 등록한다(deferredSends.ts). 코킹 중에는 구간 밖 송신도 outbox 뒤에 붙어 순서가 보존된다.
   * 구간 안 outbox + 링크 꼬리가 OUTBOUND_MAX_BYTES를 넘으면 그 자리에서 링크로 보낸다(capDeferredOutbox — 3단계 리뷰).
   */
  private corked = false;
  private readonly outbox = new FrameOutbox();
  /** 턴 끝 flush 큐에 올라가 있음 — 중복 등록 방지(큐에서 꺼낼 때 내린다). */
  private flushQueued = false;

  /**
   * 1-C(3): 송신은 백프레셔 링크 경유 — 부분 쓰기 꼬리 보관·drain 이어쓰기·flush 후 end.
   * 핸들러의 `session.socket.end()`도 이 링크의 우아한 종료(앞선 프레임 flush 후 close)다.
   * 4단계 4.1: 링크는 ClientLink 표면만 본다(clientLink.ts) — 로컬 OutboundLink 또는 4.2 원격 링크.
   */
  public readonly socket: ClientLink;

  /**
   * transport: Bun 소켓(또는 그 표면을 가진 대역)이면 로컬 OutboundLink로 감싸고, 링크 팩토리면 그 링크를 쓴다(4.2 월드 —
   * 게이트웨이 경유 연결). remoteAddress는 링크 생성 시점 값을 캐시한다(close 후에도 IP별 상한 감소에 안전).
   */
  constructor(transport: RawSocket | ClientLinkFactory, connId?: number) {
    this.connId = connId ?? fallbackConnId++;
    // 종료(end)는 outbox를 먼저 링크로 보낸다 — 킥의 KICK·선행 프레임이 outbox에 갇힌 채 닫히지 않게.
    const flushOutbox = (): void => this.uncork();
    this.socket =
      typeof transport === "function" ? transport(flushOutbox) : new OutboundLink(transport, this.connId, flushOutbox);
    this.remoteAddress = this.socket.remoteAddress;
  }

  /**
   * 페이로드 송신. 코킹 중이면 outbox에 직접 인코딩(writePacket과 같은 바이트), 아니면 프레임을 만들어 즉시 송신.
   * 수신 디스패치 구간이면 먼저 지연 코킹한다(턴 끝 1회 write).
   * 인코드 실패(WireEncodeError·프레임 body u16 초과)는 이 패킷만 버리고 기록한다(encodeGuard.ts — 이진 전환 B4): 존 tick·핸들러의 남은
   * 처리는 계속된다. 실패는 프레임을 만들기 전이라 outbox·링크에 부분 바이트가 없다. 그 밖의 예외는 그대로 던진다.
   */
  send<I extends S2CPacketId>(packetId: I, payload: PayloadOf<I>): void {
    if (!this.corked && isDeferringSends()) this.deferCork();
    if (this.corked && !this.socket.closing) {
      if (this.appendOrDrop(packetId, payload)) this.capDeferredOutbox();
      return;
    }
    const frame = encodeOrDrop(packetId, payload, this.connId);
    if (frame !== null) this.writeOrEnqueue(packetId, frame);
  }

  /** outbox에 직접 인코딩 — 인코드 실패면 기록하고 false(outbox 불변 — FrameOutbox 커밋 규칙), 그 밖의 예외는 던진다. */
  private appendOrDrop(packetId: number, payload: object): boolean {
    try {
      this.outbox.appendPayload(packetId, payload);
      return true;
    } catch (err) {
      if (recordEncodeDrop(packetId, err, this.connId)) return false;
      throw err;
    }
  }

  /**
   * 프레임 송신 단일 진입점. corked면 outbox 누적, 아니면 링크로 즉시 송신. 부분 쓰기는 링크가
   * 꼬리로 보관(프레임 경계 보존). netPacketsTx는 링크가 수락한 논리 패킷만 집계한다 — 즉시
   * 경로는 지금, 코킹 경로는 uncork 때. 종료 중 링크로 가는 프레임은 outbox에도 쌓지 않고 버린다.
   * (수락 후 꼬리째 종료되며 버려진 프레임은 이미 집계된 상태로 남는다 — 근사.)
   */
  writeOrEnqueue(packetId: number, buf: Buffer): void {
    if (this.socket.closing) return;
    if (!this.corked && isDeferringSends()) this.deferCork();
    if (this.corked) {
      // 복사해 붙인다 — 팬아웃 프레임(sendMany)은 여러 세션이 같은 buf를 공유한다.
      this.outbox.appendFrame(packetId, buf);
      this.capDeferredOutbox();
      return;
    }
    if (this.socket.send(buf, packetId, 1)) txPackets.inc(packetId);
  }

  /**
   * 공유 프레임 송신(성능 4.5 F3 — SNAPSHOT_DELTA 묶음): 클라 바이트 = frame을 복사하고 patchOff에 value. 코킹 중이면 링크가 공유 경로를
   * 가질 때(원격·IPC_SHARED=1) outbox 끝 참조로(복사 없음 — uncork가 sharedRoute.send, 피어별 보관자 집계 hold), 아니면 outbox에 복사·
   * 패치(종전 writeOrEnqueue와 같은 바이트). 코킹 밖이면 제자리 패치 후 즉시 송신. 종료 중 링크는 버린다.
   */
  writeShared(packetId: number, frame: SharedFrame, value: number): void {
    if (this.socket.closing) return;
    if (!this.corked && isDeferringSends()) this.deferCork();
    if (this.corked) {
      const route = this.socket.sharedRoute;
      if (route === undefined || route === null) this.outbox.appendFramePatched(packetId, frame, value);
      else {
        this.outbox.appendShared(packetId, frame, value);
        frame.hold(route.sink);
      }
      this.capDeferredOutbox();
      return;
    }
    if (this.socket.send(frame.patch(value), packetId, 1)) txPackets.inc(packetId);
  }

  /**
   * MULTICAST 수신 자격(성능 4.5 F2) — 링크에 경로가 있고 종료 중이 아니며 outbox가 비었으면 그 경로, 아니면 null(연결별 경로).
   * outbox가 비었다 = 이 연결의 앞선 프레임이 전부 이미 링크(피어 배치)에 있다 — 지금 쓰는 MULTICAST 레코드가 그 뒤, outbox에 쌓일
   * 뒤 프레임(DELIVER)보다 앞이라 연결별 순서가 그대로다. 프레임이 있으면 outbox 뒤에 복사한다(앞당겨 비우면 레코드만 는다).
   */
  castRoute(): CastRoute | null {
    const route = this.socket.castRoute;
    if (route === undefined || route === null || this.socket.closing || this.outbox.frameCount > 0) return null;
    return route;
  }

  /** tick 시작(sessionManager.withCork) — 이후 송신 프레임을 outbox에 누적. idempotent(지연 코킹 프레임도 유지). */
  cork(): void {
    this.corked = true;
  }

  /** 수신 디스패치 구간의 첫 송신 — 코킹하고 턴 끝 flush에 1회 등록. 종료 중 링크는 어차피 버리므로 코킹하지 않는다. */
  private deferCork(): void {
    if (this.socket.closing) return;
    this.corked = true;
    if (this.flushQueued) return;
    this.flushQueued = true;
    queueDeferredFlush(this);
  }

  /**
   * 수신 디스패치 구간에서 outbox + 링크 꼬리가 OUTBOUND_MAX_BYTES를 넘으면 지금 링크로 보내고 다시 코킹한다(턴 끝 flush
   * 등록은 그대로). 상한 판정·느린 소비자 종료는 링크 몫이라 세션당 보유 메모리가 즉시 write 시절처럼 상한 근처로 묶인다 —
   * 3단계 리뷰: 턴 끝까지 무제한으로 쌓여 채팅 버스트(계정 4개 × 110건 → 1000명 팬아웃)가 outbox 1GB·RSS +1.5GB를 잡았다.
   * 바이트·순서는 같다(write 경계만 늘어난다). tick(withCork) 구간은 하지 않는다 — 여기서 링크가 끝나면 close 콜백이 tick
   * 도중 재진입한다(outboundLink.ts 재진입 불변식). 디스패치 구간의 close 재진입은 종전 즉시 write·킥과 같은 경로다.
   */
  private capDeferredOutbox(): void {
    if (!isDeferringSends() || !this.socket.exceedsBacklogCap(this.outbox.byteLength)) return;
    this.flushOrClose();
    if (!this.socket.closing) this.corked = true;
  }

  /** 턴 끝 flush(deferredSends 큐) — tick uncork·end가 먼저 보냈으면 코킹이 풀려 있어 no-op. 던지지 않는다. */
  flushDeferred(): void {
    this.flushQueued = false;
    this.flushOrClose();
  }

  /** uncork — 던지면 그 세션은 프레임을 잃은 desync 상태이므로 종료한다(다른 세션 flush와 격리). */
  flushOrClose(): void {
    try {
      this.uncork();
    } catch (err) {
      corkLog.error({ err, connId: this.connId }, "uncork failed — closing desynced session");
      try {
        this.socket.end();
      } catch {
        // 이미 닫힌 소켓 — 무시.
      }
    }
  }

  /**
   * tick 종료 — 누적 프레임을 1회 write로 flush. 부분 쓰기 꼬리는 링크가 복사해 drain까지 보관하므로 outbox는
   * 곧바로 비워 다음 tick에 재사용한다. send가 true면 링크 종료(close 재진입)가 없었으므로 id 열을 그대로 읽는다.
   */
  uncork(): void {
    if (!this.corked) return;
    this.corked = false;
    const box = this.outbox;
    const n = box.frameCount;
    if (n === 0) return;
    try {
      if (this.sendOutbox(box, n)) {
        for (let i = 0; i < n; i++) txPackets.inc(box.packetIdAt(i));
      }
    } finally {
      box.reset();
    }
  }

  /** outbox n프레임을 링크로 — 끝 공유 참조가 있으면 공유 경로(인라인 + 참조), 아니면 send(전체 바이트). 오염 outbox는 던진다. */
  private sendOutbox(box: FrameOutbox, n: number): boolean {
    const tail = box.sharedTail();
    const route = this.socket.sharedRoute;
    if (tail !== null && route !== undefined && route !== null) {
      return route.send(box.inlineView(), tail, box.sharedValue, box.packetIdAt(0), n);
    }
    return this.socket.send(box.view(), box.packetIdAt(0), n);
  }
}
