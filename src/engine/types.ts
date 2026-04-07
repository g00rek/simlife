export type Gender = 'male' | 'female';

export interface Position {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  position: Position;
  gender: Gender;
}

export interface WorldState {
  entities: Entity[];
  tick: number;
  gridSize: number;
}
