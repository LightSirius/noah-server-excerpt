// 성능 3단계 슬라이스 5 — 팬아웃 1회 인코딩(SessionManager.sendMany / sendFrame).
//
// 종전 팬아웃(DAMAGE_EVENT·SKILL_EFFECT·ENTITY_META·MOVE_PATH·CHAT_BCAST)은 수신자마다 sendTo → writePacket으로
// 같은 페이로드를 다시 인코딩했다. sendMany는 첫 실수신자에서 1회 인코딩한 프레임을 모두에게 보낸다.
// 계약(= 같은 ids로 sendTo를 반복한 것과 같다): 수신자별 바이트·순서, 미인증 id 건너뜀, 중복 id는 중복 송신,
// netPacketsTx는 수신자마다 1회, 실수신자가 없으면 인코딩하지 않음. 코킹·즉시 경로 모두.

import { describe, expect, test } from "bun:test";
import { PlayerSession } from "../../../server/src/network/session";
import { SessionManager } from "../../../server/src/network/sessionManager";
import { writePacket } from "../../../server/src/network/packetWriter";
import { PACKET_ID } from "../../../server/src/net/codec.generated";
import { metrics, packetIdLabel } from "../../../server/src/obs/metrics";
import { tagPong } from "../../helpers/fillers";

interface Peer {
  session: PlayerSession;
  bytes: () => Buffer;
  writes: () => number;
  setCap: (n: number) => void;
}

/** write가 cap 바이트까지만 받는 소켓(기본 무제한) — 받은 바이트는 복사해 보관. */
function addPeer(mgr: SessionManager, playerId: number): Peer {
  const got: Buffer[] = [];
  let cap = Number.MAX_SAFE_INTEGER;
  const raw = {
    write(buf: Buffer): number {
      const n = Math.min(cap, buf.length);
      got.push(Buffer.from(buf.subarray(0, n)));
      cap -= n;
      return n;
    },
    end(): void {},
    remoteAddress: "127.0.0.1",
  };
  const session = new PlayerSession(raw as unknown as Bun.Socket<PlayerSession>, 5000 + playerId);
  session.playerId = playerId;
  mgr.addAuthenticated(session);
  return {
    session,
    bytes: () => Buffer.concat(got),
    writes: () => got.length,
    setCap: (n) => {
      cap = n;
    },
  };
}

const DMG = PACKET_ID.DAMAGE_EVENT;
const body = { attackerEntityId: 3, targetEntityId: 9, damage: 12, isCrit: false, isMiss: false };

/** damage 읽기를 세는 페이로드 — 바이너리 인코딩 1회는 각 필드를 정해진 횟수(크기 검사 + 쓰기)만큼 읽는다. */
function readCounting(src: typeof body): { payload: typeof body; reads: () => number } {
  let reads = 0;
  const payload = { ...src };
  Object.defineProperty(payload, "damage", {
    enumerable: true,
    get() {
      reads++;
      return src.damage;
    },
  });
  return { payload, reads: () => reads };
}

/** 인코딩 1회의 damage 읽기 수 — 실측(생성 코덱 내부 구조에 기대지 않는다). */
const READS_PER_ENCODE = (() => {
  const probe = readCounting(body);
  writePacket(DMG, probe.payload);
  return probe.reads();
})();

/** 인코딩 횟수 관측 — DAMAGE_EVENT는 B3b부터 바이너리라 종전 toJSON 계수 대신 필드 읽기 수 / 1회분. */
function countingPayload(src: typeof body): { payload: typeof body; encodes: () => number } {
  const c = readCounting(src);
  return { payload: c.payload, encodes: () => c.reads() / READS_PER_ENCODE };
}

describe("SessionManager.sendMany", () => {
  for (const corked of [false, true]) {
    test(`${corked ? "코킹" : "즉시"} — 수신자별 바이트 = sendTo 반복, 인코딩 1회, 미인증 건너뜀, 중복 id 중복 송신`, () => {
      const mgr = new SessionManager();
      const peers = [1, 2, 3].map((pid) => addPeer(mgr, pid));
      const ref = new SessionManager();
      const refPeers = [1, 2, 3].map((pid) => addPeer(ref, pid));
      const ids = [3, 404, 1, 3, 2];
      const { payload, encodes } = countingPayload(body);
      const run = (m: SessionManager, fn: () => void) => (corked ? m.withCork(fn) : fn());
      run(mgr, () => {
        mgr.sendTo(2, PACKET_ID.PING, { clientTimeMs: 1 });
        mgr.sendMany(ids, DMG, payload);
        mgr.sendTo(1, PACKET_ID.PONG, tagPong(1));
      });
      run(ref, () => {
        ref.sendTo(2, PACKET_ID.PING, { clientTimeMs: 1 });
        for (const id of ids) ref.sendTo(id, DMG, body);
        ref.sendTo(1, PACKET_ID.PONG, tagPong(1));
      });
      expect(encodes()).toBe(1);
      for (let i = 0; i < peers.length; i++) {
        expect(peers[i]!.bytes().equals(refPeers[i]!.bytes())).toBe(true);
        expect(peers[i]!.writes()).toBe(refPeers[i]!.writes());
      }
      expect(peers[2]!.bytes().equals(Buffer.concat([writePacket(DMG, body), writePacket(DMG, body)]))).toBe(true);
    });
  }

  test("실수신자가 없거나 빈 목록이면 인코딩하지 않는다", () => {
    const mgr = new SessionManager();
    const { payload, encodes } = countingPayload(body);
    mgr.sendMany([], DMG, payload);
    mgr.sendMany([7, 8], DMG, payload);
    expect(encodes()).toBe(0);
  });

  test("netPacketsTx는 수신자마다 1회(종료 중 세션 제외)", () => {
    const mgr = new SessionManager();
    const a = addPeer(mgr, 1);
    addPeer(mgr, 2);
    const c = addPeer(mgr, 3);
    c.session.socket.end();
    const label = { packet_id: packetIdLabel(DMG) };
    const before = metrics.netPacketsTx.value(label);
    mgr.sendMany([1, 2, 3, 1], DMG, body);
    mgr.withCork(() => mgr.sendMany([2, 3], DMG, body));
    expect(metrics.netPacketsTx.value(label) - before).toBe(4);
    expect(a.writes()).toBe(2);
  });

  test("즉시 경로 부분 쓰기 — 한 수신자의 꼬리 보관이 공유 프레임을 오염시키지 않는다", () => {
    const mgr = new SessionManager();
    const peers = [1, 2, 3].map((pid) => addPeer(mgr, pid));
    peers[0]!.setCap(4);
    const payloads = [body, { ...body, damage: 999, note: "두 번째 프레임" }];
    for (const p of payloads) mgr.sendMany([1, 2, 3], DMG, p);
    expect(peers[0]!.session.socket.pendingByteCount).toBeGreaterThan(0);
    peers[0]!.setCap(Number.MAX_SAFE_INTEGER);
    peers[0]!.session.socket.flush();
    const want = Buffer.concat(payloads.map((p) => writePacket(DMG, p)));
    for (const peer of peers) expect(peer.bytes().equals(want)).toBe(true);
  });
});

describe("SessionManager.sendFrame", () => {
  for (const corked of [false, true]) {
    test(`${corked ? "코킹" : "즉시"} — 미리 인코딩한 프레임 = sendTo 바이트, 미인증 id는 무시`, () => {
      const mgr = new SessionManager();
      const a = addPeer(mgr, 1);
      const frame = writePacket(PACKET_ID.ENTITY_SPAWN, {
        entityId: 5, type: "monster", x: 1, y: 2, name: "슬라임", level: 1, hp: 10, hpMax: 10, itemId: 0, qty: 0, npcId: 0, monsterDefId: 1,
      });
      const go = () => {
        mgr.sendFrame(1, PACKET_ID.ENTITY_SPAWN, frame);
        mgr.sendFrame(99, PACKET_ID.ENTITY_SPAWN, frame);
        mgr.sendTo(1, PACKET_ID.PING, { clientTimeMs: 1 });
        mgr.sendFrame(1, PACKET_ID.ENTITY_SPAWN, frame);
      };
      if (corked) mgr.withCork(go);
      else go();
      const want = Buffer.concat([frame, writePacket(PACKET_ID.PING, { clientTimeMs: 1 }), frame]);
      expect(a.bytes().equals(want)).toBe(true);
      expect(a.writes()).toBe(corked ? 1 : 3);
    });
  }
});
