// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bindUI } from '../../src/ui';
import { BLOCK } from '../../src/core/block-types';

beforeEach(() => { document.body.innerHTML = '<div id="ui-root"></div>'; });

function handlers() {
  return {
    onModeChange: vi.fn(), onBlockSelect: vi.fn(), onPresetSelect: vi.fn(),
    onUndo: vi.fn(), onReset: vi.fn(), onSaveAlbum: vi.fn(), onShareNote: vi.fn(),
  };
}

describe('bindUI', () => {
  it('renders three mode buttons and switches mode on click', () => {
    const h = handlers();
    bindUI(h);
    const modes = document.querySelectorAll('.mode-btn');
    expect(modes.length).toBe(3);
    (modes[1] as HTMLButtonElement).click();
    expect(h.onModeChange).toHaveBeenCalledWith('place');
  });
  it('selects a block type from the palette', () => {
    const h = handlers();
    bindUI(h);
    (document.querySelectorAll('.palette-item')[0] as HTMLButtonElement).click();
    expect(h.onBlockSelect).toHaveBeenCalledWith(BLOCK.GRASS);
  });
  it('selects a preset from the palette', () => {
    const h = handlers();
    bindUI(h);
    const items = document.querySelectorAll('.palette-item');
    (items[items.length - 1] as HTMLButtonElement).click();
    expect(h.onPresetSelect).toHaveBeenCalled();
  });
  it('wires the four action buttons', () => {
    const h = handlers();
    bindUI(h);
    const actions = document.querySelectorAll('.actions button');
    expect(actions.length).toBe(4);
    (actions[0] as HTMLButtonElement).click();
    expect(h.onUndo).toHaveBeenCalled();
  });
});
