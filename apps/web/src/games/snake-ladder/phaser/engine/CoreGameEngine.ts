import Phaser from "phaser";
import { GameState } from "../models/GameState";
import type { PlayerModel, SerializableState } from "../models/GameState";
import { BoardManager } from "../managers/BoardManager";
import { snakeMap } from "../../data/snakes";
import { ladderMap } from "../../data/ladders";

export class CoreGameEngine {
  private scene: Phaser.Scene;
  private boardManager: BoardManager;

  public currentState: GameState = GameState.INITIALIZE;
  public currentPlayerIdx = 0;
  public players: PlayerModel[] = [];
  public playerSprites: Phaser.GameObjects.Arc[] = [];
  public currentDiceValue = 1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.boardManager = new BoardManager(scene);
    this.initPlayers();
  }

  private initPlayers() {
    this.players = [
      { id: 1, name: "Player 1", position: 1, finished: false, color: 0xef4444, avatar: "🔴" },
      { id: 2, name: "Player 2", position: 1, finished: false, color: 0x10b981, avatar: "🟢" },
    ];
  }

  setupScene() {
    this.boardManager.drawBoard();
    this.spawnTokens();
    this.drawOverlays();
    this.currentState = GameState.WAIT_FOR_ROLL;
  }

  private spawnTokens() {
    const p1Pos = this.boardManager.getTilePosition(1);
    const p1 = this.scene.add.circle(p1Pos.x - 10, p1Pos.y, 14, this.players[0].color);
    p1.setStrokeStyle(2, 0xffffff);

    const p2 = this.scene.add.circle(p1Pos.x + 10, p1Pos.y, 14, this.players[1].color);
    p2.setStrokeStyle(2, 0xffffff);

    this.playerSprites = [p1, p2];
  }

  private drawOverlays() {
    snakeMap.forEach((to, from) => {
      const pos = this.boardManager.getTilePosition(from);
      this.scene.add.text(pos.x, pos.y - 14, "🐍", { fontSize: "16px" }).setOrigin(0.5);
    });

    ladderMap.forEach((to, from) => {
      const pos = this.boardManager.getTilePosition(from);
      this.scene.add.text(pos.x, pos.y - 14, "🪜", { fontSize: "16px" }).setOrigin(0.5);
    });
  }

  handleRollDice(onComplete: (diceVal: number) => void) {
    if (this.currentState !== GameState.WAIT_FOR_ROLL) return;

    this.currentState = GameState.ROLLING_DICE;
    const finalVal = Math.floor(Math.random() * 6) + 1;
    this.currentDiceValue = finalVal;

    this.scene.events.emit("diceRolled", finalVal);
    this.animatePlayerMove(finalVal, onComplete);
  }

  private animatePlayerMove(diceVal: number, onComplete: (diceVal: number) => void) {
    this.currentState = GameState.MOVING_PLAYER;

    const player = this.players[this.currentPlayerIdx];
    const sprite = this.playerSprites[this.currentPlayerIdx];

    let startPos = player.position;
    let targetPos = startPos + diceVal;
    if (targetPos > 100) targetPos = startPos;

    // Step-by-step animation queue
    const steps: number[] = [];
    for (let pos = startPos + 1; pos <= targetPos; pos++) {
      steps.push(pos);
    }

    if (steps.length === 0) {
      this.checkSnakesAndLadders(targetPos, onComplete);
      return;
    }

    let stepIdx = 0;
    const moveNextStep = () => {
      if (stepIdx >= steps.length) {
        player.position = targetPos;
        this.checkSnakesAndLadders(targetPos, onComplete);
        return;
      }

      const nextTile = steps[stepIdx];
      const targetVec = this.boardManager.getTilePosition(nextTile);
      const offsetX = this.currentPlayerIdx === 0 ? -10 : 10;

      this.scene.tweens.add({
        targets: sprite,
        x: targetVec.x + offsetX,
        y: targetVec.y,
        duration: 180,
        ease: "Linear",
        onComplete: () => {
          stepIdx++;
          moveNextStep();
        },
      });
    };

    moveNextStep();
  }

  private checkSnakesAndLadders(tile: number, onComplete: (diceVal: number) => void) {
    this.currentState = GameState.CHECK_SNAKE_LADDER;
    const player = this.players[this.currentPlayerIdx];
    const sprite = this.playerSprites[this.currentPlayerIdx];

    let finalTile = tile;
    if (snakeMap.has(tile)) {
      finalTile = snakeMap.get(tile)!;
    } else if (ladderMap.has(tile)) {
      finalTile = ladderMap.get(tile)!;
    }

    if (finalTile !== tile) {
      const vec = this.boardManager.getTilePosition(finalTile);
      const offsetX = this.currentPlayerIdx === 0 ? -10 : 10;

      this.scene.tweens.add({
        targets: sprite,
        x: vec.x + offsetX,
        y: vec.y,
        duration: 400,
        ease: "Power2",
        onComplete: () => {
          player.position = finalTile;
          this.checkWin(onComplete);
        },
      });
    } else {
      player.position = finalTile;
      this.checkWin(onComplete);
    }
  }

  private checkWin(onComplete: (diceVal: number) => void) {
    this.currentState = GameState.CHECK_WIN;
    const player = this.players[this.currentPlayerIdx];

    if (player.position === 100) {
      player.finished = true;
      this.currentState = GameState.GAME_OVER;
      this.scene.events.emit("gameOver", this.currentPlayerIdx);
      onComplete(this.currentDiceValue);
      return;
    }

    this.currentState = GameState.NEXT_PLAYER;
    this.currentPlayerIdx = (this.currentPlayerIdx + 1) % this.players.length;
    this.currentState = GameState.WAIT_FOR_ROLL;
    onComplete(this.currentDiceValue);
  }

  serializeState(): SerializableState {
    return {
      state: this.currentState,
      currentPlayerIdx: this.currentPlayerIdx,
      players: this.players.map((p) => ({ id: p.id, position: p.position, finished: p.finished })),
      dice: this.currentDiceValue,
    };
  }
}
