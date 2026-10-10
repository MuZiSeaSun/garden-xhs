import { useState, type ReactNode } from 'react';
import { Card, Pagination } from 'animal-island-ui';
import { useEditorSelector, useEngine } from '../EngineContext';
import { BLOCK, type BlockId } from '../../core/block-types';
import { CARD_STYLE, GRID_SLOTS } from './grid';

const BLOCKS: ReadonlyArray<{ icon: string; name: string; type: BlockId }> = [
  { icon: '🌱', name: '草地', type: BLOCK.GRASS },
  { icon: '🟫', name: '泥土', type: BLOCK.SOIL },
  { icon: '⬜', name: '岩石', type: BLOCK.STONE },
  { icon: '🍃', name: '树叶', type: BLOCK.LEAF },
];

export function TerrainGrid() {
  const engine = useEngine();
  const terrainAction = useEditorSelector((s) => s.terrainAction);
  const currentBlockType = useEditorSelector((s) => s.currentBlockType);
  const [page, setPage] = useState(1);

  const shovelSelected = terrainAction === 'remove';
  const items: ReactNode[] = [
    <Card
      key="shovel"
      color={shovelSelected ? 'app-teal' : 'default'}
      hoverable
      role="button"
      tabIndex={0}
      aria-pressed={shovelSelected}
      aria-label="铲子"
      onClick={engine.selectTerrainRemove}
      style={CARD_STYLE}
    >
      <span className="card-icon">🪣</span>
      <span className="card-name">铲子</span>
    </Card>,
  ];
  for (const b of BLOCKS) {
    const selected = terrainAction === 'place' && currentBlockType === b.type;
    items.push(
      <Card
        key={b.type}
        color={selected ? 'app-teal' : 'default'}
        hoverable
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={b.name}
        onClick={() => engine.selectBlock(b.type)}
        style={CARD_STYLE}
      >
        <span className="card-icon">{b.icon}</span>
        <span className="card-name">{b.name}</span>
      </Card>,
    );
  }

  const pageCount = Math.max(1, Math.ceil(items.length / GRID_SLOTS));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * GRID_SLOTS;
  const cells = items.slice(start, start + GRID_SLOTS);
  for (let i = cells.length; i < GRID_SLOTS; i += 1) {
    cells.push(<Card key={`empty-${i}`} type="dashed" style={CARD_STYLE} />);
  }

  return (
    <div className="page-body">
      <div className="grid-3">{cells}</div>
      <div className="pager">
        <Pagination
          total={items.length}
          pageSize={GRID_SLOTS}
          current={safePage}
          onChange={(p) => setPage(p)}
          variant="teal"
        />
      </div>
    </div>
  );
}
