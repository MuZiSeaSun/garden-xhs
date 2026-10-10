export interface GestureHandlers {
  /** 单指 / 鼠标拖动：平移岛屿。 */
  onPan(dx: number, dy: number): void;
  /** 电脑端 Ctrl+拖动：按像素绕竖直轴旋转。 */
  onOrbit(dx: number, dy: number): void;
  /** 双指旋转：弧度，正值为屏幕顺时针。 */
  onRotate(radians: number): void;
  /** 双指同时上下滑：屏幕像素，向下为正。 */
  onTilt(dy: number): void;
  onZoom(factor: number): void;
  onTap(x: number, y: number): void;
}

const TAP_THRESHOLD = 8;

function pinchDistance(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function pinchAngle(touches: TouchList): number {
  return Math.atan2(
    touches[1].clientY - touches[0].clientY,
    touches[1].clientX - touches[0].clientX,
  );
}

/** 角度差折叠到 (-π, π]，避免越过 ±π 时跳变。 */
function angleDelta(next: number, prev: number): number {
  let d = next - prev;
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export function bindGestures(canvas: HTMLCanvasElement, handlers: GestureHandlers): () => void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let movedDistance = 0;
  let pinchDist = 0;
  let pinchRot = 0;
  let pinchY0 = 0;
  let pinchY1 = 0;
  /** 本次触摸出现过双指，松手时不再当成点击。 */
  let pinched = false;
  // 触摸后浏览器会补发一次合成鼠标事件；用时间戳丢弃它，避免一次点击触发两次操作
  let lastTouchTs = 0;
  const SYNTHETIC_MOUSE_MS = 600;

  const anchorPinch = (touches: TouchList): void => {
    pinchDist = pinchDistance(touches);
    pinchRot = pinchAngle(touches);
    pinchY0 = touches[0].clientY;
    pinchY1 = touches[1].clientY;
  };

  const onTouchStart = (e: TouchEvent): void => {
    lastTouchTs = Date.now();
    if (e.touches.length === 1) {
      dragging = true;
      pinched = false;
      movedDistance = 0;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    } else if (e.touches.length >= 2) {
      dragging = false;
      pinched = true;
      anchorPinch(e.touches);
    }
  };

  const onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();

    if (e.touches.length === 1 && dragging) {
      const dx = e.touches[0].clientX - lastX;
      const dy = e.touches[0].clientY - lastY;
      movedDistance += Math.abs(dx) + Math.abs(dy);
      handlers.onPan(dx, dy);
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    } else if (e.touches.length >= 2) {
      pinched = true;
      dragging = false;
      const dist = pinchDistance(e.touches);
      if (pinchDist > 0 && dist > 0) {
        handlers.onZoom(pinchDist / dist);
      }
      const rot = pinchAngle(e.touches);
      const dRot = angleDelta(rot, pinchRot);
      // 屏幕 Y 向下，atan2 的正方向与岛屿跟随方向相反
      if (pinchDist > 0 && dRot !== 0) handlers.onRotate(-dRot);
      const dy0 = e.touches[0].clientY - pinchY0;
      const dy1 = e.touches[1].clientY - pinchY1;
      if (dy0 * dy1 > 0) handlers.onTilt((dy0 + dy1) / 2);
      anchorPinch(e.touches);
    }
  };

  const onTouchEnd = (e: TouchEvent): void => {
    lastTouchTs = Date.now();
    if (!pinched && dragging && movedDistance < TAP_THRESHOLD && e.touches.length === 0) {
      const touch = e.changedTouches[0];
      handlers.onTap(touch.clientX, touch.clientY);
    }
    if (e.touches.length >= 2) {
      pinched = true;
      dragging = false;
      anchorPinch(e.touches);
    } else if (e.touches.length === 1) {
      dragging = true;
      movedDistance = TAP_THRESHOLD;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
      pinchDist = 0;
    } else {
      dragging = false;
      pinchDist = 0;
      pinched = false;
    }
  };

  const onTouchCancel = (): void => {
    dragging = false;
    pinchDist = 0;
    pinched = false;
  };

  const ignoreSyntheticMouse = (): boolean => Date.now() - lastTouchTs < SYNTHETIC_MOUSE_MS;

  const onMouseDown = (e: MouseEvent): void => {
    if (ignoreSyntheticMouse()) return;
    if (e.button !== 0) return;
    dragging = true;
    movedDistance = 0;
    lastX = e.clientX;
    lastY = e.clientY;
  };

  const onMouseMove = (e: MouseEvent): void => {
    if (ignoreSyntheticMouse()) return;
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    movedDistance += Math.abs(dx) + Math.abs(dy);
    if (e.ctrlKey) handlers.onOrbit(dx, dy);
    else handlers.onPan(dx, dy);
    lastX = e.clientX;
    lastY = e.clientY;
  };

  const onMouseUp = (e: MouseEvent): void => {
    if (ignoreSyntheticMouse()) return;
    if (e.button !== 0) return;
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
  canvas.addEventListener('touchcancel', onTouchCancel);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('touchend', onTouchEnd);
    canvas.removeEventListener('touchcancel', onTouchCancel);
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('wheel', onWheel);
  };
}
