// 팬아웃 MULTICAST 묶음(성능 4.5 F2) — sessionManager.sendMany가 같은 프레임의 원격 링크 수신자를 게이트웨이 피어(CastSink)별로 모아
// 레코드 1개(CONN_MULTICAST)로 보낸다. 종전에는 수신자마다 프레임을 outbox에 복사하고 flush 때 DELIVER 레코드로 한 번 더 복사했다.
//
// 규칙:
//   - 자격: PlayerSession.castRoute()가 경로를 준 수신자만(원격 링크·종료 중 아님·outbox 빔 — 연결별 순서 규칙). 나머지는 호출자가
//     연결별 경로(writeOrEnqueue)로 보낸다.
//   - 싱크별 수신자 2명 이상이면 sink.multicast — 싱크가 거절하면(유실·바이트가 줄지 않음·봉투 상한) 그 묶음은 연결별 경로로 폴백한다.
//     1명이면 연결별 경로(레코드 대신 그 연결의 outbox·DELIVER에 합류).
//   - 집계: 수락된 MULTICAST는 수신자 수만큼 netPacketsTx(연결별 경로와 같은 수). 폴백은 연결별 경로가 센다.
//   - 묶음 사이 순서: 한 sendMany 안에서 각 연결은 이 프레임 1건(중복 id면 그 수)만 받으므로 싱크·연결 간 순서는 무관하다.
// 메모리: 싱크 수(게이트웨이 수)만큼 묶음을 재사용한다. flush 뒤 세션 칸은 비운다(닫힌 세션을 붙잡지 않는다).

import type { CastRoute, CastSink } from "./clientLink";
import { countTxPackets, type PlayerSession } from "./session";

const INITIAL_IDS = 64;

interface CastGroup {
  sink: CastSink | null;
  ids: Uint32Array;
  sessions: (PlayerSession | null)[];
  count: number;
}

export class CastFanout {
  private readonly groups: CastGroup[] = [];
  private used = 0;
  private flushing = false;

  /** flush 중인가 — 중첩 sendMany(재진입)는 새 묶음을 쓴다. */
  get busy(): boolean {
    return this.flushing;
  }

  get pending(): boolean {
    return this.used > 0;
  }

  add(route: CastRoute, session: PlayerSession): void {
    const g = this.groupOf(route.sink);
    if (g.count === g.ids.length) {
      const next = new Uint32Array(g.ids.length * 2);
      next.set(g.ids);
      g.ids = next;
    }
    g.ids[g.count] = route.localId;
    g.sessions[g.count] = session;
    g.count++;
  }

  /** 모은 묶음을 보내고 비운다 — 싱크별 2명 이상은 MULTICAST, 나머지·거절은 연결별 경로. frame은 이 호출 동안만 읽는다. */
  flush(packetId: number, frame: Buffer): void {
    const n = this.used;
    this.used = 0;
    this.flushing = true;
    try {
      for (let i = 0; i < n; i++) flushGroup(this.groups[i]!, packetId, frame);
    } finally {
      this.flushing = false;
    }
  }

  private groupOf(sink: CastSink): CastGroup {
    for (let i = 0; i < this.used; i++) {
      const g = this.groups[i]!;
      if (g.sink === sink) return g;
    }
    let g = this.groups[this.used];
    if (g === undefined) {
      g = { sink: null, ids: new Uint32Array(INITIAL_IDS), sessions: [], count: 0 };
      this.groups.push(g);
    }
    g.sink = sink;
    g.count = 0; // 예외로 끊긴 지난 flush의 잔여를 버린다(세션 칸은 덮어쓴다).
    this.used++;
    return g;
  }
}

function flushGroup(g: CastGroup, packetId: number, frame: Buffer): void {
  const count = g.count;
  const sink = g.sink!;
  g.count = 0;
  g.sink = null;
  if (count >= 2 && sink.multicast(frame, g.ids, count)) {
    countTxPackets(packetId, count);
    g.sessions.fill(null, 0, count);
    return;
  }
  for (let i = 0; i < count; i++) {
    const s = g.sessions[i]!;
    g.sessions[i] = null;
    s.writeOrEnqueue(packetId, frame);
  }
}
