import { describe, it, expect } from 'vitest';
import { createWorld } from '../world';
import { ECONOMY } from '../types';
import { isPassable } from '../biomes';

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

describe('gold spawning', () => {
  it('spawns deposits on mountain tiles adjacent to at least one passable tile', () => {
    // Try a few seeds — some maps may have zero mountains
    let foundWithDeposits = false;
    for (let i = 0; i < 10; i++) {
      const world = createWorld({ gridSize: 30, entityCount: 4, villageCount: 1 });
      if (world.goldDeposits.length === 0) continue;
      foundWithDeposits = true;
      for (const d of world.goldDeposits) {
        expect(world.biomes[d.position.y][d.position.x]).toBe('mountain');
        // must have at least one passable neighbor (so miners can reach it)
        const nbrs = [
          { x: d.position.x + 1, y: d.position.y },
          { x: d.position.x - 1, y: d.position.y },
          { x: d.position.x, y: d.position.y + 1 },
          { x: d.position.x, y: d.position.y - 1 },
        ];
        const anyPassable = nbrs.some(n =>
          n.x >= 0 && n.x < world.gridSize && n.y >= 0 && n.y < world.gridSize
          && isPassable(world.biomes[n.y][n.x])
        );
        expect(anyPassable).toBe(true);
        expect(d.remaining).toBe(ECONOMY.gold.depositCapacity);
      }
      break;
    }
    expect(foundWithDeposits).toBe(true);
  });
});
