import { useEngine } from '../EngineContext';

export function ActionBar() {
  const engine = useEngine();
  const actions: ReadonlyArray<{ label: string; onClick: () => void }> = [
    { label: '撤销', onClick: engine.undo },
    { label: '清空', onClick: engine.reset },
    { label: '保存', onClick: engine.saveToAlbum },
    { label: '分享', onClick: engine.shareNote },
  ];
  return (
    <div className="actions">
      {actions.map((a) => (
        <button key={a.label} onClick={a.onClick}>{a.label}</button>
      ))}
    </div>
  );
}
