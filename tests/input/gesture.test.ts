// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { bindGestures } from '../../src/input/gesture';

function mouse(type: string, x: number, y: number): MouseEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
}

describe('bindGestures (mouse path)', () => {
  it('fires onTap for a press released without movement', () => {
    const c = document.createElement('canvas');
    const onTap = vi.fn();
    bindGestures(c, { onOrbit: vi.fn(), onZoom: vi.fn(), onTap });
    c.dispatchEvent(mouse('mousedown', 10, 10));
    c.dispatchEvent(mouse('mouseup', 10, 10));
    expect(onTap).toHaveBeenCalledWith(10, 10);
  });
  it('orbits and suppresses tap once movement exceeds the threshold', () => {
    const c = document.createElement('canvas');
    const onOrbit = vi.fn();
    const onTap = vi.fn();
    bindGestures(c, { onOrbit, onZoom: vi.fn(), onTap });
    c.dispatchEvent(mouse('mousedown', 10, 10));
    c.dispatchEvent(mouse('mousemove', 40, 10));
    c.dispatchEvent(mouse('mouseup', 40, 10));
    expect(onOrbit).toHaveBeenCalled();
    expect(onTap).not.toHaveBeenCalled();
  });
  it('zooms on wheel (deltaY down zooms out, up zooms in)', () => {
    const c = document.createElement('canvas');
    const onZoom = vi.fn();
    bindGestures(c, { onOrbit: vi.fn(), onZoom, onTap: vi.fn() });
    c.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }));
    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onZoom.mock.calls[0][0]).toBeGreaterThan(1);
    c.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }));
    expect(onZoom.mock.calls[1][0]).toBeLessThan(1);
  });
  it('does not double-fire onTap for a touch tap followed by the synthetic mouse click', () => {
    const c = document.createElement('canvas');
    const onTap = vi.fn();
    bindGestures(c, { onOrbit: vi.fn(), onZoom: vi.fn(), onTap });
    const touch = (type: string, x: number, y: number): void => {
      const e = new Event(type, { bubbles: true }) as unknown as {
        touches: unknown; changedTouches: unknown;
      };
      e.touches = [{ clientX: x, clientY: y }];
      e.changedTouches = [{ clientX: x, clientY: y }];
      c.dispatchEvent(e as unknown as Event);
    };
    touch('touchstart', 10, 10);
    touch('touchend', 10, 10);
    expect(onTap).toHaveBeenCalledTimes(1);
    // browser-synthesized mouse events after the touch must be ignored
    c.dispatchEvent(mouse('mousedown', 10, 10));
    c.dispatchEvent(mouse('mouseup', 10, 10));
    expect(onTap).toHaveBeenCalledTimes(1);
  });
  it('returns a disposer that unbinds handlers', () => {
    const c = document.createElement('canvas');
    const onTap = vi.fn();
    const dispose = bindGestures(c, { onOrbit: vi.fn(), onZoom: vi.fn(), onTap });
    dispose();
    c.dispatchEvent(mouse('mousedown', 10, 10));
    c.dispatchEvent(mouse('mouseup', 10, 10));
    expect(onTap).not.toHaveBeenCalled();
  });
});
