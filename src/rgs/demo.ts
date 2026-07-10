import {
  BET_STEPS,
  BONUS_COST_MULT,
  COLS,
  ROWS,
  START_BALANCE,
  SYMBOLS,
  WIN_CHANCE,
  WIN_MULTS,
} from '../config';
import type { AuthResult, GameClient, RoundResult } from './client';

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/**
 * Local play-money client used when the game is opened without ?rgs_url
 * (plain dev server). Random boards + a simple demo win table.
 */
export class DemoClient implements GameClient {
  readonly kind = 'demo' as const;

  private balance = START_BALANCE;
  private pendingWin = 0;

  async authenticate(): Promise<AuthResult> {
    return { balance: this.balance, currency: 'USD', betLevels: BET_STEPS, defaultBet: null };
  }

  async play(bet: number, mode = 'base'): Promise<RoundResult> {
    const isBonus = mode.toLowerCase() === 'bonus';
    const cost = isBonus ? bet * BONUS_COST_MULT : bet;
    if (this.balance < cost) throw new Error('ERR_IPB');
    this.balance = +(this.balance - cost).toFixed(2);

    let win = 0;
    if (isBonus) {
      // mirrors the published bonus books: 5x..200x, ~15% above cost
      const mult = Math.random() < 0.85 ? 5 + Math.random() * 22 : 40 + Math.random() * 160;
      win = +(bet * Math.min(200, mult)).toFixed(2);
    } else if (Math.random() < WIN_CHANCE) {
      win = +(bet * pick(WIN_MULTS)).toFixed(2);
    }
    this.pendingWin = win;

    const grid = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => Math.floor(Math.random() * SYMBOLS.length)),
    );
    return { win, balance: this.balance, grid };
  }

  async endRound(): Promise<number | null> {
    this.balance = +(this.balance + this.pendingWin).toFixed(2);
    this.pendingWin = 0;
    return this.balance;
  }
}
