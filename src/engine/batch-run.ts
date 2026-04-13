import { createWorld, tick } from './world';
import { TICKS_PER_YEAR } from './types';

const RUNS = 20;
const MAX_TICKS = 48000; // 20 years
const GRID = 30;
const ENTITIES = 4;
const VILLAGES = 1;

interface RunResult {
  run: number;
  extinctTick: number | null;
  extinctYear: number | null;
  peakPop: number;
  births: number;
  deaths: { total: number; oldAge: number; starvation: number; fight: number; childbirth: number; noHome: number };
  houses: number;
  finalPop: number;
  pregnant: number;
  timeline: string[];
}

const results: RunResult[] = [];

for (let r = 0; r < RUNS; r++) {
  let world = createWorld({ gridSize: GRID, entityCount: ENTITIES, villageCount: VILLAGES });
  let peakPop = ENTITIES;
  const timeline: string[] = [];
  let lastLogYear = -1;

  for (let t = 0; t < MAX_TICKS; t++) {
    world = tick(world);
    if (world.entities.length > peakPop) peakPop = world.entities.length;

    const year = Math.floor(world.tick / TICKS_PER_YEAR);
    if (year !== lastLogYear) {
      lastLogYear = year;
      const m = world.entities.filter(e => e.gender === 'male').length;
      const f = world.entities.filter(e => e.gender === 'female').length;
      const preg = world.entities.filter(e => e.pregnancyTimer > 0).length;
      const v = world.villages[0];
      timeline.push(`Y${year}: pop=${world.entities.length}(M${m}F${f}) preg=${preg} houses=${world.houses.length} meat=${v?.meatStore ?? 0} plant=${v?.plantStore ?? 0} cooked=${(v?.cookedMeatStore ?? 0)+(v?.driedFruitStore ?? 0)} wood=${v?.woodStore ?? 0} animals=${world.animals.length}`);
    }

    if (world.entities.length === 0) break;
  }

  const log = world.log;
  const deaths = log.filter(l => l.type === 'death');
  const births = log.filter(l => l.type === 'birth');
  const starvDeaths = deaths.filter(d => d.cause === 'starvation');
  // Separate no-home baby deaths (starvation at age 0) from real starvation
  const noHomeBabyDeaths = starvDeaths.filter(d => d.age === 0).length;
  const realStarvation = starvDeaths.length - noHomeBabyDeaths;

  results.push({
    run: r + 1,
    extinctTick: world.entities.length === 0 ? world.tick : null,
    extinctYear: world.entities.length === 0 ? Math.floor(world.tick / TICKS_PER_YEAR) : null,
    peakPop,
    births: births.length,
    deaths: {
      total: deaths.length,
      oldAge: deaths.filter(d => d.cause === 'old_age').length,
      starvation: realStarvation,
      fight: deaths.filter(d => d.cause === 'fight').length,
      childbirth: deaths.filter(d => d.cause === 'childbirth').length,
      noHome: noHomeBabyDeaths,
    },
    houses: world.houses.length,
    finalPop: world.entities.length,
    pregnant: world.entities.filter(e => e.pregnancyTimer > 0).length,
    timeline,
  });
}

// Summary
console.log(`=== BATCH RESULTS (${RUNS} runs, ${GRID}x${GRID}, 1 village, ${ENTITIES} adults, 20 years max) ===\n`);

for (const r of results) {
  const status = r.extinctTick ? `EXTINCT Y${r.extinctYear} (tick ${r.extinctTick})` : `ALIVE pop=${r.finalPop}`;
  console.log(`Run ${r.run}: ${status} | peak=${r.peakPop} | births=${r.births} | deaths=${r.deaths.total} (age=${r.deaths.oldAge} starv=${r.deaths.starvation} fight=${r.deaths.fight} birth=${r.deaths.childbirth} noHome=${r.deaths.noHome}) | houses=${r.houses}`);
}

console.log('\n=== TIMELINES ===\n');
for (const r of results) {
  console.log(`--- Run ${r.run} ---`);
  for (const line of r.timeline) {
    console.log(`  ${line}`);
  }
  console.log('');
}

const extinct = results.filter(r => r.extinctTick !== null);
const alive = results.filter(r => r.extinctTick === null);
console.log(`\n=== SUMMARY ===`);
console.log(`Extinct: ${extinct.length}/${RUNS}`);
if (extinct.length > 0) {
  const avgExtinctYear = extinct.reduce((s, r) => s + (r.extinctYear ?? 0), 0) / extinct.length;
  console.log(`Avg extinction year: ${avgExtinctYear.toFixed(1)}`);
}
if (alive.length > 0) {
  const avgPop = alive.reduce((s, r) => s + r.finalPop, 0) / alive.length;
  console.log(`Avg surviving pop: ${avgPop.toFixed(1)}`);
}
const avgPeak = results.reduce((s, r) => s + r.peakPop, 0) / RUNS;
const avgBirths = results.reduce((s, r) => s + r.births, 0) / RUNS;
const avgNoHome = results.reduce((s, r) => s + r.deaths.noHome, 0) / RUNS;
const avgStarv = results.reduce((s, r) => s + r.deaths.starvation, 0) / RUNS;
console.log(`Avg peak pop: ${avgPeak.toFixed(1)}`);
console.log(`Avg births: ${avgBirths.toFixed(1)}`);
console.log(`Avg no-home baby deaths: ${avgNoHome.toFixed(1)}`);
console.log(`Avg starvation deaths: ${avgStarv.toFixed(1)}`);
