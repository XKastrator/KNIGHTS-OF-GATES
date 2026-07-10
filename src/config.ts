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
// Mode costs — must match math/publish/index.json.
export const BONUS_COST_MULT = 30; // guaranteed 5x..200x round
export const BOOST_COST_MULT = 5; // "Duel Boost": ~48% duel chance per spin
/** blue knight's multiplier — award per landed VS symbol (placeholder rule) */
export const DUEL_MULTIPLIER = 2;

/**
 * Paytable & paylines — EXACT mirror of math/generate_publish.py, so the demo
 * mode evaluates the real board (what you see is what you win) and the RGS
 * mode can highlight winning positions.
 */
export const PAYTABLE: Record<string, [number, number, number]> = {
  // [pay for 3, 4, 5 of a kind] × bet
  H1: [3, 8, 20],
  H2: [2.5, 6, 15],
  H3: [2, 5, 12],
  H4: [1.5, 4, 10],
  H5: [1.2, 3, 8],
  L1: [0.8, 2, 5],
  L2: [0.6, 1.6, 4],
  L3: [0.5, 1.2, 3],
  L4: [0.4, 1, 2.5],
  L5: [0.3, 0.8, 2],
};

export const PAYLINES: number[][] = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [3, 3, 3, 3, 3],
  [4, 4, 4, 4, 4],
  [0, 1, 2, 1, 0],
  [4, 3, 2, 3, 4],
  [0, 1, 2, 3, 4],
  [4, 3, 2, 1, 0],
  [1, 2, 3, 2, 1],
];

export const WINCAP_MULT = 200;

/** Win presentation tiers (multiplier of total bet), leader-style. */
export const WIN_TIERS = [
  { min: 90, label: 'LEGENDARNA WYGRANA', sound: 'megawin', duration: 4200 },
  { min: 35, label: 'MEGA WYGRANA', sound: 'megawin', duration: 3400 },
  { min: 12, label: 'WIELKA WYGRANA', sound: 'bigwin', duration: 2600 },
] as const;

/** Roll-up (win meter) duration by win size — the dramatization beat. */
export function rollupDuration(mult: number): number {
  if (mult <= 0) return 0;
  if (mult < 2) return 450;
  if (mult < 6) return 900;
  if (mult < 12) return 1500;
  if (mult < 35) return 2300;
  return 3200;
}

export interface SymbolDef {
  /** math-SDK symbol code — must match the reels/paytable in /math */
  code: string;
  /** placeholder art variant */
  art: 'sword' | 'shield' | 'helm' | 'crown' | 'gate' | 'wild' | 'letter' | 'vs';
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
  // VS must stay LAST — random reel fills draw from the first REEL_FILL_COUNT
  // entries so the duel symbol only appears when the book/demo places it.
  { code: 'VS', art: 'vs', color: 0xf5c542 },
];

/** number of symbols used for random reel fills (excludes the special VS) */
export const REEL_FILL_COUNT = SYMBOLS.length - 1;

/** math code → SYMBOLS index (for mapping RGS book boards onto textures) */
export const SYMBOL_INDEX: Record<string, number> = Object.fromEntries(SYMBOLS.map((s, i) => [s.code, i]));

/**
 * Reel physics — modelled on stepper-motor cabinets: wind-up, inertia,
 * per-reel speed variance, and a detent "clunk" landing with overshoot.
 */
export const REEL = {
  pullback: 0.42, // symbols of wind-up pull (opposite to travel)
  pullbackMs: 140,
  accelMs: 160, // 0 → max velocity
  maxSpeed: { normal: 21, turbo: 36 }, // symbols per second
  speedVariance: 0.05, // ±5% per reel — organic, not robotic
  distance: { normal: 24, turbo: 12 }, // symbols travelled by reel 0
  distancePerReel: { normal: 5, turbo: 2 }, // extra travel per reel index
  finalReelExtra: { normal: 2, turbo: 0 }, // last reel lands a beat later
  startStagger: { normal: 110, turbo: 45 }, // ms between reel launches
  landLead: 1.45, // symbols before target where deceleration begins
  landMs: { normal: 380, turbo: 215 },
  landOvershoot: 1.25, // detent bounce strength
  slamLandMs: 130, // forced-stop deceleration
  anticipation: {
    speedFactor: 0.5, // remaining reels crawl
    extraSymbols: 9, // and travel further
    landMs: 520, // heavier, slower detent
  },
  stretch: 0.3, // max vertical smear at full speed
};
