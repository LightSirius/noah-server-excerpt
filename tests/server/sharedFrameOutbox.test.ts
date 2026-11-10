// 성능 4.5 F3 — 공유 프레임(SharedFrame)과 세션 outbox의 끝 참조.
//
// 계약:
//   - SharedFrame: 같은 완성 클라 프레임 바이트를 여러 연결이 받되 patchOff의 u32 LE 하나만 수신자마다 다르다(SNAPSHOT_DELTA ackSeq).
//     copyPatchedTo = 복사 후 그 자리에 value(>>> 0), patch = 제자리(즉시 송신 직전 — 링크는 호출 동안만 읽는다).
//   - FrameOutbox.appendShared: 복사 없이 끝 참조 1개로 둔다(원격 링크 — 게이트웨이로 참조를 보낸다). 다른 프레임이 뒤에 붙거나 view()를
//     부르면 그 자리에서 복사·패치해 인라인으로 굳힌다 — 연결별 바이트는 언제나 "프레임 순서대로 패치한 바이트를 이은 것".
//     appendFramePatched = 곧바로 복사·패치(로컬 링크). byteLength = 인라인 + 끝 참조(논리 바이트 — 지연 outbox 상한 판정).
//   - 풀이 재발급한 프레임(epoch 변경)을 참조하면 outbox가 오염 상태가 되고 flush(view·sharedTail)가 던진다 — 조용히 틀린 바이트를 보내지
//     않는다(세션 flushOrClose가 그 세션만 닫는다).

import { describe, expect, test } from "bun:test";
import { SharedFrame } from "../../server/src/net/sharedFrame";
import { FrameOutbox } from "../../server/src/network/frameOutbox";
import { writePacket } from "../../server/src/network/packetWriter";
import { PACKET_ID } from "../../server/src/net/codec.generated";
import { tagPong } from "../helpers/fillers";

const DELTA = PACKET_ID.SNAPSHOT_DELTA;
const PONG = PACKET_ID.PONG;

/** 패치 자리(10)를 가진 가짜 DELTA 프레임 — 앞 10바이트·뒤 꼬리는 식별용 패턴. */
function sharedOf(tail: string, epoch = 0): SharedFrame {
  const f = new SharedFrame(10);
  const bytes = Buffer.alloc(14 + tail.length, 0xaa);
  bytes.write(tail, 14, "latin1");
  f.bytes = bytes;
  f.epoch = epoch;
  return f;
}

function patched(f: SharedFrame, value: number): Buffer {
  const out = Buffer.from(f.bytes);
  out.writeUInt32LE(value >>> 0, f.patchOff);
  return out;
}

const pong = (t: string) => writePacket(PONG, tagPong(t));

describe("SharedFrame", () => {
  test("copyPatchedTo — 바이트 복사 후 patchOff에 u32 LE(>>> 0), 원본은 그대로", () => {
    const f = sharedOf("xyz");
    const out = Buffer.alloc(f.bytes.length + 3, 0);
    expect(f.copyPatchedTo(out, 3, -1)).toBe(f.bytes.length);
    expect(out.subarray(3)).toEqual(patched(f, 0xffffffff));
    expect(f.bytes.readUInt32LE(10)).toBe(0xaaaaaaaa);
  });

  test("patch — 제자리, 같은 버퍼를 돌려준다", () => {
    const f = sharedOf("q");
    expect(f.patch(77)).toBe(f.bytes);
    expect(f.bytes.readUInt32LE(10)).toBe(77);
  });

  test("보관자 집계 — 키(피어)별 hold/take, take는 남은 수(자신 포함)를 주고 줄인다, reissue가 비운다", () => {
    const f = sharedOf("h");
    const p1 = {};
    const p2 = {};
    f.hold(p1);
    f.hold(p1);
    f.hold(p2);
    expect(f.take(p1)).toBe(2);
    expect(f.take(p1)).toBe(1);
    expect(f.take(p1)).toBe(0);
    expect(f.take(p2)).toBe(1);
    expect(f.take({})).toBe(0);
    f.hold(p2);
    const epoch = f.epoch;
    f.reissue(Buffer.alloc(20, 1));
    expect(f.epoch).toBe(epoch + 1);
    expect(f.bytes).toEqual(Buffer.alloc(20, 1));
    expect(f.take(p2)).toBe(0);
  });

  test("patchOff + 4가 바이트를 넘으면 RangeError", () => {
    const f = new SharedFrame(10);
    f.bytes = Buffer.alloc(13);
    expect(() => f.patch(1)).toThrow(RangeError);
  });
});

describe("FrameOutbox — 끝 공유 참조", () => {
  test("appendShared는 복사하지 않는다 — 인라인 0, byteLength = 프레임, 프레임 수·id 기록", () => {
    const box = new FrameOutbox();
    const f = sharedOf("abc");
    box.appendShared(DELTA, f, 5);
    expect(box.inlineView().length).toBe(0);
    expect(box.byteLength).toBe(f.bytes.length);
    expect(box.frameCount).toBe(1);
    expect(box.packetIdAt(0)).toBe(DELTA);
    expect(box.sharedTail()).toBe(f);
    expect(box.sharedValue).toBe(5);
  });

  test("뒤에 프레임이 붙으면 그 자리에서 복사·패치 — 순서 = 추가 순서", () => {
    const box = new FrameOutbox();
    const a = pong("a");
    const f = sharedOf("mid");
    box.appendFrame(PONG, a);
    box.appendShared(DELTA, f, 9);
    box.appendPayload(PONG, tagPong("b"));
    expect(box.sharedTail()).toBeNull();
    expect(box.view()).toEqual(Buffer.concat([a, patched(f, 9), pong("b")]));
    expect([box.packetIdAt(0), box.packetIdAt(1), box.packetIdAt(2)]).toEqual([PONG, DELTA, PONG]);
  });

  test("공유 참조 두 개 — 앞 것은 굳고 뒤 것이 끝 참조, 각자 자기 value", () => {
    const box = new FrameOutbox();
    const f = sharedOf("one");
    const g = sharedOf("two");
    box.appendShared(DELTA, f, 1);
    box.appendShared(DELTA, g, 2);
    expect(box.inlineView()).toEqual(patched(f, 1));
    expect(box.sharedTail()).toBe(g);
    expect(box.sharedValue).toBe(2);
    expect(box.byteLength).toBe(f.bytes.length + g.bytes.length);
  });

  test("view()는 끝 참조를 굳혀 전체 바이트를 준다 — 같은 프레임을 다른 value로 참조해도 서로 섞이지 않는다", () => {
    const f = sharedOf("shared");
    const x = new FrameOutbox();
    const y = new FrameOutbox();
    x.appendShared(DELTA, f, 100);
    y.appendShared(DELTA, f, 200);
    expect(x.view()).toEqual(patched(f, 100));
    expect(y.view()).toEqual(patched(f, 200));
  });

  test("appendFramePatched — 곧바로 복사·패치(로컬 링크)", () => {
    const box = new FrameOutbox();
    const f = sharedOf("loc");
    box.appendFramePatched(DELTA, f, 0x01020304);
    expect(box.sharedTail()).toBeNull();
    expect(box.view()).toEqual(patched(f, 0x01020304));
    expect(box.frameCount).toBe(1);
  });

  test("reset은 끝 참조를 놓는다", () => {
    const box = new FrameOutbox();
    box.appendShared(DELTA, sharedOf("r"), 1);
    box.reset();
    expect(box.frameCount).toBe(0);
    expect(box.byteLength).toBe(0);
    expect(box.sharedTail()).toBeNull();
  });

  test("재발급된 프레임(epoch 변경) — 굳히는 자리에서 오염 표시, flush(view·sharedTail)가 던진다, reset이 푼다", () => {
    const tailCase = new FrameOutbox();
    const f = sharedOf("old");
    tailCase.appendShared(DELTA, f, 1);
    f.epoch++;
    expect(() => tailCase.sharedTail()).toThrow(/stale shared frame/);
    tailCase.reset();
    expect(tailCase.sharedTail()).toBeNull();

    const settled = new FrameOutbox();
    const g = sharedOf("old2");
    settled.appendShared(DELTA, g, 1);
    g.epoch++;
    settled.appendFrame(PONG, pong("after")); // 굳히는 자리 — 던지지 않는다(송신 경로를 깨지 않게), 오염만 표시.
    expect(() => settled.view()).toThrow(/stale shared frame/);
    settled.reset();
    settled.appendFrame(PONG, pong("ok"));
    expect(settled.view()).toEqual(pong("ok"));
  });
});
