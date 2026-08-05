import Phaser from "phaser";

export default class AnimationManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Tween a game object to (x, y) with optional ease */
  tweenTo(
    target: Phaser.GameObjects.GameObject,
    x: number,
    y: number,
    duration = 160,
    ease = "Sine.InOut"
  ): Promise<void> {
    return new Promise((resolve) => {
      this.scene.tweens.add({ targets: target, x, y, duration, ease, onComplete: () => resolve() });
    });
  }

  /** Bounce scale pulse on a target */
  bouncePulse(target: Phaser.GameObjects.GameObject, scale = 1.3, duration = 180): Promise<void> {
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: target,
        scale,
        duration,
        ease: "Back.Out",
        yoyo: true,
        onComplete: () => resolve(),
      });
    });
  }

  /** Shake target horizontally (for snake hit) */
  shake(target: Phaser.GameObjects.GameObject, distance = 8, count = 4): Promise<void> {
    return new Promise((resolve) => {
      let i = 0;
      const origin = (target as Phaser.GameObjects.Container).x;
      const tick = () => {
        if (i >= count * 2) {
          (target as Phaser.GameObjects.Container).x = origin;
          resolve();
          return;
        }
        this.scene.tweens.add({
          targets: target,
          x: origin + (i % 2 === 0 ? distance : -distance),
          duration: 60,
          ease: "Linear",
          onComplete: () => { i++; tick(); },
        });
      };
      tick();
    });
  }

  /** Glow flash: alpha flicker (for ladder climb) */
  glow(target: Phaser.GameObjects.GameObject, times = 3): Promise<void> {
    return new Promise((resolve) => {
      let i = 0;
      const tick = () => {
        if (i >= times * 2) { resolve(); return; }
        this.scene.tweens.add({
          targets: target,
          alpha: i % 2 === 0 ? 0.4 : 1,
          duration: 100,
          ease: "Linear",
          onComplete: () => { i++; tick(); },
        });
      };
      tick();
    });
  }

  /** Pop-in animation for UI elements */
  popIn(target: Phaser.GameObjects.GameObject, delay = 0): Promise<void> {
    return new Promise((resolve) => {
      (target as Phaser.GameObjects.Container).setScale(0);
      this.scene.tweens.add({
        targets: target,
        scale: 1,
        duration: 350,
        delay,
        ease: "Back.Out",
        onComplete: () => resolve(),
      });
    });
  }
}

export { AnimationManager };
