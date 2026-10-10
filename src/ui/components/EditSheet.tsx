import { useEffect, useState } from 'react';
import { Button, Modal, Tabs } from 'animal-island-ui';
import { useEngine } from '../EngineContext';
import type { PropModelData } from '../../core/prop-types';
import { TerrainGrid } from './TerrainGrid';
import { ItemGrid } from './ItemGrid';

type EditorTab = 'terrain' | 'item';

export function EditSheet({ propModels }: { propModels: readonly PropModelData[] }) {
  const engine = useEngine();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<EditorTab>('terrain');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    engine.setMode(open ? tab : 'orbit');
  }, [engine, open, tab]);

  return (
    <div className="dock">
      <div className="edit-actions">
        {open && <Button size="small" onClick={engine.undo}>撤销</Button>}
        {open && <Button size="small" danger onClick={() => setConfirmOpen(true)}>清空</Button>}
        <Button
          type={open ? 'default' : 'primary'}
          aria-pressed={open}
          onClick={() => setOpen((v) => !v)}
        >{open ? '关闭' : '编辑'}</Button>
      </div>
      {open && (
        <div className="sheet">
          <Tabs
            aria-label="编辑"
            activeKey={tab}
            onChange={(key) => setTab(key as EditorTab)}
            items={[
              { key: 'terrain', label: '地形', children: <TerrainGrid /> },
              { key: 'item', label: '物品', children: <ItemGrid propModels={propModels} /> },
            ]}
          />
        </div>
      )}
      <Modal
        open={confirmOpen}
        title="清空花园"
        width="88%"
        typewriter={false}
        onClose={() => setConfirmOpen(false)}
        onOk={() => {
          engine.reset();
          setConfirmOpen(false);
        }}
      >
        确定清空当前花园？此操作可撤销。
      </Modal>
    </div>
  );
}
