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
  const hunting = world.entities.filter(e => e.state === 'hunting').length;
  const gathering = world.entities.filter(e => e.state === 'gathering').length;
  const avgAge = world.entities.length > 0
    ? Math.round(world.entities.reduce((sum, e) => sum + ageInYears(e), 0) / world.entities.length)
    : 0;
  const avgEnergy = world.entities.length > 0
    ? Math.round(world.entities.reduce((sum, e) => sum + e.energy, 0) / world.entities.length)
    : 0;
  const year = Math.floor(world.tick / TICKS_PER_YEAR);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={panelStyle}>
        <div style={labelStyle}>Population</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
          {world.entities.length}
        </div>
        <div style={{ fontSize: '12px', marginTop: '4px' }}>
          <span style={{ color: '#7aa2f7' }}>&#9794; {males}</span>
          {'  '}
          <span style={{ color: '#f7768e' }}>&#9792; {females}</span>
        </div>
        <div style={{ fontSize: '11px', color: '#bb9af7', marginTop: '4px', visibility: mating > 0 ? 'visible' : 'hidden' }}>
          &#10084; {Math.floor(mating / 2)} pairs
        </div>
      </div>
      <div style={panelStyle}>
        <div style={labelStyle}>Year / Tick</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{year}</div>
        <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>tick {world.tick}</div>
      </div>
      <div style={panelStyle}>
        <div style={labelStyle}>Age / Energy</div>
        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{avgAge} yrs</div>
        <div style={{ fontSize: '14px', color: '#9ece6a', marginTop: '2px' }}>&#9889; {avgEnergy}</div>
      </div>
      <div style={panelStyle}>
        <div style={labelStyle}>Wild</div>
        <div style={{ fontSize: '12px' }}>
          <span style={{ color: '#8d6e63' }}>&#9670; {world.animals.length} animals</span>
        </div>
        <div style={{ fontSize: '12px', marginTop: '2px' }}>
          <span style={{ color: '#4caf50' }}>&#9679; {world.plants.length} plants</span>
        </div>
      </div>
      <div style={panelStyle}>
        <div style={labelStyle}>Pantries</div>
        {world.villages.map(v => (
          <div key={v.tribe} style={{ fontSize: '11px', marginBottom: '2px' }}>
            <span style={{ color: `rgb(${v.color.join(',')})` }}>{v.name}</span>
            {' '}<span style={{ color: '#8d6e63' }}>&#127830;{v.meatStore}</span>
            {' '}<span style={{ color: '#4caf50' }}>&#127807;{v.plantStore}</span>
          </div>
        ))}
      </div>
      <div style={panelStyle}>
        <div style={labelStyle}>Activities</div>
        <div style={{ fontSize: '11px' }}>
          <div>&#127993; {hunting} hunting</div>
          <div>&#127807; {gathering} gathering</div>
        </div>
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
