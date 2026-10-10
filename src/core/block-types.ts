export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  SOIL: 2,
  STONE: 3,
  WATER: 4,
  FLOWER_RED: 5,
  FLOWER_YELLOW: 6,
  BUSH: 7,
  WOOD: 8,
  LEAF: 9,
} as const;

export type BlockId = typeof BLOCK[keyof typeof BLOCK];

export interface BlockDef {
  readonly atlas: number;
  readonly opaque: boolean;
  readonly cross?: boolean;
}

const TERRAIN_IDS: ReadonlySet<number> = new Set([BLOCK.GRASS, BLOCK.SOIL, BLOCK.STONE, BLOCK.LEAF]);

/** 可放置、可承托物品的地形。旧档里的水、花、灌木、木头不算。 */
export function isTerrainBlock(type: number): boolean {
  return TERRAIN_IDS.has(type);
}

export const BLOCK_DEFS: Readonly<Record<BlockId, BlockDef | undefined>> = {
  [BLOCK.AIR]: undefined,
  [BLOCK.GRASS]: { atlas: 0, opaque: true },
  [BLOCK.SOIL]:  { atlas: 1, opaque: true },
  [BLOCK.STONE]: { atlas: 2, opaque: true },
  [BLOCK.WATER]: undefined,
  [BLOCK.FLOWER_RED]: undefined,
  [BLOCK.FLOWER_YELLOW]: undefined,
  [BLOCK.BUSH]: undefined,
  [BLOCK.WOOD]: undefined,
  [BLOCK.LEAF]: { atlas: 8, opaque: false },
};
