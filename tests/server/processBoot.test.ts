// 성능 4단계 4.2c — 프로세스 관측 부팅 계획(obs/processBoot): 역할별 로그 proc 태그와 파일 싱크 접두어.
// index.ts가 역할 모듈(worldMain·gateway/gatewayMain)을 싣기 전에 1회 적용한다 — monolith는 종전 그대로(태그 없음, 접두어 "server").

import { describe, expect, test } from "bun:test";
import { EnvSchema } from "../../server/src/config/env";
import { processObsPlan } from "../../server/src/obs/processBoot";
import { levelRank } from "../../server/src/obs/logger";

function envOf(extra: Record<string, string>) {
  return EnvSchema.parse({ ...extra });
}

describe("processObsPlan", () => {
  test("monolith — proc 태그 없음(레코드 바이트 불변), LOG_DIR 없으면 파일 싱크 없음", () => {
    expect(processObsPlan(envOf({}))).toEqual({ procTag: null, fileSink: null });
  });

  test("monolith + LOG_DIR — 종전 파일 접두어 server, 크기·보존·레벨은 env", () => {
    const plan = processObsPlan(
      envOf({ LOG_DIR: "logs/x", LOG_FILE_LEVEL: "warn", LOG_FILE_MAX_MB: "3", LOG_FILE_MAX_FILES: "4" }),
    );
    expect(plan.procTag).toBeNull();
    expect(plan.fileSink).toMatchObject({
      filePrefix: "server",
      minLevel: levelRank("warn"),
      maxFileBytes: 3 * 1024 * 1024,
      maxFiles: 4,
    });
    expect(plan.fileSink?.dir.replaceAll("\\", "/").endsWith("logs/x")).toBe(true);
  });

  test("gateway — proc 태그·파일 접두어 gw<GATEWAY_ID>, PROC_NAME이 있으면 그 값", () => {
    expect(processObsPlan(envOf({ ROLE: "gateway", GATEWAY_ID: "7", LOG_DIR: "logs" }))).toMatchObject({
      procTag: "gw7",
      fileSink: { filePrefix: "gw7" },
    });
    expect(processObsPlan(envOf({ ROLE: "gateway", GATEWAY_ID: "7", PROC_NAME: "edge_a" })).procTag).toBe("edge_a");
  });

  test("world — proc 태그 world", () => {
    expect(processObsPlan(envOf({ ROLE: "world" })).procTag).toBe("world");
  });

  test("procName 지정(4.3a 슈퍼바이저 launch) — 역할과 무관하게 그 이름이 태그·파일 접두어", () => {
    expect(processObsPlan(envOf({ LOG_DIR: "logs" }), "launch")).toMatchObject({
      procTag: "launch",
      fileSink: { filePrefix: "launch" },
    });
  });
});
