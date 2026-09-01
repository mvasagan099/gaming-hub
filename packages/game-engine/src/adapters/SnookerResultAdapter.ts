import type { JsonObject, StandardMatchResult } from "@gaming-hub/shared";
import type { EngineInstance, GameAction } from "../types";
import type {
  IGameResultAdapter,
  PlayerParticipant,
  TimeLimitResult,
  ValidationOutput,
} from "./IGameResultAdapter";

export class SnookerResultAdapter implements IGameResultAdapter {
  public readonly gameId = "snooker" as const;

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
    if (seat === 0 && typeof s.player1Score === "number") return s.player1Score;
    if (seat === 1 && typeof s.player2Score === "number") return s.player2Score;
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
    const p1Score = typeof s.player1Score === "number" ? s.player1Score : this.getCurrentScore(state, 0);
    const p2Score = typeof s.player2Score === "number" ? s.player2Score : this.getCurrentScore(state, 1);

    let winnerSeats: number[] = [];
    if (p1Score > p2Score) {
      winnerSeats = [0];
    } else if (p2Score > p1Score) {
      winnerSeats = [1];
    } else {
      // Score tied: compare highest break
      const p1Break = typeof s.player1HighestBreak === "number" ? s.player1HighestBreak : 0;
      const p2Break = typeof s.player2HighestBreak === "number" ? s.player2HighestBreak : 0;
      if (p1Break > p2Break) {
        winnerSeats = [0];
      } else if (p2Break > p1Break) {
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
