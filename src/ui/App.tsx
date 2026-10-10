import type { PropModelData } from '../core/prop-types';
import type { EditorStore } from '../engine/editor-store';
import type { Engine } from '../engine/engine';
import { EngineProvider } from './EngineContext';
import { EditorScreen } from './screens/EditorScreen';

export function App({ engine, store, propModels }: {
  engine: Engine;
  store: EditorStore;
  propModels: readonly PropModelData[];
}) {
  return (
    <EngineProvider value={{ engine, store }}>
      <EditorScreen propModels={propModels} />
    </EngineProvider>
  );
}
