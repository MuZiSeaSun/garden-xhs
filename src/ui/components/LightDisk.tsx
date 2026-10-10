import { useRef } from 'react';
import { diskToLightDir, lightDirToDisk } from '../../core/light-direction';

export function LightDisk({ lightDir, theta, onChange }: {
  lightDir: readonly [number, number, number];
  theta: number;
  onChange: (dir: readonly [number, number, number]) => void;
}) {
  const diskRef = useRef<HTMLDivElement>(null);
  const { nx, ny } = lightDirToDisk(lightDir, theta);

  const pointFromEvent = (e: PointerEvent): { nx: number; ny: number } => {
    const rect = diskRef.current!.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    let y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { nx: x, ny: y };
  };
  const drag = (e: PointerEvent): void => {
    const p = pointFromEvent(e);
    onChange(diskToLightDir(p.nx, p.ny, theta));
  };

  return (
    <div
      ref={diskRef}
      className="light-disk"
      onPointerDown={(e) => {
        if (typeof e.pointerId === 'number') diskRef.current?.setPointerCapture?.(e.pointerId);
        drag(e.nativeEvent);
      }}
      onPointerMove={(e) => {
        if (!diskRef.current?.hasPointerCapture?.(e.pointerId)) return;
        drag(e.nativeEvent);
      }}
    >
      <div className="light-disk-knob" style={{ left: `${(nx + 1) * 50}%`, top: `${(ny + 1) * 50}%` }} />
    </div>
  );
}
