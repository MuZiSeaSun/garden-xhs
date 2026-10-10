import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/core/world';
import { BLOCK } from '../../src/core/block-types';
import { createPropWorld } from '../../src/core/prop-world';
import type { PropModelData } from '../../src/core/prop-types';
import { pick, pickItem } from '../../src/core/pick';

const MODELS: PropModelData[] = [{
  name: 'tree', icon: '', positions: new Float32Array(0), normals: new Float32Array(0),
  colors: new Float32Array(0), alpha: new Float32Array(0), indices: new Uint16Array(0), footprint: 1, height: 2,
}];

describe('pick', () => {
  it('hits a prop standing in front of terrain, with entry-face normal', () => {
    const w = createWorld();
    w.setBlock(7, 0, 0, BLOCK.STONE);
    const pw = createPropWorld(MODELS);
    const inst = pw.add(3, 0, 0, 0);
    const hit = pick([-1, 0.5, 0.5], [1, 0, 0], w, pw, 100);
    expect(hit?.kind).toBe('prop');
    expect([hit?.x, hit?.y, hit?.z]).toEqual([3, 0, 0]);
    expect([hit?.nx, hit?.ny, hit?.nz]).toEqual([-1, 0, 0]);
    expect(hit?.prop).toBe(inst);
  });

  it('hits a block when it stands in front of a prop', () => {
    const w = createWorld();
    w.setBlock(5, 0, 0, BLOCK.STONE);
    const pw = createPropWorld(MODELS);
    pw.add(7, 0, 0, 0);
    const hit = pick([-1, 0.5, 0.5], [1, 0, 0], w, pw, 100);
    expect(hit?.kind).toBe('block');
    expect([hit?.x, hit?.y, hit?.z]).toEqual([5, 0, 0]);
  });

  it('a ray from above hits the tree canopy cell, not the ground behind it', () => {
    const w = createWorld();
    w.setBlock(3, 0, 0, BLOCK.GRASS); // 树脚下的地面
    const pw = createPropWorld(MODELS);
    pw.add(3, 0, 0, 0);               // 树占 (3,0,0) 与 (3,1,0)
    const hit = pick([3.5, 9.5, 0.5], [0, -1, 0], w, pw, 100);
    expect(hit?.kind).toBe('prop');
    expect([hit?.x, hit?.y, hit?.z]).toEqual([3, 1, 0]); // 树冠格
    expect([hit?.nx, hit?.ny, hit?.nz]).toEqual([0, 1, 0]);
  });

  it('ignores props and hits the terrain behind them', () => {
    const w = createWorld();
    w.setBlock(3, 0, 0, BLOCK.GRASS);
    const pw = createPropWorld(MODELS);
    pw.add(3, 0, 0, 0);
    const hit = pick([3.5, 9.5, 0.5], [0, -1, 0], w, pw, 100, true);
    expect(hit?.kind).toBe('block');
    expect([hit?.x, hit?.y, hit?.z]).toEqual([3, 0, 0]);
    expect([hit?.nx, hit?.ny, hit?.nz]).toEqual([0, 1, 0]);
  });

  it('returns null on an empty scene', () => {
    expect(pick([-1, 0.5, 0.5], [1, 0, 0], createWorld(), createPropWorld(MODELS), 100)).toBeNull();
  });
});

function wall(alpha: number): PropModelData {
  return {
    name: 'wall', icon: '',
    positions: new Float32Array([-0.3, 0, -0.4, -0.3, 1, -0.4, -0.3, 0.5, 0.4]),
    normals: new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0]),
    colors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1]),
    alpha: new Float32Array([alpha, alpha, alpha]),
    indices: new Uint16Array([0, 1, 2]),
    footprint: 1, height: 1,
  };
}

describe('pickItem', () => {
  it('hits an opaque triangle in front of terrain', () => {
    const w = createWorld();
    w.setBlock(5, 0, 0, BLOCK.STONE);
    const models = [wall(1)];
    const pw = createPropWorld(models);
    const inst = pw.add(3, 0, 0, 0);
    const hit = pickItem([-1, 0.5, 0.5], [1, 0, 0], w, pw, models, 100);
    expect(hit?.kind).toBe('prop');
    expect([hit?.x, hit?.y, hit?.z]).toEqual([3, 0, 0]);
    expect([hit?.nx, hit?.ny, hit?.nz]).toEqual([-1, 0, 0]);
    expect(hit?.prop).toBe(inst);
  });

  it('passes through a transparent face and hits the terrain behind', () => {
    const w = createWorld();
    w.setBlock(5, 0, 0, BLOCK.STONE);
    const models = [wall(0)];
    const pw = createPropWorld(models);
    pw.add(3, 0, 0, 0);
    const hit = pickItem([-1, 0.5, 0.5], [1, 0, 0], w, pw, models, 100);
    expect(hit?.kind).toBe('block');
    expect([hit?.x, hit?.y, hit?.z]).toEqual([5, 0, 0]);
  });
});
