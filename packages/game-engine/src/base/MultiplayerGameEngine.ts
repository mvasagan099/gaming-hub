import type { JsonObject, JsonValue } from "@gaming-hub/shared";
import type {
  EngineActionResult,
  EngineEvent,
  EngineInstance,
  EngineOptions,
  EnginePlayer,
  GameAction,
  RandomSource,
} from "../types";
import { ServerGameEngine } from "./ServerGameEngine";

export interface TurnTimerConfig extends JsonObject {
  turnDurationMs: number;
  warningThresholdMs: number;
}

export interface MatchTimerConfig extends JsonObject {
  matchDurationMs: number;
  warningThresholdMs: number;
}

export interface TimeControlConfig {
  turnTimer?: TurnTimerConfig;
  matchTimer?: MatchTimerConfig;
}

export interface PlayerAction {
  type: "resign" | "draw-offer" | "draw-accept" | "draw-decline" | "rematch" | "pause" | "resume";
  [key: string]: unknown;
}

export interface BaseState extends JsonObject {
  finished: boolean;
  winnerSeats: number[];
  currentSeat: number;
  turnNumber: number;
  turnStartedAtMs: number | null;
  matchStartedAtMs: number | null;
  drawOfferedBy: number | null;
  paused: boolean;
  pausedAtMs: number | null;
  pausedBy: number | null;
  turnTimerConfig: TurnTimerConfig | null;
  matchTimerConfig: MatchTimerConfig | null;
  gameOver: boolean;
  endReason: string | null;
}

export interface MultiplayerEngineOptions extends EngineOptions {
  turnTimer?: TurnTimerConfig;
  matchTimer?: MatchTimerConfig;
  enableResign?: boolean;
  enableDraw?: boolean;
  enablePause?: boolean;
  enableRematch?: boolean;
  now?: () => number;
}

export abstract class MultiplayerGameEngine<
  S extends BaseState,
  A extends GameAction | PlayerAction = GameAction | PlayerAction
> extends ServerGameEngine<S, A> {
  protected readonly turnTimerConfig?: TurnTimerConfig;
  protected readonly matchTimerConfig?: MatchTimerConfig;
  protected readonly enableResign: boolean;
  protected readonly enableDraw: boolean;
  protected readonly enablePause: boolean;
  protected readonly enableRematch: boolean;
  protected readonly now: () => number;

  constructor(
    players: EnginePlayer[],
    rng?: RandomSource,
    options?: MultiplayerEngineOptions,
  ) {
    super(players, rng);
    this.turnTimerConfig = options?.turnTimer;
    this.matchTimerConfig = options?.matchTimer;
    this.enableResign = options?.enableResign ?? true;
    this.enableDraw = options?.enableDraw ?? true;
    this.enablePause = options?.enablePause ?? false;
    this.enableRematch = options?.enableRematch ?? false;
    this.now = options?.now ?? Date.now;
  }

  get currentClockDeadline(): number | null {
    const state = this.state;
    if (!state.turnTimerConfig || state.finished || state.paused) return null;
    if (state.turnStartedAtMs === null) return null;
    return state.turnStartedAtMs + state.turnTimerConfig.turnDurationMs;
  }

  override persistenceOptions(): JsonObject {
    return {
      turnTimer: this.state.turnTimerConfig,
      matchTimer: this.state.matchTimerConfig,
      enableResign: this.enableResign, enableDraw: this.enableDraw,
      enablePause: this.enablePause, enableRematch: this.enableRematch,
    };
  }

  get currentMatchDeadline(): number | null {
    const state = this.state;
    if (!state.matchTimerConfig || state.finished || state.paused) return null;
    // Anchor an unstarted legacy clock once; never slide its deadline on reads.
    if (state.matchStartedAtMs === null) state.matchStartedAtMs = this.now();
    const start = state.matchStartedAtMs;
    return start + state.matchTimerConfig.matchDurationMs;
  }

  startMatchClock(): void {
    if (!this.state.finished && this.state.matchStartedAtMs === null) this.startMatchTimer(this.state);
  }

  protected abstract initBaseState(): Omit<S, keyof BaseState>;

  protected override initState(): S {
    const baseState = this.initBaseState();
    const initialState = {
      ...baseState,
      finished: false,
      winnerSeats: [],
      currentSeat: this.getInitialSeat(),
      turnNumber: 0,
      turnStartedAtMs: null,
      matchStartedAtMs: null,
      drawOfferedBy: null,
      paused: false,
      pausedAtMs: null,
      pausedBy: null,
      turnTimerConfig: this.turnTimerConfig ?? null,
      matchTimerConfig: this.matchTimerConfig ?? null,
      gameOver: false,
      endReason: null,
    };
    return initialState as unknown as S;
  }

  protected getInitialSeat(): number {
    return 0;
  }

  /** Default resolution when the turn flag expires: the timed-out player loses. */
  protected onTurnTimerExpired(seat: number, state: S): EngineActionResult<S> {
    const next = this.cloneState(state);
    next.finished = true;
    next.gameOver = true;
    next.endReason = "turn-timeout";
    next.turnStartedAtMs = null;
    next.matchStartedAtMs = null;
    const winnerSeats = seat === 0 ? [1] : [0];
    next.winnerSeats = winnerSeats;
    return {
      ok: true,
      state: next,
      events: [{ type: "turn-timeout", seat }],
      finished: true,
      winnerSeats,
    };
  }

  /**
   * Deterministically resolves winner seats from the current authoritative game state
   * when the global match timer expires. Subclasses override this with their game-specific
   * existing progress / score / position rules.
   */
  protected resolveTimeoutWinner(state: S): number[] {
    return [state.currentSeat];
  }

  /** Resolution when the whole-match deadline expires: invokes game-specific resolveTimeoutWinner. */
  protected onMatchTimerExpired(state: S): EngineActionResult<S> {
    const next = this.cloneState(state);
    const winnerSeats = this.resolveTimeoutWinner(next);
    next.finished = true;
    next.gameOver = true;
    next.endReason = "match-timeout";
    next.turnStartedAtMs = null;
    next.matchStartedAtMs = null;
    next.winnerSeats = winnerSeats;
    return {
      ok: true,
      state: next,
      events: [{ type: "match-timeout", winnerSeats }],
      finished: true,
      winnerSeats,
    };
  }

  handleTimeout(kind: "turn" | "match", seat?: number): EngineActionResult<S> {
    if (this.state.finished || this.state.paused) {
      return {
        ok: false,
        error: "Match is not in an active state",
        state: this.state,
        events: [],
        finished: this.state.finished,
        winnerSeats: this.state.winnerSeats,
      };
    }
    const result =
      kind === "turn"
        ? this.onTurnTimerExpired(seat ?? this.state.currentSeat, this.state)
        : this.onMatchTimerExpired(this.state);

    if (result.ok) {
      this.updateState(result.state);
    }
    return result;
  }

  protected startTurnTimer(state: S): void {
    if (this.turnTimerConfig) {
      state.turnStartedAtMs = this.now();
    }
  }

  protected startMatchTimer(state: S): void {
    if (this.matchTimerConfig) {
      state.matchStartedAtMs = this.now();
    }
  }

  protected finalizeTurnTimer(state: S): number {
    if (!this.turnTimerConfig || state.turnStartedAtMs === null) return 0;
    const elapsed = Math.max(0, this.now() - state.turnStartedAtMs);
    const remaining = Math.max(0, this.turnTimerConfig.turnDurationMs - elapsed);
    state.turnStartedAtMs = null;
    return remaining;
  }

  protected finalizeMatchTimer(state: S): number {
    if (!this.matchTimerConfig || state.matchStartedAtMs === null) return 0;
    const elapsed = Math.max(0, this.now() - state.matchStartedAtMs);
    const remaining = Math.max(0, this.matchTimerConfig.matchDurationMs - elapsed);
    state.matchStartedAtMs = null;
    return remaining;
  }

  protected isBaseAction(type: string): boolean {
    return [
      "resign",
      "draw-offer",
      "draw-accept",
      "draw-decline",
      "pause",
      "resume",
      "rematch",
    ].includes(type);
  }

  protected override validateAction(action: A, seat: number): string | null {
    const state = this.state;
    if (state.finished) {
      return "This match has already finished";
    }
    if (state.paused && action.type !== "resume" && action.type !== "chat" && action.type !== "emoji") {
      return "Game is paused";
    }

    if (this.isBaseAction(action.type)) {
      return this.validateBaseAction(action as PlayerAction, seat, state);
    }

    return this.validateGameAction(action, seat, state);
  }

  protected validateBaseAction(action: PlayerAction, seat: number, state: S): string | null {
    switch (action.type) {
      case "resign":
        if (!this.enableResign) return "Resign is not enabled";
        return null;
      case "draw-offer":
        if (!this.enableDraw) return "Draw offers are not enabled";
        if (state.drawOfferedBy === seat) return "You already offered a draw";
        return null;
      case "draw-accept":
        if (!this.enableDraw) return "Draw offers are not enabled";
        if (state.drawOfferedBy === null) return "There is no draw offer to accept";
        if (state.drawOfferedBy === seat) return "You cannot accept your own draw offer";
        return null;
      case "draw-decline":
        if (!this.enableDraw) return "Draw offers are not enabled";
        if (state.drawOfferedBy === null) return "There is no draw offer to decline";
        return null;
      case "pause":
        if (!this.enablePause) return "Pause is not enabled";
        if (state.paused) return "Game is already paused";
        return null;
      case "resume":
        if (!this.enablePause) return "Pause is not enabled";
        if (!state.paused) return "Game is not paused";
        return null;
      case "rematch":
        if (!this.enableRematch) return "Rematch is not enabled";
        if (!state.finished) return "Game is not finished yet";
        return null;
      default:
        return null;
    }
  }

  protected abstract validateGameAction(action: A, seat: number, state: S): string | null;

  protected override applyValidatedAction(action: A, seat: number, state: S): EngineActionResult<S> {
    const baseResult = this.applyBaseAction(action as PlayerAction, seat, state);
    if (baseResult) return baseResult;

    return this.applyGameAction(action, seat, state);
  }

  protected applyBaseAction(action: PlayerAction, seat: number, state: S): EngineActionResult<S> | null {
    const now = this.now();

    switch (action.type) {
      case "resign": {
        const next = this.cloneState(state);
        next.finished = true;
        next.gameOver = true;
        const winnerSeats = this.players
          .map((p) => p.seat)
          .filter((s) => s !== seat);
        next.winnerSeats = winnerSeats.length > 0 ? winnerSeats : [seat === 0 ? 1 : 0];
        if ("winner" in next) {
          (next as unknown as Record<string, unknown>).winner = next.winnerSeats[0] ?? null;
        }
        next.endReason = "resign";
        next.turnStartedAtMs = null;
        next.matchStartedAtMs = null;
        return {
          ok: true,
          state: next,
          events: [{ type: "resign", seat, winner: next.winnerSeats[0] ?? null, winnerSeats: next.winnerSeats }],
          finished: true,
          winnerSeats: next.winnerSeats,
        };
      }

      case "draw-offer": {
        const next = this.cloneState(state);
        next.drawOfferedBy = seat;
        return {
          ok: true,
          state: next,
          events: [{ type: "draw-offer", seat }],
          finished: false,
          winnerSeats: [],
        };
      }

      case "draw-accept": {
        const next = this.cloneState(state);
        next.drawOfferedBy = null;
        next.finished = true;
        next.gameOver = true;
        next.winnerSeats = [];
        next.endReason = "agreement";
        next.turnStartedAtMs = null;
        next.matchStartedAtMs = null;
        return {
          ok: true,
          state: next,
          events: [{ type: "draw-accept", seat }],
          finished: true,
          winnerSeats: [],
        };
      }

      case "draw-decline": {
        const next = this.cloneState(state);
        next.drawOfferedBy = null;
        return {
          ok: true,
          state: next,
          events: [{ type: "draw-decline", seat }],
          finished: false,
          winnerSeats: [],
        };
      }

      case "pause": {
        const next = this.cloneState(state);
        next.paused = true;
        next.pausedAtMs = now;
        next.pausedBy = seat;
        next.turnStartedAtMs = null;
        return {
          ok: true,
          state: next,
          events: [{ type: "pause", seat }],
          finished: false,
          winnerSeats: [],
        };
      }

      case "resume": {
        const next = this.cloneState(state);
        next.paused = false;
        next.pausedAtMs = null;
        next.pausedBy = null;
        if (this.turnTimerConfig) {
          next.turnStartedAtMs = now;
        }
        if (this.matchTimerConfig && next.matchStartedAtMs === null) {
          next.matchStartedAtMs = now;
        }
        return {
          ok: true,
          state: next,
          events: [{ type: "resume", seat }],
          finished: false,
          winnerSeats: [],
        };
      }

      case "rematch": {
        return {
          ok: false,
          error: "Rematch must be handled at room level",
          state,
          events: [],
          finished: state.finished,
          winnerSeats: state.winnerSeats,
        };
      }

      default:
        return null;
    }
  }

  protected abstract applyGameAction(action: A, seat: number, state: S): EngineActionResult<S>;

  protected cloneState(state: S): S {
    return structuredClone(state);
  }

  protected serializeWithLiveTimers(state: S): S {
    const copy = this.cloneState(state);
    const now = this.now();

    if (copy.turnTimerConfig && copy.turnStartedAtMs !== null && !copy.paused) {
      const elapsed = Math.max(0, now - copy.turnStartedAtMs);
      (copy as Record<string, JsonValue>).turnRemainingMs = Math.max(0, copy.turnTimerConfig.turnDurationMs - elapsed);
      copy.turnStartedAtMs = now;
    }

    if (copy.matchTimerConfig && copy.matchStartedAtMs !== null && !copy.paused) {
      const elapsed = Math.max(0, now - copy.matchStartedAtMs);
      (copy as Record<string, JsonValue>).matchRemainingMs = Math.max(0, copy.matchTimerConfig.matchDurationMs - elapsed);
    }

    return copy;
  }

  override serialize(): JsonObject {
    const copy = this.serializeWithLiveTimers(this.state);
    return copy as unknown as JsonObject;
  }
}
