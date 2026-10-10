import { BLOCK, type BlockId } from '../core/block-types';
import { defaultKelvinAnchors, paletteFromKelvin } from '../rendering/color-temperature';
import {
  PASTEL_BLOOM_RADIUS,
  PASTEL_BLOOM_STRENGTH,
  PASTEL_BLOOM_THRESHOLD,
  PASTEL_CLEAR_COLOR,
  PASTEL_ENV_BLUR,
  PASTEL_ENV_MAP_INTENSITY,
  PASTEL_LIGHT_DISTANCE,
  PASTEL_METALNESS,
  PASTEL_ROUGHNESS,
  PASTEL_SHADOW_BIAS,
  PASTEL_SHADOW_EXTENT,
  PASTEL_SHADOW_FAR,
  PASTEL_SHADOW_MAP_SIZE,
  PASTEL_SHADOW_NEAR,
  PASTEL_SHADOW_NORMAL_BIAS,
  PASTEL_TONE_MAPPING_EXPOSURE,
} from '../rendering/pastel-lighting';
import { DEFAULT_AMBIENT, DEFAULT_DIRECTIONAL } from '../rendering/renderer-api';

export type EditorMode = 'orbit' | 'terrain' | 'item';
export type ToolAction = 'place' | 'remove' | null;

export interface ToastState {
  readonly message: string;
  readonly key: number;
  readonly place?: 'top' | 'bottom';
}

export interface EditorState {
  readonly mode: EditorMode;
  readonly terrainAction: ToolAction;
  readonly itemAction: ToolAction;
  readonly currentBlockType: BlockId;
  readonly currentPropModelId: number | null;
  readonly ambient: number;
  readonly directional: number;
  readonly temperature: number;
  readonly lightDir: readonly [number, number, number];
  readonly exposure: number;
  readonly envMapIntensity: number;
  readonly envBlur: number;
  readonly bloomStrength: number;
  readonly bloomRadius: number;
  readonly bloomThreshold: number;
  readonly roughness: number;
  readonly metalness: number;
  readonly shadowBias: number;
  readonly shadowNormalBias: number;
  readonly shadowMapSize: number;
  readonly shadowExtent: number;
  readonly shadowNear: number;
  readonly shadowFar: number;
  readonly lightDistance: number;
  readonly skyColor: number;
  readonly groundColor: number;
  readonly sunColor: number;
  readonly background: number;
  readonly sunNeutral: number;
  readonly sunWarm: number;
  readonly sunCool: number;
  readonly skyNeutral: number;
  readonly skyWarm: number;
  readonly skyCool: number;
  readonly groundNeutral: number;
  readonly groundWarm: number;
  readonly groundCool: number;
  readonly viewTheta: number;
  readonly perspective: number;
  readonly adapter: string;
  readonly toast: ToastState | null;
}

export type LightingPatch = Partial<Pick<EditorState,
  | 'ambient' | 'directional' | 'temperature' | 'lightDir'
  | 'exposure' | 'envMapIntensity' | 'envBlur'
  | 'bloomStrength' | 'bloomRadius' | 'bloomThreshold'
  | 'roughness' | 'metalness'
  | 'shadowBias' | 'shadowNormalBias' | 'shadowMapSize' | 'shadowExtent' | 'shadowNear' | 'shadowFar'
  | 'lightDistance' | 'skyColor' | 'groundColor' | 'sunColor' | 'background'
  | 'sunNeutral' | 'sunWarm' | 'sunCool'
  | 'skyNeutral' | 'skyWarm' | 'skyCool'
  | 'groundNeutral' | 'groundWarm' | 'groundCool'
>>;

const DEFAULT_TEMPERATURE = 5000;
const DEFAULT_ANCHORS = defaultKelvinAnchors();
const DEFAULT_PALETTE = paletteFromKelvin(DEFAULT_TEMPERATURE, DEFAULT_ANCHORS, PASTEL_CLEAR_COLOR);

export interface EditorStore {
  getState(): EditorState;
  setState(patch: Partial<EditorState>): void;
  subscribe(listener: () => void): () => void;
}

const DEFAULT_STATE: EditorState = {
  mode: 'orbit',
  terrainAction: null,
  itemAction: null,
  currentBlockType: BLOCK.GRASS,
  currentPropModelId: null,
  ambient: DEFAULT_AMBIENT,
  directional: DEFAULT_DIRECTIONAL,
  temperature: DEFAULT_TEMPERATURE,
  lightDir: [0.5, 1, 0.3],
  exposure: PASTEL_TONE_MAPPING_EXPOSURE,
  envMapIntensity: PASTEL_ENV_MAP_INTENSITY,
  envBlur: PASTEL_ENV_BLUR,
  bloomStrength: PASTEL_BLOOM_STRENGTH,
  bloomRadius: PASTEL_BLOOM_RADIUS,
  bloomThreshold: PASTEL_BLOOM_THRESHOLD,
  roughness: PASTEL_ROUGHNESS,
  metalness: PASTEL_METALNESS,
  shadowBias: PASTEL_SHADOW_BIAS,
  shadowNormalBias: PASTEL_SHADOW_NORMAL_BIAS,
  shadowMapSize: PASTEL_SHADOW_MAP_SIZE,
  shadowExtent: PASTEL_SHADOW_EXTENT,
  shadowNear: PASTEL_SHADOW_NEAR,
  shadowFar: PASTEL_SHADOW_FAR,
  lightDistance: PASTEL_LIGHT_DISTANCE,
  skyColor: DEFAULT_PALETTE.skyColor,
  groundColor: DEFAULT_PALETTE.groundColor,
  sunColor: DEFAULT_PALETTE.sunColor,
  background: DEFAULT_PALETTE.background,
  ...DEFAULT_ANCHORS,
  viewTheta: Math.PI * 0.25,
  perspective: 200,
  adapter: 'auto',
  toast: null,
};

export function createEditorStore(initial: Partial<EditorState> = {}): EditorStore {
  let state: EditorState = { ...DEFAULT_STATE, ...initial };
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    setState(patch) {
      state = { ...state, ...patch };
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
