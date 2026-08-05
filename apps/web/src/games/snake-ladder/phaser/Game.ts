import Phaser from "phaser";
import { gameConfig } from "./config";

let game: Phaser.Game | null = null;

export function createGame() {
  if (!game) {
    game = new Phaser.Game(gameConfig);
  }

  return game;
}

export function destroyGame() {
  if (game) {
    game.destroy(true);
    game = null;
  }
}
