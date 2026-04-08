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

export type TribeId = number; // -1 = ronin, 0/1/2 = starting tribes, 3+ = ronin settlements

export interface Village {
  tribe: TribeId;
  center: Position;
  radius: number;
  color: RGB;
  name: string;
  // Pantry (food)
  meatStore: number;
  plantStore: number;
  // Warehouse (materials)
  woodStore: number;
}

export const WOOD_PER_CHOP = 3;           // wood portions from chopping 1 forest tile
export const HOUSE_WOOD_COST = 5;         // wood needed from warehouse to build a house
export const WINTER_WOOD_COST = 1;        // wood consumed per house per day in winter
export const WINTER_COLD_DAMAGE = 5;      // energy lost per tick without heating in winter

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
  homeId?: string;
  partnerId?: string;    // bonded partner
  birthCooldown: number; // ticks until next pregnancy allowed (0 = ready)
  partnerTraits?: Traits; // stored father's traits during pregnancy
  partnerTribe?: TribeId;
}

export const MEAT_PORTIONS_PER_HUNT = 8;

// Traits
export const TRAIT_ENERGY_COST = 0.15; // extra energy drain per total trait points above baseline

export interface Animal {
  id: string;
  position: Position;
  reproTimer: number; // ticks until next reproduction attempt
}

export const ANIMAL_REPRO_INTERVAL = 1200; // ~6 months between reproduction
export const ANIMAL_REPRO_RANGE = 2;     // max animals on nearby tiles to reproduce
export const ANIMAL_MAX = 40;            // carrying capacity
export const ANIMAL_FLEE_RANGE = 1;      // animals flee humans within this range
export const HUNT_KILL_RANGE = 2;       // bow range — instant kill within this distance

export interface Plant {
  id: string;
  position: Position;
  portions: number;  // harvestable portions (0 = depleted)
  maxPortions: number;
}

export const PLANT_PORTIONS = 5;          // portions per bush
export const PLANT_SEASON_REGROW = true;  // regrow in summer

export const FOREST_REGROW_TIME = 7200; // ~3 years for chopped forest to regrow
export const FIGHT_MIN_AGE = 16;
export const CHOPPING_DURATION = 5;  // half day
export const BUILDING_DURATION = 20; // 2 days
// Speed trait = tiles per tick (1-3). No multiplier — 1 tick = 1 step at speed 1.
export const TICKS_PER_DAY = 20; // 10 day + 10 night
export const DAY_TICKS = 10;     // first 10 ticks = daytime
export const NIGHT_TICKS = 10;   // last 10 ticks = nighttime

export interface House {
  id: string;
  position: Position;
  tribe: TribeId;
  ownerId: string; // male who built it
  partnerId?: string; // female living there
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
export const ENERGY_DRAIN_INTERVAL = 10; // lose 1 energy every half day (200 ticks)
export const ENERGY_MEAT = 15;
export const ENERGY_PLANT = 10;
export const ENERGY_MATING_MIN = 30;
export const HUNGER_THRESHOLD = 40; // eat from pantry when truly hungry
export const CHILD_AGE = 3; // children don't work/fight/lose energy (years)
export const INFANT_MORTALITY = 0.3; // 30% chance child dies at birth (historical rate)

// Resources
export const ANIMAL_COUNT = 7;
export const PLANT_COUNT = 30;
export const PLANT_RESPAWN_INTERVAL = 100; // new plant every ~5 days

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

export const VILLAGE_RADIUS = 3;

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
