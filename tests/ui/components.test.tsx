// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { Profiler, type ReactNode } from 'react';
import { createEditorStore } from '../../src/engine/editor-store';
import { EngineProvider } from '../../src/ui/EngineContext';
import { ModeBar } from '../../src/ui/components/ModeBar';
import { ActionBar } from '../../src/ui/components/ActionBar';
import { Palette } from '../../src/ui/components/Palette';
import { DebugPanel } from '../../src/ui/components/DebugPanel';
import { LightDisk } from '../../src/ui/components/LightDisk';
import { BLOCK } from '../../src/core/block-types';
import { diskToLightDir } from '../../src/core/light-direction';
import type { PropModelData } from '../../src/core/prop-types';

afterEach(cleanup);

const PROPS: PropModelData[] = [0, 1, 2].map((i) => ({
  name: `模型${i}`, icon: `data:image/png;base64,${i}`,
  positions: new Float32Array(0), normals: new Float32Array(0), colors: new Float32Array(0),
  alpha: new Float32Array(0), indices: new Uint16Array(0), footprint: 1, height: 1,
}));

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
  };
}

function renderWith(children: ReactNode) {
  const store = createEditorStore();
  const engine = makeEngine();
  const result = render(<EngineProvider value={{ engine, store }}>{children}</EngineProvider>);
  return { store, engine, ...result };
}

describe('ModeBar', () => {
  it('renders three tabs with orbit active by default', () => {
    renderWith(<ModeBar />);
    expect(screen.getByText('旋转').className).toContain('active');
    expect(screen.getByText('地形').className).not.toContain('active');
    expect(screen.getByText('物品').className).not.toContain('active');
  });

  it('switches mode via engine.setMode', () => {
    const { engine } = renderWith(<ModeBar />);
    fireEvent.click(screen.getByText('地形'));
    expect(engine.setMode).toHaveBeenCalledWith('terrain');
  });

  it('does not re-render when an unrelated state field changes', () => {
    const store = createEditorStore();
    const engine = makeEngine();
    let renders = 0;
    render(
      <EngineProvider value={{ engine, store }}>
        <Profiler id="mode" onRender={() => { renders += 1; }}>
          <ModeBar />
        </Profiler>
      </EngineProvider>,
    );
    const afterMount = renders;
    act(() => store.setState({ viewTheta: 1.23 }));
    expect(renders).toBe(afterMount);
  });
});

describe('Palette', () => {
  it('renders nothing in orbit mode', () => {
    const { container } = renderWith(<Palette propModels={PROPS} />);
    expect(container.querySelector('.palette')).toBeNull();
  });

  it('renders the shovel ahead of the four terrain blocks', () => {
    const { store } = renderWith(<Palette propModels={PROPS} />);
    act(() => store.setState({ mode: 'terrain' }));
    const titles = Array.from(document.querySelectorAll('.terrain-group .palette-item'))
      .map((el) => (el as HTMLElement).title);
    expect(titles).toEqual(['铲子', '草地', '泥土', '岩石', '树叶']);
  });

  it('selects a block type', () => {
    const { store, engine } = renderWith(<Palette propModels={PROPS} />);
    act(() => store.setState({ mode: 'terrain' }));
    fireEvent.click(screen.getByTitle('泥土'));
    expect(engine.selectBlock).toHaveBeenCalledWith(BLOCK.SOIL);
  });

  it('calls selectTerrainRemove from the shovel', () => {
    const { store, engine } = renderWith(<Palette propModels={PROPS} />);
    act(() => store.setState({ mode: 'terrain' }));
    fireEvent.click(screen.getByTitle('铲子'));
    expect(engine.selectTerrainRemove).toHaveBeenCalled();
  });

  it('puts delete ahead of the prop icons and selects a model', () => {
    const { store, engine } = renderWith(<Palette propModels={PROPS} />);
    act(() => store.setState({ mode: 'item' }));
    const items = document.querySelectorAll('.props-group .palette-item');
    expect((items[0] as HTMLElement).title).toBe('删除');
    expect(items.length).toBe(4);
    for (const it of Array.from(items).slice(1)) {
      expect(it.querySelector('img')?.src.startsWith('data:image/png;base64,')).toBe(true);
    }
    fireEvent.click(screen.getByTitle('模型1'));
    expect(engine.selectProp).toHaveBeenCalledWith(1);
  });

  it('marks only the selected block active in terrain mode', () => {
    const { store } = renderWith(<Palette propModels={PROPS} />);
    act(() => store.setState({ mode: 'terrain', terrainAction: 'place', currentBlockType: BLOCK.GRASS }));
    const active = document.querySelectorAll('.palette-item.active');
    expect(active.length).toBe(1);
    expect((active[0] as HTMLElement).title).toBe('草地');
  });
});

describe('ActionBar', () => {
  it('wires the four action buttons', () => {
    const { engine } = renderWith(<ActionBar />);
    const actions = document.querySelectorAll('.actions button');
    expect(actions.length).toBe(4);
    fireEvent.click(screen.getByText('撤销'));
    expect(engine.undo).toHaveBeenCalled();
    fireEvent.click(screen.getByText('清空'));
    expect(engine.reset).toHaveBeenCalled();
    fireEvent.click(screen.getByText('保存'));
    expect(engine.saveToAlbum).toHaveBeenCalled();
    fireEvent.click(screen.getByText('分享'));
    expect(engine.shareNote).toHaveBeenCalled();
  });
});

describe('DebugPanel', () => {
  it('hides debug controls until the debug button is toggled', () => {
    renderWith(<DebugPanel />);
    expect(screen.queryByText('透视')).toBeNull();
    fireEvent.click(screen.getByText('调试'));
    expect(screen.getByText('透视')).toBeTruthy();
    expect(screen.getByText('调试').className).toContain('active');
    fireEvent.click(screen.getByText('调试'));
    expect(screen.queryByText('透视')).toBeNull();
  });

  it('changes perspective and adapter', () => {
    const { engine } = renderWith(<DebugPanel />);
    fireEvent.click(screen.getByText('调试'));
    const slider = document.querySelector('.perspective input[type="range"]') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '120' } });
    expect(engine.setPerspective).toHaveBeenCalledWith(120);
    const sel = document.querySelector('.adapter-select') as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: 'webgl' } });
    expect(engine.switchAdapter).toHaveBeenCalledWith('webgl');
  });

  it('sets ambient and directional independently', () => {
    const { engine } = renderWith(<DebugPanel />);
    fireEvent.click(screen.getByText('调试'));
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
    fireEvent.click(screen.getByText('调试'));
    const slider = document.querySelector('.temperature input[type="range"]') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '8000' } });
    expect(engine.setTemperature).toHaveBeenCalledWith(8000);
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
