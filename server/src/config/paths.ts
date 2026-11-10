// 레포 루트 기준 경로 앵커링 (리뷰 #25).
//
// 정적 데이터 로더가 process.cwd() 기반 경로를 쓰면 CLAUDE.md 문서 명령(`cd server ; bun run dev`)
// 으로 부팅 시 cwd가 server/가 되어 shared/를 못 찾고 ENOENT로 크래시한다. db.ts의 MIGRATIONS_DIR
// 처럼 import.meta.url을 기준으로 레포 루트를 고정해 실행 위치와 무관하게 해석한다.
//
// 주의: DB_PATH(env.ts)는 여기서 다루지 않는다 — 기존 데이터 위치를 옮기지 않기 위함.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 이 파일: <repo>/server/src/config/paths.ts → 레포 루트는 3단계 위(config → src → server → root).
const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..", "..", "..");

/** <repo>/shared/data/<file> 절대경로. */
export function sharedDataPath(file: string): string {
  return resolve(REPO_ROOT, "shared", "data", file);
}

/** <repo>/shared/maps/<file> 절대경로. */
export function sharedMapsPath(file: string): string {
  return resolve(REPO_ROOT, "shared", "maps", file);
}

/** env 경로 공통 해석 — 상대경로는 레포 루트에 앵커(실행 cwd 무관), 절대경로는 그대로. */
export function repoPath(p: string): string {
  return resolve(REPO_ROOT, p);
}

/** 로그 디렉토리 절대경로 — 상대 LOG_DIR을 레포 루트에 앵커(절대경로는 그대로). */
export function logsPath(dir: string): string {
  return repoPath(dir);
}
