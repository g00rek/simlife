import { useState, useEffect, useCallback } from 'react';
import { createWorld, tick } from '../engine/world';
import { GridCanvas } from './GridCanvas';
import { Stats } from './Stats';
import { Controls } from './Controls';
import { EntityPanel } from './EntityPanel';
import { PopGraph } from './PopGraph';
import { TraitAverages } from './TraitAverages';
import type { WorldState } from '../engine/types';
import { TICKS_PER_YEAR } from '../engine/types';

const CANVAS_SIZE = 900;
const POP_SAMPLE_INTERVAL = 5; // sample population every N ticks

export function App() {
  const [world, setWorld] = useState<WorldState>(() =>
    createWorld({ gridSize: 50, entityCount: 6 })
  );
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(300);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  interface HistoryPoint {
    pop: number[];       // population per tribe [0,1,2,ronin]
  }
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  const extinct = world.entities.length === 0 && world.tick > 0;

  const step = useCallback(() => {
    setWorld(prev => {
      if (prev.entities.length === 0) return prev;
      const next = tick(prev);
      if (next.tick % POP_SAMPLE_INTERVAL === 0) {
        setHistory(h => {
          const pop = [0, 1, 2, -1].map(t => next.entities.filter(e => e.tribe === t).length);
          const updated = [...h, { pop }];
          return updated.length > 200 ? updated.slice(-200) : updated;
        });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!running || extinct) return;
    const interval = setInterval(step, speed);
    return () => clearInterval(interval);
  }, [running, speed, step, extinct]);

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
    const byFight = deaths.filter(e => e.cause === 'fight').length;

    const text = [
      `=== LIFE SIMULATOR — CIVILIZATION LOG ===`,
      `Extinct at tick ${world.tick} (year ${Math.floor(world.tick / TICKS_PER_YEAR)})`,
      ``,
      `--- SUMMARY ---`,
      `Births: ${births.length}`,
      `Deaths: ${deaths.length}`,
      `  Old age: ${byOldAge}`,
      `  Starvation: ${byStarvation}`,
      `  Fight: ${byFight}`,
      ``,
      `--- WORLD STATE AT EXTINCTION ---`,
      `Animals remaining: ${world.animals.length}`,
      `Plants remaining: ${world.plants.length}`,
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
  }, [extinct]);

  // Clear selection if entity died
  useEffect(() => {
    if (selectedId && !world.entities.find(e => e.id === selectedId)) {
      setSelectedId(null);
    }
  }, [world, selectedId]);

  const handleCanvasClick = useCallback((x: number, y: number) => {
    const entity = world.entities.find(
      e => e.position.x === x && e.position.y === y
    );
    setSelectedId(entity ? entity.id : null);
  }, [world]);

  const handleReset = useCallback(() => {
    setWorld(createWorld({ gridSize: 50, entityCount: 6 }));
    setRunning(false);
    setSelectedId(null);
    setHistory([]);
  }, []);

  return (
    <div style={containerStyle}>
      <h1 style={{ margin: '0 0 16px', fontSize: '20px', color: '#ccc' }}>
        Life Simulator
      </h1>
      {extinct && (
        <div style={{ background: '#f7768e22', border: '1px solid #f7768e', borderRadius: '4px', padding: '12px 20px', marginBottom: '16px', fontSize: '16px' }}>
          Civilization extinct in year {Math.floor(world.tick / TICKS_PER_YEAR)} (tick {world.tick})
        </div>
      )}
      <div style={layoutStyle}>
        <div>
          <GridCanvas
            world={world}
            size={CANVAS_SIZE}
            selectedId={selectedId}
            onClick={handleCanvasClick}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <div style={graphPanelStyle}>
              <div style={labelStyle}>Population</div>
              <PopGraph series={[
                { data: history.map(h => h.pop[0]), color: '#dc3c3c', label: 'Red' },
                { data: history.map(h => h.pop[1]), color: '#3cb43c', label: 'Grn' },
                { data: history.map(h => h.pop[2]), color: '#3c64dc', label: 'Blu' },
                { data: history.map(h => h.pop[3]), color: '#b48c3c', label: 'Ron' },
              ]} width={290} height={80} />
            </div>
            <div style={graphPanelStyle}>
              <div style={labelStyle}>Pantry</div>
              {world.villages.map(v => {
                const maxStore = 50;
                const meatPct = Math.min(100, Math.round((v.meatStore / maxStore) * 100));
                const plantPct = Math.min(100, Math.round((v.plantStore / maxStore) * 100));
                const c = `rgb(${v.color.join(',')})`;
                return (
                  <div key={v.tribe} style={{ marginBottom: '6px' }}>
                    <div style={{ fontSize: '10px', color: c, marginBottom: '2px' }}>{v.name}</div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <span style={{ fontSize: '9px', color: '#8d6e63', width: '12px' }}>&#127830;</span>
                      <div style={{ flex: 1, height: '6px', background: '#333', borderRadius: '3px' }}>
                        <div style={{ width: `${meatPct}%`, height: '100%', background: '#8d6e63', borderRadius: '3px' }} />
                      </div>
                      <span style={{ fontSize: '9px', color: '#666', width: '20px' }}>{v.meatStore}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '2px' }}>
                      <span style={{ fontSize: '9px', color: '#4caf50', width: '12px' }}>&#127807;</span>
                      <div style={{ flex: 1, height: '6px', background: '#333', borderRadius: '3px' }}>
                        <div style={{ width: `${plantPct}%`, height: '100%', background: '#4caf50', borderRadius: '3px' }} />
                      </div>
                      <span style={{ fontSize: '9px', color: '#666', width: '20px' }}>{v.plantStore}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div style={sidebarStyle}>
          {selectedEntity && (
            <EntityPanel
              entity={selectedEntity}
              onClose={() => setSelectedId(null)}
            />
          )}
          <Stats world={world} />
          <TraitAverages entities={world.entities} />
          <Controls
            running={running}
            speed={speed}
            onToggle={() => setRunning(r => !r)}
            onSpeedChange={setSpeed}
            onReset={handleReset}
          />
        </div>
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  background: '#16161e',
  color: '#ccc',
  minHeight: '100vh',
  padding: '24px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const layoutStyle: React.CSSProperties = {
  display: 'flex',
  gap: '16px',
  alignItems: 'flex-start',
};

const sidebarStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  width: '200px',
};

const labelStyle: React.CSSProperties = {
  color: '#888',
  fontSize: '11px',
  textTransform: 'uppercase',
  marginBottom: '8px',
};

const graphPanelStyle: React.CSSProperties = {
  background: '#1a1b26',
  border: '1px solid #333',
  borderRadius: '4px',
  padding: '12px',
  flex: 1,
};
