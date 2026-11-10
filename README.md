# Noah — 서버·네트워크 계층 발췌

Unity 클라이언트와 Bun(TypeScript) TCP 서버로 만든 2D MMORPG **Noah**(비공개 프로젝트)에서, 서버 엔진·네트워크 계층과 설계 문서만 골라 낸 저장소입니다.

> **발췌본입니다.** 게임 규칙(전투·아이템·퀘스트 등), 영속·인증, 운영 도구, 게임 데이터, 아트 에셋은 들어 있지 않습니다.
> 그래서 서버를 띄우거나 게임을 실행할 수는 없고, 여기 실린 모듈의 코드젠 검사·타입 검사·린트·시험만 단독으로 돕니다.

코드의 동작은 원 저장소와 같습니다. 공개용으로 손본 곳은 다음뿐입니다.

- **문서** — 게임 규칙·저장·인증·악용 방지처럼 공개 범위 밖인 절은 제목만 남기고 본문을 "발췌본에서 생략"으로 바꿨고, 같은 내용을 가리키는 문장 몇 곳을 지웠습니다. 측정 문서에 있던 사용자 폴더 경로도 가렸습니다.
- **주석·시험 이름** — 운영상 남은 과제를 적어 둔 주석 몇 곳과 시험 이름 세 곳을 줄였습니다. 실행 코드는 한 줄도 바꾸지 않았습니다.
- **패킷 스키마** — 패킷별 설명 문자열(`_doc`)을 지웠습니다. 와이어 형식과 생성 코덱의 동작은 같고, 생성 파일 머리의 스키마 해시만 다시 계산됐습니다.
- **설정 파일** — `package.json`, `bunfig.toml`, `server/tsconfig.json`의 제외 목록, CI는 이 저장소에 맞게 새로 썼습니다.

## 전체 시스템 한눈에

- **서버 권위 + 클라 예측·재조정** — 클라는 입력만 보내고 서버가 20 Hz 고정 tick에서만 상태를 바꿉니다.
- **AOI 기반 송신** — 16타일 셀 격자의 3×3 창 안 대상에게만 보냅니다. 전체 방송 경로는 두지 않습니다.
- **바이너리 프로토콜** — 스키마 한 곳(`shared/schema/packets.json`)에서 TypeScript·C# 코덱을 생성합니다.
- **결정론** — 시뮬 코드는 벽시계와 `Math.random`을 쓰지 않고 `tickIndex`와 시드 난수만 씁니다.
- **단일 프로세스가 기본, 게이트웨이 분리는 선택** — 월드 1개 + 게이트웨이 N개로 나눠도 클라와 와이어는 바뀌지 않습니다.

## 어디를 보면 되나

| 주제 | 코드 | 문서 |
|------|------|------|
| 바이너리 프로토콜 코드젠 | `tools/codegen/` → `server/src/net/*.generated.ts`, `client/Noah/Assets/Scripts/Net/*.Generated.cs` | [ADR 0003](docs/adr/0003-binary-body-codec.md) |
| 프레이밍·수신 버퍼·송신 백프레셔 | `server/src/net/ringBuffer.ts`, `wireFrame.ts`, `server/src/network/outboundLink.ts`, `frameOutbox.ts`, `deferredSends.ts` | [architecture §3](docs/architecture.md) |
| 접속 상한·속도 제한·과부하 보호 | `server/src/network/clientEdge.ts`, `server/src/net/rateLimit.ts`, `overloadSignal.ts`, `ipBucket.ts` | [architecture §4.1](docs/architecture.md) |
| 고정 tick 루프 | `server/src/sim/tickLoop.ts`, `gcPacer.ts`, `server/src/obs/tickProfiler.ts` | [architecture §4](docs/architecture.md) |
| AOI·스냅샷 델타·공유 프레임 | `server/src/world/aoi/`, `server/src/sim/snapshotBuilder.ts`, `snapshotDelta.ts`, `deltaGroups.ts` | [architecture §5](docs/architecture.md) |
| 게이트웨이 분리(월드 ↔ 게이트웨이 IPC) | `server/src/cluster/`, `server/src/gateway/` | [ADR 0002](docs/adr/0002-gateway-split.md), [architecture §3.4](docs/architecture.md) |
| 경로 탐색·벽 충돌 | `server/src/world/nav/`, `client/Noah/Assets/Scripts/World/Nav/` | — |
| 클라 예측·재조정·보간 | `client/Noah/Assets/Scripts/Sim/` | [architecture §8](docs/architecture.md) |
| 클라 자동 재접속 상태기계 | `client/Noah/Assets/Scripts/Net/Reconnect/` | [ADR 0004](docs/adr/0004-client-auto-reconnect.md) |
| 로깅·메트릭·크래시 처리 | `server/src/obs/` | [architecture §9](docs/architecture.md), [ops-logs](docs/ops-logs.md) |

두 언어가 같은 결과를 내는지는 골든 파일로 확인합니다. 코드젠이 `wire.golden.json`을 만들고 TypeScript 시험과 C# EditMode 시험이 같은 파일을 읽습니다. 경로 탐색(`Resources/Nav/*.golden.json`)과 이동 예측(`Resources/MoveSync/movesync.golden.json`)도 같은 방식입니다. 이동 예측 골든을 만드는 서버 쪽 시나리오는 존 본체에 기대고 있어 여기에는 없습니다.

## 측정 결과

전부 [docs/perf-baseline.md](docs/perf-baseline.md)에 방법·환경·원자료와 함께 있습니다. 개발 PC 한 대에서 부하 생성기와 서버를 같이 돌린 루프백 측정이 대부분이라, 절대값보다 전후 비교로 읽어야 합니다.

| 작업 | 결과 | 근거 |
|------|------|------|
| 서버 핫패스 최적화(A* 힙, AOI 데이터 지향, 팬아웃 1회 인코딩 등) | tick p99가 25 ms를 넘는 동시 접속 수가 250 → 약 720(Windows), 약 705(Linux) — stock 시나리오 | "성능 3단계 — Bun 최적화 후" |
| 게이트웨이 분리 + 공유 프레임 | 같은 기준에서 단일 프로세스 약 678 → 게이트웨이 2개 약 1,159(1.71배) — spread 시나리오 | "성능 4.5 — admission·MULTICAST 후", [ADR 0002](docs/adr/0002-gateway-split.md) |
| JSON → 바이너리 본문 전환 | 서버 수신 바이트 −56%, 월드 → 게이트웨이 IPC −45% | "이진 전환 B6 — 최종", [보고서](docs/reports/binary-transition-2026-10.md) |
| Bun 1.3 → 1.4.3 | 서버 CPU 단일 프로세스 −23%, 월드 −41% | "Bun 1.4.3 전환", [보고서](docs/reports/bun-1.4.3-2026-10.md) |
| 클라 자동 재접속 | 게이트웨이·월드를 죽여 1,500–2,000명을 동시에 끊는 측정에서 첫 시도 복귀 99.1–100%, 복귀 p99 5.0–6.0 s | [ADR 0004 §4.1](docs/adr/0004-client-auto-reconnect.md) |

## 실행

[Bun](https://bun.sh) 1.4.3이 필요합니다.

```sh
bun install
bun run gen:check   # 스키마와 생성 코덱(TS·C#)·lock이 어긋나지 않았는지
bun run typecheck
bun run lint
bun test
```

Windows에서는 유닉스 소켓 시험을 건너뜁니다.

## 발췌 범위

| 넣은 것 | 뺀 것 |
|---------|-------|
| 와이어 코덱·프레이밍, 전송 계층, 월드 ↔ 게이트웨이 IPC, tick 루프, AOI·스냅샷, 경로 탐색, 관측 | 패킷 핸들러와 게임 시스템(전투·스킬·아이템·퀘스트·생활), 존 본체 |
| 패킷 스키마와 코드젠 도구, 세션 상태머신(`identity/loginFlow.ts` — 전송 계층이 쓰는 순수 모듈) | 계정·비밀번호·세션 토큰 처리, DB 스키마와 저장 경로, GM 도구 |
| 위 모듈의 단위 시험 | 통합·e2e·멀티 프로세스 시험, 부하 생성기 |
| 클라 넷코드(C#) — Unity 프로젝트 없이 읽기용 | 클라 UI·월드·연출 코드, 씬·프리팹·아트·사운드 |
| 설계 문서(일부 절 생략), ADR 0001–0004, 로그 운영 가이드, 성능 측정 기록 | 게임 데이터 파일(아이템·몬스터·드롭·퀘스트), 콘텐츠 기획 문서, 클러스터 운영 가이드 |

코드젠 골든과 시험 픽스처에는 형식을 시험하려고 넣은 예시 문자열이 조금 있습니다. 문서 안의 링크 가운데 뺀 파일을 가리키는 것은 열리지 않습니다.

### 타입 검사에서 뺀 파일

아래 파일은 싣지 않은 모듈(세션에 붙는 캐릭터·퀘스트 상태, 게임 컴포넌트 타입, 핸들러 표)을 import합니다. 원문 그대로 두었고 읽기용입니다. `server/tsconfig.json`의 `exclude`에 같은 목록이 있습니다. 이 가운데 타입만 가져오는 파일은 실행에는 문제가 없어서 해당 시험은 그대로 돕니다.

- `server/src/cluster/gatewayPeer.ts`
- `server/src/cluster/worldIpcServer.ts`
- `server/src/cluster/worldListen.ts`
- `server/src/gateway/gatewayMain.ts`
- `server/src/network/castFanout.ts`
- `server/src/network/frameIngest.ts`
- `server/src/network/packetAdmission.ts`
- `server/src/network/session.ts`
- `server/src/network/sessionManager.ts`
- `server/src/network/tcpServer.ts`
- `server/src/sim/deltaGroups.ts`
- `server/src/sim/snapshotBuilder.ts`
- `server/src/sim/snapshotDelta.ts`
- `server/src/world/aoi/grid.ts`
- `server/src/world/aoi/interestSet.ts`
- `server/src/world/entityTable.ts`
- `server/src/world/targetMap.ts`

## 이용 조건

열람을 위한 공개입니다. 별도의 라이선스를 부여하지 않으며 모든 권리는 저작자에게 있습니다.
