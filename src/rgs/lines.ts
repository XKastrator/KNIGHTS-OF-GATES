import { PAYLINES, PAYTABLE, SYMBOLS } from '../config';
import type { LineWin } from './client';

/**
 * Left-to-right line evaluation with wild substitution — EXACT mirror of
 * math/generate_publish.py, used by the demo client so the board a player
 * sees is the board that pays.
 */
export function evalLines(grid: number[][], bet: number): { total: number; wins: LineWin[] } {
  let total = 0;
  const wins: LineWin[] = [];

  for (const line of PAYLINES) {
    const codes = line.map((row, reel) => SYMBOLS[grid[reel][row]].code);
    let target = codes.find((c) => c !== 'W');
    if (target === undefined) target = 'H1'; // all-wild line pays as top symbol
    if (target === 'VS') continue; // specials never pay on lines

    let count = 0;
    for (const code of codes) {
      if (code === target || code === 'W') count++;
      else break;
    }
    if (count < 3) continue;
    const pays = PAYTABLE[target];
    if (!pays) continue;
    const amount = +(pays[count - 3] * bet).toFixed(2);
    if (amount <= 0) continue;
    total = +(total + amount).toFixed(2);
    wins.push({
      symbol: target,
      count,
      amount,
      positions: line.slice(0, count).map((row, reel) => ({ reel, row })),
    });
  }

  return { total, wins };
}
