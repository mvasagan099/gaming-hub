import { MultiplayerGameEngine } from "../base/MultiplayerGameEngine";
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

const COLORS = ["#fb7185", "#818cf8", "#34d399", "#fbbf24", "#c084fc"];
const RADIUS = 11;
const DIAMETER = RADIUS * 2;
const COLS = 13;
const ROW_HEIGHT = RADIUS * Math.sqrt(3);
const CANVAS_WIDTH = COLS * DIAMETER;
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

export interface BubbleShooterEngineOptions {
  turnTimer?: { turnDurationMs: number; warningThresholdMs: number };
  matchTimer?: { matchDurationMs: number; warningThresholdMs: number };
  enableResign?: boolean;
  enableDraw?: boolean;
  enablePause?: boolean;
  enableRematch?: boolean;
  now?: () => number;
}

export class BubbleShooterEngine extends MultiplayerGameEngine<
  BubbleShooterServerState,
  BubbleShooterAction | { type: "resign" } | { type: "draw-offer" } | { type: "draw-accept" } | { type: "draw-decline" } | { type: "pause" } | { type: "resume" }
> {
  readonly gameId = "bubble-shooter" as const;

  constructor(players: EnginePlayer[], rng?: RandomSource, options?: BubbleShooterEngineOptions) {
    const turnTimer = options?.turnTimer ?? { turnDurationMs: 10000, warningThresholdMs: 3000 };
    const matchTimer = options?.matchTimer ?? { matchDurationMs: 300000, warningThresholdMs: 30000 };
    super(players, rng, {
      turnTimer,
      matchTimer,
      enableResign: options?.enableResign ?? true,
      enableDraw: options?.enableDraw ?? true,
      enablePause: options?.enablePause ?? true,
      enableRematch: options?.enableRematch ?? true,
      now: options?.now,
    });
    if (players.length < 2) {
      throw new Error("Bubble Shooter requires at least 2 players");
    }
  }

  protected initBaseState(): Omit<BubbleShooterServerState, keyof import("../base/MultiplayerGameEngine").BaseState> {
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
        combo: 0,
        status: "playing",
        lastShot: null,
      };
    });
    return {
      players,
      currentSeat: 0,
      winnerSeats: [],
      turnCount: 0,
      result: "none",
    };
  }

  protected validateGameAction(
    action: BubbleShooterAction | { type: "resign" } | { type: "draw-offer" } | { type: "draw-accept" } | { type: "draw-decline" } | { type: "pause" } | { type: "resume" },
    seat: number,
    state: BubbleShooterServerState,
  ): string | null {
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
    if (Math.sin(action.angle) >= -0.01) {
      return "Aim upward";
    }
    return null;
  }

  protected applyGameAction(
    action: BubbleShooterAction | { type: "resign" } | { type: "draw-offer" } | { type: "draw-accept" } | { type: "draw-decline" } | { type: "pause" } | { type: "resume" },
    seat: number,
    state: BubbleShooterServerState,
  ): EngineActionResult<BubbleShooterServerState> {
    if (action.type === "shoot") {
      return this.applyShot(state, seat, action.angle);
    }
    return {
      ok: false,
      error: "Unknown action for Bubble Shooter",
      state,
      events: [],
      finished: state.finished,
      winnerSeats: state.winnerSeats,
    };
  }

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
      
      const drop = this.dropFloating(player.grid, topOffset);
      droppedCount = drop.dropped;

      // Spec scoring: 30 base for 3 bubbles + 10 for each extra bubble
      const basePoints = 30 + (matched.length > 3 ? (matched.length - 3) * 10 : 0);
      const nextCombo = (player.combo || 0) + 1;
      player.combo = nextCombo;
      const comboBonus = nextCombo > 1 ? nextCombo * 15 : 0;
      const floatingBonus = droppedCount * 30;
      points = (basePoints + comboBonus + floatingBonus) * (fired.type === "bomb" ? 2 : 1);
    } else {
      // Missed shot resets combo
      player.combo = 0;
    }

    player.score = (player.score || 0) + points;
    player.shotsFired += 1;
    if (player.shotsFired >= SHOTS_PER_DROP) {
      player.shotsFired = 0;
      player.topOffset = this.addNewRow(player.grid, player.topOffset);
    }

    // Combo Attack / Garbage System: 2+ combo, 5+ matched bubbles, 2+ dropped, or Bomb sends a penalty row to opponents
    const currentCombo = player.combo || 0;
    const isGarbageAttack = currentCombo >= 2 || matchedCount >= 5 || droppedCount >= 2 || fired.type === "bomb";
    if (isGarbageAttack) {
      for (const opp of next.players) {
        if (opp.seat !== seat && opp.status === "playing") {
          opp.topOffset = this.addNewRow(opp.grid, opp.topOffset);
          if (this.isOverflow(opp.grid, opp.topOffset)) {
            opp.status = "eliminated";
            events.push({ type: "eliminated", seat: opp.seat });
          }
          events.push({ type: "garbage-attack", seat, targetSeat: opp.seat });
        }
      }
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

    const remaining = next.players.filter((p) => p.status === "playing");
    if (remaining.length === 1 && next.players.length >= 2) {
      const survivor = remaining[0]!;
      survivor.status = "won";
      next.finished = true;
      next.winnerSeats = [survivor.seat];
      next.result = "win";
      events.push({ type: "win", seat: survivor.seat });
      return { ok: true, state: next, events, finished: true, winnerSeats: [survivor.seat] };
    }

    if (remaining.length === 0) {
      next.finished = true;
      next.result = "draw";
      next.winnerSeats = [];
      events.push({ type: "draw" });
      return { ok: true, state: next, events, finished: true, winnerSeats: [] };
    }

    return { ok: true, state: next, events, finished: false, winnerSeats: [] };
  }

  protected override onMatchTimerExpired(state: BubbleShooterServerState): EngineActionResult<BubbleShooterServerState> {
    const next = structuredClone(state);
    next.finished = true;
    next.gameOver = true;
    next.endReason = "match-timeout";

    const sorted = [...next.players].sort((a, b) => b.score - a.score);
    if (sorted.length > 0 && sorted[0].score > (sorted[1]?.score ?? -1)) {
      const winnerSeat = sorted[0].seat;
      sorted[0].status = "won";
      next.winnerSeats = [winnerSeat];
      next.result = "win";
      return {
        ok: true,
        state: next,
        events: [{ type: "match-timeout" }, { type: "win", seat: winnerSeat }],
        finished: true,
        winnerSeats: [winnerSeat],
      };
    }

    next.winnerSeats = [];
    next.result = "draw";
    return {
      ok: true,
      state: next,
      events: [{ type: "match-timeout" }, { type: "draw" }],
      finished: true,
      winnerSeats: [],
    };
  }

  private isOverflow(grid: BubbleShooterBubbleView[], topOffset: number): boolean {
    return grid.some((b) => getGridY(b.row, topOffset) + RADIUS >= OVERFLOW_LINE);
  }

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
        x = RADIUS;
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

  /**
   * Deterministic timeout winner resolution for Bubble Shooter:
   * 1. Player with highest authoritative score.
   * 2. If tied, player with fewest bubbles remaining on grid.
   * 3. If tied, draw across leaders.
   */
  protected override resolveTimeoutWinner(state: BubbleShooterServerState): number[] {
    if (!state.players || state.players.length === 0) return [state.currentSeat];

    type PlayerScore = { seat: number; score: number; bubbleCount: number };
    const ranks: PlayerScore[] = state.players.map((p) => ({
      seat: p.seat,
      score: p.score,
      bubbleCount: p.grid.length,
    }));

    ranks.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.bubbleCount - b.bubbleCount;
    });

    const best = ranks[0];
    if (!best) return [0];
    const topTied = ranks.filter((r) => r.score === best.score && r.bubbleCount === best.bubbleCount);
    return topTied.map((r) => r.seat);
  }
}
