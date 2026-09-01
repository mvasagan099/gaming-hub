import type { JsonObject, StandardMatchResult } from "@gaming-hub/shared";
import type { EngineInstance, GameAction } from "../types";
import type {
  IGameResultAdapter,
  PlayerParticipant,
  TimeLimitResult,
  ValidationOutput,
} from "./IGameResultAdapter";

const START_POSITION: Record<string, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

const HOME_COL_BASE: Record<string, number> = {
  red: 100,
  green: 200,
  yellow: 300,
  blue: 400,
};

export class LudoResultAdapter implements IGameResultAdapter {
  public readonly gameId = "ludo" as const;

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
    if (s.players && s.players[seat]) {
      const p = s.players[seat];
      let totalProgress = 0;
      for (const t of p.tokens || []) {
        if (t.isFinished) {
          totalProgress += 57;
        } else if (t.isHome) {
          const base = HOME_COL_BASE[p.color] ?? 100;
          totalProgress += 51 + (t.position - base);
        } else if (t.position >= 0) {
          const startPos = START_POSITION[p.color] ?? 0;
          totalProgress += (t.position - startPos + 52) % 52;
        }
      }
      return totalProgress;
    }
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

    type PlayerRank = { seat: number; finishedCount: number; totalProgress: number; maxProgress: number };
    const ranks: PlayerRank[] = (s.players || []).map((p: any) => {
      let finishedCount = 0;
      let totalProgress = 0;
      let maxProgress = 0;
      for (const t of p.tokens || []) {
        if (t.isFinished) {
          finishedCount++;
          totalProgress += 57;
          maxProgress = Math.max(maxProgress, 57);
        } else if (t.isHome) {
          const base = HOME_COL_BASE[p.color] ?? 100;
          const prog = 51 + (t.position - base);
          totalProgress += prog;
          maxProgress = Math.max(maxProgress, prog);
        } else if (t.position >= 0) {
          const startPos = START_POSITION[p.color] ?? 0;
          const dist = (t.position - startPos + 52) % 52;
          totalProgress += dist;
          maxProgress = Math.max(maxProgress, dist);
        }
      }
      return { seat: p.seat, finishedCount, totalProgress, maxProgress };
    });

    ranks.sort((a, b) => {
      if (b.finishedCount !== a.finishedCount) return b.finishedCount - a.finishedCount;
      if (b.totalProgress !== a.totalProgress) return b.totalProgress - a.totalProgress;
      return b.maxProgress - a.maxProgress;
    });

    const best = ranks[0];
    let winnerSeats: number[] = [];
    if (best) {
      const topTied = ranks.filter(
        (r) =>
          r.finishedCount === best.finishedCount &&
          r.totalProgress === best.totalProgress &&
          r.maxProgress === best.maxProgress,
      );
      if (topTied.length === 1) {
        winnerSeats = [best.seat];
      } else {
        winnerSeats = []; // Draw across tied leaders
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
