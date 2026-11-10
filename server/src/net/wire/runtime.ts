// 바이너리 본문 코덱 런타임 — 생성 코덱(net/wireCodec.generated.ts)이 쓰는 손으로 쓴 부품. 와이어 규칙 정본은 shared/protocol.md §2,
// 결정은 docs/adr/0003-binary-body-codec.md.
//
// 디코드: 모듈 싱글톤 BodyReader 하나를 reset(body)해 쓴다(디코드는 동기·비재진입 — 패킷당 할당은 결과 객체뿐). 예외를 던지지 않는다:
// 첫 위반의 사유 코드(WIRE_ERROR)를 기록하고 이후 읽기는 0·""·false를 돌려주는 무동작이 된다(첫 위반 우선). 생성 read*는 null을 돌려주고
// 호출자는 lastDecodeError()로 사유를 본다. 길이·개수의 범위(max/min)는 내용을 읽기 전에 본다.
// 인코드: 생성 size*가 범위·정수성·유한·enum·max/min·UTF-16 정상성을 검사하고(위반 = WireEncodeError), write*는 검사된 값만 쓰므로 던지지 않는다.
// 의존성 없음 — 게이트웨이 import 가드(tests/server/cluster/gatewayImportGuard.test.ts)와 tools가 그대로 실을 수 있게.

/** 디코드 실패 사유 — 0은 없음. 값은 C# 코덱(C0.3)·골든 벡터와 공유하므로 바꾸지 않는다(추가만). */
export const WIRE_ERROR = {
  None: 0,
  Truncated: 1,
  Trailing: 2,
  BadBool: 3,
  BadEnum: 4,
  OverMax: 5,
  UnderMin: 6,
  BadUtf8: 7,
  BadPresence: 8,
  NonFinite: 9,
} as const;

export type WireErrorCode = (typeof WIRE_ERROR)[keyof typeof WIRE_ERROR];
export type WireErrorName = keyof typeof WIRE_ERROR;

const ERROR_NAMES: readonly WireErrorName[] = (Object.keys(WIRE_ERROR) as WireErrorName[]).sort((a, b) => WIRE_ERROR[a] - WIRE_ERROR[b]);

/** 사유 코드 → 이름(로그·메트릭 라벨용). 모르는 코드는 "Unknown". */
export function wireErrorName(code: number): WireErrorName | "Unknown" {
  return ERROR_NAMES[code] ?? "Unknown";
}

/**
 * 와이어 i32 최대값 — 스키마 i32 필드(id·수치)로 나가는 값의 상한. 생성 코덱은 넘는 값을 WireEncodeError로 거부하므로 값을 만드는 쪽(id 발급기·
 * 데이터 로더·데미지 계산)이 이 상수로 미리 묶는다(이진 전환 B3b).
 */
export const I32_MAX = 0x7fff_ffff;

/** decodeC2S가 "이 id는 바이너리 C2S 코덱이 없다"를 알리는 표지(서버 수신 frameIngest는 미지 패킷과 같이 버린다 — B2c). */
export const NO_CODEC: unique symbol = Symbol("noCodec");

/** 인코드 거부 — 생성 size*가 던진다(송신 경로의 버그 신호). path = `<패킷|struct>.<필드>`. */
export class WireEncodeError extends Error {
  constructor(
    readonly path: string,
    detail: string,
  ) {
    super(`wire encode ${path}: ${detail}`);
    this.name = "WireEncodeError";
  }
}

const LEN_PREFIX_BYTES = 2;

/** 바이너리 본문 판독기 — 경계 검사 읽기 + 첫 위반 기록. 생성 read*만 쓴다. */
export class BodyReader {
  private buf: Buffer = Buffer.alloc(0);
  private off = 0;
  private end = 0;
  /** 첫 위반 사유(0 = 없음). */
  err: WireErrorCode = WIRE_ERROR.None;

  /** 새 본문으로 초기화한다(복사 없음 — Buffer가 아니면 같은 메모리의 Buffer 뷰). */
  reset(body: Uint8Array): this {
    this.buf = Buffer.isBuffer(body) ? body : Buffer.from(body.buffer, body.byteOffset, body.byteLength);
    this.off = 0;
    this.end = this.buf.length;
    this.err = WIRE_ERROR.None;
    return this;
  }

  /** 위반 기록 — 이미 위반이 있으면 무시(첫 위반 우선). */
  fail(code: WireErrorCode): void {
    if (this.err === WIRE_ERROR.None) this.err = code;
  }

  /** n바이트를 읽을 수 있나 — 아니면 Truncated. 위반 뒤에는 false. */
  need(n: number): boolean {
    if (this.err !== WIRE_ERROR.None) return false;
    if (n > this.end - this.off) {
      this.fail(WIRE_ERROR.Truncated);
      return false;
    }
    return true;
  }

  u8(): number {
    if (!this.need(1)) return 0;
    return this.buf[this.off++]!;
  }

  i8(): number {
    if (!this.need(1)) return 0;
    return this.buf.readInt8(this.off++);
  }

  u16(): number {
    if (!this.need(2)) return 0;
    const v = this.buf.readUInt16LE(this.off);
    this.off += 2;
    return v;
  }

  i16(): number {
    if (!this.need(2)) return 0;
    const v = this.buf.readInt16LE(this.off);
    this.off += 2;
    return v;
  }

  u32(): number {
    if (!this.need(4)) return 0;
    const v = this.buf.readUInt32LE(this.off);
    this.off += 4;
    return v;
  }

  i32(): number {
    if (!this.need(4)) return 0;
    const v = this.buf.readInt32LE(this.off);
    this.off += 4;
    return v;
  }

  /** f32(f64로 넓힌 값). NaN·±Inf = NonFinite. */
  f32(): number {
    if (!this.need(4)) return 0;
    const v = this.buf.readFloatLE(this.off);
    this.off += 4;
    return this.finite(v);
  }

  /** f64. NaN·±Inf = NonFinite. */
  f64(): number {
    if (!this.need(8)) return 0;
    const v = this.buf.readDoubleLE(this.off);
    this.off += 8;
    return this.finite(v);
  }

  /** bool = u8 0/1만. 그 밖 = BadBool. */
  bool(): boolean {
    if (!this.need(1)) return false;
    const b = this.buf[this.off++]!;
    if (b > 1) this.fail(WIRE_ERROR.BadBool);
    return b === 1;
  }

  /** string = u16 바이트 길이 + 엄격 UTF-8. 길이 > max = OverMax(내용을 읽기 전), 잘못된 UTF-8 = BadUtf8. */
  str(max: number): string {
    if (!this.need(LEN_PREFIX_BYTES)) return "";
    const len = this.buf.readUInt16LE(this.off);
    this.off += LEN_PREFIX_BYTES;
    if (len > max) {
      this.fail(WIRE_ERROR.OverMax);
      return "";
    }
    if (!this.need(len)) return "";
    const start = this.off;
    this.off += len;
    if (!isValidUtf8(this.buf, start, start + len)) {
      this.fail(WIRE_ERROR.BadUtf8);
      return "";
    }
    return this.buf.toString("utf8", start, start + len);
  }

  /** array 원소 수 = u16. > max = OverMax, < min = UnderMin(원소를 읽기 전). 위반 시 0. */
  count(min: number, max: number): number {
    if (!this.need(LEN_PREFIX_BYTES)) return 0;
    const n = this.buf.readUInt16LE(this.off);
    this.off += LEN_PREFIX_BYTES;
    if (n > max) {
      this.fail(WIRE_ERROR.OverMax);
      return 0;
    }
    if (n < min) {
      this.fail(WIRE_ERROR.UnderMin);
      return 0;
    }
    return n;
  }

  /**
   * presence 비트마스크 — nBytes(= ceil(k/8))바이트 LE, 비트 i = i번째 optional 필드(LSB부터). k 이상 비트가 서 있으면 BadPresence.
   * k ≤ 32(스키마가 보장).
   */
  presence(nBytes: number, k: number): number {
    if (!this.need(nBytes)) return 0;
    let mask = 0;
    for (let i = 0; i < nBytes; i++) mask |= this.buf[this.off + i]! << (8 * i);
    this.off += nBytes;
    mask >>>= 0;
    if (k < 32 && mask >>> k !== 0) {
      this.fail(WIRE_ERROR.BadPresence);
      return 0;
    }
    return mask;
  }

  /** 본문 끝 — 위반이 없는데 남는 바이트가 있으면 Trailing. 성공이면 true. */
  done(): boolean {
    if (this.err === WIRE_ERROR.None && this.off !== this.end) this.fail(WIRE_ERROR.Trailing);
    return this.err === WIRE_ERROR.None;
  }

  private finite(v: number): number {
    if (v - v !== 0) {
      this.fail(WIRE_ERROR.NonFinite);
      return 0;
    }
    return v;
  }
}

/** 모듈 싱글톤 — 생성 decode*가 reset해 쓴다. */
export const bodyReader = new BodyReader();

/** 마지막 디코드의 실패 사유(성공·디코드 전이면 0). */
export function lastDecodeError(): WireErrorCode {
  return bodyReader.err;
}

/**
 * 엄격 UTF-8 판정(RFC 3629 / Unicode 표 3-7 정형 바이트열) — overlong·서로게이트(U+D800–DFFF)·U+10FFFF 초과·잘린 열을 거부한다.
 * WHATWG TextDecoder(fatal)와 같은 판정이다(tests/server/net/wireRuntime.test.ts가 퍼징으로 대조).
 */
export function isValidUtf8(b: Uint8Array, start: number, end: number): boolean {
  let i = start;
  while (i < end) {
    const c = b[i]!;
    if (c < 0x80) {
      i++;
      continue;
    }
    const n = utf8SeqLen(b, i, end);
    if (n === 0) return false;
    i += n;
  }
  return true;
}

function cont(b: Uint8Array, i: number, end: number, lo = 0x80, hi = 0xbf): boolean {
  if (i >= end) return false;
  const c = b[i]!;
  return c >= lo && c <= hi;
}

/** b[i](≥ 0x80)에서 시작하는 정형 다바이트 열의 길이, 아니면 0. */
function utf8SeqLen(b: Uint8Array, i: number, end: number): number {
  const c = b[i]!;
  if (c >= 0xc2 && c <= 0xdf) return cont(b, i + 1, end) ? 2 : 0;
  if (c >= 0xe0 && c <= 0xef) {
    const lo = c === 0xe0 ? 0xa0 : 0x80;
    const hi = c === 0xed ? 0x9f : 0xbf;
    return cont(b, i + 1, end, lo, hi) && cont(b, i + 2, end) ? 3 : 0;
  }
  if (c >= 0xf0 && c <= 0xf4) {
    const lo = c === 0xf0 ? 0x90 : 0x80;
    const hi = c === 0xf4 ? 0x8f : 0xbf;
    return cont(b, i + 1, end, lo, hi) && cont(b, i + 2, end) && cont(b, i + 3, end) ? 4 : 0;
  }
  return 0;
}

// ── 인코드 검사(생성 size*가 쓴다) — 통과한 값만 write*가 쓴다. ──

/** 정수 범위·정수성. */
export function checkInt(v: number, lo: number, hi: number, path: string): void {
  if (!Number.isInteger(v) || v < lo || v > hi) throw new WireEncodeError(path, `integer outside [${lo}, ${hi}]: ${String(v)}`);
}

/** f32로 유한(NaN·±Inf·f32 범위 초과 거부). */
export function checkF32(v: number, path: string): void {
  if (typeof v !== "number" || !Number.isFinite(Math.fround(v))) throw new WireEncodeError(path, `not a finite f32: ${String(v)}`);
}

/** f64로 유한. */
export function checkF64(v: number, path: string): void {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new WireEncodeError(path, `not a finite f64: ${String(v)}`);
}

export function checkBool(v: boolean, path: string): void {
  if (typeof v !== "boolean") throw new WireEncodeError(path, `not a boolean: ${String(v)}`);
}

/** struct 값이 객체인가(undefined·null·원시 거부 — 필드 접근 TypeError 대신 WireEncodeError). 통과하면 그대로 돌려준다. */
export function checkStruct<T>(v: T, path: string): T {
  if (typeof v !== "object" || v === null) throw new WireEncodeError(path, `not an object: ${String(v)}`);
  return v;
}

/** enum 값 이름이 codes(생성 `<ENUM>_CODE`)에 있나. */
export function checkEnum(codes: Readonly<Record<string, number>>, v: string, path: string): void {
  if (typeof v !== "string" || !Object.hasOwn(codes, v)) throw new WireEncodeError(path, `not an enum value: ${String(v)}`);
}

/** string의 인코딩 크기(길이 접두 포함) — UTF-8 바이트 ≤ max, 짝 없는 서로게이트 거부(UTF-8로 못 옮긴다). */
export function strSize(v: string, max: number, path: string): number {
  if (typeof v !== "string") throw new WireEncodeError(path, `not a string: ${String(v)}`);
  if (!v.isWellFormed()) throw new WireEncodeError(path, "lone surrogate");
  const n = Buffer.byteLength(v, "utf8");
  if (n > max) throw new WireEncodeError(path, `${n} UTF-8 bytes > max ${max}`);
  return LEN_PREFIX_BYTES + n;
}

/** array 원소 수 min..max. */
export function checkCount(a: readonly unknown[], min: number, max: number, path: string): void {
  if (!Array.isArray(a)) throw new WireEncodeError(path, "not an array");
  if (a.length < min || a.length > max) throw new WireEncodeError(path, `count ${a.length} outside [${min}, ${max}]`);
}

/** string 쓰기 — [u16 바이트 길이][UTF-8]. strSize로 검사·공간 확보가 끝난 값만. 끝 오프셋. */
export function writeStr(out: Buffer, off: number, v: string): number {
  const n = out.write(v, off + LEN_PREFIX_BYTES, "utf8");
  out.writeUInt16LE(n, off);
  return off + LEN_PREFIX_BYTES + n;
}
