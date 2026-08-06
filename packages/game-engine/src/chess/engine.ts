import { Chess, type Move } from "chess.js";
import type { JsonObject } from "@gaming-hub/shared";
import type { ChessTimeControlConfig } from "@gaming-hub/shared";
import { ServerGameEngine } from "../base/ServerGameEngine";
import type { EngineActionResult, EngineEvent, EngineOptions, EnginePlayer, RandomSource } from "../types";

export type ChessColor = "w" | "b";

export interface ChessEngineOptions extends EngineOptions {
  /** Injectable wall clock for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

export type ChessEndReason =
  | "checkmate"
  | "stalemate"
  | "insufficient"
  | "repetition"
  | "fifty-move"
  | "agreement"
  | "resign"
  | "flag"
  | null;

/** Per-seat clock. `startedAtMs` includes the delay, so the countdown begins after it. */
export type ChessClockSnapshot = {
  remainingMs: number;
  startedAtMs: number | null;
};

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
  /** SAN of every played ply, in order. */
  history: string[];
  players: { seat: number; color: ChessColor }[];
  timeControl: ChessTimeControlConfig | null;
  clocks: { [seat: string]: ChessClockSnapshot } | null;
  lastMoveAtMs: number | null;
  drawOfferedBy: number | null;
  result: "1-0" | "0-1" | "1/2-1/2" | "*";
  endReason: ChessEndReason;
};

export type ChessMoveAction = {
  type: "move";
  from: string;
  to: string;
  promotion?: string;
} & Record<string, unknown>;

export type ChessResignAction = { type: "resign" } & Record<string, unknown>;
export type ChessDrawOfferAction = { type: "draw-offer" } & Record<string, unknown>;
export type ChessDrawAcceptAction = { type: "draw-accept" } & Record<string, unknown>;
export type ChessDrawDeclineAction = { type: "draw-decline" } & Record<string, unknown>;
export type ChessFlagAction = { type: "flag" } & Record<string, unknown>;

export type ChessAction =
  | ChessMoveAction
  | ChessResignAction
  | ChessDrawOfferAction
  | ChessDrawAcceptAction
  | ChessDrawDeclineAction
  | ChessFlagAction;

export class ChessEngine extends ServerGameEngine<ChessState, ChessAction> {
  readonly gameId = "chess" as const;

  private readonly timeControl: ChessTimeControlConfig | null;
  private readonly now: () => number;

  constructor(players: EnginePlayer[], rng?: RandomSource, options?: ChessEngineOptions) {
    super(players, rng);
    if (players.length !== 2) {
      throw new Error("Chess requires exactly 2 players");
    }
    const tc = options?.timeControl;
    this.timeControl =
      tc && tc.baseSeconds > 0
        ? {
            baseSeconds: tc.baseSeconds,
            incrementSeconds: tc.incrementSeconds,
            delaySeconds: tc.delaySeconds,
          }
        : null;
    this.now = options?.now ?? Date.now;
  }

  /** Wall-clock timestamp at which the current seat's clock hits zero, or null. */
  get currentClockDeadline(): number | null {
    const state = this.state as ChessState;
    if (!state.timeControl || !state.clocks || state.finished) return null;
    const clock = state.clocks[state.currentSeat];
    if (!clock || clock.startedAtMs === null) return null;
    return clock.startedAtMs + clock.remainingMs;
  }

  protected initState(): ChessState {
    const chess = new Chess();
    const state = this.serializeChess(chess);
    state.timeControl = this.timeControl;
    state.clocks = this.timeControl
      ? {
          0: { remainingMs: this.timeControl.baseSeconds * 1000, startedAtMs: null },
          1: { remainingMs: this.timeControl.baseSeconds * 1000, startedAtMs: null },
        }
      : null;
    state.lastMoveAtMs = null;
    state.history = [];
    state.drawOfferedBy = null;
    if (this.timeControl) {
      this.startClock(state, state.currentSeat, this.now());
    }
    return state;
  }

  private serializeChess(chess: Chess): ChessState {
    const finished = chess.isGameOver();
    const checkmate = chess.isCheckmate();
    const stalemate = chess.isStalemate();
    const insufficientMaterial = chess.isInsufficientMaterial();
    const repetition = chess.isThreefoldRepetition();
    const fiftyMove = chess.isDrawByFiftyMoves();
    const draw = chess.isDraw();
    const winnerSeats = checkmate ? [chess.turn() === "w" ? 1 : 0] : [];

    return {
      fen: chess.fen(),
      turn: chess.turn(),
      inCheck: chess.inCheck(),
      checkmate,
      stalemate,
      draw,
      insufficientMaterial,
      gameOver: finished,
      winnerSeats,
      currentSeat: chess.turn() === "w" ? 0 : 1,
      finished,
      lastMove: null,
      moveCount: chess.moveNumber(),
      history: [],
      players: this.players.map((p) => ({ seat: p.seat, color: p.seat === 0 ? "w" : "b" })),
      timeControl: this.timeControl,
      clocks: null,
      lastMoveAtMs: null,
      drawOfferedBy: null,
      result: finished
        ? checkmate
          ? chess.turn() === "w"
            ? "0-1"
            : "1-0"
          : "1/2-1/2"
        : "*",
      endReason: finished
        ? checkmate
          ? "checkmate"
          : stalemate
            ? "stalemate"
            : insufficientMaterial
              ? "insufficient"
              : repetition
                ? "repetition"
              : fiftyMove
                ? "fifty-move"
                : null
        : null,
    };
  }

  private startClock(state: ChessState, seat: number, now: number): void {
    if (!state.clocks) return;
    const clock = state.clocks[seat];
    if (!clock) return;
    const delayMs = state.timeControl ? state.timeControl.delaySeconds * 1000 : 0;
    clock.startedAtMs = now + delayMs;
  }

  private finalizeClock(state: ChessState, seat: number, now: number): number {
    if (!state.clocks) return Infinity;
    const clock = state.clocks[seat];
    if (!clock || clock.startedAtMs === null) return clock?.remainingMs ?? 0;
    const elapsed = Math.max(0, now - clock.startedAtMs);
    clock.remainingMs = Math.max(0, clock.remainingMs - elapsed);
    clock.startedAtMs = null;
    return clock.remainingMs;
  }

  /** Serializes with live clocks so clients always see the running countdown. */
  override serialize(): JsonObject {
    const copy = structuredClone(this.state) as ChessState;
    if (copy.clocks) {
      const now = this.now();
      for (const seatKey of Object.keys(copy.clocks)) {
        const clock = copy.clocks[seatKey];
        if (clock && clock.startedAtMs !== null) {
          const elapsed = Math.max(0, now - clock.startedAtMs);
          clock.remainingMs = Math.max(0, clock.remainingMs - elapsed);
          clock.startedAtMs = now;
        }
      }
    }
    return copy as unknown as JsonObject;
  }

  protected validateAction(action: ChessAction, seat: number): string | null {
    const state = this.state;
    if (state.finished) {
      return "This match has already finished";
    }

    switch (action.type) {
      case "move": {
        if (seat !== state.currentSeat) {
          return "It is not your turn";
        }
        const expectedColor: ChessColor = seat === 0 ? "w" : "b";
        if (state.turn !== expectedColor) {
          return "You are moving the wrong color";
        }
        return null;
      }
      case "resign":
        return null;
      case "draw-offer":
        if (state.drawOfferedBy === seat) {
          return "You already offered a draw";
        }
        return null;
      case "draw-accept":
        if (state.drawOfferedBy === null) {
          return "There is no draw offer to accept";
        }
        if (state.drawOfferedBy === seat) {
          return "You cannot accept your own draw offer";
        }
        return null;
      case "draw-decline":
        if (state.drawOfferedBy === null) {
          return "There is no draw offer to decline";
        }
        return null;
      case "flag":
        if (!state.timeControl || !state.clocks) {
          return "This game has no clock";
        }
        if (seat !== state.currentSeat) {
          return "The clock belongs to the current player";
        }
        return null;
      default:
        return "Unknown action for Chess";
    }
  }

  protected applyValidatedAction(
    action: ChessAction,
    seat: number,
    state: ChessState,
  ): EngineActionResult<ChessState> {
    const now = this.now();
    switch (action.type) {
      case "move":
        return this.applyMove(action, seat, state, now);
      case "resign":
        return this.applyResign(seat, state);
      case "draw-offer":
        return this.applyDrawOffer(seat, state);
      case "draw-accept":
        return this.applyDrawAccept(seat, state);
      case "draw-decline":
        return this.applyDrawDecline(seat, state);
      case "flag":
        return this.applyFlag(seat, state, now);
      default:
        return {
          ok: false,
          error: "Unknown action for Chess",
          state,
          events: [],
          finished: state.finished,
          winnerSeats: state.winnerSeats,
        };
    }
  }

  private applyMove(
    action: ChessMoveAction,
    seat: number,
    state: ChessState,
    now: number,
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
      seat,
      from: action.from,
      to: action.to,
      promotion: action.promotion ?? null,
      san: move.san,
      isCapture: Boolean(move.captured),
      isCheck: chess.inCheck(),
    });

    const next = this.serializeChess(chess);
    next.lastMove = {
      from: move.from,
      to: move.to,
      promotion: move.promotion ?? undefined,
      san: move.san,
    };
    next.moveCount = chess.moveNumber();
    next.history = [...state.history, move.san];
    next.timeControl = state.timeControl;
    next.drawOfferedBy = null;
    next.lastMoveAtMs = now;

    if (state.clocks && state.timeControl) {
      next.clocks = structuredClone(state.clocks);
      const remaining = this.finalizeClock(next, seat, now);
      if (remaining <= 0) {
        next.finished = true;
        next.gameOver = true;
        next.winnerSeats = [seat === 0 ? 1 : 0];
        next.result = seat === 0 ? "0-1" : "1-0";
        next.endReason = "flag";
        next.currentSeat = seat;
        events.push({ type: "flag", seat });
      } else {
        next.clocks[seat]!.remainingMs = remaining + state.timeControl.incrementSeconds * 1000;
        this.startClock(next, next.currentSeat, now);
      }
    } else {
      next.clocks = null;
    }

    if (next.finished) {
      if (next.endReason === "checkmate") {
        events.push({ type: "checkmate", seat });
      } else if (next.endReason === "stalemate") {
        events.push({ type: "stalemate" });
      } else if (next.endReason !== "flag") {
        events.push({ type: "draw", reason: next.endReason });
      }
    } else if (chess.inCheck()) {
      events.push({ type: "check" });
    }

    return {
      ok: true,
      state: next,
      events,
      finished: next.finished,
      winnerSeats: next.winnerSeats,
    };
  }

  private applyResign(seat: number, state: ChessState): EngineActionResult<ChessState> {
    const next = structuredClone(state);
    next.finished = true;
    next.gameOver = true;
    next.winnerSeats = [seat === 0 ? 1 : 0];
    next.result = seat === 0 ? "0-1" : "1-0";
    next.endReason = "resign";
    return {
      ok: true,
      state: next,
      events: [{ type: "resign", seat }],
      finished: true,
      winnerSeats: next.winnerSeats,
    };
  }

  private applyDrawOffer(seat: number, state: ChessState): EngineActionResult<ChessState> {
    const next = structuredClone(state);
    next.drawOfferedBy = seat;
    return {
      ok: true,
      state: next,
      events: [{ type: "draw-offer", seat }],
      finished: false,
      winnerSeats: [],
    };
  }

  private applyDrawAccept(seat: number, state: ChessState): EngineActionResult<ChessState> {
    const next = structuredClone(state);
    next.drawOfferedBy = null;
    next.finished = true;
    next.gameOver = true;
    next.winnerSeats = [];
    next.result = "1/2-1/2";
    next.endReason = "agreement";
    return {
      ok: true,
      state: next,
      events: [{ type: "draw-accept", seat }],
      finished: true,
      winnerSeats: [],
    };
  }

  private applyDrawDecline(seat: number, state: ChessState): EngineActionResult<ChessState> {
    const next = structuredClone(state);
    next.drawOfferedBy = null;
    return {
      ok: true,
      state: next,
      events: [{ type: "draw-decline", seat }],
      finished: false,
      winnerSeats: [],
    };
  }

  private applyFlag(seat: number, state: ChessState, now: number): EngineActionResult<ChessState> {
    const next = structuredClone(state);
    if (next.clocks) {
      this.finalizeClock(next, seat, now);
      if (next.clocks[seat]!.remainingMs > 0) {
        return {
          ok: false,
          error: "Not out of time yet",
          state,
          events: [],
          finished: state.finished,
          winnerSeats: state.winnerSeats,
        };
      }
    }
    next.finished = true;
    next.gameOver = true;
    next.winnerSeats = [seat === 0 ? 1 : 0];
    next.result = seat === 0 ? "0-1" : "1-0";
    next.endReason = "flag";
    return {
      ok: true,
      state: next,
      events: [{ type: "flag", seat }],
      finished: true,
      winnerSeats: next.winnerSeats,
    };
  }
}

export type ChessActionType = ChessAction["type"];
