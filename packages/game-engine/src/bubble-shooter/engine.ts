import { ServerGameEngine } from "../base/ServerGameEngine";
import type { EngineActionResult, EngineEvent, EnginePlayer, RandomSource } from "../types";
import type {
  BubbleShooterAction,
  BubbleShooterBubbleType,
  BubbleShooterBubbleView,
  BubbleShooterLastShot,
  BubbleShooterPlayerState,
  BubbleShooterServerState,
  BubbleShooterShotResult,
} from "./types";

// Constants mirror the rendered canvas game (`apps/web/src/games/bubble-shooter`).
const COLORS = ["#fb7185", "#818cf8", "#34d399", "#fbbf24", "#c084fc"];
const RADIUS = 11;
const DIAMETER = RADIUS * 2;
const COLS = 13;
const ROW_HEIGHT = RADIUS * Math.sqrt(3);
const CANVAS_WIDTH = COLS * DIAMETER; // 286
const CANVAS_HEIGHT = 460;
const SHOOTER_X = CANVAS_WIDTH / 2;
const SHOOTER_Y = CANVAS_HEIGHT - 25;
const SPEED = 850;
const OVERFLOW_LINE = SHOOTER_Y - 5;
const INITIAL_ROWS = 5;
const SHOTS_PER_DROP = 2;
const MAX_ROWS_TO_SNAP = 25;
const SHOT_DT = 1 / 240;
const MAX_TRAJECTORY_STEPS = 4000;

interface GridCell {
  r: number;
  c: number;
}

function getGridX(row: number, col: number): number {
  const xOffset = Math.abs(row % 2) === 0 ? RADIUS : DIAMETER;
  return xOffset + col * DIAMETER;
}

function getGridY(row: number, topOffset: number): number {
  return RADIUS + (row + topOffset) * ROW_HEIGHT;
}

function colsInRow(row: number): number {
  return Math.abs(row % 2) === 0 ? COLS : COLS - 1;
}

/**
 * Server-authoritative Bubble Shooter engine.
 *
 * Mode: `score-race` (2-8 players). Every player owns an independent board and
 * races to clear it first. The shot physics, grid snapping, match-3 popping,
 * floating drops, row drops and win/overflow checks mirror the canvas client
 * exactly, but are resolved deterministically with a fixed-timestep simulation
 * so replay and reconnect reproduce the same state for the same action stream.
 *
 * Protocol: any active seat sends `{ type: "shoot", angle }`. The fired bubble
 * is the player's current `nextBubble`; the server resolves the landing cell
 * and broadcasts the new board. First player to clear their board wins; if
 * every player is eliminated before anyone clears, the match is a draw.
 */
export class BubbleShooterEngine extends ServerGameEngine<
  BubbleShooterServerState,
  BubbleShooterAction
> {
  readonly gameId = "bubble-shooter" as const;

  constructor(players: EnginePlayer[], rng?: RandomSource) {
    super(players, rng);
    if (players.length < 2) {
      throw new Error("Bubble Shooter requires at least 2 players");
    }
  }

  protected initState(): BubbleShooterServerState {
    const players: BubbleShooterPlayerState[] = this.players.map((p) => {
      const grid = this.makeInitialGrid();
      return {
        seat: p.seat,
        name: `Player ${p.seat + 1}`,
        grid,
        topOffset: 0,
        shotsFired: 0,
        nextBubble: this.rollNextBubble(grid),
        score: 0,
        status: "playing",
        lastShot: null,
      };
    });
    return {
      players,
      currentSeat: 0,
      winnerSeats: [],
      finished: false,
      turnCount: 0,
      result: "none",
    };
  }

  protected validateAction(action: BubbleShooterAction, seat: number): string | null {
    const state = this.state;
    if (state.finished) {
      return "This match has already finished";
    }
    const player = state.players.find((p) => p.seat === seat);
    if (!player || player.status !== "playing") {
      return "You are not in this match anymore";
    }
    if (action.type !== "shoot") {
      return "Unknown action for Bubble Shooter";
    }
    if (typeof action.angle !== "number" || !Number.isFinite(action.angle)) {
      return "A valid angle is required";
    }
    // The cannon must point upward, mirroring the client's input clamp.
    if (Math.sin(action.angle) >= -0.01) {
      return "Aim upward";
    }
    return null;
  }

  protected applyValidatedAction(
    action: BubbleShooterAction,
    seat: number,
    state: BubbleShooterServerState,
  ): EngineActionResult<BubbleShooterServerState> {
    return this.applyShot(state, seat, action.angle);
  }

  // ─── Shot resolution ───────────────────────────────────────────────────────

  private applyShot(
    state: BubbleShooterServerState,
    seat: number,
    angle: number,
  ): EngineActionResult<BubbleShooterServerState> {
    const next = structuredClone(state);
    const events: EngineEvent[] = [];
    const player = next.players.find((p) => p.seat === seat);
    if (!player) {
      return { ok: false, error: "Player not found", state, events, finished: false, winnerSeats: [] };
    }

    const fired = player.nextBubble;
    const grid = player.grid;
    const topOffset = player.topOffset;

    const { x, y } = this.simulateShot(grid, topOffset, angle);
    const { row, col } = this.snapCell(grid, topOffset, x, y);

    let matchColor = fired.color;
    if (fired.type === "rainbow") {
      let found = false;
      for (const n of this.getGridNeighbors(row, col)) {
        const neighbor = grid.find((b) => b.row === n.r && b.col === n.c);
        if (neighbor && neighbor.type === "normal") {
          matchColor = neighbor.color;
          found = true;
          break;
        }
      }
      if (!found) matchColor = COLORS[Math.floor(this.random() * COLORS.length)];
    }

    grid.push({ row, col, color: matchColor, type: fired.type });

    let matched: BubbleShooterBubbleView[] = [];
    if (fired.type === "bomb") {
      matched = this.getBombRadius(grid, row, col);
    } else {
      matched = this.checkMatches(grid, row, col, matchColor);
    }

    let result: BubbleShooterShotResult = "miss";
    let matchedCount = 0;
    let droppedCount = 0;
    let points = 0;

    if (matched.length >= 3 || fired.type === "bomb") {
      result = "pop";
      matchedCount = matched.length;
      const removed = new Set(matched);
      player.grid = grid.filter((b) => !removed.has(b));
      points = matched.length * 10 * (fired.type === "bomb" ? 2 : 1);
      const drop = this.dropFloating(player.grid, topOffset);
      droppedCount = drop.dropped;
      points += droppedCount * 30;
    }

    player.score += points;
    player.shotsFired += 1;
    if (player.shotsFired >= SHOTS_PER_DROP) {
      player.shotsFired = 0;
      player.topOffset = this.addNewRow(player.grid, player.topOffset);
    }
    player.nextBubble = this.rollNextBubble(player.grid);

    const lastShot: BubbleShooterLastShot = {
      angle,
      row,
      col,
      color: matchColor,
      type: fired.type,
      result,
      matchedCount,
      droppedCount,
      points,
    };
    player.lastShot = lastShot;

    events.push({
      type: "shoot",
      seat,
      angle,
      row,
      col,
      color: matchColor,
      bubbleType: fired.type,
      result,
      matchedCount,
      droppedCount,
      points,
    });

    // Win: board fully cleared. Overflow: player is eliminated.
    if (player.grid.length === 0) {
      player.status = "won";
      next.finished = true;
      next.winnerSeats = [seat];
      next.result = "win";
      next.currentSeat = seat;
      next.turnCount += 1;
      events.push({ type: "win", seat });
      return { ok: true, state: next, events, finished: true, winnerSeats: [seat] };
    }

    if (this.isOverflow(player.grid, player.topOffset)) {
      player.status = "eliminated";
      result = "eliminated";
      player.lastShot = { ...lastShot, result };
      events.push({ type: "eliminated", seat });
    }

    next.currentSeat = seat;
    next.turnCount += 1;

    const activeCount = next.players.filter((p) => p.status === "playing").length;
    if (activeCount === 0) {
      next.finished = true;
      next.result = "draw";
      next.winnerSeats = [];
      events.push({ type: "draw" });
      return { ok: true, state: next, events, finished: true, winnerSeats: [] };
    }

    return { ok: true, state: next, events, finished: false, winnerSeats: [] };
  }

  private isOverflow(grid: BubbleShooterBubbleView[], topOffset: number): boolean {
    return grid.some((b) => getGridY(b.row, topOffset) + RADIUS >= OVERFLOW_LINE);
  }

  /**
   * Fixed-timestep flight simulation mirroring the client's per-frame
   * integration, wall bounces and collision radius (DIAMETER - 2).
   */
  private simulateShot(
    grid: BubbleShooterBubbleView[],
    topOffset: number,
    angle: number,
  ): { x: number; y: number } {
    let x = SHOOTER_X;
    let y = SHOOTER_Y;
    let vx = Math.cos(angle) * SPEED;
    let vy = Math.sin(angle) * SPEED;

    for (let i = 0; i < MAX_TRAJECTORY_STEPS; i++) {
      x += vx * SHOT_DT;
      y += vy * SHOT_DT;

      if (x - RADIUS < 0) {
        x = RADIUS;
        vx *= -1;
      }
      if (x + RADIUS > CANVAS_WIDTH) {
        x = CANVAS_WIDTH - RADIUS;
        vx *= -1;
      }
      if (y - RADIUS < 0) {
        y = RADIUS;
        break;
      }

      let hit = false;
      for (const b of grid) {
        const dst = Math.hypot(x - getGridX(b.row, b.col), y - getGridY(b.row, topOffset));
        if (dst < DIAMETER - 2) {
          hit = true;
          break;
        }
      }
      if (hit) break;
    }

    return { x, y };
  }

  /** Nearest empty grid cell to the stopped bubble. */
  private snapCell(
    grid: BubbleShooterBubbleView[],
    topOffset: number,
    x: number,
    y: number,
  ): { row: number; col: number } {
    let bestRow = 0;
    let bestCol = 0;
    let minDst = Infinity;

    for (let r = -topOffset; r < -topOffset + MAX_ROWS_TO_SNAP; r++) {
      const cols = colsInRow(r);
      for (let c = 0; c < cols; c++) {
        const occupied = grid.some((b) => b.row === r && b.col === c);
        if (occupied) continue;
        const gx = getGridX(r, c);
        const gy = getGridY(r, topOffset);
        const dst = Math.hypot(gx - x, gy - y);
        if (dst < minDst) {
          minDst = dst;
          bestRow = r;
          bestCol = c;
        }
      }
    }

    return { row: bestRow, col: bestCol };
  }

  private getGridNeighbors(row: number, col: number): GridCell[] {
    const neighbors: number[][] = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ];
    if (row % 2 === 0) {
      neighbors.push([-1, -1], [1, -1]);
    } else {
      neighbors.push([-1, 1], [1, 1]);
    }
    return neighbors.map((n) => ({ r: row + n[0], c: col + n[1] }));
  }

  private checkMatches(
    grid: BubbleShooterBubbleView[],
    startRow: number,
    startCol: number,
    color: string,
  ): BubbleShooterBubbleView[] {
    const matched: BubbleShooterBubbleView[] = [];
    const toCheck: GridCell[] = [{ r: startRow, c: startCol }];
    const visited = new Set<string>();
    visited.add(`${startRow},${startCol}`);

    while (toCheck.length > 0) {
      const cell = toCheck.pop()!;
      const bubble = grid.find((b) => b.row === cell.r && b.col === cell.c);
      if (bubble && (bubble.color === color || bubble.type === "rainbow")) {
        matched.push(bubble);
        for (const n of this.getGridNeighbors(cell.r, cell.c)) {
          const key = `${n.r},${n.c}`;
          if (!visited.has(key)) {
            visited.add(key);
            toCheck.push(n);
          }
        }
      }
    }

    return matched;
  }

  /** Cells within two neighbor rings of the target (bomb blast radius). */
  private getBombRadius(grid: BubbleShooterBubbleView[], startRow: number, startCol: number): BubbleShooterBubbleView[] {
    const allN = new Set<string>([`${startRow},${startCol}`]);
    const ring1 = this.getGridNeighbors(startRow, startCol);
    for (const n of ring1) {
      allN.add(`${n.r},${n.c}`);
    }
    for (const n of ring1) {
      for (const nn of this.getGridNeighbors(n.r, n.c)) {
        allN.add(`${nn.r},${nn.c}`);
      }
    }
    return grid.filter((b) => allN.has(`${b.row},${b.col}`));
  }

  /** Removes bubbles not connected (via occupied neighbors) to the top row. */
  private dropFloating(grid: BubbleShooterBubbleView[], topOffset: number): { grid: BubbleShooterBubbleView[]; dropped: number } {
    const visited = new Set<string>();
    const toCheck: GridCell[] = grid.filter((b) => b.row === -topOffset).map((b) => ({ r: b.row, c: b.col }));
    for (const cell of toCheck) visited.add(`${cell.r},${cell.c}`);

    while (toCheck.length > 0) {
      const cell = toCheck.pop()!;
      for (const n of this.getGridNeighbors(cell.r, cell.c)) {
        const key = `${n.r},${n.c}`;
        if (!visited.has(key) && grid.some((b) => b.row === n.r && b.col === n.c)) {
          visited.add(key);
          toCheck.push(n);
        }
      }
    }

    const kept = grid.filter((b) => visited.has(`${b.row},${b.col}`));
    return { grid: kept, dropped: grid.length - kept.length };
  }

  private addNewRow(grid: BubbleShooterBubbleView[], topOffset: number): number {
    const newTop = topOffset + 1;
    const r = -newTop;
    const cols = colsInRow(r);
    for (let c = 0; c < cols; c++) {
      grid.push({
        row: r,
        col: c,
        color: COLORS[Math.floor(this.random() * COLORS.length)],
        type: "normal",
      });
    }
    return newTop;
  }

  private makeInitialGrid(): BubbleShooterBubbleView[] {
    const grid: BubbleShooterBubbleView[] = [];
    for (let r = 0; r < INITIAL_ROWS; r++) {
      const cols = colsInRow(r);
      for (let c = 0; c < cols; c++) {
        grid.push({
          row: r,
          col: c,
          color: COLORS[Math.floor(this.random() * COLORS.length)],
          type: "normal",
        });
      }
    }
    return grid;
  }

  private rollNextBubble(grid: BubbleShooterBubbleView[]): { color: string; type: BubbleShooterBubbleType } {
    const rand = this.random();
    if (rand < 0.03) return { color: "#000000", type: "bomb" };
    if (rand < 0.06) return { color: "#ffffff", type: "rainbow" };

    const activeColors = Array.from(new Set(grid.filter((b) => b.type === "normal").map((b) => b.color)));
    if (activeColors.length > 0) {
      return { color: activeColors[Math.floor(this.random() * activeColors.length)], type: "normal" };
    }
    return { color: COLORS[Math.floor(this.random() * COLORS.length)], type: "normal" };
  }
}
