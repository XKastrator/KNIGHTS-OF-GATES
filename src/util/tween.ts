import { Ticker } from 'pixi.js';

export type Ease = (t: number) => number;

export const Eases = {
  linear: ((t) => t) as Ease,
  quadIn: ((t) => t * t) as Ease,
  quadOut: ((t) => t * (2 - t)) as Ease,
  cubicOut: ((t) => 1 + (t - 1) ** 3) as Ease,
  backOut(strength = 1.4): Ease {
    const s = 1.70158 * strength;
    return (t) => {
      const u = t - 1;
      return u * u * ((s + 1) * u + s) + 1;
    };
  },
};

export interface TweenOpts {
  from: number;
  to: number;
  duration: number;
  ease?: Ease;
  delay?: number;
  onUpdate: (value: number) => void;
}

/** Minimal promise-based tween driven by the shared Pixi ticker. */
export function tween(opts: TweenOpts): Promise<void> {
  const { from, to, duration, ease = Eases.linear, delay = 0, onUpdate } = opts;
  return new Promise((resolve) => {
    let elapsed = -delay;
    const tick = (ticker: Ticker) => {
      elapsed += ticker.deltaMS;
      if (elapsed < 0) return;
      const k = duration <= 0 ? 1 : Math.min(1, elapsed / duration);
      onUpdate(from + (to - from) * ease(k));
      if (k >= 1) {
        Ticker.shared.remove(tick);
        resolve();
      }
    };
    Ticker.shared.add(tick);
  });
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
