// 세션 송신 outbox(성능 3단계 슬라이스 5) — cork 구간 프레임을 늘어나는 Buffer 1개에 바로 쌓는다.
//
// 종전에는 프레임마다 Buffer 2개(본문·프레임)와 {packetId, buf} 객체를 만들고 uncork 때 Buffer.concat으로 한 번 더
// 복사했다. 여기서는 본문을 outbox에 직접 인코딩한다(생성 바이너리 코덱 net/wireCodec.generated.ts). 바이트는
// writePacket 프레임 연접과 같다: 프레임 헤더(net/wireFrame.ts) + 본문.
//
// 재사용 안전: flush는 view()를 링크(OutboundLink.send)로 넘기고, 링크는 못 보낸 꼬리·대기 중 프레임을 복사해
// 보관한다 — 다음 tick이 같은 메모리를 덮어도 링크가 쥔 바이트는 그대로다(sendCoalescing.test.ts).
// 커밋 규칙: 인코딩이 던지면 길이·프레임 수를 올리지 않는다 — 실패한 프레임의 잔여 바이트는 보이지 않는다(bodySize가 공간 확보
// 전에 검사·throw한다).
// 끝 공유 참조(성능 4.5 F3): appendShared는 공유 프레임(SharedFrame — SNAPSHOT_DELTA 묶음)을 복사하지 않고 끝 참조 1개로 둔다(원격 링크 —
// 세션이 링크의 sharedRoute.send로 인라인 + 참조를 보낸다). 다른 프레임이 뒤에 붙거나 view()를 부르면 그 자리에서 복사·패치해 인라인으로
// 굳힌다 — 연결별 바이트는 언제나 프레임 순서대로 패치한 바이트를 이은 것이다. 참조한 프레임이 재발급됐으면(epoch) 오염 표시만 하고
// (송신 경로 — 존 tick — 를 깨지 않게) flush(view·sharedTail)가 던진다: 세션 flushOrClose가 그 세션만 닫는다.

import type { SharedFrame } from "../net/sharedFrame";
import { bodySize, writeBody } from "../net/wireCodec.generated";
import { FRAME_HEADER_BYTES, writeFrameHeader } from "../net/wireFrame";

/** 첫 프레임 때 잡는 용량 — 분산 배치 세션의 tick당 송신(수백 바이트)이 확장 없이 들어간다. */
const INITIAL_BYTES = 4096;
/**
 * reset 때 이보다 큰 버퍼는 놓는다 — 큰 프레임 1회(카탈로그 등)가 세션 메모리를 영구히 키우지 않게. 단 이 크기를 넘는 주기가
 * 연속이면(밀집 구역에서 tick마다 32KB+를 받는 세션) 유지한다 — 매 주기 놓고 4K→8K→…→64K로 재확장·복사하지 않게(3단계 리뷰).
 */
export const OUTBOX_RETAIN_MAX_BYTES = 32 * 1024;
/** 연속 큰 주기여도 이보다 큰 버퍼는 놓는다(세션당 보유 상한 = OUTBOUND_MAX_BYTES 기본값). */
export const OUTBOX_RETAIN_HARD_MAX_BYTES = 256 * 1024;
const INITIAL_FRAMES = 16;

const EMPTY = Buffer.alloc(0);

export class FrameOutbox {
  private buf: Buffer = EMPTY;
  private len = 0;
  private ids = new Uint16Array(INITIAL_FRAMES);
  private count = 0;
  /** 직전 주기(reset 사이)에 OUTBOX_RETAIN_MAX_BYTES를 넘게 썼나. */
  private prevBig = false;
  /** 끝 공유 참조(없으면 null)와 그 value·참조 당시 epoch. */
  private tail: SharedFrame | null = null;
  private tailValue = 0;
  private tailEpoch = 0;
  /** 재발급된 공유 프레임을 참조했다 — flush가 던진다(reset까지). */
  private stale = false;

  get frameCount(): number {
    return this.count;
  }

  /** 논리 바이트 — 인라인 + 끝 공유 참조(지연 outbox 상한 판정은 참조도 센다). */
  get byteLength(): number {
    return this.tail === null ? this.len : this.len + this.tail.bytes.length;
  }

  /** 현재 버퍼 용량 — 관측·테스트용. */
  get capacity(): number {
    return this.buf.length;
  }

  /** i번째 프레임의 packet id(추가 순서). */
  packetIdAt(i: number): number {
    return this.ids[i]!;
  }

  /** 쌓인 바이트 전체 뷰(끝 참조는 굳힌다) — 다음 append·reset 전까지만 유효(링크는 보관분을 복사한다). 오염이면 던진다. */
  view(): Buffer {
    this.settleTail();
    this.assertFresh();
    return this.buf.subarray(0, this.len);
  }

  /** 끝 공유 참조 앞의 인라인 바이트 뷰(공유 경로용) — 다음 append·reset 전까지만 유효. */
  inlineView(): Buffer {
    return this.buf.subarray(0, this.len);
  }

  /** 끝 공유 참조(없으면 null) — 재발급된 프레임이거나 오염이면 던진다. */
  sharedTail(): SharedFrame | null {
    if (this.tail !== null && this.tail.epoch !== this.tailEpoch) this.stale = true;
    this.assertFresh();
    return this.tail;
  }

  /** 끝 공유 참조의 value(u32). */
  get sharedValue(): number {
    return this.tailValue;
  }

  /** 공유 프레임을 끝 참조로(복사 없음 — 원격 링크). 앞선 끝 참조는 굳힌다. */
  appendShared(packetId: number, frame: SharedFrame, value: number): void {
    this.settleTail();
    this.tail = frame;
    this.tailValue = value >>> 0;
    this.tailEpoch = frame.epoch;
    this.commit(packetId, 0);
  }

  /** 공유 프레임을 곧바로 복사·패치해 붙인다(로컬 링크 — 종전 바이트). */
  appendFramePatched(packetId: number, frame: SharedFrame, value: number): void {
    this.settleTail();
    const at = this.reserve(frame.bytes.length);
    frame.copyPatchedTo(this.buf, at, value);
    this.commit(packetId, frame.bytes.length);
  }

  /** 완성 프레임(헤더 포함) 1개를 복사해 붙인다 — 팬아웃 1회 인코딩 프레임. */
  appendFrame(packetId: number, frame: Uint8Array): void {
    this.settleTail();
    const at = this.reserve(frame.length);
    this.buf.set(frame, at);
    this.commit(packetId, frame.length);
  }

  /** 페이로드를 outbox에 직접 인코딩한다 — writePacket(packetId, payload)와 같은 바이트·같은 예외. */
  appendPayload(packetId: number, payload: object): void {
    this.settleTail();
    const bodyLen = bodySize(packetId, payload);
    const at = this.reserve(FRAME_HEADER_BYTES + bodyLen);
    writeFrameHeader(this.buf, at, packetId, bodyLen);
    writeBody(packetId, payload, this.buf, at + FRAME_HEADER_BYTES);
    this.commit(packetId, FRAME_HEADER_BYTES + bodyLen);
  }

  /** 비운다(다음 cork 구간 재사용). 상한을 넘게 커진 버퍼는 놓는다 — 큰 주기가 연속이고 유지 상한 안이면 유지. */
  reset(): void {
    const big = this.len > OUTBOX_RETAIN_MAX_BYTES;
    const sustained = big && this.prevBig && this.buf.length <= OUTBOX_RETAIN_HARD_MAX_BYTES;
    if (this.buf.length > OUTBOX_RETAIN_MAX_BYTES && !sustained) this.buf = EMPTY;
    this.prevBig = big;
    this.len = 0;
    this.count = 0;
    this.tail = null;
    this.stale = false;
  }

  /** 끝 참조를 그 자리(현재 끝)에 복사·패치해 인라인으로 굳힌다. 재발급된 프레임이면 버리고 오염 표시(flush가 던진다). */
  private settleTail(): void {
    const t = this.tail;
    if (t === null) return;
    this.tail = null;
    if (t.epoch !== this.tailEpoch) {
      this.stale = true;
      return;
    }
    const at = this.reserve(t.bytes.length);
    this.len += t.copyPatchedTo(this.buf, at, this.tailValue);
  }

  private assertFresh(): void {
    if (this.stale) throw new Error("stale shared frame in session outbox — the pool reissued it before flush");
  }

  /** `bytes`를 쓸 공간을 확보하고 쓰기 시작 오프셋(= 현재 길이)을 돌려준다. 길이는 commit이 올린다. */
  private reserve(bytes: number): number {
    const need = this.len + bytes;
    if (need > this.buf.length) {
      const next = Buffer.allocUnsafe(Math.max(INITIAL_BYTES, this.buf.length * 2, need));
      this.buf.copy(next, 0, 0, this.len);
      this.buf = next;
    }
    return this.len;
  }

  private commit(packetId: number, bytes: number): void {
    if (this.count === this.ids.length) {
      const next = new Uint16Array(this.ids.length * 2);
      next.set(this.ids);
      this.ids = next;
    }
    this.ids[this.count++] = packetId;
    this.len += bytes;
  }
}
