// Bun 1.4.3 전환 결과 보고서(docs/reports/bun-1.4.3-2026-10.md) 그림 생성기 — usage: bun run gen.ts <outDir>
// 데이터 출처: docs/perf-baseline.md "Bun 1.4.3 전환" 절(측정 PC WSL ~/perf-bun14·~/perf-bun14b·~/perf-bun142) — 후속 측정(수용 인원·GC 페이서·소크, 09–11)은
// data.ts에 채우면 그 그림이 생긴다. 수치를 고칠 때는 아래 데이터 상수를 고친다.
import { C, divergingChart, header, legend, linePanel, ln, pairChart, r, svgWriter, t, type DivRow, type Series } from "../svgkit";
import { CAP, PACE, SOAK } from "./data";

const write = svgWriter(process.argv[2] ?? "out");
const A = "Bun 1.3.13 (마지막 기준)";
const B = "Bun 1.4.3";

// ── 01 핵심 변화 ───────────────────────────────────────────────────────────────────────────────────
function headline(): void {
  const capacityRows: [string, DivRow[]][] = [
    ["수용 인원 (tick p99 25 ms 교차점 — 클수록 좋음)", [
      { label: "monolith (서버 1개)", v: -CAP.monoGainPct, note: CAP.monoNote, kind: CAP.monoKind, text: CAP.monoText },
      { label: "게이트웨이 2개 구성", v: -CAP.n2GainPct, note: CAP.n2Note, kind: CAP.n2Kind, text: CAP.n2Text },
    ]],
  ];
  const groups: [string, DivRow[]][] = [
    ...(CAP.mono.b.length > 0 ? capacityRows : []),
    ["CPU (같은 부하)", [
      { label: "monolith 서버 CPU", v: -23, note: "0.61 → 0.47 코어 (700명)", kind: "good" },
      { label: "월드 CPU (게이트웨이 2개 구성)", v: -41, note: "0.68–0.71 → 0.40–0.42 코어 (1150·1200명)", kind: "good" },
      { label: "게이트웨이 CPU (2개 합)", v: -19, note: "0.90–0.93 → 0.74 코어", kind: "good", text: "−18~20%" },
    ]],
    ["tick (서버 갱신 1회 시간)", [
      { label: "tick 평균 — 게이트웨이 2개 구성", v: -24, note: "13.96 → 10.59 ms (1150명) · 1200명도 −24%", kind: "good" },
      { label: "tick p99 — 게이트웨이 2개 구성", v: -26, note: "22.88 → 16.26 (1150명) · 24.86* → 19.09 ms (1200명, *경합 런 — 본문 6장)", kind: "good", text: "−23~29%" },
      { label: "tick 평균·p99 — monolith 700명", v: -10, note: "18.56 → 16.79 · 24.57 → 22.05 ms (봇 1.3.13 고정 조건, p99 범위 살짝 겹침)", kind: "good" },
    ]],
    ["GC · 메모리", [
      { label: "eden(짧은 청소) 수집 횟수", v: -56, note: "런당 monolith ≈1,700 → ≈150 · 월드 ≈2,530 → ≈167", kind: "good", text: "−91~95%" },
      { label: "유휴 메모리 (RSS)", v: -36, note: "91–94 → 59–61 MB · 집계 방식 변경, 참고값", kind: "hold", text: "−36% (참고)" },
    ]],
    ["봇이 잰 지연 (같은 PC 안 봇 기준)", [
      { label: "왕복 지연 rtt99", v: -26, note: "monolith 25.0 → 19.8 · 게이트웨이 2개 31.7 → 22.2 ms", kind: "good", text: "−21~30%" },
    ]],
  ];
  divergingChart(write, "01-headline.svg", "Bun 1.3.13 → 1.4.3 — 무엇이 얼마나 바뀌었나",
    "같은 코드(B6 이후)·같은 CPU 배치에서 서버 런타임만 바꿈 · 시간·CPU는 중앙값, GC는 2쌍 평균 · eden 막대만 눈금 밖이라 끊어 그림", groups);
}

// ── 02 왜 — GC 샘플러 ─────────────────────────────────────────────────────────────────────────────
function why(): void {
  const W = 900;
  let body = header("왜 GC가 1/10 이하로 줄었나 — 1.3.x의 이벤트 루프 GC 샘플러", "개념도(500 ms 구간) · 1.3.13 줄은 샘플러의 이론상 최대(16 ms마다 = 초당 62.5회) — 실측 평균은 초당 약 38회(monolith)·50회(월드), 1.4.3은 약 3회");
  const lane = (y: number, label: string, sub: string, marks: number[], color: string) => {
    let out = t(24, y + 4, label, { size: 13.5, weight: 700 }) + t(24, y + 22, sub, { size: 11, fill: C.faint });
    const x0 = 300;
    const w = 560;
    out += ln(x0, y + 10, x0 + w, y + 10, C.grid, { sw: 2 });
    for (let k = 0; k <= 10; k++) out += ln(x0 + (k * w) / 10, y + 4, x0 + (k * w) / 10, y + 16, C.faint) + (k % 2 === 0 ? t(x0 + (k * w) / 10, y + 32, `${k * 50}ms`, { size: 9.5, anchor: "middle", fill: C.faint }) : "");
    for (const m of marks) out += r(x0 + (m / 500) * w - 2, y - 4, 4, 28, color, { rx: 1 });
    return out;
  };
  const dense: number[] = [];
  for (let ms = 8; ms < 500; ms += 16) dense.push(ms);
  body += t(300, 86, "눈금 = tick 50 ms · 막대 = eden 수집", { size: 11, fill: C.sub });
  body += lane(110, "Bun 1.3.13", "루프가 바쁘면 16 ms마다 다시 GC 예약", dense, C.a);
  body += lane(175, "Bun 1.4.3", "할당 예산이 찰 때 + GC 페이서(측정 당시 8 tick마다)", [170, 400], C.b);
  body += t(300 + (400 / 500) * 560, 222, "페이서", { size: 10, anchor: "middle", fill: C.b });
  body += r(24, 230, W - 48, 92, C.panel, { rx: 6 });
  body += t(40, 252, "1.3.x는 이벤트 루프가 돌 때마다 힙을 재서, 값이 바뀌었으면 16 ms 뒤 GC를 다시 걸었다 — 루프가 계속 바쁘면 할당량과 무관하게", { size: 12 });
  body += t(40, 270, "eden이 최대 초당 ≈62.5회까지 이어진다(PR #35356, 1.4.0에서 제거). 20 Hz tick + 상시 소켓 I/O인 이 서버가 정확히 그 조건이었다.", { size: 12 });
  body += t(40, 292, "그래서 이진 전환(B2b·B3b·B6)으로 JSON을 걷어내도 월드 eden 횟수가 줄지 않았던 것으로 보인다 — 런타임만 바꾸자 1/10 이하가 됐다.", { size: 12, fill: C.sub });
  body += t(40, 310, "1.4.2(샘플러 없음, 1.4.3의 메모리 집계 수정도 없음)에서도 같은 감소 → 1.4.0~1.4.2 변경이 유력 원인이다(할당기 교체와는 미분리).", { size: 12, fill: C.sub });
  write("02-why.svg", W, 340, body, "GC 샘플러 개념도");
}

// ── 03 측정 방법 ─────────────────────────────────────────────────────────────────────────────────
function method(): void {
  const W = 900;
  let body = header("어떻게 쟀나 — 서버 런타임만 바꾸고 나머지는 고정", "같은 커밋·같은 체크아웃·같은 CPU 배치, A·B 순서 교차 · 부하 생성기는 언제나 Bun 1.3.13");
  const box = (x: number, y: number, w: number, h: number, lines: string[], fill: string, stroke: string) => {
    let out = r(x, y, w, h, fill, { rx: 8, stroke, sw: 1.3 });
    lines.forEach((s, i) => {
      out += t(x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * 17 + 5, s, { size: i === 0 ? 13 : 11.5, weight: i === 0 ? 700 : 400, anchor: "middle", fill: i === 0 ? C.ink : C.sub });
    });
    return out;
  };
  body += box(24, 86, 250, 96, ["부하 생성기 (봇 700·1,150·1,200명)", "오케스트레이터 + 샤드", "Bun 1.3.13 고정 · CPU 0,1,8–11"], C.panel, C.faint);
  body += box(330, 86, 250, 96, ["서버 (monolith 또는 월드)", "--server-bun 으로 선택", "A = 1.3.13 · B = 1.4.3 · CPU 2,3"], "#e8f0fd", C.b);
  body += box(636, 86, 240, 96, ["게이트웨이 2개 (확장 구성)", "슈퍼바이저의 bun을 물려받음", "CPU 4,5 / 6,7"], "#e8f0fd", C.b);
  body += ln(274, 134, 326, 134, C.ink, { arrow: "ar-ink", sw: 1.4 }) + ln(580, 134, 632, 134, C.ink, { arrow: "ar-ink", sw: 1.4 });
  body += r(24, 200, W - 48, 112, C.panel, { rx: 6 });
  body += t(40, 222, "· 부하 생성기를 고정한 이유: 부하 생성기까지 1.4.3이면 monolith의 소켓 쓰기(flush)가 13 → 17 ms로 바뀐다(같은 PC 안 수신 측 동작).", { size: 12 });
  body += t(40, 242, "· 정상 확인: A·B의 부하 생성기 CPU·주고받은 바이트가 같았다 — 부하는 같고 서버 런타임만 다르다.", { size: 12 });
  body += t(40, 262, "· CPU 고정 확인: 런마다 프로세스가 정해진 CPU에 있었는지 검사했다(핀 이탈 0). 스레드 수 검사는 측정 뒤 추가했고 런 1개가 걸렸다(6장).", { size: 12 });
  body += t(40, 282, "· 시나리오 spread: 봇이 맵에 고르게 퍼져 계속 이동, 조인 초당 100명, 측정 창 30초 — 24런 모두 20 Hz를 유지했다.", { size: 12 });
  body += t(40, 302, "· 기능: 전체 시험(Windows·Linux)과 실소켓·IPC 동작 프로브를 두 버전에서 비교했다.", { size: 12, fill: C.sub });
  write("03-method.svg", W, 330, body, "측정 방법");
}

// ── 04 CPU·tick ────────────────────────────────────────────────────────────────────────────────
function cpuTick(): void {
  const ms = (v: number) => `${v.toFixed(2)} ms`;
  const core = (v: number) => `${v.toFixed(2)} 코어`;
  pairChart(write, "04-cpu-tick.svg", "CPU와 tick 시간 — 같은 부하에서", "접속 인원별 중앙값(monolith 5런, 게이트웨이 2개 구성 3런) · 검은 선 = 런별 최소~최대(화살촉 = 눈금 밖) · 눈금은 묶음마다 공통", [
    { heading: "CPU 사용량", scaleMax: 1.0, rows: [
      { label: "monolith 서버 · 700명", a: 0.61, b: 0.47, fmt: core, aRange: [0.59, 0.64], bRange: [0.46, 0.48] },
      { label: "월드 · 1150명", a: 0.68, b: 0.4, fmt: core, aRange: [0.67, 0.7], bRange: [0.4, 0.4] },
      { label: "월드 · 1200명", a: 0.71, b: 0.42, fmt: core, aRange: [0.71, 0.72], bRange: [0.41, 0.42] },
      { label: "게이트웨이 2개 합 · 1200명", a: 0.93, b: 0.74, fmt: core, aRange: [0.9, 0.93], bRange: [0.74, 0.78] },
    ] },
    { heading: "tick 평균", scaleMax: 32, rows: [
      { label: "monolith 700명", a: 18.56, b: 16.79, fmt: ms, aRange: [17.99, 19.11], bRange: [16.68, 17.32] },
      { label: "게이트웨이 2개 · 1150명", a: 13.96, b: 10.59, fmt: ms, aRange: [13.53, 14.47], bRange: [10.56, 10.71] },
      { label: "게이트웨이 2개 · 1200명", a: 15.4, b: 11.66, fmt: ms, aRange: [15.01, 15.69], bRange: [11.24, 11.79] },
    ] },
    { heading: "tick p99 (가장 느린 1% — 수용 인원 한계 기준 25 ms)", scaleMax: 32, rows: [
      { label: "monolith 700명", a: 24.57, b: 22.05, fmt: ms, aRange: [22.38, 26.26], bRange: [21.54, 22.51], deltaNote: "범위 살짝 겹침" },
      { label: "게이트웨이 2개 · 1150명", a: 22.88, b: 16.26, fmt: ms, aRange: [19.87, 23.33], bRange: [15.89, 16.32] },
      { label: "게이트웨이 2개 · 1200명", a: 24.86, b: 19.09, fmt: ms, aRange: [22.01, 37.37], bRange: [17.75, 19.39], deltaNote: "1.3.13 최대 37.4" },
    ] },
  ], { aLabel: A, bLabel: B, footnote: ["monolith는 봇(부하 생성기) 1.3.13 고정 조건의 값 — 봇도 1.4.3이면 monolith tick이 길어 보인다(같은 PC 안 수신 측 효과, 본문 6장).", "1,200명 p99의 1.3.13 중앙값 런(24.86 ms)은 측정 도구 경합 런이다(본문 6장) — 빼도 1.3.13 런(22.01·37.37)이 1.4.3 최대(19.39)보다 길다."] });
}

// ── 05 GC·메모리 ───────────────────────────────────────────────────────────────────────────────
function gcMem(): void {
  const cnt = (v: number) => (Number.isInteger(v) || v >= 100 ? `${Math.round(v).toLocaleString("en-US")}회` : `${v.toFixed(1)}회`);
  const mb = (v: number) => `${v.toFixed(0)} MB`;
  pairChart(write, "05-gc-memory.svg", "GC(메모리 청소)와 메모리 — 런 1회(≈45–51 s, 램프 포함)", "GC 로그 런 2쌍 평균 · eden = 짧은 청소, full = 전체 청소 · 힙·RSS는 런타임 계정이 바뀌어 참고값", [
    { heading: "eden 수집 횟수", scaleMax: 2700, rows: [
      { label: "monolith 700명", a: 1700, b: 148.5, fmt: cnt },
      { label: "월드 · 1200명", a: 2530.5, b: 166.5, fmt: cnt, note: "1.3.13은 하한(로그 섞임)" },
      { label: "게이트웨이 1개 평균 · 1200명", a: 2444, b: 111, fmt: cnt },
    ] },
    { heading: "full 수집 횟수", scaleMax: 32, rows: [
      { label: "monolith 700명", a: 19.5, b: 15.5, fmt: cnt },
      { label: "월드 · 1200명", a: 28, b: 20.5, fmt: cnt },
    ] },
    { heading: "메모리", scaleMax: 140, rows: [
      { label: "유휴 RSS (측정 전)", a: 92.6, b: 59.6, fmt: mb, neutral: true, deltaNote: "참고값" },
      { label: "힙 최대 — monolith", a: 66.9, b: 58.1, fmt: mb, neutral: true, deltaNote: "참고값" },
      { label: "힙 최대 — 월드", a: 133.7, b: 118.7, fmt: mb, neutral: true, deltaNote: "참고값" },
    ] },
  ], { aLabel: A, bLabel: B });
}

// ── 06 클라 체감 ─────────────────────────────────────────────────────────────────────────────────
function client(): void {
  const ms = (v: number) => `${v.toFixed(1)} ms`;
  pairChart(write, "06-client.svg", "봇이 잰 지연 — 왕복(rtt99)·스냅샷 지연 증가(lag99)", "같은 PC 안 봇 기준, 중앙값 · rtt99 = PING 왕복의 99번째 백분위 · lag99 = 스냅샷 도착 지연이 측정 창 동안 늘어난 정도(봇별, 99번째)", [
    { heading: "rtt99", scaleMax: 40, rows: [
      { label: "monolith 700명", a: 25.0, b: 19.8, fmt: ms, aRange: [22.2, 26.0], bRange: [19.0, 20.6] },
      { label: "게이트웨이 2개 · 1150명", a: 31.7, b: 22.2, fmt: ms, aRange: [27.1, 32.9], bRange: [21.4, 23.1] },
      { label: "게이트웨이 2개 · 1200명", a: 34.2, b: 24.1, fmt: ms, aRange: [31.7, 84.4], bRange: [22.2, 25.0], deltaNote: "1.3.13 최대 84.4" },
    ] },
    { heading: "lag99", scaleMax: 60, rows: [
      { label: "monolith 700명", a: 19.8, b: 15.6, fmt: ms, aRange: [14.4, 26.0], bRange: [13.9, 18.3], neutral: true, deltaNote: "범위 겹침" },
      { label: "게이트웨이 2개 · 1150명", a: 34.2, b: 32.9, fmt: ms, aRange: [31.7, 41.7], bRange: [22.1, 41.2], neutral: true, deltaNote: "편차 안" },
      { label: "게이트웨이 2개 · 1200명", a: 52.5, b: 36.7, fmt: ms, aRange: [45.1, 139.3], bRange: [34.2, 54.8], neutral: true, deltaNote: "겹침·최대 139.3" },
    ] },
  ], { aLabel: A, bLabel: B });
}

// ── 07 원인 분리 — 1.4.2 ──────────────────────────────────────────────────────────────────────────
function separation(): void {
  const W = 900;
  let body = header("원인 분리 — 1.4.2(샘플러 없음 · 1.4.3 집계 수정 없음)도 eden이 거의 같다", "런 1회 수집 횟수(GC 로그, 평균) · 1.3.13·1.4.3은 4.2와 같은 본 측정 값 · 1.4.2는 별도 묶음(횟수만 사용)");
  body += legend(24, 80, [[C.a, "1.3.13"], [C.c3, "1.4.2"], [C.b, "1.4.3"]]);
  const groups: [string, number, number, number, number][] = [
    ["monolith eden", 1700, 148.5, 148.5, 2000],
    ["월드 eden", 2530.5, 185.5, 166.5, 2800],
    ["게이트웨이 eden (1개 평균)", 2444, 102, 111, 2800],
    ["게이트웨이 full (1개 평균)", 11.75, 35.5, 2.75, 40],
  ];
  let y = 100;
  for (const [label, a, m, b, max] of groups) {
    body += t(24, y + 26, label, { size: 13 });
    const x0 = 250;
    const w = 520;
    const rows: [number, string][] = [[a, C.a], [m, C.c3], [b, C.b]];
    rows.forEach(([v, color], i) => {
      const bw = (v / max) * w;
      body += r(x0, y + i * 16, bw, 13, color, { rx: 2 }) + t(x0 + bw + 6, y + i * 16 + 11, Math.round(v).toLocaleString("en-US"), { size: 11, fill: color === C.a ? C.sub : color, weight: 700 });
    });
    y += 64;
  }
  body += r(24, y + 4, W - 48, 74, C.panel, { rx: 6 });
  body += t(40, y + 26, "· eden 감소는 1.4.2에 이미 있다 → 1.4.3에만 들어간 메모리 집계 수정(WebKit#684)은 eden 감소의 원인이 아니다.", { size: 12 });
  body += t(40, y + 46, "· #684의 효과는 게이트웨이 full에서 보인다(1.4.2 32–40 → 1.4.3 2–4회) — 버퍼를 많이 쓰는 게이트웨이의 메모리 집계가 바로잡혔다.", { size: 12 });
  body += t(40, y + 66, "· 1.4.0~1.4.2 안에서 샘플러 제거와 할당기 교체(mimalloc) 등을 더 가르지는 않았다 → 그래서 \"유력 원인\"이다.", { size: 12, fill: C.sub });
  write("07-separation.svg", W, y + 96, body, "원인 분리");
}

// ── 09 수용 인원 곡선 ────────────────────────────────────────────────────────────────────────────
function capacity(): void {
  const W = 900;
  let body = header("수용 인원 — tick p99가 25 ms를 넘는 지점", `레벨별 중앙값(점)·런별 최소~최대(세로선) · 교차점(세로 눈금선)은 오전 중앙값 사이 보간 · ${CAP.subtitleNote}`);
  body += legend(24, 80, [[C.a, A], [C.b, B]]);
  const mk = (pts: readonly (readonly [number, number, number, number])[], label: string, color: string): Series => ({
    label, color, points: pts.map(([x, med]) => [x, med] as const), ranges: pts.map(([x, , lo, hi]) => [x, lo, hi] as const),
  });
  // 오후 한 묶음(호스트 바쁨) — 같은 색 점선.
  const late = (pts: readonly (readonly [number, number, number, number])[], label: string, color: string): Series => ({ ...mk(pts, label, color), dash: "5 4" });
  body += linePanel({
    x: 70, y: 120, w: 340, h: 250, title: "monolith (서버 1개)", xMin: CAP.mono.xMin, xMax: CAP.mono.xMax, yMin: 10, yMax: CAP.mono.yMax,
    xTicks: CAP.mono.xTicks, yTicks: CAP.mono.yTicks, xLabel: "동시 접속(명)", yLabel: "tick p99 (ms)",
    series: [mk(CAP.mono.a, A, C.a), mk(CAP.mono.b, B, C.b), late(CAP.mono.a2, A, C.a), late(CAP.mono.b2, B, C.b)],
    hlines: [{ y: 25, label: "25 ms", color: C.bad }],
    vmarks: [{ x: CAP.mono.crossA, label: CAP.mono.crossALabel, color: C.sub }, { x: CAP.mono.crossB, label: CAP.mono.crossBLabel, color: C.b, dy: 16 }],
  });
  body += linePanel({
    x: 520, y: 120, w: 340, h: 250, title: "게이트웨이 2개 구성", xMin: CAP.n2.xMin, xMax: CAP.n2.xMax, yMin: 10, yMax: CAP.n2.yMax,
    xTicks: CAP.n2.xTicks, yTicks: CAP.n2.yTicks, xLabel: "동시 접속(명)", yLabel: "tick p99 (ms)",
    series: [mk(CAP.n2.a, A, C.a), mk(CAP.n2.b, B, C.b), late(CAP.n2.a2, A, C.a), late(CAP.n2.b2, B, C.b)],
    hlines: [{ y: 25, label: "25 ms", color: C.bad }],
    vmarks: [{ x: CAP.n2.crossA, label: CAP.n2.crossALabel, color: C.sub, end: CAP.n2.crossAEnd }, { x: CAP.n2.crossB, label: CAP.n2.crossBLabel, color: C.b }],
  });
  let y = 420;
  for (const line of CAP.footnotes) {
    body += t(24, y, line, { size: 11.5, fill: C.sub });
    y += 18;
  }
  write("09-capacity.svg", W, y + 10, body, "수용 인원 곡선");
}

// ── 10 GC 페이서 재튜닝 ──────────────────────────────────────────────────────────────────────────
function pacer(): void {
  const ms = (v: number) => `${v.toFixed(2)} ms`;
  const W = 920;
  let body = header("GC 페이서 재튜닝 — 1.4.3에서 몇 tick마다 GC를 요청할까", PACE.subtitle);
  body += legend(24, 80, PACE.keys.map((k, i) => [PACE.colors[i] ?? C.sub, k.label] as const));
  let y = 106;
  for (const g of PACE.groups) {
    body += t(24, y + 14, g.heading, { size: 13.5, weight: 700, fill: C.sub }) + ln(24, y + 21, W - 24, y + 21, C.grid);
    y += 30;
    for (const row of g.rows) {
      body += t(24, y + 15, row.label, { size: 13 });
      if (row.note) body += t(24, y + 32, row.note, { size: 11, fill: C.faint });
      const x0 = 300;
      const w = 420;
      if (row.text) body += t(x0, y + 15, row.text, { size: 12, fill: C.sub });
      row.vals.forEach((v, i) => {
        const bw = (Math.min(v, g.scaleMax) / g.scaleMax) * w;
        const color = PACE.colors[i] ?? C.sub;
        body += r(x0, y + i * 14, bw, 11, color, { rx: 2 }) + t(x0 + bw + 6, y + i * 14 + 10, row.fmt === "count" ? `${Math.round(v)}회` : ms(v), { size: 10.5, fill: color, weight: 700 });
      });
      y += Math.max(44, row.vals.length * 14 + 8);
    }
    y += 6;
  }
  body += r(24, y + 4, W - 48, 22 + PACE.conclusion.length * 18, C.panel, { rx: 6 });
  PACE.conclusion.forEach((line, i) => {
    body += t(40, y + 24 + i * 18, line, { size: 12, fill: i === 0 ? C.ink : C.sub, weight: i === 0 ? 700 : 400 });
  });
  write("10-pacer.svg", W, y + 40 + PACE.conclusion.length * 18, body, "GC 페이서 재튜닝");
}

// ── 11 장시간 소크 ───────────────────────────────────────────────────────────────────────────────
function soak(): void {
  const W = 900;
  let body = header(`장시간 소크 — ${SOAK.title}`, SOAK.subtitle);
  const panels = [
    { key: "rss", title: "프로세스 RSS (MB)", yMax: SOAK.rssMax, yTicks: SOAK.rssTicks, color: C.b },
    { key: "p99", title: "tick p99 (1분 창, ms)", yMax: 50, yTicks: [0, 10, 20, 25, 30, 40, 50], color: C.warn },
    { key: "gc", title: "GC 수집 (분당 횟수 — 초록 eden · 빨강 full)", yMax: SOAK.gcMax, yTicks: SOAK.gcTicks, color: C.good },
  ] as const;
  panels.forEach((p, i) => {
    const series: Series[] = [{ label: p.title, color: p.color, points: SOAK.series[p.key], dots: false }];
    if (p.key === "gc") series.push({ label: "full", color: C.bad, points: SOAK.series.full, dots: false });
    body += linePanel({
      x: 70, y: 100 + i * 190, w: 790, h: 130, title: p.title, xMin: 0, xMax: SOAK.minutes, yMin: 0, yMax: p.yMax,
      xTicks: SOAK.xTicks, yTicks: p.yTicks, xLabel: i === panels.length - 1 ? "경과 시간(분)" : "", yLabel: "",
      series, ...(p.key === "p99" ? { hlines: [{ y: 25, label: "25 ms", color: C.bad }] } : {}),
    });
  });
  let y = 100 + panels.length * 190 + 6;
  for (const line of SOAK.footnotes) {
    body += t(24, y, line, { size: 11.5, fill: C.sub });
    y += 18;
  }
  write("11-soak.svg", W, y + 10, body, "장시간 소크");
}

// ── 08 측정 도구 교훈 — 런타임 스레드 수 경합 ───────────────────────────────────────────────────────────
function harness(): void {
  const W = 900;
  let body = header("측정 도구 교훈 — 서버 스레드 수는 \"처음 본 CPU 수\"로 정해진다", "pinmon이 런타임 초기화보다 먼저 CPU를 묶으면 GC 마커·작업 스레드가 줄어든다(두 버전 모두 발생 — 3회) · 개념도");
  const lane = (y: number, label: string, pinAt: number, threads: string, ok: boolean) => {
    const x0 = 230;
    const w = 600;
    const sx = (ms: number) => x0 + (ms / 1500) * w;
    let out = t(24, y + 14, label, { size: 13, weight: 700, fill: ok ? C.good : C.bad });
    out += ln(x0, y + 10, x0 + w, y + 10, C.grid, { sw: 2 });
    out += r(sx(0), y, sx(260) - sx(0), 20, C.soft, { rx: 3 }) + t(sx(150), y + 14, "런타임 초기화", { size: 10.5, anchor: "middle", fill: C.ink });
    out += ln(sx(pinAt), y - 6, sx(pinAt), y + 26, ok ? C.good : C.bad, { sw: 2.2 }) + t(sx(pinAt) + 6, y - 10, `pinmon 고정 (${pinAt} ms)`, { size: 10.5, fill: ok ? C.good : C.bad, weight: 700 });
    out += t(x0 + w, y + 40, threads, { size: 11, anchor: "end", fill: C.sub });
    return out;
  };
  body += lane(96, "보통 (경합 없음)", 600, "초기화 때 CPU 6개(부하 생성기에서 물려받음)가 보임 → GC 마커(HeapHelper) 5 · 작업 풀 6", true);
  body += lane(160, "경합 (드물게)", 60, "초기화 때 CPU 2개만 보임 → HeapHelper 1 · 작업 풀 2 → 로그인(bcrypt) 지연·인증 전 끊김", false);
  body += r(24, 222, W - 48, 74, C.panel, { rx: 6 });
  body += t(40, 244, "조치: pinmon이 뜬 지 1초가 안 된 프로세스는 고정하지 않게 고쳤고(PINMON_MIN_AGE_S), pincheck가 서버별 HeapHelper 수를 검사한다.", { size: 12 });
  body += t(40, 264, "운영은 CPU를 고정하지 않아 무관하지만, 컨테이너 cpuset처럼 허용 CPU가 적으면 bcrypt 동시 처리량·GC 마커 수가 그만큼 준다.", { size: 12, fill: C.sub });
  body += t(40, 284, "다른 교훈: 런타임 비교는 부하 생성기 bun을 고정한다(부하 생성기 런타임이 바뀌면 monolith flush가 13 → 17 ms로 움직인다).", { size: 12, fill: C.sub });
  write("08-harness.svg", W, 312, body, "하네스 교훈");
}

headline();
why();
method();
cpuTick();
gcMem();
client();
separation();
harness();
// 후속 측정(수용 인원·GC 페이서·소크) — data.ts가 채워지면 그린다.
if (CAP.mono.b.length > 0) capacity();
if (PACE.groups.length > 0) pacer();
if (SOAK.series.rss.length > 0) soak();
