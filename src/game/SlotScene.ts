import { Application, Container, Graphics, NineSliceSprite, Sprite, Texture } from 'pixi.js';
import { sound } from '../audio/sound';
import { BOARD_H, BOARD_W, BOARD_X, BOARD_Y, DESIGN, FRAME_BORDER, PLATE_PAD } from '../config';
import { buildFallbackBackground } from '../fallback/background';
import { buildFallbackFrame } from '../fallback/frame';
import { buildFallbackLogo } from '../fallback/logo';
import { Eases, tween } from '../util/tween';
import { SlotMachine } from './SlotMachine';
import { VsPanel } from './VsPanel';

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
  private vsPanel: VsPanel | null = null;
  private dim: Graphics;
  private sparkTexture: Texture;
  private worldBase = { x: 0, y: 0 };
  private dueling = false;

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

    // full-scene dim used during the duel; sits on top of the world
    this.dim = new Graphics();
    this.dim.rect(-200, -200, DESIGN.width + 400, DESIGN.height + 400).fill(0x000000);
    this.dim.alpha = 0;
    this.dim.eventMode = 'none';
    this.world.addChild(this.dim);

    // knight-duel side panel (right column), async — scene works without it
    void this.initVsPanel();

    this.sparkTexture = app.renderer.generateTexture({
      target: new Graphics().circle(0, 0, 4).fill(0xffe9a8),
      resolution: 2,
    });

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
    this.worldBase = { x: (w - DESIGN.width * fit) / 2, y: (h - DESIGN.height * fit) / 2 };
    this.world.position.set(this.worldBase.x, this.worldBase.y);
  }

  private async initVsPanel(): Promise<void> {
    const boardCenterY = BOARD_Y + BOARD_H / 2;
    const panel = new VsPanel(BOARD_H + 2 * (PLATE_PAD + FRAME_BORDER + 12));
    if (!(await panel.ready)) return; // video missing (e.g. offline dev) — skip
    const rightEdge = BOARD_X + BOARD_W + PLATE_PAD + FRAME_BORDER + 24;
    panel.view.position.set((rightEdge + DESIGN.width) / 2, boardCenterY);
    // idle: below the dim layer; playDuel() raises it above for the fight
    this.world.addChildAt(panel.view, this.world.getChildIndex(this.dim));
    this.vsPanel = panel;
  }

  /**
   * The duel: dim the table, run the 60fps clash (blue knight wins),
   * shake on impact, spark burst, victory sting. Resolves when done.
   */
  async playDuel(): Promise<void> {
    const panel = this.vsPanel;
    if (!panel || this.dueling) return;
    this.dueling = true;

    // panel above the dim for the duration of the fight
    this.world.setChildIndex(panel.view, this.world.children.length - 1);

    sound.play('riser');
    void tween({ from: this.dim.alpha, to: 0.5, duration: 220, onUpdate: (v) => (this.dim.alpha = v) });
    void tween({
      from: 1,
      to: 1.05,
      duration: 220,
      ease: Eases.quadOut,
      onUpdate: (v) => panel.view.scale.set(v),
    });

    // impact beat ~frame 30 of 60 @ 60fps
    const clashAt = setTimeout(() => {
      sound.play('clash');
      this.shake(13, 380);
      this.sparks(panel.view.x, panel.view.y);
    }, 470);

    await panel.play();
    clearTimeout(clashAt);

    sound.play('victory');
    panel.flash(0.9);
    void tween({ from: 0.9, to: 0, duration: 700, onUpdate: (v) => panel.flash(v) });
    await tween({ from: this.dim.alpha, to: 0, duration: 320, onUpdate: (v) => (this.dim.alpha = v) });
    await tween({ from: 1.05, to: 1, duration: 180, onUpdate: (v) => panel.view.scale.set(v) });

    // hold the victory pose for a bit, then ease back to the stand-off frame
    setTimeout(() => {
      panel.reset();
      if (this.vsPanel) {
        this.world.setChildIndex(this.vsPanel.view, this.world.getChildIndex(this.dim));
      }
    }, 4000);
    this.dueling = false;
  }

  /** Decaying random world offset — impact feedback. */
  private shake(intensity: number, durationMs: number): void {
    let elapsed = 0;
    const tick = () => {
      elapsed += this.app.ticker.deltaMS;
      const k = Math.min(1, elapsed / durationMs);
      const amp = intensity * (1 - k) ** 2;
      this.world.position.set(
        this.worldBase.x + (Math.random() * 2 - 1) * amp,
        this.worldBase.y + (Math.random() * 2 - 1) * amp,
      );
      if (k >= 1) {
        this.world.position.set(this.worldBase.x, this.worldBase.y);
        this.app.ticker.remove(tick);
      }
    };
    this.app.ticker.add(tick);
  }

  /** Radial burst of gold sparks at (x, y) in world space. */
  private sparks(x: number, y: number): void {
    const parts: { s: Sprite; vx: number; vy: number }[] = [];
    for (let i = 0; i < 26; i++) {
      const s = new Sprite(this.sparkTexture);
      s.anchor.set(0.5);
      s.position.set(x, y);
      s.blendMode = 'add';
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 12;
      parts.push({ s, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 3 });
      this.world.addChild(s);
    }
    let elapsed = 0;
    const life = 560;
    const tick = () => {
      const dt = this.app.ticker.deltaMS;
      elapsed += dt;
      const k = elapsed / life;
      for (const p of parts) {
        p.vy += 0.35;
        p.s.x += p.vx;
        p.s.y += p.vy;
        p.s.alpha = 1 - k;
        p.s.scale.set(1 - k * 0.6);
      }
      if (k >= 1) {
        this.app.ticker.remove(tick);
        parts.forEach((p) => p.s.destroy());
      }
    };
    this.app.ticker.add(tick);
  }


  /** Gold pulse around the frame on a win. */
  async flashWin(): Promise<void> {
    for (let i = 0; i < 2; i++) {
      await tween({ from: 0, to: 0.85, duration: 160, onUpdate: (v) => (this.winGlow.alpha = v) });
      await tween({ from: 0.85, to: 0, duration: 420, onUpdate: (v) => (this.winGlow.alpha = v) });
    }
  }
}
