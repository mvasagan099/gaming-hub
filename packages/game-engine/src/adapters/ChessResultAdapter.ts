import type { JsonObject, StandardMatchResult } from "@gaming-hub/shared";
import type { EngineInstance, GameAction } from "../types";
import type {
  IGameResultAdapter,
  PlayerParticipant,
  TimeLimitResult,
  ValidationOutput,
} from "./IGameResultAdapter";

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

function evaluateMaterial(fen: string): { white: number; black: number } {
  let white = 0;
  let black = 0;
  const boardPart = (fen || "").split(" ")[0] || "";
  for (const char of boardPart) {
    const lower = char.toLowerCase();
    const val = PIECE_VALUES[lower];
    if (val !== undefined) {
      if (char === char.toUpperCase()) {
        white += val;
      } else {
        black += val;
      }
    }
  }
  return { white, black };
}

export class ChessResultAdapter implements IGameResultAdapter {
  public readonly gameId = "chess" as const;

  public getAuthoritativeState(engine: EngineInstance): JsonObject {
    return (engine.serialize ? engine.serialize() : engine.state) as JsonObject;
  }

  public validateAction(state: JsonObject, action: GameAction, seat: number): ValidationOutput {
    if (!action || !action.type) {
      return { valid: false, reason: "Action type is missing" };
    }
    if (action.type === "move") {
      if (!action.from || !action.to) {
        return { valid: false, reason: "Move must include 'from' and 'to' coordinates" };
      }
    }
    return { valid: true };
  }

  public getCurrentScore(state: JsonObject, seat: number): number {
    const s = state as any;
    const fen = s.fen || s.chessState?.fen;
    if (fen) {
      const mat = evaluateMaterial(fen);
      const isWhite = seat === 0 || s.players?.[seat]?.color === "w";
      return isWhite ? mat.white : mat.black;
    }
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
    const fen = s.fen || s.chessState?.fen || "";
    const mat = evaluateMaterial(fen);

    const whitePlayer = players.find((p) => p.seat === 0) || players[0];
    const blackPlayer = players.find((p) => p.seat === 1) || players[1];

    let winnerSeats: number[] = [];
    if (mat.white > mat.black) {
      winnerSeats = [0];
    } else if (mat.black > mat.white) {
      winnerSeats = [1];
    } else {
      // Tied material: compare clock remaining
      const wClock = s.clocks?.[0]?.remainingMs ?? s.clocks?.w?.remainingMs ?? 0;
      const bClock = s.clocks?.[1]?.remainingMs ?? s.clocks?.b?.remainingMs ?? 0;
      if (wClock > bClock) {
        winnerSeats = [0];
      } else if (bClock > wClock) {
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
    if (proposedResult.loser && !playerIds.has(proposedResult.loser)) {
      return { valid: false, reason: `Loser ${proposedResult.loser} is not a valid participant` };
    }

    return { valid: true };
  }
}
