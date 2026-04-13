import { useState } from 'react';
import type { LogEntry, LogEventType } from '../engine/types';
import { TICKS_PER_YEAR } from '../engine/types';

interface EventLogProps {
  log: LogEntry[];
}

// Category groups — each filter button shows a subset of event types.
type Category = 'all' | 'food' | 'life' | 'combat' | 'build';
const CATEGORY_TYPES: Record<Category, LogEventType[] | 'all'> = {
  all:    'all',
  food:   ['hunt', 'gather', 'chop'],                       // resource gathering
  life:   ['birth', 'death', 'pregnant'],                   // reproduction + mortality
  combat: ['fight'],                                        // combat
  build:  ['build_start', 'build_done', 'house_claimed'],   // housing
};
const CATEGORY_LABEL: Record<Category, string> = {
  all: 'All', food: 'Food', life: 'Life', combat: 'Combat', build: 'Build',
};

function ageYears(ageTicks: number): number {
  return Math.floor(ageTicks / TICKS_PER_YEAR);
}

function causeLabel(cause?: string): string {
  switch (cause) {
    case 'old_age': return 'old age';
    case 'starvation': return 'starvation';
    case 'fight': return 'combat';
    case 'childbirth': return 'childbirth';
    default: return '';
  }
}

const EVENT_COLOR: Record<LogEventType, string> = {
  birth: '#9ece6a',
  death: '#f7768e',
  pregnant: '#bb9af7',
  hunt: '#e0af68',
  gather: '#73daca',
  chop: '#a9b1d6',
  mine: '#e0af68',
  build_start: '#7aa2f7',
  build_done: '#7aa2f7',
  fight: '#ff9e64',
  house_claimed: '#7dcfff',
};

const EVENT_ICON: Record<LogEventType, string> = {
  birth: '👶',
  death: '💀',
  pregnant: '🤰',
  hunt: '🏹',
  gather: '🌿',
  chop: '🪓',
  mine: '⛏️',
  build_start: '🔨',
  build_done: '🏠',
  fight: '⚔️',
  house_claimed: '🏡',
};

function formatEntry(entry: LogEntry): string {
  const name = entry.name;
  const age = ageYears(entry.age);

  switch (entry.type) {
    case 'birth':
      return `${name} was born`;
    case 'death':
      return `${name} died (age ${age}) — ${causeLabel(entry.cause)}${entry.detail ? ` (${entry.detail})` : ''}`;
    case 'pregnant':
      return `${name} is pregnant${entry.detail ? ` (${entry.detail})` : ''}`;
    case 'hunt':
      return `${name} hunted an animal`;
    case 'gather':
      return `${name} gathered plants`;
    case 'chop':
      return `${name} chopped wood${entry.detail ? ` ${entry.detail}` : ''}`;
    case 'build_start':
      return `${name} started building`;
    case 'build_done':
      return `${name} ${entry.detail ?? 'finished building'}`;
    case 'fight':
      return `${name} started fighting${entry.detail ? ` ${entry.detail}` : ''}`;
    case 'house_claimed':
      return `${name} claimed a house`;
    default:
      return `${name}: ${entry.type}`;
  }
}

export function EventLog({ log }: EventLogProps) {
  const [category, setCategory] = useState<Category>('all');
  const allowed = CATEGORY_TYPES[category];
  const filtered = allowed === 'all' ? log : log.filter(e => allowed.includes(e.type));
  const recent = filtered.slice(-50).reverse();

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span>Event Log</span>
        <span style={{ color: '#555' }}>{filtered.length}/{log.length}</span>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
        {(Object.keys(CATEGORY_LABEL) as Category[]).map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            style={{
              padding: '2px 8px', fontSize: 10, borderRadius: 4,
              border: '1px solid #2d3346', cursor: 'pointer',
              background: category === c ? '#3d4361' : 'transparent',
              color: category === c ? '#e0e0e0' : '#888',
            }}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      <div style={scrollStyle}>
        {recent.length === 0 && <div style={{ color: '#555' }}>No events yet</div>}
        {recent.map((entry, i) => {
          const year = Math.floor(entry.tick / TICKS_PER_YEAR);
          return (
            <div key={i} style={{ color: EVENT_COLOR[entry.type] ?? '#888', display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span style={{ color: '#444', flexShrink: 0, minWidth: 36 }}>y{year}</span>
              <span style={{ flexShrink: 0 }}>{EVENT_ICON[entry.type] ?? '•'}</span>
              <span>{formatEntry(entry)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: '#1a1b26',
  border: '1px solid #2d3346',
  borderRadius: 6,
  padding: '10px 12px',
  width: '100%',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  color: '#888',
  fontSize: 11,
  textTransform: 'uppercase',
  marginBottom: 6,
  letterSpacing: '0.05em',
};

const scrollStyle: React.CSSProperties = {
  maxHeight: 200,
  overflowY: 'auto',
  fontSize: 11,
  lineHeight: '1.7',
};
