import type { JsonObject } from "@gaming-hub/shared";
import { MultiplayerGameEngine } from "../base/MultiplayerGameEngine";
import type { EngineActionResult, EngineEvent, EnginePlayer, GameAction, RandomSource } from "../types";
import { BOARD_SIZE, resolveDestination } from "./board";
import type {
  SnakeLadderLastMove,
  SnakeLadderPlayerState,
  SnakeLadderSettings,
  SnakeLadderState,
  RollAction,
} from "./types";

const MAX_LOGS = 6;

export interface SnakeLadderEngineOptions {
  settings?: SnakeLadderSettings;
  turnTimer?: { turnDurationMs: number; warningThresholdMs: number };
  matchTimer?: { matchDurationMs: number; warningThresholdMs: number };
  enableResign?: boolean;
  enableDraw?: boolean;
  enablePause?: boolean;
  enableRematch?: boolean;
  now?: () => number;
}

/**
 * Server-authoritative Snake & Ladder engine with multiplayer features.
 */
export class SnakeLadderEngine extends MultiplayerGameEngine<SnakeLadderState, RollAction | { type: "resign" } | { type: "draw-offer" } | { type: "draw-accept" } | { type: "draw-decline" } | { type: "pause" } | { type: "resume" }> {
  readonly gameId = "snake-ladder" as const;
  private readonly settings: Required<SnakeLadderSettings>;

  override persistenceOptions() { return { ...super.persistenceOptions(), settings: { ...this.settings } }; }

  constructor(players: EnginePlayer[], rng?: RandomSource, options?: SnakeLadderEngineOptions) {
    const turnTimer = options?.turnTimer ?? { turnDurationMs: 30000, warningThresholdMs: 5000 };
    const matchTimer = options?.matchTimer ?? { matchDurationMs: 600000, warningThresholdMs: 30000 };
    super(players, rng, {
      turnTimer,
      matchTimer,
      enableResign: options?.enableResign ?? true,
      enableDraw: options?.enableDraw ?? true,
      enablePause: options?.enablePause ?? true,
      enableRematch: options?.enableRematch ?? true,
      now: options?.now,
    });
    this.settings = {
      boardSize: options?.settings?.boardSize ?? BOARD_SIZE,
      extraTurnOnSix: options?.settings?.extraTurnOnSix ?? true,
      threeSixesCancel: options?.settings?.threeSixesCancel ?? true,
      bumpOnLanding: options?.settings?.bumpOnLanding ?? true,
    };
    if (players.length < 2) {
      throw new Error("Snake & Ladder requires at least 2 players");
    }
  }

  protected initBaseState(): Omit<SnakeLadderState, keyof import("../base/MultiplayerGameEngine").BaseState> {
    const players: SnakeLadderPlayerState[] = this.players.map((p) => ({
      seat: p.seat,
      position: 1,
      finished: false,
    }));
    return {
      phase: "waiting-for-roll",
      currentSeat: 0,
      dice: null,
      players,
      lastMove: null,
      winnerSeats: [],
      extraTurn: false,
      consecutiveSixes: 0,
      turnStartTile: null,
      logs: ["Game started! Roll dice to move."],
    };
  }

  protected validateGameAction(
    action: RollAction | { type: "resign" } | { type: "draw-offer" } | { type: "draw-accept" } | { type: "draw-decline" } | { type: "pause" } | { type: "resume" },
    seat: number,
    state: SnakeLadderState,
  ): string | null {
    if (action.type === "roll") {
      if (state.phase === "finished") {
        return "This match has already finished";
      }
      if (seat !== state.currentSeat) {
        return "It is not your turn";
      }
      return null;
    }
    return null;
  }

  protected applyGameAction(
    action: RollAction | { type: "resign" } | { type: "draw-offer" } | { type: "draw-accept" } | { type: "draw-decline" } | { type: "pause" } | { type: "resume" },
    seat: number,
    state: SnakeLadderState,
  ): EngineActionResult<SnakeLadderState> {
    if (action.type !== "roll") {
      return {
        ok: false,
        error: "Unknown action for Snake & Ladder",
        state,
        events: [],
        finished: state.finished,
        winnerSeats: state.winnerSeats,
      };
    }

    const events: EngineEvent[] = [];
    const dice = this.randomInt(1, 6);
    const isSix = dice === 6;
    const player = state.players.find((p) => p.seat === seat)!;
    const startPos = player.position;

    if (state.consecutiveSixes === 0) {
      state = { ...state, turnStartTile: startPos };
    }

    const streak = isSix ? state.consecutiveSixes + 1 : 0;
    const extraTurn = this.settings.extraTurnOnSix && isSix;
    const cancelThreeSixes = this.settings.threeSixesCancel && isSix && streak === 3;

    events.push({ type: "roll", seat, dice });

    if (cancelThreeSixes) {
      const fromPos = startPos;
      const turnStart = state.turnStartTile ?? 1;
      const updatedPlayers = state.players.map((p) =>
        p.seat === seat ? { ...p, position: turnStart } : p,
      );
      const nextSeat = (seat + 1) % this.players.length;
      const log = `${this.seatName(seat)} rolled three 6s! Turn cancelled.`;
      const nextState: SnakeLadderState = {
        ...state,
        phase: "moved",
        dice,
        players: updatedPlayers,
        lastMove: { from: fromPos, to: turnStart, via: "rollback" },
        winnerSeats: [],
        currentSeat: nextSeat,
        consecutiveSixes: 0,
        extraTurn: false,
        logs: [log, ...state.logs].slice(0, MAX_LOGS),
      };
      events.push({ type: "three-sixes", seat, from: fromPos, to: turnStart });
      return {
        ok: true,
        state: nextState,
        events,
        finished: false,
        winnerSeats: [],
      };
    }

    const rawTarget = startPos + dice;
    let moved = false;
    let via: SnakeLadderLastMove["via"] = "dice";
    let finalPos = rawTarget;

    if (rawTarget > this.settings.boardSize) {
      finalPos = startPos;
      via = "rollback";
      events.push({ type: "move-blocked", seat, from: startPos, to: startPos, dice });
    } else {
      const resolved = resolveDestination(rawTarget);
      finalPos = resolved.final;
      via = resolved.via;
      moved = true;
      events.push({ type: "move", seat, from: startPos, to: rawTarget, dice });
      if (via === "ladder") {
        events.push({ type: "ladder", seat, from: rawTarget, to: finalPos });
      } else if (via === "snake") {
        events.push({ type: "snake", seat, from: rawTarget, to: finalPos });
      }
    }

    let updatedPlayers = state.players.map((p) =>
      p.seat === seat ? { ...p, position: finalPos } : p,
    );

    if (this.settings.bumpOnLanding && moved && finalPos !== 1 && finalPos !== this.settings.boardSize) {
      const bumped = updatedPlayers.find(
        (p) => p.seat !== seat && p.position === finalPos && !p.finished,
      );
      if (bumped) {
        updatedPlayers = updatedPlayers.map((p) =>
          p.seat === bumped.seat ? { ...p, position: 1 } : p,
        );
        events.push({ type: "bump", seat, bumpedSeat: bumped.seat, from: finalPos, to: 1 });
      }
    }

    const isWinner = moved && finalPos === this.settings.boardSize;
    const winnerSeats = isWinner ? [seat] : [];
    const phase: SnakeLadderState["phase"] = isWinner ? "finished" : "moved";

    if (isWinner) {
      events.push({ type: "win", seat });
      updatedPlayers = updatedPlayers.map((p) =>
        p.seat === seat ? { ...p, position: this.settings.boardSize, finished: true } : p,
      );
    }

    const log = this.buildLog(seat, dice, startPos, finalPos, via, isWinner, streak, state.consecutiveSixes);
    const keepsTurn = rawTarget <= this.settings.boardSize ? extraTurn && !isWinner : isSix;
    const nextSeat = isWinner ? seat : keepsTurn ? seat : (seat + 1) % this.players.length;

    const nextState: SnakeLadderState = {
      ...state,
      phase,
      dice,
      players: updatedPlayers,
      lastMove: { from: startPos, to: finalPos, via },
      winnerSeats,
      currentSeat: nextSeat,
      consecutiveSixes: keepsTurn ? streak : 0,
      extraTurn: !isWinner && extraTurn,
      finished: isWinner,
      logs: [log, ...state.logs].slice(0, MAX_LOGS),
    };

    return {
      ok: true,
      state: nextState,
      events,
      finished: isWinner,
      winnerSeats,
    };
  }

  private seatName(seat: number): string {
    return `P${seat + 1}`;
  }

  private buildLog(
    seat: number,
    dice: number,
    from: number,
    to: number,
    via: SnakeLadderLastMove["via"],
    isWinner: boolean,
    streak: number,
    previousStreak: number,
  ): string {
    const name = this.seatName(seat);
    if (isWinner) return `🏆 ${name} rolled ${dice} and reached cell ${to}. Wins the match!`;
    if (via === "rollback") return `${name} rolled ${dice} but couldn't move past cell ${from}.`;
    if (via === "ladder") return `🪜 ${name} rolled ${dice} and climbed a ladder to cell ${to}!`;
    if (via === "snake") return `🐍 ${name} rolled ${dice} and got bitten down to cell ${to}.`;
    if (previousStreak === 2 && streak === 0) return `${name} rolled three consecutive sixes — streak reset!`;
    if (streak > 0) return `🎲 ${name} rolled a ${dice}! (Roll again!)`;
    return `🎲 ${name} rolled a ${dice} and moved to cell ${to}.`;
  }

  /**
   * Deterministic timeout winner resolution for Snake & Ladder:
   * 1. Player with highest current board cell position (closest to 100).
   * 2. If tied, draw across top leaders.
   */
  protected override resolveTimeoutWinner(state: SnakeLadderState): number[] {
    if (!state.players || state.players.length === 0) return [state.currentSeat];
    let maxPos = -1;
    let leaders: number[] = [];
    for (const p of state.players) {
      if (p.position > maxPos) {
        maxPos = p.position;
        leaders = [p.seat];
      } else if (p.position === maxPos) {
        leaders.push(p.seat);
      }
    }
    return leaders.length > 0 ? leaders : [0];
  }
}

export type SnakeLadderAction = RollAction | { type: "resign" } | { type: "draw-offer" } | { type: "draw-accept" } | { type: "draw-decline" } | { type: "pause" } | { type: "resume" };

export function isSnakeLadderState(state: JsonObject): state is SnakeLadderState {
  return state.phase !== undefined && Array.isArray(state.players);
}
