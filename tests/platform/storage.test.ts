// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { saveWorld, loadWorld } from '../../src/platform/storage';

function makePayload() {
  return { v: 1 as const, blocks: new Array(1000).fill(0), camera: { theta: 0, phi: 1, radius: 20 } };
}

function mockMiniTool(version: number) {
  const store: Record<string, string> = {};
  (window as unknown as { xhs: unknown }).xhs = {
    miniTool: {
      getLaunchOptions: async () => ({ miniToolEnv: { buildVersion: version } }),
      setStorage: async ({ key, data }: { key: string; data: string }) => { store[key] = data; },
      getStorage: async ({ key }: { key: string }) => ({ data: store[key] ?? null }),
    },
  };
  return store;
}

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as unknown as { xhs?: unknown }).xhs;
  });
  it('round-trips through Storage JS API on a new client', async () => {
    mockMiniTool(9462004);
    const p = makePayload();
    p.blocks[0] = 3;
    expect(await saveWorld(p)).toBe(true);
    expect((await loadWorld())?.blocks[0]).toBe(3);
  });
  it('falls back to localStorage on an old client', async () => {
    mockMiniTool(9450000);
    expect(await saveWorld(makePayload())).toBe(true);
    expect(localStorage.getItem('garden_world_v1')).toBeTruthy();
  });
  it('rejects payloads with out-of-range block ids', async () => {
    localStorage.setItem('garden_world_v1', JSON.stringify({ v: 1, blocks: [99], camera: { theta: 0, phi: 1, radius: 20 } }));
    expect(await loadWorld()).toBeNull();
  });
  it('rejects a payload with a missing or malformed camera', async () => {
    localStorage.setItem('garden_world_v1', JSON.stringify({ v: 1, blocks: [1, 2, 3] }));
    expect(await loadWorld()).toBeNull();
    localStorage.setItem('garden_world_v1', JSON.stringify({ v: 1, blocks: [1, 2, 3], camera: 'nope' }));
    expect(await loadWorld()).toBeNull();
  });
  it('returns null when nothing is stored', async () => {
    expect(await loadWorld()).toBeNull();
  });
});
