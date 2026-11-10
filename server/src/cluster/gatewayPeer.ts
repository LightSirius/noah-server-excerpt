// 게이트웨이 피어(월드 쪽) — 성능 4단계 4.2b. HELLO를 마친 IPC 연결 1개 = 게이트웨이 프로세스 1개분의 상태:
//   - 송신 배치(WorldIpcWriter 1개): 세션 링크(RemoteClientLink)·월드 IPC 서버가 레코드를 쌓고, flush가 봉투째 파이프로 넘긴다.
//     연속 DELIVER는 봉투 1개를 공유하고 비배치 메시지가 봉투를 닫는다 — 연결별 STATE/DELIVER/CLOSE 순서 = 발행 순서.
//   - flush 시점: tick 끝(serverTick ipcFlush)·이벤트 루프 턴 끝(deferredSends 턴 끝 훅) — flush 이후 첫 기록이 onDirty로
//     월드 IPC 서버에 1회 등록한다. 버퍼가 flushAtBytes(기본 1 MiB = 봉투 분할 임계) 이상이면 기다리지 않고 즉시 보낸다 —
//     대량 팬아웃(채팅 버스트 등)에서 월드 메모리를 파이프 대기 상한(IPC_MAX_PENDING_MB, 넘으면 이 게이트웨이를 끊는다)으로 묶는다.
//   - 연결 표: localId → PlayerSession(CONN_OPEN부터 CONN_CLOSED까지 — 거절된 연결도 CONN_CLOSED까지 남는다. 감축된 연결은 예외:
//     월드가 즉시 표에서 빼고 거절 목록에 둔다 — 4.5 후속 점진 감축, shedDue·shedConn).
//     localId는 게이트웨이 incarnation 안에서 단조 증가(재사용·역행 = 프로토콜 위반, admitLocalId).
//   - 생존: kill 이후 또는 파이프가 닫힌 뒤에는 기록을 거절한다(deliver false → 링크가 종료 상태로 고정).
//   - 접속 제한(성능 4.5, evaluateAdmission — 월드 IPC 서버가 flushAll마다 부른다): 파이프 대기 ≥ softBytes면 busy, 대기 ≤ clearBytes가
//     holdMs 동안 이어지면 clear. 전이마다 ADMISSION(state)을 긴급 송신한다(IpcPipe.writeUrgent — 대기 봉투들을 경계에서 앞지른다).
//     busy인 동안 새 CONN_OPEN은 refuseOpen — DELIVER(KICK 9) + CONN_CLOSE도 긴급(그 localId엔 앞선 기록이 없다), 세션을 만들지
//     않고 거절 목록에 둔다(게이트웨이의 CONN_CLOSED까지 — 그 사이 프레임·CONN_CLOSED는 stale로 세지 않는다).
//   - MULTICAST(성능 4.5 F2, CastSink): sendMany 팬아웃 프레임을 이 게이트웨이의 수신자 목록과 함께 CONN_MULTICAST 레코드 1개로(65,535명
//     초과는 나눈다). 바이트가 줄지 않거나(수신자 × 프레임 ≤ 레코드) 봉투에 안 들어가면 false — 호출자가 연결별 경로로 보낸다. MULTICAST를
//     쓴 flush 창은 창 끝 flush(flushAll·shutdown — flush() 기본값)에 CONN_FLUSH를 붙여 닫는다(게이트웨이가 미뤄 둔 연결별 바이트를
//     쓰는 표식). 창 중간 임계 flush(flush(false))는 표식을 쓰지 않고 dirty를 다시 걸어 창 끝 flush를 예약한다.
//   - 공유 프레임(성능 4.5 F3, SharedDeliverSink): 세션 outbox의 인라인 + 끝 공유 참조(SNAPSHOT_DELTA 묶음)를 CONN_DELIVER_SHARED의 CONN_REF로 —
//     프레임은 이 게이트웨이 봉투에 처음일 때만 DEF로 싣는다(writer — 봉투 범위). 연결별 순서는 DELIVER와 같다(레코드 1개 = 송신 1건).
//   - 리스너 양보(IPC v14): 마지막 LISTEN_REPORT와 마지막으로 보낸 LISTEN(mode·seq — 처음은 listen·0)을 기록한다(listenView). 계획은
//     listenPlan.planListen, 송신 판단은 worldListen — directListen이 마지막과 다른 지시만 seq를 올려 긴급 송신한다(중복 제거).
// 파이프 close 통지는 마이크로태스크라 flush·기록 안에서 파이프가 닫혀도(대기 상한) 피어 정리가 송신 경로에 재진입하지 않는다.

import type { LoginState } from "../identity/loginFlow";
import type { CastSink } from "../network/clientLink";
import type { PlayerSession } from "../network/session";
import { metrics } from "../obs/metrics";
import { type IpcDecoder, type IpcWriterOptions, WorldIpcWriter, multicastRecordBytes } from "./ipcCodec";
import type { IpcPipe, PipeCloseReason } from "./ipcPipe";
import {
  type ByeReason,
  IPC_DEFAULT_BATCH_SPLIT_BYTES,
  IPC_DELIVER_RECORD_HEADER,
  IPC_MULTICAST_MAX_IDS,
  IPC_MULTICAST_RECORD_FIXED,
  IPC_SHARED_REF_HEADER,
  type ListenMode,
} from "./ipcSchema";
import type { ListenPeerView, ListenReport } from "./listenPlan";
import type { PeerOutbound, SharedDeliverSink } from "./remoteClientLink";
import type { SharedFrame } from "../net/sharedFrame";

const ipcTxBytes = metrics.ipcTxBytes.bind(undefined);
const castRecords = metrics.ipcMulticastRecords.bind(undefined);
const castRecipients = metrics.ipcMulticastRecipients.bind(undefined);
const castSaved = metrics.ipcMulticastSavedBytes.bind(undefined);
const sharedDefs = metrics.ipcSharedDefs.bind(undefined);
const sharedRefs = metrics.ipcSharedRefs.bind(undefined);
const sharedSaved = metrics.ipcSharedSavedBytes.bind(undefined);
/** DEF를 재사용한 CONN_REF가 CONN_DELIVER 대비 더 쓰는 바이트 — 머리 17 − 8. 절감 = 프레임 − 이것. */
const SHARED_REUSE_COST = IPC_SHARED_REF_HEADER - IPC_DELIVER_RECORD_HEADER;

/**
 * MULTICAST가 줄이는 IPC 바이트의 하한 — 수신자마다 프레임 복사(F × count) 대비. 레코드는 IPC_MULTICAST_MAX_IDS명마다 1개. 실제 대안
 * 경로는 outbox가 빈 수신자마다 CONN_DELIVER 머리(8B)를 새로 쓸 수도 있지만, 같은 창에 그 연결의 다른 프레임이 합류하면 머리를 공유하므로
 * 의도적으로 F만 센다(보수 판정 — 작은 프레임은 연결별 경로로 남는다. mmorpg_ipc_multicast_saved_bytes_total도 이 하한).
 */
export function multicastSavedBytes(frameBytes: number, count: number): number {
  const records = Math.ceil(count / IPC_MULTICAST_MAX_IDS);
  return (count - records) * frameBytes - IPC_MULTICAST_RECORD_FIXED * records - 4 * count;
}

/** HELLO가 실어 온 게이트웨이 식별. */
export interface GatewayPeerInfo {
  readonly gatewayId: number;
  /** 게이트웨이 프로세스 기동마다 새 값 — 재접속 펜싱 키(월드 IPC 서버). */
  readonly incarnation: number;
  readonly pid: number;
}

/** 피어별 소프트 임계(env IPC_ADMISSION_* — worldMain이 IPC_MAX_PENDING_MB의 비율로 바이트를 계산). */
export interface PeerAdmissionPolicy {
  /** 파이프 대기 바이트가 이 이상이면 busy. */
  readonly softBytes: number;
  /** busy 해제 조건 — 대기가 이 이하로 holdMs 동안 이어진다(softBytes 미만이어야 한다). */
  readonly clearBytes: number;
  readonly holdMs: number;
}

/** env 표면 — 피어 소프트 임계 키(config/env.ts). */
export interface PeerAdmissionEnv {
  readonly IPC_MAX_PENDING_MB: number;
  readonly IPC_ADMISSION_SOFT_PCT: number;
  readonly IPC_ADMISSION_CLEAR_PCT: number;
  readonly IPC_ADMISSION_HOLD_MS: number;
}

/**
 * 정책 불변식 — 정수 0 ≤ clearBytes < softBytes, holdMs ≥ 0(위반은 RangeError). env 가드(IPC_ADMISSION_CLEAR_PCT < SOFT_PCT)와 같은
 * 규칙을 정책 객체에도 건다: clear ≥ soft면 hold가 끝날 때마다 busy ↔ open이 깜빡이며 ADMISSION 긴급 송신·로그가 반복된다.
 */
export function assertPeerAdmissionPolicy(p: PeerAdmissionPolicy): void {
  const intAtLeast = (v: number, min: number): boolean => Number.isInteger(v) && v >= min;
  if (!intAtLeast(p.softBytes, 1) || !intAtLeast(p.clearBytes, 0) || !intAtLeast(p.holdMs, 0) || p.clearBytes >= p.softBytes) {
    throw new RangeError(
      `peer admission policy needs integers 0 <= clearBytes < softBytes and holdMs >= 0: ${JSON.stringify(p)}`,
    );
  }
}

/** env → 피어 정책(IPC_MAX_PENDING_MB의 비율을 바이트로). 소프트 0 = 끔(undefined). */
export function peerAdmissionPolicyFromEnv(e: PeerAdmissionEnv): PeerAdmissionPolicy | undefined {
  if (e.IPC_ADMISSION_SOFT_PCT <= 0) return undefined;
  const cap = e.IPC_MAX_PENDING_MB * 1024 * 1024;
  return {
    softBytes: Math.floor(cap * (e.IPC_ADMISSION_SOFT_PCT / 100)),
    clearBytes: Math.floor(cap * (e.IPC_ADMISSION_CLEAR_PCT / 100)),
    holdMs: e.IPC_ADMISSION_HOLD_MS,
  };
}

/** evaluateAdmission 전이 — busy: 거절 시작, clear: 다시 받는다. */
export type AdmissionTransition = "busy" | "clear";

/**
 * 피어 점진 감축(env IPC_SHED_* — 4.5 후속). 소프트 임계는 신규 접속만 막아 이미 붙은 부하가 게이트웨이 IPC 수신 속도를 넘으면
 * (macOS 실측: 2000명 게이트웨이가 ≈105 MB/s에서 막혀 3–6초 만에 하드 상한) 그 게이트웨이가 통째로 끊긴다. 대기가 shedBytes 이상이고
 * 계속 늘면 인월드 세션 중 무작위로 fraction만큼씩(스텝 상한 maxPerStep) KICK 9로 줄여 하드 상한 drop(전원 KICK 6) 전에 생성량을 낮춘다.
 */
export interface PeerShedPolicy {
  /** 파이프 대기 바이트가 이 이상이면 감축 후보. 그 밑으로 내려가면 에피소드가 끝난다(기준점 리셋). */
  readonly shedBytes: number;
  /** 감축 1회에 줄일 인월드 세션 비율(0 < f ≤ 1, 최소 1명). */
  readonly fraction: number;
  /** 감축 사이 최소 간격(ms) — 직전 감축의 효과(생성량 감소)를 볼 시간. */
  readonly cooldownMs: number;
  /** 감축 1회 상한(명) — 감축 세션은 한 번의 동기 배치 저장으로 정리된다(autoSave 청크와 같은 이유). */
  readonly maxPerStep: number;
}

export interface PeerShedEnv {
  readonly IPC_MAX_PENDING_MB: number;
  readonly IPC_SHED_PCT: number;
  readonly IPC_SHED_FRACTION_PCT: number;
  readonly IPC_SHED_COOLDOWN_MS: number;
  readonly IPC_SHED_MAX_PER_STEP: number;
}

export function assertPeerShedPolicy(p: PeerShedPolicy): void {
  const int = (v: number, min: number): boolean => Number.isInteger(v) && v >= min;
  const ok = int(p.shedBytes, 1) && p.fraction > 0 && p.fraction <= 1 && int(p.cooldownMs, 0) && int(p.maxPerStep, 1);
  if (!ok) {
    throw new RangeError(
      `peer shed policy needs integers shedBytes >= 1, cooldownMs >= 0, maxPerStep >= 1 and 0 < fraction <= 1: ${JSON.stringify(p)}`,
    );
  }
}

/** env → 감축 정책(IPC_MAX_PENDING_MB의 비율을 바이트로). IPC_SHED_PCT 0 = 끔(undefined). */
export function peerShedPolicyFromEnv(e: PeerShedEnv): PeerShedPolicy | undefined {
  if (e.IPC_SHED_PCT <= 0) return undefined;
  return {
    shedBytes: Math.floor(e.IPC_MAX_PENDING_MB * 1024 * 1024 * (e.IPC_SHED_PCT / 100)),
    fraction: e.IPC_SHED_FRACTION_PCT / 100,
    cooldownMs: e.IPC_SHED_COOLDOWN_MS,
    maxPerStep: e.IPC_SHED_MAX_PER_STEP,
  };
}

export interface GatewayPeerOptions {
  /** flush 이후 첫 기록에서 1회 — 월드 IPC 서버가 tick 끝·턴 끝 flush에 등록한다. */
  onDirty: (peer: GatewayPeer) => void;
  /** 봉투 상한·분할 임계(테스트 축소용). */
  writer?: IpcWriterOptions;
  /** 버퍼가 이 바이트 이상이면 즉시 flush(기본 1 MiB). */
  flushAtBytes?: number;
}

export class GatewayPeer implements PeerOutbound, CastSink, SharedDeliverSink {
  /** localId → 세션(CONN_OPEN ~ CONN_CLOSED). */
  readonly conns = new Map<number, PlayerSession>();
  /** BYE로 예고한 이탈 사유 — 이후 상대가 끊으면 피어 유실 사유가 bye(월드 IPC 서버). 미예고 = null. */
  byeReason: ByeReason | null = null;
  private readonly writer: WorldIpcWriter;
  /** 긴급 송신 전용(ADMISSION·거절 쌍) — 배치 writer의 열린 봉투와 섞이지 않게 따로 인코딩한다. */
  private readonly urgentWriter = new WorldIpcWriter({ initialCapacity: 256 });
  /** writeUrgent로 보내는 sink(flushTo 대상). */
  private readonly urgentSink = { write: (buf: Buffer, release?: () => void) => this.pipe.writeUrgent(buf, release) };
  /** 바쁜 동안 거절한 localId·감축한 localId — 게이트웨이의 CONN_CLOSED까지(그 사이 프레임·CONN_CLOSED는 stale이 아니다). */
  private readonly refused = new Set<number>();
  private busy = false;
  /** busy 중 대기 ≤ clearBytes가 시작된 시각(그 위로 오르면 null). */
  private clearSince: number | null = null;
  /** 직전 감축 시각과 그 뒤 관측한 최저 대기(-1 = 에피소드 밖) — 쿨다운과 "다시 늘었나" 판정(shedDue). */
  private lastShedAt = Number.NEGATIVE_INFINITY;
  private minSinceShed = -1;
  private readonly onDirty: (peer: GatewayPeer) => void;
  private readonly flushAtBytes: number;
  private lastLocalId = 0;
  private live = true;
  private dirty = false;
  /** 이번 flush 창에 MULTICAST를 썼다 — 창 끝 flush가 CONN_FLUSH를 붙인다. */
  private castOpen = false;
  /** 마지막 LISTEN_REPORT(없으면 null)와 마지막으로 보낸 LISTEN(처음은 listen·seq 0 — 암묵). */
  private listenReport: ListenReport | null = null;
  private listenMode: ListenMode = "listen";
  private listenSeq = 0;

  /** decoder: 이 파이프의 수신 디코더 — kill이 멈춘다(남은 봉투를 내보내지 않음). */
  constructor(
    readonly info: GatewayPeerInfo,
    readonly pipe: IpcPipe,
    private readonly decoder: IpcDecoder,
    opts: GatewayPeerOptions,
  ) {
    this.writer = new WorldIpcWriter(opts.writer);
    this.onDirty = opts.onDirty;
    this.flushAtBytes = opts.flushAtBytes ?? IPC_DEFAULT_BATCH_SPLIT_BYTES;
  }

  /** 기록을 받는가 — kill 이전이고 파이프가 열려 있다. */
  get alive(): boolean {
    return this.live && !this.pipe.closed;
  }

  /** 이 피어의 신규 접속을 거절 중인가(소프트 임계). */
  get admissionBusy(): boolean {
    return this.busy;
  }

  /** 아직 flush하지 않은 배치 바이트. */
  get bufferedBytes(): number {
    return this.writer.bufferedBytes;
  }

  deliver(localId: number, bytes: Uint8Array): boolean {
    if (!this.alive) return false;
    this.writer.deliver(localId, bytes);
    this.wrote();
    return true;
  }

  /**
   * 공유 프레임 송신(성능 4.5 F3) — inline 뒤 frame(patchOff에 value)을 그 연결에 1건으로. 열린 봉투에 그 프레임의 DEF가 있거나 이 피어로 갈
   * 참조가 이것 말고도 남았으면(frame.take — 세션이 hold로 센 수) CONN_REF(필요하면 DEF를 앞에), 혼자면 평문 복사(DEF + CONN_REF가 16바이트
   * 더 든다). false = 죽은 피어(기록 안 함 — 링크가 종료 상태로 고정된다).
   */
  deliverShared(localId: number, inline: Uint8Array, frame: SharedFrame, value: number): boolean {
    if (!this.alive) return false;
    const pending = frame.take(this);
    if (pending < 2 && !this.writer.hasShared(frame)) this.writer.deliverPatched(localId, inline, frame, value);
    else {
      if (this.writer.deliverShared(localId, inline, frame, value)) sharedDefs.inc();
      else sharedSaved.inc(frame.bytes.length - SHARED_REUSE_COST);
      sharedRefs.inc();
    }
    this.wrote();
    return true;
  }

  /** CONN_MULTICAST — false = 기록 안 함(죽은 피어·바이트가 줄지 않음·봉투 상한 초과): 호출자가 연결별 경로로 보낸다. */
  multicast(frame: Uint8Array, localIds: Uint32Array, count: number): boolean {
    if (!this.alive) return false;
    const saved = multicastSavedBytes(frame.length, count);
    const perRecord = Math.min(count, IPC_MULTICAST_MAX_IDS);
    if (saved <= 0 || !this.writer.fits(multicastRecordBytes(frame.length, perRecord))) return false;
    let records = 0;
    for (let start = 0; start < count; start += IPC_MULTICAST_MAX_IDS, records++) {
      this.writer.multicast(frame, localIds, start, Math.min(IPC_MULTICAST_MAX_IDS, count - start));
    }
    this.castOpen = true;
    castRecords.inc(records);
    castRecipients.inc(count);
    castSaved.inc(saved);
    this.wrote();
    return true;
  }

  connState(localId: number, state: LoginState): void {
    if (!this.alive) return;
    this.writer.connState(localId, state);
    this.wrote();
  }

  connClose(localId: number): void {
    if (!this.alive) return;
    this.writer.connClose(localId);
    this.wrote();
  }

  connAccepted(localId: number, worldConnId: number): void {
    if (!this.alive) return;
    this.writer.connAccepted(localId, worldConnId);
    this.wrote();
  }

  helloAck(worldIncarnation: number, connCap: number): void {
    if (!this.alive) return;
    this.writer.helloAck({ worldIncarnation, connCap });
    this.wrote();
  }

  pong(seq: number): void {
    if (!this.alive) return;
    this.writer.pong(seq);
    this.wrote();
  }

  shutdown(kickReason: number): void {
    if (!this.alive) return;
    this.writer.shutdown(kickReason);
    this.wrote();
  }

  /** CONN_OPEN localId 수락 — 직전보다 커야 한다(false = 재사용·역행, 프로토콜 위반). */
  admitLocalId(localId: number): boolean {
    if (localId <= this.lastLocalId) return false;
    this.lastLocalId = localId;
    return true;
  }

  /**
   * 소프트 임계 평가(flush 뒤 — 대기 바이트가 최신). 전이가 있으면 ADMISSION을 긴급 송신하고 그 전이를, 없으면 null.
   * 죽은 피어는 평가하지 않는다. now = ms 단조 시계(월드 IPC 서버 주입).
   */
  evaluateAdmission(policy: PeerAdmissionPolicy, now: number): AdmissionTransition | null {
    if (!this.alive) return null;
    const pending = this.pipe.pendingBytes;
    if (!this.busy) {
      if (pending < policy.softBytes) return null;
      this.busy = true;
      this.clearSince = null;
      this.sendUrgent((w) => w.admission(true));
      return "busy";
    }
    if (pending > policy.clearBytes) {
      this.clearSince = null;
      return null;
    }
    this.clearSince ??= now;
    if (now - this.clearSince < policy.holdMs) return null;
    this.busy = false;
    this.clearSince = null;
    this.sendUrgent((w) => w.admission(false));
    return "clear";
  }

  /** 바쁜 피어의 새 localId 거절 — DELIVER(kick) + CONN_CLOSE 긴급 송신, CONN_CLOSED까지 거절 목록(admitLocalId를 먼저 통과). */
  refuseOpen(localId: number, kick: Uint8Array): void {
    this.refused.add(localId);
    this.sendUrgent((w) => {
      w.deliver(localId, kick);
      w.connClose(localId);
    });
  }

  /**
   * 감축 시점인가(평가마다 부른다 — 대기 바이트가 최신이어야 한다). 대기 < shedBytes면 에피소드를 끝낸다(다음 에피소드의 첫 감축은
   * 무조건 — 기준점이 지난 에피소드의 고점에 남으면 임계가 래칫처럼 오른다, 4.5 후속 리뷰). 에피소드 안에서는 직전 감축 뒤 관측한
   * 최저 대기를 기억해, 쿨다운이 지났고 대기가 그 최저보다 높을 때만(= 다시 늘고 있다) 참 — 줄고 있으면 직전 감축이 듣는 중이다.
   * 판정만 한다 — 실제로 줄였으면 noteShed로 기록한다(0명이면 쿨다운을 쓰지 않는다).
   */
  shedDue(policy: PeerShedPolicy, now: number): boolean {
    if (!this.alive) return false;
    const pending = this.pipe.pendingBytes;
    if (pending < policy.shedBytes) {
      this.minSinceShed = -1;
      return false;
    }
    if (this.minSinceShed >= 0 && pending < this.minSinceShed) this.minSinceShed = pending;
    if (now - this.lastShedAt < policy.cooldownMs) return false;
    return this.minSinceShed < 0 || pending > this.minSinceShed;
  }

  /** 감축을 실행했다 — 쿨다운 시작, 에피소드 최저를 지금 대기로. */
  noteShed(now: number): void {
    this.lastShedAt = now;
    this.minSinceShed = this.pipe.pendingBytes;
  }

  /**
   * 이미 붙은 연결 감축 — refuseOpen과 같은 긴급 쌍(DELIVER(kick) + CONN_CLOSE)으로 대기 봉투를 앞지르고, CONN_CLOSED까지 거절 목록에
   * 둔다. 그 localId로 이미 쌓인 봉투 기록은 게이트웨이가 닫은 뒤 버린다(stale 또는 종료 중 링크 — 게이트웨이
   * `mmorpg_gw_stale_records_total{type="deliver"}`가 감축 직후 오르는 것은 정상). 호출자가 conns에서 빼고 세션을 정리한다.
   */
  shedConn(localId: number, kick: Uint8Array): void {
    this.refuseOpen(localId, kick);
  }

  /** 리스너 양보 계획기가 보는 이 피어(listenPlan). */
  get listenView(): ListenPeerView {
    return {
      report: this.listenReport,
      admissionBusy: this.busy,
      leaving: this.byeReason !== null,
      lastSentMode: this.listenMode,
      lastSentSeq: this.listenSeq,
    };
  }

  /** LISTEN_REPORT 수신 — 최신 스냅샷으로 덮어쓴다(재계획은 호출자). */
  noteListenReport(report: ListenReport): void {
    this.listenReport = report;
  }

  /** 원하는 지시가 마지막으로 보낸 것과 다르면 seq를 올려 LISTEN을 긴급 송신하고 그 seq를, 같거나 죽은 피어면 0. */
  directListen(mode: ListenMode): number {
    if (!this.alive || mode === this.listenMode) return 0;
    this.listenMode = mode;
    this.listenSeq = this.listenSeq >= 0xffffffff ? 1 : this.listenSeq + 1;
    const seq = this.listenSeq;
    this.sendUrgent((w) => w.listen(mode, seq));
    return seq;
  }

  /** 거절해 둔 localId인가(그 프레임은 stale이 아니라 버린다). */
  isRefused(localId: number): boolean {
    return this.refused.has(localId);
  }

  /** CONN_CLOSED — 거절 목록에서 뺀다. 반환 = 목록에 있었나. */
  forgetRefused(localId: number): boolean {
    return this.refused.delete(localId);
  }

  /**
   * 배치를 봉투째 파이프로. 비었으면 무동작 true. false = 죽은 피어·닫힌 파이프(이번 쓰기에서 대기 상한으로 닫힘 포함).
   * windowEnd(기본 — flushAll·shutdown): MULTICAST를 쓴 창이면 CONN_FLUSH를 붙여 창을 닫는다. false(창 중간 임계 flush)는 표식 없이
   * 보내고 창 끝 flush를 다시 예약한다.
   */
  flush(windowEnd = true): boolean {
    this.dirty = false;
    if (!this.live) return false;
    if (this.castOpen) {
      if (windowEnd) {
        this.writer.connFlush();
        this.castOpen = false;
      } else {
        this.dirty = true;
        this.onDirty(this);
      }
    }
    const n = this.writer.bufferedBytes;
    if (n === 0) return !this.pipe.closed;
    ipcTxBytes.inc(n);
    return this.writer.flushTo(this.pipe);
  }

  /**
   * 유실·교체·위반 — 이후 기록 거절, 남은 수신 봉투 무시(디코더 정지), 파이프 즉시 닫기(이미 닫혔으면 무동작).
   * 연결 표를 비워 반환한다(호출자가 closeSessions로 일괄 종료). 이미 죽었으면 null.
   */
  kill(reason: PipeCloseReason, error?: Error): PlayerSession[] | null {
    if (!this.live) return null;
    this.live = false;
    this.decoder.destroy();
    this.pipe.destroy(reason, error);
    const sessions = [...this.conns.values()];
    this.conns.clear();
    this.refused.clear();
    return sessions;
  }

  private sendUrgent(write: (w: WorldIpcWriter) => void): void {
    if (!this.alive) return;
    write(this.urgentWriter);
    ipcTxBytes.inc(this.urgentWriter.bufferedBytes);
    this.urgentWriter.flushTo(this.urgentSink);
  }

  private wrote(): void {
    if (!this.dirty) {
      this.dirty = true;
      this.onDirty(this);
    }
    if (this.writer.bufferedBytes >= this.flushAtBytes) this.flush(false);
  }
}
