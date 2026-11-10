// tick 단계별 계측(성능 2-A) — clock은 obs에만 둔다.
//
// sim/world 코드는 `PhaseMarker.mark(phase)`만 호출한다. Zone.tick이 각 단계를 마칠 때 기존
// private 메서드명으로 mark하고, 구현(TickProfiler)이 직전 mark(또는 begin) 이후 경과를 그
// 단계에 귀속한다. 프로파일러 미주입 Zone(테스트·결정론 골든)은 `this.profiler?.mark("…")`의
// undefined 검사 1회뿐이라 동작·할당이 종전과 같다.
//
// tick 1건의 경계: begin()(worldMain.ts tick 콜백 첫 줄) ~ end(duration, lateness)(tickLoop의 onTick
// 훅 — duration·lateness는 tickLoop가 메트릭에 넣는 값 그대로). 한 tick 안에서 같은 단계가 여러
// 존에서 불리면 합산(존 전체 비용). 단계 귀속 규칙상 tickAll의 존 정렬·루프 비용은 첫 존의
// applyInputs에, 복귀 풀회복 ENTITY_META 송신·forcedUpdates 병합은 dispatchSnapshots에, 존 tick
// 예외(실패 단계의 부분 시간 + 에러 처리)는 zoneError에 들어간다.
//
// 링: 마지막 ringSize tick(기본 4096 ≈ 204초)을 단계별 Float64Array로 보관한다. 모든 단계 링은
// end()마다 같은 인덱스에 쓰여(안 불린 단계 = 0) 정렬이 항상 맞는다. /admin/perf가 원자료로 노출.
// 히스토그램: phaseHistogram을 주면 end()마다 단계별 tick 합계를 `mmorpg_tick_phase_ms{phase}`에
// 관측한다(단계 슬롯 생성 때 라벨 핸들을 1회 바인딩 — tick마다 라벨 키를 만들지 않는다).

import type { HistogramChild, LabeledHistogram } from "./metrics";

/** Zone·SessionManager가 보는 최소 계약 — 구현(clock)은 obs에. */
export interface PhaseMarker {
  mark(phase: string): void;
}

/** Zone.tick 단계 — 기존 private 메서드명·호출 순서(이전 벤치 스크립트와 라벨 호환). */
export const ZONE_TICK_PHASES = [
  "applyInputs",
  "runMonsterAi",
  "runSystems",
  "runCombat",
  "runSkills",
  "runItems",
  "runPickups",
  "runLifeChannels",
  "runMonsterRespawns",
  "runNodeRespawns",
  "runDropExpiry",
  "runManaRegen",
  "runMonsterRegen",
  "dispatchSnapshots",
] as const;

/** withCork: 인증 세션 스냅샷 + 세션별 cork(존 tick 전). */
export const CORK_PHASE = "cork";
/** worldMain.ts tick 콜백: outcome 드레인·퀘스트 kill 훅·EXP 처리 동기부·인벤 dirty 마킹. */
export const OUTCOMES_PHASE = "outcomes";
/** withCork: 세션별 uncork(= tick 송신 write). /admin/perf에서는 phasesMs가 아닌 flushMs. */
export const FLUSH_PHASE = "flush";
/**
 * 성능 4단계 4.2b(ROLE=world): withCork 뒤 게이트웨이 피어별 IPC 배치 flush(serverTick ipcFlush 훅 — tick 송신이 IPC 봉투로
 * 나가는 시간). 훅을 주입한 프로세스에서만 슬롯이 생긴다(monolith의 phasesMs·메트릭에는 나타나지 않음).
 */
export const IPC_FLUSH_PHASE = "ipcFlush";
/**
 * ZoneRegistry.tickAll catch: 존 tick 예외 — 실패한 단계의 부분 시간 + 에러 메트릭·로그 비용.
 * 이 mark가 없으면 그 시간이 다음 존의 applyInputs(마지막 존이면 outcomes)로 샌다. 첫 예외 때
 * 슬롯이 생기므로 예외가 없던 프로세스의 phasesMs·메트릭에는 나타나지 않는다.
 */
export const ZONE_ERROR_PHASE = "zoneError";
/**
 * serverTick withCork 안 존 tick 직전: 속도 제한으로 보류된 MOVE_TO 해제(A* + 본인 MOVE_PATH). 실제로 푼 tick에만 mark하므로
 * 보류가 없던 프로세스의 phasesMs·메트릭에는 나타나지 않는다(이 mark가 없으면 그 시간이 첫 존의 applyInputs로 샌다).
 */
export const MOVE_TO_DRAIN_PHASE = "moveToDrain";

/** /admin/perf 링 길이 — 20 Hz × 약 204초. */
export const PERF_RING_SIZE = 4096;
const DEFAULT_MAX_PHASES = 32;

export interface TickProfilerOptions {
  /** 단조 시계(ms). 기본 performance.now — 테스트는 가짜 시계. */
  now?: () => number;
  ringSize?: number;
  /** 단계 이름 상한 — 초과 이름은 무시(링 메모리 무한 증식 방지). */
  maxPhases?: number;
  /** 단계별 tick 합계를 관측할 라벨 히스토그램(운영: metrics.tickPhaseMs). */
  phaseHistogram?: LabeledHistogram;
}

export interface TickProfileSnapshot {
  /** 마지막 reset 이후 확정된 tick 수(링 길이와 무관). */
  ticks: number;
  durationsMs: number[];
  latenessMs: number[];
  /** flush를 제외한 단계별 tick 합계(ms). 각 배열 길이 = durationsMs 길이. */
  phasesMs: Record<string, number[]>;
  flushMs: number[];
}

interface PhaseSlot {
  readonly name: string;
  /** 이번 tick 누적(ms). */
  current: number;
  readonly ring: Float64Array;
  readonly hist: HistogramChild | undefined;
}

export class TickProfiler implements PhaseMarker {
  private readonly now: () => number;
  private readonly size: number;
  private readonly maxPhases: number;
  private readonly phaseHistogram: LabeledHistogram | undefined;
  private readonly slots: PhaseSlot[] = [];
  private readonly slotByName = new Map<string, PhaseSlot>();
  private readonly durations: Float64Array;
  private readonly lateness: Float64Array;
  /** 다음 쓰기 인덱스. */
  private head = 0;
  /** 링에 담긴 tick 수(≤ size). */
  private filled = 0;
  private ticks = 0;
  private open = false;
  private last = 0;

  constructor(opts: TickProfilerOptions = {}) {
    this.now = opts.now ?? (() => performance.now());
    this.size = Math.max(1, opts.ringSize ?? PERF_RING_SIZE);
    this.maxPhases = Math.max(1, opts.maxPhases ?? DEFAULT_MAX_PHASES);
    this.phaseHistogram = opts.phaseHistogram;
    this.durations = new Float64Array(this.size);
    this.lateness = new Float64Array(this.size);
  }

  /** tick 시작 — 이후 첫 mark의 기준점. */
  begin(): void {
    this.last = this.now();
    this.open = true;
  }

  mark(phase: string): void {
    if (!this.open) return;
    const t = this.now();
    const slot = this.slotByName.get(phase) ?? this.addSlot(phase);
    if (slot !== undefined) slot.current += t - this.last;
    this.last = t;
  }

  /** tick 확정 — tickLoop onTick 훅이 (처리 시간, 지연)과 함께 호출. */
  end(durationMs: number, latenessMs: number): void {
    const i = this.head;
    this.durations[i] = durationMs;
    this.lateness[i] = latenessMs;
    for (const s of this.slots) {
      s.ring[i] = s.current;
      s.hist?.observe(s.current);
      s.current = 0;
    }
    this.head = (i + 1) % this.size;
    if (this.filled < this.size) this.filled++;
    this.ticks++;
    this.open = false;
  }

  /** 링·tick 수 초기화. 단계 슬롯(이름·라벨 핸들)은 유지. */
  reset(): void {
    this.head = 0;
    this.filled = 0;
    this.ticks = 0;
  }

  snapshot(): TickProfileSnapshot {
    const phasesMs: Record<string, number[]> = {};
    let flushMs: number[] | undefined;
    for (const s of this.slots) {
      const arr = this.ordered(s.ring);
      if (s.name === FLUSH_PHASE) flushMs = arr;
      else phasesMs[s.name] = arr;
    }
    return {
      ticks: this.ticks,
      durationsMs: this.ordered(this.durations),
      latenessMs: this.ordered(this.lateness),
      phasesMs,
      flushMs: flushMs ?? new Array<number>(this.filled).fill(0),
    };
  }

  private addSlot(phase: string): PhaseSlot | undefined {
    if (this.slots.length >= this.maxPhases) return undefined;
    const slot: PhaseSlot = {
      name: phase,
      current: 0,
      ring: new Float64Array(this.size),
      hist: this.phaseHistogram?.labels({ phase }),
    };
    this.slots.push(slot);
    this.slotByName.set(phase, slot);
    return slot;
  }

  /** 링 → 오래된 것부터 최신 순 배열. */
  private ordered(ring: Float64Array): number[] {
    const out = new Array<number>(this.filled);
    const start = this.filled < this.size ? 0 : this.head;
    for (let k = 0; k < this.filled; k++) out[k] = ring[(start + k) % this.size]!;
    return out;
  }
}
