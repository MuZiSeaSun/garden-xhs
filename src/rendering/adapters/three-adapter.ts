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

const VERT = /* glsl */ `
  attribute float aLight;
  varying vec2 vUV;
  varying vec3 vNormal;
  varying float vLight;
  void main() {
    vUV = uv;
    vNormal = normal;
    vLight = aLight;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  uniform sampler2D uAtlas;
  uniform vec3 uLightDir;
  uniform float uAmbient;
  varying vec2 vUV;
  varying vec3 vNormal;
  varying float vLight;
  void main() {
    vec4 texColor = texture2D(uAtlas, vUV);
    if (texColor.a < 0.1) discard;
    float diff = max(dot(normalize(vNormal), uLightDir), 0.0);
    vec3 color = texColor.rgb * vLight * (uAmbient + (1.0 - uAmbient) * diff);
    gl_FragColor = vec4(color, texColor.a);
  }
`;

export class ThreeAdapter implements RendererAdapter {
  readonly name = 'three';
  readonly apiVersion = RENDERER_API_VERSION;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private geometry!: THREE.BufferGeometry;
  private material!: THREE.ShaderMaterial;
  private texture!: THREE.CanvasTexture;
  private mesh!: THREE.Mesh;

  private raycaster = new THREE.Raycaster();
  private canvas!: HTMLCanvasElement;
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
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0xb8dbf7, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    this.camera.up.set(0, 1, 0);

    this.texture = new THREE.CanvasTexture(atlasCanvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: this.texture },
        uLightDir: { value: new THREE.Vector3(0.5, 1, 0.3).normalize() },
        uAmbient: { value: 0.6 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
    });

    this.geometry = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);

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
    this.renderer.setPixelRatio(Math.min(dpr, 2));
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
    g.setAttribute('aLight',   new THREE.BufferAttribute(mesh.lights, 1));
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
    if (theme.background !== undefined) {
      this.renderer.setClearColor(theme.background, 1);
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
