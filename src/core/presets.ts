import { BLOCK } from './block-types';

export interface PresetBlock {
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly type: number;
}

export interface Preset {
  readonly name: string;
  readonly blocks: ReadonlyArray<PresetBlock>;
}

export const PRESETS: Readonly<Record<string, Preset>> = {
  tree: {
    name: '小树',
    blocks: [
      { dx: 0, dy: 0, dz: 0, type: BLOCK.WOOD },
      { dx: 0, dy: 1, dz: 0, type: BLOCK.WOOD },
      { dx: 0, dy: 2, dz: 0, type: BLOCK.WOOD },
      { dx: -1, dy: 3, dz: 0, type: BLOCK.LEAF },
      { dx: 0, dy: 3, dz: 0, type: BLOCK.LEAF },
      { dx: 1, dy: 3, dz: 0, type: BLOCK.LEAF },
      { dx: 0, dy: 3, dz: -1, type: BLOCK.LEAF },
      { dx: 0, dy: 3, dz: 1, type: BLOCK.LEAF },
      { dx: -1, dy: 4, dz: 0, type: BLOCK.LEAF },
      { dx: 0, dy: 4, dz: 0, type: BLOCK.LEAF },
      { dx: 1, dy: 4, dz: 0, type: BLOCK.LEAF },
      { dx: 0, dy: 4, dz: -1, type: BLOCK.LEAF },
      { dx: 0, dy: 4, dz: 1, type: BLOCK.LEAF },
    ],
  },
  bush: {
    name: '灌木',
    blocks: [{ dx: 0, dy: 0, dz: 0, type: BLOCK.BUSH }],
  },
  flowerBed: {
    name: '花丛',
    blocks: [
      { dx: 0, dy: 0, dz: 0, type: BLOCK.FLOWER_RED },
      { dx: 1, dy: 0, dz: 0, type: BLOCK.FLOWER_YELLOW },
      { dx: 0, dy: 0, dz: 1, type: BLOCK.FLOWER_YELLOW },
      { dx: 1, dy: 0, dz: 1, type: BLOCK.FLOWER_RED },
    ],
  },
};
