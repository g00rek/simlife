export type Gender = 'male' | 'female';
export type EntityState = 'idle' | 'mating' | 'pregnant' | 'fighting' | 'hunting' | 'gathering' | 'training' | 'chopping' | 'building';

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

// No food requirement for mating — they just need energy
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
  homeId?: string; // house this entity lives in
  carryingWood: boolean;
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

export const ANIMAL_REPRO_INTERVAL = 600; // ~6 months between reproduction
export const ANIMAL_REPRO_RANGE = 2;     // max animals on nearby tiles to reproduce
export const ANIMAL_MAX = 40;            // carrying capacity
export const ANIMAL_FLEE_RANGE = 1;      // animals flee humans within this range
export const HUNT_KILL_RANGE = 2;       // bow range — instant kill within this distance

export interface Plant {
  id: string;
  position: Position;
  mature: boolean; // green = growing, red = ready to harvest
  growTimer: number; // ticks until mature
}

export const PLANT_GROW_TIME = 600; // ~2 months to mature
export const FOREST_REGROW_TIME = 3600; // ~3 years for chopped forest to regrow
export const FIGHT_MIN_AGE = 16;
export const CHOPPING_DURATION = 5;  // half day
export const BUILDING_DURATION = 20; // 2 days
// Speed trait = tiles per tick (1-3). No multiplier — 1 tick = 1 step at speed 1.
export const TICKS_PER_DAY = 10;

export interface House {
  id: string;
  position: Position;
  tribe: TribeId;
  ownerId: string; // male who built it
  partnerId?: string; // female living there
}

// Population (gameplay-tuned)
export const MIN_REPRODUCTIVE_AGE = 15;
export const MAX_REPRODUCTIVE_AGE = 45;
export const TICKS_PER_YEAR = 1200; // 10 ticks/day × 10 days/month × 12 months

// Actions
export const MATING_DURATION = 1;     // instant
export const PREGNANCY_DURATION = 600; // 6 months (60 days × 10 ticks)
export const FIGHTING_DURATION = 5;   // half day
export const HUNTING_DURATION = 0;   // instant on contact
export const GATHERING_DURATION = 0; // instant on contact

// Energy
export const ENERGY_MAX = 100;
export const ENERGY_START = 80;
export const ENERGY_DRAIN_INTERVAL = 100; // lose 1 energy every ~10 days
export const ENERGY_MEAT = 50;
export const ENERGY_PLANT = 35;
export const ENERGY_MATING_MIN = 30;
export const HUNGER_THRESHOLD = 40; // eat from pantry when truly hungry
export const CHILD_AGE = 5; // children don't work/fight/lose energy (years)

// Resources
export const ANIMAL_COUNT = 15;
export const PLANT_COUNT = 30;
export const PLANT_RESPAWN_INTERVAL = 50; // new plant every ~5 days

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
  houses: House[];
  biomes: Biome[][];
  villages: Village[];
  tick: number;
  gridSize: number;
  log: LogEntry[];
}
