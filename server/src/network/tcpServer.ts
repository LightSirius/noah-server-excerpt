// TCP 서버(monolith) — 클라 소켓 엣지(clientEdge)에 로컬 처리기를 꽂은 얇은 래퍼. dispatch는
// packetRouter.createRouter(ctx)가 반환한 함수를 인자로 받음 (DI).
//
// 성능 4단계(게이트웨이 분리) 4.1: 엣지 정책(accept·프레이밍·size/rate·idle·데드라인·킥)은 clientEdge.ts, 수용·종료는
// sessionLifecycle.ts, 본문 디코드·디스패치는 frameIngest.ts로 분리했다 — 4.2 게이트웨이가 같은 엣지를, 월드가 같은
// 수용·종료·디코드를 쓴다. 이 파일은 monolith 조립(연결 = PlayerSession, 처리 = 같은 프로세스의 라우터)과 종전 export
// (테스트·tools/perf가 쓰는 ingestChunk·releaseClosedSession·타입)만 남긴다. 동작·바이트는 분리 전과 같다.

import { PlayerSession } from "./session";
import type { Dispatch } from "./packetRouter";
import { sessionManager } from "./sessionManager";
import { createLogger } from "../obs/logger";
import type { OverloadView } from "../net/overloadSignal";
import { deferSends } from "./deferredSends";
import {
  type ClientEdgeOptions,
  type EdgeSink,
  type EdgeSocket,
  type FrameSink,
  type IngestPolicy,
  createClientEdge,
  ingestEdgeChunk,
} from "./clientEdge";
import { ingestFrame } from "./frameIngest";
import { acceptSession, closeSession } from "./sessionLifecycle";

export { DEFAULT_PRE_AUTH_DEADLINE_MS, type IngestPolicy } from "./clientEdge";

const log = createLogger("tcp");

export interface TcpServerOptions extends ClientEdgeOptions {
  /**
   * 과부하 신호(3단계 슬라이스 8, net/overloadSignal) — 과부하 중 IN_WORLD rate 위반은 연결별 면제 예산 안에서 strike
   * 미기록(예산을 넘긴 flood는 KICK), rejectsNewConnections()면 신규 접속을 KICK 9 "server busy"로 거절.
   * 미지정 = 종전 동작(항상 정상).
   */
  overload?: OverloadView;
}

/** 수신 경로가 쓰는 Bun.Socket 표면 — 테스트 fake도 구조적으로 만족. */
export type IngestSocket = EdgeSocket<PlayerSession>;

/** startTcpServer 반환 — 리스너 제어 + 이 리스너가 받은 직결 세션(우아한 종료의 KICK 6 대상 — gracefulShutdown.ts). */
export interface TcpServerHandle {
  readonly port: number;
  readonly hostname: string;
  /** 리스닝만 중지 — 기존 연결은 유지(우아한 종료 ①: 최종 저장 동안 새 클라를 받지 않는다). 이후 접속은 거부된다. idempotent. */
  stopListening(): void;
  /** 리스닝 중지 + closeActive면 남은 연결까지 강제 종료(테스트 정리). stopListening 뒤에도 부를 수 있다. */
  stop(closeActive?: boolean): void;
  /** 수용돼 아직 닫히지 않은 직결 세션(상태 무관 — 미인증 포함, 접속 제한·상한 거절 제외)의 스냅샷 배열. */
  sessions(): PlayerSession[];
}

export function startTcpServer(port: number, dispatch: Dispatch, opts: TcpServerOptions = {}): TcpServerHandle {
  const live = new Set<PlayerSession>();
  const server = Bun.listen<PlayerSession>({
    hostname: "0.0.0.0",
    port,
    socket: createClientEdge(localSink(localFrameSink(dispatch), opts.overload, live), opts),
  });
  log.info({ host: server.hostname, port: server.port }, "tcp listening");
  return {
    port: server.port,
    hostname: server.hostname,
    stopListening: () => server.stop(false),
    stop: (closeActive) => server.stop(closeActive),
    sessions: () => [...live],
  };
}

/** monolith 클라 소켓 콜백 묶음(startTcpServer가 Bun.listen에 꽂는 것과 같은 엣지 — 직결 세션 추적만 없다). */
export function localEdgeHandlers(dispatch: Dispatch, opts: TcpServerOptions = {}): Bun.SocketHandler<PlayerSession> {
  return localEdgeHandlersWithFrames(localFrameSink(dispatch), opts);
}

/**
 * 프레임 단계만 바꾼 monolith 콜백 묶음 — 4.2c 엣지 패리티 테스트(tests/server/cluster/clientEdgeParity.test.ts)가 게이트웨이 코어의
 * 엣지와 같은 바이트 스트림으로 비교하려고 export. 게이트웨이가 월드로 원시 전달하는 지점과 같은 경계(사전 판정·디코드 전)에서 프레임을 본다.
 */
export function localEdgeHandlersWithFrames(
  frames: FrameSink<PlayerSession>,
  opts: TcpServerOptions = {},
): Bun.SocketHandler<PlayerSession> {
  return createClientEdge(localSink(frames, opts.overload), opts);
}

/**
 * monolith 처리기 — 연결 = PlayerSession, 수용·종료 = sessionLifecycle, 프레임 = frames(운영 = localFrameSink — 같은 프로세스의 사전 판정·디코드·디스패치).
 * live: 수용된 세션을 close까지 담는다(startTcpServer — 우아한 종료 대상). 거절된 연결은 담지 않는다(이미 KICK 9·종료 중).
 */
function localSink(
  frames: FrameSink<PlayerSession>,
  overload: OverloadView | undefined,
  live?: Set<PlayerSession>,
): EdgeSink<PlayerSession> {
  return {
    create: (socket) => new PlayerSession(socket, sessionManager.nextConnId()),
    admit: (session) => {
      const ok = acceptSession(session, overload);
      if (ok) live?.add(session);
      return ok;
    },
    closed: (session) => {
      live?.delete(session);
      return closeSession(session);
    },
    frame: frames.frame,
    scope: frames.scope,
  };
}

/**
 * dispatch별 프레임 처리기 — 청크마다 클로저를 만들지 않게 직전 dispatch의 처리기를 재사용한다(테스트·tools/perf 진입점
 * ingestChunk는 보통 같은 dispatch로 반복 호출 — WeakMap 조회 ≈15 ns/청크도 피한다). 운영 data 콜백은 startTcpServer가
 * 만든 처리기를 직접 쓴다.
 */
let lastDispatch: Dispatch | null = null;
let lastFrameSink: FrameSink<PlayerSession> | null = null;

function localFrameSink(dispatch: Dispatch): FrameSink<PlayerSession> {
  if (dispatch === lastDispatch && lastFrameSink !== null) return lastFrameSink;
  const sink: FrameSink<PlayerSession> = {
    frame: (session, packetId, body) => ingestFrame(session, packetId, body, dispatch),
    // 성능 3단계 슬라이스 6: 디스패치(핸들러 동기 구간·킥)의 송신은 턴 끝에 세션당 1회 write(deferredSends.ts).
    scope: deferSends,
  };
  lastDispatch = dispatch;
  lastFrameSink = sink;
  return sink;
}

/**
 * 수신 청크 1개(monolith data 콜백 본체와 같은 경로) — 테스트·tools/perf 진입점. 엣지 게이트(size → rate → idle 창)를
 * 통과한 프레임을 디코드·디스패치한다. 바이트는 setImmediate 1턴 뒤 flush된다(deferredSends.ts).
 */
export function ingestChunk(socket: IngestSocket, chunk: Uint8Array, dispatch: Dispatch, policy: IngestPolicy): void {
  ingestEdgeChunk(socket, chunk, localFrameSink(dispatch), policy);
}

/**
 * close 콜백 본체(= sessionLifecycle.closeSession) — 종전 이름. 테스트가 재진입을 실물로 재현하려고 export.
 * 반환: 연결 회계에 있던 연결인가(거절된 연결은 false).
 */
export function releaseClosedSession(session: PlayerSession): boolean {
  return closeSession(session);
}
