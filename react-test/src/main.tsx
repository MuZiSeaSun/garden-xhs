import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Background,
  Title,
  Card,
  Button,
  Divider,
  Switch,
  Select,
  Input,
  Modal,
  Tag,
  Badge,
  Collapse,
  Footer,
} from 'animal-island-ui';
import 'animal-island-ui/style';
import './index.css';

const MODES = [
  ['orbit', '旋转'],
  ['terrain', '地形'],
  ['item', '物品'],
] as const;

const BLOCKS = ['🪣', '🌱', '🟫', '⬜', '🍃'] as const;

function App() {
  const [mode, setMode] = useState<string>('orbit');
  const [ghost, setGhost] = useState(false);
  const [adapter, setAdapter] = useState('auto');
  const [kelvin, setKelvin] = useState('5000');
  const [intensity, setIntensity] = useState(1);
  const [open, setOpen] = useState(false);

  return (
    <Background type="default">
      <div className="page">
        <Title size="large" color="app-teal">方块花园 · UI 预览</Title>
        <Divider type="wave-yellow" />

        <Card>
          <div className="label">模式</div>
          <div className="row">
            {MODES.map(([key, label]) => (
              <Button key={key} type={mode === key ? 'primary' : 'default'} onClick={() => setMode(key)}>
                {label}
              </Button>
            ))}
          </div>
        </Card>

        <Card>
          <div className="label">方块</div>
          <div className="row">
            {BLOCKS.map((b) => (
              <Button key={b} size="large">{b}</Button>
            ))}
          </div>
        </Card>

        <Card>
          <div className="label">操作</div>
          <div className="row">
            <Button>撤销</Button>
            <Button danger>清空</Button>
            <Button type="primary">保存</Button>
            <Button type="primary">分享</Button>
          </div>
        </Card>

        <Card>
          <div className="line">
            <span className="k">半透明道具</span>
            <Switch checked={ghost} onChange={setGhost} checkedChildren="开" unCheckedChildren="关" />
          </div>
          <div className="line">
            <span className="k">适配器</span>
            <Select
              value={adapter}
              onChange={setAdapter}
              options={[
                { key: 'auto', label: '自动' },
                { key: 'three', label: 'Three' },
                { key: 'webgl', label: 'WebGL' },
              ]}
            />
          </div>
          <div className="line">
            <span className="k">色温</span>
            <Input size="small" value={kelvin} onChange={(e) => setKelvin(e.target.value)} allowClear />
          </div>
          <div className="line">
            <span className="k">强度</span>
            <input
              className="range"
              type="range"
              min={0}
              max={2}
              step={0.02}
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
            />
            <span className="val">{intensity.toFixed(2)}</span>
          </div>
        </Card>

        <Card>
          <Collapse
            defaultExpanded
            question="这是给谁看的？"
            answer="给在小红书真机 / 模拟器上预览 animal-island-ui 组件效果用；不含 3D 场景与端能力。"
          />
        </Card>

        <div className="row">
          <Tag color="app-teal">地形</Tag>
          <Tag variant="outlined" color="app-orange">物品</Tag>
          <Tag variant="soft" color="app-blue">道具</Tag>
          <Badge count={3} color="app-red">
            <Button size="large">🪣</Button>
          </Badge>
        </div>

        <Button type="primary" block onClick={() => setOpen(true)}>
          打开确认弹窗
        </Button>

        <Modal
          open={open}
          title="保存到相册"
          onClose={() => setOpen(false)}
          footer={
            <>
              <Button onClick={() => setOpen(false)}>取消</Button>
              <Button type="primary" onClick={() => setOpen(false)}>确定</Button>
            </>
          }
        >
          这是 Modal 的 blob 裁剪外观，在真机上看看边缘与阴影。
        </Modal>

        <Footer text="animal-island-ui 预览" />
      </div>
    </Background>
  );
}

const rootEl = document.getElementById('root');

if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

if (rootEl) createRoot(rootEl).render(<App />);
