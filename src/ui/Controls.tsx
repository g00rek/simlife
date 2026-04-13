interface ControlsProps {
  running: boolean;
  speed: number;
  onToggle: () => void;
  onSpeedChange: (speed: number) => void;
  onReset: () => void;
  onSkip: (ticks: number) => void;
}

// MIN_SPEED_MS bounds the max simulation rate. Below ~30ms the worker bursts many ticks
// per snapshot and the renderer interpolates over jumps that look like teleportation.
const MIN_SPEED_MS = 30;
const MAX_SPEED_MS = 300;

// Skip-button presets — game time the worker should compute in one shot (no animation).
const TICKS_PER_DAY = 20;
const TICKS_PER_MONTH = 200;   // 10 days
const TICKS_PER_YEAR = 2400;   // 12 months

export function Controls({ running, speed, onToggle, onSpeedChange, onReset, onSkip }: ControlsProps) {
  const sliderValue = MAX_SPEED_MS + MIN_SPEED_MS - speed;

  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
      <button onClick={onToggle} style={buttonStyle(running)}>
        {running ? '⏸' : '▶'}
      </button>
      <button onClick={onReset} style={resetStyle}>↻</button>
      <input
        type="range"
        min={MIN_SPEED_MS}
        max={MAX_SPEED_MS}
        step={MIN_SPEED_MS}
        value={sliderValue}
        onChange={e => onSpeedChange(+(MAX_SPEED_MS + MIN_SPEED_MS - Number(e.target.value)).toFixed(1))}
        style={{ width: '80px' }}
      />
      <div style={{ display: 'flex', gap: '2px', marginLeft: '4px' }} title="Skip ahead — full simulation, no animation">
        <button onClick={() => onSkip(TICKS_PER_DAY)} style={skipStyle}>+1d</button>
        <button onClick={() => onSkip(TICKS_PER_MONTH)} style={skipStyle}>+1m</button>
        <button onClick={() => onSkip(TICKS_PER_YEAR)} style={skipStyle}>+1y</button>
      </div>
    </div>
  );
}

const skipStyle: React.CSSProperties = {
  background: '#7aa2f733',
  color: '#7aa2f7',
  border: '1px solid #7aa2f755',
  padding: '4px 8px',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 'bold',
  cursor: 'pointer',
};

const resetStyle: React.CSSProperties = {
  background: '#f7768e33',
  color: '#f7768e',
  border: '1px solid #f7768e55',
  padding: '4px 8px',
  borderRadius: '4px',
  fontSize: '14px',
  cursor: 'pointer',
};

function buttonStyle(running: boolean): React.CSSProperties {
  return {
    background: running ? '#333' : '#9ece6a',
    color: running ? '#ccc' : '#1a1b26',
    border: 'none',
    padding: '4px 12px',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
  };
}
