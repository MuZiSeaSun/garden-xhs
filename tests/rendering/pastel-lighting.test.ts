import { describe, it, expect } from 'vitest';
import { DEFAULT_AMBIENT, DEFAULT_DIRECTIONAL } from '../../src/rendering/renderer-api';
import {
  PASTEL_ENV_MAP_INTENSITY,
  PASTEL_TONE_MAPPING_EXPOSURE,
  PASTEL_BLOOM_STRENGTH,
  PASTEL_BLOOM_RADIUS,
  PASTEL_BLOOM_THRESHOLD,
  PASTEL_SHADOW_BIAS,
  PASTEL_SHADOW_NORMAL_BIAS,
  PASTEL_HEMI_SKY,
  PASTEL_HEMI_GROUND,
  PASTEL_SUN,
} from '../../src/rendering/pastel-lighting';

describe('pastel lighting constants', () => {
  it('uses the reviewed defaults', () => {
    expect(DEFAULT_AMBIENT).toBe(0.35);
    expect(DEFAULT_DIRECTIONAL).toBe(1.5);
    expect(PASTEL_ENV_MAP_INTENSITY).toBe(0.1);
    expect(PASTEL_TONE_MAPPING_EXPOSURE).toBe(0.8);
    expect(PASTEL_BLOOM_STRENGTH).toBe(0.6);
    expect(PASTEL_BLOOM_RADIUS).toBe(0.9);
    expect(PASTEL_BLOOM_THRESHOLD).toBe(0.85);
    expect(PASTEL_SHADOW_BIAS).toBe(-0.0005);
    expect(PASTEL_SHADOW_NORMAL_BIAS).toBe(0.02);
    expect(PASTEL_HEMI_SKY).toBe(0xbbe0ff);
    expect(PASTEL_HEMI_GROUND).toBe(0x6b4423);
    expect(PASTEL_SUN).toBe(0xfff8dc);
  });
});
