// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { generateAtlas } from '../../src/assets/atlas-generator';

describe('generateAtlas', () => {
  it('creates a 512x512 canvas (16 columns x 32px tiles)', () => {
    const c = generateAtlas();
    expect(c.width).toBe(512);
    expect(c.height).toBe(512);
  });
});
