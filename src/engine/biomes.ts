import type { Biome } from './types';

// Simple value noise for procedural generation
function noise2d(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 43758.5453) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number, scale: number, seed: number): number {
  const sx = x / scale;
  const sy = y / scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;

  const n00 = noise2d(x0, y0, seed);
  const n10 = noise2d(x0 + 1, y0, seed);
  const n01 = noise2d(x0, y0 + 1, seed);
  const n11 = noise2d(x0 + 1, y0 + 1, seed);

  const nx0 = n00 * (1 - fx) + n10 * fx;
  const nx1 = n01 * (1 - fx) + n11 * fx;
  return nx0 * (1 - fy) + nx1 * fy;
}

function fbm(x: number, y: number, seed: number): number {
  let val = 0;
  val += smoothNoise(x, y, 10, seed) * 0.5;
  val += smoothNoise(x, y, 5, seed + 100) * 0.3;
  val += smoothNoise(x, y, 3, seed + 200) * 0.2;
  return val;
}

export function generateBiomeGrid(gridSize: number): Biome[][] {
  const seed = Math.random() * 10000;
  const grid: Biome[][] = [];

  for (let y = 0; y < gridSize; y++) {
    const row: Biome[] = [];
    for (let x = 0; x < gridSize; x++) {
      const elevation = fbm(x, y, seed);
      const moisture = fbm(x, y, seed + 500);

      let biome: Biome;
      if (elevation < 0.3) {
        biome = 'water';
      } else if (elevation > 0.75) {
        biome = 'mountain';
      } else if (moisture > 0.55) {
        biome = 'forest';
      } else {
        biome = 'plains';
      }
      row.push(biome);
    }
    grid.push(row);
  }

  // Ensure at least 40% walkable (plains + forest)
  const total = gridSize * gridSize;
  let walkable = 0;
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (grid[y][x] === 'plains' || grid[y][x] === 'forest') walkable++;
    }
  }
  // If too blocked, convert some water/mountain to plains
  if (walkable / total < 0.4) {
    for (let y = 0; y < gridSize && walkable / total < 0.5; y++) {
      for (let x = 0; x < gridSize && walkable / total < 0.5; x++) {
        if (grid[y][x] === 'water' || grid[y][x] === 'mountain') {
          if (Math.random() < 0.4) {
            grid[y][x] = 'plains';
            walkable++;
          }
        }
      }
    }
  }

  return grid;
}

export function isPassable(biome: Biome): boolean {
  return biome === 'plains' || biome === 'forest';
}

export function isPassableForRonin(biome: Biome): boolean {
  return biome === 'plains' || biome === 'forest' || biome === 'mountain';
}
