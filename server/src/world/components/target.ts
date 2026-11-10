// G-4-3: 타겟 컴포넌트 — 공격하는 entity가 소유 (Map<attackerEntityId, TargetComponent>).
//
// TARGET_SELECT로 targetId 지정, ATTACK_START로 attacking=true.
// combatSystem이 attacking일 때만 nextAttackTickIndex 간격으로 공격.
// 몬스터 반격도 같은 컴포넌트로 표현 (몬스터 entityId를 key로 attacking=true).

export interface TargetComponent {
  /**
   * 대상 entityId. 0은 비유효(컴포넌트 자체를 지움). readonly — table.targets(TargetMap)의 역인덱스가
   * set 시점 값으로 유지되므로 대상 교체는 새 컴포넌트를 set한다.
   */
  readonly targetId: number;
  /** 자동 공격 활성 여부. TARGET_SELECT만으로는 false, ATTACK_START로 true. */
  attacking: boolean;
  /** 이 tick 이상부터 다음 공격 가능. */
  nextAttackTickIndex: number;
}

export function makeTarget(targetId: number, attacking = false): TargetComponent {
  return { targetId, attacking, nextAttackTickIndex: 0 };
}
