import { useRef, useEffect, useState } from 'react';
import type { WorldState, Entity, Village } from '../engine/types';
import { CHILD_AGE, TICKS_PER_DAY, TICKS_PER_YEAR } from '../engine/types';
import { ageInYears } from '../engine/world';
import { drawSurfaceLayer, drawWaterLayer, drawTreeLayer } from './terrain/renderer';
import type { Season } from './terrain/renderer';

const MINI_MEDIEVAL_BASE = '/assets/mini-medieval/Mini-Medieval-8x8';
const UNITS_SHEET_URL = `${MINI_MEDIEVAL_BASE}/Units.png`;
const STRUCTURES_SHEET_URL = `${MINI_MEDIEVAL_BASE}/Structures.png`;
const MISC_SHEET_URL = `${MINI_MEDIEVAL_BASE}/Misc.png`;
const OVERWORLD_SHEET_URL = `${MINI_MEDIEVAL_BASE}/Overworld.png`;
const ANIMALS_SHEET_URL = `${MINI_MEDIEVAL_BASE}/Animals.png`;

interface GridCanvasProps {
  world: WorldState;
  size: number;
  selectedId: string | null;
  selectedTile?: { x: number; y: number } | null;
  onClick: (gridX: number, gridY: number) => void;
}

interface SpriteAssets {
  units: HTMLImageElement;
  structures: HTMLImageElement;
  misc: HTMLImageElement;
  overworld: HTMLImageElement;
  animals: HTMLImageElement;
}


const TRIBE_COLORS: Record<number, [number, number, number]> = {
  0: [220, 60, 60],   // Red
  1: [60, 100, 220],  // Blue
  2: [60, 180, 60],   // Green
  [-1]: [180, 140, 60], // Ronin
};

function entityColor(entity: Entity, villages: Village[]): string {
  const base = TRIBE_COLORS[entity.tribe]
    ?? villages.find(v => v.tribe === entity.tribe)?.color
    ?? [150, 150, 150];
  return `rgb(${base[0]},${base[1]},${base[2]})`;
}

function isEntityAtHome(entity: Entity, world: WorldState): boolean {
  if (!entity.homeId) return false;
  const home = world.houses.find(house => house.id === entity.homeId);
  return !!home
    && entity.position.x === home.position.x
    && entity.position.y === home.position.y;
}

function drawPersonSprite(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteAssets,
  cx: number,
  cy: number,
  cellSize: number,
  gender: string,
  tribe: number,
  isChild: boolean,
  tileX: number,
  tileY: number,
) {
  const maleFrames = [{ sx: 0, sy: 32 }, { sx: 0, sy: 64 }, { sx: 0, sy: 56 }];
  const femaleFrames = [{ sx: 0, sy: 96 }, { sx: 0, sy: 128 }, { sx: 8, sy: 120 }];
  const frame = gender === 'male'
    ? maleFrames[Math.max(0, Math.min(2, tribe))]
    : femaleFrames[Math.max(0, Math.min(2, tribe))];
  const srcSize = 8;
  const renderScale = isChild ? 0.68 : 0.82;
  const dstSize = Math.max(8, cellSize * renderScale);
  const rawDx = cx - dstSize / 2;
  const rawDy = cy - dstSize / 2;
  const tileLeft = tileX * cellSize;
  const tileTop = tileY * cellSize;
  const minDx = tileLeft;
  const maxDx = tileLeft + cellSize - dstSize;
  const minDy = tileTop;
  const maxDy = tileTop + cellSize - dstSize;
  const dx = Math.max(minDx, Math.min(maxDx, rawDx));
  const dy = Math.max(minDy, Math.min(maxDy, rawDy));

  ctx.beginPath();
  ctx.ellipse(cx, cy + cellSize * 0.34, dstSize * 0.2, dstSize * 0.1, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.fill();

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprites.units, frame.sx, frame.sy, srcSize, srcSize, dx, dy, dstSize, dstSize);
}

function drawHouseSprite(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteAssets,
  x: number,
  y: number,
  cellSize: number,
  tribe: number,
) {
  const rowByTribe = [80, 48, 0];
  const srcX = 0;
  const srcY = rowByTribe[Math.max(0, Math.min(2, tribe))];
  const srcW = 32;
  const srcH = 40;
  // Full cell width; roof may overshoot above the tile.
  const dstW = cellSize;
  const dstH = cellSize * (srcH / srcW); // preserve aspect ratio
  const dx = Math.round(x);
  const dy = Math.round(y + cellSize - dstH); // bottom-aligned, roof sticks up
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprites.structures, srcX, srcY, srcW, srcH, dx, dy, Math.round(dstW), Math.round(dstH));
}

function drawStockpileSprite(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteAssets,
  x: number,
  y: number,
  cellSize: number,
  _color: [number, number, number],
  tick: number,
) {
  // Campfire: 2 tiles tall (top + bottom), 8 animation frames
  // Top: Structures.png|(72 + frame*8), 504, 8, 8
  // Bottom: Structures.png|(72 + frame*8), 512, 8, 8
  const frame = Math.floor(tick / 8) % 8;
  const srcX = 72 + frame * 8;
  const dstW = cellSize;
  const dstH = cellSize;

  ctx.imageSmoothingEnabled = false;
  // Bottom half (base of fire) at cell position
  ctx.drawImage(sprites.structures, srcX, 512, 8, 8, Math.round(x), Math.round(y), Math.round(dstW), Math.round(dstH));
  // Top half (flames) above the cell
  ctx.drawImage(sprites.structures, srcX, 504, 8, 8, Math.round(x), Math.round(y - dstH), Math.round(dstW), Math.round(dstH));
}

function drawRoadTileSprite(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteAssets,
  x: number,
  y: number,
  cellSize: number,
) {
  const srcX = 32;
  const srcY = 320;
  const srcW = 8;
  const srcH = 8;
  const dstW = cellSize;
  const dstH = cellSize;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprites.overworld, srcX, srcY, srcW, srcH, x, y, Math.round(dstW), Math.round(dstH));
}

// Animal animation frames (2 frames each, idle + running)
const ANIMAL_IDLE = {
  female: [{ sx: 0, sy: 464 }, { sx: 8, sy: 464 }],
  male:   [{ sx: 0, sy: 472 }, { sx: 8, sy: 472 }],
};
const ANIMAL_RUN = {
  female: [{ sx: 80, sy: 464 }, { sx: 88, sy: 464 }],
  male:   [{ sx: 80, sy: 472 }, { sx: 88, sy: 472 }],
};

function drawAnimalSprite(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteAssets,
  cx: number,
  cy: number,
  cellSize: number,
  gender: 'male' | 'female',
  frameIdx: number,
  moving: boolean,
  facingLeft: boolean,
) {
  const frames = moving ? ANIMAL_RUN[gender] : ANIMAL_IDLE[gender];
  const frame = frames[frameIdx % frames.length];
  const dstW = cellSize * 0.86;
  const dstH = cellSize * 0.86;
  const dx = Math.round(cx - dstW / 2);
  const dy = Math.round(cy - dstH / 2);
  ctx.imageSmoothingEnabled = false;
  if (facingLeft) {
    ctx.save();
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(sprites.animals, frame.sx, frame.sy, 8, 8,
      Math.round(-dstW / 2), dy, Math.round(dstW), Math.round(dstH));
    ctx.restore();
  } else {
    ctx.drawImage(sprites.animals, frame.sx, frame.sy, 8, 8, dx, dy, Math.round(dstW), Math.round(dstH));
  }
}

type ActionBadge = 'fight' | 'train' | 'hunt' | 'gather' | 'chop' | 'build';

function drawActionBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, cellSize: number, kind: ActionBadge) {
  const palette: Record<ActionBadge, { bg: string; fg: string; label: string }> = {
    fight: { bg: '#b83b5e', fg: '#fff', label: 'F' },
    train: { bg: '#4e6bb8', fg: '#fff', label: 'T' },
    hunt: { bg: '#8d6e63', fg: '#fff', label: 'H' },
    gather: { bg: '#3e8f4e', fg: '#fff', label: 'G' },
    chop: { bg: '#a0733d', fg: '#fff', label: 'C' },
    build: { bg: '#7a5ec9', fg: '#fff', label: 'B' },
  };
  const p = palette[kind];
  const r = Math.max(5, cellSize * 0.17);
  const by = cy - cellSize * 0.42;
  ctx.beginPath();
  ctx.arc(cx, by, r, 0, Math.PI * 2);
  ctx.fillStyle = p.bg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = Math.max(0.8, cellSize * 0.03);
  ctx.stroke();
  ctx.fillStyle = p.fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.max(8, Math.floor(cellSize * 0.24))}px system-ui`;
  ctx.fillText(p.label, cx, by + 0.5);
}

// --- Position interpolation ---
interface PosRecord { x: number; y: number }

function lerpPos(prev: PosRecord, curr: PosRecord, t: number): PosRecord {
  return { x: prev.x + (curr.x - prev.x) * t, y: prev.y + (curr.y - prev.y) * t };
}

export function GridCanvas({ world, size, selectedId, selectedTile, onClick }: GridCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backgroundCacheRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const spritesRef = useRef<SpriteAssets | null>(null);
  const [, setSpritesVersion] = useState(0);

  // Interpolation state
  const prevEntityPos = useRef<Map<string, PosRecord>>(new Map());
  const prevAnimalPos = useRef<Map<string, PosRecord>>(new Map());
  const lastTickRef = useRef(0);
  const tickTimeRef = useRef(performance.now());
  const tickIntervalRef = useRef(300); // measured ms between ticks

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = size / rect.width;
    const x = Math.floor((e.clientX - rect.left) * scale / (size / world.gridSize));
    const y = Math.floor((e.clientY - rect.top) * scale / (size / world.gridSize));
    onClick(x, y);
  };

  useEffect(() => {
    let cancelled = false;
    const units = new Image();
    const structures = new Image();
    const misc = new Image();
    const overworld = new Image();
    const animals = new Image();
    let loaded = 0;
    const done = () => {
      loaded++;
      if (loaded < 5 || cancelled) return;
      spritesRef.current = { units, structures, misc, overworld, animals };
      setSpritesVersion(v => v + 1);
    };
    units.onload = done;
    structures.onload = done;
    misc.onload = done;
    overworld.onload = done;
    animals.onload = done;
    units.onerror = done;
    structures.onerror = done;
    misc.onerror = done;
    overworld.onerror = done;
    animals.onerror = done;
    units.src = UNITS_SHEET_URL;
    structures.src = STRUCTURES_SHEET_URL;
    misc.src = MISC_SHEET_URL;
    overworld.src = OVERWORLD_SHEET_URL;
    animals.src = ANIMALS_SHEET_URL;
    return () => { cancelled = true; };
  }, []);

  // Track previous positions: when tick changes, what was "current" becomes "prev"
  const currEntityPos = useRef<Map<string, PosRecord>>(new Map());
  const currAnimalPos = useRef<Map<string, PosRecord>>(new Map());

  if (world.tick !== lastTickRef.current) {
    // Measure actual tick interval for smooth lerp
    const now = performance.now();
    const interval = now - tickTimeRef.current;
    if (interval > 10 && interval < 5000) tickIntervalRef.current = interval;
    // Promote current → prev
    prevEntityPos.current = currEntityPos.current;
    prevAnimalPos.current = currAnimalPos.current;
    lastTickRef.current = world.tick;
    tickTimeRef.current = now;
  }
  // Always snapshot current positions
  const eMap = new Map<string, PosRecord>();
  for (const e of world.entities) eMap.set(e.id, { ...e.position });
  currEntityPos.current = eMap;
  const aMap = new Map<string, PosRecord>();
  for (const a of world.animals) aMap.set(a.id, { ...a.position });
  currAnimalPos.current = aMap;

  // rAF render loop — runs at 60fps, interpolates positions between ticks
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf: number;
    let frameCount = 0;

    const draw = () => {
    frameCount++;

    // Wait for sprites to load — don't render fallback shapes
    if (!spritesRef.current) { raf = requestAnimationFrame(draw); return; }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(size * dpr));
    canvas.height = Math.max(1, Math.floor(size * dpr));
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) { raf = requestAnimationFrame(draw); return; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Interpolation progress: 0→1 between ticks, using measured tick interval
    const elapsed = performance.now() - tickTimeRef.current;
    const t = Math.min(1, elapsed / tickIntervalRef.current);

    const cellSize = size / world.gridSize;
    const ticksPerMonth = TICKS_PER_DAY * 10;
    const month = Math.floor((world.tick % TICKS_PER_YEAR) / ticksPerMonth);
    const seasonIdx = Math.floor(month / 3);
    const season: Season = seasonIdx === 0 ? 'spring' : seasonIdx === 1 ? 'summer' : seasonIdx === 2 ? 'autumn' : 'winter';
    const terrainSpritesReady = !!spritesRef.current?.overworld;
    const backgroundKey = [
      size,
      dpr,
      world.gridSize,
      world.biomes.map(row => row.join('')).join(''),
      world.villages.map(v => `${v.tribe}:${v.color.join(',')}`).join('|'),
      terrainSpritesReady ? 'terrainSprites:1' : 'terrainSprites:0',
    ].join('|');

    if (backgroundCacheRef.current?.key !== backgroundKey) {
      const background = document.createElement('canvas');
      background.width = Math.max(1, Math.floor(size * dpr));
      background.height = Math.max(1, Math.floor(size * dpr));
      const bg = background.getContext('2d');
      if (!bg) return;
      bg.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Surface layer (biome background colors) via shared renderer
      drawSurfaceLayer(bg, world.biomes, world.gridSize, cellSize, spritesRef.current?.overworld);

      // Bake road sprite tiles into cached background layer.
      if (terrainSpritesReady && spritesRef.current) {
        for (let y = 0; y < world.gridSize; y++) {
          for (let x = 0; x < world.gridSize; x++) {
            if (world.biomes[y][x] !== 'road') continue;
            drawRoadTileSprite(bg, spritesRef.current, x * cellSize, y * cellSize, cellSize);
          }
        }
      }

      backgroundCacheRef.current = { key: backgroundKey, canvas: background };
    }

    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(backgroundCacheRef.current.canvas, 0, 0, size, size);
    const sprites = spritesRef.current;

    // --- Layer 1: Water + Shore (animated, shared renderer) ---
    if (sprites) {
      drawWaterLayer(ctx, sprites.overworld, world.biomes, world.gridSize, cellSize, Math.floor(frameCount / 6));
    }

    // --- Layer 2: Trees (shared renderer) ---
    if (sprites) {
      drawTreeLayer(ctx, sprites.overworld, world.trees, cellSize, season, world.biomes);
    }

    // --- Layer 2b: Structures (stockpiles, houses) ---
    for (const village of world.villages) {
      if (!village.stockpile) continue;
      const sx = village.stockpile.x * cellSize;
      const sy = village.stockpile.y * cellSize;
      drawStockpileSprite(ctx, sprites, sx, sy, cellSize, village.color, Math.floor(frameCount / 6));
    }

    for (const house of world.houses) {
      const hx = house.position.x * cellSize;
      const hy = house.position.y * cellSize;
      drawHouseSprite(ctx, sprites, hx, hy, cellSize, house.tribe);
    }

    // --- Draw animals (interpolated) ---
    for (const animal of world.animals) {
      const prev = prevAnimalPos.current.get(animal.id) ?? animal.position;
      const pos = lerpPos(prev, animal.position, t);
      const cx = pos.x * cellSize + cellSize / 2;
      const cy = pos.y * cellSize + cellSize / 2;
      const moving = prev.x !== animal.position.x || prev.y !== animal.position.y;
      const facingLeft = animal.position.x < prev.x;
      const animalFrame = moving
        ? Math.floor(frameCount / 15) % 2   // running: faster animation (~0.25s)
        : Math.floor(frameCount / 60) % 2;  // idle: slow animation (~1s)
      drawAnimalSprite(ctx, sprites, cx, cy, cellSize, animal.gender, animalFrame, moving, facingLeft);
    }

    // --- Group entities by tile ---
    const tileMap = new Map<number, Entity[]>();
    for (const entity of world.entities) {
      if (isEntityAtHome(entity, world)) continue;
      const key = entity.position.y * world.gridSize + entity.position.x;
      const group = tileMap.get(key);
      if (group) {
        group.push(entity);
      } else {
        tileMap.set(key, [entity]);
      }
    }

    // Collect draw data
    interface DrawData {
      cx: number; cy: number;
      color: string; gender: string;
      tribe: number;
      age: number; state: string;
      energy: number;
      id: string;
      child: boolean;
      tileX: number;
      tileY: number;
    }
    const draws: DrawData[] = [];
    const tileIcons: Array<{ cx: number; cy: number; kind: ActionBadge }> = [];

    for (const [, group] of tileMap) {
      const count = group.length;
      const hasFighting = group.some(e => e.state === 'fighting');
      const hasTraining = group.some(e => e.state === 'training');
      const hasHunting = group.some(e => e.state === 'hunting');
      const hasGathering = group.some(e => e.state === 'gathering');

      for (let i = 0; i < count; i++) {
        const entity = group[i];
        const prev = prevEntityPos.current.get(entity.id) ?? entity.position;
        const pos = lerpPos(prev, entity.position, t);
        const baseCx = pos.x * cellSize + cellSize / 2;
        const baseCy = pos.y * cellSize + cellSize / 2;

        let cx = baseCx;
        let cy = baseCy;
        if (count === 2) {
          const offset = cellSize * 0.22;
          cx = baseCx + (i === 0 ? -offset : offset);
        } else if (count > 2) {
          const angle = (i / count) * Math.PI * 2;
          const dist = cellSize * 0.25;
          cx = baseCx + Math.cos(angle) * dist;
          cy = baseCy + Math.sin(angle) * dist;
        }

        draws.push({
          cx, cy,
          color: entityColor(entity, world.villages),
          gender: entity.gender,
          tribe: entity.tribe,
          age: ageInYears(entity),
          state: entity.state,
          energy: entity.energy,
          id: entity.id,
          child: ageInYears(entity) < CHILD_AGE,
          tileX: entity.position.x,
          tileY: entity.position.y,
        });
      }

      const baseCx = group[0].position.x * cellSize + cellSize / 2;
      const baseCy = group[0].position.y * cellSize + cellSize / 2;
      if (hasFighting) {
        tileIcons.push({ cx: baseCx, cy: baseCy, kind: 'fight' });
      } else if (hasTraining) {
        tileIcons.push({ cx: baseCx, cy: baseCy, kind: 'train' });
      } else if (hasHunting) {
        tileIcons.push({ cx: baseCx, cy: baseCy, kind: 'hunt' });
      } else if (hasGathering) {
        tileIcons.push({ cx: baseCx, cy: baseCy, kind: 'gather' });
      } else if (group.some(e => e.state === 'chopping')) {
        tileIcons.push({ cx: baseCx, cy: baseCy, kind: 'chop' });
      } else if (group.some(e => e.state === 'building')) {
        tileIcons.push({ cx: baseCx, cy: baseCy, kind: 'build' });
      }
    }

    // Draw person figures
    for (const { cx, cy, gender, tribe, child, tileX, tileY } of draws) {
      drawPersonSprite(ctx, sprites, cx, cy, cellSize, gender, tribe, child, tileX, tileY);
    }

    // Keep text defaults predictable for next draw passes
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '10px system-ui';

    // Draw tracking lines — males to nearest animal, females to nearest plant
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 0.5;
    for (const entity of world.entities) {
      if (isEntityAtHome(entity, world)) continue;
      if (entity.state !== 'idle' || ageInYears(entity) < CHILD_AGE) continue;
      // Skip idle entities at home (not foraging)
      const ePrev = prevEntityPos.current.get(entity.id) ?? entity.position;
      const ePos = lerpPos(ePrev, entity.position, t);
      const ex = ePos.x * cellSize + cellSize / 2;
      const ey = ePos.y * cellSize + cellSize / 2;
      const sense = 3 + entity.traits.perception * 2;

      if (entity.gender === 'male') {
        // Find nearest animal in range
        let bestD = sense + 1;
        let tx = -1, ty = -1;
        for (const a of world.animals) {
          const d = Math.abs(a.position.x - entity.position.x) + Math.abs(a.position.y - entity.position.y);
          if (d > 0 && d <= sense && d < bestD) {
            bestD = d;
            tx = a.position.x * cellSize + cellSize / 2;
            ty = a.position.y * cellSize + cellSize / 2;
          }
        }
        if (tx >= 0) {
          ctx.strokeStyle = 'rgba(139, 110, 99, 0.4)';
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(tx, ty);
          ctx.stroke();
        }
      } else {
        // Find nearest fruit tree in range
        let bestD = sense + 1;
        let tx = -1, ty = -1;
        for (const t of world.trees) {
          if (!t.hasFruit || t.fruitPortions <= 0) continue;
          const d = Math.abs(t.position.x - entity.position.x) + Math.abs(t.position.y - entity.position.y);
          if (d > 0 && d <= sense && d < bestD) {
            bestD = d;
            tx = t.position.x * cellSize + cellSize / 2;
            ty = t.position.y * cellSize + cellSize / 2;
          }
        }
        if (tx >= 0) {
          ctx.strokeStyle = 'rgba(76, 175, 80, 0.4)';
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(tx, ty);
          ctx.stroke();
        }
      }
    }
    ctx.setLineDash([]);

    // Draw tile action badges
    if (tileIcons.length < 300) {
      for (const { cx, cy, kind } of tileIcons) {
        drawActionBadge(ctx, cx, cy, cellSize, kind);
      }
    }

    // Draw tile selection highlight
    if (selectedTile) {
      ctx.strokeStyle = '#e0af68';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        selectedTile.x * cellSize + 1,
        selectedTile.y * cellSize + 1,
        cellSize - 2,
        cellSize - 2,
      );
    }

    // Draw entity selection highlight
    if (selectedId) {
      const sel = draws.find(d => d.id === selectedId);
      if (sel) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          sel.cx - cellSize * 0.4,
          sel.cy - cellSize * 0.45,
          cellSize * 0.8,
          cellSize * 0.9,
        );
      }
    }
    raf = requestAnimationFrame(draw);
    }; // end draw()

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [world, size, selectedId, selectedTile]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ borderRadius: '4px', cursor: 'pointer', width: `${size}px`, height: `${size}px` }}
      onClick={handleClick}
    />
  );
}
