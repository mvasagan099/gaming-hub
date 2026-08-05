import { ServerGameEngine } from "../base/ServerGameEngine";
import type { EngineActionResult, EngineEvent, EnginePlayer, RandomSource } from "../types";
import {
  HOME_COL_BASE,
  HOME_COLUMN_ENTRY,
  HOME_FINISHED_POSITION,
  SAFE_TILES,
  START_POSITION,
  colorsForPlayerCount,
} from "./board";
import type {
  LudoAction,
  LudoColor,
  LudoLastMove,
  LudoPlayerState,
  LudoServerState,
  LudoTokenView,
} from "./types";

const MAX_LOGS = 8;

interface LudoSettings {
  allowThreeSixRule: boolean;
  allowStacking: boolean;
}

interface LudoMove {
  token: LudoTokenView;
  fromPosition: number;
  toPosition: number;
  isEnter: boolean;
  isCapture: boolean;
  capturedTokenId: string | null;
  isFinish: boolean;
  isSafe: boolean;
}

/**
 * Server-authoritative Ludo engine.
 *
 * Rules mirror the rendered Phaser client (`apps/web/src/games/ludo`):
 * - Roll a 6 to bring a token out of the yard onto its start tile.
 * - A token must land exactly on the final home step to finish.
 * - Landing on a single enemy token (non-safe tile) captures it back to the
 *   yard. Safe tiles and home columns can never be captured.
 * - A friendly/enemy stack of 2+ forms a blockade (safe tiles excepted).
 * - Rolling a 6 grants an extra turn; three consecutive 6s forfeit the turn.
 * - The first player to finish all 4 tokens wins.
 *
 * Protocol: the current seat sends `{ type: "roll" }`, then `{ type: "move",
 * tokenId }` when multiple tokens can move (the engine auto-applies when only
 * one move is possible).
 */
export class LudoEngine extends ServerGameEngine<LudoServerState, LudoAction> {
  readonly gameId = "ludo" as const;
  private readonly settings: LudoSettings;

  constructor(players: EnginePlayer[], rng?: RandomSource, settings: Partial<LudoSettings> = {}) {
    super(players, rng);
    if (players.length < 2) {
      throw new Error("Ludo requires at least 2 players");
    }
    this.settings = {
      allowThreeSixRule: settings.allowThreeSixRule ?? true,
      allowStacking: settings.allowStacking ?? true,
    };
  }

  protected initState(): LudoServerState {
    const colors = colorsForPlayerCount(this.players.length);
    const players: LudoPlayerState[] = this.players.map((p, index) => {
      const color = colors[index] ?? colors[0];
      return {
        seat: p.seat,
        color,
        name: `Player ${p.seat + 1}`,
        tokensDone: 0,
        tokens: Array.from({ length: 4 }, (_, ti): LudoTokenView => ({
          id: `${color}-${ti}`,
          color,
          index: ti,
          position: -1,
          state: "yard",
        })),
      };
    });
    return {
      players,
      currentSeat: 0,
      dice: null,
      consecutiveSixes: 0,
      phase: "rolling",
      winnerSeats: [],
      finished: false,
      turnCount: 0,
      legalMoves: [],
      lastMove: null,
      logs: ["Game started! Roll a 6 to enter a token."],
    };
  }

  protected validateAction(action: LudoAction, seat: number): string | null {
    const state = this.state;
    if (state.phase === "finished") {
      return "This match has already finished";
    }
    if (seat !== state.currentSeat) {
      return "It is not your turn";
    }
    if (action.type === "roll") {
      if (state.phase !== "rolling") {
        return "You have already rolled";
      }
      return null;
    }
    if (action.type === "move") {
      if (state.phase !== "selecting") {
        return "There is no pending token selection";
      }
      if (state.dice == null) {
        return "Roll the dice first";
      }
      if (!state.legalMoves.includes(action.tokenId)) {
        return "That token cannot move";
      }
      return null;
    }
    return "Unknown action for Ludo";
  }

  protected applyValidatedAction(
    action: LudoAction,
    seat: number,
    state: LudoServerState,
  ): EngineActionResult<LudoServerState> {
    if (action.type === "roll") {
      return this.applyRoll(state, seat);
    }
    return this.applyMoveChoice(state, seat, action.tokenId);
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  private applyRoll(state: LudoServerState, seat: number): EngineActionResult<LudoServerState> {
    const events: EngineEvent[] = [];
    const dice = this.randomInt(1, 6);
    events.push({ type: "roll", seat, dice });

    const streak = dice === 6 ? state.consecutiveSixes + 1 : 0;

    // Three consecutive 6s forfeit the turn.
    if (this.settings.allowThreeSixRule && streak >= 3) {
      const nextSeat = this.nextPlayerIndex(state);
      const nextState: LudoServerState = {
        ...state,
        dice,
        phase: "rolling",
        currentSeat: nextSeat,
        consecutiveSixes: 0,
        turnCount: state.turnCount + 1,
        legalMoves: [],
        logs: this.log(state, `${this.seatName(seat)} rolled three 6s! Turn forfeited.`),
      };
      events.push({ type: "three-sixes", seat });
      return { ok: true, state: nextState, events, finished: false, winnerSeats: [] };
    }

    const moves = this.legalMovesFor(state, seat, dice);

    if (moves.length === 0) {
      const nextSeat = this.nextPlayerIndex(state);
      const nextState: LudoServerState = {
        ...state,
        dice,
        phase: "rolling",
        currentSeat: nextSeat,
        consecutiveSixes: 0,
        turnCount: state.turnCount + 1,
        legalMoves: [],
        logs: this.log(state, `${this.seatName(seat)} rolled ${dice} but has no moves.`),
      };
      events.push({ type: "no-move", seat });
      return { ok: true, state: nextState, events, finished: false, winnerSeats: [] };
    }

    if (moves.length === 1) {
      return this.applyChosenMove(state, streak, moves[0]!, events);
    }

    const nextState: LudoServerState = {
      ...state,
      dice,
      phase: "selecting",
      consecutiveSixes: streak,
      legalMoves: moves.map((m) => m.token.id),
      logs: this.log(state, `${this.seatName(seat)} rolled ${dice}. Choose a token.`),
    };
    return { ok: true, state: nextState, events, finished: false, winnerSeats: [] };
  }

  private applyMoveChoice(
    state: LudoServerState,
    seat: number,
    tokenId: string,
  ): EngineActionResult<LudoServerState> {
    const events: EngineEvent[] = [];
    const moves = this.legalMovesFor(state, seat, state.dice ?? 0);
    const move = moves.find((m) => m.token.id === tokenId);
    if (!move) {
      return {
        ok: false,
        error: "That token cannot move",
        state,
        events,
        finished: false,
        winnerSeats: [],
      };
    }
    return this.applyChosenMove(state, state.consecutiveSixes, move, events);
  }

  private applyChosenMove(
    state: LudoServerState,
    streak: number,
    move: LudoMove,
    events: EngineEvent[],
  ): EngineActionResult<LudoServerState> {
    const next = structuredClone(state);
    const player = this.playerByColor(next, move.token.color);
    const token = player.tokens.find((t) => t.id === move.token.id);
    if (!token) {
      return { ok: false, error: "Token not found", state, events, finished: false, winnerSeats: [] };
    }

    if (move.isCapture && move.capturedTokenId) {
      const victim = this.findToken(next, move.capturedTokenId);
      if (victim) {
        victim.position = -1;
        victim.state = "yard";
      }
    }

    token.position = move.toPosition;
    token.state = move.isFinish ? "finished" : "active";
    player.tokensDone = player.tokens.filter((t) => t.state === "finished").length;

    const dice = next.dice ?? 0;
    events.push({
      type: "move",
      seat: player.seat,
      tokenId: token.id,
      color: token.color,
      from: move.fromPosition,
      to: move.toPosition,
      dice,
      isEnter: move.isEnter,
      isFinish: move.isFinish,
      isCapture: move.isCapture,
      isSafe: move.isSafe,
    });
    if (move.isCapture) {
      events.push({ type: "capture", seat: player.seat, tokenId: token.id, capturedTokenId: move.capturedTokenId });
    }
    if (move.isFinish) {
      events.push({ type: "token-finished", seat: player.seat, tokenId: token.id });
    }

    const lastMove: LudoLastMove = {
      tokenId: token.id,
      from: move.fromPosition,
      to: move.toPosition,
      isEnter: move.isEnter,
      isCapture: move.isCapture,
      capturedTokenId: move.capturedTokenId,
      isFinish: move.isFinish,
    };

    if (player.tokensDone === 4) {
      const nextState: LudoServerState = {
        ...next,
        phase: "finished",
        winnerSeats: [player.seat],
        finished: true,
        legalMoves: [],
        lastMove,
        logs: this.log(state, `🏆 ${this.seatName(player.seat)} finished all 4 tokens and wins!`),
      };
      events.push({ type: "win", seat: player.seat });
      return { ok: true, state: nextState, events, finished: true, winnerSeats: [player.seat] };
    }

    if (dice === 6) {
      const nextState: LudoServerState = {
        ...next,
        phase: "rolling",
        consecutiveSixes: streak,
        legalMoves: [],
        lastMove,
        logs: this.log(
          state,
          `${this.seatName(player.seat)} moved a token. Rolled a 6 — extra turn!`,
        ),
      };
      return { ok: true, state: nextState, events, finished: false, winnerSeats: [] };
    }

    const nextSeat = this.nextPlayerIndex(next);
    const nextState: LudoServerState = {
      ...next,
      phase: "rolling",
      currentSeat: nextSeat,
      consecutiveSixes: 0,
      turnCount: next.turnCount + 1,
      legalMoves: [],
      lastMove,
      logs: this.log(state, `${this.seatName(player.seat)} moved a token to ${move.toPosition}.`),
    };
    return { ok: true, state: nextState, events, finished: false, winnerSeats: [] };
  }

  // ─── Rules ─────────────────────────────────────────────────────────────────

  private legalMovesFor(state: LudoServerState, seat: number, dice: number): LudoMove[] {
    const player = this.playerBySeat(state, seat);
    const moves: LudoMove[] = [];

    for (const token of player.tokens) {
      if (token.state === "finished") continue;

      if (token.state === "yard") {
        if (dice === 6) {
          const startPos = START_POSITION[token.color];
          if (!this.isBlockedByFriendlyStack(state, startPos, token.color)) {
            moves.push(this.buildMove(state, token, -1, startPos, true));
          }
        }
        continue;
      }

      const { newPos, isHomeCol } = this.calcNewPosition(token, dice);
      if (newPos === null) continue;
      if (!isHomeCol && this.isBlockedByFriendlyStack(state, newPos, token.color)) continue;
      moves.push(this.buildMove(state, token, token.position, newPos, false));
    }

    return moves;
  }

  private calcNewPosition(
    token: LudoTokenView,
    dice: number,
  ): { newPos: number | null; isHomeCol: boolean } {
    const homeEntry = HOME_COLUMN_ENTRY[token.color];
    const homeBase = HOME_COL_BASE[token.color];

    if (token.position >= homeBase) {
      const step = token.position - homeBase;
      const newStep = step + dice;
      if (newStep > HOME_FINISHED_POSITION) return { newPos: null, isHomeCol: true };
      return { newPos: homeBase + newStep, isHomeCol: true };
    }

    const mainPos = token.position;
    const stepsToEntry = (homeEntry - mainPos + 52) % 52;

    if (dice <= stepsToEntry) {
      const newPos = (mainPos + dice) % 52;
      return { newPos, isHomeCol: false };
    }

    const stepsIntoHome = dice - stepsToEntry;
    if (stepsIntoHome > HOME_FINISHED_POSITION + 1) return { newPos: null, isHomeCol: true };
    return { newPos: homeBase + (stepsIntoHome - 1), isHomeCol: true };
  }

  private buildMove(
    state: LudoServerState,
    token: LudoTokenView,
    from: number,
    to: number,
    isEnter: boolean,
  ): LudoMove {
    const homeBase = HOME_COL_BASE[token.color];
    const isHomeCol = to >= homeBase;

    const isSafe = !isHomeCol && SAFE_TILES.has(to);
    const isFinish = to === homeBase + HOME_FINISHED_POSITION;

    let capturedTokenId: string | null = null;
    let isCapture = false;
    if (!isHomeCol && !isSafe) {
      const victim = this.findOpponentTokenAt(state, to, token.color);
      if (victim && this.countFriendlyAtTile(state, to, victim.color) === 1) {
        capturedTokenId = victim.id;
        isCapture = true;
      }
    }

    return {
      token,
      fromPosition: from,
      toPosition: to,
      isEnter,
      isCapture,
      capturedTokenId,
      isFinish,
      isSafe,
    };
  }

  private findOpponentTokenAt(
    state: LudoServerState,
    pos: number,
    ownColor: LudoColor,
  ): LudoTokenView | undefined {
    for (const player of state.players) {
      if (player.color === ownColor) continue;
      for (const t of player.tokens) {
        if (t.state === "active" && t.position === pos) return t;
      }
    }
    return undefined;
  }

  private countFriendlyAtTile(state: LudoServerState, pos: number, color: LudoColor): number {
    const player = state.players.find((p) => p.color === color);
    if (!player) return 0;
    return player.tokens.filter((t) => t.state === "active" && t.position === pos).length;
  }

  private isBlockedByFriendlyStack(
    state: LudoServerState,
    pos: number,
    ownColor: LudoColor,
  ): boolean {
    if (!this.settings.allowStacking) {
      const player = state.players.find((p) => p.color === ownColor);
      if (!player) return false;
      return player.tokens.some((t) => t.state === "active" && t.position === pos);
    }
    if (SAFE_TILES.has(pos)) return false;

    for (const player of state.players) {
      if (player.color === ownColor) continue;
      const count = player.tokens.filter((t) => t.state === "active" && t.position === pos).length;
      if (count >= 2) return true;
    }
    return false;
  }

  private nextPlayerIndex(state: LudoServerState): number {
    const total = state.players.length;
    let next = (state.currentSeat + 1) % total;
    let safety = 0;
    while (safety < total) {
      const p = state.players[next];
      if (p && p.tokensDone < 4) return next;
      next = (next + 1) % total;
      safety++;
    }
    return (state.currentSeat + 1) % total;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private playerBySeat(state: LudoServerState, seat: number): LudoPlayerState {
    const player = state.players.find((p) => p.seat === seat);
    if (!player) throw new Error(`Player for seat ${seat} not found`);
    return player;
  }

  private playerByColor(state: LudoServerState, color: LudoColor): LudoPlayerState {
    const player = state.players.find((p) => p.color === color);
    if (!player) throw new Error(`Player for color ${color} not found`);
    return player;
  }

  private findToken(state: LudoServerState, id: string): LudoTokenView | undefined {
    for (const player of state.players) {
      const token = player.tokens.find((t) => t.id === id);
      if (token) return token;
    }
    return undefined;
  }

  private seatName(seat: number): string {
    return `Player ${seat + 1}`;
  }

  private log(state: LudoServerState, message: string): string[] {
    return [message, ...state.logs].slice(0, MAX_LOGS);
  }
}
