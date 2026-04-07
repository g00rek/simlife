import type { Entity, Position, WorldState, RGB } from './types';
import { MIN_REPRODUCTIVE_AGE, MAX_REPRODUCTIVE_AGE, TICKS_PER_YEAR } from './types';
import { randomStep } from './movement';

interface CreateWorldOptions {
  gridSize: number;
  entityCount: number;
}

let nextId = 0;
function generateId(): string {
  return `entity-${nextId++}`;
}

function randomMaxAge(): number {
  // maxAge in ticks (60-80 years × TICKS_PER_YEAR)
  return (60 + Math.floor(Math.random() * 21)) * TICKS_PER_YEAR;
}

export function ageInYears(e: Entity): number {
  return Math.floor(e.age / TICKS_PER_YEAR);
}

function isReproductive(e: Entity): boolean {
  const years = ageInYears(e);
  return years >= MIN_REPRODUCTIVE_AGE && years <= MAX_REPRODUCTIVE_AGE;
}

const BASE_COLORS: RGB[] = [
  [255, 0, 0],   // red
  [0, 255, 0],   // green
  [0, 0, 255],   // blue
];

function mixColors(a: RGB, b: RGB): RGB {
  return [
    Math.min(255, Math.round((a[0] + b[0]) / 2)),
    Math.min(255, Math.round((a[1] + b[1]) / 2)),
    Math.min(255, Math.round((a[2] + b[2]) / 2)),
  ];
}

function createOccupancyGrid(gridSize: number, entities: Entity[]): number[][] {
  const grid: number[][] = Array.from({ length: gridSize }, () =>
    new Array(gridSize).fill(0)
  );
  for (const e of entities) {
    grid[e.position.y][e.position.x]++;
  }
  return grid;
}

function neighbors(p: Position, gridSize: number): Position[] {
  const result: Position[] = [];
  if (p.y > 0) result.push({ x: p.x, y: p.y - 1 });
  if (p.y < gridSize - 1) result.push({ x: p.x, y: p.y + 1 });
  if (p.x > 0) result.push({ x: p.x - 1, y: p.y });
  if (p.x < gridSize - 1) result.push({ x: p.x + 1, y: p.y });
  return result;
}

export function createWorld(options: CreateWorldOptions): WorldState {
  const { gridSize, entityCount } = options;
  const entities: Entity[] = [];

  for (let i = 0; i < entityCount; i++) {
    entities.push({
      id: generateId(),
      position: {
        x: Math.floor(Math.random() * gridSize),
        y: Math.floor(Math.random() * gridSize),
      },
      gender: i < entityCount / 2 ? 'male' : 'female',
      state: 'idle',
      age: Math.floor(Math.random() * 31) * TICKS_PER_YEAR, // 0-30 years in ticks
      maxAge: randomMaxAge(),
      color: BASE_COLORS[i % 3],
    });
  }

  return { entities, tick: 0, gridSize };
}

export function tick(state: WorldState): WorldState {
  const { gridSize } = state;

  // --- Step 0: Age all entities, remove dead ---
  let entities: Entity[] = state.entities
    .map(e => ({ ...e, age: e.age + 1 }))
    .filter(e => e.age < e.maxAge);

  // --- Step 1: Complete matings, spawn babies ---
  const grid = createOccupancyGrid(gridSize, entities);
  const babies: Entity[] = [];
  const resolvedIds = new Set<string>();

  // Group mating entities by tile using numeric key
  const matingByTile = new Map<number, Entity[]>();
  for (const e of entities) {
    if (e.state === 'mating') {
      const key = e.position.y * gridSize + e.position.x;
      const group = matingByTile.get(key) ?? [];
      group.push(e);
      matingByTile.set(key, group);
    }
  }

  for (const [, group] of matingByTile) {
    const male = group.find(e => e.gender === 'male');
    const female = group.find(e => e.gender === 'female');
    if (male && female) {
      resolvedIds.add(male.id);
      resolvedIds.add(female.id);

      // Find birth position: random neighbor with < 2, else parent tile
      const ns = neighbors(male.position, gridSize);
      const free = ns.filter(n => grid[n.y][n.x] < 2);
      const birthPos = free.length > 0
        ? free[Math.floor(Math.random() * free.length)]
        : { ...male.position };

      const baby: Entity = {
        id: generateId(),
        position: birthPos,
        gender: Math.random() < 0.5 ? 'male' : 'female',
        state: 'idle',
        age: 0,
        maxAge: randomMaxAge(),
        color: mixColors(male.color, female.color),
      };
      babies.push(baby);
      grid[birthPos.y][birthPos.x]++;
    }
  }

  // Update resolved entities to idle, add babies
  entities = entities.map(e =>
    resolvedIds.has(e.id) ? { ...e, state: 'idle' as const } : e
  );
  entities.push(...babies);

  // --- Step 2: Detect new mating pairs ---
  // Group by tile using numeric key
  const tileGroups = new Map<number, Entity[]>();
  for (const e of entities) {
    const key = e.position.y * gridSize + e.position.x;
    const group = tileGroups.get(key) ?? [];
    group.push(e);
    tileGroups.set(key, group);
  }

  const newMatingIds = new Set<string>();
  for (const [, group] of tileGroups) {
    const idleMale = group.find(
      e => e.gender === 'male' && e.state === 'idle' && !resolvedIds.has(e.id) && isReproductive(e)
    );
    const idleFemale = group.find(
      e => e.gender === 'female' && e.state === 'idle' && !resolvedIds.has(e.id) && isReproductive(e)
    );
    if (idleMale && idleFemale) {
      newMatingIds.add(idleMale.id);
      newMatingIds.add(idleFemale.id);
    }
  }

  entities = entities.map(e =>
    newMatingIds.has(e.id) ? { ...e, state: 'mating' as const } : e
  );

  // Rebuild grid after births (occupancy shifted from babies)
  const moveGrid = createOccupancyGrid(gridSize, entities);

  // --- Step 3: Move idle entities ---
  // Shuffle indices for fairness
  const indices = Array.from({ length: entities.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const babyIds = new Set(babies.map(b => b.id));

  for (const idx of indices) {
    const entity = entities[idx];
    if (entity.state !== 'idle' || babyIds.has(entity.id)) continue;

    const target = randomStep(entity.position, gridSize);
    if (moveGrid[target.y][target.x] < 2) {
      moveGrid[entity.position.y][entity.position.x]--;
      moveGrid[target.y][target.x]++;
      entities[idx] = { ...entity, position: target };
    }
  }

  return { ...state, tick: state.tick + 1, entities };
}
