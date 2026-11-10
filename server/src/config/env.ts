// Phase G — 서버 env 검증 단일 진입점.
//
// 모든 process.env 접근은 본 파일에서만. 다른 모듈은 `import { env } from "../config/env"`로
// 타입 안전한 값만 사용한다.
//
// 검증 실패(invalid PORT 등) 시 boot 단계에서 즉시 throw → silent fallback 금지.
//
// NOTE: default 포트/DB 경로는 기존 코드 동작과 호환되도록 9000/9090/data/mmorpg.db로 둠.
// 작업 지시서의 7777/7778/./data/mmorpg.db와는 다르나, env 미설정 시 기존 동작을
// 깨지 않기 위함 — 변경하려면 별도 PR로.

import { z } from "zod";
import { TICK_MS } from "../sim/deterministic";
import { parseIpcAddress } from "./ipcAddress";

/** export는 테스트 전용(기본값·거부 검증) — 런타임 코드는 아래 `env`만 사용. */
export const EnvSchema = z.object({
  /** TCP 게임 포트. */
  PORT: z.coerce.number().int().min(1).max(65535).default(9000),
  /** 로컬호스트 전용 admin HTTP 포트(metrics/healthz). */
  ADMIN_PORT: z.coerce.number().int().min(1).max(65535).default(9090),
  /** bun:sqlite 파일 경로. `:memory:`는 테스트용. */
  DB_PATH: z.string().min(1).default("data/mmorpg.db"),
  /**
   * SQLite `PRAGMA synchronous`(WAL 위). NORMAL = 앱 크래시 안전, OS 크래시/정전 시 마지막
   * 체크포인트 이후 커밋 일부 롤백 가능(DB 일관성·커밋 순서는 유지). FULL = 커밋마다 fsync.
   * 근거·손실 클래스는 architecture.md §6.4.
   */
  DB_SYNCHRONOUS: z.enum(["NORMAL", "FULL"]).default("NORMAL"),
  /**
   * SQLite `PRAGMA busy_timeout`(ms) — 잠금 경합 시 SQLITE_BUSY 대신 기다릴 상한. bun:sqlite는
   * 동기라 이 대기는 이벤트 루프(tick)를 그대로 멈춘다 → 단일 프로세스 게임 서버는 짧게(200).
   * 서버 실행 중 라이브 DB에 외부 쓰기를 하지 않는 것이 전제(4단계 이후에도 월드가 유일 writer,
   * architecture.md §6.4). 0 = 즉시 SQLITE_BUSY.
   */
  DB_BUSY_TIMEOUT_MS: z.coerce.number().int().min(0).max(60_000).default(200),
  /** 주기 자동저장 간격(초). 접속 종료·우아한 종료 flush와 별개. */
  AUTOSAVE_INTERVAL_SEC: z.coerce.number().int().min(1).max(86_400).default(300),
  /** 자동저장 청크 크기(명) — 청크 1개 = 동기 구간 1개 + 외곽 tx 1개, 청크 사이 이벤트 루프 양보. */
  AUTOSAVE_CHUNK: z.coerce.number().int().min(1).max(100_000).default(200),
  /**
   * 정지 후 연달아 실행할 밀린 tick 상한 — 초과분은 건너뛴다(architecture.md §4.1).
   * 0 = 밀린 tick 전부 skip. 결정론 무관(tickIndex 기반).
   */
  TICK_MAX_CATCHUP: z.coerce.number().int().min(0).max(200).default(5),
  /**
   * GC 페이서 간격(tick) — tick 직후 유휴 구간에 K tick마다 비동기 GC를 요청해 할당 임계가 tick 안에서 차지 않게 한다(tick p99 꼬리
   * — architecture.md §4.1). 0 = 끔. 기본 끔: Bun 1.3.x(GC 샘플러가 tick 안 eden을 걸던 런타임)에서는 8이 꼬리를 줄였지만 1.4.3에서는
   * 이득이 측정되지 않았고 eden만 2.5~2.7배로 늘었다(perf-baseline.md "Bun 1.4.3 — 수용 인원·GC 페이서·소크"). 켤 때는 8(1.3.x 검증값).
   */
  GC_PACE_TICKS: z.coerce.number().int().min(0).max(1200).default(0),
  /** GC 페이서 요청에 필요한 다음 데드라인까지 최소 유휴(ms) — 모자라거나 tick을 건너뛰는 중이면 미룬다. */
  GC_PACE_MIN_IDLE_MS: z.coerce.number().min(0).max(50).default(10),
  /**
   * 세션별 미송신 꼬리 상한(바이트) — 부분 쓰기 잔여는 drain까지 보관하고, 초과 시 느린 소비자로
   * 보고 종료(architecture.md §3.1). 스냅샷 수 tick분 + 이벤트 버스트 여유.
   */
  OUTBOUND_MAX_BYTES: z.coerce.number().int().min(16_384).max(64 * 1024 * 1024).default(262_144),
  /**
   * 전역 동시 연결 상한 — 초과 연결은 KICK 9(ServerFull) 후 close. Linux는 `ulimit -n`을
   * 이 값보다 넉넉히(연결당 fd 1 + 여유) 올려야 한다.
   */
  MAX_CONNECTIONS: z.coerce.number().int().min(1).max(100_000).default(2000),
  /**
   * IP별 동시 연결 상한(loopback 예외, IPv6는 /64 프리픽스 단위로 집계). NAT 뒤 다수 사용자를
   * 받으면 상향.
   */
  MAX_CONNECTIONS_PER_IP: z.coerce.number().int().min(1).max(100_000).default(32),
  /**
   * 미인증(AUTHENTICATED 미도달) 동시 연결 상한 — 초과 연결은 KICK 9(ServerFull) "pre-auth cap".
   * 미설정 시 MAX_CONNECTIONS의 25%(올림). 미인증 소켓만으로 전역 슬롯을 전부 점유하는 슬롯
   * 선점을 막는다(architecture.md §10). 로그인 폭주 측정 시 동시 핸드셰이크 수만큼 상향.
   */
  MAX_PREAUTH_CONNECTIONS: z.coerce.number().int().min(1).max(100_000).optional(),
  /**
   * IP 버킷별 미인증 동시 연결 상한 — 초과 연결은 KICK 9(ServerFull) "pre-auth cap". 미설정 시
   * MAX_CONNECTIONS_PER_IP의 25%(올림, 기본 8). NAT 뒤에서 동시에 로그인 화면에 머무는 사용자 수의 상한이기도 하다.
   */
  MAX_PREAUTH_PER_IP: z.coerce.number().int().min(1).max(100_000).optional(),
  /**
   * accept부터 AUTHENTICATED 도달까지의 절대 데드라인(초) — 트래픽과 무관, 초과 시 KICK 3(Idle)
   * "pre-auth deadline". AUTHENTICATED 이후(캐릭터 선택·생성)는 적용되지 않는다. 기본 300초는
   * 사람의 로그인 화면 체류를 덮는 값이다 — Unity 클라는 Boot에서 접속+HELLO 후 로그인 화면에서
   * 입력을 기다리며(PING 1 Hz가 idle을 유지) AUTH_REQ를 보낸다. 데드라인은 유한하기만 하면 되고,
   * 동시 점유 상한은 MAX_PREAUTH_CONNECTIONS·MAX_PREAUTH_PER_IP가 친다.
   */
  PRE_AUTH_DEADLINE_SEC: z.coerce.number().int().min(1).max(600).default(300),
  /**
   * 인월드 idle 컷(초) — 이 시간 동안 완전 프레임이 없는 IN_WORLD 연결은 KICK 3(Idle) "idle timeout". 클라는 인월드에서 PING 1 Hz·
   * INPUT_CMD 20 Hz를 보내므로(runInBackground) 걸리는 것은 FIN 없이 사라진 유령 연결(NAT 재부팅·회선 단절)뿐이다 — 유령은 끊길
   * 때까지 MAX_CONNECTIONS·MAX_CONNECTIONS_PER_IP 몫을 쥐고 있어 같은 IP의 자동 재접속을 KICK 9로 막는다(종전 300초).
   * Bun 소켓 타이머는 4초 단위(실효 컷 = 마지막 프레임 뒤 (⌈값/4⌉−1)×4 ~ ⌈값/4⌉×4초)이고 이벤트 루프 정지는 한 칸으로만 센다 —
   * 근거·실측은 network/clientEdge.ts DEFAULT_IN_WORLD_IDLE_SEC. 하한 20 = 미인증 idle 창, 상한 300 = 종전 값(되돌리기용).
   * monolith 클라 리스너와 게이트웨이 엣지가 같은 값을 쓴다(edgeOptionsFromEnv).
   */
  IN_WORLD_IDLE_SEC: z.coerce.number().int().min(20).max(300).default(60),
  /**
   * IN_WORLD rate limit KICK 윈도우(ms) — 토큰 부족 패킷은 drop하고, 이 윈도우 안의 drop이
   * RATE_KICK_MAX_DROPS를 초과할 때만 KICK. 서버 정지 후 큐 입력 버스트 오킥 방지(architecture.md §10).
   */
  RATE_KICK_WINDOW_MS: z.coerce.number().int().min(100).max(60_000).default(3000),
  /**
   * 윈도우 내 허용 drop 수. 0 = 첫 위반 즉시 KICK(종전 정책). 비용: strike 링 = maxDrops × 8 B
   * (Float64)로 drop이 한 번이라도 난 세션에만 할당 — 상한 2000이면 16 KB/세션, 2000세션 최악 32 MB.
   */
  RATE_KICK_MAX_DROPS: z.coerce.number().int().min(0).max(2000).default(300),
  /**
   * 디코드 실패 strike(이진 전환 B2c, architecture.md §10) — 라우팅 사전 판정을 통과한(처리될) 패킷의 본문 디코드 실패는 drop하고
   * 세션별로 세어, NET_DECODE_WINDOW_MS 안의 실패가 이 값을 *초과*하면 KICK 5 "malformed packets". B2b부터 정상 클라는 디코드 실패를
   * 낼 수 없다(실패 = 변조·버그). 0 = KICK 끔(drop·메트릭만). strike 링 = 값 × 8 B(실패가 난 세션만). ANON의 HELLO 디코드 실패는
   * KICK 1이라 대상이 아니다. 디코드는 월드(monolith·world)에서만 하므로 ROLE=gateway는 이 값을 쓰지 않는다.
   */
  NET_DECODE_STRIKES: z.coerce.number().int().min(0).max(1000).default(5),
  /** 디코드 실패 strike 창(ms, 슬라이딩). */
  NET_DECODE_WINDOW_MS: z.coerce.number().int().min(100).max(600_000).default(10_000),
  /**
   * 과부하 신호 스위치(3단계 슬라이스 8, architecture.md §4.1·§10). "1"이면 tick 루프가 밀린 동안 IN_WORLD
   * rate 위반을 연결별 면제 예산(net/rateLimit OVERLOAD_EXEMPT_LIMITS) 안에서 drop만 하고 strike를 기록하지 않는다
   * (예산을 넘긴 flood는 평소처럼 KICK). "0" = 끔(종전 동작 — 접속 제한도 꺼짐).
   */
  OVERLOAD_PROTECT: z.enum(["0", "1"]).default("1"),
  /**
   * 과부하 중 신규 접속 거절(admission control) — 연결 회계 전에 KICK 9(ServerFull) "server busy" 후 close.
   * 강한 증거(창 안 skip ≥ OVERLOAD_ENTER_SKIPS/2 또는 최근 창 안 무응답) 동안만 거절한다.
   * "0"이면 strike 보류만 한다(용량 초과 레벨을 재는 부하 측정 등).
   */
  OVERLOAD_ADMISSION: z.enum(["0", "1"]).default("1"),
  /**
   * 과부하 진입 문턱 — 최근 OVERLOAD_WINDOW_MS 안에 캐치업 상한으로 건너뛴 tick 합. 지속되면
   * Hz ≤ 20 − 문턱/창초(기본 16 Hz 이하)와 같다. 유지 문턱은 1/4(≈19 Hz), 접속 제한 문턱은 1/2에서 파생한다.
   * 창 안 최대 skip(창/50 ms)을 넘으면 부팅 거부(아래 가드).
   */
  OVERLOAD_ENTER_SKIPS: z.coerce.number().int().min(1).max(10_000).default(20),
  /** skip 합산 창이자 무응답 1회가 증거로 남는 시간 — ms(창 안 skip이 유지 문턱 미만이고 무응답이 없으면 해제). */
  OVERLOAD_WINDOW_MS: z.coerce.number().int().min(1000).max(60_000).default(5000),
  /**
   * tick 루프 무응답 문턱(ms) — 마지막 루프 반복 이후 이만큼 지나면 즉시 과부하(이벤트 루프 정지 직후 tick보다
   * 먼저 처리되는 수신 버스트도 strike로 세지 않게). 정상 반복 간격(50 ms + tick 처리 시간)보다 넉넉히.
   */
  OVERLOAD_STALL_MS: z.coerce.number().int().min(200).max(60_000).default(1000),
  /**
   * "1"이면 AUTH_MODE.DevAuto가 신규 계정/캐릭터 자동 생성.
   * default "1": 기존 통합 테스트가 DevAuto 모드로 핸드셰이크함 — production은 아래 가드로 차단.
   */
  DEV_AUTO_CREATE: z.enum(["0", "1"]).default("1"),
  /**
   * Token 모드 AUTH(세션 토큰 재로그인 — 클라 자동 재접속 경로) 킬 스위치. "0"이면 Token AUTH를 토큰 소비 없이 틀린 토큰과 같은
   * 응답(BadCredentials + 종료)으로 거절한다 — 클라는 치명으로 보고 로그인 화면으로 간다. Password·DevAuto는 영향 없다.
   * 토큰 의미(1회용 교체·로그인 시 계정 토큰 폐기·GM 킥 폐기)는 architecture.md §7.2.
   */
  AUTH_TOKEN_LOGIN: z.enum(["0", "1"]).default("1"),
  /** obs/logger 출력 레벨. */
  LOG_LEVEL: z.enum(["silent", "debug", "info", "warn", "error"]).default("info"),
  /** /admin/logs 링버퍼 용량(레코드 수). 라인당 8K자 상한 — 기본 2000이면 힙 최대 ~32MB(UTF-16). */
  LOG_RING_SIZE: z.coerce.number().int().min(10).max(100_000).default(2000),
  /** 링버퍼 수집 최소 레벨(stdout LOG_LEVEL과 독립). */
  LOG_RING_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /** 설정 시 JSONL 파일 싱크 활성. 상대경로는 레포 루트 기준(config/paths.ts logsPath). */
  LOG_DIR: z.string().min(1).optional(),
  /** 파일 싱크 최소 레벨(stdout LOG_LEVEL과 독립). */
  LOG_FILE_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /** 파일 로테이션 임계(MB). */
  LOG_FILE_MAX_MB: z.coerce.number().int().min(1).max(1024).default(20),
  /** 보존 파일 개수 — 로테이션 시 초과분 오래된 것부터 삭제. */
  LOG_FILE_MAX_FILES: z.coerce.number().int().min(1).max(1000).default(10),
  /** 정의되어 있으면 admin HTTP가 Bearer 토큰 검증. 미정의면 127.0.0.1 bind만 허용. */
  ADMIN_TOKEN: z.string().min(8).optional(),
  /**
   * GM 웹 툴(/admin/gm) 활성화. development/test는 이 값과 무관하게 bind-only로 항상 허용,
   * production은 "1" + ADMIN_TOKEN 필수(아래 가드) — 미충족 시 라우트 자체가 404.
   */
  GM_TOOLS: z.enum(["0", "1"]).default("0"),
  /**
   * dev 측정 전용(성능 2-A/2-B spread 시나리오): > 0이면 ENTER_WORLD 때 캐릭터를 존 스폰 ±N 타일
   * 상자 안의 walkable 셀(존 경계·NavGrid로 clamp, charId 해시로 결정론)에 배치 — 저장 위치 무시.
   * 0 = off(기본). production에서 > 0이면 부팅 거부(아래 가드). 상한 4096 = 존 크기 여유.
   */
  PERF_SPAWN_SPREAD: z.coerce.number().int().min(0).max(4096).default(0),
  /**
   * dev 측정 전용(성능 2-B 몬스터 밀도 측정 — 2-B 생성기 출력 예정): 몬스터 정의·스폰 파일 대체 경로.
   * 미설정 = shared/data/monsters.json. 상대경로는 레포 루트 기준(config/paths.ts repoPath).
   * 대체 파일도 같은 zod 검증 + 부팅 참조 무결성(dataIntegrity)을 거치며, 실패 시 부팅 거부.
   * production에서 설정하면 부팅 거부(아래 가드) — 밀도 파일이 운영 월드·경제에 섞이는 것 차단.
   */
  MONSTER_DATA_FILE: z.string().min(1).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // ── 성능 4단계(게이트웨이 분리, architecture.md §1) — 4.1 키 검증, 4.2c gateway/world 진입점 ──
  /**
   * 프로세스 역할. monolith(기본) = 지금 경로 그대로(클라 소켓·월드·DB가 한 프로세스). gateway = 클라 소켓만
   * (게임 상태·DB 없음), world = 게임 전부 + 게이트웨이 IPC. index.ts가 역할별 본체(worldMain·gateway/gatewayMain)를 싣는다(4.2c).
   */
  ROLE: z.enum(["monolith", "gateway", "world"]).default("monolith"),
  /**
   * 프로세스 이름 — 로그 레코드 `proc` 필드(monolith는 붙이지 않음)와 LOG_DIR 파일 접두어(`<이름>-YYYYMMDD-….jsonl`).
   * 미설정 = monolith "server"(종전 파일명), world "world", gateway "gw<GATEWAY_ID>". 영숫자·밑줄 1–32자 — "-"는
   * 파일명 구분자라 금지(접두어가 겹치면 보존 삭제가 다른 프로세스의 파일을 지운다). 같은 LOG_DIR의 프로세스끼리 달라야 한다.
   */
  PROC_NAME: z
    .string()
    .regex(/^[A-Za-z0-9_]{1,32}$/)
    .optional(),
  /**
   * 월드 ↔ 게이트웨이 IPC 주소(월드 listen, 게이트웨이 connect) — `tcp://<loopback>:<port>`(양 OS 기본) |
   * `unix:<경로>`(Linux·macOS, Windows는 아래 가드가 거부). 형식·loopback 제한은 config/ipcAddress.ts.
   * 포트는 WinNAT 예약 대역(예: 9011–9110)을 피한 19xxx.
   */
  WORLD_IPC: z
    .string()
    .default("tcp://127.0.0.1:19500")
    .refine((s) => parseIpcAddress(s) !== null, "WORLD_IPC must be tcp://<loopback>:<port> or unix:<path>"),
  /**
   * 월드 ↔ 게이트웨이 IPC 공유 비밀 — 게이트웨이가 HELLO에 싣고 월드는 자기 값과 다르면 거절한다(HELLO_NACK auth — 피어 표 무접촉).
   * 미설정 = 빈 값(양쪽 다 미설정일 때만 붙는다). loopback IPC는 같은 호스트의 아무 계정이나 닿는다 — 없으면 로컬 프로세스가 살아
   * 있는 GATEWAY_ID를 사칭해 그 세션 전부를 끊거나 CONN_OPEN으로 클라 IP를 위조할 수 있다. production의 world·gateway는 필수(아래
   * 가드). 슈퍼바이저(bun run cluster)는 미설정이면 기동마다 무작위 값을 만들어 자식 전원에 준다. 공백 없는 인쇄 가능 ASCII 16–255자.
   */
  IPC_TOKEN: z
    .string()
    .regex(/^[\x21-\x7e]{16,255}$/, "IPC_TOKEN must be 16-255 printable ASCII characters without spaces")
    .optional(),
  /** 게이트웨이 번호 — IPC HELLO(u16)의 펜싱 키(같은 번호 재접속 시 월드가 옛 피어를 먼저 정리). ROLE=gateway면 필수. */
  GATEWAY_ID: z.coerce.number().int().min(0).max(65535).optional(),
  /**
   * "1"이면 게이트웨이들이 SO_REUSEPORT로 같은 PORT를 공유(Linux 커널 해시 분산 — 4.0 실측 K=2 최악 ±6%, K=4 ±8%).
   * ROLE=gateway 전용. Windows는 거부 — 두 번째 리스너가 연결을 받지 않는 핫 스탠바이가 된다(게이트웨이마다 다른 PORT).
   */
  REUSE_PORT: z.enum(["0", "1"]).default("0"),
  /** IPC heartbeat 간격(ms) — 양방향 PING/PONG. */
  IPC_HEARTBEAT_MS: z.coerce.number().int().min(50).max(60_000).default(1000),
  /** 이 시간(ms) 동안 상대로부터 IPC 메시지가 없으면 죽은 것으로 본다 — IPC_HEARTBEAT_MS의 2배 이상(아래 가드). */
  IPC_DEAD_MS: z.coerce.number().int().min(100).max(600_000).default(5000),
  /**
   * 게이트웨이 1개 앞에 쌓인 미전송 IPC 바이트 상한(MiB) — 넘으면 월드가 그 게이트웨이를 끊는다(OOM 대신 fail fast).
   * 기본 256: 4.0 실측 송출량(stock 1000 ≈ 10.7 MB/tick, realistic 1000 ≈ 3.5 MB/tick)의 약 1–3초분. 부하 중에는
   * IPC_DEAD_MS보다 이 상한이 멈춘 게이트웨이를 먼저 끊는다.
   */
  IPC_MAX_PENDING_MB: z.coerce.number().int().min(8).max(4096).default(256),
  /** 게이트웨이 1개의 동시 클라 연결 상한(fd·메모리 보호). 미설정 = MAX_CONNECTIONS. 전체 상한은 월드의 MAX_CONNECTIONS. */
  GATEWAY_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(100_000).optional(),
  /** ROLE=world에서 클라 직접 접속(PORT)도 받을지 — 기본 "0"(게이트웨이 경유만). 다른 ROLE에서는 무시. */
  WORLD_CLIENT_LISTEN: z.enum(["0", "1"]).default("0"),
  /**
   * 내부용 — 슈퍼바이저(cluster/launch.ts)가 자식 env에 "1"로 넣는다. "1" + 부모 IPC 채널이면 SIGINT를 무시하고(종료 순서는
   * 슈퍼바이저가 정한다 — 월드 먼저) 슈퍼바이저의 종료 메시지·IPC 끊김으로 우아하게 끝낸다(cluster/supervisorLink.ts).
   * 직접 띄울 때는 두지 않는다.
   */
  CLUSTER_SUPERVISED: z.enum(["0", "1"]).default("0"),
  // ── 성능 4.5 F1 — 게이트웨이 부하 기반 접속 제한(architecture.md §3.4·§10, ops-cluster §9). 거절은 신규 접속만(KICK 9 "server busy"),
  // 기존 연결은 건드리지 않는다. 최후 안전판은 그대로 IPC_MAX_PENDING_MB(넘으면 그 게이트웨이를 끊는다). ──
  /**
   * ROLE=world: 피어별 IPC 소프트 임계 — 게이트웨이 1개 앞 미전송이 IPC_MAX_PENDING_MB의 이 %에 닿으면 그 게이트웨이의 신규 접속을
   * 거절하고(CONN_OPEN → KICK 9) ADMISSION busy를 긴급으로 알린다(게이트웨이가 CONN_OPEN 전에 거절). 기본 25(256 MiB의 64 MiB —
   * 4.4 포화 속도 +1–2 MB/tick에서 하드 drop까지 5–9초 여유). 0 = 끔.
   */
  IPC_ADMISSION_SOFT_PCT: z.coerce.number().int().min(0).max(90).default(25),
  /** 소프트 임계 해제 비율(%) — 미전송이 이 이하로 IPC_ADMISSION_HOLD_MS 동안 이어지면 다시 받는다. 소프트보다 작아야 한다(아래 가드). */
  IPC_ADMISSION_CLEAR_PCT: z.coerce.number().int().min(0).max(89).default(6),
  /** 소프트 임계 해제 유지 시간(ms). */
  IPC_ADMISSION_HOLD_MS: z.coerce.number().int().min(0).max(600_000).default(2000),
  /**
   * ROLE=world: 피어 점진 감축 임계(IPC_MAX_PENDING_MB의 %) — 게이트웨이 1개 앞 미전송이 이 이상이고 직전 감축 뒤로 다시 늘면 그
   * 게이트웨이의 인월드 세션 중 무작위 IPC_SHED_FRACTION_PCT %(상한 IPC_SHED_MAX_PER_STEP)를 KICK 9 "server busy"로 줄인다(소프트
   * 임계는 신규 접속만 막아 이미 붙은 부하가 게이트웨이 IPC 수신 속도를 넘으면 하드 상한에서 전원 KICK 6 — macOS 실측). 기본 40,
   * 0 = 끔. 월드에선 소프트 임계(켜짐)보다 커야 한다(아래 가드).
   */
  IPC_SHED_PCT: z.coerce.number().int().min(0).max(99).default(40),
  /** 감축 1회에 줄일 그 게이트웨이 인월드 세션 비율(%) — 최소 1명. */
  IPC_SHED_FRACTION_PCT: z.coerce.number().int().min(1).max(100).default(10),
  /** 감축 사이 최소 간격(ms) — 직전 감축의 효과(생성량 감소)를 볼 시간. */
  IPC_SHED_COOLDOWN_MS: z.coerce.number().int().min(50).max(60_000).default(500),
  /** 감축 1회 상한(명) — 감축 세션은 한 번의 동기 배치 저장으로 정리된다(AUTOSAVE_CHUNK와 같은 이유). */
  IPC_SHED_MAX_PER_STEP: z.coerce.number().int().min(1).max(10_000).default(100),
  /**
   * 채팅(CHAT_SAY) 발신자별 속도(건/초)와 버스트 — 넘는 메시지는 버린다(mmorpg_chat_throttled_total). 채팅은 존 전원 팬아웃이라
   * IN_WORLD 버킷(100 pkt/s)만으로는 계정 1개가 존 전체에 초당 수만 write를 만든다(4.5 후속 보안 리뷰 — 감축 유발 레버).
   */
  CHAT_RATE_PER_SEC: z.coerce.number().min(0.1).max(100_000).default(2),
  CHAT_BURST: z.coerce.number().int().min(1).max(100_000).default(5),
  /**
   * 자유 포인트 명령(STAT_ALLOCATE·STAT_RESET 공유) 연결당 속도(건/초)와 버스트 — 넘으면 RATE_LIMITED ACK만 보내고 아무것도 바꾸지 않는다
   * (mmorpg_stat_op_throttled_total). 정상 클라는 요청 1건씩 ACK를 기다린다.
   */
  STAT_OP_RATE_PER_SEC: z.coerce.number().min(0.1).max(100_000).default(2),
  STAT_OP_BURST: z.coerce.number().int().min(1).max(100_000).default(5),
  /**
   * 생활 콘텐츠(채집·제작 — life-content-draft) 기능 플래그. "1"이면 채집 노드와 약초상 NPC를 스폰하고 입장 뒤 NODE_CATALOG·LIFE_STATUS를 보내며
   * GATHER_START·GATHER_TRACE·GATHER_TAPS·LIFE_CANCEL·CRAFT_REQ·NPC_ACTION open_craft를 처리한다. "0"(기본) = 노드·약초상 없음·생활 요청 무응답(와이어 특성화 골든 바이트 동일).
   * 작업력·숙련은 플래그와 무관하게 로드·저장한다(꺼져 있으면 바뀌지 않아 쓰기가 없다). 클라 UI는 L-1·L-2분이 들어왔고, 운영은 경제 지표·소크를 보는 L-6 전까지 끈다.
   */
  LIFE_CONTENT: z.enum(["0", "1"]).default("0"),
  /** 계정 작업력 상한·회복 주기(ms)·주기당 회복량(지연 회복 — sim/life/laborClock.ts). 기본 4000·5분·10 = 빈 풀에서 가득까지 약 33시간. */
  LABOR_CAP: z.coerce.number().int().min(1).max(1_000_000).default(4000),
  LABOR_REGEN_MS: z.coerce.number().int().min(1000).max(86_400_000).default(300_000),
  LABOR_REGEN_AMOUNT: z.coerce.number().int().min(1).max(1_000_000).default(10),
  /**
   * 생활 명령(GATHER_START·CRAFT_REQ 공유) 연결당 속도(건/초)와 버스트 — 넘으면 RATE 응답만 보내고 아무것도 바꾸지 않는다(mmorpg_life_op_throttled_total).
   * 두 검사가 정규화·인벤 최악 칸 시뮬을 돌린다.
   */
  LIFE_OP_RATE_PER_SEC: z.coerce.number().min(0.1).max(100_000).default(2),
  LIFE_OP_BURST: z.coerce.number().int().min(1).max(100_000).default(5),
  /**
   * MOVE_TO 연결당 속도(건/초)와 버스트 — 넘으면 최신 1건만 보류했다가 토큰이 생기면 처리(latest-wins). MOVE_TO는 요청마다 A*(+ 본인 MOVE_PATH)라
   * 전체 버킷(100/s)과 별도로 둔다. 정상 클라: 평균 0.3/s, 추격 재조준 최대 4/s, 클릭 연타 5–10/s.
   */
  MOVE_TO_RATE_PER_SEC: z.coerce.number().min(0.1).max(100_000).default(8),
  MOVE_TO_BURST: z.coerce.number().int().min(1).max(100_000).default(8),
  /**
   * 몬스터 추격 걷기·멈춤 리듬 스위치. "1"이면 추격을 걷기(def chaseWalk*)·멈춤(chasePause*) 반복으로 한다.
   * "0" = 매 tick 타겟을 쫓는 종전 연속 추격(성능 비교·되돌림용 — architecture.md §4.5).
   */
  MONSTER_CHASE_RHYTHM: z.enum(["0", "1"]).default("1"),
  /**
   * 몬스터 평상시 배회 스위치. "1"이면 스폰 patrolRadius > 0인 몬스터가 home 주변을 걷고 멈춘다(def wanderPause*). "0" = 제자리 대기.
   * 배회하는 몬스터는 보는 사람마다 SNAPSHOT_DELTA를 만든다 — 한곳에 몰린 정지 인파에서 송신이 늘면 끈다.
   */
  MONSTER_WANDER: z.enum(["0", "1"]).default("1"),
  /**
   * 몬스터 벽 우회 스위치. "1"이면 추격·복귀 직선이 막혔을 때만 A*로 돌아간다.
   * "0" = 벽을 보지 않는 종전 직선(되돌림용 — architecture.md §4.5).
   */
  MONSTER_NAV: z.enum(["0", "1"]).default("1"),
  /**
   * ROLE=gateway: 부하 기반 접속 제한 스위치. "1"이면 로컬 신호(CPU·이벤트 루프 지연·IPC 왕복·클라 송신 꼬리) 중 하나가 진입 문턱에
   * 닿거나 월드가 ADMISSION busy를 보내면 새 클라를 CONN_OPEN 전에 KICK 9 "server busy"로 돌려보낸다. "0" = 끔(월드 판정도 무시 —
   * 월드가 CONN_OPEN에서 거절한다). 부하 측정에서 용량 초과 레벨을 재려면 0(+ 월드 IPC_ADMISSION_SOFT_PCT=0·IPC_SHED_PCT=0).
   */
  GW_ADMISSION: z.enum(["0", "1"]).default("1"),
  /** 프로세스 CPU 진입 문턱(한 코어 대비 %, 1초 창) — 게이트웨이는 단일 스레드라 ≈100%가 포화. 해제 = −15 pt. */
  GW_ADMISSION_CPU_PCT: z.coerce.number().int().min(20).max(400).default(90),
  /** 이벤트 루프 지연 진입 문턱(ms, 250 ms 표본 타이머 지연의 1초 창 최대). 해제 = 절반. */
  GW_ADMISSION_LAG_MS: z.coerce.number().int().min(10).max(600_000).default(250),
  /**
   * IPC 왕복 진입 문턱(ms) — 답 없는 가장 오래된 PING의 나이 또는 최근 PING→PONG 왕복(월드 PONG은 그 앞의 W→G 적체 뒤에 온다).
   * 해제 = 절반. 답 없는 PING은 최근 16개(16 × IPC_HEARTBEAT_MS)만 기억한다 — 그보다 긴 문턱은 적체만으로는 넘지 못한다.
   */
  GW_ADMISSION_RTT_MS: z.coerce.number().int().min(10).max(600_000).default(1000),
  /**
   * 클라 송신 꼬리 합 진입 문턱(MiB) — 실제 NIC 대역폭 한계. 해제 = 절반. 인월드 연결 중 꼬리를 가진 연결이 GW_ADMISSION_OUTBOUND_RATIO
   * 미만이면 세지 않는다(클라가 읽지 않기만 해도 꼬리가 자라므로 소수 연결이 잠그지 못하게).
   */
  GW_ADMISSION_OUTBOUND_MB: z.coerce.number().int().min(1).max(65_536).default(64),
  /**
   * outbound 신호의 최소 폭 — 인월드(로그인 중 제외) 연결 중 송신 꼬리를 가진 연결 비율이 이 미만이면 꼬리 합을 세지 않는다(진입·해제
   * 모두). 기본 0.5.
   */
  GW_ADMISSION_OUTBOUND_RATIO: z.coerce.number().min(0.05).max(1).default(0.5),
  /** 모든 신호가 해제 문턱 이하이고 월드가 open인 상태가 이만큼(ms) 이어져야 다시 받는다. */
  GW_ADMISSION_HOLD_MS: z.coerce.number().int().min(0).max(600_000).default(3000),
  /**
   * ROLE=gateway, dev 전용: /admin/perf의 부수효과 쿼리(reset=1·gc=1·stall=) 허용. 기본 "0" = 403(읽기는 그대로) — bind-only 신뢰
   * (ADMIN_TOKEN 미설정)에서 같은 호스트의 아무 프로세스나 정지 주입·연속 풀 GC로 게이트웨이를 붙잡아 지연·CPU 신호로 신규 접속을 잠글
   * 수 있었다(4.5 리뷰·검증). 카오스 시험(C6)만 "1". production은 엔드포인트 자체가 없다. 월드 /admin/perf는 이 값과 무관(종전 그대로).
   */
  GW_PERF_SIDE_EFFECTS: z.enum(["0", "1"]).default("0"),
  /**
   * ROLE=gateway: 공유 포트 리스너 양보(IPC v14 — 자동 재접속 선결). "1"이면 새 클라를 거절하는 동안(접속 제한 닫힘·연결 상한 닿음) 월드 지시(LISTEN yield)로 클라 리스너를
   * 잠시 내려 공유 포트의 새 연결이 받을 수 있는 게이트웨이로만 가게 한다(이미 받은 연결은 그대로, 같은 포트에 열린 리스너가 따로 있을 때만 —
   * 월드 계획기 불변식). REUSE_PORT=1·GW_ADMISSION=1일 때만 효력(그 밖에는 무시 — 게이트웨이별 포트·monolith는 종전 그대로). "0" = 끔(킬 스위치).
   */
  GW_LISTEN_YIELD: z.enum(["0", "1"]).default("1"),
  /**
   * ROLE=world: MULTICAST(성능 4.5 F2) — sendMany 팬아웃 프레임(DAMAGE·SKILL_EFFECT·ENTITY_META·CHAT)을 게이트웨이당
   * CONN_MULTICAST 레코드 1개로 보낸다. "0" = 끔(종전 연결별 DELIVER만 — 클라 바이트는 같다, A/B 측정·킬 스위치). 게이트웨이는 v4
   * 디코더로 항상 받는다(설정 없음).
   */
  IPC_MULTICAST: z.enum(["0", "1"]).default("1"),
  /**
   * ROLE=world: 공유 프레임(성능 4.5 F3) — 같은 셀에 머문 viewer들의 SNAPSHOT_DELTA(ackSeq만 다르다)를 게이트웨이 봉투당 DEF 1개 + 연결별
   * CONN_REF(ackSeq 패치)로 보낸다(CONN_DELIVER_SHARED, IPC v5). "0" = 끔(세션이 복사·패치해 연결별 DELIVER — 클라 바이트는 같다, A/B
   * 측정·킬 스위치). 게이트웨이는 v5 디코더로 항상 받는다(설정 없음). DELTA 묶음 자체(viewer별 writeEntries 생략)는 이 값과 무관하게 켜져 있다.
   */
  IPC_SHARED: z.enum(["0", "1"]).default("1"),
});

export type Env = z.infer<typeof EnvSchema>;
/** 프로세스 역할(env ROLE). */
export type ProcessRole = Env["ROLE"];

/** 로그 proc 태그·파일 접두어 — PROC_NAME, 미설정이면 역할별 기본(monolith는 종전 파일명 "server"). */
export function resolveProcName(e: Env): string {
  if (e.PROC_NAME !== undefined) return e.PROC_NAME;
  if (e.ROLE === "gateway") return `gw${e.GATEWAY_ID ?? 0}`;
  return e.ROLE === "world" ? "world" : "server";
}

/**
 * 조합 안전 가드 — 위반 시 throw(부팅 거부). 모듈 로드 시 1회 실행하며, export는 테스트용
 * (env는 import 시점 1회 파싱이라 production 분기를 재부팅 없이 검증할 수 있게). platform은 플랫폼 의존
 * 가드(REUSE_PORT·unix IPC)를 다른 OS에서도 검증하기 위한 주입점.
 */
export function assertEnvGuards(e: Env, platform: NodeJS.Platform = process.platform): void {
  assertProductionGuards(e);
  assertOverloadGuards(e);
  assertClusterGuards(e, platform);
}

function assertProductionGuards(e: Env): void {
  // 프로덕션에서 DEV_AUTO_CREATE가 켜져 있으면 누구나 임의 username으로 계정 생성 가능.
  if (e.NODE_ENV === "production" && e.DEV_AUTO_CREATE === "1") {
    throw new Error(
      "DEV_AUTO_CREATE=1 is not allowed in NODE_ENV=production. Set DEV_AUTO_CREATE=0.",
    );
  }
  // GM: 프로덕션 GM 툴은 Bearer 토큰 없이 켤 수 없다(쓰기 엔드포인트 — bind-only 불충분).
  if (e.NODE_ENV === "production" && e.GM_TOOLS === "1" && e.ADMIN_TOKEN === undefined) {
    throw new Error("GM_TOOLS=1 requires ADMIN_TOKEN in NODE_ENV=production.");
  }
  // 측정 전용 스폰 분산은 실제 플레이어의 저장 위치를 덮어쓴다 — 운영 금지.
  if (e.NODE_ENV === "production" && e.PERF_SPAWN_SPREAD > 0) {
    throw new Error("PERF_SPAWN_SPREAD > 0 is not allowed in NODE_ENV=production (dev measurement only).");
  }
  // 측정용 몬스터 밀도 파일은 운영 월드의 스폰·EXP·드롭 경제를 바꾼다 — 운영 금지.
  if (e.NODE_ENV === "production" && e.MONSTER_DATA_FILE !== undefined) {
    throw new Error("MONSTER_DATA_FILE is not allowed in NODE_ENV=production (dev measurement only).");
  }
}

function assertOverloadGuards(e: Env): void {
  // 창 안에서 건너뛸 수 있는 tick은 창/TICK_MS개가 최대 — 그보다 큰 문턱은 skip 진입을 조용히 끈다.
  const maxSkipsInWindow = Math.floor(e.OVERLOAD_WINDOW_MS / TICK_MS);
  if (e.OVERLOAD_PROTECT === "1" && e.OVERLOAD_ENTER_SKIPS > maxSkipsInWindow) {
    throw new Error(
      `OVERLOAD_ENTER_SKIPS (${e.OVERLOAD_ENTER_SKIPS}) exceeds the ticks in OVERLOAD_WINDOW_MS (${maxSkipsInWindow}) — skip-based overload could never trigger.`,
    );
  }
}

/** 4단계 프로세스 역할·IPC 조합(4.0 스파이크 교정 a·e). */
function assertClusterGuards(e: Env, platform: NodeJS.Platform): void {
  if (e.ROLE === "gateway" && e.GATEWAY_ID === undefined) {
    throw new Error("ROLE=gateway requires GATEWAY_ID (IPC HELLO fencing key).");
  }
  // 운영 IPC는 공유 비밀 없이 열지 않는다 — loopback 포트는 같은 호스트의 모든 계정이 닿는다(게이트웨이 사칭·클라 IP 위조).
  if (e.NODE_ENV === "production" && e.ROLE !== "monolith" && e.IPC_TOKEN === undefined) {
    throw new Error(`ROLE=${e.ROLE} requires IPC_TOKEN in NODE_ENV=production (shared secret for the world/gateway IPC HELLO).`);
  }
  // monolith·world가 포트를 공유하면(Linux) 월드 두 개가 같은 클라 포트를 나눠 받는다 — 게이트웨이만 허용.
  if (e.REUSE_PORT === "1" && e.ROLE !== "gateway") {
    throw new Error("REUSE_PORT=1 is only allowed with ROLE=gateway.");
  }
  // Windows SO_REUSEPORT: 두 리스너 모두 bind되지만 연결은 첫 리스너만 받는다(4.0 실측 2000/0) — 조용한 무트래픽 게이트웨이.
  if (e.REUSE_PORT === "1" && platform === "win32") {
    throw new Error("REUSE_PORT=1 is not supported on Windows — give each gateway its own PORT.");
  }
  // Windows의 unix 경로는 named pipe — write가 항상 전부 수락되어 IPC 백프레셔(IPC_MAX_PENDING_MB)가 무력화된다.
  if (platform === "win32" && parseIpcAddress(e.WORLD_IPC)?.kind === "unix") {
    throw new Error("WORLD_IPC=unix:… is not supported on Windows (named pipes hide backpressure) — use tcp://127.0.0.1:<port>.");
  }
  // 해제 ≥ 소프트면 hold가 끝나는 순간 다시 busy — 판정이 깜빡인다(소프트 0 = 끔이면 무관).
  if (e.IPC_ADMISSION_SOFT_PCT > 0 && e.IPC_ADMISSION_CLEAR_PCT >= e.IPC_ADMISSION_SOFT_PCT) {
    throw new Error(
      `IPC_ADMISSION_CLEAR_PCT (${e.IPC_ADMISSION_CLEAR_PCT}) must be below IPC_ADMISSION_SOFT_PCT (${e.IPC_ADMISSION_SOFT_PCT}).`,
    );
  }
  // 감축(월드만 쓴다)은 신규 접속 거절(소프트)보다 늦게 — 같거나 낮으면 거절보다 먼저 기존 연결을 줄인다. 소프트를 끄고 감축만 켜면
  // 포화한 게이트웨이가 새 클라를 계속 받고 곧 감축으로 끊는 churn이 된다(접속·bcrypt·로드·저장 낭비) — 둘 다 끄거나 둘 다 켠다.
  if (e.ROLE === "world" && e.IPC_SHED_PCT > 0) {
    if (e.IPC_ADMISSION_SOFT_PCT === 0) {
      throw new Error("IPC_SHED_PCT requires IPC_ADMISSION_SOFT_PCT > 0 — to disable admission for load tests, set IPC_SHED_PCT=0 too.");
    }
    if (e.IPC_SHED_PCT <= e.IPC_ADMISSION_SOFT_PCT) {
      throw new Error(`IPC_SHED_PCT (${e.IPC_SHED_PCT}) must be above IPC_ADMISSION_SOFT_PCT (${e.IPC_ADMISSION_SOFT_PCT}).`);
    }
  }
  if (e.IPC_DEAD_MS < 2 * e.IPC_HEARTBEAT_MS) {
    throw new Error(
      `IPC_DEAD_MS (${e.IPC_DEAD_MS}) must be at least 2 × IPC_HEARTBEAT_MS (${e.IPC_HEARTBEAT_MS}) — one late heartbeat would declare the peer dead.`,
    );
  }
}

export const env: Env = EnvSchema.parse(process.env);
assertEnvGuards(env);

/** GM 라우트 활성 여부 — development/test는 로컬 개발 편의로 항상 허용(bind-only), production은 opt-in. */
export const GM_ENABLED: boolean = env.NODE_ENV === "production" ? env.GM_TOOLS === "1" : true;
