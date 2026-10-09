import * as THREE from 'three';
import {
  RENDERER_API_VERSION,
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

export class ThreeAdapter implements RendererAdapter {
  readonly name = 'three';
  readonly apiVersion = RENDERER_API_VERSION;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private geometry!: THREE.BufferGeometry;
  private material!: THREE.MeshLambertMaterial;
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

    this.material = new THREE.MeshLambertMaterial({
      map: this.texture,
      alphaTest: 0.5,
      vertexColors: true,
      side: THREE.DoubleSide,
    });

    this.geometry = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);

    // 环境光 + 方向光（投射阴影）。0.6/0.4 与原先 shader 的 uAmbient=0.6 观感接近。
    this.ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffffff, 0.4);
    this.sun.target.position.set(5, 3, 5);
    this.sun.position.set(0.5, 1, 0.3).normalize().multiplyScalar(60).add(this.sun.target.position);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    const sc = this.sun.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 160;
    sc.updateProjectionMatrix();
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

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
    if (theme.exposure !== undefined) {
      this.ambient.intensity = 0.6 * theme.exposure;
      this.sun.intensity = 0.4 * theme.exposure;
    }
    if (theme.temperature !== undefined) {
      this.tint = kelvinToRgb(theme.temperature);
      this.bgFactor = kelvinBackgroundFactor(theme.temperature);
      this.ambient.color.setRGB(this.tint[0], this.tint[1], this.tint[2]);
      this.sun.color.setRGB(this.tint[0], this.tint[1], this.tint[2]);
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
