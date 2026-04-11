import { describe, it, expect } from 'vitest';
import { buildAIContext, decideAction, getScores, ROLES, scoreForGoalType, shouldReEvaluate } from '../utility-ai';
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
    const action = decideAction(makeContext({ nearHome: false, nearestFruitTree: undefined }));
    expect(action.type).toBe('wander');
  });

  it('female near home goes directly to gather when pantry needs plants', () => {
    const action = decideAction(makeContext({
      nearHome: true,
      nearestFruitTree: { pos: { x: 8, y: 5 }, dist: 3 },
    }));
    expect(action.type).toBe('go_gather');
  });

  it('female near home wanders when pantry needs plants but no target visible', () => {
    const action = decideAction(makeContext({ nearHome: true, nearestFruitTree: undefined }));
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

  it('detects fruit trees beyond normal perception range', () => {
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
      [{ id: 't1', position: { x: 13, y: 5 }, chopped: false, fruiting: true, hasFruit: true, fruitPortions: 3 }],
      [entity],
      biomes,
      20,
    );

    expect(ctx.nearestFruitTree?.dist).toBe(8);
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
        nearestFruitTree: { pos: { x: 7, y: 5 }, dist: 2 },
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

describe('role-based scoring', () => {
  it('female role does not include hunt/chop/build', () => {
    const role = ROLES['female'];
    expect(role.actions['hunt']).toBeUndefined();
    expect(role.actions['chop']).toBeUndefined();
    expect(role.actions['build']).toBeUndefined();
    expect(role.actions['gather']).toBe(1.0);
  });

  it('male role does not include gather', () => {
    const role = ROLES['male'];
    expect(role.actions['gather']).toBeUndefined();
    expect(role.actions['hunt']).toBe(1.0);
  });

  it('raw scoring returns nonzero gather for male when village needs food', () => {
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male', energy: 80 }),
    });
    const scores = getScores(ctx);
    // getScores returns RAW scores (no role filter), so gather should be > 0
    expect(scores.gather).toBeGreaterThan(0);
  });

  it('female decideAction never returns hunt', () => {
    const ctx = makeContext({
      entity: makeEntity({ gender: 'female', energy: 80 }),
      nearestAnimal: { pos: { x: 6, y: 5 }, dist: 1 },
    });
    const action = decideAction(ctx);
    expect(action.type).not.toBe('go_hunt');
  });

  it('male decideAction never returns gather', () => {
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male', energy: 80 }),
      nearestFruitTree: { pos: { x: 6, y: 5 }, dist: 1 },
    });
    const action = decideAction(ctx);
    expect(action.type).not.toBe('go_gather');
  });
});

describe('hysteresis re-evaluation', () => {
  it('does not re-evaluate before 20 ticks elapsed', () => {
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male', energy: 15 }),
    });
    const result = shouldReEvaluate(ctx, 'chop', 25, 30);
    expect(result.interrupt).toBe(false);
  });

  it('does not interrupt when score difference is below threshold', () => {
    // Entity with high energy — survival score is 0, all scores similar
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male', energy: 80 }),
    });
    const result = shouldReEvaluate(ctx, 'hunt', 0, 20);
    // With high energy, no big score difference — should not interrupt
    expect(result.interrupt).toBe(false);
  });

  it('interrupts when survival is critical and current action is low-priority', () => {
    // Entity with very low energy — survival score = 1.0, chop score is low
    // Use nearestAnimal so male's survival action is go_hunt (hunt is in male role)
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male', energy: 10 }),
      nearestAnimal: { pos: { x: 6, y: 5 }, dist: 1 },
    });
    const result = shouldReEvaluate(ctx, 'chop', 0, 20);
    expect(result.interrupt).toBe(true);
    expect(result.newAction).toBeDefined();
  });

  it('scoreForGoalType maps all goal types', () => {
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male', energy: 80 }),
    });
    expect(typeof scoreForGoalType(ctx, 'hunt')).toBe('number');
    expect(typeof scoreForGoalType(ctx, 'gather')).toBe('number');
    expect(typeof scoreForGoalType(ctx, 'chop')).toBe('number');
    expect(typeof scoreForGoalType(ctx, 'build')).toBe('number');
    expect(typeof scoreForGoalType(ctx, 'return_home')).toBe('number');
    expect(scoreForGoalType(ctx, 'unknown')).toBe(0);
  });
});
