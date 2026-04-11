import { describe, it, expect } from 'vitest';
import { buildAIContext, decideAction } from '../utility-ai';
import type { AIContext } from '../utility-ai';
import type { Entity } from '../types';

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'e1',
    name: 'Miroslava',
    position: { x: 5, y: 5 },
    gender: 'female',
    state: 'idle',
    stateTimer: 0,
    age: 20 * 2400,
    maxAge: 60 * 2400,
    color: [100, 100, 100],
    energy: 80,
    traits: {
      strength: 5,
      speed: 1,
      perception: 2,
      metabolism: 1.0,
      aggression: 3,
      fertility: 1.0,
      twinChance: 0,
      pheromoneRange: 2,
    },
    meat: 0,
    tribe: 0,
    birthCooldown: 0,
    mateCooldown: 0,
    goalSetTick: 0,
    ...overrides,
  };
}

function makeContext(overrides: Partial<AIContext> = {}): AIContext {
  const village = {
    tribe: 0,
    color: [220, 60, 60] as [number, number, number],
    name: 'Red Tribe',
    meatStore: 5,
    plantStore: 0,
    woodStore: 5,
  };
  return {
    entity: makeEntity(),
    village,
    nearHome: true,
    isNight: false,
    villageNeedsHouses: false,
    tribePopulation: 12,
    animalPopulation: 30,
    gridSize: 30,
    ...overrides,
  };
}

describe('decideAction gather behavior', () => {
  it('female away from home with no visible plants wanders to search', () => {
    const action = decideAction(makeContext({ nearHome: false, nearestPlant: undefined }));
    expect(action.type).toBe('wander');
  });

  it('female near home goes directly to gather when pantry needs plants', () => {
    const action = decideAction(makeContext({
      nearHome: true,
      nearestPlant: { pos: { x: 8, y: 5 }, dist: 3 },
    }));
    expect(action.type).toBe('go_gather');
  });

  it('female near home wanders when pantry needs plants but no target visible', () => {
    const action = decideAction(makeContext({ nearHome: true, nearestPlant: undefined }));
    expect(action.type).toBe('wander');
  });

  it('female stays near home when total food and plant reserves are enough', () => {
    const action = decideAction(
      makeContext({
        nearHome: true,
        village: {
          tribe: 0,
          color: [220, 60, 60],
          name: 'Red Tribe',
          meatStore: 60,
          plantStore: 20,
          woodStore: 30,
        },
      }),
    );
    expect(action.type).toBe('play');
  });

  it('detects fruiting plants beyond normal perception range', () => {
    const entity = makeEntity({
      position: { x: 5, y: 5 },
      traits: {
        strength: 5,
        speed: 1,
        perception: 1,
        metabolism: 1.0,
        aggression: 3,
        fertility: 1.0,
        twinChance: 0,
        pheromoneRange: 2,
      },
    });
    const village = {
      tribe: 0,
      color: [220, 60, 60] as [number, number, number],
      name: 'Red Tribe',
      meatStore: 5,
      plantStore: 0,
      woodStore: 5,
    };
    const biomes = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => 'plains' as const));
    const ctx = buildAIContext(
      entity,
      [village],
      [],
      [{ id: 'p1', position: { x: 13, y: 5 }, portions: 1, maxPortions: 5 }],
      [entity],
      biomes,
      20,
    );

    expect(ctx.nearestPlant?.dist).toBe(8);
  });
});

describe('decideAction hunt behavior', () => {
  it('male away from home can still choose go_hunt when prey is visible', () => {
    const action = decideAction(
      makeContext({
        entity: makeEntity({
          gender: 'male',
          homeId: undefined,
          mateCooldown: 0,
        }),
        nearHome: false,
        nearestAnimal: { pos: { x: 7, y: 5 }, dist: 2 },
        nearestForest: undefined,
      }),
    );
    expect(action.type).toBe('go_hunt');
  });

  it('male away from home with no visible prey wanders to search', () => {
    const action = decideAction(
      makeContext({
        entity: makeEntity({
          gender: 'male',
          homeId: undefined,
        }),
        nearHome: false,
        nearestAnimal: undefined,
      }),
    );
    expect(action.type).toBe('wander');
  });

  it('hungry male gathers plants for survival when prey is unavailable', () => {
    const action = decideAction(
      makeContext({
        entity: makeEntity({
          gender: 'male',
          energy: 10,
        }),
        nearHome: false,
        nearestAnimal: undefined,
        nearestPlant: { pos: { x: 7, y: 5 }, dist: 2 },
      }),
    );
    expect(action.type).toBe('go_gather');
  });

  it('male does not hunt when total food reserve is enough', () => {
    const action = decideAction(
      makeContext({
        entity: makeEntity({ gender: 'male' }),
        nearHome: false,
        homeTarget: { x: 5, y: 5 },
        nearestAnimal: { pos: { x: 7, y: 5 }, dist: 2 },
        village: {
          tribe: 0,
          color: [220, 60, 60],
          name: 'Red Tribe',
          meatStore: 60,
          plantStore: 5,
          woodStore: 30,
        },
      }),
    );
    expect(action.type).toBe('return_home');
  });

  it('male at night hunts when village meat is low and energy is safe', () => {
    const action = decideAction(
      makeContext({
        entity: makeEntity({
          gender: 'male',
          energy: 80,
        }),
        isNight: true,
        nearHome: false,
        nearestAnimal: { pos: { x: 8, y: 5 }, dist: 3 },
        village: {
          tribe: 0,
          color: [220, 60, 60],
          name: 'Red Tribe',
          meatStore: 5,
          plantStore: 10,
          woodStore: 5,
        },
      }),
    );
    expect(action.type).toBe('go_hunt');
  });

  it('hungry male at night hunts for survival when prey is visible', () => {
    const action = decideAction(
      makeContext({
        entity: makeEntity({
          gender: 'male',
          energy: 20,
        }),
        isNight: true,
        nearHome: false,
        nearestAnimal: { pos: { x: 8, y: 5 }, dist: 3 },
        village: {
          tribe: 0,
          color: [220, 60, 60],
          name: 'Red Tribe',
          meatStore: 5,
          plantStore: 10,
          woodStore: 5,
        },
      }),
    );
    expect(action.type).toBe('go_hunt');
  });
});
