/** 圆周相对竖直方向的最大夹角。再平会贴住地平线，方向光阴影会失真。 */
export const LIGHT_ELEVATION_MAX = 80 * Math.PI / 180;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

function viewAxes(theta: number): { rightX: number; rightZ: number; farX: number; farZ: number } {
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  return { rightX: s, rightZ: -c, farX: -c, farZ: -s };
}

/**
 * 圆盘坐标换成指向光源的单位向量。
 * nx 向右为正，ny 向下为正（屏幕坐标）。方位跟相机 theta：右侧是画面右，上方是画面远处。
 */
export function diskToLightDir(nx: number, ny: number, theta: number): [number, number, number] {
  let x = nx;
  let y = ny;
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  const r = Math.min(1, len);
  const elev = r * LIGHT_ELEVATION_MAX;
  if (r < 1e-8) return [0, 1, 0];
  const horiz = Math.sin(elev);
  const { rightX, rightZ, farX, farZ } = viewAxes(theta);
  const rightAmt = x / r;
  const farAmt = -y / r;
  return [
    horiz * (rightAmt * rightX + farAmt * farX),
    Math.cos(elev),
    horiz * (rightAmt * rightZ + farAmt * farZ),
  ];
}

/** 把世界光照方向投回当前画面的圆盘坐标。正上方来光落在圆心。 */
export function lightDirToDisk(
  dir: readonly [number, number, number],
  theta: number,
): { nx: number; ny: number } {
  const horiz = Math.hypot(dir[0], dir[2]);
  const elev = Math.atan2(horiz, dir[1]);
  const r = clamp01(elev / LIGHT_ELEVATION_MAX);
  if (horiz < 1e-8 || r === 0) return { nx: 0, ny: 0 };
  const { rightX, rightZ, farX, farZ } = viewAxes(theta);
  const rightAmt = (dir[0] * rightX + dir[2] * rightZ) / horiz;
  const farAmt = (dir[0] * farX + dir[2] * farZ) / horiz;
  return { nx: rightAmt * r, ny: -farAmt * r };
}
