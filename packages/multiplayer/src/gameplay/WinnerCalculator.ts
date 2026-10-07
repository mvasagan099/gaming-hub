/**
 * Winner Calculator
 *
 * Resolves an engine result into a full, broadcast-ready match result:
 * winner player ids, per-player outcomes (won / lost / draw / aborted) and
 * per-player scores when the engine exposes them.
 */

import type { MultiplayerFramework } from "../framework";
import type { RoomRuntime } from "../types";
import type { EngineActionResult } from "@gaming-hub/game-engine";
import type { JsonObject } from "@gaming-hub/shared";
import type { MatchResult, PlayerMatchResult, PlayerOutcome } from "./types";

export class WinnerCalculator {
  private readonly framework: MultiplayerFramework;

  constructor(framework: MultiplayerFramework) {
    this.framework = framework;
  }

  async initialize(): Promise<void> {
    this.framework.log("WinnerCalculator initialized");
  }

  async shutdown(): Promise<void> {
    // Stateless.
  }

  /** Resolve an engine result into a match result for a room. */
  calculate(room: RoomRuntime, result: EngineActionResult<JsonObject>): MatchResult {
    const match = room.match;
    if (!match) throw new Error("No active match");

    const winnerSeats = [...result.winnerSeats];
    const draw = result.finished && winnerSeats.length === 0;

    const winnerIds: string[] = [];
    for (const seat of winnerSeats) {
      for (const player of room.players.values()) {
        if (!player.isSpectator && player.seat === seat && !winnerIds.includes(player.id)) {
          winnerIds.push(player.id);
        }
      }
    }

    const endReason =
      (result.state as { endReason?: string | null }).endReason ?? null;

    const players: PlayerMatchResult[] = [...room.players.values()]
      .filter((p) => !p.isSpectator && p.seat !== null)
      .map((p) => {
        const seat = p.seat as number;
        let outcome: PlayerOutcome = result.finished ? "lost" : "aborted";
        if (draw) outcome = "draw";
        else if (winnerSeats.includes(seat)) outcome = "won";
        return {
          playerId: p.id,
          seat,
          outcome,
          score: this.extractScore(result.state, seat),
        };
      });

    return {
      matchId: match.matchId,
      roomId: room.id,
      gameId: room.config.gameId,
      finishedAt: Date.now(),
      winnerIds,
      winnerSeats,
      draw,
      endReason,
      players,
    };
  }

  /** Best-effort extraction of a per-seat score from common state shapes. */
  private extractScore(state: JsonObject, seat: number): number | undefined {
    const s = state as unknown as {
      scores?: Record<number, number> | number[];
      score?: Record<number, number> | number[];
      team1Score?: number;
      team2Score?: number;
      players?: Array<{ seat: number; score?: number }>;
    };
    const fromScores = s.scores?.[seat];
    if (typeof fromScores === "number") return fromScores;
    const fromScore = s.score?.[seat];
    if (typeof fromScore === "number") return fromScore;
    const playerScore = Array.isArray(s.players) ? s.players.find(p => p.seat === seat)?.score : undefined;
    if (typeof playerScore === "number") return playerScore;
    if (seat === 0 && typeof s.team1Score === "number") return s.team1Score;
    if (seat === 1 && typeof s.team2Score === "number") return s.team2Score;
    return undefined;
  }
}
