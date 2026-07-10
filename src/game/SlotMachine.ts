import { Container, Graphics, Texture, Ticker } from 'pixi.js';
import { sound, SoundHandle } from '../audio/sound';
import { BOARD_H, BOARD_W, COLS, REEL, REEL_FILL_COUNT, ROWS, STEP, SYMBOL_INDEX } from '../config';
import { Eases, tween } from '../util/tween';
import { Reel } from './Reel';

/**
 * The 5×5 reel set behind a rectangular mask, orchestrated for a physical
 * cabinet feel: staggered launches, left-to-right detent landings with a
 * board dip, a mechanical whirr while spinning, duel anticipation on the
 * remaining reels once a VS lands, and player slam-to-stop.
 */
export class SlotMachine {
  readonly container = new Container();
  /** last landed grid, grid[col][row], row 0 = top */
  grid: number[][] = [];

  /** scene hooks */
  onAnticipation: ((activeReels: number[]) => void) | null = null;
  onAnticipationEnd: (() => void) | null = null;
  onVsLanded: ((reel: number, row: number) => void) | null = null;

  private reels: Reel[] = [];
  private baseY = 0;
  private loopHandle: SoundHandle | null = null;
  private anticipationHandle: SoundHandle | null = null;
  private target: number[][] = [];
  private landedCount = 0;
  private slammed = false;

  constructor(textures: Texture[], ticker: Ticker) {
    const window = new Container();
    const mask = new Graphics().rect(0, 0, BOARD_W, BOARD_H).fill(0xffffff);
    this.container.addChild(mask, window);
    window.mask = mask;

    for (let col = 0; col < COLS; col++) {
      const reel = new Reel(textures, ticker);
      reel.container.x = col * STEP;
      reel.onLand = (i) => this.handleLand(i);
      window.addChild(reel.container);
      this.reels.push(reel);
    }
  }

  private randomColumn(): number[] {
    return Array.from({ length: ROWS }, () => Math.floor(Math.random() * REEL_FILL_COUNT));
  }

  private handleLand(reelIndex: number): void {
    this.landedCount++;
    // detent thud, pitch climbing across the row; final reel hits harder
    const last = reelIndex === COLS - 1;
    sound.play('stop', { rate: 1 + reelIndex * 0.05, volume: last ? 1 : 0.8 });
    this.dipBoard(last ? 7 : 4);

    // duel tease: a VS just landed → remaining reels crawl with a riser
    const vsIndex = SYMBOL_INDEX['VS'];
    const col = this.target[reelIndex] ?? [];
    const vsRow = col.indexOf(vsIndex);
    if (vsRow >= 0) {
      this.onVsLanded?.(reelIndex, vsRow);
      if (!this.slammed) {
        const remaining: number[] = [];
        for (let i = reelIndex + 1; i < COLS; i++) {
          if (this.reels[i].spinning) {
            this.reels[i].enterAnticipation();
            remaining.push(i);
          }
        }
        if (remaining.length > 0) {
          this.onAnticipation?.(remaining);
          if (!this.anticipationHandle) {
            this.anticipationHandle = sound.play('anticipation', { loop: true, volume: 0.9 });
          }
        }
      }
    }
  }

  /** cabinet-style vertical dip of the whole reel window on detent hits */
  private dipBoard(pixels: number): void {
    if (this.baseY === 0) this.baseY = this.container.y;
    void tween({
      from: this.baseY + pixels,
      to: this.baseY,
      duration: 240,
      ease: Eases.backOut(2.4),
      onUpdate: (v) => (this.container.y = v),
    });
  }

  /** Player-forced stop: every still-spinning reel drops onto its detent. */
  slam(): void {
    this.slammed = true;
    this.anticipationHandle?.stop();
    this.anticipationHandle = null;
    this.onAnticipationEnd?.();
    this.reels.forEach((reel) => reel.slam());
  }

  get spinning(): boolean {
    return this.reels.some((r) => r.spinning);
  }

  /**
   * Spins all reels (staggered) and resolves once they have landed on
   * `target` (grid[col][row], from the RGS book) — or a random board.
   */
  async spin(turbo: boolean, target?: number[][] | null): Promise<number[][]> {
    const result = target ?? Array.from({ length: COLS }, () => this.randomColumn());
    this.target = result;
    this.landedCount = 0;
    this.slammed = false;

    const speed = turbo ? 'turbo' : 'normal';
    this.loopHandle = sound.play('reel_loop', { loop: true, volume: 0.55 });

    await Promise.all(
      this.reels.map((reel, i) =>
        reel.spin(result[i], i, {
          turbo,
          startDelay: i * REEL.startStagger[speed],
          distance:
            REEL.distance[speed] +
            i * REEL.distancePerReel[speed] +
            (i === COLS - 1 ? REEL.finalReelExtra[speed] : 0),
        }),
      ),
    );

    this.loopHandle?.stop();
    this.loopHandle = null;
    this.anticipationHandle?.stop();
    this.anticipationHandle = null;
    this.onAnticipationEnd?.();
    this.grid = result;
    return result;
  }

  /** Sprite currently shown at (col, row) — used for win pulses. */
  spriteAt(col: number, row: number) {
    return this.reels[col]?.spriteAtRow(row) ?? null;
  }
}
