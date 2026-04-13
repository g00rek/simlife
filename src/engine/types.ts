export type Gender = 'male' | 'female';

// ── Activity system — single source of truth for what an entity is doing ──
// Replaces the old (state, stateTimer, goal) trio. Three kinds:
//   idle    — nothing, waiting for AI to pick next activity
//   moving  — walking or running toward a target with a stated purpose
//   working — performing a timed action in place (hunt/gather/chop/cook/build/fight/train)
// Pregnancy is NOT here — it's a parallel condition (entity.pregnancyTimer).
export type Pace = 'walk' | 'run';

// What the entity intends to do when they arrive at the target tile.
export type Purpose = 'hunt' | 'gather' | 'chop' | 'build' | 'cook' | 'spar' | 'deposit';

// The in-place action the entity is executing right now. Each has a baseline duration.
export type Action = 'hunting' | 'gathering' | 'chopping' | 'building' | 'cooking' | 'training' | 'fighting';

export type Activity =
  | { kind: 'idle' }
  | { kind: 'moving'; purpose: Purpose; target: Position; pace: Pace; setTick: number }
  | { kind: 'working'; action: Action; ticksLeft: number };

// Canonical durations for each working action (in ticks).
export const ACTION_DURATION: Record<Action, number> = {
  hunting: 3,
  gathering: 2,
  chopping: 3,
  cooking: 8,
  building: 10,
  training: 3,
  fighting: 5,
};

// Running cost: energy drain while running is multiplied by this (vs walking).
export const RUN_ENERGY_MULTIPLIER = 1.5;
// Running is only possible on open terrain. Forest tiles force downgrade to walk.

export interface Position {
  x: number;
  y: number;
}

export type RGB = [number, number, number];

export interface Traits {
  strength: number;      // 1-10: fight chance, hunting speed
  speed: number;         // 1-3: steps per tick
  perception: number;    // 1-5: food/mate sensing range
  metabolism: number;    // 0.5-2.0: lower = less energy drain but slower
  aggression: number;    // 0-10: 0 = always flee, 10 = always fight
  fertility: number;     // 0.5-2.0: higher = shorter mating time but shorter maxAge
  twinChance: number;   // 0-1: chance of multiple births (0=always single, 1=always multiples)
}

export type TribeId = number; // 0/1/2 = starting tribes

export interface Village {
  tribe: TribeId;
  color: RGB;
  name: string;
  stockpile?: Position;
  // Pantry — raw food
  meatStore: number;
  plantStore: number;
  // Pantry — cooked/processed food (produced by women cooking at stockpile)
  cookedMeatStore: number;
  driedFruitStore: number;
  // Warehouse (materials)
  woodStore: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ECONOMY — central config for all resource ratios. Tweak here, not elsewhere.
// All gameplay math (yields, energy, costs) derives from this single block.
// ═══════════════════════════════════════════════════════════════════════════
export const ECONOMY = {
  // --- MEAT (from hunting animals) ---
  meat: {
    unitsPerHunt: 30,        // portions carried home from 1 kill (=1 atomic "deer")
    energyPerUnit: 25,       // energy gained per portion eaten
    // 1 hunt = 30 × 25 = 750 energy total = ~4.7 person-years of food
  },
  // --- FRUIT (from fruit trees) ---
  fruit: {
    unitsPerPick: 1,         // portions taken per gather visit (atomic, Settlers-style)
    energyPerUnit: 18,       // energy gained per portion eaten
    treeCapacity: 5,         // max portions per fruiting tree (regrows seasonally)
    // 1 pick = 1 × 18 = 18 energy. Tree = 5 picks = 90 energy total.
  },
  // --- WOOD (from chopping trees) ---
  wood: {
    unitsPerChop: 3,         // portions carried home from 1 tree
    houseCost: 6,            // wood units needed to build a house (= 2 chops)
    // 1 chop = 3 wood. 1 house = 2 chops. Lowered from 15 — housing was bottleneck (men too busy hunting).
  },
  // --- METABOLISM (energy drain & hunger) ---
  metabolism: {
    drainPerInterval: 1,     // energy lost per drain event (before trait modifier)
    drainInterval: 15,       // ticks between drain events (= ~0.75 days)
    hungerThreshold: 60,     // energy below which entity is "hungry" (eats from pantry, scores survival)
    energyMax: 100,
    energyStart: 80,
    // With threshold=60: entity in village zone tops up continuously below 60
    // (preemptive feeding), only fasts in the wilderness on long tasks.
  },
  // --- COOKING (women process raw → cooked at stockpile) ---
  // Cooking happens at the village stockpile. Woman enters 'cooking' state,
  // converts raw units to cooked units with higher energy value.
  // Division of labor: men hunt raw, women process it into efficient food.
  cooking: {
    durationTicks: 20,             // 1 day per session (TICKS_PER_DAY)
    batchSize: 3,                  // raw units consumed per session (and produced as cooked)
    cookedMeatEnergyPerUnit: 50,   // +100% vs raw meat (25). Smoking/roasting unlocks fat calories.
    driedFruitEnergyPerUnit: 35,   // +94% vs raw fruit (18). Drying concentrates sugar.
    // Throughput: 3 raw → 3 cooked every 20 ticks. 120/year per active cook.
    // Energy uplift: 3×(50−25) = +75 meat or 3×(35−18) = +51 fruit per batch.
    // Roughly DOUBLES food supply without needing more hunts/gathers.
  },
  // --- REPRODUCTION (pregnancy, cooldowns, mortality) ---
  // Cycle math: pregnancyTicks + birthCooldown = ticks per child (best case).
  // TICKS_PER_YEAR = 2400. With current values: 600 + 900 = 1500 = 0.625 year/child.
  // Theoretical max per woman (12-40 age = 28 years): ~45 pregnancies. Real rate
  // far lower due to mating conditions + infant/maternal mortality.
  reproduction: {
    pregnancyTicks: 400,           // ~20 days game-time (reduced from 600 to accelerate reproduction)
    birthCooldown: 900,            // ~45 days after birth — postpartum recovery period
    infantMortality: 0.3,          // 30% chance baby dies at birth (historical pre-industrial rate)
    maternalMortality: 0.05,       // 5% chance mother dies per birth
    pregnancyMinEnergy: 60,        // woman must be well-fed (energy > this) to conceive
    infantAgeYears: 1,             // age < this = infant (breastfed, no drain, no eat)
    childDrainMultiplier: 0.25,    // age infantAge..CHILD_AGE: partial metabolism (25% — small bodies)
  },
  // --- SPARRING (training cooldown) ---
  sparring: {
    cooldownTicks: 200,            // ~10 days rest after a sparring session before the next
  },
} as const;

// Aliases (backward-compat) — derive from ECONOMY for clarity in existing call sites.
export const WOOD_PER_CHOP = ECONOMY.wood.unitsPerChop;
export const HOUSE_WOOD_COST = ECONOMY.wood.houseCost;

export interface Entity {
  id: string;
  name: string;
  position: Position;
  gender: Gender;
  activity: Activity;
  age: number;
  maxAge: number;
  color: RGB;
  energy: number;
  traits: Traits;
  hungerThreshold?: number;
  tribe: TribeId;
  homeId?: string;
  motherId?: string;      // children follow her
  birthCooldown: number;  // ticks until next pregnancy allowed
  pregnancyTimer: number; // > 0 = pregnant
  sparCooldown: number;   // > 0 = resting after sparring
  fatherTraits?: Traits;
  fatherTribe?: TribeId;
  carrying?: { type: 'meat' | 'wood' | 'fruit'; amount: number };
}

export const MEAT_PORTIONS_PER_HUNT = ECONOMY.meat.unitsPerHunt;

// Traits
export const TRAIT_ENERGY_COST = 0.15; // extra energy drain per total trait points above baseline

export interface Animal {
  id: string;
  position: Position;
  prevPos?: Position;  // last tick's tile — prevents single-tile ping-pong
  gender: Gender;
  energy: number;      // 0-100, dies at 0
  reproTimer: number;  // ticks until next reproduction attempt
  panicTicks: number;  // ticks remaining of flee behavior after seeing human
}

export const ANIMAL_ENERGY_MAX = 100;
export const ANIMAL_ENERGY_START = 60;
export const ANIMAL_ENERGY_GRAZE = 12;     // energy gained from eating grass
export const ANIMAL_ENERGY_DRAIN = 3;      // energy lost per ANIMAL_DRAIN_INTERVAL ticks
export const ANIMAL_DRAIN_INTERVAL = 10;   // drain energy every N ticks
export const ANIMAL_REPRO_MIN_ENERGY = 60; // need decent energy to reproduce
export const ANIMAL_REPRO_INTERVAL = 800;  // reproduce every ~4 months
export const ANIMAL_HUNT_MIN_POPULATION = 4; // minimal herd protection
export const HUNT_KILL_RANGE = 1;        // must be adjacent to kill

// Grass — grows on plains, food for animals
export const GRASS_GROW_CHANCE = 0.005;  // chance per plains tile per tick to grow grass (2.5× former rate)
export const GRASS_MAX_PER_TILE = 2;     // max grass per tile

// Runtime-tunable config — changeable from UI sliders.
// The simulation worker has its own module instance — sync via postMessage on change.
export const RUNTIME_CONFIG = {
  maxHerdSize: 30,        // hard cap on herd population (reproduction pauses above)
  herdLeash: 6,           // max manhattan distance an animal may stray from herd centroid
  reproInterval: 800,     // ticks between reproduction attempts (lower = faster breeding)
  grassGrowChance: 0.005, // chance per plains tile per tick for grass to grow
  grazeEnergy: 12,        // energy gained from eating one grass portion
  animalFleeRange: 4,     // manhattan distance at which animals spot humans and panic
  animalPanicDuration: 10, // ticks an animal stays in panic after last sighting
};

// Load saved RUNTIME_CONFIG from localStorage. Call at app startup (before world creation).
export function loadRuntimeConfig(): void {
  if (typeof localStorage === 'undefined') return; // worker has no localStorage
  try {
    const raw = localStorage.getItem('neurofolk-runtime-config');
    if (raw) Object.assign(RUNTIME_CONFIG, JSON.parse(raw));
  } catch { /* ignore corrupt data */ }
}

export function saveRuntimeConfig(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem('neurofolk-runtime-config', JSON.stringify(RUNTIME_CONFIG));
  } catch { /* ignore quota errors */ }
}

export interface Tree {
  id: string;
  position: Position;
  chopped: boolean;     // true = stump, will regrow
  choppedAt?: number;   // tick when chopped
  fruiting: boolean;    // true = fruit tree (can bear fruit)
  hasFruit: boolean;    // true = fruit ready to pick
  fruitPortions: number; // harvestable fruit portions (0 = empty, up to TREE_FRUIT_PORTIONS)
}

export const TREE_FRUIT_PORTIONS = ECONOMY.fruit.treeCapacity;

export const FIGHT_MIN_AGE = 16;
export const CHOPPING_DURATION = 5;  // half day
export const BUILDING_DURATION = 40; // ~4 days to construct a house
// Speed trait = tiles per tick (1-3). No multiplier — 1 tick = 1 step at speed 1.
export const TICKS_PER_DAY = 20; // one full day — no day/night split (dropped)

export interface House {
  id: string;
  position: Position;  // top-left corner of 2×2 area
  tribe: TribeId;
  occupants: string[]; // entity IDs living here (max HOUSE_CAPACITY)
}

export const HOUSE_CAPACITY = 6;         // max people per house
export const HOUSE_SIZE = 2;             // house footprint in tiles (2×2)

// Population (gameplay-tuned)
export const MIN_REPRODUCTIVE_AGE = 12;
export const MAX_REPRODUCTIVE_AGE = 40;
export const TICKS_PER_YEAR = 2400; // 20 ticks/day × 10 days/month × 12 months

// Actions (reproduction aliases → ECONOMY.reproduction)
export const PREGNANCY_DURATION = ECONOMY.reproduction.pregnancyTicks;
export const BIRTH_COOLDOWN = ECONOMY.reproduction.birthCooldown;
export const FIGHTING_DURATION = 5;   // half day
// Energy (aliases to ECONOMY.metabolism)
export const ENERGY_MAX = ECONOMY.metabolism.energyMax;
export const ENERGY_START = ECONOMY.metabolism.energyStart;
export const ENERGY_DRAIN_INTERVAL = ECONOMY.metabolism.drainInterval;
export const ENERGY_MEAT = ECONOMY.meat.energyPerUnit;
export const ENERGY_PLANT = ECONOMY.fruit.energyPerUnit;
export const HUNGER_THRESHOLD = ECONOMY.metabolism.hungerThreshold;
export const CHILD_AGE = 3; // children don't work/fight/lose energy (years)
export const INFANT_MORTALITY = ECONOMY.reproduction.infantMortality;
export const MATERNAL_MORTALITY = ECONOMY.reproduction.maternalMortality;

// Resources — base values tuned for 30×30 (900 tiles)
export const ANIMAL_COUNT = 20;

// Scale a base value proportionally to map area. Reference: 30×30 = 900 tiles.
// Returns at least `floor` (default 1).
const REF_AREA = 900;
export function scaled(base: number, gridSize: number, floor = 1): number {
  const area = gridSize * gridSize;
  return Math.max(floor, Math.round(base * area / REF_AREA));
}

// Biomes
export type Biome = 'plains' | 'forest' | 'mountain' | 'water' | 'road';

export interface BiomeGrid {
  grid: Biome[][];
  gridSize: number;
}

export type DeathCause = 'old_age' | 'starvation' | 'fight' | 'childbirth';

export type LogEventType =
  | 'birth' | 'death' | 'pregnant'
  | 'hunt' | 'gather' | 'chop' | 'build_start' | 'build_done'
  | 'fight' | 'train' | 'house_claimed';

export interface LogEntry {
  tick: number;
  type: LogEventType;
  entityId: string;
  name: string;
  gender: Gender;
  age: number; // in ticks
  cause?: DeathCause;
  detail?: string;
}

export const FOREST_SPEED_PENALTY = 1; // reduce steps by this in forest

export const NEAR_HOME_RANGE = 2; // manhattan distance to consider "near settlement"
export const VILLAGE_EAT_RANGE = 4; // chebyshev: entity in village zone can eat from stockpile
export const MAX_ENTITIES_PER_TILE = 1; // strict — one entity per tile, BFS routes around occupied tiles

export interface WorldState {
  entities: Entity[];
  animals: Animal[];
  trees: Tree[];
  houses: House[];
  biomes: Biome[][];
  villages: Village[];
  grass: number[][];   // grass portions per tile (0 = no grass)
  tick: number;
  gridSize: number;
  log: LogEntry[];
}
