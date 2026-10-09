import { describe, it, expect } from 'vitest';
import { WebGLAdapter } from '../../src/rendering/adapters/webgl-adapter';

describe('WebGLAdapter', () => {
  it('requires WebGL capability', () => {
    const a = new WebGLAdapter();
    expect(a.name).toBe('webgl');
    expect(a.isSupported({ webgl: true } as never)).toBe(true);
    expect(a.isSupported({ webgl: false } as never)).toBe(false);
  });

  it('exposes optional prop methods and no-ops them safely before init', () => {
    const a = new WebGLAdapter();
    expect(a.apiVersion).toBe(2);
    expect(typeof a.definePropModels).toBe('function');
    expect(typeof a.syncProps).toBe('function');
    expect(typeof a.applyPropDelta).toBe('function');
    a.definePropModels([]);
    a.syncProps([]);
    a.applyPropDelta({ added: [], removed: [] }); // init 前调用不得抛错
  });
});
