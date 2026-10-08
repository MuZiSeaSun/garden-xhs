import { describe, it, expect } from 'vitest';
import { createHistory } from '../../src/core/history';

describe('history', () => {
  it('pops in LIFO order', () => {
    const h = createHistory();
    h.push({ type: 'set', x: 0, y: 0, z: 0, prev: 1 });
    h.push({ type: 'set', x: 1, y: 0, z: 0, prev: 2 });
    expect(h.pop()?.x).toBe(1);
    expect(h.pop()?.x).toBe(0);
    expect(h.pop()).toBeUndefined();
  });
  it('caps at 20 entries, dropping the oldest', () => {
    const h = createHistory();
    for (let i = 0; i < 25; i++) h.push({ type: 'set', x: i, y: 0, z: 0, prev: 1 });
    expect(h.size()).toBe(20);
    expect(h.pop()?.x).toBe(24);
  });
  it('clear resets size', () => {
    const h = createHistory();
    h.push({ type: 'batch', ops: [] });
    h.clear();
    expect(h.size()).toBe(0);
  });
});
