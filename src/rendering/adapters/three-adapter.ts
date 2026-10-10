import * as THREE from 'three';
import {
  RENDERER_API_VERSION,
  DEFAULT_AMBIENT,
  DEFAULT_DIRECTIONAL,
  type RendererAdapter,
  type RendererInitOptions,
  type CameraState,
  type WorldSnapshot,
  type BlockDelta,
  type Ray,
  type Theme,
  type Capabilities,
} from '../renderer-api';
import { buildVoxelMesh } from '../../core/mesh-builder';
import { kelvinToRgb, kelvinBackgroundFactor } from '../color-temperature';
import type { PropInstance, PropModelData } from '../../core/prop-types';
import type { PropDelta } from '../renderer-api';
import { buildPropBatch } from '../../core/prop-mesh-builder';

export interface AtlasTextureLike {
  magFilter: number;
  minFilter: number;
  generateMipmaps: boolean;
  wrapS: number;
  wrapT: number;
  flipY: boolean;
}

/**
 * Configure the atlas texture. `flipY` MUST be false: atlasUV maps tile row 0
 * to v in [0, 1/16], and the atlas paints only row 0 at the top of the canvas.
 * Three's default flipY=true would sample the empty bottom and discard every
 * face. The hand-written WebGL adapter does not flip, so this keeps them equal.
 */
export function configureAtlasTexture(tex: AtlasTextureLike): void {
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.flipY = false;
}

/** 哑光 PBR。金属度为 0；粗糙度接近 1，只在掠射角留一点高光。 */
const SURFACE_METALNESS = 0;
const SURFACE_ROUGHNESS = 0.85;

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

const SLOPE_BIAS_MARK = 'slopeShadowBias';

/**
 * 阴影比较读的是打包进颜色的深度，polygonOffset 改不到它。
 * scale：按屏幕空间深度斜率把写入值推远。正对光源的面斜率接近 0。
 * ceiling：斜率超过这个值就是轮廓上的深度间断。那里只留极小常数，
 * 避免把接触阴影推离地面。传 0 表示不设上限（地面大平面用）。
 */
function slopeBiasShadowDepth(
  depthMaterial: THREE.Material,
  webgl2: boolean,
  scale: number,
  ceiling = 0,
): void {
  if (scale <= 0 || depthMaterial.userData[SLOPE_BIAS_MARK]) return;
  depthMaterial.userData[SLOPE_BIAS_MARK] = scale;
  const previous = depthMaterial.onBeforeCompile;
  const biasLine = ceiling > 0
    ? `float slopeZ = max(abs(dFdx(fragCoordZ)), abs(dFdy(fragCoordZ)));
       float biasZ = slopeZ > ${ceiling.toFixed(4)} ? 0.00003 : slopeZ * ${scale.toFixed(1)} + 0.00003;
       fragCoordZ = min(fragCoordZ + biasZ, 1.0);`
    : `float slopeZ = max(abs(dFdx(fragCoordZ)), abs(dFdy(fragCoordZ)));
       fragCoordZ = min(fragCoordZ + slopeZ * ${scale.toFixed(1)} + 0.00002, 1.0);`;
  depthMaterial.onBeforeCompile = (shader, renderer) => {
    previous?.call(depthMaterial, shader, renderer);
    if (!webgl2) {
      shader.fragmentShader = `#extension GL_OES_standard_derivatives : enable\n${shader.fragmentShader}`;
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      'float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;',
      `float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;\n       ${biasLine}`,
    );
  };
  depthMaterial.needsUpdate = true;
}

function enableShadowSlopeBias(mesh: THREE.Mesh, scale: number): void {
  // r160 实际参数是 renderer, object, camera, shadowCamera, geometry, depthMaterial, group。
  // @types/three 少了 camera，按类型取“depthMaterial”会拿到几何体。
  mesh.onBeforeShadow = ((...args: unknown[]) => {
    const renderer = args[0];
    const depthMaterial = args[5];
    if (renderer instanceof THREE.WebGLRenderer && depthMaterial instanceof THREE.Material) {
      slopeBiasShadowDepth(depthMaterial, renderer.capabilities.isWebGL2, scale);
    }
  }) as THREE.Object3D['onBeforeShadow'];
}

export class ThreeAdapter implements RendererAdapter {
  readonly name = 'three';
  readonly apiVersion = RENDERER_API_VERSION;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private geometry!: THREE.BufferGeometry;
  private material!: THREE.MeshStandardMaterial;
  private ambient!: THREE.AmbientLight;
  private sun!: THREE.DirectionalLight;
  private texture!: THREE.CanvasTexture;
  private mesh!: THREE.Mesh;

  private raycaster = new THREE.Raycaster();
  private canvas!: HTMLCanvasElement;
  private tint: [number, number, number] = [1, 1, 1];
  private bgFactor: [number, number, number] = [1, 1, 1];
  private readonly sky = { r: 184 / 255, g: 219 / 255, b: 247 / 255 };
  private needsRender = false;
  private rafId = 0;
  private disposed = false;
  private lastSnapshot: WorldSnapshot | null = null;
  private propMaterial!: THREE.MeshStandardMaterial;
  private propDepthMaterial!: THREE.MeshDepthMaterial;
  private propOpacity = 1;
  private propMeshes = new Map<number, THREE.Mesh>();          // modelId → 批 Mesh
  private propInstByModel = new Map<number, PropInstance[]>(); // modelId → 实例列表
  private propModels: readonly PropModelData[] = [];

  isSupported(caps: Capabilities): boolean {
    return caps.webgl;
  }

  async init(opts: RendererInitOptions): Promise<void> {
    const { canvas, atlasCanvas, devicePixelRatio } = opts;
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setClearColor(0xb8dbf7, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 1, 2000);
    this.camera.up.set(0, 1, 0);

    this.texture = new THREE.CanvasTexture(atlasCanvas);
    configureAtlasTexture(this.texture);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.material = new THREE.MeshStandardMaterial({
      map: this.texture,
      alphaTest: 0.5,
      vertexColors: true,
      side: THREE.DoubleSide,
      // 双面会把同一平面写进阴影贴图两次，掠射时打出条纹。阴影只画背面。
      shadowSide: THREE.BackSide,
      metalness: SURFACE_METALNESS,
      roughness: SURFACE_ROUGHNESS,
    });

    this.geometry = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    enableShadowSlopeBias(this.mesh, 2);
    this.scene.add(this.mesh);

    // 环境光与方向光强度分开。默认 0.78 / 0.52 等于原先 exposure 1.3 乘 0.6 / 0.4。
    this.ambient = new THREE.AmbientLight(0xffffff, DEFAULT_AMBIENT);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffffff, DEFAULT_DIRECTIONAL);
    this.sun.target.position.set(5, 3, 5);
    this.sun.position.set(0.5, 1, 0.3).normalize().multiplyScalar(60).add(this.sun.target.position);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    // 常数深度偏移和法线偏移都会在掠射时把接触阴影推离地面，所以保持 0。
    // 条纹改由阴影通道的坡度偏移处理。光源距目标 60，近远平面只包住这块范围。
    this.sun.shadow.bias = 0;
    this.sun.shadow.normalBias = 0;
    const sc = this.sun.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 36; sc.far = 92;
    sc.updateProjectionMatrix();
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.propMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: SURFACE_METALNESS,
      roughness: SURFACE_ROUGHNESS,
      // 接触阴影要由朝向光源的那一面投下。改画背面时，影子会从物体另一侧才开始。
      shadowSide: THREE.FrontSide,
    });
    // 单独的深度材质，避免改到 Three 共用的那份（地面会从它克隆）。
    // 连续面用坡度偏移消自阴影；轮廓处的深度间断不外推，脚底仍然贴住。
    this.propDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
    });
    slopeBiasShadowDepth(this.propDepthMaterial, this.renderer.capabilities.isWebGL2, 2, 0.004);

    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.geometry?.dispose();
    this.material?.dispose();
    this.texture?.dispose();
    for (const mesh of this.propMeshes.values()) {
      this.scene?.remove(mesh);
      mesh.geometry.dispose();
    }
    this.propMeshes.clear();
    this.propMaterial?.dispose();
    this.propDepthMaterial?.dispose();
    this.renderer?.dispose();
  }

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.needsRender = false;
  };

  private onContextRestored = (): void => {
    this.requestRender();
  };

  resize(width: number, height: number, dpr: number): void {
    this.renderer.setPixelRatio(Math.min(dpr, 1.5));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  setCamera(state: CameraState): void {
    this.camera.position.set(state.position[0], state.position[1], state.position[2]);
    this.camera.up.set(state.up[0], state.up[1], state.up[2]);
    this.camera.fov = (state.fov * 180) / Math.PI;
    this.camera.near = state.near;
    this.camera.far = state.far;
    this.camera.lookAt(state.target[0], state.target[1], state.target[2]);
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  syncWorld(snapshot: WorldSnapshot): void {
    this.lastSnapshot = snapshot;
    this.rebuildGeometry(snapshot);
    this.requestRender();
  }

  applyBlockDelta(delta: BlockDelta): void {
    if (!this.lastSnapshot) return;
    const blocks = this.lastSnapshot.blocks;
    const size = this.lastSnapshot.size;
    const idx = (x: number, y: number, z: number): number => x + y * size + z * size * size;

    for (const b of delta.removed) blocks[idx(b.x, b.y, b.z)] = 0;
    for (const b of delta.added)   blocks[idx(b.x, b.y, b.z)] = b.type;

    this.rebuildGeometry(this.lastSnapshot);
    this.requestRender();
  }

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
    const linearColors = new Float32Array(batch.colors.length);
    for (let i = 0; i < batch.colors.length; i++) linearColors[i] = srgbToLinear(batch.colors[i]);
    g.setAttribute('color', new THREE.BufferAttribute(linearColors, 3));
    g.setIndex(new THREE.BufferAttribute(batch.indices, 1)); // Uint32Array → three 自动启用 OES_element_index_uint
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.propMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.customDepthMaterial = this.propDepthMaterial;
    this.scene.add(mesh);
    this.propMeshes.set(modelId, mesh);
  }

  private rebuildGeometry(snapshot: WorldSnapshot): void {
    const mesh = buildVoxelMesh(snapshot);
    const g = this.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    g.setAttribute('normal',   new THREE.BufferAttribute(mesh.normals, 3));
    g.setAttribute('uv',       new THREE.BufferAttribute(mesh.uvs, 2));
    const colors = new Float32Array(mesh.lights.length * 3);
    for (let i = 0; i < mesh.lights.length; i++) {
      const l = mesh.lights[i];
      colors[i * 3] = l; colors[i * 3 + 1] = l; colors[i * 3 + 2] = l;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    g.computeBoundingSphere();
  }

  screenPointToRay(x: number, y: number): Ray {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((x - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((y - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const o = this.raycaster.ray.origin;
    const d = this.raycaster.ray.direction;
    return {
      origin: [o.x, o.y, o.z],
      direction: [d.x, d.y, d.z],
    };
  }

  setTheme(theme: Theme): void {
    if (theme.ambient !== undefined) this.ambient.intensity = theme.ambient;
    if (theme.directional !== undefined) this.sun.intensity = theme.directional;
    if (theme.temperature !== undefined) {
      this.tint = kelvinToRgb(theme.temperature);
      this.bgFactor = kelvinBackgroundFactor(theme.temperature);
      this.ambient.color.setRGB(this.tint[0], this.tint[1], this.tint[2]);
      this.sun.color.setRGB(this.tint[0], this.tint[1], this.tint[2]);
    }
    if (theme.lightDir !== undefined) {
      const [x, y, z] = theme.lightDir;
      const len = Math.hypot(x, y, z) || 1;
      const t = this.sun.target.position;
      this.sun.position.set(t.x + (x / len) * 60, t.y + (y / len) * 60, t.z + (z / len) * 60);
    }
    if (theme.propOpacity !== undefined) {
      this.propOpacity = theme.propOpacity;
      const ghost = this.propOpacity < 1;
      this.propMaterial.opacity = this.propOpacity;
      this.propMaterial.transparent = ghost;
      this.propMaterial.depthWrite = !ghost;
      this.propMaterial.depthTest = true;
      this.propMaterial.needsUpdate = true;
    }
    if (theme.background !== undefined) {
      this.renderer.setClearColor(theme.background, 1);
    } else {
      const f = this.bgFactor;
      this.renderer.setClearColor(
        new THREE.Color().setRGB(this.sky.r * f[0], this.sky.g * f[1], this.sky.b * f[2], THREE.SRGBColorSpace),
      );
    }
    this.requestRender();
  }

  requestRender(): void {
    if (this.disposed || this.needsRender) return;
    this.needsRender = true;
    this.rafId = requestAnimationFrame(this._loop);
  }

  private _loop = (): void => {
    this.needsRender = false;
    this.rafId = 0;
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  };

  captureImage(): string {
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/png');
  }
}
