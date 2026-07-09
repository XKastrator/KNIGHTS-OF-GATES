import { Assets, Texture } from 'pixi.js';

/**
 * Tries a list of candidate URLs and returns the first texture that loads.
 * Returns null when none exist — callers then use a generated fallback,
 * so the game runs before the real art is dropped into /public/assets.
 */
export async function tryLoadTexture(urls: string[]): Promise<Texture | null> {
  for (const url of urls) {
    try {
      const head = await fetch(url, { method: 'HEAD' });
      const type = head.headers.get('content-type') ?? '';
      if (!head.ok || !type.startsWith('image/')) continue;
      return await Assets.load<Texture>(url);
    } catch {
      // unreachable / 404 — try next candidate
    }
  }
  return null;
}

/** Waits for the web fonts used on canvas; falls back to serif after a timeout (offline). */
export async function ensureFonts(): Promise<void> {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('900 72px "Cinzel"'),
        document.fonts.load('800 64px "Cinzel"'),
        document.fonts.load('700 24px "Barlow"'),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* offline — system fallback fonts will be used */
  }
}
