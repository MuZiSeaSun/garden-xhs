import {
  RENDERER_API_VERSION,
  type RendererAdapter,
  type RendererInitOptions,
  type CameraState,
  type WorldSnapshot,
  type BlockDelta,
  type Ray,
  type Theme,
  type Capabilities,
} from '../renderer-api';

export class NullAdapter implements RendererAdapter {
  readonly name = 'null';
  readonly apiVersion = RENDERER_API_VERSION;

  isSupported(_caps: Capabilities): boolean {
    return true;
  }
  async init(_opts: RendererInitOptions): Promise<void> { /* noop */ }
  dispose(): void { /* noop */ }
  resize(_width: number, _height: number, _dpr: number): void { /* noop */ }
  setCamera(_state: CameraState): void { /* noop */ }
  syncWorld(_snapshot: WorldSnapshot): void { /* noop */ }
  applyBlockDelta(_delta: BlockDelta): void { /* noop */ }
  screenPointToRay(_x: number, _y: number): Ray {
    return { origin: [0, 0, 0], direction: [0, 0, -1] };
  }
  setTheme(_theme: Theme): void { /* noop */ }
  requestRender(): void { /* noop */ }
  captureImage(): string { return ''; }
}
