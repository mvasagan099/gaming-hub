import type { Snake } from "../types";

export const snakes: Snake[] = [
  { from: 99, to: 41 },
  { from: 92, to: 35 },
  { from: 74, to: 53 },
  { from: 64, to: 18 },
  { from: 49, to: 11 },
  { from: 16, to: 6 },
];

export const snakeMap = new Map<number, number>(snakes.map(s => [s.from, s.to]));
