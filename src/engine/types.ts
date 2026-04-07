export type Gender = 'male' | 'female';
export type EntityState = 'idle' | 'mating' | 'fighting';

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
  stateTimer: number; // ticks remaining in current state (0 = idle)
  age: number;
  maxAge: number;
  color: RGB;
}

export const MIN_REPRODUCTIVE_AGE = 18;
export const MAX_REPRODUCTIVE_AGE = 50;
export const TICKS_PER_YEAR = 5;
export const ACTION_DURATION = 5;

export interface WorldState {
  entities: Entity[];
  tick: number;
  gridSize: number;
}
