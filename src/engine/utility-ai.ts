import type { Entity, Position, Animal, Plant, Village, Biome } from './types';
import { CHILD_AGE, HUNGER_THRESHOLD, TICKS_PER_DAY, DAY_TICKS } from './types';
import { ageInYears } from './world';

// --- Action types ---
export type AIAction =
  | { type: 'rest' }
  | { type: 'eat' }
  | { type: 'go_chop'; target: Position }
  | { type: 'go_hunt'; target: Position }
  | { type: 'return_home' }
  | { type: 'go_gather'; target: Position }
  | { type: 'leave_village' }   // walk toward edge to exit
  | { type: 'wander' }          // random step (ronins)
  | { type: 'play' };           // random step within village (children)

// --- Context for scoring ---
export interface AIContext {
  entity: Entity;
  village?: Village;
  inVillage: boolean;
  isNight: boolean;
  nearestAnimal?: { pos: Position; dist: number };
  nearestPlant?: { pos: Position; dist: number };
  nearestForest?: { pos: Position; dist: number };
  hasPartnerInVillage: boolean;
}

// --- Scoring functions (0-1, higher = more urgent) ---

function scoreSurvival(ctx: AIContext): number {
  if (ctx.entity.energy < 20) return 1.0;
  if (ctx.entity.energy < HUNGER_THRESHOLD) return 0.6;
  return 0;
}

function scoreBuildHome(ctx: AIContext): number {
  if (ctx.entity.gender !== 'male') return 0;
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (ctx.entity.homeId) return 0;
  if (!ctx.entity.partnerId) return 0; // need partner first
  // Need wood in warehouse
  if (!ctx.village || ctx.village.woodStore < 5) return 0; // not enough wood yet → go chop
  return 0.9; // high priority — get back to village to build
}

function scoreChopFirewood(ctx: AIContext): number {
  if (ctx.entity.gender !== 'male') return 0;
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.village) return 0;
  const WOOD_MAX = 30;
  if (ctx.village.woodStore >= WOOD_MAX) return 0;
  const woodNeed = (WOOD_MAX - ctx.village.woodStore) / WOOD_MAX;
  return woodNeed * 0.5; // lower priority than hunting
}

function scoreHunt(ctx: AIContext): number {
  if (ctx.entity.gender !== 'male') return 0;
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.entity.homeId) return 0; // build house first
  if (!ctx.village) return 0;
  const PANTRY_MAX = 50;
  if (ctx.village.meatStore >= PANTRY_MAX) return 0; // full, no need
  const meatNeed = (PANTRY_MAX - ctx.village.meatStore) / PANTRY_MAX;
  return meatNeed * 0.7;
}

function scoreGather(ctx: AIContext): number {
  if (ctx.entity.gender !== 'female') return 0;
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.village) return 0;
  const PANTRY_MAX = 50;
  if (ctx.village.plantStore >= PANTRY_MAX) return 0;
  const plantNeed = (PANTRY_MAX - ctx.village.plantStore) / PANTRY_MAX;
  return plantNeed * 0.6;
}

function scoreReturnHome(ctx: AIContext): number {
  if (!ctx.village || ctx.inVillage) return 0;
  // Low priority — only return when nothing else to do
  return 0.1;
}

// --- Main decision function ---

// Exposed for debug
export function getScores(ctx: AIContext): Record<string, number> {
  return {
    survival: scoreSurvival(ctx),
    buildHome: scoreBuildHome(ctx),
    firewood: scoreChopFirewood(ctx),
    hunt: scoreHunt(ctx),
    gather: scoreGather(ctx),
    returnHome: scoreReturnHome(ctx),
  };
}

export function decideAction(ctx: AIContext): AIAction {
  const e = ctx.entity;

  // Children: return if outside village, wander inside village
  if (ageInYears(e) < CHILD_AGE) {
    if (!ctx.inVillage && ctx.village) return { type: 'return_home' };
    return { type: 'play' }; // run around in village
  }

  // Night: everyone returns home, in village = rest
  if (ctx.isNight) {
    if (!ctx.inVillage && ctx.village) return { type: 'return_home' };
    return { type: 'rest' };
  }

  // Score all actions
  const scores: Array<{ score: number; action: () => AIAction }> = [];

  // Survival — eat from pantry (handled in tick step 0, but if outside village, return)
  const survScore = scoreSurvival(ctx);
  if (survScore > 0 && !ctx.inVillage && ctx.village) {
    scores.push({ score: survScore, action: () => ({ type: 'return_home' }) });
  }

  // Build home
  const buildScore = scoreBuildHome(ctx);
  if (buildScore > 0) {
    if (!ctx.inVillage) {
      scores.push({ score: buildScore, action: () => ({ type: 'return_home' }) });
    } else {
      // In village, will be detected as 'building' by tick logic
      scores.push({ score: buildScore, action: () => ({ type: 'rest' }) });
    }
  }

  // Hunt
  const huntScore = scoreHunt(ctx);
  if (huntScore > 0) {
    if (ctx.inVillage) {
      scores.push({ score: huntScore, action: () => ({ type: 'leave_village' }) });
    } else if (ctx.nearestAnimal) {
      scores.push({ score: huntScore, action: () => ({ type: 'go_hunt', target: ctx.nearestAnimal!.pos }) });
    } else {
      // No prey in sight — keep exploring (higher score than return_home!)
      scores.push({ score: huntScore * 0.8, action: () => ({ type: 'leave_village' }) });
    }
  }

  // Gather
  const gatherScore = scoreGather(ctx);
  if (gatherScore > 0) {
    if (ctx.inVillage) {
      scores.push({ score: gatherScore, action: () => ({ type: 'leave_village' }) });
    } else if (ctx.nearestPlant) {
      scores.push({ score: gatherScore, action: () => ({ type: 'go_gather', target: ctx.nearestPlant!.pos }) });
    } else {
      // No plants in sight — keep moving away to explore
      scores.push({ score: gatherScore * 0.8, action: () => ({ type: 'leave_village' }) });
    }
  }

  // Chop firewood
  const firewoodScore = scoreChopFirewood(ctx);
  if (firewoodScore > 0) {
    if (ctx.inVillage) {
      scores.push({ score: firewoodScore, action: () => ({ type: 'leave_village' }) });
    } else if (ctx.nearestForest) {
      scores.push({ score: firewoodScore, action: () => ({ type: 'go_chop', target: ctx.nearestForest!.pos }) });
    } else {
      scores.push({ score: firewoodScore * 0.8, action: () => ({ type: 'leave_village' }) });
    }
  }

  // Return home (low priority default for outside entities)
  const returnScore = scoreReturnHome(ctx);
  if (returnScore > 0) {
    scores.push({ score: returnScore, action: () => ({ type: 'return_home' }) });
  }

  // Ronin fallback
  if (!ctx.village) {
    scores.push({ score: 0.1, action: () => ({ type: 'wander' }) });
  }

  // Default: stroll around village (never just stand still)
  if (ctx.inVillage) {
    scores.push({ score: 0.02, action: () => ({ type: 'play' }) });
  }

  // Absolute fallback
  scores.push({ score: 0.01, action: () => ({ type: 'rest' }) });

  // Pick highest score
  scores.sort((a, b) => b.score - a.score);
  return scores[0].action();
}

// --- Build context from world state ---

export function buildAIContext(
  entity: Entity,
  villages: Village[],
  animals: Animal[],
  plants: Plant[],
  entities: Entity[],
  biomes: Biome[][],
  gridSize: number,
  tick: number = 0,
): AIContext {
  const village = entity.tribe >= 0 ? villages.find(v => v.tribe === entity.tribe) : undefined;
  const inVillage = !!village && (
    Math.abs(entity.position.x - village.center.x) + Math.abs(entity.position.y - village.center.y) <= village.radius
  );

  const sense = Math.floor(3 + entity.traits.perception * 2);

  // Find nearest animal
  let nearestAnimal: AIContext['nearestAnimal'];
  for (const a of animals) {
    const d = Math.abs(a.position.x - entity.position.x) + Math.abs(a.position.y - entity.position.y);
    if (d > 0 && d <= sense && (!nearestAnimal || d < nearestAnimal.dist)) {
      nearestAnimal = { pos: a.position, dist: d };
    }
  }

  // Find nearest mature plant
  let nearestPlant: AIContext['nearestPlant'];
  for (const p of plants) {
    if (p.portions <= 0) continue;
    const d = Math.abs(p.position.x - entity.position.x) + Math.abs(p.position.y - entity.position.y);
    if (d > 0 && d <= sense && (!nearestPlant || d < nearestPlant.dist)) {
      nearestPlant = { pos: p.position, dist: d };
    }
  }

  // Find nearest forest tile
  let nearestForest: AIContext['nearestForest'];
  const forestRange = Math.floor(sense * 2);
  for (let dy = -forestRange; dy <= forestRange; dy++) {
    for (let dx = -forestRange; dx <= forestRange; dx++) {
      const nx = entity.position.x + dx;
      const ny = entity.position.y + dy;
      if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize && biomes[ny][nx] === 'forest') {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d > 0 && (!nearestForest || d < nearestForest.dist)) {
          nearestForest = { pos: { x: nx, y: ny }, dist: d };
        }
      }
    }
  }

  // Has partner in village
  const hasPartnerInVillage = entity.homeId
    ? entities.some(o => o.id !== entity.id && o.homeId === entity.homeId && o.state === 'idle')
    : false;

  const isNight = (tick % TICKS_PER_DAY) >= DAY_TICKS;
  return { entity, village, inVillage, isNight, nearestAnimal, nearestPlant, nearestForest, hasPartnerInVillage };
}
