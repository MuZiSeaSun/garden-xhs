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
  it('does not let a cross block cull an adjacent solid face (flowers are non-occluding)', () => {
    const w = createWorld();
    w.setBlock(0, 0, 0, BLOCK.STONE);
    w.setBlock(0, 1, 0, BLOCK.FLOWER_RED);
    const m = buildVoxelMesh(w.snapshot());
    // stone keeps all 6 faces (24 verts) + flower 2 quads (8 verts) = 32
    expect(m.positions.length / 3).toBe(32);
  });
  it('applies ambient occlusion: a diagonal neighbour darkens the occluded face corners', () => {
    const w = createWorld();
    w.setBlock(0, 0, 0, BLOCK.STONE);
    w.setBlock(1, 1, 0, BLOCK.STONE);
    const m = buildVoxelMesh(w.snapshot());
    // A(0,0,0) +X face is the first 4 light values (FACES order starts with +X); its top
    // vertices (idx 2,3) are occluded by the diagonal block at (1,1,0)
    expect(m.lights[2]).toBeLessThan(0.8);
    expect(m.lights[3]).toBeLessThan(0.8);
    expect(m.lights[0]).toBeCloseTo(0.8, 5);
    expect(m.lights[1]).toBeCloseTo(0.8, 5);
  });
  it('has no AO on an isolated block (lights equal the per-face values)', () => {
    const m = meshWith(BLOCK.STONE);
    expect(Math.max(...Array.from(m.lights))).toBeCloseTo(1.0, 5);
    expect(Math.min(...Array.from(m.lights))).toBeCloseTo(0.5, 5);
  });
  it('maps LEAF (atlas 8) strictly inside column 8 (half-texel inset, no bleed)', () => {
    const m = meshWith(BLOCK.LEAF);
    const us = Array.from(m.uvs).filter((_, i) => i % 2 === 0);
    for (const u of us) {
      expect(u).toBeGreaterThan(8 / 16);
      expect(u).toBeLessThan(9 / 16);
    }
  });
});
