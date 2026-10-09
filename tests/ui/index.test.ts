// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bindUI } from '../../src/ui';
import { BLOCK } from '../../src/core/block-types';

beforeEach(() => { document.body.innerHTML = '<div id="ui-root"></div>'; });

function handlers() {
  return {
    onModeChange: vi.fn(), onBlockSelect: vi.fn(), onPresetSelect: vi.fn(),
    onUndo: vi.fn(), onReset: vi.fn(), onSaveAlbum: vi.fn(), onShareNote: vi.fn(),
    onPerspectiveChange: vi.fn(), onAdapterChange: vi.fn(), onLightingChange: vi.fn(),
    onTemperatureChange: vi.fn(),
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
  it('shows the palette only in place mode', () => {
    const h = handlers();
    bindUI(h);
    const palette = document.querySelector('.palette') as HTMLElement;
    expect(palette.style.display).toBe('none');
    (document.querySelectorAll('.mode-btn')[1] as HTMLButtonElement).click();
    expect(palette.style.display).not.toBe('none');
    (document.querySelectorAll('.mode-btn')[0] as HTMLButtonElement).click();
    expect(palette.style.display).toBe('none');
  });
  it('changes perspective via the slider', () => {
    const h = handlers();
    bindUI(h);
    const slider = document.querySelector('.perspective input[type="range"]') as HTMLInputElement;
    expect(slider).toBeTruthy();
    slider.value = '120';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(h.onPerspectiveChange).toHaveBeenCalledWith(120);
  });
  it('changes adapter via the select', () => {
    const h = handlers();
    bindUI(h);
    const sel = document.querySelector('.adapter-select') as HTMLSelectElement;
    expect(sel).toBeTruthy();
    sel.value = 'webgl';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(h.onAdapterChange).toHaveBeenCalledWith('webgl');
  });
  it('changes global lighting via the slider', () => {
    const h = handlers();
    bindUI(h);
    const slider = document.querySelector('.lighting input[type="range"]') as HTMLInputElement;
    expect(slider).toBeTruthy();
    slider.value = '1.6';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(h.onLightingChange).toHaveBeenCalledWith(1.6);
  });
  it('changes color temperature via the slider', () => {
    const h = handlers();
    bindUI(h);
    const slider = document.querySelector('.temperature input[type="range"]') as HTMLInputElement;
    expect(slider).toBeTruthy();
    slider.value = '8000';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(h.onTemperatureChange).toHaveBeenCalledWith(8000);
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
