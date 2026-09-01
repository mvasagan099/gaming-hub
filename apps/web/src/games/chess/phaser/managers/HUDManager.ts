import Phaser from "phaser";
import type { PieceType } from "../types/chess.types";

export default class HUDManager {
  private scene: Phaser.Scene;
  private currentStatus = "WHITE TO MOVE";
  private currentCaptures: { w: PieceType[]; b: PieceType[] } = { w: [], b: [] };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(): void {
    // In-scene HUD hook
  }

  updateStatus(status: string): void {
    this.currentStatus = status;
    this.scene.events.emit("chess:hud-status", status);
  }

  updateCaptures(captured: { w: PieceType[]; b: PieceType[] }): void {
    this.currentCaptures = captured;
    this.scene.events.emit("chess:hud-captures", captured);
  }

  getStatus(): string {
    return this.currentStatus;
  }

  getCaptures(): { w: PieceType[]; b: PieceType[] } {
    return this.currentCaptures;
  }
}
