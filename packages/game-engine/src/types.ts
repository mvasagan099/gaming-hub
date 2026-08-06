import type { GameId, JsonObject } from "@gaming-hub/shared";
import type { ChessTimeControlConfig } from "@gaming-hub/shared";

/** A participant in a match. Seats are 0-indexed and stable for the whole match. */
export interface EnginePlayer {
  userId: string;
  seat: number;
}

/** Per-game engine construction options (e.g. chess time controls). */
export interface EngineOptions {
  timeControl?: ChessTimeControlConfig | null;
}

/** Anything a client can submit to the engine. */
export interface GameAction {
  type: string;
  [key: string]: unknown;
}

/** A user-controlled or server-generated event emitted during a state transition. */
export interface EngineEvent {
  type: string;
  [key: string]: unknown;
}

/** Deterministic RNG source returning a value in [0, 1). */
export type RandomSource = () => number;

export interface EngineActionResult<S extends JsonObject> {
  ok: boolean;
  error?: string;
  state: S;
  events: EngineEvent[];
  finished: boolean;
  winnerSeats: number[];
}

/** Structural contract every game engine satisfies regardless of game specifics. */
export interface EngineInstance {
  readonly gameId: GameId;
  apply(action: GameAction, seat: number): EngineActionResult<JsonObject>;
  readonly state: JsonObject;
  readonly currentSeat: number;
  readonly finished: boolean;
  readonly winnerSeats: number[];
  seatOf(userId: string): number | null;
  serialize(): JsonObject;
  setRandomSource(rng: RandomSource): void;
  /** Wall-clock deadline for the current seat's flag, for clock-capable games. */
  readonly currentClockDeadline?: number | null;
}
