import Phaser from "phaser";
import type { LudoGameState, TokenMove, PlayerColor, GameMode } from "../types/ludo.types";
import { LudoEvents } from "../events/LudoEvents";
import type BoardManager from "./BoardManager";
import type TokenManager from "./TokenManager";
import type DiceManager from "./DiceManager";
import type HUDManager from "./HUDManager";
import type FeedbackText from "../ui/FeedbackText";
import type MovePathOverlay from "../ui/MovePathOverlay";
import { LudoRuleEngine } from "../engine/LudoRuleEngine";
import { LudoAI } from "../ai/LudoAI";
import { mainPathPixel, homeColPixel, HOME_COL_BASE } from "../data/boardLayout";

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
  private feedback: FeedbackText | null;
  private pathOverlay: MovePathOverlay | null;
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
    ai: LudoAI,
    feedback: FeedbackText | null = null,
    pathOverlay: MovePathOverlay | null = null,
  ) {
    this.scene = scene;
    this.board = board;
    this.tokenManager = tokenManager;
    this.dice = dice;
    this.hud = hud;
    this.feedback = feedback;
    this.pathOverlay = pathOverlay;
    this.ruleEngine = ruleEngine;
    this.ai = ai;
  }

  init(mode: GameMode = "ai", playerCount: 2 | 4 = 4): void {
    this.mode = mode;
    this.isProcessingMove = false;
    this.history = [];

    this.state = this.ruleEngine.createInitialState(playerCount);

    this.state.players.forEach((player, idx) => {
      player.isAI = mode === "ai" && idx !== 0;
    });

    if (this.pathOverlay) {
      this.tokenManager.setPathOverlay(this.pathOverlay, (tokenId: string) => {
        const move = this.legalMoves.find((m) => m.token.id === tokenId);
        if (!move) return [];
        return this.ruleEngine.buildMovePath(move.token, this.state.dice);
      });
    }

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

    // Update token counts for all players
    this.state.players.forEach((p, idx) => {
      const activeCount = p.tokens.filter((t) => t.state !== "finished").length;
      this.hud.updateTokenCount(idx, activeCount);
    });

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

    // Dice feedback
    const isPortrait = this.scene.scale.height > this.scene.scale.width;
    const diceFeedbackX = isPortrait ? 182 : 1080;
    const diceFeedbackY = isPortrait ? 900 : 195;

    if (this.feedback) {
      this.feedback.diceResult(value, diceFeedbackX, diceFeedbackY);
    }

    // Extra turn feedback for rolling 6
    if (value === 6 && this.feedback) {
      this.feedback.extraTurn(diceFeedbackX, diceFeedbackY + 40);
    }

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
      const uniqueDestinations = new Set(this.legalMoves.map((m) => `${m.fromPosition}->${m.toPosition}`));
      if (uniqueDestinations.size === 1 && this.legalMoves[0]) {
        const autoMove = this.legalMoves[0];
        this.addLog("Auto-moving token...");
        this.scene.time.delayedCall(400, () => {
          this.executeMove(autoMove);
        });
        return;
      }

      this.dice.setSelectMode();
      const ids = this.legalMoves.map((m) => m.token.id);
      this.tokenManager.highlightClickable(ids);
      this.hud.showSelectionBanner("TAP A HIGHLIGHTED TOKEN TO MOVE!");
    }
  }

  private onTokenSelected(tokenId: string): void {
    if (this.isProcessingMove || this.state.winner) return;

    const player = this.ruleEngine.currentPlayer(this.state);
    if (player.isAI) return;

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

    // Token entry feedback
    if (move.isEnter && this.feedback) {
      const pos = this.getTokenPixel(player.color, 0);
      this.feedback.entered(pos.x, pos.y);
    }

    this.tokenManager.moveAlongPath(move.token.id, path, player.color, () => {
      if (move.isCapture && move.capturedToken) {
        this.addLog(`Captured ${move.capturedToken.color.toUpperCase()} token!`);
        this.scene.events.emit(LudoEvents.TOKEN_CAPTURED);

        // Capture feedback
        if (this.feedback) {
          const pos = this.getTokenPixel(move.capturedToken.color, move.capturedToken.position);
          this.feedback.capture(pos.x, pos.y);
        }

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
    if (move.isFinish) {
      this.addLog(`Token reached Home!`);
      this.scene.events.emit(LudoEvents.TOKEN_FINISHED);

      // Home entry animation + feedback
      this.tokenManager.animateHomeEntry(move.token.id);
      if (this.feedback) {
        const player = this.ruleEngine.currentPlayer(this.state);
        const pos = this.getTokenPixel(player.color, 57);
        this.feedback.home(pos.x, pos.y);
      }
    } else if (move.isSafe) {
      this.scene.events.emit(LudoEvents.TOKEN_SAFE);
      if (this.feedback) {
        const player = this.ruleEngine.currentPlayer(this.state);
        const pos = this.getTokenPixel(player.color, move.toPosition);
        this.feedback.safe(pos.x, pos.y);
      }
    }

    this.state = this.ruleEngine.applyMove(this.state, move);

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

    this.addLog(`${name} WINS THE GAME!`);
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

  /** Get pixel position for feedback text. */
  private getTokenPixel(color: PlayerColor, position: number): { x: number; y: number } {
    const homeBase = HOME_COL_BASE[color];
    if (position >= homeBase) {
      return homeColPixel(color, position - homeBase);
    }
    if (position < 0) return { x: 400, y: 400 };
    return mainPathPixel(position);
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

export { GameManager };
