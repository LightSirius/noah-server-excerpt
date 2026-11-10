// Phase 3 입력 큐.
//
// 책임:
// - connection별로 도착한 INPUT_CMD를 보관.
// - tick 경계에서 "지금 처리할 입력"만 꺼낸다 (ordered, deduped).
// - 미래 tick의 입력은 큐에 보관 (조기 도착).
// - 과거 tick / 중복 seq는 폐기.
//
// 비목표 (Phase 3):
// - 패킷 손실 보상 (보낸 클라가 재전송). 본 큐는 도착한 것만 다룬다.
// - 권위 결정. movementSystem이 검증·캡 적용.

import type { MoveGait } from "../net/codec.generated";
import { isUint32 } from "../net/validate";

/**
 * connection당 보관하는 미처리 INPUT_CMD 상한 (리뷰 #24).
 * idle은 몰아 소비되어 누적되지 않지만 비-idle은 여전히 tick당 1건(20/s)만 소비하고
 * IN_WORLD rate limit은 100/s를 허용하므로, 비-idle 스팸이 상한 없이 누적되면 Map이
 * 무한 증가(연결당 메모리 DoS)한다 — 캡은 계속 필요하다.
 * 정상 클라는 pending 1~2건 — 20Hz 기준 32는 ~1.6초 백로그로 지터에도 충분한 여유.
 */
export const MAX_PENDING_INPUTS = 32;

/**
 * tick당 총 소비 상한. idle 몰아 소비로 ack이 한 tick에 급등하면 클라 재조정 보정
 * (0.2·(소비수−1) 역방향 당김)이 한 점 슬라이드로 보인다 — 상한 4면 tick당 ≤0.6유닛으로
 * 분산되고, 백로그 B는 (도착 1/tick 기준) tick당 3씩 줄어 수 tick 내 해소된다.
 */
export const MAX_CATCHUP_PER_TICK = 4;

/**
 * push 결과. "stale"(늦은 재전송)·"detached"는 정상 흐름이라 호출자가 조용히 무시하고,
 * "overflow"만 메트릭·로그 대상(리뷰 #24). "invalid"는 u32 범위 위반(핸들러 1차 방어 후 최종 가드).
 */
export type PushResult = "accepted" | "stale" | "overflow" | "invalid" | "detached";

export interface InputCmd {
  /** 클라이언트 단조증가 시퀀스. 같은 connection에서 중복 시 최신만 유지. */
  readonly seq: number;
  /** 클라가 의도한 서버 tick (예측). */
  readonly tick: number;
  readonly dx: number;
  readonly dy: number;
  /** 비트마스크 (0=none, 1=attack, 2=use, ...). */
  readonly action: number;
  /** 이 입력을 쓸 때의 이동 빠르기(와이어는 항상 싣는다, 없으면 달리기 — 시험·벤치용). 소비하는 tick에 존이 적용한다. */
  readonly gait?: MoveGait;
}

/** drainInto 방문 콜백 — (connId, 이번 tick에 소비한 마지막 cmd). */
export type DrainVisitor = (connId: number, cmd: InputCmd) => void;

/** 다건 대기 연결의 seq 정렬 scratch(동기 구간 안에서만 쓰므로 큐 인스턴스 간 공유 안전). */
const seqScratch: number[] = [];
const ascending = (a: number, b: number): number => a - b;

interface ConnectionState {
  /** seq → cmd. 중복 도착 시 마지막 것이 이긴다 (네트워크 순서 무시). */
  readonly bySeq: Map<number, InputCmd>;
  /** 마지막으로 acked(=처리 완료)된 seq. 초기 0. */
  lastAckedSeq: number;
}

export class InputQueue {
  private readonly perConn = new Map<number, ConnectionState>();

  /** 새 connection 등록. 이미 있으면 무시. */
  attach(connId: number): void {
    if (!this.perConn.has(connId)) {
      this.perConn.set(connId, { bySeq: new Map(), lastAckedSeq: 0 });
    }
  }

  detach(connId: number): void {
    this.perConn.delete(connId);
  }

  /**
   * 도착한 INPUT_CMD를 큐잉.
   * - seq <= lastAckedSeq: 늦은 재전송 → "stale"(정상, 조용히 폐기).
   * - 같은 seq 재도착: 최신으로 덮어쓰기 → "accepted"(동일하면 무해).
   * - 큐가 MAX_PENDING_INPUTS 이상이면서 새 seq: 상한 초과 → "overflow"(리뷰 #24).
   *
   * 로그·메트릭은 호출자(handler)가 결정론 규칙(sim 내 부작용 금지)을 지키며 처리.
   */
  push(connId: number, cmd: InputCmd): PushResult {
    const conn = this.perConn.get(connId);
    if (!conn) return "detached"; // detach 직후 도착한 패킷 — 무시.
    // 심층방어: u32 밖 seq는 lastAckedSeq를 오염시켜 ack 인코딩(u32)을 깨뜨린다.
    // 1차 방어는 핸들러 경계(net/validate) — 여기는 다른 진입점 대비 최종 가드.
    if (!isUint32(cmd.seq)) return "invalid";
    if (cmd.seq <= conn.lastAckedSeq) return "stale";
    // 상한 초과 시 새 seq는 폐기. 기존 seq 덮어쓰기는 Map을 키우지 않으므로 허용.
    if (conn.bySeq.size >= MAX_PENDING_INPUTS && !conn.bySeq.has(cmd.seq)) return "overflow";
    conn.bySeq.set(cmd.seq, cmd);
    return "accepted";
  }

  /**
   * 이 tick 시작 시점에 처리할 입력을 connection별로 꺼낸다.
   *
   * 정책 (이동동기화 ②):
   * - seq 오름차순 소비. idle(dx=dy=0, action=0)은 연속으로 몰아 소비(catch-up) —
   *   프레임 히치 후 캐치업 버스트로 쌓인 백로그가 영구 유지되면 ack이 클라 최신 seq에
   *   뒤처지고(B tick), 우클릭 방향 전환 시 재조정이 0.2·B만큼 점프하는 원천이 된다.
   * - 비-idle(키보드/액션)을 만나면 그것까지 소비 후 중단 — "비-idle은 tick당 1건" 유지
   *   (키보드 1건 = velocity 1 tick 의미 보존, 몰아 소비해도 속도 이득 없음).
   * - tick당 총 소비는 MAX_CATCHUP_PER_TICK으로 상한 — ack이 한 tick에 급등하면
   *   클라 재조정 보정(0.2·B 역방향 당김)이 한 점에 몰린다. 상한 4면 tick당 보정 ≤0.6.
   * - path 이동은 movementSystem이 입력 소비와 무관하게 tick당 1스텝 진행하므로,
   *   idle 몰아 소비는 위치에 영향 없이 ack만 최신화한다 → tick 경계 결정론 유지.
   *
   * 반환: connId → 마지막으로 소비한 cmd(이번 tick의 의도). 없는 connection은 누락.
   * (테스트·도구용 Map 반환 래퍼 — 존 tick은 할당 없는 drainInto를 쓴다.)
   */
  drain(_currentTick: number): Map<number, InputCmd> {
    const out = new Map<number, InputCmd>();
    this.drainInto((connId, cmd) => out.set(connId, cmd));
    return out;
  }

  /**
   * drain과 같은 정책으로 소비하되 결과를 Map에 담지 않고 연결 등록 순서대로 visit(connId, cmd)를 부른다
   * (성능 3단계 슬라이스 4 — tick당 Map·배열 할당 제거). visit은 이 큐를 건드리지 않아야 한다.
   */
  drainInto(visit: DrainVisitor): void {
    for (const [connId, conn] of this.perConn) {
      if (conn.bySeq.size === 0) continue;
      const picked = conn.bySeq.size === 1 ? takeOnly(conn) : takeCatchUp(conn);
      if (picked) visit(connId, picked);
    }
  }

  /** 디버그·테스트용. */
  pendingCount(connId: number): number {
    return this.perConn.get(connId)?.bySeq.size ?? 0;
  }

  lastAckedSeq(connId: number): number {
    return this.perConn.get(connId)?.lastAckedSeq ?? 0;
  }

  /**
   * 지금까지 받은(처리했거나 대기 중인) INPUT_CMD 최대 seq — 생활 채널 시작 시점의 startSeq. 그 뒤 도착한 non-idle만 채널을 끊고,
   * 시작 전에 이미 큐에 든 백로그는 끊지 않는다. 대기는 연결당 MAX_PENDING_INPUTS 이하라 순회 비용이 작다.
   */
  highestSeq(connId: number): number {
    const conn = this.perConn.get(connId);
    if (!conn) return 0;
    let max = conn.lastAckedSeq;
    for (const seq of conn.bySeq.keys()) if (seq > max) max = seq;
    return max;
  }
}

/** 평시(pending 1건) 패스트패스 — 정렬·배열 없음. */
function takeOnly(conn: ConnectionState): InputCmd | undefined {
  for (const [seq, cmd] of conn.bySeq) {
    conn.bySeq.delete(seq);
    conn.lastAckedSeq = cmd.seq;
    return cmd;
  }
  return undefined;
}

/** 다건 대기 — seq 오름차순으로 idle 몰아 소비(상한 MAX_CATCHUP_PER_TICK), 비-idle을 만나면 그것까지. */
function takeCatchUp(conn: ConnectionState): InputCmd | undefined {
  const seqs = seqScratch;
  seqs.length = 0;
  for (const seq of conn.bySeq.keys()) seqs.push(seq);
  seqs.sort(ascending);
  let picked: InputCmd | undefined;
  let consumed = 0;
  for (let i = 0; i < seqs.length; i++) {
    const seq = seqs[i]!;
    const cmd = conn.bySeq.get(seq)!;
    conn.bySeq.delete(seq);
    conn.lastAckedSeq = cmd.seq;
    picked = cmd;
    consumed++;
    // 불변식: 몰아 소비로 버려지는 중간 항목은 dx·dy·action이 0(idle)이라 무손실이다. gait는 이벤트가 아니라 입력마다 실리는 상태라
    // 마지막 입력(picked)의 값이 곧 최신 전환이다.
    // idle 정의를 넓히거나 action/tick에 게임 효과를 부여하면 이 반환 계약 재감사 필요.
    const isIdle = cmd.dx === 0 && cmd.dy === 0 && cmd.action === 0;
    if (!isIdle || consumed >= MAX_CATCHUP_PER_TICK) break;
  }
  return picked;
}
