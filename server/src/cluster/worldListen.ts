// 월드 쪽 리스너 양보 배선 — 순수 계획(listenPlan.planListen)을 살아 있는 피어들에 적용한다(IPC v14). 월드 IPC 서버가 재계획 계기마다
// 부른다: LISTEN_REPORT 수신, 피어 등록·정리(유실·교체·dead·펜싱 — 잃은 피어가 열린 리스너였으면 같은 호출에서 양보 중이던 피어들이 곧바로
// listen을 받는다), BYE, 월드 쪽 피어 소프트 임계 전이(evaluateAdmission), 종료 드레인 시작(전원 listen). 지시는 마지막으로 보낸 것과 다를 때만
// 나간다(GatewayPeer.directListen — 중복 제거·seq 단조). 계획 입력은 지시를 보내기 전의 상태 하나로 고정한다(같은 호출 안에서 앞 피어에 보낸
// 지시가 뒤 피어의 판정에 섞이지 않게 — 불변식의 전제, listenPlan 상단).

import { type CounterHandle, metrics } from "../obs/metrics";
import { createLogger } from "../obs/logger";
import { createSquelch, suppressedMeta } from "../obs/logSquelch";
import type { GatewayPeer } from "./gatewayPeer";
import type { ListenMode } from "./ipcSchema";
import { type ListenPeerView, planListen } from "./listenPlan";

const log = createLogger("ipc.world");
const directed: Record<ListenMode, CounterHandle> = {
  listen: metrics.ipcListenDirectives.bind({ mode: "listen" }),
  yield: metrics.ipcListenDirectives.bind({ mode: "yield" }),
};
// 지시 로그 — 접속 제한이 깜빡여도 게이트웨이당 초당 2줄(억제분은 suppressed로). 메트릭은 항상.
const directiveSquelch = createSquelch({ ratePerSec: 2, burst: 10 });

/**
 * 재계획 진입점(월드 IPC 서버 — 위 계기마다). 던지지 않는다: 호출 지점(teardown의 세션 배치 정리 앞·HELLO·보고 수신·전이)이 예외로
 * 중단되면 유령 세션·미저장이 남는다. 송신이 던진 피어는 이 계획이 끝난 뒤 drop(그 게이트웨이를 끊는다 — 파이프 상태를 믿을 수 없다,
 * flushPeer와 같은 정책 — 끊기의 teardown이 바뀐 상태로 다시 짠다), 그 밖의 예외는 로그만(다음 계기에 다시 짠다).
 */
export function replanListen(peers: Iterable<GatewayPeer>, draining: boolean, drop: (peer: GatewayPeer, err: unknown) => void): void {
  let failed: ListenDirectiveFailure[];
  try {
    failed = directListenPlan(peers, draining);
  } catch (err) {
    log.error({ err }, "listen replan failed — directives skipped this round");
    return;
  }
  for (const { peer, err } of failed) {
    log.error({ err, gatewayId: peer.info.gatewayId }, "LISTEN directive send failed — dropping gateway");
    drop(peer, err);
  }
}

/** 지시 송신이 던진 피어 — 호출자가 그 게이트웨이를 끊는다(파이프 상태를 믿을 수 없다 — flushPeer와 같은 정책). */
export interface ListenDirectiveFailure {
  readonly peer: GatewayPeer;
  readonly err: unknown;
}

/**
 * 살아 있는 피어마다 계획을 세워 바뀐 지시만 보낸다. draining = 종료 드레인 중(전원 listen). 반환 = 송신이 던진 피어(보통 빈 배열).
 * 송신 예외는 피어별로 가두고 나머지 피어의 지시는 그대로 보낸다 — 던진 피어를 끊는 일(→ 재계획)은 이 호출이 끝난 뒤 호출자 몫이다
 * (루프 안에서 끊으면 재계획이 중첩돼, 바깥 루프가 끊기 전 상태로 세운 지시를 뒤 피어에 보낼 수 있다).
 */
export function directListenPlan(peers: Iterable<GatewayPeer>, draining: boolean): ListenDirectiveFailure[] {
  const live: GatewayPeer[] = [];
  for (const p of peers) if (p.alive) live.push(p);
  const failed: ListenDirectiveFailure[] = [];
  if (live.length === 0) return failed;
  const views = live.map((p) => p.listenView);
  const plan = planListen(views, draining);
  for (let i = 0; i < live.length; i++) {
    const mode = plan[i]!;
    let seq: number;
    try {
      seq = live[i]!.directListen(mode);
    } catch (err) {
      failed.push({ peer: live[i]!, err });
      continue;
    }
    if (seq === 0) continue;
    directed[mode].inc();
    logDirective(live[i]!, mode, seq, views[i]!, draining);
  }
  return failed;
}

function logDirective(peer: GatewayPeer, mode: ListenMode, seq: number, view: ListenPeerView, draining: boolean): void {
  const sup = directiveSquelch.allow(String(peer.info.gatewayId));
  if (sup < 0) return;
  const r = view.report;
  const meta = suppressedMeta(
    {
      gatewayId: peer.info.gatewayId,
      mode,
      seq,
      port: r?.port,
      reportedClosed: r?.closed,
      reportedListening: r?.listening,
      worldBusy: view.admissionBusy,
      draining,
      conns: peer.conns.size,
    },
    sup,
  );
  if (mode === "yield") {
    log.info(meta, "gateway admission closed — telling it to leave its shared-port group while another gateway listens (LISTEN yield)");
  } else {
    log.info(meta, "telling gateway to rejoin its shared-port group (LISTEN listen)");
  }
}
