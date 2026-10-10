// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createEditorStore } from '../../src/engine/editor-store';
import { EngineProvider } from '../../src/ui/EngineContext';
import { EditSheet } from '../../src/ui/components/EditSheet';
import { TerrainGrid } from '../../src/ui/components/TerrainGrid';
import { ItemGrid } from '../../src/ui/components/ItemGrid';
import { ActionBar } from '../../src/ui/components/ActionBar';
import { DebugPanel } from '../../src/ui/components/DebugPanel';
import { LightDisk } from '../../src/ui/components/LightDisk';
import { BLOCK } from '../../src/core/block-types';
import { diskToLightDir } from '../../src/core/light-direction';
import type { PropModelData } from '../../src/core/prop-types';

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  }
});

afterEach(cleanup);

function makeProps(n: number): PropModelData[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `模型${i}`, icon: `data:image/png;base64,${i}`,
    positions: new Float32Array(0), normals: new Float32Array(0), colors: new Float32Array(0),
    alpha: new Float32Array(0), indices: new Uint16Array(0), footprint: 1, height: 1,
  }));
}

function makeEngine() {
  return {
    setMode: vi.fn(),
    selectBlock: vi.fn(),
    selectTerrainRemove: vi.fn(),
    selectProp: vi.fn(),
    selectItemRemove: vi.fn(),
    undo: vi.fn(),
    reset: vi.fn(),
    saveToAlbum: vi.fn(),
    shareNote: vi.fn(),
    setPerspective: vi.fn(),
    switchAdapter: vi.fn(),
    setAmbient: vi.fn(),
    setDirectional: vi.fn(),
    setLightDir: vi.fn(),
    setTemperature: vi.fn(),
    setLighting: vi.fn(),
  };
}

function renderWith(children: ReactNode, initial: Parameters<typeof createEditorStore>[0] = {}) {
  const store = createEditorStore(initial);
  const engine = makeEngine();
  const result = render(<EngineProvider value={{ engine, store }}>{children}</EngineProvider>);
  return { store, engine, ...result };
}

describe('EditSheet', () => {
  it('is hidden (edit only) until tapped', () => {
    renderWith(<EditSheet propModels={makeProps(3)} />);
    expect(screen.getByRole('button', { name: '编辑' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '撤销' })).toBeNull();
    expect(screen.queryByRole('button', { name: '清空' })).toBeNull();
    expect(screen.queryByRole('tab', { name: '地形' })).toBeNull();
  });

  it('opens the sheet, defaults to 地形, reveals undo/clear, and sets the mode', () => {
    const { engine } = renderWith(<EditSheet propModels={makeProps(3)} />);
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    expect(screen.getByRole('tab', { name: '地形' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '物品' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '撤销' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '清空' })).toBeTruthy();
    expect(engine.setMode).toHaveBeenCalledWith('terrain');
    expect(screen.getByRole('button', { name: '关闭' })).toBeTruthy();
  });

  it('wires undo/clear', () => {
    const { engine } = renderWith(<EditSheet propModels={makeProps(3)} />);
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(engine.undo).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '清空' }));
    expect(engine.reset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    expect(engine.reset).toHaveBeenCalled();
  });

  it('closes back to view mode and hides undo/clear', () => {
    const { engine } = renderWith(<EditSheet propModels={makeProps(3)} />);
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(screen.queryByRole('tab', { name: '地形' })).toBeNull();
    expect(screen.queryByRole('button', { name: '撤销' })).toBeNull();
    expect(engine.setMode).toHaveBeenLastCalledWith('orbit');
  });

  it('switches to the 物品 tab', () => {
    const { engine } = renderWith(<EditSheet propModels={makeProps(3)} />);
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.click(screen.getByRole('tab', { name: '物品' }));
    expect(engine.setMode).toHaveBeenLastCalledWith('item');
    expect(screen.getByRole('button', { name: '删除' })).toBeTruthy();
  });
});

describe('TerrainGrid', () => {
  it('renders six slots (shovel + four blocks + one empty)', () => {
    const { container } = renderWith(<TerrainGrid />);
    expect(container.querySelectorAll('.grid-3 > *').length).toBe(6);
    for (const name of ['铲子', '草地', '泥土', '岩石', '树叶']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('marks only the selected block pressed and selects on click', () => {
    const { engine } = renderWith(<TerrainGrid />, { terrainAction: 'place', currentBlockType: BLOCK.GRASS });
    expect(screen.getByRole('button', { name: '草地' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '岩石' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: '泥土' }));
    expect(engine.selectBlock).toHaveBeenCalledWith(BLOCK.SOIL);
  });

  it('calls selectTerrainRemove from the shovel', () => {
    const { engine } = renderWith(<TerrainGrid />);
    fireEvent.click(screen.getByRole('button', { name: '铲子' }));
    expect(engine.selectTerrainRemove).toHaveBeenCalled();
  });
});

describe('ItemGrid', () => {
  it('shows delete + five props on the first page', () => {
    const { container } = renderWith(<ItemGrid propModels={makeProps(18)} />);
    expect(container.querySelectorAll('.grid-3 > *').length).toBe(6);
    expect(screen.getByRole('button', { name: '删除' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '模型0' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '模型4' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '模型5' })).toBeNull();
  });

  it('selects a prop and paginates to the next page', () => {
    const { engine } = renderWith(<ItemGrid propModels={makeProps(18)} />);
    fireEvent.click(screen.getByRole('button', { name: '模型1' }));
    expect(engine.selectProp).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByRole('button', { name: '模型5' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '模型0' })).toBeNull();
  });

  it('calls selectItemRemove from delete', () => {
    const { engine } = renderWith(<ItemGrid propModels={makeProps(3)} />);
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(engine.selectItemRemove).toHaveBeenCalled();
  });
});

describe('ActionBar', () => {
  it('shows save and share only', () => {
    const { engine } = renderWith(<ActionBar />);
    expect(screen.queryByRole('button', { name: '撤销' })).toBeNull();
    expect(screen.queryByRole('button', { name: '清空' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(engine.saveToAlbum).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '分享' }));
    expect(engine.shareNote).toHaveBeenCalled();
  });
});

describe('DebugPanel', () => {
  it('hides debug controls until toggled', () => {
    renderWith(<DebugPanel />);
    expect(screen.queryByText('透视')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '调试' }));
    expect(screen.getByText('透视')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '调试' }));
    expect(screen.queryByText('透视')).toBeNull();
  });

  it('changes perspective', () => {
    const { engine } = renderWith(<DebugPanel />);
    fireEvent.click(screen.getByRole('button', { name: '调试' }));
    const slider = document.querySelector('.perspective input[type="range"]') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '120' } });
    expect(engine.setPerspective).toHaveBeenCalledWith(120);
  });

  it('shows the adapter select', () => {
    renderWith(<DebugPanel />);
    fireEvent.click(screen.getByRole('button', { name: '调试' }));
    expect(screen.getByText('适配器')).toBeTruthy();
    expect(screen.getByText('自动')).toBeTruthy();
  });

  it('sets ambient and directional independently', () => {
    const { engine } = renderWith(<DebugPanel />);
    fireEvent.click(screen.getByRole('button', { name: '调试' }));
    const ambient = document.querySelector('.ambient input[type="range"]') as HTMLInputElement;
    const directional = document.querySelector('.directional input[type="range"]') as HTMLInputElement;
    fireEvent.change(ambient, { target: { value: '1.2' } });
    expect(engine.setAmbient).toHaveBeenCalledWith(1.2);
    expect(engine.setDirectional).not.toHaveBeenCalled();
    fireEvent.change(directional, { target: { value: '0.2' } });
    expect(engine.setDirectional).toHaveBeenCalledWith(0.2);
    expect(engine.setAmbient).toHaveBeenCalledTimes(1);
  });

  it('changes color temperature', () => {
    const { engine } = renderWith(<DebugPanel />);
    fireEvent.click(screen.getByRole('button', { name: '调试' }));
    const slider = document.querySelector('.temperature input[type="range"]') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '8000' } });
    expect(engine.setTemperature).toHaveBeenCalledWith(8000);
  });

  it('sets exposure through the lighting patch', () => {
    const { engine } = renderWith(<DebugPanel />);
    fireEvent.click(screen.getByRole('button', { name: '调试' }));
    const slider = document.querySelector('.exposure input[type="range"]') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '1.2' } });
    expect(engine.setLighting).toHaveBeenCalledWith({ exposure: 1.2 });
  });
});

describe('LightDisk', () => {
  it('places the knob at center for a top-down light', () => {
    const { container } = render(<LightDisk lightDir={[0, 1, 0]} theta={0} onChange={() => {}} />);
    const knob = container.querySelector('.light-disk-knob') as HTMLElement;
    expect(knob.style.left).toBe('50%');
    expect(knob.style.top).toBe('50%');
  });

  it('drags the light disk in screen space', () => {
    const onChange = vi.fn();
    const { container } = render(<LightDisk lightDir={[0, 1, 0]} theta={Math.PI / 4} onChange={onChange} />);
    const disk = container.querySelector('.light-disk') as HTMLElement;
    disk.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0,
      toJSON() { return {}; },
    }) as DOMRect;
    disk.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 50, bubbles: true }));
    const expected = diskToLightDir(1, 0, Math.PI / 4);
    expect(onChange).toHaveBeenCalledTimes(1);
    const dir = onChange.mock.calls[0][0] as [number, number, number];
    expect(dir[0]).toBeCloseTo(expected[0], 5);
    expect(dir[1]).toBeCloseTo(expected[1], 5);
    expect(dir[2]).toBeCloseTo(expected[2], 5);
  });
});
