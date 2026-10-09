import { describe, it, expect } from 'vitest';
import { kelvinToRgb, kelvinBackgroundFactor } from '../../src/rendering/color-temperature';

describe('kelvinToRgb', () => {
  it('1500K is warm orange (r > g > b, and not red)', () => {
    const [r, g, b] = kelvinToRgb(1500);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(0.35); // green kept high enough to read orange, not red
    expect(b).toBeGreaterThan(0);
  });
  it('20000K is clearly cool (b high, r well below neutral)', () => {
    const [r, , b] = kelvinToRgb(20000);
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThanOrEqual(0.95);
    expect(r).toBeLessThan(0.6);
  });
  it('6500K is neutral white', () => {
    const [r, g, b] = kelvinToRgb(6500);
    expect(r).toBeCloseTo(1, 2);
    expect(g).toBeCloseTo(1, 2);
    expect(b).toBeCloseTo(1, 2);
  });
  it('returns components in [0,1]', () => {
    for (const k of [1500, 3000, 5000, 8000, 20000]) {
      for (const c of kelvinToRgb(k)) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('kelvinBackgroundFactor', () => {
  it('adds a subtle warm sunset tint at warm temperatures (gold, not red)', () => {
    const [r, g, b] = kelvinBackgroundFactor(1500);
    expect(r).toBeGreaterThan(g); // warmed
    expect(g).toBeGreaterThan(b); // not flipped to red
    expect(b).toBeGreaterThan(0.5); // blue still present
  });
  it('cools the sky at high temperatures', () => {
    const [r] = kelvinBackgroundFactor(20000);
    expect(r).toBeLessThan(0.9);
  });
});
