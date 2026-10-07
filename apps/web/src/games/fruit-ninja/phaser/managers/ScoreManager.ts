import Phaser from "phaser";
import type { FruitNinjaPlayer } from "@gaming-hub/game-engine";
import type { FruitDef, FruitStats } from "../types/fruit.types";
import { FRUIT_NINJA_VISUAL_CONFIG } from "../constants/fruitNinjaVisualConfig";

export class ScoreManager {
  private scene: Phaser.Scene;
  private score = 0;
  private comboCount = 0;
  private longestCombo = 0;
  private slicedCount = 0;
  private bombsHit = 0;
  private missedCount = 0;
  private lastSliceTime = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  registerSlice(def: FruitDef): { score: number; combo: number; isCombo: boolean } {
    const now = this.scene.time.now;
    this.score += def.points;
    this.slicedCount++;

    let isCombo = false;
    if (now - this.lastSliceTime < FRUIT_NINJA_VISUAL_CONFIG.combos.windowMs) {
      this.comboCount++;
      if (this.comboCount >= 3) {
        isCombo = true;
      }
    } else {
      this.comboCount = 1;
    }

    if (this.comboCount > this.longestCombo) {
      this.longestCombo = this.comboCount;
    }

    this.lastSliceTime = now;
    return { score: this.score, combo: this.comboCount, isCombo };
  }

  addPoints(points: number): void {
    this.score += points;
  }

  registerMiss(): void {
    this.missedCount++;
    this.comboCount = 0;
  }

  registerBomb(): void {
    this.bombsHit++;
    this.comboCount = 0;
  }

  getScore(): number {
    return this.score;
  }

  getComboCount(): number {
    return this.comboCount;
  }

  getLongestCombo(): number {
    return this.longestCombo;
  }

  getStats(): FruitStats {
    return {
      score: this.score,
      slicedCount: this.slicedCount,
      combosCount: this.longestCombo,
      bombsHit: this.bombsHit,
      missedCount: this.missedCount,
    };
  }

  applyAuthoritativePlayer(player: FruitNinjaPlayer): void {
    this.score = player.score;
    this.comboCount = player.combos;
    this.longestCombo = player.longestCombo;
    this.slicedCount = player.slicedCount ?? 0;
    this.bombsHit = player.bombsHit ?? 0;
    this.missedCount = player.missedCount ?? 0;
  }

  reset(): void {
    this.score = 0;
    this.comboCount = 0;
    this.longestCombo = 0;
    this.slicedCount = 0;
    this.bombsHit = 0;
    this.missedCount = 0;
    this.lastSliceTime = 0;
  }
}

export default ScoreManager;
