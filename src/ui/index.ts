import { BLOCK } from '../core/block-types';
import type { PropModelData } from '../core/prop-types';

export type EditorMode = 'orbit' | 'place' | 'remove';

export interface UIHandlers {
  onModeChange(mode: EditorMode): void;
  onBlockSelect(type: number): void;
  onPresetSelect(key: string): void;
  onPropSelect(modelId: number): void;
  onUndo(): void;
  onReset(): void;
  onSaveAlbum(): void;
  onShareNote(): void;
  onPerspectiveChange(distance: number): void;
  onAdapterChange(name: string): void;
  onLightingChange(exposure: number): void;
  onTemperatureChange(kelvin: number): void;
}

interface PaletteItem {
  readonly icon: string;
  readonly name: string;
  readonly type?: number;
  readonly preset?: string;
}

const PALETTE_ITEMS: readonly PaletteItem[] = [
  { icon: '🌱', name: '草地', type: BLOCK.GRASS },
  { icon: '🟫', name: '泥土', type: BLOCK.SOIL },
  { icon: '⬜', name: '石头', type: BLOCK.STONE },
  { icon: '💧', name: '水',   type: BLOCK.WATER },
  { icon: '🌹', name: '红花', type: BLOCK.FLOWER_RED },
  { icon: '🌻', name: '黄花', type: BLOCK.FLOWER_YELLOW },
  { icon: '🌿', name: '灌木', type: BLOCK.BUSH },
  { icon: '🌳', name: '小树', preset: 'tree' },
  { icon: '💐', name: '花丛', preset: 'flowerBed' },
];

export function bindUI(handlers: UIHandlers, propModels: readonly PropModelData[]): void {
  const root = document.getElementById('ui-root');
  if (!root) return;

  const modeGroup = document.createElement('div');
  modeGroup.className = 'mode-group';

  const palette = document.createElement('div');
  palette.className = 'palette';
  palette.style.display = 'none';

  (['orbit', 'place', 'remove'] as const).forEach((mode, i) => {
    const btn = document.createElement('button');
    btn.className = 'mode-btn' + (i === 0 ? ' active' : '');
    btn.textContent = mode === 'orbit' ? '旋转' : mode === 'place' ? '放置' : '删除';
    btn.addEventListener('click', () => {
      modeGroup.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      palette.style.display = mode === 'place' ? '' : 'none';
      handlers.onModeChange(mode);
    });
    modeGroup.appendChild(btn);
  });

  const clearActive = (): void => {
    palette.querySelectorAll('.palette-item').forEach((b) => b.classList.remove('active'));
  };

  const blocksGroup = document.createElement('div');
  blocksGroup.className = 'palette-group';
  PALETTE_ITEMS.forEach((item) => {
    const btn = document.createElement('button');
    btn.className = 'palette-item';
    btn.textContent = item.icon;
    btn.title = item.name;
    btn.addEventListener('click', () => {
      clearActive();
      btn.classList.add('active');
      if (item.type !== undefined) handlers.onBlockSelect(item.type);
      if (item.preset) handlers.onPresetSelect(item.preset);
    });
    blocksGroup.appendChild(btn);
  });

  const propsGroup = document.createElement('div');
  propsGroup.className = 'palette-group props-group';
  const label = document.createElement('span');
  label.className = 'palette-group-label';
  label.textContent = '模型';
  propsGroup.appendChild(label);
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

  const lightRow = document.createElement('div');
  lightRow.className = 'control-row lighting';
  const lLabel = document.createElement('span');
  lLabel.textContent = '光照';
  const lSlider = document.createElement('input');
  lSlider.type = 'range';
  lSlider.min = '0.5';
  lSlider.max = '2';
  lSlider.step = '0.1';
  lSlider.value = '1.3';
  const lValue = document.createElement('span');
  lValue.className = 'lighting-value';
  lValue.textContent = lSlider.value;
  lSlider.addEventListener('input', () => {
    lValue.textContent = lSlider.value;
    handlers.onLightingChange(Number(lSlider.value));
  });
  lightRow.appendChild(lLabel);
  lightRow.appendChild(lSlider);
  lightRow.appendChild(lValue);

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

  root.appendChild(modeGroup);
  root.appendChild(palette);
  root.appendChild(actions);
  root.appendChild(perspective);
  root.appendChild(adapterRow);
  root.appendChild(lightRow);
  root.appendChild(tempRow);
}
