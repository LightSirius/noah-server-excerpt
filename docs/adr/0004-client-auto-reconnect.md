# ADR 0004 — 클라 자동 재접속 (토큰 재로그인 + GameScene 재로드)

- 상태: **채택 — 완료(2026-10-15, 기본 켬).** 슬라이스 ①–⑧(§2.6)이 끝났다 — 서버 토큰 1회용·교체·폐기(①), 사망 입장·유령 세션 컷·monolith 종료
  KICK 6(②), 장애 시험(③), 클라 전송 기본기(④)·순수 정책·상태기계(⑤)·감독자 배선·오버레이(⑥), 재접속 폭주 측정 → 공유 포트 리스너 양보
  ([ADR 0002 §5.1](0002-gateway-split.md), IPC v14) → 재측정 통과 → `ReconnectSupervisor.DefaultEnabled = true`(⑦ — 끄기는 빌드 명령줄
  `-autoReconnect=0`), 문서(⑧). 클라 와이어 변경 0(`protoVersion` 11 그대로 — IPC만 리스너 양보로 v13 → v14).
- 날짜: 설계 승인 2026-10-14, 기록 2026-10-15
- 관련: [`shared/protocol.md`](../../shared/protocol.md) §3.1(세션 토큰 계약)·§3.5(KICK 사유)·**§3.6(재접속 정책 — 분류·백오프·창·시간 초과 표, 수치
  정본은 `ReconnectPolicy.cs`)** · [`architecture.md`](../architecture.md) §1.1(우아한 종료)·§7.2(토큰)·§7.2b(선점)·§7.2c(사망 입장·유령 컷)·
  §8.6(`NetworkManager` 전송 계약·`ReconnectSupervisor`) · [ADR 0002](0002-gateway-split.md) §4.4·§5.1·§7 · [`ops-cluster.md`](../ops-cluster.md) §8(롤링
  재시작)·§9(N−1 여유) · [`perf-baseline.md`](../perf-baseline.md) "자동 재접속 폭주 (2026-10-15)"(측정 원표)

## 1. 맥락

- **동기**: 게이트웨이 분리(ADR 0002)의 대가 중 하나가 "게이트웨이가 죽거나 재시작하면 그 클라는 KICK 모달 뒤 Boot로 돌아간다"였다(ADR 0002 §4.4,
  보류 항목 "게이트웨이 유실 시 클라 자동 재접속" — 트리거: 운영 중 롤링 재시작·게이트웨이 크래시의 사용자 이탈). 월드·monolith 재시작, 회선 순단, 서버의
  부하 감축(KICK 9)도 같은 결과였다. 사용자 결정(2026-10-14)의 순서는 "게이트웨이 분리 + 자동 재접속 → 게임 기능 → (허브 인구 트리거 시) 같은
  프로세스 안 채널 → 멀티 월드 샤딩"이다. 같은 논의에서 월드를 기능 단위(로그인·채팅·퀘스트·인벤·전투)로 쪼개는 안은 기각했다 — 병목은 공간(스냅샷)
  이고, 기능 사이에 단일 tx 원자성(퀘스트 턴인 = 퀘스트 행 + 인벤 + 진행 컬럼 등)이 필요하다.
- **전 상태**: 서버의 Token AUTH(mode 2)는 있었지만 토큰은 7일 동안 몇 번이든 통했고(`findValid` — 조회만), 로그인마다 토큰이 하나씩 늘었다(옛 토큰
  폐기 없음). 저장 HP ≤ 0으로 끊긴 캐릭터는 재입장 때 HP 1 제자리 부활이었다. 인월드 idle 컷은 300초였고, monolith 종료는 저장 뒤 exit라 직결 클라는
  EOF만 봤다. 클라 `NetworkManager`에는 연결 시간 초과·연결 세대·PONG 감시가 없었고, 단절·KICK은 모두 모달 → Boot였다.
- **요구**: (1) 서버 상태를 우회하지 않는다 — 재접속이 공짜 부활·킥 무효화·옛 기기의 새 로그인 밀어내기가 되면 안 된다. (2) 와이어 변경 0.
  (3) 서버 장애 순간에 끊긴 클라 전원이 한꺼번에 돌아와도(재접속 폭주) 서버가 수렴한다 — 기본으로 켜기 전에 측정으로 확인한다.

## 2. 결정

### 2.1 재입장 경로 — 토큰 재로그인 + GameScene 재로드 (사용자 결정)

재입장은 새 연결에서 `HELLO → AUTH_REQ{mode 2 (Token), username "", secret = 마지막 sessionToken} → (새 토큰 저장) → GameScene 재로드 →
ENTER_WORLD_REQ`다. 씬 상태는 전부 초기화된다(채팅 로그·열린 창 소실 — 감수). resume(같은 세션 이어 붙이기)은 없고, 서버 입장에서는 일반 Token 로그인이라
기존 불변식(계정당 1세션 선점 = flush ≺ AUTH_RESULT ≺ 로드, architecture.md §7.2b)이 그대로 성립한다. 게이트웨이 경유여도 같다 — 연결은 이월하지 않는다(ADR 0002 불변식 2).
`CHAR_LIST_REQ`는 보내지 않는다(캐릭터는 기억한 charId).

### 2.2 세션 토큰 계약 — 교체 + 폐기 (사용자 결정, 서버 슬라이스 ①)

정본은 protocol.md §3.1·architecture.md §7.2다. 요지:
- **1회용·교체**: Token AUTH는 검증이 곧 소비(`sessionRepo.consumeValid` — 단일 `DELETE … RETURNING`)이고 성공하면 새 토큰을 준다. 같은 토큰을 두 연결이
  동시에 내도(멈춘 게이트웨이에 남은 옛 AUTH_REQ, 리플레이) 성공은 하나, 나머지는 일반 실패라 살아 있는 세션을 KICK 8로 밀어내지 않는다.
- **로그인 시 계정 토큰 폐기**: 어느 모드든 성공 AUTH는 계정의 다른 토큰 전부 폐기 + 새 토큰 발급을 한 tx로 한다(`issueExclusive` — 마지막 로그인이 이긴다).
  다른 곳에서 로그인하면 옛 기기 토큰이 죽어, 옛 기기가 자동 재접속으로 새 로그인을 되밀어내지 못한다. GM 킥(KICK 4)도 계정 토큰을 전부 폐기한다
  (`revokeAllForAccount` — 폐기 실패면 KICK 미송신).
- **AUTH_RESULT 유실·발급 실패 = 로그인 화면**(감수): 토큰은 이미 소비됐으므로 같은 토큰의 재시도는 `BadCredentials` → 치명.
- **킬 스위치** env `AUTH_TOKEN_LOGIN=0`: Token AUTH를 소비 없이 같은 실패로 거절 — 클라는 치명으로 보고 로그인 화면(비밀번호 로그인은 영향 없음).


### 2.3 서버 쪽 선결 — 사망 입장·유령 세션 컷·종료 KICK 6 (사용자 결정 포함, 서버 슬라이스 ②)

정본은 architecture.md §7.2c·§1.1이다.
- **사망한 채 끊긴 캐릭터는 사망 상태로 입장**한다(사망 패널 → 직접 부활 선택 — 사용자 결정). 종전 "HP 1 제자리 부활"은 재접속을 공짜 부활로 만들어
  제거했다. 입장 스냅샷 뒤 `DEATH_NOTIFY{attacker 0, 손실 0}`(새 페널티 없음), 부활은 `RESPAWN_REQ`뿐. 사망 flush HP 0 기록·`transferPlayer` DEAD 이월·
  사망 중 레벨업 HP 0 유지로 암묵 부활 경로도 막았다.
- **인월드 idle 컷 300 → 60초**(`IN_WORLD_IDLE_SEC`, 20–300): FIN 없이 사라진 옛 연결이 IP별·전역 상한 몫을 쥐어 재접속이 KICK 9 "connection cap"이
  되던 창을 줄였다. Bun 소켓 타이머가 칸을 스윕 횟수로 세므로 이벤트 루프 정지는 컷을 앞당기지 않는다.
- **monolith 우아한 종료도 KICK 6 "server shutdown"**(종전 EOF만) — 클라가 "서버 재기동"을 KICK reason으로 안다. 종료 저장은 외곽 tx 1개
  (2000명 FULL ≈2 s → ≈0.03 s).

### 2.4 분류·백오프 — KICK reason × 단계로만 (정본 protocol.md §3.6)

- 입력은 (원인, 단계)뿐이다. **KICK detail 문자열로 가르지 않는다**(서버가 계약으로 고정하지 않은 문구). 재시도 = KICK 없는 끊김·KICK 3·PONG 감시(Blip,
  창 90초), KICK 6(Restart, 첫 시도 1–6초·창 180초), 인월드 KICK 9(Shed — 의도적 부하 감축이라 빨리 돌아오면 안 된다, 첫 시도 30–60초·창 300초),
  복구 중 KICK 9·HELLO_ACK 전 종료(Busy — 백오프만, 창은 시작 분류), AUTH `ServerErr`. 치명 = KICK 1·2·4·5·7·8·미지 사유, 그 밖의 AUTH 실패,
  계정·캐릭터 불일치. 창은 복구를 시작한 분류, 백오프는 마지막 실패의 분류가 정하고, 시도 수 상한 없이 창이 끝을 정한다.
- 단계 시간 초과 15 → 30 → 60초(시도 번호로), 응답 대기 중 PONG은 진행으로 쳐 기한을 미루되 2배 상한. PONG 나이 감시는 무장 중 5초 비차단 힌트·45초 해체
  (월드 정지가 전원 동시 재접속 폭주로 번지지 않게 서버가 견디는 정지보다 길게). 플랩 가드(재입장 뒤 30초 안 단절이 300초에 3회 → 포기). 복구 중 송신
  허용 목록(PING·HELLO·AUTH_REQ·ENTER_WORLD_REQ — 인증 전 버킷 첫 위반 KICK 5 방지). 지터는 클라마다 다른 시드.
- 무장은 GameScene에서 현재 연결의 `ENTER_WORLD_OK`일 때만 — 로그인·캐릭터 선택·첫 입장 중의 KICK·단절은 종전 모달 → Boot다.

### 2.5 클라 구조

- **순수 로직**(`Scripts/Net/Reconnect/`, UnityEngine 비의존 — 소스 가드 시험이 참조를 막는다): `ReconnectPolicy`(수치·분류 한 파일 — 순수 함수),
  `ReconnectMachine`(이벤트 구동 상태기계 — 시계·난수·포트 주입, 연결 세대·attemptId로 늦은 이벤트를 버리고, 포트 호출 전에 자기 상태를 먼저 바꿔 재진입
  안전), `IReconnectPorts`, `ReconnectTypes`(분류·단계·원인 — KICK detail은 담지 않는다).
- **전송**(`NetworkManager`): `ConnectAsync(timeoutMs)`(던지지 않음·마지막 호출이 이김), 연결 세대(시작·모든 해체마다 +1 — 옛 세대 프레임·단절은 버림),
  `Disconnected` + `LastDisconnectCause`·`LastDisconnectGeneration`, `PongTimeoutSec`·`SecondsSinceLastPong`(프레임당 PING 주기까지만 가산), `SetSendFilter`.
- **감독자**(`ReconnectSupervisor` — DontDestroyOnLoad): 포트 구현, KICK·단절의 연결별 첫 판정(claim)을 기억해 구독 순서와 무관하게 `KickNoticePanel`·
  `ConnectionNotice`·`EnterWorldBootstrap`의 종전 모달과 소유권을 가른다. 오버레이는 `KickNoticePanel`의 "재연결 중" 모드(재로드를 가로질러 다시 띄움).
- **부하 생성기 미러**: 봇(`tools/loadgen/reconnect/`)이 같은 정책·상태기계의 TS 미러로 재접속한다 — 드리프트 시험이 C# 상수·백오프 표·송신 허용 목록·
  KICK 분기를 대조하고 나머지 로직은 소스 지문으로 고정한다. **정책 수치를 바꾸면 C#·TS·protocol.md §3.6을 같은 커밋에서 고친다.**

### 2.6 슬라이스

| # | 커밋 | 내용 |
|---|---|---|
| ① | `c4b885a` | 서버: 세션 토큰 1회용·로그인 시 계정 토큰 폐기·발급 뒤 점유 재확인·발급 실패 롤백·GM 킥 폐기·킬 스위치 `AUTH_TOKEN_LOGIN` (e2e-token 5 flows) |
| ② | `ce151d0` | 서버: 사망 상태 입장·암묵 부활 봉쇄·`IN_WORLD_IDLE_SEC` 60·monolith 종료 KICK 6(외곽 tx 종료 저장) |
| ③ | `c28c78c` | 시험: 유령 선점(e2e-dup-login Flow 6)·토큰 연속 재접속·우아한 재기동 뒤 토큰 유지(e2e-token f·g)·카오스 C1·C2·C4 토큰 변형 — 서버 결함 0 |
| ④ | `134a135` | 클라 `NetworkManager` 전송 기본기(연결 시간 초과·재진입 안전·연결 세대·PONG 감시·송신 필터, PlayMode 11) |
| ⑤ | `d48c6d4` | 클라 순수 정책·상태기계(EditMode `ReconnectPolicyTests`·`ReconnectMachineTests`(+Edges)·소스 가드) |
| ⑥ | `02dd818` | 클라 감독자 배선·재연결 오버레이·라이브 시험(EditMode 24·PlayMode `ReconnectLiveTests` 9) — **기본 꺼짐 게이트** |
| ⑦ | `cb5531f` → `8d88569` → `58240c0` | 7A 봇 토큰 재접속·카오스 트리거·폭주 보고서(`STORM_GATE`) → 1회차 측정(게이트웨이 kill 1500 미달) → 공유 포트 리스너 양보(IPC v14 — ADR 0002 §5.1) → 7B 재측정·A/B 통과 → **기본 켬** |
| ⑧ | (이 ADR) | 문서 — 이 ADR, protocol.md §3.6, ADR 0002 §4.4·§7, ops-cluster §8 |

인증·토큰·세션을 바꾸는 슬라이스(①·②·⑥)는 code-reviewer + security-reviewer를 Fable로 승격해 리뷰했다(CRITICAL/HIGH 0).

### 2.7 기본 켬 관문 (사용자 결정)

감독자는 기본 꺼짐(⑥)으로 들어가고, 재접속 폭주 측정의 관문 `STORM_GATE`를 통과한 뒤에만 켠다: 끊긴 봇 ≥ 99%가 **시작 분류의 창 안에** 복귀 · 치명 0 ·
부수 끊김(피해자가 아닌 봇의 끊김) 0 · 마지막 복귀 뒤 30초 안에 5초 평균 ≥ 19.5 Hz · 카오스 시점 접속 ≥ 99%(전제). 1회차가 수용 안 구성 중에서는
게이트웨이 kill 1500에서만 미달하자(2000도 복귀 92.44%로 미달했지만 정상 상태부터 수용 초과 17.70 Hz인 구성 — §4.1) 사용자는 **"입구부터 고치고
켜기"**를 골랐다(§4.1).

## 3. 기각한 대안

| 대안 | 기각 이유 |
|---|---|
| **세션 resume / 씬 재로드 없는 무중단 재접속**(서버가 옛 세션을 잠시 붙잡고 새 연결에 이어 붙임, 클라는 씬을 유지하고 상태만 재동기화) | 서버에 "주인 없는 인월드 세션" 상태와 그 만료·저장·선점 규칙이 새로 생기고, 게이트웨이 경유에서는 연결이 다른 게이트웨이로 오므로 세션 이월 IPC가 필요하다(ADR 0002 불변식 2 — 연결은 이월하지 않는다). 클라는 씬에 남은 모든 상태(엔티티·창·쿨다운·퀘스트 추적·대화)를 권위 스냅샷으로 재조정해야 하고, 첫 입장 경로와 재입장 경로가 둘로 갈라져 시험 표면이 두 배가 된다. 재로드는 첫 입장과 같은 코드 하나로 끝나며, 대가(채팅·열린 창 소실)는 사용자가 감수했다. 와이어 변경 0도 지킨다 |
| **장수 refresh 토큰 / 토큰 재사용**(종전처럼 7일 동안 같은 토큰을 여러 번 쓰거나 별도 refresh 토큰을 둠) | 재사용 토큰은 가로채면(평문 TCP — architecture.md §10.1) 만료까지 리플레이되고, 정당한 클라가 계속 쓰므로 드러나지도 않는다. 1회용이면 먼저 쓴 쪽이 이기고 다른 쪽의 다음 재로그인이 실패해 드러난다. 킥·다른 곳 로그인 뒤에 옛 기기가 그 토큰으로 자동 재접속해 새 세션을 KICK 8로 되밀어내는(두 기기가 서로를 무한 선점) 경로도 열린다 — 교체 + 계정 토큰 폐기가 이를 닫는다. 대가(AUTH_RESULT 유실 = 로그인 화면)는 감수 |
| **재접속 시 제자리 부활**(종전 HP 1 부활 유지) | 사망 → 끊기 → 재접속이 공짜 부활(사망 페널티·Town 귀환 회피)이 된다. 자동 재접속이면 의도하지 않아도 매번 일어난다 — 사망 상태 입장(§2.3)으로 바꿨다 |
| **KICK detail 문자열로 분류**(예: "server busy" vs "connection cap" vs "pre-auth cap"을 문구로 가름) | detail은 서버가 계약으로 고정하지 않은 ASCII 문구다(protocol.md §3.5 — 사용자 문구는 클라가 reason으로 매핑). 문구를 고치면 클라 동작이 조용히 바뀐다. 같은 reason의 하위 구분이 필요하면 단계(인월드 ↔ 복구 중)가 대신한다 — KICK 9는 인월드면 Shed, 복구 중이면 Busy |
| **관문 없이 기본 켬 / 1회차 미달 상태로 켬** | 재접속 폭주는 장애 순간에 전원이 한꺼번에 돌아오는 부하라, 평소 부하 측정으로는 보이지 않는다. 1회차는 실제로 게이트웨이 kill 1500에서 13명이 창 안에 못 돌아왔고(원인은 재접속 로직이 아니라 reusePort 배치), 그 상태로 켜면 게이트웨이 크래시가 "일부 사용자는 수동 재로그인"으로 끝난다. 관문을 둬서 입구 결함(§4.1)을 먼저 찾았다 |
| **슈퍼바이저 조정·eBPF reuseport 조향**(1회차 원인 — 커널 해시가 부하를 모름 — 의 대안) | 리스너 양보(월드 조정형)를 택했다 — 기각 이유는 ADR 0002 §5.1(eBPF: Bun 리스너에 BPF를 붙일 API 없음·CAP_BPF 의존, 슈퍼바이저: 운영에 늘 있지 않고 부하 신호를 받지 않음, 게이트웨이 단독 판단: 동시 정지 시 리스너 0, 앞단 L4 프록시: 단일 장애점·PROXY protocol 선결) |
| (보조) 짧은 PONG 감시(예: 10–15초) | 클라 PING은 월드가 답하므로 월드가 그만큼 멈추면 전원이 동시에 링크를 내려 정지 직후 재접속 폭주가 된다. 45초 + 감시 해체 뒤 첫 시도 U(0, 10)로 넓게 흩는다. 짧은 무응답은 5초 비차단 힌트로만 보인다 |
| (보조) 짧은 단계 시간 초과(고정 5–10초) | 접속 폭주에서 핸드셰이크 p99가 ≈50초였다(architecture.md §10) — 짧으면 서버가 처리 중인 시도를 클라가 버리고 다시 줄을 서 수렴하지 못한다. 15 → 30 → 60초 + PONG 진행 연장으로 했다 |

## 4. 결과

### 4.1 측정 (원표 `perf-baseline.md` "자동 재접속 폭주 (2026-10-15)")

WSL2(커널 6.18) 같은 PC, 서버·부하 생성기 Bun 1.4.3, spread·hold 30 s, pinmon 핀 고정(월드 CPU 2,3·gw1 4,5·gw2 6,7 — 재기동한 프로세스도 재고정).
봇은 클라와 같은 정책의 TS 미러로 토큰 재로그인하고, 카오스 트리거가 정상 상태 30초 뒤 프로세스를 죽이거나 재시작한다. 모든 런에서 **치명 0·부수 끊김 0**.

- **1회차(`cb5531f`, 양보 없음 — 호스트 바쁨)**: monolith 재시작 700(전원 KICK 6 — Restart)·월드 kill/재시작 1500·2000(Restart)·게이트웨이 kill
  1000·1200(KICK 없는 끊김 — Blip)은 첫 시도로 100% 복귀, 복귀 p99 5.0–6.3 s(최대 6.6 s) → 통과. **게이트웨이 kill 1500만 98.29% 미달**(포기 13 — 전원
  `kick:9@awaitHelloAck`, KICK 9 189, 복귀 p99 58.8 s). 게이트웨이 kill 2000도 창 안 복귀 92.44%(포기 75·KICK 9 1,035)로 미달했지만 정상 상태부터
  17.70 Hz(수용 초과)인 구성이라 Hz 관문은 참고다(2회차 — 양보 켬 — 에서는 2000도 통과). Linux monolith
  재시작은 전원 KICK 6을 받았다(Windows에서 보이던 RST에 의한 KICK 6 소실은 재현되지 않음).
- **원인 — 재접속 로직이 아니라 입구 배치**: gw1이 죽고 ≈0.7 s 뒤 재기동하자 커널 reusePort 해시가 부하와 무관하게 새 연결을 ≈50/50으로 나눴다. 생존한
  gw2는 자기 ≈740명 + 피해자 절반 ≈1,094연결에서 CPU 접속 제한(90%)이 닫혔고 재시도의 ≈50%가 다시 gw2로 가 KICK 9를 받았다(gw1은 ≈380으로 한산).
  수동 재로그인이어도 같은 KICK 9다.
- **수정**: 공유 포트 리스너 양보(`8d88569`, IPC v14 — ADR 0002 §5.1). 새 클라를 거절 중인 게이트웨이가 월드 지시로 리스너를 잠시 내려 새 연결이 받을 수
  있는 게이트웨이로만 간다.
- **2회차(`8d88569`, 양보 켬·기본 문턱 — 호스트 한가)**: 게이트웨이 kill 1500 ×2·2000·월드 kill 1500 전부 통과, 첫 시도 복귀 99.1–100%, 복귀 p99
  5.0–6.0 s. 2000은 gw2가 1,350연결에서 닫혀 양보했고, 양보 순간 accept 대기열 RST 8건(`closed@awaitHelloAck` — `tcp_migrate_req` 0)이 두 번째 시도에
  gw1로 갔다(최대 16.9 s).
- **A/B**(같은 세션 번갈아, `GW_ADMISSION_CPU_PCT` 70으로 닫힘 강제, gw1 SIGKILL 1500): 종전 99.05·99.08%(포기 7·7, KICK 9 192·158, 복귀 p99 56.2·51.9 s)
  → 양보 100·100%(포기 0·0, KICK 9 0·3, p99 5.0·5.0 s). 기본 문턱(90)에서는 이날 두 쪽 다 닫히지 않아 둘 다 통과 — 1회차 미달은 호스트가 바빠 문턱을
  넘은 경우이고, 양보는 문턱을 넘어도 관문을 지킨다. **관문 충족 → 기본 켬(`58240c0`).**
- 해석[계산]: 복귀 p50이 Restart 클래스 3.5 s·Blip 클래스 2.5 s로 첫 시도 지터의 평균(U(1, 6) → 3.5, U(0, 5) → 2.5)과 같다 — 막힘이 없으면 복귀 시간은 거의
  지터 그 자체이고 핸드셰이크·재로드는 짧다. 1회차 통과 런의 p99 5.0–6.3 s도 지터 상한(Blip 5 s·Restart 6 s) 근처다.

### 4.2 얻은 것

- 서버·회선 장애가 사용자 입력 없이 복구된다. 걸리는 시간은 분류마다 다르다 — **측정**: 게이트웨이 SIGKILL(Blip)·월드 kill/재시작·monolith 재시작
  (KICK 6 → Restart)은 최대 2000명 동시 피해에서 창 안 100%·복귀 p99 5.0–6.3 s(양보 순간 RST를 맞은 소수는 Busy 재시도로 최대 16.9 s). **정책상만(대량
  측정 없음)**: SIGTERM 롤링 게이트웨이 재시작은 KICK 6 → Restart(첫 시도 1–6 s — ops-cluster §8 "SIGTERM 롤링 자체는 미측정"), 회선 순단은 Blip(0–5 s
  — 기능 시험은 PlayMode `ReconnectLiveTests` 단절 1종). **인월드 부하 감축(KICK 9 → Shed)은 일부러 느리다** — 첫 시도 30–60 s·재시도 30 s 이상·창
  300 s(빨리 돌아오면 감축이 무의미 — §5). ADR 0002 §4.4의 대가("클라 자동 재접속이 없어서 KICK 모달 뒤 Boot")가 없어졌다 — 롤링 게이트웨이 재시작
  절차가 바뀌었다(ops-cluster §8).
- 클라 와이어 변경 0, 서버 입장에서는 일반 Token 로그인이라 선점 인과·존 입장·GM이 그대로다. 토큰 1회용·교체·폐기는 자동 재접속과 무관하게도 이득이다
  (리플레이 창 축소·옛 기기 정리·GM 킥이 실제로 효력을 가짐).
- 재접속 폭주가 측정 도구(봇 재접속·카오스 트리거·`STORM_GATE` 보고서)로 반복 측정 가능해졌고, 그것이 reusePort 입구 결함을 찾아냈다.

### 4.3 대가

- 재입장마다 GameScene 재로드 — 채팅 로그·열린 창·로컬 UI 상태가 사라진다(사용자 결정).
- AUTH_RESULT 유실·토큰 발급 실패·킬 스위치는 로그인 화면으로 간다(토큰 1회용의 감수 범위).
- 정책이 C#·TS 두 곳에 있다(봇 미러 — 드리프트 시험이 묶는다).
- 서버 장애마다 재접속 폭주가 생긴다 — 게이트웨이 N개 구성은 한 개가 빠져도 남은 쪽이 접속 제한 문턱 아래에 머무는 N−1 여유가 필요하다(ops-cluster §9).

## 5. 설계 대비 변경 (구현 중 결정)

| 항목 | 설계(2026-10-14) | 구현 | 근거 |
|---|---|---|---|
| 첫 시도 지터 | U(0, 5) s | 분류별 — Blip U(0, 5)·PONG 감시 해체 뒤 U(0, 10)·Restart 1–6·Shed 30–60 s | KICK 6은 서버가 재기동 중이라 즉시 돌아와도 거절이다(최소 1 s). 감시 해체는 월드 정지로 한꺼번에 끊긴 클라라 더 넓게 흩는다. 인월드 KICK 9는 서버가 일부러 줄인 부하라 빨리 돌아오면 감축이 무의미하다 |
| 단계 시간 초과 | 15 → 60 s | 15 → 30 → 60 s(시도 번호로) + 응답 대기 중 PONG이 기한을 미룸(단계 시작 + 2 × 제한 상한) | 폭주 때 핸드셰이크 p99 ≈50 s — 서버가 살아 있다는 증거(PONG)가 있으면 기다린다 |
| KICK 9 분류 | "혼잡/감축은 긴 대기" | 인월드 = Shed(창 300 s), 복구 중 = Busy(백오프만 — 5 s 이상, 창은 시작 분류). HELLO_ACK 전 KICK 없는 종료도 Busy | 같은 reason이 두 뜻(감축 ↔ 접속 거절)이라 detail 대신 단계로 갈랐다. Windows는 접속 단계 거절을 KICK 없는 맨 RST로 보낼 수 있다 |
| AUTH 실패 | 토큰 실패 = 치명 | `ServerErr(4)`만 Blip 재시도, 그 밖은 치명 | 서버 쪽 일시 장애(DB 오류 등)는 재시도 가치가 있다. 단 발급 단계 실패면 이미 소비된 토큰이라 다음이 `BadCredentials` → 치명 — 서버가 감수한 트레이드오프와 같다 |
| 플랩 가드 | — | 재입장 뒤 30 s 안 단절이 300 s 안에 3회 → 포기 | 이 캐릭터의 입장이 서버를 죽이거나 서버가 받고 바로 죽는 경우 재시도가 해를 키운다 |
| 시도 수 | — | 상한 없음 — 창(시작 분류)이 끝을 정하고, 판정은 다음 시도의 시작 시각만 | 분류별로 기다리는 시간이 달라 횟수보다 시간이 사용자 경험에 맞는다. 진행 중인 시도를 창 경계에서 끊지 않는다 |
| 복구 중 송신 | — | PING·HELLO·AUTH_REQ·ENTER_WORLD_REQ만(필터) | 재로드된 씬의 다른 송신이 인증 전 버킷(10, 10/s)을 쓰면 첫 위반이 KICK 5(치명)다 |
| 소유권 | — | 감독자가 연결별 첫 판정(claim)을 기억 — 상태기계가 연결을 쥔 상태(무장·Connecting~AwaitEnterWorld)만 감독자 몫 | `KickNoticePanel`·`ConnectionNotice`·`EnterWorldBootstrap`·감독자가 같은 KICK·단절을 구독한다 — 구독 순서와 무관하게 같은 답이 나와야 종전 모달이 섞이지 않는다 |
| 기본 켬 시점 | 폭주 측정 통과 뒤 | 1회차 미달 → 공유 포트 리스너 양보(IPC v14) 선행 → 재측정·A/B 통과 뒤(사용자 결정 "입구부터 고치고 켜기") | §4.1 — 원인이 클라 정책이 아니라 입구라 클라를 고쳐도 소용이 없었다 |
| 인월드 idle 컷 | — | 300 → 60 s(env 20–300) | 유령 연결이 IP별 상한을 쥐는 창. Blip·Busy 창(90 s)이 이보다 길어야 한다(`ServerInWorldIdleCutSec`) |
| 해제 시 자격 사본 | — | 해제·취소·종료 때 상태기계가 토큰·계정·캐릭터 사본을 지움 | 1회용 토큰 사본을 메모리에 남기지 않는다. 다음 복구는 새 무장(Arm)이 자격을 준다 |
| 무장 조건 | 게임 씬 진입 뒤 | GameScene + 현재 연결 세대의 `ENTER_WORLD_OK` + 준비된 LoginContext | 이전 세대 패킷·로그인 화면 단절로 무장하지 않는다. 계정 id 없이 들어온 경로는 경고 1줄 뒤 조용히 꺼진다 |

## 6. 보류 항목과 트리거

> **발췌본에서 생략** — 후속 과제 목록은 공개 범위에서 뺐습니다.

## 7. 참조

- 정책 표(정본은 코드): `shared/protocol.md` §3.6, `client/Noah/Assets/Scripts/Net/Reconnect/ReconnectPolicy.cs`·`ReconnectMachine.cs`·`ReconnectTypes.cs`
- 배선: `client/Noah/Assets/Scripts/UI/ReconnectSupervisor.cs`·`ReconnectSupervisor.Ports.cs`·`ReconnectWiring.cs`·`ReconnectOverlay*.cs`, `Network/NetworkManager.cs` —
  architecture.md §8.6
- 서버: `server/src/network/handlers/authHandler.ts`·`server/src/identity/sessionRepo.ts`(토큰), `server/src/admin/gmMutate.ts kickPlayer`(GM 킥 폐기),
  `server/src/gracefulShutdown.ts`(종료 KICK 6), `server/src/network/clientEdge.ts DEFAULT_IN_WORLD_IDLE_SEC` — architecture.md §7.2·§7.2c·§1.1
- 시험: Unity EditMode `ReconnectPolicyTests`·`ReconnectMachineTests`(+Edges)·`ReconnectSourceGuardTests`·`ReconnectWiringTests`, PlayMode
  `NetworkManagerTransportTests`·`ReconnectLiveTests`(`docs/followup-validation.md`), 서버 `e2e-token`·`e2e-dup-login` Flow 6·`e2e-death-reentry`·
  `e2e-shutdown`(두 토폴로지)·카오스 C1·C2·C4 토큰 변형·C8(리스너 양보), 부하 생성기 `tests/server/loadgen/reconnect*.test.ts`·`zz-loadgen-reconnect-smoke`
- 측정: `docs/perf-baseline.md` "자동 재접속 폭주 (2026-10-15)", 실행 도구 `tools/loadgen/README.md`(`--chaos`·`STORM_GATE`)
- 운영: `docs/ops-cluster.md` §8(롤링 재시작·월드/monolith 재시작)·§9(리스너 양보·N−1 여유·`tcp_migrate_req`)
