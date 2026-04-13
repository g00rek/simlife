/**
 * Headless animal-only simulation. Runs without UI/rendering, much faster.
 * Logs every tick's snapshot + events to NDJSON file for analysis.
 *
 * Usage:
 *   npx tsx src/engine/animals-sim.ts                 # 10000 ticks, default
 *   npx tsx src/engine/animals-sim.ts --ticks=50000   # longer
 *   npx tsx src/engine/animals-sim.ts --grid=50       # bigger map
 *   npx tsx src/engine/animals-sim.ts --sample=5      # snapshot every N ticks
 *
 * Output: /tmp/animals-log.ndjson + summary printed to stdout
 */
import { createWorld, tick } from './world';
import type { Animal, WorldState } from './types';
import { writeFileSync } from 'fs';

// ── CLI args ─────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const MAX_TICKS = Number(args.ticks ?? 10000);
const GRID = Number(args.grid ?? 30);
const SAMPLE_INTERVAL = Number(args.sample ?? 10);
const STUCK_THRESHOLD = 80;
const OUT_PATH = String(args.out ?? '/tmp/animals-log.ndjson');

// ── Helpers ──────────────────────────────────────────────────────────────
type LogLine =
  | { t: 'snap'; tick: number; a: Array<{ id: string; x: number; y: number; e: number; g: string; p: number }> }
  | { t: 'birth'; tick: number; id: string; x: number; y: number; gender: string }
  | { t: 'death'; tick: number; id: string }
  | { t: 'stuck'; tick: number; id: string; pos: string; ticks: number };

function snapshot(world: WorldState): LogLine {
  return {
    t: 'snap', tick: world.tick,
    a: world.animals.map(a => ({
      id: a.id,
      x: a.position.x, y: a.position.y,
      e: Math.round(a.energy), g: a.gender, p: a.panicTicks,
    })),
  };
}

function detectEvents(prev: Animal[], curr: Animal[], tickNum: number): LogLine[] {
  const out: LogLine[] = [];
  const prevById = new Map(prev.map(a => [a.id, a]));
  const currById = new Map(curr.map(a => [a.id, a]));
  for (const a of curr) {
    if (!prevById.has(a.id)) {
      out.push({ t: 'birth', tick: tickNum, id: a.id, x: a.position.x, y: a.position.y, gender: a.gender });
    }
  }
  for (const a of prev) {
    if (!currById.has(a.id)) out.push({ t: 'death', tick: tickNum, id: a.id });
  }
  return out;
}

// ── Run ──────────────────────────────────────────────────────────────────
console.log(`Running animals-only sim: ${MAX_TICKS} ticks, ${GRID}×${GRID} grid, sample every ${SAMPLE_INTERVAL} ticks`);
let world: WorldState = createWorld({ gridSize: GRID, entityCount: 0, villageCount: 1 });
world = { ...world, entities: [], villages: [], houses: [] };

const logLines: string[] = [];
const stuckTracker = new Map<string, { x: number; y: number; sinceTick: number; reported: boolean }>();
let prevAnimals = world.animals;

logLines.push(JSON.stringify(snapshot(world)));

const startTime = Date.now();
for (let i = 0; i < MAX_TICKS; i++) {
  world = tick(world);
  if (world.tick % SAMPLE_INTERVAL === 0) logLines.push(JSON.stringify(snapshot(world)));
  for (const ev of detectEvents(prevAnimals, world.animals, world.tick)) logLines.push(JSON.stringify(ev));
  // Stuck detection — flag only if the animal SHOULD be moving:
  // hungry (energy < 70) and not on grass = real bug, not a content grazer/rester.
  for (const a of world.animals) {
    const rec = stuckTracker.get(a.id);
    const onGrass = world.grass[a.position.y]?.[a.position.x] > 0;
    const hungry = a.energy < 70;
    if (!rec || rec.x !== a.position.x || rec.y !== a.position.y) {
      stuckTracker.set(a.id, { x: a.position.x, y: a.position.y, sinceTick: world.tick, reported: false });
    } else if (
      hungry && !onGrass && a.panicTicks === 0 && !rec.reported
      && world.tick - rec.sinceTick >= STUCK_THRESHOLD
    ) {
      logLines.push(JSON.stringify({ t: 'stuck', tick: world.tick, id: a.id, pos: `${a.position.x},${a.position.y}`, ticks: world.tick - rec.sinceTick, energy: Math.round(a.energy) }));
      rec.reported = true;
    }
  }
  const aliveIds = new Set(world.animals.map(a => a.id));
  for (const id of stuckTracker.keys()) if (!aliveIds.has(id)) stuckTracker.delete(id);
  prevAnimals = world.animals;
}
const elapsed = (Date.now() - startTime) / 1000;

writeFileSync(OUT_PATH, logLines.join('\n') + '\n');

// ── Summary ──────────────────────────────────────────────────────────────
const lines = logLines.map(l => JSON.parse(l) as LogLine);
const snaps = lines.filter(l => l.t === 'snap') as Extract<LogLine, { t: 'snap' }>[];
const births = lines.filter(l => l.t === 'birth').length;
const deaths = lines.filter(l => l.t === 'death').length;
const stuckEvents = lines.filter(l => l.t === 'stuck') as Extract<LogLine, { t: 'stuck' }>[];

const popOverTime = snaps.map(s => s.a.length);
const minPop = Math.min(...popOverTime);
const maxPop = Math.max(...popOverTime);
const avgPop = Math.round(popOverTime.reduce((s, n) => s + n, 0) / popOverTime.length);
const finalPop = world.animals.length;

console.log(`\n=== SUMMARY (${elapsed.toFixed(1)}s real time) ===`);
console.log(`Sim time: ${MAX_TICKS} ticks (${(MAX_TICKS / 2400).toFixed(1)} game-years)`);
console.log(`Output: ${OUT_PATH} (${(logLines.join('\n').length / 1024).toFixed(1)} KB, ${logLines.length} lines)`);
console.log();
console.log(`Population: min=${minPop} max=${maxPop} avg=${avgPop} final=${finalPop}`);
console.log(`Births: ${births}  Deaths: ${deaths}`);
console.log(`Stuck events: ${stuckEvents.length}`);
if (stuckEvents.length > 0) {
  // group stuck by animal
  const byAnimal = new Map<string, number>();
  for (const e of stuckEvents) byAnimal.set(e.id, (byAnimal.get(e.id) ?? 0) + 1);
  const top = [...byAnimal.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log('  Top stuck animals (id × times stuck >80 ticks):');
  for (const [id, n] of top) console.log(`    ${id}: ${n}× stuck`);
}

// Final herd snapshot (single herd — centroid is the center of mass)
if (world.animals.length > 0) {
  const males = world.animals.filter(a => a.gender === 'male').length;
  const females = world.animals.filter(a => a.gender === 'female').length;
  const avgE = Math.round(world.animals.reduce((s, a) => s + a.energy, 0) / world.animals.length);
  let sx = 0, sy = 0;
  for (const a of world.animals) { sx += a.position.x; sy += a.position.y; }
  const cx = Math.round(sx / world.animals.length);
  const cy = Math.round(sy / world.animals.length);
  console.log(`\nFinal herd: size=${world.animals.length} M${males}F${females} avgE=${avgE} centroid=(${cx},${cy})`);
} else {
  console.log(`\nFinal herd: extinct`);
}
