import type { JsonObject } from "@gaming-hub/shared";
import type { GameAction } from "../types";

export const CRICKET_OVERS = {
  "1-over": 1,
  "2-overs": 2,
  "5-overs": 5,
  "10-overs": 10,
} as const;

export type CricketMatchType = keyof typeof CRICKET_OVERS;

export interface CricketBall extends JsonObject {
  over: number;
  ball: number;
  runs: number;
  wicket: boolean;
  wicketType: "bowled" | "caught" | "lbw" | "runout" | "stumped" | null;
  comment: string;
}

export interface CricketPlayer extends JsonObject {
  seat: number;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  wickets: number;
  overs: number;
  runsConceded: number;
}

export interface CricketState extends JsonObject {
  matchType: CricketMatchType;
  totalOvers: number;
  currentOver: number;
  currentBall: number;
  inning: 1 | 2;
  battingTeam: number;
  bowlingTeam: number;
  team1Score: number;
  team2Score: number;
  team1Wickets: number;
  team2Wickets: number;
  balls: CricketBall[];
  players: CricketPlayer[];
  currentBatsman: number;
  currentBowler: number;
  finished: boolean;
  winnerSeats: number[];
  winner: number | null;
  endReason: "all-out" | "overs-complete" | "target-chased" | "tie" | null;
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

export interface CricketPlayBallAction extends GameAction {
  type: "play-ball";
  runs?: number;
  wicket?: boolean;
  wicketType?: "bowled" | "caught" | "lbw" | "runout" | "stumped";
}

export type CricketAction =
  | CricketPlayBallAction
  | { type: "resign" }
  | { type: "draw-offer" }
  | { type: "draw-accept" }
  | { type: "draw-decline" }
  | { type: "pause" }
  | { type: "resume" };

export type CricketActionType = CricketAction["type"];

export interface CricketEngineOptions {
  matchType?: CricketMatchType;
  turnTimer?: { turnDurationMs: number; warningThresholdMs: number };
  matchTimer?: { matchDurationMs: number; warningThresholdMs: number };
  enableResign?: boolean;
  enableDraw?: boolean;
  enablePause?: boolean;
  enableRematch?: boolean;
  now?: () => number;
}
