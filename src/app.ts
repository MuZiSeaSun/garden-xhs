import { detectCapabilities } from './platform/capabilities';
import { generateAtlas } from './assets/atlas-generator';
import { createEditorStore } from './engine/editor-store';
import { createEngine } from './engine/engine';
import { mountUI } from './ui/main';
import { PROP_MODELS } from './assets/props.generated';

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui-root');
  if (!canvas || !uiRoot) return;

  const caps = detectCapabilities();
  const atlasCanvas = generateAtlas();
  const store = createEditorStore();
  const engine = await createEngine({ canvas, atlasCanvas, store, caps, propModels: PROP_MODELS });

  if (!engine) {
    document.getElementById('fallback')?.removeAttribute('hidden');
    return;
  }

  mountUI(uiRoot, engine, store, PROP_MODELS);
}

bootstrap().catch((err) => {
  console.error('[app] bootstrap failed', err);
});
