import type { Biome } from '../../engine/types';

type TileRect = { sx: number; sy: number; sw: number; sh: number };

/* ── Wang 2-Corner Autotile ──────────────────────────────────────────
 *
 * Corner weights:  NE=1  SE=2  SW=4  NW=8   →  index 0-15
 *
 * For cell (x,y) the four corners come from neighbouring cells:
 *   NW = cell(x-1, y-1)  NE = cell(x, y-1)
 *   SW = cell(x-1, y)    SE = cell(x, y)
 *
 * 4 tile variants × 2 animation frames per variant.
 * Each cell gets a deterministic variant based on position.
 * ──────────────────────────────────────────────────────────────────── */

const NUM_VARIANTS = 4;
const NUM_ANIM_FRAMES = 2;
const ANIM_SPEED = 108; // ticks per shore frame (~1800ms at 60fps)
const WAVE_SPEED = 36; // ticks per wave frame

// ── Variant block origins (4 variants × 2 frames) ───────────────────

const OUTER_VARIANTS: Array<[{ x: number; y: number }, { x: number; y: number }]> = [
  [{ x: 0,  y: 64 }, { x: 24,  y: 64 }],
  [{ x: 0,  y: 96 }, { x: 24,  y: 96 }],
  [{ x: 48, y: 96 }, { x: 72,  y: 96 }],
  [{ x: 120, y: 96 }, { x: 96, y: 96 }],  // variant 3: frames swapped
];

const INNER_VARIANTS: Array<[{ x: number; y: number }, { x: number; y: number }]> = [
  [{ x: 0,  y: 128 }, { x: 24,  y: 128 }],
  [{ x: 0,  y: 160 }, { x: 24,  y: 160 }],
  [{ x: 48, y: 160 }, { x: 72,  y: 160 }],
  [{ x: 120, y: 160 }, { x: 96, y: 160 }],  // variant 3: frames swapped
];

// ── Tile offsets within each block ───────────────────────────────────

const OUTER_OFFSET: Partial<Record<number, { dx: number; dy: number }>> = {
  2:  { dx: 0,  dy: 0 },   // cNW
  6:  { dx: 8,  dy: 0 },   // eN
  4:  { dx: 16, dy: 0 },   // cNE
  3:  { dx: 0,  dy: 8 },   // eW-A  (sub-variant B at dy:16)
  12: { dx: 16, dy: 8 },   // eE-A  (sub-variant B at dy:16)
  1:  { dx: 0,  dy: 24 },  // cSW
  9:  { dx: 8,  dy: 24 },  // eS
  8:  { dx: 16, dy: 24 },  // cSE
};

// Indices that have a second sub-variant at dy+8
const EDGE_SUB_VARIANT: Partial<Record<number, number>> = {
  3:  16,  // eW sub-B at dy=16 (instead of dy=8)
  12: 16,  // eE sub-B at dy=16
};

const INNER_OFFSET: Partial<Record<number, { dx: number; dy: number }>> = {
  13: { dx: 0,  dy: 0 },   // iSE
  11: { dx: 16, dy: 0 },   // iSW
  14: { dx: 0,  dy: 16 },  // iNE
  7:  { dx: 16, dy: 16 },  // iNW
};

// ── Water & wave tiles ───────────────────────────────────────────────

const WATER_BASE: TileRect = { sx: 0, sy: 280, sw: 8, sh: 8 };

const WAVE_FRAMES: TileRect[] = [
  { sx: 48, sy: 280, sw: 8, sh: 8 },
  { sx: 56, sy: 280, sw: 8, sh: 8 },
  { sx: 64, sy: 280, sw: 8, sh: 8 },
];
const WAVE_SEQ = [0, 1, 2, 1]; // boomerang

// ── Precompute all variant+frame tile lookups ────────────────────────

type FrameLookup = (TileRect | null)[];

// result[variant][frame][subVariant=0|1] = 16-element array
// subVariant 1 only differs for eW(3) and eE(12) — dy shifts to 16
function buildAllFrames(): Array<Array<[FrameLookup, FrameLookup]>> {
  const result: Array<Array<[FrameLookup, FrameLookup]>> = [];
  for (let v = 0; v < NUM_VARIANTS; v++) {
    const frames: Array<[FrameLookup, FrameLookup]> = [];
    for (let f = 0; f < NUM_ANIM_FRAMES; f++) {
      const outerO = OUTER_VARIANTS[v][f];
      const innerO = INNER_VARIANTS[v][f];

      const subs: [FrameLookup, FrameLookup] = [new Array(16).fill(null), new Array(16).fill(null)];
      for (let s = 0; s < 2; s++) {
        for (const [idx, off] of Object.entries(OUTER_OFFSET)) {
          const i = Number(idx);
          const dy = (s === 1 && EDGE_SUB_VARIANT[i] !== undefined) ? EDGE_SUB_VARIANT[i]! : off!.dy;
          subs[s][i] = { sx: outerO.x + off!.dx, sy: outerO.y + dy, sw: 8, sh: 8 };
        }
        for (const [idx, off] of Object.entries(INNER_OFFSET)) {
          subs[s][Number(idx)] = { sx: innerO.x + off!.dx, sy: innerO.y + off!.dy, sw: 8, sh: 8 };
        }
      }
      frames.push(subs);
    }
    result.push(frames);
  }
  return result;
}

const ALL_FRAMES = buildAllFrames();

// ── Helpers ──────────────────────────────────────────────────────────

function isWater(biomes: Biome[][], x: number, y: number): boolean {
  return y >= 0 && y < biomes.length && x >= 0 && x < (biomes[y]?.length ?? 0) && biomes[y][x] === 'water';
}

function wangIndex(biomes: Biome[][], x: number, y: number): number {
  return (
    (isWater(biomes, x,     y - 1) ? 1 : 0) +
    (isWater(biomes, x,     y)     ? 2 : 0) +
    (isWater(biomes, x - 1, y)     ? 4 : 0) +
    (isWater(biomes, x - 1, y - 1) ? 8 : 0)
  );
}

function cellVariant(_x: number, _y: number): number {
  return 0; // TODO: restore random variants after testing
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  sheet: HTMLImageElement,
  tile: TileRect,
  x: number, y: number,
  cellSize: number,
) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, tile.sx, tile.sy, tile.sw, tile.sh, x, y, Math.round(cellSize), Math.round(cellSize));
}

// ── Main draw function ───────────────────────────────────────────────

export function drawWaterAutotileLayer(
  ctx: CanvasRenderingContext2D,
  overworld: HTMLImageElement,
  biomes: Biome[][],
  gridSize: number,
  cellSize: number,
  tick: number,
  waveDensity: number = 5,
) {
  const animFrame = Math.floor(tick / ANIM_SPEED) % NUM_ANIM_FRAMES;
  const waveIdx = WAVE_SEQ[Math.floor(tick / WAVE_SPEED) % WAVE_SEQ.length];

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const idx = wangIndex(biomes, x, y);
      if (idx === 0) continue;

      const v = cellVariant(x, y);
      const sub = ((x * 3 + y * 11) & 0x7fffffff) % 2; // 0 or 1 for edge sub-variant
      const tile = ALL_FRAMES[v][animFrame][sub][idx];

      if (tile) {
        drawTile(ctx, overworld, tile, x * cellSize, y * cellSize, cellSize);
      } else {
        // index 15 (water), 5/10 (saddle)
        // Check if water touches N shore: cell 2 rows up is land → shore is directly above
        const touchesNShore = !isWater(biomes, x, y - 2) || !isWater(biomes, x - 1, y - 2);
        if (touchesNShore && idx === 15) {
          // Water-near-N-shore tile: offset (8,8) in outer block
          const outerO = OUTER_VARIANTS[v][animFrame];
          drawTile(ctx, overworld, { sx: outerO.x + 8, sy: outerO.y + 8, sw: 8, sh: 8 },
            x * cellSize, y * cellSize, cellSize);
        } else {
          const hasWave = (Math.sin(x * 127.1 + y * 311.7 + 43758.5) * 43758.5 % 1) > (1 - waveDensity / 100);
          if (hasWave) {
            drawTile(ctx, overworld, WAVE_FRAMES[waveIdx], x * cellSize, y * cellSize, cellSize);
          } else {
            drawTile(ctx, overworld, WATER_BASE, x * cellSize, y * cellSize, cellSize);
          }
        }
      }
    }
  }
}

// ── Exports for icons/debug pages ────────────────────────────────────

export { OUTER_VARIANTS, INNER_VARIANTS, OUTER_OFFSET, INNER_OFFSET, NUM_VARIANTS, NUM_ANIM_FRAMES };

export type ShoreType = 'N' | 'E' | 'S' | 'W' | 'NW' | 'NE' | 'SW' | 'SE';
export type WaterType = 'W' | 'N' | 'S' | 'Ww' | 'We';
export const SHORE_TYPES: ShoreType[] = ['N', 'E', 'S', 'W', 'NW', 'NE', 'SW', 'SE'];
export const WATER_TYPES: WaterType[] = ['W', 'N', 'S', 'Ww', 'We'];

export interface WaterTopology { wang: number[][]; }

export function buildWaterTopology(biomes: Biome[][]): WaterTopology {
  const wang: number[][] = [];
  for (let y = 0; y < biomes.length; y++) {
    const row: number[] = [];
    for (let x = 0; x < (biomes[y]?.length ?? 0); x++) row.push(wangIndex(biomes, x, y));
    wang.push(row);
  }
  return { wang };
}

export function summarizeWaterTypes(biomes: Biome[][]): { wang: Record<number, number>; total: number } {
  const { wang } = buildWaterTopology(biomes);
  const counts: Record<number, number> = {};
  let total = 0;
  for (const row of wang) for (const idx of row) {
    if (idx === 0) continue;
    counts[idx] = (counts[idx] ?? 0) + 1;
    total++;
  }
  return { wang: counts, total };
}
