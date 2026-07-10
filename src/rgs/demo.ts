import {
  BET_STEPS,
  BONUS_COST_MULT,
  BOOST_COST_MULT,
  COLS,
  DUEL_MULTIPLIER,
  REEL_FILL_COUNT,
  ROWS,
  START_BALANCE,
  SYMBOL_INDEX,
  WIN_CHANCE,
  WIN_MULTS,
} from '../config';
import type { AuthResult, DuelResult, GameClient, RoundResult } from './client';

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** duel chance per mode — mirrors the reel strips in /math (BR0 vs BST0) */
const DUEL_CHANCE = { base: 0.085, boost: 0.48 };
const WINCAP_MULT = 200;

/**
 * Local play-money client used when the game is opened without ?rgs_url
 * (plain dev server). Random boards + a simple demo win table mirroring the
 * published books: lines, VS duels (blue wins 2x per VS) and both buy modes.
 */
export class DemoClient implements GameClient {
  readonly kind = 'demo' as const;

  private balance = START_BALANCE;
  private pendingWin = 0;

  async authenticate(): Promise<AuthResult> {
    return { balance: this.balance, currency: 'USD', betLevels: BET_STEPS, defaultBet: null };
  }

  async play(bet: number, mode = 'base'): Promise<RoundResult> {
    const m = mode.toLowerCase();
    const costMult = m === 'bonus' ? BONUS_COST_MULT : m === 'boost' ? BOOST_COST_MULT : 1;
    const cost = +(bet * costMult).toFixed(2);
    if (this.balance < cost) throw new Error('ERR_IPB');
    this.balance = +(this.balance - cost).toFixed(2);

    const grid = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => Math.floor(Math.random() * REEL_FILL_COUNT)),
    );

    let win = 0;
    let duel: DuelResult | null = null;

    if (m === 'bonus') {
      // mirrors the published bonus books: 5x..200x, ~15% above cost
      const mult = Math.random() < 0.85 ? 5 + Math.random() * 22 : 40 + Math.random() * 160;
      win = +(bet * Math.min(WINCAP_MULT, mult)).toFixed(2);
    } else {
      if (Math.random() < WIN_CHANCE) {
        win = +(bet * pick(WIN_MULTS)).toFixed(2);
      }
      const duelChance = m === 'boost' ? DUEL_CHANCE.boost : DUEL_CHANCE.base;
      if (Math.random() < duelChance) {
        // base: VS lands on the middle reel; boost: reels 1-3, sometimes 2x
        const reels = m === 'boost' ? [1, 2, 3] : [2];
        const count = m === 'boost' && Math.random() < 0.3 ? 2 : 1;
        const positions: { reel: number; row: number }[] = [];
        const used = new Set<number>();
        while (positions.length < count) {
          const reel = pick(reels);
          if (used.has(reel)) continue;
          used.add(reel);
          const row = Math.floor(Math.random() * ROWS);
          positions.push({ reel, row });
          grid[reel][row] = SYMBOL_INDEX['VS'];
        }
        const award = +(positions.length * DUEL_MULTIPLIER * bet).toFixed(2);
        duel = { positions, award, multiplier: DUEL_MULTIPLIER };
        win = +(win + award).toFixed(2);
      }
      win = Math.min(win, +(bet * WINCAP_MULT).toFixed(2));
    }

    this.pendingWin = win;
    return { win, balance: this.balance, grid, duel };
  }

  async endRound(): Promise<number | null> {
    this.balance = +(this.balance + this.pendingWin).toFixed(2);
    this.pendingWin = 0;
    return this.balance;
  }
}
