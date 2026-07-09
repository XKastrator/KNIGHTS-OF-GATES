import { Container, Sprite, Texture, Ticker } from 'pixi.js';
import { REEL, ROWS, STEP, SYMBOLS } from '../config';
import { Eases, tween } from '../util/tween';

const SPRITE_COUNT = ROWS + 2; // one buffer sprite above and below the window

/**
 * One reel column.
 *
 * `pos` counts symbols scrolled past; increasing pos moves the strip DOWN.
 * Sprite k sits at y = (k - 1 + frac(pos)) * STEP and shows strip index
 * floor(pos) - k, so at rest (pos = T) visible row r shows index T - 1 - r.
 */
export class Reel {
  readonly container = new Container();

  private sprites: Sprite[] = [];
  private spriteIdx: number[] = [];
  private strip = new Map<number, number>();
  private pos = ROWS + 3;
  private textures: Texture[];

  constructor(textures: Texture[], ticker: Ticker) {
    this.textures = textures;
    for (let k = 0; k < SPRITE_COUNT; k++) {
      const s = new Sprite(this.textures[0]);
      this.sprites.push(s);
      this.spriteIdx.push(Number.NaN);
      this.container.addChild(s);
    }
    ticker.add(this.update, this);
    this.update();
  }

  /** Symbol id at strip index i (lazily randomized). */
  private symAt(i: number): number {
    let v = this.strip.get(i);
    if (v === undefined) {
      v = Math.floor(Math.random() * SYMBOLS.length);
      this.strip.set(i, v);
    }
    return v;
  }

  private update(): void {
    const base = Math.floor(this.pos);
    const frac = this.pos - base;
    for (let k = 0; k < SPRITE_COUNT; k++) {
      const s = this.sprites[k];
      s.y = (k - 1 + frac) * STEP;
      const idx = base - k;
      if (this.spriteIdx[k] !== idx) {
        s.texture = this.textures[this.symAt(idx)];
        this.spriteIdx[k] = idx;
      }
    }
  }

  /** Spins to land on `finals` (top row first). Resolves when the reel has settled. */
  async spin(finals: number[], reelIndex: number, turbo: boolean): Promise<void> {
    const speed = turbo ? 'turbo' : 'normal';
    const distance = REEL.distance[speed] + reelIndex * REEL.distancePerReel[speed];
    const target = Math.ceil(this.pos) + distance;

    for (let r = 0; r < ROWS; r++) this.strip.set(target - 1 - r, finals[r]);

    const setPos = (v: number) => (this.pos = v);

    // anticipation pull-up
    await tween({
      from: this.pos,
      to: this.pos - REEL.pullback,
      duration: REEL.pullbackMs,
      delay: reelIndex * REEL.startStagger[speed],
      ease: Eases.quadOut,
      onUpdate: setPos,
    });
    // accelerate
    await tween({
      from: this.pos,
      to: this.pos + REEL.accelSymbols,
      duration: REEL.accelMs,
      ease: Eases.quadIn,
      onUpdate: setPos,
    });
    // cruise at constant speed up to just before the target
    const cruiseTo = target - 1.4;
    await tween({
      from: this.pos,
      to: cruiseTo,
      duration: Math.max(0, (cruiseTo - this.pos) * REEL.msPerSymbol[speed]),
      ease: Eases.linear,
      onUpdate: setPos,
    });
    // land with a small overshoot bounce
    await tween({
      from: this.pos,
      to: target,
      duration: REEL.landMs[speed],
      ease: Eases.backOut(REEL.landOvershoot),
      onUpdate: setPos,
    });

    this.pos = target;
    this.update();
    this.prune(target);
  }

  /** Drops strip entries far behind the current position. */
  private prune(target: number): void {
    for (const key of this.strip.keys()) {
      if (key < target - (ROWS + SPRITE_COUNT + 4)) this.strip.delete(key);
    }
  }
}
