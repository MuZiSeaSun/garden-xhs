export interface GestureHandlers {
  onOrbit(dx: number, dy: number): void;
  onZoom(factor: number): void;
  onTap(x: number, y: number): void;
}

const TAP_THRESHOLD = 8;

export function bindGestures(canvas: HTMLCanvasElement, handlers: GestureHandlers): () => void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let movedDistance = 0;
  let pinchDist = 0;
  // 触摸后浏览器会补发一次合成鼠标事件；用时间戳丢弃它，避免一次点击触发两次操作
  let lastTouchTs = 0;
  const SYNTHETIC_MOUSE_MS = 600;

  const getPinchDistance = (touches: TouchList): number => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const onTouchStart = (e: TouchEvent): void => {
    lastTouchTs = Date.now();
    if (e.touches.length === 1) {
      dragging = true;
      movedDistance = 0;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      dragging = false;
      pinchDist = getPinchDistance(e.touches);
    }
  };

  const onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();

    if (e.touches.length === 1 && dragging) {
      const dx = e.touches[0].clientX - lastX;
      const dy = e.touches[0].clientY - lastY;
      movedDistance += Math.abs(dx) + Math.abs(dy);
      handlers.onOrbit(dx, dy);
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      const dist = getPinchDistance(e.touches);
      if (pinchDist > 0 && dist > 0) {
        handlers.onZoom(pinchDist / dist);
      }
      pinchDist = dist;
    }
  };

  const onTouchEnd = (e: TouchEvent): void => {
    lastTouchTs = Date.now();
    if (dragging && movedDistance < TAP_THRESHOLD) {
      const touch = e.changedTouches[0];
      handlers.onTap(touch.clientX, touch.clientY);
    }
    dragging = false;
    pinchDist = 0;
  };

  const onMouseDown = (e: MouseEvent): void => {
    if (Date.now() - lastTouchTs < SYNTHETIC_MOUSE_MS) return;
    dragging = true;
    movedDistance = 0;
    lastX = e.clientX;
    lastY = e.clientY;
  };

  const onMouseMove = (e: MouseEvent): void => {
    if (Date.now() - lastTouchTs < SYNTHETIC_MOUSE_MS) return;
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    movedDistance += Math.abs(dx) + Math.abs(dy);
    handlers.onOrbit(dx, dy);
    lastX = e.clientX;
    lastY = e.clientY;
  };

  const onMouseUp = (e: MouseEvent): void => {
    if (Date.now() - lastTouchTs < SYNTHETIC_MOUSE_MS) return;
    if (dragging && movedDistance < TAP_THRESHOLD) {
      handlers.onTap(e.clientX, e.clientY);
    }
    dragging = false;
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    handlers.onZoom(1 + e.deltaY * 0.001);
  };

  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('touchend', onTouchEnd);
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('wheel', onWheel);
  };
}
