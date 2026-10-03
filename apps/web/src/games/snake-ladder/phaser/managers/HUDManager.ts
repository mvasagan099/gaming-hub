import Phaser from "phaser";
import { GameEvents } from "../events/GameEvents";
import { animDuration, prefersReducedMotion } from "../constants";

const PANEL_X = 1080;
const PANEL_W = 560;
const PANEL_H = 800;

const COLORS = {
  p1:     0x0284c7, // Sky Cyan
  p2:     0xe11d48, // Rose Crimson
  p3:     0x059669, // Emerald Jade
  p4:     0xd97706, // Amber Gold
  accent: 0x6366f1, // Electric Indigo
  bg:     0x080d1a, // Dark Midnight Glass
  card:   0x0a1020, // Frosted Slate
  border: 0x1e2d4d, // Bevel Border
};

const PLAYER_COLORS = [0x38bdf8, 0xf43f5e, 0x10b981, 0xfbbf24];
const PLAYER_HEX = ["#38bdf8", "#f43f5e", "#10b981", "#fbbf24"];

export class HUDManager {
  private scene: Phaser.Scene;
  private isPortrait = false;
  private turnText!: Phaser.GameObjects.Text;
  private turnBg!: Phaser.GameObjects.Graphics;
  private playerTileTexts: Phaser.GameObjects.Text[] = [];
  private playerStatusTexts: Phaser.GameObjects.Text[] = [];
  private playerStatusBgs: Phaser.GameObjects.Graphics[] = [];
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
        fontSize: "17px",
        color: "#fbbf24",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        letterSpacing: 2,
        shadow: {
          offsetX: 0,
          offsetY: 2,
          color: "#f59e0b55",
          blur: 10,
          fill: true,
        },
      }).setOrigin(0.5).setDepth(depth + 1);

      // Sound button at top-right
      this.createSoundToggle(depth, 670, 20);

      // ── 2. Top Turn Banner ───────────────────────────────────────────────
      this.turnBg = this.scene.add.graphics();
      this.turnBg.setDepth(depth);
      this.drawTurnBanner(0x38bdf8);

      this.turnText = this.scene.add.text(360, 52, "PLAYER 1'S TURN", {
        fontSize: "15px",
        color: "#38bdf8",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        shadow: {
          offsetX: 0,
          offsetY: 1,
          color: "#38bdf888",
          blur: 6,
          fill: true,
        },
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

        const badgeGlow = this.scene.add.circle(badgeX, badgeY, 14, color, 0.35);
        badgeGlow.setDepth(depth + 1);

        const badge = this.scene.add.circle(badgeX, badgeY, 11, color);
        badge.setStrokeStyle(2, 0xffffff, 0.95);
        badge.setDepth(depth + 1);

        const badgeShine = this.scene.add.circle(badgeX - 3, badgeY - 3, 3, 0xffffff, 0.7);
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
          color: "#e2e8f0",
          fontFamily: "Outfit, sans-serif",
          fontStyle: "bold",
        }).setDepth(depth + 1);
        this.playerTileTexts.push(tileText);

        // Status Pill Badge Background
        const statusBg = this.scene.add.graphics();
        statusBg.setDepth(depth + 1);
        const pillX = cx + cardW / 2 - 44;
        const pillY = cy;
        this.drawStatusPill(statusBg, pillX, pillY, i === 0, true);
        this.playerStatusBgs.push(statusBg);

        // Status Text (ACTIVE / WAITING)
        const statusText = this.scene.add.text(pillX, pillY, i === 0 ? "● ACTIVE" : "WAITING", {
          fontSize: "9px",
          color: i === 0 ? "#4ade80" : "#64748b",
          fontFamily: "Outfit, sans-serif",
          fontStyle: "bold",
        }).setOrigin(0.5, 0.5).setDepth(depth + 2);
        this.playerStatusTexts.push(statusText);
      }

      // ── 4. Bottom Control Deck Panel (y: 826..1060) ──────────────────────
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

      // Match Activity Title
      this.scene.add.text(518, 844, "● MATCH ACTIVITY", {
        fontSize: "12px",
        color: "#38bdf8",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        letterSpacing: 1.5,
      }).setOrigin(0.5).setDepth(depth + 1);

      // Inset Match Activity Surface
      const logBg = this.scene.add.graphics();
      logBg.setDepth(depth);
      logBg.fillStyle(0x060a14, 0.96);
      logBg.fillRoundedRect(355, 860, 325, 184, 12);
      logBg.lineStyle(1.5, 0x1e2d4d, 0.85);
      logBg.strokeRoundedRect(355, 860, 325, 184, 12);

      for (let i = 0; i < HUDManager.MAX_LOG; i++) {
        const t = this.scene.add.text(
          368, 874 + i * 26,
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
      const isTwoPlayer = totalPlayers <= 2;

      // ── 1. 3D Sidebar Background Panel ──────────────────────────────────
      const panelBg = this.scene.add.graphics();
      panelBg.setDepth(depth);

      // Deep panel shadow to the left
      panelBg.fillStyle(0x000000, 0.55);
      panelBg.fillRect(PANEL_X - PANEL_W / 2 - 8, 0, 8, PANEL_H);

      // Deep obsidian-indigo glass slab
      panelBg.fillStyle(0x080d1a, 0.98);
      panelBg.fillRect(PANEL_X - PANEL_W / 2, 0, PANEL_W, PANEL_H);

      // Subtle top ambient spotlight wash
      panelBg.fillStyle(0x131d3d, 0.45);
      panelBg.fillRect(PANEL_X - PANEL_W / 2, 0, PANEL_W, 220);

      // Soft ambient warm glow behind title
      panelBg.fillStyle(0xf59e0b, 0.035);
      panelBg.fillCircle(PANEL_X, 36, 160);

      // Luminous left divider neon pinstripe
      panelBg.lineStyle(4, 0x6366f1, 0.18);
      panelBg.lineBetween(PANEL_X - PANEL_W / 2, 0, PANEL_X - PANEL_W / 2, PANEL_H);

      panelBg.lineStyle(2, 0x818cf8, 0.7);
      panelBg.lineBetween(PANEL_X - PANEL_W / 2, 0, PANEL_X - PANEL_W / 2, 400);

      panelBg.lineStyle(1.5, 0x1e2d4d, 0.85);
      panelBg.lineBetween(PANEL_X - PANEL_W / 2, 400, PANEL_X - PANEL_W / 2, PANEL_H);

      // ── 2. Title & Header ───────────────────────────────────────────────
      this.scene.add.text(PANEL_X, 13, "★ ARCADE ARENA ★", {
        fontSize: "10.5px",
        color: "#38bdf8",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        letterSpacing: 3,
      }).setOrigin(0.5).setDepth(depth + 1);

      this.scene.add.text(PANEL_X, 33, "SNAKE & LADDER", {
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

      // Sound toggle button at top right
      this.createSoundToggle(depth, PANEL_X + 235, 28);

      // ── 3. 3D Turn Banner ───────────────────────────────────────────────
      this.turnBg = this.scene.add.graphics();
      this.turnBg.setDepth(depth);
      this.drawTurnBanner(0x38bdf8);

      this.turnText = this.scene.add.text(PANEL_X, 74, "PLAYER 1'S TURN", {
        fontSize: "21px",
        color: "#38bdf8",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        letterSpacing: 1.5,
        shadow: {
          offsetX: 0,
          offsetY: 1,
          color: "#38bdf888",
          blur: 8,
          fill: true,
        },
      }).setOrigin(0.5).setDepth(depth + 1);

      // ── 4. Dice Area Subtitle ───────────────────────────────────────────
      this.scene.add.text(PANEL_X, 118, "✦ DICE CONTROLLER ✦", {
        fontSize: "12.5px",
        color: "#94a3b8",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        letterSpacing: 2,
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

        const badgeGlow = this.scene.add.circle(badgeX, badgeY, badgeRadius + 4, color, 0.35);
        badgeGlow.setDepth(depth + 1);

        const badge = this.scene.add.circle(badgeX, badgeY, badgeRadius, color);
        badge.setStrokeStyle(2, 0xffffff, 0.95);
        badge.setDepth(depth + 1);

        // Specular glint on avatar badge
        const badgeShine = this.scene.add.circle(badgeX - 5, badgeY - 5, 5, 0xffffff, 0.7);
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
          color: "#e2e8f0",
          fontFamily: "Outfit, sans-serif",
          fontStyle: "bold",
        }).setDepth(depth + 1);
        this.playerTileTexts.push(tileText);

        // Status Pill Badge Background
        const statusBg = this.scene.add.graphics();
        statusBg.setDepth(depth + 1);
        const pillX = PANEL_X + cardW / 2 - 58;
        const pillY = cy;
        this.drawStatusPill(statusBg, pillX, pillY, i === 0, false);
        this.playerStatusBgs.push(statusBg);

        // Status Text (ACTIVE / WAITING)
        const statusText = this.scene.add.text(pillX, pillY, i === 0 ? "● ACTIVE" : "WAITING", {
          fontSize: isTwoPlayer ? "12px" : "11px",
          color: i === 0 ? "#4ade80" : "#64748b",
          fontFamily: "Outfit, sans-serif",
          fontStyle: "bold",
          letterSpacing: 1.2,
        }).setOrigin(0.5, 0.5).setDepth(depth + 2);
        this.playerStatusTexts.push(statusText);
      }

      // ── 6. Inset 3D Move Log Tray ───────────────────────────────────────
      const logHeaderY = isTwoPlayer ? 506 : 614;

      this.scene.add.text(PANEL_X, logHeaderY, "● MATCH ACTIVITY", {
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

      const logBg = this.scene.add.graphics();
      logBg.setDepth(depth);

      const logBoxY = isTwoPlayer ? 524 : 630;
      const logBoxW = 490;
      const logBoxH = isTwoPlayer ? 246 : 140;

      // Inset drop shadow
      logBg.fillStyle(0x000000, 0.45);
      logBg.fillRoundedRect(PANEL_X - logBoxW / 2, logBoxY, logBoxW, logBoxH, 12);

      // Dark recessed log surface
      logBg.fillStyle(0x060a14, 0.96);
      logBg.fillRoundedRect(PANEL_X - logBoxW / 2, logBoxY, logBoxW, logBoxH, 12);

      // Top cyan reflex line
      logBg.fillStyle(0x38bdf8, 0.25);
      logBg.fillRoundedRect(PANEL_X - logBoxW / 2 + 1, logBoxY + 1, logBoxW - 2, 2, { tl: 11, tr: 11, bl: 0, br: 0 });

      // Bevel border
      logBg.lineStyle(1.4, 0x1e2d4d, 0.9);
      logBg.strokeRoundedRect(PANEL_X - logBoxW / 2, logBoxY, logBoxW, logBoxH, 12);

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

    // ── Listen to movement events ────────────────────────────────────────
    this.scene.events.on(GameEvents.MOVEMENT_FINISHED, (id: number, tile: number) => {
      this.updatePlayerTile(id, tile);
    });
  }

  private drawStatusPill(g: Phaser.GameObjects.Graphics, cx: number, cy: number, active: boolean, isPortrait = false): void {
    g.clear();
    const pw = isPortrait ? 66 : 82;
    const ph = isPortrait ? 22 : 26;
    const px = cx - pw / 2;
    const py = cy - ph / 2;
    const r = ph / 2;

    if (active) {
      // Glow aura
      g.fillStyle(0x10b981, 0.18);
      g.fillRoundedRect(px - 2, py - 2, pw + 4, ph + 4, r + 2);
      // Pill fill
      g.fillStyle(0x064e3b, 0.88);
      g.fillRoundedRect(px, py, pw, ph, r);
      // Neon stroke
      g.lineStyle(1.4, 0x10b981, 0.95);
      g.strokeRoundedRect(px, py, pw, ph, r);
    } else {
      // Pill fill
      g.fillStyle(0x0f172a, 0.65);
      g.fillRoundedRect(px, py, pw, ph, r);
      // Subtle stroke
      g.lineStyle(1.2, 0x334155, 0.55);
      g.strokeRoundedRect(px, py, pw, ph, r);
    }
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

    if (active) {
      // Outer colored neon glow
      g.fillStyle(borderColor, 0.14);
      g.fillRoundedRect(bx - 3, by - 2, w + 6, h + 6, r + 2);
    }

    // Card drop shadow
    g.fillStyle(0x000000, active ? 0.45 : 0.25);
    g.fillRoundedRect(bx, by + depth + 1, w, h, r);

    // Card extruded base
    g.fillStyle(0x060a14, 1);
    g.fillRoundedRect(bx, by + depth, w, h, r);

    // Card main surface
    g.fillStyle(active ? 0x0c162c : 0x0a1020, 0.96);
    g.fillRoundedRect(bx, by, w, h, r);

    // Active glow fill
    if (active) {
      g.fillStyle(borderColor, 0.16);
      g.fillRoundedRect(bx, by, w, h, r);
    }

    // Top specular highlight edge
    g.fillStyle(0xffffff, active ? 0.22 : 0.08);
    g.fillRoundedRect(bx + 1, by + 1, w - 2, 4, { tl: r - 1, tr: r - 1, bl: 0, br: 0 });

    // Metallic neon border
    g.lineStyle(active ? 2.2 : 1.2, active ? borderColor : 0x1e2d4d, active ? 0.95 : 0.6);
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
    this.soundGfx.fillStyle(0x0b1328, hover ? 0.98 : 0.88);
    this.soundGfx.fillCircle(cx, cy, 16);
    this.soundGfx.lineStyle(1.8, hover ? 0x38bdf8 : (active ? 0xf59e0b : 0x334155), 0.9);
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

    // Ambient soft drop shadow / outer glow
    this.turnBg.fillStyle(color, 0.16);
    this.turnBg.fillRoundedRect(bx - 3, by - 1, w + 6, h + 5, r + 2);

    // Deep panel shadow
    this.turnBg.fillStyle(0x000000, 0.4);
    this.turnBg.fillRoundedRect(bx, by + 3, w, h, r);

    // Dark glass base slab
    this.turnBg.fillStyle(0x0a1022, 0.96);
    this.turnBg.fillRoundedRect(bx, by, w, h, r);

    // Glowing active color accent tint
    this.turnBg.fillStyle(color, 0.18);
    this.turnBg.fillRoundedRect(bx, by, w, h, r);

    // Top specular sheen
    this.turnBg.fillStyle(0xffffff, 0.26);
    this.turnBg.fillRoundedRect(bx + 1, by + 1, w - 2, 4.5, { tl: r - 1, tr: r - 1, bl: 0, br: 0 });

    // Luminous neon border
    this.turnBg.lineStyle(2, color, 0.95);
    this.turnBg.strokeRoundedRect(bx, by, w, h, r);

    // Inner subtle hairline
    this.turnBg.lineStyle(1, 0xffffff, 0.12);
    this.turnBg.strokeRoundedRect(bx + 1.5, by + 1.5, w - 3, h - 3, r - 1);
  }

  updateTurn(playerId: number): void {
    const name = this.playerNames[(playerId - 1) % 4] ?? `PLAYER ${playerId}`;
    const color = PLAYER_HEX[(playerId - 1) % 4] ?? "#38bdf8";
    const colorInt = PLAYER_COLORS[(playerId - 1) % 4] ?? 0x38bdf8;
    const reduced = prefersReducedMotion();

    // Broadcast turn changed so Dice dais syncs
    this.scene.events.emit(GameEvents.TURN_CHANGED, playerId);

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

      if (this.playerStatusBgs[i]) {
        const pillX = this.isPortrait ? (geom.cx + geom.w / 2 - 44) : (PANEL_X + geom.w / 2 - 58);
        const pillY = geom.cy;
        this.drawStatusPill(this.playerStatusBgs[i], pillX, pillY, isActive, this.isPortrait);
      }
    }

    // Update status texts
    for (let i = 0; i < this.playerStatusTexts.length; i++) {
      const st = this.playerStatusTexts[i];
      if (!st) continue;
      if (i === idx) {
        st.setText("● ACTIVE");
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
      if (prev && curr) {
        curr.setText(prev.text);
        curr.setColor(i === 1 ? "#cbd5e1" : (i === 2 ? "#94a3b8" : "#64748b"));
      }
    }
    const first = this.logLines[0];
    if (first) {
      first.setText(`▸ ${message}`);
      first.setColor("#38bdf8");
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
      if (target) {
        target.setText(line ? `▸ ${line}` : "");
        target.setColor(i === 0 ? "#38bdf8" : (i === 1 ? "#cbd5e1" : (i === 2 ? "#94a3b8" : "#64748b")));
      }
    }
  }
}

export default HUDManager;

