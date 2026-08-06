import type { EngineActionResult, EngineEvent, EnginePlayer, RandomSource } from "../types";
import { MultiplayerGameEngine } from "../base/MultiplayerGameEngine";
import type {
  FruitNinjaState,
  FruitNinjaAction,
  BladeSlice,
  FruitNinjaPlayer,
  Target,
  FruitNinjaEngineOptions,
} from "./types";

export class FruitNinjaEngine extends MultiplayerGameEngine<FruitNinjaState, FruitNinjaAction> {
  readonly gameId = "fruit-ninja" as const;

  private levelTargets = 10; // targets per level
  private comboThreshold = 5;  // min combo points

  constructor(players: EnginePlayer[], rng?: RandomSource, options?: FruitNinjaEngineOptions) {
    const turnTimer = options?.turnTimer ?? { turnDurationMs: 30000, warningThresholdMs: 5000 };
    const matchTimer = options?.matchTimer ?? { matchDurationMs: 1200000, warningThresholdMs: 60000 };
    super(players, rng, {
      turnTimer,
      matchTimer,
      enableResign: options?.enableResign ?? true,
      enableDraw: options?.enableDraw ?? true,
      enablePause: options?.enablePause ?? true,
      enableRematch: options?.enableRematch ?? true,
      now: options?.now,
    });
  }

  protected getInitialSeat(): number {
    return 0;
  }

  protected initBaseState(): Omit<FruitNinjaState, keyof import("../base/MultiplayerGameEngine").BaseState> {
    const players: FruitNinjaPlayer[] = this.players.map((p) => ({
      seat: p.seat,
      name: `Player ${p.seat + 1}`,
      score: 0,
      combos: 0,
      lives: 3,
      longestCombo: 0,
    }));

    return {
      players,
      stage: 1,
      level: 1,
      timeLeftMs: 60000, // 60 sec per level
      slices: [],
      targets: [],
      comboId: 0,
      comboScore: 0,
    };
  }

  protected validateGameAction(action: FruitNinjaAction, seat: number, state: FruitNinjaState): string | null {
    switch (action.type) {
      case "slice-begin":
      case "slice-end":
        if (state.finished) return "Game is over";
        if (seat !== 0) return "Not your turn"; // Solo play or turn-based multiplayer
        return null;
      default:
        return null;
    }
  }

  protected applyGameAction(action: FruitNinjaAction, seat: number, state: FruitNinjaState): EngineActionResult<FruitNinjaState> {
    const now = this.now();
    const events: EngineEvent[] = [];
    const next = this.cloneState(state);

    switch (action.type) {
      case "slice-begin":
        break;
      case "resign":
        next.winnerSeat = (seat + 1) % 2; // May not apply for single-player
        next.finished = true;
        events.push({ type: "resign", seat });
        return { ok: true, state: next, events, finished: true, winnerSeats: [next.winnerSeat] };
      default:
        return { ok: false, error: "Unknown action", state: next, events: [], finished: state.finished, winnerSeats: state.winnerSeat ? [state.winnerSeat] : [] };
    }

    return { ok: true, state: next, events, finished: state.finished, winnerSeats: state.winnerSeat ? [state.winnerSeat] : [] };
  }

  protected onTurnTimerExpired(seat: number, state: FruitNinjaState): EngineActionResult<FruitNinjaState> {
    const next = this.cloneState(state);
    next.winnerSeat = (seat + 1) % 2; // Turn-based: next player wins by timeout if applicable
    next.finished = true;
    const events: EngineEvent[] = [{ type: "turn-timeout", seat }];
    return { ok: true, state: next, events, finished: true, winnerSeats: [next.winnerSeat] };
  }
}

export type FruitNinjaActionTyp = FruitNinjaAction["type"];
