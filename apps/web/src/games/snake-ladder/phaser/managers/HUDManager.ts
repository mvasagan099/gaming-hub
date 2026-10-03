import Phaser from "phaser";
import { GameEvents } from "../events/GameEvents";
import { animDuration, prefersReducedMotion } from "../constants";

const PANEL_X = 1080;
const PANEL_W = 560;
const PANEL_H = 800;

const COLORS = {
  p1:     0x3b82f6,
  p2:     0xef4444,
  p3:     0x10b981,
  p4:     0xf59e0b,
  accent: 0x6366f1,
  bg:     0x090e1a,
  card:   0x0f172a,
  border: 0x1e293b,
};

const PLAYER_COLORS = [COLORS.p1, COLORS.p2, COLORS.p3, COLORS.p4];
const PLAYER_HEX = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b"];

export class HUDManager {
  private scene: Phaser.Scene;
  private isPortrait = false;
  private turnText!: Phaser.GameObjects.Text;
  private turnBg!: Phaser.GameObjects.Graphics;
  private playerTileTexts: Phaser.GameObjects.Text[] = [];
  private playerStatusTexts: Phaser.GameObjects.Text[] = [];
  private logLines: Phaser.GameObjects.Text[] = [];
  private static readonly MAX_LOG = 6;
  private soundGfx!: Phaser.GameObjects.Graphics;
  private soundMuted = false;
  private muteCallback: (() => void) | null = null;
  private playerCardBgs: Phaser.GameObjects.Graphics[] = [];
  private playerCardGeoms: Array<{ cx: number; cy: number; w: number; h: number }> = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  private playerNames: string[] = ["PLAYER 1", "PLAYER 2", "PLAYER 3", "PLAYER 4"];
  private playerLabelTexts: Phaser.GameObjects.Text[] = [];

  setNames(names: string[]): void {
    names.forEach((name, i) => {
      if (name) {
        this.playerNames[i] = name.toUpperCase();
        if (this.playerLabelTexts[i]) {
          this.playerLabelTexts[i].setText(name);
        }
      }
    });
  }

  /** Register a callback for the sound toggle button. */
  onSoundToggle(cb: () => void): void {
    this.muteCallback = cb;
  }

  create(totalPlayers = 2, isPortrait = false): void {
    this.isPortrait = isPortrait;
    const depth = 10;

    if (isPortrait) {
      // ═════════════════════════════════════════════════════════════════════
      // PORTRAIT MOBILE HUD (Canvas: 720 x 1080)
      // ═════════════════════════════════════════════════════════════════════
      // ── 1. Top Header Area (y: 10..130) ──────────────────────────────────
      this.scene.add.text(360, 18, "SNAKE & LADDER", {
        fontSize: "16px",
        color: "#f59e0b",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(depth + 1);

      // Sound button at top-right
      this.createSoundToggle(depth, 670, 20);

      // ── 2. Top Turn Banner ───────────────────────────────────────────────
      this.turnBg = this.scene.add.graphics();
      this.turnBg.setDepth(depth);
      this.drawTurnBanner(0x3b82f6);

      this.turnText = this.scene.add.text(360, 52, "PLAYER 1'S TURN", {
        fontSize: "15px",
        color: "#38bdf8",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      }).setOrigin(0.5).setDepth(depth + 1);

      // ── 3. Player Cards at Top (y: 96) ───────────────────────────────────
      const availableW = 660;
      const cardW = totalPlayers === 2 ? 320 : Math.floor((availableW - (totalPlayers - 1) * 10) / totalPlayers);
      const cardH = 50;
      const startX = 30 + cardW / 2;
      const gapX = cardW + 10;

      for (let i = 0; i < totalPlayers; i++) {
        const cx = startX + i * gapX;
        const cy = 96;
        const color = PLAYER_COLORS[i] ?? 0x94a3b8;
        const hex = PLAYER_HEX[i] ?? "#94a3b8";

        this.playerCardGeoms.push({ cx, cy, w: cardW, h: cardH });

        // Card 3D background
        const card = this.scene.add.graphics();
        card.setDepth(depth);
        this.drawPlayerCard(card, cx, cy, cardW, cardH, color, i === 0);
        this.playerCardBgs.push(card);

        // Avatar Token Badge
        const badgeX = cx - cardW / 2 + 22;
        const badgeY = cy;

        const badgeShadow = this.scene.add.circle(badgeX + 1, badgeY + 2, 12, 0x000000, 0.4);
        badgeShadow.setDepth(depth + 1);

        const badge = this.scene.add.circle(badgeX, badgeY, 11, color);
        badge.setStrokeStyle(2, 0xffffff, 0.85);
        badge.setDepth(depth + 1);

        const badgeShine = this.scene.add.circle(badgeX - 3, badgeY - 3, 3, 0xffffff, 0.6);
        badgeShine.setDepth(depth + 1);

        // Player Name
        const labelText = this.scene.add.text(badgeX + 16, cy - 14, `Player ${i + 1}`, {
          fontSize: "12px",
          color: hex,
          fontFamily: "Outfit, sans-serif",
          fontStyle: "bold",
        }).setDepth(depth + 1);
        this.playerLabelTexts.push(labelText);

        // Tile Position Indicator
        const tileText = this.scene.add.text(badgeX + 16, cy + 2, "Tile 1", {
          fontSize: "11px",
          color: "#f1f5f9",
          fontFamily: "Outfit, sans-serif",
          fontStyle: "bold",
        }).setDepth(depth + 1);
        this.playerTileTexts.push(tileText);

        // Status Text (ACTIVE / WAITING)
        const statusText = this.scene.add.text(cx + cardW / 2 - 12, cy - 12, i === 0 ? "ACTIVE" : "WAITING", {
          fontSize: "9px",
          color: i === 0 ? "#4ade80" : "#64748b",
          fontFamily: "Outfit, sans-serif",
          fontStyle: "bold",
        }).setOrigin(1, 0).setDepth(depth + 1);
        this.playerStatusTexts.push(statusText);
      }

      // ── 4. Bottom Control Deck Panel (y: 826..1060) ──────────────────────
      const deckBg = this.scene.add.graphics();
      deckBg.setDepth(depth);

      // Deck background slab
      deckBg.fillStyle(0x000000, 0.45);
      deckBg.fillRoundedRect(20, 830, 680, 230, 18);
      deckBg.fillStyle(COLORS.bg, 0.95);
      deckBg.fillRoundedRect(20, 826, 680, 230, 18);
      deckBg.lineStyle(1.5, COLORS.border, 0.9);
      deckBg.strokeRoundedRect(20, 826, 680, 230, 18);

      // Dice Area Title
      this.scene.add.text(182, 844, "DICE CONTROLLER", {
        fontSize: "13px",
        color: "#64748b",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      }).setOrigin(0.5).setDepth(depth + 1);

      // Match Activity Title
      this.scene.add.text(518, 844, "MATCH ACTIVITY", {
        fontSize: "13px",
        color: "#64748b",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      }).setOrigin(0.5).setDepth(depth + 1);

      // Inset Match Activity Surface
      const logBg = this.scene.add.graphics();
      logBg.setDepth(depth);
      logBg.fillStyle(0x070b14, 1);
      logBg.fillRoundedRect(355, 860, 325, 184, 12);
      logBg.lineStyle(1.5, 0x1e293b, 0.8);
      logBg.strokeRoundedRect(355, 860, 325, 184, 12);

      for (let i = 0; i < HUDManager.MAX_LOG; i++) {
        const t = this.scene.add.text(
          368, 874 + i * 26,
          "",
          {
            fontSize: "12px",
            color: "#94a3b8",
            fontFamily: "Outfit, sans-serif",
            wordWrap: { width: 300 },
          },
        ).setDepth(depth + 1);
        this.logLines.push(t);
      }

    } else {
      // ═════════════════════════════════════════════════════════════════════
      // LANDSCAPE DESKTOP HUD (Canvas: 1200 x 800)
      // ═════════════════════════════════════════════════════════════════════
      const isTwoPlayer = totalPlayers <= 2;

      // ── 1. 3D Sidebar Background Panel ──────────────────────────────────
      const panelBg = this.scene.add.graphics();
      panelBg.setDepth(depth);

      // Deep panel shadow
      panelBg.fillStyle(0x000000, 0.45);
      panelBg.fillRect(PANEL_X - PANEL_W / 2 - 6, 0, 6, PANEL_H);

      // Panel background slab
      panelBg.fillStyle(COLORS.bg, 0.98);
      panelBg.fillRect(PANEL_X - PANEL_W / 2, 0, PANEL_W, PANEL_H);

      // Left border bevel
      panelBg.lineStyle(2, COLORS.border, 1.0);
      panelBg.lineBetween(PANEL_X - PANEL_W / 2, 0, PANEL_X - PANEL_W / 2, PANEL_H);
      panelBg.lineStyle(1, 0x334155, 0.4);
      panelBg.lineBetween(PANEL_X - PANEL_W / 2 + 1, 0, PANEL_X - PANEL_W / 2 + 1, PANEL_H);

      // ── 2. Title & Header ───────────────────────────────────────────────
      this.scene.add.text(PANEL_X, 28, "SNAKE & LADDER", {
        fontSize: "26px",
        color: "#f59e0b",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        letterSpacing: 3,
        shadow: {
          offsetX: 0,
          offsetY: 2,
          color: "#d9770655",
          blur: 10,
          fill: true,
        },
      }).setOrigin(0.5).setDepth(depth + 1);

      // Sound toggle button at top right
      this.createSoundToggle(depth, PANEL_X + 235, 28);

      // ── 3. 3D Turn Banner ───────────────────────────────────────────────
      this.turnBg = this.scene.add.graphics();
      this.turnBg.setDepth(depth);
      this.drawTurnBanner(0x3b82f6);

      this.turnText = this.scene.add.text(PANEL_X, 74, "PLAYER 1'S TURN", {
        fontSize: "21px",
        color: "#38bdf8",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        letterSpacing: 1.5,
      }).setOrigin(0.5).setDepth(depth + 1);

      // ── 4. Dice Area Subtitle ───────────────────────────────────────────
      this.scene.add.text(PANEL_X, 118, "DICE CONTROLLER", {
        fontSize: "13px",
        color: "#64748b",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        letterSpacing: 1.8,
      }).setOrigin(0.5).setDepth(depth + 1);

      // ── 5. 3D Player Cards ──────────────────────────────────────────────
      const cardW = 490;
      const cardH = isTwoPlayer ? 76 : 62;
      const cardGap = isTwoPlayer ? 92 : 72;
      const cardStartY = isTwoPlayer ? 344 : 336;

      for (let i = 0; i < totalPlayers; i++) {
        const cy = cardStartY + i * cardGap;
        const color = PLAYER_COLORS[i] ?? 0x94a3b8;
        const hex = PLAYER_HEX[i] ?? "#94a3b8";

        this.playerCardGeoms.push({ cx: PANEL_X, cy, w: cardW, h: cardH });

        // Card 3D background
        const card = this.scene.add.graphics();
        card.setDepth(depth);
        this.drawPlayerCard(card, PANEL_X, cy, cardW, cardH, color, i === 0);
        this.playerCardBgs.push(card);

        // 3D Avatar Token Badge
        const badgeX = PANEL_X - cardW / 2 + 48;
        const badgeY = cy;

        const badgeRadius = isTwoPlayer ? 18 : 15;
        const badgeShadow = this.scene.add.circle(badgeX + 1, badgeY + 2, badgeRadius + 1, 0x000000, 0.4);
        badgeShadow.setDepth(depth + 1);

        const badge = this.scene.add.circle(badgeX, badgeY, badgeRadius, color);
        badge.setStrokeStyle(2, 0xffffff, 0.85);
        badge.setDepth(depth + 1);

        // Specular glint on avatar badge
        const badgeShine = this.scene.add.circle(badgeX - 5, badgeY - 5, 5, 0xffffff, 0.6);
        badgeShine.setDepth(depth + 1);

        // Player Name
        const defaultName = this.playerNames[i] ?? `Player ${i + 1}`;
        const labelText = this.scene.add.text(badgeX + 30, isTwoPlayer ? cy - 16 : cy - 13, defaultName, {
          fontSize: isTwoPlayer ? "18px" : "15px",
          color: hex,
          fontFamily: "Outfit, sans-serif",
          fontStyle: "bold",
        }).setDepth(depth + 1);
        this.playerLabelTexts.push(labelText);

        // Tile Position Indicator
        const tileText = this.scene.add.text(badgeX + 30, isTwoPlayer ? cy + 6 : cy + 4, "Tile 1", {
          fontSize: isTwoPlayer ? "14px" : "12.5px",
          color: "#f1f5f9",
          fontFamily: "Outfit, sans-serif",
          fontStyle: "bold",
        }).setDepth(depth + 1);
        this.playerTileTexts.push(tileText);

        // Status Text (ACTIVE / WAITING)
        const statusText = this.scene.add.text(PANEL_X + cardW / 2 - 24, cy, i === 0 ? "ACTIVE" : "WAITING", {
          fontSize: isTwoPlayer ? "13px" : "11.5px",
          color: i === 0 ? "#4ade80" : "#64748b",
          fontFamily: "Outfit, sans-serif",
          fontStyle: "bold",
          letterSpacing: 1.2,
        }).setOrigin(1, 0.5).setDepth(depth + 1);
        this.playerStatusTexts.push(statusText);
      }

      // ── 6. Inset 3D Move Log Tray ───────────────────────────────────────
      const logHeaderY = isTwoPlayer ? 506 : 614;

      this.scene.add.text(PANEL_X, logHeaderY, "MATCH ACTIVITY", {
        fontSize: "15px",
        color: "#94a3b8",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        letterSpacing: 2,
      }).setOrigin(0.5).setDepth(depth + 1);

      const logBg = this.scene.add.graphics();
      logBg.setDepth(depth);

      const logBoxY = isTwoPlayer ? 524 : 630;
      const logBoxW = 490;
      const logBoxH = isTwoPlayer ? 246 : 140;

      // Inset drop shadow
      logBg.fillStyle(0x000000, 0.4);
      logBg.fillRoundedRect(PANEL_X - logBoxW / 2, logBoxY, logBoxW, logBoxH, 12);
      // Dark recessed log surface
      logBg.fillStyle(0x070b14, 0.95);
      logBg.fillRoundedRect(PANEL_X - logBoxW / 2, logBoxY, logBoxW, logBoxH, 12);
      // Bevel border
      logBg.lineStyle(1.4, 0x1e293b, 0.9);
      logBg.strokeRoundedRect(PANEL_X - logBoxW / 2, logBoxY, logBoxW, logBoxH, 12);

      const lineGap = isTwoPlayer ? 34 : 25;
      const numLines = isTwoPlayer ? 6 : 4;
      for (let i = 0; i < numLines; i++) {
        const t = this.scene.add.text(
          PANEL_X - logBoxW / 2 + 20,
          logBoxY + 16 + i * lineGap,
          i === 0 ? "Match started. Roll the dice to begin!" : "",
          {
            fontSize: isTwoPlayer ? "14px" : "12.5px",
            color: i === 0 ? "#64748b" : "#94a3b8",
            fontFamily: "Outfit, sans-serif",
            wordWrap: { width: logBoxW - 40 },
          },
        ).setDepth(depth + 1);
        this.logLines.push(t);
      }
    }

    // ── Listen to movement events ────────────────────────────────────────
    this.scene.events.on(GameEvents.MOVEMENT_FINISHED, (id: number, tile: number) => {
      this.updatePlayerTile(id, tile);
    });
  }

  private drawPlayerCard(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    w: number,
    h: number,
    borderColor: number,
    active: boolean,
  ): void {
    g.clear();
    const bx = cx - w / 2;
    const by = cy - h / 2;
    const r = w > 250 ? 14 : 10;
    const depth = active ? 4 : 2;

    // Card drop shadow
    g.fillStyle(0x000000, active ? 0.45 : 0.25);
    g.fillRoundedRect(bx, by + depth, w, h, r);

    // Card extruded base
    g.fillStyle(0x070b14, 1);
    g.fillRoundedRect(bx, by + depth - 1, w, h, r);

    // Card main surface
    g.fillStyle(COLORS.card, 1);
    g.fillRoundedRect(bx, by, w, h, r);

    // Active glow fill
    if (active) {
      g.fillStyle(borderColor, 0.14);
      g.fillRoundedRect(bx, by, w, h, r);
    }

    // Top specular highlight edge
    g.fillStyle(0xffffff, active ? 0.2 : 0.08);
    g.fillRoundedRect(bx + 1, by + 1, w - 2, 4, { tl: r - 1, tr: r - 1, bl: 0, br: 0 });

    // Metallic border
    g.lineStyle(active ? 2.5 : 1.5, borderColor, active ? 0.95 : 0.4);
    g.strokeRoundedRect(bx, by, w, h, r);
  }

  private createSoundToggle(depth: number, x: number, y: number): void {
    this.soundGfx = this.scene.add.graphics();
    this.soundGfx.setDepth(depth + 2);
    this.drawSoundBtn(false);

    const hit = this.scene.add.circle(x, y, 18, 0xffffff, 0);
    hit.setDepth(depth + 3).setInteractive({ useHandCursor: true });
    hit.on("pointerdown", () => {
      this.soundMuted = !this.soundMuted;
      this.drawSoundBtn(false);
      if (this.muteCallback) this.muteCallback();
    });
    hit.on("pointerover", () => this.drawSoundBtn(true));
    hit.on("pointerout", () => this.drawSoundBtn(false));
  }

  private drawSoundBtn(hover: boolean): void {
    this.soundGfx.clear();
    const cx = this.isPortrait ? 670 : PANEL_X + 235;
    const cy = this.isPortrait ? 20 : 28;
    const active = !this.soundMuted;

    // Glass circular base
    this.soundGfx.fillStyle(0x0f172a, hover ? 0.98 : 0.85);
    this.soundGfx.fillCircle(cx, cy, 16);
    this.soundGfx.lineStyle(1.6, hover ? 0x6366f1 : 0x334155, 0.9);
    this.soundGfx.strokeCircle(cx, cy, 16);

    // Vector speaker cone
    const iconColor = active ? 0xe2e8f0 : 0x64748b;
    this.soundGfx.fillStyle(iconColor, 1);
    this.soundGfx.fillRect(cx - 8, cy - 4, 4, 8);
    this.soundGfx.fillTriangle(cx - 4, cy - 4, cx, cy - 8, cx, cy + 8);
    this.soundGfx.fillRect(cx - 4, cy - 4, 2, 8);

    if (active) {
      this.soundGfx.lineStyle(1.8, iconColor, 0.9);
      this.soundGfx.beginPath();
      this.soundGfx.arc(cx + 1, cy, 6, -Math.PI / 3.5, Math.PI / 3.5, false);
      this.soundGfx.strokePath();
      this.soundGfx.beginPath();
      this.soundGfx.arc(cx + 1, cy, 10, -Math.PI / 3.5, Math.PI / 3.5, false);
      this.soundGfx.strokePath();
    } else {
      this.soundGfx.lineStyle(2, 0xef4444, 0.95);
      this.soundGfx.lineBetween(cx - 7, cy - 7, cx + 7, cy + 7);
    }
  }

  private drawTurnBanner(color: number): void {
    this.turnBg.clear();
    const w = this.isPortrait ? 420 : 490;
    const h = this.isPortrait ? 42 : 52;
    const bx = (this.isPortrait ? 360 : PANEL_X) - w / 2;
    const by = this.isPortrait ? 31 : 48;
    const r = this.isPortrait ? 10 : 14;

    // Banner drop shadow
    this.turnBg.fillStyle(0x000000, 0.35);
    this.turnBg.fillRoundedRect(bx, by + 3, w, h, r);

    // Main surface
    this.turnBg.fillStyle(COLORS.card, 1);
    this.turnBg.fillRoundedRect(bx, by, w, h, r);

    // Glowing active color accent tint
    this.turnBg.fillStyle(color, 0.15);
    this.turnBg.fillRoundedRect(bx, by, w, h, r);

    // Top specular sheen
    this.turnBg.fillStyle(0xffffff, 0.25);
    this.turnBg.fillRoundedRect(bx + 1, by + 1, w - 2, 4, { tl: r - 1, tr: r - 1, bl: 0, br: 0 });

    // Border
    this.turnBg.lineStyle(2, color, 0.85);
    this.turnBg.strokeRoundedRect(bx, by, w, h, r);
  }

  updateTurn(playerId: number): void {
    const name = this.playerNames[(playerId - 1) % 4] ?? `PLAYER ${playerId}`;
    const color = PLAYER_HEX[(playerId - 1) % 4] ?? "#38bdf8";
    const colorInt = PLAYER_COLORS[(playerId - 1) % 4] ?? 0x38bdf8;
    const reduced = prefersReducedMotion();

    if (reduced) {
      this.turnText.setText(`${name}'S TURN`);
      this.turnText.setColor(color);
      this.drawTurnBanner(colorInt);
      this.setActivePlayerCard(playerId);
      return;
    }

    // Animated turn transition
    this.scene.tweens.add({
      targets: this.turnText,
      alpha: 0,
      y: this.turnText.y - 6,
      duration: animDuration(140),
      ease: "Sine.In",
      onComplete: () => {
        this.turnText.setText(`${name}'S TURN`);
        this.turnText.setColor(color);
        this.drawTurnBanner(colorInt);
        this.turnText.y += 12;
        this.scene.tweens.add({
          targets: this.turnText,
          alpha: 1,
          y: this.turnText.y - 6,
          duration: animDuration(140),
          ease: "Sine.Out",
        });
      },
    });

    this.setActivePlayerCard(playerId);
  }

  private setActivePlayerCard(playerId: number): void {
    const idx = playerId - 1;
    for (let i = 0; i < this.playerCardBgs.length; i++) {
      const color = PLAYER_COLORS[i] ?? 0x94a3b8;
      const isActive = i === idx;
      const geom = this.playerCardGeoms[i] ?? { cx: PANEL_X, cy: 344 + i * 92, w: 490, h: 76 };
      this.drawPlayerCard(this.playerCardBgs[i], geom.cx, geom.cy, geom.w, geom.h, color, isActive);
    }

    // Update status texts
    for (let i = 0; i < this.playerStatusTexts.length; i++) {
      const st = this.playerStatusTexts[i];
      if (!st) continue;
      if (i === idx) {
        st.setText("ACTIVE");
        st.setColor("#4ade80");
      } else {
        st.setText("WAITING");
        st.setColor("#64748b");
      }
    }
  }

  updatePlayerTile(playerId: number, tile: number): void {
    const t = this.playerTileTexts[playerId - 1];
    if (t) t.setText(`Tile ${tile}`);
  }

  addLog(message: string): void {
    const reduced = prefersReducedMotion();

    for (let i = this.logLines.length - 1; i > 0; i--) {
      const prev = this.logLines[i - 1];
      const curr = this.logLines[i];
      if (prev && curr) curr.setText(prev.text);
    }
    const first = this.logLines[0];
    if (first) {
      first.setText(`> ${message}`);
      if (!reduced) {
        first.setAlpha(0);
        this.scene.tweens.add({ targets: first, alpha: 1, duration: animDuration(200) });
      }
    }
  }

  /** Replace the visible move log with authoritative server lines. */
  setLogs(logs: string[]): void {
    const lines = logs.slice(0, HUDManager.MAX_LOG);
    for (let i = 0; i < HUDManager.MAX_LOG; i++) {
      const line = lines[i];
      const target = this.logLines[i];
      if (target) target.setText(line ? `> ${line}` : "");
    }
  }
}

export default HUDManager;
