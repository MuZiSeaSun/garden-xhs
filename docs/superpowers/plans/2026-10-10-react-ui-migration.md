# React UI 迁移实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有命令式 UI（`src/ui/index.ts` 的 `bindUI` + `app.ts` 内联编排）迁移到 React 19，行为逐一对齐，并搭好可扩展的 screen 结构。

**Architecture:** 三层分离——① 命令式引擎 `createEngine()`（持有 world/camera/renderer/history/手势，只读/写 editor store）；② 手写外部 store `createEditorStore()`（单一数据源，`useSyncExternalStore` 订阅）；③ React 表现层（Context + hooks + 组件）。React 只碰 UI 覆盖层，3D 画布与渲染循环保持在 React 树外。

**Tech Stack:** React 19 + react-dom/client + esbuild（`jsx: 'automatic'`）+ 手写 store（零状态库）+ vitest/jsdom + @testing-library/react。

**Spec:** 行为对齐源 `src/app.ts`（当前 421 行）与 `src/ui/index.ts`（当前 307 行）——逐字段迁移，不新增功能。

## Global Constraints

- ES2017 / Chrome 61 基线：esbuild `target: ['es2017']`，React 19 源码由 esbuild 转译
- 单 IIFE bundle：`format: 'iife'`，`supported: { 'dynamic-import': false }`（禁代码分割/懒加载）
- 禁 `eval(` / `new Function(` / `import(` / `fetch(` / `XMLHttpRequest` / `new Worker(` / `WebAssembly` / `WebSocket` / `EventSource`（`tests/scan/bundle.test.ts`）
- `process.env.NODE_ENV = '"production"'`（`define` 已配置，React 生产构建无 dev 代码）
- 纯离线：所有资源打包，不联网
- bundle < 5MB（scan test），zip ≤ 10MiB（建议 ≤ 2MiB）
- tsconfig `strict` + `noUnusedLocals` + `noUnusedParameters` + `noImplicitReturns`

## Review Focus

1. **React 19 scheduler 运行时 API（MessageChannel/queueMicrotask）在 Chrome 61 上的可用性** — 静态 bundle scan 会通过，但真机运行时必须验证；不依赖 UA 猜测，交付标记“真机未实测”。
2. **`useSyncExternalStore` getSnapshot 稳定性** — 必须返回同一对象引用（`getState()` 缓存引用），否则无限重渲染。
3. **手势 tap 读取最新选择状态** — `handleTap` 必须从 `store.getState()` 读，不能闭包捕获旧值。
4. **适配器切换（`switchAdapter`）** — 新 canvas 替换后须重新 `bindGestures`，且 light disk 从 store 派生（不再手动 `syncLightDisk`）。
5. **部分 `setTheme` 合并语义** — 各 adapter `setTheme` 对每个字段 `!== undefined` 才覆盖，故可安全做 `setTheme({ ambient })` 等局部更新（已核对 three/webgl adapter 实现）。

---

## File Structure

**Create:**
- `src/engine/editor-store.ts` — EditorState/EditorStore + createEditorStore（纯逻辑，node 可测）
- `src/engine/engine.ts` — createEngine（命令式核心，从 app.ts 抽取）
- `src/ui/EngineContext.tsx` — EngineProvider + useEngine + useEditorState
- `src/ui/main.tsx` — mountUI（ReactDOM.createRoot）
- `src/ui/App.tsx` — provider 包装 + screen 挂载点
- `src/ui/screens/EditorScreen.tsx` — 组合现有编辑器 UI
- `src/ui/components/ModeBar.tsx` / `Palette.tsx` / `ActionBar.tsx` / `DebugPanel.tsx` / `LightDisk.tsx` / `Toast.tsx`
- `tests/engine/editor-store.test.ts` / `tests/ui/components.test.tsx`

**Modify:**
- `package.json`（deps/devDeps）
- `tsconfig.json`（`jsx` + `include` 补 `.tsx`）
- `build.mjs`（`jsx: 'automatic'`）
- `src/index.html`（移除 `#toast`，改由 React 渲染）
- `src/app.ts`（重写为：创建 store/engine → mountUI）

**Delete:**
- `src/ui/index.ts`（被组件替代）

---

### Task 1: 工具链配置（依赖 + tsconfig + build.mjs）

**Files:**
- Modify: `package.json`, `tsconfig.json`, `build.mjs`

**Interfaces:**
- Produces: 可 `npm run build` 产出含 JSX 的 IIFE bundle；`tsc --noEmit` 识别 `.tsx`

- [ ] **Step 1: 添加依赖**

`package.json` 改：
```json
"dependencies": {
  "three": "^0.160.0",
  "react": "^19.0.0",
  "react-dom": "^19.0.0"
},
"devDependencies": {
  "esbuild": "^0.20.0",
  "typescript": "^5.4.0",
  "@types/three": "^0.160.0",
  "@types/node": "^22.0.0",
  "@types/react": "^19.0.0",
  "@types/react-dom": "^19.0.0",
  "@testing-library/react": "^16.0.0",
  "@testing-library/dom": "^10.0.0",
  "vitest": "^1.6.0",
  "jsdom": "^24.0.0"
}
```

- [ ] **Step 2: 安装**

Run: `npm install`

- [ ] **Step 3: tsconfig 开启 JSX 并纳入 .tsx**

`tsconfig.json` 的 `compilerOptions` 增加 `"jsx": "react-jsx"`，`include` 改为：
```json
"include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.d.ts", "tests/**/*.ts", "tests/**/*.tsx", "scripts/**/*.ts"]
```

- [ ] **Step 4: build.mjs 开启 automatic JSX**

`build.mjs` 的 `options` 增加一行：
```js
jsx: 'automatic',
```

- [ ] **Step 5: 验证**

Run: `npm run build`
Expected: build 成功（当前 app.ts 仍用旧 bindUI，React 尚未被引用，不影响）。

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json build.mjs
git commit -m "chore: add React 19 deps and esbuild JSX support"
```

---

### Task 2: 编辑器 store

**Files:**
- Create: `src/engine/editor-store.ts`
- Test: `tests/engine/editor-store.test.ts`

**Interfaces:**
- Produces: `EditorMode`, `ToolAction`, `EditorState`, `EditorStore`, `createEditorStore(initial?)`

- [ ] **Step 1: 写失败测试**

`tests/engine/editor-store.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createEditorStore } from '../../src/engine/editor-store';
import { BLOCK } from '../../src/core/block-types';

describe('createEditorStore', () => {
  it('starts with editor defaults', () => {
    const st = createEditorStore().getState();
    expect(st.mode).toBe('orbit');
    expect(st.terrainAction).toBeNull();
    expect(st.itemAction).toBeNull();
    expect(st.currentBlockType).toBe(BLOCK.GRASS);
    expect(st.currentPropModelId).toBeNull();
    expect(st.adapter).toBe('auto');
    expect(st.toast).toBeNull();
  });

  it('merges partial patches and notifies subscribers', () => {
    const s = createEditorStore();
    let calls = 0;
    const unsub = s.subscribe(() => { calls += 1; });
    s.setState({ mode: 'terrain' });
    expect(s.getState().mode).toBe('terrain');
    expect(s.getState().currentBlockType).toBe(BLOCK.GRASS);
    expect(calls).toBe(1);
    unsub();
    s.setState({ mode: 'item' });
    expect(calls).toBe(1);
  });

  it('accepts initial overrides', () => {
    const st = createEditorStore({ mode: 'item', currentBlockType: BLOCK.STONE }).getState();
    expect(st.mode).toBe('item');
    expect(st.currentBlockType).toBe(BLOCK.STONE);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/engine/editor-store.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 store**

`src/engine/editor-store.ts`:
```ts
import { BLOCK, type BlockId } from '../core/block-types';
import { DEFAULT_AMBIENT, DEFAULT_DIRECTIONAL } from '../rendering/renderer-api';

export type EditorMode = 'orbit' | 'terrain' | 'item';
export type ToolAction = 'place' | 'remove' | null;

export interface ToastState {
  readonly message: string;
  readonly key: number;
}

export interface EditorState {
  readonly mode: EditorMode;
  readonly terrainAction: ToolAction;
  readonly itemAction: ToolAction;
  readonly currentBlockType: BlockId;
  readonly currentPropModelId: number | null;
  readonly ambient: number;
  readonly directional: number;
  readonly temperature: number;
  readonly lightDir: readonly [number, number, number];
  readonly viewTheta: number;
  readonly perspective: number;
  readonly adapter: string;
  readonly toast: ToastState | null;
}

export interface EditorStore {
  getState(): EditorState;
  setState(patch: Partial<EditorState>): void;
  subscribe(listener: () => void): () => void;
}

const DEFAULT_STATE: EditorState = {
  mode: 'orbit',
  terrainAction: null,
  itemAction: null,
  currentBlockType: BLOCK.GRASS,
  currentPropModelId: null,
  ambient: DEFAULT_AMBIENT,
  directional: DEFAULT_DIRECTIONAL,
  temperature: 5000,
  lightDir: [0.5, 1, 0.3],
  viewTheta: Math.PI * 0.25,
  perspective: 200,
  adapter: 'auto',
  toast: null,
};

export function createEditorStore(initial: Partial<EditorState> = {}): EditorStore {
  let state: EditorState = { ...DEFAULT_STATE, ...initial };
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    setState(patch) {
      state = { ...state, ...patch };
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/engine/editor-store.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: Commit**

```bash
git add src/engine/editor-store.ts tests/engine/editor-store.test.ts
git commit -m "feat: add editor store as single source of truth"
```

---

### Task 3: 引擎抽取 `createEngine`

**Files:**
- Create: `src/engine/engine.ts`

**Interfaces:**
- Consumes: `EditorStore`/`EditorMode`（Task 2）
- Produces: `Engine`（`setMode/selectBlock/selectTerrainRemove/selectProp/selectItemRemove/undo/reset/saveToAlbum/shareNote/setPerspective/switchAdapter/setAmbient/setDirectional/setLightDir/setTemperature`）与 `createEngine(opts): Promise<Engine | null>`

- [ ] **Step 1: 实现引擎（从 app.ts 抽取，读/写 store）**

`src/engine/engine.ts`:
```ts
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
    const { mode, terrainAction, itemAction, currentBlockType, currentPropModelId } = store.getState();
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
```

- [ ] **Step 2: 验证类型**

Run: `npm run typecheck`
Expected: 通过（新文件独立编译，app.ts 仍用旧 bindUI）

- [ ] **Step 3: Commit**

```bash
git add src/engine/engine.ts
git commit -m "feat: extract imperative engine with editor store bridge"
```

---

### Task 4: React Context + hooks + 简单组件

**Files:**
- Create: `src/ui/EngineContext.tsx`, `src/ui/components/ModeBar.tsx`, `src/ui/components/ActionBar.tsx`, `src/ui/components/Toast.tsx`

**Interfaces:**
- Consumes: `Engine`（Task 3）、`EditorStore`/`EditorState`（Task 2）
- Produces: `EngineProvider`、`useEngine()`、`useEditorState()`、`ModeBar`、`ActionBar`、`Toast`

- [ ] **Step 1: Context + hooks**

`src/ui/EngineContext.tsx`:
```tsx
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { EditorState, EditorStore } from '../engine/editor-store';
import type { Engine } from '../engine/engine';

export interface EngineContextValue {
  readonly engine: Engine;
  readonly store: EditorStore;
}

const EngineContext = createContext<EngineContextValue | null>(null);

export function EngineProvider({ value, children }: { value: EngineContextValue; children: ReactNode }) {
  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngine(): Engine {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error('useEngine must be used within EngineProvider');
  return ctx.engine;
}

export function useEditorState(): EditorState {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error('useEditorState must be used within EngineProvider');
  return useSyncExternalStore(ctx.store.subscribe, () => ctx.store.getState());
}
```

- [ ] **Step 2: ModeBar**

`src/ui/components/ModeBar.tsx`:
```tsx
import { useEngine, useEditorState } from '../EngineContext';
import type { EditorMode } from '../../engine/editor-store';

const MODES: ReadonlyArray<{ mode: EditorMode; label: string }> = [
  { mode: 'orbit', label: '旋转' },
  { mode: 'terrain', label: '地形' },
  { mode: 'item', label: '物品' },
];

export function ModeBar() {
  const engine = useEngine();
  const { mode } = useEditorState();
  return (
    <div className="mode-group">
      {MODES.map((m) => (
        <button
          key={m.mode}
          className={'mode-btn' + (mode === m.mode ? ' active' : '')}
          onClick={() => engine.setMode(m.mode)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: ActionBar**

`src/ui/components/ActionBar.tsx`:
```tsx
import { useEngine } from '../EngineContext';

export function ActionBar() {
  const engine = useEngine();
  const actions: ReadonlyArray<{ label: string; onClick: () => void }> = [
    { label: '撤销', onClick: engine.undo },
    { label: '清空', onClick: engine.reset },
    { label: '保存', onClick: engine.saveToAlbum },
    { label: '分享', onClick: engine.shareNote },
  ];
  return (
    <div className="actions">
      {actions.map((a) => (
        <button key={a.label} onClick={a.onClick}>{a.label}</button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Toast**

`src/ui/components/Toast.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useEditorState } from '../EngineContext';

export function Toast() {
  const { toast } = useEditorState();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 1500);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!toast || !visible) return null;
  return <div id="toast">{toast.message}</div>;
}
```

- [ ] **Step 5: 验证类型**

Run: `npm run typecheck`
Expected: 通过

- [ ] **Step 6: Commit**

```bash
git add src/ui/EngineContext.tsx src/ui/components/ModeBar.tsx src/ui/components/ActionBar.tsx src/ui/components/Toast.tsx
git commit -m "feat: add React context and simple editor UI components"
```

---

### Task 5: Palette / LightDisk / DebugPanel

**Files:**
- Create: `src/ui/components/Palette.tsx`, `src/ui/components/LightDisk.tsx`, `src/ui/components/DebugPanel.tsx`

**Interfaces:**
- Consumes: `useEngine`/`useEditorState`（Task 4）、`diskToLightDir`/`lightDirToDisk`（core/light-direction）、`BLOCK`（core/block-types）、`PropModelData`（core/prop-types）
- Produces: `Palette({ propModels })`、`LightDisk({ lightDir, theta, onChange })`、`DebugPanel()`

- [ ] **Step 1: Palette**

`src/ui/components/Palette.tsx`:
```tsx
import { useEngine, useEditorState } from '../EngineContext';
import { BLOCK } from '../../core/block-types';
import type { PropModelData } from '../../core/prop-types';

const PALETTE_ITEMS: ReadonlyArray<{ icon: string; name: string; type: number }> = [
  { icon: '🌱', name: '草地', type: BLOCK.GRASS },
  { icon: '🟫', name: '泥土', type: BLOCK.SOIL },
  { icon: '⬜', name: '岩石', type: BLOCK.STONE },
  { icon: '🍃', name: '树叶', type: BLOCK.LEAF },
];

export function Palette({ propModels }: { propModels: readonly PropModelData[] }) {
  const engine = useEngine();
  const { mode, terrainAction, itemAction, currentBlockType, currentPropModelId } = useEditorState();

  if (mode === 'orbit') return null;

  return (
    <div className="palette">
      {mode === 'terrain' && (
        <div className="palette-group terrain-group">
          <button
            className={'palette-item' + (terrainAction === 'remove' ? ' active' : '')}
            title="铲子"
            onClick={engine.selectTerrainRemove}
          >🪣</button>
          {PALETTE_ITEMS.map((item) => (
            <button
              key={item.type}
              className={'palette-item' + (terrainAction === 'place' && currentBlockType === item.type ? ' active' : '')}
              title={item.name}
              onClick={() => engine.selectBlock(item.type)}
            >{item.icon}</button>
          ))}
        </div>
      )}
      {mode === 'item' && (
        <div className="palette-group props-group">
          <button
            className={'palette-item' + (itemAction === 'remove' ? ' active' : '')}
            title="删除"
            onClick={engine.selectItemRemove}
          >🗑️</button>
          {propModels.map((m, modelId) => (
            <button
              key={modelId}
              className={'palette-item' + (itemAction === 'place' && currentPropModelId === modelId ? ' active' : '')}
              title={m.name}
              onClick={() => engine.selectProp(modelId)}
            >
              <img src={m.icon} alt={m.name} draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: LightDisk**

`src/ui/components/LightDisk.tsx`:
```tsx
import { useRef } from 'react';
import { diskToLightDir, lightDirToDisk } from '../../core/light-direction';

export function LightDisk({ lightDir, theta, onChange }: {
  lightDir: readonly [number, number, number];
  theta: number;
  onChange: (dir: readonly [number, number, number]) => void;
}) {
  const diskRef = useRef<HTMLDivElement>(null);
  const { nx, ny } = lightDirToDisk(lightDir, theta);

  const pointFromEvent = (e: PointerEvent): { nx: number; ny: number } => {
    const rect = diskRef.current!.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    let y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { nx: x, ny: y };
  };
  const drag = (e: PointerEvent): void => {
    const p = pointFromEvent(e);
    onChange(diskToLightDir(p.nx, p.ny, theta));
  };

  return (
    <div
      ref={diskRef}
      className="light-disk"
      onPointerDown={(e) => {
        if (typeof e.pointerId === 'number') diskRef.current?.setPointerCapture?.(e.pointerId);
        drag(e.nativeEvent);
      }}
      onPointerMove={(e) => {
        if (!diskRef.current?.hasPointerCapture?.(e.pointerId)) return;
        drag(e.nativeEvent);
      }}
    >
      <div className="light-disk-knob" style={{ left: `${(nx + 1) * 50}%`, top: `${(ny + 1) * 50}%` }} />
    </div>
  );
}
```

- [ ] **Step 3: DebugPanel**

`src/ui/components/DebugPanel.tsx`:
```tsx
import { useState } from 'react';
import { useEngine, useEditorState } from '../EngineContext';
import { LightDisk } from './LightDisk';

const PERSPECTIVE_MIN = 60;
const PERSPECTIVE_MAX = 500;

export function DebugPanel() {
  const engine = useEngine();
  const { perspective, adapter, ambient, directional, temperature, lightDir, viewTheta } = useEditorState();
  const [open, setOpen] = useState(false);

  return (
    <div className="debug-bar">
      <button
        type="button"
        className={'debug-toggle' + (open ? ' active' : '')}
        onClick={() => setOpen((v) => !v)}
      >调试</button>
      {open && (
        <div className="debug-panel">
          <div className="perspective">
            <span className="perspective-label">透视</span>
            <input
              type="range"
              min={PERSPECTIVE_MIN} max={PERSPECTIVE_MAX} step={10}
              value={perspective}
              onChange={(e) => engine.setPerspective(Number(e.target.value))}
            />
            <span className="perspective-value">{perspective}</span>
          </div>

          <div className="control-row">
            <span>适配器</span>
            <select className="adapter-select" value={adapter} onChange={(e) => engine.switchAdapter(e.target.value)}>
              <option value="auto">自动</option>
              <option value="three">Three</option>
              <option value="webgl">WebGL</option>
            </select>
          </div>

          <div className="control-row ambient">
            <span>环境光</span>
            <input
              type="range" min={0} max={2} step={0.02} value={ambient}
              onChange={(e) => engine.setAmbient(Number(e.target.value))}
            />
            <span className="lighting-value">{ambient.toFixed(2)}</span>
          </div>

          <div className="control-row directional">
            <span>方向光</span>
            <input
              type="range" min={0} max={2} step={0.02} value={directional}
              onChange={(e) => engine.setDirectional(Number(e.target.value))}
            />
            <span className="lighting-value">{directional.toFixed(2)}</span>
          </div>

          <div className="control-row light-angle">
            <span>角度</span>
            <LightDisk lightDir={lightDir} theta={viewTheta} onChange={engine.setLightDir} />
          </div>

          <div className="control-row temperature">
            <span>色温</span>
            <input
              type="range" min={1500} max={20000} step={100} value={temperature}
              onChange={(e) => engine.setTemperature(Number(e.target.value))}
            />
            <span className="lighting-value">{temperature}K</span>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 验证类型**

Run: `npm run typecheck`
Expected: 通过

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/Palette.tsx src/ui/components/LightDisk.tsx src/ui/components/DebugPanel.tsx
git commit -m "feat: add palette, light disk, and debug panel components"
```

---

### Task 6: EditorScreen / App / mount + 重接线 app.ts + index.html

**Files:**
- Create: `src/ui/screens/EditorScreen.tsx`, `src/ui/App.tsx`, `src/ui/main.tsx`
- Modify: `src/app.ts`, `src/index.html`
- Delete: `src/ui/index.ts`

**Interfaces:**
- Consumes: 全部组件（Task 4/5）、`Engine`/`EditorStore`、`createEngine`（Task 3）、`createEditorStore`（Task 2）
- Produces: `mountUI(root, engine, store, propModels)`

- [ ] **Step 1: EditorScreen**

`src/ui/screens/EditorScreen.tsx`:
```tsx
import type { PropModelData } from '../../core/prop-types';
import { ModeBar } from '../components/ModeBar';
import { Palette } from '../components/Palette';
import { ActionBar } from '../components/ActionBar';
import { DebugPanel } from '../components/DebugPanel';
import { Toast } from '../components/Toast';

export function EditorScreen({ propModels }: { propModels: readonly PropModelData[] }) {
  return (
    <>
      <DebugPanel />
      <ModeBar />
      <Palette propModels={propModels} />
      <ActionBar />
      <Toast />
    </>
  );
}
```

- [ ] **Step 2: App**

`src/ui/App.tsx`:
```tsx
import type { PropModelData } from '../core/prop-types';
import type { EditorStore } from '../engine/editor-store';
import type { Engine } from '../engine/engine';
import { EngineProvider } from './EngineContext';
import { EditorScreen } from './screens/EditorScreen';

export function App({ engine, store, propModels }: {
  engine: Engine;
  store: EditorStore;
  propModels: readonly PropModelData[];
}) {
  return (
    <EngineProvider value={{ engine, store }}>
      <EditorScreen propModels={propModels} />
    </EngineProvider>
  );
}
```

- [ ] **Step 3: mount**

`src/ui/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client';
import type { PropModelData } from '../core/prop-types';
import type { EditorStore } from '../engine/editor-store';
import type { Engine } from '../engine/engine';
import { App } from './App';

export function mountUI(root: HTMLElement, engine: Engine, store: EditorStore, propModels: readonly PropModelData[]): void {
  createRoot(root).render(<App engine={engine} store={store} propModels={propModels} />);
}
```

- [ ] **Step 4: 重写 app.ts**

`src/app.ts`:
```ts
import { detectCapabilities } from './platform/capabilities';
import { generateAtlas } from './assets/atlas-generator';
import { createEditorStore } from './engine/editor-store';
import { createEngine } from './engine/engine';
import { mountUI } from './ui/main';
import { PROP_MODELS } from './assets/props.generated';

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui-root');
  if (!canvas || !uiRoot) return;

  const caps = detectCapabilities();
  const atlasCanvas = generateAtlas();
  const store = createEditorStore();
  const engine = await createEngine({ canvas, atlasCanvas, store, caps, propModels: PROP_MODELS });

  if (!engine) {
    document.getElementById('fallback')?.removeAttribute('hidden');
    return;
  }

  mountUI(uiRoot, engine, store, PROP_MODELS);
}

bootstrap().catch((err) => {
  console.error('[app] bootstrap failed', err);
});
```

- [ ] **Step 5: index.html 移除 #toast**

`src/index.html` 删除 `<div id="toast" hidden></div>` 一行（Toast 现在由 React 渲染；`#toast` CSS 选择器保持不变）。

- [ ] **Step 6: 删除 ui/index.ts**

Delete `src/ui/index.ts`（含 `bindUI`/`EditorMode`/`UIHandlers`/`LightDiskControls`）。

- [ ] **Step 7: 验证构建 + bundle scan**

Run: `npm run build && npm test`
Expected: build 成功（bundle 含 React）；`tests/scan/bundle.test.ts` 通过（无 forbidden 构造、<5MB、单 IIFE）。

- [ ] **Step 8: Commit**

```bash
git add src/ui/App.tsx src/ui/main.tsx src/ui/screens/EditorScreen.tsx src/app.ts src/index.html
git rm src/ui/index.ts
git commit -m "feat: mount React UI and rewire bootstrap"
```

---

### Task 7: 组件冒烟测试（jsdom）

**Files:**
- Create: `tests/ui/components.test.tsx`

**Interfaces:**
- Consumes: `ModeBar`/`Palette`/`ActionBar`、`EngineProvider`、`createEditorStore`

- [ ] **Step 1: 写测试**

`tests/ui/components.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createEditorStore } from '../../src/engine/editor-store';
import { EngineProvider } from '../../src/ui/EngineContext';
import { ModeBar } from '../../src/ui/components/ModeBar';
import { ActionBar } from '../../src/ui/components/ActionBar';
import { Palette } from '../../src/ui/components/Palette';
import { BLOCK } from '../../src/core/block-types';
import type { PropModelData } from '../../src/core/prop-types';

function makeEngine() {
  return {
    setMode: vi.fn(),
    selectBlock: vi.fn(),
    selectTerrainRemove: vi.fn(),
    selectProp: vi.fn(),
    selectItemRemove: vi.fn(),
    undo: vi.fn(),
    reset: vi.fn(),
    saveToAlbum: vi.fn(),
    shareNote: vi.fn(),
    setPerspective: vi.fn(),
    switchAdapter: vi.fn(),
    setAmbient: vi.fn(),
    setDirectional: vi.fn(),
    setLightDir: vi.fn(),
    setTemperature: vi.fn(),
  };
}

function renderWith(children: ReactNode) {
  const store = createEditorStore();
  const engine = makeEngine();
  render(<EngineProvider value={{ engine, store }}>{children}</EngineProvider>);
  return { store, engine };
}

describe('ModeBar', () => {
  it('orbit 默认高亮', () => {
    renderWith(<ModeBar />);
    expect(screen.getByText('旋转').className).toContain('active');
    expect(screen.getByText('地形').className).not.toContain('active');
  });
  it('点击地形调用 engine.setMode', () => {
    const { engine } = renderWith(<ModeBar />);
    fireEvent.click(screen.getByText('地形'));
    expect(engine.setMode).toHaveBeenCalledWith('terrain');
  });
});

describe('Palette', () => {
  it('orbit 模式不渲染', () => {
    renderWith(<Palette propModels={[]} />);
    expect(screen.queryByText('草地')).toBeNull();
  });
  it('地形模式渲染方块并选择', () => {
    const { store, engine } = renderWith(<Palette propModels={[]} />);
    store.setState({ mode: 'terrain' });
    fireEvent.click(screen.getByTitle('泥土'));
    expect(engine.selectBlock).toHaveBeenCalledWith(BLOCK.SOIL);
  });
  it('物品模式渲染道具并选择', () => {
    const models: PropModelData[] = [{
      name: '小花', icon: 'data:image/png;base64,x',
      positions: new Float32Array(0), normals: new Float32Array(0),
      colors: new Float32Array(0), alpha: new Float32Array(0),
      indices: new Uint16Array(0), footprint: 1, height: 1,
    }];
    const { store, engine } = renderWith(<Palette propModels={models} />);
    store.setState({ mode: 'item' });
    fireEvent.click(screen.getByTitle('小花'));
    expect(engine.selectProp).toHaveBeenCalledWith(0);
  });
});

describe('ActionBar', () => {
  it('四个按钮触发对应 engine 方法', () => {
    const { engine } = renderWith(<ActionBar />);
    fireEvent.click(screen.getByText('撤销'));
    expect(engine.undo).toHaveBeenCalled();
    fireEvent.click(screen.getByText('清空'));
    expect(engine.reset).toHaveBeenCalled();
    fireEvent.click(screen.getByText('保存'));
    expect(engine.saveToAlbum).toHaveBeenCalled();
    fireEvent.click(screen.getByText('分享'));
    expect(engine.shareNote).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行确认通过**

Run: `npx vitest run tests/ui/components.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/ui/components.test.tsx
git commit -m "test: add React component smoke tests"
```

---

### Task 8: 最终验证

- [ ] **Step 1: 全量构建 + 测试**

Run: `npm run build && npm test`
Expected: 全部通过（含 bundle scan、store 测试、组件测试、既有 stub 测试）。

- [ ] **Step 2: 产物审计**

Run: `node .skill/minitool-zip-builder/scripts/audit_artifact.mjs ./dist`
Expected: zip 目录审计无 ERROR；注意 React 带来的 ~130KB min 体积增长，确认仍 <5MB bundle、zip 建议 <2MiB。

- [ ] **Step 3: 交付提醒**

在交付说明中注明：① 需在创服平台模拟器 + Android 真机 + iOS 真机扫码验证（浏览器直运行不可信）；② React 19 scheduler 运行时 API 在 Chrome 61 WebView 的可用性**未实测**；③ 性能/帧率**未实测**。

- [ ] **Step 4: Commit（如需）**

```bash
git add -A
git commit -m "chore: finalize React UI migration"
```

---

## Self-Review

- **Spec coverage:** 现有 `bindUI` 全部控件（模式、方块调色板、铲子、道具调色板、删除、撤销/清空/保存/分享、透视、适配器、环境光/方向光/角度圆盘/色温、调试面板、toast）均已映射到组件；`app.ts` 的引擎逻辑全部迁入 `engine.ts`。无遗漏。
- **Placeholder scan:** 无 TODO/占位符，所有代码完整给出。
- **Type consistency:** `setMode/selectBlock/selectTerrainRemove/selectProp/selectItemRemove/undo/reset/saveToAlbum/shareNote/setPerspective/switchAdapter/setAmbient/setDirectional/setLightDir/setTemperature` 在 Engine 接口、组件调用、测试 mock 三处一致；`EditorState` 字段名跨 store/组件一致。
- **Review Focus:** 5 条风险已列入 Review Focus，其中 scheduler 可用性（第 1 条）落在 Task 8 交付提醒；getSnapshot 稳定性（第 2 条）由 `getState()` 缓存引用保证；tap 读 store（第 3 条）落在 engine 实现；适配器切换（第 4 条）落在 engine 实现；setTheme 合并（第 5 条）已核对 adapter 源码并据此设计局部更新。
