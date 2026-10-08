import { RENDERER_API_VERSION, type RendererAdapter, type Capabilities, type Ray } from '../renderer-api';

export class ThreeAdapter implements RendererAdapter {
  readonly name = 'three';
  readonly apiVersion = RENDERER_API_VERSION;
  isSupported(caps: Capabilities): boolean { return caps.webgl; }
  async init(): Promise<void> { throw new Error('stub'); }
  dispose(): void {}
  resize(): void {}
  setCamera(): void {}
  syncWorld(): void {}
  applyBlockDelta(): void {}
  screenPointToRay(): Ray { return { origin: [0, 0, 0], direction: [0, 0, -1] }; }
  setTheme(): void {}
  requestRender(): void {}
  captureImage(): string { return ''; }
}
