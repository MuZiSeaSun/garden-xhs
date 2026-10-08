import { BLOCK } from './block-types';
import { WORLD_SIZE, type World } from './world';

/** Lay a grass floor at y=0 so a fresh or cleared garden is visible and editable. */
export function seedGround(world: World): void {
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      world.setBlock(x, 0, z, BLOCK.GRASS);
    }
  }
}
