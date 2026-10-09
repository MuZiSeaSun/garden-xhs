import { describe, it, expect } from 'vitest';
import { ThreeAdapter } from '../../src/rendering/adapters/three-adapter';

describe('ThreeAdapter', () => {
  it('requires WebGL capability', () => {
    const a = new ThreeAdapter();
    expect(a.name).toBe('three');
    expect(a.isSupported({ webgl: true } as never)).toBe(true);
    expect(a.isSupported({ webgl: false } as never)).toBe(false);
  });

  it('exposes optional prop methods and no-ops them safely before init', () => {
    const a = new ThreeAdapter();
    expect(a.apiVersion).toBe(2);
    expect(typeof a.definePropModels).toBe('function');
    expect(typeof a.syncProps).toBe('function');
    expect(typeof a.applyPropDelta).toBe('function');
    a.definePropModels([]);
    a.syncProps([]);
    a.applyPropDelta({ added: [], removed: [] }); // init 前调用不得抛错
  });
});
