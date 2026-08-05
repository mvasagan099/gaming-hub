import { Chess, type Move } from "chess.js";
import type { JsonObject } from "@gaming-hub/shared";
import { ServerGameEngine } from "../base/ServerGameEngine";
import type { EngineActionResult, EngineEvent, EnginePlayer, RandomSource } from "../types";

export type ChessColor = "w" | "b";

export type ChessState = JsonObject & {
  fen: string;
  turn: ChessColor;
  inCheck: boolean;
  checkmate: boolean;
  stalemate: boolean;
  draw: boolean;
  insufficientMaterial: boolean;
  gameOver: boolean;
  winnerSeats: number[];
  currentSeat: number;
  finished: boolean;
  lastMove: { from: string; to: string; promotion?: string; san?: string } | null;
  moveCount: number;
  players: { seat: number; color: ChessColor }[];
};

export type ChessMoveAction = {
  type: "move";
  from: string;
  to: string;
  promotion?: string;
} & Record<string, unknown>;

export class ChessEngine extends ServerGameEngine<ChessState, ChessMoveAction> {
  readonly gameId = "chess" as const;

  constructor(players: EnginePlayer[], rng?: RandomSource) {
    super(players, rng);
    if (players.length !== 2) {
      throw new Error("Chess requires exactly 2 players");
    }
  }

  protected initState(): ChessState {
    const chess = new Chess();
    return this.serializeChess(chess);
  }

  private serializeChess(chess: Chess): ChessState {
    const finished = chess.isGameOver();
    const checkmate = chess.isCheckmate();
    const winnerSeats = checkmate
      ? [chess.turn() === "w" ? 1 : 0]
      : [];

    return {
      fen: chess.fen(),
      turn: chess.turn(),
      inCheck: chess.inCheck(),
      checkmate,
      stalemate: chess.isStalemate(),
      draw: chess.isDraw(),
      insufficientMaterial: chess.isInsufficientMaterial(),
      gameOver: finished,
      winnerSeats,
      currentSeat: chess.turn() === "w" ? 0 : 1,
      finished,
      lastMove: null,
      moveCount: chess.moveNumber(),
      players: this.players.map((p) => ({ seat: p.seat, color: p.seat === 0 ? "w" : "b" })),
    };
  }

  protected validateAction(action: ChessMoveAction, seat: number): string | null {
    const state = this.state;
    if (action.type !== "move") {
      return "Unknown action for Chess";
    }
    if (state.finished) {
      return "This match has already finished";
    }
    if (seat !== state.currentSeat) {
      return "It is not your turn";
    }
    const expectedColor: ChessColor = seat === 0 ? "w" : "b";
    if (state.turn !== expectedColor) {
      return "You are moving the wrong color";
    }
    return null;
  }

  protected applyValidatedAction(
    action: ChessMoveAction,
    _seat: number,
    state: ChessState,
  ): EngineActionResult<ChessState> {
    const events: EngineEvent[] = [];
    const chess = new Chess(state.fen);

    let move: Move | null;
    try {
      move = chess.move({ from: action.from, to: action.to, promotion: action.promotion });
    } catch {
      move = null;
    }

    if (!move) {
      return {
        ok: false,
        error: "Illegal move",
        state,
        events,
        finished: state.finished,
        winnerSeats: state.winnerSeats,
      };
    }

    events.push({
      type: "move",
      seat: _seat,
      from: action.from,
      to: action.to,
      promotion: action.promotion ?? null,
      san: move.san,
      isCapture: Boolean(move.captured),
      isCheck: chess.inCheck(),
    });

    if (chess.isCheckmate()) {
      events.push({ type: "checkmate", seat: _seat });
    } else if (chess.isStalemate()) {
      events.push({ type: "stalemate" });
    } else if (chess.isDraw()) {
      events.push({ type: "draw" });
    } else if (chess.inCheck()) {
      events.push({ type: "check" });
    }

    const next = this.serializeChess(chess);
    next.lastMove = {
      from: move.from,
      to: move.to,
      promotion: move.promotion ?? undefined,
      san: move.san,
    };
    next.moveCount = chess.moveNumber();

    return {
      ok: true,
      state: next,
      events,
      finished: next.finished,
      winnerSeats: next.winnerSeats,
    };
  }
}

export type ChessAction = ChessMoveAction;
