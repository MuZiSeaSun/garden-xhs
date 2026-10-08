import type { Capabilities } from '../rendering/renderer-api';

export function detectCapabilities(): Capabilities {
  const caps = {
    webgl: false, webgl2: false,
    worker: false, offscreenCanvas: false,
    wasm: false, webgpu: false, miniTool: false,
  };

  try {
    const c = document.createElement('canvas');
    caps.webgl  = !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
    caps.webgl2 = !!c.getContext('webgl2');
  } catch { /* ignore */ }

  try { caps.worker = typeof Worker !== 'undefined'; } catch { /* ignore */ }
  try { caps.offscreenCanvas = typeof OffscreenCanvas !== 'undefined'; } catch { /* ignore */ }
  try { caps.wasm = typeof WebAssembly === 'object'; } catch { /* ignore */ }
  try { caps.webgpu = typeof navigator !== 'undefined' && !!(navigator as { gpu?: unknown }).gpu; } catch { /* ignore */ }

  caps.miniTool = !!(window.xhs && window.xhs.miniTool);
  return caps;
}
