export type Gender = 'male' | 'female';
export type EntityState = 'idle' | 'mating' | 'pregnant' | 'fighting' | 'hunting' | 'gathering';

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

export type TribeId = number; // -1 = ronin, 0/1/2 = starting tribes, 3+ = ronin settlements

export interface Village {
  tribe: TribeId;
  center: Position;
  radius: number;
  color: RGB;
  name: string;
  meatStore: number;
  plantStore: number;
}

export const PANTRY_MATING_MIN = 3; // min meat in pantry to allow mating
export const VILLAGE_OPTIMAL_POP = 12; // above this, mating energy cost rises

export interface Entity {
  id: string;
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
  tribe: TribeId;
  partnerTraits?: Traits;
  partnerColor?: RGB;
  partnerTribe?: TribeId;
}

export const MEAT_PORTIONS_PER_HUNT = 20;

// Traits
export const TRAIT_ENERGY_COST = 0.15; // extra energy drain per total trait points above baseline

export interface Animal {
  id: string;
  position: Position;
  reproTimer: number; // ticks until next reproduction attempt
}

export const ANIMAL_REPRO_INTERVAL = 10; // ticks between reproduction attempts
export const ANIMAL_REPRO_RANGE = 2;     // max animals on nearby tiles to reproduce
export const ANIMAL_MAX = 40;            // carrying capacity
export const ANIMAL_FLEE_RANGE = 1;      // animals flee humans within this range

export interface Plant {
  id: string;
  position: Position;
  mature: boolean; // green = growing, red = ready to harvest
  growTimer: number; // ticks until mature
}

export const PLANT_GROW_TIME = 20; // ticks to mature
export const FIGHT_MIN_AGE = 16; // years — children don't fight

// Population
export const MIN_REPRODUCTIVE_AGE = 18;
export const MAX_REPRODUCTIVE_AGE = 50;
export const TICKS_PER_YEAR = 10;
export const BASE_PHEROMONE_RANGE = 1; // added to perception for mate sensing

// Actions
export const MATING_DURATION = 1;
export const PREGNANCY_DURATION = 15; // ~1.5 years
export const FIGHTING_DURATION = 3;
export const HUNTING_DURATION = 3;
export const GATHERING_DURATION = 2;

// Energy
export const ENERGY_MAX = 100;
export const ENERGY_START = 80;
export const ENERGY_DRAIN_INTERVAL = 2; // lose 1 energy every N ticks
export const ENERGY_MEAT = 50;
export const ENERGY_PLANT = 35;
export const ENERGY_MATING_MIN = 50;
export const HUNGER_THRESHOLD = 60; // start seeking food earlier
export const CHILD_AGE = 10; // children don't lose energy (years)

// Resources
export const BASE_FOOD_SENSE_RANGE = 3; // added to perception for food sensing
export const ANIMAL_COUNT = 15;
export const PLANT_COUNT = 30;
export const PLANT_RESPAWN_INTERVAL = 5; // 1 new plant every N ticks

// Biomes
export type Biome = 'plains' | 'forest' | 'mountain' | 'water';

export interface BiomeGrid {
  grid: Biome[][];
  gridSize: number;
}

export type DeathCause = 'old_age' | 'starvation' | 'fight';

export interface LogEntry {
  tick: number;
  type: 'birth' | 'death';
  entityId: string;
  gender: Gender;
  age: number; // in ticks
  cause?: DeathCause;
}

export const FOREST_PLANT_BONUS = 1; // extra plant spawns in forest per interval
export const FOREST_SPEED_PENALTY = 1; // reduce steps by this in forest

export const VILLAGE_RADIUS = 5;

export interface WorldState {
  entities: Entity[];
  animals: Animal[];
  plants: Plant[];
  biomes: Biome[][];
  villages: Village[];
  tick: number;
  gridSize: number;
  log: LogEntry[];
}
