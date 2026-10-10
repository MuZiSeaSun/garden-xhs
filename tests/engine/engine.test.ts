// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEngine } from '../../src/engine/engine';
import { createEditorStore } from '../../src/engine/editor-store';
import { BLOCK } from '../../src/core/block-types';
import { RENDERER_API_VERSION, type Capabilities, type RendererAdapter } from '../../src/rendering/renderer-api';

vi.mock('../../src/rendering/renderer-factory', () => ({ createRenderer: vi.fn() }));
import { createRenderer } from '../../src/rendering/renderer-factory';

const CAPS: Capabilities = {
  webgl: false, webgl2: false, worker: false, offscreenCanvas: false,
  wasm: false, webgpu: false, miniTool: false,
};

function makeAdapter(name: string) {
  const setTheme = vi.fn();
  const adapter: RendererAdapter = {
    name,
    apiVersion: RENDERER_API_VERSION,
    isSupported: () => true,
    init: async () => {},
    dispose: () => {},
    resize: () => {},
    setCamera: () => {},
    syncWorld: () => {},
    applyBlockDelta: () => {},
    screenPointToRay: () => ({ origin: [0, 0, 0], direction: [0, 0, -1] }),
    setTheme,
    requestRender: () => {},
    captureImage: () => 'data:image/png;base64,',
    definePropModels: () => {},
    syncProps: () => {},
    applyPropDelta: () => {},
  };
  return { adapter, setTheme };
}

const makeCanvas = () => document.createElement('canvas');

beforeEach(() => {
  localStorage.clear();
  vi.mocked(createRenderer).mockReset();
});

describe('createEngine', () => {
  it('returns null when the factory resolves to the null adapter', async () => {
    vi.mocked(createRenderer).mockResolvedValue(makeAdapter('null').adapter);
    const engine = await createEngine({
      canvas: makeCanvas(), atlasCanvas: makeCanvas(),
      store: createEditorStore(), caps: CAPS, propModels: [],
    });
    expect(engine).toBeNull();
  });

  it('wires mode and selection through the store', async () => {
    const { adapter, setTheme } = makeAdapter('three');
    vi.mocked(createRenderer).mockResolvedValue(adapter);
    const store = createEditorStore();
    const engine = await createEngine({
      canvas: makeCanvas(), atlasCanvas: makeCanvas(), store, caps: CAPS, propModels: [],
    });
    expect(engine).not.toBeNull();

    engine!.setMode('terrain');
    expect(store.getState().mode).toBe('terrain');
    expect(setTheme).toHaveBeenCalledWith({ propOpacity: 0.4 });
    engine!.setMode('orbit');
    expect(setTheme).toHaveBeenLastCalledWith({ propOpacity: 1 });

    engine!.selectBlock(BLOCK.STONE);
    expect(store.getState().currentBlockType).toBe(BLOCK.STONE);
    expect(store.getState().terrainAction).toBe('place');

    engine!.selectTerrainRemove();
    expect(store.getState().terrainAction).toBe('remove');

    engine!.selectProp(2);
    expect(store.getState().currentPropModelId).toBe(2);
    expect(store.getState().itemAction).toBe('place');

    engine!.selectItemRemove();
    expect(store.getState().itemAction).toBe('remove');
  });

  it('applies lighting through the renderer and store', async () => {
    const { adapter, setTheme } = makeAdapter('three');
    vi.mocked(createRenderer).mockResolvedValue(adapter);
    const store = createEditorStore();
    const engine = await createEngine({
      canvas: makeCanvas(), atlasCanvas: makeCanvas(), store, caps: CAPS, propModels: [],
    });

    engine!.setAmbient(1.1);
    expect(store.getState().ambient).toBe(1.1);
    expect(setTheme).toHaveBeenLastCalledWith({ ambient: 1.1 });

    engine!.setDirectional(0.3);
    expect(store.getState().directional).toBe(0.3);

    engine!.setTemperature(7000);
    expect(store.getState().temperature).toBe(7000);

    const dir: [number, number, number] = [0.2, 1, 0.4];
    engine!.setLightDir(dir);
    expect(store.getState().lightDir).toBe(dir);
  });

  it('seeds viewTheta from the camera on init', async () => {
    const { adapter } = makeAdapter('three');
    vi.mocked(createRenderer).mockResolvedValue(adapter);
    const store = createEditorStore();
    await createEngine({
      canvas: makeCanvas(), atlasCanvas: makeCanvas(), store, caps: CAPS, propModels: [],
    });
    expect(store.getState().viewTheta).toBeCloseTo(Math.PI * 0.25, 8);
  });
});
