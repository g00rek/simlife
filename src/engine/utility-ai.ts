import type { Entity, EntityGoal, Position, Animal, Tree, House, Village, Biome, Gender } from './types';
import {
  CHILD_AGE,
  ANIMAL_HUNT_MIN_POPULATION, scaled,
  FOOD_RESERVE_MIN,
  FOOD_RESERVE_PER_PERSON,
  HUNGER_THRESHOLD,
  NEAR_HOME_RANGE,
  HOUSE_CAPACITY,
  HOUSE_WOOD_COST,
  HOUSE_SIZE,
} from './types';
import { ageInYears, isValid3x3BuildSite } from './world';

// --- Role configuration ---
export interface RoleConfig {
  actions: Record<string, number>;
}

export const ROLES: Record<Gender, RoleConfig> = {
  female: {
    actions: { gather: 1.0, return_home: 1.0, rest: 1.0, play: 1.0 }
  },
  male: {
    actions: { hunt: 1.0, chop: 0.7, build: 0.85, return_home: 1.0, rest: 1.0, play: 1.0 }
  },
};

// --- Action types ---
export type AIAction =
  | { type: 'rest' }
  | { type: 'eat' }
  | { type: 'go_chop'; target: Position }
  | { type: 'go_hunt'; target: Position }
  | { type: 'go_build'; target: Position }
  | { type: 'return_home' }
  | { type: 'go_gather'; target: Position }
  | { type: 'wander' }
  | { type: 'play' };           // random step near houses

// --- Context for scoring ---
export interface AIContext {
  entity: Entity;
  village?: Village;
  nearHome: boolean;
  homeTarget?: Position;
  nearestAnimal?: { pos: Position; dist: number };
  animalHerdCenter?: Position; // center of mass of all animals (for long-range tracking)
  nearestFruitTree?: { pos: Position; dist: number };
  nearestForest?: { pos: Position; dist: number };
  villageNeedsHouses: boolean;
  nearestBuildSite?: { pos: Position; dist: number };
  tribePopulation: number;
  animalPopulation: number;
  gridSize: number;
}

const PANIC_MEAT_THRESHOLD = 20;
const PANIC_PLANT_THRESHOLD = 20;

// --- Scoring functions (0-1, higher = more urgent) ---

function foodReserveTarget(ctx: AIContext): number {
  return Math.max(FOOD_RESERVE_MIN, ctx.tribePopulation * FOOD_RESERVE_PER_PERSON);
}

function totalVillageFood(ctx: AIContext): number {
  if (!ctx.village) return 0;
  return ctx.village.meatStore + ctx.village.plantStore;
}

function survivalForageAction(ctx: AIContext, survivalScore: number): AIAction | undefined {
  if (survivalScore === 0) return undefined;

  // Nearest food source — plant first (both genders), then hunt for males
  if (ctx.nearestFruitTree) return { type: 'go_gather', target: ctx.nearestFruitTree.pos };
  if (ctx.entity.gender === 'male' && ctx.nearestAnimal
      && ctx.animalPopulation > scaled(ANIMAL_HUNT_MIN_POPULATION, ctx.gridSize, 2)) {
    return { type: 'go_hunt', target: ctx.nearestAnimal.pos };
  }
  if (ctx.nearestForest) return { type: 'go_gather', target: ctx.nearestForest.pos };

  if (!ctx.nearHome && ctx.village && totalVillageFood(ctx) > 0) {
    return { type: 'return_home' };
  }

  if (!ctx.nearHome) return { type: 'wander' };
  return undefined;
}

function scoreSurvival(ctx: AIContext): number {
  const hungerThreshold = ctx.entity.hungerThreshold ?? HUNGER_THRESHOLD;
  if (ctx.entity.energy < 20) return 1.0;
  if (ctx.entity.energy < hungerThreshold) return 0.6;
  return 0;
}

function scoreBuildHome(ctx: AIContext): number {
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.villageNeedsHouses) return 0;
  if (!ctx.village || ctx.village.woodStore < HOUSE_WOOD_COST) return 0; // not enough wood yet → go chop
  return 0.85;
}

function scoreChopFirewood(ctx: AIContext): number {
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.village) return 0;
  // Only chop if village actually needs wood (for building houses)
  if (!ctx.villageNeedsHouses && ctx.village.woodStore >= HOUSE_WOOD_COST) return 0;
  const woodTarget = ctx.villageNeedsHouses ? HOUSE_WOOD_COST * 2 : HOUSE_WOOD_COST; // enough for 1-2 houses
  if (ctx.village.woodStore >= woodTarget) return 0;
  const woodNeed = (woodTarget - ctx.village.woodStore) / woodTarget;
  return woodNeed * 0.5;
}

function scoreHunt(ctx: AIContext): number {
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.village) return 0;
  if (ctx.animalPopulation <= scaled(ANIMAL_HUNT_MIN_POPULATION, ctx.gridSize, 2)) return 0;
  const target = foodReserveTarget(ctx);
  const totalFood = totalVillageFood(ctx);
  const foodNeed = Math.max(0, (target - totalFood) / target);
  const panicBoost = ctx.village.meatStore < PANIC_MEAT_THRESHOLD ? 0.25 : 0;
  // Always hunt with at least 0.2 score — men are hunters, it's their job
  return Math.min(1, Math.max(0.2, foodNeed * 0.9 + panicBoost));
}

function scoreGather(ctx: AIContext): number {
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.village) return 0;
  const target = foodReserveTarget(ctx);
  const totalFood = totalVillageFood(ctx);
  const foodNeed = Math.max(0, (target - totalFood) / target);
  const panicBoost = ctx.village.plantStore < PANIC_PLANT_THRESHOLD ? 0.2 : 0;
  // Always gather if fruit trees visible — stockpile for winter
  const stockpileBoost = ctx.nearestFruitTree ? 0.3 : 0;
  return Math.min(1, Math.max(foodNeed * 0.6 + panicBoost, stockpileBoost));
}

function scoreReturnHome(ctx: AIContext): number {
  if (!ctx.homeTarget || ctx.nearHome) return 0;
  return 0.4;
}

// --- Main decision function ---

// Exposed for debug
export function getScores(ctx: AIContext): Record<string, number> {
  return {
    survival: scoreSurvival(ctx),
    buildHome: scoreBuildHome(ctx),
    firewood: scoreChopFirewood(ctx),
    hunt: scoreHunt(ctx),
    gather: scoreGather(ctx),
    returnHome: scoreReturnHome(ctx),
  };
}

export function decideAction(ctx: AIContext): AIAction {
  const e = ctx.entity;

  // Children: return if far from home, play near houses
  if (ageInYears(e) < CHILD_AGE) {
    if (!ctx.nearHome && ctx.homeTarget) return { type: 'return_home' };
    return { type: 'play' };
  }

  const survScore = scoreSurvival(ctx);
  const survivalAction = survivalForageAction(ctx, survScore);

  // Score all actions
  const scores: Array<{ key: string; score: number; action: () => AIAction }> = [];

  // Survival — direct food in the field first; pantry/home is fallback.
  if (survivalAction) {
    scores.push({ key: 'survival', score: survScore, action: () => survivalAction });
  }

  // Build home — go to nearest valid build site
  const buildScore = scoreBuildHome(ctx);
  if (buildScore > 0) {
    if (ctx.nearestBuildSite) {
      scores.push({ key: 'build', score: buildScore, action: () => ({ type: 'go_build', target: ctx.nearestBuildSite!.pos }) });
    } else if (!ctx.nearHome) {
      scores.push({ key: 'build', score: buildScore, action: () => ({ type: 'return_home' }) });
    }
  }

  // Hunt — go directly to target
  const huntScore = scoreHunt(ctx);
  if (huntScore > 0) {
    if (ctx.nearestAnimal) {
      scores.push({ key: 'hunt', score: huntScore, action: () => ({ type: 'go_hunt', target: ctx.nearestAnimal!.pos }) });
    } else if (ctx.animalHerdCenter) {
      // Can't see animals but know where herd is — trek toward them
      scores.push({ key: 'hunt', score: huntScore * 0.7, action: () => ({ type: 'go_hunt', target: ctx.animalHerdCenter! }) });
    }
  }

  // Gather — go directly to target
  const gatherScore = scoreGather(ctx);
  if (gatherScore > 0) {
    if (ctx.nearestFruitTree) {
      scores.push({ key: 'gather', score: gatherScore, action: () => ({ type: 'go_gather', target: ctx.nearestFruitTree!.pos }) });
    } else if (ctx.nearestForest) {
      scores.push({ key: 'gather', score: gatherScore * 0.9, action: () => ({ type: 'go_gather', target: ctx.nearestForest!.pos }) });
    } else {
      scores.push({ key: 'gather', score: gatherScore * 0.8, action: () => ({ type: 'wander' }) });
    }
  }

  // Chop firewood — go directly to forest
  const firewoodScore = scoreChopFirewood(ctx);
  if (firewoodScore > 0) {
    if (ctx.nearestForest) {
      scores.push({ key: 'chop', score: firewoodScore, action: () => ({ type: 'go_chop', target: ctx.nearestForest!.pos }) });
    } else {
      scores.push({ key: 'chop', score: firewoodScore * 0.8, action: () => ({ type: 'wander' }) });
    }
  }

  // Return home (low priority default for distant entities)
  const returnScore = scoreReturnHome(ctx);
  if (returnScore > 0) {
    scores.push({ key: 'return_home', score: returnScore, action: () => ({ type: 'return_home' }) });
  }

  // Default: stroll around settlement
  if (ctx.nearHome) {
    scores.push({ key: 'play', score: 0.02, action: () => ({ type: 'play' }) });
  }

  // Absolute fallback
  scores.push({ key: 'rest', score: 0.01, action: () => ({ type: 'rest' }) });

  // Apply role weights — survival bypasses filter, everything else filtered by role
  const role = ROLES[e.gender];
  for (const s of scores) {
    if (s.key === 'survival') continue; // everyone can forage when starving
    s.score *= (role.actions[s.key] ?? 0);
  }

  // Pick highest score
  scores.sort((a, b) => b.score - a.score);
  return scores[0].action();
}

// --- Build context from world state ---

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function buildAIContext(
  entity: Entity,
  villages: Village[],
  animals: Animal[],
  trees: Tree[],
  entities: Entity[],
  biomes: Biome[][],
  gridSize: number,
  _tick: number = 0,
  houses: House[] = [],
): AIContext {
  const village = villages.find(v => v.tribe === entity.tribe);

  // nearHome: within NEAR_HOME_RANGE of any tribe house center
  const tribeHouses = houses.filter(h => h.tribe === entity.tribe);
  const houseCenter = (h: { position: Position }) => ({ x: h.position.x + Math.floor(HOUSE_SIZE / 2), y: h.position.y + Math.floor(HOUSE_SIZE / 2) });
  const nearHome = tribeHouses.some(h =>
    manhattan(entity.position, houseCenter(h)) <= NEAR_HOME_RANGE + 1
  );

  // homeTarget: own house center or nearest tribe house center
  let homeTarget: Position | undefined;
  if (entity.homeId) {
    const home = houses.find(h => h.id === entity.homeId);
    if (home) homeTarget = houseCenter(home);
  }
  if (!homeTarget && tribeHouses.length > 0) {
    let bestDist = Infinity;
    for (const h of tribeHouses) {
      const center = houseCenter(h);
      const d = manhattan(entity.position, center);
      if (d < bestDist) { bestDist = d; homeTarget = center; }
    }
  }

  const sense = Math.floor(3 + entity.traits.perception * 2);

  // Find nearest animal
  let nearestAnimal: AIContext['nearestAnimal'];
  for (const a of animals) {
    const d = Math.abs(a.position.x - entity.position.x) + Math.abs(a.position.y - entity.position.y);
    if (d > 0 && d <= sense && (!nearestAnimal || d < nearestAnimal.dist)) {
      nearestAnimal = { pos: a.position, dist: d };
    }
  }

  // Animal herd center of mass (for long-range hunting trips)
  let animalHerdCenter: Position | undefined;
  if (animals.length > 0) {
    let cx = 0, cy = 0;
    for (const a of animals) { cx += a.position.x; cy += a.position.y; }
    animalHerdCenter = { x: Math.round(cx / animals.length), y: Math.round(cy / animals.length) };
  }

  // Find nearest fruit tree with available fruit
  let nearestFruitTree: AIContext['nearestFruitTree'];
  const fruitSense = sense * 3; // fruit trees visible from further away
  for (const t of trees) {
    if (!t.hasFruit || t.fruitPortions <= 0) continue;
    const d = Math.abs(t.position.x - entity.position.x) + Math.abs(t.position.y - entity.position.y);
    if (d > 0 && d <= fruitSense && (!nearestFruitTree || d < nearestFruitTree.dist)) {
      nearestFruitTree = { pos: t.position, dist: d };
    }
  }

  // Find nearest standing (not chopped) tree
  let nearestForest: AIContext['nearestForest'];
  for (const tr of trees) {
    if (tr.chopped) continue;
    const d = Math.abs(tr.position.x - entity.position.x) + Math.abs(tr.position.y - entity.position.y);
    if (d > 0 && (!nearestForest || d < nearestForest.dist)) {
      nearestForest = { pos: tr.position, dist: d };
    }
  }

  // Village needs houses: homeless adults > free slots + houses being built
  const tribeHousesForVillage = village
    ? houses.filter(h => h.tribe === village.tribe)
    : [];
  const totalFreeSlots = tribeHousesForVillage.reduce((s, h) => s + (HOUSE_CAPACITY - h.occupants.length), 0);
  const housesBeingBuilt = village
    ? entities.filter(e => e.tribe === village.tribe && e.state === 'building').length
    : 0;
  const pendingSlots = totalFreeSlots + housesBeingBuilt * HOUSE_CAPACITY;
  const homelessAdults = village
    ? entities.filter(e => e.tribe === village.tribe && ageInYears(e) >= CHILD_AGE && !e.homeId).length
    : 0;
  const villageNeedsHouses = homelessAdults > pendingSlots;

  // Find nearest valid 3×3 build site
  let nearestBuildSite: AIContext['nearestBuildSite'];
  if (villageNeedsHouses && village) {
    // Anchor tiles: existing tribe houses (center) or stockpile
    const anchors: Position[] = tribeHouses.map(h => ({ x: h.position.x + Math.floor(HOUSE_SIZE / 2), y: h.position.y + Math.floor(HOUSE_SIZE / 2) }));
    if (anchors.length === 0 && village.stockpile) anchors.push(village.stockpile);

    // Search within distance 8 of anchors for valid 3×3 build sites
    const checked = new Set<string>();
    for (const anchor of anchors) {
      for (let dy = -8; dy <= 8; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          const nx = anchor.x + dx, ny = anchor.y + dy;
          const key = `${nx},${ny}`;
          if (checked.has(key)) continue;
          checked.add(key);
          if (nx < 0 || nx >= gridSize - HOUSE_SIZE + 1 || ny < 0 || ny >= gridSize - HOUSE_SIZE + 1) continue;
          if (!isValid3x3BuildSite(nx, ny, biomes, gridSize, houses, villages)) continue;
          const d = Math.abs(nx - entity.position.x) + Math.abs(ny - entity.position.y);
          if (!nearestBuildSite || d < nearestBuildSite.dist) {
            nearestBuildSite = { pos: { x: nx, y: ny }, dist: d };
          }
        }
      }
    }
  }

  const tribePopulation = village
    ? entities.filter(e => e.tribe === village.tribe).length
    : 0;
  return {
    entity,
    village,
    nearHome,
    homeTarget,
    nearestAnimal,
    animalHerdCenter,
    nearestFruitTree,
    nearestForest,
    villageNeedsHouses,
    nearestBuildSite,
    tribePopulation,
    animalPopulation: animals.length,
    gridSize,
  };
}

// --- Hysteresis re-evaluation ---

const RE_EVAL_INTERVAL = 20;
const HYSTERESIS_THRESHOLD = 0.3;

export function scoreForGoalType(ctx: AIContext, goalType: string): number {
  switch (goalType) {
    case 'hunt': return scoreHunt(ctx);
    case 'gather': return scoreGather(ctx);
    case 'chop': return scoreChopFirewood(ctx);
    case 'build': return scoreBuildHome(ctx);
    case 'return_home': return scoreReturnHome(ctx);
    default: return 0;
  }
}

function actionToKey(action: AIAction): string {
  switch (action.type) {
    case 'go_hunt': return 'hunt';
    case 'go_gather': return 'gather';
    case 'go_chop': return 'chop';
    case 'go_build': return 'build';
    case 'return_home': return 'return_home';
    case 'play': return 'play';
    case 'rest': return 'rest';
    default: return 'rest';
  }
}

export interface ReEvalResult {
  interrupt: boolean;
  newAction?: AIAction;
}

export function shouldReEvaluate(
  ctx: AIContext,
  currentGoalType: string,
  goalSetTick: number,
  currentTick: number,
): ReEvalResult {
  const elapsed = currentTick - goalSetTick;
  if (elapsed < RE_EVAL_INTERVAL) return { interrupt: false };

  const role = ROLES[ctx.entity.gender];
  const currentScore = scoreForGoalType(ctx, currentGoalType) * (role.actions[currentGoalType] ?? 0);

  const bestAction = decideAction(ctx);
  const bestKey = actionToKey(bestAction);
  const bestScore = scoreForGoalType(ctx, bestKey) * (role.actions[bestKey] ?? 0);

  if (bestScore - currentScore > HYSTERESIS_THRESHOLD) {
    return { interrupt: true, newAction: bestAction };
  }
  return { interrupt: false };
}

export function actionToGoal(action: AIAction, ctx: AIContext): EntityGoal | undefined {
  switch (action.type) {
    case 'go_hunt': return { type: 'hunt', target: action.target };
    case 'go_gather': return { type: 'gather', target: action.target };
    case 'go_chop': return { type: 'chop', target: action.target };
    case 'go_build': return { type: 'build', target: action.target };
    case 'return_home': return ctx.homeTarget ? { type: 'return_home', target: ctx.homeTarget } : undefined;
    default: return undefined;
  }
}
