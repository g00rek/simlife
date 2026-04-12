import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { createWorld } from '../engine/world';
import { GridCanvas } from './GridCanvas';
import { Stats } from './Stats';
import { Controls } from './Controls';
import { EntityPanel } from './EntityPanel';
import { TilePanel } from './TilePanel';
import { PopGraph } from './PopGraph';
import { EventLog } from './EventLog';
import type { WorldState, Position } from '../engine/types';
import { TICKS_PER_YEAR } from '../engine/types';
import { BowlFood, Leaf, Axe } from '@phosphor-icons/react';

import { DEFAULT_BIOME_PARAMS } from '../engine/biomes';
import type { BiomeGenParams } from '../engine/biomes';

// One-time migration: clear stale localStorage from old grid sizes
if (!localStorage.getItem('neurofolk-v3-migrated')) {
  localStorage.removeItem('neurofolk-map-params');
  localStorage.setItem('neurofolk-v3-migrated', '1');
}

function loadMapParams(): { gridSize: number; params: BiomeGenParams } {
  try {
    const raw = localStorage.getItem('neurofolk-map-params');
    if (raw) {
      const saved = JSON.parse(raw);
      return {
        gridSize: saved.gridSize ?? 30,
        params: { ...DEFAULT_BIOME_PARAMS, ...saved.params },
      };
    }
  } catch { /* ignore */ }
  return { gridSize: 30, params: { ...DEFAULT_BIOME_PARAMS } };
}

const INITIAL_ENTITY_COUNT = 4;
const VILLAGE_COUNT = 1;
const INITIAL_SPEED = 300;
const SIDEBAR_W = 300;

interface HistoryPoint {
  pop: number[];       // population per tribe [0,1,2]
}

type WorkerResponse =
  | { type: 'snapshot'; world: WorldState; samples: HistoryPoint[]; running: boolean };

function useWindowSize() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const handler = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return size;
}

export function App() {
  const initialWorldRef = useRef<WorldState | null>(null);
  const workerRef = useRef<Worker | null>(null);
  if (!initialWorldRef.current) {
    const mapSettings = loadMapParams();
    initialWorldRef.current = createWorld({
      gridSize: mapSettings.gridSize,
      entityCount: INITIAL_ENTITY_COUNT,
      villageCount: VILLAGE_COUNT,
      biomeParams: mapSettings.params,
    });
  }

  const [world, setWorld] = useState<WorldState>(() => initialWorldRef.current as WorldState);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(INITIAL_SPEED);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTile, setSelectedTile] = useState<Position | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  const { w: winW, h: winH } = useWindowSize();
  const isDesktop = winW >= 1024;
  const PAD = isDesktop ? 16 : 12;
  const mapSize = isDesktop
    ? winW - SIDEBAR_W - PAD * 2 - 16
    : Math.min(winW - PAD * 2, 600);
  const graphW = isDesktop ? SIDEBAR_W - 26 : mapSize - 20;

  const extinct = world.entities.length === 0 && world.tick > 0;

  useEffect(() => {
    const worker = new Worker(new URL('../engine/simulationWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type !== 'snapshot') return;
      setWorld(event.data.world);
      if (!event.data.running) setRunning(false);
      if (event.data.samples.length > 0) {
        setHistory(h => {
          const updated = [...h, ...event.data.samples];
          return updated.length > 200 ? updated.slice(-200) : updated;
        });
      }
    };
    worker.postMessage({ type: 'setWorld', world: initialWorldRef.current, speed: INITIAL_SPEED });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    workerRef.current?.postMessage({ type: running && !extinct ? 'start' : 'stop' });
  }, [running, extinct]);

  useEffect(() => {
    workerRef.current?.postMessage({ type: 'setSpeed', speed });
  }, [speed]);

  const selectedEntity = selectedId
    ? world.entities.find(e => e.id === selectedId) ?? null
    : null;

  // Stop and save log on extinction
  useEffect(() => {
    if (!extinct) return;
    setRunning(false);
    const log = world.log;
    const deaths = log.filter(e => e.type === 'death');
    const births = log.filter(e => e.type === 'birth');
    const byOldAge = deaths.filter(e => e.cause === 'old_age').length;
    const byStarvation = deaths.filter(e => e.cause === 'starvation').length;
    const byCold = deaths.filter(e => e.cause === 'cold').length;
    const byFight = deaths.filter(e => e.cause === 'fight').length;
    const byChildbirth = deaths.filter(e => e.cause === 'childbirth').length;

    const text = [
      `=== EVOLISO — CIVILIZATION LOG ===`,
      `Extinct at tick ${world.tick} (year ${Math.floor(world.tick / TICKS_PER_YEAR)})`,
      ``,
      `--- SUMMARY ---`,
      `Births: ${births.length}`,
      `Deaths: ${deaths.length}`,
      `  Old age: ${byOldAge}`,
      `  Starvation: ${byStarvation}`,
      `  Cold: ${byCold}`,
      `  Fight: ${byFight}`,
      `  Childbirth: ${byChildbirth}`,
      ``,
      `--- WORLD STATE AT EXTINCTION ---`,
      `Animals remaining: ${world.animals.length}`,
      `Fruit trees: ${world.trees.filter(t => t.fruiting).length}`,
      ``,
      `--- FULL LOG ---`,
      ...log.map(e => {
        const y = Math.floor(e.tick / TICKS_PER_YEAR);
        const g = e.gender === 'male' ? 'M' : 'F';
        if (e.type === 'birth') return `t${e.tick} y${y} BIRTH ${g} ${e.entityId}`;
        const a = Math.floor(e.age / TICKS_PER_YEAR);
        return `t${e.tick} y${y} DEATH ${g} ${e.entityId} age=${a} cause=${e.cause}`;
      }),
    ].join('\n');

    fetch('/api/save-log', { method: 'POST', body: text }).catch(() => {});
  }, [extinct, world]);

  // Clear selection if entity died
  useEffect(() => {
    if (selectedId && !world.entities.find(e => e.id === selectedId)) {
      setSelectedId(null);
    }
  }, [world, selectedId]);

  const handleCanvasClick = useCallback((x: number, y: number) => {
    setSelectedTile({ x, y });
    const entity = world.entities.find(
      e => {
        const home = e.homeId ? world.houses.find(house => house.id === e.homeId) : undefined;
        const atHome = home && e.position.x === home.position.x && e.position.y === home.position.y;
        return !atHome && e.position.x === x && e.position.y === y;
      }
    );
    setSelectedId(entity ? entity.id : null);
  }, [world]);

  const handleReset = useCallback(() => {
    const mapSettings = loadMapParams();
    const nextWorld = createWorld({
      gridSize: mapSettings.gridSize,
      entityCount: INITIAL_ENTITY_COUNT,
      villageCount: VILLAGE_COUNT,
      biomeParams: mapSettings.params,
    });
    setWorld(nextWorld);
    setRunning(false);
    setSelectedId(null);
    setSelectedTile(null);
    setHistory([]);
    workerRef.current?.postMessage({ type: 'reset', world: nextWorld, speed });
  }, [speed]);

  const v = world.villages[0];
  const meatPct = v ? Math.min(100, Math.round((v.meatStore / 50) * 100)) : 0;
  const plantPct = v ? Math.min(100, Math.round((v.plantStore / 50) * 100)) : 0;
  const woodPct = v ? Math.min(100, Math.round((v.woodStore / 30) * 100)) : 0;

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <h1 style={{ margin: 0, fontSize: '18px', color: '#ccc' }}>Neurofolk</h1>
      <Controls
        running={running}
        speed={speed}
        onToggle={() => setRunning(r => !r)}
        onSpeedChange={setSpeed}
        onReset={handleReset}
      />
    </div>
  );

  const extinctBanner = extinct ? (
    <div style={{ background: '#f7768e22', border: '1px solid #f7768e', borderRadius: '4px', padding: '8px 12px', fontSize: '14px' }}>
      Extinct in year {Math.floor(world.tick / TICKS_PER_YEAR)}
    </div>
  ) : null;

  const resources = v ? (
    <div style={resourceBarStyle}>
      <ResourceBar icon={<BowlFood size={12} weight="duotone" />} color="#8d6e63" pct={meatPct} val={v.meatStore} />
      <ResourceBar icon={<Leaf size={12} weight="duotone" />} color="#4caf50" pct={plantPct} val={v.plantStore} />
      <ResourceBar icon={<Axe size={12} weight="duotone" />} color="#a08050" pct={woodPct} val={v.woodStore} />
    </div>
  ) : null;

  const graph = (
    <div style={graphPanelStyle}>
      <PopGraph series={[
        { data: history.map(h => h.pop[0]), color: '#dc3c3c', label: 'Pop' },
      ]} width={graphW} height={isDesktop ? 80 : 60} />
    </div>
  );

  const tilePanel = selectedTile ? (
    <TilePanel
      tile={selectedTile}
      world={world}
      onSelectEntity={setSelectedId}
      onClose={() => { setSelectedTile(null); setSelectedId(null); }}
    />
  ) : null;

  const entityPanel = selectedEntity ? (
    <EntityPanel
      entity={selectedEntity}
      world={world}
      onClose={() => setSelectedId(null)}
    />
  ) : null;

  if (isDesktop) {
    return (
      <div style={desktopContainerStyle}>
        {header}
        {extinctBanner}
        <div style={bodyStyle}>
          <div style={mainColStyle}>
            <GridCanvas
              world={world}
              size={mapSize}
              selectedId={selectedId}
              onClick={handleCanvasClick}
            />
            {resources}
            <EventLog log={world.log} />
          </div>
          <div style={sidebarStyle}>
            {tilePanel}
            {entityPanel}
            <Stats world={world} />
            {graph}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={mobileContainerStyle}>
      {header}
      {extinctBanner}
      <GridCanvas
        world={world}
        size={mapSize}
        selectedId={selectedId}
        selectedTile={selectedTile}
        onClick={handleCanvasClick}
      />
      {resources}
      <EventLog log={world.log} />
      {graph}
      {tilePanel}
      {entityPanel}
      <Stats world={world} />
    </div>
  );
}

function ResourceBar({ icon, color, pct, val }: { icon: ReactNode; color: string; pct: number; val: number }) {
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flex: 1 }}>
      <span style={{ display: 'inline-flex', color }}>{icon}</span>
      <div style={{ flex: 1, height: '6px', background: '#333', borderRadius: '3px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '3px' }} />
      </div>
      <span style={{ fontSize: '10px', color: '#666', minWidth: '16px' }}>{val}</span>
    </div>
  );
}

/* ── Styles ────────────────────────────────────── */

const desktopContainerStyle: React.CSSProperties = {
  background: '#16161e',
  color: '#ccc',
  minHeight: '100vh',
  padding: '16px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  maxWidth: '1400px',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const mobileContainerStyle: React.CSSProperties = {
  background: '#16161e',
  color: '#ccc',
  minHeight: '100vh',
  padding: '12px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  maxWidth: '600px',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const bodyStyle: React.CSSProperties = {
  display: 'flex',
  gap: '16px',
  alignItems: 'flex-start',
};

const mainColStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const sidebarStyle: React.CSSProperties = {
  width: `${SIDEBAR_W}px`,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const resourceBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  padding: '8px',
  background: '#1a1b26',
  border: '1px solid #333',
  borderRadius: '4px',
};

const graphPanelStyle: React.CSSProperties = {
  background: '#1a1b26',
  border: '1px solid #333',
  borderRadius: '4px',
  padding: '8px',
};
