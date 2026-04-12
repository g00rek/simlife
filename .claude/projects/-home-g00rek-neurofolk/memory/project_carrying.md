---
name: project-carrying-system
description: Entities carry resources (meat, wood, stone, gold) — must bring back to village. Loot after combat.
type: project
---

Resource carrying system: entities physically carry items and must return to village to deposit.

**Current implementation:** Hunter kills → meat teleports to village store. Wood chopped → teleports.

**Target:** Entity has `carrying: { type: 'meat'|'wood'|'stone'|'gold', amount: number }`. After hunting/chopping, entity carries resource and must walk back. This:
- Makes hunters return to village → increases mating (near home)
- Creates risk: carrying entity is slower? can be robbed after combat
- Future: stone, gold as new resources
- Future: loot system after inter-tribe combat

**How to apply:** When implementing, entity with carrying should have return_home as high-priority goal. Deposit on arrival at stockpile/house.
