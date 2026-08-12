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
  private spawnEvent!: Phaser.Time.TimerEvent;
  private zenTimerEvent!: Phaser.Time.TimerEvent;
  private matchTimerEvent!: Phaser.Time.TimerEvent;
  private matchTimeLeft = 60;
  private gameOver = false;
  
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
    this.lives = 3;
    this.matchTimeLeft = 60;
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
      });
    }

    this.scheduleNextSpawn();

    // Match Timer for 60s
    this.matchTimerEvent = this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (this.gameOver) return;
        this.matchTimeLeft--;
        this.hud.updateTimer(this.matchTimeLeft);
        if (this.matchTimeLeft <= 0) {
          this.triggerGameOver();
        }
      },
      loop: true,
    });

    // ─── Event Bindings ───────────────────────────────────────────────────────
    this.events.off(FruitEvents.FRUIT_SLICED);
    this.events.off(FruitEvents.BOMB_EXPLODED);
    this.events.off(FruitEvents.LIFE_LOST);

    this.events.on(FruitEvents.FRUIT_SLICED, (def: FruitDef) => {
      this.audio.play("move");
      let baseScore = this.scoreManager.registerSlice(def);
      
      if (this.multiplayerDriver) {
        this.multiplayerDriver.sendFruitSliced(def.points);
      }

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
      this.comboCount = 0;
      this.sliceManager.setComboActive(false);

      if (this.multiplayerDriver) {
        this.multiplayerDriver.sendBombHit();
      }
      this.triggerGameOver();
    });

    this.events.on(FruitEvents.LIFE_LOST, () => {
      if (this.mode === "zen") return;
      
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
  }

  private scheduleNextSpawn() {
     if (this.gameOver) return;
     
     const score = this.scoreManager.getScore();
     
     const delay = Math.max(400, 1100 - (score * 5));
     const maxFruits = Math.min(6, 1 + Math.floor(score / 50));
     const minFruits = Math.max(1, Math.floor(maxFruits / 2));
     const spawnCount = Phaser.Math.Between(minFruits, maxFruits);
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

  private restartGameForRematch(): void {
    this.gameOver = false;
    this.matchTimeLeft = 60;
    this.lives = 3;
    this.comboCount = 0;
    this.lastSliceTime = 0;

    if (this.gameOverCard) {
      this.gameOverCard.destroy();
      this.gameOverCard = null;
    }

    if (this.spawnEvent) this.spawnEvent.destroy();
    if (this.zenTimerEvent) this.zenTimerEvent.destroy();
    if (this.matchTimerEvent) this.matchTimerEvent.destroy();

    this.scoreManager.reset();
    this.fruitManager.clearAll();
    this.sliceManager.clear();
    this.hud.updateScore(0);
    this.hud.updateOpponentScore(0);
    this.hud.updateLives(3);
    this.hud.updateTimer(60);

    this.scheduleNextSpawn();

    this.matchTimerEvent = this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (this.gameOver) return;
        this.matchTimeLeft--;
        this.hud.updateTimer(this.matchTimeLeft);
        if (this.matchTimeLeft <= 0) {
          this.triggerGameOver();
        }
      },
      loop: true,
    });
  }

  private gameOverCard: Phaser.GameObjects.Container | null = null;

  private triggerGameOver(winner?: WinnerInfo | null, finalState?: FruitNinjaState): void {
    if (this.gameOver && !winner && this.isMultiplayer) {
      return;
    }
    this.gameOver = true;

    if (this.spawnEvent) this.spawnEvent.destroy();
    if (this.zenTimerEvent) this.zenTimerEvent.destroy();
    if (this.matchTimerEvent) this.matchTimerEvent.destroy();
    
    this.sliceManager.clear();
    this.fruitManager.clearAll();

    if (this.gameOverCard) {
      this.gameOverCard.destroy();
      this.gameOverCard = null;
    }

    const w = this.scale.width;
    const h = this.scale.height;

    let titleText = "GAME OVER";
    let subtitleText = "MATCH COMPLETE";
    let titleColor = "#ef4444";
    let borderColor = 0xef4444;

    const mySeat = this.mySeat ?? useMultiplayerStore.getState().mySeat;

    if (this.isMultiplayer) {
      const activeWinner = winner ?? useMultiplayerStore.getState().winner;
      const winnerSeats = activeWinner?.winnerSeats ?? finalState?.winnerSeats ?? [];
      const endReason = finalState?.endReason ?? (useMultiplayerStore.getState().gameState as unknown as FruitNinjaState)?.endReason;

      const iWon = mySeat !== null && winnerSeats.includes(mySeat);
      const isDraw = winnerSeats.length > 1;

      if (winnerSeats.length === 0) {
        titleText = "MATCH ENDED";
        titleColor = "#f59e0b";
        borderColor = 0xf59e0b;
        subtitleText = "Calculating Winner...";
      } else if (iWon) {
        this.audio.play("win");
        titleText = "YOU WIN! 🎉";
        titleColor = "#f59e0b";
        borderColor = 0xf59e0b;
        if (endReason === "bomb_elimination") {
          subtitleText = "Opponent Hit A Bomb!";
        } else if (endReason === "player_eliminated") {
          subtitleText = "Opponent Ran Out Of Lives!";
        } else if (endReason === "timer_expired") {
          subtitleText = "Highest Score Wins!";
        } else if (endReason === "resignation") {
          subtitleText = "Opponent Resigned!";
        }
      } else if (isDraw) {
        titleText = "MATCH DRAW 🤝";
        titleColor = "#38bdf8";
        borderColor = 0x38bdf8;
        subtitleText = "Equal Scores!";
      } else {
        titleText = "YOU LOST 💔";
        titleColor = "#ef4444";
        borderColor = 0xef4444;
        if (endReason === "bomb_elimination") {
          subtitleText = "Bomb Exploded! (Eliminated)";
        } else if (endReason === "player_eliminated") {
          subtitleText = "Out of Lives! (Eliminated)";
        } else if (endReason === "timer_expired") {
          subtitleText = "Opponent Has Higher Score!";
        } else if (endReason === "resignation") {
          subtitleText = "You Resigned!";
        }
      }
    } else if (this.mode === "zen") {
      titleText = "TIME'S UP";
      titleColor = "#4ade80";
      borderColor = 0x4ade80;
    }

    const container = this.add.container(0, 0).setDepth(100);
    this.gameOverCard = container;

    // Show game over banner
    const card = this.add.rectangle(w / 2, h / 2, 340, 200, 0x0f172a);
    card.setStrokeStyle(3, borderColor);
    container.add(card);

    const title = this.add.text(w / 2, h / 2 - 50, titleText, {
      fontSize:   "26px",
      color:      titleColor,
      fontFamily: "Outfit, sans-serif",
      fontStyle:  "bold",
    }).setOrigin(0.5);
    container.add(title);

    const score = this.add.text(w / 2, h / 2, `Your Score: ${this.scoreManager.getScore()}`, {
      fontSize:   "16px",
      color:      "#f59e0b",
      fontFamily: "Outfit, sans-serif",
      fontStyle:  "bold",
    }).setOrigin(0.5);
    container.add(score);

    if (!this.isMultiplayer) {
      const replayBtn = this.add.rectangle(w / 2, h / 2 + 50, 150, 36, 0x16a34a);
      replayBtn.setStrokeStyle(2, 0x4ade80).setInteractive({ useHandCursor: true });
      replayBtn.on("pointerdown", () => this.scene.restart());
      container.add(replayBtn);

      const replayLabel = this.add.text(w / 2, h / 2 + 50, "PLAY AGAIN", {
        fontSize:   "11px",
        color:      "#ffffff",
        fontFamily: "Outfit, sans-serif",
        fontStyle:  "bold",
      }).setOrigin(0.5);
      container.add(replayLabel);
    } else {
      const sub = this.add.text(w / 2, h / 2 + 20, subtitleText, {
        fontSize:   "12px",
        color:      "#94a3b8",
        fontFamily: "Outfit, sans-serif",
        fontStyle:  "bold",
      }).setOrigin(0.5);
      container.add(sub);

      // Rematch Button
      const rematchBtn = this.add.rectangle(w / 2 - 65, h / 2 + 60, 110, 32, 0x2563eb);
      rematchBtn.setStrokeStyle(2, 0x60a5fa).setInteractive({ useHandCursor: true });
      rematchBtn.on("pointerdown", () => {
        void useMultiplayerStore.getState().requestRematch();
      });
      container.add(rematchBtn);

      const rematchLabel = this.add.text(w / 2 - 65, h / 2 + 60, "REMATCH", {
        fontSize:   "11px",
        color:      "#ffffff",
        fontFamily: "Outfit, sans-serif",
        fontStyle:  "bold",
      }).setOrigin(0.5);
      container.add(rematchLabel);

      // Exit Lobby Button
      const exitBtn = this.add.rectangle(w / 2 + 65, h / 2 + 60, 110, 32, 0x334155);
      exitBtn.setStrokeStyle(2, 0x64748b).setInteractive({ useHandCursor: true });
      exitBtn.on("pointerdown", () => {
        void useMultiplayerStore.getState().leaveRoom();
      });
      container.add(exitBtn);

      const exitLabel = this.add.text(w / 2 + 65, h / 2 + 60, "EXIT LOBBY", {
        fontSize:   "11px",
        color:      "#ffffff",
        fontFamily: "Outfit, sans-serif",
        fontStyle:  "bold",
      }).setOrigin(0.5);
      container.add(exitLabel);
    }

    this.events.emit(FruitEvents.GAME_OVER, this.scoreManager.getScore());
  }
}
export { FruitNinjaScene };
