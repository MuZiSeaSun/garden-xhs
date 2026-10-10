import { useState, type ReactNode } from 'react';
import { Card, Pagination } from 'animal-island-ui';
import { useEditorSelector, useEngine } from '../EngineContext';
import type { PropModelData } from '../../core/prop-types';
import { CARD_STYLE, GRID_SLOTS } from './grid';

const PAGE_PROPS = GRID_SLOTS - 1;

export function ItemGrid({ propModels }: { propModels: readonly PropModelData[] }) {
  const engine = useEngine();
  const itemAction = useEditorSelector((s) => s.itemAction);
  const currentPropModelId = useEditorSelector((s) => s.currentPropModelId);
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(propModels.length / PAGE_PROPS));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_PROPS;
  const pageProps = propModels.slice(start, start + PAGE_PROPS);

  const delSelected = itemAction === 'remove';
  const cells: ReactNode[] = [
    <Card
      key="delete"
      color={delSelected ? 'app-teal' : 'default'}
      hoverable
      role="button"
      tabIndex={0}
      aria-pressed={delSelected}
      aria-label="删除"
      onClick={engine.selectItemRemove}
      style={CARD_STYLE}
    >
      <span className="card-icon">🗑️</span>
      <span className="card-name">删除</span>
    </Card>,
  ];

  pageProps.forEach((m, i) => {
    const modelId = start + i;
    const selected = itemAction === 'place' && currentPropModelId === modelId;
    cells.push(
      <Card
        key={modelId}
        color={selected ? 'app-teal' : 'default'}
        hoverable
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={m.name}
        onClick={() => engine.selectProp(modelId)}
        style={CARD_STYLE}
      >
        <img className="card-img" src={m.icon} alt="" draggable={false} />
        <span className="card-name">{m.name}</span>
      </Card>,
    );
  });

  for (let i = cells.length; i < GRID_SLOTS; i += 1) {
    cells.push(<Card key={`empty-${i}`} type="dashed" style={CARD_STYLE} />);
  }

  return (
    <div className="page-body">
      <div className="grid-3">{cells}</div>
      <div className="pager">
        <Pagination
          total={propModels.length}
          pageSize={PAGE_PROPS}
          current={safePage}
          onChange={(p) => setPage(p)}
          variant="teal"
        />
      </div>
    </div>
  );
}
