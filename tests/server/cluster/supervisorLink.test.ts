// 성능 4단계 4.3a — 종료 트리거 배선(cluster/supervisorLink): monolith·world·gateway·launch가 같은 함수로 시그널·슈퍼바이저
// 메시지를 종료로 잇는다.
//   - 비감독: SIGINT·SIGTERM → 종료(종전 monolith 동작).
//   - 감독(CLUSTER_SUPERVISED=1 + 부모 IPC 채널): SIGINT는 무시(터미널 Ctrl+C가 프로세스 그룹 전체로 가도 종료 순서는
//     슈퍼바이저가 정한다), SIGTERM·{type:"shutdown"} 메시지 → 종료, IPC 끊김(슈퍼바이저 사망) → 종료(고아 방지).
//   - 감독을 요청했지만 IPC 채널이 없으면 비감독으로 동작(SIGINT 존중).

import { describe, expect, test } from "bun:test";
import {
  SUPERVISOR_SHUTDOWN_MSG,
  type ShutdownTrigger,
  type TriggerSource,
  installShutdownTriggers,
  isShutdownMessage,
} from "../../../server/src/cluster/supervisorLink";

class FakeSource implements TriggerSource {
  readonly signals = new Map<string, () => void>();
  onMessage: ((m: unknown) => void) | null = null;
  onDisconnect: (() => void) | null = null;

  constructor(private readonly hasChannel: boolean) {}

  onSignal(sig: "SIGINT" | "SIGTERM", fn: () => void): void {
    this.signals.set(sig, fn);
  }

  onSupervisor(onMessage: (m: unknown) => void, onDisconnect: () => void): boolean {
    if (!this.hasChannel) return false;
    this.onMessage = onMessage;
    this.onDisconnect = onDisconnect;
    return true;
  }

  raise(sig: "SIGINT" | "SIGTERM"): void {
    this.signals.get(sig)?.();
  }
}

function wire(supervised: boolean, hasChannel: boolean) {
  const source = new FakeSource(hasChannel);
  const fired: ShutdownTrigger[] = [];
  const linked = installShutdownTriggers((t) => fired.push(t), { supervised, source });
  return { source, fired, linked };
}

describe("installShutdownTriggers", () => {
  test("비감독 — SIGINT·SIGTERM 모두 종료, IPC 구독 없음", () => {
    const { source, fired, linked } = wire(false, true);
    expect(linked).toBe(false);
    expect(source.onMessage).toBeNull();
    source.raise("SIGINT");
    source.raise("SIGTERM");
    expect(fired).toEqual(["SIGINT", "SIGTERM"]);
  });

  test("감독 — SIGINT 무시, SIGTERM·shutdown 메시지·IPC 끊김은 종료, 다른 메시지는 무시", () => {
    const { source, fired, linked } = wire(true, true);
    expect(linked).toBe(true);
    source.raise("SIGINT");
    expect(fired).toEqual([]);
    source.onMessage?.({ type: "status" });
    source.onMessage?.("shutdown");
    expect(fired).toEqual([]);
    source.onMessage?.(SUPERVISOR_SHUTDOWN_MSG);
    source.raise("SIGTERM");
    source.onDisconnect?.();
    expect(fired).toEqual(["supervisor", "SIGTERM", "supervisor_lost"]);
  });

  test("감독 요청 + IPC 채널 없음 → 비감독 동작(SIGINT 존중)", () => {
    const { source, fired, linked } = wire(true, false);
    expect(linked).toBe(false);
    source.raise("SIGINT");
    expect(fired).toEqual(["SIGINT"]);
  });

  test("isShutdownMessage — {type:'shutdown'}만", () => {
    expect(isShutdownMessage({ type: "shutdown" })).toBe(true);
    expect(isShutdownMessage({ type: "shutdown", extra: 1 })).toBe(true);
    expect(isShutdownMessage({ type: "stop" })).toBe(false);
    expect(isShutdownMessage(null)).toBe(false);
    expect(isShutdownMessage("shutdown")).toBe(false);
  });
});
