// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bindUI } from '../../src/ui';
import { diskToLightDir } from '../../src/core/light-direction';
import { BLOCK } from '../../src/core/block-types';
import type { PropModelData } from '../../src/core/prop-types';

const PROPS: PropModelData[] = [0, 1, 2].map((i) => ({
  name: `模型${i}`, icon: `data:image/png;base64,${i}`,
  positions: new Float32Array(0), normals: new Float32Array(0), colors: new Float32Array(0),
  alpha: new Float32Array(0), indices: new Uint16Array(0), footprint: 1, height: 1,
}));

beforeEach(() => { document.body.innerHTML = '<div id="ui-root"></div>'; });

function handlers() {
  return {
    onModeChange: vi.fn(), onBlockSelect: vi.fn(), onTerrainRemove: vi.fn(),
    onPropSelect: vi.fn(), onItemRemove: vi.fn(),
    onUndo: vi.fn(), onReset: vi.fn(), onSaveAlbum: vi.fn(), onShareNote: vi.fn(),
    onPerspectiveChange: vi.fn(), onAdapterChange: vi.fn(),
    onAmbientChange: vi.fn(), onDirectionalChange: vi.fn(),
    onLightDirChange: vi.fn(), onTemperatureChange: vi.fn(),
  };
}

describe('bindUI', () => {
  it('renders three tabs and opens the terrain palette', () => {
    const h = handlers();
    bindUI(h, PROPS);
    const modes = document.querySelectorAll('.mode-btn');
    expect(Array.from(modes).map((b) => b.textContent)).toEqual(['旋转', '地形', '物品']);
    (modes[1] as HTMLButtonElement).click();
    expect(h.onModeChange).toHaveBeenCalledWith('terrain');
    expect((document.querySelector('.palette') as HTMLElement).style.display).not.toBe('none');
    expect((document.querySelector('.terrain-group') as HTMLElement).style.display).not.toBe('none');
    expect((document.querySelector('.props-group') as HTMLElement).style.display).toBe('none');
  });
  it('selects a block type from the palette', () => {
    const h = handlers();
    bindUI(h, PROPS);
    (document.querySelector('.palette-item[title="草地"]') as HTMLButtonElement).click();
    expect(h.onBlockSelect).toHaveBeenCalledWith(BLOCK.GRASS);
  });
  it('puts a shovel in front of the four terrain blocks', () => {
    const h = handlers();
    bindUI(h, PROPS);
    const titles = Array.from(document.querySelectorAll('.terrain-group .palette-item'))
      .map((el) => (el as HTMLElement).title);
    expect(titles).toEqual(['铲子', '草地', '泥土', '岩石', '树叶']);
    expect(document.querySelector('.palette-group-label')).toBeNull();
    (document.querySelector('.palette-item[title="铲子"]') as HTMLButtonElement).click();
    expect(h.onTerrainRemove).toHaveBeenCalled();
    (document.querySelector('.palette-item[title="树叶"]') as HTMLButtonElement).click();
    expect(h.onBlockSelect).toHaveBeenCalledWith(BLOCK.LEAF);
  });
  it('hides debug controls until the debug button is toggled', () => {
    bindUI(handlers(), PROPS);
    const panel = document.querySelector('.debug-panel') as HTMLElement;
    const btn = document.querySelector('.debug-toggle') as HTMLButtonElement;
    expect(panel.hidden).toBe(true);
    btn.click();
    expect(panel.hidden).toBe(false);
    expect(btn.classList.contains('active')).toBe(true);
    btn.click();
    expect(panel.hidden).toBe(true);
    expect(btn.classList.contains('active')).toBe(false);
  });
  it('puts delete in front of the prop icons', () => {
    const h = handlers();
    bindUI(h, PROPS);
    const items = document.querySelectorAll('.props-group .palette-item');
    expect((items[0] as HTMLElement).title).toBe('删除');
    expect(items.length).toBe(4);
    for (const it of Array.from(items).slice(1)) {
      const img = it.querySelector('img');
      expect(img?.src.startsWith('data:image/png;base64,')).toBe(true);
    }
    (items[0] as HTMLButtonElement).click();
    expect(h.onItemRemove).toHaveBeenCalled();
  });
  it('selects a prop model and keeps selection exclusive across groups', () => {
    const h = handlers();
    bindUI(h, PROPS);
    (document.querySelector('.palette-item[title="草地"]') as HTMLButtonElement).click();
    (document.querySelector('.palette-item[title="模型1"]') as HTMLButtonElement).click();
    expect(h.onPropSelect).toHaveBeenCalledWith(1);
    expect(h.onBlockSelect).toHaveBeenCalledWith(BLOCK.GRASS);
    const active = document.querySelectorAll('.palette-item.active');
    expect(active.length).toBe(1);
    expect((active[0] as HTMLElement).title).toBe('模型1');
  });
  it('shows the matching palette for terrain and item tabs', () => {
    const h = handlers();
    bindUI(h, PROPS);
    const palette = document.querySelector('.palette') as HTMLElement;
    const modes = document.querySelectorAll('.mode-btn');
    expect(palette.style.display).toBe('none');
    (modes[1] as HTMLButtonElement).click();
    expect(palette.style.display).not.toBe('none');
    expect((document.querySelector('.props-group') as HTMLElement).style.display).toBe('none');
    (modes[2] as HTMLButtonElement).click();
    expect(h.onModeChange).toHaveBeenCalledWith('item');
    expect((document.querySelector('.terrain-group') as HTMLElement).style.display).toBe('none');
    expect((document.querySelector('.props-group') as HTMLElement).style.display).not.toBe('none');
    (modes[0] as HTMLButtonElement).click();
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
  it('sets ambient and directional intensity independently', () => {
    const h = handlers();
    bindUI(h, PROPS);
    const ambient = document.querySelector('.ambient input[type="range"]') as HTMLInputElement;
    const directional = document.querySelector('.directional input[type="range"]') as HTMLInputElement;
    ambient.value = '1.2';
    ambient.dispatchEvent(new Event('input', { bubbles: true }));
    expect(h.onAmbientChange).toHaveBeenCalledWith(1.2);
    expect(h.onDirectionalChange).not.toHaveBeenCalled();
    directional.value = '0.2';
    directional.dispatchEvent(new Event('input', { bubbles: true }));
    expect(h.onDirectionalChange).toHaveBeenCalledWith(0.2);
    expect(h.onAmbientChange).toHaveBeenCalledTimes(1);
  });
  it('drags the light disk in screen space', () => {
    const h = handlers();
    const diskUi = bindUI(h, PROPS);
    const disk = document.querySelector('.light-disk') as HTMLElement;
    disk.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() { return {}; },
    });
    const down = (x: number, y: number): void => {
      disk.dispatchEvent(new MouseEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
    };
    down(50, 50);
    expect(h.onLightDirChange).toHaveBeenLastCalledWith([0, 1, 0]);
    down(100, 50);
    const dir = h.onLightDirChange.mock.calls.at(-1)?.[0] as [number, number, number];
    const expected = diskToLightDir(1, 0, Math.PI / 4);
    expect(dir[0]).toBeCloseTo(expected[0], 5);
    expect(dir[1]).toBeCloseTo(expected[1], 5);
    expect(dir[2]).toBeCloseTo(expected[2], 5);
    expect(h.onAmbientChange).not.toHaveBeenCalled();
    expect(h.onDirectionalChange).not.toHaveBeenCalled();
    expect(dir[0]).not.toBeCloseTo(Math.sin(80 * Math.PI / 180), 1);
    diskUi.setViewTheta(Math.PI / 4 + Math.PI / 2);
    diskUi.setLightDisk(0, -1);
    const knob = document.querySelector('.light-disk-knob') as HTMLElement;
    expect(knob.style.left).toBe('50%');
    expect(knob.style.top).toBe('0%');
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
