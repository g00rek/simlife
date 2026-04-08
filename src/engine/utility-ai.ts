import type { Entity, Position, Animal, Plant, Village, Biome } from './types';
import { CHILD_AGE, HUNGER_THRESHOLD } from './types';
import { ageInYears } from './world';

// --- Action types ---
export type AIAction =
  | { type: 'rest' }
  | { type: 'eat' }
  | { type: 'go_chop'; target: Position }
  | { type: 'return_with_wood' }
  | { type: 'go_hunt'; target: Position }
  | { type: 'return_home' }
  | { type: 'go_gather'; target: Position }
  | { type: 'leave_village' }   // walk toward edge to exit
  | { type: 'wander' };         // random step (ronins)

// --- Context for scoring ---
export interface AIContext {
  entity: Entity;
  village?: Village;
  inVillage: boolean;
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
  if (ctx.entity.carryingWood) return 0.85; // has wood, go build!
  return 0.8; // need to go chop
}

function scoreHunt(ctx: AIContext): number {
  if (ctx.entity.gender !== 'male') return 0;
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.entity.homeId) return 0; // build house first
  if (!ctx.village) return 0;
  const meatNeed = Math.max(0, (10 - ctx.village.meatStore) / 10);
  return meatNeed * 0.7;
}

function scoreGather(ctx: AIContext): number {
  if (ctx.entity.gender !== 'female') return 0;
  if (ageInYears(ctx.entity) < CHILD_AGE) return 0;
  if (!ctx.village) return 0;
  const plantNeed = Math.max(0, (5 - ctx.village.plantStore) / 5);
  return plantNeed * 0.6;
}

function scoreReturnHome(ctx: AIContext): number {
  if (!ctx.village || ctx.inVillage) return 0;
  // Want to return if not doing anything important outside
  return 0.3;
}

// --- Main decision function ---

export function decideAction(ctx: AIContext): AIAction {
  const e = ctx.entity;

  // Children always stay/return
  if (ageInYears(e) < CHILD_AGE) {
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
    if (e.carryingWood) {
      if (ctx.inVillage) {
        // Will be detected as 'building' by tick logic
        scores.push({ score: buildScore, action: () => ({ type: 'rest' }) });
      } else {
        scores.push({ score: buildScore, action: () => ({ type: 'return_with_wood' }) });
      }
    } else if (ctx.nearestForest) {
      scores.push({ score: buildScore, action: () => ({ type: 'go_chop', target: ctx.nearestForest!.pos }) });
    } else {
      // No forest in range — wander to find one
      scores.push({ score: buildScore * 0.5, action: () => ({ type: 'leave_village' }) });
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
      // Wander looking for prey
      scores.push({ score: huntScore * 0.3, action: () => ({ type: 'wander' }) });
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
      scores.push({ score: gatherScore * 0.3, action: () => ({ type: 'wander' }) });
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

  // Rest (lowest priority)
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
): AIContext {
  const village = entity.tribe >= 0 ? villages.find(v => v.tribe === entity.tribe) : undefined;
  const inVillage = !!village && (
    Math.abs(entity.position.x - village.center.x) + Math.abs(entity.position.y - village.center.y) <= village.radius
  );

  const sense = 3 + entity.traits.perception * 2;

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
    if (!p.mature) continue;
    const d = Math.abs(p.position.x - entity.position.x) + Math.abs(p.position.y - entity.position.y);
    if (d > 0 && d <= sense && (!nearestPlant || d < nearestPlant.dist)) {
      nearestPlant = { pos: p.position, dist: d };
    }
  }

  // Find nearest forest tile
  let nearestForest: AIContext['nearestForest'];
  const forestRange = sense * 2;
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

  return { entity, village, inVillage, nearestAnimal, nearestPlant, nearestForest, hasPartnerInVillage };
}
