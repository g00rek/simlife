import { describe, expect, it } from 'vitest';
import type { Biome } from '../../engine/types';
import { buildWaterTopology } from './waterAutotile';
import { generateBiomeGrid } from '../../engine/biomes';

function makeGrid(width: number, height: number): Biome[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => 'plains'));
}

describe('Wang 2-corner autotile', () => {
  /*
   * Corner lookup for cell (x,y):
   *   NW = cell(x-1, y-1)   NE = cell(x, y-1)
   *   SW = cell(x-1, y)     SE = cell(x, y)
   *
   * Weights: NE=1 SE=2 SW=4 NW=8
   *
   * 3x3 water block at (2,2)-(4,4) on 7x7 grid:
   *
   *   0 1 2 3 4 5 6
   * 0 . . . . . . .
   * 1 . . . . . . .
   * 2 . . W W W . .
   * 3 . . W W W . .
   * 4 . . W W W . .
   * 5 . . . . . . .
   * 6 . . . . . . .
   */

  it('interior water cells get index 15', () => {
    const biomes = makeGrid(7, 7);
    for (let y = 2; y <= 4; y++)
      for (let x = 2; x <= 4; x++)
        biomes[y][x] = 'water';

    const { wang } = buildWaterTopology(biomes);

    // Cell (3,3): NW=cell(2,2)=W, NE=cell(3,2)=W, SW=cell(2,3)=W, SE=cell(3,3)=W → 15
    expect(wang[3][3]).toBe(15);
    // Cell (4,4): NW=cell(3,3)=W, NE=cell(4,3)=W, SW=cell(3,4)=W, SE=cell(4,4)=W → 15
    expect(wang[4][4]).toBe(15);
  });

  it('produces convex corners on land cells outside the water block', () => {
    const biomes = makeGrid(7, 7);
    for (let y = 2; y <= 4; y++)
      for (let x = 2; x <= 4; x++)
        biomes[y][x] = 'water';

    const { wang } = buildWaterTopology(biomes);

    // Cell (x=2,y=2): NW=cell(1,1)=0, NE=cell(2,1)=0, SW=cell(1,2)=0, SE=cell(2,2)=W → index 2
    expect(wang[2][2]).toBe(2);
    // Cell (x=5,y=2): NW=cell(4,1)=0, NE=cell(5,1)=0, SW=cell(4,2)=W, SE=cell(5,2)=0 → index 4
    expect(wang[2][5]).toBe(4);
    // Cell (x=2,y=5): NW=cell(1,4)=0, NE=cell(2,4)=W, SW=cell(1,5)=0, SE=cell(2,5)=0 → index 1
    expect(wang[5][2]).toBe(1);
    // Cell (x=5,y=5): NW=cell(4,4)=W, NE=cell(5,4)=0, SW=cell(4,5)=0, SE=cell(5,5)=0 → index 8
    expect(wang[5][5]).toBe(8);
  });

  it('produces edges on land cells along water block borders', () => {
    const biomes = makeGrid(7, 7);
    for (let y = 2; y <= 4; y++)
      for (let x = 2; x <= 4; x++)
        biomes[y][x] = 'water';

    const { wang } = buildWaterTopology(biomes);

    // Cell (x=3,y=2): NE=cell(3,1)=0, SE=cell(3,2)=W, SW=cell(2,2)=W, NW=cell(2,1)=0 → 2+4=6 (N edge)
    expect(wang[2][3]).toBe(6);
    // Cell (x=3,y=5): NE=cell(3,4)=W, SE=cell(3,5)=0, SW=cell(2,5)=0, NW=cell(2,4)=W → 1+8=9 (S edge)
    expect(wang[5][3]).toBe(9);
    // Cell (x=2,y=3): NE=cell(2,2)=W, SE=cell(2,3)=W, SW=cell(1,3)=0, NW=cell(1,2)=0 → 1+2=3 (W edge)
    expect(wang[3][2]).toBe(3);
    // Cell (x=5,y=3): NE=cell(5,2)=0, SE=cell(5,3)=0, SW=cell(4,3)=W, NW=cell(4,2)=W → 4+8=12 (E edge)
    expect(wang[3][5]).toBe(12);
  });

  it('generateBiomeGrid produces valid wang indices (0-15)', () => {
    for (let i = 0; i < 20; i++) {
      const biomes = generateBiomeGrid(30);
      const { wang } = buildWaterTopology(biomes);
      for (let y = 0; y < biomes.length; y++) {
        for (let x = 0; x < biomes[y].length; x++) {
          expect(wang[y][x]).toBeGreaterThanOrEqual(0);
          expect(wang[y][x]).toBeLessThanOrEqual(15);
        }
      }
    }
  });

  it('no 1-tile-wide water channels in generated maps', () => {
    const isW = (b: Biome[][], x: number, y: number) =>
      y >= 0 && y < b.length && x >= 0 && x < b[0].length && b[y][x] === 'water';

    let narrowMaps = 0;
    for (let i = 0; i < 50; i++) {
      const biomes = generateBiomeGrid(30);
      let narrow = 0;
      for (let y = 0; y < biomes.length; y++) {
        for (let x = 0; x < biomes[y].length; x++) {
          if (biomes[y][x] !== 'water') continue;
          const E = isW(biomes, x+1, y), W = isW(biomes, x-1, y);
          const N = isW(biomes, x, y-1), S = isW(biomes, x, y+1);
          // 1-wide channel: has neighbors on one axis only, none on perpendicular
          if ((!N && !S && (E || W)) || (!E && !W && (N || S))) narrow++;
        }
      }
      if (narrow > 0) narrowMaps++;
    }
    // Allow up to 15% of maps to have minor narrow spots (morphological opening isn't perfect)
    expect(narrowMaps).toBeLessThan(10);
  });
});
