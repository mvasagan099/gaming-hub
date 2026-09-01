import type { SnakeOrLadder } from '../types/game';

export const SNAKES: SnakeOrLadder[] = [
  { from: 98, to: 78 },
  { from: 95, to: 56 },
  { from: 92, to: 73 },
  { from: 83, to: 19 },
  { from: 69, to: 33 },
  { from: 64, to: 60 },
  { from: 59, to: 17 },
  { from: 48, to: 26 },
  { from: 36, to: 6 },
  { from: 32, to: 10 }
];

export const LADDERS: SnakeOrLadder[] = [
  { from: 2, to: 38 },
  { from: 7, to: 14 },
  { from: 8, to: 31 },
  { from: 15, to: 26 },
  { from: 21, to: 42 },
  { from: 28, to: 84 },
  { from: 36, to: 44 },
  { from: 51, to: 67 },
  { from: 71, to: 91 },
  { from: 78, to: 98 }
];

export const snakeMap = new Map<number, number>(SNAKES.map(s => [s.from, s.to]));
export const ladderMap = new Map<number, number>(LADDERS.map(l => [l.from, l.to]));
