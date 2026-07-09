import { Texture } from 'pixi.js';

/**
 * Generated stand-in for the castle-courtyard background painting.
 * Replaced automatically once /public/assets/bg.png|jpg exists.
 */
export function buildFallbackBackground(): Texture {
  const W = 1920;
  const H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // base — deep warm brown fading down
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#241309');
  base.addColorStop(0.32, '#170e08');
  base.addColorStop(0.75, '#100a06');
  base.addColorStop(1, '#080504');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // sunset glow behind the battlements
  const sun = ctx.createRadialGradient(960, 250, 40, 960, 250, 620);
  sun.addColorStop(0, 'rgba(226, 128, 34, 0.55)');
  sun.addColorStop(0.5, 'rgba(160, 78, 20, 0.28)');
  sun.addColorStop(1, 'rgba(160, 78, 20, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, 640);

  // castle wall silhouette with crenellation
  ctx.fillStyle = 'rgba(12, 7, 4, 0.96)';
  ctx.fillRect(0, 268, W, 150);
  for (let x = 20; x < W; x += 96) ctx.fillRect(x, 236, 52, 36);
  // towers
  for (const tx of [260, 700, 1220, 1660]) {
    ctx.fillRect(tx - 55, 130, 110, 180);
    ctx.beginPath();
    ctx.moveTo(tx - 68, 136);
    ctx.lineTo(tx, 58);
    ctx.lineTo(tx + 68, 136);
    ctx.closePath();
    ctx.fill();
  }

  // side torch glows
  for (const [gx, gy] of [
    [175, 560],
    [1745, 560],
  ] as const) {
    const torch = ctx.createRadialGradient(gx, gy, 10, gx, gy, 330);
    torch.addColorStop(0, 'rgba(238, 142, 30, 0.4)');
    torch.addColorStop(1, 'rgba(238, 142, 30, 0)');
    ctx.fillStyle = torch;
    ctx.fillRect(gx - 340, gy - 340, 680, 680);
  }

  // hanging banners: red (left) / blue (right)
  const banner = (x: number, color: string, shade: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, 310);
    ctx.lineTo(x + 110, 310);
    ctx.lineTo(x + 110, 620);
    ctx.lineTo(x + 55, 690);
    ctx.lineTo(x, 620);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade;
    ctx.fillRect(x, 310, 26, 330);
  };
  banner(120, 'rgba(112, 24, 18, 0.9)', 'rgba(60, 10, 8, 0.9)');
  banner(1690, 'rgba(22, 40, 100, 0.9)', 'rgba(10, 20, 56, 0.9)');

  // stone floor with warm pool of light + arena rings
  const floor = ctx.createLinearGradient(0, 830, 0, H);
  floor.addColorStop(0, '#2a1809');
  floor.addColorStop(1, '#0d0704');
  ctx.fillStyle = floor;
  ctx.fillRect(0, 830, W, H - 830);

  const pool = ctx.createRadialGradient(960, 950, 30, 960, 950, 560);
  pool.addColorStop(0, 'rgba(206, 122, 34, 0.30)');
  pool.addColorStop(1, 'rgba(206, 122, 34, 0)');
  ctx.fillStyle = pool;
  ctx.fillRect(340, 800, 1240, 280);

  ctx.strokeStyle = 'rgba(216, 160, 62, 0.30)';
  ctx.lineWidth = 3;
  for (const [rx, ry] of [
    [420, 96],
    [318, 72],
    [212, 48],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(960, 958, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // floor joint lines fanning out
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 2;
  for (let i = -5; i <= 5; i++) {
    ctx.beginPath();
    ctx.moveTo(960 + i * 60, 856);
    ctx.lineTo(960 + i * 200, H);
    ctx.stroke();
  }

  // vignette
  const vig = ctx.createRadialGradient(960, 520, 380, 960, 540, 1150);
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  return Texture.from(canvas);
}
