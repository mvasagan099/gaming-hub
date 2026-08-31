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
import { FRUIT_NINJA_VISUAL_CONFIG } from "../constants/fruitNinjaVisualConfig";

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
  private pendingBurstTimers: Phaser.Time.TimerEvent[] = [];
  private matchTimerEvent?: Phaser.Time.TimerEvent;
  private matchTimeLeft = 60;
  private gameOver = false;
  private isStarted = false;

  private clearAllSpawnTimers(): void {
    if (this.spawnEvent) {
      this.spawnEvent.destroy();
      this.spawnEvent = undefined;
    }
    for (const t of this.pendingBurstTimers) {
      t.destroy();
    }
    this.pendingBurstTimers = [];
  }

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
      this.clearAllSpawnTimers();
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
      this.fruitManager.spawnFruit(1);
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
    // Plank seams (vertical dojo floorboards)
    const plankCount = Math.max(6, Math.round(w / 80));
    const plankWidth = w / plankCount;
    g.lineStyle(1.5, 0x0f0703, 0.45);
    for (let i = 1; i < plankCount; i++) {
      g.beginPath();
      g.moveTo(i * plankWidth, 0);
      g.lineTo(i * plankWidth, h);
      g.strokePath();
    }

    // Dojo center spotlight / subtle dojo crest ring
    const centerX = w / 2;
    const centerY = h / 2;
    g.fillStyle(0xd97706, 0.04);
    g.fillCircle(centerX, centerY, Math.min(w, h) * 0.42);
    g.fillStyle(0xd97706, 0.025);
    g.fillCircle(centerX, centerY, Math.min(w, h) * 0.65);
  }

  private startTimer(): void {
    if (this.matchTimerEvent) {
      this.matchTimerEvent.destroy();
    }
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

    if (this.spawnEvent) {
      this.spawnEvent.destroy();
      this.spawnEvent = undefined;
    }

    const score = this.scoreManager.getScore();
    const { spawning } = FRUIT_NINJA_VISUAL_CONFIG;

    // Controlled interval: starts at 1600ms, gradually scales to min 950ms based on score
    const delay = Math.max(spawning.minSpawnDelayMs, spawning.baseSpawnDelayMs - score * 2.2);

    // Difficulty curve for burst count:
    // Score 0 - 59: 1 fruit per wave
    // Score 60 - 149: 1 to 2 fruits per wave
    // Score 150+: 2 to 3 fruits per wave (capped at 3)
    let maxWaveFruits = 1;
    if (score >= 150) {
      maxWaveFruits = 3;
    } else if (score >= 60) {
      maxWaveFruits = 2;
    }
    const minWaveFruits = Math.max(1, maxWaveFruits - 1);
    const waveCount = Phaser.Math.Between(minWaveFruits, maxWaveFruits);
    const velMult = Math.min(1.25, 1 + score / 800);

    this.spawnEvent = this.time.delayedCall(delay, () => {
      if (this.gameOver || !this.isStarted) return;

      const currentActive = this.fruitManager.getActiveFruitCount();
      const availableSlots = Math.max(0, spawning.maxActiveFruits - currentActive);
      const actualSpawnCount = Math.min(waveCount, availableSlots);

      if (actualSpawnCount > 0) {
        const spawnPositions = this.fruitManager.getSpacedSpawnPositions(
          actualSpawnCount,
          spawning.minSpawnSpacingX
        );

        // First fruit spawns immediately
        this.fruitManager.spawnFruitAt(spawnPositions[0], velMult);

        // Stagger remaining fruits in the wave
        for (let i = 1; i < actualSpawnCount; i++) {
          const posX = spawnPositions[i];
          const timer = this.time.delayedCall(i * spawning.burstDelayMs, () => {
            if (!this.gameOver && this.isStarted) {
              if (this.fruitManager.getActiveFruitCount() < spawning.maxActiveFruits) {
                this.fruitManager.spawnFruitAt(posX, velMult);
              }
            }
          });
          this.pendingBurstTimers.push(timer);
        }
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

    this.clearAllSpawnTimers();
    if (this.matchTimerEvent) {
      this.matchTimerEvent.destroy();
      this.matchTimerEvent = undefined;
    }

    this.scoreManager.reset();
    this.fruitManager.clearAll();
    this.sliceManager.clear();
    this.hud.updateScore(0);
    this.hud.updateOpponentScore(0);
    this.hud.updateLives(3);
    this.hud.updateTimer(60);

    this.hud.playStartIntro(() => {
      this.isStarted = true;
      this.fruitManager.spawnFruit(1);
      this.scheduleNextSpawn();
      this.startTimer();
    });
  }

  private triggerGameOver(winner?: WinnerInfo | null, finalState?: FruitNinjaState): void {
    if (this.gameOver && !winner && this.isMultiplayer) {
      return;
    }
    this.gameOver = true;

    this.clearAllSpawnTimers();
    if (this.matchTimerEvent) {
      this.matchTimerEvent.destroy();
      this.matchTimerEvent = undefined;
    }

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

  public startCustomSlice(x: number, y: number): void {
    if (this.gameOver) return;
    this.sliceManager.startSlicePoint(x, y);
  }

  public handleCustomSlice(x: number, y: number): void {
    if (this.gameOver) return;
    this.sliceManager.addSlicePoint(x, y);
  }
}
export { FruitNinjaScene };
