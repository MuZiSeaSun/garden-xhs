import { BLOCK } from './block-types';
import type { World } from './world';
import type { PropInstance } from './prop-types';
import type { PropWorld } from './prop-world';
import { walkRay } from './voxel-raycast';

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

/** 统一拾取：DDA 每格先查道具占用列、再查方块；先到先得。 */
export function pick(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  world: World,
  propWorld: PropWorld,
  maxDistance: number,
): PickHit | null {
  let hit: PickHit | null = null;
  walkRay(origin, direction, maxDistance, (x, y, z, nx, ny, nz) => {
    const prop = propWorld.propAt(x, y, z);
    if (prop) {
      hit = { kind: 'prop', x, y, z, nx, ny, nz, prop };
      return true;
    }
    if (world.getBlock(x, y, z) !== BLOCK.AIR) {
      hit = { kind: 'block', x, y, z, nx, ny, nz };
      return true;
    }
    return false;
  });
  return hit;
}
