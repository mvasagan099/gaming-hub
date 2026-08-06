import type { JsonObject } from "@gaming-hub/shared";
import type { BaseState } from "../base/MultiplayerGameEngine";

export type SnakeLadderPhase = "waiting-for-roll" | "rolling" | "moved" | "finished";

export type SnakeLadderPlayerState = {
  seat: number;
  position: number;
  finished: boolean;
};

export type SnakeLadderLastMove = {
  from: number;
  to: number;
  via: "dice" | "ladder" | "snake" | "rollback";
};

export type SnakeLadderState = BaseState & {
  phase: SnakeLadderPhase;
  currentSeat: number;
  dice: number | null;
  players: SnakeLadderPlayerState[];
  lastMove: SnakeLadderLastMove | null;
  winnerSeats: number[];
  extraTurn: boolean;
  /** True once the match is finished (winner determined). */
  finished: boolean;
  /** Consecutive 6s rolled by the current player this turn. */
  consecutiveSixes: number;
  /** Tile where the current player's turn started (for the three-sixes rule). */
  turnStartTile: number | null;
  logs: string[];
};

export interface SnakeLadderSettings {
  boardSize?: number;
  /** Rolling a 6 grants an extra turn (classic rule). */
  extraTurnOnSix?: boolean;
  /** Three consecutive 6s cancel the turn and snap back to the turn start. */
  threeSixesCancel?: boolean;
  /** Landing on an occupied tile bumps the occupant back to tile 1. */
  bumpOnLanding?: boolean;
}

export type RollAction = { type: "roll" } & Record<string, unknown>;
