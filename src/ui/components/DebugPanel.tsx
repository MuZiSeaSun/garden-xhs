import { useState } from 'react';
import { Button, Card, Select } from 'animal-island-ui';
import type { LightingPatch } from '../../engine/editor-store';
import { useEditorSelector, useEngine } from '../EngineContext';
import { LightDisk } from './LightDisk';

const PERSPECTIVE_MIN = 60;
const PERSPECTIVE_MAX = 500;

const ADAPTER_OPTIONS = [
  { key: 'auto', label: '自动' },
  { key: 'three', label: 'Three' },
  { key: 'webgl', label: 'WebGL' },
];

interface SliderSpec {
  readonly key: keyof LightingPatch;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly digits: number;
  readonly className?: string;
}

const SLIDERS: readonly SliderSpec[] = [
  { key: 'exposure', label: '曝光', min: 0.2, max: 2, step: 0.02, digits: 2, className: 'exposure' },
  { key: 'envMapIntensity', label: '反射', min: 0, max: 1, step: 0.01, digits: 2 },
  { key: 'envBlur', label: '环境模糊', min: 0, max: 0.2, step: 0.005, digits: 3 },
  { key: 'roughness', label: '粗糙度', min: 0, max: 1, step: 0.01, digits: 2 },
  { key: 'metalness', label: '金属度', min: 0, max: 1, step: 0.01, digits: 2 },
  { key: 'bloomStrength', label: '泛光强度', min: 0, max: 2, step: 0.02, digits: 2 },
  { key: 'bloomRadius', label: '泛光扩散', min: 0, max: 1, step: 0.01, digits: 2 },
  { key: 'bloomThreshold', label: '泛光阈值', min: 0, max: 1, step: 0.01, digits: 2 },
  { key: 'shadowBias', label: '阴影偏移', min: -0.005, max: 0.001, step: 0.0001, digits: 4 },
  { key: 'shadowNormalBias', label: '法线偏移', min: 0, max: 0.1, step: 0.001, digits: 3 },
  { key: 'shadowMapSize', label: '阴影贴图', min: 256, max: 4096, step: 256, digits: 0 },
  { key: 'shadowExtent', label: '阴影范围', min: 4, max: 40, step: 1, digits: 0 },
  { key: 'shadowNear', label: '阴影近面', min: 0.1, max: 80, step: 0.1, digits: 1 },
  { key: 'shadowFar', label: '阴影远面', min: 10, max: 200, step: 1, digits: 0 },
  { key: 'lightDistance', label: '光源距离', min: 10, max: 150, step: 1, digits: 0 },
];

const COLORS: readonly { key: keyof LightingPatch; label: string }[] = [
  { key: 'skyColor', label: '天空色' },
  { key: 'groundColor', label: '地面色' },
  { key: 'sunColor', label: '太阳色' },
  { key: 'background', label: '背景色' },
];

const ANCHORS: readonly { key: keyof LightingPatch; label: string }[] = [
  { key: 'sunNeutral', label: '太阳中性' },
  { key: 'sunWarm', label: '太阳暖' },
  { key: 'sunCool', label: '太阳冷' },
  { key: 'skyNeutral', label: '天空中性' },
  { key: 'skyWarm', label: '天空暖' },
  { key: 'skyCool', label: '天空冷' },
  { key: 'groundNeutral', label: '地面中性' },
  { key: 'groundWarm', label: '地面暖' },
  { key: 'groundCool', label: '地面冷' },
];

function cssHex(n: number): string {
  return `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function DebugPanel() {
  const engine = useEngine();
  const perspective = useEditorSelector((s) => s.perspective);
  const adapter = useEditorSelector((s) => s.adapter);
  const ambient = useEditorSelector((s) => s.ambient);
  const directional = useEditorSelector((s) => s.directional);
  const temperature = useEditorSelector((s) => s.temperature);
  const lightDir = useEditorSelector((s) => s.lightDir);
  const viewTheta = useEditorSelector((s) => s.viewTheta);
  const lighting = useEditorSelector((s) => s);
  const [open, setOpen] = useState(false);

  const setNumber = (key: keyof LightingPatch, value: number): void => {
    engine.setLighting({ [key]: value });
  };

  return (
    <div className="debug-bar">
      <Button
        size="small"
        type={open ? 'primary' : 'default'}
        aria-pressed={open}
        onClick={() => setOpen((v) => !v)}
      >调试</Button>
      {open && (
        <Card className="debug-panel">
          <div className="perspective">
            <span>透视</span>
            <input
              type="range"
              min={PERSPECTIVE_MIN} max={PERSPECTIVE_MAX} step={10}
              value={perspective}
              onChange={(e) => engine.setPerspective(Number(e.target.value))}
            />
            <span className="perspective-value">{perspective}</span>
          </div>

          <div className="control-row">
            <span>适配器</span>
            <Select value={adapter} onChange={(key) => engine.switchAdapter(key)} options={ADAPTER_OPTIONS} />
          </div>

          <div className="debug-group">光照</div>

          <div className="control-row ambient">
            <span>环境光</span>
            <input
              type="range" min={0} max={2} step={0.02} value={ambient}
              onChange={(e) => engine.setAmbient(Number(e.target.value))}
            />
            <span className="lighting-value">{ambient.toFixed(2)}</span>
          </div>

          <div className="control-row directional">
            <span>方向光</span>
            <input
              type="range" min={0} max={2} step={0.02} value={directional}
              onChange={(e) => engine.setDirectional(Number(e.target.value))}
            />
            <span className="lighting-value">{directional.toFixed(2)}</span>
          </div>

          <div className="control-row light-angle">
            <span>角度</span>
            <LightDisk lightDir={lightDir} theta={viewTheta} onChange={engine.setLightDir} />
          </div>

          <div className="control-row temperature">
            <span>色温</span>
            <input
              type="range" min={1500} max={20000} step={100} value={temperature}
              onChange={(e) => engine.setTemperature(Number(e.target.value))}
            />
            <span className="lighting-value">{temperature}K</span>
          </div>

          {SLIDERS.map((spec) => {
            const value = lighting[spec.key] as number;
            return (
              <div className={`control-row${spec.className ? ` ${spec.className}` : ''}`} key={spec.key}>
                <span>{spec.label}</span>
                <input
                  type="range"
                  min={spec.min} max={spec.max} step={spec.step}
                  value={value}
                  onChange={(e) => setNumber(spec.key, Number(e.target.value))}
                />
                <span className="lighting-value">{value.toFixed(spec.digits)}</span>
              </div>
            );
          })}

          <div className="debug-group">当前颜色</div>
          {COLORS.map((spec) => (
            <div className="control-row" key={spec.key}>
              <span>{spec.label}</span>
              <input
                type="color"
                aria-label={spec.label}
                value={cssHex(lighting[spec.key] as number)}
                onChange={(e) => setNumber(spec.key, Number.parseInt(e.target.value.slice(1), 16))}
              />
            </div>
          ))}

          <div className="debug-group">色温锚点</div>
          {ANCHORS.map((spec) => (
            <div className="control-row" key={spec.key}>
              <span>{spec.label}</span>
              <input
                type="color"
                aria-label={spec.label}
                value={cssHex(lighting[spec.key] as number)}
                onChange={(e) => setNumber(spec.key, Number.parseInt(e.target.value.slice(1), 16))}
              />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
