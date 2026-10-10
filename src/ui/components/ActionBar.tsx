import { Button } from 'animal-island-ui';
import { useEngine } from '../EngineContext';

export function ActionBar() {
  const engine = useEngine();
  return (
    <div className="actions-top">
      <Button size="small" type="primary" onClick={engine.saveToAlbum}>保存</Button>
      <Button size="small" type="primary" onClick={engine.shareNote}>分享</Button>
    </div>
  );
}
