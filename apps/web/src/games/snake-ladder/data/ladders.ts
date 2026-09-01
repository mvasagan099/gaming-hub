import type { Ladder } from "../types";

export const ladders: Ladder[] = [
  { from: 2, to: 38 },
  { from: 7, to: 14 },
  { from: 8, to: 31 },
  { from: 15, to: 26 },
  { from: 21, to: 42 },
  { from: 28, to: 84 },
  { from: 51, to: 67 },
  { from: 71, to: 91 },
  { from: 80, to: 100 },
];

export const ladderMap = new Map<number, number>(ladders.map(l => [l.from, l.to]));
