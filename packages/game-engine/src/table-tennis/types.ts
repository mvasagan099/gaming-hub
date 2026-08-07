import type { JsonObject } from "@gaming-hub/shared";
import type { GameAction } from "../types";

export interface TableTennisBall extends JsonObject {
  x: number;
  y: number;
  vx: number;
  vy: number;
  served: boolean;
  servedBySeat: number;
  lastHitSeat: number | null;
  bounced: number;
  inPlay: boolean;
  fromX: number;
  fromY: number;
}

export interface TableTennisPointRecord extends JsonObject {
  pointNumber: number;
  winnerSeat: number;
  reason: "serve" | "hit" | "out" | "net" | "timeout";
}

export interface TableTennisPlayer extends JsonObject {
  seat: number;
  name: string;
  score: number;
  wins: number;
  paddleX: number;
  pointsWon: number;
}

export type TableTennisPhase = "serve" | "rally";

export interface TableTennisState extends JsonObject {
  servingSeat: number;
  players: TableTennisPlayer[];
  rules: {
    pointsPerSet: number;
    matchLength: number | null; // Best of X sets
  };
  sets: number[];
  setPoints: number[];
  ball: TableTennisBall | null;
  phase: TableTennisPhase;
  rallyCount: number;
  pointHistory: TableTennisPointRecord[];
  winnerSeat: number | null;
  winnerSeats: number[];
  finished: boolean;
  endReason: "win-by-sets" | "match-timeout" | "time-out" | "resign" | "agreement" | null;
  gamePoints: number; // Total points played in the match (tiebreaker / global score)
  currentSeat: number;
  turnNumber: number;
  turnStartedAtMs: number | null;
  matchStartedAtMs: number | null;
  drawOfferedBy: number | null;
  paused: boolean;
  pausedAtMs: number | null;
  pausedBy: number | null;
  turnTimerConfig: { turnDurationMs: number; warningThresholdMs: number } | null;
  matchTimerConfig: { matchDurationMs: number; warningThresholdMs: number } | null;
  gameOver: boolean;
  endReasonState: string | null;
}

export type TableTennisAction =
  | { type: "serve"; power: number }
  | { type: "hit"; angle: number; spin?: number }
  | { type: "resign" }
  | { type: "draw-offer" }
  | { type: "draw-accept" }
  | { type: "draw-decline" }
  | { type: "pause" }
  | { type: "resume" };

export type TableTennisActionType = TableTennisAction["type"];

export interface TableTennisEngineOptions {
  turnTimer?: { turnDurationMs: number; warningThresholdMs: number };
  matchTimer?: { matchDurationMs: number; warningThresholdMs: number };
  enableResign?: boolean;
  enableDraw?: boolean;
  enablePause?: boolean;
  enableRematch?: boolean;
  rules?: { pointsPerSet?: number; matchLength?: number };
  now?: () => number;
}
