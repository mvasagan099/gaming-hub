import Phaser from "phaser";
import type { CricketDelivery } from "@gaming-hub/game-engine";

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
  private timingText?: Phaser.GameObjects.Text;
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

  // Pitch Targeting & Bowling Controls
  private selectedDelivery: CricketDelivery = 'fast';
  private deliveryButtons: {
    id: CricketDelivery;
    bg: Phaser.GameObjects.Graphics;
    text: Phaser.GameObjects.Text;
    zone: Phaser.GameObjects.Zone;
    color: number;
    outline: number;
    cx: number;
    cy: number;
    w: number;
    h: number;
  }[] = [];
  private lockSpotBg?: Phaser.GameObjects.Graphics;
  private lockSpotText?: Phaser.GameObjects.Text;
  private lockSpotZone?: Phaser.GameObjects.Zone;
  private bowlBtnBg?: Phaser.GameObjects.Graphics;
  private bowlBtnText?: Phaser.GameObjects.Text;
  private bowlBtnZone?: Phaser.GameObjects.Zone;
  private pitchBadgeBg?: Phaser.GameObjects.Graphics;
  private pitchBadgeText?: Phaser.GameObjects.Text;
  private isLockSpotEnabled: boolean = true;
  private bowlButtonState: "disabled" | "countdown" | "ready" = "disabled";

  public onHit: (direction: 'left' | 'right' | 'up' | 'straight') => void = () => {};
  public onMoveBatter: (direction: -1 | 0 | 1) => void = () => {};
  public onMoveBatterStep: (delta: number) => void = () => {};
  public onStepOut: () => void = () => {};
  public onSelectDelivery: (delivery: CricketDelivery) => void = () => {};
  public onLockSpot: () => void = () => {};
  public onBowlPress: (power: number) => void = () => {};
  public onBowl: (type: CricketDelivery, power: number) => void = () => {};

  private creaseIndicatorGfx?: Phaser.GameObjects.Graphics;
  private creaseIndicatorText?: Phaser.GameObjects.Text;
  private creaseLockedBadge?: Phaser.GameObjects.Text;
  private isBatterMovementLocked: boolean = false;
  private currentCreaseX: number = 0;

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

  public showTiming(label: 'EARLY' | 'PERFECT' | 'GOOD' | 'LATE') {
    if (!this.timingText) {
      this.timingText = this.scene.add.text(CENTER_X, 365, '', {
        font: 'bold 24px Arial', stroke: '#090d16', strokeThickness: 5,
      }).setOrigin(0.5).setDepth(40);
    }
    this.scene.tweens.killTweensOf(this.timingText);
    this.timingText.setText(label).setY(365).setAlpha(1).setScale(0.95)
      .setColor(label === 'PERFECT' ? '#34d399' : label === 'GOOD' ? '#93c5fd' : '#fbbf24');
    this.scene.tweens.add({ targets: this.timingText, scale: 1, duration: 90, ease: 'Sine.easeOut' });
    this.scene.tweens.add({ targets: this.timingText, alpha: 0, y: 350, delay: 650, duration: 220 });
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
      bestBg.fillRoundedRect(CENTER_X - 42, 14, 84, 16, 8);
      bestBg.lineStyle(1.5, 0xf59e0b, 0.6); // Amber glow border
      bestBg.strokeRoundedRect(CENTER_X - 42, 14, 84, 16, 8);
      bestBg.setDepth(depth + 2);
      
      this.bestScoreText = this.scene.add.text(CENTER_X, 22, "BEST: 0", {
        fontSize: "9px", color: "#f59e0b", fontStyle: "bold", fontFamily: "Outfit, sans-serif"
      }).setOrigin(0.5).setDepth(depth + 3);
    }

    // Innings pill (used in multiplayer)
    this.inningsText = this.scene.add.text(CENTER_X, 22, "INN 1", {
      fontSize: "9px", color: "#f59e0b", fontStyle: "bold", fontFamily: "Outfit, sans-serif"
    }).setOrigin(0.5).setDepth(depth + 3).setVisible(this.mode === "multiplayer");

    // Card background (Broadcast style)
    const bg = this.scene.add.graphics();
    bg.fillGradientStyle(0x1e3a8a, 0x1e3a8a, 0x0f172a, 0x0f172a, 0.92); // Blue gradient
    bg.fillRoundedRect(CENTER_X - 65, 32, 130, 44, 8);
    bg.lineStyle(2, 0x60a5fa, 0.6); // Light blue border
    bg.strokeRoundedRect(CENTER_X - 65, 32, 130, 44, 8);
    bg.setDepth(depth);

    // Runs
    this.runsText = this.scene.add.text(CENTER_X, 48, "000", {
      fontSize: "25px", fontFamily: "Outfit, sans-serif", fontStyle: "900", color: "#ffffff", stroke: "#000000", strokeThickness: 2.5
    }).setOrigin(0.5).setDepth(depth + 1);
    this.runsText.setShadow(0, 2, 'rgba(0,0,0,0.5)', 4, true, false);

    // Wickets (small, under the runs)
    this.wicketsText = this.scene.add.text(CENTER_X, 65, "WICKETS: 0", {
      fontSize: "10px", color: "#cbd5e1", fontStyle: "bold", fontFamily: "Outfit, sans-serif", stroke: "#000000", strokeThickness: 1.5
    }).setOrigin(0.5).setDepth(depth + 1);

    // Run rate (only meaningful for a live multiplayer match)
    this.runRateText = this.scene.add.text(GAME_W - 91, 68, "RR: 0.0", {
      fontSize: "12px", color: "#fbbf24", fontStyle: "bold", fontFamily: "Outfit, sans-serif", stroke: "#000000", strokeThickness: 2
    }).setOrigin(0.5).setDepth(depth + 1).setVisible(this.mode === "multiplayer");

    // Over History Strip (Sleek compact boxes under TARGET box on the top-left)
    const stripY = 68;
    const startX = 26;
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
    this.statusText = this.scene.add.text(CENTER_X, 94, this.role === 'batting' ? "Ready for First Ball!" : "Your turn to bowl!", {
      fontSize: "13px", color: COLORS.accent, fontFamily: "Outfit, sans-serif", fontStyle: "bold",
      align: "center", stroke: "#000000", strokeThickness: 2.5
    }).setOrigin(0.5).setDepth(depth);
    this.statusText.setShadow(0, 2, 'rgba(0,0,0,0.8)', 4, true, false);

    // Target Box (Top Left)
    const targetBg = this.scene.add.graphics();
    targetBg.fillGradientStyle(0x0f172a, 0x0f172a, 0x1e293b, 0x1e293b, 0.85);
    targetBg.fillRoundedRect(26, 14, 130, 48, 8);
    targetBg.lineStyle(1.5, 0xfbbf24, 0.5);
    targetBg.strokeRoundedRect(26, 14, 130, 48, 8);
    targetBg.setDepth(depth);

    this.targetText = this.scene.add.text(91, 38, "TARGET: --", {
      fontSize: "16px", color: "#fbbf24", fontStyle: "900", fontFamily: "Outfit, sans-serif"
    }).setOrigin(0.5).setDepth(depth + 1);

    // Balls Box (Top Right)
    const ballsBg = this.scene.add.graphics();
    ballsBg.fillGradientStyle(0x0f172a, 0x0f172a, 0x1e293b, 0x1e293b, 0.85);
    ballsBg.fillRoundedRect(GAME_W - 156, 14, 130, 48, 8);
    ballsBg.lineStyle(1.5, 0x60a5fa, 0.5);
    ballsBg.strokeRoundedRect(GAME_W - 156, 14, 130, 48, 8);
    ballsBg.setDepth(depth);

    this.ballsText = this.scene.add.text(GAME_W - 91, 38, "BALLS: 0/0", {
      fontSize: "16px", color: "#60a5fa", fontStyle: "900", fontFamily: "Outfit, sans-serif"
    }).setOrigin(0.5).setDepth(depth + 1);
  }


  private createPowerBar() {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const barWidth = 8;
    const barHeight = 220;
    const barX = isMobile ? (CENTER_X + 120) : (CENTER_X + 235);
    const barY = 280;
    const depth = 20;

    // Power Label above bar
    const label = this.scene.add.text(barX + barWidth / 2, barY - 11, "POWER", {
      fontSize: "9px", color: "#38bdf8", fontStyle: "900", fontFamily: "Outfit, sans-serif"
    }).setOrigin(0.5).setDepth(depth + 1);

    // Bar background with glowing border
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0f172a, 0.92);
    bg.fillRoundedRect(barX - 3, barY - 3, barWidth + 6, barHeight + 6, 6);
    bg.lineStyle(1.5, 0x38bdf8, 0.6); // Sky blue glow border
    bg.strokeRoundedRect(barX - 3, barY - 3, barWidth + 6, barHeight + 6, 6);
    bg.setDepth(depth);

    // Gradient Power Sections (Vertical: Red top/bottom, Yellow transitions, Green sweet spot center)
    // 1. Top Red (Too strong / overhit)
    bg.fillGradientStyle(0xf43f5e, 0xf43f5e, 0x9f1239, 0x9f1239, 1);
    bg.fillRoundedRect(barX, barY, barWidth, 34, 2);

    // 2. Bottom Red (Too weak)
    bg.fillRoundedRect(barX, barY + barHeight - 34, barWidth, 34, 2);

    // 3. Yellow transition zones
    bg.fillGradientStyle(0xeab308, 0xeab308, 0x854d0e, 0x854d0e, 1);
    bg.fillRoundedRect(barX, barY + 30, barWidth, 42, 2);
    bg.fillRoundedRect(barX, barY + barHeight - 72, barWidth, 42, 2);

    // 4. Center Green Sweet Spot (Perfect timing / accuracy)
    bg.fillGradientStyle(0x22c55e, 0x22c55e, 0x166534, 0x166534, 1);
    bg.fillRoundedRect(barX, barY + 68, barWidth, barHeight - 136, 2);

    // Glowing Indicator Needle (Horizontal bar sliding up and down)
    this.powerBarIndicator = this.scene.add.graphics();
    this.powerBarIndicator.fillStyle(0xffffff, 1);
    this.powerBarIndicator.fillRoundedRect(barX - 4, barY, barWidth + 8, 4, 2);
    this.powerBarIndicator.setDepth(depth + 2);

    // Glowing halo behind indicator
    const glow = this.scene.add.graphics();
    glow.fillStyle(0xffffff, 0.4);
    glow.fillCircle(barX + barWidth / 2, barY + 2, 8);
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
          const yPos = barY + (barHeight - 4) * (1 - this.currentPower);

          // Geometry is static; translate it instead of rebuilding it every frame.
          this.powerBarIndicator.setY(yPos - barY);
          glow.setY(yPos - barY);
        }
      }
    });

    this.controlElements.push(bg, label, this.powerBarIndicator, glow);
    this.powerBarElements.push(bg, label, glow);
  }

  private ballCounterText?: Phaser.GameObjects.Text;

  private createControls() {
    const depth = 20;
    const btnY = GAME_H - 42;
    
    if (this.role === 'batting') {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

      // ── Ball Count Indicator (Bottom Right: e.g. "2/3") ──
      this.ballCounterText = this.scene.add.text(GAME_W - 55, GAME_H - 24, "1/6", {
        fontSize: "18px",
        color: "#ffffff",
        fontStyle: "bold",
        fontFamily: "Outfit, Arial, sans-serif",
        stroke: "#000000",
        strokeThickness: 3
      }).setOrigin(0.5, 0.5).setDepth(depth + 5).setVisible(!isMobile);

      // ── Row 1: Distinct Shot Action Buttons (Separated from movement) ──
      const shotRowY = GAME_H - 66;
      const shots: { id: 'left' | 'straight' | 'right' | 'up'; label: string; sub: string; color: number; stroke: number; cx: number; w: number }[] = [
        { id: 'left', label: '◀ DRIVE', sub: '(Q)', color: 0x0284c7, stroke: 0x38bdf8, cx: CENTER_X - 152, w: 88 },
        { id: 'straight', label: 'STRAIGHT ⬆', sub: '(S/Space)', color: 0x059669, stroke: 0x34d399, cx: CENTER_X - 52, w: 96 },
        { id: 'right', label: 'PULL ▶', sub: '(E)', color: 0xd97706, stroke: 0xfbbf24, cx: CENTER_X + 52, w: 88 },
        { id: 'up', label: 'LOFT 🚀', sub: '(W)', color: 0x9333ea, stroke: 0xc084fc, cx: CENTER_X + 152, w: 88 },
      ];

      shots.forEach(s => {
        const bg = this.scene.add.graphics().setDepth(depth + 2);
        const drawBtn = (isPressed: boolean = false) => {
          bg.clear();
          bg.fillStyle(isPressed ? s.stroke : s.color, isPressed ? 0.95 : 0.75);
          bg.fillRoundedRect(s.cx - s.w / 2, shotRowY - 16, s.w, 32, 6);
          bg.lineStyle(1.5, s.stroke, 0.85);
          bg.strokeRoundedRect(s.cx - s.w / 2, shotRowY - 16, s.w, 32, 6);
        };
        drawBtn();

        const mainText = this.scene.add.text(s.cx, shotRowY - (isMobile ? 0 : 3), s.label, {
          fontSize: isMobile ? "11px" : "12px",
          color: "#ffffff",
          fontStyle: "bold",
          fontFamily: "Outfit, Arial, sans-serif"
        }).setOrigin(0.5).setDepth(depth + 3);

        const subText = this.scene.add.text(s.cx, shotRowY + 9, s.sub, {
          fontSize: "9px",
          color: "#cbd5e1",
          fontFamily: "Outfit, Arial, sans-serif"
        }).setOrigin(0.5).setDepth(depth + 3).setVisible(!isMobile);

        const zone = this.scene.add.zone(s.cx, shotRowY, s.w, 34).setInteractive({ useHandCursor: true }).setDepth(depth + 4);
        zone.on('pointerdown', () => {
          if (!this.isControlsDisabled) {
            this.setControlsState(true);
            drawBtn(true);
            this.scene.time.delayedCall(120, () => drawBtn(false));
            this.onHit(s.id);
          }
        });
        zone.on('pointerup', () => drawBtn(false));
        zone.on('pointerout', () => drawBtn(false));

        this.controlElements.push(bg, mainText, subText, zone);
      });

      // ── Row 2: Batter Crease Movement & Live Indicator ──
      const moveRowY = GAME_H - 24;
      const moveBtnW = 86;
      const moveBtnH = 26;

      // ◀ MOVE LEFT Button
      const leftMoveBg = this.scene.add.graphics().setDepth(depth + 2);
      const drawLeftMove = (pressed: boolean = false) => {
        leftMoveBg.clear();
        leftMoveBg.fillStyle(pressed ? 0x0284c7 : 0x0f172a, pressed ? 0.9 : 0.7);
        leftMoveBg.fillRoundedRect(CENTER_X - 150 - moveBtnW / 2, moveRowY - moveBtnH / 2, moveBtnW, moveBtnH, 5);
        leftMoveBg.lineStyle(1.5, pressed ? 0x38bdf8 : 0x475569, 0.85);
        leftMoveBg.strokeRoundedRect(CENTER_X - 150 - moveBtnW / 2, moveRowY - moveBtnH / 2, moveBtnW, moveBtnH, 5);
      };
      drawLeftMove();

      const leftMoveText = this.scene.add.text(CENTER_X - 150, moveRowY, "◀ MOVE", {
        fontSize: "11px",
        color: "#38bdf8",
        fontStyle: "bold",
        fontFamily: "Outfit, Arial, sans-serif"
      }).setOrigin(0.5).setDepth(depth + 3);

      let leftMoveTimer: Phaser.Time.TimerEvent | undefined;
      const leftMoveZone = this.scene.add.zone(CENTER_X - 150, moveRowY, moveBtnW, moveBtnH).setInteractive({ useHandCursor: true }).setDepth(depth + 4);
      leftMoveZone.on('pointerdown', () => {
        if (!this.isControlsDisabled && !this.isBatterMovementLocked) {
          drawLeftMove(true);
          this.onMoveBatterStep(-0.10);
          this.onMoveBatter(-1);
        }
      });
      const stopLeftMove = () => {
        drawLeftMove(false);
        this.onMoveBatter(0);
        if (leftMoveTimer) {
          leftMoveTimer.remove();
          leftMoveTimer = undefined;
        }
      };
      leftMoveZone.on('pointerup', stopLeftMove);
      leftMoveZone.on('pointerout', stopLeftMove);

      // ▶ MOVE RIGHT Button
      const rightMoveBg = this.scene.add.graphics().setDepth(depth + 2);
      const drawRightMove = (pressed: boolean = false) => {
        rightMoveBg.clear();
        rightMoveBg.fillStyle(pressed ? 0x0284c7 : 0x0f172a, pressed ? 0.9 : 0.7);
        rightMoveBg.fillRoundedRect(CENTER_X + 150 - moveBtnW / 2, moveRowY - moveBtnH / 2, moveBtnW, moveBtnH, 5);
        rightMoveBg.lineStyle(1.5, pressed ? 0x38bdf8 : 0x475569, 0.85);
        rightMoveBg.strokeRoundedRect(CENTER_X + 150 - moveBtnW / 2, moveRowY - moveBtnH / 2, moveBtnW, moveBtnH, 5);
      };
      drawRightMove();

      const rightMoveText = this.scene.add.text(CENTER_X + 150, moveRowY, "MOVE ▶", {
        fontSize: "11px",
        color: "#38bdf8",
        fontStyle: "bold",
        fontFamily: "Outfit, Arial, sans-serif"
      }).setOrigin(0.5).setDepth(depth + 3);

      let rightMoveTimer: Phaser.Time.TimerEvent | undefined;
      const rightMoveZone = this.scene.add.zone(CENTER_X + 150, moveRowY, moveBtnW, moveBtnH).setInteractive({ useHandCursor: true }).setDepth(depth + 4);
      rightMoveZone.on('pointerdown', () => {
        if (!this.isControlsDisabled && !this.isBatterMovementLocked) {
          drawRightMove(true);
          this.onMoveBatterStep(0.10);
          this.onMoveBatter(1);
        }
      });
      const stopRightMove = () => {
        drawRightMove(false);
        this.onMoveBatter(0);
        if (rightMoveTimer) {
          rightMoveTimer.remove();
          rightMoveTimer = undefined;
        }
      };
      rightMoveZone.on('pointerup', stopRightMove);
      rightMoveZone.on('pointerout', stopRightMove);

      // ── Crease Guide Indicator Track: |----●----| ──
      this.creaseIndicatorGfx = this.scene.add.graphics().setDepth(depth + 2);
      this.creaseIndicatorText = this.scene.add.text(CENTER_X, moveRowY - 8, "CREASE: 0.00", {
        fontSize: "10px",
        color: "#94a3b8",
        fontStyle: "bold",
        fontFamily: "Outfit, Arial, sans-serif"
      }).setOrigin(0.5, 1).setDepth(depth + 3);

      this.creaseLockedBadge = this.scene.add.text(CENTER_X, moveRowY, "CREASE LOCKED", {
        fontSize: "10px",
        color: "#ef4444",
        fontStyle: "bold",
        fontFamily: "Outfit, Arial, sans-serif"
      }).setOrigin(0.5).setDepth(depth + 4).setVisible(false);

      this.drawCreaseIndicator(0, false);

      // ── Pause Button (Top Right) ──
      const pauseGfx = this.scene.add.graphics().setDepth(depth + 10);
      pauseGfx.fillStyle(0x0f172a, 0.7);
      pauseGfx.fillRoundedRect(GAME_W - 60, 16, 44, 44, 8);
      pauseGfx.lineStyle(2, 0xffffff, 0.85);
      pauseGfx.strokeRoundedRect(GAME_W - 60, 16, 44, 44, 8);
      pauseGfx.fillStyle(0xffffff, 1);
      pauseGfx.fillRoundedRect(GAME_W - 50, 26, 8, 24, 2);
      pauseGfx.fillRoundedRect(GAME_W - 36, 26, 8, 24, 2);

      if (this.ballCounterText) this.controlElements.push(this.ballCounterText);
      this.controlElements.push(
        leftMoveBg, leftMoveText, leftMoveZone,
        rightMoveBg, rightMoveText, rightMoveZone,
        this.creaseIndicatorGfx, this.creaseIndicatorText, this.creaseLockedBadge,
        pauseGfx
      );
    } else {
      // BOWL CONTROLS WITH DELIVERY SELECTION, PITCH TARGET LOCK, AND BOWL CONFIRMATION
      const row1Y = GAME_H - 68;
      const row2Y = GAME_H - 26;

      const types: { id: CricketDelivery; label: string; color: number; outline: number }[] = [
        { id: 'fast', label: 'FAST ⚡', color: 0xef4444, outline: 0xb91c1c },
        { id: 'slow', label: 'SLOW 🐢', color: 0x3b82f6, outline: 0x1d4ed8 },
        { id: 'spin', label: 'SPIN 🌪️', color: 0xeab308, outline: 0xa16207 },
        { id: 'yorker', label: 'YORKER 🎯', color: 0x10b981, outline: 0x047857 },
        { id: 'bouncer', label: 'BOUNCER 💥', color: 0xf97316, outline: 0xc2410c },
        { id: 'swing', label: 'SWING 🌀', color: 0xa855f7, outline: 0x7e22ce },
      ];

      const btnW = 72;
      const btnH = 26;
      const totalW = types.length * (btnW + 8) - 8;
      const startX = CENTER_X - totalW / 2 + btnW / 2;

      this.deliveryButtons = [];

      types.forEach((t, i) => {
        const cx = startX + i * (btnW + 8);
        const bg = this.scene.add.graphics();
        bg.setDepth(depth + 10);

        const text = this.scene.add.text(cx, row1Y, t.label, {
          fontSize: "11px", color: "#ffffff", fontStyle: "bold", fontFamily: "Outfit, sans-serif"
        }).setOrigin(0.5).setDepth(depth + 11);

        const zone = this.scene.add.zone(cx, row1Y, btnW, btnH).setInteractive({ useHandCursor: true }).setDepth(depth + 12);
        zone.on('pointerdown', () => {
          if (!this.isControlsDisabled) {
            this.setSelectedDelivery(t.id);
            this.onSelectDelivery(t.id);
          }
        });

        this.deliveryButtons.push({ id: t.id, bg, text, zone, color: t.color, outline: t.outline, cx, cy: row1Y, w: btnW, h: btnH });
        this.controlElements.push(bg, text, zone);
      });

      this.redrawDeliveryButtons();

      // Row 2: Pitch Info Badge + LOCK SPOT Button + BOWL Button
      // Pitch Info Badge
      this.pitchBadgeBg = this.scene.add.graphics().setDepth(depth + 10);
      this.pitchBadgeText = this.scene.add.text(CENTER_X - 160, row2Y, "TAP PITCH TO SET SPOT", {
        fontSize: "11px", color: "#38bdf8", fontStyle: "bold", fontFamily: "Outfit, sans-serif"
      }).setOrigin(0.5).setDepth(depth + 11);
      this.setPitchBadge("TAP PITCH TO SET SPOT", "#38bdf8");
      this.controlElements.push(this.pitchBadgeBg, this.pitchBadgeText);

      // LOCK SPOT Button
      this.lockSpotBg = this.scene.add.graphics().setDepth(depth + 10);
      this.lockSpotText = this.scene.add.text(CENTER_X, row2Y, "LOCK SPOT 🎯", {
        fontSize: "12px", color: "#ffffff", fontStyle: "bold", fontFamily: "Outfit, sans-serif"
      }).setOrigin(0.5).setDepth(depth + 11);
      this.lockSpotZone = this.scene.add.zone(CENTER_X, row2Y, 110, 34).setInteractive({ useHandCursor: true }).setDepth(depth + 12);
      this.lockSpotZone.on('pointerdown', () => {
        if (!this.isControlsDisabled && this.isLockSpotEnabled) {
          this.onLockSpot();
        }
      });
      this.controlElements.push(this.lockSpotBg, this.lockSpotText, this.lockSpotZone);
      this.setLockSpotEnabled(true);

      // BOWL Button
      this.bowlBtnBg = this.scene.add.graphics().setDepth(depth + 10);
      this.bowlBtnText = this.scene.add.text(CENTER_X + 130, row2Y, "BOWL 🏏", {
        fontSize: "13px", color: "#ffffff", fontStyle: "bold", fontFamily: "Outfit, sans-serif"
      }).setOrigin(0.5).setDepth(depth + 11);
      this.bowlBtnZone = this.scene.add.zone(CENTER_X + 130, row2Y, 110, 34).setInteractive({ useHandCursor: true }).setDepth(depth + 12);
      this.bowlBtnZone.on('pointerdown', () => {
        if (!this.isControlsDisabled && this.bowlButtonState === "ready") {
          this.setControlsState(true);
          this.onBowlPress(this.currentPower);
          this.onBowl(this.selectedDelivery, this.currentPower);
        }
      });
      this.controlElements.push(this.bowlBtnBg, this.bowlBtnText, this.bowlBtnZone);
      this.setBowlButtonState("disabled");
    }

    this.setControlsState(true);
  }

  private drawCreaseIndicator(x: number, locked: boolean) {
    if (!this.creaseIndicatorGfx) return;
    const gfx = this.creaseIndicatorGfx;
    gfx.clear();

    const trackW = 120;
    const trackH = 10;
    const cy = GAME_H - 24;
    const leftX = CENTER_X - trackW / 2;
    const rightX = CENTER_X + trackW / 2;

    // Background track
    gfx.fillStyle(locked ? 0x1e1b2e : 0x0f172a, 0.8);
    gfx.fillRoundedRect(leftX, cy - trackH / 2, trackW, trackH, 5);
    gfx.lineStyle(1.2, locked ? 0xef4444 : 0x334155, 0.9);
    gfx.strokeRoundedRect(leftX, cy - trackH / 2, trackW, trackH, 5);

    // Stumps markers (vertical ticks): Off (-0.75), Middle (0.0), Leg (+0.75)
    gfx.lineStyle(1.5, 0x64748b, 0.6);
    gfx.lineBetween(leftX + 8, cy - 4, leftX + 8, cy + 4); // off
    gfx.lineBetween(CENTER_X, cy - 4, CENTER_X, cy + 4); // middle
    gfx.lineBetween(rightX - 8, cy - 4, rightX - 8, cy + 4); // leg

    // Batter dot / pill
    const clampedX = Math.max(-0.75, Math.min(0.75, x));
    const dotX = CENTER_X + (clampedX / 0.75) * (trackW / 2 - 10);
    const dotColor = locked ? 0xef4444 : 0x38bdf8;
    const glowColor = locked ? 0xf87171 : 0x0284c7;

    // Glow
    gfx.fillStyle(glowColor, 0.25);
    gfx.fillCircle(dotX, cy, 7);
    // Body
    gfx.fillStyle(dotColor, 1);
    gfx.fillCircle(dotX, cy, 4);
    // Core highlight
    gfx.fillStyle(0xffffff, 0.9);
    gfx.fillCircle(dotX, cy, 1.8);
  }

  public updateCreaseIndicator(x: number, locked: boolean) {
    this.currentCreaseX = x;
    this.isBatterMovementLocked = locked;
    this.drawCreaseIndicator(x, locked);

    if (this.creaseIndicatorText) {
      if (locked) {
        this.creaseIndicatorText.setText("CREASE LOCKED").setColor("#ef4444");
      } else {
        const sign = x > 0.03 ? "+" : "";
        const zoneStr = x < -0.25 ? " (OFF)" : x > 0.25 ? " (LEG)" : " (MID)";
        this.creaseIndicatorText.setText(`CREASE: ${sign}${x.toFixed(2)}${zoneStr}`).setColor("#38bdf8");
      }
    }
  }

  public setSelectedDelivery(delivery: CricketDelivery) {
    this.selectedDelivery = delivery;
    this.redrawDeliveryButtons();
  }

  public getSelectedDelivery(): CricketDelivery {
    return this.selectedDelivery;
  }

  private redrawDeliveryButtons() {
    this.deliveryButtons.forEach(btn => {
      btn.bg.clear();
      const isSelected = btn.id === this.selectedDelivery;
      btn.bg.fillStyle(isSelected ? btn.color : 0x1e293b, isSelected ? 1 : 0.85);
      btn.bg.fillRoundedRect(btn.cx - btn.w / 2, btn.cy - btn.h / 2, btn.w, btn.h, 6);
      btn.bg.lineStyle(isSelected ? 2.5 : 1, isSelected ? 0xffffff : btn.outline, isSelected ? 1 : 0.6);
      btn.bg.strokeRoundedRect(btn.cx - btn.w / 2, btn.cy - btn.h / 2, btn.w, btn.h, 6);
      btn.text.setColor(isSelected ? "#ffffff" : "#94a3b8");
    });
  }

  public setPitchBadge(text: string, colorStr: string = "#38bdf8") {
    if (!this.pitchBadgeText || !this.pitchBadgeBg) return;
    this.pitchBadgeText.setText(text);
    this.pitchBadgeText.setColor(colorStr);
    this.pitchBadgeBg.clear();
    this.pitchBadgeBg.fillStyle(0x0f172a, 0.85);
    this.pitchBadgeBg.fillRoundedRect(CENTER_X - 255, GAME_H - 43, 190, 34, 6);
    this.pitchBadgeBg.lineStyle(1.5, 0x334155, 0.8);
    this.pitchBadgeBg.strokeRoundedRect(CENTER_X - 255, GAME_H - 43, 190, 34, 6);
  }

  public setLockSpotEnabled(enabled: boolean) {
    this.isLockSpotEnabled = enabled;
    if (!this.lockSpotBg || !this.lockSpotText) return;
    this.lockSpotBg.clear();
    const bgColor = enabled ? 0x06b6d4 : 0x334155;
    const strokeColor = enabled ? 0x22d3ee : 0x475569;
    this.lockSpotBg.fillStyle(bgColor, enabled ? 1 : 0.5);
    this.lockSpotBg.fillRoundedRect(CENTER_X - 55, GAME_H - 43, 110, 34, 6);
    this.lockSpotBg.lineStyle(1.5, strokeColor, enabled ? 1 : 0.5);
    this.lockSpotBg.strokeRoundedRect(CENTER_X - 55, GAME_H - 43, 110, 34, 6);
    this.lockSpotText.setAlpha(enabled ? 1 : 0.5);
  }

  public setBowlButtonState(state: "disabled" | "countdown" | "ready", countdownSec?: number) {
    this.bowlButtonState = state;
    if (!this.bowlBtnBg || !this.bowlBtnText) return;
    this.bowlBtnBg.clear();
    if (state === "ready") {
      this.bowlBtnBg.fillStyle(0x10b981, 1);
      this.bowlBtnBg.fillRoundedRect(CENTER_X + 75, GAME_H - 43, 110, 34, 6);
      this.bowlBtnBg.lineStyle(2, 0x34d399, 1);
      this.bowlBtnBg.strokeRoundedRect(CENTER_X + 75, GAME_H - 43, 110, 34, 6);
      this.bowlBtnText.setText("BOWL 🏏").setColor("#ffffff").setAlpha(1);
    } else if (state === "countdown") {
      this.bowlBtnBg.fillStyle(0x334155, 0.8);
      this.bowlBtnBg.fillRoundedRect(CENTER_X + 75, GAME_H - 43, 110, 34, 6);
      this.bowlBtnBg.lineStyle(1.5, 0xfbbf24, 0.8);
      this.bowlBtnBg.strokeRoundedRect(CENTER_X + 75, GAME_H - 43, 110, 34, 6);
      const cd = countdownSec != null ? `${countdownSec.toFixed(1)}s` : "...";
      this.bowlBtnText.setText(`REVEAL ${cd}`).setColor("#fbbf24").setAlpha(1);
    } else {
      this.bowlBtnBg.fillStyle(0x1e293b, 0.5);
      this.bowlBtnBg.fillRoundedRect(CENTER_X + 75, GAME_H - 43, 110, 34, 6);
      this.bowlBtnBg.lineStyle(1.5, 0x334155, 0.4);
      this.bowlBtnBg.strokeRoundedRect(CENTER_X + 75, GAME_H - 43, 110, 34, 6);
    }
  }

  public getBowlButtonState(): "disabled" | "countdown" | "ready" {
    return this.bowlButtonState;
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
