/**
 * Tiny Web-Audio SFX manager. WAVs live in /public/assets/sfx — swap the
 * files for designed audio without touching code.
 *
 * The AudioContext is created lazily on the first user gesture (autoplay
 * policy) and all buffers are fetched/decoded once. Loops (reel whirr,
 * ambience, anticipation) return a handle with stop().
 */

const FILES: Record<string, string> = {
  spin: 'assets/sfx/spin.wav',
  stop: 'assets/sfx/stop.wav',
  riser: 'assets/sfx/riser.wav',
  clash: 'assets/sfx/clash.wav',
  victory: 'assets/sfx/victory.wav',
  win: 'assets/sfx/win.wav',
  bigwin: 'assets/sfx/bigwin.wav',
  megawin: 'assets/sfx/megawin.wav',
  reel_loop: 'assets/sfx/reel_loop.wav',
  rollup_tick: 'assets/sfx/rollup_tick.wav',
  rollup_end: 'assets/sfx/rollup_end.wav',
  click: 'assets/sfx/click.wav',
  anticipation: 'assets/sfx/anticipation.wav',
  ambience: 'assets/sfx/ambience.wav',
};

export interface PlayOpts {
  volume?: number;
  rate?: number;
  /** seconds from now */
  delay?: number;
  loop?: boolean;
  /** seconds of fade-out used by handle.stop() */
  fadeOut?: number;
}

export interface SoundHandle {
  stop(): void;
  setVolume(v: number): void;
}

const NOOP_HANDLE: SoundHandle = { stop: () => {}, setVolume: () => {} };

class SoundManager {
  enabled: boolean;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loadStarted = false;
  private ambienceHandle: SoundHandle | null = null;

  constructor() {
    this.enabled = localStorage.getItem('kog-sound') !== 'off';
    const boot = () => {
      this.ensureContext();
      window.removeEventListener('pointerdown', boot);
      window.removeEventListener('keydown', boot);
    };
    window.addEventListener('pointerdown', boot);
    window.addEventListener('keydown', boot);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    localStorage.setItem('kog-sound', on ? 'on' : 'off');
    if (!on) {
      this.ambienceHandle?.stop();
      this.ambienceHandle = null;
    } else {
      this.startAmbience();
    }
  }

  private ensureContext(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (!this.loadStarted) {
      this.loadStarted = true;
      void this.loadAll().then(() => this.startAmbience());
    }
  }

  private async loadAll(): Promise<void> {
    await Promise.all(
      Object.entries(FILES).map(async ([name, url]) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const buf = await this.ctx!.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(name, buf);
        } catch {
          /* missing/undecodable file — that sound stays silent */
        }
      }),
    );
  }

  /** quiet castle courtyard bed under everything */
  private startAmbience(): void {
    if (!this.enabled || this.ambienceHandle) return;
    const handle = this.play('ambience', { loop: true, volume: 0.5 });
    if (handle !== NOOP_HANDLE) this.ambienceHandle = handle;
  }

  play(name: keyof typeof FILES | string, opts: PlayOpts = {}): SoundHandle {
    if (!this.enabled || !this.ctx || !this.master) return NOOP_HANDLE;
    const buffer = this.buffers.get(name);
    if (!buffer) return NOOP_HANDLE;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = opts.loop ?? false;
    src.playbackRate.value = opts.rate ?? 1;
    const gain = ctx.createGain();
    gain.gain.value = opts.volume ?? 1;
    src.connect(gain);
    gain.connect(this.master);
    src.start(ctx.currentTime + (opts.delay ?? 0));
    const fade = opts.fadeOut ?? 0.08;
    return {
      stop: () => {
        try {
          gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
          src.stop(ctx.currentTime + fade);
        } catch {
          /* already stopped */
        }
      },
      setVolume: (v: number) => {
        gain.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
      },
    };
  }
}

export const sound = new SoundManager();
