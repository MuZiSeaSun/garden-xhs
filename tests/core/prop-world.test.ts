// tests/core/prop-world.test.ts
import { describe, it, expect } from 'vitest';
import type { PropModelData } from '../../src/core/prop-types';
import { createPropWorld } from '../../src/core/prop-world';

const emptyModel = (footprint: number, height: number): PropModelData =>
  ({ name: '', icon: '', positions: new Float32Array(0), normals: new Float32Array(0), colors: new Float32Array(0), alpha: new Float32Array(0), indices: new Uint16Array(0), footprint, height });
const MODELS: PropModelData[] = [emptyModel(1, 3), emptyModel(2, 1)]; // tree / plat

describe('PropWorld', () => {
  it('adds and finds props across the whole occupancy column', () => {
    const pw = createPropWorld(MODELS);
    const inst = pw.add(5, 5, 5, 0);
    expect(inst).not.toBeNull();
    expect(pw.propAt(5, 5, 5)).toBe(inst);   // 基础格
    expect(pw.propAt(5, 7, 5)).toBe(inst);   // 树冠格（height 3）
    expect(pw.propAt(6, 5, 5)).toBeUndefined();
    expect(pw.list()).toEqual([inst]);
  });

  it('rejects overlapping occupancy columns and out-of-bounds placements', () => {
    const pw = createPropWorld(MODELS);
    expect(pw.add(5, 5, 5, 0)).not.toBeNull();
    expect(pw.add(5, 7, 5, 0)).toBeNull();   // 列重叠（第二棵树穿过第一棵树冠）
    expect(pw.add(6, 5, 5, 0)).not.toBeNull();
    expect(pw.add(0, 8, 0, 0)).toBeNull();    // height 3 超上边界（8+3>10）
    expect(pw.add(10, 0, 0, 0)).toBeNull();   // 世界外
    expect(pw.add(0, 0, 0, 99)).toBeNull();   // 非法 modelId
  });

  it('platform footprint 2x2 occupies the right cells', () => {
    const pw = createPropWorld(MODELS);
    expect(pw.add(0, 0, 0, 1)).not.toBeNull();
    expect(pw.propAt(1, 0, 1)).not.toBeNull();   // 平台角
    expect(pw.add(1, 0, 1, 0)).toBeNull();       // 树落在平台角上 → 重叠
    expect(pw.add(2, 0, 0, 0)).not.toBeNull();   // 紧邻不重叠
  });

  it('removeAt from any column cell removes the whole prop', () => {
    const pw = createPropWorld(MODELS);
    const inst = pw.add(5, 5, 5, 0);
    expect(pw.removeAt(5, 6, 5)).toBe(inst);    // 从树冠格删整棵树
    expect(pw.propAt(5, 5, 5)).toBeUndefined();
    expect(pw.removeAt(5, 6, 5)).toBeNull();
    expect(pw.list()).toEqual([]);
  });

  it('supports an undo-style remove/re-add cycle returning to the prior state', () => {
    const pw = createPropWorld(MODELS);
    const a = pw.add(5, 5, 5, 0);
    expect(pw.removeAt(5, 5, 5)).toBe(a);
    const b = pw.add(5, 5, 5, 0);               // LIFO 撤销后原位重放
    expect(b).not.toBeNull();
    expect(pw.propAt(5, 7, 5)).toBe(b);
  });

  it('clear resets both maps', () => {
    const pw = createPropWorld(MODELS);
    pw.add(5, 5, 5, 0);
    pw.clear();
    expect(pw.list()).toEqual([]);
    expect(pw.propAt(5, 5, 5)).toBeUndefined();
    expect(pw.add(5, 5, 5, 0)).not.toBeNull();  // 占用映射也已清空
  });

  it('assigns unique ids', () => {
    const pw = createPropWorld(MODELS);
    const a = pw.add(0, 0, 0, 0);
    const b = pw.add(2, 0, 0, 0);
    expect(a && b && a.id !== b.id).toBe(true);
  });

  it('rejects negative coords without corrupting keys', () => {
    const pw = createPropWorld([emptyModel(1, 1)]);
    expect(pw.add(-1, 0, 0, 0)).toBeNull();
    expect(pw.propAt(-1, 0, 0)).toBeUndefined();
  });
});
