import type { JsonObject } from "@gaming-hub/shared";
import type { GameAction } from "../types";

export interface Snake extends JsonObject {
  id: number;
  seat: number;
  body: { x: number; y: number }[];
  direction: "up" | "down" | "left" | "right";
  alive: boolean;
  life: number | null;
}

export interface Worm extends JsonObject {
  id: number;
  seat: number;
  body: { x: number; y: number }[];
  direction: "up" | "down" | "left" | "right";
  alive: boolean;
}

export interface Food extends JsonObject {
  id: number;
  x: number;
  y: number;
  type: "apple" | "banana" | "cherry" | "special";
  points: number;
  age: number;
}

export interface SnakeVsWormsPlayer extends JsonObject {
  seat: number;
  name: string;
  score: number;
}

export interface SnakeVsWormsState extends JsonObject {
  snakes: Snake[];
  worms: Worm[];
  players: SnakeVsWormsPlayer[];
  food: Food[];
  gameTimeMs: number;
  winnerSeats: number[];
  finished: boolean;
  foodEaten: number;
  currentSeat: number;
  winnerSeat: number | null;
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
  endReason: string | null;
}

export type SnakeVsWormsAction =
  | { type: "turn"; snackId: number; angle: number; deltaSpeed?: number }
  | { type: "worm-turn"; wormId: number; angle: number; deltaSpeed?: number }
  | { type: "resign" }
  | { type: "draw-offer" }
  | { type: "draw-accept" }
  | { type: "draw-decline" }
  | { type: "pause" }
  | { type: "resume" };

export type SnakeVsWormsActionType = SnakeVsWormsAction["type"];

export interface SnakeVsWormsEngineOptions {
  turnTimer?: { turnDurationMs: number; warningThresholdMs: number };
  matchTimer?: { matchDurationMs: number; warningThresholdMs: number };
  enableResign?: boolean;
  enableDraw?: boolean;
  enablePause?: boolean;
  enableRematch?: boolean;
  gridSize?: number; // Width and height of the board (default 20x20)
  now?: () => number;
}
