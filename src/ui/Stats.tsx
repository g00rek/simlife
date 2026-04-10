import type { WorldState, Entity } from '../engine/types';
import { TICKS_PER_YEAR, TICKS_PER_DAY, DAY_TICKS, CHILD_AGE } from '../engine/types';
import { ageInYears } from '../engine/world';
import {
  Axe,
  Baby,
  GenderFemale,
  GenderMale,
  Hammer,
  House,
  Leaf,
  Lightning,
  Moon,
  PersonSimpleRun,
  Rabbit,
  Sun,
  Users,
  UserFocus,
} from '@phosphor-icons/react';

function isChild(e: Entity): boolean {
  return ageInYears(e) < CHILD_AGE;
}

interface StatsProps {
  world: WorldState;
}

export function Stats({ world }: StatsProps) {
  const pregnant = world.entities.filter(e => e.state === 'pregnant').length;
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
        <div style={labelStyle}>Population — {world.entities.length}</div>
        {world.villages.map(v => {
          const members = world.entities.filter(e => e.tribe === v.tribe);
          const adults = members.filter(e => !isChild(e));
          const m = adults.filter(e => e.gender === 'male').length;
          const f = adults.filter(e => e.gender === 'female').length;
          const kids = members.length - adults.length;
          const housed = adults.filter(e => e.homeId).length;
          const homeless = adults.length - housed;
          return (
            <div key={v.tribe} style={{ fontSize: '11px', marginBottom: '4px' }}>
              <div>
                <span style={{ color: `rgb(${v.color.join(',')})` }}>{v.name}</span>
                {' '}
                <span style={{ color: '#7aa2f7', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><GenderMale size={12} />{m}</span>
                {' '}
                <span style={{ color: '#f7768e', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><GenderFemale size={12} />{f}</span>
                {kids > 0 && <span style={{ color: '#888', display: 'inline-flex', alignItems: 'center', gap: '2px' }}> <Baby size={12} />{kids}</span>}
              </div>
              <div style={{ color: '#666', fontSize: '10px', marginLeft: '8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}><House size={11} />{housed}</span> housed · {homeless} homeless
              </div>
            </div>
          );
        })}
        <div style={{ fontSize: '11px', color: '#bb9af7', marginTop: '4px', visibility: pregnant > 0 ? 'visible' : 'hidden' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Users size={12} />{pregnant} pregnant</span>
        </div>
      </div>
      <div style={panelStyle}>
        <div style={labelStyle}>Time</div>
        {(() => {
          const ticksPerMonth = TICKS_PER_DAY * 10; // 100 ticks/month
          const month = Math.floor((world.tick % TICKS_PER_YEAR) / ticksPerMonth);
          const seasonIdx = Math.floor(month / 3);
          const seasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
          const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const dayInMonth = Math.floor((world.tick % ticksPerMonth) / TICKS_PER_DAY) + 1;
          const timeOfDay = world.tick % TICKS_PER_DAY;
          const isNight = timeOfDay >= DAY_TICKS;
          return (
            <>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Year {year}</div>
              <div style={{ fontSize: '13px', color: '#ccc', marginTop: '2px' }}>
                {seasons[seasonIdx]} — {monthNames[month]}
              </div>
              <div style={{ fontSize: '11px', color: isNight ? '#7aa2f7' : '#e0af68', marginTop: '2px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {isNight ? <Moon size={12} /> : <Sun size={12} />}
                  {isNight ? 'Night' : 'Day'} {dayInMonth} · {timeOfDay}/{TICKS_PER_DAY}
                </span>
              </div>
            </>
          );
        })()}
      </div>
      <div style={panelStyle}>
        <div style={labelStyle}>Age / Energy</div>
        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{avgAge} yrs</div>
        <div style={{ fontSize: '14px', color: '#9ece6a', marginTop: '2px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Lightning size={14} />{avgEnergy}</div>
      </div>
      <div style={panelStyle}>
        <div style={labelStyle}>Wild</div>
        <div style={{ fontSize: '12px' }}>
          <span style={{ color: '#8d6e63', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Rabbit size={12} />{world.animals.length} animals</span>
        </div>
        <div style={{ fontSize: '12px', marginTop: '2px' }}>
          <span style={{ color: '#4caf50', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Leaf size={12} />{world.plants.length} plants</span>
        </div>
      </div>
      <div style={panelStyle}>
        <div style={labelStyle}>Activities</div>
        <div style={{ fontSize: '11px' }}>
          <div style={activityRowStyle}><PersonSimpleRun size={12} /> {hunting} hunting</div>
          <div style={activityRowStyle}><Leaf size={12} /> {gathering} gathering</div>
          <div style={activityRowStyle}><Axe size={12} /> {world.entities.filter(e => e.state === 'chopping').length} chopping</div>
          <div style={activityRowStyle}><Hammer size={12} /> {world.entities.filter(e => e.state === 'building').length} building</div>
          <div style={activityRowStyle}><UserFocus size={12} /> {world.entities.filter(e => e.state === 'training').length} training</div>
          <div style={activityRowStyle}><House size={12} /> {world.houses.length} houses</div>
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

const activityRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
};
