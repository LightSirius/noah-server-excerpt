import type { PlayerSession, PreAuthTracker } from "./session";
import { encodeOrDrop } from "./encodeGuard";
import { createLogger } from "../obs/logger";
import { perIpKey } from "../net/ipBucket";
import { CORK_PHASE, FLUSH_PHASE, type PhaseMarker } from "../obs/tickProfiler";
import { CastFanout } from "./castFanout";
import type { SharedFrame } from "../net/sharedFrame";
import type { PayloadOf, S2CPacketId } from "../net/codec.generated";

const sessionLog = createLogger("net.session");

/**
 * 전역 동시 연결 상한 기본값 — 소켓 고갈형 DoS 차단. 운영 값은 env MAX_CONNECTIONS를 worldMain.ts가
 * `setCaps`로 주입(Linux는 `ulimit -n`도 함께 올려야 함).
 */
export const MAX_CONNECTIONS = 2000;
/** IP별 동시 연결 상한 기본값(loopback 제외, IPv6는 /64 버킷) — env MAX_CONNECTIONS_PER_IP. */
export const MAX_CONNECTIONS_PER_IP = 32;
/**
 * 미인증 몫 기본 비율 — env MAX_PREAUTH_CONNECTIONS / MAX_PREAUTH_PER_IP 미설정 시 각각 전역 /
 * IP별 상한의 25%.
 */
const PRE_AUTH_CAP_SHARE = 0.25;

/** 미인증 동시 연결 상한 기본값 — 상한의 25%(올림, 최소 1). 전역 서브캡·IP별 몫 공용. */
export function defaultPreAuthCap(maxConnections: number): number {
  return Math.max(1, Math.ceil(maxConnections * PRE_AUTH_CAP_SHARE));
}

/** 카운트 맵 감소 — 0이 되면 키를 지워 맵이 과거 IP로 자라지 않게. */
function decrementKey(counts: Map<string, number>, key: string): void {
  const n = counts.get(key) ?? 0;
  if (n <= 1) counts.delete(key);
  else counts.set(key, n - 1);
}

export interface SessionManagerCaps {
  maxConnections?: number;
  maxConnectionsPerIp?: number;
  /**
   * 미인증(AUTHENTICATED 미도달) 동시 연결 상한. 미지정이면 `defaultPreAuthCap(maxConnections)`
   * — maxConnections 변경을 따라간다. null = 명시값을 지우고 그 기본으로 복귀.
   */
  maxPreAuthConnections?: number | null;
  /**
   * IP 버킷별 미인증 동시 연결 상한. 미지정이면 `defaultPreAuthCap(maxConnectionsPerIp)` —
   * maxConnectionsPerIp 변경을 따라간다. null = 명시값을 지우고 그 기본으로 복귀.
   */
  maxPreAuthPerIp?: number | null;
}

export type ConnVerdict =
  | "ok"
  | "global_cap"
  | "pre_auth_cap"
  | "per_ip_cap"
  | "pre_auth_per_ip_cap";

export class SessionManager implements PreAuthTracker {
  private readonly all = new Set<PlayerSession>();
  private readonly authenticated = new Map<number, PlayerSession>();
  /** 계정당 1세션 — accountId → 현재 점유 세션. AUTH 성공 시 claim, close 시 조건부 해제.
   *  authenticated(charId 키)와 별도인 이유: 캐릭터 선택 전(AUTHENTICATED) 세션도 점유해야
   *  같은 계정 다른 캐릭터 입장을 막을 수 있다. */
  private readonly byAccount = new Map<number, PlayerSession>();
  /** IP 버킷(`perIpKey` — IPv4 주소 / IPv6 /64 / NAT64→IPv4)별 라이브 연결 수. loopback은 미추적(예외). */
  private readonly perIp = new Map<string, number>();
  /**
   * 미인증 연결 집합 — 서브캡 판정. 집합 멤버십이라 이탈 경로(AUTHENTICATED 전이·close)가
   * 겹치거나 순서가 뒤바뀌어도(close 후 늦은 인증 완료) 감소는 정확히 1회.
   */
  private readonly preAuth = new Set<PlayerSession>();
  /** IP 버킷별 미인증 연결 수 — `preAuth` 멤버십 변화(추가·삭제 성공)에만 연동해 정확히 1회 증감. */
  private readonly preAuthPerIp = new Map<string, number>();
  /** process 단위 단조증가 connId 발급. 엣지 open(tcpServer localSink)이 PlayerSession 생성 직전 호출. */
  private connIdSeq = 1;
  private maxConnections = MAX_CONNECTIONS;
  private maxConnectionsPerIp = MAX_CONNECTIONS_PER_IP;
  /** 명시 pre-auth 서브캡. undefined = defaultPreAuthCap(maxConnections). */
  private maxPreAuthConnections: number | undefined = undefined;
  /** 명시 IP별 미인증 몫. undefined = defaultPreAuthCap(maxConnectionsPerIp). */
  private maxPreAuthPerIp: number | undefined = undefined;
  /**
   * withCork 캡처 버퍼(성능 3단계 슬라이스 4 — tick마다 세션 배열을 복사하지 않는다). 사용한 칸은 uncork 후
   * null로 비워 닫힌 세션을 붙잡지 않는다. 중첩 호출은 바깥 캡처를 덮지 않도록 새 배열을 쓴다.
   */
  private readonly corkBuf: (PlayerSession | null)[] = [];
  private corkDepth = 0;
  /**
   * sendMany의 MULTICAST 묶음(성능 4.5 F2) — 호출마다 재사용(게이트웨이 수만큼의 묶음). null = 꺼짐: monolith는 종전 루프를 그대로
   * 돈다(수신자별 경로 판정조차 없다). ROLE=world 배선(worldMain·토폴로지)이 IPC_MULTICAST=1이면 켠다(enableMulticast — 프로세스 수명 동안 유지).
   */
  private fanout: CastFanout | null = null;

  constructor(caps: SessionManagerCaps = {}) {
    this.setCaps(caps);
  }

  /** 상한 재설정 — 모듈 싱글톤이라 부팅 시 worldMain.ts가 env 값으로 1회 호출. 기존 연결은 유지. */
  setCaps(caps: SessionManagerCaps): void {
    if (caps.maxConnections !== undefined) this.maxConnections = caps.maxConnections;
    if (caps.maxConnectionsPerIp !== undefined) this.maxConnectionsPerIp = caps.maxConnectionsPerIp;
    if (caps.maxPreAuthConnections !== undefined) {
      this.maxPreAuthConnections = caps.maxPreAuthConnections ?? undefined;
    }
    if (caps.maxPreAuthPerIp !== undefined) {
      this.maxPreAuthPerIp = caps.maxPreAuthPerIp ?? undefined;
    }
  }

  /** 현재 추적 중인 연결 수(상한 판정 대상). */
  connectionCount(): number {
    return this.all.size;
  }

  /** 유효 pre-auth 서브캡(명시값 또는 전역 상한의 25%). */
  preAuthCap(): number {
    return this.maxPreAuthConnections ?? defaultPreAuthCap(this.maxConnections);
  }

  /** 유효 IP별 미인증 몫(명시값 또는 IP별 상한의 25%). */
  preAuthPerIpCap(): number {
    return this.maxPreAuthPerIp ?? defaultPreAuthCap(this.maxConnectionsPerIp);
  }

  /** 현재 미인증 연결 수. */
  preAuthCount(): number {
    return this.preAuth.size;
  }

  nextConnId(): number {
    return this.connIdSeq++;
  }

  /**
   * 연결 수용 시도 — 전역 → pre-auth 서브캡 → IP 버킷 총량 → IP 버킷 미인증 몫 순 검사. "ok"가
   * 아니면 호출자(sessionLifecycle.acceptSession)가 kick하고 이 세션은 추적되지 않는다(removeConnection이 false 반환,
   * 거절 시 어떤 카운터도 변하지 않음). 수용된 세션은 미인증으로 집계되고, AUTHENTICATED 전이
   * (`setSessionState`)가 `leavePreAuth`로 즉시 반환한다 — 미인증 소켓만으로 전역 슬롯을 전부
   * 점유할 수 없다.
   */
  addConnection(session: PlayerSession): ConnVerdict {
    if (this.all.size >= this.maxConnections) return "global_cap";
    const pre = session.preAuth !== false;
    if (pre && this.preAuth.size >= this.preAuthCap()) return "pre_auth_cap";
    const ipKey = perIpKey(session.remoteAddress);
    if (ipKey !== null) {
      const n = this.perIp.get(ipKey) ?? 0;
      if (n >= this.maxConnectionsPerIp) return "per_ip_cap";
      const preN = this.preAuthPerIp.get(ipKey) ?? 0;
      if (pre && preN >= this.preAuthPerIpCap()) return "pre_auth_per_ip_cap";
      this.perIp.set(ipKey, n + 1);
      if (pre) this.preAuthPerIp.set(ipKey, preN + 1);
    }
    this.all.add(session);
    if (pre) {
      this.preAuth.add(session);
      session.preAuthTracker = this;
    }
    return "ok";
  }

  /** pre-auth 이탈 통지(setSessionState) — 미추적·이미 반환된 세션이면 no-op. */
  leavePreAuth(session: PlayerSession): void {
    this.dropPreAuth(session);
  }

  /** 미인증 회계 반환 — 집합 삭제가 성공했을 때만 IP별 몫도 감소(이탈 경로 중복 시 정확히 1회). */
  private dropPreAuth(session: PlayerSession): void {
    if (!this.preAuth.delete(session)) return;
    const ipKey = perIpKey(session.remoteAddress);
    if (ipKey !== null) decrementKey(this.preAuthPerIp, ipKey);
  }

  /** 반환: 추적 중이던 세션이었는지 — 상한 거절 연결의 close가 카운터를 이중 감소시키지 않게. */
  removeConnection(session: PlayerSession): boolean {
    const wasTracked = this.all.delete(session);
    this.dropPreAuth(session);
    if (wasTracked) {
      const ipKey = perIpKey(session.remoteAddress);
      if (ipKey !== null) decrementKey(this.perIp, ipKey);
    }
    // 선점 킥으로 같은 키를 새 세션이 이미 점유했을 수 있다 — "내 것일 때만" 삭제.
    // 무조건 delete면 옛 세션의 close가 새 세션 엔트리를 지워 sendTo/withCork/autoSave에서
    // 통째로 빠진 유령 세션이 된다.
    this.releaseAuthenticated(session);
    if (session.accountId !== null && this.byAccount.get(session.accountId) === session) {
      this.byAccount.delete(session.accountId);
    }
    return wasTracked;
  }

  /**
   * authenticated 엔트리 조건부 해제 — 자기 자신이 점유자일 때만. preemptSession이 밀려난
   * 세션을 즉시 정리해, close 지연(링크 꼬리 flush 대기 ≤5초) 동안 승자의 addAuthenticated가
   * "타 세션 덮어쓰기" 불변식 경고로 관측되거나 enterWorld 가드가 이미 킥된 세션을 재선점하는
   * 것을 방지한다.
   */
  releaseAuthenticated(session: PlayerSession): void {
    if (session.playerId !== null && this.authenticated.get(session.playerId) === session) {
      this.authenticated.delete(session.playerId);
    }
  }

  addAuthenticated(session: PlayerSession): void {
    if (session.playerId !== null) {
      const prev = this.authenticated.get(session.playerId);
      if (prev !== undefined && prev !== session) {
        // 정상 흐름에선 도달 불가(선점 킥이 먼저 정리) — 불변식 위반 조기 감지용.
        sessionLog.warn(
          { playerId: session.playerId, prevConnId: prev.connId, connId: session.connId },
          "addAuthenticated overwrote another live session",
        );
      }
      this.authenticated.set(session.playerId, session);
    }
  }

  /**
   * 계정 점유권을 이 세션으로 교체하고, 밀려난 기존 세션을 반환한다(없거나 자기 자신이면 null).
   * 검사와 교체가 await 없는 단일 동기 구간이므로 두 연결이 동시에 "점유자 없음"을 볼 수 없다.
   * 호출자는 session.accountId 스탬프를 이 호출 "뒤"에(같은 동기 구간에서) 할 것 — 여기서
   * 이전 값을 읽어 재-AUTH 계정 전환 시 옛 클레임을 해제한다(스탬프가 앞서면 이전 클레임이
   * 죽은 세션을 가리킨 채 영구 잔류하고, 이후 그 계정의 정상 로그인이 무관 세션을 킥한다).
   */
  claimAccount(accountId: number, session: PlayerSession): PlayerSession | null {
    if (
      session.accountId !== null &&
      session.accountId !== accountId &&
      this.byAccount.get(session.accountId) === session
    ) {
      this.byAccount.delete(session.accountId);
    }
    const prev = this.byAccount.get(accountId);
    this.byAccount.set(accountId, session);
    return prev !== undefined && prev !== session ? prev : null;
  }

  /**
   * claimAccount 되돌리기 — 클레임 뒤 AUTH가 실패했을 때(토큰 발급 실패). 이 세션이 아직 점유자일 때만 한다(그 사이 다른 세션이
   * 가져갔으면 그대로). 밀어낸 세션(prev = claimAccount 반환값)은 아직 킥하지 않았으므로 살아 있으면 점유를 돌려준다 — 안 돌려주면
   * 그 세션은 점유 없이 인월드에 남아 다음 로그인이 그 세션을 선점하지 못한다. 닫히는 중이면 해제(죽은 엔트리를 남기지 않는다).
   */
  revertAccountClaim(accountId: number, session: PlayerSession, prev: PlayerSession | null): void {
    if (this.byAccount.get(accountId) !== session) return;
    if (prev !== null && !prev.socket.closing) this.byAccount.set(accountId, prev);
    else this.byAccount.delete(accountId);
  }

  /** 현재 계정 점유 세션 — enterWorld 2차 가드·authHandler 발급 뒤 재확인이 "내가 아직 점유자인가"를 확인. */
  accountSession(accountId: number): PlayerSession | undefined {
    return this.byAccount.get(accountId);
  }

  get(playerId: number): PlayerSession | undefined {
    return this.authenticated.get(playerId);
  }

  /**
   * AOI 기반 단일 송신 — SnapshotBuilder가 사용. broadcast()는 의도적으로 미제공.
   * 부분 쓰기는 세션 링크(OutboundLink)가 꼬리로 보관해 drain 때 이어 쓴다(1-C(3)) — 종료는
   * 꼬리가 OUTBOUND_MAX_BYTES를 넘는 느린 소비자뿐(종전 "부분 쓰기 = 종료"는 폐기).
   */
  sendTo<I extends S2CPacketId>(playerId: number, packetId: I, payload: PayloadOf<I>): void {
    const session = this.authenticated.get(playerId);
    if (!session) return;
    session.send(packetId, payload);
  }

  /**
   * 같은 페이로드를 여러 플레이어에게(성능 3단계 슬라이스 5) — 첫 실수신자에서 프레임을 1회 인코딩해 모두에게 보낸다.
   * 결과는 ids 순서대로 sendTo를 반복한 것과 같다: 미인증 id는 건너뛰고, 중복 id는 중복 송신한다(중복 제거는 호출자
   * 몫), 수신자별 바이트·netPacketsTx 집계도 같다. 세션 outbox·링크는 프레임을 복사해 두므로 공유해도 안전하다.
   * 성능 4.5 F2(ROLE=world, enableMulticast 이후): MULTICAST 경로가 있는 수신자(원격 링크·outbox 빔)는 게이트웨이 피어별로 묶어
   * CONN_MULTICAST 레코드 1개로 보낸다(castFanout.ts) — 연결별 바이트·순서·집계는 같다. 꺼져 있으면(monolith) 종전 루프 그대로다.
   * 인코드 실패(이진 전환 B4 — encodeGuard.ts)는 그 패킷을 아무에게도 보내지 않고 1건으로 기록한다: 인코딩이 첫 실수신자에서 수신자 처리보다
   * 먼저라 일부만 받는 일은 없다.
   */
  sendMany<I extends S2CPacketId>(playerIds: readonly number[], packetId: I, payload: PayloadOf<I>): void {
    if (this.fanout === null) {
      this.sendManyEach(playerIds, packetId, payload);
      return;
    }
    let frame: Buffer | null = null;
    const fan = this.fanout.busy ? new CastFanout() : this.fanout;
    for (let i = 0; i < playerIds.length; i++) {
      const session = this.authenticated.get(playerIds[i]!);
      if (session === undefined) continue;
      if (frame === null) {
        frame = encodeOrDrop(packetId, payload);
        if (frame === null) return;
      }
      const route = session.castRoute();
      if (route === null) session.writeOrEnqueue(packetId, frame);
      else fan.add(route, session);
    }
    if (frame !== null && fan.pending) fan.flush(packetId, frame);
  }

  /** MULTICAST 켜기(성능 4.5 F2) — ROLE=world 배선(worldMain·토폴로지)이 월드 IPC 서버 옆에서 부른다. idempotent, 끄는 경로는 없다(링크별 경로가 판정한다). */
  enableMulticast(): void {
    this.fanout ??= new CastFanout();
  }

  /** 종전 sendMany(성능 3단계 슬라이스 5) — 첫 실수신자에서 1회 인코딩, 수신자마다 연결별 경로. */
  private sendManyEach<I extends S2CPacketId>(playerIds: readonly number[], packetId: I, payload: PayloadOf<I>): void {
    let frame: Buffer | null = null;
    for (let i = 0; i < playerIds.length; i++) {
      const session = this.authenticated.get(playerIds[i]!);
      if (session === undefined) continue;
      if (frame === null) {
        frame = encodeOrDrop(packetId, payload);
        if (frame === null) return;
      }
      session.writeOrEnqueue(packetId, frame);
    }
  }

  /**
   * 미리 인코딩한 프레임(writePacket 결과와 같은 바이트) 송신 — 스냅샷 SPAWN/DESPAWN 프레임을 viewer 사이에서 재사용.
   * frame은 이 호출 동안만 읽는다(outbox는 복사해 붙이고 링크는 못 보낸 꼬리를 복사한다) — 재사용 버퍼 뷰도 된다
   * (SNAPSHOT_DELTA 빠른 경로, 성능 3단계 슬라이스 7).
   */
  sendFrame(playerId: number, packetId: number, frame: Buffer): void {
    this.authenticated.get(playerId)?.writeOrEnqueue(packetId, frame);
  }

  /**
   * 공유 프레임 송신(성능 4.5 F3 — SNAPSHOT_DELTA 묶음, sim/deltaGroups.ts): 클라 바이트 = frame을 복사하고 patchOff에 value(ackSeq). 로컬
   * 링크는 outbox에 복사·패치(종전 sendFrame과 같은 바이트), 원격 링크(IPC_SHARED=1)는 outbox가 참조만 들고 게이트웨이 봉투에 프레임을
   * 1회 정의한다(PlayerSession.writeShared). frame은 발급자가 재발급할 때까지 유효하다(DeltaGroups 풀 — 두 dispatch 뒤).
   */
  sendShared(playerId: number, packetId: number, frame: SharedFrame, value: number): void {
    this.authenticated.get(playerId)?.writeShared(packetId, frame, value);
  }

  /**
   * 이동동기화 후속(코얼레싱): fn(한 tick) 동안의 세션별 송신 프레임을 outbox에 모아
   * tick 말미 1회 write로 묶는다 — NODELAY 후 커진 pps·헤더 오버헤드 증폭 해소.
   * 불변식(리뷰): cork한 세션 집합을 배열로 캡처해 **같은 집합**을 uncork — fn 도중
   * authenticated에서 빠진 세션이 영구 corked(송신 무한 버퍼링)로 남지 않게 한다.
   * fn 예외에도 uncork는 세션별 격리로 반드시 수행하고, uncork 자체가 던지면 해당
   * 세션은 프레임을 잃은 desync 상태이므로 종료한다.
   * 재진입: uncork의 송신이 꼬리 상한 초과로 링크를 terminate하면 Bun close 콜백
   * (sessionLifecycle.closeSession — saveOnDisconnect·unbindConn·removeConnection)이 이 루프 안에서
   * 동기 실행된다. corked는 배열 스냅샷이고 close 본체는 송신하지 않으므로 나머지 세션의
   * flush는 영향받지 않는다(outboundLink.ts 상단 불변식, closingLink.test.ts).
   * 킥(send(KICK) + socket.end())은 cork 구간 안에서도 안전하다 — end()가 outbox를 먼저 링크로 보낸다(성능 3단계
   * 슬라이스 6, OutboundLink 종료 전 훅). 그 세션은 코킹이 풀리고, 이후 이 tick의 송신은 종료 중 링크라 버려진다.
   * 지연 코킹(수신 디스패치 구간, deferredSends.ts)으로 이미 프레임이 쌓인 세션도 cork는 그 outbox를 이어 쓰고
   * uncork가 함께 보낸다 — 턴 끝 flush보다 tick이 먼저 돌아도 순서·바이트 불변.
   * 계측(성능 2-A): marker를 주면 cork 직후 "cork", uncork 루프 직후 "flush"를 mark한다 —
   * 경과 측정(clock)은 marker 구현(obs/tickProfiler) 몫이다.
   */
  withCork(fn: () => void, marker?: PhaseMarker): void {
    const corked = this.corkDepth === 0 ? this.corkBuf : [];
    let n = 0;
    for (const s of this.authenticated.values()) {
      corked[n++] = s;
      s.cork();
    }
    this.corkDepth++;
    marker?.mark(CORK_PHASE);
    try {
      fn();
    } finally {
      // 깊이는 uncork 루프 뒤에 내린다 — 루프 안(close 재진입)에서 withCork가 불려도 이 버퍼를 덮지 않게.
      try {
        for (let i = 0; i < n; i++) {
          const s = corked[i]!;
          corked[i] = null;
          s.flushOrClose();
        }
      } finally {
        this.corkDepth--;
      }
      marker?.mark(FLUSH_PHASE);
    }
  }

  /** autosave가 모든 인증 세션을 순회하기 위해. */
  authenticatedValues(): IterableIterator<PlayerSession> {
    return this.authenticated.values();
  }
}

export const sessionManager = new SessionManager();
