import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/core/world';
import { BLOCK } from '../../src/core/block-types';
import { seedGround } from '../../src/core/terrain';
import { voxelRaycast } from '../../src/core/voxel-raycast';

describe('seedGround', () => {
  it('lays a grass floor at y=0 and leaves the sky empty', () => {
    const w = createWorld();
    seedGround(w);
    expect(w.getBlock(0, 0, 0)).toBe(BLOCK.GRASS);
    expect(w.getBlock(9, 0, 9)).toBe(BLOCK.GRASS);
    expect(w.getBlock(5, 1, 5)).toBe(BLOCK.AIR);
  });
  it('makes the fresh world immediately hittable by a downward ray', () => {
    const w = createWorld();
    seedGround(w);
    const hit = voxelRaycast([5.5, 5, 5.5], [0, -1, 0], w, 100);
    expect(hit).not.toBeNull();
    expect(hit?.y).toBe(0);
  });
});
