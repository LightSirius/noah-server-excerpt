// 성능 4단계 4.2b — 월드 쪽 게이트웨이 피어(GatewayPeer): 게이트웨이 1개분 송신 배치·연결 표·생존 상태.
//
// 계약:
//   - 배치: 연속 DELIVER는 봉투 1개를 공유하고, 비배치 메시지(STATE·CLOSE·ACCEPTED·PONG)가 열린 봉투를 닫는다 — 게이트웨이가
//     받는 연결별 순서 = 월드 발행 순서(ipcCodec 순서 규칙). flush 전에는 파이프에 아무것도 쓰지 않는다.
//   - dirty 통지: flush 이후 첫 기록에서 1회(onDirty — 월드 IPC 서버가 tick 끝·턴 끝 flush에 등록).
//   - 버퍼가 flushAtBytes 이상이면 턴 끝을 기다리지 않고 즉시 파이프로(대량 팬아웃의 월드 메모리 상한).
//   - CONN_OPEN localId는 단조 증가(재사용·역행 = 프로토콜 위반).
//   - kill: 이후 기록 거절, 파이프 즉시 닫기, 연결 목록을 비워 반환(1회만 — 두 번째는 null).

import { describe, expect, test } from "bun:test";
import { GatewayPeer } from "../../../server/src/cluster/gatewayPeer";
import { createMemoryPipePair } from "../../../server/src/cluster/ipcPipe";
import { GatewayIpcWriter, createWorldSideDecoder } from "../../../server/src/cluster/ipcCodec";
import { IPC_VERSION } from "../../../server/src/cluster/ipcSchema";
import { KICK_REASON } from "../../../server/src/identity/loginFlow";
import { metrics } from "../../../server/src/obs/metrics";
import type { PlayerSession } from "../../../server/src/network/session";
import { GatewaySide, until } from "./helpers/gatewaySide";

function makePeer(opts: { flushAtBytes?: number } = {}) {
  const [worldEnd, gwEnd] = createMemoryPipePair();
  const gw = new GatewaySide(gwEnd);
  const decoded: unknown[] = [];
  const decoder = createWorldSideDecoder((m) => void decoded.push(m));
  worldEnd.attach({ data: (c) => decoder.push(c), close: () => {} });
  const dirty: GatewayPeer[] = [];
  const peer = new GatewayPeer({ gatewayId: 3, incarnation: 77, pid: 9 }, worldEnd, decoder, {
    onDirty: (p) => void dirty.push(p),
    ...(opts.flushAtBytes !== undefined ? { flushAtBytes: opts.flushAtBytes } : {}),
  });
  return { peer, gw, worldEnd, decoder, decoded, dirty };
}

const bytes = (s: string) => Buffer.from(s, "utf8");

describe("GatewayPeer — 배치·순서", () => {
  test("연속 DELIVER는 봉투 1개, STATE·CLOSE가 봉투를 닫는다 — 게이트웨이 수신 순서 = 발행 순서", async () => {
    const { peer, gw } = makePeer();
    peer.helloAck(5, 2000);
    peer.deliver(1, bytes("A"));
    peer.deliver(2, bytes("B"));
    peer.connState(1, "AUTHENTICATED");
    peer.deliver(1, bytes("C"));
    peer.connAccepted(4, 99);
    peer.connClose(1);
    peer.pong(12);
    expect(gw.recs).toEqual([]);
    expect(peer.flush()).toBe(true);
    await until(() => gw.recs.length === 8, "8 records");
    expect(gw.log()).toEqual([
      "hello_ack",
      "deliver:1",
      "deliver:2",
      "state:1:AUTHENTICATED",
      "deliver:1",
      "accepted:4",
      "close:1",
      "pong",
    ]);
    const envOf = gw.recs.flatMap((r) => (r.t === "deliver" ? [r.env] : []));
    expect(envOf[0]).toBe(envOf[1]); // A·B 같은 봉투
    expect(envOf[2]).not.toBe(envOf[1]);
    expect(gw.recs[0]).toEqual({ t: "hello_ack", ipcVer: IPC_VERSION, worldIncarnation: 5, connCap: 2000 });
    expect(gw.recs.find((r) => r.t === "accepted")).toEqual({ t: "accepted", localId: 4, worldConnId: 99 });
    expect(gw.recs.at(-1)).toEqual({ t: "pong", seq: 12 });
  });

  test("dirty 통지는 flush 이후 첫 기록에서 1회 — flush 뒤 다시 기록하면 다시 1회", () => {
    const { peer, dirty } = makePeer();
    peer.helloAck(1, 1);
    peer.deliver(1, bytes("x"));
    peer.connState(1, "HELLO_RECV");
    expect(dirty.length).toBe(1);
    peer.flush();
    peer.flush(); // 빈 flush는 무동작
    peer.deliver(1, bytes("y"));
    expect(dirty.length).toBe(2);
  });

  test("버퍼가 flushAtBytes 이상이면 즉시 파이프로(턴 끝 대기 없음), 바이트는 순서대로", async () => {
    const { peer, gw, worldEnd } = makePeer({ flushAtBytes: 4096 });
    peer.helloAck(1, 1);
    const chunk = Buffer.alloc(1500, 7);
    for (let i = 0; i < 6; i++) peer.deliver(1, chunk);
    expect(worldEnd.stats.writes).toBeGreaterThanOrEqual(1);
    expect(peer.bufferedBytes).toBeLessThan(4096);
    peer.flush();
    await until(() => gw.recs.filter((r) => r.t === "deliver").length === 6, "6 delivers");
    expect(Buffer.concat(gw.recs.flatMap((r) => (r.t === "deliver" ? [r.bytes] : []))).length).toBe(9000);
  });

  test("tx 바이트 메트릭 — flush한 봉투 바이트만큼", () => {
    const { peer } = makePeer();
    const before = metrics.ipcTxBytes.value();
    peer.helloAck(1, 1); // 4 + 1 + 10
    peer.flush();
    expect(metrics.ipcTxBytes.value() - before).toBe(15);
  });
});

describe("GatewayPeer — 생존·연결 표", () => {
  test("localId는 단조 증가만 — 재사용·역행은 false", () => {
    const { peer } = makePeer();
    expect(peer.admitLocalId(1)).toBe(true);
    expect(peer.admitLocalId(5)).toBe(true);
    expect(peer.admitLocalId(5)).toBe(false);
    expect(peer.admitLocalId(3)).toBe(false);
    expect(peer.admitLocalId(6)).toBe(true);
  });

  test("kill — 연결 목록을 비워 반환하고 파이프를 닫는다, 이후 기록 거절·두 번째 kill은 null", async () => {
    const { peer, gw, worldEnd, decoder, decoded } = makePeer();
    const s1 = { connId: 1 } as PlayerSession;
    const s2 = { connId: 2 } as PlayerSession;
    peer.conns.set(10, s1);
    peer.conns.set(11, s2);
    expect(peer.alive).toBe(true);
    expect(peer.kill("local")).toEqual([s1, s2]);
    expect(peer.conns.size).toBe(0);
    expect(peer.alive).toBe(false);
    expect(worldEnd.closed).toBe(true);
    // 디코더 정지 — 이후 도착한 봉투(같은 청크의 나머지 포함)는 내보내지 않는다.
    const hello = new GatewayIpcWriter();
    hello.hello({ gatewayId: 3, incarnation: 77, pid: 9 });
    hello.flushTo({
      write: (b) => {
        decoder.push(b);
        return true;
      },
    });
    expect(decoded).toEqual([]);
    expect(peer.deliver(10, bytes("late"))).toBe(false);
    peer.connState(10, "IN_WORLD");
    peer.connClose(10);
    peer.shutdown(KICK_REASON.ServerShutdown);
    expect(peer.flush()).toBe(false);
    expect(peer.kill("local")).toBeNull();
    await gw.closed;
  });

  test("파이프가 먼저 닫히면(상대 끊김·backpressure) alive=false — deliver false", async () => {
    const { peer, gw } = makePeer();
    gw.pipe.destroy();
    await until(() => !peer.alive, "peer not alive");
    expect(peer.deliver(1, bytes("x"))).toBe(false);
  });
});
