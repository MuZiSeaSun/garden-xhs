import type { BlockId } from '../core/block-types';
import type { PropInstance, PropModelData } from '../core/prop-types';

export const RENDERER_API_VERSION = 2 as const;

export interface PropDelta {
  readonly added: ReadonlyArray<PropInstance>;
  readonly removed: ReadonlyArray<{ x: number; y: number; z: number; modelId: number }>;
}

export interface CameraState {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly up: readonly [number, number, number];
  /** 垂直视场角（弧度）。取很小的值（长焦）以近似正交投影。 */
  readonly fov: number;
  readonly near: number;
  readonly far: number;
}

export interface WorldSnapshot {
  readonly size: number;
  readonly blocks: Uint8Array;
}

export interface BlockDelta {
  readonly added: ReadonlyArray<{ x: number; y: number; z: number; type: BlockId }>;
  readonly removed: ReadonlyArray<{ x: number; y: number; z: number }>;
}

export interface Ray {
  readonly origin: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
}

export interface Theme {
  readonly background?: number;
  readonly fogColor?: number;
  readonly fogNear?: number;
  readonly fogFar?: number;
  /** 全局光照强度倍数（1 = 默认，越大越亮）。 */
  readonly exposure?: number;
  /** 光照色温（开尔文）。 */
  readonly temperature?: number;
}

export interface RendererInitOptions {
  readonly canvas: HTMLCanvasElement;
  readonly atlasCanvas: HTMLCanvasElement;
  readonly devicePixelRatio: number;
}

export interface Capabilities {
  readonly webgl: boolean;
  readonly webgl2: boolean;
  readonly worker: boolean;
  readonly offscreenCanvas: boolean;
  readonly wasm: boolean;
  readonly webgpu: boolean;
  readonly miniTool: boolean;
}

/** 所有渲染适配器必须实现此接口 */
export interface RendererAdapter {
  readonly name: string;
  readonly apiVersion: typeof RENDERER_API_VERSION;

  isSupported(caps: Capabilities): boolean;
  init(opts: RendererInitOptions): Promise<void>;
  dispose(): void;

  resize(width: number, height: number, dpr: number): void;
  setCamera(state: CameraState): void;

  syncWorld(snapshot: WorldSnapshot): void;
  applyBlockDelta(delta: BlockDelta): void;

  screenPointToRay(x: number, y: number): Ray;

  setTheme(theme: Theme): void;
  requestRender(): void;
  captureImage(): string;

  /** 一次性上传模型表（可选） */
  definePropModels?(models: readonly PropModelData[]): void;
  /** 全量：首次加载 / 撤销 / 清空 / 恢复存档 / 切换适配器（可选） */
  syncProps?(instances: readonly PropInstance[]): void;
  /** 增量：正常放置 / 删除（可选） */
  applyPropDelta?(delta: PropDelta): void;
}

export type AdapterCtor = new () => RendererAdapter;
