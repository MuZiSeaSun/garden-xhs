import type { PropModelData } from '../../core/prop-types';
import { ActionBar } from '../components/ActionBar';
import { DebugPanel } from '../components/DebugPanel';
import { EditSheet } from '../components/EditSheet';
import { Toast } from '../components/Toast';

export function EditorScreen({ propModels }: { propModels: readonly PropModelData[] }) {
  return (
    <>
      <DebugPanel />
      <ActionBar />
      <EditSheet propModels={propModels} />
      <Toast />
    </>
  );
}
