# 서버 로그 운영 가이드

> 설계 근거·정책(포맷/싱크/보안/스쿼시)은 [`architecture.md`](architecture.md) §9.
> 이 문서는 "어떻게 켜고, 어떻게 찾는가".

## 켜기

`.env`(레포 루트 기준 상대경로 — cwd 무관, `config/paths.ts`가 앵커):

```dotenv
LOG_DIR=logs            # 파일 싱크 on → logs/server-YYYYMMDD-HHmmss-NNNN.jsonl (미설정 = stdout만)
                        # ⚠ logs 외 경로를 쓰면 .gitignore를 함께 갱신할 것 — 로그에 username·IP·GM 감사 포함
LOG_FILE_LEVEL=info
LOG_FILE_MAX_MB=20      # 로테이션 임계
LOG_FILE_MAX_FILES=10   # 보존 개수(초과분 오래된 것부터 삭제)
LOG_RING_SIZE=2000      # /admin/logs 인메모리 링버퍼
LOG_RING_LEVEL=info
ADMIN_TOKEN=change-me-8+   # /admin/logs는 토큰 필수(미설정 시 라우트 자체가 404)
```

## 조회 워크플로 4단계

### ① 지금 무슨 일이 — `/admin/logs` 라이브 테일

```powershell
curl -H "Authorization: Bearer $env:ADMIN_TOKEN" `
  "http://127.0.0.1:9090/admin/logs?level=warn&mod=tcp&limit=100"
```

- 필터: `level`(최소 레벨)·`mod`(정확 일치)·`connId`·`sinceT`(epoch ms)·`limit`.
- 팔로우: 응답의 `nextSeq`를 `sinceSeq`로 재폴링하면 그 이후분만 온다(전진 커서, 누락 없음).
- 응답: `{ok, nextSeq, count, lines:[{seq, t, level, mod, msg, ...}]}` oldest-first.

### ② 과거에서 특정 건 검색 — 파일 직접 (PowerShell / jq)

```powershell
Get-Content logs\server-*.jsonl | ConvertFrom-Json |
  Where-Object { $_.level -eq "error" -and $_.mod -eq "questService" -and $_.charId -eq 3 } |
  Select-Object t, msg, questId
```

```bash
cat logs/server-*.jsonl | jq -c 'select(.level=="warn" and .connId==42)'
```

### ③ 정제·집계 — DuckDB (단일 바이너리 SQL)

JSONL 글롭에 바로 SQL을 던진다 — 서버에 아무것도 추가하지 않는다.

```sql
-- 어제 이후 에러 유형별 빈도
SELECT mod, msg, count(*) AS n
FROM read_json_auto('logs/server-*.jsonl')
WHERE level = 'error' AND t > epoch_ms(now() - INTERVAL 1 DAY)
GROUP BY mod, msg ORDER BY n DESC;

-- GM 감사 추출 → CSV
COPY (SELECT to_timestamp(t/1000) AS at, op, charId, before, after
      FROM read_json_auto('logs/server-*.jsonl') WHERE mod = 'gm')
TO 'gm-audit.csv' (HEADER);
```

`t`는 epoch ms 정수 — 시각 표시는 `to_timestamp(t/1000)`.

### ④ 탐색이 일상화되면 — VictoriaLogs + Vector (선택 오버레이)

단일 바이너리 2개, **앱 변경 0**(파일 테일 — 파일이 곧 내구 버퍼, VictoriaLogs가 죽어 있어도
Vector 체크포인트가 재개하므로 유실 없음).

```powershell
# VictoriaLogs (https://docs.victoriametrics.com/victorialogs/ — Windows 빌드 있음)
.\victoria-logs-prod.exe -storageDataPath=.\victoria-logs-data
# 웹 UI: http://127.0.0.1:9428/select/vmui
```

`vector.toml` (Vector — https://vector.dev, 단일 바이너리):

```toml
[sources.server_logs]
type = "file"
include = ["<레포 절대경로>/logs/*.jsonl"]

[sinks.vlogs]
type = "http"
inputs = ["server_logs"]
uri = "http://127.0.0.1:9428/insert/jsonline?_time_field=t&_msg_field=msg&_stream_fields=mod,level"
encoding.codec = "text"
```

LogsQL 예시: `mod:tcp level:warn _time:1h | stats by (connId) count()`

docker-compose 대안: `victoriametrics/victoria-logs` + `timberio/vector` 2서비스, `./logs:ro` 마운트.

## Kafka / ELK — 언제 다시 보나

파일 + 체크포인트 테일러가 내구 버퍼·멀티 컨슈머 재테일·byte 0 리플레이를 이미 제공하므로
현 규모(단일 프로세스)에선 도입하지 않는다(근거: architecture §9.5). 아래 트리거에서 재평가:

| 트리거 | 신호 |
|--------|------|
| 멀티 서버 프로세스/샤드 | 존 샤딩·월드 분리로 프로듀서가 2개 이상 |
| 실시간 push 독립 컨슈머 ≥2 | 라이브 안티치트 + 라이브 분석 등 — 배치 재테일로 부족해질 때 |
| 파일 테일 지연 | 지속 >~50MB/분 볼륨 |
| 이벤트 버스 수요 | 로그 너머 게임 텔레메트리를 스트림으로 소비 |

도입 시 Apache Kafka보다 **Redpanda**(단일 바이너리, Kafka API 호환, JVM/ZooKeeper 없음) 우선.
삽입 지점은 shipper 설정(Vector `kafka` sink로 교체) — 앱 코드 변경 0.

## 트러블슈팅

- **logs/ 파일이 안 생김**: `LOG_DIR` 미설정이 기본(stdout만). `.env` 확인.
- **/admin/logs가 404**: `ADMIN_TOKEN` 미설정(의도된 은닉) 또는 Bearer 오타.
- **파일 싱크가 멈춤**: stdout에서 `"mod":"logFile"` error 확인 — append 연속 10회 실패 시
  자기 비활성(디스크/권한 복구 후 서버 재시작으로 되살림). 드롭 규모는
  `/admin/metrics`의 `mmorpg_log_dropped_lines_total`.
- **크래시 직전 로그가 있나**: uncaughtException은 `flushSync` 드레인 후 exit(1) — 남는다.
  하드킬(작업관리자 강제종료)은 최대 1초 버퍼 손실.
- **로그가 뭉텅이로 준 것 같음**: 폭주 스쿼시 동작 — 같은 키의 다음 라인 `suppressed` 필드에
  억제 건수가 실려 있고, 위반 메트릭 카운터는 전량 집계된다.
