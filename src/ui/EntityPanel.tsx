import type { Entity } from '../engine/types';
import { ageInYears } from '../engine/world';

interface EntityPanelProps {
  entity: Entity;
  onClose: () => void;
}

export function EntityPanel({ entity, onClose }: EntityPanelProps) {
  const color = `rgb(${entity.color[0]},${entity.color[1]},${entity.color[2]})`;

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={labelStyle}>Osobnik</div>
        <button onClick={onClose} style={closeStyle}>✕</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: color }} />
        <span style={{ fontSize: '14px', fontWeight: 'bold' }}>
          {entity.gender === 'male' ? '♂' : '♀'} {entity.id}
        </span>
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Stan:</span>
        <span>{stateLabel(entity.state)}</span>
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Wiek:</span>
        <span>{ageInYears(entity)} lat</span>
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Energia:</span>
        <span style={{ color: entity.energy < 40 ? '#f7768e' : '#9ece6a' }}>
          {Math.round(entity.energy)}
        </span>
      </div>
      <div style={{ ...labelStyle, marginTop: '8px' }}>Cechy</div>
      <div style={rowStyle}>
        <span style={dimStyle}>Siła:</span>
        <span>{entity.traits.strength}</span>
        <Bar value={entity.traits.strength} max={10} color="#f7768e" />
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Prędkość:</span>
        <span>{entity.traits.speed}</span>
        <Bar value={entity.traits.speed} max={3} color="#7aa2f7" />
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Percepcja:</span>
        <span>{entity.traits.perception}</span>
        <Bar value={entity.traits.perception} max={5} color="#9ece6a" />
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Pozycja:</span>
        <span>{entity.position.x},{entity.position.y}</span>
      </div>
    </div>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div style={{ flex: 1, height: '6px', background: '#333', borderRadius: '3px', marginLeft: '6px' }}>
      <div style={{ width: `${(value / max) * 100}%`, height: '100%', background: color, borderRadius: '3px' }} />
    </div>
  );
}

function stateLabel(state: string): string {
  switch (state) {
    case 'idle': return 'Bezczynny';
    case 'mating': return '❤ Kopulacja';
    case 'fighting': return '⚔ Walka';
    case 'hunting': return '🏹 Polowanie';
    case 'gathering': return '🌿 Zbieranie';
    default: return state;
  }
}

const panelStyle: React.CSSProperties = {
  background: '#1a1b26',
  border: '1px solid #7aa2f7',
  borderRadius: '4px',
  padding: '12px',
};

const labelStyle: React.CSSProperties = {
  color: '#888',
  fontSize: '11px',
  textTransform: 'uppercase',
  marginBottom: '6px',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '12px',
  marginBottom: '3px',
};

const dimStyle: React.CSSProperties = {
  color: '#666',
  minWidth: '70px',
};

const closeStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#666',
  cursor: 'pointer',
  fontSize: '14px',
  padding: '2px 6px',
};
