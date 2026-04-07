import type { Entity, WorldState } from './types';
import { randomStep } from './movement';

interface CreateWorldOptions {
  gridSize: number;
  entityCount: number;
}

let nextId = 0;

function generateId(): string {
  return `entity-${nextId++}`;
}

export function createWorld(options: CreateWorldOptions): WorldState {
  const { gridSize, entityCount } = options;
  const entities: Entity[] = [];

  for (let i = 0; i < entityCount; i++) {
    entities.push({
      id: generateId(),
      position: {
        x: Math.floor(Math.random() * gridSize),
        y: Math.floor(Math.random() * gridSize),
      },
      gender: i < entityCount / 2 ? 'male' : 'female',
    });
  }

  return { entities, tick: 0, gridSize };
}

export function tick(state: WorldState): WorldState {
  return {
    ...state,
    tick: state.tick + 1,
    entities: state.entities.map(entity => ({
      ...entity,
      position: randomStep(entity.position, state.gridSize),
    })),
  };
}
