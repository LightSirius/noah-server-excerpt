// tick 밖 송신 코얼레싱(성능 3단계 슬라이스 6).
//
// 수신 디스패치 구간(Bun data 콜백 본체 = clientEdge.ingestEdgeChunk)의 송신은 즉시 write하지 않는다. 세션이 스스로를
// 지연 코킹하고(session.ts) 이 큐에 1회 등록하면, 이벤트 루프 턴 끝의 setImmediate 1회가 대기 세션 전부를 세션당
// write 1회로 flush한다. Bun은 한 poll 반복에서 준비된 소켓의 data 콜백을 연달아 돌리고 그 뒤에 immediate를 돌리므로
// (1.3.13·1.4.3 실측: 50소켓 버스트 → data 50회 뒤 immediate 1회, 왕복 지연 차이 없음), MOVE_TO 버스트의 MOVE_PATH(종전에는 viewer 팬아웃)가
// 세션마다 write 1회로 합쳐진다. 종전: 송신 1건 = write 1회(500 CCU realistic에서 초당 약 3.5만 write).
//
// 불변식:
//   - 세션 바이트 순서 = 송신 호출 순서. 지연 코킹된 세션에는 구간 밖 송신(async 핸들러 연속·GM·타이머)도 outbox 뒤에
//     붙는다(corked 판정). write 경계만 달라지고 바이트는 같다(tests/regression/wireCharacterization).
//   - tick(withCork)은 같은 outbox를 이어 쓴다 — cork는 멱등이고 프레임을 버리지 않는다. Bun은 due 타이머와 immediate의
//     순서를 보장하지 않으므로(실측) tick이 먼저 돌면 tick uncork가 지연 프레임까지 함께 보내고, 늦게 온 턴 끝 flush는
//     코킹 해제된 세션에서 no-op이다.
//   - 링크 종료(socket.end)는 outbox를 먼저 비운다(OutboundLink 종료 전 훅) — 킥의 KICK·선행 프레임 유실 없음.
//   - flush 1건의 실패는 그 세션만 닫는다(PlayerSession.flushOrClose — withCork uncork와 같은 규칙).
//
// 턴 끝 훅(성능 4단계 4.2b): 같은 setImmediate가 대기 세션을 전부 보낸 "뒤" 등록된 훅을 부른다 — 월드는 여기서 게이트웨이
// 피어별 IPC 배치를 flush한다(세션 링크 RemoteClientLink가 이번 턴에 쌓은 CONN_DELIVER가 같은 턴의 봉투 1개에 실린다).
// 대기 세션 없이 훅만 필요할 때(구간 밖 원격 송신·IPC 제어 메시지)는 requestTurnEndFlush가 같은 예약을 쓴다. monolith는
// 훅이 없다 — 종전 동작·바이트 그대로.

import { createLogger } from "../obs/logger";

const log = createLogger("net.cork");

/** 턴 끝 flush 대상 — PlayerSession. */
export interface DeferredFlushTarget {
  /** 큐에서 꺼낼 때 1회 호출 — outbox를 링크로 보내고(실패 시 세션 종료) 다음 등록을 받을 수 있게 한다. */
  flushDeferred(): void;
}

let depth = 0;
let queue: DeferredFlushTarget[] = [];
let scheduled = false;
/** 턴 끝 flush가 대기 세션을 보내는 중 — 이 사이의 훅 요청은 곧 돌 훅이 처리한다(새 예약 불요). */
let flushingSessions = false;
const turnEndHooks: Array<() => void> = [];

/** 수신 디스패치 구간 안인가 — 세션 송신이 지연 코킹 여부를 정한다. */
export function isDeferringSends(): boolean {
  return depth > 0;
}

/** fn 동안의 세션 송신을 턴 끝으로 미룬다. 중첩 가능, fn이 던져도 구간은 닫힌다. */
export function deferSends<T>(fn: () => T): T {
  depth++;
  try {
    return fn();
  } finally {
    depth--;
  }
}

/** 세션 1개를 턴 끝 flush에 등록 — 호출자(세션)가 중복 등록을 막는다. 첫 등록이 setImmediate 1회를 예약한다. */
export function queueDeferredFlush(target: DeferredFlushTarget): void {
  queue.push(target);
  schedule();
}

/**
 * 턴 끝 flush 1회 예약(이미 예약됐거나 세션 flush 중이면 무동작) — 대기 세션 없이 턴 끝 훅만 돌려야 할 때(4단계 4.2b:
 * 구간 밖 원격 송신·IPC 제어 메시지의 게이트웨이 피어 flush).
 */
export function requestTurnEndFlush(): void {
  if (flushingSessions) return;
  schedule();
}

/**
 * 턴 끝 훅 등록 — 대기 세션 flush 뒤 등록 순서대로 호출. 던지면 기록하고 다음 훅으로(격리). 반환 = 해제 함수.
 * 운영 사용처는 월드 IPC 서버(cluster/worldIpcServer.ts — 게이트웨이 피어 flush) 하나뿐이다.
 */
export function addTurnEndHook(fn: () => void): () => void {
  turnEndHooks.push(fn);
  return () => {
    const i = turnEndHooks.indexOf(fn);
    if (i >= 0) turnEndHooks.splice(i, 1);
  };
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  setImmediate(flushDeferredSends);
}

/**
 * 대기 세션 전부 flush 후 턴 끝 훅(턴 끝 예약 본체 — 테스트·종료 경로는 직접 호출 가능). 세션 flush 중 새 세션 등록은
 * 다음 턴으로.
 */
export function flushDeferredSends(): void {
  scheduled = false;
  const batch = queue;
  if (batch.length > 0) {
    queue = [];
    flushingSessions = true;
    try {
      flushBatch(batch);
    } finally {
      flushingSessions = false;
    }
  }
  if (turnEndHooks.length > 0) runTurnEndHooks();
}

function flushBatch(batch: readonly DeferredFlushTarget[]): void {
  for (let i = 0; i < batch.length; i++) {
    // flushDeferred는 던지지 않는다(실패 세션은 스스로 닫는다) — 그래도 한 건이 나머지 세션을 굶기지 않게 격리.
    try {
      batch[i]!.flushDeferred();
    } catch (err) {
      log.error({ err }, "deferred flush failed");
    }
  }
}

function runTurnEndHooks(): void {
  // 사본 순회 — 훅 안의 등록·해제가 이번 순회를 건너뛰게 하지 않는다.
  for (const hook of turnEndHooks.slice()) {
    try {
      hook();
    } catch (err) {
      log.error({ err }, "turn-end hook failed");
    }
  }
}

/** 턴 끝 flush를 기다리는 세션 수 — 관측·테스트용. */
export function pendingDeferredFlushes(): number {
  return queue.length;
}
