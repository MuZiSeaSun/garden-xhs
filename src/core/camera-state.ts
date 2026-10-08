import type { CameraState } from '../rendering/renderer-api';

const PHI_MIN = 0.15;
const PHI_MAX = Math.PI - 0.15;
const RADIUS_MIN = 8;
const RADIUS_MAX = 40;

export interface CameraOrbit {
  theta: number;
  phi: number;
  radius: number;
  target: [number, number, number];
  fov: number;
  near: number;
  far: number;
}

export function createCameraOrbit(): CameraOrbit {
  return {
    theta: Math.PI * 0.25,
    phi: Math.PI * 0.35,
    radius: 22,
    target: [5, 3, 5],
    fov: Math.PI / 4,
    near: 0.1,
    far: 200,
  };
}

export function orbit(c: CameraOrbit, dx: number, dy: number): void {
  c.theta += dx * 0.01;
  c.phi = Math.max(PHI_MIN, Math.min(PHI_MAX, c.phi + dy * 0.01));
}

export function zoom(c: CameraOrbit, factor: number): void {
  c.radius = Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, c.radius * factor));
}

export function toRendererCameraState(c: CameraOrbit): CameraState {
  const sinPhi = Math.sin(c.phi);
  const position: [number, number, number] = [
    c.target[0] + c.radius * sinPhi * Math.cos(c.theta),
    c.target[1] + c.radius * Math.cos(c.phi),
    c.target[2] + c.radius * sinPhi * Math.sin(c.theta),
  ];
  return {
    position,
    target: [c.target[0], c.target[1], c.target[2]],
    up: [0, 1, 0],
    fov: c.fov,
    near: c.near,
    far: c.far,
  };
}
