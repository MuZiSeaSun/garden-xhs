import type {
  RendererAdapter,
  AdapterCtor,
  RendererInitOptions,
  Capabilities,
} from './renderer-api';
import { ThreeAdapter } from './adapters/three-adapter';
import { WebGLAdapter } from './adapters/webgl-adapter';
import { NullAdapter } from './adapters/null-adapter';

/**
 * 优先级顺序：能力放开后，把新适配器插到前面即可
 */
const ADAPTER_PRIORITY: readonly AdapterCtor[] = [
  ThreeAdapter,
  WebGLAdapter,
  NullAdapter,
];

export async function createRenderer(
  opts: RendererInitOptions,
  caps: Capabilities,
): Promise<RendererAdapter> {
  const errors: Array<{ name: string; error: unknown }> = [];

  for (const Ctor of ADAPTER_PRIORITY) {
    const instance = new Ctor();
    if (!instance.isSupported(caps)) continue;

    try {
      await instance.init(opts);
      console.info(`[renderer] using adapter: ${instance.name}`);
      return instance;
    } catch (err) {
      errors.push({ name: instance.name, error: err });
      console.warn(`[renderer] ${instance.name} init failed`, err);
      try { instance.dispose(); } catch { /* ignore */ }
    }
  }

  console.error('[renderer] all adapters failed', errors);
  throw new Error('No renderer adapter available');
}
