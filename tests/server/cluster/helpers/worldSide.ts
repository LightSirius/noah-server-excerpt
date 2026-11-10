// 테스트용 월드 끝(4단계 4.2c) — MemoryPipe 한쪽에 붙어 WorldIpcWriter로 W→G 메시지를 보내고, 게이트웨이가 보낸 메시지를
// 월드 측 디코더로 기록한다(Buffer 필드는 복사). 실제 월드(cluster/worldIpcServer.ts)와 무관하게 게이트웨이 코어의 계약만 본다
// (4.2b helpers/gatewaySide.ts의 거울).

import { WorldIpcWriter, createWorldSideDecoder } from "../../../../server/src/cluster/ipcCodec";
import type { IpcPipe, IpcPipeHandlers, PipeCloseReason } from "../../../../server/src/cluster/ipcPipe";
import { type GatewayToWorldMsg, type HelloNackReason, IPC_MSG, type ListenMode } from "../../../../server/src/cluster/ipcSchema";
import type { LoginState } from "../../../../server/src/identity/loginFlow";
import type { SharedFrame } from "../../../../server/src/net/sharedFrame";
import { encodeBody } from "../../../helpers/wire";

/** 게이트웨이가 넘긴 프레임 기록 키 — `<packetId>:<원시 본문 hex>`(바이너리·JSON 본문 공통). */
export function frameKeyOfBody(packetId: number, body: Uint8Array): string {
  return `${packetId}:${Buffer.from(body).toString("hex")}`;
}

/** 페이로드를 클라 와이어 본문(바이너리 패킷은 생성 코덱, 그 외 JSON)으로 인코딩한 기록 키 — framesOf 기대값. */
export function frameKey(packetId: number, payload: object): string {
  return frameKeyOfBody(packetId, encodeBody(packetId, payload));
}

export type GwRec =
  | { t: "hello"; gatewayId: number; incarnation: number; pid: number; token: string }
  | { t: "ping"; seq: number }
  | { t: "bye"; reason: number }
  | { t: "open"; localId: number; addr: string }
  | { t: "frame"; localId: number; packetId: number; body: Buffer; env: number }
  | { t: "closed"; localId: number; reason: number }
  /** 리슨 상태 보고(v14 — 공유 포트 리스너 양보). */
  | { t: "listen_report"; shared: boolean; closed: boolean; listening: boolean; port: number; ackSeq: number };

function toRecs(m: GatewayToWorldMsg, env: number): GwRec[] {
  switch (m.type) {
    case IPC_MSG.HELLO:
      return [{ t: "hello", gatewayId: m.gatewayId, incarnation: m.incarnation, pid: m.pid, token: m.token.toString("utf8") }];
    case IPC_MSG.PING:
      return [{ t: "ping", seq: m.seq }];
    case IPC_MSG.BYE:
      return [{ t: "bye", reason: m.reason }];
    case IPC_MSG.CONN_OPEN:
      return [{ t: "open", localId: m.localId, addr: m.addr }];
    case IPC_MSG.CONN_FRAMES:
      return m.frames.map((f) => ({
        t: "frame" as const,
        localId: f.localId,
        packetId: f.packetId,
        body: Buffer.from(f.body),
        env,
      }));
    case IPC_MSG.CONN_CLOSED:
      return [{ t: "closed", localId: m.localId, reason: m.reason }];
    case IPC_MSG.LISTEN_REPORT:
      return [{ t: "listen_report", shared: m.shared, closed: m.closed, listening: m.listening, port: m.port, ackSeq: m.ackSeq }];
  }
}

export class WorldSide {
  readonly recs: GwRec[] = [];
  readonly writer = new WorldIpcWriter();
  /** 받은 봉투(메시지) 수 — CONN_FRAMES 봉투 1개 = 1. */
  envelopes = 0;
  closeReason: PipeCloseReason | null = null;
  readonly closed: Promise<PipeCloseReason>;

  /** 파이프 핸들러 — attach=false로 만들었으면 호출자가 붙인다(listenIpc의 onAccept 반환값). */
  readonly handlers: IpcPipeHandlers;

  constructor(
    readonly pipe: IpcPipe,
    attach = true,
  ) {
    let resolve: (r: PipeCloseReason) => void = () => {};
    this.closed = new Promise((r) => {
      resolve = r;
    });
    const decoder = createWorldSideDecoder((m) => {
      this.envelopes++;
      this.recs.push(...toRecs(m, this.envelopes));
    });
    this.handlers = {
      data: (chunk) => decoder.push(chunk),
      close: (reason) => {
        this.closeReason = reason;
        resolve(reason);
      },
    };
    if (attach) pipe.attach(this.handlers);
  }

  flush(): boolean {
    return this.writer.flushTo(this.pipe);
  }

  helloAck(worldIncarnation = 0x5eed, connCap = 1000): this {
    this.writer.helloAck({ worldIncarnation, connCap });
    return this;
  }

  /** HELLO 거절 — 실제 월드처럼 flush 뒤 호출자가 pipe.end()로 끊는다. */
  nack(reason: HelloNackReason): this {
    this.writer.helloNack(reason);
    return this;
  }

  deliver(localId: number, bytes: Buffer): this {
    this.writer.deliver(localId, bytes);
    return this;
  }

  /** CONN_MULTICAST 레코드 1개(v4). */
  multicast(bytes: Buffer, localIds: readonly number[]): this {
    const ids = Uint32Array.from(localIds);
    this.writer.multicast(bytes, ids, 0, ids.length);
    return this;
  }

  /** CONN_DELIVER_SHARED 참조 레코드 1개(v5) — inline 뒤 frame(patchOff에 value). 봉투에 처음이면 DEF가 앞에 붙는다. */
  shared(localId: number, inline: Buffer, frame: SharedFrame, value: number): this {
    this.writer.deliverShared(localId, inline, frame, value);
    return this;
  }

  /** CONN_FLUSH — flush 창의 끝(v4). */
  windowEnd(): this {
    this.writer.connFlush();
    return this;
  }

  state(localId: number, state: LoginState): this {
    this.writer.connState(localId, state);
    return this;
  }

  close(localId: number): this {
    this.writer.connClose(localId);
    return this;
  }

  accepted(localId: number, worldConnId: number): this {
    this.writer.connAccepted(localId, worldConnId);
    return this;
  }

  shutdown(kickReason: number): this {
    this.writer.shutdown(kickReason);
    return this;
  }

  /** 리스너 양보 지시(v14 LISTEN). */
  listen(mode: ListenMode, seq: number): this {
    this.writer.listen(mode, seq);
    return this;
  }

  /** 받은 LISTEN_REPORT(순서대로, 타입 태그 없이). */
  listenReports(): Array<{ shared: boolean; closed: boolean; listening: boolean; port: number; ackSeq: number }> {
    return this.recs.flatMap((r) => {
      if (r.t !== "listen_report") return [];
      const { t: _t, ...rest } = r;
      return [rest];
    });
  }

  pong(seq: number): this {
    this.writer.pong(seq);
    return this;
  }

  /** 압축 로그 — "open:<id>", "frame:<id>", "closed:<id>:<reason>", "hello", "ping", "bye:<reason>". */
  log(localId?: number): string[] {
    const out: string[] = [];
    for (const r of this.recs) {
      if (localId !== undefined && (!("localId" in r) || r.localId !== localId)) continue;
      if (r.t === "open" || r.t === "frame") out.push(`${r.t}:${r.localId}`);
      else if (r.t === "closed") out.push(`closed:${r.localId}:${r.reason}`);
      else if (r.t === "bye") out.push(`bye:${r.reason}`);
      else out.push(r.t);
    }
    return out;
  }

  /** localId가 보낸 프레임 — frameKeyOfBody(`<packetId>:<본문 hex>`). */
  framesOf(localId: number): string[] {
    return this.recs.flatMap((r) => (r.t === "frame" && r.localId === localId ? [frameKeyOfBody(r.packetId, r.body)] : []));
  }

  opened(localId: number): string | undefined {
    for (const r of this.recs) if (r.t === "open" && r.localId === localId) return r.addr;
    return undefined;
  }

  closedReason(localId: number): number | undefined {
    for (const r of this.recs) if (r.t === "closed" && r.localId === localId) return r.reason;
    return undefined;
  }
}
