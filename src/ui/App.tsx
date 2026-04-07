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
    createWorld({ gridSize: 30, entityCount: 60 })
  );
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(300);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [popHistory, setPopHistory] = useState<number[]>([60]);

  const extinct = world.entities.length === 0 && world.tick > 0;

  const step = useCallback(() => {
    setWorld(prev => {
      if (prev.entities.length === 0) return prev;
      const next = tick(prev);
      if (next.tick % POP_SAMPLE_INTERVAL === 0) {
        setPopHistory(h => {
          const updated = [...h, next.entities.length];
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
        <GridCanvas
          world={world}
          size={CANVAS_SIZE}
          selectedId={selectedId}
          onClick={handleCanvasClick}
        />
        <div style={sidebarStyle}>
          {selectedEntity && (
            <EntityPanel
              entity={selectedEntity}
              onClose={() => setSelectedId(null)}
            />
          )}
          <Stats world={world} />
          <div style={{ background: '#1a1b26', border: '1px solid #333', borderRadius: '4px', padding: '12px' }}>
            <div style={labelStyle}>Population History</div>
            <PopGraph history={popHistory} width={176} height={60} />
          </div>
          <TraitAverages entities={world.entities} />
          <Controls
            running={running}
            speed={speed}
            onToggle={() => setRunning(r => !r)}
            onSpeedChange={setSpeed}
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
