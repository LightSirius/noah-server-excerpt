/**
 * 코드젠 v2 — shared/schema/packets.json → 서버 TS(타입 + 바이너리 코덱) + 클라 C#(타입 + 바이너리 코덱) + packets.lock.json
 * + 교차 언어 골든(wire.golden.json)과 그 C# 픽스처 코덱(EditMode 시험 어셈블리).
 *
 * 단일 진실(packets.json) 한 곳에서 패킷 ID·페이로드 타입·바이너리 레이아웃을 정의하면 서버(TypeScript)와 클라이언트(C#)가 같은
 * 정의를 받는다. 스키마 검증 schema.ts, 레이아웃 layout.ts, 참조 인터프리터 refCodec.ts(테스트 오라클), 산출 emitTsTypes.ts·
 * emitTsCodec.ts·emitCsTypes.ts·emitCsCodec.ts, 골든 golden.ts(+ goldenCrafted.ts·goldenCraftedLife.ts, 합성 스키마 fixture.ts), 와이어 지문 lock.ts.
 * 규칙: shared/protocol.md §2, docs/adr/0003-binary-body-codec.md.
 *
 * 사용:
 *   bun run gen.ts            # 산출물·lock 갱신(lock의 와이어 지문은 protoVersion bump와 함께만 바뀐다)
 *   bun run gen.ts --check    # drift·lock 검사 (CI 게이트). 어긋나면 exit 1.
 *   bun run gen.ts --check --base-lock <path>   # + 머지 대상(base) 브랜치의 lock으로도 판정(lock 삭제·손편집 우회 차단 — CI)
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { readFile as nodeReadFile, writeFile as nodeWriteFile, mkdir } from "node:fs/promises";
import { parseSchema, SchemaError, type SchemaAst } from "./schema";
import { emitTsTypes } from "./emitTsTypes";
import { emitTsCodec } from "./emitTsCodec";
import { emitCsTypes } from "./emitCsTypes";
import { emitCsCodec } from "./emitCsCodec";
import { fixtureAst, fixtureRaw } from "./fixture";
import { buildGolden, serializeGolden } from "./golden";
import { evaluateBaseLock, evaluateLock, parseLock, serializeLock } from "./lock";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const SCHEMA_PATH = resolve(REPO_ROOT, "shared/schema/packets.json");
const LOCK_PATH = resolve(REPO_ROOT, "shared/schema/packets.lock.json");
const TS_OUT_PATH = resolve(REPO_ROOT, "server/src/net/codec.generated.ts");
const TS_CODEC_OUT_PATH = resolve(REPO_ROOT, "server/src/net/wireCodec.generated.ts");
const CS_OUT_PATH = resolve(REPO_ROOT, "client/Noah/Assets/Scripts/Net/Codec.Generated.cs");
const CS_CODEC_OUT_PATH = resolve(REPO_ROOT, "client/Noah/Assets/Scripts/Net/WireCodec.Generated.cs");
const GOLDEN_OUT_PATH = resolve(REPO_ROOT, "client/Noah/Assets/Tests/EditMode/Golden/wire.golden.json");
const FIXTURE_CS_DIR = resolve(REPO_ROOT, "client/Noah/Assets/Tests/EditMode/Generated");
const FIXTURE_CS_NAMESPACE = "MMORPG.Tests.EditMode.WireFixture";
const FIXTURE_SOURCE = "tools/codegen/fixture.ts";

/** 의존성 없는 짧은 fingerprint — drift 감지 전용(보안용 아님). CRLF 체크아웃에도 같은 값이 나오게 LF로 정규화. */
function simpleHash(s: string): string {
  const norm = s.replace(/\r\n/g, "\n");
  let h = 5381;
  for (let i = 0; i < norm.length; i++) {
    h = ((h << 5) + h + norm.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

async function readText(path: string): Promise<string> {
  return await nodeReadFile(path, "utf8");
}

async function writeIfChanged(path: string, content: string, check: boolean): Promise<boolean> {
  const existing = existsSync(path) ? await readText(path) : "";
  // 라인 끝 정규화: 둘 다 \n 기준으로 비교 (Windows에서 git이 CRLF로 변환할 수 있음)
  const norm = (t: string) => t.replace(/\r\n/g, "\n");
  if (norm(existing) === norm(content)) return false;
  if (check) {
    console.error(`[codegen] DRIFT: ${path}`);
    return true;
  }
  await mkdir(dirname(path), { recursive: true });
  await nodeWriteFile(path, content, "utf8");
  console.log(`[codegen] wrote ${path}`);
  return true;
}

async function loadLock() {
  if (!existsSync(LOCK_PATH)) return null;
  return parseLock(await readText(LOCK_PATH));
}

/** --base-lock <path>의 lock 대비 위반. 경로가 없으면(base에 lock이 아직 없음) 생략. */
async function baseLockViolations(ast: SchemaAst): Promise<string[]> {
  const i = process.argv.indexOf("--base-lock");
  if (i < 0) return [];
  const path = process.argv[i + 1];
  if (path === undefined || !existsSync(path)) {
    console.log("[codegen] base lock 없음 — base 비교 생략");
    return [];
  }
  return evaluateBaseLock(ast, parseLock(await readText(path)));
}

/** 합성 스키마 산출물 — C# 픽스처 타입·코덱(EditMode 시험 어셈블리) + 교차 언어 골든(실물 + 픽스처). */
function fixtureOutputs(real: SchemaAst): [string, string][] {
  const fx = fixtureAst();
  const fxHash = simpleHash(JSON.stringify(fixtureRaw()));
  const opts = { namespace: FIXTURE_CS_NAMESPACE, source: FIXTURE_SOURCE };
  return [
    [resolve(FIXTURE_CS_DIR, "WireFixture.Types.Generated.cs"), emitCsTypes(fx, fxHash, opts)],
    [resolve(FIXTURE_CS_DIR, "WireFixture.Codec.Generated.cs"), emitCsCodec(fx, fxHash, opts)],
    [GOLDEN_OUT_PATH, serializeGolden(buildGolden(real, fx))],
  ];
}

async function main() {
  const check = process.argv.includes("--check");
  if (!existsSync(SCHEMA_PATH)) {
    console.error(`schema not found: ${SCHEMA_PATH}`);
    process.exit(2);
  }
  const schemaText = await readText(SCHEMA_PATH);
  const ast = parseSchema(JSON.parse(schemaText));
  const verdict = evaluateLock(ast, await loadLock());
  const violations = [...verdict.violations, ...(await baseLockViolations(ast))];
  if (violations.length > 0) {
    console.error(`[codegen] FAIL: packets.lock.json 위반 ${violations.length}건:`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  if (check && verdict.mode !== "same") {
    console.error(`[codegen] FAIL: packets.lock.json이 ${verdict.mode === "fresh" ? "없다" : "protoVersion보다 낡았다"} — \`bun run gen\` 후 커밋.`);
    process.exit(1);
  }
  const hash = simpleHash(schemaText);
  const outputs: [string, string][] = [
    [TS_OUT_PATH, emitTsTypes(ast, hash)],
    [TS_CODEC_OUT_PATH, emitTsCodec(ast, hash)],
    [CS_OUT_PATH, emitCsTypes(ast, hash)],
    [CS_CODEC_OUT_PATH, emitCsCodec(ast, hash)],
    [LOCK_PATH, serializeLock(verdict.next)],
    ...fixtureOutputs(ast),
  ];
  let changed = 0;
  for (const [path, content] of outputs) if (await writeIfChanged(path, content, check)) changed++;
  if (check && changed > 0) {
    console.error("[codegen] FAIL: 산출물이 스키마와 어긋남. `bun run gen` 실행 후 커밋.");
    process.exit(1);
  }
  console.log(check ? "[codegen] OK: 산출물·lock 최신." : `[codegen] done. ${changed} file(s) updated (lock: ${verdict.mode}).`);
}

main().catch((e) => {
  if (e instanceof SchemaError) console.error(`[codegen] ${e.message}`);
  else console.error("[codegen] error:", e);
  process.exit(2);
});
