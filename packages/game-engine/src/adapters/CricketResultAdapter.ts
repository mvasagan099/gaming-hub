import type { JsonObject, StandardMatchResult } from "@gaming-hub/shared";
import type { EngineInstance, GameAction } from "../types";
import type {
  IGameResultAdapter,
  PlayerParticipant,
  TimeLimitResult,
  ValidationOutput,
} from "./IGameResultAdapter";

export class CricketResultAdapter implements IGameResultAdapter {
  public readonly gameId = "cricket" as const;

  public getAuthoritativeState(engine: EngineInstance): JsonObject {
    return (engine.serialize ? engine.serialize() : engine.state) as JsonObject;
  }

  public validateAction(state: JsonObject, action: GameAction, seat: number): ValidationOutput {
    if (!action || !action.type) {
      return { valid: false, reason: "Action type is missing" };
    }
    return { valid: true };
  }

  public getCurrentScore(state: JsonObject, seat: number): number {
    const s = state as any;
    if (seat === 0 && typeof s.team1Score === "number") return s.team1Score;
    if (seat === 1 && typeof s.team2Score === "number") return s.team2Score;
    if (s.scores && s.scores[seat] !== undefined) return Number(s.scores[seat]) || 0;
    if (s.players && s.players[seat]?.score !== undefined) return Number(s.players[seat].score) || 0;
    return 0;
  }

  public getAllScores(state: JsonObject, players: PlayerParticipant[]): Record<string, number> {
    const scores: Record<string, number> = {};
    for (const p of players) {
      scores[p.userId] = this.getCurrentScore(state, p.seat);
    }
    return scores;
  }

  public calculateTimeLimitResult(state: JsonObject, players: PlayerParticipant[]): TimeLimitResult {
    const s = state as any;
    const s0 = typeof s.team1Score === "number" ? s.team1Score : this.getCurrentScore(state, 0);
    const s1 = typeof s.team2Score === "number" ? s.team2Score : this.getCurrentScore(state, 1);

    let winnerSeats: number[] = [];
    if (s0 > s1) {
      winnerSeats = [0];
    } else if (s1 > s0) {
      winnerSeats = [1];
    } else {
      // Tied on runs: compare wickets lost (fewer is better)
      const w0 = typeof s.team1Wickets === "number" ? s.team1Wickets : 0;
      const w1 = typeof s.team2Wickets === "number" ? s.team2Wickets : 0;
      if (w0 < w1) {
        winnerSeats = [0];
      } else if (w1 < w0) {
        winnerSeats = [1];
      } else {
        winnerSeats = []; // Draw
      }
    }

    const isDraw = winnerSeats.length === 0;
    const winnerIds = winnerSeats
      .map((seat) => players.find((p) => p.seat === seat)?.userId)
      .filter((id): id is string => Boolean(id));

    const loserId = isDraw
      ? null
      : players.find((p) => !winnerSeats.includes(p.seat))?.userId ?? null;

    const scores = this.getAllScores(state, players);

    return {
      winnerSeats,
      winnerIds,
      loserId,
      isDraw,
      scores,
      resultReason: "TIME_LIMIT",
    };
  }

  public validateFinalResult(
    state: JsonObject,
    players: PlayerParticipant[],
    proposedResult: StandardMatchResult,
  ): ValidationOutput {
    if (!proposedResult) return { valid: false, reason: "Missing proposed result" };
    const playerIds = new Set(players.map((p) => p.userId));

    if (proposedResult.winner && !playerIds.has(proposedResult.winner)) {
      return { valid: false, reason: `Winner ${proposedResult.winner} is not a valid participant` };
    }
    return { valid: true };
  }
}
