// 합성 스키마(tools/codegen/fixture.ts)의 생성 TS 코덱을 임시 디렉터리에 내고 import한다 — emitFixture.test.ts(≡ refCodec 대조·typecheck)와
// wireGolden.test.ts(교차 언어 골든 대조)가 함께 쓴다. 런타임은 서버의 실물(server/src/net/wire/runtime.ts)을 그대로 import한다.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { emitTsCodec } from "../../../tools/codegen/emitTsCodec";
import { emitTsTypes } from "../../../tools/codegen/emitTsTypes";
import type { SchemaAst } from "../../../tools/codegen/schema";

export const REPO = resolve(import.meta.dir, "../../..");
export const RUNTIME = resolve(REPO, "server/src/net/wire/runtime.ts").replaceAll("\\", "/");

export interface GenCodec {
  bodySize(id: number, p: object): number;
  writeBody(id: number, p: object, out: Buffer, off: number): number;
  decodeBody(id: number, body: Uint8Array): object | null;
  decodeC2S(id: number, body: Uint8Array): unknown;
  [k: string]: unknown;
}

export interface Runtime {
  lastDecodeError(): number;
  bodyReader: { reset(body: Uint8Array): unknown };
  wireErrorName(code: number): string;
  NO_CODEC: symbol;
  WireEncodeError: new (...a: never[]) => Error;
}

export interface EmittedCodec {
  readonly dir: string;
  readonly gen: GenCodec;
  readonly rt: Runtime;
  dispose(): void;
}

/** ast의 codec.generated.ts·wireCodec.generated.ts를 임시 디렉터리에 쓰고 import한다. dispose()가 디렉터리를 지운다. */
export async function emitFixtureCodec(ast: SchemaAst, prefix: string): Promise<EmittedCodec> {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(dir, "codec.generated.ts"), emitTsTypes(ast, "fixture"));
  writeFileSync(join(dir, "wireCodec.generated.ts"), emitTsCodec(ast, "fixture", { runtimeImport: RUNTIME.replace(/\.ts$/, "") }));
  const gen = (await import(pathToFileURL(join(dir, "wireCodec.generated.ts")).href)) as GenCodec;
  const rt = (await import(RUNTIME.replace(/\.ts$/, ""))) as Runtime;
  return { dir, gen, rt, dispose: () => rmSync(dir, { recursive: true, force: true }) };
}
