import Phaser from "phaser";
import type { ChessPiece, PieceType, PieceColor } from "../types/chess.types";
import { ChessEvents } from "../events/ChessEvents";
import type BoardManager from "./BoardManager";
import { CELL_SIZE, BOARD_OFFSET_X, BOARD_OFFSET_Y } from "./BoardManager";
import { StauntonPieceRenderer } from "./StauntonPieceRenderer";
import { CHESS_ANIMATION_CONFIG, animDuration, prefersReducedMotion } from "../constants/chessAnimationConfig";

interface PieceSprite {
  piece: ChessPiece;
  container: Phaser.GameObjects.Container;
  shadowGfx: Phaser.GameObjects.Graphics;
  auraGfx: Phaser.GameObjects.Graphics;
  bodyGfx: Phaser.GameObjects.Graphics;
  hitZone: Phaser.GameObjects.Rectangle;
  isSelected?: boolean;
}

export class PieceManager {
  private scene: Phaser.Scene;
  private board: BoardManager;
  private pieces = new Map<string, PieceSprite>();

  constructor(scene: Phaser.Scene, board: BoardManager) {
    this.scene = scene;
    this.board = board;
  }

  /**
   * Instantiate and render all pieces on the board.
   */
  createPieces(pieceList: ChessPiece[]): void {
    this.clearAll();
    for (const p of pieceList) {
      this.createPiece(p);
    }
  }

  private createPiece(p: ChessPiece): void {
    const coords = this.board.getPixelCoords(p.square);
    if (!coords) return;

    // 1. Contact Shadow Graphics (Layer 0)
    const shadowGfx = this.scene.add.graphics();
    StauntonPieceRenderer.drawContactShadow(shadowGfx, 0);

    // 2. Selection Aura Graphics (Layer 1)
    const auraGfx = this.scene.add.graphics();
    StauntonPieceRenderer.drawAuraRing(auraGfx, p.color, false, 0);

    // 3. Volumetric 3D Staunton Body Graphics (Layer 2)
    const bodyGfx = this.scene.add.graphics();
    StauntonPieceRenderer.draw3DPiece(bodyGfx, p.type, p.color);

    // 4. Interactive Hit Area
    const zone = this.scene.add.rectangle(0, 0, CELL_SIZE, CELL_SIZE, 0xffffff, 0);
    zone.setInteractive({ useHandCursor: true });
    this.scene.input.setDraggable(zone);

    const container = this.scene.add.container(coords.x, coords.y, [
      shadowGfx,
      auraGfx,
      bodyGfx,
      zone,
    ]);
    container.setDepth(50);

    // Drag-and-drop bindings
    let startX = coords.x;
    let startY = coords.y;

    zone.on("dragstart", () => {
      startX = container.x;
      startY = container.y;
      container.setDepth(100);
      StauntonPieceRenderer.drawContactShadow(shadowGfx, 0.8);
      container.setScale(CHESS_ANIMATION_CONFIG.selectedScale);
      this.scene.events.emit(ChessEvents.PIECE_SELECTED, p.square);
    });

    zone.on("drag", (pointer: Phaser.Input.Pointer) => {
      container.x = pointer.x;
      container.y = pointer.y;
    });

    zone.on("dragend", () => {
      container.setScale(1.0);
      container.setDepth(50);
      StauntonPieceRenderer.drawContactShadow(shadowGfx, 0);

      // Resolve landing square
      const col = Math.floor((container.x - BOARD_OFFSET_X) / CELL_SIZE);
      const row = Math.floor((container.y - BOARD_OFFSET_Y) / CELL_SIZE);
      const targetSq = this.board.gridToSquare(col, row);

      if (targetSq && targetSq !== p.square) {
        this.scene.events.emit(ChessEvents.MOVE_MADE, p.square, targetSq);
      } else {
        // Snap back smoothly if dropped on invalid area
        this.scene.tweens.add({
          targets:  container,
          x:        startX,
          y:        startY,
          duration: animDuration(150),
          ease:     "Sine.Out",
        });
      }
    });

    // Click-to-move and attack support
    zone.on("pointerdown", (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event?.stopPropagation();
      this.scene.events.emit(ChessEvents.SQUARE_CLICKED, p.square);
    });

    const sprite: PieceSprite = {
      piece: p,
      container,
      shadowGfx,
      auraGfx,
      bodyGfx,
      hitZone: zone,
    };
    this.pieces.set(p.id, sprite);
  }

  // ─── Animations ─────────────────────────────────────────────────────────────

  /** Animate piece smoothly lifting, travelling, and landing with squash-stretch bounce */
  movePiece(id: string, targetSq: string, onComplete?: () => void): void {
    const sprite = this.pieces.get(id);
    if (!sprite) { onComplete?.(); return; }

    const targetPos = this.board.getPixelCoords(targetSq);
    if (!targetPos) { onComplete?.(); return; }

    sprite.piece.square = targetSq;
    sprite.container.setDepth(100);

    const reduced = prefersReducedMotion();
    if (reduced) {
      sprite.container.setPosition(targetPos.x, targetPos.y);
      sprite.container.setDepth(50);
      onComplete?.();
      return;
    }

    const duration = animDuration(240);

    // 1. Lift & Travel Phase
    const liftProxy = { t: 0 };
    this.scene.tweens.add({
      targets: liftProxy,
      t: 1,
      duration: duration * 0.5,
      yoyo: true,
      ease: "Sine.InOut",
      onUpdate: () => {
        StauntonPieceRenderer.drawContactShadow(sprite.shadowGfx, liftProxy.t);
      },
    });

    this.scene.tweens.add({
      targets: sprite.container,
      x: targetPos.x,
      y: targetPos.y + CHESS_ANIMATION_CONFIG.moveLiftY,
      scaleX: CHESS_ANIMATION_CONFIG.moveScale,
      scaleY: CHESS_ANIMATION_CONFIG.moveScale,
      duration: duration * 0.7,
      ease: "Cubic.Out",
      onComplete: () => {
        // 2. Landing & Squash-Stretch Rebound
        this.scene.tweens.add({
          targets: sprite.container,
          y: targetPos.y,
          scaleX: CHESS_ANIMATION_CONFIG.landingSquashX,
          scaleY: CHESS_ANIMATION_CONFIG.landingSquashY,
          duration: animDuration(CHESS_ANIMATION_CONFIG.landingBounceDuration),
          ease: "Sine.In",
          onComplete: () => {
            this.scene.tweens.add({
              targets: sprite.container,
              scaleX: 1.0,
              scaleY: 1.0,
              duration: animDuration(60),
              ease: "Sine.Out",
              onComplete: () => {
                sprite.container.setDepth(50);
                onComplete?.();
              },
            });
          },
        });
      },
    });
  }

  /** Animate piece being captured with impact shockwave and smooth fade-out */
  capturePiece(id: string, onComplete?: () => void): void {
    const sprite = this.pieces.get(id);
    if (!sprite) { onComplete?.(); return; }

    this.pieces.delete(id);
    const reduced = prefersReducedMotion();

    if (reduced) {
      sprite.container.destroy();
      onComplete?.();
      return;
    }

    // 1. Expanding impact shockwave
    const shockGfx = this.scene.add.graphics();
    shockGfx.setPosition(sprite.container.x, sprite.container.y);
    shockGfx.setDepth(90);

    const shockProxy = { progress: 0 };
    this.scene.tweens.add({
      targets: shockProxy,
      progress: 1,
      duration: animDuration(320),
      ease: "Cubic.Out",
      onUpdate: () => {
        StauntonPieceRenderer.drawCaptureShockwave(shockGfx, sprite.piece.color, shockProxy.progress);
      },
      onComplete: () => shockGfx.destroy(),
    });

    // 2. Captured piece spin-fade reaction
    this.scene.tweens.add({
      targets:    sprite.container,
      alpha:      0,
      scaleX:     CHESS_ANIMATION_CONFIG.captureScaleOut,
      scaleY:     CHESS_ANIMATION_CONFIG.captureScaleOut,
      angle:      -25,
      duration:   animDuration(CHESS_ANIMATION_CONFIG.captureDuration),
      ease:       "Back.In",
      onComplete: () => {
        sprite.container.destroy();
        onComplete?.();
      },
    });
  }

  /**
   * Rebuild all pieces from a snapshot, then animate the piece that just moved
   * sliding from its previous square to its current one.
   */
  syncPieces(pieceList: ChessPiece[], animateMove?: { from: string; to: string } | null): void {
    this.clearAll();
    for (const p of pieceList) {
      this.createPiece(p);
    }

    if (animateMove?.from && animateMove.to) {
      const target = pieceList.find((p) => p.square === animateMove.to);
      const sprite = target ? this.pieces.get(target.id) : undefined;
      const fromPos = this.board.getPixelCoords(animateMove.from);
      const toPos = this.board.getPixelCoords(animateMove.to);
      if (sprite && fromPos && toPos) {
        sprite.container.setPosition(fromPos.x, fromPos.y);
        this.movePiece(sprite.piece.id, animateMove.to);
      }
    }
  }

  clearAll(): void {
    for (const sprite of this.pieces.values()) {
      sprite.container.destroy();
    }
    this.pieces.clear();
  }

  getPieceAtSquare(square: string): ChessPiece | null {
    for (const sprite of this.pieces.values()) {
      if (sprite.piece.square === square) return sprite.piece;
    }
    return null;
  }
}

export default PieceManager;
