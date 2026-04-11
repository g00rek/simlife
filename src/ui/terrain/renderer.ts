import type { Biome, Tree } from '../../engine/types';
import { drawWaterAutotileLayer } from './waterAutotile';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

// ── Layer 0: Surface (biome background colors) ──────────────────────

const BIOME_COLORS: Record<Biome, string> = {
  plains:   '#7e9432',
  forest:   '#7e9432',
  mountain: '#7e9432', // same as plains — rock sprite on top
  water:    '#7e9432',
  road:     '#c78539',
};

// Base plains tile (plain grass, no decorative variants)
const PLAINS_BASE = { sx: 0, sy: 0 };
// Grass food sprite for animals (Overworld.png|24,8,8,8)
const GRASS_FOOD = { sx: 24, sy: 8 };



export function drawSurfaceLayer(
  ctx: CanvasRenderingContext2D,
  biomes: Biome[][],
  gridSize: number,
  cellSize: number,
  overworld?: HTMLImageElement,
) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = BIOME_COLORS['plains'];
  ctx.fillRect(0, 0, gridSize * cellSize, gridSize * cellSize);
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const biome = biomes[y][x];
      const px = Math.floor(x * cellSize);
      const py = Math.floor(y * cellSize);
      const pw = Math.ceil(cellSize + 0.5);
      const ph = Math.ceil(cellSize + 0.5);
      if (overworld && (biome === 'plains' || biome === 'forest')) {
        ctx.drawImage(overworld, PLAINS_BASE.sx, PLAINS_BASE.sy, 8, 8, px, py, pw, ph);
      } else {
        ctx.fillStyle = BIOME_COLORS[biome];
        ctx.fillRect(px, py, pw, ph);
      }
    }
  }
}

// Draw grass food sprites on tiles that have grass
export function drawGrassLayer(
  ctx: CanvasRenderingContext2D,
  overworld: HTMLImageElement,
  grass: number[][],
  gridSize: number,
  cellSize: number,
) {
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (grass[y][x] <= 0) continue;
      const px = Math.floor(x * cellSize);
      const py = Math.floor(y * cellSize);
      const s = Math.round(cellSize);
      ctx.drawImage(overworld, GRASS_FOOD.sx, GRASS_FOOD.sy, 8, 8, px, py, s, s);
    }
  }
}

// ── Layer 1: Water + Shore (Wang 2-corner autotile with animation) ──

export function drawWaterLayer(
  ctx: CanvasRenderingContext2D,
  overworld: HTMLImageElement,
  biomes: Biome[][],
  gridSize: number,
  cellSize: number,
  tick: number,
  waveDensity: number = 5,
) {
  drawWaterAutotileLayer(ctx, overworld, biomes, gridSize, cellSize, tick, waveDensity);
}

// ── Layer 2: Trees ──────────────────────────────────────────────────

// Tree canopy: 32×32px sprites, drawn at ~2× cell size, overlapping neighbors
const TREE_NORMAL = { sx: 64, sy: 408, sw: 32, sh: 32 };
const TREE_WINTER = { sx: 64, sy: 368, sw: 32, sh: 32 };
const TREE_FRUIT_EMPTY = { sx: 160, sy: 488, sw: 32, sh: 32 }; // fruit tree, no fruit
const TREE_FRUIT_FULL = { sx: 112, sy: 488, sw: 32, sh: 32 };  // fruit tree, with fruit
const TREE_STUMP = { sx: 80, sy: 720, sw: 16, sh: 8 };         // chopped stump (2 tiles wide)

export function drawTreeLayer(
  ctx: CanvasRenderingContext2D,
  overworld: HTMLImageElement,
  trees: Tree[],
  cellSize: number,
  season: Season,
  _biomes?: Biome[][],
) {
  ctx.imageSmoothingEnabled = false;
  const drawSize = Math.round(cellSize * 2);

  // Sort by y ascending (back to front: lower rows cover upper)
  const sorted = [...trees].sort((a, b) => a.position.y - b.position.y);

  for (const tree of sorted) {
    if (tree.chopped) {
      // Stump sprite: 16×8, drawn at bottom-center of tile
      const dstW = cellSize;
      const dstH = cellSize * (TREE_STUMP.sh / TREE_STUMP.sw); // preserve aspect ratio
      const px = tree.position.x * cellSize;
      const py = tree.position.y * cellSize + cellSize - dstH;
      ctx.drawImage(overworld, TREE_STUMP.sx, TREE_STUMP.sy, TREE_STUMP.sw, TREE_STUMP.sh,
        px, py, Math.round(dstW), Math.round(dstH));
      continue;
    }

    let src;
    if (season === 'winter') {
      src = TREE_WINTER;
    } else if (tree.fruiting) {
      src = tree.hasFruit && tree.fruitPortions > 0 ? TREE_FRUIT_FULL : TREE_FRUIT_EMPTY;
    } else {
      src = TREE_NORMAL;
    }
    const px = tree.position.x * cellSize + Math.round((cellSize - drawSize) / 2);
    const py = tree.position.y * cellSize;
    ctx.drawImage(overworld, src.sx, src.sy, src.sw, src.sh,
      px, py, drawSize, drawSize);
  }
}

// ── Layer 4: Grid overlay ───────────────────────────────────────────

export function drawGridOverlay(
  ctx: CanvasRenderingContext2D,
  gridSize: number,
  cellSize: number,
  color = 'rgba(20,24,34,0.2)',
  biomes?: Biome[][],
) {
  if (cellSize < 6) return;
  const size = gridSize * cellSize;

  if (!biomes) {
    // Simple full grid
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    for (let i = 0; i <= gridSize; i++) {
      const p = i * cellSize + 0.5;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    }
    return;
  }

  // Skip grid lines around forest cells
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (biomes[y][x] === 'forest') continue;
      const px = x * cellSize;
      const py = y * cellSize;
      ctx.strokeRect(px + 0.5, py + 0.5, cellSize, cellSize);
    }
  }
}

// ── Layer: Mountains (animated 2-frame from Ores.png) ───────────────

const MTN_TILE = { sx: 0, sy: 88, sw: 8, sh: 8 };

export function drawMountainLayer(
  ctx: CanvasRenderingContext2D,
  ores: HTMLImageElement,
  biomes: Biome[][],
  gridSize: number,
  cellSize: number,
) {
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (biomes[y][x] !== 'mountain') continue;
      ctx.drawImage(ores, MTN_TILE.sx, MTN_TILE.sy, MTN_TILE.sw, MTN_TILE.sh,
        x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }
}

// ── Convenience: draw all terrain layers at once ────────────────────

export interface TerrainRenderOpts {
  ctx: CanvasRenderingContext2D;
  overworld: HTMLImageElement;
  ores?: HTMLImageElement;
  biomes: Biome[][];
  gridSize: number;
  cellSize: number;
  tick: number;
  season: Season;
  trees?: Tree[];
  grid?: boolean;
  waveDensity?: number;  // 0-100, % of water tiles with waves (default 5)
  grass?: number[][];    // grass food grid for animals
}

export function drawTerrain(opts: TerrainRenderOpts) {
  drawSurfaceLayer(opts.ctx, opts.biomes, opts.gridSize, opts.cellSize, opts.overworld);
  drawWaterLayer(opts.ctx, opts.overworld, opts.biomes, opts.gridSize, opts.cellSize, opts.tick, opts.waveDensity);
  if (opts.trees) {
    drawTreeLayer(opts.ctx, opts.overworld, opts.trees, opts.cellSize, opts.season, opts.biomes);
  }
  if (opts.ores) {
    drawMountainLayer(opts.ctx, opts.ores, opts.biomes, opts.gridSize, opts.cellSize);
  }
  if (opts.grid) {
    drawGridOverlay(opts.ctx, opts.gridSize, opts.cellSize, undefined);
  }
}
