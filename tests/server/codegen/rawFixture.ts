// 시험이 합성 스키마 원본을 경로 그대로 변형하도록 느슨한 타입으로 감싼다 — tools 코드(tools/codegen/fixture.ts)에는 any를 두지 않는다.

import { fixtureRaw as fixtureSchema } from "../../../tools/codegen/fixture";

export type Raw = Record<string, any>;

/** 합성 스키마 원본(시험마다 새 객체 — 변형해도 다른 시험에 새지 않는다). 검증은 parseSchema가 한다. */
export function fixtureRaw(): Raw {
  return fixtureSchema() as Raw;
}
