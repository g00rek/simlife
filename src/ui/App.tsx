import { useState, useEffect, useCallback, useRef } from 'react';
import { createWorld, tick } from '../engine/world';
import { GridCanvas } from './GridCanvas';
import { Stats } from './Stats';
import { Controls } from './Controls';
import type { WorldState } from '../engine/types';

const CANVAS_SIZE = 900;

export function App() {
  const [world, setWorld] = useState<WorldState>(() =>
    createWorld({ gridSize: 30, entityCount: 20 })
  );
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(300);
  const worldRef = useRef(world);
  worldRef.current = world;

  const step = useCallback(() => {
    setWorld(prev => tick(prev));
  }, []);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(step, speed);
    return () => clearInterval(interval);
  }, [running, speed, step]);

  return (
    <div style={containerStyle}>
      <h1 style={{ margin: '0 0 16px', fontSize: '20px', color: '#ccc' }}>
        Symulator Życia
      </h1>
      <div style={layoutStyle}>
        <GridCanvas world={world} size={CANVAS_SIZE} />
        <div style={sidebarStyle}>
          <Stats world={world} />
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
