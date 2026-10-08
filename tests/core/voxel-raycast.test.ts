import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/core/world';
import { BLOCK } from '../../src/core/block-types';
import { voxelRaycast } from '../../src/core/voxel-raycast';

describe('voxelRaycast', () => {
  it('hits a block and reports the entry face normal', () => {
    const w = createWorld();
    w.setBlock(5, 0, 0, BLOCK.STONE);
    const hit = voxelRaycast([-1, 0.5, 0.5], [1, 0, 0], w, 100);
    expect(hit).not.toBeNull();
    expect([hit?.x, hit?.y, hit?.z]).toEqual([5, 0, 0]);
    expect([hit?.nx, hit?.ny, hit?.nz]).toEqual([-1, 0, 0]);
  });
  it('returns null when the ray never meets a block', () => {
    const w = createWorld();
    expect(voxelRaycast([-1, 0.5, 0.5], [0, 0, 1], w, 100)).toBeNull();
  });
  it('ignores blocks beyond maxDistance', () => {
    const w = createWorld();
    w.setBlock(9, 0, 0, BLOCK.STONE);
    expect(voxelRaycast([0, 0.5, 0.5], [1, 0, 0], w, 2)).toBeNull();
  });
});
