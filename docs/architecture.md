# 2D MMORPG — Architecture v2 (Opus Redesign)

> **상태:** 재설계 (2026-05-02). v1(Sonnet) 코드는 PoC로 보존하되, 모든 신규 작업은 본 문서 기준.
> **선행 문서:** [protocol.md](../shared/protocol.md) (v2 바이너리 스키마), [migration-plan.md](./migration-plan.md)
> **능력치 고도화(2026-10-30):** [기본·상세 능력치](stat-system-v2-draft.md). 12개 기본 명칭, 서버 상세값·캐릭터 창, 전체 물리/마법 공격 명중, 잠재력/행운 분리, 생성·성장·장비·부활 HP/MP 계산 통일. `identity/characterResources.ts`가 현재 자원 보존과 장비 정신을 연결한다. (능력치 기준 클라 protoVersion 14 / IPC 17 — 현행은 protoVersion 16 / IPC 19(ENTITY_SPAWN.monsterDefId·4타입 기본 스킬 SkillInfo 확장, protocol.md §2.14).) 자동 성장 유지 + 레벨당 자유4P(4P당 능력치+1, [비교표](stat-balance-baseline.md))의 지급·배분·무료 초기화를 구현했다(protocol.md §2.12). 속도·전투 곡선·옵션은 후속 단계.

---

## 0. 재설계 동기 — v1의 구조적 한계

v1(현재 `server/`, `client/Noah/`)은 동작하는 PoC로서 가치가 있으나, 다음 설계 결함은 어떤 양의 후속 패치로도 풀리지 않는다:

| # | 결함 | 결과 |
|---|------|------|
| P1 | JSON-over-TCP | 같은 정보를 5–10× 큰 페이로드로 전송, GC 압박 |
| P2 | `Buffer.concat([buf, chunk])` 매 청크마다 | O(n²) 누적, 트래픽이 늘면 서버가 자기 자신을 죽임 |
| P3 | Unity `List<byte>` + `RemoveRange(0,…)` | 클라이언트 수신측 동일한 O(n²) 함정 |
| S1 | Tick 루프 없음 (순수 이벤트 핸들러) | 결정론·재현성 없음, 시뮬레이션 자체가 불가능 |
| S2 | `session.x += dx` 직접 변형 | 검증·충돌·속도제한 0 — 핸들러가 곧 치트 진입점 |
| S3 | `sessionManager.broadcast()` | 50 CCU 이상에서 즉시 N×M 폭증 |
| S4 | AOI(관심 영역) 부재 | 월드 스케일 자체가 의미를 잃음 |
| S5 | 영속성 계층 없음 | `nextPlayerId++`가 서버 재시작마다 리셋 |
| C1 | `_handlers[id] = handler` (덮어쓰기) | 멀티 구독 불가, scene 간 핸들러 등록이 정적 충돌 |
| C2 | `Input.GetKeyDown` 1회당 1셀 이동 | 게임 느낌이 즉시 어색 |
| C3 | 원격 플레이어 보간 없음 | `SC_PLAYER_MOVE` 받을 때마다 텔레포트 |
| C4 | 클라이언트 예측·재조정 없음 | 모든 입력에 RTT만큼의 지연 |
| O1 | `shared/`가 문서뿐 — 코드 공유 없음 | 패킷 타입 드리프트는 시간문제 |
| O2 | CLAUDE.md 경로가 `F:\mmorpg\` (실제는 `C:\DEV\mmorpg-master\`) | 도구·스크립트가 실제 디렉토리를 못 찾음 |
| O3 | 테스트 0건, 메트릭 0건, 구조화된 로그 0건 | 회귀 검출 수단 없음 |

v2는 위 17개를 모두 명시적으로 해소한다.

---

## 1. 시스템 개요

```
┌─────────────────────────────────────────────────────────┐
│                       Unity 클라이언트                   │
│  ┌─────────────┐  ┌────────────┐  ┌─────────────────┐  │
│  │ Input/Pred. │→ │  NetClient │→ │ World Renderer  │  │
│  │ Reconciler  │← │ (binary)   │← │ Interp. Buffer  │  │
│  └─────────────┘  └────────────┘  └─────────────────┘  │
└──────────────────────────┬──────────────────────────────┘
                           │  TCP, length-prefixed binary
┌──────────────────────────┴──────────────────────────────┐
│                      Bun 서버 (단일 프로세스, v2)         │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │ NetGateway │→ │  Tick Loop  │→ │ Snapshot Builder │  │
│  │ + Codec    │← │ 20 Hz sim   │  │ (per-AOI delta)  │  │
│  └────────────┘  └──────┬──────┘  └──────────────────┘  │
│                         ↓                                │
│  ┌──────────┐  ┌────────────────┐  ┌────────────────┐   │
│  │ Identity │  │   World/Zone   │  │  Persistence   │   │
│  │ + Auth   │  │   ECS-lite     │  │  bun:sqlite    │   │
│  └──────────┘  └────────────────┘  └────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

핵심 결정 7가지:

1. **권위 있는 서버 + 클라이언트 예측** — 입력은 시퀀스 번호 붙여 전송, 서버 tick에서만 진실, 클라이언트는 로컬에서 즉시 적용 후 재조정.
2. **20 Hz 고정 tick 시뮬레이션** — 모든 게임 상태 변화는 tick 경계에서만 발생. 결정적·재현 가능·테스트 가능.
3. **바이너리 프로토콜 + 단일 스키마** — `shared/schema/packets.json`에서 코드젠하여 TS/C# 타입 동시 생성. (RON 대신 JSON 부분집합 채택 — 위험 등록부 결정.)
4. **그리드 기반 AOI** — 16 타일 셀, 3×3 윈도우. 각 클라이언트는 자기 윈도우 내 엔티티만 수신.
5. **ECS-lite 월드 모델** — 외부 라이브러리 없이 entity table + component map. 시스템 단위 tick 처리.
6. **bun:sqlite 영속성** — 무의존, 파일 기반, 빠름. Postgres 마이그레이션 경로는 repo 계층으로 분리.
7. **shared 코드 공유** — `shared/`는 문서가 아닌 **빌드 산출물의 입력**. 코드젠 결과를 서버/클라 모두 import.

### 1.1 프로세스 역할 — monolith | 월드 1 + 게이트웨이 N (성능 4단계, 완료)

env `ROLE`이 정한다. 기본 `monolith`는 위 그림 그대로 한 프로세스다. `world` + `gateway`는 opt-in이고, 클라·와이어 변경은 0이다.
결정·기각 대안·측정 요지는 [ADR 0002](adr/0002-gateway-split.md), 운영 절차는 [`ops-cluster.md`](ops-cluster.md), IPC 사양은 §3.4,
프로세스별 관측은 §9.7에 있다.

```
 Unity 클라 ──TCP──▶ gw1 ┐                                   ┌ 핸들러(HELLO·AUTH·claimAccount 포함)·존·20 Hz tick
 Unity 클라 ──TCP──▶ gw2 ┼── IPC(tcp loopback | unix) ──▶ world ┤ DB 단일 writer·GM·연결 상한·과부하 접속 제한
 Unity 클라 ──TCP──▶ gwN ┘   게이트웨이당 FIFO 스트림 1개       └ 클라 연결마다 PlayerSession — 송신은 RemoteClientLink
 Linux: 클라 포트 1개를 reusePort로 공유 / Windows·macOS: 게이트웨이별 포트
```

| ROLE | 맡는 일 | 갖지 않는 것 |
|---|---|---|
| `monolith`(기본) | 전부(종전 경로) | — |
| `gateway` | accept·NoDelay·프레이밍·size 화이트리스트·rate(strike·명령 예약분)·idle·pre-auth 데드라인(월드 CONN_STATE 미러)·게이트웨이 연결 상한·원시 프레임 전달·tick/턴 배치 송신(로컬 `OutboundLink`)·admin(metrics·healthz·logs) | 게임 상태·DB(import 가드 + `initDb` 역할 가드)·GM |
| `world` | 핸들러·존·tick·DB·GM 전부 + 게이트웨이 IPC(`WORLD_IPC`) | 클라 소켓(`WORLD_CLIENT_LISTEN=1`일 때만 직접 접속) |

불변식: 게이트웨이마다 IPC 스트림 1개(FIFO)이고 결정은 월드에서만 직렬화된다. 클라 연결 하나는 일생 동안 한 쌍(게이트웨이
incarnation, 월드 incarnation)에 속한다(새 월드로 이월 없음). 중복 로그인 인과(§7.2b)·존 이동 동기 핸드오프·GM·DB 단일 writer는
월드 안에 그대로 남아 구조적으로 성립한다 — 핸들러·zone·autoSave·sim/·world/는 바뀌지 않았다.

**모듈** (단계별 커밋은 git 이력, 결정은 ADR 0002 §5)
- 이음새(4.1, monolith 동작·와이어 바이트 불변): `network/clientEdge.ts`(소켓 엣지 정책 — 연결 객체 `EdgeConn`·처리기 `EdgeSink`만
  모드별, monolith·게이트웨이 공용. 같은 바이트 스트림 → LocalSink와 IpcSink의 통과 프레임·킥 바이트·idle 창·종료가 같음을
  `tests/server/cluster/clientEdgeParity.test.ts`가 고정), `frameIngest.ts`(본문 디코드·디스패치), `sessionLifecycle.ts`(수용·종료·
  대량 종료 `closeSessions` — 배치 저장 1회), `clientLink.ts`(세션 송신 표면 — 로컬 `OutboundLink` / 원격 `RemoteClientLink`),
  `tcpServer.ts`(monolith 조립 래퍼 — `startTcpServer`는 인자 불변, 반환은 `TcpServerHandle`(포트·리스닝 중지·직결 세션 목록 — 우아한 종료, 서버 슬라이스 2)).
- IPC(4.2a·4.2b — §3.4): `cluster/ipcSchema.ts`·`ipcCodec.ts`·`ipcPipe.ts`, 월드 쪽 `worldIpcServer.ts`·`gatewayPeer.ts`·`remoteClientLink.ts`.
- 게이트웨이(4.2c): `gateway/gatewayConn.ts`(엣지 연결 표면을 게임 상태 없이 — PlayerSession과 같은 rate·예약분·strike·과부하 면제
  초기값, 로컬 `OutboundLink`, 로그인 상태는 CONN_STATE 미러 — AUTHENTICATED/IN_WORLD 첫 도달에서 pre-auth 해제),
  `gatewayCore.ts`(연결 표·IpcSink·월드 메시지 처리·월드 유실 정책 — transport 무관), `gatewayDeliver.ts`(월드 → 클라 전달 —
  DELIVER·DELIVER_SHARED·MULTICAST·CONN_FLUSH), `gatewayAdmission.ts`(부하 접속 제한 배선 — 판정은 `gatewayLoad.ts`),
  `gatewayMain.ts`(`startGateway` — `connectIpc` →
  HELLO → HELLO_ACK 뒤에만 클라 리스닝 → 유실 시 백오프 재접속 250 ms → 5 s, incarnation은 프로세스당 1개).
  - 수용(CONN_OPEN 전): 월드 핸드셰이크 전이면 KICK 6 "world unavailable", 부하 기반 접속 제한(성능 4.5 — §3.4 끝, `gateway/gatewayLoad.ts`)이면
    KICK 9 "server busy", min(`GATEWAY_MAX_CONNECTIONS`, HELLO_ACK `connCap`) 초과면 KICK 9 "connection cap". 엣지 킥은 `clientEdge`의 선택 훅 `kicked`가 사유를 기록한다(size 3·rate 2·idle/데드라인 1, 클라가 끊음 0).
  - 월드 유실: 리스너 중지 + 전원 KICK 6(연결 표를 먼저 비워 죽은 링크에 CONN_CLOSED를 쓰지 않음, `mmorpg_gw_conn_closed_total{reason="world_lost"}`).
    우아한 종료: BYE → 전원 KICK 6 "gateway shutdown"(CONN_CLOSED 6) → 파이프 end(송신 꼬리 flush를 기다리는 연결은 월드가 BYE 뒤
    끊김(`bye`)의 피어 정리 배치 저장으로 닫는다).
- 진입점(4.2c): `server/src/index.ts`는 ROLE별 본체를 동적 import한다. 정적 import는 env·관측 부팅(`obs/processBoot.ts` — proc 태그·
  파일 싱크 접두어·크래시 핸들러)뿐이다. monolith·world → `worldMain.ts`(서버 wiring root — world는 `WorldIpcServer`를 tick 루프 전에
  만들어 `ipcFlush`를 배선하고, tick 루프 시작 뒤 `WORLD_IPC`를 listen), gateway → `gateway/gatewayMain.ts`. 게이트웨이 프로세스는
  월드·DB 모듈을 싣지 않는다 — `tests/server/cluster/gatewayImportGuard.test.ts`가 새 프로세스의 모듈 캐시로 고정하고, `initDb`의
  역할 가드가 마지막 방어선이다(admin GM 라우트 모듈은 첫 GM 요청에서 동적 import — 월드만 해당).
- 운영(4.3a): 슈퍼바이저 `cluster/launch.ts`(`bun run cluster -- --gateways N` — 개발·WSL 측정용), 배치 `launchPlan.ts`(Linux 포트
  공유·Windows·macOS 게이트웨이 i = `PORT`+i−1, admin 월드 `ADMIN_PORT`·게이트웨이 +i, `PROC_NAME` world·gw<i>, 포트 겹침은 기동 전
  거부), 상태기계 `supervisor.ts`(월드 → healthz → 게이트웨이 → HELLO_ACK, crash-only 기동, 운영 중 재기동 min(500 ms × 2^연속실패,
  10 s) — 10 s 이상 살았으면 초기화, 월드 먼저 종료, 두 번째 신호 = 강제), 종료 트리거 `supervisorLink.ts`(Bun IPC 메시지 — Windows는
  시그널로 우아한 종료를 못 시킨다. `CLUSTER_SUPERVISED=1`이면 SIGINT 무시, 종료 메시지·슈퍼바이저 IPC 끊김으로 우아하게 끝낸다).

**우아한 종료 순서**(monolith·world 공용 — `worldMain` → `gracefulShutdown.ts runGracefulShutdown`): ① 수용 중지 — 직결 클라 리스너
`stopListening`(monolith·`WORLD_CLIENT_LISTEN=1` — 이후 접속은 거부, 기존 연결 유지), IPC 리스너 중지 + `stopAdmitting`(이후 HELLO는
HELLO_NACK closed, CONN_OPEN은 회계 없이 KICK 6 "server shutdown") → ② 최종 저장(`saveAllInWorld` — 실패는 로그만) → ③ 직결 세션 전원
(상태 무관 — 미인증 포함) KICK 6 "server shutdown" + 종료(`sessionLifecycle.kickForShutdown` — 연결별 종료이지 전원 송신 API가 아니다,
`sessionManager.broadcast`는 여전히 없다) + `WorldIpcServer.shutdown`(피어마다 SHUTDOWN(6) — 게이트웨이가 리스너 중지 + 전원 KICK 6 +
CONN_CLOSED, 월드는 연결마다 `closeSession`) → ④ 드레인 — 직결 연결이 다 닫히고 게이트웨이 연결이 다 빠지거나 상한
`DEFAULT_SHUTDOWN_DRAIN_MS` 10 s(직결 KICK 꼬리는 링크 end가 flush 뒤 닫고, 못 비우면 5 s 뒤 강제) → ⑤ `close`(남은 원격 세션 배치 저장)
→ tick·admin 중지 → 로그 싱크 드레인 → 종료. ③ 뒤의 close 콜백(`closeSession` → `saveOnDisconnect`)은 두 번째 저장이고(최종 저장의
청크 양보 사이 tick 변경까지 싣는다) DB는 프로세스 종료까지 열려 있어 무해하다. 직결 킥 루프는 외곽 tx 1개 안에서 돈다
(`autoSave.inOneSaveTransaction` — 꼬리 없는 로컬 링크는 end() 안에서 close가 동기로 돌아 그 저장들이 SAVEPOINT로 묶여 커밋 1회, 캐릭터 실패
격리는 그대로): 2000 인월드 세션 실측(Windows) 세션별 커밋 `DB_SYNCHRONOUS` NORMAL ≈0.2 s·FULL ≈2.0 s(그동안 뒤쪽 세션의 KICK이 밀린다) →
≈0.03 s. 종전 monolith는 저장 후 exit라 직결 클라가 EOF만 봤다 — 자동 재접속 클라가 KICK 6으로 "서버 종료"를 알게
했다(시험 `tests/server/net/gracefulShutdown.test.ts`·`tests/integration/e2e-shutdown.test.ts` 두 토폴로지). 게이트웨이는 SHUTDOWN 뒤의
끊김을 예고된 종료(`mmorpg_gw_world_lost_total{reason="shutdown"}`, info)로 보고 다음 월드를 기다린다. 롤링 게이트웨이 재시작은
BYE → 전원 KICK 6 → CONN_CLOSED → 종료이고, 월드는 BYE 뒤의 끊김을 `mmorpg_ipc_peer_lost_total{reason="bye"}`로 센다.

**테스트**: in-process 토폴로지 `tests/integration/helpers/topology.ts` `bootTopology("monolith" | "gateway-inproc")`(월드 IPC 서버 +
게이트웨이 1–N개를 한 프로세스에서 실제 루프백 소켓으로, 운영과 같은 `startGateway`·tick 배선) + `gw-*.test.ts`(게이트웨이 2개에 걸친
중복 로그인 인과·포탈 연타 인벤 multiset·골드·GM 킥·v2 baseline 2모드). e2e 스위트 전부(`e2e-*`·`v2-baseline`·`character-create`)도
`bootTopology(TEST_TOPOLOGY)`로 부팅해 env `TEST_TOPOLOGY`(monolith 기본 | gateway-inproc)로 토폴로지를 고르고, CI는 통합 시험을 두 값으로
돌린다(`zz-loadgen-smoke`만 monolith 고정). 멀티 프로세스는 `tests/cluster/`(`CLUSTER_TESTS=1`에서만,
CI `cluster` 잡 — ROLE 스모크·슈퍼바이저 기동·재기동·우아한 종료·카오스 C1–C6(C6 = 포화 게이트웨이 접속 제한, 4.5), [`ops-cluster.md`](ops-cluster.md) §6).
클라 자동 재접속(토큰 재로그인, §7.2)의 장애 모드는 두 토폴로지 e2e(`e2e-dup-login` Flow 6 응답 없는 유령 선점 — 클라 쪽 링크에 미송신
꼬리를 만들어 선점의 close가 새 세션 입장 뒤로 밀리는 늦은 close까지·`e2e-token` Flow f 연속 재접속·Flow g 재기동 — 파일 DB,
`bootTopology` `dbPath`)와 카오스 C1(게이트웨이 유실 전·후)·C2(월드 재기동)·C4(같은 토큰 경합·멈춘 게이트웨이의 옛 AUTH)의 토큰 변형이 본다.

**측정**(4.4, `docs/perf-baseline.md` "성능 4단계"): spread p99 25 ms 교차가 monolith ≈716 → 게이트웨이 2개 ≈1,101(**1.54배** — 합격선
1.6배 근소 미달, 게이트웨이 사용률 0.41–0.44코어는 통과). 한계는 월드 tick(스냅샷 11.9 + IPC 프레이밍 3.1 ms / 평균 16.9 ms)이고, 월드
IPC 비용이 세션·tick당 3.0–3.4 µs(예산 ≤ 2.7)라 보류 항목 MULTICAST의 트리거를 넘었다(ADR 0002 §7). 게이트웨이를 늘리면 월드 IPC
비용이 커져 N=3·4가 N=2보다 낮다. 4.5 F2가 발행 시점 팬아웃(sendMany)에 MULTICAST를, 4.5 F3가 같은 셀 viewer의 SNAPSHOT_DELTA 공유
프레임(게이트웨이 봉투당 DEF 1개 + 연결별 ackSeq 패치 — IPC v5)과 그 묶음(monolith도 writeEntries를 묶음당 1회)을 개통했다(§3.4·§5.2).
4.5 F1은 포화 게이트웨이의 통째 끊김을 신규 접속 KICK 9로 바꿨다(§3.4 끝·§10).

**재측정**(4.5, `886f9dd`, `docs/perf-baseline.md` "성능 4.5"): spread p99 25 ms 교차가 monolith ≈678 → 게이트웨이 2개 ≈1,159(**1.71배 —
합격선 통과**, 4.4 monolith ≈716 기준 1.62배, 게이트웨이 메인 스레드 0.39–0.47코어). 월드 IPC 바이트 spread −84%·stock −99%·realistic
−80~82%, IPC 프레이밍 −53~57%, 세션·tick당 1.52–1.57 µs(예산 안, tick의 12%). 게이트웨이 1개 spread 1500–3000에서 끊김 0(초과분은 KICK 9).
남은 한계는 스냅샷 단계 — 특히 p99 꼬리(평균 −8~12%, p99 불변)다. 스냅샷 SPAWN/DESPAWN 공유는 남았다(4.5 설계 (a) — 4.4 기준 spread
IPC의 ≈7%, ADR 0002 §7).

---

## 2. 디렉토리 레이아웃 (v2)

> **발췌본에서 생략** — 원 저장소 전체의 폴더 구조입니다. 발췌본에는 일부만 있어 뺐습니다.

## 3. 네트워크 계층

### 3.1 프레이밍

```
현행(v2 LE 4바이트, B1):  [len:2 LE][id:2 LE][body…]   len-prefix 먼저, 16-bit(=65535 max), 리틀엔디안
                          body는 모든 패킷(C2S 36개·S2C 50개)이 binary LE — 생성 코덱(이진 전환 B1~B6 완료,
                          B6에 JSON 본문 경로 제거 — 스키마 밖 id는 인코드 거부·디코드 실패)
구 v1(BE 6바이트):        [id:2 BE][len:4 BE][body…]   protoVersion ≤ 2 — 구 클라 거절(v1 형식 KICK 1)에만 남는다
```

> 이진 전환 B1(protoVersion 3, IPC_VERSION 6)에서 헤더를 v2로 바꿨다. 구 클라는 첫 프레임의 v1 HELLO 서명(v2로 읽은 len 0x0100·id 0 —
> id 0은 예약)으로 알아보고 v1 형식 KICK 1 후 닫는다. 정형 사양은 `shared/protocol.md` §1(현행)/§1.2(구 클라 거절).
> B2b(protoVersion 5)에서 C2S 29개를 바이너리로 바꿨다. v2 프레이밍에 JSON HELLO를 보내는 B1~B2a 클라는 ANON HELLO 디코드 실패로 알아보고
> KICK 1(`client update required` — B3b부터 JSON 본문 고정 프레임, 아래) 후 닫는다(`frameIngest.ts`, HELLO 수신 상한은 바닥 64 — protocol.md §1.3). IPC_VERSION 7(게이트웨이 엣지의
> 수신 상한이 바뀌어 B1 빌드와 섞지 않는다).
> B2c(와이어 불변)에서 수신 판정 순서를 **사전 판정 → 디코드**로 바꿨다(`network/packetAdmission.ts` — 미지 id(스키마의 C2S id가 아님) → 상태
> 화이트리스트, 종전 라우터와 같은 메트릭). 거부한 프레임은 본문을 읽지 않고(JSON 경로 제거), 처리될 패킷의 디코드 실패는 drop + 세션별 strike —
> `NET_DECODE_WINDOW_MS`(10 s) 안에서 `NET_DECODE_STRIKES`(5)를 넘으면 KICK 5 "malformed packets"(§10, protocol.md §2.3). 디코드는 월드에서만 하므로
> 게이트웨이 경유도 같다.
> B3b(protoVersion 6, IPC_VERSION 8)에서 고빈도 S2C 11개(ENTITY_SPAWN·ENTITY_DESPAWN·ENTITY_META·MOVE_PATH·CHAT_BCAST·DAMAGE_EVENT·SKILL_EFFECT·
> MANA_UPDATE·PONG·HELLO_ACK(frozen)·KICK)를 바이너리로 바꿨다(protocol.md §2.8). B1~B2b 클라(protoVersion 3~5)는 JSON KICK만 읽으므로 업데이트
> 안내 두 경로(ANON HELLO 디코드 실패·HELLO 버전 불일치 중 3~5)만 v2 헤더 + JSON 본문 고정 프레임(`net/wireFrame.ts` `LEGACY_JSON_KICK_FRAME`)을 보내고,
> 그 밖의 KICK은 바이너리다(HELLO 전 KICK은 구 클라에게 연결 종료로만 보인다 — protocol.md §1.3).
> B4(protoVersion 7, IPC_VERSION 9)에서 나머지 고정형 S2C 17개(AUTH_RESULT·ENTER_WORLD_OK·ZONE_INFO·CHAR_CREATE_RESULT·ZONE_CHANGE·CHAR_EXP_GAIN·
> GOLD_UPDATE·TARGET_ACK·DEATH_NOTIFY·RESPAWN_OK·SKILL_CAST_ACK·SKILL_LEARN_ACK·SKILL_LV_UP·ITEM_USE_ACK·ITEM_PICKUP_ACK·QUEST_PROGRESS·SHOP_ACK)를
> 바이너리로 바꿨다(protocol.md §2.9 — 토큰·캐릭터명 에코·존 이름 max 64 B, tickIndex mod 2^31, SLP 포화). 송신 경로는 인코드 실패를 그 패킷 하나만
> 버린다(§3.3 송신 단위 방어층). B5는 남은 자율 형식을 도메인별로 JSON 상태 스키마화(a — 바이트 불변) → flip(b)한다(protocol.md §2.10):
> B5②a에 INVENTORY_LIST·INVENTORY_UPDATE·SHOP_LIST가 스키마를 얻고 B5②b(protoVersion 8, IPC_VERSION 10)에 바이너리가 됐다(INVENTORY_UPDATE는
> bodyOf로 상속 — 최악 본문 322 B·3,324 B). B5③a에 SKILL_LIST(`SkillInfo[]` — enum `SkillCategory`·`SkillDefEffectKind`·`SkillTargeting`)·
> UI_PREFERENCES가 스키마를 얻고(바이트 불변) B5③b(protoVersion 9, IPC_VERSION 11)에 바이너리가 됐다(최악 본문 27,138 B·49 B). B5④a에 NPC_DIALOG
> (중첩 `DialogNode[]` — 평탄화·action enum 없음)·QUEST_LIST(`QuestLogEntry[]` — enum `QuestType`·`QuestObjectiveKind`)·QUEST_ACTION_ACK(`rewards?` — enum
> `RewardSource`)·QUEST_NPC_MARKERS가 스키마를 얻고(바이트 불변) B5④b(protoVersion 10, IPC_VERSION 12)에 바이너리가 됐다(최악 본문 64,492·64,378·193·
> 8,194 B — 배열 안 struct의 optional은 struct별 presence 비트). B5①a에 CHAR_STATS_FULL(중첩 `CharGraph`·`CharStats` — name 66 B 송신 전 자르기)·
> CHAR_LEVEL_UP(`CharStatDelta[]` max 3,588 — enum `StatGroup`·`StatCode`)·PORTAL_LIST(`PortalMarker[]` max 32 — portals 로더가 이름 64 B·id i32·rect
> [0, 4096]·존당 개수를 부팅 시 강제)가 스키마를 얻어(바이트 불변) 자율 형식이 0개가 됐고, B5①b(protoVersion 11, IPC_VERSION 13)에 그 셋이 바이너리가
> 되면서 CHAR_LIST가 `CharSummary[]` max 16으로 형태를 바꿨다(종전 JSON 문자열 — x·y 제거, 조회 LIMIT 상한 + 1행·넘으면 warn — 최악 본문
> 1,282·240·50,246·2,630 B, 한 번에 약 76레벨 이상 오르면 CHAR_LEVEL_UP JSON이 u16을 넘어 drop되던 결함이 닫혔다). 이로써 S2C 전부가 바이너리다.
> B6(와이어 불변 — protoVersion·IPC_VERSION 그대로)이 남은 JSON 경로를 지웠다: 송신(`packetWriter`·`frameOutbox`)·수신(클라 `PacketBus`)·클라 송신
> (`PacketWriter`)·loadgen·시험 헬퍼의 JSON 분기, 생성 `isBinaryPacket`·`IsBinaryPacket`·`BINARY_PACKET_IDS`(전 id true), 스키마 `defaultEncoding`·패킷
> `encoding`·`freeform`(gen이 거부), lock의 JSON 지문·`looseHash`·스키마화 전이 허용. 프레임 본문 JSON 재도입은 CI 가드
> (`tests/server/net/frameBodyJsonGuard.test.ts`)가 막는다. 남은 와이어 JSON은 구 클라 거절 고정 프레임 두 개(v1 KICK·`LEGACY_JSON_KICK_FRAME` — 바이트 상수)뿐이다.

> **능력치 확장(protoVersion 12 / IPC 15):** CHAR_STATS_FULL 끝에 CharDerivedStats(128 B)를 추가해 최악 본문이 368 B가 됐다. 확률·배율은 f64, 공격 간격 i32, 이동속도 f32이며 HP/MP 상한은 기존 필드를 사용한다. 입장·장비 변경·레벨업 등에 소유자에게 송신한다. 전투/상세 창은 damage.ts의 공식을 공유한다(protocol.md §2.11).
>
> **자유 포인트(protoVersion 13 / IPC 16):** STAT_ALLOCATE·STAT_RESET·STAT_POINTS_ACK를 추가하고 CHAR_STATS_FULL 끝에 freePoints·allocatedPoints(8 B)를 붙여 최악 본문이 376 B가 됐다. IPC 레이아웃은 그대로다(protocol.md §2.12). 요청 id(protoVersion 14 / IPC 17)로 STAT_ALLOCATE·STAT_RESET·STAT_POINTS_ACK에 `requestId`를 더해 응답을 못 받은 요청의 재전송이 한 번만 지출된다.
>
> **몬스터 def id(protoVersion 16 / IPC 19):** ENTITY_SPAWN 끝에 `monsterDefId`(i32 — 몬스터는 monsters.json def id, 그 외 0)를 붙여 최악 본문이 109 B가 됐다. 클라가 def별 외형(예: 9000 허수아비)을 고른다. 송신원은 스냅샷 SPAWN(`EntityMetaStore.spawnMetaOf`)뿐이고 IPC 레이아웃은 그대로다(protocol.md §2.14).
>
>
> **생활 L-1(protoVersion 17 / IPC 20 — 생활 브랜치의 15·16 두 단계를 master 병합 때 한 번호로 묶음):** 채집 패킷 6개(0x0480–0x0485 — GATHER_START·LIFE_CANCEL·LIFE_CHANNEL·LIFE_RESULT·LIFE_STATUS·NODE_CATALOG)와 `EntityType.resource`(5)를 더했다. 기존 패킷 레이아웃은 그대로다 — 노드 def id는 ENTITY_SPAWN의 `npcId` 칸, 남은 충전은 `hp`·`hpMax` 칸을 쓴다. 기능 플래그 `LIFE_CONTENT`(기본 0)를 끄면 세션별 와이어 바이트가 같다(protocol.md §2.15, §4.6).
>
> **생활 L-2(같은 protoVersion 17 / IPC 20 묶음):** 제작 패킷 3개(0x0490–0x0492 — RECIPE_LIST·CRAFT_REQ·CRAFT_ACK)를 더했다. 기존 패킷 레이아웃은 그대로다 — `DialogAction.type` 값에 `open_craft`만 늘었고 stationId는 서버 전용이다. 같은 플래그를 끄면 세션별 와이어 바이트가 같다(protocol.md §2.16, §4.6).
>
> **채집 미니게임(protoVersion 18 / IPC 21):** GATHER_PUZZLE(0x0486)·GATHER_TRACE(0x0487)와 `PuzzlePoint`, LIFE_CODE 20·21을 더했다. 채집 채널이 tick 채널 시간 대신 서버가 다시 판정한 궤적으로 끝난다. IPC 레이아웃은 그대로다(protocol.md §2.17, §4.6).
>
> **채집 미니게임 원 짚기(protoVersion 19 / IPC 22):** GATHER_PUZZLE에 `kind`(`GatherPuzzleKind` — trace 0·tap 1)·`circleRadius`를 붙여 최악 본문이 67 → 70 B가 됐고, C2S GATHER_TAPS(0x0488 — `PuzzleTap[]` ≤ 16, 최악 118 B)를 더했다. IPC 레이아웃은 그대로다(protocol.md §2.18, §4.6).

v2 프레이밍의 설계 의도:
- **리틀엔디안**: 클라이언트(x86/ARM)·서버(x64) 모두 네이티브. "네트워크 바이트 오더"는 양 끝을 우리가 제어할 때 의미가 없다.
- **len 먼저**: 헤더 자체가 짧기에 한 번에 읽고 바로 길이로 분기. id 검사는 그 다음.
- **16-bit len**: 단일 패킷 65 KB 상한을 인코딩 단계에서 강제. 그 이상은 chunked 메시지(미사용 영역)로 별도 ID 할당.
- **재진입성**: 서버 측 `RingByteBuffer`(`net/ringBuffer.ts`)는 head/tail 포인터로 O(1) 추가, 슬라이스 시 zero-copy view 반환. v1의 `Buffer.concat` 폐기.

**송신 백프레셔**(`network/outboundLink.ts`, 1-C(3)): Bun `socket.write`는 커널 송신 버퍼가 차면 일부만
쓰고 나머지를 버퍼링하지 않는다. 세션 송신은 전부 `OutboundLink`를 거치며 —
- 부분 쓰기 잔여(꼬리)는 보관했다가 소켓 `drain` 콜백에서 이어 쓴다. 꼬리가 있는 동안 새 프레임
  (즉시/코얼레싱/KICK)은 직접 쓰지 않고 꼬리 뒤에 붙인다 — length-prefix 스트림의 프레임 경계 보존.
- 꼬리가 `OUTBOUND_MAX_BYTES`(기본 256 KB)를 넘으면 느린 소비자로 보고 종료
  (`mmorpg_net_tx_backlog_close_total`). 판정은 복사 전에 한다(넘칠 꼬리는 복사하지 않음). 부분 쓰기 발생은
  `mmorpg_net_tx_partial_total`.
- `session.socket.end()`는 우아한 종료: 먼저 세션 outbox(코킹 중 쌓인 프레임 + KICK)를 링크로 보내고(종료 전 훅,
  성능 3단계 슬라이스 6 — tick·수신 디스패치 구간 안의 킥도 KICK 유실 없음), 꼬리를 비운 뒤 close(KICK이 앞선 프레임 뒤에 도착),
  끝내 안 비면 5초 후 강제 close(타이머 unref). 종료 요청 이후 송신 프레임은 버리고
  `mmorpg_net_packets_tx_total`에 집계하지 않는다(링크가 수락한 프레임만 집계 — 코킹분은 uncork 때).
- 종료 중 링크는 **수신도 멈춘다**: KICK 판정 후 꼬리 flush를 기다리는 동안 도착한 프레임은
  파싱·디스패치하지 않고 inbox를 버린다 — 킥이 입력에 즉시 효력.
- close 콜백은 첫 줄에서 `dispose()`로 꼬리·end 타이머를 즉시 해제한다(피어가 먼저 끊은 경우).
- 재진입: Bun은 `raw.end()` 안에서 close 콜백을 동기 실행한다(실측). 상한 초과 terminate는 그
  스택 안에서(withCork uncork 루프 포함) close 본체(`sessionLifecycle.closeSession`)를 재진입 실행 — 안전 근거와 전제는
  `outboundLink.ts` 상단 불변식.
종전엔 부분 쓰기 = 즉시 세션 종료(리뷰 #22)라 과부하·느린 회선에서 커널 버퍼가 잠깐만 차도 끊겼다.

**송신 인코딩·팬아웃**(성능 3단계 슬라이스 5 — 세션별 와이어 바이트 불변, `tests/regression/wireCharacterization`):
- 세션 outbox(`network/frameOutbox.ts`): tick(`withCork`) 동안의 프레임을 세션당 늘어나는 Buffer 1개에 직접 인코딩한다
  (생성 코덱 `wireCodec.generated.ts`로 — `writePacket`과 같은 바이트). uncork는 그 뷰를 링크로 한 번 넘기고 곧바로 비워
  다음 tick에 재사용한다 — 링크는 못 보낸 꼬리·대기 프레임을 복사해 보관하므로 재사용이 링크가 쥔 바이트를 덮지 않는다.
  프레임별 packet id는 outbox가 기록해 `mmorpg_net_packets_tx_total`을 종전처럼 프레임마다 집계한다.
- 팬아웃 1회 인코딩: 같은 페이로드를 여러 플레이어에게 보내는 곳은 `sessionManager.sendMany(ids, id, payload)`를 쓴다 — 첫
  실수신자에서 프레임을 1회 만들어 모두에게 보낸다. 결과는 ids 순서대로 `sendTo`를 반복한 것과 같다(미인증 id 건너뜀, 중복 id는
  중복 송신 — 중복 제거는 호출자 몫, 수신자마다 `packets_tx` +1). 수신자 열은 호출자가 AOI로 만든다(`viewersOf` + 당사자,
  CHAT_BCAST는 존 전원 — 채널 설계상 의도, MOVE_PATH는 요청자 본인에게만 `sendTo`). broadcast(접속 전원)는 여전히 없다.
  이벤트 팬아웃(DAMAGE_EVENT·SKILL_EFFECT·ENTITY_META)은 `ZoneOptions.fanout`으로 주입되고, 미주입 존(테스트)은 수신자마다
  `sendTo`로 대체한다. 스냅샷 SPAWN/DESPAWN은 dispatch 1회 동안 엔티티당 1회 인코딩한 프레임을 viewer마다
  `sendFrame`으로 보낸다(위치·메타·사망 스탬프가 dispatch 중 불변이라 페이로드가 viewer와 무관).
- SNAPSHOT_DELTA 빠른 경로(성능 3단계 슬라이스 7, `ZoneOptions.deltaFrames` — 운영 zoneRegistry만 주입): viewer별 DELTA 프레임을
  재사용 버퍼에 직접 쓰고 `sendFrame`으로 넘긴다(뷰는 호출 동안만 유효 — outbox·링크가 복사한다). 미주입 존(테스트)은 종전
  페이로드 객체를 `sendTo`로 보낸다. 바이트는 같다(§5.2).
- SNAPSHOT_DELTA 묶음(성능 4.5 F3, `ZoneOptions.deltaShared` — 운영 zoneRegistry만 주입): keep 열·self가 같은 viewer끼리 공유 프레임
  (`net/sharedFrame.ts`) 1개를 `sessionManager.sendShared`로 보내고 세션이 ackSeq만 패치한다 — 로컬 링크는 outbox에 복사·패치(종전 바이트),
  원격 링크(IPC_SHARED=1)는 outbox가 끝 참조만 들고 uncork가 게이트웨이 봉투의 공유 프레임 정의 + 연결별 참조로 보낸다(§3.4 공유 프레임).

**tick 밖 송신 코얼레싱**(성능 3단계 슬라이스 6 — 세션별 와이어 바이트 불변, write 경계만 바뀜, `network/deferredSends.ts`):
- 수신 디스패치(Bun data 콜백 본체 `clientEdge.ingestEdgeChunk` — 핸들러 동기 구간·위반 킥, monolith 처리기의 `deferSends` 구간)의 송신은 즉시 write하지 않는다. 세션의 첫
  송신이 세션을 지연 코킹하고 턴 끝 flush 큐에 1회 등록하면, `setImmediate` 1회(대기 세션 전체 공용)가 세션당 write 1회로 보낸다.
  Bun은 한 poll 반복의 data 콜백을 연달아 돌린 뒤 immediate를 돌리므로(실측) 같은 턴의 다른 소켓이 보낸 프레임(MOVE_PATH 팬아웃·
  CHAT_BCAST·응답)이 수신자마다 1 write로 합쳐진다. 종전: 송신 1건 = write 1회(500 CCU realistic에서 초당 약 3.5만 write).
- 순서: 코킹된 세션에는 구간 밖 송신(async 핸들러의 await 이후·GM·타이머 킥)도 outbox 뒤에 붙는다. tick(`withCork`)의 cork는 멱등이라
  같은 outbox를 이어 쓰고 uncork가 지연 프레임까지 함께 보낸다 — Bun은 due 타이머와 immediate의 순서를 보장하지 않는다(실측).
  지연 코킹은 구간 안 송신에만 걸리므로 구간 밖·대기 없는 세션은 종전대로 즉시 write다(핸들러 단위 테스트 무변경 — `tcpServer.ingestChunk`로
  넣는 테스트는 `setImmediate` 1턴을 기다린 뒤 바이트를 읽는다).
- 종료: `socket.end()`가 outbox를 먼저 보낸다(위 백프레셔 절). flush 1건의 실패(uncork 예외)는 그 세션만 닫는다.
- 상한(3단계 리뷰): 구간 안 송신으로 outbox + 링크 꼬리가 `OUTBOUND_MAX_BYTES`를 넘으면 그 자리에서 링크로 보내고 다시
  코킹한다(`PlayerSession.capDeferredOutbox` — 순서·바이트 불변, write 경계만 늘어남). 느린 소비자 판정은 링크 몫이라 세션당
  보유는 즉시 write 시절처럼 상한 근처로 묶인다. 종전에는 턴 끝까지 무제한으로 쌓여 채팅 버스트(계정 4개 × CHAT_SAY 110건 →
  존 1000명 팬아웃)가 outbox 합계 1 GB·RSS +1.5 GB를 잡았다(계정 16개면 4 GB). tick(`withCork`) 구간은 조기 flush하지
  않는다 — 거기서 링크가 끝나면 close 콜백이 tick 도중 재진입한다(`outboundLink.ts` 재진입 불변식). tick 1회의 세션 송신량은
  AOI로 묶이고 uncork 때 링크가 판정한다.
- 관측: `mmorpg_net_tx_writes_total`(raw write 호출 수, §9.6) — `packets_tx / writes` = write당 프레임 수. 지연 프레임의
  `packets_tx` 집계 시점은 flush 때다.
- 턴 끝 훅(성능 4단계 4.2b): 같은 `setImmediate`가 대기 세션을 다 보낸 뒤 `addTurnEndHook`으로 등록된 훅을 부른다 — 월드는 여기서
  게이트웨이 피어 IPC 배치를 flush한다(세션 링크가 이번 턴에 쌓은 DELIVER가 봉투 1개로). 세션 대기 없이 훅만 필요하면
  `requestTurnEndFlush`(구간 밖 원격 송신·IPC 제어 메시지)가 같은 예약을 쓰고, 세션 flush 도중의 요청은 새 예약을 만들지 않는다.
  monolith는 훅이 없다.
- 실측(3단계 후 재측정, `docs/perf-baseline.md` "성능 3단계 — Bun 최적화 후"): realistic 500 CCU의 tick 밖 CPU가 W 0.87 → 0.46·
  L 0.66 → 0.47코어, MOVE_TO→MOVE_PATH p99가 W 2,104 → 26.4 ms로 줄었다. 그래도 realistic의 연결당 write는 초당 35–75회(stock 21 =
  tick 20 + PONG)이고 MOVE_PATH 팬아웃이 인원의 거의 제곱으로 늘어(1000 CCU 약 12만/s — 2026-10-29에 MOVE_PATH를 요청자 본인만으로 바꿔 이 팬아웃은 없어졌다), 650 CCU 이상에서는 tick 밖 sys가 메인 스레드의
  한계다. stock·spread는 tick uncork의 소켓당 send(W 14–21·L 21–26 µs)가 새 임계점 tick 평균의 56–67%를 차지한다 — 송신을 다른
  프로세스로 나누는 4단계(게이트웨이 분리)의 근거 — 결과는 §3.4 끝·ADR 0002(spread 1.54배, 월드 IPC가 새 비용).

**연결 메모리 예산.** 전역 미송신 바이트 상한은 두지 않는다 — 세션별 상한의 합으로 산정한다.
```
최악 ≈ MAX_CONNECTIONS × (OUTBOUND_MAX_BYTES + inbox)
```
- 꼬리: 세션당 ≤ `OUTBOUND_MAX_BYTES`(초과하는 순간 종료·폐기 — 판정 직전 1회분 프레임 묶음만큼만 일시 초과).
- inbox(`RingByteBuffer`): 초기 4 KB, 소켓 읽기 1회분 + 미완성 프레임 1개를 담도록 2배씩 성장(축소 없음),
  하드캡 1 MB(`ringBuffer.ts` `DEFAULT_RING_MAX_CAPACITY` — 4단계 IPC 수신은 `maxCapacity` 옵션으로 상향). 정상 클라는 프레임 ≤ 4 KB(+헤더 6)라 4~8 KB에 머문다.
- outbox(`frameOutbox.ts`): 첫 프레임 때 4 KB, tick 송신량에 맞춰 2배씩 성장. tick 사이에는 32 KiB
  (`OUTBOX_RETAIN_MAX_BYTES`) 이하만 유지하고 그보다 커진 버퍼는 놓는다 — 단 32 KiB를 넘는 주기가 연속이면(밀집 구역에서
  tick마다 그만큼 받는 세션) 256 KiB(`OUTBOX_RETAIN_HARD_MAX_BYTES`)까지 유지한다(매 주기 4K→…→64K 재확장·복사 방지, 3단계
  리뷰). 작은 세션의 유지분 최악 2000 × 32 KiB = 62.5 MiB(밀집 1000명 벤치에서 세션당 16 KiB), 큰 버퍼는 실제로 tick마다
  그만큼 쓰는 세션만 든다. tick 중 일시 크기는 그 tick의 세션 송신량, 수신 디스패치 구간 중에는 `OUTBOUND_MAX_BYTES` 근처
  (위 조기 flush).
- 기본값(`MAX_CONNECTIONS` 2000 × `OUTBOUND_MAX_BYTES` 256 KiB): 꼬리만 최악 2000 × 256 KiB = **500 MiB**,
  정상 inbox(8 KiB)를 더하면 ≈ 516 MiB, inbox 하드캡까지 더한 이론 최악 2000 × 1.25 MiB ≈ **2.4 GiB**.
- 전원이 동시에 꼬리 상한에 닿는다는 건 서버 송신 대역이 무너졌다는 뜻이다 — 그 전에
  `mmorpg_net_tx_backlog_close_total`이 오른다. `MAX_CONNECTIONS`·`OUTBOUND_MAX_BYTES`를 올릴 때 이
  곱을 RAM 예산과 대조할 것(strike 링은 별도: drop 발생 세션당 `RATE_KICK_MAX_DROPS` × 8 B, 디코드 실패 발생 세션당
  `NET_DECODE_STRIKES` × 8 B, §10).

### 3.2 패킷 카탈로그

`shared/protocol.md`에 전체 사양. 본 절은 카테고리만:

| 영역 | C→S | S→C |
|------|-----|-----|
| 핸드셰이크 | HELLO, AUTH_REQ | HELLO_ACK, AUTH_RESULT |
| 월드 진입 | ENTER_WORLD_REQ | ENTER_WORLD_OK, ZONE_INFO |
| 시뮬레이션 (hot path) | INPUT_CMD | SNAPSHOT_DELTA, ENTITY_SPAWN, ENTITY_DESPAWN |
| 전투 | ATTACK_INTENT | COMBAT_EVENT (피격·회피·치명) |
| NPC (0x0450~) | NPC_INTERACT | NPC_DIALOG (조건 prune된 대화 서브트리 — B5④a 스키마화·B5④b binary: DialogNode·DialogOption·DialogAction) |
| 상점 (0x0453~0x0456) | SHOP_BUY, SHOP_SELL | SHOP_LIST, SHOP_ACK, INVENTORY_LIST, GOLD_UPDATE |
| UI 설정 (0x0470~0x0471) | UI_PREFERENCES_SET | UI_PREFERENCES |
| 퀘스트 (0x0452 + 0x0460~) | NPC_ACTION (수락/턴인), QUEST_ABANDON | QUEST_LIST, QUEST_PROGRESS, QUEST_ACTION_ACK, QUEST_NPC_MARKERS |
| 재화 (0x0304) | — | GOLD_UPDATE (소유자 전용 — 줍기·GM·상점·제작 경로, 퀘스트는 CHAR_STATS_FULL 편승) |
| 자유 포인트 (0x0305~0x0307) | STAT_ALLOCATE, STAT_RESET | STAT_POINTS_ACK, CHAR_STATS_FULL (소유자 전용) |
| 생활 (0x0480~0x0488) | GATHER_START, LIFE_CANCEL, GATHER_TRACE, GATHER_TAPS | LIFE_CHANNEL, LIFE_RESULT, LIFE_STATUS, NODE_CATALOG, GATHER_PUZZLE (소유자 전용 — 플래그 `LIFE_CONTENT`), 노드는 ENTITY_SPAWN type resource |
| 제작 (0x0490~0x0492) | CRAFT_REQ | RECIPE_LIST, CRAFT_ACK (소유자 전용 — 플래그 `LIFE_CONTENT`), 작업대 열기는 NPC_ACTION `open_craft` |
| 채팅 | CHAT_SAY | CHAT_BCAST |
| 시스템 | PING | PONG, ERROR, KICK |

핵심: **v1의 `SC_PLAYER_MOVE`는 사라진다.** 단일 엔티티 이동 브로드캐스트가 아니라 tick 경계의 `SNAPSHOT_DELTA`(자신의 AOI 내 변화만)로 통합된다.

### 3.3 코드젠

`shared/schema/packets.json`(스키마 형식 v2 — `structs`·`enums`, `max`/`min`/`of`/`ofMax`/`optional`, `bodyOf`·`frozen` — 모든 패킷 본문이 binary라
인코딩 선언이 없다: B6에 `defaultEncoding`·`encoding`·`freeform`을 폐지했고 gen이 거부한다)에서 한 번 정의 → `tools/codegen/gen.ts`가 생성:
- `server/src/net/codec.generated.ts` — 타입·가드·PayloadById·S2CPacketId/C2SPacketId·PACKET_DIRECTION·MAX_BODY_BYTES·WIRE_LIMITS·레이아웃 상수
- `server/src/net/wireCodec.generated.ts` — 바이너리 본문 코덱(런타임 `server/src/net/wire/runtime.ts`)
- `client/Noah/Assets/Scripts/Net/Codec.Generated.cs` — C# 타입(optional = null: 값 타입 `T?`, 참조 타입 null · bodyOf는 대상 class 상속)
- `client/Noah/Assets/Scripts/Net/WireCodec.Generated.cs` — C# 바이너리 본문 코덱(C0.3, 런타임 `Net/WireRuntime.cs`) — 패킷마다 양방향
- `shared/schema/packets.lock.json` — 패킷별 와이어 지문(항목 = id·direction·wireHash·layoutHash·frozen? — B6 형식, 지문 값은 B6 전과 같다). 와이어가 바뀌었는데 `protoVersion`이 그대로면 실패, frozen 패킷은 레이아웃 영구 고정
- `client/Noah/Assets/Tests/EditMode/Golden/wire.golden.json` — 교차 언어 골든(refCodec 산출, 실물 + 합성 스키마)과
  `client/Noah/Assets/Tests/EditMode/Generated/WireFixture.*.Generated.cs`(합성 스키마의 C# 타입·코덱 — 시험 어셈블리)

모듈: `schema.ts`(검증) · `layout.ts` · `refCodec.ts`(참조 인터프리터 — 생성 코덱의 독립 오라클) · `emitTsTypes.ts` · `emitTsCodec.ts` ·
`emitCsTypes.ts` · `emitCsCodec.ts` · `golden.ts`(+ `goldenCrafted.ts`·`goldenCraftedLife.ts`, 합성 스키마 `fixture.ts`) · `lock.ts`. 와이어 규칙 정본은
`shared/protocol.md` §2, 결정은 [ADR 0003](adr/0003-binary-body-codec.md). 클라 수신(`Net/PacketBus.cs`)은 `WireCodec.Decode`(실패 = 로그 + drop —
스키마 밖 id는 사유 None으로 "unknown packet", B6에 JSON 분기 제거). 두 언어의 코덱은 같은 골든으로
시험한다(TS `tests/server/codegen/wireGolden.test.ts`, C# EditMode `WireCodecGoldenTests`).
수신(`network/frameIngest.ts`)은 사전 판정 뒤 `decodeC2S`(C2S — 예외 없이 null + 사유, S2C·미지 id는 사전 판정이 이미 버렸다), 송신
(`packetWriter`·`frameOutbox`)은 `bodySize` + `writeBody`로 프레임 버퍼에 직접 쓴다(스키마 밖 id = `WireEncodeError`). 모든 패킷이 바이너리다 — **C2S 36개**(B2b 29개 —
protocol.md §2.7 + 자유 포인트 2개 — §2.12 + 생활 5개 — §2.15·§2.16·§2.17·§2.18)와 **S2C 50개**(SNAPSHOT_DELTA + B3b 고빈도 11개 — §2.8 + B4 나머지 고정형 17개 — §2.9 + B5②b 인벤·상점 3개 + B5③b 스킬·UI 설정 2개 + B5④b NPC 대화·퀘스트 4개 + B5①b 캐릭터·포탈 4개 — §2.10 + STAT_POINTS_ACK — §2.12 + 생활 7개 — §2.15·§2.16·§2.17). S2C string 상한은 실제 송신원의 최장에서
유도했고 송신 전 경계가 지킨다(몬스터·NPC 이름·데이터 정수 i32 = 로더 부팅 검증 `world/dataWireLimits.ts`(B4에 quests.json 보상 exp/sexp/slp·quest id 추가),
표시 이름 = 존 메타 저장소 자르기 `net/wireText.ts`, 존 이름 = `ZoneRegistry` 생성자 부팅 검증(B4), 데미지·치유량 = i32 자르기, tickIndex = mod 2^31
`net/wireInt.ts`(B4), SLP 총량 = i32 포화(B4), GM 킥 사유 = gmRoutes 검증, DB 원값(캐릭터 진행·골드·스탯·장비·인벤·학습 스킬 level) = 적재 경계
정규화 `identity/rowBounds.ts`(B5-P — §6.4), 상점 정의(id·itemId i32·이름 240 B·offers 256) = shops.json 로더 `world/shop/shopRegistry.ts`(B5②a — JSON
상태에서 먼저 강제, B5②b flip, protocol.md §2.10), 스킬 정의(이름 64 B·range·aoeRadius ≤ 1024·스킬 수 ≤ 256) = skills.json 로더
`world/skill/skillDataLoader.ts`(B5③a — JSON 상태에서 먼저 강제, B5③b flip), 대화(노드 ≤ 12·장 ≤ 4 × 600 B·선택지 ≤ 8·label 240 B·speaker 66 B·NPC def ≤ 1024)
= npcs.json 로더, 퀘스트(이름 120 B·설명 1500 B·보상 네 목록 ≤ 8·퀘스트 ≤ 1024·id 참조 i32)·아이템 이름(표시 이름 66 B — 목표 라벨 근거) = quests.json·
items.json 로더, 진행 퀘스트 ≤ 20 = `questListHelper.sendQuestList` 송신 가드(B5④a — JSON 상태에서 먼저 강제, B5④b flip, protocol.md §2.10), 캐릭터 이름
(CHAR_STATS_FULL·CharSummary 66 B) = 송신 전 자르기 `charStatsHelper`·`charListHandler`, 계정 캐릭터 목록(≤ 16) = 조회 LIMIT
`characterRepo.listByAccount`(상한 + 1행 — 넘으면 앞 16명 + warn, B5①b), CharSummary.charId(i32 — characters.id는 적재 경계 밖) = `charListHandler`가
i32 양수 밖 id의 행을 싣지 않고 warn(실으면 목록 전체 drop), 포탈(이름 64 B·id i32·rect [0, 4096]·존당 ≤ 32) = portals 로더
`world/portal/portalRepo.ts`·`portalRegistry.ts`(B5①a — JSON 상태에서 먼저 강제, B5①b flip), 채집 노드(이름 66 B·def ≤ 64·노드당 산출 행 ≤ 8·tier·minRank
u8) = gathering.json 로더 `world/life/gatheringDataLoader.ts`(생활 L-1 — 상한은 생성 상수, `wireLimitsContract`), 작업대 이름 64 B·작업대별 레시피 ≤ 128·입력 ≤ 6행·수치 범위 = crafting.json 로더 `world/life/craftingDataLoader.ts`(생활 L-2 — 같은 방식), 생활 숙련·작업력 i32 = 적재 경계
(`rowBounds.laborFromRow`·`lifeLinesFromRows`)와 i32 포화(`accruePoints`·`msToNextLabor`)).
**송신 단위 방어층**(B4, `network/encodeGuard.ts`): 그 보장이 깨져도 존 tick이 멈추지 않게 `PlayerSession.send`(즉시·코킹)·`SessionManager.sendMany`·스냅샷
SPAWN/DESPAWN 프레임 인코드(운영 `FrameSink.encode` = `encodeOrDrop`)가 `WireEncodeError`·`FrameBodyTooLargeError`(프레임 body u16 초과 — 원시 프레임 경로의
헤더 용량 검사. 생성 인코더 경로는 스키마 최악 본문 ≤ 65535라 닿지 않는다 — B6에 방어 겹으로 남겼다)를 그 패킷 하나만 버림으로 바꾼다(`mmorpg_net_encode_error_total{packet_id}` + 스쿼시 warn, 팬아웃은 1회 인코딩이라 1건). 그 밖의 예외는 다시 던지고, KICK 송신 =
종료 계약(`sendFrameAndClose`)은 그대로다. 미리 인코딩한 `sendFrame`·`sendShared`(DELTA 빠른 경로·공유 프레임)는 송신 시점 인코드가 없다.
드롭은 예외가 아니라 메트릭만 남기므로 시험(`tests/preload.ts` 전역 감시 — 시험 중 이 카운터가 늘면 실패)과 loadgen 레벨 게이트(`noErrors`)가 이 카운터를 본다.
디코드 결과는 종전 JSON 페이로드와 같은 모양이라 핸들러는 그대로이고(범위·의미 검증은 핸들러 몫),
수신 상한(`net/packetLimits.ts`)은 C2S마다 스키마 최악 본문이다(HELLO만 구 JSON HELLO를 KICK 1까지 들이는 64 바닥). 클라 송신
(`Network/PacketWriter.cs`)은 `BodySize`·`WriteBody`(페이로드는 생성 class만 — 스키마 밖 id·검사 위반 = `WireEncodeException`)이고, 입력 UI 한도는
코드젠 `WireLimits`(C#)·`WIRE_LIMITS`(TS)에서 유도한다(채팅 200자 = `ChatSayTextMax` 600 B / 3). loadgen 봇·perf 벤치·시험 헬퍼는 서버
`encodePacket`으로 같은 바이트를 낸다.
송신 표면은 타입화돼 있다(C0.2): `session.send`·`sessionManager.sendTo/sendMany`·`writePacket`·`SendTo`/`SendMany`/`FrameSink.encode`는
`<I extends S2CPacketId>(id: I, payload: PayloadOf<I>)` — C2S id·number id·필드 누락·타입 불일치가 컴파일 오류다. `PayloadOf`는 유니온 id(삼항)면
페이로드를 교차로 바꿔 모든 후보를 만족하게 하고 원시값을 막는다(`tests/server/net/typedSend.test.ts`가 strict tsc로 고정, loadgen 봇 송신은
C2SPacketId). 필드 없는 패킷(빈 interface)도 `& object`가 원시값을 막는다(종전 freeform 한계는 B6에 규칙과 함께 사라졌다 — 자율 형식이던 패킷은 B2b~B5①a에 모두 고정 스키마가 됐다). 방향 무관 저수준
`encodePacket`·`FrameOutbox.appendPayload`는 number id다.

`bun run gen.ts --check`이 CI 게이트(산출물 drift + lock). 결과는 커밋(빌드 의존 단순화). 수동 편집 금지 헤더 마커 포함.

### 3.4 서버 내부 IPC — 월드 ↔ 게이트웨이 (성능 4단계)

ROLE=world·gateway 사이의 프로토콜이다(§1.1). 클라 와이어와 무관하고 `shared/protocol.md` 대상이 아니다. 리틀엔디언, 버전 관리
(`IPC_VERSION` 20 — v2 HELLO token·HELLO_NACK, v3 ADMISSION, v4 CONN_MULTICAST·CONN_FLUSH, v5 CONN_DELIVER_SHARED, v6 클라 헤더 v2(완성 클라 프레임 하한 4)·CONN_CLOSED LegacyFraming, v7 클라 C2S 바이너리(이진 전환 B2b — IPC 레이아웃 불변, 게이트웨이 엣지의 수신 상한이 바뀜), v8 고빈도 S2C 바이너리(B3b — IPC 레이아웃 불변, 게이트웨이가 직접 쓰는 KICK이 바이너리), v9 나머지 고정형 S2C 바이너리(B4 — IPC 레이아웃 불변), v10 인벤·상점 S2C 바이너리(B5②b — IPC 레이아웃 불변), v11 스킬·UI 설정 S2C 바이너리(B5③b — IPC 레이아웃 불변), v12 NPC 대화·퀘스트 S2C 바이너리(B5④b — IPC 레이아웃 불변), v13 캐릭터·포탈 S2C 바이너리 + CHAR_LIST 형태 변경(B5①b — S2C 전부 바이너리, IPC 레이아웃 불변), v14 LISTEN_REPORT·LISTEN(공유 포트 리스너 양보 — 아래, 클라 protoVersion 그대로), v15 CHAR_STATS_FULL.derived 확장(클라 protoVersion 12, IPC 레이아웃 불변), v16 자유 포인트(클라 protoVersion 13, IPC 레이아웃 불변), v17 자유 포인트 요청 id(클라 protoVersion 14, IPC 레이아웃 불변), v18 INPUT_CMD.gait(클라 protoVersion 15, IPC 레이아웃 불변), v19 ENTITY_SPAWN.monsterDefId·SkillInfo allowedRaces·bookOnly·bowRange·SkillDefEffectKind passive·SKILL_EFFECT variant·hitIndex(클라 protoVersion 16, IPC 레이아웃 불변), v20 생활 L-1 채집 패킷·`EntityType.resource`·L-2 제작 패킷(클라 protoVersion 17, IPC 레이아웃 불변). 클라 protoVersion이 바뀌면 IPC_VERSION도 올린다 — 게이트웨이가 클라 와이어의 엣지 정책을 집행하므로 protoVersion이 다른 빌드가 섞이지 않게). 레이아웃·사유 enum의 단일 정의는 `server/src/cluster/ipcSchema.ts`다. 결정 배경은 ADR 0002.

**봉투**: `u32 len | u8 type | payload`(len = type 1바이트 + payload). 봉투 전체 상한 64 MiB(= 수신 링 상한 — 넘는 헤더를 받으면 피어를
끊는다), 핸드셰이크 전 상한 1 KiB(모든 버전 고정). 배치 봉투는 레코드를 1개 이상 담고 1 MiB마다 새로 연다.

| 방향 | type | 메시지 | payload |
|---|---|---|---|
| G→W | 0x01 | HELLO | `{u16 ipcVer, u16 gatewayId, u32 incarnation, u32 pid, u8 tokenLen, token}` — 연결의 첫 메시지, token = `IPC_TOKEN` |
| G→W | 0x02 | PING | `{u32 seq}` |
| G→W | 0x03 | BYE | `{u8 reason}` — 0 shutdown · 1 restart |
| G→W | 0x04 | LISTEN_REPORT | `{u8 flags, u16 port, u32 ackSeq}` — 클라 리슨 상태 스냅샷(v14). flags bit0 shared(reusePort 공유 포트 + 양보 켬) · bit1 closed(새 클라를 거절 중 — 로컬 부하 접속 제한(월드 ADMISSION busy 포함) ∨ 연결 상한 닿음(재개는 상한의 5%·최소 1 아래 — 히스테리시스)) · bit2 listening, 나머지 비트 = 프로토콜 오류. port = 클라 리슨 포트(그룹 키 — 같은 호스트 전제), ackSeq = 마지막으로 적용한 LISTEN seq(0 = 이 세션에서 없음). 리슨 직후·접속 제한 전이·연결 상한 닿음/해제·리스너 중지/재개·LISTEN 적용(무동작이어도 ack)마다 긴급 송신 |
| G→W | 0x10 | CONN_OPEN | `{u32 localId, u8 addrLen, addr}` — 실제 클라 IP(월드의 IP별 상한·인증 스로틀) |
| G→W | 0x11 | CONN_FRAMES | 반복 `{u32 localId, u16 packetId, u32 bodyLen, body}` — 이벤트 루프 턴마다 배치 |
| G→W | 0x12 | CONN_CLOSED | `{u32 localId, u8 reason}` — 0 peer · 1 idle · 2 rate · 3 size · 4 backlog · 5 error · 6 gw_shutdown · 7 world_requested · 8 cap · 9 legacy_framing(구 v1 클라, B1) |
| W→G | 0x81 | HELLO_ACK | `{u16 ipcVer, u32 worldIncarnation, u32 connCap}` — connCap = 월드 `MAX_CONNECTIONS` |
| W→G | 0x84 | HELLO_NACK | `{u16 ipcVer, u8 reason}` — 0 fenced · 1 closed · 2 version · 3 auth. type·레이아웃은 모든 버전(v2~) 고정 |
| W→G | 0x85 | ADMISSION | `{u8 state}` — 0 open · 1 busy. 이 피어의 신규 접속 판정(소프트 임계 전이마다, v3). 긴급 송신(아래 파이프) |
| W→G | 0x86 | LISTEN | `{u8 mode, u32 seq}` — 0 listen · 1 yield(그 밖 = 프로토콜 오류), seq는 이 월드 세션의 피어마다 1부터 단조(0 = 프로토콜 오류). 공유 포트 리스너 양보 지시(v14, 아래). 긴급 송신 |
| W→G | 0x82 | PONG | `{u32 seq}` |
| W→G | 0x83 | SHUTDOWN | `{u8 kickReason}` |
| W→G | 0x90 | CONN_DELIVER | 반복 `{u32 localId, u32 len, bytes}` — 완성 클라 프레임(1개 이상 연접) |
| W→G | 0x91 | CONN_STATE | `{u32 localId, u8 state}` |
| W→G | 0x92 | CONN_CLOSE | `{u32 localId}` — 앞서 보낸 바이트 뒤에 종료 |
| W→G | 0x93 | CONN_ACCEPTED | `{u32 localId, u32 worldConnId}` |
| W→G | 0x94 | CONN_MULTICAST | 반복 `{u32 len, bytes, u16 n, u32[n] localIds}` — 같은 완성 클라 프레임을 n개 연결에(v4, n ≥ 1·len ≥ 1, 중복 id = 중복 송신). 아래 MULTICAST |
| W→G | 0x95 | CONN_FLUSH | `{}` — flush 창의 끝(v4). 그 창에 MULTICAST가 있었을 때만 창 마지막 메시지로 온다 |
| W→G | 0x96 | CONN_DELIVER_SHARED | 반복 레코드 `u8 tag` + 본문 — DEF(1) `{u32 len, u16 patchOff, bytes}`(봉투 안 ref = DEF 순번)·CONN(2) `{u32 localId, u32 len, bytes}`(= DELIVER 레코드)·CONN_REF(3) `{u32 localId, u32 ref, u32 value, u32 len, bytes}`(bytes 뒤에 DEF[ref]를 patchOff에 value로 패치해 이은 것을 1건으로, v5). 아래 공유 프레임 |
| 예약 | 0xA0–0xC1 | 멀티 월드 | 미구현 — 받으면 프로토콜 오류(ADR 0002 §7) |

**코덱**(`ipcCodec.ts`): 피어마다 BatchWriter 하나. 같은 종류의 배치 레코드는 열린 봉투에 이어 붙이고 봉투를 닫을 때 길이를
패칭한다. **배치가 아닌 메시지는 열린 봉투를 닫는다**(배치 type이 바뀌어도 닫는다 — DELIVER와 MULTICAST가 번갈아 오면 봉투가 번갈아
바뀐다) — 그래서 연결별 STATE/DELIVER/MULTICAST/CLOSE 순서 = 발행 순서다. CONN_DELIVER_SHARED의 DEF 표는 봉투 범위다(봉투가 바뀌면
참조가 DEF를 다시 쓴다). 디코더는 `ipcDecoder.ts`(4.5 F2에서 분리, `ipcCodec`이 재수출). 인자 검증을 기록 전에
끝내 거절된 호출은 상태를 바꾸지 않는다. 큰 flush는 쓰기 버퍼 소유권을 넘기고 release 때 풀로 회수한다(꼬리 복사 없음). 디코더는
완성 봉투를 복사 없이 제자리에서 읽고, 청크를 가로지르는 봉투만 수신 링에 복사한다. 핸드셰이크가 먼저여야 하고 버전이 같아야
하며, 레이아웃 위반은 `IpcProtocolError`다(관용 없음).

**파이프**(`ipcPipe.ts`): `IpcPipe` — 부분 쓰기 꼬리는 복사 없이 대기열에 두고 transport drain마다 이어 쓴다(대기 중 새 쓰기는 뒤로 —
봉투 경계 보존). **긴급 쓰기**(`writeUrgent`, 성능 4.5): 대기열이 있으면 전송 중인 머리 항목(과 앞선 긴급 항목들) 바로 뒤에
끼운다 — 항목 1개 = flush 1회 = 봉투 경계라 봉투가 섞이지 않고, 긴급끼리는 FIFO다. 연결별 순서가 없는 피어 단위 메시지(ADMISSION·LISTEN, 게이트웨이 쪽 LISTEN_REPORT)와 월드가
아무것도 쓴 적 없는 새 localId의 거절 쌍(DELIVER(KICK 9) + CONN_CLOSE)만 쓴다 — 대기열 뒤로 보내면 알리려는 그 적체가 다 빠진 뒤에야
도착한다. 미전송이 `IPC_MAX_PENDING_MB`(기본 256)를 넘으면 OOM 대신 backpressure로 닫는다. heartbeat PING/PONG
(`IPC_HEARTBEAT_MS`), `IPC_DEAD_MS` 동안 무소식이면 dead. `SocketPipe`는 tcp loopback(기본, 양 OS) | unix(Linux·macOS, 파일 0600),
`MemoryPipe`는 장애 주입 쌍(지연·임의 청크 분할·drop-after)이다. Windows named pipe(`pipe:`)는 write가 항상 전량 수락돼 백프레셔가 보이지
않으므로 받지 않는다.

**핸드셰이크·펜싱**(`worldIpcServer.ts`): 첫 메시지 HELLO. ipcVer가 다르면 디코더 단계에서 HELLO_NACK(version)이다. 그다음 월드는
token을 본다 — 자기 `IPC_TOKEN`(미설정 = 빈 값)과 다르면 피어 표·펜싱 기록을 건드리기 전에 HELLO_NACK(auth)으로 거절한다. 이어
closed(종료 중)·fenced 순으로 판정하고, 통과하면 HELLO_ACK이다. 거절은 HELLO_NACK 뒤 우아한 종료다. 같은 `GATEWAY_ID`의 중복 HELLO는 옛 피어를 먼저 정리한다(`replaced`). 다른
incarnation이 등록되면 직전 값을 은퇴시키고(무작위 u32 — 순서 없이 동일성만 비교, 게이트웨이마다 최근 16개), 은퇴한 값으로 다시 오는
HELLO는 fenced다. 게이트웨이는 사유별로 반응한다: closed = 일반 백오프 재시도, fenced = 종료하지 않고 상한 백오프로 대기(복구는 중복
프로세스 중지 → 펜싱된 프로세스 재기동, ops-cluster §4), version·auth = 치명(종료 → 슈퍼바이저 재기동). 인증 전 연결 제한: 봉투 1 KiB,
HELLO 데드라인 5초, 동시 미완료 64개(넘으면 즉시 끊기 — 연결당 링 초기 64 KiB라 최악 4 MiB). `close()` 뒤 받아들인 파이프는 타이머·
버퍼 없이 즉시 끊는다. 인증은 단방향이다(월드는 게이트웨이에 자신을 증명하지 않는다 — §10, ops-cluster §7).

**연결 수명주기(월드)**: CONN_OPEN → `acceptSession`(실제 클라 IP로 전역 상한·미인증 몫·IP별 상한·과부하 접속 제한 — monolith와 같은
`sessionLifecycle`) → 거절은 DELIVER(KICK 9) + CONN_CLOSE, 수용은 CONN_ACCEPTED. localId 재사용·역행은 프로토콜 위반이다(게이트웨이는
incarnation 안에서 재사용하지 않는다). CONN_FRAMES 배치 1개 = `deferSends` 구간 1개 안의 `ingestFrame`(rate·size는 게이트웨이, 상태
머신은 월드 라우터 — 미추적 localId 레코드·킥된 세션 프레임은 무시, `mmorpg_ipc_stale_records_total`). CONN_CLOSED → `closeSession`.
피어 유실(peer·bye·dead·backpressure·error·replaced·protocol·closed) → `closeSessions`(그 피어 세션 전부, 배치 저장 1회).

**송신(월드)**: `RemoteClientLink`는 `ClientLink`의 원격 구현이다. send → 피어 배치에 DELIVER 레코드(피어 유실이면 false — 세션 종료
고정), end → 세션 outbox flush 뒤 CONN_CLOSE(세션은 게이트웨이의 CONN_CLOSED까지 추적), setState → 세션 outbox flush 뒤 CONN_STATE.
핸들러는 상태 전이를 응답보다 먼저 하므로(HELLO·AUTH의 `setSessionState` ≺ 응답, enterWorld) **STATE ≺ 응답**이고, 게이트웨이는 클라가
INPUT_CMD를 보내기 전에 IN_WORLD rate 한도로 바뀐다(테스트 고정). `gatewayPeer.ts`는 1 MiB 이상 쌓이면 즉시 flush한다(창 중간 flush —
CONN_FLUSH는 쓰지 않고 창 끝 flush를 다시 예약한다).

**flush 시점**: tick 끝(`serverTick`의 `ipcFlush` 훅 — withCork uncork 직후, 단계 `ipcFlush`, §4.1)과 이벤트 루프 턴 끝(`deferredSends`
턴 끝 훅 — 대기 세션 flush 뒤 같은 `setImmediate`, §3.1). 그래서 한 tick·한 턴의 응답은 게이트웨이당 DELIVER 봉투 1개다. ROLE=world의
`flush` 단계는 소켓 write가 아니라 피어 배치에 프레임을 쓰는 IPC 프레이밍이다. monolith는 훅을 등록하지 않아 동작·바이트가 그대로다.

**게이트웨이 쪽 처리**(`gatewayCore.ts`·전달은 `gatewayDeliver.ts`): DELIVER → 로컬 `OutboundLink`(꼬리 상한 초과 = CONN_CLOSED 4 backlog), STATE → 미러,
CLOSE → 앞선 바이트 뒤 종료 + CONN_CLOSED 7, SHUTDOWN → 리스너 중지 + 전원 KICK + CONN_CLOSED 6, MULTICAST·CONN_FLUSH → 아래. 미추적
localId 레코드는 무시한다(`mmorpg_gw_stale_records_total` — MULTICAST는 수신자마다 `type="multicast"`).

**MULTICAST**(성능 4.5 F2 — 발행 시점 팬아웃 `sessionManager.sendMany`: DAMAGE_EVENT·SKILL_EFFECT·ENTITY_META·CHAT_BCAST — MOVE_PATH도 쓰다가 2026-10-29에 요청자 본인만으로 바뀌어 빠졌다).
종전에는 수신자마다 프레임을 세션 outbox에 복사하고 flush 때 DELIVER 레코드로 다시 복사했다. 이제 게이트웨이 피어별로 수신자를 모아 레코드
1개(프레임 1회 + 수신자당 4바이트)로 보낸다. 클라 바이트·연결별 순서·`mmorpg_net_packets_tx_total`은 같다(특성화 골든 — 게이트웨이 경유
켬·끔, 등가 퍼징 `tests/server/cluster/multicastEquivalence.test.ts`).
- 월드 순서 규칙(`castFanout.ts`, `PlayerSession.castRoute`): **outbox가 빈 수신자만** 싣는다 — 그 연결의 앞선 프레임은 이미 피어 배치에
  있고, 뒤 프레임은 outbox → 뒤 DELIVER로 가므로 레코드 위치가 곧 연결별 위치다. outbox에 프레임이 있거나 종료 중인 수신자는 종전처럼
  outbox에 복사한다(앞당겨 비우면 DELIVER 레코드가 늘어 손해다). 피어별 수신자 2명 이상이고 바이트가 줄 때만(`(r − 1)·F > 6 + 4r`)
  레코드로, 나머지·거절(피어 유실·봉투 상한)은 연결별 경로다. 65,535명 초과는 레코드를 나눈다. 이 판정(과 `_saved_bytes_total`)은 절감의
  **하한**이다 — 연결별 경로가 새 CONN_DELIVER 머리(8 B)를 쓸 수도 있지만 같은 창의 다른 프레임과 머리를 공유할 수 있어 F만 센다(보수 판정).
  프레임(과 공유 프레임 DEF)은 완성 클라 프레임이다 — 클라 헤더(4바이트, `IPC_CLIENT_FRAME_MIN_BYTES`) 미만은 디코더가 프로토콜 오류로 거절한다(4.5 리뷰).
- 창 끝 표식: MULTICAST를 쓴 flush 창은 창 끝 flush(위 두 시점·종료)가 CONN_FLUSH로 닫는다.
- 게이트웨이(`GatewayConn`): 레코드당 프레임을 1회 복사해 수신 연결마다 **미뤄 두고**, 그 연결의 다음 DELIVER와 합쳐 write 1회로 보낸다.
  DELIVER가 없으면 CONN_FLUSH에서, 종료(CONN_CLOSE·SHUTDOWN·월드 유실)·엣지 KICK이면 그 앞에서 쓴다. 미룬 바이트는 청크 경계를 넘어 유지되므로
  한 창이 여러 수신 콜백에 걸쳐도(대량 flush는 수십 청크) 연결당 창마다 write 1회다 — 게이트웨이 비용 지표(write 수)를 늘리지 않는다.
- 스냅샷 SPAWN/DESPAWN·SNAPSHOT_DELTA(`sendFrame`)는 대상이 아니다 — 수신자가 viewer를 다 돈 뒤에야 정해지고 viewer마다 SPAWN 순서가
  달라, 레코드 1개의 스트림 위치가 모든 수신자에게 맞지 않는다(4.5 설계 §4.1). DELTA는 아래 공유 프레임(연결별 레코드 안의 참조)이 맡는다.
- `IPC_MULTICAST=0`(월드)이면 끈다 — 연결별 DELIVER만(A/B·킬 스위치). 운영 `sessionManager`의 묶음 경로는 ROLE=world 배선(`worldMain` —
  월드 IPC 서버 옆에서 `IPC_MULTICAST=1`일 때 `enableMulticast()`)만 켠다(monolith는 종전 루프 그대로, 서버 생성자는 싱글턴을 건드리지 않는다).

**공유 프레임**(성능 4.5 F3 — 같은 셀에 머문 viewer들의 SNAPSHOT_DELTA는 ackSeq만 다르다: 4.4 측정 시나리오에서 IPC의 65–96%). 연결마다
레코드 1개라는 DELIVER 규칙은 그대로 두고, 그 레코드가 공유 프레임을 **참조**한다 — 순서 규칙이 종전 연결별 규칙과 같다(push 레코드의
스트림 위치 문제가 없다, 4.5 설계 §4.2).
- 생산(`sim/deltaGroups.ts`, §5.2): 묶음 프레임을 `sessionManager.sendShared`로 수신자마다 보낸다. 세션(`PlayerSession.writeShared`)은 링크에
  공유 경로(`ClientLink.sharedRoute` — 원격 링크·IPC_SHARED=1)가 있으면 outbox **끝 참조**로만 두고 피어별 보관자를 센다(`SharedFrame.hold`).
  뒤에 다른 프레임이 붙으면 그 자리에서 복사·패치해 굳힌다. 로컬 링크·코킹 밖은 복사·패치(종전 바이트).
- 월드 쪽 기록(`GatewayPeer.deliverShared` → `WorldIpcWriter.deliverShared`): uncork가 인라인(참조 앞 프레임들) + 참조를 CONN_REF로 쓴다.
  프레임이 열린 0x96 봉투에 처음이면 DEF를 같은 봉투 앞에 쓴다(봉투가 바뀌면 다시 — flush·비배치 메시지·분할 임계·다른 배치 type). 0x96 봉투가
  열린 동안의 평문 송신은 CONN 레코드로 붙인다(봉투 전환 최소). 이 피어로 갈 참조가 자기 하나뿐이고 봉투에 DEF도 없으면 평문 복사로 쓴다
  (DEF + CONN_REF가 평문보다 16바이트 크다 — 집계 `SharedFrame.take`는 힌트일 뿐 바이트 정확성과 무관).
- 게이트웨이(`gatewayCore.onDeliverShared` → `GatewayConn.deliverShared`): CONN은 DELIVER, CONN_REF는 DEF 뷰를 그 연결의 u32로 **제자리
  패치**해 쓴다 — 인라인·미룬 MULTICAST가 없으면 그 뷰를 그대로(복사 0), 있으면 재사용 scratch에 합쳐 write 1회. 레코드를 하나씩 끝까지 쓰고
  다음 패치이며 `OutboundLink`는 못 보낸 꼬리를 복사하므로 연결끼리 섞이지 않는다. 디코더는 모르는 tag·앞선 DEF 없는 ref·patchOff + 4 > len·
  빈 DEF·연결 레코드 없는 봉투를 거부한다(`IpcProtocolError`).
- 클라 바이트·연결별 순서·`mmorpg_net_packets_tx_total`은 같다(특성화 골든 — 게이트웨이 경유 켬·끔, 등가 퍼징
  `tests/server/cluster/sharedEquivalence.test.ts`). `IPC_SHARED=0`(월드)이면 끈다 — 세션이 복사·패치해 연결별 DELIVER(A/B·킬 스위치).
  DELTA 묶음 자체(writeEntries 생략)는 이 값과 무관하게 켜져 있다.

**부하 기반 접속 제한**(성능 4.5 F1 — 4.4 결함: 포화한 게이트웨이는 월드 tick skip과 무관해 새 클라를 계속 받다가 IPC 대기 상한에서
통째로 끊겨 소속 클라 전원이 KICK 6을 받았다). 거절은 **신규 접속만**(KICK 9 "server busy", 클라 와이어 불변), 기존 연결은 건드리지 않는다.
하드 상한 drop은 최후 안전판으로 그대로다.
- 월드(`gatewayPeer.evaluateAdmission` — `flushAll`, 즉 tick 끝·턴 끝마다 모든 피어): 피어 파이프 미전송 ≥ `IPC_ADMISSION_SOFT_PCT`(25%)
  × `IPC_MAX_PENDING_MB`이면 busy, ≤ `IPC_ADMISSION_CLEAR_PCT`(6%)가 `IPC_ADMISSION_HOLD_MS`(2000) 동안이면 clear. 전이마다 ADMISSION을 긴급
  송신한다. busy 피어의 CONN_OPEN은 세션을 만들지 않고(회계·connId 무접촉) DELIVER(KICK 9) + CONN_CLOSE를 긴급 송신하며, 그 localId는
  CONN_CLOSED까지 거절 목록에 둔다(뒤늦은 프레임·CONN_CLOSED는 stale로 세지 않음). 순서: draining(KICK 6) → 피어 busy → `acceptSession`
  (과부하 → 상한).
- **점진 감축**(4.5 후속 — macOS M4 실측: 게이트웨이 2개·spread 4000에서 램프가 끝나 게이트웨이당 2000명이 된 뒤 월드 → 게이트웨이 대기가
  3–6초 만에 0 → 170 MB(게이트웨이 IPC 수신 ≈105 MB/s에서 막힘, CPU ≈45%) → 하드 상한에서 전원 KICK 6. 소프트 임계는 신규 접속만 막아 이미
  붙은 부하를 줄이지 못한다). 월드(`WorldIpcServer.evaluateShed` — 턴 끝 `flushAll`은 즉시, tick 끝 `ipcFlush`는 `setImmediate`로 tick
  밖에 미룬다: 감축 세션의 동기 배치 저장·despawn이 tick을 늘려 월드 전역 과부하 신호로 번지지 않게). 판정(`gatewayPeer.shedDue`)은
  **에피소드** 단위다 — 피어 미전송 ≥ `IPC_SHED_PCT`(40%) × `IPC_MAX_PENDING_MB`이면 에피소드가 열리고 첫 감축은 무조건, 이후로는
  `IPC_SHED_COOLDOWN_MS`(500, 최소 50)가 지났고 미전송이 **직전 감축 뒤 관측한 최저보다 높을 때만**(다시 늘고 있다 — 줄고 있으면 직전
  감축이 듣는 중). 미전송이 임계 밑으로 내려가면 에피소드가 닫혀 기준점이 리셋된다(직전 고점에 묶이는 래칫이 없다). 대상은 그 피어의
  **인월드 세션 중 무작위**(`IN_WORLD`·종료 중 아님 — 로그인 중 연결은 스냅샷을 만들지 않는다) ceil(n × `IPC_SHED_FRACTION_PCT`(10%))명,
  최소 1·1회 상한 `IPC_SHED_MAX_PER_STEP`(100 — 한 번의 동기 배치 저장). 연결 나이로 고르지 않는 것은 먼저 자리 잡은 부하 유발자를 영영
  고르지 않고 늦게 온 쪽만 반복해 쫓아내기 때문이다(리뷰 — 대가: 오래 플레이한 사람도 같은 확률로 끊긴다, ADR 0002 표). 고른 세션은
  KICK 9 "server busy" + CONN_CLOSE를 긴급 송신(대기 봉투 앞지름)하고 월드 세션을 즉시 배치 정리한다(저장·despawn·회계 — 게이트웨이 왕복을
  기다리면 그동안 스냅샷을 계속 만들어 대기가 더 쌓인다). 링크는 먼저 종료 상태(`dispose`)라 이후 송신이 없고, 그 localId로 이미 쌓인 봉투
  기록은 게이트웨이가 닫은 뒤 stale로 버린다(감축 직후 `mmorpg_gw_stale_records_total{type="deliver"}`가 튀는 것은 정상). 후보가 0명이면
  쿨다운을 쓰지 않고, 종료 드레인 중엔 감축하지 않는다(그 사이 끊기는 연결의 사유는 6). 정리가 던지면 그 피어를 `error`로 끊는다(회계가
  어긋난 피어). 월드에서 감축을 켜면 소프트 임계도 켜져 있어야 하고 감축 > 소프트여야 한다(부팅 가드 — 소프트만 끄면 포화한 게이트웨이가
  새 클라를 계속 받고 곧 감축으로 끊는 churn). 메트릭 `mmorpg_ipc_shed_sessions_total`·`mmorpg_ipc_shed_events_total`(합계 — 게이트웨이 id·
  connId 앞 32개는 warn 로그). 검증(macOS, 최신 연결 우선이던 첫 구현): 같은 시나리오가 감축 2회(200 → 180명)로 대기 최고 ≈114 MB에서 0으로
  내려가고 게이트웨이 끊김 0 — KICK 2000(전원 6) → 380(9). 시험: `tests/server/cluster/worldIpcShed.test.ts`·`shedTopology.test.ts`, 카오스 C7.
- 게이트웨이(`gatewayLoad` — 250 ms 표본·1 s 창): 월드 판정(ADMISSION busy)과 로컬 신호 — 프로세스 CPU(`GW_ADMISSION_CPU_PCT` 90%, 해제
  −15pt)·이벤트 루프 지연(`GW_ADMISSION_LAG_MS` 250, 표본 타이머가 지금 늦었으면 그것도 — 정지 직후 accept가 타이머보다 먼저 돌아도
  거절)·IPC 왕복(`GW_ADMISSION_RTT_MS` 1000, 답 없는 가장 오래된 PING의 나이 ∨ 최근 왕복)·클라 송신 꼬리 합(`GW_ADMISSION_OUTBOUND_MB`
  64 — 인월드 연결 중 꼬리를 가진 연결이 `GW_ADMISSION_OUTBOUND_RATIO`(0.5) 이상일 때만 센다: 꼬리는 클라가 읽지 않기만 해도 자라므로
  소수 연결이 신규 접속을 잠그지 못하게, 4.5 리뷰. NIC 포화는 연결 전반의 꼬리다. 분모가 인월드(`GatewayConn.state` — CONN_STATE 미러)라
  접속 램프의 로그인 중 연결이 비율을 희석하지 않는다, 4.5 검증). 하나라도 진입 문턱이면 즉시 거절 시작, 전부 해제 문턱(나머지는 절반) 이하 + 월드 open이 `GW_ADMISSION_HOLD_MS`(3000) 동안이면
  해제. 거절은 `admit`에서 CONN_OPEN 전(월드가 모르는 연결 — 상한·world_down 거절과 같은 경로). 월드 유실 시 월드 판정은 open으로
  초기화한다. `GW_ADMISSION=0`이면 끈다(월드 판정도 무시 — 월드가 CONN_OPEN에서 거절한다).
- in-process 토폴로지·테스트 배선은 두 쪽 다 끈다(옵션 미지정 = 종전 동작). 운영 env 기본은 켬.
- 실측(4.5 재측정, 게이트웨이 1개 spread): 1500·2000은 게이트웨이 CPU 신호가 램프 끝·전원 접속 뒤에 한 번 닫혀 거절 0, 2500은 월드
  tick 과부하(`acceptSession`)가 172명, 3000은 게이트웨이 CPU 신호(`cause="cpu"`)가 885건을 KICK 9로 돌려보냈다. 월드 소프트 임계 거절·
  IPC 피어 유실·KICK 6은 모든 런에서 0이다 — IPC 바이트가 줄어 월드 쪽 적체가 생기지 않았다(2000의 hold 끝 미전송 0.96 MB).

**공유 포트 리스너 양보**(IPC v14, 2026-10-15 — 자동 재접속 선결, ADR 0002 §5.1). 공유 포트(reusePort)에서 커널 해시는 부하를 모른다 — 접속
제한이 닫힌 게이트웨이도 새 연결의 1/N을 받아 KICK 9 "server busy"로 돌려보낸다(7B 폭주 측정: N=2 spread 1500에서 gw1 SIGKILL → 재접속
759명. gw2가 자기 ≈740명 + 피해자 절반 ≈1094 연결에서 CPU 92.6%로 닫힌 채 머물러 재시도의 ≈50%를 거절하는 동안 gw1은 ≈380 연결로 한가 —
13명이 90초 창 안에 포기). 닫힌 게이트웨이가 같은 포트에 받을 수 있는 게이트웨이가 있는 동안만 리스너를 잠시 내려 새 연결을 그쪽으로 보낸다.
- 게이트웨이(`gatewayListen.ts`): 리슨 상태를 LISTEN_REPORT로 긴급 송신한다(리슨 직후 — 이 세션의 첫 보고, 접속 제한 전이, 연결 상한
  닿음/해제, 리스너 중지·재개, LISTEN 적용마다 — 무동작이어도 ack). **closed** = 새 클라를 거절 중 — 부하 접속 제한(`GatewayAdmission.active`,
  월드 ADMISSION busy 포함) ∨ 연결 상한 닿음(`min(GATEWAY_MAX_CONNECTIONS, 월드 connCap)` 도달에서 켜지고 상한 − max(1, ⌈상한 × 5%⌉) 이하에서
  꺼진다 — 연결 하나가 들고 날 때마다 흔들리지 않게. 실제 KICK 9 "connection cap"은 종전대로 상한 이상일 때만. 상한 거절도 KICK 9라 여유 있는
  게이트웨이가 있으면 넘기는 편이 낫다 — ops 권고대로 상한을 조이면 이것이 먼저 닿는다). LISTEN yield는 **자격**(배선: `REUSE_PORT=1`·
  `GW_ADMISSION=1`·`GW_LISTEN_YIELD=1`(기본))이 있고 **지금도 새 클라를 거절 중일 때만** 리스너를 내린다(`listener.stop(false)` — 이미 받은
  연결은 read·write 그대로). 근거가 그사이 풀렸으면 ack만 한다(경합의 무의미한 중지·재개 왕복 제거 — 월드는 다음 보고로 listen을 다시 보낸다). listen은 같은 포트·옵션으로 재바인드,
  실패하면 warn + listening 0 보고 후 백오프(250 ms → 2배, 상한 2 s) 재시도. 자격이 없으면 mode를 무시하고 ack만(게이트웨이별 포트·monolith는
  종전 그대로). 월드 유실은 종전처럼 리스너를 닫고(전원 KICK 6) 양보 상태·ack를 비운다 — 다음 세션은 `listen()`부터(리스닝, ack 0, 이전 세션의
  지시는 무의미). SHUTDOWN·자기 종료(BYE 앞)는 리스너를 내린 뒤 listening 0을 보고한다.
- 월드(`listenPlan.ts` 순수 계획 + `worldListen.ts` 송신): 피어마다 마지막 보고와 마지막으로 보낸 지시(mode·seq — 처음은 listen·0)를 둔다.
  **실효 닫힘** = 보고 closed ∨ 월드 쪽 피어 소프트 임계 busy. **열린 리스너** = 보고 있음 ∧ 실효 닫힘 아님 ∧ listening ∧ ackSeq = 마지막
  보낸 seq ∧ 마지막 지시 listen ∧ BYE 전. 그룹 = (shared ∧ port) — 같은 호스트 전제(reusePort 그룹은 커널마다 하나, IPC가 로컬이라 지금은
  성립 — 멀티 호스트를 들이면 그룹 키에 호스트를 넣어야 한다, ADR 0002 §7). **yield** = shared ∧ 실효 닫힘 ∧ 같은 그룹에 자기 말고 열린 리스너가 있다,
  나머지는 전부 listen(보고 없음·공유 아님·열림·다른 열린 리스너 없음 = 전원 바쁨이면 종전 KICK 9 경로 — ECONNREFUSED로 바꾸지 않는다·종료
  드레인 중). 바뀐 지시만 seq를 올려 긴급 송신한다(`mmorpg_ipc_listen_directives_total{mode}`). 재계획 계기: LISTEN_REPORT, 피어 등록·정리
  (유실·교체·dead — 잃은 피어가 열린 리스너였으면 같은 호출에서 양보 중이던 피어에 listen), BYE, 소프트 임계 전이, `stopAdmitting`(전원 listen).
  재계획은 던지지 않는다(`replanListen` — 피어 정리의 세션 배치 종료 앞에서도 부른다): 지시 송신이 던진 피어는 계획이 끝난 뒤 끊고(flushPeer와
  같은 정책 — 그 정리가 다시 짠다), 다른 피어의 지시는 그대로 나간다. 지시는 접속 제한 전이를 1:1로 따라가므로 왕복 주기의 하한은
  게이트웨이 접속 제한 hold(`GW_ADMISSION_HOLD_MS`, 기본 3초)·월드 소프트 임계 hold(`IPC_ADMISSION_HOLD_MS`)·연결 상한 히스테리시스다(월드
  쪽 최소 체류는 두지 않았다 — 해제가 늦으면 리스너가 적은 채 머문다. 재측정의 `mmorpg_gw_listen_transitions_total` 증가율로 판단).
  ack 조건이 경합을 닫는다 — A에 yield를 보낸 직후 A의 접속 제한이 풀려 A가 그 yield를 적용하기 **전에** "열림·리스닝"을 보고해도 옛 ack라
  열린 리스너가 아니다(세면 B까지 yield하고 곧 A도 내려가 리스너 0). 지연 전달 모델(`tests/server/cluster/listenPlan.test.ts`)이 ack 조건이
  있으면 리스너 0이 생기지 않고, 빼면 생긴다는 것을 고정한다.
- **불변식**: 월드는 같은 그룹의 다른 피어가 열린 리스너일 때만 yield를 지시하고(열린 리스너는 닫혀 있지 않아 같은 계획에서 yield를 받지
  않는다), 게이트웨이는 현재 월드의 yield 지시 말고는 스스로 리스너를 내리지 않는다(SHUTDOWN·월드 유실·자기 종료는 별개). **남는 리스너 0
  창**: ① 열린 리스너의 프로세스가 사라졌을 때 월드가 피어 유실을 알아채고 listen이 닿아 재바인드할 때까지(SIGKILL은 소켓 종료로 즉시,
  정지(SIGSTOP·기아)는 `IPC_DEAD_MS` — 정지한 게이트웨이의 리스너 소켓은 커널에 남아 새 연결이 그 accept 대기열에 멈춘다. 양보가 없어도
  1/N은 그렇게 멈춘다) ② 열린 리스너가 스스로 내릴 때(우아한 종료·SHUTDOWN) 그 보고가 월드에 닿을 때까지(IPC 1홉). 그리고 리스너를 내리는
  순간 그 accept 대기열에 있던 연결은 Linux 기본(`net.ipv4.tcp_migrate_req = 0`)에서 RST를 받는다(클라는 링크 실패로 보고 재시도 —
  운영 권고 `tcp_migrate_req=1`, ops-cluster §9).
- 시험: `listenPlan.test.ts`(계획기·성질·모델 — 출하 규칙(자기 확인)·월드 쪽 busy 전이 포함)·`ipcListen.test.ts`(코덱)·`worldIpcListen.test.ts`
  (월드 — 지시·중복 제거·해제·경합·월드 busy·송신 실패 격리)·`gatewayListen.test.ts`(게이트웨이 — 실제 소켓 중지·재개·재개 실패 재시도·자격·
  세션 경계·연결 상한 닫힘)·카오스 C8 `tests/cluster/chaosListenYield.test.ts`
  (Linux — 공유 포트 N=2, 닫힌 gw2 양보 중 새 입장 전원 gw1·KICK 9 0, 재개 뒤 다시 분산).

**비용**(4.4 → 4.5 실측): 월드 IPC 비용은 spread N=2 1100–1250에서 세션·tick당 3.0–3.4 → 1.52–1.57 µs, tick의 18–20% → 12%다. IPC 1 MB당
비용은 ≈0.62–0.65 → ≈1.9 ms로 올랐다 — MULTICAST·공유 프레임으로 바이트가 −84%(stock −99%) 줄었고 연결당 tick마다 레코드 1개(CONN_REF)의
고정비가 남는다. IPC 프레이밍은 −53~57%(1150: 3.49 → 1.52 ms). 게이트웨이 수가 늘면 프레이밍과 ipcFlush가 함께 커진다(4.4 stock 1000:
N=1–4 프레이밍 3.3/4.7/5.8/6.2 ms, ipcFlush 0.01/0.12/0.45/0.93 ms — 4.5 spread 1500 N=3·N=4 프레이밍 2.23·2.33 ms, 4.4 7.11·7.29).
게이트웨이 쪽은 봉투가 커져 DELIVER 처리 시간이 평균 0.38–0.58 → 0.7–1.1 ms로 늘었지만 CPU는 그대로다(N=2 메인 0.39–0.47코어).

---

## 4. 시뮬레이션 (서버)

### 4.1 Tick 루프

```ts
// server/src/sim/tickLoop.ts (요지)
const TICK_HZ = 20;          // 50 ms
const TICK_MS = 1000 / TICK_HZ;

let nextDeadline = performance.now() + TICK_MS;
function tick() {
  const t0 = performance.now();
  zone.applyInputs();        // 입력 큐 → 검증 → 의도 처리
  zone.runSystems(TICK_MS);  // movement, combat, status, …
  zone.buildSnapshots();     // AOI 별 델타 직렬화
  zone.flushOutbound();
  metrics.recordTick(performance.now() - t0);

  nextDeadline += TICK_MS;
  setTimeout(tick, Math.max(0, nextDeadline - performance.now()));
}
```

- `setInterval` 대신 **drift-correcting 재예약**. setInterval는 누적 표류 + 처리 지연 합산.
- **캐치업 상한**(`TICK_MAX_CATCHUP`, 기본 5): 정지(GC·동기 I/O·과부하) 후 밀린 데드라인은 상한 개수만
  연달아 실행하고 초과분은 건너뛴다(`mmorpg_tick_skipped_total`). 데드라인 격자 위상은 보존(건너뛴 만큼
  격자 단위 전진). 종전엔 상한이 없어 수 초 정지 후 S/50개 tick이 쉼 없이 돌며 지연이 무한 누적되고
  스냅샷이 20 Hz를 넘어 몰려 나갔다. 시뮬은 `tickIndex` 기반이라 결정론 무관 — 벽시계 대비 시뮬 시간이
  건너뛴 만큼 늦어질 뿐(TTL·쿨다운의 벽시계 체감만 변동).
- 지연(실제 시작 − 예정 데드라인)은 `mmorpg_tick_lateness_ms`, 처리 시간은 `mmorpg_tick_duration_ms`.
  lateness는 clamp 이후 데드라인 기준이라 긴 정지 뒤에도 ≈(상한−1)×50 ms(기본 200 ms)에 머문다 —
  정지 크기는 **`mmorpg_tick_stall_ms`**(clamp 전 backlog, 버킷 100 ms~30 s)로 본다. 표본은 엣지
  트리거 — 직전 반복의 backlog가 1 tick 이하였다가 1 tick을 넘는 전이에서만 1건이라 count = 정지
  에피소드 수다. 7초 정지 → stall 6950 ms 1건·lateness 최대 200 ms. 지속 과부하(매 tick > 50 ms)는
  시작 시 1건만 남고, 1 tick 이하로 회복하지 못한 채 clamp 주기마다 커지는 backlog는 표본이 아니다
  (그 구간은 `mmorpg_tick_skipped_total` 증가율로 본다). 회복 전(캐치업 중)에 겹친 두 번째 정지도
  별도 표본이 되지 않는다.
  스케줄러는 시계·타이머 주입(`TickLoopOptions`)으로 단위 테스트(`tests/server/tickLoop.test.ts`).
- **과부하 신호**(3단계 슬라이스 8, `net/overloadSignal.ts`): 루프는 반복마다 다음 데드라인 예약 직전에
  `onSchedule(건너뛴 tick 수)`만 부르고(`serverTick.startServerTickLoop`가 `deps.overload.observeTick`에 연결),
  판정·시계는 net 계층 신호에 있다(결정론 grep 무관). **진입**: 최근 `OVERLOAD_WINDOW_MS`(5000) 안의 skip 합 ≥
  `OVERLOAD_ENTER_SKIPS`(20) — 지속되면 Hz ≤ 20 − 문턱/창초(기본 16 Hz 이하)와 같다 — 또는 루프 무응답(마지막 반복
  이후 경과) ≥ `OVERLOAD_STALL_MS`(1000). 무응답은 질의 시점에도 본다 — 정지 직후 tick 타이머보다 수신 콜백이 먼저
  돌아도 그 버스트가 이미 과부하로 판정된다. **유지**: 창 안 skip 합 ≥ ceil(문턱/4)(기본 5 — 지속 시 ≈19 Hz) 또는 최근
  `OVERLOAD_WINDOW_MS` 안 무응답(진입보다 낮은 비례 문턱 = 히스테리시스). **해제**: 둘 다 아님 — `observeTick`·질의 어느
  쪽에서도 판정. 종전 "skip 1건이면 유지"는 간헐 블록(GC·채팅 버스트 300 ms — skip 2)만으로 과부하가 끝나지 않아 용량 경계
  서버의 접속 제한이 무기한 닫혔다(3단계 리뷰). **접속 제한**은 더 높은 문턱 — 과부하이면서 창 안 skip ≥ ceil(문턱/2)(기본
  10 — ≈18 Hz 이하) 또는 최근 창 안 무응답일 때만 거절한다. 1초 정지(skip 16) 뒤 19 Hz로 회복한 서버는 정지 후 창이 지나면
  접속을 다시 받는다(strike 보류는 유지 문턱까지 계속). 문턱은 `OVERLOAD_ENTER_SKIPS`에서 파생(별도 env 없음). skip 창은
  창을 10칸으로 나눈 칸 합(최근 창 × 0.9~1.0 근사, O(1) — 같은 칸 안 재질의는 캐시). 게이지 `mmorpg_overload_active`는 전이 때만 0/1, 전이 로그는
  `mod=overload`(진입 warn — cause `skips`/`stall`·창 내 skip·루프 간격, 해제 info — 지속 시간). 효과는 §10.
  `OVERLOAD_PROTECT=0`이면 신호가 항상 정상(종전 동작), 창 안 최대 skip(창/50 ms)보다 큰 문턱은 부팅 거부.
  실측(Windows, realistic 300 + `/admin/perf?stall=`): 7초 정지 → 게이지 1이 약 5초 유지 후 0, kick 0(종전도 0) /
  25초 정지 → 종전 KICK 5 300/300, 신호 켬 0/300(`OVERLOAD_PROTECT=0`이면 종전과 같은 300).
- **GC 페이서**(4.5 후속 — 스냅샷 꼬리, `sim/gcPacer.ts`): 벤치에서 tick p99 꼬리의 원인은 **tick 안에서 시작되는 JSC GC**였다. 할당
  임계는 할당이 몰리는 tick 안(대부분 스냅샷 단계)에서 차고, 정지 자체는 ≈0.3 ms지만 동시 마킹 동안 메인 스레드가 느려져 그 tick이
  +12–14 ms가 된다(zoneBench 1150명·게이트웨이 경유 — tick을 쉼 없이 돌린 조건: 가장 느린 1% tick 12개 전부 GC tick, GC tick 3.6%,
  GC tick을 빼면 스냅샷 p99/평균 2.20 → 1.36 / 20 Hz 주기 조건: GC tick 3.8%, 스냅샷 p99/평균 2.28). 루프는 `onSchedule(건너뛴 tick 수,
  다음 데드라인까지 유휴 ms)`를 넘기고(`startServerTickLoop`가 과부하 신호 다음에 `deps.gcPacer.afterTick` — 앞이 던져도 페이서는 돈다,
  다음 tick 예약은 onSchedule 뒤 시각 기준), 페이서는 `GC_PACE_TICKS`(K — 기본 0 = 끔, 켤 때 8)번째 tick마다 유휴가 `GC_PACE_MIN_IDLE_MS`(10) 이상이고
  이번 반복에 skip이 없으면 `Bun.gc(false)`(비동기 수집 요청 — 메인 스레드 비용 평균 0.2–0.3 ms, ≈1 GB 힙 2.4 ms, 나머지는 유휴 동안 보조
  스레드)를 부른다. 조건이 안 맞으면 미루고(`mmorpg_gc_pace_deferred_total` — 미룬 반복마다 1) 다음 반복에 다시 본다 — 과부하 중엔 종전처럼
  자연 GC다. 동기 `fullGC`는 힙에 비례해(≈1 GB 힙 82 ms — tick 주기 초과) 쓰지 않고, 동시 GC를 끄는 것(`BUN_JSC_useConcurrentGC=false`)은
  GC tick이 그대로라 p99 23.1에 머문다. 벤치의 자연 GC 간격은 ≈26 tick이라 8은 여유가 크다(32는 1.5%가 새어 p99 21.7).
  **실서버**(WSL 핀 고정, 4.5와 같은 방법)는 입력 경로(수신 디코드·JSON) 할당 탓에 eden 수집이 거의 매 tick(≈18–21회/초, 정지 ≈2 ms — 평균에
  들어간다)이라 벤치와 구성이 다르다. **monolith**: 꼬리는 한 번에 끝나는 full 수집(정지 13–21 ms)이고 페이서가 그것을 줄인다(700: 7 → 2회/런 — full 총수는 25 → 24로 같다) — tick p99
  26.08 → 22.95 ms(3회 중앙값). **월드(N=2)**: full 수집이 줄지 않고(끔 7 / 켬 9, 정지 ≤17 ms) p99 변화는 런 편차 안이다(1200 4회 중앙값
  ≈28.9 → ≈26.4, 1150 25.73 → 25.95) — 남은 월드 꼬리의 원인은 미확인(eden 정지 최대 11–16 ms가 후보). 입력 경로 할당 축소(이진 전환 B2b — C2S
  바이너리)는 수신 바이트 −54%였지만 eden 빈도는 그대로라 입력 경로는 주원인이 아니다 — 고빈도 S2C
  바이너리(B3b)도 월드 IPC −48%였지만 eden 빈도는 줄지 않아 프로토콜 JSON은 주원인이 아니다 — 남은 할당원은 할당 프로파일로 찾는다
  (`perf-baseline.md` "이진 전환 B2b"·"이진 전환 B3b"). 어느 쪽도 p99·CPU를 나쁘게 하지 않아 Bun 1.3.13에서는 기본 켬(8)이었다. 실서버에서 4는 8보다 낫지 않았다.
  `GC_PACE_TICKS=0`이면 페이서 없음(현재 기본 — 아래 1.4.3). 결과·방법은 `docs/perf-baseline.md` "스냅샷 꼬리 — GC 페이서".
  **Bun 1.4.3**(2026-10-13 전환): 위 실서버 "eden ≈18–21회/초"의 유력 원인은 1.3.x 이벤트 루프 GC 샘플러다(루프가 바쁘면 할당과 무관하게
  16 ms마다 eden을 건다 — 1.4.0에서 제거, 1.4.2에서도 같은 감소라 1.4.3 계정 수정은 배제). 1.4.3에서 eden −91~95%(monolith 런당 ≈1,700 → ≈150회),
  남은 eden의 ≈60%가 페이서 요청이다. 재튜닝(2026-10-14 — K=0·8·16 교차, 벤치·monolith 850·N=2 1450)에서 페이서 이득은 측정되지 않았다:
  벤치는 회차마다 방향이 엇갈리고 monolith는 같으며, N=2도 시간상 이웃한 끔/켬 쌍으로 방향이 일정하지 않다(끔 낮음 4·켬 낮음 3·같음 1). 켜면
  eden만 2.5~2.7배(월드 67 → 184회/런 — CPU·tick 비용은 측정되지 않음)이고 full은 그대로다. 그래서 **단순한 쪽인 끔(0)을 기본으로 바꿨다** — 1.3.x 계열 런타임이거나 tick 안 GC 꼬리가 다시 보이면 8로
  켠다(`docs/perf-baseline.md` "Bun 1.4.3 — 수용 인원·GC 페이서·소크").
- tick 시간 p99 > 30 ms 경고. > 50 ms = 시뮬 무너짐 → 알림.
- **단계 계측**(성능 2-A, `obs/tickProfiler.ts`): tick 콜백 첫 줄 `begin()` ~ tickLoop `onTick`(처리 시간·
  지연을 메트릭과 같은 값으로 전달) `end()` 사이를 단계로 나눈다. `Zone.tick`은 각 단계 직후 기존 메서드명으로
  `profiler.mark(phase)`만 부른다 — `applyInputs`·`runMonsterAi`·`runSystems`·`runCombat`·`runSkills`·
  `runItems`·`runPickups`·`runLifeChannels`·`runMonsterRespawns`·`runNodeRespawns`·`runDropExpiry`·`runManaRegen`·`runMonsterRegen`·`dispatchSnapshots`(14개,
  `ZONE_TICK_PHASES` — 생활 두 단계는 채널·노드가 없어도 mark한다, §4.6). clock은 obs에만 있어 결정론 grep이 그대로 성립하고, 프로파일러 미주입 Zone(테스트·
  골든)은 undefined 검사뿐이다(`zoneRegistry.setProfiler`로 운영 존에만 주입). 존 밖 구간: `withCork`가
  `cork`(인증 세션 스냅샷+cork)·`flush`(uncork = tick 송신 write — 턴 끝 flush보다 tick이 먼저 돌았으면 수신 디스패치
  지연 프레임 포함, §3.1), tick 콜백(`serverTick.runServerTick`)이
  `outcomes`(outcome 드레인·퀘스트 kill 훅·EXP 처리 동기부·인벤 dirty 마킹)를 mark. ROLE=world(4단계 4.2b)는 uncork 뒤
  `ipcFlush`(게이트웨이 피어 IPC 배치 flush — `ServerTickDeps.ipcFlush` 주입 시에만, monolith에는 이 단계가 없다)를 더 mark한다. 한 tick에 여러 존의 같은
  단계는 합산한다. 귀속 규칙: mark는 직전 mark 이후 경과를 그 단계에 넣으므로 `tickAll`의 존 정렬·루프 비용은
  첫 존의 `applyInputs`, 복귀 풀회복 ENTITY_META 송신·forcedUpdates 병합은 `dispatchSnapshots`, 존 tick
  예외(실패 단계의 부분 시간 + 에러 메트릭·로그)는 `tickAll` catch가 mark하는 `zoneError`에 들어간다(다음 존의
  `applyInputs`로 새지 않게 — 예외가 없으면 이 단계는 생기지 않는다). 배선(begin 위치·onTick → end·
  setProfiler·엔티티 게이지 수집 훅·/admin/perf)은 `server/src/serverTick.ts` 한 곳이고 index.ts와
  `tests/server/serverTick.test.ts`가 같은 코드를 쓴다. 원자료는 dev에서 마지막 4096 tick(≈204초) 링으로
  보관하고(production은 `/admin/perf`가 없어 링 1칸), 단계별 tick 합계는 매 tick `mmorpg_tick_phase_ms{phase}`(§9.6)에
  관측한다.

### 4.2 입력 처리 (S2 해소)

v1: `session.x += payload.dx` — 즉시·검증 없음.

v2:
1. `INPUT_CMD`는 `{seq, tick, dx, dy, action, gait}`를 가진다. `gait`(달리기 4.0·걷기 2.4 u/s, protocol.md §2.13)는 입력 스트림과 같은
   순서로 적용된다 — 그 입력을 소비하는 tick의 이동 속도이고(`Zone.applyInput` → `table.walking`, `movementSystem`), 입력이 없는 tick의
   경로 진행은 마지막 값을 유지한다. 몰아 소비는 마지막 입력의 값을 쓰므로 전환이 사라지지 않는다.
2. `inputQueue.push(connectionId, cmd)` — 시퀀스 누락·중복 제거.
3. 매 tick 시작 시 seq 오름차순으로 소비하되, **idle(dx=dy=0, action=0)은 연속 몰아
   소비(catch-up)하고 비-idle은 tick당 1건**(키보드 1건 = velocity 1 tick 의미 보존).
   tick당 총 소비는 `MAX_CATCHUP_PER_TICK`(4)로 상한 — ack 급등의 재조정 보정을
   tick당 ≤0.6유닛으로 분산. 종전 "tick당 1건" 정책은 프레임 히치 후 FixedUpdate
   캐치업 버스트로 쌓인 백로그가 영구 유지되어 ack 지연 → 방향 전환 시 재조정 점프의
   원천이었다(이동동기화 ②, `tests/server/moveSyncReconcile.test.ts`).
4. `movementSystem`이 `velocity = clamp(input × maxSpeed, ±cap)` 후 위치 갱신. 키보드 이동은 존 NavGrid로 벽·맵 경계에
   **축 분리 슬라이드**(`world/nav/navCollide.ts` `slideMove` — X 먼저, Y는 X 이동 뒤의 열에서, 막힌 이웃 셀 앞 `NAV_SKIN`
   1/1024에서 정지, 대각 틈 통과 불가, 맵 밖은 막힘, 사방이 막힌 매몰만 자유 이동, 결과는 1/4096 격자로 양자화 — 셀 선택 floor가 셀
   경계 정확히 위에서 서버 f64와 클라 f32 사이에 갈리지 않게, 리뷰 HIGH). velocity는 의도 속도 그대로다. 운영 `ZoneRegistry`가 존마다 격자를 주입하고(meta와 크기가 다르면 경고 후 충돌 끔), nav 없는
   Zone(단위 테스트·결정론 골든)은 종전 동작. 경로 추종(MOVE_TO)은 A* 경로를 믿고, 몬스터는 슬라이드 대신 막힌 직선을 A*로
   돌아간다(§4.5 벽 우회). 클라 예측은 같은 규칙의 C# 포팅(`World/Nav/NavCollide.cs`, `ClientPrediction.Nav`)이고
   movesync 골든(벽·히치·모서리·경계 시나리오 + collision 절)이 동형을 고정한다. 입장 때 저장 좌표가 막힌 셀이면 가까운 walkable 셀
   중앙(반경 4)으로 옮긴다(`world/entryPosition.ts` — 충돌 도입 전 벽 안에 저장된 좌표).
5. 의심 시 `seq`만 ACK 반환(클라이언트 재조정 트리거), 위치 자체는 다음 SNAPSHOT으로.

### 4.3 결정론 (테스트 가능성)

- 시뮬 코드 안에서 `Math.random()` 금지(lint 룰). `deterministic.ts`의 seeded PRNG만 사용.
- 모든 시간은 `tickIndex` 기반(절대 시간 사용 금지).
- 회귀 테스트: 같은 입력 시퀀스 → 같은 스냅샷 시퀀스. 스냅샷 해시 비교.

### 4.4 ECS-lite

```ts
type EntityId = number;
const positions   = new Map<EntityId, { x: number; y: number }>();
const velocities  = new Map<EntityId, { vx: number; vy: number }>();
const health      = new Map<EntityId, { hp: number; max: number }>();
// ...
```

- 라이브러리(bitecs 등) 도입 안 함. 전체 엔티티 수가 zone당 수천 단위면 Map 충분.
- 시스템은 **자기 컴포넌트만 순회**(예: `movementSystem`은 `velocities`만 iterate).
- 추후 hot path 프로파일링 후 SoA(typed array) 전환 여지를 남김.
- 성능 3단계는 컴포넌트 Map을 그대로 두고 tick당 scratch만 typed array로 바꿨다 — moved 판정(`moveTracker`), 몬스터 어그로의
  플레이어 버킷 인덱스(`systems/playerAggroIndex` — tick마다 `positions` 실제 위치로 재구축), A* 작업 배열
  (epoch 스탬프), AOI slot(§5). 남은 `runMonsterAi` 비용은 추격·복귀 상태기계의 Map 조회(몬스터당 약 7회)로 zoneBench spread
  2000·4000에서 약 1.3–1.5 ms다(목표 1 ms 미만 미달). 실측 부하(realistic 몬스터 608)에서는 0.12–0.29 ms라 SoA 전환은
  보류한다(`docs/perf-baseline.md`).

### 4.5 몬스터 AI (추격 리듬·배회·벽 우회)

> **발췌본에서 생략** — 게임 규칙에 해당해 공개 범위에서 뺐습니다.

### 4.6 생활 — 채집 노드·채널 (L-1)·채집 미니게임, 즉시 제작 (L-2)

> **발췌본에서 생략** — 게임 규칙에 해당해 공개 범위에서 뺐습니다.

## 5. AOI (관심 영역)

### 5.1 그리드

- 셀 크기: **16 타일**. 일반적인 화면 시야(20×11 타일)보다 넉넉.
- 각 엔티티는 자기 셀(cx, cy)에 기록. 위치 갱신 시 셀 변경되면 grid 재인덱스.
- 순서 계약(세션별 와이어 바이트가 여기에 묶인다 — `tests/regression/wireCharacterization`): 창 순회는 dy −1..1(바깥) ×
  dx −1..1(안쪽), 셀 안은 삽입 순서. 셀이 바뀐 엔티티는 새 셀의 끝에 붙고(같은 셀로 돌아와도 끝), 같은 셀 갱신은 순서를 바꾸지
  않는다. 셀 키는 16비트 wrap(`cellKey`)이고 좌표 범위 제한은 없다(드롭은 음수일 수 있다).
- 저장(성능 3단계 슬라이스 7, `world/aoi/grid.ts`): 엔티티마다 dense slot(id → slot Map — id 대역이 희소하다: charId·1e9 몬스터·
  1.5e9 NPC·2e9 지면 아이템). 셀은 slot의 이중 연결 리스트(typed array — 순서 보존 제거 O(1))이고 셀마다 변경 시각(version)을
  둔다. 제거된 slot은 스냅샷 dispatch 2회 뒤에야 다른 id에 재사용하고(`recycleSlots`), 그 사이 같은 id가 돌아오면 같은 slot을
  되찾는다(제거 후 재등록 = keep — 종전 Set 의미).

### 5.2 관심 집합

플레이어 P의 AOI = `cells[cx-1..cx+1, cy-1..cy+1]`. 매 tick:
1. 새 AOI 계산.
2. `enter = new − old`, `leave = old − new`.
3. `enter`의 엔티티는 `ENTITY_SPAWN`, `leave`는 `ENTITY_DESPAWN` 송신
   (G-9: 이번 tick 사망이면 `reason=2`, 그 외 `0` — 클라가 시체 연출과 단순 시야이탈을 구분).
4. 유지 엔티티는 **변경된 컴포넌트만** `SNAPSHOT_DELTA`에 포함.

viewer별 송신 순서: SPAWN 전부(enter = 새 창 순서) → DESPAWN 전부(leave = 직전 창 순서) → DELTA(keep 중 이번 tick에
움직인 엔티티를 keep 순서로 + 본인이 enter이면서 움직였으면 끝에 1회 — 보통 1개, 원소가 5460을 넘으면 같은 tick·ack 프레임 여러 개(H1)).
빈 DELTA는 보내지 않는다.

구현(성능 3단계 슬라이스 7 — 바이트 불변, 종전 Set 구현을 오라클로 둔 등가 테스트 `tests/server/aoiDataOrientedEquivalence`·
`snapshotDataOrientedEquivalence`):
- 직전 창은 viewer마다 (slot, id) 배열이고 포함 판정은 slot 인덱스 스탬프 배열(diff마다 새 epoch)로 한다 — Set 생성·해시 조회가
  없다. slot마다 id를 대조하므로 재사용된 slot을 새 엔티티의 keep으로 오인하지 않는다.
- 직전 diff 이후 창 셀의 인덱스·version이 그대로면 diff를 건너뛰고 직전 창이 곧 keep이다(밀집 배치에서 셀 경계 이동이 없으면
  O(셀 수)).
- moved 판정은 dispatch당 1회 만드는 slot 캐시를 쓴다. DELTA 프레임은 원소당 u32 3개를 typed array로 옮긴다(f32 변환은
  `writeFloatLE`과 같다). id가 u32 범위 밖이면 객체 경로로 돌아가 WireEncodeError를 낸다. 원소가 스키마 max(5460 — 본문이 u16 프레임
  길이 안)를 넘으면 객체 경로가 같은 tick·ack 프레임 여러 개로 나눈다(H1 — `mmorpg_snapshot_delta_split_total`, 극단 밀집에서만).
- dispatch를 건너뛴 viewer(직전 diff 이후 slot 회수가 재사용 지연 이상 — `buildAndSend` 예외 뒤)는 직전 창 표시를 검증 경로로
  한다: slot이 그 id로 살아 있지 않으면 id의 현재 slot으로 고쳐 적는다(회수 뒤 다른 slot으로 돌아온 같은 id = keep — 고치지 않으면
  SPAWN 뒤 DESPAWN이 나가 보이는 엔티티가 사라졌다, 3단계 리뷰). 매 dispatch diff하는 정상 경로는 이 검사를 하지 않는다.
- viewer 사이 공유: SPAWN/DESPAWN 프레임은 dispatch당 엔티티 1회 인코딩, DELTA는 viewer마다 재사용 버퍼에 쓴 뒤 outbox로 복사(§3.1).
- DELTA 묶음(성능 4.5 F3, `sim/deltaGroups.ts`, 4.5 설계 §5): 한 dispatch 안의 DELTA 프레임은 (tickIndex, ackSeq) 머리와 (keep slot 열,
  self slot)의 순수 함수다. 그래서 keep·self가 같은 viewer(같은 셀에 머문 viewer)는 ackSeq(프레임 offset 10)만 다르다.
  - 판정은 추론이 아니라 입력 비교다 — 버킷(keep 길이·처음/가운데/끝 slot·self 해시, 열린 주소법 표 — dispatch마다 stamp로 비운다)으로
    후보를 좁히고 길이·self·keep 원소를 전부 비교한다. 적중하면 앞선 viewer의 프레임을 ackSeq만 바꿔 보내고 writeEntries를 건너뛴다.
  - 미스면 writeEntries/finish 뒤 그 finish 뷰를 복사 없이 풀 프레임이 가져간다(DeltaCache와 저장소를 맞바꾼다). count 0도 "보낼 것 없음"으로
    등록한다. 프레임 풀은 두 세대 — 두 dispatch 뒤에야 재발급하고(epoch), 참조를 든 outbox는 epoch를 대조한다(재발급이면 그 세션만 닫는다).
  - keep이 `DELTA_GROUP_MIN_KEEP`(64)보다 짧으면 종전 viewer별 경로다 — 짧은 keep은 writeEntries가 묶음 판정·등록보다 싸다(zoneBench spread
    셀당 2명에서 하한 0은 dispatchSnapshots +0.41 ms, 64는 ±0.01 ms — `docs/perf-baseline.md` 4.5 F3). 회귀 하니스는 하한 0으로 전원을 묶는다.
  - 바이트는 묶지 않은 빠른 경로와 같다(`tests/server/snapshotDeltaGroups.test.ts` 무작위 등가 — 버킷 해시·한 버킷·운영 하한, 특성화 골든).

### 5.3 효과

- v1: 모든 이동 패킷 × 모든 접속 = O(N²)
- v2: 평균적으로 한 플레이어가 보는 동시 엔티티 ≈ 셀 밀도 × 9. 100 CCU 분산 월드에서 1인당 송신량 하락 폭이 1자리수가 아닌 2자리수.
- 성능 3단계 실측(`docs/perf-baseline.md`): `dispatchSnapshots`가 같은 CCU에서 5.5–16.5배 줄었다(stock 300 W 16.70 → 1.37 ms,
  login-storm 1000 70.78 → 1.55 ms — 보낼 것이 없는데 비싸던 AOI 차분 비용이 사라짐). 그래도 한 셀 밀집에서는 출력 자체(viewer당
  갱신 ∝ N)가 N²라 인원의 거의 제곱으로 는다(stock 500 → 1000에서 3.45 → 12.93 ms). 새 임계점에서 tick의 지배 비용은 스냅샷이
  아니라 소켓 send다(§3.1).

---

## 6. 영속성 (S5 해소)

> **발췌본에서 생략** — 저장·트랜잭션 설계는 공개 범위에서 뺐습니다.

## 7. 인증 (v1 토큰 무검증 해소)

> **발췌본에서 생략** — 인증·세션 설계는 공개 범위에서 뺐습니다.

## 8. 클라이언트 모델

### 8.1 입력·예측·재조정 (C2/C4 해소)

```
FixedUpdate (20 Hz — fixedDeltaTime 0.05, 서버 tick과 동기):
  cmd = sampleInput(this tick)
  applyLocally(predictedState, cmd)   ← 즉시 보임
  send(cmd, seq=N)
  predictedHistory.push({seq, snapshot})

OnSnapshot(serverTick, authoritativeState, ackSeq):
  if predictedHistory[ackSeq] ≈ authoritativeState: ok
  else:
    predictedState = authoritativeState
    replay(predictedHistory[ackSeq+1..])  ← 재조정
```

핵심:
- 클라이언트와 서버가 **같은 tick rate**(20 Hz). FixedUpdate에서 입력 샘플링.
- v1의 `GetKeyDown` 폐기. `Input.GetKey()`로 holdable 입력 + 대각선 정상화(dx,dy ∈ [-1,1] 정수, 길이 1로 정규화는 서버가 함).
- **replay는 각 입력을 "적용 당시의 path"로 재시뮬**(이동동기화 ①). history 항목이
  적용 시점의 path 인스턴스+진행 index를 보관하고, SetPath/ClearPath는 인스턴스
  스왑(참조 동일성 = 세대 구분). 현재 path로 소급 재시뮬하면 우클릭 방향 전환 순간
  미ack 창(RTT/50ms + 백로그)만큼 새 방향으로 점프한다 — 키보드 입력이 path를
  클리어하는 규칙과 대칭.
- **replay의 속도는 그 입력의 gait**(걷기·달리기, protocol.md §2.13). `InputCmd.Gait`를 history가 함께 보관하고 서버는 같은 입력을 소비하는 tick에
  같은 속도를 쓴다 — 전환이 입력 스트림과 같은 순서라 경로·키보드 중 전환에도 재조정 결과 = 순수 예측(`tests/server/moveSyncGait.test.ts`,
  movesync 골든 `gait *` 시나리오). 예외는 해빙 직후 백로그 소비 중의 전환 하나다: 서버가 입력 N건을 몰아 소비하며 마지막 gait로 1스텝 걸어 경로에서
  (0.2 − 0.12) × N 이내로 어긋나고, 경로 끝에서 만난다(키보드는 입력당 정확히 1스텝이라 어긋나지 않는다).
- **우클릭 누르고 있기 이동**(`World/HoldMove.cs` 규칙, `CombatController.TickHoldMove` 배선): 빈 땅을 우클릭한 채 두면 커서 지점으로
  MOVE_TO를 다시 보낸다(일반 우클릭과 같은 예측 경로·서버 A* — 와이어 변경 없음). 간격 ≥ 0.25 s = 최대 4/s — 달리기 4 u/s로 nav 1칸을 지나는
  시간(경로는 칸 단위라 더 잦아도 걸음이 같다), 추격 재조준과 같은 값이고 클라 버킷 7/s·서버 8/s 아래라 누르는 동안에도 클릭 몫이 남는다.
  그것도 걸음이 달라질 때만: 걷는 경로의 끝이 2 u 안(카메라가 플레이어를 따라오므로 마우스를 가만히 두면 커서가 늘 앞서 나간다 — 0.25 s +
  한 프레임 동안 걷는 거리 < 2라 서지 않고 잇는다), 커서 쪽 방향 10° 초과, 커서를 1 u 넘게 당김(더 가까이 서기). 직전 목적지에서 0.5 u 안이면
  보내지 않는다 — 마우스를 가만히 두고 커서가 4 u 앞이면 ≈2/s, 커서가 한 땅 지점에 머물면(존 가장자리에서 카메라가 멈춤 등) 도착 뒤 0.
  버튼을 떼면 뗀 순간의 커서 지점을 한 번 더 보내(간격 상한 안) 거기 선다 — 다시 보낸 적 없이 0.25 s 안에 뗀 건 보통 클릭이라 더 보내지
  않는다(걷는 동안 카메라가 따라와 커서가 땅에서 밀리므로). 누르기는 버튼이 실제로 눌려 있을 때만 시작한다(코드에서 부른
  `HandleWorldRightClick`은 클릭 1번). 막힌 커서(벽·건물)는 플레이어 쪽으로 되짚은 첫 walkable 지점을
  보내 벽 앞까지 걷고(A*의 막힌 목적지 보정은 탐색 순서상 얇은 벽 건너편을 고를 수 있다), 그래도 클라 A*가 길을 못 찾으면(서버도 "no
  path"로 옛 경로를 유지한다) 보내지 않고 직전 목적지를 그대로 둔다(`PlayerActor.CanHoldMoveTo` → `HoldMove.Skip`). 다시 보낸 목적지는
  클릭 마커를 찍지 않고, 서버 MOVE_PATH가 방금 예측한 경로와 같으면 갈아끼우지 않는다(진행 index가 0으로 돌아가 이미 지난 꺾임점으로
  되걷지 않게 — 모든 MOVE_TO 공통). 서 있는 칸 안의 후보는 걷는 중에 커서를 당겼을 때만("여기 서기") 보내 서버처럼 그 자리에 서고(서버는
  같은 칸 목적지에 경로를 지우고 선다 — 칸 안 점까지 직선으로 걸으면 재조정이 되당긴다), 앞서 나가는 커서가 잠깐 그 칸에 든 것이면
  건너뛴다(클릭·추격·자동 접근의 같은 칸 목적지는 종전대로 칸 안 직선 — 막힌 칸 위 몬스터·드롭에 사거리까지 다가가는 걸음이 이것에 기댄다).
  끝: 키보드 이동·좌클릭은 새 이동이 대신하고, ESC는 그 자리에 서고(MOVE_STOP — 그 ESC는 메뉴를
  열지 않는다), 모달·채팅 입력·포커스 상실은 마지막으로 보낸 목적지까지 걷고, 사망·존 전환은 걸음 자체가 끝난다. 시험: EditMode
  `HoldMoveTests`, PlayMode `HoldMoveLiveTests`.
- **걷기·달리기**(R 키 — `UiInputGate.HotkeyDown`, `InputSampler.Update`): 선호는 `LocalMoveGait`(static — PlayerActor가 새로 만들어지는 존 전환·재접속을
  넘어 유지, `LoginContext.Reset` = 새 로그인에서 달리기로)이고 FixedUpdate 입력마다 `InputCmd.Gait`로 실린다. 모달·채팅 입력·사망 중에는 게이트가 막는다.
  로컬 애니메이터 걸음걸이는 선호를 따르고, HUD는 핑 아래 한 줄(`이동: 걷기 (R)`, `HudOverlay` — 핑 줄 복제라 씬 오브젝트·재베이크 불요).

### 8.2 원격 엔티티 보간 (C3 해소)

원격 플레이어의 걷기·달리기는 와이어에 없다(스냅샷 비용 0) — 그려진 속도로 고른다(`World/Character/RemoteGaitEstimator`): 계속 움직인 0.3 s 창의 평균이
3.6 u/s 이상이면 달리기, 2.8 이하면 걷기, 그 사이는 유지(걷기·달리기 중간 3.2 ± 0.4). 멈춘 프레임을 낀 창은 판정하지 않아 출발·정지·보간 공백을 걷기로 읽지 않는다.

- 받은 스냅샷을 t-100 ms 지연 큐에 저장(`EntityInterpolation.cs`).
- 매 프레임 `lerp(prev, next, alpha)`로 위치 산출.
- 100 ms 버퍼는 표준값. 지터·loss에 견고.
- 멈췄다 다시 움직이면(서버는 움직인 entity만 보낸다 — 몬스터 걷기·멈춤 리듬·배회, 멈췄다 걷는 플레이어) 새 샘플과 직전 샘플 간격이
  멈춘 시간 전체다. 그 사이를 그대로 lerp하면 도착 순간 대부분을 건너뛰고 남은 거리를 기어가므로, 직전 위치를 새 샘플 50 ms(1 tick)
  앞에 다시 넣어 멈춘 자리에서 제 속도로 출발한다(`EntityInterpolation.Push`, `EntityInterpolationTests`). 멈춤 판정은 SNAPSHOT_DELTA
  `tickIndex`가 1보다 많이 건너뛴 것으로 한다 — 도착 간격으로 보면 계속 움직이던 entity의 늦은 패킷(지터·프레임 히치)도 멈춤으로 오인해
  섰다가 달린다. tick을 모르는 스폰 직후 첫 갱신만 도착 간격 > 100 ms로 본다. 샘플 사이 2칸 넘게 움직이면(부활·GM 텔레포트 — 움직인
  tick만 오므로 걷기는 샘플당 한 tick ≤ 0.2) 순간이동이라 보간 없이 바로 옮긴다(`TeleportSnapDistance` — 멈춘 뒤 텔레포트를 보간하면 벽을
  가로질러 미끄러진다).
- 샘플 시각은 도착 시각이 아니라 서버 tick으로 찍는다(`Sim/SnapshotClock.cs`, WorldView가 SNAPSHOT_DELTA마다 1회): 시각 = tick × 50 ms +
  최근 1.5초 (도착 − tick 시각)의 최솟값. 도착 시각으로 찍으면 네트워크가 잠깐 막혔다 풀릴 때 밀린 tick들이 한 시각에 겹쳐 원격 캐릭터·
  몬스터가 멈췄다 툭 튄다. tick 시각이면 밀린 tick이 제 간격으로 재생된다 — 보간은 다음 샘플이 있어야 하므로 지연 버퍼 − 한 tick(약 50 ms)
  까지의 끊김은 멈춤·튐 없이 흡수하고, 더 긴 끊김도 튀는 폭이 준다(80 ms 끊김에서 절반, `SnapshotClockTests`) — 0–60 ms 지터도
  고르게 펴진다. 찍힌 시각은 늘 도착 시각 이하이고 앞 샘플보다 앞서지 않게 묶는다. 늦은 도착(지연 버퍼 − 한 tick 넘게)이 0.15초 넘게
  이어지면 지연이 계속 늘어난 것(경로 변경·서버 tick 건너뜀)으로 보고 기준을 다시 잡는다 — 안 하면 창 1.5초 동안 20 Hz 계단으로 움직인다.
  존 전환·tick 역행이면 기준을 새로 잡는다. 원격 위치는 이 경로만 쓴다 — MOVE_PATH는 요청자
  본인에게만 간다(protocol.md MOVE_PATH 수신자 계약).

### 8.3 패킷 버스 (C1 해소)

```csharp
PacketBus.Subscribe<SnapshotDeltaPayload>(PacketIds.SNAPSHOT_DELTA, OnSnapshot);  // 멀티 구독 OK
PacketBus.Subscribe<ChatBcastPayload>(PacketIds.CHAT_BCAST, OnChat);
```

- 디코드는 생성 바이너리 코덱(`WireCodec.Decode` — 실패 = `WireError` 로그 + drop, 스키마 밖 id는 "unknown packet")이다(B6에 JSON·Newtonsoft 분기 제거 —
  Newtonsoft는 items.dat 복호만). 와이어 u32 필드는 C# `uint`로 오므로 int를 쓰는 구독자는 `unchecked((int)…)`로 재해석한다(`Reconciler`·`WorldView`).

- v1의 `Dictionary<id, Action>` 덮어쓰기 폐기. `MultiMap<Type, Delegate>`로 교체.
- Scene 전환 시 자동 해제는 `WeakReference` + Subscribe 토큰으로 지원.

### 8.4 RingByteBuffer (P3 해소)

- 4 KB 시작, 2× 증가, 64 KB 캡.
- `Append(byte[], int len)` O(len). `TryRead(out header, out span)` O(1) 조회 + `Advance(n)` O(1) 소비.

### 8.5 메인 스레드 예산

`NetworkManager.Update()`는 현재 수신 큐를 프레임마다 **끝까지** 디스패치한다(프레임당 상한 미구현). 폭주 트래픽이
frame stall로 번지지 않게 프레임당 N개(예: 64)만 디스패치하고 초과분을 다음 프레임으로 넘기는 예산은 후속 과제다.

---

### 8.6 포탈·부활과 연결 종료 안내

> **발췌본에서 생략** — 게임 규칙에 해당해 공개 범위에서 뺐습니다.

### 8.7 NPC 전용 Village

> **발췌본에서 생략** — 게임 규칙에 해당해 공개 범위에서 뺐습니다.

### 8.8 메인 마을 MainTown (zone 4)

> **발췌본에서 생략** — 게임 규칙에 해당해 공개 범위에서 뺐습니다.

## 9. 관측성 (O3 해소)

> 운영 절차(켜기·조회 레시피·수집기 셋업)는 [`ops-logs.md`](ops-logs.md).

### 9.1 로그 — 레코드 포맷

`obs/logger.ts` — pino 호환 모양의 JSON 라인 로거(직접 구현, 의존 0). **1 레코드 = 1 줄**(`\n` 구분, UTF-8)이 계약 — 모든 테일러/수집기(Vector·Filebeat·Logstash·VictoriaLogs)가 무변환 인제스트 가능해야 한다. stdout과 파일 싱크는 동일 바이트를 쓴다.

| 필드 | 타입 | 설명 |
|------|------|------|
| `t` | number | epoch ms(ISO 변환은 shipper 몫 — 수집기 범용성) |
| `level` | string | `debug`/`info`/`warn`/`error` (`LOG_LEVEL=silent`은 stdout만 억제) |
| `mod` | string | `createLogger(mod)` 모듈명(`tcp`/`router`/`gm`/…) |
| `msg` | string | 메시지 |
| `tick?` | number | 현재 tick 인덱스(`setTickProvider` 배선) — 메트릭·리플레이 조인 키 |
| `proc?` | string | 프로세스 이름(성능 4단계 — `setProcTag`, env `PROC_NAME`). ROLE이 monolith가 아닐 때만 붙는다(monolith 레코드 바이트 불변), meta로 섀도잉 불가 |
| `suppressed?` | number | 스쿼시가 직전에 억제한 동종 라인 수(§9.4) |
| meta | flat | `connId`/`charId`/`zoneId`/`packetId`/`err`(name/message/stack 평면화) 등 최상위 평면 필드 |

- **레닥션(직렬화기 레벨 강제)**: 키 블록리스트(password/pass/pw/secret/token/accessToken/refreshToken/apiKey/sessionKey/privateKey/rollKey(생활 롤 비밀 키)/credentials/authorization/auth/cookie/bearer 등 — 대소문자 무관, 중첩 포함) → `"[REDACTED]"` + `err.message`/`stack` 자유 문자열의 `Bearer …`·`token=…` 값 패턴 스크럽. 평문 TCP(§10.1)라 호출부 규율에 의존하지 않는다. `username`은 브루트포스 포렌식용으로 의도적 비레닥션(§9.3 토큰 게이트로 완화).
- `console.log` 직접 호출 금지(lint 룰) — 로그는 `obs/logger.ts`만.
- `LOG_LEVEL`만 env.ts 미경유 직접 읽기(obs 테스트가 런타임 변경+`refreshLogLevel()`) — 그 외 신규 `LOG_*`는 전부 env.ts 경유.

### 9.2 싱크 계층

stdout은 등록 싱크가 아닌 **내장 경로**(activeLevel 게이트, `process.stdout.write` 호출 시점 조회 — obs 테스트 몽키패치 계약). 추가 출력은 `LogSink`(minLevel/write/flush/flushSync/close)로 `registerSink` — `write`는 throw/block 금지(tick 콜백의 cork 윈도 안에서 호출되므로 push만, I/O는 flush로).

```
emit ─┬→ stdout(내장, LOG_LEVEL)
      ├→ LogRing(인메모리, LOG_RING_*) ──→ GET /admin/logs (§9.3)
      └→ LogFileSink(LOG_DIR·LOG_FILE_*) → logs/<PROC_NAME>-YYYYMMDD-HHmmss-NNNN.jsonl (monolith 기본 server-…)
                                            └─(선택) Vector 테일 → VictoriaLogs 등 (§9.5)
```

`LogFileSink` — Windows-safe 3원칙:
1. **핸들 미보유**: 플러시(1초 unref 타이머/64KB 임계)마다 open-append-close — 강제 파일락·`--watch` 재시작 중첩·외부 테일러와 충돌 없음.
2. **rename 없는 로테이션**: `LOG_FILE_MAX_MB` 도달 시 새 타임스탬프 파일로 스왑(구 파일 무접촉 — 테일러 자연 완주), 보존 `LOG_FILE_MAX_FILES` 초과분 삭제(락이면 다음 로테이션 재시도). 파일명 시퀀스(-NNN)는 사전순=생성순 불변식(번호 공백 미재사용).
3. **write()는 push뿐**: append 실패 시 4MB 상한 버퍼(초과 오래된 것부터 드롭 = `mmorpg_log_dropped_lines_total`), 연속 10회 실패 시 자기 비활성. 부팅 시 임계 미만 최신 파일에 이어 씀. 셧다운은 `flushAllSinks()` 드레인 후 exit.
4. **프로세스별 접두어**(성능 4단계): 파일 접두어 = env `PROC_NAME`(`resolveProcName` — monolith `server`·world `world`·gateway `gw<id>`). 보존 삭제·부팅 이어쓰기는 `<접두어>-`로 시작하는 파일만 보므로 같은 `LOG_DIR`의 게이트웨이·월드가 서로의 파일을 지우거나 이어 쓰지 않는다 — 접두어에 `-` 금지(env 스키마).

### 9.3 /admin/logs 조회

`GET /admin/logs?level=&mod=&connId=&sinceSeq=&sinceT=&limit=` → `{ok, nextSeq, count, dropped, lines:[{…, seq}]}`.
- 링버퍼는 **레닥션 적용 line을 정본 저장**(원시 record 미보관 — 유출 방지), 8K자 초과 라인은 meta 폐기 축약. `seq`는 링 커서가 권위(레코드 동명 meta 무시), limit은 요청과 무관하게 500 상한.
- sinceSeq 미지정 = 최신 테일(뒤에서 limit), 지정 = 전진 커서(`nextSeq` 재폴링으로 팔로우). 폴링 사이 랩어라운드로 밀려난 구간은 `dropped`로 노출(0 = 연속).
- **ADMIN_TOKEN 무조건 필수**(미설정이면 404 은닉, Bearer만·`?token=` 불허) — 로그에 username·IP가 있어 형제 라우트의 bind-only를 신뢰하지 않는다.

### 9.4 크래시·과부하·폭주 정책

| 장치 | 정책 |
|------|------|
| uncaughtException | JSON error 로그 → `flushAllSinksSync()` → **exit(1)**. crash-only — 권위 상태 프로세스가 미지 상태로 계속 돌면 저장 데이터가 오염된다 |
| unhandledRejection | 로그 + `mmorpg_unhandled_rejection_total`, **종료 없음**(fire-and-forget promise 다수) — 카운터 추세로 감시 |
| tick 과부하(§4.1) | 100틱마다 duration 링 p99 — >30ms warn / >50ms error 승격 / <24ms 복귀(히스테리시스), 열화 중 재경고 60초(1200틱)당 1회. 전부 tick 카운트 기반 |
| 로그 스쿼시 | 키별 토큰 버킷+LRU(+선택 전역 캡): tickFn 1/s·존tick 존당 1/5s·와이어/라우터 위반 conn당 1/s+전역 20/s·인증 lockout IP당 1/5s. 억제분은 다음 허용 라인의 `suppressed`로 보존, 메트릭 카운터는 억제와 무관하게 항상 증가 |

### 9.5 수집·조회 티어 (선택 오버레이)

**원칙: 파일이 곧 버퍼 — 인앱 transport 훅을 만들지 않는다.** 코어는 외부 서비스 0(JSONL+링버퍼). 수집기는 체크포인트 테일러(shipper)가 파일을 읽어 순수 운영 측에서 붙는다. 인프로세스 push가 정말 필요해지면 `LogSink` 구현 1개가 유일한 경계다.

- **기본 권장**: VictoriaLogs(단일 바이너리·웹 UI·jsonline 무변환 인제스트) + Vector 파일 테일 — 셋업은 [`ops-logs.md`](ops-logs.md).
- **ELK 기각(현 규모)**: ES JVM 힙 2–4GB+ILM+Logstash 유지비가 단일 프로세스 로그 브라우징 효용을 초과.
- **Kafka 기각 + 도입 트리거**: 내구 버퍼·팬아웃·리플레이는 파일+체크포인트 테일러가 동일 제공. 재평가 트리거 — ① 멀티 서버 프로세스/샤드 ② 실시간 push 독립 컨슈머 ≥2(라이브 안티치트+분석 등) ③ 파일 테일 지연 볼륨(>~50MB/분) ④ 로그 너머 이벤트 버스 수요. 도입 시 Apache Kafka보다 **Redpanda**(단일 바이너리, Kafka API 호환) 우선. 삽입 지점은 shipper 설정 — 앱 변경 0.
- **로거 자체(자체 구현 유지) 재검토 트리거**: 스쿼시 후에도 지속 5k+줄/초 / OTLP 분산 트레이싱 필요 / 멀티 프로세스 샤딩의 인프로세스 배송 / Bun worker transport 성숙+싱크 4개 이상.

### 9.6 메트릭

서버 내 메모리 카운터:
- `tick.duration_ms` (히스토그램)
- `net.rx_bytes`, `net.tx_bytes` (counter)
- `net.packets_rx`, `net.packets_tx` (counter, label: packetId) — rx는 사전 판정을 통과해 디코드·디스패치한 패킷만(B2c — 거부·디코드 실패 제외)
- `router.unknown_packet{packet_id}`·`router.state_rejected{packet_id,state}` (counter) — B2c부터 본문 디코드 **전** 사전 판정
  (`network/packetAdmission.ts`)이 센다(이름·라벨 불변, 라우터 디스패치는 다시 세지 않는다). unknown = 스키마의 C2S id가 아닌 id(S2C id 포함)
- `net.decode_error{packet_id,reason}` (counter) — 사전 판정을 통과한 패킷의 본문 디코드 실패. `reason` 라벨(B2c 추가)은 유한 집합 —
  `WIRE_ERROR` 이름(`Truncated`·`Trailing`·`BadBool`·`BadEnum`·`OverMax`·`UnderMin`·`BadUtf8`·`BadPresence`·`NonFinite`, 모르는 코드 `Unknown`)과
  디코더 예외 `Threw`(코드젠 회귀 신호). 종전 무라벨 합계를 보려면 `sum without (reason)`
- `world.entities`, `world.connections` (gauge)
- 로깅 신설: `mmorpg_log_dropped_lines_total`, `mmorpg_unhandled_rejection_total`
- 안정성 1단계 신설·확장(이름은 추가만 — 기존 이름 불변. `tx_partial`은 의미 정정, `conn_rejected`는 reason 값 추가):

| 메트릭 | 종류 | 의미 |
|--------|------|------|
| `mmorpg_tick_lateness_ms` | histogram | tick 실제 시작 − 예정 데드라인(타이머 지터 + backlog). clamp 이후 기준이라 긴 정지 뒤에도 ≈200 ms에 머문다(§4.1) |
| `mmorpg_tick_skipped_total` | counter | 캐치업 상한(`TICK_MAX_CATCHUP`)으로 건너뛴 tick 수 |
| `mmorpg_tick_stall_ms` | histogram | clamp 전 backlog(정지 크기). backlog가 1 tick 이하 → 초과로 바뀌는 전이에서만 표본 — count = 정지 에피소드 수(지속 과부하는 시작 1건뿐, 그 구간은 `_skipped_total`로 본다), 버킷 100 ms~30 s |
| `mmorpg_net_tx_partial_total{packet_id}` | counter | 부분 쓰기 발생(꼬리 보관 → drain 이어쓰기, 세션 유지) |
| `mmorpg_net_tx_backlog_close_total` | counter | 꼬리 `OUTBOUND_MAX_BYTES` 초과로 종료한 느린 소비자 |
| `mmorpg_net_rate_violation_total{state}` | counter | rate 위반 1건당 +1(drop·kick 모두, 의미 불변) |
| `mmorpg_net_rate_dropped_total` | counter | IN_WORLD 토큰 부족으로 디스패치 없이 버린 패킷 |
| `mmorpg_net_rate_kick_total{state}` | counter | rate KICK(pre-auth 첫 위반 / IN_WORLD strike 윈도우 초과) |
| `mmorpg_net_rate_reserve_total` | counter | 메인 버킷이 빈 동안 명령 예약분으로 통과한 IN_WORLD 비스트림 명령(위반 아님) |
| `mmorpg_conn_rejected_total{reason}` | counter | 접속 거절·킥 — `global_cap`/`per_ip_cap`/`pre_auth_cap`/`pre_auth_per_ip_cap`/`idle`/`pre_auth_deadline`/`legacy_framing`(구 v1 프레이밍 클라 — v1 형식 KICK 1, B1)/`legacy_hello`(ANON 연결에서 디코드 안 되는 HELLO 전부 — 주 원인은 B1~B2a 클라의 JSON HELLO, 사유는 warn 로그, KICK 1 — B3b부터 JSON 본문 고정 프레임, B2b)/`legacy_proto`(HELLO 버전 불일치 중 protoVersion 3~5 = B1~B2b 클라 — JSON 본문 고정 프레임 KICK 1, B3b) |

- 성능 2-A 신설(카탈로그 끝에 추가만 — 기존 노출 순서·포맷 불변, `tests/server/metricsPerf.test.ts`가 동결 목록을 고정):

| 메트릭 | 종류 | 의미 |
|--------|------|------|
| `mmorpg_tick_phase_ms{phase}` | histogram | tick 1건의 단계별 시간(ms, §4.1 단계 계측). `phase` = `Zone.tick` 메서드명 14개(`applyInputs`…`dispatchSnapshots`, 존 합산 — 생활 L-1의 `runLifeChannels`·`runNodeRespawns`, 허수아비 `runMonsterRegen` 포함) + `cork`·`outcomes`·`flush` + `zoneError`(존 tick 예외 — 첫 예외 이후에만 나타남). 단계가 생긴 뒤로는 tick마다 1회 관측(안 불린 단계 = 0)하므로 단계별 count = 그 단계 생성 이후 tick 수. 버킷 0.1·0.25·0.5·1·2·3·5·7.5·10·15·20·25·30·40·50·75·100·250·500·1000 |
| `mmorpg_world_entities` | gauge | (기존, 종전엔 값 미설정) 전 존의 살아있는 엔티티 수(플레이어·몬스터·NPC·지면 아이템) — scrape 시점에 `registry.addCollector` 훅이 계산. HELP `Live entities across all zones (computed at scrape)`(종전 `Live entities in zone`) |
| `mmorpg_process_cpu_user_seconds_total` | counter | 프로세스 user CPU 초(`process.cpuUsage`, scrape 시점) |
| `mmorpg_process_cpu_system_seconds_total` | counter | 프로세스 system CPU 초(`process.cpuUsage`, scrape 시점) |
| `mmorpg_process_rss_bytes` | gauge | RSS 바이트(`process.memoryUsage.rss`, scrape 시점) |
| `mmorpg_process_heap_used_bytes` | gauge | JS 힙 사용 바이트(`process.memoryUsage().heapUsed`, scrape 시점) |
| `mmorpg_metrics_collector_error_total` | counter | scrape 시점 수집 훅(`registry.addCollector`) 예외 수 — 실패한 훅이 채우는 게이지(`mmorpg_world_entities`)는 직전 값에 머문다. 0이 아니면 그 게이지는 stale |

- 성능 3단계 신설(2-A 목록 뒤에 추가만, 같은 테스트가 고정):

| 메트릭 | 종류 | 의미 |
|--------|------|------|
| `mmorpg_net_tx_writes_total` | counter | 소켓 raw write 호출 수(부분 쓰기 꼬리의 drain 이어쓰기 포함, 닫힌 소켓 -1 반환도 1회). `packets_tx / writes` = write당 프레임 수 — tick 코킹·tick 밖 코얼레싱(§3.1) 효과. loadgen `net.txWritesPerSec` |
| `mmorpg_overload_active` | gauge | 과부하 신호(§4.1) 활성 1 / 정상 0 — 전이 때만 갱신. 1인 동안 IN_WORLD rate strike를 연결별 면제 예산 안에서 보류, `OVERLOAD_ADMISSION=1`이면 강한 증거(창 안 skip ≥ 문턱/2 또는 최근 무응답) 동안 신규 접속 거절(§10) |
| `mmorpg_overload_rejected_total` | counter | 과부하 접속 제한으로 accept 시 KICK 9 "server busy"를 보내고 닫은 연결 수(연결 회계 전 — `conn_rejected`와 별개). loadgen `net.overloadRejected` |

- 성능 4단계 신설(3단계 목록 뒤에 추가만, 같은 테스트가 고정). 월드 쪽 게이트웨이 IPC — ROLE=world에서만 값이 움직이고, 사건마다
  관측한 프로세스 하나만 센다(게이트웨이 쪽은 4.2c `mmorpg_gw_*`). 게이트웨이 경유 연결의 소켓 바이트·write(`net_tx_*`·`net_rx_bytes`)는
  게이트웨이가 센다 — 월드의 `net_packets_tx`는 세션 링크가 수락한 논리 패킷 그대로다. `mmorpg_tick_phase_ms`에는 `ipcFlush` 단계가 붙는다(§4.1):

| 메트릭 | 종류 | 의미 |
|--------|------|------|
| `mmorpg_ipc_peers` | gauge | HELLO를 마치고 아직 유실되지 않은 게이트웨이 피어 수 |
| `mmorpg_ipc_peer_lost_total{reason}` | counter | 월드가 정리한 게이트웨이 피어 — `peer`(상대가 끊음)·`bye`(BYE로 예고한 뒤 끊음 — 롤링 재시작, 4.3a)·`dead`(heartbeat)·`backpressure`(`IPC_MAX_PENDING_MB` 초과)·`error`·`replaced`(같은 `GATEWAY_ID` 새 HELLO)·`protocol`(IPC 위반·localId 재사용)·`closed`(월드 IPC 서버 종료). 그 피어 연결은 전부 배치 저장 1회로 종료 |
| `mmorpg_ipc_hello_rejected_total{reason}` | counter | 거절한 핸드셰이크 — HELLO_NACK을 보내는 `auth`(HELLO token ≠ `IPC_TOKEN`)·`fenced`(같은 `GATEWAY_ID`의 다른 incarnation이 등록돼 은퇴한 값)·`closed`(종료 중 — close() 뒤 받아들인 연결은 NACK 없이 즉시 끊는다)·`version`(ipcVer 불일치), NACK 없이 끊는 `protocol`(첫 메시지가 HELLO 아님·핸드셰이크 전 1 KiB 초과 봉투)·`timeout`(HELLO 데드라인)·`busy`(미완료 핸드셰이크 상한) |
| `mmorpg_ipc_stale_records_total{type}` | counter | 월드가 추적하지 않는 localId의 레코드를 무시한 수 — `frames`·`closed` |
| `mmorpg_ipc_rx_bytes_total` | counter | 게이트웨이에서 받은 IPC 바이트 |
| `mmorpg_ipc_tx_bytes_total` | counter | 게이트웨이 파이프로 넘긴 IPC 봉투 바이트(tick 끝·턴 끝·즉시 flush 임계) |

- 4.2c 게이트웨이 쪽(위 목록 뒤에 추가만) — ROLE=gateway에서만 값이 움직인다. 엣지 사건(소켓 바이트·write·size/rate 위반·rate 킥·
  idle/pre-auth 데드라인 킥 — `net_*`·`conn_rejected{idle|pre_auth_deadline}`)은 기존 메트릭을 게이트웨이가 센다(월드는 세지 않음).
  게이지는 inc/dec라 in-process 토폴로지 테스트(게이트웨이 여럿이 한 레지스트리)에서도 합이 맞다:

| 메트릭 | 종류 | 의미 |
|--------|------|------|
| `mmorpg_gw_connections` | gauge | 이 게이트웨이가 수용해 월드에 알린(CONN_OPEN) 아직 열린 클라 연결 수 |
| `mmorpg_gw_conn_rejected_total{reason}` | counter | CONN_OPEN 전에 게이트웨이가 거절한 연결 — `cap`(게이트웨이 상한, KICK 9)·`world_down`(핸드셰이크한 월드 없음, KICK 6) |
| `mmorpg_gw_conn_closed_total{reason}` | counter | 수용한 연결의 종료 — CONN_CLOSED 사유 `peer`·`idle`·`rate`·`size`·`backlog`·`error`·`gw_shutdown`·`world_requested`·`cap`·`legacy_framing`(구 v1 클라, B1), 그리고 CONN_CLOSED 사유가 아닌 `world_lost`(월드 링크 유실로 전원 KICK 6 — 월드에 아무것도 보내지 않음) |
| `mmorpg_gw_world_connected` | gauge | 핸드셰이크(HELLO_ACK)를 마친 월드 IPC 링크가 살아 있으면 1 |
| `mmorpg_gw_world_lost_total{reason}` | counter | 잃은 월드 링크 — `peer`·`shutdown`(월드가 SHUTDOWN을 보낸 뒤 끊김 — 예고된 월드 종료, 4.3a)·`dead`·`backpressure`·`error`·`protocol`·`local`(우아한 종료). 유실마다 전원 KICK 6 + 리스너 중지 |
| `mmorpg_gw_stale_records_total{type}` | counter | 게이트웨이가 더는 추적하지 않는 localId의 월드 레코드를 무시한 수 — `deliver`·`state`·`close`·`accepted`·`multicast`(4.5 F2 — MULTICAST 수신자마다) |
| `mmorpg_gw_ipc_rx_bytes_total` | counter | 월드에서 받은 IPC 바이트 |
| `mmorpg_gw_ipc_tx_bytes_total` | counter | 월드 파이프로 넘긴 IPC 바이트(턴 끝·즉시 flush 임계의 프레임 배치 + HELLO·PING·BYE·CONN_OPEN·CONN_CLOSED) |

- 4.3a 프로세스별 관측(위 목록 뒤에 추가만). 미전송 게이지는 scrape 시점 합(`registry.addCollector` — 한 프로세스의 월드 IPC 서버·게이트웨이
  코어 전부, 닫힌 것은 빠진다). 프로세스마다 자기 admin 포트로 본다(슈퍼바이저 배치: 월드 `ADMIN_PORT`, 게이트웨이 i = +i). loadgen
  `--admin-ports`가 게이트웨이 쪽을 모아 CPU·송출 비용을 집계한다:

| 메트릭 | 종류 | 의미 |
|--------|------|------|
| `mmorpg_ipc_pending_bytes` | gauge | (월드) 게이트웨이 파이프들의 미전송 IPC 바이트 합 — 피어마다 `IPC_MAX_PENDING_MB`를 넘으면 그 피어를 backpressure로 끊는다(여유 감시) |
| `mmorpg_gw_ipc_pending_bytes` | gauge | (게이트웨이) 월드 파이프의 미전송 IPC 바이트 — 월드가 못 읽으면 쌓인다 |
| `mmorpg_gw_deliver_batch_ms` | histogram | (게이트웨이) CONN_DELIVER 봉투 1개 처리 시간 — 그 tick·턴 배치의 연결별 소켓 write 전부. 게이트웨이 쪽 송출 비용(4.4 측정), 버킷 0.05 ms~250 ms |
| `mmorpg_gw_deliver_records_total` | counter | (게이트웨이) 적용한 연결별 전달 레코드 수 — CONN_DELIVER 레코드와 CONN_DELIVER_SHARED의 CONN·CONN_REF 레코드(4.5 F3). `/ mmorpg_gw_deliver_batch_ms_count` = 봉투당 팬아웃 |
| `mmorpg_gw_ipc_rtt_ms` | histogram | (게이트웨이) heartbeat PING → 같은 seq의 PONG 왕복 — 게이트웨이가 본 월드 이벤트 루프 응답성(늦은 PONG도 자기 seq로, 대기 기록 16개 상한), 버킷 0.25 ms~5 s |
| `mmorpg_gw_hello_refused_total{reason}` | counter | (게이트웨이, 4단계 리뷰 픽스) 월드가 HELLO_NACK으로 거절한 핸드셰이크 — `fenced`(상한 백오프 대기 — 중복 `GATEWAY_ID`를 멈춘 뒤 펜싱된 게이트웨이를 재기동, 스스로 풀리지 않는다)·`closed`(월드 종료 중 — 재시도)·`version`·`auth`(게이트웨이 종료) |

- 성능 4.5 F1 부하 기반 접속 제한(위 목록 뒤에 추가만, §3.4 끝). 게이트웨이 게이지는 inc/dec(in-process 합), 월드 피어별 게이지는 scrape 시점
  수집(`LabeledGauge` — 수집기가 비우고 살아 있는 피어만 다시 채운다, 사라진 피어는 시계열도 없다):

| 메트릭 | 종류 | 의미 |
|--------|------|------|
| `mmorpg_gw_admission_active` | gauge | (게이트웨이) 부하 접속 제한으로 새 클라를 CONN_OPEN 전에 KICK 9 "server busy"로 거절하는 동안 1 |
| `mmorpg_gw_admission_rejected_total{cause}` | counter | (게이트웨이) 그렇게 거절한 연결 — `world`(ADMISSION busy)·`cpu`·`lag`·`rtt`·`outbound`(거절 순간 가장 우선하는 뜨거운 신호, 없으면 제한을 건 신호) |
| `mmorpg_gw_event_loop_lag_ms` | gauge | (게이트웨이) 250 ms 표본 타이머 지연의 최근 1초 최대 — 접속 제한 lag 신호 |
| `mmorpg_ipc_peer_pending_bytes{gateway}` | gauge | (월드) 게이트웨이별 미전송 IPC 바이트(scrape 시점 — 합인 `mmorpg_ipc_pending_bytes`는 그대로) |
| `mmorpg_ipc_peer_admission_busy{gateway}` | gauge | (월드) 그 게이트웨이의 신규 접속을 거절 중이면 1(미전송 ≥ 소프트 임계, 해제 임계 이하가 hold 동안 이어지면 0) |
| `mmorpg_ipc_admission_rejected_total` | counter | (월드) 소프트 임계 위 피어의 CONN_OPEN을 세션 없이 KICK 9 "server busy"로 거절한 수 |

- 성능 4.5 F2 MULTICAST(위 목록 뒤에 추가만, §3.4 MULTICAST):

| 메트릭 | 종류 | 의미 |
|--------|------|------|
| `mmorpg_ipc_multicast_records_total` | counter | (월드) 게이트웨이 배치에 쓴 CONN_MULTICAST 레코드 — 팬아웃 프레임 1개 × 게이트웨이 1개(그 게이트웨이의 outbox 빈 수신자 2명 이상), 65,535명 초과는 나눈다 |
| `mmorpg_ipc_multicast_recipients_total` | counter | (월드) 그 레코드가 실은 클라 전달 수 — `/ records` = 레코드당 평균 팬아웃 |
| `mmorpg_ipc_multicast_saved_bytes_total` | counter | (월드) 수신자마다 프레임을 복사했을 때 대비 줄인 월드 → 게이트웨이 IPC 바이트: (수신자 − 레코드) × 프레임 − 6 × 레코드 − 4 × 수신자 |
| `mmorpg_gw_multicast_records_total` | counter | (게이트웨이) 적용한 CONN_MULTICAST 레코드 — 프레임을 레코드당 1회 복사해 수신 연결마다 미룬다(다음 DELIVER·CONN_FLUSH·종료·엣지 KICK에서 write — 연결당 창마다 1회) |
| `mmorpg_gw_multicast_recipients_total` | counter | (게이트웨이) 그 레코드가 나열한 수신 연결(stale localId 포함 — 그쪽은 `mmorpg_gw_stale_records_total{type="multicast"}`에도) |

- 성능 4.5 F3 공유 프레임(위 목록 뒤에 추가만, §3.4 공유 프레임):

| 메트릭 | 종류 | 의미 |
|--------|------|------|
| `mmorpg_ipc_shared_defs_total` | counter | (월드) CONN_DELIVER_SHARED 봉투에 쓴 DEF 레코드 — 공유 프레임 1개 × 게이트웨이 봉투 1개(봉투가 닫히면 다시 정의) |
| `mmorpg_ipc_shared_refs_total` | counter | (월드) 쓴 CONN_REF 레코드 — 공유 SNAPSHOT_DELTA를 복사 대신 참조 + u32 ackSeq로 보낸 클라 전달 수(피어에 혼자인 참조는 평문이라 안 센다) |
| `mmorpg_ipc_shared_saved_bytes_total` | counter | (월드) 봉투에 이미 있는 DEF를 재사용한 CONN_REF가 CONN_DELIVER 복사 대비 줄인 IPC 바이트: 재사용 참조마다 프레임 − 9(정의하는 참조는 평문보다 16바이트 크지만 빼지 않는다) |
| `mmorpg_gw_shared_defs_total` | counter | (게이트웨이) 받은 DEF 레코드 |
| `mmorpg_gw_shared_refs_total` | counter | (게이트웨이) 적용한 CONN_REF 레코드 — DEF를 그 연결의 u32로 제자리 패치해 쓴다(인라인·미룬 바이트가 없으면 복사 0). stale 제외 |
| `mmorpg_gw_deliver_assembled_bytes_total` | counter | (게이트웨이) 한 연결의 미룬 MULTICAST 프레임·인라인·패치한 공유 프레임을 write 1회로 보내려고 합치기 버퍼에 복사한 바이트 |

- 4.5 후속 점진 감축·채팅 속도(위 목록 뒤에 추가만, §3.4 끝·§10):

| 메트릭 | 종류 | 의미 |
|--------|------|------|
| `mmorpg_ipc_shed_sessions_total` | counter | (월드) 점진 감축으로 KICK 9 "server busy" + CONN_CLOSE를 보내고 즉시 정리한 인월드 세션(합계 — 게이트웨이 id·connId는 warn 로그) |
| `mmorpg_ipc_shed_events_total` | counter | (월드) 감축 스텝 수(1명 이상 줄인 평가). 감축 직후 `mmorpg_gw_stale_records_total{type="deliver"}`가 튀는 것은 정상 — 긴급 CONN_CLOSE가 앞지른 그 클라 앞 봉투 기록 |
| `mmorpg_chat_throttled_total` | counter | 발신자별 채팅 버킷(`CHAT_RATE_PER_SEC`·`CHAT_BURST`)을 넘어 버린 CHAT_SAY |
| `mmorpg_stat_op_throttled_total` | counter | 연결당 자유 포인트 버킷(`STAT_OP_RATE_PER_SEC`·`STAT_OP_BURST`)을 넘어 RATE_LIMITED로 응답한 STAT_ALLOCATE·STAT_RESET |

- 4.5 후속 스냅샷 꼬리 — GC 페이서(위 목록 뒤에 추가만, §4.1):

| 메트릭 | 종류 | 의미 |
|--------|------|------|
| `mmorpg_gc_paced_total` | counter | tick 루프가 tick 사이에 요청한 비동기 GC(`GC_PACE_TICKS`마다) — 할당 임계가 tick 안에서 차지 않게 |
| `mmorpg_gc_pace_deferred_total` | counter | 요청 차례였지만 이번 반복에 tick을 건너뛰었거나 다음 데드라인까지 유휴가 `GC_PACE_MIN_IDLE_MS` 미만이라 미룬 **반복** 수(고유 요청 수가 아니다 — 미룬 동안 반복마다 1, 지속 과부하면 초당 20). 계속 오르면 tick이 주기를 거의 다 쓰는 과부하 — 그 동안은 자연 GC다 |

- 이동 입력 검토 — MOVE_TO 연결당 속도 제한(위 목록 뒤에 추가만, §10):

| 메트릭 | 종류 | 의미 |
|--------|------|------|
| `mmorpg_move_to_throttle_total{outcome}` | counter | 연결당 MOVE_TO 버킷을 넘은 요청 — `deferred`(최신 보류로 들어감)·`coalesced`(보류가 더 새 요청으로 바뀜)·`released`(토큰이 생겨 보류를 처리)·`cancelled`(MOVE_STOP·키보드 이동·사망·존 전환·연결 종료, 또는 토큰이 회복돼 더 새 요청이 즉시 처리돼 보류 폐기). deferred = released + cancelled + 현재 보류 수. 해제는 tick당 최대 `MOVE_TO_DRAIN_MAX_PER_TICK`(256)건, 건마다 예외 격리(`mmorpg_router_handler_error_total{packet_id="0x0104"}`) |

- 이진 전환 H1 — SNAPSHOT_DELTA 분할(위 목록 뒤에 추가만, §3.3·protocol.md §2.4):

| 메트릭 | 종류 | 의미 |
|--------|------|------|
| `mmorpg_snapshot_delta_split_total` | counter | 원소 수가 스키마 max(5460)를 넘어 같은 `tickIndex`·`ackSeq` 프레임 여러 개로 나눈 SNAPSHOT_DELTA 페이로드 수(분할 1회 = 1) — 송신 프레임 body는 v2 헤더 len(u16) 안이어야 한다(이진 전환 H1). 시야 안 이동 엔티티가 5460을 넘는 극단 밀집에서만 오른다 |

- 이진 전환 B2c — 디코드 실패 strike(위 목록 뒤에 추가만, §10·protocol.md §2.3). 기존 `mmorpg_net_decode_error_total`에는 `reason` 라벨이 붙었다(위 목록):

| 메트릭 | 종류 | 의미 |
|--------|------|------|
| `mmorpg_net_decode_kick_total{state}` | counter | 사전 판정을 통과한 패킷의 디코드 실패가 `NET_DECODE_WINDOW_MS` 안에서 `NET_DECODE_STRIKES`를 넘어 KICK 5 "malformed packets"로 끊은 세션(킥 시점 로그인 상태별). ANON의 HELLO 디코드 실패는 KICK 1(`conn_rejected{reason="legacy_hello"}`)이라 세지 않는다. 디코드는 월드(monolith·world)에서만 — 게이트웨이 경유 연결도 월드가 센다 |

- 이진 전환 B4 — 송신 단위 인코드 실패 방어층(위 목록 뒤에 추가만, §3.3·protocol.md §2.9):

| 메트릭 | 종류 | 의미 |
|--------|------|------|
| `mmorpg_net_encode_error_total{packet_id}` | counter | 인코드할 수 없어 버린 송신 패킷 — 생성 인코더 거부(`WireEncodeError`: 정수 범위·비유한·string max·짝 없는 서로게이트·enum) 또는 프레임 body u16 초과(`FrameBodyTooLargeError` — 원시 프레임 경로의 헤더 용량 검사. 생성 인코더 경로에서는 닿지 않는다 — B6에 방어 겹으로 남김). 패킷당 1(팬아웃은 1회 인코딩). 그 패킷만 버리고 존 tick·핸들러는 계속된다. **0이 정상** — 오르면 상류 상한(로더·clamp)이 빠진 것이니 같은 packet id의 warn(`net.encode` "outbound packet dropped", `path` = 패킷.필드)을 본다. 인코딩은 월드(monolith·world)에서만 — 게이트웨이 경유 연결도 월드가 센다. loadgen 레벨 게이트 `noErrors`에 들어간다(`net.encodeErrors`) |

- 공유 포트 리스너 양보(IPC v14 — 위 목록 뒤에 추가만, §3.4·§9.7). 게이트웨이 게이지는 inc/dec(in-process 합):

| 메트릭 | 종류 | 의미 |
|--------|------|------|
| `mmorpg_gw_listen_yielded` | gauge | (게이트웨이) 월드 LISTEN yield로 클라 리스너가 내려가 있으면 1(접속 제한이 닫혔고 같은 공유 포트에 열린 리스너가 따로 있다 — 새 연결은 그쪽으로 간다). 재개 재시도 중에도 1 |
| `mmorpg_gw_listen_transitions_total{state}` | counter | (게이트웨이) LISTEN 지시로 한 리스너 `paused`·`resumed`(재바인드 성공만) — 월드 유실·SHUTDOWN의 중지는 세지 않는다 |
| `mmorpg_ipc_listen_directives_total{mode}` | counter | (월드) 보낸 LISTEN — `yield`(닫힌 게이트웨이가 공유 포트 그룹에서 빠짐 — 다른 멤버가 열린 리스너일 때만)·`listen`(되돌림 — 다시 열림·열린 리스너 소실·종료 드레인) |

- 생활 L-1 채집(위 목록 뒤에 추가만, §4.6·§10). 플래그 `LIFE_CONTENT`가 꺼져 있으면 둘 다 0이다:

| 메트릭 | 종류 | 의미 |
|--------|------|------|
| `mmorpg_life_op_throttled_total` | counter | 연결당 생활 버킷(`LIFE_OP_RATE_PER_SEC`·`LIFE_OP_BURST`)을 넘어 RATE로 거부한 GATHER_START(LIFE_CHANNEL)·CRAFT_REQ(CRAFT_ACK). LIFE_CANCEL은 이 버킷 밖이다 |

라벨 히스토그램은 `LabeledHistogram`(Prometheus 표준: `name_bucket{phase="…",le="…"}`·`name_sum{phase="…"}`·`name_count{phase="…"}`), 핫패스는 `labels()`로 핸들을 1회 바인딩해 `observe`만 부른다. 카운터 핫패스(송수신 바이트·패킷)도 같은 방식이다(성능 3단계 슬라이스 5): `Counter.bind(labels)` 핸들과 packet id별 핸들 캐시 `PacketIdCounter`(알려진 PACKET_ID별 핸들 + 미지 id 공용 핸들 1개).
`packet_id` 라벨 값은 `packetIdMetricLabel` — 알려진 id는 `0x0100` 표기, 미지 수신 id는 전부 `"unknown"` 하나로 접는다(3단계 리뷰:
종전엔 미지 id마다 시계열이 생겨 rx·router_unknown·decode_error·size_violation 메트릭당 최대 65,536개 — IN_WORLD 연결 1개가
약 11분이면 채우고 scrape가 정지 원인이 됐다). 미지 id 원값은 경고 로그의 `packetId`에 남는다. 샘플은 bind가 아니라 첫 증가 때 생기므로 노출 바이트·순서(첫 증가 순서)는 `inc(labels)`만 쓸 때와 같다. `packetIdLabel`도 알려진 id는 미리 만든 문자열을 돌려준다. scrape 시점 값은 `CallbackMetric`(read 예외 = `NaN` 노출). 수집 훅 예외는 격리(나머지 노출 정상)하고 `mmorpg_metrics_collector_error_total`로 센다.

`/admin/metrics`(localhost-only HTTP) 엔드포인트로 노출(Prometheus exposition). **기존 메트릭 이름/포맷 불변** — `tools/loadgen`이 스크레이핑해 성능 게이트로 쓴다.

**dev 전용 `GET /admin/perf`**(성능 2-A, `obs/perfEndpoint.ts`) — 히스토그램 버킷 보간이 아닌 tick 원자료. 성능 2-B loadgen(`tools/loadgen/serverPerf.ts`)이 의존하는 계약이므로 필드 이름·의미는 동결(추가만):

```jsonc
{
  "ticks": 600,            // 마지막 reset 이후 확정된 tick 수(링 길이와 무관)
  "windowMs": 30000.123,   // 마지막 reset 이후 벽시계 ms(최초 기준점 = 부팅 시 엔드포인트 생성)
  "durationsMs": [/* tick 처리 시간 — mmorpg_tick_duration_ms와 같은 값 */],
  "latenessMs":  [/* tick 시작 지연 — mmorpg_tick_lateness_ms와 같은 값 */],
  "phasesMs": { "applyInputs": [/*…*/], "cork": [/*…*/], "outcomes": [/*…*/] /* §4.1 단계, flush 제외 */ },
  "flushMs":  [/* withCork uncork(tick 송신 write) 시간 */],
  "cpu": { "userUs": 0, "systemUs": 0 },          // 마지막 reset 이후 process.cpuUsage 델타(µs)
  "memory": { "rss": 0, "heapUsed": 0, "heapTotal": 0 }, // process.memoryUsage 현재값(바이트)
  "connections": 0,        // 추적 중인 TCP 연결(미인증 포함)
  "entities": 0            // 전 존 살아있는 엔티티
}
```

- 링 배열은 마지막 4096 tick(≈204초), 오래된 것 → 최신 순, 모든 배열 길이 동일, µs 해상도 반올림.
- 쿼리(엄격 검증 — 모르는 키·중복·범위 밖은 부수효과 없이 400): `reset=0|1`(링·CPU·벽시계 기준점 리셋, **응답은 리셋 직전 상태** — 본문 직렬화까지 리셋 전에 끝내 이전 창의 응답 비용(~386 KB, ~3 ms)이 새 창의 첫 tick·`windowMs`에 섞이지 않는다), `gc=0|1`(샘플 전 `Bun.gc(true)`), `stall=1..30000`(이벤트 루프를 ms만큼 busy-wait로 붙잡은 뒤 응답 — 1단계 정지 처리 검증용, warn 로그 `admin perf: injecting event-loop stall`). 처리 순서: stall → gc → 샘플·직렬화 → reset. 게이트웨이 엔드포인트는 `GW_PERF_SIDE_EFFECTS=1`(카오스 C6만)일 때만 부수효과 쿼리(`reset=1`·`gc=1`·`stall`)를 받는다 — 기본은 그런 요청을 부수효과 없이 403, 읽기는 그대로(bind-only 신뢰에서 같은 호스트 프로세스가 정지 주입·연속 풀 GC로 게이트웨이를 붙잡아 지연·CPU 신호로 신규 접속을 잠그는 레버, 4.5 리뷰·검증). 월드는 종전 그대로(loadgen이 `reset`·`gc`를 쓴다).
- stall 쿨다운: 직전 stall이 끝난 뒤 그 길이만큼은 다음 stall을 `429`(JSON `{ok:false,error}` + `retry-after` 초)로 거부 — 연속 요청으로도 정지 비율 ≤ 50%. 같은 요청의 reset·gc도 실행하지 않는다. stall 없는 요청은 쿨다운과 무관.
- 보안: production은 배선(`serverTick.wireTickPerf`)이 엔드포인트를 만들지 않아 라우트가 없다(형제 미지 경로와 같은 기본 404 — 헤더 지문 없음, 링도 1칸). 주입되더라도 `production` 플래그면 같은 기본 404. 인증은 형제 라우트 공통(ADMIN_TOKEN 설정 시 Bearer, 미설정 시 127.0.0.1 bind-only). GET 부수효과라 브라우저 경유를 막는다 — 비 loopback `Origin`, `Sec-Fetch-Site`가 `same-origin`/`none` 외(cross-site·same-site), 비 loopback `Host`(DNS rebinding)는 403. 부수효과 쿼리(`reset=1`·`gc=1`·`stall`)는 Fetch Metadata(`Sec-Fetch-Site`/`Sec-Fetch-Mode`)를 실은 요청이면 403 — 메일·채팅 링크 클릭(최상위 내비게이션, `Sec-Fetch-Site: none`)과 동일 출처 페이지(`/admin/gm`) 경유까지 차단하고, 읽기 전용 GET만 브라우저 주소창에서 된다. CORS 헤더는 내지 않는다. curl·Bun `fetch`(loadgen)는 이 헤더를 보내지 않아 그대로 통과한다(추가 헤더 불요). GET 외 405, 응답 `cache-control: no-store`.
- 엔드포인트 미주입(production·테스트 하네스·`zz-loadgen-smoke`) = 기본 404 — 2-B loadgen은 이때 `/admin/metrics` 버킷 델타(+Linux `/proc` CPU)로 폴백한다.

### 9.7 프로세스별 관측 (클러스터 — 성능 4단계)

원칙: **사건은 관측한 프로세스 하나만 센다.** 프로세스마다 자기 admin 포트·로그·메트릭이 있고, 합은 수집 쪽(loadgen `--admin-ports`,
Prometheus)이 낸다. 운영 절차는 [`ops-cluster.md`](ops-cluster.md) §2·§5.

| 프로세스 | 로그 `proc` / 파일 접두어 | admin(슈퍼바이저 배치) | 라우트 | 세는 것 |
|---|---|---|---|---|
| monolith | 없음(레코드 바이트 불변) / `server` | `ADMIN_PORT` | metrics·healthz·logs·gm·perf(dev) | 전부 |
| world | `world` / `world` | `ADMIN_PORT` | metrics·healthz·logs·gm·perf(dev) | tick·게임·영속, 연결 상한·미인증 몫·과부하 접속 거절(`conn_rejected{global_cap…}`·`overload_rejected`), 소프트 임계 위 피어의 CONN_OPEN 거절(`ipc_admission_rejected`), 논리 패킷 `net_packets_tx`, 수신 사전 판정·디코드(`router_unknown_packet`·`router_state_rejected`·`net_packets_rx`·`net_decode_error`·`net_decode_kick` — B2c), 송신 인코드 드롭(`net_encode_error` — B4, 방어층이 월드의 세션·팬아웃 송신에 있다), IPC(`mmorpg_ipc_*`) |
| gateway i | `gw<i>` / `gw<i>` | `ADMIN_PORT`+i | metrics·healthz·logs·perf(dev — tick 링 없이 CPU·메모리·연결 수, `reset`·`gc`·`stall` 부수효과는 `GW_PERF_SIDE_EFFECTS=1`일 때만 — 4.5 카오스 C6), GM 없음 | 소켓 엣지 사건 — `net_*` 바이트·write·size/rate 위반·rate 킥, 부하 접속 제한 거절(`gw_admission_rejected{cause}`), `conn_rejected{idle\|pre_auth_deadline}`, `mmorpg_gw_*`. 송신 인코드 드롭(`net_encode_error`)은 세지 않는다 — 인코딩은 월드가 하고 게이트웨이는 완성 프레임만 나른다 |
| 슈퍼바이저 | `launch` / — | 없음 | — | 수명주기 로그(`process started`·`process exited — restarting`·`cluster ready`·`cluster stopped`) |

- `/admin/healthz`는 liveness다. 게이트웨이의 준비(월드 핸드셰이크 완료·클라 포트 열림)는 `mmorpg_gw_world_connected 1`로 본다
  (슈퍼바이저의 기동 판정도 같다). 공유 포트에서 `mmorpg_gw_listen_yielded 1`인 게이트웨이는 준비된 채 리스너만 내려가 있다(IPC v14 리스너
  양보 — 접속 제한이 닫혀 새 연결을 같은 포트의 다른 게이트웨이에 넘기는 중, §3.4). 월드 쪽 지시 수는 `mmorpg_ipc_listen_directives_total{mode}`.
- 월드의 tick 단계에는 `ipcFlush`가 붙고, ROLE=world의 `flush`는 소켓 write가 아니라 IPC 프레이밍(피어 배치에 프레임 쓰기)이다(§3.4).
  `/admin/perf`의 `flushMs`도 같은 뜻이다.
- 프로세스 게이지(`mmorpg_process_cpu_*`·`_rss_bytes`·`_heap_used_bytes`)는 프로세스마다 따로다. 미전송 게이지
  (`mmorpg_ipc_pending_bytes`·`mmorpg_gw_ipc_pending_bytes`)는 scrape 시점에 그 프로세스 안의 IPC 서버·코어를 합한다.
- 로그: `proc` 필드는 `setProcTag`(monolith는 미부착), 파일 접두어는 `PROC_NAME` — 같은 `LOG_DIR`에서 보존 정리가 서로의 파일을
  지우지 않는다(§9.2). `/admin/logs`는 프로세스마다 자기 링만 보여 준다.
- loadgen: `--admin-ports`가 게이트웨이 `/admin/metrics`를 hold 전후로 받아, 소켓 카운터는 프로세스 합의 델타로, 게이트웨이별 CPU·
  송출(`mmorpg_gw_deliver_batch_ms`)·DELIVER 팬아웃·IPC RTT와 월드 IPC 바이트/tick은 `level-*.json` `cluster`와 summary
  `## cluster`·`## gateways` 표로 낸다(§11.4).

---

## 10. 보안·악용 방지

> **발췌본에서 생략** — 악용 방지 설계와 남은 과제는 공개 범위에서 뺐습니다.

## 11. 테스트 전략

### 11.1 단위
- `bun test` — 코덱 round-trip, AOI grid 인덱스, 입력 큐 정렬, repo SQL.

### 11.2 결정론 회귀
- 시드 + 사전 정의된 `INPUT_CMD` 시퀀스를 zone에 주입 → 1000 tick 후 스냅샷 해시가 골든 파일과 일치해야.
- 와이어 특성화(`tests/regression/wireCharacterization.test.ts`, 성능 3단계) — 실물 배선 결정론 시나리오 1,300 tick의 세션별 클라 수신
  바이트 SHA-256 + tick별 상태 해시 골든. 같은 시나리오를 gateway-inproc(`helpers/wireTransport` — 클라 캡처 소켓 ↔ `GatewayCore` 엣지
  ↔ `MemoryPipe` IPC ↔ `WorldIpcServer` ↔ 월드 세션, tick에 ipcFlush)로도 돌려 monolith와 바이트·상태가 같음을 고정한다(성능 4단계
  4.5 안전망 — 게이트웨이 1개, 그리고 2개 + 봉투 분할·tick 중간 flush·시드 고정 청크 분할, MULTICAST 끔 한 가지, 공유 프레임(4.5 F3)
  끔 한 가지 — 켬은 MULTICAST 레코드·CONN_REF를 실제로 썼는지도 단정). 하니스 존은 DELTA 묶음 하한 0으로 전원을 묶는다(monolith 골든도 묶음
  경로로 같은 바이트). IPC 레코드 형태(DELIVER, MULTICAST, CONN_DELIVER_SHARED)나
  배치가 클라가 보는 바이트·연결별 순서를 바꾸면 깨지고, 실패 메시지가 처음 갈라진 세션·프레임을 짚는다. settle은 IPC가 조용해질
  때까지 턴을 돌아(시간 무관) 모든 동작의 효과가 다음 tick 전에 닿는다.
- S2C 본문 특성화(`tests/regression/s2cBodyCharacterization.test.ts`, 이진 전환 B5-0) — B5 대상 S2C 13개(CHAR_LIST + 자율 형식 12개:
  캐릭터 시트·레벨업·포탈·인벤 목록/갱신·상점·스킬·UI 설정·NPC 대화·퀘스트 목록/ACK/마커) 중 위 시나리오가 보지 않는 9개 id와 일부 사례만
  보는 4개 id(0x0019·0x0302·0x0444·0x0445)를 실물 핸들러·빌더·shared/data·in-memory DB로 결정론 직접 호출(TCP·tick 없음, 세션 링크 = 캡처
  소켓)해 패킷 id별 프레임 수·정규화 페이로드 해시(semantic)·실제 본문 바이트 해시(body)를 고정한다. 단계형 이진 전환의 허용 변경(JSON 상태
  스키마화 = 그 id semantic, flip = 그 id body, 형태 변경 = B5①b CHAR_LIST의 semantic + body — B5①b로 13개 전부 바이너리)은 머리 주석이 정본이다. 실물 데이터를 실으므로 콘텐츠 편집(예: 스킬 추가 = 0x0421)도 그
  콘텐츠를 싣는 id를 바꾼다 — 파일 단위 `--update-snapshots` 전에 바뀐 id를 확인한다(`docs/skill-vfx-playbook.md` §1).

### 11.3 통합
- `tests/integration/` — 실제 Bun 서버를 spawn, raw TCP 클라이언트로 시나리오 재생(login → enter → move 100회 → logout).

### 11.4 부하
- `tools/loadgen/` — 가상 클라이언트 부하 도구(성능 2-B). 시나리오 `stock`(한 지점 랜덤 이동, 스모크 기본)·`spread`(`PERF_SPAWN_SPREAD`)·`realistic`(클라와 같은 20 Hz idle 입력+1 Hz PING에 배회·사냥·스킬·줍기·채팅·포탈·NPC·부활 상태기계)·`login-storm`. 멀티프로세스 shard + 오케스트레이터(`orchestrate.ts`, `--spawn-server`로 레벨마다 새 서버), hold 윈도우 집계, 클라 측 지연(PING RTT·MOVE_TO→MOVE_PATH·SKILL_CAST→ACK). 밀도는 `genSpawns.ts` → `MONSTER_DATA_FILE`. 사용법 `tools/loadgen/README.md`, 결과 `docs/perf-baseline.md`.
- 서버 측 측정 손잡이(성능 2-A, dev 전용):
  - `GET /admin/perf`(§9.6) — tick·단계·flush 원자료 링, reset 이후 CPU 델타, `?stall=`로 정지 주입.
  - env `PERF_SPAWN_SPREAD=<타일>` — ENTER_WORLD 때 존 스폰 ±N 타일 상자 안 walkable 셀 중앙에 배치
    (`world/perfSpawnSpread.ts`: 존 경계·NavGrid로 clamp, charId 정수 해시(murmur3 fmix32)로 결정론, 해시 후보
    32회 실패 시 상자 선형 탐사, 상자가 전부 막히면 존 스폰). 저장 위치를 덮어쓰므로 production에서 > 0이면 부팅
    거부(`assertEnvGuards`), index.ts도 production이면 0을 주입. 포탈 존 이동은 대상 아님(ENTER_WORLD만).
  - env `MONSTER_DATA_FILE=<경로>` — `shared/data/monsters.json` 대신 읽을 몬스터 정의·스폰 파일(몬스터 밀도 측정,
    `tools/loadgen/genSpawns.ts` 출력). 상대경로는 레포 루트 기준(`config/paths.ts repoPath`), 같은 zod 검증
    (`parseMonsterData`)과 부팅 참조 무결성(`assertReferentialIntegrity` — 드롭·퀘스트 kill 목표가 참조하는 def,
    스폰·NPC 배치의 zoneId 존재 필수)을 거치며 실패 시 부팅 거부. 사용 시 부팅 warn 로그로 경로를 남긴다. 측정용
    밀도 파일이 운영 월드의 스폰·EXP·드롭 경제를 바꾸지 않도록 production에서 설정하면 부팅 거부(`assertEnvGuards`),
    index.ts도 production이면 무시. 막힌 nav 셀 위 스폰(맵 밖 좌표 포함 — 맵 밖은 막힌 셀)은 운영 데이터와 같이 부팅
    거부다(`ZoneRegistry.spawnInitialMonsters` — genSpawns는 빈 셀 중심만 쓴다).
- 게이트웨이 구성 측정(성능 4단계 4.3a): `--spawn-cluster N`(레벨마다 슈퍼바이저로 월드 + 게이트웨이 N — 배치는 `launchPlan` 그대로,
  Bun IPC 종료 메시지로 월드 먼저 내림), `--ports a,b`(클라를 게이트웨이 포트에 라운드로빈), `--admin-ports a,b`(게이트웨이
  `/admin/metrics` 집계 — 소켓 사건은 게이트웨이가 세므로 망·위반 카운터는 프로세스 합, 게이트웨이별 CPU·송출·DELIVER·RTT와 월드
  IPC 바이트/tick은 `level-*.json` `cluster`·summary `## cluster`/`## gateways`). 상세 `tools/loadgen/README.md`.

---

## 12. 비목표 (스코프 밖)

- 마이크로서비스/멀티 노드: 한 호스트의 월드 1 + 게이트웨이 N(§1.1, ADR 0002)까지만 한다. 멀티 월드 샤딩·채널·멀티 호스트 IPC는
  사양과 도입 트리거만 있다(ADR 0002 §7 — 4.5 재측정 기준 월드 tick이 N=2 ≈1,159에서 한계이고 남은 몫은 스냅샷 단계, 스냅샷 꼬리·SPAWN
  공유 뒤 재평가).
- WebSocket 클라이언트: TCP만. 브라우저 클라이언트 필요해지면 `net/wsGateway.ts` 추가.
- TLS: 프로덕션 시점에 reverse proxy(haproxy/nginx)로 종단. 게임 서버 자체는 평문 TCP(§10.1). 게이트웨이 구성에서는 게이트웨이가
  자연스러운 종단 위치다(보류 항목 — ADR 0002 §7).
- 길드/오픈 월드 PvP/거래소: 핵심 루프(이동·전투·채팅·인벤) 안정화 이후.

---

## 13. 마이그레이션 요약

상세는 [migration-plan.md](./migration-plan.md). 6단계 phase로 v1 → v2:
1. 코드젠 + shared 스키마 도입 (코드 변동 최소, 형식 호환 유지)
2. RingBuffer 도입(서버·클라 양쪽), `Buffer.concat`/`List<byte>` 폐기
3. tick 루프 + inputQueue + movementSystem로 핸들러 권위 이전
4. AOI + SnapshotBuilder, 브로드캐스트 폐지
5. 영속성 + 인증 상태머신
6. 클라이언트 예측·재조정·보간

각 phase는 단독 PR로 머지 가능. 모든 phase는 v2 프로토콜 위에서 v1 기능 패리티를 유지하며 진행.

**성능 로드맵(2026-10, Bun 유지 경로 — C++ 전면 이전 기각):** 1단계 안정성(자동저장 배치·rate strike·연결 상한·송신 백프레셔) →
2단계 측정 인프라·Windows/Linux 재측정 → 3단계 Bun 최적화(세션별 와이어 바이트 불변) → 4단계 게이트웨이 분리(opt-in, §1.1).
단계별 수치는 [`perf-baseline.md`](perf-baseline.md), 4단계 결정은 [ADR 0002](adr/0002-gateway-split.md).

---

## 14. 변경 시 본 문서 갱신 의무

- 새 패킷 추가 → §3.2 표 + `shared/protocol.md` 갱신.
- 새 시스템 추가 → §4.4의 ECS 컴포넌트/시스템 목록 갱신.
- 새 DB 컬럼 추가 → §6.2 + 마이그레이션 파일.
- ADR이 필요한 결정(예: TCP→QUIC 전환) → `docs/adr/NNNN-title.md`로 기록.
