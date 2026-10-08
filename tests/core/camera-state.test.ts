import { describe, it, expect } from 'vitest';
import {
  createCameraOrbit,
  orbit,
  zoom,
  toRendererCameraState,
} from '../../src/core/camera-state';

describe('camera-state', () => {
  it('fov is expressed in radians', () => {
    const c = createCameraOrbit();
    expect(toRendererCameraState(c).fov).toBeCloseTo(Math.PI / 4);
  });
  it('clamps phi within (0, PI)', () => {
    const c = createCameraOrbit();
    orbit(c, 0, 100000);
    expect(c.phi).toBeGreaterThan(0);
    expect(c.phi).toBeLessThan(Math.PI);
    orbit(c, 0, -100000);
    expect(c.phi).toBeGreaterThan(0);
    expect(c.phi).toBeLessThan(Math.PI);
  });
  it('clamps radius to [8, 40]', () => {
    const c = createCameraOrbit();
    zoom(c, 0.0001);
    expect(c.radius).toBeGreaterThanOrEqual(8);
    zoom(c, 100000);
    expect(c.radius).toBeLessThanOrEqual(40);
  });
  it('places the camera at target + spherical offset', () => {
    const c = createCameraOrbit();
    const s = toRendererCameraState(c);
    expect(s.target).toEqual([5, 3, 5]);
    expect(s.up).toEqual([0, 1, 0]);
    const dx = s.position[0] - s.target[0];
    const dy = s.position[1] - s.target[1];
    const dz = s.position[2] - s.target[2];
    expect(Math.hypot(dx, dy, dz)).toBeCloseTo(22);
  });
});
