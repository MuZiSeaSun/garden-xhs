import { describe, it, expect } from 'vitest';
import {
  createCameraOrbit,
  orbit,
  zoom,
  fitViewport,
  setDistance,
  toRendererCameraState,
} from '../../src/core/camera-state';

describe('camera-state', () => {
  it('starts at an isometric view (azimuth 45deg, elevation atan(1/sqrt2))', () => {
    const c = createCameraOrbit();
    expect(c.theta).toBeCloseTo(Math.PI / 4);
    expect(c.phi).toBeCloseTo(Math.PI / 2 - Math.atan(1 / Math.SQRT2));
  });
  it('rotates only around the vertical axis (dy does not change elevation)', () => {
    const c = createCameraOrbit();
    const phi0 = c.phi;
    const theta0 = c.theta;
    orbit(c, 50, 100000);
    expect(c.phi).toBe(phi0);
    expect(c.theta).toBeCloseTo(theta0 + 0.5);
  });
  it('uses a mild fov from a moderately far camera for slight perspective', () => {
    const c = createCameraOrbit();
    const s = toRendererCameraState(c);
    expect(c.fov).toBeGreaterThan(0.05); // some perspective
    expect(c.fov).toBeLessThan(0.4);
    expect(s.fov).toBeCloseTo(c.fov);
    const dist = Math.hypot(
      s.position[0] - s.target[0],
      s.position[1] - s.target[1],
      s.position[2] - s.target[2],
    );
    const ratio = (dist + 7) / (dist - 7); // near/far size ratio across a ~10-unit scene
    expect(ratio).toBeGreaterThan(1.03); // visible perspective
    expect(ratio).toBeLessThan(1.15); // but slight
  });
  it('fits the view to the viewport (pulls back more on narrow screens)', () => {
    const wide = createCameraOrbit();
    const narrow = createCameraOrbit();
    fitViewport(wide, 2);
    fitViewport(narrow, 0.5);
    // wider aspect fits vertically, narrow aspect must widen fov to fit horizontally
    expect(wide.fov).toBeLessThan(narrow.fov);
    expect(narrow.fov).toBeGreaterThan(0);
  });
  it('changes perspective strength via setDistance while preserving framing', () => {
    const c = createCameraOrbit();
    const half0 = c.radius * Math.tan(c.fov / 2);
    setDistance(c, 80);
    expect(c.radius).toBe(80);
    const half1 = c.radius * Math.tan(c.fov / 2);
    expect(half1).toBeCloseTo(half0, 5);
  });
  it('zooms by narrowing the fov within an ortho-like range', () => {
    const c = createCameraOrbit();
    const f0 = c.fov;
    zoom(c, 0.5);
    expect(c.fov).toBeLessThan(f0);
    zoom(c, 1e6);
    expect(c.fov).toBeLessThan(1.2);
    zoom(c, 1e-6);
    expect(c.fov).toBeGreaterThan(0.02);
  });
  it('places the camera at a moderate distance from the target (spherical offset)', () => {
    const c = createCameraOrbit();
    const s = toRendererCameraState(c);
    expect(s.target).toEqual([5, 3, 5]);
    expect(s.up).toEqual([0, 1, 0]);
    const dx = s.position[0] - s.target[0];
    const dy = s.position[1] - s.target[1];
    const dz = s.position[2] - s.target[2];
    expect(Math.hypot(dx, dy, dz)).toBeCloseTo(200);
  });
});
