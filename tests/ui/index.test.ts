// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bindUI } from '../../src/ui';
import { BLOCK } from '../../src/core/block-types';
import type { PropModelData } from '../../src/core/prop-types';

const PROPS: PropModelData[] = [0, 1, 2].map((i) => ({
  name: `模型${i}`, icon: `data:image/png;base64,${i}`,
  positions: new Float32Array(0), normals: new Float32Array(0), colors: new Float32Array(0),
  indices: new Uint16Array(0), footprint: 1, height: 1,
}));

beforeEach(() => { document.body.innerHTML = '<div id="ui-root"></div>'; });

function handlers() {
  return {
    onModeChange: vi.fn(), onBlockSelect: vi.fn(), onPresetSelect: vi.fn(),
    onPropSelect: vi.fn(),
    onUndo: vi.fn(), onReset: vi.fn(), onSaveAlbum: vi.fn(), onShareNote: vi.fn(),
    onPerspectiveChange: vi.fn(), onAdapterChange: vi.fn(), onLightingChange: vi.fn(),
    onTemperatureChange: vi.fn(),
  };
}

describe('bindUI', () => {
  it('renders three mode buttons and switches mode on click', () => {
    const h = handlers();
    bindUI(h, PROPS);
    const modes = document.querySelectorAll('.mode-btn');
    expect(modes.length).toBe(3);
    (modes[1] as HTMLButtonElement).click();
    expect(h.onModeChange).toHaveBeenCalledWith('place');
  });
  it('selects a block type from the palette', () => {
    const h = handlers();
    bindUI(h, PROPS);
    (document.querySelectorAll('.palette-item')[0] as HTMLButtonElement).click();
    expect(h.onBlockSelect).toHaveBeenCalledWith(BLOCK.GRASS);
  });
  it('selects a preset from the palette', () => {
    const h = handlers();
    bindUI(h, PROPS);
    (document.querySelector('.palette-item[title="花丛"]') as HTMLButtonElement).click();
    expect(h.onPresetSelect).toHaveBeenCalled();
  });
  it('renders a prop group with icons', () => {
    const h = handlers();
    bindUI(h, PROPS);
    const items = document.querySelectorAll('.props-group .palette-item');
    expect(items.length).toBe(3);
    for (const it of items) {
      const img = it.querySelector('img');
      expect(img?.src.startsWith('data:image/png;base64,')).toBe(true);
    }
  });
  it('selects a prop model and keeps selection exclusive across groups', () => {
    const h = handlers();
    bindUI(h, PROPS);
    (document.querySelector('.palette-item[title="草地"]') as HTMLButtonElement).click();
    (document.querySelectorAll('.props-group .palette-item')[1] as HTMLButtonElement).click();
    expect(h.onPropSelect).toHaveBeenCalledWith(1);
    expect(h.onBlockSelect).toHaveBeenCalledWith(1); // 先点过方块
    const active = document.querySelectorAll('.palette-item.active');
    expect(active.length).toBe(1);
    expect((active[0] as HTMLElement).title).toBe('模型1');
  });
  it('shows the palette only in place mode', () => {
    const h = handlers();
    bindUI(h, PROPS);
    const palette = document.querySelector('.palette') as HTMLElement;
    expect(palette.style.display).toBe('none');
    (document.querySelectorAll('.mode-btn')[1] as HTMLButtonElement).click();
    expect(palette.style.display).not.toBe('none');
    (document.querySelectorAll('.mode-btn')[0] as HTMLButtonElement).click();
    expect(palette.style.display).toBe('none');
  });
  it('changes perspective via the slider', () => {
    const h = handlers();
    bindUI(h, PROPS);
    const slider = document.querySelector('.perspective input[type="range"]') as HTMLInputElement;
    expect(slider).toBeTruthy();
    slider.value = '120';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(h.onPerspectiveChange).toHaveBeenCalledWith(120);
  });
  it('changes adapter via the select', () => {
    const h = handlers();
    bindUI(h, PROPS);
    const sel = document.querySelector('.adapter-select') as HTMLSelectElement;
    expect(sel).toBeTruthy();
    sel.value = 'webgl';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(h.onAdapterChange).toHaveBeenCalledWith('webgl');
  });
  it('changes global lighting via the slider', () => {
    const h = handlers();
    bindUI(h, PROPS);
    const slider = document.querySelector('.lighting input[type="range"]') as HTMLInputElement;
    expect(slider).toBeTruthy();
    slider.value = '1.6';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(h.onLightingChange).toHaveBeenCalledWith(1.6);
  });
  it('changes color temperature via the slider', () => {
    const h = handlers();
    bindUI(h, PROPS);
    const slider = document.querySelector('.temperature input[type="range"]') as HTMLInputElement;
    expect(slider).toBeTruthy();
    slider.value = '8000';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(h.onTemperatureChange).toHaveBeenCalledWith(8000);
  });
  it('wires the four action buttons', () => {
    const h = handlers();
    bindUI(h, PROPS);
    const actions = document.querySelectorAll('.actions button');
    expect(actions.length).toBe(4);
    (actions[0] as HTMLButtonElement).click();
    expect(h.onUndo).toHaveBeenCalled();
  });
});
