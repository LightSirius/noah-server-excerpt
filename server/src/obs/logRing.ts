// /admin/logs 조회용 인메모리 링버퍼 싱크 — architecture.md §9.3.
//
// 저장 정본은 레닥션이 적용된 직렬화 line이다 — record의 원시 참조는 보관하지 않는다
// (LogSink 계약: record는 레닥션 전 원본, 외부 노출 금지). 필터링용 스칼라(rank/mod/connId/t)만
// write 시점에 추출해 쿼리를 싸게 만들고, line 파싱은 응답 시에만 한다(cold path).
//
// 메모리 상한: capacity 레코드 × 라인당 최대 MAX_LINE_CHARS — 초과 라인은 meta를 통째로
// 버린 축약본으로 대체한다(레닥션 전 값 재직렬화 금지).

import { isLogLevelName, levelRank, registerSink, type LogSink } from "./logger";

const MAX_LINE_CHARS = 8192;
const MAX_FALLBACK_MSG_CHARS = 2048;
const DEFAULT_QUERY_LIMIT = 200;

export interface LogRingQuery {
  /** levelRank 값 — 이 랭크 미만 레코드 제외. */
  minRank?: number;
  mod?: string;
  connId?: number;
  /** 커서: 이 seq 초과분만 반환(앞에서부터 — 누락 없는 전진 팔로우). 미지정 시 최신 테일. */
  sinceSeq?: number;
  /** epoch ms — 이 시각 미만 레코드 제외. */
  sinceT?: number;
  limit?: number;
}

export interface LogRingResult {
  /** 다음 폴링에 sinceSeq로 넘길 커서. */
  nextSeq: number;
  count: number;
  /** 커서 팔로우 중 링 랩어라운드로 밀려나 조회 불가였던 레코드 수(0 = 연속). */
  dropped: number;
  /** oldest-first. 각 항목은 { ...레코드, seq }. seq는 링 커서가 권위(레코드 동명 필드 무시). */
  lines: Array<Record<string, unknown>>;
}

interface RingEntry {
  seq: number;
  rank: number;
  t: number;
  mod: string;
  connId: number | undefined;
  line: string;
}

export class LogRing implements LogSink {
  readonly minLevel: number;
  readonly capacity: number;
  private readonly _entries: Array<RingEntry | undefined>;
  private _lastSeq = 0;

  constructor(capacity: number, minLevel: number) {
    this.capacity = capacity;
    this.minLevel = minLevel;
    this._entries = new Array(capacity);
  }

  write(record: Record<string, unknown>, line: string): void {
    const seq = ++this._lastSeq;
    const level = record["level"];
    this._entries[seq % this.capacity] = {
      seq,
      rank: typeof level === "string" && isLogLevelName(level) ? levelRank(level) : levelRank("info"),
      t: typeof record["t"] === "number" ? record["t"] : 0,
      mod: typeof record["mod"] === "string" ? record["mod"] : "",
      connId: typeof record["connId"] === "number" ? record["connId"] : undefined,
      line: capLine(record, line),
    };
  }

  query(q: LogRingQuery = {}): LogRingResult {
    const limit = Math.max(1, q.limit ?? DEFAULT_QUERY_LIMIT); // 0/음수는 커서 건너뜀 함정 — 1로 강제.
    const oldest = this._lastSeq - Math.min(this._lastSeq, this.capacity) + 1;
    const from = Math.max(oldest, (q.sinceSeq ?? 0) + 1);
    // 폴링 사이에 링이 돌아 밀려난 구간 — 무성으로 연속인 척하면 폭주 상황을 "조용하다"로 오독한다.
    const dropped = q.sinceSeq === undefined ? 0 : Math.max(0, oldest - (q.sinceSeq + 1));
    const matched: RingEntry[] = [];
    for (let seq = from; seq <= this._lastSeq; seq++) {
      const e = this._entries[seq % this.capacity];
      if (e === undefined || e.seq !== seq) continue;
      if (q.minRank !== undefined && e.rank < q.minRank) continue;
      if (q.mod !== undefined && e.mod !== q.mod) continue;
      if (q.connId !== undefined && e.connId !== q.connId) continue;
      if (q.sinceT !== undefined && e.t < q.sinceT) continue;
      matched.push(e);
    }
    // 커서 팔로우는 앞에서부터 limit개(전진 페이지네이션), 최초 조회는 뒤에서부터(최신 테일).
    const truncated = matched.length > limit;
    const taken = q.sinceSeq !== undefined ? matched.slice(0, limit) : matched.slice(-limit);
    const nextSeq =
      truncated && q.sinceSeq !== undefined
        ? (taken[taken.length - 1]?.seq ?? this._lastSeq)
        : this._lastSeq;
    return { nextSeq, count: taken.length, dropped, lines: taken.map(entryToLine) };
  }
}

// seq는 스프레드 "뒤" — 레코드 meta에 동명 seq(예: 클라 제공 INPUT_CMD.seq)가 있어도
// 링 커서가 이긴다(커서 무결성 > meta 표시, 원본은 파일 싱크에 남는다).
function entryToLine(e: RingEntry): Record<string, unknown> {
  return { ...(JSON.parse(e.line) as Record<string, unknown>), seq: e.seq };
}

function capLine(record: Record<string, unknown>, line: string): string {
  if (line.length <= MAX_LINE_CHARS) return line;
  // 초대형 레코드는 meta를 버리고 스칼라만 보존 — 레닥션 전 meta 값을 재직렬화하지 않기 위함.
  const msg = typeof record["msg"] === "string" ? record["msg"].slice(0, MAX_FALLBACK_MSG_CHARS) : "";
  return (
    JSON.stringify({
      t: record["t"],
      level: record["level"],
      mod: record["mod"],
      msg,
      truncated: true,
    }) + "\n"
  );
}

let installed: LogRing | null = null;

/** 프로세스 싱글턴 링 설치(멱등) — adminHttp 부팅 경로에서 호출. 테스트 재부팅에도 단일 인스턴스. */
export function installLogRing(opts: { capacity: number; minLevel: number }): LogRing {
  if (installed === null) {
    installed = new LogRing(opts.capacity, opts.minLevel);
    registerSink(installed);
  }
  return installed;
}

export function getLogRing(): LogRing | null {
  return installed;
}
