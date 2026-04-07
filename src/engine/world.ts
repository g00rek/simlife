import type { Entity, Animal, Plant, Position, WorldState, RGB, Traits, LogEntry, Biome, Village, TribeId } from './types';
import {
  MIN_REPRODUCTIVE_AGE, MAX_REPRODUCTIVE_AGE, TICKS_PER_YEAR,
  BASE_PHEROMONE_RANGE, MATING_DURATION, PREGNANCY_DURATION, FIGHTING_DURATION, HUNTING_DURATION, GATHERING_DURATION,
  ENERGY_MAX, ENERGY_START, ENERGY_DRAIN_INTERVAL, ENERGY_MEAT, ENERGY_PLANT,
  ENERGY_MATING_MIN, HUNGER_THRESHOLD, CHILD_AGE, TRAIT_ENERGY_COST,
  BASE_FOOD_SENSE_RANGE, ANIMAL_COUNT, PLANT_COUNT, PLANT_RESPAWN_INTERVAL,
  PLANT_GROW_TIME, FIGHT_MIN_AGE, MEAT_PORTIONS_PER_HUNT,
  ANIMAL_REPRO_INTERVAL, ANIMAL_MAX, ANIMAL_FLEE_RANGE, FOREST_SPEED_PENALTY, FOREST_PLANT_BONUS, VILLAGE_RADIUS, PANTRY_MATING_MIN, VILLAGE_OPTIMAL_POP,
} from './types';
import { generateBiomeGrid, isPassable, isPassableForRonin } from './biomes';
// randomStep from movement.ts still used by randomStepBiome as fallback concept
// but we now use randomStepBiome directly

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
    aggression: Math.floor(Math.random() * 4) + 1,          // 1-4 (low start, evolution decides)
    fertility: +(0.8 + Math.random() * 0.4).toFixed(2),     // 0.8-1.2
    twinChance: +(Math.random() * 0.1).toFixed(2),         // 0-0.1 (low on start)
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
    twinChance: inheritTrait(a.twinChance, b.twinChance, 0, 0.5, 0.05),
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

function stepToward(from: Position, to: Position, biomes?: Biome[][], gridSize?: number, tribe?: TribeId, villages?: Village[]): Position {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const primary = Math.abs(dx) >= Math.abs(dy)
    ? { x: from.x + Math.sign(dx), y: from.y }
    : { x: from.x, y: from.y + Math.sign(dy) };
  if (!biomes || !gridSize || isValidMove(primary, biomes, gridSize, tribe, villages)) return primary;
  const secondary = Math.abs(dx) >= Math.abs(dy)
    ? { x: from.x, y: from.y + Math.sign(dy || 1) }
    : { x: from.x + Math.sign(dx || 1), y: from.y };
  if (isValidMove(secondary, biomes, gridSize, tribe, villages)) return secondary;
  return from;
}

function randomPos(gridSize: number): Position {
  return {
    x: Math.floor(Math.random() * gridSize),
    y: Math.floor(Math.random() * gridSize),
  };
}

function isInVillage(pos: Position, village: Village): boolean {
  return manhattan(pos, village.center) <= village.radius;
}

function getVillageAt(pos: Position, villages: Village[]): Village | undefined {
  return villages.find(v => isInVillage(pos, v));
}

function matingEnergyCost(tribe: TribeId, entities: Entity[]): number {
  if (tribe < 0) return ENERGY_MATING_MIN;
  const tribePop = entities.filter(e => e.tribe === tribe).length;
  if (tribePop <= VILLAGE_OPTIMAL_POP) return ENERGY_MATING_MIN;
  // Over capacity: exponential increase in required energy
  const overcrowding = tribePop / VILLAGE_OPTIMAL_POP;
  return Math.min(ENERGY_MAX, Math.round(ENERGY_MATING_MIN * overcrowding));
}

function canEnterTile(pos: Position, tribe: TribeId, villages: Village[]): boolean {
  const v = getVillageAt(pos, villages);
  if (!v) return true; // not in any village — free land
  return v.tribe === tribe; // can only enter own village
}

function randomPassablePos(biomes: Biome[][], gridSize: number): Position {
  for (let i = 0; i < 100; i++) {
    const p = randomPos(gridSize);
    if (isPassable(biomes[p.y][p.x])) return p;
  }
  return randomPos(gridSize); // fallback
}

function isValidMove(pos: Position, biomes: Biome[][], gridSize: number, tribe?: TribeId, villages?: Village[]): boolean {
  if (pos.x < 0 || pos.x >= gridSize || pos.y < 0 || pos.y >= gridSize) return false;
  // Ronins can traverse mountains
  const passable = tribe === -1 ? isPassableForRonin(biomes[pos.y][pos.x]) : isPassable(biomes[pos.y][pos.x]);
  if (!passable) return false;
  if (tribe !== undefined && villages) {
    if (!canEnterTile(pos, tribe, villages)) return false;
  }
  return true;
}

function randomStepBiome(position: Position, gridSize: number, biomes: Biome[][]): Position {
  const dirs: Position[] = [
    { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
  ];
  // Shuffle directions
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  for (const d of dirs) {
    const np = { x: position.x + d.x, y: position.y + d.y };
    if (isValidMove(np, biomes, gridSize)) return np;
  }
  return position; // stuck (surrounded by impassable)
}

export function createWorld(options: CreateWorldOptions): WorldState {
  const { gridSize, entityCount } = options;
  const biomes = generateBiomeGrid(gridSize);

  // Create 3 villages in different quadrants
  const tribeColors: RGB[] = [[220, 60, 60], [60, 180, 60], [60, 100, 220]];
  const tribeNames = ['Red Tribe', 'Green Tribe', 'Blue Tribe'];
  const villageCenters: Position[] = [
    { x: Math.floor(gridSize * 0.2), y: Math.floor(gridSize * 0.2) },
    { x: Math.floor(gridSize * 0.8), y: Math.floor(gridSize * 0.2) },
    { x: Math.floor(gridSize * 0.5), y: Math.floor(gridSize * 0.8) },
  ];

  // Ensure village centers are on passable terrain
  for (const vc of villageCenters) {
    if (!isPassable(biomes[vc.y][vc.x])) {
      biomes[vc.y][vc.x] = 'plains';
    }
    // Clear area around village center
    for (let dy = -VILLAGE_RADIUS; dy <= VILLAGE_RADIUS; dy++) {
      for (let dx = -VILLAGE_RADIUS; dx <= VILLAGE_RADIUS; dx++) {
        if (Math.abs(dx) + Math.abs(dy) <= VILLAGE_RADIUS) {
          const nx = vc.x + dx;
          const ny = vc.y + dy;
          if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
            if (!isPassable(biomes[ny][nx])) biomes[ny][nx] = 'plains';
          }
        }
      }
    }
  }

  const villages: Village[] = villageCenters.map((center, i) => ({
    tribe: i as TribeId,
    center,
    radius: VILLAGE_RADIUS,
    color: tribeColors[i],
    name: tribeNames[i],
    meatStore: 10, // start with some food
    plantStore: 10,
  }));

  const entities: Entity[] = [];
  const perTribe = Math.floor(entityCount / 3);

  for (let t = 0; t < 3; t++) {
    const tribe = t as TribeId;
    const vc = villageCenters[t];
    for (let i = 0; i < perTribe; i++) {
      const traits = randomTraits();
      // Spawn near village center
      let pos: Position;
      for (let attempt = 0; attempt < 50; attempt++) {
        const ox = Math.floor(Math.random() * (VILLAGE_RADIUS * 2 + 1)) - VILLAGE_RADIUS;
        const oy = Math.floor(Math.random() * (VILLAGE_RADIUS * 2 + 1)) - VILLAGE_RADIUS;
        const candidate = { x: vc.x + ox, y: vc.y + oy };
        if (Math.abs(ox) + Math.abs(oy) <= VILLAGE_RADIUS
            && candidate.x >= 0 && candidate.x < gridSize
            && candidate.y >= 0 && candidate.y < gridSize
            && isPassable(biomes[candidate.y][candidate.x])) {
          pos = candidate;
          break;
        }
      }
      pos ??= vc;

      entities.push({
        id: generateId('e'),
        position: pos,
        gender: i < perTribe / 2 ? 'male' : 'female',
        state: 'idle',
        stateTimer: 0,
        age: Math.floor(Math.random() * 31) * TICKS_PER_YEAR,
        maxAge: randomMaxAge(traits.fertility),
        color: traitsToColor(traits),
        energy: ENERGY_START,
        traits,
        meat: 0,
        tribe,
      });
    }
  }

  const animals: Animal[] = [];
  for (let i = 0; i < ANIMAL_COUNT; i++) {
    let pos: Position;
    for (let attempt = 0; ; attempt++) {
      pos = randomPassablePos(biomes, gridSize);
      if (!getVillageAt(pos, villages) || attempt > 30) break;
    }
    animals.push({
      id: generateId('a'),
      position: pos,
      reproTimer: Math.floor(Math.random() * ANIMAL_REPRO_INTERVAL),
    });
  }

  const plants: Plant[] = [];
  for (let i = 0; i < PLANT_COUNT; i++) {
    const mature = i < PLANT_COUNT / 2;
    // Spawn outside villages
    let pos: Position;
    for (let attempt = 0; ; attempt++) {
      pos = randomPassablePos(biomes, gridSize);
      if (!getVillageAt(pos, villages) || attempt > 30) break;
    }
    plants.push({
      id: generateId('p'),
      position: pos,
      mature,
      growTimer: mature ? 0 : Math.floor(Math.random() * PLANT_GROW_TIME),
    });
  }

  return { entities, animals, plants, biomes, villages, tick: 0, gridSize, log: [] };
}

// --- Interaction detection (mating/fighting) ---

function detectInteractions(
  entities: Entity[],
  gridSize: number,
  skipIds: Set<string>,
  villages: Village[],
  allEntities: Entity[],
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

    // Only adult males from DIFFERENT tribes fight (or anyone vs ronin)
    const fightableMales = idleMales.filter(e => ageInYears(e) >= FIGHT_MIN_AGE);
    let fightStarted = false;
    if (fightableMales.length >= 2) {
      // Find first pair from different tribes
      for (let i = 0; i < fightableMales.length - 1 && !fightStarted; i++) {
        for (let j = i + 1; j < fightableMales.length && !fightStarted; j++) {
          const m1 = fightableMales[i];
          const m2 = fightableMales[j];
          if (m1.tribe !== m2.tribe || m1.tribe === -1 || m2.tribe === -1) {
            const m1Fights = Math.random() < m1.traits.aggression / 10;
            const m2Fights = Math.random() < m2.traits.aggression / 10;
            if (m1Fights && m2Fights) {
              newActionIds.add(m1.id);
              newActionIds.add(m2.id);
              fightStarted = true;
            }
          }
        }
      }
    }
    if (!fightStarted && idleMales.length >= 1 && idleFemales.length >= 1) {
      const male = idleMales.find(e => {
        const minEnergy = matingEnergyCost(e.tribe, allEntities);
        if (!isReproductive(e) || newActionIds.has(e.id) || e.energy < minEnergy) return false;
        const v = e.tribe >= 0 ? villages.find(vl => vl.tribe === e.tribe) : undefined;
        return v ? v.meatStore >= PANTRY_MATING_MIN : e.meat > 0;
      });
      const female = idleFemales.find(e => {
        const minEnergy = matingEnergyCost(e.tribe, allEntities);
        return isReproductive(e) && e.energy >= minEnergy;
      });
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
  const { gridSize, biomes, villages } = state;
  const tickNum = state.tick + 1;
  const updatedVillages = villages.map(v => ({ ...v }));
  function getVillage(tribe: TribeId) {
    return tribe >= 0 ? updatedVillages[tribe] : undefined;
  }
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
    // Hungry → eat from village pantry or personal meat (ronin)
    if (isHungry(a) && !isChild(a)) {
      const myV = a.tribe >= 0 ? villages.find(v => v.tribe === a.tribe) : undefined;
      if (myV && myV.meatStore > 0) {
        myV.meatStore -= 1;
        a.energy = Math.min(ENERGY_MAX, a.energy + ENERGY_MEAT);
      } else if (myV && myV.plantStore > 0) {
        myV.plantStore -= 1;
        a.energy = Math.min(ENERGY_MAX, a.energy + ENERGY_PLANT);
      } else if (a.meat > 0) {
        // Ronin or empty pantry — personal meat
        a.meat -= 1;
        a.energy = Math.min(ENERGY_MAX, a.energy + ENERGY_MEAT);
      }
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
        // Male goes free, female becomes pregnant
        resolvedIds.add(male.id);
        resolvedIds.add(female.id);
        // Female stores partner info for birth (handled in pregnantIds below)
      }
    } else if (action === 'pregnant') {
      // Pregnancy complete → give birth
      for (const mother of finishing) {
        resolvedIds.add(mother.id);

        const fatherTraits = mother.partnerTraits ?? mother.traits;
        const tc = mother.traits.twinChance;
        let babyCount = 1;
        if (Math.random() < tc) {
          const roll = Math.random();
          if (roll < 0.7) babyCount = 2;
          else if (roll < 0.92) babyCount = 3;
          else babyCount = 4;
        }

        const ns = neighbors(mother.position, gridSize);

        for (let b = 0; b < babyCount; b++) {
          const free = ns.filter(n => grid[n.y][n.x] < 2);
          const birthPos = free.length > 0
            ? free[Math.floor(Math.random() * free.length)]
            : { ...mother.position };

          const babyTraits = inheritTraits(fatherTraits, mother.traits);
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
            // Same tribe parents → child in tribe. Mixed → ronin (-1)
            tribe: (mother.partnerTribe === mother.tribe ? mother.tribe : -1) as TribeId,
          });
          const baby = babies[babies.length - 1];
          log.push({ tick: tickNum, type: 'birth', entityId: baby.id, gender: baby.gender, age: 0 });
          grid[birthPos.y][birthPos.x]++;
        }
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
        const myVillage = getVillage(e.tribe);

        if (e.state === 'hunting') {
          const hadPrey = animals.some(a =>
            a.position.x === e.position.x &&
            a.position.y === e.position.y &&
            consumedAnimalIds.has(a.id)
          );
          if (hadPrey) {
            if (myVillage) {
              myVillage.meatStore += MEAT_PORTIONS_PER_HUNT;
            } else {
              meat += MEAT_PORTIONS_PER_HUNT; // ronin keeps it
            }
          }
        } else if (e.state === 'gathering') {
          const hadPlant = plants.some(p =>
            p.position.x === e.position.x &&
            p.position.y === e.position.y &&
            consumedPlantIds.has(p.id)
          );
          if (hadPlant) {
            if (myVillage) {
              myVillage.plantStore += 1;
            } else {
              energy = Math.min(ENERGY_MAX, energy + ENERGY_PLANT); // ronin eats directly
            }
          }
        } else if (e.state === 'mating') {
          if (e.gender === 'male') {
            if (myVillage) {
              myVillage.meatStore = Math.max(0, myVillage.meatStore - 1);
            } else {
              meat = Math.max(0, meat - 1);
            }
            return { ...e, state: 'idle' as const, stateTimer: 0, energy, meat };
          }
          const malePartner = entities.find(
            o => o.id !== e.id && o.gender === 'male' && o.state === 'mating'
              && o.position.x === e.position.x && o.position.y === e.position.y
          );
          const pregTime = Math.max(3, Math.round(PREGNANCY_DURATION / e.traits.fertility));
          energy = Math.min(ENERGY_MAX, energy + ENERGY_MEAT); // fed by tribe/partner
          return {
            ...e,
            state: 'pregnant' as const,
            stateTimer: pregTime,
            energy,
            meat,
            partnerTraits: malePartner?.traits ?? e.traits,
            partnerColor: malePartner?.color ?? e.color,
            partnerTribe: malePartner?.tribe ?? e.tribe,
          };
        } else if (e.state === 'pregnant') {
          return { ...e, state: 'idle' as const, stateTimer: 0, energy, meat, partnerTraits: undefined, partnerColor: undefined };
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

  // --- Step 1b: Move animals (flee from humans) + tick cooldowns ---
  animals = animals.map(a => {
    let newPos: Position;
    // Check for nearest human within flee range
    let nearestHumanDist = ANIMAL_FLEE_RANGE + 1;
    let nearestHumanPos: Position | null = null;
    for (const e of entities) {
      const d = manhattan(a.position, e.position);
      if (d > 0 && d <= ANIMAL_FLEE_RANGE && d < nearestHumanDist) {
        nearestHumanDist = d;
        nearestHumanPos = e.position;
      }
    }
    if (nearestHumanPos) {
      // Flee: step away from human
      const dx = a.position.x - nearestHumanPos.x;
      const dy = a.position.y - nearestHumanPos.y;
      const flee = Math.abs(dx) >= Math.abs(dy)
        ? { x: a.position.x + Math.sign(dx || 1), y: a.position.y }
        : { x: a.position.x, y: a.position.y + Math.sign(dy || 1) };
      newPos = (isValidMove(flee, biomes, gridSize) && !getVillageAt(flee, updatedVillages))
        ? flee : randomStepBiome(a.position, gridSize, biomes);
    } else {
      newPos = randomStepBiome(a.position, gridSize, biomes);
    }
    // Don't enter villages
    if (getVillageAt(newPos, updatedVillages)) newPos = a.position;
    return { ...a, position: newPos, reproTimer: Math.max(0, a.reproTimer - 1) };
  });

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
        const ns = neighbors({ x: px, y: py }, gridSize).filter(
          n => isPassable(biomes[n.y][n.x]) && !getVillageAt(n, updatedVillages)
        );
        if (ns.length === 0) continue;
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
  entities = detectInteractions(entities, gridSize, resolvedIds, updatedVillages, entities);

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

    const inForest = biomes[entity.position.y][entity.position.x] === 'forest';
    const steps = Math.max(1, entity.traits.speed - (inForest ? FOREST_SPEED_PENALTY : 0));
    const senseFood = foodSenseRange(entity);
    const senseMate = pheromoneRange(entity);

    for (let step = 0; step < steps; step++) {
      // Re-check state (might have been set by detection in previous step... not here but safety)
      if (entity.state !== 'idle') break;

      let target: Position | null = null;
      const myVillage = getVillage(entity.tribe);
      const inOwnVillage = myVillage && isInVillage(entity.position, myVillage);

      // Priority 0: Return to village (children always, females when fed, males only when seeking mate)
      const shouldReturnHome = myVillage && !inOwnVillage && (
        isChild(entity) ||
        (entity.gender === 'female' && !isHungry(entity)) ||
        (entity.gender === 'male' && !isHungry(entity) && isReproductive(entity) && entity.energy >= ENERGY_MATING_MIN && (getVillage(entity.tribe)?.meatStore ?? 0) >= PANTRY_MATING_MIN)
      );
      if (shouldReturnHome && myVillage) {
        target = stepToward(entity.position, myVillage.center, biomes, gridSize, entity.tribe, updatedVillages);
      }

      // Priority 0b: Adult male in village + not seeking mate → go hunt
      if (!target && inOwnVillage && entity.gender === 'male' && !isChild(entity)) {
        const wantsMate = isReproductive(entity) && entity.energy >= ENERGY_MATING_MIN
          && (getVillage(entity.tribe)?.meatStore ?? 0) >= PANTRY_MATING_MIN;
        if (!wantsMate) {
          // Walk toward edge of village to go hunt
          const dx = entity.position.x - myVillage!.center.x;
          const dy = entity.position.y - myVillage!.center.y;
          const awayX = entity.position.x + Math.sign(dx || (Math.random() < 0.5 ? 1 : -1));
          const awayY = entity.position.y + Math.sign(dy || (Math.random() < 0.5 ? 1 : -1));
          const away = { x: awayX, y: awayY };
          if (isValidMove(away, biomes, gridSize)) target = away;
        }
      }

      // Priority 1: Outside village → seek food
      if (!target && !isChild(entity) && !inOwnVillage) {
        if (entity.gender === 'male') {
          let bestDist = senseFood + 1;
          for (const a of animals) {
            const d = manhattan(entity.position, a.position);
            if (d > 0 && d <= senseFood && d < bestDist) {
              bestDist = d;
              target = stepToward(entity.position, a.position, biomes, gridSize, entity.tribe, villages);
            }
          }
        } else {
          let bestDist = senseFood + 1;
          for (const p of plants) {
            if (!p.mature) continue;
            const d = manhattan(entity.position, p.position);
            if (d > 0 && d <= senseFood && d < bestDist) {
              bestDist = d;
              target = stepToward(entity.position, p.position, biomes, gridSize, entity.tribe, villages);
            }
          }
        }
      }

      // Priority 1b: In village but hungry and pantry empty → go outside to forage
      if (!target && isHungry(entity) && !isChild(entity) && inOwnVillage && myVillage) {
        const pantryEmpty = myVillage.meatStore <= 0 && myVillage.plantStore <= 0;
        if (pantryEmpty) {
          // Walk toward edge of village (away from center)
          const dx = entity.position.x - myVillage.center.x;
          const dy = entity.position.y - myVillage.center.y;
          const awayX = entity.position.x + Math.sign(dx || (Math.random() < 0.5 ? 1 : -1));
          const awayY = entity.position.y + Math.sign(dy || (Math.random() < 0.5 ? 1 : -1));
          const away = { x: awayX, y: awayY };
          if (isValidMove(away, biomes, gridSize)) target = away;
        }
      }

      // Priority 2: Fed + reproductive → seek mate (whole village range if inside, pheromone range if outside)
      if (!target && isReproductive(entity) && !isHungry(entity)
          && entity.energy >= ENERGY_MATING_MIN) {
        const senseMateRange = inOwnVillage ? VILLAGE_RADIUS * 2 : senseMate;
        const oppositeGender = entity.gender === 'male' ? 'female' : 'male';
        let bestPos: Position | null = null;

        let bestScore = -1;
        for (const other of entities) {
          if (other.gender !== oppositeGender || other.state !== 'idle' || !isReproductive(other)) continue;
          if (other.energy < ENERGY_MATING_MIN) continue;
          // Check food for mating: village pantry or personal meat
          if (entity.gender === 'female') {
            const ov = other.tribe >= 0 ? updatedVillages[other.tribe] : undefined;
            if (!(ov ? ov.meatStore >= PANTRY_MATING_MIN : other.meat > 0)) continue;
          }
          if (entity.gender === 'male') {
            const mv = entity.tribe >= 0 ? updatedVillages[entity.tribe] : undefined;
            if (!(mv ? mv.meatStore >= PANTRY_MATING_MIN : entity.meat > 0)) continue;
          }
          const d = manhattan(entity.position, other.position);
          if (d <= 0 || d > senseMateRange) continue;
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
          target = stepToward(entity.position, bestPos, biomes, gridSize, entity.tribe, villages);
        }
      }

      // Priority 3: Random step (only outside village — in village, stay put)
      if (!target && !inOwnVillage) {
        target = randomStepBiome(entity.position, gridSize, biomes);
      }

      if (target && moveGrid[target.y][target.x] < 2 && canEnterTile(target, entity.tribe, villages)) {
        moveGrid[entity.position.y][entity.position.x]--;
        moveGrid[target.y][target.x]++;
        entity = { ...entity, position: target };
        entities[idx] = entity;
      }
    }
  }

  // --- Step 4: Detect interactions (post-movement) ---
  entities = detectInteractions(entities, gridSize, resolvedIds, updatedVillages, entities);

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

  const MAX_PLANTS = 80;
  if (tickNum % PLANT_RESPAWN_INTERVAL === 0 && plants.length < MAX_PLANTS) {
    // Spawn on passable tile NOT inside a village
    for (let attempt = 0; attempt < 20; attempt++) {
      const pos = randomPassablePos(biomes, gridSize);
      if (!getVillageAt(pos, updatedVillages)) {
        plants.push({ id: generateId('p'), position: pos, mature: false, growTimer: PLANT_GROW_TIME });
        break;
      }
    }
    // Bonus spawns in forest (not in villages)
    for (let b = 0; b < FOREST_PLANT_BONUS && plants.length < MAX_PLANTS; b++) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const p = randomPos(gridSize);
        if (biomes[p.y][p.x] === 'forest' && !getVillageAt(p, updatedVillages)) {
          plants.push({
            id: generateId('p'),
            position: p,
            mature: false,
            growTimer: PLANT_GROW_TIME,
          });
          break;
        }
      }
    }
  }

  // --- Step 6: Ronin settlement — 3+ ronins on mountain tile → found new village ---
  const roninsByTile = new Map<number, Entity[]>();
  for (const e of entities) {
    if (e.tribe !== -1) continue;
    const key = e.position.y * gridSize + e.position.x;
    const group = roninsByTile.get(key) ?? [];
    group.push(e);
    roninsByTile.set(key, group);
  }

  for (const [key, group] of roninsByTile) {
    if (group.length < 3) continue;
    const x = key % gridSize;
    const y = Math.floor(key / gridSize);
    if (biomes[y][x] !== 'mountain') continue;
    // Already a village here?
    if (getVillageAt({ x, y }, updatedVillages)) continue;

    // Found new tribe!
    const newTribeId = updatedVillages.length;
    const r = 50 + Math.floor(Math.random() * 150);
    const g = 50 + Math.floor(Math.random() * 150);
    const b = 50 + Math.floor(Math.random() * 150);
    updatedVillages.push({
      tribe: newTribeId,
      center: { x, y },
      radius: 3, // small settlement
      color: [r, g, b] as RGB,
      name: `Tribe ${newTribeId}`,
      meatStore: 0,
      plantStore: 0,
    });
    // Clear mountain around settlement center for passability
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (Math.abs(dx) + Math.abs(dy) <= 3) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
            if (biomes[ny][nx] === 'mountain') biomes[ny][nx] = 'plains';
          }
        }
      }
    }
    // Assign ronins to new tribe
    for (const e of group) {
      const idx = entities.indexOf(e);
      if (idx >= 0) entities[idx] = { ...entities[idx], tribe: newTribeId };
    }
  }

  const fullLog = [...state.log, ...log];
  return { entities, animals, plants, biomes, villages: updatedVillages, tick: tickNum, gridSize, log: fullLog };
}
