import { describe, it, expect } from 'vitest';
import { NullAdapter } from '../../src/rendering/adapters/null-adapter';

describe('NullAdapter', () => {
  it('is always supported and no-ops safely', async () => {
    const a = new NullAdapter();
    expect(a.name).toBe('null');
    await a.init({} as never);
    a.resize(1, 1, 1);
    a.setCamera({ position: [0, 0, 0], target: [0, 0, 0], up: [0, 1, 0], fov: 1, near: 0.1, far: 100 });
    a.syncWorld({ size: 0, blocks: new Uint8Array(0) });
    a.applyBlockDelta({ added: [], removed: [] });
    a.setTheme({ background: 0 });
    a.requestRender();
    expect(a.captureImage()).toBe('');
    expect(a.screenPointToRay(0, 0).direction).toEqual([0, 0, -1]);
    a.dispose();
  });
});
