import { Application, Container, Graphics, NineSliceSprite, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { sound } from '../audio/sound';
import { BOARD_H, BOARD_W, BOARD_X, BOARD_Y, CELL, DESIGN, FRAME_BORDER, PLATE_PAD, STEP } from '../config';
import { buildFallbackBackground } from '../fallback/background';
import { buildFallbackFrame } from '../fallback/frame';
import { buildFallbackLogo } from '../fallback/logo';
import type { DuelResult } from '../rgs/client';
import { Eases, tween, wait } from '../util/tween';
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
    // in-reel duel window: slightly taller than the board, opened on demand
    const panel = new VsPanel(BOARD_H + 56);
    if (!(await panel.ready)) return; // video missing (e.g. offline dev) — skip
    this.world.addChild(panel.view); // stays on top; visible = false while idle
    this.vsPanel = panel;
  }

  /**
   * The in-reel duel sequence, opened out of the landed VS symbol:
   * stand-off with the multipliers → slow-motion approach with a camera
   * push-in → the single decisive blow (shake + sparks + flash) → blue
   * knight's victory and the award — then the panel folds back into the reel.
   */
  async playDuelSequence(duel: DuelResult): Promise<void> {
    if (this.dueling) return;
    this.dueling = true;
    const panel = this.vsPanel;
    const anchor = duel.positions[0] ?? { reel: 2, row: 2 };
    const tileX = BOARD_X + (anchor.reel + 0.5) * STEP;
    const tileY = BOARD_Y + (anchor.row + 0.5) * STEP;
    const cx = BOARD_X + BOARD_W / 2;
    const cy = BOARD_Y + BOARD_H / 2;

    void tween({ from: this.dim.alpha, to: 0.55, duration: 280, onUpdate: (v) => (this.dim.alpha = v) });

    if (panel) {
      const openScale = CELL / panel.panelH;
      this.world.setChildIndex(panel.view, this.world.children.length - 1);
      panel.view.visible = true;
      panel.view.alpha = 0;
      panel.view.position.set(tileX, tileY);
      panel.view.scale.set(openScale);
      panel.seek(0);
      panel.setZoom(1, 0.5);

      // 1) OPEN — the VS symbol unfolds into the duel window at board center
      sound.play('riser');
      sound.play('spin', { rate: 0.65, volume: 0.9 });
      await Promise.all([
        tween({ from: 0, to: 1, duration: 190, onUpdate: (v) => (panel.view.alpha = v) }),
        tween({ from: tileX, to: cx, duration: 720, ease: Eases.backOut(0.6), onUpdate: (v) => (panel.view.x = v) }),
        tween({ from: tileY, to: cy, duration: 720, ease: Eases.backOut(0.6), onUpdate: (v) => (panel.view.y = v) }),
        tween({
          from: openScale,
          to: 1,
          duration: 720,
          ease: Eases.backOut(0.6),
          onUpdate: (v) => panel.view.scale.set(v),
        }),
      ]);

      // 2) STAND-OFF — knights present their multipliers, slow push-in
      await tween({ from: 1, to: 1.1, duration: 1100, onUpdate: (v) => panel.setZoom(v, 0.5) });

      // 3) APPROACH — slow motion, camera dives toward the coming clash
      sound.play('riser', { rate: 1.18, volume: 0.85 });
      await Promise.all([
        panel.playRange(0, 0.42, 0.5),
        tween({ from: 1.1, to: 1.55, duration: 840, ease: Eases.quadIn, onUpdate: (v) => panel.setZoom(v, 0.52) }),
      ]);

      // 4) THE BLOW — full speed, one decisive strike
      sound.play('clash');
      this.shake(16, 420);
      this.sparks(cx, cy);
      this.whiteFlash();
      await panel.playRange(0.42, 0.63, 1);

      // 5) VICTORY — camera pulls back on the winning blue knight
      sound.play('victory');
      panel.flash(0.9);
      void tween({ from: 0.9, to: 0, duration: 800, onUpdate: (v) => panel.flash(v) });
      await Promise.all([
        panel.playRange(0.63, 1, 0.85),
        tween({ from: 1.55, to: 1.04, duration: 640, ease: Eases.cubicOut, onUpdate: (v) => panel.setZoom(v, 0.5) }),
      ]);

      // 6) AWARD — floating multiplier + amount, hold the pose
      this.showAward(cx, cy - panel.panelH * 0.26, duel);
      sound.play('win', { volume: 0.9 });
      await wait(1250);

      // 7) CLOSE — fold back into the reel tile
      await Promise.all([
        tween({ from: 1, to: openScale, duration: 430, ease: Eases.quadIn, onUpdate: (v) => panel.view.scale.set(v) }),
        tween({ from: cx, to: tileX, duration: 430, ease: Eases.quadIn, onUpdate: (v) => (panel.view.x = v) }),
        tween({ from: cy, to: tileY, duration: 430, ease: Eases.quadIn, onUpdate: (v) => (panel.view.y = v) }),
      ]);
      await tween({ from: 1, to: 0, duration: 150, onUpdate: (v) => (panel.view.alpha = v) });
      panel.view.visible = false;
      panel.setZoom(1, 0.5);
      panel.seek(0);
    } else {
      await wait(600); // video unavailable — brief pause, award still lands
    }

    await tween({ from: this.dim.alpha, to: 0, duration: 300, onUpdate: (v) => (this.dim.alpha = v) });
    this.dueling = false;
  }

  /** Quick white screen pop at the moment of impact. */
  private whiteFlash(): void {
    const flash = new Graphics();
    flash.rect(-200, -200, DESIGN.width + 400, DESIGN.height + 400).fill(0xffffff);
    flash.eventMode = 'none';
    this.world.addChild(flash);
    flash.alpha = 0.75;
    void tween({ from: 0.75, to: 0, duration: 220, onUpdate: (v) => (flash.alpha = v) }).then(() =>
      flash.destroy(),
    );
  }

  /** "2x  +$X" floating up from the duel window. */
  private showAward(x: number, y: number, duel: DuelResult): void {
    const label = `${duel.multiplier}x  +$${duel.award.toFixed(2)}`;
    const text = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: ['Cinzel', 'Georgia', 'serif'],
        fontWeight: '900',
        fontSize: 64,
        fill: 0xffe9a8,
        stroke: { color: 0x4c380c, width: 8 },
        dropShadow: { color: 0x000000, blur: 8, distance: 5, angle: Math.PI / 2.5, alpha: 0.8 },
      }),
    });
    text.anchor.set(0.5);
    text.position.set(x, y);
    text.scale.set(0.4);
    this.world.addChild(text);
    void tween({ from: 0.4, to: 1, duration: 260, ease: Eases.backOut(1.6), onUpdate: (v) => text.scale.set(v) });
    void tween({ from: y, to: y - 90, duration: 1500, ease: Eases.quadOut, onUpdate: (v) => (text.y = v) });
    void tween({ from: 1, to: 0, duration: 1500, ease: Eases.quadIn, onUpdate: (v) => (text.alpha = v) }).then(
      () => text.destroy(),
    );
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
