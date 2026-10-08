import { describe, it, expect } from 'vitest';
import { ThreeAdapter } from '../../src/rendering/adapters/three-adapter';

describe('ThreeAdapter', () => {
  it('requires WebGL capability', () => {
    const a = new ThreeAdapter();
    expect(a.name).toBe('three');
    expect(a.isSupported({ webgl: true } as never)).toBe(true);
    expect(a.isSupported({ webgl: false } as never)).toBe(false);
  });
});
