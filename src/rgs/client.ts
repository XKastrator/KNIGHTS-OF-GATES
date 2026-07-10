/**
 * Game-server abstraction.
 *
 * With ?rgs_url=... in the URL (how Stake Engine launches games) the real
 * RGS client is used; without it the game runs in local demo mode, so the
 * project stays playable in plain `npm run dev`.
 */

export interface AuthResult {
  balance: number;
  currency: string;
  /** available bet amounts (major units); empty = keep local defaults */
  betLevels: number[];
  defaultBet: number | null;
}

export interface DuelResult {
  /** landed VS symbol positions */
  positions: { reel: number; row: number }[];
  /** total duel award in major currency units (already included in `win`) */
  award: number;
  /** winning knight's multiplier (blue = 2x for now) */
  multiplier: number;
}

export interface LineWin {
  /** symbol code, e.g. "H1" */
  symbol: string;
  /** matched count from the left */
  count: number;
  /** amount in major currency units */
  amount: number;
  /** winning positions to highlight */
  positions: { reel: number; row: number }[];
}

export interface RoundResult {
  /** total round win in major currency units */
  win: number;
  /** balance after the bet was debited (major units), if reported */
  balance: number | null;
  /** landed board mapped to SYMBOLS indices, grid[col][row]; null = pick random */
  grid: number[][] | null;
  /** knight duel triggered by VS symbols, if any */
  duel: DuelResult | null;
  /** line wins with positions (win highlights); empty when unknown */
  lineWins: LineWin[];
}

export interface GameClient {
  readonly kind: 'rgs' | 'demo';
  authenticate(): Promise<AuthResult>;
  /** Places a bet (major units) and returns the resolved round. */
  play(bet: number, mode?: string): Promise<RoundResult>;
  /** Confirms the round / credits the win. Returns the new balance if reported. */
  endRound(): Promise<number | null>;
}

export function urlParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export async function createGameClient(): Promise<GameClient> {
  if (urlParam('rgs_url')) {
    const { RgsClient } = await import('./rgs');
    return new RgsClient();
  }
  const { DemoClient } = await import('./demo');
  return new DemoClient();
}
