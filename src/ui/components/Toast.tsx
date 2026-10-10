import { useEffect, useState } from 'react';
import { useEditorSelector } from '../EngineContext';

export function Toast() {
  const toast = useEditorSelector((s) => s.toast);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 1500);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!toast || !visible) return null;
  const top = toast.place === 'top';
  return <div id="toast" className={top ? 'toast-top' : undefined}>{toast.message}</div>;
}
