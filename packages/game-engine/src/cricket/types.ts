import type { JsonObject } from "@gaming-hub/shared";
import type { GameAction } from "../types";

export const CRICKET_OVERS = {
  "1-over": 1,
  "2-overs": 2,
  "5-overs": 5,
  "10-overs": 10,
} as const;

export type CricketMatchType = keyof typeof CRICKET_OVERS;

/** The delivery the bowler can choose. Mirrors the in-scene pitch types. */
export type CricketDelivery = "fast" | "slow" | "spin";

/** The shot the batsman can choose. */
export type CricketShot = "straight" | "left" | "right" | "up";

/** How well the batsman connected with the ball. */
export type CricketTiming = "early" | "good" | "late";

export const CRICKET_DELIVERIES: readonly CricketDelivery[] = ["fast", "slow", "spin"];
export const CRICKET_SHOTS: readonly CricketShot[] = ["straight", "left", "right", "up"];

export type CricketWicketType = "bowled" | "caught" | "lbw" | "runout" | "stumped";

export interface CricketBall extends JsonObject {
  over: number;
  ball: number;
  runs: number;
  wicket: boolean;
  wicketType: CricketWicketType | null;
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

/** The delivery currently awaiting a shot from the batsman. */
export interface CricketPendingDelivery extends JsonObject {
  delivery: CricketDelivery;
  power: number;
}

export interface CricketState extends JsonObject {
  matchType: CricketMatchType;
  totalOvers: number;
  currentOver: number;
  currentBall: number;
  inning: 1 | 2;
  battingTeam: number;
  bowlingTeam: number;
  /** Seat that bats first, decided by the server toss. */
  battingFirst: number;
  /** Who is allowed to act right now. */
  currentActor: "bowler" | "batsman";
  /** Runs needed to win (first innings score + 1); null during the first innings. */
  target: number | null;
  pendingDelivery: CricketPendingDelivery | null;
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
  endReason:
    | "all-out"
    | "overs-complete"
    | "target-chased"
    | "tie"
    | "resign"
    | "agreement"
    | "turn-timeout"
    | "match-timeout"
    | null;
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

export interface CricketBowlAction extends GameAction {
  type: "bowl";
  delivery: CricketDelivery;
  /** Power 0..1 from the power bar; defaults to 0.5. */
  power?: number;
}

export interface CricketBatAction extends GameAction {
  type: "bat";
  shot: CricketShot;
  /** Derived client-side from the ball flight; defaults to "good". */
  timing?: CricketTiming;
}

export type CricketAction =
  | CricketBowlAction
  | CricketBatAction
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
