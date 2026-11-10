// 이진 전환·이동 입력 결과 보고서(docs/reports/binary-transition-2026-10.md) 그림 생성기 — usage: bun run gen.ts <outDir>
// 데이터 출처: docs/perf-baseline.md "이진 전환 B6 — 최종"·B2b·B3b 절, 패킷 크기는 tests/helpers/wire.ts encodeBody + JSON.stringify(예시 값, 전환 전 필드 그대로).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] ?? "out";
mkdirSync(OUT, { recursive: true });

const C = {
  ink: "#1f2933", sub: "#52606d", faint: "#7b8794", grid: "#e4e7eb", bg: "#ffffff", panel: "#f5f7fa",
  a: "#a3acb9", b: "#2f6fde", good: "#2e9e5b", bad: "#d64545", warn: "#e8890c", wall: "#3e4c59", soft: "#dbe7fb",
};
const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR','Segoe UI',sans-serif";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function tw(s: string, size: number): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    w += c >= 0x1100 && c <= 0xffdc ? size * 0.93 : ch === " " ? size * 0.3 : size * 0.56;
  }
  return w;
}
type TOpt = { size?: number; anchor?: "start" | "middle" | "end"; weight?: number; fill?: string; italic?: boolean };
function t(x: number, y: number, s: string, o: TOpt = {}): string {
  return `<text x="${x}" y="${y}" font-size="${o.size ?? 13}" text-anchor="${o.anchor ?? "start"}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? C.ink}"${o.italic ? ' font-style="italic"' : ""}>${esc(s)}</text>`;
}
function r(x: number, y: number, w: number, h: number, fill: string, o: { rx?: number; stroke?: string; sw?: number; dash?: string } = {}): string {
  return `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${h}" rx="${o.rx ?? 0}" fill="${fill}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw ?? 1}"` : ""}${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}/>`;
}
function ln(x1: number, y1: number, x2: number, y2: number, stroke: string, o: { sw?: number; dash?: string; arrow?: string } = {}): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${o.sw ?? 1}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}${o.arrow ? ` marker-end="url(#${o.arrow})"` : ""}/>`;
}
const DEFS = `<defs>${["ink", "good", "bad", "b", "sub", "warn"].map((k) => `<marker id="ar-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C[k as keyof typeof C]}"/></marker>`).join("")}</defs>`;
function svg(name: string, w: number, h: number, body: string, title: string): void {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}" role="img" aria-label="${esc(title)}">\n<title>${esc(title)}</title>\n${DEFS}\n${r(0, 0, w, h, C.bg)}\n${body}\n</svg>\n`;
  writeFileSync(join(OUT, name), s);
  console.log(`wrote ${name} ${w}x${h}`);
}
function header(w: number, title: string, subtitle?: string): string {
  return t(24, 34, title, { size: 19, weight: 700 }) + (subtitle ? t(24, 56, subtitle, { size: 12.5, fill: C.sub }) : "");
}
function legend(x: number, y: number, items: [string, string][]): string {
  let out = "";
  let cx = x;
  for (const [color, label] of items) {
    out += r(cx, y - 10, 12, 12, color, { rx: 2 }) + t(cx + 17, y, label, { size: 12, fill: C.sub });
    cx += 17 + tw(label, 12) + 22;
  }
  return out;
}
const pct = (a: number, b: number) => ((b - a) / a) * 100;
const fmtPct = (p: number) => (Math.abs(p) < 0.5 ? "±0%" : `${p > 0 ? "+" : "−"}${Math.abs(p).toFixed(0)}%`);

// ── 쌍 막대(A 전환 전 / B 전환 후) — 그룹(또는 행) 공통 눈금, 값은 절대값 표기 ─────────────────────────────────
type PairRow = {
  label: string; note?: string; a: number; b: number; fmt: (v: number) => string;
  lowerBetter?: boolean; aRange?: [number, number]; bRange?: [number, number]; scaleMax?: number;
  deltaNote?: string; neutral?: boolean; warn?: boolean;
};
function pairChart(name: string, title: string, subtitle: string, groups: { heading?: string; scaleMax?: number; rows: PairRow[] }[], opt: { aLabel?: string; bLabel?: string; footnote?: string[]; extraLegend?: [string, string][] } = {}): void {
  const W = 920;
  const labelW = 230;
  const barX = 24 + labelW;
  const barW = 400;
  const deltaX = barX + barW + 160;
  let y = 92;
  let body = header(W, title, subtitle);
  body += legend(24, 80, [[C.a, opt.aLabel ?? "전환 전 (895d8b6 — JSON 본문)"], [C.b, opt.bLabel ?? "전환 후 (B6 — 바이너리 본문)"], ...(opt.extraLegend ?? [])]);
  y += 14;
  for (const g of groups) {
    if (g.heading) {
      body += t(24, y + 14, g.heading, { size: 13.5, weight: 700, fill: C.sub });
      body += ln(24, y + 21, W - 24, y + 21, C.grid);
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
        body += ln(sx(rg[0]), yy + 3, sx(rg[0]), yy + bh - 3, C.ink, { sw: 1.3 }) + ln(sx(rg[1]), yy + 3, sx(rg[1]), yy + bh - 3, C.ink, { sw: 1.3 });
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
  svg(name, W, y + 16, body, title);
}

// ── 1. 핵심 변화(발산 막대, 분류별) ─────────────────────────────────────────────────────────────────
function headline(): void {
  type Row = { label: string; v: number; note: string; kind: "good" | "hold" | "warn"; text?: string };
  const groups: [string, Row[]][] = [
    ["네트워크", [
      { label: "클라 → 서버 바이트 (서버 수신)", v: -56, note: "775 → 344 KB/s (monolith 700명)", kind: "good" },
      { label: "월드 → 게이트웨이 내부 통신 (IPC)", v: -45, note: "17.1 → 9.4 MB/s (1200명)", kind: "good" },
      { label: "서버 → 클라 바이트", v: -6, note: "45.8 → 42.9 MB/s (monolith 700명)", kind: "good" },
    ]],
    ["CPU · 처리 시간", [
      { label: "서버 CPU (monolith)", v: -8, note: "0.66 → 0.61 코어", kind: "good" },
      { label: "월드 CPU (게이트웨이 2개 구성)", v: -7, note: "0.73 → 0.68 코어 (1150명) · 1200명 −5%", kind: "good" },
      { label: "스냅샷 처리 시간", v: -11, note: "4.64 → 4.12 ms (700명) · 구성별 −9~15%", kind: "good" },
    ]],
    ["tick (서버 갱신 1회 시간)", [
      { label: "tick 평균 — 게이트웨이 2개 구성", v: -12, note: "15.6 → 13.7 ms (1150명) · 1200명 −8%", kind: "good", text: "−8~12%" },
      { label: "tick 평균 — monolith 700명", v: -2, note: "18.9 → 18.5 ms — 런 편차 안", kind: "hold", text: "≈ −2%" },
      { label: "tick p99 (가장 느린 1%)", v: 0, note: "줄었다고 확인 안 됨 — 1150명 −15%는 판정 보류", kind: "hold" },
    ]],
    ["GC (메모리 청소)", [
      { label: "monolith 할당 추정", v: -8, note: "추정 방법에 따라 −8~11% · eden 횟수 −14%", kind: "good", text: "−8~11%" },
      { label: "월드 eden(짧은 청소) 횟수", v: 8, note: "2,448 → 2,651회 (2쌍) · 할당 추정 +27% — 원인 미확인", kind: "warn" },
    ]],
  ];
  const W = 900;
  const scale = 5;
  const cx = 330 + 56 * scale;
  const n = groups.reduce((k, [, rows]) => k + rows.length, 0);
  let body = header(W, "이진 전환 전후 — 무엇이 얼마나 바뀌었나", "전환 전(895d8b6) 대비 B6 · 같은 날·같은 CPU 배치 · 중앙값(GC는 2런 평균)");
  body += legend(24, 80, [[C.good, "줄어듦 (좋아짐)"], [C.faint, "차이 단정 불가"], [C.warn, "늘었지만 원인 미확인"]]);
  let y = 100;
  const top = y;
  body += ln(cx, top, cx, top + n * 42 + groups.length * 24, C.faint);
  for (const [title, rows] of groups) {
    body += t(24, y + 14, title, { size: 12.5, weight: 700, fill: C.sub });
    y += 24;
    for (const row of rows) {
      body += t(24, y + 15, row.label, { size: 13 });
      body += t(24, y + 31, row.note, { size: 11, fill: C.faint });
      const w = Math.abs(row.v) * scale;
      const color = row.kind === "good" ? C.good : row.kind === "warn" ? C.warn : C.faint;
      if (row.kind === "hold" && row.v === 0) body += r(cx - 2, y + 6, 4, 20, color);
      else if (row.v < 0) body += r(cx - w, y + 6, w, 20, color, { rx: 2 });
      else body += r(cx, y + 6, w, 20, color, { rx: 2 });
      const label = row.text ?? (row.kind === "hold" && row.v === 0 ? "≈ 0" : fmtPct(row.v));
      body += row.v < 0
        ? t(cx - w - 8, y + 21, label, { size: 14, weight: 700, fill: color, anchor: "end" })
        : t(cx + Math.max(w, 2) + 8, y + 21, label, { size: 14, weight: 700, fill: color });
      y += 42;
    }
  }
  svg("01-headline.svg", W, y + 16, body, "이진 전환 전후 핵심 변화");
}

// ── 2. 와이어 형식(헤더 + INPUT_CMD 본문) ──────────────────────────────────────────────────────────────
function wireFormat(): void {
  const W = 900;
  let body = header(W, "패킷 한 개는 어떻게 생겼나 — 이동 입력(INPUT_CMD) 예시", "헤더(머리표) + 본문(내용물). 같은 내용 {seq 12345, tick 67890, dx 1, dy 0, action 0}");
  const unit = 11;
  const row = (y: number, label: string, cells: { n: number; text: string; color: string }[], total: string) => {
    let out = t(24, y + 22, label, { size: 13, weight: 700 });
    let x = 190;
    for (const c of cells) {
      const w = c.n * unit;
      out += r(x, y, w, 34, c.color, { stroke: "#ffffff", sw: 1.5 });
      const fs = Math.min(11, (w - 4) / (tw(c.text, 1) || 1));
      if (fs >= 8) out += t(x + w / 2, y + 21, c.text, { size: +fs.toFixed(1), anchor: "middle", fill: c.color === C.a ? C.ink : "#fff" });
      x += w;
    }
    out += t(x + 10, y + 22, total, { size: 13, weight: 700, fill: C.ink });
    return out;
  };
  const jsonText = '{"seq":12345,"tick":67890,"dx":1,"dy":0,"action":0}';
  body += row(84, "전환 전 (JSON)", [
    { n: 2, text: "id", color: C.wall }, { n: 4, text: "len", color: C.sub },
    { n: 51, text: "본문 51 B — 글자로 쓴 JSON", color: C.a },
  ], "57 B");
  body += t(190 + 6 * unit + 6, 140, jsonText, { size: 11.5, fill: C.sub });
  body += t(190, 158, "헤더 6 B: [id u16 BE][len u32 BE] — 필드 이름·따옴표·쉼표까지 매번 글자로 보낸다", { size: 11.5, fill: C.faint });
  body += row(178, "전환 후 (바이너리)", [
    { n: 2, text: "len", color: C.sub }, { n: 2, text: "id", color: C.wall },
    { n: 4, text: "seq", color: C.b }, { n: 4, text: "tick", color: "#4a84e8" }, { n: 4, text: "dx", color: C.b }, { n: 4, text: "dy", color: "#4a84e8" }, { n: 4, text: "action", color: C.b },
  ], "24 B");
  body += t(190, 234, "헤더 4 B: [len u16 LE][id u16 LE] — 본문은 정해진 자리에 숫자만(i32 × 5 = 20 B), 이름은 스키마가 안다", { size: 11.5, fill: C.faint });
  body += r(24, 254, W - 48, 58, C.panel, { rx: 6 });
  body += t(40, 278, "비유: JSON은 매번 \"이름: 홍길동, 주소: …\"라고 손으로 쓴 편지, 바이너리는 칸이 정해진 양식지에 값만 적는 것.", { size: 12.5 });
  body += t(40, 298, "양식(packets.json 스키마)은 서버(TS)와 클라(C#)가 같은 파일에서 코드를 자동 생성해 공유한다 — 칸이 어긋날 수 없다.", { size: 12.5, fill: C.sub });
  svg("05-wire-format.svg", W, 330, body, "패킷 형식 전후 비교");
}

// ── 3. 패킷 크기(예시 값) ─────────────────────────────────────────────────────────────────────────────
function packetSizes(): void {
  const rows: [string, string, number, number][] = [
    ["INPUT_CMD", "이동 입력 (초당 20회 × 접속자)", 57, 24],
    ["DAMAGE_EVENT", "피해 표시", 96, 18],
    ["ENTITY_SPAWN", "몬스터가 시야에 들어옴", 138, 52],
    ["MOVE_PATH", "이동 경로 (경유점 5개)", 145, 54],
    ["ENTITY_META", "HP·레벨 갱신", 52, 20],
    ["MOVE_TO", "클릭 이동 요청", 60, 20],
    ["PING", "지연 측정", 38, 12],
  ];
  pairChart("06-packet-sizes.svg", "같은 내용, 패킷 크기 비교 (헤더 포함 프레임 바이트)", "대표 예시 값으로 계산 — 전환 전 = 헤더 6 B + JSON, 전환 후 = 헤더 4 B + 바이너리",
    [{ rows: rows.map(([id, what, a, b]) => ({ label: id, note: what, a, b, fmt: (v: number) => `${v} B`, scaleMax: 150 })) }],
    { aLabel: "전환 전 (JSON)", bLabel: "전환 후 (바이너리)", footnote: ["실제 트래픽에서는 원래 바이너리였던 SNAPSHOT_DELTA(위치 갱신)가 서버→클라 송신의 대부분이라, 서버→클라 총량은 −6%에 그친다."] });
}

// ── 4. 단계별 진행 ───────────────────────────────────────────────────────────────────────────────────
function progress(): void {
  const stages: { key: string; when: string; count: number; pv: string; what: string }[] = [
    { key: "시작", when: "10-12 13:57 전", count: 1, pv: "v2", what: "DELTA 1개만" },
    { key: "B1", when: "10-12 17:22", count: 1, pv: "3", what: "헤더 4 B LE" },
    { key: "B2b", when: "19:00", count: 30, pv: "5", what: "C2S 29개" },
    { key: "B3b", when: "22:27", count: 41, pv: "6", what: "고빈도 S2C 11" },
    { key: "B4", when: "10-13 01:57", count: 58, pv: "7", what: "고정형 S2C 17" },
    { key: "B5②b", when: "06:21", count: 61, pv: "8", what: "인벤·상점 3" },
    { key: "B5③b", when: "08:05", count: 63, pv: "9", what: "스킬·UI 2" },
    { key: "B5④b", when: "10:36", count: 67, pv: "10", what: "NPC·퀘스트 4" },
    { key: "B5①b", when: "12:58", count: 71, pv: "11", what: "캐릭터·포탈 4" },
    { key: "B6", when: "14:22", count: 71, pv: "11", what: "JSON 경로 삭제" },
  ];
  const W = 900;
  const x0 = 70;
  const x1 = W - 30;
  const y0 = 300;
  const h = 200;
  const bw = (x1 - x0) / stages.length;
  let body = header(W, "바이너리로 바뀐 패킷 수 — 71개 중", "막대 = 그 단계 뒤 바이너리 본문 패킷 수(초록 = 전환 완료), 아래 = 프로토콜 버전(protoVersion) · 26시간 · 커밋 29개");
  for (const v of [0, 20, 40, 60, 71]) {
    const yy = y0 - (v / 71) * h;
    body += ln(x0, yy, x1, yy, v === 71 ? C.good : C.grid, { dash: v === 71 ? "4 3" : undefined }) + t(x0 - 8, yy + 4, String(v), { size: 11, anchor: "end", fill: v === 71 ? C.good : C.faint });
  }
  body += t(x0 + 8, y0 - h - 8, "전체 71개 (C2S 29 + S2C 42)", { size: 11, fill: C.good });
  stages.forEach((s, i) => {
    const x = x0 + i * bw + 8;
    const w = bw - 16;
    const hh = (s.count / 71) * h;
    const color = s.key === "B6" ? C.good : s.count === 1 ? C.a : C.b;
    body += r(x, y0 - hh, w, hh, color, { rx: 3 });
    body += t(x + w / 2, y0 - hh - 6, String(s.count), { size: 12, weight: 700, anchor: "middle", fill: color });
    body += t(x + w / 2, y0 + 18, s.key, { size: 12.5, weight: 700, anchor: "middle" });
    body += t(x + w / 2, y0 + 34, s.what, { size: 10.5, anchor: "middle", fill: C.sub });
    body += t(x + w / 2, y0 + 50, s.when, { size: 10, anchor: "middle", fill: C.faint });
    body += r(x + w / 2 - 16, y0 + 58, 32, 18, C.panel, { rx: 9 }) + t(x + w / 2, y0 + 71, `v${s.pv.replace("v", "")}`, { size: 10.5, anchor: "middle", fill: C.ink });
  });
  body += t(24, y0 + 98, "B5는 도메인마다 a(JSON인 채로 스키마부터 정함 — 바이트 불변) → b(바이너리로 전환) 두 커밋.", { size: 11.5, fill: C.sub }) + t(24, y0 + 116, "그래서 단계마다 '바뀐 것만 바뀌었는지'를 골든으로 검증할 수 있었다.", { size: 11.5, fill: C.sub });
  svg("07-progress.svg", W, y0 + 134, body, "단계별 바이너리 패킷 수");
}

// ── 5. 이동 입력 제한 비교 ──────────────────────────────────────────────────────────────────────────
function moveLimits(): void {
  const W = 900;
  let body = header(W, "초당 이동 입력 — 정상 사용량과 제한값", "웹 조사(게임 Rust · Minecraft · Valve Source 엔진 · Overwatch)와 우리 서버 비교. 막대 눈금은 패널마다 다르다");
  body += legend(24, 80, [[C.good, "정상 사용량"], [C.warn, "클릭 연타"], [C.b, "우리 제한값"], [C.a, "다른 게임(참고)"]]);
  const panel = (y0: number, title: string, max: number, rows: { label: string; v: number; v2?: number; color: string; note: string }[]) => {
    let out = t(24, y0, title, { size: 14, weight: 700 });
    let y = y0;
    const bx = 280;
    const bwid = 420;
    y += 14;
    for (const row of rows) {
      const w = (row.v / max) * bwid;
      out += t(24, y + 15, row.label, { size: 12.5 });
      out += r(bx, y + 3, Math.max(w, 2), 16, row.color, { rx: 2 });
      if (row.v2) out += r(bx + w, y + 3, ((row.v2 - row.v) / max) * bwid, 16, row.color, { rx: 2, dash: "3 2", stroke: row.color }).replace(`fill="${row.color}"`, `fill="${row.color}" fill-opacity="0.35"`);
      out += t(bx + Math.max(w, 2) + (row.v2 ? ((row.v2 - row.v) / max) * bwid : 0) + 8, y + 16, row.note, { size: 11.5, fill: C.sub });
      y += 26;
    }
    return { out, y };
  };
  const p1 = panel(110, "연결당 전체 패킷 (초당)", 300, [
    { label: "정상 클라 합계", v: 21, color: C.good, note: "≈21 (INPUT_CMD 20 + PING 1 + MOVE_TO)" },
    { label: "게임 Rust — 클라 송신", v: 32, color: C.a, note: "32" },
    { label: "우리 서버 전체 상한", v: 100, color: C.b, note: "100 — 유지 (정상의 ≈5배 여유)" },
    { label: "게임 Rust — 서버 상한", v: 300, color: C.a, note: "300 (클라의 ≈9배)" },
  ]);
  body += p1.out;
  const p2 = panel(p1.y + 30, "MOVE_TO — 클릭 이동 요청 (초당)", 12, [
    { label: "평소 평균", v: 0.3, color: C.good, note: "0.3" },
    { label: "몬스터 추격 최대", v: 4, color: C.good, note: "4" },
    { label: "클릭 연타", v: 5, v2: 10, color: C.warn, note: "5~10" },
    { label: "클라 자체 제한 (신규)", v: 7, color: C.b, note: "7 — 정상 클라는 서버 제한에 안 닿음" },
    { label: "서버 제한 (신규)", v: 8, color: C.b, note: "8 · 버스트 8 · 넘치면 최신 1건만 보류" },
  ]);
  body += p2.out;
  const y = p2.y + 16;
  body += r(24, y, W - 48, 74, C.panel, { rx: 6 });
  body += t(40, y + 22, "INPUT_CMD(키보드 이동)는 이미 업계 방식과 같다 — tick당 1건만 적용(Source·Overwatch), 대기열 32(Minecraft는 tick 사이 5개를 넘으면 잘라냄).", { size: 12 });
  body += t(40, y + 42, "더 조이면 순간 끊김 뒤 몰려온 정상 입력이 버려진다 → 유지.", { size: 12, fill: C.sub });
  body += t(40, y + 62, "구멍은 MOVE_TO: 요청 하나가 경로 탐색(A*) + 시야 안 전원에게 MOVE_PATH 전송 → 나가는 패킷이 MOVE_TO의 ≈260배인데 제한이 없었다.", { size: 12, fill: C.bad });
  svg("02-move-limits.svg", W, y + 92, body, "초당 이동 입력 비교");
}

// ── 6. MOVE_TO 처리 흐름 ───────────────────────────────────────────────────────────────────────────
function moveToFlow(): void {
  const W = 900;
  let body = header(W, "MOVE_TO 속도 제한은 이렇게 동작한다", "연결마다 토큰 버킷(초당 8개 충전, 최대 8개). 정상 범위 요청은 예전과 똑같은 경로(바이트 단위로 동일)");
  const box = (x: number, y: number, w: number, h: number, lines: string[], fill: string, color = C.ink) => {
    let out = r(x, y, w, h, fill, { rx: 8, stroke: color === C.ink ? C.faint : color, sw: 1.2 });
    lines.forEach((s, i) => {
      out += t(x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * 17 + 5, s, { size: i === 0 ? 13 : 11.5, weight: i === 0 ? 700 : 400, anchor: "middle", fill: i === 0 ? color : C.sub });
    });
    return out;
  };
  body += box(24, 90, 150, 56, ["클라 MOVE_TO", "목표 지점 클릭"], C.panel);
  body += box(214, 90, 150, 56, ["사망 중?"], "#fff", C.ink);
  body += box(214, 178, 150, 40, ["무시 (토큰 안 씀)"], "#fdecec", C.bad);
  body += box(404, 90, 160, 56, ["토큰 남았나?", "버킷 8/s · 최대 8"], "#fff");
  body += box(604, 74, 272, 56, ["즉시 처리", "A* 경로 → 주변에 MOVE_PATH"], "#e6f4ec", C.good);
  body += box(604, 150, 272, 56, ["보류 1칸에 덮어쓰기", "최신 요청만 남김 (latest-wins)"], "#fff4e5", C.warn);
  body += box(604, 236, 272, 72, ["다음 tick 직전마다 확인", "토큰이 생겼으면 해제 → A* 처리", "존 바뀜·사망이면 폐기, 토큰 없으면 대기"], "#e6f4ec", C.good);
  body += box(214, 248, 350, 44, ["취소: MOVE_STOP 또는 키보드 이동 입력", "보류된 요청 폐기"], "#fdecec", C.bad);
  body += ln(174, 118, 210, 118, C.ink, { arrow: "ar-ink", sw: 1.4 });
  body += ln(364, 118, 400, 118, C.ink, { arrow: "ar-ink", sw: 1.4 }) + t(382, 110, "아니오", { size: 10.5, anchor: "middle", fill: C.sub });
  body += ln(289, 146, 289, 174, C.bad, { arrow: "ar-bad", sw: 1.4 }) + t(296, 164, "예", { size: 10.5, fill: C.bad });
  body += ln(564, 108, 600, 100, C.good, { arrow: "ar-good", sw: 1.4 }) + t(582, 96, "예", { size: 10.5, anchor: "middle", fill: C.good });
  body += ln(564, 130, 600, 172, C.warn, { arrow: "ar-warn", sw: 1.4 }) + t(566, 156, "아니오", { size: 10.5, fill: C.warn, anchor: "end" });
  body += ln(740, 206, 740, 232, C.good, { arrow: "ar-good", sw: 1.4 });
  body += ln(566, 262, 600, 200, C.bad, { arrow: "ar-bad", sw: 1.2, dash: "4 3" }) + t(574, 232, "보류 폐기", { size: 10.5, fill: C.bad, anchor: "end" });
  body += t(24, 338, "메트릭 mmorpg_move_to_throttle_total{outcome = deferred · coalesced · released · cancelled} 로 보류·덮어쓰기·해제·취소 건수를 본다.", { size: 11.5, fill: C.sub });
  svg("03-move-to-flow.svg", W, 358, body, "MOVE_TO 속도 제한 흐름");
}

// ── 7. 벽 미끄러짐 ───────────────────────────────────────────────────────────────────────────────
function wallSlide(): void {
  const W = 900;
  const cell = 44;
  let body = header(W, "키보드 이동 벽 충돌 — 뚫고 지나가던 것을 벽을 따라 미끄러지게", "이동을 X축 → Y축 순서로 나눠 각각 막힘을 검사(축 분리 슬라이드). 서버와 클라 예측이 같은 규칙");
  const grid = (ox: number, oy: number, after: boolean) => {
    let out = "";
    for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 7; gx++) {
      const wall = gx === 4;
      out += r(ox + gx * cell, oy + gy * cell, cell, cell, wall ? C.wall : "#fbfcfd", { stroke: C.grid });
    }
    const px = ox + 2.5 * cell;
    const py = oy + 3.5 * cell;
    out += `<circle cx="${px}" cy="${py}" r="9" fill="${C.b}"/>`;
    if (!after) {
      out += ln(px, py, px + 3 * cell, py - 2 * cell, C.bad, { sw: 2.5, arrow: "ar-bad", dash: "6 4" });
      out += t(ox + 3.5 * cell * 2 - 10, oy + 1.2 * cell, "벽 통과!", { size: 13, weight: 700, fill: C.bad, anchor: "middle" });
    } else {
      const wallX = ox + 4 * cell - 2;
      const hitY = py - (wallX - px) * (2 / 3);
      out += ln(px, py, wallX, hitY, C.good, { sw: 2.5 });
      out += ln(wallX, hitY, wallX, py - 2 * cell, C.good, { sw: 2.5, arrow: "ar-good" });
      out += `<circle cx="${wallX}" cy="${hitY}" r="3.5" fill="${C.good}"/>`;
      out += t(wallX - 8, py + 30, "① 닿기 전: 대각선 그대로", { size: 11, fill: C.good, anchor: "end" });
      out += t(wallX - 8, hitY - 18, "② 닿은 뒤: X 막힘, Y만", { size: 11, fill: C.good, anchor: "end" }) + t(wallX - 8, hitY - 4, "→ 벽 따라 미끄러짐", { size: 11, fill: C.good, anchor: "end" });
    }
    return out;
  };
  body += t(24 + 3.5 * cell, 92, "전 — 벽·맵 경계 검사 없음", { size: 14, weight: 700, anchor: "middle", fill: C.bad });
  body += grid(24, 104, false);
  body += t(470 + 3.5 * cell, 92, "후 — 축을 나눠 검사 (벽 따라 미끄러짐)", { size: 14, weight: 700, anchor: "middle", fill: C.good });
  body += grid(470, 104, true);
  const y = 104 + 5 * cell + 18;
  body += r(24, y, W - 48, 104, C.panel, { rx: 6 });
  body += t(40, y + 82, "· 한 tick(보폭 0.2칸) 안에서 X를 먼저 움직이고(막히면 벽 앞에서 멈춤) 그다음 Y — 그래서 벽에 닿은 뒤엔 Y만 남는다", { size: 12 });
  body += t(40, y + 22, "· 벽 앞 1/1024 칸에서 멈춤, 대각선 모서리 틈은 못 지나감(A* 경로와 같은 규칙), 맵 밖은 벽으로 취급", { size: 12 });
  body += t(40, y + 42, "· 좌표를 1/4096 격자로 맞춰 서버(f64)·클라(f32) 계산이 셀 경계에서 갈라지지 않게 함 (리뷰가 잡은 HIGH)", { size: 12 });
  body += t(40, y + 62, "· 저장 좌표가 벽 안이면 입장 시 가장 가까운 빈 칸으로 보정. 몬스터 벽 충돌은 후속 과제", { size: 12 });
  svg("04-wall-slide.svg", W, y + 122, body, "키보드 이동 벽 충돌 전후");
}

// ── 결과 그림 ────────────────────────────────────────────────────────────────────────────────────
function results(): void {
  const kb = (v: number) => `${v.toLocaleString("en-US", { maximumFractionDigits: 0 })} KB/s`;
  const mb = (v: number) => `${v.toFixed(1)} MB/s`;
  pairChart("09-result-bytes.svg", "네트워크 바이트 — 전환 전 vs 후", "같은 날 번갈아 측정, spread 시나리오, 레벨별 중앙값(monolith 5런, 게이트웨이 2개 구성 3런). 막대 눈금은 묶음마다 공통", [
    { heading: "클라 → 서버 (서버가 받는 바이트)", scaleMax: 1400, rows: [
      { label: "monolith 700명", a: 775, b: 344, fmt: kb },
      { label: "게이트웨이 2개 · 1150명", a: 1273, b: 565, fmt: kb },
      { label: "게이트웨이 2개 · 1200명", a: 1328, b: 590, fmt: kb },
    ] },
    { heading: "월드 → 게이트웨이 내부 통신 (IPC)", scaleMax: 18, rows: [
      { label: "1150명", a: 15.87, b: 8.74, fmt: mb },
      { label: "1200명", a: 17.1, b: 9.43, fmt: mb },
    ] },
    { heading: "서버 → 클라", scaleMax: 140, rows: [
      { label: "monolith 700명", a: 45.75, b: 42.94, fmt: mb },
      { label: "게이트웨이 2개 · 1200명", a: 134.5, b: 126.4, fmt: mb, note: "게이트웨이 2개 합" },
    ] },
  ]);

  const ms = (v: number) => `${v.toFixed(2)} ms`;
  const core = (v: number) => `${v.toFixed(2)} 코어`;
  pairChart("10-result-cpu.svg", "CPU와 처리 시간 — 전환 전 vs 후", "레벨별 중앙값. 스냅샷 = 주변 엔티티 변화를 모아 보내는 단계, ipcFlush = 월드가 게이트웨이로 내보내는 단계. 눈금은 묶음마다 공통", [
    { heading: "CPU 사용량 (낮을수록 좋음)", scaleMax: 0.8, rows: [
      { label: "monolith 서버 · 700명", a: 0.66, b: 0.61, fmt: core },
      { label: "월드 · 1150명", a: 0.73, b: 0.68, fmt: core },
      { label: "월드 · 1200명", a: 0.74, b: 0.7, fmt: core },
    ] },
    { heading: "tick 안 단계 시간", scaleMax: 13, rows: [
      { label: "스냅샷 · monolith 700명", a: 4.64, b: 4.12, fmt: ms },
      { label: "스냅샷 · 월드 1150명", a: 11.79, b: 10.08, fmt: ms },
      { label: "스냅샷 · 월드 1200명", a: 12.31, b: 11.19, fmt: ms },
      { label: "ipcFlush · 월드 1150명", a: 0.29, b: 0.2, fmt: ms },
    ] },
  ], { footnote: ["monolith의 소켓 쓰기(flush 13.2–13.5 ms)는 그대로였다(서버 → 클라 바이트는 −6%)."] });

  pairChart("11-result-tick.svg", "tick 시간 — 평균은 게이트웨이 2개 구성에서 줄었고, 꼬리(p99)는 줄었다고 확인 안 됨", "tick 예산 50 ms(20 Hz) · 막대 = 중앙값, 검은 선 = 런별 최소~최대 · 두 선이 겹치면 런 편차 안", [
    { heading: "tick 평균", rows: [
      { label: "monolith 700명", a: 18.91, b: 18.5, fmt: ms, aRange: [18.77, 19.46], bRange: [18.3, 18.95], scaleMax: 32, neutral: true, deltaNote: "편차 안" },
      { label: "게이트웨이 2개 · 1150명", a: 15.63, b: 13.7, fmt: ms, aRange: [14.94, 16.13], bRange: [13.37, 14.12], scaleMax: 32 },
      { label: "게이트웨이 2개 · 1200명", a: 16.39, b: 15.08, fmt: ms, aRange: [15.53, 17.03], bRange: [14.75, 15.43], scaleMax: 32 },
    ] },
    { heading: "tick p99 (가장 느린 1% — 수용 인원 한계를 정하는 기준 25 ms)", rows: [
      { label: "monolith 700명", a: 24.48, b: 24.49, fmt: ms, aRange: [23.06, 26.41], bRange: [22.65, 26.85], scaleMax: 32, neutral: true, deltaNote: "편차 안" },
      { label: "게이트웨이 2개 · 1150명", a: 27.16, b: 23.14, fmt: ms, aRange: [24.81, 27.79], bRange: [20.29, 23.3], scaleMax: 32, neutral: true, deltaNote: "판정 보류*" },
      { label: "게이트웨이 2개 · 1200명", a: 26.72, b: 27.04, fmt: ms, aRange: [24.87, 30.9], bRange: [23.43, 27.52], scaleMax: 32, neutral: true, deltaNote: "편차 안" },
    ] },
  ], {
    footnote: [
      "* 1150명 p99는 런 범위가 겹치지 않지만(3런 모두 B가 낮음), 같은 코드를 두 사본에서 돌린 대조 쌍도 최대 3.8 ms 차이가 났다 —",
      "   차이(4.0 ms)가 그만큼이라 개선이라고 단정하지 않았다.",
    ],
  });

  const cnt = (v: number) => `${Math.round(v).toLocaleString("en-US")}회`;
  const gib = (v: number) => `${v.toFixed(1)} GiB`;
  pairChart("12-result-gc.svg", "GC(메모리 청소) — monolith는 줄었고, 월드 eden·할당 추정은 늘었다", "GC 로그 런(1회 ≈45–51초) 평균 · eden = 짧은 청소 횟수, 할당 추정 = 런 동안 새로 만든 메모리 양 · 눈금은 지표마다 공통", [
    { heading: "monolith 700명 (2쌍)", rows: [
      { label: "eden 청소 횟수", a: 1990, b: 1714.5, fmt: cnt, scaleMax: 2800 },
      { label: "할당 추정", a: 20.25, b: 18.55, fmt: gib, scaleMax: 60, deltaNote: "다른 방법은 −11%" },
    ] },
    { heading: "월드 · 게이트웨이 2개 1200명 (2쌍)", rows: [
      { label: "eden 청소 횟수 (하한*)", a: 2447.5, b: 2651, fmt: cnt, scaleMax: 2800, warn: true, deltaNote: "원인 미확인" },
      { label: "할당 추정", a: 45.3, b: 57.75, fmt: gib, scaleMax: 60, warn: true, deltaNote: "원인 미확인" },
    ] },
  ], { footnote: [
    "* 프로세스 4개의 GC 로그가 한 파일에 섞여 월드 수집 일부(≈2–6%)를 세지 못한다 — A·B 모두 같은 방식이라 방향 비교는 유효.",
    "full(전체 청소)은 줄었다 — 월드 ≥40–43 → ≥27회, monolith 23–24 → 19회. 꼬리와의 관계는 미확인.",
    "처음 동기였던 \"이동 입력 JSON이 GC의 주원인\" 가설은 B2b 측정에서 기각 — JSON을 다 걷어낸 지금도 월드 eden은 줄지 않았다.",
    "월드 증가분의 원인(B4~B6 커밋인지, 측정 방식인지)은 미확인 → 다음 작업: 두 커밋에서 할당 프로파일.",
  ] });
}

// ── 12. CPU 배치 함정 ───────────────────────────────────────────────────────────────────────────────
function placement(): void {
  const W = 900;
  let body = header(W, "측정의 함정 — CPU 배치가 결과를 바꿨다", "B2b·B3b 측정에서 늘 'B 쪽이 2 ms 느리다'가 나왔다. 원인은 코드가 아니라 A 서버가 놓인 CPU였다");
  const cores = (ox: number, oy: number, title: string, aOnLoadgen: boolean) => {
    let out = t(ox, oy, title, { size: 13.5, weight: 700 });
    const map: Record<number, [string, string]> = {};
    for (const c of [0, 1, 8, 9, 10, 11]) map[c] = ["부하", "#e4e7eb"];
    for (const c of [2, 3]) map[c] = ["서버", C.wall];
    for (const c of [4, 5, 6, 7]) map[c] = ["게이트웨이", "#9aa5b1"];
    const aCores = aOnLoadgen ? [0, 1, 8, 9, 10, 11] : [2, 3];
    for (let c = 0; c < 12; c++) {
      const x = ox + c * 34;
      const y = oy + 12;
      const [, color] = map[c]!;
      out += r(x, y, 30, 30, color, { rx: 4 }) + t(x + 15, y + 20, String(c), { size: 12, anchor: "middle", fill: color === "#e4e7eb" ? C.ink : "#fff", weight: 700 });
      const tags = [...(aCores.includes(c) ? ["A"] : []), ...(c === 2 || c === 3 ? ["B"] : [])];
      tags.forEach((tag, i) => {
        const bw = 30 / tags.length;
        out += r(x + i * bw, y + 33, bw - 1, 13, tag === "A" ? C.a : C.b, { rx: 2 }) + t(x + i * bw + bw / 2, y + 43, tag, { size: 9.5, anchor: "middle", fill: tag === "A" ? C.ink : "#fff", weight: 700 });
      });
    }
        out += t(ox, oy + 80, aOnLoadgen ? "A 서버 → 부하 생성기 CPU(0,1,8–11)에 같이 놓임 ✗" : "A 서버도 2,3에 고정 — 대칭 ✓", { size: 12, weight: 700, fill: aOnLoadgen ? C.bad : C.good });
    return out;
  };
  body += cores(24, 92, "B2b·B3b 측정 (pinmon이 ~/mmorpg만 서버로 인식)", true);
  body += cores(470, 92, "B6 최종 측정 (pinmon 수정)", false);
  body += legend(24, 204, [["#e4e7eb", "0,1,8–11 부하 생성기"], [C.wall, "2,3 monolith·월드 (물리 코어 1개)"], ["#9aa5b1", "4,5 / 6,7 게이트웨이 1·2"], [C.a, "A 서버 위치"], [C.b, "B 서버 위치"]]);
  // flush 비교
  const by = 240;
  body += t(24, by, "monolith 700명 소켓 쓰기(flush) 시간 — 낮을수록 빠름", { size: 14, weight: 700 });
  const rows: [string, number, number, string, string][] = [
    ["B2b 측정 (A 서버만 부하 CPU)", 11.35, 13.3, "A 11.2–11.5", "B 13.1–13.5"],
    ["B6 대조: 같은 커밋·대칭 배치", 13.38, 13.37, "A 13.38", "B 13.37"],
    ["B6 재현: 같은 커밋·A만 부하 CPU", 10.89, 13.3, "A 10.7–11.1", "B 13.3"],
  ];
  let y = by + 16;
  const bx = 330;
  const scale = 30;
  for (const [label, a, b, al, bl] of rows) {
    body += t(24, y + 22, label, { size: 12.5 });
    body += r(bx, y + 4, a * scale, 15, C.a, { rx: 2 }) + t(bx + a * scale + 6, y + 16, `${al} ms`, { size: 11, fill: C.sub });
    body += r(bx, y + 23, b * scale, 15, C.b, { rx: 2 }) + t(bx + b * scale + 6, y + 35, `${bl} ms`, { size: 11, fill: C.b, weight: 700 });
    y += 52;
  }
  body += r(24, y + 4, W - 48, 76, C.panel, { rx: 6 });
  body += t(40, y + 26, "결론: 커밋과 의존성이 같아도 A만 부하 생성기 CPU에 두면 'B 쪽 flush +2 ms(재현 +2.3–2.5) · 게이트웨이 2개 구성 부하 생성기 CPU +28%'가 그대로 나타난다.", { size: 12 });
  body += t(40, y + 46, "→ B2b·B3b의 시간·CPU 비교는 무효(이 측정이 대체), 바이트·GC 횟수는 방향만 유효. 전용 코어(2,3) 고정이 보수적인 기준이다.", { size: 12, fill: C.sub });
  body += t(40, y + 66, "교훈: 교차 측정은 런마다 프로세스가 어느 CPU에 놓였는지(pin 이벤트)부터 확인한다 — ~/an/pincheck.py", { size: 12, fill: C.sub });
  svg("08-placement.svg", W, y + 96, body, "CPU 배치 함정");
}

headline();
wireFormat();
packetSizes();
progress();
moveLimits();
moveToFlow();
wallSlide();
results();
placement();
