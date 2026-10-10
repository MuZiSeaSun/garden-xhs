import type { CameraState } from '../rendering/renderer-api';

// 透视强度由「相机距离 / 场景尺寸」决定：距离越小透视越强。
// 取景由 fov 表示，改距离时用 setDistance 同步换算 fov，从而保持取景大小不变。
// 参考（近/远边尺寸差）：500≈3%（近正交） · 300≈5% · 200≈7%（轻微） · 120≈12% · 80≈19% · 50≈33%
const DEFAULT_DISTANCE = 200;
const DIST_MIN = 60;
const DIST_MAX = 500;
const WORLD_RADIUS = 9; // 10×10 场地半径（含少量堆叠余量）
const FIT_MARGIN = 2.0; // 留白倍数：越大，场地在屏幕上越小
const HALF_MIN = 6;
const HALF_MAX = 120;
/** 注视点可离开岛屿中心的最远距离，避免拖出后找不到。 */
const PAN_REACH = 40;
const PAN_CENTER = 5;

const ISO_ELEVATION = Math.atan(1 / Math.SQRT2);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const fovForHalfHeight = (half: number, distance: number): number => 2 * Math.atan(half / distance);
const halfHeightOf = (c: CameraOrbit): number => c.radius * Math.tan(c.fov / 2);
const setHalfHeight = (c: CameraOrbit, half: number): void => {
  c.fov = fovForHalfHeight(clamp(half, HALF_MIN, HALF_MAX), c.radius);
};

export interface CameraOrbit {
  theta: number;
  phi: number;
  radius: number;
  fov: number;
  target: [number, number, number];
  near: number;
  far: number;
}

export function createCameraOrbit(): CameraOrbit {
  return {
    theta: Math.PI * 0.25,
    phi: Math.PI / 2 - ISO_ELEVATION,
    radius: DEFAULT_DISTANCE,
    fov: fovForHalfHeight(WORLD_RADIUS * FIT_MARGIN, DEFAULT_DISTANCE),
    target: [5, 3, 5],
    near: 1,
    far: 2000,
  };
}

/** 依据视口宽高比取景：保证 10×10 场地在任意屏幕上完整可见。 */
export function fitViewport(c: CameraOrbit, aspect: number): void {
  const a = Math.max(aspect, 0.25);
  const needHalf = Math.max(WORLD_RADIUS, WORLD_RADIUS / a) * FIT_MARGIN;
  setHalfHeight(c, needHalf);
}

/** Rotate only around the vertical axis (yaw). Elevation stays fixed (isometric). */
export function orbit(c: CameraOrbit, dx: number, _dy: number): void {
  c.theta += dx * 0.01;
}

/** 双指拧转：弧度，正值让岛屿在屏幕上顺时针转。俯仰不变。 */
export function yaw(c: CameraOrbit, radians: number): void {
  c.theta += radians;
}

const TILT_LIMIT = 10 * Math.PI / 180;
/** 双指共同垂直滑过约 120px 时，仰角走满 10°。 */
const TILT_PER_PX = TILT_LIMIT / 120;

/**
 * 双指同时上滑或下滑，改变相机仰角。
 * dy 为屏幕像素，向下为正；下滑抬高仰角（更俯视），上滑降低仰角（更平视）。
 * 相对默认等轴测仰角最多 ±10°。
 */
export function tilt(c: CameraOrbit, dy: number): void {
  const elevation = Math.PI / 2 - c.phi;
  const next = clamp(elevation + dy * TILT_PER_PX, ISO_ELEVATION - TILT_LIMIT, ISO_ELEVATION + TILT_LIMIT);
  c.phi = Math.PI / 2 - next;
}

/**
 * 单指拖动岛屿。屏幕位移按当前取景换算到地面，内容跟随手指。
 * viewportHeight 为画布 CSS 像素高度。
 */
export function pan(c: CameraOrbit, dx: number, dy: number, viewportHeight: number): void {
  const scale = (2 * halfHeightOf(c)) / Math.max(viewportHeight, 1);
  const rightX = Math.sin(c.theta);
  const rightZ = -Math.cos(c.theta);
  const upX = -Math.cos(c.theta);
  const upZ = -Math.sin(c.theta);
  const lo = PAN_CENTER - PAN_REACH;
  const hi = PAN_CENTER + PAN_REACH;
  c.target[0] = clamp(c.target[0] + (-rightX * dx + upX * dy) * scale, lo, hi);
  c.target[2] = clamp(c.target[2] + (-rightZ * dx + upZ * dy) * scale, lo, hi);
}

/** Zoom by changing the view frustum size (framing); camera distance untouched. */
export function zoom(c: CameraOrbit, factor: number): void {
  setHalfHeight(c, halfHeightOf(c) * factor);
}

/** 调整相机距离（透视强度），保持当前取景大小不变。 */
export function setDistance(c: CameraOrbit, distance: number): void {
  const half = halfHeightOf(c);
  c.radius = clamp(distance, DIST_MIN, DIST_MAX);
  setHalfHeight(c, half);
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
