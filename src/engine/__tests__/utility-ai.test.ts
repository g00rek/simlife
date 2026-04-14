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
    activity: { kind: 'idle' },
    age: 20 * 2400,
    maxAge: 60 * 2400,
    color: [100, 100, 100],
    energy: 80,
    traits: {
      strength: 50,
      dexterity: 50,
      intelligence: 50,
    },
    tribe: 0,
    birthCooldown: 0,
    pregnancyTimer: 0,
    ...overrides,
  };
}

function makeContext(overrides: Partial<AIContext> = {}): AIContext {
  const village = {
    tribe: 0,
    color: [220, 60, 60] as [number, number, number],
    name: 'Red Tribe',
    stockpile: { x: 5, y: 5 },
    meatStore: 5,
    plantStore: 0,
    woodStore: 5, cookedMeatStore: 0, driedFruitStore: 0, goldStore: 0,
  };
  return {
    entity: makeEntity(),
    village,
    nearHome: true,
    villageNeedsHouses: false,
    totalMeat: 5,
    totalPlant: 0,
    tribePopulation: 12,
    animalPopulation: 30,
    gridSize: 30,
    daysOfFood: 60,
    inEatZone: true,
    ...overrides,
  };
}

describe('decideAction gather behavior', () => {
  it('hungry female far from village walks back to stockpile when no fruit in sight', () => {
    const action = decideAction(makeContext({
      entity: makeEntity({ energy: 15 }), // critical survival
      nearHome: false,
      nearestFruitTree: undefined,
      daysOfFood: 40,
    }));
    // survival-mode when starving: deposit (walk to stockpile — passive eat on arrival)
    expect(action.type).toBe('deposit');
  });

  it('female goes directly to gather when food is low and fruit visible', () => {
    const action = decideAction(makeContext({
      nearHome: true,
      nearestFruitTree: { pos: { x: 8, y: 5 }, dist: 3 },
      daysOfFood: 20, // below comfort threshold
    }));
    expect(action.type).toBe('go_gather');
  });

  it('female cooks when food is comfortable and raw is available', () => {
    const action = decideAction(makeContext({
      nearHome: true,
      nearestFruitTree: undefined,
      daysOfFood: 90, // surplus → no gather urgency
    }));
    // plenty of food + raw in village (makeContext default meatStore=5) → cook
    expect(action.type).toBe('go_cook');
  });

  it('detects fruit trees beyond normal perception range', () => {
    const entity = makeEntity({
      position: { x: 5, y: 5 },
      traits: {
        strength: 50,
        dexterity: 50,
        intelligence: 50,
      },
    });
    const village = {
      tribe: 0,
      color: [220, 60, 60] as [number, number, number],
      name: 'Red Tribe',
      meatStore: 5,
      plantStore: 0,
      woodStore: 5, cookedMeatStore: 0, driedFruitStore: 0, goldStore: 0,
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
  it('male hunts when prey visible and food buffer is low', () => {
    const action = decideAction(makeContext({
      entity: makeEntity({ gender: 'male' }),
      nearHome: false,
      nearestAnimal: { pos: { x: 7, y: 5 }, dist: 2 },
      daysOfFood: 20,
    }));
    expect(action.type).toBe('go_hunt');
  });

  it('hungry male far from village walks to stockpile when no prey visible', () => {
    const action = decideAction(makeContext({
      entity: makeEntity({ gender: 'male', energy: 15 }),
      nearHome: false,
      nearestAnimal: undefined,
    }));
    expect(action.type).toBe('deposit');
  });

  it('male does not hunt when food buffer is ample (daysOfFood > 60)', () => {
    const action = decideAction(makeContext({
      entity: makeEntity({ gender: 'male' }),
      nearHome: true,
      nearestAnimal: { pos: { x: 7, y: 5 }, dist: 2 },
      daysOfFood: 120,
    }));
    expect(action.type).not.toBe('go_hunt');
  });

  it('hungry male picks closest food source — animal closer than stockpile', () => {
    const action = decideAction(makeContext({
      entity: makeEntity({ gender: 'male', energy: 15, position: { x: 25, y: 25 } }),
      nearHome: false,
      // Stockpile far (default x:5,y:5) → dist=40. Animal close → dist=2. Animal wins.
      nearestAnimal: { pos: { x: 27, y: 25 }, dist: 2 },
    }));
    expect(action.type).toBe('go_hunt');
  });

  it('hungry entity picks closest food source — fruit closer than stockpile', () => {
    const action = decideAction(makeContext({
      entity: makeEntity({ energy: 15, position: { x: 25, y: 25 } }),
      nearHome: false,
      // Stockpile at (5,5) → dist=40. Fruit close → dist=3. Fruit wins.
      nearestEdibleFruit: { pos: { x: 28, y: 25 }, dist: 3 },
    }));
    expect(action.type).toBe('go_gather');
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

  it('raw gather score is gender-filtered out for males in getScores', () => {
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male', energy: 80 }),
      daysOfFood: 10,
      nearestFruitTree: { pos: { x: 6, y: 5 }, dist: 1 },
    });
    const scores = getScores(ctx);
    // Male role has no 'gather' entry → filtered out of getScores.
    expect(scores.gather).toBeUndefined();
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
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male', energy: 10 }),
      nearestAnimal: { pos: { x: 6, y: 5 }, dist: 1 },
      daysOfFood: 10,
    });
    const result = shouldReEvaluate(ctx, 'chop', 0, 20);
    expect(result.interrupt).toBe(true);
    expect(result.newActivity).toBeDefined();
  });

  it('scoreForGoalType maps all goal types', () => {
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male', energy: 80 }),
    });
    expect(typeof scoreForGoalType(ctx, 'hunt')).toBe('number');
    expect(typeof scoreForGoalType(ctx, 'gather')).toBe('number');
    expect(typeof scoreForGoalType(ctx, 'chop')).toBe('number');
    expect(typeof scoreForGoalType(ctx, 'build')).toBe('number');
    expect(typeof scoreForGoalType(ctx, 'deposit')).toBe('number');
    expect(typeof scoreForGoalType(ctx, 'mine')).toBe('number');
    expect(scoreForGoalType(ctx, 'unknown')).toBe(0);
  });
});

describe('scoreMineGold', () => {
  it('is 0 when entity is a child', () => {
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male', age: 0 }),
      nearestGoldDeposit: { pos: { x: 7, y: 5 }, dist: 2 },
      daysOfFood: 999,
    });
    expect(getScores(ctx).mine ?? 0).toBe(0);
  });

  it('still mines when food is low (reduced score 0.1)', () => {
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male' }),
      nearestGoldDeposit: { pos: { x: 7, y: 5 }, dist: 2 },
      daysOfFood: 10,
    });
    expect(getScores(ctx).mine).toBeCloseTo(0.1);
  });

  it('is > 0 when food is comfortable and a deposit is in sight', () => {
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male' }),
      nearestGoldDeposit: { pos: { x: 7, y: 5 }, dist: 2 },
      daysOfFood: 100,
    });
    expect((getScores(ctx).mine ?? 0)).toBeGreaterThan(0);
  });

  it('is 0 when no deposit is in sight', () => {
    const ctx = makeContext({
      entity: makeEntity({ gender: 'male' }),
      daysOfFood: 100,
      // no nearestGoldDeposit
    });
    expect(getScores(ctx).mine ?? 0).toBe(0);
  });
});
