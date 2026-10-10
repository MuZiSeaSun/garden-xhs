export type Rgb = [number, number, number];

const NEUTRAL_K = 6500; // 中性色温锚点
const WARM_K = 1500; // 最暖锚点
const COOL_K = 20000; // 最冷锚点

// 三套锚点色：中性 / 暖 / 冷。调试面板色温在它们之间插值。
const SUN_NEUTRAL: Rgb = [1, 0xf8 / 255, 0xdc / 255];
const SUN_WARM: Rgb = [1, 0.62, 0.28];
const SUN_COOL: Rgb = [0.55, 0.78, 1];

const SKY_NEUTRAL: Rgb = [0xbb / 255, 0xe0 / 255, 1];
const SKY_WARM: Rgb = [1, 0.78, 0.55];
const SKY_COOL: Rgb = [0.45, 0.68, 1];

const GROUND_NEUTRAL: Rgb = [0x6b / 255, 0x44 / 255, 0x23 / 255];
const GROUND_WARM: Rgb = [0.55, 0.22, 0.08];
const GROUND_COOL: Rgb = [0.28, 0.26, 0.22];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function kelvinMix(kelvin: number, neutral: Rgb, warm: Rgb, cool: Rgb): Rgb {
  if (kelvin <= NEUTRAL_K) {
    const t = clamp01((NEUTRAL_K - kelvin) / (NEUTRAL_K - WARM_K));
    return lerp(neutral, warm, t);
  }
  const t = clamp01((kelvin - NEUTRAL_K) / (COOL_K - NEUTRAL_K));
  return lerp(neutral, cool, t);
}

export function kelvinSunColor(kelvin: number): Rgb {
  return kelvinMix(kelvin, SUN_NEUTRAL, SUN_WARM, SUN_COOL);
}

export function kelvinSkyColor(kelvin: number): Rgb {
  return kelvinMix(kelvin, SKY_NEUTRAL, SKY_WARM, SKY_COOL);
}

export function kelvinGroundColor(kelvin: number): Rgb {
  return kelvinMix(kelvin, GROUND_NEUTRAL, GROUND_WARM, GROUND_COOL);
}

export function kelvinToRgb(kelvin: number): Rgb {
  return kelvinSunColor(kelvin);
}

export function kelvinBackgroundFactor(kelvin: number): Rgb {
  const sky = kelvinSkyColor(kelvin);
  return [
    SKY_NEUTRAL[0] === 0 ? 1 : sky[0] / SKY_NEUTRAL[0],
    SKY_NEUTRAL[1] === 0 ? 1 : sky[1] / SKY_NEUTRAL[1],
    SKY_NEUTRAL[2] === 0 ? 1 : sky[2] / SKY_NEUTRAL[2],
  ];
}

export interface KelvinAnchorHex {
  readonly sunNeutral: number;
  readonly sunWarm: number;
  readonly sunCool: number;
  readonly skyNeutral: number;
  readonly skyWarm: number;
  readonly skyCool: number;
  readonly groundNeutral: number;
  readonly groundWarm: number;
  readonly groundCool: number;
}

export function rgbToHex(rgb: Rgb): number {
  const ch = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (ch(rgb[0]) << 16) | (ch(rgb[1]) << 8) | ch(rgb[2]);
}

export function hexToRgb(hex: number): Rgb {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

export function defaultKelvinAnchors(): KelvinAnchorHex {
  return {
    sunNeutral: rgbToHex(SUN_NEUTRAL),
    sunWarm: rgbToHex(SUN_WARM),
    sunCool: rgbToHex(SUN_COOL),
    skyNeutral: rgbToHex(SKY_NEUTRAL),
    skyWarm: rgbToHex(SKY_WARM),
    skyCool: rgbToHex(SKY_COOL),
    groundNeutral: rgbToHex(GROUND_NEUTRAL),
    groundWarm: rgbToHex(GROUND_WARM),
    groundCool: rgbToHex(GROUND_COOL),
  };
}

export function paletteFromKelvin(
  kelvin: number,
  anchors: KelvinAnchorHex,
  clearBase: number,
): { skyColor: number; groundColor: number; sunColor: number; background: number } {
  const sun = kelvinMix(kelvin, hexToRgb(anchors.sunNeutral), hexToRgb(anchors.sunWarm), hexToRgb(anchors.sunCool));
  const sky = kelvinMix(kelvin, hexToRgb(anchors.skyNeutral), hexToRgb(anchors.skyWarm), hexToRgb(anchors.skyCool));
  const ground = kelvinMix(kelvin, hexToRgb(anchors.groundNeutral), hexToRgb(anchors.groundWarm), hexToRgb(anchors.groundCool));
  const neutral = hexToRgb(anchors.skyNeutral);
  const factor: Rgb = [
    neutral[0] === 0 ? 1 : sky[0] / neutral[0],
    neutral[1] === 0 ? 1 : sky[1] / neutral[1],
    neutral[2] === 0 ? 1 : sky[2] / neutral[2],
  ];
  const base = hexToRgb(clearBase);
  return {
    sunColor: rgbToHex(sun),
    skyColor: rgbToHex(sky),
    groundColor: rgbToHex(ground),
    background: rgbToHex([base[0] * factor[0], base[1] * factor[1], base[2] * factor[2]]),
  };
}
