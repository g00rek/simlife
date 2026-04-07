import type { WorldState } from '../engine/types';

interface StatsProps {
  world: WorldState;
}

export function Stats({ world }: StatsProps) {
  const males = world.entities.filter(e => e.gender === 'male').length;
  const females = world.entities.filter(e => e.gender === 'female').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={panelStyle}>
        <div style={labelStyle}>Populacja</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
          {world.entities.length}
        </div>
        <div style={{ fontSize: '12px', marginTop: '4px' }}>
          <span style={{ color: '#7aa2f7' }}>&#9794; {males}</span>
          {'  '}
          <span style={{ color: '#f7768e' }}>&#9792; {females}</span>
        </div>
      </div>
      <div style={panelStyle}>
        <div style={labelStyle}>Tura</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{world.tick}</div>
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
