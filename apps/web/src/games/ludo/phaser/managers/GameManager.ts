import Phaser from "phaser";
import type { LudoGameState, TokenMove, Token, Player, GameMode, AIDifficulty } from "../types/ludo.types";
import { LudoEvents } from "../events/LudoEvents";
import type BoardManager from "./BoardManager";
import type TokenManager from "./TokenManager";
import type DiceManager from "./DiceManager";
import type HUDManager from "./HUDManager";
import { LudoRuleEngine } from "../engine/LudoRuleEngine";
import { LudoAI } from "../ai/LudoAI";

export interface LudoHistoryEntry {
  playerName: string;
  rolled: number;
  message: string;
}

export default class GameManager {
  private scene: Phaser.Scene;
  private board: BoardManager;
  private tokenManager: TokenManager;
  private dice: DiceManager;
  private hud: HUDManager;
  private ruleEngine: LudoRuleEngine;
  private ai: LudoAI;

  private state!: LudoGameState;
  private legalMoves: TokenMove[] = [];
  private history: LudoHistoryEntry[] = [];
  private mode: GameMode = "ai";
  private isProcessingMove = false;

  constructor(
    scene: Phaser.Scene,
    board: BoardManager,
    tokenManager: TokenManager,
    dice: DiceManager,
    hud: HUDManager,
    ruleEngine: LudoRuleEngine,
    ai: LudoAI
  ) {
    this.scene = scene;
    this.board = board;
    this.tokenManager = tokenManager;
    this.dice = dice;
    this.hud = hud;
    this.ruleEngine = ruleEngine;
    this.ai = ai;
  }

  init(mode: GameMode = "ai", playerCount: 2 | 4 = 4): void {
    this.mode = mode;
    this.isProcessingMove = false;
    this.history = [];

    // Create starting state
    this.state = this.ruleEngine.createInitialState(playerCount);

    // Set AI properties
    this.state.players.forEach((player, idx) => {
      player.isAI = mode === "ai" && idx !== 0;
    });

    // Wire up events
    this.scene.events.off(LudoEvents.DICE_ROLLED);
    this.scene.events.off(LudoEvents.TOKEN_SELECTED);

    this.scene.events.on(LudoEvents.DICE_ROLLED, this.onDiceRolled, this);
    this.scene.events.on(LudoEvents.TOKEN_SELECTED, this.onTokenSelected, this);

    this.startTurn();
  }

  private startTurn(): void {
    if (this.state.winner) return;

    this.isProcessingMove = false;
    const player = this.ruleEngine.currentPlayer(this.state);

    this.hud.updateTurn(this.state.currentPlayerIndex);

    if (player.isAI) {
      this.dice.setWaiting(`${player.name} (AI)`);
      this.scene.time.delayedCall(1200, () => {
        if (!this.state.winner) {
          this.dice.rollForAI();
        }
      });
    } else {
      this.dice.enable();
    }
  }

  private onDiceRolled(value: number): void {
    if (this.state.winner) return;

    this.state.dice = value;
    const player = this.ruleEngine.currentPlayer(this.state);

    this.addLog(`${player.name} rolled a ${value}`);

    // Compute legal moves
    this.legalMoves = this.ruleEngine.getLegalMoves(this.state, value);

    if (this.legalMoves.length === 0) {
      this.addLog("No moves available!");
      this.scene.time.delayedCall(1000, () => {
        this.state = this.ruleEngine.advanceTurnNoMove(this.state);
        this.startTurn();
      });
      return;
    }

    if (player.isAI) {
      this.scene.time.delayedCall(800, () => {
        const move = this.ai.chooseMove(this.state, this.legalMoves, player.difficulty);
        if (move) {
          this.executeMove(move);
        } else {
          this.state = this.ruleEngine.advanceTurnNoMove(this.state);
          this.startTurn();
        }
      });
    } else {
      // Check if all legal moves lead to the exact same outcome (e.g. 1 move or yard entry)
      const uniqueDestinations = new Set(this.legalMoves.map((m) => `${m.fromPosition}->${m.toPosition}`));
      if (uniqueDestinations.size === 1 && this.legalMoves[0]) {
        const autoMove = this.legalMoves[0];
        this.addLog("Auto-moving token...");
        this.scene.time.delayedCall(400, () => {
          this.executeMove(autoMove);
        });
        return;
      }

      // Multiple choices: human selects token
      this.dice.setSelectMode();
      const ids = this.legalMoves.map((m) => m.token.id);
      this.tokenManager.highlightClickable(ids);
      this.hud.showSelectionBanner("👇 TAP A HIGHLIGHTED TOKEN TO MOVE!");
    }
  }

  private onTokenSelected(tokenId: string): void {
    if (this.isProcessingMove || this.state.winner) return;

    const player = this.ruleEngine.currentPlayer(this.state);
    if (player.isAI) return; // Ignore human click during AI turn

    const move = this.legalMoves.find((m) => m.token.id === tokenId);
    if (!move) return;

    this.hud.hideSelectionBanner();
    this.tokenManager.clearAllGlows();
    this.executeMove(move);
  }

  private executeMove(move: TokenMove): void {
    this.isProcessingMove = true;
    this.dice.disable();

    const player = this.ruleEngine.currentPlayer(this.state);
    const path = this.ruleEngine.buildMovePath(move.token, this.state.dice);

    // Visual move animation
    this.tokenManager.moveAlongPath(move.token.id, path, player.color, () => {
      // Capture check
      if (move.isCapture && move.capturedToken) {
        this.addLog(`⚔️ Captured ${move.capturedToken.color.toUpperCase()} token!`);
        this.scene.events.emit(LudoEvents.TOKEN_CAPTURED);

        this.tokenManager.sendToYard(
          move.capturedToken.id,
          move.capturedToken.color,
          move.capturedToken.index,
          () => this.completeMove(move)
        );
      } else {
        this.completeMove(move);
      }
    });
  }

  private completeMove(move: TokenMove): void {
    // Landed event sound trigger
    if (move.isFinish) {
      this.addLog(`🎉 Token reached Home!`);
      this.scene.events.emit(LudoEvents.TOKEN_FINISHED);
    } else if (move.isSafe) {
      this.scene.events.emit(LudoEvents.TOKEN_SAFE);
    }

    // Apply model updates
    this.state = this.ruleEngine.applyMove(this.state, move);

    // Sync views
    this.state.players.forEach((p) => {
      p.tokens.forEach((t) => this.tokenManager.syncToken(t));
    });

    if (this.state.winner) {
      this.triggerWin(this.state.winner);
      return;
    }

    this.startTurn();
  }

  private triggerWin(winnerColor: string): void {
    const winnerPlayer = this.state.players.find((p) => p.color === winnerColor);
    const name = winnerPlayer ? winnerPlayer.name : winnerColor.toUpperCase();

    this.addLog(`🏆 ${name} WINS THE GAME!`);
    this.tokenManager.celebrateWinner(winnerColor as any);

    this.scene.events.emit(LudoEvents.GAME_OVER, {
      winner: winnerColor,
      playerName: name,
    });
  }

  private addLog(message: string): void {
    const player = this.ruleEngine.currentPlayer(this.state);
    this.history.push({
      playerName: player.name,
      rolled: this.state.dice,
      message,
    });
    this.hud.addLog(message);
  }

  getState(): LudoGameState {
    return this.state;
  }

  getHistory(): LudoHistoryEntry[] {
    return this.history;
  }

  reset(playerCount: 2 | 4 = 4): void {
    this.init(this.mode, playerCount);
  }
}
