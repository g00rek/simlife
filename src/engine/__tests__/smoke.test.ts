import { describe, it, expect } from 'vitest';
import { createWorld, tick } from '../world';
import { TICKS_PER_YEAR } from '../types';

describe('simulation smoke tests', () => {
  it('runs 1 year (2400 ticks) without crashing', () => {
    let world = createWorld({ gridSize: 30, entityCount: 6, villageCount: 1 });
    for (let i = 0; i < TICKS_PER_YEAR; i++) world = tick(world);
    expect(world.tick).toBe(TICKS_PER_YEAR);
    expect(world.entities.length).toBeGreaterThan(0);
  });

  it('runs 5 years without crash — population survives', () => {
    let world = createWorld({ gridSize: 30, entityCount: 6, villageCount: 1 });
    const ticks = TICKS_PER_YEAR * 5;
    for (let i = 0; i < ticks; i++) world = tick(world);
    expect(world.tick).toBe(ticks);
    expect(world.entities.length).toBeGreaterThanOrEqual(1);
  }, 30_000);
});
