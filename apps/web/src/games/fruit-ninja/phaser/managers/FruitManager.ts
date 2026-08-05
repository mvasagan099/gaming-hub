import Phaser from "phaser";
import type { FruitType, FruitDef } from "../types/fruit.types";
import { FRUIT_DEFS } from "../types/fruit.types";
import { FruitEvents } from "../events/FruitEvents";
import type ParticleManager from "./ParticleManager";

export interface ActiveFruit {
  id: string;
  type: FruitType;
  sprite: Phaser.Physics.Arcade.Sprite;
  def: FruitDef;
  sliced: boolean;
  spawnTime: number;
  frozen?: boolean;
}

export class FruitManager {
  private scene: Phaser.Scene;
  private particles: ParticleManager;
  private fruitsGroup!: Phaser.Physics.Arcade.Group;
  private halvesGroup!: Phaser.Physics.Arcade.Group;
  private activeFruits = new Map<string, ActiveFruit>();
  private idCounter = 0;
  private mode: string;

  constructor(scene: Phaser.Scene, particles: ParticleManager, mode: string) {
    this.scene = scene;
    this.particles = particles;
    this.mode = mode;
  }

  create(): void {
    this.fruitsGroup = this.scene.physics.add.group();
    this.halvesGroup = this.scene.physics.add.group();
  }

  /**
   * Spawns a random fruit or bomb and launches it upward.
   */
  spawnFruit(velocityMultiplier = 1): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;

    const types: FruitType[] = ["watermelon", "apple", "orange", "banana", "coconut", "kiwi"];
    let type: FruitType = types[Math.floor(Math.random() * types.length)]!;
    
    // Spawn probabilities
    const rand = Math.random();
    if (this.mode === "classic" && rand < 0.15) {
      type = "bomb";
    }

    const def = FRUIT_DEFS[type];
    const x   = Phaser.Math.Between(100, w - 100);
    const y   = h + 40;

    // Create interactive physics sprite
    const sprite = this.fruitsGroup.create(x, y, `fn-${type}`) as Phaser.Physics.Arcade.Sprite;
    sprite.setCircle(def.radius, (120 - def.radius * 2) / 2, (120 - def.radius * 2) / 2);
    sprite.setDepth(20);

    // Apply launch velocities
    const targetX   = w / 2 + Phaser.Math.Between(-150, 150);
    const gravity   = 350; // pixels per second squared
    const flightTime = 1.6 / velocityMultiplier;  // time decreases as diff goes up
    
    const vx = (targetX - x) / flightTime;
    const vy = (-gravity * (flightTime * 0.5) - Phaser.Math.Between(20, 80)) * velocityMultiplier;

    sprite.setVelocity(vx, vy);
    sprite.setAngularVelocity(Phaser.Math.Between(-160, 160)); // spin

    const id = `fruit-${this.idCounter++}`;
    sprite.setData("id", id);

    this.activeFruits.set(id, {
      id,
      type,
      sprite,
      def,
      sliced: false,
      spawnTime: this.scene.time.now,
    });
  }

  // ─── Slicing split physics ──────────────────────────────────────────────────

  /** Splits a fruit in two separate falling halves */
  splitFruit(id: string): void {
    const item = this.activeFruits.get(id);
    if (!item || item.sliced) return;

    const { x, y } = item.sprite;
    const type = item.type;

    item.sliced = true;
    const velocity = item.sprite.body?.velocity || { x: 0, y: 0 };

    // Stop and hide original
    item.sprite.disableBody(true, true);
    this.activeFruits.delete(id);

    if (type === "bomb") {
      this.particles.bombExplosion(x, y);
      this.scene.events.emit(FruitEvents.BOMB_EXPLODED, x, y);
      return;
    }

    this.scene.events.emit(FruitEvents.FRUIT_SLICED, item.def);

    // Spawn juice burst particles
    this.particles.fruitJuice(x, y, item.def.color);

    // Spawn left half
    const leftHalf = this.halvesGroup.create(x, y, `fn-${type}-left`) as Phaser.Physics.Arcade.Sprite;
    leftHalf.setVelocity(velocity.x - 120, velocity.y + 40);
    leftHalf.setAngularVelocity(-220);
    leftHalf.setDepth(10);

    // Spawn right half
    const rightHalf = this.halvesGroup.create(x, y, `fn-${type}-right`) as Phaser.Physics.Arcade.Sprite;
    rightHalf.setVelocity(velocity.x + 120, velocity.y + 40);
    rightHalf.setAngularVelocity(220);
    rightHalf.setDepth(10);

    // Fade out and destroy halves
    this.scene.tweens.add({
      targets:    [leftHalf, rightHalf],
      alpha:      0,
      delay:      600,
      duration:   400,
      onComplete: () => {
        leftHalf.destroy();
        rightHalf.destroy();
      },
    });
  }

  // ─── Boundaries update check ───────────────────────────────────────────────

  update(): void {
    const h = this.scene.scale.height;

    // Check falling active fruits
    for (const [id, item] of this.activeFruits.entries()) {
      const y = item.sprite.y;

      // Clean up fallen fruits
      if (y > h + 100) {
        item.sprite.destroy();
        this.activeFruits.delete(id);

        // If missed normal fruit, lose life
        if (item.type !== "bomb" && this.mode === "classic") {
          this.scene.events.emit(FruitEvents.LIFE_LOST);
        }
      }
    }
  }

  clearAll(): void {
    for (const item of this.activeFruits.values()) {
      item.sprite.destroy();
    }
    this.activeFruits.clear();
    this.fruitsGroup.clear(true, true);
    this.halvesGroup.clear(true, true);
  }

  getActiveFruitsList(): ActiveFruit[] {
    return Array.from(this.activeFruits.values());
  }
}

export default FruitManager;
