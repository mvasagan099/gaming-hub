import type { JsonObject } from "@gaming-hub/shared";
import type { GameAction } from "../types";
import type { BaseState } from "../base/MultiplayerGameEngine";

/** Shared logical playfield (matches the web client's 800x500 stage). */
export const FIELD_WIDTH = 800;
export const FIELD_HEIGHT = 500;

/** Downward gravity, px/s^2. Mirrors the client Phaser arcade config. */
export const GRAVITY = 350;
/** Nominal time a target spends in the air before falling off-screen, ms. */
export const FLIGHT_TIME_MS = 1600;
/** Tolerance added to a target radius when validating a slice hit, px. */
export const SLICE_TOLERANCE_PX = 24;
/** A slice scores a combo when it lands within this window of the last one, ms. */
export const COMBO_WINDOW_MS = 300;
/** Combo count that triggers the bonus. */
export const COMBO_THRESHOLD = 3;
export const MAX_LIVES = 3;
/** Server-authoritative countdown before the match clock starts, ms. */
export const COUNTDOWN_MS = 3000;
/** Server-authoritative match duration (excludes the countdown), ms. */
export const MATCH_DURATION_MS = 60000;
/** How far (ms) a client slice timestamp may deviate from server time. */
export const SLICE_TIME_TOLERANCE_MS = 5000;
/** Physics tick the server integrates; matches the framework loop cadence. */
export const PHYSICS_TICK_MS = 16;

export type FruitNinjaPhase = "waiting" | "countdown" | "playing" | "finished";

export type TargetType = "apple" | "banana" | "orange" | "pear" | "bomb" | "life";

export interface Target extends JsonObject {
  id: number;
  type: TargetType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  /** Server-clock time the target was launched, ms. */
  spawnTime: number;
  /** Server-clock time the target falls out of reach, ms. */
  expiresAt: number;
  /** Seats that already sliced this target. */
  slicedBy: number[];
  /** Seats that already missed this target (life already lost). */
  missedBy: number[];
  points: number;
}

/** A target queued to launch at a future server-clock time. */
export interface SpawnEntry extends JsonObject {
  type: TargetType;
  spawnTime: number;
}

/** A single point of a player's current blade sweep, in server coordinates. */
export interface BladePoint extends JsonObject {
  x: number;
  y: number;
  /** Server-clock time of the sample, ms. */
  t: number;
}

/** The in-flight blade sweep a player is drawing this frame. */
export interface BladeSweep extends JsonObject {
  id: number;
  seat: number;
  points: BladePoint[];
}

export interface FruitNinjaPlayer extends JsonObject {
  seat: number;
  name: string;
  score: number;
  lives: number;
  /** Current combo streak. */
  combos: number;
  longestCombo: number;
  connected: boolean;
  eliminated: boolean;
}

export interface FruitNinjaState extends BaseState {
  players: FruitNinjaPlayer[];
  phase: FruitNinjaPhase;
  countdownEndsAtMs: number | null;
  targets: Target[];
  spawnQueue: SpawnEntry[];
  nextTargetId: number;
  /** Server-clock time the previous wave was scheduled, ms. */
  lastWaveAtMs: number | null;
  /** Per-seat in-flight blade sweeps (only the acting seat owns one). */
  blades: Record<number, BladeSweep>;
  nextBladeId: number;
  /** Per-seat score mirror so the framework WinnerCalculator can read scores. */
  scores: number[];
  /** Per-seat server-clock time of the last scored slice, ms. */
  lastSliceAtMs: number[];
  winnerSeat: number | null;
}

export type FruitNinjaAction =
  | { type: "slice-begin"; x: number; y: number; time: number }
  | { type: "slice-move"; x: number; y: number; time: number }
  | { type: "slice-end"; x: number; y: number; time: number }
  | { type: "slice-fruit"; targetId?: number; fruitType?: string; points?: number }
  | { type: "miss-fruit"; targetId?: number }
  | { type: "bomb-hit"; targetId?: number }
  | { type: "resign" }
  | { type: "draw-offer" }
  | { type: "draw-accept" }
  | { type: "draw-decline" }
  | { type: "pause" }
  | { type: "resume" };

export type FruitNinjaActionType = FruitNinjaAction["type"];

export interface FruitNinjaEngineOptions {
  matchTimer?: { matchDurationMs: number; warningThresholdMs: number };
  enableResign?: boolean;
  enableRematch?: boolean;
  now?: () => number;
}
