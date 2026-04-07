import { useRef, useEffect } from 'react';
import type { WorldState, Entity } from '../engine/types';
import { ageInYears } from '../engine/world';

const GRID_BG = '#1a1b26';
const GRID_LINE = '#2a2b36';

interface GridCanvasProps {
  world: WorldState;
  size: number;
}

function entityColor(entity: Entity): string {
  const [r, g, b] = entity.color;
  return `rgb(${r},${g},${b})`;
}

function drawPerson(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  cellSize: number,
  gender: string,
  color: string,
) {
  const s = cellSize * 0.38; // scale factor
  const headR = s * 0.3;
  const headY = cy - s * 0.35;

  // Head (circle)
  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Body
  ctx.beginPath();
  if (gender === 'male') {
    // Rectangle body (broader shoulders)
    const bw = s * 0.5;
    const bh = s * 0.55;
    const by = headY + headR + s * 0.04;
    ctx.rect(cx - bw / 2, by, bw, bh);
  } else {
    // Triangle body (dress/skirt shape)
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

export function GridCanvas({ world, size }: GridCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cellSize = size / world.gridSize;

    // Background
    ctx.fillStyle = GRID_BG;
    ctx.fillRect(0, 0, size, size);

    // Grid lines
    if (cellSize >= 4) {
      ctx.beginPath();
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= world.gridSize; i++) {
        const pos = i * cellSize;
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, size);
        ctx.moveTo(0, pos);
        ctx.lineTo(size, pos);
      }
      ctx.stroke();
    }

    // Group entities by tile
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
    }
    const draws: DrawData[] = [];
    const tileIcons: Array<{ cx: number; cy: number; icon: string }> = [];

    for (const [, group] of tileMap) {
      const count = group.length;
      const hasMating = group.some(e => e.state === 'mating');
      const hasFighting = group.some(e => e.state === 'fighting');

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
        });
      }

      const baseCx = group[0].position.x * cellSize + cellSize / 2;
      const baseCy = group[0].position.y * cellSize + cellSize / 2;
      if (hasFighting) {
        tileIcons.push({ cx: baseCx, cy: baseCy, icon: '⚔' });
      } else if (hasMating && count >= 2) {
        tileIcons.push({ cx: baseCx, cy: baseCy, icon: '❤' });
      }
    }

    // Draw person figures
    for (const { cx, cy, color, gender } of draws) {
      drawPerson(ctx, cx, cy, cellSize, gender, color);
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

    // Draw tile icons (hearts / swords)
    if (tileIcons.length < 300) {
      const iconSize = Math.max(8, Math.floor(cellSize * 0.35));
      ctx.font = `${iconSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (const { cx, cy, icon } of tileIcons) {
        ctx.fillStyle = icon === '❤' ? '#f7768e' : '#ff9e64';
        ctx.fillText(icon, cx, cy - cellSize * 0.42);
      }
    }
  }, [world, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ borderRadius: '4px' }}
    />
  );
}
