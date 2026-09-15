import Phaser from 'phaser';
import { ReplayBuffer, replayBlend, type ReplayFrame } from '../physics/replayBuffer';

export class CricketReplayManager {
  private scene: Phaser.Scene;
  private history = new ReplayBuffer();
  private clip: ReplayFrame[] = [];
  private pending = 0;
  private capturedEvent = false;
  private clock = 0;
  private nextSample = 0;
  private playhead: number | null = null;
  private auto = false;
  private label = '';
  private panel: Phaser.GameObjects.Container;
  private world: Phaser.GameObjects.Container;
  private actors: Phaser.GameObjects.Sprite[] = [];
  private bails: Phaser.GameObjects.Rectangle[] = [];
  private shadow: Phaser.GameObjects.Ellipse;
  private title: Phaser.GameObjects.Text;
  private watch: Phaser.GameObjects.Text;
  private toggle: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    try { this.auto = localStorage.getItem('cricket_auto_replay') === 'true'; } catch { /* Optional preference. */ }
    const style = { font: 'bold 12px Arial', color: '#dbeafe', backgroundColor: '#101c2b', padding: { x: 10, y: 8 } };
    this.toggle = scene.add.text(910, 82, '', style).setOrigin(1, 0).setDepth(1000).setInteractive({ useHandCursor: true });
    this.toggle.on('pointerdown', () => {
      this.auto = !this.auto;
      try { localStorage.setItem('cricket_auto_replay', String(this.auto)); } catch { /* Optional preference. */ }
      this.updateToggle();
    });
    this.updateToggle();
    this.watch = scene.add.text(910, 113, '', style).setOrigin(1, 0).setDepth(1000).setVisible(false).setInteractive({ useHandCursor: true });
    this.watch.on('pointerdown', () => this.play());
    this.panel = scene.add.container(626, 151).setDepth(1001).setVisible(false);
    this.panel.add(scene.add.rectangle(142, 116, 288, 236, 0x0a1421, 0.97).setStrokeStyle(1, 0x6892af));
    this.world = scene.add.container(4, 29).setScale(0.3);
    this.panel.add(this.world);
    const ground = scene.add.graphics();
    ground.fillStyle(0x3c7544).fillRect(0, 0, 924, 680);
    ground.fillStyle(0xc19562).fillTriangle(462, 150, 160, 680, 764, 680);
    ground.lineStyle(4, 0xf1e3ce).lineBetween(325, 575, 600, 575).lineBetween(420, 215, 505, 215);
    for (const y of [200, 665]) for (const x of [451, 462, 473]) ground.lineStyle(4, 0xdce5e7).lineBetween(x, y, x, y - 42);
    this.world.add(ground);
    this.shadow = scene.add.ellipse(0, 0, 16, 7, 0x08111b, 0.5);
    this.world.add(this.shadow);
    this.bails = [0, 1].map(() => scene.add.rectangle(0, 0, 18, 4, 0xe8d3ab));
    this.world.add(this.bails);
    this.title = scene.add.text(10, 6, 'REPLAY · 0.5×', { font: 'bold 12px Arial', color: '#fbbf24' });
    const close = scene.add.text(275, 5, '✕', { font: 'bold 16px Arial', color: '#ffffff' }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.stop());
    this.panel.add([this.title, close]);
    const mask = scene.make.graphics({ x: 630, y: 180 });
    mask.fillStyle(0xffffff).fillRect(0, 0, 277, 204);
    this.world.setMask(mask.createGeometryMask());
    scene.events.once('shutdown', () => { mask.destroy(); this.history.clear(); this.clip = []; });
  }

  private updateToggle() { this.toggle.setText(`AUTO REPLAY: ${this.auto ? 'ON' : 'OFF'}`); }
  beginDelivery() { this.capturedEvent = false; this.pending = 0; this.history.clear(); this.stop(); }
  request(label: 'SIX' | 'WICKET' | 'CLOSE CATCH') {
    if (this.capturedEvent) return;
    this.capturedEvent = true;
    this.label = label;
    this.pending = this.clock + 0.6;
  }

  update(deltaMs: number, capture: () => Omit<ReplayFrame, 'time'>) {
    const dt = Math.min(Math.max(deltaMs, 0), 100) / 1000;
    this.clock += dt;
    if (this.clock >= this.nextSample) {
      this.history.push({ time: this.clock, ...capture() });
      this.nextSample = this.clock + 1 / 30;
    }
    if (this.pending && this.clock >= this.pending) {
      this.pending = 0;
      this.clip = this.history.clip();
      this.watch.setText(`▶ WATCH ${this.label}`).setVisible(this.clip.length > 1);
      if (this.auto) this.play();
    }
    if (this.playhead === null) return;
    this.playhead += dt * 0.5;
    const frame = replayBlend(this.clip, this.playhead);
    if (!frame || this.playhead > this.clip[this.clip.length - 1].time) { this.stop(); return; }
    const { from, to, mix } = frame;
    const lerp = Phaser.Math.Linear;
    from.poses.forEach((pose, index) => {
      const end = to.poses[index] ?? pose;
      let actor = this.actors[index];
      if (!actor) { actor = this.scene.add.sprite(0, 0, pose.texture); this.actors.push(actor); this.world.add(actor); }
      actor.setTexture(mix < 0.5 ? pose.texture : end.texture).setOrigin(pose.ox, pose.oy)
        .setPosition(lerp(pose.x, end.x, mix), lerp(pose.y, end.y, mix))
        .setScale(lerp(pose.sx, end.sx, mix), lerp(pose.sy, end.sy, mix))
        .setAngle(lerp(pose.angle, end.angle, mix)).setAlpha(lerp(pose.alpha, end.alpha, mix))
        .setVisible(mix < 0.5 ? pose.visible : end.visible);
    });
    from.bails.forEach((bail, index) => {
      const end = to.bails[index] ?? bail;
      this.bails[index].setPosition(lerp(bail.x, end.x, mix), lerp(bail.y, end.y, mix))
        .setAngle(lerp(bail.angle, end.angle, mix)).setAlpha(lerp(bail.alpha, end.alpha, mix));
    });
    const ballX = lerp(from.ballX, to.ballX, mix), depth = lerp(from.ballDepth, to.ballDepth, mix);
    const height = lerp(from.ballHeight, to.ballHeight, mix);
    this.shadow.setPosition(ballX, depth).setScale(0.7 + height / 160).setAlpha(Math.max(0.12, 0.6 - height / 220));
    // Independent replay lens gently tracks the recorded ball, never the live camera.
    const zoom = 0.33;
    this.world.setScale(zoom).setPosition(4 - Phaser.Math.Clamp(ballX * zoom - 138, 0, 924 * zoom - 277),
      29 - Phaser.Math.Clamp(depth * zoom - 100, 0, 680 * zoom - 204));
  }

  private play() {
    if (this.clip.length < 2) return;
    this.playhead = this.clip[0].time;
    this.title.setText(`${this.label} · REPLAY 0.5×`);
    this.panel.setVisible(true);
  }
  private stop() { this.playhead = null; this.panel.setVisible(false); }
}
