# ADR 0001 — 단일 프로세스 monolith + 분산 이행 비용 제한 규율

> **소급 기록(placeholder).** 원문은 레포에 커밋된 적이 없다 — git 이력 전체(`git log --all -- docs/adr`)에 `docs/adr/`가
> 없고, 이 번호를 처음 인용한 커밋은 `dec21b4`(2026-05-03, "핸들러 DI 컨텍스트 도입 … 분산화 P3 prep, ADR 0001")다.
> 아래는 서버 코드 12개 파일의 `ADR 0001` 주석에서 복원한 요지다. 원문이 발견되면 이 파일을 원문으로 바꾼다.

- 상태: 채택(v2 재설계, 2026-05) — 소급 기록 2026-10-07
- 후속: [ADR 0002](0002-gateway-split.md)는 이 결정을 뒤집지 않는다. 기본 모드는 여전히 단일 프로세스
  (`ROLE=monolith`)이고, 클라 소켓 계층만 opt-in 게이트웨이 프로세스로 뗀다. 게임 상태·DB는 계속 한 프로세스(월드)에 있다.

## 결정

서버는 **Bun 프로세스 1개**(다중 zone, 20 Hz 권위 tick, `bun:sqlite` 단일 writer)로 운영한다. 분산(멀티 프로세스·멀티 노드)은
필요가 측정으로 확인될 때까지 미룬다. 대신 나중에 나눌 때 비용이 폭증하지 않도록 아래 규율을 지금부터 지킨다.

## 규율 (코드 주석이 이 ADR을 인용하는 지점)

| 규율 | 이유 | 인용 위치 |
|---|---|---|
| repo 시그니처는 `async`/`Promise` — `bun:sqlite`는 동기지만 | 분산 단계에서 RPC·Postgres 어댑터로 바꿀 때 호출자를 고치지 않는다 | `identity/accountRepo.ts`·`characterRepo.ts`·`sessionRepo.ts`·`inventoryRepo.ts`·`characterSkillsRepo.ts`·`characterQuestsRepo.ts` |
| 핸들러는 `HandlerCtx`를 받는 팩토리(`createXxxHandler`) — zone·sessionManager·repo를 직접 import하지 않는다 | 노드마다 자기 의존성을 주입할 수 있게 | `network/handlers/context.ts`, wiring root `worldMain.ts` |
| Zone(순수 시뮬)은 repo·session을 import하지 않는다 — tick은 outcome을 버퍼에 쌓기만 하고, EXP·영속 같은 DB I/O는 tick 밖 드레인에서 | 시뮬과 영속의 경계 = 결정론 경계, 분산 시 시뮬 노드와 영속 노드를 나눌 수 있게 | `world/combatOutcome.ts`, `world/zone.ts` `handleKill`, `identity/questProgressService.ts` |
| repo가 진짜 비동기가 되는 경우(Postgres)를 가정한 순서 방어 | 지금은 도달 불가지만 async repo에서 열리는 경합을 미리 막는다 | `network/handlers/enterWorldHandler.ts`(계정 점유 재검사), `network/handlers/authHandler.ts`(세션 토큰 발급 뒤 계정 점유 재확인 — 남은 과제는 architecture.md §7.2 "async 어댑터 전환 시 후속 과제") |

## 결과

- 이 규율 덕분에 ADR 0002(게이트웨이 분리)는 핸들러·zone·repo를 한 줄도 바꾸지 않았다 — 세션 송신 표면(`ClientLink`)과 소켓 엣지만
  이음새로 바꿨다.
- 단일 writer·in-memory 권위(중복 로그인 인과, 존 이동 동기 핸드오프, GM) 불변식은 한 프로세스 안에서 구조적으로 성립한다.
