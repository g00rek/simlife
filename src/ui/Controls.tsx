interface ControlsProps {
  running: boolean;
  speed: number;
  onToggle: () => void;
  onSpeedChange: (speed: number) => void;
  onReset: () => void;
}

export function Controls({ running, speed, onToggle, onSpeedChange, onReset }: ControlsProps) {
  return (
    <div style={panelStyle}>
      <div style={labelStyle}>Controls</div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button onClick={onToggle} style={{ ...buttonStyle(running), flex: 1 }}>
          {running ? '⏸ Pause' : '▶ Play'}
        </button>
        <button onClick={onReset} style={resetStyle}>↻</button>
      </div>
      <div style={{ marginTop: '12px' }}>
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>
          Speed: {speed}ms
        </div>
        <input
          type="range"
          min={10}
          max={300}
          step={10}
          value={310 - speed}
          onChange={e => onSpeedChange(310 - Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: '#1a1b26',
  border: '1px solid #333',
  borderRadius: '4px',
  padding: '12px',
};

const labelStyle: React.CSSProperties = {
  color: '#888',
  fontSize: '11px',
  textTransform: 'uppercase',
  marginBottom: '8px',
};

const resetStyle: React.CSSProperties = {
  background: '#f7768e33',
  color: '#f7768e',
  border: '1px solid #f7768e55',
  padding: '6px 10px',
  borderRadius: '4px',
  fontSize: '16px',
  cursor: 'pointer',
};

function buttonStyle(running: boolean): React.CSSProperties {
  return {
    background: running ? '#333' : '#9ece6a',
    color: running ? '#ccc' : '#1a1b26',
    border: 'none',
    padding: '6px 16px',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    width: '100%',
  };
}
