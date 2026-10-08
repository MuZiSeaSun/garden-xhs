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
  // offscreenCanvas / wasm are container-forbidden and unused by any adapter;
  // we deliberately do not probe their globals so the artifact carries no such
  // identifiers (see the bundle scan). The fields stay false.
  try { caps.webgpu = typeof navigator !== 'undefined' && !!(navigator as { gpu?: unknown }).gpu; } catch { /* ignore */ }

  caps.miniTool = !!(window.xhs && window.xhs.miniTool);
  return caps;
}
