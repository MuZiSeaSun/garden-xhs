import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/core/world';
import { BLOCK } from '../../src/core/block-types';
import { createPropWorld } from '../../src/core/prop-world';
import { itemFootprintSupported, terrainPlaceTarget } from '../../src/core/placement';
import type { PropModelData } from '../../src/core/prop-types';

function model(height: number, supportsItems = false): PropModelData {
  return {
    name: 'm', icon: '', positions: new Float32Array(0), normals: new Float32Array(0),
    colors: new Float32Array(0), alpha: new Float32Array(0), indices: new Uint16Array(0), footprint: 1, height,
    supportsItems,
  };
}

describe('itemFootprintSupported', () => {
  it('allows an item on terrain and refuses air or a plain item top', () => {
    const world = createWorld();
    world.setBlock(1, 0, 1, BLOCK.GRASS);
    const models = [model(2, false), model(1, true)];
    const props = createPropWorld(models);
    props.add(2, 1, 2, 0);
    props.add(3, 1, 3, 1);
    const getBlock = (x: number, y: number, z: number) => world.getBlock(x, y, z);
    const propAt = (x: number, y: number, z: number) => props.propAt(x, y, z);

    expect(itemFootprintSupported(1, 1, 1, 1, getBlock, propAt, models)).toBe(true);
    expect(itemFootprintSupported(0, 1, 0, 1, getBlock, propAt, models)).toBe(false);
    expect(itemFootprintSupported(2, 3, 2, 1, getBlock, propAt, models)).toBe(false);
    expect(itemFootprintSupported(2, 2, 2, 1, getBlock, propAt, models)).toBe(false);
    expect(itemFootprintSupported(3, 2, 3, 1, getBlock, propAt, models)).toBe(true);
  });
});

describe('terrainPlaceTarget', () => {
  it('places beside a terrain hit and ignores an item hit', () => {
    expect(terrainPlaceTarget({ kind: 'block', x: 1, y: 0, z: 1, nx: 0, ny: 1, nz: 0 }))
      .toEqual({ x: 1, y: 1, z: 1 });
    expect(terrainPlaceTarget({ kind: 'prop', x: 2, y: 2, z: 2, nx: 0, ny: 1, nz: 0 })).toBeNull();
    expect(terrainPlaceTarget({ kind: 'prop', x: 2, y: 1, z: 2, nx: 1, ny: 0, nz: 0 })).toBeNull();
  });
});
