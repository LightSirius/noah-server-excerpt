// 공유 포트 리스너 양보 — 월드의 순수 계획기(cluster/listenPlan.ts, IPC v14 LISTEN_REPORT·LISTEN).
//
//   - 열린 리스너 = 보고 있음 ∧ 실효 닫힘(보고 closed ∨ 월드 소프트 임계 busy) 아님 ∧ 리스닝 중 ∧ ackSeq = 마지막 보낸 seq ∧ 마지막 지시 listen
//     ∧ BYE로 떠나는 중 아님. ack·마지막 지시 조건이 "yield를 보낸 직후 적용 전 보고"의 경합을 닫는다.
//   - 그룹 = (shared ∧ port). 양보 = shared ∧ 실효 닫힘 ∧ 같은 그룹에 자기 말고 열린 리스너가 있다. 나머지는 전부 listen.
//   - 불변식: 열린 리스너가 없는 그룹의 멤버는 아무도 yield를 받지 않는다(무작위 성질 검사) + 지시를 지연 전달하는 모델에서 리스너 0이 생기지 않는다.

import { describe, expect, test } from "bun:test";
import {
  type ListenPeerView,
  type ListenReport,
  isOpenListener,
  planListen,
} from "../../../server/src/cluster/listenPlan";
import type { ListenMode } from "../../../server/src/cluster/ipcSchema";

const PORT = 19000;

function report(over: Partial<ListenReport> = {}): ListenReport {
  return { shared: true, closed: false, listening: true, port: PORT, ackSeq: 0, ...over };
}

function peer(r: ListenReport | null, over: Partial<Omit<ListenPeerView, "report">> = {}): ListenPeerView {
  return { report: r, admissionBusy: false, leaving: false, lastSentMode: "listen", lastSentSeq: 0, ...over };
}

const open = (over: Partial<ListenReport> = {}): ListenPeerView => peer(report(over));
const closed = (over: Partial<ListenReport> = {}): ListenPeerView => peer(report({ closed: true, ...over }));

describe("planListen — 양보 조건", () => {
  test("게이트웨이 1개는 닫혀도 양보하지 않는다(다른 열린 리스너 없음)", () => {
    expect(planListen([closed()])).toEqual(["listen"]);
  });

  test("같은 공유 포트 2개 — 한쪽이 닫히고 다른 쪽이 열린 리스너면 닫힌 쪽만 yield", () => {
    expect(planListen([open(), closed()])).toEqual(["listen", "yield"]);
    expect(planListen([closed(), open()])).toEqual(["yield", "listen"]);
  });

  test("둘 다 닫히면 둘 다 listen(전원 바쁨 = KICK 9 경로 그대로 — 리스너 0 금지)", () => {
    expect(planListen([closed(), closed()])).toEqual(["listen", "listen"]);
  });

  test("열린 피어라도 마지막 지시를 아직 적용하지 않았으면(ackSeq 옛 값) 열린 리스너가 아니다 — 경합", () => {
    const staleAck = peer(report({ ackSeq: 2 }), { lastSentSeq: 3 });
    expect(isOpenListener(staleAck)).toBe(false);
    expect(planListen([staleAck, closed()])).toEqual(["listen", "listen"]);
  });

  test("마지막으로 보낸 지시가 yield면(ack가 맞아도) 열린 리스너가 아니다 — 그 피어가 아직 내려가 있거나 곧 내려간다", () => {
    const yielded = peer(report({ ackSeq: 4 }), { lastSentMode: "yield", lastSentSeq: 4 });
    expect(isOpenListener(yielded)).toBe(false);
    expect(planListen([yielded, closed()])).toEqual(["listen", "listen"]);
  });

  test("리스닝 중이 아닌 열린 피어(재개 실패·첫 리슨 전)는 열린 리스너가 아니다", () => {
    expect(isOpenListener(open({ listening: false }))).toBe(false);
    expect(planListen([open({ listening: false }), closed()])).toEqual(["listen", "listen"]);
  });

  test("월드 소프트 임계 busy는 닫힘으로 센다 — 보고가 열림이어도 양보 대상, 열린 리스너로는 세지 않는다", () => {
    const worldBusy = peer(report(), { admissionBusy: true });
    expect(isOpenListener(worldBusy)).toBe(false);
    expect(planListen([open(), worldBusy])).toEqual(["listen", "yield"]);
    expect(planListen([worldBusy, closed()])).toEqual(["listen", "listen"]);
  });

  test("다른 포트·공유 아닌 피어는 그룹을 이루지 않는다", () => {
    expect(planListen([open({ port: PORT + 1 }), closed()])).toEqual(["listen", "listen"]);
    expect(planListen([open({ shared: false }), closed()])).toEqual(["listen", "listen"]);
    expect(planListen([open(), closed({ shared: false })])).toEqual(["listen", "listen"]);
  });

  test("보고 없는 피어는 양보하지 않고 열린 리스너로도 세지 않는다", () => {
    const silent = peer(null);
    expect(isOpenListener(silent)).toBe(false);
    expect(planListen([silent, closed()])).toEqual(["listen", "listen"]);
    expect(planListen([open(), peer(null, { admissionBusy: true })])).toEqual(["listen", "listen"]);
  });

  test("BYE로 떠나는 피어는 열린 리스너가 아니고 양보도 받지 않는다", () => {
    const leaving = peer(report(), { leaving: true });
    expect(isOpenListener(leaving)).toBe(false);
    expect(planListen([leaving, closed()])).toEqual(["listen", "listen"]);
    expect(planListen([open(), peer(report({ closed: true }), { leaving: true })])).toEqual(["listen", "listen"]);
  });

  test("종료 드레인 중이면 전원 listen", () => {
    expect(planListen([open(), closed()], true)).toEqual(["listen", "listen"]);
  });

  test("그룹이 여럿이면 그룹마다 따로 — 열린 리스너가 있는 그룹의 닫힌 피어만 yield", () => {
    const plan = planListen([open(), closed(), closed({ port: PORT + 1 }), closed({ port: PORT + 1 }), open({ port: PORT + 2 })]);
    expect(plan).toEqual(["listen", "yield", "listen", "listen", "listen"]);
  });

  test("열린 리스너가 여럿이면 닫힌 피어 전부 yield, 열린 리스너는 그대로", () => {
    expect(planListen([open(), open(), closed(), closed()])).toEqual(["listen", "listen", "yield", "yield"]);
  });
});

/** 결정론 난수(LCG) — 시험 재현용. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

function randomView(r: () => number): ListenPeerView {
  const hasReport = r() < 0.85;
  const seq = Math.floor(r() * 4);
  return {
    report: hasReport
      ? {
          shared: r() < 0.8,
          closed: r() < 0.5,
          listening: r() < 0.8,
          port: PORT + Math.floor(r() * 2),
          ackSeq: r() < 0.7 ? seq : Math.floor(r() * 4),
        }
      : null,
    admissionBusy: r() < 0.2,
    leaving: r() < 0.1,
    lastSentMode: r() < 0.6 ? "listen" : "yield",
    lastSentSeq: seq,
  };
}

describe("planListen — 성질", () => {
  test("열린 리스너가 없는 그룹의 멤버는 아무도 yield를 받지 않는다 · 열린 리스너는 yield를 받지 않는다(무작위 20,000 경우)", () => {
    const r = rng(0xc0ffee);
    for (let run = 0; run < 20_000; run++) {
      const peers = Array.from({ length: 1 + Math.floor(r() * 5) }, () => randomView(r));
      const plan = planListen(peers);
      peers.forEach((p, i) => {
        if (plan[i] !== "yield") return;
        expect(isOpenListener(p)).toBe(false);
        const groupHasOpen = peers.some(
          (q, j) => j !== i && q.report?.shared === true && q.report.port === p.report!.port && isOpenListener(q),
        );
        expect(groupHasOpen).toBe(true);
      });
    }
  });
});

// ── 지연 전달 모델: 월드 계획기(실물) + 게이트웨이 적용 규칙(gatewayListen·gatewayCore의 축약) — 메시지가 임의 순서·지연으로 도착해도
//    같은 공유 포트의 게이트웨이 중 최소 1개는 늘 리스닝한다(프로세스 사망 없음). 게이트웨이 규칙은 출하 규칙(yield 자기 확인 — 지금 새 클라를
//    거절 중일 때만 내린다)과 설계의 최소 규칙(자기 확인 없음) 둘 다 돌리고, 월드 쪽 소프트 임계 busy 전이(ADMISSION — LISTEN과 같은 긴급
//    FIFO로 먼저 가고, 게이트웨이는 그것을 closed에 반영해 보고한다)를 섞는다. ack 조건을 빼면 이 모델이 리스너 0을 찾는다(아래 대조).

type ModelMsg = { kind: "listen"; mode: ListenMode; seq: number } | { kind: "admission"; busy: boolean };

interface ModelGw {
  /** 로컬 신호(CPU·지연·IPC 왕복·송신 꼬리·연결 상한)로 거절 중. */
  localClosed: boolean;
  /** 마지막으로 받은 ADMISSION(월드 소프트 임계). */
  worldBusy: boolean;
  listening: boolean;
  ackSeq: number;
  /** W→G 긴급 메시지(전달 대기 — FIFO). */
  readonly inbox: ModelMsg[];
}

interface ModelPeer {
  report: ListenReport | null;
  /** 월드 쪽 피어 소프트 임계 busy. */
  admissionBusy: boolean;
  lastSentMode: ListenMode;
  lastSentSeq: number;
  /** G→W LISTEN_REPORT(전달 대기 — FIFO). */
  readonly inbox: ListenReport[];
}

interface ModelRules {
  /** 계획기의 ack·마지막 지시 조건(false = 대조 — 보고의 listening만 믿는다). */
  readonly requireAck: boolean;
  /** 게이트웨이 yield 자기 확인(출하 규칙). */
  readonly selfCheck: boolean;
  /** 월드 쪽 소프트 임계 busy 전이를 섞는다. */
  readonly worldBusy: boolean;
}

const gwClosed = (g: ModelGw): boolean => g.localClosed || g.worldBusy;

function gwReport(g: ModelGw): ListenReport {
  return { shared: true, closed: gwClosed(g), listening: g.listening, port: PORT, ackSeq: g.ackSeq };
}

function replan(peers: ModelPeer[], gws: ModelGw[], rules: ModelRules): void {
  const views = peers.map((p) => ({
    report: p.report === null || rules.requireAck ? p.report : { ...p.report, ackSeq: p.lastSentSeq },
    admissionBusy: p.admissionBusy,
    leaving: false,
    lastSentMode: rules.requireAck ? p.lastSentMode : ("listen" as ListenMode),
    lastSentSeq: p.lastSentSeq,
  }));
  planListen(views).forEach((mode, i) => {
    const p = peers[i]!;
    if (mode === p.lastSentMode) return;
    p.lastSentMode = mode;
    p.lastSentSeq++;
    gws[i]!.inbox.push({ kind: "listen", mode, seq: p.lastSentSeq });
  });
}

/** 게이트웨이가 긴급 메시지 1개를 처리한다 — 반환 = 보고하나(ADMISSION은 closed가 바뀔 때만 = 접속 제한 전이, LISTEN은 늘 — ack). */
function applyMsg(g: ModelGw, m: ModelMsg, rules: ModelRules): boolean {
  if (m.kind === "admission") {
    const before = gwClosed(g);
    g.worldBusy = m.busy;
    return gwClosed(g) !== before;
  }
  g.ackSeq = m.seq;
  if (m.mode === "listen") g.listening = true;
  else if (!rules.selfCheck || gwClosed(g)) g.listening = false;
  return true;
}

/** 한 단계 — 반환 = 리스닝 중인 게이트웨이 수. */
function step(r: () => number, gws: ModelGw[], peers: ModelPeer[], rules: ModelRules): number {
  const i = Math.floor(r() * gws.length);
  const g = gws[i]!;
  const p = peers[i]!;
  const k = r();
  if (k < 0.25) {
    const before = gwClosed(g);
    g.localClosed = !g.localClosed; // 로컬 신호 전이 → (closed가 바뀌면) 보고
    if (gwClosed(g) !== before) p.inbox.push(gwReport(g));
  } else if (k < 0.32 && rules.worldBusy) {
    p.admissionBusy = !p.admissionBusy; // 월드 소프트 임계 전이 → ADMISSION 긴급 송신 → 재계획(LISTEN은 그 뒤 FIFO)
    g.inbox.push({ kind: "admission", busy: p.admissionBusy });
    replan(peers, gws, rules);
  } else if (k < 0.65 && p.inbox.length > 0) {
    p.report = p.inbox.shift()!; // 월드가 보고 수신 → 재계획
    replan(peers, gws, rules);
  } else if (g.inbox.length > 0) {
    if (applyMsg(g, g.inbox.shift()!, rules)) p.inbox.push(gwReport(g));
  }
  return gws.filter((x) => x.listening).length;
}

function runModel(seed: number, rules: ModelRules): number {
  const r = rng(seed);
  let minListening = Infinity;
  for (let run = 0; run < 400; run++) {
    const n = 2 + Math.floor(r() * 3);
    const gws: ModelGw[] = Array.from({ length: n }, () => ({
      localClosed: false,
      worldBusy: false,
      listening: true,
      ackSeq: 0,
      inbox: [],
    }));
    const peers: ModelPeer[] = gws.map((g) => ({
      report: null,
      admissionBusy: false,
      lastSentMode: "listen",
      lastSentSeq: 0,
      inbox: [gwReport(g)],
    }));
    for (let s = 0; s < 300; s++) minListening = Math.min(minListening, step(r, gws, peers, rules));
  }
  return minListening;
}

const SEEDS = [1, 2, 3];

describe("지연 전달 모델", () => {
  test("출하 규칙(ack 조건 + yield 자기 확인 + 월드 쪽 busy 전이)에서 리스너가 0이 되지 않는다(400 런 × 300 단계 × 시드 3개)", () => {
    for (const seed of SEEDS) expect(runModel(seed, { requireAck: true, selfCheck: true, worldBusy: true })).toBeGreaterThanOrEqual(1);
  });

  test("설계의 최소 규칙(자기 확인 없음)에서도 — 월드 쪽 busy 전이 유무 모두", () => {
    for (const worldBusy of [false, true]) {
      for (const seed of SEEDS) expect(runModel(seed, { requireAck: true, selfCheck: false, worldBusy })).toBeGreaterThanOrEqual(1);
    }
  });

  test("대조 — ack 조건을 빼면(보고의 listening만 믿으면) 같은 모델이 리스너 0을 찾는다(자기 확인이 있어도)", () => {
    for (const selfCheck of [false, true]) {
      const min = Math.min(...SEEDS.map((seed) => runModel(seed, { requireAck: false, selfCheck, worldBusy: true })));
      expect(min).toBe(0);
    }
  });
});
