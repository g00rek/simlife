import { describe, it, expect, vi } from 'vitest';
import type { Entity, Animal, Tree, Village, GoldDeposit, Biome } from '../types';
import { ECONOMY } from '../types';
import {
  resolveHuntArrival,
  completeHunting,
  resolveGatherArrival,
  completeChopping,
  completeMining,
  depositCarrying,
  completeFighting,
  completeCooking,
  eatDirectlyToThreshold,
  isValidBuildSite,
  IDLE,
} from '../action-resolver';
import type { LogEventFn, GetVillageFn } from '../action-resolver';

// ── Helpers ──

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'e1',
    name: 'Test',
    position: { x: 5, y: 5 },
    gender: 'male',
    activity: { kind: 'idle' },
    age: 20 * 2400,
    maxAge: 60 * 2400,
    color: [100, 100, 100],
    energy: 80,
    traits: { strength: 50, dexterity: 50, intelligence: 50 },
    tribe: 0,
    birthCooldown: 0,
    pregnancyTimer: 0,
    ...overrides,
  };
}

function makeAnimal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: 'a1',
    position: { x: 5, y: 5 },
    gender: 'male',
    energy: 80,
    reproTimer: 100,
    panicTicks: 0,
    ...overrides,
  };
}

function makeTree(overrides: Partial<Tree> = {}): Tree {
  return {
    id: 't1',
    position: { x: 5, y: 5 },
    chopped: false,
    fruiting: true,
    hasFruit: true,
    fruitPortions: 5,
    ...overrides,
  };
}

function makeVillage(overrides: Partial<Village> = {}): Village {
  return {
    tribe: 0,
    color: [220, 60, 60],
    name: 'Red Tribe',
    stockpile: { x: 10, y: 10 },
    meatStore: 0,
    plantStore: 0,
    cookedMeatStore: 0,
    driedFruitStore: 0,
    woodStore: 0,
    goldStore: 0,
    ...overrides,
  };
}

function makeDeposit(overrides: Partial<GoldDeposit> = {}): GoldDeposit {
  return {
    id: 'g1',
    position: { x: 6, y: 5 },
    remaining: 6,
    ...overrides,
  };
}

const noop: LogEventFn = () => {};

// ── Tests ──

describe('action resolvers', () => {
  // --- resolveHuntArrival ---

  it('resolveHuntArrival: starts hunting when animal at same position', () => {
    const entity = makeEntity();
    const animals = [makeAnimal({ position: { x: 5, y: 5 } })];
    const result = resolveHuntArrival(entity, animals);
    expect(result.activity.kind).toBe('working');
    if (result.activity.kind === 'working') {
      expect(result.activity.action).toBe('hunting');
    }
  });

  it('resolveHuntArrival: starts hunting when animal within kill range (adjacent)', () => {
    const entity = makeEntity();
    const animals = [makeAnimal({ position: { x: 6, y: 5 } })]; // adjacent = manhattan 1
    const result = resolveHuntArrival(entity, animals);
    expect(result.activity.kind).toBe('working');
  });

  it('resolveHuntArrival: idle when no animal at position', () => {
    const entity = makeEntity();
    const animals = [makeAnimal({ position: { x: 20, y: 20 } })];
    const result = resolveHuntArrival(entity, animals);
    expect(result.activity).toEqual(IDLE);
  });

  it('resolveHuntArrival: idle when already carrying', () => {
    const entity = makeEntity({ carrying: { type: 'meat', amount: 5 } });
    const animals = [makeAnimal({ position: { x: 5, y: 5 } })];
    const result = resolveHuntArrival(entity, animals);
    expect(result.activity).toEqual(IDLE);
  });

  // --- completeHunting ---

  it('completeHunting: kills animal and carries meat', () => {
    const entity = makeEntity({ energy: 80 });
    const animals = [makeAnimal({ position: { x: 5, y: 5 } })];
    const result = completeHunting(entity, animals, noop);
    expect(animals.length).toBe(0); // animal removed
    expect(result.carrying?.type).toBe('meat');
    expect(result.carrying!.amount).toBeGreaterThan(0);
    expect(result.activity).toEqual(IDLE);
  });

  // --- completeChopping ---

  it('completeChopping: entity carries wood, tree marked chopped', () => {
    const entity = makeEntity();
    const trees = [makeTree({ chopped: false, fruiting: false, hasFruit: false, fruitPortions: 0 })];
    const result = completeChopping(entity, trees, 100, noop);
    expect(trees[0].chopped).toBe(true);
    expect(trees[0].choppedAt).toBe(100);
    expect(result.carrying?.type).toBe('wood');
    expect(result.carrying!.amount).toBe(ECONOMY.wood.unitsPerChop);
    expect(result.activity).toEqual(IDLE);
  });

  // --- completeMining ---

  it('completeMining: entity carries gold, deposit remaining decremented', () => {
    const entity = makeEntity({ position: { x: 5, y: 5 } });
    const deposits = [makeDeposit({ position: { x: 6, y: 5 }, remaining: 6 })];
    const result = completeMining(entity, deposits, 200, noop);
    expect(result.carrying?.type).toBe('gold');
    expect(result.carrying!.amount).toBe(ECONOMY.gold.unitsPerMine);
    expect(deposits[0].remaining).toBe(6 - ECONOMY.gold.unitsPerMine);
    expect(result.activity).toEqual(IDLE);
  });

  it('completeMining: no gold when deposit already depleted', () => {
    const entity = makeEntity({ position: { x: 5, y: 5 } });
    const deposits = [makeDeposit({ position: { x: 6, y: 5 }, remaining: 0 })];
    const result = completeMining(entity, deposits, 200, noop);
    expect(result.carrying).toBeUndefined();
    expect(result.activity).toEqual(IDLE);
    // Energy still drained (effort penalty)
    expect(result.energy).toBe(80 - 5);
  });

  // --- depositCarrying ---

  it('depositCarrying: meat goes to meatStore', () => {
    const village = makeVillage({ meatStore: 10 });
    const getVillage: GetVillageFn = () => village;
    const entity = makeEntity({ carrying: { type: 'meat', amount: 5 } });
    const result = depositCarrying(entity, getVillage);
    expect(result.carrying).toBeUndefined();
    expect(village.meatStore).toBe(15);
  });

  it('depositCarrying: gold goes to goldStore', () => {
    const village = makeVillage({ goldStore: 0 });
    const getVillage: GetVillageFn = () => village;
    const entity = makeEntity({ carrying: { type: 'gold', amount: 3 } });
    const result = depositCarrying(entity, getVillage);
    expect(result.carrying).toBeUndefined();
    expect(village.goldStore).toBe(3);
  });

  it('depositCarrying: wood goes to woodStore', () => {
    const village = makeVillage({ woodStore: 2 });
    const getVillage: GetVillageFn = () => village;
    const entity = makeEntity({ carrying: { type: 'wood', amount: 3 } });
    const result = depositCarrying(entity, getVillage);
    expect(result.carrying).toBeUndefined();
    expect(village.woodStore).toBe(5);
  });

  it('depositCarrying: no-op when not carrying', () => {
    const village = makeVillage({ meatStore: 10 });
    const getVillage: GetVillageFn = () => village;
    const entity = makeEntity();
    const result = depositCarrying(entity, getVillage);
    expect(result).toBe(entity); // same reference — no mutation
    expect(village.meatStore).toBe(10);
  });

  // --- completeFighting ---

  it('completeFighting: returns idle with energy cost', () => {
    const entity = makeEntity({ energy: 80 });
    const result = completeFighting(entity);
    expect(result.activity).toEqual(IDLE);
    expect(result.energy).toBe(60);
  });

  // --- completeCooking ---

  it('completeCooking: converts raw meat to cooked', () => {
    const village = makeVillage({ meatStore: 5, plantStore: 0 });
    const getVillage: GetVillageFn = () => village;
    const result = completeCooking(makeEntity(), getVillage, noop);
    expect(village.meatStore).toBe(5 - ECONOMY.cooking.batchSize);
    expect(village.cookedMeatStore).toBe(ECONOMY.cooking.batchSize);
    expect(result.activity).toEqual(IDLE);
  });

  // --- eatDirectlyToThreshold ---

  it('eatDirectlyToThreshold: eats only enough to reach hunger threshold', () => {
    const entity = makeEntity({ energy: 30 });
    const result = eatDirectlyToThreshold(entity, 10, 10);
    // Should eat 3 portions: 30 + 10 + 10 + 10 = 60 (= hungerThreshold)
    expect(result.entity.energy).toBe(ECONOMY.metabolism.hungerThreshold);
    expect(result.remainingPortions).toBe(7);
  });

  it('eatDirectlyToThreshold: no-op when already above threshold', () => {
    const entity = makeEntity({ energy: 80 });
    const result = eatDirectlyToThreshold(entity, 10, 5);
    expect(result.entity).toBe(entity); // same reference
    expect(result.remainingPortions).toBe(5);
  });

  // --- isValidBuildSite ---

  it('isValidBuildSite: returns true on open plains with no neighbors', () => {
    const biomes: Biome[][] = Array.from({ length: 20 }, () =>
      new Array(20).fill('plains')
    );
    const result = isValidBuildSite(5, 5, biomes, 20, [], []);
    expect(result).toBe(true);
  });

  it('isValidBuildSite: returns false near water', () => {
    const biomes: Biome[][] = Array.from({ length: 20 }, () =>
      new Array(20).fill('plains')
    );
    biomes[4][5] = 'water'; // buffer zone touches water
    const result = isValidBuildSite(5, 5, biomes, 20, [], []);
    expect(result).toBe(false);
  });
});
