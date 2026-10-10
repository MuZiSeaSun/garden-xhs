import { describe, it, expect } from 'vitest';
import { BLOCK, BLOCK_DEFS, isTerrainBlock } from '../../src/core/block-types';

describe('block-types', () => {
  it('AIR has no definition', () => {
    expect(BLOCK_DEFS[BLOCK.AIR]).toBeUndefined();
  });
  it('LEAF maps to atlas tile 8 and is non-opaque', () => {
    expect(BLOCK_DEFS[BLOCK.LEAF]?.atlas).toBe(8);
    expect(BLOCK_DEFS[BLOCK.LEAF]?.opaque).toBe(false);
  });
  it('keeps only grass, soil, stone and leaf as terrain', () => {
    expect(isTerrainBlock(BLOCK.GRASS)).toBe(true);
    expect(isTerrainBlock(BLOCK.SOIL)).toBe(true);
    expect(isTerrainBlock(BLOCK.STONE)).toBe(true);
    expect(isTerrainBlock(BLOCK.LEAF)).toBe(true);
    expect(isTerrainBlock(BLOCK.WATER)).toBe(false);
    expect(isTerrainBlock(BLOCK.FLOWER_RED)).toBe(false);
    expect(isTerrainBlock(BLOCK.WOOD)).toBe(false);
    expect(BLOCK_DEFS[BLOCK.WATER]).toBeUndefined();
    expect(BLOCK_DEFS[BLOCK.FLOWER_RED]).toBeUndefined();
    expect(BLOCK_DEFS[BLOCK.BUSH]).toBeUndefined();
    expect(BLOCK_DEFS[BLOCK.WOOD]).toBeUndefined();
  });
});
