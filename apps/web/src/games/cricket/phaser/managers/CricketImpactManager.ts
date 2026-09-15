import Phaser from 'phaser';

/** Presentation only: match clocks, inputs and ball simulation never pause. */
export class CricketImpactManager {
  private scene: Phaser.Scene;
  private frozen: { actor: Phaser.GameObjects.Sprite; alpha: number; ghost: Phaser.GameObjects.Sprite }[] = [];
  private release?: Phaser.Time.TimerEvent;
  private cameraMotion = { x: 0, y: 0 };
  private baseScroll = { x: 0, y: 0 };
  private moving = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    scene.events.once('shutdown', () => this.restore());
  }

  alphaFor(actor: Phaser.GameObjects.Sprite) {
    return this.frozen.find(item => item.actor === actor)?.alpha ?? actor.alpha;
  }

  play(power: number, angle: number, actors: Phaser.GameObjects.Sprite[], x: number, y: number, depth: number) {
    this.restore();
    const strength = Phaser.Math.Clamp(power / 1500, 0.08, 1);
    // Hold just the visible contact poses for 18–42ms; physics remains authoritative.
    for (const actor of actors) {
      if (!actor.visible || !actor.active) continue;
      const ghost = this.scene.add.sprite(actor.x, actor.y, actor.texture.key).setOrigin(actor.originX, actor.originY)
        .setScale(actor.scaleX, actor.scaleY).setAngle(actor.angle).setDepth(actor.depth + 0.02).setAlpha(actor.alpha);
      this.frozen.push({ actor, alpha: actor.alpha, ghost });
      actor.setAlpha(0);
    }
    this.release = this.scene.time.delayedCall(18 + strength * 24, () => this.restoreActors());

    const camera = this.scene.cameras.main;
    this.baseScroll = { x: camera.scrollX, y: camera.scrollY };
    this.moving = true;
    this.cameraMotion = { x: -Math.cos(angle) * (1 + strength * 4), y: -Math.sin(angle) * (1 + strength * 3) };
    camera.setScroll(this.baseScroll.x + this.cameraMotion.x, this.baseScroll.y + this.cameraMotion.y);
    this.scene.tweens.add({ targets: this.cameraMotion, x: 0, y: 0, duration: 110 + strength * 70, ease: 'Cubic.easeOut',
      onUpdate: () => camera.setScroll(this.baseScroll.x + this.cameraMotion.x, this.baseScroll.y + this.cameraMotion.y),
      onComplete: () => { camera.setScroll(this.baseScroll.x, this.baseScroll.y); this.moving = false; },
    });

    // A short vibrating blade accent at contact, aligned with the selected shot.
    const blade = this.scene.add.image(x, y, 'tex_bat').setOrigin(0.5, 0.7).setScale(0.30 + strength * 0.12)
      .setRotation(angle + Math.PI / 2).setDepth(25).setAlpha(0.8);
    this.scene.tweens.add({ targets: blade, angle: blade.angle + 3 + strength * 3, duration: 14, yoyo: true, repeat: 2,
      onComplete: () => blade.destroy() });
    const contactShadow = this.scene.add.ellipse(x, depth, 22, 8, 0x0b1720, 0.12 + strength * 0.28).setDepth(9);
    this.scene.tweens.add({ targets: contactShadow, scaleX: 1.7, alpha: 0, duration: 140 + strength * 80,
      onComplete: () => contactShadow.destroy() });
  }

  private restoreActors() {
    for (const { actor, alpha, ghost } of this.frozen) {
      if (actor.active) actor.setAlpha(alpha);
      ghost.destroy();
    }
    this.frozen = [];
  }
  private restore() {
    this.release?.remove();
    this.restoreActors();
    this.scene.tweens.killTweensOf(this.cameraMotion);
    if (this.moving) this.scene.cameras.main.setScroll(this.baseScroll.x, this.baseScroll.y);
    this.moving = false;
  }
}
