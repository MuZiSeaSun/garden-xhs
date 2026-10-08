import { BLOCK, BLOCK_DEFS, type BlockId } from './block-types';
import type { WorldSnapshot } from '../rendering/renderer-api';

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  lights: Float32Array;
  indices: Uint16Array;
}

interface FaceDef {
  readonly dir: readonly [number, number, number];
  readonly verts: ReadonlyArray<readonly [number, number, number]>;
  readonly n: readonly [number, number, number];
  readonly light: number;
}

const FACES: readonly FaceDef[] = [
  { dir: [ 1, 0, 0], verts: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]], n: [ 1, 0, 0], light: 0.8 },
  { dir: [-1, 0, 0], verts: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]], n: [-1, 0, 0], light: 0.8 },
  { dir: [ 0, 1, 0], verts: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], n: [ 0, 1, 0], light: 1.0 },
  { dir: [ 0,-1, 0], verts: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], n: [ 0,-1, 0], light: 0.5 },
  { dir: [ 0, 0, 1], verts: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], n: [ 0, 0, 1], light: 0.9 },
  { dir: [ 0, 0,-1], verts: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]], n: [ 0, 0,-1], light: 0.7 },
];

const ATLAS_COLS = 16;

function atlasUV(tile: number, corner: number): readonly [number, number] {
  const col = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  const u0 = col / ATLAS_COLS;
  const v0 = row / ATLAS_COLS;
  const du = 1 / ATLAS_COLS;
  const dv = 1 / ATLAS_COLS;
  switch (corner) {
    case 0: return [u0,        v0 + dv];
    case 1: return [u0 + du,   v0 + dv];
    case 2: return [u0 + du,   v0];
    default: return [u0,       v0];
  }
}

export function buildVoxelMesh(snapshot: WorldSnapshot): MeshData {
  const { size, blocks } = snapshot;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const lights: number[] = [];
  const indices: number[] = [];

  const toIndex = (x: number, y: number, z: number): number =>
    x + y * size + z * size * size;

  const getBlock = (x: number, y: number, z: number): BlockId => {
    if (x < 0 || x >= size || y < 0 || y >= size || z < 0 || z >= size) return BLOCK.AIR;
    return blocks[toIndex(x, y, z)] as BlockId;
  };

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      for (let z = 0; z < size; z++) {
        const type = getBlock(x, y, z);
        if (type === BLOCK.AIR) continue;
        const def = BLOCK_DEFS[type];
        if (!def) continue;

        if (def.cross) {
          const h = 0.9;
          const tile = def.atlas;
          const baseIndex = positions.length / 3;
          positions.push(
            x + 0.1, y + 0,     z + 0.1,
            x + 0.9, y + 0,     z + 0.9,
            x + 0.9, y + h,     z + 0.9,
            x + 0.1, y + h,     z + 0.1,
          );
          normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
          uvs.push(...atlasUV(tile, 0), ...atlasUV(tile, 1), ...atlasUV(tile, 2), ...atlasUV(tile, 3));
          lights.push(1, 1, 1, 1);
          indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3);

          const base2 = positions.length / 3;
          positions.push(
            x + 0.9, y + 0,     z + 0.1,
            x + 0.1, y + 0,     z + 0.9,
            x + 0.1, y + h,     z + 0.9,
            x + 0.9, y + h,     z + 0.1,
          );
          normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
          uvs.push(...atlasUV(tile, 0), ...atlasUV(tile, 1), ...atlasUV(tile, 2), ...atlasUV(tile, 3));
          lights.push(1, 1, 1, 1);
          indices.push(base2, base2 + 1, base2 + 2, base2, base2 + 2, base2 + 3);
          continue;
        }

        for (const face of FACES) {
          const nx = x + face.dir[0];
          const ny = y + face.dir[1];
          const nz = z + face.dir[2];
          const neighbor = getBlock(nx, ny, nz);
          const neighborDef = BLOCK_DEFS[neighbor];
          if (neighborDef && neighborDef.opaque) continue;

          const baseIndex = positions.length / 3;
          for (let i = 0; i < 4; i++) {
            const v = face.verts[i];
            positions.push(x + v[0], y + v[1], z + v[2]);
            normals.push(face.n[0], face.n[1], face.n[2]);
            const uv = atlasUV(def.atlas, i);
            uvs.push(uv[0], uv[1]);
            lights.push(face.light);
          }
          indices.push(
            baseIndex, baseIndex + 1, baseIndex + 2,
            baseIndex, baseIndex + 2, baseIndex + 3,
          );
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    lights: new Float32Array(lights),
    indices: new Uint16Array(indices),
  };
}
