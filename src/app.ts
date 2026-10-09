import { detectCapabilities } from './platform/capabilities';
import { createRenderer } from './rendering/renderer-factory';
import { generateAtlas } from './assets/atlas-generator';
import { createWorld, WORLD_SIZE } from './core/world';
import { seedGround } from './core/terrain';
import {
  createCameraOrbit,
  toRendererCameraState,
  orbit,
  zoom,
  fitViewport,
  setDistance,
} from './core/camera-state';
import { loadWorld, saveWorld } from './platform/storage';
import { saveToAlbum, shareAsNote } from './platform/share';
import { bindGestures } from './input/gesture';
import { bindUI, type EditorMode } from './ui';
import { PROP_MODELS } from './assets/props.generated';
import { createPropWorld } from './core/prop-world';
import { pick, type PickHit } from './core/pick';
import { propTriangleCount } from './core/prop-mesh-builder';
import { createHistory } from './core/history';
import { PRESETS } from './core/presets';
import { BLOCK, type BlockId } from './core/block-types';
import type { RendererAdapter, BlockDelta } from './rendering/renderer-api';
import type { SavePayload } from './platform/storage';

async function bootstrap(): Promise<void> {
  const initialCanvas = document.getElementById('scene') as HTMLCanvasElement | null;
  if (!initialCanvas) return;
  let canvas: HTMLCanvasElement = initialCanvas;

  const caps = detectCapabilities();
  const atlasCanvas = generateAtlas();
  const world = createWorld();
  const camera = createCameraOrbit();
  const history = createHistory();
  const propWorld = createPropWorld(PROP_MODELS);
  const PROP_TRIANGLE_BUDGET = 90_000;
  let exposure = 1.3;
  let temperature = 5000;

  let renderer: RendererAdapter;
  try {
    renderer = await createRenderer({
      canvas,
      atlasCanvas,
      devicePixelRatio: window.devicePixelRatio || 1,
    }, caps);
  } catch {
    document.getElementById('fallback')?.removeAttribute('hidden');
    return;
  }
  if (renderer.name === 'null') {
    document.getElementById('fallback')?.removeAttribute('hidden');
    return;
  }

  renderer.setTheme({ exposure });

  // 先铺一层草地并首次渲染，避免首屏空白，也不被存档 I/O 阻塞。
  seedGround(world);
  fitViewport(camera, canvas.clientWidth / canvas.clientHeight);
  renderer.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
  renderer.syncWorld(world.snapshot());
  renderer.setCamera(toRendererCameraState(camera));
  renderer.definePropModels?.(PROP_MODELS);

  // 恢复存档（存在时覆盖地面与相机，再重渲染一次）
  const saved = await loadWorld();
  if (saved && saved.blocks.length === WORLD_SIZE ** 3) {
    for (let i = 0; i < saved.blocks.length; i++) world.blocks[i] = saved.blocks[i];
    camera.theta = saved.camera.theta;
    camera.phi = saved.camera.phi;
    camera.radius = saved.camera.radius;
    if (saved.v === 2) {
      for (const p of saved.props) propWorld.add(p.x, p.y, p.z, p.modelId); // 非法项 add 返回 null，自动跳过
    }
    renderer.syncWorld(world.snapshot());
    renderer.setCamera(toRendererCameraState(camera));
  }
  renderer.syncProps?.(propWorld.list());

  // 状态
  let mode: EditorMode = 'orbit';
  let currentBlockType: BlockId = BLOCK.GRASS;
  let currentPreset: string | null = null;
  let currentPropModelId: number | null = null;
  let userZoomed = false;

  // 自动保存（debounce）
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

  // 单个方块修改
  const applyDelta = (delta: BlockDelta): void => {
    renderer.applyBlockDelta(delta);
    scheduleSave();
  };

  const placeProp = (hit: PickHit | null): void => {
    if (!hit || currentPropModelId === null) return;
    const model = PROP_MODELS[currentPropModelId];
    if (!model) return;
    const tx = hit.x + hit.nx, ty = hit.y + hit.ny, tz = hit.z + hit.nz;
    // 占用列全部格须为空气（不得插入地形）；边界与道具重叠由 propWorld.add 校验
    for (let dx = 0; dx < model.footprint; dx++) {
      for (let dy = 0; dy < model.height; dy++) {
        for (let dz = 0; dz < model.footprint; dz++) {
          if (world.getBlock(tx + dx, ty + dy, tz + dz) !== BLOCK.AIR) {
            showToast('位置被方块占据');
            return;
          }
        }
      }
    }
    if (propTriangleCount(PROP_MODELS, propWorld.list()) + model.indices.length / 3 > PROP_TRIANGLE_BUDGET) {
      showToast('道具太多，先删一些');
      return;
    }
    const inst = propWorld.add(tx, ty, tz, currentPropModelId);
    if (!inst) { showToast('位置被占用'); return; }
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
    const ray = renderer.screenPointToRay(x, y);
    const hit = pick(ray.origin, ray.direction, world, propWorld, camera.radius * 2);

    if (mode === 'place') {
      if (currentPropModelId !== null) {
        placeProp(hit);
      } else if (currentPreset) {
        const preset = PRESETS[currentPreset];
        if (!preset || !hit) return;
        const anchor = [hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz] as const;
        const added: Array<{ x: number; y: number; z: number; type: BlockId }> = [];
        const ops: Array<{ x: number; y: number; z: number; prev: BlockId }> = [];
        for (const b of preset.blocks) {
          const bx = anchor[0] + b.dx, by = anchor[1] + b.dy, bz = anchor[2] + b.dz;
          if (world.getBlock(bx, by, bz) !== BLOCK.AIR) continue;
          if (propWorld.propAt(bx, by, bz)) continue;
          if (!world.setBlock(bx, by, bz, b.type as BlockId)) continue;
          ops.push({ x: bx, y: by, z: bz, prev: BLOCK.AIR });
          added.push({ x: bx, y: by, z: bz, type: b.type as BlockId });
        }
        if (added.length) {
          history.push({ type: 'batch', ops });
          applyDelta({ added, removed: [] });
        }
      } else if (hit) {
        // 命中 prop 或 block 一视同仁：目标格 = 命中格 + 法线
        const tx = hit.x + hit.nx, ty = hit.y + hit.ny, tz = hit.z + hit.nz;
        if (world.getBlock(tx, ty, tz) === BLOCK.AIR && world.setBlock(tx, ty, tz, currentBlockType)) {
          history.push({ type: 'set', x: tx, y: ty, z: tz, prev: BLOCK.AIR });
          applyDelta({ added: [{ x: tx, y: ty, z: tz, type: currentBlockType }], removed: [] });
        }
      }
    } else if (mode === 'remove') {
      if (hit && hit.kind === 'prop') {
        removeProp(hit);
      } else if (hit && hit.kind === 'block') {
        const prev = world.getBlock(hit.x, hit.y, hit.z);
        if (prev !== BLOCK.AIR && world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR)) {
          history.push({ type: 'set', x: hit.x, y: hit.y, z: hit.z, prev });
          applyDelta({ added: [], removed: [{ x: hit.x, y: hit.y, z: hit.z }] });
        }
      }
    }
  };

  // 手势
  const gestureHandlers = {
    onOrbit: (dx: number, dy: number): void => {
      orbit(camera, dx, dy);
      renderer.setCamera(toRendererCameraState(camera));
    },
    onZoom: (factor: number): void => {
      userZoomed = true;
      zoom(camera, factor);
      renderer.setCamera(toRendererCameraState(camera));
    },
    onTap: handleTap,
  };
  let disposeGestures = bindGestures(canvas, gestureHandlers);

  // UI
  const undoPropCell = (x: number, y: number, z: number, prevModelId: number | null): void => {
    if (prevModelId === null) {
      const inst = propWorld.removeAt(x, y, z); // 撤销一次放置 → 移除
      if (inst) {
        renderer.applyPropDelta?.({
          added: [],
          removed: [{ x: inst.x, y: inst.y, z: inst.z, modelId: inst.modelId }],
        });
      }
    } else {
      const inst = propWorld.add(x, y, z, prevModelId); // 撤销一次删除 → 放回
      if (inst) renderer.applyPropDelta?.({ added: [inst], removed: [] });
    }
  };

  const undo = (): void => {
    const action = history.pop();
    if (!action) return;
    const added: Array<{ x: number; y: number; z: number; type: BlockId }> = [];
    const removed: Array<{ x: number; y: number; z: number }> = [];

    if (action.type === 'set' || action.type === 'batch') {
      // ——原体素撤销逻辑逐字保留——
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

  const toast = document.getElementById('toast');
  let toastTimer = 0;
  const showToast = (msg: string): void => {
    if (!toast) return;
    toast.textContent = msg;
    toast.removeAttribute('hidden');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.setAttribute('hidden', ''), 1500);
  };

  const switchRenderer = async (preferred: string): Promise<void> => {
    // 一个 canvas 只能绑定一种 WebGL 上下文，切换时必须换一块新 canvas
    const nextCanvas = document.createElement('canvas');
    nextCanvas.id = 'scene';
    let next: RendererAdapter;
    try {
      next = await createRenderer({
        canvas: nextCanvas,
        atlasCanvas,
        devicePixelRatio: window.devicePixelRatio || 1,
      }, caps, preferred);
    } catch {
      showToast('切换失败');
      return;
    }
    if (next.name === 'null') {
      next.dispose();
      showToast('该适配器不可用');
      return;
    }
    disposeGestures();
    const old = canvas;
    canvas = nextCanvas;
    old.replaceWith(nextCanvas);
    renderer.dispose();
    renderer = next;
    disposeGestures = bindGestures(canvas, gestureHandlers);
      next.setTheme({ exposure, temperature });
    next.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
    next.syncWorld(world.snapshot());
    next.definePropModels?.(PROP_MODELS);
    next.syncProps?.(propWorld.list());
    next.setCamera(toRendererCameraState(camera));
    showToast(`适配器：${next.name}`);
  };

  bindUI({
    onModeChange: (m) => { mode = m; },
    onBlockSelect: (t) => { currentBlockType = t as BlockId; currentPreset = null; currentPropModelId = null; },
    onPresetSelect: (key) => { currentPreset = key; currentPropModelId = null; },
    onPropSelect: (modelId) => { currentPropModelId = modelId; currentPreset = null; },
    onUndo: undo,
    onPerspectiveChange: (distance) => {
      setDistance(camera, distance);
      renderer.setCamera(toRendererCameraState(camera));
    },
    onAdapterChange: (name) => {
      void switchRenderer(name);
    },
    onLightingChange: (value) => {
      exposure = value;
      renderer.setTheme({ exposure, temperature });
    },
    onTemperatureChange: (kelvin) => {
      temperature = kelvin;
      renderer.setTheme({ exposure, temperature });
    },
    onReset: () => {
      world.clear();
      seedGround(world);
      history.clear();
      propWorld.clear();
      renderer.syncWorld(world.snapshot());
      renderer.syncProps?.([]);
      scheduleSave();
    },
    onSaveAlbum: () => {
      void (async () => {
        const url = renderer.captureImage();
        if (!url) { showToast('截图失败'); return; }
        const ok = await saveToAlbum(url);
        showToast(ok ? '已保存到相册' : '保存失败');
      })();
    },
    onShareNote: () => {
      void (async () => {
        const url = renderer.captureImage();
        if (!url) { showToast('截图失败'); return; }
        const ok = await shareAsNote(url, {
          title: '我的方块花园',
          content: '来参观我搭建的小花园～',
        });
        showToast(ok ? '已拉起发布页' : '分享失败');
      })();
    },
  }, PROP_MODELS);

  // 自适应
  window.addEventListener('resize', () => {
    if (!userZoomed) fitViewport(camera, canvas.clientWidth / canvas.clientHeight);
    renderer.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
    renderer.setCamera(toRendererCameraState(camera));
  });

  // 页面隐藏时立即保存
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void saveWorld(buildSavePayload());
    }
  });
}

bootstrap().catch((err) => {
  console.error('[app] bootstrap failed', err);
});
