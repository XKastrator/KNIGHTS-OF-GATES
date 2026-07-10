import { Application, Container, Graphics, NineSliceSprite, Sprite, Texture } from 'pixi.js';
import { BOARD_H, BOARD_W, BOARD_X, BOARD_Y, DESIGN, FRAME_BORDER, PLATE_PAD } from '../config';
import { buildFallbackBackground } from '../fallback/background';
import { buildFallbackFrame } from '../fallback/frame';
import { buildFallbackLogo } from '../fallback/logo';
import { tween } from '../util/tween';
import { SlotMachine } from './SlotMachine';

export interface SceneTextures {
  bg: Texture | null;
  frame: Texture | null;
  logo: Texture | null;
}

/**
 * Assembles the full table: background, logo, reel plate + frame, reels, win glow.
 * Uses delivered art from /public/assets when present, generated stand-ins otherwise.
 */
export class SlotScene {
  readonly machine: SlotMachine;

  private app: Application;
  private bg: Sprite;
  private world = new Container();
  private winGlow: Graphics;

  constructor(app: Application, tex: SceneTextures, symbolTextures: Texture[]) {
    this.app = app;

    // --- background layer (covers the whole window, outside world scaling)
    this.bg = new Sprite(tex.bg ?? buildFallbackBackground());
    this.bg.anchor.set(0.5);
    app.stage.addChild(this.bg);

    // --- world: fixed 1920×1080 design space, scaled to fit
    app.stage.addChild(this.world);

    // logo — left column, vertically near the top
    if (tex.logo) {
      const logo = new Sprite(tex.logo);
      logo.anchor.set(0.5);
      logo.width = 460;
      logo.scale.y = logo.scale.x;
      logo.position.set(BOARD_X / 2, 250);
      this.world.addChild(logo);
    } else {
      const logo = buildFallbackLogo();
      logo.position.set(BOARD_X / 2, 250);
      this.world.addChild(logo);
    }

    // dark plate behind the symbols so reels read against the busy painting
    const plate = new Graphics();
    plate
      .roundRect(BOARD_X - PLATE_PAD, BOARD_Y - PLATE_PAD, BOARD_W + 2 * PLATE_PAD, BOARD_H + 2 * PLATE_PAD, 16)
      .fill({ color: 0x0b0e13, alpha: 0.78 });
    this.world.addChild(plate);

    // reels
    this.machine = new SlotMachine(symbolTextures, app.ticker);
    this.machine.container.position.set(BOARD_X, BOARD_Y);
    this.world.addChild(this.machine.container);

    // frame on top of the reel edges
    if (tex.frame) {
      const slice = Math.min(tex.frame.width, tex.frame.height) * 0.24;
      const frame = new NineSliceSprite({
        texture: tex.frame,
        leftWidth: slice,
        rightWidth: slice,
        topHeight: slice,
        bottomHeight: slice,
      });
      const overhang = PLATE_PAD + 64; // how far the art frame extends past the window
      frame.width = BOARD_W + 2 * overhang;
      frame.height = BOARD_H + 2 * overhang;
      frame.position.set(BOARD_X - overhang, BOARD_Y - overhang);
      this.world.addChild(frame);
    } else {
      const frame = buildFallbackFrame(BOARD_W, BOARD_H, PLATE_PAD, FRAME_BORDER);
      frame.position.set(BOARD_X, BOARD_Y);
      this.world.addChild(frame);
    }

    // win glow pulse around the board
    this.winGlow = new Graphics();
    const gp = PLATE_PAD + FRAME_BORDER / 2;
    this.winGlow
      .roundRect(BOARD_X - gp, BOARD_Y - gp, BOARD_W + 2 * gp, BOARD_H + 2 * gp, 30)
      .stroke({ width: 14, color: 0xf5c542, alpha: 1 });
    this.winGlow.alpha = 0;
    this.world.addChild(this.winGlow);

    // Re-layout whenever the renderer's size actually changes. A plain window
    // "resize" listener fires before Pixi applies its own resize, which left
    // the scene scaled for stale dimensions.
    let lastW = 0;
    let lastH = 0;
    app.ticker.add(() => {
      const w = app.renderer.width;
      const h = app.renderer.height;
      if (w !== lastW || h !== lastH) {
        lastW = w;
        lastH = h;
        this.layout();
      }
    });
    this.layout();
  }

  /** Fits the world to the window (contain) and the background to cover it. */
  private layout(): void {
    const w = this.app.renderer.width / this.app.renderer.resolution;
    const h = this.app.renderer.height / this.app.renderer.resolution;

    const cover = Math.max(w / this.bg.texture.width, h / this.bg.texture.height);
    this.bg.scale.set(cover);
    this.bg.position.set(w / 2, h / 2);

    const fit = Math.min(w / DESIGN.width, h / DESIGN.height);
    this.world.scale.set(fit);
    this.world.position.set((w - DESIGN.width * fit) / 2, (h - DESIGN.height * fit) / 2);
  }

  /** Gold pulse around the frame on a win. */
  async flashWin(): Promise<void> {
    for (let i = 0; i < 2; i++) {
      await tween({ from: 0, to: 0.85, duration: 160, onUpdate: (v) => (this.winGlow.alpha = v) });
      await tween({ from: 0.85, to: 0, duration: 420, onUpdate: (v) => (this.winGlow.alpha = v) });
    }
  }
}
