import { describe, it, expect } from 'vitest';
import { PRESETS } from '../../src/core/presets';
import { BLOCK } from '../../src/core/block-types';

describe('PRESETS', () => {
  it('tree has a wood trunk and a leaf canopy', () => {
    expect(PRESETS.tree.blocks.some((b) => b.type === BLOCK.WOOD)).toBe(true);
    expect(PRESETS.tree.blocks.some((b) => b.type === BLOCK.LEAF)).toBe(true);
  });
  it('flowerBed is a 2x2 patch', () => {
    expect(PRESETS.flowerBed.blocks.length).toBe(4);
  });
  it('bush is a single block', () => {
    expect(PRESETS.bush.blocks.length).toBe(1);
  });
});
