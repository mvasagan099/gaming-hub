/**
 * Snake & Ladder board definition.
 *
 * This is the authoritative board. It mirrors the rendered Phaser board in
 * `apps/web/src/games/snake-ladder/phaser/data/{snakes,ladders}.ts` (9 snakes,
 * 9 ladders) so that the board the players see and the server engine resolve
 * to the same outcome for the same dice value.
 */

export const BOARD_SIZE = 100;

export const SNAKES: Record<number, number> = {
  99: 54,
  92: 35,
  87: 24,
  74: 53,
  64: 18,
  56: 15,
  49: 11,
  47: 26,
  16: 6,
};

export const LADDERS: Record<number, number> = {
  4: 14,
  9: 31,
  20: 38,
  28: 84,
  40: 59,
  51: 67,
  63: 81,
  71: 91,
  80: 100,
};

export function resolveDestination(position: number): {
  final: number;
  via: "dice" | "ladder" | "snake";
} {
  const ladderTarget = LADDERS[position];
  if (ladderTarget !== undefined) {
    return { final: ladderTarget, via: "ladder" };
  }
  const snakeTarget = SNAKES[position];
  if (snakeTarget !== undefined) {
    return { final: snakeTarget, via: "snake" };
  }
  return { final: position, via: "dice" };
}
