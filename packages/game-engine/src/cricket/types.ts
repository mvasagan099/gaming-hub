import type { JsonObject } from "@gaming-hub/shared";
import type { GameAction } from "../types";

export const CRICKET_OVERS = {
  "1-over": 1,
} as const;

export type CricketMatchType = keyof typeof CRICKET_OVERS;

/** The delivery the bowler can choose. Mirrors the in-scene pitch types. */
export type CricketDelivery = "fast" | "slow" | "spin" | "yorker" | "bouncer" | "swing";

/** The shot the batsman can choose. */
export type CricketShot = "straight" | "left" | "right" | "up";

/** How well the batsman connected with the ball. */
export type CricketTiming = "early" | "good" | "late";

/** Bowling line (horizontal position). */
export type CricketLine = "off" | "middle" | "leg";

/** Bowling length (vertical position). */
export type CricketLength = "full" | "good" | "short";

export const CRICKET_LINES: readonly CricketLine[] = ["off", "middle", "leg"];
export const CRICKET_LENGTHS: readonly CricketLength[] = ["full", "good", "short"];
export const CRICKET_DELIVERIES: readonly CricketDelivery[] = ["fast", "slow", "spin", "yorker", "bouncer", "swing"];
export const CRICKET_SHOTS: readonly CricketShot[] = ["straight", "left", "right", "up"];

export type CricketWicketType = "bowled" | "caught" | "lbw" | "runout" | "stumped";

export type CricketExtraType = "no-ball" | "wide" | "bye" | "leg-bye";

export interface CricketBall extends JsonObject {
  over: number;
  ball: number;
  runs: number;
  extras: number;
  extraType: CricketExtraType | null;
  wicket: boolean;
  wicketType: CricketWicketType | null;
  comment: string;
}

export interface OversBalls extends JsonObject {
  overs: number;
  balls: number;
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
  oversBowled: OversBalls;
  maidens: number;
  runsConceded: number;
  extras: number;
}

export interface CricketPendingDelivery extends JsonObject {
  delivery: CricketDelivery;
  power: number;
  line: string | null;
  length: string | null;
  deliveryId: string;
  deliverySequence: number;
}

export interface CricketState extends JsonObject {
  matchType: CricketMatchType;
  totalOvers: number;
  currentOver: number;
  currentBall: number;
  inning: 1 | 2;
  battingTeam: number;
  bowlingTeam: number;
  battingFirst: number;
  currentActor: "bowler" | "batsman" | "toss";
  target: number | null;
  pendingDelivery: CricketPendingDelivery | null;
  isProcessingDelivery: boolean;
  activeDeliveryId: string | null;
  deliverySequence: number;
  team1Score: number;
  team2Score: number;
  team1Wickets: number;
  team2Wickets: number;
  team1Extras: number;
  team2Extras: number;
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
  runRate: number | null;
  requiredRunRate: number | null;
  tossResult: "heads" | "tails" | null;
  tossWinner: number | null;
}

export interface CricketBowlAction extends GameAction {
  type: "bowl";
  delivery: CricketDelivery;
  power?: number;
  line?: string;
  length?: string;
}

export interface CricketBatAction extends GameAction {
  type: "bat";
  shot: CricketShot;
  timing?: CricketTiming;
}

export interface CricketTossCallAction extends GameAction {
  type: "toss-call";
  call: "heads" | "tails";
}

export type CricketAction =
  | CricketBowlAction
  | CricketBatAction
  | CricketTossCallAction
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
