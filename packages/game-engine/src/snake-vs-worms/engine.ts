import type { EngineActionResult, EngineEvent, EnginePlayer, RandomSource } from "../types";
import { MultiplayerGameEngine } from "../base/MultiplayerGameEngine";
import type {
  SnakeVsWormsState,
  SnakeVsWormsAction,
  Snake,
  Worm,
  Food,
  SnakeVsWormsPlayer,
  SnakeVsWormsEngineOptions,
} from "./types";

export class SnakeVsWormsEngine extends MultiplayerGameEngine<SnakeVsWormsState, SnakeVsWormsAction> {
  readonly gameId = "snake-vs-worms" as const;
  private gridSize = 20;

  constructor(players: EnginePlayer[], rng?: RandomSource, options?: SnakeVsWormsEngineOptions) {
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

  protected initBaseState(): Omit<SnakeVsWormsState, keyof import("../base/MultiplayerGameEngine").BaseState> {
    const snakes: Snake[] = this.players.map((p, i) => ({
      id: i,
      seat: p.seat,
      body: [{ x: 5, y: 5 }],
      direction: "right",
      alive: true,
      life: 100,
    }));
    const worms: Worm[] = this.players.map((p, i) => ({
      id: i,
      seat: p.seat,
      body: [{ x: 10, y: 10 }],
      direction: "right",
      alive: true,
    }));

    const food: Food[] = [];

    const players: SnakeVsWormsPlayer[] = this.players.map((p) => ({
      seat: p.seat,
      name: `Player ${p.seat + 1}`,
      score: 0,
    }));

    return {
      snakes,
      worms,
      players,
      food,
      gameTimeMs: 0,
      winnerSeat: null,
      finished: false,
      foodEaten: 0,
    };
  }

  protected validateGameAction(action: SnakeVsWormsAction, seat: number, state: SnakeVsWormsState): string | null {
    if (state.finished) return "Game is over";
    switch (action.type) {
      case "turn":
        const snake = state.snakes.find((s) => s.seat === seat);
        if (!snake) return "No snake";
        return null;
      case "worm-turn":
        const worm = state.worms.find((w) => w.seat === seat);
        if (!worm) return "No worm";
        return null;
      default:
        return null;
    }
  }

  protected applyGameAction(action: SnakeVsWormsAction, seat: number, state: SnakeVsWormsState): EngineActionResult<SnakeVsWormsState> {
    const events: EngineEvent[] = [];
    const next = this.cloneState(state);
    const now = this.now();

    switch (action.type) {
      case "resign": {
        next.winnerSeat = next.players.findIndex((p) => p.seat !== seat);
        next.finished = true;
        events.push({ type: "resign", seat });
        return { ok: true, state: next, events, finished: true, winnerSeats: [next.winnerSeat] };
      }
      default:
        return { ok: false, error: "Unknown action", state: next, events: [], finished: state.finished, winnerSeats: state.winnerSeat ? [state.winnerSeat] : [] };
    }
  }

  protected onTurnTimerExpired(seat: number, state: SnakeVsWormsState): EngineActionResult<SnakeVsWormsState> {
    const next = this.cloneState(state);
    next.winnerSeat = (seat + 1) % 2; // TODO: two players?
    next.finished = true;
    const events: EngineEvent[] = [{ type: "turn-timeout", seat }];
    return { ok: true, state: next, events, finished: true, winnerSeats: [next.winnerSeat] };
  }
}

export type SnakeVsWormsActionTyp = SnakeVsWormsAction["type"];
