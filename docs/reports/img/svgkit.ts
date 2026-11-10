// 보고서 그림 공용 SVG 도구 — docs/reports/img/*/gen.ts가 쓴다. 의존성 없음(Bun·Node 기본 모듈만).
// 모든 그림은 흰 배경 사각형을 깔아 다크 모드 뷰어에서도 읽히게 하고, 글꼴은 한글 시스템 글꼴 목록을 쓴다.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const C = {
  ink: "#1f2933", sub: "#52606d", faint: "#7b8794", grid: "#e4e7eb", bg: "#ffffff", panel: "#f5f7fa",
  a: "#a3acb9", b: "#2f6fde", good: "#2e9e5b", bad: "#d64545", warn: "#e8890c", wall: "#3e4c59", soft: "#dbe7fb",
  c3: "#8e44ad",
} as const;
const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR','Segoe UI',sans-serif";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 대략적인 글자 폭(px) — 한글 0.93em, 공백 0.3em, 그 밖 0.56em. 레이아웃 겹침 회피용. */
export function tw(s: string, size: number): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    w += c >= 0x1100 && c <= 0xffdc ? size * 0.93 : ch === " " ? size * 0.3 : size * 0.56;
  }
  return w;
}

export type TOpt = { size?: number; anchor?: "start" | "middle" | "end"; weight?: number; fill?: string };
export function t(x: number, y: number, s: string, o: TOpt = {}): string {
  return `<text x="${x}" y="${y}" font-size="${o.size ?? 13}" text-anchor="${o.anchor ?? "start"}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? C.ink}">${esc(s)}</text>`;
}
export function r(x: number, y: number, w: number, h: number, fill: string, o: { rx?: number; stroke?: string; sw?: number; dash?: string; opacity?: number } = {}): string {
  return `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" rx="${o.rx ?? 0}" fill="${fill}"${o.opacity !== undefined ? ` fill-opacity="${o.opacity}"` : ""}${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw ?? 1}"` : ""}${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}/>`;
}
export function ln(x1: number, y1: number, x2: number, y2: number, stroke: string, o: { sw?: number; dash?: string; arrow?: string } = {}): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${o.sw ?? 1}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}${o.arrow ? ` marker-end="url(#${o.arrow})"` : ""}/>`;
}
const DEFS = `<defs>${(["ink", "good", "bad", "b", "sub", "warn"] as const)
  .map((k) => `<marker id="ar-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C[k]}"/></marker>`)
  .join("")}</defs>`;

/** outDir에 SVG를 쓰는 함수를 만든다. */
export function svgWriter(outDir: string): (name: string, w: number, h: number, body: string, title: string) => void {
  mkdirSync(outDir, { recursive: true });
  return (name, w, h, body, title) => {
    const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}" role="img" aria-label="${esc(title)}">\n<title>${esc(title)}</title>\n${DEFS}\n${r(0, 0, w, h, C.bg)}\n${body}\n</svg>\n`;
    writeFileSync(join(outDir, name), s);
    console.log(`wrote ${name} ${w}x${h}`);
  };
}

export function header(title: string, subtitle?: string): string {
  return t(24, 34, title, { size: 19, weight: 700 }) + (subtitle ? t(24, 56, subtitle, { size: 12.5, fill: C.sub }) : "");
}
export function legend(x: number, y: number, items: readonly (readonly [string, string])[]): string {
  let out = "";
  let cx = x;
  for (const [color, label] of items) {
    out += r(cx, y - 10, 12, 12, color, { rx: 2 }) + t(cx + 17, y, label, { size: 12, fill: C.sub });
    cx += 17 + tw(label, 12) + 22;
  }
  return out;
}
export const pct = (a: number, b: number) => ((b - a) / a) * 100;
export const fmtPct = (p: number) => (Math.abs(p) < 0.5 ? "±0%" : `${p > 0 ? "+" : "−"}${Math.abs(p).toFixed(0)}%`);

// ── 발산 막대(변화율) — 분류별 행, 초록 = 줄어듦, 주황 = 늘었지만 원인 미확인, 회색 = 단정 불가 ─────────────────
export type DivRow = { label: string; v: number; note: string; kind: "good" | "hold" | "warn" | "bad"; text?: string };
export function divergingChart(
  write: ReturnType<typeof svgWriter>, name: string, title: string, subtitle: string, groups: readonly (readonly [string, readonly DivRow[]])[],
  o: { scale?: number; maxNeg?: number } = {},
): void {
  const W = 900;
  const scale = o.scale ?? 5;
  const cx = 330 + (o.maxNeg ?? 56) * scale;
  const n = groups.reduce((k, [, rows]) => k + rows.length, 0);
  let body = header(title, subtitle);
  // 범례는 실제로 쓰인 종류만. "단정 불가"는 윤곽 막대(회색 채움은 다른 그림에서 기준 버전을 뜻한다).
  const used = new Set(groups.flatMap(([, rows]) => rows.map((row) => row.kind)));
  const items: [string, string, DivRow["kind"]][] = [[C.good, "좋아짐", "good"], [C.warn, "늘었지만 원인 미확인", "warn"], [C.bad, "나빠짐", "bad"]];
  let lx = 24;
  for (const [color, label, kind] of items) {
    if (!used.has(kind)) continue;
    body += r(lx, 70, 12, 12, color, { rx: 2 }) + t(lx + 17, 80, label, { size: 12, fill: C.sub });
    lx += 17 + tw(label, 12) + 22;
  }
  if (used.has("hold")) body += r(lx, 70, 12, 12, "#ffffff", { rx: 2, stroke: C.faint, sw: 1.4, dash: "3 2" }) + t(lx + 17, 80, "차이 단정 불가 · 참고값", { size: 12, fill: C.sub });
  let y = 100;
  body += ln(cx, y, cx, y + n * 42 + groups.length * 24, C.faint);
  for (const [title2, rows] of groups) {
    body += t(24, y + 14, title2, { size: 12.5, weight: 700, fill: C.sub });
    y += 24;
    for (const row of rows) {
      body += t(24, y + 15, row.label, { size: 13 });
      body += t(24, y + 31, row.note, { size: 11, fill: C.faint });
      const w = Math.abs(row.v) * scale;
      const color = row.kind === "good" ? C.good : row.kind === "warn" ? C.warn : row.kind === "bad" ? C.bad : C.sub;
      const hold = row.kind === "hold";
      const bx = row.v < 0 ? cx - w : cx;
      if (row.v === 0) body += r(cx - 2, y + 6, 4, 20, C.faint);
      else body += hold ? r(bx, y + 6, w, 20, "#ffffff", { rx: 2, stroke: C.faint, sw: 1.4, dash: "3 2" }) : r(bx, y + 6, w, 20, color, { rx: 2 });
      const label = row.text ?? (row.v === 0 ? "≈ 0" : fmtPct(row.v));
      // 눈금 끝까지 간(잘린) 막대는 라벨을 막대 안쪽에 — 왼쪽 메모 열과 겹치지 않게.
      const clipped = row.v < 0 && Math.abs(row.v) >= (o.maxNeg ?? 56);
      // 잘린 막대는 왼쪽 끝을 사선 두 줄로 끊어 "눈금 밖"을 표시한다.
      if (clipped) body += ln(cx - w + 2, y + 28, cx - w + 8, y + 4, "#ffffff", { sw: 2 }) + ln(cx - w + 7, y + 28, cx - w + 13, y + 4, "#ffffff", { sw: 2 });
      body += clipped
        ? t(cx - w + 18, y + 21, label, { size: 14, weight: 700, fill: "#ffffff" })
        : row.v < 0
          ? t(cx - w - 8, y + 21, label, { size: 14, weight: 700, fill: color, anchor: "end" })
          : t(cx + Math.max(w, 2) + 8, y + 21, label, { size: 14, weight: 700, fill: color });
      y += 42;
    }
  }
  write(name, W, y + 16, body, title);
}

// ── 쌍 막대(A / B) — 그룹(또는 행) 공통 눈금, 값은 절대값 ───────────────────────────────────────────
export type PairRow = {
  label: string; note?: string; a: number; b: number; fmt: (v: number) => string;
  lowerBetter?: boolean; aRange?: [number, number]; bRange?: [number, number]; scaleMax?: number;
  deltaNote?: string; neutral?: boolean; warn?: boolean;
};
export function pairChart(
  write: ReturnType<typeof svgWriter>, name: string, title: string, subtitle: string,
  groups: readonly { heading?: string; scaleMax?: number; rows: readonly PairRow[] }[],
  opt: { aLabel: string; bLabel: string; footnote?: readonly string[] },
): void {
  const W = 920;
  const barX = 254;
  const barW = 400;
  const deltaX = barX + barW + 160;
  let y = 106;
  let body = header(title, subtitle) + legend(24, 80, [[C.a, opt.aLabel], [C.b, opt.bLabel]]);
  for (const g of groups) {
    if (g.heading) {
      body += t(24, y + 14, g.heading, { size: 13.5, weight: 700, fill: C.sub }) + ln(24, y + 21, W - 24, y + 21, C.grid);
      y += 30;
    }
    for (const row of g.rows) {
      const max = row.scaleMax ?? g.scaleMax ?? Math.max(row.a, row.b, row.aRange?.[1] ?? 0, row.bRange?.[1] ?? 0) * 1.05;
      const sx = (v: number) => barX + (Math.min(v, max) / max) * barW;
      body += t(24, y + 15, row.label, { size: 13 });
      if (row.note) body += t(24, y + 32, row.note, { size: 11, fill: C.faint });
      const bh = 15;
      const aEnd = Math.max(sx(row.a), row.aRange ? sx(row.aRange[1]) : 0);
      const bEnd = Math.max(sx(row.b), row.bRange ? sx(row.bRange[1]) : 0);
      body += r(barX, y + 3, sx(row.a) - barX, bh, C.a, { rx: 2 }) + t(aEnd + 6, y + 15, row.fmt(row.a), { size: 11.5, fill: C.sub });
      body += r(barX, y + 22, sx(row.b) - barX, bh, C.b, { rx: 2 }) + t(bEnd + 6, y + 34, row.fmt(row.b), { size: 11.5, fill: C.b, weight: 700 });
      for (const [rg, yy] of [[row.aRange, y + 3], [row.bRange, y + 22]] as const) {
        if (!rg) continue;
        body += ln(sx(rg[0]), yy + bh / 2, sx(rg[1]), yy + bh / 2, C.ink, { sw: 1.3 });
        body += ln(sx(rg[0]), yy + 3, sx(rg[0]), yy + bh - 3, C.ink, { sw: 1.3 });
        // 눈금 밖으로 잘린 범위는 끝 막대 대신 화살촉.
        body += rg[1] > max ? ln(sx(rg[1]) - 6, yy + bh / 2, sx(rg[1]), yy + bh / 2, C.ink, { sw: 1.3, arrow: "ar-ink" }) : ln(sx(rg[1]), yy + 3, sx(rg[1]), yy + bh - 3, C.ink, { sw: 1.3 });
      }
      const p = pct(row.a, row.b);
      const better = row.lowerBetter === false ? p > 0 : p < 0;
      const color = row.neutral || Math.abs(p) < 1 ? C.sub : row.warn ? C.warn : better ? C.good : C.bad;
      body += t(deltaX, y + 27, fmtPct(p), { size: 17, weight: 700, fill: color, anchor: "end" });
      if (row.deltaNote) body += t(deltaX + 8, y + 27, row.deltaNote, { size: 11, fill: C.faint });
      y += 50;
    }
    y += 6;
  }
  for (const f of opt.footnote ?? []) {
    body += t(24, y + 8, f, { size: 11.5, fill: C.sub });
    y += 18;
  }
  write(name, W, y + 16, body, title);
}

// ── 꺾은선 패널 — 수용 인원 곡선(p99 vs CCU)·시계열 ─────────────────────────────────────────────────
export type Series = {
  label: string; color: string; points: readonly (readonly [number, number])[];
  /** 같은 x의 런별 최소~최대(세로 선). */
  ranges?: readonly (readonly [number, number, number])[];
  dash?: string; dots?: boolean;
};
export type Panel = {
  x: number; y: number; w: number; h: number; title: string;
  xMin: number; xMax: number; yMin: number; yMax: number; xTicks: readonly number[]; yTicks: readonly number[];
  xLabel: string; yLabel: string; xFmt?: (v: number) => string;
  series: readonly Series[];
  hlines?: readonly { y: number; label: string; color: string }[];
  /** 세로 표식(교차점 등). dy = 라벨을 기본 위치에서 아래로 내리는 거리(표식끼리 가까울 때), end = 라벨을 선 왼쪽에 둔다. */
  vmarks?: readonly { x: number; label: string; color: string; dy?: number; end?: boolean }[];
};
export function linePanel(p: Panel): string {
  const sx = (v: number) => p.x + ((v - p.xMin) / (p.xMax - p.xMin)) * p.w;
  const sy = (v: number) => p.y + p.h - ((Math.min(Math.max(v, p.yMin), p.yMax) - p.yMin) / (p.yMax - p.yMin)) * p.h;
  let out = t(p.x, p.y - 12, p.title, { size: 13.5, weight: 700 });
  for (const v of p.yTicks) out += ln(p.x, sy(v), p.x + p.w, sy(v), C.grid) + t(p.x - 6, sy(v) + 4, String(v), { size: 10.5, anchor: "end", fill: C.faint });
  for (const v of p.xTicks) out += t(sx(v), p.y + p.h + 16, (p.xFmt ?? String)(v), { size: 10.5, anchor: "middle", fill: C.faint });
  out += ln(p.x, p.y + p.h, p.x + p.w, p.y + p.h, C.faint) + ln(p.x, p.y, p.x, p.y + p.h, C.faint);
  out += t(p.x + p.w / 2, p.y + p.h + 32, p.xLabel, { size: 11, anchor: "middle", fill: C.sub });
  out += t(p.x + p.w, p.y - 12, p.yLabel, { size: 11, anchor: "end", fill: C.sub });
  for (const h of p.hlines ?? []) out += ln(p.x, sy(h.y), p.x + p.w, sy(h.y), h.color, { dash: "5 4", sw: 1.4 }) + t(p.x + p.w - 4, sy(h.y) - 5, h.label, { size: 10.5, anchor: "end", fill: h.color });
  for (const s of p.series) {
    for (const [x, lo, hi] of s.ranges ?? []) out += ln(sx(x), sy(lo), sx(x), sy(hi), s.color, { sw: 1.2 });
    const d = s.points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" ");
    out += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}/>`;
    if (s.dots !== false) for (const [x, y] of s.points) out += `<circle cx="${sx(x).toFixed(1)}" cy="${sy(y).toFixed(1)}" r="3.2" fill="${s.color}"/>`;
  }
  for (const m of p.vmarks ?? []) out += ln(sx(m.x), p.y, sx(m.x), p.y + p.h, m.color, { dash: "2 3", sw: 1.2 }) + t(sx(m.x) + (m.end ? -4 : 4), p.y + 12 + (m.dy ?? 0), m.label, { size: 10.5, fill: m.color, weight: 700, ...(m.end ? { anchor: "end" as const } : {}) });
  return out;
}
