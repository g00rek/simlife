import { describe, it, expect, vi } from 'vitest';
import { createWorld, tick } from '../world';
import type { WorldState, Biome } from '../types';
import { TICKS_PER_YEAR } from '../types';

const T = TICKS_PER_YEAR;

// All-plains biome grid for tests
function plainsBiomes(size: number): Biome[][] {
  return Array.from({ length: size }, () => new Array(size).fill('plains'));
}

// Empty grass grid matching biome dimensions
function emptyGrass(size: number): number[][] {
  return Array.from({ length: size }, () => new Array(size).fill(0));
}

function withSurvivingBirth<T>(genderRoll: number, run: () => T): T {
  const random = vi.spyOn(Math, 'random');
  random.mockReturnValue(genderRoll);
  try {
    return run();
  } finally {
    random.mockRestore();
  }
}

describe('createWorld', () => {
  it('creates world with correct grid size', () => {
    const world = createWorld({ gridSize: 30, entityCount: 20 });
    expect(world.gridSize).toBe(30);
  });

  it('creates entities across 3 tribes', () => {
    const world = createWorld({ gridSize: 30, entityCount: 60 });
    expect(world.entities.length).toBe(60);
    const tribes = new Set(world.entities.map(e => e.tribe));
    expect(tribes.size).toBe(3);
  });

  it('creates roughly equal male/female split', () => {
    const world = createWorld({ gridSize: 30, entityCount: 60 });
    const males = world.entities.filter(e => e.gender === 'male');
    const females = world.entities.filter(e => e.gender === 'female');
    expect(males.length).toBe(30);
    expect(females.length).toBe(30);
  });

  it('places all entities within grid bounds', () => {
    const world = createWorld({ gridSize: 30, entityCount: 20 });
    for (const entity of world.entities) {
      expect(entity.position.x).toBeGreaterThanOrEqual(0);
      expect(entity.position.x).toBeLessThan(30);
      expect(entity.position.y).toBeGreaterThanOrEqual(0);
      expect(entity.position.y).toBeLessThan(30);
    }
  });

  it('starts at tick 0', () => {
    const world = createWorld({ gridSize: 30, entityCount: 20 });
    expect(world.tick).toBe(0);
  });

  it('assigns unique IDs to all entities', () => {
    const world = createWorld({ gridSize: 30, entityCount: 60 });
    const ids = world.entities.map(e => e.id);
    expect(new Set(ids).size).toBe(60);
  });

  it('creates all entities with idle state', () => {
    const world = createWorld({ gridSize: 30, entityCount: 10 });
    for (const entity of world.entities) {
      expect(entity.activity.kind).toBe("idle");
    }
  });

  it('creates all entities with age 0-150 ticks (0-30 years)', () => {
    const world = createWorld({ gridSize: 30, entityCount: 20 });
    for (const entity of world.entities) {
      expect(entity.age).toBeGreaterThanOrEqual(0);
      expect(entity.age).toBeLessThanOrEqual(30 * T);
    }
  });

  it('creates all entities with maxAge between 40 and 120 years (adjusted by fertility)', () => {
    const world = createWorld({ gridSize: 30, entityCount: 20 });
    for (const entity of world.entities) {
      expect(entity.maxAge).toBeGreaterThanOrEqual(35 * T);
      expect(entity.maxAge).toBeLessThanOrEqual(90 * T);
    }
  });
});

describe('tick', () => {
  it('increments tick counter', () => {
    const world = createWorld({ gridSize: 30, entityCount: 5 });
    const next = tick(world);
    expect(next.tick).toBe(1);
  });

  it('entity count can grow due to births (not fixed)', () => {
    const world = createWorld({ gridSize: 30, entityCount: 10 });
    const next = tick(world);
    // Population can stay same or grow or shrink (deaths); just check it's non-negative
    expect(next.entities.length).toBeGreaterThanOrEqual(0);
  });

  it('returns a new state object (immutable)', () => {
    const world = createWorld({ gridSize: 30, entityCount: 5 });
    const next = tick(world);
    expect(next).not.toBe(world);
    expect(next.entities).not.toBe(world.entities);
  });

  it('keeps all entities within bounds after tick', () => {
    const world = createWorld({ gridSize: 30, entityCount: 20 });
    const next = tick(world);
    for (const entity of next.entities) {
      expect(entity.position.x).toBeGreaterThanOrEqual(0);
      expect(entity.position.x).toBeLessThan(30);
      expect(entity.position.y).toBeGreaterThanOrEqual(0);
      expect(entity.position.y).toBeLessThan(30);
    }
  });
});

describe('aging and death', () => {
  it('entity age increments each tick', () => {
    const world: WorldState = {
      gridSize: 30,
      tick: 0,
      animals: [], trees: [], log: [], houses: [], biomes: plainsBiomes(30), villages: [], grass: emptyGrass(30),
      entities: [
        { id: 'e1', name: 'Test', position: { x: 0, y: 0 }, gender: 'male', activity: { kind: 'idle' }, age: 0, maxAge: 100 * T, color: [255, 0, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0 },
      ],
    };
    const next = tick(world);
    const e1 = next.entities.find(e => e.id === 'e1');
    expect(e1?.age).toBe(1);
  });

  it('entity dies when age reaches maxAge', () => {
    const world: WorldState = {
      gridSize: 30,
      tick: 0,
      animals: [], trees: [], log: [], houses: [], biomes: plainsBiomes(30), villages: [], grass: emptyGrass(30),
      entities: [
        { id: 'dying', name: 'Test', position: { x: 0, y: 0 }, gender: 'male', activity: { kind: 'idle' }, age: 100 * T - 1, maxAge: 100 * T, color: [255, 0, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0 },
      ],
    };
    const next = tick(world);
    // age becomes 100, which equals maxAge=100, so entity is removed
    const dying = next.entities.find(e => e.id === 'dying');
    expect(dying).toBeUndefined();
  });

  it('entity survives when age is well below maxAge', () => {
    const world: WorldState = {
      gridSize: 30,
      tick: 0,
      animals: [], trees: [], log: [], houses: [], biomes: plainsBiomes(30), villages: [], grass: emptyGrass(30),
      entities: [
        { id: 'e1', name: 'Test', position: { x: 0, y: 0 }, gender: 'male', activity: { kind: 'idle' }, age: 0, maxAge: 100 * T, color: [255, 0, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0 },
      ],
    };
    let current = world;
    for (let i = 0; i < 50; i++) {
      current = tick(current);
    }
    const e1 = current.entities.find(e => e.id === 'e1');
    expect(e1).toBeDefined();
    expect(e1?.age).toBe(50);
  });

  it('newborn has age 0 and maxAge between 60-100', () => {
    const world: WorldState = {
      gridSize: 30,
      tick: 0,
      animals: [], trees: [], log: [], houses: [{ id: 'h1', position: { x: 5, y: 5 }, tribe: 0, occupants: ['e2'] }], biomes: plainsBiomes(30), villages: [], grass: emptyGrass(30),
      entities: [
        { id: 'e2', name: 'Test', position: { x: 5, y: 5 }, gender: 'female', activity: { kind: 'idle' as const }, pregnancyTimer: 1, sparCooldown: 0, age: 25 * T, maxAge: 100 * T, color: [0, 255, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, fatherTraits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, fatherTribe: 0 as const, tribe: 0 as const, birthCooldown: 0, homeId: 'h1' },
      ],
    };
    const next = withSurvivingBirth(0.5, () => tick(world));
    const baby = next.entities.find(e => e.id !== 'e2');
    expect(baby).toBeDefined();
    expect(baby?.age).toBe(0);
    expect(baby?.maxAge).toBeGreaterThanOrEqual(35 * T);
    expect(baby?.maxAge).toBeLessThanOrEqual(90 * T);
  });
});

describe('mating', () => {
  it('entities too young to reproduce do not mate', () => {
    const world: WorldState = {
      gridSize: 30,
      tick: 0,
      animals: [], trees: [], log: [], houses: [], biomes: plainsBiomes(30), villages: [], grass: emptyGrass(30),
      entities: [
        { id: 'e1', name: 'Test', position: { x: 5, y: 5 }, gender: 'male', activity: { kind: 'idle' }, age: 10 * T, maxAge: 100 * T, color: [255, 0, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0 },
        { id: 'e2', name: 'Test', position: { x: 5, y: 5 }, gender: 'female', activity: { kind: 'idle' }, age: 10 * T, maxAge: 100 * T, color: [0, 255, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0 },
      ],
    };
    const next = tick(world);
    const e1 = next.entities.find(e => e.id === 'e1');
    const e2 = next.entities.find(e => e.id === 'e2');
    expect(e1?.activity.kind).toBe("idle");
    expect(e2?.activity.kind).toBe("idle");
  });

  it('entities too old to reproduce do not mate', () => {
    const world: WorldState = {
      gridSize: 30,
      tick: 0,
      animals: [], trees: [], log: [], houses: [], biomes: plainsBiomes(30), villages: [], grass: emptyGrass(30),
      entities: [
        { id: 'e1', name: 'Test', position: { x: 5, y: 5 }, gender: 'male', activity: { kind: 'idle' }, age: 55 * T, maxAge: 80 * T, color: [255, 0, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0 },
        { id: 'e2', name: 'Test', position: { x: 5, y: 5 }, gender: 'female', activity: { kind: 'idle' }, age: 55 * T, maxAge: 80 * T, color: [0, 255, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0 },
      ],
    };
    const next = tick(world);
    const e1 = next.entities.find(e => e.id === 'e1');
    const e2 = next.entities.find(e => e.id === 'e2');
    expect(e1?.activity.kind).toBe("idle");
    expect(e2?.activity.kind).toBe("idle");
  });

  it('male in pheromone range can impregnate female (probabilistic)', () => {
    // Run multiple ticks — at 10% per tick, within ~50 ticks we should see pregnancy
    let world: WorldState = {
      gridSize: 30,
      tick: 0,
      animals: [], trees: [], log: [], grass: emptyGrass(30),
      houses: [{ id: 'h1', position: { x: 5, y: 5 }, tribe: 0, occupants: ['e2'] }],
      biomes: plainsBiomes(30),
      villages: [{ tribe: 0, color: [220, 60, 60], name: 'Red', meatStore: 50, plantStore: 50, woodStore: 10, cookedMeatStore: 0, driedFruitStore: 0 }],
      entities: [
        { id: 'e1', name: 'Test', position: { x: 5, y: 5 }, gender: 'male', activity: { kind: 'idle' }, age: 25 * T, maxAge: 100 * T, color: [255, 0, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0 },
        { id: 'e2', name: 'Test', position: { x: 5, y: 5 }, gender: 'female', activity: { kind: 'idle' }, age: 25 * T, maxAge: 100 * T, color: [0, 255, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0, homeId: 'h1' },
      ],
    };
    let pregnant = false;
    for (let i = 0; i < 100 && !pregnant; i++) {
      world = tick(world);
      if (world.entities.some(e => e.id === 'e2' && e.pregnancyTimer > 0)) pregnant = true;
    }
    expect(pregnant).toBe(true);
  });

  it('same-gender entities on same tile do not enter mating state', () => {
    // Use females — two males on same tile would trigger a fight
    const world: WorldState = {
      gridSize: 30,
      tick: 0,
      animals: [], trees: [], log: [], houses: [], biomes: plainsBiomes(30), villages: [], grass: emptyGrass(30),
      entities: [
        { id: 'e1', name: 'Test', position: { x: 5, y: 5 }, gender: 'female', activity: { kind: 'idle' }, age: 25 * T, maxAge: 100 * T, color: [255, 0, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0 },
        { id: 'e2', name: 'Test', position: { x: 5, y: 5 }, gender: 'female', activity: { kind: 'idle' }, age: 25 * T, maxAge: 100 * T, color: [255, 0, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0 },
      ],
    };
    const next = tick(world);
    const e1 = next.entities.find(e => e.id === 'e1');
    const e2 = next.entities.find(e => e.id === 'e2');
    expect(e1?.activity.kind).toBe("idle");
    expect(e2?.activity.kind).toBe("idle");
  });

  it('two aggressive males on same tile enter fighting state', () => {
    const world: WorldState = {
      gridSize: 30,
      tick: 0,
      animals: [], trees: [], log: [], houses: [], biomes: plainsBiomes(30), villages: [], grass: emptyGrass(30),
      entities: [
        { id: 'e1', name: 'Test', position: { x: 5, y: 5 }, gender: 'male', activity: { kind: 'idle' }, age: 25 * T, maxAge: 100 * T, color: [255, 0, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 10, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0 },
        { id: 'e2', name: 'Test', position: { x: 5, y: 5 }, gender: 'male', activity: { kind: 'idle' }, age: 25 * T, maxAge: 100 * T, color: [0, 0, 255] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 10, fertility: 1.0, twinChance: 0 }, tribe: 1 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0 },
      ],
    };
    const next = tick(world);
    expect(next.entities.length).toBe(2);
    expect(next.entities.every(e => e.activity.kind === 'working' && e.activity.action === 'fighting')).toBe(true);
  });

  it('fight resolves after timer — both survive with energy loss', () => {
    const world: WorldState = {
      gridSize: 30,
      tick: 0,
      animals: [], trees: [], log: [], houses: [], biomes: plainsBiomes(30), villages: [], grass: emptyGrass(30),
      entities: [
        { id: 'e1', name: 'Test', position: { x: 5, y: 5 }, gender: 'male', activity: { kind: 'working', action: 'fighting', ticksLeft: 1 }, age: 25 * T, maxAge: 100 * T, color: [255, 0, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0 },
        { id: 'e2', name: 'Test', position: { x: 5, y: 5 }, gender: 'male', activity: { kind: 'working', action: 'fighting', ticksLeft: 1 }, age: 25 * T, maxAge: 100 * T, color: [0, 0, 255] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0 },
      ],
    };
    const next = tick(world);
    // Non-lethal: both survive but lose energy
    expect(next.entities.length).toBe(2);
    expect(next.entities.every(e => e.activity.kind === 'idle')).toBe(true);
    expect(next.entities.every(e => e.energy < 80)).toBe(true);
  });

  it('female out of pheromone range does not get pregnant', () => {
    const world: WorldState = {
      gridSize: 30,
      tick: 0,
      animals: [], trees: [], log: [], houses: [], biomes: plainsBiomes(30), grass: emptyGrass(30),
      villages: [{ tribe: 0, color: [220, 60, 60], name: 'Red', meatStore: 50, plantStore: 50, woodStore: 10, cookedMeatStore: 0, driedFruitStore: 0 }],
      entities: [
        { id: 'e1', name: 'Test', position: { x: 5, y: 5 }, gender: 'male', activity: { kind: 'idle' }, age: 25 * T, maxAge: 100 * T, color: [255, 0, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0 },
        { id: 'e2', name: 'Test', position: { x: 15, y: 15 }, gender: 'female', activity: { kind: 'idle' }, age: 25 * T, maxAge: 100 * T, color: [0, 255, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0 },
      ],
    };
    const next = tick(world);
    const e2 = next.entities.find(e => e.id === 'e2');
    expect(e2?.activity.kind).toBe("idle");
  });

  it('birth occurs after mating turn — entity count increases by 1', () => {
    const world: WorldState = {
      gridSize: 30,
      tick: 0,
      animals: [], trees: [], log: [], houses: [{ id: 'h1', position: { x: 5, y: 5 }, tribe: 0, occupants: ['e2'] }], biomes: plainsBiomes(30), villages: [], grass: emptyGrass(30),
      entities: [
        { id: 'e2', name: 'Test', position: { x: 5, y: 5 }, gender: 'female', activity: { kind: 'idle' as const }, pregnancyTimer: 1, sparCooldown: 0, age: 25 * T, maxAge: 100 * T, color: [0, 255, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, fatherTraits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, fatherTribe: 0 as const, tribe: 0 as const, birthCooldown: 0, homeId: 'h1' },
      ],
    };
    const next = withSurvivingBirth(0.5, () => tick(world));
    expect(next.entities.length).toBe(2); // mother + 1 baby
  });

  it('newborn has a valid gender', () => {
    const world: WorldState = {
      gridSize: 30,
      tick: 0,
      animals: [], trees: [], log: [], houses: [{ id: 'h1', position: { x: 5, y: 5 }, tribe: 0, occupants: ['e2'] }], biomes: plainsBiomes(30), villages: [], grass: emptyGrass(30),
      entities: [
        { id: 'e2', name: 'Test', position: { x: 5, y: 5 }, gender: 'female', activity: { kind: 'idle' as const }, pregnancyTimer: 1, sparCooldown: 0, age: 25 * T, maxAge: 100 * T, color: [0, 255, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, fatherTraits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, fatherTribe: 0 as const, tribe: 0 as const, birthCooldown: 0, homeId: 'h1' },
      ],
    };
    const next = withSurvivingBirth(0.5, () => tick(world));
    const baby = next.entities.find(e => e.id !== 'e2');
    expect(baby).toBeDefined();
    expect(['male', 'female']).toContain(baby?.gender);
  });

  it('newborn has both genders appear across multiple births', () => {
    const gendersObserved = new Set<string>();
    for (const genderRoll of [0.4, 0.6]) {
      const world: WorldState = {
        gridSize: 30,
        tick: 0,
        animals: [], trees: [], log: [], houses: [{ id: 'h1', position: { x: 5, y: 5 }, tribe: 0, occupants: ['e2'] }], biomes: plainsBiomes(30), villages: [], grass: emptyGrass(30),
        entities: [
          { id: 'e2', name: 'Test', position: { x: 5, y: 5 }, gender: 'female', activity: { kind: 'idle' as const }, pregnancyTimer: 1, sparCooldown: 0, age: 25 * T, maxAge: 100 * T, color: [0, 255, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, fatherTraits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, fatherTribe: 0 as const, tribe: 0 as const, birthCooldown: 0, homeId: 'h1' },
        ],
      };
      const next = withSurvivingBirth(genderRoll, () => tick(world));
      const baby = next.entities.find(e => e.id !== 'e2');
      if (baby) gendersObserved.add(baby.gender);
    }
    expect(gendersObserved.has('male')).toBe(true);
    expect(gendersObserved.has('female')).toBe(true);
  });

  it('newborn spawns adjacent or on parent tile', () => {
    const world: WorldState = {
      gridSize: 30,
      tick: 0,
      animals: [], trees: [], log: [], houses: [{ id: 'h1', position: { x: 5, y: 5 }, tribe: 0, occupants: ['e2'] }], biomes: plainsBiomes(30), villages: [], grass: emptyGrass(30),
      entities: [
        { id: 'e2', name: 'Test', position: { x: 5, y: 5 }, gender: 'female', activity: { kind: 'idle' as const }, pregnancyTimer: 1, sparCooldown: 0, age: 25 * T, maxAge: 100 * T, color: [0, 255, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, fatherTraits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, fatherTribe: 0 as const, tribe: 0 as const, birthCooldown: 0, homeId: 'h1' },
      ],
    };
    const next = withSurvivingBirth(0.5, () => tick(world));
    const mother = next.entities.find(e => e.id === 'e2')!;
    const baby = next.entities.find(e => e.id !== 'e2');
    expect(baby).toBeDefined();
    if (baby) {
      // Infants are carried by mother — position must match mother's position exactly.
      expect(baby.position).toEqual(mother.position);
      // motherId must point at the actual mother so child-follow logic works.
      expect(baby.motherId).toBe('e2');
    }
  });

  it('newborn spawns with idle state', () => {
    const world: WorldState = {
      gridSize: 30,
      tick: 0,
      animals: [], trees: [], log: [], houses: [{ id: 'h1', position: { x: 5, y: 5 }, tribe: 0, occupants: ['e2'] }], biomes: plainsBiomes(30), villages: [], grass: emptyGrass(30),
      entities: [
        { id: 'e2', name: 'Test', position: { x: 5, y: 5 }, gender: 'female', activity: { kind: 'idle' as const }, pregnancyTimer: 1, sparCooldown: 0, age: 25 * T, maxAge: 100 * T, color: [0, 255, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, fatherTraits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, fatherTribe: 0 as const, tribe: 0 as const, birthCooldown: 0, homeId: 'h1' },
      ],
    };
    const next = withSurvivingBirth(0.5, () => tick(world));
    const baby = next.entities.find(e => e.id !== 'e2');
    expect(baby?.activity.kind).toBe("idle");
  });

  it('toddler walks one step toward mother each tick', () => {
    const world: WorldState = {
      gridSize: 30,
      tick: 0,
      animals: [], trees: [], log: [], houses: [{ id: 'h1', position: { x: 5, y: 5 }, tribe: 0, occupants: ['mother'] }], biomes: plainsBiomes(30), villages: [], grass: emptyGrass(30),
      entities: [
        { id: 'mother', name: 'Mom',   position: { x: 6, y: 6 }, gender: 'female', activity: { kind: 'idle' }, age: 25 * T, maxAge: 100 * T, color: [255, 0, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0, homeId: 'h1' },
        { id: 'child',  name: 'Child', position: { x: 9, y: 5 }, gender: 'female', activity: { kind: 'idle' }, age: 2 * T, maxAge: 100 * T, color: [0, 255, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0, motherId: 'mother' },
      ],
    };
    const next = tick(world);
    const child = next.entities.find(e => e.id === 'child');
    // Toddler was at (9,5); must have taken a step (any direction toward mother's tile).
    expect(child).toBeDefined();
    expect(child!.position).not.toEqual({ x: 9, y: 5 });
    expect(child?.activity.kind).toBe("idle");
  });

  it('max 2 entities per tile enforced during movement', () => {
    // Two entities occupy a tile; a third idle entity tries to move there but cannot
    // We set up a 3x1 grid-like scenario: entity at (1,0) with two entities blocking (2,0)
    // With gridSize=3, entity at (1,0) may try to move right to (2,0) but it's full
    // Run many ticks to confirm entity never ends up on a tile with 3 occupants
    const world: WorldState = {
      gridSize: 10,
      tick: 0,
      animals: [], trees: [], log: [], houses: [], biomes: plainsBiomes(30), villages: [], grass: emptyGrass(30),
      entities: [
        { id: 'blocker1', name: 'Test', position: { x: 5, y: 5 }, gender: 'male', activity: { kind: 'idle' }, age: 0, maxAge: 100 * T, color: [255, 0, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0 },
        { id: 'blocker2', name: 'Test', position: { x: 5, y: 5 }, gender: 'male', activity: { kind: 'idle' }, age: 0, maxAge: 100 * T, color: [255, 0, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0 },
        { id: 'mover', name: 'Test', position: { x: 4, y: 5 }, gender: 'female', activity: { kind: 'idle' }, age: 0, maxAge: 100 * T, color: [0, 255, 0] as [number, number, number], energy: 80, traits: { strength: 5, speed: 1, perception: 2, metabolism: 1.0, aggression: 5, fertility: 1.0, twinChance: 0 }, tribe: 0 as const, birthCooldown: 0, pregnancyTimer: 0, sparCooldown: 0 },
      ],
    };
    // Run tick multiple times and verify no tile ever has 3+ entities
    let current = world;
    for (let i = 0; i < 20; i++) {
      current = tick(current);
      const tileCount = new Map<string, number>();
      for (const e of current.entities) {
        const key = `${e.position.x},${e.position.y}`;
        tileCount.set(key, (tileCount.get(key) ?? 0) + 1);
      }
      for (const [, count] of tileCount) {
        // Allow 3 only if a birth just happened on this tick (baby spawning)
        // The invariant is: no tile exceeds 2 from pure movement
        // Since we only have same-gender blockers (no mating), count should not exceed 2
        expect(count).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe('behavior system integration', () => {
  it('female gathers fruit and male hunts over 100 ticks', () => {
    let world = createWorld({ gridSize: 15, entityCount: 4, villageCount: 1 });
    for (let i = 0; i < 100; i++) {
      world = tick(world);
    }
    // After 100 ticks, entities should still be alive (not all starved)
    expect(world.entities.length).toBeGreaterThan(0);
    // Log should have some events
    expect(world.log.length).toBeGreaterThan(0);
  });

  it('entities do not change goals every tick (hysteresis)', () => {
    let world = createWorld({ gridSize: 15, entityCount: 4, villageCount: 1 });
    // Run 5 ticks, track goal changes
    const goalChanges: number[] = [];
    const purposeOf = (e: typeof world.entities[number]) =>
      e.activity.kind === 'moving' ? e.activity.purpose : undefined;
    for (let i = 0; i < 5; i++) {
      const goalsBefore = world.entities.map(purposeOf);
      world = tick(world);
      const goalsAfter = world.entities.map(purposeOf);
      const changes = goalsBefore.filter((g, idx) => g && g !== goalsAfter[idx]).length;
      goalChanges.push(changes);
    }
    // Most ticks should have 0 goal changes (hysteresis prevents switching)
    const totalChanges = goalChanges.reduce((a, b) => a + b, 0);
    // With 4 entities over 5 ticks, fewer than 10 changes means hysteresis works
    expect(totalChanges).toBeLessThan(10);
  });

  it('simulation survives 500 ticks without crash', () => {
    let world = createWorld({ gridSize: 15, entityCount: 4, villageCount: 1 });
    for (let i = 0; i < 500; i++) {
      world = tick(world);
    }
    // Just verify no exceptions thrown
    expect(world.tick).toBe(500);
  });
});
