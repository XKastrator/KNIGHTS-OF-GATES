import { Application } from 'pixi.js';
import { ensureFonts, tryLoadTexture } from './assets';
import { buildSymbolTextures } from './game/symbols';
import { SlotScene } from './game/SlotScene';
import { createGameClient } from './rgs/client';
import { initBar, initSession } from './ui/bar';

async function boot(): Promise<void> {
  await ensureFonts();

  const app = new Application();
  await app.init({
    background: 0x070c11,
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  document.querySelector('#game')!.appendChild(app.canvas);

  // Delivered art (drop files into /public/assets — see README there).
  // Any file that is missing falls back to a generated stand-in.
  const [bg, frame, logo] = await Promise.all([
    tryLoadTexture(['assets/bg.png', 'assets/bg.jpg', 'assets/bg.webp']),
    tryLoadTexture(['assets/frame.png', 'assets/frame.webp']),
    tryLoadTexture(['assets/logo.png', 'assets/logo.webp']),
  ]);

  const symbolTextures = buildSymbolTextures(app.renderer);
  const scene = new SlotScene(app, { bg, frame, logo }, symbolTextures);

  const client = await createGameClient();
  initBar(scene, client);
  await initSession(client);
}

void boot();
