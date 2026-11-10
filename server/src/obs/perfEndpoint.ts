// dev 전용 GET /admin/perf(성능 2-A) — tick 계측 원자료 + 프로세스 CPU·메모리.
//
// 응답 계약(2-B loadgen `tools/loadgen/serverPerf.ts`가 의존 — 필드 이름·의미 동결, 추가만):
//   { ticks, windowMs, durationsMs[], latenessMs[], phasesMs{phase: number[]}, flushMs[],
//     cpu{userUs, systemUs}, memory{rss, heapUsed, heapTotal}, connections, entities }
//   - 링 배열은 마지막 4096 tick, 오래된 것 → 최신 순, µs 해상도로 반올림(응답 크기 절감).
//   - ticks/windowMs/cpu는 마지막 reset 이후(최초 기준점 = 엔드포인트 생성 시각). memory는 현재값.
// 쿼리(엄격 검증 — 모르는 키·중복·범위 밖은 부수효과 전에 400):
//   reset=0|1  링·CPU·벽시계 기준점 리셋. 응답은 리셋 "직전" 상태(직렬화까지 리셋 전에 끝낸다).
//   gc=0|1     메모리 샘플 전 Bun.gc(true).
//   stall=N    1..30000 ms 동안 이벤트 루프를 busy-wait로 붙잡은 뒤 응답 — 1단계 정지 처리
//              (캐치업 상한·rate drop·자동저장) 검증용. 사용은 warn 로그로 남긴다. 직전 stall이 끝난
//              뒤 그 길이만큼은 다음 stall을 429로 거부(연속 요청으로도 정지 비율 ≤ 50%).
// allowSideEffects false(게이트웨이 기본 — env GW_PERF_SIDE_EFFECTS=0)면 부수효과 쿼리(reset=1·gc=1·stall)가 든 요청은 부수효과 전에
// 403(읽기는 그대로) — 같은 호스트 프로세스가 bind-only 신뢰로 정지 주입·연속 풀 GC를 걸어 게이트웨이를 붙잡고 지연·CPU 신호로 신규
// 접속을 잠그는 레버를 막는다(4.5 리뷰·검증). 월드는 미지정 = 허용(loadgen이 reset·gc를 쓴다).
// 보안: production이면 worldMain.ts 배선(serverTick.wireTickPerf)이 엔드포인트를 만들지 않는다(라우트
// 없음 = adminHttp 기본 404). 주입되더라도 production 플래그면 같은 기본 404(헤더 지문 없음).
// 인증은 adminHttp 공통(ADMIN_TOKEN 설정 시 Bearer, 미설정 시 127.0.0.1 bind-only). GET 부수효과라
// 브라우저 경유를 막는다 —
//   - 교차 출처 Origin·Sec-Fetch-Site(cross-site/same-site)·비 loopback Host(DNS rebinding)는 403.
//   - 부수효과 쿼리(reset=1·gc=1·stall)는 Fetch Metadata(Sec-Fetch-Site/Mode)를 실은 요청이면 403 —
//     메일·채팅 링크 클릭(최상위 내비게이션, Sec-Fetch-Site: none)과 동일 출처 페이지(/admin/gm)
//     경유까지 차단. 읽기 전용 GET은 브라우저 주소창에서도 된다.
//   - CORS 헤더는 내지 않는다. curl·Bun fetch(loadgen)는 이 헤더들을 보내지 않아 그대로 통과한다.

import { createLogger } from "./logger";
import type { TickProfileSnapshot } from "./tickProfiler";

const log = createLogger("admin.perf");

/** stall 상한(ms) — 1단계 검증 시나리오(7초 정지)를 덮고 admin 요청이 무한정 걸리지 않게. */
export const PERF_STALL_MAX_MS = 30_000;

export interface PerfSources {
  profiler: { snapshot(): TickProfileSnapshot; reset(): void };
  /** 추적 중인 TCP 연결 수(미인증 포함). */
  connections(): number;
  /** 전 존 살아있는 엔티티 수. */
  entities(): number;
}

export interface CpuSample {
  user: number;
  system: number;
}

export interface MemorySample {
  rss: number;
  heapUsed: number;
  heapTotal: number;
}

export interface PerfEndpointOptions {
  /** true면 라우트 은닉(adminHttp 기본 404와 같은 응답). 운영 배선은 아예 생성하지 않는다. */
  production: boolean;
  /** 단조 시계(ms). 기본 performance.now. */
  now?: () => number;
  /** process.cpuUsage 시그니처(prev를 주면 델타). */
  cpuUsage?: (prev?: CpuSample) => CpuSample;
  memoryUsage?: () => MemorySample;
  gc?: () => void;
  /** ms 동안 이벤트 루프를 붙잡는다. 기본 busy-wait. */
  stall?: (ms: number) => void;
  /** 부수효과 쿼리(reset=1·gc=1·stall) 허용(기본 true — 월드). false면 그런 요청은 부수효과 없이 403. */
  allowSideEffects?: boolean;
}

export interface PerfQuery {
  reset: boolean;
  gc: boolean;
  /** 0 = 정지 없음. */
  stallMs: number;
}

export interface PerfResponse {
  ticks: number;
  windowMs: number;
  durationsMs: number[];
  latenessMs: number[];
  phasesMs: Record<string, number[]>;
  flushMs: number[];
  cpu: { userUs: number; systemUs: number };
  memory: MemorySample;
  connections: number;
  entities: number;
}

export interface PerfEndpoint {
  handle(req: Request, url: URL): Response;
}

const FLAG_KEYS = ["reset", "gc"] as const;
const ALLOWED_KEYS: ReadonlySet<string> = new Set([...FLAG_KEYS, "stall"]);
const STALL_RE = /^[1-9][0-9]{0,4}$/;

/** 엄격 파싱 — 성공 시 PerfQuery, 실패 시 오류 메시지. */
export function parsePerfQuery(params: URLSearchParams): PerfQuery | string {
  for (const key of new Set(params.keys())) {
    if (!ALLOWED_KEYS.has(key)) return `unknown query parameter: ${key}`;
    if (params.getAll(key).length > 1) return `duplicate query parameter: ${key}`;
  }
  const q: PerfQuery = { reset: false, gc: false, stallMs: 0 };
  for (const key of FLAG_KEYS) {
    const raw = params.get(key);
    if (raw === null) continue;
    if (raw !== "0" && raw !== "1") return `${key} must be 0 or 1`;
    q[key] = raw === "1";
  }
  const stall = params.get("stall");
  if (stall !== null) {
    const ms = STALL_RE.test(stall) ? Number(stall) : Number.NaN;
    if (!(ms >= 1 && ms <= PERF_STALL_MAX_MS)) return `stall must be an integer 1..${PERF_STALL_MAX_MS}`;
    q.stallMs = ms;
  }
  return q;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

/** 브라우저 교차 출처·DNS rebinding 신호가 없는 요청인가(curl·서버간 fetch는 통과). */
export function isNonBrowserLoopbackRequest(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin !== null) {
    try {
      if (!isLoopbackHostname(new URL(origin).hostname)) return false;
    } catch {
      return false;
    }
  }
  const site = req.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return false;
  const host = req.headers.get("host");
  if (host !== null) {
    try {
      if (!isLoopbackHostname(new URL(`http://${host}`).hostname)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** Fetch Metadata를 실은 요청 = 브라우저(Chrome 76+·Firefox 90+·Safari 16.4+). curl·Bun fetch는 없음. */
export function carriesFetchMetadata(req: Request): boolean {
  return req.headers.get("sec-fetch-site") !== null || req.headers.get("sec-fetch-mode") !== null;
}

function hasSideEffects(q: PerfQuery): boolean {
  return q.reset || q.gc || q.stallMs > 0;
}

function busyWait(ms: number): void {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // 의도적 spin — CPU 바운드 동기 정지 재현(타이머·소켓 콜백 전부 지연).
  }
}

/** µs 해상도 — 응답 크기(링 4096 × 단계 ~15개) 절감. */
function roundUs(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function roundAll(values: readonly number[]): number[] {
  return values.map(roundUs);
}

function text(status: number, body: string): Response {
  return new Response(`${body}\n`, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

/** adminHttp 기본 404와 같은 응답 — 헤더로도 라우트 존재를 드러내지 않는다. */
function notFound(): Response {
  return new Response("not found\n", { status: 404 });
}

function jsonError(status: number, error: string, headers: Record<string, string> = {}): Response {
  return Response.json({ ok: false, error }, { status, headers: { "cache-control": "no-store", ...headers } });
}

export function createPerfEndpoint(src: PerfSources, opts: PerfEndpointOptions): PerfEndpoint {
  const now = opts.now ?? (() => performance.now());
  const cpuUsage = opts.cpuUsage ?? ((prev?: CpuSample) => process.cpuUsage(prev));
  const memoryUsage = opts.memoryUsage ?? (() => process.memoryUsage());
  const gc = opts.gc ?? (() => Bun.gc(true));
  const stall = opts.stall ?? busyWait;
  let resetAt = now();
  let cpuBase = cpuUsage();
  /** 이 시각 전의 stall 요청은 429 — 직전 stall 종료 시각 + 그 길이. */
  let stallCooldownUntil = Number.NEGATIVE_INFINITY;

  const sample = (): PerfResponse => {
    const snap = src.profiler.snapshot();
    const phasesMs: Record<string, number[]> = {};
    for (const [phase, values] of Object.entries(snap.phasesMs)) phasesMs[phase] = roundAll(values);
    const cpu = cpuUsage(cpuBase);
    const mem = memoryUsage();
    return {
      ticks: snap.ticks,
      windowMs: roundUs(now() - resetAt),
      durationsMs: roundAll(snap.durationsMs),
      latenessMs: roundAll(snap.latenessMs),
      phasesMs,
      flushMs: roundAll(snap.flushMs),
      cpu: { userUs: cpu.user, systemUs: cpu.system },
      memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
      connections: src.connections(),
      entities: src.entities(),
    };
  };

  /** 쿨다운 중이면 429 응답, 아니면 정지를 실행하고 null. */
  const runStall = (ms: number): Response | null => {
    const waitMs = stallCooldownUntil - now();
    if (waitMs > 0) {
      return jsonError(429, `stall cooldown: retry in ${Math.ceil(waitMs)} ms`, {
        "retry-after": String(Math.ceil(waitMs / 1000)),
      });
    }
    log.warn({ stallMs: ms }, "admin perf: injecting event-loop stall");
    stall(ms);
    stallCooldownUntil = now() + ms;
    return null;
  };

  const handle = (req: Request, url: URL): Response => {
    if (opts.production) return notFound();
    if (req.method !== "GET") return text(405, "method not allowed");
    if (!isNonBrowserLoopbackRequest(req)) return text(403, "forbidden");
    const q = parsePerfQuery(url.searchParams);
    if (typeof q === "string") return jsonError(400, q);
    if (hasSideEffects(q) && carriesFetchMetadata(req)) {
      return text(403, "forbidden: reset/gc/stall are for non-browser clients (curl, loadgen)");
    }
    if (hasSideEffects(q) && opts.allowSideEffects === false) {
      return text(403, "forbidden: reset/gc/stall are disabled here (GW_PERF_SIDE_EFFECTS=0)");
    }
    if (q.stallMs > 0) {
      const refused = runStall(q.stallMs);
      if (refused !== null) return refused;
    }
    if (q.gc) gc();
    // 직렬화(링 ~386 KB, ~3 ms)까지 리셋 전에 — 이전 창의 응답 비용이 새 창의 첫 tick·windowMs에
    // 섞이지 않게(Response.json은 생성 시점에 본문을 직렬화한다).
    const res = Response.json(sample(), { headers: { "cache-control": "no-store" } });
    if (q.reset) {
      src.profiler.reset();
      resetAt = now();
      cpuBase = cpuUsage();
    }
    return res;
  };

  return { handle };
}
