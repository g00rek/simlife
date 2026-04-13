import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { WorldState, Animal, Entity, Position } from '../engine/types';
import { RUNTIME_CONFIG, TICKS_PER_YEAR, loadRuntimeConfig, saveRuntimeConfig } from '../engine/types';

// Load persisted config at module load — before any world creation.
loadRuntimeConfig();
import { createWorld, tick } from '../engine/world';
import { generateBiomeGrid, DEFAULT_BIOME_PARAMS } from '../engine/biomes';
import type { BiomeGenParams } from '../engine/biomes';
import { GridCanvas } from './GridCanvas';

const GRID_SIZE = 30;
const SAMPLE_INTERVAL = 10;       // ticks between full snapshots in log (1 game-day)
const LOG_MAX_BYTES = 10_000_000; // 10 MB ring buffer cap

// ── Log entry types (compact JSON) ──────────────────────────────────────────

type LogLine =
  | { t: 'snap'; tick: number; a: Array<{ id: string; x: number; y: number; e: number; g: string; p: number }> }
  | { t: 'birth'; tick: number; id: string; x: number; y: number; gender: string }
  | { t: 'death'; tick: number; id: string; cause: string }
  | { t: 'panic-start'; tick: number; ids: string[] }
  | { t: 'stuck'; tick: number; id: string; pos: string; ticks: number };

function snapshot(world: WorldState): LogLine {
  return {
    t: 'snap',
    tick: world.tick,
    a: world.animals.map(a => ({
      id: a.id,
      x: a.position.x,
      y: a.position.y,
      e: Math.round(a.energy),
      g: a.gender,
      p: a.panicTicks,
    })),
  };
}

// Detect events by diffing previous and current animal lists
function detectEvents(prev: Animal[], curr: Animal[], tickNum: number): LogLine[] {
  const out: LogLine[] = [];
  const prevById = new Map(prev.map(a => [a.id, a]));
  const currById = new Map(curr.map(a => [a.id, a]));

  for (const a of curr) {
    if (!prevById.has(a.id)) {
      out.push({ t: 'birth', tick: tickNum, id: a.id, x: a.position.x, y: a.position.y, gender: a.gender });
    }
  }
  for (const a of prev) {
    if (!currById.has(a.id)) {
      out.push({ t: 'death', tick: tickNum, id: a.id, cause: 'unknown' });
    }
  }
  return out;
}

// ── Page ────────────────────────────────────────────────────────────────────

export function AnimalsPage() {
  const [biomeParams] = useState<BiomeGenParams>(() => ({ ...DEFAULT_BIOME_PARAMS }));
  const initialWorldRef = useRef<WorldState | null>(null);
  if (!initialWorldRef.current) {
    initialWorldRef.current = createAnimalOnlyWorld(GRID_SIZE, biomeParams);
  }
  const [world, setWorld] = useState<WorldState>(initialWorldRef.current);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [maxHerdSize, setMaxHerdSize] = useState(RUNTIME_CONFIG.maxHerdSize);
  const [herdLeash, setHerdLeash] = useState(RUNTIME_CONFIG.herdLeash);
  const [reproInterval, setReproInterval] = useState(RUNTIME_CONFIG.reproInterval);
  const [grassGrowChance, setGrassGrowChance] = useState(RUNTIME_CONFIG.grassGrowChance);
  const [grazeEnergy, setGrazeEnergy] = useState(RUNTIME_CONFIG.grazeEnergy);
  const [fleeRange, setFleeRange] = useState(RUNTIME_CONFIG.animalFleeRange);
  const [panicDuration, setPanicDuration] = useState(RUNTIME_CONFIG.animalPanicDuration);

  useEffect(() => { RUNTIME_CONFIG.maxHerdSize = maxHerdSize; saveRuntimeConfig(); }, [maxHerdSize]);
  useEffect(() => { RUNTIME_CONFIG.herdLeash = herdLeash; saveRuntimeConfig(); }, [herdLeash]);
  useEffect(() => { RUNTIME_CONFIG.reproInterval = reproInterval; saveRuntimeConfig(); }, [reproInterval]);
  useEffect(() => { RUNTIME_CONFIG.grassGrowChance = grassGrowChance; saveRuntimeConfig(); }, [grassGrowChance]);
  useEffect(() => { RUNTIME_CONFIG.grazeEnergy = grazeEnergy; saveRuntimeConfig(); }, [grazeEnergy]);
  useEffect(() => { RUNTIME_CONFIG.animalFleeRange = fleeRange; saveRuntimeConfig(); }, [fleeRange]);
  useEffect(() => { RUNTIME_CONFIG.animalPanicDuration = panicDuration; saveRuntimeConfig(); }, [panicDuration]);

  // Test humans — static "scarecrows" placed by clicking a tile. Animals treat them
  // as threats, trigger flee. Positions stay fixed (we force them back after every tick).
  const testHumansRef = useRef<Position[]>([]);
  const [testHumanCount, setTestHumanCount] = useState(0);

  // "Calculating..." indicator while a skip is running synchronously on the main thread.
  const [skipping, setSkipping] = useState<number | null>(null);

  // Log ring-buffer (in memory). When over cap, drop oldest lines.
  const logRef = useRef<{ lines: string[]; bytes: number }>({ lines: [], bytes: 0 });
  const [logSize, setLogSize] = useState(0);

  function appendLog(line: LogLine) {
    const str = JSON.stringify(line);
    const buf = logRef.current;
    buf.lines.push(str);
    buf.bytes += str.length + 1;
    while (buf.bytes > LOG_MAX_BYTES && buf.lines.length > 0) {
      const removed = buf.lines.shift()!;
      buf.bytes -= removed.length + 1;
    }
  }

  // Tick loop — track per-animal stuck position to detect crashing/jamming.
  const lastAnimalsRef = useRef<Animal[]>(world.animals);
  const stuckTrackerRef = useRef<Map<string, { x: number; y: number; sinceTick: number; reported: boolean }>>(new Map());
  const STUCK_THRESHOLD_TICKS = 80; // 4 game-days standing still (no panic) → stuck event
  useEffect(() => {
    if (!running) return;
    let raf: number;
    let lastTime = performance.now();
    const targetTickInterval = 250 / speed; // ms per tick (1× = 4 ticks/sec for observation)
    let accumulator = 0;
    const loop = (now: number) => {
      const elapsed = now - lastTime;
      lastTime = now;
      accumulator += elapsed;
      let advanced = false;
      while (accumulator >= targetTickInterval) {
        setWorld(w => {
          // Inject test humans before tick so animals detect them.
          const humans = testHumansRef.current.map((p, i) => makeTestHuman(p, i));
          const withHumans: WorldState = { ...w, entities: humans };
          const next = tick(withHumans);
          // Force test humans back to their fixed tiles (tick may have moved them).
          next.entities = testHumansRef.current.map((p, i) => makeTestHuman(p, i));
          // Logging
          if (next.tick % SAMPLE_INTERVAL === 0) appendLog(snapshot(next));
          for (const ev of detectEvents(lastAnimalsRef.current, next.animals, next.tick)) appendLog(ev);
          // Stuck detection — animal in same tile too long without panic = bug signal
          const tracker = stuckTrackerRef.current;
          for (const a of next.animals) {
            const rec = tracker.get(a.id);
            if (!rec || rec.x !== a.position.x || rec.y !== a.position.y) {
              tracker.set(a.id, { x: a.position.x, y: a.position.y, sinceTick: next.tick, reported: false });
            } else if (a.panicTicks === 0 && !rec.reported && next.tick - rec.sinceTick >= STUCK_THRESHOLD_TICKS) {
              appendLog({ t: 'stuck', tick: next.tick, id: a.id, pos: `${a.position.x},${a.position.y}`, ticks: next.tick - rec.sinceTick });
              rec.reported = true;
            }
          }
          // Clean dead animals from tracker
          const aliveIds = new Set(next.animals.map(a => a.id));
          for (const id of tracker.keys()) if (!aliveIds.has(id)) tracker.delete(id);
          lastAnimalsRef.current = next.animals;
          return next;
        });
        accumulator -= targetTickInterval;
        advanced = true;
      }
      if (advanced) setLogSize(logRef.current.bytes);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, speed]);

  const handleReset = useCallback(() => {
    const next = createAnimalOnlyWorld(GRID_SIZE, biomeParams);
    setWorld(next);
    lastAnimalsRef.current = next.animals;
    stuckTrackerRef.current.clear();
    setRunning(false);
    logRef.current = { lines: [], bytes: 0 };
    setLogSize(0);
    appendLog(snapshot(next));
    setLogSize(logRef.current.bytes);
  }, [biomeParams]);

  const handleDownloadLog = useCallback(() => {
    const blob = new Blob([logRef.current.lines.join('\n') + '\n'], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `animals-log-T${world.tick}.ndjson`;
    a.click();
    URL.revokeObjectURL(url);
  }, [world.tick]);

  // Click a tile → toggle a static "tester" human there. Animals react via flee logic.
  const handleTileClick = useCallback((gx: number, gy: number) => {
    const existing = testHumansRef.current.findIndex(p => p.x === gx && p.y === gy);
    if (existing >= 0) {
      testHumansRef.current = testHumansRef.current.filter((_, i) => i !== existing);
    } else {
      testHumansRef.current = [...testHumansRef.current, { x: gx, y: gy }];
    }
    setTestHumanCount(testHumansRef.current.length);
    // Apply immediately so the freshly-placed human appears on the canvas even when paused.
    setWorld(w => ({
      ...w,
      entities: testHumansRef.current.map((p, i) => makeTestHuman(p, i)),
    }));
  }, []);

  const handleClearHumans = useCallback(() => {
    testHumansRef.current = [];
    setTestHumanCount(0);
    setWorld(w => ({ ...w, entities: [] }));
  }, []);

  // Skip ahead — burst-compute N ticks. Uses two RAF deferrals so the "calculating"
  // banner has a chance to paint before the synchronous loop blocks the main thread.
  const handleSkip = useCallback((ticks: number) => {
    setSkipping(ticks);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setWorld(w => {
        let next = w;
        for (let i = 0; i < ticks; i++) {
          const humans = testHumansRef.current.map((p, idx) => makeTestHuman(p, idx));
          const withHumans: WorldState = { ...next, entities: humans };
          next = tick(withHumans);
          next.entities = testHumansRef.current.map((p, idx) => makeTestHuman(p, idx));
          if (next.tick % SAMPLE_INTERVAL === 0) appendLog(snapshot(next));
          for (const ev of detectEvents(lastAnimalsRef.current, next.animals, next.tick)) appendLog(ev);
          lastAnimalsRef.current = next.animals;
        }
        return next;
      });
      setLogSize(logRef.current.bytes);
      setSkipping(null);
    }));
  }, []);

  // Herd analysis (computed live from current world)
  const herdStats = useMemo(() => computeHerdStats(world.animals), [world.animals]);

  return (
    <main style={pageStyle}>
      {skipping !== null && (
        <div style={{
          position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: '#7aa2f7', color: '#0f1520',
          padding: '8px 16px', borderRadius: '6px',
          fontSize: '12px', fontWeight: 700,
          zIndex: 2000,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          display: 'inline-flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{
            display: 'inline-block', width: 10, height: 10,
            borderRadius: '50%',
            border: '2px solid #0f1520', borderTopColor: 'transparent',
            animation: 'skipSpin 0.8s linear infinite',
          }} />
          Calculating {skipping} ticks…
          <style>{`@keyframes skipSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      <div style={leftCol}>
        <div style={controlBar}>
          <button onClick={() => setRunning(r => !r)} style={btnPrimary}>{running ? 'Pause' : 'Play'}</button>
          <button onClick={handleReset} style={btn}>Reset</button>
          <label style={labelStyle}>
            Speed:
            <input type="range" min={1} max={8} step={1} value={speed} onChange={e => setSpeed(Number(e.target.value))} style={{ marginLeft: 6 }} />
            <span style={{ marginLeft: 4 }}>{speed}×</span>
          </label>
          <div style={{ display: 'flex', gap: 2 }} title="Skip ahead — full simulation, no animation">
            <button onClick={() => handleSkip(20)} style={btn}>+1d</button>
            <button onClick={() => handleSkip(200)} style={btn}>+1m</button>
            <button onClick={() => handleSkip(2400)} style={btn}>+1y</button>
          </div>
          <span style={{ flex: 1 }} />
          <button onClick={handleClearHumans} style={btn} disabled={testHumanCount === 0}>
            Clear testers ({testHumanCount})
          </button>
          <span style={{ color: '#888', fontSize: 11 }}>
            Tick: {world.tick} · Log: {(logSize / 1024).toFixed(1)} KB
          </span>
          <button onClick={handleDownloadLog} style={btn}>Download log (.ndjson)</button>
        </div>
        <div style={{ padding: '4px 12px', fontSize: 11, color: '#9aa4bf' }}>
          Click a tile to place / remove a static tester human. Animals flee within <code>{fleeRange}</code> tiles.
        </div>
        <div style={canvasWrap}>
          <GridCanvas
            world={world}
            size={Math.min(720, window.innerWidth - 360)}
            selectedId={null}
            onClick={handleTileClick}
            showHerdOverlays
          />
        </div>
      </div>
      <aside style={sidebarStyle}>
        <h4 style={h4}>Tunable parameters</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SliderRow label="Max herd size" value={maxHerdSize} min={5} max={50} step={1} onChange={setMaxHerdSize} />
          <SliderRow label="Herd leash" value={herdLeash} min={2} max={15} step={1} onChange={setHerdLeash} />
          <SliderRow label="Repro interval" value={reproInterval} min={200} max={2000} step={50} onChange={setReproInterval} />
          <SliderRow label="Grass grow ‰" value={Math.round(grassGrowChance * 1000)} min={1} max={20} step={1} onChange={v => setGrassGrowChance(v / 1000)} />
          <SliderRow label="Graze energy" value={grazeEnergy} min={5} max={40} step={1} onChange={setGrazeEnergy} />
          <SliderRow label="Flee range" value={fleeRange} min={1} max={12} step={1} onChange={setFleeRange} />
          <SliderRow label="Panic ticks" value={panicDuration} min={1} max={30} step={1} onChange={setPanicDuration} />
        </div>
        <h3 style={h3}>Animals: {world.animals.length}</h3>
        <h4 style={h4}>Herd</h4>
        <table style={tableStyle}>
          <thead>
            <tr><th>Size</th><th>M / F</th><th>Avg E</th><th>Centroid</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>{herdStats.size}</td>
              <td>{herdStats.males}/{herdStats.females}</td>
              <td>{herdStats.avgEnergy}</td>
              <td>{herdStats.centroid ? `${herdStats.centroid.x},${herdStats.centroid.y}` : '—'}</td>
            </tr>
          </tbody>
        </table>
      </aside>
    </main>
  );
}

function SliderRow({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
      <span style={{ width: 110, color: '#9aa4bf' }}>{label}:</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} style={{ flex: 1 }} />
      <code style={{ width: 36, textAlign: 'right' }}>{value}</code>
    </label>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function createAnimalOnlyWorld(gridSize: number, biomeParams?: BiomeGenParams): WorldState {
  // Reuse createWorld with minimal humans, then strip them out so tick() runs animal-only logic.
  const w = createWorld({ gridSize, entityCount: 0, villageCount: 1, biomeParams });
  return { ...w, entities: [], villages: [], houses: [] };
}

// Synthetic static human used as a click-to-place "scarecrow" for flee testing.
// Tick may run AI on it but we overwrite the entities list each tick so positions stay put.
function makeTestHuman(pos: Position, idx: number): Entity {
  return {
    id: `tester-${idx}`,
    name: 'Tester',
    position: { ...pos },
    gender: 'male',
    activity: { kind: 'idle' },
    age: 25 * TICKS_PER_YEAR,
    maxAge: 100 * TICKS_PER_YEAR,
    color: [220, 60, 60],
    energy: 100,
    traits: { strength: 5, speed: 1, perception: 3, metabolism: 1.0, aggression: 0, fertility: 1.0, twinChance: 0 },
    tribe: 0,
    birthCooldown: 0,
    pregnancyTimer: 0,
    sparCooldown: 0,
  };
}

interface HerdStat {
  size: number;
  males: number;
  females: number;
  avgEnergy: number;
  centroid?: { x: number; y: number };
}

function computeHerdStats(animals: Animal[]): HerdStat {
  const size = animals.length;
  if (size === 0) return { size: 0, males: 0, females: 0, avgEnergy: 0 };
  let males = 0, females = 0, totalEnergy = 0, sx = 0, sy = 0;
  for (const a of animals) {
    if (a.gender === 'male') males++; else females++;
    totalEnergy += a.energy;
    sx += a.position.x;
    sy += a.position.y;
  }
  return {
    size,
    males,
    females,
    avgEnergy: Math.round(totalEnergy / size),
    centroid: { x: Math.round(sx / size), y: Math.round(sy / size) },
  };
}

// We deliberately import generateBiomeGrid only to avoid tree-shake removal of biomes module
// (used indirectly via createWorld). Reference here so bundler keeps it.
void generateBiomeGrid;

// ── Styles ──────────────────────────────────────────────────────────────────

const pageStyle: CSSProperties = {
  display: 'flex',
  gap: 16,
  padding: 16,
  background: '#12141c',
  color: '#d8deea',
  minHeight: '100vh',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};
const leftCol: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, flex: 1 };
const controlBar: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '10px 12px', background: '#161a26', border: '1px solid #2d3346',
  borderRadius: 6, fontSize: 12,
};
const canvasWrap: CSSProperties = { display: 'inline-block' };
const sidebarStyle: CSSProperties = { width: 320, display: 'flex', flexDirection: 'column', gap: 12 };
const h3: CSSProperties = { margin: '0 0 4px 0', fontSize: 16 };
const h4: CSSProperties = { margin: '12px 0 4px 0', fontSize: 13, color: '#9aa4bf' };
const tableStyle: CSSProperties = { width: '100%', fontSize: 11, borderCollapse: 'collapse' };
const btn: CSSProperties = {
  background: '#2d3346', color: '#d8deea', border: 'none',
  padding: '6px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
};
const btnPrimary: CSSProperties = { ...btn, background: '#89bf5d', color: '#0f1520', fontWeight: 700 };
const labelStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', fontSize: 12 };
