import { describe, it, expect } from 'vitest';
import { configureAtlasTexture } from '../../src/rendering/adapters/three-adapter';

describe('configureAtlasTexture', () => {
  it('disables vertical flip so atlas row 0 maps to v=0 (matches atlasUV and the WebGL adapter)', () => {
    const tex = { magFilter: 0, minFilter: 0, generateMipmaps: true, wrapS: 0, wrapT: 0, flipY: true };
    configureAtlasTexture(tex);
    expect(tex.flipY).toBe(false);
    expect(tex.generateMipmaps).toBe(false);
  });
});
