# ADR 0003 — 바이너리 본문 코덱 (코드젠 v2 + 참조 인터프리터 + 와이어 지문 lock)

- 상태: **채택 — 완료(B6, 2026-10-13).** C0.1(인프라)·C0.2(타입화 송신)·C0.3(C# 코덱 + 교차 언어 골든) 위에서 단계형 flip(B1 헤더 → B2 C2S →
  B3·B4 S2C → B5 자유 형식 → B6 JSON 제거)이 끝났다 — **모든 패킷**(C2S 29개·S2C 42개 — SNAPSHOT_DELTA + B3b 고빈도 11개 + B4 나머지 고정형 17개 + B5②b
  인벤·상점 3개 + B5③b 스킬·UI 설정 2개 + B5④b NPC 대화·퀘스트 4개 + B5①b 캐릭터·포탈 4개, protoVersion 11 — IPC_VERSION 13)의 본문이 바이너리다.
  B6(와이어 불변)이 JSON 본문 경로·`defaultEncoding`·패킷 `encoding`·`freeform`·lock의 JSON 지문을 지웠고(gen이 그 키를 거부), 프레임 본문 JSON 재도입은
  CI 가드가 막는다(§3 B6). B6 최종 성능 측정도 끝났고(`perf-baseline.md` "이진 전환 B6 — 최종" — 수신 −56%·월드 IPC −45%·클라 송신 −6%·서버 CPU −5~8%),
  남은 일은 형태 변경 후보(각각 별도 bump — §3 "B6 이후로 남는 것")다.
  이력: B2c(와이어 불변)에서 수신이 사전 판정 → 디코드 순이 되고 디코드 실패 strike KICK이 생겼다(§3). B3a(와이어
  불변)에서 MOVE_PATH·SKILL_EFFECT·ENTITY_SPAWN.type이 JSON 상태로 스키마를 얻었고, B3b에서 그것들과 HELLO_ACK(동결)·KICK 등 11개가 flip됐다(§3).
  B4에서 AUTH_RESULT·ENTER_WORLD_OK·ZONE_INFO 등 고정형 17개가 flip되고 송신 단위 인코드 실패 방어층(그 패킷만 버림)이 생겼다(§3). B5는 자율 형식을
  도메인마다 JSON 상태 스키마화(a) 뒤 flip(b)했다 — ②(인벤·상점 3개)·③(스킬·UI 설정 2개)·④(NPC 대화·퀘스트 4개)·①(캐릭터·포탈 3개 + CHAR_LIST
  `CharSummary[]` 형태 변경)이 끝나 S2C 전부가 바이너리가 됐다(§3). B6이 남은 JSON 경로를 지웠다(§3 B6).
- 날짜: 2026-10-12
- 관련: [`shared/protocol.md`](../../shared/protocol.md) §2(와이어 규칙 정본)·§6(코드젠·lock) · [`architecture.md`](../architecture.md) §3.3 ·
  [ADR 0002](0002-gateway-split.md)(GC 페이서 이후 월드 할당의 대부분이 입력 경로라는 측정이 동기)

## 1. 맥락

- **동기**: GC 페이서 작업에서 월드 프로세스 할당의 대부분이 입력 경로(INPUT_CMD 20 Hz × CCU를 매번 `JSON.parse`)에서 나온다는 것을
  확인했다. 문서에 있던 "Phase D step 2 — 전체 바이너리 + 4바이트 LE 헤더"를 단계형으로 끝까지 진행하기로 했다.
- **전 상태**: `tools/codegen/gen.ts`는 타입만 생성했다(JSON 전용, 원시 필드만). 71개 패킷 중 15개는 `fields: []` 자율 JSON이었다.
  SNAPSHOT_DELTA만 수기 바이너리(`net/binaryCodec.ts` + `sim/snapshotDelta.ts` typed-array 빠른 경로)였다.
- **요구**: (1) 스키마 단일 진실(`packets.json`)에서 서버 TS·클라 C# 코덱을 함께 생성, (2) C2S 디코더는 보안 경계 — 엄격·예외 없음·
  할당 최소, (3) 여러 커밋에 걸친 flip 동안 "와이어를 바꾸는 커밋은 protoVersion을 올린다"를 사람이 아니라 도구가 강제.

## 2. 결정

### 2.1 와이어 규칙 (정본 protocol.md §2)

LE·패딩 없음·고정 폭. string = u16 UTF-8 바이트 길이 + 엄격 UTF-8, array = u16 개수 + 원소(중첩 금지), 바이너리의 string·array는 `max`
필수. optional = 필드 목록 맨 앞 presence 비트마스크(ceil(k/8)바이트, LSB부터, 미사용 비트 0). enum = repr 폭 코드. f32/f64 NaN·±Inf 금지,
시간은 f64. 디코더는 본문을 정확히 소비하고, 첫 위반이 결과이며, 길이·개수 범위를 내용보다 먼저 본다. 패킷별 최악 본문 ≤ 65535.

기각한 대안:
- **varint(LEB128) 길이**: 짧은 패킷이 대부분이라 크기 이득이 작고 디코더 분기·경계 검사가 늘어난다. u16 고정은 미래 u16 프레임 길이(B1)와
  상한이 맞는다.
- **필드마다 u8 존재 플래그(`opt<T>`)**: optional 하나당 1바이트(비트마스크는 1/8바이트)이고, 앞쪽 비트마스크는 고정 머리 오프셋을 보존한다
  (빠른 경로·공유 프레임 패치가 오프셋 상수를 쓴다).
- **기성 포맷(protobuf·flatbuffers·msgpack)**: 스키마 이중화(packets.json 단일 진실 원칙 위반)·의존성·디코드 할당·Unity(IL2CPP) 호환
  부담, 그리고 결정적 바이트(와이어 특성화 골든)가 필요하다 — 이 프로젝트에 필요한 기능은 위 규칙으로 충분하다.
- **디코드 실패 = 예외**: 공격자 입력이 예외 폭주를 만들 수 있고 핫패스 제어 흐름에 맞지 않는다 → 모듈 싱글톤 `BodyReader` + 사유 코드
  (`WIRE_ERROR`, 값 고정·추가만 — C# 코덱·골든 벡터와 공유).

### 2.2 코드젠 구조 (`tools/codegen/`)

| 파일 | 역할 |
|---|---|
| `schema.ts` | 손으로 쓴 검증(위반을 모두 모아 한 번에) + 해석된 AST(bodyOf 상속·실효 encoding). id 0은 예약(B1 구버전 프레임 감지). |
| `layout.ts` | 고정 크기·최악 크기·고정 머리 오프셋·presence 바이트. |
| `refCodec.ts` | **참조 인터프리터** — AST만 보고 아무 패킷을 인코딩·디코딩하는 독립 오라클(런타임·layout 미사용, UTF-8은 WHATWG TextDecoder). 시험과 교차 언어 골든(§2.6)의 기준. |
| `emitTsTypes.ts` | `codec.generated.ts` — 기존 산출물 + enum 유니온·struct interface·PayloadById·S2CPacketId/C2SPacketId·PACKET_DIRECTION·MAX_BODY_BYTES·WIRE_LIMITS·레이아웃 상수. |
| `emitTsCodec.ts` | `wireCodec.generated.ts` — size(검사, 위반 = WireEncodeError)/write(Buffer 직접, 무예외)/read(null)/decode + id 디스패치. |
| `emitCsTypes.ts` | C# 타입(struct·enum 포함, optional = null, bodyOf = 대상 class 상속). |
| `emitCsCodec.ts` | `WireCodec.Generated.cs` — C# 바이너리 코덱(C0.3, §2.6). |
| `golden.ts` · `goldenCrafted.ts` · `fixture.ts` | 교차 언어 골든(refCodec 산출) · 손으로 짠 경계 사례 · 합성 스키마(시험·골든·C# 픽스처 코덱 공용, C0.3에 `tests/`에서 이동). |
| `lock.ts` | `packets.lock.json` 와이어 지문(§2.3). |

수기 런타임 `server/src/net/wire/runtime.ts`: 싱글톤 `BodyReader`(디코드는 동기·비재진입), 할당 없는 엄격 UTF-8 판정기(TextDecoder와 퍼징
대조), 인코드 검사 함수. 생성 코드는 `any` 없이 `as` 좁히기만 쓰고, 디코드 결과는 기존 페이로드 interface와 같은 모양이라 핸들러가 바뀌지 않는다.
검증 방식: 생성 코덱 ≡ refCodec을 합성 스키마(모든 기능)와 실물 SNAPSHOT_DELTA에서 무작위 왕복·변조 퍼징·전 길이 잘림·인코드 거부로 대조하고,
합성 스키마 산출물을 서버와 같은 strict 설정으로 typecheck한다(`tests/server/codegen/*`, `tests/server/net/wireCodec.test.ts`).

### 2.3 와이어 지문 lock (`shared/schema/packets.lock.json`)

- **B6 형식(현행)**: 모든 패킷이 binary라 아래의 JSON 레이아웃·`looseHash`·freeform 지문과 "JSON 상태의 바이트 불변 변경" 전이 허용은 B6에 지웠다
  (아래는 역사로 남긴다 — 레이아웃의 어떤 변경이든 bump). 항목 = `{id, direction, wireHash, layoutHash, frozen?}`(`encoding`·`looseHash`·`freeform` 키 삭제).
  `wireHash` 입력은 종전 binary 지문과 같은 `{id, direction, encoding: "binary", layout}`이다 — 상수 `encoding`을 남겨 **지문 값이 B6 전과 같다**(빼면
  71개 wireHash가 전부 바뀌어 와이어 불변 커밋에 bump가 강제되고, CI base-lock 판정도 위반이 된다). lock diff는 항목마다 `"encoding":"binary",`가 빠진
  것뿐이다. `parseLock`은 B6 이전 형식(`encoding`·`looseHash`·`freeform` 키)을 받아 버린다 — CI base(push 직전 커밋)의 lock이 그 형식이다(JSON 패킷
  항목의 wireHash는 현재 지문과 달라 같은 protoVersion이면 위반). 바이트 불변 확인은 와이어 특성화 골든·교차 언어 골든이 맡는다.

- `wireHash` = id·방향·실효 encoding·레이아웃. 레이아웃은 **선에 실리는 것만**: binary = 순서·이름·정확한 타입·optional·max/min/ofMax·
  enum (이름, 코드) 전부, JSON = 필드 이름(정렬)·JSON 표현(number/string/bool/array/object)·optional·enum 값 이름 집합, freeform = "freeform".
  `looseHash` = JSON 레이아웃에 enum이 있을 때만, enum을 string으로 접은 wireHash.
- `layoutHash` = id·방향·필드(순서·이름·정확한 타입·optional·enum) — 인코딩·max 제외. `headerHash` = 프레임 header 블록 +
  `WIRE_RULES_VERSION`(layout.ts — §2.1 규칙 자체를 바꾸면 올려서 bump를 강제). 각 항목은 id·방향도 평문으로 기록한다.
- 판정: protoVersion이 lock과 같으면 지문이 하나라도 다를 때(추가·삭제·변경·헤더) 실패 "bump 필요". 올렸으면 lock을 새로 쓴다. 낮추기는 실패.
  **frozen**(HELLO·KICK — 버전 협상·거절 통지 경로: 어떤 버전의 클라든 HELLO를 보내 KICK 1을 읽을 수 있어야 한다)은 bump와 무관하게
  layoutHash 변경·해제·삭제가 실패다. 인코딩 flip과 max 부여는 허용한다(B2b가 HELLO를, B3b가 KICK을 flip했다). HELLO_ACK는 버전이 맞을 때만
  송신돼(불일치는 KICK 1) 구 클라가 읽을 일이 없어 B2a(시간 필드 f64)까지 동결하지 않았고, B3b flip에서 동결했다(현재 frozen = HELLO·HELLO_ACK·KICK).
- **JSON 상태의 바이트 불변 변경은 bump 불요**: 계획의 와이어 골든 규칙상 "JSON 상태 스키마화 커밋"(B3a·B5a)은 세션 바이트 sha256이 그대로여야
  하는데, bump는 HELLO_ACK.serverProtoVer 바이트를 바꾼다. 정수 폭·필드 순서·max 부여·frozen 표시는 지문이 같다(메타만 갱신). 지문이 바뀌는데
  허용하는 전이는 같은 id·방향의 JSON 패킷에 한해 둘뿐이다 — (a) freeform → 필드, (b) lock 쪽 레이아웃에 enum이 없던 패킷의 string → enum
  (현재 looseHash = lock wireHash). lock에 이미 enum이 있으면 값 이름 변경·추가 string → enum은 bump가 필요하다(보수적). `bun run gen`이
  lock을 갱신하고 `--check`는 lock이 그 결과와 같아야 통과한다.
- **우회 차단**: lock을 지우고 다시 만들거나 손으로 고치면 작업 트리 비교는 통과한다 — CI는 머지 대상(PR base·push 직전 커밋)의 lock으로도 같은
  판정을 돌린다(`gen.ts --check --base-lock <path>`, base에 lock이 없으면 생략).
- 스키마 검증의 보안 규칙: 원소 0바이트(빈 struct) array는 바이너리에서 금지 — 2바이트 본문으로 원소 max개 할당을 일으키는 디코더 증폭이다.

### 2.4 SNAPSHOT_DELTA

- 스키마로 선언했다(`tickIndex u32`·`ackSeq u32`·`updates: array<SnapshotUpdate{entityId u32, x f32, y f32}>`) — 현행 바이트와 같다.
  `updates.max` = floor((65535 − 10) / 12) = **5460**(최악 본문이 미래 u16 프레임 길이에 들어가는 값, MAX_BODY_BYTES 65530).
- 수기 typed-array 빠른 경로(`sim/snapshotDelta.ts`)는 유지하고, 오프셋·원소 크기는 코드젠 상수(`SNAPSHOT_DELTA_OFFSET`·`SNAPSHOT_UPDATE_BYTES`·
  `SNAPSHOT_DELTA_PREFIX_BYTES`)에서 얻는다(레이아웃이 바뀌면 로드 시점 가드가 멈춘다). 등가 시험: `tests/server/snapshotDeltaWireEquivalence.test.ts`.
- **알려진 차이(C0.1 — 운영 동작을 바꾸지 않으려고 의도적으로 둔다)**: ① (H1에서 해소) 빠른 경로는 u16 count 용량(65535)까지 한 프레임으로
  보냈고 생성 코덱(객체 경로·디코더)은 5460 초과를 거부했다 — H1부터 빌더가 5460 초과를 같은 tick·ack 프레임 여러 개로 나눈다. ② 비유한·f32 범위 밖 좌표, ③ 소수 entity id — 빠른 경로는 종전처럼
  비트를 옮기거나 절삭하고, 생성 코덱은 WireEncodeError로 거부한다(권위 상태에서는 생기지 않는다). 종전 인코더 사본이
  `tests/server/helpers/legacyAoi.ts`에 오라클로 남아 있다.
- 객체 경로의 tick·ack u32 정규화(`>>> 0`, 종전 binaryCodec의 심층방어)는 호출 지점 `snapshotBuilder.deltaPayload`로 옮겼다.

### 2.5 통합 (와이어 불변)

`packetWriter.writePacket`·`frameOutbox.appendPayload`는 `isBinaryPacket`이면 `bodySize` + `writeBody`로 프레임 버퍼에 직접 쓴다(검사가 공간 확보
전이라 커밋 규칙 유지). `frameIngest`는 `decodeC2S`를 먼저 부르고 `NO_CODEC`(JSON·S2C·미지 id)이면 종전 JSON 경로, `null`이면 디코드 오류
메트릭·스쿼시 경고(무킥). `packetLimits`는 바이너리 C2S 패킷에 `MAX_BODY_BYTES`를 쓴다. `net/binaryCodec.ts`는 삭제했다.
(B2c에서 수신 순서가 사전 판정 → 디코드로 바뀌고 JSON 경로가 없어졌다 — §3 B2c 항목. B6에 송신의 `isBinaryPacket` 분기와 JSON 분기도 지웠다 —
`writePacket`·`appendPayload`는 모든 id에 생성 코덱을 쓰고 스키마 밖 id는 `WireEncodeError`, §3 B6 항목.)

### 2.6 C# 코덱 + 교차 언어 골든 (C0.3, 와이어 불변)

- **런타임** `client/Noah/Assets/Scripts/Net/WireRuntime.cs`(수기, `MMORPG.Net`): `WireError`(TS `WIRE_ERROR`와 같은 이름·값),
  `WireReader`(`ReadOnlySpan<byte>` 위 `ref struct` — TS `BodyReader`와 같은 첫 위반 우선·범위 먼저·`Done` = 정확 소비, 예외 없음),
  `WireWrite`(LE 쓰기, 던지지 않음), `WireCheck`(인코드 검사 → `WireEncodeException`), `WireUtf8`(엄격 UTF-8). Unity 6 = .NET Standard 2.1이라
  float은 `BitConverter.Int32BitsToSingle`/`Int64BitsToDouble`(+ 역) 비트 재해석. 정수 범위·정수성은 C# 필드 타입이 보장해 검사하지 않는다.
- **생성 코덱** `WireCodec.Generated.cs`(`emitCsCodec.ts`): 바이너리 패킷·struct마다 `Size*`/`Write*`/`Read*(ref WireReader, 채울 객체)`,
  패킷(bodyOf 포함)마다 `Decode*`/`Encode*`, id 디스패치 `IsBinaryPacket`·`Decode(id, body, out WireError)`·`BodySize`·`WriteBody`·`Encode`
  (B6에 `IsBinaryPacket`을 지웠다 — 스키마 밖 id는 `Decode`가 null + `WireError.None`, 인코드는 거부, §3 B6 항목).
  클라는 S2C 디코드·C2S 인코드만 쓰지만 골든이 양방향을 시험하므로 모든 바이너리 패킷에 양방향을 낸다. 가변 크기 원소 배열은 남은 바이트로 자른
  길이로 할당한다(`WireReader.Capacity` — 원소 ≥ 1바이트라 성공이면 같은 길이, 짧은 본문의 큰 개수가 max개 할당을 못 일으킨다; 사유 우선순위는
  그대로). BCL 타입은 `global::` 한정, 런타임 이름(`WireReader` 등)은 schema.ts 예약어 — struct 이름이 가리지 못한다.
- **표현**: optional = null(값 타입 `T?`, string·array·struct는 null 참조 — JSON(Newtonsoft) 역직렬화와 같은 class·같은 뜻이라 패킷 flip이
  구독자 코드를 바꾸지 않는다). bodyOf 페이로드 class는 대상 class를 상속한다(대상 함수를 그대로 쓰고, `Decode*`는 자기 class로 돌려준다).
- **클라 전환**: `PacketBus`는 `WireCodec.IsBinaryPacket(id)`면 `WireCodec.Decode`(실패 = 사유 로그 + drop), 아니면 JSON — 이후 패킷별 flip에
  PacketBus 수정이 없다(B6에 JSON 분기·`IsBinaryPacket` 판정·Newtonsoft를 지웠다 — 모든 id `WireCodec.Decode`, §3 B6 항목).
  `Reconciler`·`WorldView`는 `SnapshotDeltaPayload`(uint)를 받아 종전 수기 디코더와 같은 `unchecked((int)…)`로 entity id·ackSeq를 int로 재해석한다. `BinaryCodec.cs`·`SnapshotDeltaDto.cs`는 삭제했다.
- **골든** `client/Noah/Assets/Tests/EditMode/Golden/wire.golden.json`(`golden.ts`): **refCodec만으로**(생성 코드와 독립) 결정적으로(패킷 이름에서 유도한
  mulberry32 시드) 만든다. 실물 스키마의 모든 바이너리 패킷 + 합성 스키마, 패킷마다 무작위 유효·전 길이 잘림(바탕이 192 B를 넘으면 앞·뒤 96 B — B5④b)·Trailing·변조, 손으로 짠 경계
  (`goldenCrafted.ts` — 사유 9종·우선순위·UTF-8 변종·float 경계, 의도한 사유가 refCodec과 다르면 생성 실패), 엄격 UTF-8 판정 벡터(WHATWG 기준).
  유효 본문은 정규형(재인코드 = 같은 바이트)임을 생성 시 단정한다. 합성 스키마의 C# 타입·코덱은 EditMode 시험 어셈블리(`Tests/EditMode/Generated/`,
  `MMORPG.Tests.EditMode.WireFixture`)로 낸다. 골든·C# 산출물 모두 `gen --check` 신선도 대상이다. 시험: TS `wireGolden.test.ts`, C# `WireCodecGoldenTests`.

기각한 대안:
- **골든 float = JSON 수**: `JSON.stringify(-0)`이 `0`이라 부호를 잃고, Unity Mono `double.Parse`(Newtonsoft가 쓴다)의 17자리 반올림 정확도에
  기댄다 → IEEE 비트 문자열(`"0x"` + 8/16자리 hex). 시험이 스키마(TS)·필드 타입(C#)으로 해석한다.
- **TS 생성 코덱으로 골든 생성**: 두 생성기가 같은 오해를 하면 서로 일치해도 틀린다 → 독립 오라클(refCodec + WHATWG TextDecoder).
- **C# `Encoding.UTF8`(throwOnInvalid) 판정**: 런타임별 디코더 구현(Mono/IL2CPP/.NET) 차이에 기대게 된다 → TS 판정기와 같은 표 3-7 손 구현을
  쓰고 골든 `utf8` 절로 WHATWG와 대조한다. 문자열 생성은 판정 통과 뒤 `Encoding.UTF8.GetString`(BOM 보존), 인코드는 손으로 바이트 수를 세며 짝 없는
  서로게이트를 거부한다(그 뒤 `Encoding.UTF8.GetBytes`는 대체 문자를 끼우지 않는다).
- **시험 JSON = JsonUtility / 사례별 `TestCaseSource`**: JsonUtility는 사례마다 필드 집합이 다른 payload를 못 읽는다 → 시험 asmdef에
  `Newtonsoft.Json.dll`(precompiled) 참조를 더하고 JToken + 리플렉션으로 payload 객체를 만든다. 사례별 테스트는 수백 개로 늘고 발견 시점에
  골든을 읽어야 해서, 범주별 테스트가 불일치를 모아 보고한다.
- **골든을 `Assets/Resources/`에(`Resources.Load` — MoveSync·Nav 골든의 선례)**: Resources는 플레이어 빌드에 실린다. 이 골든은 바이너리 패킷 수에
  비례해 커지므로(패킷당 ≈20 KB, B5까지 수 MB) 시험 폴더 `Tests/EditMode/Golden/`에 두고 `AssetDatabase.LoadAssetAtPath`로 읽는다
  (EditMode 시험 어셈블리는 Editor 전용).

## 3. 결과

- 와이어 특성화 골든(`tests/regression/wireCharacterization`)이 바이트 단위로 불변이다. JSON 패킷의 페이로드 가드 텍스트도 불변이다.
- 비용: 코드젠이 커졌다(모듈 8개). 생성 코덱의 size 패스는 값마다 검사하므로 객체 경로 SNAPSHOT_DELTA 인코딩이 종전보다 느리다(운영은 빠른 경로).
- 다음 슬라이스가 알아야 할 것:
  - **C0.2(완료)**: 서버 송신 표면이 `<I extends S2CPacketId>(id: I, payload: PayloadOf<I>)`다(`PayloadOf` = 유니온 id면 페이로드 교차 + 원시값
    거부) — flip 때 페이로드 모양이 스키마와 어긋나면 런타임 WireEncodeError가 아니라 컴파일 오류로 먼저 드러난다. freeform은 B5까지 형태 미검사.
  - **C0.3(완료, §2.6)**: 패킷을 binary로 flip하면 `bun run gen`이 C# 코덱·골든 사례를 함께 만들고 PacketBus가 자동으로 바이너리 경로를 탄다 —
    flip 커밋은 Unity EditMode `WireCodecGoldenTests`까지 돌린다. 사유 코드 값(`WIRE_ERROR` = C# `WireError`)은 고정이다(추가만, 양쪽 + 골든 표).
    PacketBus는 구독자마다 디코드한다(SNAPSHOT_DELTA = 2회 — 종전과 같다). B3 고빈도 S2C에서 구독자가 늘면 Fanout 단계 1회 디코드를 검토한다.
  - **C0.5(프리플라이트)**: 골든은 refCodec 기준이라 C0.5의 semantic 지표와 같은 오라클이다. 스키마화(B3a·B5a)에서 정한 정수 폭이 C# 필드 타입이
    된다 — 클라가 int로 쓰는 id·seq를 u32로 선언하면 구독자에 `unchecked` 재해석이 생기므로(현 SNAPSHOT_DELTA), 새 스키마화는 클라 쓰임과 같은
    부호(i32)를 고르는 편이 낫다. JSON 패킷에 스키마 enum을 붙이면 클라 Newtonsoft 역직렬화는 값 이름(camelCase)을 PascalCase 멤버로 대소문자
    무시 매칭하지만, 클라가 JSON으로 **보내는** enum은 정수로 직렬화된다(StringEnumConverter 미설정) — C2S JSON 패킷에 enum을 붙이기 전에 처리할 것.
  - **H1(완료)**: `MAX_DELTA_UPDATES` = `SNAPSHOT_DELTA_UPDATES_MAX`(5460), 초과분은 객체 경로가 같은 tick·ack 프레임 여러 개로 분할(차이 ① 해소,
    `mmorpg_snapshot_delta_split_total`). 송신 프레임 body는 0xFFFF 이하(`writeFrameHeader` RangeError — B1 u16 len 대비), 수신 상한도 전부 ≤ 0xFFFF.
    분할 프레임은 각각 완결된 SNAPSHOT_DELTA라 클라(생성 디코더 — 5460 초과는 OverMax로 버린다)·loadgen 추적이 그대로 받는다. SNAPSHOT_DELTA
    레이아웃을 바꾸면 `goldenCrafted.ts`의 실물 사례(5460/5461 경계 등 손 hex)가 의도와 어긋나 생성이 실패한다 — 같이 고친다.
  - **B1(완료)**: 클라 프레임 헤더 v2 `[len u16 LE][id u16 LE]`(protoVersion 3, IPC_VERSION 6). 구 v1 클라는 첫 프레임의 v1 HELLO 서명
    (v2로 읽은 len 0x0100·id 0)으로 알아보고 v1 형식 KICK 1 후 종료. SNAPSHOT_DELTA 빠른 경로는 프레임을 저장소 FRAME_BASE(2)부터 써서 원소
    정렬을 유지. 골든은 세션별 bytes −2×frames·sha256만 바뀌었다(frameDigest·idSeq·semantic·상태 불변 확인).
    C# 코덱은 본문만 다루므로(헤더는 `Network/FrameHeader.cs`) 골든·코덱 변경 없음 — 바이너리 본문 최악 ≤ 65535(`MAX_BODY_BYTES`)가 u16 길이와 맞는다.
  - **B2a(완료)**: PING.clientTimeMs·PONG 두 시간·HELLO_ACK.serverTimeMs = f64(JSON 상태 — protoVersion 4). 클라 `NetworkManager.UpdateRttFromPong`은
    PONG 본문을 직접 JSON 디코드한다 — B3b에서 PONG을 flip하면 이 경로도 생성 코덱으로 바꾼다.
  - **flip 전 시험 필러 교체**: 전송 계층 시험 다수가 PING/PONG JSON을 크기·내용 무관 필러로 쓴다(문자열 시간·`"x".repeat(n)`). 해당 패킷을
    flip(B2b PING·B3b PONG)하면 생성 인코더가 WireEncodeError를 던지거나 본문이 고정 크기가 되어 의도를 잃는다 — flip 커밋에서 `tests/helpers/wire.ts`
    `encodeRaw`(원시 본문 프레임) 기반 필러로 일괄 교체한다. (B2b 처리 — 아래 B2b 항목.)
  - **B2b(완료 — C2S 29개 flip, protoVersion 5)**:
    - 스키마: string·array `max`는 핸들러 검증에서 유도(디코더가 핸들러가 받는 입력을 먼저 거부하지 않게 — UTF-8 바이트, UTF-16 유닛당 최대 3).
      username 64·secret 256·캐릭터명 64(3~12자 + NameTooLong 응답 여유)·CHAT_SAY target 64·text 600(200 유닛 × 3)·NPC_ACTION nodeId 64(핸들러
      정규식)·actionType 32. 정수 폭은 그대로(i32·u32 — C0.5 권고). UI_PREFERENCES_SET은 freeform → `quickSlots?: i32[6..6]`·`trackedQuestIds?:
      i32[0..5]`(zod 스키마와 같은 개수 규칙). 표·근거 정본은 protocol.md §2.7. 클라 C# 상한 상수 `WireLimits`(Codec.Generated.cs)를 코드젠에 추가했다
      (`emitCsTypes.ts` — 이름 충돌은 산출 전 throw, `WireLimits`는 예약 타입명).
    - HELLO 디코드 실패: v2 프레이밍의 JSON HELLO(B1~B2a 클라)는 바이너리 HELLO(8바이트)로 디코드되지 않는다. `frameIngest`가 **ANON의 HELLO
      디코드 실패**만 KICK 1(`client update required`) + 종료로 바꾼다(그 밖의 디코드 실패는 무킥 drop 유지 — B2c). 구 JSON HELLO(≤ 59 B)가 size
      게이트(KICK 5)에 먼저 걸리지 않게 HELLO 수신 상한은 바이너리 최악 8이 아니라 종전 64를 바닥으로 둔다(`packetLimits.LEGACY_HELLO_MAX_BODY_BYTES`).
      월드가 판정하므로 게이트웨이 경유도 같다(통합 시험 `gw-v2-baseline` monolith·gateway-inproc). 메트릭 `connRejected{reason="legacy_hello"}`.
    - IPC_VERSION 7: IPC 레이아웃은 그대로지만 게이트웨이가 집행하는 엣지 수신 상한이 바뀌었다 — protoVersion이 다른 게이트웨이·월드가 섞이면
      상한·본문 해석이 갈린다. 이후 **클라 protoVersion bump마다 IPC_VERSION도 올린다**(`ipcHandshake.test.ts`가 짝을 고정 — ops-cluster §8 전원 재배포).
    - 상한 단일 소스: 핸들러 쪽 개수·길이(UI 설정 zod 개수, 대화 노드 id 정규식 — npcs.json 로더와 NPC_ACTION 핸들러 공용 `NODE_ID_RE`)는 생성
      `*_MAX` 상수에서 유도하고, 유도하지 않는 것(캐릭터명 12자·세션 토큰 길이)은 `tests/server/wireLimitsContract.test.ts`가 부등식으로 묶는다.
    - 짝 없는 서로게이트: 바이너리 string 인코드가 거부한다(JSON 시절엔 U+FFFD로 바뀌어 나갔다). 클라는 송신 전에 `WireUtf8.DropUnpairedSurrogates`로
      빼고(채팅 입력 한도에 반쪽만 들어간 이모지 등), 서버·클라 채팅 자르기는 쌍을 가르지 않는다(CHAT_BCAST flip 대비).
    - 수신 상한: C2S는 전부 스키마 최악 본문(수기 표 삭제). 정상 인코딩은 넘을 수 없어 초과 = 엣지 KICK 5.
    - 클라: `PacketWriter.Build`가 `IsBinaryPacket`이면 `BodySize`·`WriteBody`(검사가 버퍼 할당 전), 익명 객체 송신 2곳(`SkillCaster`·
      `QuestStore`)을 `UiPreferencesSetPayload`로, 채팅·로그인 입력 한도를 `WireLimits`에서 유도. loadgen·perf·시험 헬퍼는 서버 `encodePacket`.
    - 시험 필러: 링크 수준(내용 무관)은 `encodeRaw` 원시 본문, 세션 송신은 스키마에 맞는 PING(`{clientTimeMs: n}` — 이제 영구 바이너리) 또는
      형식 자유 JSON 필러 PONG(S2C — **B3b PONG flip 때 다시 교체 대상**: `sendCoalescing`·`deferredSends`·`closingLink`·`frameOutbox`·
      `remoteClientLink`·`gatewayAdmission`·`worldIpcServer`·cluster 시험의 `PONG {clientTimeMs:"x"…}`). 게이트웨이 전달 기록은 `<id>:<본문 hex>`.
    - 와이어 특성화 골든(S2C)은 바이트 단위로 불변이었다(하니스가 이미 C2S 값을 바이너리 왕복으로 정규화해 보냈다).
  - **B2c(완료 — 와이어 불변: packets.json·protoVersion 5·IPC_VERSION 7·특성화 골든 그대로)**: B2b가 넘긴 4가지를 이렇게 처리했다.
    - **사전 판정을 디코드 앞으로**(B2b 보안 리뷰 ①): `network/packetAdmission.ts` `admitPacket` — 미지 id(**스키마의 C2S id가 아님** — S2C id 포함)
      → 상태 화이트리스트(`isPacketAllowedInState`) 순, 메트릭은 종전 라우터와 같은 이름·라벨(`router_unknown_packet{packet_id}`·
      `router_state_rejected{packet_id,state}`). 판정 정의는 이 모듈 하나 — `frameIngest`가 디코드 전에 부르고 라우터 디스패치는 다시 보지 않는다
      (이중 계수 없음). "라우팅 id = 스키마 C2S"로 정의를 스키마에 묶고, `createRouter`가 부팅 때 핸들러 표와 같은지 검사한다
      (`assertRoutesMatchSchema` — 핸들러 누락·C2S 아닌 id 핸들러면 throw). 판정 모듈이 핸들러 그래프를 싣지 않아 `frameIngest`가 가볍다.
      ANON HELLO 특례는 그대로(HELLO는 ANON에서 허용되므로 판정을 통과하고 디코드 실패 = KICK 1). 거부 프레임은 본문을 읽지 않는다.
    - **JSON 경로**: 제거(`decodeJson`·`DECODE_FAILED`). C2S가 전부 바이너리라 사전 판정 뒤 `NO_CODEC`은 도달 불가 — 방어로 미지 패킷과 같이
      버린다(`rejectUnknownPacket`). S2C·미지 id는 JSON.parse 없이 판정에서 끝난다(수신 상한 4096은 그대로 — 바꾸면 게이트웨이 엣지 정책이 바뀌어
      IPC_VERSION bump가 필요하다). S2C 송신 JSON 인코드는 B6 범위라 손대지 않았다.
    - **디코드 실패 strike KICK**: 판정을 통과한 패킷의 디코드 실패만 센다 — 세션별 `StrikeWindow`(net/rateLimit, `RATE_KICK_*`와 같은 경계:
      슬라이딩 창 안 실패가 상한을 **초과**하면 KICK) — env `NET_DECODE_STRIKES`(기본 5, 0 = 끔)·`NET_DECODE_WINDOW_MS`(기본 10000),
      초과 = `KICK 5(Cheat) "malformed packets"`. 디코더 예외(`Threw` — 서버 쪽 코드젠 회귀)는 메트릭·error 로그만 남기고 strike로 세지 않는다(정상 클라 연쇄 KICK 방지). ANON HELLO KICK 1은 strike가 아니다. 디코드는 월드에서만 하므로
      월드(`worldMain` `configureDecodeStrikes`)만 설정하고 게이트웨이는 무관. 메트릭: `mmorpg_net_decode_error_total`에 `reason` 라벨(유한 집합 —
      `wireErrorName`의 WIRE_ERROR 이름·`Unknown` + `Threw`, 타입 `DecodeErrorReason`이 강제), 신설 `mmorpg_net_decode_kick_total{state}`(카탈로그 끝).
      `mmorpg_net_packets_rx_total`은 판정을 통과해 디코드·디스패치한 패킷만 센다(종전엔 디코드 성공한 미지·상태 거부 패킷도 셌다).
    - **채팅 형식 문자**(②): `net/textSafety.ts` — Unicode 범주 Cc·Cf·Zl·Zp 전부 + 한글 채움 문자(U+115F·U+1160·U+3164·U+FFA0)를 코드 포인트
      단위(정규식 `u`)로 지운다. B2c 리뷰(Fable 코드·보안)가 처음의 열거형 BMP 목록이 Cf 153개(U+00AD·U+2061–2064·U+206A–206F·U+FFF9–FFFB·
      보조평면 태그 문자 U+E0001·U+E0020–E007F 등)와 한글 채움 문자를 통과시키는 것을 실측해 범주 기준으로 바꿨다. 순서는 trim → 서로게이트 보존
      자르기 → 제거 → trim(형식·채움 문자로 감싼 공백만의 메시지는 빈 문자열 = 무송신). ZWJ 제거로 이모지 ZWJ 시퀀스는 낱개 이모지로 보인다(감수).
    - **username 문자 검증**(③): `loginFlow.isValidUsername` — 빈 이름·앞뒤 공백(String.trim 기준)·위 채팅 집합(같은 `hasDisplayUnsafe`) 거부.
      Password·DevAuto 모드만(Token은 username을 쓰지 않는다), 위반 = 틀린 자격증명과 같은 응답(AUTH_RESULT BadCredentials + REJECT + 종료) —
      bcrypt·DB 조회 없이 끝나지만 드러나는 것은 공개 형식 규칙뿐(그런 이름의 계정은 생길 수 없다). DevAuto 계정·캐릭터명 `<username>-1`은 검증 뒤에만
      만들어진다. 계정 생성 경로는 DevAuto(`ensureDevAccount`)뿐이다. 기존 계정(dev DB 최대 13 B ASCII)·loadgen(`<prefix>-<i>`)·클라(trim 후 송신)는 통과.
    - 시험 정리: 링크·엣지 시험의 가짜 디스패처가 ANON에서 PING을 받던 곳은 PING이 판정을 통과하는 HELLO_RECV로(의미 불변 — pre-auth 버킷·idle 창은
      같다), 엣지 패리티 시험은 monolith 쪽을 엣지 프레임 단계(`tcpServer.localEdgeHandlersWithFrames` — 게이트웨이가 월드로 넘기는 지점과 같은 경계)에서
      기록한다(판정·디코드는 두 모드 공통 `frameIngest` 몫).
  - **B3a(완료 — JSON 상태 스키마화: 와이어 바이트 불변, protoVersion 5·IPC_VERSION 7 그대로)**: B3b가 flip할 고빈도 S2C 중 형태가 없던 것을
    binary 레이아웃이 그대로 될 수 있게 스키마로 옮겼다(protocol.md §3.3·§3.4).
    - 스키마: MOVE_PATH = `entityId i32 · seq i32 · waypoints array<Waypoint{x f32, y f32}> max 1024`. SKILL_EFFECT = 11필드 평탄
      (`skillId·casterEntityId·targetEntityId i32 · effectKind SkillEffectKind · amount i32 · isCrit·isMiss bool · groundX·groundY f32 · castId·
      impactDelayMs i32`) — 송신 갈래(단일 대상·자가 회복·ground 마커·ground 대상별·cast 텔레그래프·fizzle)가 종전 JSON에서 모든 키를 항상
      실었으므로(안 쓰는 값 0) union·optional이 아니라 필수 필드다. enum 2개(repr u8): `EntityType`(unknown 0·player 1·monster 2·npc 3·
      grounditem 4 — `unknown`은 존 `typeOfEntity`의 방어 기본값을 그대로 표현, C# `default` = Unknown), `SkillEffectKind`(damage 0·heal 1·
      cast 2·fizzle 3 — 문자열로 두면 B3b 레이아웃이 u16 길이 + 바이트가 된다). `SkillEffectKind`에 `none` 센티널을 두지 않은 것은
      의도다 — 종전 클라 DTO의 "effectKind 없음(null) → 데미지 분기" 의미를 C# `default` = Damage가 그대로 잇는다(0으로 채운 값은 targetEntityId 0이라
      표시되지 않는다). 정수 폭은 전부 i32(C0.5 권고 — 클라 int).
    - max 근거: `waypoints` 1024 = **JSON 상태에서도 어떤 유한 좌표든 u16 프레임 본문에 드는 상한**(원소 최장 62 B → 63,543 B, binary 8,202 B).
      A*의 상한(`maxNodes` 50000·셀 수)은 와이어 상한이 못 돼(1칸 폭 미로는 셀마다 꺾인다) 서버 `moveToHandler.pathWaypoints`가 앞 1024개로
      자르고 권위 movePath도 같은 열을 걷는다(`movePathWaypointCap.test.ts` — 계단 통로 1040 → 1024, JSON 프레임·refCodec binary 인코드 성공).
      종전엔 u16을 넘는 JSON 본문(좌표가 짧으면 원소 ≈20 B라 ≈3,000개 초과)에서 `movePaths.set` 뒤 `sendMany`가 RangeError를 던져 서버만 걷고
      클라는 MOVE_PATH를 못 받던 경로다(함께 해소 — 1025~≈3,000개 구간은 "전체 송신 → 자르기"로 바뀌지만 실제 맵 최대 4개라 닿지 않는다).
      클라 예측(`PlayerActor.TryPredictPath`)도 같은 상한에서 자른다. SKILL_EFFECT는 string·array가 없다(ground AOE 상한 8은 패킷 수 상한).
    - i32 범위(리뷰 MEDIUM 반영): 발급기가 와이어 i32를 넘기지 않게 했다 — `castId`는 i32 최대 다음 1로, 지면 아이템 id는 대역
      [2e9, 2^31)·몬스터 id는 [1e9, NPC_ID_BASE)를 순환하며 살아 있는 id는 건너뛴다(`EntityTable.nextInBand`, `tests/server/entityIdBands.test.ts`).
      종전엔 무한 증가라 존당 드롭 ≈1.47억 건이면 i32를 넘었고(JSON인 지금도 클라 int 역직렬화 실패 drop, flip 뒤엔 송신 경로 WireEncodeError)
      몬스터는 5억 스폰이면 NPC 대역과 겹쳤다. 시나리오 범위에서는 순환이 일어나지 않아 골든·결정론 불변.
    - enum JSON 표현: 코드젠이 이미 JSON enum = 값 이름 문자열이다(TS 리터럴 유니온 → `JSON.stringify`, C# Newtonsoft는 문자열을 PascalCase
      멤버에 대소문자 무시로 맞춘다 — C0.5 항목) → 코드젠·refCodec·골든 추가 없음. 대신 스키마 검증에 **enum 값 이름 대소문자 무시 유일**을
      더했다(`fooBar`·`foobar`가 공존하면 Newtonsoft 매칭이 선언 순서에 기대 모호). C#은 EditMode `JsonStatePayloadTests`가 서버 JSON 모양을
      생성 타입으로 읽는지 고정한다(B3b flip 때 교차 언어 골든이 대신하므로 정리).
    - lock: bump 불요 — MOVE_PATH·SKILL_EFFECT는 (a) freeform → 필드, ENTITY_SPAWN은 (b) string → enum(새 `looseHash` = 옛 `wireHash`) 전이(§2.3).
    - 서버: 송신부가 생성 타입(`MovePathPayload`·`SkillEffectPayload`·`EntitySpawnPayload`)을 그대로 통과 — 수기 `SnapshotSpawnPayload` 삭제, 존
      `entityToType`·`BuildContext.typeOf`가 `EntityType`, `SkillEffectWireKind` = 생성 `SkillEffectKind`. freeform 우회 캐스트는 원래 없었고
      (`PayloadOf` 빈 interface가 받았을 뿐) 이제 형태가 컴파일 검사된다(`typedSend.test.ts`에 B3a 사례).
    - 클라: 수기 DTO(`MovePathS2C`·`WaypointDto`·`SkillEffectS2C`)를 지우고 생성 타입·enum으로(`PlayerActor`·`CombatController`·`SkillEffectFx`
      + 연출 3종·`WorldView` — `_entityType`도 `EntityType`). B3b flip은 PacketBus가 바이너리 경로를 자동으로 타 구독자 수정이 없다.
    - 와이어 특성화 골든: **갱신 없이 통과 — semantic도 불변**(시나리오의 세 id 페이로드가 이미 스키마 정규형: 좌표 f32 정확, 선언 밖 키 없음,
      enum 이름 왕복). 프리플라이트(`shapeViolations`)가 MOVE_PATH·SKILL_EFFECT를 새로 검사 대상으로 삼아 위반 0. 스냅샷 파싱 diff로 바뀐
      leaf 키 0개(237개 중)를 확인했다.
  - **B3b(완료 — 고빈도 S2C 11개 binary flip, protoVersion 6·IPC_VERSION 8)**: ENTITY_SPAWN·ENTITY_DESPAWN·ENTITY_META·MOVE_PATH·CHAT_BCAST·
    DAMAGE_EVENT·SKILL_EFFECT·MANA_UPDATE·PONG·HELLO_ACK(이 커밋에서 frozen)·KICK(frozen 레이아웃 그대로). 표·근거 정본은 protocol.md §2.8.
    - string max(UTF-8 바이트, 실제 송신원 전수 조사): ENTITY_SPAWN.name·CHAT_BCAST.senderName 66(DevAuto `<username ≤ 64 B>-1` — 가장 긴 송신원.
      CHAR_CREATE 이름 ≤ 36 B, 몬스터·NPC 이름 = 데이터, 지면 아이템 = 빈 문자열), CHAT_BCAST.text 600(CHAT_SAY.text 계열 — 서버 정화본 200 유닛),
      KICK.detail 600(GM 킥 사유 200 유닛 — gmRoutes가 `KICK_DETAIL_MAX / 3`에서 유도·짝 없는 서로게이트 400), HELLO_ACK.sessionNonce 64(newToken 64 hex
      중 앞 32자). `wireLimitsContract.test.ts`가 S2C 쪽 부등식(DevAuto 최장 이름·정화본 최악·GM 한도·nonce)을 묶는다.
    - 송신 경로 보장: `net/wireText.ts`(`fitsWireString` = 생성 코덱 strSize와 같은 판정, `clampWireString` = 코드 포인트 경계 자르기·짝 없는
      서로게이트 → U+FFFD). 몬스터·NPC 로더가 이름을 부팅 시 강제(itemeditor 저장도 같은 로더), 존 표시 메타 저장소(`EntityMetaStore`)가 상한을 넘는
      이름(B2b 전 DevAuto 계정의 긴·짝 없는 서로게이트 이름 — DB 잔존값)을 잘라 저장 — 채팅 senderName도 같은 값(입장 시 `spawnCharacterIntoZone`이 warn).
      데이터 정수 i32 상한 — `world/dataWireLimits.ts`(`wireIntPos`·`wireIntNonneg`·`wireDisplayName`)를 monsters·npcs·items·skills 로더가 쓰고
      (`I32_MAX`는 `net/wire/runtime.ts` 단일 정의 — entityTable id 대역도), 계산값 데미지·치유량은 `sim/combat/damage.ts`가 i32에서 자른다.
      송신 WireEncodeError는 프레임 전에 던져 부분 바이트가 없고 핸들러는 라우터·존 tick은 `tickAll`이 격리하지만, 존 tick 안 송신 예외는 그 존
      tick의 남은 단계(킬 처리·스냅샷·tickIndex 증가)를 건너뛰므로 상류에서 막는다. 실측: Bun의 `Buffer.byteLength`는 짝 없는 서로게이트를
      2바이트로 센다(실제 인코딩 3) — `utf8ByteLength`는 손으로 센다(strSize는 서로게이트 거부가 먼저라 영향 없음).
    - 리뷰 반영(opus code-reviewer — CRITICAL·HIGH 0): MEDIUM 1 = 데이터 정수 i32 상한이 skills만이었다 → 위 공용 스키마로 몬스터·NPC·아이템까지 +
      데미지 자르기. LOW = GM `kickPlayer` 사유 자르기·송신 예외에도 종료(`try/finally`), `legacy_proto` 경로 IP별 스쿼시 warn, 특성화 골든에
      MULTICAST 켬 < 끔 IPC 파이프 바이트 비교 시험(메트릭과 독립), loadgen 식별자 `BUILTIN_DECODED`·`decodeIds`, 표시 이름 상한
      `DISPLAY_NAME_MAX`를 `net/wireText.ts`로(로더·identity가 존 저장소에 기대지 않게), 낡은 문구.
    - 구 클라 KICK(B3에 넘긴 결정): B1~B2b 클라(protoVersion 3~5)는 JSON KICK만 읽는다 → 업데이트 안내 두 경로 — ANON HELLO 디코드 실패(B1~B2a의 JSON
      HELLO, `legacy_hello`)와 HELLO 버전 불일치 중 `clientProtoVer` 3~5(`wireFrame.readsLegacyJsonKick`, 신설 `connRejected{reason="legacy_proto"}`) —
      만 `LEGACY_JSON_KICK_FRAME`(v2 헤더 + B3b 전 KICK JSON 본문, `net/wireFrame.ts` — 본문 상수를 v1 `LEGACY_KICK_FRAME`과 공유)을
      `clientEdge.kickLegacyJsonClient`로 보낸다. 그 밖의 불일치(미래 버전)·모든 다른 KICK은 바이너리. HELLO 전 KICK(접속 제한·idle·pre-auth 데드라인·
      엣지 size/rate)은 버전을 몰라 바이너리 — 구 클라는 연결 종료로만 본다(protocol.md §1.3). 월드가 판정하고 게이트웨이는 원시 전달 —
      `gw-v2-baseline`이 monolith·gateway-inproc에서 같은 바이트(JSON HELLO·바이너리 HELLO v5 → 고정 프레임, 미래 버전 → 바이너리)를 단정한다.
    - 클라: PacketBus가 생성 디코더로 자동 처리(구독자는 B3a부터 생성 타입). 본문을 직접 읽던 `NetworkManager.UpdateRttFromPong`은
      `WireCodec.DecodePong`. `JsonStatePayloadTests`는 삭제(교차 언어 골든이 같은 계약을 덮는다), EditMode 시험의 KICK·MANA_UPDATE·ENTITY_META 게시는
      `WireCodec.Encode` 본문으로. 교차 언어 골든에 B3b 손 사례(`goldenCrafted.ts` — 이름 66·채팅 600·KICK 600·nonce 64 경계, enum·bool·float, 구 JSON KICK
      본문 → OverMax)를 더했다.
    - loadgen: 봇 수신이 `protocol.decodeS2C`(바이너리 = 서버 생성 `decodeBody`, 그 외 JSON) — 바이너리 디코드 실패는 봇 errors에 사유.
    - 시험 필러: `tests/helpers/fillers.ts` — 크기 필러 MOVE_PATH(`sizeFiller` — 본문 10 + 8n, 종전 PONG JSON 필러 바이트 이하 최대), 작은 태그
      PONG(`tagPong`), 문자열 태그 CHAT_BCAST(`tagChat`). 링크 수준(게이트웨이 DELIVER·OutboundLink)은 `encodeRaw` 원시 본문으로 바이트 수 보존.
      스냅샷 오라클(`helpers/legacyAoi.ts`)의 SPAWN·DESPAWN은 B3b 전 JSON(`legacyJsonFrame`) — 범위 밖 id·비유한 좌표 퍼징이 바이너리 SPAWN 검사에
      막히지 않게(주제인 DELTA 빠른 경로 바이트 비교는 그대로). 특성화 골든의 게이트웨이 IPC 단정 "IPC 바이트 < 클라 바이트"는 JSON 팬아웃 프레임
      크기에 기댄 대리 지표라 바이너리에서 성립하지 않아 `multicastSavedBytes > 0`(수신자별 복사 대비 순감소 메트릭)으로 바꿨다.
    - 와이어 특성화 골든: 10개 세션 전부 flip 패킷을 받아 **sha256·bytes·frameDigest만** 바뀌었다(semantic 26개 id·frames·packets·idSeq·
      stateCheckpoints·stateFinal 불변 — 스냅샷 파싱 diff로 바뀐 leaf 30개/237개 확인 후 갱신). 클라 수신 바이트 합 322,802 → 189,341(−41%).
    - (선택 처리) 정의용 `SkillEffectKind`(skillDataLoader) → `SkillDefEffectKind`.
  - **B4(완료 — 나머지 고정형 S2C 17개 binary flip, protoVersion 7·IPC_VERSION 9)**: AUTH_RESULT·ENTER_WORLD_OK·ZONE_INFO·CHAR_CREATE_RESULT·
    ZONE_CHANGE·CHAR_EXP_GAIN·GOLD_UPDATE·TARGET_ACK·DEATH_NOTIFY·RESPAWN_OK·SKILL_CAST_ACK·SKILL_LEARN_ACK·SKILL_LV_UP·ITEM_USE_ACK·ITEM_PICKUP_ACK·
    QUEST_PROGRESS·SHOP_ACK. 처음부터 고정형(freeform 아님)이라 B3a 같은 스키마화 단계 없이 encoding만 flip했다. 표·근거 정본은 protocol.md §2.9.
    - string max(실제 송신원 최장): AUTH_RESULT.sessionToken 64 B(`newToken()` 64 hex — 실패 응답은 빈 문자열), CHAR_CREATE_RESULT.name 64 B(실패는
      요청 이름 에코 = CHAR_CREATE_REQ·CREATE_CHARACTER_V2 name max 이상, 성공은 저장 이름 = 요청 이름 그대로 ≤ 36 B), ZONE_INFO·ZONE_CHANGE.name 64 B.
      존 이름의 출처는 DB·데이터 파일이 아니라 `world/zoneMetas.ts` `DEFAULT_ZONES` 코드 상수(최장 7 B)다 — 존 메타의 부팅 경로인 `ZoneRegistry`
      생성자가 `fitsWireString`(`net/wireText ZONE_NAME_MAX`)·id i32 양수·크기/스폰 f32 유한을 강제한다(몬스터·NPC 이름 로더와 같은 방식). 부등식은
      `wireLimitsContract.test.ts`가 묶는다(토큰 길이 ≤ max ≤ AUTH_REQ.secret, 에코 max ≥ 요청 max, 존 이름 두 상한 동일·운영 존 통과).
    - i32 상류 보장(전 필드 조사 — 표는 protocol.md §2.9): ENTER_WORLD_OK·ZONE_CHANGE.tickIndex는 `net/wireInt.ts wireTickIndex` = mod 2^31(20 Hz
      무재시작 ≈3.4년이면 i32를 넘는다 — SNAPSHOT_DELTA u32 tickIndex의 하위 31비트, 클라가 INPUT_CMD.tick으로 되돌려도 비음수 i32). EXP 총량은
      `applyExpGain`이 nextExp(MAX_LEVEL) = 7,200,000에서 자른다(현 레벨 잔여 EXP). delta 출처 중 quests.json `fixed.exp/sexp/slp`에 상한이 없었다 →
      `wireIntNonneg`(quest id도 `wireIntPos` — QUEST_PROGRESS.questId). SLP 총량은 daily 퀘스트 반복으로 무한 누적될 수 있었다 → 누적 2곳
      (`applyExpGain`·퀘스트 턴인)을 `addSatI32` 포화(정상 범위 결과 불변 — 결정론 골든 그대로). 골드는 기존 GOLD_MAX clamp(상점 delta는 잔액 범위
      검사 뒤에만 송신). cooldownMs·heal·hp/mp는 B3b 로더·계산 범위, 에코 필드는 디코드된 C2S i32, accountId·charId는 rowid(플레이어 entityId =
      charId < MONSTER_ID_BASE 가정 — B3b와 같다). f32(spawnX/Y·width/height)는 존 범위 안 값이라 반올림 ≤ 2^-17이고 클라가 받는 권위 위치(DELTA·
      SPAWN)도 f32라 재조정 기준이 같다. 클라가 받는 값이 비트 단위로 같다는 근거는 **클라 C# 수신 필드가 JSON 시절에도 `float`였다**는 것이다
      (B3b 생성 `Codec.Generated.cs`의 `SpawnX`·`Width` 등 — f64 JSON 최단 왕복 표기 → double → float = `Math.fround`). 특성화 골든 semantic은
      근거가 아니다: semantic은 JSON 시절에도 f32 필드를 fround로 정규화해 해시하므로 f64 → f32 정밀도 변화를 원래 검출하지 못한다(정수 값의
      f32 손실만 `wireSemantic.ts lossyF32`가 본다). B5에서 클라가 double로 받던 값을 f32 필드로 flip하면 골든이 아니라 C# 필드 형으로 확인해야 한다.
    - 송신 단위 인코드 실패 방어층(B3b "선택" 항목 → 채택, `network/encodeGuard.ts`): 존 tick 안 송신 예외가 그 존 tick의 남은 단계(킬 처리·스냅샷·
      tickIndex 증가)를 건너뛰던 것을 **그 패킷 하나만 버림**으로 바꿨다. 대상 = 생성 인코더 `WireEncodeError` + 프레임 body u16 초과(신설
      `FrameBodyTooLargeError` — RangeError 하위라 종전 `toThrow(RangeError)` 계약 유지, 남은 JSON 본문 포함). 그 밖의 예외(TypeError 등 코드 결함)는
      다시 던진다. 잡는 곳 3곳: `PlayerSession.send`(즉시 = `encodeOrDrop`, 코킹 = outbox 직접 인코딩을 감싼 `appendOrDrop` — sendTo·핸들러 송신 포함),
      `SessionManager.sendMany`(첫 실수신자 1회 인코딩 그대로 — 실패면 아무에게도 안 보냄, monolith·MULTICAST 공통), 스냅샷 SPAWN/DESPAWN(운영 `FrameSink.encode`
      = `encodeOrDrop`, `Buffer | null` — `SnapshotFrames`가 null도 dispatch 동안 캐시해 viewer마다 재인코딩·재기록하지 않는다). 미리 인코딩한
      프레임(`sendFrame`·`sendShared` — DELTA 빠른 경로·공유 프레임)은 송신 시점 인코드가 없어 대상이 아니다. 인코드는 프레임 전에 던지므로(packetWriter·
      FrameOutbox 커밋 규칙) 부분 바이트가 없다. 기록: `mmorpg_net_encode_error_total{packet_id}`(카탈로그 끝 — 팬아웃은 1건) + packet id별 스쿼시 warn
      (5초 1줄·버스트 3, `path`·`connId`). 비용: try/catch는 인코드 1회를 감싼 작은 함수에만 — 정상 경로 분기·할당 증가 없음(성능 측정은 별도).
      KICK 송신 = 연결 종료 계약(`clientEdge.sendFrameAndClose` — 인코드도 자기 try 안)은 그대로. 시험 `tests/server/net/encodeGuard.test.ts`(판정·세션 즉시/
      코킹(로컬·원격 링크 — 공유 DELTA 끝 참조 뒤의 실패 포함: 참조가 인라인으로 굳어도 연결 바이트는 같다)·sendMany monolith/MULTICAST·존 tick — SPAWN
      level·MANA_UPDATE mpMax가 i32 밖이어도 tickIndex 증가·다른 엔티티 SPAWN 계속)와 `tests/server/zoneRegistryWire.test.ts`(운영 `ZoneRegistry` 배선 —
      `SESSION_FANOUT.encode`를 writePacket으로 되돌리면 실패). **시험 전역 드롭 감시**(리뷰 반영): 방어층은 잘못된 페이로드(필드 누락·범위 밖 값)를 보낸
      시험도 예외 없이 녹색으로 끝나게 만든다(LOG_LEVEL silent라 warn도 안 보인다) — `tests/preload.ts`가 모든 시험 앞뒤로 `mmorpg_net_encode_error_total`
      합을 비교해 늘면 그 시험을 실패시킨다(`tests/helpers/encodeDrops.ts`, 일부러 드롭을 만드는 방어층 시험만 `allowEncodeDrops()`로 면제). 구현 때의
      일회성 계측(이 시험 밖 드롭 0건, 부분 페이로드를 보내던 `clientLink` 시험 1건 수정)을 고정한 것이다. **측정 게이트**: B4 전에는 같은 실패가 zone tick
      예외·handler 에러로 loadgen 레벨 게이트 `noErrors`를 깼다 — 방어층 뒤에는 `mmorpg_net_encode_error_total`에만 남으므로 loadgen이 그 델타
      (`net.encodeErrors`)를 `noErrors`에 넣는다.
    - 시험 이전: JSON 경로 확인용 GOLD_UPDATE → 서버·loadgen 시험은 CHAR_STATS_FULL(자율 형식 — B5), EditMode `PacketWriterTests.Json_S2CIdStaysCamelCaseJson`은
      CHAR_LIST(필드가 있는 유일한 JSON S2C), GOLD_UPDATE는 바이너리 사례로 옮겼다. EditMode 게시(AUTH_RESULT·CHAR_CREATE_RESULT·SKILL_LEARN_ACK)는
      `WireCodec.Encode` 본문 — 바이너리는 null 문자열을 거부해 실패 응답에도 빈 문자열·요청 이름을 채운다(서버와 같다).
    - 클라·loadgen: 구독자는 B3a 이전부터 생성 타입이라 PacketBus가 자동 처리(본문 직접 디코드 없음). loadgen 봇은 `decodeS2C`(생성 decodeBody)로
      AUTH_RESULT·ENTER_WORLD_OK·ZONE_CHANGE·RESPAWN_OK를 읽는다(봇 시험의 가짜 서버가 바이너리 프레임을 보낸다).
    - 교차 언어 골든: `goldenCrafted.ts` B4 손 사례 23개(토큰 64·캐릭터명 에코 64·존 이름 64 경계·빈 문자열·i32 최소/최대·GOLD_MAX·f32 -0·최대 유효,
      NaN·±Inf NonFinite, BadBool·OverMax·BadUtf8·Truncated·Trailing).
    - 와이어 특성화 골든: B4 패킷을 받는 6개 세션의 **sha256·bytes·frameDigest만** 바뀌었다(18 leaf/237 — B4 패킷 11종이 시나리오에 나온다, 나머지 4개
      세션은 B4 패킷을 받지 않아 불변). semantic(26 id)·frames·packets·idSeq·stateCheckpoints·stateFinal 불변 — 스냅샷 파싱 diff 후 갱신. 클라 수신 바이트 합
      189,341 → 188,188(−0.61% — B4 패킷은 응답·저빈도라 바이트 비중이 작다).
  - **B5(완료 — JSON S2C 13개 = CHAR_LIST + 자율 형식 12개를 도메인별 a(JSON 상태 스키마화)·b(flip) 쌍으로 전환, ①b 뒤 S2C 전부 바이너리)**: 커밋 순서 B5-0 → B5-P(DB 적재
    경계 정규화) → ②(인벤·상점) → ③(스킬·UI 설정) → ④(NPC 대화·퀘스트) → ①(캐릭터·포탈 + CHAR_LIST 형태 변경), b마다 protoVersion·IPC_VERSION 짝 bump.
    - **B5-0(완료 — 시험만, 와이어 불변: packets.json·protoVersion 7·IPC_VERSION 9·메인 특성화 골든 그대로)**: 메인 골든은 B5 대상 중 9개 id
      (0x0011·0x0301·0x0421·0x0451·0x0453·0x0460·0x0462·0x0464·0x0471)를 보지 않고 0x0019·0x0302·0x0444·0x0445도 일부 사례만 본다 — 그래서 본문 특성화
      미니 골든 `tests/regression/s2cBodyCharacterization.test.ts`를 먼저 세웠다. 실물 핸들러·빌더·shared/data 로더·in-memory DB를 결정론 직접 호출(TCP·tick
      없음, 세션 링크 = 캡처 소켓, 시각 고정, DB id 대역 고정)로 돌려 id별 {frames, semantic(메인 골든과 같은 `semanticJson` — 디코드 값 정규화), body(실제
      송신 본문 바이트)}를 고정한다. 허용 변경(머리 주석이 정본): a = 그 id semantic, b = 그 id body, CHAR_LIST 형태 변경(①b) = semantic + body, 와이어 무관
      커밋(B5-P 포함) = 불변. 대상 프레임마다 shapeViolations 0(원 페이로드·디코드 값 — freeform은 a부터 자동 검사), session.send ↔ 소켓 프레임 1:1(drop 0),
      2회 실행 동일, 사례 커버 단정(인코딩 무관 디코드 값). 사례: 계정 목록(한글 이름 Lv12 기본 위치·x 63.27341·DevAuto 66 B 이름·빈 목록), 신규 캐릭
      생성 → 입장 → 마을 NPC 대화(테오·로사 quest_state 분기·주민 선택지 0)·수락 실패/성공·UI 설정 저장·장착·상점·처치·턴인(choice)·1/10레벨 상승·daily
      수락/턴인(random)·포기 거부, Lv300 최대치 노장(24칸 만석·장비 8칸·9번 스킬 lv10·완료/오늘 daily — B5-P 적재 범위 경계값이라 정상 행 항등이면 불변)
      → 비정렬 Map 순서 INVENTORY_UPDATE, 포탈 4존(포탈 없는 존 포함). 13 id·57 프레임. 불일치 진단은 opt-in `S2C_GOLDEN_DUMP=<파일>`(프레임당
      라벨·id·본문 길이·본문 해시·정규화 JSON 1줄 — HEAD와 작업 트리 덤프를 diff).
    - **B5-P(완료 — 와이어 무관: packets.json·protoVersion 7·IPC_VERSION 9·메인·미니 특성화 골든·결정론 골든 그대로)**: DB 적재 경계 정규화
      `server/src/identity/rowBounds.ts` — 아래 "B5에 넘기는 것"의 DB 적재값 항목. 테이블에 CHECK가 없어 외부 쓰기·레거시·손상 행이 메모리로 올라오면
      flip 뒤 그 값이 실리는 패킷을 송신 방어층이 통째로 버린다(클라 인벤·시트 공백). characters는 `characterRepo.toCharacter`(모든 SELECT·RETURNING)가
      컬럼 규칙 표 `CHARACTER_COLUMN_RULES`로 묶는다 — 와이어 계약의 전제는 도메인 범위(level·slv [1, 300] = CHAR_LEVEL_UP.statDeltas ≤ 12 × 299의
      전제, gold [0, GOLD_MAX] = appliedGoldDelta·GOLD_UPDATE, stat value [0, `STAT_VALUE_LOAD_MAX` 10,000]·xp [0, 3]·graph [0, `GRAPH_MAX` 4] = 이 상한에서
      MAX_LEVEL까지 레벨업해도 stat ≤ 10,299·hpMax ≈1.6e8·mpMax ≈9.6e7), 나머지 정수는 i32 비음수 포화(hp_max·mp_max·zone_id는 1 이상)·비정수 trunc,
      그 뒤 hp ≤ hp_max·mp ≤ mp_max(`CHARACTER_CAPPED_COLUMNS` — spawn이 hp를 존 체력으로 그대로 쓴다), x·y는 f32 유한이 아니면 −1(`COORD_LOAD_INVALID` —
      모든 존 밖이라 입장 보정 `entryPosition`이 종전처럼 존 스폰으로 보낸다. 0이면 존 안 모서리에 선다), 장비 칸은 [0, 2^31−1] 정수가 아니면 0(끌어오면
      다른 아이템이 된다). inventory 행은 `inventoryFromRows`(ENTER_WORLD·GM 오프라인 지급)가 slot ∉ [0, 24)·itemId ∉ [1, 2^31−1](비정수 포함)·qty < 1이면
      버리고 qty는 trunc·포화, character_skills는 `learnedSkillsFromRows`(ENTER_WORLD)가 정의 있는 스킬의 level을 [1, maxLevel]로(정의 없는 행은
      SKILL_LIST에 안 실려 그대로). 정상 행은 같은 객체·warn 0, 범위 밖은 값마다 warn(mod `rowBounds` — charId·column·raw·clamped, 관계 위반은 capColumn도,
      비수치 원값은 앞 64자 + 길이·BLOB은 바이트 수). 고치는 것은 메모리 값이다 — DB 행은 그 컬럼을 쓰는 저장이 돌 때만 고쳐진다(x·y·hp는 입장 뒤 상태
      저장마다, 진행 컬럼은 진행 dirty 저장·GM 진행 쓰기, 장비·인벤 행은 인벤 dirty 저장·GM 오프라인 지급의 전량 재기록, zone_id는 포탈, 스킬 level은
      그 스킬의 학습·레벨업, graph·race는 쓰는 경로 없음). 그때까지 적재마다 warn이 다시 나고, 복구는 서버를 내린 뒤 수동(architecture.md §6.4).
      `GRAPH_MIN/MAX/SUM_REQUIRED`는 `sim/progression/graph.ts`로 옮겼다(identity → 패킷 핸들러 값 import가 규칙 표의 모듈 최상위 평가와 맞물려
      생길 수 있는 TDZ 순환 제거).
      설계안과 다른 점: graph는 설계안의 i32 포화가 아니라 [0, GRAPH_MAX] — stat 성장이 레벨당 floor((xp + graph) / 4)라 graph 2^31−1이면 레벨 1회에
      stat +5.4e8 → hpMax i32 초과(stat 상한만으로는 레벨업 뒤를 못 묶는다). 비유한 좌표는 설계안의 0이 아니라 −1(0은 입장 보정의 존 스폰 폴백을 우회한다).
      계약 시험(`wireLimitsContract`): 최악 적재 행(level 1·상한 stat/xp/graph·누적값
      I32_MAX) → MAX_LEVEL에서 statDeltas = 3,588개·모든 정수 i32. 규칙 시험(`tests/server/identity/rowBounds.test.ts`): PRAGMA 컬럼 ↔ 규칙 표 대조(새 컬럼은
      규칙 없이 통과 못 함)·컬럼별 경계값 항등·범위 밖 30사례·hp/mp 관계·로그 원값 절단·쓰기 경로 없는 컬럼(graph)의 warn 반복·인벤·스킬·배선(ENTER_WORLD
      — 비유한 좌표 → 존 스폰·hp cap, GM 오프라인 지급). 대상 밖(그대로): characters.name(①a 송신 전
      clamp)·rowid(MONSTER_ID_BASE 미만 가정 — B3b·B4와 같다), character_quests(progress 파싱이 정수 ≥ 0 강제, 송신은 required로 상한 —
      `questListHelper`·`questProgressService`), UI 설정(zod 적재 검증), GM 상세의 오프라인 인벤·스킬 표시(진단용 원값 — 와이어 아님).
    - **B5②a(완료 — 인벤·상점 JSON 상태 스키마화, 와이어 바이트 불변: protoVersion 7·IPC_VERSION 9, lock same 모드)**: INVENTORY_LIST(`slots:
      InventoryEntry[]` max 24 — 점유 칸만·원소 순서 = 서버 Map 삽입 순, `equipment: EquipmentSlots` 8 × i32)·INVENTORY_UPDATE(`bodyOf: INVENTORY_LIST` —
      packets.json bodyOf의 첫 실물 사용, C# `InventoryUpdatePayload : InventoryListPayload`)·SHOP_LIST(`entityId`·`shopId` i32, `name` string max 240 B,
      `offers: ShopOffer[]` max 256)가 freeform → 필드(protocol.md §2.10 표). 서버 송신부(`zone.sendInventoryPacket`·`shopHandlers.sendShopList`)는 생성
      페이로드 타입으로 객체를 만든다(리터럴·키 순서 불변). 서버 `Equipment`는 생성 `EquipmentSlots`의 재export — 별도 interface면 칸을 늘린 키가 spread로
      타입 검사 없이 와이어에 실린다 — 이고 `EQUIP_SLOT_KEYS`는 `satisfies (keyof EquipmentSlots)[]`. 상류 강제: shops.json 로더(`world/shop/shopRegistry.ts`)가
      id·offer itemId `wireIntPos`(종전 i32 상한 없음), name 80자(zod — 코드 포인트) + `fitsWireString(·, 240)`, offers `.max(256)`을 부팅 시 강제(실데이터
      상점 1·이름 19 B·offer 15 그대로 통과). 인벤 상한·값 i32는 B5-P 적재 경계(`inventoryFromRows`·장비 칸)와 메모리 경로(칸 0..23)가 진다. SHOP_SELL
      zod slot 상한은 `INVENTORY_SLOTS − 1`에서 유도한다(종전 리터럴 23 — `sellSchema` export). 클라: 수기 `InventorySlotS2C`·`EquipmentS2C`·`InventoryListS2C`
      (ItemDtos.cs — items.dat 모델 `ItemDefDtoS2C`·`ItemCatalogFile`만 남김)·`ShopDtos.cs` 삭제, 구독자 6파일(ItemController·QuestStore·ItemPanel·
      EquipmentPanel·CharacterSheet·ShopPanel)이 생성 타입 — INVENTORY_UPDATE도 `Subscribe<InventoryListPayload>`(②b flip 뒤 바이너리 디코드의 `decoded is T`가
      상속으로 성립), ItemPanel 격자 칸 수 = `WireLimits.InventoryListSlotsMax`. EditMode `JsonStatePayloadTests` 재도입(B3a 형식·같은 GUID — 서버 키 순서
      그대로의 JSON → 생성 타입, INVENTORY_UPDATE의 기반 타입 수신, 각 b 커밋이 그 사례를 지우고 ①b가 파일을 지운다). 시험: `schema.test`(freeform 9, B5
      스키마화 패킷 전부의 flip 최악 본문 ≤ 65,535 일반 단정 — a 커밋에서 예산 초과를 잡는다 — + INVENTORY_LIST 322 B·SHOP_LIST 3,324 B), `typedSend`
      (equipment 필수·원소 형태·가격 타입), `wireLimitsContract`(INVENTORY_SLOTS = slots max = 판매 슬롯 범위, EquipmentSlots 필드 순서 = EQUIP_SLOT_KEYS =
      makeEmptyEquipment 키 순서, 상점 이름 80자 ≤ 240 B, 인벤 만석·i32 최대값의 현행 본문 < 4 KB), `tests/server/shop/shopRegistry.test.ts`(실물 통과·
      240/241 B·4 B 문자 60/61개·짝 없는 서로게이트·i32 경계·offers 256/257·로더 최대 상점의 flip 인코드 3,324 B·현행 JSON 본문 ≤ 상한의 절반 — JSON에서는
      max가 본문을 묶지 못한다), `uiAndShop`(SHOP_LIST 페이로드 정확 단정·키 순서). 골든: 메인 237/237·
      결정론 1/1·미니 39/39 leaf 불변 — 세 id의 semantic도 바뀌지 않았다(정수·문자열뿐이라 바이너리 왕복 정규화 값 = 종전 정렬 키 JSON), 미니 덤프 57줄이
      B5-P와 같다. 설계안과 다른 점: `Equipment` 재export(설계안 선택 항목)를 채택했고, 판매 슬롯 계약은 리터럴 23 대조 대신 상수 유도 + 경계 시험으로,
      "스키마화 패킷 최악 본문" 단정은 패킷 나열 대신 비-freeform JSON 전부(CHAR_LIST 제외)를 flip해 보는 일반형으로 했다(③a·④a·①a가 그대로 덮는다).
    - **B5②b(완료 — 인벤·상점 S2C 3개 binary flip, protoVersion 8·IPC_VERSION 10)**: INVENTORY_LIST·SHOP_LIST에 `"encoding": "binary"` —
      INVENTORY_UPDATE는 `bodyOf`라 선언 없이 상속한다(스키마가 bodyOf의 encoding 선언을 거부, 생성 TS·C# 코덱은 같은 본문 함수). 필드·정수 폭은 ②a
      스키마 그대로라 서버 송신부·클라 구독자·loadgen은 코드 변경 없이 `isBinaryPacket` 분기로 전환됐다(클라 구독자는 ②a에 이미 생성 타입 — INVENTORY_UPDATE의
      바이너리 디코드 결과 `InventoryUpdatePayload`가 `InventoryListPayload`를 상속해 PacketBus `decoded is T` 성립). lock: bump 모드(세 패킷 encoding·
      wireHash만, layoutHash 불변). 최악 본문 INVENTORY_LIST·UPDATE 322 B·SHOP_LIST 3,324 B(생성 `MAX_BODY_BYTES`). 교차 언어 골든 손 사례 18개
      (`goldenCrafted.ts` B5_2_REAL — 빈 인벤·24칸 만석 비정렬·i32 최대·장비 8칸, 24칸 원소 없음 Truncated·25칸 OverMax·장비 잘림·Trailing, bodyOf
      INVENTORY_UPDATE 유효·OverMax, 상점 이름 240 B(한글 80자·4 B 문자 60개)·241 B OverMax·짝 없는 서로게이트·overlong BadUtf8, offers 0·256(가격 GOLD_MAX)·
      257 OverMax·원소 없음·원소 잘림). 시험: `schema.test`(JSON 10·binary S2C 32·binaryStructs에 InventoryEntry·EquipmentSlots·ShopOffer, B5②b — 세 패킷
      binary·UPDATE는 encoding 미선언 상속·최악 본문 = MAX_BODY_BYTES, a~b 일반 단정은 대상 0으로 유지 — ③a부터 다시 채워진다), `wireCodec.test`(binary 집합,
      UPDATE 본문 바이트 = LIST 본문·헤더 id만 다름), `wireLimitsContract`(만석 인벤 송신 본문 = 322 B, 25칸 = WireEncodeError — 종전 "JSON 본문 < 4 KB"),
      `shopRegistry.test`(로더 최대 상점의 송신 바이트 = 참조 코덱 3,324 B — 종전 "JSON 본문 ≤ 상한의 절반", 로더를 우회한 이름 241 B·짝 없는 서로게이트·offers 257은
      인코드 거부 = 송신 방어층이 그 패킷만 drop), `identity.test` PROTO_VERSION 8, `ipcHandshake` [10, 8]. EditMode: `UiV3IntegrationTests` INVENTORY_LIST를
      생성 코덱 본문(전 필드)으로 게시, 별도 시험 `InventoryUpdate_BinaryBodyOf_ReceivedByBaseTypeSubscribers`가 INVENTORY_UPDATE를
      `InventoryUpdatePayload`로 게시해 기반 타입 구독(ItemController·ItemPanel)이 받는지 단정(②a `JsonStatePayloadTests`의 bodyOf 사례를 잇는다),
      `Editor/NoahUiV3Validation` 인벤 픽스처도 생성 코덱 게시(`PublishWire` 신설). `JsonStatePayloadTests`는 B5② 사례 4개가 전부여서 파일째 삭제했다
      (③a가 같은 GUID `a17d29958d468c742b9e62518dc49a58`로 재도입 — ②a 기록의 "①b가 파일을 지운다"는 "비면 b 커밋이 지우고 다음 a가 다시 만든다"로 바뀐다).
      골든: 메인은 flip 패킷을 받는 2세션(0x0445 ×4·0x0444 ×1)의 sha256·bytes·frameDigest만(237 leaf 중 6, semantic·frames·packets·idSeq·state 불변 —
      클라 수신 188,188 → 187,624 B), 미니는 세 id의 body만(39 leaf 중 3 — 덤프 57줄의 라벨·id·정규화 JSON 동일, 스타터 인벤 249 → 82 B·만석 966 → 322 B·
      실물 상점 737 → 211 B), 결정론 불변. Unity 클라를 다시 빌드하지 않은 구 클라(protoVersion 7)는 HELLO 버전 불일치 바이너리 KICK 1로 거절된다.
    - **B5③a(완료 — 스킬·UI 설정 JSON 상태 스키마화, 와이어 바이트 불변: protoVersion 8·IPC_VERSION 10, lock same 모드)**: SKILL_LIST(`skills:
      SkillInfo[]` max 256)·UI_PREFERENCES(`quickSlots` i32 min = max 6·`trackedQuestIds` i32 max 5·`hasSavedSettings` bool)가 freeform → 필드(protocol.md
      §2.10 ③ 표). `SkillInfo` 14필드는 서버 송신 키 순서 그대로(skillId·name 64 B·category·effectKind·mpCost·cooldownMs·range f32·slvReq·slpCost·maxLevel·
      targeting·aoeRadius f32·level·learned — `_doc` 드리프트(G-8 targeting·aoeRadius 누락)도 고쳤다). enum 3개(u8): `SkillCategory`(physical·magical·heal)·
      `SkillDefEffectKind`(damage·heal — 와이어 결과 enum `SkillEffectKind`와 별개: 재사용하면 cast·fizzle이 타입상 허용되고 SKILL_EFFECT enum 변경이 SKILL_LIST
      지문까지 흔든다)·`SkillTargeting`(entity·ground). **enum 단일 진실 패턴**(④·①이 재사용): 서버 로더의 리터럴 유니온 타입은 생성 enum의 재export
      (`world/skill/skillDataLoader.ts` — `export type { SkillCategory, … }`), z.enum 입력 배열 `SKILL_*`는 `as const satisfies readonly SkillCategory[]`(멤버만
      보장) + 값 집합 동일 시험(`Object.keys(SKILL_CATEGORY_CODE)`), 값 집합이 다른 `sim/combat/damage.ts`의 2값 공식 분기는 `DamageCategory`로 개명.
      UI_PREFERENCES는 `bodyOf: UI_PREFERENCES_SET`이 불가(필드 추가·optional 상속)해 같은 이름·같은 상한으로 따로 선언하고 `wireLimitsContract`가 두 패킷의
      min·max·원소형을 묶는다. 서버 송신부: `skillListHelper.buildSkillList(): SkillInfo[]`(수기 `SkillListEntry` 삭제), `uiPreferencesHandler.sendUiPreferences`가
      `UiPreferencesPayload` 리터럴(종전 load 값 제자리 변경 + spread → 새 객체, 키 순서 불변). 상류 강제: skills.json 로더가 name `fitsWireString(·, 64)`
      (종전 상한·서로게이트 검사 없음 — 실물 최장 `파워스트라이크` 21 B), skills `.max(256)`, range·aoeRadius `[0, SKILL_RANGE_MAX = 1024]`(zod는 3.4e38 초과
      유한값을 통과시킨다 — f32로 정확하고 어느 존보다 큰 도메인 상한)를 부팅 시 강제(itemeditor 저장도 같은 `parseSkillDefs`), level은 B5-P 적재 경계,
      UI 설정 개수는 `uiPreferencesRepo` zod(SET 생성 상수)가 저장·적재에서 강제하고 송신은 슬롯을 0으로 바꾸거나 추적을 빼기만 한다. 클라: 수기
      `SkillDtos.cs`(`SkillInfoS2C`·`SkillListS2C`)·`UiPreferencesDtos.cs` 삭제, 구독자 5파일(SkillCaster·SkillPanel·CharacterSheet·ItemTooltip·QuestStore)이
      생성 타입 — 문자열 비교를 enum 비교로(`SkillCaster.ColorFor(SkillCategory)`, `Targeting == SkillTargeting.Ground`, `EffectKind ==
      SkillDefEffectKind.Heal`, SkillPanel 카테고리 필터는 `SkillCategory?` — null = 전체, 탭 이름과 enum을 한 행에 짝짓는 `FilterTabs` 표). 종전 수기 DTO의
      "구서버 호환" 기본값(learned = true·level 1·targeting "entity")은 서버가 모든 키를 싣는 지금 쓰이지 않는다 — 생성 타입 기본값은 enum 코드 0(targeting =
      entity)·0·false. EditMode `JsonStatePayloadTests` 재도입(같은 GUID — 서버 키 순서 그대로의 SKILL_LIST·UI_PREFERENCES JSON → 생성 타입, enum 값 이름 →
      멤버 전수, 키 생략 → 기본값, 퀵슬롯 칸 수·추적 상한 = 생성 상한). 시험: `schema.test`(freeform 7·JSON 10, B5_JSON_STATE = 두 패킷 — a~b 일반 최악 본문 단정이
      다시 대상을 얻는다, B5③a 필드·enum·flip 시 최악 본문 27,138 B·49 B·binaryStructs에 SkillInfo — 순서는 패킷 순회 순이라 InventoryEntry 앞), `typedSend`
      (category·effectKind enum 밖 값·targeting 누락·hasSavedSettings 누락 거부), `wireLimitsContract`(UI 두 패킷 개수 규칙 동일, 한글 21자·실물 이름 ≤ 64 B,
      SKILL_RANGE_MAX f32 정확·존보다 큼, UI 최대 스냅샷의 현행 JSON 본문 < 4 KB), `skillDataLoader.test`(값 집합 = 생성 enum, 이름 64/65 B·4 B 문자 16/17개·
      서로게이트, 스킬 수 256/257, range·aoeRadius 1024 통과·1024.5·1e39·음수·∞·NaN 거부, 로더 최대 카탈로그의 flip 인코드 = 27,138 B), `skillListHelper.test`
      (원소 키 순서 = SkillInfo 필드 순서·shapeViolations 0·ground 메타), 불완전 SkillDef 픽스처(`skillLearnHandlers`·`skillBookUse`)에 targeting·aoeRadius·
      impactDelayMs를 채웠다(③b 실 인코더 경로 대비). 골든: 메인 237/237·결정론 1/1·미니 39/39 leaf 불변 — 0x0421·0x0471의 semantic도 바뀌지 않았다
      (정수·문자열·bool·f32로 정확한 실수(2·2.5·7 등)뿐이라 바이너리 왕복 정규화 값 = 종전 정렬 키 JSON), 미니 덤프 57줄이 ②b와 같다. 실물 JSON → ③b
      binary 예측: 9종 카탈로그 1,951 → 482 B, 기본 설정 74 → 29 B. 설계안과 다른 점: 선택 항목 `uiPreferencesRepo.load` safeParse 폴백은 와이어 무관
      별건으로 남겼다(아래 B6 인계), 로더 범위 상수 `SKILL_RANGE_MAX`는 skillDataLoader가 export한다.
    - **B5③b(완료 — 스킬·UI 설정 S2C 2개 binary flip, protoVersion 9·IPC_VERSION 11)**: SKILL_LIST·UI_PREFERENCES에 `"encoding": "binary"`. 필드·
      정수 폭·enum은 ③a 스키마 그대로라 서버 송신부·클라 구독자·loadgen은 코드 변경 없이 `isBinaryPacket` 분기로 전환됐다(클라 구독자는 ③a에 이미 생성
      타입 — 주석만 갱신). lock: bump 모드(두 패킷 encoding·wireHash만, layoutHash 불변). 최악 본문 SKILL_LIST 27,138 B·UI_PREFERENCES 49 B(생성
      `MAX_BODY_BYTES`) — ③a JSON 상태의 틈(로더 통과 카탈로그의 JSON 본문 u16 초과 — 첫 drop 182종·제어 문자 이름 97종)이 닫혔다. range·aoeRadius는
      f32 — 클라 수신 필드는 JSON 시절에도 float였고 실물 값(0·2·2.5·6·7·8)은 f32로 정확하다(서버 판정은 종전대로 f64 정의값). 교차 언어 골든 손 사례
      28개(`goldenCrafted.ts` B5_3_REAL — SKILL_LIST 19: 빈 카탈로그·실물 형태(강타·치유·지면 마력 폭풍)·이름 64 B(한글 21자 + ASCII·4 B 문자 16개)·
      65 B OverMax·짝 없는 서로게이트 BadUtf8·skills 256(빈 이름)·256 원소 없음 Truncated·257 OverMax·i32 최대 + range·aoeRadius 1024·range -0 + aoeRadius
      f32 최대·category 3·effectKind 2(결과 enum의 cast 코드)·targeting 2 BadEnum·range NaN·aoeRadius +Inf NonFinite·learned 2 BadBool·원소 잘림·Trailing,
      UI_PREFERENCES 9: 기본·추적 5개(i32 최대)·quickSlots 5(원소 전)·0 UnderMin·7 OverMax·잘림 Truncated·추적 6 OverMax·hasSavedSettings 2 BadBool·
      Trailing). 개수 경계(256)는 작은 원소로, i32 최대·range 1024는 원소 1개로 나눴다 — 256개 전부 최대값이면 그 사례 하나가 골든 JSON에 94 KB(나눈 뒤
      79 KB, 골든 768 → 882 KB — payload의 원소마다 키 이름·float 비트 문자열이 붙는다). 시험: `schema.test`(JSON 8·binary S2C 34·binaryStructs
      SnapshotUpdate·Waypoint·SkillInfo·InventoryEntry·EquipmentSlots·ShopOffer, B5③b — 두 패킷 binary·최악 본문 = MAX_BODY_BYTES, a~b 일반 단정은 대상 0으로
      유지 — ④a부터 다시 채워진다), `wireCodec.test`(binary 집합, UI_PREFERENCES 본문 바이트 정확값·퀵슬롯 3칸 인코드 거부), `wireLimitsContract`(UI 최대
      스냅샷 송신 본문 = 49 B — 종전 "JSON 본문 < 4 KB", 퀵슬롯 5·7·추적 6 = WireEncodeError), `skillDataLoader.test`(로더 최대 카탈로그의 송신 바이트 =
      참조 코덱 27,138 B = MAX_BODY_BYTES — 종전 "flip해 본 참조 코덱", 로더를 우회한 이름 65 B·짝 없는 서로게이트·257종·range NaN·aoeRadius ∞는 인코드
      거부 = 송신 방어층이 그 패킷만 drop), `wireFrameBudget.test` SKILL_LIST 사례 삭제(NPC_DIALOG·QUEST_LIST만 남는다 — ④b에 파일 삭제), `identity.test`
      PROTO_VERSION 9, `ipcHandshake` [11, 9]. EditMode: `UiV3IntegrationTests`의 SKILL_LIST JSON 게시 2곳을 생성 코덱 본문(전 필드 — `Skill()`·`SkillsOf()`
      헬퍼)으로, 새 시험 `SkillListAndUiPreferences_BinaryReachSkillCasterQuickSlots`(바이너리 SKILL_LIST·UI_PREFERENCES → SkillCaster: enum 3개·f32·learned
      필터·퀵슬롯 6칸·미학습 슬롯 0 — ③a `JsonStatePayloadTests`의 상수 계약(퀵슬롯 칸 수·추적 상한 = SET = S2C)을 바이너리 경로에서 잇는다),
      `Editor/NoahUiV3Validation` 스킬 픽스처도 생성 `SkillListPayload` 게시(`PublishWire`). `JsonStatePayloadTests`는 B5③ 사례가 전부여서 다시 파일째
      삭제했다(④a가 같은 GUID `a17d29958d468c742b9e62518dc49a58`로 재도입). 골든: 메인 237/237 leaf 불변(하니스가 두 패킷을 거치지 않는다 — flip 세션 0),
      미니는 두 id의 body만(39 leaf 중 2 — 덤프 57줄의 라벨·id·정규화 JSON 동일, 9종 카탈로그 1,951 → 482 B·기본 설정 74 → 29 B·저장 설정(추적 1개)
      77 → 33 B·노장 저장 설정 73 → 29 B), 결정론 불변. Unity 클라를 다시 빌드하지 않은 구 클라(protoVersion 8)는 HELLO 버전 불일치 바이너리 KICK 1로
      거절된다.
    - **B5④a(완료 — NPC 대화·퀘스트 JSON 상태 스키마화, 와이어 바이트 불변: protoVersion 9·IPC_VERSION 11, lock same 모드)**: NPC_DIALOG(entityId·
      npcId·npcName 66 B·dialogueId·entry 64·`nodes: DialogNode[]` max 12)·QUEST_LIST(`active: QuestLogEntry[]` max 20·`completed`·`dailyDoneToday` i32 max
      1024)·QUEST_ACTION_ACK(op·questId·errCode i32·`rewards?: QuestGrantSummary`)·QUEST_NPC_MARKERS(`npcs: NpcQuestMarker[]` max 1024)가 freeform → 필드
      (protocol.md §2.10 ④ 표). struct 10개(DialogAction·DialogOption·DialogNode·QuestLogObjective·RewardPreviewItem·QuestRewardPreview·QuestLogEntry·
      QuestGrantItem·QuestGrantSummary·NpcQuestMarker — 필드 순서 = 서버 송신 키 순서)와 enum 3개(u8, 값 이름 = 종전 JSON 문자열): `QuestType`(scenario·
      normal·regional·daily)·`QuestObjectiveKind`(kill·collect·talk·reach)·`RewardSource`(fixed·choice·random·bonus). **NPC_DIALOG는 평탄화하지 않고
      `action.type`도 enum으로 만들지 않았다**(설계 결정 — snake_case 값 이름은 enum 규칙(camelCase)에 걸려 a가 불가능해지고, 클라가 NPC_ACTION.actionType에
      문자열을 되돌려 보낸다): 선택지 `next`·`action`과 액션 `questId`·`shopId`가 optional(정확히 하나는 로더 superRefine). 숫자 코드(op·errCode·
      marker)도 enum이 아니다(JSON 값 이름 문자열이 되어 바이트가 바뀐다 — enum화는 별도 bump 후보). `_doc`에 open_shop·shopId를 더했다. enum 단일 진실
      (③a 패턴): `questDataLoader`의 `QuestType`·`QuestObjectiveType`(= `QuestObjectiveKind`)과 `questRewardRoll`의 `RewardSource`는 생성 enum 재export,
      `QUEST_TYPES`·`QUEST_OBJECTIVE_TYPES`는 `satisfies` + 값 집합 동일 시험, `GrantedItem` = 생성 `QuestGrantItem`. 서버 송신부: `npcInteractHandler`가
      `NpcDialogPayload` 리터럴(resolver의 `ResolvedNode`·`ResolvedOption`은 생성 `DialogNode`·`DialogOption`을 확장하고 action만 로더 union으로 좁힌다 —
      NPC_ACTION 재-resolve가 그 타입으로 (actionType, questId) 일치를 본다), `questListHelper`가 `QuestLogEntry[]`·`QuestRewardPreview`·
      `NpcQuestMarker[]`(종전 `object`), `questService.sendQuestAck`가 `QuestActionAckPayload`·`QuestGrantSummary`. 상류 강제(전부 부팅 검사 — 실데이터 그대로
      통과): npcs.json 로더 — label `.max(80)` + `fitsWireString(·, 240)`, speaker `fitsWireString(·, 66)`(종전 상한 없음), pages 장당 `fitsWireString(·, 600)`·
      노드당 ≤ 4(**종전 500자 = 최악 2,000 B에서 축소** — 실물 최장 137 B), options ≤ 8, nodes ≤ 12, defs ≤ 1024, 액션 questId·shopId `wireIntPos`; quests.json
      로더 — name `.max(40)` + `fitsWireString(·, 120)`, description `.max(500)` + `fitsWireString(·, 1500)`, 보상 네 목록 각 ≤ 8(종전 상한 없음 — 턴인 지급
      ≤ 18의 근거), quests ≤ 1024, objectives `.max(QUEST_LOG_ENTRY_OBJECTIVES_MAX)`, id 참조 `intPos` = `wireIntPos`·turnInNpcId `wireIntNonneg`(파일 단위
      i32 — dataIntegrity 실재 검사와 별개); items.json 로더 — **name `wireDisplayName("item")`**(종전 상한 없음 — 퀘스트 collect 목표 라벨 `이름 + " 수집"`의
      근거, 실물 최장 32 B). 송신 가드: `sendQuestList`는 진행 수가 `QUEST_LIST_ACTIVE_MAX`에 닿으면 push를 멈추고 warn(`ACTIVE_QUEST_CAP`은 수락 시점에만
      강제 — 손상 행·상수 변경 대비, 이력은 계속 싣는다). NPC_ACTION의 optionIndex·chosenIndex 상한을 `questHandlers` 상수(`NPC_ACTION_OPTION_INDEX_MAX` 31·
      `NPC_ACTION_CHOSEN_INDEX_MAX` 7)로 꺼내 `wireLimitsContract`가 옵션·choice 상한과 묶는다(설계안은 리터럴 비교 — 계약을 기계로 묶으려고 상수화했다).
      리뷰 반영: 로더의 문자열 바이트 상한을 공용 `dataWireLimits.wireString(max, subject, target)` 한 관용구로 모았다(npcs·quests·shops·skills 로더 —
      오류 문구 `<subject> must fit <target> (≤ max UTF-8 bytes, …)`, `wireDisplayName(owner, target)`도 이것을 거친다). items.json 이름의 target은
      `QuestLogObjective.text`(종전 공용 문구는 아이템 이름이 나가지 않는 ENTITY_SPAWN.name을 가리켰다). NPC_ACTION·QUEST_ABANDON 핸들러의 dialogueId·questId
      범위를 1..1e6에서 i32 양수로 넓혔다(`QUEST_HANDLER_ID_MAX` = 로더 `wireIntPos` 상한 — `wireLimitsContract`, `npcActionHandler.test`가 i32 최대 id 수락을
      단정. 종전엔 로더가 받은 1e6 초과 id의 옵션·퀘스트가 수락·포기에서 무응답 drop됐다).
      클라: 수기 `NpcDtos.cs`·`QuestDtos.cs` 삭제, 구독자 5파일 + PlayMode — `NpcDialogPanel`(배열 `.Length`, `Action.Type` 문자열 비교는 그대로,
      `QuestId ?? 0`, choice 스텝 `RewardPreviewItem[]`)·`QuestStore`(collect 판정 `QuestObjectiveKind.Collect`, QUEST_PROGRESS는 생성 객체 제자리 갱신 —
      PacketBus가 구독자마다 디코드)·`QuestJournalPanel`(탭 필터 `QuestType?` — null = 전체, `BadgeOf(QuestType)`, 보상 `Fixed`·`Choice`·`Random`·
      `Bonus`)·`QuestTrackerHud`·`NpcView`, `FollowupLiveTests`(`NpcDialogPayload`, `Action?.Type`·`QuestId ?? 0`). EditMode `JsonStatePayloadTests`
      재도입(같은 GUID — 실물 데이터로 서버 함수를 돌려 찍은 키 순서의 NPC_DIALOG·QUEST_LIST·QUEST_ACTION_ACK·QUEST_NPC_MARKERS JSON → 생성 타입, optional 부재
      → null, 빈 배열 ≠ null, enum 값 이름 → 멤버 전수, JSON 키 `fixed` → 생성 필드 `Fixed`). 시험: `schema.test`(freeform 3·JSON 8, B5_JSON_STATE = 네 패킷 —
      a~b 일반 최악 본문 단정이 다시 대상을 얻는다, B5④a 필드·optional·enum·flip 시 최악 본문 64,492·64,378·193·8,194 B와 여유 1,043·1,157 B·노드 13개/진행 21개
      초과·binaryStructs — 패킷 순회 순이라 Dialog*·Quest* struct가 ShopOffer 앞), `typedSend`(pages 단일 문자열·questId 문자열·QuestType·QuestObjectiveKind·
      RewardSource 밖 값·rewardPreview 누락·marker 누락 거부), `wireLimitsContract`(노드 id 3필드 = NPC_ACTION.nodeId·액션 type = actionType·리터럴 4종, 옵션·
      choice ≤ NPC_ACTION 인덱스, npcName = 표시 이름, 목표 라벨 = max(표시 이름, 존 이름) + 접미사(`objectiveText` 출력에서 뗀다) ≤ 96·대상 이름 로더 상한,
      ACTIVE_QUEST_CAP ≤ active·completed = daily·objectives 8·지급 18 ≥ 8 + 1 + 1 + 8·마커 1..3, ACK·마커 최대 JSON 본문 ≤ u16), `npcDataLoader.test`(label
      240 B·4 B 문자 60/61개·서로게이트, speaker 66/67 B, pages 600/601 B·201자·4/5장, options 8/9, nodes 12/13, defs 1024/1025, 액션 id i32 최대/+1, 로더 최대
      대화의 flip 인코드 = 60,364 B ≤ 64,492), `questDataLoader.test`(값 집합 = 생성 enum·지급 출처 = RewardSource, name 120 B·4 B 문자 30/31개, description
      1500 B·375/376개, 보상 네 목록 8/9, quests 1024/1025, id 참조 i32, active 상한 가드(22개 진행 → 20 + 이력 유지), 로더 최대 로그의 flip 인코드 = 51,418 B ≤
      64,378), `itemDataLoader.test`(이름 66/67 B·서로게이트). 골든: 메인 237/237·결정론·미니 39/39 leaf 불변 — 네 id의 semantic도 바뀌지 않았다(정수·문자열·
      enum 값 이름뿐이라 바이너리 왕복 정규화 값 = 종전 정렬 키 JSON, optional 부재는 생략 — 모든 프레임 shapeViolations 0), 미니 덤프 57줄이 ③b와 같다.
      실물 JSON → ④b binary 예측: 대화 전체(조건 전부 통과) 1,560·2,140·233 → 1,003·1,486·126 B, 퀘스트 3종 전부 진행 중 1,677 → 713 B.
    - **B5④b(완료 — NPC 대화·퀘스트 S2C 4개 binary flip, protoVersion 10·IPC_VERSION 12)**: NPC_DIALOG·QUEST_LIST·QUEST_ACTION_ACK·QUEST_NPC_MARKERS에
      `"encoding": "binary"` — S2C 바이너리 38개·JSON 4개(CHAR_LIST + freeform 3). 필드·정수 폭·enum은 ④a 스키마 그대로라 서버 송신부·클라 구독자·loadgen은
      코드 변경 없이 `isBinaryPacket` 분기로 전환됐다(주석만 갱신 — "키 순서는 와이어와 무관"). lock: bump 모드(네 패킷 encoding·wireHash만, layoutHash 불변).
      최악 본문 NPC_DIALOG 64,492 B·QUEST_LIST 64,378 B·QUEST_ACTION_ACK 193 B·QUEST_NPC_MARKERS 8,194 B(생성 `MAX_BODY_BYTES`) — ④a JSON 상태의 틈(로더 최대
      로그의 JSON 95,693 B·이스케이프 많은 대화)이 닫혔다(로더 최대 대화 60,364 B·로그 51,418 B가 실제 송신 바이트 = 참조 코덱). **배열 안 struct의 optional
      presence 첫 실물**: DialogOption(비트 0 next·비트 1 action)·DialogAction(비트 0 questId·비트 1 shopId)이 원소마다 자기 presence 1바이트를 쓰고,
      QUEST_ACTION_ACK는 패킷 presence(비트 0 rewards). next·action 둘 다 있음·둘 다 없음은 와이어로는 유효하다 — 디코더는 미사용 비트만 BadPresence이고
      정확히 하나는 npcs.json 로더 계약이다(설계안 §5 표의 "둘 다 부재 BadPresence"는 코덱 규칙과 달라 미사용 비트 사례로 바꿨다). 교차 언어 골든 손 사례
      69개(`goldenCrafted.ts` B5_4_REAL — NPC_DIALOG 25·QUEST_LIST 26·QUEST_ACTION_ACK 11·QUEST_NPC_MARKERS 7, 유효 23·오류 46 — protocol.md §2.10 ④b 문단).
      개수 경계(nodes 12·options 8·active 20)는 빈 원소로, 1,024개 배열(completed·daily·마커)은 i32 원소 그대로 넣었다. 시험: `schema.test`(JSON 4·binary S2C 38·
      B5_JSON_STATE 비움·binaryStructs에 Dialog*·Quest*·NpcQuestMarker(ShopOffer 앞), B5④b — 네 패킷 binary·최악 본문 = MAX_BODY_BYTES, a~b 일반 단정은 대상 0 —
      ①a부터 다시 채워진다), `wireCodec.test`(binary 집합, QUEST_ACTION_ACK rewards 부재/존재·NPC_DIALOG 중첩 presence 본문 바이트 정확값),
      `wireLimitsContract`(ACK 지급 18·마커 1,024 최대 송신 본문 = 193·8,194 B — 종전 "JSON 본문 ≤ u16", 지급 19·마커 1,025 = WireEncodeError),
      `npcDataLoader.test`·`questDataLoader.test`(로더 최대 대화·로그의 송신 바이트 = 참조 코덱 — 종전 "flip해 본 참조 코덱", 로더를 우회한 장 601 B·짝 없는
      서로게이트·장 5·선택지 9·노드 13·label 241 B·action type 33 B / 진행 21·이름 121 B·설명 서로게이트·목표 9·choice 9·completed 1,025는 인코드 거부 = 송신
      방어층이 그 패킷만 drop), `wireFrameBudget.test` 파일 삭제(데이터 기반 큰 JSON S2C는 NPC_DIALOG·QUEST_LIST가 마지막이었다 — 최악 본문은
      gen·schema.test가 스키마로 단정. 남은 JSON 중 레벨 기반 CHAR_LEVEL_UP은 한 번에 약 76레벨 이상 오르면 지금도 u16을 넘는 기존 결함으로, 아래 B5
      인계대로 ①b가 닫는다 — 이 시험의 대상이 아니었다), `identity.test` PROTO_VERSION 10, `ipcHandshake` [12, 10]. EditMode: `UiV3IntegrationTests` 새 시험 4개 — `NpcDialog_BinaryReachesDialogPanel`(presence 부재 = null·speaker '' = npcName·next
      점프), `QuestListAndActionAck_BinaryReachQuestStoreAndChatLine`(QUEST_LIST + INVENTORY_LIST → QuestStore(enum·choice·collect 로컬 합), ACK 턴인
      rewards(출처 4종) → 채팅 통지 RewardSummary·거부·포기 문구, rewards 부재 = null), `QuestTurnIn_ChoiceStepReadsBinaryRewardPreview`(quest_complete
      선택지 → 대화 바 택1 스텝이 QUEST_LIST의 choice를 펼침), `QuestNpcMarkers_BinaryReachNpcView`(NpcView `!`/`?` 마커·전체 교체·빈 배열 = 전부 끔) —
      ④a `JsonStatePayloadTests`의 상수 계약(대화·로그 예산 상한)을 바이너리 경로에서 잇고, 컴포넌트 Awake는 try 안·finally에서 OnDestroy(static
      PacketBus 구독 정리), `JsonStatePayloadTests`는 B5④ 사례가 전부여서 다시 파일째 삭제(①a가 같은 GUID `a17d29958d468c742b9e62518dc49a58`로
      재도입). ④ 패킷의 EditMode·Editor JSON 게시는 없었다. 골든: 메인 237/237 leaf 불변(하니스가 네 패킷을 거치지 않는다 — flip 세션 0), 미니는 네 id의
      body만(39 leaf 중 4 — 덤프 57줄의 라벨·id·정규화 JSON 동일, 테오 수락 분기 977 → 672 B·로사 인사 364 → 195 B·퀘스트 3종 진행 1,172 → 511 B·빈 로그
      48 → 6 B·턴인 ACK(choice) 177 → 49 B·마커 3개 62 → 18 B), 결정론 불변. 교차 언어 골든 파일은 882 → 1,342 KB(QUEST_LIST 248 KB).
      QUEST_LIST 무작위 본문 6개가 전부 SMALL_BODY 96 B를 넘어 `golden.ts`가 가장 짧은 본문(610 B)으로 폴백하고, 종전 규칙이면 그 전 길이 잘림 610건(538 KB — 1,636 KB)이 됐다 —
      리뷰 반영으로 `truncLengths`가 폴백 바탕이 2 × SMALL_BODY를 넘을 때 앞·뒤 96 B만 자른다(192건, 가운데는 대부분 긴 문자열 안이라 같은 디코더 경로).
      바탕 ≤ 192 B는 두 구간이 전 길이를 덮어 다른 패킷 사례는 바이트 그대로다(생성 전후 비교: QUEST_LIST 잘림 418건 제거 + 그 잘림과 hex가 같아
      중복 제거되던 변조 3건 등장, 그 밖 4,251건 동일·순서 동일). 수동 라이브 play(대화·수락·턴인 choice·포기·마커)는 하지 않았다 — 클라 컴포넌트
      로직은 ④a부터 같은 생성 타입을 받아 바뀌지 않았고, 수신 경로는 PlayMode `FollowupLiveTests`(실TCP 바이너리 NPC_DIALOG → quest_accept →
      QUEST_ACTION_ACK → QuestStore, 입장 마커 → NpcView, open_shop)·integration e2e-npc·e2e-quest(수락·턴인·포기·마커의 바이너리 본문)·위 EditMode 4개
      (턴인 통지·택1 스텝·마커 렌더)가 덮는다 — 남는 것은 화면 배치·연출뿐이다.
      Unity 클라를 다시 빌드하지 않은 구 클라(protoVersion 9)는 HELLO 버전 불일치 바이너리 KICK 1로 거절된다.
    - **B5①a(완료 — 캐릭터·포탈 JSON 상태 스키마화, 와이어 바이트 불변: protoVersion 10·IPC_VERSION 12, lock same 모드)**: CHAR_STATS_FULL(charId·
      name 66 B·race·`graph: CharGraph`·`stats: CharStats`·level…zoneId i32·x·y f32)·CHAR_LEVEL_UP(newLevel·`statDeltas: CharStatDelta[]` max 3,588·hpMaxNew·
      mpMaxNew)·PORTAL_LIST(zoneId·`portals: PortalMarker[]` max 32)가 freeform → 필드(protocol.md §2.10 ① 표) — **자율 형식 0개**(남은 JSON 4개 = CHAR_LIST +
      이 셋). struct 9개(CharStatPair·CharGraph·CharPowStats·CharMagStats·CharChaStats·CharLucStats·CharStats·CharStatDelta·PortalMarker — 서버 타입
      `StatPair`·`CharacterStats`·`GraphAllocation`과 이름을 나눴고 모양이 같아 CharacterRow의 graph·stats 객체를 그대로 싣는다, 필드 순서 = 서버 송신 키
      순서)와 enum 2개(u8, 값 이름 = 종전 JSON 문자열): `StatGroup`(pow·mag·cha·luc)·`StatCode`(atk…act 12개 — 값 순서 = CharStats 중첩 필드 순서). lock은
      CHAR_LEVEL_UP에 looseHash가 붙었다(JSON 레이아웃에 enum — 다음 a 커밋이 없어 쓰이지 않는다). enum 단일 진실(③a 패턴): `statAccumulation`의
      `StatGroup`·`StatCode`는 생성 enum 재export, `StatDelta` = 생성 `CharStatDelta`(z.enum 배열이 없어 `satisfies` 대신 레벨업 순회 순서 = enum 값 순서 =
      CharStats 필드 순서를 `wireLimitsContract`가 묶는다). CHAR_LEVEL_UP `_doc`에 실제로 실리던 `valueAfter`를 더했다. 서버 송신부: `charStatsHelper`가
      `CharStatsFullPayload`(수기 `CharStatsFullBody` 삭제) + 이름 `clampWireString(·, CHAR_STATS_FULL_NAME_MAX)` + warn(정상 이름은 같은 문자열 — 넘는 것은
      외부 DB 편집 같은 손상 행뿐, ENTITY_SPAWN 이름 저장소와 같은 자르기), `charProgressionHelper`가 생성 `CharLevelUpPayload`(같은 이름의 수기 interface
      삭제), `portalListHelper`가 `PortalMarker[]`. 상류 강제(부팅 검사 — 실데이터 그대로 통과): portals 로더(`world/portal/portalRepo.ts`) — id·source/
      dest 존 `wireIntPos`(종전 id nonnegative — 0은 클라 PortalView의 "없음" 센티널), 이름 `wireString(PORTAL_MARKER_NAME_MAX)`(종전 상한 없음), rect 4좌표
      `[0, PORTAL_COORD_MAX = 4096]`(종전 finite만 — ±1e308 rect면 중심이 Infinity), `parsePortalRow` export(로더 경계 시험용); `portalRegistry.load`가 source
      존별 개수 > `PORTAL_LIST_PORTALS_MAX`면 throw. CHAR_LIST(①b 형태 변경)는 상류만: `charListHandler`가 JSON 문자열 안 이름을 `DISPLAY_NAME_MAX`(= ①b
      `CharSummary.name` max)로 자르고 warn, 시험 헬퍼 `tests/helpers/wire.ts charsOf()`(현 JSON 문자열·①b 배열 둘 다 — 시험 17곳 + 미니 골든 로컬 사본을
      교체하고 ①a CHAR_LIST 이름 계약 시험도 이 헬퍼만 쓴다 = 18곳 + 미니 골든, ①b에 `p.chars`로 줄인다). 클라: 수기 `CharProgressionDtos.cs`(CODEGEN-GAP)·`PortalDtos.cs` 삭제, 구독자 6파일 — `CharacterSheet`(`_full`
      제자리 갱신을 PascalCase로, `Stats?.Pow?.Atk?.Value`, 속성 행 `CharStatPair[]`)·`VitalsHud`·`SkillPanel`·`GoldStore`·`SkillCaster`·`PortalView`
      (`PortalMarker`), `EnterWorldBootstrap` placeholder 구독은 주석만. EditMode `JsonStatePayloadTests` 재도입(같은 GUID — 실물 서버 함수·포탈 시드로
      찍은 키 순서의 CHAR_STATS_FULL(중첩 6단·x·y float)·CHAR_LEVEL_UP(12개 순서 = StatCode·StatGroup 멤버, valueAfter)·PORTAL_LIST(빈 배열 ≠ null) JSON → 생성
      타입, 부분 본문 키 부재 → 기본값·null, enum 값 이름 → 멤버 전수). 시험: `schema.test`(freeform 0·JSON 4, B5_JSON_STATE = 세 패킷 — a~b 일반 최악 본문
      단정이 다시 대상을 얻는다, B5①a 필드·중첩 struct·enum·flip 시 최악 본문 240·50,246·2,630 B·여유 15,289 B·binaryStructs — PortalMarker가 맨 앞, Char*가
      SkillInfo 앞), `typedSend`(PORTAL_LIST zoneId 누락·portalId 문자열·stats 그룹 누락·CharStatPair xp 누락·StatGroup·StatCode 밖 값·valueAfter 누락 거부,
      "freeform 원시값 거부" 단정은 주석만), `wireSemantic.test`(freeform 분기 대표를 PORTAL_LIST에서 미지 id로 — 같은 분기, PORTAL_LIST·CHAR_LEVEL_UP은 이제
      정규화·형태 검사 대상), `wireLimitsContract`(name = 표시 이름·DevAuto 66 B·한글 12자 그대로·손상 이름 자르기, CHAR_LIST 이름 자르기, statDeltas max =
      StatCode 값 수 × (MAX_LEVEL − 1)·적재 최악 행 = 정확히 3,588, 레벨업 순회 순서 = enum = struct 필드 순서, 포탈 rect 중심 f32), `portalRepo.test`(실물 시드,
      이름 64/65 B·4 B 문자·서로게이트·빈 이름, id·존 id i32, rect 범위·±1e308·min > max, 존당 32/33 throw, 로더 최대 목록의 송신 페이로드 형태 위반 0·flip
      인코드 = 2,630 B). 서버 단위 시험의 부분 CharacterRow 픽스처(`skillLearnHandlers`·`skillBookUse` — `as unknown as`, 이름 없음)는 CHAR_STATS_FULL 재송신이
      전 필드를 읽게 되어(이름 clamp, ①b 인코드) 완전한 행으로 바꿨다. JSON 경로 대표 시험(CHAR_STATS_FULL)은 그대로 — 주석만 "자율 형식" → "JSON 상태".
      골든: 메인 237/237·결정론·미니 39/39 leaf 불변 — 0x0301·0x0302·0x0019의 semantic도 바뀌지 않았다(정수·문자열·enum 값 이름·f32로 정확한 좌표뿐이라
      바이너리 왕복 정규화 값 = 종전 정렬 키 JSON — 모든 프레임 shapeViolations 0). ①a JSON 상태의 큰 본문: CHAR_STATS_FULL·PORTAL_LIST는 상한까지 채워도
      JSON 1,334·14,881 B(u16 안), CHAR_LEVEL_UP만 레벨 기반이라 한 번에 76레벨(1 → 77) 오르면 65,712 B로 넘는다(1 → 300 = 260,308 B) — 기존 결함 그대로,
      ①b flip(최악 50,246 B)이 닫고 GM 1 → 300 회귀 시험을 둔다(아래 인계).
    - **B5①b(완료 — 캐릭터·포탈 S2C binary flip + CHAR_LIST 형태 변경, protoVersion 11·IPC_VERSION 13 — S2C 전부 바이너리)**: CHAR_STATS_FULL·
      CHAR_LEVEL_UP·PORTAL_LIST에 `"encoding": "binary"`(①a 스키마 그대로 — lock은 세 패킷 encoding·wireHash만, CHAR_LEVEL_UP의 looseHash 제거, layoutHash
      불변)이고, CHAR_LIST는 `chars: string`(CharSummary[]를 담은 JSON — nested vec 코드젠 부재 시절의 임시 형태) → `array<CharSummary>(max 16)` + binary로
      형태를 바꿨다(lock wireHash·layoutHash 모두 변경). `CharSummary { charId:i32, name:string(max 66 B), level:i32, zoneId:i32 }` — 종전 x·y는 뺐다(클라·
      loadgen·시험 무소비). **S2C 바이너리 42개·JSON 패킷 0개**(`defaultEncoding`·JSON 분기는 B6까지 남는다 — 아래 B6 인계). 최악 본문 CHAR_LIST 1,282·
      CHAR_STATS_FULL 240·CHAR_LEVEL_UP 50,246·PORTAL_LIST 2,630 B — **한 번에 약 76레벨 이상 오르면 CHAR_LEVEL_UP JSON이 u16을 넘어 그 패킷만 drop되던
      기존 결함이 닫혔다**(회귀 `tests/integration/e2e-gm.test.ts` ②b: 온라인 GM 1 → 300 → statDeltas 3,588개·본문 50,246 B 수신, 전역 드롭 감시 0). 서버:
      `charListHandler`가 생성 `CharSummary[]`를 그대로 싣고(JSON.stringify 제거, 이름은 `CHAR_SUMMARY_NAME_MAX` 자르기 — ①a와 같은 66 B),
      `characterRepo.listByAccount(accountId, limit?)`에 선택 limit(SQL `LIMIT ?` 한 문장 — 생략은 -1 = SQLite 상한 없음, id 순 유지) — CHAR_LIST는 상한 + 1행을 읽어 넘치면 앞 16명 + warn(생성 상한
      `CHARS_PER_ACCOUNT_MAX` 4는 생성 tx 안에서만 강제라 DevAuto·레거시 계정은 넘을 수 있다). characters.id는 DB 적재 경계 밖이라(끌어오면 다른 캐릭터
      id) i32 양수가 아닌 id의 행(외부 쓰기·`sqlite_sequence` 조작)은 싣지 않고 warn한다 — 실으면 인코드 실패로 같은 계정의 정상 캐릭터까지 목록 전체가
      drop되고 클라는 캐릭터 선택에서 멈춘다(①a JSON 상태에서는 클라 Newtonsoft Int32 overflow로 목록 전체가 파싱 실패 + 안내 문구 — 리뷰 반영). 설계안은 listByAccount 자체에 LIMIT을 두라 했지만 같은 함수를
      쓰는 GM 계정 검색(`gmQuery.searchAccounts`)이 17번째 캐릭터부터 못 보게 되므로 선택 인자로 바꿨다. 송신부 주석(`charStatsHelper`·`charProgressionHelper`·
      `portalListHelper`·`statAccumulation`·`packetWriter`·`frameOutbox`·`encodeGuard`)은 "키 순서는 와이어와 무관"·"JSON 분기는 스키마 밖 id에만"으로.
      loadgen: 봇 핸드셰이크의 `JSON.parse(chars)` 제거(`CharListPayload`), `PortalInfo` = 생성 `PortalMarker` 별칭. 시험 헬퍼 `charsOf()` → `p.chars`(시험
      18곳 + 미니 골든은 손대지 않았다 — ①a 선이전의 목적). 클라: `CharacterSelectController`·`Diagnostics/AutoLoginTester`의 private `CharSummary`·JsonConvert
      역직렬화·실패 분기를 지우고 생성 `CharSummary[]`(`p.Chars`)를 직접 쓴다(깨진 본문은 PacketBus 디코드가 사유 로그 + drop — 다른 바이너리 패킷과 같다,
      종전 JSON 파싱 실패의 "다시 연결" 안내 문구는 없어졌다). 클라 송신부·구독자 로직은 그대로(`CharacterSheet`·`EnterWorldBootstrap`·`PortalView` 주석만).
      교차 언어 골든 손 사례 43개(`goldenCrafted.ts` B5_1_REAL — CHAR_LIST 11·CHAR_STATS_FULL 10·CHAR_LEVEL_UP 10·PORTAL_LIST 12, 유효 16·오류 27 — protocol.md
      §2.10 ①b 문단). 설계안의 "statDeltas 3,588/3,589"는 개수 경계를 머리만으로 고정했다(3,588 = 원소 앞 Truncated·3,589 = OverMax) — 3,588개 전체 유효
      본문(50 KB hex + 디코드 값 ≈ 300 KB)은 ④b가 줄인 골든을 다시 키우므로 넣지 않고, 전체 본문 왕복은 `wireLimitsContract`(실제 applyExpGain 1 → 300 =
      MAX_BODY_BYTES)·EditMode `UiV3IntegrationTests`(C# 인코드 길이 50,246 B·디코드 3,588개)·e2e-gm ②b가 본다. ①a JSON 본문 `{"chars":"[]"}`는 개수 자리
      8,827 OverMax(구 서버 본문을 새 클라가 오독하지 않는다). 무작위 CHAR_LIST 사례 2개(빈 배열·그 Trailing)는 손 사례와 hex가 같아 중복 제거됐다. 골든 파일
      1,342 → 1,520 KB(무작위 사례 1,490 KB — CHAR_STATS_FULL 고정 240 B의 잘림은 ④b `truncLengths` 규칙으로 192건). 시험(JSON 경로 대표 처리 — 설계 B5
      §4.4 끝 목록): `schema.test`(전 패킷 binary·JSON 0·binary S2C 42·binaryStructs = 선언 struct 전부 — CharSummary·PortalMarker가 SNAPSHOT_DELTA 앞, B5
      a~b 일반 단정 → "전 id 생성 MAX_BODY_BYTES = 스키마 최악 본문", ①a 시험 → ①b flip + CHAR_LIST 형태), `wireCodec.test`(binary 집합 = 전 패킷,
      "JSON id 거부" → 스키마 밖 id 0x7ffe 거부, writePacket JSON 줄 삭제 + CHAR_LIST·CHAR_LEVEL_UP 정확 바이트), `encodeGuard.test`(u16 초과 JSON 드롭 →
      CHAR_LIST 17명 OverMax 드롭, JSON 순환 참조 사례 삭제 — 비-인코드 예외는 getter로, FrameBodyTooLargeError 판정 시험은 남김), `frameOutbox`·`sendCoalescing`·
      `wireFrame`(CHAR_STATS_FULL 자유 JSON 페이로드 → CHAR_LIST·CHAR_LEVEL_UP 최악 binary, JSON 고유 단정 삭제), loadgen `protocol.test`(JSON 폴백 사례 →
      CHAR_LIST·PORTAL_LIST binary + ①a JSON 본문 거부)·`botConnection.test`·`shardRunner.test`(가짜 서버 CHAR_LIST·CHAR_STATS_FULL 전 필드 binary),
      `typedSend`(CHAR_LIST 정상·JSON 문자열·x·y 초과 속성·name 누락 거부), `wireLimitsContract`(CharSummary.name = CHAR_STATS_FULL.name = 표시 이름·원소 4필드,
      chars max ≥ CHARS_PER_ACCOUNT_MAX·넘침 앞 16명 + limit 17·i32 양수 밖 charId 행 제외, ①b 최대 본문 = 스키마 최악 본문 1,282·240·50,246·2,630 B·상한 밖 인코드 거부), `identity.test`
      PROTO_VERSION 11·실 SQLite listByAccount limit(17행 계정 — limit 17·16·생략·18의 id 순서), `ipcHandshake` [13, 11], e2e-gm ②b(신규). EditMode: `JsonStatePayloadTests`(+ .meta) 파일 삭제(B5 사례 소진),
      `PacketWriterTests.Json_S2CIdStaysCamelCaseJson` → `AllPacketIdsAreBinary`(PacketIds 전 상수 IsBinaryPacket, 스키마 밖 id false) + `Binary_CharList_B5_1b_CharSummaryArray`,
      `EntryUiIntegrationTests`·`UiV3IntegrationTests`·Editor `NoahUiV3Validation`의 JSON 게시 → 전 필드 생성 페이로드 `PublishWire`(JSON 게시 헬퍼 삭제),
      `UiV3IntegrationTests` 신규 3개(패킷마다 1개 — ①a JsonState 상수 계약을 바이너리 경로에서 잇는다): `CharStatsFull_Binary_DevAutoNameAndNestedStatsReachSheet`
      (이름 66 B·속성 행 12개 = StatCode 순서), `CharLevelUp_Binary_MaxStatDeltasReachSheet`(1 → 300 레벨업 3,588개 = 50,246 B → 시트 레벨 1 → 300),
      `PortalList_Binary_MarkersReachPortalView`(PortalView 마커·픽). 골든: 메인은 0x0302·0x0019를
      받은 두 세션의 sha256·bytes·frameDigest만(6/237 leaf — 레벨업 세션 35,586 → 34,854 B, 포탈 세션 5,717 → 5,663 B), 미니는 0x0301·0x0302·0x0019의 body +
      0x0011의 semantic·body(5/39 leaf — 덤프 57줄의 라벨·id 동일, 정규화 JSON은 0x0011 5줄만 `chars` 문자열 → 배열·x·y 제거, 본문은 flip id 18줄만 — 신규
      시트 550 → 183 B·DevAuto 시트 607 → 240 B·10레벨 상승 8,632 → 1,694 B·마을 포탈 162 → 70 B·한글 2명 목록 204 → 54 B·빈 목록 14 → 2 B), 결정론 불변.
      게이트: server 2537 pass/5 skip, regression 12, integration 103/1 skip(e2e-gm ②b +1), cluster 14/3 skip. Unity EditMode 47/47(`error CS` 0)·PlayMode FollowupLiveTests 2/2(라이브 서버 error 로그 0). Unity 클라를 다시 빌드하지 않은
      구 클라(protoVersion 10)는 HELLO 버전 불일치 바이너리 KICK 1로 거절된다.
  - **B6(완료 — JSON 본문 경로 제거, 와이어 불변: protoVersion 11·IPC_VERSION 13 그대로)**: B5①b로 JSON 패킷이 0개가 된 뒤 스키마 밖 id에만 닿던
    JSON 경로를 지웠다(아래 "B6에 넘겼던 것" 처리).
    - 코드젠: `packets.json`의 `defaultEncoding`·`_defaultEncoding_doc`과 패킷 `"encoding": "binary"` 70개 삭제(`_version_doc`·`_enums_doc`·EntityType `_doc` 현행화).
      `schema.ts`는 `defaultEncoding`·패킷 `encoding`·`freeform` 키를 값과 무관하게(`"binary"`도) 폐지 사유와 함께 거부한다(`packets.X.encoding: 폐지(B6) — …` —
      "모르는 키"가 아니라). AST에서 `encoding`·`freeform`·`defaultEncoding`·`Encoding` 타입을 지웠다. 근거가 사라진 규칙: freeform 규칙(fields 비어야·binary 불가)
      삭제, JSON 전용 struct 면제(바이너리 패킷이 닿는 struct만 max 검사) → **어느 패킷도 쓰지 않는 struct 금지**로 다시 적음(모든 struct가 바이너리 규칙을
      받는다 — 실물 26개는 전부 패킷이 쓴다), enum 값 이름 대소문자 무시 유일(근거 = 클라 Newtonsoft 대소문자 무시 역직렬화) 삭제 — 바이너리에는 이름이
      실리지 않고 C# PascalCase 멤버도 서로 다르다. `binaryStructs` → `packetStructs`·units `binaryPackets` → `layoutPackets`(첫 도달 순서 그대로 — 생성 코드
      순서 불변). 생성기: TS `isBinaryPacket`·`BINARY_PACKET_IDS`, C# `IsBinaryPacket` 삭제(전 id true — 스키마 안 id 판정은 TS `PACKET_DIRECTION`, C#은
      `Decode`의 null + `WireError.None`), 디스패치 default 문구 "not a binary packet" → "unknown packet"(C# `NotBinary` → `UnknownPacket`), freeform 문서
      주석·`MAX_BODY_BYTES`·layout 상수의 binary 필터 삭제(산출 동일), `PayloadOf`의 `& object`는 남기고 사유를 "필드 없는 패킷(빈 interface — 원시값까지
      받는다)"으로 다시 적음(C2S 빈 패킷 4개 — `typedSend`가 `bot.send(CHAR_LIST_REQ, 42)` 거부를 고정). refCodec freeform 분기·golden 패킷 표의 `encoding` 열·
      JSON 패킷 건너뛰기 삭제. 합성 fixture에서 `defaultEncoding`·`encoding`·`JSON_ONE`·`FREE`·`JsonOnly` 삭제 — codegen 시험은 그 선언이 거부되는지로(schema.test
      "B6 폐지 키" 7건·종전 JSON 패킷 선언 거부·미사용 struct 거부, lock.test는 JSON 전이 사례 → 레이아웃 변경 전부 bump·B6 이전 형식 읽기·실물 HELLO 지문
      `8511dfdd7c2ff1fd` 고정, emitFixture·wireGolden은 "디스패치가 전 id를 덮고 isBinaryPacket류는 산출되지 않는다").
    - 서버: `packetWriter.encodePacket`·`frameOutbox.appendPayload`의 JSON 분기·`isBinaryPacket` 디스패치 삭제(스키마 밖 id = `WireEncodeError` unknown packet —
      outbox는 커밋 전에 던져 길이·프레임 수 불변). **`FrameBodyTooLargeError`는 남겼다** — B5①b까지 유일한 송신 출처는 JSON 본문 경로였지만, 이 오류는
      `wireFrame.encodeFrame`·`writeFrameHeader`의 헤더 u16 용량 검사(원시 프레임 경로 — 시험·도구의 `encodeFrame`, SNAPSHOT_DELTA 빠른 경로)다. 생성
      인코더 경로에서는 스키마 최악 본문 ≤ 65535라 닿지 않지만, 코드젠 결함이 그 보장을 깨도 `encodeGuard`가 존 tick을 멈추지 않고 그 패킷만 버리게 하는
      방어 겹이다(비용 0 — 정상 경로 분기 없음). `encodeGuard.test` 판정은 원시 경로(`encodeFrame` u16 초과) + 스키마 밖 id `WireEncodeError`. `assertFrameBody`는
      wireFrame 내부 함수로(frameOutbox의 선검사는 큰 JSON 본문의 할당을 막던 것이다). 구 JSON KICK 본문(`LEGACY_KICK_JSON_BODY`)은 모듈 로드 때 `JSON.stringify`
      하던 것을 바이트 리터럴로 바꿨다(같은 바이트 — `wireFrame.test`가 문자열로 고정, 두 구 클라 거절 프레임은 그대로 남는다). 주석 정리(`frameIngest`·
      `net/validate`·`snapshotBuilder`·`encodeGuard`).
    - 시험·도구: `tests/helpers/wire.ts` `encodeBody`·`decodeBody`의 JSON 폴백 삭제(스키마 밖 id = 명시 오류), `tests/regression/helpers/wireSemantic.ts`의
      freeform·미지 id 원값 분기 삭제(스키마 밖 id = throw — 메인·미니 골든은 스키마 id만 실어 불변), loadgen `decodeS2C` JSON 폴백·`botConnection` "bad JSON"
      사유 삭제(스키마 밖 id = "unknown packet"), `fakeGateway` 주석. JSON 전용 시험 사례: `wireCodec`·`frameIngest`·`emitFixture`·`wireGolden`의 isBinaryPacket 단정을
      "전 id 코덱 + 스키마 밖 id 거부"로(TS 디코드 디스패치의 default는 reader를 건드리지 않아 직전 사유가 남는다 — id마다 `bodyReader.reset` 후 판정,
      스키마 밖 id 대조군·`bodySize` 디스패치도 함께 확인), 데이터 로더 시험 4곳의 `encoding` 단정·`portalRepo.test`의 `encoding = "binary"` 주입(이제 스키마 위반) 삭제.
    - **CI 가드**(`tests/server/net/frameBodyJsonGuard.test.ts`): `server/src/{net,network,cluster,gateway,sim,world}`·`tools/loadgen`의 `JSON.parse`·`JSON.stringify`
      (Bun 트랜스파일로 주석을 뺀 코드)를 허용 목록(파일 → 개수·사유 17개 — 데이터 로더 9·items 정규화 해시·게이트웨이 정책 오류 메시지·
      QUEST_NPC_MARKERS diff 캐시 키·loadgen 결과 파일·샤드 stdout 줄 프로토콜·데이터 파일)과 정확히 대조한다(새 파일·개수 증가·낡은 항목 모두 실패, 와이어
      핵심 파일 wireFrame·packetWriter·frameOutbox·frameIngest·loadgen protocol은 0, 주석 언급은 세지 않는 대조군 포함). 클라는 `Assets/Scripts`의 Newtonsoft
      (`JsonConvert`·`JObject`·`JToken`·`JsonSerializer`)가 `World/ItemDataStore.cs`(items.dat)에만, `Net/`·`Network/`에는 JSON API(`JsonUtility`·System.Text.Json
      포함)가 없음을 TS로 C# 소스를 읽어 확인한다. CLAUDE.md·AGENTS.md "금지 사항"에 연결.
    - 클라: `PacketBus`의 JSON 분기·Newtonsoft 삭제(디코드 실패 사유 None = "unknown packet (not in schema)"), `PacketWriter`의 JSON 분기·Newtonsoft 삭제,
      `SkillPanel`의 "레거시 서버(maxLevel 미송신)" 분기와 `MaxLevel > 0` 조건 3곳 삭제(로더가 ≥ 1 강제). 선택 항목은 응답 타임아웃으로 했다:
      `CharacterSelectController`가 CHAR_LIST를 10초 안에 못 받으면(응답 누락, 또는 코드젠 불일치로 PacketBus가 본문을 버림) "캐릭터 목록을 받지 못했습니다"
      안내(늦게 온 목록은 그대로 처리). 구독자 디코드 실패 훅은 만들지 않았다 — 구독자별 디코드라 훅이 구독자 수만큼 울리고(Fanout 1회 디코드는 아래 별건),
      타이머가 응답 누락까지 덮는다. EditMode: `PacketWriterTests.AllPacketIdsAreBinary` → PacketIds 전 상수에 코덱이 있고(빈 본문 = 값 또는 사유) 스키마 밖 id는
      null + None·송신 거부, `WireCodecGoldenTests.IsBinaryPacket_MatchesSchema` → `Decode_CoversEverySchemaPacket`(골든 표에 `encoding` 열 없음), `Encode_Rejects…`의
      JSON_ONE 사례 → 스키마 밖 id 0x16, `EntryUiIntegrationTests.CharListTimeoutGuidesUnlessListArrived` 신규(타임아웃 안내·늦은 목록·디코드 실패 본문 drop).
    - 골든: 메인 `wireCharacterization`·미니 `s2cBodyCharacterization`·결정론 스냅샷 diff 0. 교차 언어 골든: `cases`(실물 4,777·픽스처 521)·`utf8`·`errors`
      동일, `packets` 표만 행마다 `encoding` 키 삭제 + 픽스처 JSON_ONE·FREE 행 삭제(JSON 패킷이라 사례가 없었다). C# 픽스처 산출물은 그 셋(JsonOnly·JSON_ONE·
      FREE)의 타입·상수만 빠졌고, 실물 C# 타입 산출물은 schema-hash 줄만 바뀌었다.
    - 게이트: server 2537 pass/5 skip(234파일 — 가드 +4·lock.test JSON 전이 사례 −10·schema.test 폐지 키 +5·loadgen +1, 합 불변), regression 12, integration 103/1 skip,
      cluster 14/3 skip, `gen --check`(+ `--base-lock` HEAD·①a lock 모두 통과). Unity EditMode 48/48(`error CS` 0 — CharListTimeout +1)·PlayMode FollowupLiveTests 2/2
      (라이브 서버 error 로그 0).
  - **B5에 넘겼던 것**(B4 시점 — 와이어 항목은 B5①b까지 모두 처리, 끝의 별건 둘(클라 구독자별 디코드·InputSampler tick wrap)은 B6 이후로 남는다):
    - 남은 JSON S2C 13개 = CHAR_LIST(`chars` 문자열에 담긴 JSON → `CharSummary[]`, name max = 표시 이름 66 `DISPLAY_NAME_MAX`) + 자율 형식 12개. 문자열
      max 후보: NPC_DIALOG npcName(66)·speaker·pages·label·nodeId(= NPC_ACTION.nodeId 64), SKILL_LIST·QUEST_LIST·SHOP_LIST·PORTAL_LIST 이름·설명 —
      데이터 로더(skills·quests·shops(name ≤ 80자 = 최악 240 B)·portals)가 `fitsWireString`으로 부팅 시 강제(B3b·B4와 같은 방식). (SHOP_LIST — B5②a 처리:
      name 240 B·offers 256·id i32, 위 B5②a 항목. INVENTORY_LIST·INVENTORY_UPDATE·SHOP_LIST는 B5②b에 flip — 남은 자율 형식 9개. SKILL_LIST — B5③a 처리:
      skills.json name 64 B·skills 256·range·aoeRadius ≤ 1024, 위 B5③a 항목 — freeform 7개. SKILL_LIST·UI_PREFERENCES는 B5③b에 flip — 남은 자율 형식 7개.
      NPC_DIALOG·QUEST_LIST·QUEST_ACTION_ACK·QUEST_NPC_MARKERS — B5④a 처리: npcName 66·nodeId 64·speaker 66·page 600 B·label 240 B·quest name 120 B·
      description 1500 B·목표 라벨 96 B(items.json 이름 66 B 신설), 위 B5④a 항목 — freeform 3개. 그 넷은 B5④b에 flip — 남은 자율 형식 3개.
      CHAR_STATS_FULL·CHAR_LEVEL_UP·PORTAL_LIST — B5①a 처리: 캐릭터 이름 66 B 송신 전 자르기(CHAR_LIST JSON 문자열 안 포함)·statDeltas 3,588·portals 이름 64 B·
      id i32·rect [0, 4096]·존당 32, 위 B5①a 항목 — freeform 0개. ①b 처리: 세 패킷 flip + CHAR_LIST `CharSummary[]`(max 16 — 조회 LIMIT 상한 + 1행, x·y 제거),
      위 B5①b 항목 — JSON 패킷 0개)
    - (B5-P 처리 — `identity/rowBounds.ts`, 위 B5-P 항목) CHAR_STATS_FULL·QUEST_ACTION_ACK flip 전에 DB 적재값(characters exp·sexp·slp·gold·stats)의 i32 범위를 적재 경계(characterRepo 행 → liveChar)에서
      확인할 것 — 지금은 서버 쓰기 경로가 범위를 지키고(위 B4 상류 보장) "실행 중 라이브 DB 외부 쓰기 금지" 정책에 기댄다. 깨지면 방어층이 그 패킷만 버린다.
    - (B5①b 처리 — 위 B5①b 항목) JSON 경로 확인용 시험 패킷: 서버·loadgen은 CHAR_STATS_FULL, EditMode는 CHAR_LIST — 둘 다 B5에 flip되면 남은 JSON 패킷으로 옮기고 B6에서 JSON 경로와
      함께 지운다(`frameOutbox`·`sendCoalescing`·`wireFrame`·`wireCodec`·loadgen `protocol`·`encodeGuard`(u16 초과 JSON 사례)·EditMode `PacketWriterTests`).
      ①a 뒤에도 둘 다 JSON이다(CHAR_STATS_FULL은 JSON 상태 — 대표 시험은 형태를 보지 않아 주석만 바꿨다). ①b에서 남는 JSON 패킷이 없으므로 옮길 곳이 없다 —
      설계 B5 §4.4 끝 목록대로 바이너리 패킷으로 바꾸거나 지우고, 남는 JSON 코드는 B6 인계로 적는다.
    - (B5①b로 해소 — CHAR_LEVEL_UP 50,246 B, 1 → 300 회귀) 자율 형식 JSON 본문은 u16 초과가 가능했다(인벤·상점은 B5②b flip으로 최악 322 B·3,324 B, 스킬·UI 설정은 B5③b로 27,138 B·49 B, NPC 대화·퀘스트는
      B5④b로 64,492·64,378·193·8,194 B — 남은 자율 형식은 ① 캐릭터·포탈 3개(①a에 스키마화 — CHAR_STATS_FULL·PORTAL_LIST는 상한까지 채워도 JSON 1,334·14,881 B),
      CHAR_LEVEL_UP은 한 번에 약 76레벨 이상 오르면 넘었다(1 → 77 = 65,712 B) — ①b가 닫았다) — 그때까지 방어층이 그 패킷을 버렸다(`FrameBodyTooLargeError`). 스키마화하면 array·string max가 최악 본문을 묶는다. JSON 상태로 스키마화한
      패킷도 flip 전까지는 같았다 — ③a의 SKILL_LIST는 로더가 통과시키는 카탈로그의 JSON이 u16을 넘을 수 있었고(실측 첫 drop: 이름 64 B·정수·range 최대
      182종, 이름이 제어 문자면 JSON 이스케이프(6 B)로 97종 — 실데이터 9종 ≈ 2 KB, `wireFrameBudget.test`) ③b flip(최악 27,138 B)이 바로 다음 커밋에서 묶었다
      (신뢰된 데이터 저작자만 만들 수 있는 전이 구간의 틈이라 부팅 검사는 두지 않았다). ④a~④b 사이의 NPC_DIALOG·QUEST_LIST도 같은 판단이다 — 로더가 받는
      최대 로그(퀘스트 1,024·진행 20·이름·설명 최대·i32 id)의 JSON은 95,693 B(binary 51,418 B), 최대 대화는 평문이면 JSON 62,666 B지만 장에 JSON 이스케이프
      문자가 많으면 넘친다(실데이터 ≈ 2 KB — `wireFrameBudget.test`). QUEST_ACTION_ACK·QUEST_NPC_MARKERS는 JSON 최대 본문도 u16 안(`wireLimitsContract`).
      ④b flip(최악 64,492·64,378 B)이 바로 다음 커밋에서 묶었다 — `wireFrameBudget.test`는 그때 지웠다.
    - (B3b에서 넘어온 것) 클라 PacketBus 구독자별 디코드 — `RemoteEntity`가 엔티티마다 ENTITY_META를 구독해 원격 엔티티 수만큼 디코드한다(Fanout 1회
      디코드는 페이로드 공유 계약이 필요해 보류).
    - (사전 결함 — 정책 판단) 클라 `InputSampler._tickEstimate`는 C# int 증가라 2^31에서 음수로 넘어가 서버가 INPUT_CMD를 범위 밖으로 버린다. 서버가
      보내는 tickIndex는 이제 mod 2^31이지만 한 세션이 그 경계를 지나면 같은 현상 — 클라 쪽 `& 0x7FFFFFFF` 또는 서버가 미사용 필드의 범위 검사를
      완화할 것(서버는 그 값을 쓰지 않는다).
  - **B4/B5에 넘겼던 것**(B3b에서 찾은 것 — B4가 처리한 항목은 "B4 처리", 남은 것은 위 B5 목록에 옮겼다):
    - (B4 처리 — GOLD_UPDATE는 CHAR_STATS_FULL·CHAR_LIST로 이전) 아직 JSON인 S2C를 쓰는 시험 케이스: JSON 경로가 남아 있는 동안의 혼합 확인에 CHAR_STATS_FULL(자율 형식 — B5)·GOLD_UPDATE(고정형 — B4)를 쓴다
      (`frameOutbox`·`sendCoalescing`·`wireFrame`·`wireCodec`·loadgen `protocol` 시험, EditMode `PacketWriterTests.Json_S2CIdStaysCamelCaseJson`).
      그 패킷을 flip하면 남은 JSON 패킷으로 옮기고, B6에서 JSON 경로와 함께 지운다.
    - (B4 처리 — CHAR_CREATE_RESULT·AUTH_RESULT·ZONE_INFO·ZONE_CHANGE, 나머지는 B5) S2C 이름·문자열 max: CHAR_CREATE_RESULT.name(요청 이름 에코 — CHAR_CREATE_REQ.name 64 이상), CharSummary.name(B5 — 표시 이름 66, `DISPLAY_NAME_MAX`),
      AUTH_RESULT.sessionToken(64 hex), ZONE_INFO·ZONE_CHANGE.name(존 이름 — 로더 강제), NPC_DIALOG npcName(66)·speaker·pages·label, SKILL_LIST
      이름(skills.json 로더 강제 — 아이템 이름은 ITEM_CATALOG가 `9464a52`에서 폐지돼 와이어에 직접 실리지 않고, 퀘스트 목표 문구(QUEST_LIST)에 섞여 나간다 —
      B5④a에 items.json 이름 상한), QUEST_LIST 이름·설명 — 몬스터·NPC 이름처럼 데이터 로더가 `fitsWireString`으로 부팅 시 강제한다.
    - 클라 PacketBus 구독자별 디코드: `RemoteEntity`가 엔티티마다 ENTITY_META를 구독해 패킷 1개를 원격 엔티티 수만큼 디코드한다(종전 JSON 역직렬화
      N회보다 싸다 — 본문 16 B). Fanout 1회 디코드는 구독자 간 페이로드 공유(변경 금지 계약)가 필요해 보류.
    - 성능 측정(B3b, 측정 커밋에서 기록): WSL 같은 세션 전후(`53280f9` ↔ `4575747`) — 월드 IPC 바이트 −48%, 클라 송신 −8%. eden 빈도는
      이번에도 줄지 않아 프로토콜 JSON은 eden 빈도의 주원인이 아니다 — 남은 할당원은 할당 프로파일로 찾는다. 시간·CPU 지표와 입장 램프
      KICK 9(A 레벨 런 7/14 → B 0/14)는 결론 불가: 측정 뒤 검증에서 **A 서버가 핀 고정되지 않은 배치 비대칭**(pinmon이 `~/mmorpg` cwd만
      서버로 분류 — B2b 측정도 같다)과 호스트 잡음이 드러났다. B2b·B3b에서 반복된 "B 쪽 monolith flush +2 ms·부하 생성기 CPU +25~28%"의
      1순위 원인도 이 비대칭이다. pinmon은 고쳤고, B6 최종 측정에서 같은 커밋·같은 의존성을 대칭 배치로 돌리면 차이가 없고 A 서버만 부하 생성기
      CPU에 두면 이상이 재현됐다 — 비대칭이 원인이다(`perf-baseline.md` "이진 전환 B6 — 최종" ①·④).
    - (B4 처리 — network/encodeGuard.ts) (선택) 존 송신 단위 방어층: 존 tick 안 송신의 WireEncodeError를 잡아 그 패킷만 버리고 메트릭·스쿼시 로그를 남기면 상류 보장이 깨져도 그 존 tick
      전체가 멈추지 않는다(리뷰 제안 — B3b는 상류 보장만). JSON 패킷이 남은 B4~B5에서 같이 정할 것(RangeError — 0xFFFF 초과 JSON 본문 포함).
  - **B3b에 넘겼던 것**(B3a에서 찾은 것 — B3b에서 모두 처리):
    - `skills.json` 정수 필드(id·cooldownMs·impactDelayMs 등)는 로더에 i32 상한이 없다 — SKILL_EFFECT·SKILL_CAST_ACK flip 전에 zod `.max(2^31-1)`.
    - loadgen 봇은 S2C JSON을 패킷마다 `JSON.parse`한다(`tools/loadgen/protocol.ts`) — flip 패킷은 생성 `decodeBody`로.
    - ENTITY_SPAWN.name `max`(아래 "S2C 이름 필드 max"에 포함 — NPC 이름도 대상).
    - (선택) 서버에 같은 이름 `SkillEffectKind`가 둘이다 — 정의용(`skillDataLoader`, damage|heal)과 와이어용(생성, 4값). 와이어 쪽은
      `SkillEffectWireKind` 별칭으로만 쓰지만 자동 import 혼동을 없애려면 정의 쪽을 `SkillDefEffectKind`로 바꾼다.
    - `JsonStatePayloadTests`(EditMode) 정리 — flip 뒤엔 교차 언어 골든이 같은 계약을 덮는다.
  - **B3에 넘겼던 것**(B3b에서 처리 — 위 B3b 항목):
    - KICK·HELLO_ACK flip: B1~B2b 클라는 **JSON** KICK만 읽는다. ProtoMismatch KICK 1(버전 불일치·HELLO 디코드 실패)을 B3b 이후에도 구 클라가
      읽게 하려면 그 경로만 구 형식(JSON) KICK 고정 프레임을 쓰는 방식(B1 `LEGACY_KICK_FRAME`과 같은 발상)을 정할 것 — frozen은 레이아웃만 막는다.
    - S2C 이름 필드 max: DevAuto 계정은 캐릭터명 `<username>-1`을 `validateCharName` 없이 만든다(`authHandler.ensureDevAccount`) — ENTITY_META·
      CHAT_BCAST·CHAR_CREATE_RESULT(요청 이름 에코 — CHAR_CREATE_REQ.name max 64 이상)·CharSummary(B5)의 이름 max는 username max(64) + 2 이상이거나
      DevAuto 이름 생성을 제한해야 한다. NPC_DIALOG(B5)의 nodeId max는 NPC_ACTION.nodeId(64)와 같아야 한다(npcs.json 로더는 B2b부터 같은 `NODE_ID_RE`로
      64자 상한을 강제한다).
    - 성능 측정(계획 B2b, 측정 커밋에서 기록): WSL 같은 세션 전후(`1281a45` ↔ `ee0821f`) — 수신 바이트 −54%, 서버 CPU −9~10%(배치 비대칭으로 미확정 — 위 B3b 항목), tick p99 불변,
      eden 정지는 짧아졌지만 횟수는 줄지 않음 → 입력 경로 할당 가설 기각(`perf-baseline.md` "이진 전환 B2b"). monolith flush +1.9 ms는 부하 생성기
      쪽 상호작용 추정(미확인) — B3b 측정에서 반복됐고, 그 뒤 검증에서 A 서버 미고정(배치 비대칭)이 1순위 원인으로 드러났다(위 B3b 항목).
  - **HELLO_ACK 동결**: B2a(시간 필드 f64) 이후 B3b flip 커밋에서 `frozen`을 붙였다. (HELLO는 B2b에, KICK은 B3b에 frozen 그대로 binary로 flip했다.)
  - **B6에 넘겼던 것**(위 B6 항목에서 처리 — 와이어 항목·JSON 경로는 모두 지웠고, 별건·형태 변경 후보는 끝의 "B6 이후로 남는 것"에 옮겼다):
    - gen이 `json`·`freeform`을 거부하게 하면 lock의 JSON 지문 규칙은 쓸모가 없어진다(B6 처리 — §2.3 B6 형식).
    - (B5②b에서 넘김) bodyOf 패킷의 C# 인코드는 하위 class를 요구한다 — `WireCodec.Encode(INVENTORY_UPDATE, …)`는 `InventoryUpdatePayload`만 받는다
      (`WireCheck.Payload<T>` — 기반 `InventoryListPayload`를 넘기면 WireEncodeException). 수신은 기반 타입 구독으로 충분하지만 시험·도구가 UPDATE를
      게시할 때는 하위 class로 만든다(`UiV3IntegrationTests.InventoryOf<T>`). 클라가 bodyOf S2C를 보낼 일은 없어 런타임 영향은 없다.
    - (B5③a에서 넘김) 클라 `SkillPanel.ApplyStates`의 "레거시 서버(maxLevel 미송신)" 분기(버튼 숨김)는 스키마상 maxLevel이 항상 실리고 로더가 ≥ 1을
      강제하므로 죽은 코드다 — JSON 경로와 함께 정리. `SKILL_LIST.learned`(= level > 0 중복)는 형태 변경 후보(별도 bump). 와이어 무관 별건:
      `identity/uiPreferencesRepo.load`는 손상 행(JSON 파싱·zod 실패)이면 예외를 던진다 — 입장 마지막 단계(`enterWorldHandler`의 `sendUiPreferences`)에서
      핸들러 밖으로 나가 UI_PREFERENCES가 나가지 않는다(송신 방어층은 인코드 예외만 잡는다) — safeParse
      실패 시 기본값 + warn이 후보(설계안 선택 항목, ③a에서는 하지 않았다).
    - (B5④b 리뷰 반영으로 처리 — 위 B5④b 항목) 교차 언어 골든 크기: 작은 바탕(SMALL_BODY 96 B 이하)이 없어 가장 짧은 본문으로 폴백한 패킷의 전 길이
      잘림(O(n²))은 `golden.ts truncLengths`가 바탕 > 192 B일 때 앞·뒤 96 B로 묶는다 — 192 B 이하 바탕의 사례는 그대로라 다른 패킷은 흔들리지 않았다.
      ①b의 CHAR_STATS_FULL(고정 240 B)도 이 규칙으로 잘림 192건이다.
    - (B5①a에서 넘김) 실물 freeform 패킷이 0개다 — `schema.ts`의 freeform 규칙(fields 비어야·binary 불가), lock의 `"freeform"` 지문·`isSchematization`의
      freeform 분기, `emitTsTypes`의 freeform 주석·`& object` 가드 사유, `tests/regression/helpers/wireSemantic.ts`의 freeform 분기(미지 id 분기와 같다)는 합성
      fixture(`FREE`)·미지 id 시험에만 남는다 — B6에서 JSON 경로와 함께 지운다(새 S2C를 freeform으로 추가하지 말 것 — gen은 아직 막지 않는다).
    - (B5④a에서 넘김, 와이어 무관 별건) `questListHelper.sendQuestMarkers`의 diff 캐시는 `JSON.stringify(markers)` 문자열 비교라 tick 경로(진행 증가·인벤
      변화)에서 돈다 — 숫자 배열 비교로 바꾸는 성능 정리. 캐시를 송신 전에 갱신하므로 송신이 버려지면 마커가 멈춘다(상한이 보장되면 일어나지 않는다).
    - (B5①b에서 넘김 — 설계 B5 §4.5) **S2C 전부 바이너리라 남은 JSON 경로는 스키마 밖 id에만 닿는다** — B6이 지운다:
      codegen `defaultEncoding`을 binary로 바꾸거나 패킷별 encoding을 없애고 gen이 `json`·`freeform`을 거부하게 한다(`schema.ts` freeform·JSON 전용 struct
      규칙·enum 값 이름 대소문자 유일 규칙의 JSON 근거), lock의 JSON 지문·looseHash·`isSchematization`(위 B6 항목); 서버 `network/packetWriter.ts`
      `encodePacket`·`frameOutbox.appendPayload`의 JSON 분기와 `isBinaryPacket` 디스패치, `encodeGuard`의 `FrameBodyTooLargeError`(JSON 전용 출처 —
      `wireFrame.encodeFrame` 원시 본문 방어로 남길지 결정, `encodeGuard.test` 판정 시험), `tests/regression/helpers/wireSemantic.ts`의 freeform·canonicalJson
      분기, `tests/helpers/wire.ts` `encodeBody`·`decodeBody` JSON 폴백, loadgen `tools/loadgen/protocol.ts` `decodeS2C` JSON 폴백·`botConnection`의 "bad JSON"
      사유; 클라 `Net/PacketBus.cs` JSON 분기·`WireCodec.IsBinaryPacket`(전 id true)·`Network/PacketWriter.cs` JSON 분기 — Newtonsoft는 items.dat
      (`ItemCatalogFile`)용으로만 남는다; 문서 protocol.md §1·§2의 "JSON" 서술·§6 freeform 속성, CLAUDE.md·AGENTS.md 원칙 4, 이 ADR의 B6 절. 구 JSON KICK
      고정 프레임(`LEGACY_JSON_KICK_FRAME` — protoVersion 3~5 클라 안내)은 와이어 거절 경로라 JSON 본문 패킷 규칙과 별개다(남긴다). B6 최종 성능 측정은
      같은 커밋을 두 체크아웃에서 돌린다(위 B3b 성능 항목 — A 서버를 부하 생성기 CPU에 둔 배치 비대칭) — 완료, 아래 "B6 이후로 남는 것".
    - (B5①b에서 넘김) B5 대상 패킷의 형태 변경 후보(각각 별도 bump·semantic 변경 커밋 — 설계 B5 §7): CHAR_STATS_FULL의 클라 미사용 `charId·race·graph·
      zoneId·x·y`(x·y·zoneId는 입장 시 DB 원값이고 이후 stale), CHAR_LEVEL_UP.statDeltas(와이어 소비자 없음 — 집계 ≤ 12개 또는 제거), QUEST_ACTION_ACK
      op/errCode·QUEST_NPC_MARKERS.marker의 u8 enum화, SKILL_LIST.learned(= level > 0 중복), QUEST_LIST.completed 증가 대비, NPC_DIALOG 평탄화(노드 > 12가
      필요해질 때). 와이어 무관 별건(설계 B5 §7): 재송신 CHAR_STATS_FULL의 hp·mp가 liveChar 값이라 HUD가 일시적으로 되돌아갈 수 있다,
      skill id 0 허용(퀵슬롯 빈칸 0과 겹침)(설계 §7의 NPC_ACTION·QUEST_ABANDON 핸들러 id 상한 차이는 ④a에 i32로 맞춰 해소 — 위 B5④a 항목). CHAR_LIST가
      오지 않으면 캐릭터 선택 화면이 "불러오고 있습니다"에 머문다(①b가 JSON 파싱 실패 안내를 지웠고 응답 타임아웃이 없다 — 도달 경로였던 i32 밖
      characters.id는 서버가 제외하므로 남은 경로는 코드젠 불일치·응답 누락뿐): 응답 타임아웃 안내 또는 구독자가 받는 디코드 실패 훅을 B6 PacketBus 정리 때 본다.
    - (B5-0에서 넘김) S2C 본문 특성화 미니 골든의 수명: 실물 shared/data를 싣는 첫 회귀 골든이라(메인 골든은 `wireFixtures`로 콘텐츠와 분리)
      콘텐츠 편집마다 그 콘텐츠를 싣는 id가 바뀌고, 사례 단정 일부(NPC 배치·대화 노드·퀘스트 보상 → 레벨)는 스냅샷 갱신으로 풀리지 않는다 — 갱신 절차는
      시험 머리 주석·`docs/skill-vfx-playbook.md` §1·README "테스트 / CI". B6 뒤 형태 변경 후보(각각 별도 bump·semantic 변경 커밋)까지 안전망으로 쓰고,
      그 뒤 픽스처 콘텐츠로 전환(메인 골든과 같은 분리)할지 삭제할지 정한다.
  - **B6 이후로 남는 것**(이진 전환 밖 — 각각 별도 커밋):
    - **B6 최종 성능 측정 — 완료**(2026-10-13, `perf-baseline.md` "이진 전환 B6 — 최종"): ① 같은 커밋 `1eea6a6`·같은 의존성을 두 체크아웃에서 대칭
      배치로 돌리면(핀 표본 이탈 0) 차이가 런 편차 안이고, ④ A 서버만 부하 생성기 CPU에 두면 B2b·B3b의 반복 이상(B 쪽 flush +2 ms·N=2 부하
      생성기 CPU +25~28%)이 그대로 재현된다 — 원인은 배치. ② 전환 전 `895d8b6`(B1 직전) ↔ B6: 수신 −56%, 월드 IPC −45%, 클라 송신 −6%, 서버 CPU monolith −8%·월드 −5~7%, 스냅샷 단계 −9~15%,
      tick 평균 monolith −2%·N=2 −8~12%, tick p99는 런 편차 안(N=2 1150 −15%는 판정 보류). GC는 monolith eden −14%·할당 추정 −8~11%, 월드는
      eden +7~9%·할당 추정 +25~30%(2쌍 — 인접 쌍 B2b·B3b는 −20%·−23%라 증가분의 출처는 판정 보류) — 월드 할당 프로파일은 `895d8b6`·B6 둘 다에서
      잰다(이진 전환 밖 과제). 후속: Bun 1.4.3으로 다시 재면 이 증가는 재현되지 않는다(바이너리 쪽이 −21~38%, 원인은 가설 —
      `perf-baseline.md` "Bun 1.4.3 전환").
    - 형태 변경 후보(각각 별도 bump·semantic 변경 커밋 — 위 "(B5①b에서 넘김) B5 대상 패킷의 형태 변경 후보"): CHAR_STATS_FULL의 클라 미사용 필드,
      CHAR_LEVEL_UP.statDeltas(집계 ≤ 12개 또는 제거), QUEST_ACTION_ACK op/errCode·QUEST_NPC_MARKERS.marker의 u8 enum화, SKILL_LIST.learned 제거,
      QUEST_LIST.completed 증가 대비, NPC_DIALOG 평탄화. 메인·미니 골든은 그 커밋에서 해당 id의 semantic + body가 바뀌는 것으로 판정한다.
    - 와이어 무관 별건: 클라 PacketBus 구독자별 디코드(Fanout 1회 디코드 — 페이로드 공유 계약 필요, 생기면 구독자 디코드 실패 훅도 1회로 만들 수 있다),
      InputSampler `_tickEstimate` int wrap, `uiPreferencesRepo.load` 손상 행 예외(safeParse + 기본값 후보), `questListHelper.sendQuestMarkers`의
      `JSON.stringify` diff 캐시(프레임 본문 가드 허용 목록 항목 — 숫자 배열 비교로 바꾸면 목록에서 뺀다), 재송신 CHAR_STATS_FULL의 hp·mp 일시 되돌아감,
      skill id 0 허용(퀵슬롯 빈칸과 겹침), bodyOf C# 인코드의 하위 class 요구(시험·도구 전용).
    - S2C 본문 특성화 미니 골든의 수명(위 B5-0 항목): 형태 변경 후보까지 안전망으로 쓰고, 그 뒤 픽스처 콘텐츠로 전환할지 삭제할지 정한다.
