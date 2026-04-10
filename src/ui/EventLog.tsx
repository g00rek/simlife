import type { LogEntry } from '../engine/types';
import { TICKS_PER_YEAR } from '../engine/types';
import { Circle, GenderFemale, GenderMale } from '@phosphor-icons/react';

interface EventLogProps {
  log: LogEntry[];
}

function ageYears(ageTicks: number): number {
  return Math.floor(ageTicks / TICKS_PER_YEAR);
}

function causeLabel(cause?: string): string {
  switch (cause) {
    case 'old_age': return 'starość';
    case 'starvation': return 'głód';
    case 'cold': return 'zimno';
    case 'fight': return 'walka';
    case 'childbirth': return 'poród';
    default: return '';
  }
}

export function EventLog({ log }: EventLogProps) {
  // Show last 30 entries, newest first
  const recent = log.slice(-30).reverse();

  return (
    <div style={panelStyle}>
      <div style={labelStyle}>Log zdarzeń</div>
      <div style={{ maxHeight: '300px', overflowY: 'auto', fontSize: '10px', lineHeight: '1.6' }}>
        {recent.length === 0 && <div style={{ color: '#444' }}>Brak zdarzeń</div>}
        {recent.map((entry, i) => (
          <div key={i} style={{ color: entry.type === 'birth' ? '#9ece6a' : '#f7768e' }}>
            <span style={{ color: '#555' }}>t{entry.tick}</span>
            {' '}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Circle size={8} weight="fill" />
              {entry.gender === 'male' ? <GenderMale size={11} /> : <GenderFemale size={11} />}
            </span>
            {' '}
            {entry.type === 'birth'
              ? 'urodził się'
              : `zmarł (${ageYears(entry.age)}l) — ${causeLabel(entry.cause)}`
            }
          </div>
        ))}
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
