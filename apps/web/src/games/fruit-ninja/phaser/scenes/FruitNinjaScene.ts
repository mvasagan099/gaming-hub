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

export default class FruitNinjaScene extends Phaser.Scene {
  private texturesMgr!: TextureManager;
  private fruitManager!: FruitManager;
  private sliceManager!: SliceManager;
  private scoreManager!: ScoreManager;
  private particles!: ParticleManager;
  private hud!: HUDManager;
  private audio!: AudioManager;

  private mode!: string;
  private lives = 3;
  private spawnEvent!: Phaser.Time.TimerEvent;
  private zenTimerEvent!: Phaser.Time.TimerEvent;
  private zenTimeLeft = 90;
  private gameOver = false;
  
  // Combo tracking
  private lastSliceTime = 0;
  private comboCount = 0;

  constructor() {
    super("FruitNinjaScene");
  }

  create(): void {
    this.mode = this.registry.get("mode") || "classic";
    this.gameOver = false;
    this.lives = 3;
    this.zenTimeLeft = 90;
    this.comboCount = 0;
    this.lastSliceTime = 0;

    // 1. Generate Textures
    this.texturesMgr = new TextureManager(this);
    this.texturesMgr.generateTextures();

    // 2. Audio & Particles
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
    this.hud.create(this.mode);

    this.scheduleNextSpawn();

    if (this.mode === "zen") {
       this.zenTimerEvent = this.time.addEvent({
          delay: 1000,
          callback: () => {
             if (this.gameOver) return;
             this.zenTimeLeft--;
             this.hud.updateTimer(this.zenTimeLeft);
             if (this.zenTimeLeft <= 0) {
                this.triggerGameOver();
             }
          },
          loop: true
       });
    }

    // ─── Event Bindings ───────────────────────────────────────────────────────
    this.events.off(FruitEvents.FRUIT_SLICED);
    this.events.off(FruitEvents.BOMB_EXPLODED);
    this.events.off(FruitEvents.LIFE_LOST);

    this.events.on(FruitEvents.FRUIT_SLICED, (def: FruitDef) => {
      this.audio.play("move");
      let baseScore = this.scoreManager.registerSlice(def);
      
      // Combo Logic
      const now = this.time.now;
      if (now - this.lastSliceTime < 250) {
         this.comboCount++;
         this.sliceManager.setComboActive(true);
      } else {
         if (this.comboCount >= 3) {
            const bonus = this.comboCount * 10;
            this.scoreManager.addPoints(bonus);
            this.hud.showCombo(this.comboCount, bonus);
            this.cameras.main.shake(100, 0.005 * this.comboCount);
         }
         this.comboCount = 1;
         this.sliceManager.setComboActive(false);
      }
      this.lastSliceTime = now;
      
      this.hud.updateScore(this.scoreManager.getScore());
    });

    this.events.on(FruitEvents.BOMB_EXPLODED, () => {
      this.audio.play("snake"); // Blast sound
      this.cameras.main.shake(300, 0.02);
      this.triggerGameOver();
    });

    this.events.on(FruitEvents.LIFE_LOST, () => {
      if (this.mode === "zen") return;
      
      this.lives--;
      this.hud.updateLives(this.lives);
      if (this.lives <= 0) {
        this.triggerGameOver();
      }
    });
  }

  private scheduleNextSpawn() {
     if (this.gameOver) return;
     
     const score = this.scoreManager.getScore();
     
     // Dynamic difficulty based on score
     // Base delay is 1100, drops down to 400 at high score
     const delay = Math.max(400, 1100 - (score * 5));
     
     // Number of fruits scales up with score
     const maxFruits = Math.min(6, 1 + Math.floor(score / 50));
     const minFruits = Math.max(1, Math.floor(maxFruits / 2));
     const spawnCount = Phaser.Math.Between(minFruits, maxFruits);
     
     // Velocity multiplier slightly increases with score
     const velMult = Math.min(1.4, 1 + (score / 500));

     this.spawnEvent = this.time.delayedCall(delay, () => {
        if (this.gameOver) return;
        
        for (let i = 0; i < spawnCount; i++) {
           this.time.delayedCall(i * 150, () => {
              if (!this.gameOver) this.fruitManager.spawnFruit(velMult);
           });
        }
        
        this.scheduleNextSpawn();
     });
  }

  update(): void {
    if (this.gameOver) return;
    
    // Process combo ending naturally
    const now = this.time.now;
    if (this.comboCount >= 3 && now - this.lastSliceTime > 300) {
       const bonus = this.comboCount * 10;
       this.scoreManager.addPoints(bonus);
       this.hud.showCombo(this.comboCount, bonus);
       this.cameras.main.shake(100, 0.005 * this.comboCount);
       this.comboCount = 0;
       this.sliceManager.setComboActive(false);
    } else if (now - this.lastSliceTime > 300) {
       this.comboCount = 0;
       this.sliceManager.setComboActive(false);
    }

    this.fruitManager.update();
    this.sliceManager.update();
  }

  private triggerGameOver(): void {
    this.gameOver = true;
    if (this.spawnEvent) this.spawnEvent.destroy();
    if (this.zenTimerEvent) this.zenTimerEvent.destroy();
    
    this.sliceManager.clear();
    this.fruitManager.clearAll();

    this.audio.play("win");

    const w = this.scale.width;
    const h = this.scale.height;

    // Show game over banner
    const card = this.add.rectangle(w / 2, h / 2, 340, 200, 0x0f172a);
    card.setStrokeStyle(3, this.mode === "zen" ? 0x4ade80 : 0xef4444).setDepth(100);

    const title = this.add.text(w / 2, h / 2 - 50, this.mode === "zen" ? "TIME'S UP" : "GAME OVER", {
      fontSize:   "28px",
      color:      this.mode === "zen" ? "#4ade80" : "#ef4444",
      fontFamily: "Outfit, sans-serif",
      fontStyle:  "bold",
    }).setOrigin(0.5).setDepth(101);

    const score = this.add.text(w / 2, h / 2, `Final Score: ${this.scoreManager.getScore()}`, {
      fontSize:   "16px",
      color:      "#f59e0b",
      fontFamily: "Outfit, sans-serif",
      fontStyle:  "bold",
    }).setOrigin(0.5).setDepth(101);

    const replayBtn = this.add.rectangle(w / 2, h / 2 + 50, 150, 36, 0x16a34a);
    replayBtn.setStrokeStyle(2, 0x4ade80).setInteractive({ useHandCursor: true });
    replayBtn.on("pointerdown", () => this.scene.restart());
    replayBtn.setDepth(101);

    const replayLabel = this.add.text(w / 2, h / 2 + 50, "PLAY AGAIN", {
      fontSize:   "11px",
      color:      "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle:  "bold",
    }).setOrigin(0.5).setDepth(102);

    this.events.emit(FruitEvents.GAME_OVER, this.scoreManager.getScore());
  }
}
export { FruitNinjaScene };
