// Phase F-1 NavGrid 로더.
//
// shared/maps/zone-<zoneId>.nav.json -> NavGrid.
// 사양: shared/maps/README.md.
//
// - 파일 없으면 NavGrid.empty(fallbackDims)로 fallback (점진 도입용).
// - 파일이 있으면 zod로 strict 검증, 실패 시 throw (조용한 fallback 금지).
// - 본 모듈은 fs를 사용하므로 시뮬 핫패스가 아닌 zone 부트스트랩에서만 호출할 것.

import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { sharedMapsPath } from "../../config/paths";
import { NavGrid, type NavGridDims } from "./navGrid";
import { createLogger } from "../../obs/logger";

const log = createLogger("nav.loader");

const navMapSchema = z
  .object({
    zoneId: z.number().int(),
    version: z.literal(1),
    name: z.string(),
    cellSize: z.number().positive(),
    originX: z.number(),
    originY: z.number(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    rows: z.array(z.string()),
  })
  .superRefine((val, ctx) => {
    if (val.rows.length !== val.height) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `rows.length (${val.rows.length}) != height (${val.height})`,
      });
      return;
    }
    for (let i = 0; i < val.rows.length; i++) {
      const row = val.rows[i];
      if (row === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `rows[${i}] missing`,
        });
        return;
      }
      if (row.length !== val.width) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `rows[${i}].length (${row.length}) != width (${val.width})`,
        });
      }
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch !== "." && ch !== "#") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `rows[${i}][${c}] = "${ch}" — only '.' or '#' allowed`,
          });
          return;
        }
      }
    }
  });

export type NavMapJson = z.infer<typeof navMapSchema>;

/**
 * 파싱 + 검증 + NavGrid 빌드. JSON 직접 입력용 — 테스트 친화적.
 * 파일 시스템 접근 없음.
 */
export function parseNavGrid(rawJson: unknown): NavGrid {
  const data = navMapSchema.parse(rawJson);
  const cells = new Uint8Array(data.width * data.height);
  for (let cy = 0; cy < data.height; cy++) {
    const row = data.rows[cy];
    // schema의 superRefine이 rows.length === height를 강제하지만 noUncheckedIndexedAccess 가드.
    if (row === undefined) {
      throw new Error(`parseNavGrid: rows[${cy}] missing (schema bypassed)`);
    }
    for (let cx = 0; cx < data.width; cx++) {
      cells[cy * data.width + cx] = row[cx] === "#" ? 1 : 0;
    }
  }
  const dims: NavGridDims = {
    width: data.width,
    height: data.height,
    cellSize: data.cellSize,
    originX: data.originX,
    originY: data.originY,
  };
  return new NavGrid(dims, cells);
}

/** 레포 루트 기준 상대경로. cwd가 레포 루트라고 가정 (CLAUDE.md 컨벤션). */
export function navJsonPath(zoneId: number): string {
  return sharedMapsPath(`zone-${zoneId}.nav.json`);
}

/**
 * zone-{id}.nav.json을 읽어 NavGrid 반환. 파일 없으면 fallbackDims로 무장애 grid.
 * JSON이 있는데 schema 위반/zoneId mismatch면 throw.
 */
export function loadNavGridForZone(
  zoneId: number,
  fallbackDims: NavGridDims,
): NavGrid {
  const path = navJsonPath(zoneId);
  if (!existsSync(path)) {
    log.warn({ zoneId, path }, "nav.json not found — using empty grid fallback");
    return NavGrid.empty(fallbackDims);
  }
  const text = readFileSync(path, "utf-8");
  const raw = JSON.parse(text);
  if (typeof raw === "object" && raw && (raw as { zoneId?: number }).zoneId !== zoneId) {
    throw new Error(
      `nav.json zoneId mismatch: file says ${(raw as { zoneId: number }).zoneId}, expected ${zoneId} (path=${path})`,
    );
  }
  const grid = parseNavGrid(raw);
  log.info(
    { zoneId, width: grid.width, height: grid.height, cellSize: grid.cellSize },
    "nav grid loaded",
  );
  return grid;
}
