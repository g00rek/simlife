import { useRef, useEffect } from 'react';

interface Series {
  data: number[];
  color: string;
  label: string;
}

interface PopGraphProps {
  series: Series[];
  width: number;
  height: number;
}

export function PopGraph({ series, width, height }: PopGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || series.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#1a1b26';
    ctx.fillRect(0, 0, width, height);

    const maxLen = Math.max(...series.map(s => s.data.length));
    if (maxLen < 2) return;

    const allVals = series.flatMap(s => s.data);
    const max = Math.max(...allVals, 1);
    const step = width / (maxLen - 1);

    // Grid
    ctx.strokeStyle = '#2a2b36';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      const y = (i / 4) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Lines
    for (const s of series) {
      if (s.data.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < s.data.length; i++) {
        const x = i * step;
        const y = height - (s.data[i] / max) * (height - 4);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Max label
    ctx.fillStyle = '#555';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(max), width - 2, 10);

    // Legend
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'left';
    let lx = 3;
    for (const s of series) {
      ctx.fillStyle = s.color;
      ctx.fillText(s.label, lx, height - 3);
      lx += ctx.measureText(s.label).width + 6;
    }
  }, [series, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ borderRadius: '4px', border: '1px solid #333' }}
    />
  );
}
