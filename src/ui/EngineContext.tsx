import { createContext, useCallback, useContext, useRef, useSyncExternalStore, type ReactNode } from 'react';
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

export function useEditorSelector<T>(selector: (state: EditorState) => T): T {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error('useEditorSelector must be used within EngineProvider');
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const cache = useRef<{ state: EditorState; value: T } | null>(null);
  const getSnapshot = useCallback(() => {
    const state = ctx.store.getState();
    const last = cache.current;
    if (last && last.state === state) return last.value;
    const value = selectorRef.current(state);
    if (last && Object.is(last.value, value)) {
      cache.current = { state, value: last.value };
      return last.value;
    }
    cache.current = { state, value };
    return value;
  }, [ctx.store]);
  return useSyncExternalStore(ctx.store.subscribe, getSnapshot);
}
