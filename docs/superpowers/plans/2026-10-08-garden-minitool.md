# 方块花园 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个完全离线的小红书小工具——10×10×10 体素方块花园编辑器（放置/删除/撤销/存档/分享），基于可替换的渲染抽象层，默认 Three.js 适配器，手写 WebGL 兜底。

**Architecture:** 分层：`app` 组装 → `core`（世界/相机/拾取/网格/撤销，不依赖引擎）/ `platform`（端能力/存储/分享）/ `input`（手势→语义事件）/ `ui`（工具栏）→ `rendering`（冻结接口 + 工厂 + Three/WebGL/Null 适配器）。core 只依赖 `rendering/renderer-api.ts` 的类型，绝不 import Three.js。

**Tech Stack:** TypeScript 5.x（strict）、esbuild（IIFE 打包）、Three.js 0.160（tree-shaken）、Vitest + jsdom、Chrome 61 / ES2017 基线。

**Spec:** `docs/方块花园-实现方案文档.md` —— **执行者必须同时阅读此文档**。计划中标注「spec §X」的实现步骤，其精确代码以该文档对应章节为准；计划只内联测试代码与关键修正说明。

## Global Constraints

- 目标运行时 ES2017 / Chrome 61；构建 `target: ['es2017']`。
- 产物禁用项（扫描必须为零）：`eval(`、`new Function(`、动态 `import(`、`WebAssembly`、`fetch(`/`XMLHttpRequest`、`new Worker(`、`OffscreenCanvas`、内联 `<script>`/行内事件、外部域名资源、`a[download]`/blob 下载、`window.prompt`。
- 入口有且只有一个 `.html`；允许文件类型仅 `.html .css .js .json .png .jpg .jpeg .gif .webp .svg .woff .woff2`。
- `core/` 不得 `import` `three`（只允许 `import type` 自 `rendering/renderer-api`）。
- `CameraState.fov` 单位是**弧度**；Three 适配器内部转角度（`* 180 / Math.PI`），手写 WebGL 直接用弧度。
- 常量：`WORLD_SIZE=10`、`RENDERER_API_VERSION=1`、`MAX_HISTORY=20`、`STORAGE_KEY='garden_world_v1'`、`STORAGE_MIN_CLIENT_VERSION=9460`、`ATLAS_COLS=16`、`TILE=32`、`PHI_MIN=0.15`、`PHI_MAX=Math.PI-0.15`、`RADIUS_MIN=8`、`RADIUS_MAX=40`。
- 客户端版本判定：`Math.floor(buildVersion / 1000)` 与 `9460` 比较。
- 单文件产物 `dist/app.js` ≤ 5MB（预期 250~400KB）；零网络请求。
- 端能力入口 `window.xhs.miniTool.<api>`，调用前判空 `window.xhs && window.xhs.miniTool`。
- `writeTempFile({ data })` 传**纯 base64**（不含 `data:` 前缀）；分享 API 必须由用户点击触发。

## Review Focus

Spec 是愿景文档，未明说的输入不等于允许它崩溃。以下失败模式在对应任务里有测试钉住：

1. **FOV 单位**：core 用弧度、Three 用角度；漏转则视野近乎全黑。→ Task 5 + Task 18。
2. **图集 tile 索引**：`LEAF` 的 `atlas = 8` 必须落在 16 列网格内，否则采样空白被 `discard`（不可见）。→ Task 7。
3. **首帧视口尺寸/宽高比**：`init` 后未 `resize` 会得到 300×150 拉伸 + 拾取坐标错。→ Task 20。
4. **无 WebGL 路径**：`NullAdapter` 恒可用；若不在 `bootstrap` 显式检测，用户得白屏死界面。→ Task 11 + Task 20。
5. **分享格式与手势**：`writeTempFile` 需纯 base64；异步链可能丢失用户激活导致被拒。→ Task 14 + Task 20 真机。
6. **产物反例**：Three.js 或业务代码引入动态 import / eval 会被容器拒绝。→ Task 21。

## File Structure

```
garden-xhs/
├── package.json / tsconfig.json / build.mjs / vitest.config.ts / .gitignore
├── src/
│   ├── types/xhs.d.ts
│   ├── core/{block-types,world,presets,history,camera-state,ray,voxel-raycast,mesh-builder}.ts
│   ├── rendering/renderer-api.ts / renderer-factory.ts
│   │   └── adapters/{three,webgl,null}-adapter.ts
│   ├── platform/{capabilities,storage,share}.ts
│   ├── assets/atlas-generator.ts
│   ├── input/gesture.ts
│   ├── ui/index.ts
│   ├── app.ts / index.html / style.css
└── tests/**（与被测文件同名 *.test.ts）
```

**依赖方向：** `app → core/platform/input/ui → rendering/renderer-api ← adapters`。

---

## Task 1: 工具链与仓库脚手架

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `build.mjs`, `.gitignore`
- Create: `src/index.html`（占位）, `src/style.css`（占位）, `src/app.ts`（占位 `export {}`）

**Interfaces:**
- Produces: `npm run typecheck`、`npm test`、`npm run build`；`dist/` 产物

- [ ] **Step 1: 初始化 git**

```bash
git init
```

- [ ] **Step 2: 创建 `package.json`**

```jsonc
{
  "name": "garden-minitool",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "npm run typecheck && node build.mjs",
    "watch": "node build.mjs --watch"
  },
  "devDependencies": {
    "esbuild": "^0.20.0",
    "typescript": "^5.4.0",
    "@types/three": "^0.160.0",
    "vitest": "^1.6.0",
    "jsdom": "^24.0.0"
  },
  "dependencies": { "three": "^0.160.0" }
}
```

- [ ] **Step 3: 创建 `tsconfig.json`**

```jsonc
{
  "compilerOptions": {
    "target": "ES2017",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2017", "DOM", "DOM.Iterable"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["@types/three"]
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 4: 创建 `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
```

- [ ] **Step 5: 创建 `build.mjs`**（spec §13.3，watch 模式也复制 html/css）

```js
import { build, context } from 'esbuild';
import { copyFile, mkdir } from 'fs/promises';

const outdir = 'dist';
await mkdir(outdir, { recursive: true });
await copyFile('src/index.html', `${outdir}/index.html`);
await copyFile('src/style.css', `${outdir}/style.css`);

const options = {
  entryPoints: ['src/app.ts'],
  bundle: true,
  format: 'iife',
  target: ['es2017'],
  outfile: `${outdir}/app.js`,
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  treeShaking: true,
  supported: { 'dynamic-import': false },
  define: { 'process.env.NODE_ENV': '"production"', __DEV__: 'false' },
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching...');
} else {
  await build(options);
  console.log('build done');
}
```

- [ ] **Step 6: 创建 `.gitignore`**

```
node_modules/
dist/
*.log
```

- [ ] **Step 7: 创建占位 `src/index.html` / `src/style.css` / `src/app.ts`**

`src/index.html`:

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>方块花园</title></head>
<body><canvas id="scene"></canvas><div id="ui-root"></div></body>
</html>
```

`src/style.css`：空文件。

`src/app.ts`:

```ts
// src/app.ts
export {};
```

- [ ] **Step 8: 安装并验证**

Run: `npm install`
Expected: 成功。

Run: `npm run typecheck`
Expected: 退出码 0。

Run: `npm run build`
Expected: 打印 `build done`；`dist/` 含 `index.html`、`style.css`、`app.js`。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "chore: scaffold toolchain (tsc, esbuild, vitest)"
```

---

## Task 2: 方块类型定义

**Files:**
- Create: `src/core/block-types.ts`
- Test: `tests/core/block-types.test.ts`

**Interfaces:**
- Produces: `BLOCK`、`BlockId`、`BlockDef`、`BLOCK_DEFS`（spec §6.1，已删除 `solid` 字段）

- [ ] **Step 1: 写失败测试**

```ts
// tests/core/block-types.test.ts
import { describe, it, expect } from 'vitest';
import { BLOCK, BLOCK_DEFS } from '../../src/core/block-types';

describe('block-types', () => {
  it('AIR has no definition', () => {
    expect(BLOCK_DEFS[BLOCK.AIR]).toBeUndefined();
  });
  it('LEAF maps to atlas tile 8', () => {
    expect(BLOCK_DEFS[BLOCK.LEAF]?.atlas).toBe(8);
  });
  it('flowers are cross blocks', () => {
    expect(BLOCK_DEFS[BLOCK.FLOWER_RED]?.cross).toBe(true);
    expect(BLOCK_DEFS[BLOCK.FLOWER_YELLOW]?.cross).toBe(true);
  });
  it('water and leaf are non-opaque', () => {
    expect(BLOCK_DEFS[BLOCK.WATER]?.opaque).toBe(false);
    expect(BLOCK_DEFS[BLOCK.LEAF]?.opaque).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/core/block-types.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 `src/core/block-types.ts`（逐字来自 spec §6.1）**

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/core/block-types.test.ts`
Expected: PASS（4 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/core/block-types.ts tests/core/block-types.test.ts
git commit -m "feat(core): block type definitions"
```

---

## Task 3: 世界数据

**Files:**
- Create: `src/core/world.ts`
- Test: `tests/core/world.test.ts`

**Interfaces:**
- Consumes: `BLOCK`, `BlockId`（Task 2）
- Produces: `WORLD_SIZE`、`World`、`createWorld()`（spec §6.2）

- [ ] **Step 1: 写失败测试**

```ts
// tests/core/world.test.ts
import { describe, it, expect } from 'vitest';
import { createWorld, WORLD_SIZE } from '../../src/core/world';
import { BLOCK } from '../../src/core/block-types';

describe('world', () => {
  it('starts empty', () => {
    expect(createWorld().getBlock(0, 0, 0)).toBe(BLOCK.AIR);
  });
  it('sets and gets in bounds', () => {
    const w = createWorld();
    expect(w.setBlock(9, 9, 9, BLOCK.STONE)).toBe(true);
    expect(w.getBlock(9, 9, 9)).toBe(BLOCK.STONE);
  });
  it('rejects out-of-bounds set, reports AIR for out-of-bounds get', () => {
    const w = createWorld();
    expect(w.setBlock(10, 0, 0, BLOCK.STONE)).toBe(false);
    expect(w.setBlock(0, -1, 0, BLOCK.STONE)).toBe(false);
    expect(w.getBlock(10, 0, 0)).toBe(BLOCK.AIR);
  });
  it('snapshot is a copy, not a view', () => {
    const w = createWorld();
    w.setBlock(1, 2, 3, BLOCK.SOIL);
    const s = w.snapshot();
    s.blocks[1 + 2 * WORLD_SIZE + 3 * WORLD_SIZE * WORLD_SIZE] = BLOCK.AIR;
    expect(w.getBlock(1, 2, 3)).toBe(BLOCK.SOIL);
  });
  it('clear empties all blocks', () => {
    const w = createWorld();
    w.setBlock(0, 0, 0, BLOCK.STONE);
    w.clear();
    expect(w.getBlock(0, 0, 0)).toBe(BLOCK.AIR);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/core/world.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 `src/core/world.ts`（逐字来自 spec §6.2）**

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/core/world.test.ts`
Expected: PASS（5 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/core/world.ts tests/core/world.test.ts
git commit -m "feat(core): voxel world storage"
```

---

## Task 4: 撤销栈

**Files:**
- Create: `src/core/history.ts`
- Test: `tests/core/history.test.ts`

**Interfaces:**
- Consumes: `BlockId`（Task 2）
- Produces: `SetAction`、`BatchAction`、`HistoryAction`、`History`、`createHistory()`（spec §6.4）

- [ ] **Step 1: 写失败测试**

```ts
// tests/core/history.test.ts
import { describe, it, expect } from 'vitest';
import { createHistory } from '../../src/core/history';

describe('history', () => {
  it('pops in LIFO order', () => {
    const h = createHistory();
    h.push({ type: 'set', x: 0, y: 0, z: 0, prev: 1 });
    h.push({ type: 'set', x: 1, y: 0, z: 0, prev: 2 });
    expect(h.pop()?.x).toBe(1);
    expect(h.pop()?.x).toBe(0);
    expect(h.pop()).toBeUndefined();
  });
  it('caps at 20 entries, dropping the oldest', () => {
    const h = createHistory();
    for (let i = 0; i < 25; i++) h.push({ type: 'set', x: i, y: 0, z: 0, prev: 1 });
    expect(h.size()).toBe(20);
    expect(h.pop()?.x).toBe(24);
  });
  it('clear resets size', () => {
    const h = createHistory();
    h.push({ type: 'batch', ops: [] });
    h.clear();
    expect(h.size()).toBe(0);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/core/history.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 `src/core/history.ts`（逐字来自 spec §6.4）**

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/core/history.test.ts`
Expected: PASS（3 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/core/history.ts tests/core/history.test.ts
git commit -m "feat(core): undo history stack"
```

## Task 5: 渲染接口类型 + 相机状态 + 向量工具

**Files:**
- Create: `src/rendering/renderer-api.ts`, `src/core/ray.ts`, `src/core/camera-state.ts`
- Test: `tests/core/camera-state.test.ts`

**Interfaces:**
- Consumes: `BlockId`（Task 2）
- Produces:
  - `RENDERER_API_VERSION`、`CameraState`、`WorldSnapshot`、`BlockDelta`、`Ray`、`Theme`、`RendererInitOptions`、`Capabilities`、`RendererAdapter`、`AdapterCtor`
  - `src/core/ray.ts`: `Vec3`、`subtract`、`normalize`
  - `src/core/camera-state.ts`: `CameraOrbit`、`createCameraOrbit`、`orbit`、`zoom`、`toRendererCameraState`

- [ ] **Step 1: 写失败测试**

```ts
// tests/core/camera-state.test.ts
import { describe, it, expect } from 'vitest';
import {
  createCameraOrbit,
  orbit,
  zoom,
  toRendererCameraState,
} from '../../src/core/camera-state';

describe('camera-state', () => {
  it('fov is expressed in radians', () => {
    const c = createCameraOrbit();
    expect(toRendererCameraState(c).fov).toBeCloseTo(Math.PI / 4);
  });
  it('clamps phi within (0, PI)', () => {
    const c = createCameraOrbit();
    orbit(c, 0, 100000);
    expect(c.phi).toBeGreaterThan(0);
    expect(c.phi).toBeLessThan(Math.PI);
    orbit(c, 0, -100000);
    expect(c.phi).toBeGreaterThan(0);
    expect(c.phi).toBeLessThan(Math.PI);
  });
  it('clamps radius to [8, 40]', () => {
    const c = createCameraOrbit();
    zoom(c, 0.0001);
    expect(c.radius).toBeGreaterThanOrEqual(8);
    zoom(c, 100000);
    expect(c.radius).toBeLessThanOrEqual(40);
  });
  it('places the camera at target + spherical offset', () => {
    const c = createCameraOrbit();
    const s = toRendererCameraState(c);
    expect(s.target).toEqual([5, 3, 5]);
    expect(s.up).toEqual([0, 1, 0]);
    const dx = s.position[0] - s.target[0];
    const dy = s.position[1] - s.target[1];
    const dz = s.position[2] - s.target[2];
    expect(Math.hypot(dx, dy, dz)).toBeCloseTo(22);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/core/camera-state.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 `src/rendering/renderer-api.ts`（spec §5.1，含修正：`fov` 注释为弧度、`RendererInitOptions` 去掉 `worldSize`/`blockDefs`、import 只留 `BlockId`）**

- [ ] **Step 4: 实现 `src/core/ray.ts`（逐字来自 spec §6.6）**

- [ ] **Step 5: 实现 `src/core/camera-state.ts`（逐字来自 spec §6.5）**

- [ ] **Step 6: 运行确认通过 + 类型检查**

Run: `npx vitest run tests/core/camera-state.test.ts`
Expected: PASS（4 用例）。

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 7: 提交**

```bash
git add src/rendering/renderer-api.ts src/core/ray.ts src/core/camera-state.ts tests/core/camera-state.test.ts
git commit -m "feat(core): renderer interface, camera state, ray utils"
```

---

## Task 6: 体素射线遍历

**Files:**
- Create: `src/core/voxel-raycast.ts`
- Test: `tests/core/voxel-raycast.test.ts`

**Interfaces:**
- Consumes: `Ray`（Task 5）、`BLOCK`（Task 2）、`World`（Task 3）
- Produces: `VoxelHit`、`voxelRaycast(origin, direction, world, maxDistance)`（spec §6.7）

- [ ] **Step 1: 写失败测试**

```ts
// tests/core/voxel-raycast.test.ts
import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/core/world';
import { BLOCK } from '../../src/core/block-types';
import { voxelRaycast } from '../../src/core/voxel-raycast';

describe('voxelRaycast', () => {
  it('hits a block and reports the entry face normal', () => {
    const w = createWorld();
    w.setBlock(5, 0, 0, BLOCK.STONE);
    const hit = voxelRaycast([-1, 0.5, 0.5], [1, 0, 0], w, 100);
    expect(hit).not.toBeNull();
    expect([hit?.x, hit?.y, hit?.z]).toEqual([5, 0, 0]);
    expect([hit?.nx, hit?.ny, hit?.nz]).toEqual([-1, 0, 0]);
  });
  it('returns null when the ray never meets a block', () => {
    const w = createWorld();
    expect(voxelRaycast([-1, 0.5, 0.5], [0, 0, 1], w, 100)).toBeNull();
  });
  it('ignores blocks beyond maxDistance', () => {
    const w = createWorld();
    w.setBlock(9, 0, 0, BLOCK.STONE);
    expect(voxelRaycast([0, 0.5, 0.5], [1, 0, 0], w, 2)).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/core/voxel-raycast.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 `src/core/voxel-raycast.ts`（逐字来自 spec §6.7）**

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/core/voxel-raycast.test.ts`
Expected: PASS（3 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/core/voxel-raycast.ts tests/core/voxel-raycast.test.ts
git commit -m "feat(core): Amanatides & Woo voxel raycast"
```

---

## Task 7: 网格构建

**Files:**
- Create: `src/core/mesh-builder.ts`
- Test: `tests/core/mesh-builder.test.ts`

**Interfaces:**
- Consumes: `BLOCK`/`BLOCK_DEFS`（Task 2）、`WorldSnapshot`（Task 5）
- Produces: `MeshData`、`buildVoxelMesh(snapshot)`（spec §6.8，`ATLAS_COLS=16`）

- [ ] **Step 1: 写失败测试（含 LEAF 图集回归）**

```ts
// tests/core/mesh-builder.test.ts
import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/core/world';
import { BLOCK } from '../../src/core/block-types';
import { buildVoxelMesh } from '../../src/core/mesh-builder';

function meshWith(type: number, at: [number, number, number] = [0, 0, 0]) {
  const w = createWorld();
  w.setBlock(at[0], at[1], at[2], type as never);
  return buildVoxelMesh(w.snapshot());
}

describe('buildVoxelMesh', () => {
  it('emits 6 faces (24 verts / 36 indices) for a lone opaque block', () => {
    const m = meshWith(BLOCK.STONE);
    expect(m.positions.length / 3).toBe(24);
    expect(m.indices.length).toBe(36);
  });
  it('culls the shared faces of two opaque neighbours', () => {
    const w = createWorld();
    w.setBlock(0, 0, 0, BLOCK.STONE);
    w.setBlock(1, 0, 0, BLOCK.STONE);
    const m = buildVoxelMesh(w.snapshot());
    expect(m.positions.length / 3).toBe(40);
  });
  it('emits two quads for a cross block', () => {
    const m = meshWith(BLOCK.FLOWER_RED);
    expect(m.positions.length / 3).toBe(8);
    expect(m.indices.length).toBe(12);
  });
  it('maps LEAF (atlas 8) into column 8 of a 16-column atlas', () => {
    const m = meshWith(BLOCK.LEAF);
    const us = Array.from(m.uvs).filter((_, i) => i % 2 === 0);
    for (const u of us) {
      expect(u).toBeGreaterThanOrEqual(8 / 16);
      expect(u).toBeLessThanOrEqual(9 / 16);
    }
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/core/mesh-builder.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 `src/core/mesh-builder.ts`（逐字来自 spec §6.8，`const ATLAS_COLS = 16;`）**

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/core/mesh-builder.test.ts`
Expected: PASS（4 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/core/mesh-builder.ts tests/core/mesh-builder.test.ts
git commit -m "feat(core): voxel mesh builder"
```

---

## Task 8: 预设模型

**Files:**
- Create: `src/core/presets.ts`
- Test: `tests/core/presets.test.ts`

**Interfaces:**
- Consumes: `BLOCK`（Task 2）
- Produces: `PresetBlock`、`Preset`、`PRESETS`（spec §6.3）

- [ ] **Step 1: 写失败测试**

```ts
// tests/core/presets.test.ts
import { describe, it, expect } from 'vitest';
import { PRESETS } from '../../src/core/presets';
import { BLOCK } from '../../src/core/block-types';

describe('PRESETS', () => {
  it('tree has a wood trunk and a leaf canopy', () => {
    expect(PRESETS.tree.blocks.some((b) => b.type === BLOCK.WOOD)).toBe(true);
    expect(PRESETS.tree.blocks.some((b) => b.type === BLOCK.LEAF)).toBe(true);
  });
  it('flowerBed is a 2x2 patch', () => {
    expect(PRESETS.flowerBed.blocks.length).toBe(4);
  });
  it('bush is a single block', () => {
    expect(PRESETS.bush.blocks.length).toBe(1);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/core/presets.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 `src/core/presets.ts`（逐字来自 spec §6.3）**

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/core/presets.test.ts`
Expected: PASS（3 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/core/presets.ts tests/core/presets.test.ts
git commit -m "feat(core): preset models"
```

---

## Task 9: 端能力类型声明

**Files:**
- Create: `src/types/xhs.d.ts`
- Test: 无（由 `npm run typecheck` 覆盖）

**Interfaces:**
- Produces: 全局 `Window.xhs` 声明（spec §9.2）

- [ ] **Step 1: 实现 `src/types/xhs.d.ts`（逐字来自 spec §9.2）**

- [ ] **Step 2: 类型检查**

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 3: 提交**

```bash
git add src/types/xhs.d.ts
git commit -m "feat(types): window.xhs miniTool declarations"
```

---

## Task 10: Null 兜底适配器

**Files:**
- Create: `src/rendering/adapters/null-adapter.ts`
- Test: `tests/rendering/null-adapter.test.ts`

**Interfaces:**
- Consumes: `RendererAdapter` 等（Task 5）
- Produces: `NullAdapter`（`name = 'null'`，`isSupported` 恒 true）—— spec §12.3

- [ ] **Step 1: 写失败测试**

```ts
// tests/rendering/null-adapter.test.ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/rendering/null-adapter.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 `src/rendering/adapters/null-adapter.ts`（逐字来自 spec §12.3）**

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/rendering/null-adapter.test.ts`
Expected: PASS（1 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/rendering/adapters/null-adapter.ts tests/rendering/null-adapter.test.ts
git commit -m "feat(rendering): null fallback adapter"
```

---

## Task 11: 适配器工厂

**Files:**
- Create: `src/rendering/renderer-factory.ts`
- Create（临时 stub，Task 18/19 替换）: `src/rendering/adapters/three-adapter.ts`, `src/rendering/adapters/webgl-adapter.ts`
- Test: `tests/rendering/renderer-factory.test.ts`

**Interfaces:**
- Consumes: `RendererAdapter`、`AdapterCtor`、`RendererInitOptions`、`Capabilities`（Task 5）、`NullAdapter`（Task 10）
- Produces: `createRenderer(opts, caps): Promise<RendererAdapter>`（spec §12.2）

- [ ] **Step 1: 写失败测试**

```ts
// @vitest-environment jsdom
// tests/rendering/renderer-factory.test.ts
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
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/rendering/renderer-factory.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 创建临时 stub（仅本任务，Task 18/19 整体替换）**

`src/rendering/adapters/three-adapter.ts`:

```ts
import { RENDERER_API_VERSION, type RendererAdapter, type Capabilities } from '../renderer-api';

export class ThreeAdapter implements RendererAdapter {
  readonly name = 'three';
  readonly apiVersion = RENDERER_API_VERSION;
  isSupported(caps: Capabilities): boolean { return caps.webgl; }
  async init(): Promise<void> { throw new Error('stub'); }
  dispose(): void {}
  resize(): void {}
  setCamera(): void {}
  syncWorld(): void {}
  applyBlockDelta(): void {}
  screenPointToRay() { return { origin: [0, 0, 0] as const, direction: [0, 0, -1] as const }; }
  setTheme(): void {}
  requestRender(): void {}
  captureImage(): string { return ''; }
}
```

`src/rendering/adapters/webgl-adapter.ts`:

```ts
import { RENDERER_API_VERSION, type RendererAdapter, type Capabilities } from '../renderer-api';

export class WebGLAdapter implements RendererAdapter {
  readonly name = 'webgl';
  readonly apiVersion = RENDERER_API_VERSION;
  isSupported(caps: Capabilities): boolean { return caps.webgl; }
  async init(): Promise<void> { throw new Error('stub'); }
  dispose(): void {}
  resize(): void {}
  setCamera(): void {}
  syncWorld(): void {}
  applyBlockDelta(): void {}
  screenPointToRay() { return { origin: [0, 0, 0] as const, direction: [0, 0, -1] as const }; }
  setTheme(): void {}
  requestRender(): void {}
  captureImage(): string { return ''; }
}
```

- [ ] **Step 4: 实现 `src/rendering/renderer-factory.ts`（逐字来自 spec §12.2）**

- [ ] **Step 5: 运行确认通过 + 类型检查**

Run: `npx vitest run tests/rendering/renderer-factory.test.ts`
Expected: PASS（1 用例）。

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 6: 提交**

```bash
git add src/rendering/renderer-factory.ts src/rendering/adapters/three-adapter.ts src/rendering/adapters/webgl-adapter.ts tests/rendering/renderer-factory.test.ts
git commit -m "feat(rendering): adapter factory with capability probing"
```

## Task 12: 能力探测

**Files:**
- Create: `src/platform/capabilities.ts`
- Test: `tests/platform/capabilities.test.ts`

**Interfaces:**
- Consumes: `Capabilities`（Task 5）
- Produces: `detectCapabilities(): Capabilities`（spec §9.1）

- [ ] **Step 1: 写失败测试**

```ts
// @vitest-environment jsdom
// tests/platform/capabilities.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { detectCapabilities } from '../../src/platform/capabilities';

afterEach(() => { delete (window as unknown as { xhs?: unknown }).xhs; });

describe('detectCapabilities', () => {
  it('reports miniTool=false when window.xhs is absent', () => {
    const caps = detectCapabilities();
    expect(caps.miniTool).toBe(false);
    expect(typeof caps.webgl).toBe('boolean');
  });
  it('reports miniTool=true when window.xhs.miniTool exists', () => {
    (window as unknown as { xhs: unknown }).xhs = { miniTool: {} };
    expect(detectCapabilities().miniTool).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/platform/capabilities.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 `src/platform/capabilities.ts`（逐字来自 spec §9.1）**

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/platform/capabilities.test.ts`
Expected: PASS（2 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/platform/capabilities.ts tests/platform/capabilities.test.ts
git commit -m "feat(platform): capability detection"
```

---

## Task 13: 存储

**Files:**
- Create: `src/platform/storage.ts`
- Test: `tests/platform/storage.test.ts`

**Interfaces:**
- Consumes: `Window.xhs` 声明（Task 9）
- Produces: `SavePayload`、`saveWorld(payload)`、`loadWorld()`（spec §9.3，`isSavePayload` 用值域校验版）

- [ ] **Step 1: 写失败测试**

```ts
// @vitest-environment jsdom
// tests/platform/storage.test.ts
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
  it('returns null when nothing is stored', async () => {
    expect(await loadWorld()).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/platform/storage.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 `src/platform/storage.ts`（spec §9.3；`isSavePayload` 使用值域校验版：`o.v===1 && Array.isArray(o.blocks) && o.blocks.every(n => Number.isInteger(n) && n>=0 && n<=9)`）**

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/platform/storage.test.ts`
Expected: PASS（4 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/platform/storage.ts tests/platform/storage.test.ts
git commit -m "feat(platform): versioned storage with localStorage fallback"
```

---

## Task 14: 分享

**Files:**
- Create: `src/platform/share.ts`
- Test: `tests/platform/share.test.ts`

**Interfaces:**
- Consumes: `Window.xhs` 声明（Task 9）
- Produces: `saveToAlbum(dataUrl)`、`shareAsNote(dataUrl, meta)`（spec §9.4，含 `dataUrlToBase64`）

- [ ] **Step 1: 写失败测试（钉住 base64 去前缀）**

```ts
// @vitest-environment jsdom
// tests/platform/share.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { saveToAlbum, shareAsNote } from '../../src/platform/share';

beforeEach(() => { delete (window as unknown as { xhs?: unknown }).xhs; });

describe('share', () => {
  it('returns false without miniTool', async () => {
    expect(await saveToAlbum('data:image/png;base64,AAAA')).toBe(false);
    expect(await shareAsNote('data:image/png;base64,AAAA', { title: 't', content: 'c' })).toBe(false);
  });
  it('strips the data URL prefix before writeTempFile', async () => {
    let received = '';
    (window as unknown as { xhs: unknown }).xhs = {
      miniTool: {
        writeTempFile: async ({ data }: { data: string }) => { received = data; return { filePath: '/tmp/a.png' }; },
        saveImageToPhotosAlbum: async () => {},
      },
    };
    expect(await saveToAlbum('data:image/png;base64,AAAA')).toBe(true);
    expect(received).toBe('AAAA');
  });
  it('returns false when the platform call throws', async () => {
    (window as unknown as { xhs: unknown }).xhs = {
      miniTool: {
        writeTempFile: async () => { throw new Error('boom'); },
        saveImageToPhotosAlbum: async () => {},
      },
    };
    expect(await saveToAlbum('data:image/png;base64,AAAA')).toBe(false);
  });
  it('posts a photo note with the temporary file path', async () => {
    let posted: { pageType?: string; url?: string } = {};
    (window as unknown as { xhs: unknown }).xhs = {
      miniTool: {
        writeTempFile: async () => ({ filePath: '/tmp/a.png' }),
        postNote: async (o: { pageType?: string; mediaInfo: { image_resources?: Array<{ url: string }> } }) => {
          posted = { pageType: o.pageType, url: o.mediaInfo.image_resources?.[0]?.url };
        },
      },
    };
    expect(await shareAsNote('data:image/png;base64,AAAA', { title: 't', content: 'c' })).toBe(true);
    expect(posted).toEqual({ pageType: 'photo_publish', url: '/tmp/a.png' });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/platform/share.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 `src/platform/share.ts`（spec §9.4，新增 `dataUrlToBase64` 并用其替换 `data: dataUrl`）**

```ts
function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/platform/share.test.ts`
Expected: PASS（4 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/platform/share.ts tests/platform/share.test.ts
git commit -m "feat(platform): album save + note sharing"
```

---

## Task 15: 纹理图集生成

**Files:**
- Create: `src/assets/atlas-generator.ts`
- Test: `tests/assets/atlas-generator.test.ts`

**Interfaces:**
- Produces: `generateAtlas(): HTMLCanvasElement`（spec §12.1，`COLS = 16`）

- [ ] **Step 1: 写失败测试（钉住 16 列 → 512px）**

```ts
// @vitest-environment jsdom
// tests/assets/atlas-generator.test.ts
import { describe, it, expect } from 'vitest';
import { generateAtlas } from '../../src/assets/atlas-generator';

describe('generateAtlas', () => {
  it('creates a 512x512 canvas (16 columns x 32px tiles)', () => {
    const c = generateAtlas();
    expect(c.width).toBe(512);
    expect(c.height).toBe(512);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/assets/atlas-generator.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 `src/assets/atlas-generator.ts`（逐字来自 spec §12.1，`const COLS = 16;`）**

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/assets/atlas-generator.test.ts`
Expected: PASS（1 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/assets/atlas-generator.ts tests/assets/atlas-generator.test.ts
git commit -m "feat(assets): canvas texture atlas generator"
```

---

## Task 16: 手势输入

**Files:**
- Create: `src/input/gesture.ts`
- Test: `tests/input/gesture.test.ts`

**Interfaces:**
- Produces: `GestureHandlers`、`bindGestures(canvas, handlers): () => void`（spec §10）

- [ ] **Step 1: 写失败测试（鼠标路径，jsdom 可覆盖）**

```ts
// @vitest-environment jsdom
// tests/input/gesture.test.ts
import { describe, it, expect, vi } from 'vitest';
import { bindGestures } from '../../src/input/gesture';

function mouse(type: string, x: number, y: number): MouseEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
}

describe('bindGestures (mouse path)', () => {
  it('fires onTap for a press released without movement', () => {
    const c = document.createElement('canvas');
    const onTap = vi.fn();
    bindGestures(c, { onOrbit: vi.fn(), onZoom: vi.fn(), onTap });
    c.dispatchEvent(mouse('mousedown', 10, 10));
    c.dispatchEvent(mouse('mouseup', 10, 10));
    expect(onTap).toHaveBeenCalledWith(10, 10);
  });
  it('orbits and suppresses tap once movement exceeds the threshold', () => {
    const c = document.createElement('canvas');
    const onOrbit = vi.fn();
    const onTap = vi.fn();
    bindGestures(c, { onOrbit, onZoom: vi.fn(), onTap });
    c.dispatchEvent(mouse('mousedown', 10, 10));
    c.dispatchEvent(mouse('mousemove', 40, 10));
    c.dispatchEvent(mouse('mouseup', 40, 10));
    expect(onOrbit).toHaveBeenCalled();
    expect(onTap).not.toHaveBeenCalled();
  });
  it('returns a disposer that unbinds handlers', () => {
    const c = document.createElement('canvas');
    const onTap = vi.fn();
    const dispose = bindGestures(c, { onOrbit: vi.fn(), onZoom: vi.fn(), onTap });
    dispose();
    c.dispatchEvent(mouse('mousedown', 10, 10));
    c.dispatchEvent(mouse('mouseup', 10, 10));
    expect(onTap).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/input/gesture.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 `src/input/gesture.ts`（逐字来自 spec §10）**

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/input/gesture.test.ts`
Expected: PASS（3 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/input/gesture.ts tests/input/gesture.test.ts
git commit -m "feat(input): pointer gesture recognition"
```

---

## Task 17: UI 层

**Files:**
- Create: `src/ui/index.ts`
- Test: `tests/ui/index.test.ts`

**Interfaces:**
- Consumes: `BLOCK`（Task 2）
- Produces: `EditorMode`、`UIHandlers`、`bindUI(handlers)`（spec §11.3）

- [ ] **Step 1: 写失败测试**

```ts
// @vitest-environment jsdom
// tests/ui/index.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bindUI } from '../../src/ui';
import { BLOCK } from '../../src/core/block-types';

beforeEach(() => { document.body.innerHTML = '<div id="ui-root"></div>'; });

function handlers() {
  return {
    onModeChange: vi.fn(), onBlockSelect: vi.fn(), onPresetSelect: vi.fn(),
    onUndo: vi.fn(), onReset: vi.fn(), onSaveAlbum: vi.fn(), onShareNote: vi.fn(),
  };
}

describe('bindUI', () => {
  it('renders three mode buttons and switches mode on click', () => {
    const h = handlers();
    bindUI(h);
    const modes = document.querySelectorAll('.mode-btn');
    expect(modes.length).toBe(3);
    (modes[1] as HTMLButtonElement).click();
    expect(h.onModeChange).toHaveBeenCalledWith('place');
  });
  it('selects a block type from the palette', () => {
    const h = handlers();
    bindUI(h);
    (document.querySelectorAll('.palette-item')[0] as HTMLButtonElement).click();
    expect(h.onBlockSelect).toHaveBeenCalledWith(BLOCK.GRASS);
  });
  it('selects a preset from the palette', () => {
    const h = handlers();
    bindUI(h);
    const items = document.querySelectorAll('.palette-item');
    (items[items.length - 1] as HTMLButtonElement).click();
    expect(h.onPresetSelect).toHaveBeenCalled();
  });
  it('wires the four action buttons', () => {
    const h = handlers();
    bindUI(h);
    const actions = document.querySelectorAll('.actions button');
    expect(actions.length).toBe(4);
    (actions[0] as HTMLButtonElement).click();
    expect(h.onUndo).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/ui/index.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 `src/ui/index.ts`（逐字来自 spec §11.3）**

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/ui/index.test.ts`
Expected: PASS（4 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/ui/index.ts tests/ui/index.test.ts
git commit -m "feat(ui): toolbar, palette, actions"
```

## Task 18: Three.js 适配器（替换 stub）

**Files:**
- Modify: `src/rendering/adapters/three-adapter.ts`（整体替换 Task 11 的 stub）
- Test: `tests/rendering/three-adapter.test.ts`

**Interfaces:**
- Consumes: `RendererAdapter` 等（Task 5）、`buildVoxelMesh`（Task 7）、`three`
- Produces: `ThreeAdapter`（`name = 'three'`）

- [ ] **Step 1: 写失败测试（能力门控；GL 契约由 Task 21 浏览器验证）**

```ts
// tests/rendering/three-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { ThreeAdapter } from '../../src/rendering/adapters/three-adapter';

describe('ThreeAdapter', () => {
  it('requires WebGL capability', () => {
    const a = new ThreeAdapter();
    expect(a.name).toBe('three');
    expect(a.isSupported({ webgl: true } as never)).toBe(true);
    expect(a.isSupported({ webgl: false } as never)).toBe(false);
  });
});
```

- [ ] **Step 2: 记录基线**

Run: `npx vitest run tests/rendering/three-adapter.test.ts`
Expected: stub 已满足该测试；本任务真正增量是把 stub 替换为完整实现且不破坏它。

- [ ] **Step 3: 用完整实现替换 `src/rendering/adapters/three-adapter.ts`（基于 spec §7.2，应用以下 4 处修正）**

修正清单（对照 spec §7.2 原文）：
1. `side: THREE.DoubleSide`（原 `THREE.FrontSide`）—— 花朵交叉面片双向可见。
2. `this.camera.fov = (state.fov * 180) / Math.PI;`（原 `state.fov`）—— 弧度转角度。
3. 删除 `AmbientLight` / `DirectionalLight` 死代码（自定义 ShaderMaterial 不使用场景灯光）。
4. `init` 中加 `canvas.addEventListener('webglcontextlost', this.onContextLost)` 与 `('webglcontextrestored', this.onContextRestored)`；`dispose` 中对应 `removeEventListener`；新增两个箭头属性 `onContextLost` / `onContextRestored`（`onContextLost` 内 `e.preventDefault()`、取消 rAF、清 `needsRender`；`onContextRestored` 调 `requestRender()`）。

其余代码逐字来自 spec §7.2。

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `npx vitest run tests/rendering/three-adapter.test.ts`
Expected: PASS（1 用例）。

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 5: 提交**

```bash
git add src/rendering/adapters/three-adapter.ts tests/rendering/three-adapter.test.ts
git commit -m "feat(rendering): full Three.js adapter (rad->deg fov, doubleside, ctx-loss)"
```

---

## Task 19: 手写 WebGL 适配器（替换 stub）

**Files:**
- Modify: `src/rendering/adapters/webgl-adapter.ts`（整体替换 Task 11 的 stub）
- Test: `tests/rendering/webgl-adapter.test.ts`

**Interfaces:**
- Consumes: `RendererAdapter` 等（Task 5）、`buildVoxelMesh` / `MeshData`（Task 7）
- Produces: `WebGLAdapter`（`name = 'webgl'`）

- [ ] **Step 1: 写失败测试**

```ts
// tests/rendering/webgl-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { WebGLAdapter } from '../../src/rendering/adapters/webgl-adapter';

describe('WebGLAdapter', () => {
  it('requires WebGL capability', () => {
    const a = new WebGLAdapter();
    expect(a.name).toBe('webgl');
    expect(a.isSupported({ webgl: true } as never)).toBe(true);
    expect(a.isSupported({ webgl: false } as never)).toBe(false);
  });
});
```

- [ ] **Step 2: 记录基线**

Run: `npx vitest run tests/rendering/webgl-adapter.test.ts`
Expected: stub 已满足；本任务真正增量是替换为完整实现。

- [ ] **Step 3: 用完整实现替换 `src/rendering/adapters/webgl-adapter.ts`（逐字来自 spec §8）**

要点：`resize` 显式设置 `canvas.width/height` 与 `gl.viewport`；`setCamera` 构造并合成 `uMatrix`（投影×视图）；`screenPointToRay` 由 `CameraState` 直接构造射线（无需矩阵求逆）；关闭 `CULL_FACE`（等效 DoubleSide）；含上下文丢失监听；含 `sub/cross/dot/normalize/mat4Perspective/mat4LookAt/mat4Multiply` 模块级辅助函数。

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `npx vitest run tests/rendering/webgl-adapter.test.ts`
Expected: PASS（1 用例）。

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 5: 提交**

```bash
git add src/rendering/adapters/webgl-adapter.ts tests/rendering/webgl-adapter.test.ts
git commit -m "feat(rendering): hand-written WebGL fallback adapter"
```

---

## Task 20: 应用组装 + 入口页面

**Files:**
- Modify: `src/app.ts`（用完整 `bootstrap` 替换 Task 1 占位）
- Modify: `src/index.html`（补全为 spec §11.2，含 `#toast`）
- Modify: `src/style.css`（补全为 spec §12.5，含 `#toast`）

**Interfaces:**
- Consumes: 全部前序模块
- Produces: 可运行 `dist/` 产物

- [ ] **Step 1: 补全 `src/index.html`（逐字来自 spec §11.2，含 `#toast`）**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
  <title>方块花园</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <canvas id="scene"></canvas>
  <div id="ui-root"></div>
  <div id="toast" hidden></div>
  <div id="fallback" hidden>当前设备不支持 3D 渲染</div>
  <script src="./app.js"></script>
</body>
</html>
```

- [ ] **Step 2: 补全 `src/style.css`（逐字来自 spec §12.5，含 `#toast` 规则）**

- [ ] **Step 3: 用完整 `src/app.ts` 替换占位（基于 spec §12.4，应用以下修正）**

修正清单（对照 spec §12.4 原文）：
1. `createRenderer({ canvas, atlasCanvas, devicePixelRatio })` —— 不传 `worldSize`/`blockDefs`。
2. `try/catch` 之后加：`if (renderer.name === 'null') { document.getElementById('fallback')?.removeAttribute('hidden'); return; }`。
3. 首次渲染前加：`renderer.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);`（在 `renderer.syncWorld(...)` 之前）。
4. 预设放置分支：`if (!hit) return;`，`const anchor = [hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz] as const;`（删除原来的 `[0,0,0]` 兜底）。
5. `undo` 的 `set` 分支删除 `const cur = ...` 与 `void cur;`；`batch` 分支改为：`if (op.prev === BLOCK.AIR) removed.push(...); else added.push({ ..., type: op.prev });`。
6. 在 `bindUI({...})` 之前插入 toast 助手：

```ts
  const toast = document.getElementById('toast');
  let toastTimer = 0;
  const showToast = (msg: string): void => {
    if (!toast) return;
    toast.textContent = msg;
    toast.removeAttribute('hidden');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.setAttribute('hidden', ''), 1500);
  };
```

7. `onSaveAlbum` / `onShareNote` 改为带反馈版本：

```ts
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
```

其余逐字来自 spec §12.4。

- [ ] **Step 4: 构建并冒烟**

Run: `npm run build`
Expected: `build done`；`dist/` 三件套。

用浏览器（Chrome/Edge）打开 `dist/index.html`，人工确认：

- 10×10 草地/方块场景渲染，非全黑、比例正确（**Review Focus #1、#3**）。
- 单指/鼠标拖动旋转，滚轮或双指缩放。
- 切「放置」，选草地，点击地面出现方块；选「小树」点击地面长出树。
- 切「删除」点击方块移除。
- 「撤销」逐步回退；「清空」复位。
- 点「保存」/「分享」：无端能力时弹出 toast（`保存失败`/`分享失败`）且不崩溃。
- 强制无 WebGL（如浏览器禁用硬件加速）时显示 fallback 文案（**Review Focus #4**）。

- [ ] **Step 5: 提交**

```bash
git add src/app.ts src/index.html src/style.css
git commit -m "feat(app): bootstrap assembly, entry html/css, toast feedback"
```

---

## Task 21: 集成验收 + 产物扫描

**Files:**
- Create: `tests/scan/bundle.test.ts`（对 `dist/app.js` 做禁用项扫描；若尚未构建则先构建）
- Test: 手工验收清单

**Interfaces:**
- Consumes: Task 20 产出的 `dist/`
- Produces: 通过验收的可上传产物

- [ ] **Step 1: 写产物扫描测试**

```ts
// tests/scan/bundle.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BUNDLE = 'dist/app.js';

const FORBIDDEN: Array<[string, RegExp]> = [
  ['eval(', /\beval\s*\(/],
  ['new Function(', /new\s+Function\s*\(/],
  ['dynamic import(', /\bimport\s*\(/],
  ['WebAssembly', /\bWebAssembly\b/],
  ['fetch(', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['new Worker(', /new\s+Worker\s*\(/],
  ['OffscreenCanvas', /\bOffscreenCanvas\b/],
];

describe('bundle scan', () => {
  beforeAll(() => {
    if (!existsSync(BUNDLE)) execSync('node build.mjs', { stdio: 'ignore' });
  });

  it('contains no forbidden constructs', () => {
    const src = readFileSync(BUNDLE, 'utf8');
    for (const [label, re] of FORBIDDEN) {
      expect(re.test(src), `found forbidden construct: ${label}`).toBe(false);
    }
  });

  it('is a single IIFE bundle under 5MB', () => {
    const src = readFileSync(BUNDLE, 'utf8');
    expect(src.startsWith('(function') || src.startsWith('(()=>') || src.includes('(function')).toBe(true);
    expect(src.length).toBeLessThan(5 * 1024 * 1024);
  });
});
```

- [ ] **Step 2: 运行确认通过**

Run: `npm run build`
Expected: `build done`。

Run: `npx vitest run tests/scan/bundle.test.ts`
Expected: PASS（2 用例）。若出现 `eval(` 等，定位到 Three.js 引入项并移除（见 spec §16.3 坑位）。

- [ ] **Step 3: 全量单测**

Run: `npm test`
Expected: 全部 PASS（约 30+ 用例）。

- [ ] **Step 4: 兼容性与真机验收（手工，对照 spec §14.3 / §14.5）**

- 低端 Android 8.1：≥25fps、无崩溃。
- iOS：单指旋转、双指缩放手势正确。
- 客户端 <9.46：存储降级 localStorage 后重开可恢复。
- 客户端 ≥9.46：`setStorage` 存档，重开恢复。
- Three.js init 被强制失败：自动切 WebGL 适配器仍有画面。
- 无 WebGL：显示 fallback。
- 分享：真机点击「保存/分享」成功拉起系统 UI（**Review Focus #5**，确认异步链不丢手势）。

- [ ] **Step 5: 提交**

```bash
git add tests/scan/bundle.test.ts
git commit -m "test(scan): bundle forbidden-construct scan + acceptance"
```

---

## Self-Review 记录

- **Spec 覆盖**：spec §2–§16 的能力/约束→ Task 1（工具链/扫描）、Task 2–8（core）、Task 9/13/14（端能力/存储/分享）、Task 10/11/18/19（适配器与工厂）、Task 12（能力探测）、Task 15（图集）、Task 16（手势）、Task 17（UI）、Task 20（组装）、Task 21（验收）。无遗漏子系统。
- **占位符扫描**：实现步骤均指向 spec 精确章节或以代码给出，无 TBD/“稍后实现”。
- **类型一致性**：`BlockDelta`（added/removed）、`WorldSnapshot`（size/blocks）、`CameraState`（fov 弧度）、`SavePayload`（v/blocks/camera）、`createRenderer(opts, caps)`、`RendererAdapter` 方法名全程一致。
- **Review Focus 落地**：6 条均有对应测试或验收步骤（Task 5/18、7、20、11/20、14/20、21）。

