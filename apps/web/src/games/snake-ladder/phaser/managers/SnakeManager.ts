import Phaser from "phaser";
import { snakes, snakeLookup } from "../data/snakes";
import type BoardManager from "./BoardManager";
import { SnakeRenderer, type RenderedSnakeInstance } from "./SnakeRenderer";

/**
 * SnakeManager handles game queries, board tile mapping, and delegates
 * presentation to the dedicated SnakeRenderer.
 */
export class SnakeManager {
  private readonly lookup = snakeLookup;
  private renderer: SnakeRenderer | null = null;
  private renderedSnakes: RenderedSnakeInstance[] = [];

  hasSnake(tile: number): boolean {
    return this.lookup.has(tile);
  }

  getTail(tile: number): number | undefined {
    return this.lookup.get(tile);
  }

  checkSnake(tile: number): number {
    return this.lookup.get(tile) ?? tile;
  }

  getAllSnakeHeads(): number[] {
    return Array.from(this.lookup.keys());
  }

  /**
   * Draw all realistic 3D snakes on the board using the dedicated SnakeRenderer.
   */
  drawSnakes(scene: Phaser.Scene, board: BoardManager): void {
    if (this.renderer) {
      this.renderer.destroy();
    }

    this.renderer = new SnakeRenderer(scene);
    this.renderedSnakes = [];

    snakes.forEach((snake, idx) => {
      const headPos = board.getTilePosition(snake.head);
      const tailPos = board.getTilePosition(snake.tail);

      const instance = this.renderer!.renderSnake(
        snake.head,
        snake.tail,
        headPos,
        tailPos,
        idx,
      );

      if (instance) {
        this.renderedSnakes.push(instance);
      }
    });

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.renderer?.destroy();
      this.renderer = null;
      this.renderedSnakes = [];
    });
  }

  /** Trigger bite reaction on token landing (head lifts, tongue flicks, warning glow) */
  triggerSnakeReaction(headTile: number, scene?: Phaser.Scene): void {
    this.renderer?.triggerReaction(headTile);
  }

  /** Highlight the snake at the given head tile */
  highlightSnake(headTile: number): void {
    this.renderer?.highlight(headTile);
  }

  animateHighlightIn(scene?: Phaser.Scene): void {
    // Handled directly inside renderer.highlight
  }

  animateHighlightOut(scene?: Phaser.Scene): void {
    this.renderer?.unhighlightAll();
  }

  /**
   * Get a sampled path along the exact serpentine spline curve for token descent animation.
   * Matches the rendered snake curve with 100% precision.
   */
  getSnakePath(headTile: number, board: BoardManager): Phaser.Math.Vector2[] {
    const instance = this.renderedSnakes.find(s => s.headCell === headTile);
    if (!instance) {
      const snake = snakes.find(s => s.head === headTile);
      if (!snake) return [];
      const head = board.getTilePosition(snake.head);
      const tail = board.getTilePosition(snake.tail);
      const tempRenderer = new SnakeRenderer(board["scene"] as Phaser.Scene);
      const samples = tempRenderer.buildSerpentineSpline(head, tail, snakes.indexOf(snake));
      return samples.map(sp => new Phaser.Math.Vector2(sp.pt.x, sp.pt.y));
    }

    return instance.splinePoints.map(sp => new Phaser.Math.Vector2(sp.pt.x, sp.pt.y));
  }
}

export default SnakeManager;


