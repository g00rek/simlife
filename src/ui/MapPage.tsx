import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Tree } from '../engine/types';
import { generateBiomeGrid, DEFAULT_BIOME_PARAMS } from '../engine/biomes';
import type { BiomeGenParams } from '../engine/biomes';
import { drawTerrain } from './terrain/renderer';

const MINI_MEDIEVAL_BASE = '/assets/mini-medieval/Mini-Medieval-8x8';
const OVERWORLD_SHEET_URL = `${MINI_MEDIEVAL_BASE}/Overworld.png`;
const ORES_SHEET_URL = `${MINI_MEDIEVAL_BASE}/Ores.png`;
const DEFAULT_GRID_SIZE = 100;
// cellSize computed dynamically to fill viewport

const STORAGE_KEY = 'neurofolk-map-params';

function loadParams(): { gridSize: number; params: BiomeGenParams } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return {
        gridSize: saved.gridSize ?? DEFAULT_GRID_SIZE,
        params: { ...DEFAULT_BIOME_PARAMS, ...saved.params },
      };
    }
  } catch { /* ignore */ }
  return { gridSize: DEFAULT_GRID_SIZE, params: { ...DEFAULT_BIOME_PARAMS } };
}

function saveParams(gridSize: number, params: BiomeGenParams) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ gridSize, params }));
}

export function MapPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initial = useRef(loadParams()).current;
  const [gridSize, setGridSize] = useState(initial.gridSize);
  const [params, setParams] = useState<BiomeGenParams>(initial.params);
  const [biomes, setBiomes] = useState<Biome[][]>(() => generateBiomeGrid(initial.gridSize, initial.params));
  const [sprite, setSprite] = useState<HTMLImageElement | null>(null);
  const [oresSprite, setOresSprite] = useState<HTMLImageElement | null>(null);
  const [grassDensity, setGrassDensity] = useState(7);
  const [waveDensity, setWaveDensity] = useState(5);
  const [vpSize, setVpSize] = useState(Math.min(window.innerWidth - 320, window.innerHeight - 100));

  const regenerate = () => {
    saveParams(gridSize, params);
    setBiomes(generateBiomeGrid(gridSize, params));
  };

  // Trees: one per forest tile
  const trees = useMemo<Tree[]>(() => {
    const t: Tree[] = [];
    for (let y = 0; y < biomes.length; y++)
      for (let x = 0; x < (biomes[y]?.length ?? 0); x++)
        if (biomes[y][x] === 'forest')
          t.push({ id: `t${x}_${y}`, position: { x, y }, chopped: false, fruiting: false, hasFruit: false });
    return t;
  }, [biomes]);

  useEffect(() => {
    const onResize = () => setVpSize(Math.min(window.innerWidth - 320, window.innerHeight - 100));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const cellSize = Math.max(2, Math.floor(vpSize / biomes.length));

  useEffect(() => {
    const img = new Image();
    img.onload = () => setSprite(img);
    img.src = OVERWORLD_SHEET_URL;
    const ores = new Image();
    ores.onload = () => setOresSprite(ores);
    ores.src = ORES_SHEET_URL;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sprite) return;
    const ctx = canvas.getContext('2d')!;
    const gs = biomes.length;
    const size = gs * cellSize;
    canvas.width = size;
    canvas.height = size;

    let tick = 0;
    let raf: number;
    const draw = () => {
      tick++;
      drawTerrain({
        ctx, overworld: sprite, ores: oresSprite ?? undefined, biomes, gridSize: gs, cellSize, tick,
        season: 'summer', trees, grassDensity, waveDensity,
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [biomes, sprite, cellSize, trees]);

  const updateParam = (key: keyof BiomeGenParams, value: number) => {
    setParams(prev => {
      const biomeKeys: (keyof BiomeGenParams)[] = ['waterPct', 'forestPct', 'mountainPct'];
      if (!biomeKeys.includes(key)) {
        const next = { ...prev, [key]: value };
        saveParams(gridSize, next);
        return next;
      }
      // Linked sliders: sum always ≤ 100, others shrink proportionally
      const next = { ...prev, [key]: value };
      const others = biomeKeys.filter(k => k !== key);
      const otherSum = others.reduce((s, k) => s + (next[k] as number), 0);
      const available = 100 - value;
      if (otherSum > available && otherSum > 0) {
        const scale = available / otherSum;
        for (const k of others) {
          (next as Record<string, number>)[k] = Math.round((next[k] as number) * scale);
        }
      }
      saveParams(gridSize, next);
      return next;
    });
  };

  const updateGridSize = (v: number) => {
    setGridSize(v);
    saveParams(v, params);
  };

  return (
    <main style={pageStyle}>
      <div style={toolbarStyle}>
        <button style={buttonStyle} onClick={regenerate}>Regenerate</button>
      </div>

      <div style={contentStyle}>
        <canvas ref={canvasRef} style={{ ...canvasStyle, width: biomes.length * cellSize, height: biomes.length * cellSize }} />
        <aside style={panelStyle}>
          <h3 style={h3Style}>Generation Parameters</h3>
          <ParamSlider label="Map size" value={gridSize} min={20} max={200} step={10}
            onChange={v => updateGridSize(v)} />
          <ParamSlider label="Water %" value={params.waterPct}
            min={0} max={100} step={1}
            onChange={v => updateParam('waterPct', v)} />
          <ParamSlider label="Forest %" value={params.forestPct}
            min={0} max={100} step={1}
            onChange={v => updateParam('forestPct', v)} />
          <ParamSlider label="Rocks %" value={params.mountainPct}
            min={0} max={100} step={1}
            onChange={v => updateParam('mountainPct', v)} />
          <div style={{ fontSize: 12, color: '#9aa4bf', margin: '6px 0' }}>
            Plains: {100 - params.waterPct - params.forestPct - params.mountainPct}%
          </div>
          <ParamSlider label="Grass detail %" value={grassDensity} min={0} max={100} step={1}
            onChange={v => setGrassDensity(v)} />
          <ParamSlider label="Wave density %" value={waveDensity} min={0} max={100} step={1}
            onChange={v => setWaveDensity(v)} />
          <div style={{ marginTop: 8, fontSize: 11, color: '#6b7a96' }}>
            Change sliders then click Regenerate.
          </div>
        </aside>
      </div>
    </main>
  );
}

function ParamSlider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={sliderRow}>
      <span style={{ width: 90 }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} style={{ flex: 1 }} />
      <code style={{ width: 40, textAlign: 'right' }}>{value}</code>
    </div>
  );
}

const pageStyle: CSSProperties = { minHeight: '100vh', background: '#12141c', color: '#d8deea', padding: 16, fontFamily: 'system-ui, -apple-system, sans-serif' };
const toolbarStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 };
const contentStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 14 };
const canvasStyle: CSSProperties = { border: '1px solid #2d3346', borderRadius: 8, imageRendering: 'pixelated', background: '#1b1f2b' };
const panelStyle: CSSProperties = { minWidth: 280, border: '1px solid #2d3346', borderRadius: 8, padding: 12, background: '#161a26' };
const h3Style: CSSProperties = { margin: '0 0 10px', fontSize: 14 };
const sliderRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6 };
const buttonStyle: CSSProperties = { background: '#89bf5d', color: '#0f1520', border: 'none', borderRadius: 6, padding: '6px 10px', fontWeight: 700, cursor: 'pointer' };
const labelStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 };
const linkStyle: CSSProperties = { color: '#8cb4ff', textDecoration: 'none', fontSize: 13 };
const selectStyle: CSSProperties = { background: '#1a2234', color: '#d8deea', border: '1px solid #33405e', borderRadius: 6, padding: '4px 6px' };
