import { Container, Graphics, Sprite, Texture, VideoSource } from 'pixi.js';

/**
 * The knight-duel side panel, driven by a 60fps video texture
 * (public/assets/vs.webm — encoded from the delivered 60-frame spritesheet;
 * blue knight wins).
 *
 * Idle shows the first frame (both knights + multipliers); play() runs the
 * one-second duel and holds the victory frame.
 */
export class VsPanel {
  readonly view = new Container();
  readonly ready: Promise<boolean>;

  private video: HTMLVideoElement | null = null;
  private source: VideoSource | null = null;
  private glow: Graphics | null = null;

  constructor(displayHeight: number) {
    this.ready = this.init(displayHeight);
  }

  private async init(displayHeight: number): Promise<boolean> {
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

    const scale = displayHeight / video.videoHeight;
    const w = video.videoWidth * scale;
    const h = displayHeight;

    // soft gold aura behind the panel — pulsed during the duel
    const glow = new Graphics();
    glow.roundRect(-w / 2 - 10, -h / 2 - 10, w + 20, h + 20, 22).stroke({ width: 16, color: 0xf5c542 });
    glow.alpha = 0;
    this.glow = glow;
    this.view.addChild(glow);

    const sprite = new Sprite(new Texture({ source: this.source }));
    sprite.anchor.set(0.5);
    sprite.scale.set(scale);
    this.view.addChild(sprite);
    return true;
  }

  /** Runs the duel video once; resolves when it ends (victory frame holds). */
  async play(): Promise<void> {
    const video = this.video;
    if (!video) return;
    video.currentTime = 0;
    await video.play().catch(() => {});
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      video.addEventListener('ended', finish, { once: true });
      setTimeout(finish, 1500); // safety net
    });
  }

  /** Back to the idle stand-off frame. */
  reset(): void {
    if (this.video) this.video.currentTime = 0;
  }

  /** Gold aura flash (victory beat). */
  flash(alpha: number): void {
    if (this.glow) this.glow.alpha = alpha;
  }
}
