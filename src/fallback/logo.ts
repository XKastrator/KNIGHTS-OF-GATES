import { Container, Graphics, Text, TextStyle } from 'pixi.js';

/**
 * Generated stand-in for the "Knights of Gates" logo.
 * Replaced automatically by /public/assets/logo.png when present.
 * Returned container is centered on (0,0).
 */
export function buildFallbackLogo(): Container {
  const c = new Container();

  const plate = new Graphics();
  plate.roundRect(-235, -80, 470, 160, 18).fill({ color: 0x12151b, alpha: 0.88 }).stroke({ width: 2.5, color: 0xc9a23f });
  plate.roundRect(-227, -72, 454, 144, 14).stroke({ width: 1, color: 0x8a6a20, alpha: 0.6 });
  c.addChild(plate);

  const gold = (size: number, spacing: number) =>
    new TextStyle({
      fontFamily: ['Cinzel', 'Georgia', 'serif'],
      fontWeight: '900',
      fontSize: size,
      fill: 0xe9c765,
      stroke: { color: 0x4c380c, width: 5 },
      letterSpacing: spacing,
      dropShadow: { color: 0x000000, blur: 6, distance: 4, angle: Math.PI / 2.5, alpha: 0.7 },
    });

  const top = new Text({ text: 'KNIGHTS', style: gold(58, 6) });
  top.anchor.set(0.5);
  top.y = -32;
  c.addChild(top);

  const bottom = new Text({ text: 'OF GATES', style: gold(36, 10) });
  bottom.anchor.set(0.5);
  bottom.y = 34;
  c.addChild(bottom);

  // divider with a diamond
  const div = new Graphics();
  div.moveTo(-150, 2).lineTo(-16, 2).moveTo(16, 2).lineTo(150, 2).stroke({ width: 2, color: 0xc9a23f, alpha: 0.9 });
  div.poly([0, -8, 8, 2, 0, 12, -8, 2]).fill(0xe9c765).stroke({ width: 1.5, color: 0x6d5518 });
  c.addChild(div);

  return c;
}
