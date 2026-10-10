import { createRenderer } from '../rendering/renderer-factory';
import { createWorld, WORLD_SIZE } from '../core/world';
import { seedGround } from '../core/terrain';
import {
  createCameraOrbit, toRendererCameraState, orbit, yaw, tilt, pan, zoom,
  fitViewport, setDistance,
} from '../core/camera-state';
import { loadWorld, saveWorld, type SavePayload } from '../platform/storage';
import { saveToAlbum, shareAsNote } from '../platform/share';
import { bindGestures } from '../input/gesture';
import { createPropWorld } from '../core/prop-world';
import { pick, pickItem, type PickHit } from '../core/pick';
import { propTriangleCount } from '../core/prop-mesh-builder';
import { createHistory } from '../core/history';
import { BLOCK, isTerrainBlock, type BlockId } from '../core/block-types';
import { itemFootprintSupported, terrainPlaceTarget } from '../core/placement';
import type { RendererAdapter, BlockDelta, Capabilities } from '../rendering/renderer-api';
import type { PropModelData } from '../core/prop-types';
import type { EditorMode, EditorStore } from './editor-store';

export interface Engine {
  setMode(mode: EditorMode): void;
  selectBlock(type: BlockId): void;
  selectTerrainRemove(): void;
  selectProp(modelId: number): void;
  selectItemRemove(): void;
  undo(): void;
  reset(): void;
  saveToAlbum(): void;
  shareNote(): void;
  setPerspective(distance: number): void;
  switchAdapter(name: string): void;
  setAmbient(value: number): void;
  setDirectional(value: number): void;
  setLightDir(dir: readonly [number, number, number]): void;
  setTemperature(kelvin: number): void;
}

export interface EngineOptions {
  readonly canvas: HTMLCanvasElement;
  readonly atlasCanvas: HTMLCanvasElement;
  readonly store: EditorStore;
  readonly caps: Capabilities;
  readonly propModels: readonly PropModelData[];
}

export async function createEngine(opts: EngineOptions): Promise<Engine | null> {
  const { atlasCanvas, store, caps, propModels } = opts;
  let canvas = opts.canvas;
  const world = createWorld();
  const camera = createCameraOrbit();
  const history = createHistory();
  const propWorld = createPropWorld(propModels);
  const PROP_TRIANGLE_BUDGET = 90_000;
  let userZoomed = false;

  let renderer: RendererAdapter;
  try {
    renderer = await createRenderer({
      canvas, atlasCanvas,
      devicePixelRatio: window.devicePixelRatio || 1,
    }, caps);
  } catch {
    return null;
  }
  if (renderer.name === 'null') return null;

  const initial = store.getState();
  renderer.setTheme({ ambient: initial.ambient, directional: initial.directional, lightDir: initial.lightDir });

  seedGround(world);
  fitViewport(camera, canvas.clientWidth / canvas.clientHeight);
  renderer.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
  renderer.syncWorld(world.snapshot());
  renderer.setCamera(toRendererCameraState(camera));
  renderer.definePropModels?.(propModels);

  const saved = await loadWorld();
  if (saved && saved.blocks.length === WORLD_SIZE ** 3) {
    for (let i = 0; i < saved.blocks.length; i++) {
      const b = saved.blocks[i];
      world.blocks[i] = isTerrainBlock(b) ? b : BLOCK.AIR;
    }
    camera.theta = saved.camera.theta;
    camera.phi = saved.camera.phi;
    camera.radius = saved.camera.radius;
    if (saved.v === 2) {
      for (const p of saved.props) propWorld.add(p.x, p.y, p.z, p.modelId);
    }
    renderer.syncWorld(world.snapshot());
    renderer.setCamera(toRendererCameraState(camera));
  }
  renderer.syncProps?.(propWorld.list());
  store.setState({ viewTheta: camera.theta });

  const buildSavePayload = (): SavePayload => ({
    v: 2,
    blocks: Array.from(world.blocks),
    props: propWorld.list().map((p) => ({ x: p.x, y: p.y, z: p.z, modelId: p.modelId })),
    camera: { theta: camera.theta, phi: camera.phi, radius: camera.radius },
  });

  let saveTimer = 0;
  const scheduleSave = (): void => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => { void saveWorld(buildSavePayload()); }, 500);
  };

  const applyDelta = (delta: BlockDelta): void => {
    renderer.applyBlockDelta(delta);
    scheduleSave();
  };

  const notify = (message: string): void => {
    store.setState({ toast: { message, key: Date.now() } });
  };

  const placeProp = (hit: PickHit | null): void => {
    const modelId = store.getState().currentPropModelId;
    if (!hit || modelId === null) return;
    const model = propModels[modelId];
    if (!model) return;
    const tx = hit.x + hit.nx, ty = hit.y + hit.ny, tz = hit.z + hit.nz;
    if (!itemFootprintSupported(
      tx, ty, tz, model.footprint,
      (x, y, z) => world.getBlock(x, y, z),
      (x, y, z) => propWorld.propAt(x, y, z),
      propModels,
    )) { notify('这里不能放物品'); return; }
    for (let dx = 0; dx < model.footprint; dx++) {
      for (let dy = 0; dy < model.height; dy++) {
        for (let dz = 0; dz < model.footprint; dz++) {
          if (world.getBlock(tx + dx, ty + dy, tz + dz) !== BLOCK.AIR) {
            notify('位置被方块占据'); return;
          }
        }
      }
    }
    if (propTriangleCount(propModels, propWorld.list()) + model.indices.length / 3 > PROP_TRIANGLE_BUDGET) {
      notify('道具太多，先删一些'); return;
    }
    const inst = propWorld.add(tx, ty, tz, modelId);
    if (!inst) { notify('位置被占用'); return; }
    history.push({ type: 'setProp', x: tx, y: ty, z: tz, prevModelId: null });
    renderer.applyPropDelta?.({ added: [inst], removed: [] });
    scheduleSave();
  };

  const removeProp = (hit: PickHit): void => {
    const inst = propWorld.removeAt(hit.x, hit.y, hit.z);
    if (!inst) return;
    history.push({ type: 'setProp', x: inst.x, y: inst.y, z: inst.z, prevModelId: inst.modelId });
    renderer.applyPropDelta?.({
      added: [],
      removed: [{ x: inst.x, y: inst.y, z: inst.z, modelId: inst.modelId }],
    });
    scheduleSave();
  };

  const handleTap = (x: number, y: number): void => {
    const { mode, terrainAction, itemAction, currentBlockType } = store.getState();
    if (mode === 'orbit') return;
    const ray = renderer.screenPointToRay(x, y);
    const reach = camera.radius * 2;
    const hit = mode === 'item'
      ? pickItem(ray.origin, ray.direction, world, propWorld, propModels, reach)
      : pick(ray.origin, ray.direction, world, propWorld, reach, mode === 'terrain');

    if (mode === 'terrain') {
      if (terrainAction === 'remove') {
        if (hit && hit.kind === 'block') {
          const prev = world.getBlock(hit.x, hit.y, hit.z);
          if (prev !== BLOCK.AIR && world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR)) {
            history.push({ type: 'set', x: hit.x, y: hit.y, z: hit.z, prev });
            applyDelta({ added: [], removed: [{ x: hit.x, y: hit.y, z: hit.z }] });
          }
        }
      } else if (terrainAction === 'place' && hit && hit.kind === 'block') {
        const target = terrainPlaceTarget(hit);
        if (!target) return;
        const tx = target.x, ty = target.y, tz = target.z;
        if (
          world.getBlock(tx, ty, tz) === BLOCK.AIR &&
          !propWorld.propAt(tx, ty, tz) &&
          world.setBlock(tx, ty, tz, currentBlockType)
        ) {
          history.push({ type: 'set', x: tx, y: ty, z: tz, prev: BLOCK.AIR });
          applyDelta({ added: [{ x: tx, y: ty, z: tz, type: currentBlockType }], removed: [] });
        }
      }
    } else if (mode === 'item') {
      if (itemAction === 'remove') {
        if (hit && hit.kind === 'prop') removeProp(hit);
      } else if (itemAction === 'place') {
        placeProp(hit);
      }
    }
  };

  const syncOrbit = (): void => {
    renderer.setCamera(toRendererCameraState(camera));
    const s = store.getState();
    renderer.setTheme({ ambient: s.ambient, directional: s.directional, temperature: s.temperature, lightDir: s.lightDir });
    store.setState({ viewTheta: camera.theta });
  };

  const gestureHandlers = {
    onPan: (dx: number, dy: number): void => {
      pan(camera, dx, dy, canvas.clientHeight);
      renderer.setCamera(toRendererCameraState(camera));
    },
    onOrbit: (dx: number, dy: number): void => { orbit(camera, dx, dy); syncOrbit(); },
    onRotate: (radians: number): void => { yaw(camera, radians); syncOrbit(); },
    onTilt: (dy: number): void => { tilt(camera, dy); renderer.setCamera(toRendererCameraState(camera)); },
    onZoom: (factor: number): void => {
      userZoomed = true;
      zoom(camera, factor);
      renderer.setCamera(toRendererCameraState(camera));
    },
    onTap: handleTap,
  };
  let disposeGestures = bindGestures(canvas, gestureHandlers);

  const undoPropCell = (x: number, y: number, z: number, prevModelId: number | null): void => {
    if (prevModelId === null) {
      const inst = propWorld.removeAt(x, y, z);
      if (inst) {
        renderer.applyPropDelta?.({
          added: [],
          removed: [{ x: inst.x, y: inst.y, z: inst.z, modelId: inst.modelId }],
        });
      }
    } else {
      const inst = propWorld.add(x, y, z, prevModelId);
      if (inst) renderer.applyPropDelta?.({ added: [inst], removed: [] });
    }
  };

  const undo = (): void => {
    const action = history.pop();
    if (!action) return;
    const added: Array<{ x: number; y: number; z: number; type: BlockId }> = [];
    const removed: Array<{ x: number; y: number; z: number }> = [];

    if (action.type === 'set' || action.type === 'batch') {
      if (action.type === 'set') {
        world.setBlock(action.x, action.y, action.z, action.prev);
        if (action.prev === BLOCK.AIR) removed.push({ x: action.x, y: action.y, z: action.z });
        else added.push({ x: action.x, y: action.y, z: action.z, type: action.prev });
      } else {
        for (const op of action.ops) {
          world.setBlock(op.x, op.y, op.z, op.prev);
          if (op.prev === BLOCK.AIR) removed.push({ x: op.x, y: op.y, z: op.z });
          else added.push({ x: op.x, y: op.y, z: op.z, type: op.prev });
        }
      }
      applyDelta({ added, removed });
    } else if (action.type === 'setProp') {
      undoPropCell(action.x, action.y, action.z, action.prevModelId);
      scheduleSave();
    } else {
      for (const op of action.ops) undoPropCell(op.x, op.y, op.z, op.prevModelId);
      scheduleSave();
    }
  };

  const reset = (): void => {
    world.clear();
    seedGround(world);
    history.clear();
    propWorld.clear();
    renderer.syncWorld(world.snapshot());
    renderer.syncProps?.([]);
    scheduleSave();
  };

  const switchAdapter = async (preferred: string): Promise<void> => {
    const nextCanvas = document.createElement('canvas');
    nextCanvas.id = 'scene';
    let next: RendererAdapter;
    try {
      next = await createRenderer({
        canvas: nextCanvas, atlasCanvas,
        devicePixelRatio: window.devicePixelRatio || 1,
      }, caps, preferred);
    } catch {
      notify('切换失败');
      return;
    }
    if (next.name === 'null') {
      next.dispose();
      notify('该适配器不可用');
      return;
    }
    disposeGestures();
    const old = canvas;
    canvas = nextCanvas;
    old.replaceWith(nextCanvas);
    renderer.dispose();
    renderer = next;
    disposeGestures = bindGestures(canvas, gestureHandlers);
    const s = store.getState();
    next.setTheme({ ambient: s.ambient, directional: s.directional, temperature: s.temperature, lightDir: s.lightDir, propOpacity: s.mode === 'terrain' ? 0.4 : 1 });
    next.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
    next.syncWorld(world.snapshot());
    next.definePropModels?.(propModels);
    next.syncProps?.(propWorld.list());
    next.setCamera(toRendererCameraState(camera));
    store.setState({ adapter: next.name });
    notify(`适配器：${next.name}`);
  };

  const onSaveAlbum = (): void => {
    void (async () => {
      const url = renderer.captureImage();
      if (!url) { notify('截图失败'); return; }
      const ok = await saveToAlbum(url);
      notify(ok ? '已保存到相册' : '保存失败');
    })();
  };

  const onShareNote = (): void => {
    void (async () => {
      const url = renderer.captureImage();
      if (!url) { notify('截图失败'); return; }
      const ok = await shareAsNote(url, { title: '我的方块花园', content: '来参观我搭建的小花园～' });
      notify(ok ? '已拉起发布页' : '分享失败');
    })();
  };

  const setMode = (mode: EditorMode): void => {
    store.setState({ mode });
    renderer.setTheme({ propOpacity: mode === 'terrain' ? 0.4 : 1 });
  };

  const setPerspective = (distance: number): void => {
    setDistance(camera, distance);
    renderer.setCamera(toRendererCameraState(camera));
    store.setState({ perspective: camera.radius });
  };

  window.addEventListener('resize', () => {
    if (!userZoomed) fitViewport(camera, canvas.clientWidth / canvas.clientHeight);
    renderer.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
    renderer.setCamera(toRendererCameraState(camera));
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void saveWorld(buildSavePayload());
    }
  });

  return {
    setMode,
    selectBlock: (type) => store.setState({ currentBlockType: type, terrainAction: 'place' }),
    selectTerrainRemove: () => store.setState({ terrainAction: 'remove' }),
    selectProp: (modelId) => store.setState({ currentPropModelId: modelId, itemAction: 'place' }),
    selectItemRemove: () => store.setState({ itemAction: 'remove' }),
    undo,
    reset,
    saveToAlbum: onSaveAlbum,
    shareNote: onShareNote,
    setPerspective,
    switchAdapter: (name) => { void switchAdapter(name); },
    setAmbient: (value) => { store.setState({ ambient: value }); renderer.setTheme({ ambient: value }); },
    setDirectional: (value) => { store.setState({ directional: value }); renderer.setTheme({ directional: value }); },
    setLightDir: (dir) => { store.setState({ lightDir: dir }); renderer.setTheme({ lightDir: dir }); },
    setTemperature: (kelvin) => { store.setState({ temperature: kelvin }); renderer.setTheme({ temperature: kelvin }); },
  };
}
