import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

const CELL = 24;
const COLS = 28;
const ROWS = 20;
// Corner grid is 1 larger than cell grid in each dimension
const CW = COLS + 1;
const CH = ROWS + 1;

const h = CELL / 2;

/**
 * Wang 2-Corner autotile: 16 tiles indexed by 4 binary corners.
 * Corner weights: NE=1, SE=2, SW=4, NW=8
 *
 * For each cell, look up its 4 corners and draw the boundary line
 * separating 1-corners (water) from 0-corners (land).
 */
function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, index: number) {
  const px = x * CELL;
  const py = y * CELL;
  const cx = px + h; // cell center x
  const cy = py + h; // cell center y

  ctx.beginPath();
  switch (index) {
    case 0: case 15: break; // all same → no boundary

    // 1 corner → convex arc (quarter circle, center at that corner)
    case 1: /* NE */ ctx.arc(px + CELL, py, h, Math.PI / 2, Math.PI); break;
    case 2: /* SE */ ctx.arc(px + CELL, py + CELL, h, Math.PI, 1.5 * Math.PI); break;
    case 4: /* SW */ ctx.arc(px, py + CELL, h, 1.5 * Math.PI, 2 * Math.PI); break;
    case 8: /* NW */ ctx.arc(px, py, h, 0, Math.PI / 2); break;

    // 2 adjacent corners → straight line
    case 3:  /* NE+SE */ ctx.moveTo(cx, py); ctx.lineTo(cx, py + CELL); break;       // │ (right side water)
    case 6:  /* SE+SW */ ctx.moveTo(px, cy); ctx.lineTo(px + CELL, cy); break;        // ─ (bottom water)
    case 12: /* NW+SW */ ctx.moveTo(cx, py); ctx.lineTo(cx, py + CELL); break;        // │ (left side water)
    case 9:  /* NW+NE */ ctx.moveTo(px, cy); ctx.lineTo(px + CELL, cy); break;        // ─ (top water)

    // 2 diagonal corners (saddle) → two convex arcs
    case 5:  /* NE+SW */
      ctx.arc(px + CELL, py, h, Math.PI / 2, Math.PI);
      ctx.moveTo(px + h, py + CELL);
      ctx.arc(px, py + CELL, h, 1.5 * Math.PI, 2 * Math.PI);
      break;
    case 10: /* NW+SE */
      ctx.arc(px, py, h, 0, Math.PI / 2);
      ctx.moveTo(px + CELL, py + h);
      ctx.arc(px + CELL, py + CELL, h, Math.PI, 1.5 * Math.PI);
      break;

    // 3 corners → concave arc (quarter circle, center at cell center, curving toward lone land corner)
    case 7:  /* NE+SE+SW, land=NW */ ctx.arc(cx, cy, h, Math.PI, 1.5 * Math.PI); break;
    case 11: /* NW+NE+SE, land=SW */ ctx.arc(cx, cy, h, 0.5 * Math.PI, Math.PI); break;
    case 13: /* NW+NE+SW, land=SE */ ctx.arc(cx, cy, h, 0, 0.5 * Math.PI); break;
    case 14: /* NW+SE+SW, land=NE */ ctx.arc(cx, cy, h, 1.5 * Math.PI, 2 * Math.PI); break;
  }
  if (index !== 0 && index !== 15) ctx.stroke();
}

/** Build the corner grid index for cell (x,y). */
function cornerIndex(corners: number[][], x: number, y: number): number {
  const nw = corners[y][x];
  const ne = corners[y][x + 1];
  const sw = corners[y + 1][x];
  const se = corners[y + 1][x + 1];
  return ne * 1 + se * 2 + sw * 4 + nw * 8;
}

/** Generate a blob on the corner grid using deformed circle. */
function generateCorners(seed: number): number[][] {
  const grid: number[][] = [];
  for (let y = 0; y < CH; y++) {
    const row: number[] = [];
    for (let x = 0; x < CW; x++) row.push(0);
    grid.push(row);
  }

  const cx = CW / 2, cy = CH / 2;
  const baseR = 5;

  // Deformed radius per angle
  const N = 64;
  const radii: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * 2 * Math.PI;
    radii.push(baseR + 1.5 * Math.sin(a * 2 + seed) + 1.0 * Math.cos(a * 3 + seed * 1.7));
  }

  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const fi = ((angle / (2 * Math.PI)) % 1 + 1) % 1 * N;
      const i0 = Math.floor(fi) % N;
      const i1 = (i0 + 1) % N;
      const t = fi - Math.floor(fi);
      const r = radii[i0] * (1 - t) + radii[i1] * t;
      if (dist <= r) grid[y][x] = 1;
    }
  }

  return grid;
}

export function ShorePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [seed, setSeed] = useState(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = COLS * CELL;
    const H = ROWS * CELL;
    canvas.width = W;
    canvas.height = H;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= COLS; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL + 0.5, 0); ctx.lineTo(i * CELL + 0.5, H); ctx.stroke();
    }
    for (let i = 0; i <= ROWS; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * CELL + 0.5); ctx.lineTo(W, i * CELL + 0.5); ctx.stroke();
    }

    // Generate corners and draw outline
    const corners = generateCorners(seed);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        drawCell(ctx, x, y, cornerIndex(corners, x, y));
      }
    }
  }, [seed]);

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <h1 style={{ margin: 0 }}>/shore</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <a href="/map" style={linkStyle}>/map</a>
          <a href="/" style={linkStyle}>/</a>
        </div>
      </header>
      <div style={toolbarStyle}>
        <button style={btnStyle} onClick={() => setSeed(s => s + 1)}>Regenerate</button>
        <span style={{ fontSize: 12, color: '#999' }}>seed: {seed}</span>
      </div>
      <canvas ref={canvasRef} style={canvasStyle} />
    </main>
  );
}

const pageStyle: CSSProperties = { minHeight: '100vh', background: '#fff', color: '#222', padding: 16, fontFamily: 'system-ui, sans-serif' };
const headerStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 };
const toolbarStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 };
const btnStyle: CSSProperties = { border: 'none', borderRadius: 6, padding: '6px 12px', fontWeight: 700, cursor: 'pointer', background: '#333', color: '#fff' };
const linkStyle: CSSProperties = { color: '#3b82f6', textDecoration: 'none', fontSize: 13 };
const canvasStyle: CSSProperties = { border: '1px solid #ccc', borderRadius: 8 };
