// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createRenderer } from '../../src/rendering/renderer-factory';

const noCaps = {
  webgl: false, webgl2: false, worker: false, offscreenCanvas: false,
  wasm: false, webgpu: false, miniTool: false,
};

describe('createRenderer', () => {
  it('falls back to the null adapter when no WebGL is available', async () => {
    const canvas = document.createElement('canvas');
    const atlas = document.createElement('canvas');
    const r = await createRenderer({ canvas, atlasCanvas: atlas, devicePixelRatio: 1 }, noCaps);
    expect(r.name).toBe('null');
  });
  it('accepts a preferred adapter and still falls back safely when it cannot init', async () => {
    const canvas = document.createElement('canvas');
    const atlas = document.createElement('canvas');
    const r = await createRenderer({ canvas, atlasCanvas: atlas, devicePixelRatio: 1 }, noCaps, 'three');
    expect(r.name).toBe('null');
  });
  it('ignores an unknown preferred name', async () => {
    const canvas = document.createElement('canvas');
    const atlas = document.createElement('canvas');
    const r = await createRenderer({ canvas, atlasCanvas: atlas, devicePixelRatio: 1 }, noCaps, 'bogus');
    expect(r.name).toBe('null');
  });
});
