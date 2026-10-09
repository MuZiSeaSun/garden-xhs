# 方块花园 · 三维模型道具层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在既有体素方块花园上叠加「按单元格摆放的真实 3D 模型道具层」（Kenney Platformer Kit 12 个模型）：占用列拾取/摆放、双适配器分批渲染（Uint32）、存档 v2 向后兼容、三角形预算守卫。

**Architecture:** 体素层不动；新增 core 层（prop-types / prop-world 占用列 / pick 统一拾取 / prop-mesh-builder 共用批几何）→ renderer-api v2 只新增可选方法 → Three 与手写 WebGL 两个适配器各自实现 `definePropModels/syncProps/applyPropDelta`（按 modelId 分批、Uint32 索引、WebGL 走 `OES_element_index_uint`）→ app 接线（统一拾取放置/删除/撤销/存档/三角守卫）→ UI「模型」分组。构建期用纯 Node 脚本（零新增依赖）把 GLB+colormap 烘焙成 `src/assets/props.generated.ts`（base64 几何 + Previews 图标）。

**Tech Stack:** TypeScript 5.x（strict）、Node ≥22.6 原生跑 `.ts`（本机 24.19）、esbuild IIFE ES2017、Three.js 0.160（运行时仅 core，无 `three/examples`）、Vitest（node 环境 + 按文件 `// @vitest-environment jsdom`）。

**Spec:** `docs/方块花园-三维模型道具方案.md` —— **执行者必须同时阅读此文档**。计划内联全部实现与测试代码；与 spec 冲突时以 spec（已含 2026-10-09 实测修正）为准。

## Global Constraints

- 产物 ES2017 / Chrome 61（esbuild `target: ['es2017']`，IIFE，经典脚本）；zip 白名单文件类型，`.glb/.fbx/.obj/.mtl` 不进包。
- 运行时禁用项（`tests/scan/bundle.test.ts` 扫描必须为零）：`eval(`、`new Function(`、动态 `import(`、`WebAssembly`、`fetch(`、`XMLHttpRequest`、`WebSocket`、`EventSource`、`new Worker(`。**`three/examples` 不进入任何 import**（烘焙是纯 Node 解析，不用 GLTFLoader）。
- `core/` 不得 import `three`（只允许 `import type` 自 `rendering/renderer-api` 或本目录）。
- `RENDERER_API_VERSION` 1 → **2**，接口只新增**可选**方法；`PropDelta.removed` 每项含 `{ x, y, z, modelId }`。
- `STORAGE_KEY = 'garden_world_v1'` **不改名**；载荷 `v: 2`；`isSavePayload` 接受 `v === 1 | 2`，v1 无 `props` 视为空。
- `WORLD_SIZE = 10`；道具占用列 = 基础格向上 `height` 格、`footprint × footprint` 的柱体；`PropWorld` 不依赖体素世界。
- 批几何合并索引必须 **Uint32Array**；手写 WebGL 需 `gl.getExtension('OES_element_index_uint')`，缺失时 `init` 抛错走工厂降级。
- 道具批几何底面抬高 `BASE_EPSILON = 0.001`（WebGL 兜底不剔除背面，避免与地面共面 z-fighting）。
- 三角形预算守卫：`PROP_TRIANGLE_BUDGET = 90_000`，放置前用 `propTriangleCount` 估算，超限拒放 + toast。
- 素材根目录 `D:/Documents/lzx/assets/platformer-kit`；12 个模型（spec §12.1）：`tree crate barrel mushrooms rocks plant fence-straight sign flag coin-gold spring platform`。
- vitest 默认 node 环境，DOM 测试文件首行 `// @vitest-environment jsdom`；单测命令 `npx vitest run <file>`。
- `MAX_HISTORY = 20`、`CameraState.fov` 弧度、`atob` 全局（Chrome 61 与 Node ≥16 均有）。
- 每个任务结束 `npm run typecheck` 必须零错误（strict + noUnusedLocals）。

## Review Focus

Spec 是愿景文档，未明说的输入不等于允许它崩溃。以下失败模式在对应任务里有测试钉住：

1. **小模型 indices 是 `UNSIGNED_BYTE`(5121)**：只按 5123/5125 解析会让 fence-straight/coin-gold/platform 直接报错。→ Task 1（5121/5123/5125 三种 fixture 测试）。
2. **占用列与视觉不符 / 撤销序列错乱**：单格占用会「点树冠删掉后方地形」；LIFO 撤销必须能复位占用列。→ Task 4（占用列重叠/回退测试）、Task 5（树冠格命中道具而非地形测试）。
3. **道具底面与地面顶面完全共面 → z-fighting**：WebGL 兜底不剔除背面，共面会闪烁。→ Task 7（`BASE_EPSILON` 位移断言 `y > 0`）。
4. **老用户 v1 存档（无 props）在新版本被丢弃**：校验过严 = 数据丢失。→ Task 6（v1 兼容读取 + v2 拒绝非法项测试）。
5. **适配器切换丢道具层**：`switchRenderer` 漏 `definePropModels/syncProps` 则道具无声消失。→ Task 11（接线代码）+ Task 12（手工验收清单第 6 条钉住）。

## File Structure

```
garden-xhs/
├── package.json / tsconfig.json            # Task 1: include + scripts/**/*.ts、+bake:props script
├── scripts/bake-props.ts                     # Task 1–3 新增：纯 Node 烘焙（parseGlb/decodePngRgba/bakeModel/serializeModels/main）
├── src/
│   ├── core/prop-types.ts                    # Task 1 新增：PropModelData / PropInstance
│   ├── core/prop-world.ts                    # Task 4 新增：占用列双映射
│   ├── core/voxel-raycast.ts                # Task 5 修改：抽出 walkRay
│   ├── core/pick.ts                          # Task 5 新增：统一拾取
│   ├── core/history.ts                       # Task 6 修改：setProp/batchProp
│   ├── core/prop-mesh-builder.ts            # Task 7 新增：buildPropBatch/propTriangleCount
│   ├── assets/props.generated.ts             # Task 3 生成：base64 几何 + 图标（勿手改）
│   ├── rendering/renderer-api.ts            # Task 7 修改：v2 + 可选道具方法 + PropDelta
│   ├── rendering/adapters/three-adapter.ts  # Task 8 修改：道具分批
│   ├── rendering/adapters/webgl-adapter.ts  # Task 9 修改：第二 program
│   ├── platform/storage.ts                  # Task 6 修改：SavePayload v1|v2 union
│   ├── ui/index.ts                          # Task 10 修改：模型分组
│   ├── style.css                            # Task 10 修改：分组/图标样式
│   └── app.ts                               # Task 10–11 修改：接线
└── tests/
    ├── scripts/bake-props.test.ts            # Task 1–2 新增
    ├── assets/props-generated.test.ts       # Task 3 新增
    ├── core/prop-world.test.ts              # Task 4 新增
    ├── core/pick.test.ts                    # Task 5 新增（voxel-raycast.test.ts 回归）
    ├── core/history.test.ts                 # Task 6 扩展
    ├── platform/storage.test.ts             # Task 6 扩展
    ├── core/prop-mesh-builder.test.ts       # Task 7 新增
    ├── rendering/{three,webgl}-adapter.test.ts # Task 8/9 扩展
    ├── ui/index.test.ts                     # Task 10 修改
    └── scan/bundle.test.ts                  # Task 12 扩展
```

**依赖方向**：`app → core/platform/input/ui/assets → rendering/renderer-api ← adapters`；`assets/props.generated → core/prop-types`（仅 type）。

---

### Task 1: 烘焙脚本基础（prop-types + parseGlb + decodePngRgba）

**Files:**
- Create: `src/core/prop-types.ts`、`scripts/bake-props.ts`、`tests/scripts/bake-props.test.ts`
- Modify: `tsconfig.json`（include 加 `"scripts/**/*.ts"`）、`package.json`（scripts 加 `"bake:props": "node scripts/bake-props.ts"`）

**Interfaces:**
- Produces:
  - `src/core/prop-types.ts`：`interface PropModelData { readonly name: string; readonly icon: string; readonly positions: Float32Array; readonly normals: Float32Array; readonly colors: Float32Array; readonly indices: Uint16Array; readonly footprint: number; readonly height: number }`；`interface PropInstance { readonly id: number; readonly modelId: number; readonly x: number; readonly y: number; readonly z: number; readonly rot: 0 | 1 | 2 | 3 }`
  - `scripts/bake-props.ts`：`interface RawGltfMesh { readonly positions: Float32Array; readonly uvs: Float32Array; readonly indices: Uint32Array }`；`function parseGlb(bytes: Uint8Array): RawGltfMesh`；`interface RgbaImage { readonly width: number; readonly height: number; readonly rgba: Uint8Array }`；`function decodePngRgba(bytes: Uint8Array): RgbaImage`

- [ ] **Step 1: 写失败测试**

```ts
// tests/scripts/bake-props.test.ts
import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { parseGlb, decodePngRgba } from '../../scripts/bake-props';

// ---- 合成 GLB fixture（真实 kit 布局：单 node/单 mesh/单 primitive/mode 4）----
function concatU8(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function buildGlb(o: {
  positions: number[]; uvs: number[]; indices: number[];
  indexType?: 5121 | 5123 | 5125; nodeScale?: number[];
}): Uint8Array {
  const indexType = o.indexType ?? 5123;
  const pos = new Float32Array(o.positions);
  const uv = new Float32Array(o.uvs);
  const idx = indexType === 5121 ? new Uint8Array(o.indices)
    : indexType === 5123 ? new Uint16Array(o.indices)
    : new Uint32Array(o.indices);
  const bin = concatU8([new Uint8Array(pos.buffer), new Uint8Array(uv.buffer), new Uint8Array(idx.buffer)]);
  const json = {
    scene: 0, scenes: [{ nodes: [0] }],
    nodes: [o.nodeScale ? { mesh: 0, scale: o.nodeScale } : { mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, mode: 4 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5126, count: uv.length / 2, type: 'VEC2' },
      { bufferView: 2, componentType: indexType, count: idx.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.byteLength },
      { buffer: 0, byteOffset: pos.byteLength, byteLength: uv.byteLength },
      { buffer: 0, byteOffset: pos.byteLength + uv.byteLength, byteLength: idx.byteLength },
    ],
    buffers: [{ byteLength: bin.byteLength }],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  const bo = 20 + jsonBytes.length;
  dv.setUint32(bo, bin.length, true); dv.setUint32(bo + 4, 0x004e4942, true);
  out.set(bin, bo + 8);
  return out;
}

const TRI = {
  positions: [0, 0, 0, 1, 0, 0, 0, 0, 1],
  uvs: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
  indices: [0, 1, 2],
};

// ---- 合成 PNG fixture（解码器不校验 CRC，填 0）----
function buildPng(w: number, h: number, rows: Uint8Array[], colorType = 6): Uint8Array {
  const raw = concatU8(rows);
  const idat = deflateSync(raw);
  const ihdr = new Uint8Array(13);
  const dvh = new DataView(ihdr.buffer);
  dvh.setUint32(0, w); dvh.setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    return out;
  };
  return concatU8([
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(idat)), chunk('IEND', new Uint8Array(0)),
  ]);
}

describe('parseGlb', () => {
  it('parses UNSIGNED_SHORT indices', () => {
    const m = parseGlb(buildGlb(TRI));
    expect(Array.from(m.positions)).toEqual(TRI.positions);
    expect(Array.from(m.uvs)).toEqual(TRI.uvs);
    expect(Array.from(m.indices)).toEqual([0, 1, 2]);
  });
  it('parses UNSIGNED_BYTE indices (real kit layout for small models)', () => {
    expect(Array.from(parseGlb(buildGlb({ ...TRI, indexType: 5121 })).indices)).toEqual([0, 1, 2]);
  });
  it('parses UNSIGNED_INT indices', () => {
    expect(Array.from(parseGlb(buildGlb({ ...TRI, indexType: 5125 })).indices)).toEqual([0, 1, 2]);
  });
  it('rejects non-GLB bytes', () => {
    expect(() => parseGlb(new Uint8Array(64))).toThrow(/GLB/i);
  });
  it('rejects node TRS transforms', () => {
    expect(() => parseGlb(buildGlb({ ...TRI, nodeScale: [2, 2, 2] }))).toThrow(/TRS/i);
  });
});

describe('decodePngRgba', () => {
  it('decodes a filter-0 RGBA PNG', () => {
    const data = Uint8Array.from([10, 0, 0, 255, 20, 40, 60, 255]);
    const img = decodePngRgba(buildPng(2, 1, [Uint8Array.from([0, ...data])]));
    expect([img.width, img.height]).toEqual([2, 1]);
    expect(Array.from(img.rgba)).toEqual(Array.from(data));
  });
  it('decodes filter-1 (Sub) rows', () => {
    const orig = [10, 20, 30, 255, 50, 20, 30, 255];
    const sub = orig.map((v, i) => (i % 4 === 0 ? v : (v - orig[i - 4] + 256) % 256));
    const img = decodePngRgba(buildPng(2, 1, [Uint8Array.from([1, ...sub])]));
    expect(Array.from(img.rgba)).toEqual(orig);
  });
  it('rejects non-RGBA PNGs', () => {
    expect(() => decodePngRgba(buildPng(2, 1, [Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7])], 2))).toThrow(/unsupported PNG/i);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/scripts/bake-props.test.ts`
Expected: FAIL——`Cannot find module '../../scripts/bake-props'`。

- [ ] **Step 3: 写实现**

```ts
// src/core/prop-types.ts
export interface PropModelData {
  readonly name: string;
  readonly icon: string;
  readonly positions: Float32Array; // 3/顶点，已按 scale 表归一化、底面落在格底
  readonly normals: Float32Array;   // 3/顶点
  readonly colors: Float32Array;    // 3/顶点（colormap 采样，sRGB）
  readonly indices: Uint16Array;    // 单模型索引（恒 < 65k 顶点）
  readonly footprint: number;       // 占地格数（整数，≥1）
  readonly height: number;          // 占高格数（整数，≥1）
}

export interface PropInstance {
  readonly id: number;           // PropWorld 内部自增分配
  readonly modelId: number;     // 模型表索引
  readonly x: number;           // 基础格坐标（占用列自此格向上）
  readonly y: number;
  readonly z: number;
  readonly rot: 0 | 1 | 2 | 3;  // 首版固定 0，字段保留
}
```

```ts
// scripts/bake-props.ts
// 构建期烘焙脚本：纯 Node、零新增依赖；不进入产物。
// 运行：npm run bake:props（Node ≥22.6 原生剥离 .ts 类型）
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export interface RawGltfMesh {
  readonly positions: Float32Array; // 3/顶点
  readonly uvs: Float32Array;       // 2/顶点
  readonly indices: Uint32Array;    // 三角形列表
}

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

// ---- glTF JSON 最小结构 ----
interface GltfAccessor { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; sparse?: unknown; }
interface GltfBufferView { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number; }
interface GltfPrimitive { attributes: Record<string, number>; indices?: number; mode?: number; }
interface GltfMesh { primitives: GltfPrimitive[]; }
interface GltfNode { mesh?: number; children?: number[]; translation?: unknown; rotation?: unknown; scale?: unknown; }
interface GltfJson { scene?: number; scenes?: { nodes: number[] }[]; nodes?: GltfNode[]; meshes?: GltfMesh[]; accessors?: GltfAccessor[]; bufferViews?: GltfBufferView[]; }

const FLOAT = 5126;
const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

interface AccView { comp: number; count: number; num: number; dv: DataView; byteOffset: number; stride: number; }

function accessorView(json: GltfJson, bin: Uint8Array, ai: number): AccView {
  const acc = json.accessors?.[ai];
  if (!acc) throw new Error(`missing accessor ${ai}`);
  if (acc.sparse) throw new Error('sparse accessor unsupported');
  const num = TYPE_SIZE[acc.type];
  if (!num) throw new Error(`unsupported accessor type ${acc.type}`);
  if (acc.bufferView === undefined) throw new Error('accessor without bufferView');
  const bv = json.bufferViews?.[acc.bufferView];
  if (!bv || bv.buffer !== 0) throw new Error('accessor must use buffer 0');
  const compBytes = COMPONENT_BYTES[acc.componentType];
  if (!compBytes) throw new Error(`unsupported componentType ${acc.componentType}`);
  const elem = num * compBytes;
  const stride = bv.byteStride && bv.byteStride > elem ? bv.byteStride : elem;
  return {
    comp: acc.componentType, count: acc.count, num,
    dv: new DataView(bin.buffer, bin.byteOffset, bin.byteLength),
    byteOffset: (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0), stride,
  };
}

export function parseGlb(bytes: Uint8Array): RawGltfMesh {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB: bad magic');
  if (dv.getUint32(4, true) !== 2) throw new Error('unsupported glb version');
  if (dv.getUint32(8, true) > bytes.length) throw new Error('glb length exceeds file');
  let off = 12;
  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;
  while (off + 8 <= bytes.length && (json === null || bin === null)) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    if (off + 8 + len > bytes.length) throw new Error('truncated chunk');
    if (type === 0x4e4f534a && json === null) {
      json = JSON.parse(new TextDecoder().decode(bytes.subarray(off + 8, off + 8 + len))) as GltfJson;
    } else if (type === 0x004e4942 && bin === null) {
      bin = bytes.subarray(off + 8, off + 8 + len);
    }
    off += 8 + len;
  }
  if (!json || !bin) throw new Error('missing JSON or BIN chunk');

  const sceneIdx = json.scene ?? 0;
  const rootNodes = json.scenes?.[sceneIdx]?.nodes;
  if (!rootNodes || rootNodes.length === 0) throw new Error('empty scene');
  const meshIds: number[] = [];
  const walk = (ni: number): void => {
    const n = json.nodes?.[ni];
    if (!n) throw new Error(`missing node ${ni}`);
    if (n.translation !== undefined || n.rotation !== undefined || n.scale !== undefined) {
      throw new Error('node TRS transforms unsupported');
    }
    if (n.mesh !== undefined) meshIds.push(n.mesh);
    for (const c of n.children ?? []) walk(c);
  };
  for (const ni of rootNodes) walk(ni);
  if (meshIds.length === 0) throw new Error('scene has no meshes');

  const posOut: number[] = [];
  const uvOut: number[] = [];
  const idxOut: number[] = [];
  for (const mi of meshIds) {
    const mesh = json.meshes?.[mi];
    if (!mesh) throw new Error(`missing mesh ${mi}`);
    for (const prim of mesh.primitives) {
      if (prim.mode !== undefined && prim.mode !== 4) throw new Error(`unsupported primitive mode ${prim.mode}`);
      const posA = prim.attributes.POSITION;
      const uvA = prim.attributes.TEXCOORD_0;
      if (posA === undefined || uvA === undefined) throw new Error('primitive lacks POSITION/TEXCOORD_0');
      const pos = accessorView(json, bin, posA);
      if (pos.comp !== FLOAT || pos.num !== 3) throw new Error('POSITION must be VEC3 FLOAT');
      const uv = accessorView(json, bin, uvA);
      if (uv.comp !== FLOAT || uv.num !== 2) throw new Error('TEXCOORD_0 must be VEC2 FLOAT');
      const base = posOut.length / 3;
      for (let i = 0; i < pos.count; i++) {
        const po = pos.byteOffset + i * pos.stride;
        posOut.push(pos.dv.getFloat32(po, true), pos.dv.getFloat32(po + 4, true), pos.dv.getFloat32(po + 8, true));
        const uo = uv.byteOffset + i * uv.stride;
        uvOut.push(uv.dv.getFloat32(uo, true), uv.dv.getFloat32(uo + 4, true));
      }
      if (prim.indices !== undefined) {
        const idx = accessorView(json, bin, prim.indices);
        if (idx.num !== 1) throw new Error('indices must be SCALAR');
        if (idx.comp !== 5121 && idx.comp !== 5123 && idx.comp !== 5125) {
          throw new Error(`unsupported index componentType ${idx.comp}`);
        }
        for (let i = 0; i < idx.count; i++) {
          const io = idx.byteOffset + i * idx.stride;
          const v = idx.comp === 5121 ? idx.dv.getUint8(io)
            : idx.comp === 5123 ? idx.dv.getUint16(io, true)
            : idx.dv.getUint32(io, true);
          idxOut.push(base + v);
        }
      } else {
        for (let i = 0; i < pos.count; i++) idxOut.push(base + i);
      }
    }
  }
  if (idxOut.length === 0 || idxOut.length % 3 !== 0) throw new Error('no triangles');
  return { positions: new Float32Array(posOut), uvs: new Float32Array(uvOut), indices: new Uint32Array(idxOut) };
}

export function decodePngRgba(bytes: Uint8Array): RgbaImage {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) throw new Error('not a PNG');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = -1, interlace = -1;
  const idat: Uint8Array[] = [];
  while (off + 12 <= bytes.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    const start = off + 8;
    if (type === 'IHDR') {
      width = dv.getUint32(start); height = dv.getUint32(start + 4);
      bitDepth = bytes[start + 8]; colorType = bytes[start + 9];
      interlace = bytes[start + 12];
    } else if (type === 'IDAT') {
      idat.push(bytes.subarray(start, start + len));
    } else if (type === 'IEND') {
      break;
    }
    off = start + len + 4; // 跳过 CRC（解码器不校验；损坏数据由 inflate 抛错兜底）
  }
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`unsupported PNG (depth ${bitDepth}, color ${colorType}); need 8-bit RGBA`);
  }
  if (interlace !== 0) throw new Error('interlaced PNG unsupported');
  const raw = inflateSync(Buffer.from(concatU8(idat)));
  const stride = width * 4;
  const out = new Uint8Array(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x;
      const v = raw[rp++];
      const left = x >= 4 ? out[i - 4] : 0;
      const up = y > 0 ? out[i - stride] : 0;
      const ul = y > 0 && x >= 4 ? out[i - stride - 4] : 0;
      switch (filter) {
        case 0: out[i] = v; break;
        case 1: out[i] = v + left; break;
        case 2: out[i] = v + up; break;
        case 3: out[i] = v + ((left + up) >> 1); break;
        case 4: {
          const p = left + up - ul;
          const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - ul);
          out[i] = v + (pa <= pb && pa <= pc ? left : pb <= pc ? up : ul);
          break;
        }
        default: throw new Error(`bad PNG filter ${filter}`);
      }
    }
  }
  return { width, height, rgba: out };
}

function concatU8(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}
```

```jsonc
// tsconfig.json —— include 改为：
"include": ["src/**/*.ts", "src/**/*.d.ts", "tests/**/*.ts", "scripts/**/*.ts"]
```

```jsonc
// package.json —— scripts 增加：
"bake:props": "node scripts/bake-props.ts"
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/scripts/bake-props.test.ts`
Expected: PASS（8 用例）。

Run: `npm run typecheck`
Expected: 零错误。

- [ ] **Step 5: 提交**

```bash
git add src/core/prop-types.ts scripts/bake-props.ts tests/scripts/bake-props.test.ts tsconfig.json package.json
git commit -m "feat(props): prop types + pure-node GLB/PNG parsing for the bake pipeline"
```

---

### Task 2: bakeModel（按面拆解 + 平面法线 + 面中心采样 + 归一化）

**Files:**
- Modify: `scripts/bake-props.ts`（追加 `bakeModel`）
- Test: `tests/scripts/bake-props.test.ts`（追加）

**Interfaces:**
- Consumes: Task 1 的 `RawGltfMesh`、`RgbaImage`
- Produces: `type BakedModel = PropModelData`；`bakeModel(name: string, icon: string, raw: RawGltfMesh, tex: RgbaImage, size: number): BakedModel`——`size` 为目标水平最大边（格）；`footprint/height` 由缩放后包围盒自动取整导出

- [ ] **Step 1: 写失败测试**（追加到 `tests/scripts/bake-props.test.ts`，`bakeModel` 并入顶部 import）

```ts
describe('bakeModel', () => {
  const TEX: RgbaImage = {
    width: 2, height: 2,
    rgba: Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]),
  };
  // UV 面中心 = (0.8, 0.2) → 最近纹素 (px=1, py=0) = 绿色
  const TRI_RAW = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]),
    uvs: new Float32Array([0.8, 0.1, 0.9, 0.2, 0.7, 0.3]),
    indices: new Uint32Array([0, 1, 2]),
  };

  it('de-indexes per face with flat normals and centroid-sampled colors', () => {
    const m = bakeModel('t', 'data:image/png;base64,AAA', TRI_RAW, TEX, 0.5);
    expect(Array.from(m.positions)).toEqual([-0.25, 0, -0.25, 0.25, 0, -0.25, -0.25, 0, 0.25]);
    expect(Array.from(m.normals)).toEqual([0, -1, 0, 0, -1, 0, 0, -1, 0]);
    expect(Array.from(m.colors)).toEqual([0, 1, 0, 0, 1, 0, 0, 1, 0]);
    expect(Array.from(m.indices)).toEqual([0, 1, 2]);
    expect(m.footprint).toBe(1);
    expect(m.height).toBe(1);
  });

  it('derives footprint/height from the scaled bbox', () => {
    // 1×1×1 立方体（12 三角形），size 1.9 → 占地 1.9 格 → footprint 2、height 2
    const verts: number[] = [];
    for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) verts.push(x, y, z);
    const cube = {
      positions: new Float32Array(verts),
      uvs: new Float32Array(new Array(8 * 2).fill(0.8)),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 6, 7, 0, 4, 7, 0, 7, 3, 1, 5, 6, 1, 6, 2]),
    };
    const m = bakeModel('p', '', cube, TEX, 1.9);
    expect(m.footprint).toBe(2);
    expect(m.height).toBe(2);
    expect(m.positions.length).toBe(36 * 3); // 8 共享顶点 → 拆解后 12 面 × 3
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/scripts/bake-props.test.ts`
Expected: FAIL——`bakeModel` 未导出。

- [ ] **Step 3: 写实现**（追加到 `scripts/bake-props.ts`）

```ts
import type { PropModelData } from '../src/core/prop-types';

export type BakedModel = PropModelData;

export function bakeModel(
  name: string, icon: string, raw: RawGltfMesh, tex: RgbaImage, size: number,
): BakedModel {
  const tris = raw.indices.length / 3;
  // 原始包围盒
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < raw.positions.length; i += 3) {
    minX = Math.min(minX, raw.positions[i]); maxX = Math.max(maxX, raw.positions[i]);
    minY = Math.min(minY, raw.positions[i + 1]); maxY = Math.max(maxY, raw.positions[i + 1]);
    minZ = Math.min(minZ, raw.positions[i + 2]); maxZ = Math.max(maxZ, raw.positions[i + 2]);
  }
  const scale = size / Math.max(maxX - minX, maxZ - minZ, 1e-9);
  const positions = new Float32Array(tris * 9);
  const normals = new Float32Array(tris * 9);
  const colors = new Float32Array(tris * 9);
  for (let t = 0; t < tris; t++) {
    const ia = raw.indices[t * 3], ib = raw.indices[t * 3 + 1], ic = raw.indices[t * 3 + 2];
    const ax = raw.positions[ia * 3], ay = raw.positions[ia * 3 + 1], az = raw.positions[ia * 3 + 2];
    const bx = raw.positions[ib * 3], by = raw.positions[ib * 3 + 1], bz = raw.positions[ib * 3 + 2];
    const cx = raw.positions[ic * 3], cy = raw.positions[ic * 3 + 1], cz = raw.positions[ic * 3 + 2];
    // 平面法线 = 面叉积归一化（实测顶点跨面共享、NORMAL 为平滑法线，不采用）
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    // 面中心 UV → colormap 最近纹素（glTF UV 左上原点、v 向下，PNG 行序自上而下，无需 flip）
    const u = (raw.uvs[ia * 2] + raw.uvs[ib * 2] + raw.uvs[ic * 2]) / 3;
    const v = (raw.uvs[ia * 2 + 1] + raw.uvs[ib * 2 + 1] + raw.uvs[ic * 2 + 1]) / 3;
    const px = Math.min(tex.width - 1, Math.max(0, Math.round(u * (tex.width - 1))));
    const py = Math.min(tex.height - 1, Math.max(0, Math.round(v * (tex.height - 1))));
    const ti = (py * tex.width + px) * 4;
    const r = tex.rgba[ti] / 255, g = tex.rgba[ti + 1] / 255, b = tex.rgba[ti + 2] / 255;
    for (let k = 0; k < 3; k++) {
      const vi = raw.indices[t * 3 + k];
      const ox = raw.positions[vi * 3], oy = raw.positions[vi * 3 + 1], oz = raw.positions[vi * 3 + 2];
      const o = t * 9 + k * 3;
      // 缩放 → 水平居中（模型中心移到 footprint 区域中心）、底面归零
      positions[o] = (ox - (minX + maxX) / 2) * scale;
      positions[o + 1] = (oy - minY) * scale;
      positions[o + 2] = (oz - (minZ + maxZ) / 2) * scale;
      normals[o] = nx; normals[o + 1] = ny; normals[o + 2] = nz;
      colors[o] = r; colors[o + 1] = g; colors[o + 2] = b;
    }
  }
  const spanX = (maxX - minX) * scale, spanY = (maxY - minY) * scale, spanZ = (maxZ - minZ) * scale;
  const footprint = Math.max(1, Math.ceil(spanX - 1e-9), Math.ceil(spanZ - 1e-9));
  const height = Math.max(1, Math.ceil(spanY - 1e-9));
  const indices = new Uint16Array(tris * 3);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  if (indices.length > 65535) throw new Error(`${name}: too many vertices for Uint16`);
  return { name, icon, positions, normals, colors, indices, footprint, height };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/scripts/bake-props.test.ts`
Expected: PASS（10 用例）。

Run: `npm run typecheck`
Expected: 零错误。

- [ ] **Step 5: 提交**

```bash
git add scripts/bake-props.ts tests/scripts/bake-props.test.ts
git commit -m "feat(bake): per-face de-index, flat normals, centroid uv sampling, auto footprint/height"
```

---

### Task 3: 生成资产（MODEL_SPECS + serializeModels + main → props.generated.ts）

**Files:**
- Modify: `scripts/bake-props.ts`（追加 SPECS / assertPng64 / serializeModels / main）
- Create: `src/assets/props.generated.ts`（脚本产物，勿手改）
- Test: `tests/assets/props-generated.test.ts`

**Interfaces:**
- Consumes: Task 1/2 的 `parseGlb / decodePngRgba / bakeModel / BakedModel`；素材目录 `D:/Documents/lzx/assets/platformer-kit`
- Produces: `src/assets/props.generated.ts` 导出 `const PROP_MODELS: readonly PropModelData[]`（12 项；模块加载时 `atob` 解码 base64 → typed array）

- [ ] **Step 1: 写失败测试**

```ts
// tests/assets/props-generated.test.ts
import { describe, it, expect } from 'vitest';
import { statSync } from 'node:fs';
import { PROP_MODELS } from '../../src/assets/props.generated';

describe('props.generated', () => {
  it('has the 12 spec models with names and data-uri icons', () => {
    expect(PROP_MODELS.length).toBe(12);
    for (const m of PROP_MODELS) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.icon.startsWith('data:image/png;base64,')).toBe(true);
    }
  });

  it('geometry is per-face flat-shaded and self-consistent', () => {
    for (const m of PROP_MODELS) {
      const n = m.positions.length / 3;
      expect(m.positions.length % 9).toBe(0);            // 每面 3 顶点
      expect(m.normals.length).toBe(m.positions.length);
      expect(m.colors.length).toBe(m.positions.length);
      expect(m.indices.length).toBe(n);                   // 拆解后索引 = 顺序
      expect(n).toBeLessThan(65536);
      for (let i = 0; i < m.indices.length; i++) expect(m.indices[i]).toBe(i);
      for (let i = 0; i < n; i++) {                       // 法线归一
        const l = Math.hypot(m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2]);
        expect(Math.abs(l - 1)).toBeLessThan(1e-3);
      }
    }
  });

  it('declared footprint/height cover the actual vertex extents', () => {
    for (const m of PROP_MODELS) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < m.positions.length; i += 3) {
        minX = Math.min(minX, m.positions[i]); maxX = Math.max(maxX, m.positions[i]);
        minY = Math.min(minY, m.positions[i + 1]); maxY = Math.max(maxY, m.positions[i + 1]);
        minZ = Math.min(minZ, m.positions[i + 2]); maxZ = Math.max(maxZ, m.positions[i + 2]);
      }
      expect(maxX - minX).toBeLessThanOrEqual(m.footprint + 1e-6);
      expect(maxZ - minZ).toBeLessThanOrEqual(m.footprint + 1e-6);
      expect(maxY - minY).toBeLessThanOrEqual(m.height + 1e-6);
      expect(minY).toBeGreaterThanOrEqual(-1e-6);
      expect(m.footprint).toBeLessThanOrEqual(3);
      expect(m.height).toBeLessThanOrEqual(6);
    }
  });

  it('stays inside the size budget', () => {
    expect(statSync('src/assets/props.generated.ts').size).toBeLessThan(600 * 1024);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/assets/props-generated.test.ts`
Expected: FAIL——`Cannot find module '../../src/assets/props.generated'`。

- [ ] **Step 3: 写实现并生成**（追加到 `scripts/bake-props.ts`）

```ts
import { writeFileSync, statSync } from 'node:fs';

// ---- 模型清单（spec §12.1 已核实 12 个；size = 目标水平最大边，格）----
const KIT = 'D:/Documents/lzx/assets/platformer-kit';
const SPECS: ReadonlyArray<{ file: string; name: string; size: number }> = [
  { file: 'tree', name: '小树', size: 0.92 },
  { file: 'crate', name: '木箱', size: 0.92 },
  { file: 'barrel', name: '木桶', size: 0.85 },
  { file: 'mushrooms', name: '蘑菇', size: 0.9 },
  { file: 'rocks', name: '石头', size: 0.9 },
  { file: 'plant', name: '盆栽', size: 0.9 },
  { file: 'fence-straight', name: '栅栏', size: 0.98 },
  { file: 'sign', name: '木牌', size: 0.75 },
  { file: 'flag', name: '旗帜', size: 0.9 },
  { file: 'coin-gold', name: '金币', size: 0.5 },
  { file: 'spring', name: '弹簧', size: 0.85 },
  { file: 'platform', name: '平台', size: 1.9 },
];

export function assertPng64(bytes: Uint8Array, label: string): void {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) throw new Error(`${label}: not a PNG`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(16) !== 64 || dv.getUint32(20) !== 64) throw new Error(`${label}: preview not 64x64`);
}

export function serializeModels(models: readonly BakedModel[]): string {
  const b64 = (a: Float32Array | Uint16Array): string =>
    Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  const entries = models.map((m) =>
    `  {\n    name: ${JSON.stringify(m.name)},\n    icon: ${JSON.stringify(m.icon)},\n` +
    `    positions: f32(${JSON.stringify(b64(m.positions))}),\n` +
    `    normals: f32(${JSON.stringify(b64(m.normals))}),\n` +
    `    colors: f32(${JSON.stringify(b64(m.colors))}),\n` +
    `    indices: u16(${JSON.stringify(b64(m.indices))}),\n` +
    `    footprint: ${m.footprint},\n    height: ${m.height},\n  },`,
  ).join('\n');
  return `// 由 scripts/bake-props.ts 生成——勿手改；重跑：npm run bake:props
import type { PropModelData } from '../core/prop-types';

function b64ToU8(s: string): Uint8Array {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
function f32(s: string): Float32Array {
  const u8 = b64ToU8(s);
  return new Float32Array(u8.buffer, u8.byteOffset, u8.length >> 2);
}
function u16(s: string): Uint16Array {
  const u8 = b64ToU8(s);
  return new Uint16Array(u8.buffer, u8.byteOffset, u8.length >> 1);
}

export const PROP_MODELS: readonly PropModelData[] = [
${entries}
];
`;
}

function main(): void {
  const tex = decodePngRgba(readFileSync(`${KIT}/Models/GLB format/Textures/colormap.png`));
  const models: BakedModel[] = [];
  for (const s of SPECS) {
    const raw = parseGlb(readFileSync(`${KIT}/Models/GLB format/${s.file}.glb`));
    const iconBytes = readFileSync(`${KIT}/Previews/${s.file}.png`);
    assertPng64(iconBytes, s.file);
    const icon = 'data:image/png;base64,' + iconBytes.toString('base64');
    const m = bakeModel(s.name, icon, raw, tex, s.size);
    models.push(m);
    console.log(`${s.file}: tris=${raw.indices.length / 3} footprint=${m.footprint} height=${m.height}`);
  }
  writeFileSync('src/assets/props.generated.ts', serializeModels(models));
  console.log(`props.generated.ts ${Math.round(statSync('src/assets/props.generated.ts').size / 1024)}KB`);
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('/scripts/bake-props.ts')) main();
```

Run: `npm run bake:props`
Expected: 12 行 `<file>: tris=… footprint=… height=…` + `props.generated.ts …KB`（约 300–500KB）。**核对打印的 footprint/height**（tree ≈ 1×2、platform ≈ 2×1、coin 1×1）；若明显失真（如金币 footprint 2），调 SPECS 的 `size` 后重跑。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/assets/props-generated.test.ts`
Expected: PASS（4 用例）。

Run: `npm run typecheck`
Expected: 零错误。

- [ ] **Step 5: 提交**

```bash
git add scripts/bake-props.ts src/assets/props.generated.ts tests/assets/props-generated.test.ts
git commit -m "feat(assets): bake 12 kenney models to base64 geometry + preview icons"
```

---

### Task 4: PropWorld（基础格 + 占用列双映射）

**Files:**
- Create: `src/core/prop-world.ts`、`tests/core/prop-world.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `PropModelData / PropInstance`、`src/core/world.ts` 的 `WORLD_SIZE`
- Produces: `createPropWorld(models: readonly PropModelData[]): PropWorld`；`PropWorld = { readonly props: ReadonlyMap<number, PropInstance>; add(x, y, z, modelId): PropInstance | null; removeAt(x, y, z): PropInstance | null; propAt(x, y, z): PropInstance | undefined; clear(): void; list(): PropInstance[] }`（`add` 校验边界 + 占用列重叠；`removeAt/propAt` 接受占用列内任意格）

- [ ] **Step 1: 写失败测试**

```ts
// tests/core/prop-world.test.ts
import { describe, it, expect } from 'vitest';
import type { PropModelData } from '../../src/core/prop-types';
import { createPropWorld } from '../../src/core/prop-world';

const emptyModel = (footprint: number, height: number): PropModelData =>
  ({ name: '', icon: '', positions: new Float32Array(0), normals: new Float32Array(0), colors: new Float32Array(0), indices: new Uint16Array(0), footprint, height });
const MODELS: PropModelData[] = [emptyModel(1, 3), emptyModel(2, 1)]; // tree / plat

describe('PropWorld', () => {
  it('adds and finds props across the whole occupancy column', () => {
    const pw = createPropWorld(MODELS);
    const inst = pw.add(5, 5, 5, 0);
    expect(inst).not.toBeNull();
    expect(pw.propAt(5, 5, 5)).toBe(inst);   // 基础格
    expect(pw.propAt(5, 7, 5)).toBe(inst);   // 树冠格（height 3）
    expect(pw.propAt(6, 5, 5)).toBeUndefined();
    expect(pw.list()).toEqual([inst]);
  });

  it('rejects overlapping occupancy columns and out-of-bounds placements', () => {
    const pw = createPropWorld(MODELS);
    expect(pw.add(5, 5, 5, 0)).not.toBeNull();
    expect(pw.add(5, 7, 5, 0)).toBeNull();   // 列重叠（第二棵树穿过第一棵树冠）
    expect(pw.add(6, 5, 5, 0)).not.toBeNull();
    expect(pw.add(0, 8, 0, 0)).toBeNull();    // height 3 超上边界（8+3>10）
    expect(pw.add(10, 0, 0, 0)).toBeNull();   // 世界外
    expect(pw.add(0, 0, 0, 99)).toBeNull();   // 非法 modelId
  });

  it('platform footprint 2x2 occupies the right cells', () => {
    const pw = createPropWorld(MODELS);
    expect(pw.add(0, 0, 0, 1)).not.toBeNull();
    expect(pw.propAt(1, 0, 1)).not.toBeNull();   // 平台角
    expect(pw.add(1, 0, 1, 0)).toBeNull();       // 树落在平台角上 → 重叠
    expect(pw.add(2, 0, 0, 0)).not.toBeNull();   // 紧邻不重叠
  });

  it('removeAt from any column cell removes the whole prop', () => {
    const pw = createPropWorld(MODELS);
    const inst = pw.add(5, 5, 5, 0);
    expect(pw.removeAt(5, 6, 5)).toBe(inst);    // 从树冠格删整棵树
    expect(pw.propAt(5, 5, 5)).toBeUndefined();
    expect(pw.removeAt(5, 6, 5)).toBeNull();
    expect(pw.list()).toEqual([]);
  });

  it('supports an undo-style remove/re-add cycle returning to the prior state', () => {
    const pw = createPropWorld(MODELS);
    const a = pw.add(5, 5, 5, 0);
    expect(pw.removeAt(5, 5, 5)).toBe(a);
    const b = pw.add(5, 5, 5, 0);               // LIFO 撤销后原位重放
    expect(b).not.toBeNull();
    expect(pw.propAt(5, 7, 5)).toBe(b);
  });

  it('clear resets both maps', () => {
    const pw = createPropWorld(MODELS);
    pw.add(5, 5, 5, 0);
    pw.clear();
    expect(pw.list()).toEqual([]);
    expect(pw.propAt(5, 5, 5)).toBeUndefined();
    expect(pw.add(5, 5, 5, 0)).not.toBeNull();  // 占用映射也已清空
  });

  it('assigns unique ids', () => {
    const pw = createPropWorld(MODELS);
    const a = pw.add(0, 0, 0, 0);
    const b = pw.add(2, 0, 0, 0);
    expect(a && b && a.id !== b.id).toBe(true);
  });

  it('rejects negative coords without corrupting keys', () => {
    const pw = createPropWorld([emptyModel(1, 1)]);
    expect(pw.add(-1, 0, 0, 0)).toBeNull();
    expect(pw.propAt(-1, 0, 0)).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/core/prop-world.test.ts`
Expected: FAIL——`Cannot find module '../../src/core/prop-world'`。

- [ ] **Step 3: 写实现**

```ts
// src/core/prop-world.ts
import { WORLD_SIZE } from './world';
import type { PropInstance, PropModelData } from './prop-types';

export interface PropWorld {
  /** 基础格 → 实例 */
  readonly props: ReadonlyMap<number, PropInstance>;
  /** 放置：占用列越界或与现有道具占用重叠即失败 */
  add(x: number, y: number, z: number, modelId: number): PropInstance | null;
  /** 从占用列内任意格移除整个道具 */
  removeAt(x: number, y: number, z: number): PropInstance | null;
  /** 占用查询：该格被某道具占用列覆盖则返回其实例 */
  propAt(x: number, y: number, z: number): PropInstance | undefined;
  clear(): void;
  list(): PropInstance[];
}

const cellKey = (x: number, y: number, z: number): number =>
  x + y * WORLD_SIZE + z * WORLD_SIZE * WORLD_SIZE;

const inBounds = (x: number, y: number, z: number): boolean =>
  x >= 0 && x < WORLD_SIZE && y >= 0 && y < WORLD_SIZE && z >= 0 && z < WORLD_SIZE;

export function createPropWorld(models: readonly PropModelData[]): PropWorld {
  const props = new Map<number, PropInstance>(); // 基础格 key → 实例
  const owner = new Map<number, number>();       // 占用格 key → 基础格 key
  let nextId = 1;

  const columnCells = (x: number, y: number, z: number, modelId: number): number[] | null => {
    const m = models[modelId];
    if (!m) return null;
    const cells: number[] = [];
    for (let dx = 0; dx < m.footprint; dx++) {
      for (let dy = 0; dy < m.height; dy++) {
        for (let dz = 0; dz < m.footprint; dz++) {
          const cx = x + dx, cy = y + dy, cz = z + dz;
          if (!inBounds(cx, cy, cz)) return null;
          const k = cellKey(cx, cy, cz);
          if (owner.has(k)) return null;
          cells.push(k);
        }
      }
    }
    return cells;
  };

  return {
    props,
    add(x, y, z, modelId) {
      if (!inBounds(x, y, z)) return null;
      const cells = columnCells(x, y, z, modelId);
      if (!cells) return null;
      const base = cellKey(x, y, z);
      if (props.has(base)) return null;
      const inst: PropInstance = { id: nextId++, modelId, x, y, z, rot: 0 };
      props.set(base, inst);
      for (const k of cells) owner.set(k, base);
      return inst;
    },
    removeAt(x, y, z) {
      if (!inBounds(x, y, z)) return null;
      const base = owner.get(cellKey(x, y, z));
      if (base === undefined) return null;
      const inst = props.get(base);
      if (!inst) return null;
      for (const k of columnCells(inst.x, inst.y, inst.z, inst.modelId) ?? []) owner.delete(k);
      props.delete(base);
      return inst;
    },
    propAt(x, y, z) {
      if (!inBounds(x, y, z)) return undefined;
      const base = owner.get(cellKey(x, y, z));
      return base === undefined ? undefined : props.get(base);
    },
    clear() {
      props.clear();
      owner.clear();
    },
    list() {
      return Array.from(props.values());
    },
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/core/prop-world.test.ts`
Expected: PASS（8 用例）。

Run: `npm run typecheck`
Expected: 零错误。

- [ ] **Step 5: 提交**

```bash
git add src/core/prop-world.ts tests/core/prop-world.test.ts
git commit -m "feat(core): prop world with occupancy-column mapping"
```

---

### Task 5: walkRay 抽取 + 统一拾取 pick

**Files:**
- Modify: `src/core/voxel-raycast.ts`（重写：抽出 `walkRay`，`voxelRaycast` 复用）
- Create: `src/core/pick.ts`、`tests/core/pick.test.ts`
- Test: `tests/core/voxel-raycast.test.ts`（既有 3 用例必须原样通过——回归）

**Interfaces:**
- Consumes: `World`、Task 4 的 `PropWorld`
- Produces:
  - `walkRay(origin: readonly [number, number, number], direction: readonly [number, number, number], maxDistance: number, visit: (x: number, y: number, z: number, nx: number, ny: number, nz: number, t: number) => boolean): boolean`（`visit` 返回 true 即停；首格法线为 0,0,0）
  - `pick.ts`：`interface PickHit { readonly kind: 'prop' | 'block'; readonly x: number; readonly y: number; readonly z: number; readonly nx: number; readonly ny: number; readonly nz: number; readonly prop?: PropInstance }`；`function pick(origin: readonly [number, number, number], direction: readonly [number, number, number], world: World, propWorld: PropWorld, maxDistance: number): PickHit | null`

- [ ] **Step 1: 写失败测试**

```ts
// tests/core/pick.test.ts
import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/core/world';
import { BLOCK } from '../../src/core/block-types';
import { createPropWorld } from '../../src/core/prop-world';
import type { PropModelData } from '../../src/core/prop-types';
import { pick } from '../../src/core/pick';

const MODELS: PropModelData[] = [{
  name: 'tree', icon: '', positions: new Float32Array(0), normals: new Float32Array(0),
  colors: new Float32Array(0), indices: new Uint16Array(0), footprint: 1, height: 2,
}];

describe('pick', () => {
  it('hits a prop standing in front of terrain, with entry-face normal', () => {
    const w = createWorld();
    w.setBlock(7, 0, 0, BLOCK.STONE);
    const pw = createPropWorld(MODELS);
    const inst = pw.add(3, 0, 0, 0);
    const hit = pick([-1, 0.5, 0.5], [1, 0, 0], w, pw, 100);
    expect(hit?.kind).toBe('prop');
    expect([hit?.x, hit?.y, hit?.z]).toEqual([3, 0, 0]);
    expect([hit?.nx, hit?.ny, hit?.nz]).toEqual([-1, 0, 0]);
    expect(hit?.prop).toBe(inst);
  });

  it('hits a block when it stands in front of a prop', () => {
    const w = createWorld();
    w.setBlock(5, 0, 0, BLOCK.STONE);
    const pw = createPropWorld(MODELS);
    pw.add(7, 0, 0, 0);
    const hit = pick([-1, 0.5, 0.5], [1, 0, 0], w, pw, 100);
    expect(hit?.kind).toBe('block');
    expect([hit?.x, hit?.y, hit?.z]).toEqual([5, 0, 0]);
  });

  it('a ray from above hits the tree canopy cell, not the ground behind it', () => {
    const w = createWorld();
    w.setBlock(3, 0, 0, BLOCK.GRASS); // 树脚下的地面
    const pw = createPropWorld(MODELS);
    pw.add(3, 0, 0, 0);               // 树占 (3,0,0) 与 (3,1,0)
    const hit = pick([3.5, 9.5, 0.5], [0, -1, 0], w, pw, 100);
    expect(hit?.kind).toBe('prop');
    expect([hit?.x, hit?.y, hit?.z]).toEqual([3, 1, 0]); // 树冠格
    expect([hit?.nx, hit?.ny, hit?.nz]).toEqual([0, 1, 0]);
  });

  it('returns null on an empty scene', () => {
    expect(pick([-1, 0.5, 0.5], [1, 0, 0], createWorld(), createPropWorld(MODELS), 100)).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/core/pick.test.ts`
Expected: FAIL——`Cannot find module '../../src/core/pick'`。

- [ ] **Step 3: 写实现**

```ts
// src/core/voxel-raycast.ts —— 重写为 walkRay + voxelRaycast
import { BLOCK } from './block-types';
import type { World } from './world';

export interface VoxelHit {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly distance: number;
}

/** 逐步 DDA：沿射线逐格步进（首格法线为 0,0,0）；visit 返回 true 即停止。返回是否命中。 */
export function walkRay(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  maxDistance: number,
  visit: (x: number, y: number, z: number, nx: number, ny: number, nz: number, t: number) => boolean,
): boolean {
  let x = Math.floor(origin[0]);
  let y = Math.floor(origin[1]);
  let z = Math.floor(origin[2]);

  const dx = direction[0];
  const dy = direction[1];
  const dz = direction[2];

  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;

  const tDeltaX = Math.abs(1 / dx);
  const tDeltaY = Math.abs(1 / dy);
  const tDeltaZ = Math.abs(1 / dz);

  let tMaxX = (dx > 0 ? x + 1 - origin[0] : origin[0] - x) * tDeltaX;
  let tMaxY = (dy > 0 ? y + 1 - origin[1] : origin[1] - y) * tDeltaY;
  let tMaxZ = (dz > 0 ? z + 1 - origin[2] : origin[2] - z) * tDeltaZ;

  let nx = 0, ny = 0, nz = 0;
  let t = 0;

  while (t < maxDistance) {
    if (visit(x, y, z, nx, ny, nz, t)) return true;

    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX;
      nx = -stepX; ny = 0; nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY;
      nx = 0; ny = -stepY; nz = 0;
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ;
      nx = 0; ny = 0; nz = -stepZ;
    }
  }
  return false;
}

export function voxelRaycast(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  world: World,
  maxDistance: number,
): VoxelHit | null {
  let hit: VoxelHit | null = null;
  walkRay(origin, direction, maxDistance, (x, y, z, nx, ny, nz, t) => {
    if (world.getBlock(x, y, z) !== BLOCK.AIR) {
      hit = { x, y, z, nx, ny, nz, distance: t };
      return true;
    }
    return false;
  });
  return hit;
}
```

```ts
// src/core/pick.ts
import { BLOCK } from './block-types';
import type { World } from './world';
import type { PropInstance } from './prop-types';
import type { PropWorld } from './prop-world';
import { walkRay } from './voxel-raycast';

export interface PickHit {
  readonly kind: 'prop' | 'block';
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly prop?: PropInstance;
}

/** 统一拾取：DDA 每格先查道具占用列、再查方块；先到先得。 */
export function pick(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  world: World,
  propWorld: PropWorld,
  maxDistance: number,
): PickHit | null {
  let hit: PickHit | null = null;
  walkRay(origin, direction, maxDistance, (x, y, z, nx, ny, nz) => {
    const prop = propWorld.propAt(x, y, z);
    if (prop) {
      hit = { kind: 'prop', x, y, z, nx, ny, nz, prop };
      return true;
    }
    if (world.getBlock(x, y, z) !== BLOCK.AIR) {
      hit = { kind: 'block', x, y, z, nx, ny, nz };
      return true;
    }
    return false;
  });
  return hit;
}
```

- [ ] **Step 4: 运行确认通过（含回归）**

Run: `npx vitest run tests/core/pick.test.ts tests/core/voxel-raycast.test.ts`
Expected: PASS（pick 4 用例 + voxel-raycast 既有 3 用例原样通过）。

Run: `npm run typecheck`
Expected: 零错误。

- [ ] **Step 5: 提交**

```bash
git add src/core/voxel-raycast.ts src/core/pick.ts tests/core/pick.test.ts
git commit -m "feat(core): shared walkRay DDA + unified prop/block picking"
```

---

### Task 6: history 道具动作 + storage 存档 v2

**Files:**
- Modify: `src/core/history.ts`、`src/platform/storage.ts`
- Test: `tests/platform/storage.test.ts`（扩展）、`tests/core/history.test.ts`（扩展）

**Interfaces:**
- Consumes: 既有 `History` / `saveWorld / loadWorld`；`WORLD_SIZE`
- Produces:
  - `history.ts`：`interface SetPropAction { readonly type: 'setProp'; readonly x: number; readonly y: number; readonly z: number; readonly prevModelId: number | null }`；`interface BatchPropAction { readonly type: 'batchProp'; readonly ops: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number; readonly prevModelId: number | null }> }`；并入 `HistoryAction` union
  - `storage.ts`：`interface SaveCamera { readonly theta: number; readonly phi: number; readonly radius: number }`；`SavePayload = SavePayloadV1 | SavePayloadV2`（V1 为现有形状；`SavePayloadV2 = { readonly v: 2; readonly blocks: number[]; readonly props: ReadonlyArray<{ x: number; y: number; z: number; modelId: number }>; readonly camera: SaveCamera }`）；`isSavePayload` 接受 v1|v2；`STORAGE_KEY` 不变

- [ ] **Step 1: 写失败测试**

`tests/platform/storage.test.ts` 追加：

```ts
describe('storage v2', () => {
  it('round-trips a v2 payload with props', async () => {
    mockMiniTool(9462004);
    const p = {
      v: 2 as const,
      blocks: new Array(1000).fill(0),
      props: [{ x: 3, y: 0, z: 5, modelId: 7 }],
      camera: { theta: 0.5, phi: 1, radius: 20 },
    };
    expect(await saveWorld(p)).toBe(true);
    expect(await loadWorld()).toEqual(p);
  });

  it('accepts a legacy v1 payload (no props field)', async () => {
    localStorage.setItem('garden_world_v1', JSON.stringify({
      v: 1, blocks: new Array(1000).fill(1), camera: { theta: 0, phi: 1, radius: 20 },
    }));
    const loaded = await loadWorld();
    expect(loaded?.v).toBe(1);
  });

  it('rejects v2 props with out-of-bounds coords', async () => {
    localStorage.setItem('garden_world_v1', JSON.stringify({
      v: 2, blocks: new Array(1000).fill(0), props: [{ x: 10, y: 0, z: 0, modelId: 0 }],
      camera: { theta: 0, phi: 1, radius: 20 },
    }));
    expect(await loadWorld()).toBeNull();
  });

  it('rejects v2 props with a negative modelId', async () => {
    localStorage.setItem('garden_world_v1', JSON.stringify({
      v: 2, blocks: new Array(1000).fill(0), props: [{ x: 0, y: 0, z: 0, modelId: -1 }],
      camera: { theta: 0, phi: 1, radius: 20 },
    }));
    expect(await loadWorld()).toBeNull();
  });

  it('rejects v2 without a props array', async () => {
    localStorage.setItem('garden_world_v1', JSON.stringify({
      v: 2, blocks: new Array(1000).fill(0), camera: { theta: 0, phi: 1, radius: 20 },
    }));
    expect(await loadWorld()).toBeNull();
  });
});
```

`tests/core/history.test.ts` 追加：

```ts
it('stores prop actions in the same LIFO stack', () => {
  const h = createHistory();
  h.push({ type: 'setProp', x: 1, y: 0, z: 0, prevModelId: null });
  h.push({ type: 'batchProp', ops: [{ x: 2, y: 0, z: 0, prevModelId: 3 }] });
  const b = h.pop();
  expect(b && b.type === 'batchProp' ? b.ops[0].x : undefined).toBe(2);
  const a = h.pop();
  expect(a && a.type === 'setProp' ? a.prevModelId : undefined).toBeNull();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/platform/storage.test.ts tests/core/history.test.ts`
Expected: FAIL——v2 用例 `loadWorld` 返回 null（`isSavePayload` 只认 v1）；history 用例类型缺失编译错。

- [ ] **Step 3: 写实现**

`src/core/history.ts` 追加（并扩展 union）：

```ts
export interface SetPropAction {
  readonly type: 'setProp';
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly prevModelId: number | null; // null = 该格原本无道具（撤销 = 移除）
}

export interface BatchPropAction {
  readonly type: 'batchProp';
  readonly ops: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number; readonly prevModelId: number | null }>;
}

export type HistoryAction = SetAction | BatchAction | SetPropAction | BatchPropAction;
```

`src/platform/storage.ts` 改动（`STORAGE_KEY`/`STORAGE_MIN_CLIENT_VERSION`/`saveWorld`/`loadWorld` 主体不变，`isSavePayload` 重写 + 类型替换）：

```ts
import { WORLD_SIZE } from '../core/world';

export interface SaveCamera {
  readonly theta: number;
  readonly phi: number;
  readonly radius: number;
}

export interface SavePayloadV1 {
  readonly v: 1;
  readonly blocks: number[];
  readonly camera: SaveCamera;
}

export interface SavePayloadV2 {
  readonly v: 2;
  readonly blocks: number[];
  readonly props: ReadonlyArray<{ x: number; y: number; z: number; modelId: number }>;
  readonly camera: SaveCamera;
}

export type SavePayload = SavePayloadV1 | SavePayloadV2;

function isSavePayload(x: unknown): x is SavePayload {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  const cam = o.camera as Record<string, unknown> | undefined | null;
  if (
    !Array.isArray(o.blocks) ||
    !o.blocks.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 9) ||
    !cam ||
    typeof cam.theta !== 'number' ||
    typeof cam.phi !== 'number' ||
    typeof cam.radius !== 'number'
  ) {
    return false;
  }
  if (o.v === 1) return true;
  if (o.v !== 2) return false;
  // v2：props 逐项校验（界内整数坐标；modelId 语义范围由 PropWorld.add 恢复时兜底）
  return Array.isArray(o.props) && o.props.every((p) => {
    if (!p || typeof p !== 'object') return false;
    const q = p as Record<string, unknown>;
    return (
      Number.isInteger(q.x) && q.x >= 0 && q.x < WORLD_SIZE &&
      Number.isInteger(q.y) && q.y >= 0 && q.y < WORLD_SIZE &&
      Number.isInteger(q.z) && q.z >= 0 && q.z < WORLD_SIZE &&
      Number.isInteger(q.modelId) && q.modelId >= 0 && q.modelId < 100
    );
  });
}
```

（`saveWorld(payload: SavePayload)` / `loadWorld(): Promise<SavePayload | null>` 签名不变——union 化后 app 的 v1 字面量调用点继续通过。）

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/platform/storage.test.ts tests/core/history.test.ts`
Expected: PASS（storage 既有 5 + 新 5；history 既有 3 + 新 1）。

Run: `npm run typecheck`
Expected: 零错误。

- [ ] **Step 5: 提交**

```bash
git add src/core/history.ts src/platform/storage.ts tests/platform/storage.test.ts tests/core/history.test.ts
git commit -m "feat(core,platform): prop history actions + save payload v2 with v1 compat"
```

---

### Task 7: renderer-api v2 + 共用批几何构建 prop-mesh-builder

**Files:**
- Modify: `src/rendering/renderer-api.ts`（版本 +1、PropDelta、可选方法）
- Create: `src/core/prop-mesh-builder.ts`、`tests/core/prop-mesh-builder.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `PropModelData / PropInstance`
- Produces:
  - `renderer-api.ts`：`RENDERER_API_VERSION = 2`；`interface PropDelta { readonly added: ReadonlyArray<PropInstance>; readonly removed: ReadonlyArray<{ x: number; y: number; z: number; modelId: number }> }`；`RendererAdapter` 追加可选方法 `definePropModels?(models: readonly PropModelData[]): void`、`syncProps?(instances: readonly PropInstance[]): void`、`applyPropDelta?(delta: PropDelta): void`
  - `prop-mesh-builder.ts`：`interface PropBatchMesh { readonly positions: Float32Array; readonly normals: Float32Array; readonly colors: Float32Array; readonly indices: Uint32Array }`；`buildPropBatch(models: readonly PropModelData[], instances: readonly PropInstance[], modelId: number): PropBatchMesh`（含 `BASE_EPSILON = 0.001` 底面抬高、rot 0–3 绕 Y 旋转、footprint 居中、Uint32 重索引）；`propTriangleCount(models: readonly PropModelData[], instances: readonly PropInstance[]): number`

- [ ] **Step 1: 写失败测试**

```ts
// tests/core/prop-mesh-builder.test.ts
import { describe, it, expect } from 'vitest';
import type { PropModelData, PropInstance } from '../../src/core/prop-types';
import { buildPropBatch, propTriangleCount } from '../../src/core/prop-mesh-builder';

const M: PropModelData = {
  name: 'm', icon: '',
  positions: new Float32Array([0, 0, 0, 0.5, 0, 0, 0, 0, 0.5]), // 单面三角
  normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
  colors: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
  indices: new Uint16Array([0, 1, 2]),
  footprint: 1, height: 1,
};
const inst = (id: number, x: number, y: number, z: number, rot: 0 | 1 | 2 | 3 = 0): PropInstance =>
  ({ id, modelId: 0, x, y, z, rot });

describe('buildPropBatch', () => {
  it('translates instances to cell centers and lifts the base off the floor plane', () => {
    const b = buildPropBatch([M], [inst(1, 2, 3, 4)], 0);
    // 格中心 (x+0.5, y, z+0.5)，底面 +0.001 防 z-fighting
    expect(Array.from(b.positions)).toEqual([2.5, 3.001, 4.5, 3, 3.001, 4.5, 2.5, 3.001, 5]);
    expect(Array.from(b.normals)).toEqual([0, 1, 0, 0, 1, 0, 0, 1, 0]);
    expect(Array.from(b.colors)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(Array.from(b.indices)).toEqual([0, 1, 2]);
  });

  it('merges multiple instances with Uint32 offset re-indexing', () => {
    const b = buildPropBatch([M], [inst(1, 0, 0, 0), inst(2, 2, 0, 1)], 0);
    expect(b.positions.length).toBe(18);
    expect(Array.from(b.indices)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(b.indices instanceof Uint32Array).toBe(true);
  });

  it('rotates vertices and normals 90 degrees per rot step around Y', () => {
    // M 顶点 A(0,0,0) B(0.5,0,0) C(0,0,0.5)；rot=1 → (x,z)=(z,-x)，格 (2,3,4) 中心 (2.5,·,4.5)
    const b = buildPropBatch([M], [inst(1, 2, 3, 4, 1)], 0);
    expect(Array.from(b.positions)).toEqual([2.5, 3.001, 4.5, 2.5, 3.001, 4, 3, 3.001, 4.5]);
    const m2: PropModelData = { ...M, normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]) };
    const b2 = buildPropBatch([m2], [inst(1, 0, 0, 0, 1)], 0);
    expect(Array.from(b2.normals)).toEqual([1, 0, 0, 1, 0, 0, 1, 0, 0]); // (0,0,1) → (1,0,0)
  });

  it('centers footprint-2 models on the 2x2 area', () => {
    const m2: PropModelData = { ...M, footprint: 2 };
    const b = buildPropBatch([m2], [inst(1, 0, 0, 0)], 0);
    expect(Array.from(b.positions.slice(0, 3))).toEqual([1, 0.001, 1]); // 中心 = 0 + footprint/2
  });

  it('returns zero-length arrays for empty instances', () => {
    const b = buildPropBatch([M], [], 0);
    expect(b.positions.length).toBe(0);
    expect(b.indices.length).toBe(0);
  });
});

describe('propTriangleCount', () => {
  it('sums per-instance triangle counts', () => {
    const m2: PropModelData = { ...M, indices: new Uint16Array([0, 1, 2, 3, 4, 5]) }; // 2 tris
    const total = propTriangleCount([M, m2], [inst(1, 0, 0, 0), inst(2, 1, 0, 0), inst(3, 0, 0, 1, 0)]);
    expect(total).toBe(4); // 模型0×2 + 模型1×1 = 1+1+2
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/core/prop-mesh-builder.test.ts`
Expected: FAIL——`Cannot find module '../../src/core/prop-mesh-builder'`。

- [ ] **Step 3: 写实现**

```ts
// src/core/prop-mesh-builder.ts
import type { PropInstance, PropModelData } from './prop-types';

export interface PropBatchMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colors: Float32Array;
  readonly indices: Uint32Array;
}

/** 道具底面抬高量：避免与地面/下层道具顶面完全共面（WebGL 兜底不剔除背面，共面会 z-fighting） */
const BASE_EPSILON = 0.001;

/** 合并某 modelId 的全部实例为一批几何（水平居中到 footprint 区域中心、rot 0–3 绕 Y 旋转、Uint32 重索引）。 */
export function buildPropBatch(
  models: readonly PropModelData[],
  instances: readonly PropInstance[],
  modelId: number,
): PropBatchMesh {
  const m = models[modelId];
  const own = instances.filter((p) => p.modelId === modelId);
  if (!m || own.length === 0) {
    return {
      positions: new Float32Array(0), normals: new Float32Array(0),
      colors: new Float32Array(0), indices: new Uint32Array(0),
    };
  }
  const vPer = m.positions.length / 3;
  const cx = m.footprint / 2;
  const positions = new Float32Array(own.length * m.positions.length);
  const normals = new Float32Array(own.length * m.normals.length);
  const colors = new Float32Array(own.length * m.colors.length);
  for (let i = 0; i < own.length; i++) {
    const p = own[i];
    const ox = p.x + cx, oy = p.y + BASE_EPSILON, oz = p.z + cx;
    for (let v = 0; v < vPer; v++) {
      const si = v * 3;
      const di = (i * vPer + v) * 3;
      const x = m.positions[si], y = m.positions[si + 1], z = m.positions[si + 2];
      let rx = x, rz = z;
      if (p.rot === 1) { rx = z; rz = -x; }
      else if (p.rot === 2) { rx = -x; rz = -z; }
      else if (p.rot === 3) { rx = -z; rz = x; }
      positions[di] = rx + ox;
      positions[di + 1] = y + oy;
      positions[di + 2] = rz + oz;
      const nx = m.normals[si], ny = m.normals[si + 1], nz = m.normals[si + 2];
      let rnx = nx, rnz = nz;
      if (p.rot === 1) { rnx = nz; rnz = -nx; }
      else if (p.rot === 2) { rnx = -nx; rnz = -nz; }
      else if (p.rot === 3) { rnx = -nz; rnz = nx; }
      normals[di] = rnx; normals[di + 1] = ny; normals[di + 2] = rnz;
      colors[di] = m.colors[si];
      colors[di + 1] = m.colors[si + 1];
      colors[di + 2] = m.colors[si + 2];
    }
  }
  const indices = new Uint32Array(own.length * m.indices.length);
  for (let i = 0; i < own.length; i++) {
    const off = i * vPer;
    for (let k = 0; k < m.indices.length; k++) {
      indices[i * m.indices.length + k] = m.indices[k] + off;
    }
  }
  return { positions, normals, colors, indices };
}

/** 三角形预算估算：全部道具实例的三角形总数 */
export function propTriangleCount(
  models: readonly PropModelData[],
  instances: readonly PropInstance[],
): number {
  let tris = 0;
  for (const p of instances) {
    const m = models[p.modelId];
    if (m) tris += m.indices.length / 3;
  }
  return tris;
}
```

`src/rendering/renderer-api.ts` 改动（其余不动）：

```ts
import type { PropInstance, PropModelData } from '../core/prop-types';

export const RENDERER_API_VERSION = 2 as const;

export interface PropDelta {
  readonly added: ReadonlyArray<PropInstance>;
  readonly removed: ReadonlyArray<{ x: number; y: number; z: number; modelId: number }>;
}
```

`RendererAdapter` 接口体追加（可选方法，NullAdapter 无需实现）：

```ts
  /** 一次性上传模型表（可选） */
  definePropModels?(models: readonly PropModelData[]): void;
  /** 全量：首次加载 / 撤销 / 清空 / 恢复存档 / 切换适配器（可选） */
  syncProps?(instances: readonly PropInstance[]): void;
  /** 增量：正常放置 / 删除（可选） */
  applyPropDelta?(delta: PropDelta): void;
```

- [ ] **Step 4: 运行确认通过（含回归）**

Run: `npx vitest run tests/core/prop-mesh-builder.test.ts tests/rendering/`
Expected: prop-mesh-builder 7 用例 PASS；适配器既有用例仍 PASS（apiVersion 引用常量，无硬编码断言）。

Run: `npm run typecheck`
Expected: 零错误。

- [ ] **Step 5: 提交**

```bash
git add src/rendering/renderer-api.ts src/core/prop-mesh-builder.ts tests/core/prop-mesh-builder.test.ts
git commit -m "feat(rendering): renderer api v2 optional prop methods + shared prop batch builder"
```

---

### Task 8: Three 适配器道具分批渲染

**Files:**
- Modify: `src/rendering/adapters/three-adapter.ts`
- Test: `tests/rendering/three-adapter.test.ts`（扩展）

**Interfaces:**
- Consumes: Task 7 的 `PropDelta`、`buildPropBatch`、`RENDERER_API_VERSION = 2`
- Produces: `ThreeAdapter` 实现 `definePropModels / syncProps / applyPropDelta`——按 modelId 分批 `BufferGeometry` + Uint32 `setIndex`，增量只重建受影响批，`MeshLambertMaterial({ vertexColors: true })` 共享，`castShadow = receiveShadow = true`；init 前调用新方法安全 no-op

- [ ] **Step 1: 写失败测试**

`tests/rendering/three-adapter.test.ts` 追加：

```ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/rendering/three-adapter.test.ts`
Expected: FAIL——`apiVersion` 断言或 `definePropModels` undefined。

- [ ] **Step 3: 写实现**

`three-adapter.ts` imports 追加：

```ts
import type { PropInstance, PropModelData } from '../../core/prop-types';
import type { PropDelta } from '../renderer-api';
import { buildPropBatch } from '../../core/prop-mesh-builder';
```

类内新增字段：

```ts
private propMaterial!: THREE.MeshLambertMaterial;
private propMeshes = new Map<number, THREE.Mesh>();          // modelId → 批 Mesh
private propInstByModel = new Map<number, PropInstance[]>(); // modelId → 实例列表
private propModels: readonly PropModelData[] = [];
```

`init()` 末尾（`scene.add(this.sun.target);` 之后）追加：

```ts
this.propMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
```

新增方法（放在 `applyBlockDelta` 之后）：

```ts
definePropModels(models: readonly PropModelData[]): void {
  this.propModels = models;
}

syncProps(instances: readonly PropInstance[]): void {
  if (!this.scene) return; // init 前安全 no-op
  this.propInstByModel = new Map();
  for (const p of instances) {
    const list = this.propInstByModel.get(p.modelId);
    if (list) list.push(p);
    else this.propInstByModel.set(p.modelId, [p]);
  }
  for (const mesh of this.propMeshes.values()) {
    this.scene.remove(mesh);
    mesh.geometry.dispose();
  }
  this.propMeshes.clear();
  for (const id of this.propInstByModel.keys()) this.rebuildPropBatch(id);
  this.requestRender();
}

applyPropDelta(delta: PropDelta): void {
  if (!this.scene) return;
  const affected = new Set<number>();
  for (const p of delta.added) {
    const list = this.propInstByModel.get(p.modelId);
    if (list) list.push(p);
    else this.propInstByModel.set(p.modelId, [p]);
    affected.add(p.modelId);
  }
  for (const r of delta.removed) {
    const list = this.propInstByModel.get(r.modelId);
    if (list) {
      const i = list.findIndex((q) => q.x === r.x && q.y === r.y && q.z === r.z);
      if (i >= 0) list.splice(i, 1);
      affected.add(r.modelId);
    }
  }
  for (const id of affected) this.rebuildPropBatch(id);
  this.requestRender();
}

private rebuildPropBatch(modelId: number): void {
  const old = this.propMeshes.get(modelId);
  if (old) {
    this.scene.remove(old);
    old.geometry.dispose();
    this.propMeshes.delete(modelId);
  }
  const insts = this.propInstByModel.get(modelId) ?? [];
  if (insts.length === 0) return;
  const batch = buildPropBatch(this.propModels, insts, modelId);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(batch.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(batch.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(batch.colors, 3));
  g.setIndex(new THREE.BufferAttribute(batch.indices, 1)); // Uint32Array → three 自动启用 OES_element_index_uint
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, this.propMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  this.scene.add(mesh);
  this.propMeshes.set(modelId, mesh);
}
```

`dispose()` 中 `this.renderer?.dispose();` 之前追加：

```ts
for (const mesh of this.propMeshes.values()) {
  this.scene?.remove(mesh);
  mesh.geometry.dispose();
}
this.propMeshes.clear();
this.propMaterial?.dispose();
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/rendering/`
Expected: PASS（three 2 用例 + webgl/null/factory 既有用例）。

Run: `npm run typecheck`
Expected: 零错误。

- [ ] **Step 5: 提交**

```bash
git add src/rendering/adapters/three-adapter.ts tests/rendering/three-adapter.test.ts
git commit -m "feat(three): prop batches per model id with uint32 indices and shadow flags"
```

---

### Task 9: 手写 WebGL 适配器第二 program

**Files:**
- Modify: `src/rendering/adapters/webgl-adapter.ts`
- Test: `tests/rendering/webgl-adapter.test.ts`（扩展）

**Interfaces:**
- Consumes: Task 7 的 `PropDelta`、`buildPropBatch`；Task 8 同构的实例表逻辑
- Produces: `WebGLAdapter` 实现 `definePropModels / syncProps / applyPropDelta`；道具 program（顶点色、无图集采样）；`drawElements(…, gl.UNSIGNED_INT, …)`；init 时 `gl.getExtension('OES_element_index_uint')` 缺失即抛错；`setTheme` 同步更新两套 program 的 `uExposure / uLightTint`

- [ ] **Step 1: 写失败测试**

`tests/rendering/webgl-adapter.test.ts` 追加：

```ts
it('exposes optional prop methods and no-ops them safely before init', () => {
  const a = new WebGLAdapter();
  expect(a.apiVersion).toBe(2);
  expect(typeof a.definePropModels).toBe('function');
  expect(typeof a.syncProps).toBe('function');
  expect(typeof a.applyPropDelta).toBe('function');
  a.definePropModels([]);
  a.syncProps([]);
  a.applyPropDelta({ added: [], removed: [] }); // init 前调用不得抛错
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/rendering/webgl-adapter.test.ts`
Expected: FAIL——`definePropModels` undefined。

- [ ] **Step 3: 写实现**

`webgl-adapter.ts` imports 追加与新增 shader（与体素 FRAG 同光照公式，`vColor` 取代 `texture2D(uAtlas, vUV) * vLight`）：

```ts
import type { PropInstance, PropModelData } from '../../core/prop-types';
import type { PropDelta } from '../renderer-api';
import { buildPropBatch } from '../../core/prop-mesh-builder';

const PROP_VERT = /* glsl */ `
  attribute vec3 position;
  attribute vec3 normal;
  attribute vec3 aColor;
  uniform mat4 uMatrix;
  varying vec3 vNormal;
  varying vec3 vColor;
  void main() {
    vNormal = normal;
    vColor = aColor;
    gl_Position = uMatrix * vec4(position, 1.0);
  }
`;

const PROP_FRAG = /* glsl */ `
  precision mediump float;
  #define RECIPROCAL_PI 0.31830988618
  uniform vec3 uLightDir;
  uniform float uAmbient;
  uniform float uExposure;
  uniform vec3 uLightTint;
  varying vec3 vNormal;
  varying vec3 vColor;
  vec3 toSRGB(vec3 c) {
    c = max(c, vec3(0.0));
    return mix(c * 12.92, 1.055 * pow(c, vec3(0.4166667)) - 0.055, step(vec3(0.0031308), c));
  }
  void main() {
    float diff = max(dot(normalize(vNormal), uLightDir), 0.0);
    vec3 lit = vColor * (uAmbient + (1.0 - uAmbient) * diff) * uExposure * RECIPROCAL_PI * uLightTint;
    gl_FragColor = vec4(toSRGB(lit), 1.0);
  }
`;
```

类内新增字段：

```ts
private propProgram!: WebGLProgram;
private pAPos = 0;
private pANrm = 0;
private pACol = 0;
private pMatrix!: WebGLUniformLocation | null;
private pExposure!: WebGLUniformLocation | null;
private pLightTint!: WebGLUniformLocation | null;
private propBatches: Array<{
  modelId: number; posBuf: WebGLBuffer; nrmBuf: WebGLBuffer;
  colBuf: WebGLBuffer; idxBuf: WebGLBuffer; count: number;
}> = [];
private propModels: readonly PropModelData[] = [];
private propInstByModel = new Map<number, PropInstance[]>();
```

`init()` 中、体素 program 的 `uniform3f(this.uLightTint, 1, 1, 1);` 之后追加：

```ts
this.propProgram = this.createProgram(PROP_VERT, PROP_FRAG);
this.gl.useProgram(this.propProgram);
this.pAPos = this.gl.getAttribLocation(this.propProgram, 'position');
this.pANrm = this.gl.getAttribLocation(this.propProgram, 'normal');
this.pACol = this.gl.getAttribLocation(this.propProgram, 'aColor');
this.pMatrix = this.gl.getUniformLocation(this.propProgram, 'uMatrix');
this.pExposure = this.gl.getUniformLocation(this.propProgram, 'uExposure');
this.pLightTint = this.gl.getUniformLocation(this.propProgram, 'uLightTint');
const ldir2 = normalize([0.5, 1, 0.3]);
this.gl.uniform3f(this.gl.getUniformLocation(this.propProgram, 'uLightDir'), ldir2[0], ldir2[1], ldir2[2]);
this.gl.uniform1f(this.gl.getUniformLocation(this.propProgram, 'uAmbient'), 0.6);
this.gl.uniform1f(this.pExposure, 1);
this.gl.uniform3f(this.pLightTint, 1, 1, 1);
if (!this.gl.getExtension('OES_element_index_uint')) {
  throw new Error('OES_element_index_uint unavailable'); // 工厂降级到其余适配器
}
```

`setTheme()` 在原体素 program 分支与 clearColor 逻辑之后追加（原逻辑不动）：

```ts
if (this.propProgram) {
  this.gl.useProgram(this.propProgram);
  if (theme.exposure !== undefined) this.gl.uniform1f(this.pExposure, theme.exposure);
  if (theme.temperature !== undefined) {
    this.gl.uniform3f(this.pLightTint, this.tint[0], this.tint[1], this.tint[2]);
  }
}
```

新增方法（与 Three 适配器同构）：

```ts
definePropModels(models: readonly PropModelData[]): void {
  this.propModels = models;
}

syncProps(instances: readonly PropInstance[]): void {
  if (!this.gl) return; // init 前安全 no-op
  this.propInstByModel = new Map();
  for (const p of instances) {
    const list = this.propInstByModel.get(p.modelId);
    if (list) list.push(p);
    else this.propInstByModel.set(p.modelId, [p]);
  }
  for (const b of this.propBatches.splice(0, this.propBatches.length)) this.deleteBatch(b);
  for (const id of this.propInstByModel.keys()) this.rebuildPropBatch(id);
  this.requestRender();
}

applyPropDelta(delta: PropDelta): void {
  if (!this.gl) return;
  const affected = new Set<number>();
  for (const p of delta.added) {
    const list = this.propInstByModel.get(p.modelId);
    if (list) list.push(p);
    else this.propInstByModel.set(p.modelId, [p]);
    affected.add(p.modelId);
  }
  for (const r of delta.removed) {
    const list = this.propInstByModel.get(r.modelId);
    if (list) {
      const i = list.findIndex((q) => q.x === r.x && q.y === r.y && q.z === r.z);
      if (i >= 0) list.splice(i, 1);
      affected.add(r.modelId);
    }
  }
  for (const id of affected) this.rebuildPropBatch(id);
  this.requestRender();
}

private deleteBatch(b: { posBuf: WebGLBuffer; nrmBuf: WebGLBuffer; colBuf: WebGLBuffer; idxBuf: WebGLBuffer }): void {
  this.gl.deleteBuffer(b.posBuf);
  this.gl.deleteBuffer(b.nrmBuf);
  this.gl.deleteBuffer(b.colBuf);
  this.gl.deleteBuffer(b.idxBuf);
}

private rebuildPropBatch(modelId: number): void {
  const gl = this.gl;
  const i = this.propBatches.findIndex((b) => b.modelId === modelId);
  if (i >= 0) {
    this.deleteBatch(this.propBatches[i]);
    this.propBatches.splice(i, 1);
  }
  const insts = this.propInstByModel.get(modelId) ?? [];
  if (insts.length === 0) return;
  const batch = buildPropBatch(this.propModels, insts, modelId);
  const posBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, batch.positions, gl.STATIC_DRAW);
  const nrmBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
  gl.bufferData(gl.ARRAY_BUFFER, batch.normals, gl.STATIC_DRAW);
  const colBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
  gl.bufferData(gl.ARRAY_BUFFER, batch.colors, gl.STATIC_DRAW);
  const idxBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, batch.indices, gl.STATIC_DRAW);
  this.propBatches.push({ modelId, posBuf, nrmBuf, colBuf, idxBuf, count: batch.indices.length });
}
```

`render()` 内、体素 `drawElements` 之后（`if (this.indexCount > 0 && this.cameraState) { … }` 块之后）追加：

```ts
if (this.propBatches.length > 0 && this.cameraState) {
  gl.useProgram(this.propProgram);
  gl.uniformMatrix4fv(this.pMatrix, false, this.matrix);
  for (const b of this.propBatches) {
    gl.bindBuffer(gl.ARRAY_BUFFER, b.posBuf);
    gl.enableVertexAttribArray(this.pAPos);
    gl.vertexAttribPointer(this.pAPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.nrmBuf);
    gl.enableVertexAttribArray(this.pANrm);
    gl.vertexAttribPointer(this.pANrm, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.colBuf);
    gl.enableVertexAttribArray(this.pACol);
    gl.vertexAttribPointer(this.pACol, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idxBuf);
    gl.drawElements(gl.TRIANGLES, b.count, gl.UNSIGNED_INT, 0);
  }
}
```

`dispose()` 中 `gl.deleteProgram(this.program);` 之前追加：

```ts
for (const b of this.propBatches.splice(0, this.propBatches.length)) this.deleteBatch(b);
gl.deleteProgram(this.propProgram);
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/rendering/`
Expected: PASS（webgl 2 用例 + 其余既有用例）。

Run: `npm run typecheck`
Expected: 零错误。

- [ ] **Step 5: 提交**

```bash
git add src/rendering/adapters/webgl-adapter.ts tests/rendering/webgl-adapter.test.ts
git commit -m "feat(webgl): second vertex-color program with uint32 prop batches and dual-program theme sync"
```

---

### Task 10: UI「模型」分组

**Files:**
- Modify: `src/ui/index.ts`、`src/style.css`、`src/app.ts`（仅 bindUI 调用点与占位 handler）
- Test: `tests/ui/index.test.ts`（更新既有用例 + 新增）

**Interfaces:**
- Consumes: Task 1 的 `PropModelData`（由 app 传入，UI 不 import assets）
- Produces: `UIHandlers` 新增 `onPropSelect(modelId: number): void`；`bindUI(handlers: UIHandlers, propModels: readonly PropModelData[]): void`（app 侧 Task 11 之前传 `PROP_MODELS`，handler 先占位）

- [ ] **Step 1: 写失败测试**

`tests/ui/index.test.ts` 改动——`handlers()` 返回对象加 `onPropSelect: vi.fn()`；所有 `bindUI(h)` 改为 `bindUI(h, PROPS)`；顶部新增 fixture；既有「selects a preset」用例改用 title 定位（道具组追加后「最后一个 palette-item」不再是花丛）；追加新用例：

```ts
import type { PropModelData } from '../../src/core/prop-types';

const PROPS: PropModelData[] = [0, 1, 2].map((i) => ({
  name: `模型${i}`, icon: `data:image/png;base64,${i}`,
  positions: new Float32Array(0), normals: new Float32Array(0), colors: new Float32Array(0),
  indices: new Uint16Array(0), footprint: 1, height: 1,
}));

// 既有用例 'selects a preset from the palette' 改为：
it('selects a preset from the palette', () => {
  const h = handlers();
  bindUI(h, PROPS);
  (document.querySelector('.palette-item[title="花丛"]') as HTMLButtonElement).click();
  expect(h.onPresetSelect).toHaveBeenCalled();
});

// 新增：
it('renders a prop group with icons', () => {
  const h = handlers();
  bindUI(h, PROPS);
  const items = document.querySelectorAll('.props-group .palette-item');
  expect(items.length).toBe(3);
  for (const it of items) {
    const img = it.querySelector('img');
    expect(img?.src.startsWith('data:image/png;base64,')).toBe(true);
  }
});

it('selects a prop model and keeps selection exclusive across groups', () => {
  const h = handlers();
  bindUI(h, PROPS);
  (document.querySelector('.palette-item[title="草地"]') as HTMLButtonElement).click();
  (document.querySelectorAll('.props-group .palette-item')[1] as HTMLButtonElement).click();
  expect(h.onPropSelect).toHaveBeenCalledWith(1);
  expect(h.onBlockSelect).toHaveBeenCalledWith(1); // 先点过方块
  const active = document.querySelectorAll('.palette-item.active');
  expect(active.length).toBe(1);
  expect((active[0] as HTMLElement).title).toBe('模型1');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/ui/index.test.ts`
Expected: FAIL——`bindUI` 需要 2 个参数 / `.props-group` 不存在（fixture 导入也编译失败）。

- [ ] **Step 3: 写实现**

`src/ui/index.ts` 改动：

```ts
import type { PropModelData } from '../core/prop-types';

export interface UIHandlers {
  onModeChange(mode: EditorMode): void;
  onBlockSelect(type: number): void;
  onPresetSelect(key: string): void;
  onPropSelect(modelId: number): void;   // 新增
  onUndo(): void;
  onReset(): void;
  onSaveAlbum(): void;
  onShareNote(): void;
  onPerspectiveChange(distance: number): void;
  onAdapterChange(name: string): void;
  onLightingChange(exposure: number): void;
  onTemperatureChange(kelvin: number): void;
}

export function bindUI(handlers: UIHandlers, propModels: readonly PropModelData[]): void {
  // ……mode-group / actions / perspective / adapterRow / lightRow / tempRow 构建代码全部不变……

  // 原「PALETTE_ITEMS.forEach(...)」整块替换为：
  const clearActive = (): void => {
    palette.querySelectorAll('.palette-item').forEach((b) => b.classList.remove('active'));
  };

  const blocksGroup = document.createElement('div');
  blocksGroup.className = 'palette-group';
  PALETTE_ITEMS.forEach((item) => {
    const btn = document.createElement('button');
    btn.className = 'palette-item';
    btn.textContent = item.icon;
    btn.title = item.name;
    btn.addEventListener('click', () => {
      clearActive();
      btn.classList.add('active');
      if (item.type !== undefined) handlers.onBlockSelect(item.type);
      if (item.preset) handlers.onPresetSelect(item.preset);
    });
    blocksGroup.appendChild(btn);
  });

  const propsGroup = document.createElement('div');
  propsGroup.className = 'palette-group props-group';
  const label = document.createElement('span');
  label.className = 'palette-group-label';
  label.textContent = '模型';
  propsGroup.appendChild(label);
  propModels.forEach((m, modelId) => {
    const btn = document.createElement('button');
    btn.className = 'palette-item';
    btn.title = m.name;
    const img = document.createElement('img');
    img.src = m.icon;
    img.alt = m.name;
    img.draggable = false;
    btn.appendChild(img);
    btn.addEventListener('click', () => {
      clearActive();
      btn.classList.add('active');
      handlers.onPropSelect(modelId);
    });
    propsGroup.appendChild(btn);
  });

  palette.appendChild(blocksGroup);
  palette.appendChild(propsGroup);
}
```

`src/style.css` 追加：

```css
.palette-group { display: flex; flex: 0 0 auto; }
.palette > .palette-group + .palette-group {
  margin-left: 6px;
  padding-left: 8px;
  border-left: 1px solid rgba(0, 0, 0, 0.12);
}
.palette-group-label {
  flex: 0 0 auto;
  align-self: center;
  font-size: 11px;
  color: #666;
  margin-right: 4px;
}
.palette-item img { width: 30px; height: 30px; display: block; pointer-events: none; }
```

`src/app.ts` 最小接线（占位，Task 11 填实）——imports 区追加：

```ts
import { PROP_MODELS } from './assets/props.generated';
```

`bindUI({ … })` 调用改为 `bindUI({ …, onPropSelect: (_modelId: number): void => {}, … }, PROP_MODELS)`（其余 handler 不动）。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/ui/index.test.ts`
Expected: PASS（既有 8 + 修改 1 + 新增 2）。

Run: `npm run typecheck`
Expected: 零错误（`onPropSelect` 已有占位实现）。

- [ ] **Step 5: 提交**

```bash
git add src/ui/index.ts src/style.css src/app.ts tests/ui/index.test.ts
git commit -m "feat(ui): prop palette group with preview icons and exclusive selection"
```

---

### Task 11: app 接线（放置 / 删除 / 撤销 / 存档 v2 / 切适配器 / 三角守卫）

**Files:**
- Modify: `src/app.ts`

**Interfaces:**
- Consumes: Task 3 `PROP_MODELS`、Task 4 `createPropWorld / PropWorld`、Task 5 `pick / PickHit`、Task 6 `SetPropAction / BatchPropAction / SavePayload`、Task 7 `propTriangleCount`、Task 8/9 适配器可选方法
- Produces: 完整道具编辑闭环（app 无 DOM-less 测试挂点，无独立单测——核心逻辑已在前 10 个任务的纯函数测试中覆盖，行为由 Task 12 手工验收清单 + bundle 扫描钉住）

- [ ] **Step 1: imports 与状态**

```ts
// 追加 import；并移除 voxelRaycast 的 import（统一拾取改用 pick）
import { createPropWorld } from './core/prop-world';
import { pick, type PickHit } from './core/pick';
import { propTriangleCount } from './core/prop-mesh-builder';
import type { SavePayload } from './platform/storage';
```

`bootstrap()` 内、`const history = createHistory();` 之后：

```ts
const propWorld = createPropWorld(PROP_MODELS);
const PROP_TRIANGLE_BUDGET = 90_000;
```

状态区（`let currentPreset: string | null = null;` 之后）：

```ts
let currentPropModelId: number | null = null;
```

- [ ] **Step 2: 模型表上传 + 存档恢复**

首次 `renderer.setCamera(toRendererCameraState(camera));`（`syncWorld` 之后那次）之后追加：

```ts
renderer.definePropModels?.(PROP_MODELS);
```

存档恢复块替换为（体素/相机逻辑不变，追加 props 恢复与全量同步）：

```ts
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
```

- [ ] **Step 3: 存档载荷 v2（两处调用点共用 builder）**

替换 `scheduleSave` 定义（`visibilitychange` 内联载荷同步替换）：

```ts
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
```

`visibilitychange` 回调内改为：`void saveWorld(buildSavePayload());`

- [ ] **Step 4: handleTap 统一拾取 + 道具放置/删除**

替换整个 `handleTap`，并新增 `placeProp / removeProp` 两个局部函数：

```ts
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
```

- [ ] **Step 5: undo 扩展**

`undo()` 之前新增 `undoPropCell`，`undo()` 改为（体素分支逐字保留）：

```ts
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
```

- [ ] **Step 6: 切适配器 / 清空 / UI handler**

`switchRenderer` 内 `next.syncWorld(world.snapshot());` 之后追加：

```ts
next.definePropModels?.(PROP_MODELS);
next.syncProps?.(propWorld.list());
```

`onReset` 改为：

```ts
onReset: () => {
  world.clear();
  seedGround(world);
  history.clear();
  propWorld.clear();
  renderer.syncWorld(world.snapshot());
  renderer.syncProps?.([]);
  scheduleSave();
},
```

`bindUI` handlers 改为（替换 Task 10 的占位 `onPropSelect`；三个选中 handler 增加互斥清理）：

```ts
onBlockSelect: (t) => { currentBlockType = t as BlockId; currentPreset = null; currentPropModelId = null; },
onPresetSelect: (key) => { currentPreset = key; currentPropModelId = null; },
onPropSelect: (modelId) => { currentPropModelId = modelId; currentPreset = null; },
```

- [ ] **Step 7: 全量验证**

Run: `npm run typecheck`
Expected: 零错误（`voxelRaycast` import 已移除、无 unused）。

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 8: 提交**

```bash
git add src/app.ts
git commit -m "feat(app): wire prop placement/removal/undo/save-v2/adapter-switch with triangle budget guard"
```

---

### Task 12: 集成验收 + 产物审计打包

**Files:**
- Modify: `tests/scan/bundle.test.ts`（追加道具相关扫描）
- Create: `build/garden-minitool.zip`（产物）

**Interfaces:**
- Consumes: 全部前序任务的 `dist/` 产物

- [ ] **Step 1: 写扫描测试**（`tests/scan/bundle.test.ts` 的 `FORBIDDEN` 数组追加三项）

```ts
['GLTFLoader', /GLTFLoader/],
['three/examples', /three\/examples/],
['node:zlib', /node:zlib/],
```

并追加一个存在性用例（钉住 base64 解码路径已进入产物）：

```ts
it('ships the baked prop models as base64 data', () => {
  const src = readFileSync(BUNDLE, 'utf8');
  expect(src.includes('atob(')).toBe(true);
  expect(src.includes('data:image/png;base64,')).toBe(true);
});
```

- [ ] **Step 2: 运行确认通过**

Run: `npm run build`
Expected: `build done`。

Run: `npx vitest run tests/scan/bundle.test.ts`
Expected: PASS（3 用例）。若 `node:zlib` 命中——说明烘焙脚本被错误 import 进 app，检查 `src/` 的 import 链。

- [ ] **Step 3: 全量单测**

Run: `npm test`
Expected: 全部 PASS（40+ 用例，含新增 prop 系列）。

- [ ] **Step 4: 体积审计（先审目录，再打包）**

Run: `node .skill/minitool-zip-builder/scripts/audit_artifact.mjs ./dist`
Expected: 无 ERROR（`app.js` 预计 ~900KB–1.1MB，低于 2MiB 风险线；WARN 记录并说明）。

- [ ] **Step 5: 打包（压内容不压目录，index.html 必须在 zip 根）**

```powershell
Compress-Archive -Path dist/* -DestinationPath build/garden-minitool.zip -Force
# 校验 zip 根直接是 index.html：
[System.IO.Compression.ZipFile]::OpenRead((Resolve-Path build/garden-minitool.zip)).Entries.FullName
```

Expected: 条目列表顶层直接为 `index.html / app.js / style.css`，无外层目录包裹。

Run: `node .skill/minitool-zip-builder/scripts/audit_artifact.mjs ./build/garden-minitool.zip`
Expected: 无 ERROR（zip 预计 ~300–400KB，远低于 2MiB 建议线）。

- [ ] **Step 6: 手工验收清单（本地浏览器开发自检——非容器验收依据）**

打开 `dist/index.html`，逐项核对：

1. 放置模式选「模型」组任意图标 → 点击地面，道具落在整格、底面贴地、受光正确
2. 点树冠顶面 → 上方叠放另一道具/方块成功；点树冠侧删除 → 整棵树移除（不误删后方地形）
3. 道具上放方块失败（toast「位置被方块占据」）；两个道具占用列重叠失败（toast「位置被占用」）
4. 撤销 ×2：先撤销删除/放置，体素与道具动作独立可回退
5. 放置若干道具 → 刷新页面 → 道具与方块均恢复（存档 v2）；localStorage 中旧 v1 存档可正常读取
6. 适配器切 Three ↔ WebGL → 道具层不消失；光照滑杆与色温滑杆对道具同步生效（两渲染器观感一致）
7. 「清空」→ 道具与方块一起清空并可撤销记录复位

- [ ] **Step 7: 真机验证提醒（交付时必附，不阻塞 zip 交付）**

> 本 zip 需上传创服平台，先在**平台模拟器**完成完整功能验证（放置/删除/撤销/存档恢复/分享），再用 **Android 真机**与 **iOS 真机**扫码验证相同产物；浏览器直跑结论不可作为验收依据。

- [ ] **Step 8: 提交**

```bash
git add tests/scan/bundle.test.ts
git commit -m "test(scan): prop-aware bundle scan + acceptance checklist"
```

---

## Self-Review 记录

- **Spec 覆盖**：spec §4（prop-types/prop-world）→ Task 1/4；§5（接口 v2 + PropDelta 含 modelId）→ Task 7；§6.1/6.2（分批 + Uint32 + 双 program 主题同步 + OES 守卫）→ Task 8/9；§7（纯 Node 烘焙、de-index、Previews 图标、base64 序列化）→ Task 1/2/3；§8（统一拾取/占用列校验/删除分派/rot=0）→ Task 5/11；§9（setProp/batchProp + 存档 v2 + 键名不变 + v1 兼容）→ Task 6/11；§10（模型分组/互斥选中）→ Task 10；§11（文件清单与阶段）→ Task 1–12 全量对应；§13（三角形守卫 90k、Uint32、真机提醒）→ Task 11/12。无遗漏。
- **占位符扫描**：全部实现与测试代码内联，无 TBD/「稍后实现」；唯一的调整型步骤（Task 3 Step 3 的 SPECS size 微调）以打印的 footprint/height 输出为判定依据，属有界决策。
- **类型一致性**：`PropModelData/PropInstance`（Task 1 定义，后续全部沿用）；`PropWorld.add(x,y,z,modelId)` 四参签名在 Task 4/11 一致；`PropDelta.removed` 含 `modelId`（Task 7 定义，Task 8/9/11 消费）；`PickHit.kind/prop`（Task 5 定义，Task 11 消费）；`SavePayload` union（Task 6 定义，Task 11 `buildSavePayload` 生产 v2）；`bindUI(handlers, propModels)`（Task 10 定义并更新既有测试，Task 11 换实 handler）。
- **Review Focus 落地**：5 条分别由 Task 1（5121 fixture）、Task 4+5（占用列/树冠）、Task 7（BASE_EPSILON 断言）、Task 6（v1 兼容）、Task 11+12（switchRenderer 接线 + 手工清单第 6 条）钉住。
- **涟漪核对**：Task 10 改 `bindUI` 签名 → 同任务更新既有 ui 测试 + app 占位 handler（typecheck 不破）；Task 6 union 化 SavePayload → app 的 v1 字面量在 Task 11 前仍合法；Task 7 升 `RENDERER_API_VERSION` → 适配器引用常量自动跟随，测试断言 2。

