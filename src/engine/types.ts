export type Gender = 'male' | 'female';
export type EntityState = 'idle' | 'mating' | 'fighting' | 'hunting' | 'gathering';

export interface Position {
  x: number;
  y: number;
}

export type RGB = [number, number, number];

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
}

export interface Animal {
  id: string;
  position: Position;
}

export interface Plant {
  id: string;
  position: Position;
}

// Population
export const MIN_REPRODUCTIVE_AGE = 18;
export const MAX_REPRODUCTIVE_AGE = 50;
export const TICKS_PER_YEAR = 10;
export const PHEROMONE_RANGE = 1;

// Actions
export const MATING_DURATION = 3;
export const FIGHTING_DURATION = 3;
export const HUNTING_DURATION = 3;
export const GATHERING_DURATION = 2;

// Energy
export const ENERGY_MAX = 100;
export const ENERGY_START = 80;
export const ENERGY_DRAIN_INTERVAL = 2; // lose 1 energy every N ticks
export const ENERGY_MEAT = 30;
export const ENERGY_PLANT = 15;
export const ENERGY_MATING_MIN = 50;
export const HUNGER_THRESHOLD = 40;
export const CHILD_AGE = 10; // children don't lose energy (years)

// Resources
export const FOOD_SENSE_RANGE = 3;
export const ANIMAL_COUNT = 15;
export const PLANT_COUNT = 40;
export const ANIMAL_RESPAWN_INTERVAL = 10;
export const PLANT_RESPAWN_INTERVAL = 5; // 1 new plant every N ticks

export interface WorldState {
  entities: Entity[];
  animals: Animal[];
  plants: Plant[];
  tick: number;
  gridSize: number;
}
