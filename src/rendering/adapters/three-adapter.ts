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
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildVoxelMesh } from '../../core/mesh-builder';
import { kelvinSkyColor, kelvinGroundColor, kelvinSunColor, kelvinBackgroundFactor } from '../color-temperature';
import type { PropInstance, PropModelData } from '../../core/prop-types';
import type { PropDelta } from '../renderer-api';
import { buildPropBatch } from '../../core/prop-mesh-builder';
import {
  PASTEL_BLOOM_RADIUS,
  PASTEL_BLOOM_STRENGTH,
  PASTEL_BLOOM_THRESHOLD,
  PASTEL_CLEAR_COLOR,
  PASTEL_ENV_BLUR,
  PASTEL_ENV_MAP_INTENSITY,
  PASTEL_HEMI_GROUND,
  PASTEL_HEMI_SKY,
  PASTEL_LIGHT_DISTANCE,
  PASTEL_METALNESS,
  PASTEL_ROUGHNESS,
  PASTEL_SHADOW_BIAS,
  PASTEL_SHADOW_EXTENT,
  PASTEL_SHADOW_FAR,
  PASTEL_SHADOW_MAP_SIZE,
  PASTEL_SHADOW_NEAR,
  PASTEL_SHADOW_NORMAL_BIAS,
  PASTEL_SUN,
  PASTEL_TONE_MAPPING_EXPOSURE,
} from '../pastel-lighting';

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

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export class ThreeAdapter implements RendererAdapter {
  readonly name = 'three';
  readonly apiVersion = RENDERER_API_VERSION;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private geometry!: THREE.BufferGeometry;
  private material!: THREE.MeshStandardMaterial;
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
  private fxaaPass!: ShaderPass;
  private texture!: THREE.CanvasTexture;
  private mesh!: THREE.Mesh;

  private raycaster = new THREE.Raycaster();
  private canvas!: HTMLCanvasElement;
  private bgFactor: [number, number, number] = [1, 1, 1];
  private readonly sky = {
    r: ((PASTEL_CLEAR_COLOR >> 16) & 255) / 255,
    g: ((PASTEL_CLEAR_COLOR >> 8) & 255) / 255,
    b: (PASTEL_CLEAR_COLOR & 255) / 255,
  };
  private pmrem!: THREE.PMREMGenerator;
  private envRoom!: RoomEnvironment;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private lightDir: [number, number, number] = [0.5, 1, 0.3];
  private lightDistance = PASTEL_LIGHT_DISTANCE;
  private shadowExtent = PASTEL_SHADOW_EXTENT;
  private shadowNear = PASTEL_SHADOW_NEAR;
  private shadowFar = PASTEL_SHADOW_FAR;
  private needsRender = false;
  private rafId = 0;
  private disposed = false;
  private lastSnapshot: WorldSnapshot | null = null;
  private propMaterial!: THREE.MeshStandardMaterial;
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
    this.renderer.setClearColor(PASTEL_CLEAR_COLOR, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = PASTEL_TONE_MAPPING_EXPOSURE;
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
      metalness: PASTEL_METALNESS,
      roughness: PASTEL_ROUGHNESS,
      envMapIntensity: PASTEL_ENV_MAP_INTENSITY,
    });

    this.geometry = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);

    this.hemi = new THREE.HemisphereLight(PASTEL_HEMI_SKY, PASTEL_HEMI_GROUND, DEFAULT_AMBIENT);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(PASTEL_SUN, DEFAULT_DIRECTIONAL);
    this.sun.target.position.set(5, 3, 5);
    this.placeSun();
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(PASTEL_SHADOW_MAP_SIZE, PASTEL_SHADOW_MAP_SIZE);
    this.sun.shadow.bias = PASTEL_SHADOW_BIAS;
    this.sun.shadow.normalBias = PASTEL_SHADOW_NORMAL_BIAS;
    this.updateShadowCamera();
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.propMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: PASTEL_METALNESS,
      roughness: PASTEL_ROUGHNESS,
      envMapIntensity: PASTEL_ENV_MAP_INTENSITY,
      shadowSide: THREE.FrontSide,
    });

    this.envRoom = new RoomEnvironment(this.renderer);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.applyEnvBlur(PASTEL_ENV_BLUR);

    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      PASTEL_BLOOM_STRENGTH,
      PASTEL_BLOOM_RADIUS,
      PASTEL_BLOOM_THRESHOLD,
    );
    this.composer.addPass(this.bloomPass);
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaaPass);
    this.composer.addPass(new OutputPass());
    this.updateFxaa(width, height, this.renderer.getPixelRatio());

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
    this.envTarget?.dispose();
    this.envRoom?.dispose();
    this.pmrem?.dispose();
    this.bloomPass?.dispose();
    this.fxaaPass?.dispose();
    this.composer?.dispose();
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
    const pixelRatio = Math.min(dpr, 1.5);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.updateFxaa(width, height, pixelRatio);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  private updateFxaa(width: number, height: number, pixelRatio: number): void {
    const resolution = this.fxaaPass.uniforms.resolution.value as THREE.Vector2;
    resolution.set(1 / (Math.max(width, 1) * pixelRatio), 1 / (Math.max(height, 1) * pixelRatio));
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

  private placeSun(): void {
    const [x, y, z] = this.lightDir;
    const len = Math.hypot(x, y, z) || 1;
    const t = this.sun.target.position;
    const d = this.lightDistance;
    this.sun.position.set(t.x + (x / len) * d, t.y + (y / len) * d, t.z + (z / len) * d);
  }

  private updateShadowCamera(): void {
    if (this.shadowFar <= this.shadowNear) this.shadowFar = this.shadowNear + 1;
    const sc = this.sun.shadow.camera;
    sc.left = -this.shadowExtent;
    sc.right = this.shadowExtent;
    sc.top = this.shadowExtent;
    sc.bottom = -this.shadowExtent;
    sc.near = this.shadowNear;
    sc.far = this.shadowFar;
    sc.updateProjectionMatrix();
  }

  private applyEnvBlur(blur: number): void {
    const next = this.pmrem.fromScene(this.envRoom, blur);
    this.scene.environment = next.texture;
    this.envTarget?.dispose();
    this.envTarget = next;
  }

  private applySurface(patch: { roughness?: number; metalness?: number; envMapIntensity?: number }): void {
    for (const material of [this.material, this.propMaterial]) {
      if (patch.roughness !== undefined) material.roughness = patch.roughness;
      if (patch.metalness !== undefined) material.metalness = patch.metalness;
      if (patch.envMapIntensity !== undefined) material.envMapIntensity = patch.envMapIntensity;
    }
  }

  setTheme(theme: Theme): void {
    if (theme.ambient !== undefined) this.hemi.intensity = theme.ambient;
    if (theme.directional !== undefined) this.sun.intensity = theme.directional;
    if (theme.temperature !== undefined) {
      const sky = kelvinSkyColor(theme.temperature);
      const ground = kelvinGroundColor(theme.temperature);
      const sun = kelvinSunColor(theme.temperature);
      this.bgFactor = kelvinBackgroundFactor(theme.temperature);
      this.hemi.color.setRGB(sky[0], sky[1], sky[2], THREE.SRGBColorSpace);
      this.hemi.groundColor.setRGB(ground[0], ground[1], ground[2], THREE.SRGBColorSpace);
      this.sun.color.setRGB(sun[0], sun[1], sun[2], THREE.SRGBColorSpace);
    }
    if (theme.skyColor !== undefined) this.hemi.color.set(theme.skyColor);
    if (theme.groundColor !== undefined) this.hemi.groundColor.set(theme.groundColor);
    if (theme.sunColor !== undefined) this.sun.color.set(theme.sunColor);
    if (theme.lightDistance !== undefined) this.lightDistance = theme.lightDistance;
    if (theme.lightDir !== undefined) this.lightDir = [theme.lightDir[0], theme.lightDir[1], theme.lightDir[2]];
    if (theme.lightDir !== undefined || theme.lightDistance !== undefined) this.placeSun();
    if (theme.exposure !== undefined) this.renderer.toneMappingExposure = theme.exposure;
    if (theme.roughness !== undefined || theme.metalness !== undefined || theme.envMapIntensity !== undefined) {
      this.applySurface(theme);
    }
    if (theme.bloomStrength !== undefined) this.bloomPass.strength = theme.bloomStrength;
    if (theme.bloomRadius !== undefined) this.bloomPass.radius = theme.bloomRadius;
    if (theme.bloomThreshold !== undefined) this.bloomPass.threshold = theme.bloomThreshold;
    if (theme.shadowBias !== undefined) this.sun.shadow.bias = theme.shadowBias;
    if (theme.shadowNormalBias !== undefined) this.sun.shadow.normalBias = theme.shadowNormalBias;
    if (theme.shadowMapSize !== undefined) {
      const size = Math.max(1, Math.round(theme.shadowMapSize));
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    if (theme.shadowExtent !== undefined) this.shadowExtent = theme.shadowExtent;
    if (theme.shadowNear !== undefined) this.shadowNear = theme.shadowNear;
    if (theme.shadowFar !== undefined) this.shadowFar = theme.shadowFar;
    if (theme.shadowExtent !== undefined || theme.shadowNear !== undefined || theme.shadowFar !== undefined) {
      this.updateShadowCamera();
    }
    if (theme.envBlur !== undefined) this.applyEnvBlur(theme.envBlur);
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
    } else if (theme.temperature !== undefined) {
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
    this.composer.render();
  };

  captureImage(): string {
    this.composer.render();
    return this.canvas.toDataURL('image/png');
  }
}
