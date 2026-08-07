import type { EngineActionResult, EngineEvent, EnginePlayer, RandomSource } from "../types";
import { MultiplayerGameEngine } from "../base/MultiplayerGameEngine";
import type {
  TableTennisState,
  TableTennisAction,
  TableTennisBall,
  TableTennisPlayer,
  TableTennisEngineOptions,
} from "./types";

export class TableTennisEngine extends MultiplayerGameEngine<TableTennisState, TableTennisAction> {
  readonly gameId = "table-tennis" as const;

  private readonly rules = {
    pointsPerSet: 11,
    matchLength: 5, // Best of 5
  };

  constructor(players: EnginePlayer[], rng?: RandomSource, options?: TableTennisEngineOptions) {
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

  protected initBaseState(): Omit<TableTennisState, keyof import("../base/MultiplayerGameEngine").BaseState> {
    const players: TableTennisPlayer[] = this.players.map((p) => ({
      seat: p.seat,
      name: `Player ${p.seat + 1}`,
      score: 0,
      paddleX: 0.5,
      wins: 0,
    }));
    return {
      servingSeat: 0,
      players,
      rules: { pointsPerSet: this.rules.pointsPerSet, matchLength: this.rules.matchLength },
      sets: [0, 0],
      setPoints: [0, 0],
    };
  }

  protected validateGameAction(action: TableTennisAction, seat: number, state: TableTennisState): string | null {
    if (state.finished) return "Match is finished";
    if (state.paused) return "Match is paused";
    switch (action.type) {
      case "serve":
        if (state.ball && (state.ball as TableTennisBall).served) return "Ball already in play";
        if (seat !== state.servingSeat) return "Not your turn";
        return null;
      case "hit":
        if (!state.ball || !(state.ball as TableTennisBall).served) return "Ball not in play";
        if (action.angle < -Math.PI / 3 || action.angle > Math.PI / 3) return "Invalid angle";
        return null;
      default:
        return null;
    }
  }

  protected applyGameAction(action: TableTennisAction, seat: number, state: TableTennisState): EngineActionResult<TableTennisState> {
    const now = this.now();
    const events: EngineEvent[] = [];
    switch (action.type) {
      case "serve":
        const ns = this.cloneState(state);
        ns.ball = {
          x: 0.5,
          y: seat === 0 ? 0.1 : 0.9,
          vx: 0,
          vy: seat === 0 ? 0.1 : -0.1,
          served: true,
          servedBySeat: seat,
          lastHitSeat: null,
          bounced: 0,
        };
         events.push({ type: "serve-begin", seat });
        return { ok: true, state: ns, events, finished: ns.finished, winnerSeats: ns.winnerSeat ? [ns.winnerSeat] : [] };

      case "resign":
        const next = this.cloneState(state);
        next.winnerSeat = (seat + 1) % 2;
        next.finished = true;
        next.endReason = "resign";
        events.push({ type: "resign", seat });
        return { ok: true, state: next, events, finished: true, winnerSeats: [next.winnerSeat] };
      default:
        return { ok: false, error: "Unknown action", state, events: [], finished: state.finished, winnerSeats: state.winnerSeat ? [state.winnerSeat] : [] };
    }
  }

  protected onTurnTimerExpired(seat: number, state: TableTennisState): EngineActionResult<TableTennisState> {
    const next = this.cloneState(state);
    next.winnerSeat = (seat + 1) % 2;
    next.finished = true;
    next.endReason = "time-out";
    const events: EngineEvent[] = [{ type: "turn-timeout", seat }];
    return { ok: true, state: next, events, finished: true, winnerSeats: [next.winnerSeat] };
  }

  protected onMatchTimerExpired(state: TableTennisState): EngineActionResult<TableTennisState> {
    const next = this.cloneState(state);
    const winnerSeat = next.players[0].score > next.players[1].score ? 0 : 1;
    next.winnerSeat = winnerSeat;
    next.finished = true;
    next.endReason = "match-timeout";
    const events: EngineEvent[] = [{ type: "match-timeout" }];
    return { ok: true, state: next, events, finished: true, winnerSeats: [winnerSeat] };
  }
}

export type TableTennisActionTyp = TableTennisAction["type"];
