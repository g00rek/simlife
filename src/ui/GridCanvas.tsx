import { useRef, useEffect } from 'react';
import type { WorldState } from '../engine/types';

const MALE_COLOR = '#7aa2f7';
const FEMALE_COLOR = '#f7768e';
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

    // Grid lines
    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= world.gridSize; i++) {
      const pos = i * cellSize;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();
    }

    // Entities
    for (const entity of world.entities) {
      const cx = entity.position.x * cellSize + cellSize / 2;
      const cy = entity.position.y * cellSize + cellSize / 2;
      const radius = cellSize * 0.35;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = entity.gender === 'male' ? MALE_COLOR : FEMALE_COLOR;
      ctx.fill();
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
