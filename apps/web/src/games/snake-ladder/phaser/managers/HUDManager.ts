import Phaser from "phaser";
import { GameEvents } from "../events/GameEvents";
import { animDuration, prefersReducedMotion } from "../constants";

const PANEL_X = 912;
const PANEL_W = 224;
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
  private static readonly MAX_LOG = 4;
  private soundBtn!: Phaser.GameObjects.Text;
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
        fontSize: "15px",
        color: "#f59e0b",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(depth + 1);

      // Sound button at top-right
      this.soundBtn = this.scene.add.text(670, 20, "🔊", {
        fontSize: "18px",
        padding: { x: 4, y: 2 },
      }).setOrigin(0.5).setDepth(depth + 2).setInteractive({ useHandCursor: true });

      this.soundBtn.on("pointerdown", () => {
        if (this.muteCallback) this.muteCallback();
        const muted = this.soundBtn.text === "🔊";
        this.soundBtn.setText(muted ? "🔇" : "🔊");
      });

      // ── 2. Top Turn Banner ───────────────────────────────────────────────
      this.turnBg = this.scene.add.graphics();
      this.turnBg.setDepth(depth);
      this.drawTurnBanner(0x3b82f6);

      this.turnText = this.scene.add.text(360, 48, "PLAYER 1'S TURN", {
        fontSize: "12px",
        color: "#38bdf8",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      }).setOrigin(0.5).setDepth(depth + 1);

      // ── 3. Player Cards at Top (y: 92) ───────────────────────────────────
      const availableW = 660;
      const cardW = totalPlayers === 2 ? 320 : Math.floor((availableW - (totalPlayers - 1) * 10) / totalPlayers);
      const cardH = 50;
      const startX = 30 + cardW / 2;
      const gapX = cardW + 10;

      for (let i = 0; i < totalPlayers; i++) {
        const cx = startX + i * gapX;
        const cy = 92;
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

      // ── 4. Bottom Control Deck Panel (y: 815..1065) ──────────────────────
      const deckBg = this.scene.add.graphics();
      deckBg.setDepth(depth);

      // Deck background slab
      deckBg.fillStyle(0x000000, 0.45);
      deckBg.fillRoundedRect(24, 824, 672, 240, 18);
      deckBg.fillStyle(COLORS.bg, 0.95);
      deckBg.fillRoundedRect(24, 820, 672, 240, 18);
      deckBg.lineStyle(1.5, COLORS.border, 0.9);
      deckBg.strokeRoundedRect(24, 820, 672, 240, 18);

      // Dice Area Title
      this.scene.add.text(185, 836, "DICE CONTROLLER", {
        fontSize: "11px",
        color: "#64748b",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      }).setOrigin(0.5).setDepth(depth + 1);

      // Match Activity Title
      this.scene.add.text(515, 836, "MATCH ACTIVITY", {
        fontSize: "11px",
        color: "#64748b",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      }).setOrigin(0.5).setDepth(depth + 1);

      // Inset Match Activity Surface
      const logBg = this.scene.add.graphics();
      logBg.setDepth(depth);
      logBg.fillStyle(0x070b14, 1);
      logBg.fillRoundedRect(360, 856, 310, 188, 10);
      logBg.lineStyle(1.5, 0x1e293b, 0.8);
      logBg.strokeRoundedRect(360, 856, 310, 188, 10);

      for (let i = 0; i < HUDManager.MAX_LOG; i++) {
        const t = this.scene.add.text(
          372, 870 + i * 26,
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
      // ── 1. 3D Sidebar Background Panel ──────────────────────────────────
      const panelBg = this.scene.add.graphics();
      panelBg.setDepth(depth);

      // Deep panel shadow
      panelBg.fillStyle(0x000000, 0.4);
      panelBg.fillRect(PANEL_X - PANEL_W / 2 - 6, 0, 6, PANEL_H);

      // Panel background slab
      panelBg.fillStyle(COLORS.bg, 0.95);
      panelBg.fillRect(PANEL_X - PANEL_W / 2, 0, PANEL_W, PANEL_H);

      // Left border bevel
      panelBg.lineStyle(1.5, COLORS.border, 0.9);
      panelBg.lineBetween(PANEL_X - PANEL_W / 2, 0, PANEL_X - PANEL_W / 2, PANEL_H);
      panelBg.lineStyle(1, 0x334155, 0.4);
      panelBg.lineBetween(PANEL_X - PANEL_W / 2 + 1, 0, PANEL_X - PANEL_W / 2 + 1, PANEL_H);

      // ── 2. Title & Header ───────────────────────────────────────────────
      this.scene.add.text(PANEL_X, 22, "SNAKE & LADDER", {
        fontSize: "14px",
        color: "#f59e0b",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 1.5,
      }).setOrigin(0.5).setDepth(depth + 1);

      // ── 3. 3D Turn Banner ───────────────────────────────────────────────
      this.turnBg = this.scene.add.graphics();
      this.turnBg.setDepth(depth);
      this.drawTurnBanner(0x3b82f6);

      this.turnText = this.scene.add.text(PANEL_X, 65, "PLAYER 1'S TURN", {
        fontSize: "12px",
        color: "#38bdf8",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      }).setOrigin(0.5).setDepth(depth + 1);

      // ── 4. Dice Area Subtitle ───────────────────────────────────────────
      this.scene.add.text(PANEL_X, 134, "DICE CONTROLLER", {
        fontSize: "10px",
        color: "#64748b",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      }).setOrigin(0.5).setDepth(depth + 1);

      // ── 5. 3D Player Cards ──────────────────────────────────────────────
      const cardStartY = 330;
      const cardGap = 90;

      for (let i = 0; i < totalPlayers; i++) {
        const cy = cardStartY + i * cardGap;
        const color = PLAYER_COLORS[i] ?? 0x94a3b8;
        const hex = PLAYER_HEX[i] ?? "#94a3b8";

        this.playerCardGeoms.push({ cx: PANEL_X, cy, w: 196, h: 78 });

        // Card 3D background
        const card = this.scene.add.graphics();
        card.setDepth(depth);
        this.drawPlayerCard(card, PANEL_X, cy, 196, 78, color, i === 0);
        this.playerCardBgs.push(card);

        // 3D Avatar Token Badge
        const badgeX = PANEL_X - 74;
        const badgeY = cy;

        const badgeShadow = this.scene.add.circle(badgeX + 1, badgeY + 2, 14, 0x000000, 0.4);
        badgeShadow.setDepth(depth + 1);

        const badge = this.scene.add.circle(badgeX, badgeY, 13, color);
        badge.setStrokeStyle(2, 0xffffff, 0.8);
        badge.setDepth(depth + 1);

        // Specular glint on avatar badge
        const badgeShine = this.scene.add.circle(badgeX - 4, badgeY - 4, 3.5, 0xffffff, 0.6);
        badgeShine.setDepth(depth + 1);

        // Player Name
        const labelText = this.scene.add.text(PANEL_X - 52, cy - 18, `Player ${i + 1}`, {
          fontSize: "13px",
          color: hex,
          fontFamily: "Outfit, sans-serif",
          fontStyle: "bold",
        }).setDepth(depth + 1);
        this.playerLabelTexts.push(labelText);

        // Tile Position Indicator
        const tileText = this.scene.add.text(PANEL_X - 52, cy + 2, "Tile 1", {
          fontSize: "12px",
          color: "#f1f5f9",
          fontFamily: "Outfit, sans-serif",
          fontStyle: "bold",
        }).setDepth(depth + 1);
        this.playerTileTexts.push(tileText);

        // Status Text (YOUR TURN / WAITING)
        const statusText = this.scene.add.text(PANEL_X + 86, cy - 18, i === 0 ? "ACTIVE" : "WAITING", {
          fontSize: "9px",
          color: i === 0 ? "#4ade80" : "#64748b",
          fontFamily: "Outfit, sans-serif",
          fontStyle: "bold",
        }).setOrigin(1, 0).setDepth(depth + 1);
        this.playerStatusTexts.push(statusText);
      }

      // ── 6. Inset 3D Move Log Tray ───────────────────────────────────────
      const logY = cardStartY + totalPlayers * cardGap + 12;

      this.scene.add.text(PANEL_X, logY, "MATCH ACTIVITY", {
        fontSize: "10px",
        color: "#64748b",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      }).setOrigin(0.5).setDepth(depth + 1);

      const logBg = this.scene.add.graphics();
      logBg.setDepth(depth);

      // Inset drop shadow
      logBg.fillStyle(0x000000, 0.4);
      logBg.fillRoundedRect(PANEL_X - 98, logY + 12, 196, 96, 8);
      // Dark recessed log surface
      logBg.fillStyle(0x070b14, 1);
      logBg.fillRoundedRect(PANEL_X - 98, logY + 12, 196, 96, 8);
      // Bevel border
      logBg.lineStyle(1.5, 0x1e293b, 0.8);
      logBg.strokeRoundedRect(PANEL_X - 98, logY + 12, 196, 96, 8);

      for (let i = 0; i < HUDManager.MAX_LOG; i++) {
        const t = this.scene.add.text(
          PANEL_X - 88, logY + 20 + i * 21,
          "",
          {
            fontSize: "10px",
            color: "#94a3b8",
            fontFamily: "Outfit, sans-serif",
            wordWrap: { width: 176 },
          },
        ).setDepth(depth + 1);
        this.logLines.push(t);
      }

      // ── 7. Sound Toggle Button ───────────────────────────────────────────
      this.soundBtn = this.scene.add.text(PANEL_X + 80, PANEL_H - 30, "🔊", {
        fontSize: "18px",
        padding: { x: 4, y: 2 },
      }).setOrigin(0.5).setDepth(depth + 2).setInteractive({ useHandCursor: true });

      this.soundBtn.on("pointerdown", () => {
        if (this.muteCallback) this.muteCallback();
        const muted = this.soundBtn.text === "🔊";
        this.soundBtn.setText(muted ? "🔇" : "🔊");
      });
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
    const r = 10;
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
      g.fillStyle(borderColor, 0.12);
      g.fillRoundedRect(bx, by, w, h, r);
    }

    // Top specular highlight edge
    g.fillStyle(0xffffff, active ? 0.2 : 0.08);
    g.fillRoundedRect(bx + 1, by + 1, w - 2, 4, { tl: r - 1, tr: r - 1, bl: 0, br: 0 });

    // Metallic border
    g.lineStyle(active ? 2.5 : 1.5, borderColor, active ? 0.95 : 0.4);
    g.strokeRoundedRect(bx, by, w, h, r);
  }

  private drawTurnBanner(color: number): void {
    this.turnBg.clear();
    const bx = this.isPortrait ? 180 : (PANEL_X - 98);
    const by = this.isPortrait ? 32 : 43;
    const w = this.isPortrait ? 360 : 196;
    const h = this.isPortrait ? 32 : 44;
    const r = 10;

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
      const geom = this.playerCardGeoms[i] ?? { cx: PANEL_X, cy: 330 + i * 90, w: 196, h: 78 };
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
