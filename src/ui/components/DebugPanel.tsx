import { useState } from 'react';
import { useEditorSelector, useEngine } from '../EngineContext';
import { LightDisk } from './LightDisk';

const PERSPECTIVE_MIN = 60;
const PERSPECTIVE_MAX = 500;

export function DebugPanel() {
  const engine = useEngine();
  const perspective = useEditorSelector((s) => s.perspective);
  const adapter = useEditorSelector((s) => s.adapter);
  const ambient = useEditorSelector((s) => s.ambient);
  const directional = useEditorSelector((s) => s.directional);
  const temperature = useEditorSelector((s) => s.temperature);
  const lightDir = useEditorSelector((s) => s.lightDir);
  const viewTheta = useEditorSelector((s) => s.viewTheta);
  const [open, setOpen] = useState(false);

  return (
    <div className="debug-bar">
      <button
        type="button"
        className={'debug-toggle' + (open ? ' active' : '')}
        onClick={() => setOpen((v) => !v)}
      >调试</button>
      {open && (
        <div className="debug-panel">
          <div className="perspective">
            <span className="perspective-label">透视</span>
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
            <select className="adapter-select" value={adapter} onChange={(e) => engine.switchAdapter(e.target.value)}>
              <option value="auto">自动</option>
              <option value="three">Three</option>
              <option value="webgl">WebGL</option>
            </select>
          </div>

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
        </div>
      )}
    </div>
  );
}
