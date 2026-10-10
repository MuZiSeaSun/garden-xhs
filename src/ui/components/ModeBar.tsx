import { useEngine, useEditorState } from '../EngineContext';
import type { EditorMode } from '../../engine/editor-store';

const MODES: ReadonlyArray<{ mode: EditorMode; label: string }> = [
  { mode: 'orbit', label: '旋转' },
  { mode: 'terrain', label: '地形' },
  { mode: 'item', label: '物品' },
];

export function ModeBar() {
  const engine = useEngine();
  const { mode } = useEditorState();
  return (
    <div className="mode-group">
      {MODES.map((m) => (
        <button
          key={m.mode}
          className={'mode-btn' + (mode === m.mode ? ' active' : '')}
          onClick={() => engine.setMode(m.mode)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
