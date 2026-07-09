import { Container, Graphics } from 'pixi.js';

/**
 * Generated steel-and-gold ornamental frame around the reel window.
 * Replaced automatically by a nine-slice of /public/assets/frame.png when present.
 * (0,0) of the returned container = top-left of the symbol window.
 */
export function buildFallbackFrame(innerW: number, innerH: number, pad: number, border: number): Container {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);

  const x = -pad - border / 2;
  const y = -pad - border / 2;
  const w = innerW + 2 * pad + border;
  const h = innerH + 2 * pad + border;

  // steel band, layered strokes for a bevel feel
  g.roundRect(x, y, w, h, 30).stroke({ width: border + 10, color: 0x15181d });
  g.roundRect(x, y, w, h, 30).stroke({ width: border, color: 0x363c46 });
  g.roundRect(x - border * 0.28, y - border * 0.28, w + border * 0.56, h + border * 0.56, 34).stroke({ width: 3, color: 0x59616d, alpha: 0.9 });

  // gold trim: outer + inner fillets
  g.roundRect(x - border / 2 - 4, y - border / 2 - 4, w + border + 8, h + border + 8, 36).stroke({ width: 3.5, color: 0xc9a23f, alpha: 0.95 });
  g.roundRect(x + border / 2 + 4, y + border / 2 + 4, w - border - 8, h - border - 8, 18).stroke({ width: 3, color: 0xc9a23f, alpha: 0.9 });
  g.roundRect(x + border / 2 + 10, y + border / 2 + 10, w - border - 20, h - border - 20, 14).stroke({ width: 1.5, color: 0x8a6a20, alpha: 0.7 });

  // rivets along the band
  const rivet = (rx: number, ry: number) => {
    g.circle(rx, ry, 4).fill(0x6d7683).stroke({ width: 1.5, color: 0x1c2026 });
  };
  const midX = x + w / 2;
  const midY = y + h / 2;
  for (const t of [0.25, 0.75]) {
    rivet(x + w * t, y);
    rivet(x + w * t, y + h);
    rivet(x, y + h * t);
    rivet(x + w, y + h * t);
  }

  // ornamental diamonds — corners + edge midpoints
  const diamond = (dx: number, dy: number, s: number) => {
    g.poly([dx, dy - s, dx + s * 0.72, dy, dx, dy + s, dx - s * 0.72, dy])
      .fill(0xd6b354)
      .stroke({ width: 3, color: 0x6d5518 });
    g.poly([dx, dy - s * 0.45, dx + s * 0.32, dy, dx, dy + s * 0.45, dx - s * 0.32, dy]).fill(0xf4dc8e);
  };
  const cx0 = x;
  const cy0 = y;
  const cx1 = x + w;
  const cy1 = y + h;
  diamond(cx0, cy0, 40);
  diamond(cx1, cy0, 40);
  diamond(cx0, cy1, 40);
  diamond(cx1, cy1, 40);
  diamond(midX, cy0, 30);
  diamond(midX, cy1, 30);
  diamond(cx0, midY, 30);
  diamond(cx1, midY, 30);

  return c;
}
