import { describe, it, expect } from 'vitest';
import { createHistory } from '../../src/core/history';

describe('history', () => {
  it('pops in LIFO order', () => {
    const h = createHistory();
    h.push({ type: 'set', x: 0, y: 0, z: 0, prev: 1 });
    h.push({ type: 'set', x: 1, y: 0, z: 0, prev: 2 });
    const a = h.pop();
    const b = h.pop();
    expect(a && a.type === 'set' ? a.x : undefined).toBe(1);
    expect(b && b.type === 'set' ? b.x : undefined).toBe(0);
    expect(h.pop()).toBeUndefined();
  });
  it('caps at 20 entries, dropping the oldest', () => {
    const h = createHistory();
    for (let i = 0; i < 25; i++) h.push({ type: 'set', x: i, y: 0, z: 0, prev: 1 });
    expect(h.size()).toBe(20);
    const a = h.pop();
    expect(a && a.type === 'set' ? a.x : undefined).toBe(24);
  });
  it('clear resets size', () => {
    const h = createHistory();
    h.push({ type: 'batch', ops: [] });
    h.clear();
    expect(h.size()).toBe(0);
  });
  it('stores prop actions in the same LIFO stack', () => {
    const h = createHistory();
    h.push({ type: 'setProp', x: 1, y: 0, z: 0, prevModelId: null });
    h.push({ type: 'batchProp', ops: [{ x: 2, y: 0, z: 0, prevModelId: 3 }] });
    const b = h.pop();
    expect(b && b.type === 'batchProp' ? b.ops[0].x : undefined).toBe(2);
    const a = h.pop();
    expect(a && a.type === 'setProp' ? a.prevModelId : undefined).toBeNull();
  });
});
