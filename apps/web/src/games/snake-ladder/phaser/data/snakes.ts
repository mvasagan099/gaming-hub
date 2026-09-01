export interface Snake {
  head: number;
  tail: number;
}

/** Classic Snake & Ladder board — 9 snakes */
export const snakes: Snake[] = [
  { head: 99, tail: 54 },
  { head: 92, tail: 35 },
  { head: 87, tail: 24 },
  { head: 74, tail: 53 },
  { head: 64, tail: 18 },
  { head: 56, tail: 15 },
  { head: 49, tail: 11 },
  { head: 47, tail: 26 },
  { head: 16, tail:  6 },
];

/** Fast lookup: snakeHead → snakeTail */
export const snakeLookup = new Map<number, number>(
  snakes.map((s) => [s.head, s.tail])
);
