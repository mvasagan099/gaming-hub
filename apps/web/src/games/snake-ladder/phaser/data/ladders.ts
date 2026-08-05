export interface Ladder {
  start: number;
  end: number;
}

/** Classic Snake & Ladder board — 9 ladders */
export const ladders: Ladder[] = [
  { start:  4, end: 14 },
  { start:  9, end: 31 },
  { start: 20, end: 38 },
  { start: 28, end: 84 },
  { start: 40, end: 59 },
  { start: 51, end: 67 },
  { start: 63, end: 81 },
  { start: 71, end: 91 },
  { start: 80, end: 100 },
];

/** Fast lookup: ladderBottom → ladderTop */
export const ladderLookup = new Map<number, number>(
  ladders.map((l) => [l.start, l.end])
);
