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
  type PropDelta,
} from '../renderer-api';
import { buildVoxelMesh, type MeshData } from '../../core/mesh-builder';
import { kelvinToRgb, kelvinBackgroundFactor } from '../color-temperature';
import type { PropInstance, PropModelData } from '../../core/prop-types';
import { buildPropBatch } from '../../core/prop-mesh-builder';

type V3 = number[];

const VERT = /* glsl */ `
  attribute vec3 position;
  attribute vec3 normal;
  attribute vec2 uv;
  attribute float aLight;
  varying vec2 vUV;
  varying vec3 vNormal;
  varying float vLight;
  uniform mat4 uMatrix;
  void main() {
    vUV = uv;
    vNormal = normal;
    vLight = aLight;
    gl_Position = uMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  #define RECIPROCAL_PI 0.31830988618
  uniform sampler2D uAtlas;
  uniform vec3 uLightDir;
  uniform float uAmbient;
  uniform float uExposure;
  uniform vec3 uLightTint;
  varying vec2 vUV;
  varying vec3 vNormal;
  varying float vLight;
  vec3 toSRGB(vec3 c) {
    c = max(c, vec3(0.0));
    return mix(c * 12.92, 1.055 * pow(c, vec3(0.4166667)) - 0.055, step(vec3(0.0031308), c));
  }
  void main() {
    vec4 texColor = texture2D(uAtlas, vUV);
    if (texColor.a < 0.1) discard;
    float diff = max(dot(normalize(vNormal), uLightDir), 0.0);
    // 与 Three 的 Lambert 管线保持一致：光照乘 1/π（BRDF 归一化），最后做 linear→sRGB 输出编码
    vec3 lit = texColor.rgb * vLight * (uAmbient + (1.0 - uAmbient) * diff) * uExposure * RECIPROCAL_PI * uLightTint;
    gl_FragColor = vec4(toSRGB(lit), texColor.a);
  }
`;

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

function sub(a: V3, b: V3): V3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: V3, b: V3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function normalize(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function mat4Perspective(out: Float32Array, fovy: number, aspect: number, near: number, far: number): void {
  const f = 1 / Math.tan(fovy / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
}

function mat4LookAt(out: Float32Array, eye: V3, center: V3, up: V3): void {
  const z = normalize(sub(eye, center));
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  out[0] = x[0]; out[1] = y[0]; out[2] = z[0]; out[3] = 0;
  out[4] = x[1]; out[5] = y[1]; out[6] = z[1]; out[7] = 0;
  out[8] = x[2]; out[9] = y[2]; out[10] = z[2]; out[11] = 0;
  out[12] = -dot(x, eye); out[13] = -dot(y, eye); out[14] = -dot(z, eye); out[15] = 1;
}

function mat4Multiply(out: Float32Array, a: Float32Array, b: Float32Array): void {
  const r = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let row = 0; row < 4; row++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[c * 4 + k];
      r[c * 4 + row] = s;
    }
  }
  out.set(r);
}

export class WebGLAdapter implements RendererAdapter {
  readonly name = 'webgl';
  readonly apiVersion = RENDERER_API_VERSION;

  private gl!: WebGLRenderingContext;
  private canvas!: HTMLCanvasElement;
  private program!: WebGLProgram;

  private posBuf!: WebGLBuffer;
  private nrmBuf!: WebGLBuffer;
  private uvBuf!: WebGLBuffer;
  private lightBuf!: WebGLBuffer;
  private idxBuf!: WebGLBuffer;
  private tex!: WebGLTexture;

  private aPosition = 0;
  private aNormal = 0;
  private aUV = 0;
  private aLight = 0;
  private uMatrix!: WebGLUniformLocation | null;
  private uAtlas!: WebGLUniformLocation | null;
  private uLightDir!: WebGLUniformLocation | null;
  private uAmbient!: WebGLUniformLocation | null;
  private uExposure!: WebGLUniformLocation | null;
  private uLightTint!: WebGLUniformLocation | null;

  private matrix = new Float32Array(16);
  private projMat = new Float32Array(16);
  private viewMat = new Float32Array(16);

  private indexCount = 0;
  private aspect = 1;
  private dpr = 1;
  private tint: [number, number, number] = [1, 1, 1];
  private bgFactor: [number, number, number] = [1, 1, 1];
  private readonly sky = { r: 184 / 255, g: 219 / 255, b: 247 / 255 };
  private cameraState: CameraState | null = null;
  private lastSnapshot: WorldSnapshot | null = null;

  private needsRender = false;
  private rafId = 0;
  private disposed = false;

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

  isSupported(caps: Capabilities): boolean {
    return caps.webgl;
  }

  async init(opts: RendererInitOptions): Promise<void> {
    const { canvas, atlasCanvas, devicePixelRatio } = opts;
    this.canvas = canvas;
    this.dpr = Math.min(devicePixelRatio || 1, 1.5);

    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('webgl context unavailable');
    this.gl = gl as WebGLRenderingContext;

    this.program = this.createProgram(VERT, FRAG);
    this.gl.useProgram(this.program);

    this.aPosition = this.gl.getAttribLocation(this.program, 'position');
    this.aNormal = this.gl.getAttribLocation(this.program, 'normal');
    this.aUV = this.gl.getAttribLocation(this.program, 'uv');
    this.aLight = this.gl.getAttribLocation(this.program, 'aLight');
    this.uMatrix = this.gl.getUniformLocation(this.program, 'uMatrix');
    this.uAtlas = this.gl.getUniformLocation(this.program, 'uAtlas');
    this.uLightDir = this.gl.getUniformLocation(this.program, 'uLightDir');
    this.uAmbient = this.gl.getUniformLocation(this.program, 'uAmbient');
    this.uExposure = this.gl.getUniformLocation(this.program, 'uExposure');
    this.uLightTint = this.gl.getUniformLocation(this.program, 'uLightTint');

    this.posBuf = this.gl.createBuffer()!;
    this.nrmBuf = this.gl.createBuffer()!;
    this.uvBuf = this.gl.createBuffer()!;
    this.lightBuf = this.gl.createBuffer()!;
    this.idxBuf = this.gl.createBuffer()!;

    this.gl.uniform1i(this.uAtlas, 0);
    const ldir = normalize([0.5, 1, 0.3]);
    this.gl.uniform3f(this.uLightDir, ldir[0], ldir[1], ldir[2]);
    this.gl.uniform1f(this.uAmbient, 0.6);
    this.gl.uniform1f(this.uExposure, 1);
    this.gl.uniform3f(this.uLightTint, 1, 1, 1);

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

    this.tex = this.gl.createTexture()!;
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.tex);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, atlasCanvas);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.disable(this.gl.CULL_FACE);
    this.gl.clearColor(184 / 255, 219 / 255, 247 / 255, 1);

    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    const gl = this.gl;
    if (!gl) return;
    gl.deleteBuffer(this.posBuf);
    gl.deleteBuffer(this.nrmBuf);
    gl.deleteBuffer(this.uvBuf);
    gl.deleteBuffer(this.lightBuf);
    gl.deleteBuffer(this.idxBuf);
    gl.deleteTexture(this.tex);
    for (const b of this.propBatches.splice(0, this.propBatches.length)) this.deleteBatch(b);
    gl.deleteProgram(this.propProgram);
    gl.deleteProgram(this.program);
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
    this.dpr = Math.min(dpr || 1, 1.5);
    this.canvas.width = Math.max(1, Math.floor(width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(height * this.dpr));
    this.aspect = width / height;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.requestRender();
  }

  setCamera(state: CameraState): void {
    this.cameraState = state;
    mat4Perspective(this.projMat, state.fov, this.aspect, state.near, state.far);
    mat4LookAt(
      this.viewMat,
      [state.position[0], state.position[1], state.position[2]],
      [state.target[0], state.target[1], state.target[2]],
      [state.up[0], state.up[1], state.up[2]],
    );
    mat4Multiply(this.matrix, this.projMat, this.viewMat);
    this.requestRender();
  }

  syncWorld(snapshot: WorldSnapshot): void {
    this.lastSnapshot = snapshot;
    this.uploadMesh(buildVoxelMesh(snapshot));
    this.requestRender();
  }

  applyBlockDelta(delta: BlockDelta): void {
    if (!this.lastSnapshot) return;
    const blocks = this.lastSnapshot.blocks;
    const size = this.lastSnapshot.size;
    const idx = (x: number, y: number, z: number): number => x + y * size + z * size * size;
    for (const b of delta.removed) blocks[idx(b.x, b.y, b.z)] = 0;
    for (const b of delta.added) blocks[idx(b.x, b.y, b.z)] = b.type;
    this.uploadMesh(buildVoxelMesh(this.lastSnapshot));
    this.requestRender();
  }

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

  private uploadMesh(mesh: MeshData): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nrmBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lightBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.lights, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    this.indexCount = mesh.indices.length;
  }

  screenPointToRay(x: number, y: number): Ray {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((x - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((y - rect.top) / rect.height) * 2 + 1;
    const cs = this.cameraState;
    if (!cs) return { origin: [0, 0, 0], direction: [0, 0, -1] };

    const forward = normalize([
      cs.target[0] - cs.position[0],
      cs.target[1] - cs.position[1],
      cs.target[2] - cs.position[2],
    ]);
    const right = normalize(cross(forward, [cs.up[0], cs.up[1], cs.up[2]]));
    const upv = cross(right, forward);
    const tanHalf = Math.tan(cs.fov / 2);
    const aspect = rect.width / rect.height;
    const dir = normalize([
      forward[0] + ndcX * tanHalf * aspect * right[0] + ndcY * tanHalf * upv[0],
      forward[1] + ndcX * tanHalf * aspect * right[1] + ndcY * tanHalf * upv[1],
      forward[2] + ndcX * tanHalf * aspect * right[2] + ndcY * tanHalf * upv[2],
    ]);
    return { origin: [cs.position[0], cs.position[1], cs.position[2]], direction: [dir[0], dir[1], dir[2]] };
  }

  setTheme(theme: Theme): void {
    this.gl.useProgram(this.program);
    if (theme.exposure !== undefined) {
      this.gl.uniform1f(this.uExposure, theme.exposure);
    }
    if (theme.temperature !== undefined) {
      this.tint = kelvinToRgb(theme.temperature);
      this.bgFactor = kelvinBackgroundFactor(theme.temperature);
      this.gl.uniform3f(this.uLightTint, this.tint[0], this.tint[1], this.tint[2]);
    }
    if (theme.background !== undefined) {
      const r = ((theme.background >> 16) & 0xff) / 255;
      const g = ((theme.background >> 8) & 0xff) / 255;
      const b = (theme.background & 0xff) / 255;
      this.gl.clearColor(r, g, b, 1);
    } else {
      const f = this.bgFactor;
      this.gl.clearColor(this.sky.r * f[0], this.sky.g * f[1], this.sky.b * f[2], 1);
    }
    if (this.propProgram) {
      this.gl.useProgram(this.propProgram);
      if (theme.exposure !== undefined) this.gl.uniform1f(this.pExposure, theme.exposure);
      if (theme.temperature !== undefined) {
        this.gl.uniform3f(this.pLightTint, this.tint[0], this.tint[1], this.tint[2]);
      }
    }
    this.requestRender();
  }

  requestRender(): void {
    if (this.disposed || this.needsRender) return;
    this.needsRender = true;
    this.rafId = requestAnimationFrame(this.render);
  }

  private render = (): void => {
    this.needsRender = false;
    this.rafId = 0;
    if (this.disposed) return;
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (this.indexCount > 0 && this.cameraState) {
      gl.useProgram(this.program);
      gl.uniformMatrix4fv(this.uMatrix, false, this.matrix);
      this.bindAttributes();
      gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
    }
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
  };

  private bindAttributes(): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.enableVertexAttribArray(this.aPosition);
    gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nrmBuf);
    gl.enableVertexAttribArray(this.aNormal);
    gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf);
    gl.enableVertexAttribArray(this.aUV);
    gl.vertexAttribPointer(this.aUV, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lightBuf);
    gl.enableVertexAttribArray(this.aLight);
    gl.vertexAttribPointer(this.aLight, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
  }

  captureImage(): string {
    this.render();
    return this.canvas.toDataURL('image/png');
  }

  private createProgram(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string): WebGLShader => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error(`shader compile failed: ${info}`);
      }
      return sh;
    };
    const v = compile(gl.VERTEX_SHADER, vs);
    const f = compile(gl.FRAGMENT_SHADER, fs);
    const p = gl.createProgram()!;
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error(`program link failed: ${info}`);
    }
    return p;
  }
}
