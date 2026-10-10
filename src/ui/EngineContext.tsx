import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { EditorState, EditorStore } from '../engine/editor-store';
import type { Engine } from '../engine/engine';

export interface EngineContextValue {
  readonly engine: Engine;
  readonly store: EditorStore;
}

const EngineContext = createContext<EngineContextValue | null>(null);

export function EngineProvider({ value, children }: { value: EngineContextValue; children: ReactNode }) {
  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngine(): Engine {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error('useEngine must be used within EngineProvider');
  return ctx.engine;
}

export function useEditorState(): EditorState {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error('useEditorState must be used within EngineProvider');
  return useSyncExternalStore(ctx.store.subscribe, () => ctx.store.getState());
}
