import Phaser from "phaser";
import type { PlayerColor } from "../types/ludo.types";
import { LUDO_DESIGN_CONFIG, animDuration, prefersReducedMotion } from "../constants";

const PANEL_X = 912;
const PANEL_W = 224;
const PANEL_H = 800;

const ORDERED_COLORS: PlayerColor[] = ["red", "blue", "green", "yellow"];

interface PlayerCardUI {
  container: Phaser.GameObjects.Container;
  cardBg: Phaser.GameObjects.Graphics;
  avatarRing: Phaser.GameObjects.Graphics;
  avatarGlow: Phaser.GameObjects.Graphics;
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
  private logLines: Phaser.GameObjects.Text[] = [];
  private currentTurnIndex = 0;
  private totalPlayers = 4;
  private mySeat = 0;

  private soundOn = true;
  private onSoundToggle: (() => void) | null = null;
  private soundBtnContainer!: Phaser.GameObjects.Container;
  private soundBtnGfx!: Phaser.GameObjects.Graphics;
  private soundIconText!: Phaser.GameObjects.Text;

  private static readonly MAX_LOG = 5;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(totalPlayers = 4, isPortrait = false): void {
    this.totalPlayers = totalPlayers;
    this.isPortrait = isPortrait;
    const depth = 10;

    if (isPortrait) {
      // ═════════════════════════════════════════════════════════════════════
      // PORTRAIT MOBILE HUD (Canvas: 720 x 1080)
      // ═════════════════════════════════════════════════════════════════════
      // 1. Top Title & Header
      this.scene.add.text(360, 18, "LUDO CHAMPION", {
        fontSize: "15px",
        color: "#f59e0b",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(depth + 1);

      // Sound button top-right
      this.createSoundToggle(depth, 670, 20);

      // Turn Banner at top
      this.createTurnBanner(depth, 360, 48, 340, 34);

      // Token selection prompt
      this.createSelectionBanner(360, 48, 340, 34);

      // Player cards across top (y: 92)
      this.createPlayerCardsPortrait(totalPlayers, depth);

      // Bottom Control Deck (y: 820..1060)
      const deckBg = this.scene.add.graphics();
      deckBg.setDepth(depth);
      deckBg.fillStyle(0x000000, 0.45);
      deckBg.fillRoundedRect(24, 824, 672, 240, 18);
      deckBg.fillStyle(0x070b14, 0.96);
      deckBg.fillRoundedRect(24, 820, 672, 240, 18);
      deckBg.lineStyle(1.5, 0x1e293b, 0.9);
      deckBg.strokeRoundedRect(24, 820, 672, 240, 18);

      // Dice Area Title
      this.scene.add.text(185, 836, "DICE CONTROLLER", {
        fontSize: "11px",
        color: "#64748b",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      }).setOrigin(0.5).setDepth(depth + 1);

      // Action Log Title
      this.scene.add.text(515, 836, "ACTION LOG", {
        fontSize: "11px",
        color: "#64748b",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      }).setOrigin(0.5).setDepth(depth + 1);

      // Inset Action Log Box
      const logGfx = this.scene.add.graphics();
      logGfx.setDepth(depth);
      logGfx.fillStyle(0x020617, 0.95);
      logGfx.fillRoundedRect(360, 856, 310, 188, 10);
      logGfx.lineStyle(1.2, 0x1e293b, 0.8);
      logGfx.strokeRoundedRect(360, 856, 310, 188, 10);

      for (let i = 0; i < HUDManager.MAX_LOG; i++) {
        const t = this.scene.add.text(
          372,
          868 + i * 24,
          "",
          {
            fontSize: "11px",
            color: "#94a3b8",
            fontFamily: "Outfit, sans-serif",
            wordWrap: { width: 285 },
          },
        ).setDepth(depth + 1);
        this.logLines.push(t);
      }

    } else {
      // ═════════════════════════════════════════════════════════════════════
      // LANDSCAPE DESKTOP HUD (Canvas: 1024 x 800)
      // ═════════════════════════════════════════════════════════════════════
      // 1. Sidebar Background Panel
      const bg = this.scene.add.graphics();
      bg.setDepth(depth);
      bg.fillStyle(0x070b14, 0.98);
      bg.fillRoundedRect(PANEL_X - PANEL_W / 2, 0, PANEL_W, PANEL_H, { tl: 0, tr: 16, bl: 0, br: 16 });
      bg.lineStyle(1.5, 0x1e293b, 1.0);
      bg.strokeRoundedRect(PANEL_X - PANEL_W / 2, 0, PANEL_W, PANEL_H, { tl: 0, tr: 16, bl: 0, br: 16 });

      // 2. Game Title & Header
      this.scene.add.text(PANEL_X - 24, 22, "LUDO CHAMPION", {
        fontSize: "14px",
        color: "#f59e0b",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        letterSpacing: 1,
      }).setOrigin(0.5).setDepth(depth + 1);

      // 3. Sound Toggle Button
      this.createSoundToggle(depth, PANEL_X + 82, 22);

      // 4. Modern Floating Turn Banner
      this.createTurnBanner(depth, PANEL_X, 66, 194, 44);

      // 5. Floating Token Selection Prompt
      this.createSelectionBanner(400, 36, 304, 36);

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

    this.soundIconText = this.scene.add.text(0, 0, "🔊", {
      fontSize: "13px",
    }).setOrigin(0.5);

    const hit = this.scene.add.rectangle(0, 0, 30, 30, 0xffffff, 0);
    hit.setInteractive({ useHandCursor: true });
    hit.on("pointerdown", () => {
      this.soundOn = !this.soundOn;
      this.soundIconText.setText(this.soundOn ? "🔊" : "🔇");
      this.drawSoundBtn(this.soundOn);
      this.onSoundToggle?.();
    });

    this.soundBtnContainer = this.scene.add.container(btnX, btnY, [
      this.soundBtnGfx,
      this.soundIconText,
      hit,
    ]);
    this.soundBtnContainer.setDepth(depth + 2);
  }

  private drawSoundBtn(active: boolean): void {
    this.soundBtnGfx.clear();
    this.soundBtnGfx.fillStyle(0x0f172a, 0.9);
    this.soundBtnGfx.fillCircle(0, 0, 14);
    this.soundBtnGfx.lineStyle(1.5, active ? 0xf59e0b : 0x475569, 0.8);
    this.soundBtnGfx.strokeCircle(0, 0, 14);
  }

  setSoundToggleCallback(cb: () => void): void {
    this.onSoundToggle = cb;
  }

  // ─── Floating Turn Banner ───────────────────────────────────────────────────

  private createTurnBanner(depth: number, bx: number, by: number, w: number, h: number): void {
    this.turnBannerBg = this.scene.add.graphics();
    this.drawTurnBannerBg(0x7c3aed, w, h);

    this.turnBannerText = this.scene.add.text(0, -5, "WAITING...", {
      fontSize: "12px",
      color: "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5);

    this.turnSubText = this.scene.add.text(0, 7, "Match starting", {
      fontSize: "9px",
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

  private drawTurnBannerBg(color: number, w = this.isPortrait ? 340 : 194, h = this.isPortrait ? 34 : 44): void {
    this.turnBannerBg.clear();
    const r = 12;

    this.turnBannerBg.fillStyle(0x000000, 0.3);
    this.turnBannerBg.fillRoundedRect(-w / 2 + 2, -h / 2 + 3, w, h, r);

    this.turnBannerBg.fillStyle(0x0f172a, 0.95);
    this.turnBannerBg.fillRoundedRect(-w / 2, -h / 2, w, h, r);

    this.turnBannerBg.fillStyle(color, 0.15);
    this.turnBannerBg.fillRoundedRect(-w / 2, -h / 2, w, h, r);

    this.turnBannerBg.lineStyle(1.8, color, 0.9);
    this.turnBannerBg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

    this.turnBannerBg.fillStyle(0xffffff, 0.12);
    this.turnBannerBg.fillRoundedRect(-w / 2, -h / 2, w, 4, { tl: r, tr: r, bl: 0, br: 0 });
  }

  // ─── Selection Banner ───────────────────────────────────────────────────────

  private createSelectionBanner(bx = 400, by = 36, w = 304, h = 36): void {
    const bannerBg = this.scene.add.graphics();
    bannerBg.fillStyle(0xd97706, 1);
    bannerBg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    bannerBg.lineStyle(2, 0xfcd34d, 1);
    bannerBg.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);

    this.selectionBannerText = this.scene.add.text(0, 0, "TAP A HIGHLIGHTED TOKEN TO MOVE!", {
      fontSize: "11px",
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
      const color = ORDERED_COLORS[i % 4]!;
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
    const startY = 320;
    const gap = 74;

    for (let i = 0; i < totalPlayers; i++) {
      const cy = startY + i * gap;
      const color = ORDERED_COLORS[i % 4]!;
      const c = LUDO_DESIGN_CONFIG.colors[color];

      const cardContainer = this.scene.add.container(PANEL_X, cy);
      cardContainer.setDepth(depth + 1);

      const cardBg = this.scene.add.graphics();
      const avatarRing = this.scene.add.graphics();
      const avatarGlow = this.scene.add.graphics();

      const geom = { w: 194, h: 58, avatarX: -68 };
      this.drawPlayerCardGraphics(cardBg, avatarRing, avatarGlow, c.main, false, geom);

      // Player circle icon
      const dot = this.scene.add.circle(-68, 0, 11, c.main);
      dot.setStrokeStyle(1.5, 0xffffff);

      // Player Name
      const defaultName = i === 0 ? "Player 1 (You)" : `Player ${i + 1} (AI)`;
      const nameTxt = this.scene.add.text(-48, -13, defaultName, {
        fontSize: "11px",
        color: "#ffffff",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      });

      // Progress text
      const progTxt = this.scene.add.text(-48, 2, "Home: 0 / 4", {
        fontSize: "9.5px",
        color: "#94a3b8",
        fontFamily: "Outfit, sans-serif",
      });

      // 4 Progress Token Pips
      const pips: Phaser.GameObjects.Arc[] = [];
      for (let p = 0; p < 4; p++) {
        const pip = this.scene.add.circle(42 + p * 11, 4, 3.5, 0x1e293b);
        pip.setStrokeStyle(1, c.main, 0.7);
        pips.push(pip);
      }

      // Token count
      const tokCount = this.scene.add.text(78, -10, "0", {
        fontSize: "14px",
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
    const r = 12;

    // Drop shadow
    cardBg.fillStyle(0x000000, 0.25);
    cardBg.fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w, h, r);

    // Card background
    cardBg.fillStyle(0x0f172a, isActive ? 0.98 : 0.85);
    cardBg.fillRoundedRect(-w / 2, -h / 2, w, h, r);

    if (isActive) {
      // Team colored floor glow
      cardBg.fillStyle(color, 0.14);
      cardBg.fillRoundedRect(-w / 2, -h / 2, w, h, r);

      // Active vibrant border
      cardBg.lineStyle(2.0, color, 1.0);
      cardBg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

      // Top sheen
      cardBg.fillStyle(0xffffff, 0.15);
      cardBg.fillRoundedRect(-w / 2, -h / 2, w, 3.5, { tl: r, tr: r, bl: 0, br: 0 });

      // Avatar active glowing ring
      avatarGlow.fillStyle(color, 0.35);
      avatarGlow.fillCircle(avatarX, 0, 15);

      avatarRing.lineStyle(2.0, 0xffffff, 0.95);
      avatarRing.strokeCircle(avatarX, 0, 12.5);
    } else {
      // Inactive subtle border
      cardBg.lineStyle(1.2, 0x1e293b, 0.8);
      cardBg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    }
  }

  // ─── Compact Action Log Landscape ──────────────────────────────────────────

  private createActionLogLandscape(totalPlayers: number, depth: number): void {
    const logY = 320 + totalPlayers * 74 + 10;

    this.scene.add.text(PANEL_X, logY, "ACTION LOG", {
      fontSize: "10px",
      color: "#64748b",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(depth + 1);

    const logGfx = this.scene.add.graphics();
    logGfx.setDepth(depth);
    logGfx.fillStyle(0x0f172a, 0.9);
    logGfx.fillRoundedRect(PANEL_X - 97, logY + 12, 194, 86, 10);
    logGfx.lineStyle(1.2, 0x1e293b, 0.8);
    logGfx.strokeRoundedRect(PANEL_X - 97, logY + 12, 194, 86, 10);

    for (let i = 0; i < HUDManager.MAX_LOG; i++) {
      const t = this.scene.add.text(
        PANEL_X - 88,
        logY + 22 + i * 14,
        "",
        {
          fontSize: "9px",
          color: "#94a3b8",
          fontFamily: "Outfit, sans-serif",
          wordWrap: { width: 176 },
        },
      ).setDepth(depth + 1);
      this.logLines.push(t);
    }
  }

  // ─── Turn Updates ───────────────────────────────────────────────────────────

  updateTurn(playerIndex: number): void {
    this.currentTurnIndex = playerIndex;
    const activeColor = ORDERED_COLORS[playerIndex % 4]!;
    const c = LUDO_DESIGN_CONFIG.colors[activeColor];
    const isMyTurn = this.mySeat === playerIndex;

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
          this.turnBannerText.setText("🟢 YOUR TURN");
          this.turnSubText.setText("Roll the dice");
        } else {
          this.turnBannerText.setText(`${pName.toUpperCase()}`);
          this.turnSubText.setText("Rolling dice...");
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
        pip.setStrokeStyle(1.5, 0xffffff, 1.0);
      } else {
        pip.setFillStyle(0x1e293b, 1.0);
        pip.setStrokeStyle(1, c.main, 0.5);
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
    this.playerCards.forEach((card, i) => {
      if (activeColors[i]) {
        card.color = activeColors[i];
      }
    });
  }

  addLog(message: string): void {
    const current = this.logLines.map((l) => l.text).filter(Boolean);
    current.unshift(message);
    const trimmed = current.slice(0, HUDManager.MAX_LOG);

    this.logLines.forEach((line, i) => {
      line.setText(trimmed[i] ?? "");
      line.setColor(i === 0 ? "#f8fafc" : "#64748b");
    });
  }

  setLogs(logs: string[]): void {
    const trimmed = logs.slice(-HUDManager.MAX_LOG).reverse();
    this.logLines.forEach((line, i) => {
      line.setText(trimmed[i] ?? "");
      line.setColor(i === 0 ? "#f8fafc" : "#64748b");
    });
  }
}

export { HUDManager };
