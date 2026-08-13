import type { EngineActionResult, EngineEvent, EnginePlayer, RandomSource } from "../types";
import { MultiplayerGameEngine, type BaseState } from "../base/MultiplayerGameEngine";
import type {
  SnakeVsWormsState,
  SnakeVsWormsAction,
  SnakeWormPlayerEntity,
  SnakeWormFood,
  SnakeWormDirection,
  Position,
  FoodType,
  SnakeVsWormsEngineOptions,
} from "./types";

type InternalState = SnakeVsWormsState & BaseState;

const OPPOSITE_DIRECTIONS: Record<SnakeWormDirection, SnakeWormDirection> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

export class SnakeVsWormsEngine extends MultiplayerGameEngine<InternalState, SnakeVsWormsAction> {
  readonly gameId = "snake-vs-worms" as const;
  private gridWidth = 2000;
  private gridHeight = 2000;

  constructor(players: EnginePlayer[], rng?: RandomSource, options?: SnakeVsWormsEngineOptions) {
    const turnTimer = options?.turnTimer ?? { turnDurationMs: 30000, warningThresholdMs: 5000 };
    const matchTimer = options?.matchTimer ?? { matchDurationMs: 180000, warningThresholdMs: 30000 };
    super(players, rng, {
      turnTimer,
      matchTimer,
      enableResign: options?.enableResign ?? true,
      enableDraw: false,
      enablePause: options?.enablePause ?? true,
      enableRematch: true,
      now: options?.now,
    });

    if (options?.gridWidth) this.gridWidth = options.gridWidth;
    if (options?.gridHeight) this.gridHeight = options.gridHeight;
  }

  protected getInitialSeat(): number {
    return 0;
  }

  protected initBaseState(): Omit<InternalState, keyof BaseState> {
    const p0Body: Position[] = [
      { x: 300, y: 600 },
      { x: 280, y: 600 },
      { x: 260, y: 600 },
      { x: 240, y: 600 },
    ];

    const p1Body: Position[] = [
      { x: 300, y: 1400 },
      { x: 280, y: 1400 },
      { x: 260, y: 1400 },
      { x: 240, y: 1400 },
    ];

    const players: SnakeWormPlayerEntity[] = this.players.map((p, idx) => ({
      playerId: p.userId,
      seat: idx,
      type: idx === 0 ? "SNAKE" : "WORM",
      name: idx === 0 ? "Snake (P1)" : `Player ${idx + 1}`,
      body: idx === 0 ? p0Body : p1Body,
      direction: "right",
      targetDirection: "right",
      speed: 5.0,
      score: 0,
      foodCollected: 0,
      kills: 0,
      boostEnergy: 100,
      isBoosting: false,
      status: "active",
      pendingGrowth: 0,
      connected: true,
    }));

    if (this.players.length === 1) {
      for (let i = 1; i <= 4; i++) {
        const aiX = 500 + (i % 2) * 800;
        const aiY = 400 + Math.floor(i / 2) * 600;
        players.push({
          playerId: `ai-${i}`,
          seat: i,
          type: "WORM",
          name: `Worm Bot ${i}`,
          body: [
            { x: aiX, y: aiY },
            { x: aiX - 20, y: aiY },
            { x: aiX - 40, y: aiY },
            { x: aiX - 60, y: aiY },
          ],
          direction: "left",
          targetDirection: "left",
          speed: 5.0,
          score: 0,
          foodCollected: 0,
          kills: 0,
          boostEnergy: 100,
          isBoosting: false,
          status: "active",
          pendingGrowth: 0,
          connected: true,
        });
      }
    }

    const food: SnakeWormFood[] = [];
    this.spawnInitialFood(food, players);

    return {
      gridWidth: this.gridWidth,
      gridHeight: this.gridHeight,
      players,
      food,
      gameStatus: "playing",
      stateVersion: 1,
    };
  }

  private spawnInitialFood(foodList: SnakeWormFood[], players: SnakeWormPlayerEntity[]) {
    const foodTypes: FoodType[] = ["normal", "normal", "normal", "golden", "boost"];
    for (let i = 0; i < 150; i++) {
      const pos = this.findUnoccupiedPosition(players, foodList);
      if (pos) {
        const type = foodTypes[i % foodTypes.length];
        foodList.push({
          id: `food-${i + 1}-${this.randomInt(100, 999)}`,
          x: pos.x,
          y: pos.y,
          type,
          score: type === "golden" ? 50 : type === "boost" ? 20 : 10,
          growth: type === "golden" ? 3 : 1,
        });
      }
    }
  }

  private findUnoccupiedPosition(players: SnakeWormPlayerEntity[], foodList: SnakeWormFood[]): Position | null {
    for (let attempts = 0; attempts < 100; attempts++) {
      const x = this.randomInt(100, this.gridWidth - 100);
      const y = this.randomInt(100, this.gridHeight - 100);

      const hitBody = players.some((p) => p.body.some((seg) => Math.hypot(seg.x - x, seg.y - y) < 30));
      const hitFood = foodList.some((f) => Math.hypot(f.x - x, f.y - y) < 30);

      if (!hitBody && !hitFood) {
        return { x, y };
      }
    }
    return { x: 1000, y: 1000 };
  }

  protected validateGameAction(action: SnakeVsWormsAction, seat: number, state: InternalState): string | null {
    if (state.finished) return "Match is finished";
    if (state.paused && action.type !== "resume" && action.type !== "ready") return "Match is paused";

    const player = state.players[seat];
    if (!player) return "Invalid player seat";
    if (player.status === "eliminated") return "Player is eliminated";

    switch (action.type) {
      case "direction": {
        const nextDir = action.direction;
        if (!["up", "down", "left", "right"].includes(nextDir)) return "Invalid direction";
        if (OPPOSITE_DIRECTIONS[player.direction] === nextDir) {
          return "180 degree reversal not allowed";
        }
        return null;
      }
      case "boost-start":
      case "boost-stop":
      case "ready":
        return null;
      default:
        return null;
    }
  }

  protected applyGameAction(action: SnakeVsWormsAction, seat: number, state: InternalState): EngineActionResult<InternalState> {
    const next = this.cloneState(state);
    const events: EngineEvent[] = [];
    const player = next.players[seat];

    switch (action.type) {
      case "direction": {
        if (OPPOSITE_DIRECTIONS[player.direction] !== action.direction) {
          player.targetDirection = action.direction;
        }
        next.stateVersion++;
        return { ok: true, state: next, events: [], finished: next.finished, winnerSeats: next.winnerSeats };
      }
      case "boost-start": {
        player.isBoosting = true;
        next.stateVersion++;
        return { ok: true, state: next, events: [], finished: next.finished, winnerSeats: next.winnerSeats };
      }
      case "boost-stop": {
        player.isBoosting = false;
        next.stateVersion++;
        return { ok: true, state: next, events: [], finished: next.finished, winnerSeats: next.winnerSeats };
      }
      case "ready": {
        player.connected = true;
        next.stateVersion++;
        return { ok: true, state: next, events: [], finished: next.finished, winnerSeats: next.winnerSeats };
      }
      default:
        return { ok: false, error: "Unknown action", state, events: [], finished: state.finished, winnerSeats: state.winnerSeats };
    }
  }

  tick(): EngineActionResult<InternalState> {
    if (this.state.finished || this.state.paused || this.state.gameStatus !== "playing") {
      return {
        ok: true,
        state: this.state,
        events: [],
        finished: this.state.finished,
        winnerSeats: this.state.winnerSeats,
      };
    }

    const nextState = this.simulatePhysics(this.state);
    this.updateState(nextState);

    const events: EngineEvent[] = [];
    if (nextState.finished) {
      events.push({
        type: "match-complete",
        winnerSeats: nextState.winnerSeats,
      });
    }

    return {
      ok: true,
      state: nextState,
      events,
      finished: nextState.finished,
      winnerSeats: nextState.winnerSeats,
    };
  }

  simulatePhysics(state: InternalState): InternalState {
    if (state.paused || state.finished) return state;

    const next = this.cloneState(state);
    next.stateVersion++;

    // 1. Boost Energy Update & Movement Execution
    for (const player of next.players) {
      if (player.status !== "active") continue;

      let stepSize = 5;
      if (player.isBoosting && player.boostEnergy > 0) {
        player.boostEnergy = Math.max(0, player.boostEnergy - 2);
        player.speed = 10.0;
        stepSize = 10;
        if (player.boostEnergy === 0) {
          player.isBoosting = false;
        }
      } else {
        player.boostEnergy = Math.min(100, player.boostEnergy + 1);
        player.speed = 5.0;
      }

      if (player.playerId.startsWith("ai-") && this.randomInt(0, 100) < 5) {
        const dirs: SnakeWormDirection[] = ["up", "down", "left", "right"];
        const validDirs = dirs.filter((d) => OPPOSITE_DIRECTIONS[player.direction] !== d);
        player.targetDirection = validDirs[this.randomInt(0, validDirs.length - 1)];
      }

      // Update direction if targetDirection is valid
      if (OPPOSITE_DIRECTIONS[player.direction] !== player.targetDirection) {
        player.direction = player.targetDirection;
      }

      const head = player.body[0];
      let nextX = head.x;
      let nextY = head.y;

      switch (player.direction) {
        case "up":
          nextY -= stepSize;
          break;
        case "down":
          nextY += stepSize;
          break;
        case "left":
          nextX -= stepSize;
          break;
        case "right":
          nextX += stepSize;
          break;
      }

      player.body = [{ x: nextX, y: nextY }, ...player.body];

      if (player.pendingGrowth > 0) {
        player.pendingGrowth--;
      } else {
        player.body.pop();
      }
    }

    // 2. Wall & Self Collision Check
    for (const player of next.players) {
      if (player.status !== "active") continue;

      const head = player.body[0];

      // Wall collision
      if (head.x < 0 || head.x > this.gridWidth || head.y < 0 || head.y > this.gridHeight) {
        player.status = "eliminated";
        continue;
      }

      // Self collision disabled per rule specification ("selfCollision": { "enabled": false })
      // Self-collision must never eliminate a player.
    }

    // 3. Head-to-Head & Head-to-Body Collision Check for all active players
    const activePlayers = next.players.filter((p) => p.status === "active");
    for (let i = 0; i < activePlayers.length; i++) {
      const p = activePlayers[i];
      if (p.status !== "active") continue;
      const pHead = p.body[0];

      for (let j = i + 1; j < activePlayers.length; j++) {
        const other = activePlayers[j];
        if (other.status !== "active") continue;
        const oHead = other.body[0];

        // Head-to-Head collision
        if (Math.hypot(pHead.x - oHead.x, pHead.y - oHead.y) < 18) {
          if (p.body.length > other.body.length) {
            other.status = "eliminated";
            p.score += 100;
            p.kills++;
          } else if (other.body.length > p.body.length) {
            p.status = "eliminated";
            other.score += 100;
            other.kills++;
          } else {
            p.status = "eliminated";
            other.status = "eliminated";
          }
        }
      }
    }

    // Head-to-Opponent-Body collision
    for (const p of activePlayers) {
      if (p.status !== "active") continue;
      const pHead = p.body[0];

      for (const other of activePlayers) {
        if (other.seat === p.seat || other.status !== "active") continue;
        const hitsOtherBody = other.body.slice(1).some((seg) => Math.hypot(seg.x - pHead.x, seg.y - pHead.y) < 18);
        if (hitsOtherBody) {
          p.status = "eliminated";
          other.score += 100;
          other.kills++;
          break;
        }
      }
    }

    // 4. Food Collection
    for (const player of next.players) {
      if (player.status !== "active") continue;
      const head = player.body[0];

      const foodIndex = next.food.findIndex((f) => Math.hypot(f.x - head.x, f.y - head.y) < 30);
      if (foodIndex !== -1) {
        const item = next.food[foodIndex];
        player.score += item.score;
        player.foodCollected++;
        player.pendingGrowth += item.growth;

        if (item.type === "boost") {
          player.boostEnergy = Math.min(100, player.boostEnergy + 30);
        }

        // Remove collected food and spawn replacement
        next.food.splice(foodIndex, 1);
        const newPos = this.findUnoccupiedPosition(next.players, next.food);
        if (newPos) {
          const types: FoodType[] = ["normal", "normal", "golden", "boost"];
          const newType = types[this.randomInt(0, types.length - 1)];
          next.food.push({
            id: `food-${Date.now()}-${this.randomInt(10, 99)}`,
            x: newPos.x,
            y: newPos.y,
            type: newType,
            score: newType === "golden" ? 50 : newType === "boost" ? 20 : 10,
            growth: newType === "golden" ? 3 : 1,
          });
        }
      }
    }

    // 5. Game Over Verification
    const finalActive = next.players.filter((p) => p.status === "active");
    const humanActive = finalActive.filter((p) => !p.playerId.startsWith("ai-"));

    if (humanActive.length === 0) {
      next.finished = true;
      next.gameOver = true;
      next.gameStatus = "finished";
      next.winnerSeats = finalActive.length > 0 ? [finalActive[0].seat] : [];
      next.endReason = "PLAYER_ELIMINATED";
    } else if (finalActive.length === 1 && next.players.length > 1) {
      next.finished = true;
      next.gameOver = true;
      next.gameStatus = "finished";
      next.winnerSeats = [finalActive[0].seat];
      next.endReason = "PLAYER_ELIMINATED";
    } else if (finalActive.length === 0) {
      next.finished = true;
      next.gameOver = true;
      next.gameStatus = "finished";
      next.winnerSeats = [];
      next.endReason = "BOTH_ELIMINATED";
    }

    return next;
  }

  protected onTurnTimerExpired(seat: number, state: InternalState): EngineActionResult<InternalState> {
    const winnerSeat = seat === 0 ? 1 : 0;
    const next = this.cloneState(state);
    next.finished = true;
    next.gameOver = true;
    next.gameStatus = "finished";
    next.winnerSeats = [winnerSeat];
    next.endReason = "TIMEOUT";
    return { ok: true, state: next, events: [{ type: "match-timeout" }], finished: true, winnerSeats: [winnerSeat] };
  }

  protected onMatchTimerExpired(state: InternalState): EngineActionResult<InternalState> {
    const p0 = state.players[0];
    const p1 = state.players[1];

    let winnerSeats: number[] = [];
    if (p0.score > p1.score) {
      winnerSeats = [0];
    } else if (p1.score > p0.score) {
      winnerSeats = [1];
    } else {
      // Secondary tiebreaker: body length
      if (p0.body.length > p1.body.length) {
        winnerSeats = [0];
      } else if (p1.body.length > p0.body.length) {
        winnerSeats = [1];
      } else {
        winnerSeats = []; // Draw
      }
    }

    const next = this.cloneState(state);
    next.finished = true;
    next.gameOver = true;
    next.gameStatus = "finished";
    next.endReason = "TIME_EXPIRED";
    next.winnerSeats = winnerSeats;

    return { ok: true, state: next, events: [{ type: "match-complete", reason: "TIME_EXPIRED", winnerSeats }], finished: true, winnerSeats };
  }

  getStateSnapshot(): InternalState {
    return this.cloneState(this.state as InternalState);
  }
}

export type SnakeVsWormsEngineInstance = InstanceType<typeof SnakeVsWormsEngine>;
