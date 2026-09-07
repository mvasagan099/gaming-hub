import Phaser from "phaser";
import type BoardManager from "./BoardManager";
import type PlayerManager from "./PlayerManager";
import type DiceManager from "./DiceManager";
import type { SnakeManager } from "./SnakeManager";
import type { LadderManager } from "./LadderManager";
import type { HUDManager } from "./HUDManager";
import type FeedbackText from "../ui/FeedbackText";
import { GameEvents } from "../events/GameEvents";
import { ANIM, animDuration, prefersReducedMotion } from "../constants";

export interface MoveHistoryEntry {
  playerName: string;
  rolled: number;
  from: number;
  to: number;
  event: "normal" | "snake" | "ladder" | "no-move";
}

export type GameMode = "ai" | "pvp";

export default class GameManager {
  private scene: Phaser.Scene;
  private board: BoardManager;
  private players: PlayerManager;
  private dice: DiceManager;
  private snakeManager: SnakeManager;
  private ladderManager: LadderManager;
  private hud: HUDManager;
  private feedback: FeedbackText;

  private currentPlayer = 1;
  private totalPlayers = 2;
  private gameOver = false;
  private mode: GameMode = "ai";
  private moveHistory: MoveHistoryEntry[] = [];
  private consecutiveSixes = 0;
  private turnStartTile: Map<number, number> = new Map();

  constructor(
    scene: Phaser.Scene,
    board: BoardManager,
    players: PlayerManager,
    dice: DiceManager,
    snakeManager: SnakeManager,
    ladderManager: LadderManager,
    hud: HUDManager,
    feedback: FeedbackText,
  ) {
    this.scene = scene;
    this.board = board;
    this.players = players;
    this.dice = dice;
    this.snakeManager = snakeManager;
    this.ladderManager = ladderManager;
    this.hud = hud;
    this.feedback = feedback;
  }

  init(mode: GameMode = "ai", totalPlayers = 2): void {
    this.mode = mode;
    this.totalPlayers = totalPlayers;
    this.currentPlayer = 1;
    this.gameOver = false;
    this.moveHistory = [];
    this.consecutiveSixes = 0;
    this.turnStartTile.clear();

    this.scene.events.on(GameEvents.DICE_ROLLED, this.onDiceRolled, this);
    this.hud.updateTurn(this.currentPlayer);
    this.players.setActivePlayer(this.currentPlayer);
    this.dice.setBias("normal");
    this.dice.enable();
  }

  private onDiceRolled(value: number): void {
    if (this.gameOver) return;

    const player = this.players.getPlayer(this.currentPlayer);
    if (!player) return;

    if (this.consecutiveSixes === 0) {
      this.turnStartTile.set(this.currentPlayer, player.tile);
    }

    if (value === 6) {
      this.consecutiveSixes++;
      if (this.consecutiveSixes === 3) {
        this.hud.addLog(`${player.name} rolled three 6s! Turn cancelled.`);
        const startTile = this.turnStartTile.get(this.currentPlayer) ?? 1;

        this.players.snapToTile(player.id, startTile, () => {
          const entry: MoveHistoryEntry = {
            playerName: player.name,
            rolled: value,
            from: player.tile,
            to: startTile,
            event: "no-move",
          };
          this.moveHistory.push(entry);
          this.scene.time.delayedCall(animDuration(800), () => this.changeTurn(false));
        });
        return;
      }
    } else {
      this.consecutiveSixes = 0;
    }

    const fromTile = player.tile;
    let targetTile = fromTile + value;

    // Cannot overshoot tile 100
    if (targetTile > 100) {
      targetTile = fromTile;
      this.hud.addLog(`${player.name} needs ${100 - fromTile} to finish!`);
      const pos = this.board.getTilePosition(fromTile);
      this.feedback.overshoot(pos.x, pos.y);

      const entry: MoveHistoryEntry = {
        playerName: player.name,
        rolled: value,
        from: fromTile,
        to: fromTile,
        event: "no-move",
      };
      this.moveHistory.push(entry);
      this.scene.time.delayedCall(animDuration(800), () => this.changeTurn(value === 6));
      return;
    }

    this.dice.disable();
    this.hud.addLog(`${player.name} rolled a ${value}!`);

    // Move token tile-by-tile
    this.players.movePlayer(this.currentPlayer, value, () => {
      this.resolveSpecialTile(player.id, fromTile, targetTile, value);
    });
  }

  private resolveSpecialTile(
    playerId: number,
    fromTile: number,
    landedTile: number,
    rolled: number,
  ): void {
    const player = this.players.getPlayer(playerId);
    if (!player) return;

    let finalTile = landedTile;
    let event: "normal" | "snake" | "ladder" = "normal";
    const reduced = prefersReducedMotion();

    if (this.snakeManager.hasSnake(landedTile)) {
      finalTile = this.snakeManager.getTail(landedTile) ?? landedTile;
      event = "snake";
      this.hud.addLog(`🐍 ${player.name} got bitten! Slides to ${finalTile}`);
      this.moveHistory.push({ playerName: player.name, rolled, from: fromTile, to: finalTile, event: "snake" });
      this.scene.events.emit(GameEvents.SNAKE_HIT, playerId, landedTile, finalTile);

      // Highlight snake, trigger bite reaction, and show feedback
      const headPos = this.board.getTilePosition(landedTile);
      this.feedback.snakeHit(headPos.x, headPos.y);
      this.snakeManager.triggerSnakeReaction(landedTile, this.scene);

    } else if (this.ladderManager.hasLadder(landedTile)) {
      finalTile = this.ladderManager.getTop(landedTile) ?? landedTile;
      event = "ladder";
      this.hud.addLog(`🪜 ${player.name} climbs ladder to ${finalTile}!`);
      this.moveHistory.push({ playerName: player.name, rolled, from: fromTile, to: finalTile, event: "ladder" });
      this.scene.events.emit(GameEvents.LADDER_CLIMB, playerId, landedTile, finalTile);

      // Highlight ladder and show feedback
      const botPos = this.board.getTilePosition(landedTile);
      this.feedback.ladderClimb(botPos.x, botPos.y);
      this.ladderManager.highlightLadder(landedTile, this.scene);

    } else {
      this.moveHistory.push({ playerName: player.name, rolled, from: fromTile, to: landedTile, event: "normal" });
      this.hud.updatePlayerTile(playerId, landedTile);
    }

    const finish = () => {
      // Unhighlight any snake/ladder
      this.snakeManager.animateHighlightOut(this.scene);
      this.ladderManager.unhighlightAll(this.scene);

      if (finalTile === 100) {
        this.triggerWin(player.name);
        return;
      }
      if (rolled === 6) {
        this.hud.addLog(`${player.name} gets an extra turn!`);
        const tilePos = this.board.getTilePosition(finalTile);
        this.feedback.extraTurn(tilePos.x, tilePos.y - 20);
      }
      this.handleBump(playerId, finalTile, () => {
        const delay = event === "normal" ? animDuration(200) : animDuration(400);
        this.scene.time.delayedCall(delay, () => this.changeTurn(rolled === 6));
      });
    };

    if (event === "snake" || event === "ladder") {
      // Use path-following animation for snake, direct slide for ladder
      if (event === "snake" && !reduced) {
        const path = this.snakeManager.getSnakePath(landedTile, this.board);
        if (path.length > 0) {
          this.scene.time.delayedCall(animDuration(ANIM.snakePause), () => {
            this.players.animateAlongPath(playerId, path, finish);
          });
          return;
        }
      }
      if (event === "ladder" && !reduced) {
        const path = this.ladderManager.getLadderPath(landedTile, this.board);
        if (path.length > 0) {
          this.scene.time.delayedCall(animDuration(ANIM.ladderPause), () => {
            this.players.animateAlongPath(playerId, path, finish);
          });
          return;
        }
      }
      // Fallback: direct snap
      this.players.snapToTile(playerId, finalTile, finish);
    } else {
      finish();
    }
  }

  private handleBump(actingPlayerId: number, tile: number, onComplete: () => void): void {
    if (tile === 1 || tile === 100) {
      onComplete();
      return;
    }

    const allPlayers = this.players.getPlayers();
    const bumpedPlayer = allPlayers.find(p => p.id !== actingPlayerId && p.tile === tile);

    if (bumpedPlayer) {
      this.hud.addLog(`⚔️ ${bumpedPlayer.name} bumped back to start!`);
      this.players.snapToTile(bumpedPlayer.id, 1, onComplete);
    } else {
      onComplete();
    }
  }

  private triggerWin(playerName: string): void {
    this.gameOver = true;
    this.dice.disable();
    this.scene.events.emit(GameEvents.GAME_OVER, {
      name: playerName,
      history: this.moveHistory,
    });
  }

  private changeTurn(rolledSix = false): void {
    if (this.gameOver) return;

    if (!rolledSix) {
      this.currentPlayer = (this.currentPlayer % this.totalPlayers) + 1;
      this.consecutiveSixes = 0;
    }

    this.scene.events.emit(GameEvents.TURN_CHANGED, this.currentPlayer);
    this.hud.updateTurn(this.currentPlayer);
    this.players.setActivePlayer(this.currentPlayer);

    // Bias check
    const allPlayers = this.players.getPlayers();
    const maxTile = Math.max(...allPlayers.map(p => p.tile));
    const currPlayerTile = allPlayers.find(p => p.id === this.currentPlayer)?.tile ?? 1;
    if (maxTile - currPlayerTile >= 20) {
      this.dice.setBias("high");
    } else {
      this.dice.setBias("normal");
    }

    // AI auto-roll
    if (this.mode === "ai" && this.currentPlayer === 2) {
      this.dice.setWaiting("AI");
      this.scene.time.delayedCall(animDuration(1200), () => {
        if (!this.gameOver) this.dice.rollForAI();
      });
    } else {
      this.dice.unlock();
    }
  }

  getCurrentPlayer(): number {
    return this.currentPlayer;
  }

  getMode(): GameMode {
    return this.mode;
  }

  getMoveHistory(): MoveHistoryEntry[] {
    return [...this.moveHistory];
  }

  isGameOver(): boolean {
    return this.gameOver;
  }

  reset(): void {
    this.currentPlayer = 1;
    this.gameOver = false;
    this.moveHistory = [];
    this.consecutiveSixes = 0;
    this.turnStartTile.clear();
    this.players.reset();
    this.dice.reset();
    this.hud.updateTurn(1);
  }
}

export { GameManager };
