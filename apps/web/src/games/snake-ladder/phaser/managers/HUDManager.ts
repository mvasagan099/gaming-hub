import Phaser from "phaser";
import { GameEvents } from "../events/GameEvents";
import { ANIM, animDuration, prefersReducedMotion } from "../constants";

const PANEL_X = 912;
const PANEL_W = 224;
const PANEL_H = 800;

const COLORS = {
  p1:     0xef4444,
  p2:     0x10b981,
  p3:     0x3b82f6,
  p4:     0xf59e0b,
  accent: 0x6366f1,
  bg:     0x090d16,
  card:   0x0f172a,
  border: 0x1e293b,
};

const PLAYER_COLORS = [COLORS.p1, COLORS.p2, COLORS.p3, COLORS.p4];
const PLAYER_HEX = ["#ef4444", "#10b981", "#3b82f6", "#f59e0b"];

export class HUDManager {
  private scene: Phaser.Scene;
  private turnText!: Phaser.GameObjects.Text;
  private turnBg!: Phaser.GameObjects.Graphics;
  private playerTileTexts: Phaser.GameObjects.Text[] = [];
  private playerStatusTexts: Phaser.GameObjects.Text[] = [];
  private logLines: Phaser.GameObjects.Text[] = [];
  private static readonly MAX_LOG = 4;
  private soundBtn!: Phaser.GameObjects.Text;
  private muteCallback: (() => void) | null = null;
  private activePlayerCard: Phaser.GameObjects.Graphics | null = null;
  private playerCardBgs: Phaser.GameObjects.Graphics[] = [];

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

  create(totalPlayers = 2): void {
    const depth = 10;
    const reduced = prefersReducedMotion();

    // ── Sidebar background panel ─────────────────────────────────────────
    const panelBg = this.scene.add.graphics();
    panelBg.setDepth(depth);
    panelBg.fillStyle(COLORS.bg, 1);
    panelBg.fillRoundedRect(PANEL_X - PANEL_W / 2, 0, PANEL_W, PANEL_H, { tl: 0, tr: 0, bl: 0, br: 0 });
    panelBg.lineStyle(1, COLORS.border, 0.6);
    panelBg.strokeRoundedRect(PANEL_X - PANEL_W / 2, 0, PANEL_W, PANEL_H, { tl: 0, tr: 0, bl: 0, br: 0 });

    // ── Title ────────────────────────────────────────────────────────────
    this.scene.add.text(PANEL_X, 22, "SNAKE & LADDER", {
      fontSize: "13px",
      color: "#f59e0b",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 1,
    }).setOrigin(0.5).setDepth(depth + 1);

    // ── Turn banner ──────────────────────────────────────────────────────
    this.turnBg = this.scene.add.graphics();
    this.turnBg.setDepth(depth);
    this.drawTurnBanner(0x6366f1);

    this.turnText = this.scene.add.text(PANEL_X, 65, "PLAYER 1'S TURN", {
      fontSize: "11px",
      color: "#38bdf8",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(depth + 1);

    // ── Dice area label ──────────────────────────────────────────────────
    this.scene.add.text(PANEL_X, 135, "DICE CONTROLLER", {
      fontSize: "10px",
      color: "#475569",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(depth + 1);

    // ── Player cards ─────────────────────────────────────────────────────
    const cardStartY = 330;
    const cardGap = 90;

    for (let i = 0; i < totalPlayers; i++) {
      const cy = cardStartY + i * cardGap;
      const color = PLAYER_COLORS[i] ?? 0x94a3b8;
      const hex = PLAYER_HEX[i] ?? "#94a3b8";

      // Card background
      const card = this.scene.add.graphics();
      card.setDepth(depth);
      this.drawPlayerCard(card, PANEL_X, cy, 190, 78, color, false);
      this.playerCardBgs.push(card);

      // Color dot
      const dot = this.scene.add.circle(PANEL_X - 78, cy - 6, 10, color);
      dot.setStrokeStyle(2, 0xffffff, 0.6);
      dot.setDepth(depth + 1);

      // Player name
      const labelText = this.scene.add.text(PANEL_X - 60, cy - 18, `Player ${i + 1}`, {
        fontSize: "13px",
        color: hex,
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      }).setDepth(depth + 1);
      this.playerLabelTexts.push(labelText);

      // Tile position
      const tileText = this.scene.add.text(PANEL_X - 60, cy + 2, "Tile 1", {
        fontSize: "12px",
        color: "#e2e8f0",
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      }).setDepth(depth + 1);
      this.playerTileTexts.push(tileText);

      // Status text
      const statusText = this.scene.add.text(PANEL_X + 60, cy + 2, "", {
        fontSize: "10px",
        color: "#64748b",
        fontFamily: "Outfit, sans-serif",
      }).setOrigin(1, 0).setDepth(depth + 1);
      this.playerStatusTexts.push(statusText);
    }

    // ── Move log ─────────────────────────────────────────────────────────
    const logY = cardStartY + totalPlayers * cardGap + 16;

    this.scene.add.text(PANEL_X, logY, "MOVE LOG", {
      fontSize: "10px",
      color: "#475569",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(depth + 1);

    const logBg = this.scene.add.graphics();
    logBg.setDepth(depth);
    logBg.fillStyle(COLORS.card, 1);
    logBg.fillRoundedRect(PANEL_X - 95, logY + 14, 190, 100, 6);
    logBg.lineStyle(1, COLORS.border, 0.5);
    logBg.strokeRoundedRect(PANEL_X - 95, logY + 14, 190, 100, 6);

    for (let i = 0; i < HUDManager.MAX_LOG; i++) {
      const t = this.scene.add.text(
        PANEL_X - 88, logY + 22 + i * 22,
        "",
        {
          fontSize: "10px",
          color: "#64748b",
          fontFamily: "Outfit, sans-serif",
          wordWrap: { width: 180 },
        },
      ).setDepth(depth + 1);
      this.logLines.push(t);
    }

    // ── Sound toggle button ──────────────────────────────────────────────
    this.soundBtn = this.scene.add.text(PANEL_X + 80, PANEL_H - 30, "🔊", {
      fontSize: "18px",
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5).setDepth(depth + 2).setInteractive({ useHandCursor: true });

    this.soundBtn.on("pointerdown", () => {
      if (this.muteCallback) this.muteCallback();
      const muted = this.soundBtn.text === "🔊";
      this.soundBtn.setText(muted ? "🔇" : "🔊");
    });

    // ── Listen to events ─────────────────────────────────────────────────
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
    g.fillStyle(COLORS.card, 1);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    g.lineStyle(active ? 3 : 2, borderColor, active ? 1 : 0.5);
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    if (active) {
      g.fillStyle(borderColor, 0.06);
      g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    }
  }

  private drawTurnBanner(color: number): void {
    this.turnBg.clear();
    this.turnBg.fillStyle(COLORS.card, 1);
    this.turnBg.fillRoundedRect(PANEL_X - 95, 43, 190, 44, 8);
    this.turnBg.lineStyle(2, color, 0.7);
    this.turnBg.strokeRoundedRect(PANEL_X - 95, 43, 190, 44, 8);
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
      return;
    }

    // Animated turn transition: fade out, change, fade in
    this.scene.tweens.add({
      targets: this.turnText,
      alpha: 0,
      y: this.turnText.y - 5,
      duration: animDuration(150),
      ease: "Sine.In",
      onComplete: () => {
        this.turnText.setText(`${name}'S TURN`);
        this.turnText.setColor(color);
        this.drawTurnBanner(colorInt);
        this.turnText.y += 10;
        this.scene.tweens.add({
          targets: this.turnText,
          alpha: 1,
          y: this.turnText.y - 5,
          duration: animDuration(150),
          ease: "Sine.Out",
        });
      },
    });

    // Update active player card
    this.setActivePlayerCard(playerId);
  }

  private setActivePlayerCard(playerId: number): void {
    const idx = playerId - 1;
    for (let i = 0; i < this.playerCardBgs.length; i++) {
      const color = PLAYER_COLORS[i] ?? 0x94a3b8;
      const isActive = i === idx;
      this.drawPlayerCard(this.playerCardBgs[i], PANEL_X, 330 + i * 90, 190, 78, color, isActive);
    }

    // Update status texts
    for (let i = 0; i < this.playerStatusTexts.length; i++) {
      const st = this.playerStatusTexts[i];
      if (!st) continue;
      if (i === idx) {
        st.setText("YOUR TURN");
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

    // Shift lines up
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
