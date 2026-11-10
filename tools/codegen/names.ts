// 코드젠 이름 규칙 — 스키마 이름(패킷 SCREAMING_SNAKE, struct·enum PascalCase, 필드 camelCase)을 산출물 식별자로 바꾼다.

/** 패킷명 SCREAMING_SNAKE("CS_LOGIN") → "CsLogin", camelCase("targetId") → "TargetId". */
export function toPascalCase(s: string): string {
  return s
    .split(/[_\s-]/)
    .filter(Boolean)
    .map((part) => {
      const isAllUpper = /^[A-Z0-9]+$/.test(part);
      const rest = isAllUpper ? part.slice(1).toLowerCase() : part.slice(1);
      return part.charAt(0).toUpperCase() + rest;
    })
    .join("");
}

/** PascalCase·camelCase → SCREAMING_SNAKE("SnapshotUpdate" → "SNAPSHOT_UPDATE", "entityId" → "ENTITY_ID"). 이미 SCREAMING이면 그대로. */
export function toScreamingSnake(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toUpperCase();
}

/** 패킷 페이로드 타입명(TS interface·C# class). */
export function payloadTypeName(packetName: string): string {
  return `${toPascalCase(packetName)}Payload`;
}

/** 패킷 0x… 표기(4자리 대문자 hex). */
export function hexId(id: number): string {
  return `0x${id.toString(16).padStart(4, "0").toUpperCase()}`;
}
