import 'animal-island-ui/style';
import '../style.css';
import { createRoot } from 'react-dom/client';
import type { PropModelData } from '../core/prop-types';
import type { EditorStore } from '../engine/editor-store';
import type { Engine } from '../engine/engine';
import { App } from './App';

export function mountUI(root: HTMLElement, engine: Engine, store: EditorStore, propModels: readonly PropModelData[]): void {
  if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  }
  createRoot(root).render(<App engine={engine} store={store} propModels={propModels} />);
}
