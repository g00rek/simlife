/**
 * interactions.ts — Fighting detection + mating logic.
 *
 * Extracted from world.ts (R6 refactor). Pure functions that detect and initiate
 * entity interactions: cross-tribe combat and pheromone-based mating.
 */

import type { Entity, House, Village, LogEntry, Action } from './types';
import {
  FIGHT_MIN_AGE,
  MIN_REPRODUCTIVE_AGE, MAX_REPRODUCTIVE_AGE,
  TICKS_PER_YEAR, CHILD_AGE,
  HOUSE_SIZE,
  ECONOMY,
} from './types';
import { manhattan } from './geometry';
import { startWork } from './action-resolver';

// ── Local helpers ──
// Duplicated from world.ts to avoid circular imports (world.ts → interactions.ts
// and interactions.ts → world.ts). These are trivial 1-liners depending only on
// types.ts constants.

function ageInYears(e: Entity): number {
  return Math.floor(e.age / TICKS_PER_YEAR);
}

function isIdle(e: Entity): boolean {
  return e.activity.kind === 'idle';
}

function isPregnant(e: Entity): boolean {
  return e.pregnancyTimer > 0;
}

function getAction(e: Entity): Action | undefined {
  return e.activity.kind === 'working' ? e.activity.action : undefined;
}

function isChild(e: Entity): boolean {
  return ageInYears(e) < CHILD_AGE;
}

function isReproductive(e: Entity): boolean {
  const years = ageInYears(e);
  return years >= MIN_REPRODUCTIVE_AGE && years <= MAX_REPRODUCTIVE_AGE;
}

function isAtHome(e: Entity, houses: House[]): boolean {
  if (!e.homeId) return false;
  const house = houses.find(h => h.id === e.homeId);
  if (!house) return false;
  const dx = e.position.x - house.position.x;
  const dy = e.position.y - house.position.y;
  return dx >= 0 && dx < HOUSE_SIZE && dy >= 0 && dy < HOUSE_SIZE;
}

// ── Exported interaction functions ──

/**
 * Fight: higher strength = higher win chance (weighted random).
 */
export function fightWinner(a: Entity, b: Entity): Entity {
  const total = a.traits.strength + b.traits.strength;
  return Math.random() * total < a.traits.strength ? a : b;
}

/**
 * Fighting detection — adult males of different tribes, idle and adjacent, start a fight.
 */
export function detectInteractions(
  entities: Entity[],
  _gridSize: number,
  _villages: Village[],
  houses: House[] = [],
  log?: LogEntry[],
  tickNum?: number,
): Entity[] {
  const fighterIds = new Set<string>();

  const activeMales = entities.filter(e =>
    e.gender === 'male' && isIdle(e)
    && ageInYears(e) >= FIGHT_MIN_AGE && !isAtHome(e, houses)
  );

  for (let i = 0; i < activeMales.length - 1; i++) {
    for (let j = i + 1; j < activeMales.length; j++) {
      const m1 = activeMales[i];
      const m2 = activeMales[j];
      if (manhattan(m1.position, m2.position) > 1) continue;
      if (m1.tribe !== m2.tribe) {
        fighterIds.add(m1.id);
        fighterIds.add(m2.id);
      }
    }
    if (fighterIds.size > 0) break;
  }

  const loggedPairs = new Set<string>();
  return entities.map(e => {
    if (!fighterIds.has(e.id)) return e;
    const otherMale = entities.find(o =>
      o.id !== e.id && o.gender === 'male' && fighterIds.has(o.id)
      && manhattan(e.position, o.position) <= 1
    );
    if (otherMale) {
      if (log && tickNum != null) {
        const pairKey = [e.id, otherMale.id].sort().join(':');
        if (!loggedPairs.has(pairKey)) {
          loggedPairs.add(pairKey);
          log.push({
            tick: tickNum, type: 'fight',
            entityId: e.id, name: e.name, gender: e.gender, age: e.age,
            detail: `vs ${otherMale.name}`,
          });
        }
      }
      return { ...e, activity: startWork('fighting') };
    }
    return e;
  });
}

/**
 * Pheromone mating: male in range + fertile female → pregnancy chance.
 */
export function pheromoneMating(
  entities: Entity[],
  villages: Village[],
  _houses: House[],
  log: LogEntry[],
  tickNum: number,
): Entity[] {
  const updated = [...entities];
  const matedMaleIds = new Set<string>();

  const males = updated.filter(e =>
    e.gender === 'male' && !isChild(e) && isReproductive(e)
    && getAction(e) !== 'fighting'
  );

  for (const male of males) {
    if (matedMaleIds.has(male.id)) continue;

    // Male must be near a house or stockpile (just returned from work)
    const nearSettlement = _houses.some((h: House) =>
      manhattan(male.position, { x: h.position.x + 1, y: h.position.y + 1 }) <= 4
    ) || villages.some(v => v.stockpile && manhattan(male.position, v.stockpile) <= 3);
    if (!nearSettlement) continue;

    const range = 6; // check females within 6 tiles

    for (let fi = 0; fi < updated.length; fi++) {
      const female = updated[fi];
      if (female.gender !== 'female' || isChild(female)) continue;
      if (!isReproductive(female)) continue;
      if (isPregnant(female)) continue;
      if (female.birthCooldown > 0) continue;
      if (female.tribe !== male.tribe) continue;
      if (!female.homeId) continue;
      // Must be well-fed — pregnancy requires energy reserves (realistic body-fat gate)
      if (female.energy < ECONOMY.reproduction.pregnancyMinEnergy) continue;

      const dist = manhattan(male.position, female.position);
      if (dist > range) continue;

      // strength 0-100 → chance 0%-50% per adjacent-female check.
      const matingChance = male.traits.strength / 200;
      if (Math.random() >= matingChance) continue;

      // Pregnancy runs in parallel with activity — woman keeps doing whatever she was doing.
      const pregTime = ECONOMY.reproduction.pregnancyTicks;
      updated[fi] = {
        ...female,
        pregnancyTimer: pregTime,
        fatherTraits: male.traits,
        fatherTribe: male.tribe,
      };
      log.push({
        tick: tickNum, type: 'pregnant',
        entityId: female.id, name: female.name, gender: female.gender, age: female.age,
        detail: `father: ${male.name}`,
      });

      matedMaleIds.add(male.id);
      break; // one female per male per tick
    }
  }
  return updated;
}
