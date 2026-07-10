import { Container, Sprite, Texture, Ticker } from 'pixi.js';
import { CELL, REEL, REEL_FILL_COUNT, ROWS, STEP } from '../config';
import { Eases } from '../util/tween';

const SPRITE_COUNT = ROWS + 2; // one buffer sprite above and below the window

type Phase = 'idle' | 'waiting' | 'pullback' | 'accel' | 'cruise' | 'land';

/**
 * One reel column, driven as a per-frame state machine — the feel of a
 * stepper-motor reel: wind-up, inertia with slight speed variance, motion
 * smear at speed, and a detent landing with overshoot ("clunk").
 *
 * `pos` counts symbols scrolled past; increasing pos moves the strip DOWN.
 * Sprite k sits at y = (k - 1 + frac(pos)) * STEP and shows strip index
 * floor(pos) - k, so at rest (pos = T) visible row r shows index T - 1 - r.
 *
 * Supports slam() (player-forced quick stop) and anticipation (slow crawl
 * with extended travel once an earlier reel teased a duel).
 */
export class Reel {
  readonly container = new Container();

  private sprites: Sprite[] = [];
  private spriteIdx: number[] = [];
  private strip = new Map<number, number>();
  private pos = ROWS + 3;
  private textures: Texture[];

  private phase: Phase = 'idle';
  private phaseT = 0; // ms inside current phase
  private waitMs = 0;
  private pullFrom = 0;
  private velocity = 0; // symbols/sec
  private maxSpeed = 0;
  private target = 0;
  private finals: number[] = [];
  private landFrom = 0;
  private landDur = 0;
  private squash = 1; // landing squash factor (composed with stretch)
  private squashT = 1e9;
  private anticipating = false;
  private turbo = false;
  private resolveSpin: (() => void) | null = null;

  /** fired the moment this reel settles (thud/squash/board-dip hooks) */
  onLand: ((reelIndex: number) => void) | null = null;
  private index = 0;

  constructor(textures: Texture[], ticker: Ticker) {
    this.textures = textures;
    for (let k = 0; k < SPRITE_COUNT; k++) {
      const s = new Sprite(this.textures[0]);
      s.anchor.set(0.5);
      this.sprites.push(s);
      this.spriteIdx.push(Number.NaN);
      this.container.addChild(s);
    }
    ticker.add((t) => this.update(t.deltaMS));
    this.update(0);
  }

  /** Symbol id at strip index i (lazily randomized; specials excluded). */
  private symAt(i: number): number {
    let v = this.strip.get(i);
    if (v === undefined) {
      v = Math.floor(Math.random() * REEL_FILL_COUNT);
      this.strip.set(i, v);
    }
    return v;
  }

  private pinFinals(target: number): void {
    for (let r = 0; r < ROWS; r++) this.strip.set(target - 1 - r, this.finals[r]);
  }

  private unpinFinals(target: number): void {
    for (let r = 0; r < ROWS; r++) {
      this.strip.set(target - 1 - r, Math.floor(Math.random() * REEL_FILL_COUNT));
    }
  }

  get spinning(): boolean {
    return this.phase !== 'idle';
  }

  /** Spins to land on `finals` (top row first). Resolves when settled. */
  spin(
    finals: number[],
    reelIndex: number,
    opts: { turbo: boolean; startDelay: number; distance: number },
  ): Promise<void> {
    this.index = reelIndex;
    this.turbo = opts.turbo;
    this.finals = finals;
    const speed = REEL.maxSpeed[opts.turbo ? 'turbo' : 'normal'];
    const variance = 1 + (Math.random() * 2 - 1) * REEL.speedVariance;
    this.maxSpeed = speed * variance;
    this.target = Math.ceil(this.pos) + opts.distance;
    this.pinFinals(this.target);
    this.anticipating = false;

    this.phase = 'waiting';
    this.phaseT = 0;
    this.waitMs = opts.startDelay;
    return new Promise((resolve) => (this.resolveSpin = resolve));
  }

  /**
   * Anticipation: an earlier reel teased the duel — crawl dramatically and
   * travel a little further before the (heavier) detent lands.
   */
  enterAnticipation(): void {
    if (this.phase !== 'cruise' && this.phase !== 'accel' && this.phase !== 'waiting') return;
    if (this.anticipating) return;
    this.anticipating = true;
    const newTarget = this.target + REEL.anticipation.extraSymbols;
    this.unpinFinals(this.target);
    this.target = newTarget;
    this.pinFinals(this.target);
  }

  /** Player slam — cut the cruise short and drop onto the detent NOW. */
  slam(): void {
    if (this.phase === 'idle' || this.phase === 'land') return;
    const minTarget = Math.ceil(this.pos + 1.2);
    if (this.target > minTarget) {
      this.unpinFinals(this.target);
      this.target = minTarget;
      this.pinFinals(this.target);
    }
    this.anticipating = false;
    this.beginLand(REEL.slamLandMs);
  }

  private beginLand(duration: number): void {
    this.phase = 'land';
    this.phaseT = 0;
    this.landFrom = this.pos;
    this.landDur = duration;
  }

  private update(dt: number): void {
    this.phaseT += dt;

    switch (this.phase) {
      case 'waiting':
        if (this.phaseT >= this.waitMs) {
          this.phase = 'pullback';
          this.phaseT = 0;
          this.pullFrom = this.pos;
        }
        break;

      case 'pullback': {
        const k = Math.min(1, this.phaseT / REEL.pullbackMs);
        this.pos = this.pullFrom - REEL.pullback * Eases.quadOut(k);
        if (k >= 1) {
          this.phase = 'accel';
          this.phaseT = 0;
          this.velocity = 0;
        }
        break;
      }

      case 'accel': {
        const k = Math.min(1, this.phaseT / REEL.accelMs);
        this.velocity = this.maxSpeed * Eases.quadIn(k);
        this.pos += this.velocity * (dt / 1000);
        if (k >= 1) {
          this.phase = 'cruise';
          this.phaseT = 0;
        }
        break;
      }

      case 'cruise': {
        const targetSpeed = this.anticipating ? this.maxSpeed * REEL.anticipation.speedFactor : this.maxSpeed;
        // ease toward target speed so anticipation slows organically
        this.velocity += (targetSpeed - this.velocity) * Math.min(1, dt / 180);
        this.pos += this.velocity * (dt / 1000);
        if (this.target - this.pos <= REEL.landLead) {
          this.beginLand(
            this.anticipating
              ? REEL.anticipation.landMs
              : REEL.landMs[this.turbo ? 'turbo' : 'normal'],
          );
        }
        break;
      }

      case 'land': {
        const k = Math.min(1, this.phaseT / this.landDur);
        const eased = Eases.backOut(REEL.landOvershoot)(k);
        this.pos = this.landFrom + (this.target - this.landFrom) * eased;
        this.velocity = 0;
        if (k >= 1) {
          this.pos = this.target;
          this.phase = 'idle';
          this.anticipating = false;
          this.prune();
          // detent impact: squash the column, notify the machine
          this.squash = 0.88;
          this.squashT = 0;
          this.onLand?.(this.index);
          this.resolveSpin?.();
          this.resolveSpin = null;
        }
        break;
      }

      case 'idle':
        break;
    }

    // landing squash recovery: 0.88 → 1.03 → 1.0
    if (this.squashT < 400) {
      this.squashT += dt;
      const k = Math.min(1, this.squashT / 400);
      this.squash = 0.88 + (1 - 0.88) * Eases.backOut(2.2)(k);
      if (k >= 1) this.squash = 1;
    }

    this.layout();
  }

  private layout(): void {
    const base = Math.floor(this.pos);
    const frac = this.pos - base;
    // motion smear scales with velocity — reads as physical blur
    const speedK = Math.min(1, Math.abs(this.velocity) / REEL.maxSpeed.turbo);
    const stretchY = (1 + REEL.stretch * speedK) * this.squash;
    const stretchX = 1 - 0.07 * speedK + (1 - this.squash) * 0.5;

    for (let k = 0; k < SPRITE_COUNT; k++) {
      const s = this.sprites[k];
      s.x = CELL / 2;
      s.y = (k - 1 + frac) * STEP + CELL / 2;
      s.scale.set(stretchX, stretchY);
      s.alpha = speedK > 0.55 ? 0.88 : 1;
      const idx = base - k;
      if (this.spriteIdx[k] !== idx) {
        s.texture = this.textures[this.symAt(idx)];
        this.spriteIdx[k] = idx;
      }
    }
  }

  /** Pulse the sprite currently resting on `row` (win highlight). */
  spriteAtRow(row: number): Sprite | null {
    const base = Math.floor(this.pos);
    const idx = base - (row + 1);
    const k = this.spriteIdx.indexOf(idx);
    return k >= 0 ? this.sprites[k] : null;
  }

  /** Drops strip entries far behind the current position. */
  private prune(): void {
    for (const key of this.strip.keys()) {
      if (key < this.target - (ROWS + SPRITE_COUNT + 4)) this.strip.delete(key);
    }
  }
}
