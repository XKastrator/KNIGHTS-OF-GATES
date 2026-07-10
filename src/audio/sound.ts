/**
 * Tiny Web-Audio SFX manager. WAVs live in /public/assets/sfx — swap the
 * files for designed audio without touching code.
 *
 * The AudioContext is created lazily on the first user gesture (autoplay
 * policy) and all buffers are fetched/decoded once.
 */

const FILES: Record<string, string> = {
  spin: 'assets/sfx/spin.wav',
  stop: 'assets/sfx/stop.wav',
  riser: 'assets/sfx/riser.wav',
  clash: 'assets/sfx/clash.wav',
  victory: 'assets/sfx/victory.wav',
  win: 'assets/sfx/win.wav',
  bigwin: 'assets/sfx/bigwin.wav',
};

export interface PlayOpts {
  volume?: number;
  rate?: number;
  /** seconds from now */
  delay?: number;
}

class SoundManager {
  enabled: boolean;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loadStarted = false;

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
      void this.loadAll();
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

  play(name: keyof typeof FILES | string, opts: PlayOpts = {}): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = opts.rate ?? 1;
    const gain = this.ctx.createGain();
    gain.gain.value = opts.volume ?? 1;
    src.connect(gain);
    gain.connect(this.master);
    src.start(this.ctx.currentTime + (opts.delay ?? 0));
  }
}

export const sound = new SoundManager();
