import Phaser from "phaser";
import type { FruitType, FruitDef } from "../types/fruit.types";
import { FRUIT_DEFS } from "../types/fruit.types";
import { FruitEvents } from "../events/FruitEvents";
import type ParticleManager from "./ParticleManager";
import { FRUIT_NINJA_VISUAL_CONFIG } from "../constants/fruitNinjaVisualConfig";

export interface ActiveFruit {
  id: string;
  type: FruitType;
  sprite: Phaser.Physics.Arcade.Sprite;
  def: FruitDef;
  sliced: boolean;
  spawnTime: number;
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
   * Spawns a random fruit or bomb and launches it upward in a natural parabolic arc.
   */
  spawnFruit(velocityMultiplier = 1): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;

    const types: FruitType[] = ["watermelon", "apple", "orange", "banana", "coconut", "kiwi"];
    let type: FruitType = types[Math.floor(Math.random() * types.length)]!;

    // Spawn bomb probability in classic mode
    const rand = Math.random();
    if (this.mode === "classic" && rand < 0.16) {
      type = "bomb";
    }

    const def = FRUIT_DEFS[type];
    const x = Phaser.Math.Between(80, w - 80);
    const y = h + 45;

    // Create interactive physics sprite
    const sprite = this.fruitsGroup.create(x, y, `fn-${type}`) as Phaser.Physics.Arcade.Sprite;
    sprite.setCircle(def.radius, (140 - def.radius * 2) / 2, (140 - def.radius * 2) / 2);
    sprite.setDepth(20);

    // Parabolic trajectory calculations
    const targetX = w / 2 + Phaser.Math.Between(-180, 180);
    const gravity = FRUIT_NINJA_VISUAL_CONFIG.gravity;
    const flightTime = FRUIT_NINJA_VISUAL_CONFIG.baseFlightTime / velocityMultiplier;

    const vx = (targetX - x) / flightTime;
    const vy = (-gravity * (flightTime * 0.5) - Phaser.Math.Between(30, 90)) * velocityMultiplier;

    sprite.setVelocity(vx, vy);
    sprite.setAngularVelocity(Phaser.Math.Between(
      FRUIT_NINJA_VISUAL_CONFIG.minAngularVelocity,
      FRUIT_NINJA_VISUAL_CONFIG.maxAngularVelocity
    ));

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

  /**
   * Splits a fruit in two separate falling halves with physical outward impulses
   * perpendicular to the slice cut line.
   */
  splitFruit(id: string, sliceAngle = 0): void {
    const item = this.activeFruits.get(id);
    if (!item || item.sliced) return;

    const { x, y } = item.sprite;
    const type = item.type;
    const currentAngle = item.sprite.angle;

    item.sliced = true;
    const velocity = item.sprite.body?.velocity || { x: 0, y: 0 };

    // Disable and hide original whole fruit
    item.sprite.disableBody(true, true);
    this.activeFruits.delete(id);

    if (type === "bomb") {
      this.particles.bombExplosion(x, y);
      this.scene.events.emit(FruitEvents.BOMB_EXPLODED, x, y);
      return;
    }

    this.scene.events.emit(FruitEvents.FRUIT_SLICED, item.def);

    // Spawn multi-layer juice and mist particles
    this.particles.fruitJuice(x, y, item.def.color, item.def.mistColor);

    // Compute outward perpendicular impulse vector
    const perpAngle = sliceAngle + Math.PI / 2;
    const impulse = FRUIT_NINJA_VISUAL_CONFIG.splitImpulseX;
    const impX = Math.cos(perpAngle) * impulse;
    const impY = Math.sin(perpAngle) * impulse * 0.5;

    // Spawn left half with rotation and impulse
    const leftHalf = this.halvesGroup.create(x, y, `fn-${type}-left`) as Phaser.Physics.Arcade.Sprite;
    leftHalf.setAngle(currentAngle);
    leftHalf.setVelocity(velocity.x - Math.abs(impX) - 40, velocity.y + impY + 20);
    leftHalf.setAngularVelocity(-FRUIT_NINJA_VISUAL_CONFIG.splitAngularSpeed);
    leftHalf.setDepth(15);

    // Spawn right half with rotation and impulse
    const rightHalf = this.halvesGroup.create(x, y, `fn-${type}-right`) as Phaser.Physics.Arcade.Sprite;
    rightHalf.setAngle(currentAngle);
    rightHalf.setVelocity(velocity.x + Math.abs(impX) + 40, velocity.y - impY + 20);
    rightHalf.setAngularVelocity(FRUIT_NINJA_VISUAL_CONFIG.splitAngularSpeed);
    rightHalf.setDepth(15);

    // Fade out and destroy halves smoothly
    this.scene.tweens.add({
      targets: [leftHalf, rightHalf],
      alpha: 0,
      delay: 550,
      duration: 350,
      ease: "Sine.In",
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

      // Clean up fallen fruits past screen bottom
      if (y > h + 100) {
        item.sprite.destroy();
        this.activeFruits.delete(id);

        // Missed normal fruit in classic mode incurs life lost
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
