// tests/core/prop-mesh-builder.test.ts
import { describe, it, expect } from 'vitest';
import type { PropModelData, PropInstance } from '../../src/core/prop-types';
import { buildPropBatch, propTriangleCount } from '../../src/core/prop-mesh-builder';

const M: PropModelData = {
  name: 'm', icon: '',
  positions: new Float32Array([0, 0, 0, 0.5, 0, 0, 0, 0, 0.5]), // 单面三角
  normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
  colors: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
  alpha: new Float32Array([1, 1, 1]),
  indices: new Uint16Array([0, 1, 2]),
  footprint: 1, height: 1,
};
const inst = (id: number, x: number, y: number, z: number, rot: 0 | 1 | 2 | 3 = 0): PropInstance =>
  ({ id, modelId: 0, x, y, z, rot });

describe('buildPropBatch', () => {
  it('translates instances to cell centers and lifts the base off the floor plane', () => {
    const b = buildPropBatch([M], [inst(1, 2, 3, 4)], 0);
    // 格中心 (x+0.5, y, z+0.5)，底面 +0.001 防 z-fighting
    expect(Array.from(b.positions)).toEqual(Array.from(new Float32Array([2.5, 3.001, 4.5, 3, 3.001, 4.5, 2.5, 3.001, 5])));
    expect(Array.from(b.normals)).toEqual([0, 1, 0, 0, 1, 0, 0, 1, 0]);
    expect(Array.from(b.colors)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(Array.from(b.indices)).toEqual([0, 1, 2]);
  });

  it('merges multiple instances with Uint32 offset re-indexing', () => {
    const b = buildPropBatch([M], [inst(1, 0, 0, 0), inst(2, 2, 0, 1)], 0);
    expect(b.positions.length).toBe(18);
    expect(Array.from(b.indices)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(b.indices instanceof Uint32Array).toBe(true);
  });

  it('rotates vertices and normals 90 degrees per rot step around Y', () => {
    // M 顶点 A(0,0,0) B(0.5,0,0) C(0,0,0.5)；rot=1 → (x,z)=(z,-x)，格 (2,3,4) 中心 (2.5,·,4.5)
    const b = buildPropBatch([M], [inst(1, 2, 3, 4, 1)], 0);
    expect(Array.from(b.positions)).toEqual(Array.from(new Float32Array([2.5, 3.001, 4.5, 2.5, 3.001, 4, 3, 3.001, 4.5])));
    const m2: PropModelData = { ...M, normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]) };
    const b2 = buildPropBatch([m2], [inst(1, 0, 0, 0, 1)], 0);
    expect(Array.from(b2.normals)).toEqual([1, 0, 0, 1, 0, 0, 1, 0, 0]); // (0,0,1) → (1,0,0)
  });

  it('centers footprint-2 models on the 2x2 area', () => {
    const m2: PropModelData = { ...M, footprint: 2 };
    const b = buildPropBatch([m2], [inst(1, 0, 0, 0)], 0);
    expect(Array.from(b.positions.slice(0, 3))).toEqual(Array.from(new Float32Array([1, 0.001, 1]))); // 中心 = 0 + footprint/2
  });

  it('returns zero-length arrays for empty instances', () => {
    const b = buildPropBatch([M], [], 0);
    expect(b.positions.length).toBe(0);
    expect(b.indices.length).toBe(0);
  });
});

describe('propTriangleCount', () => {
  it('sums per-instance triangle counts', () => {
    const m2: PropModelData = { ...M, indices: new Uint16Array([0, 1, 2, 3, 4, 5]) }; // 2 tris
    const total = propTriangleCount([M, m2], [
      inst(1, 0, 0, 0), inst(2, 1, 0, 0),
      { id: 3, modelId: 1, x: 0, y: 0, z: 1, rot: 0 },
    ]);
    expect(total).toBe(4); // 模型0×2 + 模型1×1 = 1+1+2
  });
});
