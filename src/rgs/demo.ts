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
  WINCAP_MULT,
} from '../config';
import type { AuthResult, DuelResult, GameClient, RoundResult } from './client';
import { evalLines } from './lines';

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** duel chance per mode — mirrors the reel strips in /math (BR0 vs BST0) */
const DUEL_CHANCE = { base: 0.085, boost: 0.48 };

/**
 * Local play-money client used when the game is opened without ?rgs_url
 * (plain dev server). Boards are evaluated with the REAL paytable/paylines
 * (see lines.ts), so what lands on the reels is exactly what pays — same
 * honesty as the published books.
 */
export class DemoClient implements GameClient {
  readonly kind = 'demo' as const;

  private balance = START_BALANCE;
  private pendingWin = 0;

  async authenticate(): Promise<AuthResult> {
    return { balance: this.balance, currency: 'USD', betLevels: BET_STEPS, defaultBet: null };
  }

  private randomGrid(premiumBias = 0): number[][] {
    // premiumBias > 0 skews the draw toward low indices (H1..H5, W appears too)
    return Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => {
        const r = Math.pow(Math.random(), 1 + premiumBias);
        return Math.floor(r * REEL_FILL_COUNT);
      }),
    );
  }

  async play(bet: number, mode = 'base'): Promise<RoundResult> {
    const m = mode.toLowerCase();
    const costMult = m === 'bonus' ? BONUS_COST_MULT : m === 'boost' ? BOOST_COST_MULT : 1;
    const cost = +(bet * costMult).toFixed(2);
    if (this.balance < cost) throw new Error('ERR_IPB');
    this.balance = +(this.balance - cost).toFixed(2);

    let grid: number[][];
    let duel: DuelResult | null = null;
    let lineTotal = 0;
    let lineWins = [] as RoundResult['lineWins'];

    if (m === 'bonus') {
      // guaranteed 5x..200x: rejection-sample premium-rich boards until the
      // board itself pays enough — the reels always tell the truth
      let best: { grid: number[][]; total: number; wins: typeof lineWins } | null = null;
      for (let i = 0; i < 600; i++) {
        const g = this.randomGrid(2.2);
        const { total, wins } = evalLines(g, bet);
        if (!best || total > best.total) best = { grid: g, total, wins };
        if (total >= bet * 5) break;
      }
      grid = best!.grid;
      lineTotal = best!.total;
      lineWins = best!.wins;
    } else {
      grid = this.randomGrid();
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
      }
      const evaluated = evalLines(grid, bet);
      lineTotal = evaluated.total;
      lineWins = evaluated.wins;
    }

    let win = +(lineTotal + (duel?.award ?? 0)).toFixed(2);
    win = Math.min(win, +(bet * WINCAP_MULT).toFixed(2));

    this.pendingWin = win;
    return { win, balance: this.balance, grid, duel, lineWins };
  }

  async endRound(): Promise<number | null> {
    this.balance = +(this.balance + this.pendingWin).toFixed(2);
    this.pendingWin = 0;
    return this.balance;
  }
}
