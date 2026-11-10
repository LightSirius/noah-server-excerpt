// 성능 4단계 리뷰 픽스 — IPC 핸드셰이크 v2(cluster/ipcSchema·ipcCodec).
//   - HELLO는 공유 비밀(IPC_TOKEN)을 싣는다: {u16 ipcVer, u16 gatewayId, u32 incarnation, u32 pid, u8 tokenLen, token}.
//   - W→G HELLO_NACK {u16 ipcVer, u8 reason}: 월드가 HELLO를 거절한 이유(fenced·closed·version·auth)를 끊기 전에 알린다 —
//     게이트웨이가 "월드 다운"과 "거절"을 구분한다. 첫 메시지로만 유효하고(버전과 무관하게 읽는다), 받은 뒤 디코더는 멈춘다.
//   - 핸드셰이크 전 봉투 상한(IPC_HANDSHAKE_MAX_ENVELOPE_BYTES): 인증 전 상대가 64 MiB 봉투를 주장해 링에 쌓는 것을 헤더
//     4바이트에서 끊는다(보안 리뷰 — 로컬 메모리 증폭).

import { describe, expect, test } from "bun:test";
import {
  HELLO_NACK_REASON,
  IPC_HANDSHAKE_MAX_ENVELOPE_BYTES,
  IPC_MSG,
  IPC_TOKEN_MAX_BYTES,
  IPC_VERSION,
  type GatewayToWorldMsg,
  type WorldToGatewayMsg,
} from "../../../server/src/cluster/ipcSchema";
import {
  GatewayIpcWriter,
  IpcProtocolError,
  WorldIpcWriter,
  createGatewaySideDecoder,
  createWorldSideDecoder,
} from "../../../server/src/cluster/ipcCodec";
import { PROTO_VERSION } from "../../../server/src/net/codec.generated";

function flushed(w: GatewayIpcWriter | WorldIpcWriter): Buffer {
  const out: Buffer[] = [];
  w.flushTo({ write: (buf) => out.push(Buffer.from(buf)) > 0 });
  return Buffer.concat(out);
}

function rawEnvelope(type: number, payload: number[] | Buffer): Buffer {
  const p = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const out = Buffer.alloc(5 + p.length);
  out.writeUInt32LE(1 + p.length, 0);
  out[4] = type;
  p.copy(out, 5);
  return out;
}

function lenHeader(len: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(len, 0);
  return b;
}

function errorKind(fn: () => void): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof IpcProtocolError) return err.kind;
    throw err;
  }
  throw new Error("expected IpcProtocolError");
}

/** 월드 측 디코더 — HELLO의 token 뷰는 콜백 안에서 문자열로 복사한다. */
function worldDecoder() {
  const msgs: Array<GatewayToWorldMsg | { type: "hello"; token: string; gatewayId: number }> = [];
  const dec = createWorldSideDecoder((m) => {
    if (m.type === IPC_MSG.HELLO) msgs.push({ type: "hello", token: m.token.toString("utf8"), gatewayId: m.gatewayId });
    else msgs.push(m);
  });
  return { dec, msgs };
}

function gatewayDecoder() {
  const msgs: WorldToGatewayMsg[] = [];
  const dec = createGatewaySideDecoder((m) => msgs.push(m));
  return { dec, msgs };
}

function helloWith(token: string | undefined): Buffer {
  const w = new GatewayIpcWriter();
  w.hello({ gatewayId: 7, incarnation: 99, pid: 1, ...(token !== undefined ? { token } : {}) });
  return flushed(w);
}

describe("HELLO v2 — 공유 비밀(token)", () => {
  test("IPC_VERSION ↔ 클라 protoVersion 짝 — protoVersion을 올리면 이 줄이 실패한다: IPC_VERSION도 올리고 둘을 함께 고친다", () => {
    // 게이트웨이가 클라 와이어의 엣지 정책(수신 상한 = 스키마 최악 본문·프레이밍)을 집행한다 — 다른 protoVersion 빌드가 섞이면 상한·본문 해석이
    // 갈린다(B2b 리뷰). IPC 버전이 다르면 HELLO_NACK(version)으로 막힌다. v7 = 클라 protoVersion 5(C2S 바이너리), v8 = 6(고빈도 S2C 바이너리 — 게이트웨이가
    // 직접 쓰는 KICK도 바이너리), v9 = 7(나머지 고정형 S2C 17개 바이너리 — B4), v10 = 8(인벤·상점 S2C 3개 바이너리 — B5②b),
    // v11 = 9(스킬·UI 설정 S2C 2개 바이너리 — B5③b), v12 = 10(NPC 대화·퀘스트 S2C 4개 바이너리 — B5④b),
    // v13 = 11(캐릭터·포탈 S2C 4개 바이너리 + CHAR_LIST 형태 변경 — B5①b, S2C 전부 바이너리).
    // v14 = 11 그대로(IPC만 — LISTEN_REPORT·LISTEN, 공유 포트 리스너 양보: ipcListen.test.ts).
    // v15 = 12(CHAR_STATS_FULL 상세 능력치 확장). v16 = 13(자유 포인트 — STAT_ALLOCATE·STAT_RESET·STAT_POINTS_ACK, CHAR_STATS_FULL.freePoints·allocatedPoints). v17 = 14(자유 포인트 요청 id — 재전송 멱등).
    // v18 = 15(INPUT_CMD.gait — 걷기·달리기). v19 = 16(ENTITY_SPAWN.monsterDefId — 몬스터 def별 외형).
    // v20 = 17(생활 L-1 채집·L-2 제작 — GATHER_START·LIFE_CANCEL·LIFE_CHANNEL·LIFE_RESULT·LIFE_STATUS·NODE_CATALOG·RECIPE_LIST·CRAFT_REQ·CRAFT_ACK, EntityType.resource).
    // v21 = 18(채집 미니게임 — GATHER_PUZZLE·GATHER_TRACE, PuzzlePoint). v22 = 19(원 짚기 — GATHER_PUZZLE.kind·circleRadius, GATHER_TAPS, PuzzleTap).
    expect([IPC_VERSION, PROTO_VERSION]).toEqual([22, 19]);
  });

  test("token 레이아웃(v2~, 현재 v14) — token 없음은 빈 token, 최대 255바이트 token도 핸드셰이크 봉투 상한 안", () => {
    // v3 = ADMISSION(ipcAdmission.test.ts), v4 = MULTICAST(ipcMulticast.test.ts), v5 = 공유 프레임(ipcShared.test.ts), v6 = 클라 헤더 v2,
    // v7 = 클라 C2S 바이너리, v8 = 고빈도 S2C 바이너리, v9 = 나머지 고정형 S2C 바이너리,
    // v10 = 인벤·상점 S2C 바이너리, v11 = 스킬·UI 설정 S2C 바이너리, v12 = NPC 대화·퀘스트 S2C 바이너리,
    // v13 = 캐릭터·포탈 S2C 바이너리, v14 = LISTEN_REPORT·LISTEN — HELLO 레이아웃은 v2 그대로
    const empty = worldDecoder();
    empty.dec.push(helloWith(undefined));
    expect(empty.msgs).toEqual([{ type: "hello", token: "", gatewayId: 7 }]);

    const token = "k".repeat(IPC_TOKEN_MAX_BYTES);
    const bytes = helloWith(token);
    expect(bytes.length).toBeLessThanOrEqual(IPC_HANDSHAKE_MAX_ENVELOPE_BYTES);
    const full = worldDecoder();
    full.dec.push(bytes);
    expect(full.msgs).toEqual([{ type: "hello", token, gatewayId: 7 }]);
  });

  test("token이 255바이트를 넘으면 RangeError(기록 전 검사 — writer 상태 불변)", () => {
    const w = new GatewayIpcWriter();
    expect(() => w.hello({ gatewayId: 1, incarnation: 1, pid: 1, token: "x".repeat(IPC_TOKEN_MAX_BYTES + 1) })).toThrow(RangeError);
    expect(w.bufferedBytes).toBe(0);
  });

  test("HELLO 레이아웃 위반 — tokenLen 불일치·잘린 헤더는 malformed", () => {
    const base = Buffer.alloc(13);
    base.writeUInt16LE(IPC_VERSION, 0);
    base[12] = 4; // token 4바이트를 주장하지만 없다
    expect(errorKind(() => worldDecoder().dec.push(rawEnvelope(IPC_MSG.HELLO, base)))).toBe("malformed");
    const short = Buffer.alloc(12);
    short.writeUInt16LE(IPC_VERSION, 0);
    expect(errorKind(() => worldDecoder().dec.push(rawEnvelope(IPC_MSG.HELLO, short)))).toBe("malformed");
  });
});

describe("HELLO_NACK — 거절 사유를 끊기 전에", () => {
  test("사유 4종 왕복 — ipcVer는 월드 버전", () => {
    for (const reason of Object.values(HELLO_NACK_REASON)) {
      const w = new WorldIpcWriter();
      w.helloNack(reason);
      const { dec, msgs } = gatewayDecoder();
      dec.push(flushed(w));
      expect(msgs).toEqual([{ type: IPC_MSG.HELLO_NACK, ipcVer: IPC_VERSION, reason }]);
    }
  });

  test("버전이 달라도 읽는다(레이아웃 고정 — version 거절이 바로 그 경우), 받은 뒤 디코더는 멈춘다", () => {
    const nack = rawEnvelope(IPC_MSG.HELLO_NACK, [IPC_VERSION + 5, 0, HELLO_NACK_REASON.Version]);
    const ack = new WorldIpcWriter();
    ack.helloAck({ worldIncarnation: 1, connCap: 1 });
    const { dec, msgs } = gatewayDecoder();
    dec.push(Buffer.concat([nack, flushed(ack)]));
    expect(msgs).toEqual([{ type: IPC_MSG.HELLO_NACK, ipcVer: IPC_VERSION + 5, reason: HELLO_NACK_REASON.Version }]);
    dec.push(rawEnvelope(IPC_MSG.PONG, [1, 0, 0, 0]));
    expect(msgs.length).toBe(1);
    expect(dec.failed).toBe(false);
  });

  test("HELLO_ACK 뒤의 NACK은 duplicate_handshake, 월드 측이 받으면 wrong_direction, 사유·길이 위반은 malformed", () => {
    const ack = new WorldIpcWriter();
    ack.helloAck({ worldIncarnation: 1, connCap: 1 });
    const after = gatewayDecoder();
    after.dec.push(flushed(ack));
    const nack = rawEnvelope(IPC_MSG.HELLO_NACK, [IPC_VERSION, 0, HELLO_NACK_REASON.Fenced]);
    expect(errorKind(() => after.dec.push(nack))).toBe("duplicate_handshake");
    expect(errorKind(() => worldDecoder().dec.push(nack))).toBe("wrong_direction");
    expect(errorKind(() => gatewayDecoder().dec.push(rawEnvelope(IPC_MSG.HELLO_NACK, [IPC_VERSION, 0, 200])))).toBe("malformed");
    expect(errorKind(() => gatewayDecoder().dec.push(rawEnvelope(IPC_MSG.HELLO_NACK, [IPC_VERSION, 0])))).toBe("malformed");
  });

  test("writer는 모르는 사유를 거절한다", () => {
    const w = new WorldIpcWriter();
    expect(() => w.helloNack(9 as never)).toThrow(RangeError);
    expect(w.bufferedBytes).toBe(0);
  });
});

describe("핸드셰이크 전 봉투 상한 — 인증 전 상대는 큰 봉투를 쌓을 수 없다", () => {
  test("월드 측: HELLO 전 64 KiB 봉투 주장은 헤더 4바이트에서 envelope_too_large(본문을 기다리지 않음)", () => {
    expect(errorKind(() => worldDecoder().dec.push(lenHeader(64 * 1024)))).toBe("envelope_too_large");
    // 헤더가 청크 경계에 걸쳐 와도(링 경로) 같다.
    const { dec } = worldDecoder();
    dec.push(lenHeader(64 * 1024).subarray(0, 2));
    expect(errorKind(() => dec.push(lenHeader(64 * 1024).subarray(2)))).toBe("envelope_too_large");
    expect(dec.ringCapacity).toBeLessThanOrEqual(64 * 1024);
  });

  test("상한 정확히까지는 길이 검사를 통과한다(이후 레이아웃 검사가 판정)", () => {
    const payload = Buffer.alloc(IPC_HANDSHAKE_MAX_ENVELOPE_BYTES - 5);
    payload.writeUInt16LE(IPC_VERSION, 0);
    const { dec } = worldDecoder();
    expect(errorKind(() => dec.push(rawEnvelope(IPC_MSG.HELLO, payload)))).toBe("malformed");
    const over = worldDecoder();
    expect(errorKind(() => over.dec.push(lenHeader(IPC_HANDSHAKE_MAX_ENVELOPE_BYTES - 3)))).toBe("envelope_too_large");
  });

  test("게이트웨이 측도 같다 — HELLO_ACK 전 큰 봉투는 거절, 핸드셰이크 뒤에는 일반 상한(64 MiB)", () => {
    expect(errorKind(() => gatewayDecoder().dec.push(lenHeader(1024 * 1024)))).toBe("envelope_too_large");
    const w = new WorldIpcWriter();
    w.helloAck({ worldIncarnation: 1, connCap: 1 });
    w.deliver(1, Buffer.alloc(256 * 1024, 7));
    const { dec, msgs } = gatewayDecoder();
    const bytes = flushed(w);
    for (let off = 0; off < bytes.length; off += 4096) dec.push(bytes.subarray(off, off + 4096));
    expect(msgs.map((m) => m.type)).toEqual([IPC_MSG.HELLO_ACK, IPC_MSG.CONN_DELIVER]);
  });

  test("같은 청크의 HELLO 뒤 봉투는 일반 상한으로 판정된다(핸드셰이크 완료가 다음 봉투부터 적용)", () => {
    const w = new GatewayIpcWriter();
    w.hello({ gatewayId: 1, incarnation: 1, pid: 1 });
    w.frame(1, 0x0001, Buffer.alloc(8 * 1024, 1));
    const { dec, msgs } = worldDecoder();
    dec.push(flushed(w));
    expect(msgs.map((m) => m.type)).toEqual(["hello", IPC_MSG.CONN_FRAMES]);
  });
});
