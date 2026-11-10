// 수신 문자열의 표시 위험 문자 — 엄격 UTF-8 디코더(wire/runtime)는 유효한 스칼라 값이면 다 받으므로, 다른 클라 화면에 그대로 나가는
// 문자열(채팅 본문 — chatSayHandler.sanitizeText가 지운다)과 표시되는 이름(계정 이름 — loginFlow.isValidUsername이 거부한다, DevAuto
// 캐릭터명이 된다)에서 보이지 않거나 표시 순서·줄을 바꾸는 문자를 막는다(이진 전환 B2c).
// 집합 = Unicode 범주 Cc(C0·DEL·C1)·Cf(서식 전부 — BiDi·제로폭·BOM·소프트 하이픈·보조평면 태그 문자 등)·Zl·Zp(줄·문단 구분자)
//   + 한글 채움 문자 U+115F·U+1160·U+3164·U+FFA0(범주 Lo지만 보이지 않는 이름·빈 채팅 위장에 흔히 쓰인다).
// 코드 포인트 단위(u 플래그)라 보조평면 문자도 잡고 서로게이트 쌍을 가르지 않는다(입력은 엄격 UTF-8 디코드라 짝 없는 서로게이트가 없다).
// ZWJ(U+200D, Cf)도 지우므로 이모지 ZWJ 시퀀스는 낱개 이모지로 보인다(감수). 결합 문자 연쇄·변형 선택자·사용자 영역(Co)·미할당(Cn)은 정당한
// 쓰임과 갈리는 정책 판단이라 지우지 않는다(후속 — ADR 0003 B2c). 의존성 없음(순수 함수).

const UNSAFE_ONE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}ᅟᅠㅤﾠ]/u;
const UNSAFE_ALL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}ᅟᅠㅤﾠ]/gu;

/** 표시 위험 코드 포인트인가(위 집합). 서로게이트 코드 포인트(U+D800–DFFF)는 집합 밖이다. */
export function isDisplayUnsafeCodePoint(cp: number): boolean {
  return UNSAFE_ONE.test(String.fromCodePoint(cp));
}

/** 위 집합의 문자를 하나라도 포함하는가. */
export function hasDisplayUnsafe(s: string): boolean {
  return UNSAFE_ONE.test(s);
}

/** 위 집합을 지운 문자열 — 지울 것이 없으면 입력을 그대로 돌려준다(할당 없음). */
export function stripDisplayUnsafe(s: string): string {
  return UNSAFE_ONE.test(s) ? s.replace(UNSAFE_ALL, "") : s;
}
