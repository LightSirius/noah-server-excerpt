# 성능 베이스라인 (Phase C)

> **목적:** Phase D(v3 바이너리 프로토콜) 전후 회귀 비교점.
> 측정 도구는 `tools/loadgen/`, 시나리오 정의는 `tools/loadgen/scenario.ts`.
>
> **realistic 프로필 변경(2026-11-04 — 4타입 기본 스킬):** 새 캐릭터가 스킬 없이 시작하게 되면서(강타·매직볼·치유 자동 지급 중단 —
> [skill-type-basics.md §6](skill-type-basics.md)) DevAuto로 만드는 loadgen 봇에게 배운 스킬이 없다. 봇은 이제 SKILL_LIST의 `learned`만 시전하므로
> (`tools/loadgen/bot/realisticBot.ts`) realistic hunt는 **평타만** 쓴다 — SKILL_CAST·SKILL_CAST_ACK·SKILL_EFFECT·MANA_UPDATE(시전분) 트래픽이 빠진다.
> 이 날짜 이전의 realistic 수치(아래 표 전부)는 봇당 강타·매직볼 시전이 섞인 부하라 이후 측정과 직접 비교하지 않는다. 운영 거부가 보장된 기존
> dev/perf 전용 스킬 지급 경로가 없어 프로필을 맞추지 않았다 — 필요해지면 production 부팅 거부가 붙은 env로 DevAuto 캐릭터에 스킬을 심는 경로를 따로 만든다.

## 기준선 — 100 CCU @ 30s hold (v2 JSON-over-TCP)

| 항목 | 값 |
|---|---|
| 측정일 | 2026-05-03 |
| 커밋 | Phase C wiring 직후 (이 파일과 같은 commit) |
| 머신 | Windows 11, 단일 PC localhost |
| 서버 | `bun run server/src/index.ts`, `DB_PATH=:memory:`, port 9000 / admin 9090 |
| 클라이언트 | 100 가상 CCU, ramp 20 ms × 100, hold 30 s, INPUT_CMD 50 Hz |

### 게이트 (모두 PASS)

| 게이트 | 결과 | 측정값 |
|---|---|---|
| tick p99 < 25 ms | ✅ | 9.95 ms |
| rate/size/decode 위반 0 | ✅ | rate=0 size=0 decode=0 |
| KICK 0 / errored 0 / 100/100 ok | ✅ | 100/100 |

### 상세 메트릭

| 메트릭 | 값 |
|---|---|
| `mmorpg_tick_duration_ms` p50 / p99 | **5.53 / 9.95 ms** |
| tick samples (30s hold) | 918 |
| `mmorpg_net_rx_bytes_total` (server 수신) | 2,558,486 B (≈ 2.4 MiB) |
| `mmorpg_net_tx_bytes_total` (server 송신) | 252,403,189 B (≈ 240.7 MiB) |
| `mmorpg_net_packets_rx_total` | 48,222 |
| `mmorpg_net_packets_tx_total` | 75,029 |
| `mmorpg_net_rate_violation_total` | 0 |
| `mmorpg_net_size_violation_total` | 0 |
| `mmorpg_router_unknown_packet_total` | 0 |
| `mmorpg_router_state_rejected_total` | 0 |
| `mmorpg_router_handler_error_total` | 0 |
| 핸드셰이크 평균 | 51 ms |
| 클라당 입력 평균 | ≈ 478 (`47,822 / 100`) |
| 클라당 송신 평균 | ≈ 25.6 KB |
| 클라당 수신 평균 | ≈ 2.52 MB |

### 관찰

- **TX 우세:** 서버 송신 252 MB / 수신 2.4 MB → **약 100×**. 모든 클라가 같은 spawn 좌표(0, 0)에 모여 한 AOI 셀을 공유 → SC_SNAPSHOT_DELTA에 100명 위치가 모두 들어가는 worst-case.
- **tick 여유 충분:** p99 9.95 ms가 50 ms 예산의 20%. 동일 머신에서 200~300 CCU까지는 수직 확장 가능 추정.
- **violations 0:** Phase B token bucket(IN_WORLD 100/s)이 50 Hz 입력 + 핸드셰이크 + 게이트 폴링을 충분히 커버.

## Phase D step 1 — SNAPSHOT_DELTA 만 binary (2026-05-03 측정)

| 메트릭 | Phase C (JSON) | Phase D-1 (binary 0x0101) | 변화 |
|---|---|---|---|
| `mmorpg_net_tx_bytes_total` | 252,403,189 (240.7 MiB) | **50,856,683 (48.5 MiB)** | **÷ 4.96** |
| `mmorpg_net_rx_bytes_total` | 2,558,486 | 2,554,335 | ≈ |
| tick p50 | 5.53 ms | **2.99 ms** | ÷ 1.85 (JSON.stringify 비용 제거) |
| tick p99 | 9.95 ms | 9.70 ms | ≈ |
| 핸드셰이크 평균 | 51 ms | 51 ms | ≈ |
| KICK / decode / handler err | 0 / 0 / 0 | 0 / 0 / 0 | OK |

**결론:** SNAPSHOT_DELTA 한 패킷 binary 전환만으로 게이트 5× 거의 달성(4.96×). 다른 패킷의 wire 비중은 미미 (rx 2.5 MB ≪ tx 48 MB) — 추가 binary 전환의 한계 효용은 작음. Phase D step 2(전체 binary + 헤더 LE 4-byte)는 Unity 클라 동시 변경이 필요하며 본 step의 효용이 충분히 입증되어 우선순위 ↓.

코드 변경(서버 + 테스트만, Unity 미변경):
- `server/src/net/binaryCodec.ts` — `encodeSnapshotDeltaBody`/`decodeSnapshotDeltaBody`. 와이어 포맷 LE: `[tickIndex:u32][ackSeq:u32][count:u16][N × {entityId:u32, x:f32, y:f32}]`.
- `server/src/network/packetWriter.ts` — `packetId === SNAPSHOT_DELTA`이면 binary, 그 외 JSON. 헤더는 당시 v1 `[id:u16 BE][len:u32 BE]` 그대로(측정 당시 기록 — B1에서 v2 4바이트 LE로 전환).
- `tests/integration/v2-baseline.test.ts` + `tools/loadgen/virtualClient.ts` — decodeStream에서 0x0101 분기.
- `tests/server/binaryCodec.test.ts` — round-trip 6 케이스.

**Unity 클라 후속 작업:** `client/Noah/Assets/Scripts/Network/PacketReader.cs`(또는 호출자)가 packetId 0x0101 frame body를 binary로 디코드하도록 수정. 현재 미반영 — Unity에서 SNAPSHOT_DELTA 디코드 실패 예상. 사용자 Editor 검증 필요.

## Phase D step 2 게이트 (잔여)

다음을 만족해야 step 2 머지 가능 (현재 보류):

- 동일 시나리오에서 `mmorpg_net_tx_bytes_total` ≥ **5× 감소** (이미 4.96× 달성, 추가 마진 확보).
- tick p99 회귀 없음 (≤ 12 ms 권장).
- KICK 0 / decode 0 / handler error 0 유지.
- Unity 클라가 새 와이어 포맷으로 동작.

## 재현 절차

```powershell
# 터미널 1: 서버 (메모리 DB)
cd server
$env:DB_PATH = ":memory:"
bun run src/index.ts

# 터미널 2: loadgen
bun run tools/loadgen/run.ts --ccu 100 --duration 30
```

또는 smoke만:

```powershell
bun test tests/integration/loadgen-smoke.test.ts
```

## 측정 방법 — 서버 계측 (성능 2-A 이후)

tick 통계는 **`GET /admin/perf` 원자료(정확 분위수)** 를 우선 쓰고, 엔드포인트가 없으면(404) `/admin/metrics` 히스토그램
버킷 델타로 근사한다(2-B loadgen `tools/loadgen/serverPerf.ts`가 이 순서로 수집 — 사용법은 [`tools/loadgen/README.md`](../tools/loadgen/README.md)).
`/admin/perf`는 dev 전용(production은 라우트 자체가 없어 404)이며 계약·보안은 [`architecture.md`](architecture.md) §9.6.

| 필드 | 쓰임 |
|------|------|
| `ticks` / `windowMs` | 실효 sim Hz = `ticks / (windowMs/1000)` (20 미만이면 캐치업 skip 발생) |
| `durationsMs` | tick 처리 시간 원자료 — p50/p99/max 직접 계산(게이트: p99 < 25 ms) |
| `latenessMs` | tick 시작 지연 원자료 |
| `phasesMs{phase}` | 단계 분해(§4.1): 존 14단계(`applyInputs`…`dispatchSnapshots`, 존 합산 — 2026-11-04 `runMonsterRegen`, 생활 L-1의 `runLifeChannels`·`runNodeRespawns` 추가 전 기록은 11단계) + `cork`·`outcomes` (+ 존 tick 예외가 났으면 `zoneError`) |
| `flushMs` | withCork uncork = tick 송신 write 시간(분산 배치에서 지배 비용) |
| `cpu.userUs+systemUs` | reset 이후 서버 CPU — 코어 수 = `(userUs+systemUs) / 1000 / windowMs` |
| `memory.rss` / `heapUsed` | 현재값(`?gc=1`이면 GC 직후) |

절차(hold 윈도우 1회):

```powershell
# 서버(메모리 DB) — 측정 손잡이는 아래 env 표
$env:DB_PATH = ":memory:"; $env:LOG_LEVEL = "warn"; $env:PERF_SPAWN_SPREAD = "256"
bun run server/src/index.ts

# 유휴 RSS → hold 시작(리셋, 응답은 리셋 직전 상태라 버린다) → hold 끝 수집
curl.exe -s "http://127.0.0.1:9090/admin/perf?gc=1"
curl.exe -s "http://127.0.0.1:9090/admin/perf?reset=1" > $null
# ... loadgen hold ...
curl.exe -s "http://127.0.0.1:9090/admin/perf" > perf-hold.json
curl.exe -s "http://127.0.0.1:9090/admin/metrics" | Select-String "mmorpg_tick_phase_ms_(sum|count)"
```

- 링은 마지막 4096 tick(≈204초) — 더 긴 hold는 마지막 204초의 분위수다.
- Windows의 `process.cpuUsage` 해상도는 약 15.6 ms(실측)라 수 초짜리 창의 CPU는 거칠다 — hold ≥ 30초 권장.
- `ADMIN_TOKEN`을 설정했으면 `-H "Authorization: Bearer <token>"`. 브라우저에서는 교차 출처 403, 부수효과 쿼리
  (`reset=1`·`gc=1`·`stall`)는 동일 출처·주소창이어도 403 — curl·loadgen(Bun `fetch`)으로만 건다. 읽기 전용 GET은 주소창 가능.
- hold 중 `/admin/perf` 폴링은 1회에 이벤트 루프를 약 4 ms(스냅샷·직렬화) 붙잡는다 — hold 끝에 1회만 읽는다.

측정 손잡이(env, 상세는 README 환경 변수 목록·`.env.example`):

| env | 용도 |
|-----|------|
| `PERF_SPAWN_SPREAD=<타일>` | dev 전용 — ENTER_WORLD 때 존 스폰 ±N 타일 안 walkable 셀에 charId 해시로 분산(spread 시나리오). production 부팅 거부 |
| `MONSTER_DATA_FILE=<경로>` | dev 전용 — 몬스터 정의·스폰 파일 대체(밀도 시나리오 — `tools/loadgen/genSpawns.ts` 출력). 같은 검증 적용, production 부팅 거부 |
| `AUTOSAVE_INTERVAL_SEC` + `DB_PATH=<파일>` | 짧은 자동저장 + 파일 DB 시나리오 |
| `MAX_CONNECTIONS` / `MAX_CONNECTIONS_PER_IP` / `MAX_PREAUTH_*` | 고 CCU·로그인 폭주 측정 시 상향 |

1단계 정지 처리 검증: `curl.exe -s "http://127.0.0.1:9090/admin/perf?stall=7000"`(이벤트 루프 7초 busy-wait) 후
`/admin/metrics`에서 `mmorpg_tick_stall_ms_count` +1·`mmorpg_tick_skipped_total` 증가, loadgen KICK 0을 확인한다.
다음 stall은 직전 stall이 끝난 뒤 그 길이(여기선 7초)가 지나야 받는다 — 그 전이면 `429`(`retry-after` 초).

## 성능 2-C 기준선 — 1단계 후·최적화 전 (Windows vs Linux)

> **측정일 2026-10-06 · 커밋 `0a5a554`** (`bun-to-cpp-server`, 두 플랫폼 동일, 측정 중 레포 무수정).
> 안정성 1단계(자동저장 청크 배치 `7830609`, 정지 후 버스트 KICK 제거 `18fb724`·`ac46040`·`6c5db16`, tick 캐치업 상한
> `ac6f59e`, 연결 상한 env `8ee8433`, 부분 쓰기 백프레셔 `e19dce1`)를 넣은 뒤, Bun 최적화를 시작하기 전의 용량 기준선이다.
> 모든 수치는 2-C 측정 보고(Windows·Linux)와 선행 연구(`final.md` §2.2, I2)에서 옮겼다. "계산"은 그 수치끼리의 산술,
> "—"는 미측정이다. 셀의 `A / B`는 **Windows / Linux**다.

### 환경

| 항목 | Windows | Linux (WSL2) |
|---|---|---|
| 머신 | i7-8700K 6C/12T, 32 GB, 네이티브 | 같은 호스트의 WSL2 VM — 12 vCPU, RAM 15,959 MB(시작 시 가용 15,285) |
| OS / 커널 | Windows 11 | Ubuntu 22.04.3, `6.18.40.1-microsoft-standard-WSL2` |
| Bun | 1.3.13 | 1.3.13 (`bun install --frozen-lockfile --linker hoisted` — lockfile이 gitignore라 고정 대상 없음, zod 4.6.5로 Windows와 같음) |
| 측정 창 (KST) | 19:32:18–20:09:09 (약 36분 51초) | 20:16:11–20:52:16 (약 36분, 5초 smoke 선행) |
| 배경 부하 | 원격 데스크톱·dwm·작업 관리자 ≈1.3 논리 코어(원격 세션이라 중지 불가) | Windows 호스트 ≈1.3–2.4코어(remoting_host·Taskmgr·Orca UI), WSL 내부 ≈0.01 |
| 부하 생성기 | 샤드당 CPU 최대 0.45(한도 0.8), 합계 ≤≈0.9코어 | 샤드당 최대 0.67, 합계 ≤≈1.8코어(서버+LG ≤≈3.3/12) |

부하 생성기는 두 플랫폼 모두 병목이 아니었다. 종료 후 bun 프로세스·19000/19090 리스너는 양쪽 모두 0.

### 방법

- `bun tools/loadgen/orchestrate.ts --spawn-server --scenario <s> --levels <…> [--repeat 3] [--monster-file …]` — 포트 19000/19090,
  hold `--duration 30`(정지 검증 60초, 자동저장 40초), 조인 100/s(login-storm은 0 = 동시), 나머지 기본값.
  레벨마다 새 서버(`DB_PATH=:memory:`, `LOG_LEVEL=warn`, 연결 상한은 `levelRunner`가 레벨 CCU로 올린다). Linux는 `ulimit -n 65536`.
- 반복: stock 100·300, spread 500·1000, realistic 250·500·1000은 3회(표는 평균, p99 괄호는 범위), 나머지는 1회.
  보충 레벨: 양쪽 stock 450·realistic 300/350/400, Linux만 stock 250·spread 375/625·realistic 275.
- realistic 몬스터: `bun tools/loadgen/genSpawns.ts --count 600 --zone 2` → 608 스폰(Field 600), sha256 `dc5d3482…6844` — 두 플랫폼 동일.
- 중단 규칙 "Hz < 15면 상위 레벨 생략" → realistic 1500은 양쪽 모두 생략.
- 표기: 시간은 ms. tick = 처리 시간, late = tick 시작 지연, skip = hold 중 건너뛴 tick, snap·flush = `dispatchSnapshots`·uncork 송신의
  tick당 평균, CPU = 서버 코어(user/sys), RSS = hold 시점 MB(유휴는 W ≈235 / L ≈92).

### 임계점

| 시나리오 | p99 > 25 ms | p99 > 50 ms | Hz < 20 | Hz < 15 |
|---|---|---|---|---|
| stock (전원 Town 스폰 1점) | ≈250 / ≈250 | ≈420 / ≈390 | 450 (19.01) / 450 (19.59) ¹ | 500 (14.07) / 500 (13.30) |
| spread (Town 64×64 클램프) | ≈340 / ≈375 | ≈540 / ≈550 | 500–750 사이 / 500–625 사이(625 = 17.39) | 750 (14.07) / 750 (12.66) |
| realistic (+몬스터 600) | ≈250 / ≈275 | Hz가 먼저 무너짐(p99만으론 ≈430) / ≈320 | 300 (19.51) / 300 (19.67) | 400 (12.93) / 350 (14.97, 경계)·400 (13.80) |
| login-storm (폭주 후 유휴) | 500에서 32.3 / 43.9 | 1000에서 100.1 / 108.7 | 1000 (12.17) / 1000 (10.64) | 1000 / 1000 |

¹ 400은 Hz 20.13 / 20.05지만 skip 1 / 3, late p99 239.9 / 254.1로 이미 경계다.

- 교차 CCU는 두 플랫폼이 거의 같다.
- stock·spread는 **tick 자체**가 50 ms를 넘어 캐치업 상한이 걸리며 무너진다(late ≈235 ms 고정 + skip).
  realistic은 **tick 밖 작업**이 한계다(아래 "이상·주의" 1).

### 1. stock (전원 Town 스폰 지점)

| CCU | tick p50 | tick p99 | Hz | late p99 | skip | snap | flush | CPU W (u/s) | CPU L (u/s) | RSS |
|---|---|---|---|---|---|---|---|---|---|---|
| 100 (n=3) | 4.2 / 3.4 | 7.4 (6.9–8.0) / 6.1 (5.9–6.3) | 20.00 / 20.00 | 20.3 / 0.1 | 0 / 0 | 2.20 / 2.37 | 1.61 / 0.69 | 0.16 (0.11/0.06) | 0.34 (0.17/0.18) | 262 / 132 |
| 200 | 10.8 / 6.1 | 17.4 / 10.3 | 19.99 / 20.00 | 22.6 / 0.1 | 0 / 0 | 7.12 / 4.65 | 3.29 / 1.37 | 0.37 (0.26/0.11) | 0.46 (0.29/0.17) | 284 / 137 |
| 250 (L만) | — / 14.8 | — / 26.0 | — / 19.98 | — / 2.0 | — / 0 | — / 13.12 | — / 1.74 | — | 0.98 (0.61/0.38) | — / 148 |
| 300 (n=3) | 22.8 / 22.8 | 33.8 (31.2–35.6) / 38.2 (36.7–39.6) | 20.00 / 20.01 | 20.2 / 1.6 | 0 / 0 | 16.70 / 18.12 | 5.36 / 5.21 | 0.70 (0.54/0.16) | 1.23 (0.79/0.44) | 372 / 162 |
| 400 | 29.1 / 30.4 | 44.3 / 52.5 | 20.13 / 20.05 | 239.9 / 254.1 | 1 / 3 | 21.45 / 25.04 | 7.45 / 6.58 | 0.92 (0.70/0.22) | 1.44 (0.99/0.45) | 406 / 191 |
| 450 | 36.4 / 37.9 | 56.9 / 62.4 | 19.01 / 19.59 | 264.4 / 253.7 | 35 / 17 | 28.99 / 30.77 | 8.53 / 7.75 | 1.12 (0.88/0.24) | 1.58 (1.11/0.46) | 457 / 196 |
| 500 | 59.9 / 65.5 | 72.7 / 86.3 | 14.07 / 13.30 | 269.2 / 263.4 | 177 / 201 | 48.97 / 55.22 | 9.41 / 8.29 | 1.15 (0.95/0.20) | 1.52 (1.16/0.36) | 480 / 229 |

| CCU | tx B/s/CCU | 갱신/스냅샷 | RTT p99 | lagGrowth p99 | 입력 overflow |
|---|---|---|---|---|---|
| 100 | 22,024 / 22,032 | 89 / 89 | 7.4 / 3.5–4.1 | 34–41 / 5.8–7.3 | 0 / 0 |
| 200 | 43,438 / 43,448 | 179 / 179 | 17.6 / 6.1 | 39.9 / 8.3 | 0 / 0 |
| 250 | — / 54,127 | — / 223 | — / 18.3 | — / 15.6 | — / 0 |
| 300 | 64,682 / 64,697 | 267 / 267 | 30–33 / 30.4 | 38.5–41.6 / 22–33 | 0 / 0 |
| 400 | 86,084 / 86,158 | 355 / 357 | 50.7 / 50.7 | 71.6 / 184.9 | 0 / 0 |
| 450 | 98,659 / 99,604 | 431 / 423 | 94.9 / 61.6 | 1,727 / 855.5 | 2,931 / 692 |
| 500 | 84,397 / 80,054 | 501 / 500 | 158.0 / 84.4 | 8,866 / 10,057 | 61,202 / 75,532 |

kick/err는 전 레벨 0/0. 게이트 PASS는 100·200뿐(Linux 250부터 p99 FAIL).

### 2. spread (`PERF_SPAWN_SPREAD=256` → Town 64×64로 클램프)

**선행 연구의 256×256 무클램프 분산과 다른 시나리오다.** Town은 AOI 4×4셀(16타일 셀)이라 3×3 창이 존의 9/16 이상을 본다.
그래서 갱신/스냅샷은 stock의 약 1/3에 그친다(500 CCU에서 166 vs 500/501). monsterAi는 0.04–0.16 / 0.04–0.21 ms.

| CCU | tick p50 | tick p99 | Hz | late p99 | skip | snap | flush | CPU W (u/s) | CPU L (u/s) | RSS |
|---|---|---|---|---|---|---|---|---|---|---|
| 250 | 9.7 / 6.2 | 15.8 / 11.2 | 19.99 / 20.00 | 21.0 / 0.1 | 0 / 0 | 4.96 / 4.04 | 4.26 / 1.88 | 0.35 (0.22/0.13) | 0.51 (0.31/0.20) | 280 / 141 |
| 375 (L만) | — / 14.8 | — / 25.9 | — / 20.00 | — / 2.0 | — / 0 | — / 8.00 | — / 6.65 | — | 0.87 (0.52/0.35) | — / 144 |
| 500 (n=3) | 29.0 / 29.7 | 42.5 (41.1–43.6) / 44.2 (42.6–47.3) | 20.01 / 20.01 | 38.4 / 6.5 | 0 / 0 | 18.69 / 20.11 | 9.77 / 9.53 | 0.86 (0.59/0.26) | 1.44 (0.93/0.51) | 361 / 158 |
| 625 (L만) | — / 47.3 | — / 66.5 | — / 17.39 | — / 263.1 | — / 78 | — / 30.00 | — / 16.08 | — | 1.52 (1.00/0.52) | — / 188 |
| 750 | 58.3 / 64.3 | 90.4 / 111.9 | 14.07 / 12.66 | 267.8 / 266.3 | 176 / 221 | 41.78 / 44.16 | 16.50 / 18.93 | 1.27 (0.98/0.29) | 1.55 (1.07/0.48) | 472 / 239 |
| 1000 (n=3) | 86.4 / 112.9 | 108.0 (102.4–113.6) / 159.5 (150.4–175.5) | 10.25 / 7.30 | 266.6 / 281.2 | 278–301 / 377–390 | 59.23 / 75.59 | 24.17 / 34.08 | 1.32 (1.02/0.30) | 1.47 (1.04/0.43) | 568 / 316 |
| 1500 | 189.4 / 237.9 | 225.6 / 312.7 | 4.63 / 3.44 | 275.1 / 307.4 | 458 / 500 | 143.37 / 180.53 | 41.56 / 55.32 | 1.31 (1.02/0.29) | 1.39 (0.96/0.44) | 753 / 451 |

| CCU | tx B/s/CCU | 갱신/스냅샷 | RTT p99 | lagGrowth p99 | 입력 overflow |
|---|---|---|---|---|---|
| 250 | 22,387 / 22,496 | 81 / 82 | 16.3 / 6.3 | 43.3 / 9.8 | 0 / 0 |
| 375 | — / 33,836 | — / 125 | — / 18.3 | — / 18.1 | — / 0 |
| 500 | ≈45,360 / ≈45,320 | 166 / 166 | 42–53 / 36–42 | 51–61 / 21–52 | 0 / 0 |
| 625 | — / 57,037 | — / 239 | — / 69.3 | — / 3,906 | — / 10,005 |
| 750 | 55,759 / 50,012 | 287 / 290 | 224.9 / 111.0 | 8,874 / 10,932 | 93,664 / 129,464 |
| 1000 | ≈50,930 / ≈38,280 | 383 / 387 | 474–730 / 146–164 | 14,440–14,791 / 18,809–19,212 | 243k–262k / 350k–363k |
| 1500 | 29,436 / 27,171 | 580 / 585 | 2,559 / 307.8 | 22,928 / 24,811 | 664,300 / 725,682 |

kick/err는 1500까지 전 레벨 0/0. 게이트 PASS는 250뿐.

### 3. realistic (몬스터 밀집, `--monster-file`)

| CCU | tick p50 | tick p99 | Hz | late p99 | skip | snap | monsterAi | flush | CPU W (u/s) | CPU L (u/s) | RSS |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 100 | 4.8 / 3.7 | 8.4 / 5.4 | 19.99 / 20.00 | 20.0 / 0.1 | 0 / 0 | 2.04 / 2.10 | 0.44 / 0.38 | 1.73 / 0.68 | 0.21 (0.12/0.09) | 0.37 (0.19/0.17) | 272 / 125 |
| 250 (n=3) | 13.3 / 7.9 | 23.3 (21.9–25.3) / 14.3 (14.2–14.5) | 19.99 / 20.00 | 23.6 / 1.6 | 0 / 0 | 7.32 / 4.92 | 0.86 / 0.77 | 4.40 / 1.85 | 0.63 (0.37/0.26) | 0.67 (0.41/0.26) | 289 / 144 |
| 275 (L만) | — / 10.1 | — / 25.5 | — / 20.00 | — / 74.5 | — / 0 | — / 6.56 | — / 0.91 | — / 2.59 | — | 0.94 (0.56/0.39) | — / 145 |
| 300 | 18.8 / 11.0 | 31.0 / 30.0 | 19.51 / 19.67 | 299.9 / 281.5 | 15 / 10 | 11.24 / 7.80 | 1.08 / 0.99 | 5.88 / 2.80 | 0.86 (0.48/0.38) | 1.04 (0.61/0.43) | 296 / 150 |
| 350 | 24.6 / 22.9 | 38.6 / 76.9 | 16.69 / 14.97 | 425.0 / 626.4 | 103 / 155 | 15.32 / 18.11 | 1.18 / 1.27 | 7.15 / 4.25 | 1.06 (0.58/0.48) | 1.29 (0.76/0.53) | 321 / 171 |
| 400 | 26.5 / 30.4 | 46.3 / 67.2 | 12.93 / 13.80 | 543.8 / 454.7 | 216 / 190 | 16.60 / 23.45 | 1.34 / 1.46 | 8.13 / 5.39 | 1.11 (0.55/0.56) | 1.35 (0.80/0.54) | 343 / 181 |
| 500 (n=3) | 42.4 / 45.5 | 69.1 (65.1–71.8) / 96.2 (87.3–105.1) | 5.23 / 6.61 (6.08–7.50) | 838.2 / 963.4 | 421–520 / 375–413 | 28.47 / 38.57 | 1.10 / 1.07 | 11.61 / 5.46 | 1.09 (0.44/0.65) | 1.27 (0.67/0.60) | 389 / 223 |
| 1000 (n=3) | 용량 판단 불가 — 아래 붕괴 표 | | | | | | | | | | |
| 1500 | 생략(중단 규칙) | | | | | | | | | | |

| CCU | tx B/s/CCU | 갱신/스냅샷 | RTT p99 | lagGrowth p99 | 스킬 응답 p50/p99 | kills/min |
|---|---|---|---|---|---|---|
| 100 | 16,389 / 15,966 | 43 / 42 | 9.8 / 4.0 | 38 / 7.6 | 35.6/72.1 / 29.3/52.7 | 208 / 190 |
| 250 | ≈26,450 / ≈27,450 | 72 / 76 | 29–53 / 12–15 | 40–55 / 12–15 | 42–47/78–99 / 32–37/59–62 | 338–368 / 290–348 |
| 275 | — / 29,307 | — / 80 | — / 48.7 | — / 146 | — / 38.5/124.9 | — / 370 |
| 300 | 30,556 / 31,357 | 85 / 87 | 184.9 / 135.1 | 1,037 / 787 | 54.8/216.3 / 41.6/253.0 | 352 / 328 |
| 350 | 34,013 / 34,235 | 115 / 134 | 533.0 / 648.5 | 5,391 / 7,944 | 69.3/512.5 / 61.6/533.0 | 250 / 236 |
| 400 | 32,730 / 37,911 | 145 / 166 | 998.4 / 273.6 | 10,815 / 9,588 | 120/1,123 / 87.7/320.1 | 256 / 232 |
| 500 | ≈25,100 / ≈34,970 | 294 / 334 | 1,729–2,559 / 577–960 | 21,006–22,127 / 18,761–20,457 | ≈430/≈1,900 / 185–375/759–1,314 | 36–82 / 28–82 |

- kick/err는 500까지 0/0. 게이트 PASS는 100(양쪽)과 250(W 3회 중 2회, L 3회 모두).
- 엔티티 수: 100 → 661 / 668, 500 → ≈1,060 / ≈1,057.

**realistic 1000 붕괴(두 플랫폼 공통)** — hold 전 접속 단계에서 서버가 무너져 hold 수치는 생존자만 나타낸다.

| 항목 | Windows | Linux |
|---|---|---|
| 전원 접속 소요(명목 10초) | 61–65초 | 54–75초 |
| 핸드셰이크 p50 / p99 | 4.6–9.0초 / 48–52초 | 3.2–3.9초 / 45–64초 |
| hold 전 skip tick | ≈1,100–1,300 | 1,008–1,580 |
| hold 전 rate 드롭 / 입력 overflow | ≈340–400k / — | 308–409k / 226–359k |
| kick (런 1 / 2 / 3) | 810 / 934 / 787 (서버 `KICK` 5 송신은 런당 807–832) | 865 / 952 / 945 (전부 `KICK` 5) |
| 그 외 | 런 2: `KICK` 3(Idle) 144 + 핸드셰이크 실패 84 | 다른 사유·핸드셰이크 실패 없음 |
| hold 중 남은 연결 | 168 / 20 / 193 | 135 / 48 / 55 |

### 4. login-storm (전원 동시 접속 후 빈 입력)

| CCU | 접속 소요 | 핸드셰이크 p50/p99 | hold 전(부팅~폭주) | hold tick p50/p99 | Hz | snap | CPU (u/s) | RSS | RTT p99 |
|---|---|---|---|---|---|---|---|---|---|
| 500 | 3.1 / 3.4초 | 2,103/3,114 / 2,103/3,238 | 168 tick·9.8초·skip 28·dur p99 201.6 / 173 tick·10.1초·skip 27·dur p99 242.9 | 21.5/32.3 / 24.7/43.9 | 19.99 / 20.01 | 20.86 / 24.90 | 0.79 (0.68/0.11) / 1.55 (1.11/0.44) | 512 / 240 | 32.9 / 40.0 |
| 1000 | 5.7–7.8 / 7.9초 | 5,392/7,674 / 3,502/7,379 | ≈135 tick·14.9초·skip 164·dur p99 395.6 / 121 tick·14.6초·skip 167·dur p99 679.7 | 70.8/100.1 / 74.1/108.7 | 12.17 / 10.64 | 70.78 / 73.80 | 1.28 (1.14/0.14) / 1.48 (1.22/0.26) | 545 / 460 | 512.5 / 111.0 |

ready는 500/500·1000/1000, kick 0(양쪽). 유휴 봇은 스냅샷을 받지 않아(tx ≈64–65 B/s/CCU) lagGrowth 0은 의미가 없다.

### 5. Windows vs Linux

**송신 비용(µs/소켓/tick = flushMs ÷ 연결 수)**

| 시나리오 | Windows (CCU: µs) | Linux (CCU: µs) |
|---|---|---|
| stock | 100: 16.1 · 200: 16.4 · 300: 17.9 · 400: 18.6 · 450: 19.0 · 500: 18.8 | 100–250: 6.8–6.9 · 300: 17.4 · 400: 16.4 · 450: 17.2 · 500: 16.6 |
| spread | 250: 17.1 · 500: 19.5 · 750: 22.0 · 1000: 24.2 · 1500: 27.7 | 250: 7.5 · 375: 17.7 · 500: 19.1 · 625: 25.7 · 750: 25.2 · 1000: 34.1 · 1500: 36.9 |
| realistic | 100: 17.3 · 250: 17.6 · 300: 19.6 · 350: 20.4 · 400: 20.3 · 500: 23.2 | 100: 6.8 · 250: 7.4 · 300: 9.3 · 350: 12.1 · 400: 13.5 · 500: 10.9 |

- **Linux는 경부하에서만 싸다.** 샤드 1개·≤250 CCU에서 6.8–7.5 µs로 Windows(16–17)의 약 1/2.3.
  stock·spread 300 이상(샤드 2개+·소켓당 페이로드 증가와 겹침)부터 16–19 µs로 같아지고, spread 625–1500은 25–37로 Windows(22–28)보다 비싸다.
- 루프백 주의(알려진 커널 동작, 미측정): Linux 루프백은 수신 측 TCP 처리·wakeup이 송신 syscall 안에서 돈다.
  flush에 수신 비용 일부가 섞이므로 실제 NIC의 송신 비용과 같지 않다 — 선행 연구의 미결 질문은 **루프백 한정**으로만 답했다.
- 과부하에서도 `dispatchSnapshots`가 flush보다 크다(Windows stock 500·spread 1000/1500에서 2–5배).

**서버 CPU**

- Linux 서버는 같은 레벨에서 대체로 Windows의 1.2–2배 CPU를 쓴다. 늘어난 몫은 거의 전부 JavaScriptCore GC 보조 스레드(HeapHelper, 0.05–0.6코어,
  sys 비중 높음 — 예: stock 300 0.36u/0.22s, login-storm 500 0.51u/0.28s)다.
- 메인 JS 스레드는 두 플랫폼 모두 ≈1코어에서 포화(Linux 과부하 0.96–0.98: spread 1000 0.68u/0.30s, stock 500 0.77u/0.19s, realistic 500 0.48u/**0.50s**).
- sys 비중: Linux 29–51%, Windows 20–60%.
- Linux `/proc`(초당 샘플)과 `/admin/perf` `process.cpuUsage`는 레벨마다 0.01코어 이내로 일치(예외 realistic-1000-r2: 0.42 vs 0.33).
  Windows는 스레드별 분해를 샘플링하지 않았다.

**요약**

- ≤≈250 CCU: Linux가 전반적으로 낫다 — tick p50 ≈0.6배, snap 0.65–0.8배, late ≈0(Windows는 ≈20 ms 타이머 바닥),
  lagGrowth 6–15 vs 35–55, RTT p99 4–15 vs 7–39, RSS 절반(유휴 92 vs 235 MB).
- 과부하: stock·spread는 Linux가 더 나쁘다 — snap 최대 28% 느림(spread 1000 75.6 vs 59.2, 1500 180.5 vs 143.4), Hz 7.30 vs 10.25(spread 1000)·3.44 vs 4.63(1500).
- Linux stock 200→250에서 비용 계단: snap 4.65 → 13.12 ms(CCU 1.25배에 2.8배), 같은 구간 GC 보조 CPU 0.19 → 0.51코어.
  가설(프로파일 없음): Linux 힙이 절반이라 GC가 더 자주 돌고 동시 마킹이 메인 스레드를 늦춘다.
- realistic: Linux가 500에서 Hz는 약간 낫고(6.6 vs 5.2) p99는 나쁘다(96 vs 69), 350 p99는 훨씬 나쁘다(76.9 vs 38.6).

### 6. 1단계 검증 — 정지 주입 (realistic 300 CCU, hold 60초)

hold 20.4초 / 20.0초 지점에 `GET /admin/perf?stall=7000` → 7.00초 후 HTTP 200.

| 메트릭 | Windows (직전 → 직후 → 15초 후) | Linux (직전 → 0.5초 후 → 15초 후) |
|---|---|---|
| `mmorpg_tick_stall_ms` count / sum | 5 → **6** / 308 → 7,277 ms (+6,969) | 7 → **8** → 8 / 482.5 → 7,900.9 ms (+7,418) |
| `mmorpg_tick_skipped_total` | 12 → **181 (+169)** → 182 | 28 → **172 (+144)** → 189 (누적 +161) |
| `mmorpg_net_rate_kick_total` | **0**(메트릭 미출현) | **0**(메트릭 미출현) |
| `mmorpg_net_rate_dropped_total` (`rate_violation`) | 0 → 19,586 → 19,586 (rate_reserve 337) | 0 → 5,666 → 18,771 (rate_reserve 108 → 295) |
| `mmorpg_input_queue_overflow_total` | 0 → 21,930 → 21,930 | 0 → 6,476 → 21,214 |
| `mmorpg_world_connections` | 300 유지 | 300 유지 |
| 실행 tick(15초 회복 창) | 640 → 647 → 954 (≈20.3 Hz) | 579 → 581 → 869 (≈19.2 Hz) |
| 정지 tick 지연 → late < 150 ms 복귀 | 7,002 ms → 12 tick | 7,441 ms → 8 tick(≈0까지 15–20 tick) |
| 정지 100 tick 후~끝 late p99 / dur p99 | 21.7 / 21.1 | 3.9(max 7) / 20.5 |
| 60초 창 전체 | Hz 17.12, skip 173, tick p99 28.95 | Hz 17.07, skip 176, tick p99 32.6 |

- **loadgen 300/300 연결 유지, kick 0·err 0·조기 종료 0(양쪽).** 게이트 FAIL은 rate 드롭과 tick p99 탓뿐이다.
  lagGrowth p99 8,887 / 8,977 ms, RTT p99 7,095 / 7,095 ms는 정지 자체에서 온다.
- skip 기대치(≈135 / ≈140)보다 많은 몫은 정지 직후 버퍼된 패킷 버스트(드롭·overflow)를 처리하는 캐치업에서 생겼다.
  Linux는 드롭·overflow 대부분이 "0.5초 후" 이후에 집계됐다(이후 이벤트 루프 턴에 걸쳐 처리). Windows는 직후에 이미 전부 집계.
- realistic 300은 주입 전부터 한계 근처였다: Windows hold 중 자연 정지 4회(late 최대 286 ms), Linux 부팅 후 자연 정지 7회·hold 중 >100 ms 지연 46 tick(최대 383 ms).

### 7. 1단계 검증 — 자동저장 (파일 DB, `AUTOSAVE_INTERVAL_SEC=10`, `LOG_LEVEL=info`, hold 40초)

Linux DB는 WSL ext4(`~/perf-2c/autosave*/`)에 두고 끝난 뒤 scratch로 복사했다(`/mnt/c`면 9P 브리지를 재게 된다).
`durationMs`는 벽시계 시간으로, 200명 배치 사이 `setImmediate` 양보(그동안 소켓 읽기 처리)를 포함한다.

| 항목 | Windows | Linux |
|---|---|---|
| **250 (정상 부하)** — Hz / tick p99 / 게이트 | 20.00 / 22.7 / PASS | 20.00 / 15.5 / PASS |
| 패스당 250명 소요 | **3–5 ms** | **12–17 ms** |
| late: 패스 근처 max vs 그 외 | 18 vs p99 23.9·max 38.9 | 4 vs p99 2.4·max 4.6 |
| **500 (과부하)** — Hz / tick p99 / skip | 5.00 / 64.3 / 614 | 5.34 / 103.9 / 591 |
| 패스(명수/ms) | 347/10(접속 중), 500/131, 500/292, **500/646**, 500/223, 500/151 | 462/515(접속 중, hold 전), 500/127, 500/377, 500/355, 500/129 |
| late: 패스 근처 vs 그 외 | p50 426·max **1,057**(646 ms 패스와 일치) vs p50 308·p99 644·max 725 | p50 433·max 821 vs p50 280·p99 905·max 1,068(최악은 패스 밖) |
| tick dur p50: 패스 근처 vs 그 외 | 47.6 vs 47.4(변화 없음 — tick 밖에서 돌아 late로만 보인다) | 60.6 vs 48.1(377 ms 패스 끝에 102–127 ms tick 연속, flush 17–38) |

정상 부하에서는 자동저장이 tick 지연에 **영향이 없다**(두 플랫폼). 과부하 500의 패스 시간은 서버 포화로 늘어난 벽시계 값이라 저장 비용 자체로 읽으면 안 된다.

### 8. 선행 연구(I2, `final.md` §2.2) 대비

**한 지점 밀집(선행) vs stock(2-C Windows)** — 같은 PC, Windows:

| CCU | tick p50/p99 선행 → 2-C | Hz 선행 → 2-C | snap/flush 선행 → 2-C | CPU 선행 → 2-C | RSS 선행 → 2-C |
|---|---|---|---|---|---|
| 100 | 4.1/7.8 → 4.2/7.4 | 20 → 20.00 | 2.1/1.6 → 2.20/1.61 | 0.17 (0.11/0.06) → 0.16 (0.11/0.06) | 270 → 262 |
| 200 | 9.9/17.2 → 10.8/17.4 | 20 → 19.99 | 6.2/3.3 → 7.12/3.29 | 0.36 → 0.37 | 293 → 284 |
| 300 | 18.8/32.6 → 22.8/33.8 | 20 → 20.00 | 13.5/5.4 → 16.70/5.36 | 0.63 (0.48/0.15) → 0.70 (0.54/0.16) | 381 → 372 |
| 400 | 29.0/45.2 → 29.1/44.3 | 20.4 → 20.13 | 21.2/7.4 → 21.45/7.45 | 0.90 (0.68/0.23) → 0.92 (0.70/0.22) | 418 → 406 |
| 450 | 34.5/55.6 → 36.4/56.9 | 20.5 → 19.01 | 26.4/8.5 → 28.99/8.53 | 1.10 (0.84/0.26) → 1.12 (0.88/0.24) | 449 → 457 |
| 500 | 41.4/68.3 → 59.9/72.7 | 18.45 → 14.07 | 31.6/9.8 → 48.97/9.41 | 1.23 (0.95/0.28) → 1.15 (0.95/0.20) | 470 → 480 |

| 항목 | 선행 연구 | 2-C (1단계 후) |
|---|---|---|
| 밀집 임계(p99 > 25 / > 50 / 포화) | ≈235 / ≈420 / 450–500 | stock ≈250 / ≈420 / Hz < 20은 450 (W). L ≈250 / ≈390 / 450 |
| 분산 임계(p99 > 25) | ≈670 (256×256 무클램프, 500 CCU 가시 엔티티 14.5) | **비교 불가** — 2-C spread는 Town 클램프(500 CCU 갱신/스냅샷 166). 무클램프 분산은 재측정하지 않음(공백) |
| send 1회 비용 | 16–19 µs (Windows, 분산 1,250) | W 16–28 µs, L 루프백 6.8–7.5(≤250) / 16–37(그 이상) |
| 정지 후 kick | 수 초 정지 후 1,000명 중 771명 kick | 7초 정지·300 CCU에서 **kick 0**(W·L). 단 CCU가 달라 1:1 비교 아님 |
| 지속 과부하 | partial write로 세션 종료 | spread 1500·stock 500에서도 kick/err 0, hold 중 txPartial 0(W·L). 단 realistic 1000 접속 폭주에서는 `KICK` 5(rate) ≈800–950/런 |
| 자동저장 | 캐릭터당 0.87–1.1 ms 동기 → 500명 435–561 ms 정지(≈10 tick skip) | 정상 250명 패스 3–5 ms(W) / 12–17 ms(L), late 스파이크 없음 |
| 연결 상한 | `MAX_CONNECTIONS = 512` 하드코딩(scratch에서 해제) | env 주입(`8ee8433`) — loadgen이 레벨별로 올려 1000·1500을 코드 수정 없이 측정 |

- 400 CCU까지 stock p99는 선행 수치와 ±1.2 ms 안이고 flush·CPU·RSS도 거의 같다(300의 p50·snap만 18.8 → 22.8, 13.5 → 16.70으로 다소 높다)
  — **1단계 전후로 정상 부하 tick 비용에 큰 변화는 없다.**
- 500에서 2-C가 Hz 14.07 vs 18.45로 더 낮다. 캐치업 상한(`ac6f59e`)이 밀린 tick을 몰아 돌리지 않고 skip하기 때문일 가능성이 있다(미검증 가설).
- 이 문서 위쪽 100 CCU 기준선(Phase D-1, p50 2.99 / p99 9.70)은 다른 하네스(`run.ts`)라 직접 비교하지 않는다. 2-C stock 100은 4.2/7.4 / 3.4/6.1.

### 이상·주의

1. **realistic은 tick 밖 작업이 한계이고, 상당 부분이 sys CPU다.** Windows 500: tick ≈42 ms × 5.2 Hz ≈ 0.22초/초(보고 계산)인데 메인 스레드는
   나머지 ≈0.75초/초를 다른 일에 쓴다. sys 0.65 > user 0.44(250은 0.26 vs 0.37). Linux 500도 메인 스레드 0.48u/0.50s ≈1코어인데 tick은 ≈0.30초/초.
   stock·spread는 반대로 tick 자체가 50 ms를 넘어 무너지고 sys는 20–25%(W)다.
   - 가설(프로파일 없음): `moveToHandler`가 tick 밖에서 A*를 돌고 AOI 시청자마다 `sessionManager.sendTo`로 `MOVE_PATH`를 보낸다 —
     tick 코얼레싱 밖에서 시청자당 인코딩 1회·소켓 write 1회.
   - 근거: `MOVE_PATH` 송신이 요청보다 훨씬 빨리 는다. 250 / 400 / 500 CCU에서 W 8.4k / 27.1k / 35.7k/s, L 8.3–8.6k / 25.5k / 37.6–43.1k/s인데
     `MOVE_TO` 요청은 W 75 / 132 / 137/s, L 74–79 / 121 / 136–140/s. W 500에서 `ENTITY_SPAWN`/`DESPAWN`도 ≈8k·7k/s(존 전환과 함께 증가).
2. **`dispatchSnapshots`는 보낼 게 없어도 비싸다.** login-storm(전원 유휴·한 셀, 스냅샷 출력 0)에서 500: 20.86 / 24.90, 1000: 70.78 / 73.80 ms
   — 실제로 보내는 stock 500(48.97 / 55.22)과 비교하면 비용 대부분이 송신이 아니라 군집 크기의 제곱으로 느는 AOI/델타 평가다.
3. **지속 과부하에서는 rate kick이 난다**(realistic 1000 접속 중 `KICK` 5 ≈800–950/런, 두 플랫폼). 단발 7초 정지는 kick 0이다.
4. **Windows 타이머 바닥**: 경부하에서도 late p99 ≈20–23 ms, lagGrowth ≈35–41 ms(Linux ≈0 / 6–15). 플랫폼 비교 시 감안.
5. **과부하 레벨의 tx/CCU 감소**(stock 500, spread 1000/1500): tick이 줄어 스냅샷이 줄기 때문. 같은 이유로 갱신/스냅샷은 는다.
6. **용량 근처 재현성**: realistic 250 Windows는 3회 중 1회만 25.3으로 FAIL. 임계 CCU는 ±수십 CCU 오차로 읽는다.
7. **WSL2 ≠ 베어메탈 Linux**: 같은 호스트의 VM이고 Windows 호스트 배경 부하(≈1.3–2.4코어)를 공유한다. 실제 NIC도 측정하지 않았다.
8. Linux 서버 로그의 error 레벨은 "tick p99 over budget"(13회)뿐. "partial socket write" 경고는 hold 창 밖에서만 났다(hold 중 txPartial 0, Windows도 같음).
9. **공백**: 무클램프 분산(선행 ≈670과의 직접 비교), realistic 1500, realistic 1000 용량, 실제 NIC, CPU 프로파일(이상 1·과부하 GC 가설 미검증),
   Windows 스레드별 CPU, Windows realistic 1000의 입력 overflow.

### 원자료

측정 PC의 로컬 scratch(레포 밖, 세션 임시 경로 — 보존이 필요하면 따로 옮길 것):
`<측정 PC 임시 폴더>/`

| 경로 (위 기준) | 내용 |
|---|---|
| `baseline-2c/windows/` | 시나리오 폴더(`level-*.json`·`raw-*.json`·`summary.md/.json`·`orchestrate.log`·서버/샤드 로그): `stock-r3/`·`stock-r1/`·`stock-refine/`, `spread-r3/`·`spread-r1/`, `realistic-r1a/`·`realistic-r3/`·`realistic-refine/`, `login-storm/`, `stall/`(`metrics-{pre,post,post15}-stall.txt`·`perf-stall-response.json`·`stall-inject.log`), `autosave/`·`autosave-250/`(DB 포함). `*.console.log`, 집계 `agg-{stock,spread,realistic,autosave}.md`, `monsters.perf.json` |
| `baseline-2c/linux/` (원본 WSL `~/perf-2c`) | 위와 같은 구성 + `extra-{stock,spread,realistic}/`, `smoke/`, `realistic-r3/realistic-1000-collapse.txt`, `login-storm/prehold-analysis.txt`, `stall/stall-ring-analysis.txt`, `autosave*/autosave-ring-analysis.txt`. 집계 `agg-{stock,spread,realistic,other,fanout}.md`·`compare-windows-linux.md`, CPU 샘플 `proc-samples.jsonl`·`proc-threads.txt`, 보조 스크립트(`orch.sh`·`procsampler.py`·`compare2c.ts`·`fanout.ts` 등) |
| `agg2c.ts`·`autosaveRing.ts`·`stall-inject.sh` | 집계·자동저장 정렬·정지 주입 보조 스크립트 |
| `final.md` | 선행 연구 보고(§2.2 부하 테스트 = I2) |

## 성능 3단계 — 마이크로벤치 기준(최적화 전, 2026-10-06)

3단계(Bun 최적화: 동작·와이어 바이트 보존) 슬라이스의 전후 비교 기준. 두 도구를 함께 쓴다.

- **정확성**: `tests/regression/wireCharacterization.test.ts` — 실물 배선(ingestChunk→라우터→핸들러, `runServerTick`,
  `releaseClosedSession`) 결정론 시나리오 1,300 tick의 세션별 송신 바이트 SHA-256 + tick별 상태 해시 골든. 슬라이스마다 불변이어야 한다.
- **속도**: `tools/perf/zoneBench.ts`([`tools/perf/README.md`](../tools/perf/README.md)) — 존 tick 단계(`TickProfiler`), A*(실물 내비
  2,000쌍), MOVE_TO 팬아웃(off-tick 수신 경로). 아래는 `--mode matrix`(200 tick + 예열 40, 설정마다 별도 프로세스), i7-8700K Windows,
  bun 1.3.13, 커밋 c80a2bc.

| 배치 | 플레이어 | 몬스터 | tick mean / p99 ms | runMonsterAi | runSystems | dispatchSnapshots | flush | 송신 KB/tick | 힙 증가 KB/tick | 가시 수 |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| dense | 200 | 0 | 4.56 / 8.89 | 0.01 | 0.07 | 4.18 | 0.12 | 419 | 1,674 | 200 |
| dense | 200 | 2000 | 9.15 / 16.67 | 3.25 | 0.77 | 4.65 | 0.17 | 436 | 1,698 | 213 |
| dense | 500 | 600 | 35.37 / 56.47 | 2.63 | 0.43 | 31.19 | 0.60 | 2,642 | 18,762 | 516 |
| dense | 1000 | 0 | 101.42 / 204.71 | 0.06 | 0.37 | 99.56 | 0.74 | 10,405 | 40,084 | 1,000 |
| dense | 1000 | 2000 | 140.44 / 219.88 | 18.86 | 1.07 | 117.69 | 1.63 | 10,485 | 39,561 | 1,014 |
| spread | 200 | 600 | 2.63 / 7.26 | 0.53 | 0.36 | 1.21 | 0.16 | 48 | 245 | 21.4 |
| spread | 500 | 2000 | 13.92 / 26.47 | 5.51 | 1.71 | 4.64 | 0.53 | 112 | 864 | 21.2 |
| spread | 1000 | 0 | 10.92 / 22.10 | 0.05 | 0.61 | 8.56 | 0.91 | 224 | 1,601 | 17.1 |
| spread | 1000 | 2000 | 16.14 / 29.28 | 4.25 | 1.48 | 7.81 | 0.87 | 313 | 2,228 | 25.3 |

(단계 열은 tick당 평균 ms. 18개 설정 전체는 원자료 `scratchpad/stage3/bench-before.json`.)

- A*: zone 1 `findPath` 평균 56.6 µs·p99 495 µs(2,000쌍 127 ms), zone 2 평균 52.9 µs·p99 154 µs. 경로 checksum
  `a6eb3ffc6b55edba` / `f22f51d3f39cd37b` — 힙 구현 후에도 같아야 한다.
- MOVE_TO 팬아웃: 시야 K=10 / 50 / 200에서 MOVE_TO 1건당 127 / 146 / 390 µs, write K+1회(시청자마다 인코딩 1회 + 즉시 write 1회).
- 해석: dense는 `dispatchSnapshots`(AOI 차분 + 시청자별 인코딩)가 tick의 90% 이상, spread 2000마리는 `runMonsterAi`(O(N·M))가 최대 단일 단계.
  dense 1000명은 의도적 과부하(N² 가시)라 상대 비교용이다.

### 슬라이스별 전후

같은 머신(i7-8700K Windows, bun 1.3.13)·같은 세션에서 전/후를 각 3회 연달아 돌린 중앙값. 특성화 골든은 슬라이스마다 불변.

| 슬라이스 | 지표 | 전 | 후 |
|---|---|---:|---:|
| 1. A* 이진 힙 + epoch scratch | zone 1 `findPath` 평균 / p99 / max µs | 56.7 / 579 / 5,258 | 15.5 / 100 / 312 |
| | zone 2 `findPath` 평균 / p99 µs | 41.9 / 118 | 20.9 / 47 |
| | MOVE_TO 1건 µs (K=10 / 50 / 200) | 121 / 130 / 340 | 61 / 108 / 316 |
| 2. `viewersOf` O(K) + 처치 역인덱스 | `runCombat` tick당 평균 / p99 ms (spread 1000명·2000마리) | 1.32 / 5.44 | 0.79 / 2.11 |
| | `runCombat` 평균 ms (spread 1000·600 / 500·2000) | 0.69 / 0.73 | 0.52 / 0.58 |
| | `viewersOf` 1회 µs (spread 1000·2000 / dense 500·600) | 22.4 / 47.3 | 3.1 / 18.6 |
| | 처치 정리 1회 µs (targets 1,000 / 3,000개) | 164 / 511 | 1.4 / 2.8 |
| 3. 그리드 기반 어그로(플레이어 버킷) | `runMonsterAi` tick당 평균 / p99 ms (spread 2000명·4000마리) | 16.80 / 27.08 | 1.33 / 2.82 |
| | `runMonsterAi` 평균 ms (spread 1000·4000 / 1000·2000 / 2000·2000) | 17.27 / 4.11 / 2.84 | 1.18 / 0.84 / 0.89 |
| | `runMonsterAi` 평균 ms (dense 1000·2000 / 500·2000) | 18.56 / 8.82 | 0.28 / 0.36 |
| | tick 평균 ms (spread 2000·4000 / 1000·4000) | 38.98 / 29.45 | 23.49 / 12.86 |
| | 어그로 질의 tick 1회분 ms, 전원 idle (1000명·2000마리 / 2000·4000) | 22.3 / 86.2 | 0.20 / 0.36 |
| 4. tick당 할당 제거 | tick당 할당 MB (spread 1000·2000 / 2000·4000 / 200·600) | 12.2 / 26.4 / 2.35 | 11.5 / 24.1 / 2.15 |
| | tick당 할당 MB (dense 200·2000 / 500·600) | 10.1 / 73.6 | 9.6 / 73.0 |
| | eden GC / 1,000 tick (spread 1000·2000 / 2000·4000 / 200·600) | 243 / 262 / 95 | 223 / 229 / 82 |
| | `runSystems` 평균 ms (spread 2000·4000 / 500·2000 / 1000·600, dense 200·2000) | 3.18 / 1.18 / 0.78 / 0.73 | 2.56 / 0.95 / 0.66 / 0.60 |
| | `applyInputs` 평균 ms (spread 2000·4000 / 1000·2000 / 500·2000) | 0.65 / 0.39 / 0.23 | 0.56 / 0.28 / 0.15 |
| 5. 팬아웃 1회 인코딩 + 재사용 outbox + 메트릭 핸들 | MOVE_TO 1건 µs (K=10 / 50 / 200) | 58 / 108 / 306 | 39 / 32 / 42 |
| | `flush` 평균 ms (spread 2000·4000 / 1000·2000 / 500·2000, dense 500·600) | 1.54 / 0.74 / 0.35 / 0.56 | 0.53 / 0.25 / 0.11 / 0.13 |
| | `dispatchSnapshots` 평균 ms (spread 2000·4000 / 1000·2000, dense 1000·0 / 500·600 / 200·2000) | 13.40 / 6.43 / 92.9 / 27.6 / 4.45 | 10.95 / 5.05 / 84.3 / 25.1 / 3.72 |
| | `runCombat` 평균 ms (spread 2000·4000 / 1000·2000, dense 500·600) | 1.38 / 0.69 / 0.14 | 1.11 / 0.51 / 0.04 |
| | tick 평균 ms (spread 2000·4000 / 1000·2000 / 500·2000 / 200·600, dense 1000·0 / 500·600) | 20.6 / 10.1 / 5.14 / 1.82 / 94.5 / 29.1 | 16.8 / 7.89 / 4.31 / 1.46 / 85.3 / 25.9 |
| | tick당 할당 MB (spread 1000·2000 / 2000·4000 / 200·600, dense 200·2000 / 500·600) | 11.8 / 24.6 / 2.19 / 9.79 / 74.7 | 9.29 / 19.4 / 1.75 / 7.75 / 63.6 |
| | GC 정지 ms / 1,000 tick (spread 1000·2000 / 2000·4000, dense 500·600) | 1,635 / 2,289 / 6,286 | 888 / 1,052 / 3,649 |
| 6. tick 밖 송신 코얼레싱(계획 7항) | MOVE_TO 1건 write 수 (K=10 / 50 / 200, bytes·packets 동일) | 11 / 51 / 201 | 1 / 1 / 1 |
| | MOVE_TO 1건 µs (K=10 / 50 / 200, 인프로세스 — syscall 없는 대역 소켓) | 39.6 / 32.5 / 42.3 | 40.4 / 35.8 / 49.2 |
| | realistic 300 CCU: 서버 write/s · packets/write | 21,182 · 2.04 | 15,504 · 2.78 |
| | realistic 300 CCU: 서버 CPU 코어 합 (user / system) | 0.61 (0.26 / 0.35) | 0.51 (0.25 / 0.26) |
| | realistic 300 CCU: MOVE_TO→PATH p50 / p99 ms · PING RTT p99 ms | 8.3 / 84.4 · 57.0 | 5.6 / 23.1 · 22.2 |
| | realistic 500 CCU: 서버 write/s · packets/write | 48,176 · 1.66 | 28,033 · 3.29 |
| | realistic 500 CCU: 서버 CPU 코어 합 (user / system) | 1.10 (0.39 / 0.71) | 0.99 (0.51 / 0.48) |
| | realistic 500 CCU: tick Hz · 클라 lag p99 ms · MOVE_TO→PATH p99 ms | 13.5 · 6,560 · 853 | 20.0 · 41 · 67 |
| 7. AOI·스냅샷 DoD(계획 6항) | `dispatchSnapshots` 평균 ms (dense 1000·0 / 1000·2000 / 500·600 / 200·2000) | 85.8 / 94.6 / 25.0 / 3.71 | 5.15 / 5.92 / 1.56 / 0.28 |
| | `dispatchSnapshots` 평균 ms (spread 2000·4000 / 1000·2000 / 1000·0 / 500·600 / 200·600) | 10.94 / 5.12 / 3.59 / 2.60 / 0.81 | 3.51 / 1.45 / 1.04 / 0.71 / 0.26 |
| | `dispatchSnapshots` p99 ms (dense 1000·2000 / 500·600, spread 2000·4000 / 1000·2000) | 107.7 / 33.6 / 19.6 / 10.2 | 13.4 / 3.44 / 8.37 / 2.50 |
| | tick 평균 ms (dense 1000·0 / 1000·2000 / 500·600 / 200·2000) | 86.7 / 96.4 / 26.0 / 4.57 | 6.16 / 7.61 / 2.33 / 1.03 |
| | tick 평균 ms (spread 2000·4000 / 1000·2000 / 1000·0 / 500·600 / 200·600) | 16.7 / 7.89 / 4.38 / 3.67 / 1.44 | 9.20 / 4.13 / 1.84 / 1.79 / 0.93 |
| | tick당 할당 MB (dense 500·600 / 200·2000, spread 1000·2000 / 200·600) | 62.0 / 7.58 / 9.05 / 1.70 | 6.92 / 1.21 / 1.89 / 0.48 |
| | eden GC · GC 정지 ms / 1,000 tick (dense 500·600 / spread 1000·2000) | 597 · 3,229 / 143 · 668 | 149 · 363 / 26 · 252 |
| 8. 과부하 인지 rate 킥·접속 제한(계획 8항 — 의도된 동작 변경) | MOVE_TO 1건 µs (K=10 / 50 / 200, bytes·packets·writes 동일) | 40.8 / 35.9 / 51.8 | 40.7 / 35.5 / 51.4 |
| | tick 평균 ms (spread 1000·2000 / dense 500·600, 송신 동일) | 4.35 / 2.25 | 4.33 / 2.27 |
| | realistic 300 + 25초 정지 주입: KICK 5 / 정지 후 연결 | 300 / 0 | 0 / 300 |
| | realistic 300 + 7초 정지 주입: KICK / `mmorpg_overload_active` 1 유지 | 0 / — | 0 / 약 5초 |
| | realistic 1000: 수용 · Hz · tick p99 ms · kick | 1000 · 20.08 · 38.65 · 0 | 1000 · 20.02 · 38.77 · 0 |
| | realistic 2000(100명/초 램프): 수용 · KICK 9 · Hz · tick p99 ms · 클라 lag p99 ms | 2000 · 0 · 6.87 · 114.9 · 13,199 | 1,215 · 785 · 15.86 · 52.1 · 4,220 |

- 슬라이스 1: 경로 checksum `a6eb3ffc6b55edba` / `f22f51d3f39cd37b` 그대로, MOVE_TO 송신 bytes·writes·packets 동일,
  `tools/nav/exportGolden.ts` 재생성 diff 0(C# 무변경).
- 슬라이스 2: 첫 연달아 측정이 배경 부하(게임 클라이언트가 CPU 약 40%)로 오염돼, 전(HEAD 사본)·후(작업 트리)를 설정마다 번갈아
  3회 돌린 중앙값으로 다시 쟀다. `viewersOf`·처치 정리 행은 두 구현을 한 프로세스에서 번갈아 잰 마이크로벤치(9회 중앙값).
  송신 bytes·packets·writes는 모든 설정에서 같다. dense 설정과 MOVE_TO는 변화가 없다 — dense 벤치는 전투가 거의 없고, moveto 벤치는
  존 인원이 K+1명뿐이라 원래부터 연결 전원 스캔 = 창 크기였다. tick 전체 비중은 작다. 이 슬라이스의 목적은 인원 수(이벤트마다
  O(P))와 타겟 수(처치마다 O(T))에 비례하던 비용을 없애는 것이다.
- 슬라이스 3: 전(HEAD 사본)·후(작업 트리)를 설정마다 번갈아 3회 돌린 중앙값. 송신 bytes·packets·writes는 모든 설정에서 같다.
  마지막 행은 두 구현(원본 선형 스캔 / 버킷 인덱스, 재구축 포함)을 한 프로세스에서 번갈아 잰 마이크로벤치다. 모든 몬스터가 어그로를
  묻는 최악 경우이고 9회 중앙값이며, 재구축은 2000명 기준 52 µs다. 질의 비용은 사라졌다. 남은 `runMonsterAi`는 추격·복귀 몬스터의
  상태기계(Map 조회와 tick마다 MoveGoal 할당)다. 계측 실행에서 spread 2000·2000은 tick당 질의가 127회뿐이고 추격 1,359·leash
  복귀 350마리였다. 2000·4000은 질의 881회·추격 2,373·복귀 580마리였다. 그래서 몬스터 2000마리 spread 설정은 3–5배에 그친다
  (원래도 스캔 비중이 작았다). 2000·4000을 1 ms 미만으로 낮추는 3단계 목표의 남은 몫은 슬라이스 4(할당 제거)에서 다룬다.
- 슬라이스 4: 할당 행은 JSC GC 로그(`BUN_JSC_logGC=1`)로 잰 값이다. 할당이 트리거한 GC마다 찍히는 "이번 사이클 할당 바이트"를
  합산하고, tick 수만 다른 두 실행(200 / 1,200 tick, 예열 40)의 차를 1,000으로 나눴다(오차는 GC 1회 예산 약 32–70 MB / 1,000 tick).
  방법은 [`tools/perf/README.md`](../tools/perf/README.md)에 있다. 벤치 출력의 `heap.growthBytesPerTick`은 GC가 줄면 오히려
  커진다(tick 중 GC가 회수한 tick이 합산에서 빠지는 하한이라서). 그래서 이 슬라이스 판정에는 쓰지 않는다. 단계 시간 행은
  전(HEAD 사본)·후(작업 트리)를 설정마다 번갈아 5회 돌린 중앙값이고, 송신 bytes·packets·writes는 모든 설정에서 같다.
  측정 중 배경 부하(게임 클라이언트)가 있어 tick 평균은 잡음 범위다. 줄어든 할당은 tick당 약 0.2–2.3 MB(인원·몬스터 수에 비례)이고, 계산상
  제거 대상(위치 복사 Map·moved Set·입력 Map 2개·MoveGoal·공격당 스탯 복사·rng 클로저)과 맞는다. 남은 할당 대부분은 이 슬라이스
  범위 밖이다. 시청자마다 하는 인코딩(`writePacket` 문자열·Buffer), AOI 차분(`InterestSet.recompute`의 창 Set과 배열 3개),
  페이로드 객체가 그것이고, 슬라이스 5·6이 다룬다. `runMonsterAi`는 이 슬라이스 후에도 spread 2000·4000에서 약 1.5 ms다(5회
  중앙값, 전 1.42 / 후 1.53으로 잡음 범위). 남은 비용은 할당이 아니라 몬스터 4,000마리 상태기계의 Map 조회(몬스터당 약 7회)다.
  1 ms 미만 목표는 아직 달성하지 못했다.
- 슬라이스 5: 단계 시간·MOVE_TO 행은 전(HEAD 5c32170 사본)·후(작업 트리)를 설정마다 번갈아 5회(dense 1000·0은 3회) 돌린 중앙값이고,
  송신 bytes·packets·writes는 모든 설정에서 같다. 할당·GC 행은 슬라이스 4와 같은 JSC GC 로그 방식(200 / 1,200 tick 차, GC 정지는
  로그의 `p=` 합)이다. 이 슬라이스 표의 "전" 열은 같은 세션에서 다시 잰 값이라 슬라이스 4 "후" 열과 조금 다르다(배경 부하).
  MOVE_TO는 시청자마다 하던 인코딩(JSON 문자열·Buffer 2개)이 1회로 줄어 K에 거의 무관해졌다(K=50이 K=10보다 작은 것은 배치가
  클수록 `setImmediate` 1턴 비용이 더 많은 이동에 나눠지기 때문). `flush`는 프레임 객체·`Buffer.concat` 없이 outbox 뷰 1개를
  넘기므로 약 3–4배 줄었다. `dispatchSnapshots`는 SNAPSHOT_DELTA를 outbox에 바로 쓰고(본문·프레임 Buffer 할당과 복사 없음)
  SPAWN/DESPAWN을 엔티티당 1회 인코딩해 10–20% 줄었다. dense의 나머지 비용은 viewer마다 하는 AOI 차분과 델타 본문 인코딩이며
  계획 6항(AOI·스냅샷 DoD)이 다룬다(슬라이스 번호는 커밋 순서 — 슬라이스 6은 계획 7항 tick 밖 송신 코얼레싱이다).
- 슬라이스 6: MOVE_TO 행은 전(HEAD 50e5ecb + `mmorpg_net_tx_writes_total` 메트릭만 더한 사본)·후(작업 트리)를 번갈아 5회 돌린
  중앙값이다. zone 설정(spread 1000·2000 / 500·600, dense 500·600, 3회)은 tick 경로가 그대로라 단계 시간이 잡음 범위이고 송신
  bytes·packets·writes가 같다. MOVE_TO는 수신자마다 하던 즉시 write가 턴 끝 1회로 합쳐져 write가 K+1 → 1이 됐다. 대역 소켓은
  syscall 비용이 없어서 인프로세스 시간은 outbox 복사만큼 약간 늘어난다(K=200에서 +7 µs). 실제 이득은 커널 send 횟수다.
  realistic 행은 `tools/loadgen/orchestrate.ts --spawn-server --scenario realistic --duration 20`(몬스터 `genSpawns --count 600
  --zone 2`)를 레벨마다 전·후 번갈아 3회 돌린 중앙값이다(Windows, 서버 CPU는 `/admin/perf` 기준). 300 CCU에서는 write가 27% 줄고
  system CPU가 0.35 → 0.26 코어로 내려갔다. 500 CCU의 "전"은 이벤트 루프가 포화된 상태였다(1.1 코어, tick 13.5 Hz, 클라 lag
  6.6초). "후"는 같은 부하에서 20 Hz를 유지한다. 처리한 패킷이 오히려 늘었는데(80k → 92k/s, 클라가 더는 밀리지 않아서), write는
  42% 줄었다. 두 레벨 모두 tick p99는 비슷하다(300: 18.0 / 18.2 ms, 500: 35.4 / 32.8 ms — 게이트 25 ms 초과는 전후 공통). tick 밖
  지연은 오히려 줄었다(MOVE_TO→PATH p99 84 → 23 ms). Bun은 due 타이머와 immediate의 순서를 보장하지 않아서 tick이 먼저 도는 턴도
  있다. 그 경우 tick uncork가 지연 프레임을 함께 보내므로 지연은 많아야 tick 1회 처리 시간이다.
- 슬라이스 7(계획 6항, 옵션 A — 바이트 동일): 단계 시간 행은 전(HEAD e6fca60 사본)·후(작업 트리)를 설정마다 번갈아 3회 돌린
  중앙값이고, 송신 bytes·packets·writes는 모든 설정·모든 실행에서 같다. 할당·GC 행은 슬라이스 4·5와 같은 JSC GC 로그 방식(200 /
  1,200 tick 차)이며 벤치 구동부(입력 객체, 반격 대상 찾기의 `windowOf` Set)의 할당도 들어 있다. 종전 viewer마다 하던 일 —
  창 Set 생성, 원소마다 Set 조회 2회, enter/leave/keep 배열, 원소마다 update 객체, 본문 인코딩의 `Buffer.write*` 3회 — 을 없앴다.
  창은 slot 연결 리스트 순회, 포함 판정은 slot 스탬프 배열, moved 판정은 dispatch당 1회 만드는 slot 캐시, DELTA는 원소당 u32 3개를
  재사용 버퍼로 옮긴 뒤 outbox에 memcpy 1회다. dense 벤치는 플레이어가 셀 1개 안에서만 움직여 '창 불변' 지름길(창 셀의
  version이 그대로면 diff 생략)이 늘 맞는다 — 남은 비용은 DELTA 원소 쓰기와 outbox 복사다(dense 1000명 tick당 10.6 MB). 지름길이
  전혀 맞지 않는 최악(모든 viewer의 창이 매 tick 바뀜)은 같은 1000명 밀집 마이크로벤치에서 dispatch 약 12 ms였다(전 약 85 ms).
  spread는 셀당 인원이 적고 몬스터도 움직여 창 셀 version이 자주 바뀌므로 대부분 전체 차분을 한다(3–3.5배). 할당이 크게 줄어
  GC 정지도 dense 500·600 기준 약 1/9이 됐고, tick 평균이 `dispatchSnapshots` 감소분보다 더 줄어든 것은 이 때문이다.
- 슬라이스 8(계획 8항 — 바이트 보존 슬라이스가 아니다. 과부하 경로는 의도적으로 바뀌고, 와이어 특성화 골든은 과부하 경로를 타지 않아 불변):
  MOVE_TO·zone 행은 전(HEAD 1cd2dcc 사본)·후(작업 트리)를 번갈아 3회 돌린 중앙값이고 송신 bytes·packets·writes는 모든 실행에서 같다(잡음 범위 —
  추가 비용은 rate 위반 경로의 신호 질의 1회와 tick 루프 반복당 관측 1회뿐). loadgen 행은 `orchestrate.ts --spawn-server --scenario realistic`
  (몬스터 `genSpawns --count 600 --zone 2`, hold 20초, 정지 주입은 hold 60–90초·hold 20초 지점 `/admin/perf?stall=`)를 Windows에서 1회씩 돌린 값이다.
  2-C에서 realistic 1000을 무너뜨린 원인(tick 밖 송신·스냅샷 비용)은 슬라이스 6·7이 없앴다 — 이제 1000은 20 Hz이고 신호가 한 번도 켜지지 않는다
  (전후 같은 결과). 그래서 2-C의 킥 폭주 기제(소켓 읽기 간격이 약 19초를 넘어 (21·S−100) drop > 300)는 25초 정지 주입으로 재현했다: 종전은 정지가
  끝나자 300명 전원이 KICK 5, 슬라이스 8은 0명(`OVERLOAD_PROTECT=0`이면 종전과 같은 KICK 300 — 끔 스위치 확인). 접속 제한은 realistic 2000으로
  확인했다: 종전은 2000명을 다 받아 6.9 Hz로 무너진 채 hold(kick은 0 — 1000·2000 모두 소켓 읽기 간격이 버킷을 넘지 않는다), 슬라이스 8은 약 1,215명에서
  신호가 켜져 나머지 785명을 KICK 9 "server busy"로 거절하고 15.9 Hz를 유지했다(신호는 hold 내내 켜짐 — 16 Hz 경계라 skip이 이어진다).
  `OVERLOAD_ADMISSION=0`이면 2000명 수용·6.39 Hz·p99 125.6 ms로 종전과 같다.

## 성능 3단계 — Bun 최적화 후 (2-C 대비, Windows/Linux)

> **측정일 2026-10-07 · 커밋 `999aee5`** (`bun-to-cpp-server`, 슬라이스 1–8 + 리뷰 픽스, 두 플랫폼 동일, 측정 중 레포 무수정).
> 위 "성능 2-C 기준선"과 같은 방법·같은 몬스터 파일로 다시 쟀다. 수치는 3단계 재측정 보고(Windows·Linux)·슬라이스 보고·
> 선행 연구(`final.md` §4.2/§4.3)에서 옮겼고, 평균 tick은 같은 원자료의 집계표(`agg-stage3-vs-2c*.md`)에서 옮겼다.
> "계산"은 그 수치끼리의 산술, "—"는 미측정이다. 셀의 `A → B`는 **2-C → 3단계**, "신규"는 2-C에 없던 레벨이다.

### 요약

- **임계 CCU가 약 2–4배로 올랐다.** tick p99 > 25 ms는 stock 250 → ≈720 (W) / ≈705 (L), spread 340 → ≈745 / 375 → ≈750,
  realistic 250 → ≈700 / 275 → ≈960(Linux는 부하 생성기 편향 — 샤드 150명이면 ≈755). Hz < 20은 1.8–4.2배(아래 "임계점").
- **2-C에서 무너진 realistic 1000이 20 Hz·kick 0이다.** 접속 61–65초(W)·54–75초(L) → 13.0초·10.8초, kick 787–952/런 → 0.
- **지배 비용이 스냅샷에서 소켓 송신으로 넘어갔다.** `dispatchSnapshots`는 같은 CCU에서 5.5–16.5배 줄었고(login-storm 46–48배),
  새 임계점에서 tick의 56–67%가 flush(소켓당 send)다. 메인 스레드는 ≈1코어에서 포화하고 그 절반이 sys다.
- **선행 연구 예측과 대체로 맞는다.** 밀집 tick 3.1배(W)/3.8배(L) vs 예측 3.7–3.9배, 밀집 수용 ≈720/≈705 vs 예측 690–800.
  분산 예측(무클램프)은 시나리오가 달라 직접 비교할 수 없다. 몬스터 AI 1 ms 미만 목표는 zoneBench 2000·4000에서 미달(≈1.3–1.5 ms).

### 환경

| 항목 | Windows | Linux (WSL2) |
|---|---|---|
| 머신·런타임 | i7-8700K 6C/12T, 32 GB, 네이티브, bun 1.3.13 | 같은 호스트의 WSL2 — 12 vCPU, 15,959 MB, Ubuntu 22.04.3, `6.18.40.1-microsoft-standard-WSL2`, bun 1.3.13(zod 4.6.5), `ulimit -n 65536` |
| 측정 창 (KST) | 03:02:36–03:44:13 (약 42분) | 03:50:43–04:34:35(매트릭스+보충), 04:37:32–04:44:11(부하 생성기 점검) |
| 배경 부하 | ≈0.63 논리 코어 (2-C ≈1.3) | Windows 호스트 ≈0.80(유휴 틈 1.0–1.1), WSL 내부 99.5% 유휴 (2-C 호스트 ≈1.3–2.4) |
| 부하 생성기 샤드 CPU 최대 (한도 0.8) | 0.49 — 병목 아님. 타이머 밀림 realistic ≥1000에서 11–296슬롯(최대 68–137 ms), login-storm 폭주 중 227–2,093 | stock·spread ≤0.40, login-storm ≤0.31, **realistic 1000–1250은 0.76–0.85로 한도 근처·초과**(아래 "부하 생성기 점검"). 타이머 밀림 0–33슬롯(최대 121 ms) |

### 방법

- 2-C와 같다: `bun tools/loadgen/orchestrate.ts --spawn-server --duration 30`(포트 19000/19090, 조인 100/s, 샤드당 250명, settle 3초,
  레벨마다 새 서버). Linux는 `/proc` 스레드별 샘플러(1초, **메인 스레드** = bun JS 스레드, GC HeapHelper 제외)를 함께 돌렸다.
- realistic 몬스터: `genSpawns --count 600 --zone 2` → 608 스폰, sha256 `dc5d3482…37586844` — 2-C·두 플랫폼 동일.
- 반복: stock 300, spread 500·1000, realistic 250·500·1000은 3회(표는 평균, p99 괄호는 범위), 나머지 1회(2-C에서 3회였던 stock 100도 1회).
  20 Hz가 유지되는 동안 매트릭스 위 레벨을 보충하고, 교차점 근처를 촘촘히 더 쟀다(보충 스윕은 `--stop-p99 80`).
- **과부하 보호는 서버 기본값(켜짐)이다.** 오케스트레이터가 `OVERLOAD_*`를 주지 않으므로 용량을 넘는 레벨(stock 1500/2000,
  spread 2000, realistic 1500/2000)은 조인 중 신규 접속이 KICK 9 "server busy"로 거절돼 접속 수가 CCU보다 적다(표의 "(접속 N)").
  그 아래 레벨은 신호가 켜지지 않아 2-C와 같은 조건이다.
- 표기(2-C 절과 같음): 시간 ms, tick = 처리 시간, 평균 = tick 평균, late = 시작 지연, skip = hold 중 건너뛴 tick, snap·AI·flush =
  `dispatchSnapshots`·`runMonsterAi`·uncork 송신의 tick당 평균, CPU = 서버 프로세스 코어(user/sys), RSS = hold 시점 MB.
  **tick 밖** = Windows는 프로세스 코어 − tick 점유(평균 × Hz / 1000), Linux는 메인 스레드 − tick 점유(추정).
  **wr/s/CCU** = 연결당 초당 소켓 write(`mmorpg_net_tx_writes_total`, 2-C에는 없던 메트릭) — stock 21.0 = tick 20 + PONG 1,
  그보다 큰 몫은 tick 밖 송신(턴 끝 코얼레싱 후). tx/rx per CCU는 hold 창에 실제 있던 연결 수로 나눴다.

### 임계점

| 시나리오 | 플랫폼 | p99 > 25 ms | p99 > 50 ms | Hz < 20 | Hz < 15 |
|---|---|---|---|---|---|
| stock | W | ≈250 → **≈720** (700: 24.1, 800: 30.0) | ≈420 → **≈1190** (1000: 39.1, 1200: 51.4) | 450 (19.01) → **1275 (16.74)** — 1200은 19.98이지만 late p99 142·정지 12회 | 500 (14.07) → **미도달** (1500/2000은 접속 ≈1400에서 15.8 Hz) |
| stock | L | ≈250 → **≈705** (700: 24.7, 800: 31.3) | ≈390 → **≈1090** (1000: 42.6, 1100: 50.6) | 450 (19.59) → **1100 (19.75, skip 8)** — 1000은 20.00 | 500 (13.30) → **1275 (14.64)** |
| spread | W | ≈340 → **≈745** (750: 25.9) | ≈540 → **≈1300** (1250: 46.5, 1375: 55.7) | 500–750 사이 → **1375 (19.26)** — 1250은 20.04 | 750 (14.07) → **2000 (14.93, 접속 1624)** |
| spread | L | ≈375 → **≈750** (750: 25.0) | ≈550 → **≈1255** (1250: 49.6, 1375: 63.6) | 500–625 사이 → **≈1125 (19.94, skip 2)**, 1250은 17.87 | 750 (12.66) → **1375 (14.48)** |
| realistic | W | ≈250 → **≈700** (650: 22.3, 750: 26.9) | 2-C는 Hz가 먼저 무너짐 → **≈1200** (1125: 46.1, 1250: 53.4) | 300 (19.51) → **1125 (18.02)** — 1000은 20.01이지만 late p99 166 | 400 (12.93) → **1500 (14.40, 접속 1301)** |
| realistic | L | ≈275 → **≈960** (875: 20.6, 1000: 27.0) — 샤드 150명이면 **≈755** | ≈320 → **미도달** (2000·접속 1233에서 49.2) | 300 (19.67) → **1250 (19.25)** — 샤드 150명이면 1250이 14.00 Hz | 350 (14.97) → **미도달** (2000·접속 1233에서 16.06) |
| login-storm (hold) | W | 500에서 32.3 → **3000에서도 10.3** | 1000에서 100.1 → **도달 안 함** | 1000 (12.17) → **3000까지 미도달**(단 2000·3000은 접속 1822·1939) | — |
| login-storm (hold) | L | 500에서 43.9 → **≈2720** (2500: 18.1, 3000: 33.9) | 1000에서 108.7 → **도달 안 함** | 1000 (10.64) → **3000 (17.02)** — 2500은 20.00 | 미도달 |

교차점 배율 [계산]: p99 > 25 ms는 stock 2.9 / 2.8배, spread 2.2 / 2.0배, realistic 2.8 / 3.5배(샤드 150명 기준 2.7배).
Hz < 20은 stock 2.8 / 2.4배, spread 1.8–2.75 / 1.8–2.25배(2-C 교차가 구간이라 범위), realistic 3.75 / 4.2배.

### 1. stock — Windows

| CCU | n | p50 | p99 | Hz | late p99 | skip | 평균 | snap | flush | CPU (u/s) | tick 밖 | RSS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 100 | 3→1 | 4.2→**1.9** | 7.4→**3.0** | 20.00→20.00 | 20.3→17.1 | 0→0 | 4.3→**2.0** | 2.20→**0.28** | 1.61→1.44 | 0.16 (0.11/0.06)→**0.08 (0.04/0.04)** | 0.08→0.04 | 262→262 |
| 200 | 1→1 | 10.8→**3.9** | 17.4→**5.9** | 19.99→20.01 | 22.6→24.4 | 0→0 | 11.1→**4.1** | 7.12→**0.74** | 3.29→2.91 | 0.37 (0.26/0.11)→**0.13 (0.06/0.08)** | 0.14→0.05 | 284→263 |
| 300 | 3→3 | 22.8→**6.7** | 33.8 (31.2–35.6)→**9.6 (9.5–9.6)** | 20.00→20.00 | 20.2→19.1 | 0→0 | 23.0→**6.8** | 16.70→**1.37** | 5.36→4.77 | 0.70 (0.54/0.16)→**0.23 (0.10/0.12)** | 0.24→0.09 | 372→274 |
| 400 | 1→1 | 29.1→**9.5** | 44.3→**13.7** | 20.13→20.00 | 239.9→**20.6** | 1→0 | 30.0→**9.7** | 21.45→**2.32** | 7.45→6.58 | 0.92 (0.70/0.22)→**0.32 (0.14/0.18)** | 0.32→0.12 | 406→276 |
| 500 | 1→1 | 59.9→**12.6** | 72.7→**17.0** | 14.07→**20.01** | 269.2→**27.9** | 177→**0** | 60.2→**12.8** | 48.97→**3.45** | 9.41→8.41 | 1.15 (0.95/0.20)→**0.35 (0.14/0.21)** | 0.30→0.09 | 480→279 |
| 600 신규 | 1 | 16.1 | 20.3 | 20.00 | 21.3 | 0 | 16.3 | 4.88 | 10.42 | 0.42 (0.19/0.23) | 0.10 | 299 |
| 700 신규 | 1 | 20.0 | 24.1 | 20.00 | 22.4 | 0 | 20.2 | 6.61 | 12.37 | 0.53 (0.23/0.30) | 0.12 | 314 |
| 800 신규 | 1 | 23.7 | 30.0 | 20.01 | 18.2 | 0 | 24.1 | 8.26 | 14.59 | 0.65 (0.32/0.34) | 0.17 | 303 |
| 1000 신규 | 1 | 32.7 | 39.1 | 20.00 | 24.1 | 0 | 33.0 | 12.93 | 18.61 | 0.88 (0.43/0.45) | 0.22 | 312 |
| 1200 신규 | 1 | 42.8 | 51.4 | 19.98 | 142.5 | 0 (정지 12) | 43.3 | 18.28 | 23.25 | 1.00 (0.50/0.50) | 0.14 | 358 |
| 1275 신규 | 1 | 47.1 | 55.3 | 16.74 | 268.9 | 98 | 47.6 | 19.25 | 25.24 | 1.01 (0.53/0.48) | 0.21 | 435 |
| 1350 신규 | 1 | 50.5 | 59.5 | 15.92 | 264.5 | 122 | 51.0 | 20.75 | 26.90 | 1.03 (0.53/0.50) | 0.22 | 410 |
| 1500 (접속 1413) | 1 | 55.6 | 65.4 | 15.79 | 259.5 | 128 | 56.1 | 23.77 | 28.96 | 1.06 (0.57/0.49) | 0.18 | 443 |
| 2000 (접속 1394) | 1 | 54.9 | 63.5 | 15.84 | 260.9 | 125 | 55.3 | 23.03 | 28.92 | 1.06 (0.55/0.50) | 0.18 | 420 |

| CCU | tx B/s/CCU | wr/s/CCU | 입력 overflow | RTT p50/p99 | lag p99 | 핸드셰이크 p50/p99 | kick |
|---|---|---|---|---|---|---|---|
| 100 | 22,024→22,061 | 21.0 | 0→0 | 1.0/7.4→0.9/3.3 | 37.3→33.8 | 49/59→47/53 | 0→0 |
| 300 | 64,682→64,709 | 21.0 | 0→0 | 7.5/32.1→**1.6/9.9** | 40.0→36.4 | 51/112→49/65 | 0→0 |
| 500 | 84,397→107,511 ¹ | 21.0 | 61,202→**0** | 45.0/158.0→**2.8/17.6** | 8,866→**46.9** | 67/405→49/75 | 0→0 |
| 700 | 149,930 | 21.0 | 0 | 8.7/26.0 | 38.1 | 55/103 | 0 |
| 1000 | 213,785 | 20.9 | 0 | 23.1/72.1 | 38.5 | 59/208 | 0 |
| 1200 | 253,284 | 20.5 | 0 | 75.0/253.0 | 158.0 | 69/960 | 0 |
| 1275 | 256,212 | 17.6 | 22,082 | 45.0/170.9 | 4,855 | 75/1,215 | 0 |
| 1500 | 264,153 | 16.2 | 92,663 | 135.1/320.1 | 6,307 | 91/1,537 | KICK 9 80 ² |
| 2000 | 260,222 | 16.3 | 91,042 | 106.8/284.6 | 6,234 | 78/2,188 | KICK 9 510 ² |

¹ 2-C는 이 레벨에서 14 Hz라 스냅샷을 덜 보냈다(갱신/스냅샷은 지금 445, 2-C 501).
² in-world kick이 아니다. 조인 중 과부하 신호가 켜져 신규 접속을 거절했다 — `overload_rejected_total`이 실패 수와 같고(1500: 87,
2000: 606) 그중 80·510명만 KICK 9 프레임을 받았다(나머지는 핸드셰이크 중 소켓 close만 관측). rate kick은 전 레벨 0.

### 2. stock — Linux

| CCU | n | p50 | p99 | Hz | late p99 | skip | 평균 | snap | flush | CPU (u/s) | 메인 스레드 | tick 밖 | RSS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 100 | 3→1 | 3.4→**1.0** | 6.1→**1.3** | 20.00→20.00 | 0.1→1.4 | 0→0 | 3.4→**1.0** | 2.37→**0.24** | 0.69→0.50 | 0.34 (0.17/0.18)→**0.25 (0.10/0.16)** | 0.18→0.12 | 0.11→0.10 | 132→127 |
| 200 | 1→1 | 6.1→**2.0** | 10.3→**2.8** | 20.00→20.00 | 0.1→1.3 | 0→0 | 6.5→**2.0** | 4.65→**0.65** | 1.37→1.03 | 0.46 (0.29/0.17)→**0.30 (0.17/0.13)** | 0.27→0.16 | 0.14→0.12 | 137→131 |
| 300 | 3→3 | 22.8→**6.0** | 38.2 (36.7–39.6)→**8.0 (7.9–8.1)** | 20.01→20.00 | 1.6→0.1 | 0→0 | 24.1→**6.1** | 18.12→**1.30** | 5.21→4.27 | 1.23 (0.79/0.44)→**0.40 (0.17/0.23)** | 0.63→**0.25** | 0.15→0.13 | 162→137 |
| 400 | 1→1 | 30.4→**8.4** | 52.5→**11.2** | 20.05→20.00 | 254.1→**0.1** | 3→**0** | 32.5→**8.5** | 25.04→**2.14** | 6.58→5.75 | 1.44 (0.99/0.45)→**0.47 (0.21/0.26)** | 0.80→**0.32** | 0.15→0.15 | 191→138 |
| 500 | 1→1 | 65.5→**11.0** | 86.3→**14.4** | 13.30→**20.00** | 263.4→**0.9** | 201→**0** | 65.4→**11.1** | 55.22→**3.34** | 8.29→7.04 | 1.52 (1.16/0.36)→**0.55 (0.24/0.31)** | 0.96→**0.39** | 0.09→0.17 | 229→141 |
| 600 신규 | 1 | 18.2 | 21.1 | 20.00 | 1.3 | 0 | 18.0 | 4.70 | 12.61 | 0.65 (0.27/0.38) | 0.52 | 0.16 | 157 |
| 700 신규 | 1 | 21.7 | 24.7 | 20.00 | 0.1 | 0 | 21.8 | 6.27 | 14.63 | 0.73 (0.32/0.42) | 0.60 | 0.16 | 163 |
| 800 신규 | 1 | 27.3 | 31.3 | 20.00 | 1.5 | 0 | 27.4 | 8.14 | 18.32 | 0.88 (0.36/0.52) | 0.74 | 0.19 | 172 |
| 1000 신규 | 1 | 36.0 | 42.6 | 20.00 | 2.3 | 0 | 36.3 | 12.57 | 22.59 | 1.00 (0.45/0.55) | 0.90 | 0.17 | 181 |
| 1100 신규 | 1 | 42.0 | 50.6 | 19.75 | 257.7 | 8 | 42.4 | 15.54 | 25.39 | 1.06 (0.51/0.55) | 0.99 | 0.15 | 209 |
| 1200 신규 | 1 | 48.9 | 57.4 | 16.54 | 265.5 | 104 | 49.3 | 17.97 | 28.42 | 1.09 (0.54/0.54) | 0.99 | 0.17 | 256 |
| 1275 신규 | 1 | 54.2 | 67.7 | 14.64 | 265.9 | 160 | 55.0 | 20.55 | 30.95 | 1.09 (0.56/0.53) | 0.99 | 0.18 | 267 |
| 1350 신규 | 1 | 58.7 | 70.0 | 13.56 | 266.3 | 194 | 59.5 | 23.08 | 32.78 | 1.08 (0.56/0.52) | 0.99 | 0.18 | 262 |
| 1500 (접속 1368) | 1 | 59.6 | 68.7 | 13.36 | 266.0 | 199 | 60.4 | 23.25 | 33.43 | 1.09 (0.57/0.52) | 0.99 | 0.18 | 297 |
| 2000 (접속 1344) | 1 | 61.2 | 73.4 | 12.96 | 269.8 | 211 | 62.1 | 23.52 | 34.90 | 1.08 (0.57/0.52) | 0.99 | 0.19 | 257 |

| CCU | tx B/s/CCU | wr/s/CCU | 입력 overflow | RTT p50/p99 | lag p99 | 핸드셰이크 p50/p99 | kick |
|---|---|---|---|---|---|---|---|
| 100 | 22,032→22,077 | 21.0 | 0→0 | 0.3/3.8→0.2/2.3 | 6.5→3.4 | 51/74→49/81 | 0→0 |
| 300 | 64,697→64,731 | 21.0 | 0→0 | 3.5/30.4→**0.2/6.1** | 27.3→7.2 | 57/256→51/75 | 0→0 |
| 500 | 80,054→107,454 ¹ | 21.0 | 75,532→**0** | 37.0/84.4→**0.3/13.3** | 10,057→**9.8** | 84/649→51/78 | 0→0 |
| 700 | 150,004 | 21.0 | 0 | 2.4/24.1 | 11.9 | 55/146 | 0 |
| 1000 | 213,616 | 21.0 | 0 | 16.9/43.3 | 18.3 | 59/308 | 0 |
| 1100 | 234,445 | 19.7 | 0 | 59.3/98.7 | 374.5 | 64/360 | 0 |
| 1200 | 238,514 | 16.5 | 26,052 | 66.7/106.8 | 5,184 | 67/360 | 0 |
| 1500 | 219,285 | 13.3 | 203,254 | 84.4/135.1 | 9,923 | 75/360 | KICK 9 132 ³ |
| 2000 | 208,709 | 12.9 | 218,686 | 87.7/140.5 | 10,508 | 81/389 | KICK 9 656 ³ |

³ Windows와 같은 조인 중 접속 거절인데, Linux는 거절된 연결 전원이 KICK 9 프레임을 받았다(`overload_rejected_total` = 실패 = KICK 9).
partial write·backlog close·핸들러/존 에러·unhandled rejection은 모든 hold 창에서 0.

### 3. spread (Town 64×64 클램프) — Windows / Linux

| CCU | 플랫폼 | p50 | p99 | Hz | late p99 | skip | 평균 | snap | flush | CPU (u/s) | 메인 스레드 | tick 밖 | RSS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 250 | W | 9.7→**4.8** | 15.8→**7.2** | 19.99→20.02 | 21.0→19.8 | 0→0 | 10.0→**4.9** | 4.96→**0.90** | 4.26→3.51 | 0.35 (0.22/0.13)→**0.17 (0.08/0.08)** | — | 0.15→0.07 | 280→263 |
| 250 | L | 6.2→**2.4** | 11.2→**3.0** | 20.00→20.00 | 0.1→0.1 | 0→0 | 6.5→**2.4** | 4.04→**0.79** | 1.88→1.22 | 0.51 (0.31/0.20)→**0.33 (0.14/0.19)** | 0.28→0.19 | 0.15→0.14 | 141→136 |
| 500 (n=3) | W | 29.0→**11.3** | 42.5 (41.1–43.6)→**16.1 (15.5–16.8)** | 20.01→19.99 | 38.4→21.7 | 0→0 | 29.7→**11.5** | 18.69→**2.71** | 9.77→7.87 | 0.86 (0.59/0.26)→**0.36 (0.16/0.20)** | — | 0.26→0.13 | 361→307 |
| 500 (n=3) | L | 29.7→**9.6** | 44.2 (42.6–47.3)→**13.3 (12.7–13.8)** | 20.01→20.00 | 6.5→0.1 | 0→0 | 30.7→**9.7** | 20.11→**2.50** | 9.53→6.53 | 1.44 (0.93/0.51)→**0.59 (0.28/0.31)** | 0.78→0.40 | 0.17→0.20 | 158→153 |
| 750 | W | 58.3→**18.9** | 90.4→**25.9** | 14.07→**20.02** | 267.8→**20.1** | 176→**0** | 60.8→**19.1** | 41.78→**5.35** | 16.50→12.46 | 1.27 (0.98/0.29)→**0.56 (0.25/0.31)** | — | 0.42→0.18 | 472→345 |
| 750 | L | 64.3→**21.0** | 111.9→**25.0** | 12.66→**20.00** | 266.3→**2.4** | 221→**0** | 65.9→**21.0** | 44.16→**5.21** | 18.93→14.96 | 1.55 (1.07/0.48)→**0.84 (0.37/0.47)** | 0.95→0.65 | 0.12→0.23 | 239→181 |
| 1000 (n=3) | W | 86.4→**27.5** | 108.0 (102.4–113.6)→**36.5 (35.8–37.4)** | 10.25→**20.00** | 266.6→**21.4** | 278–301→**0** | 87.0→**28.0** | 59.23→**8.54** | 24.17→17.80 | 1.32 (1.02/0.30)→**0.77 (0.37/0.40)** | — | 0.43→0.21 | 568→362 |
| 1000 (n=3) | L | 112.9→**31.9** | 159.5 (150.4–175.5)→**38.3 (37.0–39.1)** | 7.30→**20.00** | 281.2→**3.8** | 377–390→**0** | 114.6→**32.1** | 75.59→**8.63** | 34.08→22.40 | 1.47 (1.04/0.43)→**1.05 (0.44/0.60)** | 0.98→0.87 | 0.15→0.23 | 316→195 |
| 1125 신규 | L | 37.7 | 47.8 | 19.94 | 255.4 | 2 | 38.4 | 11.13 | 25.81 | 1.14 (0.49/0.64) | 0.98 | 0.21 | 203 |
| 1250 신규 | W | 37.6 | 46.5 | 20.04 | 58.0 | 0 | 38.0 | 13.20 | 22.95 | 1.05 (0.50/0.55) | — | 0.29 | 411 |
| 1250 신규 | L | 43.4 | 49.6 | 17.87 | 267.6 | 64 | 43.6 | 13.36 | 28.19 | 1.13 (0.53/0.60) | 0.99 | 0.21 | 208 |
| 1375 신규 | W | 44.1 | 55.7 | 19.26 | 262.2 | 22 | 44.8 | 16.40 | 26.10 | 1.05 (0.51/0.53) | — | 0.18 | 419 |
| 1375 신규 | L | 52.3 | 63.6 | 14.48 | 274.6 | 165 | 52.9 | 16.81 | 32.59 | 1.15 (0.57/0.58) | 0.99 | 0.22 | 217 |
| 1500 | W | 189.4→**51.0** | 225.6→**62.2** | 4.63→**15.90** | 275.1→266.6 | 458→**123** | 190.7→**51.4** | 143.37→**18.95** | 41.56→29.10 | 1.31 (1.02/0.29)→1.14 (0.60/0.53) | — | 0.42→0.32 | 753→411 |
| 1500 | L | 237.9→**58.1** | 312.7→**75.7** | 3.44→**13.05** | 307.4→274.0 | 500→**208** | 241.8→**58.8** | 180.53→**19.59** | 55.32→35.33 | 1.39 (0.96/0.44)→1.15 (0.58/0.57) | 1.04→1.00 | 0.21→0.23 | 451→252 |
| 2000 (접속 1624) | W | 56.8 | 77.6 | 14.93 | 265.0 | 153 | 58.3 | 21.59 | 32.76 | 1.08 (0.53/0.54) | — | 0.21 | 430 |
| 2000 (접속 1530) | L | 61.6 | 83.4 | 12.14 | 275.7 | 235 | 62.9 | 20.77 | 37.83 | 1.15 (0.58/0.56) | 0.99 | 0.23 | 241 |

| CCU | 플랫폼 | tx B/s/CCU | wr/s/CCU | 입력 overflow | RTT p50/p99 | lag p99 | 핸드셰이크 p50/p99 | kick |
|---|---|---|---|---|---|---|---|---|
| 500 | W | 45,364→46,015 | 21.0 | 0→0 | 15.5/47.7→**2.8/17.6** | 57.5→41.1 | 55/159→49/70 | 0→0 |
| 500 | L | 45,321→45,727 | 21.0 | 0→0 | 8.7/38.1→**0.3/11.0** | 33.8→11.9 | 62/356→51/79 | 0→0 |
| 750 | W | 55,759→69,646 | 21.0 | 93,664→**0** | 52.7/224.9→**7.4/27.1** | 8,874→**40.0** | 81/1,168→53/107 | 0→0 |
| 750 | L | 50,012→70,167 | 21.0 | 129,464→**0** | 40.0/111.0→**3.4/24.1** | 10,932→**19.0** | 152/759→53/84 | 0→0 |
| 1000 | W | 50,933→91,728 | 21.0 | 243k–262k→**0** | 169/565→**19.8/61.7** | 14,671→**50.3** | 181/3,644→59/178 | 0→0 |
| 1000 | L | 38,278→92,537 | 21.0 | 350k–363k→**0** | 69.4/156.2→**12.8/41.7** | 18,945→**22.5** | 370/1,297→56/141 | 0→0 |
| 1250 | W | 113,865 | 20.9 | 0 | 34.2/124.9 | 64.1 | 67/493 | 0 |
| 1250 | L | 113,243 | 17.8 | 2 | 61.6/98.7 | 3,200 | 67/333 | 0 |
| 1500 | W | 29,436→123,492 | 16.6 | 664,300→80,792 | 1,263/2,559→**64.1/243.3** | 22,928→6,121 | 1,366/9,710→81/1,421 | 0→0 |
| 1500 | L | 27,171→102,090 | 13.0 | 725,682→238,991 | 135.1/307.8→**84.4/140.5** | 24,811→10,398 | 759/2,022→78/374 | 0→0 |
| 2000 | W | 123,482 | 15.2 | 156,491 | 199.9/512.5 | 7,612 | 88/1,537 | KICK 9 309 (거절 376) |
| 2000 | L | 95,364 | 12.1 | 291,059 | 87.7/151.9 | 11,792 | 81/438 | KICK 9 470 (거절 470) |

2-C 대비 tx/CCU 증가(750–1500)는 2-C가 그 레벨에서 Hz가 떨어져 스냅샷을 덜 보냈기 때문이다(2-C 절 "이상·주의" 5). monsterAi는
W 0.04–0.18 / L 0.04–0.20 ms.

### 4. realistic (+608 몬스터) — Windows / Linux

| CCU | 플랫폼 | p50 | p99 | Hz | late p99 | skip | 평균 | snap | AI | flush | CPU (u/s) | 메인 스레드 | tick 밖 | RSS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 100 | W | 4.8→**2.3** | 8.4→**4.4** | 19.99→20.03 | 20.0→19.0 | 0→0 | 5.0→**2.4** | 2.04→**0.32** | 0.44→**0.14** | 1.73→1.41 | 0.21 (0.12/0.09)→**0.08 (0.04/0.04)** | — | 0.11→0.03 | 272→265 |
| 100 | L | 3.7→**1.4** | 5.4→**2.1** | 20.00→20.00 | 0.1→2.1 | 0→0 | 3.8→**1.4** | 2.10→**0.31** | 0.38→**0.12** | 0.68→0.52 | 0.37 (0.19/0.17)→0.31 (0.14/0.17) | 0.20→0.16 | 0.12→0.13 | 125→134 |
| 250 (n=3) | W | 13.3→**5.3** | 23.3 (21.9–25.3)→**8.2 (8.0–8.6)** | 19.99→20.01 | 23.6→18.2 | 0→0 | 13.9→**5.4** | 7.32→**1.01** | 0.86→**0.14** | 4.40→3.50 | 0.63 (0.37/0.26)→**0.28 (0.12/0.16)** | — | 0.35→0.17 | 289→284 |
| 250 (n=3) | L | 7.9→**2.9** | 14.3 (14.2–14.5)→**4.1 (3.9–4.4)** | 20.00→20.00 | 1.6→0.2 | 0→0 | 8.6→**2.9** | 4.92→**0.89** | 0.77→**0.12** | 1.85→1.24 | 0.67 (0.41/0.26)→**0.42 (0.20/0.22)** | 0.40→0.26 | 0.23→0.20 | 144→145 |
| 500 (n=3) | W | 42.4→**11.6** | 69.1 (65.1–71.8)→**16.2 (15.9–16.4)** | 5.23→**20.00** | 838.2→**21.5** | 421–520→**0** | 43.5→**11.8** | 28.47→**2.70** | 1.10→**0.16** | 11.61→7.65 | 1.09 (0.44/0.65)→**0.69 (0.23/0.46)** | — | 0.87→**0.46** | 389→315 |
| 500 (n=3) | L | 45.5→**6.4** | 96.2 (87.3–105.1)→**9.0 (8.8–9.5)** | 6.61→**20.00** | 963.4→**4.1** | 375–413→**0** | 47.8→**6.5** | 38.57→**2.47** | 1.07→**0.14** | 5.46→2.81 | 1.27 (0.67/0.60)→**0.81 (0.38/0.43)** | 0.98→**0.60** | 0.66→**0.47** | 223→161 |
| 650 신규 | W | 16.2 | 22.3 | 20.02 | 22.0 | 0 | 16.5 | 4.29 | 0.16 | 10.69 | 0.97 (0.31/0.66) | — | 0.64 | 325 |
| 650 신규 | L | 9.5 | 14.5 | 20.00 | 10.4 | 0 | 9.7 | 3.90 | 0.16 | 4.27 | 1.07 (0.46/0.61) | 0.86 | 0.67 | 168 |
| 750 신규 | W | 18.9 | 26.9 | 19.97 | 25.6 | 0 | 19.3 | 5.06 | 0.17 | 12.58 | 1.01 (0.33/0.68) | — | 0.62 | 352 |
| 750 신규 | L | 11.3 | 15.8 | 20.01 | 14.5 | 0 | 11.5 | 4.93 | 0.17 | 4.80 | 1.13 (0.51/0.62) | 0.92 | 0.69 | 188 |
| 875 신규 | L | 14.9 | 20.6 | 20.01 | 19.9 | 0 | 15.2 | 6.20 | 0.18 | 7.05 | 1.15 (0.55/0.60) | 0.95 | 0.65 | 197 |
| 1000 (n=3) | W | 2-C 붕괴 → **28.2** | **38.7 (37.8–39.2)** | **20.01** | 165.9 | 0/3/0 | 28.7 | 8.46 | 0.20 | 18.29 | **1.05 (0.43/0.62)** | — | 0.48 | 371 |
| 1000 (n=3) | L | 2-C 붕괴 → **18.0** | **27.0 (25.4–28.1)** | **20.00** | 24.6 | 0/0/0 | 18.5 | 8.11 | 0.19 | 8.02 | **1.16 (0.64/0.53)** | 0.97 | 0.60 | 385→219 |
| 1125 신규 | W | 35.1 | 46.1 | 18.02 | 279.5 | 59 | 35.7 | 10.69 | 0.23 | 22.60 | 1.06 (0.47/0.58) | — | 0.41 | 376 |
| 1125 신규 | L | 25.0 | 35.5 | 20.01 | 216.8 | 0 (정지 2) | 25.3 | 10.62 | 0.24 | 11.83 | 1.12 (0.70/0.43) | 0.97 | 0.46 | 219 |
| 1250 신규 | W | 41.2 | 53.4 | 16.04 | 284.6 | 118 | 41.8 | 12.75 | 0.23 | 26.30 | 1.04 (0.50/0.55) | — | 0.37 | 418 |
| 1250 신규 | L | 27.5 | 43.9 | 19.25 | 284.6 | 27 | 28.1 | 12.73 | 0.25 | 12.19 | 1.13 (0.77/0.36) | 0.98 | 0.44 | 239 |
| 1500 (접속 1301) | W | 47.1 | 59.4 | 14.40 | 289.0 | 167 | 47.4 | 14.50 | 0.29 | 29.86 | 1.06 (0.49/0.56) | — | 0.38 | 395 |
| 1500 (접속 1254) | L | 30.2 | 42.6 | 19.20 | 283.2 | 27 | 30.7 | 12.28 | 0.27 | 15.25 | 1.10 (0.73/0.37) | 0.96 | 0.37 | 228 |
| 2000 (접속 1233) | L | 37.4 | 49.2 | 16.06 | 280.2 | 118 | 37.9 | 12.20 | 0.26 | 22.29 | 1.04 (0.63/0.41) | 0.91 | 0.30 | 232 |

| CCU | 플랫폼 | tx B/s/CCU | wr/s/CCU | RTT p50/p99 | lag p99 | MOVE_TO→PATH p50/p99 | 스킬 응답 p50/p99 | kills/min | MOVE_PATH 송신/s | kick |
|---|---|---|---|---|---|---|---|---|---|---|
| 250 | W | 26,452→26,371 | 46.8 | 6.3/39.2→**3.3/11.9** | 47.1→35.9 | 7.3/51.1→**3.6/12.2** | 44.5/85.9→35.6/67.6 | 351→345 | 8,415→8,423 | 0→0 |
| 250 | L | 27,451→27,185 | 53.8 | 0.6/13.8→0.4/5.4 | 13.5→9.3 | 1.0/14.8→0.5/6.3 | 34.3/60.9→29.3/52.7 | 313→323 | 8,498→8,490 | 0→0 |
| 500 | W | 25,105→42,276 | 60.2 | 435/2,053→**8.9/26.0** | 21,705→**40.7** | 521/2,104→**9.4/26.4** | 428/1,895→**40.1/76.0** | 59→**517** | 35,337→32,532 | 0→0 |
| 500 | L | 34,969→43,752 | 74.9 | 94.8/728.3→**1.8/12.3** | 19,879→**15.6** | 141.8/790.8→**2.3/13.7** | 277.7/1,112→**32.9/58.5** | 51→**444** | 40,384→33,396 | 0→0 |
| 750 | W | 57,648 | 58.9 | 34.2/102.7 | 59.3 | 35.6/102.7 | 59.3/129.9 | 568 | 71,526 | 0 |
| 750 | L | 59,488 | 65.2 | 11.0/29.3 | 26.0 | 11.4/30.4 | 37.0/66.7 | 524 | 71,902 | 0 |
| 1000 | W | 69,616 | 36.6 | 115.5/253.0 | 179.7 | 115.5/253.0 | 144.2/259.7 | 554 | 122,036 | 810/934/787 → **0/0/0** |
| 1000 | L | 71,324 | 39.6 | 28.9/66.7 | 55.4 | 30.0/72.2 | 46.9/90.1 | 640 | 118,317 | 865/952/945 → **0/0/0** |
| 1250 | W | 73,778 | 22.7 | 233.9/492.8 | 5,952 | 243.3/492.8 | 284.6/492.8 | 526 | 176,455 | 0 |
| 1250 | L | 83,890 | 20.3 | 61.6/146.1 | 1,366 | 64.1/140.5 | 64.1/135.1 | 636 | 173,421 | 0 |
| 1500 | W | 76,471 | 19.7 | 284.6/576.5 | 8,300 | 284.6/599.6 | 346.3/599.6 | 454 | 204,184 | KICK 9 138 (거절 199) |
| 1500 | L | 81,163 | 19.2 | 64.1/124.9 | 1,366 | 66.7/135.1 | 64.1/129.9 | 684 | 170,107 | KICK 9 246 |
| 2000 | L | 70,597 | 16.0 | 69.3/124.9 | 5,832 | 69.3/124.9 | 64.1/120.1 | 630 | 146,996 | KICK 9 767 |

- realistic 1000 접속 단계: 전원 접속 W 61–65초 → **13.0초**(명목 10초), L 54–75초 → **10.8초**. hold 전 skip은 W 2-C 1,322(런 1)
  → 4–7, L 1,008–1,580 → 0(런 1에 정지 1회). 핸드셰이크 p50/p99 W 6,715/50,352 → 166/1,350 ms, L p99 45–64초 → 0.36–0.51초.
- 입력 overflow는 realistic 전 레벨에서 0(2-C 500: W 53k–122k, L 4.7k–32k).
- **Linux realistic은 부하 생성기 배치가 서버 송신 비용을 낮춰 보인다**(아래 "부하 생성기 점검"). 2-C·3단계 Linux끼리는 같은 배치라 공정하다.

### 5. login-storm (전원 동시 접속 후 빈 입력)

| CCU | 플랫폼 | 접속 | 램프 | 핸드셰이크 p50/p99 | 부팅 → hold 시작 | hold p50/p99 | Hz | snap | CPU (u/s) | RSS | RTT p50/p99 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1000 | W | 1000→1000 | 7.8→**5.0초** | 5,392/7,674→**2,559/4,985** | 133 tick·14.9초·skip 164·dur p99 395.6 → **230 tick·11.7초·skip 4·dur p99 101.3** | 70.8/100.1→**2.7/4.3** | 12.17→**19.99** | 70.78→**1.55** | 1.28 (1.14/0.14)→**0.23 (0.15/0.08)** | 545→307 | 102.7/512.5→**3.0/8.3** |
| 1000 | L | 1000→1000 | 7.9→**5.2초** | 3,502/7,379→**2,661/5,184** | 121 tick·14.6초·skip 167·dur p99 679.7 → **223 tick·11.9초·skip 14·dur p99 63.3** | 74.1/108.7→**2.4/3.4** | 10.64→**20.00** | 73.80→**1.54** | 1.48 (1.22/0.26)→**0.50 (0.26/0.24)** | 460→178 | 46.9/111.0→**0.3/3.4** |
| 1500 | W | 1500 | 8.4초 | 3,940/8,300 | 279 tick·skip 23·dur p99 129.2 | 5.6/7.8 | 20.00 | 3.54 | 0.38 (0.26/0.12) | 386 | 4.1/13.3 |
| 1500 | L | 1500 | 8.1초 | 4,261/7,981 | 238 tick·14.8초·skip 57·dur p99 113.1 | 4.7/6.7 | 20.00 | 3.32 | 0.70 (0.38/0.32) | 240 | 0.4/6.1 |
| 2000 | W | **1822** | 10.9초 | 4,985/10,862 | 310 tick·skip 42·dur p99 138.8 | 6.4/9.2 | 19.97 | 3.86 | 0.48 (0.31/0.16) | 395 | 5.4/15.6 |
| 2000 | L | 2000 | 10.8초 | 5,607/10,502 | 244 tick·17.5초·skip 106·dur p99 264.2 | 7.8/10.6 | 20.00 | 5.92 | 0.89 (0.53/0.35) | 281 | 0.8/11.9 |
| 2500 | L | 2500 (hold 중 in-world 2415 ⁴) | 14.0초 | 7,095/13,820 | 248 tick·20.8초·skip 166·dur p99 368.1 | 11.4/18.1 | 20.00 | 9.02 | 1.02 (0.63/0.39) | 374 | 5.0/57.0 |
| 3000 | W | **1939** | 11.5초 | 5,832/11,359 | 282 tick·skip 86·dur p99 215.4 | 8.2/10.3 | 20.01 | 5.74 | 0.54 (0.36/0.18) | 396 | 5.9/18.3 |
| 3000 | L | 3000 | 17.6초 | 8,300/17,487 | 221 tick·24.3초·skip 259·dur p99 705.0 | 20.3/33.9 | **17.02** | 13.59 | 1.10 (0.70/0.40) | 399 | 57.0/151.9 |

- kick은 전 레벨 0. Windows 2000·3000의 미접속 178·1,061명은 클라 측 "handshake: Failed to connect"(TCP connect 거절)다 — 서버
  `conn_rejected`·`overload_rejected` 카운터는 없고 과부하도 꺼져 있었다. Windows listen backlog 초과로 추정하나 검증하지 않았다.
  Linux는 3000까지 전원 접속.
- Linux 3000은 빈 입력 처리(약 60,000건/s)로 메인 스레드가 0.98코어(tick 밖 0.62)에서 포화한다.
- ⁴ Linux 2500은 접속 폭주 중 85세션이 tx-backlog 가드로 닫혔다(`net_tx_backlog_close_total` 85 — ENTITY_SPAWN 537·`0x0f01` 27 프레임의
  partial write). 호스트 전체가 12/12 논리 코어로 포화한 구간이고(2000·2500·3000 폭주 때), 3000에서는 재현되지 않았다.

### 6. 단계별 비용 변화

**같은 CCU에서 2-C → 3단계** (tick당 평균 ms, 배율은 계산):

| 레벨 | 플랫폼 | 평균 tick | `dispatchSnapshots` | `runMonsterAi` | flush | tick 밖 (코어) |
|---|---|---|---|---|---|---|
| stock 300 | W | 23.0 → 6.8 (3.4배) | 16.70 → 1.37 (12.2배) | 0.06 → 0.05 | 5.36 → 4.77 (−11%) | 0.24 → 0.09 |
| stock 300 | L | 24.1 → 6.1 (4.0배) | 18.12 → 1.30 (13.9배) | 0.06 → 0.04 | 5.21 → 4.27 (−18%) | 0.15 → 0.13 |
| stock 400 | W | 30.0 → 9.7 (3.1배) | 21.45 → 2.32 (9.2배) | 0.08 → 0.06 | 7.45 → 6.58 (−12%) | 0.32 → 0.12 |
| stock 400 | L | 32.5 → 8.5 (3.8배) | 25.04 → 2.14 (11.7배) | 0.08 → 0.05 | 6.58 → 5.75 (−13%) | 0.15 → 0.15 |
| spread 500 | W | 29.7 → 11.5 (2.6배) | 18.69 → 2.71 (6.9배) | 0.07 → 0.07 | 9.77 → 7.87 (−19%) | 0.26 → 0.13 |
| spread 500 | L | 30.7 → 9.7 (3.2배) | 20.11 → 2.50 (8.0배) | 0.06 → 0.05 | 9.53 → 6.53 (−31%) | 0.17 → 0.20 |
| realistic 250 | W | 13.9 → 5.4 (2.6배) | 7.32 → 1.01 (7.2배) | 0.86 → 0.14 (6.1배) | 4.40 → 3.50 (−20%) | 0.35 → 0.17 |
| realistic 250 | L | 8.6 → 2.9 (3.0배) | 4.92 → 0.89 (5.5배) | 0.77 → 0.12 (6.4배) | 1.85 → 1.24 (−33%) | 0.23 → 0.20 |
| realistic 500 ⁵ | W | 43.5 → 11.8 | 28.47 → 2.70 (10.5배) | 1.10 → 0.16 | 11.61 → 7.65 | 0.87 → 0.46 |
| realistic 500 ⁵ | L | 47.8 → 6.5 | 38.57 → 2.47 (15.6배) | 1.07 → 0.14 | 5.46 → 2.81 | 0.66 → 0.47 |
| login-storm 1000 ⁵ | W | 72.7 → 2.9 | 70.78 → 1.55 (45.7배) | 0.23 → 0.13 | 0.11 → 0.06 | 0.40 → 0.17 |
| login-storm 1000 ⁵ | L | 76.0 → 2.5 | 73.80 → 1.54 (47.9배) | 0.24 → 0.09 | 0.13 → 0.06 | — |

⁵ 2-C가 그 레벨에서 과부하(5–12 Hz)라 2-C 쪽 tick 비용에 GC·적체가 섞여 있다 — 배율은 상한 쪽으로 읽는다.

**소켓당 송신 비용**(µs/소켓/tick = flush ÷ 연결 수, 계산):

| 시나리오 | Windows 2-C → 3단계 | Linux 2-C → 3단계 |
|---|---|---|
| stock | 100–500: 16.1–19.0 → 100: 14.4 · 300: 15.9 · 500: 16.8 · 700: 17.7 · 1000: 18.6 · 1500: 20.5 | 100–250: 6.8–6.9 · 300–500: 16.4–17.4 → 100–200(샤드 1): 5.0–5.1 · 300–500(샤드 2): 14.1–14.4 · 600–700(3): 20.9–21.0 · 800–1000(4): 22.6–22.9 · 1100–2000: 23.1–26.0 |
| spread | 250: 17.1 · 500: 19.5 · 1000: 24.2 · 1500: 27.7 → 250: 14.0 · 500: 15.7 · 1000: 17.8 · 1500: 19.4 | 250: 7.5 · 500: 19.1 · 750: 25.2 · 1000: 34.1 → 250: 4.9 · 500: 13.1 · 750: 19.9 · 1000: 22.4 · 1250–2000: 22.6–24.7 |
| realistic | 100: 17.3 · 250: 17.6 · 500: 23.2 → 100: 14.1 · 500: 15.3 · 1000: 18.3 · 1500: 23.0 | 100: 6.8 · 250: 7.4 · 500: 10.9 → 기본 배치 100–500: 5.0–5.6 · 1000: 8.0 · 1250: 9.8 / 샤드 150명: 500: 11.7 · 1000: 18.5 · 1250: 18.7 |

- **스냅샷**: 같은 CCU에서 5.5–16.5배(login-storm 46–48배). 2-C Linux의 stock 200→250 비용 계단(snap 4.65 → 13.12)은 사라졌다 —
  0.65(200) → 1.30(300) → 2.14(400)로 매끄럽다. 플랫폼 차이도 없어졌다(stock 1000: W 12.93 / L 12.57 — 2-C Linux는 최대 28% 느렸다).
  밀집에서는 여전히 인원의 거의 제곱으로 는다(stock W 500 → 1000에서 3.45 → 12.93, 계산 약 N^1.9) — 출력 자체(갱신/스냅샷 ∝ N)가 N²다.
- **몬스터 AI**: realistic에서 0.38–1.46 → 0.12–0.29 ms. 더는 tick 예산에 의미가 없다.
- **flush**: 같은 CCU에서 11–33% 줄었다. 슬라이스 5가 프레임 객체·`Buffer.concat`의 JS 몫을 없앤 결과이고, 남은 것은 거의 커널 write다.
  Windows는 배경 부하도 2-C의 절반(0.63 vs ≈1.3코어)이라 일부는 측정 환경 차이일 수 있다.
- **tick 밖**: realistic 500에서 W 0.87 → 0.46, L 0.66 → 0.47코어(슬라이스 6 코얼레싱 — 2-C에서 tick 밖 write가 sys CPU를 user보다 크게 만들던 원인).
- **비중 역전**(계산): 2-C 임계점 근처(W stock 300)는 snap 73%·flush 23%였다. 3단계 새 임계점에서는 flush가 tick 평균의
  56%(W stock 1000: 18.61 / 33.0)·62%(L stock 1000: 22.59 / 36.3)·60%(W spread 1250: 22.95 / 38.0)·67%(L spread 1125)·64%(W realistic 1000)이고
  snap은 29–39%다.

### 7. 서버 CPU

| 레벨 | W 2-C → 3단계 (u/s) | L 2-C → 3단계 (u/s) | L 메인 스레드 |
|---|---|---|---|
| stock 300 | 0.70 (0.54/0.16) → **0.23 (0.10/0.12)** | 1.23 (0.79/0.44) → **0.40 (0.17/0.23)** | 0.63 → 0.25 |
| stock 500 | 1.15 (0.95/0.20) → **0.35 (0.14/0.21)** | 1.52 (1.16/0.36) → **0.55 (0.24/0.31)** | 0.96 → 0.39 |
| spread 500 | 0.86 (0.59/0.26) → **0.36 (0.16/0.20)** | 1.44 (0.93/0.51) → **0.59 (0.28/0.31)** | 0.78 → 0.40 |
| spread 1000 | 1.32 (1.02/0.30) → **0.77 (0.37/0.40)** | 1.47 (1.04/0.43) → **1.05 (0.44/0.60)** | 0.98 → 0.87 |
| realistic 250 | 0.63 (0.37/0.26) → **0.28 (0.12/0.16)** | 0.67 (0.41/0.26) → **0.42 (0.20/0.22)** | 0.40 → 0.26 |
| realistic 500 | 1.09 (0.44/0.65) → **0.69 (0.23/0.46)** | 1.27 (0.67/0.60) → **0.81 (0.38/0.43)** | 0.98 → 0.60 |
| 포화(3단계 최상위 레벨) | 1.00–1.14 (sys 46–53%) | 1.04–1.16 (sys: stock·spread ≈50%, realistic 32–39%) | 0.96–1.00 |

- 같은 CCU의 서버 CPU는 W 1.6–3.3배, L 1.4–3.1배 줄었다(계산 — 2-C가 과부하였던 spread 1000·realistic 500은 2-C 쪽이 ≈1코어에 묶여 배율이 작다).
- **포화 지점의 user/sys가 약 50/50이다.** 2-C 과부하는 W stock·spread에서 sys 20–25%였다 — JS 몫이 줄어 남은 메인 스레드 시간의 절반이
  커널 send/recv다. 포화는 W stock ≥1200·spread ≥1250, L stock ≥1100·spread ≥1125, realistic은 650부터 프로세스 ≈1코어(W sys 0.55–0.68).
- **Linux GC 보조 스레드가 거의 사라졌다.** HeapHelper는 2-C stock 300/500·spread 1000에서 0.48–0.58코어 → 0.10–0.16. 경부하에서는
  여전히 Windows보다 CPU가 높다(stock 100: L 0.25 vs W 0.08 — HeapHelper 상시 ≈0.13–0.15).
- RSS(hold): W 262–443 MB(2-C 262–753), L 127–399(2-C 125–451). 유휴는 W ≈232–246, L 91–98로 2-C와 같다.

### 8. 부하 생성기 점검 (Linux 전용, 2-C 방법 밖)

realistic 1000–1500에서 기본 샤드(250명)가 0.76–0.85코어로 한도(0.8) 근처·초과였다(Windows는 최대 0.49). 샤드를 150명으로 줄여 다시 쟀다.

| CCU | 샤드 | p50 | p99 | Hz | flush | µs/소켓 | snap | 메인 스레드 | 샤드 최대 |
|---|---|---|---|---|---|---|---|---|---|
| 500 | 2→4 | 6.4→9.4 | 9.0→14.4 | 20.00→20.00 | 2.81→5.83 | 5.6→11.7 | 2.47→2.54 | 0.60→0.78 | 0.65→0.51 |
| 750 | 3→5 | 11.3→16.5 | 15.8→**24.7** | 20.01→20.01 | 4.80→9.81 | 6.4→13.1 | 4.93→5.11 | 0.92→0.95 | 0.74→0.61 |
| 875 | 4→6 | 14.9→23.3 | 20.6→31.1 | 20.01→20.01 | 7.05→14.49 | 8.1→16.6 | 6.20→6.65 | 0.95→0.95 | 0.72→0.60 |
| 1000 | 4→7 | 18.0→29.6 | 27.0→**37.9** | 20.00→20.02 | 8.02→18.47 | 8.0→18.5 | 8.11→8.49 | 0.97→0.94 | 0.81→0.59 |
| 1125 | 5→8 | 25.0→32.2 | 35.5→42.5 | 20.01→20.07 (1020 수용, 105 KICK 9) | 11.83→20.18 | 10.5→19.8 | 10.62→9.02 | 0.97→0.92 | 0.80→0.56 |
| 1250 | 5→9 | 27.5→41.0 | 43.9→54.0 | 19.25→**14.00** | 12.19→23.35 | 9.8→18.7 | 12.73→14.57 | 0.98→0.90 | 0.85→0.57 |

- stock 1000을 샤드 4 → 2(샤드당 500명)로 돌리면 p99 42.6 → 32.5, flush 22.59 → 14.19 ms(22.6 → 14.2 µs/소켓), snap은 그대로(12.57 → 12.38).
- 클라 부하는 두 배치가 같다(입력 20.0/s/CCU, rx 1,114–1,121 B/s/CCU, MOVE_PATH 팬아웃·갱신/스냅샷 ±5% 안). 바뀌는 것은 서버 송신 비용과
  tick 밖 sys CPU뿐이다.
- **Linux 루프백의 소켓당 flush 비용은 부하 생성기 프로세스 수와 그 바쁨에 좌우된다** — 적고 바쁜 수신자일수록 싸다. 원인은 루프백에서
  수신 처리·수신자 wakeup이 서버 send 호출 안에서 도는 것으로 추정한다(perf로 확인하지 않음).
- 샤드 150명이면 Linux realistic은 Windows와 비슷하다: 750 p99 24.7 vs W 26.9, 1000 37.9 vs 38.7, 1250 14.0 Hz vs 16.04.

### 9. Windows vs Linux (3단계)

- **경부하(샤드 1–2개)는 Linux가 낫다.** 소켓당 flush 4.9–5.6 vs 14 µs, late p99 ≈0–2 vs 17–28 ms(Windows 타이머 바닥), RTT p99 약 절반,
  lag p99 3–16 vs 27–47 ms, RSS 약 절반.
- **stock·spread 고부하는 Linux가 나쁘다.** Hz < 20이 100–250 CCU 먼저 오고(stock 1100 vs 1275, spread ≈1125 vs 1375), Hz < 15에도
  닿는다(Windows는 stock에서 미도달). 차이는 전부 flush다 — snap은 같고(stock 1000: 12.93 / 12.57), flush/소켓은 L 21–26(샤드 3개+) vs W 17–21 µs.
- **realistic의 Linux 우위는 서버가 아니라 부하 생성기 배치 효과다**(§8).
- **과부하 최상위 레벨**: 조인 중 접속 거절로 W 1301–1624명·14.4–15.9 Hz, L 1233–1530명·12.1–19.2 Hz에서 수렴. hold 중 in-world 세션 손실은
  0(rate kick·partial write·backlog close·핸들러/존 에러·unhandled rejection 0) — 예외는 Linux login-storm 2500의 접속 폭주 중 85세션(§5 ⁴).

### 10. 1단계 검증 재확인 — 정지 주입 (realistic 300, hold 60초, `stall=7000`)

hold 20초(W) / 20.5초(L) 지점에 주입, 7.00초 후 HTTP 200.

| 메트릭 | W 2-C → 3단계 | L 2-C → 3단계 |
|---|---|---|
| `tick_stall_ms` count / sum 증가 | 5→6 / +6,969 → **0→1** / +6,939 | 7→8 / +7,418 → **0→1** / +6,931 |
| `tick_skipped_total` 증가 | +169 → **+135** | +144(누적 +161) → **+135** |
| rate kick / rate drop(reserve) / 입력 overflow | 0 / 19,586(337) / 21,930 → 0 / 15,127(262) / 18,492 | 0 / 18,771(295) / 21,214 → 0 / 14,848(256) / 18,536 |
| 과부하 신호 | — → 정지에서 진입(cause `stall`, 루프 간격 7033 ms, 접속 제한 켜짐), +15초까지 해제 | — → 같음(루프 간격 7028 ms) |
| 15초 회복 창 실행 tick | ≈20.3 Hz → ≈20.3 Hz | ≈19.2 Hz → **≈20.4 Hz** |
| late < 150 ms 복귀 | 12 tick → **8 tick** | 8 → **5** |
| 정지 100 tick 후~끝 late p99 / dur p99 | 21.7 / 21.1 → 19.2 / **9.9** | 3.9 / 20.5 → **1.2 / 5.5** |
| 정지 전 late > 100 ms tick | 45 (최대 286) → **0 (최대 23)** | 46 (최대 383) → **0 (최대 3)** |
| 60초 창 Hz / skip / tick p99 | 17.12 / 173 / 28.95 → 17.75 / 135 / **10.29** | 17.07 / 176 / 32.6 → 17.75 / 135 / **5.72** |
| loadgen | 300/300·kick 0·err 0 → 같음(lag p99 7,052, RTT p99 6,560) | 같음 → 같음(lag p99 7,074, RTT p99 6,560) |

skip 증가가 기대치(≈135)와 같아졌다 — 2-C에서 넘친 몫(정지 후 버스트 캐치업)이 사라졌다. 게이트 FAIL은 이제 rate drop 탓뿐이고 tick p99는 통과한다.

### 11. zoneBench 전후 요약 (슬라이스 보고 종합)

i7-8700K Windows, bun 1.3.13. "기준"은 3단계 시작 전(커밋 `c80a2bc`, 위 "마이크로벤치 기준" 표), "후"는 그 설정을 마지막으로 잰
슬라이스의 "후" 값이다. **세션·배경 부하가 서로 달라(슬라이스 2·4는 게임 클라이언트 실행 중) 배율은 근사다** — 슬라이스 안의 전후는
"슬라이스별 전후" 표가 정확하다.

| 설정 (플레이어·몬스터) | tick 평균 기준 → 후 (배율, 계산) | `dispatchSnapshots` | `runMonsterAi` |
|---|---|---|---|
| dense 1000·0 | 101.42 → 6.16 (S7) — 16.5배 | 99.56 → 5.15 | — |
| dense 1000·2000 | 140.44 → 7.61 (S7) — 18.5배 | 117.69 → 5.92 | 18.86 → 0.28 (S3) |
| dense 500·600 | 35.37 → 2.27 (S8) — 15.6배 | 31.19 → 1.56 (S7) | — |
| dense 200·2000 | 9.15 → 1.03 (S7) — 8.9배 | 4.65 → 0.28 | — |
| spread 2000·4000 | 38.98 (S3 전) → 9.20 (S7) — 4.2배 | 13.40 (S5 전) → 3.51 | 16.80 → 1.33 (S3), S4 후 ≈1.5 |
| spread 1000·2000 | 16.14 → 3.89 (리뷰 픽스) — 4.1배 | 7.81 → 1.45 (S7) | 4.25 → 0.84 (S3) |
| spread 1000·0 | 10.92 → 1.84 (S7) — 5.9배 | 8.56 → 1.04 | — |
| spread 500·2000 | 13.92 → 4.31 (S5) — 3.2배(S6·S7 전) | — | 5.51 → 0.74 (S3) |
| spread 200·600 | 2.63 → 0.93 (S7) — 2.8배 | 1.21 → 0.26 | 0.53 → 0.22 (S3) |

| 지표 | 전 | 후 |
|---|---|---|
| A* zone 1 / zone 2 `findPath` 평균·p99 µs (S1, 경로 checksum 불변) | 56.7·579 / 41.9·118 | 15.5·100 / 20.9·47 |
| MOVE_TO 1건 µs (K=10 / 50 / 200) · write 수 | 127 / 146 / 390 µs · 11 / 51 / 201 (기준) | 40.7 / 35.5 / 51.4 µs (S8) · 1 / 1 / 1 (S6) |
| 어그로 질의 tick 1회분 ms, 전원 idle (1000·2000 / 2000·4000, S3 마이크로벤치) | 22.3 / 86.2 | 0.20 / 0.36 |
| tick당 할당 MB (dense 500·600 / spread 1000·2000) | 73.6 / 12.2 (S4 전) | 6.92 / 1.89 (S7 후) |
| GC 정지 ms / 1,000 tick (dense 500·600 / spread 1000·2000) | 6,286 / 1,635 (S5 전) | 363 / 252 (S7 후) |
| `flush` 평균 ms (spread 2000·4000 / 1000·2000, dense 500·600, S5) | 1.54 / 0.74 / 0.56 | 0.53 / 0.25 / 0.13 |

- 슬라이스별 기여: dense는 S7(AOI·스냅샷 DoD, dispatch 13–16.7배)이 대부분이고, S5(1회 인코딩·outbox)가 dispatch 10–20%·flush 3–4배를 보탰다.
  몬스터가 많은 spread는 S3(어그로 그리드, `runMonsterAi` 2.1–14.6배)가 가장 컸고, S7이 dispatch 3.1–3.7배를 더했다. S2(`viewersOf`·처치
  역인덱스)는 전투 단계(`runCombat` spread 1000·2000 1.32 → 0.79)·이벤트당 O(P) 제거, S4(할당 제거)는 tick당 0.2–2.3 MB·`runSystems` 15–20%,
  S6은 tick 밖 write 수(MOVE_TO K+1 → 1)가 효과다 — zoneBench tick에는 거의 안 보이고 loadgen realistic에서 보인다(위 표·슬라이스 6 행).
- **몬스터 AI 목표(2,000/4,000에서 1 ms 미만)는 미달.** 질의 비용은 사라졌지만(86.2 → 0.36 ms) 추격·복귀 몬스터 상태기계의 Map 조회
  (몬스터당 약 7회)가 남아 spread 2000·4000에서 평균 1.33(p50 1.03)–1.5 ms다. 컴포넌트를 typed array로 바꾸는 작업이 필요한데, 실측
  부하(realistic 608마리)에서는 0.12–0.29 ms라 우선순위가 낮다.

### 12. 선행 연구 예측 대비 (`final.md` §4.2·§4.3)

| 항목 | 선행 연구 예측 | 3단계 실측 | 판정 |
|---|---|---|---|
| **밀집 tick 배율** (§4.2 B: 밀집 400 평균 29.6 → 7.5–7.9 ms, **3.7–3.9배**) | snap 21.2 → 1.4–1.8 (K2 11.9–14.8배), 나머지 JS 2.5 → 0.2–0.25, 커널 send 5.9 불변 | stock 400 평균 W 30.0 → 9.7 (**3.1배**), L 32.5 → 8.5 (**3.8배**). snap W 21.45 → 2.32 (9.2배) / L 25.04 → 2.14 (11.7배)(stock 300은 12.2 / 13.9배), flush W 7.45 → 6.58 / L 6.58 → 5.75 | L은 범위 안, W는 미달 — snap이 예측 하단보다 덜 줄고 flush가 커널 몫 예측(5.9)보다 크다 |
| **분산 tick 배율** (§4.2 A: 무클램프 분산 1,250, 평균 36.3 → 21.9–22.8 ms, **1.6–1.7배**) | snap 12.1 → 2.2–2.9 (K2 분산형 4.2–5.6배), 커널 send 19.4 불변 | **직접 비교 불가** — 2-C·3단계 spread는 Town 클램프(500 CCU 갱신/스냅샷 166 — 선행 무클램프의 가시 엔티티 14.5의 약 11배)이고 무클램프는 재지 않았다. 클램프 spread 500: W 29.7 → 11.5 (2.6배), L 30.7 → 9.7 (3.2배). snap W 6.9배·L 8.0배 | 같은 부분별 배율을 2-C spread 500 W 구성(snap 63%·flush 33%, flush의 89%를 커널로)에 적용하면 [계산] 12.2–13.4 ms = 2.2–2.4배 — 실측 2.6배가 약간 위. 예측 1.6–1.7배보다 큰 것은 시나리오의 스냅샷 비중 차이로 설명된다 |
| **밀집 수용 CCU** (§4.3: Bun 최적화 1프로세스, 마을 밀집 플레이어만 **약 690–800**, 1 GbE 실효 약 700) | — | stock p99 > 25 ms: W **≈720**, L **≈705** | **범위 안** |
| **1 GbE 상한** (N명 전원 매 tick 이동 시 약 700) | — | stock 송신 합계 [계산] 700: 149,930 × 700 = 105.0 MB/s(0.84 Gbit/s), 800: 137.1 MB/s(1.10 Gbit/s) — 1 GbE 선로 속도(125 MB/s)를 700–800 사이에서 넘는다. 루프백이라 측정엔 걸리지 않았다 | **일치** — 실제 NIC에서는 밀집 임계가 tick이 아니라 대역폭에서 먼저 온다 |
| **분산 수용 CCU** (§4.3: 670 → 약 1,000–1,100) | — | 무클램프 미측정. 클램프 spread ≈745 (W)/≈750 (L), 2-C 대비 2.2 / 2.0배 | 공백 |
| **몬스터 섞인 밀집 핫스팟** (§4.3: 약 330) | — | 대응 시나리오 없음. realistic(608마리·배회·사냥, 핫스팟 아님)은 ≈700 (W) / ≈755(샤드 150)–960 (L) | 비교 불가 |
| **몬스터 AI** (계획: 2,000/4,000에서 25 ms → 1 ms 미만, K1 TS 최적화 86.1 → 6.1 ms) | — | 어그로 질의 86.2 → 0.36 ms(예측 6.1보다 훨씬 작음). `runMonsterAi` 전체 16.80 → 1.33(p50 1.03)–1.5 ms | 질의는 예측 상회, 1 ms 목표 미달 |
| **스냅샷 커널** (§4.1 K2: 분산형 4.2–5.6 / 밀집형 11.9–14.8배) | — | loadgen spread 500 6.9 / 8.0배, stock 300 12.2 / 13.9배, login-storm 46–48배. zoneBench dense 13–16.7배(S7)·spread 3.1–3.7배(S7, S5의 10–20% 별도) | 대체로 범위 이상 |
| **A\*** (§4.1 I3: TS 최적화 2.94–7.31배) | — | zone 1 평균 3.7배(56.7 → 15.5 µs), zone 2 2.0배(41.9 → 20.9) | zone 1 범위 안, zone 2 하단 미달 |
| **Linux 민감도** (§4.4: send 비용이 절반이면 Bun 최적화 2.0–2.2배) | — | Linux 루프백 flush/소켓은 샤드 1개 5 µs지만 3개 이상 21–26 µs로 Windows(17–21)보다 크다. 임계 CCU는 p99 기준 W와 비슷하고 Hz는 더 먼저 떨어진다 | 가정이 루프백에서는 성립하지 않음(실제 NIC 미측정) |

정리: 선행 연구의 핵심 판단 — "Bun 최적화로 스냅샷·시뮬 JS 비용은 크게 줄고 커널 send가 남아 지배 비용이 된다" — 은 그대로 확인됐다.
예측과 어긋난 것은 (a) Windows 밀집 배율이 예측 하단보다 약간 낮은 것, (b) Linux 송신이 싸다는 가정(루프백 한정), (c) 몬스터 AI 1 ms다.

### 13. 남은 병목 — 4단계(게이트웨이 분리) 판단 입력

1. **소켓당 send가 stock·spread의 한계다.** 새 임계점에서 flush가 tick 평균의 56–67%이고(§6), 소켓당 W 14–21 µs·L 21–26 µs(샤드 3개+)로
   2-C(W 16–28, L 16–37)와 같은 범위다. 메인 스레드가 ≈1코어에서 포화할 때 sys가 절반이다(§7). 스냅샷·시뮬 쪽 JS를 더 줄여도 이 몫은 그대로다.
2. **realistic은 tick 밖 작업(대부분 sys)이 한계다.** 650 이상에서 프로세스 ≈1코어(W sys 0.55–0.68 — 650–1000의 tick 점유는 0.33–0.58코어, L 650–1000 메인 스레드 0.86–0.97 중 tick 밖 0.60–0.69)다.
   MOVE_PATH 팬아웃이 인원의 거의 제곱으로 는다(W 500: 32.5k/s → 1000: 122k/s → 1500: 204k/s, L 1250: 173k/s)
   — 턴 끝 코얼레싱 후에도 wr/s/CCU가 35–75로 stock(21)보다 많다. 핸들러(A*, 팬아웃 수신자 열 생성) 몫과 소켓 I/O 몫의 분리는
   프로파일이 없어 미확인이다.
3. **밀집은 스냅샷 출력 자체가 N²다**(stock snap 약 N^1.9, §6). 1 GbE NIC에서는 700–800명에서 대역폭이 먼저 한계다(§12) — 게이트웨이로 풀리지
   않는다(AOI 가시 상한 같은 설계 변경이 필요).
4. **수신 경로**: Linux login-storm 3000은 빈 입력 약 60,000건/s로 메인 스레드가 포화(tick 밖 0.62)하고, Windows는 2000명 이상 동시 접속에서
   클라 connect 거절(backlog 추정)이 난다 — 게이트웨이가 프레이밍·rate·accept를 나누면 같이 줄어든다.
5. **몬스터 AI·A*·GC는 더는 병목이 아니다**(realistic AI 0.12–0.29 ms, Linux HeapHelper 0.10–0.16코어).

**게이트웨이 분리의 기대치 [계산, IPC 비용 미측정 — 4.0 검증 항목]**: flush가 월드 프로세스에서 빠지면 월드 tick 평균은 W stock 1000 약
14.4 ms(33.0 − 18.61), W spread 1250 약 15.0 ms(38.0 − 22.95), L spread 1250 약 15.4 ms(43.6 − 28.19), W realistic 1000 약 10.4 ms(28.7 − 18.29)에
IPC 비용을 더한 값이 된다. 4단계 합격선(게이트웨이 2개가 spread CCU 1.6배)은 spread ≈745 × 1.6 ≈ 1,190명에서 p99 25 ms 이하다. 3단계
spread의 p99/평균(750: 25.9 / 19.1 = 1.36)이 유지된다고 가정하면 평균 예산은 약 18.4 ms이고, 1250명에서 월드에 남는 15.0 ms를 빼면 IPC
몫은 tick당 약 3.4 ms — 세션당 약 2.7 µs로 지금 소켓당 send(18.4 µs)의 약 15% 이내여야 한다. 게이트웨이당 봉투 1개(write 수 N → G)
설계라면 가능한 범위로 보이지만, 확정은 4.0 IPC 스파이크(tick당 400 KB를 G개로 송신) 실측에 달려 있다. realistic의 tick 밖 sys도
상당 부분 게이트웨이로 옮겨질 것으로 보이나 2번의 분리가 미확인이다. 밀집의 대역폭 한계(3번)와 스냅샷 N²는 게이트웨이와 무관하다.

→ **실측(4.4)**: 아래 "성능 4단계 — 게이트웨이 분리". 게이트웨이 2개 spread ≈1,101 / monolith ≈716 = 1.54배(합격선 근소 미달). 월드 IPC
비용은 세션·tick당 3.0–3.4 µs로 위 예산(≈2.7 µs)을 넘었고, p99/평균이 1.36이 아니라 1.45–1.6으로 뾰족해 평균 예산도 더 작았다.

### 이상·주의

1. **Linux realistic 수치는 부하 생성기 배치에 따라 낙관적이다**(§8). 플랫폼 비교는 샤드 150명 값으로 읽는다.
2. **WSL2 루프백 ≠ 실제 NIC.** Linux flush 비용은 수신 프로세스 수·바쁨에 좌우된다. 실제 NIC 송신 비용과 대역폭 한계는 재지 않았다.
3. **과부하 보호 기본값**: 용량 초과 레벨은 접속 수가 CCU보다 적다. 2-C와 같은 조건으로 그 레벨을 비교하려면 `--server-env OVERLOAD_ADMISSION=0`이
   필요하다(이번 측정은 기본값). spread 1500은 두 측정 모두 전원 접속이라 비교할 수 있다.
4. Windows 배경 부하가 2-C의 절반(0.63 vs ≈1.3코어)이다 — 경부하 flush·CPU 감소 일부는 환경 차이일 수 있다.
5. 용량 근처 재현성: 교차점은 1회 측정 레벨이 많아 ±수십 CCU로 읽는다(예: W stock 1200은 Hz 19.98이지만 정지 12회, L realistic 1125는 20.01이지만 정지 2회).
6. zoneBench 요약(§11)은 슬라이스마다 세션이 달라 근사다.

**공백**: 무클램프 분산(선행 ≈670 / 예측 1,000–1,100과의 직접 비교), 실제 NIC·대역폭, CPU 프로파일(realistic tick 밖의 핸들러/IO 분리),
Windows 스레드별 CPU, 자동저장 재측정(2-C §7 — 3단계는 자동저장 경로를 바꾸지 않았다), Windows login-storm connect 거절 원인,
몬스터 AI 1 ms 미만.

### 원자료

측정 PC의 로컬 scratch(레포 밖, 세션 임시 경로 — 보존이 필요하면 따로 옮길 것):
`<측정 PC 임시 폴더>/stage3/`

| 경로 (위 기준) | 내용 |
|---|---|
| `windows/` | 시나리오 폴더 `stock-{r3,r1,ext,refine,refine2}/`·`spread-{r3,r1,refine,refine2}/`·`realistic-{r3,r1,refine,refine2}/`·`login-storm{,-ext}/`·`stall/`(레벨별 `level-*.json`·`raw-*.json`·서버/샤드 로그·`summary.md`, stall은 전후 메트릭·`stall-ring-analysis.txt`), 집계 `agg-stage3-vs-2c.md`, 스크립트 `agg3.ts`·`run.sh`·`stall-inject.sh`, `monsters.perf.json`, `runs.log`, `cpu-total.csv` |
| `linux/` (원본 WSL `~/perf-s3`) | 같은 구성 + `stock-ext2/`·`realistic-ext/`·`login-storm-refine/`, 부하 생성기 점검 `lgcheck/`, 집계 `final-tables.md`·`agg-stage3-vs-2c-linux.md`·`agg-stage3-win-vs-linux.md`·`extra-linux.md`, `/proc` 샘플 `proc-samples.jsonl`·`proc-threads.txt`, `prehold-analysis.txt`, 스크립트(`orch.sh`·`procsampler.py`·`final-tables.ts` 등) |
| `s1/`–`s8/` | 슬라이스별 zoneBench·loadgen 전후 원자료(`ab/`·`gc/`·`lg/`·비교 스크립트) |
| `bench-before.json` | 3단계 시작 전 zoneBench 18개 설정 |

## 성능 4단계 4.1 — 이음새 리팩터 전후 확인 (Windows, 2026-10-07)

4.1(엣지·디코드·수명주기 분리, ClientLink 이음새)은 동작·와이어 바이트 불변 리팩터다. 종료 조건 "loadgen ±3% 이내"를 3단계 측정과
같은 도구(`tools/loadgen/orchestrate.ts --spawn-server`, 20초 hold, 레벨당 3회)로 확인했다. 전 = `883c51b`, 후 = `16dc58b`.

| 시나리오 | tick mean 전 → 후 (ms) | flush mean 전 → 후 (ms) | tick p99 전 → 후 (ms) | Hz |
|---|---|---|---|---|
| stock 300 | 6.752 → 6.724 (−0.4%) | 4.727 → 4.699 (−0.6%) | 9.50 → 9.26 | 20.01 / 20.01 |
| spread 750 | 19.590 → 19.243 (−1.8%) | 12.775 → 12.514 (−2.0%) | 26.85 → 24.25 | 20.00 / 20.00 |
| stock 300 교차 A/B(`883c51b` 워크트리 ↔ `16dc58b`, 3쌍) | 6.780 → 6.825 (+0.7%) | 4.746 → 4.740 (−0.1%) | — | — |

- 서버 CPU(stock 300)는 런 간 편차가 커서(0.17–0.23코어) 결론을 내지 않았다. 대신 수신 경로를 마이크로벤치로 비교했다(INPUT_CMD 1프레임/청크,
  noop dispatch, 50만 회 × 7 중앙값): 운영 data 콜백 경로 508–516 → 511–516 ns/frame(동등). 테스트·`tools/perf` 진입점
  `tcpServer.ingestChunk`는 처리기 조회 탓에 +17 ns였고, 직전 dispatch 재사용(`de6ea76`)으로 +5–9 ns(1–2%)로 줄였다.
- 원자료: 위 scratch의 `stage41/`(`before-*`·`after-*`·`ab/`, 집계 `summ.ts`, 마이크로벤치 `ingestBench*.ts`).

## 성능 4단계 — 게이트웨이 분리 (monolith vs world+N gateways)

> **측정일 2026-10-07 · 커밋 `40d2b67`** (`bun-to-cpp-server`, 레포 무수정 — WSL `~/mmorpg`는 이 워크트리의 `.git`이 WSL에서 못 읽는
> `F:` 경로를 가리켜 `/mnt/f/GitHub/mmorpg`에서 fetch해 `40d2b67`로 맞췄다, `git status` clean). Linux 12:17–13:51 KST,
> Windows 13:52–13:56. 수치는 4.4 측정 보고에서 옮겼다. "≈"는 레벨별 중앙값 사이의 선형 보간, "계산"은 그 수치끼리의 산술,
> "—"는 미측정이다. 결정 기록은 [ADR 0002](adr/0002-gateway-split.md), 운영 가이드는 [`ops-cluster.md`](ops-cluster.md).

### 요약

- **합격선은 근소하게 미달이다.** 기준은 "게이트웨이 2개가 monolith spread CCU의 1.6배 이상, p99 ≤ 25 ms, 게이트웨이 사용률 ≤ 60%"다.
  N=2는 ≈1,101 CCU, monolith는 ≈716 CCU라 **1.54배**다(같은 핀 고정·같은 프로브). 1.6배에는 ≈1,146이 필요했지만 1150은 3회 모두
  27.2–27.4 ms로 실패했다. 게이트웨이 사용률은 통과했다(메인 스레드 0.41–0.44코어).
- **한계는 게이트웨이가 아니라 월드 tick이다.** N=2/1100의 평균 tick 16.9 ms 중 스냅샷이 11.9 ms, IPC 프레이밍이 3.1 ms다.
- **월드 IPC 비용이 설계 예산을 넘는다.** 세션·tick당 3.0–3.4 µs로 예산 ≤ 2.7 µs보다 크고, tick의 18–20%다. 보류해 둔
  MULTICAST(공유 페이로드)의 트리거(10%)를 넘었다.
- **게이트웨이를 늘리면 월드가 느려진다.** 그래서 N=3(≈1,062)·N=4(≈1,065)가 N=2보다 먼저 교차한다.
- 클러스터 구성은 p99 45 ms에서도 1500까지 20 Hz를 지켰다. monolith는 1250에서 16.92 Hz로 떨어졌다. spread 1000의 전달 분산 p50은
  19.8 ms(monolith)에서 7.3 / 4.1 / 3.4 ms(N=2/3/4)로 줄었다.
- Windows 기능 검증과 카오스(수동 스모크·자동 C1)는 통과했다.

### 환경

| 항목 | 값 |
|---|---|
| 머신 | i7-8700K 6C/12T(CPU 쌍 0/1, 2/3, … 이 물리 코어 하나를 공유), 4.0과 같은 PC |
| Linux | WSL2 Ubuntu 22.04.3, `6.18.40.1-microsoft-standard-WSL2`, 12 vCPU, bun 1.3.13 |
| Windows | Windows 11, bun 1.3.13 — 기능 검증만(성능 스윕 없음) |
| 배경 부하 | Windows 호스트 ≈13%(≈1.6 논리 CPU — 작업 관리자·Orca·remoting_host), 3단계(0.8)의 약 2배 |

### 방법

- **하네스**: `orchestrate.ts --duration 30`, 조인 100/s, 샤드당 250명, settle 3초, 레벨마다 새 서버, `:memory:` DB, 과부하 보호
  켜짐(기본값). `WORLD_IPC`는 기본값 `tcp://127.0.0.1:19500`, Linux의 게이트웨이 전원은 reusePort로 포트 19000을 공유했다.
- **핀 고정**: 측정자 스크립트 `pinmon.py`가 프로세스마다 모든 스레드를 역할별로 고정하고 스레드별 CPU를 샘플링했다.

  | 대상 | CPU |
  |---|---|
  | 월드 / monolith | 2,3 (물리 코어 1) |
  | 게이트웨이, N=1–2 | gw1 4,5 · gw2 6,7 — 각자 물리 코어 하나 |
  | 게이트웨이, N=3–4 | 4,5,6,7에 하나씩(논리 CPU 1개) — 물리 코어 2–3을 공유하는 하이퍼스레드 형제. 물리 코어 6개에 프로세스 5–6개 + 부하 생성기를 따로 앉힐 수 없어서다 |
  | 부하 생성기·오케스트레이터·슈퍼바이저·프로브 | 0,1,8–11 (물리 코어 0·4·5), 모든 구성 공통 |

- **로그인 해시를 월드 코어 밖으로**: 월드의 "Bun Pool" 스레드가 DevAuto 로그인의 bcrypt를 돈다. CPU 2,3에 묶었더니 조인이 ≈38/s로
  막혀(300 CCU 핸드셰이크 p99 6.8초) 부하 생성기 CPU로 옮겼다. hold 창 동안 이 스레드들의 CPU는 최대 0.012코어다.
- **전달 분산 프로브**: 램프 동안 고르게 퍼져 접속하는 idle 프로브 클라 20개. 분산 = 같은 tickIndex가 프로브 사이에 도착한
  마지막 − 처음 시각이다. 20개 모두가 받은 hold 창 tick만 센다.
- **반복**: 레벨당 1회, 교차점 근처는 3회를 더 쟀다(monolith 600/700/750/800, N=2 1050/1100/1150/1200).
- **표기**: "IPC 프레이밍" = 월드의 flush 단계(나가는 클라 프레임을 게이트웨이별 배치에 쓰는 시간), "ipcFlush" = tick 끝에 그 배치를
  게이트웨이로 보내는 시간이다. snap = `dispatchSnapshots`. "서버 코어"·"월드 메인"·"gw 메인" = 프로세스·메인 스레드 코어.

### 임계점 (Linux, 레벨별 중앙값 보간)

| 시나리오 | monolith | N=1 | N=2 | N=3 | N=4 |
|---|---|---|---|---|---|
| spread p99 > 25 ms | **≈716** (700: 34.7/24.3/23.6 · 750: 26.8/26.4/25.7/26.5) | ≈916 | **≈1,101** (1100: 22.8/27.3/24.9 · 1150: 27.4/27.3/27.2) | ≈1,062 | ≈1,065 |
| spread p99 > 50 ms | ≈1,088 | ≈1,286 | ≈1,586 | ≈1,509 | ≈1,523 |
| spread Hz < 20 | 1250 (16.92 — 1000은 19.99) | 1500 (19.64, 게이트웨이 끊김) | 2000 (17.14) | 2000 (13.13) | 2000 (12.64) |
| realistic p99 > 25 ms | ≈802 | ≈940 | ≈972 | ≈897 | ≈931 |
| realistic Hz < 20 | 1000 (19.88) | 1250까지 미도달, 1500에서 게이트웨이 끊김 | 1500 (16.39) | 1250 (19.47) | 1250 (19.62) |
| stock p99 > 25 ms | ≈662 | ≈1,018 | ≈950 | ≈860 | ≈835 |
| stock Hz < 20 | 1200 (16.88) | 1200 이하 없음 | 1200 이하 없음 | 1200 이하 없음 | 1200 이하 없음 |

### 1. spread — monolith

| CCU | tick p50/p99 | Hz | snap | flush | 서버 코어 (u/s) | RTT p50/p99 | 전달 분산 p50/p99 |
|---|---|---|---|---|---|---|---|
| 750 | 21.4/26.8 | 20.00 | 5.80 | 14.88 | 0.68 (0.35/0.33) | 2.6/25.0 | 14.0/17.3 |
| 1000 | 32.1/43.8 | 19.99 | 10.15 | 21.22 | 0.93 | 15.6/69.3 | 19.8/24.5 |
| 1250 | 44.5/61.5 | 16.92 (skip 92) | 15.80 | 26.57 | 1.06 | 64/116 | 24.9/31.7 |
| 1500 | 56.7/82.1 | 12.92 | 21.86 | 32.07 | 1.07 | 88/158 | 29.9/39.1 |

2000/2500/3000은 과부하 접속 제한이 조인을 거절했다: 211/701/1184명이 KICK 9를 받았고, p99 89.7/93.7/104.0 ms, 10.5–9.6 Hz다.

### 2. spread — 월드 + 게이트웨이

| 구성/CCU | tick p50/p99 | snap | IPC 프레이밍 | ipcFlush 평균/p50/p99 | 월드 메인 | IPC KB/tick | gw 메인(각) | DELIVER 평균 ms | 연결(편차) | RTT p50/p99 | 전달 분산 p50/p99 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| N=1 750 | 8.3/15.3 | 6.16 | 1.55 | 0.11/0.09/0.28 | 0.39 | 2636 | 0.48 | 0.59 | 770 | 2.6/26.0 | 14.3/20.5 |
| N=1 1000 | 15.1/29.9 | 11.50 | 2.89 | 0.12/0.10/0.39 | 0.55 | 4627 | 0.66 | 1.01 | 1020 | 17.6/64.1 | 21.6/38.2 |
| N=1 1250 | 21.9/43.6 | 16.86 | 4.09 | 0.02/0.01/0.38 | 0.64 | 7005 | 0.80 (136 MiB/s) | 1.61 | 1270 | 45/95 | 28.5/43.9 |
| N=2 750 | 8.3/14.0 | 6.02 | 1.52 | 0.14/0.12/0.40 | 0.43 | 2621 | 0.27/0.26 | 0.26 | 394/376 (4.7%) | 0.6/14.4 | 3.8/7.2 |
| N=2 1000 | 13.5/20.5 | 9.81 | 2.75 | 0.13/0.11/0.33 | 0.56 | 4606 | 0.35/0.35 | 0.38 | 498/522 (4.7%) | 1.7/23.1 | 7.3/11.7 |
| N=2 1100 ×3 | p99 22.8/27.3/24.9 | 11.4–12.1 | 3.05–3.15 | 0.31–0.34 (p99 0.67–0.99) | 0.61–0.62 | ≈5570 | 0.41–0.42 | — | ≤3% | — | 9.0–9.5/13.8–15.1 |
| N=2 1250 | 20.6/29.1 | 15.03 | 4.04 | 0.23/0.21/0.58 | 0.67 | 7146 | 0.45/0.44 | 0.58 | 646/624 (3.5%) | 8.3/32.9 | 10.9/17.3 |
| N=2 1500 | 29.0/44.7 (20.01 Hz) | 21.60 | 5.94 | 0.27/0.24/1.01 | 0.81 | 10171 | 0.52/0.55 | 0.86 | 731/789 (7.6%) | 19.8/87.7 | 15.2/21.4 |
| N=3 1000 | 13.8/22.3 | 9.93 | 2.63 | 0.41/0.39/1.04 | 0.61 | 4589 | 0.27–0.29 | 0.31 | 9.4% | 1.2/23.1 | 4.1/8.3 |
| N=3 1250 | 21.4/33.2 | 15.14 | 4.57 | 0.32/0.30/0.82 | 0.73 | 7177 | 0.34–0.36 | 0.44 | 9.2% | 5.4/32.9 | 7.2/12.7 |
| N=4 1000 | 14.6/21.0 | 10.44 | 2.87 | 0.35/0.30/1.33 | 0.61 | 4701 | 0.21–0.23 | 0.28 | 14.1% | 1.5/22.2 | 3.4/7.0 |
| N=4 1250 | 21.9/36.4 | 15.76 | 4.31 | 0.96/0.91/2.13 | 0.78 | 7095 | 0.29–0.31 | 0.45 | 10.7% | 5.4/37.0 | 5.0/13.1 |

- N=3·N=4의 1500은 p99 49.3 / 47.8 ms다. 2000은 88.7 / 96.7 ms, 13.1 / 12.6 Hz이고 월드 메인 스레드는 0.98코어다.
- 부하 생성기 샤드는 spread에서 최대 0.36코어였다 — spread의 한계는 부하 생성기가 아니다.
- 전원이 접속한 spread 레벨의 kick은 0이다. 예외는 아래 "이상·주의" 1·7의 게이트웨이 끊김과 과부하 접속 거절이다.

### 3. 합격선 판정 — 미달(근소)

- **배율**: 같은 핀 고정·프로브에서 N=2 ≈1,101 / monolith ≈716 = **1.54배**. 1.6배에는 ≈1,146이 필요하고 1150은 3회 모두 실패했다
  (27.2–27.4 ms).
  - 세는 방식에 따라 1.50–1.57배다. "과반 런이 ≤ 25 ms인 레벨"로 세면 1100 / 700 = 1.57배다.
  - "모든 런이 ≤ 25 ms"로 세면 1050 / 600 = 1.75배지만, 700의 한 런(r1, 34.7 ms)이 이상치라 이 값은 믿을 수 없다.
  - 3단계의 핀 미고정 Linux monolith(≈750) 대비로는 1.47배다.
- **게이트웨이 사용률: 통과.** 1100–1150에서 게이트웨이 메인 스레드는 각 0.41–0.44코어, 프로세스는 0.44–0.48코어(sys ≈0.29)다.
- **미달 원인 — 월드 tick.** N=2/1100의 평균 tick 16.9 ms는 스냅샷 11.9, IPC 프레이밍 3.1, ipcFlush 0.3, applyInputs 0.8, 나머지
  0.75 ms로 나뉜다.
- **p99가 monolith보다 훨씬 뾰족하다.** p99/평균이 1.45–1.6배다(monolith 1.25–1.33배). 원인은 스냅샷 단계다(평균 11.9 ms, p99 18–19 ms).
  3단계 §13의 예산은 p99/평균 1.36을 가정해 평균 ≈18.4 ms였다. 1.45–1.6배면 p99 25 ms에 허용되는 평균은 ≈15.6–17.2 ms다[계산: 25 / 1.6, 25 / 1.45].
- **월드 IPC 비용이 예산을 넘는다.** 1100–1250에서 세션·tick당 3.0–3.4 µs(IPC 1 MB당 ≈0.62–0.65 ms)로, 설계 예산 ≤ 2.7 µs보다 크다.
- **보류한 MULTICAST·공유 페이로드의 트리거를 넘었다.** 1100–1250에서 월드 IPC 비용이 tick의 18–20%로, 트리거 10%를 넘는다.
- **게이트웨이를 늘리면 월드가 느려진다.** stock 1000(모든 구성에서 10.7 MB/tick)의 IPC 프레이밍은 N=1–4에서 3.3 / 4.7 / 5.8 / 6.2 ms,
  ipcFlush는 0.01 / 0.12 / 0.45 / 0.93 ms다. N=3·N=4가 N=2보다 낮게 교차하는 이유다.

### 4. realistic·stock 요약 (레벨당 1회)

- **realistic p99 (ms)**
  - monolith: 750 21.3 · 1000 39.2 · 1250 44.5 · 1500 52.6 (12.6 Hz)
  - N=2: 750 15.9 · 1000 26.1 · 1250 41.3 · 1500 52.1 (16.4 Hz)
  - N=3 / N=4: 750 ≈16 · 1000 31.4 / 28.4 · 1250 52.3 / 48.7
  - 모든 구성에서 1250에 월드 메인 스레드가 ≈1.0코어다 — realistic은 월드 CPU가 한계다.
- **stock p99 (ms)**
  - monolith: 600 21.4 · 800 32.8 · 1000 46.0 · 1200 57.3
  - N=1: 600 10.2 · 800 16.8 · 1000 23.7 · 1200 38.1 — 게이트웨이 1개가 1220 연결·298 MiB/s를 0.87코어로 처리했다.
  - N=2: 600 11.7 · 800 18.6 · 1000 27.2 · 1200 40.9
  - N=3 / N=4: 1000 39.0 / 39.3
- **IPC 바이트/tick**

  | 시나리오 | 레벨 | MB/tick |
  |---|---|---|
  | spread | 750 / 1000 / 1250 / 1500 | 2.6 / 4.6 / 7.1 / 10.2 |
  | stock | 600 / 800 / 1000 / 1200 | 3.9 / 6.9 / 10.7 / 15.3 |
  | realistic | 750 / 1000 / 1250 / 1500 | 2.2 / 3.4 / 5.0 / ≈8 |

### 5. Windows 기능 검증 — 통과

- **클러스터 실행**: `--spawn-cluster 2`, 게이트웨이별 포트(19000/19001, admin 19090–19092, IPC tcp 19500), realistic 500, 30초.
  - 500/500 접속, kick 0, 오류 0, 조기 종료 0. 위반·오류 카운터가 모두 0이다: rate, size, decode, handler, zone tick, unhandled
    rejection, partial write, backlog close, input overflow, skipped ticks, stall.
  - 게이트 전부 통과. 월드 tick p50 5.9 / p99 11.5 ms, 20.00 Hz, 월드 0.31코어.
  - 게이트웨이는 250/250으로 나뉘었고 각 0.44 / 0.43코어, DELIVER 평균 1.45 / 1.41 ms. IPC 1088 KB/tick, RTT p50/p99 6.9/25.0 ms.
  - 월드 로그의 error 레벨 줄은 0이다. 보이는 ack 오류 코드는 게임플레이 결과이고 게이트가 세지 않는다.
- **카오스 스모크**: realistic 300, hold 12초째에 gw1(150명)을 강제 종료했다.
  - 월드가 ≈1초 안에 "gateway lost — its client sessions closed"(150 세션)를 남겼다.
  - 슈퍼바이저가 "process exited — restarting"(백오프 500 ms)을 남겼고, 새 gw1이 19000에서 리스닝하고 월드의 IPC 피어 수가 2로
    돌아오기까지 ≈1초였다.
  - gw2의 150명은 영향이 없었다. 월드 tick p99 5.5 ms, 20.02 Hz, 오류 카운터 모두 0.
  - 부하 생성기는 조기 종료 150, kick 0, 오류 0을 봤다. 죽은 프로세스는 KICK 프레임을 보내지 않으므로 그 게이트는 이것만으로
    실패한다(예상대로).
- **자동 C1 카오스**: Windows에서 `CLUSTER_TESTS=1 bun test tests/cluster/chaosGatewayKill.test.ts` — 1 pass, 307 expect, 5.9초.

### 이상·주의

1. **포화한 게이트웨이는 통째로 끊긴다.** 게이트웨이가 밀리면 미전송 IPC가 256 MiB를 넘는 순간 월드가 그 게이트웨이를 끊는다
   ("pending 268,504,570 > cap 268,435,456"). 그 게이트웨이의 클라 전원이 KICK 6을 받는다.
   - 사례: N=1 spread 1500(1500명 전원)·realistic 1500/2000, N=2 spread 2000(960명), N=3·N=4 spread 3000.
   - 월드의 과부하 접속 제한은 월드 tick skip에만 반응한다. 게이트웨이에는 skip이 없으므로 포화한 게이트웨이가 끊길 때까지 새 클라가
     계속 그쪽에 붙는다.
   - 게이트웨이 1개는 spread 1250–1500 연결 근처에서 포화한다(1270에서 0.80코어, 136 MiB/s). stock에서는 1220 연결·298 MiB/s를
     0.87코어로 처리했다 — 게이트웨이 비용은 바이트가 아니라 write 수가 정한다.
   - 구현 기본값 `IPC_MAX_PENDING_MB`는 256이다(설계안은 32 — ADR 0002 §5).
2. **tick 비교에서 뺀 런**: 램프 중 게이트웨이가 끊겨 hold 동안 클라 일부만 월드에 있었다 — N=1 spread 2000–3000, N=2 spread
   2500/3000(게이트웨이 연결 3/1040과 2/1082), N=3 spread 3000, N=4 spread 3000, N=1 realistic 1500/2000. 끊긴 게이트웨이가 다시
   리스닝하는 사이에 접속하려던 클라는 "socket closed while waiting"으로 실패했다.
3. **realistic은 1000 CCU 이상에서 부분적으로 부하 생성기가 한계다.** 부하 생성기가 논리 CPU 6개 중 3.0–4.9코어를 썼고, 스케줄러
   슬롯 밀림이 1000에서 150–440, 1250 이상에서 776–15,642였다(최대 지연 137–473 ms). 3단계의 Linux 루프백 편향도 그대로라
   realistic 교차점은 참고치다.
4. **N=3·N=4 게이트웨이는 하이퍼스레드 형제에 앉았다**(물리 코어 6개 한계). WSL 게스트의 핀 고정은 호스트 물리 코어의 근사일 뿐이다
   (Hyper-V 코어 스케줄러). Windows 호스트 배경 부하가 ≈13%로 3단계의 약 2배였다.
5. **핀 고정 monolith는 ≈716에서 교차한다** — 3단계 핀 미고정 ≈750보다 낮다. 프로브 세션 20개와, 서버 전체를 물리 코어 1개에
   가둔 탓이다.
6. **reusePort 분산 편차**((최대 − 최소) / 평균, 전원 접속 레벨): N=2 0.6–10.7%, N=3 5.4–18%, N=4 5.9–22%.
7. **클러스터 구성은 p99 45 ms에서도 1500까지 20 Hz를 지킨다.** monolith는 1250에서 20 Hz 아래로 떨어진다. monolith의 spread 2000 이상과
   realistic 상위 레벨은 과부하 접속 제한(KICK 9)으로 클라를 잃었다. 게이트웨이 IPC ping RTT p99는 1250 이상에서 50–250 ms,
   realistic 2000에서 400 ms 이상으로 오른다 — 월드 이벤트 루프 지연이다.
8. **게이트웨이 DELIVER 시간의 p99는 버킷 양자화가 크다**(4.3–4.9 ms와 7.3–9.4 ms 근처에 몰린다). 평균으로 읽는다.
9. **전달 분산 이득**: spread 1000에서 전달 분산 p50이 19.8 ms(monolith)·21.6 ms(N=1)에서 7.3 / 4.1 / 3.4 ms(N=2/3/4)로 준다.
10. **루프백 편향(4.0 D1)**: WSL 루프백에서는 idle 수신자를 깨우는 비용 때문에 소켓당 send가 약 4배 부푼다(17.4 vs 3.7 µs/소켓).
    클러스터의 한계(월드 스냅샷 + IPC 프레이밍)는 NIC와 무관하므로, 실제 NIC에서 monolith 대비 배율은 1.54배보다 작을 가능성이
    크다(추론, 미측정).

**공백**: 실제 NIC·멀티 호스트, Windows 성능 스윕(기능 검증 500만), spread 3000 초과(계획은 5000까지 — 그 아래에서 게이트웨이 끊김·접속
거절이 먼저 온다), stock 1200 초과, 게이트웨이 프로세스 RSS, 월드의 프레임 디코드 몫(INPUT_CMD 사전 디코드 트리거 판단용),
파일 DB에서 게이트웨이 1개(1000+ 세션) 유실 시 `closeSessions` 배치 저장 소요·tick lateness(`:memory:` DB라 미측정 —
ops-cluster §7), N=3·4를 물리 코어에 따로 앉힌 측정.

### 원자료

측정 PC의 로컬 scratch(레포 밖, 세션 임시 경로 — 보존이 필요하면 따로 옮길 것):
`<측정 PC 임시 폴더>/stage4/measure/`

| 경로 (위 기준) | 내용 |
|---|---|
| `linux/` (원본 WSL `~/perf-s4`) | 스윕 폴더 `spread-{mono,n1,n2,n3,n4}`·`spread-{mono,n2}-refine`·`realistic-*`·`stock-*`(레벨별 `level-*.json`·`raw-*.json`·서버/샤드 로그·`console.log`·`summary.md`·`probe/probe-*.jsonl`), 핀·스레드 CPU `pinmon.jsonl`·`pinmon2.jsonl`, 집계 `rows.json`·`tables.md`·`crossings.md`, `runs.log`. `smoke-*`와 `aborted-spread-mono-oldprobe`(송신 순서 맨 앞에 앉던 이전 프로브)는 결과에서 뺐다 |
| `windows/` | `realistic-n2-500/`, `chaos-gwkill-300/`(+ `chaos.log`), `chaos-C1-test.log`, `runs.log` |
| `scripts/` | `pinmon.py`, `spreadProbe.ts`, `run.sh`, `matrix.sh`, `matrix2.sh`, `agg4.py`, `cross.py`, `decomp.py`, `phases.py`, `checks.ts`, `winlevel.ts`, `win-validate.sh` |

## 성능 4.5 F2 — MULTICAST(발행 시점 팬아웃) 마이크로벤치 (Windows, 2026-10-07)

F2는 `sessionManager.sendMany` 팬아웃(DAMAGE_EVENT·SKILL_EFFECT·ENTITY_META·MOVE_PATH·CHAT_BCAST)을 게이트웨이당 CONN_MULTICAST 레코드
1개로 보낸다(IPC v4, `architecture.md` §3.4). 클라 바이트는 같다(특성화 골든 — 게이트웨이 경유 켬·끔). 종단 간 WSL 재측정은 아래
"성능 4.5 — admission·MULTICAST 후"에 있다. 여기서는 `tools/perf/zoneBench.ts`의 새 `--topology world`로 월드 IPC 프레이밍만 잰다.

- 환경: Windows 11, i7-8700K, bun 1.3.13. 세션 링크 = RemoteClientLink → GatewayPeer 2개 → 계수 파이프(syscall·게이트웨이 없음).
  설정마다 자식 프로세스 1개, 설정을 번갈아 7회 반복한 중앙값이다(zone spread의 단계 분해는 300 tick × 11회).
- 전 = `--multicast 0`. 종전 DELIVER 경로와 같은 코드다(월드 IPC 서버가 묶음을 켜지 않는다). 후 = `--multicast 1`.
- 파이프 write 비용은 빠져 있다. 이 비용은 바이트에 비례한다(WSL 0.23–0.26 ms/MB, 4.5 설계 §3). 그래서 IPC 바이트를 함께 적었다.

| 설정 | 지표 | 전 (끔) | 후 (켬) | 변화 |
|---|---|---|---|---|
| MOVE_TO 팬아웃 K=50 (off-tick, 턴 끝 flush 포함) | µs / MOVE_TO | 36.87 | 35.60 | −3.4% |
| | IPC B / MOVE_TO | 4,274 | 384 | −91.0% |
| MOVE_TO 팬아웃 K=200 | µs / MOVE_TO | 53.44 | 44.78 | −16.2% |
| | IPC B / MOVE_TO | 16,853 | 984 | −94.2% |
| zone spread 1000명 / 몬스터 2000 (in-tick DAMAGE 팬아웃) | tick 평균 ms | 4.624 | 4.688 | +1.4% (편차 범위) |
| | IPC 프레이밍 flush + ipcFlush ms | 0.313 | 0.299 | −0.014 |
| | runCombat ms (팬아웃이 레코드 쓰기로 옮겨 온 자리) | 0.515 | 0.534 | +0.019 |
| | IPC B / tick · MULTICAST 레코드 / tick | 328,092 · 0 | 314,102 · 42 | −4.3% |
| zone dense 200 / 600 | tick 평균 ms · IPC B / tick | 0.792 · 442,795 | 0.805 · 437,431 | 편차 범위 · −1.2% |

- **이득은 off-tick 팬아웃에 몰린다.** MOVE_TO K=200에서 MOVE_TO 1건이 수신자 201명분의 프레임 복사(세션 outbox → DELIVER 레코드)
  대신 게이트웨이당 레코드 1개를 쓴다. 파이프 write까지 치면 15.9 KB가 줄어 ≈4 µs가 더 준다[계산: 15.9 KB × 0.25 ms/MB]. realistic에서는 이 경로가 IPC의 9.4%(MOVE_PATH)와 tick 밖 레코드
  2,737개/tick의 대부분이다(4.5 설계 §2).
- **zone spread는 거의 그대로다**(설계 예측대로). 스냅샷 SPAWN/DESPAWN·SNAPSHOT_DELTA는 `sendFrame` 경로라 이번 대상이 아니다.
  전투 단계가 레코드를 쓰는 몫(+0.019 ms)과 uncork가 덜 복사하는 몫(−0.014 ms)이 상쇄된다. 1.6배 재도전은 DELTA 공유(4.5 설계 (b),
  추정 IPC −84~96%)의 몫이다.
- **monolith는 바뀌지 않았다.** 월드 IPC 서버가 없으면 `sendMany`는 F2 전 루프 그대로다. `6bcf66b` 사본과 번갈아 7회 잰 결과는 다음과
  같다. 범위가 겹친다.
  - zone spread 1000/2000: 4.702 → 4.613 ms
  - zone dense 200/600: 0.705 → 0.725 ms
  - MOVE_TO K=50: 36.36 → 36.24 µs
  - MOVE_TO K=200: 52.61 → 53.12 µs
- **게이트웨이 write 수는 늘지 않는다.** 게이트웨이는 MULTICAST 바이트를 그 연결의 다음 DELIVER와 합치거나 CONN_FLUSH에서 쓴다. 그래서
  연결당 flush 창마다 write가 1회다. 등가 퍼징(`tests/server/cluster/multicastEquivalence.test.ts`)이 켬 ≤ 끔을 단정한다.
- 원자료(로컬 scratch — 4단계 원자료와 같은 경로): `f2bench.ts`·`f2bench-out2.json`(전 설정 7회), `f2zone.ts`(zone spread 11회),
  `f2mono.ts`(monolith 9회), `f2base/`(`6bcf66b` 사본).

## 성능 4.5 F3 — SNAPSHOT_DELTA 묶음·공유 프레임 마이크로벤치 (Windows, 2026-10-07)

F3는 같은 입력(keep 열·self)을 가진 viewer끼리 SNAPSHOT_DELTA 프레임 1개를 공유한다(`sim/deltaGroups.ts` — writeEntries를 묶음당 1회, 수신자마다
ackSeq만 패치, keep 64 미만은 종전 경로). 월드는 그 프레임을 게이트웨이 봉투당 DEF 1개 + 연결별 CONN_REF(ackSeq)로 보낸다(IPC v5
`CONN_DELIVER_SHARED`, `architecture.md` §3.4·§5.2). 클라 바이트는 같다(특성화 골든 — monolith·게이트웨이 경유 켬·끔). 종단 간 WSL 재측정은
아래 "성능 4.5 — admission·MULTICAST 후"에 있다. 여기서는 `tools/perf/zoneBench.ts`(새 `--delta-groups`·`--shared`)로 존 tick과 월드 IPC 프레이밍만 잰다.

- 환경: Windows 11, i7-8700K, bun 1.3.13. world = 세션 링크 RemoteClientLink → GatewayPeer 2개 → 계수 파이프(syscall·게이트웨이 없음).
  설정 7개를 번갈아 7회 반복한 중앙값, 설정마다 자식 프로세스 1개, 300 tick(워밍업 60).
- 전 = `79957a4`(F2) 사본(`git archive`). 후 = 기본값(묶음 켬·`IPC_SHARED=1`). A/B로 `--delta-groups 0`(종전 viewer별 경로)·`--shared 0`도 쟀다.
- 셀당 인원(`--per-cell`)이 묶음 크기를 정한다. pc24(셀당 플레이어 24명·keep ≈ 200)는 4.4 WSL spread 측정(그룹 46개 / viewer 1,100, keep 420/600)의
  셀 밀도에 가깝다. 계수 파이프라 파이프 write 비용(WSL 0.23–0.26 ms/MB, 4.5 설계 §3)은 빠져 있다 — IPC 바이트로 외삽한다.

| 설정 | 토폴로지 | 지표 | 전 (`79957a4`) | 후 | 변화 |
|---|---|---|---|---|---|
| spread 1100명/600 pc24 | monolith | tick 평균 ms | 9.991 | 9.485 | −5.1% |
| | | dispatchSnapshots ms | 6.222 | 5.850 | −6.0% |
| | world(게이트웨이 2) | tick 평균 ms | 9.977 | 9.268 | −7.1% |
| | | dispatchSnapshots ms | 6.202 | 5.439 | −12.3% |
| | | IPC 프레이밍(flush) ms | 0.988 | 0.909 | −8.0% |
| | | IPC KB / tick | 2,738.9 | 673.0 | **−75.4%** (CONN_REF 1,091·DEF 98 / tick) |
| dense 200/600 | monolith | tick 평균 ms · dispatchSnapshots ms | 0.742 · 0.311 | 0.662 · 0.212 | −10.8% · −31.8% |
| | world | tick 평균 ms · dispatchSnapshots ms | 0.754 · 0.307 | 0.636 · 0.190 | −15.6% · −38.1% |
| | | IPC KB / tick | 428.7 | 11.0 | **−97.4%** |
| spread 1000/600 pc8 | monolith | tick 평균 ms · dispatchSnapshots ms | 5.242 · 3.050 | 5.206 · 3.053 | 편차 범위 |
| | world | tick 평균 ms | 5.361 | 5.399 | 편차 범위(+0.7%) |
| | | dispatchSnapshots ms · IPC 프레이밍 ms | 3.054 · 0.467 | 2.950 · 0.596 | −3.4% · +0.13 ms |
| | | IPC KB / tick | 1,013.7 | 493.8 | −51.3% |
| spread 1000/2000 pc2 | monolith | tick 평균 ms · dispatchSnapshots ms | 4.730 · 1.788 | 4.706 · 1.752 | 편차 범위 |
| | world | tick 평균 ms · IPC KB / tick | 4.852 · 306.7 | 4.907 · 306.7 | 편차 범위 · 0(keep < 64 — 묶지 않음) |

- **이득은 묶음 크기에 비례한다.** pc24에서 world tick이 −0.71 ms이고, 파이프 write까지 치면 2.07 MB/tick이 줄어 WSL에서 ≈0.5 ms가 더 준다
  [계산: 2.07 MB × 0.25 ms/MB]. 합치면 −1.2 ms(−12%)다. 4.5 설계 §6은 spread 1100에서 −4.4 ms(−26%)를 추정했다. 그 시나리오의 keep(420/600)·
  IPC(5.6 MB/tick)·writeEntries(2.5 ms)가 여기보다 커서다. WSL 재측정(아래 "성능 4.5")에서 spread N=2 1100의 world tick 평균은
  16.85 → 13.95 ms(−17%)였다(F2·F3 합산).
- **monolith도 줄었다.** 묶음은 토폴로지와 무관하게 writeEntries를 묶음당 1회로 줄인다 — pc24 −5.1%, dense −10.8%. 4.5 설계 §5.2의 지적대로
  1.6배 비교 기준(monolith)도 함께 올라간다. 재측정 보고에는 두 기준을 다 적는다.
- **world의 DELTA 복사도 사라진다.** dispatchSnapshots가 monolith보다 더 줄었다(pc24 −12.3% 대 −6.0%). 원격 세션 outbox는 공유 프레임을 끝 참조로만
  들고 복사하지 않는다. uncork(IPC 프레이밍)는 pc24에서 줄고(프레임 ≈2.4 KB 복사 대신 참조 17바이트) pc8에서 늘었다(+0.13 ms). pc8은 프레임이
  작고 게이트웨이당 묶음이 ≈4명이라, 참조 기록(DEF 정의·보관자 집계·평문/참조 선택)이 복사 절감보다 크다. 대신 IPC가 520 KB/tick 줄어 WSL
  파이프 write ≈0.13 ms가 준다[계산]. 그래서 상쇄된다.
- **하한 64를 고른 근거**(같은 하니스, spread 1000명, 묶음 끔/켬 5회 중앙값 dispatchSnapshots):
  - 하한 0: 셀당 2명(keep ≈ 26)에서 +0.41 ms다. 짧은 keep은 writeEntries가 싸서 묶음 판정·등록·패치 복사가 더 비싸다.
  - 하한 32: 셀당 2명 +0.13 ms, 셀당 4명 +0.12 ms다.
  - 하한 64: 둘 다 ±0.01 ms다.
  - 구현 중 고친 점: 프로파일에서 미스 경로의 `subarray` 2개(keep 복사·풀 복사)와 dispatch마다 `Map.clear`·재성장이 보였다. finish 뷰를 복사 없이
    풀 프레임이 가져가게 하고(DeltaCache와 저장소 맞바꿈), 열린 주소법 표(stamp로 비움)로 바꿔 하한 0의 +0.8 ms를 +0.41 ms로 줄였다.
- **게이트웨이 write 수는 늘지 않는다.** CONN_REF는 연결 레코드 1개라 DELIVER와 같은 write 1회다. 등가 퍼징
  (`tests/server/cluster/sharedEquivalence.test.ts`)이 켬 ≤ 끔을 단정한다. 게이트웨이는 인라인이 없으면 DEF 뷰를 제자리 패치해 복사 없이 쓰고,
  있으면 합친다. 합친 양은 `mmorpg_gw_deliver_assembled_bytes_total`에 남는다.
- 원자료(로컬 scratch — 4단계 원자료와 같은 경로): `f3bench/f3bench.ts`·`f3bench-out.json`(설정 7개 × 7회 원값·중앙값), `f3bench/base/`
  (`79957a4` 사본), `f3bench/prof/`(CPU 프로파일 — 묶음 끔/켬, world 공유 끔/켬).

## 성능 4.5 — admission·MULTICAST 후 (4.4 대비)

> **측정일 2026-10-07 · 커밋 `886f9dd`** (`bun-to-cpp-server`, 레포 무수정 — Windows·WSL 둘 다 clean. WSL `~/mmorpg`은 번들로 fetch해
> `reset --hard`로 맞췄다). Linux 20:13–21:02 KST, Windows 21:02–21:03 KST. 위 "성능 4단계"와 같은 방법이고, 수치는 4.5 재측정 보고에서
> 옮겼다. 측정 대상은 4.5 후속 전체다: 안전망 `3538698`, F1 부하 기반 접속 제한 `6bcf66b`(IPC v3), F2 MULTICAST `79957a4`(v4),
> F3 SNAPSHOT_DELTA 묶음·공유 프레임 `e9671df`(v5), 리뷰 픽스 `c9a2216`·`886f9dd`. "≈"는 레벨별 중앙값 사이의 선형 보간, "계산"은 그
> 수치끼리의 산술, "—"는 미측정이다. 결정 기록은 [ADR 0002](adr/0002-gateway-split.md) §4.2.

### 요약

- **합격선을 통과했다.** 같은 세션에서 N=2 ≈1,159 / monolith ≈678 = **1.71배**다. 4.4의 monolith(≈716)를 기준으로 잡아도 1.62배다.
  게이트웨이 사용률도 통과다(메인 스레드 0.39–0.47코어). 세는 방식을 바꿔도 모두 1.6배 이상이다.
  - 과반 런이 25 ms 이하인 레벨로 세면 1150 / 650 = 1.77배다.
  - 모든 런이 25 ms 이하인 레벨로 세면 1100 / 650 = 1.69배다.
- **월드 IPC 비용이 예산 안으로 들어왔다.** 세션·tick당 1.52–1.57 µs다(4.4 3.0–3.4, 예산 ≤ 2.7). IPC 바이트는 spread −84%, stock −99%,
  realistic −80~82%이고, spread N=2의 IPC 프레이밍은 −53~57%다. 다만 tick 비중은 20% → 12%라 MULTICAST 트리거(10%)보다 아직 높다.
- **새로 보이는 병목은 스냅샷 꼬리다.** N=2 1100–1200에서 tick 평균은 −15~19%인데 p99는 −6~11%만 줄었다. 스냅샷 평균은 −8~12%지만 p99는 그대로라
  (1150: 19.09 → 19.37 ms) tick p99/평균이 1.48 → 1.65로 날카로워졌다.
- **포화한 게이트웨이가 끊기지 않는다.** 게이트웨이 1개 spread 1500·2000은 전원 접속·kick 0이다(4.4 1500은 게이트웨이가 끊겨 전원 KICK 6).
  2500·3000은 초과분이 KICK 9 "server busy"로 돌아갔다. 모든 런에서 IPC 피어 유실·게이트웨이 끊김·부하 클라 KICK 6이 0이다.
- **monolith는 평균이 빨라졌지만 p99가 올랐다**(700: 24.31 → 26.07 ms). monolith 교차점이 716 → 678로 내려간 이유다. 런 간 편차와
  겹쳐 회귀로 단정하지는 않는다(§2).
- Windows 기능 검증은 통과했다(realistic 500 — IPC 1,088 → 241 KB/tick).

### 환경·방법 (4.4와 다른 점만)

- 머신·OS·bun·하네스·핀 고정·프로브·조인·샤드·hold는 4.4와 같다. `checks.txt`로 affinity를 확인했다: world 2,3 · gw 4,5/6,7(N=3·N=4는
  논리 CPU 1개씩) · 부하 생성기 0,1,8–11.
- Windows 호스트 배경 부하 ≈11%(4.4 ≈13%).
- 과부하 보호와 부하 기반 접속 제한은 서버 기본값(켬) 그대로다.
- 반복: 교차점을 가두려고 monolith 600/650 ×3, 700/750 ×6, N=2 1050/1100/1250/1300 ×3, 1150/1200 ×6을 쟀다. 게이트웨이 1개의 초과
  접속이 KICK 9로 가는지 보려고 N=1 2500/3000을 더 쟀다. realistic·stock(N=2)·N=1·N=3·N=4는 레벨당 1회다.

### 임계점 (Linux, 레벨별 중앙값 보간)

| 시나리오 | 4.5 | 4.4 |
|---|---|---|
| spread mono, p99 > 25 | **≈678** (600: 21.4/21.9/21.8 · 650: 22.6/23.7/23.6 · 700, 6회: 23.3/24.2/26.0/26.2/26.4/28.3 · 750, 6회: 25.9–28.6, 이상치 42.8 1회) | ≈716 |
| spread N=2, p99 > 25 | **≈1,159** (1100: 23.5/23.4/21.7 · 1150, 6회: 22.2/24.0/24.3/24.6/26.9/29.7 · 1200, 6회: 24.4/26.4/26.9/28.0/50.7\*/54.1\* · 1250 med 28.7 · 1300 med 33.6) | ≈1,101 |
| spread N=1 | 1250에서 이미 넘음(29.35). p99 > 50 기준 ≈1,522 | ≈916 (1250: 43.6) · p99 > 50 ≈1,286 |
| spread N=3 / N=4 | 1250에서 이미 넘음(39.1 / 32.7). 1500은 39.9 / 42.6 | ≈1,062 / ≈1,065 · 1500: 49.3 / 47.8 |
| realistic N=2 | ≈924 (750: 15.5 · 1000: 29.2 · 1250: 39.3) | ≈972 |
| stock N=2 | **≈1,176** (800: 12.5 · 1000: 20.2 · 1200: 25.6) | ≈950 |

\* 호스트 끊김 이상치다(아래 "이상·주의" 2). 6회 중앙값에 포함했다.

- N=3·N=4는 1250과 1500만 쟀고 1250에서 이미 25 ms를 넘었다. 그래서 4.5의 교차점은 정하지 못했다.
- 측정한 범위에서 p99 > 50 ms와 20 Hz 아래는 monolith(750까지)·N=2(1300까지)·N=3·N=4(1500까지) 모두 도달하지 않았다. 게이트웨이 1개는
  2000에서 16.60 Hz다.

### 1. 월드 tick 단계 (spread N=2, 런 중앙값, ms)

| CCU | tick 평균 | p99 | 스냅샷 | IPC 프레이밍 | ipcFlush | applyInputs | IPC 비중 | µs/세션·tick |
|---|---|---|---|---|---|---|---|---|
| 1100 (4.4) | 16.85 | 24.93 | 11.90 | 3.08 | 0.32 | 0.80 | 20% | 3.0–3.4 |
| 1100 (4.5) | 13.95 (−17%) | 23.43 | 10.60 (−11%) | 1.45 (−53%) | 0.27 | 0.83 | 12% | 1.52–1.55 |
| 1150 (4.4 → 4.5) | 18.37 → 14.87 (−19%) | 27.31 → 24.48 | 12.88 → 11.31 | 3.49 → 1.52 (−57%) | 0.29 → 0.30 | 0.85 → 0.93 | 20% → 12% | 1.52–1.57 |
| 1200 (4.4 → 4.5) | 19.45 → 16.44 | 30.83 → 27.46 | 13.64 → 12.52 | 3.91 → 1.67 | 0.15 → 0.33 | 0.79 → 0.97 | 21% → 12% | ≈1.6 |

- **IPC 비용은 예산 안으로 들어왔다.** 세션·tick당 2.7 µs 예산 안이다. 다만 tick 비중은 아직 10% 트리거보다 높다(12%).
- **1 MB당 비용은 0.62 → ≈1.9 ms/MB로 올랐다.** 바이트가 프레이밍 작업보다 훨씬 많이 줄었기 때문이다(레코드당 고정비 — 연결마다
  tick당 CONN_REF 1개는 남는다).
- **스냅샷 꼬리가 줄지 않았다.** 스냅샷 평균은 −8~12%지만 p99는 그대로다(1150: 19.09 → 19.37, 1200: 21.22 → 21.12). 스냅샷 p99/평균은
  ≈1.50 → ≈1.70으로 날카로워졌다.
  - 그래서 tick p99/평균이 1.48 → 1.65로 올랐고, 평균이 −19% 준 데 비해 p99는 −6~11%만 줄었다.
  - 가장 느린 1% tick의 초과분은 스냅샷 단계가 +8~14 ms로 대부분을 차지한다(`tail.md`).
  - p99 개선은 주로 IPC 프레이밍 꼬리에서 왔다(p99 5.3–7.3 → 2.7–3.1 ms).

### 2. spread — monolith

| CCU | tick 평균 4.4 → 4.5 | 스냅샷 평균 4.4 → 4.5 | 스냅샷 p99 4.4 → 4.5 | tick p99 4.4 → 4.5 |
|---|---|---|---|---|
| 700 | 20.21 → 19.65 (−3%) | 5.24 → 4.78 (−9%) | 7.50 → 8.36 | 24.31 → 26.07 |
| 750 | 21.60 → 21.00 (−3%) | 5.80 → 5.40 (−7%) | 9.12 → 9.29 | 26.47 → 27.85 |

- 평균은 빨라졌다(F3의 DELTA 묶음이 monolith에서도 writeEntries를 묶음당 1회로 줄인다 — 위 "성능 4.5 F3"). p99는 올랐고, 이것이
  교차점이 716 → 678로 내려간 이유다.
- p95는 4.4와 비슷하다. p99 차이 1–2 ms는 런 간 편차(700에서 23.3–28.3)와 겹치므로 회귀로 단정하지는 않는다.

### 3. IPC 바이트/tick과 절감 (hold 창 카운터 델타)

"절감 전 추정"은 실제 송출 + MULTICAST 절감분 + 공유 프레임 절감분이다. 이 값이 4.4의 실측 바이트와 일치해서 카운터를 믿을 수 있다.

| 구성 | 4.5 KB/tick | 절감 전 추정 KB/tick | 4.4 실측 | 절감 (MULTICAST / 공유) |
|---|---|---|---|---|
| spread N=2 1050–1300 | 813–1,274 | 5,057–7,795 | 5,052–7,146 | 83–85% (0.1% / 83–85%) |
| spread N=2 1150 (중앙값) | 962 | ≈6,060 | 6,049 | −84% |
| realistic N=2 750 / 1000 / 1250 | 427 / 649 / 910 | 2,151 / 3,435 / 4,993 | 2,179 / 3,453 / 5,054 | 80–82% (14–15% / 65–68%) |
| stock N=2 800 / 1000 / 1200 | 53 / 66 / 79 | 6,868 / 10,667 / 15,297 | 6,869 / 10,667 / 15,293 | 99.2–99.5% |
| spread N=3 / N=4, 1250 · 1500 | 1,218 / 1,266 · 1,744 / 1,745 | ≈7,100 · ≈10,300 | ≈7,100 · ≈10,300 | 82–83% |

- 공유 프레임 레코드: spread는 DEF 48–54개/tick, REF는 연결당 tick마다 1개(1,048–1,298), stock은 DEF 4개/tick이다.
- realistic의 MULTICAST는 레코드 31–51개/tick이 수신자 4,309–9,809명분을 실었다.
- spread는 팬아웃이 거의 없어 MULTICAST 몫이 0.1%다.

### 4. 게이트웨이 CPU

| 구성 | 메인 스레드 (코어) | 프로세스 (코어) | 비고 |
|---|---|---|---|
| N=2 spread 1150–1200 | 0.39–0.47 | 0.42–0.51 (u 0.16–0.20 / s 0.26–0.31) | 4.4(1100–1150): 메인 0.41–0.44, 프로세스 0.44–0.48 — 변화 없음 |
| N=3 / N=4 spread | 0.33–0.40 / 0.27–0.34 | — | |
| N=1 spread 1250 | 0.75 | 0.78 | 137 MiB/s |
| N=1 spread 1500 | 0.89 | 0.92 | 200 MiB/s |
| N=1 spread 2000 이상 | 0.95–0.98 | 1.00–1.03 | 309–331 MiB/s, 포화 |
| N=2 realistic 1000–1250 | 0.58–0.61 | — | |
| N=2 stock | 0.30–0.45 | — | |

- N=2 spread 1150–1200의 게이트웨이별 수치: write 11.4–13.7k/s, 송신 54–69 MiB/s, 봉투당 레코드 45–65개.
- DELIVER 처리 시간은 평균 0.7–1.1 ms, p99 13–23 ms로 늘었다(4.4 평균 0.38–0.58). 봉투가 커졌기 때문이다.
- 게이트웨이가 합치려고 복사하는 양이 게이트웨이당 2.5–3.2 MB/tick이다. 월드가 아낀 복사가 게이트웨이로 옮겨 간 셈이다. 그래도 CPU는
  늘지 않았다.

### 5. 접속 제한·kick

- **N=1 2500·3000을 뺀 모든 레벨**에서 전원이 접속했고 kick 0, 오류 0이다.
- **N=1 1500**: 1500/1500 접속, kick 0. 게이트웨이 접속 제한이 램프 끝(1520 연결)에 한 번 닫혔고(원인 cpu, CPU 91.1%) 거절은 0이다.
  4.4에서는 게이트웨이가 끊겨 1500명 전원이 KICK 6을 받았다.
- **N=1 2000**: 2000/2000 접속, kick 0. 접속 제한은 전원 접속 뒤(2015 연결, CPU 91.5%)에 닫혀 거절이 0이다.
  - 한계는 월드다: tick skip 102회, 16.60 Hz, 월드 메인 스레드 0.96코어.
  - hold 끝에 gw1 앞 IPC 미전송은 0.96 MB로, 소프트 임계 64 MB보다 훨씬 작았다.
- **N=1 2500**: 2328/2500 접속, KICK 9가 172명이다.
  - 172명 전원을 월드의 tick 과부하 판정이 거절했다(`overload_rejected` 172, 게이트웨이 `conn_closed{world_requested}` 172).
  - 게이트웨이 cpu 거절은 1건이다(프로브로 추정). 12.48 Hz.
- **N=1 3000**: 2121/3000 접속, KICK 9가 879명이다. 게이트웨이 부하 접속 제한(cause=cpu)이 885건을 거절했다(부하 생성기 879 + 프로브로
  추정). 13.78 Hz.
- **게이트웨이가 끊긴 경우는 한 번도 없다.** 모든 런에서 다음이 전부 0이다:
  - 월드 IPC 소프트 임계 거절(`ipc_admission_rejected`)과 피어 busy 표시
  - `ipc_peer_lost`, `gw_world_lost`, `conn_closed{world_lost}`
  - 부하 클라가 받은 KICK 6
- 프로브 봇은 클러스터 레벨 종료 때 KICK 6(ServerShutdown)을 받는다. 4.4에서도 같았다.
- N=1 2000/2500/3000에서 게이트웨이 idle close가 5/19/14건 있었다. 부하 생성기의 조기 종료는 0이라 부하 클라는 아니다(프로브로 추정).

### 6. 4.4 대비 요약 (중앙값, 전체는 `cmp-vs-4.4.md`)

| 구성 | tick 평균 | p99 | IPC 프레이밍 | IPC KB/tick | gw 메인 | 전달 분산 p50 |
|---|---|---|---|---|---|---|
| spread N=2 1050 | −16% | 22.0 → 19.5 | −53% | −84% | 동일 | 8.7 → 8.1 |
| spread N=2 1150 | −19% | 27.3 → 24.5 | −57% | −84% | 0.44 → 0.43 | 9.7 → 8.9 |
| spread N=2 1250 | −18% | 29.1 → 28.7 | −58% | −84% | 동일 | 10.9 → 9.4 |
| spread N=3 1500 / N=4 1500 | −23% / −22% | 49.3 → 39.9 / 47.8 → 42.6 | −69% / −68% | −83% | — | — |
| spread N=1 1250 | −27% | 43.6 → 29.4 | −56% | −86% | — | — |
| stock N=2 800 / 1000 / 1200 | −38~40% | 18.6 → 12.5 · 27.2 → 20.2 · 40.9 → 25.6 | −78~86% | −99% | — | — |
| realistic N=2 750 / 1000 / 1250 | +2 / −4% (차이 없음) | 15.9 → 15.5 · 26.1 → 29.2 · 41.3 → 39.3 | — | −80~82% | — | — |
| spread mono 700 / 750 | −3% | 24.3 → 26.1 · 26.5 → 27.9 | — | — | — | — |

- realistic은 1회씩만 쟀고 부하 생성기가 한계다(4.37코어, 슬롯 밀림 2,230). applyInputs가 +42%라 판정에서 뺀다.
- monolith 행의 스냅샷은 −9%다.
- N=1 1500 이상의 4.4 값은 게이트웨이가 끊긴 런이라 비교할 수 없다.

### 7. Windows 기능 검증 — 통과

`--spawn-cluster 2` realistic 500, 30초.
- 500/500 접속, kick 0, 오류 0, 조기 종료 0.
- 위반·오류 카운터가 모두 0이다(rate, size, decode, handler, zone tick, unhandled rejection, partial write, backlog close, input
  overflow, skip, stall). 서버 로그의 error 줄도 0이다.
- tick p50 5.10 / p99 10.24 ms, 20.00 Hz, 월드 0.28코어. 게이트 PASS.
- 게이트웨이는 250/250으로 나뉘었고 각 0.40 / 0.41코어, DELIVER 평균 0.61 ms(4.4: 1.45/1.41).
- IPC 241 KB/tick(4.4: 1,088, −78%) — MULTICAST가 176 KB/tick, 공유 프레임이 662 KB/tick을 아꼈다.
- RTT p50/p99 5.6 / 23.1 ms.

### 이상·주의

1. **첫 monolith 런이 죽었다.** WSL 콜드 부팅 직후 첫 monolith 스모크(`smoke0-mono`)에서 서버가 헬스 체크 직후 아무 출력 없이
   종료됐다(stderr 비어 있음). 같은 조건으로 다시 돌리자 정상이었고, 이 런은 결과에서 뺐다. 원인은 모른다.
2. **호스트 끊김 이상치 3건**이 11:27–11:58 UTC에 몰렸다: N=2 1200의 54.1·50.7 ms, monolith 750의 42.8 ms. 모두 클라 lag p99가
   272–383 ms였다. 가장 큰 단계가 끊김을 흡수한 모양(N=2는 스냅샷 +36/+48 ms, monolith는 단계 밖 시간 +28.7 ms)이라 호스트 선점과
   맞는다. 6회 중앙값에 포함했다.
3. **N=2 1150은 두 번째 세트가 더 흔들렸다**(26.95/22.21/29.73 대 첫 세트 23.97/24.32/24.63).
4. **N=3 1250 p99 39.1은 4.4(33.2)보다 나쁘다.** 1회 측정이고 램프 중 핸드셰이크 p99가 1.4초였다. 1500에서는 4.4보다 낫다.
5. **추가로 잰 레벨**(요청 매트릭스 밖): 교차점을 가두려고 monolith 600/650 ×3과 700/750 ×3 추가, N=2 1150/1200 ×3 추가, 초과 접속에
   KICK 9가 가는지 보려고 N=1 2500/3000을 더 쟀다.

**공백**: N=3·N=4의 4.5 교차점(1250·1500만 측정), realistic·stock의 반복 측정과 N=2 밖 구성, 그리고 4.4에서 이월한 실제 NIC·멀티
호스트·Windows 성능 스윕·파일 DB 피어 유실 저장 소요.

### 원자료

측정 PC의 로컬 scratch(레포 밖, 세션 임시 경로 — 보존이 필요하면 따로 옮길 것):
`<측정 PC 임시 폴더>/stage45/measure/`

| 경로 (위 기준) | 내용 |
|---|---|
| `linux/` (WSL `~/perf-s45m` 사본) | 레벨별 폴더 `spread-*`·`realistic-n2`·`stock-n2`, 핀·스레드 CPU `pinmon-*.jsonl`, 집계 `rows.json`·`rows45.json`, 표 `crossings.md`·`tables.md`·`tables45.md`·`decomp-*.md`·`cmp-vs-4.4.md`·`tail.md`·`checks.txt`, `runs.log` |
| `windows/` | `realistic-n2-500/`, `runs.log` |
| `scripts/` | 4.4 스크립트 사본(`pinmon.py`·`spreadProbe.ts`·`agg4.py`·`cross.py`·`decomp.py`·`phases.py`·`checks.ts`·`winlevel.ts`, 기준 폴더만 바꾼 `run.sh`) + 새로 쓴 것 `matrix45.sh`·`agg45.py`·`cmp45.py`·`tail45.py`·`win45.sh` |

번들은 `stage45/s45.bundle`에 있다.

## macOS (Apple M4 Pro) — 같은 호스트 루프백 측정 + 점진 감축 검증 (2026-10-11)

> 개발용 MacBook Pro(M4 Pro 14코어, 48 GB, macOS 27.0.1, Darwin 27), bun 1.3.13. 서버·부하 생성기를 **같은 Mac**에서 띄운 루프백
> 측정이다(실제 NIC 아님). 브랜치 `bun-to-cpp-server` `3d1a800`(점진 감축 검증은 그 위 작업 트리). `orchestrate.ts --spawn-server`
> / `--spawn-cluster 2`, hold 20 s(감축 검증 30 s), 조인 100/s, 레벨마다 새 서버, 핀 고정 없음, 1회 측정. spread는 Town(64×64) 클램프.

### 요약

- **모놀리스가 Windows의 약 3배를 받는다.** spread p99 > 25 ms 교차 ≈2,200(2000: 20.8 / 2500: 29.2) vs Windows 3단계 ≈745, 20 Hz는
  3000까지(3500에서 과부하 접속 제한이 107명을 KICK 9). macOS 루프백은 소켓 send가 싸서 4.0 스파이크가 짚은 WSL의 send 부풀림이 없다 —
  이 환경에서는 게이트웨이 분리의 이득이 작다(N=2 교차 ≈2,300–2,900, 노이즈 큼).
- **realistic**: 모놀리스 1000 p99 9.3 / 2000 p99 23.6(RTT p99 40 ms), N=2 1000 p99 5.9 / 2000 p99 19.8.
- **점진 감축 이전 결함 재현**: N=2 spread 4000에서 램프가 끝나 게이트웨이당 2000명이 되자 월드 → 게이트웨이 2의 IPC 대기가 3–6초 만에
  0 → 170 MB(게이트웨이 IPC 수신 ≈105 MB/s에서 막힘, 게이트웨이 CPU ≈45%·이벤트 루프 지연 ≈20 ms) → 하드 상한 256 MiB에서 그 게이트웨이가
  끊겨 **2000명 전원 KICK 6**. 소프트 임계(ADMISSION busy)는 정상 발동했지만 신규 접속만 막아 이미 붙은 부하는 줄이지 못했다.
- **점진 감축 후(같은 시나리오, 첫 구현 — 최신 연결 우선·스텝 상한 없음)**: 감축 2회(200 → 180명 KICK 9 "server busy"), 대기 최고
  ≈114 MB → 0, 게이트웨이 끊김 0, 나머지 3,620명은 20 Hz 유지(tick p99 49.5 — 월드 tick 한계 근처). KICK 2000(전원 6) → 380(9).
- **리뷰 반영 후(인월드 무작위·1회 상한 100·에피소드 판정·tick 밖 평가, 같은 시나리오 2회)**: 정상 런은 감축 4스텝 × 100 = 400명(1회
  상한이 ceil(1968 × 10%) = 197을 100으로 묶어 스텝이 늘었다), 대기 최고 ≈113–124 MB → 7초 만에 0, 게이트웨이 끊김 0·KICK 6 0, KICK 9
  432(감축 400 + 조인 거절 32), 20 Hz·tick p99 46.3. 다른 1회는 호스트 경합(사용자 데스크톱 사용, load avg 7) 런으로 월드 tick이 램프
  끝(≈3,400명)부터 밀려(12.8 Hz) 과부하 접속 제한이 352명을 조인 단계에서 거절했고, 남은 3,648명에서 감축 3스텝 × 100 — 그래도 끊김 0.

### 표 (Mac, 1회)

| 구성 | CCU | tick p50 / p99 | Hz | 서버 코어 | 비고 |
|---|---|---|---|---|---|
| 모놀리스 spread | 500 / 1000 / 1500 | 10.4 / 13.8 · 10.0 / 12.9 · 11.9 / 14.0 | 20.0 | 0.46 · 0.44 · 0.49 | 전원 PASS |
| 모놀리스 spread | 2000 / 2500 / 3000 | 18.9 / 20.8 · 27.2 / 29.2 · 37.1 / 44.7 | 20.0 | 0.66 · 0.83 · 1.04 | 2500부터 p99 > 25 |
| 모놀리스 spread | 3500 | 48.6 / 52.2 | 15.4 | 1.05 | 과부하 접속 제한 KICK 9 107 |
| 게이트웨이 2 spread | 2000 / 2500 / 3000 / 3500 | 11.8 / 13.2 · 18.3 / 31.6 · 25.5 / 28.1 · 33.2 / 43.9 | 20.0 | 월드 0.48–0.93 | 게이트웨이 0.25–0.43코어 |
| 게이트웨이 2 spread (감축 전) | 4000 | 13.6 / 15.0 | 20.0 | 0.51 | 게이트웨이 1 끊김 → 2000명 KICK 6 |
| 게이트웨이 2 spread (감축 후, 첫 구현) | 4000 | 37.0 / 49.5 | 20.0 | 1.01 | 감축 2회 KICK 9 380, 끊김 0 |
| 게이트웨이 2 spread (리뷰 반영 후) | 4000 | — / 46.3 | 20.0 | 0.99 | 감축 4스텝 KICK 9 400(+조인 거절 32), 끊김 0 |
| 모놀리스 realistic(+608) | 1000 / 2000 | 7.7 / 9.3 · 20.5 / 23.6 | 20.0 | 0.66 · 1.04 | RTT p99 11 · 40 ms |
| 게이트웨이 2 realistic(+608) | 1000 / 2000 | 4.6 / 5.9 · 12.2 / 16.6–19.8 | 20.0 | 0.30 · 0.60 | 아래 "지연 일시 현상" |

### 이상·주의

- **realistic 2000 게이트웨이 모드 지연 일시 현상**: 첫 측정에서 클라 RTT p50/p99 624 / 1870 ms, 게이트웨이 IPC 왕복 p99 ≈2.4 s(게이트웨이
  admission이 `cause=rtt`로 닫힘)였으나 같은 조건 재측정 2회는 RTT 11 / 33–36 ms, partial write 0으로 재현되지 않았다. 느린 런은 부하
  생성기 CPU가 3.52코어(정상 4.29–4.32)로 적었고 클라 lag 증가 p99 1.87 s·게이트웨이의 클라 소켓 partial write 52건 — 클라가 수신을 못
  따라간 호스트 CPU 경합으로 판단한다(서버 결함 아님). 이때 게이트웨이 RTT 신호가 신규 접속을 막은 것은 의도대로다.
- **조인 중 월드 CPU 370–600%**: DevAuto 신규 계정 bcrypt(cost 10)가 Bun 스레드 풀에서 돈다 — 램프 중 수치는 hold 창 밖.
- **macOS 테스트 특성**: 수신을 pause한 소켓에 RST가 오고 ~20 ms 안에 resume하면 close 이벤트가 유실된다(bun 1.3.13, kqueue) — 운영
  코드는 pause를 쓰지 않고 heartbeat가 잡는다. `socketPipe.test.ts`는 운영과 같은 heartbeat 경로로 검증한다(`3d1a800`).
- 원자료: 측정 PC 로컬 scratch `mac-m4/`(요약·서버 로그). 기본 `ulimit -n`이 256이라 측정 셸에서 `ulimit -n 65536`, `somaxconn` 128.

## 스냅샷 꼬리 — GC 페이서 (4.5 후속, 2026-10-11)

> ADR 0002 §7 "스냅샷 단계 꼬리" 원인 분석과 대응. 벤치는 Windows(i7-8700K) `zoneBench` 월드 토폴로지(1150명, 셀당 72 → Town과 같은
> 64×64, 몬스터 5, 게이트웨이 2, 공유 프레임·DELTA 묶음 켬), 실서버는 WSL2 4.5와 같은 방법(pinmon 핀 고정 world 2,3 · gw 4,5/6,7 ·
> 부하 생성기 0,1,8–11, 조인 100/s, hold 30 s, `--spawn-server`/`--spawn-cluster 2`, spread). 브랜치 `bun-to-cpp-server` `f6ea19d` + 페이서.

### 요약

- **벤치의 꼬리는 tick 안에서 시작되는 JSC GC다.** 작업량 변동이 아니다(tick별 송신 바이트와 스냅샷 시간 상관 0.31). tick을 쉼 없이 돌린
  조건에서 가장 느린 1% tick 12개가 전부 GC tick이었고(GC tick 3.6%), GC tick을 빼면 스냅샷 p99/평균이 2.20 → 1.36이다(20 Hz 주기 조건은
  GC tick 3.8%·스냅샷 p99/평균 2.28). JSC 로그의 정지는 ≈0.3 ms지만 동시 마킹 동안 메인 스레드가 느려져 그 tick이 +12–14 ms가 된다.
- **대응 = GC 페이서**(`GC_PACE_TICKS` 8, `architecture.md` §4.1): tick 직후 유휴가 10 ms 이상이면 8 tick마다 `Bun.gc(false)`(비동기
  요청). 벤치 tick p99 23.56 → 13.23(20 Hz 주기), 4000 tick 장기 26.75 → 17.94, CPU 변화는 잡음 범위, 힙은 36–182 MB에서 진동(증가 없음).
- **실서버는 구성이 다르다.** 입력 경로 할당 탓에 eden이 거의 매 tick(≈18–21회/초 — 평균 비용)이다. **monolith 700**: 꼬리는 full 수집이고
  페이서가 그것을 줄인다(7 → 2회/런) — tick p99 26.08 → 22.95(3회 중앙값, 범위 23.45–26.74 → 22.72–23.11), 25 ms 초과 0–13 → 1–3,
  가장 느린 1%의 스냅샷 몫 +2.2–10.6 → +1.4–3.3 ms. **월드(N=2)**: full 수집이 줄지 않고(끔 7 / 켬 9) p99 변화는 런 편차 안이다(1200 4회
  중앙값 ≈28.9 → ≈26.4, 1150 25.73 → 25.95). 남은 월드 꼬리의 원인은 미확인 — eden 정지 최대 11–16 ms가 후보, 다음은 입력 경로 할당 축소.
- 어느 구성에서도 p99·CPU·RSS를 나쁘게 하지 않아 Bun 1.3.13에서는 기본 켬(8)이었다. 실서버에서 K=4는 8보다 낫지 않았다. → Bun 1.4.3 재튜닝 후 기본은 끔(0)("Bun 1.4.3 — 수용 인원·GC 페이서·소크").

### 1. 벤치 — 정책 비교 (Windows, 1200 tick, 예열 200)

| 조건 | 정책 | tick 평균 | tick p99 | 스냅샷 p99/평균 | tick 안 GC | CPU ms/tick(전 스레드) | 비고 |
|---|---|---|---|---|---|---|---|
| tick 연속 | 없음 | 11.03 | 24.36 | 2.20 | 3.6% | — | 가장 느린 1% 12/12가 GC tick |
| tick 연속 | 매 tick `fullGC()`(tick 밖) | 10.24 | 13.68 | 1.35 | 0 | — | 호출당 9.9 ms — 비용 과다 |
| tick 연속 | 매 tick `edenGC()` | 10.65 | 14.60 | 1.37 | 0 | — | 이 루프에서 호출당 53.6 ms — 기각(단독 측정은 1.1 ms, 원인 미확인) |
| 20 Hz 주기 | 없음 | 10.48 | 23.56 | 2.28 | 3.8% | 24.99 | |
| 20 Hz 주기 | 8 tick마다 `Bun.gc(false)` | 9.87 | **13.23** | 1.34 | 0.2% | 25.83 | 채택(당시 기본 8 — 1.4.3에서 끔) — 호출 평균 0.30 ms·p99 3.5 |
| 20 Hz 주기 | 16 tick마다 | 10.26 | 13.59 | 1.32 | 0 | 24.26 | |
| 20 Hz 주기 | 32 tick마다 | 10.67 | 21.68 | 1.78 | 1.5% | 26.03 | 자연 GC 간격(≈26 tick)보다 김 |
| tick 연속, 힙 ≈1 GB | 없음 | 11.23 | 43.05 | 3.52 | — | 28.45 | |
| tick 연속, 힙 ≈1 GB | 16 tick마다 `Bun.gc(false)` | 10.65 | 15.15 | 1.42 | 0 | 27.30 | 호출 평균 2.4 ms·p99 7.4 |
| tick 연속, 힙 ≈1 GB | 16 tick마다 `fullGC()` | 10.15 | 13.97 | 1.37 | 0 | 46.25 | 호출당 81.7 ms(tick 주기 초과) — 기각 |
| tick 연속 | 동시 GC 끔(`BUN_JSC_useConcurrentGC=false`) | 10.59 | 23.08 | 2.12 | 3.8% | 23.24 | GC tick 그대로 — 기각 |

- 장기(20 Hz, 4000 tick): 없음 p99 26.75·평균 11.34·25 ms 초과 62 → 8 tick마다 17.94·10.12·11. 500 tick 창별 p99는 페이싱 중에도 2개 창이
  23.8–26.1(full 수집 — 실서버와 같은 잔여).
- 레포 도구로 재현(`tools/perf/README.md`): `--cadence 1 --gc-pace 0` p99 20.06(스냅샷 16.44) → `--gc-pace 8` 14.06(11.29).
- 단독 호출 비용(힙 ≈70 MB, 8회 중앙값): `Bun.gc(false)` 0.23 ms · `edenGC()` 1.08 · `fullGC()` 25.9 · `Bun.gc(true)` 26.5.
- GC를 tick에 귀속시킨 방법: `BUN_JSC_logGC=1`(수집마다 stderr 1줄 — 종류·정지·cycle)과 같은 fd에 tick 시작·끝 마커를 동기 쓰기
  (`writeSync(2, …)`)로 넣고 마커 사이의 수집을 그 tick에 넣었다. 힙 지표(`heapSize`·`heapStats`)는 수집 뒤에만 바뀌어 할당량 대리값이 못 된다.

### 2. 실서버 (WSL2, 핀 고정, 런별)

| 구성 | CCU | 페이서 | tick p99 (런별) | 25 ms 초과 | tick 평균 | 가장 느린 1%의 스냅샷 몫 |
|---|---|---|---|---|---|---|
| monolith | 700 | 끔 | 23.45 / 26.08 / 26.74 | 0 / 13 / 13 | 18.87 / 19.16 / 18.29 | +2.2 / +7.7 / +10.6 |
| monolith | 700 | 8 | 22.72 / 22.95 / 23.11 | 3 / 1 / 2 | 18.39 / 18.36 / 18.38 | +1.8 / +3.3 / +1.4 |
| N=2 | 1150 | 끔 | 25.73 / 73.10* / 23.43 | 8 / 118 / 5 | 14.34 / 23.28 / 14.59 | +14.5 / +135.5 / +13.9 |
| N=2 | 1150 | 8 | 21.58 / 25.95 / 27.42 | 5 / 8 / 8 | 14.33 / 14.42 / 14.57 | +9.7 / +14.5 / +12.8 |
| N=2 | 1200 | 끔 | 26.25 / 32.25 / 31.56 (+GC 로그 런 23.17) | 11 / 13 / 13 (4) | 15.95 / 16.15 / 16.18 (14.51) | +13.9 / +15.9 / +17.3 (+10.0) |
| N=2 | 1200 | 8 | 26.10 / 26.06 / 26.68 (+GC 로그 런 26.87) | 8 / 9 / 8 | 15.41 / 15.62 / 15.51 | +9.3 / +9.6 / +12.5 |
| N=2 | 1200 | 4 | 32.95 / 25.89 | 14 / 8 | 15.99 / 15.99 | +15.1 / +12.8 |

* 호스트 끊김 이상치(4.5 "이상·주의" 2와 같은 모양). 스냅샷이 중앙값 + 6 ms를 넘는 tick: monolith 끔 0/4/4 → 켬 0/1/0, N=2 끔 10–66 → 켬
5–12. 느린 tick은 8 tick 주기에 몰리지 않는다(요청한 GC가 다음 tick으로 번지지 않음). N=2의 남은 느린 tick은 2–5개 연속 묶음이다.

### 3. 실서버 GC 구성 (`BUN_JSC_logGC=1`, 런 1회 ≈90초 — 램프 포함)

| 프로세스 | 페이서 | eden(정지 중앙값 / 최대) | full(정지 중앙값 / 최대) | 힙 최대 |
|---|---|---|---|---|
| monolith 700 | 끔 | 1570회 (2.26 / 13.5 ms) | 7회 (13.4 / 21.2 ms) | 78 MB |
| monolith 700 | 8 | 1746회 (2.06 / 11.1 ms) | **2회** (9.7 ms) | 78 MB |
| 월드 N=2 1200 | 끔 | 1921회 (2.23 / 15.7 ms) | 7회 (1.2 / 7.0 ms) | 124 MB |
| 월드 N=2 1200 | 8 | 1739회 (2.35 / 11.0 ms) | 9회 (1.2 / 17.2 ms) | 125 MB |
| 게이트웨이 2개 | 8(무관 — 게이트웨이엔 tick이 없다) | 1668·1871회 (≈1.05 ms) | 5·6회 | 122–125 MB |

- 횟수 정정(B3b 측정 때 확인): 이 표의 횟수는 종료 기록이 START 줄에 같이 남은 수집(한 번에 끝난 수집)만 셌다. START 토큰 기준 monolith는
  끔 eden 1887·full 25 / 켬 2023·24회다 — 페이서가 줄인 것은 한 번에 끝나는 full(정지 13–21 ms, 7 → 2회)이고 full 총수는 그대로다. 꼬리를
  만드는 것은 그 단일 정지 full이라 결론은 같다(아래 "이진 전환 B3b" 절 집계 방법).

- **벤치와 다른 점**: 벤치는 자연 eden이 ≈26 tick마다 1번(할당은 tick 안 스냅샷 경로)이지만 실서버는 ≈18–19회/초 — tick 밖 입력 경로(소켓·IPC
  수신 디코드, INPUT_CMD JSON 20 Hz × CCU)가 할당을 지배한다. 그래서 실서버의 eden은 평균 비용이다. monolith의 p99는 full 수집(정지 13–21 ms)이
  정하고 페이서가 그 횟수를 줄인다. 월드는 full 수집이 짧고(≤17 ms) 페이싱으로 줄지 않아 꼬리 원인이 다르다(미확인 — eden 정지 꼬리가 후보).
- 다음: 월드 입력 경로 할당 축소(INPUT_CMD 이진화·게이트웨이 사전 디코드 — ADR 0002 §7). → B2b(C2S 바이너리)에서 측정: eden 빈도의 주원인이
  아니었다(아래 "이진 전환 B2b" 절). RSS는 페이서로 늘지 않았다(monolith 170–180 →
  162–172 MB).
- 원자료: WSL `~/perf-gc`(`n2-off`·`n2-on`·`n2-k4`·`n2-loggc`·`mono-off`·`mono-on`·`mono-loggc`, `tail45.py` 출력), 벤치는 측정 PC 로컬
  scratch `snaptail/`·`gcpace/`.

## 이진 전환 B2b — C2S 바이너리 전후 (2026-10-12)

> 계획(ADR 0003) B2b 측정 — 동기였던 "월드 할당 대부분이 입력 경로(INPUT_CMD `JSON.parse` 20 Hz × CCU)" 가설 검증. 같은 세션 교차 측정:
> A = `1281a45`(B2a — C2S JSON), B = `ee0821f`(B2b — C2S 바이너리). WSL 체크아웃 2개(`~/mmorpg-a`·`~/mmorpg` — 부하 생성기도 각 체크아웃 것),
> 방법은 위 GC 페이서 절과 같다(핀 고정, spread, 조인 100/s, hold 30 s, 페이서 8). A→B 순서로 3회, monolith는 순서 편향 확인용 B→A 2회 추가,
> GC 로그 런(`BUN_JSC_logGC=1`) monolith 2쌍(A→B, B→A)·N=2 1200 1쌍. 16+6런 전부 kick 0·오류 0·20 Hz.

### 요약

- **수신 바이트 −54%**: monolith 746 → 344 KB/s, 월드 N=2 1150 1,226 → 566 KB/s(패킷 수는 같다 — 14.7k/s).
- **서버 CPU −9~10%**: monolith 0.67 → 0.60코어(5회 평균), 월드 N=2 0.69–0.73 → 0.64–0.67. `applyInputs` 단계는 잡음 범위(0.45 → 0.42 ms).
- **tick p99는 변하지 않았다**(런 편차 안): monolith 700 21.6 → 22.5(5회 평균), N=2 1150 17.6 → 18.9, 1200 19.4 → 19.7(3회 평균).
- **GC — 가설 기각**: eden 정지는 짧아졌다(monolith 중앙값 3.0 → 1.8–2.1 ms, 최대 27–31 → 4.6–5.5 ms, 월드 최대 38.8 → 10.4 ms). 하지만
  eden 횟수는 줄지 않았다(monolith 1175–1230 → 1405–2304회/런, 월드 1463 → 1886회). 입력 경로 JSON 디코드는 eden 빈도의 주원인이 아니다 —
  할당 대부분은 다른 곳(송신·스냅샷 경로 추정)이고 S2C flip(B3b) 측정에서 다시 본다. full 수집은 런마다 들쭉날쭉해 방향이 없다.
- **이상 — monolith flush +1.9 ms**: monolith tick 평균 16.7 → 18.5 ms, 늘어난 몫이 전부 flush(소켓 쓰기) 단계다(11.3 → 13.3). 순서를 바꿔도
  재현됐다(B→A r4·r5). B2b는 송신 경로를 바꾸지 않았고 서버 CPU는 오히려 줄었다. 부하 생성기 소켓에 쓰는 쪽(monolith flush, 게이트웨이 CPU
  0.80 → 0.85코어)만 늘고 IPC로 쓰는 월드는 그대로다. 그래서 부하 생성기 쪽 상호작용으로 추정한다 — B 부하 생성기 CPU가 monolith +2%,
  N=2 **+25%**(1.20 → 1.51코어)인데 B2b의 부하 생성기 변경은 프레임 인코더 교체(서버 `encodePacket`)뿐이고 그 인코더는 더 빠르다(INPUT_CMD
  0.64 → 0.37 µs/패킷, Windows 마이크로벤치). 원인은 미확인 — 실클라 측정과 B3b 재측정에서 확인한다.
- 참고: A의 절대값은 위 GC 페이서 절(10-11, `f6ea19d`)보다 낮다(monolith p99 ≈23 → ≈21.6, N=2 1200 ≈26.4 → ≈19.4). 날짜·호스트 상태 차이가
  섞여 있어 특정 커밋에 귀속하지 않는다.
- **정정 — 배치 비대칭(B3b 측정 뒤 검증에서 발견)**: 이 측정의 A 서버는 핀 고정되지 않았다 — pinmon이 `~/mmorpg/server`의 bun만 서버로
  분류해 A(`~/mmorpg-a`)의 monolith·월드·게이트웨이가 부하 생성기 CPU `0,1,8–11`에서 샤드와 함께 돌았다. 그래서 위 시간·CPU 지표(서버 CPU
  −9~10%, tick, monolith flush +1.9 ms, 부하 생성기·게이트웨이 CPU)의 A↔B 차이는 배치와 섞여 있어 확정이 아니다. 바이트 지표(수신 −54%)와
  eden 횟수(할당량)는 영향이 작아 "입력 경로 가설 기각"은 유지한다. 자세한 것과 GC 횟수 정정은 아래 "이진 전환 B3b" 절.

### 표 (런별, A → B)

| 구성 | CCU | 체크아웃 | tick p99 | tick 평균 | flush·스냅샷 평균 | 서버 CPU | 부하 생성기 CPU |
|---|---|---|---|---|---|---|---|
| monolith | 700 | A | 22.04 / 20.23 / 22.75 / 22.19 / 20.93 | 16.45 / 16.38 / 16.74 / 16.91 / 16.91 | flush 11.2–11.5 · 스냅샷 4.2–4.5 | 0.65–0.68 | 0.80–0.82 |
| monolith | 700 | B | 22.28 / 21.95 / 23.25 / 22.19 / 22.68 | 18.59 / 18.23 / 18.63 / 18.56 / 18.73 | flush 13.1–13.5 · 스냅샷 4.2–4.3 | 0.59–0.60 | 0.81–0.86 |
| N=2 | 1150 | A | 16.74 / 17.91 / 18.08 | 13.09 / 12.99 / 12.71 | 스냅샷 9.6–9.8 | 0.69–0.71 | 1.19–1.20 |
| N=2 | 1150 | B | 17.14 / 19.31 / 20.19 | 13.19 / 13.38 / 13.41 | 스냅샷 9.9–10.1 | 0.64 | 1.49–1.51 |
| N=2 | 1200 | A | 19.44 / 19.02 / 19.70 (GC 로그 런 19.24) | 14.08 / 14.03 / 14.06 | 스냅샷 10.6–10.7 | 0.72–0.73 | 1.21–1.24 |
| N=2 | 1200 | B | 19.02 / 19.90 / 20.19 (GC 로그 런 20.90) | 13.99 / 14.24 / 14.33 | 스냅샷 10.6–10.9 | 0.65–0.67 | 1.50–1.55 |

- monolith r4·r5는 B→A 순서. N=2 서버 CPU는 월드 프로세스, 게이트웨이 2개 합은 A 0.79–0.82 → B 0.83–0.88코어.
- 월드 IPC 플러시 단계는 0.28 → 0.25 ms.

### GC 구성 (`BUN_JSC_logGC=1`, 런 1회 ≈90초 — 램프 포함)

| 프로세스 | 체크아웃 | eden(정지 중앙값 / 최대) | full(정지 중앙값 / 최대) | 힙 최대 | 그 런 tick p99 |
|---|---|---|---|---|---|
| monolith 700 | A (g1 / g2) | 1230회 (2.96 / 27.2) · 1175회 (3.06 / 30.5) | 3회 (10.9 / 11.1) · 2회 (42.1) | 75–76 MB | 20.61 · 34.53 |
| monolith 700 | B (g1* / g2) | 2304회 (1.75 / 4.6) · 1405회 (2.05 / 5.5) | 0회 · 6회 (11.3 / 14.2) | 77 MB | 19.58 · 22.22 |
| 월드 N=2 1200 | A | 1463회 (3.01 / 38.8) | 3회 (2.0 / 11.4) | 125 MB | 19.24 |
| 월드 N=2 1200 | B | 1886회 (2.35 / 10.4) | 10회 (1.1 / 2.0) | 123 MB | 20.90 |
| 게이트웨이 2개 | A / B | 1568·1728회 (1.5) / 1573·1809회 (1.0) | 2·4회 / 9·3회 | 116–121 MB | — |

\* B g1은 로그인 램프가 이례적으로 길었다(핸드셰이크 p99 11.4 s — 다른 B 런은 84–95 ms). eden 횟수는 램프를 포함한 전체 런 기준이라 이 런이 크다.

- 횟수 정정: 이 표의 eden·full 횟수는 종료 기록이 START 줄에 같이 남은 수집만 센 값이라 실제보다 적다. 토큰 기준 횟수는 아래
  "이진 전환 B3b" 절 "이전 절 정정"에 있다(결론은 같다).

- 원자료: WSL `~/perf-b2b`(`mono-a`·`mono-b`·`n2-a`·`n2-b`·`*-gc`, `runs.log`, `runab.sh`·`matrix.sh`), 분석 스크립트는 측정 PC 로컬 scratch
  `gcpace/`(`gclog.py`·`b2bagg.py`·`b2bcpu.py`).

## 이진 전환 B3b — 고빈도 S2C 바이너리 전후 (2026-10-12)

> 계획(ADR 0003) B3b 측정 — B2b에서 넘어온 "남은 할당은 송신·스냅샷 경로" 가설과 monolith flush +1.9 ms 재확인. 같은 세션 교차 측정:
> A = `53280f9`(B3a — 고빈도 S2C JSON), B = `4575747`(B3b — 고빈도 S2C 11개 바이너리). 체크아웃·방법은 위 B2b 절과 같다(`~/mmorpg-a`·`~/mmorpg`,
> spread, 조인 100/s, hold 30 s, 페이서 8) — **핀 고정도 B2b와 같은 비대칭이다**(A 서버 미고정 — 아래 "배치 비대칭"). A→B 3회, monolith는
> B→A 2회 추가, GC 로그 런 monolith 2쌍(A→B, B→A)·N=2 1200 1쌍 — 22런, 서버 오류 0(부하 생성기 오류 수는 KICK 9 수와 같다).
> 측정 직전 WSL VM이 재시작됐고 측정 후반에는 측정 PC에서 다른 앱(≈2코어)이 돌았다.

### 요약

- **월드 → 게이트웨이 IPC 바이트 −48%**: N=2 1150 15.6–16.8 → 8.5–8.8 MB/s, 1200 16.7–18.2 → 8.7–9.4 MB/s.
- **클라 송신 바이트 −8%**: monolith 700(전원 접속 런) 46.0–46.3 → 42.2–43.2 MB/s, 게이트웨이 2개 합 1150 127 → 116 MB/s·1200 136–138 →
  125–126 MB/s. spread의 송신은 이미 바이너리인 SNAPSHOT_DELTA가 대부분이라 flip 11개의 몫이 작다. 수신은 같다(C2S는 양쪽 다 바이너리 —
  monolith 342–344 KB/s).
- **GC — 고빈도 S2C 문자열화도 eden 빈도의 주원인이 아니다**: eden 횟수(할당량이 정한다 — 배치·잡음에 덜 민감)는 접속자당 monolith가 같고
  (A 2.21·2.50 / B 2.45·2.47회/명), 월드는 B가 조금 많다(A ≥1346회/1102명 → B ≥1659회/1200명, 접속자당 +13%). B2b(C2S)에 이어 B3b(고빈도
  S2C)도 eden 빈도를 줄이지 못했다 — 남은 할당원은 할당 프로파일로 찾는다. eden 정지 최대(monolith 44–61 → 12–14 ms)와 monolith 힙 최대
  (70–75 → 65 MB)는 B가 낮지만 정지 시간은 배치에 민감해 결론으로 쓰지 않는다.
- **시간·CPU 지표는 결론 불가 — 배치 비대칭 + 호스트 잡음**: A 서버는 부하 생성기와 같은 CPU에서 돌았고(아래), 이 세션은 변경과 무관한
  단계까지 B2b 세션보다 느렸다(같은 체크아웃끼리 — monolith ≈1.5배: `applyInputs` 평균 0.45 / 0.42 → 0.70 / 0.64 ms, 월드 ≈1.8–2.8배: 스냅샷
  10.4 → 18.9 ms·`applyInputs` 0.82 → 2.28 ms, 월드 CPU 0.64–0.73 → 0.90–0.94코어). tick p99는 monolith A 29.7–85.3 / B 31.1–81.9, N=2 A
  44.2–84.6 / B 52.6–114.9로 런 편차가 차이보다 크다. `ipcFlush` 단계(0.55–0.90 → 0.41 ms 이하, B의 잡음 런 r2-1200 0.83 제외)도 시간 지표라
  같은 제약이 있다.
- **입장 램프 KICK 9 — 분리되지 않음**: A는 레벨 런 14개 중 7개에서 29–124명이 핸드셰이크 중 접속 제한(KICK 9 "server busy")으로 거절됐고
  B는 14개 전부 0이다. 접속 제한은 tick 루프 공백(skip — 시간 신호, 서버 로그 `overload entered … cause: skips`)이 트리거라 위 잡음·배치에
  그대로 노출된다. 램프는 ENTITY_SPAWN 팬아웃이 몰리는 구간이라 B3b 효과일 수 있지만, A 서버가 램프 중 바쁜 부하 생성기 샤드와 CPU를
  나눠 쓴 탓과 분리되지 않는다(과부하 진입 런 A 12/14 · B 3/14 — B는 램프 밖). B2b 세션(같은 비대칭, 한가한 호스트)에서는 양쪽 다 0이었다.
- **"B 쪽이 늘 나쁘다" 반복 이상 → 배치 비대칭이 1순위 원인**: B2b와 같은 모양이 다시 나왔다 — monolith flush A 10.6–11.5 ms(잡음 런 r3·r4
  제외, 전원 접속 r5 11.46) → B 13.2–14.1 ms(잡음 런 r3 15.67 제외), 부하 생성기 CPU N=2 +28%(평균 1.68 → 2.14코어, monolith는 1.00–1.29 /
  1.08–1.17로 비슷), 게이트웨이 CPU +11%(평균 1.04 → 1.16코어). B3b의 부하 생성기 변경은 저빈도 내장 패킷(KICK·PONG·MANA_UPDATE)의 바이너리
  디코드뿐이고 spread는 엔티티 추적을 끈다(MOVE_PATH 등은 세기만 한다) — 코드로는 설명되지 않는다. 대신 아래 배치 비대칭이 B2b·B3b 두
  측정에 똑같이 있었다: A 서버는 부하 생성기와 같은 CPU에서(루프백 송수신이 같은 CPU 집합 안), B 서버는 전용 코어에서 부하 생성기 소켓에
  쓴다. 2순위 가설은 체크아웃 환경 차이(`~/mmorpg` = 10-07 설치 hoisted `node_modules` + zod 4.6.5, `~/mmorpg-a` = isolated + zod 4.6.6).
  pinmon을 고쳤으니(아래) B6 최종 측정에서 **같은 커밋을 두 체크아웃에서 돌려** 둘을 가른다.

### 배치 비대칭 (B2b·B3b 공통 — 측정 뒤 검증에서 발견)

- 핀 고정 스크립트(측정 PC WSL `~/perf-s45m/scripts/pinmon.py`)는 cwd가 `~/mmorpg/server`인 bun만 서버(world·gw)로 분류했다. 그래서 A
  체크아웃(`~/mmorpg-a/server`)의 monolith·월드·게이트웨이는 전부 "loadgen other"로 잡혀 부하 생성기 CPU `0,1,8–11`에 샤드와 함께 고정됐고,
  B는 4.5 이후 방법대로 월드·monolith `2,3`(물리 코어 1개)·게이트웨이 `4,5`/`6,7`이었다(`pinmon.jsonl`의 pin 이벤트 — `~/perf-b2b`도 같다).
- 영향: 바이트 지표(송신·수신·IPC)와 eden 횟수는 영향이 작다. 시간·CPU 지표(tick·단계·flush·서버/게이트웨이/부하 생성기 CPU), GC 정지,
  과부하 기반 kick은 A↔B 비교에 배치 차이가 섞여 있다 — B2b 절의 "서버 CPU −9~10%"와 "monolith flush +1.9 ms"도 마찬가지다.
- 조치: pinmon이 두 체크아웃을 모두 서버로 인식하게 고쳤다(`SERVER_CWDS`, 원본은 `pinmon.py.bak-20261013`). 다음 교차 측정은 런마다
  `pinmon.jsonl`의 pin 이벤트로 서버 프로세스가 `2,3`(게이트웨이 `4,5`/`6,7`)에 놓였는지 먼저 확인한다.
- **확인(B6 최종 측정)**: 같은 커밋·같은 의존성을 두 체크아웃에서 대칭 배치로 돌리면 차이가 없고, A 서버만 부하 생성기 CPU에 두면 위 반복
  이상(flush +2 ms·N=2 부하 생성기 CPU +28%)이 그대로 재현된다 — 원인은 이 비대칭이다(아래 "이진 전환 B6 — 최종" ①·④).

### 표 (런별, A → B)

| 구성 | CCU | 체크아웃 | 접속 | tick p99 | tick 평균 | flush·스냅샷 평균 | 부하 생성기 CPU | 송신 |
|---|---|---|---|---|---|---|---|---|
| monolith | 700 | A | 576 / 625 / 700 / 634 / 700 | 30.93 / 29.65 / 67.66 / 85.34 / 30.11 | 17.99 / 17.58 / 23.93 / 30.81 / 19.45 | flush 10.8–16.8 · 스냅샷 5.3–10.1 | 1.00–1.29 | 31.1 / 36.2 / 46.0 / 37.2 / 46.3 MB/s |
| monolith | 700 | B | 700 × 5 | 39.16 / 33.75 / 81.92 / 34.34 / 31.08 | 22.45 / 20.79 / 24.61 / 20.45 / 20.13 | flush 13.2–15.7 · 스냅샷 5.6–7.0 | 1.08–1.17 | 42.2–43.2 MB/s |
| N=2 | 1150 | A | 1150 / 1150 / 1121 | 53.02 / 44.24 / 55.18 | 24.77 / 24.16 / 24.71 | 스냅샷 17.4–18.2 · ipcFlush 0.55–0.64 | 1.62–1.65 | IPC 16.8 / 16.7 / 15.6 · 클라 127 / 127 / 120 MB/s |
| N=2 | 1150 | B | 1150 × 3 | 52.71 / 52.56 / 61.60 | 22.41 / 24.31 / 25.28 | 스냅샷 16.3–18.5 · ipcFlush 0.38–0.41 | 2.02–2.14 | IPC 8.6 / 8.8 / 8.5 · 클라 116 / 117 / 116 MB/s |
| N=2 | 1200 | A | 1200 × 3 | 84.60 / 55.16 / 54.79 | 30.75 / 27.50 / 25.85 | 스냅샷 18.8–21.7 · ipcFlush 0.57–0.90 | 1.67–1.78 | IPC 18.2 / 17.4 / 16.7 · 클라 137 / 138 / 136 MB/s |
| N=2 | 1200 | B | 1200 × 3 | 54.92 / 114.94 / 55.95 | 24.79 / 33.87 / 25.15 | 스냅샷 18.6–23.7 · ipcFlush ≤0.33 / 0.83 / 0.35 | 2.08–2.35 | IPC 9.4 / 8.7 / 8.8 · 클라 126 / 113 / 125 MB/s |

- 접속 = 핸드셰이크를 마친 봇 수, 나머지는 전부 KICK 9(GC 로그 런 포함 레벨 런 A 7/14개 — monolith 124·75·66·60·109명, N=2 29·98명 / B 0/14개).
- monolith r4·r5는 B→A 순서. r3은 A·B 모두 호스트 스파이크(tick 최대 212 / 118 ms)가 들어간 런이다.
- 서버 CPU: monolith A 0.77–1.03(전원 접속 0.81·0.90) / B 0.71–0.80코어, 월드(r3만 기록) A 0.92·0.94 / B 0.91·0.90코어. 게이트웨이 2개 합
  A 0.98–1.07 / B 1.09–1.22코어. 모두 배치 비대칭이 섞인 값이다.
- N=2 flush 평균(월드 `/admin/perf`)은 A 2.2–2.7 / B 2.2–3.0 ms.
- GC 로그 런의 tick p99: monolith A 34.20(640명)·26.62(591명) / B 33.20·30.99, N=2 1200 A 57.83(1102명) / B 87.25.

### GC 구성 (`BUN_JSC_logGC=1`, 런 1회 ≈90초 — 램프 포함)

| 프로세스 | 체크아웃 | 접속 | eden 횟수 | eden 정지 중앙값 / 최대 (ms) | full 횟수 | 힙 최대 |
|---|---|---|---|---|---|---|
| monolith 700 | A (g1 / g2) | 640 / 591 | 1413 · 1476 | 4.02 / 60.6 · 3.90 / 43.9 | 24 · 23 | 74.5 · 70.5 MB |
| monolith 700 | B (g1 / g2) | 700 / 700 | 1715 · 1732 | 2.94 / 11.8 · 3.03 / 14.1 | 20 · 21 | 65.6 · 65.4 MB |
| 월드 N=2 1200 | A | 1102 | ≥1346 | 4.60 / 33.5 | ≥38 | 128.6 MB |
| 월드 N=2 1200 | B | 1200 | ≥1659 | 3.16 / 24.1 | ≥33 | 145.6 MB |
| 게이트웨이 2개 | A / B | — | ≥2117 · 2189 / ≥2331 · 2377 | 2.4 / 56–66 · 1.55 / 26–28 | ≥15 · 14 / ≥11 · 9 | 117–126 / 122–131 MB |

- **집계 방법**: 횟수는 로그의 `GC<주소>: START … => Eden|FullCollection` 토큰 수다(`gccount.py` — 수집마다 1개). monolith는 START 줄 수 =
  `GC END!` 수와 같다. N=2는 4프로세스(슈퍼바이저·월드·게이트웨이 2개) stderr가 한 파일에 섞여 한 줄에 START가 여러 개 놓이므로 줄 안의
  모든 토큰을 센다. 주소가 깨진 START(5–6%)는 어느 프로세스에도 넣지 않아 N=2 값은 하한이다. 프로세스는 힙 주소로 구분하고 첫 등장
  순서(슈퍼바이저 → 월드 → 게이트웨이 1·2)로 이름을 붙였다(월드가 힙 최대 — B2b와 같다). 정지 값은 종료 기록(`=> …kb, p=…ms … cycle`)이
  START 줄에 같이 남은 수집만으로 낸 값이다(`gclog.py`).
- **이전 절 정정(같은 집계로 다시 셈)**: 위 B2b 절과 GC 페이서 절의 GC 표는 종료 기록이 START 줄에 같이 남은 수집(동시 단계 없이 한 번에
  끝난 수집으로 보인다)만 셌다. 토큰 기준 B2b는 monolith A 1717·1671 / B 2327·1682회(full 23·23 / 25·23), 월드 A ≥2439 / B ≥2607회(full
  ≥43 / ≥40), 게이트웨이 A ≥2538·2579 / B ≥2289·2451회다 — B2b의 결론(eden 횟수가 줄지 않음)은 같다. GC 페이서 절 monolith는 끔 eden 1887·
  full 25 / 켬 2023·24회다 — 페이서가 줄인 것은 한 번에 끝나는 full(정지 13–21 ms, 7 → 2회)이고 full 총수는 그대로다. 꼬리를 만드는 것은 그
  단일 정지 full이라 그 절의 결론은 같다.
- 세션 간: 월드 eden은 B2b 세션 ≥2439–2607회에서 이 세션 ≥1346–1659회로 줄었다. 그 사이 B2c·B3a 커밋과 호스트 상태가 함께 바뀌어 어느
  쪽에도 귀속하지 않는다.

- 원자료: WSL `~/perf-b3b`(`mono-a`·`mono-b`·`n2-a`·`n2-b`·`*-gc`, `runs.log`, `runab.sh`·`matrix.sh`, `pinmon.jsonl`), 분석 스크립트는 WSL
  `~/an/`(`b2bagg.py`·`b2bcpu.py`·`gclog.py`·`gccount.py`·`kicks.py`).

## 이진 전환 B6 — 최종 (전환 전 ↔ B6, 2026-10-13)

> 계획(ADR 0003) B6 최종 측정. 같은 세션에서 네 단계를 돈다. ① **체크아웃 대조** — 같은 커밋 `1eea6a6`(B6)을 `~/mmorpg-a`·`~/mmorpg` 두
> 체크아웃에서(r1 A→B, r2 B→A). 두 체크아웃은 ① 직전에 `bun install`로 같은 의존성(zod 4.6.7)이 됐다(B3b 때는 4.6.5 / 4.6.6).
> ② **전후** — A = `895d8b6`(H1 — B1 직전: 헤더 v1 6바이트 BE, 본문은 SNAPSHOT_DELTA 말고 전부 JSON), B = `1eea6a6`(B6 — 헤더 v2 4바이트 LE,
> 본문 전부 binary). A→B 3회, monolith는 B→A 2회 추가, GC 로그 런 monolith 2쌍(A→B, B→A)·N=2 1200 1쌍(A→B). ③ N=2 GC 로그 런 1쌍 더(B→A).
> ④ **배치 재현** — A·B 둘 다 `1eea6a6`, 옛 pinmon(`pinmon.py.bak-20261013`)으로 A 서버만 B2b·B3b처럼 부하 생성기 CPU `0,1,8–11`에 둔다.
> 방법은 B2b·B3b와 같다(spread, 조인 100/s, hold 30 s, 페이서 8, 부하 생성기도 각 체크아웃 것). 38런(레벨 런 48개) 전부 전원 접속·kick 0·오류 0·
> 20 Hz(19.98–20.02). **핀 확인**: ①~③ 32런은 고친 pinmon(`SERVER_CWDS`)으로 monolith·월드 `2,3`, 게이트웨이 `4,5`/`6,7`(`pinmon*.jsonl` 표본
> 이탈 0 — `~/an/pincheck.py`), ④는 B 서버만 `2,3`·`4,5`/`6,7`이고 A 서버는 `loadgen other` pin(`0,1,8–11`)이다 — B2b·B3b의 A 런 전부와 같은
> 배치(같은 도구로 `~/perf-b3b`를 보면 A 런은 서버로 분류된 프로세스가 없고 `loadgen other` pin만 있다). 측정 직전 호스트 부하 14–22%(Windows
> 작업 관리자 관찰 — 원자료 없음, Windows 앱 ≈1코어). ②의 A↔B 차이에는 코덱 밖 커밋도 섞인다 — B2c 사전 판정(수신 프레임마다, 종전 라우터
> 검사를 디코드 앞으로 옮김)·B4 인코드 방어층(송신마다 try/catch)은 패킷 경로에 닿지만 정상 경로 비용이 작고 B 쪽에 불리한 방향이다. B5-P는
> 적재 시점뿐이다.

### 요약

- **B2b·B3b 반복 이상의 원인 = 배치(재현으로 확인)**: ① 같은 커밋·같은 의존성에 배치를 대칭으로 하면 두 체크아웃의 차이는 런 편차 안이다
  (monolith flush 13.2–13.5 / 13.2–13.6 ms, 서버 CPU 0.62 / 0.61–0.63, 부하 생성기 CPU 0.89–0.90 / 0.89–0.90, N=2 월드 CPU 0.68–0.73 / 0.69–0.72·
  게이트웨이 0.89–0.97 / 0.90–0.95·부하 생성기 1.59–1.72 / 1.63–1.67코어 — 양방향으로 엇갈린다). ④ 같은 커밋·같은 의존성에서 A 서버만 부하
  생성기 CPU에 두면 이상이 그대로 재현된다 — monolith flush A 10.73·11.05 / B 13.26·13.34 ms(B2b 11.2–11.5 / 13.1–13.5), tick 평균 16.10·16.41 /
  18.72·18.97, N=2 1150 부하 생성기 CPU 1.27 / 1.63코어(B +28% — B3b +28%). 그래서 B2b·B3b의 "B 쪽 flush +2 ms·N=2 부하 생성기 CPU +25~28%"는
  코드도 의존성도 아니라 배치 탓이다. 부하 생성기 CPU에 놓인 서버의 flush가 빠른 기전은 미확인이다(넓은 CPU 집합·SMT 형제 경합 회피, 또는
  루프백 송수신이 같은 CPU 집합 안). 전용 물리 코어 1개(`2,3` — `lscpu -e` 같은 CORE) 고정은 보수적인 기준이다.
- **바이트**: 수신 **−56%**(monolith 775 → 344 KB/s, N=2 1150 1,273 → 565·1200 1,328 → 590 KB/s — C2S 바이너리 + 헤더 6 → 4바이트), 월드 →
  게이트웨이 IPC **−45%**(1150 15.9 → 8.7, 1200 17.1 → 9.4 MB/s), 클라 송신 **−6%**(monolith 45.8 → 42.9 MB/s, 게이트웨이 합 1150 123.7 →
  115.8·1200 134.5 → 126.4 MB/s — spread 송신은 원래 바이너리인 SNAPSHOT_DELTA가 대부분).
- **CPU·단계 시간**: monolith 서버 CPU **−8%**(0.66 → 0.61코어), 월드 −5~7%(1150 0.73 → 0.68, 1200 0.74 → 0.70), 게이트웨이 2개 합 −3~6%. 스냅샷
  단계 **−9~15%**(monolith 4.64 → 4.12, N=2 1150 11.79 → 10.08·1200 12.31 → 11.19 ms — 그 사이 스냅샷 경로의 코덱 밖 최적화는 없다. 이벤트
  프레임(ENTITY_SPAWN·DESPAWN)의 JSON 직렬화(엔티티당 1회)와 프레임 크기(뷰어별 복사·N=2 IPC 레코드 바이트)가 줄었다 — 단계 안의 몫(직렬화·
  복사·GC)은 나누어 재지 않았다), 월드 `ipcFlush` −30~32%(0.27–0.34 → 0.19–0.22 ms). monolith flush(소켓 쓰기 — 13.2–13.5 ms)와 부하 생성기 CPU는
  같다.
- **tick**: 평균은 monolith −2%(18.91 → 18.50), N=2 −8~12%(1150 15.63 → 13.70, 1200 16.39 → 15.08 ms). p99는 monolith(24.48 → 24.49)와 N=2 1200
  (26.72 → 27.04)이 런 편차 안이다. N=2 1150은 3/3 런에서 B가 낮지만(27.16 → 23.14, −15%) 같은 커밋 대조(①)의 1150 런 범위(21.7–25.5 ms)만큼이라
  판정을 보류한다 — 꼬리는 GC 페이서 절의 결론대로 tick 안 GC가 정한다.
- **GC — monolith 할당은 줄었고 월드는 늘었다**: monolith는 eden **−14%**(1,996·1,984 → 1,707·1,722회/런), 할당 추정 **−8~11%**(짝지은 구간 합
  16.7–17.0 → 15.0–15.1 GiB/런 — `gcalloc.py`, 짝 비율이 A 83–84%·B 81%라 수집당 평균 × 수집 수로 보정하면 20.2–20.3 → 18.5–18.6 GiB —
  `cleanpairs.py`), 힙 최대 −11%(75–77 → 67–68 MB), full 23–24 → 19회. 월드(N=2 1200, 2쌍)는 eden ≥2,441–2,454 → ≥2,622–2,680(쌍별 +7~9%),
  할당 추정 44.9–45.7 → 56.3–59.2 GiB(쌍별 **+25~30%** — 수집당 18.5–18.8 → 21.8–22.4 MiB), 힙 최대 124–125 → 131–134 MB, full ≥40–43 → ≥27회.
  같은 방법으로 인접 쌍을 보면 B2b(B2a ↔ B2b) 월드 할당은 −20%(60.0 → 48.3 GiB), B3b(B3a ↔ B3b)는 −23%(41.5 → 32.1 GiB — 짝 비율 20–31%라
  거칠다)였다. 둘 다 A가 부하 생성기 CPU에 놓인 측정이라 월드 할당의 실제 방향과 증가분의 출처(B4~B6 커밋인지, 배치·세션 차이인지)는 판정을
  보류한다. 확실한 것: 프로토콜 JSON 제거는 monolith 할당을 1할 남짓 줄였고 월드 eden 빈도는 줄이지 못했다 → 다음 월드 할당 프로파일은
  `895d8b6`·B6 두 커밋에서 같이 잰다(CLAUDE.md "성능 다음").
- B2b·B3b 절의 시간·CPU 비교는 이 절이 대체한다(같은 배치·같은 세션의 전환 전후). 이 세션은 B3b 세션(monolith `applyInputs` 체크아웃별 평균
  0.64–0.70 ms)보다 훨씬 한가했고 B2b 세션에 가까웠다(같은 `2,3` 배치의 B2b B 런 0.41–0.44 → 이 세션 0.46–0.50, ≈1할 느림).

### ① 체크아웃 대조 (같은 커밋 `1eea6a6`·같은 의존성, 런별 r1 / r2 — r1은 A→B, r2는 B→A)

| 구성 | CCU | 체크아웃 | tick p99 | tick 평균 | flush·스냅샷 | 서버 CPU | 게이트웨이 CPU | 부하 생성기 CPU | 송신 |
|---|---|---|---|---|---|---|---|---|---|
| monolith | 700 | A | 25.95 / 23.96 | 18.74 / 18.59 | flush 13.54 / 13.22 · 스냅샷 4.15 / 4.28 | 0.62 / 0.62 | — | 0.90 / 0.89 | 42.7 / 42.9 MB/s |
| monolith | 700 | B | 26.53 / 26.43 | 18.67 / 19.12 | flush 13.16 / 13.59 · 스냅샷 4.40 / 4.42 | 0.61 / 0.63 | — | 0.90 / 0.89 | 43.3 / 43.4 MB/s |
| N=2 | 1150 | A | 21.71 / 23.42 | 13.87 / 13.90 | 스냅샷 10.25 / 10.17 | 0.68 / 0.69 | 0.89 / 0.91 | 1.59 / 1.63 | IPC 8.68 / 8.24 MB/s |
| N=2 | 1150 | B | 25.49 / 22.63 | 14.35 / 14.10 | 스냅샷 10.57 / 10.52 | 0.70 / 0.69 | 0.93 / 0.92 | 1.65 / 1.63 | IPC 8.73 / 8.61 MB/s |
| N=2 | 1200 | A | 37.16 / 23.37 | 16.41 / 14.81 | 스냅샷 12.21 / 11.07 | 0.73 / 0.70 | 0.97 / 0.94 | 1.72 / 1.67 | IPC 9.32 / 8.75 MB/s |
| N=2 | 1200 | B | 22.43 / 24.90 | 14.77 / 15.49 | 스냅샷 10.89 / 11.41 | 0.69 / 0.72 | 0.90 / 0.95 | 1.65 / 1.67 | IPC 9.07 / 9.61 MB/s |

- N=2 서버 CPU는 월드 프로세스, 게이트웨이 CPU는 2개 합. `ipcFlush`는 양쪽 다 0.20–0.22 ms. 스냅샷 단계는 B가 6쌍 중 5쌍에서 3–6% 높다
  (잔여 편향이 있다면 ②의 개선을 작게 보이게 하는 방향).

### ② 전후 (런별, A = `895d8b6` → B = `1eea6a6`)

| 구성 | CCU | 체크아웃 | tick p99 | tick 평균 | flush·스냅샷 평균 | 서버 CPU | 게이트웨이 CPU | 부하 생성기 CPU | 수신 | 송신 |
|---|---|---|---|---|---|---|---|---|---|---|
| monolith | 700 | A | 24.48 / 25.27 / 26.41 / 23.06 / 23.14 | 18.91 / 19.43 / 19.46 / 18.86 / 18.77 | flush 13.19–13.46 · 스냅샷 4.43–4.87 | 0.65–0.68 | — | 0.88–0.93 | 775 KB/s | 45.3–46.2 MB/s |
| monolith | 700 | B | 25.17 / 26.85 / 22.65 / 24.49 / 23.61 | 18.95 / 18.91 / 18.48 / 18.50 / 18.30 | flush 13.19–13.49 · 스냅샷 4.05–4.35 | 0.60–0.63 | — | 0.88–0.91 | 344 KB/s | 42.8–43.0 MB/s |
| N=2 | 1150 | A | 27.79 / 27.16 / 24.81 | 15.63 / 16.13 / 14.94 | 스냅샷 11.39–12.10 · ipcFlush 0.27–0.30 | 0.71–0.75 | 0.92–0.94 | 1.62–1.68 | 1,273 KB/s | IPC 16.9 / 15.9 / 15.9 · 클라 125 / 124 / 123 MB/s |
| N=2 | 1150 | B | 23.14 / 23.30 / 20.29 | 13.70 / 14.12 / 13.37 | 스냅샷 9.81–10.43 · ipcFlush 0.19–0.20 | 0.66–0.68 | 0.87–0.91 | 1.55–1.64 | 565 KB/s | IPC 8.3 / 8.8 / 8.7 · 클라 116 / 116 / 116 MB/s |
| N=2 | 1200 | A | 30.90 / 26.72 / 24.87 | 16.39 / 17.03 / 15.53 | 스냅샷 11.74–12.71 · ipcFlush 0.28–0.34 | 0.72–0.76 | 0.93–0.97 | 1.62–1.74 | 1,328 KB/s | IPC 16.9 / 17.1 / 17.6 · 클라 135 / 135 / 134 MB/s |
| N=2 | 1200 | B | 27.52 / 27.04 / 23.43 | 15.08 / 15.43 / 14.75 | 스냅샷 11.01–11.46 · ipcFlush 0.21–0.22 | 0.68–0.71 | 0.89–0.95 | 1.61–1.68 | 590 KB/s | IPC 8.9 / 9.4 / 9.9 · 클라 126 / 126 / 127 MB/s |

- monolith r4·r5는 B→A 순서. N=2 flush 평균(월드 `/admin/perf`)은 A 1.46–1.68 / B 1.39–1.57 ms.
- GC 로그 런의 tick p99: monolith A 23.53·23.97 / B 27.30·24.33, N=2 1200 A 24.76·29.95 / B 21.07·32.73(g1·g2).

### ④ 배치 재현 (같은 커밋 `1eea6a6`·같은 의존성, 옛 pinmon — A 서버만 부하 생성기 CPU)

| 구성 | CCU | 체크아웃(배치) | tick p99 | tick 평균 | flush·스냅샷 | 서버 CPU | 게이트웨이 CPU | 부하 생성기 CPU |
|---|---|---|---|---|---|---|---|---|
| monolith | 700 | A(부하 생성기 CPU) r1 / r2 | 22.68 / 21.28 | 16.10 / 16.41 | flush 10.73 / 11.05 · 스냅샷 4.26 / 4.29 | 0.67 / 0.68 | — | 0.84 / 0.84 |
| monolith | 700 | B(`2,3`) r1 / r2 | 24.95 / 25.79 | 18.72 / 18.97 | flush 13.26 / 13.34 · 스냅샷 4.38 / 4.52 | 0.62 / 0.63 | — | 0.87 / 0.89 |
| N=2 | 1150 | A(부하 생성기 CPU) | 21.41 | 13.44 | 스냅샷 9.82 · ipcFlush 0.26 | 0.73 | 0.83 | 1.27 |
| N=2 | 1150 | B(`2,3`·`4,5`/`6,7`) | 27.05 | 14.43 | 스냅샷 10.72 · ipcFlush 0.20 | 0.69 | 0.89 | 1.63 |

- 순서: monolith A→B·B→A, N=2 A→B. B 행은 ①·②의 B와 같은 값대다(flush 13.2–13.6, N=2 부하 생성기 1.55–1.68).

### GC 구성 (`BUN_JSC_logGC=1`, 런 1회 ≈45초(monolith)·≈51초(N=2) — 램프 포함, 횟수는 B3b 절과 같은 토큰 기준)

| 프로세스 | 체크아웃 | eden 횟수 | eden 정지 중앙값 / 최대 (ms) | full 횟수 | 힙 최대 | 할당 추정 (`cleanpairs.py`) |
|---|---|---|---|---|---|---|
| monolith 700 | A (g1 / g2) | 1,996 · 1,984 | 2.20 / 6.0 · 2.16 / 5.7 | 23 · 24 | 74.9 · 76.6 MB | 20.3 · 20.2 GiB |
| monolith 700 | B (g1 / g2) | 1,707 · 1,722 | 2.13 / 9.5 · 2.12 / 6.6 | 19 · 19 | 67.6 · 67.3 MB | 18.5 · 18.6 GiB |
| 월드 N=2 1200 | A (g1 / g2) | ≥2,454 · ≥2,441 | 2.58 / 10.1 · 2.69 / 11.5 | ≥40 · ≥43 | 123.6 · 124.7 MB | 45.7 · 44.9 GiB |
| 월드 N=2 1200 | B (g1 / g2) | ≥2,680 · ≥2,622 | 2.66 / 12.4 · 2.68 / 12.3 | ≥27 · ≥27 | 134.3 · 131.2 MB | 59.2 · 56.3 GiB |
| 게이트웨이 (2개 × 2런) | A / B | ≥2,398–2,512 / ≥2,411–2,644 | 1.07–1.12 / 1.07–1.11 | ≥17–19 / ≥8–12 | — | — |

- **N=2 횟수는 하한**: 4프로세스 stderr가 글자 단위로 섞여 START 토큰의 ≈10%(A 850·B 853개, 대부분 게이트웨이)를 어느 프로세스에도 넣지
  못한다(`startcheck.py`). 월드는 ≈2–6%만 빠져 A↔B 방향은 같다. 정지·힙 최대도 같은 섞임에 노출된다 — 월드 힙 최대는 섞이지 않은 줄로도
  같지만 게이트웨이 힙 최대·정지 최대는 다른 프로세스 값이 섞일 수 있어 싣지 않는다.
- **할당 추정**: `cleanpairs.py` — "GC<"가 하나뿐인(섞이지 않은) 줄에서 같은 프로세스의 연속 두 수집을 짝지어 (이번 START 힙 − 직전 수집 뒤
  힙)을 수집당 할당 표본으로 쓰고, 그 평균 × 전체 수집 수를 총량으로 본다(GiB). monolith는 `gcalloc.py`(짝지은 구간 합 — 짝 비율 A 83–84%·B
  81%라 B가 적게 잡힌다)의 16.7–17.0 → 15.0–15.1 GiB와 방향·크기가 같고(−8~11%), monolith 로그는 섞임이 없어 두 방법의 수집당 평균이 같다.
  `gcalloc.py`는 섞인 줄에서 다른 프로세스의 종료 힙을 집을 수 있어 N=2에는 쓰지 않는다. 힙 크기 기준 추정이라 ArrayBuffer 바깥 메모리가
  힙 크기에 어떻게 잡히는지에 따라 JSON(문자열) ↔ binary(버퍼) 비교가 기울 수 있다 — 프로파일러로 확인할 몫.
- monolith eden 정지 최대는 B 쪽이 크지만(6.0·5.7 → 9.5·6.6 ms) 정지 시간은 배치·잡음에 민감하고 이 표는 2런뿐이다.
- 원자료: WSL `~/perf-b6`(① `c-mono-a`·`c-mono-b`·`c-n2-a`·`c-n2-b`, ② `mono-a`·`mono-b`·`n2-a`·`n2-b`·`*-gc`(③은 `n2-*-gc`의 g2), ④ `x-mono-a`·
  `x-mono-b`·`x-n2-a`·`x-n2-b`, `runs.log`, `matrix.sh`·`extra.sh`, `pinmon.jsonl`(①②)·`pinmon-x3.jsonl`(③)·`pinmon-x4.jsonl`(④)), 러너는
  `~/perf-b3b/runab.sh`(OUTBASE 지정), 분석 스크립트는 WSL `~/an/`(`b6agg.py`·`pincheck.py`·`gccount.py`·`gclog.py`·`gcalloc.py`·`cleanpairs.py`·
  `startcheck.py`).

## Bun 1.4.3 전환 — 런타임 교차 측정 (2026-10-13)

> Bun 1.4.0(2026-08-20 — Zig → Rust 재작성)~1.4.3(2026-10-10) 채택 판단. 같은 커밋 `1ae86d7`·같은 체크아웃(`~/mmorpg`)·같은 CPU 배치에서
> **서버만** Bun 1.3.13(A) ↔ 1.4.3(B)로 바꾼다 — 부하 생성기(오케스트레이터·샤드)는 1.3.13 고정(`--server-bun`, `1ae86d7` — 슈퍼바이저를 그 bun으로
> 띄우면 월드·게이트웨이가 물려받는다). 방법은 B6 최종 ②와 같다(spread, 조인 100/s, hold 30 s, 페이서 8): monolith 700 ×5(r4·r5는 B→A), N=2
> 1150·1200 ×3, GC 로그 런 monolith 2쌍·N=2 1200 2쌍(A→B, B→A). 24런 핀 이탈 0·전원 접속·kick 0·20 Hz. 부하 생성기 CPU(monolith 0.87–0.95 /
> 0.90–0.94, N=2 1.59–1.71 / 1.59–1.68)와 바이트(수신 344 / 566 / 590 KB/s, IPC, 클라 송신)는 A·B가 같다 — 부하·와이어는 같고 서버 런타임만 다르다.
> 후속(같은 날): ① 분해(`~/perf-bun14b` `d-*`) — 1.4.3에서 GC 페이서 끔(`GC_PACE_TICKS=0`)·largeHeapSize 32 MB(`BUN_JSC_largeHeapSize=33554432`)
> ② B6 보류 항목 재측정(`x-*`) — 전부 1.4.3으로 전환 전 `895d8b6` ↔ B6 GC 로그 런 ③ 원인 분리(`~/perf-bun142`) — 서버 1.4.2(샘플러 제거는 있고
> WebKit#684 계정 수정은 없다) GC 로그 런. ①② 23런·③ 8런 핀 이탈 0.

### 요약

- **CPU −18~41%**: monolith 서버 0.61 → 0.47코어(−23%), 월드 0.68–0.71 → 0.40–0.42(−41% — 1150·1200 중앙값 모두), 게이트웨이 2개 합 0.90–0.93 → 0.74(−18~20%).
- **tick**: 평균 monolith −10%(18.56 → 16.79 ms), N=2 −24%(1150 13.96 → 10.59, 1200 15.40 → 11.66). p99 monolith −10%(24.57 → 22.05 — 런 범위
  22.38–26.26 / 21.54–22.51), N=2 1150 −29%(22.88 → 16.26), 1200 −23%(24.86 → 19.09) — N=2는 전후 런 범위가 겹치지 않는다. 단계: 스냅샷
  −25~27%(monolith 4.37 → 3.18, 1150 10.24 → 7.69, 1200 11.37 → 8.40 ms), `applyInputs` −22%(monolith 0.48 → 0.38 ms). monolith flush(소켓 쓰기)는
  −3%(13.12 → 12.79 ms).
- **monolith 수치는 부하 생성기 1.3.13 조건의 값이다**: 같은 1.4.3 서버·같은 커밋이라도 부하 생성기(루프백 수신 측)까지 1.4.3이면 monolith tick
  평균 ≈21.0 ms·flush ≈16.9 ms·서버 CPU 0.55로 전부 1.3.13 기준선(tick 평균 ≈18.5 ms)보다 길다(아래 B6 재측정 표의 B). N=2(월드)는 이 영향이
  없다(11.3 / 12.0 ms). 실제 클라 수신에서의 monolith 이득 크기는 재지 않았다 — 앞으로 기준선은 부하 생성기 bun을 함께 적는다.
- **클라 체감**(중앙값): rtt99 monolith 25.0 → 19.8 ms(−21%), N=2 1150 31.7 → 22.2·1200 34.2 → 24.1 ms(−30%). lag99는 monolith 19.8 → 15.6,
  N=2 1150 34.2 → 32.9(편차 안), 1200 52.5 → 36.7 ms(런 범위가 겹친다 — A 중앙값 런은 아래 "작업 스레드 수" 경합 런).
- **GC — eden 수집 −91~95%**: 런당(≈45–51 s, 램프 포함) monolith 1,694–1,706 → 148–149회, 월드 ≥2,525–2,536 → 164–169회, 게이트웨이
  ≥2,383–2,482 → 104–118회. full은 monolith 19–20 → 15–16, 월드 ≥27–29 → 20–21, 게이트웨이 ≥10–13 → 2–4. 유휴 RSS(측정 전) 91–94 → 59–61 MB.
  힙 최대(로그) monolith 67 → 57–59 MB, 월드 133–135 → 113–124 MB — 힙·RSS는 런타임의 계정·할당기가 바뀌어(1.4 mimalloc, 1.4.3 WebKit#684)
  버전 사이에는 참고값이다.
- **유력 원인 — 1.4.0~1.4.2 런타임 변경(분리는 부분적)**: 1.4.0이 이벤트 루프 tick마다 힙을 재서 16 ms 뒤 GC를 거는 샘플러를 지웠다(oven-sh/bun
  PR #35356 — 1.3.x는 루프가 바쁘면 할당과 무관하게 eden을 최대 ≈62.5회/초까지 걸었다). 이 서버는 20 Hz tick과 상시 소켓 I/O로 루프가 늘 바빠,
  GC 페이서·B2b·B3b·B6에서 할당을 줄여도 꿈쩍하지 않던 "eden ≈19회/초"가 이것이었다는 설명이 측정과 맞는다(앱 코드는 그대로 두고 런타임만
  바꿨더니 1/10). ③ 원인 분리에서 1.4.2(#684 없음)도 eden이 1.4.3과 같아(monolith 148–149, 월드 176–195회) **1.4.3의 typed array 계정 수정
  (WebKit#684)은 eden 감소의 원인이 아니다** — #684의 효과는 게이트웨이 full에서 보인다(1.4.2 32–40 → 1.4.3 2–4회). 다만 샘플러 제거와 같은
  1.4.0~1.4.2의 다른 변경(mimalloc 할당기, Rust 런타임 자체)은 나누지 않았다. GC 로그가 보는 할당(수집당 힙 증가 × 수집 수)도 1.3.13 → 1.4.x에서
  monolith 18.5 → 1.4–1.6 GiB/런으로 함께 줄었는데(수집당 증가는 ≈9–11 MiB로 비슷하고 횟수만 1/10), 같은 앱 코드라 실제 할당이 아니라 1.3.13
  계정·트리거 방식의 차이로 보인다 — 할당 추정은 버전 사이에 비교하지 않는다. 1.4.3에 남은 eden은 대부분 GC 페이서 요청이다(끄면 monolith
  148 → 58, 월드 166 → 67회). largeHeapSize 32 → 8 MB(1.4.0)는 이 서버에 영향이 없었다(32 MB로 되돌려도 eden·tick·CPU 같음). CPU 감소에 각
  변경(할당기, Buffer read/write JIT 인라인 등)이 얼마씩 기여했는지도 나누지 않았다.
- **GC 페이서 — 1.4.3에서 판정 보류(n=2)**: tick 평균·CPU는 같다. p99는 끈 쪽이 monolith 2/2·N=2 1200 2/2 런에서 낮지만(아래 분해 표), 같은
  라운드의 기본 런(B)이 H32보다도 높아 B 쪽 잡음과 구분되지 않는다. 1.4.3에서 페이서가 eden의 약 60%를 만든다. 기본값 8은 유지하고, 재튜닝
  때 끔을 포함해 n≥3 교차로 잰다. → 재튜닝 결과 기본을 끔으로 바꿨다(아래 "Bun 1.4.3 — 수용 인원·GC 페이서·소크").
- **B6 보류 항목 — 1.4.3에서는 재현되지 않음**: 전부 1.4.3으로 전환 전(`895d8b6`) ↔ B6를 다시 재면 바이너리 쪽 할당 추정이 monolith −19%
  (1.92 → 1.56 GiB/런), 월드 −21~38%(3.13·3.27 → 1.93·2.58 GiB — 짝 표본 33–55개라 거칠고, 수집당 중앙값으로는 −16~35%)이고 eden·full도 같거나
  적다. B6 ②와 달리 부하 생성기도 1.4.3이고 할당 프로파일은 아니므로, 1.3.13에서 본 "월드 할당 추정 +25~30%"가 1.3.13 GC 계정 탓이라는 것은
  가설이다(위 원인 분리로 #684는 eden 쪽에서 배제됐다). 월드 할당 프로파일은 우선순위를 낮춰 남긴다.
- **기능·호환 — 차이 없음**: Windows·Linux 전체 시험을 1.4.3으로 통과했다(Windows server 2,538 pass/5 skip·regression 12·integration 103/1 skip·
  cluster 14/3 skip, Linux server 2,543·regression 12·integration 103/1 skip·cluster 15 — Linux는 server·cluster skip 0). 송신·클러스터 불변식이
  기대는 런타임 동작을 실소켓 프로브로 두 버전·두 OS에서 재봤고 전부 같다: `end()` 안 동기 close와 이후 write −1, 부분 쓰기 무버퍼링(수신 총량 =
  반환 합)·drain, data 50회 뒤 immediate 1회, `timeout(1)` 반올림(Linux 4.0 s·Windows ≈3.3 s), unix 리스너 stop 시 소켓 파일 삭제, IPC
  `{type:"shutdown"}` 도달·부모 강제 종료 시 Linux는 자식 disconnect 핸들러 실행 / Windows는 핸들러 없이 함께 종료. bcrypt(cost 10) 처리량도 같다
  (코어 2개 고정, 초당 100건 1,200건 → 28.5–29.2 s). 프로브는 `tools/perf/runtime/`.
- **측정 하네스 주의 — 런타임 스레드 수 경합(1.3.13에서도)**: 서버 프로세스의 런타임 스레드(bcrypt 작업 풀 `Bun Pool`, GC 마커 `HeapHelper`, JIT)
  수는 런타임이 초기화될 때 보이는 CPU 수를 따른다. pinmon이 그보다 먼저 서버를 코어 2개(`2,3`)에 고정하면 스레드가 줄어든다: 1.4.3 월드 1개
  (분해 P0 r2 1200 — HeapHelper 1·Pool 2, 정상 월드는 5·6. DevAuto bcrypt가 밀려 핸드셰이크 p99 18.9 s, 55명이 인증 전 무활동 KICK 3)와
  1.3.13 게이트웨이 2개(A N=2 r3 1200 — HeapHelper 1·Pool 2, 정상 게이트웨이는 HeapHelper 5·Pool 3–5, 접속 문제 없음)와 1.4.3 monolith 1개(③ 원인
  분리의 1.4.3 GC 런 — HeapHelper 1·Pool 2, 핸드셰이크 p99 12.3 s·tick p99 62.7 ms). 같은 경합이 두 버전에 있으므로 1.4.3 회귀가 아니라 하네스 문제다.
  pincheck의 "핀 이탈 0"은 이 경합을 잡지 못했다 — 측정 뒤 pinmon이 뜬 지 1초 미만(`PINMON_MIN_AGE_S`) 프로세스는 고정하지 않게, pincheck가 서버
  프로세스별 HeapHelper 수(< 5면 BAD)를 검사하게 고쳤고, 고친 pincheck가 위 세 런을 모두 잡는다. CPU를 고정
  하지 않는 운영은 affinity 경합과 무관하지만, 컨테이너 cpuset처럼 허용 CPU가 적으면 bcrypt 동시 처리량과 GC 마커 수가 그만큼 준다(cgroup CPU
  quota 반영 여부는 확인하지 않았다). 오염 런: A N=2 1200 중앙값 런(r3 — p99 24.86, lag99 52.5), 분해 P0 1200(r2), ③의 1.4.3 monolith GC 런(g1).
- **남은 위험**: 열린 GC 마킹 크래시 보고(oven-sh/bun #40607 — 1.3.10~1.4.0에서 같은 시그니처, #44009 — 1.4.3 릴리스 전 빌드·하드웨어 의심)는
  1.4 고유 회귀의 근거는 아니다. 모든 런이 hold 30 s라 정상 상태 GC(승격·full 빈도와 정지), 힙·RSS 추세, 유휴 뒤 JIT 노화(1.4.1 유휴 GC 래더)는
  보지 못했다 — 장시간 소크로 크래시와 함께 본다(→ 60분 소크(700명 상시 부하)에서 크래시·힙·RSS·GC 빈도 이상 없음, 아래 절 — 유휴 뒤 JIT 노화는 여전히 보지 않았다). `mmorpg_process_heap_used_bytes`의 의미도 1.4.0에 바뀌었다(매 수집 뒤 갱신).

### 표 (런별, A = 서버 1.3.13 → B = 서버 1.4.3)

| 구성 | CCU | 런타임 | tick p99 | tick 평균 | flush·스냅샷 | 서버 CPU | 게이트웨이 CPU | 부하 생성기 CPU | rtt99 |
|---|---|---|---|---|---|---|---|---|---|
| monolith | 700 | A | 22.38 / 24.57 / 26.26 / 23.83 / 25.86 | 17.99 / 18.56 / 19.11 / 18.36 / 18.98 | flush 12.94–13.47 · 스냅샷 4.11–4.47 | 0.59–0.64 | — | 0.87–0.95 | 22.2–26.0 |
| monolith | 700 | B | 22.29 / 21.54 / 22.05 / 22.51 / 21.58 | 16.68 / 16.72 / 17.32 / 17.20 / 16.79 | flush 12.69–13.20 · 스냅샷 3.16–3.34 | 0.46–0.48 | — | 0.90–0.94 | 19.0–20.6 |
| N=2 | 1150 | A | 22.88 / 19.87 / 23.33 | 14.47 / 13.53 / 13.96 | 스냅샷 10.16–10.61 · ipcFlush 0.19–0.21 | 0.67–0.70 | 0.87–0.91 | 1.59–1.65 | 27.1–32.9 |
| N=2 | 1150 | B | 16.32 / 16.26 / 15.89 | 10.71 / 10.59 / 10.56 | 스냅샷 7.57–7.72 · ipcFlush 0.19–0.20 | 0.40 | 0.74–0.75 | 1.59–1.63 | 21.4–23.1 |
| N=2 | 1200 | A | 37.37 / 22.01 / 24.86* | 15.69 / 15.01 / 15.40* | 스냅샷 11.11–11.70 · ipcFlush 0.21–0.24 | 0.71–0.72 | 0.90–0.93 | 1.66–1.71 | 31.7–84.4 |
| N=2 | 1200 | B | 19.39 / 17.75 / 19.09 | 11.79 / 11.24 / 11.66 | 스냅샷 8.20–8.56 · ipcFlush 0.20–0.21 | 0.41–0.42 | 0.74–0.78 | 1.64–1.68 | 22.2–25.0 |

- monolith r4·r5는 B→A 순서. N=2 서버 CPU는 월드 프로세스(orchestrate의 srvCPU), 게이트웨이 CPU는 2개 합.
- \* r3 = 게이트웨이 2개가 스레드 수 경합(위 "측정 하네스 주의") 런.
- GC 로그 런의 tick p99: monolith A 27.99·24.08 / B 22.41·22.21, N=2 1200 A 28.60·32.40 / B 20.99·19.09.

### GC 구성 (`BUN_JSC_logGC=1`, 런 1회 ≈45초(monolith)·≈51초(N=2) — 램프 포함)

| 프로세스 | 런타임 | eden 횟수 | eden 정지 중앙값 / 최대 (ms) | full 횟수 | 힙 최대 |
|---|---|---|---|---|---|
| monolith 700 | A (g1 / g2) | 1,706 · 1,694 | 2.26 / 13.6 · 2.29 / 6.8 | 20 · 19 | 66.8 · 67.0 MB |
| monolith 700 | B (g1 / g2) | 148 · 149 | 1.84 / 4.0 · 1.93 / 7.2 | 16 · 15 | 57.0 · 59.2 MB |
| 월드 N=2 1200 | A (g1 / g2) | ≥2,525 · ≥2,536 | 2.92 / 21.4 · 2.87 / 11.8 | ≥29 · ≥27 | 134.8 · 132.6 MB |
| 월드 N=2 1200 | B (g1 / g2) | 169 · 164 | 3.80 / 7.3 · 3.59 / 6.4 | 20 · 21 | 113.3 · 124.0 MB |
| 게이트웨이 2개 × 2런 | A / B | ≥2,383–2,482 / 104–118 | — | ≥10–13 / 2–4 | — |

- 집계 파서(`~/an/gccount.py`·`cleanpairs.py`·`gcalloc.py`·`cleanheap.py`·`startcheck.py`)는 `START M`뿐 아니라 `START C`(수집 스레드가 시작한
  수집)도 세도록 고쳤다(원본은 `.bak-20261013b`). B6 최종 로그는 다시 세도 같고, 이번 1.3.13 N=2 로그에는 `START C`가 런당 16–17개 있다(1.4.3은 0–1개).
- 1.4.3 N=2 로그는 수집 자체가 적어 프로세스 간 섞임도 적다(START 토큰 467·472개 중 귀속 실패 11·35개). 1.3.13 N=2 횟수는 B6 절처럼 하한이다.

### 원인 분리 — 서버 1.4.2 (`~/perf-bun142`, GC 로그 런, 부하 생성기 1.3.13)

| 프로세스 | 런타임 | eden 횟수 | full 횟수 | 할당 추정 (`cleanpairs.py`) |
|---|---|---|---|---|
| monolith 700 | 1.4.2 (g1 / g2) | 149 · 148 | 15 · 15 | 1.4 · 1.5 GiB |
| monolith 700 | 1.4.3 (같은 묶음 1런 — 스레드 수 경합 런) | 172 | 16 | 1.6 GiB |
| 월드 N=2 1200 | 1.4.2 (g1 / g2) | 195 · 176 | 21 · 22 | 2.9 · 2.5 GiB |
| 월드 N=2 1200 | 1.4.3 (같은 묶음 1런) | 176 | 21 | 2.8 GiB |
| 게이트웨이 2개 | 1.4.2 / 1.4.3 | 98–109 / 103–106 | 32–40 / 3 | — |

- 이 묶음은 측정 중 호스트가 바빴다(부하 생성기 CPU monolith 0.96–1.19·N=2 2.05–2.61 — 다른 묶음은 ≈0.9·≈1.7; 같은 묶음 1.4.3 monolith 런의 tick p99 62 ms는 스레드 수 경합 런이기도 하다).
  그래서 시간·CPU 지표는 쓰지 않고 수집 횟수만 쓴다(횟수는 할당·트리거가 정한다).

### 분해 (1.4.3, 같은 라운드 — tick은 2런 중앙값, GC는 1런)

| 지표 | B (당시 기본 K=8) | P0 (`GC_PACE_TICKS=0` — 현재 기본) | H32 (`largeHeapSize` 32 MB) |
|---|---|---|---|
| monolith 700 tick 평균 / p99 / 서버 CPU | 17.09 / 22.90 / 0.48 | 17.02 / 22.18 / 0.47 | 17.52 / 22.96 / 0.49 |
| N=2 1150 tick 평균 / p99 | 11.52 / 20.57 | 11.82 / 21.26 | 11.09 / 18.61 (1런) |
| N=2 1200 tick 평균 / p99 | 12.08 / 22.26 | 11.71 / 19.05* | 12.29 / 19.97 (1런) |
| eden monolith / 월드 (GC 로그 런) | 148–149 / 164–169 (위 표) | 58 / 67 | 150 / 171 |
| full monolith / 월드 | 15–16 / 20–21 | 15 / 24 | 12 / 18 |

\* P0 r2 1200 = 스레드 수 경합 런(접속 1,145명). 런별 p99: monolith B 22.79·23.02 / P0 21.70·22.65 / H32 23.45·22.48, N=2 1200 B 22.35·22.18 /
P0 19.51·18.59. 이 라운드의 B는 첫 매트릭스의 B보다 N=2 p99가 높다(20.57·22.26 / 16.26·19.09) — 세션 안에서도 시간대에 따라 흔들리므로 같은
라운드끼리만 비교한다.

### B6 보류 항목 재측정 (전부 1.4.3 — 오케스트레이터·샤드·서버, GC 로그 런 2쌍)

| 프로세스 | 커밋 | eden 횟수 | full 횟수 | 힙 최대 | 할당 추정 (`cleanpairs.py`) | tick 평균 / p99 (2런 중앙값) |
|---|---|---|---|---|---|---|
| monolith 700 | A `895d8b6` (g1 / g2) | 151 · 151 | 17 · 18 | 68.8 · 61.7 MB | 1.90 · 1.93 GiB | 21.71 / 26.64 |
| monolith 700 | B `1ae86d7` (g1 / g2) | 149 · 149 | 16 · 16 | 55.2 · 58.0 MB | 1.56 · 1.55 GiB | 20.98 / 25.17 |
| 월드 N=2 1200 | A (g1 / g2) | 167 · 172 | 24 · 23 | 109.3 · 107.6 MB | 3.13 · 3.27 GiB | 12.81 / 19.08 |
| 월드 N=2 1200 | B (g1 / g2) | 156 · 164 | 20 · 20 | 115.3 · 119.9 MB | 1.93 · 2.58 GiB | 11.33 / 17.43 |

- 부하 생성기까지 1.4.3이면 부하 생성기 CPU가 절반쯤이고(monolith 0.45–0.48 · N=2 0.87–0.93코어 — 1.3.13은 ≈0.9 · ≈1.7) monolith flush는
  16.9 ms로 커진다(1.3.13 부하 생성기 ≈13 ms). flush는 수신 측 동작에 묶이므로 런타임 비교에서는 부하 생성기 bun을 고정한다(`--server-bun`).
- 원자료: WSL `~/perf-bun14`(A/B — `mono-a`·`mono-b`·`n2-a`·`n2-b`·`*-gc`, `runs.log`, `matrix.sh`, `runbun.sh`, `pinmon.jsonl`), `~/perf-bun14b`
  (분해 `d-*`, B6 재측정 `x-*`, `matrix2.sh`, `runx.sh`), `~/perf-bun142`(원인 분리, `matrix3.sh`), 실행 파일 `~/.bun/bin/bun`(1.3.13)·`~/.bun-1.4.2`·
  `~/.bun-1.4.3`, 분석 스크립트 WSL `~/an/`(`b6agg.py`·`pincheck.py`·`gccount.py`·`gclog.py`·`cleanpairs.py`·`startcheck.py`).

## Bun 1.4.3 — 수용 인원·GC 페이서·소크 (2026-10-14)

> 1.4.3 전환 절의 후속 3건. 같은 체크아웃 `~/mmorpg`(`c316c87` — 서버 코드는 `f3b58f4`와 같다)에서 **서버만** 1.3.13(A) ↔ 1.4.3(B), 부하 생성기는
> 1.3.13 고정(`--server-bun`), spread·조인 100/s·hold 30 s(소크 3,600 s), 페이서는 측정 당시 기본 8. WSL을 띄운 직후에는 설치기 snap·cloud-init이
> 1분 넘게 CPU를 써서(15% 안팎) 그것이 가라앉은 뒤(90 s) 시작했다(예방 조치 — 부팅 직후 사전 스캔의 1.4.3 N=2 1600 p99는 29 ms로 본 측정 21 ms보다
> 높았지만, 부팅에 더 가까웠던 monolith 900 스캔(27.7 / 본 측정 중앙값 32.2)과 N=2 2000 스캔은 높지 않아 이 한 런만으로 부팅 소음 탓이라 가르지 못한다).
> 수용 인원은 레벨 묶음을 A·B 번갈아(monolith A 650–800·B 750–900 ×5, N=2 A 1100–1300·B 1300–2000 ×3 — 오전 09:55–11:06. A 1350–1500·B 1650은
> 보강 묶음 11:38–11:50, 급변 구간 재측정 A 1250–1400·B 1550–1700 ×3은 오후 한 묶음 14:03–14:27), 페이서는 zoneBench + 실서버 K=0·8·16 교차(2회차는 K=0·8만), 소크는 monolith 700(B) 60분 + 1분 샘플러
> (`~/an/soakSampler.py`). 실서버 런 전부 핀 이탈 0·서버 스레드 수 정상(pincheck HeapHelper ≥ 5). 20 Hz 아래로 내려간 런은 과부하·호스트 바쁨
> 6개뿐이다(1.3.13 N=2 1500 r3 17.1·1350 r2 19.2 Hz, 1.4.3 N=2 2000 r1 17.6 Hz, 페이서 2회차 N=2 K=0 r5 14.4 Hz, 오후 묶음 1.3.13 N=2 1300 r3
> 16.8·1400 r1 16.2 Hz — 나머지 ≥ 19.7 Hz).

### 요약

- **수용 인원(tick p99 25 ms 교차 — 4.5와 같은 방법, 호스트가 한가한 오전 묶음 09:55–11:06)**: monolith ≈756 → ≈776명(+3% — 중앙값 보간,
  런 편차 안이라 **교차점은 사실상 그대로**), 게이트웨이 2개(N=2) ≈1,227 → ≈1,621명(**+20~32%**). B는 1600(20.96) → 1700(40.18) 보간(1700–2000은
  같은 사슬의 연장 묶음 10:41–11:06 — 1700 r2·r3(10:52·11:02)의 건너뛴 슬롯 437·634는 † 점 범위라 부하 생성기 지연을 배제하지 못한다, r1(10:41,
  p99 29.70·슬롯 22)만 쓰면 ≈1,646). A는 1250이 3런 중 2런 25 ms 초과(중앙값 29.65)인데 바로 위 1300은 3런 모두 아래(18.96–22.93)라 규칙(첫
  교차)으로는 ≈1,227이지만 실제 경계는 1,300명대 초반일 수 있다 — 오전 묶음에는 A 1300 위 자료가 없다. 그래서 위쪽은 규칙 교차의 비(+32% —
  1700 r1만 쓰면 +34%), 아래쪽은 같은 시간대 비교로 잡는다: 보강 묶음(11:38–11:50, A·B 번갈아)에서 B 1650(p99 49.33)이 A 1350(63.40)·
  A 1400(55.12)보다 가벼웠다(+18~22% — A 중앙값이 단조가 아니라 1350 대비 +22%는 가장 유리한 쌍). 오후 묶음도 B 1650 < A 1350·B 1700 < A 1400
  (+21~22%)이다. 그래서 ≈+20%를 아래쪽으로 적는다. 4.5(이진 전환 전 코드·1.3.13·페이서 없음)의 ≈678 /
  ≈1,159보다 A가 큰 몫은 나누지 않았다 — 그사이 코드 변경(GC 페이서: 1.3.x monolith 700 p99 26.08 → 22.95, 이진 전환: B6 전후 monolith tick
  평균 −2%·N=2 −8~12%)과 측정 도구 수정(pinmon·스레드 수 검사)·측정한 날의 차이가 섞여 있다. 수용 인원 런은 전부 페이서 8(당시 기본)이다.
- **monolith 교차점이 그대로인 이유 — tick의 약 3/4이 소켓 송신(flush)**: 750명에서 사용자 모드 CPU(서버 코드 + GC·JIT 보조 스레드 — 1.4.3은
  eden이 1/10) 0.31 → 0.20코어(−36%)·스냅샷 4.39 → 3.52 ms(−20%)로 런타임 몫은 줄었지만 flush(소켓 쓰기 — 커널 sys 시간)는 13.82 → 13.50 ms로
  그대로다(tick 평균 18.96 → 17.53, −8%). 800명도 flush 15.65 → 15.90·tick 평균 21.62 → 20.68 ms. 같은 인원의 p99는 낮아졌지만(중앙값 750
  −7%·800 −10%, 최악 런 33.96 → 24.39·44.70 → 29.07 ms) 나머지 1/4만 줄어 교차점이 20명쯤만 움직였다 — 이 PC·부하 생성기 1.3.13 조건이고,
  부하 생성기까지 1.4.3이면 flush가 더 길다(전환 절).
- **N=2는 월드 tick 이득이 그대로 수용 인원으로**: 소켓 송신을 게이트웨이가 맡아 월드 tick은 스냅샷이 대부분이고, 1300명 tick 평균 15.01 →
  11.56 ms(−23%)·스냅샷 11.40 → 8.79 ms. 게이트웨이 CPU(2개 합)는 같은 1300에서 0.94 → 0.81코어.
- **교차점 위에서는 p99가 빠르게 오른다**: B는 1600 20.96 → 1700 30–42 ms(중앙값 40.18, 스냅샷 12.32 → 17.00 ms, ×1.38 — 1700은 연장 묶음). 첫 기록에서는 "50명
  사이 급변"(A 1300 → 1350, B 1600 → 1650 — p99 21 → 49~63 ms)으로 보고 측정 PC 전체 포화를 추정했지만, 급변 위쪽 점(A ≥ 1350·B 1650)이 모두
  호스트가 더 무거운 보강 묶음(11:38–11:50)에서만 나와 시간대 효과가 섞였다(검증 지적) — 그 서사는 버렸다. 그래서 급변 구간을 한 묶음 안에서
  번갈아 다시 쟀는데(14:03–14:27, A 1250–1400·B 1550–1700 ×3), 그때는 호스트가 바빠 **두 버전 모두 잰 범위 전체가 25 ms 위**였다(A 1250
  중앙값 35.10 [33.98–39.26], B 1550–1700 중앙값 37.31–49.22 ms — 교차점은 A < 1250·B < 1550, 아래 표). 같은 묶음에서 B 1650(37.31)이 A 1350
  (46.53)보다, B 1700(49.22)이 A 1400(55.89)보다 가벼워 방향은 같다. **절대 수치는 호스트 상태에 크게 좌우된다** — 위 교차점은 이 PC·한가한 시간대 기준이다. 측정 PC는
  i7-8700K 6코어 12스레드이고, 월드(CPU 2–3)·게이트웨이(4–5, 6–7)·부하 생성기(0–1, 8–11)를 서로 다른 물리 코어에 고정해 6코어를 모두 쓰므로
  VM 밖 Windows 작업과 같은 물리 코어를 시분할한다. 1.4.3 2000명은 봇 116명(r2 38 + r3 78)이 무활동 KICK 3(부하 생성기 스케줄 지연 — 건너뛴
  슬롯 1,756·1,541, KICK 없는 r1은 332).
- **GC 페이서 — 1.4.3에서는 이득이 측정되지 않아 단순한 쪽(끔, `GC_PACE_TICKS` 0)을 기본으로 바꿨다**: 벤치(zoneBench — 1.4.3 전환 전 페이서
  측정과 같은 조건)는 1회차 K=0·8·16 p99 중앙값 9.94 / 15.85 / 9.55 ms, 2회차(호스트 바쁨) K=0·8 16.34 / 14.67 ms로 방향이 엇갈린다(7회 합치면
  13.92 / 15.43, tick 평균 8.41 / 8.58 — 시간상 이웃한 끔/켬 쌍은 1회차 끔 낮음 2·켬 낮음 1, 2회차 끔 낮음 2·켬 낮음 1·같음 1). monolith 850은
  p99 29.91 / 30.77 / 30.12·평균 22.94 / 22.82 / 23.09로 같다(flush가 정하는 경계라 페이서와 무관). N=2 1450도 켜서 나아지는 증거가 없다 —
  1회차 중앙값은 끈 쪽이 낮지만(p99 21.46 / 28.67 / 28.00·평균 15.14 / 16.36 / 16.26) 이웃한 끔/켬 쌍으로는 끔 낮음 4·켬 낮음 3·같음 1(1회차
  1:1:1, 2회차 3:1 — 켬이 낮은 r5의 끔 런은 14.4 Hz로 무너진 런, GC 로그 쌍은 켬이 낮음)이다. 켜면 eden이 monolith 63 → 155, 월드 67 →
  184회/런(2.5~2.7배)이고 full은 그대로다(16 → 16, 25 → 23) — 유휴 구간 요청이라 CPU(0.61 / 0.62)·tick 비용은 측정되지 않았고 벤치 힙은 오히려
  작다(82–90 → 67–80 MB). K=16은 1회차 벤치 3런 모두 끔보다 낮았지만(8.88–11.36 / 9.65–21.05 ms) 실서버에서 낫지 않아(monolith 30.12 / 29.91,
  N=2 28.00 / 21.46) 고르지 않았고 2회차에서는 재지 않았다. 1.3.13 벤치(1회씩)는 이번에도 켠 쪽이 낮았다(K=0 15.75 / K=8 13.92 ms — 1.4.3 같은 K
  런 범위보다 작은 차이라 참고값이고, 1.3.x 때 23.56 → 13.23과 같은 방향) — 페이서가 맞서던 tick 안 GC가 1.3.x GC 샘플러에서 왔다는 전환 절의
  설명과 어긋나지 않는다. 1.3.x 계열 런타임이거나 tick 안 GC 꼬리가 다시 보이면 8로 켠다.
- **소크(monolith 700 — 1.4.3 교차점의 90%, 60분, 페이서 8 — 당시 기본)**: 크래시·끊김 0, kick 0, 72,000 tick 20.0 Hz(50 ms 초과 15개·100 ms
  초과 0, tick 루프 정지 1회 — 36분 무렵 밀림 78.7 ms). RSS는 108–135 MB에서 오르내리고 전반·후반 중앙값 117.1 / 117.2 MB, 힙 46.7 / 46.0 MB,
  접속 700 그대로(분당 샘플, 엔티티는 종료 시점 711) — **증가 추세 없음**. GC는 eden 분당 ≈209회로 60분 내내 일정(그중 분당 ≈150회가 페이서
  요청 — 850명 GC 로그 쌍에서는 페이서를 끄면 eden이 155 → 63회로 ≈60% 줄었다), full은 분당 ≈16 → ≈14회(전반 → 후반 — 늘지 않았다), 정지
  중앙값 eden 1.85 ms(최대 41.6)·full 6.86 ms(최대 18.6 — 로그 줄이 섞이지 않은 eden 5,215·full 294건 기준). tick은 1분 창 p99 전반 22.05 →
  후반 24.07 ms·평균 16.21 → 17.09 ms로 후반이 조금 높다 — 25 ms를 넘은 분이 60분 중 16분(전반 5분 — 9·14·19·25–26분, 후반 11분 — 35–38·42·45–46·52–54·56분).
  계속 오르는 모양은 아니고 마지막 분 tick 평균(16.5 ms)은 첫 분(16.2 ms)과 비슷하다. 서버 CPU가 tick과 같이 움직이고(0.44–0.58코어) 같은
  구간에 접속·힙·GC 빈도는 그대로라 서버 내부 누적의 흔적은 없다 — 원인은 확인하지 못했다(호스트 잡음 추정 — 호스트가 무거운 시간대는
  소크 전 페이서 1회차부터 보였다, 아래). 새 기본(페이서 끔)으로는 소크하지 않았다.
- **호스트 잡음**: 같은 설정(N=2 1450·K=8)의 tick 평균이 수용 인원 단계(09:55–11:06) 12.76–13.82 ms → 페이서 1회차(11:22–11:35) 14.63–18.02 ms
  → 2회차(12:50–13:10) 21.60–28.96 ms(p99 17.3–19.0 → 20.1–30.4 → 44.9–54.9 ms)로 시간대에 따라(간헐적으로) 무거웠다(2회차 끝 13:09의 K=8 GC 로그 런은 16.09 / 23.47 ms로 1회차 수준이라 잡음은 오갔다 · 원인 미상 — 같은 PC의 다른 작업
  추정, monolith 850은 1회차에 영향이 보이지 않았다). 그래서 페이서 실서버는 절대값보다 시간상 이웃한 끔/켬 쌍끼리 비교한다. 측정이 없을
  때도 Windows 쪽 앱이 CPU ≈20%를 쓴다.

### 수용 인원 표 (tick p99 중앙값 [런 최소–최대] / tick 평균 중앙값, ms)

| CCU | monolith A (1.3.13) | monolith B (1.4.3) |
|---|---|---|
| 650 | 24.58 [19.50–29.55] / 16.33 | — |
| 700 | 22.10 [19.92–30.17] / 17.15 | — |
| 750 | 24.31 [23.20–33.96] / 18.96 | 22.65 [20.26–24.39] / 17.53 |
| 800 | 30.29 [26.34–44.70] / 21.62 | 27.13 [25.57–29.07] / 20.68 |
| 850 | — | 34.66 [28.23–37.18] / 22.80 |
| 900 | — | 32.24 [28.12–44.09] / 24.02 |
| **교차** | **≈756** | **≈776** |

| CCU | N=2 A (1.3.13) | N=2 B (1.4.3) |
|---|---|---|
| 1100 | 17.68 [14.18–18.73] / 11.54 | — |
| 1150 | 18.45 [14.74–26.11] / 12.50 | — |
| 1200 | 19.35 [17.55–23.58] / 13.39 | — |
| 1250 | 29.65 [20.83–34.79] / 14.73 | — |
| 1300 | 21.04 [18.96–22.93] / 15.01 | 15.55 [14.53–16.77] / 11.56 |
| 1350 | 63.40 [42.27–74.83] / 23.96 † | — |
| 1400 | 55.12 [47.32–58.26] / 23.73 † | 18.69 [18.58–20.86] / 13.16 |
| 1450 | — | 18.54 [17.30–18.99] / 13.64 |
| 1500 | 60.17 [38.23–85.87] / 28.48 † | 18.92 [18.25–19.33] / 14.05 |
| 1600 | — | 20.96 [20.72–23.22] / 15.67 |
| 1650 | — | 49.33 [27.34–53.18] / 26.16 † |
| 1700 | — | 40.18 [29.70–42.29] / 21.69 |
| 1800 | — | 38.61 [33.47–58.49] / 23.72 |
| 1900 | — | 50.16 [39.42–68.85] / 30.56 |
| 2000 | — | 71.58 [47.81–105.69] / 36.05 (KICK 3 116명) |
| **교차(오전)** | **≈1,227(규칙 — 1,300도 25 ms 아래라 더 높을 수 있음)** | **≈1,621(1,600 → 1,700 — 1,700은 연장 묶음, 1,700 r1만 쓰면 ≈1,646, 1,650†을 넣으면 ≈1,607)** |

- monolith는 레벨당 5회, N=2는 3회. 교차는 중앙값 사이 선형 보간(`~/an/capcross.py`). monolith 750·800 분해(중앙값, A / B): 서버 CPU 0.60 / 0.48·
  0.67 / 0.56(사용자 0.31 / 0.20·0.32 / 0.22, sys 0.31 / 0.29·0.35 / 0.34), flush 13.82 / 13.50·15.65 / 15.90, 스냅샷 4.39 / 3.52·4.90 / 3.95 ms.
- † = 보강 묶음(11:38–11:50, A·B 번갈아 — 호스트가 오전보다 무거운 시간대: 같은 설정 N=2 1450·K=8 tick 평균이 오전 12.76–13.82 → 11:22–11:35
  14.63–18.02 ms). 나머지는 오전 묶음(09:55–11:06). 첫 기록의 "급변 구간 분해"(A 1300 → 1350·B 1600 → 1650의 스냅샷 +57~64%·게이트웨이 CPU
  +21~25%·부하 생성기 CPU +21~33%)는 † 점과 오전 점을 비교한 것이라 시간대 효과가 섞였다. 그 칸에서 부하 생성기의 건너뛴 슬롯도 7–28 →
  99–964로 늘어 부하 생성기 송신 지연도 배제하지 못한다.

#### 급변 구간 한 묶음 재측정 (14:03–14:27, A·B 번갈아 ×3 — 호스트 바쁨)

| CCU | N=2 A (1.3.13) | CCU | N=2 B (1.4.3) |
|---|---|---|---|
| 1250 | 35.10 [33.98–39.26] / 18.11 | 1550 | 40.00 [38.88–54.32] / 22.22 |
| 1300 | 72.62 [37.55–112.74] / 32.35 (최저 16.8 Hz) | 1600 | 47.63 [38.84–48.90] / 23.38 |
| 1350 | 46.53 [43.61–68.63] / 22.14 | 1650 | 37.31 [35.52–46.04] / 23.23 |
| 1400 | 55.89 [39.26–94.66] / 25.31 (최저 16.2 Hz) | 1700 | 49.22 [45.54–57.21] / 26.04 |

- 두 버전 모두 잰 범위 전체가 25 ms 위라 교차점은 A < 1250·B < 1550(B는 오전 ≈1,621보다 70명 이상 아래). 같은 인원의 tick 평균도 오전보다
  무겁다(A 1250 14.73 → 18.11, A 1300 15.01 → 32.35 ms). 핀 이탈 0·스레드 수 정상, kick 0. 원자료 WSL `~/perf-cap14c`.

### GC 페이서 표 (1.4.3 서버, 중앙값 [런 최소–최대])

| 조건 | K=0 (끔) | K=8 (측정 당시 기본) | K=16 |
|---|---|---|---|
| 벤치 1회차 p99 / 평균 (3회) | 9.94 [9.65–21.05] / 7.44 | 15.85 [10.04–16.76] / 8.45 | 9.55 [8.88–11.36] / 7.30 |
| 벤치 2회차 p99 / 평균 (4회, 호스트 바쁨) | 16.34 [12.99–18.78] / 9.12 | 14.67 [13.78–27.05] / 8.80 | — |
| monolith 850 p99 / 평균 / CPU (3회) | 29.91 [27.91–43.53] / 22.94 / 0.61 | 30.77 [26.11–40.68] / 22.82 / 0.62 | 30.12 [26.74–31.61] / 23.09 / 0.62 |
| N=2 1450 1회차 p99 / 평균 (3회) | 21.46 [21.07–28.61] / 15.14 | 28.67 [20.11–30.35] / 16.36 | 28.00 [24.32–42.97] / 16.26 |
| N=2 1450 2회차 p99 / 평균 (4회, 호스트 바쁨) | 33.15 [28.56–105.73] / 18.40 | 50.87 [44.90–54.92] / 24.84 | — |
| eden / full — monolith 850 (GC 로그 런 1회) | 63 / 16 | 155 / 16 | 101 / 17 |
| eden / full — 월드 N=2 1450 (1회) | 67 / 25 | 184 / 23 | — |

- 벤치는 1.4.3 전환 전 페이서 측정과 같은 조건(zoneBench 1150명·per-cell 72·월드 + 게이트웨이 2개·1,200 tick·20 Hz 주기, CPU 2,3 고정·pinmon 없음).
  1.3.13 벤치(1회): K=0 p99 15.75·평균 9.95 / K=8 13.92·9.30 ms. 1.4.3 벤치 힙(측정 뒤): K=0 82.3–90.4 MB, K=8 67.4–80.0 MB.
- 2회차 N=2 쌍(끔 / 켬 p99): r4 28.56 / 54.92, r5 105.73 / 48.96, r6 35.28 / 44.90, r7 31.03 / 52.78(r5·r7은 켬 먼저, r5 끔 런은 14.4 Hz로 무너진 런). GC 로그 쌍(2회차 끝): 끔 29.93 / 켬 23.47. 게이트웨이 eden·full은 끔/켬
  같다(126–136 / 130–131, 3 / 4–5).

### 소크 (monolith 700, 서버 1.4.3·페이서 8, 3,600 s)

| 구간 | RSS 중앙값 | 힙 중앙값 | tick p99 (1분 창) 중앙값 | tick 평균 중앙값 | eden / full (분당) |
|---|---|---|---|---|---|
| 0–30분 | 117.1 MB | 46.7 MB | 22.05 | 16.21 | ≈209 / ≈15–16 |
| 30–60분 | 117.2 MB | 46.0 MB | 24.07 | 17.09 | ≈209 / ≈14 |

- 범위: RSS 108.2–134.9 MB, 힙 34.3–66.7 MB, 1분 창 p99 18.98–32.75 ms, 평균 15.56–20.42 ms. 서버 시작 뒤 응답 없음 0회. 1시간 창 단계(메트릭):
  flush 12.65·스냅샷 3.41·`applyInputs` 0.35 ms.
- 원자료: WSL `~/perf-cap14`(`cap-*`, `runs.log`, `pinmon*.jsonl`)·`~/perf-cap14c`(오후 한 묶음 — `cliff-n2-a`·`cliff-n2-b`, `runs.log`, `pinmon.jsonl`), `~/perf-pace14`·`~/perf-pace14b`(벤치 `bench-*.json`, 실서버 `m-k*`·`n-k*`),
  `~/perf-soak14`(`samples.jsonl`, `soak-mono`), 스크립트 `~/perf-chain14/`, 분석 `~/an/`(`capcross.py`·`paceagg.py`·`soakagg.py`·`soakSampler.py`·
  `b6agg.py`·`gccount.py`·`gclog.py`·`pincheck.py`).

## 자동 재접속 폭주 (2026-10-15)

> 클라 자동 재접속(토큰 재로그인 + GameScene 재로드 — architecture.md §8.6)을 기본으로 켜기 전 관문(슬라이스 7). 부하 생성기 봇이 클라와 같은
> 재접속 정책(`tools/loadgen/reconnect/` — `ReconnectPolicy.cs`·`ReconnectMachine.cs` 미러, 지문 시험 `tests/server/loadgen/reconnectPolicy.test.ts`)으로
> 토큰 재로그인하고, 카오스 트리거(`--chaos monolith-restart|gateway-kill|world-kill|world-restart --chaos-at 30`)가 정상 상태 30초 뒤 프로세스를
> 죽이거나 재시작한다. WSL2(커널 6.18) 같은 PC, 서버·부하 생성기 모두 Bun 1.4.3, spread·hold 30 s, pinmon 핀 고정(월드 CPU 2,3·gw1 4,5·gw2 6,7·
> 부하 생성기 0,1,8–11 — 재기동한 프로세스도 다시 고정). 실행 `~/perf-bun14/runx.sh <sub> <mono|n2> …`, 보고서는 런마다 `storm-summary.md`.
> **관문**(`STORM_GATE`): 끊긴 봇 ≥ 99%가 시작 클래스 창 안에 복귀·fatal 0·부수 끊김(피해자 아닌 봇의 끊김) 0·마지막 복귀 뒤 30초 안에 5초 평균
> ≥ 19.5 Hz·카오스 시점 접속 ≥ 99%(전제).

### 요약

- **1회차(`cb5531f`, 01:00–01:19 — 호스트 바쁨: 다른 앱이 ≈4.4코어)**: monolith 재시작 700·월드 kill/재시작 1500·2000·게이트웨이 kill 1000·1200은
  첫 시도 100% 복귀(p99 5.0–6.3 s·최대 6.6 s)로 통과. **게이트웨이 kill 1500만 98.29% 미달**(13명 `kick:9@awaitHelloAck`로 포기·KICK 9 189·p99 58.8 s).
  2000은 정상 상태부터 17.70 Hz(수용 초과)라 Hz 관문 판정 대상이 아니다. Linux monolith 재시작은 전원 KICK 6을 받았다(Windows에서 보이던
  "읽지 않은 입력이 있는 소켓 close의 RST가 KICK 6을 지움"은 재현되지 않음).
- **원인 — 재접속 로직이 아니라 입구 배치**: gw1이 죽고 ≈0.7 s 뒤 재기동하면 커널 reusePort 해시가 부하와 무관하게 새 연결을 ≈50/50으로
  나눈다. 생존한 gw2는 자기 ≈740명에 피해자 절반을 더 받아 ≈1,094연결에서 CPU 접속 제한(`GW_ADMISSION_CPU_PCT` 90 — 해제 75·hold 3 s)이 닫혔고,
  재시도의 ≈50%가 다시 gw2로 가 KICK 9를 받았다(gw1은 ≈380으로 한산). 수동 재로그인이어도 같은 KICK 9다.
- **수정 — 공유 포트 리스너 양보(`8d88569`, IPC v14 — architecture.md §3.4, ADR 0002 §5.1)**: 새 클라를 거절 중인 게이트웨이가 월드 지시로
  리스너를 잠시 내려(기존 연결 유지) 새 연결이 받을 수 있는 게이트웨이로만 간다 — 월드가 같은 포트에 확인된 열린 리스너가 있을 때만 허락.
- **2회차(`8d88569`, 11:58–12:03 — 호스트 한가)**: 게이트웨이 kill 1500 ×2·2000·월드 kill 1500 전부 통과, 첫 시도 복귀 99.1–100%.
  2000에서는 gw2가 1,350연결에서 닫혔고 양보 직후 대기열 RST 8건(`closed@awaitHelloAck` — `tcp_migrate_req` 0)이 두 번째 시도에 gw1로 갔다.
- **A/B(같은 핀 고정·번갈아, `GW_ADMISSION_CPU_PCT` 70으로 닫힘 강제)**: 종전(A) 99.05·99.08%(포기 7·7, KICK 9 192·158, p99 56.2·51.9 s) →
  양보(B) 100·100%(포기 0·0, KICK 9 0·3, p99 5.0·5.0 s). 기본 문턱(90)에서는 이날 두 쪽 다 닫히지 않아 둘 다 통과 — 1회차 미달은 호스트가
  바쁠 때 문턱을 넘은 경우이고, 양보는 문턱을 넘어도 관문을 지킨다. **관문 충족 → `ReconnectSupervisor.DefaultEnabled = true`**.

### 1회차 표 (`cb5531f`, 양보 없음)

| 런 | 카오스 | CCU | 피해자 | 창 안 복귀 | 포기 | KICK 9 | 복귀 s p50/p95/p99/max | 정상 Hz | 폭주 최저 Hz | tick p99 최대 | 관문 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| mono-restart-700 | monolith 재시작 | 700 | 700 | 100% | 0 | 0 | 3.5/5.8/6.0/6.1 | 20.00 | 19.66 | 26.59 | 통과 |
| mono-restart-700-prodcap † | monolith 재시작 | 700 | 700 | 100% | 0 | 0 | 3.5/5.8/6.0/6.0 | 20.00 | 18.61 | 28.85 | 통과 |
| wkill-1500 | 월드 SIGKILL | 1500 | 1500 | 100% | 0 | 0 | 3.5/5.9/6.1/6.2 | 20.03 | 16.71 | 40.91 | 통과 |
| wkill-2000 | 월드 SIGKILL | 2000 | 2000 | 100% | 0 | 0 | 3.6/6.2/6.3/6.4 | 16.76 ‡ | 15.30 | 77.69 | 통과 |
| wrestart-1500 | 월드 재시작 | 1500 | 1500 | 100% | 0 | 0 | 3.5/5.9/6.1/6.2 | 20.00 | 19.78 | 40.09 | 통과 |
| wrestart-2000 | 월드 재시작 | 2000 | 2000 | 100% | 0 | 0 | 3.5/6.1/6.3/6.5 | 16.96 ‡ | 15.35 | 62.78 | 통과 |
| wrestart-2000-prodcap † | 월드 재시작 | 2000 | 2000 | 100% | 0 | 0 | 3.7/6.1/6.3/6.6 | 14.16 ‡ | 15.46 | 68.68 | 통과 |
| gwkill-1000 | gw1 SIGKILL | 1000 | 502 | 100% | 0 | 0 | 2.5/4.8/5.0/5.1 | 20.00 | 19.80 | 21.43 | 통과 |
| gwkill-1200 | gw1 SIGKILL | 1200 | 597 | 100% | 0 | 0 | 2.5/4.8/5.0/5.1 | 20.00 | 19.99 | 34.77 | 통과 |
| **gwkill-1500** | gw1 SIGKILL | 1500 | 759 | **98.29%** | **13** | **189** | 2.5/18.3/58.8/88.6 | 19.99 | 18.66 | 80.36 | **미달** |
| gwkill-2000 | gw1 SIGKILL | 2000 | 992 | 92.44% | 75 | 1,035 | 4.5/58.6/82.5/89.5 | 17.70 ‡ | 15.42 | 89.74 | 미달 |

† 운영 미인증 상한 `MAX_PREAUTH_CONNECTIONS=500`(부하 생성기 기본은 전역 상한과 같게 풀어 둔다). ‡ 정상 상태부터 20 Hz 아래 — 수용 초과(이 호스트
상태에서 N=2 2000은 "Bun 1.4.3 — 수용 인원" 절의 한가할 때 교차점 ≈1,621을 넘는다), Hz 관문은 참고. 모든 런 fatal 0·부수 끊김 0. 월드 kill·재시작은
전원 KICK 6(재시작) 클래스, 게이트웨이 kill은 KICK 없는 끊김(Blip) 클래스로 시작했다.

### 2회차 표 (`8d88569`, 양보 켬 — 기본 문턱)

| 런 | 카오스 | CCU | 피해자 | 창 안 복귀 | 포기 | KICK 9 | 시도(1/2) | 복귀 s p50/p95/p99/max | 정상 Hz | 폭주 최저 Hz | 접속 제한 닫힘 | 관문 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ly-gwkill-1500a | gw1 SIGKILL | 1500 | 692 | 100% | 0 | 0 | 692/0 | 2.6/4.8/5.0/5.1 | 20.00 | 19.99 | 없음 | 통과 |
| ly-gwkill-1500b | gw1 SIGKILL | 1500 | 766 | 100% | 0 | 0 | 766/0 | 2.4/4.8/5.1/5.2 | 20.00 | 19.53 | 없음 | 통과 |
| ly-gwkill-2000 | gw1 SIGKILL | 2000 | 1010 | 100% | 0 | 1 | 1001/9 | 2.5/4.8/5.1/16.9 | 19.90 | 19.80 | gw2 1,350연결 | 통과 |
| ly-wkill-1500 | 월드 SIGKILL | 1500 | 1500 | 100% | 0 | 0 | 1500/0 | 3.5/5.8/6.0/6.1 | 20.00 | 19.40 | — | 통과 |

### A/B (같은 세션 번갈아, A = `cb5531f` ↔ B = `8d88569`, gw1 SIGKILL 1500, `LOG_LEVEL=info` 양쪽)

| 런 | 문턱 | 창 안 복귀 | 포기 | KICK 9 | 시도 분포 | 복귀 s p95/p99/max | 접속 제한 닫힘 → 양보 |
|---|---|---|---|---|---|---|---|
| p70-A-r1 | CPU 70 | 99.05% | 7 | 192 | 1=633·2=56·3=24·4=19·5=6 | 26.5/56.2/89.2 | gw2 닫힘 → (양보 없음) |
| p70-B-r1 | CPU 70 | 100% | 0 | 0 | 1=720 | 4.8/5.0/5.0 | gw2 닫힘 → yield 1·중지 1 |
| p70-B-r2 | CPU 70 | 100% | 0 | 3 | 1=757·2=4 | 4.8/5.0/14.1 | gw2 닫힘 → yield 1·중지 1 |
| p70-A-r2 | CPU 70 | 99.08% | 7 | 158 | 1=670·2=46·3=24·4=16·5=1·6=1 | 18.8/51.9/79.5 | gw2 닫힘 → (양보 없음) |
| p90-A-1500 | 기본 90 | 100% | 0 | 0 | 1=745 | 4.8/5.0/5.1 | 닫히지 않음 |
| p90-B-1500 | 기본 90 | 100% | 0 | 0 | 1=724 | 4.8/5.0/5.1 | 닫히지 않음 |

- 게이트웨이 CPU(pinmon, 한 코어 대비): 카오스 전 gw 둘 다 ≈48%, 피해자를 받은 gw2 최고 A 78%·B 74%(같은 부하), 양보 뒤 새 연결을 전부 받은 gw1은
  ≈45%로 여유. B에서 gw2는 해제 문턱(55) 위에 머물러 종료 드레인까지 양보 상태였다(지시 플래핑 없음 — 런당 yield 1·listen 1(드레인)).
- 기본 문턱 2000 B 런 2개(`ab-B-2000r1`·`r2`, 같은 세션)도 gw2가 1,286·1,499연결에서 닫혀 양보했고 전부 복귀(r1 시도 2회 9명 — RST 5·양보 직전
  KICK 9 4, 최대 16.8 s).
- 버린 런: 같은 세션의 A 서버를 `~/mmorpg-cb`에 두었던 `ab-A-*`·`cpu70-A-*`는 pinmon이 서버로 인식하지 못해(인식 경로는 `~/mmorpg`·`~/mmorpg-a`뿐)
  A 서버가 부하 생성기 CPU에서 핀 없이 돌았다 — 그 4런은 접속 제한이 한 번도 닫히지 않았고 B와 비교하지 않는다(A를 `~/mmorpg-a`로 옮겨 다시 잰 것이
  위 표).
- 남는 것: 양보 순간 중지한 리스너의 accept 대기열 연결은 RST(`net.ipv4.tcp_migrate_req` 기본 0 — 운영 권고 1, ops-cluster §9) → 클라는 Blip
  재시도로 흡수(런당 0–8명). Windows monolith에서 KICK 6이 RST로 지워지는 경우(Blip로 시작 — 복귀는 됨)는 서버 half-close로 고칠 수 있는 선택 과제.
  N=2에서 한 게이트웨이가 죽으면 남은 쪽이 전부를 받으므로 게이트웨이당 목표 인원은 (N−1)/N 여유를 둔다(ops-cluster §9).
- 원자료: WSL `~/perf-storm`(런 디렉터리 — 1회차 `mono-restart-700*`·`wkill-*`·`wrestart-*`·`gwkill-*`, 2회차 `ly-*`, A/B `p70-*`·`p90-*`·`ab-B-2000r*`,
  `runs.log`, `pinmon*.jsonl`), 스크립트 `~/perf-storm/matrix{1..7}.sh`, 분석 `~/an/gwcpu.py`(게이트웨이·월드 CPU), 리스너 양보 실측 프로브
  (Bun `listener.stop(false)`가 reusePort 그룹에서 빠지고 기존 소켓은 유지, 재리슨은 그룹 재가입, 리스너 0이면 ECONNREFUSED).

## 몬스터 AI 리듬 — zoneBench A/B (2026-10-26)

> **발췌본에서 생략** — 게임 규칙에 해당해 공개 범위에서 뺐습니다.

## GCP 실측 — e2-standard-4 서버 1대 (2026-10-30)

> **발췌본에서 생략** — 클라우드 시험 환경의 구성이 적혀 있어 뺐습니다.
