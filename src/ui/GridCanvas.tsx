import { useRef, useEffect } from 'react';
import type { WorldState } from '../engine/types';

const MALE_ICON = '👨';
const FEMALE_ICON = '👩';
const GRID_BG = '#1a1b26';
const GRID_LINE = '#2a2b36';

interface GridCanvasProps {
  world: WorldState;
  size: number;
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

    // Grid lines — single path for all lines, skip if cells too small
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

    // Group entities by tile (numeric key for speed)
    const tileMap = new Map<number, typeof world.entities>();
    for (const entity of world.entities) {
      const key = entity.position.y * world.gridSize + entity.position.x;
      const group = tileMap.get(key);
      if (group) {
        group.push(entity);
      } else {
        tileMap.set(key, [entity]);
      }
    }

    // Collect draw data per entity
    const draws: Array<{ cx: number; cy: number; icon: string; age: number; mating: boolean }> = [];
    const matingHearts: Array<{ cx: number; cy: number }> = [];

    for (const [, group] of tileMap) {
      const count = group.length;
      const hasMating = group.some(e => e.state === 'mating');

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
          icon: entity.gender === 'male' ? MALE_ICON : FEMALE_ICON,
          age: entity.age,
          mating: entity.state === 'mating',
        });
      }

      if (hasMating && count >= 2) {
        matingHearts.push({
          cx: group[0].position.x * cellSize + cellSize / 2,
          cy: group[0].position.y * cellSize + cellSize / 2,
        });
      }
    }

    // Draw person icons
    const iconSize = Math.max(10, Math.floor(cellSize * 0.55));
    ctx.font = `${iconSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const { cx, cy, icon } of draws) {
      ctx.fillText(icon, cx, cy - cellSize * 0.1);
    }

    // Draw age below icon
    const ageSize = Math.max(6, Math.floor(cellSize * 0.28));
    ctx.font = `bold ${ageSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#aaa';
    for (const { cx, cy, age } of draws) {
      ctx.fillText(String(age), cx, cy + cellSize * 0.15);
    }

    // Draw hearts for mating pairs
    if (matingHearts.length < 200) {
      const heartSize = Math.max(8, Math.floor(cellSize * 0.35));
      ctx.font = `${heartSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#f7768e';
      for (const { cx, cy } of matingHearts) {
        ctx.fillText('❤', cx, cy - cellSize * 0.4);
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
