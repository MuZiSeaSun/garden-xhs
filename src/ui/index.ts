import { BLOCK } from '../core/block-types';

export type EditorMode = 'orbit' | 'place' | 'remove';

export interface UIHandlers {
  onModeChange(mode: EditorMode): void;
  onBlockSelect(type: number): void;
  onPresetSelect(key: string): void;
  onUndo(): void;
  onReset(): void;
  onSaveAlbum(): void;
  onShareNote(): void;
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

export function bindUI(handlers: UIHandlers): void {
  const root = document.getElementById('ui-root');
  if (!root) return;

  const modeGroup = document.createElement('div');
  modeGroup.className = 'mode-group';
  (['orbit', 'place', 'remove'] as const).forEach((mode, i) => {
    const btn = document.createElement('button');
    btn.className = 'mode-btn' + (i === 0 ? ' active' : '');
    btn.textContent = mode === 'orbit' ? '旋转' : mode === 'place' ? '放置' : '删除';
    btn.addEventListener('click', () => {
      modeGroup.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      handlers.onModeChange(mode);
    });
    modeGroup.appendChild(btn);
  });
  root.appendChild(modeGroup);

  const palette = document.createElement('div');
  palette.className = 'palette';
  PALETTE_ITEMS.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'palette-item';
    btn.textContent = item.icon;
    btn.title = item.name;
    btn.addEventListener('click', () => {
      palette.querySelectorAll('.palette-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (item.type !== undefined) handlers.onBlockSelect(item.type);
      if (item.preset) handlers.onPresetSelect(item.preset);
    });
    palette.appendChild(btn);
  });
  root.appendChild(palette);

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
  root.appendChild(actions);
}
