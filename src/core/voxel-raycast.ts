import { BLOCK } from './block-types';
import type { World } from './world';

export interface VoxelHit {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly distance: number;
}

export function voxelRaycast(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  world: World,
  maxDistance: number,
): VoxelHit | null {
  let x = Math.floor(origin[0]);
  let y = Math.floor(origin[1]);
  let z = Math.floor(origin[2]);

  const dx = direction[0];
  const dy = direction[1];
  const dz = direction[2];

  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;

  const tDeltaX = Math.abs(1 / dx);
  const tDeltaY = Math.abs(1 / dy);
  const tDeltaZ = Math.abs(1 / dz);

  let tMaxX = (dx > 0 ? x + 1 - origin[0] : origin[0] - x) * tDeltaX;
  let tMaxY = (dy > 0 ? y + 1 - origin[1] : origin[1] - y) * tDeltaY;
  let tMaxZ = (dz > 0 ? z + 1 - origin[2] : origin[2] - z) * tDeltaZ;

  let nx = 0, ny = 0, nz = 0;
  let t = 0;

  while (t < maxDistance) {
    if (world.getBlock(x, y, z) !== BLOCK.AIR) {
      return { x, y, z, nx, ny, nz, distance: t };
    }

    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX;
      nx = -stepX; ny = 0; nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY;
      nx = 0; ny = -stepY; nz = 0;
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ;
      nx = 0; ny = 0; nz = -stepZ;
    }
  }
  return null;
}
