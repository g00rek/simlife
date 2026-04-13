import { describe, it, expect } from 'vitest';
import { createWorld } from '../world';

describe('gold foundation', () => {
  it('fresh world has village.goldStore = 0', () => {
    const world = createWorld({ gridSize: 30, entityCount: 4, villageCount: 1 });
    for (const v of world.villages) {
      expect(v.goldStore).toBe(0);
    }
  });

  it('fresh world has a goldDeposits array (may be empty at this stage)', () => {
    const world = createWorld({ gridSize: 30, entityCount: 4, villageCount: 1 });
    expect(Array.isArray(world.goldDeposits)).toBe(true);
  });
});
