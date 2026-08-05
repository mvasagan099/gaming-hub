import Phaser from "phaser";
import { GameEvents } from "../events/GameEvents";

const PANEL_X = 912;
const PANEL_W = 224;
const PANEL_H = 800;

const COLORS = {
  p1:      0xef4444,
  p2:      0x10b981,
  p3:      0x3b82f6,
  p4:      0xf59e0b,
  accent:  0x6366f1,
  bg:      0x090d16,
  card:    0x0f172a,
  border:  0x1e293b,
};

const PLAYER_COLORS = [COLORS.p1, COLORS.p2, COLORS.p3, COLORS.p4];

export class HUDManager {
  private scene: Phaser.Scene;
  private turnText!: Phaser.GameObjects.Text;
  private playerTileTexts: Phaser.GameObjects.Text[] = [];
  private logLines: Phaser.GameObjects.Text[] = [];
  private static readonly MAX_LOG = 4;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(totalPlayers = 2): void {
    const depth = 10;  // below dice (depth 100) but above board

    // Sidebar background panel
    const panelBg = this.scene.add.rectangle(PANEL_X, 400, PANEL_W, PANEL_H, COLORS.bg);
    panelBg.setStrokeStyle(2, COLORS.border);
    panelBg.setDepth(depth);

    // ── Title ────────────────────────────────────────────────────────────
    const title = this.scene.add.text(PANEL_X, 22, "SNAKE & LADDER", {
      fontSize: "13px",
      color: "#f59e0b",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(depth + 1);

    // ── Turn banner ──────────────────────────────────────────────────────
    const turnBg = this.scene.add.rectangle(PANEL_X, 65, 190, 44, COLORS.card);
    turnBg.setStrokeStyle(2, COLORS.accent);
    turnBg.setDepth(depth);

    this.turnText = this.scene.add.text(PANEL_X, 65, "PLAYER 1'S TURN", {
      fontSize: "11px",
      color: "#38bdf8",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(depth + 1);

    // ── Dice area label ──────────────────────────────────────────────────
    this.scene.add.text(PANEL_X, 135, "▶  DICE CONTROLLER", {
      fontSize: "10px",
      color: "#64748b",
      fontFamily: "Outfit, sans-serif",
    }).setOrigin(0.5).setDepth(depth + 1);

    // ── Player cards ─────────────────────────────────────────────────────
    const cardStartY = 360;
    const cardGap = 85;

    for (let i = 0; i < totalPlayers; i++) {
      const cy = cardStartY + i * cardGap;
      const color = PLAYER_COLORS[i] ?? 0x94a3b8;
      const hex   = `#${color.toString(16).padStart(6, "0")}`;
      const label = `Player ${i + 1}`;

      const card = this.scene.add.rectangle(PANEL_X, cy, 190, 72, COLORS.card);
      card.setStrokeStyle(2, color);
      card.setDepth(depth);

      const dot = this.scene.add.circle(PANEL_X - 78, cy, 12, color);
      dot.setStrokeStyle(2, 0xffffff);
      dot.setDepth(depth + 1);

      this.scene.add.text(PANEL_X - 60, cy - 14, label, {
        fontSize: "13px",
        color: hex,
        fontFamily: "Outfit, sans-serif",
        fontStyle: "bold",
      }).setDepth(depth + 1);

      const tileText = this.scene.add.text(PANEL_X - 60, cy + 4, "Tile: 1", {
        fontSize: "11px",
        color: "#94a3b8",
        fontFamily: "Outfit, sans-serif",
      }).setDepth(depth + 1);
      this.playerTileTexts.push(tileText);
    }

    // ── Move log ─────────────────────────────────────────────────────────
    const logY = cardStartY + totalPlayers * cardGap + 16;

    this.scene.add.text(PANEL_X, logY, "MOVE LOG", {
      fontSize: "10px",
      color: "#64748b",
      fontFamily: "Outfit, sans-serif",
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(depth + 1);

    const logBg = this.scene.add.rectangle(PANEL_X, logY + 58, 190, 100, COLORS.card);
    logBg.setStrokeStyle(1, COLORS.border);
    logBg.setDepth(depth);

    for (let i = 0; i < HUDManager.MAX_LOG; i++) {
      const t = this.scene.add.text(
        PANEL_X - 88, logY + 20 + i * 20, "",
        {
          fontSize: "10px",
          color: "#64748b",
          fontFamily: "Outfit, sans-serif",
          wordWrap: { width: 180 },
        }
      ).setDepth(depth + 1);
      this.logLines.push(t);
    }

    // ── Listen to events ─────────────────────────────────────────────────
    this.scene.events.on(GameEvents.MOVEMENT_FINISHED, (id: number, tile: number) => {
      this.updatePlayerTile(id, tile);
    });
  }

  updateTurn(playerId: number): void {
    const names = ["PLAYER 1", "PLAYER 2", "PLAYER 3", "PLAYER 4"];
    const colors = ["#ef4444", "#10b981", "#3b82f6", "#f59e0b"];
    this.turnText.setText(`${names[(playerId - 1) % 4]}'S TURN`);
    this.turnText.setColor(colors[(playerId - 1) % 4] ?? "#38bdf8");
  }

  updatePlayerTile(playerId: number, tile: number): void {
    const t = this.playerTileTexts[playerId - 1];
    if (t) t.setText(`Tile: ${tile}`);
  }

  addLog(message: string): void {
    // Shift lines up
    for (let i = this.logLines.length - 1; i > 0; i--) {
      const prev = this.logLines[i - 1];
      const curr = this.logLines[i];
      if (prev && curr) curr.setText(prev.text);
    }
    const first = this.logLines[0];
    if (first) first.setText(`› ${message}`);
  }

  /** Replace the visible move log with authoritative server lines. */
  setLogs(logs: string[]): void {
    const lines = logs.slice(0, HUDManager.MAX_LOG);
    for (let i = 0; i < HUDManager.MAX_LOG; i++) {
      const line = lines[i];
      const target = this.logLines[i];
      if (target) target.setText(line ? `› ${line}` : "");
    }
  }
}
