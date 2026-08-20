import Phaser from "phaser";
import TextureManager from "../managers/TextureManager";
import FruitManager from "../managers/FruitManager";
import SliceManager from "../managers/SliceManager";
import ScoreManager from "../managers/ScoreManager";
import ParticleManager from "../managers/ParticleManager";
import HUDManager from "../managers/HUDManager";
import AudioManager from "../../../snake-ladder/phaser/managers/AudioManager";
import { FruitEvents } from "../events/FruitEvents";
import type { FruitDef } from "../types/fruit.types";
import FruitNinjaMultiplayerDriver from "../managers/FruitNinjaMultiplayerDriver";
import { useMultiplayerStore, type WinnerInfo } from "../../../../store/multiplayerStore";
import type { FruitNinjaState } from "@gaming-hub/game-engine";

export default class FruitNinjaScene extends Phaser.Scene {
  private texturesMgr!: TextureManager;
  private fruitManager!: FruitManager;
  private sliceManager!: SliceManager;
  private scoreManager!: ScoreManager;
  private particles!: ParticleManager;
  private hud!: HUDManager;
  private audio!: AudioManager;

  private multiplayerDriver?: FruitNinjaMultiplayerDriver;
  private isMultiplayer = false;
  private mySeat: number | null = null;

  private mode!: string;
  private lives = 3;
  private spawnEvent?: Phaser.Time.TimerEvent;
  private matchTimerEvent?: Phaser.Time.TimerEvent;
  private matchTimeLeft = 60;
  private gameOver = false;
  private isStarted = false;

  // Combo tracking
  private lastSliceTime = 0;
  private comboCount = 0;

  constructor() {
    super("FruitNinjaScene");
  }

  create(): void {
    this.mode = this.registry.get("mode") || "classic";
    this.isMultiplayer = !!this.registry.get("isMultiplayer");
    this.gameOver = false;
    this.isStarted = false;
    this.lives = 3;
    this.matchTimeLeft = 60;
    this.comboCount = 0;
    this.lastSliceTime = 0;

    // 0. Render Authentic Dojo Wooden Board Arena Background (Depth 0)
    this.drawDojoBackground();

    // 1. Generate 3D Textures & Particles
    this.texturesMgr = new TextureManager(this);
    this.texturesMgr.generateTextures();

    // 2. Audio & Particle Manager
    this.audio = new AudioManager(this);
    this.audio.init();

    this.particles = new ParticleManager(this);

    // 3. Spawns & Physics
    this.fruitManager = new FruitManager(this, this.particles, this.mode);
    this.fruitManager.create();

    // 4. Trail & Slices
    this.sliceManager = new SliceManager(this, this.fruitManager);
    this.sliceManager.create();

    // 5. HUD & Scoring
    this.scoreManager = new ScoreManager(this);
    this.hud = new HUDManager(this);
    this.hud.create(this.mode, this.isMultiplayer);

    // 6. Multiplayer Driver Initialization
    if (this.isMultiplayer) {
      const currentStore = useMultiplayerStore.getState();
      this.mySeat = currentStore.mySeat;
      const names = currentStore.room?.players.map((p) => p.displayName) ?? [];

      this.multiplayerDriver = new FruitNinjaMultiplayerDriver(this.mySeat, names);

      this.multiplayerDriver.setOnStateUpdate((state: FruitNinjaState) => {
        if (this.gameOver && !state.finished && !useMultiplayerStore.getState().winner) {
          this.restartGameForRematch();
          return;
        }
        if (this.gameOver) return;
        const oppSeat = this.mySeat === 0 ? 1 : 0;
        const oppPlayer = state.players[oppSeat];
        if (oppPlayer) {
          this.hud.updateOpponentScore(oppPlayer.score);
        }
      });

      this.multiplayerDriver.setOnGameOver((winner, state) => {
        this.triggerGameOver(winner, state);
      });

      this.multiplayerDriver.start();

      this.events.once("shutdown", () => {
        this.multiplayerDriver?.stop();
        if (this.spawnEvent) this.spawnEvent.destroy();
        if (this.matchTimerEvent) this.matchTimerEvent.destroy();
      });
    }

    this.events.once("shutdown", () => {
      if (this.spawnEvent) this.spawnEvent.destroy();
      if (this.matchTimerEvent) this.matchTimerEvent.destroy();
    });

    // 7. Event Bindings
    this.events.off(FruitEvents.FRUIT_SLICED);
    this.events.off(FruitEvents.BOMB_EXPLODED);
    this.events.off(FruitEvents.LIFE_LOST);

    this.events.on(FruitEvents.FRUIT_SLICED, (def: FruitDef) => {
      if (this.gameOver) return;
      this.audio.play("move");
      this.scoreManager.registerSlice(def);

      if (this.multiplayerDriver) {
        this.multiplayerDriver.sendFruitSliced(def.points);
      }

      // Combo Tracking
      const now = this.time.now;
      if (now - this.lastSliceTime < 280) {
        this.comboCount++;
        this.sliceManager.setComboActive(true, this.comboCount);
      } else {
        if (this.comboCount >= 3) {
          const bonus = this.comboCount * 10;
          this.scoreManager.addPoints(bonus);
          this.hud.showCombo(this.comboCount, bonus);
          this.cameras.main.shake(120, 0.006 * Math.min(this.comboCount, 5));
        }
        this.comboCount = 1;
        this.sliceManager.setComboActive(false);
      }
      this.lastSliceTime = now;

      this.hud.updateScore(this.scoreManager.getScore());
    });

    this.events.on(FruitEvents.BOMB_EXPLODED, () => {
      if (this.gameOver) return;
      this.audio.play("snake");
      this.scoreManager.registerBomb();
      this.comboCount = 0;
      this.sliceManager.setComboActive(false);

      if (this.multiplayerDriver) {
        this.multiplayerDriver.sendBombHit();
      }
      this.triggerGameOver();
    });

    this.events.on(FruitEvents.LIFE_LOST, () => {
      if (this.mode === "zen" || this.gameOver) return;

      this.scoreManager.registerMiss();
      this.comboCount = 0;
      this.sliceManager.setComboActive(false);
      this.lives--;
      this.hud.updateLives(this.lives);

      if (this.multiplayerDriver) {
        this.multiplayerDriver.sendMissedFruit();
      }

      if (this.lives <= 0) {
        this.triggerGameOver();
      }
    });

    // 8. Start with Cinematic 3-2-1 SLICE intro
    this.hud.playStartIntro(() => {
      this.isStarted = true;
      this.scheduleNextSpawn();
      this.startTimer();
    });
  }

  /**
   * Renders a warm wooden dojo board background with natural wood grain,
   * subtle plank seams, and a warm central spotlight that makes every fruit pop!
   */
  private drawDojoBackground(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const g = this.add.graphics().setDepth(0);

    // 1. Base dark walnut dojo tone
    g.fillStyle(0x23140a, 1.0);
    g.fillRect(0, 0, w, h);

    // 2. Horizontal wooden planks
    const plankHeight = 70;
    const plankColors = [0x2e1a0e, 0x361f11, 0x29160a, 0x331c0e, 0x2b170c, 0x3a2113, 0x281509];

    for (let y = 0; y < h; y += plankHeight) {
      const idx = Math.floor(y / plankHeight) % plankColors.length;
      g.fillStyle(plankColors[idx]!, 1.0);
      g.fillRect(0, y, w, plankHeight);

      // Plank top highlight line
      g.fillStyle(0xffffff, 0.04);
      g.fillRect(0, y, w, 1.5);

      // Plank bottom shadow seam
      g.fillStyle(0x0f0703, 0.85);
      g.fillRect(0, y + plankHeight - 2, w, 2);

      // Subtle horizontal wood grain lines
      g.lineStyle(0.6, 0x4a2d18, 0.12);
      for (let gy = y + 8; gy < y + plankHeight - 8; gy += 10) {
        g.beginPath();
        g.moveTo(0, gy);
        for (let gx = 0; gx <= w; gx += 30) {
          const wave = Math.sin(gx * 0.02 + gy * 0.1) * 1.5;
          g.lineTo(gx, gy + wave);
        }
        g.strokePath();
      }
    }

    // 3. Warm Central Spotlight Vignette (Makes all fruit colors burst with contrast)
    const haloGfx = this.add.graphics().setDepth(1);
    haloGfx.fillStyle(0x854d0e, 0.18);
    haloGfx.fillCircle(w / 2, h / 2, 280);

    haloGfx.fillStyle(0xd97706, 0.10);
    haloGfx.fillCircle(w / 2, h / 2, 180);

    // 4. Subtle Outer Vignette Border
    g.lineStyle(1.5, 0x000000, 0.4);
    g.strokeRect(0, 0, w, h);
  }

  private startTimer(): void {
    if (this.matchTimerEvent) this.matchTimerEvent.destroy();
    this.matchTimerEvent = this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (this.gameOver || !this.isStarted) return;
        this.matchTimeLeft--;
        this.hud.updateTimer(this.matchTimeLeft);
        if (this.matchTimeLeft <= 0) {
          this.triggerGameOver();
        }
      },
      loop: true,
    });
  }

  private scheduleNextSpawn(): void {
    if (this.gameOver || !this.isStarted) return;

    const score = this.scoreManager.getScore();
    const delay = Math.max(380, 1050 - score * 4.5);
    const maxFruits = Math.min(5, 1 + Math.floor(score / 60));
    const minFruits = Math.max(1, Math.floor(maxFruits / 2));
    const spawnCount = Phaser.Math.Between(minFruits, maxFruits);
    const velMult = Math.min(1.35, 1 + score / 550);

    this.spawnEvent = this.time.delayedCall(delay, () => {
      if (this.gameOver || !this.isStarted) return;

      for (let i = 0; i < spawnCount; i++) {
        this.time.delayedCall(i * 140, () => {
          if (!this.gameOver && this.isStarted) {
            this.fruitManager.spawnFruit(velMult);
          }
        });
      }

      this.scheduleNextSpawn();
    });
  }

  update(): void {
    if (this.gameOver) return;

    const now = this.time.now;
    if (this.comboCount >= 3 && now - this.lastSliceTime > 300) {
      const bonus = this.comboCount * 10;
      this.scoreManager.addPoints(bonus);
      this.hud.showCombo(this.comboCount, bonus);
      this.cameras.main.shake(120, 0.006 * Math.min(this.comboCount, 5));
      this.comboCount = 0;
      this.sliceManager.setComboActive(false);
      this.hud.updateScore(this.scoreManager.getScore());
    } else if (now - this.lastSliceTime > 300) {
      this.comboCount = 0;
      this.sliceManager.setComboActive(false);
    }

    this.fruitManager.update();
    this.sliceManager.update();
  }

  private restartGameForRematch(): void {
    this.gameOver = false;
    this.isStarted = false;
    this.matchTimeLeft = 60;
    this.lives = 3;
    this.comboCount = 0;
    this.lastSliceTime = 0;

    if (this.spawnEvent) this.spawnEvent.destroy();
    if (this.matchTimerEvent) this.matchTimerEvent.destroy();

    this.scoreManager.reset();
    this.fruitManager.clearAll();
    this.sliceManager.clear();
    this.hud.updateScore(0);
    this.hud.updateOpponentScore(0);
    this.hud.updateLives(3);
    this.hud.updateTimer(60);

    this.hud.playStartIntro(() => {
      this.isStarted = true;
      this.scheduleNextSpawn();
      this.startTimer();
    });
  }

  private triggerGameOver(winner?: WinnerInfo | null, finalState?: FruitNinjaState): void {
    if (this.gameOver && !winner && this.isMultiplayer) {
      return;
    }
    this.gameOver = true;

    if (this.spawnEvent) this.spawnEvent.destroy();
    if (this.matchTimerEvent) this.matchTimerEvent.destroy();

    this.sliceManager.clear();
    this.fruitManager.clearAll();

    const endReason = finalState?.endReason ?? (useMultiplayerStore.getState().gameState as unknown as FruitNinjaState)?.endReason;

    // Emit event with rich stats to FruitNinjaOverlays.tsx
    this.events.emit(FruitEvents.GAME_OVER, {
      stats: this.scoreManager.getStats(),
      winner: winner ?? useMultiplayerStore.getState().winner,
      endReason,
    });
  }
}
export { FruitNinjaScene };
