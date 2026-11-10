// 테스트용 게이트웨이 끝(4단계 4.2b) — MemoryPipe 한쪽에 붙어 GatewayIpcWriter로 G→W 메시지를 보내고, 월드가 보낸 메시지를
// 게이트웨이 측 디코더로 기록한다(Buffer 필드는 복사). 실제 게이트웨이 코어(gateway/gatewayCore.ts)는 4.2c — 여기서는 월드
// 쪽 계약만 본다.

import { GatewayIpcWriter, createGatewaySideDecoder } from "../../../../server/src/cluster/ipcCodec";
import type { IpcPipe, PipeCloseReason } from "../../../../server/src/cluster/ipcPipe";
import {
  type ConnClosedReason,
  IPC_MSG,
  type ListenMode,
  type WorldToGatewayMsg,
} from "../../../../server/src/cluster/ipcSchema";
import type { LoginState } from "../../../../server/src/identity/loginFlow";
import { decodeAll, encodeBody } from "../../../helpers/wire";

export type Rec =
  | { t: "hello_ack"; ipcVer: number; worldIncarnation: number; connCap: number }
  | { t: "nack"; ipcVer: number; reason: number }
  | { t: "pong"; seq: number }
  | { t: "shutdown"; kickReason: number }
  /** ref: CONN_DELIVER_SHARED의 공유 참조 레코드(v5)였다 — bytes는 인라인 + 패치한 공유 프레임. */
  | { t: "deliver"; localId: number; bytes: Buffer; env: number; ref?: true }
  | { t: "state"; localId: number; state: LoginState }
  | { t: "close"; localId: number }
  | { t: "accepted"; localId: number; worldConnId: number }
  | { t: "admission"; busy: boolean }
  /** 공유 포트 리스너 양보 지시(v14). */
  | { t: "listen"; mode: ListenMode; seq: number }
  /** MULTICAST 레코드 1개를 수신자마다 1개로 펼친 것(v4) — 같은 봉투·같은 바이트. */
  | { t: "cast"; localId: number; bytes: Buffer; env: number }
  | { t: "flush" };

export interface ClientFrame {
  id: number;
  payload: unknown;
}

/** 클라 와이어 프레임 연접 → 프레임 목록(완성 프레임만 — 본문 디코드는 tests/helpers/wire.ts). */
export function decodeClientFrames(buf: Buffer): ClientFrame[] {
  return decodeAll(buf);
}

function toRec(m: WorldToGatewayMsg, env: number): Rec[] {
  switch (m.type) {
    case IPC_MSG.HELLO_ACK:
      return [{ t: "hello_ack", ipcVer: m.ipcVer, worldIncarnation: m.worldIncarnation, connCap: m.connCap }];
    case IPC_MSG.HELLO_NACK:
      return [{ t: "nack", ipcVer: m.ipcVer, reason: m.reason }];
    case IPC_MSG.PONG:
      return [{ t: "pong", seq: m.seq }];
    case IPC_MSG.SHUTDOWN:
      return [{ t: "shutdown", kickReason: m.kickReason }];
    case IPC_MSG.CONN_DELIVER:
      return m.deliveries.map((d) => ({ t: "deliver", localId: d.localId, bytes: Buffer.from(d.bytes), env }));
    case IPC_MSG.CONN_STATE:
      return [{ t: "state", localId: m.localId, state: m.state }];
    case IPC_MSG.CONN_CLOSE:
      return [{ t: "close", localId: m.localId }];
    case IPC_MSG.CONN_ACCEPTED:
      return [{ t: "accepted", localId: m.localId, worldConnId: m.worldConnId }];
    case IPC_MSG.ADMISSION:
      return [{ t: "admission", busy: m.busy }];
    case IPC_MSG.LISTEN:
      return [{ t: "listen", mode: m.mode, seq: m.seq }];
    case IPC_MSG.CONN_MULTICAST:
      return m.casts.flatMap((c) => {
        const bytes = Buffer.from(c.bytes);
        return [...c.localIds].map((localId) => ({ t: "cast" as const, localId, bytes, env }));
      });
    case IPC_MSG.CONN_FLUSH:
      return [{ t: "flush" }];
    case IPC_MSG.CONN_DELIVER_SHARED:
      // v5 — 연결 레코드마다 클라가 받을 바이트(인라인 + 패치한 DEF)로 펼친 deliver. 공유 참조였으면 ref: true.
      return m.deliveries.map((d) => {
        if (d.def === null) return { t: "deliver" as const, localId: d.localId, bytes: Buffer.from(d.bytes), env };
        const def = Buffer.from(d.def.bytes);
        def.writeUInt32LE(d.value, d.def.patchOff);
        return { t: "deliver" as const, localId: d.localId, bytes: Buffer.concat([d.bytes, def]), env, ref: true };
      });
  }
}

export class GatewaySide {
  readonly recs: Rec[] = [];
  readonly writer = new GatewayIpcWriter();
  /** 받은 봉투(메시지) 수 — CONN_DELIVER 봉투 1개 = 1. */
  envelopes = 0;
  closeReason: PipeCloseReason | null = null;
  readonly closed: Promise<PipeCloseReason>;

  constructor(readonly pipe: IpcPipe) {
    let resolve: (r: PipeCloseReason) => void = () => {};
    this.closed = new Promise((r) => {
      resolve = r;
    });
    const decoder = createGatewaySideDecoder((m) => {
      this.envelopes++;
      this.recs.push(...toRec(m, this.envelopes));
    });
    pipe.attach({
      data: (chunk) => decoder.push(chunk),
      close: (reason) => {
        this.closeReason = reason;
        resolve(reason);
      },
    });
  }

  flush(): boolean {
    return this.writer.flushTo(this.pipe);
  }

  hello(gatewayId: number, incarnation: number, pid = 4242, token?: string): this {
    this.writer.hello({ gatewayId, incarnation, pid, ...(token !== undefined ? { token } : {}) });
    return this;
  }

  open(localId: number, addr = "203.0.113.10"): this {
    this.writer.connOpen(localId, addr);
    return this;
  }

  /** 클라가 보낸 것과 같은 본문(바이너리 패킷은 생성 코덱, 그 외 JSON) — 깨진 본문은 rawFrame. */
  frame(localId: number, packetId: number, payload: object): this {
    this.writer.frame(localId, packetId, encodeBody(packetId, payload));
    return this;
  }

  rawFrame(localId: number, packetId: number, body: Buffer): this {
    this.writer.frame(localId, packetId, body);
    return this;
  }

  closedConn(localId: number, reason: ConnClosedReason): this {
    this.writer.connClosed(localId, reason);
    return this;
  }

  ping(seq: number): this {
    this.writer.ping(seq);
    return this;
  }

  /** 리슨 상태 보고(v14 LISTEN_REPORT) — 운영 게이트웨이는 긴급 송신, 시험은 배치 writer에 그대로. */
  listenReport(r: { shared: boolean; closed: boolean; listening: boolean; port: number; ackSeq: number }): this {
    this.writer.listenReport(r);
    return this;
  }

  /** 받은 LISTEN 지시(순서대로). */
  listens(): Array<{ mode: ListenMode; seq: number }> {
    return this.recs.flatMap((r) => (r.t === "listen" ? [{ mode: r.mode, seq: r.seq }] : []));
  }

  /** 압축 로그 — "deliver:<localId>", "cast:<localId>", "state:<localId>:<state>", "close:<localId>", "accepted:<localId>", "admission:busy|open", "flush", … */
  log(localId?: number): string[] {
    const out: string[] = [];
    for (const r of this.recs) {
      if (localId !== undefined && (!("localId" in r) || r.localId !== localId)) continue;
      if (r.t === "deliver" || r.t === "close" || r.t === "cast") out.push(`${r.t}:${r.localId}`);
      else if (r.t === "state") out.push(`state:${r.localId}:${r.state}`);
      else if (r.t === "accepted") out.push(`accepted:${r.localId}`);
      else if (r.t === "admission") out.push(`admission:${r.busy ? "busy" : "open"}`);
      else if (r.t === "listen") out.push(`listen:${r.mode}:${r.seq}`);
      else out.push(r.t);
    }
    return out;
  }

  /** localId로 전달된 클라 프레임(DELIVER·MULTICAST 바이트를 스트림 순서로 연접 → 디코드 — 게이트웨이가 클라에 쓰는 순서). */
  framesTo(localId: number): ClientFrame[] {
    return decodeClientFrames(this.bytesTo(localId));
  }

  /** localId로 전달된 클라 바이트(DELIVER·MULTICAST, 스트림 순서). */
  bytesTo(localId: number): Buffer {
    return Buffer.concat(
      this.recs.flatMap((r) => ((r.t === "deliver" || r.t === "cast") && r.localId === localId ? [r.bytes] : [])),
    );
  }

  accepted(localId: number): number | undefined {
    for (const r of this.recs) if (r.t === "accepted" && r.localId === localId) return r.worldConnId;
    return undefined;
  }
}

/** cond가 참이 될 때까지 이벤트 루프 턴을 돌린다(MemoryPipe 전달은 setImmediate). */
export async function until(cond: () => boolean, label = "condition", timeoutMs = 2000): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!cond()) {
    if (performance.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise<void>((r) => setImmediate(r));
  }
}

/** n개 이벤트 루프 턴. */
export async function turns(n = 5): Promise<void> {
  for (let i = 0; i < n; i++) await new Promise<void>((r) => setImmediate(r));
}
