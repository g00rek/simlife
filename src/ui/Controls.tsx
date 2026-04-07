interface ControlsProps {
  running: boolean;
  speed: number;
  onToggle: () => void;
  onSpeedChange: (speed: number) => void;
}

export function Controls({ running, speed, onToggle, onSpeedChange }: ControlsProps) {
  return (
    <div style={panelStyle}>
      <div style={labelStyle}>Kontrolki</div>
      <button onClick={onToggle} style={buttonStyle(running)}>
        {running ? '⏸ Pause' : '▶ Play'}
      </button>
      <div style={{ marginTop: '12px' }}>
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>
          Szybkość: {speed}ms
        </div>
        <input
          type="range"
          min={50}
          max={1000}
          step={50}
          value={1050 - speed}
          onChange={e => onSpeedChange(1050 - Number(e.target.value))}
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
