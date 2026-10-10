import { describe, it, expect } from 'vitest';
import {
  kelvinToRgb,
  kelvinSunColor,
  kelvinSkyColor,
  kelvinGroundColor,
  kelvinBackgroundFactor,
  defaultKelvinAnchors,
  paletteFromKelvin,
} from '../../src/rendering/color-temperature';

const hex = (n: number): number => n / 255;

describe('pastel kelvin palette', () => {
  it('6500K matches the reference swatches', () => {
    const sun = kelvinSunColor(6500);
    const sky = kelvinSkyColor(6500);
    const ground = kelvinGroundColor(6500);
    expect(sun[0]).toBeCloseTo(1, 5);
    expect(sun[1]).toBeCloseTo(hex(0xf8), 5);
    expect(sun[2]).toBeCloseTo(hex(0xdc), 5);
    expect(sky[0]).toBeCloseTo(hex(0xbb), 5);
    expect(sky[1]).toBeCloseTo(hex(0xe0), 5);
    expect(sky[2]).toBeCloseTo(1, 5);
    expect(ground[0]).toBeCloseTo(hex(0x6b), 5);
    expect(ground[1]).toBeCloseTo(hex(0x44), 5);
    expect(ground[2]).toBeCloseTo(hex(0x23), 5);
  });

  it('1500K sun is warm orange, not red', () => {
    const [r, g, b] = kelvinSunColor(1500);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(0.35);
    expect(b).toBeGreaterThan(0);
  });

  it('20000K sun is cool', () => {
    const [r, , b] = kelvinSunColor(20000);
    expect(b).toBeGreaterThan(r);
    expect(r).toBeLessThan(0.6);
  });

  it('kelvinToRgb is the sun color', () => {
    expect(kelvinToRgb(5000)).toEqual(kelvinSunColor(5000));
  });

  it('background factor is neutral at 6500K and warm at 1500K', () => {
    const neutral = kelvinBackgroundFactor(6500);
    expect(neutral[0]).toBeCloseTo(1, 5);
    expect(neutral[1]).toBeCloseTo(1, 5);
    expect(neutral[2]).toBeCloseTo(1, 5);
    const [r, g, b] = kelvinBackgroundFactor(1500);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(0.5);
  });

  it('cools the sky multiplier at high temperatures', () => {
    const [r] = kelvinBackgroundFactor(20000);
    expect(r).toBeLessThan(0.9);
  });

  it('keeps palette components in [0,1]', () => {
    for (const k of [1500, 3000, 5000, 6500, 8000, 20000]) {
      for (const c of [...kelvinSunColor(k), ...kelvinSkyColor(k), ...kelvinGroundColor(k)]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('paletteFromKelvin', () => {
  it('packs the neutral sun as warm white', () => {
    expect(paletteFromKelvin(6500, defaultKelvinAnchors(), 0xb8dbf7).sunColor).toBe(0xfff8dc);
  });
});
