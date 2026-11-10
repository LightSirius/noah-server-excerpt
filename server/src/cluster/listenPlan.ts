// 공유 포트 리스너 양보 계획(순수) — 자동 재접속 선결(2026-10-15, IPC v14). 커널의 reusePort 해시는 부하를 모른다: 접속 제한이 닫힌
// 게이트웨이도 새 연결의 1/N을 계속 받아 KICK 9 "server busy"로 돌려보낸다(7B 폭주 측정 — gw1 SIGKILL 뒤 gw2가 CPU로 닫힌 채 재시도의
// ≈50%를 거절하는 동안 gw1은 한가). 월드가 피어별 LISTEN_REPORT를 모아, 닫힌 피어가 같은 포트 그룹에 다른 "열린 리스너"가 있을 때만
// 리스너를 잠시 내리도록(LISTEN yield) 지시한다 — 새 연결은 받을 수 있는 게이트웨이로만 간다. 송신·배선은 worldListen.ts.
//
// 실효 닫힘 = 보고의 closed(게이트웨이가 새 클라를 거절 중 — 로컬 접속 제한(월드 ADMISSION busy 포함) ∨ 연결 상한) ∨ 월드 쪽 피어 소프트
//   임계 busy(보고 전에도 즉시).
// 열린 리스너 = 보고 있음 ∧ 실효 닫힘 아님 ∧ 리스닝 중 ∧ ackSeq = 마지막으로 보낸 seq ∧ 마지막 지시가 listen ∧ BYE로 떠나는 중 아님.
//   ack·마지막 지시 조건이 경합을 닫는다: 월드가 A에 yield를 보낸 직후 A의 접속 제한이 풀려 A가 (그 yield를 적용하기 전에) "열림·리스닝"을
//   보고해도 옛 ack라 열린 리스너로 세지 않는다 — 세면 B까지 yield하고 곧 A도 멈춰 리스너가 0이 된다.
// 그룹 = (shared ∧ port). 양보 = shared ∧ 실효 닫힘 ∧ 같은 그룹에 자기 말고 열린 리스너가 있다(닫힌 피어는 열린 리스너가 아니므로 "자기
//   말고" = 그룹의 열린 리스너 수 > 0). 그 밖은 전부 listen — 보고 없음·공유 아님·열림·다른 열린 리스너 없음(전원 바쁨 = 종전 KICK 9
//   경로)·떠나는 중·종료 드레인 중.
// 불변식: 월드는 같은 그룹의 다른 피어가 열린 리스너일 때만 yield를 지시하고(열린 리스너 자신은 닫혀 있지 않아 같은 계획에서 yield를
//   받지 않는다), 게이트웨이는 현재 월드의 yield 지시 말고는 스스로 리스너를 내리지 않는다(SHUTDOWN·월드 유실·자기 종료는 별개 — 자기
//   종료는 리스너를 내린 뒤 보고한다). 그래서 리스너 0은 열린 리스너의 프로세스가 사라졌을 때 월드가 그 피어 유실을 알아챌 때까지(kill =
//   소켓 종료 즉시, 정지 = IPC_DEAD_MS)와 양보 해제 지시가 닿아 재개될 때까지만 생긴다(architecture.md §3.4, ADR 0002 §5.1).

import type { ListenMode } from "./ipcSchema";

/** 게이트웨이가 보고한 리슨 상태(LISTEN_REPORT). */
export interface ListenReport {
  /** reusePort 공유 포트 + 양보 기능 켬 — 그룹 참여 자격. */
  readonly shared: boolean;
  /** 새 클라를 거절 중 — 로컬 부하 접속 제한(월드 ADMISSION busy 포함) ∨ 연결 상한 닿음. */
  readonly closed: boolean;
  /** 클라 리스너가 지금 열려 있다. */
  readonly listening: boolean;
  /** 클라 리슨 포트 — 같은 포트를 공유하는 피어끼리 그룹. */
  readonly port: number;
  /** 마지막으로 적용한 LISTEN seq(0 = 이 월드 세션에서 없음). */
  readonly ackSeq: number;
}

/** 계획기가 보는 피어 1개(월드 쪽 기록). */
export interface ListenPeerView {
  /** 마지막 LISTEN_REPORT(없으면 null — 양보하지 않고 열린 리스너로도 세지 않는다). */
  readonly report: ListenReport | null;
  /** 월드 쪽 피어 IPC 소프트 임계 busy. */
  readonly admissionBusy: boolean;
  /** BYE를 보냈다 — 곧 떠난다. */
  readonly leaving: boolean;
  /** 마지막으로 보낸 지시(처음은 listen, seq 0 — 암묵). */
  readonly lastSentMode: ListenMode;
  readonly lastSentSeq: number;
}

/** 실효 닫힘 — 보고의 closed ∨ 월드 소프트 임계 busy. */
export function effectivelyClosed(p: ListenPeerView): boolean {
  return p.report?.closed === true || p.admissionBusy;
}

/** 열린 리스너(파일 상단 정의 — ack·마지막 지시 조건 포함). */
export function isOpenListener(p: ListenPeerView): boolean {
  const r = p.report;
  if (r === null || p.leaving || effectivelyClosed(p) || !r.listening) return false;
  return r.ackSeq === p.lastSentSeq && p.lastSentMode === "listen";
}

/**
 * 그룹 키 — shared 피어의 포트, 아니면 null(그룹 밖). 같은 호스트 전제: reusePort 그룹은 커널마다 하나이고 월드 IPC가 로컬이라 지금은
 * 포트만으로 같은 그룹이다. 멀티 호스트를 들이면 키에 호스트를 넣어야 한다(다른 호스트의 열린 리스너를 믿고 yield하면 그 호스트는 리스너 0).
 */
function groupOf(p: ListenPeerView): number | null {
  return p.report?.shared === true ? p.report.port : null;
}

/** 피어마다 원하는 지시(입력 순서). draining = 종료 드레인 중(전원 listen). */
export function planListen(peers: readonly ListenPeerView[], draining = false): ListenMode[] {
  if (draining) return peers.map(() => "listen");
  const openByGroup = new Map<number, number>();
  for (const p of peers) {
    const g = groupOf(p);
    if (g !== null && isOpenListener(p)) openByGroup.set(g, (openByGroup.get(g) ?? 0) + 1);
  }
  return peers.map((p) => {
    const g = groupOf(p);
    if (g === null || p.leaving || !effectivelyClosed(p)) return "listen";
    return (openByGroup.get(g) ?? 0) > 0 ? "yield" : "listen";
  });
}
