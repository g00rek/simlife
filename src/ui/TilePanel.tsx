import type { WorldState, Position } from '../engine/types';
import { CHILD_AGE } from '../engine/types';
import { ageInYears } from '../engine/world';
import { GenderFemale, GenderMale, House, Leaf, Rabbit, Warehouse } from '@phosphor-icons/react';

interface TilePanelProps {
  tile: Position;
  world: WorldState;
  onSelectEntity: (id: string) => void;
  onClose: () => void;
}

const biomeLabels: Record<string, string> = {
  plains: 'Plains',
  forest: 'Forest',
  mountain: 'Mountain',
  water: 'Water',
  road: 'Road',
};

export function TilePanel({ tile, world, onSelectEntity, onClose }: TilePanelProps) {
  const biome = world.biomes[tile.y]?.[tile.x] ?? 'unknown';
  const stockpileVillage = world.villages.find(v => v.stockpile?.x === tile.x && v.stockpile?.y === tile.y);
  const house = world.houses.find(h => {
    const dx = tile.x - h.position.x;
    const dy = tile.y - h.position.y;
    return dx >= 0 && dx < 3 && dy >= 0 && dy < 3;
  });
  const fruitTree = world.trees.find(t => t.fruiting && t.position.x === tile.x && t.position.y === tile.y);
  const animal = world.animals.find(a => a.position.x === tile.x && a.position.y === tile.y);
  const entities = world.entities.filter(e => e.position.x === tile.x && e.position.y === tile.y);

  const village = house ? world.villages.find(v => v.tribe === house.tribe) : undefined;
  const occupants = house ? world.entities.filter(e => house.occupants.includes(e.id)) : [];

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={labelStyle}>Tile ({tile.x}, {tile.y})</div>
        <button onClick={onClose} style={closeStyle}>✕</button>
      </div>

      <div style={rowStyle}>
        <span style={dimStyle}>Terrain:</span>
        <span>{biomeLabels[biome] ?? biome}</span>
      </div>

      {stockpileVillage && (
        <div style={sectionStyle}>
          <div style={{ fontSize: '12px', color: '#c0a070', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Warehouse size={12} />
            Stockpile
            <span style={{ color: `rgb(${stockpileVillage.color.join(',')})`, marginLeft: '6px' }}>
              {stockpileVillage.name}
            </span>
          </div>
        </div>
      )}

      {house && (
        <div style={sectionStyle}>
          <div style={{ fontSize: '12px', color: '#e0af68', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <House size={12} />
            House
            <span style={{ color: village ? `rgb(${village.color.join(',')})` : '#888', marginLeft: '6px' }}>
              {village?.name ?? `Tribe ${house.tribe}`}
            </span>
          </div>
          <div style={{ fontSize: '10px', color: '#666', marginLeft: '8px' }}>
            {occupants.length > 0
              ? `Occupants: ${occupants.length}/${6}`
              : 'Empty'}
          </div>
        </div>
      )}

      {fruitTree && (
        <div style={sectionStyle}>
          <div style={{ fontSize: '12px', color: fruitTree.fruitPortions > 0 ? '#e53935' : '#4caf50', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Leaf size={12} />
            Fruit Tree
            <span style={{ color: '#888', marginLeft: '6px', fontSize: '10px' }}>
              {fruitTree.fruitPortions}/{5} portions
            </span>
          </div>
        </div>
      )}

      {animal && (
        <div style={sectionStyle}>
          <div style={{ fontSize: '12px', color: '#8d6e63', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Rabbit size={12} />
            Animal
          </div>
        </div>
      )}

      {entities.length > 0 && (
        <div style={sectionStyle}>
          <div style={{ ...labelStyle, marginBottom: '4px' }}>
            Entities ({entities.length})
          </div>
          {entities.map(e => {
            const tribe = world.villages.find(v => v.tribe === e.tribe);
            const tribeColor = tribe ? `rgb(${tribe.color.join(',')})` : '#888';
            return (
              <div
                key={e.id}
                onClick={() => onSelectEntity(e.id)}
                style={entityRowStyle}
              >
                <span style={{ color: e.gender === 'male' ? '#7aa2f7' : '#f7768e' }}>
                  {e.gender === 'male' ? <GenderMale size={11} /> : <GenderFemale size={11} />}
                </span>
                <span style={{ color: tribeColor, marginLeft: '4px' }}>{e.id}</span>
                <span style={{ color: '#666', marginLeft: '6px', fontSize: '10px' }}>
                  {ageInYears(e) < CHILD_AGE ? 'child' : `${ageInYears(e)}y`}
                  {' · '}
                  {e.activity.kind === 'idle' ? 'idle' : e.activity.kind === 'moving' ? `→${e.activity.purpose}` : e.activity.action}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!stockpileVillage && !house && !fruitTree && !animal && entities.length === 0 && (
        <div style={{ fontSize: '11px', color: '#444', marginTop: '4px' }}>Empty tile</div>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: '#1a1b26',
  border: '1px solid #e0af68',
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
  marginBottom: '4px',
};

const dimStyle: React.CSSProperties = {
  color: '#666',
  minWidth: '60px',
};

const sectionStyle: React.CSSProperties = {
  marginTop: '6px',
  paddingTop: '6px',
  borderTop: '1px solid #2a2b36',
};

const entityRowStyle: React.CSSProperties = {
  fontSize: '11px',
  cursor: 'pointer',
  padding: '2px 4px',
  borderRadius: '2px',
  marginBottom: '2px',
};

const closeStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#666',
  cursor: 'pointer',
  fontSize: '14px',
  padding: '2px 6px',
};
