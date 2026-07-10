import { COLS, ROWS, SYMBOL_INDEX } from '../config';
import type { AuthResult, GameClient, RoundResult } from './client';
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

  async play(bet: number, mode = 'BASE'): Promise<RoundResult> {
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

    return {
      win: +win.toFixed(2),
      balance: this.toMajor(res.balance),
      grid: extractGrid((round.state ?? round.events ?? []) as BookEvent[]),
    };
  }

  async endRound(): Promise<number | null> {
    const res = await this.post<{ balance?: RgsBalance }>('/wallet/end-round', {
      sessionID: this.sessionID,
    });
    return this.toMajor(res.balance);
  }
}

type BookEvent = { type?: string; board?: unknown };

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
