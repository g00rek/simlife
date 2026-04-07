import { useRef, useEffect } from 'react';
import type { WorldState, Entity } from '../engine/types';
import { CHILD_AGE } from '../engine/types';
import { ageInYears } from '../engine/world';

const GRID_BG = '#1a1b26';
const GRID_LINE = '#2a2b36';

interface GridCanvasProps {
  world: WorldState;
  size: number;
  selectedId: string | null;
  onClick: (gridX: number, gridY: number) => void;
}

const TRIBE_COLORS: Record<number, [number, number, number]> = {
  0: [220, 60, 60],   // Red tribe
  1: [60, 180, 60],   // Green tribe
  2: [60, 100, 220],  // Blue tribe
  [-1]: [180, 140, 60], // Ronin (gold/brown)
};

function entityColor(entity: Entity): string {
  const [r, g, b] = TRIBE_COLORS[entity.tribe] ?? [150, 150, 150];
  return `rgb(${r},${g},${b})`;
}

function drawPerson(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  cellSize: number,
  gender: string,
  color: string,
  isChild: boolean,
) {
  const scale = isChild ? 0.22 : 0.38;
  const s = cellSize * scale;
  const headR = s * 0.3;
  const headY = cy - s * (isChild ? 0.15 : 0.35);

  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.beginPath();
  if (isChild) {
    // Small round body for children
    const br = s * 0.35;
    ctx.arc(cx, headY + headR + br * 0.8, br, 0, Math.PI * 2);
  } else if (gender === 'male') {
    const bw = s * 0.5;
    const bh = s * 0.55;
    const by = headY + headR + s * 0.04;
    ctx.rect(cx - bw / 2, by, bw, bh);
  } else {
    const tw = s * 0.6;
    const th = s * 0.6;
    const ty = headY + headR + s * 0.04;
    ctx.moveTo(cx, ty);
    ctx.lineTo(cx - tw / 2, ty + th);
    ctx.lineTo(cx + tw / 2, ty + th);
    ctx.closePath();
  }
  ctx.fillStyle = color;
  ctx.fill();
}

export function GridCanvas({ world, size, selectedId, onClick }: GridCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cellSize = size / world.gridSize;
    const x = Math.floor((e.clientX - rect.left) / cellSize);
    const y = Math.floor((e.clientY - rect.top) / cellSize);
    onClick(x, y);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cellSize = size / world.gridSize;

    // Background — biome colors
    const biomeColors: Record<string, string> = {
      plains: '#2a2a1e',
      forest: '#1a2e1a',
      mountain: '#3a3a3a',
      water: '#1a2a3e',
    };

    for (let y = 0; y < world.gridSize; y++) {
      for (let x = 0; x < world.gridSize; x++) {
        const biome = world.biomes[y][x];
        ctx.fillStyle = biomeColors[biome] || GRID_BG;
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }

    // Grid lines
    if (cellSize >= 4) {
      ctx.beginPath();
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth = 0.3;
      for (let i = 0; i <= world.gridSize; i++) {
        const pos = i * cellSize;
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, size);
        ctx.moveTo(0, pos);
        ctx.lineTo(size, pos);
      }
      ctx.stroke();
    }

    // --- Draw village borders (palisade) ---
    for (const village of world.villages) {
      const [r, g, b] = village.color;
      ctx.strokeStyle = `rgba(${r},${g},${b},0.5)`;
      ctx.lineWidth = 2;
      // Draw border around village area
      for (let y = 0; y < world.gridSize; y++) {
        for (let x = 0; x < world.gridSize; x++) {
          const inside = Math.abs(x - village.center.x) + Math.abs(y - village.center.y) <= village.radius;
          if (!inside) continue;
          const px = x * cellSize;
          const py = y * cellSize;
          // Check each edge — draw border if neighbor is outside
          if (Math.abs((x - 1) - village.center.x) + Math.abs(y - village.center.y) > village.radius) {
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + cellSize); ctx.stroke();
          }
          if (Math.abs((x + 1) - village.center.x) + Math.abs(y - village.center.y) > village.radius) {
            ctx.beginPath(); ctx.moveTo(px + cellSize, py); ctx.lineTo(px + cellSize, py + cellSize); ctx.stroke();
          }
          if (Math.abs(x - village.center.x) + Math.abs((y - 1) - village.center.y) > village.radius) {
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + cellSize, py); ctx.stroke();
          }
          if (Math.abs(x - village.center.x) + Math.abs((y + 1) - village.center.y) > village.radius) {
            ctx.beginPath(); ctx.moveTo(px, py + cellSize); ctx.lineTo(px + cellSize, py + cellSize); ctx.stroke();
          }
        }
      }
    }

    // --- Draw plants (green = growing, red = ready) ---
    for (const plant of world.plants) {
      const cx = plant.position.x * cellSize + cellSize / 2;
      const cy = plant.position.y * cellSize + cellSize / 2;
      const r = plant.mature ? cellSize * 0.18 : cellSize * 0.12;
      ctx.fillStyle = plant.mature ? '#e53935' : '#4caf50';
      ctx.beginPath();
      ctx.arc(cx, cy + cellSize * 0.3, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Draw animals (brown diamonds) ---
    ctx.fillStyle = '#8d6e63';
    for (const animal of world.animals) {
      const cx = animal.position.x * cellSize + cellSize / 2;
      const cy = animal.position.y * cellSize + cellSize / 2;
      const s = cellSize * 0.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx + s, cy);
      ctx.lineTo(cx, cy + s);
      ctx.lineTo(cx - s, cy);
      ctx.closePath();
      ctx.fill();
    }

    // --- Group entities by tile ---
    const tileMap = new Map<number, Entity[]>();
    for (const entity of world.entities) {
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
      age: number; state: string;
      energy: number;
      id: string;
      child: boolean;
    }
    const draws: DrawData[] = [];
    const tileIcons: Array<{ cx: number; cy: number; icon: string }> = [];

    for (const [, group] of tileMap) {
      const count = group.length;
      const hasMating = group.some(e => e.state === 'mating');
      const hasFighting = group.some(e => e.state === 'fighting');
      const hasHunting = group.some(e => e.state === 'hunting');
      const hasGathering = group.some(e => e.state === 'gathering');

      for (let i = 0; i < count; i++) {
        const entity = group[i];
        const baseCx = entity.position.x * cellSize + cellSize / 2;
        const baseCy = entity.position.y * cellSize + cellSize / 2;

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
          color: entityColor(entity),
          gender: entity.gender,
          age: ageInYears(entity),
          state: entity.state,
          energy: entity.energy,
          id: entity.id,
          child: ageInYears(entity) < CHILD_AGE,
        });
      }

      const baseCx = group[0].position.x * cellSize + cellSize / 2;
      const baseCy = group[0].position.y * cellSize + cellSize / 2;
      if (hasFighting) {
        tileIcons.push({ cx: baseCx, cy: baseCy, icon: '⚔' });
      } else if (hasMating) {
        tileIcons.push({ cx: baseCx, cy: baseCy, icon: '❤' });
      } else if (hasHunting) {
        tileIcons.push({ cx: baseCx, cy: baseCy, icon: '🏹' });
      } else if (hasGathering) {
        tileIcons.push({ cx: baseCx, cy: baseCy, icon: '🌿' });
      }
    }

    // Draw person figures
    for (const { cx, cy, color, gender, child } of draws) {
      drawPerson(ctx, cx, cy, cellSize, gender, color, child);
    }

    // Draw age below figure
    const ageSize = Math.max(6, Math.floor(cellSize * 0.24));
    ctx.font = `bold ${ageSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#aaa';
    for (const { cx, cy, age } of draws) {
      ctx.fillText(String(age), cx, cy + cellSize * 0.28);
    }

    // Draw energy bar under age
    const barW = cellSize * 0.5;
    const barH = 2;
    for (const { cx, cy, energy } of draws) {
      const barY = cy + cellSize * 0.38;
      const barX = cx - barW / 2;
      const fill = energy / 100;
      // Background
      ctx.fillStyle = '#333';
      ctx.fillRect(barX, barY, barW, barH);
      // Fill (green → yellow → red)
      const r = fill < 0.5 ? 255 : Math.round(255 * (1 - fill) * 2);
      const g = fill > 0.5 ? 255 : Math.round(255 * fill * 2);
      ctx.fillStyle = `rgb(${r},${g},0)`;
      ctx.fillRect(barX, barY, barW * fill, barH);
    }

    // Draw tile icons
    if (tileIcons.length < 300) {
      const iconSize = Math.max(8, Math.floor(cellSize * 0.35));
      ctx.font = `${iconSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (const { cx, cy, icon } of tileIcons) {
        ctx.fillStyle = '#fff';
        ctx.fillText(icon, cx, cy - cellSize * 0.42);
      }
    }

    // Draw selection highlight
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
  }, [world, size, selectedId]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ borderRadius: '4px', cursor: 'pointer' }}
      onClick={handleClick}
    />
  );
}
