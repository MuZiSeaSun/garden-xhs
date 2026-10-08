import { detectCapabilities } from './platform/capabilities';
import { createRenderer } from './rendering/renderer-factory';
import { generateAtlas } from './assets/atlas-generator';
import { createWorld, WORLD_SIZE } from './core/world';
import {
  createCameraOrbit,
  toRendererCameraState,
  orbit,
  zoom,
} from './core/camera-state';
import { loadWorld, saveWorld } from './platform/storage';
import { saveToAlbum, shareAsNote } from './platform/share';
import { bindGestures } from './input/gesture';
import { bindUI, type EditorMode } from './ui';
import { voxelRaycast } from './core/voxel-raycast';
import { createHistory } from './core/history';
import { PRESETS } from './core/presets';
import { BLOCK, type BlockId } from './core/block-types';
import type { RendererAdapter, BlockDelta } from './rendering/renderer-api';

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
  if (!canvas) return;

  const caps = detectCapabilities();
  const atlasCanvas = generateAtlas();
  const world = createWorld();
  const camera = createCameraOrbit();
  const history = createHistory();

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

  // 恢复存档
  const saved = await loadWorld();
  if (saved && saved.blocks.length === WORLD_SIZE ** 3) {
    for (let i = 0; i < saved.blocks.length; i++) world.blocks[i] = saved.blocks[i];
    camera.theta = saved.camera.theta;
    camera.phi = saved.camera.phi;
    camera.radius = saved.camera.radius;
  }

  renderer.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
  renderer.syncWorld(world.snapshot());
  renderer.setCamera(toRendererCameraState(camera));

  // 状态
  let mode: EditorMode = 'orbit';
  let currentBlockType: BlockId = BLOCK.GRASS;
  let currentPreset: string | null = null;

  // 自动保存（debounce）
  let saveTimer = 0;
  const scheduleSave = (): void => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void saveWorld({
        v: 1,
        blocks: Array.from(world.blocks),
        camera: { theta: camera.theta, phi: camera.phi, radius: camera.radius },
      });
    }, 500);
  };

  // 单个方块修改
  const applyDelta = (delta: BlockDelta): void => {
    renderer.applyBlockDelta(delta);
    scheduleSave();
  };

  const handleTap = (x: number, y: number): void => {
    const ray = renderer.screenPointToRay(x, y);
    const hit = voxelRaycast(ray.origin, ray.direction, world, 100);

    if (mode === 'place') {
      if (currentPreset) {
        // 放置预设模型
        const preset = PRESETS[currentPreset];
        if (!preset) return;
        if (!hit) return;
        const anchor = [hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz] as const;
        const added: Array<{ x: number; y: number; z: number; type: BlockId }> = [];
        const ops: Array<{ x: number; y: number; z: number; prev: BlockId }> = [];
        for (const b of preset.blocks) {
          const bx = anchor[0] + b.dx;
          const by = anchor[1] + b.dy;
          const bz = anchor[2] + b.dz;
          if (world.getBlock(bx, by, bz) !== BLOCK.AIR) continue;
          if (!world.setBlock(bx, by, bz, b.type as BlockId)) continue;
          ops.push({ x: bx, y: by, z: bz, prev: BLOCK.AIR });
          added.push({ x: bx, y: by, z: bz, type: b.type as BlockId });
        }
        if (added.length) {
          history.push({ type: 'batch', ops });
          applyDelta({ added, removed: [] });
        }
      } else if (hit) {
        const tx = hit.x + hit.nx;
        const ty = hit.y + hit.ny;
        const tz = hit.z + hit.nz;
        if (world.getBlock(tx, ty, tz) === BLOCK.AIR && world.setBlock(tx, ty, tz, currentBlockType)) {
          history.push({ type: 'set', x: tx, y: ty, z: tz, prev: BLOCK.AIR });
          applyDelta({ added: [{ x: tx, y: ty, z: tz, type: currentBlockType }], removed: [] });
        }
      }
    } else if (mode === 'remove') {
      if (hit) {
        const prev = world.getBlock(hit.x, hit.y, hit.z);
        if (prev !== BLOCK.AIR && world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR)) {
          history.push({ type: 'set', x: hit.x, y: hit.y, z: hit.z, prev });
          applyDelta({ added: [], removed: [{ x: hit.x, y: hit.y, z: hit.z }] });
        }
      }
    }
  };

  // 手势
  bindGestures(canvas, {
    onOrbit: (dx, dy) => {
      orbit(camera, dx, dy);
      renderer.setCamera(toRendererCameraState(camera));
    },
    onZoom: (factor) => {
      zoom(camera, factor);
      renderer.setCamera(toRendererCameraState(camera));
    },
    onTap: handleTap,
  });

  // UI
  const undo = (): void => {
    const action = history.pop();
    if (!action) return;
    const added: Array<{ x: number; y: number; z: number; type: BlockId }> = [];
    const removed: Array<{ x: number; y: number; z: number }> = [];

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

  bindUI({
    onModeChange: (m) => { mode = m; },
    onBlockSelect: (t) => { currentBlockType = t as BlockId; currentPreset = null; },
    onPresetSelect: (key) => { currentPreset = key; },
    onUndo: undo,
    onReset: () => {
      world.clear();
      history.clear();
      renderer.syncWorld(world.snapshot());
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
  });

  // 自适应
  window.addEventListener('resize', () => {
    renderer.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
    renderer.setCamera(toRendererCameraState(camera));
  });

  // 页面隐藏时立即保存
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void saveWorld({
        v: 1,
        blocks: Array.from(world.blocks),
        camera: { theta: camera.theta, phi: camera.phi, radius: camera.radius },
      });
    }
  });
}

bootstrap().catch((err) => {
  console.error('[app] bootstrap failed', err);
});
