// 게이트웨이 부하 접속 제한 배선 — 성능 4.5 F1(4.5 리뷰에서 gatewayCore에서 분리). 판정(신호·히스테리시스)은 gatewayLoad, 여기는
// 그 소스(코어 연결 표의 송신 꼬리 표본 · 코어의 IPC 왕복 추정), 전이 로그·게이지(mmorpg_gw_admission_active), accept 거절(KICK 9
// "server busy", CONN_OPEN 전 — 월드는 모르는 연결, 상한 거절과 같은 경로 · mmorpg_gw_admission_rejected_total{cause}), 종료 정리.
// 코어는 refuse(conn)·setWorldBusy·stop만 부른다.

import { kickAndClose } from "../network/clientEdge";
import { KICK_REASON } from "../identity/loginFlow";
import { type CounterHandle, metrics } from "../obs/metrics";
import { createLogger } from "../obs/logger";
import { createSquelch, suppressedMeta } from "../obs/logSquelch";
import type { GatewayConn } from "./gatewayConn";
import {
  ADMISSION_CAUSES,
  type AdmissionCause,
  type GatewayAdmissionOptions,
  GatewayLoad,
  type LoadReading,
  outboundSample,
} from "./gatewayLoad";

const log = createLogger("gateway");
// 거절 warn — 접속 폭주에도 초당 1줄(억제분은 suppressed로). 메트릭은 항상.
const busyWarnSquelch = createSquelch({ ratePerSec: 1, burst: 5 });
/** 거절 사유별 카운터 핸들. */
const rejectedBy = new Map<AdmissionCause, CounterHandle>(
  ADMISSION_CAUSES.map((cause) => [cause, metrics.gwAdmissionRejected.bind({ cause })]),
);

/** 코어가 주는 것 — 연결 표(읽기만)와 IPC 왕복 추정. */
export interface AdmissionHost {
  readonly gatewayId: number;
  /** 추적 중인 연결(코어 소유 — 송신 꼬리 표본). */
  readonly conns: ReadonlyMap<number, GatewayConn>;
  /** IPC 수신 적체 추정(ms) — 답 없는 가장 오래된 PING의 나이 ∨ 창 안 최근 왕복. */
  ipcRttMs(now: number): number;
  /** 거절 시작·해제 전이(로그·게이지 뒤) — 코어가 LISTEN_REPORT(closed)를 보낸다(IPC v14 리스너 양보). */
  onTransition?(active: boolean): void;
}

export class GatewayAdmission {
  private readonly load: GatewayLoad;
  private stopped = false;

  /** 표본 타이머를 바로 시작한다. */
  constructor(
    private readonly host: AdmissionHost,
    opts: GatewayAdmissionOptions,
  ) {
    this.load = new GatewayLoad(
      { ipcRttMs: (t) => host.ipcRttMs(t), outbound: () => outboundSample(host.conns) },
      opts,
      (active, cause, reading) => this.onChange(active, cause, reading),
    );
    this.load.start();
  }

  /** 새 연결을 거절 중인가. */
  get active(): boolean {
    return this.load.active;
  }

  /** 거절 사유(받는 중이면 null). */
  get cause(): AdmissionCause | null {
    return this.load.cause;
  }

  /** 월드의 ADMISSION 판정(월드 유실 시 false로 초기화 — 다음 월드는 open으로 시작). */
  setWorldBusy(busy: boolean): void {
    this.load.setWorldBusy(busy);
  }

  /** accept 판정 — 거절이면 KICK 9 "server busy"를 걸고 true(호출자는 CONN_OPEN을 보내지 않는다). */
  refuse(conn: GatewayConn): boolean {
    const cause = this.load.refusal();
    if (cause === null) return false;
    rejectedBy.get(cause)!.inc();
    const sup = busyWarnSquelch.allow("busy");
    if (sup >= 0) {
      log.warn(
        suppressedMeta({ gatewayId: this.host.gatewayId, localId: conn.localId, addr: conn.remoteAddress, cause }, sup),
        "client connection rejected at gateway — server busy (load admission)",
      );
    }
    kickAndClose(conn, KICK_REASON.ServerFull, "server busy");
    return true;
  }

  /** 종료 — 표본 타이머 정지, 거절 중이었으면 게이지를 되돌린다(이후 전이 통지는 무시). idempotent. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.load.stop();
    if (this.load.active) metrics.gwAdmissionActive.dec();
  }

  private onChange(active: boolean, cause: AdmissionCause | null, r: LoadReading): void {
    if (this.stopped) return;
    const meta = { gatewayId: this.host.gatewayId, cause, conns: this.host.conns.size, ...r };
    if (active) {
      metrics.gwAdmissionActive.inc();
      log.warn(meta, "gateway admission closed — refusing new clients with KICK 9 server busy");
    } else {
      metrics.gwAdmissionActive.dec();
      log.info(meta, "gateway admission reopened — admitting new clients");
    }
    this.host.onTransition?.(active);
  }
}
