import type { JsonObject } from "@gaming-hub/shared";
import type { BaseState } from "../base/MultiplayerGameEngine";

export type SnakeWormType = "SNAKE" | "WORM";
export type SnakeWormDirection = "up" | "down" | "left" | "right";

export interface Position extends JsonObject {
  x: number;
  y: number;
}

export interface SnakeWormPlayerEntity extends JsonObject {
  playerId: string;
  seat: number;
  type: SnakeWormType;
  name: string;
  body: Position[];
  direction: SnakeWormDirection;
  targetDirection: SnakeWormDirection;
  speed: number;
  score: number;
  foodCollected: number;
  kills: number;
  boostEnergy: number;
  isBoosting: boolean;
  status: "active" | "eliminated";
  pendingGrowth: number;
  connected: boolean;
}

export type FoodType = "normal" | "golden" | "boost";

export interface SnakeWormFood extends JsonObject {
  id: string;
  x: number;
  y: number;
  type: FoodType;
  score: number;
  growth: number;
}

export interface SnakeVsWormsState extends BaseState {
  gameId: "snake-vs-worms";
  serverTimestamp: number;
  matchRemainingMs: number;
  gridWidth: number;
  gridHeight: number;
  players: SnakeWormPlayerEntity[];
  food: SnakeWormFood[];
  gameStatus: "waiting" | "playing" | "finished";
  stateVersion: number;
}

export type SnakeVsWormsAction =
  | { type: "direction"; direction: SnakeWormDirection; sequenceNumber?: number }
  | { type: "boost-start" }
  | { type: "boost-stop" }
  | { type: "ready" }
  | { type: "resign" }
  | { type: "pause" }
  | { type: "resume" };

export type SnakeVsWormsActionType = SnakeVsWormsAction["type"];

export interface SnakeVsWormsEngineOptions {
  turnTimer?: { turnDurationMs: number; warningThresholdMs: number };
  matchTimer?: { matchDurationMs: number; warningThresholdMs: number };
  enableResign?: boolean;
  enablePause?: boolean;
  enableRematch?: boolean;
  gridWidth?: number;
  gridHeight?: number;
  now?: () => number;
}
