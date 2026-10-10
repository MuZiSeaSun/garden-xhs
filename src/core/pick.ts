import { BLOCK } from './block-types';
import type { World } from './world';
import type { PropInstance, PropModelData } from './prop-types';
import type { PropWorld } from './prop-world';
import { walkRay } from './voxel-raycast';

const PROP_ALPHA_CUTOFF = 0.5;
const BASE_EPSILON = 0.001;
const CELL_INSET = 0.01;

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

/** 统一拾取：DDA 每格先查道具占用列、再查方块；先到先得。ignoreProps 时跳过物品，只命中地形。 */
export function pick(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  world: World,
  propWorld: PropWorld,
  maxDistance: number,
  ignoreProps = false,
): PickHit | null {
  let hit: PickHit | null = null;
  walkRay(origin, direction, maxDistance, (x, y, z, nx, ny, nz) => {
    if (!ignoreProps) {
      const prop = propWorld.propAt(x, y, z);
      if (prop) {
        hit = { kind: 'prop', x, y, z, nx, ny, nz, prop };
        return true;
      }
    }
    if (world.getBlock(x, y, z) !== BLOCK.AIR) {
      hit = { kind: 'block', x, y, z, nx, ny, nz };
      return true;
    }
    return false;
  });
  return hit;
}

function worldVert(m: PropModelData, p: PropInstance, vi: number): [number, number, number] {
  const x = m.positions[vi * 3], y = m.positions[vi * 3 + 1], z = m.positions[vi * 3 + 2];
  let rx = x, rz = z;
  if (p.rot === 1) { rx = z; rz = -x; }
  else if (p.rot === 2) { rx = -x; rz = -z; }
  else if (p.rot === 3) { rx = -z; rz = x; }
  return [rx + p.x + m.footprint / 2, y + p.y + BASE_EPSILON, rz + p.z + m.footprint / 2];
}

function dominantAxis(nx: number, ny: number, nz: number): [number, number, number] {
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  if (ay >= ax && ay >= az) return [0, ny >= 0 ? 1 : -1, 0];
  if (ax >= az) return [nx >= 0 ? 1 : -1, 0, 0];
  return [0, 0, nz >= 0 ? 1 : -1];
}

function rayTriangle(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  v0: readonly [number, number, number],
  v1: readonly [number, number, number],
  v2: readonly [number, number, number],
): { t: number; nx: number; ny: number; nz: number } | null {
  const e1x = v1[0] - v0[0], e1y = v1[1] - v0[1], e1z = v1[2] - v0[2];
  const e2x = v2[0] - v0[0], e2y = v2[1] - v0[1], e2z = v2[2] - v0[2];
  const px = dy * e2z - dz * e2y;
  const py = dz * e2x - dx * e2z;
  const pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-8) return null;
  const inv = 1 / det;
  const sx = ox - v0[0], sy = oy - v0[1], sz = oz - v0[2];
  const u = inv * (sx * px + sy * py + sz * pz);
  if (u < 0 || u > 1) return null;
  const qx = sy * e1z - sz * e1y;
  const qy = sz * e1x - sx * e1z;
  const qz = sx * e1y - sy * e1x;
  const v = inv * (dx * qx + dy * qy + dz * qz);
  if (v < 0 || u + v > 1) return null;
  const t = inv * (e2x * qx + e2y * qy + e2z * qz);
  if (t < 1e-6) return null;
  return {
    t,
    nx: e1y * e2z - e1z * e2y,
    ny: e1z * e2x - e1x * e2z,
    nz: e1x * e2y - e1y * e2x,
  };
}

/** 物品页签：三角形求交（跳过 alpha 低于 0.5 的面），再与忽略物品的地形射线比距离。 */
export function pickItem(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  world: World,
  propWorld: PropWorld,
  models: readonly PropModelData[],
  maxDistance: number,
): PickHit | null {
  const ox = origin[0], oy = origin[1], oz = origin[2];
  const dx = direction[0], dy = direction[1], dz = direction[2];
  let bestT = maxDistance;
  let best: PickHit | null = null;

  for (const inst of propWorld.list()) {
    const m = models[inst.modelId];
    if (!m) continue;
    for (let i = 0; i + 2 < m.indices.length; i += 3) {
      const ia = m.indices[i], ib = m.indices[i + 1], ic = m.indices[i + 2];
      const faceAlpha = m.alpha.length === 0
        ? 1
        : ((m.alpha[ia] ?? 1) + (m.alpha[ib] ?? 1) + (m.alpha[ic] ?? 1)) / 3;
      if (faceAlpha < PROP_ALPHA_CUTOFF) continue;
      const hit = rayTriangle(
        ox, oy, oz, dx, dy, dz,
        worldVert(m, inst, ia), worldVert(m, inst, ib), worldVert(m, inst, ic),
      );
      if (!hit || hit.t >= bestT) continue;
      let nx = hit.nx, ny = hit.ny, nz = hit.nz;
      if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
      const n = dominantAxis(nx, ny, nz);
      bestT = hit.t;
      best = {
        kind: 'prop',
        x: Math.floor(ox + hit.t * dx - n[0] * CELL_INSET),
        y: Math.floor(oy + hit.t * dy - n[1] * CELL_INSET),
        z: Math.floor(oz + hit.t * dz - n[2] * CELL_INSET),
        nx: n[0], ny: n[1], nz: n[2],
        prop: inst,
      };
    }
  }

  let block: PickHit | null = null;
  let blockT = Infinity;
  walkRay(origin, direction, maxDistance, (x, y, z, nx, ny, nz, t) => {
    if (world.getBlock(x, y, z) !== BLOCK.AIR) {
      block = { kind: 'block', x, y, z, nx, ny, nz };
      blockT = t;
      return true;
    }
    return false;
  });
  if (best && bestT <= blockT) return best;
  return block;
}
