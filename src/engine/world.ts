import type { Entity, Animal, Tree, House, Position, WorldState, RGB, Traits, LogEntry, Biome, Village, TribeId, DeathCause } from './types';
import {
  MIN_REPRODUCTIVE_AGE, MAX_REPRODUCTIVE_AGE, TICKS_PER_YEAR,
  PREGNANCY_DURATION, BIRTH_COOLDOWN, INFANT_MORTALITY, MATERNAL_MORTALITY, FIGHTING_DURATION, TICKS_PER_DAY, MATE_COOLDOWN,
  ENERGY_MAX, ENERGY_START, ENERGY_DRAIN_INTERVAL, ENERGY_MEAT, ENERGY_PLANT,
  FOOD_RESERVE_MIN, FOOD_RESERVE_PER_PERSON, HUNGER_THRESHOLD, CHILD_AGE, TRAIT_ENERGY_COST, PLANT_RESERVE_MIN,
  ANIMAL_COUNT, scaled,
  FIGHT_MIN_AGE, MEAT_PORTIONS_PER_HUNT, TREE_FRUIT_PORTIONS,
  ANIMAL_REPRO_INTERVAL, ANIMAL_MAX, ANIMAL_HUNT_MIN_POPULATION, ANIMAL_FLEE_RANGE, FOREST_SPEED_PENALTY,
  WOOD_PER_CHOP, WINTER_COLD_DAMAGE, NEAR_HOME_RANGE,
  CHOPPING_DURATION, BUILDING_DURATION, HUNT_KILL_RANGE, HOUSE_WOOD_COST, HOUSE_CAPACITY,
  ANIMAL_ENERGY_MAX, ANIMAL_ENERGY_START, ANIMAL_ENERGY_GRAZE, ANIMAL_ENERGY_DRAIN,
  ANIMAL_DRAIN_INTERVAL, ANIMAL_REPRO_MIN_ENERGY, GRASS_GROW_CHANCE, GRASS_MAX_PER_TILE,
} from './types';
import { generateBiomeGrid, isPassable } from './biomes';
import type { BiomeGenParams } from './biomes';
import { decideAction, buildAIContext, actionToGoal, shouldReEvaluate } from './utility-ai';
import { randomName } from './names';

interface CreateWorldOptions {
  gridSize: number;
  entityCount: number;
  villageCount?: number; // 1-3, default 3
  biomeParams?: Partial<BiomeGenParams>;
}

let nextId = 0;
function generateId(prefix = 'e'): string {
  return `${prefix}-${nextId++}`;
}

function randomMaxAge(fertility: number = 1.0): number {
  // Higher fertility = shorter life (trade-off)
  const baseAge = 45 + Math.floor(Math.random() * 16); // 45-60
  const adjusted = Math.round(baseAge / fertility);
  return clamp(adjusted, 30, 75) * TICKS_PER_YEAR;
}

export function ageInYears(e: Entity): number {
  return Math.floor(e.age / TICKS_PER_YEAR);
}

function isReproductive(e: Entity): boolean {
  const years = ageInYears(e);
  return years >= MIN_REPRODUCTIVE_AGE && years <= MAX_REPRODUCTIVE_AGE;
}

function personalHungerThreshold(e: Entity): number {
  return e.hungerThreshold ?? HUNGER_THRESHOLD;
}

function isHungry(e: Entity): boolean {
  return e.energy < personalHungerThreshold(e);
}

function isChild(e: Entity): boolean {
  return ageInYears(e) < CHILD_AGE;
}

function homePosition(e: Entity, houses: House[]): Position | undefined {
  if (!e.homeId) return undefined;
  const h = houses.find(h => h.id === e.homeId);
  if (!h) return undefined;
  // Return center of 3×3 house
  return { x: h.position.x + 1, y: h.position.y + 1 };
}

function isAtHome(e: Entity, houses: House[]): boolean {
  if (!e.homeId) return false;
  const house = houses.find(h => h.id === e.homeId);
  if (!house) return false;
  // Entity is "at home" if within the 3×3 area
  const dx = e.position.x - house.position.x;
  const dy = e.position.y - house.position.y;
  return dx >= 0 && dx < 3 && dy >= 0 && dy < 3;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function randomHungerThreshold(): number {
  return HUNGER_THRESHOLD - 8 + Math.floor(Math.random() * 17); // 32..48 around baseline 40
}

function eatDirectlyToThreshold(entity: Entity, portionEnergy: number, availablePortions: number): { entity: Entity; remainingPortions: number } {
  let remaining = availablePortions;
  let energy = entity.energy;
  const threshold = personalHungerThreshold(entity);
  while (remaining > 0 && energy < threshold) {
    energy = Math.min(ENERGY_MAX, energy + portionEnergy);
    remaining--;
  }
  if (energy === entity.energy) return { entity, remainingPortions: remaining };
  return { entity: { ...entity, energy }, remainingPortions: remaining };
}

function villageFoodReserveTarget(population: number): number {
  return Math.max(FOOD_RESERVE_MIN, population * FOOD_RESERVE_PER_PERSON);
}

function villageNeedsFood(village: Village | undefined, entities: Entity[]): boolean {
  if (!village) return true;
  const population = entities.filter(e => e.tribe === village.tribe).length;
  const target = villageFoodReserveTarget(population);
  return village.meatStore + village.plantStore < target;
}

function villageNeedsPlants(village: Village | undefined, entities: Entity[]): boolean {
  return villageNeedsFood(village, entities) || (!!village && village.plantStore < PLANT_RESERVE_MIN);
}

export function canHuntAnimalPopulation(animals: Animal[], gridSize: number): boolean {
  return animals.length > scaled(ANIMAL_HUNT_MIN_POPULATION, gridSize, 2);
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

function createOccupancyGrid(gridSize: number, entities: Entity[], houses: House[] = []): number[][] {
  const grid: number[][] = Array.from({ length: gridSize }, () =>
    new Array(gridSize).fill(0)
  );
  for (const e of entities) {
    if (isAtHome(e, houses)) continue;
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

function stepToward(from: Position, to: Position, biomes: Biome[][], gridSize: number, houseTiles?: Set<string>): Position {
  const candidates: Position[] = [
    { x: from.x + 1, y: from.y },
    { x: from.x - 1, y: from.y },
    { x: from.x, y: from.y + 1 },
    { x: from.x, y: from.y - 1 },
  ];
  let bestPos = from;
  let bestDist = manhattan(from, to);
  for (const c of candidates) {
    if (!isValidMove(c, biomes, gridSize, houseTiles)) continue;
    const d = manhattan(c, to);
    if (d < bestDist) {
      bestDist = d;
      bestPos = c;
    }
  }
  if (bestPos === from) {
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const c of candidates) {
      if (isValidMove(c, biomes, gridSize, houseTiles)) return c;
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

function houseCenterPos(h: House): Position {
  return { x: h.position.x + 1, y: h.position.y + 1 };
}

function isNearTribeHouses(pos: Position, tribe: TribeId, houses: House[]): boolean {
  return houses.some(h => h.tribe === tribe && manhattan(pos, houseCenterPos(h)) <= NEAR_HOME_RANGE + 1);
}


/** Check if a 3×3 house can be placed at (x,y) as top-left corner */
export function isValid3x3BuildSite(
  x: number, y: number,
  biomes: Biome[][], gridSize: number,
  houses: House[], villages: Village[],
): boolean {
  // Check 3×3 area + 1-tile buffer (5×5 total)
  for (let dy = -1; dy <= 3; dy++) {
    for (let dx = -1; dx <= 3; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) return false;
      const b = biomes[ny][nx];
      // Inner 3×3 must be plains
      if (dx >= 0 && dx < 3 && dy >= 0 && dy < 3) {
        if (b !== 'plains') return false;
      }
      // Buffer must not be water
      if (b === 'water') return false;
    }
  }
  // At least 2 tiles from stockpile (distance between 3×3 top-left and stockpile)
  for (const v of villages) {
    if (!v.stockpile) continue;
    if (Math.abs(v.stockpile.x - x) < 4 && Math.abs(v.stockpile.y - y) < 4) return false;
  }
  // No overlap with existing houses (each house is 3×3, require 1-tile gap → distance >= 4)
  for (const h of houses) {
    if (Math.abs(h.position.x - x) < 4 && Math.abs(h.position.y - y) < 4) return false;
  }
  return true;
}


function randomPassablePos(biomes: Biome[][], gridSize: number): Position {
  for (let i = 0; i < 100; i++) {
    const p = randomPos(gridSize);
    if (isPassable(biomes[p.y][p.x])) return p;
  }
  return randomPos(gridSize); // fallback
}

function isValidMove(pos: Position, biomes: Biome[][], gridSize: number, houseTiles?: Set<string>): boolean {
  if (pos.x < 0 || pos.x >= gridSize || pos.y < 0 || pos.y >= gridSize) return false;
  if (!isPassable(biomes[pos.y][pos.x])) return false;
  if (houseTiles && houseTiles.has(`${pos.x},${pos.y}`)) return false;
  return true;
}

function buildHouseTileSet(houses: House[]): Set<string> {
  const s = new Set<string>();
  for (const h of houses) {
    for (let dy = 0; dy < 3; dy++)
      for (let dx = 0; dx < 3; dx++)
        s.add(`${h.position.x + dx},${h.position.y + dy}`);
  }
  return s;
}

function randomStepBiome(position: Position, gridSize: number, biomes: Biome[][], houseTiles?: Set<string>): Position {
  const dirs: Position[] = [
    { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
  ];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  for (const d of dirs) {
    const np = { x: position.x + d.x, y: position.y + d.y };
    if (isValidMove(np, biomes, gridSize, houseTiles)) return np;
  }
  return position;
}

export function createWorld(options: CreateWorldOptions): WorldState {
  const { gridSize, entityCount, villageCount = 3 } = options;
  const numVillages = Math.min(3, Math.max(1, villageCount));
  const biomes = generateBiomeGrid(gridSize, options.biomeParams);

  // Tribe definitions (up to 3)
  const allTribeColors: RGB[] = [[220, 60, 60], [60, 100, 220], [60, 180, 60]];
  const allTribeNames = ['Red Tribe', 'Blue Tribe', 'Green Tribe'];
  // Find village start positions on plains, spread apart
  const startPositions: Position[] = [];
  const minDist = Math.floor(gridSize * 0.3);
  for (let v = 0; v < numVillages; v++) {
    let best: Position | null = null;
    let bestScore = -1;
    for (let attempt = 0; attempt < 500; attempt++) {
      const x = 3 + Math.floor(Math.random() * (gridSize - 6));
      const y = 3 + Math.floor(Math.random() * (gridSize - 6));
      if (biomes[y][x] !== 'plains') continue;
      // Check 2-tile buffer is all plains (no forest/water/mountain touching roads)
      let allPlains = true;
      for (let dy = -2; dy <= 2 && allPlains; dy++)
        for (let dx = -2; dx <= 2 && allPlains; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) { allPlains = false; break; }
          if (biomes[ny][nx] !== 'plains') allPlains = false;
        }
      if (!allPlains) continue;
      // Distance from other villages
      const closest = startPositions.reduce((d, p) => Math.min(d, Math.abs(p.x - x) + Math.abs(p.y - y)), Infinity);
      if (closest < minDist) continue;
      const score = closest * 0.1;
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
    if (best) startPositions.push(best);
    else startPositions.push(randomPassablePos(biomes, gridSize)); // fallback
  }
  const tribeColors = allTribeColors.slice(0, numVillages);
  const tribeNames = allTribeNames.slice(0, numVillages);

  // Clear area around start positions — 2 tile buffer of plains (no forest/water/mountain)
  for (const sp of startPositions) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = sp.x + dx;
        const ny = sp.y + dy;
        if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
          if (biomes[ny][nx] !== 'plains') biomes[ny][nx] = 'plains';
        }
      }
    }
  }

  const villages: Village[] = startPositions.map((sp, i) => ({
    tribe: i as TribeId,
    color: tribeColors[i],
    name: tribeNames[i],
    stockpile: { ...sp },
    meatStore: scaled(10, gridSize, 5),
    plantStore: scaled(15, gridSize, 8),
    woodStore: scaled(10, gridSize, 5),
  }));

  // Stockpile tile is plains (no road ring for now)
  for (const village of villages) {
    const center = village.stockpile;
    if (!center) continue;
    biomes[center.y][center.x] = 'plains';
  }

  const entities: Entity[] = [];
  const perTribe = Math.floor(entityCount / numVillages);

  for (let t = 0; t < numVillages; t++) {
    const tribe = t as TribeId;
    const sp = startPositions[t];
    for (let i = 0; i < perTribe; i++) {
      const traits = randomTraits();
      // Spawn near start position
      let pos: Position;
      for (let attempt = 0; attempt < 50; attempt++) {
        const ox = Math.floor(Math.random() * 5) - 2;
        const oy = Math.floor(Math.random() * 5) - 2;
        const candidate = { x: sp.x + ox, y: sp.y + oy };
        if (Math.abs(ox) + Math.abs(oy) <= 2
            && candidate.x >= 0 && candidate.x < gridSize
            && candidate.y >= 0 && candidate.y < gridSize
            && isPassable(biomes[candidate.y][candidate.x])) {
          pos = candidate;
          break;
        }
      }
      pos ??= sp;

      const gender = i < perTribe / 2 ? 'male' : 'female';
      entities.push({
        id: generateId('e'),
        name: randomName(gender),
        position: pos,
        gender,
        state: 'idle',
        stateTimer: 0,
        age: (MIN_REPRODUCTIVE_AGE + Math.floor(Math.random() * 10)) * TICKS_PER_YEAR, // 18-27 years
        maxAge: randomMaxAge(traits.fertility),
        color: [
          50 + Math.floor(Math.random() * 206),
          50 + Math.floor(Math.random() * 206),
          50 + Math.floor(Math.random() * 206),
        ] as RGB,
        energy: ENERGY_START,
        traits,
        meat: 0,
        hungerThreshold: randomHungerThreshold(),
        tribe,
        birthCooldown: 0,
        mateCooldown: 0,
        coldExposure: false,
        goalSetTick: 0,
      });
    }
  }

  // Initialize grass grid: some plains tiles start with grass (not near water)
  const isNearWater = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize && biomes[ny][nx] === 'water') return true;
      }
    return false;
  };
  const grass: number[][] = Array.from({ length: gridSize }, (_, y) =>
    Array.from({ length: gridSize }, (_, x) =>
      biomes[y][x] === 'plains' && !isNearWater(x, y) && Math.random() < 0.2 ? 1 : 0
    )
  );

  const animalCount = scaled(ANIMAL_COUNT, gridSize, 4);
  const animals: Animal[] = [];
  for (let i = 0; i < animalCount; i++) {
    animals.push({
      id: generateId('a'),
      position: randomPassablePos(biomes, gridSize),
      gender: i < animalCount / 2 ? 'male' : 'female',
      energy: ANIMAL_ENERGY_START,
      reproTimer: Math.floor(Math.random() * ANIMAL_REPRO_INTERVAL),
    });
  }

  // Place a tree on every forest tile; ~20% are fruiting and start with fruit
  const trees: Tree[] = [];
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (biomes[y][x] === 'forest') {
        const isFruitTree = Math.random() < 0.2; // ~20% fruit trees
        trees.push({
          id: generateId('t'),
          position: { x, y },
          chopped: false,
          fruiting: isFruitTree,
          hasFruit: isFruitTree,
          fruitPortions: isFruitTree ? TREE_FRUIT_PORTIONS : 0,
        });
      }
    }
  }

  return { entities, animals, trees, houses: [], biomes, villages, grass, tick: 0, gridSize, log: [] };
}

// --- Interaction detection (fighting/training only — mating removed) ---

function detectInteractions(
  entities: Entity[],
  gridSize: number,
  skipIds: Set<string>,
  _villages: Village[],
  houses: House[] = [],
  log?: LogEntry[],
  tickNum?: number,
): Entity[] {
  const tileGroups = new Map<number, Entity[]>();
  for (const e of entities) {
    if (isAtHome(e, houses)) continue;
    const key = e.position.y * gridSize + e.position.x;
    const group = tileGroups.get(key) ?? [];
    group.push(e);
    tileGroups.set(key, group);
  }

  const newActionIds = new Set<string>();

  for (const [, group] of tileGroups) {
    const idleMales = group.filter(e => e.gender === 'male' && e.state === 'idle' && !skipIds.has(e.id));

    const fightableMales = idleMales.filter(e => ageInYears(e) >= FIGHT_MIN_AGE);
    let fightStarted = false;
    if (fightableMales.length >= 2) {
      for (let i = 0; i < fightableMales.length - 1 && !fightStarted; i++) {
        for (let j = i + 1; j < fightableMales.length && !fightStarted; j++) {
          const m1 = fightableMales[i];
          const m2 = fightableMales[j];
          if (m1.tribe !== m2.tribe) {
            if (Math.random() < m1.traits.aggression / 10 && Math.random() < m2.traits.aggression / 10) {
              newActionIds.add(m1.id);
              newActionIds.add(m2.id);
              fightStarted = true;
            }
          }
        }
      }
    }

    // Same-tribe training — only when truly idle near settlement
    if (!fightStarted) {
      const trulyIdle = fightableMales.filter(e => {
        if (newActionIds.has(e.id)) return false;
        return isNearTribeHouses(e.position, e.tribe, houses);
      });
      if (trulyIdle.length >= 2 && trulyIdle[0].tribe === trulyIdle[1].tribe) {
        newActionIds.add(trulyIdle[0].id);
        newActionIds.add(trulyIdle[1].id);
      }
    }
  }

  const loggedPairs = new Set<string>();
  return entities.map(e => {
    if (!newActionIds.has(e.id)) return e;
    const key = e.position.y * gridSize + e.position.x;
    const group = tileGroups.get(key)!;
    const otherMale = group.find(o => o.id !== e.id && o.gender === 'male' && newActionIds.has(o.id));
    if (e.gender === 'male' && otherMale) {
      if (otherMale.tribe === e.tribe) {
        if (log && tickNum != null) {
          const pairKey = [e.id, otherMale.id].sort().join(':');
          if (!loggedPairs.has(pairKey)) {
            loggedPairs.add(pairKey);
            log.push({ tick: tickNum, type: 'train', entityId: e.id, name: e.name, gender: e.gender, age: e.age, detail: `with ${otherMale.name}` });
          }
        }
        return { ...e, state: 'training' as const, stateTimer: 3, goal: undefined };
      }
      if (log && tickNum != null) {
        const pairKey = [e.id, otherMale.id].sort().join(':');
        if (!loggedPairs.has(pairKey)) {
          loggedPairs.add(pairKey);
          log.push({ tick: tickNum, type: 'fight', entityId: e.id, name: e.name, gender: e.gender, age: e.age, detail: `vs ${otherMale.name}` });
        }
      }
      return { ...e, state: 'fighting' as const, stateTimer: FIGHTING_DURATION, goal: undefined };
    }
    return e;
  });
}

// --- Pheromone mating: male in range + fertile female → pregnancy chance ---

function pheromoneMating(entities: Entity[], villages: Village[], log: LogEntry[], tickNum: number): Entity[] {
  const updated = [...entities];
  const matedMaleIds = new Set<string>();

  // Find all fertile males ready to mate
  const males = updated.filter(e =>
    e.gender === 'male' && !isChild(e) && isReproductive(e)
    && e.mateCooldown === 0 && e.state !== 'fighting'
  );

  for (const male of males) {
    if (matedMaleIds.has(male.id)) continue;
    const range = Math.floor(male.traits.perception); // perception = mating range

    // Find fertile females in range
    for (let fi = 0; fi < updated.length; fi++) {
      const female = updated[fi];
      if (female.gender !== 'female' || isChild(female)) continue;
      if (!isReproductive(female)) continue;
      if (female.state === 'pregnant') continue;
      if (female.birthCooldown > 0) continue;
      if (female.tribe !== male.tribe) continue;
      if (!female.homeId) continue; // only females with a home can get pregnant

      // Food-based fertility: village needs at least 2 food per person
      const village = villages.find(v => v.tribe === female.tribe);
      if (village) {
        const tribePop = entities.filter(e => e.tribe === female.tribe).length;
        const totalFood = village.meatStore + village.plantStore;
        if (totalFood < tribePop * 2) continue; // too hungry to reproduce
      }

      const dist = manhattan(male.position, female.position);
      if (dist > range) continue;

      // Mating chance based on male strength (strength 1 = 5%, strength 10 = 50%)
      const matingChance = male.traits.strength / 20;
      if (Math.random() >= matingChance) continue;

      // Impregnate!
      const pregTime = Math.max(3, Math.round(PREGNANCY_DURATION / female.traits.fertility));
      updated[fi] = {
        ...female,
        state: 'pregnant' as const,
        stateTimer: pregTime,
        fatherTraits: male.traits,
        fatherTribe: male.tribe,
        goal: undefined,
      };
      log.push({ tick: tickNum, type: 'pregnant', entityId: female.id, name: female.name, gender: female.gender, age: female.age, detail: `father: ${male.name}` });

      // Male gets cooldown
      const mi = updated.findIndex(e => e.id === male.id);
      if (mi >= 0) updated[mi] = { ...updated[mi], mateCooldown: MATE_COOLDOWN };
      matedMaleIds.add(male.id);
      break; // one female per male per tick
    }
  }
  return updated;
}

// --- Main tick ---

export function tick(state: WorldState): WorldState {
  const { gridSize } = state;
  const animalMax = scaled(ANIMAL_MAX, gridSize, 4);
  const biomes = state.biomes.map(row => [...row]);
  let trees = state.trees.map(t => ({ ...t, position: { ...t.position } }));
  const grass = state.grass.map(row => [...row]);
  const houseTiles = buildHouseTileSet(state.houses);
  const tickNum = state.tick + 1;
  const updatedVillages = state.villages.map(v => ({ ...v, color: [...v.color] as RGB }));
  function getVillage(tribe: TribeId) {
    return updatedVillages[tribe];
  }
  function logEvent(e: Entity, type: LogEntry['type'], extra?: { cause?: DeathCause; detail?: string }) {
    log.push({ tick: tickNum, type, entityId: e.id, name: e.name, gender: e.gender, age: e.age, ...extra });
  }
  let animals = state.animals.map(a => ({ ...a, position: { ...a.position } }));
  let houses = state.houses.map(h => ({ ...h, position: { ...h.position }, occupants: [...h.occupants] }));
  const stockpileTiles = new Set(
    updatedVillages
      .filter(v => v.stockpile)
      .map(v => `${v.stockpile!.x},${v.stockpile!.y}`),
  );
  houses = houses.filter(h => !stockpileTiles.has(`${h.position.x},${h.position.y}`));
  const log: LogEntry[] = [];

  // --- Step 0: Age, energy drain, eat meat if hungry, remove dead ---
  const aged: Entity[] = state.entities.map(e => {
    const a = { ...e, age: e.age + 1, birthCooldown: Math.max(0, e.birthCooldown - 1), mateCooldown: Math.max(0, e.mateCooldown - 1) };
    if (!isChild(a) && a.age % ENERGY_DRAIN_INTERVAL === 0) {
      const baseDrain = 1 + traitEnergyDrain(a.traits);
      // Hungry entities move less → half energy drain
      const drain = isHungry(a) ? baseDrain * 0.5 : baseDrain;
      a.energy = Math.max(0, a.energy - drain);
    }
    // Hungry → eat from village pantry or personal meat (ronin)
    if (isHungry(a) && !isChild(a)) {
      const myV = getVillage(a.tribe);
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
      logEvent(e, 'death', { cause: 'old_age' });
      // Remove from house occupants
      for (const h of houses) {
        const idx = h.occupants.indexOf(e.id);
        if (idx >= 0) h.occupants.splice(idx, 1);
      }
    } else if (e.energy <= 0) {
      logEvent(e, 'death', { cause: e.coldExposure ? 'cold' : 'starvation' });
      for (const h of houses) {
        const idx = h.occupants.indexOf(e.id);
        if (idx >= 0) h.occupants.splice(idx, 1);
      }
    } else {
      entities.push({ ...e, coldExposure: false });
    }
  }

  // --- Step 0b: Validate homeId — remove if entity not in house's occupants ---
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (!e.homeId) continue;
    const house = houses.find(h => h.id === e.homeId);
    if (!house || !house.occupants.includes(e.id)) {
      entities[i] = { ...e, homeId: undefined };
    }
  }

  // --- Step 1: Resolve completed actions ---
  const grid = createOccupancyGrid(gridSize, entities, houses);
  const babies: Entity[] = [];
  const resolvedIds = new Set<string>();
  const deadIds = new Set<string>();
  const consumedAnimalIds = new Set<string>();

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

    if (action === 'pregnant') {
      // Pregnancy complete → give birth
      for (const mother of finishing) {
        resolvedIds.add(mother.id);

        const dadTraits = mother.fatherTraits ?? mother.traits;
        const tc = mother.traits.twinChance;
        let babyCount = 1;
        if (Math.random() < tc) {
          const roll = Math.random();
          if (roll < 0.7) babyCount = 2;
          else if (roll < 0.92) babyCount = 3;
          else babyCount = 4;
        }

        const birthHome = homePosition(mother, houses);
        const birthPos = birthHome ? { ...birthHome } : { ...mother.position };

        for (let b = 0; b < babyCount; b++) {
          const babyTraits = inheritTraits(dadTraits, mother.traits);
          const babyGender = Math.random() < 0.5 ? 'male' : 'female' as const;
          const baby: Entity = {
            id: generateId('e'),
            name: randomName(babyGender),
            position: { ...birthPos },
            gender: babyGender,
            state: 'idle',
            stateTimer: 0,
            age: 0,
            maxAge: randomMaxAge(babyTraits.fertility),
            color: [...mother.color] as RGB,
            energy: ENERGY_START,
            traits: babyTraits,
            meat: 0,
            hungerThreshold: randomHungerThreshold(),
            birthCooldown: 0,
            mateCooldown: 0,
            tribe: (mother.fatherTribe === mother.tribe ? mother.tribe : (Math.random() < 0.5 ? mother.tribe : mother.fatherTribe!)) as TribeId,
            homeId: birthHome ? mother.homeId : undefined,
            coldExposure: false,
            goalSetTick: 0,
          };

          // Infant mortality — historical ~30% death rate at birth
          if (Math.random() < INFANT_MORTALITY) {
            logEvent(baby, 'death', { cause: 'starvation', detail: 'infant mortality' });
          } else {
            babies.push(baby);
            logEvent(baby, 'birth');
            grid[birthPos.y][birthPos.x]++;
          }
        }

        // Maternal mortality
        if (Math.random() < MATERNAL_MORTALITY) {
          deadIds.add(mother.id);
          logEvent(mother, 'death', { cause: 'childbirth' });
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
          logEvent(loserEntity, 'death', { cause: 'fight', detail: `killed by ${winner.name}` });
        }
        // Loser energy reduction handled in apply step below
        resolvedIds.add(winner.id);
        resolvedIds.add(loserId);
      }
    } else if (action === 'chopping') {
      for (const chopper of finishing) {
        resolvedIds.add(chopper.id);
        const chopV = getVillage(chopper.tribe);
        if (chopV) chopV.woodStore += WOOD_PER_CHOP;
        // Mark tree as chopped (stump)
        const treeIdx = trees.findIndex(t =>
          !t.chopped && t.position.x === chopper.position.x && t.position.y === chopper.position.y
        );
        if (treeIdx >= 0) {
          trees[treeIdx] = { ...trees[treeIdx], chopped: true, choppedAt: tickNum, hasFruit: false, fruitPortions: 0 };
        }
        logEvent(chopper, 'chop', { detail: `+${WOOD_PER_CHOP} wood` });
      }
    } else if (action === 'building') {
      for (const builder of finishing) {
        resolvedIds.add(builder.id);
        // builder.position is top-left corner of 3×3 house
        if (!isValid3x3BuildSite(builder.position.x, builder.position.y, biomes, gridSize, houses, updatedVillages)) continue;
        const newHouse: House = {
          id: generateId('h'),
          position: { ...builder.position },
          tribe: builder.tribe,
          occupants: [],
        };
        houses.push(newHouse);
        logEvent(builder, 'build_done', { detail: 'built a house' });
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
        // Gather from fruit tree on same tile
        const treeIdx = trees.findIndex(tr =>
          tr.hasFruit && tr.fruitPortions > 0 &&
          tr.position.x === gatherer.position.x &&
          tr.position.y === gatherer.position.y
        );
        if (treeIdx >= 0) {
          trees[treeIdx] = {
            ...trees[treeIdx],
            fruitPortions: trees[treeIdx].fruitPortions - 1,
            hasFruit: trees[treeIdx].fruitPortions > 1,
          };
        }
        resolvedIds.add(gatherer.id);
      }
    }
  }

  // Clean up house occupants for dead entities
  for (const deadId of deadIds) {
    for (const h of houses) {
      const idx = h.occupants.indexOf(deadId);
      if (idx >= 0) h.occupants.splice(idx, 1);
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
          return { ...e, state: 'idle' as const, stateTimer: 0, energy: Math.max(0, energy - 10), meat };
        } else if (e.state === 'building') {
          return { ...e, state: 'idle' as const, stateTimer: 0, energy: Math.max(0, energy - 10), meat };
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
            const direct = eatDirectlyToThreshold(e, ENERGY_MEAT, MEAT_PORTIONS_PER_HUNT);
            energy = direct.entity.energy;
            const surplus = direct.remainingPortions;
            if (myVillage) myVillage.meatStore += surplus;
          }
        } else if (e.state === 'gathering') {
          // Fruit from tree at this position — check if any tree here had fruit taken
          const fruitTree = trees.find(tr =>
            tr.fruiting &&
            tr.position.x === e.position.x &&
            tr.position.y === e.position.y
          );
          if (fruitTree) {
            const direct = eatDirectlyToThreshold(e, ENERGY_PLANT, TREE_FRUIT_PORTIONS);
            energy = direct.entity.energy;
            const surplus = direct.remainingPortions;
            if (myVillage && villageNeedsPlants(myVillage, entities)) myVillage.plantStore += surplus;
          }
        } else if (e.state === 'pregnant') {
          return { ...e, state: 'idle' as const, stateTimer: 0, energy, meat, fatherTraits: undefined, birthCooldown: BIRTH_COOLDOWN };
        }

        return { ...e, state: 'idle' as const, stateTimer: 0, energy, meat };
      }
      if (e.state !== 'idle' && e.stateTimer > 1) {
        return { ...e, stateTimer: e.stateTimer - 1 };
      }
      return e;
    });
  entities.push(...babies);
  entities = entities.map(e => {
    const home = isChild(e) ? homePosition(e, houses) : undefined;
    return home ? { ...e, position: { ...home }, state: 'idle' as const, stateTimer: 0 } : e;
  });

  // Remove consumed resources
  animals = animals.filter(a => !consumedAnimalIds.has(a.id));

  // (Animals move after human movement + hunting detection — see step 5)

  // --- Step 2: Detect interactions (pre-movement) ---
  entities = detectInteractions(entities, gridSize, resolvedIds, updatedVillages, houses, log, tickNum);

  // --- Step 3: Move idle entities ---
  const moveGrid = createOccupancyGrid(gridSize, entities, houses);
  const indices = Array.from({ length: entities.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const babyIds = new Set(babies.map(b => b.id));

  for (const idx of indices) {
    let entity = entities[idx];
    if (entity.state !== 'idle' || babyIds.has(entity.id)) continue;
    if (isChild(entity) && homePosition(entity, houses)) continue;

    // Interrupt: critical hunger clears current goal
    if (entity.energy < 20 && entity.goal) {
      entity = { ...entity, goal: undefined };
      entities[idx] = entity;
    }

    // Periodic re-evaluation with hysteresis
    if (entity.goal && tickNum > 0 && (tickNum - entity.goalSetTick) % 20 === 0) {
      const ctx = buildAIContext(entity, updatedVillages, animals, trees, entities, biomes, gridSize, tickNum, houses);
      const result = shouldReEvaluate(ctx, entity.goal.type, entity.goalSetTick, tickNum);
      if (result.interrupt && result.newAction) {
        const goal = actionToGoal(result.newAction, ctx);
        if (goal) {
          entity = { ...entity, goal, goalSetTick: tickNum };
        } else {
          entity = { ...entity, goal: undefined, goalSetTick: tickNum };
        }
        entities[idx] = entity;
      }
    }

    // Get goal from utility-AI if none
    if (!entity.goal) {
      const ctx = buildAIContext(entity, updatedVillages, animals, trees, entities, biomes, gridSize, tickNum, houses);
      const action = decideAction(ctx);
      const goal = actionToGoal(action, ctx);
      if (goal) {
        entity = { ...entity, goal, goalSetTick: tickNum };
        entities[idx] = entity;
      } else {
        // Non-goal action (rest, play, wander) — execute once
        if (action.type === 'play') {
          const playTarget = randomStepBiome(entity.position, gridSize, biomes, houseTiles);
          if (isNearTribeHouses(playTarget, entity.tribe, houses) && moveGrid[playTarget.y][playTarget.x] < 2) {
            moveGrid[entity.position.y][entity.position.x]--;
            moveGrid[playTarget.y][playTarget.x]++;
            entity = { ...entity, position: playTarget };
            entities[idx] = entity;
          }
        } else if (action.type === 'wander') {
          const wTarget = randomStepBiome(entity.position, gridSize, biomes, houseTiles);
          if (moveGrid[wTarget.y][wTarget.x] < 2) {
            moveGrid[entity.position.y][entity.position.x]--;
            moveGrid[wTarget.y][wTarget.x]++;
            entity = { ...entity, position: wTarget };
            entities[idx] = entity;
          }
        }
        continue; // rest or single-step done
      }
    }

    // Pursue goal — move toward target
    if (entity.goal?.target) {
      const inForest = biomes[entity.position.y][entity.position.x] === 'forest';
      const speed = Math.max(1, entity.traits.speed - (inForest ? FOREST_SPEED_PENALTY : 0));

      for (let step = 0; step < speed; step++) {
        if (entity.state !== 'idle' || !entity.goal?.target) break;

        const moveTarget = stepToward(entity.position, entity.goal.target, biomes, gridSize, houseTiles);
        if (!moveTarget || (moveTarget.x === entity.position.x && moveTarget.y === entity.position.y)) {
          // Can't move or already there — clear goal
          entity = { ...entity, goal: undefined };
          entities[idx] = entity;
          break;
        }

        if (moveGrid[moveTarget.y][moveTarget.x] < 2) {
          moveGrid[entity.position.y][entity.position.x]--;
          moveGrid[moveTarget.y][moveTarget.x]++;
          entity = { ...entity, position: moveTarget };
          entities[idx] = entity;

          // Arrived at goal target — resolve action
          if (entity.goal?.target && entity.position.x === entity.goal.target.x && entity.position.y === entity.goal.target.y) {
            const goalType = entity.goal.type;
            entity = { ...entity, goal: undefined };
            entities[idx] = entity;

            if (goalType === 'hunt') {
              const prey = animals.findIndex(a =>
                Math.abs(a.position.x - entity.position.x) + Math.abs(a.position.y - entity.position.y) <= HUNT_KILL_RANGE
              );
              if (prey >= 0) {
                animals.splice(prey, 1);
                const direct = eatDirectlyToThreshold(entity, ENERGY_MEAT, MEAT_PORTIONS_PER_HUNT);
                const v = getVillage(entity.tribe);
                if (v) v.meatStore += direct.remainingPortions;
                entity = direct.entity;
                entities[idx] = entity;
                logEvent(entity, 'hunt');
              }
            } else if (goalType === 'gather') {
              const treeIdx = trees.findIndex(tr =>
                tr.hasFruit && tr.fruitPortions > 0 &&
                tr.position.x === entity.position.x && tr.position.y === entity.position.y
              );
              if (treeIdx >= 0) {
                trees[treeIdx] = {
                  ...trees[treeIdx],
                  fruitPortions: trees[treeIdx].fruitPortions - 1,
                  hasFruit: trees[treeIdx].fruitPortions > 1,
                };
                const direct = eatDirectlyToThreshold(entity, ENERGY_PLANT, TREE_FRUIT_PORTIONS);
                const v = getVillage(entity.tribe);
                if (v && villageNeedsFood(v, entities)) v.plantStore += direct.remainingPortions;
                entity = direct.entity;
                entities[idx] = entity;
              }
            } else if (goalType === 'chop') {
              const standingTree = trees.some(t => !t.chopped && t.position.x === entity.position.x && t.position.y === entity.position.y);
              if (biomes[entity.position.y][entity.position.x] === 'forest' && standingTree) {
                entity = { ...entity, state: 'chopping' as const, stateTimer: CHOPPING_DURATION, goal: undefined };
                entities[idx] = entity;
              }
            } else if (goalType === 'build') {
              const v = getVillage(entity.tribe);
              if (v && v.woodStore >= HOUSE_WOOD_COST
                  && isValid3x3BuildSite(entity.position.x, entity.position.y, biomes, gridSize, houses, updatedVillages)) {
                v.woodStore -= HOUSE_WOOD_COST;
                entity = { ...entity, state: 'building' as const, stateTimer: BUILDING_DURATION, goal: undefined };
                entities[idx] = entity;
              }
            }
            break;
          }

        }
      }
    }
  }

  // --- Step 4: Detect interactions (post-movement) ---
  entities = detectInteractions(entities, gridSize, resolvedIds, updatedVillages, houses, log, tickNum);

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
      newPos = isValidMove(flee, biomes, gridSize, houseTiles)
        ? flee : randomStepBiome(a.position, gridSize, biomes, houseTiles);
    } else {
      // Find nearest grass tile
      let nearestGrass: Position | undefined;
      let nearestGrassDist = Infinity;
      for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          const nx = a.position.x + dx, ny = a.position.y + dy;
          if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) continue;
          if (grass[ny][nx] <= 0) continue;
          const d = Math.abs(dx) + Math.abs(dy);
          if (d > 0 && d < nearestGrassDist) {
            nearestGrassDist = d;
            nearestGrass = { x: nx, y: ny };
          }
        }
      }
      if (nearestGrass && Math.random() < 0.15) {
        newPos = stepToward(a.position, nearestGrass, biomes, gridSize, houseTiles);
      } else if (a.reproTimer === 0 && a.energy >= ANIMAL_REPRO_MIN_ENERGY && Math.random() < 0.2) {
        // Seek mate: move toward nearest opposite-gender animal (~20% of ticks)
        const oppositeGender = a.gender === 'male' ? 'female' : 'male';
        let nearestMate: Animal | undefined;
        for (const other of animals) {
          if (other.id === a.id || other.gender !== oppositeGender) continue;
          const d = manhattan(a.position, other.position);
          if (d > 0 && d <= 6 && (!nearestMate || d < manhattan(a.position, nearestMate.position))) {
            nearestMate = other;
          }
        }
        newPos = nearestMate
          ? stepToward(a.position, nearestMate.position, biomes, gridSize, houseTiles)
          : a.position;
      } else {
        // Idle — stay put most ticks, occasional wander (~5% chance)
        newPos = Math.random() < 0.05
          ? randomStepBiome(a.position, gridSize, biomes, houseTiles)
          : a.position;
      }
    }
    return { ...a, position: newPos, reproTimer: Math.max(0, a.reproTimer - 1) };
  });

  // --- Step 5a: Animals graze on grass ---
  for (let i = 0; i < animals.length; i++) {
    const a = animals[i];
    const gx = a.position.x, gy = a.position.y;
    if (grass[gy][gx] > 0 && a.energy < ANIMAL_ENERGY_MAX) {
      grass[gy][gx]--;
      animals[i] = { ...a, energy: Math.min(ANIMAL_ENERGY_MAX, a.energy + ANIMAL_ENERGY_GRAZE) };
    }
  }

  // --- Step 5b: Reproduce animals (same tile, M+F, requires energy) ---
  if (animals.length < animalMax) {
    const animalTiles = new Map<number, Animal[]>();
    for (const a of animals) {
      const key = a.position.y * gridSize + a.position.x;
      const group = animalTiles.get(key) ?? [];
      group.push(a);
      animalTiles.set(key, group);
    }
    const babyAnimals: Animal[] = [];
    for (const [, group] of animalTiles) {
      const readyMales = group.filter(a => a.gender === 'male' && a.reproTimer === 0 && a.energy >= ANIMAL_REPRO_MIN_ENERGY);
      const readyFemales = group.filter(a => a.gender === 'female' && a.reproTimer === 0 && a.energy >= ANIMAL_REPRO_MIN_ENERGY);
      if (readyMales.length > 0 && readyFemales.length > 0 && animals.length + babyAnimals.length < animalMax) {
        readyMales[0].reproTimer = ANIMAL_REPRO_INTERVAL;
        readyFemales[0].reproTimer = ANIMAL_REPRO_INTERVAL;
        const ns = neighbors(readyFemales[0].position, gridSize).filter(n => isPassable(biomes[n.y][n.x]));
        if (ns.length === 0) continue;
        babyAnimals.push({
          id: generateId('a'),
          position: ns[Math.floor(Math.random() * ns.length)],
          gender: Math.random() < 0.5 ? 'male' : 'female',
          energy: ANIMAL_ENERGY_START,
          reproTimer: ANIMAL_REPRO_INTERVAL,
        });
      }
    }
    animals.push(...babyAnimals);
  }

  // --- Step 5c: Animal energy drain and death ---
  animals = animals.map(a => {
    if (tickNum % ANIMAL_DRAIN_INTERVAL === 0) {
      return { ...a, energy: a.energy - ANIMAL_ENERGY_DRAIN };
    }
    return a;
  }).filter(a => a.energy > 0); // dead animals removed

  // --- Step 6: Gradual seasonal fruit tree cycle ---
  // Each tick, individual trees have a small chance to transition.
  // Over a full season (~600 ticks), virtually all trees will have changed.
  const ticksPerMonth = TICKS_PER_DAY * 10;
  const month = Math.floor((tickNum % TICKS_PER_YEAR) / ticksPerMonth);
  const season = Math.floor(month / 3);
  const isWinter = season === 3;
  const isSpring = season === 0;
  const isSummer = season === 1;

  trees = trees.map(t => {
    if (t.chopped) return t;

    if (isWinter && t.hasFruit) {
      // Gradually lose fruit: ~2% per tick → ~95% bare by end of winter
      if (Math.random() < 0.02) return { ...t, fruitPortions: 0, hasFruit: false };
    }

    if (isSpring && t.fruiting && !t.hasFruit) {
      // Some trees fruit early: ~0.3% per tick → ~40% by end of spring
      if (Math.random() < 0.003) return { ...t, fruitPortions: TREE_FRUIT_PORTIONS, hasFruit: true };
    }

    if (isSummer && t.fruiting && !t.hasFruit) {
      // Most trees fruit: ~2% per tick → virtually all by mid-summer
      if (Math.random() < 0.02) return { ...t, fruitPortions: TREE_FRUIT_PORTIONS, hasFruit: true };
    }

    return t;
  });

  // --- Grass regrowth on plains (not near water/shore) ---
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (biomes[y][x] !== 'plains' || grass[y][x] >= GRASS_MAX_PER_TILE) continue;
      // Skip tiles adjacent to water
      let shore = false;
      for (let dy = -1; dy <= 1 && !shore; dy++)
        for (let dx = -1; dx <= 1 && !shore; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize && biomes[ny][nx] === 'water') shore = true;
        }
      if (shore) continue;
      if (Math.random() < GRASS_GROW_CHANCE) grass[y][x]++;
    }
  }

  // --- Step 7: Pheromone mating (every tick, not just night) ---
  entities = pheromoneMating(entities, updatedVillages, log, tickNum);

  // --- Step 7b: Homeless adults claim house slots ---
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (isChild(e) || e.homeId) continue;
    const house = houses.find(h => h.tribe === e.tribe && h.occupants.length < HOUSE_CAPACITY);
    if (house) {
      house.occupants.push(e.id);
      entities[i] = { ...e, homeId: house.id };
    }
  }

  // --- Step 8: Winter — females without house lose energy (cold exposure) ---
  if (isWinter) {
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (e.gender === 'female' && !isChild(e) && !e.homeId) {
        entities[i] = {
          ...e,
          energy: Math.max(0, e.energy - WINTER_COLD_DAMAGE),
          coldExposure: true,
        };
      }
    }
  }

  const fullLog = [...state.log, ...log];
  return { entities, animals, trees, houses, biomes, villages: updatedVillages, grass, tick: tickNum, gridSize, log: fullLog };
}
