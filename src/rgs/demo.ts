import { BET_STEPS, COLS, ROWS, START_BALANCE, SYMBOLS, WIN_CHANCE, WIN_MULTS } from '../config';
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

  async play(bet: number, mode = 'BASE'): Promise<RoundResult> {
    if (this.balance < bet) throw new Error('ERR_IPB');
    this.balance = +(this.balance - bet).toFixed(2);

    let win = 0;
    if (mode === 'BONUS') {
      win = +(bet * (20 + Math.random() * 60)).toFixed(2);
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
