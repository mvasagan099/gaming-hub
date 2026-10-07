import type { EngineActionResult, EngineEvent, EnginePlayer, RandomSource } from "../types";
import { MultiplayerGameEngine, type BaseState, type PlayerAction } from "../base/MultiplayerGameEngine";
import type { JsonObject } from "@gaming-hub/shared";
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
    const matchTimer = options?.matchTimer ?? { matchDurationMs: 180000, warningThresholdMs: 30000 };
    super(players, rng, {
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
    const players: SnakeWormPlayerEntity[] = this.players.map((p, idx) => ({
      playerId: p.userId,
      seat: p.seat,
      type: idx === 0 ? "SNAKE" : "WORM",
      name: idx === 0 ? "Snake (P1)" : `Player ${idx + 1}`,
      body: Array.from({ length: 15 }, (_, i) => ({ x: 300 - i * 11, y: idx === 0 ? 600 : 1400 })),
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
      respawnAtMs: null,
    }));

    {
      const botCount = this.players.length === 1 ? 4 : 6;
      const firstBotSeat = Math.max(...this.players.map(p => p.seat)) + 1;
      for (let i = 0; i < botCount; i++) {
        const aiX = 800 + (i % 2) * 600;
        const aiY = 400 + Math.floor(i / 2) * 600;
        players.push({
          playerId: `ai-${i}`,
          seat: firstBotSeat + i,
          type: i % 2 === 0 ? "SNAKE" : "WORM",
          name: `Worm Bot ${i + 1}`,
          body: Array.from({ length: 15 }, (_, segment) => ({ x: aiX - segment * 11, y: aiY })),
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
          respawnAtMs: null,
        });
      }
    }

    const food: SnakeWormFood[] = [];
    this.spawnInitialFood(food, players);

    return {
      gameId: "snake-vs-worms",
      serverTimestamp: 0,
      matchRemainingMs: this.matchTimerConfig?.matchDurationMs ?? 180000,
      gridWidth: this.gridWidth,
      gridHeight: this.gridHeight,
      players,
      food,
      gameStatus: "playing",
      stateVersion: 1,
    };
  }

  startMatchClock(): void { this.state.matchStartedAtMs = this.now(); }

  private remainingTime(state: InternalState): number {
    const now = this.now();
    const elapsed = Math.max(0, (state.pausedAtMs ?? now) - (state.matchStartedAtMs ?? now));
    return Math.max(0, (state.matchTimerConfig?.matchDurationMs ?? 180000) - elapsed);
  }

  override serialize(): JsonObject {
    const state = this.cloneState(this.state);
    const now = this.now();
    state.serverTimestamp = now;
    if (!state.finished) state.matchRemainingMs = this.remainingTime(state);
    return state;
  }

  protected override validateAction(action: SnakeVsWormsAction, seat: number): string | null {
    if (action.type === "resign") return this.validateBaseAction(action, seat, this.state);
    return super.validateAction(action, seat);
  }

  protected override applyBaseAction(action: PlayerAction, seat: number, state: InternalState): EngineActionResult<InternalState> | null {
    const result = super.applyBaseAction(action, seat, state);
    if (!result?.ok) return result;
    result.state.stateVersion++;
    if (action.type === "resume" && state.pausedAtMs != null && state.matchStartedAtMs != null) {
      result.state.matchStartedAtMs = state.matchStartedAtMs + Math.max(0, this.now() - state.pausedAtMs);
    }
    if (action.type === "pause" || result.finished) result.state.players.forEach(p => { p.isBoosting = false; });
    if (result.finished) {
      result.state.gameStatus = "finished";
      result.state.matchRemainingMs = this.remainingTime(state);
    }
    return result;
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
    return null;
  }

  protected validateGameAction(action: SnakeVsWormsAction, seat: number, state: InternalState): string | null {
    if (state.finished) return "Match is finished";
    if (state.paused && action.type !== "resume" && action.type !== "ready") return "Match is paused";

    const player = state.players.find(p => p.seat === seat);
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
        return player.boostEnergy > 0 ? null : "Boost energy is empty";
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
    const player = next.players.find(p => p.seat === seat)!;

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

    if (this.state.matchStartedAtMs == null) this.startMatchClock();
    if (this.currentMatchDeadline != null && this.now() >= this.currentMatchDeadline) return this.handleTimeout("match");

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
      if (player.playerId.startsWith("ai-") && player.status === "eliminated") {
        player.respawnAtMs ??= this.now() + 2500;
        if (this.now() >= player.respawnAtMs) {
          for (let attempt = 0; attempt < 40; attempt++) {
            const x = this.randomInt(200, this.gridWidth - 200);
            const y = this.randomInt(200, this.gridHeight - 200);
            if (next.players.some(p => p.status === "active" && p.body.some(seg => Math.hypot(seg.x - x, seg.y - y) < 350))) continue;
            player.body = Array.from({ length: 15 }, (_, i) => ({ x: x - i * 11, y }));
            player.status = "active"; player.direction = player.targetDirection = "right";
            player.isBoosting = false; player.boostEnergy = 100; player.pendingGrowth = 0;
            player.respawnAtMs = null;
            break;
          }
        }
      }
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

      if (player.playerId.startsWith("ai-")) {
        const dirs: SnakeWormDirection[] = ["up", "down", "left", "right"];
        const head = player.body[0];
        const vectors = { up: [0, -80], down: [0, 80], left: [-80, 0], right: [80, 0] };
        const validDirs = dirs.filter(d => {
          if (OPPOSITE_DIRECTIONS[player.direction] === d) return false;
          const x = head.x + vectors[d][0], y = head.y + vectors[d][1];
          return x > 18 && x < this.gridWidth - 18 && y > 18 && y < this.gridHeight - 18
            && !next.players.some(other => other.seat !== player.seat && other.status === 'active'
              && other.body.some(seg => Math.hypot(seg.x - x, seg.y - y) < 35));
        });
        if (validDirs.length && (!validDirs.includes(player.direction) || this.randomInt(0, 100) < 3)) {
          player.targetDirection = validDirs[this.randomInt(0, validDirs.length - 1)];
        }
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

      if (player.pendingGrowth > 0) {
        player.pendingGrowth--;
        player.body.push({ ...player.body[player.body.length - 1] });
      }
      player.body[0] = { x: nextX, y: nextY };
      for (let i = 1; i < player.body.length; i++) {
        const prev = player.body[i - 1], segment = player.body[i];
        const angle = Math.atan2(prev.y - segment.y, prev.x - segment.x);
        player.body[i] = { x: prev.x - Math.cos(angle) * 11, y: prev.y - Math.sin(angle) * 11 };
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
    const headEliminations = new Set<SnakeWormPlayerEntity>();
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
            headEliminations.add(other);
            p.score += 100;
            p.kills++;
          } else if (other.body.length > p.body.length) {
            headEliminations.add(p);
            other.score += 100;
            other.kills++;
          } else {
            headEliminations.add(p);
            headEliminations.add(other);
          }
        }
      }
    }
    for (const player of headEliminations) player.status = "eliminated";

    // Head-to-Opponent-Body collision
    const bodyHits: Array<{ victim: SnakeWormPlayerEntity; killer: SnakeWormPlayerEntity }> = [];
    for (const p of activePlayers) {
      if (p.status !== "active") continue;
      const pHead = p.body[0];

      for (const other of activePlayers) {
        if (other.seat === p.seat || other.status !== "active") continue;
        const hitsOtherBody = other.body.slice(1).some((seg) => Math.hypot(seg.x - pHead.x, seg.y - pHead.y) < 18);
        if (hitsOtherBody) {
          bodyHits.push({ victim: p, killer: other });
          break;
        }
      }
    }
    for (const { victim, killer } of bodyHits) {
      victim.status = "eliminated";
      killer.score += 100; killer.kills++;
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
      next.finished = true; next.gameOver = true; next.gameStatus = "finished";
      next.winnerSeats = []; next.endReason = "BOTH_ELIMINATED";
    } else if (humanActive.length === 1 && this.players.length > 1) {
      next.finished = true;
      next.gameOver = true;
      next.gameStatus = "finished";
      next.winnerSeats = [humanActive[0].seat];
      next.endReason = "PLAYER_ELIMINATED";
    } else if (finalActive.length === 1 && next.players.length > 1) {
      next.finished = true;
      next.gameOver = true;
      next.gameStatus = "finished";
      next.winnerSeats = [finalActive[0].seat];
      next.endReason = "PLAYER_ELIMINATED";
    }

    if (next.finished) next.matchRemainingMs = this.remainingTime(state);
    return next;
  }

  protected onTurnTimerExpired(_seat: number, state: InternalState): EngineActionResult<InternalState> {
    // Real-time continuous slither game — turn timer timeouts do not eliminate players or finish the match
    return { ok: true, state, events: [], finished: false, winnerSeats: [] };
  }

  /**
   * Deterministic timeout winner resolution for Snake vs Worms:
   * 1. Player with highest mass / score.
   * 2. If tied, player with longest body length.
   * 3. If tied, draw across leaders.
   */
  protected override resolveTimeoutWinner(state: InternalState): number[] {
    if (!state.players || state.players.length === 0) return [state.currentSeat];
    const humans = state.players.filter(p => !p.playerId.startsWith('ai-'));
    const p0 = humans[0];
    const p1 = humans[1];
    if (!p1) return p0 ? [p0.seat] : [0];

    if (p0.score > p1.score) return [p0.seat];
    if (p1.score > p0.score) return [p1.seat];
    if (p0.body.length > p1.body.length) return [p0.seat];
    if (p1.body.length > p0.body.length) return [p1.seat];
    return [];
  }

  protected override onMatchTimerExpired(state: InternalState): EngineActionResult<InternalState> {
    const winnerSeats = this.resolveTimeoutWinner(state);
    const next = this.cloneState(state);
    next.finished = true;
    next.gameOver = true;
    next.gameStatus = "finished";
    next.endReason = "TIME_EXPIRED";
    next.matchRemainingMs = 0;
    next.winnerSeats = winnerSeats;
    next.stateVersion++;

    return { ok: true, state: next, events: [{ type: "match-timeout", winnerSeats }], finished: true, winnerSeats };
  }

  getStateSnapshot(): InternalState {
    return this.cloneState(this.state as InternalState);
  }
}

export type SnakeVsWormsEngineInstance = InstanceType<typeof SnakeVsWormsEngine>;
