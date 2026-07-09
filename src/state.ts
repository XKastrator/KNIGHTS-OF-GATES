import { BET_STEPS, DEFAULT_BET_INDEX, START_BALANCE } from './config';

export type GameEvent = 'change' | 'spinstart' | 'spinend' | 'win' | 'deny';

type Handler = (payload?: unknown) => void;

class Emitter {
  private handlers = new Map<GameEvent, Set<Handler>>();

  on(ev: GameEvent, fn: Handler): void {
    if (!this.handlers.has(ev)) this.handlers.set(ev, new Set());
    this.handlers.get(ev)!.add(fn);
  }

  emit(ev: GameEvent, payload?: unknown): void {
    this.handlers.get(ev)?.forEach((fn) => fn(payload));
  }
}

export const bus = new Emitter();

export const state = {
  /** display balance — authoritative value always comes from the game client */
  balance: START_BALANCE,
  betSteps: [...BET_STEPS],
  betIndex: DEFAULT_BET_INDEX,
  win: 0,
  spinning: false,
  turbo: false,
  autoRemaining: 0,
  currency: 'USD',
};

export function bet(): number {
  return state.betSteps[state.betIndex];
}

/** Replaces the bet ladder (e.g. with RGS betLevels) and re-clamps the index. */
export function setBetSteps(steps: number[], defaultBet: number | null): void {
  if (steps.length > 0) state.betSteps = steps;
  const idx = defaultBet === null ? -1 : state.betSteps.indexOf(defaultBet);
  state.betIndex =
    idx >= 0 ? idx : Math.min(state.betSteps.length - 1, Math.max(0, DEFAULT_BET_INDEX));
  bus.emit('change');
}

export function stepBet(dir: 1 | -1): void {
  state.betIndex = Math.min(state.betSteps.length - 1, Math.max(0, state.betIndex + dir));
  bus.emit('change');
}
