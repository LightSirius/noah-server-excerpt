// Phase 3 ECS-lite 토대.
//
// architecture.md §4.4: 외부 라이브러리 없이 entity table + component map.
// 시스템은 자기 컴포넌트 Map만 순회한다 (예: movementSystem은 positions+velocities).
//
// id는 단조증가 정수. 0은 "비-엔티티" 센티넬로 예약 (절대 발급 금지).

import type { Position } from "./components/position";
import type { Velocity } from "./components/velocity";
import type { Health } from "./components/health";
import type { Mana } from "./components/mana";
import type { MoveGoal } from "./components/moveGoal";
import type { MovePath } from "./components/movePath";
import type { MonsterComponent } from "./components/monster";
import type { MonsterAi } from "./components/monsterAi";
import type { CombatStats } from "./components/combatStats";
import type { PendingCast } from "./components/skillCast";
import type { PendingImpact } from "./components/pendingImpact";
import type { Inventory } from "./components/inventory";
import type { PendingItemUse } from "./components/pendingItemUse";
import type { GroundItem } from "./components/groundItem";
import type { PendingPickup } from "./components/pickupIntent";
import type { NpcComponent } from "./components/npc";
import type { ResourceNode } from "./components/resourceNode";
import type { LifeChannel } from "./components/lifeChannel";
import { TargetMap } from "./targetMap";
import { I32_MAX } from "../net/wire/runtime";

export type EntityId = number;
export const NULL_ENTITY: EntityId = 0;

/**
 * Phase G-4-4 fix: 몬스터 entityId 대역 시작점. 플레이어 entityId는 DB charId(AUTOINCREMENT, 1부터)를
 * 그대로 쓰므로(playerId==charId==entityId 규약), 몬스터가 create()로 작은 id를 받으면 charId와
 * 충돌한다(부트 시 스폰된 몬스터 id 1..N vs 입장하는 캐릭터 id). 몬스터는 이 base 위에서 발급해 분리.
 */
export const MONSTER_ID_BASE: EntityId = 1_000_000_000;

/**
 * Phase G-7: 지면 아이템 entityId 대역 시작점. player(charId, 1~)·monster(1e9~)와 분리.
 * 클라는 ENTITY_SPAWN의 type 필드("grounditem")로 분기.
 */
export const GROUND_ITEM_ID_BASE: EntityId = 2_000_000_000;

/**
 * NPC entityId 대역 시작점. monster(1e9~)와 grounditem(2e9~) 사이 — 3e9는 와이어
 * entityId(i32, ≤2_147_483_647)를 초과하므로 불가. 클라는 type 필드("npc")로 분기.
 */
export const NPC_ID_BASE: EntityId = 1_500_000_000;

/**
 * 생활 L-1: 채집 자원 노드 entityId 대역 [1.8e9, GROUND_ITEM_ID_BASE) — NPC 대역(1.5e9~)의 위쪽 끝을 나눠 쓴다. 소진·리스폰마다 새 id라
 * 대역 안에서 순환한다(살아 있는 id는 건너뛴다). 노드는 자기 커서만 써서 플레이어·몬스터·NPC·지면 아이템 id 수열이 바뀌지 않는다.
 */
export const RESOURCE_NODE_ID_BASE: EntityId = 1_800_000_000;

// 와이어 entityId·SKILL_EFFECT.castId의 상한 = I32_MAX(net/wire/runtime — packets.json i32, 클라 int). 발급기가 넘기지 않는다.

/**
 * 컴포넌트 저장소. Map<EntityId, T>의 얇은 컬렉션.
 * 각 시스템은 자기 컴포넌트 store만 받아서 순회한다.
 */
export class EntityTable {
  private nextId: EntityId = 1;
  private nextMonsterId: EntityId = MONSTER_ID_BASE;
  private nextGroundItemId: EntityId = GROUND_ITEM_ID_BASE;
  private nextNpcId: EntityId = NPC_ID_BASE;
  private nextNodeId: EntityId = RESOURCE_NODE_ID_BASE;
  /** G-9: 스킬 시전 인스턴스 id 시퀀스. entityId와 무관한 별도 대역(1~). */
  private nextCastIdSeq = 1;
  readonly alive = new Set<EntityId>();

  readonly positions = new Map<EntityId, Position>();
  readonly velocities = new Map<EntityId, Velocity>();
  readonly health = new Map<EntityId, Health>();
  /** Phase G-5: MP(마나). 플레이어가 보유(MVP 몬스터는 스킬 미시전). manaRegenSystem이 회복. */
  readonly mana = new Map<EntityId, Mana>();
  readonly moveGoals = new Map<EntityId, MoveGoal>();
  /** Phase F-3: 다중 waypoint path. moveGoal보다 우선. */
  readonly movePaths = new Map<EntityId, MovePath>();
  /** 걷는 중인 플레이어(INPUT_CMD.gait = walk) — 없으면 달리기. 입력을 소비할 때 갱신, 사망·부활에 유지, 존 이전은 transferPlayer가 옮긴다. */
  readonly walking = new Set<EntityId>();
  /** Phase G-4-3: monster entity 전용 컴포넌트. 플레이어 entity는 없음. */
  readonly monsters = new Map<EntityId, MonsterComponent>();
  /** Phase G-4-8: 몬스터 AI 런타임 상태(home/추격 상태). monsterAiSystem이 갱신. */
  readonly monsterAi = new Map<EntityId, MonsterAi>();
  /** Phase G-4-3: 전투 능력치. 전투 가능한 entity(플레이어+몬스터)가 보유. */
  readonly combatStats = new Map<EntityId, CombatStats>();
  /** Phase G-4-3: 공격 타겟. key=공격자 entityId. 역인덱스(대상 → 공격자) 내장 — 처치 시 O(공격자 수) 정리. */
  readonly targets = new TargetMap();
  /** Phase G-4-4: 사망 상태 entity(플레이어). 입력/공격 무시, 부활 시 해제. 시체는 좌표 보존. */
  readonly dead = new Set<EntityId>();
  /** Phase G-5: 대기 중 스킬 시전(최신 우선). skillSystem이 매 tick 소비 후 전체 clear. */
  readonly pendingCasts = new Map<EntityId, PendingCast>();
  /**
   * G-9: 시전 완료 후 데미지 반영만 남은 스킬(비행 중). key=시전자, value=시전 순 배열.
   * impactDelayMs>0인 스킬만 적재되고 resolveTick에 skillSystem이 해소·제거한다.
   */
  readonly pendingImpacts = new Map<EntityId, PendingImpact[]>();
  /** Phase G-5: 스킬 쿨다운. key=시전자, inner key=skillId, value=nextCastTickIndex. */
  readonly skillCooldowns = new Map<EntityId, Map<number, number>>();
  /**
   * Phase G-5b: 학습 보유 스킬. key=시전자 entityId, inner key=skillId, value=level(1~maxLevel).
   * 시전 권위 검증(NOT_LEARNED) + 레벨 계수의 단일 소스. tick 안에서는 읽기 전용 —
   * 변경은 tick 경계 밖(스폰 주입/학습 핸들러)에서만.
   */
  readonly learnedSkills = new Map<EntityId, Map<number, number>>();
  /** Phase G-7: 인벤토리 + 장비. 플레이어가 보유(MVP 몬스터는 미보유). */
  readonly inventories = new Map<EntityId, Inventory>();
  /** Phase G-7: 대기 중 소비 사용(최신 우선). itemSystem이 매 tick 소비 후 clear. */
  readonly pendingItemUses = new Map<EntityId, PendingItemUse>();
  /** Phase G-7: 소비 쿨다운. key=사용자, inner key=itemId, value=nextUseTickIndex. */
  readonly itemCooldowns = new Map<EntityId, Map<number, number>>();
  /** Phase G-7: 지면 아이템(드롭). 새 엔티티 타입 "grounditem"으로 AOI/snapshot 통합. */
  readonly groundItems = new Map<EntityId, GroundItem>();
  /** Phase G-7: 대기 중 줍기 의도(최신 우선). pickupSystem이 매 tick 소비 후 clear. */
  readonly pendingPickups = new Map<EntityId, PendingPickup>();
  /** NPC: 비전투 정적 상호작용 엔티티("npc"). velocity/health 미등록 — 시스템 자동 배제. */
  readonly npcs = new Map<EntityId, NpcComponent>();
  /** 생활 L-1: 채집 자원 노드("resource"). velocity/health 미등록 — 이동·전투·AI 시스템 자동 배제. */
  readonly nodes = new Map<EntityId, ResourceNode>();
  /** 생활 L-1: 진행 중 채집 채널. key = 플레이어 entityId. 노드 충전 예약 = 그 노드를 가리키는 채널 수. */
  readonly lifeChannels = new Map<EntityId, LifeChannel>();

  /** 새 entity id 발급. 컴포넌트는 별도 add. */
  create(): EntityId {
    const id = this.nextId++;
    this.alive.add(id);
    return id;
  }

  /** Phase G-7: 지면 아이템 전용 id 발급(대역 [GROUND_ITEM_ID_BASE, 2^31) 순환). player/monster와 비충돌. */
  createGroundItem(): EntityId {
    const id = this.nextInBand(this.nextGroundItemId, GROUND_ITEM_ID_BASE, I32_MAX + 1);
    this.nextGroundItemId = id + 1;
    this.alive.add(id);
    return id;
  }

  /** NPC 전용 id 발급(NPC_ID_BASE~). 부트 시 정렬된 placements 순회로만 호출(결정론). 노드 대역에 닿으면 throw(부팅 실패). */
  createNpc(): EntityId {
    const id = this.nextNpcId;
    if (id >= RESOURCE_NODE_ID_BASE) throw new Error("npc id band exhausted");
    this.nextNpcId = id + 1;
    this.alive.add(id);
    return id;
  }

  /** 생활 L-1: 채집 노드 전용 id 발급(대역 [RESOURCE_NODE_ID_BASE, GROUND_ITEM_ID_BASE) 순환). */
  createNode(): EntityId {
    const id = this.nextInBand(this.nextNodeId, RESOURCE_NODE_ID_BASE, GROUND_ITEM_ID_BASE);
    this.nextNodeId = id + 1;
    this.alive.add(id);
    return id;
  }

  /**
   * Phase G-4-4 fix: 몬스터 전용 id 발급. MONSTER_ID_BASE 이상의 분리된 대역 → 플레이어 charId와
   * 절대 충돌하지 않음. zone.spawnMonster가 사용. 리스폰마다 새 id라 대역 [MONSTER_ID_BASE, NPC_ID_BASE)를 순환한다(NPC 대역 비침범).
   */
  createMonster(): EntityId {
    const id = this.nextInBand(this.nextMonsterId, MONSTER_ID_BASE, NPC_ID_BASE);
    this.nextMonsterId = id + 1;
    this.alive.add(id);
    return id;
  }

  /**
   * G-9: 스킬 시전 인스턴스 id 발급 — 텔레그래프↔임팩트 페어링용. tick 순서 단조증가(결정론). 와이어 SKILL_EFFECT.castId가 i32(클라 int)라
   * i32 최대 다음은 1로 순환한다 — 2^31-1번 앞의 시전이 아직 비행 중일 수는 없어 페어링이 겹치지 않는다(0은 클라의 "페어링 없음").
   */
  allocCastId(): number {
    const id = this.nextCastIdSeq;
    this.nextCastIdSeq = id >= I32_MAX ? 1 : id + 1;
    return id;
  }

  /**
   * 대역 [base, end)에서 start부터 처음 비어 있는(살아 있지 않은) id — end에 닿으면 base로 순환한다(결정론). 대역(몬스터 5억·지면 아이템
   * ≈1.47억)이 동시 생존 수보다 훨씬 커서 보통 첫 후보가 답이고, 순환 뒤에도 TTL·리스폰으로 이미 사라진 옛 id를 다시 쓴다.
   */
  private nextInBand(start: EntityId, base: EntityId, end: EntityId): EntityId {
    let id = start >= end ? base : start;
    for (let left = end - base; left > 0; left--) {
      if (!this.alive.has(id)) return id;
      id = id + 1 >= end ? base : id + 1;
    }
    throw new Error(`entity id band [${base}, ${end}) exhausted`);
  }

  /** 시험용 — 다음 발급 id(순환 경계 검증). */
  setNextIdsForTest(next: { castId?: number; monster?: EntityId; groundItem?: EntityId; npc?: EntityId; node?: EntityId }): void {
    if (next.castId !== undefined) this.nextCastIdSeq = next.castId;
    if (next.monster !== undefined) this.nextMonsterId = next.monster;
    if (next.groundItem !== undefined) this.nextGroundItemId = next.groundItem;
    if (next.npc !== undefined) this.nextNpcId = next.npc;
    if (next.node !== undefined) this.nextNodeId = next.node;
  }

  /** 외부 권위 id(예: DB charId)를 그대로 등록. create()와의 후속 충돌 방지를 위해 nextId 전진. */
  register(id: EntityId): void {
    this.alive.add(id);
    if (id >= this.nextId) this.nextId = id + 1;
  }

  destroy(id: EntityId): void {
    if (!this.alive.delete(id)) return;
    this.positions.delete(id);
    this.velocities.delete(id);
    this.health.delete(id);
    this.mana.delete(id);
    this.moveGoals.delete(id);
    this.movePaths.delete(id);
    this.walking.delete(id);
    this.monsters.delete(id);
    this.monsterAi.delete(id);
    this.combatStats.delete(id);
    this.targets.delete(id);
    this.dead.delete(id);
    this.pendingCasts.delete(id);
    this.pendingImpacts.delete(id);
    this.skillCooldowns.delete(id);
    this.learnedSkills.delete(id);
    this.inventories.delete(id);
    this.pendingItemUses.delete(id);
    this.itemCooldowns.delete(id);
    this.groundItems.delete(id);
    this.pendingPickups.delete(id);
    this.npcs.delete(id);
    this.nodes.delete(id);
    this.lifeChannels.delete(id);
  }

  /** 결정론 회귀용 — 다음 id를 명시 설정. 테스트 외 사용 금지. */
  resetForTest(nextId: EntityId): void {
    this.alive.clear();
    this.positions.clear();
    this.velocities.clear();
    this.health.clear();
    this.mana.clear();
    this.moveGoals.clear();
    this.movePaths.clear();
    this.walking.clear();
    this.monsters.clear();
    this.monsterAi.clear();
    this.combatStats.clear();
    this.targets.clear();
    this.dead.clear();
    this.pendingCasts.clear();
    this.pendingImpacts.clear();
    this.skillCooldowns.clear();
    this.learnedSkills.clear();
    this.inventories.clear();
    this.pendingItemUses.clear();
    this.itemCooldowns.clear();
    this.groundItems.clear();
    this.pendingPickups.clear();
    this.npcs.clear();
    this.nodes.clear();
    this.lifeChannels.clear();
    this.nextId = nextId;
    this.nextMonsterId = MONSTER_ID_BASE;
    this.nextGroundItemId = GROUND_ITEM_ID_BASE;
    this.nextNpcId = NPC_ID_BASE;
    this.nextNodeId = RESOURCE_NODE_ID_BASE;
    this.nextCastIdSeq = 1;
  }
}
