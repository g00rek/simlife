import type { Entity, WorldState } from '../engine/types';
import type { ReactNode } from 'react';
import { CHILD_AGE } from '../engine/types';
import { ageInYears } from '../engine/world';
import { buildAIContext, getScores, decideAction } from '../engine/utility-ai';
import { Axe, GenderFemale, GenderMale, Hammer, House, Leaf, PersonSimpleRun, ShieldWarning, Sword, Baby } from '@phosphor-icons/react';

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
        <span style={dimStyle}>Age:</span>
        <span>{ageInYears(entity)} yrs</span>
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Energy:</span>
        <span style={{ color: entity.energy < 40 ? '#f7768e' : '#9ece6a' }}>
          {Math.round(entity.energy)}
        </span>
      </div>
      {entity.gender === 'male' && (
        <div style={rowStyle}>
          <span style={dimStyle}>Meat:</span>
          <span style={{ color: entity.meat > 0 ? '#ff9e64' : '#666' }}>
            {entity.meat} portions
          </span>
        </div>
      )}
      <div style={{ ...labelStyle, marginTop: '8px' }}>Traits</div>
      <div style={rowStyle}>
        <span style={dimStyle}>Strength:</span>
        <span>{entity.traits.strength}</span>
        <Bar value={entity.traits.strength} max={10} color="#f7768e" />
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Speed:</span>
        <span>{entity.traits.speed}</span>
        <Bar value={entity.traits.speed} max={3} color="#7aa2f7" />
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Perception:</span>
        <span>{entity.traits.perception}</span>
        <Bar value={entity.traits.perception} max={5} color="#9ece6a" />
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Metabolism:</span>
        <span>{entity.traits.metabolism}</span>
        <Bar value={entity.traits.metabolism} max={2} color="#e0af68" />
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Aggression:</span>
        <span>{entity.traits.aggression}</span>
        <Bar value={entity.traits.aggression} max={10} color="#f7768e" />
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Fertility:</span>
        <span>{entity.traits.fertility}</span>
        <Bar value={entity.traits.fertility} max={2} color="#bb9af7" />
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Twin gene:</span>
        <span>{Math.round(entity.traits.twinChance * 100)}%</span>
        <Bar value={entity.traits.twinChance} max={0.5} color="#73daca" />
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
      {entity.gender === 'male' && entity.mateCooldown > 0 && (
        <div style={rowStyle}>
          <span style={dimStyle}>Mate CD:</span>
          <span>{entity.mateCooldown}t</span>
        </div>
      )}
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

function stateLabel(entity: Entity): ReactNode {
  switch (entity.state) {
    case 'pregnant': return <span style={stateIconRowStyle}><Baby size={12} />Pregnant ({entity.stateTimer}t)</span>;
    case 'fighting': return <span style={stateIconRowStyle}><Sword size={12} />Fighting</span>;
    case 'training': return <span style={stateIconRowStyle}><ShieldWarning size={12} />Training</span>;
    case 'chopping': return <span style={stateIconRowStyle}><Axe size={12} />Chopping</span>;
    case 'building': return <span style={stateIconRowStyle}><Hammer size={12} />Building</span>;
    case 'hunting': return <span style={stateIconRowStyle}><PersonSimpleRun size={12} />Hunting</span>;
    case 'gathering': return <span style={stateIconRowStyle}><Leaf size={12} />Gathering</span>;
    case 'idle': {
      const years = ageInYears(entity);
      if (years < CHILD_AGE) return <span style={stateIconRowStyle}><Baby size={12} />Child</span>;
      if (entity.goal) {
        const goalLabels: Record<string, React.ReactNode> = {
          hunt: <span style={stateIconRowStyle}><PersonSimpleRun size={12} />Hunting</span>,
          gather: <span style={stateIconRowStyle}><Leaf size={12} />Gathering</span>,
          chop: <span style={stateIconRowStyle}><Axe size={12} />Going to chop</span>,
          return_home: <span style={stateIconRowStyle}><House size={12} />Returning</span>,
          build: <span style={stateIconRowStyle}><Hammer size={12} />Going to build</span>,
        };
        return goalLabels[entity.goal.type] ?? <span style={stateIconRowStyle}><PersonSimpleRun size={12} />Moving</span>;
      }
      return <span style={stateIconRowStyle}><PersonSimpleRun size={12} />Idle</span>;
    }
    default: return entity.state;
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

const stateIconRowStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
};
