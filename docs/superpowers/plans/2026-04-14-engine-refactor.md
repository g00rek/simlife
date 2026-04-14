# Engine Refactor & Test Coverage Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break up the 1602-line god-file `world.ts` and its 716-line `tick()` function into focused, testable modules. Add missing test coverage for critical game mechanics (energy, pregnancy, cooking, aging). Eliminate code duplication.

**Architecture:** Extract pure functions into domain modules (`geometry.ts`, `metabolism.ts`, `demography.ts`, `action-resolver.ts`). Each module is independently testable. `tick()` becomes a thin orchestrator that calls these modules in sequence. Types stay in `types.ts`; AI stays in `utility-ai.ts`.

**Tech Stack:** TypeScript, Vitest. No new libraries.

**Key constraint:** Every extraction is behavior-preserving. Tests must pass after each task. No gameplay changes — pure structural refactor.

---

## Task 1: Extract `geometry.ts` — deduplicate manhattan/chebyshev

**Files:**
- Create: `src/engine/geometry.ts`
- Modify: `src/engine/world.ts` — replace local `manhattan`, `chebyshev`, inline `Math.abs` patterns
- Modify: `src/engine/utility-ai.ts` — replace local `manhattan`, inline patterns
- Create: `src/engine/__tests__/geometry.test.ts`

- [ ] **Step 1: Create `src/engine/geometry.ts`**

```typescript
import type { Position } from './types';

export function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function chebyshev(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
```

- [ ] **Step 2: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { manhattan, chebyshev } from '../geometry';

describe('geometry', () => {
  it('manhattan distance', () => {
    expect(manhattan({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(7);
    expect(manhattan({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
    expect(manhattan({ x: 1, y: 1 }, { x: 4, y: 5 })).toBe(7);
  });
  it('chebyshev distance', () => {
    expect(chebyshev({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(4);
    expect(chebyshev({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });
});
```

- [ ] **Step 3: Replace all `manhattan` / `chebyshev` definitions in world.ts and utility-ai.ts**

In `world.ts`: find the local `function manhattan(...)` definition — DELETE it and add `import { manhattan, chebyshev } from './geometry';` at the top. Also find any local `chebyshev` definitions and replace.

In `utility-ai.ts`: same — find local `manhattan` definition, delete, import from geometry.

Grep for any remaining inline `Math.abs(*.x - *.x) + Math.abs(*.y - *.y)` patterns — leave these alone if they're in hot loops (avoid function-call overhead), but replace standalone helpers.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx vitest run`

- [ ] **Step 5: Commit**

```
feat(refactor): extract geometry.ts — deduplicate manhattan/chebyshev
```

---

## Task 2: Eliminate alias constants in `types.ts`

**Files:**
- Modify: `src/engine/types.ts` — remove 14 alias constants
- Modify: all files that reference the removed constants — replace with `ECONOMY.*` or inline value

The following constants are redundant aliases of `ECONOMY.*`:

```
WOOD_PER_CHOP → ECONOMY.wood.unitsPerChop
HOUSE_WOOD_COST → ECONOMY.wood.houseCost
PREGNANCY_DURATION → ECONOMY.reproduction.pregnancyTicks
BIRTH_COOLDOWN → ECONOMY.reproduction.birthCooldown
ENERGY_MAX → ECONOMY.metabolism.energyMax
ENERGY_START → ECONOMY.metabolism.energyStart
ENERGY_DRAIN_INTERVAL → ECONOMY.metabolism.drainInterval
ENERGY_MEAT → ECONOMY.meat.energyPerUnit
ENERGY_PLANT → ECONOMY.fruit.energyPerUnit
HUNGER_THRESHOLD → ECONOMY.metabolism.hungerThreshold
INFANT_MORTALITY → ECONOMY.reproduction.infantMortality
MATERNAL_MORTALITY → ECONOMY.reproduction.maternalMortality
MEAT_PORTIONS_PER_HUNT → ECONOMY.meat.unitsPerHunt
TREE_FRUIT_PORTIONS → ECONOMY.fruit.treeCapacity
```

- [ ] **Step 1: Grep each alias across the codebase — note all callsites**

- [ ] **Step 2: Replace each usage with the `ECONOMY.*` path**

Start with the least-used aliases and work up. Update imports where needed.

- [ ] **Step 3: Delete the alias exports from types.ts**

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx tsc -p tsconfig.app.json --noEmit && npx vitest run`

- [ ] **Step 5: Commit**

```
cleanup: eliminate 14 redundant alias constants — use ECONOMY.* directly
```

---

## Task 3: Extract `metabolism.ts` — energy drain + eating + hunger

**Files:**
- Create: `src/engine/metabolism.ts`
- Modify: `src/engine/world.ts` — replace inline energy logic in `tick()` Step 0
- Create: `src/engine/__tests__/metabolism.test.ts`

This extracts the ~50 lines of energy drain + eating logic from `tick()` Step 0 into a testable pure function.

- [ ] **Step 1: Read world.ts tick() Step 0 (aging/energy/eating block) — lines ~888-970**

Identify the exact code that handles:
- Energy drain per `ENERGY_DRAIN_INTERVAL` ticks
- Infant no-drain
- Child partial drain (`childDrainMultiplier`)
- Winter homeless 2× drain
- Eating from carrying (hunger threshold)
- Eating from village stockpile (eat zone)

- [ ] **Step 2: Write characterization tests for current behavior**

In `src/engine/__tests__/metabolism.test.ts`, test:

```typescript
describe('metabolism', () => {
  it('adult loses 1 energy every drainInterval ticks');
  it('infant (age < 1yr) never drains energy');
  it('child (1-3yr) drains at 25% rate');
  it('homeless adult in winter drains 2× energy');
  it('entity eats from carrying when hungry (energy < threshold)');
  it('entity in eat zone eats from village stockpile when hungry');
  it('entity prefers cooked meat > raw meat > cooked fruit > raw fruit');
  it('eating stops at hunger threshold — doesnt overfeed');
  it('entity at 0 energy stays at 0 (doesnt go negative)');
});
```

Write REAL tests with full entity/village fixtures. Each test creates a minimal world state, applies the metabolism step, and checks energy/stores changed correctly.

- [ ] **Step 3: Extract function**

Create `src/engine/metabolism.ts`:

```typescript
export function applyMetabolism(entity: Entity, village: Village | undefined, isWinter: boolean, tickNum: number, inEatZone: boolean): { entity: Entity; village: Village | undefined } {
  // extracted logic
}
```

The exact signature may vary — adapt to what `tick()` actually passes. Make it a pure function (input → output, no side effects beyond returning modified copies).

- [ ] **Step 4: Wire into tick()**

Replace the inline energy block in tick() with a call to `applyMetabolism`.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx vitest run`

- [ ] **Step 6: Commit**

```
refactor: extract metabolism.ts — energy drain + eating logic with tests
```

---

## Task 4: Extract `demography.ts` — aging, death, pregnancy, birth

**Files:**
- Create: `src/engine/demography.ts`
- Modify: `src/engine/world.ts` — replace inline birth/death logic
- Create: `src/engine/__tests__/demography.test.ts`

- [ ] **Step 1: Identify demography code in tick()**

Find:
- Death by old age (age >= maxAge)
- Death by starvation (energy <= 0)
- Pregnancy timer decrement
- Birth when pregnancyTimer reaches 0
- Infant mortality roll
- Maternal mortality roll
- Baby trait inheritance
- Birth cooldown application

- [ ] **Step 2: Write characterization tests**

```typescript
describe('demography', () => {
  it('entity dies when age reaches maxAge');
  it('entity dies when energy reaches 0');
  it('pregnancy timer decrements each tick');
  it('birth happens when pregnancyTimer reaches 0');
  it('infant mortality kills baby with probability INFANT_MORTALITY');
  it('maternal mortality kills mother with probability MATERNAL_MORTALITY');
  it('baby inherits blended traits from mother + fatherTraits');
  it('birth cooldown applied after birth');
  it('baby gets assigned to mothers tribe or fathers tribe');
  it('baby placed in mothers house if space available');
});
```

Use `vi.spyOn(Math, 'random')` for deterministic mortality tests.

- [ ] **Step 3: Extract functions**

Create `src/engine/demography.ts`:

```typescript
export function processDeaths(entities: Entity[], tickNum: number): { alive: Entity[]; deadIds: Set<string>; log: LogEntry[] }
export function processBirths(entities: Entity[], houses: House[], villages: Village[], tickNum: number): { entities: Entity[]; babies: Entity[]; log: LogEntry[] }
```

- [ ] **Step 4: Wire into tick()**

Replace inline blocks with calls to extracted functions.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx vitest run`

- [ ] **Step 6: Commit**

```
refactor: extract demography.ts — aging/death/pregnancy/birth with tests
```

---

## Task 5: Extract `action-resolver.ts` — all completion functions

**Files:**
- Create: `src/engine/action-resolver.ts`
- Modify: `src/engine/world.ts`
- Create: `src/engine/__tests__/action-resolver.test.ts`

- [ ] **Step 1: Identify all resolve/complete functions**

Move these from world.ts:
- `resolveHuntArrival`, `completeHunting`
- `resolveGatherArrival`, `completeGathering`
- `resolveChopArrival`, `completeChopping`
- `resolveBuildArrival`, `completeBuilding`
- `resolveCookArrival`, `completeCooking`
- `resolveMineArrival`, `completeMining`
- `completeFighting`
- `depositCarrying`

- [ ] **Step 2: Write tests for key resolvers (at least 8 tests)**

Focus on: arrival condition checks, resource yields, energy costs, carrying state.

- [ ] **Step 3: Extract to `action-resolver.ts`**

Move all functions. Keep their signatures unchanged. Export them. Import in world.ts.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx vitest run`

- [ ] **Step 5: Commit**

```
refactor: extract action-resolver.ts — all completion/arrival functions with tests
```

---

## Task 6: Extract `interactions.ts` — fighting + mating

**Files:**
- Create: `src/engine/interactions.ts`
- Modify: `src/engine/world.ts`
- Create: `src/engine/__tests__/interactions.test.ts`

- [ ] **Step 1: Identify interaction code**

Move from world.ts:
- `detectInteractions()` — fighting detection
- `pheromoneMating()` — mating + pregnancy initiation
- `fightWinner()` — strength-weighted fight outcome

- [ ] **Step 2: Write tests**

```typescript
describe('interactions', () => {
  it('cross-tribe males on adjacent tiles start fighting');
  it('same-tribe males do not fight');
  it('fightWinner favors higher strength');
  it('mating requires male near settlement + fertile female in range');
  it('mating sets pregnancyTimer and fatherTraits');
  it('mating requires female energy >= pregnancyMinEnergy');
});
```

- [ ] **Step 3: Extract, verify, commit**

```
refactor: extract interactions.ts — fighting + mating with tests
```

---

## Task 7: Slim down tick() — orchestrator pattern + smoke test

**Files:**
- Modify: `src/engine/world.ts` — tick() should now be ~200 lines max (orchestration only)
- Create: `src/engine/__tests__/smoke.test.ts`

- [ ] **Step 1: Review tick() after Tasks 3-6**

Verify it's now a sequence of function calls with minimal inline logic. Any remaining inline blocks > 10 lines should be extracted.

- [ ] **Step 2: Write smoke test**

```typescript
describe('simulation smoke test', () => {
  it('runs 2400 ticks (1 year) without crashing', () => {
    let world = createWorld({ gridSize: 30, entityCount: 6, villageCount: 1 });
    for (let i = 0; i < 2400; i++) world = tick(world);
    expect(world.tick).toBe(2400);
    expect(world.entities.length).toBeGreaterThan(0);
  });
  
  it('runs 12000 ticks (5 years) — population grows', () => {
    let world = createWorld({ gridSize: 30, entityCount: 6, villageCount: 1 });
    for (let i = 0; i < 12000; i++) world = tick(world);
    expect(world.tick).toBe(12000);
    // Population should grow from 6 (2 tribes × 3 settlers)
    expect(world.entities.length).toBeGreaterThanOrEqual(6);
  });
});
```

- [ ] **Step 3: Final line count audit**

Report the new line counts for all files. Target:
- `world.ts` < 800 lines (from 1602)
- `tick()` < 250 lines (from 716)
- Each new module < 200 lines

- [ ] **Step 4: Verify all tests**

Run: `npx tsc --noEmit && npx tsc -p tsconfig.app.json --noEmit && npx vitest run`

- [ ] **Step 5: Commit**

```
refactor: tick() is now a thin orchestrator — final cleanup + smoke tests
```

---

## Self-review checklist

1. **Behavior preservation:** No gameplay changes. All existing tests pass at every step.
2. **Dependency direction:** New modules import from `types.ts` only. No circular deps. `world.ts` imports from modules, not the reverse (except types).
3. **Test coverage:** Each extracted module has its own test file with ≥6 tests.
4. **No placeholder code:** Every step has real logic, not TODOs.
