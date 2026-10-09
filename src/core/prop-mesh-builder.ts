import type { PropInstance, PropModelData } from './prop-types';

export interface PropBatchMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colors: Float32Array;
  readonly indices: Uint32Array;
}

/** 道具底面抬高量：避免与地面/下层道具顶面完全共面（WebGL 兜底不剔除背面，共面会 z-fighting） */
const BASE_EPSILON = 0.001;

const fixZero = (v: number): number => (v === 0 ? 0 : v);

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
      positions[di] = fixZero(rx + ox);
      positions[di + 1] = y + oy;
      positions[di + 2] = fixZero(rz + oz);
      const nx = m.normals[si], ny = m.normals[si + 1], nz = m.normals[si + 2];
      let rnx = nx, rnz = nz;
      if (p.rot === 1) { rnx = nz; rnz = -nx; }
      else if (p.rot === 2) { rnx = -nx; rnz = -nz; }
      else if (p.rot === 3) { rnx = -nz; rnz = nx; }
      normals[di] = fixZero(rnx); normals[di + 1] = fixZero(ny); normals[di + 2] = fixZero(rnz);
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
