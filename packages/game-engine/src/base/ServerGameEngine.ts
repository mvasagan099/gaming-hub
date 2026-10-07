import type { GameId, JsonObject } from "@gaming-hub/shared";
import type {
  EngineActionResult,
  EngineInstance,
  EnginePlayer,
  GameAction,
  RandomSource,
} from "../types";

/**
 * Base class for server-authoritative game engines.
 *
 * Subclasses are pure state machines: they own a JSON-serializable `state`,
 * validate every incoming action and only mutate state through `applyAction`.
 * No I/O, no timers, no rendering — identical results on server, reconnect
 * and replay as long as the same action sequence is fed in with the same RNG.
 */
export abstract class ServerGameEngine<S extends JsonObject, A extends GameAction = GameAction>
  implements EngineInstance
{
  readonly players: EnginePlayer[];
  private randomSource: RandomSource;
  private _state: S | null = null;

  protected constructor(players: EnginePlayer[], rng?: RandomSource) {
    this.players = [...players].sort((a, b) => a.seat - b.seat);
    this.randomSource = rng ?? Math.random;
  }

  abstract readonly gameId: GameId;

  protected abstract initState(): S;

  /** Returns an error string when the action is illegal for this seat, otherwise null. */
  protected abstract validateAction(action: A, seat: number): string | null;

  /** Mutates and returns a fresh state. Only called after validation passes. */
  protected abstract applyValidatedAction(action: A, seat: number, state: S): EngineActionResult<S>;

  setRandomSource(rng: RandomSource): void {
    this.randomSource = rng;
  }

  protected random(): number {
    return this.randomSource();
  }

  protected randomInt(minInclusive: number, maxInclusive: number): number {
    const range = maxInclusive - minInclusive + 1;
    return minInclusive + Math.floor(this.random() * range);
  }

  get state(): S {
    if (this._state === null) {
      this._state = this.initState();
    }
    return this._state;
  }

  protected updateState(next: S): void {
    this._state = next;
  }

  serialize(): JsonObject {
    return structuredClone(this.state) as unknown as JsonObject;
  }

  persistenceState(): JsonObject { return structuredClone(this.state); }
  persistenceOptions(): JsonObject { return {}; }

  get finished(): boolean {
    return this.state.finished as boolean;
  }

  get winnerSeats(): number[] {
    return (this.state.winnerSeats as number[]) ?? [];
  }

  get currentSeat(): number {
    return this.state.currentSeat as number;
  }

  isSeatInGame(seat: number): boolean {
    return this.players.some((p) => p.seat === seat);
  }

  seatOf(userId: string): number | null {
    return this.players.find((p) => p.userId === userId)?.seat ?? null;
  }

  apply(action: A, seat: number): EngineActionResult<S> {
    const state = this.state;
    const rejected = (error: string): EngineActionResult<S> => ({
      ok: false,
      error,
      state,
      events: [],
      finished: this.finished,
      winnerSeats: this.winnerSeats,
    });

    if (!this.isSeatInGame(seat)) {
      return rejected("Your seat is not part of this match");
    }
    if (this.finished) {
      return rejected("This match has already finished");
    }
    if (!action || typeof action.type !== "string") {
      return rejected("Malformed action");
    }

    const validationError = this.validateAction(action, seat);
    if (validationError) {
      return rejected(validationError);
    }

    const result = this.applyValidatedAction(action, seat, state);
    this._state = result.state;
    return result;
  }

  /**
   * Restores the engine to a previous snapshot state.
   * Used for transactional rollback when downstream anti-cheat or validation rejects an applied action.
   */
  restoreState(state: S): void {
    this._state = structuredClone(state);
  }
}
