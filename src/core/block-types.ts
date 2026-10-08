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

export const BLOCK_DEFS: Readonly<Record<BlockId, BlockDef | undefined>> = {
  [BLOCK.AIR]: undefined,
  [BLOCK.GRASS]:        { atlas: 0, opaque: true },
  [BLOCK.SOIL]:         { atlas: 1, opaque: true },
  [BLOCK.STONE]:        { atlas: 2, opaque: true },
  [BLOCK.WATER]:        { atlas: 3, opaque: false },
  [BLOCK.FLOWER_RED]:   { atlas: 4, opaque: true, cross: true },
  [BLOCK.FLOWER_YELLOW]:{ atlas: 5, opaque: true, cross: true },
  [BLOCK.BUSH]:         { atlas: 6, opaque: true },
  [BLOCK.WOOD]:         { atlas: 7, opaque: true },
  [BLOCK.LEAF]:         { atlas: 8, opaque: false },
};
