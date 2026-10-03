import Phaser from "phaser";
import { LudoEvents } from "../events/LudoEvents";
import type { PlayerColor } from "../types/ludo.types";
import { LUDO_DESIGN_CONFIG, animDuration, prefersReducedMotion } from "../constants";

const PANEL_X = 1080;
const PANEL_W = 560;
const PANEL_H = 800;

const ORDERED_COLORS: PlayerColor[] = ["red", "blue", "green", "yellow"];

interface PlayerCardUI {
  container: Phaser.GameObjects.Container;
  cardBg: Phaser.GameObjects.Graphics;
  avatarRing: Phaser.GameObjects.Graphics;
  avatarGlow: Phaser.GameObjects.Graphics;
  avatarDot: Phaser.GameObjects.Arc;
  nameText: Phaser.GameObjects.Text;
  progressText: Phaser.GameObjects.Text;
  tokenPips: Phaser.GameObjects.Arc[];
  tokenCountText: Phaser.GameObjects.Text;
  color: PlayerColor;
  activeTween?: Phaser.Tweens.Tween;
  geom: { w: number; h: number; avatarX: number };
}

export default class HUDManager {
  private scene: Phaser.Scene;
  private isPortrait = false;
  private turnBannerContainer!: Phaser.GameObjects.Container;
  private turnBannerBg!: Phaser.GameObjects.Graphics;
  private turnBannerText!: Phaser.GameObjects.Text;
  private turnSubText!: Phaser.GameObjects.Text;

  private selectionBannerContainer!: Phaser.GameObjects.Container;
  private selectionBannerText!: Phaser.GameObjects.Text;

  private playerCards: PlayerCardUI[] = [];
  private activeColors: PlayerColor[] = ["red", "green"];
  private logLines: Phaser.GameObjects.Text[] = [];
  private currentTurnIndex = 0;
  private totalPlayers = 4;
  private mySeat = 0;

  private soundOn = true;
  private onSoundToggle: (() => void) | null = null;
  private soundBtnContainer!: Phaser.GameObjects.Container;
  private soundBtnGfx!: Phaser.GameObjects.Graphics;
  private soundIconText!: Phaser.GameObjects.Text;

  private static readonly MAX_LOG = 6;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(totalPlayers = 4, isPortrait = false, activeColors?: PlayerColor[]): void {
    this.totalPlayers = totalPlayers;
    this.isPortrait = isPortrait;
    this.activeColors = activeColors && activeColors.length >= totalPlayers
      ? [...activeColors]
      : (totalPlayers === 2 ? ["red", "green"] : ["red", "blue", "green", "yellow"]);
    const depth = 10;

    if (isPortrait) {
      // ═════════════════════════════════════════════════════════════════════
      // PORTRAIT MOBILE HUD (Canvas: 720 x 1080)
      // ═════════════════════════════════════════════════════════════════════
      // 1. Top Title & Header
      this.scene.add.text(360, 18, "LUDO CHAMPION", {
        fontSize: "16px",
        color: "#f59e0b",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(depth + 1);

      // Sound button top-right
      this.createSoundToggle(depth, 670, 20);

      // Turn Banner at top
      this.createTurnBanner(depth, 360, 52, 420, 42);

      // Token selection prompt
      this.createSelectionBanner(360, 52, 420, 42);

      // Player cards across top (y: 96)
      this.createPlayerCardsPortrait(totalPlayers, depth);

      // Bottom Control Deck (y: 826..1060)
      const deckBg = this.scene.add.graphics();
      deckBg.setDepth(depth);

      // Deck background slab with modern layered glass
      deckBg.fillStyle(0x000000, 0.55);
      deckBg.fillRoundedRect(20, 830, 680, 230, 18);
      deckBg.fillStyle(0x080d1a, 0.98);
      deckBg.fillRoundedRect(20, 826, 680, 230, 18);

      // Top glass highlight line
      deckBg.fillStyle(0x38bdf8, 0.35);
      deckBg.fillRoundedRect(20, 826, 680, 2, { tl: 18, tr: 18, bl: 0, br: 0 });

      deckBg.lineStyle(1.8, 0x1e2d4d, 0.9);
      deckBg.strokeRoundedRect(20, 826, 680, 230, 18);

      // Dice Area Title
      this.scene.add.text(182, 844, "✦ DICE CONTROLLER ✦", {
        fontSize: "12px",
        color: "#94a3b8",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        letterSpacing: 1.5,
      }).setOrigin(0.5).setDepth(depth + 1);

      // Action Log Title
      this.scene.add.text(518, 844, "● ACTION LOG", {
        fontSize: "12px",
        color: "#38bdf8",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        letterSpacing: 1.5,
      }).setOrigin(0.5).setDepth(depth + 1);

      // Inset Action Log Box
      const logGfx = this.scene.add.graphics();
      logGfx.setDepth(depth);
      logGfx.fillStyle(0x060a14, 0.96);
      logGfx.fillRoundedRect(355, 860, 325, 184, 12);
      logGfx.lineStyle(1.5, 0x1e2d4d, 0.85);
      logGfx.strokeRoundedRect(355, 860, 325, 184, 12);

      for (let i = 0; i < HUDManager.MAX_LOG; i++) {
        const t = this.scene.add.text(
          368,
          874 + i * 26,
          "",
          {
            fontSize: "12px",
            color: i === 0 ? "#38bdf8" : "#94a3b8",
            fontFamily: "Outfit, sans-serif",
            wordWrap: { width: 300 },
          },
        ).setDepth(depth + 1);
        this.logLines.push(t);
      }

    } else {
      // ═════════════════════════════════════════════════════════════════════
      // LANDSCAPE DESKTOP HUD (Canvas: 1360 x 800)
      // ═════════════════════════════════════════════════════════════════════
      // 1. Sidebar Background Panel (x: 800..1360, width 560, center 1080)
      const bg = this.scene.add.graphics();
      bg.setDepth(depth);

      // Deep panel shadow to the left
      bg.fillStyle(0x000000, 0.55);
      bg.fillRect(PANEL_X - PANEL_W / 2 - 8, 0, 8, PANEL_H);

      // Deep obsidian-indigo glass slab
      bg.fillStyle(0x080d1a, 0.98);
      bg.fillRect(PANEL_X - PANEL_W / 2, 0, PANEL_W, PANEL_H);

      // Subtle top ambient spotlight wash
      bg.fillStyle(0x131d3d, 0.45);
      bg.fillRect(PANEL_X - PANEL_W / 2, 0, PANEL_W, 220);

      // Soft ambient warm glow behind title
      bg.fillStyle(0xf59e0b, 0.035);
      bg.fillCircle(PANEL_X, 36, 160);

      // Luminous left divider neon pinstripe
      bg.lineStyle(4, 0x6366f1, 0.18);
      bg.lineBetween(PANEL_X - PANEL_W / 2, 0, PANEL_X - PANEL_W / 2, PANEL_H);

      bg.lineStyle(2, 0x818cf8, 0.7);
      bg.lineBetween(PANEL_X - PANEL_W / 2, 0, PANEL_X - PANEL_W / 2, 400);

      bg.lineStyle(1.5, 0x1e2d4d, 0.85);
      bg.lineBetween(PANEL_X - PANEL_W / 2, 400, PANEL_X - PANEL_W / 2, PANEL_H);

      // 2. Game Title & Header (Centered in 560px panel)
      this.scene.add.text(PANEL_X, 13, "★ CLASSIC 4-WAY ARENA ★", {
        fontSize: "10.5px",
        color: "#38bdf8",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        letterSpacing: 3,
      }).setOrigin(0.5).setDepth(depth + 1);

      this.scene.add.text(PANEL_X, 33, "LUDO CHAMPION", {
        fontSize: "25px",
        color: "#fbbf24",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        letterSpacing: 2.5,
        shadow: {
          offsetX: 0,
          offsetY: 2,
          color: "#f59e0b66",
          blur: 14,
          fill: true,
        },
      }).setOrigin(0.5).setDepth(depth + 1);

      // 3. Sound Toggle Button (Positioned at panel right margin)
      this.createSoundToggle(depth, PANEL_X + 235, 28);

      // 4. Modern Floating Turn Banner (Centered, exactly 490px wide)
      this.createTurnBanner(depth, PANEL_X, 74, 490, 52);

      // 5. Floating Token Selection Prompt
      this.createSelectionBanner(400, 36, 360, 42);

      // 6. Modern Player HUD Cards
      this.createPlayerCardsLandscape(totalPlayers, depth);

      // 7. Compact Action Log Panel
      this.createActionLogLandscape(totalPlayers, depth);
    }
  }

  // ─── Sound Toggle ────────────────────────────────────────────────────────────

  private createSoundToggle(depth: number, btnX: number, btnY: number): void {
    this.soundBtnGfx = this.scene.add.graphics();
    this.drawSoundBtn(true);

    const hit = this.scene.add.circle(0, 0, 18, 0xffffff, 0);
    hit.setInteractive({ useHandCursor: true });
    hit.on("pointerdown", () => {
      this.soundOn = !this.soundOn;
      this.drawSoundBtn(this.soundOn);
      this.onSoundToggle?.();
    });

    this.soundBtnContainer = this.scene.add.container(btnX, btnY, [
      this.soundBtnGfx,
      hit,
    ]);
    this.soundBtnContainer.setDepth(depth + 2);
  }

  private drawSoundBtn(active: boolean): void {
    this.soundBtnGfx.clear();
    // Glass base
    this.soundBtnGfx.fillStyle(0x0f172a, 0.95);
    this.soundBtnGfx.fillCircle(0, 0, 16);
    this.soundBtnGfx.lineStyle(1.8, active ? 0xf59e0b : 0x475569, 0.9);
    this.soundBtnGfx.strokeCircle(0, 0, 16);

    // Vector speaker cone
    const iconColor = active ? 0xe2e8f0 : 0x64748b;
    this.soundBtnGfx.fillStyle(iconColor, 1);
    this.soundBtnGfx.fillRect(-8, -4, 4, 8);
    this.soundBtnGfx.fillTriangle(-4, -4, 0, -8, 0, 8);
    this.soundBtnGfx.fillRect(-4, -4, 2, 8);

    if (active) {
      this.soundBtnGfx.lineStyle(1.8, iconColor, 0.9);
      this.soundBtnGfx.beginPath();
      this.soundBtnGfx.arc(1, 0, 6, -Math.PI / 3.5, Math.PI / 3.5, false);
      this.soundBtnGfx.strokePath();
      this.soundBtnGfx.beginPath();
      this.soundBtnGfx.arc(1, 0, 10, -Math.PI / 3.5, Math.PI / 3.5, false);
      this.soundBtnGfx.strokePath();
    } else {
      this.soundBtnGfx.lineStyle(2, 0xef4444, 0.95);
      this.soundBtnGfx.lineBetween(-7, -7, 7, 7);
    }
  }

  setSoundToggleCallback(cb: () => void): void {
    this.onSoundToggle = cb;
  }

  // ─── Floating Turn Banner ───────────────────────────────────────────────────

  private createTurnBanner(depth: number, bx: number, by: number, w: number, h: number): void {
    this.turnBannerBg = this.scene.add.graphics();
    this.drawTurnBannerBg(0x7c3aed, w, h);

    this.turnBannerText = this.scene.add.text(0, -7, "WAITING...", {
      fontSize: this.isPortrait ? "15px" : "20px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      letterSpacing: this.isPortrait ? 0.5 : 1.5,
      shadow: {
        offsetX: 0,
        offsetY: 1,
        color: "#00000088",
        blur: 6,
        fill: true,
      },
    }).setOrigin(0.5);

    this.turnSubText = this.scene.add.text(0, this.isPortrait ? 9 : 12, "✦ Match starting", {
      fontSize: this.isPortrait ? "11px" : "13.5px",
      color: "#cbd5e1",
      fontFamily: "Outfit, sans-serif",
    }).setOrigin(0.5);

    this.turnBannerContainer = this.scene.add.container(bx, by, [
      this.turnBannerBg,
      this.turnBannerText,
      this.turnSubText,
    ]);
    this.turnBannerContainer.setDepth(depth + 1);
  }

  private drawTurnBannerBg(color: number, w = this.isPortrait ? 420 : 490, h = this.isPortrait ? 42 : 56): void {
    this.turnBannerBg.clear();
    const r = 14;

    // Ambient soft drop shadow / outer glow
    this.turnBannerBg.fillStyle(color, 0.16);
    this.turnBannerBg.fillRoundedRect(-w / 2 - 3, -h / 2 - 1, w + 6, h + 5, r + 2);

    // Deep panel shadow
    this.turnBannerBg.fillStyle(0x000000, 0.4);
    this.turnBannerBg.fillRoundedRect(-w / 2, -h / 2 + 3, w, h, r);

    // Dark glass base slab
    this.turnBannerBg.fillStyle(0x0a1022, 0.96);
    this.turnBannerBg.fillRoundedRect(-w / 2, -h / 2, w, h, r);

    // Glowing active color accent tint
    this.turnBannerBg.fillStyle(color, 0.18);
    this.turnBannerBg.fillRoundedRect(-w / 2, -h / 2, w, h, r);

    // Top specular sheen
    this.turnBannerBg.fillStyle(0xffffff, 0.26);
    this.turnBannerBg.fillRoundedRect(-w / 2 + 1, -h / 2 + 1, w - 2, 4.5, { tl: r - 1, tr: r - 1, bl: 0, br: 0 });

    // Luminous neon border
    this.turnBannerBg.lineStyle(2, color, 0.95);
    this.turnBannerBg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

    // Inner subtle hairline
    this.turnBannerBg.lineStyle(1, 0xffffff, 0.12);
    this.turnBannerBg.strokeRoundedRect(-w / 2 + 1.5, -h / 2 + 1.5, w - 3, h - 3, r - 1);
  }

  // ─── Selection Banner ───────────────────────────────────────────────────────

  private createSelectionBanner(bx = 400, by = 36, w = 360, h = 42): void {
    const bannerBg = this.scene.add.graphics();
    bannerBg.fillStyle(0xd97706, 1);
    bannerBg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    bannerBg.lineStyle(2, 0xfcd34d, 1);
    bannerBg.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);

    this.selectionBannerText = this.scene.add.text(0, 0, "TAP A HIGHLIGHTED TOKEN TO MOVE!", {
      fontSize: "15px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5);

    this.selectionBannerContainer = this.scene.add.container(bx, by, [bannerBg, this.selectionBannerText]);
    this.selectionBannerContainer.setDepth(150);
    this.selectionBannerContainer.setVisible(false);
    this.selectionBannerContainer.setScale(0);
  }

  showSelectionBanner(text = "TAP A HIGHLIGHTED TOKEN TO MOVE!"): void {
    this.selectionBannerText.setText(text);
    this.selectionBannerContainer.setVisible(true);
    this.scene.tweens.add({
      targets: this.selectionBannerContainer,
      scaleX: 1,
      scaleY: 1,
      duration: animDuration(200),
      ease: "Back.Out",
    });
  }

  hideSelectionBanner(): void {
    this.scene.tweens.add({
      targets: this.selectionBannerContainer,
      scaleX: 0,
      scaleY: 0,
      duration: animDuration(150),
      ease: "Sine.In",
      onComplete: () => this.selectionBannerContainer.setVisible(false),
    });
  }

  // ─── Player Cards Portrait ─────────────────────────────────────────────────

  private createPlayerCardsPortrait(totalPlayers: number, depth: number): void {
    const availableW = 660;
    const cardW = totalPlayers === 2 ? 320 : Math.floor((availableW - (totalPlayers - 1) * 10) / totalPlayers);
    const cardH = 48;
    const startX = 30 + cardW / 2;
    const gapX = cardW + 10;
    const cy = 92;

    for (let i = 0; i < totalPlayers; i++) {
      const cx = startX + i * gapX;
      const color = this.activeColors[i] ?? ORDERED_COLORS[i % 4]!;
      const c = LUDO_DESIGN_CONFIG.colors[color];

      const cardContainer = this.scene.add.container(cx, cy);
      cardContainer.setDepth(depth + 1);

      const cardBg = this.scene.add.graphics();
      const avatarRing = this.scene.add.graphics();
      const avatarGlow = this.scene.add.graphics();

      const geom = { w: cardW, h: cardH, avatarX: -cardW / 2 + 18 };
      this.drawPlayerCardGraphics(cardBg, avatarRing, avatarGlow, c.main, false, geom);

      // Player circle dot
      const dot = this.scene.add.circle(geom.avatarX, 0, 10, c.main);
      dot.setStrokeStyle(1.5, 0xffffff);

      // Player Name
      const defaultName = i === 0 ? "Player 1 (You)" : `Player ${i + 1}`;
      const nameTxt = this.scene.add.text(geom.avatarX + 16, -12, defaultName, {
        fontSize: totalPlayers === 2 ? "12px" : "10px",
        color: "#ffffff",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      });

      // Progress text
      const progTxt = this.scene.add.text(geom.avatarX + 16, 2, "Home: 0/4", {
        fontSize: "9px",
        color: "#94a3b8",
        fontFamily: "Outfit, sans-serif",
      });

      // 4 Progress Token Pips
      const pips: Phaser.GameObjects.Arc[] = [];
      const pipStartX = totalPlayers === 2 ? cardW / 2 - 62 : cardW / 2 - 46;
      for (let p = 0; p < 4; p++) {
        const pip = this.scene.add.circle(pipStartX + p * 9, 3, 3, 0x1e293b);
        pip.setStrokeStyle(1, c.main, 0.7);
        pips.push(pip);
      }

      // Token count
      const tokCount = this.scene.add.text(cardW / 2 - 12, -10, "0", {
        fontSize: "12px",
        color: "#" + c.main.toString(16).padStart(6, "0"),
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      }).setOrigin(0.5);

      cardContainer.add([
        cardBg,
        avatarGlow,
        avatarRing,
        dot,
        nameTxt,
        progTxt,
        ...pips,
        tokCount,
      ]);

      this.playerCards.push({
        container: cardContainer,
        cardBg,
        avatarRing,
        avatarGlow,
        avatarDot: dot,
        nameText: nameTxt,
        progressText: progTxt,
        tokenPips: pips,
        tokenCountText: tokCount,
        color,
        geom,
      });
    }
  }

  // ─── Player Cards Landscape ────────────────────────────────────────────────

  private createPlayerCardsLandscape(totalPlayers: number, depth: number): void {
    const isTwoPlayer = totalPlayers <= 2;
    const cardH = isTwoPlayer ? 76 : 62;
    const gap = isTwoPlayer ? 92 : 72;
    const startY = isTwoPlayer ? 344 : 336;
    const cardW = 490;
    const avatarX = -195;

    for (let i = 0; i < totalPlayers; i++) {
      const cy = startY + i * gap;
      const color = this.activeColors[i] ?? ORDERED_COLORS[i % 4]!;
      const c = LUDO_DESIGN_CONFIG.colors[color];

      const cardContainer = this.scene.add.container(PANEL_X, cy);
      cardContainer.setDepth(depth + 1);

      const cardBg = this.scene.add.graphics();
      const avatarRing = this.scene.add.graphics();
      const avatarGlow = this.scene.add.graphics();

      const geom = { w: cardW, h: cardH, avatarX };
      this.drawPlayerCardGraphics(cardBg, avatarRing, avatarGlow, c.main, false, geom);

      // Player circle icon
      const dot = this.scene.add.circle(avatarX, 0, 16, c.main);
      dot.setStrokeStyle(2, 0xffffff);

      // Player Name
      const defaultName = i === 0 ? "Player 1 (You)" : `Player ${i + 1} (AI)`;
      const nameTxt = this.scene.add.text(avatarX + 30, isTwoPlayer ? -18 : -14, defaultName, {
        fontSize: isTwoPlayer ? "19px" : "16px",
        color: "#ffffff",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      });

      // Progress text
      const progTxt = this.scene.add.text(avatarX + 30, isTwoPlayer ? 6 : 4, "Home: 0 / 4", {
        fontSize: isTwoPlayer ? "14px" : "12.5px",
        color: "#94a3b8",
        fontFamily: "Outfit, sans-serif",
      });

      // 4 Progress Token Pips
      const pips: Phaser.GameObjects.Arc[] = [];
      const pipStartX = 55;
      const pipSpacing = 26;
      const pipRadius = isTwoPlayer ? 6 : 5;
      for (let p = 0; p < 4; p++) {
        const pip = this.scene.add.circle(pipStartX + p * pipSpacing, isTwoPlayer ? 3 : 2, pipRadius, 0x1e293b);
        pip.setStrokeStyle(1.4, c.main, 0.7);
        pips.push(pip);
      }

      // Token count text
      const tokCount = this.scene.add.text(195, isTwoPlayer ? -1 : -1, "0", {
        fontSize: isTwoPlayer ? "24px" : "20px",
        color: "#" + c.main.toString(16).padStart(6, "0"),
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      }).setOrigin(0.5);

      cardContainer.add([
        cardBg,
        avatarGlow,
        avatarRing,
        dot,
        nameTxt,
        progTxt,
        ...pips,
        tokCount,
      ]);

      this.playerCards.push({
        container: cardContainer,
        cardBg,
        avatarRing,
        avatarGlow,
        avatarDot: dot,
        nameText: nameTxt,
        progressText: progTxt,
        tokenPips: pips,
        tokenCountText: tokCount,
        color,
        geom,
      });
    }
  }

  private drawPlayerCardGraphics(
    cardBg: Phaser.GameObjects.Graphics,
    avatarRing: Phaser.GameObjects.Graphics,
    avatarGlow: Phaser.GameObjects.Graphics,
    color: number,
    isActive: boolean,
    geom = { w: 194, h: 58, avatarX: -68 },
  ): void {
    cardBg.clear();
    avatarRing.clear();
    avatarGlow.clear();

    const { w, h, avatarX } = geom;
    const r = 14;

    if (isActive) {
      // Outer colored neon glow
      cardBg.fillStyle(color, 0.14);
      cardBg.fillRoundedRect(-w / 2 - 3, -h / 2 - 2, w + 6, h + 6, r + 2);
    }

    // Drop shadow
    cardBg.fillStyle(0x000000, isActive ? 0.45 : 0.25);
    cardBg.fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w, h, r);

    // Card extruded base
    cardBg.fillStyle(0x060a14, 1);
    cardBg.fillRoundedRect(-w / 2, -h / 2 + 2, w, h, r);

    // Card background
    cardBg.fillStyle(isActive ? 0x0c162c : 0x0a1020, isActive ? 0.98 : 0.88);
    cardBg.fillRoundedRect(-w / 2, -h / 2, w, h, r);

    if (isActive) {
      // Team colored floor glow
      cardBg.fillStyle(color, 0.16);
      cardBg.fillRoundedRect(-w / 2, -h / 2, w, h, r);

      // Active vibrant border
      cardBg.lineStyle(2.2, color, 0.95);
      cardBg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

      // Top sheen
      cardBg.fillStyle(0xffffff, 0.22);
      cardBg.fillRoundedRect(-w / 2 + 1, -h / 2 + 1, w - 2, 4, { tl: r - 1, tr: r - 1, bl: 0, br: 0 });

      // Avatar active glowing ring
      const glowR = w > 400 ? 25 : (w > 250 ? 20 : 15);
      const ringR = w > 400 ? 21 : (w > 250 ? 16.5 : 12.5);
      avatarGlow.fillStyle(color, 0.35);
      avatarGlow.fillCircle(avatarX, 0, glowR);

      avatarRing.lineStyle(2.2, 0xffffff, 0.95);
      avatarRing.strokeCircle(avatarX, 0, ringR);
    } else {
      // Inactive subtle border
      cardBg.lineStyle(1.2, 0x1e2d4d, 0.65);
      cardBg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

      // Top subtle sheen
      cardBg.fillStyle(0xffffff, 0.08);
      cardBg.fillRoundedRect(-w / 2 + 1, -h / 2 + 1, w - 2, 4, { tl: r - 1, tr: r - 1, bl: 0, br: 0 });
    }
  }

  // ─── Action Log Landscape ──────────────────────────────────────────────────

  private createActionLogLandscape(totalPlayers: number, depth: number): void {
    const isTwoPlayer = totalPlayers <= 2;
    const logHeaderY = isTwoPlayer ? 506 : 614;

    this.scene.add.text(PANEL_X, logHeaderY, "● ACTION LOG", {
      fontSize: "14.5px",
      color: "#38bdf8",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      letterSpacing: 2,
      shadow: {
        offsetX: 0,
        offsetY: 1,
        color: "#38bdf855",
        blur: 6,
        fill: true,
      },
    }).setOrigin(0.5).setDepth(depth + 1);

    const logBoxY = isTwoPlayer ? 524 : 630;
    const logBoxH = isTwoPlayer ? 246 : 140;
    const logBoxW = 490;

    const logGfx = this.scene.add.graphics();
    logGfx.setDepth(depth);

    // Inset drop shadow
    logGfx.fillStyle(0x000000, 0.45);
    logGfx.fillRoundedRect(PANEL_X - logBoxW / 2, logBoxY, logBoxW, logBoxH, 12);

    // Dark recessed log surface
    logGfx.fillStyle(0x060a14, 0.96);
    logGfx.fillRoundedRect(PANEL_X - logBoxW / 2, logBoxY, logBoxW, logBoxH, 12);

    // Top cyan reflex line
    logGfx.fillStyle(0x38bdf8, 0.25);
    logGfx.fillRoundedRect(PANEL_X - logBoxW / 2 + 1, logBoxY + 1, logBoxW - 2, 2, { tl: 11, tr: 11, bl: 0, br: 0 });

    // Bevel border
    logGfx.lineStyle(1.4, 0x1e2d4d, 0.9);
    logGfx.strokeRoundedRect(PANEL_X - logBoxW / 2, logBoxY, logBoxW, logBoxH, 12);

    const lineGap = isTwoPlayer ? 34 : 25;
    const numLines = isTwoPlayer ? 6 : 4;
    for (let i = 0; i < numLines; i++) {
      const t = this.scene.add.text(
        PANEL_X - logBoxW / 2 + 20,
        logBoxY + 16 + i * lineGap,
        i === 0 ? "▸ Match started. Roll the dice to begin!" : "",
        {
          fontSize: isTwoPlayer ? "14px" : "12.5px",
          color: i === 0 ? "#38bdf8" : "#94a3b8",
          fontFamily: "Outfit, sans-serif",
          wordWrap: { width: logBoxW - 40 },
        },
      ).setDepth(depth + 1);
      this.logLines.push(t);
    }
  }

  // ─── Turn Updates ───────────────────────────────────────────────────────────

  updateTurn(playerIndex: number): void {
    this.currentTurnIndex = playerIndex;
    const activeColor = this.playerCards[playerIndex]?.color ?? this.activeColors[playerIndex] ?? (this.totalPlayers === 2 ? (playerIndex === 1 ? "green" : "red") : ORDERED_COLORS[playerIndex % 4]!);
    const c = LUDO_DESIGN_CONFIG.colors[activeColor] ?? LUDO_DESIGN_CONFIG.colors.red;
    const isMyTurn = this.mySeat === playerIndex;

    // Broadcast turn changed so Dice dais syncs
    this.scene.events.emit(LudoEvents.TURN_CHANGED, { playerIndex, color: activeColor });

    // 1. Smooth Slide/Fade Turn Banner Transition
    this.scene.tweens.add({
      targets: this.turnBannerContainer,
      alpha: 0,
      scaleX: 0.95,
      scaleY: 0.95,
      duration: animDuration(120),
      ease: "Sine.In",
      onComplete: () => {
        const card = this.playerCards[playerIndex];
        const pName = card ? card.nameText.text : `Player ${playerIndex + 1}`;

        if (isMyTurn) {
          this.turnBannerText.setText("YOUR TURN");
          this.turnBannerText.setColor("#4ade80");
          this.turnSubText.setText("✦ Roll the dice");
        } else {
          this.turnBannerText.setText(`${pName.toUpperCase()}`);
          this.turnBannerText.setColor("#ffffff");
          this.turnSubText.setText("✦ Rolling dice...");
        }

        this.drawTurnBannerBg(c.main);

        this.scene.tweens.add({
          targets: this.turnBannerContainer,
          alpha: 1,
          scaleX: 1,
          scaleY: 1,
          duration: animDuration(180),
          ease: "Back.Out",
        });
      },
    });

    // 2. Animate Player Card Highlights
    this.playerCards.forEach((card, idx) => {
      const isActive = idx === playerIndex;
      card.activeTween?.stop();

      this.drawPlayerCardGraphics(
        card.cardBg,
        card.avatarRing,
        card.avatarGlow,
        LUDO_DESIGN_CONFIG.colors[card.color].main,
        isActive,
        card.geom,
      );

      if (isActive && !prefersReducedMotion()) {
        card.activeTween = this.scene.tweens.add({
          targets: card.container,
          scaleX: 1.03,
          scaleY: 1.03,
          duration: animDuration(150),
          ease: "Back.Out",
        });
      } else {
        card.container.setScale(1.0);
      }
    });
  }

  // ─── Progress & Log Updates ─────────────────────────────────────────────────

  updateProgress(playerIndex: number, doneCount: number): void {
    const card = this.playerCards[playerIndex];
    if (!card) return;

    card.progressText.setText(`Home: ${doneCount} / 4`);

    const c = LUDO_DESIGN_CONFIG.colors[card.color];
    card.tokenPips.forEach((pip, idx) => {
      if (idx < doneCount) {
        pip.setFillStyle(c.main, 1.0);
        pip.setStrokeStyle(1.8, 0xffffff, 1.0);
      } else {
        pip.setFillStyle(0x0f172a, 1.0);
        pip.setStrokeStyle(1.2, 0x334155, 0.7);
      }
    });
  }

  updateTokenCount(playerIndex: number, activeCount: number): void {
    const card = this.playerCards[playerIndex];
    if (!card) return;
    card.tokenCountText.setText(String(activeCount));
  }

  setMySeat(seat: number): void {
    this.mySeat = seat;
  }

  setNames(names: string[]): void {
    this.playerCards.forEach((card, i) => {
      if (names[i]) {
        card.nameText.setText(names[i]);
      }
    });
  }

  applyColors(activeColors: PlayerColor[]): void {
    this.activeColors = [...activeColors];
    this.playerCards.forEach((card, i) => {
      const newColor = activeColors[i];
      if (newColor && LUDO_DESIGN_CONFIG.colors[newColor]) {
        card.color = newColor;
        const c = LUDO_DESIGN_CONFIG.colors[newColor];
        if (card.avatarDot) {
          card.avatarDot.setFillStyle(c.main, 1.0);
        }
        if (card.tokenCountText) {
          card.tokenCountText.setColor("#" + c.main.toString(16).padStart(6, "0"));
        }
        card.tokenPips.forEach((pip) => {
          pip.setStrokeStyle(1.4, c.main, 0.7);
        });
        const isActive = i === this.currentTurnIndex;
        this.drawPlayerCardGraphics(
          card.cardBg,
          card.avatarRing,
          card.avatarGlow,
          c.main,
          isActive,
          card.geom,
        );
      }
    });

    const activeColor = this.playerCards[this.currentTurnIndex]?.color ?? this.activeColors[this.currentTurnIndex] ?? "red";
    const c = LUDO_DESIGN_CONFIG.colors[activeColor];
    if (c) {
      this.drawTurnBannerBg(c.main);
    }
  }

  addLog(message: string): void {
    const current = this.logLines.map((l) => l.text).filter(Boolean);
    current.unshift(message);
    const trimmed = current.slice(0, HUDManager.MAX_LOG);

    this.logLines.forEach((line, i) => {
      const text = trimmed[i] ?? "";
      line.setText(text ? `▸ ${text.replace(/^▸\s*/, "")}` : "");
      line.setColor(i === 0 ? "#38bdf8" : (i === 1 ? "#cbd5e1" : (i === 2 ? "#94a3b8" : "#64748b")));
    });
  }

  setLogs(logs: string[]): void {
    const trimmed = logs.slice(-HUDManager.MAX_LOG).reverse();
    this.logLines.forEach((line, i) => {
      const text = trimmed[i] ?? "";
      line.setText(text ? `▸ ${text.replace(/^▸\s*/, "")}` : "");
      line.setColor(i === 0 ? "#38bdf8" : (i === 1 ? "#cbd5e1" : (i === 2 ? "#94a3b8" : "#64748b")));
    });
  }
}

export { HUDManager };
