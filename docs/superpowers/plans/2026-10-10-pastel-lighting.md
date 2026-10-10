# 粉彩光照实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Three 适配器按动森式均匀粉彩光照工作：半球光、弱暖色太阳、IBL、ACES、Bloom 与 FXAA，并在引擎启动时把 store 里的色温带进渲染器。

**Architecture:** 色温不再是相对 6500K 的白平衡乘数，而是在暖/中性/冷三套粉彩之间插值，分别给出天空、地面、太阳。Three 适配器消费这套颜色，加上 `RoomEnvironment` 和 `EffectComposer`。`Theme` 字段不增不减：`ambient` 驱动半球光强度，`directional` 驱动太阳强度。WebGL 适配器不改着色器，只因共享的 `kelvinToRgb` 变成太阳色而跟着偏色。雾字段继续闲置。

**Tech Stack:** three@0.160（`Scene.environmentIntensity` 不存在）、`three/examples/jsm` 的 RoomEnvironment / EffectComposer / UnrealBloomPass / OutputPass / FXAAShader、vitest。

**Spec:** 本次对话里复查后的光照方案（半球光 + IBL + ACES + Bloom，常数阴影 bias，色温可重写，WebGL 画面允许不一致，启动 `setTheme` 必须带 temperature）。

## Global Constraints

- three 与 `@types/three` 保持 `^0.160.0`，禁止为了 `scene.environmentIntensity` 升级
- esbuild：`format: 'iife'`，`target: ['es2017']`，`supported: { 'dynamic-import': false }`
- `tests/scan/bundle.test.ts` 禁止打包结果出现字面量 `three/examples`、`eval(`、`new Function(`、`import(`、`fetch(`、`GLTFLoader`
- 阴影相机保持光源距离 60、`left/right/top/bottom = ±14`、`near = 36`、`far = 92`（世界 10 格，不照抄参考的 ±20 / 0.5 / 50）
- 体素 `shadowSide: BackSide`、道具 `shadowSide: FrontSide`、`propOpacity < 1` 时透明且不写深度，保持不变
- `Theme` 不新增字段；`fogColor` / `fogNear` / `fogFar` 这次不实现
- tsconfig `strict` + `noUnusedLocals` + `noUnusedParameters`
- 不提交 git，除非用户另要求

## Review Focus

1. **启动帧色温** — `createEngine` 第一次 `setTheme` 必须带上 store 的 `temperature`，否则 Three 停在构造时的 6500K 盘，直到转相机。
2. **局部 `setTheme`** — 只传 `ambient` 时不得清掉半球光颜色或太阳色。
3. **composer 截图** — `captureImage` 必须先 `composer.render()`，相册/分享仍读同一张 canvas。
4. **resize 为 0** — 宽或高为 0 时 FXAA `resolution` 不能除以 0。
5. **打包扫描** — 引入 examples 后 `dist/app.js` 不得含 `three/examples` 字面量，体积仍 < 5MB。

## File Structure

- Modify: `src/rendering/color-temperature.ts` — 粉彩色温插值
- Modify: `tests/rendering/color-temperature.test.ts`
- Create: `src/rendering/pastel-lighting.ts` — Three 专用数值常量
- Create: `tests/rendering/pastel-lighting.test.ts`
- Modify: `src/rendering/renderer-api.ts` — 默认强度 0.9 / 0.8
- Modify: `src/engine/engine.ts` — 启动主题带 temperature
- Modify: `tests/engine/engine.test.ts`
- Modify: `src/rendering/adapters/three-adapter.ts` — 半球光、常数 bias、IBL、后处理
- Create: `tests/rendering/three-adapter-lighting.test.ts` — 源码约束（无 WebGL）
- 不改: `src/rendering/adapters/webgl-adapter.ts`

---

### Task 1: 粉彩色温

**Files:**
- Modify: `src/rendering/color-temperature.ts`
- Test: `tests/rendering/color-temperature.test.ts`

**Interfaces:**
- Produces:
  - `kelvinSunColor(kelvin: number): readonly [number, number, number]`
  - `kelvinSkyColor(kelvin: number): readonly [number, number, number]`
  - `kelvinGroundColor(kelvin: number): readonly [number, number, number]`
  - `kelvinToRgb(kelvin: number)` 等于 `kelvinSunColor`（WebGL 仍当光源 tint）
  - `kelvinBackgroundFactor(kelvin: number)` 等于当前天空色除以 6500K 天空色

- [x] **Step 1: 重写测试并确认失败**

6500K 太阳为 `0xFFF8DC`，天空为 `0xBBE0FF`，地面为 `0x6B4423`。1500K 太阳 `r > g > b` 且 `g > 0.35`。20000K 太阳 `b > r` 且 `r < 0.6`。`kelvinToRgb(6500)` 不再是纯白。

Run: `npx vitest run tests/rendering/color-temperature.test.ts`
Expected: FAIL

- [x] **Step 2: 实现插值**

中性 6500K、暖端 1500K、冷端 20000K，线性插值，分量夹在 0..1。背景倍数允许大于 1。

- [x] **Step 3: 测试通过**

Run: `npx vitest run tests/rendering/color-temperature.test.ts`
Expected: PASS

### Task 2: 默认强度与光照常量

**Files:**
- Create: `src/rendering/pastel-lighting.ts`
- Create: `tests/rendering/pastel-lighting.test.ts`
- Modify: `src/rendering/renderer-api.ts`

**Interfaces:**
- Produces: `PASTEL_ENV_MAP_INTENSITY = 0.4`，`PASTEL_TONE_MAPPING_EXPOSURE = 1`，`PASTEL_BLOOM_STRENGTH = 0.6`，`PASTEL_BLOOM_RADIUS = 0.6`，`PASTEL_BLOOM_THRESHOLD = 0.85`，`PASTEL_SHADOW_BIAS = -0.0005`，`PASTEL_SHADOW_NORMAL_BIAS = 0.02`，`PASTEL_HEMI_SKY = 0xBBE0FF`，`PASTEL_HEMI_GROUND = 0x6B4423`，`PASTEL_SUN = 0xFFF8DC`
- Produces: `DEFAULT_AMBIENT = 0.9`，`DEFAULT_DIRECTIONAL = 0.8`

- [x] **Step 1: 写常量测试，确认失败**
- [x] **Step 2: 添加常量并改默认强度**
- [x] **Step 3: 测试通过**

Run: `npx vitest run tests/rendering/pastel-lighting.test.ts`

### Task 3: 引擎启动带色温

**Files:**
- Modify: `src/engine/engine.ts`（初始化 `setTheme`）
- Test: `tests/engine/engine.test.ts`

**Interfaces:**
- Consumes: `EditorState.temperature`（默认 5000）

- [x] **Step 1: 断言第一次 `setTheme` 含 `temperature: 5000`，确认失败**
- [x] **Step 2: 初始化调用改为**

```ts
renderer.setTheme({
  ambient: initial.ambient,
  directional: initial.directional,
  temperature: initial.temperature,
  lightDir: initial.lightDir,
});
```

- [x] **Step 3: 测试通过**

Run: `npx vitest run tests/engine/engine.test.ts`

### Task 4: Three 适配器

**Files:**
- Modify: `src/rendering/adapters/three-adapter.ts`
- Test: `tests/rendering/three-adapter-lighting.test.ts`

**Interfaces:**
- Consumes: Task 1 的四个色温函数，Task 2 的常量与 `DEFAULT_AMBIENT` / `DEFAULT_DIRECTIONAL`

- [x] **Step 1: 源码约束测试失败** — 必须出现 `HemisphereLight`、`RoomEnvironment`、`EffectComposer`、`UnrealBloomPass`、`OutputPass`、`FXAAShader`、`ACESFilmicToneMapping`、`envMapIntensity`、`composer.render`、`PASTEL_SHADOW_BIAS`；不得出现 `slopeBiasShadowDepth`、`AmbientLight`
- [x] **Step 2: 改造适配器**
  - 删除坡度偏移与 `propDepthMaterial` / `customDepthMaterial`
  - `HemisphereLight` + 暖色 `DirectionalLight`
  - `shadow.bias` / `normalBias` 用常量；阴影相机范围不动
  - `RoomEnvironment(renderer)` + `PMREMGenerator.fromScene(..., 0.04)`，随后 `room.dispose()` 与 `pmrem.dispose()`
  - 两种 `MeshStandardMaterial` 的 `envMapIntensity`
  - `toneMapping = ACESFilmicToneMapping`
  - Pass 顺序：RenderPass → UnrealBloomPass → FXAA `ShaderPass` → OutputPass
  - `resize` / `_loop` / `captureImage` 走 composer；FXAA resolution 用 `max(width,1)`、`max(height,1)`
  - `setTheme`：`ambient` → `hemi.intensity`；色温分别写 `hemi.color`、`hemi.groundColor`、`sun.color`（`SRGBColorSpace`）
- [x] **Step 3: 测试、类型检查、打包扫描通过**

Run: `npx vitest run tests/rendering/three-adapter-lighting.test.ts tests/rendering/color-temperature.test.ts tests/rendering/pastel-lighting.test.ts tests/engine/engine.test.ts`
Run: `npx tsc --noEmit`
Run: `npx vitest run tests/scan/bundle.test.ts`
