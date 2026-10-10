// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { bindGestures } from '../../src/input/gesture';

function mouse(type: string, x: number, y: number, ctrlKey = false): MouseEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, ctrlKey, bubbles: true });
}

function handlers() {
  return { onPan: vi.fn(), onOrbit: vi.fn(), onRotate: vi.fn(), onTilt: vi.fn(), onZoom: vi.fn(), onTap: vi.fn() };
}

function dispatchTouches(
  canvas: HTMLCanvasElement,
  type: string,
  points: Array<{ x: number; y: number }>,
  changed: Array<{ x: number; y: number }> = points,
): void {
  const e = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    touches: Array<{ clientX: number; clientY: number }>;
    changedTouches: Array<{ clientX: number; clientY: number }>;
  };
  e.touches = points.map((p) => ({ clientX: p.x, clientY: p.y }));
  e.changedTouches = changed.map((p) => ({ clientX: p.x, clientY: p.y }));
  canvas.dispatchEvent(e);
}

describe('bindGestures (mouse path)', () => {
  it('fires onTap for a press released without movement', () => {
    const c = document.createElement('canvas');
    const h = handlers();
    bindGestures(c, h);
    c.dispatchEvent(mouse('mousedown', 10, 10));
    c.dispatchEvent(mouse('mouseup', 10, 10));
    expect(h.onTap).toHaveBeenCalledWith(10, 10);
  });
  it('pans the island and suppresses tap once movement exceeds the threshold', () => {
    const c = document.createElement('canvas');
    const h = handlers();
    bindGestures(c, h);
    c.dispatchEvent(mouse('mousedown', 10, 10));
    c.dispatchEvent(mouse('mousemove', 40, 10));
    c.dispatchEvent(mouse('mouseup', 40, 10));
    expect(h.onPan).toHaveBeenCalledWith(30, 0);
    expect(h.onOrbit).not.toHaveBeenCalled();
    expect(h.onTap).not.toHaveBeenCalled();
  });
  it('orbits when ctrl is held, and does not pan', () => {
    const c = document.createElement('canvas');
    const h = handlers();
    bindGestures(c, h);
    c.dispatchEvent(mouse('mousedown', 10, 10));
    c.dispatchEvent(mouse('mousemove', 40, 25, true));
    expect(h.onOrbit).toHaveBeenCalledWith(30, 15);
    expect(h.onPan).not.toHaveBeenCalled();
  });
  it('zooms on wheel (deltaY down zooms out, up zooms in)', () => {
    const c = document.createElement('canvas');
    const h = handlers();
    bindGestures(c, h);
    c.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }));
    expect(h.onZoom).toHaveBeenCalledTimes(1);
    expect(h.onZoom.mock.calls[0][0]).toBeGreaterThan(1);
    c.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }));
    expect(h.onZoom.mock.calls[1][0]).toBeLessThan(1);
  });
  it('does not double-fire onTap for a touch tap followed by the synthetic mouse click', () => {
    const c = document.createElement('canvas');
    const h = handlers();
    bindGestures(c, h);
    dispatchTouches(c, 'touchstart', [{ x: 10, y: 10 }]);
    dispatchTouches(c, 'touchend', [], [{ x: 10, y: 10 }]);
    expect(h.onTap).toHaveBeenCalledTimes(1);
    c.dispatchEvent(mouse('mousedown', 10, 10));
    c.dispatchEvent(mouse('mouseup', 10, 10));
    expect(h.onTap).toHaveBeenCalledTimes(1);
  });
  it('one-finger drag pans and does not orbit', () => {
    const c = document.createElement('canvas');
    const h = handlers();
    bindGestures(c, h);
    dispatchTouches(c, 'touchstart', [{ x: 10, y: 10 }]);
    dispatchTouches(c, 'touchmove', [{ x: 40, y: 16 }]);
    expect(h.onPan).toHaveBeenCalledWith(30, 6);
    expect(h.onOrbit).not.toHaveBeenCalled();
    expect(h.onRotate).not.toHaveBeenCalled();
  });
  it('two-finger pinch zooms and twist rotates, without a tap', () => {
    const c = document.createElement('canvas');
    const h = handlers();
    bindGestures(c, h);
    dispatchTouches(c, 'touchstart', [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    dispatchTouches(c, 'touchmove', [{ x: 0, y: 0 }, { x: 0, y: 200 }]);
    expect(h.onZoom).toHaveBeenCalledTimes(1);
    expect(h.onZoom.mock.calls[0][0]).toBeCloseTo(0.5);
    expect(h.onRotate).toHaveBeenCalledTimes(1);
    expect(h.onRotate.mock.calls[0][0]).toBeCloseTo(-Math.PI / 2);
    expect(h.onPan).not.toHaveBeenCalled();
    expect(h.onTilt).not.toHaveBeenCalled();
    dispatchTouches(c, 'touchend', [], [{ x: 0, y: 0 }, { x: 0, y: 200 }]);
    expect(h.onTap).not.toHaveBeenCalled();
  });
  it('tilts when both fingers slide vertically together', () => {
    const c = document.createElement('canvas');
    const h = handlers();
    bindGestures(c, h);
    dispatchTouches(c, 'touchstart', [{ x: 0, y: 100 }, { x: 80, y: 100 }]);
    dispatchTouches(c, 'touchmove', [{ x: 0, y: 160 }, { x: 80, y: 160 }]);
    expect(h.onTilt).toHaveBeenCalledTimes(1);
    expect(h.onTilt.mock.calls[0][0]).toBe(60);
    expect(h.onRotate).not.toHaveBeenCalled();
    dispatchTouches(c, 'touchmove', [{ x: 0, y: 100 }, { x: 80, y: 100 }]);
    expect(h.onTilt.mock.calls[1][0]).toBe(-60);
  });
  it('wraps a two-finger twist that crosses the ±π boundary', () => {
    const c = document.createElement('canvas');
    const h = handlers();
    bindGestures(c, h);
    dispatchTouches(c, 'touchstart', [{ x: 0, y: 0 }, { x: -100, y: 1 }]);
    dispatchTouches(c, 'touchmove', [{ x: 0, y: 0 }, { x: -100, y: -1 }]);
    expect(h.onRotate).toHaveBeenCalledTimes(1);
    expect(Math.abs(h.onRotate.mock.calls[0][0])).toBeLessThan(0.1);
  });
  it('returns a disposer that unbinds handlers', () => {
    const c = document.createElement('canvas');
    const h = handlers();
    const dispose = bindGestures(c, h);
    dispose();
    c.dispatchEvent(mouse('mousedown', 10, 10));
    c.dispatchEvent(mouse('mouseup', 10, 10));
    expect(h.onTap).not.toHaveBeenCalled();
  });
});
