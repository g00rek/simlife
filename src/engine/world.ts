import type { Entity, Animal, Plant, House, Position, WorldState, RGB, Traits, LogEntry, Biome, Village, TribeId } from './types';
import {
  MIN_REPRODUCTIVE_AGE, MAX_REPRODUCTIVE_AGE, TICKS_PER_YEAR,
  MATING_DURATION, PREGNANCY_DURATION, FIGHTING_DURATION,
  ENERGY_MAX, ENERGY_START, ENERGY_DRAIN_INTERVAL, ENERGY_MEAT, ENERGY_PLANT, ENERGY_MATING_MIN,
  HUNGER_THRESHOLD, CHILD_AGE, TRAIT_ENERGY_COST,
  ANIMAL_COUNT, PLANT_COUNT, PLANT_RESPAWN_INTERVAL,
  PLANT_GROW_TIME, FIGHT_MIN_AGE, MEAT_PORTIONS_PER_HUNT,
  CHOPPING_DURATION, BUILDING_DURATION,
  ANIMAL_REPRO_INTERVAL, ANIMAL_MAX, ANIMAL_FLEE_RANGE, FOREST_SPEED_PENALTY, FOREST_PLANT_BONUS, VILLAGE_RADIUS, VILLAGE_OPTIMAL_POP,
} from './types';
import { generateBiomeGrid, isPassable, isPassableForRonin } from './biomes';
import { decideAction, buildAIContext } from './utility-ai';

interface CreateWorldOptions {
  gridSize: number;
  entityCount: number;
  villageCount?: number; // 1-3, default 3
}

let nextId = 0;
function generateId(prefix = 'e'): string {
  return `${prefix}-${nextId++}`;
}

function randomMaxAge(fertility: number = 1.0): number {
  // Higher fertility = shorter life (trade-off)
  const baseAge = 50 + Math.floor(Math.random() * 21); // 50-70
  const adjusted = Math.round(baseAge / fertility);
  return clamp(adjusted, 35, 90) * TICKS_PER_YEAR;
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
  if (!biomes || !gridSize) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return Math.abs(dx) >= Math.abs(dy)
      ? { x: from.x + Math.sign(dx), y: from.y }
      : { x: from.x, y: from.y + Math.sign(dy) };
  }
  // Try all 4 directions, pick the passable one closest to target
  const candidates: Position[] = [
    { x: from.x + 1, y: from.y },
    { x: from.x - 1, y: from.y },
    { x: from.x, y: from.y + 1 },
    { x: from.x, y: from.y - 1 },
  ];
  let bestPos = from;
  let bestDist = manhattan(from, to);
  for (const c of candidates) {
    if (!isValidMove(c, biomes, gridSize, tribe, villages)) continue;
    const d = manhattan(c, to);
    if (d < bestDist) {
      bestDist = d;
      bestPos = c;
    }
  }
  // If no direction gets closer, try any passable (wall-following)
  if (bestPos === from) {
    // Shuffle to avoid always trying same direction
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const c of candidates) {
      if (isValidMove(c, biomes, gridSize, tribe, villages)) return c;
    }
  }
  return bestPos;
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
  const { gridSize, entityCount, villageCount = 3 } = options;
  const numVillages = Math.min(3, Math.max(1, villageCount));
  const biomes = generateBiomeGrid(gridSize);

  // Village definitions (up to 3)
  const allTribeColors: RGB[] = [[220, 60, 60], [60, 180, 60], [60, 100, 220]];
  const allTribeNames = ['Red Tribe', 'Green Tribe', 'Blue Tribe'];
  const allCenters: Position[] = [
    { x: Math.floor(gridSize * 0.2), y: Math.floor(gridSize * 0.2) },
    { x: Math.floor(gridSize * 0.8), y: Math.floor(gridSize * 0.2) },
    { x: Math.floor(gridSize * 0.5), y: Math.floor(gridSize * 0.8) },
  ];
  const tribeColors = allTribeColors.slice(0, numVillages);
  const tribeNames = allTribeNames.slice(0, numVillages);
  const villageCenters = allCenters.slice(0, numVillages);

  // Ensure village centers are on passable terrain
  for (const vc of villageCenters) {
    if (!isPassable(biomes[vc.y][vc.x])) {
      biomes[vc.y][vc.x] = 'plains';
    }
    // Clear area around village center + buffer zone (no mountains near villages)
    const clearRadius = VILLAGE_RADIUS + 3;
    for (let dy = -clearRadius; dy <= clearRadius; dy++) {
      for (let dx = -clearRadius; dx <= clearRadius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) <= clearRadius) {
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
    meatStore: 5, // modest start for Adam & Eve
    plantStore: 10,
  }));

  const entities: Entity[] = [];
  const perTribe = Math.floor(entityCount / numVillages);

  for (let t = 0; t < numVillages; t++) {
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
        age: (MIN_REPRODUCTIVE_AGE + Math.floor(Math.random() * 10)) * TICKS_PER_YEAR, // 18-27 years
        maxAge: randomMaxAge(traits.fertility),
        color: traitsToColor(traits),
        energy: ENERGY_START,
        traits,
        meat: 0,
        tribe,
        carryingWood: false,
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

  return { entities, animals, plants, houses: [], biomes, villages, tick: 0, gridSize, log: [] };
}

// --- Interaction detection (mating/fighting) ---

function detectInteractions(
  entities: Entity[],
  gridSize: number,
  skipIds: Set<string>,
  _villages: Village[],
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
    // Mating: male with house + his partner on same tile + both idle + reproductive + not pregnant
    if (!fightStarted && idleMales.length >= 1 && idleFemales.length >= 1) {
      const male = idleMales.find(e => {
        if (!isReproductive(e) || newActionIds.has(e.id) || !e.homeId) return false;
        const minEnergy = matingEnergyCost(e.tribe, allEntities);
        return e.energy >= minEnergy;
      });
      if (male) {
        // Find his partner (in his house) OR any unhoused reproductive female on same tile
        const female = idleFemales.find(e =>
          isReproductive(e) && e.state === 'idle' && (e.homeId === male.homeId || !e.homeId)
        );
        if (female) {
          newActionIds.add(male.id);
          newActionIds.add(female.id);
        }
      }
    }

    // Same-tribe adult males on same tile → training (sparring)
    if (!fightStarted) {
      const sameTribeMales = fightableMales.filter(e => !newActionIds.has(e.id) && e.tribe >= 0);
      if (sameTribeMales.length >= 2 && sameTribeMales[0].tribe === sameTribeMales[1].tribe) {
        newActionIds.add(sameTribeMales[0].id);
        newActionIds.add(sameTribeMales[1].id);
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
      // Same tribe → training, different tribe → fighting
      if (e.tribe >= 0 && otherActionMale.tribe === e.tribe) {
        return { ...e, state: 'training' as const, stateTimer: 3 };
      }
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
  let houses = [...state.houses];
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
            carryingWood: false,
            tribe: (mother.partnerTribe === mother.tribe ? mother.tribe : -1) as TribeId,
            homeId: mother.homeId, // baby lives in mother's house
          });
          const baby = babies[babies.length - 1];
          log.push({ tick: tickNum, type: 'birth', entityId: baby.id, gender: baby.gender, age: 0 });
          grid[birthPos.y][birthPos.x]++;
        }
      }
    } else if (action === 'training') {
      // Sparring complete → both get small stat boost
      for (const trainee of finishing) {
        resolvedIds.add(trainee.id);
      }
    } else if (action === 'fighting') {
      // Strength-weighted fight: loser takes damage, dies only if energy drops to 0
      const [a, b] = finishing;
      if (a && b) {
        const winner = fightWinner(a, b);
        const loserId = winner.id === a.id ? b.id : a.id;
        const loserEntity = winner.id === a.id ? b : a;
        const loserEnergy = loserEntity.energy - 40;
        if (loserEnergy <= 0) {
          deadIds.add(loserId);
          log.push({ tick: tickNum, type: 'death', entityId: loserId, gender: loserEntity.gender, age: loserEntity.age, cause: 'fight' });
        }
        // Loser energy reduction handled in apply step below
        resolvedIds.add(winner.id);
        resolvedIds.add(loserId);
      }
    } else if (action === 'chopping') {
      // Done chopping tree → now carrying wood
      for (const chopper of finishing) {
        resolvedIds.add(chopper.id);
        // Forest tile becomes plains (stump), will regrow
        if (biomes[chopper.position.y][chopper.position.x] === 'forest') {
          biomes[chopper.position.y][chopper.position.x] = 'plains';
        }
      }
    } else if (action === 'building') {
      // Done building → create house
      for (const builder of finishing) {
        resolvedIds.add(builder.id);
        const newHouse: House = {
          id: generateId('h'),
          position: { ...builder.position },
          tribe: builder.tribe,
          ownerId: builder.id,
        };
        houses.push(newHouse);
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

        if (e.state === 'chopping') {
          return { ...e, state: 'idle' as const, stateTimer: 0, energy: Math.max(0, energy - 10), meat, carryingWood: true };
        } else if (e.state === 'building') {
          const newHome = houses.find(h => h.ownerId === e.id && !e.homeId);
          return { ...e, state: 'idle' as const, stateTimer: 0, energy: Math.max(0, energy - 10), meat, carryingWood: false, homeId: newHome?.id };
        } else if (e.state === 'training') {
          // Sparring boosts random combat stat slightly
          const boosted = { ...e.traits };
          const roll = Math.random();
          if (roll < 0.5) {
            boosted.strength = Math.min(10, +(boosted.strength + 0.3).toFixed(1));
          } else if (roll < 0.8) {
            boosted.speed = Math.min(3, +(boosted.speed + 0.1).toFixed(1));
          } else {
            boosted.perception = Math.min(5, +(boosted.perception + 0.2).toFixed(1));
          }
          energy = Math.max(0, energy - 5); // light energy cost
          return { ...e, state: 'idle' as const, stateTimer: 0, energy, meat, traits: boosted };
        } else if (e.state === 'fighting') {
          energy = Math.max(0, energy - 20);
          return { ...e, state: 'idle' as const, stateTimer: 0, energy, meat };
        } else if (e.state === 'hunting') {
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
            return { ...e, state: 'idle' as const, stateTimer: 0, energy, meat };
          }
          const malePartner = entities.find(
            o => o.id !== e.id && o.gender === 'male' && o.state === 'mating'
              && o.position.x === e.position.x && o.position.y === e.position.y
          );
          const pregTime = Math.max(3, Math.round(PREGNANCY_DURATION / e.traits.fertility));
          // Female moves into male's house
          const maleHome = malePartner?.homeId;
          if (maleHome) {
            const house = houses.find(h => h.id === maleHome);
            if (house) house.partnerId = e.id;
          }
          return {
            ...e,
            state: 'pregnant' as const,
            stateTimer: pregTime,
            energy,
            meat,
            homeId: maleHome ?? e.homeId,
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

  // (Animals move after human movement + hunting detection — see step 5)

  // --- Step 2: Detect interactions (pre-movement) ---
  entities = detectInteractions(entities, gridSize, resolvedIds, updatedVillages, entities);

  // --- Step 2b: Instant hunting/gathering (on contact) ---
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e.state !== 'idle') continue;

    // Males hunt animals on same tile — instant kill (only if pantry needs it)
    const huntVillage = getVillage(e.tribe);
    const shouldHunt = e.gender === 'male' && (!huntVillage || huntVillage.meatStore < 20);
    if (shouldHunt) {
      const preyIdx = animals.findIndex(a =>
        a.position.x === e.position.x && a.position.y === e.position.y
      );
      if (preyIdx >= 0) {
        animals.splice(preyIdx, 1);
        const myV = getVillage(e.tribe);
        if (myV) {
          myV.meatStore += MEAT_PORTIONS_PER_HUNT;
        } else {
          entities[i] = { ...e, meat: e.meat + MEAT_PORTIONS_PER_HUNT };
        }
        continue;
      }
    }

    // Females gather mature plants on same tile — instant pick
    if (e.gender === 'female') {
      const plantIdx = plants.findIndex(p =>
        p.mature && p.position.x === e.position.x && p.position.y === e.position.y
      );
      if (plantIdx >= 0) {
        plants.splice(plantIdx, 1);
        const myV = getVillage(e.tribe);
        if (myV) {
          myV.plantStore += 1;
        } else {
          entities[i] = { ...e, energy: Math.min(ENERGY_MAX, e.energy + ENERGY_PLANT) };
        }
        continue;
      }
    }

    // Male without house, on forest tile → chop tree
    if (e.gender === 'male' && !isChild(e) && !e.homeId && !e.carryingWood
        && biomes[e.position.y][e.position.x] === 'forest') {
      entities[i] = { ...e, state: 'chopping', stateTimer: CHOPPING_DURATION };
      continue;
    }

    // Male carrying wood, in own village, on empty tile → build
    const eVillage = e.tribe >= 0 ? updatedVillages.find(v => v.tribe === e.tribe) : undefined;
    if (e.gender === 'male' && e.carryingWood && eVillage
        && isInVillage(e.position, eVillage)
        && !houses.some(h => h.position.x === e.position.x && h.position.y === e.position.y)) {
      entities[i] = { ...e, state: 'building', stateTimer: BUILDING_DURATION };
      continue;
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
    const speed = Math.max(1, entity.traits.speed - (inForest ? FOREST_SPEED_PENALTY : 0));

    for (let step = 0; step < speed; step++) {
      if (entity.state !== 'idle') break;

      // Build AI context and decide action
      const ctx = buildAIContext(entity, updatedVillages, animals, plants, entities, biomes, gridSize);
      const action = decideAction(ctx);

      let target: Position | null = null;

      switch (action.type) {
        case 'rest':
          break; // do nothing
        case 'return_home':
        case 'return_with_wood':
          if (ctx.village) target = stepToward(entity.position, ctx.village.center, biomes, gridSize, entity.tribe, updatedVillages);
          break;
        case 'go_chop':
          target = stepToward(entity.position, action.target, biomes, gridSize, entity.tribe, updatedVillages);
          break;
        case 'go_hunt':
          target = stepToward(entity.position, action.target, biomes, gridSize, entity.tribe, updatedVillages);
          break;
        case 'go_gather':
          target = stepToward(entity.position, action.target, biomes, gridSize, entity.tribe, updatedVillages);
          break;
        case 'leave_village':
          if (ctx.village) {
            const dx = entity.position.x - ctx.village.center.x;
            const dy = entity.position.y - ctx.village.center.y;
            target = {
              x: entity.position.x + Math.sign(dx || (Math.random() < 0.5 ? 1 : -1)),
              y: entity.position.y + Math.sign(dy || (Math.random() < 0.5 ? 1 : -1)),
            };
            if (!isValidMove(target, biomes, gridSize)) target = null;
          }
          break;
        case 'wander':
          target = randomStepBiome(entity.position, gridSize, biomes);
          break;
      }

      if (target && moveGrid[target.y][target.x] < 2 && canEnterTile(target, entity.tribe, villages)) {
        moveGrid[entity.position.y][entity.position.x]--;
        moveGrid[target.y][target.x]++;
        entity = { ...entity, position: target };
        entities[idx] = entity;

        // Inline instant hunt/gather on each step
        const stepV = getVillage(entity.tribe);
        if (entity.gender === 'male' && (!stepV || stepV.meatStore < 20)) {
          const pi = animals.findIndex(a => a.position.x === entity.position.x && a.position.y === entity.position.y);
          if (pi >= 0) {
            animals.splice(pi, 1);
            if (stepV) stepV.meatStore += MEAT_PORTIONS_PER_HUNT;
            else { entity = { ...entity, meat: entity.meat + MEAT_PORTIONS_PER_HUNT }; entities[idx] = entity; }
          }
        } else if (entity.gender === 'female') {
          const pi = plants.findIndex(p => p.mature && p.position.x === entity.position.x && p.position.y === entity.position.y);
          if (pi >= 0) {
            plants.splice(pi, 1);
            if (stepV) stepV.plantStore += 1;
            else { entity = { ...entity, energy: Math.min(ENERGY_MAX, entity.energy + ENERGY_PLANT) }; entities[idx] = entity; }
          }
        }
      }
    }
  }

  // --- Step 4: Detect interactions (post-movement) ---
  entities = detectInteractions(entities, gridSize, resolvedIds, updatedVillages, entities);

  // --- Step 4b: Instant hunting/gathering (post-movement) ---
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e.state !== 'idle') continue;

    const postHuntV = getVillage(e.tribe);
    const postShouldHunt = e.gender === 'male' && (!postHuntV || postHuntV.meatStore < 20);
    if (postShouldHunt) {
      const preyIdx = animals.findIndex(a =>
        a.position.x === e.position.x && a.position.y === e.position.y
      );
      if (preyIdx >= 0) {
        animals.splice(preyIdx, 1);
        if (postHuntV) postHuntV.meatStore += MEAT_PORTIONS_PER_HUNT;
        else entities[i] = { ...e, meat: e.meat + MEAT_PORTIONS_PER_HUNT };
        continue;
      }
    }

    if (e.gender === 'female') {
      const plantIdx = plants.findIndex(p =>
        p.mature && p.position.x === e.position.x && p.position.y === e.position.y
      );
      if (plantIdx >= 0) {
        plants.splice(plantIdx, 1);
        const myV = getVillage(e.tribe);
        if (myV) myV.plantStore += 1;
        else entities[i] = { ...e, energy: Math.min(ENERGY_MAX, e.energy + ENERGY_PLANT) };
        continue;
      }
    }

    // Chopping: male without house, on forest, not carrying wood
    if (e.gender === 'male' && !isChild(e) && !e.homeId && !e.carryingWood
        && biomes[e.position.y][e.position.x] === 'forest') {
      entities[i] = { ...e, state: 'chopping', stateTimer: CHOPPING_DURATION };
      continue;
    }

    // Building: male with wood, in own village, on empty tile
    const postBuildV = e.tribe >= 0 ? updatedVillages.find(v => v.tribe === e.tribe) : undefined;
    if (e.gender === 'male' && e.carryingWood && postBuildV
        && isInVillage(e.position, postBuildV)
        && !houses.some(h => h.position.x === e.position.x && h.position.y === e.position.y)) {
      entities[i] = { ...e, state: 'building', stateTimer: BUILDING_DURATION };
      continue;
    }
  }

  // --- Step 5: Move animals (AFTER humans so hunters can catch them) ---
  animals = animals.map(a => {
    let newPos: Position;
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
    if (getVillageAt(newPos, updatedVillages)) newPos = a.position;
    return { ...a, position: newPos, reproTimer: Math.max(0, a.reproTimer - 1) };
  });

  // --- Step 5b: Reproduce animals ---
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

  // --- Step 6: Grow plants + respawn resources ---
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
  return { entities, animals, plants, houses, biomes, villages: updatedVillages, tick: tickNum, gridSize, log: fullLog };
}
