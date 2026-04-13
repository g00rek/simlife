import type { WorldState, Entity } from '../engine/types';
import { TICKS_PER_YEAR, TICKS_PER_DAY, CHILD_AGE, ECONOMY, HOUSE_CAPACITY, HOUSE_WOOD_COST } from '../engine/types';
import { ageInYears } from '../engine/world';
import {
  Axe,
  Baby,
  CookingPot,
  GenderFemale,
  GenderMale,
  Hammer,
  House,
  Leaf,
  Lightning,
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

// Map state↔goal: each activity counts entity if it's actively doing it OR en route.
// Counts an entity as "doing X" if they're actively working on it OR walking to do it.
function isDoing(e: Entity, kind: 'hunt' | 'gather' | 'chop' | 'build' | 'cook' | 'depositing' | 'training'): boolean {
  const a = e.activity;
  switch (kind) {
    case 'hunt':       return (a.kind === 'working' && a.action === 'hunting')   || (a.kind === 'moving' && a.purpose === 'hunt');
    case 'gather':     return (a.kind === 'working' && a.action === 'gathering') || (a.kind === 'moving' && a.purpose === 'gather');
    case 'chop':       return (a.kind === 'working' && a.action === 'chopping')  || (a.kind === 'moving' && a.purpose === 'chop');
    case 'build':      return (a.kind === 'working' && a.action === 'building')  || (a.kind === 'moving' && a.purpose === 'build');
    case 'cook':       return (a.kind === 'working' && a.action === 'cooking')   || (a.kind === 'moving' && a.purpose === 'cook');
    case 'training':   return (a.kind === 'working' && a.action === 'training')  || (a.kind === 'moving' && a.purpose === 'spar');
    case 'depositing': return a.kind === 'moving' && a.purpose === 'deposit';
  }
}

export function Stats({ world }: StatsProps) {
  const pregnant = world.entities.filter(e => e.pregnancyTimer > 0).length;
  const hunting   = world.entities.filter(e => isDoing(e, 'hunt')).length;
  const gathering = world.entities.filter(e => isDoing(e, 'gather')).length;
  const chopping  = world.entities.filter(e => isDoing(e, 'chop')).length;
  const building  = world.entities.filter(e => isDoing(e, 'build')).length;
  const cooking   = world.entities.filter(e => isDoing(e, 'cook')).length;
  const depositing = world.entities.filter(e => isDoing(e, 'depositing')).length;
  const training  = world.entities.filter(e => isDoing(e, 'training')).length;
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
          return (
            <>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Year {year}</div>
              <div style={{ fontSize: '13px', color: '#ccc', marginTop: '2px' }}>
                {seasons[seasonIdx]} — {monthNames[month]}
              </div>
              <div style={{ fontSize: '11px', color: '#e0af68', marginTop: '2px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Sun size={12} />
                  Day {dayInMonth}
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
          <span style={{ color: '#4caf50', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Leaf size={12} />{world.trees.filter(t => t.fruiting).length} fruit trees</span>
        </div>
      </div>
      <div style={panelStyle}>
        <div style={labelStyle}>Stockpile</div>
        {world.villages.map(v => {
          const totalRaw = v.meatStore + v.plantStore;
          const totalCooked = v.cookedMeatStore + v.driedFruitStore;
          // Estimate days of food left: total stockpile energy ÷ per-day drain of tribe.
          // Adults drain ~1.33 energy events/day × baseDrain ≈ 2 energy/day.
          // Toddlers drain 0.25× adult. Infants don't eat.
          const tribeEntities = world.entities.filter(e => e.tribe === v.tribe);
          const adults = tribeEntities.filter(e => ageInYears(e) >= CHILD_AGE).length;
          const toddlers = tribeEntities.filter(e => {
            const y = ageInYears(e);
            return y >= ECONOMY.reproduction.infantAgeYears && y < CHILD_AGE;
          }).length;
          const ADULT_ENERGY_PER_DAY = 2;
          const energyPerDay = adults * ADULT_ENERGY_PER_DAY
            + toddlers * ADULT_ENERGY_PER_DAY * ECONOMY.reproduction.childDrainMultiplier;
          const stockpileEnergy =
              v.meatStore         * ECONOMY.meat.energyPerUnit
            + v.cookedMeatStore   * ECONOMY.cooking.cookedMeatEnergyPerUnit
            + v.plantStore        * ECONOMY.fruit.energyPerUnit
            + v.driedFruitStore   * ECONOMY.cooking.driedFruitEnergyPerUnit;
          const daysLeft = energyPerDay > 0 ? stockpileEnergy / energyPerDay : Infinity;
          const daysLabel = !isFinite(daysLeft) ? '∞' : Math.floor(daysLeft).toString();
          const daysColor = daysLeft < 15 ? '#f7768e' : daysLeft < 45 ? '#e0af68' : '#9ece6a';
          return (
            <div key={v.tribe} style={{ fontSize: '11px', marginBottom: '4px' }}>
              <div style={{ color: `rgb(${v.color.join(',')})`, fontWeight: 600, marginBottom: '2px' }}>
                {v.name}
              </div>
              <div style={stockRowStyle}>
                <span style={{ color: '#c0392b' }}>raw meat</span>
                <span style={stockNumStyle}>{v.meatStore}</span>
              </div>
              <div style={stockRowStyle}>
                <span style={{ color: '#e67e22' }}>cooked meat</span>
                <span style={stockNumStyle}>{v.cookedMeatStore}</span>
              </div>
              <div style={stockRowStyle}>
                <span style={{ color: '#27ae60' }}>raw fruit</span>
                <span style={stockNumStyle}>{v.plantStore}</span>
              </div>
              <div style={stockRowStyle}>
                <span style={{ color: '#d4a017' }}>dried fruit</span>
                <span style={stockNumStyle}>{v.driedFruitStore}</span>
              </div>
              <div style={stockRowStyle}>
                <span style={{ color: '#8d6e63' }}>wood</span>
                <span style={stockNumStyle}>{v.woodStore}</span>
              </div>
              <div style={{ fontSize: '10px', color: '#666', marginTop: '2px', borderTop: '1px solid #2a2b35', paddingTop: '2px' }}>
                food total: {totalRaw + totalCooked} ({totalRaw} raw + {totalCooked} cooked)
              </div>
              <div style={{ fontSize: '11px', marginTop: '2px' }}>
                <span style={{ color: '#9aa4bf' }}>days of food: </span>
                <span style={{ color: daysColor, fontWeight: 600 }}>{daysLabel}</span>
                <span style={{ color: '#666' }}> ({adults + toddlers} mouth{adults + toddlers === 1 ? '' : 's'})</span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={panelStyle}>
        <div style={labelStyle}>Housing</div>
        {world.villages.map(v => {
          const tribeEntities = world.entities.filter(e => e.tribe === v.tribe);
          const tribeHouses = world.houses.filter(h => h.tribe === v.tribe);
          const homeless = tribeEntities.filter(e => !e.homeId).length;
          const pregnant = tribeEntities.filter(e => e.pregnancyTimer > 0).length;
          const freeSlots = tribeHouses.reduce((s, h) => s + (HOUSE_CAPACITY - h.occupants.length), 0);
          const inProgress = tribeEntities.filter(e =>
            (e.activity.kind === 'working' && e.activity.action === 'building')
            || (e.activity.kind === 'moving' && e.activity.purpose === 'build')
          ).length;
          const demand = homeless + pregnant;
          const supply = freeSlots + inProgress * HOUSE_CAPACITY;
          const needHouses = demand > supply;
          const missing = Math.max(0, Math.ceil((demand - supply) / HOUSE_CAPACITY));
          const enoughWood = v.woodStore >= HOUSE_WOOD_COST;

          return (
            <div key={v.tribe} style={{ fontSize: '11px', marginBottom: '6px' }}>
              <div style={{ color: `rgb(${v.color.join(',')})`, fontWeight: 600, marginBottom: '2px' }}>
                {v.name}
              </div>
              <div style={stockRowStyle}>
                <span style={{ color: '#9aa4bf' }}>houses</span>
                <span style={stockNumStyle}>{tribeHouses.length}</span>
              </div>
              <div style={stockRowStyle}>
                <span style={{ color: '#9aa4bf' }}>free slots</span>
                <span style={stockNumStyle}>{freeSlots}</span>
              </div>
              <div style={stockRowStyle}>
                <span style={{ color: '#9aa4bf' }}>homeless</span>
                <span style={stockNumStyle}>{homeless}</span>
              </div>
              <div style={stockRowStyle}>
                <span style={{ color: '#9aa4bf' }}>pregnant</span>
                <span style={stockNumStyle}>{pregnant}</span>
              </div>
              <div style={stockRowStyle}>
                <span style={{ color: '#9aa4bf' }}>building</span>
                <span style={stockNumStyle}>{inProgress}</span>
              </div>
              <div style={{ fontSize: '11px', marginTop: '3px', borderTop: '1px solid #2a2b35', paddingTop: '3px' }}>
                {needHouses ? (
                  <span style={{ color: '#f7768e', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Hammer size={12} />Need {missing} more house{missing === 1 ? '' : 's'}
                    {!enoughWood && <span style={{ color: '#e0af68', marginLeft: '4px' }}>(chop wood first)</span>}
                  </span>
                ) : (
                  <span style={{ color: '#9ece6a' }}>Housing OK</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={panelStyle}>
        <div style={labelStyle}>Activities</div>
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>
          (counts include en-route)
        </div>
        <div style={{ fontSize: '11px' }}>
          <div style={activityRowStyle}><PersonSimpleRun size={12} /> {hunting} hunting</div>
          <div style={activityRowStyle}><Leaf size={12} /> {gathering} gathering</div>
          <div style={activityRowStyle}><Axe size={12} /> {chopping} chopping</div>
          <div style={activityRowStyle}><Hammer size={12} /> {building} building</div>
          <div style={activityRowStyle}><CookingPot size={12} /> {cooking} cooking</div>
          <div style={activityRowStyle}><House size={12} /> {depositing} depositing</div>
          <div style={activityRowStyle}><UserFocus size={12} /> {training} training</div>
          <div style={activityRowStyle}><House size={12} /> {world.houses.length} houses total</div>
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

const stockRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '10px',
  marginLeft: '4px',
  lineHeight: '14px',
};

const stockNumStyle: React.CSSProperties = {
  color: '#ddd',
  fontFamily: 'monospace',
  fontWeight: 600,
};
