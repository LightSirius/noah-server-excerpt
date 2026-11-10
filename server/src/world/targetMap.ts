// table.targets 저장소 — 공격자 entityId → TargetComponent 순방향 Map + 역인덱스(대상 → 공격자 Set).
//
// 순방향은 일반 Map 그대로다. 같은 키 재설정은 제자리 갱신(삽입 순서 유지)이고, 삭제·삽입 순서가 전투
// 순회 결정론(combatSystem)을 정한다. 역인덱스는 handleKill의 "victim을 노리던 공격자 제거"를 전체 스캔
// O(T) 대신 O(공격자 수)로 만든다. 남은 항목 순서는 Map 삭제가 바꾸지 않으므로 스캔과 결과가 같다.
// 불변식: TargetComponent.targetId는 readonly — 대상 교체는 반드시 set(새 컴포넌트)으로 한다.

import type { EntityId } from "./entityTable";
import type { TargetComponent } from "./components/target";

const NO_ATTACKERS: ReadonlySet<EntityId> = new Set();

export class TargetMap extends Map<EntityId, TargetComponent> {
  private readonly byTarget = new Map<EntityId, Set<EntityId>>();

  override set(attackerId: EntityId, target: TargetComponent): this {
    const prev = super.get(attackerId);
    if (prev === undefined || prev.targetId !== target.targetId) {
      if (prev !== undefined) this.unindex(attackerId, prev.targetId);
      let attackers = this.byTarget.get(target.targetId);
      if (attackers === undefined) {
        attackers = new Set();
        this.byTarget.set(target.targetId, attackers);
      }
      attackers.add(attackerId);
    }
    return super.set(attackerId, target);
  }

  override delete(attackerId: EntityId): boolean {
    const prev = super.get(attackerId);
    if (prev === undefined) return false;
    this.unindex(attackerId, prev.targetId);
    return super.delete(attackerId);
  }

  override clear(): void {
    this.byTarget.clear();
    super.clear();
  }

  /** targetId를 노리는 공격자(순서 무의미 — 결정론 경로는 순방향 Map 순회만 쓴다). */
  attackersOf(targetId: EntityId): ReadonlySet<EntityId> {
    return this.byTarget.get(targetId) ?? NO_ATTACKERS;
  }

  /** targetId를 노리던 항목 전부 제거. 남은 항목의 순서는 그대로. */
  deleteAttackersOf(targetId: EntityId): void {
    const attackers = this.byTarget.get(targetId);
    if (attackers === undefined) return;
    this.byTarget.delete(targetId);
    for (const aid of attackers) super.delete(aid);
  }

  private unindex(attackerId: EntityId, targetId: EntityId): void {
    const attackers = this.byTarget.get(targetId);
    if (attackers === undefined) return;
    attackers.delete(attackerId);
    if (attackers.size === 0) this.byTarget.delete(targetId);
  }
}
