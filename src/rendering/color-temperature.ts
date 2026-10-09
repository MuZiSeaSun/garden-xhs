/**
 * 色温白平衡（相对 6500K 中性白的乘性色偏）。
 * 先用 Tanner Helland 近似得到各色温的基色，再相对 6500K 中性点做「放大偏差」：
 * 冷端用较强增益让高 K 明显偏蓝；暖端用较弱增益，使暖光呈橘色而非红色。
 * 返回 sRGB 空间 [r,g,b]（0..1）。
 */
const NEUTRAL_K = 6500;
const COOL_GAIN = 1.6;
const WARM_GAIN = 0.85;

function helland(kelvin: number): [number, number, number] {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = (v: number): number => Math.max(0, Math.min(255, v)) / 255;
  return [c(r), c(g), c(b)];
}

export function kelvinToRgb(kelvin: number): [number, number, number] {
  const base = helland(kelvin);
  const neutral = helland(NEUTRAL_K);
  const gain = kelvin >= NEUTRAL_K ? COOL_GAIN : WARM_GAIN;
  const amp = (c: number, n: number): number => {
    const ratio = n === 0 ? 1 : c / n;
    return Math.max(0, Math.min(1, 1 + (ratio - 1) * gain));
  };
  return [amp(base[0], neutral[0]), amp(base[1], neutral[1]), amp(base[2], neutral[2])];
}

const BG_COOL = 0.6; // 冷端背景加深强度
const BG_WARM = 0.85; // 暖端背景夕阳强度
const WARM_SKY_TARGET: [number, number, number] = [1.2, 0.95, 0.55]; // 偏金而非红

/**
 * 天空/背景的染色倍数。
 * - 冷端：加深蓝。
 * - 暖端：叠加「夕阳暖调」——提高红、保住绿、压低蓝，呈暖金而非红色。
 */
export function kelvinBackgroundFactor(kelvin: number): [number, number, number] {
  const t = kelvinToRgb(kelvin);
  if (t[2] - t[0] > 0) {
    return [1 + (t[0] - 1) * BG_COOL, 1 + (t[1] - 1) * BG_COOL, 1 + (t[2] - 1) * BG_COOL];
  }
  const ramp = Math.max(0, Math.min(1, (NEUTRAL_K - kelvin) / (NEUTRAL_K - 1500)));
  const s = ramp * BG_WARM;
  return [
    1 + (WARM_SKY_TARGET[0] - 1) * s,
    1 + (WARM_SKY_TARGET[1] - 1) * s,
    1 + (WARM_SKY_TARGET[2] - 1) * s,
  ];
}
