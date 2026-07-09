/** Design-space resolution — the world container is scaled to fit the window. */
export const DESIGN = { width: 1920, height: 1080 };

/** Board: 5 reels × 5 rows. */
export const COLS = 5;
export const ROWS = 5;

/** Symbol cell (texture) size and vertical step of the reel strip. */
export const CELL = 136; // full cell incl. built-in gap margin
export const TILE = 122; // visible tile inside the cell
export const STEP = CELL;

/** Board geometry (design space). */
export const BOARD_W = COLS * STEP;
export const BOARD_H = ROWS * STEP;
export const BOARD_X = (DESIGN.width - BOARD_W) / 2;
export const BOARD_Y = 168;
export const PLATE_PAD = 24; // dark plate margin around the symbol window
export const FRAME_BORDER = 38; // fallback frame band thickness

/** Bet ladder — same as the delivered bottom-bar component. */
export const BET_STEPS = [0.1, 0.2, 0.4, 0.6, 1, 2, 4, 6, 10, 20, 40, 60, 100];
export const DEFAULT_BET_INDEX = 4; // $1.00
export const START_BALANCE = 1000;
export const BONUS_COST_MULT = 100; // bonus buy = 100× bet (placeholder economy)

/** Demo win model (until the real VS mechanic + paytable arrive). */
export const WIN_CHANCE = 0.42;
export const WIN_MULTS = [0.5, 1, 1, 2, 2, 3, 5, 10, 25];

export interface SymbolDef {
  /** math-SDK symbol code — must match the reels/paytable in /math */
  code: string;
  /** placeholder art variant */
  art: 'sword' | 'shield' | 'helm' | 'crown' | 'gate' | 'wild' | 'letter';
  /** letter glyph (letter art only) */
  text?: string;
  /** accent color used for glyph / glow */
  color: number;
  textColor?: number;
}

/**
 * Symbol set — codes match the math package (H = premium, L = royal, W = wild).
 * Art is placeholder until the real spritesheet arrives.
 */
export const SYMBOLS: SymbolDef[] = [
  { code: 'H1', art: 'sword', color: 0xdfe6ee },
  { code: 'H2', art: 'shield', color: 0xb8433a },
  { code: 'H3', art: 'helm', color: 0xc3ccd8 },
  { code: 'H4', art: 'crown', color: 0xf0c75e },
  { code: 'H5', art: 'gate', color: 0x9fb4c8 },
  { code: 'L1', art: 'letter', text: 'A', color: 0xb8433a, textColor: 0xfff2e6 },
  { code: 'L2', art: 'letter', text: 'K', color: 0xb563c8, textColor: 0xffffff },
  { code: 'L3', art: 'letter', text: 'Q', color: 0xe0a53b, textColor: 0xffe9c2 },
  { code: 'L4', art: 'letter', text: 'J', color: 0x3f7fb0, textColor: 0xffffff },
  { code: 'L5', art: 'letter', text: '10', color: 0x4a8a5a, textColor: 0xffffff },
  { code: 'W', art: 'wild', color: 0xf5c542, textColor: 0x241a04 },
];

/** math code → SYMBOLS index (for mapping RGS book boards onto textures) */
export const SYMBOL_INDEX: Record<string, number> = Object.fromEntries(SYMBOLS.map((s, i) => [s.code, i]));

/** Reel timing. */
export const REEL = {
  pullback: 0.35, // symbols of anticipation pull-up
  pullbackMs: 150,
  accelSymbols: 1.5,
  accelMs: 140,
  msPerSymbol: { normal: 46, turbo: 26 },
  distance: { normal: 24, turbo: 12 }, // base symbols travelled by reel 0
  distancePerReel: { normal: 3, turbo: 2 }, // extra travel per reel index
  startStagger: { normal: 85, turbo: 40 }, // ms between reel starts
  landMs: { normal: 420, turbo: 240 },
  landOvershoot: 1.15, // backOut strength
};
