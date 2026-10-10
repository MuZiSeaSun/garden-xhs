import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const src = readFileSync(new URL('../../src/rendering/adapters/three-adapter.ts', import.meta.url), 'utf8');

describe('ThreeAdapter pastel lighting wiring', () => {
  it('uses hemisphere light, IBL, and the post chain', () => {
    for (const token of [
      'HemisphereLight',
      'RoomEnvironment',
      'EffectComposer',
      'UnrealBloomPass',
      'OutputPass',
      'FXAAShader',
      'ACESFilmicToneMapping',
      'envMapIntensity',
      'composer.render',
      'PASTEL_SHADOW_BIAS',
      'kelvinSkyColor',
      'kelvinGroundColor',
    ]) {
      expect(src, token).toContain(token);
    }
  });

  it('drops slope-bias shadows and the flat ambient light', () => {
    expect(src).not.toContain('slopeBiasShadowDepth');
    expect(src).not.toContain('AmbientLight');
    expect(src).not.toContain('customDepthMaterial');
  });
});
