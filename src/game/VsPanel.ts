import { Container, Graphics, Sprite, Texture, Ticker, VideoSource } from 'pixi.js';

/**
 * The knight-duel panel, driven by a 60fps video texture
 * (public/assets/vs.webm — encoded from the delivered frames; blue wins).
 *
 * Hidden by default; SlotScene opens it OUT OF the landed VS symbol, plays a
 * staged sequence (stand-off → slow-mo approach → the blow → victory) and
 * closes it back into the reel. A rounded mask turns the panel into a window,
 * so camera zooms (setZoom) read as close-ups.
 */
export class VsPanel {
  readonly view = new Container();
  readonly ready: Promise<boolean>;
  panelW = 0;
  panelH = 0;

  private video: HTMLVideoElement | null = null;
  private source: VideoSource | null = null;
  private sprite: Sprite | null = null;

  private glow: Graphics | null = null;

  constructor(displayHeight: number) {
    this.ready = this.init(displayHeight);
  }

  private async init(height: number): Promise<boolean> {
    const video = document.createElement('video');
    video.src = 'assets/vs.webm';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.loop = false;

    const ok = await new Promise<boolean>((resolve) => {
      video.addEventListener('loadeddata', () => resolve(true), { once: true });
      video.addEventListener('error', () => resolve(false), { once: true });
      setTimeout(() => resolve(video.readyState >= 2), 6000);
    });
    if (!ok) return false;

    this.video = video;
    this.source = new VideoSource({
      resource: video,
      autoPlay: false,
      autoLoad: true,
      updateFPS: 0, // refresh every rendered frame while playing
    });
    video.addEventListener('seeked', () => this.source?.update());

    const baseScale = height / video.videoHeight;
    this.panelW = video.videoWidth * baseScale;
    this.panelH = height;
    const w = this.panelW;
    const h = this.panelH;

    // gold aura (flashed on the victory beat)
    const glow = new Graphics();
    glow.roundRect(-w / 2 - 12, -h / 2 - 12, w + 24, h + 24, 26).stroke({ width: 18, color: 0xf5c542 });
    glow.alpha = 0;
    this.glow = glow;

    // masked window with the video inside
    const mask = new Graphics().roundRect(-w / 2, -h / 2, w, h, 18).fill(0xffffff);
    const sprite = new Sprite(new Texture({ source: this.source }));
    sprite.anchor.set(0.5);
    sprite.scale.set(baseScale);
    this.sprite = sprite;
    const inner = new Container();
    inner.addChild(sprite);
    inner.mask = mask;

    // steel + gold framing so the baked black edges read as intentional
    const border = new Graphics();
    border.roundRect(-w / 2 - 5, -h / 2 - 5, w + 10, h + 10, 22).stroke({ width: 9, color: 0x15181d });
    border.roundRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2, 19).stroke({ width: 3, color: 0xc9a23f });

    this.view.addChild(glow, mask, inner, border);
    this.view.visible = false;
    return true;
  }

  private get baseScale(): number {
    return this.video ? this.panelH / this.video.videoHeight : 1;
  }

  /** Camera: zoom factor k with the focal point at fy (0 = top, 1 = bottom). */
  setZoom(k: number, fy: number): void {
    const s = this.sprite;
    if (!s) return;
    s.scale.set(this.baseScale * k);
    s.y = -(fy - 0.5) * this.panelH * (k - 1);
  }

  /** Jump to a time (seconds) while paused — texture refreshes on seeked. */
  seek(t: number): void {
    if (this.video) this.video.currentTime = t;
  }

  /** Plays [from..to] seconds at `rate`, pausing on arrival. */
  async playRange(from: number, to: number, rate: number): Promise<void> {
    const video = this.video;
    if (!video) return;
    video.pause();
    video.currentTime = from;
    video.playbackRate = rate;
    await new Promise<void>((res) => {
      video.addEventListener('seeked', () => res(), { once: true });
      setTimeout(res, 250);
    });
    await video.play().catch(() => {});
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        Ticker.shared.remove(tick);
        video.pause();
        resolve();
      };
      const tick = () => {
        if (video.currentTime >= to - 0.008 || video.ended) finish();
      };
      Ticker.shared.add(tick);
      setTimeout(finish, ((to - from) / rate) * 1000 + 900);
    });
  }

  /** Gold aura intensity (victory flash). */
  flash(alpha: number): void {
    if (this.glow) this.glow.alpha = alpha;
  }
}
