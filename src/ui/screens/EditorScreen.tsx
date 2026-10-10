import type { PropModelData } from '../../core/prop-types';
import { ModeBar } from '../components/ModeBar';
import { Palette } from '../components/Palette';
import { ActionBar } from '../components/ActionBar';
import { DebugPanel } from '../components/DebugPanel';
import { Toast } from '../components/Toast';

export function EditorScreen({ propModels }: { propModels: readonly PropModelData[] }) {
  return (
    <>
      <DebugPanel />
      <ModeBar />
      <Palette propModels={propModels} />
      <ActionBar />
      <Toast />
    </>
  );
}
