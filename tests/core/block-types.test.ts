import { describe, it, expect } from 'vitest';
import { BLOCK, BLOCK_DEFS } from '../../src/core/block-types';

describe('block-types', () => {
  it('AIR has no definition', () => {
    expect(BLOCK_DEFS[BLOCK.AIR]).toBeUndefined();
  });
  it('LEAF maps to atlas tile 8', () => {
    expect(BLOCK_DEFS[BLOCK.LEAF]?.atlas).toBe(8);
  });
  it('flowers are cross blocks', () => {
    expect(BLOCK_DEFS[BLOCK.FLOWER_RED]?.cross).toBe(true);
    expect(BLOCK_DEFS[BLOCK.FLOWER_YELLOW]?.cross).toBe(true);
  });
  it('water and leaf are non-opaque', () => {
    expect(BLOCK_DEFS[BLOCK.WATER]?.opaque).toBe(false);
    expect(BLOCK_DEFS[BLOCK.LEAF]?.opaque).toBe(false);
  });
});
