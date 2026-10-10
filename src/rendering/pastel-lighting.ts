/** 环境贴图反射强度。越大高光越亮，阴影也会被抬亮。约 0–1 */
export const PASTEL_ENV_MAP_INTENSITY = 0.1;
/** 环境贴图模糊。越大反射越糊。约 0–0.2 */
export const PASTEL_ENV_BLUR = 0.04;
/** ACES 曝光。整体亮度。约 0.2–2 */
export const PASTEL_TONE_MAPPING_EXPOSURE = 0.8;
/** 泛光强度。越大光晕越重。约 0–2 */
export const PASTEL_BLOOM_STRENGTH = 0.6;
/** 泛光扩散。越大光晕越糊。约 0–1 */
export const PASTEL_BLOOM_RADIUS = 0.9;
/** 泛光阈值。越高只有更亮的区域才发光。约 0–1 */
export const PASTEL_BLOOM_THRESHOLD = 0.85;
/** 金属度。除金属道具外保持 0。约 0–1 */
export const PASTEL_METALNESS = 0;
/** 粗糙度。越高高光越散。约 0–1 */
export const PASTEL_ROUGHNESS = 0.85;
/** 阴影深度偏移。更负会把影子推离接触面。约 -0.005–0.001 */
export const PASTEL_SHADOW_BIAS = -0.0005;
/** 阴影法线偏移。越大接触阴影越浅。约 0–0.1 */
export const PASTEL_SHADOW_NORMAL_BIAS = 0.02;
/** 阴影贴图分辨率。越大越清晰。256–4096 */
export const PASTEL_SHADOW_MAP_SIZE = 2048;
/** 阴影相机半宽，包住 10 格世界。约 4–40 */
export const PASTEL_SHADOW_EXTENT = 14;
/** 阴影相机近面。约 0.1–80 */
export const PASTEL_SHADOW_NEAR = 36;
/** 阴影相机远面。约 10–200 */
export const PASTEL_SHADOW_FAR = 92;
/** 光源离目标的距离。约 10–150 */
export const PASTEL_LIGHT_DISTANCE = 60;
/** 天空底色。色温会再乘一层 */
export const PASTEL_CLEAR_COLOR = 0xb8dbf7;
/** 半球光天空色，从上照下。淡蓝 */
export const PASTEL_HEMI_SKY = 0xbbe0ff;
/** 半球光地面色，从下反射。暖棕 */
export const PASTEL_HEMI_GROUND = 0x6b4423;
/** 太阳颜色。暖白 */
export const PASTEL_SUN = 0xfff8dc;
