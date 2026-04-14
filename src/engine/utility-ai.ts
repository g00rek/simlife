import type { Entity, Activity, Pace, Purpose, Position, Animal, Tree, House, Village, Biome, Gender, TribeId, GoldDeposit } from './types';
import {
  CHILD_AGE,
  ANIMAL_HUNT_MIN_POPULATION, scaled,
  HUNGER_THRESHOLD,
  NEAR_HOME_RANGE,
  HOUSE_CAPACITY,
  HOUSE_WOOD_COST,
  HOUSE_SIZE,
  VILLAGE_EAT_RANGE,
  TICKS_PER_YEAR,
  ECONOMY,
} from './types';
import { ageInYears, isPregnant, isValidBuildSite } from './world';
import { manhattan, chebyshev } from './geometry';

// Precomputed shared stats — calculated ONCE per tick, reused across all entities.
// Without this every buildAIContext call iterates entities/animals/houses again.
// For 30 entities × per-entity ctx that's 30× wasted scans of every list.
export interface PrecomputedContext {
  tribeHouses: Map<TribeId, House[]>;
  housesInProgressByTribe: Map<TribeId, number>;
  freeSlotsByTribe: Map<TribeId, number>;
  homelessByTribe: Map<TribeId, number>;
  pregnantByTribe: Map<TribeId, number>;
  populationByTribe: Map<TribeId, number>;
  daysOfFoodByTribe: Map<TribeId, number>;
  villageNeedsHousesByTribe: Map<TribeId, boolean>;
  bestBuildSiteByTribe: Map<TribeId, Position>;
  animalHerdCenter?: Position;
}

export function precomputeContext(
  villages: Village[], entities: Entity[], houses: House[], animals: Animal[],
  biomes: Biome[][], gridSize: number,
): PrecomputedContext {
  const tribeHouses = new Map<TribeId, House[]>();
  const housesInProgressByTribe = new Map<TribeId, number>();
  const freeSlotsByTribe = new Map<TribeId, number>();
  const homelessByTribe = new Map<TribeId, number>();
  const pregnantByTribe = new Map<TribeId, number>();
  const populationByTribe = new Map<TribeId, number>();
  const daysOfFoodByTribe = new Map<TribeId, number>();
  const villageNeedsHousesByTribe = new Map<TribeId, boolean>();
  const bestBuildSiteByTribe = new Map<TribeId, Position>();
  const adultsByTribe = new Map<TribeId, number>();
  const toddlersByTribe = new Map<TribeId, number>();

  for (const h of houses) {
    let arr = tribeHouses.get(h.tribe);
    if (!arr) { arr = []; tribeHouses.set(h.tribe, arr); }
    arr.push(h);
  }

  // One pass over entities — counts everything per-tribe.
  for (const e of entities) {
    populationByTribe.set(e.tribe, (populationByTribe.get(e.tribe) ?? 0) + 1);
    if (!e.homeId) homelessByTribe.set(e.tribe, (homelessByTribe.get(e.tribe) ?? 0) + 1);
    if (e.pregnancyTimer > 0) pregnantByTribe.set(e.tribe, (pregnantByTribe.get(e.tribe) ?? 0) + 1);
    const a = e.activity;
    const inProgress = (a.kind === 'working' && a.action === 'building')
                    || (a.kind === 'moving' && a.purpose === 'build');
    if (inProgress) housesInProgressByTribe.set(e.tribe, (housesInProgressByTribe.get(e.tribe) ?? 0) + 1);
    const years = Math.floor(e.age / TICKS_PER_YEAR);
    if (years >= CHILD_AGE) {
      adultsByTribe.set(e.tribe, (adultsByTribe.get(e.tribe) ?? 0) + 1);
    } else if (years >= ECONOMY.reproduction.infantAgeYears) {
      toddlersByTribe.set(e.tribe, (toddlersByTribe.get(e.tribe) ?? 0) + 1);
    }
  }

  // Per-village derived stats (free slots, needs, food days, best build site).
  for (const v of villages) {
    const tribeHomes = tribeHouses.get(v.tribe) ?? [];
    const freeSlots = tribeHomes.reduce((s, h) => s + (HOUSE_CAPACITY - h.occupants.length), 0);
    freeSlotsByTribe.set(v.tribe, freeSlots);
    const inProgress = housesInProgressByTribe.get(v.tribe) ?? 0;
    const pendingSlots = freeSlots + inProgress * HOUSE_CAPACITY;
    const homeless = homelessByTribe.get(v.tribe) ?? 0;
    const pregnant = pregnantByTribe.get(v.tribe) ?? 0;
    const needs = (homeless + pregnant) > pendingSlots;
    villageNeedsHousesByTribe.set(v.tribe, needs);

    const adults = adultsByTribe.get(v.tribe) ?? 0;
    const toddlers = toddlersByTribe.get(v.tribe) ?? 0;
    const ADULT_ENERGY_PER_DAY = 2;
    const energyPerDay = adults * ADULT_ENERGY_PER_DAY
      + toddlers * ADULT_ENERGY_PER_DAY * ECONOMY.reproduction.childDrainMultiplier;
    const stockpileEnergy =
        v.meatStore         * ECONOMY.meat.energyPerUnit
      + v.cookedMeatStore   * ECONOMY.cooking.cookedMeatEnergyPerUnit
      + v.plantStore        * ECONOMY.fruit.energyPerUnit
      + v.driedFruitStore   * ECONOMY.cooking.driedFruitEnergyPerUnit;
    daysOfFoodByTribe.set(v.tribe, energyPerDay > 0 ? stockpileEnergy / energyPerDay : Infinity);

    if (needs && v.stockpile) {
      const anchor = v.stockpile;
      let bestDist = Infinity;
      let bestSite: Position | undefined;
      for (let dy = -8; dy <= 8; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          const nx = anchor.x + dx, ny = anchor.y + dy;
          if (nx < 0 || nx >= gridSize - HOUSE_SIZE + 1 || ny < 0 || ny >= gridSize - HOUSE_SIZE + 1) continue;
          if (!isValidBuildSite(nx, ny, biomes, gridSize, houses, villages)) continue;
          const d = Math.abs(nx - anchor.x) + Math.abs(ny - anchor.y);
          if (d < bestDist) { bestDist = d; bestSite = { x: nx, y: ny }; }
        }
      }
      if (bestSite) bestBuildSiteByTribe.set(v.tribe, bestSite);
    }
  }

  // Single global animal centroid.
  let animalHerdCenter: Position | undefined;
  if (animals.length > 0) {
    let sx = 0, sy = 0;
    for (const a of animals) { sx += a.position.x; sy += a.position.y; }
    animalHerdCenter = {
      x: Math.round(sx / animals.length),
      y: Math.round(sy / animals.length),
    };
  }

  return {
    tribeHouses,
    housesInProgressByTribe,
    freeSlotsByTribe,
    homelessByTribe,
    pregnantByTribe,
    populationByTribe,
    daysOfFoodByTribe,
    villageNeedsHousesByTribe,
    bestBuildSiteByTribe,
    animalHerdCenter,
  };
}

// --- Role configuration ---
export interface RoleConfig {
  actions: Record<string, number>;
}

export const ROLES: Record<Gender, RoleConfig> = {
  female: {
    actions: { gather: 1.0, cook: 1.0, deposit: 1.0, mine: 0.8, rest: 1.0, play: 1.0 }
  },
  male: {
    actions: { hunt: 1.0, chop: 0.9, build: 1.0, mine: 1.0, deposit: 1.0, rest: 1.0, play: 1.0 }
  },
};

// --- Action types ---
export type AIAction =
  | { type: 'rest' }
  | { type: 'go_chop'; target: Position }
  | { type: 'go_hunt'; target: Position }
  | { type: 'go_build'; target: Position }
  | { type: 'go_mine'; target: Position }
  | { type: 'deposit' }   // go to village stockpile — deposit carrying OR eat from pantry
  | { type: 'go_gather'; target: Position }
  | { type: 'go_cook'; target: Position }
  | { type: 'wander' }
  | { type: 'play' };

// --- Context for scoring ---
export interface AIContext {
  entity: Entity;
  village?: Village;
  nearHome: boolean;
  homeTarget?: Position;
  nearestAnimal?: { pos: Position; dist: number };
  animalHerdCenter?: Position; // center of mass of all animals (for long-range tracking)
  nearestFruitTree?: { pos: Position; dist: number };       // home-filtered, for routine gather
  nearestEdibleFruit?: { pos: Position; dist: number };     // any visible fruit, for survival
  nearestForest?: { pos: Position; dist: number };
  nearestGoldDeposit?: { pos: Position; dist: number };
  villageNeedsHouses: boolean;
  nearestBuildSite?: { pos: Position; dist: number };
  totalMeat: number;        // raw meat in village stockpile
  totalPlant: number;       // raw fruit in village stockpile
  tribePopulation: number;
  animalPopulation: number;
  gridSize: number;
  daysOfFood: number;       // projected days the stockpile feeds the tribe (∞ if zero eaters)
  inEatZone: boolean;       // cheb ≤ VILLAGE_EAT_RANGE from stockpile OR any tribe house
}

// Food-security thresholds (days of stockpile projected against tribe drain).
// Below PANIC → top priority hunt/gather. Below COMFORT → secondary priority.
// Above COMFORT → no food-work, free time for other activities.
const FOOD_PANIC_DAYS = 15;
const FOOD_COMFORT_DAYS = 30;
const FOOD_SURPLUS_DAYS = 60;

// --- Scoring functions (0-1, higher = more urgent) ---

// Urgency curve for food work (hunt, gather). Inputs: days of food in stockpile.
//   < 15 days → 1.0 (panic — famine imminent)
//   15-30     → 0.7 (comfort margin broken, push to replenish)
//   30-60     → 0.3 (steady maintenance)
//   ≥ 60      → 0.0 (enough; free hands for other work)
function foodWorkUrgency(daysOfFood: number): number {
  if (daysOfFood < FOOD_PANIC_DAYS) return 1.0;
  if (daysOfFood < FOOD_COMFORT_DAYS) return 0.7;
  if (daysOfFood < FOOD_SURPLUS_DAYS) return 0.3;
  return 0;
}

function survivalForageAction(ctx: AIContext, survivalScore: number): AIAction | undefined {
  if (survivalScore === 0) return undefined;

  // Hands full — drop off at stockpile first. Along the way entity enters the eat zone
  // and feeds passively from the pantry.
  if (ctx.entity.carrying && ctx.entity.carrying.amount > 0) {
    return { type: 'deposit' };
  }

  // Survival mode: pick the CLOSEST food source that actually HAS food.
  // A starving man will grab a berry; gender doesn't restrict fruit/stockpile here.
  // Hunting stays male-only (animals flee, risky when barely standing).
  const here = ctx.entity.position;
  const candidates: Array<{ dist: number; action: AIAction }> = [];

  if (ctx.nearestEdibleFruit) {
    candidates.push({
      dist: ctx.nearestEdibleFruit.dist,
      action: { type: 'go_gather', target: ctx.nearestEdibleFruit.pos },
    });
  }
  // Stockpile only if it actually has food to eat. Empty stockpile = useless destination;
  // pushing it anyway traps entity in a "walk to stockpile → idle → walk to stockpile" loop.
  {
    const sp = ctx.village?.stockpile;
    if (ctx.village && sp) {
      const v = ctx.village;
      const stockpileFood = v.meatStore + v.plantStore + v.cookedMeatStore + v.driedFruitStore;
      if (stockpileFood > 0) {
        candidates.push({
          dist: manhattan(sp, here),
          action: { type: 'deposit' },
        });
      }
    }
  }
  if (ctx.entity.gender === 'male'
      && ctx.nearestAnimal
      && ctx.animalPopulation > scaled(ANIMAL_HUNT_MIN_POPULATION, ctx.gridSize, 2)) {
    candidates.push({
      dist: ctx.nearestAnimal.dist,
      action: { type: 'go_hunt', target: ctx.nearestAnimal.pos },
    });
  }

  if (candidates.length === 0) {
    // Panic survival (energy <20) + nothing in sight → wander to search anywhere.
    // Preemptive survival (energy <60) → return undefined so lower-priority tasks
    // (cook, play) can run instead of wasting time on a hopeless search.
    if (survivalScore >= 0.6) return { type: 'wander' };
    return undefined;
  }
  candidates.sort((a, b) => a.dist - b.dist);
  return candidates[0].action;
}

// Survival has three tiers — entities act on hunger BEFORE it becomes critical.
//   < 20         : 1.0 panic, drops everything (incl. hunt/build) and runs to nearest food.
//   < threshold  : 0.6 urgent, beats most things but loses to top-tier work like buildHome=1.
//   < threshold+20: 0.25 preemptive — beats play/cook so entity drifts back to eat.
// Preemptive SKIPS when entity is already in the village eat zone — passive eating (Step 0b)
// tops them up there. Firing preemptive in-zone would loop entity on stockpile arrivals.
function scoreSurvival(ctx: AIContext): number {
  if (ctx.entity.energy < 20) return 1.0;
  if (ctx.entity.energy < HUNGER_THRESHOLD) return 0.6;
  if (ctx.entity.energy < HUNGER_THRESHOLD + 20) return ctx.inEatZone ? 0 : 0.25;
  return 0;
}

function scoreBuildHome(ctx: AIContext): number {
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.villageNeedsHouses) return 0;
  if (!ctx.village || ctx.village.woodStore < HOUSE_WOOD_COST) return 0; // not enough wood yet → go chop
  // Hands full — deposit first so we can carry tools at build site
  if (ctx.entity.carrying && ctx.entity.carrying.amount > 0) return 0;
  return 1.0; // top-tier priority — shelter prevents homeless-baby deaths
}

// Wood is needed ONLY for building houses (no firewood, no winter heating).
// Chop only when village needs houses AND lacks the wood to build one.
function scoreChopWood(ctx: AIContext): number {
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.village) return 0;
  // Hands full — must deposit before chopping more
  if (ctx.entity.carrying && ctx.entity.carrying.amount > 0) return 0;
  if (!ctx.villageNeedsHouses) return 0;
  const woodTarget = HOUSE_WOOD_COST * 2; // enough for current build + next
  if (ctx.village.woodStore >= woodTarget) return 0;
  if (ctx.village.woodStore < HOUSE_WOOD_COST) return 1.0; // urgent — can't build yet
  const woodNeed = (woodTarget - ctx.village.woodStore) / woodTarget;
  return woodNeed * 0.95;
}

// Gold mining is a "free time" activity — runs when the tribe is fed and has shelter
// in progress. Never beats survival/build/food-work. Produces pure wealth (for future
// mercenary hire + inter-tribe rivalry pressure).
function scoreMineGold(ctx: AIContext): number {
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.village) return 0;
  if (ctx.entity.carrying && ctx.entity.carrying.amount > 0) return 0;
  if (!ctx.nearestGoldDeposit) return 0;
  // Only when food is at least comfortable — don't starve the tribe to chase wealth.
  if (ctx.daysOfFood < FOOD_COMFORT_DAYS) return 0;
  if (ctx.daysOfFood < FOOD_SURPLUS_DAYS) return 0.3;
  return 0.5;
}

// Hunt urgency driven by tribe's days-of-food buffer, throttled by animal-to-human ratio
// so hunting doesn't wipe out the herd when food is comfortable but animals are few.
function scoreHunt(ctx: AIContext): number {
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.village) return 0;
  if (ctx.animalPopulation === 0) return 0;
  if (ctx.entity.carrying && ctx.entity.carrying.amount > 0) return 0;

  const urgency = foodWorkUrgency(ctx.daysOfFood);
  if (urgency === 0) return 0;

  // Sustainability: full score with 1.5+ animals per tribe member, throttled below.
  const ratio = ctx.animalPopulation / Math.max(1, ctx.tribePopulation);
  const sustainability = Math.min(1, ratio / 1.5);
  return Math.min(1, urgency * Math.max(0.1, sustainability));
}

// Gather urgency driven by same days-of-food curve. Postpartum + late-pregnancy bans
// keep tired mothers home even during shortages.
function scoreGather(ctx: AIContext): number {
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.village) return 0;
  if (ctx.entity.carrying && ctx.entity.carrying.amount > 0) return 0;
  if (ctx.entity.gender === 'female' && ctx.entity.birthCooldown > 0) return 0;
  if (ctx.entity.pregnancyTimer > 0 && ctx.entity.pregnancyTimer < 100) return 0;
  if (!ctx.nearestFruitTree) return 0; // no fruit in sight — don't waste a turn wandering

  return foodWorkUrgency(ctx.daysOfFood);
}

function scoreDeposit(ctx: AIContext): number {
  // Carrying anything → top priority. Must deposit at stockpile before doing anything else.
  // Otherwise the next hunt/gather would OVERWRITE carrying and lose the load.
  if (ctx.entity.carrying && ctx.entity.carrying.amount > 0) return 1.0;
  return 0;
}

function scoreCook(ctx: AIContext): number {
  // Cook / dry runs continuously as long as there's any raw meat or raw fruit.
  // Women who aren't urgently foraging (gather has priority when food low) cook to
  // convert raw into higher-energy cooked/dried. Flat 0.5 — doesn't outcompete survival
  // or deposit but beats play.
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.village || !ctx.village.stockpile) return 0;
  if (ctx.entity.carrying && ctx.entity.carrying.amount > 0) return 0; // deposit first
  // Any raw available → cook/dry it. Flat priority — we want the conversion to run
  // continuously; high-value cooked food is the tribe's long-term buffer.
  const raw = ctx.totalMeat + ctx.totalPlant;
  if (raw === 0) return 0;
  return 0.5;
}

// --- Main decision function ---

// Exposed for debug
// Score keys shown in UI debug panel. For each gender, only returns scores for
// actions that gender's role can actually perform. Scores are ROLE-WEIGHTED (same
// multiplication that decideAction applies), so you see the effective value that
// actually competes in the decision. Survival always included (bypasses role filter).
export function getScores(ctx: AIContext): Record<string, number> {
  const role = ROLES[ctx.entity.gender];
  const raw: Record<string, number> = {
    buildHome: scoreBuildHome(ctx),
    chop: scoreChopWood(ctx),
    hunt: scoreHunt(ctx),
    gather: scoreGather(ctx),
    deposit: scoreDeposit(ctx),
    cook: scoreCook(ctx),
    mine: scoreMineGold(ctx),
  };
  // Mapping from score-key to role.actions key (some differ in spelling).
  const roleKey: Record<string, string> = {
    buildHome: 'build',
  };
  const out: Record<string, number> = { survival: scoreSurvival(ctx) };
  for (const [key, value] of Object.entries(raw)) {
    const weight = role.actions[roleKey[key] ?? key];
    if (weight === undefined) continue; // gender cannot perform this action
    out[key] = value * weight;
  }
  return out;
}

export function decideAction(ctx: AIContext): AIAction {
  const e = ctx.entity;

  // Children: walk toward stockpile if far from village, play near houses otherwise
  if (ageInYears(e) < CHILD_AGE) {
    if (!ctx.nearHome && ctx.village?.stockpile) return { type: 'deposit' };
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
      // No build site visible but houses are needed — walk back to stockpile to regroup
      scores.push({ key: 'build', score: buildScore, action: () => ({ type: 'deposit' }) });
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

  // Gather — go directly to known fruit tree (already filtered to within home radius).
  // Removed nearestForest fallback — pulled women to far-from-home forest tiles where they
  // got stuck pacing and starved out of village range.
  const gatherScore = scoreGather(ctx);
  if (gatherScore > 0 && ctx.nearestFruitTree) {
    scores.push({ key: 'gather', score: gatherScore, action: () => ({ type: 'go_gather', target: ctx.nearestFruitTree!.pos }) });
  }

  // Chop wood for building — go directly to forest
  const chopScore = scoreChopWood(ctx);
  if (chopScore > 0) {
    if (ctx.nearestForest) {
      scores.push({ key: 'chop', score: chopScore, action: () => ({ type: 'go_chop', target: ctx.nearestForest!.pos }) });
    } else {
      scores.push({ key: 'chop', score: chopScore * 0.8, action: () => ({ type: 'wander' }) });
    }
  }

  // Cook — go to stockpile to process raw → cooked (women's labor)
  const cookScore = scoreCook(ctx);
  if (cookScore > 0 && ctx.village?.stockpile) {
    scores.push({ key: 'cook', score: cookScore, action: () => ({ type: 'go_cook', target: ctx.village!.stockpile! }) });
  }

  // Mine gold — free-time activity when tribe is well-fed
  const mineScore = scoreMineGold(ctx);
  if (mineScore > 0 && ctx.nearestGoldDeposit) {
    scores.push({
      key: 'mine', score: mineScore,
      action: () => ({ type: 'go_mine', target: ctx.nearestGoldDeposit!.pos }),
    });
  }

  // Deposit carrying at stockpile — highest priority when carrying anything
  const depositScore = scoreDeposit(ctx);
  if (depositScore > 0) {
    scores.push({ key: 'deposit', score: depositScore, action: () => ({ type: 'deposit' }) });
  }

  // Default: stroll around settlement
  scores.push({ key: 'play', score: 0.04, action: () => ({ type: 'play' }) });

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
  goldDeposits: GoldDeposit[] = [],
  pre?: PrecomputedContext,
): AIContext {
  const village = villages.find(v => v.tribe === entity.tribe);

  // Use precomputed per-tribe house list if available, otherwise filter on-demand.
  const tribeHouses = pre?.tribeHouses.get(entity.tribe) ?? houses.filter(h => h.tribe === entity.tribe);
  const houseCenter = (h: { position: Position }) => ({ x: h.position.x + Math.floor(HOUSE_SIZE / 2), y: h.position.y + Math.floor(HOUSE_SIZE / 2) });
  const nearHome = tribeHouses.some(h =>
    manhattan(entity.position, houseCenter(h)) <= NEAR_HOME_RANGE + 1
  );

  // inEatZone: chebyshev ≤ VILLAGE_EAT_RANGE from stockpile OR any tribe house center.
  // Matches the passive-eating check in world.ts Step 0b.
  let inEatZone = false;
  const village0 = villages.find(v => v.tribe === entity.tribe);
  if (village0?.stockpile && chebyshev(entity.position, village0.stockpile) <= VILLAGE_EAT_RANGE) {
    inEatZone = true;
  }
  if (!inEatZone) {
    for (const h of tribeHouses) {
      if (chebyshev(entity.position, houseCenter(h)) <= VILLAGE_EAT_RANGE) { inEatZone = true; break; }
    }
  }

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

  const sense = 7;

  // Find nearest animal
  let nearestAnimal: AIContext['nearestAnimal'];
  for (const a of animals) {
    const d = Math.abs(a.position.x - entity.position.x) + Math.abs(a.position.y - entity.position.y);
    if (d > 0 && d <= sense && (!nearestAnimal || d < nearestAnimal.dist)) {
      nearestAnimal = { pos: a.position, dist: d };
    }
  }

  // Single-herd centroid — long-range hunt target when no animal is in sight.
  let animalHerdCenter: Position | undefined = pre?.animalHerdCenter;
  if (!animalHerdCenter && animals.length > 0) {
    let sx = 0, sy = 0;
    for (const a of animals) { sx += a.position.x; sy += a.position.y; }
    animalHerdCenter = {
      x: Math.round(sx / animals.length),
      y: Math.round(sy / animals.length),
    };
  }

  // Find nearest fruit tree — reachable within sense, AND not too far from home.
  // Without home-distance limit, women wander to map corners chasing distant fruit
  // and give birth far from village → starve because can't get back to cooked food.
  let nearestFruitTree: AIContext['nearestFruitTree'];
  let nearestEdibleFruit: AIContext['nearestEdibleFruit'];
  const fruitSense = Math.min(sense * 2, 10); // capped — was sense*3 ≈ whole map
  const MAX_FORAGE_FROM_HOME = 10;
  for (const t of trees) {
    if (!t.hasFruit || t.fruitPortions <= 0) continue;
    const d = Math.abs(t.position.x - entity.position.x) + Math.abs(t.position.y - entity.position.y);
    if (d === 0 || d > fruitSense) continue;
    // ANY visible fruit — used by survival forage when entity is dying.
    if (!nearestEdibleFruit || d < nearestEdibleFruit.dist) {
      nearestEdibleFruit = { pos: t.position, dist: d };
    }
    // Stay near home — filter trees beyond forage radius from home (routine gather).
    if (homeTarget) {
      const homeDist = Math.abs(t.position.x - homeTarget.x) + Math.abs(t.position.y - homeTarget.y);
      if (homeDist > MAX_FORAGE_FROM_HOME) continue;
    }
    if (!nearestFruitTree || d < nearestFruitTree.dist) {
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

  // Find nearest gold deposit with remaining ore
  const GOLD_SENSE = 12; // knowledge of mountain resources within ~12 manhattan tiles
  let nearestGoldDeposit: AIContext['nearestGoldDeposit'];
  for (const d of goldDeposits) {
    if (d.remaining <= 0) continue;
    const dist = Math.abs(d.position.x - entity.position.x) + Math.abs(d.position.y - entity.position.y);
    if (dist > GOLD_SENSE) continue; // out of sense range
    if (dist > 0 && (!nearestGoldDeposit || dist < nearestGoldDeposit.dist)) {
      nearestGoldDeposit = { pos: d.position, dist };
    }
  }

  // Village needs houses: homeless + upcoming births > existing slots + in-progress builds.
  // Use precomputed per-tribe counts when available.
  const homelessCount = pre?.homelessByTribe.get(entity.tribe)
    ?? (village ? entities.filter(e => e.tribe === village.tribe && !e.homeId).length : 0);
  const pregnantCount = pre?.pregnantByTribe.get(entity.tribe)
    ?? (village ? entities.filter(e => e.tribe === village.tribe && isPregnant(e)).length : 0);
  const villageNeedsHouses = pre?.villageNeedsHousesByTribe.get(entity.tribe) ?? (() => {
    if (!village) return false;
    const tribeHomes = houses.filter(h => h.tribe === village.tribe);
    const totalFreeSlots = tribeHomes.reduce((s, h) => s + (HOUSE_CAPACITY - h.occupants.length), 0);
    const inProgress = entities.filter(e =>
      e.tribe === village.tribe
      && ((e.activity.kind === 'working' && e.activity.action === 'building')
       || (e.activity.kind === 'moving' && e.activity.purpose === 'build'))
    ).length;
    return (homelessCount + pregnantCount) > (totalFreeSlots + inProgress * HOUSE_CAPACITY);
  })();
  void homelessCount; void pregnantCount; // referenced in fallback only

  // Best build site for the tribe — distance is per-entity, but the site itself is shared.
  let nearestBuildSite: AIContext['nearestBuildSite'];
  const preBuildSite = pre?.bestBuildSiteByTribe.get(entity.tribe);
  if (preBuildSite) {
    nearestBuildSite = {
      pos: preBuildSite,
      dist: manhattan(preBuildSite, entity.position),
    };
  } else if (!pre && villageNeedsHouses && village?.stockpile) {
    // Fallback compute (only when caller didn't precompute)
    const anchor = village.stockpile;
    let bestSiteDistFromAnchor = Infinity;
    let bestSite: Position | undefined;
    for (let dy = -8; dy <= 8; dy++) {
      for (let dx = -8; dx <= 8; dx++) {
        const nx = anchor.x + dx, ny = anchor.y + dy;
        if (nx < 0 || nx >= gridSize - HOUSE_SIZE + 1 || ny < 0 || ny >= gridSize - HOUSE_SIZE + 1) continue;
        if (!isValidBuildSite(nx, ny, biomes, gridSize, houses, villages)) continue;
        const d = Math.abs(nx - anchor.x) + Math.abs(ny - anchor.y);
        if (d < bestSiteDistFromAnchor) {
          bestSiteDistFromAnchor = d;
          bestSite = { x: nx, y: ny };
        }
      }
    }
    if (bestSite) {
      nearestBuildSite = {
        pos: bestSite,
        dist: manhattan(bestSite, entity.position),
      };
    }
  }

  const tribePopulation = pre?.populationByTribe.get(entity.tribe)
    ?? (village ? entities.filter(e => e.tribe === village.tribe).length : 0);

  // daysOfFood — projected days that the village stockpile feeds the tribe.
  let daysOfFood: number;
  const preDays = pre?.daysOfFoodByTribe.get(entity.tribe);
  if (preDays !== undefined) {
    daysOfFood = preDays;
  } else if (village) {
    let adults = 0, toddlers = 0;
    for (const e of entities) {
      if (e.tribe !== village.tribe) continue;
      const years = ageInYears(e);
      if (years >= CHILD_AGE) adults++;
      else if (years >= ECONOMY.reproduction.infantAgeYears) toddlers++;
    }
    const ADULT_ENERGY_PER_DAY = 2;
    const energyPerDay = adults * ADULT_ENERGY_PER_DAY
      + toddlers * ADULT_ENERGY_PER_DAY * ECONOMY.reproduction.childDrainMultiplier;
    const stockpileEnergy =
        village.meatStore         * ECONOMY.meat.energyPerUnit
      + village.cookedMeatStore   * ECONOMY.cooking.cookedMeatEnergyPerUnit
      + village.plantStore        * ECONOMY.fruit.energyPerUnit
      + village.driedFruitStore   * ECONOMY.cooking.driedFruitEnergyPerUnit;
    daysOfFood = energyPerDay > 0 ? stockpileEnergy / energyPerDay : Infinity;
  } else {
    daysOfFood = Infinity;
  }

  return {
    entity,
    village,
    nearHome,
    homeTarget,
    nearestAnimal,
    animalHerdCenter,
    nearestFruitTree,
    nearestEdibleFruit,
    nearestForest,
    nearestGoldDeposit,
    villageNeedsHouses,
    nearestBuildSite,
    totalMeat: village?.meatStore ?? 0,
    totalPlant: village?.plantStore ?? 0,
    tribePopulation,
    animalPopulation: animals.length,
    gridSize,
    daysOfFood,
    inEatZone,
  };
}

// --- Hysteresis re-evaluation ---

const RE_EVAL_INTERVAL = 20;
const HYSTERESIS_THRESHOLD = 0.3;

export function scoreForGoalType(ctx: AIContext, goalType: string): number {
  switch (goalType) {
    case 'hunt': return scoreHunt(ctx);
    case 'gather': return scoreGather(ctx);
    case 'chop': return scoreChopWood(ctx);
    case 'build': return scoreBuildHome(ctx);
    case 'deposit': return scoreDeposit(ctx);
    case 'cook': return scoreCook(ctx);
    case 'mine': return scoreMineGold(ctx);
    default: return 0;
  }
}

function actionToKey(action: AIAction): string {
  switch (action.type) {
    case 'go_hunt': return 'hunt';
    case 'go_gather': return 'gather';
    case 'go_chop': return 'chop';
    case 'go_build': return 'build';
    case 'go_cook': return 'cook';
    case 'go_mine': return 'mine';
    case 'deposit': return 'deposit';
    case 'play': return 'play';
    case 'rest': return 'rest';
    default: return 'rest';
  }
}

export interface ReEvalResult {
  interrupt: boolean;
  newActivity?: Activity;
}

export function shouldReEvaluate(
  ctx: AIContext,
  currentPurpose: Purpose,
  setTick: number,
  currentTick: number,
): ReEvalResult {
  const elapsed = currentTick - setTick;
  if (elapsed < RE_EVAL_INTERVAL) return { interrupt: false };

  const role = ROLES[ctx.entity.gender];
  const currentScore = scoreForGoalType(ctx, currentPurpose) * (role.actions[currentPurpose] ?? 0);

  // Survival pre-empts everything else — directly compare survival score (bypass role filter).
  // Without this, hysteresis can miss starving entities locked into a low-priority purpose.
  const survScore = scoreSurvival(ctx);
  if (survScore - currentScore > HYSTERESIS_THRESHOLD) {
    const survAction = survivalForageAction(ctx, survScore);
    if (survAction) {
      const activity = actionToActivity(survAction, ctx, currentTick);
      if (activity) return { interrupt: true, newActivity: activity };
    }
  }

  const bestAction = decideAction(ctx);
  const bestKey = actionToKey(bestAction);
  const bestScore = scoreForGoalType(ctx, bestKey) * (role.actions[bestKey] ?? 0);

  if (bestScore - currentScore > HYSTERESIS_THRESHOLD) {
    const activity = actionToActivity(bestAction, ctx, currentTick);
    if (activity) return { interrupt: true, newActivity: activity };
  }
  return { interrupt: false };
}

// Translate the AI's chosen action into a concrete Activity. Returns undefined for
// non-movement actions (play, wander, rest) — caller runs single-step fallbacks.
// All 'moving' activities ride at walk pace by default; hunting runs (chase prey).
export function actionToActivity(action: AIAction, ctx: AIContext, tickNum: number): Activity | undefined {
  const mk = (purpose: Purpose, target: Position, pace: Pace = 'walk'): Activity =>
    ({ kind: 'moving', purpose, target, pace, setTick: tickNum });
  switch (action.type) {
    case 'go_hunt': return mk('hunt', action.target, 'run');
    case 'go_gather': return mk('gather', action.target);
    case 'go_chop':  return mk('chop', action.target);
    case 'go_build': return mk('build', action.target);
    case 'go_cook':  return mk('cook', action.target);
    case 'go_mine':  return mk('mine', action.target);
    case 'deposit': {
      const target = ctx.village?.stockpile;
      if (!target) return undefined;
      // Survival-critical run: starving entity sprints home for food
      const pace: Pace = ctx.entity.energy < 20 ? 'run' : 'walk';
      return mk('deposit', target, pace);
    }
    default: return undefined;
  }
}
