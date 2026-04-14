import type { Entity, Animal, Tree, House, Position, WorldState, RGB, Traits, LogEntry, Biome, Village, TribeId, DeathCause, Purpose, Action, Pace, GoldDeposit } from './types';
import {
  MIN_REPRODUCTIVE_AGE, TICKS_PER_YEAR, TICKS_PER_DAY,
  CHILD_AGE,
  ANIMAL_COUNT, scaled,
  ANIMAL_REPRO_INTERVAL, FOREST_SPEED_PENALTY,
  VILLAGE_EAT_RANGE, MAX_ENTITIES_PER_TILE,
  HOUSE_CAPACITY, HOUSE_SIZE,
  ANIMAL_ENERGY_MAX, ANIMAL_ENERGY_START, ANIMAL_ENERGY_DRAIN,
  ANIMAL_DRAIN_INTERVAL, ANIMAL_REPRO_MIN_ENERGY, GRASS_MAX_PER_TILE,
  RUN_ENERGY_MULTIPLIER,
  ECONOMY, RUNTIME_CONFIG,
} from './types';
import { generateBiomeGrid, isPassable } from './biomes';
import { manhattan, chebyshev } from './geometry';
import type { BiomeGenParams } from './biomes';
import { decideAction, buildAIContext, actionToActivity, shouldReEvaluate, precomputeContext } from './utility-ai';
import { randomName } from './names';
import { applyEnergyDrain, eatFromCarrying, eatFromStockpile } from './metabolism';
import { processDeaths, processBirths } from './demography';
import { detectInteractions, pheromoneMating, fightWinner } from './interactions';
import {
  IDLE,
  resolveHuntArrival, completeHunting,
  resolveGatherArrival, completeGathering,
  resolveChopArrival, completeChopping,
  resolveBuildArrival, completeBuilding,
  resolveCookArrival, completeCooking,
  resolveMineArrival, completeMining,
  completeFighting,
  depositCarrying,
} from './action-resolver';

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

// How far entities can "see" for AI purposes (hunt retarget, nearest-fruit, etc.).
const SIGHT_RANGE = 7;

function randomMaxAge(): number {
  // 45-60 years, random per entity.
  const years = 45 + Math.floor(Math.random() * 16);
  return years * TICKS_PER_YEAR;
}

export function ageInYears(e: Entity): number {
  return Math.floor(e.age / TICKS_PER_YEAR);
}

function isChild(e: Entity): boolean {
  return ageInYears(e) < CHILD_AGE;
}

export function isPregnant(e: Entity): boolean {
  return e.pregnancyTimer > 0;
}

// Infant = younger than ECONOMY.reproduction.infantAgeYears. Breastfed: no drain, no eating.
function isInfant(e: Entity): boolean {
  return ageInYears(e) < ECONOMY.reproduction.infantAgeYears;
}

// ── Activity helpers ──
export function isIdle(e: Entity): boolean { return e.activity.kind === 'idle'; }
export function isMoving(e: Entity): boolean { return e.activity.kind === 'moving'; }
export function isWorking(e: Entity): boolean { return e.activity.kind === 'working'; }
export function getPurpose(e: Entity): Purpose | undefined {
  return e.activity.kind === 'moving' ? e.activity.purpose : undefined;
}
export function getAction(e: Entity): Action | undefined {
  return e.activity.kind === 'working' ? e.activity.action : undefined;
}
export function getMoveTarget(e: Entity): Position | undefined {
  return e.activity.kind === 'moving' ? e.activity.target : undefined;
}

// IDLE and startWork moved to action-resolver.ts

// Entity is "in village" if inside the tribal eat zone:
// chebyshev ≤ VILLAGE_EAT_RANGE from stockpile OR from any tribe house center.
// This is the zone where entity can eat from village stockpile without physically being at it.
function isInVillage(pos: Position, tribe: TribeId, village: Village | undefined, houses: House[]): boolean {
  if (village?.stockpile && chebyshev(pos, village.stockpile) <= VILLAGE_EAT_RANGE) return true;
  const hoff = Math.floor(HOUSE_SIZE / 2);
  for (const h of houses) {
    if (h.tribe !== tribe) continue;
    const hc = { x: h.position.x + hoff, y: h.position.y + hoff };
    if (chebyshev(pos, hc) <= VILLAGE_EAT_RANGE) return true;
  }
  return false;
}

function isAtHome(e: Entity, houses: House[]): boolean {
  if (!e.homeId) return false;
  const house = houses.find(h => h.id === e.homeId);
  if (!house) return false;
  const dx = e.position.x - house.position.x;
  const dy = e.position.y - house.position.y;
  return dx >= 0 && dx < HOUSE_SIZE && dy >= 0 && dy < HOUSE_SIZE;
}

// Action resolvers (arrival + completion) moved to action-resolver.ts

function randomTraits(): Traits {
  // Spawn range 30-70 (center of 0-100 scale). Evolution does the rest.
  const pick = () => 30 + Math.floor(Math.random() * 41);
  return {
    strength: pick(),
    dexterity: pick(),
    intelligence: pick(),
  };
}

// inheritTrait / inheritTraits moved to demography.ts

// Steps per tick from dexterity (0-33 → 1, 34-66 → 2, 67-100 → 3).
function dexToSteps(dex: number): number {
  if (dex >= 67) return 3;
  if (dex >= 34) return 2;
  return 1;
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


// A* pathfinding — finds shortest path around obstacles (houses, water, mountains, occupied tiles).
// Returns the FIRST step on the shortest path from `from` to `to`.
// Uses manhattan heuristic to search toward target — handles any map size efficiently.
// Target tile itself may be impassable (e.g. mountain for mining) — reachable
// as destination but won't be expanded through.
// `moveGrid` (optional) routes AROUND tiles occupied by other entities.
const PATHFIND_BUDGET = 2000;
function stepToward(
  from: Position, to: Position,
  biomes: Biome[][], gridSize: number,
  blockedTiles?: Set<string>,
  moveGrid?: number[][],
): Position {
  if (from.x === to.x && from.y === to.y) return from;

  // Min-heap on f = g (steps taken) + h (manhattan to target)
  type Node = { f: number; g: number; x: number; y: number; firstStep: Position | null };
  const heap: Node[] = [];
  const siftUp = (i: number) => {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= heap[i].f) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const siftDown = () => {
    let i = 0;
    const len = heap.length;
    while (true) {
      let s = i;
      const l = 2 * i + 1, r = l + 1;
      if (l < len && heap[l].f < heap[s].f) s = l;
      if (r < len && heap[r].f < heap[s].f) s = r;
      if (s === i) break;
      [heap[s], heap[i]] = [heap[i], heap[s]];
      i = s;
    }
  };
  const push = (n: Node) => { heap.push(n); siftUp(heap.length - 1); };
  const pop = (): Node => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) { heap[0] = last; siftDown(); }
    return top;
  };

  const h = (x: number, y: number) => Math.abs(x - to.x) + Math.abs(y - to.y);
  const visited = new Map<string, number>(); // key → best g score

  push({ f: h(from.x, from.y), g: 0, x: from.x, y: from.y, firstStep: null });
  visited.set(`${from.x},${from.y}`, 0);

  let iters = 0;
  const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (heap.length > 0 && iters < PATHFIND_BUDGET) {
    iters++;
    const cur = pop();

    if (cur.x === to.x && cur.y === to.y) return cur.firstStep ?? { x: cur.x, y: cur.y };

    // Skip stale entries (a shorter path to this node was found after queuing)
    const ck = `${cur.x},${cur.y}`;
    if ((visited.get(ck) ?? Infinity) < cur.g) continue;

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      const nk = `${nx},${ny}`;
      const isTarget = nx === to.x && ny === to.y;

      if (!isTarget) {
        if (!isValidMove({ x: nx, y: ny }, biomes, gridSize, blockedTiles)) continue;
        if (moveGrid && moveGrid[ny][nx] >= MAX_ENTITIES_PER_TILE) continue;
      }

      const g = cur.g + 1;
      if ((visited.get(nk) ?? Infinity) <= g) continue;
      visited.set(nk, g);

      const firstStep = cur.firstStep ?? { x: nx, y: ny };
      push({ f: g + h(nx, ny), g, x: nx, y: ny, firstStep });
    }
  }

  // Truly unreachable (surrounded by impassable terrain)
  return from;
}

function randomPos(gridSize: number): Position {
  return {
    x: Math.floor(Math.random() * gridSize),
    y: Math.floor(Math.random() * gridSize),
  };
}



// isValidBuildSite moved to action-resolver.ts
export { isValidBuildSite } from './action-resolver';


function randomPassablePos(biomes: Biome[][], gridSize: number): Position {
  for (let i = 0; i < 100; i++) {
    const p = randomPos(gridSize);
    if (isPassable(biomes[p.y][p.x])) return p;
  }
  return randomPos(gridSize); // fallback
}

function isValidMove(pos: Position, biomes: Biome[][], gridSize: number, blockedTiles?: Set<string>): boolean {
  if (pos.x < 0 || pos.x >= gridSize || pos.y < 0 || pos.y >= gridSize) return false;
  if (!isPassable(biomes[pos.y][pos.x])) return false;
  if (blockedTiles && blockedTiles.has(`${pos.x},${pos.y}`)) return false;
  return true;
}

function buildHouseTileSet(houses: House[]): Set<string> {
  const s = new Set<string>();
  for (const h of houses) {
    for (let dy = 0; dy < HOUSE_SIZE; dy++)
      for (let dx = 0; dx < HOUSE_SIZE; dx++)
        s.add(`${h.position.x + dx},${h.position.y + dy}`);
  }
  return s;
}

function randomStepBiome(position: Position, gridSize: number, biomes: Biome[][], blockedTiles?: Set<string>): Position {
  const dirs: Position[] = [
    { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
  ];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  for (const d of dirs) {
    const np = { x: position.x + d.x, y: position.y + d.y };
    if (isValidMove(np, biomes, gridSize, blockedTiles)) return np;
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
    cookedMeatStore: 0,
    driedFruitStore: 0,
    woodStore: scaled(10, gridSize, 5),
    goldStore: 0,
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
        activity: IDLE,
        age: (MIN_REPRODUCTIVE_AGE + Math.floor(Math.random() * 10)) * TICKS_PER_YEAR,
        maxAge: randomMaxAge(),
        color: [
          50 + Math.floor(Math.random() * 206),
          50 + Math.floor(Math.random() * 206),
          50 + Math.floor(Math.random() * 206),
        ] as RGB,
        energy: ECONOMY.metabolism.energyStart,
        traits,
        tribe,
        birthCooldown: 0,
        pregnancyTimer: 0,
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

  // Single herd — all animals belong to one group, clustered around a spawn point.
  const animalCount = scaled(ANIMAL_COUNT, gridSize, 4);
  const herdSpawn = randomPassablePos(biomes, gridSize);

  const animals: Animal[] = [];
  for (let i = 0; i < animalCount; i++) {
    let pos = herdSpawn;
    for (let a = 0; a < 20; a++) {
      const candidate = {
        x: herdSpawn.x + Math.floor(Math.random() * 7) - 3,
        y: herdSpawn.y + Math.floor(Math.random() * 7) - 3,
      };
      if (candidate.x >= 0 && candidate.x < gridSize && candidate.y >= 0 && candidate.y < gridSize
          && isPassable(biomes[candidate.y][candidate.x])) { pos = candidate; break; }
    }
    animals.push({
      id: generateId('a'),
      position: pos,
      gender: i < animalCount / 2 ? 'male' : 'female',
      energy: ANIMAL_ENERGY_START,
      reproTimer: Math.floor(Math.random() * ANIMAL_REPRO_INTERVAL),
      panicTicks: 0,
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
          fruitPortions: isFruitTree ? ECONOMY.fruit.treeCapacity : 0,
        });
      }
    }
  }

  // --- Gold deposits ---
  // Spawn on mountain tiles that have at least one passable neighbor (miners mine from adjacent).
  const goldDeposits: GoldDeposit[] = [];
  const mountainCandidates: Position[] = [];
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (biomes[y][x] !== 'mountain') continue;
      const hasPassableNeighbor = [
        { x: x + 1, y }, { x: x - 1, y },
        { x, y: y + 1 }, { x, y: y - 1 },
      ].some(n =>
        n.x >= 0 && n.x < gridSize && n.y >= 0 && n.y < gridSize
        && isPassable(biomes[n.y][n.x])
      );
      if (hasPassableNeighbor) mountainCandidates.push({ x, y });
    }
  }
  const want = scaled(ECONOMY.gold.spawnBase, gridSize, 1);
  for (let i = mountainCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [mountainCandidates[i], mountainCandidates[j]] = [mountainCandidates[j], mountainCandidates[i]];
  }
  for (const pos of mountainCandidates.slice(0, want)) {
    goldDeposits.push({
      id: generateId('g'),
      position: pos,
      remaining: ECONOMY.gold.depositCapacity,
    });
  }

  return { entities, animals, trees, goldDeposits, houses: [], biomes, villages, grass, tick: 0, gridSize, log: [] };
}

// starvationContext moved to demography.ts
// detectInteractions, pheromoneMating, fightWinner moved to interactions.ts

// ── Extracted tick helpers ──────────────────────────────────────────────

/** Pair ex-fighters on same tile; loser may die if combat energy cost was lethal. */
function resolveFightingDeaths(
  entities: Entity[],
  prevEntities: readonly Entity[],
  gridSize: number,
  deadIds: Set<string>,
  logEvent: (e: Entity, type: LogEntry['type'], extra?: { cause?: DeathCause; detail?: string }) => void,
): void {
  const exFightersByTile = new Map<number, Entity[]>();
  for (const e of entities) {
    if (e.activity.kind !== 'idle') continue;
    const wasFighting = prevEntities.find(s => s.id === e.id);
    if (!wasFighting || getAction(wasFighting) !== 'fighting') continue;
    if (wasFighting.activity.kind === 'working' && wasFighting.activity.ticksLeft > 1) continue;
    const key = e.position.y * gridSize + e.position.x;
    const group = exFightersByTile.get(key) ?? [];
    group.push(e);
    exFightersByTile.set(key, group);
  }
  for (const [, group] of exFightersByTile) {
    if (group.length < 2) continue;
    const [a, b] = group;
    const winner = fightWinner(a, b);
    const loserId = winner.id === a.id ? b.id : a.id;
    const loserEntity = winner.id === a.id ? b : a;
    if (loserEntity.energy - 20 <= 0) {
      deadIds.add(loserId);
      logEvent(loserEntity, 'death', { cause: 'fight', detail: `killed by ${winner.name}` });
    }
  }
}

/** Move animals: panic, graze-seek, leash, drift. Returns updated animals array. */
function moveAnimals(
  animals: Animal[],
  entities: Entity[],
  grass: number[][],
  biomes: Biome[][],
  gridSize: number,
  blockedTiles: Set<string>,
  herdCentroid: Position | undefined,
): void {
  const animalOccupied = new Set<string>();
  for (const a of animals) animalOccupied.add(`${a.position.x},${a.position.y}`);
  for (const e of entities) animalOccupied.add(`${e.position.x},${e.position.y}`);

  const fleeRange = RUNTIME_CONFIG.animalFleeRange;
  const panicDuration = RUNTIME_CONFIG.animalPanicDuration;
  const LEASH = RUNTIME_CONFIG.herdLeash;

  for (let ai = 0; ai < animals.length; ai++) {
    const a = animals[ai];
    let newPos: Position;
    let skipAntiBacktrack = false;

    const myKey = `${a.position.x},${a.position.y}`;
    const blockedForAnimal = new Set(blockedTiles);
    for (const k of animalOccupied) {
      if (k !== myKey) blockedForAnimal.add(k);
    }

    // Nearest human — triggers flee if within alertness range
    let nearestHumanDist = fleeRange + 1;
    let nearestHumanPos: Position | null = null;
    for (const e of entities) {
      const d = manhattan(a.position, e.position);
      if (d > 0 && d <= fleeRange && d < nearestHumanDist) {
        nearestHumanDist = d;
        nearestHumanPos = e.position;
      }
    }
    let panicTicks = a.panicTicks;
    if (nearestHumanPos && panicTicks <= 0) panicTicks = panicDuration;

    const centroidDist = herdCentroid ? manhattan(a.position, herdCentroid) : 0;
    const onGrass = (grass[a.position.y]?.[a.position.x] ?? 0) > 0;

    // ── Animal priority tree ──
    //   1. PANIC — flee from nearest human (overrides everything)
    //   2. GRAZE — standing on grass + not full → stay and eat
    //   3. FORAGE — hungry + not on grass → find nearest grass (wider sight when starving)
    //   4. LEASH — too far from herd centroid → head back
    //   5. DRIFT — not on grass, not hungry → casual grass-seeking or centroid drift
    //   6. REST — stay
    const hungry = a.energy < ANIMAL_ENERGY_MAX * 0.6;

    if (panicTicks > 0) {
      panicTicks--;
      if (nearestHumanPos) {
        const dx = a.position.x - nearestHumanPos.x;
        const dy = a.position.y - nearestHumanPos.y;
        const primary = Math.abs(dx) >= Math.abs(dy)
          ? { x: a.position.x + Math.sign(dx || 1), y: a.position.y }
          : { x: a.position.x, y: a.position.y + Math.sign(dy || 1) };
        const secondary = Math.abs(dx) >= Math.abs(dy)
          ? { x: a.position.x, y: a.position.y + Math.sign(dy || 1) }
          : { x: a.position.x + Math.sign(dx || 1), y: a.position.y };
        newPos = isValidMove(primary, biomes, gridSize, blockedTiles)
          ? primary
          : isValidMove(secondary, biomes, gridSize, blockedTiles)
            ? secondary
            : a.position;
        skipAntiBacktrack = true;
      } else {
        newPos = a.position;
      }
    } else if (onGrass && a.energy < ANIMAL_ENERGY_MAX) {
      newPos = a.position;
    } else if (hungry && !onGrass) {
      // Hungry animals look for food BEFORE obeying herd leash — survival > cohesion.
      // Wider sight when starving so they can find distant grass patches.
      const sight = a.energy < ANIMAL_ENERGY_MAX * 0.3 ? 8 : 6;
      let nearGrass: Position | undefined;
      let bestDist = Infinity;
      for (let dy = -sight; dy <= sight; dy++) {
        for (let dx = -sight; dx <= sight; dx++) {
          const nx = a.position.x + dx, ny = a.position.y + dy;
          if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) continue;
          if ((grass[ny]?.[nx] ?? 0) <= 0) continue;
          const d = Math.abs(dx) + Math.abs(dy);
          if (d > 0 && d < bestDist) { bestDist = d; nearGrass = { x: nx, y: ny }; }
        }
      }
      if (nearGrass) {
        newPos = stepToward(a.position, nearGrass, biomes, gridSize, blockedForAnimal);
        skipAntiBacktrack = true;
      } else if (herdCentroid) {
        // No grass visible even with wider sight — drift toward centroid (herd knows best)
        newPos = stepToward(a.position, herdCentroid, biomes, gridSize, blockedForAnimal);
        skipAntiBacktrack = true;
      } else {
        newPos = a.position;
      }
    } else if (herdCentroid && centroidDist > LEASH) {
      newPos = stepToward(a.position, herdCentroid, biomes, gridSize, blockedForAnimal);
      skipAntiBacktrack = true;
    } else if (!onGrass) {
      // Not hungry, just casually looking for a grazing spot
      let nearGrass: Position | undefined;
      let bestDist = Infinity;
      const SIGHT = 4;
      for (let dy = -SIGHT; dy <= SIGHT; dy++) {
        for (let dx = -SIGHT; dx <= SIGHT; dx++) {
          const nx = a.position.x + dx, ny = a.position.y + dy;
          if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) continue;
          if ((grass[ny]?.[nx] ?? 0) <= 0) continue;
          const d = Math.abs(dx) + Math.abs(dy);
          if (d > 0 && d < bestDist) { bestDist = d; nearGrass = { x: nx, y: ny }; }
        }
      }
      newPos = nearGrass
        ? stepToward(a.position, nearGrass, biomes, gridSize, blockedForAnimal)
        : herdCentroid
          ? stepToward(a.position, herdCentroid, biomes, gridSize, blockedForAnimal)
          : a.position;
    } else {
      newPos = a.position;
    }

    if (!skipAntiBacktrack && a.prevPos && newPos !== a.position
        && newPos.x === a.prevPos.x && newPos.y === a.prevPos.y) {
      newPos = a.position;
    }

    const newKey = `${newPos.x},${newPos.y}`;
    if (newPos !== a.position && animalOccupied.has(newKey)) {
      newPos = a.position;
    }
    const moved = newPos !== a.position;
    if (moved) {
      animalOccupied.delete(myKey);
      animalOccupied.add(newKey);
    }
    const nextPrevPos = moved ? a.position : a.prevPos;
    animals[ai] = {
      ...a,
      position: newPos,
      prevPos: nextPrevPos,
      reproTimer: Math.max(0, a.reproTimer - 1),
      panicTicks,
    };
  }
}

/** Animals graze on grass tiles. Mutates both arrays in place. */
function animalsGraze(animals: Animal[], grass: number[][]): void {
  for (let i = 0; i < animals.length; i++) {
    const a = animals[i];
    const gx = a.position.x, gy = a.position.y;
    if (grass[gy][gx] > 0 && a.energy < ANIMAL_ENERGY_MAX) {
      grass[gy][gx]--;
      animals[i] = { ...a, energy: Math.min(ANIMAL_ENERGY_MAX, a.energy + RUNTIME_CONFIG.grazeEnergy) };
    }
  }
}

/** Reproduce animals — hunger-adjusted cooldown. Pushes babies into animals array. */
function reproduceAnimals(
  animals: Animal[],
  entities: Entity[],
  villages: Village[],
  biomes: Biome[][],
  gridSize: number,
  genId: (prefix?: string) => string,
): void {
  if (animals.length >= RUNTIME_CONFIG.maxHerdSize) return;

  let minDaysOfFood = Infinity;
  for (const v of villages) {
    let adults = 0, toddlers = 0;
    for (const e of entities) {
      if (e.tribe !== v.tribe) continue;
      const y = ageInYears(e);
      if (y >= CHILD_AGE) adults++;
      else if (y >= ECONOMY.reproduction.infantAgeYears) toddlers++;
    }
    const energyPerDay = adults * 2 + toddlers * 2 * ECONOMY.reproduction.childDrainMultiplier;
    if (energyPerDay <= 0) continue;
    const stockpileEnergy =
        v.meatStore         * ECONOMY.meat.energyPerUnit
      + v.cookedMeatStore   * ECONOMY.cooking.cookedMeatEnergyPerUnit
      + v.plantStore        * ECONOMY.fruit.energyPerUnit
      + v.driedFruitStore   * ECONOMY.cooking.driedFruitEnergyPerUnit;
    const days = stockpileEnergy / energyPerDay;
    if (days < minDaysOfFood) minDaysOfFood = days;
  }
  const hungerMultiplier = minDaysOfFood < 15 ? 0.25
                          : minDaysOfFood < 30 ? 0.5
                          : 1.0;

  const babyAnimals: Animal[] = [];
  const popRatio = animals.length / RUNTIME_CONFIG.maxHerdSize;
  const reproBase = RUNTIME_CONFIG.reproInterval;
  const cooldown = Math.round(reproBase * Math.max(0.15, popRatio) * hungerMultiplier);
  const readyFemales = animals.filter(a => a.gender === 'female' && a.reproTimer === 0 && a.energy >= ANIMAL_REPRO_MIN_ENERGY);
  for (const female of readyFemales) {
    if (animals.length + babyAnimals.length >= RUNTIME_CONFIG.maxHerdSize) break;
    const ns = neighbors(female.position, gridSize).filter(n => isPassable(biomes[n.y][n.x]));
    if (ns.length === 0) continue;
    female.reproTimer = cooldown;
    babyAnimals.push({
      id: genId('a'),
      position: ns[Math.floor(Math.random() * ns.length)],
      gender: Math.random() < 0.5 ? 'male' : 'female',
      energy: ANIMAL_ENERGY_START,
      reproTimer: reproBase,
      panicTicks: 0,
    });
  }
  animals.push(...babyAnimals);
}

/** Drain animal energy periodically; remove dead. Returns filtered array. */
function drainAndCullAnimals(animals: Animal[], tickNum: number): Animal[] {
  return animals.map(a => {
    if (tickNum % ANIMAL_DRAIN_INTERVAL === 0) {
      return { ...a, energy: a.energy - ANIMAL_ENERGY_DRAIN };
    }
    return a;
  }).filter(a => a.energy > 0);
}

/** Spawn migrant animals from map edge when herd population is low. */
function migrateAnimals(
  animals: Animal[],
  biomes: Biome[][],
  gridSize: number,
  tickNum: number,
  genId: (prefix?: string) => string,
): void {
  const targetPop = scaled(ANIMAL_COUNT, gridSize, 4);
  const migrationInterval = animals.length === 0 ? 50 : animals.length < 4 ? 100 : 200;
  if (animals.length >= targetPop / 2 || tickNum % migrationInterval !== 0) return;

  const edge = Math.random() < 0.5 ? 0 : gridSize - 1;
  const along = Math.floor(Math.random() * gridSize);
  const isHorizontal = Math.random() < 0.5;
  const spawnPos = isHorizontal ? { x: along, y: edge } : { x: edge, y: along };
  if (!isPassable(biomes[spawnPos.y][spawnPos.x])) return;

  const count = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const pos = i === 0 ? spawnPos : (() => {
      for (let a = 0; a < 10; a++) {
        const p = { x: spawnPos.x + Math.floor(Math.random() * 5) - 2, y: spawnPos.y + Math.floor(Math.random() * 5) - 2 };
        if (p.x >= 0 && p.x < gridSize && p.y >= 0 && p.y < gridSize && isPassable(biomes[p.y][p.x])) return p;
      }
      return spawnPos;
    })();
    animals.push({
      id: genId('a'),
      position: pos,
      gender: i < count / 2 ? 'male' : 'female',
      energy: ANIMAL_ENERGY_START,
      reproTimer: 0,
      panicTicks: 0,
    });
  }
}

/** Seasonal fruit tree cycle: winter drops, spring/summer fruiting. */
function updateTreeSeasons(trees: Tree[], currentSeason: number, isWinter: boolean): Tree[] {
  const isSpring = currentSeason === 0;
  const isSummer = currentSeason === 1;
  return trees.map(t => {
    if (t.chopped) return t;
    if (isWinter && t.hasFruit) {
      if (Math.random() < 0.02) return { ...t, fruitPortions: 0, hasFruit: false };
    }
    if (isSpring && t.fruiting && !t.hasFruit) {
      if (Math.random() < 0.003) return { ...t, fruitPortions: ECONOMY.fruit.treeCapacity, hasFruit: true };
    }
    if (isSummer && t.fruiting && !t.hasFruit) {
      if (Math.random() < 0.02) return { ...t, fruitPortions: ECONOMY.fruit.treeCapacity, hasFruit: true };
    }
    return t;
  });
}

/** Grass regrowth on plains tiles (not near water). Mutates grass grid. */
function regrowGrass(grass: number[][], biomes: Biome[][], gridSize: number): void {
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (biomes[y][x] !== 'plains' || grass[y][x] >= GRASS_MAX_PER_TILE) continue;
      let shore = false;
      for (let dy = -1; dy <= 1 && !shore; dy++)
        for (let dx = -1; dx <= 1 && !shore; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize && biomes[ny][nx] === 'water') shore = true;
        }
      if (shore) continue;
      if (Math.random() < RUNTIME_CONFIG.grassGrowChance) grass[y][x]++;
    }
  }
}

/** Move children: infants snap to mother; toddlers wander within radius. */
function moveChildren(
  entities: Entity[],
  villages: Village[],
  biomes: Biome[][],
  gridSize: number,
  blockedTiles: Set<string>,
): Entity[] {
  const CHILD_WANDER_RADIUS = 3;
  return entities.map(e => {
    if (!isChild(e)) return e;
    const mother = e.motherId ? entities.find(m => m.id === e.motherId) : undefined;
    const target: Position | undefined = mother?.position
      ?? villages[e.tribe]?.stockpile;
    if (!target) return e;
    if (isInfant(e)) {
      return { ...e, position: { ...target }, activity: IDLE };
    }
    const d = manhattan(e.position, target);
    if (d > CHILD_WANDER_RADIUS) {
      const back = stepToward(e.position, target, biomes, gridSize, blockedTiles);
      if (!back || (back.x === e.position.x && back.y === e.position.y)) return e;
      return { ...e, position: back, activity: IDLE };
    }
    if (Math.random() < 0.3) return e;
    const step = randomStepBiome(e.position, gridSize, biomes, blockedTiles);
    if (step.x === e.position.x && step.y === e.position.y) return e;
    return { ...e, position: step, activity: IDLE };
  });
}

// --- Main tick ---

export function tick(state: WorldState): WorldState {
  const { gridSize } = state;
  // biomes is immutable inside tick() — share the reference, no deep-copy.
  // trees: shallow array copy (elements replaced by reference, not mutated in place).
  // grass: deep copy — mutated each tick (animals graze, regrowth).
  const biomes = state.biomes;
  let trees = [...state.trees];
  let goldDeposits = [...state.goldDeposits];
  const grass = state.grass.map(row => [...row]);
  // blockedTiles = static structures that block movement (houses + stockpiles).
  // Entities path AROUND these and stand adjacent (deposit / cook arrival check).
  const blockedTiles = buildHouseTileSet(state.houses);
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
  for (const t of stockpileTiles) blockedTiles.add(t);
  const log: LogEntry[] = [];

  // Season — computed up front so aging/drain can apply winter penalty for homeless.
  const ticksPerMonthGlobal = TICKS_PER_DAY * 10;
  const currentMonth = Math.floor((tickNum % TICKS_PER_YEAR) / ticksPerMonthGlobal);
  const currentSeason = Math.floor(currentMonth / 3);
  const isWinter = currentSeason === 3;

  // --- Step 0: Age, energy drain, eat if hungry, remove dead ---
  const aged: Entity[] = state.entities.map(e => {
    const a = {
      ...e,
      age: e.age + 1,
      birthCooldown: Math.max(0, e.birthCooldown - 1),
      pregnancyTimer: Math.max(0, e.pregnancyTimer - 1),
    };
    // Metabolism (see metabolism.ts for details):
    //   infants: no drain, no eating. children: 25% drain. adults: full drain.
    //   homeless in winter: 2× drain.
    applyEnergyDrain(a, isWinter);
    // Hungry → eat from carrying first, then village stockpile.
    if (!eatFromCarrying(a)) {
      const myV = getVillage(a.tribe);
      if (myV) {
        const inZone = isInVillage(a.position, a.tribe, myV, houses);
        eatFromStockpile(a, myV, inZone);
      }
    }
    return a;
  });

  // --- Step 0a: Remove dead (old age / starvation) — demography.ts ---
  const deathResult = processDeaths(aged, houses, tickNum, state.entities, updatedVillages);
  let entities = deathResult.alive;
  log.push(...deathResult.log);

  // --- Step 0c: Births — pregnancyTimer just hit 0 for these mothers — demography.ts ---
  const birthResult = processBirths(entities, state.entities, houses, tickNum, generateId);
  entities = birthResult.entities;
  log.push(...birthResult.log);

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
  const babies: Entity[] = [];
  const deadIds = new Set<string>();

  // Resolve working activities. For each entity with activity.kind='working':
  //   1. ticksLeft--. If still >0 → entity keeps working next tick.
  //   2. If ticksLeft hit 0 → fire the matching completion handler (kill animal, chop tree,
  //      place house, cook food, combat outcome, etc.). Entity returns to idle with carrying/etc.
  // Fighting is paired: when two fighters finish on the same tile, the stronger one
  // survives the final cost-reduction; loser may die if -40 dropped energy to 0.
  entities = entities.map(e => {
    if (e.activity.kind !== 'working') return e;
    const nextTicks = e.activity.ticksLeft - 1;
    if (nextTicks > 0) {
      return { ...e, activity: { ...e.activity, ticksLeft: nextTicks } };
    }
    // ticksLeft hit 0 — apply completion
    switch (e.activity.action) {
      case 'chopping':  return completeChopping(e, trees, tickNum, logEvent);
      case 'building':  return completeBuilding(e, biomes, gridSize, houses, updatedVillages, logEvent, generateId);
      case 'cooking':   return completeCooking(e, getVillage, logEvent);
      case 'hunting':   return completeHunting(e, animals, logEvent);
      case 'gathering': return completeGathering(e, trees);
      case 'fighting':  return completeFighting(e);
      case 'mining':    return completeMining(e, goldDeposits, tickNum, logEvent);
    }
  });

  // Fighting death resolution — extracted helper
  resolveFightingDeaths(entities, state.entities, gridSize, deadIds, logEvent);

  for (const deadId of deadIds) {
    for (const h of houses) {
      const idx = h.occupants.indexOf(deadId);
      if (idx >= 0) h.occupants.splice(idx, 1);
    }
  }
  entities = entities.filter(e => !deadIds.has(e.id));
  entities.push(...babies);

  // --- Step 2: Detect interactions (pre-movement) ---
  entities = detectInteractions(entities, gridSize, updatedVillages, houses, log, tickNum);

  // --- Step 3: Move idle entities ---
  const moveGrid = createOccupancyGrid(gridSize, entities, houses);
  const indices = Array.from({ length: entities.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const babyIds = new Set(babies.map(b => b.id));

  // Precompute tribe-wide + global stats once. Saves N×iteration of entities/houses
  // inside buildAIContext (called per entity).
  const pre = precomputeContext(updatedVillages, entities, houses, animals, biomes, gridSize);

  for (const idx of indices) {
    let entity = entities[idx];
    // Only idle/moving entities are processed here. Working entities finished resolution above.
    if (entity.activity.kind === 'working' || babyIds.has(entity.id)) continue;
    if (isChild(entity)) continue;

    // Critical hunger interrupts current travel — re-decide (likely survival deposit).
    if (entity.energy < 20 && entity.activity.kind === 'moving') {
      entity = { ...entity, activity: IDLE };
      entities[idx] = entity;
    }

    // Periodic re-evaluation of current travel goal (hysteresis — every RE_EVAL_INTERVAL).
    if (entity.activity.kind === 'moving' && tickNum > 0
        && (tickNum - entity.activity.setTick) % 20 === 0) {
      const ctx = buildAIContext(entity, updatedVillages, animals, trees, entities, biomes, gridSize, tickNum, houses, goldDeposits, pre);
      const result = shouldReEvaluate(ctx, entity.activity.purpose, entity.activity.setTick, tickNum);
      if (result.interrupt) {
        entity = { ...entity, activity: result.newActivity ?? IDLE };
        entities[idx] = entity;
      }
    }

    // No activity → ask AI for a new one.
    if (entity.activity.kind === 'idle') {
      const ctx = buildAIContext(entity, updatedVillages, animals, trees, entities, biomes, gridSize, tickNum, houses, goldDeposits, pre);
      const action = decideAction(ctx);
      const newActivity = actionToActivity(action, ctx, tickNum);
      if (newActivity) {
        // Live-update precomputed build stats so subsequent entities in the same
        // tick don't also pick 'build'. Without this, pre.housesInProgressByTribe
        // is frozen at tick start and two men target the same bestBuildSite.
        if (newActivity.kind === 'moving' && newActivity.purpose === 'build') {
          const tribe = entity.tribe;
          const inProgress = (pre.housesInProgressByTribe.get(tribe) ?? 0) + 1;
          pre.housesInProgressByTribe.set(tribe, inProgress);
          const freeSlots = pre.freeSlotsByTribe.get(tribe) ?? 0;
          const homeless = pre.homelessByTribe.get(tribe) ?? 0;
          const pregnant = pre.pregnantByTribe.get(tribe) ?? 0;
          pre.villageNeedsHousesByTribe.set(
            tribe,
            (homeless + pregnant) > (freeSlots + inProgress * HOUSE_CAPACITY),
          );
        }
        entity = { ...entity, activity: newActivity };
        entities[idx] = entity;
      } else {
        // Non-movement actions (play / wander / rest) — one random step and done.
        if (action.type === 'play' || action.type === 'wander') {
          const target = randomStepBiome(entity.position, gridSize, biomes, blockedTiles);
          if (moveGrid[target.y][target.x] < 1) {
            moveGrid[entity.position.y][entity.position.x]--;
            moveGrid[target.y][target.x]++;
            entity = { ...entity, position: target };
            entities[idx] = entity;
          }
        }
        continue;
      }
    }

    // Must be moving from here on.
    if (entity.activity.kind !== 'moving') continue;

    // Hunt re-targeting: chase the nearest visible animal within sight range.
    if (entity.activity.purpose === 'hunt') {
      const sense = SIGHT_RANGE;
      let closest: Animal | undefined;
      let closestDist = Infinity;
      for (const a of animals) {
        const d = manhattan(entity.position, a.position);
        if (d > 0 && d <= sense && d < closestDist) { closestDist = d; closest = a; }
      }
      if (closest) {
        entity = { ...entity, activity: { ...entity.activity, target: closest.position } };
        entities[idx] = entity;
      }
    }

    // Walk / run toward target. Running doubles step count; forest forces walk.
    if (entity.activity.kind !== 'moving') continue;
    const inForest = biomes[entity.position.y][entity.position.x] === 'forest';
    const dexSteps = dexToSteps(entity.traits.dexterity);
    const baseSpeed = Math.max(1, dexSteps - (inForest ? FOREST_SPEED_PENALTY : 0));
    const startPace = entity.activity.pace;
    const effectivePace: Pace = inForest ? 'walk' : startPace;
    const steps = effectivePace === 'run' ? baseSpeed * 2 : baseSpeed;

    // Arrival: structure/social targets stop adjacent; other targets require exact tile.
    const structureStop = (p: Purpose) => p === 'deposit' || p === 'cook' || p === 'mine';

    for (let step = 0; step < steps; step++) {
      if (entity.activity.kind !== 'moving') break;
      const mov = entity.activity;
      const target = mov.target;
      const atTarget = structureStop(mov.purpose)
        ? manhattan(entity.position, target) <= 1
        : entity.position.x === target.x && entity.position.y === target.y;

      if (!atTarget) {
        let moveTarget = stepToward(entity.position, target, biomes, gridSize, blockedTiles, moveGrid);
        if (moveTarget.x === entity.position.x && moveTarget.y === entity.position.y) {
          // BFS failed with occupancy filter — retry without it (path through crowds).
          // Step execution below still prevents overlap; entity just waits this tick.
          moveTarget = stepToward(entity.position, target, biomes, gridSize, blockedTiles);
        }
        if (moveTarget.x === entity.position.x && moveTarget.y === entity.position.y) {
          entity = { ...entity, activity: IDLE };
          entities[idx] = entity;
          break;
        }
        if (moveGrid[moveTarget.y][moveTarget.x] >= MAX_ENTITIES_PER_TILE) continue;
        moveGrid[entity.position.y][entity.position.x]--;
        moveGrid[moveTarget.y][moveTarget.x]++;
        entity = { ...entity, position: moveTarget };
        entities[idx] = entity;
        continue;
      }

      // Arrived — dispatch by purpose. Arrival sets new activity (either working or idle).
      switch (mov.purpose) {
        case 'hunt':    entity = resolveHuntArrival(entity, animals); break;
        case 'gather':  entity = resolveGatherArrival(entity, trees); break;
        case 'chop':    entity = resolveChopArrival(entity, trees, biomes); break;
        case 'build':   entity = resolveBuildArrival(entity, biomes, gridSize, houses, updatedVillages, getVillage); break;
        case 'cook':    entity = resolveCookArrival(entity, getVillage); break;
        case 'mine':    entity = resolveMineArrival(entity, goldDeposits, biomes); break;
        case 'deposit': entity = depositCarrying({ ...entity, activity: IDLE }, getVillage); break;
      }
      entities[idx] = entity;
      break;
    }

    // Running burns extra energy once per tick (regardless of how many steps were taken).
    if (!inForest && startPace === 'run' && entity.activity.kind === 'moving') {
      const extraDrain = (RUN_ENERGY_MULTIPLIER - 1);
      entity = { ...entity, energy: Math.max(0, entity.energy - extraDrain) };
      entities[idx] = entity;
    }
  }

  // --- Step 4: Detect interactions (post-movement) ---
  entities = detectInteractions(entities, gridSize, updatedVillages, houses, log, tickNum);

  // --- Step 5: Animal lifecycle (move, graze, reproduce, drain, migrate) ---
  const herdCentroid: Position | undefined = animals.length > 0 ? (() => {
    let sx = 0, sy = 0;
    for (const a of animals) { sx += a.position.x; sy += a.position.y; }
    return { x: Math.round(sx / animals.length), y: Math.round(sy / animals.length) };
  })() : undefined;
  moveAnimals(animals, entities, grass, biomes, gridSize, blockedTiles, herdCentroid);
  animalsGraze(animals, grass);
  reproduceAnimals(animals, entities, updatedVillages, biomes, gridSize, generateId);
  animals = drainAndCullAnimals(animals, tickNum);
  migrateAnimals(animals, biomes, gridSize, tickNum, generateId);

  // --- Step 6: Seasonal tree cycle + grass regrowth ---
  trees = updateTreeSeasons(trees, currentSeason, isWinter);
  regrowGrass(grass, biomes, gridSize);

  // --- Step 7: Pheromone mating (every tick) ---
  entities = pheromoneMating(entities, updatedVillages, houses, log, tickNum);

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

  // --- Step 8: Children follow mothers ---
  entities = moveChildren(entities, updatedVillages, biomes, gridSize, blockedTiles);

  const fullLog = [...state.log, ...log];
  return { entities, animals, trees, goldDeposits, houses, biomes, villages: updatedVillages, grass, tick: tickNum, gridSize, log: fullLog };
}
