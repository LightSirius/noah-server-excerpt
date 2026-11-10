// 이동동기화 ② — InputQueue.drain idle 몰아 소비(catch-up) 계약.
//
// 배경: 종전 drain(구 drainOne)은 tick당 1건만 소비 — 클라 프레임 히치 후 FixedUpdate
// 캐치업 버스트로 쌓인 백로그가 영구 유지되어(ack 지연 B), 우클릭 방향 전환 시 재조정이
// 0.2·B만큼 새 방향으로 점프하는 원천이 됐다(tests/server/moveSyncReconcile.test.ts).
//
// 계약:
//   - seq 오름차순 소비. idle(dx=dy=0, action=0)은 연속으로 몰아 소비.
//   - 비-idle(키보드/액션)을 만나면 그것까지 소비하고 중단 — "비-idle은 tick당 1건" 유지
//     (키보드 입력 1건 = velocity 1 tick 의미 보존, 속도 핵 없음).
//   - tick당 총 소비 ≤ MAX_CATCHUP_PER_TICK — ack 급등 시 클라 재조정 보정이 한 점에
//     몰리지 않게 분산(리뷰 반영).
//   - 반환 cmd는 마지막으로 소비한 입력(이번 tick의 의도), lastAckedSeq도 그 seq.

import { describe, expect, test } from "bun:test";
import {
  InputQueue,
  MAX_CATCHUP_PER_TICK,
  MAX_PENDING_INPUTS,
  type InputCmd,
} from "../../../server/src/sim/inputQueue";

const idle = (seq: number): InputCmd => ({ seq, tick: 0, dx: 0, dy: 0, action: 0 });
const key = (seq: number, dx = 1, dy = 0): InputCmd => ({ seq, tick: 0, dx, dy, action: 0 });
const act = (seq: number): InputCmd => ({ seq, tick: 0, dx: 0, dy: 0, action: 1 });

function queueWith(cmds: InputCmd[]): InputQueue {
  const q = new InputQueue();
  q.attach(1);
  for (const c of cmds) expect(q.push(1, c)).toBe("accepted");
  return q;
}

describe("InputQueue.drain — idle 몰아 소비", () => {
  test("idle 버스트는 tick당 상한까지 몰아 소비, ack은 소비분 최신 seq", () => {
    const q = queueWith([idle(1), idle(2), idle(3), idle(4), idle(5)]);
    const out1 = q.drain(0);
    expect(out1.get(1)?.seq).toBe(MAX_CATCHUP_PER_TICK); // 4
    expect(q.pendingCount(1)).toBe(1);
    const out2 = q.drain(1);
    expect(out2.get(1)?.seq).toBe(5);
    expect(q.pendingCount(1)).toBe(0);
    expect(q.lastAckedSeq(1)).toBe(5);
  });

  test("비-idle(키보드)은 tick당 1건 유지", () => {
    const q = queueWith([key(1), key(2)]);
    const out1 = q.drain(0);
    expect(out1.get(1)?.seq).toBe(1);
    expect(q.pendingCount(1)).toBe(1);
    const out2 = q.drain(1);
    expect(out2.get(1)?.seq).toBe(2);
    expect(q.pendingCount(1)).toBe(0);
  });

  test("idle 런 뒤 키보드 — 키보드까지 소비 후 중단, 나머지는 다음 tick", () => {
    const q = queueWith([idle(1), idle(2), key(3), idle(4)]);
    const out1 = q.drain(0);
    expect(out1.get(1)?.seq).toBe(3); // 이번 tick 의도 = 키보드
    expect(out1.get(1)?.dx).toBe(1);
    expect(q.lastAckedSeq(1)).toBe(3);
    expect(q.pendingCount(1)).toBe(1); // idle(4) 잔류
    const out2 = q.drain(1);
    expect(out2.get(1)?.seq).toBe(4);
    expect(q.pendingCount(1)).toBe(0);
  });

  test("action 비트마스크도 비-idle 취급", () => {
    const q = queueWith([idle(1), act(2), idle(3)]);
    const out = q.drain(0);
    expect(out.get(1)?.seq).toBe(2);
    expect(out.get(1)?.action).toBe(1);
    expect(q.pendingCount(1)).toBe(1);
  });

  test("역순 도착해도 seq 오름차순으로 소비", () => {
    const q = queueWith([key(3), idle(1), key(2)]);
    const out = q.drain(0);
    // seq 1(idle) 소비 → seq 2(key) 소비 후 중단.
    expect(out.get(1)?.seq).toBe(2);
    expect(q.pendingCount(1)).toBe(1);
  });

  test("빈 큐는 항목 없음", () => {
    const q = new InputQueue();
    q.attach(1);
    expect(q.drain(0).size).toBe(0);
  });

  test("정상 케이스(1 push/1 tick)는 종전과 동일 — 1건 소비", () => {
    const q = new InputQueue();
    q.attach(1);
    for (let seq = 1; seq <= 3; seq++) {
      q.push(1, idle(seq));
      const out = q.drain(seq - 1);
      expect(out.get(1)?.seq).toBe(seq);
      expect(q.pendingCount(1)).toBe(0);
    }
  });

  test("u32 상한 근처 seq 만석 idle — 수 tick에 걸쳐 전량 소비, ack 인코딩 안전", () => {
    const q = new InputQueue();
    q.attach(1);
    const base = 0xffff_ffff - 40;
    let last = 0;
    for (let i = 1; i <= MAX_PENDING_INPUTS; i++) {
      last = base + i;
      expect(q.push(1, idle(last))).toBe("accepted");
    }
    let drains = 0;
    while (q.pendingCount(1) > 0) {
      q.drain(drains++);
      expect(drains).toBeLessThanOrEqual(MAX_PENDING_INPUTS); // 무한루프 가드
    }
    expect(drains).toBe(Math.ceil(MAX_PENDING_INPUTS / MAX_CATCHUP_PER_TICK));
    expect(q.lastAckedSeq(1)).toBe(last);
  });

  test("만석 전량 비-idle은 정확히 1건만 소비 — 래칫 상한 고정", () => {
    const q = new InputQueue();
    q.attach(1);
    for (let seq = 1; seq <= MAX_PENDING_INPUTS; seq++) q.push(1, key(seq));
    const out = q.drain(0);
    expect(out.get(1)?.seq).toBe(1);
    expect(q.pendingCount(1)).toBe(MAX_PENDING_INPUTS - 1);
  });

  test("커넥션 간 격리 — 한쪽 몰아 소비가 다른 쪽에 영향 없음", () => {
    const q = new InputQueue();
    q.attach(1);
    q.attach(2);
    for (let seq = 1; seq <= 4; seq++) q.push(1, idle(seq));
    q.push(2, key(1));
    const out = q.drain(0);
    expect(out.get(1)?.seq).toBe(4);
    expect(out.get(2)?.seq).toBe(1);
    expect(out.get(2)?.dx).toBe(1);
    expect(q.pendingCount(1)).toBe(0);
    expect(q.pendingCount(2)).toBe(0);
    expect(q.lastAckedSeq(1)).toBe(4);
    expect(q.lastAckedSeq(2)).toBe(1);
  });
});
