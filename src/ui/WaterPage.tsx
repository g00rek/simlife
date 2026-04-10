import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Biome } from '../engine/types';
import { buildWaterTopology } from './terrain/waterAutotile';
import { drawTerrain, drawGridOverlay } from './terrain/renderer';

const MINI_MEDIEVAL_BASE = '/assets/mini-medieval/Mini-Medieval-8x8';
const OVERWORLD = `${MINI_MEDIEVAL_BASE}/Overworld.png`;
const CELL = 48;
const G = 15; // grid size

const WANG_NAMES: Record<number, string> = {
  0: '',
  1: 'cSW',   // convex SW
  2: 'cNW',   // convex NW
  3: 'eW',    // edge West
  4: 'cNE',   // convex NE
  5: 'sad',   // saddle NE+SW
  6: 'eN',    // edge North
  7: 'iNW',   // concave (inner) NW
  8: 'cSE',   // convex SE
  9: 'eS',    // edge South
  10: 'sad',  // saddle NW+SE
  11: 'iSW',  // concave (inner) SW
  12: 'eE',   // edge East
  13: 'iSE',  // concave (inner) SE
  14: 'iNE',  // concave (inner) NE
  15: 'W',    // full water
};

/**
 * Interesting test shape on a 15×15 grid.
 * An L-shaped water body with a bay to test concave corners.
 *
 *    0 1 2 3 4 5 6 7 8 9 ...
 *  3       W W W W W W
 *  4       W W W W W W
 *  5       W W W W W W
 *  6       W W W
 *  7       W W W
 *  8       W W W W W
 *  9       W W W W W
 * 10       W W W W W
 */
function createTestGrid(): Biome[][] {
  const grid: Biome[][] = Array.from({ length: G }, () =>
    Array.from({ length: G }, () => 'plains'),
  );
  const paint = (x1: number, y1: number, x2: number, y2: number) => {
    for (let y = y1; y <= y2; y++)
      for (let x = x1; x <= x2; x++)
        grid[y][x] = 'water';
  };
  // H-shape: left pillar + bridge + right pillar
  paint(2, 2, 4, 11);   // left pillar
  paint(9, 2, 11, 11);  // right pillar
  paint(5, 5, 8, 7);    // horizontal bridge
  return grid;
}

export function WaterPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sprite, setSprite] = useState<HTMLImageElement | null>(null);
  const biomes = useMemo(() => createTestGrid(), []);
  const topology = useMemo(() => buildWaterTopology(biomes), [biomes]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setSprite(img);
    img.src = OVERWORLD;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sprite) return;
    const ctx = canvas.getContext('2d')!;

    const W = G * CELL;
    const H = G * CELL;
    const LEGEND = 20;
    canvas.width = W + LEGEND;
    canvas.height = H + LEGEND;

    let tick = 0;
    let raf: number;

    const draw = () => {
      tick++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;

      // Terrain layers via shared renderer
      ctx.save();
      ctx.translate(LEGEND, LEGEND);
      drawTerrain({
        ctx, overworld: sprite, biomes, gridSize: G, cellSize: CELL, tick,
        season: 'summer', grid: true,
      });
      ctx.restore();

      // Axis labels
      ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.fillStyle = '#8cb4ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = 0; x < G; x++) {
        ctx.fillText(String(x), LEGEND + x * CELL + CELL / 2, 2);
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = 0; y < G; y++) {
        ctx.fillText(String(y), LEGEND - 4, LEGEND + y * CELL + CELL / 2);
      }

      // Wang tile labels
      ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (let y = 0; y < G; y++) {
        for (let x = 0; x < G; x++) {
          const idx = topology.wang[y]?.[x] ?? 0;
          const name = WANG_NAMES[idx] ?? '';
          if (!name) continue;
          ctx.fillStyle = idx === 15 ? 'rgba(255,255,255,0.7)' : '#000';
          ctx.fillText(name, LEGEND + x * CELL + 2, LEGEND + y * CELL + 2);
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [biomes, sprite, topology]);

  return (
    <main style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={h1Style}>/water</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <a href="/map" style={linkStyle}>/map</a>
          <a href="/shore" style={linkStyle}>/shore</a>
          <a href="/" style={linkStyle}>/</a>
        </div>
      </div>
      <canvas ref={canvasRef} style={canvasStyle} />
      <div style={metaStyle}>
        Wang 2-corner test &mdash; L-shape with bay (concave corners)
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = { minHeight: '100vh', background: '#12141c', color: '#d8deea', padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif' };
const headerStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' };
const h1Style: CSSProperties = { margin: 0, fontSize: '28px', letterSpacing: '0.02em' };
const canvasStyle: CSSProperties = { border: '1px solid #2f3648', borderRadius: '10px', imageRendering: 'pixelated', background: '#1b1f2b' };
const metaStyle: CSSProperties = { marginTop: 10, fontSize: 13, color: '#9fb0cf' };
const linkStyle: CSSProperties = { color: '#8cb4ff', textDecoration: 'none', fontSize: '13px' };
