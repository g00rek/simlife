export type Gender = 'male' | 'female';
export type EntityState = 'idle' | 'pregnant' | 'fighting' | 'hunting' | 'gathering' | 'training' | 'chopping' | 'building';

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
  // Pantry (food)
  meatStore: number;
  plantStore: number;
  // Warehouse (materials)
  woodStore: number;
}

export const WOOD_PER_CHOP = 3;           // wood portions from chopping 1 forest tile
export const HOUSE_WOOD_COST = 5;         // wood needed from warehouse to build a house
export const WINTER_WOOD_COST = 1;        // wood reserved per house for the whole winter
export const WINTER_COLD_DAMAGE = 2;      // energy lost per tick without heating in winter

// No food requirement for mating — they just need energy
export const VILLAGE_OPTIMAL_POP = 12; // above this, mating energy cost rises

export interface EntityGoal {
  type: 'hunt' | 'gather' | 'chop' | 'return_home' | 'build';
  target?: Position;
}

export interface Entity {
  id: string;
  name: string;
  position: Position;
  gender: Gender;
  state: EntityState;
  stateTimer: number;
  age: number;
  maxAge: number;
  color: RGB;
  energy: number;
  traits: Traits;
  meat: number;
  hungerThreshold?: number; // personal hunger threshold for direct eating decisions
  tribe: TribeId;
  homeId?: string;
  birthCooldown: number; // ticks until next pregnancy allowed (0 = ready)
  mateCooldown: number;  // ticks until male can impregnate again (0 = ready)
  fatherTraits?: Traits; // stored father's traits during pregnancy
  fatherTribe?: TribeId;
  coldExposure?: boolean; // set when winter cold penalty was applied this tick
  goal?: EntityGoal;
  goalSetTick: number;
}

export const MEAT_PORTIONS_PER_HUNT = 60;

// Traits
export const TRAIT_ENERGY_COST = 0.15; // extra energy drain per total trait points above baseline

export interface Animal {
  id: string;
  position: Position;
  gender: Gender;
  reproTimer: number; // ticks until next reproduction attempt
}

export const ANIMAL_REPRO_INTERVAL = 2400; // 1 year between reproduction per animal
export const ANIMAL_REPRO_RANGE = 2;     // max animals on nearby tiles to reproduce
export const ANIMAL_MAX = 80;            // population cap after increasing meat yield
export const ANIMAL_HUNT_MIN_POPULATION = 12; // preserve a breeding population
export const ANIMAL_FLEE_RANGE = 1;      // animals flee humans within this range
export const HUNT_KILL_RANGE = 3;       // bow range — instant kill within this distance

export interface Tree {
  id: string;
  position: Position;
  chopped: boolean;     // true = stump, will regrow
  choppedAt?: number;   // tick when chopped
  fruiting: boolean;    // true = fruit tree (can bear fruit)
  hasFruit: boolean;    // true = fruit ready to pick
  fruitPortions: number; // harvestable fruit portions (0 = empty, up to TREE_FRUIT_PORTIONS)
}

export const TREE_FRUIT_PORTIONS = 5;    // max fruit portions per fruiting tree

export const TREE_REGROW_TICKS = 7200; // ~3 years for chopped tree to regrow
export const FOREST_REGROW_TIME = 7200; // legacy alias
export const FIGHT_MIN_AGE = 16;
export const CHOPPING_DURATION = 5;  // half day
export const BUILDING_DURATION = 20; // 2 days
// Speed trait = tiles per tick (1-3). No multiplier — 1 tick = 1 step at speed 1.
export const TICKS_PER_DAY = 20; // 10 day + 10 night
export const DAY_TICKS = 10;     // first 10 ticks = daytime
export const NIGHT_TICKS = 10;   // last 10 ticks = nighttime

export const MATE_COOLDOWN = 200;      // ticks after impregnation before male can mate again

export interface House {
  id: string;
  position: Position;
  tribe: TribeId;
  occupantId?: string; // female who lives here
}

// Population (gameplay-tuned)
export const MIN_REPRODUCTIVE_AGE = 12;
export const MAX_REPRODUCTIVE_AGE = 40;
export const TICKS_PER_YEAR = 2400; // 20 ticks/day × 10 days/month × 12 months

// Actions
// No mating state — pregnancy happens automatically at night
export const PREGNANCY_DURATION = 600;  // ~30 days
export const BIRTH_COOLDOWN = 1800;     // ~90 days after birth before next pregnancy (60 days × 10 ticks)
export const FIGHTING_DURATION = 5;   // half day
export const HUNTING_DURATION = 0;   // instant on contact
export const GATHERING_DURATION = 0; // instant on contact

// Energy
export const ENERGY_MAX = 100;
export const ENERGY_START = 80;
export const ENERGY_DRAIN_INTERVAL = 15; // lose energy less often to reduce food pressure
export const ENERGY_MEAT = 25;
export const ENERGY_PLANT = 18;
export const ENERGY_MATING_MIN = 30;
export const HUNGER_THRESHOLD = 40; // eat from pantry when truly hungry
export const CHILD_AGE = 3; // children don't work/fight/lose energy (years)
export const INFANT_MORTALITY = 0.3; // 30% chance child dies at birth (historical rate)
export const MATERNAL_MORTALITY = 0.05; // 5% chance mother dies per birth

export const FOOD_RESERVE_PER_PERSON = 4;
export const FOOD_RESERVE_MIN = 30;
export const FOOD_RESERVE_MAX = 120;
export const PLANT_RESERVE_MIN = 20;

// Resources — base values tuned for 30×30 (900 tiles)
export const ANIMAL_COUNT = 8;

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

export type DeathCause = 'old_age' | 'starvation' | 'fight' | 'cold' | 'childbirth';

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

export interface WorldState {
  entities: Entity[];
  animals: Animal[];
  trees: Tree[];
  houses: House[];
  biomes: Biome[][];
  villages: Village[];
  tick: number;
  gridSize: number;
  log: LogEntry[];
}
