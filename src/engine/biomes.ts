import type { Biome } from './types';

// ── Noise ────────────────────────────────────────────────────────────

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

function fbm(x: number, y: number, seed: number, baseScale: number = 10): number {
  return (
    smoothNoise(x, y, baseScale, seed) * 0.5 +
    smoothNoise(x, y, baseScale / 2, seed + 100) * 0.3 +
    smoothNoise(x, y, baseScale / 3, seed + 200) * 0.2
  );
}

/** Convert fragmentation 0-100 to noise scale.
 *  0 = one huge blob filling the whole map, 100 = many tiny scattered blobs. */
function fragToScale(frag: number, gridSize: number): number {
  return gridSize * (1 - frag / 100) + 2 * (frag / 100);
}

// ── Grid helpers ─────────────────────────────────────────────────────

function cloneGrid(grid: Biome[][]): Biome[][] {
  return grid.map((row) => [...row]);
}

// ── Cellular Automata smoothing (4-5 rule) ───────────────────────────
//
// Standard cave-generation CA applied to water:
//   • water cell with ≥ 4 water neighbours (of 8) → stays water
//   • land  cell with ≥ 5 water neighbours (of 8) → becomes water
//   • otherwise → land
//
// This inherently produces thick, organic blobs — narrow 1-2 tile
// passages vanish within a few iterations.

/**
 * CA smoothing using CARDINAL neighbours only (4-connected).
 * Rule: water survives if ≥2 cardinal water neighbours,
 *       land  becomes water if ≥3 cardinal water neighbours.
 *
 * Cardinal-only counting naturally avoids diagonal-only connections,
 * so surviving water bodies are always ≥3 tiles wide (every water
 * cell has water on both sides of at least one axis after convergence).
 */
function cellularAutomataSmooth(grid: Biome[][], iterations: number): Biome[][] {
  let current = cloneGrid(grid);
  const h = current.length;
  for (let i = 0; i < iterations; i++) {
    const next = cloneGrid(current);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < current[y].length; x++) {
        if (current[y][x] !== 'water' && current[y][x] !== 'plains') continue;
        let cn = 0;
        if (y > 0 && current[y-1][x] === 'water') cn++;
        if (y < h-1 && current[y+1][x] === 'water') cn++;
        if (x > 0 && current[y][x-1] === 'water') cn++;
        if (x < current[y].length-1 && current[y][x+1] === 'water') cn++;
        if (current[y][x] === 'water') {
          // Survive if has ≥3 cardinal water neighbors (thick body)
          // OR has pair on one axis + at least 1 on other (wide enough edge)
          const w = current[y].length;
          const hasE = x < w-1 && current[y][x+1] === 'water';
          const hasW = x > 0 && current[y][x-1] === 'water';
          const hasN = y > 0 && current[y-1][x] === 'water';
          const hasS = y < h-1 && current[y+1][x] === 'water';
          const hPair = hasE && hasW;
          const vPair = hasN && hasS;
          const thick = cn >= 3;
          const wideEdge = (hPair && (hasN || hasS)) || (vPair && (hasE || hasW));
          next[y][x] = (thick || wideEdge) ? 'water' : 'plains';
        } else {
          next[y][x] = cn >= 3 ? 'water' : 'plains';
        }
      }
    }
    current = next;
  }
  return current;
}

// ── Flood-fill: remove tiny biome clusters ───────────────────────────

function removeTinyBiomeClusters(grid: Biome[][], biome: Biome, minSize: number, replacement: Biome = 'plains'): Biome[][] {
  const next = cloneGrid(grid);
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  const seen = Array.from({ length: h }, () => Array.from({ length: w }, () => false));
  const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (seen[y][x] || grid[y][x] !== biome) continue;
      const stack = [{ x, y }];
      const comp: Array<{ x: number; y: number }> = [];
      seen[y][x] = true;
      while (stack.length > 0) {
        const cur = stack.pop()!;
        comp.push(cur);
        for (const d of dirs) {
          const nx = cur.x + d.dx, ny = cur.y + d.dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          if (seen[ny][nx] || grid[ny][nx] !== biome) continue;
          seen[ny][nx] = true;
          stack.push({ x: nx, y: ny });
        }
      }
      if (comp.length < minSize) {
        for (const p of comp) next[p.y][p.x] = replacement;
      }
    }
  }
  return next;
}

function removeTinyWaterPockets(grid: Biome[][], minSize: number): Biome[][] {
  const next = cloneGrid(grid);
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  const seen = Array.from({ length: h }, () => Array.from({ length: w }, () => false));
  const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (seen[y][x] || grid[y][x] !== 'water') continue;
      const stack = [{ x, y }];
      const comp: Array<{ x: number; y: number }> = [];
      seen[y][x] = true;
      while (stack.length > 0) {
        const cur = stack.pop()!;
        comp.push(cur);
        for (const d of dirs) {
          const nx = cur.x + d.dx, ny = cur.y + d.dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          if (seen[ny][nx] || grid[ny][nx] !== 'water') continue;
          seen[ny][nx] = true;
          stack.push({ x: nx, y: ny });
        }
      }
      if (comp.length < minSize) {
        for (const p of comp) next[p.y][p.x] = 'plains';
      }
    }
  }
  return next;
}

// ── Biome separation: enforce plains gap between different biomes ────

/**
 * Enforce 1-tile plains buffer between water, forest, and mountain.
 * Priority: water > mountain > forest.
 * Lower-priority biome yields to plains if within 1 tile of higher-priority.
 */
// ── Border cleanup ───────────────────────────────────────────────────

function clearWaterOnBorder(grid: Biome[][], margin: number): Biome[][] {
  const next = cloneGrid(grid);
  const h = next.length;
  const w = next[0]?.length ?? 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((x < margin || y < margin || x >= w - margin || y >= h - margin) && next[y][x] === 'water') {
        next[y][x] = 'plains';
      }
    }
  }
  return next;
}

// ── Main generation ──────────────────────────────────────────────────

export interface BiomeGenParams {
  waterPct: number;       // % of total map
  mountainPct: number;    // % of total map
  forestPct: number;      // % of total map
  // plains = 100 - water - forest - rocks
  waterFrag: number;      // 0=one big lake, 100=many small ponds
  forestFrag: number;     // 0=one big forest, 100=many small groves
  rockFrag: number;       // 0=few big clusters, 100=scattered
  caIterations: number;
  minPocketSize: number;
  borderMargin: number;
}

export const DEFAULT_BIOME_PARAMS: BiomeGenParams = {
  waterPct: 20,
  mountainPct: 5,
  forestPct: 30,
  waterFrag: 30,
  forestFrag: 30,
  rockFrag: 50,
  caIterations: 6,
  minPocketSize: 9,
  borderMargin: 2,
};

export function generateBiomeGrid(gridSize: number, params: Partial<BiomeGenParams> = {}): Biome[][] {
  const p = { ...DEFAULT_BIOME_PARAMS, ...params };

  // Retry up to 5 times if biome percentages are too far off target
  for (let attempt = 0; attempt < 5; attempt++) {
    // Boost water % on retries to compensate for CA/opening losses
    const boosted = { ...p, waterPct: p.waterPct + attempt * 5 };
    const result = generateBiomeGridOnce(gridSize, boosted);
    const total = gridSize * gridSize;
    let wc = 0, mc = 0;
    for (let y = 0; y < gridSize; y++)
      for (let x = 0; x < gridSize; x++) {
        if (result[y][x] === 'water') wc++;
        else if (result[y][x] === 'mountain') mc++;
      }
    const waterOk = p.waterPct === 0 || wc >= total * p.waterPct / 100 * 0.2;
    const rockOk = p.mountainPct === 0 || mc >= 1;
    if (waterOk && rockOk) return result;
  }
  return generateBiomeGridOnce(gridSize, { ...p, waterPct: p.waterPct + 25 });
}

function generateBiomeGridOnce(gridSize: number, p: BiomeGenParams): Biome[][] {
  const seed = Math.random() * 10000;
  const total = gridSize * gridSize;
  const h = gridSize, w = gridSize;

  // 1. Generate noise — fragmentation maps to noise base-scale per biome.
  const waterScale = fragToScale(p.waterFrag, gridSize);
  const forestScale = fragToScale(p.forestFrag, gridSize);
  const rockScale = fragToScale(p.rockFrag, gridSize);

  const elevation: number[][] = [];
  const moisture: number[][] = [];
  const rockNoise: number[][] = [];
  for (let y = 0; y < h; y++) {
    const eRow: number[] = [], mRow: number[] = [], rRow: number[] = [];
    for (let x = 0; x < w; x++) {
      eRow.push(fbm(x, y, seed, waterScale));
      mRow.push(fbm(x, y, seed + 500, forestScale));
      rRow.push(fbm(x, y, seed + 777, rockScale));
    }
    elevation.push(eRow);
    moisture.push(mRow);
    rockNoise.push(rRow);
  }

  // 2. WATER LAYER — generate, smooth, clean up completely first
  const grid: Biome[][] = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => 'plains' as Biome),
  );

  // Assign water by elevation percentile
  const allCells: Array<{ x: number; y: number; e: number }> = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      allCells.push({ x, y, e: elevation[y][x] });
  allCells.sort((a, b) => a.e - b.e);
  const waterCount = Math.floor(total * p.waterPct / 100);
  for (let i = 0; i < waterCount; i++) {
    const c = allCells[i];
    grid[c.y][c.x] = 'water';
  }

  // CA smooth water
  let processed = cellularAutomataSmooth(grid, p.caIterations);
  processed = clearWaterOnBorder(processed, p.borderMargin);
  processed = removeTinyWaterPockets(processed, p.minPocketSize);

  // Remove 1-tile-wide channels
  for (let iter = 0; iter < 20; iter++) {
    let changed = false;
    const next = cloneGrid(processed);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (processed[y][x] !== 'water') continue;
        const E = x < w-1 && processed[y][x+1] === 'water';
        const W = x > 0 && processed[y][x-1] === 'water';
        const N = y > 0 && processed[y-1][x] === 'water';
        const S = y < h-1 && processed[y+1][x] === 'water';
        if ((!N && !S && (E || W)) || (!E && !W && (N || S))) {
          next[y][x] = 'plains'; changed = true;
        }
      }
    }
    processed = next;
    if (!changed) break;
  }
  processed = removeTinyWaterPockets(processed, p.minPocketSize);

  // 3. Build water proximity mask (1-tile buffer around water)
  const nearWater: boolean[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => false));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (processed[y][x] !== 'water') continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) nearWater[ny][nx] = true;
        }
    }
  }

  // Normalize percentages: if sum > 100, scale proportionally
  const rawSum = p.waterPct + p.forestPct + p.mountainPct;
  const scale = rawSum > 100 ? 100 / rawSum : 1;
  const forestTarget = Math.floor(total * p.forestPct * scale / 100);
  const rockTarget = Math.floor(total * p.mountainPct * scale / 100);

  // 4. FOREST — on safe plains (not near water), by moisture percentile
  const safeLand: Array<{ x: number; y: number; m: number }> = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (processed[y][x] === 'plains' && !nearWater[y][x])
        safeLand.push({ x, y, m: moisture[y][x] });

  safeLand.sort((a, b) => b.m - a.m);
  const forestCount = Math.min(forestTarget, safeLand.length);
  for (let i = 0; i < forestCount; i++) {
    const c = safeLand[i];
    processed[c.y][c.x] = 'forest';
  }
  processed = removeTinyBiomeClusters(processed, 'forest', 6);

  // 5. ROCKS — scattered on remaining safe plains (not near water or forest)
  const nearForest: boolean[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => false));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (processed[y][x] !== 'forest') continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) nearForest[ny][nx] = true;
        }
    }
  }

  // Rocks in clusters — use low-frequency noise (like forest uses moisture)
  const availableForRocks: Array<{ x: number; y: number; rockiness: number }> = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (processed[y][x] !== 'plains' || nearWater[y][x] || nearForest[y][x]) continue;
      availableForRocks.push({ x, y, rockiness: rockNoise[y][x] });
    }
  // Sort by rockiness descending — highest values cluster together (noise is spatially coherent)
  availableForRocks.sort((a, b) => b.rockiness - a.rockiness);
  const rockCount = Math.min(rockTarget, availableForRocks.length);
  for (let i = 0; i < rockCount; i++) {
    processed[availableForRocks[i].y][availableForRocks[i].x] = 'mountain';
  }

  return processed;
}

export function isPassable(biome: Biome): boolean {
  return biome === 'plains' || biome === 'forest' || biome === 'road';
}
