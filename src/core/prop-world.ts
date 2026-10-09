// src/core/prop-world.ts
import { WORLD_SIZE } from './world';
import type { PropInstance, PropModelData } from './prop-types';

export interface PropWorld {
  /** 基础格 → 实例 */
  readonly props: ReadonlyMap<number, PropInstance>;
  /** 放置：占用列越界或与现有道具占用重叠即失败 */
  add(x: number, y: number, z: number, modelId: number): PropInstance | null;
  /** 从占用列内任意格移除整个道具 */
  removeAt(x: number, y: number, z: number): PropInstance | null;
  /** 占用查询：该格被某道具占用列覆盖则返回其实例 */
  propAt(x: number, y: number, z: number): PropInstance | undefined;
  clear(): void;
  list(): PropInstance[];
}

const cellKey = (x: number, y: number, z: number): number =>
  x + y * WORLD_SIZE + z * WORLD_SIZE * WORLD_SIZE;

const inBounds = (x: number, y: number, z: number): boolean =>
  x >= 0 && x < WORLD_SIZE && y >= 0 && y < WORLD_SIZE && z >= 0 && z < WORLD_SIZE;

export function createPropWorld(models: readonly PropModelData[]): PropWorld {
  const props = new Map<number, PropInstance>(); // 基础格 key → 实例
  const owner = new Map<number, number>();       // 占用格 key → 基础格 key
  let nextId = 1;

  const occupancyKeys = (x: number, y: number, z: number, modelId: number): number[] | null => {
    const m = models[modelId];
    if (!m) return null;
    const cells: number[] = [];
    for (let dx = 0; dx < m.footprint; dx++) {
      for (let dy = 0; dy < m.height; dy++) {
        for (let dz = 0; dz < m.footprint; dz++) {
          const cx = x + dx, cy = y + dy, cz = z + dz;
          if (!inBounds(cx, cy, cz)) return null;
          cells.push(cellKey(cx, cy, cz));
        }
      }
    }
    return cells;
  };

  const columnCells = (x: number, y: number, z: number, modelId: number): number[] | null => {
    const cells = occupancyKeys(x, y, z, modelId);
    if (!cells) return null;
    for (const k of cells) {
      if (owner.has(k)) return null;
    }
    return cells;
  };

  return {
    props,
    add(x, y, z, modelId) {
      if (!inBounds(x, y, z)) return null;
      const cells = columnCells(x, y, z, modelId);
      if (!cells) return null;
      const base = cellKey(x, y, z);
      if (props.has(base)) return null;
      const inst: PropInstance = { id: nextId++, modelId, x, y, z, rot: 0 };
      props.set(base, inst);
      for (const k of cells) owner.set(k, base);
      return inst;
    },
    removeAt(x, y, z) {
      if (!inBounds(x, y, z)) return null;
      const base = owner.get(cellKey(x, y, z));
      if (base === undefined) return null;
      const inst = props.get(base);
      if (!inst) return null;
      for (const k of occupancyKeys(inst.x, inst.y, inst.z, inst.modelId) ?? []) owner.delete(k);
      props.delete(base);
      return inst;
    },
    propAt(x, y, z) {
      if (!inBounds(x, y, z)) return undefined;
      const base = owner.get(cellKey(x, y, z));
      return base === undefined ? undefined : props.get(base);
    },
    clear() {
      props.clear();
      owner.clear();
    },
    list() {
      return Array.from(props.values());
    },
  };
}
