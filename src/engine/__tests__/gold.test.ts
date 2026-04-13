import { describe, it, expect } from 'vitest';
import { createWorld, tick } from '../world';
import type { WorldState, Entity } from '../types';
import { ECONOMY, TICKS_PER_YEAR } from '../types';
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

function plainsBiomes(size: number): any {
  return Array.from({ length: size }, () => Array(size).fill('plains'));
}
function emptyGrass(size: number): number[][] {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

describe('mining flow', () => {
  it('entity adjacent to gold deposit mines and ends up carrying gold', () => {
    const T = TICKS_PER_YEAR;
    const biomes = plainsBiomes(10);
    biomes[5][5] = 'mountain';
    const world: WorldState = {
      gridSize: 10, tick: 0, animals: [], trees: [], houses: [],
      biomes, villages: [{
        tribe: 0, color: [255, 0, 0], name: 'A', stockpile: { x: 1, y: 1 },
        meatStore: 99, plantStore: 99, cookedMeatStore: 99, driedFruitStore: 99,
        woodStore: 99, goldStore: 0,
      }],
      grass: emptyGrass(10), log: [],
      goldDeposits: [{ id: 'g1', position: { x: 5, y: 5 }, remaining: 6 }],
      entities: [{
        id: 'm1', name: 'Miner', position: { x: 4, y: 5 }, gender: 'male',
        activity: { kind: 'moving', purpose: 'mine', target: { x: 5, y: 5 }, pace: 'walk', setTick: 0 },
        age: 25 * T, maxAge: 100 * T, color: [255, 0, 0],
        energy: 80, traits: { strength: 50, dexterity: 50, intelligence: 50 },
        tribe: 0, birthCooldown: 0, pregnancyTimer: 0,
      }],
    };
    // Tick once: arrival (already adjacent) → startWork('mining')
    let next = tick(world);
    const miner = next.entities[0];
    expect(miner.activity.kind).toBe('working');
    if (miner.activity.kind === 'working') {
      expect(miner.activity.action).toBe('mining');
    }
    // Advance until mining completes
    for (let i = 0; i < 6; i++) next = tick(next);
    const doneMiner = next.entities[0];
    expect(doneMiner.carrying?.type).toBe('gold');
    expect(doneMiner.carrying?.amount).toBe(2);  // ECONOMY.gold.unitsPerMine
    expect(next.goldDeposits[0].remaining).toBe(4);  // 6 - 2
  });
});
