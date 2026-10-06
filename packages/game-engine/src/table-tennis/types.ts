import type { JsonObject } from "@gaming-hub/shared";
import type { GameAction } from "../types";
import type { BaseState } from "../base/MultiplayerGameEngine";

export interface TableTennisBall extends JsonObject {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  touchCount: number;
  served: boolean;
  servedBySeat: number;
  lastHitSeat: number | null;
  bounceCount: number;
  inPlay: boolean;
  spin: number;
}

export interface TableTennisPlayer extends JsonObject {
  seat: number;
  name: string;
  score: number;
  setsWon: number;
  paddleY: number;
  paddleVelocity: number;
  pointsWon: number;
  isReady: boolean;
}

export interface TableTennisPointRecord extends JsonObject {
  pointNumber: number;
  winnerSeat: number;
  reason: "miss" | "out" | "net" | "timeout" | "forfeit";
  rallyLength: number;
  timestamp: number;
}

export type TableTennisPhase = "waiting" | "countdown" | "serve" | "rally" | "point-scored" | "finished";

export interface TableTennisState extends BaseState {
  phase: TableTennisPhase;
  servingSeat: number;
  players: TableTennisPlayer[];
  rules: {
    pointsPerSet: number;
    setsToWin: number;
    winByTwo: boolean;
    maxSpeed: number;
    minSpeed: number;
  };
  currentSet: number;
  setScores: number[];
  ball: TableTennisBall | null;
  rallyCount: number;
  pointHistory: TableTennisPointRecord[];
  lastPointWinner: number | null;
  lastPointReason: string | null;
  matchPointSeat: number | null;
  deuce: boolean;
  totalPointsPlayed: number;
  serverCount: number;
  countdownValue: number | null;
  canServe: boolean;
  waitingForServe: boolean;
  pointStartTime: number | null;
}

export type TableTennisAction =
  | { type: "paddle-move"; y: number; velocity?: number }
  | { type: "serve"; angle: number; power?: number }
  | { type: "resign" }
  | { type: "draw-offer" }
  | { type: "draw-accept" }
  | { type: "draw-decline" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "ready" };

export type TableTennisActionType = TableTennisAction["type"];

export interface TableTennisEngineOptions {
  turnTimer?: { turnDurationMs: number; warningThresholdMs: number };
  matchTimer?: { matchDurationMs: number; warningThresholdMs: number };
  enableResign?: boolean;
  enablePause?: boolean;
  rules?: { pointsPerSet?: number; setsToWin?: number };
  now?: () => number;
}
