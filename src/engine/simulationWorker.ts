/// <reference lib="webworker" />

import { tick } from './world';
import type { WorldState } from './types';
import { RUNTIME_CONFIG } from './types';

interface HistoryPoint {
  pop: number[];
}

type WorkerRequest =
  | { type: 'setWorld'; world: WorldState; speed: number }
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'setSpeed'; speed: number }
  | { type: 'reset'; world: WorldState; speed: number }
  | { type: 'setRuntimeConfig'; config: Partial<typeof RUNTIME_CONFIG> }
  | { type: 'skip'; ticks: number };

type WorkerResponse =
  | { type: 'snapshot'; world: WorldState; samples: HistoryPoint[]; running: boolean };

const ctx = self as DedicatedWorkerGlobalScope;

const POP_SAMPLE_INTERVAL = 5;
const SNAPSHOT_INTERVAL_MS = 50;

let world: WorldState | null = null;
let running = false;
let speed = 300;
let scheduled = false;
let lastSnapshotAt = 0;
let pendingSamples: HistoryPoint[] = [];

function ticksPerSlice(currentSpeed: number): number {
  if (currentSpeed <= 0.1) return 500;
  if (currentSpeed <= 0.2) return 300;
  if (currentSpeed <= 0.5) return 150;
  if (currentSpeed <= 1) return 100;
  if (currentSpeed <= 2) return 50;
  if (currentSpeed <= 5) return 20;
  if (currentSpeed <= 10) return 10;
  if (currentSpeed <= 20) return 5;
  return 1;
}

function sliceDelay(currentSpeed: number): number {
  return currentSpeed <= 20 ? 0 : currentSpeed;
}

function populationSample(state: WorldState): HistoryPoint {
  return {
    pop: [0, 1, 2].map(tribe => state.entities.filter(entity => entity.tribe === tribe).length),
  };
}

function postSnapshot(state: WorldState) {
  const samples = pendingSamples;
  pendingSamples = [];
  ctx.postMessage({
    type: 'snapshot',
    world: state,
    samples,
    running,
  } satisfies WorkerResponse);
  lastSnapshotAt = performance.now();
}

function runSlice() {
  scheduled = false;
  if (!running || !world) return;

  const count = ticksPerSlice(speed);

  for (let i = 0; i < count; i++) {
    if (world.entities.length === 0) {
      running = false;
      break;
    }

    world = tick(world);
    if (world.tick % POP_SAMPLE_INTERVAL === 0) {
      pendingSamples.push(populationSample(world));
    }
  }

  if (!world) return;

  const shouldPost = !running || performance.now() - lastSnapshotAt >= SNAPSHOT_INTERVAL_MS;
  if (shouldPost) {
    postSnapshot(world);
  }

  schedule();
}

function schedule() {
  if (!running || scheduled) return;
  scheduled = true;
  setTimeout(runSlice, sliceDelay(speed));
}

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  switch (message.type) {
    case 'setWorld':
      world = message.world;
      speed = message.speed;
      running = false;
      pendingSamples = [];
      postSnapshot(world);
      break;
    case 'reset':
      world = message.world;
      speed = message.speed;
      running = false;
      scheduled = false;
      pendingSamples = [];
      postSnapshot(world);
      break;
    case 'start':
      running = true;
      schedule();
      break;
    case 'stop':
      running = false;
      if (world) postSnapshot(world);
      break;
    case 'setSpeed':
      speed = message.speed;
      schedule();
      break;
    case 'setRuntimeConfig':
      // Worker has its own RUNTIME_CONFIG instance — sync from main thread.
      Object.assign(RUNTIME_CONFIG, message.config);
      break;
    case 'skip':
      // Burst-compute N ticks at max speed. Population samples still collected for the
      // history chart. One snapshot at the end — no intermediate renders, no animation.
      if (!world) break;
      for (let i = 0; i < message.ticks; i++) {
        if (world.entities.length === 0) {
          running = false;
          break;
        }
        world = tick(world);
        if (world.tick % POP_SAMPLE_INTERVAL === 0) {
          pendingSamples.push(populationSample(world));
        }
      }
      if (world) postSnapshot(world);
      break;
  }
};
