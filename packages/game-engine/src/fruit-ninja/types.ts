import type { JsonObject } from "@gaming-hub/shared";
import type { GameAction } from "../types";

export interface BladeSlice extends JsonObject {
  time: number;
  path: { x: number; y: number }[];
  hitFruits: { id: number; offsetMs: number }[];
  hitBombs: number[];
  comboId: number;
}

export interface Target extends JsonObject {
  id: number;
  type: "apple" | "banana" | "orange" | "pear" | "bomb" | "life";
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  age: number;
  points: number;
}

export interface FruitNinjaPlayer extends JsonObject {
  seat: number;
  name: string;
  score: number;
  combos: number;
  lives: number;
  longestCombo: number;
}

export interface FruitNinjaState extends JsonObject {
  players: FruitNinjaPlayer[];
  stage: number;
  level: number;
  timeLeftMs: number;
  slices: BladeSlice[];
  targets: Target[];
  comboId: number;
  comboScore: number;
  winnerSeats: number[];
  finished: boolean;
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

export type FruitNinjaAction =
  | { type: "slice-begin"; x: number; y: number; time: number }
  | { type: "slice-end"; x: number; y: number; time: number }
  | { type: "resign" }
  | { type: "draw-offer" }
  | { type: "draw-accept" }
  | { type: "draw-decline" }
  | { type: "pause" }
  | { type: "resume" };

export type FruitNinjaActionType = FruitNinjaAction["type"];

export interface FruitNinjaEngineOptions {
  turnTimer?: { turnDurationMs: number; warningThresholdMs: number };
  matchTimer?: { matchDurationMs: number; warningThresholdMs: number };
  enableResign?: boolean;
  enableDraw?: boolean;
  enablePause?: boolean;
  enableRematch?: boolean;
  levelTargets?: number; // Targets per level
  comboThreshold?: number; // Points threshold to declare combo
  now?: () => number;
}
