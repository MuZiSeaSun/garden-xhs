import { BLOCK, type BlockId } from '../core/block-types';
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
  readonly viewTheta: number;
  readonly perspective: number;
  readonly adapter: string;
  readonly toast: ToastState | null;
}

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
  temperature: 5000,
  lightDir: [0.5, 1, 0.3],
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
