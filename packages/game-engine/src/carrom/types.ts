import type { JsonObject } from "@gaming-hub/shared";
import type { GameAction } from "../types";

export const CARROM_BOARD_WIDTH = 600;
export const CARROM_BOARD_HEIGHT = 600;
export const CARROM_MAX_SHOT_SPEED = 27;
export const POCKET_RADIUS = 30;
export const STRIKER_RADIUS = 18;
export const COIN_RADIUS = 15;
export const QUEEN_RADIUS = 15;

export const POCKETS = [
  { x: 45, y: 45 },
  { x: CARROM_BOARD_WIDTH - 45, y: 45 },
  { x: 45, y: CARROM_BOARD_HEIGHT - 45 },
  { x: CARROM_BOARD_WIDTH - 45, y: CARROM_BOARD_HEIGHT - 45 },
];

export const BASE_LINE_Y = CARROM_BOARD_HEIGHT - 93; // 507 (matches client 338 * 1.5)
export const BASE_LINE_X_START = 129; // 86 * 1.5
export const BASE_LINE_X_END = CARROM_BOARD_WIDTH - 129; // 314 * 1.5

export type CoinType = "white" | "black" | "queen";
export type CarromColor = "white" | "black";

export interface CarromCoin extends JsonObject {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: CoinType;
  pocketed: boolean;
  pocketedBy: number | null;
  pocketedAtTurn: number | null;
}

export interface CarromStriker extends JsonObject {
  x: number;
  y: number;
  vx: number;
  vy: number;
  placed: boolean;
  pocketed: boolean;
  placedBy: number | null;
}

export interface CarromPlayer extends JsonObject {
  seat: number;
  color: CarromColor;
  score: number;
  queenPocketed: boolean;
  queenCovered: boolean;
  fouls: number;
  consecutiveFouls: number;
}

export interface TurnTimerConfig extends JsonObject {
  turnDurationMs: number;
  warningThresholdMs: number;
}

export interface MatchTimerConfig extends JsonObject {
  matchDurationMs: number;
  warningThresholdMs: number;
}

export type CarromAction =
  | { type: "place-striker"; x: number }
  | { type: "strike"; angle: number; power: number; x?: number }
  | { type: "resign" }
  | { type: "draw-offer" }
  | { type: "draw-accept" }
  | { type: "draw-decline" }
  | { type: "pause" }
  | { type: "resume" };

export type CarromActionType = CarromAction["type"];

export interface CarromPieceKeyframe extends JsonObject {
  id: string;
  x: number;
  y: number;
  pocketed: boolean;
  pocketIndex: number | null;
}

export interface CarromTrajectoryKeyframe extends JsonObject {
  frame: number;
  pieces: CarromPieceKeyframe[];
}

export type QueenState = "ON_BOARD" | "PENDING_COVER" | "COVERED";

export interface CarromState extends JsonObject {
  coins: CarromCoin[];
  striker: CarromStriker;
  players: CarromPlayer[];
  currentSeat: number;
  currentTurnPlayerId: string;
  finished: boolean;
  winnerSeats: number[];
  turnNumber: number;
  turnStartedAt: number | null;
  turnExpiresAt: number | null;
  turnStartedAtMs: number | null;
  matchStartedAtMs: number | null;
  isShotInProgress: boolean;
  drawOfferedBy: number | null;
  paused: boolean;
  pausedAtMs: number | null;
  pausedBy: number | null;
  lastAction: CarromAction | null;
  lastActionSeat: number | null;
  lastActionAtMs: number | null;
  /** Snapshot of striker position BEFORE the shot — used by clients to replay animation. */
  strikerAtShotStart: CarromStriker | null;
  /** Authoritative canonical trajectory keyframes recorded by the physics simulation. */
  lastTrajectory: CarromTrajectoryKeyframe[] | null;
  strikerPlacementPhase: boolean;
  strikerPlacementSeat: number | null;
  foulThisTurn: boolean;
  queenOnBoard: boolean;
  queenState: QueenState;
  pendingQueenOwner: number | null;
  turnTimerConfig: TurnTimerConfig | null;
  matchTimerConfig: MatchTimerConfig | null;
  gameOver: boolean;
  endReason: string | null;
}

export interface CarromEngineOptions {
  turnTimer?: TurnTimerConfig;
  matchTimer?: MatchTimerConfig;
  enableResign?: boolean;
  enableDraw?: boolean;
  enablePause?: boolean;
  enableRematch?: boolean;
  now?: () => number;
}

export interface CarromEvent {
  type: string;
  seat?: number;
  [key: string]: unknown;
}