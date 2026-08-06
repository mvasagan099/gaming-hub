import Phaser from "phaser";

const GAME_W = 924;
const GAME_H = 680;
const CENTER_X = GAME_W / 2;

const COLORS = {
  text:    "#ffffff",
  danger:  "#f43f5e",
  accent:  "#fbbf24", // amber
};

export class CricketHUDManager {
  private scene: Phaser.Scene;
  private mode: "ai" | "multiplayer";
  private role: "batting" | "bowling";

  private runsText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private runIndicatorText!: Phaser.GameObjects.Text;
  private bestScoreText!: Phaser.GameObjects.Text;
  
  // New UI
  private targetText!: Phaser.GameObjects.Text;
  private ballsText!: Phaser.GameObjects.Text;
  private overHistoryBoxes: Phaser.GameObjects.Graphics[] = [];
  private overHistoryTexts: Phaser.GameObjects.Text[] = [];
  
  // Power Bar Elements
  private powerBarIndicator?: Phaser.GameObjects.Graphics;
  private powerBarTween?: Phaser.Tweens.Tween;
  private currentPower: number = 0.5; // Ranges from 0 to 1

  private controlElements: Phaser.GameObjects.GameObject[] = [];

  public onHit: (direction: 'left' | 'right' | 'up' | 'straight') => void = () => {};
  public onStepOut: () => void = () => {};
  public onBowl: (type: 'fast' | 'slow' | 'spin', power: number) => void = () => {};

  private isControlsDisabled = true;

  constructor(scene: Phaser.Scene, mode: "ai" | "multiplayer", role: "batting" | "bowling" = "batting") {
    this.scene = scene;
    this.mode = mode;
    this.role = role;
    this.createScorecard();
    if (this.role === 'bowling') {
      this.createPowerBar();
    }
    this.createControls();
    this.createRunIndicator();
  }

  private createRunIndicator() {
    this.runIndicatorText = this.scene.add.text(GAME_W - 20, GAME_H - 20, "", {
      font: "bold 48px Arial", color: "#fbbf24", stroke: "#000000", strokeThickness: 6
    }).setOrigin(1, 1).setDepth(30).setAlpha(0);
  }

  public showRunIndicator(runs: number) {
    if (runs === 0) return;
    const text = runs === 1 ? "1 RUN" : `${runs} RUNS`;
    this.runIndicatorText.setText(text);
    this.runIndicatorText.setAlpha(1);
    this.runIndicatorText.setScale(0.5);

    this.scene.tweens.add({
      targets: this.runIndicatorText,
      scale: 1,
      duration: 300,
      ease: 'Back.out',
      onComplete: () => {
        this.scene.time.delayedCall(2000, () => {
          this.scene.tweens.add({
            targets: this.runIndicatorText,
            alpha: 0,
            duration: 300
          });
        });
      }
    });
  }

  private createScorecard() {
    const depth = 20;

    // Best Score Badge (Sleek pill)
    const bestBg = this.scene.add.graphics();
    bestBg.fillStyle(0x0f172a, 0.9); // Dark slate
    bestBg.fillRoundedRect(CENTER_X - 60, 5, 120, 25, 12);
    bestBg.lineStyle(2, 0xf59e0b, 0.5); // Amber glow border
    bestBg.strokeRoundedRect(CENTER_X - 60, 5, 120, 25, 12);
    bestBg.setDepth(depth + 2);
    
    this.bestScoreText = this.scene.add.text(CENTER_X, 17, "BEST: 0", {
      fontSize: "14px", color: "#f59e0b", fontStyle: "bold", fontFamily: "Outfit, sans-serif"
    }).setOrigin(0.5).setDepth(depth + 3);

    // Card background (Broadcast style)
    const bg = this.scene.add.graphics();
    bg.fillGradientStyle(0x1e3a8a, 0x1e3a8a, 0x0f172a, 0x0f172a, 0.9); // Blue gradient
    bg.fillRoundedRect(CENTER_X - 90, 20, 180, 85, 12);
    bg.lineStyle(2, 0x60a5fa, 0.6); // Light blue border
    bg.strokeRoundedRect(CENTER_X - 90, 20, 180, 85, 12);
    bg.setDepth(depth);

    // Runs
    this.runsText = this.scene.add.text(CENTER_X, 60, "000", {
      fontSize: "64px", fontFamily: "Outfit, sans-serif", fontStyle: "900", color: "#ffffff", stroke: "#000000", strokeThickness: 4
    }).setOrigin(0.5).setDepth(depth + 1);
    this.runsText.setShadow(0, 4, 'rgba(0,0,0,0.5)', 8, true, false);

    // Status Text
    this.statusText = this.scene.add.text(CENTER_X, 125, this.role === 'batting' ? "Ready for First Ball!" : "Your turn to bowl!", {
      fontSize: "20px", color: COLORS.accent, fontFamily: "Outfit, sans-serif", fontStyle: "bold",
      align: "center", stroke: "#000000", strokeThickness: 3
    }).setOrigin(0.5).setDepth(depth);
    this.statusText.setShadow(0, 2, 'rgba(0,0,0,0.8)', 4, true, false);

    // Target Box
    const targetBg = this.scene.add.graphics();
    targetBg.fillGradientStyle(0x0f172a, 0x0f172a, 0x1e293b, 0x1e293b, 0.85);
    targetBg.fillRoundedRect(20, 20, 150, 55, 10);
    targetBg.lineStyle(2, 0xfbbf24, 0.4);
    targetBg.strokeRoundedRect(20, 20, 150, 55, 10);
    targetBg.setDepth(depth);

    this.targetText = this.scene.add.text(95, 47, "TARGET: --", {
      fontSize: "20px", color: "#fbbf24", fontStyle: "900", fontFamily: "Outfit, sans-serif"
    }).setOrigin(0.5).setDepth(depth + 1);

    // Balls Box
    const ballsBg = this.scene.add.graphics();
    ballsBg.fillGradientStyle(0x0f172a, 0x0f172a, 0x1e293b, 0x1e293b, 0.85);
    ballsBg.fillRoundedRect(GAME_W - 170, 20, 150, 55, 10);
    ballsBg.lineStyle(2, 0x60a5fa, 0.4);
    ballsBg.strokeRoundedRect(GAME_W - 170, 20, 150, 55, 10);
    ballsBg.setDepth(depth);

    this.ballsText = this.scene.add.text(GAME_W - 95, 47, "BALLS: 0/0", {
      fontSize: "20px", color: "#60a5fa", fontStyle: "900", fontFamily: "Outfit, sans-serif"
    }).setOrigin(0.5).setDepth(depth + 1);

    // Over History Strip (Sleek modern boxes)
    const stripY = 160;
    const stripWidth = 6 * 44; // 6 boxes, 44px each (with spacing)
    const startX = CENTER_X - stripWidth / 2;
    for (let i = 0; i < 6; i++) {
      const bx = startX + i * 44;
      
      const box = this.scene.add.graphics();
      box.fillStyle(0x0f172a, 0.8);
      box.fillRoundedRect(bx, stripY, 36, 36, 6);
      box.lineStyle(2, 0x334155, 0.8);
      box.strokeRoundedRect(bx, stripY, 36, 36, 6);
      box.setDepth(depth);
      
      const txt = this.scene.add.text(bx + 18, stripY + 18, "-", {
        fontSize: "20px", color: "#94a3b8", fontStyle: "900", fontFamily: "Outfit, sans-serif"
      }).setOrigin(0.5).setDepth(depth + 1);
      
      this.overHistoryBoxes.push(box);
      this.overHistoryTexts.push(txt);
    }
  }


  private createPowerBar() {
    const barWidth = 340;
    const barHeight = 24;
    const barX = CENTER_X - barWidth / 2;
    const barY = GAME_H - 170; // Adjusted for new design
    const depth = 20;

    // Bar background with glowing border
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0f172a, 0.9);
    bg.fillRoundedRect(barX - 4, barY - 4, barWidth + 8, barHeight + 8, 14);
    bg.lineStyle(2, 0x38bdf8, 0.5); // Sky blue border
    bg.strokeRoundedRect(barX - 4, barY - 4, barWidth + 8, barHeight + 8, 14);
    bg.setDepth(depth);

    // Gradient Power Sections
    bg.fillGradientStyle(0xf43f5e, 0xf43f5e, 0x9f1239, 0x9f1239, 1); // Red edges
    bg.fillRoundedRect(barX, barY, 40, barHeight, 8);
    bg.fillRoundedRect(barX + barWidth - 40, barY, 40, barHeight, 8);
    
    bg.fillGradientStyle(0xeab308, 0xeab308, 0x854d0e, 0x854d0e, 1); // Yellow transition
    bg.fillRoundedRect(barX + 35, barY, 50, barHeight, 4);
    bg.fillRoundedRect(barX + barWidth - 85, barY, 50, barHeight, 4);
    
    bg.fillGradientStyle(0x22c55e, 0x22c55e, 0x166534, 0x166534, 1); // Green sweet spot
    bg.fillRoundedRect(barX + 80, barY, barWidth - 160, barHeight, 4);

    // Glowing Indicator
    this.powerBarIndicator = this.scene.add.graphics();
    this.powerBarIndicator.fillStyle(0xffffff, 1);
    this.powerBarIndicator.fillRoundedRect(barX, barY - 6, 8, barHeight + 12, 4);
    this.powerBarIndicator.setDepth(depth + 1);

    // Add a glowing halo to the indicator
    const glow = this.scene.add.graphics();
    glow.fillStyle(0xffffff, 0.4);
    glow.fillCircle(barX + 4, barY + barHeight/2, 12);
    glow.setDepth(depth);

    // Tween to move indicator back and forth
    const dummy = { val: 0 };
    this.powerBarTween = this.scene.tweens.add({
      targets: dummy,
      val: 1,
      duration: 700, // Slightly faster for excitement
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        this.currentPower = dummy.val;
        if (this.powerBarIndicator) {
          const xPos = barX + (barWidth - 8) * this.currentPower;
          
          this.powerBarIndicator.clear();
          this.powerBarIndicator.fillStyle(0xffffff, 1);
          this.powerBarIndicator.fillRoundedRect(xPos, barY - 6, 8, barHeight + 12, 4);
          
          glow.clear();
          glow.fillStyle(0xffffff, 0.4);
          glow.fillCircle(xPos + 4, barY + barHeight/2, 12);
        }
      }
    });

    this.controlElements.push(bg, this.powerBarIndicator, glow);
  }

  private createControls() {
    const depth = 20;
    const btnY = GAME_H - 70;
    
    if (this.role === 'batting') {
      // DEFEND BTN
      const defBg = this.scene.add.graphics();
      defBg.fillStyle(0x3b82f6, 1); // blue
      defBg.fillRoundedRect(CENTER_X - 160, btnY - 30, 140, 60, 10);
      defBg.lineStyle(4, 0x2563eb, 1);
      defBg.strokeRoundedRect(CENTER_X - 160, btnY - 30, 140, 60, 10);
      defBg.setDepth(depth);

      const defTxt = this.scene.add.text(CENTER_X - 90, btnY, "DEFEND 🛡️", {
        fontSize: "22px", color: "#ffffff", fontStyle: "bold", fontFamily: "Outfit, sans-serif"
      }).setOrigin(0.5).setDepth(depth + 1);

      const defZone = this.scene.add.zone(CENTER_X - 90, btnY, 140, 60).setInteractive({ useHandCursor: true }).setDepth(depth + 2);
      defZone.on('pointerdown', () => {
        if (!this.isControlsDisabled) {
          defBg.setAlpha(0.7);
          this.onHit('straight');
        }
      });
      defZone.on('pointerup', () => defBg.setAlpha(this.isControlsDisabled ? 0.5 : 1));
      defZone.on('pointerout', () => defBg.setAlpha(this.isControlsDisabled ? 0.5 : 1));

      // SLOG BTN
      const slogBg = this.scene.add.graphics();
      slogBg.fillStyle(0xf43f5e, 1); // red
      slogBg.fillRoundedRect(CENTER_X + 20, btnY - 30, 140, 60, 10);
      slogBg.lineStyle(4, 0xe11d48, 1);
      slogBg.strokeRoundedRect(CENTER_X + 20, btnY - 30, 140, 60, 10);
      slogBg.setDepth(depth);

      const slogTxt = this.scene.add.text(CENTER_X + 90, btnY, "SLOG 🔥", {
        fontSize: "22px", color: "#ffffff", fontStyle: "bold", fontFamily: "Outfit, sans-serif"
      }).setOrigin(0.5).setDepth(depth + 1);

      const slogZone = this.scene.add.zone(CENTER_X + 90, btnY, 140, 60).setInteractive({ useHandCursor: true }).setDepth(depth + 2);
      slogZone.on('pointerdown', () => {
        if (!this.isControlsDisabled) {
          slogBg.setAlpha(0.7);
          this.onHit('up');
        }
      });
      slogZone.on('pointerup', () => slogBg.setAlpha(this.isControlsDisabled ? 0.5 : 1));
      slogZone.on('pointerout', () => slogBg.setAlpha(this.isControlsDisabled ? 0.5 : 1));

      this.controlElements.push(defBg, defTxt, defZone, slogBg, slogTxt, slogZone);
    } else {
      // BOWL CONTROLS
      const types = [
        { id: 'fast', label: 'Fast ⚡', color: 0xf43f5e, outline: 0xbe123c, xOffset: -120 },
        { id: 'slow', label: 'Slow 🐢', color: 0x3b82f6, outline: 0x1d4ed8, xOffset: 0 },
        { id: 'spin', label: 'Spin 🌪️', color: 0xeab308, outline: 0xca8a04, xOffset: 120 }
      ] as const;

      types.forEach(t => {
        const cx = CENTER_X + t.xOffset;
        const bg = this.scene.add.graphics();
        bg.fillStyle(t.color, 1);
        bg.fillCircle(cx, btnY, 45);
        bg.lineStyle(4, t.outline, 1);
        bg.strokeCircle(cx, btnY, 45);
        bg.setDepth(depth);

        const text = this.scene.add.text(cx, btnY, t.label, {
          fontSize: "18px", color: "#ffffff", fontStyle: "bold", fontFamily: "Outfit, sans-serif"
        }).setOrigin(0.5).setDepth(depth + 1);

        const zone = this.scene.add.zone(cx, btnY, 90, 90).setInteractive({ useHandCursor: true }).setDepth(depth + 2);
        zone.on('pointerdown', () => {
          if (!this.isControlsDisabled) {
            bg.setAlpha(0.7);
            this.onBowl(t.id, this.currentPower);
          }
        });
        zone.on('pointerup', () => bg.setAlpha(this.isControlsDisabled ? 0.5 : 1));
        zone.on('pointerout', () => bg.setAlpha(this.isControlsDisabled ? 0.5 : 1));

        this.controlElements.push(bg, text, zone);
      });
    }

    this.setControlsState(true);
  }



  public updateScore(runs: number, wickets: number) {
    const runsStr = runs.toString().padStart(3, '0');
    this.runsText.setText(runsStr);
  }

  public setBestScore(score: number) {
    this.bestScoreText.setText(`BEST: ${score}`);
  }

  public setTarget(target: number) {
    this.targetText.setText(`TARGET: ${target}`);
  }

  public updateStats(balls: number, maxBalls: number) {
    this.ballsText.setText(`BALLS: ${balls}/${maxBalls}`);
  }

  public updateOverHistory(history: string[]) {
    const stripY = 160;
    const stripWidth = 6 * 40;
    const startX = CENTER_X - stripWidth / 2;
    
    for (let i = 0; i < 6; i++) {
      const box = this.overHistoryBoxes[i];
      const txt = this.overHistoryTexts[i];
      const bx = startX + i * 40;
      
      const val = history[i];
      
      box.clear();
      if (val) {
        let bgColor = 0x334155; // default slate
        let textColor = "#ffffff";
        
        if (val === '4' || val === '6') {
          bgColor = 0x10b981; // emerald
        } else if (val === 'W') {
          bgColor = 0xef4444; // red
        } else if (val === '0') {
          textColor = "#94a3b8"; // dim
        }
        
        box.fillStyle(bgColor, 1);
        box.fillRoundedRect(bx, stripY, 32, 32, 4);
        box.lineStyle(2, 0x475569, 1);
        box.strokeRoundedRect(bx, stripY, 32, 32, 4);
        
        txt.setText(val);
        txt.setColor(textColor);
      } else {
        box.fillStyle(0x1e293b, 0.8);
        box.fillRoundedRect(bx, stripY, 32, 32, 4);
        box.lineStyle(2, 0x334155, 1);
        box.strokeRoundedRect(bx, stripY, 32, 32, 4);
        
        txt.setText("-");
        txt.setColor("#94a3b8");
      }
    }
  }

  public updateStatus(msg: string, colorStr: string = "#ffffff") {
    this.statusText.setText(msg);
    this.statusText.setColor(colorStr);
  }

  public setControlsState(disabled: boolean) {
    this.isControlsDisabled = disabled;
    
    // Pause or resume power bar based on controls state
    if (this.powerBarTween) {
      if (disabled) {
        this.powerBarTween.pause();
      } else {
        this.powerBarTween.resume();
      }
    }

    this.controlElements.forEach(el => {
      // Handle graphics and texts, zone alpha doesn't matter visually but we track it
      if ('setAlpha' in el) {
        (el as Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics).setAlpha(disabled ? 0.5 : 1);
      }
    });
  }
}
