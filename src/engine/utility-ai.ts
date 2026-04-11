import type { Entity, EntityGoal, Position, Animal, Plant, House, Village, Biome, Gender } from './types';
import {
  CHILD_AGE,
  ANIMAL_HUNT_MIN_POPULATION, scaled,
  FOOD_RESERVE_MAX,
  FOOD_RESERVE_MIN,
  FOOD_RESERVE_PER_PERSON,
  HUNGER_THRESHOLD,
  PLANT_DETECTION_MULTIPLIER,
  PLANT_RESERVE_MIN,
  TICKS_PER_DAY,
  DAY_TICKS,
  NEAR_HOME_RANGE,
} from './types';
import { ageInYears } from './world';

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
  isNight: boolean;
  nearestAnimal?: { pos: Position; dist: number };
  nearestPlant?: { pos: Position; dist: number };
  nearestForest?: { pos: Position; dist: number };
  villageNeedsHouses: boolean;
  tribePopulation: number;
  animalPopulation: number;
  gridSize: number;
}

const NIGHT_HUNT_MEAT_THRESHOLD = 20;
const NIGHT_HUNT_MIN_ENERGY = 35;
const PANIC_MEAT_THRESHOLD = 20;
const PANIC_PLANT_THRESHOLD = 20;

// --- Scoring functions (0-1, higher = more urgent) ---

function foodReserveTarget(ctx: AIContext): number {
  return Math.min(FOOD_RESERVE_MAX, Math.max(FOOD_RESERVE_MIN, ctx.tribePopulation * FOOD_RESERVE_PER_PERSON));
}

function totalVillageFood(ctx: AIContext): number {
  if (!ctx.village) return 0;
  return ctx.village.meatStore + ctx.village.plantStore;
}

function survivalForageAction(ctx: AIContext, survivalScore: number): AIAction | undefined {
  if (survivalScore === 0) return undefined;

  if (ctx.entity.gender === 'female') {
    if (ctx.nearestPlant) return { type: 'go_gather', target: ctx.nearestPlant.pos };
    if (ctx.nearestForest) return { type: 'go_gather', target: ctx.nearestForest.pos };
  }

  if (ctx.entity.gender === 'male'
      && ctx.animalPopulation > scaled(ANIMAL_HUNT_MIN_POPULATION, ctx.gridSize, 2)
      && ctx.nearestAnimal) {
    return { type: 'go_hunt', target: ctx.nearestAnimal.pos };
  }

  if (ctx.entity.gender === 'male') {
    if (ctx.nearestPlant) return { type: 'go_gather', target: ctx.nearestPlant.pos };
    if (ctx.nearestForest) return { type: 'go_gather', target: ctx.nearestForest.pos };
  }

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
  if (!ctx.village || ctx.village.woodStore < 5) return 0; // not enough wood yet → go chop
  return 0.85;
}

function scoreChopFirewood(ctx: AIContext): number {
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.village) return 0;
  const WOOD_MAX = 30;
  if (ctx.village.woodStore >= WOOD_MAX) return 0;
  const woodNeed = (WOOD_MAX - ctx.village.woodStore) / WOOD_MAX;
  return woodNeed * 0.5; // lower priority than hunting
}

function scoreHunt(ctx: AIContext): number {
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.village) return 0;
  if (ctx.animalPopulation <= scaled(ANIMAL_HUNT_MIN_POPULATION, ctx.gridSize, 2)) return 0;
  const target = foodReserveTarget(ctx);
  const totalFood = totalVillageFood(ctx);
  if (totalFood >= target) return 0;
  const foodNeed = (target - totalFood) / target;
  const panicBoost = ctx.village.meatStore < PANIC_MEAT_THRESHOLD ? 0.25 : 0;
  return Math.min(1, foodNeed * 0.9 + panicBoost);
}

function scoreGather(ctx: AIContext): number {
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.village) return 0;
  const target = foodReserveTarget(ctx);
  const totalFood = totalVillageFood(ctx);
  const plantReserveNeed = Math.max(0, (PLANT_RESERVE_MIN - ctx.village.plantStore) / PLANT_RESERVE_MIN);
  const foodNeed = Math.max(0, (target - totalFood) / target, plantReserveNeed * 0.8);
  if (foodNeed === 0) return 0;
  const panicBoost = ctx.village.plantStore < PANIC_PLANT_THRESHOLD ? 0.2 : 0;
  return Math.min(1, foodNeed * 0.6 + panicBoost);
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

  // Night: everyone returns home, near home = rest. Hungry adults can still forage.
  if (ctx.isNight) {
    if (survivalAction) return survivalAction;
    const isAdultMale = e.gender === 'male' && ageInYears(e) >= CHILD_AGE;
    const canNightHunt = !!ctx.village
      && !ctx.nearHome
      && isAdultMale
      && e.energy >= NIGHT_HUNT_MIN_ENERGY
      && ctx.village.meatStore < NIGHT_HUNT_MEAT_THRESHOLD;
    if (canNightHunt) {
      if (ctx.nearestAnimal) return { type: 'go_hunt', target: ctx.nearestAnimal.pos };
      return { type: 'wander' };
    }
    if (!ctx.nearHome && ctx.homeTarget) return { type: 'return_home' };
    return { type: 'rest' };
  }

  // Score all actions
  const scores: Array<{ key: string; score: number; action: () => AIAction }> = [];

  // Survival — direct food in the field first; pantry/home is fallback.
  if (survivalAction) {
    scores.push({ key: 'survival', score: survScore, action: () => survivalAction });
  }

  // Build home — go near houses first, then play to find build spot
  const buildScore = scoreBuildHome(ctx);
  if (buildScore > 0) {
    if (!ctx.nearHome) {
      scores.push({ key: 'build', score: buildScore, action: () => ({ type: 'return_home' }) });
    } else {
      scores.push({ key: 'build', score: buildScore, action: () => ({ type: 'play' }) });
    }
  }

  // Hunt — go directly to target
  const huntScore = scoreHunt(ctx);
  if (huntScore > 0) {
    if (ctx.nearestAnimal) {
      scores.push({ key: 'hunt', score: huntScore, action: () => ({ type: 'go_hunt', target: ctx.nearestAnimal!.pos }) });
    } else {
      scores.push({ key: 'hunt', score: huntScore * 0.8, action: () => ({ type: 'wander' }) });
    }
  }

  // Gather — go directly to target
  const gatherScore = scoreGather(ctx);
  if (gatherScore > 0) {
    if (ctx.nearestPlant) {
      scores.push({ key: 'gather', score: gatherScore, action: () => ({ type: 'go_gather', target: ctx.nearestPlant!.pos }) });
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
  plants: Plant[],
  entities: Entity[],
  biomes: Biome[][],
  gridSize: number,
  tick: number = 0,
  houses: House[] = [],
): AIContext {
  const village = villages.find(v => v.tribe === entity.tribe);

  // nearHome: within NEAR_HOME_RANGE of any tribe house
  const tribeHouses = houses.filter(h => h.tribe === entity.tribe);
  const nearHome = tribeHouses.some(h =>
    manhattan(entity.position, h.position) <= NEAR_HOME_RANGE
  );

  // homeTarget: own house or nearest tribe house
  let homeTarget: Position | undefined;
  if (entity.homeId) {
    const home = houses.find(h => h.id === entity.homeId);
    if (home) homeTarget = home.position;
  }
  if (!homeTarget && tribeHouses.length > 0) {
    let bestDist = Infinity;
    for (const h of tribeHouses) {
      const d = manhattan(entity.position, h.position);
      if (d < bestDist) { bestDist = d; homeTarget = h.position; }
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

  // Find nearest mature plant
  let nearestPlant: AIContext['nearestPlant'];
  const plantSense = sense * PLANT_DETECTION_MULTIPLIER;
  for (const p of plants) {
    if (p.portions <= 0) continue;
    const d = Math.abs(p.position.x - entity.position.x) + Math.abs(p.position.y - entity.position.y);
    if (d > 0 && d <= plantSense && (!nearestPlant || d < nearestPlant.dist)) {
      nearestPlant = { pos: p.position, dist: d };
    }
  }

  // Find nearest forest tile. Adults know the surrounding terrain well enough
  // to head toward forest even when no fruiting plant is currently visible.
  let nearestForest: AIContext['nearestForest'];
  for (let ny = 0; ny < gridSize; ny++) {
    for (let nx = 0; nx < gridSize; nx++) {
      if (biomes[ny][nx] === 'forest') {
        const d = Math.abs(nx - entity.position.x) + Math.abs(ny - entity.position.y);
        if (d > 0 && (!nearestForest || d < nearestForest.dist)) {
          nearestForest = { pos: { x: nx, y: ny }, dist: d };
        }
      }
    }
  }

  // Village needs houses: homeless adult females > free houses
  const homelessFemales = village
    ? entities.filter(e => e.tribe === village.tribe && e.gender === 'female' && ageInYears(e) >= CHILD_AGE && !e.homeId).length
    : 0;
  const freeHouses = village
    ? houses.filter(h => h.tribe === village.tribe && !h.occupantId).length
    : 0;
  const villageNeedsHouses = homelessFemales > freeHouses;

  const isNight = (tick % TICKS_PER_DAY) >= DAY_TICKS;
  const tribePopulation = village
    ? entities.filter(e => e.tribe === village.tribe).length
    : 0;
  return {
    entity,
    village,
    nearHome,
    homeTarget,
    isNight,
    nearestAnimal,
    nearestPlant,
    nearestForest,
    villageNeedsHouses,
    tribePopulation,
    animalPopulation: animals.length,
    gridSize,
  };
}

export function actionToGoal(action: AIAction, ctx: AIContext): EntityGoal | undefined {
  switch (action.type) {
    case 'go_hunt': return { type: 'hunt', target: action.target };
    case 'go_gather': return { type: 'gather', target: action.target };
    case 'go_chop': return { type: 'chop', target: action.target };
    case 'return_home': return ctx.homeTarget ? { type: 'return_home', target: ctx.homeTarget } : undefined;
    default: return undefined;
  }
}
