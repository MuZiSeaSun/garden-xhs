import type { BlockId } from './block-types';

export interface SetAction {
  readonly type: 'set';
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly prev: BlockId;
}

export interface BatchAction {
  readonly type: 'batch';
  readonly ops: ReadonlyArray<{
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly prev: BlockId;
  }>;
}

export interface SetPropAction {
  readonly type: 'setProp';
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly prevModelId: number | null; // null = 该格原本无道具（撤销 = 移除）
}

export interface BatchPropAction {
  readonly type: 'batchProp';
  readonly ops: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number; readonly prevModelId: number | null }>;
}

export type HistoryAction = SetAction | BatchAction | SetPropAction | BatchPropAction;

const MAX_HISTORY = 20;

export interface History {
  push(action: HistoryAction): void;
  pop(): HistoryAction | undefined;
  clear(): void;
  size(): number;
}

export function createHistory(): History {
  const stack: HistoryAction[] = [];
  return {
    push(action) {
      stack.push(action);
      if (stack.length > MAX_HISTORY) stack.shift();
    },
    pop() {
      return stack.pop();
    },
    clear() {
      stack.length = 0;
    },
    size() {
      return stack.length;
    },
  };
}
