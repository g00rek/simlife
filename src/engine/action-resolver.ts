/**
 * Action resolvers — arrival and completion handlers for all entity actions.
 *
 * Extracted from world.ts (R5 refactor). Every function here has the same
 * signature it had before the move — the only change is import paths.
 */
import type {
  Entity, Animal, Tree, House, Biome, Village, TribeId,
  Activity, Action, GoldDeposit, LogEntry, DeathCause,
} from './types';
import { ACTION_DURATION, ECONOMY, HOUSE_SIZE, HUNT_KILL_RANGE } from './types';
import { manhattan } from './geometry';

// ── Shared type aliases ─────────────────────────────────────────────
export type LogEventFn = (e: Entity, type: LogEntry['type'], extra?: { cause?: DeathCause; detail?: string }) => void;
export type GetVillageFn = (tribe: TribeId) => Village | undefined;
export type GenerateIdFn = (prefix?: string) => string;

// ── Activity helpers ────────────────────────────────────────────────
export const IDLE: Activity = { kind: 'idle' };

export function startWork(action: Action): Activity {
  return { kind: 'working', action, ticksLeft: ACTION_DURATION[action] };
}

/** Check if a house can be placed at (x,y) as top-left corner */
export function isValidBuildSite(
  x: number, y: number,
  biomes: Biome[][], gridSize: number,
  houses: House[], villages: Village[],
): boolean {
  const S = HOUSE_SIZE;
  const gap = S + 1; // house size + 1 tile gap
  // Check house area + 1-tile buffer
  for (let dy = -1; dy <= S; dy++) {
    for (let dx = -1; dx <= S; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) return false;
      const b = biomes[ny][nx];
      // Inner area must be plains
      if (dx >= 0 && dx < S && dy >= 0 && dy < S) {
        if (b !== 'plains') return false;
      }
      // Buffer must not be water
      if (b === 'water') return false;
    }
  }
  // At least 2 tiles from stockpile
  for (const v of villages) {
    if (!v.stockpile) continue;
    if (Math.abs(v.stockpile.x - x) < S + 2 && Math.abs(v.stockpile.y - y) < S + 2) return false;
  }
  // No overlap with existing houses (require 1-tile gap)
  for (const h of houses) {
    if (Math.abs(h.position.x - x) < gap && Math.abs(h.position.y - y) < gap) return false;
  }
  return true;
}

// ── Helper — eat directly from gathered/hunted resources to top up energy ──
export function eatDirectlyToThreshold(
  entity: Entity, portionEnergy: number, availablePortions: number,
): { entity: Entity; remainingPortions: number } {
  let remaining = availablePortions;
  let energy = entity.energy;
  while (remaining > 0 && energy < ECONOMY.metabolism.hungerThreshold) {
    energy = Math.min(ECONOMY.metabolism.energyMax, energy + portionEnergy);
    remaining--;
  }
  if (energy === entity.energy) return { entity, remainingPortions: remaining };
  return { entity: { ...entity, energy }, remainingPortions: remaining };
}

// ── Goal arrival resolvers ──────────────────────────────────────────
// One per goal.type. Each takes the entity (with goal already cleared) plus
// whatever world state it needs to mutate, and returns the updated entity.
// Mutations to shared arrays (animals, trees, villages) happen in-place.

// Hunt arrival: if there's prey adjacent and hands are empty, enter 'hunting' work state.
// The actual kill + carrying fires when the work finishes (see completeHunting).
export function resolveHuntArrival(entity: Entity, animals: Animal[]): Entity {
  if (entity.carrying && entity.carrying.amount > 0) return { ...entity, activity: IDLE };
  const hasPrey = animals.some(a => manhattan(a.position, entity.position) <= HUNT_KILL_RANGE);
  if (!hasPrey) return { ...entity, activity: IDLE };
  return { ...entity, activity: startWork('hunting') };
}

// Gather arrival: if there's a fruit tree on this tile, enter 'gathering' work state.
export function resolveGatherArrival(entity: Entity, trees: Tree[]): Entity {
  const hasFruitHere = trees.some(tr =>
    tr.hasFruit && tr.fruitPortions > 0 &&
    tr.position.x === entity.position.x && tr.position.y === entity.position.y
  );
  if (!hasFruitHere) return { ...entity, activity: IDLE };
  return { ...entity, activity: startWork('gathering') };
}

export function resolveChopArrival(entity: Entity, trees: Tree[], biomes: Biome[][]): Entity {
  const onForest = biomes[entity.position.y][entity.position.x] === 'forest';
  const standingTreeHere = trees.some(t =>
    !t.chopped && t.position.x === entity.position.x && t.position.y === entity.position.y
  );
  if (!onForest || !standingTreeHere) return { ...entity, activity: IDLE };
  return { ...entity, activity: startWork('chopping') };
}

// Mining: miner arrives at an adjacent passable tile (mountain is impassable),
// finds a deposit with remaining > 0 on the target mountain tile, starts work.
export function resolveMineArrival(
  entity: Entity,
  goldDeposits: GoldDeposit[],
  biomes: Biome[][],
): Entity {
  if (entity.activity.kind !== 'moving') return entity;
  const target = entity.activity.target;
  if (manhattan(entity.position, target) > 1) return { ...entity, activity: IDLE };
  if (biomes[target.y]?.[target.x] !== 'mountain') return { ...entity, activity: IDLE };
  const deposit = goldDeposits.find(d =>
    d.position.x === target.x && d.position.y === target.y && d.remaining > 0
  );
  if (!deposit) return { ...entity, activity: IDLE };
  return { ...entity, activity: startWork('mining') };
}

export function resolveBuildArrival(
  entity: Entity, biomes: Biome[][], gridSize: number,
  houses: House[], villages: Village[], getVillage: GetVillageFn,
): Entity {
  const v = getVillage(entity.tribe);
  if (!v || v.woodStore < ECONOMY.wood.houseCost) return { ...entity, activity: IDLE };
  if (!isValidBuildSite(entity.position.x, entity.position.y, biomes, gridSize, houses, villages)) return { ...entity, activity: IDLE };
  v.woodStore -= ECONOMY.wood.houseCost;
  return { ...entity, activity: startWork('building') };
}

export function resolveCookArrival(entity: Entity, getVillage: GetVillageFn): Entity {
  const v = getVillage(entity.tribe);
  const hasRaw = v && (v.meatStore > 0 || v.plantStore > 0);
  if (!hasRaw) return { ...entity, activity: IDLE };
  return { ...entity, activity: startWork('cooking') };
}

// ── Work completion handlers — fire when activity.ticksLeft hits 0 ──
// Each returns the updated entity (activity cleared to idle) + any side effects.

export function completeHunting(entity: Entity, animals: Animal[], logEvent: LogEventFn): Entity {
  if (entity.carrying && entity.carrying.amount > 0) return { ...entity, activity: IDLE };
  const preyIdx = animals.findIndex(a => manhattan(a.position, entity.position) <= HUNT_KILL_RANGE);
  if (preyIdx < 0) return { ...entity, activity: IDLE };
  animals.splice(preyIdx, 1);
  const direct = eatDirectlyToThreshold(entity, ECONOMY.meat.energyPerUnit, ECONOMY.meat.unitsPerHunt);
  const updated: Entity = {
    ...direct.entity,
    activity: IDLE,
    carrying: { type: 'meat' as const, amount: direct.remainingPortions },
  };
  logEvent(updated, 'hunt');
  return updated;
}

export function completeGathering(entity: Entity, trees: Tree[]): Entity {
  const treeIdx = trees.findIndex(tr =>
    tr.hasFruit && tr.fruitPortions > 0 &&
    tr.position.x === entity.position.x && tr.position.y === entity.position.y
  );
  if (treeIdx < 0) return { ...entity, activity: IDLE };
  trees[treeIdx] = {
    ...trees[treeIdx],
    fruitPortions: trees[treeIdx].fruitPortions - 1,
    hasFruit: trees[treeIdx].fruitPortions > 1,
  };
  const direct = eatDirectlyToThreshold(entity, ECONOMY.fruit.energyPerUnit, ECONOMY.fruit.unitsPerPick);
  const carrying = direct.remainingPortions > 0
    ? { type: 'fruit' as const, amount: direct.remainingPortions }
    : undefined;
  return { ...direct.entity, activity: IDLE, carrying };
}

export function completeChopping(entity: Entity, trees: Tree[], tickNum: number, logEvent: LogEventFn): Entity {
  const treeIdx = trees.findIndex(t =>
    !t.chopped && t.position.x === entity.position.x && t.position.y === entity.position.y
  );
  if (treeIdx >= 0) {
    trees[treeIdx] = { ...trees[treeIdx], chopped: true, choppedAt: tickNum, hasFruit: false, fruitPortions: 0 };
  }
  logEvent(entity, 'chop', { detail: `+${ECONOMY.wood.unitsPerChop} wood` });
  return {
    ...entity,
    activity: IDLE,
    energy: Math.max(0, entity.energy - 10),
    carrying: { type: 'wood' as const, amount: ECONOMY.wood.unitsPerChop },
  };
}

export function completeMining(
  entity: Entity,
  goldDeposits: GoldDeposit[],
  tickNum: number,
  logEvent: LogEventFn,
): Entity {
  const depositIdx = goldDeposits.findIndex(d =>
    d.remaining > 0 && manhattan(entity.position, d.position) === 1
  );
  if (depositIdx < 0) {
    return { ...entity, activity: IDLE, energy: Math.max(0, entity.energy - 5) };
  }
  const deposit = goldDeposits[depositIdx];
  const take = Math.min(ECONOMY.gold.unitsPerMine, deposit.remaining);
  goldDeposits[depositIdx] = {
    ...deposit,
    remaining: deposit.remaining - take,
    depletedAt: deposit.remaining - take <= 0 ? tickNum : deposit.depletedAt,
  };
  logEvent(entity, 'mine', { detail: `+${take} gold` });
  return {
    ...entity,
    activity: IDLE,
    energy: Math.max(0, entity.energy - 10),
    carrying: { type: 'gold' as const, amount: take },
  };
}

export function completeBuilding(
  entity: Entity, biomes: Biome[][], gridSize: number,
  houses: House[], villages: Village[], logEvent: LogEventFn,
  generateId: GenerateIdFn,
): Entity {
  if (isValidBuildSite(entity.position.x, entity.position.y, biomes, gridSize, houses, villages)) {
    houses.push({
      id: generateId('h'),
      position: { ...entity.position },
      tribe: entity.tribe,
      occupants: [],
    });
    logEvent(entity, 'build_done', { detail: 'built a house' });
  }
  return { ...entity, activity: IDLE, energy: Math.max(0, entity.energy - 10) };
}

export function completeCooking(entity: Entity, getVillage: GetVillageFn, logEvent: LogEventFn): Entity {
  const v = getVillage(entity.tribe);
  if (v) {
    const batch = ECONOMY.cooking.batchSize;
    if (v.meatStore >= v.plantStore && v.meatStore > 0) {
      const n = Math.min(batch, v.meatStore);
      v.meatStore -= n;
      v.cookedMeatStore += n;
      logEvent(entity, 'gather', { detail: `cooked +${n} meat` });
    } else if (v.plantStore > 0) {
      const n = Math.min(batch, v.plantStore);
      v.plantStore -= n;
      v.driedFruitStore += n;
      logEvent(entity, 'gather', { detail: `dried +${n} fruit` });
    }
  }
  return { ...entity, activity: IDLE, energy: Math.max(0, entity.energy - 4) };
}

export function completeFighting(entity: Entity): Entity {
  // Fight outcome (who dies) resolved at start via paired detection — here just energy cost.
  return { ...entity, activity: IDLE, energy: Math.max(0, entity.energy - 20) };
}

// All deposits go to village stockpile (communal economy — no per-house pantries).
export function depositCarrying(entity: Entity, getVillage: GetVillageFn): Entity {
  const carrying = entity.carrying;
  if (!carrying || carrying.amount <= 0) return entity;
  const v = getVillage(entity.tribe);
  if (!v) return entity;
  if (carrying.type === 'meat') v.meatStore += carrying.amount;
  else if (carrying.type === 'fruit') v.plantStore += carrying.amount;
  else if (carrying.type === 'wood') v.woodStore += carrying.amount;
  else if (carrying.type === 'gold') v.goldStore += carrying.amount;
  return { ...entity, carrying: undefined };
}
