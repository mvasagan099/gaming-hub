import Phaser from "phaser";

const GAME_W = 924;
const GAME_H = 680;
const CENTER_X = GAME_W / 2;
const CENTER_Y = GAME_H / 2;

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
  private inningsText!: Phaser.GameObjects.Text;
  private wicketsText!: Phaser.GameObjects.Text;
  private runRateText!: Phaser.GameObjects.Text;
  
  // New UI
  private targetText!: Phaser.GameObjects.Text;
  private ballsText!: Phaser.GameObjects.Text;
  private overHistoryBoxes: Phaser.GameObjects.Graphics[] = [];
  private overHistoryTexts: Phaser.GameObjects.Text[] = [];
  
  // Power Bar Elements
  private powerBarIndicator?: Phaser.GameObjects.Graphics;
  private powerBarTween?: Phaser.Tweens.Tween;
  private powerBarElements: Phaser.GameObjects.GameObject[] = [];
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

    // Best Score Badge (Sleek pill) - only relevant for single player practice
    if (this.mode === "ai") {
      const bestBg = this.scene.add.graphics();
      bestBg.fillStyle(0x0f172a, 0.9); // Dark slate
      bestBg.fillRoundedRect(CENTER_X - 50, 2, 100, 20, 10);
      bestBg.lineStyle(1.5, 0xf59e0b, 0.6); // Amber glow border
      bestBg.strokeRoundedRect(CENTER_X - 50, 2, 100, 20, 10);
      bestBg.setDepth(depth + 2);
      
      this.bestScoreText = this.scene.add.text(CENTER_X, 12, "BEST: 0", {
        fontSize: "11px", color: "#f59e0b", fontStyle: "bold", fontFamily: "Outfit, sans-serif"
      }).setOrigin(0.5).setDepth(depth + 3);
    }

    // Innings pill (used in multiplayer)
    this.inningsText = this.scene.add.text(CENTER_X, 12, "INN 1", {
      fontSize: "11px", color: "#f59e0b", fontStyle: "bold", fontFamily: "Outfit, sans-serif"
    }).setOrigin(0.5).setDepth(depth + 3).setVisible(this.mode === "multiplayer");

    // Card background (Broadcast style)
    const bg = this.scene.add.graphics();
    bg.fillGradientStyle(0x1e3a8a, 0x1e3a8a, 0x0f172a, 0x0f172a, 0.92); // Blue gradient
    bg.fillRoundedRect(CENTER_X - 80, 14, 160, 60, 10);
    bg.lineStyle(2, 0x60a5fa, 0.6); // Light blue border
    bg.strokeRoundedRect(CENTER_X - 80, 14, 160, 60, 10);
    bg.setDepth(depth);

    // Runs
    this.runsText = this.scene.add.text(CENTER_X, 40, "000", {
      fontSize: "36px", fontFamily: "Outfit, sans-serif", fontStyle: "900", color: "#ffffff", stroke: "#000000", strokeThickness: 3
    }).setOrigin(0.5).setDepth(depth + 1);
    this.runsText.setShadow(0, 2, 'rgba(0,0,0,0.5)', 4, true, false);

    // Wickets (small, under the runs)
    this.wicketsText = this.scene.add.text(CENTER_X, 64, "WICKETS: 0", {
      fontSize: "12px", color: "#cbd5e1", fontStyle: "bold", fontFamily: "Outfit, sans-serif", stroke: "#000000", strokeThickness: 2
    }).setOrigin(0.5).setDepth(depth + 1);

    // Run rate (only meaningful for a live multiplayer match)
    this.runRateText = this.scene.add.text(GAME_W - 85, 68, "RR: 0.0", {
      fontSize: "12px", color: "#fbbf24", fontStyle: "bold", fontFamily: "Outfit, sans-serif", stroke: "#000000", strokeThickness: 2
    }).setOrigin(0.5).setDepth(depth + 1).setVisible(this.mode === "multiplayer");

    // Over History Strip (Sleek compact boxes under TARGET box on the top-left)
    const stripY = 68;
    const startX = 16;
    for (let i = 0; i < 6; i++) {
      const bx = startX + i * 22;
      
      const box = this.scene.add.graphics();
      box.fillStyle(0x0f172a, 0.85);
      box.fillRoundedRect(bx, stripY, 20, 20, 4);
      box.lineStyle(1.5, 0x334155, 0.8);
      box.strokeRoundedRect(bx, stripY, 20, 20, 4);
      box.setDepth(depth);
      
      const txt = this.scene.add.text(bx + 10, stripY + 10, "-", {
        fontSize: "11px", color: "#94a3b8", fontStyle: "900", fontFamily: "Outfit, sans-serif"
      }).setOrigin(0.5).setDepth(depth + 1);
      
      this.overHistoryBoxes.push(box);
      this.overHistoryTexts.push(txt);
    }

    // Status Text (e.g. Next ball in 2...)
    this.statusText = this.scene.add.text(CENTER_X, 118, this.role === 'batting' ? "Ready for First Ball!" : "Your turn to bowl!", {
      fontSize: "16px", color: COLORS.accent, fontFamily: "Outfit, sans-serif", fontStyle: "bold",
      align: "center", stroke: "#000000", strokeThickness: 3
    }).setOrigin(0.5).setDepth(depth);
    this.statusText.setShadow(0, 2, 'rgba(0,0,0,0.8)', 4, true, false);

    // Target Box (Top Left)
    const targetBg = this.scene.add.graphics();
    targetBg.fillGradientStyle(0x0f172a, 0x0f172a, 0x1e293b, 0x1e293b, 0.85);
    targetBg.fillRoundedRect(16, 14, 130, 48, 8);
    targetBg.lineStyle(1.5, 0xfbbf24, 0.5);
    targetBg.strokeRoundedRect(16, 14, 130, 48, 8);
    targetBg.setDepth(depth);

    this.targetText = this.scene.add.text(81, 38, "TARGET: --", {
      fontSize: "16px", color: "#fbbf24", fontStyle: "900", fontFamily: "Outfit, sans-serif"
    }).setOrigin(0.5).setDepth(depth + 1);

    // Balls Box (Top Right)
    const ballsBg = this.scene.add.graphics();
    ballsBg.fillGradientStyle(0x0f172a, 0x0f172a, 0x1e293b, 0x1e293b, 0.85);
    ballsBg.fillRoundedRect(GAME_W - 146, 14, 130, 48, 8);
    ballsBg.lineStyle(1.5, 0x60a5fa, 0.5);
    ballsBg.strokeRoundedRect(GAME_W - 146, 14, 130, 48, 8);
    ballsBg.setDepth(depth);

    this.ballsText = this.scene.add.text(GAME_W - 81, 38, "BALLS: 0/0", {
      fontSize: "16px", color: "#60a5fa", fontStyle: "900", fontFamily: "Outfit, sans-serif"
    }).setOrigin(0.5).setDepth(depth + 1);
  }


  private createPowerBar() {
    const barWidth = 22;
    const barHeight = 260;
    const barX = GAME_W - 55;
    const barY = 275;
    const depth = 20;

    // Power Label above bar
    const label = this.scene.add.text(barX + barWidth / 2, barY - 14, "POWER", {
      fontSize: "11px", color: "#38bdf8", fontStyle: "900", fontFamily: "Outfit, sans-serif"
    }).setOrigin(0.5).setDepth(depth + 1);

    // Bar background with glowing border
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0f172a, 0.92);
    bg.fillRoundedRect(barX - 5, barY - 5, barWidth + 10, barHeight + 10, 12);
    bg.lineStyle(2, 0x38bdf8, 0.55); // Sky blue glow border
    bg.strokeRoundedRect(barX - 5, barY - 5, barWidth + 10, barHeight + 10, 12);
    bg.setDepth(depth);

    // Gradient Power Sections (Vertical: Red top/bottom, Yellow transitions, Green sweet spot center)
    // 1. Top Red (Too strong / overhit)
    bg.fillGradientStyle(0xf43f5e, 0xf43f5e, 0x9f1239, 0x9f1239, 1);
    bg.fillRoundedRect(barX, barY, barWidth, 38, 4);

    // 2. Bottom Red (Too weak)
    bg.fillRoundedRect(barX, barY + barHeight - 38, barWidth, 38, 4);

    // 3. Yellow transition zones
    bg.fillGradientStyle(0xeab308, 0xeab308, 0x854d0e, 0x854d0e, 1);
    bg.fillRoundedRect(barX, barY + 34, barWidth, 46, 3);
    bg.fillRoundedRect(barX, barY + barHeight - 80, barWidth, 46, 3);

    // 4. Center Green Sweet Spot (Perfect timing / accuracy)
    bg.fillGradientStyle(0x22c55e, 0x22c55e, 0x166534, 0x166534, 1);
    bg.fillRoundedRect(barX, barY + 76, barWidth, barHeight - 152, 3);

    // Glowing Indicator Needle (Horizontal bar sliding up and down)
    this.powerBarIndicator = this.scene.add.graphics();
    this.powerBarIndicator.fillStyle(0xffffff, 1);
    this.powerBarIndicator.fillRoundedRect(barX - 6, barY, barWidth + 12, 6, 3);
    this.powerBarIndicator.setDepth(depth + 2);

    // Glowing halo behind indicator
    const glow = this.scene.add.graphics();
    glow.fillStyle(0xffffff, 0.4);
    glow.fillCircle(barX + barWidth / 2, barY + 3, 14);
    glow.setDepth(depth + 1);

    // Tween to move indicator up and down vertically
    const dummy = { val: 0 };
    this.powerBarTween = this.scene.tweens.add({
      targets: dummy,
      val: 1,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        this.currentPower = dummy.val;
        if (this.powerBarIndicator) {
          const yPos = barY + (barHeight - 6) * (1 - this.currentPower);

          this.powerBarIndicator.clear();
          this.powerBarIndicator.fillStyle(0xffffff, 1);
          this.powerBarIndicator.fillRoundedRect(barX - 6, yPos, barWidth + 12, 6, 3);

          glow.clear();
          glow.fillStyle(0xffffff, 0.45);
          glow.fillCircle(barX + barWidth / 2, yPos + 3, 14);
        }
      }
    });

    this.controlElements.push(bg, label, this.powerBarIndicator, glow);
    this.powerBarElements.push(bg, label, glow);
  }

  private instructionBanner?: Phaser.GameObjects.Text;
  private ballCounterText?: Phaser.GameObjects.Text;

  private createControls() {
    const depth = 20;
    const btnY = GAME_H - 42;
    
    if (this.role === 'batting') {
      // ── Direction Instruction Banner (Top Center) ──
      this.instructionBanner = this.scene.add.text(CENTER_X, 152, "STEP 2. TAP IN THE DIRECTION YOU WANT TO HIT THE BALL", {
        fontSize: "15px",
        color: "#ffffff",
        fontStyle: "bold",
        fontFamily: "Outfit, Arial, sans-serif",
        align: "center",
        stroke: "#000000",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(depth + 5);

      // Subtle pulse animation on instruction banner
      this.scene.tweens.add({
        targets: this.instructionBanner,
        scale: 1.03,
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });

      // ── Ball Count Indicator (Bottom Right: e.g. "2/3") ──
      this.ballCounterText = this.scene.add.text(GAME_W - 45, GAME_H - 35, "1/6", {
        fontSize: "26px",
        color: "#ffffff",
        fontStyle: "bold",
        fontFamily: "Outfit, Arial, sans-serif",
        stroke: "#000000",
        strokeThickness: 4
      }).setOrigin(1, 1).setDepth(depth + 5);

      // ── Stick Cricket Circular Touch Controls (Left & Right) ──
      const leftX = 125;
      const leftY = GAME_H - 200;
      const leftGfx = this.scene.add.graphics().setDepth(depth);

      const drawGlassBubble = (gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, isRight: boolean) => {
        gfx.clear();
        const r = 70;
        // Outer soft glow
        gfx.fillStyle(0xffffff, 0.08);
        gfx.fillCircle(cx, cy, r + 12);
        // Translucent dark glass body
        gfx.fillStyle(0x0f172a, 0.35);
        gfx.fillCircle(cx, cy, r);
        // Beveled glass rim
        gfx.lineStyle(4, 0xffffff, 0.45);
        gfx.strokeCircle(cx, cy, r);
        gfx.lineStyle(2, 0xffffff, 0.25);
        gfx.strokeCircle(cx, cy, r - 4);

        // Stick Cricket Batsman Silhouette inside circle
        gfx.fillStyle(0xffffff, 0.55);
        gfx.save();
        if (isRight) {
          // Right-facing silhouette
          // Head
          gfx.fillCircle(cx + 6, cy - 28, 9);
          // Torso & Bat
          gfx.fillRect(cx - 2, cy - 18, 12, 28);
          // Legs
          gfx.fillRect(cx - 8, cy + 10, 8, 26);
          gfx.fillRect(cx + 4, cy + 10, 8, 26);
          // Bat held horizontally
          gfx.fillRect(cx + 10, cy - 12, 34, 10);
        } else {
          // Left-facing silhouette
          // Head
          gfx.fillCircle(cx - 6, cy - 28, 9);
          // Torso & Bat
          gfx.fillRect(cx - 10, cy - 18, 12, 28);
          // Legs
          gfx.fillRect(cx - 12, cy + 10, 8, 26);
          gfx.fillRect(cx, cy + 10, 8, 26);
          // Bat held horizontally
          gfx.fillRect(cx - 44, cy - 12, 34, 10);
        }
        gfx.restore();
      };

      drawGlassBubble(leftGfx, leftX, leftY, false);

      const leftZone = this.scene.add.zone(leftX, leftY, 150, 150).setInteractive({ useHandCursor: true }).setDepth(depth + 2);
      leftZone.on('pointerdown', () => {
        if (!this.isControlsDisabled) {
          this.setControlsState(true);
          leftGfx.setScale(0.94);
          this.scene.time.delayedCall(120, () => leftGfx.setScale(1));
          this.onHit('left');
        }
      });
      leftZone.on('pointerup', () => leftGfx.setAlpha(this.isControlsDisabled ? 0.6 : 1));
      leftZone.on('pointerout', () => leftGfx.setAlpha(this.isControlsDisabled ? 0.6 : 1));

      // ── Right Stick Cricket Circular Button ──
      const rightX = GAME_W - 125;
      const rightY = GAME_H - 200;
      const rightGfx = this.scene.add.graphics().setDepth(depth);
      drawGlassBubble(rightGfx, rightX, rightY, true);

      const rightZone = this.scene.add.zone(rightX, rightY, 150, 150).setInteractive({ useHandCursor: true }).setDepth(depth + 2);
      rightZone.on('pointerdown', () => {
        if (!this.isControlsDisabled) {
          this.setControlsState(true);
          rightGfx.setScale(0.94);
          this.scene.time.delayedCall(120, () => rightGfx.setScale(1));
          this.onHit('right');
        }
      });
      rightZone.on('pointerup', () => rightGfx.setAlpha(this.isControlsDisabled ? 0.6 : 1));
      rightZone.on('pointerout', () => rightGfx.setAlpha(this.isControlsDisabled ? 0.6 : 1));

      // ── Pause Button (Top Right) ──
      const pauseGfx = this.scene.add.graphics().setDepth(depth + 10);
      pauseGfx.fillStyle(0x0f172a, 0.7);
      pauseGfx.fillRoundedRect(GAME_W - 60, 16, 44, 44, 8);
      pauseGfx.lineStyle(2, 0xffffff, 0.85);
      pauseGfx.strokeRoundedRect(GAME_W - 60, 16, 44, 44, 8);
      // Two white vertical bars
      pauseGfx.fillStyle(0xffffff, 1);
      pauseGfx.fillRoundedRect(GAME_W - 50, 26, 8, 24, 2);
      pauseGfx.fillRoundedRect(GAME_W - 36, 26, 8, 24, 2);

      if (this.instructionBanner) this.controlElements.push(this.instructionBanner);
      if (this.ballCounterText) this.controlElements.push(this.ballCounterText);
      this.controlElements.push(
        leftGfx, leftZone, rightGfx, rightZone, pauseGfx
      );
    } else {
      // BOWL CONTROLS
      const bowlBtnY = GAME_H - 32;
      const types = [
        { id: 'fast', label: 'Fast ⚡', color: 0xf43f5e, outline: 0xbe123c, xOffset: -180 },
        { id: 'slow', label: 'Slow 🐢', color: 0x3b82f6, outline: 0x1d4ed8, xOffset: 0 },
        { id: 'spin', label: 'Spin 🌪️', color: 0xeab308, outline: 0xca8a04, xOffset: 180 }
      ] as const;

      types.forEach(t => {
        const cx = CENTER_X + t.xOffset;
        const bg = this.scene.add.graphics();
        bg.fillStyle(t.color, 1);
        bg.fillCircle(cx, bowlBtnY, 30);
        bg.lineStyle(3, t.outline, 1);
        bg.strokeCircle(cx, bowlBtnY, 30);
        bg.setDepth(depth + 10);

        const text = this.scene.add.text(cx, bowlBtnY, t.label, {
          fontSize: "15px", color: "#ffffff", fontStyle: "bold", fontFamily: "Outfit, sans-serif"
        }).setOrigin(0.5).setDepth(depth + 11);

        const zone = this.scene.add.zone(cx, bowlBtnY, 65, 65).setInteractive({ useHandCursor: true }).setDepth(depth + 12);
        zone.on('pointerdown', () => {
          if (!this.isControlsDisabled) {
            this.setControlsState(true);
            bg.setAlpha(0.5);
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



  public updateScore(runs: number, wickets?: number) {
    const runsStr = runs.toString().padStart(3, '0');
    if (this.runsText && this.runsText.active) this.runsText.setText(runsStr);
    if (wickets != null) this.setWickets(wickets);
  }

  public setWickets(wickets: number) {
    if (this.wicketsText && this.wicketsText.active) this.wicketsText.setText(`WICKETS: ${wickets}`);
  }

  public setInnings(inning: number) {
    if (this.inningsText && this.inningsText.active) this.inningsText.setText(`INN ${inning}`);
  }

  /** Show the current overs as `completed.balls` out of the total. */
  public updateOvers(completedOvers: number, ballsInOver: number, totalOvers: number) {
    if (this.ballsText && this.ballsText.active) this.ballsText.setText(`OVERS: ${completedOvers}.${ballsInOver}/${totalOvers}`);
    if (this.ballCounterText && this.ballCounterText.active) this.ballCounterText.setText(`${ballsInOver + 1}/6`);
  }

  public setRunRate(runRate: number) {
    if (this.runRateText && this.runRateText.active) this.runRateText.setText(`RR: ${runRate.toFixed(1)}`);
  }

  public setBestScore(score: number) {
    if (this.bestScoreText && this.bestScoreText.active) this.bestScoreText.setText(`BEST: ${score}`);
  }

  public setTarget(target: number | null) {
    if (this.targetText && this.targetText.active) this.targetText.setText(target == null ? "TARGET: --" : `TARGET: ${target}`);
  }

  public updateStats(balls: number, maxBalls: number) {
    if (this.ballsText && this.ballsText.active) this.ballsText.setText(`BALLS: ${balls}/${maxBalls}`);
    if (this.ballCounterText && this.ballCounterText.active) this.ballCounterText.setText(`${Math.min(balls + 1, maxBalls)}/${maxBalls === 9999 ? 6 : maxBalls}`);
  }

  public updateOverHistory(history: string[]) {
    const stripY = 68;
    const startX = 16;
    
    for (let i = 0; i < 6; i++) {
      const box = this.overHistoryBoxes[i];
      const txt = this.overHistoryTexts[i];
      const bx = startX + i * 22;
      
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
        box.fillRoundedRect(bx, stripY, 20, 20, 4);
        box.lineStyle(1.5, 0x475569, 1);
        box.strokeRoundedRect(bx, stripY, 20, 20, 4);
        
        txt.setText(val);
        txt.setColor(textColor);
      } else {
        box.fillStyle(0x1e293b, 0.8);
        box.fillRoundedRect(bx, stripY, 20, 20, 4);
        box.lineStyle(1.5, 0x334155, 1);
        box.strokeRoundedRect(bx, stripY, 20, 20, 4);
        
        txt.setText("-");
        txt.setColor("#94a3b8");
      }
    }
  }

  public updateStatus(msg: string, colorStr: string = "#ffffff") {
    this.statusText.setText(msg);
    this.statusText.setColor(colorStr);
  }

  public getCurrentPower(): number {
    return this.currentPower;
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

  /**
   * Swap between the batting and bowling control set (used when the innings
   * flip in a multiplayer match). Recreates the relevant controls in place.
   */
  public setRole(newRole: "batting" | "bowling") {
    if (this.role === newRole) return;
    this.role = newRole;

    if (this.powerBarTween) {
      this.powerBarTween.stop();
      this.powerBarTween = undefined;
    }
    if (this.powerBarIndicator) {
      this.powerBarIndicator.destroy();
      this.powerBarIndicator = undefined;
    }
    this.powerBarElements.forEach(el => el.destroy());
    this.powerBarElements = [];

    this.controlElements.forEach(el => el.destroy());
    this.controlElements = [];

    this.isControlsDisabled = true;
    if (this.role === "bowling") {
      this.createPowerBar();
    }
    this.createControls();
  }
}
