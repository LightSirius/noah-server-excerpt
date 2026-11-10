// 생활 L-1 — InputQueue.highestSeq: 채집 채널 시작 시점까지 받은 INPUT_CMD 최대 seq(LifeChannel.startSeq).
// 채널 중 이 seq를 넘는 non-idle 입력만 중단 신호다 — 시작 전에 이미 큐에 든 백로그(≤ startSeq)는 채널을 끊지 않는다
// (life-content-draft §5.1 "그때까지 받은 INPUT_CMD 최대 seq").

import { describe, expect, test } from "bun:test";
import { InputQueue, MAX_PENDING_INPUTS, type InputCmd } from "../../../server/src/sim/inputQueue";

const key = (seq: number): InputCmd => ({ seq, tick: 0, dx: 1, dy: 0, action: 0 });
const idle = (seq: number): InputCmd => ({ seq, tick: 0, dx: 0, dy: 0, action: 0 });

describe("InputQueue.highestSeq", () => {
  test("등록 직후·미등록 연결은 0", () => {
    const q = new InputQueue();
    expect(q.highestSeq(1)).toBe(0);
    q.attach(1);
    expect(q.highestSeq(1)).toBe(0);
  });

  test("push 후 = 대기 중 seq 최댓값(도착 순서 무관)", () => {
    const q = new InputQueue();
    q.attach(1);
    q.push(1, key(5));
    q.push(1, key(9));
    q.push(1, key(7));
    expect(q.highestSeq(1)).toBe(9);
    expect(q.pendingCount(1)).toBe(3);
  });

  test("drain 뒤 = lastAckedSeq(대기가 비면), 대기가 남으면 그 최댓값", () => {
    const q = new InputQueue();
    q.attach(1);
    q.push(1, key(3));
    q.drain(0);
    expect([q.highestSeq(1), q.lastAckedSeq(1)]).toEqual([3, 3]);
    q.push(1, key(4));
    q.push(1, key(6));
    q.drain(1);
    expect([q.lastAckedSeq(1), q.highestSeq(1)]).toEqual([4, 6]);
  });

  test("거부된 push(늦은 재전송·상한 초과)는 바꾸지 않는다", () => {
    const q = new InputQueue();
    q.attach(1);
    q.push(1, idle(10));
    q.drain(0);
    expect(q.push(1, key(8))).toBe("stale");
    expect(q.highestSeq(1)).toBe(10);
    for (let s = 11; s < 11 + MAX_PENDING_INPUTS; s++) q.push(1, key(s));
    const full = q.highestSeq(1);
    expect(q.push(1, key(10_000))).toBe("overflow");
    expect(q.highestSeq(1)).toBe(full);
  });

  test("연결마다 따로, detach하면 0", () => {
    const q = new InputQueue();
    q.attach(1);
    q.attach(2);
    q.push(1, key(4));
    q.push(2, key(12));
    expect([q.highestSeq(1), q.highestSeq(2)]).toEqual([4, 12]);
    q.detach(2);
    expect(q.highestSeq(2)).toBe(0);
  });
});
