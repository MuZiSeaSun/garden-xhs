const TILE = 32;
const COLS = 16;
const SIZE = TILE * COLS;

export function generateAtlas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const drawTile = (col: number, row: number, fn: (x: number, y: number) => void): void => {
    ctx.save();
    ctx.translate(col * TILE, row * TILE);
    fn(0, 0);
    ctx.restore();
  };

  // 0: 草地
  drawTile(0, 0, (x, y) => {
    ctx.fillStyle = '#5aa832';
    ctx.fillRect(x, y, TILE, TILE);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#6ebe3d' : '#4a8f28';
      ctx.fillRect(x + (Math.random() * TILE | 0), y + (Math.random() * TILE | 0), 2, 2);
    }
  });

  // 1: 泥土
  drawTile(1, 0, (x, y) => {
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(x, y, TILE, TILE);
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#9d6a35' : '#7a4a22';
      ctx.fillRect(x + (Math.random() * TILE | 0), y + (Math.random() * TILE | 0), 3, 3);
    }
  });

  // 2: 石头
  drawTile(2, 0, (x, y) => {
    ctx.fillStyle = '#888888';
    ctx.fillRect(x, y, TILE, TILE);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#9a9a9a' : '#737373';
      ctx.fillRect(x + (Math.random() * TILE | 0), y + (Math.random() * TILE | 0), 3, 3);
    }
  });

  // 3: 水
  drawTile(3, 0, (x, y) => {
    ctx.fillStyle = '#3a8fd0';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#5aa8e0';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(x, y + i * 7, TILE, 2);
    }
  });

  // 4-5: 花朵（透明底 + 花瓣）
  ([['#e53935', 4], ['#fdd835', 5]] as const).forEach(([color, col]) => {
    drawTile(col, 0, (x, y) => {
      ctx.clearRect(x, y, TILE, TILE);
      ctx.fillStyle = '#4a8f28';
      ctx.fillRect(x + 15, y + 18, 2, 14);
      ctx.fillStyle = color;
      const cx = x + 16, cy = y + 14;
      for (let a = 0; a < 5; a++) {
        const angle = (a / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle) * 5, cy + Math.sin(angle) * 5, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#fdd835';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  // 6: 灌木
  drawTile(6, 0, (x, y) => {
    ctx.fillStyle = '#2e7d32';
    ctx.fillRect(x, y, TILE, TILE);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#43a047' : '#1b5e20';
      ctx.fillRect(x + (Math.random() * TILE | 0), y + (Math.random() * TILE | 0), 3, 3);
    }
  });

  // 7: 木头
  drawTile(7, 0, (x, y) => {
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#6d4c41';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(x + i * 8 + 2, y, 2, TILE);
    }
  });

  // 8: 树叶
  drawTile(8, 0, (x, y) => {
    ctx.fillStyle = '#388e3c';
    ctx.fillRect(x, y, TILE, TILE);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#4caf50' : '#1b5e20';
      ctx.fillRect(x + (Math.random() * TILE | 0), y + (Math.random() * TILE | 0), 3, 3);
    }
  });

  return canvas;
}
