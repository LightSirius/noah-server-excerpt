// Phase A — in-memory 메트릭.
//
// architecture.md §9.2: tick.duration_ms 히스토그램, net.* 카운터, world.* 게이지.
// Prometheus exposition format(부분집합)으로 /admin/metrics에서 노출.
//
// 라벨 카디널리티는 호출자가 책임진다 — packet_id 라벨은 packetIdMetricLabel로 단다(알려진 PACKET_ID 65개 +
// 미지 수신 id 전부를 접은 "unknown" 1개). 무제한 라벨(이름·IP·미지 id 원값 등)을 넣으면 메모리 폭증.

import { PACKET_ID } from "../net/codec.generated";

export type Labels = Readonly<Record<string, string | number>>;

function labelKey(labels: Labels | undefined): string {
  if (!labels) return "";
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return "";
  let out = "";
  for (const k of keys) {
    out += `${k}=${labels[k]};`;
  }
  return out;
}

/** 라벨 본문(`a="x",b="y"`, 키 정렬·이스케이프) — 중괄호 없음. 라벨 없으면 "". */
function labelBody(labels: Labels | undefined): string {
  if (!labels) return "";
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return "";
  const parts: string[] = [];
  for (const k of keys) {
    const v = String(labels[k]).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
    parts.push(`${k}="${v}"`);
  }
  return parts.join(",");
}

function formatLabels(labels: Labels | undefined): string {
  const body = labelBody(labels);
  return body === "" ? "" : `{${body}}`;
}

interface MetricBase {
  name: string;
  help: string;
  type: "counter" | "gauge" | "histogram";
  expose(): string;
}

interface CounterSample {
  labels: Labels | undefined;
  value: number;
}

/**
 * 라벨 조합 1개에 묶인 카운터 핸들(성능 3단계 슬라이스 5) — 핫패스가 라벨 키 생성·정렬 없이 증가한다.
 * 샘플은 bind가 아니라 첫 inc 때 만든다(또는 이미 있는 샘플을 잡는다) — 노출 순서 = 첫 증가 순서가
 * `inc(labels)`만 쓸 때와 같다.
 */
export class CounterHandle {
  private sample: CounterSample | undefined = undefined;

  constructor(
    private readonly samples: Map<string, CounterSample>,
    private readonly key: string,
    private readonly labels: Labels | undefined,
  ) {}

  inc(by = 1): void {
    let s = this.sample;
    if (s === undefined) {
      s = this.samples.get(this.key);
      if (s === undefined) {
        s = { labels: this.labels, value: 0 };
        this.samples.set(this.key, s);
      }
      this.sample = s;
    }
    s.value += by;
  }
}

export class Counter implements MetricBase {
  readonly type = "counter" as const;
  private readonly samples = new Map<string, CounterSample>();

  constructor(readonly name: string, readonly help: string) {}

  inc(labels?: Labels, by = 1): void {
    const key = labelKey(labels);
    const existing = this.samples.get(key);
    if (existing) existing.value += by;
    else this.samples.set(key, { labels, value: by });
  }

  /** 라벨 조합 핸들 — 라벨은 지금 복사해 둔다(이후 호출자 객체 변경 무관). 샘플은 첫 inc 때. */
  bind(labels: Labels | undefined): CounterHandle {
    const own = labels === undefined ? undefined : { ...labels };
    return new CounterHandle(this.samples, labelKey(own), own);
  }

  value(labels?: Labels): number {
    return this.samples.get(labelKey(labels))?.value ?? 0;
  }

  /** 모든 라벨 조합의 합. */
  total(): number {
    let sum = 0;
    for (const s of this.samples.values()) sum += s.value;
    return sum;
  }

  expose(): string {
    let out = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} counter\n`;
    for (const { labels, value } of this.samples.values()) {
      out += `${this.name}${formatLabels(labels)} ${value}\n`;
    }
    return out;
  }
}

export class Gauge implements MetricBase {
  readonly type = "gauge" as const;
  private current = 0;

  constructor(readonly name: string, readonly help: string) {}

  set(v: number): void { this.current = v; }
  inc(by = 1): void { this.current += by; }
  dec(by = 1): void { this.current -= by; }
  value(): number { return this.current; }

  expose(): string {
    return `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} gauge\n${this.name} ${this.current}\n`;
  }
}

/**
 * 라벨 게이지(성능 4.5) — 라벨 조합마다 값 1개. 카디널리티는 호출자 책임(`mmorpg_ipc_peer_*{gateway}`는 연결된 게이트웨이 수뿐).
 * scrape 수집기가 clear() 후 살아 있는 대상만 다시 채운다 — 사라진 대상의 시계열을 남기지 않는다. 노출 순서 = 첫 set 순서.
 */
export class LabeledGauge implements MetricBase {
  readonly type = "gauge" as const;
  private readonly samples = new Map<string, { body: string; value: number }>();

  constructor(readonly name: string, readonly help: string) {}

  set(labels: Labels, v: number): void {
    const body = labelBody(labels);
    const s = this.samples.get(body);
    if (s === undefined) this.samples.set(body, { body, value: v });
    else s.value = v;
  }

  value(labels: Labels): number {
    return this.samples.get(labelBody(labels))?.value ?? 0;
  }

  clear(): void {
    this.samples.clear();
  }

  expose(): string {
    let out = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} gauge\n`;
    for (const { body, value } of this.samples.values()) out += `${this.name}{${body}} ${value}\n`;
    return out;
  }
}

/** 버킷 경계 검증 — 비어 있지 않고 엄격 단조증가. */
function checkedBuckets(name: string, buckets: readonly number[]): number[] {
  if (buckets.length === 0) throw new Error(`Histogram ${name}: buckets empty`);
  for (let i = 1; i < buckets.length; i++) {
    if (buckets[i]! <= buckets[i - 1]!) {
      throw new Error(`Histogram ${name}: buckets must be strictly increasing`);
    }
  }
  return [...buckets];
}

/**
 * 고정 버킷 누적 분포 1개 — 무라벨 Histogram과 LabeledHistogram 자식이 공유하는 저장소.
 * p50/p99는 버킷 보간(Prometheus와 같은 방식). 버킷은 오름차순, +Inf 자동 추가.
 */
export class HistogramChild {
  private readonly counts: number[];
  private sum = 0;
  private count = 0;

  constructor(private readonly buckets: readonly number[]) {
    this.counts = new Array(buckets.length + 1).fill(0); // last = +Inf
  }

  observe(v: number): void {
    this.sum += v;
    this.count++;
    let placed = false;
    for (let i = 0; i < this.buckets.length; i++) {
      if (v <= this.buckets[i]!) {
        this.counts[i]!++;
        placed = true;
        break;
      }
    }
    if (!placed) this.counts[this.buckets.length]!++;
  }

  /** 누적 분위수: 선형 보간 (Prometheus histogram_quantile과 동일 모양). */
  quantile(q: number): number {
    if (this.count === 0) return 0;
    const target = q * this.count;
    let cumulative = 0;
    let prevBound = 0;
    for (let i = 0; i < this.buckets.length; i++) {
      const next = cumulative + this.counts[i]!;
      if (next >= target) {
        const bound = this.buckets[i]!;
        const inBucket = this.counts[i]!;
        if (inBucket === 0) return bound;
        const frac = (target - cumulative) / inBucket;
        return prevBound + (bound - prevBound) * frac;
      }
      cumulative = next;
      prevBound = this.buckets[i]!;
    }
    return prevBound;
  }

  snapshot(): { p50: number; p99: number; count: number; sum: number } {
    return { p50: this.quantile(0.5), p99: this.quantile(0.99), count: this.count, sum: this.sum };
  }

  /** 샘플 라인(HELP/TYPE 제외). body = 라벨 본문(무라벨 ""), le는 마지막 라벨. */
  exposeSamples(name: string, body: string): string {
    const lePrefix = body === "" ? "" : `${body},`;
    const suffix = body === "" ? "" : `{${body}}`;
    let out = "";
    let cumulative = 0;
    for (let i = 0; i < this.buckets.length; i++) {
      cumulative += this.counts[i]!;
      out += `${name}_bucket{${lePrefix}le="${this.buckets[i]}"} ${cumulative}\n`;
    }
    cumulative += this.counts[this.buckets.length]!;
    out += `${name}_bucket{${lePrefix}le="+Inf"} ${cumulative}\n`;
    out += `${name}_sum${suffix} ${this.sum}\n`;
    out += `${name}_count${suffix} ${this.count}\n`;
    return out;
  }
}

/** 무라벨 고정 버킷 누적 히스토그램(노출 포맷 동결 — §9.6). */
export class Histogram implements MetricBase {
  readonly type = "histogram" as const;
  private readonly data: HistogramChild;

  constructor(readonly name: string, readonly help: string, buckets: number[]) {
    this.data = new HistogramChild(checkedBuckets(name, buckets));
  }

  observe(v: number): void {
    this.data.observe(v);
  }

  /** 누적 분위수: 선형 보간 (Prometheus histogram_quantile과 동일 모양). */
  quantile(q: number): number {
    return this.data.quantile(q);
  }

  snapshot(): { p50: number; p99: number; count: number; sum: number } {
    return this.data.snapshot();
  }

  expose(): string {
    return (
      `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} histogram\n` +
      this.data.exposeSamples(this.name, "")
    );
  }
}

/**
 * 라벨 히스토그램(성능 2-A) — 라벨 조합마다 HistogramChild 1개. 카디널리티는 호출자 책임
 * (`mmorpg_tick_phase_ms{phase}`는 코드 상수 단계 이름뿐). 핫패스는 `labels()`로 핸들을 1회
 * 바인딩해 두고 `observe`만 부른다 — 라벨 키 생성·정렬은 바인딩 때 1회.
 */
export class LabeledHistogram implements MetricBase {
  readonly type = "histogram" as const;
  private readonly buckets: readonly number[];
  private readonly children = new Map<string, { body: string; child: HistogramChild }>();

  constructor(readonly name: string, readonly help: string, buckets: number[]) {
    this.buckets = checkedBuckets(name, buckets);
  }

  /** 버킷 경계 사본(테스트·문서 대조용). */
  bucketBounds(): number[] {
    return [...this.buckets];
  }

  /** 라벨 조합 핸들 — 같은 조합(키 순서 무관)이면 같은 핸들. 첫 호출 순서가 노출 순서. */
  labels(labels: Labels): HistogramChild {
    const body = labelBody(labels);
    let entry = this.children.get(body);
    if (entry === undefined) {
      entry = { body, child: new HistogramChild(this.buckets) };
      this.children.set(body, entry);
    }
    return entry.child;
  }

  observe(labels: Labels, v: number): void {
    this.labels(labels).observe(v);
  }

  expose(): string {
    let out = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} histogram\n`;
    for (const { body, child } of this.children.values()) out += child.exposeSamples(this.name, body);
    return out;
  }
}

/**
 * scrape 시점 계산 값(성능 2-A — 프로세스 CPU·메모리). 노출 때마다 read()를 부른다.
 * read()가 던지면 NaN을 노출해 나머지 메트릭 노출을 지킨다.
 */
export class CallbackMetric implements MetricBase {
  constructor(
    readonly name: string,
    readonly help: string,
    readonly type: "counter" | "gauge",
    private readonly read: () => number,
  ) {}

  value(): number {
    try {
      return this.read();
    } catch {
      return Number.NaN;
    }
  }

  expose(): string {
    return `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} ${this.type}\n${this.name} ${this.value()}\n`;
  }
}

export class Registry {
  private readonly metrics: MetricBase[] = [];
  private readonly collectors: Array<() => void> = [];
  private collectorErrorCount = 0;
  register<T extends MetricBase>(m: T): T {
    this.metrics.push(m);
    return m;
  }
  /**
   * 노출 직전 수집 훅(성능 2-A) — obs가 import할 수 없는 상태(존 엔티티 수 등)를 게이지에 반영.
   * 훅 예외는 격리: 해당 게이지는 직전 값을 그대로 노출하고, 예외 수는 collectorErrors()로 센다
   * (전역 registry는 mmorpg_metrics_collector_error_total — stale 게이지의 신호).
   */
  addCollector(fn: () => void): void {
    this.collectors.push(fn);
  }
  /** 수집 훅 예외 누적 수(scrape 1회에 실패한 훅마다 +1). */
  collectorErrors(): number {
    return this.collectorErrorCount;
  }
  expose(): string {
    for (const fn of this.collectors) {
      try {
        fn();
      } catch {
        // 격리 — 직전 값 유지(노출 실패보다 stale 1회가 낫다). 신호는 카운터로.
        this.collectorErrorCount++;
      }
    }
    return this.metrics.map((m) => m.expose()).join("\n");
  }
  list(): readonly MetricBase[] { return this.metrics; }
}

export const registry = new Registry();

// ── 전역 메트릭 카탈로그 ─────────────────────────────────────────────
// architecture.md §9.2 항목들을 미리 등록. 호출 사이트는 이 객체를 참조.

export const metrics = {
  tickDurationMs: registry.register(
    new Histogram("mmorpg_tick_duration_ms", "Zone tick total processing time in ms",
      [1, 2, 5, 10, 20, 50, 100]),
  ),
  tickLatenessMs: registry.register(
    new Histogram("mmorpg_tick_lateness_ms", "Tick start lateness vs scheduled deadline in ms (timer jitter + backlog)",
      [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 5000]),
  ),
  tickSkipped: registry.register(new Counter("mmorpg_tick_skipped_total", "Overdue ticks skipped by the catch-up cap (tickLoop maxCatchUpTicks)")),
  tickStallMs: registry.register(
    new Histogram("mmorpg_tick_stall_ms", "Tick loop backlog in ms behind schedule, measured before the catch-up clamp; sampled once when it crosses from <= one tick to > one tick (one sample per stall episode, so count = stalls; sustained overload without recovery adds no samples — see tick_skipped_total; lateness_ms is post-clamp)",
      [100, 250, 500, 1000, 2000, 5000, 10000, 30000]),
  ),
  netRxBytes: registry.register(new Counter("mmorpg_net_rx_bytes_total", "Total bytes received over TCP")),
  netTxBytes: registry.register(new Counter("mmorpg_net_tx_bytes_total", "Total bytes sent over TCP")),
  netTxPartial: registry.register(new Counter("mmorpg_net_tx_partial_total", "Partial socket writes (kernel send buffer full) — unsent tail kept and resumed on drain, session stays open; by first packet_id of the write")),
  netTxBacklogClose: registry.register(new Counter("mmorpg_net_tx_backlog_close_total", "Sessions closed because the unsent outbound tail exceeded OUTBOUND_MAX_BYTES (slow consumer)")),
  netPacketsRx: registry.register(new Counter("mmorpg_net_packets_rx_total", "Packets received, decoded and dispatched to a handler (passed the routing pre-check), by packet_id")),
  netPacketsTx: registry.register(new Counter("mmorpg_net_packets_tx_total", "Total packets sent, by packet_id")),
  routerUnknownPacket: registry.register(new Counter("mmorpg_router_unknown_packet_total", "Packets received with an id that is not a schema C2S packet (S2C or unknown ids), dropped before body decode")),
  routerStateRejected: registry.register(new Counter("mmorpg_router_state_rejected_total", "Packets not allowed in the session's login state, dropped before body decode, by packet_id and state")),
  routerHandlerError: registry.register(new Counter("mmorpg_router_handler_error_total", "Handler exceptions, by packet_id")),
  netDecodeError: registry.register(new Counter("mmorpg_net_decode_error_total", "Body decode failures of packets that passed the routing pre-check (binary C2S codec), by packet_id and reason (WIRE_ERROR name, Unknown, or Threw = decoder exception)")),
  netSizeViolation: registry.register(new Counter("mmorpg_net_size_violation_total", "Packets exceeding per-id maxBodyBytes")),
  netRateViolation: registry.register(new Counter("mmorpg_net_rate_violation_total", "Packets dropped by token-bucket rate limiter")),
  netRateDropped: registry.register(new Counter("mmorpg_net_rate_dropped_total", "IN_WORLD packets dropped (not dispatched) on token shortage — kick only when the strike window is exceeded")),
  netRateKick: registry.register(new Counter("mmorpg_net_rate_kick_total", "Rate-limit kicks, by state (pre-auth: first violation; IN_WORLD: strike window exceeded)")),
  netRateReserve: registry.register(new Counter("mmorpg_net_rate_reserve_total", "IN_WORLD non-stream command frames (not INPUT_CMD/PING) admitted from the reserve bucket while the main bucket was empty")),
  zoneTickError: registry.register(new Counter("mmorpg_zone_tick_error_total", "Zone tick exceptions isolated by tickAll, by zone")),
  connRejected: registry.register(new Counter("mmorpg_conn_rejected_total", "Connections rejected at accept or kicked by idle/pre-auth deadline, by reason (global_cap|per_ip_cap|pre_auth_cap|pre_auth_per_ip_cap|idle|pre_auth_deadline|legacy_framing — old v1-framing client kicked with a v1 KICK 1|legacy_hello — any undecodable HELLO on an ANON connection kicked with KICK 1; expected cause is a pre-binary JSON-HELLO client, the decode reason is in the warn log|legacy_proto — a HELLO from a protoVersion 3-5 client (v2 framing, JSON KICK) kicked with the fixed JSON-body KICK 1)")),
  dupLoginKick: registry.register(new Counter("mmorpg_dup_login_kick_total", "Sessions preempted by a new login on the same account")),
  preemptFlushLost: registry.register(new Counter("mmorpg_preempt_flush_lost_total", "Preempt pre-flush failed twice — unsaved victim state lost")),
  inputQueueOverflow: registry.register(new Counter("mmorpg_input_queue_overflow_total", "INPUT_CMD dropped because per-connection pending queue exceeded cap")),
  worldEntities: registry.register(new Gauge("mmorpg_world_entities", "Live entities across all zones (computed at scrape)")),
  worldConnections: registry.register(new Gauge("mmorpg_world_connections", "Live TCP connections")),
  logDroppedLines: registry.register(new Counter("mmorpg_log_dropped_lines_total", "Log lines dropped by file sink pending-buffer cap or disable")),
  unhandledRejection: registry.register(new Counter("mmorpg_unhandled_rejection_total", "Unhandled promise rejections observed by crash handler (process kept alive)")),
  logSuppressedLost: registry.register(new Counter("mmorpg_log_suppressed_lost_total", "Squelch suppressed-counts folded here when their key was LRU-evicted before re-emit")),
  // ── 성능 2-A 신설(추가만 — 위 노출 순서 동결) ──
  tickPhaseMs: registry.register(
    new LabeledHistogram("mmorpg_tick_phase_ms", "Per-tick time in ms by tick phase (Zone.tick method names summed across zones, plus cork/outcomes/flush)",
      [0.1, 0.25, 0.5, 1, 2, 3, 5, 7.5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 250, 500, 1000]),
  ),
  processCpuUserSeconds: registry.register(
    new CallbackMetric("mmorpg_process_cpu_user_seconds_total", "Process user CPU time in seconds (process.cpuUsage, read at scrape)", "counter",
      () => process.cpuUsage().user / 1e6),
  ),
  processCpuSystemSeconds: registry.register(
    new CallbackMetric("mmorpg_process_cpu_system_seconds_total", "Process system CPU time in seconds (process.cpuUsage, read at scrape)", "counter",
      () => process.cpuUsage().system / 1e6),
  ),
  processRssBytes: registry.register(
    new CallbackMetric("mmorpg_process_rss_bytes", "Process resident set size in bytes (read at scrape)", "gauge",
      () => process.memoryUsage.rss()),
  ),
  processHeapUsedBytes: registry.register(
    new CallbackMetric("mmorpg_process_heap_used_bytes", "JS heap used in bytes (process.memoryUsage, read at scrape)", "gauge",
      () => process.memoryUsage().heapUsed),
  ),
  metricsCollectorError: registry.register(
    new CallbackMetric("mmorpg_metrics_collector_error_total", "Scrape-time collector hook exceptions (the gauge that hook feeds, e.g. mmorpg_world_entities, keeps its previous value)", "counter",
      () => registry.collectorErrors()),
  ),
  // ── 성능 3단계 신설(추가만 — 위 노출 순서 동결) ──
  netTxWrites: registry.register(new Counter("mmorpg_net_tx_writes_total", "Socket write calls (each raw write, including drain resumes of a kept tail) — packets_tx / writes = frames coalesced per write")),
  overloadActive: registry.register(new Gauge("mmorpg_overload_active", "1 while the tick-loop overload signal is active (enter: skipped ticks in window >= OVERLOAD_ENTER_SKIPS or no tick loop iteration for OVERLOAD_STALL_MS; held while skips in window >= ENTER_SKIPS/4 or a stall within OVERLOAD_WINDOW_MS) — IN_WORLD rate strikes suspended within a per-connection exemption budget; new connections rejected when OVERLOAD_ADMISSION=1 and skips in window >= ENTER_SKIPS/2 or a recent stall")),
  overloadRejected: registry.register(new Counter("mmorpg_overload_rejected_total", "New connections rejected at accept with KICK 9 \"server busy\" while overloaded (admission control)")),
  // ── 성능 4단계 신설(추가만 — 위 노출 순서 동결). 월드 쪽 게이트웨이 IPC — ROLE=world에서만 값이 움직인다. ──
  ipcPeers: registry.register(new Gauge("mmorpg_ipc_peers", "Gateway peers registered with this world (IPC HELLO accepted, not yet lost)")),
  ipcPeerLost: registry.register(new Counter("mmorpg_ipc_peer_lost_total", "Gateway peers torn down by the world, by reason (peer|bye|dead|backpressure|error|replaced|protocol|closed — bye = the gateway announced BYE before closing, a planned departure) — every client connection of that gateway is closed with one batched save")),
  ipcHelloRejected: registry.register(new Counter("mmorpg_ipc_hello_rejected_total", "IPC handshakes refused, by reason (auth = HELLO token differs from IPC_TOKEN; fenced = incarnation retired by a newer process with the same GATEWAY_ID; closed = world shutting down or IPC server closed; version = ipcVer mismatch — these four answer HELLO_NACK first; protocol = bad first message or oversized pre-handshake envelope; timeout = no HELLO within the deadline; busy = too many pending handshakes)")),
  ipcStaleRecords: registry.register(new Counter("mmorpg_ipc_stale_records_total", "Gateway records for a localId the world does not track, ignored, by type (frames|closed)")),
  ipcRxBytes: registry.register(new Counter("mmorpg_ipc_rx_bytes_total", "IPC bytes received from gateways")),
  ipcTxBytes: registry.register(new Counter("mmorpg_ipc_tx_bytes_total", "IPC bytes handed to gateway pipes (envelopes flushed at tick end, at event-loop turn end, or at the early-flush threshold)")),
  // ── 성능 4단계 4.2c 신설(추가만). 게이트웨이 쪽 — ROLE=gateway에서만 값이 움직인다(소켓 바이트·rate·idle 킥은 기존 net_*·conn_rejected를
  // 게이트웨이가 센다). 게이지는 inc/dec — in-process 토폴로지 테스트의 게이트웨이 여럿이 한 레지스트리를 공유해도 합이 맞게. ──
  gwConnections: registry.register(new Gauge("mmorpg_gw_connections", "Client connections admitted by this gateway and announced to the world (CONN_OPEN sent, not yet closed)")),
  gwConnRejected: registry.register(new Counter("mmorpg_gw_conn_rejected_total", "Client connections refused at the gateway before CONN_OPEN, by reason (cap = per-gateway cap min(GATEWAY_MAX_CONNECTIONS, world connCap), KICK 9; world_down = no handshaken world link, KICK 6)")),
  gwConnClosed: registry.register(new Counter("mmorpg_gw_conn_closed_total", "Admitted client connections closed at the gateway, by CONN_CLOSED reason (peer|idle|rate|size|backlog|error|gw_shutdown|world_requested|cap|legacy_framing) — plus world_lost (not a CONN_CLOSED reason): the world link died, every client was kicked with KICK 6 and nothing was sent to the world")),
  gwWorldConnected: registry.register(new Gauge("mmorpg_gw_world_connected", "1 while this gateway holds a handshaken world IPC link (HELLO_ACK received, not yet lost)")),
  gwWorldLost: registry.register(new Counter("mmorpg_gw_world_lost_total", "Handshaken world IPC links lost, by reason (peer|shutdown|dead|backpressure|error|protocol|local — shutdown = the world sent SHUTDOWN before closing, a planned stop) — every client is kicked with KICK 6 and the client listener stops")),
  gwStaleRecords: registry.register(new Counter("mmorpg_gw_stale_records_total", "World records for a localId this gateway no longer tracks, ignored, by type (deliver|state|close|accepted|multicast — multicast counts each stale recipient of a CONN_MULTICAST record)")),
  gwIpcRxBytes: registry.register(new Counter("mmorpg_gw_ipc_rx_bytes_total", "IPC bytes received from the world")),
  gwIpcTxBytes: registry.register(new Counter("mmorpg_gw_ipc_tx_bytes_total", "IPC bytes handed to the world pipe (client frame batches flushed at event-loop turn end or the early-flush threshold, plus HELLO/PING/BYE/CONN_OPEN/CONN_CLOSED)")),
  // ── 성능 4단계 4.3a 신설(추가만) — 프로세스별 관측. 미전송 게이지는 scrape 시점 합(한 프로세스의 월드 IPC 서버·게이트웨이 코어 전부). ──
  ipcPendingBytes: registry.register(new Gauge("mmorpg_ipc_pending_bytes", "Unsent IPC bytes queued toward gateways, summed over live gateway pipes at scrape (a pipe is dropped with reason backpressure above IPC_MAX_PENDING_MB)")),
  gwIpcPendingBytes: registry.register(new Gauge("mmorpg_gw_ipc_pending_bytes", "Unsent IPC bytes queued toward the world on this gateway's world pipe at scrape (the link is dropped with reason backpressure above IPC_MAX_PENDING_MB)")),
  gwDeliverBatchMs: registry.register(
    new Histogram("mmorpg_gw_deliver_batch_ms", "Time in ms to apply one CONN_DELIVER envelope from the world (every per-connection socket write of a tick or turn batch) — the gateway's share of the send cost",
      [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250]),
  ),
  gwDeliverRecords: registry.register(new Counter("mmorpg_gw_deliver_records_total", "Per-connection delivery records applied from CONN_DELIVER and CONN_DELIVER_SHARED envelopes (CONN and CONN_REF records; records / mmorpg_gw_deliver_batch_ms_count = fan-out per envelope)")),
  gwIpcRttMs: registry.register(
    new Histogram("mmorpg_gw_ipc_rtt_ms", "IPC heartbeat round trip in ms (PING sent by this gateway to the matching PONG) — world event-loop responsiveness as seen by the gateway",
      [0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]),
  ),
  // ── 성능 4단계 리뷰 픽스 신설(추가만). ──
  gwHelloRefused: registry.register(new Counter("mmorpg_gw_hello_refused_total", "World IPC handshakes refused by the world with HELLO_NACK, by reason (fenced = another process registered this GATEWAY_ID with a newer incarnation — retried at the max backoff, find the duplicate; closed = world shutting down — normal retry; version|auth = IPC version or IPC_TOKEN mismatch — the gateway exits)")),
  // ── 성능 4.5 F1 신설(추가만) — 게이트웨이 부하 기반 접속 제한. 게이트웨이 쪽 게이지는 inc/dec(in-process 토폴로지 합), 월드 쪽 피어별
  // 게이지는 scrape 시점 수집(사라진 피어는 시계열도 사라진다). ──
  gwAdmissionActive: registry.register(new Gauge("mmorpg_gw_admission_active", "1 while this gateway refuses new client connections with KICK 9 \"server busy\" before CONN_OPEN (load admission: world ADMISSION busy, or a local signal over its enter threshold — process CPU, event-loop lag, IPC RTT, client outbound tail; cleared after every signal stays at or below its clear threshold for GW_ADMISSION_HOLD_MS)")),
  gwAdmissionRejected: registry.register(new Counter("mmorpg_gw_admission_rejected_total", "New client connections refused by gateway load admission with KICK 9 \"server busy\" before CONN_OPEN, by cause (world|cpu|lag|rtt|outbound — the hottest signal at refusal, else the one that closed admission)")),
  gwEventLoopLagMs: registry.register(new Gauge("mmorpg_gw_event_loop_lag_ms", "Gateway event-loop lag in ms — max delay of the 250 ms load sampler over the last second (load admission signal, enter at GW_ADMISSION_LAG_MS)")),
  ipcPeerPendingBytes: registry.register(new LabeledGauge("mmorpg_ipc_peer_pending_bytes", "Unsent IPC bytes queued toward one gateway at scrape, by gateway id (the summed mmorpg_ipc_pending_bytes stays; the peer is marked busy at IPC_ADMISSION_SOFT_PCT and dropped at IPC_MAX_PENDING_MB)")),
  ipcPeerAdmissionBusy: registry.register(new LabeledGauge("mmorpg_ipc_peer_admission_busy", "1 while the world refuses new connections from this gateway (pending IPC bytes reached IPC_ADMISSION_SOFT_PCT of IPC_MAX_PENDING_MB; cleared after staying at or below IPC_ADMISSION_CLEAR_PCT for IPC_ADMISSION_HOLD_MS), by gateway id — the gateway is told with an urgent ADMISSION message")),
  ipcAdmissionRejected: registry.register(new Counter("mmorpg_ipc_admission_rejected_total", "CONN_OPENs the world refused with KICK 9 \"server busy\" because their gateway was over the IPC soft threshold (no session created)")),
  // ── 성능 4.5 F2 신설(추가만) — MULTICAST(sendMany 팬아웃 프레임을 게이트웨이당 CONN_MULTICAST 레코드 1개로). ──
  ipcMulticastRecords: registry.register(new Counter("mmorpg_ipc_multicast_records_total", "CONN_MULTICAST records written to gateway batches — one per gateway per fan-out frame (sendMany with 2+ recipients on that gateway whose session outbox was empty), split above 65,535 recipients")),
  ipcMulticastRecipients: registry.register(new Counter("mmorpg_ipc_multicast_recipients_total", "Client deliveries carried by CONN_MULTICAST records (recipients / records = mean fan-out per gateway record)")),
  ipcMulticastSavedBytes: registry.register(new Counter("mmorpg_ipc_multicast_saved_bytes_total", "World-to-gateway IPC bytes avoided by CONN_MULTICAST versus copying the frame once per recipient: (recipients - records) x frame - 6 x records - 4 x recipients")),
  gwMulticastRecords: registry.register(new Counter("mmorpg_gw_multicast_records_total", "CONN_MULTICAST records applied from the world (each frame is copied once and deferred per recipient until that connection's next CONN_DELIVER, a CONN_FLUSH, a close or an edge kick — one socket write per connection per flush window)")),
  gwMulticastRecipients: registry.register(new Counter("mmorpg_gw_multicast_recipients_total", "Recipient connections listed by applied CONN_MULTICAST records, including stale localIds (counted again in mmorpg_gw_stale_records_total{type=\"multicast\"})")),
  // ── 성능 4.5 F3 신설(추가만) — 공유 프레임(같은 셀 viewer의 SNAPSHOT_DELTA를 게이트웨이 봉투당 DEF 1개 + 연결별 ackSeq 패치로). ──
  ipcSharedDefs: registry.register(new Counter("mmorpg_ipc_shared_defs_total", "Shared-frame DEF records written to CONN_DELIVER_SHARED envelopes — one per shared frame per gateway envelope (a frame is redefined when its envelope closes: flush, a non-batch message, the split threshold or another batch type)")),
  ipcSharedRefs: registry.register(new Counter("mmorpg_ipc_shared_refs_total", "CONN_REF records written — client deliveries whose shared SNAPSHOT_DELTA travelled as a reference plus a u32 ackSeq instead of a copy")),
  ipcSharedSavedBytes: registry.register(new Counter("mmorpg_ipc_shared_saved_bytes_total", "World-to-gateway IPC bytes avoided by CONN_REF records that reuse a DEF already in their envelope, versus a CONN_DELIVER copy: frame - 9 per reusing reference (a defining reference costs 16 bytes more than CONN_DELIVER and is not subtracted)")),
  gwSharedDefs: registry.register(new Counter("mmorpg_gw_shared_defs_total", "Shared-frame DEF records received in CONN_DELIVER_SHARED envelopes")),
  gwSharedRefs: registry.register(new Counter("mmorpg_gw_shared_refs_total", "CONN_REF records applied — the DEF is patched in place with the connection's u32 and written (zero-copy when the record has no inline bytes and nothing deferred), stale localIds excluded")),
  gwDeliverAssembledBytes: registry.register(new Counter("mmorpg_gw_deliver_assembled_bytes_total", "Bytes the gateway copied into its merge buffer to send one connection's deferred MULTICAST frames, inline bytes and patched shared frame as a single socket write")),
  // 4.5 후속 — 피어 점진 감축(IPC_SHED_*).
  ipcShedSessions: registry.register(new Counter("mmorpg_ipc_shed_sessions_total", "In-world sessions the world shed (KICK 9 \"server busy\", picked at random among the gateway's in-world sessions) because their gateway IPC backlog kept growing above IPC_SHED_PCT of IPC_MAX_PENDING_MB (all gateways; the gateway id and conn ids are logged)")),
  ipcShedEvents: registry.register(new Counter("mmorpg_ipc_shed_events_total", "Shed steps (each sheds IPC_SHED_FRACTION_PCT of the gateway's in-world sessions, at most IPC_SHED_MAX_PER_STEP, at most once per IPC_SHED_COOLDOWN_MS per gateway; all gateways)")),
  chatThrottled: registry.register(new Counter("mmorpg_chat_throttled_total", "CHAT_SAY messages dropped by the per-sender chat bucket (CHAT_RATE_PER_SEC, burst CHAT_BURST) — chat fans out to the whole zone")),
  statOpThrottled: registry.register(new Counter("mmorpg_stat_op_throttled_total", "STAT_ALLOCATE/STAT_RESET requests answered RATE_LIMITED by the per-connection bucket (STAT_OP_RATE_PER_SEC, burst STAT_OP_BURST) — refunds leave the allocate/reset save loop with no lifetime bound")),
  // 4.5 후속 — 스냅샷 꼬리: tick 사이 GC 페이서(sim/gcPacer, GC_PACE_*).
  gcPaced: registry.register(new Counter("mmorpg_gc_paced_total", "Asynchronous GC requests the tick loop made between ticks (every GC_PACE_TICKS ticks) so allocation thresholds are not crossed inside a tick")),
  gcPaceDeferred: registry.register(new Counter("mmorpg_gc_pace_deferred_total", "Tick loop iterations in which a due GC pacer request was postponed because ticks were skipped or less than GC_PACE_MIN_IDLE_MS remained until the next deadline (counted every postponed iteration — rises 20/s during sustained overload)")),
  // 이동 입력 검토 — MOVE_TO 연결당 속도 제한(MOVE_TO_RATE_PER_SEC·MOVE_TO_BURST).
  moveToThrottle: registry.register(new Counter("mmorpg_move_to_throttle_total", "MOVE_TO over the per-connection bucket, by outcome: deferred (held as the latest pending request), coalesced (a pending request replaced by a newer one), released (pending request applied when a token arrived), cancelled (pending dropped by MOVE_STOP, keyboard movement, death, zone change, disconnect, or a newer MOVE_TO applied immediately); deferred = released + cancelled + currently pending")),
  // 이진 전환 H1 — 프레임 body u16 상한: SNAPSHOT_DELTA 원소 수가 스키마 max(5460)를 넘으면 같은 tick·ack 프레임 여러 개로.
  snapshotDeltaSplit: registry.register(new Counter("mmorpg_snapshot_delta_split_total", "SNAPSHOT_DELTA payloads with more updates than one frame may carry (schema max 5460 — body must fit the u16 frame length) that were split into several frames with the same tickIndex/ackSeq (update order kept, each entity in exactly one frame); counted once per split payload")),
  // 이진 전환 B2c — 디코드 실패 strike KICK(NET_DECODE_STRIKES·NET_DECODE_WINDOW_MS).
  netDecodeKick: registry.register(new Counter("mmorpg_net_decode_kick_total", "Sessions kicked with KICK 5 \"malformed packets\" because body decode failures of packets that passed the routing pre-check exceeded NET_DECODE_STRIKES within NET_DECODE_WINDOW_MS, by state (an undecodable HELLO on an ANON connection is KICK 1 — conn_rejected{reason=\"legacy_hello\"} — and not a strike)")),
  // 이진 전환 B4 — 송신 단위 인코드 실패 방어층(network/encodeGuard.ts).
  netEncodeError: registry.register(new Counter("mmorpg_net_encode_error_total", "Outbound packets dropped because they could not be encoded — the generated binary encoder rejected a value (WireEncodeError: integer range, non-finite float, string max, lone surrogate, enum) or the frame body exceeded the u16 frame length (JSON bodies included); counted once per packet (a fan-out is encoded once), by packet_id. Only that packet is dropped — the zone tick and the handler go on; any other exception still propagates. Non-zero means an upstream bound (data loader limit, clamp) is missing")),
  // 자동 재접속 선결 — 공유 포트 리스너 양보(IPC v14 LISTEN_REPORT·LISTEN). 게이트웨이 게이지는 inc/dec(in-process 토폴로지 합).
  gwListenYielded: registry.register(new Gauge("mmorpg_gw_listen_yielded", "1 while this gateway's client listener is down because the world told it to yield (LISTEN yield: its load admission is closed and another gateway on the same reusePort port is an open listener — new connections go there instead of getting KICK 9); stays 1 while a resume is being retried")),
  gwListenTransitions: registry.register(new Counter("mmorpg_gw_listen_transitions_total", "Client listener pauses and resumes driven by world LISTEN directives, by state (paused|resumed — resumed counts successful re-binds only; a world loss or SHUTDOWN stop is not counted)")),
  ipcListenDirectives: registry.register(new Counter("mmorpg_ipc_listen_directives_total", "LISTEN directives the world sent to gateways, by mode (yield = a gateway whose admission is closed leaves its shared-port group while another member is an open listener; listen = it rejoins — reopened, the open listener is gone, or the world is draining)")),
  // 생활 L-1 — 채집 채널 중단 사유(점유·다계정 교대 관측). 존이 주입받은 관측자(world/life/zoneLife LifeCancelObserver)로 센다.
  lifeCancel: registry.register(new Counter("mmorpg_life_cancel_total", "Gathering channels that ended without completing, by reason (LIFE_CODE name: PUZZLE_FAIL = a trace that left the path or band or let go, a tap misclick (outside the band or on empty space — the client sends a misclick marker), or a success outside the wall-clock bounds; PUZZLE_TIMEOUT = never started, an empty or partial tap list, or no submission by the deadline; INTERRUPTED = movement, a landed hit, another accepted action or LIFE_CANCEL; DEAD; NODE_GONE; NOT_NEAR; INVENTORY_FULL at completion; UNKNOWN never expected); every reason but NODE_GONE uses one node charge (half the labor was prepaid at accept) and leaves that player a 3 s wait before re-reserving the node. Channels dropped by a zone change or disconnect are not counted")),
  // 생활 L-1b·L-2 — 생활 명령(GATHER_START·CRAFT_REQ 공유) 연결당 속도 제한(LIFE_OP_RATE_PER_SEC·LIFE_OP_BURST).
  lifeOpThrottled: registry.register(new Counter("mmorpg_life_op_throttled_total", "GATHER_START and CRAFT_REQ requests answered code RATE by the shared per-connection bucket (LIFE_OP_RATE_PER_SEC, burst LIFE_OP_BURST) — each check simulates the worst-case inventory fit; LIFE_CANCEL is outside this bucket")),
};

function formatPacketId(id: number): string {
  return `0x${id.toString(16).padStart(4, "0")}`;
}

/** 알려진 packet id(PACKET_ID 65개)의 라벨 — 송수신 핫패스가 패킷마다 문자열을 새로 만들지 않게. */
const KNOWN_PACKET_ID_LABELS = new Map<number, string>(
  Object.values(PACKET_ID).map((id) => [id, formatPacketId(id)]),
);

/**
 * packet id의 16진 표기 (`0x0100` 등) — 로그·진단용. 알려진 id는 미리 만든 문자열, 그 외(수신된 미지 id)는
 * 그때 계산한다 — 캐시가 공격자 id로 자라지 않는다. 메트릭 라벨에는 packetIdMetricLabel을 쓴다.
 */
export function packetIdLabel(id: number): string {
  return KNOWN_PACKET_ID_LABELS.get(id) ?? formatPacketId(id);
}

/** 미지 packet id를 모두 접는 메트릭 라벨 값. */
export const UNKNOWN_PACKET_ID_LABEL = "unknown";

/**
 * `packet_id` 메트릭 라벨 — 알려진 id는 packetIdLabel과 같고, 미지 id는 전부 "unknown"(3단계 리뷰: 미지 id마다
 * 시계열이 생겨 메트릭당 최대 65,536개 — IN_WORLD 연결 1개가 100 pkt/s로 약 11분이면 채우고, 같은 이벤트 루프의
 * scrape가 정지 원인이 됐다). 원값은 경고 로그(packetIdLabel)에 남는다.
 */
export function packetIdMetricLabel(id: number): string {
  return KNOWN_PACKET_ID_LABELS.get(id) ?? UNKNOWN_PACKET_ID_LABEL;
}

/**
 * `packet_id` 라벨 하나만 다는 카운터의 id별 핸들 캐시(성능 3단계 슬라이스 5). 알려진 id는 id별 핸들, 미지 id는
 * "unknown" 핸들 1개(캐시 상한 = PACKET_ID 수 + 1). 노출은 `inc({packet_id: packetIdMetricLabel(id)})`와 같다.
 */
export class PacketIdCounter {
  private readonly handles = new Map<number, CounterHandle>();
  private unknown: CounterHandle | null = null;

  constructor(private readonly counter: Counter) {}

  inc(packetId: number, by = 1): void {
    let h = this.handles.get(packetId);
    if (h === undefined) {
      if (!KNOWN_PACKET_ID_LABELS.has(packetId)) {
        this.unknown ??= this.counter.bind({ packet_id: UNKNOWN_PACKET_ID_LABEL });
        this.unknown.inc(by);
        return;
      }
      h = this.counter.bind({ packet_id: packetIdLabel(packetId) });
      this.handles.set(packetId, h);
    }
    h.inc(by);
  }
}
