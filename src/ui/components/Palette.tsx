import { useEngine, useEditorState } from '../EngineContext';
import { BLOCK, type BlockId } from '../../core/block-types';
import type { PropModelData } from '../../core/prop-types';

const PALETTE_ITEMS: ReadonlyArray<{ icon: string; name: string; type: BlockId }> = [
  { icon: '🌱', name: '草地', type: BLOCK.GRASS },
  { icon: '🟫', name: '泥土', type: BLOCK.SOIL },
  { icon: '⬜', name: '岩石', type: BLOCK.STONE },
  { icon: '🍃', name: '树叶', type: BLOCK.LEAF },
];

export function Palette({ propModels }: { propModels: readonly PropModelData[] }) {
  const engine = useEngine();
  const { mode, terrainAction, itemAction, currentBlockType, currentPropModelId } = useEditorState();

  if (mode === 'orbit') return null;

  return (
    <div className="palette">
      {mode === 'terrain' && (
        <div className="palette-group terrain-group">
          <button
            className={'palette-item' + (terrainAction === 'remove' ? ' active' : '')}
            title="铲子"
            onClick={engine.selectTerrainRemove}
          >🪣</button>
          {PALETTE_ITEMS.map((item) => (
            <button
              key={item.type}
              className={'palette-item' + (terrainAction === 'place' && currentBlockType === item.type ? ' active' : '')}
              title={item.name}
              onClick={() => engine.selectBlock(item.type)}
            >{item.icon}</button>
          ))}
        </div>
      )}
      {mode === 'item' && (
        <div className="palette-group props-group">
          <button
            className={'palette-item' + (itemAction === 'remove' ? ' active' : '')}
            title="删除"
            onClick={engine.selectItemRemove}
          >🗑️</button>
          {propModels.map((m, modelId) => (
            <button
              key={modelId}
              className={'palette-item' + (itemAction === 'place' && currentPropModelId === modelId ? ' active' : '')}
              title={m.name}
              onClick={() => engine.selectProp(modelId)}
            >
              <img src={m.icon} alt={m.name} draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
