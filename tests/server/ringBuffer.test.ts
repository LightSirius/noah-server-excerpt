/**
 * RingByteBuffer 단위 테스트 — Phase 2.
 *
 * v1의 Buffer.concat 함정이 사라졌는지 + 다양한 청크 크기에서 정확성을 보장.
 * fuzz 1000회로 청크 분할/재조합 회귀 차단.
 */

import { describe, expect, test } from "bun:test";
import { RingByteBuffer } from "../../server/src/net/ringBuffer";

describe("RingByteBuffer", () => {
  test("초기 상태: available=0, capacity=DEFAULT", () => {
    const r = new RingByteBuffer();
    expect(r.available).toBe(0);
    expect(r.capacity).toBeGreaterThanOrEqual(4096);
  });

  test("appendChunk + readU16LE/readU32LE", () => {
    const r = new RingByteBuffer();
    const buf = Buffer.alloc(6);
    buf.writeUInt16LE(0x1234, 0);
    buf.writeUInt32LE(0xdeadbeef, 2);
    r.appendChunk(buf);

    expect(r.available).toBe(6);
    expect(r.readU16LE(0)).toBe(0x1234);
    expect(r.readU32LE(2)).toBe(0xdeadbeef);
  });

  test("slice는 zero-copy view, consume 후 head 전진", () => {
    const r = new RingByteBuffer();
    r.appendChunk(Buffer.from([1, 2, 3, 4, 5]));

    const view = r.slice(1, 4);
    expect(view).toEqual(Buffer.from([2, 3, 4]));

    r.consume(2);
    expect(r.available).toBe(3);
    expect(r.slice(0, 3)).toEqual(Buffer.from([3, 4, 5]));
  });

  test("consume(available)이 두 포인터를 0으로 리셋", () => {
    const r = new RingByteBuffer(16);
    r.appendChunk(Buffer.from([1, 2, 3, 4]));
    r.consume(4);
    expect(r.available).toBe(0);
    // 다시 append하면 grow 없이 들어가야
    r.appendChunk(Buffer.from([9, 9, 9]));
    expect(r.available).toBe(3);
    expect(r.capacity).toBe(16);
  });

  test("작은 capacity에 큰 청크 쓰면 자동 grow", () => {
    const r = new RingByteBuffer(8);
    const big = Buffer.alloc(20).fill(0xaa);
    r.appendChunk(big);
    expect(r.available).toBe(20);
    expect(r.capacity).toBeGreaterThanOrEqual(20);
    expect(r.slice(0, 20).every((b) => b === 0xaa)).toBe(true);
  });

  test("head>cap/2이면 압축 발동, capacity는 유지", () => {
    const r = new RingByteBuffer(16);
    r.appendChunk(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    r.consume(9); // head=9, cap=16 → 압축 트리거
    expect(r.available).toBe(1);
    expect(r.slice(0, 1)).toEqual(Buffer.from([10]));
    expect(r.capacity).toBe(16);
  });

  test("consume 범위 위반은 throw", () => {
    const r = new RingByteBuffer();
    r.appendChunk(Buffer.from([1, 2, 3]));
    expect(() => r.consume(4)).toThrow();
    expect(() => r.consume(-1)).toThrow();
  });

  test("read 범위 위반은 throw (need bytes available)", () => {
    const r = new RingByteBuffer();
    r.appendChunk(Buffer.from([0x12]));
    expect(() => r.readU16LE(0)).toThrow();
    expect(() => r.readU32LE(0)).toThrow();
  });

  test("readU32LE — 4단계 IPC 봉투 길이(리틀엔디언), head 기준 offset", () => {
    const r = new RingByteBuffer(16);
    r.appendChunk(Buffer.from([0xff, 0x78, 0x56, 0x34, 0x12]));
    r.consume(1);
    expect(r.readU32LE(0)).toBe(0x12345678);
  });

  test("기본 상한 1 MB — 넘는 누적은 throw(클라 inbox 하드캡, 종전 동작)", () => {
    const r = new RingByteBuffer();
    r.appendChunk(Buffer.alloc(1024 * 1024));
    expect(r.capacity).toBe(1024 * 1024);
    expect(() => r.appendChunk(Buffer.alloc(1))).toThrow(/overflow/);
  });

  test("maxCapacity 옵션(4단계 IPC 봉투) — 2배 성장이 상한을 넘으면 상한까지만 키운다", () => {
    const max = 3 * 1024 * 1024; // 2의 거듭제곱이 아닌 상한
    const r = new RingByteBuffer(64 * 1024, { maxCapacity: max });
    r.appendChunk(Buffer.alloc(max - 10).fill(7));
    expect(r.capacity).toBe(max);
    r.appendChunk(Buffer.alloc(10).fill(9));
    expect(r.available).toBe(max);
    expect(r.slice(max - 11, max)).toEqual(Buffer.from([7, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]));
    expect(() => r.appendChunk(Buffer.alloc(1))).toThrow(/overflow/);
    // 압축으로 공간이 생기면 상한 안에서 계속 쓴다.
    r.consume(1024);
    r.appendChunk(Buffer.alloc(1024));
    expect(r.capacity).toBe(max);
  });

  test("maxCapacity 검증 — 초기 용량보다 작거나 정수가 아니면 throw", () => {
    expect(() => new RingByteBuffer(4096, { maxCapacity: 4095 })).toThrow();
    expect(() => new RingByteBuffer(4096, { maxCapacity: 1.5e6 + 0.5 })).toThrow();
    expect(new RingByteBuffer(4096, { maxCapacity: 4096 }).capacity).toBe(4096);
  });

  test("fuzz 1000회: 무작위 split + 무작위 consume이 단일 append와 동일한 결과", () => {
    const seed = 0x9e3779b9;
    let state = seed;
    const rand = () => {
      // xorshift32 — 결정적, 의존성 없는 PRNG.
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 0x100000000;
    };

    for (let iter = 0; iter < 1000; iter++) {
      const totalLen = 1 + Math.floor(rand() * 4096);
      const golden = Buffer.alloc(totalLen);
      for (let i = 0; i < totalLen; i++) golden[i] = Math.floor(rand() * 256);

      const r = new RingByteBuffer(64);
      let offset = 0;
      while (offset < totalLen) {
        const remaining = totalLen - offset;
        const chunkSize = 1 + Math.floor(rand() * Math.min(remaining, 256));
        r.appendChunk(golden.subarray(offset, offset + chunkSize));
        offset += chunkSize;

        // 가끔 부분 consume
        if (rand() < 0.3 && r.available > 0) {
          const c = Math.floor(rand() * r.available);
          if (c > 0) {
            // consume 전에 view 검증
            const slice = Buffer.from(r.slice(0, c));
            expect(slice).toEqual(
              golden.subarray(offset - r.available, offset - r.available + c),
            );
            r.consume(c);
          }
        }
      }

      // 남은 데이터가 golden의 남은 부분과 동일해야
      const tailStart = offset - r.available;
      expect(Buffer.from(r.slice(0, r.available))).toEqual(
        golden.subarray(tailStart, tailStart + r.available),
      );
    }
  });
});
