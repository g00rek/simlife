import { describe, it, expect } from 'vitest';
import { applyEnergyDrain, eatFromCarrying, eatFromStockpile } from '../metabolism';
import type { Entity, Village, RGB } from '../types';
import { ECONOMY, TICKS_PER_YEAR, CHILD_AGE } from '../types';

// ── Test helpers ──

const { drainInterval, hungerThreshold, energyMax } = ECONOMY.metabolism;
const { infantAgeYears, childDrainMultiplier } = ECONOMY.reproduction;

/** Create an entity with sensible defaults. Override any field. */
function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'e1',
    name: 'Test',
    position: { x: 5, y: 5 },
    gender: 'male',
    activity: { kind: 'idle' },
    age: 10 * TICKS_PER_YEAR, // adult by default
    maxAge: 80 * TICKS_PER_YEAR,
    color: [255, 0, 0] as RGB,
    energy: 80,
    traits: { strength: 50, dexterity: 50, intelligence: 50 },
    tribe: 0,
    birthCooldown: 0,
    pregnancyTimer: 0,
    ...overrides,
  };
}

/** Create a village with sensible defaults. */
function makeVillage(overrides: Partial<Village> = {}): Village {
  return {
    tribe: 0,
    color: [255, 0, 0] as RGB,
    name: 'TestVillage',
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

// ══════════════════════════════════════════════════════════════════════
// applyEnergyDrain
// ══════════════════════════════════════════════════════════════════════

describe('applyEnergyDrain', () => {
  it('adult loses 1 energy every drainInterval ticks', () => {
    // age must be a multiple of drainInterval AND an adult (>= CHILD_AGE years)
    const adultAge = CHILD_AGE * TICKS_PER_YEAR; // exactly CHILD_AGE boundary = adult
    // align to drainInterval
    const aligned = Math.ceil(adultAge / drainInterval) * drainInterval;
    const e = makeEntity({ age: aligned, energy: 80 });
    applyEnergyDrain(e, false);
    // baseDrain=1, hungerMod=1 (not hungry), ageMod=1 (adult), winterMod=1
    expect(e.energy).toBe(79);
  });

  it('adult does NOT drain on non-interval ticks', () => {
    const adultAge = CHILD_AGE * TICKS_PER_YEAR + 1; // adult, not on interval
    const e = makeEntity({ age: adultAge, energy: 80 });
    applyEnergyDrain(e, false);
    expect(e.energy).toBe(80); // unchanged
  });

  it('infant (age < 1yr) never drains energy', () => {
    // Set age to exactly drainInterval but < 1 year in ticks
    const infantAge = drainInterval; // this is 15 ticks, well under 1 year (2400 ticks)
    expect(infantAge).toBeLessThan(infantAgeYears * TICKS_PER_YEAR);
    const e = makeEntity({ age: infantAge, energy: 80 });
    applyEnergyDrain(e, false);
    expect(e.energy).toBe(80); // no drain
  });

  it('child (1-3yr) drains at 25% rate', () => {
    // age between infantAge and CHILD_AGE, on a drain interval tick
    const childAgeTicks = Math.ceil(infantAgeYears * TICKS_PER_YEAR); // just past infant
    // Find nearest drain-interval-aligned tick at child age
    const alignedAge = Math.ceil(childAgeTicks / drainInterval) * drainInterval;
    // Verify still a child (< CHILD_AGE years)
    expect(Math.floor(alignedAge / TICKS_PER_YEAR)).toBeLessThan(CHILD_AGE);
    expect(Math.floor(alignedAge / TICKS_PER_YEAR)).toBeGreaterThanOrEqual(infantAgeYears);

    const e = makeEntity({ age: alignedAge, energy: 80 });
    applyEnergyDrain(e, false);
    // baseDrain=1 * hungerMod=1 (not hungry) * ageMod=0.25 * winterMod=1 = 0.25
    expect(e.energy).toBe(80 - 1 * 1.0 * childDrainMultiplier * 1.0);
    expect(e.energy).toBe(79.75);
  });

  it('homeless adult in winter drains 2x energy', () => {
    const adultAge = Math.ceil((CHILD_AGE * TICKS_PER_YEAR) / drainInterval) * drainInterval;
    const e = makeEntity({ age: adultAge, energy: 80, homeId: undefined });
    applyEnergyDrain(e, true); // isWinter=true
    // baseDrain=1 * hungerMod=1 * ageMod=1 * winterMod=2 = 2
    expect(e.energy).toBe(78);
  });

  it('adult with home in winter drains normally (no winter penalty)', () => {
    const adultAge = Math.ceil((CHILD_AGE * TICKS_PER_YEAR) / drainInterval) * drainInterval;
    const e = makeEntity({ age: adultAge, energy: 80, homeId: 'h1' });
    applyEnergyDrain(e, true);
    // winterMod = 1.0 (has home)
    expect(e.energy).toBe(79);
  });

  it('hungry entity drains at 50% rate (hungerMod)', () => {
    const adultAge = Math.ceil((CHILD_AGE * TICKS_PER_YEAR) / drainInterval) * drainInterval;
    const e = makeEntity({ age: adultAge, energy: hungerThreshold - 1 }); // hungry
    applyEnergyDrain(e, false);
    // baseDrain=1 * hungerMod=0.5 * ageMod=1 * winterMod=1 = 0.5
    expect(e.energy).toBe(hungerThreshold - 1 - 0.5);
  });

  it('entity at 0 energy stays at 0 (does not go negative)', () => {
    const adultAge = Math.ceil((CHILD_AGE * TICKS_PER_YEAR) / drainInterval) * drainInterval;
    const e = makeEntity({ age: adultAge, energy: 0 });
    applyEnergyDrain(e, false);
    expect(e.energy).toBe(0);
  });

  it('hungry homeless child in winter: all modifiers stack', () => {
    const childAgeTicks = Math.ceil(infantAgeYears * TICKS_PER_YEAR);
    const alignedAge = Math.ceil(childAgeTicks / drainInterval) * drainInterval;
    const e = makeEntity({ age: alignedAge, energy: 10, homeId: undefined }); // hungry + homeless
    applyEnergyDrain(e, true); // winter
    // baseDrain=1 * hungerMod=0.5 * ageMod=0.25 * winterMod=2 = 0.25
    const expected = 10 - 1 * 0.5 * childDrainMultiplier * 2.0;
    expect(e.energy).toBe(expected);
  });
});

// ══════════════════════════════════════════════════════════════════════
// eatFromCarrying
// ══════════════════════════════════════════════════════════════════════

describe('eatFromCarrying', () => {
  it('entity eats from carrying when hungry (energy < threshold)', () => {
    const e = makeEntity({
      energy: hungerThreshold - 1,
      carrying: { type: 'meat', amount: 5 },
    });
    const ate = eatFromCarrying(e);
    expect(ate).toBe(true);
    expect(e.energy).toBe(Math.min(energyMax, hungerThreshold - 1 + ECONOMY.meat.energyPerUnit));
    expect(e.carrying?.amount).toBe(4);
  });

  it('entity eats fruit from carrying', () => {
    const e = makeEntity({
      energy: 30,
      carrying: { type: 'fruit', amount: 2 },
    });
    eatFromCarrying(e);
    expect(e.energy).toBe(Math.min(energyMax, 30 + ECONOMY.fruit.energyPerUnit));
    expect(e.carrying?.amount).toBe(1);
  });

  it('carrying depleted to 0 removes carrying entirely', () => {
    const e = makeEntity({
      energy: 30,
      carrying: { type: 'meat', amount: 1 },
    });
    eatFromCarrying(e);
    expect(e.carrying).toBeUndefined();
  });

  it('does not eat from carrying if not hungry', () => {
    const e = makeEntity({
      energy: hungerThreshold, // at threshold — NOT hungry
      carrying: { type: 'meat', amount: 5 },
    });
    const ate = eatFromCarrying(e);
    expect(ate).toBe(false);
    expect(e.energy).toBe(hungerThreshold);
    expect(e.carrying?.amount).toBe(5);
  });

  it('does not eat wood or gold from carrying', () => {
    const e = makeEntity({
      energy: 30,
      carrying: { type: 'wood', amount: 5 },
    });
    const ate = eatFromCarrying(e);
    expect(ate).toBe(false);
    expect(e.energy).toBe(30);
    expect(e.carrying?.amount).toBe(5);
  });

  it('infant does not eat from carrying', () => {
    const e = makeEntity({
      age: 10, // infant
      energy: 30,
      carrying: { type: 'meat', amount: 5 },
    });
    const ate = eatFromCarrying(e);
    expect(ate).toBe(false);
    expect(e.energy).toBe(30);
  });

  it('eating stops at energyMax — does not overfeed', () => {
    // Entity eats once, goes above threshold, then refuses to eat again
    const e = makeEntity({
      energy: hungerThreshold - 1, // 59 — hungry
      carrying: { type: 'meat', amount: 10 },
    });
    eatFromCarrying(e);
    // 59 + 25 = 84, below max. But above threshold now.
    expect(e.energy).toBe(59 + ECONOMY.meat.energyPerUnit);
    // Now energy is 84, above threshold. Should not eat.
    const ate2 = eatFromCarrying(e);
    expect(ate2).toBe(false);
    expect(e.energy).toBe(59 + ECONOMY.meat.energyPerUnit);
  });

  it('energy capped at energyMax when food energy would exceed it', () => {
    // Verify eat from carrying with energy=50, meat(25) -> 75 (capped at 100 = 75, no cap needed)
    const e = makeEntity({
      energy: 50,
      carrying: { type: 'meat', amount: 3 },
    });
    eatFromCarrying(e);
    expect(e.energy).toBe(75); // 50 + 25, no cap
    expect(e.energy).toBeLessThanOrEqual(energyMax);
  });
});

// ══════════════════════════════════════════════════════════════════════
// eatFromStockpile
// ══════════════════════════════════════════════════════════════════════

describe('eatFromStockpile', () => {
  it('entity in eat zone eats from village stockpile when hungry', () => {
    const e = makeEntity({ energy: 30 });
    const v = makeVillage({ meatStore: 10 });
    const ate = eatFromStockpile(e, v, true);
    expect(ate).toBe(true);
    expect(e.energy).toBe(30 + ECONOMY.meat.energyPerUnit);
    expect(v.meatStore).toBe(9);
  });

  it('does not eat if not in eat zone', () => {
    const e = makeEntity({ energy: 30 });
    const v = makeVillage({ meatStore: 10 });
    const ate = eatFromStockpile(e, v, false);
    expect(ate).toBe(false);
    expect(e.energy).toBe(30);
    expect(v.meatStore).toBe(10);
  });

  it('does not eat if not hungry', () => {
    const e = makeEntity({ energy: hungerThreshold }); // at threshold = not hungry
    const v = makeVillage({ meatStore: 10 });
    const ate = eatFromStockpile(e, v, true);
    expect(ate).toBe(false);
    expect(v.meatStore).toBe(10);
  });

  it('cooked meat preferred over raw when both available', () => {
    const e = makeEntity({ energy: 30 });
    const v = makeVillage({
      cookedMeatStore: 5,
      driedFruitStore: 5,
      meatStore: 10,
      plantStore: 10,
    });
    const ate = eatFromStockpile(e, v, true);
    expect(ate).toBe(true);
    expect(v.cookedMeatStore).toBe(4); // cooked meat consumed
    expect(v.driedFruitStore).toBe(5); // untouched
    expect(v.meatStore).toBe(10);      // untouched
    expect(v.plantStore).toBe(10);     // untouched
    expect(e.energy).toBe(30 + ECONOMY.cooking.cookedMeatEnergyPerUnit);
  });

  it('dried fruit preferred over raw meat when no cooked meat', () => {
    const e = makeEntity({ energy: 30 });
    const v = makeVillage({
      cookedMeatStore: 0,
      driedFruitStore: 5,
      meatStore: 10,
      plantStore: 10,
    });
    eatFromStockpile(e, v, true);
    expect(v.driedFruitStore).toBe(4);
    expect(v.meatStore).toBe(10);
    expect(e.energy).toBe(30 + ECONOMY.cooking.driedFruitEnergyPerUnit);
  });

  it('raw meat preferred over raw fruit when no cooked food', () => {
    const e = makeEntity({ energy: 30 });
    const v = makeVillage({
      cookedMeatStore: 0,
      driedFruitStore: 0,
      meatStore: 10,
      plantStore: 10,
    });
    eatFromStockpile(e, v, true);
    expect(v.meatStore).toBe(9);
    expect(v.plantStore).toBe(10);
    expect(e.energy).toBe(30 + ECONOMY.meat.energyPerUnit);
  });

  it('falls back to raw fruit when all else empty', () => {
    const e = makeEntity({ energy: 30 });
    const v = makeVillage({ plantStore: 3 });
    eatFromStockpile(e, v, true);
    expect(v.plantStore).toBe(2);
    expect(e.energy).toBe(30 + ECONOMY.fruit.energyPerUnit);
  });

  it('returns false when stockpile is completely empty', () => {
    const e = makeEntity({ energy: 30 });
    const v = makeVillage();
    const ate = eatFromStockpile(e, v, true);
    expect(ate).toBe(false);
    expect(e.energy).toBe(30);
  });

  it('infant does not eat from stockpile', () => {
    const e = makeEntity({ age: 10, energy: 30 }); // infant
    const v = makeVillage({ meatStore: 10 });
    const ate = eatFromStockpile(e, v, true);
    expect(ate).toBe(false);
    expect(v.meatStore).toBe(10);
  });

  it('eating stops at hunger threshold — does not overfeed', () => {
    // Entity at threshold-1 eats and goes above threshold, then won't eat again
    const e = makeEntity({ energy: hungerThreshold - 1 });
    const v = makeVillage({ meatStore: 10 });
    eatFromStockpile(e, v, true);
    // energy = 59 + 25 = 84 — above threshold now
    expect(e.energy).toBe(hungerThreshold - 1 + ECONOMY.meat.energyPerUnit);

    // Next call: not hungry anymore, should not eat
    const ate2 = eatFromStockpile(e, v, true);
    expect(ate2).toBe(false);
    expect(v.meatStore).toBe(9); // only 1 consumed total
  });
});
