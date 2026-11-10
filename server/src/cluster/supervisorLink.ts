// 종료 트리거 배선 — 성능 4단계 4.3a. monolith·world(worldMain)·gateway(gatewayMain)·슈퍼바이저(launch)가 같은 함수로 시그널과
// 슈퍼바이저 메시지를 종료 함수에 잇는다.
//   - SIGTERM → 종료(항상).
//   - SIGINT  → 비감독이면 종료(종전 monolith). 감독 중이면 무시 — 터미널 Ctrl+C는 포그라운드 프로세스 그룹 전체(Linux)·같은
//               콘솔 전체(Windows)에 가므로, 자식이 각자 끝내면 슈퍼바이저의 종료 순서(월드 먼저 — 최종 저장·SHUTDOWN 뒤 게이트웨이)가
//               깨진다.
//   - 감독 IPC 메시지 {type:"shutdown"} → 종료. Windows는 시그널로 우아한 종료를 시킬 수 없다(Bun kill = TerminateProcess) — 이
//               메시지가 양 OS 공통 경로다.
//   - 감독 IPC 끊김(disconnect) → 종료. 슈퍼바이저가 죽었다(Linux — 자식이 고아로 남지 않게 스스로 우아하게 끝낸다). Windows는
//               부모가 죽으면 Bun이 자식도 정리 없이 끝낸다(1.3.13·1.4.3 실측 — disconnect 핸들러가 돌지 않는다).
// 감독 = CLUSTER_SUPERVISED=1(슈퍼바이저가 자식 env에 넣는다) + 부모 IPC 채널(Bun.spawn ipc). 채널이 없으면 비감독으로 동작한다.
// 트리거마다 onShutdown을 부른다(중복 억제는 호출자 몫 — 슈퍼바이저는 두 번째 신호를 강제 종료로 쓴다).

import { createLogger } from "../obs/logger";

const log = createLogger("supervisor.link");

export type ShutdownTrigger = "SIGINT" | "SIGTERM" | "supervisor" | "supervisor_lost";

/** 슈퍼바이저 → 자식 우아한 종료 지시(Bun IPC, serialization json). */
export const SUPERVISOR_SHUTDOWN_MSG = { type: "shutdown" } as const;

export function isShutdownMessage(m: unknown): boolean {
  return typeof m === "object" && m !== null && (m as { type?: unknown }).type === SUPERVISOR_SHUTDOWN_MSG.type;
}

/** 트리거 원천 — 기본은 이 프로세스(process 시그널·부모 IPC), 테스트는 가짜. */
export interface TriggerSource {
  onSignal(sig: "SIGINT" | "SIGTERM", fn: () => void): void;
  /** 부모 IPC 채널이 있으면 메시지·끊김을 구독하고 true, 없으면 false. */
  onSupervisor(onMessage: (m: unknown) => void, onDisconnect: () => void): boolean;
}

export const processTriggerSource: TriggerSource = {
  onSignal(sig, fn) {
    process.on(sig, fn);
  },
  onSupervisor(onMessage, onDisconnect) {
    if (typeof process.send !== "function") return false;
    process.on("message", onMessage);
    process.on("disconnect", onDisconnect);
    return true;
  },
};

export interface ShutdownTriggerOptions {
  /** env CLUSTER_SUPERVISED === "1". */
  readonly supervised: boolean;
  readonly source?: TriggerSource;
}

/** 트리거 배선. 반환 = 감독 모드로 걸렸나(감독 요청 + 부모 IPC 채널). */
export function installShutdownTriggers(
  onShutdown: (trigger: ShutdownTrigger) => void,
  opts: ShutdownTriggerOptions,
): boolean {
  const source = opts.source ?? processTriggerSource;
  const linked =
    opts.supervised &&
    source.onSupervisor(
      (m) => {
        if (isShutdownMessage(m)) onShutdown("supervisor");
      },
      () => onShutdown("supervisor_lost"),
    );
  if (opts.supervised && !linked) {
    log.warn({}, "CLUSTER_SUPERVISED=1 without a parent IPC channel — handling SIGINT locally");
  }
  source.onSignal("SIGTERM", () => onShutdown("SIGTERM"));
  source.onSignal("SIGINT", () => {
    if (linked) log.info({}, "SIGINT ignored — the supervisor orders shutdown");
    else onShutdown("SIGINT");
  });
  return linked;
}
