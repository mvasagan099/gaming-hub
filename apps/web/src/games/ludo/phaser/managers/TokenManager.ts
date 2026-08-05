import Phaser from "phaser";
import type { Token, PlayerColor } from "../types/ludo.types";
import { LudoEvents } from "../events/LudoEvents";
import { yardSpawnPixel, mainPathPixel, homeColPixel, HOME_COL_BASE, CELL_SIZE } from "../data/boardLayout";

/** Per-token small offsets when stacked on same tile */
const STACK_OFFSETS: Array<{ x: number; y: number }> = [
  { x: -8, y: -8 },
  { x:  8, y: -8 },
  { x: -8, y:  8 },
  { x:  8, y:  8 },
];

const TOKEN_COLORS: Record<PlayerColor, { main: number; dark: number; light: number }> = {
  red:    { main: 0xef4444, dark: 0xb91c1c, light: 0xfca5a5 },
  blue:   { main: 0x3b82f6, dark: 0x1d4ed8, light: 0x93c5fd },
  green:  { main: 0x22c55e, dark: 0x15803d, light: 0x86efac },
  yellow: { main: 0xeab308, dark: 0xa16207, light: 0xfde047 },
};

const COLOR_INITIALS: Record<PlayerColor, string[]> = {
  red:    ["R1", "R2", "R3", "R4"],
  blue:   ["B1", "B2", "B3", "B4"],
  green:  ["G1", "G2", "G3", "G4"],
  yellow: ["Y1", "Y2", "Y3", "Y4"],
};

interface TokenObject {
  token: Token;
  container: Phaser.GameObjects.Container;
  graphics: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  glowTween?: Phaser.Tweens.Tween;
  idleTween?: Phaser.Tweens.Tween;
}

export default class TokenManager {
  private scene: Phaser.Scene;
  private tokenObjects = new Map<string, TokenObject>();
  private tokenRadius  = Math.round(CELL_SIZE * 0.35);

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Create all token containers for the provided token list */
  createTokens(tokens: Token[]): void {
    for (const token of tokens) {
      this.createToken(token);
    }
  }

  private createToken(token: Token): void {
    const { x, y } = this.getPixelForToken(token);
    const palette   = TOKEN_COLORS[token.color];
    const radius    = this.tokenRadius;
    const label     = COLOR_INITIALS[token.color][token.index] ?? token.id;

    const g = this.scene.add.graphics();

    // Drop shadow
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(2, radius * 0.3 + 3, radius * 2.2, radius * 0.8);

    // Main body
    g.fillStyle(palette.main, 1);
    g.fillCircle(0, 0, radius);

    // Dark border
    const dc = Phaser.Display.Color.IntegerToColor(palette.dark);
    g.lineStyle(2, dc.color, 1);
    g.strokeCircle(0, 0, radius);

    // Dome highlight
    g.fillStyle(0xffffff, 0.28);
    g.fillEllipse(-radius * 0.3, -radius * 0.35, radius, radius * 0.7);

    // Specular dot
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(-radius * 0.35, -radius * 0.4, radius * 0.2);

    const txt = this.scene.add.text(0, 1, label, {
      fontSize:   "8px",
      color:      "#ffffff",
      fontFamily: "Outfit, sans-serif",
      fontStyle:  "bold",
    }).setOrigin(0.5);

    // Invisible hit area (interactive)
    const hitArea = this.scene.add.circle(0, 0, radius, 0xffffff, 0);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on("pointerdown", () => {
      this.scene.events.emit(LudoEvents.TOKEN_SELECTED, token.id);
    });

    const container = this.scene.add.container(x, y, [g, txt, hitArea]);
    container.setDepth(50);

    const obj: TokenObject = { token, container, graphics: g, label: txt };
    this.tokenObjects.set(token.id, obj);

    // Start idle animation in yard
    if (token.state === "yard") {
      this.startIdleAnimation(obj);
    }
  }

  // ─── Movement ────────────────────────────────────────────────────────────────

  /**
   * Move a token step-by-step along a path of positions.
   * @param tokenId  Token id
   * @param path     Array of global position numbers to visit
   * @param onComplete  Called when animation ends
   */
  moveAlongPath(tokenId: string, path: number[], color: PlayerColor, onComplete?: () => void): void {
    const obj = this.tokenObjects.get(tokenId);
    if (!obj || path.length === 0) { onComplete?.(); return; }

    this.stopIdleAnimation(obj);

    let stepIndex = 0;

    const hop = () => {
      if (stepIndex >= path.length) {
        this.bounceOnLand(obj);
        this.scene.time.delayedCall(200, () => onComplete?.());
        return;
      }

      const pos    = path[stepIndex]!;
      const pixel  = this.positionToPixel(color, pos, obj.token.index);
      stepIndex++;

      this.scene.tweens.add({
        targets:  obj.container,
        x:        pixel.x,
        y:        pixel.y - 4,   // slight hop
        duration: 120,
        ease:     "Sine.InOut",
        onComplete: hop,
      });
    };

    hop();
  }

  /** Snap to yard (after capture) with a quick fly-back */
  sendToYard(tokenId: string, color: PlayerColor, tokenIndex: number, onComplete?: () => void): void {
    const obj = this.tokenObjects.get(tokenId);
    if (!obj) { onComplete?.(); return; }

    const { x, y } = yardSpawnPixel(color, tokenIndex);

    // Quick shake
    this.scene.tweens.add({
      targets:  obj.container,
      x:        obj.container.x + 10,
      duration: 60,
      ease:     "Linear",
      yoyo:     true,
      repeat:   3,
      onComplete: () => {
        // Fly back
        this.scene.tweens.add({
          targets:  obj.container,
          x, y,
          duration: 500,
          ease:     "Back.In",
          onComplete: () => {
            this.startIdleAnimation(obj);
            onComplete?.();
          },
        });
      },
    });
  }

  // ─── Highlight / Selection ────────────────────────────────────────────────────

  glowToken(tokenId: string): void {
    const obj = this.tokenObjects.get(tokenId);
    if (!obj) return;

    obj.glowTween?.stop();
    obj.glowTween = this.scene.tweens.add({
      targets:  obj.container,
      scale:    1.25,
      duration: 350,
      ease:     "Sine.InOut",
      yoyo:     true,
      repeat:   -1,
    });
  }

  clearGlow(tokenId: string): void {
    const obj = this.tokenObjects.get(tokenId);
    if (!obj) return;
    obj.glowTween?.stop();
    obj.glowTween = undefined;
    this.scene.tweens.add({ targets: obj.container, scale: 1, duration: 150 });
  }

  clearAllGlows(): void {
    for (const id of this.tokenObjects.keys()) {
      this.clearGlow(id);
    }
  }

  highlightClickable(tokenIds: string[]): void {
    this.clearAllGlows();
    for (const id of tokenIds) {
      this.glowToken(id);
    }
  }

  // ─── Win celebration ─────────────────────────────────────────────────────────

  celebrateWinner(color: PlayerColor): void {
    for (const [, obj] of this.tokenObjects) {
      if (obj.token.color !== color) continue;
      this.scene.tweens.add({
        targets:  obj.container,
        y:        obj.container.y - 20,
        scale:    1.4,
        duration: 400,
        ease:     "Back.Out",
        yoyo:     true,
        repeat:   3,
      });
    }
  }

  // ─── Token update after state change ────────────────────────────────────────

  syncToken(token: Token): void {
    const obj = this.tokenObjects.get(token.id);
    if (!obj) return;

    obj.token = token;

    if (token.state === "finished") {
      this.stopIdleAnimation(obj);
      // Shrink slightly for finished tokens
      this.scene.tweens.add({ targets: obj.container, scale: 0.7, duration: 300 });
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private getPixelForToken(token: Token): { x: number; y: number } {
    if (token.position === -1) return yardSpawnPixel(token.color, token.index);
    const homeBase = HOME_COL_BASE[token.color];
    if (token.position >= homeBase) {
      return homeColPixel(token.color, token.position - homeBase);
    }
    return mainPathPixel(token.position);
  }

  private positionToPixel(color: PlayerColor, pos: number, tokenIndex: number): { x: number; y: number } {
    if (pos === -1) return yardSpawnPixel(color, tokenIndex);
    const homeBase = HOME_COL_BASE[color];
    const offset   = STACK_OFFSETS[tokenIndex % 4] ?? { x: 0, y: 0 };
    if (pos >= homeBase) {
      const base = homeColPixel(color, pos - homeBase);
      return { x: base.x + offset.x, y: base.y + offset.y };
    }
    const base = mainPathPixel(pos);
    return { x: base.x + offset.x, y: base.y + offset.y };
  }

  private bounceOnLand(obj: TokenObject): void {
    this.scene.tweens.add({
      targets:  obj.container,
      y:        obj.container.y - 8,
      duration: 100,
      ease:     "Sine.Out",
      yoyo:     true,
    });
  }

  private startIdleAnimation(obj: TokenObject): void {
    obj.idleTween?.stop();
    obj.idleTween = this.scene.tweens.add({
      targets:  obj.container,
      y:        obj.container.y - 4,
      duration: 800 + Math.random() * 400,
      ease:     "Sine.InOut",
      yoyo:     true,
      repeat:   -1,
    });
  }

  private stopIdleAnimation(obj: TokenObject): void {
    obj.idleTween?.stop();
    obj.idleTween = undefined;
  }

  getTokenObject(id: string): TokenObject | undefined {
    return this.tokenObjects.get(id);
  }
}

export { TokenManager };
