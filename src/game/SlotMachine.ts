import { Container, Graphics, Texture, Ticker } from 'pixi.js';
import { BOARD_H, BOARD_W, COLS, ROWS, STEP, SYMBOLS } from '../config';
import { Reel } from './Reel';

/** The 5×5 reel set behind a rectangular mask. (0,0) = top-left of the symbol window. */
export class SlotMachine {
  readonly container = new Container();
  /** last landed grid, grid[col][row], row 0 = top */
  grid: number[][] = [];

  private reels: Reel[] = [];

  constructor(textures: Texture[], ticker: Ticker) {
    const mask = new Graphics().rect(0, 0, BOARD_W, BOARD_H).fill(0xffffff);
    this.container.addChild(mask);
    this.container.mask = mask;

    for (let col = 0; col < COLS; col++) {
      const reel = new Reel(textures, ticker);
      reel.container.x = col * STEP;
      this.container.addChild(reel.container);
      this.reels.push(reel);
    }
  }

  private randomColumn(): number[] {
    return Array.from({ length: ROWS }, () => Math.floor(Math.random() * SYMBOLS.length));
  }

  /**
   * Spins all reels (staggered) and resolves once they have landed on
   * `target` (grid[col][row], from the RGS book) — or a random board.
   */
  async spin(turbo: boolean, target?: number[][] | null): Promise<number[][]> {
    const result = target ?? Array.from({ length: COLS }, () => this.randomColumn());
    await Promise.all(this.reels.map((reel, i) => reel.spin(result[i], i, turbo)));
    this.grid = result;
    return result;
  }
}
