import { createWorld, tick, ageInYears } from './world';
import { buildAIContext, getScores, decideAction } from './utility-ai';
import { TICKS_PER_YEAR, TICKS_PER_DAY } from './types';

const TICKS = parseInt(process.argv[2] || '100');
const VILLAGES = parseInt(process.argv[3] || '1');
const ENTITIES = parseInt(process.argv[4] || '2');

let world = createWorld({ gridSize: 50, entityCount: ENTITIES, villageCount: VILLAGES });

console.log(`=== HEADLESS SIM: ${TICKS} ticks, ${VILLAGES} village(s), ${ENTITIES} entities ===\n`);

for (let t = 0; t < TICKS; t++) {
  world = tick(world);

  const day = Math.floor(world.tick / TICKS_PER_DAY);
  const year = Math.floor(world.tick / TICKS_PER_YEAR);

  // Log every 10 ticks (every day)
  if (world.tick % TICKS_PER_DAY === 0 || world.entities.length === 0) {
    const males = world.entities.filter(e => e.gender === 'male');
    const females = world.entities.filter(e => e.gender === 'female');
    const v = world.villages[0];
    const pantry = v ? `meat=${v.meatStore} plant=${v.plantStore}` : 'no village';

    console.log(
      `Day ${day} (Y${year} T${world.tick}) | Pop: ${world.entities.length} (M${males.length} F${females.length}) | ${pantry} | Animals: ${world.animals.length} | Houses: ${world.houses.length}`
    );

    // Show what each entity is doing
    for (const e of world.entities) {
      const ctx = buildAIContext(e, world.villages, world.animals, world.trees, world.entities, world.biomes, world.gridSize, 0, world.houses);
      const scores = getScores(ctx);
      const action = decideAction(ctx);
      const topScore = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
      const a = e.activity;
      const actDesc = a.kind === 'idle' ? 'idle'
        : a.kind === 'moving' ? `moving/${a.purpose}(${a.pace})`
        : `working/${a.action}(${a.ticksLeft}t)`;
      console.log(
        `  ${e.id} ${e.gender === 'male' ? '♂' : '♀'} age=${ageInYears(e)} pos=(${e.position.x},${e.position.y}) ${actDesc} energy=${Math.round(e.energy)} home=${e.homeId ?? '-'} → ${action.type} [${topScore?.[0]}=${topScore?.[1].toFixed(2)}]`
      );
    }
    console.log('');
  }

  if (world.entities.length === 0) {
    console.log('*** EXTINCT ***');
    break;
  }
}

// Final summary
console.log('=== FINAL STATE ===');
console.log(`Tick: ${world.tick}, Year: ${Math.floor(world.tick / TICKS_PER_YEAR)}`);
console.log(`Population: ${world.entities.length}`);
console.log(`Animals: ${world.animals.length}, Fruit trees: ${world.trees.filter(t => t.fruiting).length}`);
console.log(`Houses: ${world.houses.length}`);
if (world.villages[0]) {
  console.log(`Pantry: meat=${world.villages[0].meatStore} plant=${world.villages[0].plantStore}`);
}
console.log(`Births: ${world.log.filter(l => l.type === 'birth').length}`);
console.log(`Deaths: ${world.log.filter(l => l.type === 'death').length}`);
const deaths = world.log.filter(l => l.type === 'death');
console.log(`  Old age: ${deaths.filter(d => d.cause === 'old_age').length}`);
console.log(`  Starvation: ${deaths.filter(d => d.cause === 'starvation').length}`);
console.log(`  Fight: ${deaths.filter(d => d.cause === 'fight').length}`);
