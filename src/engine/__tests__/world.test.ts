import { describe, it, expect } from 'vitest';
import { createWorld, tick } from '../world';

describe('createWorld', () => {
  it('creates world with correct grid size', () => {
    const world = createWorld({ gridSize: 30, entityCount: 20 });
    expect(world.gridSize).toBe(30);
  });

  it('creates the specified number of entities', () => {
    const world = createWorld({ gridSize: 30, entityCount: 20 });
    expect(world.entities).toHaveLength(20);
  });

  it('creates roughly equal male/female split', () => {
    const world = createWorld({ gridSize: 30, entityCount: 20 });
    const males = world.entities.filter(e => e.gender === 'male');
    const females = world.entities.filter(e => e.gender === 'female');
    expect(males.length).toBe(10);
    expect(females.length).toBe(10);
  });

  it('places all entities within grid bounds', () => {
    const world = createWorld({ gridSize: 30, entityCount: 20 });
    for (const entity of world.entities) {
      expect(entity.position.x).toBeGreaterThanOrEqual(0);
      expect(entity.position.x).toBeLessThan(30);
      expect(entity.position.y).toBeGreaterThanOrEqual(0);
      expect(entity.position.y).toBeLessThan(30);
    }
  });

  it('starts at tick 0', () => {
    const world = createWorld({ gridSize: 30, entityCount: 20 });
    expect(world.tick).toBe(0);
  });

  it('assigns unique IDs to all entities', () => {
    const world = createWorld({ gridSize: 30, entityCount: 20 });
    const ids = world.entities.map(e => e.id);
    expect(new Set(ids).size).toBe(20);
  });
});

describe('tick', () => {
  it('increments tick counter', () => {
    const world = createWorld({ gridSize: 30, entityCount: 5 });
    const next = tick(world);
    expect(next.tick).toBe(1);
  });

  it('preserves entity count', () => {
    const world = createWorld({ gridSize: 30, entityCount: 10 });
    const next = tick(world);
    expect(next.entities).toHaveLength(10);
  });

  it('returns a new state object (immutable)', () => {
    const world = createWorld({ gridSize: 30, entityCount: 5 });
    const next = tick(world);
    expect(next).not.toBe(world);
    expect(next.entities).not.toBe(world.entities);
  });

  it('keeps all entities within bounds after tick', () => {
    const world = createWorld({ gridSize: 30, entityCount: 20 });
    const next = tick(world);
    for (const entity of next.entities) {
      expect(entity.position.x).toBeGreaterThanOrEqual(0);
      expect(entity.position.x).toBeLessThan(30);
      expect(entity.position.y).toBeGreaterThanOrEqual(0);
      expect(entity.position.y).toBeLessThan(30);
    }
  });
});
