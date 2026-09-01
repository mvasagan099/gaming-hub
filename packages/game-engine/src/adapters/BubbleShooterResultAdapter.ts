import type { JsonObject, StandardMatchResult } from "@gaming-hub/shared";
import type { EngineInstance, GameAction } from "../types";
import type {
  IGameResultAdapter,
  PlayerParticipant,
  TimeLimitResult,
  ValidationOutput,
} from "./IGameResultAdapter";

export class BubbleShooterResultAdapter implements IGameResultAdapter {
  public readonly gameId = "bubble-shooter" as const;

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
    if (s.players && s.players[seat]?.score !== undefined) return Number(s.players[seat].score) || 0;
    if (s.scores && s.scores[seat] !== undefined) return Number(s.scores[seat]) || 0;
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
    const scores = this.getAllScores(state, players);

    type PlayerRank = { seat: number; score: number; bubbleCount: number };
    const ranks: PlayerRank[] = (s.players || []).map((p: any) => ({
      seat: p.seat,
      score: Number(p.score) || 0,
      bubbleCount: Array.isArray(p.grid) ? p.grid.length : 0,
    }));

    ranks.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.bubbleCount - b.bubbleCount;
    });

    const best = ranks[0];
    let winnerSeats: number[] = [];
    if (best) {
      const topTied = ranks.filter(
        (r) => r.score === best.score && r.bubbleCount === best.bubbleCount,
      );
      if (topTied.length === 1) {
        winnerSeats = [best.seat];
      } else {
        winnerSeats = []; // Draw across leaders
      }
    }

    const isDraw = winnerSeats.length === 0;
    const winnerIds = winnerSeats
      .map((seat) => players.find((p) => p.seat === seat)?.userId)
      .filter((id): id is string => Boolean(id));

    const loserId = isDraw
      ? null
      : players.find((p) => !winnerSeats.includes(p.seat))?.userId ?? null;

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
