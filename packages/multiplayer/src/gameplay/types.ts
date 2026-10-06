/**
 * Shared types for the Phase 11 server-authoritative gameplay framework.
 *
 * These types describe how a match is configured and resolved so that the
 * gameplay managers can reason about all nine games through one uniform
 * contract, regardless of whether the game is turn-based, realtime, a
 * score battle or a score race.
 */

import type { GameId, GameMode } from "@gaming-hub/shared";

/** Per-game configuration used by the server-authoritative gameplay layer. */
export interface GamePlayConfig {
  gameId: GameId;
  mode: GameMode;
  /** True when players must act strictly in turn order (server-enforced). */
  turnBased: boolean;
  minPlayers: number;
  maxPlayers: number;
  /** Number of participants required before a match may start. */
  minPlayersToStart: number;
  /** Minimum interval between actions from the same player (rate limiting). */
  actionCooldownMs: number;
  /** Auto-pause a turn-based match when a participant disconnects. */
  pauseOnDisconnect: boolean;
  /** Forfeit a disconnected player when the reconnect grace period expires. */
  forfeitOnDisconnect: boolean;
  /** Forfeit a connected player for inactivity; turn clocks may handle this instead. */
  forfeitOnAfk: boolean;
  /** Default per-turn timer in ms. 0 disables the per-turn clock. */
  defaultTurnTimerMs: number;
  /** Default whole-match timer in ms. 0 disables the match clock. */
  defaultMatchTimerMs: number;
}

/** Final outcome for a single participant of a finished match. */
export type PlayerOutcome = "won" | "lost" | "draw" | "aborted";

/** Per-player result of a finished match. */
export interface PlayerMatchResult {
  playerId: string;
  seat: number;
  outcome: PlayerOutcome;
  /** Game-specific score, when the engine exposes one (score-battle/race). */
  score?: number;
}

/** Resolved, ready-to-broadcast result of a finished match. */
export interface MatchResult {
  matchId: string;
  roomId: string;
  gameId: GameId;
  finishedAt: number;
  winnerIds: string[];
  winnerSeats: number[];
  draw: boolean;
  endReason: string | null;
  players: PlayerMatchResult[];
}

/** Per-player statistics accumulated during a single match. */
export interface PlayerMatchStats {
  playerId: string;
  seat: number;
  /** Game moves only (base actions like resign/chat are excluded). */
  movesMade: number;
  actionsTaken: number;
  actionTypes: Record<string, number>;
  timeOnTurnMs: number;
  disconnections: number;
  reconnections: number;
  afkWarnings: number;
}
