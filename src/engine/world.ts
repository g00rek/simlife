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

function randomMaxAge(fertility: number = 1.0): number {
  // Higher fertility = shorter life (trade-off)
  const baseAge = 60 + Math.floor(Math.random() * 21); // 60-80
  const adjusted = Math.round(baseAge / fertility); // fertility 2.0 → 30-40 yrs, 0.5 → 120-160 yrs
  return clamp(adjusted, 40, 120) * TICKS_PER_YEAR;
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
    strength: Math.floor(Math.random() * 5) + 3,           // 3-7
    speed: Math.floor(Math.random() * 2) + 1,               // 1-2
    perception: Math.floor(Math.random() * 3) + 1,          // 1-3
    metabolism: +(0.8 + Math.random() * 0.4).toFixed(2),     // 0.8-1.2
    aggression: Math.floor(Math.random() * 6) + 2,          // 2-7
    fertility: +(0.8 + Math.random() * 0.4).toFixed(2),     // 0.8-1.2
  };
}

function inheritTrait(a: number, b: number, min: number, max: number, mutation: number): number {
  const avg = (a + b) / 2;
  return clamp(+(avg + (Math.random() * mutation * 2 - mutation)).toFixed(2), min, max);
}

function inheritTraits(a: Traits, b: Traits): Traits {
  // Rare dramatic mutation: 3% chance of one trait being extreme
  const dramaticMutation = Math.random() < 0.03;
  const traits: Traits = {
    strength: inheritTrait(a.strength, b.strength, 1, 10, 1),
    speed: inheritTrait(a.speed, b.speed, 1, 3, 0.3),
    perception: inheritTrait(a.perception, b.perception, 1, 5, 0.7),
    metabolism: inheritTrait(a.metabolism, b.metabolism, 0.5, 2.0, 0.1),
    aggression: inheritTrait(a.aggression, b.aggression, 0, 10, 1),
    fertility: inheritTrait(a.fertility, b.fertility, 0.5, 2.0, 0.1),
  };
  // Round integer traits
  traits.strength = Math.round(traits.strength);
  traits.speed = Math.round(traits.speed);
  traits.perception = Math.round(traits.perception);
  traits.aggression = Math.round(traits.aggression);

  if (dramaticMutation) {
    const traitKeys: (keyof Traits)[] = ['strength', 'speed', 'perception', 'aggression'];
    const key = traitKeys[Math.floor(Math.random() * traitKeys.length)];
    const maxVals: Record<string, number> = { strength: 10, speed: 3, perception: 5, aggression: 10 };
    // Push to extreme (high or low)
    traits[key] = Math.random() < 0.5 ? 1 : maxVals[key];
  }

  return traits;
}

function traitEnergyDrain(t: Traits): number {
  // Higher strength/speed/perception cost energy, metabolism reduces drain
  const total = t.strength + t.speed * 3 + t.perception;
  const baseline = 3 + 3 + 1;
  return Math.max(0, (total - baseline) * TRAIT_ENERGY_COST * t.metabolism);
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

// Color derived from traits: R=strength, G=perception, B=speed
function traitsToColor(t: Traits): RGB {
  return [
    clamp(Math.round((t.strength / 10) * 255), 30, 255),
    clamp(Math.round((t.perception / 5) * 255), 30, 255),
    clamp(Math.round((t.speed / 3) * 255), 30, 255),
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
    const traits = randomTraits();
    entities.push({
      id: generateId('e'),
      position: randomPos(gridSize),
      gender: i < entityCount / 2 ? 'male' : 'female',
      state: 'idle',
      stateTimer: 0,
      age: Math.floor(Math.random() * 31) * TICKS_PER_YEAR,
      maxAge: randomMaxAge(traits.fertility),
      color: traitsToColor(traits),
      energy: ENERGY_START,
      traits,
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

    // Only adult males fight (age >= FIGHT_MIN_AGE), and only if aggressive enough
    const fightableMales = idleMales.filter(e => ageInYears(e) >= FIGHT_MIN_AGE);
    if (fightableMales.length >= 2) {
      // Each male decides: fight or flee based on aggression (roll vs aggression/10)
      const [m1, m2] = fightableMales;
      const m1Fights = Math.random() < m1.traits.aggression / 10;
      const m2Fights = Math.random() < m2.traits.aggression / 10;
      if (m1Fights && m2Fights) {
        newActionIds.add(m1.id);
        newActionIds.add(m2.id);
      }
      // If one or both flee, no fight — they just move away next tick
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
    // Higher fertility = faster mating
    const matingTime = Math.max(1, Math.round(MATING_DURATION / e.traits.fertility));
    return { ...e, state: 'mating' as const, stateTimer: matingTime };
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
      const baseDrain = 1 + traitEnergyDrain(a.traits);
      // Hungry entities move less → half energy drain
      const drain = isHungry(a) ? baseDrain * 0.5 : baseDrain;
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

        const babyTraits = inheritTraits(male.traits, female.traits);
        babies.push({
          id: generateId('e'),
          position: birthPos,
          gender: Math.random() < 0.5 ? 'male' : 'female',
          state: 'idle',
          stateTimer: 0,
          age: 0,
          maxAge: randomMaxAge(babyTraits.fertility),
          color: traitsToColor(babyTraits),
          energy: ENERGY_START,
          traits: babyTraits,
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

  // --- Step 1b: Move animals + tick cooldowns ---
  animals = animals.map(a => ({
    ...a,
    position: randomStep(a.position, gridSize),
    reproTimer: Math.max(0, a.reproTimer - 1),
  }));

  // --- Step 1c: Reproduce animals (two ready on same tile → offspring) ---
  if (animals.length < ANIMAL_MAX) {
    const animalTiles = new Map<number, Animal[]>();
    for (const a of animals) {
      const key = a.position.y * gridSize + a.position.x;
      const group = animalTiles.get(key) ?? [];
      group.push(a);
      animalTiles.set(key, group);
    }
    const babyAnimals: Animal[] = [];
    for (const [key, group] of animalTiles) {
      const ready = group.filter(a => a.reproTimer === 0);
      if (ready.length >= 2 && animals.length + babyAnimals.length < ANIMAL_MAX) {
        // Two ready animals met → baby, both get cooldown
        ready[0].reproTimer = ANIMAL_REPRO_INTERVAL;
        ready[1].reproTimer = ANIMAL_REPRO_INTERVAL;
        const px = key % gridSize;
        const py = Math.floor(key / gridSize);
        const ns = neighbors({ x: px, y: py }, gridSize);
        const spot = ns[Math.floor(Math.random() * ns.length)];
        babyAnimals.push({
          id: generateId('a'),
          position: spot,
          reproTimer: ANIMAL_REPRO_INTERVAL,
        });
      }
    }
    animals.push(...babyAnimals);
  }

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
        let bestPos: Position | null = null;

        let bestScore = -1;
        for (const other of entities) {
          if (other.gender !== oppositeGender || other.state !== 'idle' || !isReproductive(other)) continue;
          if (other.energy < ENERGY_MATING_MIN) continue;
          if (entity.gender === 'female' && other.meat <= 0) continue;
          if (entity.gender === 'male' && entity.meat <= 0) continue;
          const d = manhattan(entity.position, other.position);
          if (d <= 0 || d > senseMate) continue;
          // Sexual selection: females prefer strong males with lots of meat
          const attractiveness = entity.gender === 'female'
            ? other.traits.strength + other.meat * 2 + other.traits.speed
            : 1; // Males go to nearest female
          const score = attractiveness / d; // closer + better traits = higher score
          if (score > bestScore) {
            bestScore = score;
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
