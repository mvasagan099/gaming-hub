import Phaser from "phaser";
import { gameConfig } from "./config";

let game: Phaser.Game | null = null;

export interface GameSessionOptions {
  mode?: "ai" | "pvp";
  players?: number;
  /** 0-based seat of the local player (null for spectators / AI). */
  seat?: number | null;
  /** Per-seat display names (used in multiplayer). */
  names?: string[];
}

export function createGame(options: GameSessionOptions = {}) {
  if (!game) {
    game = new Phaser.Game(gameConfig);
  }

  game.registry.set("mode", options.mode ?? "ai");
  game.registry.set("players", options.players ?? 2);
  game.registry.set("seat", options.seat ?? null);
  game.registry.set("names", options.names ?? []);

  return game;
}

export function destroyGame() {
  if (game) {
    game.destroy(true);
    game = null;
  }
}
