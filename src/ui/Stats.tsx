import type { WorldState } from '../engine/types';
import { TICKS_PER_YEAR } from '../engine/types';
import { ageInYears } from '../engine/world';

interface StatsProps {
  world: WorldState;
}

export function Stats({ world }: StatsProps) {
  const males = world.entities.filter(e => e.gender === 'male').length;
  const females = world.entities.filter(e => e.gender === 'female').length;
  const mating = world.entities.filter(e => e.state === 'mating').length;
  const avgAge = world.entities.length > 0
    ? Math.round(world.entities.reduce((sum, e) => sum + ageInYears(e), 0) / world.entities.length)
    : 0;
  const year = Math.floor(world.tick / TICKS_PER_YEAR);

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
        {mating > 0 && (
          <div style={{ fontSize: '11px', color: '#bb9af7', marginTop: '4px' }}>
            &#10084; {mating / 2} par
          </div>
        )}
      </div>
      <div style={panelStyle}>
        <div style={labelStyle}>Rok / Tura</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{year}</div>
        <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>tura {world.tick}</div>
      </div>
      <div style={panelStyle}>
        <div style={labelStyle}>Średni wiek</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{avgAge}</div>
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
