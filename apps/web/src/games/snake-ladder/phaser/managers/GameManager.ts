import Phaser from "phaser";
import type BoardManager from "./BoardManager";
import type PlayerManager from "./PlayerManager";
import type DiceManager from "./DiceManager";
import type { SnakeManager } from "./SnakeManager";
import type { LadderManager } from "./LadderManager";
import type { HUDManager } from "./HUDManager";
import { GameEvents } from "../events/GameEvents";

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
    hud: HUDManager
  ) {
    this.scene = scene;
    this.board = board;
    this.players = players;
    this.dice = dice;
    this.snakeManager = snakeManager;
    this.ladderManager = ladderManager;
    this.hud = hud;
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
    this.dice.setBias('normal');
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
        
        // Return player to start of turn
        this.players.snapToTile(player.id, startTile, () => {
          const entry: MoveHistoryEntry = {
            playerName: player.name,
            rolled: value,
            from: player.tile,
            to: startTile,
            event: "no-move",
          };
          this.moveHistory.push(entry);
          this.scene.time.delayedCall(800, () => this.changeTurn(false));
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
      const entry: MoveHistoryEntry = {
        playerName: player.name,
        rolled: value,
        from: fromTile,
        to: fromTile,
        event: "no-move",
      };
      this.moveHistory.push(entry);
      this.scene.time.delayedCall(800, () => this.changeTurn(value === 6));
      return;
    }

    this.dice.disable();
    this.hud.addLog(`${player.name} rolled a ${value}!`);

    // Move token tile-by-tile to the rolled position
    this.players.movePlayer(this.currentPlayer, value, () => {
      // After tile-by-tile movement: check snakes and ladders
      this.resolveSpecialTile(player.id, fromTile, targetTile, value);
    });
  }

  private resolveSpecialTile(
    playerId: number,
    fromTile: number,
    landedTile: number,
    rolled: number
  ): void {
    const player = this.players.getPlayer(playerId);
    if (!player) return;

    let finalTile = landedTile;
    let event: "normal" | "snake" | "ladder" = "normal";

    // Resolve snakes and ladders first — a ladder can carry a token onto tile
    // 100, which must count as a win (e.g. ladder 80 → 100).
    if (this.snakeManager.hasSnake(landedTile)) {
      finalTile = this.snakeManager.getTail(landedTile) ?? landedTile;
      event = "snake";
      this.hud.addLog(`🐍 ${player.name} got bitten! Slides to ${finalTile}`);
      this.moveHistory.push({ playerName: player.name, rolled, from: fromTile, to: finalTile, event: "snake" });
      this.scene.events.emit(GameEvents.SNAKE_HIT, playerId, landedTile, finalTile);
    } else if (this.ladderManager.hasLadder(landedTile)) {
      finalTile = this.ladderManager.getTop(landedTile) ?? landedTile;
      event = "ladder";
      this.hud.addLog(`🪜 ${player.name} climbs ladder to ${finalTile}!`);
      this.moveHistory.push({ playerName: player.name, rolled, from: fromTile, to: finalTile, event: "ladder" });
      this.scene.events.emit(GameEvents.LADDER_CLIMB, playerId, landedTile, finalTile);
    } else {
      this.moveHistory.push({ playerName: player.name, rolled, from: fromTile, to: landedTile, event: "normal" });
      this.hud.updatePlayerTile(playerId, landedTile);
    }

    const finish = () => {
      if (finalTile === 100) {
        this.triggerWin(player.name);
        return;
      }
      if (rolled === 6) this.hud.addLog(`${player.name} gets an extra turn!`);
      this.handleBump(playerId, finalTile, () => {
        const delay = event === "normal" ? 200 : 300;
        this.scene.time.delayedCall(delay, () => this.changeTurn(rolled === 6));
      });
    };

    if (event === "snake" || event === "ladder") {
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
        this.hud.addLog(`⚔️ Player ${actingPlayerId} bumped ${bumpedPlayer.name} back to start!`);
        // We can emit an event here for particles/audio later
        this.players.snapToTile(bumpedPlayer.id, 1, () => {
           onComplete();
        });
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
      // Cycle to next player
      this.currentPlayer = (this.currentPlayer % this.totalPlayers) + 1;
      this.consecutiveSixes = 0;
    }

    this.scene.events.emit(GameEvents.TURN_CHANGED, this.currentPlayer);
    this.hud.updateTurn(this.currentPlayer);

    // Bias check: if current player is > 20 tiles behind the leader, give them a high roll bias
    const allPlayers = this.players.getPlayers();
    const maxTile = Math.max(...allPlayers.map(p => p.tile));
    const currPlayerTile = allPlayers.find(p => p.id === this.currentPlayer)?.tile ?? 1;
    if (maxTile - currPlayerTile >= 20) {
       this.dice.setBias('high');
    } else {
       this.dice.setBias('normal');
    }

    // If AI mode and current player is player 2 → trigger AI turn
    if (this.mode === "ai" && this.currentPlayer === 2) {
      this.dice.setWaiting("AI");
      this.scene.time.delayedCall(1200, () => {
        if (!this.gameOver) this.dice.rollForAI();   // ← bypasses enabled guard
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
