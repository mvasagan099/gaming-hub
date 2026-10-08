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
  /** Optional compact presentation snapshot; canonical checkpoints remain complete. */
  serializeForSync?(includeTrajectory: boolean): JsonObject;
  /** Canonical checkpoint, without live-clock presentation adjustments. */
  persistenceState(): JsonObject;
  persistenceOptions(): JsonObject;
  restoreState(state: JsonObject): void;
  setRandomSource(rng: RandomSource): void;
  /** Wall-clock deadline for the current seat's flag, for clock-capable games. */
  readonly currentClockDeadline?: number | null;
  /**
   * Optional wall-clock deadline for the whole match, when the match must end
   * regardless of whose turn it is (e.g. speedrun or timer-constrained modes).
   */
  readonly currentMatchDeadline?: number | null;
  /**
   * Resolves a wall-clock deadline expiry. `kind` distinguishes the per-turn
   * flag ("turn") from the whole-match deadline ("match"). Engines that do not
   * support timeouts (or that handle them internally) may omit this method;
   * hosts should then fall back to their own default (e.g. flagging the player).
   */
  handleTimeout?(kind: "turn" | "match", seat?: number): EngineActionResult<JsonObject>;
}
