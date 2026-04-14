/**
 * metabolism.ts — Energy drain + eating logic extracted from tick() Step 0.
 *
 * Pure functions that compute per-entity metabolism each tick:
 *   1. Energy drain (age-gated, winter penalty for homeless)
 *   2. Eating from carried food when hungry
 *   3. Eating from village stockpile when hungry and in eat zone
 *
 * These are called from tick() in world.ts during the Step 0 entity map.
 */

import type { Entity, Village } from './types';
import {
  ECONOMY,
  CHILD_AGE,
  TICKS_PER_YEAR,
} from './types';

// ── Helpers (mirrored from world.ts — kept local to avoid circular deps) ──

function ageInYears(e: Entity): number {
  return Math.floor(e.age / TICKS_PER_YEAR);
}

function isInfant(e: Entity): boolean {
  return ageInYears(e) < ECONOMY.reproduction.infantAgeYears;
}

function isChild(e: Entity): boolean {
  return ageInYears(e) < CHILD_AGE;
}

function isHungry(e: Entity): boolean {
  return e.energy < ECONOMY.metabolism.hungerThreshold;
}

// ── Exported pure functions ──

/**
 * Apply energy drain to an entity based on age, hunger, winter, and housing.
 * Infants (< infantAgeYears) never drain.
 * Children (infantAge..CHILD_AGE) drain at childDrainMultiplier (25%).
 * Hungry entities drain at 50% (hungerMod).
 * Homeless in winter: 2x drain.
 *
 * Mutates `entity.energy` in place (caller already spread-copied the entity).
 */
export function applyEnergyDrain(entity: Entity, isWinter: boolean): void {
  if (isInfant(entity)) return;
  if (entity.age % ECONOMY.metabolism.drainInterval !== 0) return;

  const baseDrain = 1;
  const hungerMod = isHungry(entity) ? 0.5 : 1.0;
  const ageMod = isChild(entity) ? ECONOMY.reproduction.childDrainMultiplier : 1.0;
  const winterMod = (isWinter && !entity.homeId) ? 2.0 : 1.0;
  entity.energy = Math.max(0, entity.energy - baseDrain * hungerMod * ageMod * winterMod);
}

/**
 * If the entity is hungry and carrying food (meat or fruit), eat one unit.
 * Returns true if the entity ate (so caller can skip stockpile eating).
 * Infants don't eat.
 *
 * Mutates `entity.energy` and `entity.carrying` in place.
 */
export function eatFromCarrying(entity: Entity): boolean {
  if (!isHungry(entity) || isInfant(entity)) return false;
  if (!entity.carrying || entity.carrying.amount <= 0) return false;

  const energyGain =
    entity.carrying.type === 'meat' ? ECONOMY.meat.energyPerUnit
    : entity.carrying.type === 'fruit' ? ECONOMY.fruit.energyPerUnit
    : 0;

  if (energyGain <= 0) return false;

  entity.carrying = { ...entity.carrying, amount: entity.carrying.amount - 1 };
  if (entity.carrying.amount <= 0) entity.carrying = undefined;
  entity.energy = Math.min(ECONOMY.metabolism.energyMax, entity.energy + energyGain);
  return true;
}

/**
 * If the entity is hungry and in the village eat zone, eat from the village stockpile.
 * Priority: cooked meat > dried fruit > raw meat > raw fruit.
 * Returns true if the entity ate.
 * Infants don't eat.
 *
 * Mutates `entity.energy` and the village store counts in place.
 * The `inEatZone` check is done by the caller (requires houses data).
 */
export function eatFromStockpile(entity: Entity, village: Village, inEatZone: boolean): boolean {
  if (!isHungry(entity) || isInfant(entity)) return false;
  if (!inEatZone) return false;

  if (village.cookedMeatStore > 0) {
    village.cookedMeatStore -= 1;
    entity.energy = Math.min(ECONOMY.metabolism.energyMax, entity.energy + ECONOMY.cooking.cookedMeatEnergyPerUnit);
    return true;
  } else if (village.driedFruitStore > 0) {
    village.driedFruitStore -= 1;
    entity.energy = Math.min(ECONOMY.metabolism.energyMax, entity.energy + ECONOMY.cooking.driedFruitEnergyPerUnit);
    return true;
  } else if (village.meatStore > 0) {
    village.meatStore -= 1;
    entity.energy = Math.min(ECONOMY.metabolism.energyMax, entity.energy + ECONOMY.meat.energyPerUnit);
    return true;
  } else if (village.plantStore > 0) {
    village.plantStore -= 1;
    entity.energy = Math.min(ECONOMY.metabolism.energyMax, entity.energy + ECONOMY.fruit.energyPerUnit);
    return true;
  }

  return false;
}
