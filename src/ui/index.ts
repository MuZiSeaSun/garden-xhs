import { BLOCK } from '../core/block-types';
import { diskToLightDir } from '../core/light-direction';
import { DEFAULT_AMBIENT, DEFAULT_DIRECTIONAL } from '../rendering/renderer-api';
import type { PropModelData } from '../core/prop-types';

export type EditorMode = 'orbit' | 'terrain' | 'item';

export interface UIHandlers {
  onModeChange(mode: EditorMode): void;
  onBlockSelect(type: number): void;
  onTerrainRemove(): void;
  onPropSelect(modelId: number): void;
  onItemRemove(): void;
  onUndo(): void;
  onReset(): void;
  onSaveAlbum(): void;
  onShareNote(): void;
  onPerspectiveChange(distance: number): void;
  onAdapterChange(name: string): void;
  onAmbientChange(ambient: number): void;
  onDirectionalChange(directional: number): void;
  onLightDirChange(dir: readonly [number, number, number]): void;
  onTemperatureChange(kelvin: number): void;
}

export interface LightDiskControls {
  setLightDisk(nx: number, ny: number): void;
  setViewTheta(theta: number): void;
}

interface PaletteItem {
  readonly icon: string;
  readonly name: string;
  readonly type: number;
}

const PALETTE_ITEMS: readonly PaletteItem[] = [
  { icon: '🌱', name: '草地', type: BLOCK.GRASS },
  { icon: '🟫', name: '泥土', type: BLOCK.SOIL },
  { icon: '⬜', name: '岩石', type: BLOCK.STONE },
  { icon: '🍃', name: '树叶', type: BLOCK.LEAF },
];

export function bindUI(handlers: UIHandlers, propModels: readonly PropModelData[]): LightDiskControls {
  const root = document.getElementById('ui-root');
  if (!root) return { setLightDisk() {}, setViewTheta() {} };

  const modeGroup = document.createElement('div');
  modeGroup.className = 'mode-group';

  const palette = document.createElement('div');
  palette.className = 'palette';
  palette.style.display = 'none';

  const blocksGroup = document.createElement('div');
  blocksGroup.className = 'palette-group terrain-group';
  const propsGroup = document.createElement('div');
  propsGroup.className = 'palette-group props-group';

  const showPalette = (mode: EditorMode): void => {
    palette.style.display = mode === 'orbit' ? 'none' : '';
    blocksGroup.style.display = mode === 'terrain' ? '' : 'none';
    propsGroup.style.display = mode === 'item' ? '' : 'none';
  };

  (['orbit', 'terrain', 'item'] as const).forEach((mode, i) => {
    const btn = document.createElement('button');
    btn.className = 'mode-btn' + (i === 0 ? ' active' : '');
    btn.textContent = mode === 'orbit' ? '旋转' : mode === 'terrain' ? '地形' : '物品';
    btn.addEventListener('click', () => {
      modeGroup.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showPalette(mode);
      handlers.onModeChange(mode);
    });
    modeGroup.appendChild(btn);
  });

  const clearActive = (): void => {
    palette.querySelectorAll('.palette-item').forEach((b) => b.classList.remove('active'));
  };

  const shovel = document.createElement('button');
  shovel.className = 'palette-item';
  shovel.textContent = '🪣';
  shovel.title = '铲子';
  shovel.addEventListener('click', () => {
    clearActive();
    shovel.classList.add('active');
    handlers.onTerrainRemove();
  });
  blocksGroup.appendChild(shovel);
  PALETTE_ITEMS.forEach((item) => {
    const btn = document.createElement('button');
    btn.className = 'palette-item';
    btn.textContent = item.icon;
    btn.title = item.name;
    btn.addEventListener('click', () => {
      clearActive();
      btn.classList.add('active');
      handlers.onBlockSelect(item.type);
    });
    blocksGroup.appendChild(btn);
  });

  const itemRemove = document.createElement('button');
  itemRemove.className = 'palette-item';
  itemRemove.textContent = '🗑️';
  itemRemove.title = '删除';
  itemRemove.addEventListener('click', () => {
    clearActive();
    itemRemove.classList.add('active');
    handlers.onItemRemove();
  });
  propsGroup.appendChild(itemRemove);
  propModels.forEach((m, modelId) => {
    const btn = document.createElement('button');
    btn.className = 'palette-item';
    btn.title = m.name;
    const img = document.createElement('img');
    img.src = m.icon;
    img.alt = m.name;
    img.draggable = false;
    btn.appendChild(img);
    btn.addEventListener('click', () => {
      clearActive();
      btn.classList.add('active');
      handlers.onPropSelect(modelId);
    });
    propsGroup.appendChild(btn);
  });

  palette.appendChild(blocksGroup);
  palette.appendChild(propsGroup);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const actionDefs: Array<[string, () => void]> = [
    ['撤销', handlers.onUndo],
    ['清空', handlers.onReset],
    ['保存', handlers.onSaveAlbum],
    ['分享', handlers.onShareNote],
  ];
  actionDefs.forEach(([label, fn]) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.addEventListener('click', fn);
    actions.appendChild(btn);
  });

  const perspective = document.createElement('div');
  perspective.className = 'perspective';
  const pLabel = document.createElement('span');
  pLabel.className = 'perspective-label';
  pLabel.textContent = '透视';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '60';
  slider.max = '500';
  slider.step = '10';
  slider.value = '200';
  const pValue = document.createElement('span');
  pValue.className = 'perspective-value';
  pValue.textContent = slider.value;
  slider.addEventListener('input', () => {
    pValue.textContent = slider.value;
    handlers.onPerspectiveChange(Number(slider.value));
  });
  perspective.appendChild(pLabel);
  perspective.appendChild(slider);
  perspective.appendChild(pValue);

  const adapterRow = document.createElement('div');
  adapterRow.className = 'control-row';
  const aLabel = document.createElement('span');
  aLabel.textContent = '适配器';
  const select = document.createElement('select');
  select.className = 'adapter-select';
  ([['auto', '自动'], ['three', 'Three'], ['webgl', 'WebGL']] as const).forEach(([value, text]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => handlers.onAdapterChange(select.value));
  adapterRow.appendChild(aLabel);
  adapterRow.appendChild(select);

  const intensityRow = (className: string, label: string, initial: number, onChange: (value: number) => void): HTMLDivElement => {
    const row = document.createElement('div');
    row.className = `control-row ${className}`;
    const name = document.createElement('span');
    name.textContent = label;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '2';
    slider.step = '0.02';
    slider.value = String(initial);
    const value = document.createElement('span');
    value.className = 'lighting-value';
    value.textContent = initial.toFixed(2);
    slider.addEventListener('input', () => {
      const next = Number(slider.value);
      value.textContent = next.toFixed(2);
      onChange(next);
    });
    row.appendChild(name);
    row.appendChild(slider);
    row.appendChild(value);
    return row;
  };
  const ambientRow = intensityRow('ambient', '环境光', DEFAULT_AMBIENT, (value) => handlers.onAmbientChange(value));
  const directionalRow = intensityRow('directional', '方向光', DEFAULT_DIRECTIONAL, (value) => handlers.onDirectionalChange(value));

  const angleRow = document.createElement('div');
  angleRow.className = 'control-row light-angle';
  const angleLabel = document.createElement('span');
  angleLabel.textContent = '角度';
  const disk = document.createElement('div');
  disk.className = 'light-disk';
  const knob = document.createElement('div');
  knob.className = 'light-disk-knob';
  disk.appendChild(knob);
  let viewTheta = Math.PI / 4;
  const placeKnob = (nx: number, ny: number): void => {
    knob.style.left = `${(nx + 1) * 50}%`;
    knob.style.top = `${(ny + 1) * 50}%`;
  };
  const pointFromEvent = (e: PointerEvent): { nx: number; ny: number } => {
    const rect = disk.getBoundingClientRect();
    let nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    let ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    const len = Math.hypot(nx, ny);
    if (len > 1) { nx /= len; ny /= len; }
    return { nx, ny };
  };
  const drag = (e: PointerEvent): void => {
    const { nx, ny } = pointFromEvent(e);
    placeKnob(nx, ny);
    handlers.onLightDirChange(diskToLightDir(nx, ny, viewTheta));
  };
    disk.addEventListener('pointerdown', (e) => {
      if (typeof e.pointerId === 'number') disk.setPointerCapture?.(e.pointerId);
      drag(e);
    });
  disk.addEventListener('pointermove', (e) => {
    if (!disk.hasPointerCapture?.(e.pointerId)) return;
    drag(e);
  });
  placeKnob(0, 0);
  angleRow.appendChild(angleLabel);
  angleRow.appendChild(disk);

  const tempRow = document.createElement('div');
  tempRow.className = 'control-row temperature';
  const tLabel = document.createElement('span');
  tLabel.textContent = '色温';
  const tSlider = document.createElement('input');
  tSlider.type = 'range';
  tSlider.min = '1500';
  tSlider.max = '20000';
  tSlider.step = '100';
  tSlider.value = '5000';
  const tValue = document.createElement('span');
  tValue.className = 'lighting-value';
  tValue.textContent = tSlider.value + 'K';
  tSlider.addEventListener('input', () => {
    tValue.textContent = tSlider.value + 'K';
    handlers.onTemperatureChange(Number(tSlider.value));
  });
  tempRow.appendChild(tLabel);
  tempRow.appendChild(tSlider);
  tempRow.appendChild(tValue);

  const debugBar = document.createElement('div');
  debugBar.className = 'debug-bar';
  const debugBtn = document.createElement('button');
  debugBtn.type = 'button';
  debugBtn.className = 'debug-toggle';
  debugBtn.textContent = '调试';
  const debugPanel = document.createElement('div');
  debugPanel.className = 'debug-panel';
  debugPanel.hidden = true;
  debugPanel.appendChild(perspective);
  debugPanel.appendChild(adapterRow);
  debugPanel.appendChild(ambientRow);
  debugPanel.appendChild(directionalRow);
  debugPanel.appendChild(angleRow);
  debugPanel.appendChild(tempRow);
  debugBtn.addEventListener('click', () => {
    const open = debugPanel.hidden;
    debugPanel.hidden = !open;
    debugBtn.classList.toggle('active', open);
  });
  debugBar.appendChild(debugBtn);
  debugBar.appendChild(debugPanel);

  root.appendChild(debugBar);
  root.appendChild(modeGroup);
  root.appendChild(palette);
  root.appendChild(actions);
  return {
    setLightDisk: placeKnob,
    setViewTheta: (theta) => { viewTheta = theta; },
  };
}
