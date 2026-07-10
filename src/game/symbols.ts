import { Container, Graphics, Renderer, Text, TextStyle, Texture } from 'pixi.js';
import { CELL, SYMBOLS, TILE } from '../config';

/**
 * Placeholder symbol tiles (stone plaque + glyph), rendered once to textures.
 * When real symbol art arrives, swap this for plain texture loading —
 * the reels only care about receiving Texture[] in SYMBOLS order.
 */
export function buildSymbolTextures(renderer: Renderer): Texture[] {
  return SYMBOLS.map((def) => {
    const c = new Container();
    const m = (CELL - TILE) / 2; // tile margin inside the cell

    const tile = new Graphics();
    // stone plaque
    tile.roundRect(m, m, TILE, TILE, 16).fill(0x23272e).stroke({ width: 3, color: 0x11141a });
    // top light / bottom shade for a beveled feel
    tile.roundRect(m + 4, m + 4, TILE - 8, (TILE - 8) / 2, 12).fill({ color: 0xffffff, alpha: 0.045 });
    tile.roundRect(m + 6, m + TILE - 26, TILE - 12, 20, 10).fill({ color: 0x000000, alpha: 0.22 });
    // gold inner fillet
    tile.roundRect(m + 6, m + 6, TILE - 12, TILE - 12, 12).stroke({ width: 2, color: 0xc9a23f, alpha: 0.5 });
    // accent glow behind the glyph
    tile.circle(CELL / 2, CELL / 2, 42).fill({ color: def.color, alpha: 0.13 });
    c.addChild(tile);

    if (def.art === 'letter') {
      const style = new TextStyle({
        fontFamily: ['Cinzel', 'Georgia', 'serif'],
        fontWeight: '800',
        fontSize: def.text!.length > 1 ? 52 : 64,
        fill: def.textColor ?? 0xffffff,
        stroke: { color: 0x0d0f13, width: 6 },
        dropShadow: { color: 0x000000, blur: 4, distance: 3, angle: Math.PI / 2, alpha: 0.55 },
      });
      const t = new Text({ text: def.text!, style });
      t.anchor.set(0.5);
      t.position.set(CELL / 2, CELL / 2);
      c.addChild(t);
      // colored underline pip to differentiate royals at a glance
      const pip = new Graphics();
      pip.roundRect(CELL / 2 - 18, CELL / 2 + 38, 36, 6, 3).fill(def.color);
      c.addChild(pip);
    } else if (def.art === 'vs') {
      // duel trigger: blue vs red split with crossed blades
      const split = new Graphics();
      split.moveTo(m + 6, m + 6).lineTo(m + TILE - 6, m + 6).lineTo(m + 6, m + TILE - 6).closePath().fill(0x24408f);
      split
        .moveTo(m + TILE - 6, m + 6)
        .lineTo(m + TILE - 6, m + TILE - 6)
        .lineTo(m + 6, m + TILE - 6)
        .closePath()
        .fill(0x8f2020);
      split.moveTo(m + TILE - 6, m + 6).lineTo(m + 6, m + TILE - 6).stroke({ width: 3, color: 0xc9a23f });
      split.roundRect(m + 6, m + 6, TILE - 12, TILE - 12, 12).stroke({ width: 2.5, color: 0xc9a23f });
      c.addChild(split);
      const blades = new Graphics();
      blades.roundRect(-38, -5, 76, 10, 4).fill(0xdfe6ee).stroke({ width: 2, color: 0x5c6774 });
      blades.rotation = Math.PI / 4;
      blades.position.set(CELL / 2, CELL / 2);
      const blades2 = new Graphics();
      blades2.roundRect(-38, -5, 76, 10, 4).fill(0xdfe6ee).stroke({ width: 2, color: 0x5c6774 });
      blades2.rotation = -Math.PI / 4;
      blades2.position.set(CELL / 2, CELL / 2);
      c.addChild(blades, blades2);
      const vsText = new Text({
        text: 'VS',
        style: new TextStyle({
          fontFamily: ['Cinzel', 'Georgia', 'serif'],
          fontWeight: '900',
          fontSize: 44,
          fill: 0xf5c542,
          stroke: { color: 0x1a1206, width: 7 },
          dropShadow: { color: 0x000000, blur: 5, distance: 3, angle: Math.PI / 2, alpha: 0.7 },
        }),
      });
      vsText.anchor.set(0.5);
      vsText.position.set(CELL / 2, CELL / 2);
      c.addChild(vsText);
    } else if (def.art === 'wild') {
      // gold plaque
      const gold = new Graphics();
      gold.roundRect(m + 6, m + 6, TILE - 12, TILE - 12, 12).fill(0xdfb44a).stroke({ width: 3, color: 0x7a5c1a });
      gold.roundRect(m + 10, m + 10, TILE - 20, (TILE - 20) / 2, 10).fill({ color: 0xffffff, alpha: 0.16 });
      c.addChild(gold);
      const t = new Text({
        text: 'WILD',
        style: new TextStyle({
          fontFamily: ['Cinzel', 'Georgia', 'serif'],
          fontWeight: '900',
          fontSize: 34,
          fill: 0x241a04,
          stroke: { color: 0xf7e6b0, width: 2 },
          letterSpacing: 2,
        }),
      });
      t.anchor.set(0.5);
      t.position.set(CELL / 2, CELL / 2);
      c.addChild(t);
    } else {
      c.addChild(drawIcon(def.art));
    }

    return renderer.generateTexture({ target: c, resolution: 2 });
  });
}

/** Hand-drawn premium glyphs, centered in the CELL box. */
function drawIcon(id: string): Graphics {
  const g = new Graphics();
  switch (id) {
    case 'sword': {
      // blade (tip up)
      g.poly([68, 14, 79, 30, 76, 84, 60, 84, 57, 30])
        .fill(0xdfe6ee)
        .stroke({ width: 2.5, color: 0x5c6774 });
      g.rect(66, 32, 4, 48).fill(0xaab4c2); // fuller
      g.roundRect(42, 82, 52, 11, 5).fill(0xcfa34a).stroke({ width: 2, color: 0x6d5216 }); // crossguard
      g.roundRect(62, 93, 12, 24, 4).fill(0x5a3a1c).stroke({ width: 2, color: 0x2e1c0c }); // grip
      g.circle(68, 122, 7).fill(0xcfa34a).stroke({ width: 2, color: 0x6d5216 }); // pommel
      break;
    }
    case 'shield': {
      g.moveTo(38, 26)
        .lineTo(98, 26)
        .lineTo(98, 68)
        .quadraticCurveTo(98, 102, 68, 120)
        .quadraticCurveTo(38, 102, 38, 68)
        .closePath()
        .fill(0xa03a30)
        .stroke({ width: 4, color: 0xcfa34a });
      g.rect(64, 36, 8, 58).fill(0xe9c765);
      g.rect(48, 54, 40, 8).fill(0xe9c765);
      break;
    }
    case 'helm': {
      g.moveTo(40, 72)
        .quadraticCurveTo(40, 24, 68, 24)
        .quadraticCurveTo(96, 24, 96, 72)
        .lineTo(96, 100)
        .lineTo(40, 100)
        .closePath()
        .fill(0xb9c4d2)
        .stroke({ width: 3, color: 0x5c6774 });
      g.rect(46, 62, 44, 7).fill(0x232830); // visor slit
      g.rect(64, 62, 8, 32).fill(0x232830); // nose bar
      g.poly([58, 24, 78, 24, 68, 6]).fill(0xb8433a); // plume
      break;
    }
    case 'crown': {
      g.poly([40, 86, 40, 48, 54, 72, 68, 40, 82, 72, 96, 48, 96, 86])
        .fill(0xe2b64f)
        .stroke({ width: 3, color: 0x7a5c1a });
      g.roundRect(38, 86, 60, 18, 4).fill(0xe2b64f).stroke({ width: 3, color: 0x7a5c1a });
      g.circle(52, 95, 4).fill(0x2f6fe0);
      g.circle(68, 95, 5).fill(0xb8433a);
      g.circle(84, 95, 4).fill(0x2f8f52);
      break;
    }
    case 'gate': {
      // arch backdrop
      g.moveTo(38, 118)
        .lineTo(38, 58)
        .quadraticCurveTo(38, 22, 68, 22)
        .quadraticCurveTo(98, 22, 98, 58)
        .lineTo(98, 118)
        .closePath()
        .fill(0x191f27)
        .stroke({ width: 3, color: 0x5c6774 });
      // portcullis bars
      for (let i = 0; i < 4; i++) {
        const bx = 46 + i * 15;
        g.rect(bx, 34 + (i === 0 || i === 3 ? 10 : 0), 5, 78 - (i === 0 || i === 3 ? 10 : 0)).fill(0x9fb4c8);
        g.poly([bx, 112, bx + 5, 112, bx + 2.5, 121]).fill(0x9fb4c8); // spike
      }
      for (const by of [48, 68, 88]) g.rect(42, by, 52, 5).fill(0x8496aa);
      break;
    }
  }
  return g;
}
