// 코덱 단위 선택 — TS(emitTsCodec.ts)·C#(emitCsCodec.ts) 생성기가 같은 단위 집합·순서를 쓰게 한 곳에 둔다(두 언어의 함수 집합이 어긋나면
// 교차 언어 골든 이전에 컴파일·링크 단계에서 갈라진다).

import { payloadTypeName, toPascalCase } from "./names";
import { packetStructs, type ElemType, type FieldDef, type PacketDef, type SchemaAst } from "./schema";

/** 코덱 단위 — 패킷(bodyOf 제외) 또는 패킷이 (직간접으로) 쓰는 struct. */
export interface CodecUnit {
  /** 함수 이름 꼬리(Size<fn>·Write<fn>·Read<fn>). */
  readonly fn: string;
  /** 페이로드·struct 타입 이름. */
  readonly typeName: string;
  /** 사람이 읽는 이름(패킷명·struct명) — 인코드 거부 경로의 앞부분. */
  readonly label: string;
  readonly fields: readonly FieldDef[];
  readonly isPacket: boolean;
}

/** 자기 레이아웃을 가진 패킷(bodyOf 제외 — bodyOf는 대상 단위를 쓴다). */
export function layoutPackets(ast: SchemaAst): PacketDef[] {
  return ast.packets.filter((p) => p.bodyOf === undefined);
}

/** struct 단위(첫 도달 순서) 뒤에 패킷 단위(선언 순서). */
export function codecUnits(ast: SchemaAst): CodecUnit[] {
  const units: CodecUnit[] = [];
  for (const name of packetStructs(ast)) {
    const s = ast.structs.get(name);
    if (s !== undefined) units.push({ fn: name, typeName: name, label: name, fields: s.fields, isPacket: false });
  }
  for (const p of layoutPackets(ast)) {
    units.push({ fn: toPascalCase(p.name), typeName: payloadTypeName(p.name), label: p.name, fields: p.fields, isPacket: true });
  }
  return units;
}

/** 단위 필드가 쓰는 enum(스키마 선언 순서). */
export function usedEnums(ast: SchemaAst, units: readonly CodecUnit[]): string[] {
  const used = new Set<string>();
  for (const u of units) {
    for (const f of u.fields) {
      const e = f.type.kind === "array" ? f.type.of : f.type;
      if (e.kind === "enum") used.add(e.name);
    }
  }
  return [...ast.enums.keys()].filter((n) => used.has(n));
}

export function isStringElem(t: ElemType): boolean {
  return t.kind === "prim" && t.prim === "string";
}
