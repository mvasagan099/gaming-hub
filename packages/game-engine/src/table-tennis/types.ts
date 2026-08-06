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
}

export interface TableTennisPlayer extends JsonObject {
  seat: number;
  name: string;
  score: number;
  wins: number;
  paddleX: number;
}

export interface TableTennisState extends JsonObject {
  servingSeat: number;
  players: TableTennisPlayer[];
  rules: {
    pointsPerSet: number;
    matchLength: number | null; // Best of X sets
  };
  sets: number[];
  setPoints: number[];
  winnerSeat: number | null;
  winnerSeats: number[];
  finished: boolean;
  endReason: "win-by-points" | "win-by-sets" | "time-out" | "match-timeout" | "resign" | null;
  gamePoints: number ; // Global 5-minute challenge points if applicable
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
