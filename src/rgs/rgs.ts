import { COLS, DUEL_MULTIPLIER, ROWS, SYMBOL_INDEX } from '../config';
import type { AuthResult, DuelResult, GameClient, RoundResult } from './client';
import { urlParam } from './client';

/** Stake Engine amounts are integers with 6 decimal places: $1.00 = 1_000_000. */
const API_MULTIPLIER = 1_000_000;

interface RgsBalance {
  amount?: number;
  currency?: string;
}

/**
 * Stake Engine RGS client.
 * Endpoints per https://stakeengine.github.io/math-sdk/rgs_docs/RGS/:
 *   POST /wallet/authenticate { sessionID, language }
 *   POST /wallet/play         { sessionID, currency, mode, amount }
 *   POST /wallet/end-round    { sessionID }
 */
export class RgsClient implements GameClient {
  readonly kind = 'rgs' as const;

  private base: string;
  private sessionID: string;
  private currency: string;

  constructor() {
    const host = urlParam('rgs_url') ?? '';
    this.base = host.startsWith('http') ? host : `https://${host}`;
    this.sessionID = urlParam('sessionID') ?? '';
    this.currency = urlParam('currency') ?? 'USD';
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let code = `HTTP ${res.status}`;
      try {
        const err = (await res.json()) as { error?: { code?: string }; code?: string };
        code = err.error?.code ?? err.code ?? code;
      } catch {
        /* non-JSON error body */
      }
      throw new Error(code);
    }
    return (await res.json()) as T;
  }

  private toMajor(balance: RgsBalance | undefined): number | null {
    return typeof balance?.amount === 'number' ? balance.amount / API_MULTIPLIER : null;
  }

  async authenticate(): Promise<AuthResult> {
    const res = await this.post<{
      balance?: RgsBalance;
      config?: { betLevels?: number[]; defaultBetLevel?: number };
    }>('/wallet/authenticate', {
      sessionID: this.sessionID,
      language: urlParam('lang') ?? urlParam('language') ?? 'en',
    });
    return {
      balance: this.toMajor(res.balance) ?? 0,
      currency: res.balance?.currency ?? this.currency,
      betLevels: (res.config?.betLevels ?? []).map((v) => v / API_MULTIPLIER),
      defaultBet:
        typeof res.config?.defaultBetLevel === 'number' ? res.config.defaultBetLevel / API_MULTIPLIER : null,
    };
  }

  /** Remembers which mode-name casing the RGS accepted ("base" vs "BASE"). */
  private modeCasing: 'as-is' | 'upper' = 'as-is';

  async play(bet: number, mode = 'base'): Promise<RoundResult> {
    try {
      return await this.playRaw(bet, this.modeCasing === 'upper' ? mode.toUpperCase() : mode);
    } catch (err) {
      // Mode-name casing differs between docs examples and index.json — on a
      // validation error, retry once with the other casing and remember it.
      if (err instanceof Error && err.message.startsWith('ERR_VAL')) {
        const flipped = this.modeCasing === 'upper' ? 'as-is' : 'upper';
        const result = await this.playRaw(bet, flipped === 'upper' ? mode.toUpperCase() : mode);
        this.modeCasing = flipped;
        return result;
      }
      throw err;
    }
  }

  private async playRaw(bet: number, mode: string): Promise<RoundResult> {
    const res = await this.post<{
      balance?: RgsBalance;
      round?: {
        payoutMultiplier?: number;
        payout?: number;
        state?: unknown[];
        events?: unknown[];
      };
    }>('/wallet/play', {
      sessionID: this.sessionID,
      currency: this.currency,
      mode,
      amount: Math.round(bet * API_MULTIPLIER),
    });

    const round = res.round ?? {};
    // Book payoutMultiplier is a x100 fixed-point int (1150 = 11.5x) per the
    // math-file format docs; prefer an absolute payout amount when present.
    const win =
      typeof round.payout === 'number'
        ? round.payout / API_MULTIPLIER
        : ((round.payoutMultiplier ?? 0) / 100) * bet;

    const events = (round.state ?? round.events ?? []) as BookEvent[];
    const grid = extractGrid(events);
    return {
      win: +win.toFixed(2),
      balance: this.toMajor(res.balance),
      grid,
      duel: extractDuel(events, grid, bet),
    };
  }

  async endRound(): Promise<number | null> {
    const res = await this.post<{ balance?: RgsBalance }>('/wallet/end-round', {
      sessionID: this.sessionID,
    });
    return this.toMajor(res.balance);
  }
}

type BookEvent = {
  type?: string;
  board?: unknown;
  positions?: { reel: number; row: number }[];
  award?: number;
  multiplier?: number;
};

/**
 * Duel info: prefer the explicit "duel" book event; otherwise reconstruct
 * from VS symbols on the landed grid (award = blue's 2x per VS — must match
 * the math package rule).
 */
function extractDuel(events: BookEvent[], grid: number[][] | null, bet: number): DuelResult | null {
  const ev = events.find((e) => e?.type === 'duel');
  if (ev && Array.isArray(ev.positions) && ev.positions.length > 0) {
    return {
      positions: ev.positions,
      award: +(((ev.award ?? 0) / 100) * bet).toFixed(2),
      multiplier: ev.multiplier ?? DUEL_MULTIPLIER,
    };
  }
  if (!grid) return null;
  const vsIndex = SYMBOL_INDEX['VS'];
  const positions: { reel: number; row: number }[] = [];
  grid.forEach((col, reel) =>
    col.forEach((sym, row) => {
      if (sym === vsIndex) positions.push({ reel, row });
    }),
  );
  if (positions.length === 0) return null;
  return {
    positions,
    award: +(positions.length * DUEL_MULTIPLIER * bet).toFixed(2),
    multiplier: DUEL_MULTIPLIER,
  };
}

/**
 * Pulls the landed board out of the round's book events (the math SDK "reveal"
 * event). Parsed defensively: cells may be {name: "H1"} objects or plain
 * strings, and columns may include padding rows which are trimmed.
 */
function extractGrid(events: BookEvent[]): number[][] | null {
  const reveal = events.find((e) => Array.isArray(e?.board));
  if (!reveal) return null;
  const board = reveal.board as unknown[];
  if (board.length !== COLS) return null;

  const grid: number[][] = [];
  for (const colRaw of board) {
    if (!Array.isArray(colRaw)) return null;
    let col = colRaw as unknown[];
    if (col.length === ROWS + 2) col = col.slice(1, -1); // trim top/bottom padding
    if (col.length !== ROWS) return null;
    grid.push(
      col.map((cell) => {
        const name =
          typeof cell === 'string' ? cell : ((cell as { name?: string })?.name ?? '');
        return SYMBOL_INDEX[name] ?? Math.floor(Math.random() * Object.keys(SYMBOL_INDEX).length);
      }),
    );
  }
  return grid;
}
