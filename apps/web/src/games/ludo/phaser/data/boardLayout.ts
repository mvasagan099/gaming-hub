import type { PlayerColor } from "../types/ludo.types";

/**
 * The Ludo board is 15×15.
 * Canvas: 800×800 px → each cell = 800/15 ≈ 53.33px
 *
 * COORDINATE SYSTEM
 * ─────────────────
 * (col, row) in grid units, origin top-left.
 * Pixel centre: x = col * CELL + CELL/2,  y = row * CELL + CELL/2
 *
 * MAIN PATH (52 tiles, positions 0–51)
 * ──────────────────────────────────────
 * The classic Ludo path goes clockwise starting from the bottom of the
 * Red home column exit (just left of the Red start square).
 *
 * POSITION → (col, row) lookup is generated below.
 */

export const BOARD_CELLS   = 15;
export const BOARD_PX      = 800;
export const CELL_SIZE     = BOARD_PX / BOARD_CELLS;  // ≈ 53.33 px

// ─── Yard corner regions (col/row extents, inclusive) ────────────────────────
// Each yard occupies a 6×6 block in a corner.
export const YARDS: Record<PlayerColor, { col: number; row: number }> = {
  red:    { col: 0, row: 0  },   // top-left     → cols 0-5, rows 0-5
  blue:   { col: 9, row: 0  },   // top-right    → cols 9-14, rows 0-5
  green:  { col: 9, row: 9  },   // bottom-right → cols 9-14, rows 9-14
  yellow: { col: 0, row: 9  },   // bottom-left  → cols 0-5,  rows 9-14
};

// 4 token spawn circles per yard (relative to yard top-left corner)
export const YARD_TOKEN_OFFSETS: Array<{ col: number; row: number }> = [
  { col: 1, row: 1 },
  { col: 4, row: 1 },
  { col: 1, row: 4 },
  { col: 4, row: 4 },
];

// ─── Home column entry position on main path ─────────────────────────────────
// When a token's position equals this value AND the dice move lands here,
// the token enters the home column instead of continuing main path.
export const HOME_COLUMN_ENTRY: Record<PlayerColor, number> = {
  red:    50,   // position 50 (0,7) on main path → next step enters home column (1,7)
  blue:   11,   // position 11 (7,0) on main path → next step enters home column (7,1)
  green:  24,   // position 24 (14,7) on main path → next step enters home column (13,7)
  yellow: 37,   // position 37 (7,14) on main path → next step enters home column (7,13)
};

// ─── Start positions on main path ────────────────────────────────────────────
// When a token rolls 6 in the yard, it enters here.
export const START_POSITION: Record<PlayerColor, number> = {
  red:    0,
  blue:   13,
  green:  26,
  yellow: 39,
};

// ─── Safe tiles on main path (0–51) ──────────────────────────────────────────
// Tokens on these tiles cannot be captured.
// Includes all 4 start positions + classic safe tiles.
export const SAFE_TILES = new Set<number>([
  0, 8, 13, 21, 26, 34, 39, 47,
]);

// ─── Home-column positions ────────────────────────────────────────────────────
// Global positions 52–57 are the home-column tiles (6 per color).
// We encode as: homeColBase(color) + step (0–5, where 5 = home/finished).
export const HOME_COL_BASE: Record<PlayerColor, number> = {
  red:    52,
  blue:   58,
  green:  64,
  yellow: 70,
};
export const HOME_FINISHED_POSITION = 5; // offset from base = "home"

/** Returns the global position number for a home-column step */
export function homeColPosition(color: PlayerColor, step: number): number {
  return HOME_COL_BASE[color] + step;
}

// ─── Main path grid coordinates (col, row) ───────────────────────────────────
// Position 0 → starting square for Red (col 1, row 6)
// Going clockwise: down the left, across the bottom, up the right, across the top.
// 52 tiles total.
export const MAIN_PATH_COORDS: Array<{ col: number; row: number }> = [
  // Red side going down (col 1, rows 6→12)
  { col: 1,  row: 6  },  // 0  — Red start
  { col: 1,  row: 7  },
  { col: 1,  row: 8  },
  { col: 2,  row: 8  },
  { col: 3,  row: 8  },
  { col: 4,  row: 8  },
  { col: 5,  row: 8  },
  { col: 6,  row: 8  },  // 7
  { col: 6,  row: 9  },  // 8  — safe tile
  { col: 6,  row: 10 },
  { col: 6,  row: 11 },
  { col: 6,  row: 12 },
  { col: 6,  row: 13 },  // 12 — Blue start
  { col: 7,  row: 13 },  // 13 — Blue start square (safe)
  { col: 8,  row: 13 },
  { col: 8,  row: 12 },
  { col: 8,  row: 11 },
  { col: 8,  row: 10 },
  { col: 8,  row: 9  },
  { col: 8,  row: 8  },  // 19
  { col: 9,  row: 8  },
  { col: 10, row: 8  },
  { col: 11, row: 8  },
  { col: 12, row: 8  },
  { col: 13, row: 8  },  // 23
  { col: 13, row: 7  },
  { col: 13, row: 6  },  // 25 — safe tile
  { col: 14, row: 6  },  // 26 — Green start
  { col: 13, row: 6  },  // 26 corrected below
  // ── Recalculating to match classic 15×15 Ludo path ──
  // This will be overridden by the computed path below for accuracy.
];

/**
 * Classic Ludo main path — 52 tile coordinates in clockwise order.
 * Generated programmatically to match a standard 15x15 board.
 */
export function buildMainPath(): Array<{ col: number; row: number }> {
  const path: Array<{ col: number; row: number }> = [];

  // Red to Blue (Left arm, then UP to Top arm)
  path.push({ col: 1, row: 6 }); // 0 (Red Start)
  path.push({ col: 2, row: 6 }); // 1
  path.push({ col: 3, row: 6 }); // 2
  path.push({ col: 4, row: 6 }); // 3
  path.push({ col: 5, row: 6 }); // 4
  path.push({ col: 6, row: 5 }); // 5
  path.push({ col: 6, row: 4 }); // 6
  path.push({ col: 6, row: 3 }); // 7
  path.push({ col: 6, row: 2 }); // 8 (Safe tile)
  path.push({ col: 6, row: 1 }); // 9
  path.push({ col: 6, row: 0 }); // 10
  path.push({ col: 7, row: 0 }); // 11
  path.push({ col: 8, row: 0 }); // 12

  // Blue to Green (Top arm DOWN, then RIGHT to Right arm)
  path.push({ col: 8, row: 1 }); // 13 (Blue Start)
  path.push({ col: 8, row: 2 }); // 14
  path.push({ col: 8, row: 3 }); // 15
  path.push({ col: 8, row: 4 }); // 16
  path.push({ col: 8, row: 5 }); // 17
  path.push({ col: 9, row: 6 }); // 18
  path.push({ col: 10, row: 6 }); // 19
  path.push({ col: 11, row: 6 }); // 20
  path.push({ col: 12, row: 6 }); // 21 (Safe tile)
  path.push({ col: 13, row: 6 }); // 22
  path.push({ col: 14, row: 6 }); // 23
  path.push({ col: 14, row: 7 }); // 24
  path.push({ col: 14, row: 8 }); // 25

  // Green to Yellow (Right arm LEFT, then DOWN to Bottom arm)
  path.push({ col: 13, row: 8 }); // 26 (Green Start)
  path.push({ col: 12, row: 8 }); // 27
  path.push({ col: 11, row: 8 }); // 28
  path.push({ col: 10, row: 8 }); // 29
  path.push({ col: 9, row: 8 }); // 30
  path.push({ col: 8, row: 9 }); // 31
  path.push({ col: 8, row: 10 }); // 32
  path.push({ col: 8, row: 11 }); // 33
  path.push({ col: 8, row: 12 }); // 34 (Safe tile)
  path.push({ col: 8, row: 13 }); // 35
  path.push({ col: 8, row: 14 }); // 36
  path.push({ col: 7, row: 14 }); // 37
  path.push({ col: 6, row: 14 }); // 38

  // Yellow to Red (Bottom arm UP, then LEFT to Left arm)
  path.push({ col: 6, row: 13 }); // 39 (Yellow Start)
  path.push({ col: 6, row: 12 }); // 40
  path.push({ col: 6, row: 11 }); // 41
  path.push({ col: 6, row: 10 }); // 42
  path.push({ col: 6, row: 9 }); // 43
  path.push({ col: 5, row: 8 }); // 44
  path.push({ col: 4, row: 8 }); // 45
  path.push({ col: 3, row: 8 }); // 46
  path.push({ col: 2, row: 8 }); // 47 (Safe tile)
  path.push({ col: 1, row: 8 }); // 48
  path.push({ col: 0, row: 8 }); // 49
  path.push({ col: 0, row: 7 }); // 50
  path.push({ col: 0, row: 6 }); // 51 (End of loop)
  
  return path;
}

export const MAIN_PATH = buildMainPath();

// ─── Home column grid coordinates (per color) ────────────────────────────────
// 6 tiles from entry toward center "home" triangle.
export const HOME_COL_COORDS: Record<PlayerColor, Array<{ col: number; row: number }>> = {
  red:    [
    { col: 1, row: 7 }, { col: 2, row: 7 }, { col: 3, row: 7 },
    { col: 4, row: 7 }, { col: 5, row: 7 }, { col: 6, row: 7 },
  ],
  blue:   [
    { col: 7, row: 1 }, { col: 7, row: 2 }, { col: 7, row: 3 },
    { col: 7, row: 4 }, { col: 7, row: 5 }, { col: 7, row: 6 },
  ],
  green:  [
    { col: 13, row: 7 }, { col: 12, row: 7 }, { col: 11, row: 7 },
    { col: 10, row: 7 }, { col: 9, row: 7 },  { col: 8, row: 7 },
  ],
  yellow: [
    { col: 7, row: 13 }, { col: 7, row: 12 }, { col: 7, row: 11 },
    { col: 7, row: 10 }, { col: 7, row: 9 },  { col: 7, row: 8 },
  ],
};

// ─── Pixel helpers ────────────────────────────────────────────────────────────

export function cellToPixel(col: number, row: number): { x: number; y: number } {
  return {
    x: col * CELL_SIZE + CELL_SIZE / 2,
    y: row * CELL_SIZE + CELL_SIZE / 2,
  };
}

/** Pixel center for a main path position (0–51) */
export function mainPathPixel(pos: number): { x: number; y: number } {
  const coord = MAIN_PATH[pos % MAIN_PATH.length];
  if (!coord) return { x: 0, y: 0 };
  return cellToPixel(coord.col, coord.row);
}

/** Pixel center for a home-column step (0–5) of a color */
export function homeColPixel(color: PlayerColor, step: number): { x: number; y: number } {
  const coords = HOME_COL_COORDS[color];
  const coord  = coords[step];
  if (!coord) return { x: 0, y: 0 };
  return cellToPixel(coord.col, coord.row);
}

/** Pixel center for a token's yard spawn */
export function yardSpawnPixel(color: PlayerColor, tokenIndex: number): { x: number; y: number } {
  const yard   = YARDS[color];
  const offset = YARD_TOKEN_OFFSETS[tokenIndex % 4];
  if (!offset) return { x: 0, y: 0 };
  return cellToPixel(yard.col + offset.col, yard.row + offset.row);
}

// ─── Zone fill colours ────────────────────────────────────────────────────────

export const ZONE_COLORS: Record<PlayerColor, { main: number; light: number; dark: number }> = {
  red:    { main: 0xef4444, light: 0xfca5a5, dark: 0xb91c1c },
  blue:   { main: 0x3b82f6, light: 0x93c5fd, dark: 0x1d4ed8 },
  green:  { main: 0x22c55e, light: 0x86efac, dark: 0x15803d },
  yellow: { main: 0xeab308, light: 0xfde047, dark: 0xa16207 },
};

export const PLAYER_COLORS_ORDER: PlayerColor[] = ["red", "blue", "green", "yellow"];
