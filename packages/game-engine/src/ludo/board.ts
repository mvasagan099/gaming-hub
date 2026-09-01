import type { LudoColor } from "./types";

/**
 * Shared Ludo board constants. These mirror the rendered Phaser client
 * (`apps/web/src/games/ludo/phaser/data/boardLayout.ts`) so that server
 * positions map 1:1 to client tile coordinates.
 *
 * Positions:
 *   -1      = in the yard (not yet entered)
 *   0–51    = main circular path
 *   base..base+5 = color-specific home column (base+5 = home)
 */

export const SAFE_TILES = new Set<number>([0, 8, 13, 21, 26, 34, 39, 47]);

export const START_POSITION: Record<LudoColor, number> = {
  red: 0,
  blue: 13,
  green: 26,
  yellow: 39,
};

export const HOME_COLUMN_ENTRY: Record<LudoColor, number> = {
  red: 50,
  blue: 11,
  green: 24,
  yellow: 37,
};

export const HOME_COL_BASE: Record<LudoColor, number> = {
  red: 52,
  blue: 58,
  green: 64,
  yellow: 70,
};

export const HOME_FINISHED_POSITION = 5;

export const PLAYER_COLORS_ORDER: LudoColor[] = ["red", "blue", "green", "yellow"];

/** Colors used for a given number of participants (mirrors the client). */
export function colorsForPlayerCount(playerCount: number): LudoColor[] {
  if (playerCount === 2) return ["red", "green"];
  return PLAYER_COLORS_ORDER.slice(0, playerCount);
}
