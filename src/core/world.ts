import { BLOCK, type BlockId } from './block-types';

export const WORLD_SIZE = 10;

export interface World {
  readonly size: number;
  readonly blocks: Uint8Array;
  getBlock(x: number, y: number, z: number): BlockId;
  setBlock(x: number, y: number, z: number, type: BlockId): boolean;
  clear(): void;
  snapshot(): { size: number; blocks: Uint8Array };
}

export function createWorld(): World {
  const size = WORLD_SIZE;
  const blocks = new Uint8Array(size * size * size);

  const toIndex = (x: number, y: number, z: number): number =>
    x + y * size + z * size * size;

  const inBounds = (x: number, y: number, z: number): boolean =>
    x >= 0 && x < size && y >= 0 && y < size && z >= 0 && z < size;

  return {
    size,
    blocks,
    getBlock(x, y, z) {
      if (!inBounds(x, y, z)) return BLOCK.AIR;
      return blocks[toIndex(x, y, z)] as BlockId;
    },
    setBlock(x, y, z, type) {
      if (!inBounds(x, y, z)) return false;
      blocks[toIndex(x, y, z)] = type;
      return true;
    },
    clear() {
      blocks.fill(0);
    },
    snapshot() {
      return { size, blocks: blocks.slice() };
    },
  };
}
