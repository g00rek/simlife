import type { Entity, Animal, Plant, Position, WorldState, RGB, Traits, LogEntry } from './types';
import {
  MIN_REPRODUCTIVE_AGE, MAX_REPRODUCTIVE_AGE, TICKS_PER_YEAR,
  BASE_PHEROMONE_RANGE, MATING_DURATION, FIGHTING_DURATION, HUNTING_DURATION, GATHERING_DURATION,
  ENERGY_MAX, ENERGY_START, ENERGY_DRAIN_INTERVAL, ENERGY_MEAT, ENERGY_PLANT,
  ENERGY_MATING_MIN, HUNGER_THRESHOLD, CHILD_AGE, TRAIT_ENERGY_COST,
  BASE_FOOD_SENSE_RANGE, ANIMAL_COUNT, PLANT_COUNT, PLANT_RESPAWN_INTERVAL,
  PLANT_GROW_TIME, FIGHT_MIN_AGE, MEAT_PORTIONS_PER_HUNT,
  ANIMAL_REPRO_INTERVAL, ANIMAL_MAX,
} from './types';
import { randomStep } from './movement';

interface CreateWorldOptions {
  gridSize: number;
  entityCount: number;
}

let nextId = 0;
function generateId(prefix = 'e'): string {
  return `${prefix}-${nextId++}`;
}

function randomMaxAge(): number {
  return (60 + Math.floor(Math.random() * 21)) * TICKS_PER_YEAR;
}

export function ageInYears(e: Entity): number {
  return Math.floor(e.age / TICKS_PER_YEAR);
}

function isReproductive(e: Entity): boolean {
  const years = ageInYears(e);
  return years >= MIN_REPRODUCTIVE_AGE && years <= MAX_REPRODUCTIVE_AGE;
}

function isHungry(e: Entity): boolean {
  return e.energy < HUNGER_THRESHOLD;
}

function isChild(e: Entity): boolean {
  return ageInYears(e) < CHILD_AGE;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function randomTraits(): Traits {
  return {
    strength: Math.floor(Math.random() * 5) + 3,   // 3-7
    speed: Math.floor(Math.random() * 2) + 1,       // 1-2
    perception: Math.floor(Math.random() * 3) + 1,  // 1-3
  };
}

function inheritTraits(a: Traits, b: Traits): Traits {
  return {
    strength: clamp(Math.round((a.strength + b.strength) / 2 + (Math.random() * 2 - 1)), 1, 10),
    speed: clamp(Math.round((a.speed + b.speed) / 2 + (Math.random() * 0.6 - 0.3)), 1, 3),
    perception: clamp(Math.round((a.perception + b.perception) / 2 + (Math.random() * 1.4 - 0.7)), 1, 5),
  };
}

function traitEnergyDrain(t: Traits): number {
  // Baseline = strength 3 + speed 1 + perception 1 = 5
  const total = t.strength + t.speed * 3 + t.perception;
  const baseline = 3 + 3 + 1; // 7
  return Math.max(0, (total - baseline) * TRAIT_ENERGY_COST);
}

function foodSenseRange(e: Entity): number {
  return BASE_FOOD_SENSE_RANGE + e.traits.perception;
}

function pheromoneRange(e: Entity): number {
  return BASE_PHEROMONE_RANGE + Math.floor(e.traits.perception / 2);
}

// Fight: higher strength = higher win chance (weighted random)
function fightWinner(a: Entity, b: Entity): Entity {
  const total = a.traits.strength + b.traits.strength;
  return Math.random() * total < a.traits.strength ? a : b;
}

const BASE_COLORS: RGB[] = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
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

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function stepToward(from: Position, to: Position): Position {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: from.x + Math.sign(dx), y: from.y };
  }
  return { x: from.x, y: from.y + Math.sign(dy) };
}

function randomPos(gridSize: number): Position {
  return {
    x: Math.floor(Math.random() * gridSize),
    y: Math.floor(Math.random() * gridSize),
  };
}

export function createWorld(options: CreateWorldOptions): WorldState {
  const { gridSize, entityCount } = options;
  const entities: Entity[] = [];

  for (let i = 0; i < entityCount; i++) {
    entities.push({
      id: generateId('e'),
      position: randomPos(gridSize),
      gender: i < entityCount / 2 ? 'male' : 'female',
      state: 'idle',
      stateTimer: 0,
      age: Math.floor(Math.random() * 31) * TICKS_PER_YEAR,
      maxAge: randomMaxAge(),
      color: BASE_COLORS[i % 3],
      energy: ENERGY_START,
      traits: randomTraits(),
      meat: 0,
    });
  }

  const animals: Animal[] = [];
  for (let i = 0; i < ANIMAL_COUNT; i++) {
    animals.push({
      id: generateId('a'),
      position: randomPos(gridSize),
      reproTimer: Math.floor(Math.random() * ANIMAL_REPRO_INTERVAL),
    });
  }

  const plants: Plant[] = [];
  for (let i = 0; i < PLANT_COUNT; i++) {
    // Half start mature, half growing
    const mature = i < PLANT_COUNT / 2;
    plants.push({
      id: generateId('p'),
      position: randomPos(gridSize),
      mature,
      growTimer: mature ? 0 : Math.floor(Math.random() * PLANT_GROW_TIME),
    });
  }

  return { entities, animals, plants, tick: 0, gridSize, log: [] };
}

// --- Interaction detection (mating/fighting) ---

function detectInteractions(
  entities: Entity[],
  gridSize: number,
  skipIds: Set<string>,
): Entity[] {
  const tileGroups = new Map<number, Entity[]>();
  for (const e of entities) {
    const key = e.position.y * gridSize + e.position.x;
    const group = tileGroups.get(key) ?? [];
    group.push(e);
    tileGroups.set(key, group);
  }

  const newActionIds = new Set<string>();

  for (const [, group] of tileGroups) {
    const idleMales = group.filter(e => e.gender === 'male' && e.state === 'idle' && !skipIds.has(e.id));
    const idleFemales = group.filter(e => e.gender === 'female' && e.state === 'idle' && !skipIds.has(e.id));

    // Only adult males fight (age >= FIGHT_MIN_AGE)
    const fightableMales = idleMales.filter(e => ageInYears(e) >= FIGHT_MIN_AGE);
    if (fightableMales.length >= 2) {
      newActionIds.add(fightableMales[0].id);
      newActionIds.add(fightableMales[1].id);
    } else if (idleMales.length >= 1 && idleFemales.length >= 1) {
      const male = idleMales.find(e =>
        isReproductive(e) && !newActionIds.has(e.id) && e.energy >= ENERGY_MATING_MIN && e.meat > 0
      );
      const female = idleFemales.find(e =>
        isReproductive(e) && e.energy >= ENERGY_MATING_MIN
      );
      if (male && female) {
        newActionIds.add(male.id);
        newActionIds.add(female.id);
      }
    }
  }

  return entities.map(e => {
    if (!newActionIds.has(e.id)) return e;
    const key = e.position.y * gridSize + e.position.x;
    const group = tileGroups.get(key)!;
    const otherActionMale = group.find(
      o => o.id !== e.id && o.gender === 'male' && newActionIds.has(o.id)
    );
    if (e.gender === 'male' && otherActionMale) {
      return { ...e, state: 'fighting' as const, stateTimer: FIGHTING_DURATION };
    }
    return { ...e, state: 'mating' as const, stateTimer: MATING_DURATION };
  });
}

// --- Main tick ---

export function tick(state: WorldState): WorldState {
  const { gridSize } = state;
  const tickNum = state.tick + 1;
  let animals = [...state.animals];
  let plants = [...state.plants];
  const log: LogEntry[] = [];

  // --- Step 0: Age, energy drain, eat meat if hungry, remove dead ---
  const aged: Entity[] = state.entities.map(e => {
    const a = { ...e, age: e.age + 1 };
    if (!isChild(a) && a.age % ENERGY_DRAIN_INTERVAL === 0) {
      const drain = 1 + traitEnergyDrain(a.traits);
      a.energy = Math.max(0, a.energy - drain);
    }
    // Males eat a meat portion when hungry
    if (a.meat > 0 && isHungry(a)) {
      a.meat -= 1;
      a.energy = Math.min(ENERGY_MAX, a.energy + ENERGY_MEAT);
    }
    return a;
  });

  let entities: Entity[] = [];
  for (const e of aged) {
    if (e.age >= e.maxAge) {
      log.push({ tick: tickNum, type: 'death', entityId: e.id, gender: e.gender, age: e.age, cause: 'old_age' });
    } else if (e.energy <= 0) {
      log.push({ tick: tickNum, type: 'death', entityId: e.id, gender: e.gender, age: e.age, cause: 'starvation' });
    } else {
      entities.push(e);
    }
  }

  // --- Step 1: Resolve completed actions ---
  const grid = createOccupancyGrid(gridSize, entities);
  const babies: Entity[] = [];
  const resolvedIds = new Set<string>();
  const deadIds = new Set<string>();
  const consumedAnimalIds = new Set<string>();
  const consumedPlantIds = new Set<string>();

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
    const finishing = group.filter(e => e.stateTimer === 1);
    if (finishing.length === 0) continue;

    const action = finishing[0].state;

    if (action === 'mating') {
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
          id: generateId('e'),
          position: birthPos,
          gender: Math.random() < 0.5 ? 'male' : 'female',
          state: 'idle',
          stateTimer: 0,
          age: 0,
          maxAge: randomMaxAge(),
          color: mixColors(male.color, female.color),
          energy: ENERGY_START,
          traits: inheritTraits(male.traits, female.traits),
          meat: 0,
        });
        const baby = babies[babies.length - 1];
        log.push({ tick: tickNum, type: 'birth', entityId: baby.id, gender: baby.gender, age: 0 });
        grid[birthPos.y][birthPos.x]++;
      }
    } else if (action === 'fighting') {
      // Strength-weighted fight: stronger has higher chance of winning
      const [a, b] = finishing;
      if (a && b) {
        const winner = fightWinner(a, b);
        const loser = winner.id === a.id ? b : a;
        deadIds.add(loser.id);
        log.push({ tick: tickNum, type: 'death', entityId: loser.id, gender: loser.gender, age: loser.age, cause: 'fight' });
        resolvedIds.add(winner.id);
      }
    } else if (action === 'hunting') {
      for (const hunter of finishing) {
        // Find animal on same tile to consume
        const prey = animals.find(a =>
          a.position.x === hunter.position.x &&
          a.position.y === hunter.position.y &&
          !consumedAnimalIds.has(a.id)
        );
        if (prey) {
          consumedAnimalIds.add(prey.id);
        }
        resolvedIds.add(hunter.id);
      }
    } else if (action === 'gathering') {
      for (const gatherer of finishing) {
        const plant = plants.find(p =>
          p.position.x === gatherer.position.x &&
          p.position.y === gatherer.position.y &&
          !consumedPlantIds.has(p.id)
        );
        if (plant) {
          consumedPlantIds.add(plant.id);
        }
        resolvedIds.add(gatherer.id);
      }
    }
  }

  // Apply results from resolved actions
  entities = entities
    .filter(e => !deadIds.has(e.id))
    .map(e => {
      if (resolvedIds.has(e.id)) {
        let energy = e.energy;
        let meat = e.meat;

        if (e.state === 'hunting') {
          const hadPrey = animals.some(a =>
            a.position.x === e.position.x &&
            a.position.y === e.position.y &&
            consumedAnimalIds.has(a.id)
          );
          if (hadPrey) meat += MEAT_PORTIONS_PER_HUNT;
        } else if (e.state === 'gathering') {
          const hadPlant = plants.some(p =>
            p.position.x === e.position.x &&
            p.position.y === e.position.y &&
            consumedPlantIds.has(p.id)
          );
          if (hadPlant) energy = Math.min(ENERGY_MAX, energy + ENERGY_PLANT);
        } else if (e.state === 'mating') {
          // Male gives 1 meat portion to female upon mating completion
          if (e.gender === 'female') {
            energy = Math.min(ENERGY_MAX, energy + ENERGY_MEAT);
          } else if (e.gender === 'male') {
            meat = Math.max(0, meat - 1);
          }
        }

        return { ...e, state: 'idle' as const, stateTimer: 0, energy, meat };
      }
      if (e.state !== 'idle' && e.stateTimer > 1) {
        return { ...e, stateTimer: e.stateTimer - 1 };
      }
      return e;
    });
  entities.push(...babies);

  // Remove consumed resources
  animals = animals.filter(a => !consumedAnimalIds.has(a.id));
  plants = plants.filter(p => !consumedPlantIds.has(p.id));

  // --- Step 1b: Move + reproduce animals ---
  const newAnimals: Animal[] = [];
  animals = animals.map(a => {
    const moved = {
      ...a,
      position: randomStep(a.position, gridSize),
      reproTimer: a.reproTimer - 1,
    };
    // Reproduce if timer expired and below carrying capacity
    if (moved.reproTimer <= 0 && animals.length + newAnimals.length < ANIMAL_MAX) {
      moved.reproTimer = ANIMAL_REPRO_INTERVAL;
      newAnimals.push({
        id: generateId('a'),
        position: { ...moved.position },
        reproTimer: ANIMAL_REPRO_INTERVAL + Math.floor(Math.random() * 10),
      });
    }
    return moved;
  });
  animals.push(...newAnimals);

  // --- Step 2: Detect interactions (pre-movement) ---
  entities = detectInteractions(entities, gridSize, resolvedIds);

  // --- Step 2b: Detect hunting/gathering ---
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e.state !== 'idle') continue;

    // Males hunt animals on same tile
    if (e.gender === 'male' && isHungry(e)) {
      const prey = animals.find(a =>
        a.position.x === e.position.x && a.position.y === e.position.y
      );
      if (prey) {
        const huntTime = Math.max(1, HUNTING_DURATION - Math.floor(e.traits.strength / 4));
        entities[i] = { ...e, state: 'hunting', stateTimer: huntTime };
        continue;
      }
    }

    // Females gather plants on same tile
    if (e.gender === 'female' && isHungry(e)) {
      const plant = plants.find(p =>
        p.mature && p.position.x === e.position.x && p.position.y === e.position.y
      );
      if (plant) {
        entities[i] = { ...e, state: 'gathering', stateTimer: GATHERING_DURATION };
        continue;
      }
    }
  }

  // --- Step 3: Move idle entities ---
  const moveGrid = createOccupancyGrid(gridSize, entities);
  const indices = Array.from({ length: entities.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const babyIds = new Set(babies.map(b => b.id));

  for (const idx of indices) {
    let entity = entities[idx];
    if (entity.state !== 'idle' || babyIds.has(entity.id)) continue;

    const steps = entity.traits.speed;
    const senseFood = foodSenseRange(entity);
    const senseMate = pheromoneRange(entity);

    for (let step = 0; step < steps; step++) {
      // Re-check state (might have been set by detection in previous step... not here but safety)
      if (entity.state !== 'idle') break;

      let target: Position | null = null;

      // Priority 1: Hungry → seek food
      if (isHungry(entity) && !isChild(entity)) {
        if (entity.gender === 'male') {
          let bestDist = senseFood + 1;
          for (const a of animals) {
            const d = manhattan(entity.position, a.position);
            if (d > 0 && d <= senseFood && d < bestDist) {
              bestDist = d;
              target = stepToward(entity.position, a.position);
            }
          }
        } else {
          let bestDist = senseFood + 1;
          for (const p of plants) {
            if (!p.mature) continue;
            const d = manhattan(entity.position, p.position);
            if (d > 0 && d <= senseFood && d < bestDist) {
              bestDist = d;
              target = stepToward(entity.position, p.position);
            }
          }
        }
      }

      // Priority 2: Fed + reproductive → pheromone attraction
      if (!target && isReproductive(entity) && !isHungry(entity)
          && entity.energy >= ENERGY_MATING_MIN) {
        const oppositeGender = entity.gender === 'male' ? 'female' : 'male';
        let bestDist = senseMate + 1;
        let bestPos: Position | null = null;

        for (const other of entities) {
          if (other.gender !== oppositeGender || other.state !== 'idle' || !isReproductive(other)) continue;
          if (other.energy < ENERGY_MATING_MIN) continue;
          // Females only attracted to males with meat
          if (entity.gender === 'female' && other.meat <= 0) continue;
          // Males need meat to mate
          if (entity.gender === 'male' && entity.meat <= 0) continue;
          const d = manhattan(entity.position, other.position);
          if (d > 0 && d <= senseMate && d < bestDist) {
            bestDist = d;
            bestPos = other.position;
          }
        }

        if (bestPos) {
          target = stepToward(entity.position, bestPos);
        }
      }

      // Priority 3: Random step
      if (!target) {
        target = randomStep(entity.position, gridSize);
      }

      if (moveGrid[target.y][target.x] < 2) {
        moveGrid[entity.position.y][entity.position.x]--;
        moveGrid[target.y][target.x]++;
        entity = { ...entity, position: target };
        entities[idx] = entity;
      }
    }
  }

  // --- Step 4: Detect interactions (post-movement) ---
  entities = detectInteractions(entities, gridSize, resolvedIds);

  // --- Step 4b: Detect hunting/gathering (post-movement) ---
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e.state !== 'idle') continue;

    if (e.gender === 'male' && isHungry(e)) {
      const prey = animals.find(a =>
        a.position.x === e.position.x && a.position.y === e.position.y
      );
      if (prey) {
        const huntTime = Math.max(1, HUNTING_DURATION - Math.floor(e.traits.strength / 4));
        entities[i] = { ...e, state: 'hunting', stateTimer: huntTime };
        continue;
      }
    }

    if (e.gender === 'female' && isHungry(e)) {
      const plant = plants.find(p =>
        p.mature && p.position.x === e.position.x && p.position.y === e.position.y
      );
      if (plant) {
        entities[i] = { ...e, state: 'gathering', stateTimer: GATHERING_DURATION };
        continue;
      }
    }
  }

  // --- Step 5: Grow plants + respawn resources ---
  plants = plants.map(p => {
    if (p.mature) return p;
    const timer = p.growTimer - 1;
    if (timer <= 0) return { ...p, mature: true, growTimer: 0 };
    return { ...p, growTimer: timer };
  });

  if (tickNum % PLANT_RESPAWN_INTERVAL === 0) {
    plants.push({
      id: generateId('p'),
      position: randomPos(gridSize),
      mature: false,
      growTimer: PLANT_GROW_TIME,
    });
  }

  const fullLog = [...state.log, ...log];
  return { entities, animals, plants, tick: tickNum, gridSize, log: fullLog };
}
