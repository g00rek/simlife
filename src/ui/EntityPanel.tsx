import type { Entity } from '../engine/types';
import { HUNGER_THRESHOLD, ENERGY_MATING_MIN, CHILD_AGE, MIN_REPRODUCTIVE_AGE, MAX_REPRODUCTIVE_AGE } from '../engine/types';
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
        <div style={labelStyle}>Entity</div>
        <button onClick={onClose} style={closeStyle}>✕</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: color }} />
        <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{entity.id}</span>
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Sex:</span>
        <span style={{ color: entity.gender === 'male' ? '#7aa2f7' : '#f7768e', fontWeight: 'bold' }}>
          {entity.gender === 'male' ? '♂ Male' : '♀ Female'}
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
        <span style={{ color: entity.tribe === -1 ? '#ff9e64' : '#ccc' }}>
          {entity.tribe === -1 ? '⚠ Ronin' : (['Red', 'Green', 'Blue'][entity.tribe] ?? `Tribe ${entity.tribe}`)}
        </span>
      </div>
      <div style={rowStyle}>
        <span style={dimStyle}>Position:</span>
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

function stateLabel(entity: Entity): string {
  switch (entity.state) {
    case 'mating': return '❤ Mating';
    case 'pregnant': return `🤰 Pregnant (${entity.stateTimer}t)`;
    case 'fighting': return '⚔ Fighting';
    case 'hunting': return '🏹 Hunting';
    case 'gathering': return '🌿 Gathering';
    case 'idle': {
      const years = ageInYears(entity);
      if (years < CHILD_AGE) return '👶 Child';
      if (entity.energy < HUNGER_THRESHOLD) {
        return entity.gender === 'male' ? '🔍 Seeking prey' : '🔍 Seeking plants';
      }
      if (years >= MIN_REPRODUCTIVE_AGE && years <= MAX_REPRODUCTIVE_AGE && entity.energy >= ENERGY_MATING_MIN) {
        if (entity.gender === 'male' && entity.meat > 0) return '💑 Seeking mate';
        if (entity.gender === 'female') return '💑 Seeking mate';
      }
      return entity.gender === 'male' ? '🚶 Going to hunt' : '🏠 Resting';
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
