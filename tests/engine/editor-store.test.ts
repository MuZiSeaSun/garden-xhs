import { describe, it, expect } from 'vitest';
import { createEditorStore } from '../../src/engine/editor-store';
import { BLOCK } from '../../src/core/block-types';

describe('createEditorStore', () => {
  it('starts with editor defaults', () => {
    const st = createEditorStore().getState();
    expect(st.mode).toBe('orbit');
    expect(st.terrainAction).toBeNull();
    expect(st.itemAction).toBeNull();
    expect(st.currentBlockType).toBe(BLOCK.GRASS);
    expect(st.currentPropModelId).toBeNull();
    expect(st.adapter).toBe('auto');
    expect(st.toast).toBeNull();
  });

  it('merges partial patches and notifies subscribers', () => {
    const s = createEditorStore();
    let calls = 0;
    const unsub = s.subscribe(() => { calls += 1; });
    s.setState({ mode: 'terrain' });
    expect(s.getState().mode).toBe('terrain');
    expect(s.getState().currentBlockType).toBe(BLOCK.GRASS);
    expect(calls).toBe(1);
    unsub();
    s.setState({ mode: 'item' });
    expect(calls).toBe(1);
  });

  it('accepts initial overrides', () => {
    const st = createEditorStore({ mode: 'item', currentBlockType: BLOCK.STONE }).getState();
    expect(st.mode).toBe('item');
    expect(st.currentBlockType).toBe(BLOCK.STONE);
  });
});
