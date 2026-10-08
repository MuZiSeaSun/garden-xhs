import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/core/world';
import { BLOCK } from '../../src/core/block-types';
import { buildVoxelMesh } from '../../src/core/mesh-builder';

function meshWith(type: number, at: [number, number, number] = [0, 0, 0]) {
  const w = createWorld();
  w.setBlock(at[0], at[1], at[2], type as never);
  return buildVoxelMesh(w.snapshot());
}

describe('buildVoxelMesh', () => {
  it('emits 6 faces (24 verts / 36 indices) for a lone opaque block', () => {
    const m = meshWith(BLOCK.STONE);
    expect(m.positions.length / 3).toBe(24);
    expect(m.indices.length).toBe(36);
  });
  it('culls the shared faces of two opaque neighbours', () => {
    const w = createWorld();
    w.setBlock(0, 0, 0, BLOCK.STONE);
    w.setBlock(1, 0, 0, BLOCK.STONE);
    const m = buildVoxelMesh(w.snapshot());
    expect(m.positions.length / 3).toBe(40);
  });
  it('emits two quads for a cross block', () => {
    const m = meshWith(BLOCK.FLOWER_RED);
    expect(m.positions.length / 3).toBe(8);
    expect(m.indices.length).toBe(12);
  });
  it('maps LEAF (atlas 8) into column 8 of a 16-column atlas', () => {
    const m = meshWith(BLOCK.LEAF);
    const us = Array.from(m.uvs).filter((_, i) => i % 2 === 0);
    for (const u of us) {
      expect(u).toBeGreaterThanOrEqual(8 / 16);
      expect(u).toBeLessThanOrEqual(9 / 16);
    }
  });
});
