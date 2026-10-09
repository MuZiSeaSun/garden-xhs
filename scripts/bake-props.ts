// 构建期烘焙脚本：纯 Node、零新增依赖；不进入产物。
// 运行：npm run bake:props（Node ≥22.6 原生剥离 .ts 类型）
import { inflateSync } from 'node:zlib';
import type { PropModelData } from '../src/core/prop-types';

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
