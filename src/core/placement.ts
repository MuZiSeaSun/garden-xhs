import { isTerrainBlock } from './block-types';
import type { PropInstance, PropModelData } from './prop-types';

type BlockAt = (x: number, y: number, z: number) => number;
type PropAt = (x: number, y: number, z: number) => PropInstance | undefined;

/** 占地 footprint×footprint 的每一格正下方都能承托时，才允许放物品。 */
export function itemFootprintSupported(
  x: number,
  y: number,
  z: number,
  footprint: number,
  getBlock: BlockAt,
  propAt: PropAt,
  models: readonly Pick<PropModelData, 'height' | 'supportsItems'>[],
): boolean {
  for (let dx = 0; dx < footprint; dx++) {
    for (let dz = 0; dz < footprint; dz++) {
      if (!cellSupportsItem(x + dx, y, z + dz, getBlock, propAt, models)) return false;
    }
  }
  return true;
}

function cellSupportsItem(
  x: number,
  y: number,
  z: number,
  getBlock: BlockAt,
  propAt: PropAt,
  models: readonly Pick<PropModelData, 'height' | 'supportsItems'>[],
): boolean {
  const by = y - 1;
  if (isTerrainBlock(getBlock(x, by, z))) return true;
  const prop = propAt(x, by, z);
  if (!prop) return false;
  const model = models[prop.modelId];
  if (!model?.supportsItems) return false;
  return by === prop.y + model.height - 1;
}

/** 只有命中地形时才给出放置目标格；命中物品返回 null。 */
export function terrainPlaceTarget(
  hit: { kind: 'prop' | 'block'; x: number; y: number; z: number; nx: number; ny: number; nz: number } | null,
): { x: number; y: number; z: number } | null {
  if (!hit || hit.kind !== 'block') return null;
  return { x: hit.x + hit.nx, y: hit.y + hit.ny, z: hit.z + hit.nz };
}
