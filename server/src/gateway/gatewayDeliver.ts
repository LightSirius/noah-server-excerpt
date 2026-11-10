// 게이트웨이 월드 → 클라 전달 — 성능 4단계 4.2c·4.5 F2/F3(4.5 리뷰에서 gatewayCore에서 분리). 코어가 디코드한 전달 메시지를 연결 표(코어
// 소유 — 읽기만)의 GatewayConn에 낸다. 미추적 localId는 stale(mmorpg_gw_stale_records_total{type="deliver"|"multicast"}).
//   CONN_DELIVER        → 연결의 로컬 OutboundLink(부분 쓰기 꼬리·drain, 꼬리 상한 초과면 종료 → CONN_CLOSED backlog).
//   CONN_DELIVER_SHARED → CONN은 DELIVER, CONN_REF는 DEF 뷰를 그 연결의 u32로 제자리 패치해 인라인 뒤에 write 1회(레코드를 하나씩 끝까지
//                         쓰고 다음 패치 — 링크는 못 보낸 꼬리를 복사하므로 연결 간 오염 없음).
//   CONN_MULTICAST      → 프레임을 레코드당 1회 복사(디코더 콜백 밖까지 산다 — 수신자끼리 공유)해 수신 연결마다 미룬다
//                         (GatewayConn.deferCast — 그 연결의 다음 DELIVER와 합쳐 write 1회).
//   CONN_FLUSH(창 끝)   → 미룬 바이트가 남은 연결을 전부 쓴다. 종료·킥은 미룬 바이트를 먼저 쓴다(GatewayConn).
// 핫패스 — 연결마다 클로저·라벨 키를 만들지 않는다. 봉투 1개 처리 시간 = 게이트웨이 송출 비용(mmorpg_gw_deliver_batch_ms).

import { metrics } from "../obs/metrics";
import type { ConnCast, ConnDeliverSharedMsg, ConnDelivery } from "../cluster/ipcSchema";
import type { GatewayConn } from "./gatewayConn";

const deliverRecords = metrics.gwDeliverRecords.bind(undefined);
const staleDeliver = metrics.gwStaleRecords.bind({ type: "deliver" });
const staleCast = metrics.gwStaleRecords.bind({ type: "multicast" });
const castRecords = metrics.gwMulticastRecords.bind(undefined);
const castRecipients = metrics.gwMulticastRecipients.bind(undefined);
const sharedRefs = metrics.gwSharedRefs.bind(undefined);
const sharedDefs = metrics.gwSharedDefs.bind(undefined);

export class GatewayDelivery {
  /** 이번 flush 창에 MULTICAST 바이트를 미뤄 둔 연결 — CONN_FLUSH가 쓴다(연결당 1회 — GatewayConn.castQueued). */
  private readonly castQueue: GatewayConn[] = [];

  /** conns = 코어의 연결 표(읽기만), now = 관측 시계(ms). */
  constructor(
    private readonly conns: ReadonlyMap<number, GatewayConn>,
    private readonly now: () => number,
  ) {}

  /** CONN_DELIVER. */
  deliver(deliveries: readonly ConnDelivery[]): void {
    const t0 = this.now();
    for (let i = 0; i < deliveries.length; i++) {
      const d = deliveries[i]!;
      const conn = this.conns.get(d.localId);
      if (conn === undefined) staleDeliver.inc();
      else conn.deliver(d.bytes);
    }
    metrics.gwDeliverBatchMs.observe(this.now() - t0);
    deliverRecords.inc(deliveries.length);
  }

  /** CONN_DELIVER_SHARED(성능 4.5 F3). */
  deliverShared(msg: ConnDeliverSharedMsg): void {
    const t0 = this.now();
    const list = msg.deliveries;
    let refs = 0;
    for (let i = 0; i < list.length; i++) {
      const d = list[i]!;
      const conn = this.conns.get(d.localId);
      if (conn === undefined) staleDeliver.inc();
      else if (d.def === null) conn.deliver(d.bytes);
      else {
        d.def.bytes.writeUInt32LE(d.value, d.def.patchOff);
        conn.deliverShared(d.bytes, d.def.bytes);
        refs++;
      }
    }
    metrics.gwDeliverBatchMs.observe(this.now() - t0);
    deliverRecords.inc(list.length);
    sharedRefs.inc(refs);
    sharedDefs.inc(msg.defCount);
  }

  /** CONN_MULTICAST(성능 4.5 F2) — 종료 중 링크는 GatewayConn이 버린다. */
  multicast(casts: readonly ConnCast[]): void {
    for (let i = 0; i < casts.length; i++) {
      const c = casts[i]!;
      const frame = Buffer.from(c.bytes);
      const ids = c.localIds;
      for (let j = 0; j < ids.length; j++) {
        const conn = this.conns.get(ids[j]!);
        if (conn === undefined) staleCast.inc();
        else if (conn.deferCast(frame)) this.castQueue.push(conn);
      }
      castRecipients.inc(ids.length);
    }
    castRecords.inc(casts.length);
  }

  /** CONN_FLUSH(창 끝) — 미룬 바이트가 남은 연결을 전부 쓴다(같은 창의 DELIVER로 이미 나간 연결은 무동작). */
  flushCasts(): void {
    const q = this.castQueue;
    for (let i = 0; i < q.length; i++) q[i]!.flushQueuedCast();
    q.length = 0;
  }

  /** 월드 유실 — 미룬 목록을 버린다(연결은 코어의 전원 킥이 미룬 바이트를 먼저 쓰고 닫는다). */
  clear(): void {
    this.castQueue.length = 0;
  }
}
