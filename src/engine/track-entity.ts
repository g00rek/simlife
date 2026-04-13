/**
 * Entity tracking script — follows ONE specific entity tick-by-tick and logs every
 * decision, movement, and action. Useful for debugging character mechanics.
 *
 * Usage:
 *   npx tsx src/engine/track-entity.ts                    # track first female, 5000 ticks
 *   npx tsx src/engine/track-entity.ts --gender=male      # track first male
 *   npx tsx src/engine/track-entity.ts --ticks=1000       # limit ticks
 *   npx tsx src/engine/track-entity.ts --id=e-123         # track specific entity id
 *
 * Output: readable log of the tracked entity's full history, including:
 *   - State transitions  (idle → hunting → idle)
 *   - Goal changes       (no goal → go_hunt → arrived → gather → ...)
 *   - Position changes   (moved 4,5 → 5,5)
 *   - AI scores          (at each decision point)
 *   - Eating / cooking / mating / death events
 */
import { createWorld, tick, ageInYears, isPregnant } from './world';
import type { Entity, WorldState } from './types';
import { TICKS_PER_YEAR, CHILD_AGE } from './types';
import { buildAIContext, getScores, decideAction } from './utility-ai';

// ── Parse CLI args ──────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const TARGET_GENDER: 'male' | 'female' | null = args.gender === 'male' || args.gender === 'female' ? args.gender : null;
const TARGET_ID: string | undefined = args.id as string | undefined;
const MAX_TICKS = Number(args.ticks ?? 5000);
const GRID = Number(args.grid ?? 30);
const ENTITIES = 4;

// ── Setup world ─────────────────────────────────────────────────────
let world: WorldState = createWorld({ gridSize: GRID, entityCount: ENTITIES, villageCount: 1 });

// Pick the target entity
let target: Entity | undefined;
if (TARGET_ID) {
  target = world.entities.find(e => e.id === TARGET_ID);
} else if (TARGET_GENDER) {
  target = world.entities.find(e => e.gender === TARGET_GENDER && ageInYears(e) >= CHILD_AGE);
} else {
  target = world.entities.find(e => e.gender === 'female' && ageInYears(e) >= CHILD_AGE)
        ?? world.entities[0];
}

if (!target) {
  console.error('No matching entity found.');
  process.exit(1);
}

const TRACKED_ID = target.id;
console.log(`━━━ TRACKING ${target.name} (${target.gender}, id=${target.id}, age=${ageInYears(target)}y, tribe=${target.tribe}) ━━━\n`);

// ── Helpers ─────────────────────────────────────────────────────────
function fmt(t: number): string {
  const year = Math.floor(t / TICKS_PER_YEAR);
  const day = Math.floor((t % TICKS_PER_YEAR) / 20);
  return `Y${year}D${day}`;
}
function posStr(e: Entity): string { return `(${e.position.x},${e.position.y})`; }
function briefActivity(e: Entity): string {
  const a = e.activity;
  if (a.kind === 'idle') return 'idle';
  if (a.kind === 'moving') return `${a.purpose}(${a.pace})→(${a.target.x},${a.target.y})`;
  return `${a.action}(${a.ticksLeft}t)`;
}
function briefCarrying(e: Entity): string {
  return e.carrying ? `${e.carrying.type}×${e.carrying.amount}` : '-';
}
function scoresBrief(scores: Record<string, number>): string {
  return Object.entries(scores)
    .filter(([, v]) => v > 0.001)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v.toFixed(2)}`)
    .join(' ');
}

// ── Track state across ticks ────────────────────────────────────────
let prev: Entity | undefined = target;
let prevScoresSig = '';
let prevDecision = '';
let lastLoggedTick = -1;

function logLine(reason: string, entity: Entity, extra = ''): void {
  const line = `${fmt(world.tick).padEnd(8)} ${posStr(entity).padEnd(7)} activity=${briefActivity(entity).padEnd(28)} e=${Math.round(entity.energy).toString().padStart(3)} carrying=${briefCarrying(entity).padEnd(10)} ${reason}${extra ? ' | ' + extra : ''}`;
  console.log(line);
  lastLoggedTick = world.tick;
}

// ── Main loop ───────────────────────────────────────────────────────
for (let i = 0; i < MAX_TICKS; i++) {
  world = tick(world);
  const curr = world.entities.find(e => e.id === TRACKED_ID);
  if (!curr) {
    console.log(`\n${fmt(world.tick).padEnd(8)} ☠ TARGET DIED at tick ${world.tick}`);
    // Find death event in log
    const deathLog = world.log.find(l => l.entityId === TRACKED_ID && l.type === 'death');
    if (deathLog) console.log(`    cause: ${deathLog.cause} ${deathLog.detail ?? ''}`);
    break;
  }

  // Log transitions: activity change, position change, carrying change, pregnancy change
  const changes: string[] = [];
  if (prev && briefActivity(prev) !== briefActivity(curr)) {
    changes.push(`activity ${briefActivity(prev)}→${briefActivity(curr)}`);
  }
  if (prev && (prev.position.x !== curr.position.x || prev.position.y !== curr.position.y)) {
    changes.push(`moved ${posStr(prev)}→${posStr(curr)}`);
  }
  if (prev && briefCarrying(prev) !== briefCarrying(curr)) changes.push(`carrying ${briefCarrying(prev)}→${briefCarrying(curr)}`);
  if (prev && isPregnant(prev) !== isPregnant(curr)) {
    changes.push(isPregnant(curr) ? `PREGNANT (${curr.pregnancyTimer}t)` : 'GAVE BIRTH');
  }
  // Log energy change only if big (>5 points since last log)
  if (prev && Math.abs((curr.energy - prev.energy)) >= 10) {
    changes.push(`energy ${Math.round(prev.energy)}→${Math.round(curr.energy)}`);
  }

  if (changes.length > 0) {
    // On significant change: also show AI scores + top decision
    const ctx = buildAIContext(curr, world.villages, world.animals, world.trees, world.entities, world.biomes, world.gridSize, world.tick, world.houses);
    const scores = getScores(ctx);
    const decision = decideAction(ctx).type;
    const sig = scoresBrief(scores);
    const scoresNote = (sig !== prevScoresSig || decision !== prevDecision)
      ? ` [decision:${decision}] scores:{${sig}}`
      : '';
    prevScoresSig = sig;
    prevDecision = decision;
    logLine(changes.join(', '), curr, scoresNote);
  }

  // Periodic heartbeat every 500 ticks (~25 days) if no changes for a while
  if (world.tick - lastLoggedTick > 500) {
    const ctx = buildAIContext(curr, world.villages, world.animals, world.trees, world.entities, world.biomes, world.gridSize, world.tick, world.houses);
    logLine('[heartbeat]', curr, `decision:${decideAction(ctx).type}`);
  }

  // Periodic village snapshot every 200 ticks
  if (world.tick % 200 === 0) {
    const v = world.villages[curr.tribe];
    if (v) {
      const males = world.entities.filter(e => e.tribe === curr.tribe && e.gender === 'male' && ageInYears(e) >= CHILD_AGE);
      const malesByAction = new Map<string, number>();
      for (const m of males) {
        const ctx = buildAIContext(m, world.villages, world.animals, world.trees, world.entities, world.biomes, world.gridSize, world.tick, world.houses);
        const a = decideAction(ctx).type;
        malesByAction.set(a, (malesByAction.get(a) ?? 0) + 1);
      }
      const malesSummary = [...malesByAction.entries()].map(([a, n]) => `${a}×${n}`).join(' ');
      console.log(`${fmt(world.tick).padEnd(8)} [VILLAGE] meat=${v.meatStore} plant=${v.plantStore} cooked=${v.cookedMeatStore + v.driedFruitStore} wood=${v.woodStore} | animals=${world.animals.length} | pop=${world.entities.filter(e => e.tribe === curr.tribe).length} | males:{${malesSummary}}`);
    }
  }

  prev = curr;
}

console.log(`\n━━━ End of trace. Total ticks: ${world.tick}. ${world.entities.find(e => e.id === TRACKED_ID) ? 'ALIVE' : 'DEAD'} ━━━`);
