/**
 * LudoRuleEngine — pure TypeScript, zero Phaser dependency.
 * Implements complete Ludo game logic.
 * All methods are deterministic given a LudoGameState.
 */

import type {
  LudoGameState,
  Player,
  PlayerColor,
  Token,
  TokenMove,
  LudoSettings,
} from "../types/ludo.types";
import {
  SAFE_TILES,
  START_POSITION,
  HOME_COLUMN_ENTRY,
  HOME_COL_BASE,
  HOME_FINISHED_POSITION,
  PLAYER_COLORS_ORDER,
} from "../data/boardLayout";

export class LudoRuleEngine {
  private settings: LudoSettings;
  constructor(settings: LudoSettings) {
    this.settings = settings;
  }

  // ─── State factory ──────────────────────────────────────────────────────────

  createInitialState(playerCount: 2 | 4 = 4): LudoGameState {
    const activeColors: PlayerColor[] =
      playerCount === 2 ? ["green", "blue"] : ["green", "yellow", "blue", "red"];

    const players: Player[] = activeColors.map((color, idx) => ({
      id: idx,
      color,
      name: idx === 0 ? "Player 1" : `Player ${idx + 1}`,
      isAI: idx !== 0,
      difficulty: this.settings.aiDifficulty,
      tokensDone: 0,
      tokens: Array.from({ length: 4 }, (_, ti): Token => ({
        id: `${color}-${ti}`,
        color,
        index: ti,
        position: -1,
        state: "yard",
      })),
    }));

    return {
      players,
      activePlayers: activeColors,
      currentPlayerIndex: 0,
      dice: 0,
      consecutiveSixes: 0,
      phase: "rolling",
      winner: null,
      turnCount: 0,
    };
  }

  // ─── Core rule: legal moves ─────────────────────────────────────────────────

  getLegalMoves(state: LudoGameState, dice: number): TokenMove[] {
    const player = this.currentPlayer(state);
    const moves: TokenMove[] = [];

    for (const token of player.tokens) {
      if (token.state === "finished") continue;

      // Yard → need a 6 to enter
      if (token.state === "yard") {
        if (dice === 6) {
          const startPos = START_POSITION[token.color];
          const isBlocked = this.isBlockedByFriendlyStack(state, startPos, token.color);
          if (!isBlocked) {
            moves.push(this.buildMove(state, token, -1, startPos, true));
          }
        }
        continue;
      }

      // Active token
      const { newPos, isHomeCol } = this.calcNewPosition(token, dice);

      if (newPos === null) continue; // overshoots home

      // Check if blocked by a friendly stack of 2+ (blockade)
      if (!isHomeCol && this.isBlockedByFriendlyStack(state, newPos, token.color)) continue;

      const move = this.buildMove(state, token, token.position, newPos, false);
      moves.push(move);
    }

    return moves;
  }

  // ─── Apply a chosen move ────────────────────────────────────────────────────

  applyMove(state: LudoGameState, move: TokenMove): LudoGameState {
    const next = this.deepClone(state);
    const player = next.players[next.currentPlayerIndex];
    if (!player) return next;

    const token = player.tokens.find((t) => t.id === move.token.id);
    if (!token) return next;

    // Capture
    if (move.isCapture && move.capturedToken) {
      this.sendToYard(next, move.capturedToken);
    }

    // Update token position
    token.position = move.toPosition;
    token.state    = move.isFinish ? "finished" : "active";

    if (move.isFinish) {
      player.tokensDone = player.tokens.filter((t) => t.state === "finished").length;
    }

    // Check win
    if (player.tokensDone === 4) {
      next.winner = player.color;
      next.phase  = "over";
      return next;
    }

    // Extra turn on 6 (unless three-sixes rule applies)
    const extraTurn = state.dice === 6;
    if (extraTurn && !(this.settings.allowThreeSixRule && next.consecutiveSixes >= 3)) {
      next.phase = "rolling";
      next.consecutiveSixes = state.consecutiveSixes + 1;
      return next;
    }

    // Advance turn
    next.consecutiveSixes = 0;
    next.currentPlayerIndex = this.nextPlayerIndex(next);
    next.phase = "rolling";
    next.turnCount++;

    return next;
  }

  // ─── Turn advancement ───────────────────────────────────────────────────────

  advanceTurnNoMove(state: LudoGameState): LudoGameState {
    const next = this.deepClone(state);
    next.consecutiveSixes = 0;
    next.currentPlayerIndex = this.nextPlayerIndex(next);
    next.phase = "rolling";
    next.turnCount++;
    return next;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  currentPlayer(state: LudoGameState): Player {
    return state.players[state.currentPlayerIndex]!;
  }

  isGameOver(state: LudoGameState): boolean {
    return state.phase === "over" || state.winner !== null;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private calcNewPosition(
    token: Token,
    dice: number
  ): { newPos: number | null; isHomeCol: boolean } {
    const homeEntry  = HOME_COLUMN_ENTRY[token.color];
    const homeBase   = HOME_COL_BASE[token.color];

    // Token on home column
    if (token.position >= homeBase) {
      const step    = token.position - homeBase; // 0–5
      const newStep = step + dice;
      if (newStep > HOME_FINISHED_POSITION) return { newPos: null, isHomeCol: true };
      return { newPos: homeBase + newStep, isHomeCol: true };
    }

    // Token on main path
    const mainPos = token.position;
    // Remaining steps before reaching home column entry
    const stepsToEntry = (homeEntry - mainPos + 52) % 52;

    if (dice <= stepsToEntry) {
      // Still on main path
      const newPos = (mainPos + dice) % 52;
      return { newPos, isHomeCol: false };
    } else {
      // Enters home column
      const stepsIntoHome = dice - stepsToEntry;
      if (stepsIntoHome > HOME_FINISHED_POSITION + 1) return { newPos: null, isHomeCol: true };
      const newPos = homeBase + (stepsIntoHome - 1);
      return { newPos, isHomeCol: true };
    }
  }

  private buildMove(
    state: LudoGameState,
    token: Token,
    from: number,
    to: number,
    isEnter: boolean
  ): TokenMove {
    const homeBase = HOME_COL_BASE[token.color];
    const isHomeCol = to >= homeBase;

    const isSafe   = !isHomeCol && SAFE_TILES.has(to);
    const isFinish = to === homeBase + HOME_FINISHED_POSITION;

    // Check capture
    let capturedToken: Token | undefined;
    let isCapture = false;
    if (!isHomeCol && !isSafe) {
      const victim = this.findOpponentTokenAt(state, to, token.color);
      if (victim) {
        // Can only capture single tokens; a stack of 2+ is a blockade
        const count = this.countFriendlyAtTile(state, to, victim.color);
        if (count === 1) {
          capturedToken = victim;
          isCapture = true;
        }
      }
    }

    return { token, fromPosition: from, toPosition: to, isEnter, isCapture, capturedToken, isFinish, isSafe };
  }

  private findOpponentTokenAt(state: LudoGameState, pos: number, ownColor: PlayerColor): Token | undefined {
    for (const player of state.players) {
      if (player.color === ownColor) continue;
      for (const t of player.tokens) {
        if (t.state === "active" && t.position === pos) return t;
      }
    }
    return undefined;
  }

  private countFriendlyAtTile(state: LudoGameState, pos: number, color: PlayerColor): number {
    const player = state.players.find((p) => p.color === color);
    if (!player) return 0;
    return player.tokens.filter((t) => t.state === "active" && t.position === pos).length;
  }

  private isBlockedByFriendlyStack(state: LudoGameState, pos: number, ownColor: PlayerColor): boolean {
    if (!this.settings.allowStacking) {
      // Stacking disabled: can't land on own token either
      const player = state.players.find((p) => p.color === ownColor);
      if (!player) return false;
      return player.tokens.some((t) => t.state === "active" && t.position === pos);
    }
    // Blockades (2+ enemy tokens) do NOT apply on safe tiles. Safe tiles are shared.
    if (SAFE_TILES.has(pos)) return false;

    // Blockade: 2+ enemy tokens on same tile
    for (const player of state.players) {
      if (player.color === ownColor) continue;
      const count = player.tokens.filter((t) => t.state === "active" && t.position === pos).length;
      if (count >= 2) return true;
    }
    return false;
  }

  private sendToYard(state: LudoGameState, captured: Token): void {
    for (const player of state.players) {
      const token = player.tokens.find((t) => t.id === captured.id);
      if (token) {
        token.position = -1;
        token.state    = "yard";
      }
    }
  }

  private nextPlayerIndex(state: LudoGameState): number {
    const total = state.activePlayers.length;
    let next    = (state.currentPlayerIndex + 1) % total;
    // Skip finished players (all tokens home)
    let safety  = 0;
    while (safety < total) {
      const p = state.players[next];
      if (p && p.tokensDone < 4) return next;
      next = (next + 1) % total;
      safety++;
    }
    return (state.currentPlayerIndex + 1) % total;
  }

  /**
   * Build the animation path for a token moving `dice` steps.
   * Returns an array of global position numbers to visit in order.
   */
  buildMovePath(token: Token, dice: number): number[] {
    const path: number[] = [];
    const homeEntry = HOME_COLUMN_ENTRY[token.color];
    const homeBase  = HOME_COL_BASE[token.color];

    if (token.state === "yard") {
      path.push(START_POSITION[token.color]);
      return path;
    }

    let pos = token.position;
    for (let step = 0; step < dice; step++) {
      if (pos >= homeBase) {
        // In home column
        pos++;
        if (pos - homeBase > HOME_FINISHED_POSITION) break;
      } else {
        // On main path
        if (pos === homeEntry) {
          pos = homeBase;
        } else {
          pos = (pos + 1) % 52;
        }
      }
      path.push(pos);
    }
    return path;
  }

  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj)) as T;
  }

  /** Expose for tests */
  get safeSet(): Set<number> { return SAFE_TILES; }
}

export default LudoRuleEngine;

/** Used by PLAYER_COLORS_ORDER for turn cycling */
export { PLAYER_COLORS_ORDER };
