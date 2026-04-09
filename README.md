# Evoliso

A grid-based life & evolution simulator. Watch tribal societies hunt, gather, build homes, form families, and survive — or perish.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5273`

## What It Is

An idle/sandbox simulator where you observe autonomous entities living their lives on a procedurally generated map. Two rival villages start with 3 couples each. They hunt animals, gather berries, chop wood, build houses, pair up, have children, and fight enemy tribes.

No player input — just watch, click entities for details, and adjust speed.

## Features

### World
- 50x50 procedural map with biomes: plains, forest, mountain, water
- Day/night cycle (10 ticks day + 10 ticks night)
- Seasonal plant regrow (bushes fruit in summer)
- Animals roam, reproduce, and flee from hunters

### Villages & Houses
- Palisade-bordered villages with communal pantry (meat + plant storage)
- Males chop wood from forests and build houses inside the village
- Couples need a house before having children
- Village buffer zone keeps mountains away from settlements

### Life Cycle
- Entities are born, grow up (3 years childhood), pair up (age 12+), have children, age, and die (45-60 years)
- 30% infant mortality at birth
- Pregnancy lasts ~30 days with 90-day cooldown between births
- Pairing happens automatically between unattached adults in the same village
- Pregnancy triggers at night when paired couple has a house

### Economy
- Males hunt animals with bow (range 2 tiles, instant kill) — 8 meat portions per kill
- Females gather from berry bushes — 5 portions per bush, regrow each summer
- Pantry system: hunters/gatherers deposit to village storage, everyone eats from it
- Hunger kicks in after ~20 days without food, death after ~40 days

### Genetics & Traits
7 heritable traits with mutation:

| Trait | Range | Effect |
|-------|-------|--------|
| Strength | 1-10 | Fight outcomes, hunt speed |
| Speed | 1-3 | Tiles moved per tick |
| Perception | 1-5 | Detection range for food/resources |
| Metabolism | 0.5-2.0 | Energy drain efficiency |
| Aggression | 0-10 | Fight vs flee probability |
| Fertility | 0.5-2.0 | Pregnancy duration (trade-off: shorter life) |
| Twin chance | 0-0.5 | Multiple births probability |

3% chance of dramatic mutation (one trait pushed to extreme).

### Combat
- Inter-tribe males fight on neutral ground (non-lethal, -20 energy)
- Same-tribe males train when idle (+stats)
- Aggression trait determines fight/flee decision

### Behavior (Utility AI)
Each entity scores possible actions every tick and picks the highest:

**Males:** Survive > Build house > Hunt (if pantry low) > Stroll in village
**Females:** Survive > Gather (if pantry low) > Stroll in village
**Children:** Play inside village
**Night:** Everyone returns home

### Ronins
Mixed-tribe children become tribeless ronins who:
- Can traverse mountains
- Found new settlements (3+ ronins on mountain tile)
- Are attacked by everyone

## UI

- **Canvas** — main grid with biomes, houses, entities, animals, plants
- **Tracking lines** — dashed lines from hunters to prey, gatherers to bushes
- **Entity panel** — click any entity for full stats, AI debug scores
- **Stats** — population per tribe, time/season, pantry bars, activities
- **Population graph** — per-tribe population over time
- **Controls** — Play/Pause, Reset, Speed slider (up to 50 ticks/frame)

## Headless Testing

Run simulation without graphics:

```bash
npx tsx src/engine/headless.ts [ticks] [villages] [entities]
npx tsx src/engine/headless.ts 24000 1 6  # 10 years, 1 village, 3 pairs
```

## Extinction Logs

When civilization goes extinct, a log file is saved to `logs/civ-{timestamp}.txt` containing birth/death events and summary statistics.

## Tech Stack

- Vite + React 19 + TypeScript
- HTML Canvas 2D rendering
- Utility AI for entity behavior
- Procedural biome generation
- Vitest for testing

## Architecture

```
src/
  engine/
    types.ts        — All types, constants, interfaces
    world.ts        — createWorld(), tick(), game logic
    utility-ai.ts   — Utility AI scoring + decision system
    biomes.ts       — Procedural map generation
    movement.ts     — Basic movement helpers
    headless.ts     — CLI test runner
  ui/
    App.tsx          — Main layout, state, history
    GridCanvas.tsx   — Canvas rendering
    Stats.tsx        — Population, time, resources panels
    Controls.tsx     — Play/Pause/Reset, speed slider
    EntityPanel.tsx  — Clicked entity detail + AI debug
    PopGraph.tsx     — Multi-series line chart
    TraitAverages.tsx — Average traits panel
```

Engine is pure TypeScript with zero DOM/React dependencies — can run headless.

## License

MIT
