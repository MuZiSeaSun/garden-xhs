import { createRoot } from 'react-dom/client';
import type { PropModelData } from '../core/prop-types';
import type { EditorStore } from '../engine/editor-store';
import type { Engine } from '../engine/engine';
import { App } from './App';

export function mountUI(root: HTMLElement, engine: Engine, store: EditorStore, propModels: readonly PropModelData[]): void {
  createRoot(root).render(<App engine={engine} store={store} propModels={propModels} />);
}
