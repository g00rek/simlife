import type { Entity, WorldState, Purpose, Action } from '../engine/types';
import type { ReactNode } from 'react';
import { CHILD_AGE, TICKS_PER_DAY, MIN_REPRODUCTIVE_AGE, MAX_REPRODUCTIVE_AGE } from '../engine/types';

const DAYS_PER_MONTH = 10;
const MONTHS_PER_YEAR = 12;

// Reproductive lifecycle status — orthogonal to activity state.
// Males have no refractory period; only pregnancy + postpartum (females) gate fertility.
type FertilityStatus = 'too young' | 'too old' | 'pregnant' | 'postpartum' | 'ready to mate';
function fertilityStatus(entity: Entity): FertilityStatus {
  const years = Math.floor(entity.age / 2400); // TICKS_PER_YEAR
  if (years < MIN_REPRODUCTIVE_AGE) return 'too young';
  if (years > MAX_REPRODUCTIVE_AGE) return 'too old';
  if (entity.pregnancyTimer > 0) return 'pregnant';
  if (entity.birthCooldown > 0) return 'postpartum';  // female after birth, recovery
  return 'ready to mate';
}

function carryingColor(type: 'meat' | 'wood' | 'fruit' | 'gold'): string {
  switch (type) {
    case 'meat': return '#ff9e64';  // orange — raw meat
    case 'wood': return '#bb9af7';  // purple — wood
    case 'fruit': return '#9ece6a'; // green — fruit
    case 'gold': return '#e0af68';  // yellow — gold
  }
}

function fertilityColor(status: FertilityStatus): string {
  switch (status) {
    case 'ready to mate': return '#9ece6a'; // green
    case 'pregnant': return '#f7768e'; // pink
    case 'postpartum': return '#bb9af7'; // purple
    case 'too young': case 'too old': return '#666'; // dim gray
  }
}

// Format game ticks as human-readable duration: days, months, years.
// Examples: 15→'<1d', 40→'2d', 250→'1m 3d', 2600→'1y 1m'.
function formatDuration(ticks: number): string {
  if (ticks <= 0) return '0d';
  if (ticks < TICKS_PER_DAY) return '<1d';
  const totalDays = Math.round(ticks / TICKS_PER_DAY);
  if (totalDays < DAYS_PER_MONTH) return `${totalDays}d`;
  const totalMonths = Math.floor(totalDays / DAYS_PER_MONTH);
  const remDays = totalDays % DAYS_PER_MONTH;
  if (totalMonths < MONTHS_PER_YEAR) {
    return remDays > 0 ? `${totalMonths}m ${remDays}d` : `${totalMonths}m`;
  }
  const years = Math.floor(totalMonths / MONTHS_PER_YEAR);
  const remMonths = totalMonths % MONTHS_PER_YEAR;
  return remMonths > 0 ? `${years}y ${remMonths}m` : `${years}y`;
}
import { ageInYears } from '../engine/world';
import { buildAIContext, getScores, decideAction } from '../engine/utility-ai';
import { Axe, CookingPot, GenderFemale, GenderMale, Hammer, House, Leaf, PersonSimpleRun, Shovel, Sword, Baby } from '@phosphor-icons/react';

interface EntityPanelProps {
  entity: Entity;
  world: WorldState;
  onClose: () => void;
}

export function EntityPanel({ entity, world, onClose }: EntityPanelProps) {
  const color = `rgb(${entity.color[0]},${entity.color[1]},${entity.color[2]})`;

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={labelStyle}>Entity</div>
        <button onClick={onClose} style={closeStyle}>✕</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: color }} />
        <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{entity.name}</span>
        <span style={{ fontSize: '10px', color: '#666' }}>{entity.id}</span>
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Sex:</span>
        <span style={{ color: entity.gender === 'male' ? '#7aa2f7' : '#f7768e', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          {entity.gender === 'male' ? <GenderMale size={13} /> : <GenderFemale size={13} />}
          {entity.gender === 'male' ? 'Male' : 'Female'}
        </span>
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>State:</span>
        <span>{stateLabel(entity)}</span>
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Fertility:</span>
        <span style={{ color: fertilityColor(fertilityStatus(entity)) }}>
          {fertilityStatus(entity)}
          {entity.pregnancyTimer > 0 && ` (${formatDuration(entity.pregnancyTimer)} left)`}
          {entity.birthCooldown > 0 && entity.pregnancyTimer === 0 && ` (${formatDuration(entity.birthCooldown)} left)`}
        </span>
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Age:</span>
        <span>{ageInYears(entity)} yrs</span>
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Energy:</span>
        <span style={{ color: entity.energy < 20 ? '#f7768e' : entity.energy < 60 ? '#e0af68' : '#9ece6a' }}>
          {Math.round(entity.energy)}
        </span>
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Carrying:</span>
        <span style={{ color: entity.carrying ? carryingColor(entity.carrying.type) : '#666' }}>
          {entity.carrying ? `${entity.carrying.type} × ${entity.carrying.amount}` : '—'}
        </span>
      </div>
      <div style={{ ...labelStyle, marginTop: '8px' }}>Traits</div>
      <div style={rowStyle}>
        <span style={dimStyle}>Strength:</span>
        <span>{entity.traits.strength}</span>
        <Bar value={entity.traits.strength} max={100} color="#f7768e" />
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Dexterity:</span>
        <span>{entity.traits.dexterity}</span>
        <Bar value={entity.traits.dexterity} max={100} color="#7aa2f7" />
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Intelligence:</span>
        <span>{entity.traits.intelligence}</span>
        <Bar value={entity.traits.intelligence} max={100} color="#9ece6a" />
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Tribe:</span>
        <span style={{ color: '#ccc' }}>
          {['Red', 'Blue', 'Green'][entity.tribe] ?? `Tribe ${entity.tribe}`}
        </span>
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Home:</span>
        <span>{entity.homeId ?? 'none'}</span>
      </div>
      {entity.gender === 'female' && entity.birthCooldown > 0 && (
        <div style={rowStyle}>
          <span style={dimStyle}>Birth CD:</span>
          <span>{entity.birthCooldown}t</span>
        </div>
      )}
      <div style={rowStyle}>
        <span style={dimStyle}>Position:</span>
        <span>{entity.position.x},{entity.position.y}</span>
      </div>
      {(() => {
        const ctx = buildAIContext(entity, world.villages, world.animals, world.trees, world.entities, world.biomes, world.gridSize, 0, world.houses);
        const scores = getScores(ctx);
        const action = decideAction(ctx);
        return (
          <>
            <div style={{ ...labelStyle, marginTop: '8px' }}>AI Debug</div>
            <div style={{ fontSize: '10px', color: '#666' }}>
              {Object.entries(scores).map(([k, v]) => (
                <div key={k}>{k}: {v.toFixed(2)}</div>
              ))}
              <div style={{ color: '#9ece6a', marginTop: '2px' }}>→ {action.type}</div>
            </div>
          </>
        );
      })()}
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

const stateIconRowStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
};

const WORKING_LABEL: Record<Action, ReactNode> = {
  hunting:   <span style={stateIconRowStyle}><PersonSimpleRun size={12} />Hunting</span>,
  gathering: <span style={stateIconRowStyle}><Leaf size={12} />Gathering</span>,
  chopping:  <span style={stateIconRowStyle}><Axe size={12} />Chopping</span>,
  building:  <span style={stateIconRowStyle}><Hammer size={12} />Building</span>,
  cooking:   <span style={stateIconRowStyle}><CookingPot size={12} />Cooking</span>,
  mining:    <span style={stateIconRowStyle}><Shovel size={12} />Mining</span>,
  fighting:  <span style={stateIconRowStyle}><Sword size={12} />Fighting</span>,
};

const MOVING_LABEL: Record<Purpose, ReactNode> = {
  hunt:    <span style={stateIconRowStyle}><PersonSimpleRun size={12} />Going to hunt</span>,
  gather:  <span style={stateIconRowStyle}><Leaf size={12} />Going to gather</span>,
  chop:    <span style={stateIconRowStyle}><Axe size={12} />Going to chop</span>,
  build:   <span style={stateIconRowStyle}><Hammer size={12} />Going to build</span>,
  cook:    <span style={stateIconRowStyle}><CookingPot size={12} />Going to cook</span>,
  mine:    <span style={stateIconRowStyle}><Shovel size={12} />Going to mine</span>,
  deposit: <span style={stateIconRowStyle}><House size={12} />Going to stockpile</span>,
};

function stateLabel(entity: Entity): ReactNode {
  const years = ageInYears(entity);
  if (years < CHILD_AGE) return <span style={stateIconRowStyle}><Baby size={12} />Child</span>;
  const a = entity.activity;
  if (a.kind === 'working') {
    return <span style={stateIconRowStyle}>{WORKING_LABEL[a.action]} ({formatDuration(a.ticksLeft)})</span>;
  }
  if (a.kind === 'moving') {
    const pace = a.pace === 'run' ? ' 🏃' : '';
    return <span style={stateIconRowStyle}>{MOVING_LABEL[a.purpose]}{pace}</span>;
  }
  return <span style={stateIconRowStyle}><PersonSimpleRun size={12} />Idle</span>;
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
