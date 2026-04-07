import type { Entity, Position, WorldState, RGB } from './types';
import { MIN_REPRODUCTIVE_AGE, MAX_REPRODUCTIVE_AGE, TICKS_PER_YEAR, ACTION_DURATION, PHEROMONE_RANGE } from './types';
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
      stateTimer: 0,
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

  // --- Step 1: Resolve completed actions (timer reaches 1 → done this tick) ---
  const grid = createOccupancyGrid(gridSize, entities);
  const babies: Entity[] = [];
  const resolvedIds = new Set<string>();
  const deadIds = new Set<string>();

  // Group busy entities by tile
  const busyByTile = new Map<number, Entity[]>();
  for (const e of entities) {
    if (e.state !== 'idle') {
      const key = e.position.y * gridSize + e.position.x;
      const group = busyByTile.get(key) ?? [];
      group.push(e);
      busyByTile.set(key, group);
    }
  }

  for (const [, group] of busyByTile) {
    // Check if this group's timer is done (timer === 1 means this is the last tick)
    const finishing = group.filter(e => e.stateTimer === 1);
    if (finishing.length === 0) continue;

    if (finishing[0].state === 'mating') {
      const male = finishing.find(e => e.gender === 'male');
      const female = finishing.find(e => e.gender === 'female');
      if (male && female) {
        resolvedIds.add(male.id);
        resolvedIds.add(female.id);

        const ns = neighbors(male.position, gridSize);
        const free = ns.filter(n => grid[n.y][n.x] < 2);
        const birthPos = free.length > 0
          ? free[Math.floor(Math.random() * free.length)]
          : { ...male.position };

        babies.push({
          id: generateId(),
          position: birthPos,
          gender: Math.random() < 0.5 ? 'male' : 'female',
          state: 'idle',
          stateTimer: 0,
          age: 0,
          maxAge: randomMaxAge(),
          color: mixColors(male.color, female.color),
        });
        grid[birthPos.y][birthPos.x]++;
      }
    } else if (finishing[0].state === 'fighting') {
      // Fight resolved — random loser dies
      const loser = finishing[Math.floor(Math.random() * finishing.length)];
      deadIds.add(loser.id);
      for (const e of finishing) {
        if (!deadIds.has(e.id)) resolvedIds.add(e.id);
      }
    }
  }

  // Apply resolutions: resolved → idle, dead → removed, timers decremented
  entities = entities
    .filter(e => !deadIds.has(e.id))
    .map(e => {
      if (resolvedIds.has(e.id)) {
        return { ...e, state: 'idle' as const, stateTimer: 0 };
      }
      if (e.state !== 'idle' && e.stateTimer > 1) {
        return { ...e, stateTimer: e.stateTimer - 1 };
      }
      return e;
    });
  entities.push(...babies);

  // --- Step 2: Move idle entities (with pheromone attraction) ---
  const moveGrid = createOccupancyGrid(gridSize, entities);
  const indices = Array.from({ length: entities.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const babyIds = new Set(babies.map(b => b.id));

  for (const idx of indices) {
    const entity = entities[idx];
    if (entity.state !== 'idle' || babyIds.has(entity.id)) continue;

    // Pheromone attraction: find nearest opposite-gender idle entity within range
    let target: Position | null = null;

    if (PHEROMONE_RANGE > 0) {
      const oppositeGender = entity.gender === 'male' ? 'female' : 'male';
      let bestDist = PHEROMONE_RANGE + 1;
      let bestPos: Position | null = null;

      for (const other of entities) {
        if (other.gender !== oppositeGender || other.state !== 'idle') continue;
        const dx = Math.abs(other.position.x - entity.position.x);
        const dy = Math.abs(other.position.y - entity.position.y);
        const dist = dx + dy; // Manhattan distance
        if (dist > 0 && dist <= PHEROMONE_RANGE && dist < bestDist) {
          bestDist = dist;
          bestPos = other.position;
        }
      }

      if (bestPos) {
        // Step toward the attractive entity
        const dx = bestPos.x - entity.position.x;
        const dy = bestPos.y - entity.position.y;
        if (Math.abs(dx) >= Math.abs(dy)) {
          target = { x: entity.position.x + Math.sign(dx), y: entity.position.y };
        } else {
          target = { x: entity.position.x, y: entity.position.y + Math.sign(dy) };
        }
      }
    }

    // Fallback to random step
    if (!target) {
      target = randomStep(entity.position, gridSize);
    }

    if (moveGrid[target.y][target.x] < 2) {
      moveGrid[entity.position.y][entity.position.x]--;
      moveGrid[target.y][target.x]++;
      entities[idx] = { ...entity, position: target };
    }
  }

  // --- Step 3: Detect new interactions on tiles (after movement) ---
  const tileGroups = new Map<number, Entity[]>();
  for (const e of entities) {
    const key = e.position.y * gridSize + e.position.x;
    const group = tileGroups.get(key) ?? [];
    group.push(e);
    tileGroups.set(key, group);
  }

  const newActionIds = new Set<string>();

  for (const [, group] of tileGroups) {
    const idleMales = group.filter(e => e.gender === 'male' && e.state === 'idle' && !resolvedIds.has(e.id));
    const idleFemales = group.filter(e => e.gender === 'female' && e.state === 'idle' && !resolvedIds.has(e.id));

    // Priority: fights first (2 idle males)
    if (idleMales.length >= 2) {
      newActionIds.add(idleMales[0].id);
      newActionIds.add(idleMales[1].id);
    }
    // Then mating (idle male + idle female, both reproductive, not already fighting)
    else if (idleMales.length >= 1 && idleFemales.length >= 1) {
      const male = idleMales.find(e => isReproductive(e) && !newActionIds.has(e.id));
      const female = idleFemales.find(e => isReproductive(e));
      if (male && female) {
        newActionIds.add(male.id);
        newActionIds.add(female.id);
      }
    }
  }

  entities = entities.map(e => {
    if (!newActionIds.has(e.id)) return e;
    const key = e.position.y * gridSize + e.position.x;
    const group = tileGroups.get(key)!;
    const otherActionMale = group.find(
      o => o.id !== e.id && o.gender === 'male' && newActionIds.has(o.id)
    );
    if (e.gender === 'male' && otherActionMale) {
      return { ...e, state: 'fighting' as const, stateTimer: ACTION_DURATION };
    }
    return { ...e, state: 'mating' as const, stateTimer: ACTION_DURATION };
  });

  return { ...state, tick: state.tick + 1, entities };
}
