import type { GameId, JsonObject, StandardMatchResult } from "@gaming-hub/shared";
import type { EngineInstance, GameAction } from "../types";

export interface TimeLimitResult {
  winnerSeats: number[];
  winnerIds: string[];
  loserId: string | null;
  isDraw: boolean;
  scores: Record<string, number>;
  resultReason: "TIME_LIMIT";
}

export interface ValidationOutput {
  valid: boolean;
  reason?: string;
}

export interface PlayerParticipant {
  seat: number;
  userId: string;
  username?: string;
  displayName?: string;
}

export interface IGameResultAdapter {
  readonly gameId: GameId;

  /**
   * Retrieves the authoritative underlying state snapshot from the engine.
   */
  getAuthoritativeState(engine: EngineInstance): JsonObject;

  /**
   * Validates move legality or action constraints.
   */
  validateAction(state: JsonObject, action: GameAction, seat: number): ValidationOutput;

  /**
   * Extracts the authoritative score for a specific player/seat.
   */
  getCurrentScore(state: JsonObject, seat: number, userId?: string): number;

  /**
   * Extracts authoritative scores for all participants.
   */
  getAllScores(state: JsonObject, players: PlayerParticipant[]): Record<string, number>;

  /**
   * Resolves the winner seats, winner userIds, and scores deterministically
   * when the 10-minute match deadline expires using the game's existing rules.
   */
  calculateTimeLimitResult(state: JsonObject, players: PlayerParticipant[]): TimeLimitResult;

  /**
   * Validates a proposed final match result against the authoritative engine state.
   */
  validateFinalResult(
    state: JsonObject,
    players: PlayerParticipant[],
    proposedResult: StandardMatchResult,
  ): ValidationOutput;
}
