// 성능 2-A — 메트릭 확장: 라벨 히스토그램·scrape 시점 프로세스 값·수집 훅.
//
// 계약(architecture.md §9.6): 기존 메트릭 이름·포맷·노출 순서 동결, 새 메트릭은 카탈로그 끝에 추가만.
//   - LabeledHistogram: Prometheus 표준(`name_bucket{<labels>,le="…"}`, `name_sum{<labels>}`,
//     `name_count{<labels>}`), 라벨 조합 핸들은 캐시(같은 라벨 = 같은 핸들, 키 순서 무관).
//   - 무라벨 Histogram 노출은 바이트 단위로 종전과 같다.
//   - CallbackMetric은 노출 때마다 값을 읽는다(프로세스 CPU·메모리).
//   - Registry 수집 훅(addCollector)은 노출 직전에 돈다(mmorpg_world_entities 개통). 훅 예외는 격리하고
//     mmorpg_metrics_collector_error_total로 센다(게이지가 직전 값에 머문다는 신호).

import { describe, expect, test } from "bun:test";
import {
  CallbackMetric,
  Gauge,
  Histogram,
  LabeledGauge,
  LabeledHistogram,
  Registry,
  metrics,
  registry,
} from "../../server/src/obs/metrics";
import { TickProfiler } from "../../server/src/obs/tickProfiler";

describe("Histogram(무라벨) — 노출 포맷 동결", () => {
  test("HELP/TYPE/bucket/+Inf/sum/count 바이트 그대로", () => {
    const h = new Histogram("dt", "tick dt", [1, 5]);
    h.observe(0.5);
    h.observe(3);
    h.observe(9);
    expect(h.expose()).toBe(
      "# HELP dt tick dt\n# TYPE dt histogram\n" +
        'dt_bucket{le="1"} 1\ndt_bucket{le="5"} 2\ndt_bucket{le="+Inf"} 3\n' +
        "dt_sum 12.5\ndt_count 3\n",
    );
  });
});

describe("LabeledHistogram", () => {
  test("라벨별 분리 누적 + Prometheus 표준 노출(le는 마지막 라벨)", () => {
    const h = new LabeledHistogram("ph", "phase ms", [1, 5]);
    h.observe({ phase: "a" }, 0.5);
    h.observe({ phase: "a" }, 7);
    h.observe({ phase: "b" }, 2);
    expect(h.expose()).toBe(
      "# HELP ph phase ms\n# TYPE ph histogram\n" +
        'ph_bucket{phase="a",le="1"} 1\nph_bucket{phase="a",le="5"} 1\nph_bucket{phase="a",le="+Inf"} 2\n' +
        'ph_sum{phase="a"} 7.5\nph_count{phase="a"} 2\n' +
        'ph_bucket{phase="b",le="1"} 0\nph_bucket{phase="b",le="5"} 1\nph_bucket{phase="b",le="+Inf"} 1\n' +
        'ph_sum{phase="b"} 2\nph_count{phase="b"} 1\n',
    );
  });

  test("labels()는 같은 조합에 같은 핸들(키 순서 무관) — 핫패스 1회 바인딩", () => {
    const h = new LabeledHistogram("x", "x", [1]);
    const a = h.labels({ phase: "p", zone: 1 });
    const b = h.labels({ zone: 1, phase: "p" });
    expect(a).toBe(b);
    a.observe(0.5);
    expect(h.labels({ phase: "p", zone: 1 }).snapshot().count).toBe(1);
  });

  test("관측 전에는 HELP/TYPE만", () => {
    expect(new LabeledHistogram("e", "empty", [1]).expose()).toBe("# HELP e empty\n# TYPE e histogram\n");
  });

  test("버킷 검증은 무라벨과 동일(단조증가·비어 있지 않음)", () => {
    expect(() => new LabeledHistogram("h", "h", [1, 1])).toThrow();
    expect(() => new LabeledHistogram("h", "h", [])).toThrow();
  });
});

describe("LabeledGauge(성능 4.5) — 라벨별 게이지, scrape 수집기가 비우고 다시 채운다", () => {
  test("set·value·clear — 값이 없으면 HELP/TYPE만, 첫 set 순서로 노출", () => {
    const head = "# HELP peer_x per peer\n# TYPE peer_x gauge\n";
    const g = new LabeledGauge("peer_x", "per peer");
    expect(g.expose()).toBe(head);
    g.set({ gateway: 2 }, 10);
    g.set({ gateway: 1 }, 0);
    g.set({ gateway: 2 }, 12);
    expect(g.value({ gateway: 2 })).toBe(12);
    expect(g.value({ gateway: 9 })).toBe(0);
    expect(g.expose()).toBe(`${head}peer_x{gateway="2"} 12\npeer_x{gateway="1"} 0\n`);
    g.clear();
    expect(g.expose()).toBe(head);
  });
});

describe("CallbackMetric — scrape 시점 값", () => {
  test("노출 때마다 read()를 다시 읽고 type을 그대로 표기", () => {
    let v = 1;
    const m = new CallbackMetric("proc_x_total", "x", "counter", () => v);
    expect(m.expose()).toBe("# HELP proc_x_total x\n# TYPE proc_x_total counter\nproc_x_total 1\n");
    v = 2.5;
    expect(m.expose()).toContain("proc_x_total 2.5\n");
  });

  test("read()가 throw하면 NaN — 노출 전체를 깨지 않는다", () => {
    const m = new CallbackMetric("g", "g", "gauge", () => {
      throw new Error("boom");
    });
    expect(m.expose()).toContain("g NaN\n");
  });
});

describe("Registry 수집 훅", () => {
  test("노출 직전 실행 — gauge를 최신값으로", () => {
    const r = new Registry();
    const g = r.register(new Gauge("ents", "live"));
    let live = 3;
    r.addCollector(() => g.set(live));
    expect(r.expose()).toContain("ents 3\n");
    live = 7;
    expect(r.expose()).toContain("ents 7\n");
  });

  test("훅 예외는 격리 — 나머지 노출은 정상(값은 직전 그대로)", () => {
    const r = new Registry();
    const g = r.register(new Gauge("ents", "live"));
    g.set(5);
    r.addCollector(() => {
      throw new Error("boom");
    });
    expect(r.expose()).toContain("ents 5\n");
  });

  test("훅 예외는 collectorErrors()로 셈 — 직전 값이 stale임을 알리는 신호(scrape마다 +1)", () => {
    const r = new Registry();
    let fail = true;
    r.addCollector(() => {
      if (fail) throw new Error("boom");
    });
    r.addCollector(() => {});
    expect(r.collectorErrors()).toBe(0);
    r.expose();
    r.expose();
    expect(r.collectorErrors()).toBe(2);
    fail = false;
    r.expose();
    expect(r.collectorErrors()).toBe(2);
  });
});

describe("전역 카탈로그 — 신규 메트릭은 끝에 추가만", () => {
  // §9.6 동결 목록(2-A 이전 노출 순서). 이 앞부분이 바뀌면 loadgen 스크레이퍼·대시보드 계약 위반.
  const FROZEN = [
    "mmorpg_tick_duration_ms",
    "mmorpg_tick_lateness_ms",
    "mmorpg_tick_skipped_total",
    "mmorpg_tick_stall_ms",
    "mmorpg_net_rx_bytes_total",
    "mmorpg_net_tx_bytes_total",
    "mmorpg_net_tx_partial_total",
    "mmorpg_net_tx_backlog_close_total",
    "mmorpg_net_packets_rx_total",
    "mmorpg_net_packets_tx_total",
    "mmorpg_router_unknown_packet_total",
    "mmorpg_router_state_rejected_total",
    "mmorpg_router_handler_error_total",
    "mmorpg_net_decode_error_total",
    "mmorpg_net_size_violation_total",
    "mmorpg_net_rate_violation_total",
    "mmorpg_net_rate_dropped_total",
    "mmorpg_net_rate_kick_total",
    "mmorpg_net_rate_reserve_total",
    "mmorpg_zone_tick_error_total",
    "mmorpg_conn_rejected_total",
    "mmorpg_dup_login_kick_total",
    "mmorpg_preempt_flush_lost_total",
    "mmorpg_input_queue_overflow_total",
    "mmorpg_world_entities",
    "mmorpg_world_connections",
    "mmorpg_log_dropped_lines_total",
    "mmorpg_unhandled_rejection_total",
    "mmorpg_log_suppressed_lost_total",
  ];
  const ADDED = [
    "mmorpg_tick_phase_ms",
    "mmorpg_process_cpu_user_seconds_total",
    "mmorpg_process_cpu_system_seconds_total",
    "mmorpg_process_rss_bytes",
    "mmorpg_process_heap_used_bytes",
    "mmorpg_metrics_collector_error_total",
  ];

  /** 성능 3단계 신설 — 2-A 목록 뒤에 추가만. */
  const ADDED_STAGE3 = [
    "mmorpg_net_tx_writes_total",
    // 슬라이스 8 — 과부하 신호.
    "mmorpg_overload_active",
    "mmorpg_overload_rejected_total",
  ];

  /** 성능 4단계 신설(월드 쪽 게이트웨이 IPC, 4.2c 게이트웨이 쪽) — 3단계 목록 뒤에 추가만. */
  const ADDED_STAGE4 = [
    "mmorpg_ipc_peers",
    "mmorpg_ipc_peer_lost_total",
    "mmorpg_ipc_hello_rejected_total",
    "mmorpg_ipc_stale_records_total",
    "mmorpg_ipc_rx_bytes_total",
    "mmorpg_ipc_tx_bytes_total",
    // 4.2c — 게이트웨이 쪽.
    "mmorpg_gw_connections",
    "mmorpg_gw_conn_rejected_total",
    "mmorpg_gw_conn_closed_total",
    "mmorpg_gw_world_connected",
    "mmorpg_gw_world_lost_total",
    "mmorpg_gw_stale_records_total",
    "mmorpg_gw_ipc_rx_bytes_total",
    "mmorpg_gw_ipc_tx_bytes_total",
    // 4.3a — 프로세스별 관측(백프레셔 여유·게이트웨이 송출 비용·월드 응답성).
    "mmorpg_ipc_pending_bytes",
    "mmorpg_gw_ipc_pending_bytes",
    "mmorpg_gw_deliver_batch_ms",
    "mmorpg_gw_deliver_records_total",
    "mmorpg_gw_ipc_rtt_ms",
    // 4단계 리뷰 픽스 — 월드의 HELLO 거절(HELLO_NACK) 사유.
    "mmorpg_gw_hello_refused_total",
  ];

  /** 성능 4.5 신설(F1 게이트웨이 부하 기반 접속 제한, F2 MULTICAST, F3 공유 프레임) — 4단계 목록 뒤에 추가만. */
  const ADDED_STAGE45 = [
    "mmorpg_gw_admission_active",
    "mmorpg_gw_admission_rejected_total",
    "mmorpg_gw_event_loop_lag_ms",
    "mmorpg_ipc_peer_pending_bytes",
    "mmorpg_ipc_peer_admission_busy",
    "mmorpg_ipc_admission_rejected_total",
    // 4.5 F2 — MULTICAST(sendMany 팬아웃 = 게이트웨이당 CONN_MULTICAST 레코드 1개).
    "mmorpg_ipc_multicast_records_total",
    "mmorpg_ipc_multicast_recipients_total",
    "mmorpg_ipc_multicast_saved_bytes_total",
    "mmorpg_gw_multicast_records_total",
    "mmorpg_gw_multicast_recipients_total",
    // 4.5 F3 — 공유 프레임(CONN_DELIVER_SHARED — 같은 셀 viewer의 SNAPSHOT_DELTA DEF 1개 + 연결별 ackSeq 패치).
    "mmorpg_ipc_shared_defs_total",
    "mmorpg_ipc_shared_refs_total",
    "mmorpg_ipc_shared_saved_bytes_total",
    "mmorpg_gw_shared_defs_total",
    "mmorpg_gw_shared_refs_total",
    "mmorpg_gw_deliver_assembled_bytes_total",
    // 4.5 후속 — 피어 점진 감축(포화 게이트웨이를 통째로 끊는 대신 인월드 세션 일부만 KICK 9)·채팅 속도 제한.
    "mmorpg_ipc_shed_sessions_total",
    "mmorpg_ipc_shed_events_total",
    "mmorpg_chat_throttled_total",
    // 자유 포인트 — 배분·초기화 연결당 속도 제한.
    "mmorpg_stat_op_throttled_total",
    // 4.5 후속 — 스냅샷 꼬리: tick 사이 GC 페이서.
    "mmorpg_gc_paced_total",
    "mmorpg_gc_pace_deferred_total",
    // 이동 입력 검토 — MOVE_TO 연결당 속도 제한.
    "mmorpg_move_to_throttle_total",
    // 이진 전환 H1 — SNAPSHOT_DELTA 분할(프레임 body u16 상한).
    "mmorpg_snapshot_delta_split_total",
    // 이진 전환 B2c — 디코드 실패 strike KICK.
    "mmorpg_net_decode_kick_total",
    // 이진 전환 B4 — 송신 단위 인코드 실패 방어층(그 패킷만 버림).
    "mmorpg_net_encode_error_total",
    // 자동 재접속 선결 — 공유 포트 리스너 양보(IPC v14).
    "mmorpg_gw_listen_yielded",
    "mmorpg_gw_listen_transitions_total",
    "mmorpg_ipc_listen_directives_total",
    // 생활 L-1 — 채집 채널 중단 사유(점유·다계정 교대 관측).
    "mmorpg_life_cancel_total",
    // 생활 L-1b — 채집 시작(GATHER_START) 연결당 속도 제한.
    "mmorpg_life_op_throttled_total",
  ];

  test("기존 이름·순서 불변 + 2-A 신규는 그 뒤 + 3단계 신규는 다시 그 뒤 + 4단계 신규는 다시 그 뒤 + 4.5 신규는 다시 그 뒤", () => {
    const names = registry.list().map((m) => m.name);
    expect(names.slice(0, FROZEN.length)).toEqual(FROZEN);
    expect(names.slice(FROZEN.length, FROZEN.length + ADDED.length)).toEqual(ADDED);
    const at = FROZEN.length + ADDED.length;
    expect(names.slice(at, at + ADDED_STAGE3.length)).toEqual(ADDED_STAGE3);
    const at4 = at + ADDED_STAGE3.length;
    expect(names.slice(at4, at4 + ADDED_STAGE4.length)).toEqual(ADDED_STAGE4);
    const at45 = at4 + ADDED_STAGE4.length;
    expect(names.slice(at45)).toEqual(ADDED_STAGE45);
  });

  test("mmorpg_world_entities HELP = 전 존 합계(scrape 시점 계산) — 2-A에서 개통한 의미", () => {
    const m = registry.list().find((x) => x.name === "mmorpg_world_entities");
    expect(m?.help).toBe("Live entities across all zones (computed at scrape)");
  });

  test("mmorpg_metrics_collector_error_total — 전역 registry의 수집 훅 예외 수(counter)", () => {
    const text = registry.expose();
    expect(text).toContain("# TYPE mmorpg_metrics_collector_error_total counter\n");
    const v = Number(/\nmmorpg_metrics_collector_error_total (\S+)\n/.exec(text)?.[1]);
    expect(v).toBe(registry.collectorErrors());
  });

  test("프로세스 값은 scrape 시점 계산 — CPU는 counter, 메모리는 gauge, 양수", () => {
    const text = registry.expose();
    expect(text).toContain("# TYPE mmorpg_process_cpu_user_seconds_total counter");
    expect(text).toContain("# TYPE mmorpg_process_cpu_system_seconds_total counter");
    expect(text).toContain("# TYPE mmorpg_process_rss_bytes gauge");
    expect(text).toContain("# TYPE mmorpg_process_heap_used_bytes gauge");
    const rss = Number(/\nmmorpg_process_rss_bytes (\S+)\n/.exec(text)?.[1]);
    const heap = Number(/\nmmorpg_process_heap_used_bytes (\S+)\n/.exec(text)?.[1]);
    const user = Number(/\nmmorpg_process_cpu_user_seconds_total (\S+)\n/.exec(text)?.[1]);
    expect(rss).toBeGreaterThan(0);
    expect(heap).toBeGreaterThan(0);
    expect(user).toBeGreaterThan(0);
  });

  test("mmorpg_tick_phase_ms 버킷 — 0.1~1000 ms 세밀 버킷", () => {
    const h = new LabeledHistogram("probe", "p", metrics.tickPhaseMs.bucketBounds());
    h.observe({ phase: "x" }, 0.05);
    const text = h.expose();
    for (const le of [0.1, 0.25, 0.5, 1, 2, 3, 5, 7.5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 250, 500, 1000]) {
      expect(text).toContain(`probe_bucket{phase="x",le="${le}"} 1`);
    }
  });
});

describe("TickProfiler → mmorpg_tick_phase_ms{phase}", () => {
  test("end()마다 단계별 tick 합계를 라벨 히스토그램에 관측(안 불린 단계는 0)", () => {
    let t = 0;
    const hist = new LabeledHistogram("ph", "ph", [1, 5]);
    const p = new TickProfiler({ now: () => t, ringSize: 4, phaseHistogram: hist });
    p.begin();
    t += 2;
    p.mark("a");
    t += 3;
    p.mark("a");
    p.end(5, 0);
    p.begin();
    t += 0.5;
    p.mark("b");
    p.end(0.5, 0);
    expect(hist.labels({ phase: "a" }).snapshot()).toMatchObject({ count: 2, sum: 5 });
    expect(hist.labels({ phase: "b" }).snapshot()).toMatchObject({ count: 1, sum: 0.5 });
  });
});
