# ADR 0002 — 게이트웨이 분리 (월드 1 + 게이트웨이 N)

- 상태: **채택 — 구현 완료, opt-in, 합격선 통과.** 기본 모드는 계속 `ROLE=monolith`(한 프로세스)다. 구현은 성능 4단계 4.1–4.3b
  (`05c6da3`…`f7b124d`)와 리뷰 픽스 `8ec398a`·`40d2b67`이다. 4.4 측정(`40d2b67`)은 합격선을 근소하게 미달했다(1.54배, 목표 1.6배).
  4.5 후속(`3538698`…`886f9dd` — 부하 기반 접속 제한·MULTICAST·SNAPSHOT_DELTA 공유 프레임, IPC v3–v5)의 재측정(`886f9dd`)은
  **1.71배로 통과**했다(§4.2).
- 날짜: 설계 승인 2026-10-06, 기록 2026-10-07(4.5 재측정 갱신 같은 날), 2026-10-15 §5.1 리스너 양보·클라 자동 재접속 완료(§4.4·§7) 반영
- 관련: [ADR 0001](0001-single-process-monolith.md)(단일 프로세스 규율 — 이 ADR은 그 위에 엣지만 뗀다) ·
  [ADR 0004](0004-client-auto-reconnect.md)(클라 자동 재접속 — §7 보류 항목이 거기서 끝났다) ·
  [`architecture.md`](../architecture.md) §1.1(역할)·§3.4(IPC)·§9.7(프로세스별 관측) · [`ops-cluster.md`](../ops-cluster.md)(운영) ·
  [`perf-baseline.md`](../perf-baseline.md) "성능 4단계"(측정 원표)

## 1. 맥락

**측정으로 확인된 병목**(i7-8700K 6C/12T, Windows 11 + 같은 호스트의 WSL2, 루프백):

| 시점 | spread 수용 CCU (p99 ≤ 25 ms) | 지배 비용 |
|---|---|---|
| 선행 연구(`final.md` §2.2, Windows) | ≈670 | 소켓 send가 분산 tick의 53–57%. 언어를 바꿔도 send는 ≈1.1배 |
| 성능 2-C(1단계 후·최적화 전) | 340 (W) / 375 (L) | 스냅샷 JS + send |
| 성능 3단계 후 | ≈745 (W) / ≈750 (L) | 새 임계점에서 tick당 소켓 send(uncork)가 tick 평균의 **56–67%**. 소켓당 W 14–21 µs, L 21–26 µs(부하 생성기 shard 3개 이상). 메인 스레드는 ≈1코어에서 포화하고 그중 sys가 절반 |

- 3단계 §13의 계산: flush가 월드에서 빠지면 월드 tick 평균은 W spread 1250 ≈15.0 ms, L spread 1250 ≈15.4 ms, W stock 1000
  ≈14.4 ms, W realistic 1000 ≈10.4 ms에 IPC 비용을 더한 값이다. 합격선 1.6배(spread ≈1,190명, p99 ≤ 25 ms)를 지키려면
  p99/평균 1.36을 가정한 평균 예산이 ≈18.4 ms이고, IPC 몫은 tick당 ≈3.4 ms다. 세션당으로는 **≈2.7 µs**이며, 이는 당시
  소켓당 send(18.4 µs)의 15% 이내다.
- 게이트웨이로 풀리지 않는 것: 밀집(stock)은 스냅샷 출력 자체가 ≈N^1.9로 늘고, 1 GbE NIC에서는 700–800명에서 대역폭이 먼저
  한계다. realistic의 tick 밖 sys(MOVE_PATH 팬아웃)는 일부만 게이트웨이로 옮겨진다.
- **4.0 기술 검증(WSL2, 판정: 진행)**
  - `Bun.listen({reusePort})`의 연결 분산 최악 편차는 게이트웨이 2개 ±6%, 4개 ±8%였다.
  - Windows는 `SO_REUSEPORT`로 두 리스너가 모두 bind되지만 연결은 첫 리스너만 받는다(2000/0). 그래서 Windows는 게이트웨이마다
    포트를 따로 쓴다.
  - Windows named pipe는 Bun/libuv가 내부 큐잉해 write가 항상 전량 수락된다. 대기 상한이 무력화되므로 `pipe:` 주소는 받지 않는다.
  - IPC 송출량은 stock 1000 ≈10.7 MB/tick, realistic 1000 ≈3.5 MB/tick이었다.
  - **D1 — 루프백 측정 편향**: WSL에서 프로세스 하나가 소켓 2000개(각 200 B)에 보낼 때, 수신 측 부하 생성기가 살아서 idle이면
    17.4 µs/소켓, SIGSTOP으로 멈춰 wake-up이 없으면 3.7 µs/소켓이다(N=4000은 14.9 → 4.4). 느린 송신자가 idle vCPU마다 Hyper-V
    wake-up 인터럽트를 무는 쌍안정 현상이다. 네이티브 Windows는 두 모양 모두 13–17 µs라 이 현상이 없다. 원격 클라에는 이 비용이
    없으므로, 실제 하드웨어에서 monolith의 spread 1250 send 몫은 3단계가 잰 28 ms가 아니라 ≈5 ms/tick일 가능성이 크다.

## 2. 결정

**설계 (i)를 채택한다.** 월드 프로세스 1개가 지금 서버가 하는 일을 전부 맡고, 얇은 게이트웨이 프로세스 N개가 클라 소켓을 맡는다.
클라 변경과 와이어 변경은 0이다.

| 프로세스 | 맡는 일 | 갖지 않는 것 |
|---|---|---|
| 게이트웨이 ×N (`ROLE=gateway`) | accept(Linux는 `reusePort` 공유 포트, Windows는 게이트웨이별 포트), NoDelay, 프레이밍·size 화이트리스트, 토큰 버킷 rate·strike·명령 예약분, idle·pre-auth 데드라인(월드 로그인 상태 미러), 게이트웨이 연결 상한, 원시 프레임을 월드로 전달, tick·턴 배치를 로컬 `OutboundLink`로 소켓에 쓰기(백프레셔), 자기 admin(metrics·healthz·logs) | 게임 상태, DB(import 가드 + `initDb` 역할 가드), GM 라우트 |
| 월드 ×1 (`ROLE=world`) | 모든 핸들러(HELLO·AUTH·`claimAccount` 포함), 존·20 Hz tick, DB 단일 writer, GM, 연결 상한·미인증 몫·과부하 접속 제한(실제 클라 IP 기준). 클라 연결마다 `PlayerSession`이 있고, 그 송신은 `RemoteClientLink`(IPC)로 나간다 | 클라 소켓(기본 — `WORLD_CLIENT_LISTEN=1`일 때만 직접 접속) |
| monolith (`ROLE=monolith`, 기본) | 종전 경로 그대로. 엣지 정책은 게이트웨이와 같은 코드(`network/clientEdge.ts`)라 모드 사이에 정책이 갈라지지 않는다(패리티 테스트) | — |

**불변식**
1. 게이트웨이마다 IPC 스트림 하나(FIFO)를 둔다. 결정은 월드에서만 직렬화된다.
2. 클라 연결 하나는 일생 동안 정확히 한 쌍(게이트웨이 incarnation, 월드 incarnation)에 속한다. 연결은 새 월드로 이월하지 않는다.
3. 연결별 STATE/DELIVER/CLOSE 순서는 월드 발행 순서와 같다. 로그인 상태 전이는 클라를 다음 단계로 보내는 응답보다 먼저 나간다.
   그래서 게이트웨이는 클라가 INPUT_CMD를 보내기 전에 IN_WORLD rate 한도로 바꿔 둔다.

**왜 월드를 하나로 두나**: 중복 로그인 인과(`claimAccount`는 월드 전역 `byAccount` 위의 동기 check-and-swap이고, 선점은
flush ≺ AUTH_RESULT ≺ 로드), 존 이동의 in-memory 동기 핸드오프, GM, DB 단일 writer가 모두 월드 안에 남는다. 그래서 기존
불변식이 구조적으로 그대로 성립하고, 핸들러·zone·autoSave·`transferPlayer`·`preemptSession`·sim/·world/는 바뀌지 않았다.
send 수용량은 존 수가 아니라 게이트웨이 수에 비례한다.

## 3. 기각한 대안

| 대안 | 기각 이유(수치) |
|---|---|
| **(ii) 클라 리다이렉트 / 존별 프로세스** | 존이 3개뿐이다(Town 64×64, Field 128×128, Village 64×64 — NPC 전용, 몬스터 없음). 측정한 spread·stock 부하는 전원 Town에 있어서(spread는 Town 64×64로 클램프) 존을 나눠도 그 부하의 이득은 0이다. Town 허브 인구가 상한을 정한다. 클라 재접속 흐름(클라 변경)이 필요하고, 중복 로그인·GM·존 채팅이 프로세스를 가로지른다. 선행 연구의 "존별 5프로세스로 머신당 ≈5,000–5,500 CCU"[외삽]는 월드가 존 단위로 쪼개질 때만 성립한다 |
| **(iii) 존마다 Bun Worker** | send는 여전히 메인 스레드가 전부 한다. 새 임계점에서 send가 tick의 56–67%라 시뮬을 떼어 내도 줄일 수 있는 몫은 나머지 33–44%뿐이다[계산]. Bun Worker는 실험 단계이고, 존 간 상태를 쪼개는 작업량은 (ii)와 같다 |
| **C++ 전면 재작성** | 선행 연구(`final.md` §1·§7): C++ DoD가 Bun 최적화보다 앞서는 몫은 분산 1,250에서 ≈1.1–1.2배, 밀집 400에서 ≈1.05–1.5배다. 지배 비용인 send는 언어를 바꿔도 ≈1.1배다. 공수는 숙련자 30–55 인주 / AI 보조 20–37 인주이고, 이는 단일 스레드 이식 기준이다(멀티스레드 I/O 재설계는 별도). 기능 개발이 5–13개월 멈춘다. 500/2,000/5,000 CCU에서 Bun 최적화 대비 월 컴퓨트 절감은 $0–74라 회수가 사실상 불가능하다. send만 겨냥하는 변형(네이티브 I/O 게이트웨이, B2)은 보류 항목으로 남긴다(§7) |
| (보조) 앞단 L4 프록시(nginx stream·HAProxy)로 다중 게이트웨이 | 4.0에서 reusePort에 결함이 나오면 쓸 대안이었다. Linux는 reusePort로 충분해서 필요 없다. Windows에서 포트 하나로 노출하려면 여전히 이 방법이 필요하고, 그때는 실제 클라 IP를 넘길 PROXY protocol이 함께 필요하다(§7) |

## 4. 결과

### 4.1 측정 (4.4, WSL2 핀 고정 — 원표 `perf-baseline.md` "성능 4단계")

- **spread 1.6배 합격선: 미달(근소).** N=2 ≈1,101 CCU / monolith ≈716 = **1.54배**. 1.6배에는 ≈1,146이 필요했지만 1150은
  3회 모두 실패했다(27.2–27.4 ms). 계산 방식에 따라 1.50–1.57배이고, 3단계의 핀 미고정 monolith(≈750) 대비로는 1.47배다.
- **게이트웨이 사용률: 통과.** 1100–1150에서 게이트웨이 메인 스레드는 0.41–0.44코어, 프로세스 전체는 0.44–0.48코어다(한도 0.6).
- **한계는 월드 tick이다.** N=2/1100의 평균 tick은 16.9 ms다. 스냅샷 11.9, IPC 프레이밍 3.1, ipcFlush 0.3, applyInputs 0.8,
  나머지 0.75 ms. p99/평균이 1.45–1.6배로 monolith(1.25–1.33배)보다 뾰족하다. 원인은 스냅샷 단계다(평균 11.9 ms, p99 18–19 ms).
- **월드 IPC 비용이 예산을 넘는다**: 1100–1250에서 세션·tick당 3.0–3.4 µs(IPC 1 MB당 ≈0.62–0.65 ms)로, 예산 ≤ 2.7 µs를 넘는다.
  tick의 18–20%다.
- **게이트웨이를 늘리면 월드가 느려진다**: stock 1000(10.7 MB/tick)에서 N=1–4의 IPC 프레이밍은 3.3/4.7/5.8/6.2 ms,
  ipcFlush는 0.01/0.12/0.45/0.93 ms다. 그래서 N=3(≈1,062)과 N=4(≈1,065)가 N=2보다 먼저 교차한다.
- 클러스터 구성은 p99 45 ms에서도 1500까지 20 Hz를 지켰다. monolith는 1250에서 16.92 Hz로 떨어졌다. spread 1000의 전달 분산
  (같은 tickIndex의 프로브 간 도착 편차) p50은 monolith 19.8 ms, N=1 21.6 ms에서 N=2/3/4는 7.3/4.1/3.4 ms로 줄었다.
- realistic(≈802 → N=2 ≈972)은 월드 CPU가 한계이고(모든 구성에서 1250에 메인 스레드 ≈1.0코어), 부하 생성기 편향이 있어
  참고치다. stock은 N=1이 가장 좋다(≈662 → ≈1,018).
- 해석상 주의(추론, 미측정): D1 편향 탓에 monolith의 send 몫이 루프백에서 부풀어 있다. 클러스터 쪽 한계(월드 스냅샷 + IPC
  프레이밍)는 NIC와 무관하므로, 실제 NIC에서의 배율은 1.54배보다 작을 가능성이 크다.

### 4.2 재측정 (4.5 — 접속 제한·MULTICAST·DELTA 공유 후, 원표 `perf-baseline.md` "성능 4.5")

4.4와 같은 방법(WSL2 핀 고정·프로브·조인·샤드·hold), 커밋 `886f9dd`. 4.4가 남긴 두 결함 — 합격선 근소 미달(월드 IPC 프레이밍이 tick의
18–20%)과 포화 게이트웨이의 통째 끊김 — 에 대한 4.5 후속의 결과다.

- **spread 1.6배 합격선: 통과.** 같은 세션에서 N=2 ≈1,159 / monolith ≈678 = **1.71배**다. 4.4 monolith(≈716)를 기준으로 잡아도
  1.62배다. 세는 방식을 바꿔도 1.6배 이상이다(과반 런 ≤ 25 ms 레벨 1150 / 650 = 1.77배, 모든 런 ≤ 25 ms 레벨 1100 / 650 = 1.69배).
- **게이트웨이 사용률: 통과.** N=2 1150–1200에서 메인 스레드 0.39–0.47코어, 프로세스 0.42–0.51코어 — 4.4와 같다. 게이트웨이가 합치려고
  복사하는 양(게이트웨이당 2.5–3.2 MB/tick)이 월드에서 옮겨 왔지만 CPU는 늘지 않았다.
- **월드 IPC 비용이 예산 안으로 들어왔다.** 세션·tick당 3.0–3.4 → 1.52–1.57 µs(예산 ≤ 2.7). IPC 바이트는 spread −84%, stock −99%,
  realistic −80~82%이고, 절감 대부분은 공유 프레임(spread 83–85%, realistic 65–68%)이다. MULTICAST 몫은 realistic 14–15%, spread 0.1%다.
  IPC 프레이밍은 spread N=2에서 −53~57%(1150: 3.49 → 1.52 ms), tick 비중은 20% → 12%다 — 트리거(10%)보다 아직 높다. 1 MB당 비용은
  0.62 → ≈1.9 ms로 올랐다(남은 비용은 연결당 레코드 고정비).
- **N=2 월드 tick 평균 −15~19%, p99는 −6~11%(1100–1200).** 1150: 평균 18.37 → 14.87, p99 27.31 → 24.48 ms. 스냅샷 평균은 −8~12%지만 p99는 그대로라
  (1150: 19.09 → 19.37 ms) tick p99/평균이 1.48 → 1.65로 날카로워졌다. 가장 느린 1% tick의 초과분은 대부분 스냅샷 단계(+8~14 ms)다 —
  **다음 한계는 스냅샷 꼬리다**(§7).
- **monolith 교차점은 716 → 678로 내려갔다.** 평균은 빨라졌지만(700: −3%, F3의 DELTA 묶음이 monolith에도 적용) p99가 1–2 ms 올랐다.
  런 간 편차(700에서 23.3–28.3 ms)와 겹쳐 회귀로 단정하지는 않는다. 그래서 배율은 두 기준(같은 세션 1.71배, 4.4 monolith 1.62배)을 다 적는다.
- **포화한 게이트웨이가 끊기지 않는다.** 게이트웨이 1개 spread 1500·2000은 전원 접속·kick 0이다(4.4 1500은 미전송 256 MiB 초과로 끊겨
  전원 KICK 6). 2500은 월드 tick 과부하 판정이 172명을, 3000은 게이트웨이 CPU 접속 제한이 879명을 KICK 9 "server busy"로 돌려보냈다.
  모든 런에서 월드 소프트 임계 거절·IPC 피어 유실·부하 클라 KICK 6이 0이다 — 게이트웨이 1개 spread 2000의 hold 끝 미전송은 0.96 MB로
  소프트 임계(64 MiB)에 한참 못 미쳤고, 실제 거절은 게이트웨이 CPU 신호(문턱 90%, 닫힐 때 91.1–91.5%)와 월드 tick 과부하가 맡았다.
- 그 밖에: stock N=2 ≈950 → ≈1,176, realistic N=2 ≈972 → ≈924(1회, 부하 생성기 한계 — 판정에서 뺌), N=3·N=4는 1250에서 이미 25 ms를
  넘어(39.1 / 32.7 — 1회) 교차점을 정하지 못했다. Windows 기능 검증(realistic 500)은 통과했고 IPC는 1,088 → 241 KB/tick이다.
- 4.4의 해석상 주의(D1 루프백 편향 — 실제 NIC에서는 배율이 더 작을 가능성)는 그대로다.

### 4.3 얻은 것

- 송신과 엣지 정책이 월드 메인 스레드에서 빠졌다. spread에서 같은 CCU의 월드 tick이 크게 줄었고(1000: p99 43.8 → 20.5 ms, N=2),
  20 Hz를 지키는 상한이 1000(monolith — 1250에서 16.92 Hz)에서 1500(N=2 — 2000에서 17.14 Hz)으로 올랐다.
- 클라·와이어 변경이 0이다. monolith 동작과 세션별 바이트도 불변이다(`wireCharacterization` 골든 불변, 기존 테스트 무수정).
- DB writer는 계속 하나다. 중복 로그인 인과, 존 이동, GM이 그대로 성립한다. 카오스 C1–C5가 게이트웨이·월드 SIGKILL,
  게이트웨이 SIGSTOP, 중복 로그인 경합, 느린 IPC 소비자에서 flush·유령 세션 0·엔티티 1개를 고정했다. 이 과정에서 monolith에도
  있던 결함 2건을 찾아 고쳤다(bcrypt 대기 중 닫힌 연결의 AUTH, 즉시 인벤 커밋의 장비 칸 누락).
- 프로세스마다 로그(`proc` 필드·파일 접두어), 메트릭, admin 포트가 따로 있다.
- (4.5) 합격선을 넘었다(1.71배). 포화 구간이 "게이트웨이 통째 끊김(전원 KICK 6)"에서 "신규 접속만 KICK 9, 기존 연결 무접촉"으로 바뀌었다
  (카오스 C6이 4.4 결함 재현으로 고정 — 신규 KICK 9, 기존 KICK 0·끊김 0, 월드는 게이트웨이를 끊지 않음). 클라 바이트는 그대로다(특성화 골든 — monolith·게이트웨이 경유, MULTICAST·공유 프레임 켬·끔). `IPC_MULTICAST`·`IPC_SHARED`는 월드만
  재기동하면 끌 수 있는 킬 스위치다.

### 4.4 대가

- 월드 tick이 여전히 상한이다. 4.5 뒤에는 스냅샷 단계(특히 p99 꼬리)가 남은 몫의 대부분이고, IPC 프레이밍은 tick의 12%다. 게이트웨이를
  늘리면 프레이밍이 커진다(4.5에서 증가폭은 줄었다 — N=3·N=4 spread 1500 프레이밍 7.11·7.29 → 2.23·2.33 ms). 이 PC에서는 N=2가 최적이다.
- **포화한 게이트웨이는 통째로 끊긴다(4.4).** 미전송 IPC가 `IPC_MAX_PENDING_MB`(256 MiB)를 넘으면 월드가 그 게이트웨이를 끊고, 그
  클라 전원이 KICK 6을 받는다. 월드의 과부하 접속 제한은 월드 tick skip만 보므로, 포화한 게이트웨이에도 새 클라가 계속 붙는다
  (4.4에서 N=1 spread 1500 등 과부하 레벨에서 관측). → 4.5 F1에서 부하 기반 접속 제한으로 완화했다(§5·§7 — 신규 접속만 KICK 9, 하드 drop은
  최후 안전판). 4.5 재측정에서 끊김은 0이다(§4.2). 하드 drop은 기존 연결의 트래픽만으로 미전송이 256 MiB를 넘을 때 여전히 일어날 수 있다.
- 게이트웨이가 죽거나 재시작하면 그 클라는 재접속해야 한다. 4단계 당시에는 클라 자동 재접속이 없어 Unity가 KICK 모달 뒤 Boot로 돌아갔다 →
  **해소(2026-10-15, [ADR 0004](0004-client-auto-reconnect.md))**: 클라가 토큰 재로그인 + GameScene 재로드로 스스로 돌아온다(기본 켬). 게이트웨이 SIGKILL
  (N=2 spread 1000–2000 — 피해 502–1010명)에서 창 안 복귀 100%·복귀 p99 ≈5 s(1500·2000은 리스너 양보 뒤 — `perf-baseline.md` "자동 재접속 폭주"). 남는 비용은 재로드(채팅·열린 창
  소실)와, 한 게이트웨이가 빠져도 남은 쪽이 접속 제한 문턱 아래에 머무는 N−1 여유(ops-cluster §9)다.
- 운영 표면이 늘었다: 슈퍼바이저, 포트 배치, `IPC_TOKEN`, 프로세스별 관측. Windows는 공유 포트가 없어 게이트웨이마다 포트를
  따로 쓴다.
- IPC 인증이 단방향이다. 월드는 게이트웨이에 자신을 증명하지 않는다. 그래서 단일 테넌트 호스트를 전제한다(ops-cluster §7).

## 5. 설계 대비 변경 (구현 중 결정)

| 항목 | 설계 | 구현 | 근거 |
|---|---|---|---|
| `IPC_MAX_PENDING_MB` | 32 | **256** | 32 MiB는 4.0 실측 송출량(stock 1000 ≈10.7 MB/tick)의 3 tick분이다. 시간 기준 1–3초분으로 교정했다. 4.4의 결과로 포화한 게이트웨이는 256 MiB까지 쌓인 뒤 통째로 끊긴다(§4.4). 4.5부터는 그 앞에 소프트 임계(아래 접속 제한 행)가 있고, IPC 바이트가 −80~99% 줄어 같은 256 MiB가 시간 기준으로 훨씬 길다 |
| `WORLD_IPC` transport | tcp · unix · `pipe:` | tcp loopback(기본, 양 OS) · unix(Linux·macOS). **`pipe:`는 거부** | named pipe는 백프레셔가 보이지 않는다(4.0). loopback 밖 주소도 거부한다 |
| 펜싱 | incarnation | 무작위 u32 incarnation **동일성** 비교, 게이트웨이마다 은퇴 목록 16개 | incarnation은 기동마다 무작위로 고르는 값이라 순서가 없다. 그래서 새 값이 등록되면 직전 값을 은퇴 목록에 넣고, 그 값으로 다시 오는 HELLO를 거절한다. 멈춘 사이 같은 번호가 16번 넘게 바뀌면 옛 프로세스가 다시 등록될 수 있지만, 슈퍼바이저 배치에서는 생기지 않는다(ops-cluster §7) |
| HELLO 인증 | 없음 | 공유 비밀 `IPC_TOKEN`(16–255자). 다르면 피어 표·펜싱 기록을 건드리기 전에 거절한다. production의 world·gateway는 필수이고, 슈퍼바이저는 미설정이면 기동마다 무작위 32자를 만든다 | loopback은 같은 호스트의 모든 계정이 닿는다. 토큰이 없으면 살아 있는 `GATEWAY_ID`를 사칭해 세션을 끊거나 클라 IP를 위조할 수 있었다(4단계 리뷰) |
| HELLO 거절 | 말없는 끊김 | `0x84 HELLO_NACK {u16 ipcVer, u8 reason}`(fenced·closed·version·auth), **`IPC_VERSION` 2**(4.5에서 5까지 — 아래 IPC 버전 행). 게이트웨이는 closed면 재시도하고, fenced면 상한 백오프로 대기하며 종료하지 않는다. version·auth는 치명이라 종료한다 | fenced 게이트웨이가 스스로 종료하면 슈퍼바이저가 새 incarnation으로 되살려 살아 있는 쪽을 밀어낸다 |
| 인증 전 연결 | — | 핸드셰이크 전 봉투 1 KiB, HELLO 데드라인 5초, 동시 미완료 64개 | 인증 전 상대가 64 MiB 봉투를 주장해 수신 링을 채울 수 있었다 |
| unix 소켓 | — | 파일 0600, 운영자 소유 0700 디렉토리 안에 둔다 | 생성과 chmod 사이의 창을 디렉토리 권한이 닫는다 |
| 게이트웨이 수용 | 게이트웨이 연결 상한(게이트웨이 쪽 과부하 접속 제한은 선택) | CONN_OPEN 전에 판정한다. 월드 핸드셰이크 전이면 KICK 6, min(`GATEWAY_MAX_CONNECTIONS`, HELLO_ACK `connCap`)을 넘으면 KICK 9 | 월드가 모르는 연결을 만들지 않는다. 과부하 판정(tick skip)은 월드에만 있다. 4.5에서 부하 기반 KICK 9 "server busy"를 같은 자리에 더했다(다음 행) |
| 게이트웨이 부하 접속 제한(4.5 F1) | 계획: 게이트웨이 로컬 신호(이벤트 루프 지연·송신 꼬리 총량·IPC 수신 적체) + 월드 피어별 IPC 대기 소프트 임계의 ADMISSION 통지, 히스테리시스, 하드 drop은 최후 안전판 | **월드**: 피어 미전송 ≥ `IPC_ADMISSION_SOFT_PCT`(25%) × `IPC_MAX_PENDING_MB`면 busy, ≤ `_CLEAR_PCT`(6%)가 `_HOLD_MS`(2 s) 동안이면 clear. 전이마다 `0x85 ADMISSION`을 긴급 송신(`IpcPipe.writeUrgent` — 전송 중인 봉투 바로 뒤). busy 피어의 CONN_OPEN은 세션을 만들지 않고 KICK 9(판정 순서: 종료 중 → 피어 busy → 과부하 → 상한). **게이트웨이**(`gatewayLoad.ts`, 250 ms 표본·1 s 창): CPU 90%·이벤트 루프 지연 250 ms·IPC 왕복 1000 ms·송신 꼬리 합 64 MiB(인월드 연결 중 꼬리 보유 비율 ≥ `GW_ADMISSION_OUTBOUND_RATIO` 0.5일 때만)·월드 판정 — 하나라도 진입이면 CONN_OPEN 전 거절, 전부 해제 문턱 이하 + 월드 open이 3 s면 재개. 기존 연결은 건드리지 않는다 | IPC 수신 적체는 월드 쪽 피어 미전송(정확한 값 — 판정이 그대로 ADMISSION)과 IPC 왕복(답 없는 PING의 나이 포함)으로 대신했다. CPU 신호를 더했다 — 단일 스레드라 ≈100%가 포화이고, 4.5 측정에서 실제 거절은 이 신호가 맡았다(N=1 3000: 885건, 월드 소프트 임계 거절 0). 대기열 뒤로 보내면 알리려는 적체가 다 빠진 뒤에야 도착하므로 긴급 송신이다. 꼬리 폭 조건과 분모(인월드)는 리뷰 결과다 — 읽지 않는 소수 클라가 신규 접속을 잠그는 레버를 막고, 접속 램프의 로그인 중 연결이 비율을 희석하지 않게 했다. 4.4 결함은 카오스 C6이 재현·고정한다 |
| 점진 감축(4.5 후속, 2026-10-11) | 계획 밖 — 하드 상한 drop이 최후 안전판 | 월드 피어 미전송 ≥ `IPC_SHED_PCT`(40%) × `IPC_MAX_PENDING_MB`이면 그 피어의 **인월드 세션 중 무작위** `IPC_SHED_FRACTION_PCT`(10%, 1회 상한 `IPC_SHED_MAX_PER_STEP` 100)를 KICK 9 + CONN_CLOSE(긴급), 월드 세션 즉시 배치 정리. 에피소드(임계 위 구간) 안에서는 `IPC_SHED_COOLDOWN_MS`(500)마다 대기가 직전 감축 뒤 최저보다 다시 늘 때만 반복, 평가는 tick 밖. 월드에서 감축을 켜면 소프트도 켜져 있어야 하고 감축 > 소프트(부팅 가드). 발신자별 채팅 속도 제한(`CHAT_RATE_PER_SEC` 2·`CHAT_BURST` 5)을 함께 둔다 | macOS M4 실측에서 소프트 임계가 못 막는 경로가 드러났다 — 게이트웨이당 2000명·spread에서 게이트웨이 IPC 수신이 ≈105 MB/s에서 막혀(CPU ≈45%) 이미 붙은 부하만으로 3–6초 만에 하드 상한, 전원 KICK 6. 첫 구현은 램프 끝에 들어온(투자가 가장 적은) 최신 연결부터 줄였으나 리뷰가 두 가지를 짚었다: ① 연결 나이로 고르면 먼저 자리 잡은 부하 유발자는 영영 뽑히지 않고 늦게 온 정상 플레이어만 반복해 쫓겨난다(공격자가 순서를 고를 수 있다) ② 채팅은 존 전원 팬아웃이라 계정 1개가 IN_WORLD 버킷 안에서 대기를 감축 임계로 밀 수 있다. 그래서 무작위(대가: 오래 플레이한 사람도 같은 확률로 끊긴다 — 부하 기여도 기반 선택은 세션별 IPC 바이트 회계가 필요해 보류)와 채팅 속도 제한을 택했다. 기준점이 직전 감축 시점에 고정되면 대기가 줄었다 다시 늘어도 그 고점을 넘을 때까지 감축하지 못해(래칫) 최저 추적 + 에피소드 리셋으로 바꿨다. 검증(첫 구현): 감축 2회(200 → 180명)로 대기 최고 ≈114 MB → 0, KICK 6 2000 → KICK 9 380 |
| MULTICAST 범위(4.5 F2) | 동일 프레임 팬아웃(sendMany/sendFrame)을 게이트웨이별 `0x94` 레코드 1개로 | **sendMany만**(DAMAGE_EVENT·SKILL_EFFECT·ENTITY_META·MOVE_PATH·CHAT_BCAST). 월드는 outbox가 빈 수신자만 싣고(레코드 위치 = 연결별 위치), 그 창의 끝을 `0x95 CONN_FLUSH`로 표시한다. 게이트웨이는 프레임을 미뤘다가 그 연결의 다음 DELIVER와 합쳐 연결당 창마다 write 1회로 쓴다. `IPC_MULTICAST`(월드, 기본 1) | sendFrame(스냅샷 SPAWN/DESPAWN·DELTA)은 수신자가 viewer를 다 돈 뒤에야 정해지고 viewer마다 SPAWN 순서가 달라, 레코드 1개의 스트림 위치가 모든 수신자에게 맞지 않는다(4.5 설계 §4.1). 4.5 측정 몫: realistic IPC의 14–15%, spread 0.1% |
| DELTA 공유 형태(4.5 F3) | 같은 셀 viewer의 SNAPSHOT_DELTA 공유 본문에 u32 패치(ackSeq)를 붙이는 MULTICAST 변형(push) | 연결마다 레코드 1개가 공유 프레임을 **참조**하는 `0x96 CONN_DELIVER_SHARED`(DEF·CONN·CONN_REF, DEF는 게이트웨이 봉투 범위). 묶음 키는 셀 추정이 아니라 keep 열·self 정확 비교(`sim/deltaGroups.ts`), keep 64 미만은 묶지 않는다. 묶음은 monolith에도 적용(writeEntries 묶음당 1회 — 바이트 동일). `IPC_SHARED`(월드, 기본 1) | push형은 viewer의 DELTA가 자기 outbox에만 있는 SPAWN/DESPAWN 뒤에 와야 하는 순서를 못 지킨다(4.5 설계 §4.1). 참조형은 순서 규칙이 DELIVER와 같다. 정확 비교라 오판이 구조적으로 없다(설계 측정: 지난 tick 같은 셀에 있던 viewer의 97–99%가 ackSeq 말고 동일). 하한 64는 희소 배치의 회귀(묶음 판정·패치 복사가 짧은 writeEntries보다 비쌈) 방지다. 피어에 혼자인 참조는 평문으로 쓴다(DEF + CONN_REF가 16바이트 크다). 4.5 측정 몫: spread IPC의 83–85%, realistic 65–68% |
| IPC 버전(4.5) | v2 | v3 ADMISSION · v4 CONN_MULTICAST·CONN_FLUSH · v5 CONN_DELIVER_SHARED · v6 클라 헤더 v2(이진 전환 B1 — 완성 클라 프레임 하한 4(종전 6), CONN_CLOSED LegacyFraming) · v7 클라 C2S 바이너리(이진 전환 B2b — 레이아웃 불변, 게이트웨이 엣지 수신 상한 변경. 이후 클라 protoVersion bump마다 IPC_VERSION도 올린다). HELLO 협상은 계속 엄격하다(다르면 HELLO_NACK(version)) | 버전이 섞인 클러스터를 허용하지 않는다 — `IPC_VERSION`이 바뀌는 배포는 롤링이 아니다(ops-cluster §8). 6바이트 미만 프레임(MULTICAST·DEF) 거부는 기존 규칙의 강제라 v5를 유지했다(4.5 리뷰) |
| 게이트웨이 `/admin/perf` 부수효과(4.5) | — | `reset=1`·`gc=1`·`stall=`은 `GW_PERF_SIDE_EFFECTS=1`일 때만, 기본 403(읽기는 그대로). 월드 엔드포인트는 종전대로 | 같은 호스트 프로세스가 정지 주입·연속 풀 GC로 게이트웨이를 붙잡아 신규 접속을 잠글 수 있었다(4.5 리뷰). 카오스 C6만 켠다 |
| 슈퍼바이저 종료 | 시그널 팬아웃 | Bun IPC 채널 메시지, 자식은 `CLUSTER_SUPERVISED=1`이면 SIGINT를 무시 | Windows의 시그널은 강제 종료라 우아한 종료를 시킬 수 없다 |
| 카오스에서 발견(monolith 공통) | — | 자격증명 검증(bcrypt) 중 연결이 닫히면 그 AUTH를 버린다. 즉시 인벤 커밋 3경로는 장비 8칸과 한 tx로 쓴다 | C4·C2 (`a0ab2b8`·`29287ef`) |
| 공유 포트 리스너 양보(2026-10-15) | §7 보류(전원 동시 정지 위험) | 월드 조정형 — 아래 §5.1. IPC v14(`0x04 LISTEN_REPORT`·`0x86 LISTEN`), `GW_LISTEN_YIELD`(게이트웨이, 기본 1) | 자동 재접속 기본 켬의 선결(7B 폭주 측정) |

### 5.1 공유 포트 리스너 양보 (2026-10-15 — 자동 재접속 선결)

**문제.** Linux 공유 포트(reusePort)의 커널 해시는 부하를 모른다. 접속 제한이 닫힌 게이트웨이도 새 연결의 1/N을 받아 KICK 9
"server busy"로 돌려보낸다. 자동 재접속 7B 폭주 측정(WSL, N=2, spread 1500)에서 gw1(759명)을 SIGKILL하자, gw1 재기동(≈0.7초)
전까지 재접속이 전부 gw2로 갔고 그 뒤에는 커널이 ≈50/50으로 나눴다. gw2는 자기 ≈740명 + 피해자 절반 ≈1094 연결에서 CPU 92.6%
(`GW_ADMISSION_CPU_PCT` 90, 해제 75, hold 3초)로 닫힌 채 머물렀고, 재시도마다 ≈50% 확률로 다시 gw2에 닿아 KICK 9를 받았다(로그 ≈190건
"client connection rejected at gateway — server busy"). 그동안 gw1은 ≈380 연결로 한가했고, 759명 중 13명이 90초 창 안에 포기했다(게이트
≥ 99%). 사용자 결정: 입구(바쁜 게이트웨이가 공유 포트 그룹에서 잠시 빠짐)를 먼저 고치고 재측정한 뒤 자동 재접속을 기본으로 켠다.

**결정.** 월드가 조정한다. 게이트웨이는 LISTEN_REPORT `{shared, closed, listening, port, ackSeq}`를 긴급 송신하고(리슨 직후·접속 제한
전이·리스너 중지/재개·지시 적용), 월드는 피어마다 마지막 보고와 마지막으로 보낸 지시(mode·seq)를 두고 순수 계획기(`listenPlan.ts`)로
LISTEN `{mode, seq}`를 정한다 — **실효 닫힘**(보고 closed ∨ 월드 소프트 임계 busy)이고 같은 (shared ∧ port) 그룹에 **열린 리스너**(보고 있음 ∧
실효 닫힘 아님 ∧ listening ∧ ackSeq = 마지막 seq ∧ 마지막 지시 listen ∧ BYE 전)가 따로 있을 때만 yield, 나머지는 listen. 바뀐 지시만 보낸다.
보고의 closed는 "새 클라를 거절 중"이다 — 부하 접속 제한(월드 ADMISSION busy 포함) ∨ 연결 상한 닿음(상한 도달에서 켜고 상한의 5%·최소 1
아래에서 끈다 — 리뷰 반영: 상한 거절도 KICK 9라, ops 권고대로 `GATEWAY_MAX_CONNECTIONS`를 조이면 이것이 7B와 같은 증상의 구속 조건이 된다).
게이트웨이는 yield를 **자격**(`REUSE_PORT=1`·`GW_ADMISSION=1`·`GW_LISTEN_YIELD=1`)이 있고 **지금도 새 클라를 거절 중일 때만** 집행한다
(`listener.stop(false)` — 기존 연결 그대로). listen은 같은 포트로 재바인드(실패는 백오프 재시도). 월드 유실은 종전처럼 리스너를 닫고 양보 상태를
비운다(다음 세션은 리슨부터). probe(WSL, Bun 1.4.3, 커널 6.18): reusePort 리스너 2개 ≈50/50 → 하나를 `stop(false)`하면 새 연결 100%가 다른
쪽으로, 중지한 리스너가 받아 둔 소켓은 read·write 정상, 다시 `Bun.listen(reusePort)`하면 그룹 복귀(≈50/50), 리스너 0이면 ECONNREFUSED.

**불변식.** 월드는 같은 그룹의 다른 피어가 열린 리스너일 때만 yield를 지시한다(열린 리스너는 닫혀 있지 않아 같은 계획에서 yield를 받지
않는다). 게이트웨이는 현재 월드의 yield 지시 말고는 스스로 리스너를 내리지 않는다(SHUTDOWN·월드 유실·자기 종료는 별개 — 자기 종료는 내린
뒤 보고한다). ack 조건이 핵심이다: yield를 보낸 직후 그 피어의 접속 제한이 풀려 그 yield를 적용하기 **전에** "열림·리스닝"을 보고해도 옛
ack라 열린 리스너가 아니다 — 세면 다른 닫힌 피어까지 yield하고 곧 그 피어도 내려가 리스너가 0이 된다. 지연 전달 모델 시험이 ack 조건이 있으면
리스너 0이 없고 빼면 생긴다는 것을 고정한다(`tests/server/cluster/listenPlan.test.ts`).

**남는 창.** ① 열린 리스너의 **프로세스**가 사라지면 월드가 피어 유실을 알아채고 listen이 닿아 재바인드할 때까지 리스너 0(SIGKILL = 소켓
종료로 즉시, 정지 = `IPC_DEAD_MS` 5초 — 정지한 게이트웨이의 리스너 소켓은 커널에 남아 새 연결이 그 accept 대기열에 멈춘다. 양보가 없어도
1/N은 그렇게 멈춘다). ② 열린 리스너가 스스로 내릴 때(우아한 종료·SHUTDOWN) 그 보고가 닿을 때까지(IPC 1홉). ③ 리스너를 내리는 순간 그 accept
대기열에 있던 연결은 Linux 기본 `net.ipv4.tcp_migrate_req = 0`에서 RST다(클라는 링크 실패로 재시도 — 자동 재접속은 HELLO_ACK 전 종료라 Busy 백오프 5초 이상, `shared/protocol.md` §3.6 — 운영 권고 1, ops-cluster §9). 전원이 닫혀
있으면 아무도 내리지 않는다 — 종전 KICK 9 경로이고 ECONNREFUSED로 바꾸지 않는다(클라가 "서버 바쁨"을 안다). 지시는 접속 제한 전이를 1:1로
따라가 왕복 주기의 하한은 각 hold(`GW_ADMISSION_HOLD_MS` 기본 3초·`IPC_ADMISSION_HOLD_MS`)와 상한 히스테리시스다 — 월드 쪽 최소 체류는 두지
않았다(해제가 늦으면 리스너가 적은 채 머문다). 재계획은 던지지 않는다 — 지시 송신이 던진 피어는 끊는다(피어 정리의 세션 배치 종료가 예외로
건너뛰지 않게, 리뷰 반영).

**기각한 대안.**
- eBPF reuseport 조향(`SO_ATTACH_REUSEPORT_EBPF` — 커널이 부하 표를 보고 고른다): Bun 리스너 소켓에 BPF 프로그램을 붙일 API가 없고,
  운영에 CAP_BPF·커널 버전 의존이 생긴다.
- 게이트웨이 단독 판단(바쁘면 스스로 unlisten): 서로를 모르므로 둘이 동시에 닫히면 동시에 내려 리스너 0 → ECONNREFUSED(4.5 F1 당시 이
  이유로 보류 — §7). 월드는 모든 피어의 상태를 한곳에서 보는 유일한 프로세스다.
- 슈퍼바이저 조정: 슈퍼바이저는 개발·측정용 배치 도구라 운영에 늘 있지 않고(직접 띄우기 — ops-cluster §1.2), 게이트웨이 부하 신호를 받지도 않는다.
- 앞단 L4 프록시(least-conn): 단일 장애점·홉이 늘고, 실제 클라 IP 전달에 PROXY protocol이 먼저 필요하다(§7).

**시험.** 계획기·성질·모델·코덱·월드·게이트웨이 단위 시험과 카오스 C8(Linux — 공유 포트 N=2, 닫힌 gw2 양보 중 새 입장 20명 전원 gw1·KICK 9
0·gw2 기존 클라 무사, 재개 뒤 새 연결이 다시 두 게이트웨이로) — 목록은 `architecture.md` §3.4.

**재측정(7B 폭주 재실행, `8d88569`).** 게이트웨이 kill 1500 ×2·2000·월드 kill 1500 전부 관문 통과(창 안 복귀 100%·치명 0·부수 끊김 0, 첫 시도 복귀
99.1–100%). 핀 고정 A/B(`GW_ADMISSION_CPU_PCT` 70으로 닫힘 강제): 종전 99.05·99.08%(포기 7·7, KICK 9 192·158, 복귀 p99 56.2·51.9 s) → 양보 100·100%
(포기 0·0, KICK 9 0·3, p99 5.0 s). 그 뒤 클라 자동 재접속을 기본으로 켰다(`58240c0` — [ADR 0004](0004-client-auto-reconnect.md), 원표 `perf-baseline.md`
"자동 재접속 폭주").

## 6. IPC 프로토콜 요약

서버 내부 프로토콜이다(클라 와이어와 무관, `shared/protocol.md` 대상 아님). 리틀엔디언이고 버전을 관리한다(`IPC_VERSION` 19 — v2 HELLO
token·HELLO_NACK, v3 `0x85 ADMISSION`(4.5 F1), v4 `0x94 CONN_MULTICAST`·`0x95 CONN_FLUSH`(4.5 F2), v5 `0x96 CONN_DELIVER_SHARED`(4.5 F3).
v6–v13은 이진 전환의 클라 protoVersion 짝(레이아웃 대부분 불변 — ADR 0003), v14 `0x04 LISTEN_REPORT`·`0x86 LISTEN`(공유 포트 리스너 양보, §5.1), v15 클라 protoVersion 12 짝(`CHAR_STATS_FULL.derived`, 레이아웃 불변), v16 클라 protoVersion 13 짝(자유 포인트, 레이아웃 불변), v18 클라 protoVersion 15 짝(INPUT_CMD.gait, 레이아웃 불변), v17 클라 protoVersion 14 짝(자유 포인트 요청 id, 레이아웃 불변), v19 클라 protoVersion 16 짝(ENTITY_SPAWN.monsterDefId, 레이아웃 불변), v20 클라 protoVersion 17 짝(생활 L-1 채집·L-2 제작 패킷, 레이아웃 불변).
협상은 엄격하다 — 버전이 다르면 HELLO_NACK(version)).
레이아웃의 단일 정의는 `server/src/cluster/ipcSchema.ts`, 상세는 `architecture.md` §3.4다.

- 봉투: `u32 len | u8 type | payload`. 상한은 64 MiB(수신 링 상한과 같음), 핸드셰이크 전에는 1 KiB다. 배치 봉투는 1 MiB마다 나눈다.

| 방향 | type | 메시지 | 내용 |
|---|---|---|---|
| G→W | 0x01 | HELLO | `{u16 ipcVer, u16 gatewayId, u32 incarnation, u32 pid, u8 tokenLen, token}` — 연결의 첫 메시지 |
| G→W | 0x02 / 0x03 | PING / BYE | `{u32 seq}` / `{u8 reason}` (shutdown·restart) |
| G→W | 0x04 | LISTEN_REPORT | `{u8 flags(shared·closed·listening), u16 port, u32 ackSeq}` — 클라 리슨 상태 스냅샷(v14, 긴급 송신) |
| G→W | 0x10 | CONN_OPEN | `{u32 localId, u8 addrLen, addr}` — 실제 클라 IP |
| G→W | 0x11 | CONN_FRAMES | 반복 `{u32 localId, u16 packetId, u32 bodyLen, body}` — 이벤트 루프 턴마다 배치 |
| G→W | 0x12 | CONN_CLOSED | `{u32 localId, u8 reason}` — 0 peer · 1 idle · 2 rate · 3 size · 4 backlog · 5 error · 6 gw_shutdown · 7 world_requested · 8 cap |
| W→G | 0x81 / 0x84 | HELLO_ACK / HELLO_NACK | `{u16 ipcVer, u32 worldIncarnation, u32 connCap}` / `{u16 ipcVer, u8 reason}` |
| W→G | 0x82 / 0x83 | PONG / SHUTDOWN | `{u32 seq}` / `{u8 kickReason}` |
| W→G | 0x90 | CONN_DELIVER | 반복 `{u32 localId, u32 len, bytes}` — 완성 클라 프레임. tick 끝·턴 끝마다 게이트웨이당 봉투 1개 |
| W→G | 0x91 / 0x92 / 0x93 | CONN_STATE / CONN_CLOSE / CONN_ACCEPTED | `{u32 localId, u8 state}` / `{u32 localId}`(앞선 바이트 뒤 종료) / `{u32 localId, u32 worldConnId}` |
| W→G | 0x85 | ADMISSION | `{u8 state}` — 이 피어의 신규 접속 판정(v3, 긴급 송신) |
| W→G | 0x86 | LISTEN | `{u8 mode(listen·yield), u32 seq}` — 공유 포트 리스너 양보 지시(v14, 긴급 송신 — §5.1) |
| W→G | 0x94 | CONN_MULTICAST | 반복 `{u32 len, bytes, u16 n, u32[n] localIds}` — 같은 완성 클라 프레임을 n개 연결에(v4) |
| W→G | 0x95 | CONN_FLUSH | `{}` — MULTICAST를 쓴 flush 창의 끝(v4) — 게이트웨이가 미뤄 둔 연결별 바이트를 쓴다 |
| W→G | 0x96 | CONN_DELIVER_SHARED | 반복 레코드(u8 tag): DEF `{u32 len, u16 patchOff, bytes}`(봉투 안 ref = 순번) · CONN `{u32 localId, u32 len, bytes}` · CONN_REF `{u32 localId, u32 ref, u32 value, u32 len, bytes}` — bytes 뒤에 DEF를 patchOff에 value로 패치해 이은 것(v5 — 같은 셀 viewer의 SNAPSHOT_DELTA, value = ackSeq) |
| 예약 | 0xA0–0xC1 | 멀티 월드 | 미구현. 받으면 프로토콜 오류 |

- 순서: 배치가 아닌 메시지는 열린 배치 봉투를 닫는다. 그래서 연결별 STATE/DELIVER/MULTICAST/CLOSE 순서가 월드 발행 순서와 같다.
  localId는 incarnation 안에서 재사용하지 않는다. MULTICAST는 월드에서 outbox가 빈 수신자만 싣고(레코드 위치 = 연결별 위치),
  게이트웨이는 그 바이트를 그 연결의 다음 DELIVER와 합쳐(또는 CONN_FLUSH·종료·KICK 앞에서) write 1회로 쓴다(`architecture.md` §3.4).
  CONN_DELIVER_SHARED는 순서 규칙이 DELIVER와 같다(연결 레코드 1개 = 송신 1건 — 공유는 레코드 안의 참조다). DEF는 같은 봉투 안에서만 참조되고,
  게이트웨이는 DEF를 연결 값으로 제자리 패치해 쓴다(인라인이 없으면 복사 0).
- 생존: PING/PONG heartbeat(`IPC_HEARTBEAT_MS` 1000), `IPC_DEAD_MS`(5000) 동안 무소식이면 dead로 판정한다. 미전송이
  `IPC_MAX_PENDING_MB`를 넘으면 그 피어를 끊는다(backpressure — 최후 안전판, 그 전에 소프트 임계에서 신규 접속만 막는다).
- 수명주기: CONN_OPEN이 오면 월드는 종료 중(KICK 6)과 피어 busy(KICK 9 "server busy" — 세션·회계 없이, 거절 쌍은 긴급 송신)를 먼저
  보고 `acceptSession`으로 판정한다. 거절이면 DELIVER(KICK 9) + CONN_CLOSE, 수용이면 CONN_ACCEPTED다. 피어 busy·open 전이는
  ADMISSION으로 알리고, 게이트웨이는 busy 동안 새 클라를 CONN_OPEN 전에 거절한다(§5 접속 제한 행).
  이후 CONN_FRAMES는 `ingestFrame`(라우터 상태 머신), CONN_CLOSED는 `closeSession`으로 간다.
  피어를 잃으면 `closeSessions`가 그 게이트웨이 세션 전부를 배치 저장 1회로 닫는다.

## 7. 보류 항목과 트리거

| 항목 | 트리거 | 상태 (4.5 재측정 기준, 괄호는 4.4) |
|---|---|---|
| **MULTICAST(0x94) / 공유 페이로드** — 같은 프레임(SPAWN·DESPAWN·이벤트 팬아웃)을 게이트웨이당 한 번 보내고 수신자 목록을 붙인다 | 월드 IPC 비용(프레이밍 + ipcFlush)이 tick의 10% 초과 | **구현·검증(4.5)** — 트리거는 4.4에서 충족(1100–1250에서 18–20%). **F2 발행 시점 팬아웃**: sendMany(DAMAGE·SKILL_EFFECT·META·MOVE_PATH·CHAT)를 게이트웨이당 CONN_MULTICAST 레코드 1개로(IPC v4, `IPC_MULTICAST`). **F3 DELTA 공유**: keep·self가 같은 viewer끼리 DELTA 프레임 1개(monolith도 writeEntries를 묶음당 1회, keep 64 미만은 종전 경로)를 게이트웨이 봉투당 DEF 1개 + 연결별 CONN_REF(ackSeq u32)로(IPC v5, `IPC_SHARED`). 마이크로벤치는 `perf-baseline.md` 4.5 F2·F3. **재측정**(§4.2): IPC 바이트 spread −84%(공유 83–85% / MULTICAST 0.1%)·realistic −80~82%(65–68% / 14–15%)·stock −99%, spread N=2 IPC 프레이밍 −53~57%, 세션·tick당 1.52–1.57 µs(예산 2.7 안) → 1.6배 통과. 다만 tick 비중은 아직 12%(트리거 위)이고, 남은 비용은 바이트보다 연결당 레코드 고정비다(1 MB당 0.62 → ≈1.9 ms). 남은 것: 스냅샷 SPAWN/DESPAWN 공유(4.5 설계 (a) — 4.4 기준 spread IPC의 ≈7%, 절감 추정 ≈0.34 MB/tick[계산: 5.65 MB × 6.1%]은 4.5 spread N=2 1100 실측 IPC 0.93 MB/tick의 ≈37%[계산]. 스트림 위치 문제로 F3 같은 연결별 참조형이어야 하고, 레코드 수가 그대로라 tick 이득은 바이트 몫보다 작을 수 있다) |
| 게이트웨이 포화 인지 접속 제한(게이트웨이 송출 지연·피어 미전송량 기반) | 운영에서 `mmorpg_ipc_peer_lost_total{reason="backpressure"}` 발생, 또는 게이트웨이당 목표 연결이 ≈1,000을 넘을 때 | **구현(4.5 F1)** — 월드 피어 소프트 임계 + 긴급 ADMISSION(IPC v3) + 게이트웨이 로컬 신호(CPU·지연·IPC 왕복·송신 꼬리 — 꼬리는 그 꼬리를 가진 연결이 절반 이상일 때만 센다: 읽지 않는 소수 클라의 잠금 레버 차단, 4.5 리뷰), 신규 접속만 KICK 9 "server busy"(`architecture.md` §3.4, ops-cluster §9). **재측정**(§4.2): 게이트웨이 1개 spread 1500–3000에서 끊김 0(4.4 1500은 전원 KICK 6), 초과분은 KICK 9(2500: 월드 tick 과부하 172명, 3000: 게이트웨이 CPU 879명), 월드 소프트 임계 거절·피어 busy 0 — IPC 바이트가 줄어 월드 쪽 적체가 생기지 않았고 게이트웨이 CPU 신호가 실제 거절을 맡았다. **바쁜 게이트웨이의 리스너 일시 중지는 구현(2026-10-15, §5.1)** — 전원 동시 정지 위험은 월드 조정(다른 열린 리스너가 있을 때만 yield + ack 조건)으로, KICK 안내 없음은 "전원 바쁨이면 아무도 내리지 않는다"(종전 KICK 9)로 닫았다. 보류: 소프트와 하드 사이 신규 순 축출 단계 |
| 게이트웨이 INPUT_CMD 사전 디코드(월드 JSON 디코드 이전) | 월드의 프레임 디코드가 메인 스레드의 10% 초과, 또는 입력 경로 할당이 월드 GC 꼬리를 정할 때 | **동기 소멸(이진 전환 B2b, 2026-10-12)** — 월드의 C2S 디코드가 JSON에서 생성 바이너리 코덱으로 바뀌어(ADR 0003) 사전 디코드로 덜어낼 몫이 작다. 같은 세션 전후 측정: 월드 CPU −9%·수신 바이트 −54%, eden 정지 최대 38.8 → 10.4 ms지만 eden 횟수(1463 → 1886회/런)·tick p99(1200 19.4 → 19.7)는 그대로 — 입력 경로 할당은 월드 GC 꼬리의 주원인이 아니다(`perf-baseline.md` "이진 전환 B2b") |
| 게이트웨이 유실 시 클라 자동 재접속 | 운영 중 롤링 재시작, 또는 게이트웨이 크래시가 사용자 이탈로 이어질 때 | **완료(2026-10-15, 기본 켬 — [ADR 0004](0004-client-auto-reconnect.md))** — 토큰 재로그인 + GameScene 재로드(와이어 불변), 분류·백오프 표는 `shared/protocol.md` §3.6. 기본 켬 관문(재접속 폭주 `STORM_GATE`)의 1회차가 게이트웨이 kill 1500에서 reusePort 배치로 미달해 리스너 양보(§5.1)를 먼저 넣었다. 1회차 통과분(게이트웨이 kill 1000·1200·월드 kill/재시작 1500·2000·monolith 재시작 700)과 양보 뒤 재측정(게이트웨이 kill 1500 ×2·2000·월드 kill 1500)이 전부 관문 통과(`perf-baseline.md` "자동 재접속 폭주"). 롤링 재시작 절차는 ops-cluster §8 |
| PROXY protocol | 게이트웨이 앞에 L4 프록시를 둘 때(Windows 단일 포트, 멀티 호스트) — 실제 클라 IP가 IP별 상한·인증 스로틀에 필요 | 미착수 |
| 게이트웨이 TLS 종단 | 인터넷 노출 전(`architecture.md` §10.1) | 미착수 |
| 네이티브 게이트웨이(B2) | 게이트웨이 CPU가 연결당 비용으로 상한이 되고(목표 연결에서 메인 스레드 > 0.6코어), 월드 IPC 비용 때문에 게이트웨이 수를 늘릴 수 없을 때 | 미충족 — 합격 지점에서 0.39–0.47코어(0.41–0.44). 게이트웨이 1개는 spread 1500에서 0.89코어, 2000 이상에서 0.95–0.98코어로 포화하지만 그 구간은 접속 제한이 막는다 |
| 워커 호스팅 게이트웨이(Bun Worker) | Bun Worker가 안정화되고 프로세스 간 IPC 송신(ipcFlush)이 tick의 지배 몫이 될 때 | 미충족 — ipcFlush 0.27–0.33 ms(0.3) |
| **스냅샷 단계 꼬리(p99) 축소** (4.5에서 추가) | 월드 tick p99가 용량을 정하고, 가장 느린 1% tick의 초과분 과반이 스냅샷 단계일 때 | **원인 규명·대응(4.5 후속, 2026-10-11 — 페이서는 1.4.3에서 기본 끔)** — 4.5에서 스냅샷 평균 −8~12%인데 p99는 그대로(1150: 19.09 → 19.37 ms), 스냅샷 p99/평균 ≈1.50 → ≈1.70, 가장 느린 1% tick 초과분의 대부분(+8~14 ms). 원인은 **tick 안에서 시작되는 JSC GC**다(작업량 변동 아님 — 바이트와 상관 0.31): zoneBench 1150명·게이트웨이 경유·20 Hz에서 가장 느린 1% tick이 전부 GC tick(GC tick 3.8%, 정지 ≈0.3 ms지만 동시 마킹 동안 그 tick +12–14 ms). 대응은 GC 페이서(`GC_PACE_TICKS` 8 — tick 직후 유휴에 비동기 GC 요청, `architecture.md` §4.1): 벤치 tick p99 23.56 → 13.23 ms, CPU 변화 잡음 범위. 실서버(WSL 핀 고정)는 입력 경로 할당 탓에 eden이 거의 매 tick이다(후속 — Bun 1.4.3 전환에서 이 eden 빈도의 유력 원인은 1.3.x 런타임 GC 샘플러로 바뀌었다: −91~95%,
  `perf-baseline.md` "Bun 1.4.3 전환") — monolith 700은 full 수집이 줄어(7 → 2회/런) p99 26.08 → 22.95, 월드(N=2)는 full 수집이 줄지 않고(끔 7 / 켬 9) p99 변화가 런 편차 안이다(1200 4회 중앙값 ≈28.9 → ≈26.4, 1150 25.73 → 25.95). Bun 1.4.3에서는 페이서 이득이 보이지 않고 eden만 2.5~2.7배로 늘어 기본을 끔으로 바꿨다(`GC_PACE_TICKS` 0 — `perf-baseline.md` "Bun 1.4.3 — 수용 인원·GC 페이서·소크"). **남은 것**: 입력 경로 할당 축소(B2b, 위 "게이트웨이 INPUT_CMD 사전 디코드" 행)와 송신 경로 바이너리(B3b)는 eden 빈도를 줄이지 못했고, 1.4.3 전환에서 eden 빈도의 유력 원인은 1.3.x GC 샘플러로 정리됐다(eden −91~95%·N=2 p99 −23~29% — `perf-baseline.md` "Bun 1.4.3 전환"). 1.4.3에서 월드 tick 꼬리의 원인 분해는 미실시 — `perf-baseline.md` "스냅샷 꼬리 — GC 페이서"·"이진 전환 B2b" |
| 멀티 월드 샤딩(20–35일, `owner_epoch` 펜싱, IPC 0xA0–0xC1 예약) | MULTICAST 뒤에도 목표 CCU가 월드 1개 tick 용량을 넘을 때 | 월드 tick이 이 PC에서 ≈1,159(N=2, p99 25 ms)의 한계다(≈1,100). B6 코드·Bun 1.4.3에서는 ≈1,621(같은 PC·같은 방법의 1.3.13 ≈1,227 — 이득 +20~32%, PC가 한가할 때·페이서 8 기준이고 호스트가 바쁘면 두 버전 모두 1,250·1,550명에서 이미 25 ms를 넘는다 — 샤딩 판단에는 다른 호스트·실제 NIC 측정이 필요, `perf-baseline.md` "Bun 1.4.3 — 수용 인원·GC 페이서·소크"). MULTICAST·DELTA 공유 뒤 남은 몫은 스냅샷 단계(1150: tick 평균 14.87 ms 중 11.31)라, 스냅샷 꼬리·SPAWN 공유 뒤에도 목표에 못 미칠 때 착수한다 |
| 채널 | Town 허브 인구가 월드 용량을 넘거나 기획이 요구할 때 | 미착수 |
| IPC 상호 인증(월드 → 게이트웨이 challenge) | 공유 호스트나 멀티 호스트 IPC | 미착수 — 단일 테넌트 전제 |
| 리스너 양보 후속(2026-10-15 리뷰) — ① 정지 의심 신호: 열린 리스너의 PING이 2 × `IPC_HEARTBEAT_MS` 넘게 끊기면 열린 리스너로 세지 않아 dead 판정(`IPC_DEAD_MS`) 전에 양보 피어를 푼다 ② 멀티 호스트 그룹 키: 그룹 = (호스트, 포트) | ① 재측정·운영에서 정지(SIGSTOP·기아)로 인한 리스너 0 창이 보일 때 ② 게이트웨이를 다른 호스트에 둘 때(IPC 원격) | 미착수 — 지금은 남는 창 ①(§5.1)로 문서화, 그룹 키는 같은 호스트 전제(IPC가 로컬) |
| 피어 유실 배치 저장 청크화 | 파일 DB에서 게이트웨이 1개(1000+ 세션)가 유실될 때 `closeSessions` 소요가 tick lateness로 보일 때 | 미측정 — C1은 50명까지 쟀고, 4.4·4.5는 `:memory:` DB였다. 자동 재접속 폭주의 게이트웨이 kill 런(피해 502–1010명)도 `:memory:`였다(파일 DB는 재기동을 넘는 월드·monolith 런만 — `tools/loadgen/storm/chaos.ts needsFileDb`), 저장 소요를 재는 메트릭도 없다(ADR 0004 §6) |

**운영 기본을 클러스터로 바꾸는 것에 대해.** 자동 재접속은 게이트웨이 분리를 운영 기본 후보로 검토하기 위한 선결 조건이었다(사용자 계획 2026-10-14 —
ADR 0004 §1). 그것이 끝나 위 표의 "게이트웨이 유실 시 클라 자동 재접속"은 닫혔지만, 기본 모드를 `ROLE=monolith`에서 바꾸는 결정 자체는 아직 없다(상태 줄
— 클러스터는 opt-in). 이 표에 남은 관련 항목은 피어 유실 배치 저장 청크화(파일 DB 1000+ 세션 미측정), PROXY protocol
(Windows 단일 포트·멀티 호스트), IPC 상호 인증(공유 호스트), 리스너 양보 후속, 그리고 토폴로지와 무관하게 인터넷 노출 전 필수인 TLS 종단이다.

## 8. 참조

- 설계 승인안: 성능 로드맵 계획 "4단계"·"4.5 후속"과 4단계·4.5 설계 문서(레포 밖 scratch — 4.5는 공유 가능 바이트 실측 포함)
- 선행 연구: `final.md`(C++ 이전 분석 — §1 TL;DR, §7 대안 비교, §8 트리거)
- 측정: `docs/perf-baseline.md` "성능 3단계 — Bun 최적화 후" §13, "성능 4단계 — 게이트웨이 분리", "성능 4.5 F2"·"F3"(마이크로벤치),
  "성능 4.5 — admission·MULTICAST 후"(종단 간 재측정)
