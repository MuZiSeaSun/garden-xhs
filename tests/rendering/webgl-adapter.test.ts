import { describe, it, expect } from 'vitest';
import { WebGLAdapter } from '../../src/rendering/adapters/webgl-adapter';

describe('WebGLAdapter', () => {
  it('requires WebGL capability', () => {
    const a = new WebGLAdapter();
    expect(a.name).toBe('webgl');
    expect(a.isSupported({ webgl: true } as never)).toBe(true);
    expect(a.isSupported({ webgl: false } as never)).toBe(false);
  });
});
