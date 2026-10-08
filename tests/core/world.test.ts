import { describe, it, expect } from 'vitest';
import { createWorld, WORLD_SIZE } from '../../src/core/world';
import { BLOCK } from '../../src/core/block-types';

describe('world', () => {
  it('starts empty', () => {
    expect(createWorld().getBlock(0, 0, 0)).toBe(BLOCK.AIR);
  });
  it('sets and gets in bounds', () => {
    const w = createWorld();
    expect(w.setBlock(9, 9, 9, BLOCK.STONE)).toBe(true);
    expect(w.getBlock(9, 9, 9)).toBe(BLOCK.STONE);
  });
  it('rejects out-of-bounds set, reports AIR for out-of-bounds get', () => {
    const w = createWorld();
    expect(w.setBlock(10, 0, 0, BLOCK.STONE)).toBe(false);
    expect(w.setBlock(0, -1, 0, BLOCK.STONE)).toBe(false);
    expect(w.getBlock(10, 0, 0)).toBe(BLOCK.AIR);
  });
  it('snapshot is a copy, not a view', () => {
    const w = createWorld();
    w.setBlock(1, 2, 3, BLOCK.SOIL);
    const s = w.snapshot();
    s.blocks[1 + 2 * WORLD_SIZE + 3 * WORLD_SIZE * WORLD_SIZE] = BLOCK.AIR;
    expect(w.getBlock(1, 2, 3)).toBe(BLOCK.SOIL);
  });
  it('clear empties all blocks', () => {
    const w = createWorld();
    w.setBlock(0, 0, 0, BLOCK.STONE);
    w.clear();
    expect(w.getBlock(0, 0, 0)).toBe(BLOCK.AIR);
  });
});
