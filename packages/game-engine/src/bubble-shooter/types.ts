import type { JsonObject } from "@gaming-hub/shared";

export type BubbleShooterBubbleType = "normal" | "bomb" | "rainbow";

export type BubbleShooterStatus = "playing" | "won" | "eliminated";

export type BubbleShooterBubbleView = JsonObject & {
  row: number;
  col: number;
  color: string;
  type: BubbleShooterBubbleType;
};

export type BubbleShooterNextBubble = JsonObject & {
  color: string;
  type: BubbleShooterBubbleType;
};

export type BubbleShooterShotResult = "pop" | "miss" | "win" | "eliminated";

export type BubbleShooterLastShot = JsonObject & {
  angle: number;
  row: number;
  col: number;
  color: string;
  type: BubbleShooterBubbleType;
  result: BubbleShooterShotResult;
  matchedCount: number;
  droppedCount: number;
  points: number;
};

export type BubbleShooterPlayerState = JsonObject & {
  seat: number;
  name: string;
  grid: BubbleShooterBubbleView[];
  topOffset: number;
  shotsFired: number;
  nextBubble: BubbleShooterNextBubble;
  score: number;
  status: BubbleShooterStatus;
  lastShot: BubbleShooterLastShot | null;
};

export type BubbleShooterMatchResult = "none" | "win" | "draw";

export interface BubbleShooterServerStateBase {
  players: BubbleShooterPlayerState[];
  currentSeat: number;
  winnerSeats: number[];
  finished: boolean;
  turnCount: number;
  result: BubbleShooterMatchResult;
}

export type BubbleShooterServerState = JsonObject & BubbleShooterServerStateBase;

export type BubbleShooterAction = { type: "shoot"; angle: number };

export function isBubbleShooterState(state: JsonObject): state is BubbleShooterServerState {
  return (
    Array.isArray(state.players) &&
    "currentSeat" in state &&
    "result" in state &&
    "turnCount" in state
  );
}
